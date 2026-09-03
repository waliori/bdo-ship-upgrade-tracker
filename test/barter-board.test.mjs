// Today's board: the record of the forty layouts, and what one island's
// offer says about the rest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { candidates, offersAt, askable, boardData, offersOf } from '../js/barter-board.js';
import { silverPlan, materialPlan } from '../js/barter-plan.js';
import { ladder, levelOf, triesFor, TRIES_BY_RUNG } from '../js/barter.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { tradeGoodNames } from '../js/trade_goods.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const record = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8'));
const combos = record.combos;
const known = new Set();
for (const e of barterData) { known.add(e.name); for (const s of e.sources) known.add(s.give.name); }

test('the record: forty layouts, every offer at a barterer we know, every name one the table knows', () => {
	assert.equal(combos.length, 40);
	assert.equal(new Set(combos.map(c => c.id)).size, 40);
	assert.equal(combos.reduce((a, c) => a + c.seen, 0), record.sample.refreshes);
	for (const c of combos) {
		assert.ok(c.offers.length >= 80, `layout ${c.id} has ${c.offers.length} offers`);
		assert.equal(new Set(c.offers.map(o => o[0])).size, c.offers.length, `layout ${c.id} lists an island twice`);
		for (const [id, give, qty, recv] of c.offers) {
			assert.ok(npcById.has(id), `${id} in layout ${c.id}`);
			assert.ok(known.has(give) && known.has(recv), `${give} -> ${recv}`);
			assert.match(qty, /^\d+(-\d+)?$/);
			if (levelOf(recv)) assert.ok(tradeGoodNames.includes(recv));
		}
	}
});

test('one island narrows the layouts, a second settles them, an offer nobody shows leaves none', () => {
	assert.equal(candidates(combos, []).length, 40);
	const luivano = [...npcById.values()].find(n => n.at === 'Luivano Island').id;
	const o = offersOf(combos[0]).get(luivano);
	const one = candidates(combos, [{ npcId: luivano, give: o.give, recv: o.recv }]);
	assert.ok(one.some(c => c.id === combos[0].id));
	assert.ok(one.length <= 3, `Luivano leaves ${one.length}`);
	const next = askable(one, npcById)[0];
	if (next) {
		const o2 = offersOf(combos[0]).get(next.npcId);
		const two = candidates(one, [{ npcId: next.npcId, give: o2.give, recv: o2.recv }]);
		assert.deepEqual(two.map(c => c.id), [combos[0].id]);
	}
	assert.deepEqual(candidates(combos, [{ npcId: luivano, give: 'Wool', recv: 'Tidal Black Stone' }]), []);
});

test('the island worth asking about leaves the fewest layouts standing, and one everybody agrees on is not offered', () => {
	const ask = askable(combos, npcById, ports[0]);
	assert.ok(ask.length > 0);
	assert.ok(ask[0].worst <= 3, `best island leaves ${ask[0].worst} at worst`);
	for (let i = 1; i < ask.length; i++) assert.ok(ask[i].worst >= ask[i - 1].worst);
	for (const a of ask) assert.ok(offersAt(combos, a.npcId).length >= 2);
	const offers = offersAt(combos, ask[0].npcId);
	assert.ok(offers.every(o => o.ids.length >= 1));
	assert.equal(offers.reduce((a, o) => a + o.ids.length, 0), combos.filter(c => offersOf(c).has(ask[0].npcId)).length);
});

test('a layout reads as a barter table: one offer an island, the codex’s attempts where it has the exchange, the materials from the whole table', () => {
	const combo = combos[0];
	const data = boardData(combo, barterData, npcById);
	const goods = data.filter(e => levelOf(e.name) !== null || e.name === 'Crow Coin');
	const dealt = goods.flatMap(e => e.sources.map(s => s.npc_id));
	assert.equal(new Set(dealt).size, dealt.length, 'an island deals one trade exchange today');
	assert.equal(dealt.length, combo.offers.filter(o => levelOf(o[3]) !== null || o[3] === 'Crow Coin').length);
	const codex = new Map();
	for (const e of barterData) for (const s of e.sources) codex.set(`${s.npc_id}|${s.give.name}|${e.name}`, s);
	for (const e of goods) for (const s of e.sources) {
		const c = codex.get(`${s.npc_id}|${s.give.name}|${e.name}`);
		if (c) { assert.equal(s.attempts_available, c.attempts_available); assert.equal(s.quantity_received, c.quantity_received); assert.equal(s.give.quantity, c.give.quantity); }
		else assert.equal(s.quantity_received, '1');
	}
	const brilliant = data.find(e => e.name === 'Brilliant Pearl Shard');
	assert.ok(brilliant && brilliant.sources.length === barterData.find(e => e.name === 'Brilliant Pearl Shard').sources.length, 'material islands roll on their own');
	assert.ok(ladder('Brilliant Pearl Shard', data), 'the ladder climbs the board to the material');
});

test('a run planned on the board only calls at islands the board deals, and the caps by rung stand in for the codex’s zeros', () => {
	const combo = combos[3];
	const data = boardData(combo, barterData, npcById);
	const board = offersOf(combo);
	const five = [...board.values()].find(o => levelOf(o.give) === 4 && levelOf(o.recv) === 5);
	const p = silverPlan({ stock: { [five.give]: 4 }, barterData: data, hold: { free: 20000, max: 30000 }, parley: { bar: 1e6, perTrade: 14286 }, npcById });
	assert.ok(p.stops.length > 0);
	for (const s of p.stops) {
		const o = board.get(s.npcId);
		assert.ok(o && o.give === s.give && o.item === undefined ? true : o.recv === s.item, `${s.npc} deals ${s.give} -> ${s.item} today`);
	}
	const m = materialPlan({ item: 'Brilliant Pearl Shard', qty: 2, stock: {}, barterData: data, npcById });
	assert.ok(m && m.stops.length > 0);
	for (const s of m.stops) if (levelOf(s.item) !== null) assert.equal(board.get(s.npcId).recv, s.item);
	assert.equal(triesFor('[Level 7] Golden Flour Sack', 0), TRIES_BY_RUNG[7]);
	assert.equal(triesFor('[Level 5] Azure Quartz', 4), 4);
	assert.equal(triesFor('Crow Coin', 0), TRIES_BY_RUNG.coin);
	assert.equal(triesFor('Brilliant Pearl Shard', 0), 2);
});
