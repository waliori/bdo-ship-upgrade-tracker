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

import { levelOf, PARLEY, COIN } from './barter.js';
import { cutAt } from './barter-short.js';
import { weightOf, sellOf, stacks } from './barter-plan.js';
import { sellable, floorOf, PLAIN_ORDERS } from './barter-orders.js';
import { seaDist } from './barter-route.js';
import { METRES_PER_PX, speedMs, BAND_MEASURED } from './sailing.js';

// The tab times a leg at the middle of the speed's measured band: the
// mean of the quick end and the slow, a shade slower than the speed itself.
const MID_PACE = (1 / (1 + BAND_MEASURED) + 1 / (1 - BAND_MEASURED)) / 2;
import { simulate, planPolicy } from './rpit/simulate.js';
import { finish, indexOf, chainsOf, fillOfRun } from './rpit/common.js';
import { withChain, reorder, serial } from './rpit/insert.js';
import { maximiseRate } from './rpit/ratio.js';
import { search } from './rpit/alns.js';

/** What the new planner cannot lay yet, for these options; empty when it can. */
export function unsupported(opts = {}) {
	const out = [];
	return out;
}

/**
 * The day as the planner's instance, from chainRun's options. Returns
 * { I, rowOf, chains } -- the instance; each island's exchange row as the
 * board gives it (payouts seen this run folded in); and the chosen chains
 * as climbs of station ids, in the order given.
 */
// A supply wharf's point: its place, or with its own name beside it where
// two wharves share the place -- Abandoned Pier is Purio and Torio, four
// kilometres apart, and one id for both had the ship fill up at one and be
// timed to the other (2026-10-08).
// A run for coins is judged on the coins it brings back, the silver only
// between two that bring the same, as chainRun's coin goal judges them: a
// coin here is worth more than any run's silver (a few billion), and less
// than the sailor's rules -- a hundred coins are not worth storing a good
// twice, nor ten thousand an hour past the session (common.js).
const COIN_WORTH = 1e10;

const supplyId = (list, w) => (list.filter(x => x.at === w.at).length > 1 ? `${w.at} (${w.name})` : w.at);

export function instanceOf(opts) {
	const { chosen = [], stock = {}, dock = {}, hold, parley, npcById, stashes = [], prefer = null, pace = 'full', orders = PLAIN_ORDERS, prices = {}, seen = {}, keep = [], land = new Map(), ship = null } = opts;
	// A run that sails from no harbour starts at the first storage wharf:
	// the instance needs a point to start from, and that is one a sailor
	// calls at anyway.
	const start = opts.start || stashes[0];
	// A payout the sailor saw replaces the range, as chainRun counts it.
	const fix = r => (seen[r.npcId] > 0 ? { ...r, recv: seen[r.npcId], recvMin: seen[r.npcId], recvMax: seen[r.npcId], recvText: String(seen[r.npcId]), rangeMin: r.rangeMin ?? r.recvMin, rangeMax: r.rangeMax ?? r.recvMax } : r);
	const rowOf = new Map();
	for (const c of chosen) for (const r of c.rungs) if (!rowOf.has(String(r.npcId))) rowOf.set(String(r.npcId), fix(r));
	const rows = [...rowOf.values()];
	// Each exchange its own Parley, as chainRun charges it: the game's base
	// for it at the sailor's rate.
	const rate = parley.rate > 0 ? parley.rate : parley.perTrade / PARLEY.perGreatOceanTrade;
	const stations = rows.map(r => ({ id: String(r.npcId), name: r.npc, in: r.give, q: r.giveN, out: r.item, ymin: r.recvMin, ymax: r.recvMax, p: 0.5, m: r.tries, c: r.parleyBase > 0 ? Math.floor(r.parleyBase * rate) : parley.perTrade }));

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
			cap,
			stack: stacks(name)
		};
	}
	const floors = {};
	for (const name of names) { const f = floorOf(name, orders); if (f > 0) floors[name] = f; }

	// Home: the start harbour's storage when it has one, else the storage
	// nearest it. The dock goods are the start harbour's, loaded at the start.
	const home = stashes.find(w => w.at === start.name) || stashes.reduce((a, w) => (!a || seaDist(start, w) < seaDist(start, a) ? w : a), null);
	const depots = stashes.map(w => ({ id: w.at, x: w.x, y: w.y, storage: w === home ? { ...dock } : {} }));
	// The wharves that fill the ration pool and trade nothing: every
	// supply wharf that is not a storage's (opts.supplies, barter/route.js).
	const supplyWharfs = opts.rations ? (opts.supplies || []).filter(w => !stashes.some(x => x.at === w.at)) : [];
	const objs = [start, ...stashes, ...supplyWharfs, ...rows.map(r => npcById.get(r.npcId))];
	const points = ['start', ...stashes.map(w => w.at), ...supplyWharfs.map(w => supplyId(supplyWharfs, w)), ...rows.map(r => String(r.npcId))];
	const matrix = objs.map(a => objs.map(b => (a === b ? 0 : seaDist(a, b) * METRES_PER_PX)));
	// Leg by leg as the app sails and times them: straight from one stop to
	// the next, never by way of a third (the bench's instances take the
	// shortest way round; a run laid on those came out longer in the tab).

	const pause = orders.pause || { isle: 0, call: 0 };
	const I = {
		name: 'live', goods, stations, depots, ...(supplyWharfs.length ? { supplies: supplyWharfs.map(w => ({ id: supplyId(supplyWharfs, w), x: w.x, y: w.y })) } : {}),
		start: { id: 'start', x: start.x, y: start.y },
		travel: { points, matrix },
		// What every leg costs beyond the sailing, as the tab times it.
		service: { station: pause.isle || 0, depot: pause.call || 0, leg: ship && ship.lag > 0 ? ship.lag : 0 },
		vehicle: { Wfree: hold.free, Wdeal: hold.deal ?? hold.free, Wmax: hold.max ?? hold.deal ?? hold.free, speed: (ship && ship.speed > 0 ? speedMs(ship.speed, ship.cal) : speedMs(100)) / MID_PACE, slowAtMax: 0.5, ...(Number.isFinite(hold.slots) && hold.slots > 0 ? { slots: hold.slots } : {}), ...(opts.rations ? { rations: { reserve: 0.1, ...opts.rations } } : {}), ...(opts.bag && opts.bag.free > 0 ? { bag: { free: opts.bag.free, slots: Number.isFinite(opts.bag.slots) ? opts.bag.slots : Infinity } } : {}) },
		// The bar as it stands, and the vouchers apart: each comes on its own
		// cooldown, so a bar and four vouchers are not one bigger bar.
		budgets: parley.vouchers > 0 && parley.held > 0
			? { P: parley.held, H: null, vouchers: { n: parley.vouchers, each: PARLEY.voucher, max: PARLEY.max, cooldownH: 2 } }
			: { P: parley.bar, H: null },
		initial: { hold: { ...stock }, floors },
		rules: { pace, dropPolicy: 'any', home: home.at, end: prefer ? prefer.at : home.at, underWaySpeed: ship && ship.speed > 0 ? speedMs(ship.speed, ship.cal) : speedMs(100), ...(opts.aim && opts.aim.kind === 'coins' ? { coinWorth: COIN_WORTH } : {}), ...(opts.aim && opts.aim.targets ? { stock: { kind: opts.aim.kind, targets: opts.aim.targets, held: Object.fromEntries(opts.aim.held || []) } } : {}) },
		objective: 'silver_per_hour',
		meta: {}
	};
	const chains = chosen.map((c, k) => ({ id: k, rungs: c.rungs.map(r => String(r.npcId)), top: c.top }));
	return { I, rowOf, chains, home, supplyWharfs };
}

/**
 * The plan for the chosen chains: every island of theirs, in the order and
 * with the attempts and calls that make the most silver inside the
 * session (with none, however long it takes). `effort` as chainRun takes
 * it: 0 the chains' thin ladders in a quick order, 1 the route searched,
 * 2 the search over attempts, order and calls (ALNS).
 *
 * Judged an hour at a time, as it was, it thinned every island's trades
 * and threaded the trips together: the run the search proposed, laid
 * again once its goods were ticked aboard, came out at half the silver
 * (2026-10-07, real boards).
 */
export function planFor(I, chains, { effort = 2, seed = 1, session = 0, way = 'sea' } = {}) {
	let seq = [];
	for (const c of chains) seq = withChain(I, seq, c.rungs);
	const must = chains.map(c => c.rungs[c.rungs.length - 1]);
	I.rules.hours = session > 0 ? session : CLEAR;
	// Three ways to start: the climbs threaded together by the shortest
	// route; one after another as ticked; one after another, the best
	// first -- a trip each, which a stocked storage and a small hold need.
	const solo = new Map(chains.map(c => [c.id, finish(I, c.rungs.map(at => ({ at })), 0).f]));
	const best1st = chains.slice().sort((a, b) => solo.get(b.id) - solo.get(a.id));
	// The chain way -- the sailor's order, "chain after chain" -- sails each
	// climb whole before the next: the climbs one after another, and no
	// search that would thread them together.
	const starts = way === 'chain' ? [serial(I, seq, chains), serial(I, seq, best1st)] : [reorder(I, seq, { effort: Math.min(effort, 2) }), serial(I, seq, chains), serial(I, seq, best1st)];
	const tried = starts.map(s => finish(I, s, 0, { must })).sort((a, b) => b.f - a.f);
	if (effort < 2 || way === 'chain') return tried[0].plan;
	return search(I, { mu: 0, timeMs: Infinity, most: WORK, seed, pool: chains, fixed: true, warm: { seq: tried[0].visits, calls: tried[0].calls } }).plan;
}

/**
 * A run in chainRun's shape from a plan, sailed robust -- counted at the
 * least an island pays and weighed at the most, as chainRun counts -- so
 * that the numbers the tab shows are the ones the plan can promise.
 */
export function runOf(I, plan, { chosen, rowOf, stashes, parley, prices = {}, orders = PLAIN_ORDERS, land = new Map(), supplies = [] }) {
	const r = simulate(I, planPolicy(plan), { mode: 'robust' });
	const wharfOf = new Map([...supplies.map(w => [supplyId(supplies, w), w]), ...stashes.map(w => [w.at, w])]);
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
		if (e.kind !== 'depot' && e.kind !== 'supply') continue;
		const wharf = wharfOf.get(e.at);
		// A call that only fills the ration pool is the tab's own refill
		// stop, laid by the planner and kept as laid (`fixed`).
		const fetched = Object.entries(e.fetched || {}).map(([item, n]) => ({ item, n }));
		if (!fetched.length && (e.kind === 'supply' || (!Object.keys(e.sold).length && !Object.keys(e.dropped).length && !Object.keys(e.loaded).length && e.refilled > 0))) {
			stops.push({ wharf: { name: wharf.name, at: wharf.at, x: wharf.x, y: wharf.y }, dropped: [], loads: [], weightAfter: e.W, chain: chainNow, refill: true, fixed: true });
			continue;
		}
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
		if (loads.length) stop.loads = loads;
		// Out of the sailor's bag at this wharf: a later trip's goods, as
		// chainRun's `fromBag` -- the trip starts here, not at home.
		if (fetched.length) stop.fromBag = fetched;
		if (loads.length || fetched.length) lotStarts.push(stops.length);
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
	for (const s of stops) for (const l of [...(s.loads || []), ...(s.fromBag || [])]) l.lot = lotOfStop(stops.indexOf(s));
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
		// The bag as chainRun reports it: what goes into it before casting off.
		bagLoaded: Object.entries(start.bagged || {}).map(([item, n]) => ({ item, n })), bagFromHold: [], bagShort: false,
		bag: I.vehicle.bag ? { free: I.vehicle.bag.free, slots: Number.isFinite(I.vehicle.bag.slots) ? I.vehicle.bag.slots : null } : null,
		landLoaded: Object.entries(start.bought || {}).map(([item, n]) => ({ item, n })),
		bagLoaded: [], bagFromHold: [], bagPeak: 0, bagShort: false, bag: null,
		cut, skippedWhole: [],
		bought: boughtRows, taken: takenRows,
		coins: 0, coinsMax: 0,
		cost, net: silver - cost, silver,
		keptWorth: kept.reduce((a, s) => a + s.total, 0) + stashed.reduce((a, s) => a + s.total, 0),
		trades: r.trades, parleyUsed: r.P, parleyBar: parley.bar,
		// The Crow Coins the run is paid, as chainRun counts them: the
		// least each exchange pays, and the most.
		coins: stops.reduce((a, s) => a + (s.item === COIN ? s.times * s.recvMin : 0), 0),
		coinsMax: stops.reduce((a, s) => a + (s.item === COIN ? s.times * s.recvMax : 0), 0),
		weightStart, weightPeak: peak, hold: opts0(I),
		rungs: [],
		hours: r.T,
		planner: 'new'
	};
}
const opts0 = I => ({ free: I.vehicle.Wfree, deal: I.vehicle.Wdeal, max: I.vehicle.Wmax });

/**
 * The islands the sailor took off the route, as chainRun takes them: a
 * climb goes as far as the island before the first of them, and one taken
 * off at its very first island is not sailed -- said in `skippedWhole`.
 */
function skipping(opts) {
	const skip = new Set(opts.skipIsles || []);
	if (!skip.size) return { opts, skippedWhole: [] };
	const trimmed = (opts.chosen || []).map(c => {
		const i = c.rungs.findIndex(r => skip.has(r.npcId));
		return i < 0 ? c : { ...c, rungs: c.rungs.slice(0, i), fullRungs: c.rungs, skippedAt: c.rungs[i] };
	});
	const skippedWhole = trimmed.filter(c => !c.rungs.length).map(c => ({ id: c.id, item: c.item, npcId: c.skippedAt.npcId, npc: c.skippedAt.npc, of: c.fullRungs.length }));
	return { opts: { ...opts, chosen: trimmed.filter(c => c.rungs.length), skipIsles: [] }, skippedWhole };
}

/**
 * chainRun, laid by the new planner: the same options in, a run of the
 * same shape out. Throws on what it cannot lay yet (see `unsupported`), so
 * no caller is handed a run that quietly ignored the bag or a route edit.
 */
export function solveRun(opts0 = {}) {
	const missing = unsupported(opts0);
	if (missing.length) throw new Error(`new planner: not yet: ${missing.join(', ')}`);
	const { opts, skippedWhole } = skipping(opts0);
	const chosen = opts.chosen || [];
	if (!chosen.length) return { ...runOf(...emptyRun(opts)), skippedWhole };
	const { I, rowOf, chains, supplyWharfs } = instanceOf(opts);
	indexOf(I);
	const how = { chosen, rowOf, stashes: opts.stashes || [], parley: opts.parley, prices: opts.prices || {}, orders: opts.orders || PLAIN_ORDERS, land: opts.land || new Map(), supplies: supplyWharfs };
	// The chains the search proposed, ticked as it proposed them: the plan
	// it found, not a second laying that might land elsewhere.
	const ids = chosen.map(c => c.id).sort().join('|');
	const had = found.get(ids);
	const plan = had && had.day === dayOf(I) ? asPacked(had.plan, had.hold, I) : planFor(I, chains, { effort: opts.effort ?? 2, seed: opts.seed ?? 1, session: opts.session || 0, way: (opts.orders || PLAIN_ORDERS).way });
	const edited = edits(I, chains, chosen, plan, runOf(I, plan, how), opts);
	return { ...runOf(I, edited, how), skippedWhole };
}

/**
 * The sailor's own edits on the wharf step, laid onto the plan as chainRun
 * lays them: the trips named in `tripOrder` sailed in that order, any
 * others after them as they were; a stop `nudge`d sooner or later a step
 * at a time, never past an island of its own climb -- a good is not handed
 * over before it is made -- and never out of its trip. The calls are laid
 * again round the order as the sailor left it; nothing is searched, or the
 * search would undo the edit.
 */
function edits(I, chains, chosen, plan, run, opts) {
	const nudge = opts.nudge || {}, tripOrder = opts.tripOrder || [];
	if (!Object.keys(nudge).length && !tripOrder.length) return plan;
	const { station } = indexOf(I);
	// Climbs and trips as the run shown numbers them -- the order it meets
	// the climbs in, not the order they were ticked in.
	const chainOf = id => { const st = run.stops.find(x => x.npcId && String(x.npcId) === id); return st ? st.chain : -1; };
	const lotOf = id => { const k = chainOf(id); return run.lots.findIndex(l => l.includes(k)); };
	let seq = plan.visits.filter(v => station.has(v.at)).map(v => ({ at: v.at, a: v.a }));
	if (tripOrder.length && run.lots.length > 1) {
		const keyOf = lot => lot.map(k => run.order[k].id).sort().join('+');
		const rank = j => { const i = tripOrder.indexOf(keyOf(run.lots[j])); return i < 0 ? tripOrder.length + j : i; };
		seq = seq.map((v, i) => ({ v, i })).sort((x, y) => rank(lotOf(x.v.at)) - rank(lotOf(y.v.at)) || x.i - y.i).map(x => x.v);
	}
	for (const [id, by] of Object.entries(nudge)) {
		let i = seq.findIndex(v => v.at === String(id));
		if (i < 0 || !by) continue;
		const dir = Math.sign(by);
		for (let step = 0; step < Math.abs(by); step++) {
			const j = i + dir;
			if (j < 0 || j >= seq.length || chainOf(seq[j].at) === chainOf(seq[i].at) || lotOf(seq[j].at) !== lotOf(seq[i].at)) break;
			[seq[i], seq[j]] = [seq[j], seq[i]];
			i = j;
		}
	}
	// Laid again from the order alone: the attempts the old order asked for
	// need not suit the new one, and held to them the laying dropped a
	// climb rather than trim its rungs (2026-10-08).
	return finish(I, seq.map(v => ({ at: v.at })), 0, { must: chains.map(c => c.rungs[c.rungs.length - 1]) }).plan;
}

// The plans the search found, by the chains each climbs, for the laying of
// those chains to give back. Several: ticking goods aboard asks the search
// again, and what it finds then must not push out the plan being packed.
const found = new Map();
const keep = (ids, x) => { found.delete(ids); found.set(ids, x); if (found.size > 8) found.delete(found.keys().next().value); };
// The day it was found for -- the board, the hold, the rations, everything
// but the chains -- with the goods aboard and the goods in the home
// storage counted together: ticking the start's goods aboard moves them
// from one to the other, and the plan is the same plan after it.
const homeOf = I => I.depots.find(d => d.id === I.rules.home) || { storage: {} };
// Only the goods the chains take and give: the wharf step moves others
// about as well (2026-10-07: five Green Salt Lumps no chain of the run
// touched), and a plan is not a different plan for it.
const goodsOf = I => {
	const used = new Set(I.stations.flatMap(s => [s.in, s.out]));
	const all = {};
	for (const m of [homeOf(I).storage, I.initial.hold]) for (const [g, n] of Object.entries(m)) if (used.has(g)) all[g] = (all[g] || 0) + n;
	return Object.fromEntries(Object.entries(all).filter(([, n]) => n > 0).sort());
};
const dayOf = I => JSON.stringify([I.stations.map(s => [s.id, s.ymin, s.ymax, s.m]).sort((a, b) => (a[0] < b[0] ? -1 : 1)), goodsOf(I), I.initial.floors, I.depots.filter(d => d !== homeOf(I)).map(d => d.storage), I.vehicle, I.budgets, I.rules]);
// The found plan for the day as it is now: what was to be loaded at the
// start and is aboard already is not loaded again.
const asPacked = (plan, was, I) => {
	if (!plan.load) return plan;
	const load = {};
	for (const [g, n] of Object.entries(plan.load)) {
		const moved = (I.initial.hold[g] || 0) - (was[g] || 0);
		if (n - moved > 1e-9) load[g] = n - moved;
	}
	return { ...plan, load };
};

/**
 * The runs worth sailing, found by the search over every chain the board
 * allows -- in propose()'s shape, so the tab draws them as its own: the
 * plan the search found for the most silver an hour, as the chains of
 * `all` it climbs. Each island the plan deals at is put to the chain
 * that climbs furthest through the islands dealt, the longest first.
 */
// The search's work, counted in its own steps and not in milliseconds: the
// same board and the same orders give the same run on any machine, busy or
// not. On the real boards of 2026-10-07 the starts did the work and a
// hundred steps more found nothing; forty keep the room to, in about a
// second on a desktop.
// ponytail: runs on the page's thread (1–6 s with the starts and the two
// rounds an hour); the worker the classic search uses is where it belongs
// before it ships.
const WORK = 40;
// No cap on hours: the board cleared -- the most silver, however long.
const CLEAR = 24;

export function newPropose(opts0, all0, { seed = 1, session = 0 } = {}) {
	// The islands taken off the route are off every climb proposed too.
	const { opts } = skipping({ ...opts0, chosen: all0 });
	const all = opts.chosen;
	const missing = unsupported({ ...opts, chosen: all });
	if (missing.length || !all.length) return { proposals: [], best: null, partial: false };
	const { I, rowOf, supplyWharfs } = instanceOf({ ...opts, chosen: all });
	indexOf(I);
	// The most silver inside the session, time priced at nothing; with none
	// set, the most the board gives. Searched from the best an hour too:
	// with time free the search lays every climb at once and sits there,
	// while the plan that earns most an hour, grown to fill the session,
	// was worth half as much again on an empty storage (2026-10-07).
	I.rules.hours = session > 0 ? session : CLEAR;
	const pool = chainsOf(I);
	// Two rounds of the price of time: a third found nothing more on the
	// real boards and cost as much again.
	const rate = maximiseRate(I, (inst, o) => search(inst, { ...o, timeMs: Infinity, most: Math.ceil(WORK / 4), pool }), { timeMs: Infinity, rounds: 2, seed });
	const best = search(I, { mu: 0, timeMs: Infinity, most: WORK, seed, pool, warm: { seq: rate.seq, calls: rate.calls } });
	const plan = best.plan;
	const r = simulate(I, planPolicy(plan), { mode: 'robust' });
	const dealt = new Set(r.log.filter(e => e.kind === 'station' && e.a > 0).map(e => e.at));
	const picked = [];
	const covered = new Set();
	for (const c of [...all].sort((a, b) => b.rungs.length - a.rungs.length)) {
		const ids = c.rungs.map(x => String(x.npcId));
		if (!ids.every(id => dealt.has(id)) || ids.every(id => covered.has(id))) continue;
		picked.push(c);
		for (const id of ids) covered.add(id);
	}
	// An island dealt at whose climb stops short of the top: that climb cut
	// at the last island it reaches, ticked as a short trip's are.
	for (const id of dealt) {
		if (covered.has(id)) continue;
		let cut = null;
		for (const c of all) {
			const ids = c.rungs.map(x => String(x.npcId));
			let k = -1;
			while (k + 1 < ids.length && dealt.has(ids[k + 1])) k++;
			if (k >= ids.indexOf(id) && ids.indexOf(id) >= 0 && (!cut || k > cut.k)) cut = { c, k };
		}
		if (!cut) continue;
		picked.push(cutAt(cut.c, cut.k));
		for (const x of cut.c.rungs.slice(0, cut.k + 1)) covered.add(String(x.npcId));
	}
	if (!picked.length) return { proposals: [], best: null, partial: false };
	// The plan laid again on the picked climbs alone: an island it dealt at
	// whose climb it left short of the top belongs to no climb a sailor can
	// tick, and the goods loaded for it went straight back ashore at the
	// first call (2026-10-07). Same islands, same order, same calls.
	const atPick = instanceOf({ ...opts, chosen: picked }).I;
	const on = new Set(atPick.stations.map(s => s.id));
	const lay = { ...atPick, rules: { ...atPick.rules, hours: I.rules.hours } };
	const kept = (opts.orders || PLAIN_ORDERS).way === 'chain'
		? { plan: planFor(lay, instanceOf({ ...opts, chosen: picked }).chains, { seed, session, way: 'chain' }) }
		: finish(lay, best.seq.filter(v => on.has(v.at)), 0, { calls: (best.calls || []).filter(c => on.has(c.before)) });
	const memo = { ids: picked.map(c => c.id).sort().join('|'), plan: kept.plan, day: dayOf(atPick), hold: { ...atPick.initial.hold } };
	keep(memo.ids, memo);
	const run = solveRun({ ...opts, chosen: picked });
	const hours = run.hours;
	const value = I.rules.coinWorth > 0 ? run.coins : I.rules.stock ? fillOfRun(instanceOf({ ...opts, chosen: picked }).I, simulate(lay, planPolicy(kept.plan), { mode: 'robust' })) : run.net;
	const coined = I.rules.coinWorth > 0, stocked = !!I.rules.stock;
	const proposal = { kind: coined ? 'coins' : stocked ? 'stock' : 'hour', label: coined ? 'The most coins' : stocked ? 'The fullest stock' : session > 0 ? `The most in ${session} h` : 'The most the board gives', ids: picked.map(c => c.id), run, value, hours, yard: { perUnit: run.parleyUsed > 0 ? value / (run.parleyUsed / PARLEY.perGreatOceanTrade) : 0, perHour: hours > 0 ? value / hours : 0 } };
	// The plan found goes back with the answer: searched in a worker, it is
	// the page's solveRun that has to know it, to lay the run proposed.
	return { proposals: [proposal], best: proposal, partial: false, kept: memo };
}

/** A plan found elsewhere -- in the worker -- remembered here, so the run
 *  proposed is the run laid when its climbs are ticked. */
export function rememberFound(memo) {
	if (memo && memo.ids) keep(memo.ids, memo);
}

// Nothing ticked: a run with no stops, as chainRun gives one.
function emptyRun(opts) {
	const { I, rowOf } = instanceOf({ ...opts, chosen: [] });
	return [I, { visits: [{ at: I.rules.end }] }, { chosen: [], rowOf, stashes: opts.stashes || [], parley: opts.parley, prices: opts.prices || {}, orders: opts.orders || PLAIN_ORDERS, land: opts.land || new Map(), supplies: [] }];
}
