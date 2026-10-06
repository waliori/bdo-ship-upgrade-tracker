// Silver an hour, found without asking what an hour is worth.
//
// A ratio is no objective a search can add to: two changes that each
// raise R/T need not raise it together. Dinkelbach's way round it: for a
// price of time μ, maximise R − μ·T, which adds; take the plan found,
// set μ to its R/T, and look again. When μ stops moving, the plan found
// at that μ has the best rate there is, as far as the inner search can
// find it. A sailor who does know what an hour is worth gives μ, and one
// look is enough.
//
// `inner(I, { mu, timeMs, warm })` returns { plan, R, T, ... }; `warm` is
// the last plan's own state, for a search that can start from it.
//
// Eight rounds, not the usual three or four: a board's best plans come
// in very different shapes -- take every climb for six hours, or one
// short climb for one -- and from μ = 0 the rate climbs a shape at a
// time. With four rounds the search stopped at a three-hour plan while
// a one-hour plan earning half as much again was one step away.

export function maximiseRate(I, inner, { timeMs = 10000, mu = null, rounds = 8, seed = 1 } = {}) {
	const t0 = performance.now();
	const left = () => Math.max(0, timeMs - (performance.now() - t0));
	if (mu !== null) return { ...inner(I, { mu, timeMs, seed }), mu };
	let cur = null, best = null, m = 0;
	for (let k = 0; k < rounds; k++) {
		const share = k === rounds - 1 ? left() : left() / (rounds - k);
		cur = inner(I, { mu: m, timeMs: share, warm: cur, seed: seed + k });
		const rate = cur.T > 0 ? cur.R / cur.T : 0;
		if (!best || rate > best.rate) best = { ...cur, rate, mu: m };
		// Settled: the price of time the plan was found at is its own rate.
		if (Math.abs(rate - m) <= 0.005 * Math.max(rate, 1)) break;
		m = rate;
		// Out of time, the rounds still run, at no time each: a search given
		// none returns its own start, so the price of time still settles, and
		// a search is never left at a worse rate than its start would reach.
	}
	return best;
}
