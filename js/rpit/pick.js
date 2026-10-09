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
// whatever the prices (any λ ≥ 0 gives a valid bound; Polyak's steps
// from a greedy day's value make it a tight one).

import { indexOf } from './common.js';

/** Hours under way from wharf `a` to wharf `b`. */
export function legHours(I, a, b) {
	if (a === b) return 0;
	const { dist } = indexOf(I);
	return dist(a, b) / (I.rules.underWaySpeed ?? I.vehicle.speed) / 3600;
}

/**
 * The day's state and rules: whether a trip still fits after those taken,
 * and the taking and un-taking of one. Shared by the greedy day, the
 * bound and the search.
 */
function dayState(I, { H, mu }) {
	const caps = new Map(I.stations.map(s => [s.id, s.m]));
	const stock = new Map(I.depots.map(d => [d.id, { ...(d.storage || {}) }]));
	const bar = I.budgets.P + (I.budgets.vouchers ? I.budgets.vouchers.n * I.budgets.vouchers.each : 0);
	const used = { T: 0, P: 0, att: {}, loads: {}, buys: {}, drops: new Set(), at: 'start' };
	const worth = t => t.f - mu * t.T;
	/** The leg to the trip's start when it fits, else null. */
	const fits = t => {
		// Where the ship is at the start is left once.
		if (t.from === 'start' && used.at !== 'start') return null;
		const leg = legHours(I, used.at, t.from);
		if (used.T + leg + t.T > H + 1e-9 || used.P + t.P > bar + 1e-9) return null;
		for (const [s, n] of Object.entries(t.att)) if ((used.att[s] || 0) + n > caps.get(s)) return null;
		for (const [w, what] of Object.entries(t.drops)) for (const g of Object.keys(what)) if (used.drops.has(`${w}/${g}`)) return null;
		for (const [w, what] of Object.entries(t.loads)) for (const [g, n] of Object.entries(what)) {
			if ((used.loads[`${w}/${g}`] || 0) + n > ((stock.get(w) || {})[g] || 0) + 1e-9) return null;
		}
		for (const [g, n] of Object.entries(t.buys)) { const cap = I.goods[g] && I.goods[g].cap; if (cap !== null && cap !== undefined && (used.buys[g] || 0) + n > cap + 1e-9) return null; }
		return leg;
	};
	const take = (t, leg) => {
		const was = used.at;
		used.T += leg + t.T; used.P += t.P; used.at = t.to;
		for (const [s, n] of Object.entries(t.att)) used.att[s] = (used.att[s] || 0) + n;
		for (const [w, what] of Object.entries(t.loads)) for (const [g, n] of Object.entries(what)) used.loads[`${w}/${g}`] = (used.loads[`${w}/${g}`] || 0) + n;
		for (const [w, what] of Object.entries(t.drops)) for (const [g, n] of Object.entries(what)) {
			used.drops.add(`${w}/${g}`);
			// What a trip leaves at a wharf, a later one may load.
			if (!stock.has(w)) stock.set(w, {});
			stock.get(w)[g] = (stock.get(w)[g] || 0) + n;
		}
		for (const [g, n] of Object.entries(t.buys)) used.buys[g] = (used.buys[g] || 0) + n;
		return was;
	};
	const untake = (t, leg, was) => {
		used.T -= leg + t.T; used.P -= t.P; used.at = was;
		for (const [s, n] of Object.entries(t.att)) used.att[s] -= n;
		for (const [w, what] of Object.entries(t.loads)) for (const [g, n] of Object.entries(what)) used.loads[`${w}/${g}`] -= n;
		for (const [w, what] of Object.entries(t.drops)) for (const [g, n] of Object.entries(what)) { used.drops.delete(`${w}/${g}`); stock.get(w)[g] -= n; }
		for (const [g, n] of Object.entries(t.buys)) used.buys[g] -= n;
	};
	/** The trips taken in the order given while each still fits; the state left as found. */
	const greedy = order => {
		const picks = [];
		let v = 0;
		for (const t of order) { const leg = fits(t); if (leg !== null) { picks.push({ t, leg, was: take(t, leg) }); v += worth(t); } }
		for (const p of picks.slice().reverse()) untake(p.t, p.leg, p.was);
		return { value: v, trips: picks.map(p => p.t) };
	};
	return { caps, used, worth, fits, take, untake, greedy };
}

/**
 * The relaxed day: the attempt caps priced at λ into the trips, the hours
 * taken as a fraction. For any λ ≥ 0 its value is an upper bound on every
 * day; Polyak's steps from a known day's value `lb` bring it down.
 */
function relaxed(I, trips, { H, mu, lb = 0, steps = 60 }) {
	const caps = [...new Map(I.stations.map(s => [s.id, s.m]))];
	const lam = new Map();
	const value = t => t.f - mu * t.T - Object.entries(t.att).reduce((a, [s, n]) => a + (lam.get(s) || 0) * n, 0);
	// The fractional knapsack on hours at the prices in hand.
	const at = () => {
		const take = new Map();
		let r = 0, h = H;
		for (const x of trips.map(t => ({ t, p: value(t) })).filter(x => x.p > 0).sort((a, b) => b.p / b.t.T - a.p / a.t.T)) {
			if (h <= 1e-12) break;
			const f = Math.min(1, h / x.t.T);
			r += f * x.p; h -= f * x.t.T;
			for (const [s, n] of Object.entries(x.t.att)) take.set(s, (take.get(s) || 0) + f * n);
		}
		for (const [s, m] of caps) r += (lam.get(s) || 0) * m;
		return { bound: r, take };
	};
	let { bound: best, take } = at();
	let bestLam = new Map(lam), alpha = 2, stale = 0;
	for (let k = 0; k < steps && best > lb + 1e-9; k++) {
		// The subgradient: the attempts taken past each cap; projected where
		// the price is already nothing and the cap has slack.
		let norm = 0;
		const g = new Map();
		for (const [s, m] of caps) {
			const d = (take.get(s) || 0) - m;
			if (d > 0 || (lam.get(s) || 0) > 0) { g.set(s, d); norm += d * d; }
		}
		if (norm <= 1e-18) break;
		const theta = alpha * (best - lb) / norm;
		for (const [s, d] of g) lam.set(s, Math.max(0, (lam.get(s) || 0) + theta * d));
		const now = at();
		take = now.take;
		if (now.bound < best - 1e-9) { best = now.bound; bestLam = new Map(lam); stale = 0; }
		else if (++stale >= 5) { alpha /= 2; stale = 0; }
	}
	return { lam: bestLam, bound: best };
}

/** An upper bound on the value of any feasible day from `trips`. */
export function bound(I, trips, { H, mu = 0, steps = 60 } = {}) {
	const cat = trips.filter(t => t.T <= H + 1e-9);
	const day = dayState(I, { H, mu });
	const lb = day.greedy(cat.slice().sort((a, b) => day.worth(b) / b.T - day.worth(a) / a.T)).value;
	return Math.max(lb, relaxed(I, cat, { H, mu, lb, steps }).bound, 0);
}

/**
 * The best day: trips in sailing order, their value, the bound and the
 * nodes searched. Depth first from a greedy day, each trip taken or left
 * in turn, cut where the trips left could not beat the best found. Past
 * `mostNodes` the search stops where it is and says so (`exact: false`).
 */
export function pickDay(I, trips, { H, mu = 0, mostNodes = 100000 } = {}) {
	const day = dayState(I, { H, mu });
	const { worth, fits, take, untake, caps, used } = day;
	const cat = trips.filter(t => t.T <= H + 1e-9 && worth(t) > 0);
	// A day to beat: the trips by their worth an hour, taken while they fit.
	const byWorth = cat.slice().sort((a, b) => worth(b) / b.T - worth(a) / a.T);
	let best = day.greedy(byWorth);
	// And with each of the best dozen trips taken first: the one the rate
	// puts first is often the one that leaves the least room.
	for (const t0 of byWorth.slice(0, 12)) {
		const g = day.greedy([t0, ...byWorth.filter(t => t !== t0)]);
		if (g.value > best.value) best = g;
	}
	const { lam, bound: root } = relaxed(I, cat, { H, mu, lb: best.value });
	const price = t => worth(t) - Object.entries(t.att).reduce((a, [s, n]) => a + (lam.get(s) || 0) * n, 0);
	// The search's order is the relaxed day's: by worth an hour at the
	// prices, so the bound of what is left is a scan down the list.
	const order = cat.slice().sort((a, b) => price(b) / b.T - price(a) / a.T);
	const priced = order.map(price);
	const g2 = day.greedy(order);
	if (g2.value > best.value) best = g2;
	const rest = k => {
		let r = 0, h = H - used.T;
		for (let i = k; i < order.length && h > 1e-12; i++) {
			if (priced[i] <= 0) continue;
			const f = Math.min(1, h / order[i].T);
			r += f * priced[i]; h -= f * order[i].T;
		}
		for (const [s, m] of caps) r += (lam.get(s) || 0) * (m - (used.att[s] || 0));
		return r;
	};
	const seq = [];
	let cur = 0, nodes = 0, exact = true;
	const dfs = k => {
		if (++nodes > mostNodes) { exact = false; return; }
		if (cur > best.value + 1e-9) best = { value: cur, trips: seq.slice() };
		if (k >= order.length || cur + rest(k) <= best.value + 1e-9) return;
		const t = order[k];
		const leg = fits(t);
		if (leg !== null) {
			const was = take(t, leg); seq.push(t); cur += worth(t);
			dfs(k + 1);
			cur -= worth(t); seq.pop(); untake(t, leg, was);
		}
		dfs(k + 1);
	};
	dfs(0);
	return { value: best.value, trips: best.trips, bound: Math.max(root, best.value), nodes, exact };
}
