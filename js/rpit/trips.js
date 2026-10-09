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

import { finish, indexOf, robustEval } from './common.js';

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
export function tripOf(I, seq, { from = 'start', to = I.rules.end, chainIds = [] } = {}) {
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
		id: chainIds.length ? chainIds.join('+') : seq.map(v => v.at).join('>'),
		from, to, chainIds, seq: out.visits, calls: out.calls, plan: out.plan,
		f: e.f, R: r.R, T: r.underWay, Tfull: r.T, P: r.P, att, loads, buys: { ...(out.plan.buy || {}) }, drops
	};
}
