// The run, laid by the new planner, in the shape the Barter tab reads.
//
// chainRun (barter-chains.js) lays a run with rules: every attempt the
// pace allows at every rung, a wharf call whenever the hold is in the
// way. The planner in js/rpit/ lays it by search instead -- which climbs,
// how many attempts at each island, in what order, and which calls pay --
// judged on silver an hour by the same simulator the bench scores with
// (see tools/rpit/). This module is the bridge: it takes what chainRun
// takes, writes the day down as that planner's instance, solves it, and
// turns the plan back into a run -- stops, trips, sales, what was left and
// why a climb stopped -- so that every screen that reads a run reads this
// one unchanged.
//
// Stage 1 of the replacement: the silver run. What chainRun does and this
// does not yet -- the bag, the coin and stock goals, the sailor's route
// edits -- is refused here, loudly, rather than laid wrong (`unsupported`).
//
// Pure: no DOM, no store; the worker can run it.

import { levelOf } from './barter.js';
import { weightOf, sellOf } from './barter-plan.js';
import { sellable, floorOf, PLAIN_ORDERS } from './barter-orders.js';
import { seaDist } from './barter-route.js';
import { METRES_PER_PX, speedMs } from './sailing.js';
import { simulate, planPolicy } from './rpit/simulate.js';
import { finish, indexOf } from './rpit/common.js';
import { withChain, reorder, serial } from './rpit/insert.js';
import { maximiseRate } from './rpit/ratio.js';
import { search } from './rpit/alns.js';

/** What the new planner cannot lay yet, for these options; empty when it can. */
export function unsupported(opts = {}) {
	const out = [];
	if (opts.bag && opts.bag.free > 0) out.push('bag');
	if (opts.aim) out.push(`aim:${opts.aim.kind || 'stock'}`);
	if (opts.orders && opts.orders.way === 'chain') out.push('way:chain');
	if ((opts.skipIsles || []).length) out.push('skipIsles');
	if (Object.keys(opts.nudge || {}).length) out.push('nudge');
	if ((opts.tripOrder || []).length) out.push('tripOrder');
	if ((opts.chosen || []).some(c => c.rungs.some(r => r.item === 'Crow Coin'))) out.push('coins');
	return out;
}

/**
 * The day as the planner's instance, from chainRun's options. Returns
 * { I, rowOf, chains } -- the instance; each island's exchange row as the
 * board gives it (payouts seen this run folded in); and the chosen chains
 * as climbs of station ids, in the order given.
 */
export function instanceOf(opts) {
	const { chosen = [], stock = {}, dock = {}, hold, parley, npcById, start, stashes = [], prefer = null, pace = 'full', orders = PLAIN_ORDERS, prices = {}, seen = {}, keep = [], land = new Map(), ship = null } = opts;
	// A payout the sailor saw replaces the range, as chainRun counts it.
	const fix = r => (seen[r.npcId] > 0 ? { ...r, recv: seen[r.npcId], recvMin: seen[r.npcId], recvMax: seen[r.npcId], recvText: String(seen[r.npcId]), rangeMin: r.rangeMin ?? r.recvMin, rangeMax: r.rangeMax ?? r.recvMax } : r);
	const rowOf = new Map();
	for (const c of chosen) for (const r of c.rungs) if (!rowOf.has(String(r.npcId))) rowOf.set(String(r.npcId), fix(r));
	const rows = [...rowOf.values()];
	const stations = rows.map(r => ({ id: String(r.npcId), name: r.npc, in: r.give, q: r.giveN, out: r.item, ymin: r.recvMin, ymax: r.recvMax, p: 0.5, m: r.tries, c: parley.perTrade }));

	const fromPile = orders.landFrom === 'stock';
	const goods = {};
	const names = new Set([...rows.flatMap(r => [r.give, r.item]), ...Object.keys(stock), ...Object.keys(dock)]);
	for (const name of names) {
		const level = levelOf(name) ?? 0;
		const price = level ? null : prices[name];
		// Shore goods from the sailor's own pile cost nothing and run out at
		// the pile; bought ones cost the Market's price and run out at its
		// listing, where it gave one.
		const cap = level ? null : fromPile ? (land.get(name) || 0) : price && Number.isFinite(price.stock) ? price.stock : null;
		goods[name] = {
			level,
			w: weightOf(name) || 0,
			p: level && sellable(name, orders) && !keep.includes(name) ? sellOf(name) || 0 : 0,
			b: level || fromPile ? 0 : (price && price.each) || 0,
			cap
		};
	}
	const floors = {};
	for (const name of names) { const f = floorOf(name, orders); if (f > 0) floors[name] = f; }

	// Home: the start harbour's storage when it has one, else the storage
	// nearest it. The dock goods are the start harbour's, loaded at the start.
	const home = stashes.find(w => w.at === start.name) || stashes.reduce((a, w) => (!a || seaDist(start, w) < seaDist(start, a) ? w : a), null);
	const depots = stashes.map(w => ({ id: w.at, x: w.x, y: w.y, storage: w === home ? { ...dock } : {} }));
	const objs = [start, ...stashes, ...rows.map(r => npcById.get(r.npcId))];
	const points = ['start', ...stashes.map(w => w.at), ...rows.map(r => String(r.npcId))];
	const matrix = objs.map(a => objs.map(b => (a === b ? 0 : seaDist(a, b) * METRES_PER_PX)));
	// Shortest by way of any point, as the bench's instances are.
	const n = matrix.length;
	for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (matrix[i][k] + matrix[k][j] < matrix[i][j]) matrix[i][j] = matrix[i][k] + matrix[k][j];

	const pause = orders.pause || { isle: 0, call: 0 };
	const I = {
		name: 'live', goods, stations, depots,
		start: { id: 'start', x: start.x, y: start.y },
		travel: { points, matrix },
		service: { station: pause.isle || 0, depot: pause.call || 0 },
		vehicle: { Wfree: hold.free, Wdeal: hold.deal ?? hold.free, Wmax: hold.max ?? hold.deal ?? hold.free, speed: ship && ship.speed > 0 ? speedMs(ship.speed, ship.cal) : speedMs(100), slowAtMax: 0.5 },
		budgets: { P: parley.bar, H: null },
		initial: { hold: { ...stock }, floors },
		rules: { pace, dropPolicy: 'any', home: home.at, end: prefer ? prefer.at : home.at },
		objective: 'silver_per_hour',
		meta: {}
	};
	const chains = chosen.map((c, k) => ({ id: k, rungs: c.rungs.map(r => String(r.npcId)), top: c.top }));
	return { I, rowOf, chains, home };
}

/**
 * The plan for the chosen chains: every island of theirs, in the order and
 * with the attempts and calls that earn most an hour. `effort` as chainRun
 * takes it: 0 the chains' thin ladders in a quick order, 1 the route
 * searched, 2 the search over attempts, order and calls (ALNS).
 */
export function planFor(I, chains, { effort = 2, timeMs = 300, seed = 1 } = {}) {
	let seq = [];
	for (const c of chains) seq = withChain(I, seq, c.rungs);
	// Two ways to start: the climbs threaded together by the shortest
	// route, and the climbs one after another -- which a small hold needs.
	// Whichever is worth more after it is made sailable goes on.
	const must = chains.map(c => c.rungs[c.rungs.length - 1]);
	const starts = [reorder(I, seq, { effort: Math.min(effort, 2) }), serial(I, seq, chains)];
	const worth = s => { const b = maximiseRate(I, (inst, o) => finish(inst, s, o.mu, { must }), { timeMs: Infinity, rounds: 6 }); return { s, b, rate: b.T > 0 ? b.R / b.T - (b.f < -1e12 ? 1e18 : 0) : 0 }; };
	const tried = starts.map(worth).sort((a, b) => b.rate - a.rate);
	if (effort < 2) return tried[0].b.plan;
	const best = maximiseRate(I, (inst, o) => search(inst, { ...o, pool: chains, fixed: true, warm: o.warm || { seq: tried[0].s, calls: [] } }), { timeMs, seed });
	return best.plan;
}

/**
 * A run in chainRun's shape from a plan, sailed robust -- counted at the
 * least an island pays and weighed at the most, as chainRun counts -- so
 * that the numbers the tab shows are the ones the plan can promise.
 */
export function runOf(I, plan, { chosen, rowOf, stashes, parley, prices = {}, orders = PLAIN_ORDERS, land = new Map() }) {
	const r = simulate(I, planPolicy(plan), { mode: 'robust' });
	const wharfOf = new Map(stashes.map(w => [w.at, w]));
	const inChain = new Map();
	chosen.forEach((c, k) => c.rungs.forEach(x => { const id = String(x.npcId); if (!inChain.has(id)) inChain.set(id, []); inChain.get(id).push(k); }));
	const G = I.goods;
	const fromPile = orders.landFrom === 'stock';

	// Each island stop belongs to the climb it serves: of the chains through
	// it, the one whose rung below was dealt last -- or, at a foot, the first.
	const stops = [], sold = [], stashed = [];
	const dealtAt = new Map();   // station id -> index in stops
	let chainNow = 0, weightStart = 0, peak = 0;
	const lotStarts = [];        // stop index of each home reload
	for (const e of r.log) {
		if (e.kind === 'start') { weightStart = e.W; peak = e.W; continue; }
		peak = Math.max(peak, e.W);
		if (e.kind === 'station') {
			if (!(e.a > 0)) continue;
			const ks = inChain.get(e.at) || [0];
			let k = ks[0], best = -1;
			for (const kk of ks) {
				const rs = chosen[kk].rungs, j = rs.findIndex(x => String(x.npcId) === e.at);
				const below = j > 0 ? dealtAt.get(String(rs[j - 1].npcId)) : undefined;
				if (below !== undefined && below > best) { best = below; k = kk; }
			}
			chainNow = k;
			dealtAt.set(e.at, stops.length);
			const row = rowOf.get(e.at);
			stops.push({ ...row, times: e.a, parley: e.a * parley.perTrade, level: levelOf(row.give) || 0, weightAfter: e.W, chain: k });
			continue;
		}
		if (e.kind !== 'depot') continue;
		const wharf = wharfOf.get(e.at);
		const stop = { wharf, dropped: [], weightAfter: e.W, chain: chainNow };
		const items = Object.entries(e.sold).map(([item, n]) => ({ item, n, total: n * sellOf(item) }));
		if (items.length) {
			stop.sale = { n: items.reduce((a, x) => a + x.n, 0), total: items.reduce((a, x) => a + x.total, 0), levels: [...new Set(items.map(x => levelOf(x.item)))].sort((a, b) => b - a), items };
			for (const x of items) sold.push({ item: x.item, n: x.n, each: sellOf(x.item), total: x.total, at: wharf.at, chain: chainNow });
		}
		for (const [item, n] of Object.entries(e.dropped)) {
			stop.dropped.push({ item, n });
			stashed.push({ item, n, at: wharf.at, each: sellOf(item), total: n * sellOf(item), chain: chainNow });
		}
		const loads = Object.entries(e.loaded).map(([item, n]) => ({ item, n }));
		if (loads.length) { lotStarts.push(stops.length); stop.loads = loads; }
		stops.push(stop);
	}

	// The chains in the order the run first meets them; every chosen chain
	// is in it, sailed or not, so a tag and a cut can name any of them.
	const orderIdx = [];
	for (const s of stops) if (s.npcId && !orderIdx.includes(s.chain)) orderIdx.push(s.chain);
	chosen.forEach((_, k) => { if (!orderIdx.includes(k)) orderIdx.push(k); });
	const remap = new Map(orderIdx.map((k, i) => [k, i]));
	for (const s of stops) s.chain = remap.get(s.chain) ?? 0;
	for (const x of [...sold, ...stashed]) x.chain = remap.get(x.chain) ?? 0;
	const order = orderIdx.map(k => chosen[k]);

	// Trips: the run is cut at each call home that loads a later trip's goods.
	const lotOfStop = i => lotStarts.filter(s => s <= i).length;
	const lots = [];
	for (const [i, s] of stops.entries()) {
		if (!s.npcId) continue;
		const L = lotOfStop(i);
		while (lots.length <= L) lots.push([]);
		if (!lots.some(l => l.includes(s.chain))) lots[L].push(s.chain);
	}
	for (const s of stops) if (s.loads) { const L = lotOfStop(stops.indexOf(s)); for (const l of s.loads) l.lot = L; }
	order.forEach((_, i) => { if (!lots.some(l => l.includes(i))) (lots[lots.length - 1] || (lots[0] = [])).push(i); });

	// Why a climb stopped short of its top: the first rung of it the run did
	// not deal, and what the simulator said stopped it there.
	const why = new Map(r.log.filter(e => e.kind === 'station').map(e => [e.at, e]));
	const cut = [];
	order.forEach((c, i) => {
		const top = c.rungs[c.rungs.length - 1];
		const done = c.rungs.filter(x => stops.some(s => s.npcId && String(s.npcId) === String(x.npcId) && s.chain === i)).length;
		if (stops.some(s => s.npcId && String(s.npcId) === String(top.npcId))) return;
		const at = c.rungs.find(x => !stops.some(s => s.npcId && String(s.npcId) === String(x.npcId))) || top;
		const e = why.get(String(at.npcId));
		const base = { chain: i, npc: at.npc, npcId: at.npcId, give: at.give, item: c.item, done, of: c.rungs.length, top };
		const land = levelOf(at.give) === null;
		if (e && e.why === 'weight') cut.push({ ...base, why: 'hold', need: Math.max(0, Math.round(at.recvMax * weightOf(at.item) - at.giveN * weightOf(at.give))), free: Math.max(0, Math.round((I.rules.pace === 'full' ? I.vehicle.Wdeal : I.vehicle.Wfree) - (e.W || 0))) });
		else if (e && e.why === 'over') cut.push({ ...base, why: 'over', over: Math.round((e.W || 0) - I.vehicle.Wfree) });
		else if (e && e.why === 'parley') cut.push({ ...base, why: 'parley' });
		else if (e && e.why === 'floor') cut.push({ ...base, why: 'floor', good: at.give, level: levelOf(at.give), floor: I.initial.floors[at.give] || 0, owned: 0, want: at.giveN });
		else if (land && G[at.give] && G[at.give].cap !== null && !fromPile) cut.push({ ...base, why: 'market', good: at.give, want: at.giveN, listed: G[at.give].cap, held: land ? 0 : 0 });
		else cut.push({ ...base, why: 'nothing' });
	});

	// What was bought ashore, or taken from the sailor's pile of it.
	const start = r.log.find(e => e.kind === 'start') || { bought: {}, loaded: {} };
	const boughtRows = fromPile ? [] : Object.entries(start.bought || {}).map(([item, n]) => {
		const p = prices[item] || { each: 0, how: 'unpriced' };
		return { item, n, each: p.each, how: p.how, total: Math.ceil(n) * p.each, stock: Number.isFinite(p.stock) ? p.stock : null };
	});
	const takenRows = fromPile ? Object.entries(start.bought || {}).map(([item, n]) => ({ item, n, left: Math.max(0, (land.get(item) || 0) - n) })) : [];
	const kept = Object.entries(r.hold).filter(([item, n]) => n > 1e-9 && levelOf(item) !== null)
		.map(([item, n]) => ({ item, n, each: sellOf(item), total: n * sellOf(item), stock: Math.min(n, I.initial.floors[item] || 0) }))
		.sort((a, b) => b.total - a.total || a.item.localeCompare(b.item));
	const silver = sold.reduce((a, s) => a + s.total, 0);
	const cost = boughtRows.reduce((a, b) => a + b.total, 0);
	return {
		order, lots, stops, sold, kept, stashed,
		loaded: Object.entries(start.loaded || {}).map(([item, n]) => ({ item, n })),
		landLoaded: Object.entries(start.bought || {}).map(([item, n]) => ({ item, n })),
		bagLoaded: [], bagFromHold: [], bagPeak: 0, bagShort: false, bag: null,
		cut, skippedWhole: [],
		bought: boughtRows, taken: takenRows,
		coins: 0, coinsMax: 0,
		cost, net: silver - cost, silver,
		keptWorth: kept.reduce((a, s) => a + s.total, 0) + stashed.reduce((a, s) => a + s.total, 0),
		trades: r.trades, parleyUsed: r.P, parleyBar: parley.bar,
		weightStart, weightPeak: peak, hold: opts0(I),
		rungs: [],
		hours: r.T,
		planner: 'new'
	};
}
const opts0 = I => ({ free: I.vehicle.Wfree, deal: I.vehicle.Wdeal, max: I.vehicle.Wmax });

/**
 * chainRun, laid by the new planner: the same options in, a run of the
 * same shape out. Throws on what it cannot lay yet (see `unsupported`), so
 * no caller is handed a run that quietly ignored the bag or a route edit.
 */
export function solveRun(opts = {}) {
	const missing = unsupported(opts);
	if (missing.length) throw new Error(`new planner: not yet: ${missing.join(', ')}`);
	const chosen = opts.chosen || [];
	if (!chosen.length) return runOf(...emptyRun(opts));
	const { I, rowOf, chains } = instanceOf(opts);
	indexOf(I);
	const plan = planFor(I, chains, { effort: opts.effort ?? 2, timeMs: opts.timeMs ?? 300, seed: opts.seed ?? 1 });
	return runOf(I, plan, { chosen, rowOf, stashes: opts.stashes || [], parley: opts.parley, prices: opts.prices || {}, orders: opts.orders || PLAIN_ORDERS, land: opts.land || new Map() });
}

// Nothing ticked: a run with no stops, as chainRun gives one.
function emptyRun(opts) {
	const { I, rowOf } = instanceOf({ ...opts, chosen: [] });
	return [I, { visits: [{ at: I.rules.end }] }, { chosen: [], rowOf, stashes: opts.stashes || [], parley: opts.parley, prices: opts.prices || {}, orders: opts.orders || PLAIN_ORDERS, land: opts.land || new Map() }];
}
