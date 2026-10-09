// The trip planner: trips built and judged one by one (trips.js), the
// day chosen among them exactly (pick.js), laid as one plan and judged
// by the simulator.
//
// Pure: nothing random, nothing from the ALNS. The figures returned are
// the laid plan's own, read off its robust run; the labels only choose.
// Where the trips laid together earn less than their labels said --
// something crossed between them the labels did not carry -- the day's
// order is laid again by `finish`, and the better of the two returned.

import { finish, robustEval, chainsOf, endVisit } from './common.js';
import { buildTrips, wetTrip, tripOf } from './trips.js';
import { pickDay, legHours } from './pick.js';
import { reorder, serial } from './insert.js';

// No session: the board cleared, however long.
const CLEAR = 24;

/** The trips one after another as one plan on `I`. */
export function layDay(I, trips) {
	const buy = {}, visits = [];
	let load = {}, bag = {};
	trips.forEach((t, k) => {
		for (const [g, n] of Object.entries(t.plan.buy || {})) buy[g] = (buy[g] || 0) + n;
		const start = t.plan.load || {};
		if (k === 0 && t.from === 'start') { load = { ...start }; bag = { ...(t.plan.bag || {}) }; }
		else {
			// The trip leaves from a wharf: loaded at the call that closed the
			// trip before when it ended there, else at a call made for it.
			const last = visits[visits.length - 1];
			const at = last && last.at === t.from ? last : (visits.push({ at: t.from }), visits[visits.length - 1]);
			if (Object.keys(start).length) {
				at.load = { ...(at.load || {}) };
				for (const [g, n] of Object.entries(start)) at.load[g] = (at.load[g] || 0) + n;
			}
		}
		for (const v of t.plan.visits) visits.push({ ...v });
	});
	if (!visits.length || visits[visits.length - 1].at !== I.rules.end) visits.push(endVisit(I));
	return { buy, load, visits, ...(Object.keys(bag).length ? { bag } : {}) };
}

const stationsOf = (I, plan) => {
	const ids = new Set(I.stations.map(s => s.id));
	return plan.visits.filter(v => ids.has(v.at)).map(v => ({ at: v.at, a: v.a }));
};
const callsOf = (I, plan) => {
	const ids = new Set(I.stations.map(s => s.id));
	const out = [];
	plan.visits.forEach((v, k) => {
		if (ids.has(v.at)) return;
		const next = plan.visits.slice(k + 1).find(w => ids.has(w.at));
		if (next) out.push({ before: next.at, at: v.at, ...(v.load ? { load: v.load } : {}), ...(v.fromBag ? { fromBag: v.fromBag } : {}) });
	});
	return out;
};

/**
 * Two trips sailed one after another, laid as one: the leg home between
 * them saved, the islands threaded. Each pair of neighbours in the day is
 * tried, in the orders the catalogue tries, and merged while the merged
 * trip is worth at least the two and sails no longer than the two with
 * the leg between; the attempts, loads and buys are the same islands',
 * so what the day was chosen under still holds.
 */
function merged(I, trips, { H, chains }) {
	const out = trips.slice();
	for (let k = 0; k + 1 < out.length;) {
		const a = out[k], b = out[k + 1];
		const both = a.f + b.f, span = a.T + legHours(I, a.to, b.from) + b.T;
		const ids = [...new Set([...a.chainIds, ...b.chainIds])].sort((x, y) => x - y);
		const seq = [...a.seq, ...b.seq];
		const mine = ids.map(id => chains.find(c => c.id === id)).filter(Boolean);
		let best = null;
		for (const order of [seq, reorder(I, seq), serial(I, seq, mine)]) {
			const t = tripOf(I, order, { from: a.from, to: b.to, chainIds: ids, id: `${a.id}&${b.id}` });
			if (t && t.f >= both - 1e-6 && t.T <= span + 1e-9 && (!best || t.f > best.f + 1e-9 || (Math.abs(t.f - best.f) <= 1e-9 && t.T < best.T))) best = t;
		}
		if (best) out.splice(k, 2, best); else k++;
	}
	return out;
}

/** The day laid, judged, and laid again by `finish` when the labels said more. */
function dayOf(I, trips) {
	const laid = layDay(I, trips);
	let e = robustEval(I, laid, 0);
	let plan = laid;
	const said = trips.reduce((a, t) => a + t.f, 0);
	if (e.f < said - 1e-6) {
		const again = finish(I, stationsOf(I, laid), 0, { calls: callsOf(I, laid) });
		const e2 = robustEval(I, again.plan, 0);
		if (e2.f > e.f) { plan = again.plan; e = e2; }
	}
	return { plan, f: e.f, R: e.R, T: e.T, run: e.run };
}

export function solve(I, { session = 0, seed = 1, most = 400, grow = 60, near = 8, pool = null } = {}) {
	void seed;
	const t0 = performance.now();
	const H = session > 0 ? session : CLEAR;
	let trips = buildTrips(I, { pool: pool || chainsOf(I), session: H, most, grow, near });
	// The day picked over the dry labels, its trips laid again with their
	// refills; a trip the ship cannot be fed on leaves the catalogue, and
	// the day is picked again without it.
	const chains = pool || chainsOf(I);
	const pick = mu => {
		let again = false;
		for (;;) {
			const day = pickDay(I, trips, { H, mu });
			const wet = day.trips.map(t => wetTrip(I, t));
			const fed = wet.every(Boolean);
			if (fed) {
				// Neighbours merged; the merged trips offered to the catalogue and
				// the day picked once more, so the hours a merge saves are sailed.
				const m = merged(I, wet, { H, chains });
				const fresh = m.filter(t => t.id.includes('&') && !trips.some(x => x.id === t.id && x.from === t.from));
				if (fresh.length && !again) { trips = [...trips, ...fresh]; again = true; continue; }
				return { ...day, trips: m, ...dayOf(I, m) };
			}
			const out = new Set(day.trips.filter((t, k) => !wet[k]));
			trips = trips.filter(t => !out.has(t));
		}
	};
	let best = pick(0);
	if (!(session > 0)) {
		// The best an hour -- the hours under way, as the labels and the
		// classic planner count them: the price of time set to the rate
		// found, again, until it settles.
		const rateOf = d => (d.run.underWay > 0 ? d.R / d.run.underWay : 0);
		let mu = rateOf(best);
		for (let k = 0; k < 8 && mu > 0; k++) {
			const d = pick(mu);
			if (rateOf(d) > rateOf(best) + 1e-9) best = d;
			if (Math.abs(rateOf(d) - mu) <= 0.005 * Math.max(rateOf(d), 1)) break;
			mu = rateOf(d);
		}
	}
	const plan = best.plan;
	return {
		plan, seq: stationsOf(I, plan), calls: callsOf(I, plan), f: best.f, R: best.R, T: best.T,
		info: {
			R: best.R, T: best.T, bound: Math.max(best.bound, best.R), gap: best.bound > 0 ? Math.max(0, best.bound - best.R) / best.bound : 0,
			trips: best.trips.map(t => ({ id: t.id, from: t.from, to: t.to, R: t.R, T: t.T })), nodes: best.nodes, exact: best.exact, catalogue: trips.length, ms: performance.now() - t0
		}
	};
}
