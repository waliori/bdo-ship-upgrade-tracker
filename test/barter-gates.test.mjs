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

import { npcGates, npcGate, npcOpen, openTable, gateOfItem, shutOut, forecast, gateFor, nextGateAbove, ROUTE_UNLOCKS } from '../js/barter.js';
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

test('nought barters is a real answer: the fewest islands, not the most', () => {
	// A sailor who has never bartered has the three routes the game
	// starts them with. Every threshold is ahead of them, and the app
	// plans on that rather than on an optimistic blank.
	assert.notEqual(openTable(barterData, 0), barterData);
	assert.equal(shutOut(barterData, 0).length, 12, 'all twelve are ahead of them');
	assert.equal(shutOut(barterData, 0)[0].barters, 10);
	assert.ok(!npcOpen(58960, 0), 'Kashuma opens at 10');
	assert.ok(npcOpen(58960, 10));
	assert.equal(gateOfItem('Tear of the Ocean', barterData, 0).barters, 3000);
	assert.ok(forecast('Tear of the Ocean', 1, barterData, { barterCount: 0 }).gate);
	// And the board's chains are gated from the first barter.
	const board = combos.find(c => c.offers.some(([id]) => npcGate(id) > 0));
	assert.ok(chains(boardData(board, barterData, npcById), {}, {}, 0).filter(c => c.gate).length > 0);
	// A caller with no player in hand still gets the whole board.
	assert.equal(chains(boardData(board, barterData, npcById)).filter(c => c.gate).length, 0);
});

test('a chain opens on the barter that opens its island, and not before', () => {
	// Layout 16 holds a climb whose [Level 4] rung is dealt at the
	// Wandering Merchant's Ship, which opens at 3,000.
	const data = boardData(combos.find(c => c.id === '16'), barterData, npcById);
	const at = n => chains(data, {}, {}, n);
	assert.equal(at(2999).filter(c => c.gate).length, 1);
	assert.equal(at(2999).find(c => c.gate).gate.barters, 3000);
	assert.equal(at(3000).filter(c => c.gate).length, 0, 'one barter opens it');
	assert.equal(at(2999).length, at(3000).length, 'the board holds the same climbs either side');
});

// The per-exchange thresholds are the same ladder as the route ones, so
// an exchange found shut at a count is shut until the next rung of it --
// which is what lets one sighting be remembered for longer than a day.
test('the next count at which anything opens is the next rung of the ladder', () => {
	assert.equal(nextGateAbove(0), ROUTE_UNLOCKS[1].barters);
	assert.equal(nextGateAbove(1082), 1200);
	assert.equal(nextGateAbove(1200), 1500);
	assert.equal(nextGateAbove(-5), ROUTE_UNLOCKS.find(r => r.barters > 0).barters);
	assert.equal(nextGateAbove(20000), Infinity);
	assert.equal(nextGateAbove('nonsense'), ROUTE_UNLOCKS.find(r => r.barters > 0).barters);
	for (const r of ROUTE_UNLOCKS) if (r.barters) assert.ok(nextGateAbove(r.barters - 1) <= r.barters);
});

// The per-exchange gate, baked from the client's own table.
//
// The board the app drew was a 20,000-barter account's board: the
// layouts were recorded by players with everything unlocked, and the
// game gates each of an island's forty exchanges on its own count. What
// can go wrong: a gate read off the wrong row, a layout mapped to the
// wrong row, an island hidden on a guess where the client ships nothing,
// or the whole thing applied to a sailor who never said their count.
const { ROWS, GATES } = await import('../js/barter_gates.js');
const { gatedOffers, exchangeGate } = await import('../js/barter-board.js');

test('every layout claims one row of the pools, and all forty are claimed', () => {
	const rows = Object.values(ROWS);
	assert.equal(rows.length, 40);
	assert.deepEqual([...rows].sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i));
	assert.deepEqual(Object.keys(ROWS).sort(), combos.map(c => c.id).sort());
});

test('every gate is a count on the game’s own ladder, and every column is forty long', () => {
	const ladder = new Set(ROUTE_UNLOCKS.map(r => r.barters));
	for (const [npc, col] of Object.entries(GATES)) {
		assert.equal(col.length, 40, `${npc} has ${col.length} rows`);
		for (const g of col) {
			if (g === null) continue;
			assert.ok(ladder.has(g), `${npc} has a gate of ${g}, which opens nothing`);
		}
	}
	// The client's sentinel for an exchange that is not live must never
	// have been baked in as if it were a threshold.
	assert.ok(!Object.values(GATES).some(col => col.includes(1000000)));
});

test('an unknown gate is an open one: the app never hides an island on a guess', () => {
	const five = combos.find(c => c.id === '5');
	// The six mainland [Level 6] -> [Level 7] barterers are in no pool.
	const unknown = five.offers.filter(([npc]) => exchangeGate(five, npc) === null);
	assert.ok(unknown.length > 0, 'the client covers every offer, so this test is stale');
	const shut = new Set(gatedOffers(five, 0).map(x => x.npcId));
	for (const [npc] of unknown) assert.ok(!shut.has(npc), `${npc} was hidden with no gate to hide it by`);
});

test('the gate bites at low counts, lets go at high ones, and never fires without a count', () => {
	const five = combos.find(c => c.id === '5');
	const at = n => gatedOffers(five, n).length;
	assert.ok(at(0) > at(600), 'a board does not thin out as the count climbs');
	assert.ok(at(600) >= at(1082));
	assert.equal(at(20000), 0, 'something is still shut past the last unlock');
	// Every layout, both ends.
	for (const c of combos) {
		assert.equal(gatedOffers(c, 20000).length, 0, `layout ${c.id} hides something at 20,000`);
		assert.ok(gatedOffers(c, 0).length > 0, `layout ${c.id} gates nothing at all`);
	}
	// No combo, or no count, gates nothing.
	assert.deepEqual(gatedOffers(null, 0), []);
	assert.deepEqual(gatedOffers(five, undefined), []);
	assert.deepEqual(gatedOffers(five, 'nonsense'), []);
});

test('an exchange the count has not opened is off the board, so no chain climbs it', () => {
	const five = combos.find(c => c.id === '5');
	const shut = gatedOffers(five, 1082);
	assert.ok(shut.length > 0);
	const stock = new Map(), dock = new Map();
	const open = chains(boardData(five, barterData, npcById, [], shut), stock, dock, 20000);
	const closed = new Set(shut.map(x => `${x.npcId}|${x.recv}`));
	for (const c of open) for (const r of c.rungs) {
		if (!closed.has(`${r.npcId}|${r.item}`)) continue;
		assert.fail(`a chain climbs ${r.item} at ${r.npcId}, gated at ${shut.find(x => x.npcId === r.npcId && x.recv === r.item).gate}`);
	}
	// And the board is genuinely shorter than the one it would have drawn.
	const all = chains(boardData(five, barterData, npcById, []), stock, dock, 20000);
	assert.ok(open.length < all.length, 'gating changed nothing');
});

test('Kashuma’s Crow Coin exchange opens at 10 barters, as the game says', () => {
	// The one row whose gate is independently known: the published note
	// says Kashuma opens at 10, and the client's row agrees. If a re-bake
	// ever shifts the rows under the layouts, this is what catches it.
	const kashuma = [...npcById.values()].find(n => n.at === 'Kashuma Island');
	assert.ok(kashuma, 'Kashuma is not in the npc table');
	const seen = combos.map(c => exchangeGate(c, kashuma.id)).filter(g => g !== null);
	assert.ok(seen.length >= 30, `only ${seen.length} of 40 rows carry a gate`);
	assert.deepEqual([...new Set(seen)], [10], 'Kashuma is not gated at 10 throughout');
});
