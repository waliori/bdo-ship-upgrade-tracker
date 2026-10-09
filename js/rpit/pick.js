// The trip planner's second stage: the day chosen among the catalogue's
// trips, exactly.
//
// Trips touch one another through little: the hours they take, the
// attempts they use at each island, the Parley they spend, what they
// load from and drop at the storages, and the leg between where one ends
// and the next begins. So the day is a choice over labels -- a knapsack
// on hours with side constraints -- small enough for a branch and bound,
// cut by a Lagrangian bound: the attempt caps priced into the trips and
// the hours relaxed to a fraction, which is never below the best day
// whatever the prices (any λ ≥ 0 gives a valid bound; thirty subgradient
// steps make it a tight one).

import { indexOf } from './common.js';

/** Hours under way from wharf `a` to wharf `b`. */
export function legHours(I, a, b) {
	if (a === b) return 0;
	const { dist } = indexOf(I);
	return dist(a, b) / (I.rules.underWaySpeed ?? I.vehicle.speed) / 3600;
}

const capsOf = I => new Map(I.stations.map(s => [s.id, s.m]));

/** The fractional knapsack on hours over `trips` with profits `profit(t)`:
 *  the value, and what fraction of each trip it took. */
function knap(trips, profit, H) {
	let r = 0, h = H;
	const took = [];
	for (const x of trips.map(t => ({ t, p: profit(t) })).filter(x => x.p > 0).sort((a, b) => b.p / b.t.T - a.p / a.t.T)) {
		if (h <= 1e-12) break;
		const f = Math.min(1, h / x.t.T);
		r += f * x.p; h -= f * x.t.T;
		took.push({ t: x.t, f });
	}
	return { value: r, took };
}

/** Multipliers on the attempt caps that make the relaxed bound tight, by
 *  subgradient steps from zero; the bound they give; and the trips' value
 *  under them. */
function lagrange(I, trips, { H, mu, steps }) {
	const caps = capsOf(I);
	const lam = new Map();
	const value = t => t.f - mu * t.T - Object.entries(t.att).reduce((a, [s, n]) => a + (lam.get(s) || 0) * n, 0);
	const at = () => {
		const k = knap(trips, value, H);
		let b = k.value;
		for (const [s, m] of caps) b += (lam.get(s) || 0) * m;
		return { bound: b, took: k.took };
	};
	let { bound: best, took } = at();
	let step = Math.max(1, best) / 10;
	for (let k = 0; k < steps; k++) {
		// The subgradient: attempts the fractional knapsack takes past the caps.
		const take = new Map();
		for (const { t, f } of took) for (const [s, n] of Object.entries(t.att)) take.set(s, (take.get(s) || 0) + f * n);
		let moved = false;
		for (const [s, m] of caps) {
			const g = (take.get(s) || 0) - m;
			const l = Math.max(0, (lam.get(s) || 0) + step * g / Math.max(1, m));
			if (l !== (lam.get(s) || 0)) { lam.set(s, l); moved = true; }
		}
		if (!moved) break;
		const now = at();
		took = now.took;
		if (now.bound < best) best = now.bound; else step /= 2;
	}
	return { lam, bound: best, value };
}

/** An upper bound on the value of any feasible day from `trips`. */
export function bound(I, trips, { H, mu = 0, steps = 30 } = {}) {
	return Math.max(0, lagrange(I, trips.filter(t => t.T <= H + 1e-9), { H, mu, steps }).bound);
}

/**
 * The best day: trips in sailing order, their value, the bound and the
 * nodes searched. Depth first, each trip taken or left in turn.
 */
export function pickDay(I, trips, { H, mu = 0 } = {}) {
	const caps = capsOf(I);
	const stock = new Map(I.depots.map(d => [d.id, { ...(d.storage || {}) }]));
	const bar = I.budgets.P + (I.budgets.vouchers ? I.budgets.vouchers.n * I.budgets.vouchers.each : 0);
	const cat = trips.filter(t => t.T <= H + 1e-9);
	const { lam, value } = lagrange(I, cat, { H, mu, steps: 30 });
	const order = cat.map(t => ({ t, v: t.f - mu * t.T })).filter(x => x.v > 0).sort((a, b) => b.v / b.t.T - a.v / a.t.T).map(x => x.t);
	const used = { T: 0, P: 0, att: {}, loads: {}, buys: {}, drops: new Set(), at: 'start' };
	const seq = [];
	let best = { value: 0, trips: [] }, nodes = 0;
	const fits = t => {
		const leg = legHours(I, used.at, t.from);
		if (used.T + leg + t.T > H + 1e-9 || used.P + t.P > bar + 1e-9) return null;
		for (const [s, n] of Object.entries(t.att)) if ((used.att[s] || 0) + n > caps.get(s)) return null;
		for (const [w, what] of Object.entries(t.drops)) for (const g of Object.keys(what)) if (used.drops.has(`${w}/${g}`)) return null;
		for (const [w, what] of Object.entries(t.loads)) for (const [g, n] of Object.entries(what)) {
			const have = (stock.get(w) || {})[g] || 0, got = used.loads[`${w}/${g}`] || 0;
			if (got + n > have + 1e-9) return null;
		}
		for (const [g, n] of Object.entries(t.buys)) { const cap = I.goods[g] && I.goods[g].cap; if (cap !== null && cap !== undefined && (used.buys[g] || 0) + n > cap + 1e-9) return null; }
		return leg;
	};
	const push = (t, leg, sign) => {
		used.T += sign * (leg + t.T); used.P += sign * t.P;
		for (const [s, n] of Object.entries(t.att)) used.att[s] = (used.att[s] || 0) + sign * n;
		for (const [w, what] of Object.entries(t.loads)) for (const [g, n] of Object.entries(what)) used.loads[`${w}/${g}`] = (used.loads[`${w}/${g}`] || 0) + sign * n;
		for (const [w, what] of Object.entries(t.drops)) for (const [g, n] of Object.entries(what)) {
			if (sign > 0) used.drops.add(`${w}/${g}`); else used.drops.delete(`${w}/${g}`);
			// What a trip leaves at a wharf, a later one may load.
			if (!stock.has(w)) stock.set(w, {});
			stock.get(w)[g] = (stock.get(w)[g] || 0) + sign * n;
		}
		for (const [g, n] of Object.entries(t.buys)) used.buys[g] = (used.buys[g] || 0) + sign * n;
	};
	// What the trips still to come could add at most: the hours left as a
	// fraction, the caps' slack at their prices.
	const rest = k => {
		let b = knap(order.slice(k), value, H - used.T).value;
		for (const [s, m] of caps) b += (lam.get(s) || 0) * (m - (used.att[s] || 0));
		return b;
	};
	let cur = 0;
	const dfs = k => {
		nodes++;
		if (cur > best.value + 1e-9) best = { value: cur, trips: seq.slice() };
		if (k >= order.length || cur + rest(k) <= best.value + 1e-9) return;
		const t = order[k];
		const leg = fits(t);
		if (leg !== null) {
			const was = used.at;
			push(t, leg, 1); used.at = t.to; seq.push(t); cur += t.f - mu * t.T;
			dfs(k + 1);
			cur -= t.f - mu * t.T; seq.pop(); used.at = was; push(t, leg, -1);
		}
		dfs(k + 1);
	};
	const root = Math.max(0, rest(0));
	dfs(0);
	return { value: best.value, trips: best.trips, bound: Math.max(root, best.value), nodes };
}
