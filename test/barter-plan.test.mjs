// A run planned from the hold for a material, on the pinned table and
// the real islands, and the readings of the table it shares with the
// run for silver.
//
// What can go wrong: an island dealt twice in one run, a ladder
// counted without what is already aboard, a stock read with the
// materials in it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { materialPlan, exchanges, goodsHeld, weightOf, sellOf } from '../js/barter-plan.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { GOODS, ladder } from '../js/barter.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));

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
	// Part of it aboard: the hold's part is one rung, the shortfall
	// another beside it, and the rung below is only asked for the rest.
	const part = materialPlan({ item: 'Brilliant Pearl Shard', qty: 4, stock: { [top.give]: 2 }, barterData, npcById });
	assert.ok(!part.covered);
	assert.equal(part.rungs[0].have, 2);
	assert.equal(part.rungs[0].short, 0);
	assert.equal(part.rungs[0].trades, 2);
	assert.equal(part.rungs[1].item, 'Brilliant Pearl Shard');
	assert.equal(part.rungs[1].short, 2);
	assert.equal(part.rungs[2].need, 2);
	// A good held on another path is spent before anything is bought:
	// three Azure Quartz cover forty Tidal Black Stone in two trades.
	const side = materialPlan({ item: 'Tidal Black Stone', qty: 40, stock: { '[Level 5] Azure Quartz': 3 }, barterData, npcById });
	assert.ok(side.covered);
	assert.equal(side.trades, 2);
	assert.equal(side.rungs[0].give, '[Level 5] Azure Quartz');
});

test('nothing bartered, no plan', () => {
	assert.equal(materialPlan({ item: 'Steel', qty: 1, stock: {}, barterData, npcById }), null);
});
