// The Special Barter: when the next one may come.
//
// The game's files hold the Special Barter's offers and nothing about
// when one opens: the server decides, and the game says only that "completing
// more regular barters increases the chance". The community counted it
// (their Discord, 2026-11): how many barters of one tier alone it took.
// Read as one pool every barter adds to -- a [Level 6] -> [Level 7]
// adds about twelve times what a land good -> [Level 1] does -- each
// column is the pool's size in that tier's barters, and a day of mixed
// tiers adds up their shares. The spread inside a column is the chance:
// the pool has no hard edge, so the gauge shows a zone, not a number.
//
// Pure: the counts come from the runs the app recorded, so an undone run
// takes its barters back with it.

import { levelOf, isGreatOcean } from './barter.js';

/**
 * What the community counted: barters of one tier alone before a
 * Special Barter came, each figure one sailor's. A tier is named by the
 * level of the good handed over ('0' a land good); '4g' is a [Level 4]
 * taken to one of the five [Great Ocean] goods (sold for 25,000,000),
 * '4' one taken to a plain [Level 5] (10,000,000). `mix` is the [Level 4]
 * column where the sailor did not note which: shown, never weighed.
 */
export const COMMUNITY = {
	0: [904, 884, 844, 801],
	1: [426, 420, 415, 413, 406],
	2: [286, 286, 282, 280, 280],
	3: [208, 207, 205, 198, 193],
	4: [179, 166, 160, 158, 155],
	'4g': [105, 103, 103],
	5: [93, 93],
	6: [74, 74],
	mix: [153, 152, 141]
};

/** The tiers that are weighed, lowest first. */
export const TIERS = ['0', '1', '2', '3', '4', '4g', '5', '6'];

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

/** How many of a tier's barters fill the pool, on average. */
export const POOL = Object.fromEntries(TIERS.map(t => [t, mean(COMMUNITY[t])]));

/**
 * Where in the pool a Special Barter came, as a share of the average:
 * the earliest and the latest any sailor saw, over every column.
 */
export const ZONE = (() => {
	let lo = Infinity, hi = 0;
	for (const t of TIERS) for (const n of COMMUNITY[t]) { lo = Math.min(lo, n / POOL[t]); hi = Math.max(hi, n / POOL[t]); }
	return { lo, hi };
})();

/** The tier an exchange counts in: the level handed over, with the
 *  [Great Ocean] goods apart. */
export function tierOf(give, recv) {
	const lv = levelOf(give) || 0;
	if (lv > 6) return null;
	return lv === 4 && isGreatOcean(recv) ? '4g' : String(lv);
}

/** A share of the pool: 1 is full on average. */
export function fillOf(counts) {
	let f = 0;
	for (const [t, n] of Object.entries(counts || {})) if (POOL[t]) f += (Number(n) || 0) / POOL[t];
	return f;
}

/** Add `n` barters of an exchange to `counts`. */
export function addTo(counts, give, recv, n) {
	const t = tierOf(give, recv);
	const k = Math.round(Number(n) || 0);
	if (t && k > 0) counts[t] = (counts[t] || 0) + k;
	return counts;
}

/**
 * The barters recorded since `since` (ms), by tier, from the profile's
 * runs: each run keeps its stops ticked, an island's as
 * { k: 'n', g: given, i: received, t: times }.
 *
 * A run is recorded when it ends, its stops with no time of their own, so
 * one reported part-way would count whole towards the next. `skip` is the
 * island stops already ticked when it was reported: the first run recorded
 * after `since` leaves that many out, in the order they were sailed.
 */
export function countsSince(runs, since, skip = 0) {
	const out = {};
	const after = (Array.isArray(runs) ? runs : []).filter(r => r && Number(r.at) > since).sort((a, b) => a.at - b.at);
	// ponytail: a run reported part-way then abandoned leaves the skip to the
	// next run recorded; a per-stop time in stops_ would end that.
	after.forEach((r, j) => {
		let drop = j === 0 ? Math.max(0, Number(skip) || 0) : 0;
		for (const s of Array.isArray(r.stops_) ? r.stops_ : []) {
			if (!s || s.k !== 'n') continue;
			if (drop > 0) { drop--; continue; }
			addTo(out, s.g, s.i, s.t);
		}
	});
	return out;
}

/** Two tables of counts added. */
export function plus(a, b) {
	const out = { ...a };
	for (const [t, n] of Object.entries(b || {})) if (POOL[t]) out[t] = Math.max(0, (out[t] || 0) + (Number(n) || 0));
	return out;
}

/**
 * Where the sailor stands: the share of the pool, and what is left to
 * the zone in barters of their own mix (the tiers they barter, weighed
 * as they barter them) -- `left` and `most` are null while nothing has
 * been counted, and 0 once inside.
 */
export function standing(counts) {
	const fill = fillOf(counts);
	const n = Object.entries(counts || {}).reduce((a, [t, k]) => a + (POOL[t] ? Number(k) || 0 : 0), 0);
	const per = n > 0 ? fill / n : 0;
	const to = edge => (per > 0 ? Math.max(0, Math.ceil((edge - fill) / per)) : null);
	return { fill, barters: n, left: to(ZONE.lo), most: to(ZONE.hi), inside: fill >= ZONE.lo };
}
