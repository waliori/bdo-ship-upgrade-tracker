// Baseline B1: greedy chain insertion.
//
// From nothing, add the whole climb that raises R − μ·T most, its rungs
// where they lengthen the route least, until no climb raises it; then
// make the plan sailable (wharf calls where the hold stops a climb).
// Under Dinkelbach, μ is found rather than given. No search, no second
// thoughts: what a careful sailor would do with a list of chains and a
// map, and the start ALNS improves on.

import { chainsOf, finish } from './common.js';
import { growByChains, thinLadder } from './insert.js';
import { maximiseRate } from './ratio.js';

export function build(I, { mu = 0, pool = null, most = Infinity } = {}) {
	const { seq } = growByChains(I, [], pool || chainsOf(I), mu, { most });
	const out = finish(I, seq, mu);
	return { ...out, seq: out.visits };
}

/**
 * Trip by trip: each climb alone, from home and back, judged on its own;
 * then laid one after another while each still raises R − μ·T. A sailor
 * with a stocked storage sails this way -- a climb a trip, home between --
 * and a start that mixes every climb from the first leg reaches it only
 * through a long walk of small moves, which the search did not find
 * (2026-10-07: on a real board, 1.75 billion against the 2.6 the trips
 * make). Climbs share their upper islands, and an island is sailed to
 * once, so the order they are taken in decides which are laid at all:
 * the best an hour first, the most silver first, and the longest first
 * (the climbs from [Level 2] in storage, which a long day and vouchers
 * pay for) are each tried, and the best kept.
 */
export function byTrips(I, { mu = 0, pool = null } = {}) {
	const solo = [];
	for (const c of pool || chainsOf(I)) {
		const a = thinLadder(I, c.rungs);
		const seq = c.rungs.map((at, k) => ({ at, a: a[k] }));
		const e = finish(I, seq, mu);
		if (e.f > 0 && e.T > 0) solo.push({ c, seq, f: e.f, rate: e.f / e.T });
	}
	const orders = [(x, y) => y.rate - x.rate, (x, y) => y.f - x.f, (x, y) => y.c.rungs.length - x.c.rungs.length || y.f - x.f];
	let best = null;
	for (const cmp of orders) {
		let cur = finish(I, [], mu), seq = [];
		for (const { c, seq: add } of solo.slice().sort(cmp)) {
			if (c.rungs.some(id => seq.some(v => v.at === id))) continue;
			const e = finish(I, [...seq, ...add], mu);
			if (e.f > cur.f) { cur = e; seq = [...seq, ...add]; }
		}
		if (!best || cur.f > best.f) best = cur;
	}
	return { ...best, seq: best.visits };
}

export function solve(I, { timeMs = 10000, seed = 1, mu = null } = {}) {
	const best = maximiseRate(I, (inst, o) => build(inst, o), { timeMs, mu, seed });
	return { plan: best.plan, info: { mu: best.mu, R: best.R, T: best.T } };
}
