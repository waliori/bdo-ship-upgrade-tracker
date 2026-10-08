// What every RPIT solver needs and none should write twice.
//
// A solver here works on the instance alone -- never the app's objects --
// and on a plan as the bench reads one: a start (what is bought and what
// is loaded from the home storage) and visits. It judges a plan the way
// the simulator plays it, in robust mode: goods counted as if every
// island paid the least and weighed as if it paid the most, which is
// what a planner that has not seen the board can promise. The objective
// is R − μ·T, silver less the hours at μ silver an hour (see ratio.mjs).
//
// The plan a solver builds says which islands, in what order, and asks
// for as many attempts as each allows; `finish` then makes it one a
// sailor could sail: it buys and loads what the islands will take and
// no more, calls at a wharf where the hold would otherwise stop a climb,
// drops the calls that do nothing, and writes down the attempts that
// were actually made, so that a spare drop keeps what is needed and not
// what was hoped for.

import { simulate, planPolicy } from './simulate.js';

/** The instance's lookups, made once. */
export function indexOf(I) {
	if (I.__index) return I.__index;
	const station = new Map(I.stations.map(s => [s.id, s]));
	const idx = new Map(I.travel.points.map((p, i) => [p, i]));
	const depots = I.depots.map(d => d.id);
	const takers = new Map();
	for (const s of I.stations) takers.set(s.in, [...(takers.get(s.in) || []), s]);
	const dist = (a, b) => I.travel.matrix[idx.get(a)][idx.get(b)];
	const storage = new Map(Object.entries(I.depots.find(d => d.id === I.rules.home).storage || {}));
	const out = { station, idx, depots, takers, dist, storage };
	Object.defineProperty(I, '__index', { value: out, enumerable: false });
	return out;
}

/**
 * Every climb the board allows, from the instance alone: a path of
 * stations, each taking what the one before pays, from a good the ship
 * can have at the start -- a land good it buys, or a good aboard or in
 * the home storage -- to a good a wharf buys. A station with several
 * takers branches. At most `depth` rungs.
 */
export function chainsOf(I, depth = 8) {
	const { takers, storage } = indexOf(I);
	const G = I.goods;
	const startable = g => (G[g] && G[g].level === 0 && G[g].b >= 0 && G[g].cap !== 0) || (I.initial.hold[g] || 0) > 0 || (storage.get(g) || 0) > 0;
	const out = [];
	const walk = (path) => {
		const last = path[path.length - 1];
		// A climb ends where its good sells -- or, on a run for coins, where it
		// is paid in Crow Coins.
		if (G[last.out] && (G[last.out].p > 0 || (I.rules.coinWorth > 0 && last.out === 'Crow Coin'))) out.push(path.map(s => s.id));
		if (path.length >= depth) return;
		for (const t of takers.get(last.out) || []) if (!path.includes(t)) walk([...path, t]);
	};
	for (const s of I.stations) if (startable(s.in)) walk([s]);
	return out.map((rungs, k) => ({ id: k, rungs, top: G[indexOf(I).station.get(rungs[rungs.length - 1]).out].level }));
}

/** The instance without rations: what the cargo is laid on. Kept by the
 *  instance, so it is made once. */
export function dry(I) {
	if (!I.__dry) {
		const { rations, ...vehicle } = I.vehicle;
		void rations;
		Object.defineProperty(I, '__dry', { value: { ...I, vehicle }, enumerable: false });
	}
	return I.__dry;
}

/** A plan's value at μ: R − μ·T in robust mode, and the run behind it. */
export function robustEval(I, plan, mu = 0) {
	const r = simulate(I, planPolicy(plan), { mode: 'robust' });
	// A session of so many hours: each hour past it costs more than any
	// hour can earn, so the search pulls a long plan back inside it.
	const over = I.rules.hours > 0 ? Math.max(0, r.T - I.rules.hours) * OVERTIME : 0;
	// The sailor's two rules: nothing taken out of storage only to be put
	// back, nothing carried to the storage twice. A plan that breaks one is
	// worth less than any that does not, whatever it earns.
	const waste = (r.pointless.loadThenDrop + r.pointless.storedTwice) * WASTE;
	// A run for coins: each coin the exchanges pay outweighs any silver.
	const coins = I.rules.coinWorth > 0 ? r.log.reduce((a, e) => a + (e.kind === 'station' && e.out === 'Crow Coin' ? e.Y.reduce((x, y) => x + y, 0) : 0), 0) * I.rules.coinWorth : 0;
	return { f: r.R - mu * r.T - over - waste + coins, R: r.R, T: r.T, run: r };
}
const OVERTIME = 1e14;
const WASTE = 1e12;

/** A visit to the end depot that sells what the run made. */
export const endVisit = I => ({ at: I.rules.end, sell: 'spare', drop: 'spare' });

/**
 * The start of a plan whose station visits are given: what is bought
 * ashore and loaded from home. A land good is bought for every attempt
 * that asks for it, up to what the Market lists; a stored good is loaded
 * for what the visits take beyond what the run makes of it before, as
 * far as the hold carries at the start.
 */
export function startOf(I, visits) {
	const { station, storage } = indexOf(I);
	const G = I.goods;
	const buy = {}, load = {};
	const made = new Map(), held = new Map(Object.entries(I.initial.hold));
	const limit = I.rules.pace === 'full' ? I.vehicle.Wdeal : I.vehicle.Wfree;
	let W = Object.entries(I.initial.hold).reduce((a, [g, n]) => a + n * (G[g] ? G[g].w : 0), 0);
	for (const v of visits) {
		const s = station.get(v.at);
		if (!s || !(v.a > 0)) continue;
		const need = v.a * s.q;
		const have = (held.get(s.in) || 0) + (made.get(s.in) || 0);
		const short = Math.max(0, need - have);
		if (short > 0) {
			if (G[s.in].level === 0) {
				const cap = G[s.in].cap === null ? Infinity : G[s.in].cap;
				const n = Math.min(short, cap - (buy[s.in] || 0));
				if (n > 0) { buy[s.in] = (buy[s.in] || 0) + n; held.set(s.in, (held.get(s.in) || 0) + n); W += n * G[s.in].w; }
			} else {
				const n = Math.min(short, (storage.get(s.in) || 0) - (load[s.in] || 0), Math.floor((limit - W) / Math.max(G[s.in].w, 1e-9)));
				if (n > 0) { load[s.in] = (load[s.in] || 0) + n; held.set(s.in, (held.get(s.in) || 0) + n); W += n * G[s.in].w; }
			}
		}
		const use = Math.min(need, (held.get(s.in) || 0) + (made.get(s.in) || 0));
		const fromMade = Math.min(use, made.get(s.in) || 0);
		made.set(s.in, (made.get(s.in) || 0) - fromMade);
		held.set(s.in, (held.get(s.in) || 0) - (use - fromMade));
		made.set(s.out, (made.get(s.out) || 0) + v.a * s.ymin);
	}
	return { buy, load };
}

/** The depot that bends the leg from `a` to `b` least. */
export function nearestCall(I, a, b) {
	const { depots, dist } = indexOf(I);
	let best = null, bd = Infinity;
	for (const d of depots) {
		const x = dist(a, d) + dist(d, b) - dist(a, b);
		if (x < bd) { bd = x; best = d; }
	}
	return best;
}

/**
 * A plan made sailable from an order of station visits (each asking for
 * `a` attempts, or all the island allows when `a` is missing): the start
 * bought and loaded for them; a wharf call put in before each island the
 * hold would stop, where it pays; calls that do nothing taken out; the
 * attempts written as made. Returns { plan, f, R, T }.
 */
/** What missing one of the islands a plan must deal at costs it: more than
 *  any run earns. */
export const MISSED = 1e15;

export function finish(I, stationVisits, mu = 0, { calls = [], must = null } = {}) {
	// `must`: islands the plan has to deal at -- the tops of the sailor's own
	// climbs. A plan that misses one is worth less than any that does not,
	// whatever it earns: the search lays the climbs, it does not drop them.
	// The cargo is laid on the day without rations -- calls for supplies
	// change nothing aboard, so where the wharf calls go, what is dropped,
	// what each island deals do not hang on them -- and the refills are put
	// in once, at the end, the fastest set (refuel), and the plan judged
	// with them. Laid with them at every trial, they were most of the cost.
	const Ir = I.vehicle.rations ? dry(I) : I;
	const judgeOn = (J, p) => {
		const e = robustEval(J, p, mu);
		// A run that runs out of rations at sea is no run at all.
		if (e.run.deviations.starved) e.f -= e.run.deviations.starved * MISSED;
		if (must && must.length) {
			const dealt = new Set(e.run.log.filter(x => x.kind === 'station' && x.a > 0).map(x => x.at));
			const missed = must.filter(id => !dealt.has(id)).length;
			if (missed) e.f -= missed * MISSED;
		}
		return e;
	};
	const judge = p => judgeOn(Ir, p);
	const { station, storage } = indexOf(I);
	let visits = stationVisits.map(v => ({ at: v.at, a: v.a ?? station.get(v.at).m }));
	// Calls a caller already had, kept in place: { before: stationId, at }.
	const withCalls = (vs, cs) => {
		const out = [];
		for (const v of vs) {
			for (const c of cs) if (c.before === v.at) out.push({ at: c.at, sell: 'spare', drop: 'spare', ...(c.load ? { load: c.load } : {}) });
			out.push(v);
		}
		return [...out, endVisit(I)];
	};
	let cs = calls.filter(c => visits.some(v => v.at === c.before));
	const build = (vs, list) => {
		const all = withCalls(vs, list);
		return { ...startOf(I, all), visits: all };
	};
	let plan = build(visits, cs);
	let best = judge(plan);

	for (let round = 0; round < 3; round++) {
		// A call before each island the hold stopped, where it pays.
		let changed = false;
		for (let guard = 0; guard < visits.length; guard++) {
			const log = best.run.log;
			// Stopped by the hold -- or short of a good the home storage still
			// has: the storage can hold more than one trip carries, and the
			// ship goes home for the rest, loading what this island lacks.
			const homeHas = e => e.why === 'goods' && I.goods[e.in] && I.goods[e.in].level > 0 && (storage.get(e.in) || 0) > 0;
			const k = log.findIndex(e => e.kind === 'station' && (e.why === 'weight' || e.why === 'over' || homeHas(e)) && !cs.some(c => c.before === e.at));
			if (k < 0) break;
			const at = log[k].at;
			const prev = log.slice(0, k).reverse().find(e => e.kind === 'station' || e.kind === 'depot');
			const short = homeHas(log[k]);
			const d = short ? I.rules.home : nearestCall(I, prev ? prev.at : 'start', at);
			const s0 = station.get(at);
			const trial = [...cs, { before: at, at: d, ...(short ? { load: { [s0.in]: (log[k].req - log[k].a) * s0.q } } : {}) }];
			const p = build(visits, trial);
			const e = judge(p);
			// Kept or not, this island is not asked about again this round.
			if (e.f > best.f + 1e-6) { cs = trial; plan = p; best = e; changed = true; }
			else cs = [...cs, { before: at, at: d, tried: true }];
		}
		cs = cs.filter(c => !c.tried);
		// A call to sail lighter. No island refused the hold, but a leg sailed
		// over the limit is sailed slower; a call before the island after
		// such a leg -- selling what sells, leaving what nothing ahead takes
		// -- can pay for its own minutes in the legs it quickens.
		{
			const log = best.run.log;
			const slow = [];
			for (let k = 0; k < log.length - 1; k++) {
				const e = log[k], next = log[k + 1];
				if (e.kind === 'station' && next.kind === 'station' && e.W > I.vehicle.Wfree + 1e-6 && !cs.some(c => c.before === next.at)) slow.push({ at: next.at, from: e.at });
			}
			for (const { at, from } of slow.slice(0, 6)) {
				const trial = [...cs, { before: at, at: nearestCall(I, from, at) }];
				const p = build(visits, trial);
				const e = judge(p);
				if (e.f > best.f + 1e-6) { cs = trial; plan = p; best = e; changed = true; }
			}
		}
		// Calls that do nothing, or less than their time, taken out.
		for (const c of [...cs]) {
			const trial = cs.filter(x => x !== c);
			const p = build(visits, trial);
			const e = judge(p);
			if (e.f >= best.f - 1e-6) { cs = trial; plan = p; best = e; changed = true; }
		}
		const done = new Map(best.run.log.filter(e => e.kind === 'station').map(e => [e.at, e.a]));
		// An island that dealt nothing is not sailed to, whatever else is
		// kept: its stop is time for nothing. Tried on its own, since the
		// requests trimmed below can keep goods aboard that a spare drop
		// would otherwise leave, and so may not pay together with it.
		const dead = visits.filter(v => !(done.get(v.at) > 0));
		if (dead.length) {
			const live = visits.filter(v => done.get(v.at) > 0);
			// A call is kept by the island it stands before: one standing
			// before a dead island moves on to the next live one, or it would
			// go with the island.
			const moved = cs.map(c => {
				if (live.some(v => v.at === c.before)) return c;
				const k = visits.findIndex(v => v.at === c.before);
				const next = visits.slice(k + 1).find(v => done.get(v.at) > 0);
				return next ? { ...c, before: next.at } : null;
			}).filter(Boolean);
			const p = build(live, moved);
			const e = judge(p);
			if (e.f >= best.f - 1e-6) { visits = live; cs = moved; plan = p; best = e; changed = true; }
		}
		// The attempts as made.
		const done2 = new Map(best.run.log.filter(e => e.kind === 'station').map(e => [e.at, e.a]));
		const next = visits.map(v => ({ at: v.at, a: done2.get(v.at) ?? 0 })).filter(v => v.a > 0);
		if (next.length !== visits.length || next.some((v, i) => v.a !== visits[i].a)) {
			const p = build(next, cs);
			const e = judge(p);
			if (e.f >= best.f - 1e-6) { visits = next; plan = p; best = e; changed = true; }
		}
		if (!changed) break;
	}
	if (I.vehicle.rations) {
		const unfed = plan;
		plan = refuel(I, unfed);
		best = judgeOn(I, plan);
		// The five wharves nearest a leg's line are where a refill costs least,
		// not always where one can be had: a route the app fed by Abandoned
		// Pier starved here for want of it (2026-10-08). Every wharf, then.
		if (best.run.deviations.starved) {
			const wide = refuel(I, unfed, { near: Infinity });
			const e = judgeOn(I, wide);
			if (e.f > best.f) { plan = wide; best = e; }
		}
	}
	return { plan, f: best.f, R: best.R, T: best.T, visits, calls: cs };
}

/** Whether `id` may stand at position `pos` of `seq`: its good can be had there. */
export function insertOK(I, seq, id, pos) {
	const { station, storage } = indexOf(I);
	const s = station.get(id);
	const g = s.in;
	if (I.goods[g].level === 0 || (I.initial.hold[g] || 0) > 0 || (storage.get(g) || 0) > 0) return true;
	for (let k = 0; k < pos; k++) if (station.get(seq[k].at).out === g) return true;
	return false;
}

/**
 * Calls for supplies put into a plan wherever its ration pool would run
 * low: before the first island the pool would reach under the reserve
 * (or before running dry on the way to a wharf), at the wharf -- a depot
 * or a supply wharf -- that bends the leg least, at the latest leg the
 * pool still reaches it on, and again until the run is fed. The rule the
 * Barter tab lays its refills by (barter/route.js withRations), written
 * against the instance so that it serves any plan: the deployed planner's,
 * which lays its route first and its refills after, and every candidate a
 * search judges, which is how a search weighs its refills as it goes.
 *
 * `chain`: a leg longer than a full pool lasts can only be sailed by way
 * of a second wharf, a call straight after a call. The Barter tab never
 * lays two calls in a row (false: its rule, for the deployed planner);
 * the searches may (true), and a leg it cannot feed otherwise is fed.
 */
export function rationPass(I, plan, { most = 16, chain = true } = {}) {
	const R0 = I.vehicle.rations;
	if (!R0) return plan;
	const { dist, station } = indexOf(I);
	const wharves = [...I.depots.map(d => d.id), ...(I.supplies || []).map(d => d.id)];
	const isWharf = id => wharves.includes(id);
	const off = plan.buy || plan.load ? 1 : 0;
	let visits = plan.visits.slice();
	for (let round = 0; round < most; round++) {
		const r = simulate(I, planPolicy({ ...plan, visits }), { mode: 'robust' });
		const log = r.log.slice(off);
		const floor = R0.full * (R0.reserve || 0);
		// The first visit reached too low: an island under the reserve, or
		// anything after the pool ran dry.
		let bad = -1, lastFull = 0;
		for (let k = 0; k < log.length; k++) {
			// The pool on arrival: after a wharf's fill, less what it filled.
			const e = log[k], into = e.pool - (e.refilled || 0);
			if ((e.kind === 'station' && into < floor - 1e-6) || into <= 1e-6) { bad = k; break; }
			if (e.kind === 'depot' || e.kind === 'supply') lastFull = k + 1;
		}
		if (bad < 0) return { ...plan, visits };
		// Of the legs since the pool was last full, the one to break with a
		// call: the wharf that bends it least, of those the pool reaches.
		// What a metre of sea eats from where the ship stands: its pace and
		// its rate as the simulator sails them, the hold as it leaves.
		const V = I.vehicle;
		const phi = W => (W <= V.Wfree || V.Wmax <= V.Wfree ? 1 : 1 - Math.min(1, (W - V.Wfree) / (V.Wmax - V.Wfree)) * (1 - V.slowAtMax));
		const eatPerMetre = W => (W > V.Wfree + 1e-6 ? R0.perMinuteOver : R0.perMinute) / 60 / (V.speed * phi(W));
		const perMetre = R0.perMinute / 60 / V.speed;
		let best = null;
		for (let j = lastFull; j <= bad; j++) {
			const prevAt = j > 0 ? visits[j - 1].at : 'start', at = visits[j].at;
			if (!chain && (isWharf(prevAt) || isWharf(at))) continue;
			const poolThen = j > 0 ? log[j - 1].pool : (R0.start ?? R0.full);
			const W = j > 0 ? log[j - 1].W : (log[0] ? log[0].W : 0);
			for (const w of wharves) {
				if (w === prevAt || w === at) continue;
				// The leg's lag eats too, as the simulator counts it.
				const reach = dist(prevAt, w) * eatPerMetre(W) + (I.service.leg || 0) * (W > V.Wfree + 1e-6 ? R0.perMinuteOver : R0.perMinute) / 60;
				if (reach > poolThen + 1e-6) continue;
				const bend = dist(prevAt, w) + dist(w, at) - dist(prevAt, at);
				// What is still aboard on arrival is thrown away by the fill:
				// counted as the sea it would have sailed, so the latest call
				// the pool allows is preferred unless an earlier lies that much
				// more on the way.
				const waste = (poolThen - reach) / perMetre;
				const cost = bend + waste;
				if (!best || cost < best.cost - 1e-6) best = { cost, j, w };
			}
		}
		if (!best) return { ...plan, visits };
		const call = I.depots.some(d => d.id === best.w) ? { at: best.w, sell: 'spare', drop: 'spare' } : { at: best.w };
		visits = [...visits.slice(0, best.j), call, ...visits.slice(best.j)];
		void station;
	}
	return { ...plan, visits };
}

/**
 * The calls for supplies a fixed route needs, chosen exactly: the fewest
 * minutes that keep the pool above the reserve at every island and above
 * empty everywhere -- the fixed-route charging problem of electric-vehicle
 * routing, which this is. A call for supplies changes nothing aboard, so
 * the weight on every leg, and with it the pace and what a minute eats,
 * is the route's own whatever the calls; what is left is a shortest path
 * over where the pool was last filled: the start, every call the route
 * already makes (each fills it), and on each leg the few wharves that bend
 * it least, one after another where a leg is longer than a full pool
 * lasts. Returns the plan with those calls in (supply-only calls it
 * already had taken out first), or, when no calls can feed it, the plan
 * as rationPass leaves it.
 */
export function refuel(I, plan, { near = 5 } = {}) {
	const R0 = I.vehicle.rations;
	if (!R0) return plan;
	const V = I.vehicle;
	const { dist } = indexOf(I);
	const depotIds = new Set(I.depots.map(d => d.id));
	const supplyIds = new Set((I.supplies || []).map(d => d.id));
	const wharves = [...depotIds, ...supplyIds];
	// A call that only fills the pool: a supply wharf, or a depot visited
	// with nothing to sell, leave or load.
	const fillOnly = v => supplyIds.has(v.at) || (depotIds.has(v.at) && !v.sell && !v.drop && !(v.load && Object.keys(v.load).length));
	const visits = plan.visits.filter(v => !fillOnly(v));
	const base = { ...plan, visits };
	// The route sailed once, for the weight leaving each point.
	const off = plan.buy || plan.load ? 1 : 0;
	const sailed = simulate(I, planPolicy(base), { mode: 'robust' });
	const log = sailed.log.slice(off);
	const startW = off ? sailed.log[0].W : (log[0] ? log[0].W : 0);
	const phi = W => (W <= V.Wfree || V.Wmax <= V.Wfree ? 1 : 1 - Math.min(1, (W - V.Wfree) / (V.Wmax - V.Wfree)) * (1 - V.slowAtMax));
	// The points of the route; leg k arrives at visit k, from point k - 1
	// (the start before the first). The weight a leg is sailed at is the
	// hold as its first point left it.
	const n = visits.length;
	const at = k => (k < 0 ? 'start' : visits[k].at);
	const W = k => (k <= 0 ? startW : log[k - 1].W);
	const secPerM = k => 1 / (V.speed * phi(W(k)));
	const eatPerS = k => (W(k) > V.Wfree + 1e-6 ? R0.perMinuteOver : R0.perMinute) / 60;
	// A leg sailed d metres, as the simulator times it: its sailing and the
	// lag every leg has; and what that eats.
	const lag = I.service.leg || 0;
	const legSecs = (k, d) => (d > 0 ? d * secPerM(k) + lag : 0);
	const isCall = k => depotIds.has(visits[k].at);
	const isle = k => !depotIds.has(visits[k].at) && !supplyIds.has(visits[k].at);
	const keep = R0.full * (1 - (R0.reserve || 0)), full = R0.full;
	// Candidate wharves on each leg: those that bend it least.
	const cands = [];
	for (let k = 0; k < n; k++) {
		const a = at(k - 1), b = at(k);
		cands[k] = wharves.filter(w => w !== a && w !== b).map(w => ({ w, bend: dist(a, w) + dist(w, b) - dist(a, b) })).sort((x, y) => x.bend - y.bend).slice(0, near).map(x => x.w);
	}
	// Nodes: where the pool was last filled. { k, x }: standing at x with
	// visit k the next on the route; the start is { k: 0, x: 'start' }, a
	// call of the route's own at visit j is { k: j + 1, x: at(j) }, a call
	// for supplies before visit k is { k, x: w, fill: true }.
	const nodes = [{ k: 0, x: 'start', fill: false }];
	for (let k = 0; k < n; k++) {
		for (const w of cands[k]) nodes.push({ k, x: w, fill: true });
		if (isCall(k)) nodes.push({ k: k + 1, x: at(k), fill: false, call: k });
	}
	const goal = nodes.length;   // past the last visit
	// From node u to node v: sail on from u along the route to v; feasible
	// when no call of the route's own lies between (it fills, and is a node
	// of its own), the islands are reached above the reserve and v above
	// empty. Its cost is the minutes sailed, and a call's for a new call.
	const edge = (u, v) => {
		let x = u.x, eat = 0, secs = 0;
		const upto = v === null ? n : v.call !== undefined ? v.call : v.k;
		for (let k = u.k; k < upto; k++) {
			if (isCall(k)) return null;
			const t = legSecs(k, dist(x, at(k)));
			eat += t * eatPerS(k); secs += t;
			if (eat > (isle(k) ? keep : full) + 1e-6) return null;
			x = at(k);
		}
		if (v === null) return { secs };
		const k = v.call !== undefined ? v.call : v.k;
		const tgt = v.call !== undefined ? at(v.call) : v.x;
		if (v.call === undefined && upto !== v.k) return null;
		const t = legSecs(k, dist(x, tgt));
		eat += t * eatPerS(k); secs += t;
		if (eat > full + 1e-6) return null;
		return { secs: secs + (v.fill ? I.service.depot : 0) };
	};
	// Shortest path; nodes are few (a handful a leg), so a plain Dijkstra.
	const distTo = new Array(goal + 1).fill(Infinity), prev = new Array(goal + 1).fill(-1), done = new Array(goal + 1).fill(false);
	distTo[0] = 0;
	for (;;) {
		let u = -1;
		for (let i = 0; i <= goal; i++) if (!done[i] && distTo[i] < Infinity && (u < 0 || distTo[i] < distTo[u])) u = i;
		if (u < 0 || u === goal) break;
		done[u] = true;
		const U = nodes[u];
		for (let i = 0; i < goal; i++) {
			if (done[i] || i === u) continue;
			const Vn = nodes[i];
			// Only forward: a later visit, or a second call on the same leg.
			if (Vn.k < U.k || (Vn.call === undefined && Vn.k === U.k && !U.fill && U.call === undefined && U.x !== 'start')) continue;
			if (Vn.call !== undefined && Vn.call < U.k) continue;
			if (Vn.fill && U.fill && Vn.k === U.k && Vn.x === U.x) continue;
			const e = edge(U, Vn);
			if (e && distTo[u] + e.secs < distTo[i] - 1e-9) { distTo[i] = distTo[u] + e.secs; prev[i] = u; }
		}
		const e = edge(U, null);
		if (e && distTo[u] + e.secs < distTo[goal] - 1e-9) { distTo[goal] = distTo[u] + e.secs; prev[goal] = u; }
	}
	if (!(distTo[goal] < Infinity)) return rationPass(I, base);
	// The calls for supplies on the path, put in before the visit each stands before.
	const fills = [];
	for (let i = prev[goal]; i > 0; i = prev[i]) if (nodes[i].fill) fills.unshift(nodes[i]);
	const out = [];
	for (let k = 0; k < n; k++) {
		for (const f of fills) if (f.k === k) out.push({ at: f.x });
		out.push(visits[k]);
	}
	return { ...plan, visits: out };
}
