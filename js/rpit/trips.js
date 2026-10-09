// The trip planner's first stage: a trip -- from one wharf, through
// islands, to a wharf -- laid and judged on its own, and the catalogue of
// trips a board allows.
//
// A trip is what the day is made of: the hold, the rations, the wharf
// calls and the waste rules are all settled inside it, and what is left
// for the day to decide is which trips, in what order -- a choice over
// labels (pick.js). A label is read off the simulator, never estimated:
// what the trip earns, how long it sails, what it spends, which attempts
// it uses at each island, what it loads and where, what it buys, what it
// drops and where.

import { finish, indexOf, robustEval, chainsOf } from './common.js';
import { withChain, thinLadder } from './insert.js';

/**
 * The instance as a trip from wharf `from` to wharf `to` sees it: the
 * ship starts where `from` is, with an empty hold unless `from` is where
 * the ship really is; loads come from `from`'s storage; the trip ends at
 * `to`. The lookups cached on `I` are not inherited.
 */
export function fromTo(I, from, to) {
	if (from === 'start' && to === I.rules.end) return I;
	const { idx } = indexOf(I);
	const s = idx.get('start'), f = idx.get(from);
	const matrix = I.travel.matrix.map(row => row.slice());
	if (from !== 'start') {
		for (let j = 0; j < matrix.length; j++) { matrix[s][j] = matrix[f][j]; matrix[j][s] = matrix[j][f]; }
		matrix[s][s] = 0;
	}
	return {
		...I,
		travel: { ...I.travel, matrix },
		initial: { ...I.initial, hold: from === 'start' ? I.initial.hold : {} },
		rules: { ...I.rules, home: from === 'start' ? I.rules.home : from, end: to }
	};
}

/** One trip laid by `finish` on the `fromTo` instance and labelled off its
 *  robust run; null when it is not worth sailing. */
export function tripOf(I, seq, { from = 'start', to = I.rules.end, chainIds = [], id = null } = {}) {
	const J = fromTo(I, from, to);
	const out = finish(J, seq, 0);
	const e = robustEval(J, out.plan, 0);
	const r = e.run;
	if (!(e.f > 0) || r.deviations.starved || r.pointless.loadThenDrop + r.pointless.storedTwice) return null;
	const att = {}, loads = {}, drops = {};
	const into = (o, at, what) => { for (const [g, n] of Object.entries(what || {})) if (n > 0) { o[at] = o[at] || {}; o[at][g] = (o[at][g] || 0) + n; } };
	for (const x of r.log) {
		if (x.kind === 'station' && x.a > 0) att[x.at] = (att[x.at] || 0) + x.a;
		if (x.kind === 'start') into(loads, J.rules.home, x.loaded);
		if (x.kind === 'depot') { into(loads, x.at, x.loaded); into(drops, x.at, x.dropped); }
	}
	return {
		id: id ?? (chainIds.length ? chainIds.join('+') : seq.map(v => v.at).join('>')),
		from, to, chainIds, seq: out.visits, calls: out.calls, plan: out.plan,
		f: e.f, R: r.R, T: r.underWay, Tfull: r.T, P: r.P, att, loads, buys: { ...(out.plan.buy || {}) }, drops
	};
}

/**
 * The catalogue: every climb alone as a seed, the best seeds grown by a
 * near climb packed in or one more attempt at an island, while the trip
 * is worth more for it (half a percent, so the catalogue is not filled
 * with twins). Trips are laid from home to the run's end; the best few
 * are laid again from where the ship is, for the day's first. Bounded by
 * `most` trips and `grow` growths, so the time it takes is the board's
 * size and nothing else.
 */
export function buildTrips(I, { pool = null, session = Infinity, most = 400, grow = 60, near = 8, firsts = Math.min(40, Math.floor(most / 10)) } = {}) {
	const chains = pool || chainsOf(I);
	const { dist, station } = indexOf(I);
	const home = I.rules.home;
	const out = [], seen = new Set();
	const key = t => `${t.id}@${t.from}>${t.to}`;
	const add = t => {
		if (!t || t.T > session + 1e-9 || seen.has(key(t))) return false;
		seen.add(key(t)); out.push(t);
		return true;
	};
	const better = (cand, t) => cand && cand.f > t.f * 1.005;
	const ladderOf = c => { const a = thinLadder(I, c.rungs); return c.rungs.map((at, k) => ({ at, a: a[k] })); };
	for (const c of chains) add(tripOf(I, ladderOf(c), { from: home, chainIds: [c.id] }));
	const byRate = (a, b) => b.f / b.T - a.f / a.T;
	const grown = new Set();
	// Room kept for the trips laid again from where the ship is.
	const room = most - firsts;
	for (let g = 0; g < grow && out.length < room; g++) {
		const t = out.filter(x => !grown.has(key(x))).sort(byRate)[0];
		if (!t) break;
		grown.add(key(t));
		const on = new Set(t.seq.map(v => v.at));
		const nearest = chains
			.filter(c => !t.chainIds.includes(c.id) && !c.rungs.some(id => on.has(id)))
			.map(c => ({ c, d: Math.min(...t.seq.map(v => dist(v.at, c.rungs[0]))) }))
			.sort((a, b) => a.d - b.d).slice(0, near);
		for (const { c } of nearest) {
			const cand = tripOf(I, withChain(I, t.seq, c.rungs), { from: home, chainIds: [...t.chainIds, c.id].sort((a, b) => a - b) });
			if (better(cand, t)) add(cand);
			if (out.length >= room) break;
		}
		for (const [k, v] of t.seq.entries()) {
			if (out.length >= room) break;
			if (v.a >= station.get(v.at).m) continue;
			const seq = t.seq.map((w, j) => (j === k ? { at: w.at, a: w.a + 1 } : { ...w }));
			const cand = tripOf(I, seq, { from: home, chainIds: t.chainIds, id: `${t.id}#${k}` });
			if (better(cand, t)) add(cand);
		}
	}
	// From where the ship is, with what it holds: the day's first trip.
	for (const t of out.slice().sort(byRate).slice(0, firsts)) add(tripOf(I, t.seq, { from: 'start', chainIds: t.chainIds, id: t.id }));
	return out.sort(byRate);
}
