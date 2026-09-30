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
import { routeLength } from '../js/barter-route.js';
import { fillOf } from '../js/barter-optimizer.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = useGame(await import('../js/barter_game.js')).combos;
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
	assert.equal(new Set(all.filter(c => c.from === 'land' && levelOf(c.rungs[0].item) === 1).map(c => c.rungs[0].npcId)).size, 10);
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

test('two chains sail one after the other, in the order that makes the shorter run, and an island crossed twice deals once', () => {
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
	// Renilu is the nearer to Velia, and Cazio first is the shorter run
	// by water: the order is the run's length, not the first leg's.
	const isle = r => npcById.get(r.npcId);
	const L = cs => routeLength([ports[0], ...cs.flatMap(c => c.rungs.map(isle)), stashes[0]]);
	assert.ok(L([land, far]) < L([far, land]), 'Cazio first is the shorter way round');
	assert.deepEqual(two.order.map(c => c.rungs[0].npc), ['Cazio', 'Renilu']);
	assert.equal(two.stops.filter(s => s.npcId)[0].npc, 'Cazio', 'and it is sailed first');
	assert.ok(two.stops.filter(s => s.npcId).every(s => two.order[s.chain].rungs.some(r => r.npcId === s.npcId)), 'each island stop is tagged with its chain');
	// The first chain's [Level 7]s are sold on the way, at the wharf its
	// top all but passes -- Lema Island lies off Iliya -- before the
	// second chain begins, not carried the whole way.
	const firstSale = two.stops.find(s => s.sale);
	assert.ok(firstSale.wharf && firstSale.chain === 0 && firstSale.sale.n === 5 && firstSale.wharf.at === 'Iliya Island');
	assert.ok(two.stops.indexOf(firstSale) < two.stops.findIndex(s => s.npc === 'Renilu'));
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
import { useGame } from '../js/barter-layouts.js';

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

test('the shore goods can come from a pile the sailor keeps: no more chains than it covers, nothing bought', () => {
	const c = chains(data).find(x => x.from === 'land' && x.top >= 3);
	const orders = { ...PLAIN_ORDERS, landFrom: 'stock', pace: 'full' };
	const opts = { chosen: [c], hold, parley, npcById, start: ports.find(p => p.name === 'Velia'), stashes, pace: 'full', orders };
	// The pile covers two attempts at the first rung and no more.
	const first = c.rungs[0];
	const land = new Map([[c.item, first.giveN * 2]]);
	const run = chainRun({ ...opts, land });
	assert.deepEqual(run.bought, [], 'nothing is bought when the pile is what the run spends');
	assert.equal(run.cost, 0);
	assert.equal(run.taken.length, 1);
	assert.equal(run.taken[0].item, c.item);
	assert.equal(run.taken[0].n, first.giveN * 2);
	assert.equal(run.taken[0].left, 0);
	assert.equal(run.stops.find(s => s.npcId === first.npcId).times, 2, 'the pile is the cap at the first rung');
	// An empty pile is no run at all, where buying it would have been one.
	const none = chainRun({ ...opts, land: new Map() });
	assert.equal(none.trades, 0);
	assert.ok(chainRun({ ...opts, orders: { ...orders, landFrom: 'buy' } }).trades > 0);
});

test('only what the first island will deal with is loaded, however much waits ashore', () => {
	// A good the board takes, with far more of it in the harbour's
	// storage than any island will deal with in a day.
	const ladder = chains(data).find(c => c.from === 'land' && c.rungs.length >= 3);
	const good = ladder.rungs[0].item;
	const dock = { [good]: 400 };
	const c = chains(data, {}, dock).find(x => x.from === 'dock' && x.item === good);
	const first = c.rungs[0];
	const room = first.tries * first.giveN;
	assert.ok(room < 400, 'the fixture is only a fixture if the storage holds more than the island wants');
	// The row promises what the run will do, rather than the whole pile.
	assert.equal(c.load, room);
	const start = ports.find(p => p.name === 'Velia');
	const run = chainRun({ chosen: [c], dock, hold, parley, npcById, start, stashes, pace: 'full', orders: PLAIN_ORDERS });
	assert.deepEqual(run.loaded, [{ item: good, n: room }], 'and the run loads that and no more');
	// The hold is a hold again: four hundred of a [Level 4] weighed
	// four hundred thousand LT on a hull that carries twenty-three.
	assert.ok(run.weightStart <= room * GOODS[levelOf(good)].weight);
	assert.ok(run.weightStart <= hold.max, `${run.weightStart} LT aboard before casting off`);
	// And nothing is carried out of the harbour only to be put straight
	// back in it at the first wharf call.
	const dumpedFirst = (run.stops[0] && run.stops[0].dropped) || [];
	assert.ok(!dumpedFirst.some(d => d.item === good), 'what was loaded is what the run has a use for');
});

test('a floor is about the pile, not about the hold: what is kept ashore counts', () => {
	const ladder = chains(data).find(c => c.from === 'land' && c.rungs.length >= 3);
	const good = ladder.rungs[0].item;
	const lv = levelOf(good);
	const dock = { [good]: 40 };
	const c = chains(data, {}, dock).find(x => x.from === 'dock' && x.item === good);
	const start = ports.find(p => p.name === 'Velia');
	const orders = { ...PLAIN_ORDERS, floors: { [lv]: 10 }, pace: 'full' };
	const opts = { chosen: [c], dock, hold, parley, npcById, start, stashes, pace: 'full', orders };
	// Three hundred of it kept ashore: the floor of ten is met many
	// times over, so the run spends what it loads.
	const plenty = chainRun({ ...opts, owned: { [good]: 300 } });
	assert.ok(plenty.trades > 0, 'a floor already met ashore does not stop the run');
	// Ten of it in all, and a floor of ten: none of it may be spent, and
	// the old reckoning -- the floor against the hold alone -- would
	// have had it spend everything above ten *of what it carried*.
	const tight = chainRun({ ...opts, dock: { [good]: 10 }, owned: { [good]: 10 } });
	assert.equal(tight.trades, 0, 'the last ten are the stock, wherever they are');
	assert.deepEqual(tight.loaded, [], 'and there is no sense in loading them');
});

test('a run for Crow Coins climbs to [Level 4] and cashes it at an island that pays in coins', () => {
	// The coin islands are on every board and take a [Level 4] and
	// nothing else, so they are a top like a [Level 7] is -- and they are
	// only offered when the run is for coins.
	assert.equal(chains(data).filter(c => c.pays === 'coin').length, 0, 'a silver run is never offered a coin island');
	const all = chains(data, {}, {}, null, 4, true);
	const coin = all.filter(c => c.pays === 'coin');
	assert.ok(coin.length > 0, 'the board has coin islands on it');
	for (const c of coin) {
		const last = c.rungs[c.rungs.length - 1];
		assert.equal(last.item, 'Crow Coin');
		assert.equal(levelOf(last.give), 4, 'a coin island takes a [Level 4]');
		assert.ok(last.recvMax > 1, 'and pays in coins rather than in the codex’s noise');
		assert.equal(c.top, 4, 'the chain is named by the climb it asks for');
		// Every rung below is a climb a rung at a time, as ever.
		c.rungs.forEach((r, i) => { if (i) assert.equal(r.give, c.rungs[i - 1].item); });
	}
	// A ceiling of four does not stop a chain cashing its [Level 4]s in:
	// selling a good for coins is not climbing.
	assert.ok(coin.some(c => c.rungs.length >= 4), 'a whole climb from the shore ends at the coin island');
});

test('the coins a run pays are counted, and they are not cargo', () => {
	const coin = chains(data, {}, {}, null, 4, true).filter(c => c.pays === 'coin').slice(0, 2);
	const start = ports.find(p => p.name === 'Velia');
	const run = chainRun({ chosen: coin, hold, parley, npcById, start, stashes, pace: 'full', orders: PLAIN_ORDERS });
	assert.ok(run.coins > 0, 'the islands paid');
	assert.ok(run.coinsMax >= run.coins, 'counted at the least, and at the most it might be');
	assert.equal(run.silver, 0, 'a coin run sells nothing');
	assert.ok(!run.kept.some(k => k.item === 'Crow Coin'), 'coins are not carried home like a good');
	assert.ok(!run.stashed.some(k => k.item === 'Crow Coin'), 'nor left at a wharf');
	// The coins are exactly what the islands stated, at the least.
	const cashed = run.stops.filter(s => s.item === 'Crow Coin');
	assert.equal(run.coins, cashed.reduce((a, s) => a + s.times * s.recvMin, 0));
});

/* ------------------------------------------------------------------ *
 * Why a chain stops short
 * ------------------------------------------------------------------ */

test('a chain that does not get to the top says where it stopped and what stopped it', () => {
	// A hold with almost nothing free is the commonest reason a ticked
	// chain climbs one rung of three and the coins never arrive. The run
	// used to do this silently -- the only sign was a smaller stop count
	// on a chip -- so what is under test is that it is recorded at all.
	const coin = chains(data, {}, {}, null, 4, true).filter(c => c.pays === 'coin' && c.rungs.length >= 3).slice(0, 2);
	assert.ok(coin.length, 'the board has a climb to cash in');
	const start = ports.find(p => p.name === 'Velia');
	const tight = { free: 2600, deal: 3250, max: 4420 };
	const run = chainRun({ chosen: coin, hold: tight, parley, npcById, start, stashes: [], pace: 'fast', orders: PLAIN_ORDERS });

	assert.ok(run.cut.length > 0, 'a chain fell short and the run knows it');
	for (const c of run.cut) {
		const chain = run.order[c.chain];
		assert.ok(chain, 'the cut names a chain of this run');
		assert.ok(['hold', 'share', 'over', 'parley', 'nothing', 'dealt'].includes(c.why));
		assert.ok(c.of === chain.rungs.length, 'and how many islands the chain wanted');
		assert.ok(c.done < c.of, 'a cut chain did not do all of them');
		// The top rung never dealt -- that is what being cut means.
		assert.ok(!run.stops.some(s => s.chain === c.chain && s.npcId === chain.rungs[chain.rungs.length - 1].npcId));
		if (c.why === 'hold') {
			assert.ok(c.need > 0, 'what the next trade would put on');
			assert.ok(c.need > c.free, 'and it does not fit in what is left');
		}
	}
	// Nothing that got all the way up is in the list.
	for (const [k, chain] of run.order.entries()) {
		const top = chain.rungs[chain.rungs.length - 1];
		if (run.stops.some(s => s.chain === k && s.npcId === top.npcId)) {
			assert.ok(!run.cut.some(c => c.chain === k), 'a chain that reached its top is not cut');
		}
	}
});

test('a hold with room for everything cuts nothing', () => {
	const coin = chains(data, {}, {}, null, 4, true).filter(c => c.pays === 'coin').slice(0, 1);
	const start = ports.find(p => p.name === 'Velia');
	const roomy = { free: 200000, deal: 250000, max: 300000 };
	const run = chainRun({ chosen: coin, hold: roomy, parley, npcById, start, stashes, pace: 'full', orders: PLAIN_ORDERS });
	assert.deepEqual(run.cut, [], 'nothing to report when every chain climbs');
});

test('an island another chain reached first is named as the reason, not the hold', () => {
	// Two chains that cross: the second one's rung at the shared island
	// deals nothing, because an island deals once a run.
	const all = chains(data, {}, {}, null, 4, true);
	let pair = null;
	for (const a of all) {
		for (const b of all) {
			if (a === b || a.id === b.id) continue;
			const shared = a.rungs.some(r => b.rungs[0] && r.npcId === b.rungs[0].npcId);
			if (shared && b.rungs.length > 1) { pair = [a, b]; break; }
		}
		if (pair) break;
	}
	if (!pair) return;   // no crossing pair on this layout; nothing to assert
	const start = ports.find(p => p.name === 'Velia');
	const roomy = { free: 200000, deal: 250000, max: 300000 };
	const run = chainRun({ chosen: pair, hold: roomy, parley, npcById, start, stashes, pace: 'full', orders: PLAIN_ORDERS });
	const dealt = run.cut.filter(c => c.why === 'dealt');
	for (const c of dealt) {
		assert.ok(run.stops.some(s => s.npcId === c.npcId && s.chain !== c.chain), 'somebody else did get there');
	}
});

test('the exact case: a climb cut mid-way by the weight of its own next trade', () => {
	// Three chains sailed as one route through every rung -- the way the
	// tab sails them -- and a hold with room for the climb but not for
	// all three at once where the route happens to put them. The share
	// of the hold is worked out chain after chain while the route
	// interleaves them, so a climb that fits in the reckoning can meet
	// the limit in the middle of the sea. That is the moment a sailor
	// sees a three-island chain do one island, and it is exactly what
	// the run now has to be able to say.
	const sea = { ...PLAIN_ORDERS, way: 'sea' };
	const three = chains(data, {}, {}, null, 4, true).filter(c => c.pays === 'coin' && c.rungs.length >= 3);
	const to = at => three.find(c => npcById.get(c.rungs[c.rungs.length - 1].npcId).at === at);
	const coin = [to("Pakio's Combat Raft"), to("Old Moon Guild's Carrack"), to("Crow's Nest")];
	const start = ports.find(p => p.name === 'Velia');
	const run = chainRun({ chosen: coin, hold: { free: 10000, deal: 12500, max: 16000 }, parley, npcById, start, stashes: [], pace: 'fast', orders: sea });

	const byWeight = run.cut.filter(c => c.why === 'hold');
	assert.ok(byWeight.length, 'a chain met the limit part-way up');
	for (const c of byWeight) {
		assert.ok(c.need > c.free, `${c.need} LT does not fit in ${c.free}`);
		assert.ok(c.done >= 0 && c.done < c.of, 'it got part of the way, not all of it');
		assert.ok(c.npc, 'and the island it stopped at is named');
	}
	// Every chain the run cut is one the sailor ticked.
	for (const c of run.cut) assert.ok(coin[c.chain], 'the cut points at a ticked chain');
});

/* ------------------------------------------------------------------ *
 * what the Market has listed
 * ------------------------------------------------------------------ */

test('a run buys no more of a land good than the Market has listed', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const each = c.rungs[0].giveN;                      // ten Copper Ingots a trade
	const free = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast' });
	assert.deepEqual(free.bought.map(b => [b.item, b.n]), [['Copper Ingot', 20]]);
	// one trade's worth listed: one trade, and the row says what there was
	const tight = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast', prices: { 'Copper Ingot': { each: 900, how: 'market', stock: each } } });
	assert.deepEqual(tight.bought.map(b => [b.item, b.n, b.stock]), [['Copper Ingot', each, each]]);
	// plenty listed: the run is the run it always was
	const plenty = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast', prices: { 'Copper Ingot': { each: 900, how: 'market', stock: 50000 } } });
	assert.deepEqual(plenty.bought.map(b => [b.item, b.n]), [['Copper Ingot', 20]]);
	assert.equal(plenty.silver, free.silver);
});

test('a chain that starts on a good nobody is selling does not start, and says it was the Market', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const none = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast', prices: { 'Copper Ingot': { each: 900, how: 'market', stock: 0 } }, land: new Map([['Copper Ingot', 300]]) });
	assert.deepEqual(none.bought, []);
	assert.equal(none.silver, 0);
	assert.equal(none.cut.length, 1);
	const cut = none.cut[0];
	assert.equal(cut.why, 'market');
	assert.equal(cut.good, 'Copper Ingot');
	assert.equal(cut.listed, 0);
	assert.equal(cut.want, c.rungs[0].giveN);
	assert.equal(cut.held, 300, 'and that the sailor keeps some, so the orders can take it from there');
	// fewer than one trade takes is none, for a trade
	const few = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast', prices: { 'Copper Ingot': { each: 900, how: 'market', stock: 3 } } });
	assert.equal(few.cut[0].why, 'market');
	assert.equal(few.cut[0].listed, 3);
});

test('a count nobody has holds nothing back: made at home, a gold bar, a Market that did not say', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	for (const p of [{ each: 0, how: 'made' }, { each: 1e7, how: 'fixed' }, { each: 0, how: 'unpriced' }, { each: 900, how: 'market', stock: null }, { each: 900, how: 'market' }]) {
		const run = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast', prices: { 'Copper Ingot': p } });
		assert.deepEqual(run.bought.map(b => [b.item, b.n]), [['Copper Ingot', 20]], p.how);
	}
});

test('a pile of the sailor\'s own is not the Market\'s to run out of', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const run = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes, pace: 'fast', orders: { ...PLAIN_ORDERS, landFrom: 'stock' }, land: new Map([['Copper Ingot', 300]]), prices: { 'Copper Ingot': { each: 900, how: 'market', stock: 0 } } });
	assert.deepEqual(run.bought, []);
	assert.ok(run.taken.some(t => t.item === 'Copper Ingot' && t.n > 0));
	assert.ok(run.silver > 0);
});

test('what is loaded is what the run hands over, not what the island offers', () => {
	// Sam's run: ten of a good loaded because the island offers ten
	// attempts, five traded because that was all the run could do, and
	// the other five carried out and "left in storage" at the wharf they
	// came from -- on a ship sailing over its limit for the privilege.
	// Here it is the Parley bar that halves the attempts.
	const ladder = chains(data).find(c => c.from === 'land' && c.rungs.length >= 3);
	const good = ladder.rungs[0].item;
	const dock = { [good]: 400 };
	const c = chains(data, {}, dock).find(x => x.from === 'dock' && x.item === good);
	const first = c.rungs[0];
	assert.ok(first.tries >= 4, 'an island with attempts to halve');
	const half = Math.floor(first.tries / 2);
	const start = ports.find(p => p.name === 'Velia');
	const thin = { bar: parley.perTrade * half, perTrade: parley.perTrade };
	const run = chainRun({ chosen: [c], dock, hold, parley: thin, npcById, start, stashes, pace: 'full', orders: PLAIN_ORDERS });
	const at = run.stops.find(s => s.npcId === first.npcId);
	assert.equal(at.times, half, 'the bar lets half the attempts in');
	assert.deepEqual(run.loaded, [{ item: good, n: half * first.giveN }], 'and only their goods are loaded');
	// Nothing of it rides out only to be put straight back.
	const back = [...run.stashed, ...run.kept].filter(g => g.item === good);
	assert.deepEqual(back, [], 'none of the start good comes home');
});

test('a [Level 4] aboard on a coin day is offered the island that cashes it', () => {
	// Oni at the pier: seven [Level 4]s in the hold, seven coin islands
	// wanting one each, and a board that offered climbs from his
	// [Level 3]s instead. The ceiling of a coin day is four, and a good
	// already at the ceiling was passed over before anything asked
	// whether an island would pay coins for it.
	const cashers = chains(data, {}, {}, null, 4, true).filter(c => c.pays === 'coin');
	assert.ok(cashers.length > 0, 'the board has coin islands');
	const good = cashers[0].rungs[cashers[0].rungs.length - 1].give;
	assert.equal(levelOf(good), 4);
	const mine = chains(data, { [good]: 1 }, {}, null, 4, true).filter(c => c.from === 'hold' && c.item === good);
	assert.ok(mine.length > 0, `${good} aboard finds its coin island`);
	for (const c of mine) {
		assert.equal(c.rungs.length, 1, 'one rung: it is handed over and that is all');
		assert.equal(c.pays, 'coin');
	}
	// And where the day is not for coins, a good at the ceiling still has
	// nowhere to go: the ceiling means what it meant.
	assert.deepEqual(chains(data, { [good]: 1 }, {}, null, 4, false).filter(c => c.from === 'hold'), []);
});

test('a later lot\'s goods wait in the harbour\'s storage until the ship calls back for them, and full-never-slower never ends a trade over the limit', () => {
	// Layout 34, sailed from Iliya with six Level 4-5 piles in its
	// storage: loaded all at once they filled the hold, the later chains
	// found no room, and their loads were then trimmed to "nothing left
	// to hand over" beside a storage full of it.
	const l34 = combos.find(c => c.id === '34');
	const d34 = boardData(l34, barterData, npcById);
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, "[Level 5] Statue's Tear": 3, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 36, '[Level 4] Bronze Candlestick': 18 };
	const chosen = chains(d34, {}, dock).filter(c => c.from === 'dock' && c.top === 7 && dock[c.item]);
	assert.ok(chosen.length >= 5, `the fixture ticks the dock's chains (${chosen.length})`);
	const start = ports.find(p => p.name === 'Iliya Island');
	const small = { free: 20889, deal: 26111, max: 35500 };
	const run = chainRun({ chosen, dock, hold: small, parley: { bar: 1000000, perTrade: 10512 }, npcById, start, stashes, pace: 'steady', orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7 } });
	assert.ok(run.lots.length > 1, 'more than the hold carries at once: lots');
	const calls = run.stops.filter(s => s.wharf && s.loads && s.loads.length);
	assert.ok(calls.length, 'a later lot loads at a call');
	assert.ok(calls.every(s => s.wharf.at === 'Iliya Island'), 'at the harbour its goods wait in');
	const loadedAll = new Map();
	for (const l of [...run.loaded, ...calls.flatMap(s => s.loads)]) loadedAll.set(l.item, (loadedAll.get(l.item) || 0) + l.n);
	for (const [item, n] of loadedAll) assert.ok(n <= dock[item], `${item}: ${n} loaded of ${dock[item]}`);
	assert.ok(!run.cut.some(c => c.why === 'nothing' && dock[c.give]), `no chain says "nothing to hand over" with its goods in storage: ${JSON.stringify(run.cut.map(c => [c.npc, c.why]))}`);
	assert.ok(run.weightStart <= small.free, `${run.weightStart} LT at the start`);
	for (const s of run.stops) assert.ok(s.weightAfter <= small.free + 1e-6, `${s.npc || s.wharf.at}: ${s.weightAfter} LT, never over the limit`);
	run.stops.forEach((s, i) => { if (i && s.wharf && run.stops[i - 1].wharf) assert.notEqual(s.wharf.at, run.stops[i - 1].wharf.at, 'one call a wharf, not two in a row'); });
});

test('a lot is weighed as the hold will be when it starts: the goods the lots before it climbed from are gone by then', () => {
	// Layout 34 again, two chains' goods already aboard and the rest in
	// Iliya's storage. Weighed with the first lot's goods still aboard,
	// every later pair of chains looked too heavy, and the run went back
	// to Iliya once a chain -- five lots where three carry it.
	const l34 = combos.find(c => c.id === '34');
	const d34 = boardData(l34, barterData, npcById);
	const stock = { "[Level 5] Statue's Tear": 3, '[Level 4] Old Chest with Gold Coins': 6 };
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 30, '[Level 4] Bronze Candlestick': 18 };
	const want = ['[Level 5] Supreme Gold Candlestick', '[Level 5] 102 Year Old Golden Herb', "[Level 5] Statue's Tear", '[Level 5] Golden Fish Scale', '[Level 4] Old Chest with Gold Coins', '[Level 4] Bronze Candlestick'];
	const all = chains(d34, stock, dock).filter(c => c.top === 7 && c.from !== 'land');
	const chosen = want.map(w => all.find(c => c.item === w)).filter(Boolean);
	assert.equal(chosen.length, 6);
	const small = { free: 20889, deal: 26111, max: 35500 };
	const run = chainRun({ chosen, stock, dock, hold: small, parley: { bar: 674128, perTrade: 10512 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes, pace: 'steady', orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7 } });
	assert.ok(run.lots.length <= 3, `${run.lots.length} lots: ${JSON.stringify(run.lots)}`);
	assert.ok(run.weightPeak <= small.free + 1e-6, `never over the limit: ${run.weightPeak}`);
	assert.equal(run.stops.filter(s => s.npcId).length, 14, 'every island of the six chains trades');
});

test('with the bag a second hold, a later lot\'s goods ride in it and come aboard at a wharf, never over the bag or the hold, and a sale is made only where a storage is', () => {
	// Layout 34 from Iliya with the dock's [Level 4]s and [Level 5]s: the
	// hold takes one chain's goods at a time, so without the bag the run
	// calls back at Iliya between lots.
	const l34 = combos.find(c => c.id === '34');
	const d34 = boardData(l34, barterData, npcById);
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, "[Level 5] Statue's Tear": 3, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 36, '[Level 4] Bronze Candlestick': 18 };
	const chosen = chains(d34, {}, dock).filter(c => c.from === 'dock' && c.top === 7 && dock[c.item]);
	const docks = wharves.filter(w => w.kind === 'wharf');
	const stores = [...stashes, ...['Port Epheria', 'Ancado Inner Harbor'].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at))];
	const base = { chosen, dock, parley: { bar: 1e7, perTrade: 10512 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes: stores, docks, orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7, pause: { isle: 30, call: 60 } } };
	const rate = r => r.net / r.hours;
	for (const [pace, hold] of [['fast', { free: 12000, deal: 12000, max: 20400 }], ['full', { free: 12000, deal: 15000, max: 20400 }]]) {
		const bag = { free: 8000 };
		const without = chainRun({ ...base, pace, hold });
		const run = chainRun({ ...base, pace, hold, bag });
		assert.ok(rate(run) >= rate(without) - 1e-6, `${pace}: never worse an hour with the bag (${rate(run)} against ${rate(without)})`);
		// The bag is weighed on its own: whatever went in, it never holds
		// more than it takes, and the hold never counts it.
		const inBag = new Map((run.bagLoaded || []).map(l => [l.item, l.n]));
		const weigh = m => [...m].reduce((a, [item, n]) => a + n * GOODS[levelOf(item)].weight, 0);
		assert.ok(weigh(inBag) <= bag.free + 1e-6);
		for (const s of run.stops) {
			for (const d of s.toBag || []) inBag.set(d.item, (inBag.get(d.item) || 0) + d.n);
			for (const d of s.fromBag || []) { assert.ok((inBag.get(d.item) || 0) >= d.n - 1e-6, `${d.item} comes out of the bag only once it went in`); inBag.set(d.item, inBag.get(d.item) - d.n); }
			assert.ok(weigh(inBag) <= bag.free + 1e-6, `${pace}: the bag at ${weigh(inBag)} LT`);
			if (s.sale) assert.ok(stores.some(w => w.at === s.wharf.at), `a sale at ${s.wharf.at}, which has a storage`);
			if (s.npcId && pace === 'fast') assert.ok(s.weightAfter <= hold.free + 1e-6, 'a fast run never ends a trade over the limit');
		}
	}
	// The fast run is the case the bag was asked for: a later lot's goods
	// ride out in it and come aboard where that lot begins, not at a call
	// back to Iliya.
	const fast = chainRun({ ...base, pace: 'fast', hold: { free: 12000, deal: 12000, max: 20400 }, bag: { free: 8000 } });
	const out = fast.stops.filter(s => s.fromBag && s.fromBag.some(l => l.lot > 0));
	assert.ok(fast.bagLoaded.length && out.length, `goods loaded into the bag and taken out for their lot: ${JSON.stringify(fast.bagLoaded)}`);
	for (const s of out) for (const l of s.fromBag) assert.ok(!(s.loads || []).some(x => x.item === l.item && x.lot === l.lot), 'the lot is not also loaded from storage');
});

test('on a full run a good another chain takes later goes into the bag when the hold is too heavy, at any wharf, and comes out before the island that takes it', () => {
	const l34 = combos.find(c => c.id === '34');
	const d34 = boardData(l34, barterData, npcById);
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, "[Level 5] Statue's Tear": 3, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 36, '[Level 4] Bronze Candlestick': 18 };
	const chosen = chains(d34, {}, dock).filter(c => c.from === 'dock' && c.top === 7 && dock[c.item]);
	const docks = wharves.filter(w => w.kind === 'wharf');
	const run = chainRun({ chosen, dock, hold: { free: 20000, deal: 25000, max: 34000 }, parley: { bar: 1e7, perTrade: 10512 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes, docks, pace: 'full', orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7, pause: { isle: 30, call: 60 } }, bag: { free: 8000 } });
	const parked = run.stops.findIndex(s => (s.toBag || []).length);
	assert.ok(parked >= 0, 'something went into the bag on the way');
	const item = run.stops[parked].toBag[0].item;
	const back = run.stops.findIndex((s, i) => i > parked && (s.fromBag || []).some(l => l.item === item));
	const uses = run.stops.findIndex((s, i) => i > parked && s.npcId && s.give === item);
	assert.ok(back > parked, `${item} comes out of the bag again`);
	if (uses >= 0) assert.ok(back < uses, `${item} is aboard before the island that takes it`);
	assert.ok(run.stops.some(s => (s.toBag || s.fromBag) && !stashes.some(w => w.at === s.wharf.at)), 'the bag is used at a wharf with no storage too');
});

test('a good takes one slot in the bag however many of it, and the bag holds no more kinds than it has slots', () => {
	const l34 = combos.find(c => c.id === '34');
	const d34 = boardData(l34, barterData, npcById);
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, "[Level 5] Statue's Tear": 3, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 36, '[Level 4] Bronze Candlestick': 18 };
	const chosen = chains(d34, {}, dock).filter(c => c.from === 'dock' && c.top === 7 && dock[c.item]);
	const docks = wharves.filter(w => w.kind === 'wharf');
	const kindsAtMost = run => {
		const inBag = new Map((run.bagLoaded || []).map(l => [l.item, l.n]));
		let most = [...inBag.values()].filter(n => n > 1e-9).length;
		for (const s of run.stops) {
			for (const d of s.toBag || []) inBag.set(d.item, (inBag.get(d.item) || 0) + d.n);
			for (const d of s.fromBag || []) inBag.set(d.item, inBag.get(d.item) - d.n);
			most = Math.max(most, [...inBag.values()].filter(n => n > 1e-9).length);
		}
		return most;
	};
	for (const pace of ['fast', 'full']) {
		const opts = { chosen, dock, hold: { free: 12000, deal: pace === 'full' ? 15000 : 12000, max: 20400 }, parley: { bar: 1e7, perTrade: 10512 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes, docks, pace, orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7, pause: { isle: 30, call: 60 } } };
		const roomy = chainRun({ ...opts, bag: { free: 8000, slots: 58 } });
		const one = chainRun({ ...opts, bag: { free: 8000, slots: 1 } });
		const none = chainRun({ ...opts, bag: { free: 8000, slots: 0 } });
		assert.ok(kindsAtMost(one) <= 1, `${pace}: one slot, one kind (${kindsAtMost(one)})`);
		assert.equal(kindsAtMost(none), 0, `${pace}: no slot, nothing in the bag`);
		assert.ok(kindsAtMost(roomy) >= kindsAtMost(one));
	}
});

test('a run asked to use the bag that does not says why', () => {
	const l34 = combos.find(c => c.id === '34');
	const d34 = boardData(l34, barterData, npcById);
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, "[Level 5] Statue's Tear": 3, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 36, '[Level 4] Bronze Candlestick': 18 };
	const chosen = chains(d34, {}, dock).filter(c => c.from === 'dock' && c.top === 7 && dock[c.item]);
	const docks = wharves.filter(w => w.kind === 'wharf');
	const opts = { chosen, dock, parley: { bar: 1e7, perTrade: 10512 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes, docks, orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7, pause: { isle: 30, call: 60 } } };
	// Every later lot is heavier than a bag of 50 LT.
	const small = chainRun({ ...opts, pace: 'fast', hold: { free: 20000, deal: 20000, max: 34000 }, bag: { free: 50, slots: 58 } });
	assert.equal(small.bagNote && small.bagNote.why, 'small');
	// One chain, one lot: nothing to carry for later, and room in the hold.
	const one = chainRun({ ...opts, chosen: chosen.slice(0, 1), pace: 'fast', hold: { free: 40000, deal: 40000, max: 68000 }, bag: { free: 8000, slots: 58 } });
	assert.equal(one.bagNote && one.bagNote.why, 'unneeded');
	// A run that does use it says nothing.
	const used = chainRun({ ...opts, pace: 'fast', hold: { free: 12000, deal: 12000, max: 20400 }, bag: { free: 8000, slots: 58 } });
	assert.ok(used.bagLoaded.length && !used.bagNote);
});

// Layout 34 from Iliya with six Level 4-5 piles in its storage: more
// than the hold carries at once, so the run is laid in trips.
const tripsFixture = () => {
	const l34 = combos.find(c => c.id === '34');
	const d34 = boardData(l34, barterData, npcById);
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, "[Level 5] Statue's Tear": 3, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 36, '[Level 4] Bronze Candlestick': 18 };
	const chosen = chains(d34, {}, dock).filter(c => c.from === 'dock' && c.top === 7 && dock[c.item]);
	const base = { chosen, dock, hold: { free: 20889, deal: 26111, max: 35500 }, parley: { bar: 1000000, perTrade: 10512 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes, pace: 'steady', orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7 } };
	return { d34, dock, chosen, base };
};
const loadsOf = run => {
	const m = new Map();
	for (const l of [...run.loaded, ...run.stops.flatMap(s => s.loads || [])]) m.set(l.item, (m.get(l.item) || 0) + l.n);
	return m;
};

test('a stop moved sooner stays in its trip: the next trip\'s goods are loaded once, and the run keeps its trades', () => {
	const { dock, base } = tripsFixture();
	const run = chainRun(base);
	assert.ok(run.lots.length > 1);
	const first = run.rungs.find(x => x.lot === 1);
	const moved = chainRun({ ...base, nudge: { [first.r.npcId]: -1 } });
	const lots = moved.rungs.map(x => x.lot);
	assert.deepEqual(lots, [...lots].sort((a, b) => a - b), `the trips stay in order: ${lots.join('')}`);
	for (const [item, n] of loadsOf(moved)) assert.ok(n <= dock[item], `${item}: ${n} loaded of ${dock[item]}`);
	assert.ok(moved.trades >= run.trades * 0.9, `${moved.trades} trades against ${run.trades}`);
});

test('a later trip\'s goods come aboard at a call before that trip, never after its first island', () => {
	const { base } = tripsFixture();
	const run = chainRun(base);
	for (let lot = 1; lot < run.lots.length; lot++) {
		const at = run.stops.findIndex(s => (s.loads || []).some(l => l.lot === lot));
		const begins = run.stops.findIndex(s => s.npcId && run.rungs.some(x => x.lot === lot && x.r.npcId === s.npcId));
		if (at >= 0 && begins >= 0) assert.ok(at < begins, `trip ${lot + 1}: loaded at stop ${at + 1}, begins at ${begins + 1}`);
	}
});

test('what a stock run fills counts the goods loaded on the way as the stock\'s already', () => {
	const { base } = tripsFixture();
	const run = chainRun(base);
	assert.ok(run.stops.some(s => (s.loads || []).length), 'the fixture loads at a call');
	const targetOf = name => (levelOf(name) ? 1000 : 0);
	const stripped = { ...run, stops: run.stops.map(s => ({ ...s, loads: [] })) };
	assert.ok(fillOf(run, { targetOf }) < fillOf(stripped, { targetOf }), 'a good loaded at a call is not counted as filled');
});

test('with no Parley there is no trade, and every chain says the Parley stopped it', () => {
	const { base } = tripsFixture();
	const dry = chainRun({ ...base, parley: { bar: 0, perTrade: 10512 } });
	assert.equal(dry.trades, 0);
	assert.ok(dry.cut.length && dry.cut.every(c => c.why === 'parley'), JSON.stringify(dry.cut.map(c => c.why)));
});

test('chain after chain, a hold with room for every good takes them all at the start: no call home between chains', () => {
	const { chosen, base } = tripsFixture();
	const run = chainRun({ ...base, chosen: chosen.slice(0, 3), hold: { free: 40000, deal: 50000, max: 68000 }, orders: { ...PLAIN_ORDERS, way: 'chain', sell: 7 } });
	assert.equal(run.stops.filter(s => s.wharf && (s.loads || []).length).length, 0);
	assert.ok(run.loaded.length >= 3);
});

test('goods moved from the hold into the bag at the start are said apart from what the bag is loaded with from a storage', () => {
	const { d34 } = tripsFixture();
	const stock = { '[Level 4] Old Chest with Gold Coins': 36, '[Level 5] Supreme Gold Candlestick': 6, '[Level 4] Bronze Candlestick': 18 };
	const chosen = chains(d34, stock, {}).filter(c => c.from === 'hold' && c.top === 7);
	const docks = wharves.filter(w => w.kind === 'wharf');
	const run = chainRun({ chosen, stock, hold: { free: 8000, deal: 10000, max: 13600 }, parley: { bar: 1e7, perTrade: 10512 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes, docks, pace: 'full', orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7 }, bag: { free: 8000, slots: 20 }, effort: 1 });
	assert.ok(run.bagFromHold.length, 'something came out of the hold into the bag');
	for (const l of run.bagFromHold) assert.ok(l.n <= stock[l.item], `${l.item}: ${l.n} of the ${stock[l.item]} aboard`);
	assert.deepEqual(run.bagLoaded, [], 'nothing was loaded into the bag from a storage');
});

test('a load cap holds the harbour load to what came out of the storage, whatever a count said lays', () => {
	const land = chains(data).find(c => c.from === 'land' && c.top === 7 && c.rungs.length >= 5);
	const third = land.rungs[2].item;
	const dock = { [third]: 30 };
	const held = chains(data, { [third]: 5 }, dock).find(c => c.item === third && c.from === 'hold');
	assert.ok(held, 'no chain from the good aboard');
	const opts = { stock: { [third]: 5 }, dock, hold, parley, npcById, start: ports.find(p => p.name === 'Velia'), stashes, pace: 'full', orders: PLAIN_ORDERS, chosen: [held] };
	const free = chainRun(opts);
	assert.ok(free.loaded.some(l => l.item === third), 'the free laying loads more of it');
	const pinned = chainRun({ ...opts, loadCap: new Map([[third, 0]]) });
	assert.deepEqual(pinned.loaded.filter(l => l.item === third), []);
	const first = pinned.stops.find(s => s.npcId && s.give === third);
	assert.ok(first && first.times * first.giveN <= 5, 'the first island deals only what is aboard');
});

test('every exchange is charged its own Parley: a Crow Coin trade half again a trade good, less the same discounts', () => {
	// The game's table prices each exchange; at a 26.56% discount the
	// window says 10,491 for a trade good and 15,899 for Crow Coins.
	const rate = 0.7344;
	const coin = chains(data, {}, {}, null, 4, true).filter(c => c.pays === 'coin' && c.rungs.length >= 3).slice(0, 2);
	const run = chainRun({ chosen: coin, hold, parley: { bar: 3500000, perTrade: 10491, rate }, npcById, start: ports.find(p => p.name === 'Velia'), stashes });
	const isles = run.stops.filter(s => s.npcId && s.times > 0);
	assert.ok(isles.length >= 3);
	for (const s of isles) {
		assert.ok(s.parleyBase > 0, `${s.npc} has the game's base`);
		assert.equal(s.parley, s.times * Math.floor(s.parleyBase * rate));
	}
	const each = s => s.parley / s.times;
	assert.ok(isles.some(s => s.item === 'Crow Coin' && each(s) === 15899), 'a coin trade at 15,899');
	assert.ok(isles.some(s => s.item !== 'Crow Coin' && each(s) === 10491), 'a trade good at 10,491');
	assert.equal(run.parleyUsed, isles.reduce((a, s) => a + s.parley, 0));
});

test('a land cap holds the shore goods to what was bought before casting off, and the first island trades no more', () => {
	const land = chains(data).find(c => c.from === 'land' && c.rungs.length >= 3);
	const r0 = land.rungs[0];
	const opts = { chosen: [land], hold, parley, npcById, start: ports.find(p => p.name === 'Velia'), stashes, pace: 'full', orders: PLAIN_ORDERS };
	const free = chainRun(opts);
	const had = free.landLoaded.find(l => l.item === r0.give);
	assert.ok(had && had.n > r0.giveN, 'the free laying buys a good many');
	const bought = Math.floor(had.n / 2 / r0.giveN) * r0.giveN;
	const pinned = chainRun({ ...opts, landCap: new Map([[r0.give, bought]]), bought: new Map([[r0.give, bought]]) });
	const now = pinned.landLoaded.find(l => l.item === r0.give);
	assert.ok(now && now.n <= bought, `${now && now.n} of ${bought} bought`);
	const first = pinned.stops.find(s => s.npcId === r0.npcId);
	assert.ok(first.times * first.giveN <= bought, 'the first island takes only what was bought');
});

test('what a run loads at the wharf fills the hold to its limit and no further; only the exchanges take it past, to the barter ceiling', () => {
	// A chain whose first island wants more weight than the limit: on a
	// loaded run the game still puts no more aboard at the wharf than the
	// limit holds, whatever the ceiling the exchanges may then climb to.
	const start = ports.find(p => p.name === 'Velia');
	const ladder = chains(data).find(x => x.rungs.some(r => levelOf(r.give) >= 3));
	const good = ladder.rungs.find(r => levelOf(r.give) >= 3).give;
	const dock = { [good]: 500 };
	const c = chains(data, {}, dock).find(x => x.from === 'dock' && x.item === good);
	assert.ok(c && c.rungs[0].tries * c.rungs[0].giveN * GOODS[levelOf(good)].weight > 5000, 'a first rung heavier than the limit below');
	const small = { free: 5000, deal: 10000, max: 10000 };
	const run = chainRun({ chosen: [c], dock, hold: small, parley, npcById, start, stashes, pace: 'full', orders: { ...PLAIN_ORDERS, pace: 'full' } });
	assert.ok(run.trades > 0, 'the run still climbs, from what the limit let aboard');
	assert.ok(run.weightStart <= small.free + 1e-6, `loaded to ${run.weightStart} against a limit of ${small.free}`);
	assert.ok(run.stops.every(s => s.wharf || (s.weightAfter || 0) <= small.deal + 1e-6), 'and never past the ceiling after');
	for (const s of run.stops.filter(x => x.wharf && x.loads && x.loads.length)) assert.ok(s.weightAfter <= small.free + 1e-6, `a call loads no further than the limit: ${s.weightAfter}`);
});

// A Lost Trade Box chain ticked beside a [Level 7] climb that starts at
// the same island's same exchange -- Havio's Cherry Tree Seed Pouch on
// layout 22: the first visit deals for both, and neither is cut there.
test('two chains through the same exchange share its trades: the island deals for both', () => {
	const l22 = combos.find(c => c.id === '22');
	const board = boardData(l22, barterData, npcById);
	const all = chains(board, {}, {}, 4552, 0, false, null, { mats: false, boxes: true });
	const box = all.find(c => c.pays === 'box' && c.rungs.length === 2);
	const climb = all.find(c => c.pays === 'goods' && c.from === 'land' && c.rungs[0].npcId === box.rungs[0].npcId && c.rungs.length > 2);
	assert.ok(box && climb, 'a box chain and a climb from the same first island');
	const run = chainRun({ chosen: [climb, box], stock: {}, dock: {}, hold: { free: 18300, deal: 22875, max: 31110 }, parley: { bar: 1e6, perTrade: 11755 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes: [], pace: 'full', orders: PLAIN_ORDERS, prices: {} });
	const first = run.stops.filter(s => s.npcId === box.rungs[0].npcId);
	assert.equal(first.length, 1, 'the shared island is one stop');
	assert.ok(run.stops.some(s => s.npcId === box.rungs[1].npcId && s.item === 'Lost Trade Box'), 'the box is traded');
	assert.ok(run.stops.some(s => s.npcId === climb.rungs[1].npcId), 'and the climb goes on past the shared island');
	assert.ok(!run.cut.some(c => c.why === 'dealt'), 'neither is cut as dealt');
});
