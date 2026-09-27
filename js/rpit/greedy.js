// Baseline B1: greedy chain insertion.
//
// From nothing, add the whole climb that raises R − μ·T most, its rungs
// where they lengthen the route least, until no climb raises it; then
// make the plan sailable (wharf calls where the hold stops a climb).
// Under Dinkelbach, μ is found rather than given. No search, no second
// thoughts: what a careful sailor would do with a list of chains and a
// map, and the start ALNS improves on.

import { chainsOf, finish } from './common.js';
import { growByChains } from './insert.js';
import { maximiseRate } from './ratio.js';

export function build(I, { mu = 0, pool = null } = {}) {
	const { seq } = growByChains(I, [], pool || chainsOf(I), mu);
	const out = finish(I, seq, mu);
	return { ...out, seq: out.visits };
}

export function solve(I, { timeMs = 10000, seed = 1, mu = null } = {}) {
	const best = maximiseRate(I, (inst, o) => build(inst, o), { timeMs, mu, seed });
	return { plan: best.plan, info: { mu: best.mu, R: best.R, T: best.T } };
}
