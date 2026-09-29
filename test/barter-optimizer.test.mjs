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
const combos = useGame(await import('../js/barter_game.js')).combos;
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

import { fullness, fillOf, costOfFill } from '../js/barter-optimizer.js';
import { levelOf } from '../js/barter.js';
import { useGame } from '../js/barter-layouts.js';

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
	// The score is the fill, a thousand to one over what the run spends
	// -- silver ashore and Parley -- so between two that bank the same,
	// the cheaper wins.
	assert.equal(best.value, fillOf(best.run, { targetOf, held: new Map(), stock: mine.stock }) * 1000 - costOfFill(best.run));
	assert.ok(costOfFill(best.run) > 0 && costOfFill(best.run) < 1000);
	// Nothing is sold, so the run is worth nothing in silver and every
	// good it makes is still in hand at the end.
	const run = best.run;
	assert.equal(run.silver, 0);
	assert.ok(run.trades > 0);
	for (const c of best.ids.map(id => low.find(x => x.id === id))) assert.ok(c.top <= ceiling);
	// The score is exactly the goods banked, each counted to its target.
	const banked = [...run.kept, ...run.stashed].reduce((a, g) => a + Math.min(g.n, targetOf(g.item)) * (levelOf(g.item) || 0), 0);
	assert.ok(banked >= Math.ceil(best.value / 1000), 'nothing counted that the run did not end holding');
	// A stock already at its targets has nothing to gain from the same run.
	const full = new Map([...run.kept, ...run.stashed].map(g => [g.item, targets[levelOf(g.item)] || 0]));
	assert.equal(fillOf(run, { targetOf, held: full, stock: {} }), 0);
});

// GriefLZ's stock, 2026-09-29: every [Level 1] over its target at the
// harbour, the [Level 2]s and [Level 3]s short, the [Level 4]s full. The
// run bought a thousand of a shore good to make [Level 1]s he was full
// of, and every chain read "Level 4".
test('a stock run starts from what is held and stops where the good above is full, good by good', () => {
	const ceiling = 4;
	const targets = { 1: 80, 2: 100, 3: 80, 4: 2 };
	const names = new Set([...JSON.stringify(data).matchAll(/\[Level ([1-4])\] [^"\\]+/g)].map(m => m[0]));
	const dock = {};
	const each = { 1: 160, 2: 39, 3: 30, 4: 65 };
	for (const n of names) dock[n] = each[levelOf(n)];
	// Half the [Level 2]s over their target: those climb, the rest stay.
	let i = 0;
	for (const n of names) if (levelOf(n) === 2 && i++ % 2 === 0) dock[n] = 180;
	const fill = { targets, held: Object.entries(dock), away: [] };
	const list = chains(data, {}, dock, null, ceiling, false, fill);
	assert.ok(list.length > 0);
	assert.equal(list.filter(c => c.from === 'land').length, 0, 'no shore good bought to make a [Level 1] the stock is full of');
	for (const c of list) {
		assert.ok(c.top <= 3, `${c.item} climbs into the full [Level 4]s`);
		// Every good it makes on the way that it leaves as the top is short.
		const top = c.rungs[c.rungs.length - 1].item;
		assert.ok((dock[top] || 0) < targets[levelOf(top)], `${c.item} ends on ${top}, already full`);
		// A chain from a good held starts only where some of it is spare.
		assert.ok((dock[c.item] || 0) - targets[levelOf(c.item)] >= c.rungs[0].giveN, `${c.item} starts from goods the stock keeps`);
	}
	assert.ok(list.some(c => levelOf(c.item) === 2 && c.top === 3), 'a full [Level 2] climbs to [Level 3]');
	assert.ok(list.some(c => levelOf(c.item) === 1 && c.top === 2 && c.stops && c.stops.why === 'filling'), 'a short [Level 2] stays, and says why');
	// And the run it makes buys nothing ashore.
	const stockOrders = { ...presetOrders('floor'), sell: 8, floors: targets };
	const mine = { ...opts, stock: {}, dock, owned: dock, orders: stockOrders, pace: 'full' };
	const aim = { targets, held: Object.entries(dock), kind: 'fill' };
	const { best } = propose({ chains: list, opts: { ...mine, aim }, ship, aim, width: 3, depth: 4 });
	assert.ok(best && best.run.trades > 0);
	assert.equal(best.run.cost, 0);
	assert.equal(best.run.bought.length, 0);
});

test('spare goods held in another storage are said, and the chain climbs from below meanwhile', () => {
	const targets = { 1: 80, 2: 100, 3: 80, 4: 2 };
	const l1 = chains(data, {}, {}, null, 4).find(c => c.from === 'land' && c.rungs.length > 1).rungs[0].item;
	const held = [[l1, 400]];
	const list = chains(data, {}, {}, null, 4, false, { targets, held, away: [[l1, [['Velia', 400]]]] });
	const land = list.filter(c => c.from === 'land' && c.rungs[0].item === l1);
	assert.ok(land.length, 'the shore start stays when the spare is out of reach');
	for (const c of land) {
		assert.equal(c.away.good, l1);
		assert.deepEqual(c.away.at, [['Velia', 400]]);
		assert.ok(c.need[0] >= 1, 'and it is sized to make what the spare would have');
	}
});
