// The islands a barter count has not opened yet.
//
// The game expands the trade routes at fixed totals -- 150 barters opens
// Shipwrecked Haran's Cargo Ship, 3,000 the Wandering Merchant's Ship --
// and until this, every plan in the app was laid out as though all
// ninety-one barterers were open to everyone. What can go wrong: the
// wrong barterer joined to a threshold, an island gated that no patch
// note gates, a chain offered that climbs through a shut island, a
// forecast folded through one, and -- the other way round -- a sailor
// past every threshold paying anything at all for this.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { npcGates, npcGate, npcOpen, openTable, gateOfItem, shutOut, forecast, gateFor, ROUTE_UNLOCKS } from '../js/barter.js';
import { npcById, npcs } from '../js/barter_npcs.js';
import { chains } from '../js/barter-chains.js';
import { boardData } from '../js/barter-board.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8')).combos;

test('every threshold that names a place finds the barterer standing there', () => {
	const gates = npcGates();
	const named = ROUTE_UNLOCKS.filter(r => r.opens && /—/.test(r.opens));
	// Every row naming a place is joined to exactly one barterer.
	for (const row of named) {
		const found = [...gates].filter(([, barters]) => barters === row.barters);
		assert.equal(found.length, 1, `${row.opens} joins one barterer`);
		const npc = npcById.get(found[0][0]);
		assert.ok(row.opens.includes(npc.at), `${row.opens} is where ${npc.name} stands`);
	}
	assert.equal(gates.size, named.length);
	// The Brilliant pair names no place and gates nobody.
	assert.ok(ROUTE_UNLOCKS.some(r => r.opens && !/—/.test(r.opens)));
});

test('the great majority of barterers are open from the first day', () => {
	const shut = npcs.filter(n => npcGate(n.id) > 0);
	assert.equal(shut.length, 12);
	assert.equal(npcs.length - shut.length, 79);
	// The coastal barterers that deal the top two levels are not gated:
	// no patch note states a count for them, so none is invented.
	assert.equal(npcGate(npcs.find(n => n.at === 'Crow Merchants’ Vessel' || n.at === "Crow Merchants' Vessel").id), 2500);
});

test('a table is narrowed to what the sailor can sail, and left alone when nothing is shut', () => {
	const at480 = openTable(barterData, 480);
	assert.notEqual(at480, barterData, 'something is shut at 480');
	const shutIds = new Set(npcs.filter(n => npcGate(n.id) > 480).map(n => n.id));
	for (const entry of at480) {
		for (const s of entry.sources) assert.ok(!shutIds.has(s.npc_id), `${entry.name} is not dealt at a shut island`);
	}
	// Past every threshold the table names, the table itself comes back.
	assert.equal(openTable(barterData, 20_000), barterData);
	// And the memo answers the same object twice.
	assert.equal(openTable(barterData, 480), at480);
});

test('a material dealt only at a shut island says which island, and at what count', () => {
	// Tear of the Ocean is dealt at the Wandering Merchant's Ship alone.
	const gate = gateOfItem('Tear of the Ocean', barterData, 480);
	assert.equal(gate.barters, 3000);
	assert.equal(gate.short, 2520);
	assert.match(gate.opens, /Wandering Merchant/);
	assert.equal(gateOfItem('Tear of the Ocean', barterData, 3000), null);
	// Something six open islands deal is not gated by the two that are.
	assert.equal(gateOfItem("Oquilla's Flower", barterData, 480), null);
});

test('the forecast answers the door rather than quoting a route behind it', () => {
	const shut = forecast('Tear of the Ocean', 10, barterData, { barterCount: 480 });
	assert.ok(shut.gate, 'locked at 480');
	assert.equal(shut.trades, 0);
	const open = forecast('Tear of the Ocean', 10, barterData, { barterCount: 3000 });
	assert.equal(open.gate, null);
	assert.ok(open.trades > 0);
});

test('a rung dealt in two places is priced at the one the sailor can reach', () => {
	// Great Ocean Dark Iron is dealt at Rickun (5,000) and at 27 open
	// islands: at 480 the fold must use an open one and quote no gate.
	const f = forecast('Great Ocean Dark Iron', 4, barterData, { barterCount: 480 });
	assert.equal(f.gate, null);
	assert.ok(f.trades > 0);
});

test('the named gates still stand beside the island ones, and the harder wins', () => {
	// The Brilliants are gated by name at 1,500 and dealt at open islands.
	const brilliant = gateFor('Brilliant Pearl Shard', 480, barterData);
	assert.equal(brilliant.barters, 1500);
	assert.equal(gateFor('Brilliant Pearl Shard', 1500, barterData), null);
	// Crow Coin's first route opens at 10 and is dealt everywhere after.
	assert.equal(gateFor('Crow Coin', 0, barterData).barters, 10);
	assert.equal(gateFor('Crow Coin', 10, barterData), null);
});

test('a chain that climbs through a shut island is marked, and the rest are not', () => {
	const board = combos.find(c => c.offers.some(([id]) => npcGate(id) > 480));
	assert.ok(board, 'some layout deals at a gated island');
	const data = boardData(board, barterData, npcById);
	const all = chains(data, {}, {}, 480);
	const gated = all.filter(c => c.gate);
	for (const c of gated) {
		assert.ok(c.gate.barters > 480);
		assert.ok(c.rungs.some(r => r.npcId === c.gate.npcId));
		// The gate is the dearest rung, since that is the count that
		// would open the whole climb.
		assert.equal(c.gate.barters, Math.max(...c.rungs.map(r => npcGate(r.npcId))));
	}
	for (const c of all.filter(c => !c.gate)) {
		for (const r of c.rungs) assert.ok(npcOpen(r.npcId, 480), `${r.npc} is open`);
	}
	// Past every threshold, nothing on any board is gated.
	for (const combo of combos) {
		const open = chains(boardData(combo, barterData, npcById), {}, {}, 20_000);
		assert.equal(open.filter(c => c.gate).length, 0);
	}
	// And with no count given, the board is whole.
	assert.equal(chains(data).filter(c => c.gate).length, 0);
});

test('what a board shuts out is listed soonest first', () => {
	const shut = shutOut(barterData, 480);
	assert.ok(shut.length > 0);
	assert.deepEqual(shut.map(s => s.barters), [...shut.map(s => s.barters)].sort((a, b) => a - b));
	assert.equal(shut[0].barters, 600);
	assert.equal(shut[0].short, 120);
	assert.equal(shutOut(barterData, 20_000).length, 0);
});

test('a save that has never been told a count is not a sailor with nothing open', () => {
	// Nought is "nobody has said", not "this player has bartered nothing":
	// the sea stays whole until the count is given.
	assert.equal(openTable(barterData, 0), barterData);
	assert.equal(gateOfItem('Tear of the Ocean', barterData, 0), null);
	assert.equal(shutOut(barterData, 0).length, 0);
	assert.ok(npcOpen(50826, 0), 'the Wandering Merchant is not shut on a blank save');
	assert.ok(!npcOpen(50826, 480), 'and is shut once 480 is typed');
	const board = combos.find(c => c.offers.some(([id]) => npcGate(id) > 480));
	assert.equal(chains(boardData(board, barterData, npcById), {}, {}, 0).filter(c => c.gate).length, 0);
	assert.equal(forecast('Tear of the Ocean', 1, barterData, { barterCount: 0 }).gate, null);
});
