// The runs a board allows, chain by chain: every climb from the shore
// or the hold to the top the board reaches, and the run along the
// chains a sailor ticks.
//
// What can go wrong: a chain that skips a rung or takes a good no
// island on the board pays, an island dealt twice when two chains
// cross it, an island asked to barter with the hold over the weight
// limit, a fast run buying more than the top can use, a [Level 7]
// carried home instead of sold.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { chains, chainRun } from '../js/barter-chains.js';
import { boardData, offersOf } from '../js/barter-board.js';
import { levelOf, GOODS } from '../js/barter.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8')).combos;
const layout = combos.find(c => c.id === '25');
const data = boardData(layout, barterData, npcById);
const stashes = ['Velia', 'Iliya Island', "Oquilla's Eye"].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));
const hold = { free: 23300, max: 39610 };
const parley = { bar: 3500000, perTrade: 10554 };

test('every chain climbs the board a rung at a time, from a land good or a good aboard', () => {
	const board = offersOf(layout);
	const all = chains(data, { '[Level 4] Amethyst Fragment': 4 });
	assert.ok(all.length > 0);
	for (const c of all) {
		assert.equal(c.rungs[0].give, c.item);
		if (c.from === 'land') assert.equal(levelOf(c.item), null);
		else assert.equal(c.have, 4);
		c.rungs.forEach((r, i) => {
			const o = board.get(r.npcId);
			assert.ok(o && o.give === r.give && o.recv === r.item, `${r.npc} deals ${r.give} -> ${r.item}`);
			if (i) assert.equal(r.give, c.rungs[i - 1].item, 'each rung takes what the one below paid');
		});
		assert.equal(c.top, levelOf(c.rungs[c.rungs.length - 1].item));
	}
	// Layout 25: ten [Level 1] islands, five of them the foot of a
	// chain to [Level 7]; the [Level 4]s aboard start a sixth.
	assert.equal(all.filter(c => c.from === 'land' && levelOf(c.rungs[0].item) === 1).length, 10);
	assert.equal(all.filter(c => c.top === 7 && c.from === 'land').length, 5);
	assert.equal(all[0].from, 'hold', 'the shortest climb to the top comes first');
	assert.equal(all[0].top, 7);
	assert.equal(new Set(all.map(c => c.id)).size, all.length);
});

test('a full run from the shore: every attempt the limit allows at each rung, a wharf call whenever the limit is in the way, the [Level 7]s sold in port', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const p = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes });
	const islands = p.stops.filter(s => s.npcId);
	assert.deepEqual(islands.map(s => s.npc), c.rungs.map(r => r.npc));
	// Weighed as if every exchange paid three, ten attempts at the
	// [Level 3] rung cannot all start under the limit: nine do.
	assert.deepEqual(islands.map(s => s.times), [10, 10, 9, 10, 6, 5, 5]);
	// No island barters with the hold over the limit: every exchange
	// starts under it, so the hold on arrival is under it too.
	let w = 0;
	for (const s of p.stops) {
		if (s.npcId) assert.ok(w <= hold.free + 1e-6, `${s.npc} is reached under the limit`);
		w = s.weightAfter;
	}
	assert.ok(p.stops.every(s => s.weightAfter <= hold.max + 1e-6), 'never past what the hull moves under');
	const wharfs = p.stops.filter(s => s.wharf);
	assert.ok(wharfs.length >= 2, 'the leftovers go ashore on the way');
	assert.ok(wharfs.every(s => stashes.includes(s.wharf) && s.chain === 0));
	assert.ok(p.stashed.every(s => levelOf(s.item) <= 5), 'nothing above what the top rungs take is left ashore');
	// The [Level 7]s are carried to the wharf and sold there -- home,
	// since the run set out from Velia -- never at the island.
	assert.ok(islands.every(s => !s.sale));
	const last = p.stops[p.stops.length - 1];
	assert.ok(last.wharf && last.wharf.at === 'Velia' && last.sale && last.sale.n === 5 && last.dropped.length === 0);
	assert.equal(last.weightAfter, 0);
	assert.equal(p.sold.length, 1);
	assert.equal(p.sold[0].at, 'Velia');
	assert.equal(p.silver, 5 * GOODS[7].sell);
	assert.deepEqual(p.bought, [{ item: 'Copper Ingot', n: 100 }]);
	assert.equal(p.trades, 55);
	assert.ok(Math.abs(p.parleyUsed - 55 * parley.perTrade) < 1e-6);
	assert.ok(p.keptWorth > 0, 'what is left over is priced');
	assert.deepEqual(p.order, [c]);
});

test('a fast run buys only what the top can use, counted at the least an exchange pays, and calls at no wharf but the last on a hull that carries it', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const p = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast' });
	const islands = p.stops.filter(s => s.npcId);
	assert.equal(p.stops.length, islands.length + 1, 'one wharf call: the sale');
	assert.deepEqual(islands.map(s => s.times), [1, 1, 2, 3, 5, 5, 5]);
	assert.equal(p.silver, 5 * GOODS[7].sell);
	assert.deepEqual(p.bought, [{ item: 'Copper Ingot', n: 10 }]);
	assert.ok(p.weightPeak <= hold.free);
	// Goods aboard shorten the buying: four [Level 4]s aboard mean one
	// fewer attempt at the rung that pays them.
	const q = chainRun({ chosen: [c], stock: { '[Level 4] Amethyst Fragment': 4 }, hold, parley, npcById, start: ports[0], stashes, pace: 'fast' });
	assert.equal(q.stops.find(s => s.npc === 'Perugia').times, 1);
	assert.equal(q.silver, 5 * GOODS[7].sell);
});

test('the wharf is the one chosen when one is, else the one that bends the leg least', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const iliya = stashes.find(w => w.at === 'Iliya Island');
	const p = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, prefer: iliya });
	const calls = p.stops.filter(s => s.wharf);
	assert.ok(calls.length >= 1);
	assert.ok(calls.every(s => s.wharf === iliya));
	assert.ok(p.stashed.every(s => s.at === 'Iliya Island'));
	const free = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes });
	assert.ok(free.stops.filter(s => s.wharf).some(s => s.wharf !== iliya), 'left to itself the run calls where it passes');
});

test('two chains sail one after the other, nearest first, and an island crossed twice deals once', () => {
	const stock = { '[Level 4] Amethyst Fragment': 4 };
	const all = chains(data, stock);
	const land = all.find(x => x.rungs[0].npc === 'Cazio');
	const aboard = all.find(x => x.from === 'hold');
	const p = chainRun({ chosen: [land, aboard], stock, hold, parley, npcById, start: ports[0], stashes });
	const ids = p.stops.filter(s => s.npcId).map(s => s.npcId);
	assert.equal(new Set(ids).size, ids.length);
	// The [Level 4]s aboard join the land chain at Tarin: six attempts
	// there, not four and then six.
	assert.equal(p.stops.find(s => s.npc === 'Tarin').times, 6);
	assert.equal(p.silver, 5 * GOODS[7].sell);
	const far = all.find(x => x.rungs[0].npc === 'Renilu');
	const two = chainRun({ chosen: [far, land], stock: {}, hold, parley, npcById, start: ports[0], stashes });
	assert.equal(two.sold.length, 2);
	assert.equal(two.silver, 10 * GOODS[7].sell);
	assert.ok(two.stops.every(s => s.weightAfter <= hold.max + 1e-6));
	assert.equal(two.stops.filter(s => s.npcId)[0].npc, 'Renilu', 'the chain nearest Velia is sailed first');
	assert.deepEqual(two.order.map(c => c.rungs[0].npc), ['Renilu', 'Cazio']);
	assert.ok(two.stops.filter(s => s.npcId).every(s => two.order[s.chain].rungs.some(r => r.npcId === s.npcId)), 'each island stop is tagged with its chain');
	// The first chain's [Level 7]s are sold at the first wharf call of
	// the second, not carried the whole way.
	const firstSale = two.stops.find(s => s.sale);
	assert.ok(firstSale.wharf && firstSale.chain === 1 && firstSale.sale.n === 5);
});

test('with no wharf in reach the hold never ends over the limit, and the fast pace climbs furthest', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const small = { free: 8000, max: 13600 };
	const full = chainRun({ chosen: [c], stock: {}, hold: small, parley, npcById, start: ports[0] });
	const fast = chainRun({ chosen: [c], stock: {}, hold: small, parley, npcById, start: ports[0], pace: 'fast' });
	for (const p of [full, fast]) assert.ok(p.stops.every(s => s.npcId && s.weightAfter <= small.free + 1e-6), 'never over the limit, since nothing could be left ashore');
	assert.ok(fast.stops.length > full.stops.length, 'every attempt at the foot leaves no room to climb');
	assert.ok(fast.stops.some(s => s.npc === 'Tarin'));
});
