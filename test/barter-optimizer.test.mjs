// The runs worth sailing: the search over a board's chains.
//
// What can go wrong: a proposal that spends more Parley than the bar
// holds, three cards that are the same set under three names, a set
// that passes the time cap, a seed the search drops, a value that
// forgets the land goods or counts a good kept as nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { propose, valueOf, hoursOf, STOCK_WORTH } from '../js/barter-optimizer.js';
import { chains, chainRun } from '../js/barter-chains.js';
import { presetOrders } from '../js/barter-orders.js';
import { boardData } from '../js/barter-board.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8')).combos;
const layout = combos.find(c => c.id === '1');
const data = boardData(layout, barterData, npcById);
const stashes = ['Velia', 'Iliya Island', 'Port Epheria'].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));
const hold = { free: 16500, deal: 20625, max: 28050 };
const parley = { bar: 1000000, perTrade: 14286 };
const iliya = ports.find(p => p.name === 'Iliya Island');
const ship = { speed: 110, cal: 11 };
const dock = { '[Level 5] Azure Quartz': 5 };
const opts = { stock: {}, dock, hold, parley, npcById, start: iliya, stashes, pace: 'fast', orders: presetOrders('cash'), prices: {} };
const all = chains(data, {}, dock);

test('three proposals that differ, none over the Parley bar, the best by value first', () => {
	const { proposals, best } = propose({ chains: all, opts, ship });
	assert.ok(proposals.length >= 2);
	assert.equal(proposals[0].kind, 'silver');
	assert.equal(best.ids.join(), proposals[0].ids.join());
	const keys = proposals.map(p => p.ids.slice().sort().join('|'));
	assert.equal(new Set(keys).size, keys.length, 'no set proposed twice');
	for (const p of proposals) {
		assert.ok(p.run.parleyUsed <= parley.bar);
		assert.ok(p.run.trades > 0);
		assert.equal(p.value, valueOf(p.run, opts.orders));
	}
	const perUnit = proposals.find(p => p.kind === 'parley');
	if (perUnit) for (const p of proposals) assert.ok(perUnit.yard.perUnit >= p.yard.perUnit - 1e-6);
});

test('the Quartz at the harbour is in the best run, since nothing pays more a Parley unit', () => {
	const { proposals } = propose({ chains: all, opts, ship });
	const quartz = all.find(c => c.item === '[Level 5] Azure Quartz' && c.top === 7);
	assert.ok(proposals.some(p => p.ids.includes(quartz.id)));
});

test('a time cap holds, and a seed is kept', () => {
	const { proposals } = propose({ chains: all, opts, ship, timeCap: 1.5 });
	for (const p of proposals) assert.ok(p.hours <= 1.5, `${p.label}: ${p.hours}h`);
	const land = all.find(c => c.from === 'land' && c.top === 7);
	const { best } = propose({ chains: all, opts, ship, seed: [land.id] });
	assert.ok(best.ids.includes(land.id));
});

test('value counts silver net of land goods and the goods kept; the stock orders value the low goods too', () => {
	const c = all.find(x => x.from === 'land' && x.top === 5);
	const run = chainRun({ ...opts, chosen: [c], prices: { [c.item]: { each: 50000, how: 'market' } } });
	assert.equal(valueOf(run, presetOrders('cash')), run.net + run.kept.reduce((a, k) => a + k.total, 0) + run.stashed.reduce((a, k) => a + k.total, 0));
	const low = { net: 0, kept: [{ item: '[Level 1] Raft Toy', n: 4, total: 0 }, { item: '[Level 2] Urchin Spine', n: 2, total: 0 }], stashed: [] };
	assert.equal(valueOf(low, presetOrders('cash')), 0);
	assert.equal(valueOf(low, presetOrders('stock')), 4 * STOCK_WORTH[1] + 2 * STOCK_WORTH[2]);
	assert.equal(hoursOf({ stops: [] }, { start: iliya, npcById, ...ship }), 0);
	assert.ok(hoursOf(run, { start: iliya, npcById, ...ship }) > 0);
});

test('nothing to propose when nothing pays', () => {
	const { proposals, best } = propose({ chains: [], opts, ship });
	assert.deepEqual(proposals, []);
	assert.equal(best, null);
});
