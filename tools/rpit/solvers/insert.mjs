// Putting islands into an order of visits.
//
// A lone island at the foot of a climb earns nothing until the climb is
// done, so a builder that judged islands one at a time would never take
// the first step. Islands go in by the climb: every rung of a chain,
// each after the one below it, where it lengthens the route least; and a
// chain is kept when the run it makes is worth more.

import { indexOf, finish, startOf, endVisit, robustEval } from './common.mjs';
import { orderLadders } from '../../../js/barter-route.js';

/** Where `id` lengthens `seq` least, at or after `from`. */
export function cheapestPos(I, seq, id, from = 0) {
	const { dist } = indexOf(I);
	let best = seq.length, bc = Infinity;
	for (let p = from; p <= seq.length; p++) {
		const a = p > 0 ? seq[p - 1].at : 'start';
		const b = p < seq.length ? seq[p].at : I.rules.end;
		const c = dist(a, id) + dist(id, b) - dist(a, b);
		if (c < bc - 1e-9) { bc = c; best = p; }
	}
	return best;
}

/**
 * The thin ladder of a climb: every attempt the top allows, and below it
 * just enough attempts to feed the rung above, counted at the least an
 * island pays. What a climb needs, not what its islands would take -- a
 * foot of ten attempts at every rung fills the hold with goods the top
 * never uses.
 */
export function thinLadder(I, rungs) {
	const { station } = indexOf(I);
	const a = new Array(rungs.length);
	let need = Infinity;
	for (let k = rungs.length - 1; k >= 0; k--) {
		const s = station.get(rungs[k]);
		a[k] = need === Infinity ? s.m : Math.min(s.m, Math.ceil(need / Math.max(s.ymin, 1e-9) - 1e-9));
		need = a[k] * s.q;
	}
	return a;
}

/** `seq` with the rungs of `rungs` put in, each after the one below it,
 *  asking for the chain's thin ladder. */
export function withChain(I, seq, rungs) {
	const out = seq.slice();
	const want = thinLadder(I, rungs);
	let from = 0;
	for (const [j, id] of rungs.entries()) {
		const have = out.findIndex(v => v.at === id);
		if (have >= 0) { from = have + 1; continue; }
		// After the island that makes its good, when that island is sailed.
		const { station } = indexOf(I);
		const g = station.get(id).in;
		const maker = out.reduce((k, v, i) => (station.get(v.at).out === g ? i : k), -1);
		const p = cheapestPos(I, out, id, Math.max(from, maker + 1));
		out.splice(p, 0, { at: id, a: want[j] });
		from = p + 1;
	}
	return out;
}

/**
 * What a candidate order is worth: made sailable first -- the wharf
 * calls the hold needs put in -- and then sailed robust. Judged without
 * the calls, a climb that needs one drop on the way stalls at the hold
 * and scores as a loss, and a builder never takes it: on a small hold at
 * a steady pace that was every climb worth taking.
 */
export function quick(I, seq, mu) {
	return finish(I, seq, mu).f;
}

/**
 * The loose judge: the visits sailed as if the hold had no limit. It
 * costs what the bare judge costs, and it never under-rates a climb that
 * needs a call on the way -- it over-rates it, by the call's time -- so
 * it can rank candidates for the dear judge to settle.
 */
export function loose(I, seq, mu) {
	const { station } = indexOf(I);
	if (!I.__loose) Object.defineProperty(I, '__loose', { value: { ...I, vehicle: { ...I.vehicle, Wfree: Infinity, Wdeal: Infinity, Wmax: Infinity } }, enumerable: false });
	const L = I.__loose;
	const visits = [...seq.map(v => ({ at: v.at, a: v.a ?? station.get(v.at).m })), endVisit(I)];
	return robustEval(L, { ...startOf(I, visits), visits }, mu).f;
}

/** The bare judge: the visits as they stand, no calls put in. Twenty
 *  times cheaper than `quick`, and blind to a climb that needs a call. */
export function bare(I, seq, mu) {
	const { station } = indexOf(I);
	const visits = [...seq.map(v => ({ at: v.at, a: v.a ?? station.get(v.at).m })), endVisit(I)];
	return robustEval(I, { ...startOf(I, visits), visits }, mu).f;
}

/**
 * Chains added one at a time, the one that raises R − μT most each time,
 * while one does -- and when none does alone, two at once. A price of
 * time near what a good run earns makes the sail out and back dearer
 * than any one climb pays, while two climbs sharing that sail pay well:
 * built one chain at a time, such a run is never begun. `pool` is the
 * chains to choose from; `most` bounds how many runs are judged.
 */
export function growByChains(I, seq, pool, mu, { most = Infinity, pairs = true, judge = quick, order = true, shortlist = 6 } = {}) {
	// A climb added where each rung costs least is still sailed in the old
	// order, which the new islands may make long: two climbs worth taking
	// together can look worse than one until the route is laid again. So
	// each candidate is laid again before it is judged (the lighter route
	// search: a builder judges many).
	const lay = order ? s => reorder(I, s, { effort: 1 }) : s => s;
	let cur = seq.slice();
	let f = judge(I, cur, mu);
	let judged = 0;
	for (;;) {
		let best = null;
		const inSeq = new Set(cur.map(v => v.at));
		const open = pool.filter(c => !c.rungs.every(id => inSeq.has(id)));
		// Every candidate ranked by the loose judge, the few best settled by
		// `judge` -- when `judge` is dear; a cheap one judges them all.
		const settle = cands => {
			let pickd = cands;
			if (judge !== bare && judge !== loose && cands.length > shortlist) {
				pickd = cands.map(cand => ({ cand, l: loose(I, cand, mu) })).sort((a, b) => b.l - a.l).slice(0, shortlist).map(x => x.cand);
			}
			for (const cand of pickd) {
				if (judged++ >= most) break;
				const g = judge(I, cand, mu);
				if (g > f + 1e-6 && (!best || g > best.g)) best = { g, cand };
			}
		};
		settle(open.map(c => lay(withChain(I, cur, c.rungs))));
		if (!best && pairs && judged < most) {
			const two = [];
			for (let i = 0; i < open.length; i++) {
				const one = withChain(I, cur, open[i].rungs);
				for (let j = i + 1; j < open.length; j++) two.push(withChain(I, one, open[j].rungs));
			}
			// Laid again only once shortlisted: the route search is the dear
			// part of a pair.
			if (judge !== bare && judge !== loose && two.length > shortlist) {
				const top = two.map(cand => ({ cand, l: loose(I, lay(cand), mu) })).sort((a, b) => b.l - a.l).slice(0, shortlist).map(x => lay(x.cand));
				for (const cand of top) { if (judged++ >= most) break; const g = judge(I, cand, mu); if (g > f + 1e-6 && (!best || g > best.g)) best = { g, cand }; }
			} else settle(two.map(lay));
		}
		if (!best) break;
		cur = best.cand; f = best.g;
	}
	return { seq: cur, f };
}

/**
 * The islands of `seq` in the shortest order that still sails every
 * island after the one that makes its good: the app's own route search
 * (orderLadders -- nearest-first and cheapest insertion, then moved
 * blocks, reversed stretches, swaps and seeded kicks) on the instance's
 * distances. The ladders are read off the order as it stands: an island
 * follows the last island before it that makes its good.
 */
export function reorder(I, seq, { effort = 2 } = {}) {
	if (seq.length < 3) return seq;
	const { station, dist } = indexOf(I);
	const ladders = [];
	const ladderOf = new Map();
	for (const [i, v] of seq.entries()) {
		const g = station.get(v.at).in;
		let maker = -1;
		for (let k = i - 1; k >= 0; k--) if (station.get(seq[k].at).out === g) { maker = k; break; }
		// A maker already feeding another island starts a ladder of its own:
		// a ladder is a line, not a tree.
		const L = maker >= 0 && ladderOf.has(maker) && ladders[ladderOf.get(maker)].at(-1) === maker ? ladderOf.get(maker) : ladders.length;
		if (L === ladders.length) ladders.push([]);
		ladders[L].push(i);
		ladderOf.set(i, L);
	}
	const r = orderLadders(ladders.map(l => l.map(i => seq[i].at)), { start: 'start', end: I.rules.end, dist, effort });
	return r.order.map(o => seq[ladders[o.k][o.j]]);
}
