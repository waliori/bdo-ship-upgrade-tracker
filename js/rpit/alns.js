// Baseline B2: Adaptive Large Neighbourhood Search.
//
// Start from greedy's plan; then, over and over, tear part of it down
// and build it up again, and keep the result when it is better -- or,
// early on, sometimes when it is a little worse, so the search can walk
// out of a hollow it would otherwise sit in (simulated annealing). The
// ways of tearing down and building up that have been finding better
// plans are chosen more often ("adaptive").
//
// A state is the order of island visits with the attempts each asks
// for, and the wharf calls between them; `finish` makes every state a
// plan a sailor could sail and says what it is worth, R − μ·T in robust
// mode. The moves are the problem's own:
//   tear down:  random islands; a cluster of islands near one another;
//               a whole chain;
//   reshape:    fewer attempts at an island (a lighter hold, fewer calls);
//               more attempts at an island (more goods, if the hold and
//               the climb above can use them); the whole order searched
//               again for the shortest sail (the app's orderLadders);
//   build up:   the islands taken out put back where they lengthen the
//               route least, then whole chains offered as greedy does.
// Every choice is drawn from a seeded generator: the same seed, the same
// search.

import { rng } from './simulate.js';
import { chainsOf, finish, indexOf } from './common.js';
import { cheapestPos, growByChains, reorder, serial, bare, quick } from './insert.js';
import { build as greedy, byTrips } from './greedy.js';
import { maximiseRate } from './ratio.js';

const DESTROY = ['random', 'related', 'chain', 'thin', 'thick', 'reorder', 'serial'];
// Two ways of offering chains back: judged bare, many and cheap; or made
// sailable first, few and dear -- the only way a climb that needs a call
// on the way is ever seen to pay.
const REPAIR = ['bare', 'careful'];

export function search(I, { mu = 0, timeMs = 10000, warm = null, seed = 1, most = 20000, pool = null, fixed = false } = {}) {
	// Fixed climbs must reach their tops.
	const must = fixed && pool ? pool.map(c => c.rungs[c.rungs.length - 1]) : null;
	const t0 = performance.now();
	const rand = rng(seed * 2654435761);
	const pick = xs => xs[Math.floor(rand() * xs.length)];
	const { station, dist } = indexOf(I);
	// `pool` limits the climbs the search may offer -- the sailor's own, when
	// they ticked them; by default every climb the board allows.
	const chains = pool || chainsOf(I);

	const judge = (seq, calls) => {
		const out = finish(I, seq, mu, { calls, must });
		return { seq: out.visits, calls: out.calls, f: out.f, R: out.R, T: out.T, plan: out.plan };
	};
	let cur = warm && warm.seq ? judge(warm.seq, warm.calls || []) : null;
	// `fixed`: the climbs are the sailor's and all of them are sailed -- the
	// search lays them, it does not choose among them. Greedy, which would
	// start from the few that pay best, is not asked.
	if (!fixed) {
		// Greedy capped: past thirty runs judged it found no more on the real
		// boards, and uncapped it took the whole second the search is given.
		const g = greedy(I, { mu, pool: chains, most: 30 });
		const fromGreedy = judge(reorder(I, g.seq), []);
		const plainGreedy = judge(g.seq, g.calls || []);
		const t = byTrips(I, { mu, pool: chains });
		const trips = judge(t.seq, t.calls || []);
		for (const c of [fromGreedy, plainGreedy, trips]) if (!cur || c.f > cur.f) cur = c;
	}
	let best = cur;

	const OPS = [...DESTROY, ...REPAIR];
	const weights = Object.fromEntries(OPS.map(d => [d, 1]));
	const scores = Object.fromEntries(OPS.map(d => [d, 0]));
	const uses = Object.fromEntries(OPS.map(d => [d, 0]));
	const roulette = list => {
		const tot = list.reduce((a, d) => a + weights[d], 0);
		let x = rand() * tot;
		for (const d of list) { x -= weights[d]; if (x <= 0) return d; }
		return list[list.length - 1];
	};
	let temp = 0.05 * Math.max(Math.abs(cur.f), 1);

	let it = 0;
	for (; it < most && performance.now() - t0 < timeMs; it++) {
		const op = roulette(DESTROY);
		const rep = roulette(REPAIR);
		uses[op]++; uses[rep]++;
		let seq = cur.seq.map(v => ({ ...v }));
		let removed = [];
		const n = seq.length;
		const k = n ? Math.max(1, Math.round(n * (0.1 + 0.2 * rand()))) : 0;
		if (op === 'random' && n) {
			for (let j = 0; j < k && seq.length; j++) removed.push(seq.splice(Math.floor(rand() * seq.length), 1)[0]);
		} else if (op === 'related' && n) {
			const at = pick(seq).at;
			const near = seq.map(v => v.at).sort((a, b) => dist(at, a) - dist(at, b)).slice(0, k);
			removed = seq.filter(v => near.includes(v.at));
			seq = seq.filter(v => !near.includes(v.at));
		} else if (op === 'chain' && n) {
			const on = chains.filter(c => c.rungs.some(id => seq.some(v => v.at === id)));
			if (on.length) {
				const c = pick(on);
				removed = seq.filter(v => c.rungs.includes(v.at));
				seq = seq.filter(v => !c.rungs.includes(v.at));
			}
		} else if (op === 'thin' && n) {
			const v = pick(seq);
			v.a = Math.max(1, v.a - 1 - Math.floor(rand() * 3));
		} else if (op === 'reorder' && n) {
			seq = reorder(I, seq);
		} else if (op === 'serial' && n) {
			// The climbs one after another, in a random order of their own.
			const ord = chains.map(c => ({ c, r: rand() })).sort((a, b) => a.r - b.r).map(x => x.c);
			const pos = new Map(ord.map((c, i) => [c.id, i]));
			seq = serial(I, seq, ord).sort((a, b) => {
				const ka = ord.find(c => c.rungs.includes(a.at)), kb = ord.find(c => c.rungs.includes(b.at));
				return (ka ? pos.get(ka.id) : 1e9) - (kb ? pos.get(kb.id) : 1e9);
			});
		} else if (op === 'thick' && n) {
			const v = pick(seq);
			v.a = Math.min(station.get(v.at).m, v.a + 1 + Math.floor(rand() * 3));
		}
		// The sailor's climbs are all sailed: an island of theirs that a
		// laying before dropped -- it dealt nothing there -- comes back too.
		if (fixed) {
			const have = new Set([...seq, ...removed].map(v => v.at));
			for (const c of chains) for (const id of c.rungs) if (!have.has(id)) { removed.push({ at: id, a: station.get(id).m }); have.add(id); }
		}
		// Build up: the removed islands back where they cost least, after
		// what makes their good; then chains, a handful offered.
		// Makers before takers: an island put back before the island that
		// makes its good would stand where nothing reaches it, and deal
		// nothing. The level of what it takes orders them; ties drawn.
		const lvl = v => I.goods[station.get(v.at).in].level;
		for (const v of removed.map(v => ({ v, r: rand() })).sort((a, b) => lvl(a.v) - lvl(b.v) || a.r - b.r).map(x => x.v)) {
			const s = station.get(v.at);
			const maker = seq.reduce((m, w, i) => (station.get(w.at).out === s.in ? i : m), -1);
			seq.splice(cheapestPos(I, seq, v.at, maker + 1), 0, v);
		}
		const offered = chains.filter(() => rand() < 0.35).slice(0, rep === 'bare' ? 12 : 4);
		if (offered.length) seq = growByChains(I, seq, offered, mu, rep === 'bare' ? { most: 24, judge: bare } : { most: 8, judge: quick }).seq;

		const cand = judge(seq, cur.calls);
		let score = 0;
		if (cand.f > best.f + 1e-6) { best = cand; score = 3; }
		if (cand.f > cur.f + 1e-6) { cur = cand; score = Math.max(score, 1); }
		else if (rand() < Math.exp((cand.f - cur.f) / Math.max(temp, 1e-9))) cur = cand;
		scores[op] += score; scores[rep] += score;
		temp *= 0.997;
		if ((it + 1) % 50 === 0) {
			for (const d of OPS) { if (uses[d]) weights[d] = 0.5 * weights[d] + 0.5 * Math.max(0.1, scores[d] / uses[d]); scores[d] = 0; uses[d] = 0; }
		}
	}
	return { ...best, iterations: it };
}

export function solve(I, { timeMs = 10000, seed = 1, mu = null } = {}) {
	const best = maximiseRate(I, (inst, o) => search(inst, o), { timeMs, mu, seed });
	return { plan: best.plan, info: { mu: best.mu, R: best.R, T: best.T, iterations: best.iterations } };
}
