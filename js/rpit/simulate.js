// The simulator: a plan, or a policy, played by the game's rules.
//
// Every solver on the bench is judged here and nowhere else, so this
// file is written to be dull. It does not plan: it takes what it is
// asked to do, visit by visit, does as much of it as the game would
// allow, and says how much it could not do and why. Nothing asked of it
// throws -- an island that refuses a ship over its weight is a count in
// `deviations`, not an error -- because a solver that asks for the
// impossible should score badly, not stop the bench.
//
// Three ways to count what an exchange pays:
//   sample   -- an island pays the high yield with probability p, drawn
//               once for the board: every attempt there pays the same,
//               and the sailor reads it in the barter window on arrival,
//               before trading (the game's way, confirmed 2026-09-26).
//               The whole board is drawn at the start of a scenario, in
//               station order, so scenario k is the same board whatever
//               order a solver sails it in -- solvers are compared on
//               the same days. The truth, averaged over many scenarios;
//   expected -- each attempt pays its mean, in fractions;
//   robust   -- the app's own way: goods counted as if every attempt
//               paid the least, weighed as if it paid the most. Two
//               holds are kept, `h` counted and `hw` weighed; weight is
//               always read off `hw` and silver off `h`.
//
// A policy is { next(state, instance, rng) } returning the next action
// or null to end the run. An action is { start: true, buy, load } --
// only as the first -- or a visit: { at: station, a } or
// { at: depot, sell, drop, load }. A plan is a policy that replays
// itself (`planPolicy`).
//
// Pure: no DOM and no Node, so the Barter tab's worker plans with the
// same rules the bench judges by. The command line is
// tools/rpit/simulate.mjs.

/** A seeded generator (mulberry32): the same seed, the same draws. */
export function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6D2B79F5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A plan file as a policy: its start, then its visits in order.
 *
 * `drop: "spare"` at a depot is read at the moment of the call: every
 * barter good aboard beyond what the plan's later visits ask for is
 * left, as a sailor at the wharf leaves what the islands ahead will not
 * take. A count written in the plan would be the count its solver
 * expected, and the yields are not obliged to agree with it.
 */
export function planPolicy(plan) {
	const off = plan.buy || plan.load ? 1 : 0;
	return {
		next(state, I) {
			if (state.step === 0 && off) return { start: true, buy: plan.buy || {}, load: plan.load || {} };
			const k = state.step - off;
			if (k >= plan.visits.length) return null;
			const v = plan.visits[k];
			if (v.drop !== 'spare' && v.sell !== 'spare') return v;
			const stations = new Map(I.stations.map(s => [s.id, s]));
			const need = new Map();
			for (const w of plan.visits.slice(k + 1)) {
				const s = stations.get(w.at);
				if (s && w.a > 0) need.set(s.in, (need.get(s.in) || 0) + w.a * s.q);
			}
			const extra = g => (state.h.get(g) || 0) - (need.get(g) || 0);
			const out = { ...v };
			// `sell: "spare"`: what the Market-less wharf buys of it, less what
			// the islands ahead will take -- a good is not sold from under a
			// climb the plan still means to make.
			if (v.sell === 'spare') {
				out.sell = {};
				for (const [g] of state.h) if (I.goods[g] && I.goods[g].p > 0 && extra(g) > 1e-9) out.sell[g] = extra(g);
			}
			const selling = out.sell === 'all' ? g => I.goods[g].p > 0 : g => !!(out.sell && out.sell[g]);
			if (v.drop === 'spare') {
				out.drop = {};
				for (const [g] of state.h) {
					if (!I.goods[g] || !I.goods[g].level || selling(g)) continue;
					if (extra(g) > 1e-9) out.drop[g] = extra(g);
				}
			}
			return out;
		}
	};
}

const EPS = 1e-9;
const add = (m, g, n) => { const v = (m.get(g) || 0) + n; if (Math.abs(v) < EPS) m.delete(g); else m.set(g, v); };

/**
 * One run of `policy` on instance `I`. `seed` draws the yields (sample
 * mode) and, apart, whatever the policy draws. Returns the run: R, T
 * (hours), the counts, the deviations, the pointless actions and the
 * log of every visit.
 */
export function simulate(I, policy, { mode = 'sample', seed = 1 } = {}) {
	const draw = rng(seed);
	const policyRng = rng(seed * 7 + 3);
	// The board's payouts, one an island, drawn before anything is sailed.
	const board = new Map(I.stations.map(s => [s.id, draw() < s.p ? s.ymax : s.ymin]));
	const idx = new Map(I.travel.points.map((p, i) => [p, i]));
	const stationOf = new Map(I.stations.map(s => [s.id, s]));
	const depotIds = new Set(I.depots.map(d => d.id));
	// Wharves that sell supplies and nothing else: a call there fills the
	// ration pool. Every depot fills it too.
	const supplyIds = new Set((I.supplies || []).map(d => d.id));
	const G = I.goods;
	const V = I.vehicle;
	const pace = I.rules.pace;
	// The weight an exchange may start under, and the weight it may end
	// at: the barter ceiling and the hull's limit on a full run; the
	// limit itself on a run that never slows.
	const startLimit = pace === 'full' ? V.Wdeal : V.Wfree;
	const endLimit = pace === 'full' ? V.Wmax : V.Wfree;

	const h = new Map(), hw = new Map();
	for (const [g, n] of Object.entries(I.initial.hold)) { add(h, g, n); add(hw, g, n); }
	const storages = Object.fromEntries(I.depots.map(d => [d.id, new Map(Object.entries(d.storage))]));
	const floors = I.initial.floors || {};
	const weight = () => { let w = 0; for (const [g, n] of hw) w += n * (G[g] ? G[g].w : 0); return w; };
	const owned = g => (h.get(g) || 0) + Object.values(storages).reduce((a, s) => a + (s.get(g) || 0), 0);
	const spendable = g => Math.max(0, owned(g) - (floors[g] || 0));
	const phi = W => (W <= V.Wfree || V.Wmax <= V.Wfree ? 1 : 1 - Math.min(1, (W - V.Wfree) / (V.Wmax - V.Wfree)) * (1 - V.slowAtMax));
	// The hold's slots, beside its weight: a good that stacks ([Level 1]
	// to [Level 4], shore goods) takes one slot however many, one that
	// does not ([Level 5] and up) a slot a unit. Counted off the weighed
	// hold, the most that may be aboard. The game takes nothing more into
	// a hold whose slots are full; what is aboard past them stays.
	const SLOTS = Number.isFinite(V.slots) ? V.slots : Infinity;
	const stack = g => (G[g] && G[g].stack !== undefined ? G[g].stack : !(G[g] && G[g].level >= 5));
	const slotsOf = (g, n) => (!(n > EPS) ? 0 : stack(g) ? 1 : Math.ceil(n - EPS));
	const slots = () => { let k = 0; for (const [g, n] of hw) k += slotsOf(g, n); return k; };
	// Rations: a pool that sailing eats by the minute -- less when the hold
	// is past its limit, which takes the sailing skill's share off -- and
	// that any call at a wharf fills again. Absent, nothing is eaten.
	const R0 = V.rations || null;
	const state = {
		at: 'start', h, hw, W: weight(), parleyLeft: I.budgets.P, time: 0, silver: 0, sold: 0, spent: 0,
		storages, visited: new Set(), step: 0, log: [], pool: R0 ? (R0.start ?? R0.full) : Infinity,
		// What the islands sailed to were seen to pay: a policy may read
		// an island's payout once it has been there, and not before.
		revealed: new Map()
	};
	const dev = { refusedOverDeal: 0, clampedAttempts: 0, refusedDrop: 0, refusedSell: 0, refusedLoad: 0, revisited: 0, stuck: 0, startLate: 0, starved: 0, belowReserve: 0 };
	let trades = 0, calls = 0, distance = 0, parleyUsed = 0, refills = 0, eaten = 0;

	const travel = to => {
		const d = I.travel.matrix[idx.get(state.at)][idx.get(to)];
		if (d > 0) {
			if (state.W > V.Wmax + EPS) { dev.stuck = 1; return false; }
			const hours = d / (V.speed * phi(state.W)) / 3600;
			state.time += hours;
			distance += d;
			if (R0) {
				const use = hours * 60 * (state.W > V.Wfree + EPS ? R0.perMinuteOver : R0.perMinute);
				eaten += use;
				// Run dry at sea: counted, and the run goes on -- a plan that
				// does this is not a plan, and is scored so.
				if (state.pool - use < -EPS) { dev.starved++; state.pool = 0; }
				else {
					state.pool -= use;
					// Into an island under the reserve the sailor keeps: allowed,
					// and said. Into a wharf it is no matter: it fills there.
					if (stationOf.has(to) && state.pool < R0.full * (R0.reserve || 0) - EPS) dev.belowReserve++;
				}
			}
		}
		state.at = to;
		return true;
	};
	// A call at a wharf fills the pool to the top.
	const refill = entry => {
		if (!R0) return;
		entry.refilled = R0.full - state.pool;
		if (entry.refilled > EPS) refills++;
		state.pool = R0.full;
	};
	// How many of `g` may come aboard from a wharf (or the Market, or the
	// harbour's storage): to the hold's limit and no further -- loading
	// stops at 100 %, only exchanges carry a hold past it -- and into the
	// slots there are.
	const roomFor = (g, want) => {
		const w = G[g] ? G[g].w : 0;
		let n = w > 0 ? Math.min(want, Math.max(0, Math.floor((V.Wfree - weight()) / w + EPS))) : want;
		const had = hw.get(g) || 0, free = SLOTS - slots();
		if (stack(g)) { if (!(had > EPS) && free < 1) n = 0; }
		else n = Math.min(n, Math.max(0, Math.floor(free + EPS)));
		return n;
	};
	const load = (at, want, entry) => {
		const store = storages[at];
		for (const [g, req] of Object.entries(want || {})) {
			const have = Math.min(req, store.get(g) || 0);
			if (have <= EPS) continue;
			const n = Math.min(have, roomFor(g, have));
			if (n < have - EPS) dev.refusedLoad++;
			if (n <= EPS) continue;
			add(h, g, n); add(hw, g, n); add(store, g, -n);
			entry.loaded[g] = (entry.loaded[g] || 0) + n;
		}
		state.W = weight();
	};

	let stopped = false;
	for (;;) {
		const act = policy.next(state, I, policyRng);
		if (!act) break;
		const entry = { k: state.step, at: act.at || 'start', sold: {}, dropped: {}, loaded: {}, bought: {} };
		if (act.start) {
			if (state.step !== 0) { dev.startLate++; state.step++; continue; }
			for (const [g, req] of Object.entries(act.buy || {})) {
				const cap = G[g] && G[g].cap !== null && G[g].cap !== undefined ? G[g].cap : Infinity;
				const n = Math.min(req, cap, roomFor(g, req));
				if (n <= EPS) continue;
				add(h, g, n); add(hw, g, n);
				const cost = n * (G[g] ? G[g].b : 0);
				state.silver -= cost; state.spent += cost;
				entry.bought[g] = n;
			}
			// What is loaded before casting off comes out of the home
			// storage at the harbour: no call, and no leg to the wharf.
			load(I.rules.home, act.load, entry);
			entry.kind = 'start';
		} else if (stationOf.has(act.at)) {
			const s = stationOf.get(act.at);
			if (!travel(act.at)) { stopped = true; break; }
			state.time += I.service.station / 3600;
			entry.kind = 'station';
			entry.req = act.a || 0;
			let a = 0;
			const Y = [];
			if (state.visited.has(s.id)) { dev.revisited++; entry.why = 'revisit'; }
			else if (entry.req > 0 && state.W > startLimit + EPS) { dev.refusedOverDeal++; entry.why = 'over'; }
			else {
				// Each bound on the attempts, kept apart so that a visit that
				// fell short can say which of them it was.
				const bounds = { m: s.m, goods: Math.floor((h.get(s.in) || 0) / s.q + EPS), parley: s.c > 0 ? Math.floor(state.parleyLeft / s.c + EPS) : Infinity, floor: Math.floor(spendable(s.in) / s.q + EPS) };
				const most = Math.min(entry.req, ...Object.values(bounds));
				// What each attempt here pays: the board's draw, read in the
				// window before trading; its mean; or, robust, the least --
				// weighed at the most, since that planner never saw the board.
				const y = mode === 'sample' ? board.get(s.id) : mode === 'expected' ? s.ymin + s.p * (s.ymax - s.ymin) : s.ymin;
				const yw = mode === 'robust' ? s.ymax : y;
				if (mode === 'sample') state.revealed.set(s.id, y);
				// Attempt by attempt: each starts under the ceiling and ends
				// under the limit.
				const dw = yw * G[s.out].w - s.q * G[s.in].w;
				let slotsHit = false;
				for (; a < most; a++) {
					const W = weight();
					if (W > startLimit + EPS || W + dw > endLimit + EPS) break;
					// And the slots: an exchange that would need a slot the hold
					// has not got is refused.
					if (SLOTS < Infinity) {
						const was = slots();
						const after = was - slotsOf(s.in, hw.get(s.in) || 0) + slotsOf(s.in, (hw.get(s.in) || 0) - s.q) - slotsOf(s.out, hw.get(s.out) || 0) + slotsOf(s.out, (hw.get(s.out) || 0) + yw);
						if (after > SLOTS && after > was) { slotsHit = true; break; }
					}
					add(h, s.in, -s.q); add(hw, s.in, -s.q);
					add(h, s.out, y); add(hw, s.out, yw);
					Y.push(y);
				}
				if (a < entry.req) {
					dev.clampedAttempts++;
					entry.why = a < most ? (slotsHit ? 'slots' : 'weight') : Object.entries(bounds).reduce((x, y) => (y[1] < x[1] ? y : x))[0];
				}
				state.parleyLeft -= a * s.c; parleyUsed += a * s.c; trades += a;
				state.visited.add(s.id);
			}
			entry.a = a; entry.Y = Y;
			entry.in = s.in; entry.out = s.out;
			state.W = weight();
		} else if (depotIds.has(act.at)) {
			if (!travel(act.at)) { stopped = true; break; }
			state.time += I.service.depot / 3600;
			calls++;
			entry.kind = 'depot';
			refill(entry);
			const sell = act.sell === 'all'
				? Object.fromEntries([...h].filter(([g]) => G[g] && G[g].p > 0))
				: act.sell || {};
			for (const [g, req] of Object.entries(sell)) {
				if (!G[g] || !(G[g].p > 0)) { dev.refusedSell++; continue; }
				const n = Math.min(req, h.get(g) || 0, spendable(g));
				if (n <= EPS) continue;
				add(h, g, -n); add(hw, g, -Math.min(n, hw.get(g) || 0));
				state.silver += n * G[g].p; state.sold += n * G[g].p;
				entry.sold[g] = n;
			}
			for (const [g, req] of Object.entries(act.drop || {})) {
				if (I.rules.dropPolicy === 'home_only' && act.at !== I.rules.home) { dev.refusedDrop++; continue; }
				const n = Math.min(req, h.get(g) || 0);
				if (n <= EPS) continue;
				add(h, g, -n); add(storages[act.at], g, n);
				// What the weighed hold may be carrying of it beyond the count
				// goes ashore with it: nothing is left aboard but the count.
				if (h.has(g)) hw.set(g, h.get(g)); else hw.delete(g);
				entry.dropped[g] = n;
			}
			load(act.at, act.load, entry);
			state.W = weight();
		} else if (supplyIds.has(act.at)) {
			// A call for supplies only: the pool filled, nothing traded.
			if (!travel(act.at)) { stopped = true; break; }
			state.time += I.service.depot / 3600;
			calls++;
			entry.kind = 'supply';
			refill(entry);
		} else {
			entry.kind = 'unknown';
		}
		entry.W = state.W; entry.silver = state.silver; entry.time = state.time; entry.pool = state.pool;
		state.log.push(entry);
		state.step++;
	}
	if (!stopped && state.at !== I.rules.end) {
		if (!travel(I.rules.end)) stopped = true;
	}

	const R = state.sold - state.spent;
	const T = state.time;
	let carried = 0;
	for (const [g, n] of h) carried += n * (G[g] ? G[g].p : 0);
	return {
		R, T, rate: T > 0 ? R / T : 0, P: parleyUsed, trades, calls, distance, carried, refills, eaten,
		// Where the run ended and what it held: a search that builds a plan
		// a visit at a time reads its next move off these.
		at: state.at, hold: Object.fromEntries(h), parleyLeft: state.parleyLeft,
		deviations: dev, pointless: pointlessOf(state.log), log: state.log
	};
}

/**
 * The actions that did nothing for the run, read off its log: goods
 * taken aboard and put ashore again before any island took them, calls
 * at which nothing changed hands, calls with no island between, and
 * islands sailed to that dealt nothing.
 */
export function pointlessOf(log) {
	const out = { loadThenDrop: 0, idleCalls: 0, consecutiveCalls: 0, emptyVisits: 0 };
	const taken = new Set();
	let lastDepot = false;
	for (const e of log) {
		if (e.kind === 'station') {
			if (e.a > 0) taken.delete(e.in);
			// An island sailed to that dealt nothing: a stop for no trade.
			else out.emptyVisits++;
			lastDepot = false;
			continue;
		}
		if (e.kind !== 'depot' && e.kind !== 'start' && e.kind !== 'supply') continue;
		for (const g of Object.keys(e.dropped || {})) if (taken.has(g)) { out.loadThenDrop++; taken.delete(g); }
		for (const g of [...Object.keys(e.loaded || {}), ...Object.keys(e.bought || {})]) taken.add(g);
		if (e.kind === 'depot' || e.kind === 'supply') {
			// A call that filled the ration pool did something, whatever it
			// traded.
			const did = Object.keys(e.sold).length + Object.keys(e.dropped).length + Object.keys(e.loaded).length + (e.refilled > 0 ? 1 : 0);
			if (!did) out.idleCalls++;
			if (lastDepot) out.consecutiveCalls++;
			lastDepot = true;
		}
	}
	return out;
}

const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); };

/**
 * The result of `policy` on `I`: `scenarios` runs in `mode` (one when
 * the mode draws nothing) and one robust run beside them. The headline
 * is `rateOfMeans`, the mean silver over the mean hours -- what a sailor
 * earns an hour day after day -- not the mean of each day's rate.
 */
export function evaluate(I, policy, { mode = 'sample', scenarios = 100, seed = 1, solver = '' } = {}) {
	const n = mode === 'sample' ? scenarios : 1;
	const runs = [];
	for (let k = 0; k < n; k++) runs.push(simulate(I, policy, { mode, seed: seed * 1000003 + k }));
	const robust = mode === 'robust' ? runs[0] : simulate(I, policy, { mode: 'robust', seed });
	const pick = key => runs.map(r => r[key]);
	const sum = key => Object.fromEntries(Object.keys(runs[0][key]).map(k => [k, mean(runs.map(r => r[key][k]))]));
	const means = Object.fromEntries(['R', 'T', 'rate', 'P', 'trades', 'calls', 'distance', 'carried', 'refills', 'eaten'].map(k => [k, mean(pick(k))]));
	return {
		instance: I.name, solver, mode, scenarios: n, seed, computeMs: 0,
		mean: means,
		std: { R: std(pick('R')), T: std(pick('T')), rate: std(pick('rate')) },
		min: { R: Math.min(...pick('R')), rate: Math.min(...pick('rate')) },
		max: { R: Math.max(...pick('R')), rate: Math.max(...pick('rate')) },
		rateOfMeans: means.T > 0 ? means.R / means.T : 0,
		deviations: sum('deviations'),
		pointless: sum('pointless'),
		robust: { R: robust.R, T: robust.T, rate: robust.rate, trades: robust.trades },
		first: runs[0]
	};
}

/** One visit of a log as a line a person can read. */
export function traceLine(e) {
	const list = m => Object.entries(m || {}).map(([g, n]) => `${Math.round(n * 100) / 100} ${g}`).join(', ');
	const bits = [];
	if (e.kind === 'station') bits.push(`${e.a}/${e.req} (${e.in} → ${e.out}${e.Y && e.Y.length ? `, paid ${e.Y.join('')}` : ''})`);
	if (Object.keys(e.bought || {}).length) bits.push(`buy ${list(e.bought)}`);
	if (Object.keys(e.sold || {}).length) bits.push(`sell ${list(e.sold)}`);
	if (Object.keys(e.dropped || {}).length) bits.push(`drop ${list(e.dropped)}`);
	if (Object.keys(e.loaded || {}).length) bits.push(`load ${list(e.loaded)}`);
	return `${String(e.k).padStart(3)} ${String(e.at).padEnd(22)} ${bits.join(' | ') || '—'}  W=${Math.round(e.W)} silver=${Math.round(e.silver / 1e6)}M t=${e.time.toFixed(2)}h`;
}

