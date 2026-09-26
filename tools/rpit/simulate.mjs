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
//   sample   -- each attempt pays the high yield with probability p,
//               drawn from a seeded generator; the truth, averaged over
//               many scenarios;
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
//   node tools/rpit/simulate.mjs instance.json plan.json [--scenarios 100] [--seed 1] [--mode sample] [--trace]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
			if (v.drop !== 'spare') return v;
			const stations = new Map(I.stations.map(s => [s.id, s]));
			const need = new Map();
			for (const w of plan.visits.slice(k + 1)) {
				const s = stations.get(w.at);
				if (s && w.a > 0) need.set(s.in, (need.get(s.in) || 0) + w.a * s.q);
			}
			const selling = v.sell === 'all' ? g => I.goods[g].p > 0 : g => !!(v.sell && v.sell[g]);
			const drop = {};
			for (const [g, n] of state.h) {
				if (!I.goods[g] || !I.goods[g].level || selling(g)) continue;
				const extra = n - (need.get(g) || 0);
				if (extra > 1e-9) drop[g] = extra;
			}
			return { ...v, drop };
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
	const idx = new Map(I.travel.points.map((p, i) => [p, i]));
	const stationOf = new Map(I.stations.map(s => [s.id, s]));
	const depotIds = new Set(I.depots.map(d => d.id));
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

	const state = {
		at: 'start', h, hw, W: weight(), parleyLeft: I.budgets.P, time: 0, silver: 0, sold: 0, spent: 0,
		storages, visited: new Set(), step: 0, log: []
	};
	const dev = { refusedOverDeal: 0, clampedAttempts: 0, refusedDrop: 0, refusedSell: 0, refusedLoad: 0, revisited: 0, stuck: 0, startLate: 0 };
	let trades = 0, calls = 0, distance = 0, parleyUsed = 0;

	const travel = to => {
		const d = I.travel.matrix[idx.get(state.at)][idx.get(to)];
		if (d > 0) {
			if (state.W > V.Wmax + EPS) { dev.stuck = 1; return false; }
			state.time += d / (V.speed * phi(state.W)) / 3600;
			distance += d;
		}
		state.at = to;
		return true;
	};
	const load = (at, want, entry) => {
		const store = storages[at];
		for (const [g, req] of Object.entries(want || {})) {
			const n = Math.min(req, store.get(g) || 0);
			if (n <= EPS) continue;
			add(h, g, n); add(hw, g, n); add(store, g, -n);
			if (weight() > V.Wmax + EPS) { add(h, g, -n); add(hw, g, -n); add(store, g, n); dev.refusedLoad++; continue; }
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
				const n = Math.min(req, cap);
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
			if (state.visited.has(s.id)) dev.revisited++;
			else if (entry.req > 0 && state.W > startLimit + EPS) dev.refusedOverDeal++;
			else {
				const most = Math.min(entry.req, s.m, Math.floor((h.get(s.in) || 0) / s.q + EPS), s.c > 0 ? Math.floor(state.parleyLeft / s.c + EPS) : Infinity, Math.floor(spendable(s.in) / s.q + EPS));
				// Attempt by attempt: each starts under the ceiling and ends
				// under the limit even if it pays the most -- the sailor
				// cannot know the draw before making it.
				const dwMax = s.ymax * G[s.out].w - s.q * G[s.in].w;
				for (; a < most; a++) {
					const W = weight();
					if (W > startLimit + EPS || W + dwMax > endLimit + EPS) break;
					const y = mode === 'sample' ? (draw() < s.p ? s.ymax : s.ymin) : mode === 'expected' ? s.ymin + s.p * (s.ymax - s.ymin) : s.ymin;
					add(h, s.in, -s.q); add(hw, s.in, -s.q);
					add(h, s.out, y); add(hw, s.out, mode === 'robust' ? s.ymax : y);
					Y.push(y);
				}
				if (a < entry.req) dev.clampedAttempts++;
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
		} else {
			entry.kind = 'unknown';
		}
		entry.W = state.W; entry.silver = state.silver; entry.time = state.time;
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
		R, T, rate: T > 0 ? R / T : 0, P: parleyUsed, trades, calls, distance, carried,
		deviations: dev, pointless: pointlessOf(state.log), log: state.log
	};
}

/**
 * The actions that did nothing for the run, read off its log: goods
 * taken aboard and put ashore again before any island took them, calls
 * at which nothing changed hands, and calls with no island between.
 */
export function pointlessOf(log) {
	const out = { loadThenDrop: 0, idleCalls: 0, consecutiveCalls: 0 };
	const taken = new Set();
	let lastDepot = false;
	for (const e of log) {
		if (e.kind === 'station') {
			if (e.a > 0) taken.delete(e.in);
			lastDepot = false;
			continue;
		}
		if (e.kind !== 'depot' && e.kind !== 'start') continue;
		for (const g of Object.keys(e.dropped || {})) if (taken.has(g)) { out.loadThenDrop++; taken.delete(g); }
		for (const g of [...Object.keys(e.loaded || {}), ...Object.keys(e.bought || {})]) taken.add(g);
		if (e.kind === 'depot') {
			const did = Object.keys(e.sold).length + Object.keys(e.dropped).length + Object.keys(e.loaded).length;
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
	const means = Object.fromEntries(['R', 'T', 'rate', 'P', 'trades', 'calls', 'distance', 'carried'].map(k => [k, mean(pick(k))]));
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

function main() {
	const argv = process.argv.slice(2);
	const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
	const valued = new Set(['--scenarios', '--seed', '--mode']);
	const [instFile, planFile] = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
	if (!instFile || !planFile) { console.error('usage: simulate.mjs instance.json plan.json [--scenarios N] [--seed S] [--mode sample|expected|robust] [--trace]'); process.exit(2); }
	const I = JSON.parse(readFileSync(instFile, 'utf8'));
	const plan = JSON.parse(readFileSync(planFile, 'utf8'));
	const r = evaluate(I, planPolicy(plan), { mode: opt('mode', 'sample'), scenarios: Number(opt('scenarios', 100)), seed: Number(opt('seed', 1)) });
	const { first, ...result } = r;
	console.log(JSON.stringify(result, null, 2));
	if (argv.includes('--trace')) for (const e of first.log) console.log(traceLine(e));
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
