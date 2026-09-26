// Putting islands into an order of visits.
//
// A lone island at the foot of a climb earns nothing until the climb is
// done, so a builder that judged islands one at a time would never take
// the first step. Islands go in by the climb: every rung of a chain,
// each after the one below it, where it lengthens the route least; and a
// chain is kept when the run it makes is worth more.

import { indexOf, startOf, endVisit, robustEval } from './common.mjs';

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

/** The quick judge: the visits as they stand, no calls, sailed robust. */
export function quick(I, seq, mu) {
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
export function growByChains(I, seq, pool, mu, { most = Infinity, pairs = true } = {}) {
	let cur = seq.slice();
	let f = quick(I, cur, mu);
	let judged = 0;
	for (;;) {
		let best = null;
		const inSeq = new Set(cur.map(v => v.at));
		const open = pool.filter(c => !c.rungs.every(id => inSeq.has(id)));
		for (const c of open) {
			if (judged++ >= most) break;
			const cand = withChain(I, cur, c.rungs);
			const g = quick(I, cand, mu);
			if (g > f + 1e-6 && (!best || g > best.g)) best = { g, cand };
		}
		if (!best && pairs) {
			for (let i = 0; i < open.length && judged < most; i++) {
				const one = withChain(I, cur, open[i].rungs);
				for (let j = i + 1; j < open.length && judged < most; j++) {
					judged++;
					const cand = withChain(I, one, open[j].rungs);
					const g = quick(I, cand, mu);
					if (g > f + 1e-6 && (!best || g > best.g)) best = { g, cand };
				}
			}
		}
		if (!best) break;
		cur = best.cand; f = best.g;
	}
	return { seq: cur, f };
}
