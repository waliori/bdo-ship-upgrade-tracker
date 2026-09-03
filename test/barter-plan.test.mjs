// A run planned from the hold: the silver plan and the material plan,
// on the pinned table and the real islands.
//
// What can go wrong: an island dealt twice in one run, a stop that
// puts the hold past what the hull moves under, a feeder trade that
// pays nothing this run taking the room a [Level 5] needed to become
// a [Level 6], a ladder counted without what is already aboard.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { silverPlan, materialPlan, exchanges, goodsHeld, worthOf, weightOf, sellOf } from '../js/barter-plan.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { tradeGoods } from '../js/trade_goods.js';
import { GOODS, ladder } from '../js/barter.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const hold = { free: 12000, max: 20000 };
const parley = { bar: 1000000, perTrade: 14286 };
const plan = stock => silverPlan({ stock, barterData, hold, parley, npcById, start: ports[0] });

test('the table flattens to one row an exchange, and a stock to its goods', () => {
	const rows = exchanges(barterData);
	assert.equal(rows.length, barterData.reduce((a, e) => a + e.sources.length, 0));
	assert.ok(rows.every(r => r.recv > 0 && r.giveN > 0 && r.tries > 0));
	const held = goodsHeld({ '[Level 3] Ancient Orders': 4, 'Tidal Black Stone': 9, '[Level 1] Raft Toy': 0 });
	assert.deepEqual([...held], [['[Level 3] Ancient Orders', 4]]);
	assert.equal(weightOf('[Level 6] Brass Bowl Crate'), GOODS[6].weight);
	assert.equal(sellOf('[Level 2] Filtered Drinking Water'), 0);
	assert.equal(sellOf('Tidal Black Stone'), 0);
});

test('a good is worth what it becomes, never less than what it sells for', () => {
	const worth = worthOf(exchanges(barterData));
	for (const lv of [3, 4, 5, 6, 7]) {
		for (const n of tradeGoods[lv]) assert.ok(worth(n) >= GOODS[lv].sell, n);
	}
	assert.equal(worth(tradeGoods[7][0]), GOODS[7].sell);
	assert.ok(worth(tradeGoods[1][0]) > 0, 'a [Level 1] is worth the climb');
});

test('with nothing aboard there is no run, and the shore can be bought from when asked', () => {
	const none = plan({});
	assert.equal(none.stops.length, 0);
	assert.equal(none.silver, 0);
	const shore = silverPlan({ stock: {}, barterData, hold, parley, npcById, land: true });
	assert.ok(shore.stops.length > 0);
	assert.ok(shore.bought.length > 0);
	assert.ok(shore.stops.every(s => s.weightAfter <= hold.max + 1e-6));
});

test('a run from what is aboard: each island once, the hold under its ceiling at every stop, the bar paid', () => {
	const stock = { '[Level 4] Amethyst Fragment': 3, "[Level 4] Boatman's Manual": 3, '[Level 3] Ancient Orders': 4, '[Level 1] Chewy Raw Gizzard': 6 };
	const p = plan(stock);
	assert.ok(p.stops.length > 0);
	const islands = p.stops.map(s => s.npcId);
	assert.equal(new Set(islands).size, islands.length, 'an island deals once a run');
	assert.ok(p.stops.every(s => s.weightAfter <= hold.max + 1e-6), 'never past what the hull moves under');
	assert.ok(p.stops.every(s => s.times >= 1 && s.times <= s.tries), 'within the attempts an island allows');
	assert.equal(p.trades, p.stops.reduce((a, s) => a + s.times, 0));
	assert.ok(Math.abs(p.parleyUsed - p.trades * parley.perTrade) < 1e-6);
	assert.ok(p.parleyUsed <= parley.bar);
	assert.ok(p.silver >= p.startValue, 'a run never loses silver');
	assert.equal(p.gain, p.silver - p.startValue);
});

test('the room above is kept for the climb: a [Level 5] becomes a [Level 6], a feeder does not take its thousand LT', () => {
	// Five [Level 5]s and a sack of [Level 1]s in a hold with room for
	// exactly the five to double their weight. The feeder would fill
	// that room with [Level 2]s that pay nothing this run.
	const five = tradeGoods[5][0];
	const stock = { [five]: 5, '[Level 1] Chewy Raw Gizzard': 10 };
	const p = silverPlan({ stock, barterData, hold: { free: 10000, max: 11000 }, parley, npcById });
	const up = p.stops.filter(s => s.give === five);
	assert.ok(up.length > 0, 'the [Level 5]s are traded up');
	assert.ok(p.silver > 5 * GOODS[5].sell, 'and the run is worth more than selling them');
});

test('the bar and the ceiling both stop a run: a hold that moves nothing, a bar with nothing in it', () => {
	const stock = { '[Level 4] Amethyst Fragment': 3 };
	const dead = silverPlan({ stock, barterData, hold: { free: 0, max: 0 }, parley, npcById });
	// A [Level 4] to a [Level 5] weighs the same, so it still trades;
	// nothing that adds weight does.
	assert.ok(dead.stops.every(s => s.weightAfter <= 3000 + 1e-6));
	const broke = silverPlan({ stock, barterData, hold, parley: { bar: 0, perTrade: 14286 }, npcById });
	assert.equal(broke.stops.length, 0);
	assert.equal(broke.silver, 3 * GOODS[4].sell);
});

test('the sailing order is rung by rung from the bottom, and the hold is read along it', () => {
	const stock = { '[Level 3] Ancient Orders': 4, '[Level 1] Chewy Raw Gizzard': 6 };
	const p = plan(stock);
	const levels = p.stops.map(s => s.level);
	assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
	let w = 4 * GOODS[3].weight + 6 * GOODS[1].weight;
	for (const s of p.stops) {
		w += s.times * (s.recv * weightOf(s.item) - s.giveN * weightOf(s.give));
		assert.ok(Math.abs(s.weightAfter - w) < 1e-6);
	}
});

test('a material with nothing aboard starts ashore, at the floor of its ladder', () => {
	const top = ladder('Brilliant Pearl Shard', barterData);
	const p = materialPlan({ item: 'Brilliant Pearl Shard', qty: 10, stock: {}, barterData, npcById, start: ports[0] });
	assert.ok(p && !p.covered);
	assert.equal(p.rungs[0].item, 'Brilliant Pearl Shard');
	assert.equal(p.rungs[0].give, top.give);
	assert.ok(p.first && p.first.ashore, 'the first thing to get is bought on land');
	assert.equal(p.first.item, top.seed.item);
	// The stops climb: the seed's island first, the top rung last.
	const levels = p.stops.map(s => s.level);
	assert.deepEqual(levels, [...levels].sort((a, b) => a - b));
	const islands = p.stops.map(s => s.npcId);
	assert.equal(new Set(islands).size, islands.length);
	assert.ok(p.stops.every(s => s.times <= s.tries));
	// Ten shards at two a draw from four islands is more than one refresh.
	assert.ok(p.refreshes >= 2);
});

test('what is aboard shortens the ladder: the top give in the hold covers the run', () => {
	const top = ladder('Brilliant Pearl Shard', barterData);
	const p = materialPlan({ item: 'Brilliant Pearl Shard', qty: 4, stock: { [top.give]: 10 }, barterData, npcById });
	assert.ok(p.covered);
	assert.equal(p.rungs.length, 1);
	assert.equal(p.first, null);
	assert.ok(p.stops.every(s => s.item === 'Brilliant Pearl Shard'));
	assert.equal(p.stops.reduce((a, s) => a + s.times, 0), 4);
	// Part of it aboard: the rung below is only asked for the rest.
	const part = materialPlan({ item: 'Brilliant Pearl Shard', qty: 4, stock: { [top.give]: 2 }, barterData, npcById });
	assert.ok(!part.covered);
	assert.equal(part.rungs[0].have, 2);
	assert.equal(part.rungs[0].short, 2);
	assert.equal(part.rungs[1].need, 2);
});

test('nothing bartered, no plan', () => {
	assert.equal(materialPlan({ item: 'Steel', qty: 1, stock: {}, barterData, npcById }), null);
});
