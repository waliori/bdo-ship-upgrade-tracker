// The exact reference, for tiny instances.
//
// Every way of sailing the board is tried, a visit at a time, depth
// first: the next island (any not yet sailed to whose good the ship
// can have), asking for all the attempts it allows, half, or the thin
// ladder's count; or a
// call at a depot, selling what sells and leaving what no island still
// to come will take; or going home. Each partial plan is sailed by the
// simulator itself, robust, so the rules are the simulator's and not a
// second copy of them. A branch is cut when even the best it could still
// come to -- every island left dealing all it allows at the most it
// pays, sold at no cost in time -- is no better than the best found.
//
// Exact within those choices: attempts are all, one fewer, half, or
// just enough to feed an island above; a call sells and leaves everything spare, not a
// chosen part of it. Within 60 s by
// default; `optimal` says whether the search finished.

import { simulate, planPolicy } from '../simulate.mjs';
import { indexOf, startOf, endVisit } from './common.mjs';
import { maximiseRate } from './ratio.mjs';

export function search(I, { mu = 0, timeMs = 60000 } = {}) {
	const t0 = performance.now();
	const { station, depots, takers } = indexOf(I);
	const G = I.goods;
	const planOf = visits => ({ ...startOf(I, visits), visits });
	const sail = visits => simulate(I, planPolicy(planOf(visits)), { mode: 'robust' });
	const close = visits => [...visits, endVisit(I)];

	let best = null;
	let nodes = 0, cut = 0, finished = true;
	// What the islands not yet sailed could still add, at the most: each
	// deals every attempt at its best, and what it makes is worth the most
	// any good up its climb sells for. Loose, and never too low.
	const worthUp = new Map();
	const upValue = g => {
		if (worthUp.has(g)) return worthUp.get(g);
		worthUp.set(g, 0);
		let v = G[g] ? G[g].p : 0;
		for (const t of takers.get(g) || []) v = Math.max(v, (t.ymax / t.q) * upValue(t.out));
		worthUp.set(g, v);
		return v;
	};
	const bound = (run, left) => {
		let extra = 0;
		for (const [g, n] of Object.entries(run.hold)) extra += n * upValue(g);
		for (const id of left) { const s = station.get(id); extra += s.m * s.ymax * upValue(s.out); }
		return run.R + extra - mu * run.T;
	};

	const visit = (visits, left) => {
		if (performance.now() - t0 > timeMs) { finished = false; return; }
		nodes++;
		const done = sail(close(visits));
		const f = done.R - mu * done.T;
		if (!best || f > best.f + 1e-6) best = { f, R: done.R, T: done.T, visits: close(visits) };
		const run = sail(visits.length ? visits : [{ at: I.rules.home }]);
		if (bound(run, left) <= best.f + 1e-6) { cut++; return; }
		const hold = new Map(Object.entries(run.hold));
		// The next island.
		for (const id of left) {
			const s = station.get(id);
			const can = G[s.in].level === 0 || (hold.get(s.in) || 0) >= s.q || (indexOf(I).storage.get(s.in) || 0) > 0;
			if (!can) continue;
			const rest = left.filter(x => x !== id);
			// All it allows, half, or just enough to feed an island still to
			// come that takes what it makes, at that island's every attempt:
			// the thin ladder, which leaves the room a second climb needs.
			const feeds = (takers.get(s.out) || []).filter(t => left.includes(t.id)).map(t => Math.min(s.m, Math.ceil((t.m * t.q) / Math.max(s.ymin, 1e-9) - 1e-9)));
			// One fewer than all, too: on a hold near its limit the attempt that
			// tips it over slows every leg after, and is not always worth it.
			for (const a of [...new Set([s.m, s.m - 1, Math.ceil(s.m / 2), ...feeds])].filter(a => a > 0)) visit([...visits, { at: id, a }], rest);
		}
		// A call, when the last move was not one.
		const last = visits[visits.length - 1];
		if (last && station.has(last.at)) {
			const wanted = new Set(left.map(id => station.get(id).in));
			for (const d of depots) {
				const sell = {}, drop = {};
				for (const [g, n] of hold) {
					if (wanted.has(g)) continue;
					if (G[g] && G[g].p > 0) sell[g] = n; else if (G[g] && G[g].level) drop[g] = n;
				}
				if (!Object.keys(sell).length && !Object.keys(drop).length) continue;
				visit([...visits, { at: d, sell, drop }], left);
			}
		}
	};
	visit([], I.stations.map(s => s.id));
	return { ...best, plan: planOf(best.visits), nodes, cut, optimal: finished };
}

export function solve(I, { timeMs = 60000, mu = null } = {}) {
	let optimal = true, nodes = 0;
	const best = maximiseRate(I, (inst, o) => { const r = search(inst, o); optimal = optimal && r.optimal; nodes += r.nodes; return r; }, { timeMs, mu, rounds: 6 });
	return { plan: best.plan, info: { mu: best.mu, R: best.R, T: best.T, optimal, nodes } };
}
