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
import { PLAIN_ORDERS } from '../js/barter-orders.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8')).combos;
const layout = combos.find(c => c.id === '25');
const data = boardData(layout, barterData, npcById);
const stashes = ['Velia', 'Iliya Island', "Oquilla's Eye"].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));
const hold = { free: 23300, deal: 29125, max: 39610 };
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
	assert.deepEqual(islands.map(s => s.times), [10, 10, 10, 10, 6, 5, 5]);
	// No island barters with the hold over the ceiling: every exchange
	// starts under it, so the hold on arrival is under it too -- and
	// weighed as if every exchange paid three, the [Level 3] rung ends
	// past the limit, sailing slower to the wharf.
	let w = 0;
	for (const s of p.stops) {
		if (s.npcId) assert.ok(w <= hold.deal + 1e-6, `${s.npc} is reached under the ceiling`);
		w = s.weightAfter;
	}
	assert.ok(p.weightPeak > hold.free && p.weightPeak <= hold.deal);
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
	assert.ok(last.weightAfter < hold.free, 'what is left aboard is carried home');
	assert.equal(p.sold.length, 1);
	assert.equal(p.sold[0].at, 'Velia');
	assert.equal(p.silver, 5 * GOODS[7].sell);
	assert.deepEqual(p.bought.map(b => [b.item, b.n]), [['Copper Ingot', 100]]);
	assert.equal(p.trades, 56);
	assert.ok(Math.abs(p.parleyUsed - 56 * parley.perTrade) < 1e-6);
	assert.ok(p.keptWorth > 0, 'what is left over is priced');
	assert.deepEqual(p.order, [c]);
});

test('a fast run fills the hold to the limit without a wharf call: the top’s attempts first, then extras from the top down', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const p = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast' });
	const islands = p.stops.filter(s => s.npcId);
	assert.equal(p.stops.length, islands.length + 1, 'one wharf call: the sale');
	assert.ok(p.stops.every(s => s.weightAfter <= hold.free + 1e-6), 'never past the limit, so never slower');
	assert.ok(p.weightPeak > hold.free - 2000, 'and the hold is filled');
	// The top three rungs at what the top can use, the [Level 3] and
	// [Level 4] rungs with extras whose leftovers sell, the foot with no
	// more than feeds them: a leftover [Level 2] sells for nothing.
	assert.deepEqual(islands.map(s => s.times), [2, 2, 4, 6, 6, 5, 5]);
	assert.equal(p.silver, 5 * GOODS[7].sell);
	assert.deepEqual(p.bought.map(b => [b.item, b.n]), [['Copper Ingot', 20]]);
	assert.ok(p.kept.some(s => levelOf(s.item) === 4), 'the extra [Level 4]s come home');
	// A tighter hull takes only what the top can use -- and the sixth
	// attempt at the [Level 5] rung, which weighs nothing extra and
	// leaves a [Level 5] worth ten million.
	const tight = chainRun({ chosen: [c], stock: {}, hold: { free: 14200, deal: 17750, max: 24140 }, parley, npcById, start: ports[0], stashes, pace: 'fast' });
	assert.deepEqual(tight.stops.filter(s => s.npcId).map(s => s.times), [1, 1, 2, 3, 6, 5, 5]);
	assert.equal(tight.silver, 5 * GOODS[7].sell);
	// Goods aboard shorten the buying: four [Level 4]s aboard mean one
	// fewer attempt at the rung that pays them.
	const q = chainRun({ chosen: [c], stock: { '[Level 4] Amethyst Fragment': 4 }, hold: { free: 14200, deal: 17750, max: 24140 }, parley, npcById, start: ports[0], stashes, pace: 'fast' });
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
	const small = { free: 8000, deal: 10000, max: 13600 };
	const full = chainRun({ chosen: [c], stock: {}, hold: small, parley, npcById, start: ports[0] });
	const fast = chainRun({ chosen: [c], stock: {}, hold: small, parley, npcById, start: ports[0], pace: 'fast' });
	assert.ok(full.stops.every(s => s.npcId && s.weightAfter <= small.deal + 1e-6), 'never over the ceiling, since nothing could be left ashore');
	assert.ok(fast.stops.every(s => s.npcId && s.weightAfter <= small.free + 1e-6), 'never over the limit');
	assert.ok(fast.stops.length > full.stops.length, 'every attempt at the foot leaves no room to climb');
	assert.ok(fast.stops.some(s => s.npc === 'Tarin'));
});

test('the shortest way round: every chain climbed at once, each rung after the one beneath it, a shorter route than chain after chain, and the hold shared out so a fast run still fits', () => {
	const chosen = chains(data).filter(c => c.from === 'land' && c.top === 7).slice(0, 3);
	const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	const length = p => { let L = 0, at = ports[0]; for (const s of p.stops) { const q = s.wharf || npcById.get(s.npcId); L += dist(at, q); at = q; } return L + dist(at, ports[0]); };
	for (const pace of ['full', 'fast']) {
		const byChain = chainRun({ chosen, hold, parley, npcById, start: ports[0], stashes, pace, orders: { ...PLAIN_ORDERS, way: 'chain' } });
		const bySea = chainRun({ chosen, hold, parley, npcById, start: ports[0], stashes, pace, orders: { ...PLAIN_ORDERS, way: 'sea' } });
		const isles = bySea.stops.filter(s => s.npcId);
		// Every chain's rungs in climbing order, and no island dealt twice.
		for (let k = 0; k < chosen.length; k++) {
			const mine = isles.filter(s => s.chain === k).map(s => s.npcId);
			const rungs = bySea.order[k].rungs.map(r => r.npcId).filter(id => mine.includes(id));
			assert.deepEqual(mine, rungs, `${pace}: chain ${k} climbs in order`);
		}
		assert.equal(new Set(isles.map(s => s.npcId)).size, isles.length);
		// Interleaved: the chain changes hands more often than a chain-after-chain run does.
		const swaps = p => p.stops.filter(s => s.npcId).reduce((n, s, i, a) => n + (i && a[i - 1].chain !== s.chain ? 1 : 0), 0);
		assert.ok(swaps(bySea) > swaps(byChain), `${pace}: ${swaps(bySea)} changes of chain against ${swaps(byChain)}`);
		assert.ok(length(bySea) < length(byChain) * 0.9, `${pace}: ${Math.round(length(bySea))} against ${Math.round(length(byChain))}`);
		// The hold: never over the barter ceiling on a full run, never over the limit on a fast one, and something sold.
		const ceiling = pace === 'fast' ? hold.free : hold.deal;
		for (const s of bySea.stops) if (s.npcId) assert.ok(s.weightAfter - s.times * (s.recvMax * GOODS[levelOf(s.item)].weight - (levelOf(s.give) ? s.giveN * GOODS[levelOf(s.give)].weight : 0)) <= ceiling + 1e-6, `${pace}: ${s.npc} starts under the ceiling`);
		if (pace === 'fast') assert.ok(bySea.weightPeak <= hold.free + 1e-6, `${pace}: peak ${bySea.weightPeak}`);
		assert.ok(bySea.silver > 0, `${pace}: sells`);
	}
});

test('a steady run is every attempt under the limit itself: never heavier than a loaded one, never fewer wharf calls', () => {
	const all = chains(data);
	const chosen = all.filter(c => c.from === 'land' && c.top === 7).slice(0, 3);
	const run = pace => chainRun({ chosen, hold, parley, npcById, start: ports.find(p => p.name === 'Velia'), stashes, pace, orders: { ...PLAIN_ORDERS, way: 'sea' } });
	const loaded = run('full'), steady = run('steady'), fast = run('fast');
	assert.ok(steady.trades > fast.trades, 'every attempt, not the hold’s share');
	assert.ok(steady.weightPeak <= loaded.weightPeak, 'the limit, not the barter ceiling');
	// One exchange may end past the limit before the call that brings it back; never a whole rung's worth.
	assert.ok(steady.weightPeak <= hold.free + 3 * GOODS[7].weight, `${steady.weightPeak} is past the limit by more than one exchange`);
	assert.ok(steady.stops.filter(s => s.wharf).length >= loaded.stops.filter(s => s.wharf).length, 'the surplus is left ashore oftener');
	assert.ok(fast.weightPeak <= hold.free, 'a fast run never slows');
});

import { tailOf } from '../js/barter-chains.js';

test('a good held part-way up a chain from the shore is one climb with it: the islands deal once, the good is loaded all the same', () => {
	// A land chain, and the chain from its own [Level 3] good sitting at
	// the harbour: the second climbs the tail of the first.
	const land = chains(data).find(c => c.from === 'land' && c.top === 7 && c.rungs.length >= 5);
	const third = land.rungs[2].item;
	const dock = { [third]: 3 };
	const all = chains(data, {}, dock);
	const held = all.find(c => c.from === 'dock' && c.item === third && tailOf(land, c));
	assert.ok(held, 'no chain from the good held climbs the tail of the land chain');
	assert.equal(tailOf(held, land), false);
	const start = ports.find(p => p.name === 'Velia');
	const opts = { dock, hold, parley, npcById, start, stashes, pace: 'full', orders: PLAIN_ORDERS };
	const both = chainRun({ ...opts, chosen: [land, held] });
	const alone = chainRun({ ...opts, chosen: [land] });
	// Both ticked: the same islands as the land chain alone, each once,
	// and no chain tag past the one climb; the good held is loaded.
	const isles = run => run.stops.filter(s => s.npcId).map(s => s.npcId);
	assert.deepEqual(isles(both), isles(alone));
	assert.equal(new Set(isles(both)).size, isles(both).length);
	assert.equal(both.order.length, 1);
	assert.deepEqual(both.loaded, [{ item: third, n: 3 }]);
	assert.deepEqual(alone.loaded, []);
	// The load feeds the rungs above it: the run makes at least what the
	// land chain alone does.
	assert.ok(both.silver >= alone.silver);
});

test('a ceiling cuts every climb where the stock ends: nothing above it, and a good already there is not fuel', () => {
	const four = '[Level 4] Amethyst Fragment';
	const whole = chains(data, { [four]: 4 });
	assert.ok(whole.some(c => c.top === 7), 'the board reaches a [Level 7] when nothing stops it');
	assert.ok(whole.some(c => c.from === 'hold' && c.item === four), 'the [Level 4] held climbs when nothing stops it');
	for (const ceiling of [1, 2, 3, 4]) {
		const cut = chains(data, { [four]: 4 }, {}, null, ceiling);
		assert.ok(cut.length > 0, `ceiling ${ceiling}: the board still climbs`);
		for (const c of cut) {
			assert.ok(c.top <= ceiling, `ceiling ${ceiling}: ${c.rungs[0].npc} stops at ${c.top}`);
			assert.ok(levelOf(c.item) === null || levelOf(c.item) < ceiling, `ceiling ${ceiling}: ${c.item} is stock, not fuel`);
			// Cut or whole, a chain is still a climb a rung at a time.
			c.rungs.forEach((r, i) => { if (i) assert.equal(r.give, c.rungs[i - 1].item); });
		}
		// Two climbs that differed only above the ceiling are one chain.
		assert.equal(new Set(cut.map(c => c.id)).size, cut.length, `ceiling ${ceiling}: no chain listed twice`);
		assert.equal(cut.filter(c => c.from === 'hold' && c.item === four).length, ceiling > 4 ? 1 : 0);
	}
	// The land chains are all still there, just shorter.
	const land = c => c.from === 'land';
	assert.equal(chains(data, {}, {}, null, 1).filter(land).length, whole.filter(land).map(c => c.rungs[0].npcId).filter((x, i, a) => a.indexOf(x) === i).length);
});
