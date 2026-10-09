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

import { finish, indexOf, robustEval, chainsOf, dry } from './common.js';
import { withChain, thinLadder, reorder } from './insert.js';

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
export function tripOf(I, seq, { from = 'start', to = I.rules.end, chainIds = [], id = null, calls = [] } = {}) {
	const J = fromTo(I, from, to);
	const out = finish(J, seq, 0, { calls });
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
 * near climb packed in or more attempts at an island, while the trip is
 * worth more for it (half a percent, so the catalogue is not filled with
 * twins). Laid on the day without rations: a refill changes nothing a
 * label says -- the silver, the hours under way, the Parley, the attempts
 * -- and a trip laid with its refills costs twenty times one laid without.
 * The trips a day picks are laid again with them (`wetTrip`). Trips are
 * laid from home to the run's end; the best few are laid again from where
 * the ship is, for the day's first. Bounded by `most` trips and `grow`
 * growths, so the time it takes is the board's size and nothing else.
 */
export function buildTrips(I, { pool = null, session = Infinity, most = 400, grow = 40, near = 8, firsts = Math.min(40, Math.floor(most / 10)) } = {}) {
	const chains = pool || chainsOf(I);
	const { dist, station } = indexOf(I);
	const D = I.vehicle.rations ? dry(I) : I;
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
	for (const c of chains) add(tripOf(D, ladderOf(c), { from: home, chainIds: [c.id] }));
	const byRate = (a, b) => b.f / b.T - a.f / a.T;
	// A family -- the climbs a trip is made of, thin or at all the islands
	// allow -- is grown once, from its best trip: its variants grown each
	// would spend the budget on one corner of the board.
	const grown = new Set();
	const family = t => t.id.replace(/#\d+x\d+/g, '');
	const full = t => (t.id.includes('#all') ? '#all' : '');
	// Room kept for the trips laid again from where the ship is.
	const room = most - firsts;
	for (let g = 0; g < grow && out.length < room; g++) {
		const t = out.filter(x => !grown.has(family(x))).sort(byRate)[0];
		if (!t) break;
		grown.add(family(t));
		const on = new Set(t.seq.map(v => v.at));
		const nearest = chains
			.filter(c => !t.chainIds.includes(c.id) && !c.rungs.some(id => on.has(id)))
			.map(c => ({ c, d: Math.min(...t.seq.map(v => dist(v.at, c.rungs[0]))) }))
			.sort((a, b) => a.d - b.d).slice(0, near);
		for (const { c } of nearest) {
			// The climb's rungs put in where they lengthen the route least,
			// and the whole route searched again for the shortest sail: two
			// climbs threaded together are often shorter than one laid into
			// the other, and sometimes not.
			const ids = [...t.chainIds, c.id].sort((a, b) => a - b);
			const packed = withChain(I, t.seq, c.rungs);
			const cand = tripOf(D, packed, { from: home, chainIds: ids, id: `${ids.join('+')}${full(t)}` });
			if (better(cand, t)) {
				add(cand);
				const again = tripOf(D, reorder(I, packed), { from: home, chainIds: ids, id: `${ids.join('+')}${full(t)}` });
				if (again && (again.f > cand.f + 1e-9 || (Math.abs(again.f - cand.f) <= 1e-9 && again.T < cand.T - 1e-9))) { seen.delete(key(cand)); out.splice(out.indexOf(cand), 1); add(again); }
			}
			if (out.length >= room) break;
		}
		// More attempts: every rung at all its island allows -- `finish` keeps
		// the attempts made, so a hold that stops short still writes down the
		// truth -- and one more at every rung of a climb: one more at a foot
		// alone feeds nothing, the rungs above must take it too.
		const slack = t.seq.some(v => v.a < station.get(v.at).m);
		if (slack && !full(t) && out.length < room) {
			const cand = tripOf(D, t.seq.map(w => ({ at: w.at, a: station.get(w.at).m })), { from: home, chainIds: t.chainIds, id: `${t.chainIds.join('+')}#all` });
			if (better(cand, t)) add(cand);
		}
		for (const cid of t.chainIds) {
			const rungs = new Set(chains.find(c => c.id === cid).rungs);
			// One more, two more, three more at every rung of the climb, while
			// each is worth more than the last.
			let last = t;
			for (let k = 1; k <= 3 && out.length < room; k++) {
				if (!t.seq.some(v => rungs.has(v.at) && v.a + k <= station.get(v.at).m)) break;
				const seq = t.seq.map(w => ({ at: w.at, a: rungs.has(w.at) ? Math.min(station.get(w.at).m, w.a + k) : w.a }));
				const cand = tripOf(D, seq, { from: home, chainIds: t.chainIds, id: `${t.id}#${cid}x${k}` });
				if (!better(cand, last)) break;
				add(cand); last = cand;
			}
		}
	}
	// From where the ship is, with what it holds: the day's first trip.
	for (const t of out.slice().sort(byRate).slice(0, firsts)) add(tripOf(D, t.seq, { from: 'start', chainIds: t.chainIds, id: t.id }));
	return out.sort(byRate);
}

/** A catalogue's trip laid again with its refills: the calls as grown,
 *  the refills put in; null when the ship cannot be fed on it. */
export function wetTrip(I, t) {
	return tripOf(I, t.seq, { from: t.from, to: t.to, chainIds: t.chainIds, id: t.id, calls: t.calls });
}
