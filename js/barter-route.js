// The way round: the shortest order through the stops of a run.
//
// Every planner on the Barter tab ends with the same question -- in
// what order are these islands sailed -- and answered it with the
// nearest one next, which is the order a sailor falls into and not
// the shortest one: the nearest island is often behind the ship by
// the time the third is dealt, and the route doubles back for it.
// This file answers the question properly, once, for all of them.
//
// Three shapes of it. A plain tour, for the material run: points to
// be visited once each, from a start, home at the end. Ladders, for
// the silver run's shortest way: chains of stops that may interleave
// with one another but never within themselves, since a good is not
// handed over before it is made. Blocks, for chain after chain: each
// chain sailed whole, and only their order to choose. And beneath
// them the lots: a run too heavy for one trip cut into trips, each
// within the hold, so that islands near one another are sailed on
// the same trip rather than on whichever the chains fell into.
//
// The distances are by water. The sea between two of the chart's
// fixed points -- an island, a harbour, a wharf -- was bent round the
// land once by the router and its length written into sea_dist.js;
// anything else is a straight line stretched a quarter for the land
// in the way, the guess the tab used everywhere before.
//
// Pure: points and a distance come in, an order and its length go
// out. Every search is deterministic, so a run laid twice is the same
// run.

import { SEA_DIST_POINTS, SEA_DIST } from './sea_dist.js';
import { METRES_PER_PX } from './sailing.js';

/** What a straight line is stretched by, for land in the way, where
 *  the sea length of a leg is not on file. */
export const STRETCH = 1.25;

let table = null;
// A point's place in the table, kept by the point itself: the islands,
// harbours and wharves are the same objects every time they are asked
// about, and the search asks about them a great many times.
const PLACES = new WeakMap();
function placeOf(p, t) {
	let i = PLACES.get(p);
	if (i === undefined) { i = t.index.get(`${p.x},${p.y}`); if (i === undefined) i = -1; PLACES.set(p, i); }
	return i;
}
function seaTable() {
	if (table) return table;
	const raw = typeof atob === 'function' ? atob(SEA_DIST) : Buffer.from(SEA_DIST, 'base64').toString('latin1');
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	const index = new Map(SEA_DIST_POINTS.map(([x, y], i) => [`${x},${y}`, i]));
	table = { n: SEA_DIST_POINTS.length, index, bytes };
	return table;
}

/**
 * How far it is from `a` to `b` by water, in chart pixels: the length
 * of the leg the router bends between them when both are fixed points
 * of the chart, else the straight line stretched a quarter. Nought
 * when either is missing, so a plan without a start can still ask.
 */
export function seaDist(a, b) {
	if (!a || !b) return 0;
	if (a.x === b.x && a.y === b.y) return 0;
	const t = seaTable();
	let i = placeOf(a, t), j = placeOf(b, t);
	if (i < 0 || j < 0) return Math.hypot(a.x - b.x, a.y - b.y) * STRETCH;
	if (i > j) [i, j] = [j, i];
	const k = i * t.n - (i * (i + 1)) / 2 + (j - i - 1);
	return (t.bytes[2 * k] | (t.bytes[2 * k + 1] << 8)) / METRES_PER_PX;
}

/** Whether the sea length between two points is on file. */
export function seaKnown(a, b) {
	if (!a || !b) return false;
	const t = seaTable();
	return placeOf(a, t) >= 0 && placeOf(b, t) >= 0;
}

/** The length of a route through `points`, by water, in chart pixels. */
export function routeLength(points, dist = seaDist) {
	let L = 0;
	for (let i = 1; i < points.length; i++) L += dist(points[i - 1], points[i]);
	return L;
}

// A small deterministic random, for the kicks that shake a route out
// of a local best: the same inputs shake the same way, so a run laid
// twice is the same run.
function rng(seed) {
	let s = (seed >>> 0) || 1;
	return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * The shortest order through several ladders at once.
 *
 * `ladders` are lists of points; the points of one ladder are visited
 * in the order given, and the ladders may be threaded through one
 * another however is shortest. The route runs from `start` (or from
 * the first stop, when there is none) and ends at `end`: a point, a
 * function of the last stop giving the way home from it, or nothing.
 * `dist` is the measure. `effort` is how hard to look: 0 lays the
 * nearest stop next and stops there, 1 shortens that by moving short
 * runs of stops, 2 -- the default -- also reverses stretches, moves
 * runs of any length, starts from two ends and shakes the best a few
 * times to see whether it settles lower.
 *
 * Returns { order, length }: the stops as [{ k, j }] -- ladder and
 * rung -- in sailing order, and the route's length.
 */
export function orderLadders(ladders, { start = null, end = null, dist = seaDist, effort = 2 } = {}) {
	const nodes = [];
	const first = [];
	ladders.forEach((L, k) => { first.push(nodes.length); L.forEach((p, j) => nodes.push({ k, j, p })); });
	const n = nodes.length;
	if (!n) return { order: [], length: 0 };
	const K = nodes.map(x => x.k);
	const D = nodes.map(a => nodes.map(b => (a === b ? 0 : dist(a.p, b.p))));
	const S = nodes.map(a => (start ? dist(start, a.p) : 0));
	const E = nodes.map(a => (typeof end === 'function' ? end(a.p) : end ? dist(a.p, end) : 0));
	const START = -1, END = -2;
	const link = (a, b) => (a === START ? (b === END ? 0 : S[b]) : b === END ? E[a] : D[a][b]);
	const cost = seq => {
		let c = 0, at = START;
		for (const t of seq) { c += link(at, t); at = t; }
		return c + link(at, END);
	};
	const answer = seq => ({ order: seq.map(t => ({ k: K[t], j: nodes[t].j })), length: cost(seq) });

	// Nearest next, among the rungs whose rung beneath is laid.
	const nearest = () => {
		const next = ladders.map(() => 0);
		const seq = [];
		let at = START;
		while (seq.length < n) {
			let best = -1, bd = Infinity;
			for (let k = 0; k < ladders.length; k++) {
				if (next[k] >= ladders[k].length) continue;
				const t = first[k] + next[k];
				const d = link(at, t);
				if (d < bd - 1e-9) { bd = d; best = t; }
			}
			seq.push(best); next[K[best]]++; at = best;
		}
		return seq;
	};
	// Ladder by ladder, nearest first, each rung put in where it adds
	// least -- after the rung beneath it.
	const insertion = () => {
		const seq = [];
		const ks = ladders.map((_, k) => k).filter(k => ladders[k].length).sort((a, b) => S[first[a]] - S[first[b]] || a - b);
		for (const k of ks) {
			let lo = 0;
			for (let j = 0; j < ladders[k].length; j++) {
				const t = first[k] + j;
				let bq = lo, bc = Infinity;
				for (let q = lo; q <= seq.length; q++) {
					const a = q > 0 ? seq[q - 1] : START, b = q < seq.length ? seq[q] : END;
					const c = link(a, t) + link(t, b) - link(a, b);
					if (c < bc - 1e-9) { bc = c; bq = q; }
				}
				seq.splice(bq, 0, t);
				lo = bq + 1;
			}
		}
		return seq;
	};

	const maxBlock = effort >= 2 ? n : 3;
	const improve = seq0 => {
		let seq = seq0.slice();
		if (effort < 1) return seq;
		let passes = 0, improved = true;
		while (improved && passes++ < 200) {
			improved = false;
			// A block of stops moved, forwards or back, as far as it passes
			// no stop of its own ladders; turned round on the way when its
			// stops are all of different ladders and that is shorter.
			outer: for (let size = 1; size <= Math.min(maxBlock, seq.length - 1); size++) {
				for (let i = 0; i + size <= seq.length; i++) {
					const b0 = seq[i], b1 = seq[i + size - 1];
					const prev = i > 0 ? seq[i - 1] : START, next = i + size < seq.length ? seq[i + size] : END;
					const saved = link(prev, b0) + link(b1, next) - link(prev, next);
					if (saved <= 1e-6) continue;
					const inBlock = new Set();
					for (let q = i; q < i + size; q++) inBlock.add(K[seq[q]]);
					const canFlip = size > 1 && inBlock.size === size;
					for (const dir of [1, -1]) {
						for (let p = dir > 0 ? i + size : i - 1; dir > 0 ? p < seq.length : p >= 0; p += dir) {
							if (inBlock.has(K[seq[p]])) break;
							const a = dir > 0 ? seq[p] : p > 0 ? seq[p - 1] : START;
							const b = dir > 0 ? (p + 1 < seq.length ? seq[p + 1] : END) : seq[p];
							const base = link(a, b);
							const straight = link(a, b0) + link(b1, b) - base;
							const flipped = canFlip ? link(a, b1) + link(b0, b) - base : Infinity;
							const add = Math.min(straight, flipped);
							if (add < saved - 1e-6) {
								const block = seq.slice(i, i + size);
								if (flipped < straight) block.reverse();
								const rest = [...seq.slice(0, i), ...seq.slice(i + size)];
								const q = dir > 0 ? p + 1 - size : p;
								seq = [...rest.slice(0, q), ...block, ...rest.slice(q)];
								improved = true;
								break outer;
							}
						}
					}
				}
			}
			if (improved || effort < 2) continue;
			// A stretch turned round, when no two of its stops share a ladder.
			rev: for (let i = 0; i < seq.length - 1; i++) {
				const seenK = new Set([K[seq[i]]]);
				for (let j = i + 1; j < seq.length; j++) {
					if (seenK.has(K[seq[j]])) break;
					seenK.add(K[seq[j]]);
					const prev = i > 0 ? seq[i - 1] : START, next = j + 1 < seq.length ? seq[j + 1] : END;
					const delta = link(prev, seq[j]) + link(seq[i], next) - link(prev, seq[i]) - link(seq[j], next);
					if (delta < -1e-6) {
						const mid = seq.slice(i, j + 1).reverse();
						seq = [...seq.slice(0, i), ...mid, ...seq.slice(j + 1)];
						improved = true;
						break rev;
					}
				}
			}
			if (improved) continue;
			// Two stops of different ladders swapped, when neither passes a
			// stop of its own ladder on the way.
			swap: for (let i = 0; i < seq.length - 1; i++) {
				for (let j = i + 1; j < seq.length; j++) {
					const ki = K[seq[i]], kj = K[seq[j]];
					if (ki === kj) break;
					let blocked = false;
					for (let q = i + 1; q < j && !blocked; q++) if (K[seq[q]] === ki || K[seq[q]] === kj) blocked = true;
					if (blocked) continue;
					const prev = i > 0 ? seq[i - 1] : START, next = j + 1 < seq.length ? seq[j + 1] : END;
					const a = seq[i], b = seq[j];
					let delta;
					if (j === i + 1) delta = link(prev, b) + link(b, a) + link(a, next) - link(prev, a) - link(a, b) - link(b, next);
					else {
						const ai = seq[i + 1], bj = seq[j - 1];
						delta = link(prev, b) + link(b, ai) + link(bj, a) + link(a, next) - link(prev, a) - link(a, ai) - link(bj, b) - link(b, next);
					}
					if (delta < -1e-6) {
						seq = seq.slice();
						[seq[i], seq[j]] = [seq[j], seq[i]];
						improved = true;
						break swap;
					}
				}
			}
		}
		return seq;
	};

	let best = improve(nearest());
	let bc = cost(best);
	if (effort >= 1) {
		const ins = improve(insertion());
		const ic = cost(ins);
		if (ic < bc - 1e-6) { best = ins; bc = ic; }
	}
	if (effort >= 2 && n > 3) {
		// Shaken: a stop of one ladder moved to any place it may go, the
		// rest laid again from there; kept when it settles lower.
		const rand = rng(n * 7919 + Math.round(bc));
		const kicks = Math.min(12, 2 * n);
		for (let kick = 0; kick < kicks; kick++) {
			const seq = best.slice();
			const i = Math.floor(rand() * n);
			const k = K[seq[i]];
			let lo = 0, hi = n;   // where seq[i] may go: between its ladder's neighbours
			for (let q = 0; q < n; q++) if (K[seq[q]] === k) { if (q < i) lo = q + 1; if (q > i && hi === n) hi = q; }
			const rest = [...seq.slice(0, i), ...seq.slice(i + 1)];
			const q = lo + Math.floor(rand() * Math.max(1, hi - lo));
			const shaken = improve([...rest.slice(0, q), seq[i], ...rest.slice(q)]);
			const c = cost(shaken);
			if (c < bc - 1e-6) { best = shaken; bc = c; }
		}
	}
	return answer(best);
}

/**
 * The shortest way through `points` once each: from `start` when
 * given, ending at `end` when given, else wherever it ends -- and
 * without a start, beginning wherever is shortest. Returns the order
 * as indices into `points`.
 */
export function tour(points, { start = null, end = null, dist = seaDist, effort = 2 } = {}) {
	const n = points.length;
	if (n < 2) return points.map((_, i) => i);
	if (start) return orderLadders(points.map(p => [p]), { start, end, dist, effort }).order.map(o => o.k);
	let best = null, bc = Infinity;
	for (let f = 0; f < n; f++) {
		const rest = points.map((p, i) => i).filter(i => i !== f);
		const r = orderLadders(rest.map(i => [points[i]]), { start: points[f], end, dist, effort });
		if (r.length < bc - 1e-6) { bc = r.length; best = [f, ...r.order.map(o => rest[o.k])]; }
	}
	return best;
}

/**
 * The shortest order of `blocks` sailed whole, one after another:
 * each is { first, last, inner } -- where it is entered, where it is
 * left, and its own length between -- and only their order is chosen.
 * From `start`, ending at `end` (a point, a function of the last
 * point, or nothing). Returns { order, length }: indices into
 * `blocks`, and the whole route's length.
 */
export function orderBlocks(blocks, { start = null, end = null, dist = seaDist } = {}) {
	const n = blocks.length;
	if (!n) return { order: [], length: 0 };
	const L = blocks.map((a, i) => blocks.map((b, j) => (i === j ? 0 : dist(a.last, b.first))));
	const S = blocks.map(b => (start ? dist(start, b.first) : 0));
	const E = blocks.map(b => (typeof end === 'function' ? end(b.last) : end ? dist(b.last, end) : 0));
	const inner = blocks.reduce((a, b) => a + (b.inner || 0), 0);
	const cost = seq => {
		let c = S[seq[0]];
		for (let i = 1; i < seq.length; i++) c += L[seq[i - 1]][seq[i]];
		return c + E[seq[seq.length - 1]] + inner;
	};
	// Nearest first, from where the last was left.
	const left = new Set(blocks.map((_, i) => i));
	let seq = [];
	while (left.size) {
		let best = -1, bd = Infinity;
		for (const i of left) {
			const d = seq.length ? L[seq[seq.length - 1]][i] : S[i];
			if (d < bd - 1e-9) { bd = d; best = i; }
		}
		seq.push(best); left.delete(best);
	}
	let bc = cost(seq);
	let improved = true, passes = 0;
	while (improved && passes++ < 100) {
		improved = false;
		// One block moved anywhere; two swapped; a stretch turned round.
		const tries = [];
		for (let i = 0; i < n; i++) for (let q = 0; q <= n; q++) if (q !== i && q !== i + 1) tries.push(() => { const rest = seq.filter((_, k) => k !== i); const p = q > i ? q - 1 : q; return [...rest.slice(0, p), seq[i], ...rest.slice(p)]; });
		for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) tries.push(() => { const s = seq.slice(); [s[i], s[j]] = [s[j], s[i]]; return s; });
		for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) tries.push(() => [...seq.slice(0, i), ...seq.slice(i, j + 1).reverse(), ...seq.slice(j + 1)]);
		for (const t of tries) {
			const s = t();
			const c = cost(s);
			if (c < bc - 1e-6) { seq = s; bc = c; improved = true; break; }
		}
	}
	return { order: seq, length: bc };
}

/**
 * The lots a run is cut into, shortened. `seed` is a cut that fits --
 * lists of items, in the order the lots are sailed -- and `cost` is
 * the length of the run sailed that way, `fits` whether every lot of
 * a cut fits the hold at its place in the run. Items are moved to
 * other lots or lots of their own, swapped between lots, and lots
 * swapped in the run's order, whichever shortens it, until nothing
 * does; `most` bounds how many cuts are weighed. Returns the shortest
 * cut found, `seed` itself when nothing shortens it.
 */
export function improveLots(seed, { cost, fits, most = 600 } = {}) {
	const tidy = lots => lots.filter(l => l.length);
	let best = tidy(seed.map(l => l.slice()));
	if (best.length < 1) return best;
	let bc = cost(best);
	let weighed = 0;
	// The length first and the hold after: the routes are kept and the
	// hold is weighed afresh, and most cuts are not shorter anyway.
	const better = cand => {
		if (weighed++ >= most) return false;
		const t = tidy(cand);
		const c = cost(t);
		if (c >= bc - 1e-6 || !fits(t)) return false;
		best = t; bc = c;
		return true;
	};
	let improved = true;
	while (improved && weighed < most) {
		improved = false;
		const items = best.flat();
		// Each item to each other lot, or to a lot of its own.
		relocate: for (const item of items) {
			const from = best.findIndex(l => l.includes(item));
			for (let L = 0; L <= best.length; L++) {
				if (L === from || (L === best.length && best[from].length === 1)) continue;
				const cand = best.map(l => l.filter(x => x !== item));
				if (L === best.length) cand.push([item]); else cand[L] = [...cand[L], item];
				if (better(cand)) { improved = true; break relocate; }
			}
		}
		if (improved) continue;
		// Two items of different lots swapped.
		swap: for (let a = 0; a < best.length - 1; a++) {
			for (let b = a + 1; b < best.length; b++) {
				for (const x of best[a]) for (const y of best[b]) {
					const cand = best.map((l, i) => (i === a ? l.map(z => (z === x ? y : z)) : i === b ? l.map(z => (z === y ? x : z)) : l));
					if (better(cand)) { improved = true; break swap; }
				}
			}
		}
		if (improved) continue;
		// Two lots sailed the other way round.
		order: for (let a = 0; a < best.length - 1; a++) {
			for (let b = a + 1; b < best.length; b++) {
				const cand = best.slice();
				[cand[a], cand[b]] = [cand[b], cand[a]];
				if (better(cand)) { improved = true; break order; }
			}
		}
	}
	return best;
}

/**
 * A cut grown lot by lot: the item nearest the lot's start opens it,
 * and the item that lengthens the lot least joins while the lot still
 * fits; when nothing more fits the lot is closed and the next opened.
 * `cost` and `fits` are as for improveLots; `near` ranks the items
 * for opening a lot. Every item lands in some lot: one that fits
 * nowhere gets a lot of its own.
 */
export function growLots(items, { cost, fits, near } = {}) {
	const left = items.slice().sort((a, b) => near(a) - near(b));
	const lots = [];
	while (left.length) {
		const lot = [left.shift()];
		let more = true;
		while (more && left.length) {
			more = false;
			// Shortest first, and the first that fits the hold joins.
			const byCost = left.map((item, i) => ({ i, c: cost([...lots, [...lot, item]]) })).sort((a, b) => a.c - b.c);
			const pick = byCost.find(x => fits([...lots, [...lot, left[x.i]]]));
			if (pick) { lot.push(left.splice(pick.i, 1)[0]); more = true; }
		}
		lots.push(lot);
	}
	return lots;
}
