// What every RPIT solver needs and none should write twice.
//
// A solver here works on the instance alone -- never the app's objects --
// and on a plan as the bench reads one: a start (what is bought and what
// is loaded from the home storage) and visits. It judges a plan the way
// the simulator plays it, in robust mode: goods counted as if every
// island paid the least and weighed as if it paid the most, which is
// what a planner that has not seen the board can promise. The objective
// is R − μ·T, silver less the hours at μ silver an hour (see ratio.mjs).
//
// The plan a solver builds says which islands, in what order, and asks
// for as many attempts as each allows; `finish` then makes it one a
// sailor could sail: it buys and loads what the islands will take and
// no more, calls at a wharf where the hold would otherwise stop a climb,
// drops the calls that do nothing, and writes down the attempts that
// were actually made, so that a spare drop keeps what is needed and not
// what was hoped for.

import { simulate, planPolicy } from '../simulate.mjs';

/** The instance's lookups, made once. */
export function indexOf(I) {
	if (I.__index) return I.__index;
	const station = new Map(I.stations.map(s => [s.id, s]));
	const idx = new Map(I.travel.points.map((p, i) => [p, i]));
	const depots = I.depots.map(d => d.id);
	const takers = new Map();
	for (const s of I.stations) takers.set(s.in, [...(takers.get(s.in) || []), s]);
	const dist = (a, b) => I.travel.matrix[idx.get(a)][idx.get(b)];
	const storage = new Map(Object.entries(I.depots.find(d => d.id === I.rules.home).storage || {}));
	const out = { station, idx, depots, takers, dist, storage };
	Object.defineProperty(I, '__index', { value: out, enumerable: false });
	return out;
}

/**
 * Every climb the board allows, from the instance alone: a path of
 * stations, each taking what the one before pays, from a good the ship
 * can have at the start -- a land good it buys, or a good aboard or in
 * the home storage -- to a good a wharf buys. A station with several
 * takers branches. At most `depth` rungs.
 */
export function chainsOf(I, depth = 8) {
	const { takers, storage } = indexOf(I);
	const G = I.goods;
	const startable = g => (G[g] && G[g].level === 0 && G[g].b >= 0 && G[g].cap !== 0) || (I.initial.hold[g] || 0) > 0 || (storage.get(g) || 0) > 0;
	const out = [];
	const walk = (path) => {
		const last = path[path.length - 1];
		if (G[last.out] && G[last.out].p > 0) out.push(path.map(s => s.id));
		if (path.length >= depth) return;
		for (const t of takers.get(last.out) || []) if (!path.includes(t)) walk([...path, t]);
	};
	for (const s of I.stations) if (startable(s.in)) walk([s]);
	return out.map((rungs, k) => ({ id: k, rungs, top: G[indexOf(I).station.get(rungs[rungs.length - 1]).out].level }));
}

/** A plan's value at μ: R − μ·T in robust mode, and the run behind it. */
export function robustEval(I, plan, mu = 0) {
	const r = simulate(I, planPolicy(plan), { mode: 'robust' });
	return { f: r.R - mu * r.T, R: r.R, T: r.T, run: r };
}

/** A visit to the end depot that sells what the run made. */
export const endVisit = I => ({ at: I.rules.end, sell: 'spare', drop: 'spare' });

/**
 * The start of a plan whose station visits are given: what is bought
 * ashore and loaded from home. A land good is bought for every attempt
 * that asks for it, up to what the Market lists; a stored good is loaded
 * for what the visits take beyond what the run makes of it before, as
 * far as the hold carries at the start.
 */
export function startOf(I, visits) {
	const { station, storage } = indexOf(I);
	const G = I.goods;
	const buy = {}, load = {};
	const made = new Map(), held = new Map(Object.entries(I.initial.hold));
	const limit = I.rules.pace === 'full' ? I.vehicle.Wdeal : I.vehicle.Wfree;
	let W = Object.entries(I.initial.hold).reduce((a, [g, n]) => a + n * (G[g] ? G[g].w : 0), 0);
	for (const v of visits) {
		const s = station.get(v.at);
		if (!s || !(v.a > 0)) continue;
		const need = v.a * s.q;
		const have = (held.get(s.in) || 0) + (made.get(s.in) || 0);
		const short = Math.max(0, need - have);
		if (short > 0) {
			if (G[s.in].level === 0) {
				const cap = G[s.in].cap === null ? Infinity : G[s.in].cap;
				const n = Math.min(short, cap - (buy[s.in] || 0));
				if (n > 0) { buy[s.in] = (buy[s.in] || 0) + n; held.set(s.in, (held.get(s.in) || 0) + n); W += n * G[s.in].w; }
			} else {
				const n = Math.min(short, (storage.get(s.in) || 0) - (load[s.in] || 0), Math.floor((limit - W) / Math.max(G[s.in].w, 1e-9)));
				if (n > 0) { load[s.in] = (load[s.in] || 0) + n; held.set(s.in, (held.get(s.in) || 0) + n); W += n * G[s.in].w; }
			}
		}
		const use = Math.min(need, (held.get(s.in) || 0) + (made.get(s.in) || 0));
		const fromMade = Math.min(use, made.get(s.in) || 0);
		made.set(s.in, (made.get(s.in) || 0) - fromMade);
		held.set(s.in, (held.get(s.in) || 0) - (use - fromMade));
		made.set(s.out, (made.get(s.out) || 0) + v.a * s.ymin);
	}
	return { buy, load };
}

/** The depot that bends the leg from `a` to `b` least. */
export function nearestCall(I, a, b) {
	const { depots, dist } = indexOf(I);
	let best = null, bd = Infinity;
	for (const d of depots) {
		const x = dist(a, d) + dist(d, b) - dist(a, b);
		if (x < bd) { bd = x; best = d; }
	}
	return best;
}

/**
 * A plan made sailable from an order of station visits (each asking for
 * `a` attempts, or all the island allows when `a` is missing): the start
 * bought and loaded for them; a wharf call put in before each island the
 * hold would stop, where it pays; calls that do nothing taken out; the
 * attempts written as made. Returns { plan, f, R, T }.
 */
export function finish(I, stationVisits, mu = 0, { calls = [] } = {}) {
	const { station } = indexOf(I);
	let visits = stationVisits.map(v => ({ at: v.at, a: v.a ?? station.get(v.at).m }));
	// Calls a caller already had, kept in place: { before: stationId, at }.
	const withCalls = (vs, cs) => {
		const out = [];
		for (const v of vs) {
			for (const c of cs) if (c.before === v.at) out.push({ at: c.at, sell: 'spare', drop: 'spare' });
			out.push(v);
		}
		return [...out, endVisit(I)];
	};
	let cs = calls.filter(c => visits.some(v => v.at === c.before));
	const build = (vs, list) => {
		const all = withCalls(vs, list);
		return { ...startOf(I, all), visits: all };
	};
	let plan = build(visits, cs);
	let best = robustEval(I, plan, mu);

	for (let round = 0; round < 3; round++) {
		// A call before each island the hold stopped, where it pays.
		let changed = false;
		for (let guard = 0; guard < visits.length; guard++) {
			const log = best.run.log;
			const k = log.findIndex(e => e.kind === 'station' && (e.why === 'weight' || e.why === 'over') && !cs.some(c => c.before === e.at));
			if (k < 0) break;
			const at = log[k].at;
			const prev = log.slice(0, k).reverse().find(e => e.kind === 'station' || e.kind === 'depot');
			const d = nearestCall(I, prev ? prev.at : 'start', at);
			const trial = [...cs, { before: at, at: d }];
			const p = build(visits, trial);
			const e = robustEval(I, p, mu);
			// Kept or not, this island is not asked about again this round.
			if (e.f > best.f + 1e-6) { cs = trial; plan = p; best = e; changed = true; }
			else cs = [...cs, { before: at, at: d, tried: true }];
		}
		cs = cs.filter(c => !c.tried);
		// Calls that do nothing, or less than their time, taken out.
		for (const c of [...cs]) {
			const trial = cs.filter(x => x !== c);
			const p = build(visits, trial);
			const e = robustEval(I, p, mu);
			if (e.f >= best.f - 1e-6) { cs = trial; plan = p; best = e; changed = true; }
		}
		const done = new Map(best.run.log.filter(e => e.kind === 'station').map(e => [e.at, e.a]));
		// An island that dealt nothing is not sailed to, whatever else is
		// kept: its stop is time for nothing. Tried on its own, since the
		// requests trimmed below can keep goods aboard that a spare drop
		// would otherwise leave, and so may not pay together with it.
		const dead = visits.filter(v => !(done.get(v.at) > 0));
		if (dead.length) {
			const live = visits.filter(v => done.get(v.at) > 0);
			// A call is kept by the island it stands before: one standing
			// before a dead island moves on to the next live one, or it would
			// go with the island.
			const moved = cs.map(c => {
				if (live.some(v => v.at === c.before)) return c;
				const k = visits.findIndex(v => v.at === c.before);
				const next = visits.slice(k + 1).find(v => done.get(v.at) > 0);
				return next ? { ...c, before: next.at } : null;
			}).filter(Boolean);
			const p = build(live, moved);
			const e = robustEval(I, p, mu);
			if (e.f >= best.f - 1e-6) { visits = live; cs = moved; plan = p; best = e; changed = true; }
		}
		// The attempts as made.
		const done2 = new Map(best.run.log.filter(e => e.kind === 'station').map(e => [e.at, e.a]));
		const next = visits.map(v => ({ at: v.at, a: done2.get(v.at) ?? 0 })).filter(v => v.a > 0);
		if (next.length !== visits.length || next.some((v, i) => v.a !== visits[i].a)) {
			const p = build(next, cs);
			const e = robustEval(I, p, mu);
			if (e.f >= best.f - 1e-6) { visits = next; plan = p; best = e; changed = true; }
		}
		if (!changed) break;
	}
	return { plan, f: best.f, R: best.R, T: best.T, visits, calls: cs };
}

/** Whether `id` may stand at position `pos` of `seq`: its good can be had there. */
export function insertOK(I, seq, id, pos) {
	const { station, storage } = indexOf(I);
	const s = station.get(id);
	const g = s.in;
	if (I.goods[g].level === 0 || (I.initial.hold[g] || 0) > 0 || (storage.get(g) || 0) > 0) return true;
	for (let k = 0; k < pos; k++) if (station.get(seq[k].at).out === g) return true;
	return false;
}
