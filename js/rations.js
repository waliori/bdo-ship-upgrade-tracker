// What a route eats: the ship's rations over its legs.
//
// Every hull has a ration pool, every sailor an appetite, and the Route
// tab knows how long each leg takes. What the game never publishes is
// how fast the pool falls under sail, so that figure is modelled the
// way speed is: a working estimate a player can replace by watching
// one leg -- "the pool fell N over M minutes" -- with every figure kept
// as a range until they have. Durability is a separate matter and is
// not modelled here.
//
// Pure: minutes and pools in, ranges out, so the arithmetic can be
// checked without a chart.

/**
 * Rations a minute under full sail. An estimate, and an order of
 * magnitude more than a measurement: with it a Carrack's 1.3 M pool
 * lasts about three and a half hours of continuous sailing, which is
 * the sort of day a player reports refilling after. Replace it by
 * watching one leg.
 */
export const DEFAULT_RATION_RATE = 6000;

// How far to trust the rate: half either way around the estimate --
// it is a guess at the order of magnitude -- and a seventh either way
// around a leg someone actually watched, since the pool's counter is
// read by eye at the start and the end.
export const RATION_BAND_ESTIMATE = 0.5;
export const RATION_BAND_MEASURED = 0.15;

/** Below this share of the full pool a run is called low: enough left
 *  to make a harbour, not enough to make the next island and back. */
export const RATION_RESERVE = 0.1;

/** The slow and quick ends of the drain, in rations a minute. */
export function rateRange(rate = DEFAULT_RATION_RATE, measured = false) {
	const b = measured ? RATION_BAND_MEASURED : RATION_BAND_ESTIMATE;
	return [rate * (1 - b), rate * (1 + b)];
}

/**
 * What one leg eats, least to most: the drain under sail over the
 * leg's quick and slow minutes, plus the crew's appetite -- rations a
 * day between them -- pro-rated over the same minutes.
 */
export function legRations(minutes, { rate = DEFAULT_RATION_RATE, measured = false, appetite = 0 } = {}) {
	const [fast, slow] = Array.isArray(minutes) ? minutes : [minutes, minutes];
	if (!(fast >= 0) || !(slow >= 0)) return [0, 0];
	const [lo, hi] = rateRange(rate, measured);
	const eat = m => appetite * m / 1440;
	return [lo * fast + eat(fast), hi * slow + eat(slow)];
}

/**
 * The pool over a whole route. `legs` are each leg's minutes as
 * [quick, slow] -- or `{ minutes, refill: true }` for a leg that ends
 * at a wharf where the pool is filled again; `aboard` the rations
 * aboard at the start and `full` the pool when full. Returns the run's
 * use and what is left at the end as ranges, each leg's own, and
 * `lowAfter`: the number of the stop (1 for the stop the first leg
 * arrives at) after which the pool would first be below the reserve at
 * the pessimistic end -- or 0 when it never is.
 */
export function rationPlan({ legs = [], aboard, full = 0, rate = DEFAULT_RATION_RATE, measured = false, appetite = 0, reserve = RATION_RESERVE } = {}) {
	const start = Number.isFinite(aboard) && aboard >= 0 ? aboard : full;
	const floor = full * reserve;
	let lo = 0, hi = 0, lowAfter = 0;
	let left = [start, start];
	const out = [];
	legs.forEach((leg, k) => {
		const minutes = Array.isArray(leg) ? leg : leg.minutes;
		const [a, b] = legRations(minutes, { rate, measured, appetite });
		lo += a; hi += b;
		left = [Math.max(0, left[0] - b), Math.max(0, left[1] - a)];
		if (!lowAfter && left[0] < floor) lowAfter = k + 1;
		out.push({ use: [a, b], left, refill: !Array.isArray(leg) && leg.refill === true });
		if (!Array.isArray(leg) && leg.refill) left = [full, full];
	});
	return { start, full, use: [lo, hi], left, lowAfter, legs: out };
}

/**
 * What one watched leg says the drain is: the pool fell `fell` over
 * `minutes` of sailing, less what the crew ate in that time, in
 * rations a minute -- or null when the numbers cannot say.
 */
export function calibrateRations(fell, minutes, appetite = 0) {
	if (!(fell > 0) || !(minutes > 0)) return null;
	const rate = (fell - appetite * minutes / 1440) / minutes;
	return rate > 0 ? Math.round(rate) : null;
}

/** "120 k", "1.3 M": a ration count as a person reads it off the pool. */
export function fmtRations(n) {
	if (!Number.isFinite(n)) return '';
	const abs = Math.abs(n);
	if (abs >= 1e6) return `${(n / 1e6).toFixed(abs < 1e7 ? 2 : 1).replace(/\.?0+$/, '')} M`;
	if (abs >= 1e3) return `${Math.round(n / 1e3)} k`;
	return String(Math.round(n));
}

/** A ration range as one figure when its ends read the same, else
 *  "40–90 k". */
export function fmtRationRange([lo, hi]) {
	const a = fmtRations(lo), b = fmtRations(hi);
	if (a === b) return a;
	const unit = t => (/ ([kM])$/.exec(t) || [])[1] || '';
	return unit(a) === unit(b) ? `${a.replace(/ [kM]$/, '')}–${b}` : `${a}–${b}`;
}
