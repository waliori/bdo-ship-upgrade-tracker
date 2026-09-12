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
	assert.equal(valueOf(low, presetOrders('floor')), 4 * STOCK_WORTH[1] + 2 * STOCK_WORTH[2]);
	assert.equal(hoursOf({ stops: [] }, { start: iliya, npcById, ...ship }), 0);
	assert.ok(hoursOf(run, { start: iliya, npcById, ...ship }) > 0);
});

test('nothing to propose when nothing pays', () => {
	const { proposals, best } = propose({ chains: [], opts, ship });
	assert.deepEqual(proposals, []);
	assert.equal(best, null);
});

test('an unlimited search is whole; a budget of nothing still judges one set and says it stopped early', () => {
	const whole = propose({ chains: all, opts, ship });
	assert.equal(whole.partial, false);
	const cut = propose({ chains: all, opts, ship, budgetMs: 0 });
	assert.equal(cut.partial, true);
	// The budget is checked after a set is judged, so exactly one set
	// -- the first chain on its own -- was looked at: whatever comes
	// back is that one chain, and never more than the whole search.
	assert.ok(cut.proposals.length <= 1);
	for (const p of cut.proposals) {
		assert.equal(p.ids.length, 1);
		assert.ok(p.value <= whole.best.value + 1e-6, 'the best so far never beats the whole search');
		assert.ok(p.run.parleyUsed <= parley.bar);
	}
	// A seed is kept under a budget as without one.
	const seeded = propose({ chains: all, opts, ship, seed: [all[0].id], budgetMs: 0 });
	assert.equal(seeded.partial, true);
	for (const p of seeded.proposals) assert.ok(p.ids.includes(all[0].id));
});

test('a budget that is not reached leaves the search whole', () => {
	const { partial, proposals } = propose({ chains: all, opts, ship, budgetMs: 60000 });
	assert.equal(partial, false);
	assert.deepEqual(proposals.map(p => p.ids), propose({ chains: all, opts, ship }).proposals.map(p => p.ids));
});

import { fullness, fillOf } from '../js/barter-optimizer.js';
import { levelOf } from '../js/barter.js';

test('a stock is as full as its targets, and no fuller: what is over a target adds nothing', () => {
	const to = { '[Level 1] Bronze Statue': 10, '[Level 2] Bronze Coin': 10 };
	const targetOf = name => to[name] || 0;
	const held = new Map([['[Level 1] Bronze Statue', 4]]);
	assert.equal(fullness(held, targetOf), 4);
	assert.equal(fullness(new Map([['[Level 1] Bronze Statue', 10]]), targetOf), 10);
	// Over the target counts for no more, and a good with no target for nothing.
	assert.equal(fullness(new Map([['[Level 1] Bronze Statue', 40]]), targetOf), 10);
	assert.equal(fullness(new Map([['[Level 7] Ruby', 9]]), targetOf), 0);
	// A [Level 2] is two rungs of work, so it counts double.
	assert.equal(fullness(new Map([['[Level 2] Bronze Coin', 3]]), targetOf), 6);
});

test('a stock run is judged by what it banks, not by what it would sell for', () => {
	// Targets on the low goods only, and a ceiling to match: the run
	// that fills them beats the run that climbs past them.
	const ceiling = 3;
	const targets = { 1: 20, 2: 20, 3: 20 };
	const targetOf = name => targets[levelOf(name)] || 0;
	const low = chains(data, {}, {}, null, ceiling);
	const stockOrders = { ...presetOrders('floor'), sell: 8, floors: targets };
	const mine = { ...opts, dock: {}, orders: stockOrders, pace: 'full' };
	const aim = { targets, held: [], kind: 'fill' };
	const { proposals, best } = propose({ chains: low, opts: mine, ship, aim });
	assert.ok(best && best.value > 0, 'a run that banks nothing is no proposal');
	assert.equal(proposals[0].kind, 'stock');
	// The score is the fill, a thousand to one over the trades it took.
	assert.equal(Math.floor(best.value / 1000), fillOf(best.run, { targetOf, held: new Map(), stock: mine.stock }));
	// Nothing is sold, so the run is worth nothing in silver and every
	// good it makes is still in hand at the end.
	const run = best.run;
	assert.equal(run.silver, 0);
	assert.ok(run.trades > 0);
	for (const c of best.ids.map(id => low.find(x => x.id === id))) assert.ok(c.top <= ceiling);
	// The score is exactly the goods banked, each counted to its target.
	const banked = [...run.kept, ...run.stashed].reduce((a, g) => a + Math.min(g.n, targetOf(g.item)) * (levelOf(g.item) || 0), 0);
	assert.ok(banked >= Math.floor(best.value / 1000), 'nothing counted that the run did not end holding');
	// A stock already at its targets has nothing to gain from the same run.
	const full = new Map([...run.kept, ...run.stashed].map(g => [g.item, targets[levelOf(g.item)] || 0]));
	assert.equal(fillOf(run, { targetOf, held: full, stock: {} }), 0);
});
