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
import * as alns from './alns.mjs';

export function search(I, { mu = 0, timeMs = 60000, incumbent = null } = {}) {
	const t0 = performance.now();
	const { station, depots, takers } = indexOf(I);
	const G = I.goods;
	const planOf = visits => ({ ...startOf(I, visits), visits });
	const sail = visits => simulate(I, planPolicy(planOf(visits)), { mode: 'robust' });
	const close = visits => [...visits, endVisit(I)];

	// A plan already known starts the search as the one to beat, so the
	// bound cuts from the first node.
	let best = null;
	if (incumbent) {
		// Its visits less the closing call, closed again the search's way.
		const vs = close(incumbent.visits.slice(0, -1));
		const done = sail(vs);
		best = { f: done.R - mu * done.T, R: done.R, T: done.T, visits: vs };
	}
	let nodes = 0, cut = 0, dominated = 0, finished = true;
	// Two partial plans at the same place, having sailed to the same islands
	// with the same goods aboard and the same Parley left, have the same
	// futures open to them: the one worth less so far can never end ahead.
	const seen = new Map();
	const stateKey = (run, left) => `${run.at}|${left.join(',')}|${Object.entries(run.hold).filter(([, n]) => n > 1e-9).map(([g, n]) => `${g}:${Math.round(n * 1000)}`).sort().join(';')}|${Math.round(run.parleyLeft)}`;
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
		const key = stateKey(run, left);
		const here = run.R - mu * run.T;
		if (seen.has(key) && seen.get(key) >= here - 1e-6) { dominated++; return; }
		seen.set(key, here);
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
	return { ...best, plan: planOf(best.visits), nodes, cut, dominated, optimal: finished };
}

/**
 * The best rate, proven. A heuristic plan gives a rate μ* to start from;
 * one exhaustive search at μ = μ* then settles it: if no plan earns more
 * than μ* an hour -- no plan has R − μ*·T above nought -- the heuristic's
 * plan is optimal and that is the certificate; if one does, μ moves to its
 * rate and the search runs again (Dinkelbach from a good start, which
 * ends in one or two rounds rather than climbing from μ = 0).
 * `optimal` is true when every round finished.
 */
export function solve(I, { timeMs = 60000, mu = null, seed = 1 } = {}) {
	const t0 = performance.now();
	const left = () => Math.max(0, timeMs - (performance.now() - t0));
	if (mu !== null) {
		const r = search(I, { mu, timeMs });
		return { plan: r.plan, info: { mu, R: r.R, T: r.T, optimal: r.optimal, nodes: r.nodes } };
	}
	const rate = x => (x.T > 0 ? x.R / x.T : 0);
	const start = alns.solve(I, { timeMs: Math.min(1000, timeMs / 10), seed });
	let best = { plan: start.plan, R: start.info.R, T: start.info.T };
	let m = rate(best);
	let optimal = true, nodes = 0, rounds = 0;
	for (; rounds < 6 && left() > 0; rounds++) {
		const r = search(I, { mu: m, timeMs: left(), incumbent: best.plan });
		nodes += r.nodes;
		optimal = optimal && r.optimal;
		if (rate(r) > rate(best) * (1 + 1e-9)) { best = { plan: r.plan, R: r.R, T: r.T }; m = rate(r); }
		else break;   // nothing earns more than μ an hour: the plan in hand is the best
	}
	return { plan: best.plan, info: { mu: m, R: best.R, T: best.T, optimal, nodes, rounds: rounds + 1, startRate: rate({ R: start.info.R, T: start.info.T }) } };
}
