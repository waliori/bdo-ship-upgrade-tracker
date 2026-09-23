// The way round: distances by water, and the shortest order through
// the stops of a run -- a plain tour, ladders that interleave but never
// fold, blocks sailed whole, and the lots a heavy run is cut into.
//
// What can go wrong: a rung laid before the rung beneath it, a route
// longer than the nearest-first one it was meant to shorten, a sea
// distance shorter than the straight line, an island in a lot of its
// own beside a lot that passes it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { seaDist, seaKnown, routeLength, orderLadders, orderBlocks, tour, improveLots, growLots, STRETCH } from '../js/barter-route.js';
import { SEA_DIST_POINTS } from '../js/sea_dist.js';
import { seaLeg } from '../js/searoute.js';
import { pathLength, METRES_PER_PX } from '../js/sailing.js';
import { npcById, npcs, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';
import { chains, chainRun } from '../js/barter-chains.js';
import { boardData } from '../js/barter-board.js';
import { PLAIN_ORDERS } from '../js/barter-orders.js';

const straight = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('the sea distance between two fixed points is the bent leg\'s length, never under the straight line, the same both ways', () => {
	const velia = ports.find(p => p.name === 'Velia');
	const at = name => npcs.find(n => n.name === name);
	for (const [a, b] of [[velia, at('Akenisi')], [at('Cazio'), at('Renilu')], [velia, wharves.find(w => w.name === 'Srulk')]]) {
		assert.ok(seaKnown(a, b));
		const d = seaDist(a, b);
		assert.ok(Math.abs(d - pathLength(seaLeg(a, b)) / METRES_PER_PX) <= 1 / METRES_PER_PX + 1e-6, `${a.name} to ${b.name}: ${d} against the leg`);
		assert.ok(d >= straight(a, b) - 1e-6, 'never shorter than the crow flies');
		assert.equal(seaDist(b, a), d);
	}
	assert.equal(seaDist(velia, velia), 0);
	// Every island, harbour and wharf is on file.
	const known = new Set(SEA_DIST_POINTS.map(([x, y]) => `${x},${y}`));
	for (const p of [...ports, ...npcs, ...wharves]) assert.ok(known.has(`${p.x},${p.y}`), `${p.name} is on file`);
	// Anything else is a straight line stretched a quarter for the land.
	const off = { x: 70000, y: 70000 };
	assert.ok(!seaKnown(velia, off));
	assert.ok(Math.abs(seaDist(velia, off) - straight(velia, off) * STRETCH) < 1e-6);
	assert.equal(seaDist(null, velia), 0);
});

test('the sea table tells the nearest island apart from the nearest as the crow flies', () => {
	// Somewhere on the chart a headland stands between two islands that
	// are close as the crow flies: the table knows, the ruler does not.
	let apart = 0;
	for (let i = 0; i < npcs.length; i++) {
		for (let j = i + 1; j < npcs.length; j++) {
			if (seaDist(npcs[i], npcs[j]) > straight(npcs[i], npcs[j]) * 1.5) apart++;
		}
	}
	assert.ok(apart > 20, `${apart} pairs of islands are half again as far by water as by air`);
});

const P = (x, y) => ({ x, y });

test('a tour is the shortest way, from the start, home at the end, on any measure', () => {
	// Four corners of a square and a start beside one: the shortest is
	// round the square, not the nearest-first zigzag -- three sides and
	// the two legs from the start, four hundred and two.
	const pts = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
	const start = P(-10, 55), dist = straight;
	const order = tour(pts, { start, end: start, dist });
	const L = routeLength([start, ...order.map(i => pts[i]), start], dist);
	assert.ok(L <= 402.1, `${L} round the square`);
	assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
});

test('ladders interleave but never fold: every rung after the one beneath it, and the route no longer than nearest-first', () => {
	// Three ladders of three, laid out so nearest-first doubles back.
	const ladders = [
		[P(0, 0), P(50, 100), P(0, 200)],
		[P(10, 0), P(60, 100), P(10, 200)],
		[P(20, 0), P(70, 100), P(20, 200)]
	];
	const start = P(0, -10), dist = straight;
	const nearest = orderLadders(ladders, { start, dist, effort: 0 });
	const best = orderLadders(ladders, { start, dist });
	for (const r of [nearest, best]) {
		assert.equal(r.order.length, 9);
		const seen = ladders.map(() => -1);
		for (const { k, j } of r.order) { assert.equal(j, seen[k] + 1, `ladder ${k} climbs in order`); seen[k] = j; }
		assert.ok(Math.abs(r.length - routeLength([start, ...r.order.map(o => ladders[o.k][o.j])], dist)) < 1e-6);
	}
	assert.ok(best.length <= nearest.length + 1e-6, `${best.length} against ${nearest.length} nearest-first`);
	// The rungs of one ladder alone come out as they went in.
	const one = orderLadders([ladders[0]], { start, dist });
	assert.deepEqual(one.order.map(o => o.j), [0, 1, 2]);
	// An end given as a function is the way home from the last stop.
	const withEnd = orderLadders(ladders, { start, end: p => dist(p, start), dist });
	assert.ok(withEnd.length >= best.length, 'the way home is counted');
	assert.deepEqual(orderLadders([], { start, dist }), { order: [], length: 0 });
});

test('laid twice, the same route: the search is deterministic', () => {
	const ladders = [[P(3, 9), P(40, 2), P(80, 30)], [P(5, 50), P(45, 60)], [P(90, 90), P(10, 95), P(50, 20), P(70, 70)]];
	const a = orderLadders(ladders, { start: P(0, 0), dist: straight });
	const b = orderLadders(ladders, { start: P(0, 0), dist: straight });
	assert.deepEqual(a, b);
});

test('blocks are sailed whole, in the order that makes the shortest run', () => {
	const blocks = [
		{ first: P(100, 0), last: P(120, 0), inner: 20 },
		{ first: P(0, 100), last: P(0, 120), inner: 20 },
		{ first: P(0, 10), last: P(0, 30), inner: 20 }
	];
	const { order, length } = orderBlocks(blocks, { start: P(0, 0), end: P(0, 0), dist: straight });
	assert.deepEqual([...order].sort(), [0, 1, 2]);
	assert.equal(order[0], 2, 'the block off the start first');
	const L = o => { let at = P(0, 0), c = 0; for (const i of o) { c += straight(at, blocks[i].first) + blocks[i].inner; at = blocks[i].last; } return c + straight(at, P(0, 0)); };
	assert.ok(Math.abs(length - L(order)) < 1e-6);
	for (const o of [[0, 1, 2], [1, 0, 2], [2, 0, 1], [0, 2, 1], [1, 2, 0], [2, 1, 0]]) assert.ok(L(o) >= length - 1e-6, `${o} is no shorter`);
});

test('the lots are cut for the shortest run: islands near one another on the same trip, each trip within the hold', () => {
	// Six islands, two clusters, from a harbour between them; a hold
	// that carries three islands at a time. Nearest-first-and-fill puts
	// one island of each cluster on the wrong trip.
	const home = P(0, 0);
	const isles = [P(100, 0), P(110, 5), P(105, -5), P(-100, 0), P(-110, 5), P(-105, -5)];
	const cost = lots => { let c = 0; for (const l of lots) c += routeLength([home, ...tour(l.map(i => isles[i]), { start: home, end: home, dist: straight }).map(k => isles[l[k]]), home], straight); return c; };
	const fits = lots => lots.every(l => l.length <= 3);
	const seed = [[0, 3, 1], [4, 2, 5]];
	const best = improveLots(seed, { cost, fits });
	assert.ok(fits(best));
	assert.deepEqual(best.map(l => [...l].sort()).sort((a, b) => a[0] - b[0]), [[0, 1, 2], [3, 4, 5]]);
	assert.ok(cost(best) < cost(seed) / 1.5);
	const grown = growLots([0, 1, 2, 3, 4, 5], { cost, fits, near: i => straight(home, isles[i]) });
	assert.ok(fits(grown));
	assert.deepEqual(grown.map(l => [...l].sort()).sort((a, b) => a[0] - b[0]), [[0, 1, 2], [3, 4, 5]]);
	// A cut that fits nowhere else stays as it is.
	assert.deepEqual(improveLots([[0], [1]], { cost, fits: lots => lots.every(l => l.length === 1) }), [[0], [1]]);
});

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8')).combos;
const stashes = ['Velia', 'Iliya Island', "Oquilla's Eye"].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));
const sailed = (run, start) => routeLength([start, ...run.stops.map(s => s.wharf || npcById.get(s.npcId))]);

test('a run of several trips is cut for the shortest run and never for less an hour: layout 34 from Iliya', () => {
	const d34 = boardData(combos.find(c => c.id === '34'), barterData, npcById);
	const stock = { "[Level 5] Statue's Tear": 3, '[Level 4] Old Chest with Gold Coins': 6 };
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 30, '[Level 4] Bronze Candlestick': 18 };
	const want = ['[Level 5] Supreme Gold Candlestick', '[Level 5] 102 Year Old Golden Herb', "[Level 5] Statue's Tear", '[Level 5] Golden Fish Scale', '[Level 4] Old Chest with Gold Coins', '[Level 4] Bronze Candlestick'];
	const all = chains(d34, stock, dock).filter(c => c.top === 7 && c.from !== 'land');
	const chosen = want.map(w => all.find(c => c.item === w)).filter(Boolean);
	const start = ports.find(p => p.name === 'Iliya Island');
	const small = { free: 20889, deal: 26111, max: 35500 };
	for (const pace of ['fast', 'steady']) {
		const lay = effort => chainRun({ chosen, stock, dock, hold: small, parley: { bar: 674128, perTrade: 10512 }, npcById, start, stashes, pace, orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7 }, effort });
		const plain = lay(0), best = lay(2);
		assert.ok(best.lots.length > 1, `${pace}: trips`);
		assert.ok(sailed(best, start) < sailed(plain, start) * 0.9, `${pace}: ${Math.round(sailed(best, start))} against ${Math.round(sailed(plain, start))} the old way`);
		assert.ok(best.net / sailed(best, start) >= plain.net / sailed(plain, start), `${pace}: worth no less a league`);
		assert.ok(best.weightPeak <= small.free + 1e-6, `${pace}: never over the limit`);
		// Every chain's rungs in climbing order, and no island dealt twice.
		const isles = best.stops.filter(s => s.npcId);
		assert.equal(new Set(isles.map(s => s.npcId)).size, isles.length);
		for (let k = 0; k < best.order.length; k++) {
			const mine = isles.filter(s => s.chain === k).map(s => s.npcId);
			assert.deepEqual(mine, best.order[k].rungs.map(r => r.npcId).filter(id => mine.includes(id)));
		}
		// The trips are told by the lots: each lot's chains, one call between.
		best.lots.forEach((lot, l) => { for (const k of lot) assert.ok(isles.some(s => s.chain === k && best.stops.indexOf(s) >= 0), `lot ${l} chain ${k} sails`); });
	}
});

test('the old way is the floor: a shorter route that is worth less an hour is not the run', () => {
	// Layout 25, the five land chains to the top, loaded heavy: the
	// shortest cut trades a tenth less for no distance saved, and the
	// run keeps the cut it was laid in before.
	const data = boardData(combos.find(c => c.id === '25'), barterData, npcById);
	const five = chains(data).filter(c => c.from === 'land' && c.top === 7);
	const hold = { free: 23300, deal: 29125, max: 39610 };
	const parley = { bar: 3500000, perTrade: 10554 };
	const lay = effort => chainRun({ chosen: five, hold, parley, npcById, start: ports[0], stashes, pace: 'full', orders: { ...PLAIN_ORDERS, way: 'sea' }, effort });
	const plain = lay(0), best = lay(2);
	assert.ok(best.net >= plain.net, `${best.net} against ${plain.net} the old way`);
	assert.ok(best.net / sailed(best, ports[0]) >= plain.net / sailed(plain, ports[0]) * 0.999);
	// And light and fast, the same chains: a fifth shorter, nothing lost.
	const fast = e => chainRun({ chosen: five, hold, parley, npcById, start: ports[0], stashes, pace: 'fast', orders: { ...PLAIN_ORDERS, way: 'sea' }, effort: e });
	const f0 = fast(0), f2 = fast(2);
	assert.ok(sailed(f2, ports[0]) < sailed(f0, ports[0]) * 0.85);
	assert.ok(f2.trades >= f0.trades && f2.net >= f0.net);
});

test('the sailor has the last word: a trip order set is sailed as set, and a stop moved moves on the route that was shown', () => {
	const d34 = boardData(combos.find(c => c.id === '34'), barterData, npcById);
	const stock = { "[Level 5] Statue's Tear": 3, '[Level 4] Old Chest with Gold Coins': 6 };
	const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 30, '[Level 4] Bronze Candlestick': 18 };
	const want = ['[Level 5] Supreme Gold Candlestick', '[Level 5] 102 Year Old Golden Herb', "[Level 5] Statue's Tear", '[Level 5] Golden Fish Scale', '[Level 4] Old Chest with Gold Coins', '[Level 4] Bronze Candlestick'];
	const all = chains(d34, stock, dock).filter(c => c.top === 7 && c.from !== 'land');
	const chosen = want.map(w => all.find(c => c.item === w)).filter(Boolean);
	const start = ports.find(p => p.name === 'Iliya Island');
	const base = { chosen, stock, dock, hold: { free: 20889, deal: 26111, max: 35500 }, parley: { bar: 674128, perTrade: 10512 }, npcById, start, stashes, pace: 'steady', orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7 } };
	const run = chainRun(base);
	assert.ok(run.lots.length >= 3, 'three trips or more');
	const keyOf = lot => lot.map(k => run.order[k].id).sort().join('+');
	const keys = run.lots.map(keyOf);
	// The last trip first, then the rest in the planner's order.
	const flipped = chainRun({ ...base, tripOrder: [keys[keys.length - 1], ...keys.slice(0, -1)] });
	assert.equal(keyOf.call(null, flipped.lots[0].map(k => run.order.indexOf(flipped.order[k]))), keys[keys.length - 1]);
	// One stop moved a place sooner: every other stop keeps its place.
	const isles = r => r.stops.filter(s => s.npcId).map(s => s.npcId);
	const was = isles(run);
	const i = was.findIndex((id, k) => k > 0 && run.stops.find(s => s.npcId === id).chain !== run.stops.find(s => s.npcId === was[k - 1]).chain);
	assert.ok(i > 0, 'a stop whose neighbour before it is of another chain');
	const moved = chainRun({ ...base, nudge: { [was[i]]: -1 } });
	const now = isles(moved);
	const expect = was.slice(); [expect[i - 1], expect[i]] = [expect[i], expect[i - 1]];
	assert.deepEqual(now, expect, 'the two stops swapped, the rest as shown');
});
