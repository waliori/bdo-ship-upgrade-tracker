// A barter run planned from what is aboard.
//
// The rest of the barter code answers "what does getting this cost":
// the ladder folds an item into trades, the forecast paces it in days.
// This file answers the other question a sailor asks before casting
// off -- "with what I am holding, where do I go" -- for a material:
// which rung of its ladder the hold already covers, what is the first
// thing missing, and the stops in sailing order from there. The run
// for silver is barter-chains.js, on today's board; the readings of
// the table shared by both are here.
//
// Everything here assumes the table's offer is on the island's list
// today. It will not always be -- each island shows one random
// exchange a refresh -- so a plan is the best the pool allows, and the
// screen says so. Quantities are the averages of the game's ranges,
// the way the ladder and the loop's ledger already count them, so the
// counts are fractions inside and whole numbers where a person reads
// them.
//
// Nothing here touches the store or the screen: stock, hold and the
// table come in as arguments, so the plans can be tested on a pinned
// table and drawn by any screen.

import { GOODS, amount, levelOf, triesFor } from './barter.js';

/** The weight of a good, 0 for anything the table does not price. */
export function weightOf(name) {
	const lv = levelOf(name);
	return lv && GOODS[lv] ? GOODS[lv].weight : 0;
}

/** What a barterer pays for a good, 0 for the unsellable levels and
 *  for anything that is not a good. */
export function sellOf(name) {
	const lv = levelOf(name);
	return lv && GOODS[lv] ? GOODS[lv].sell : 0;
}

/**
 * The table as flat rows: one per exchange an island offers, with the
 * quantities as numbers -- `recv` the average of the game's range, the
 * way the ladder counts, and `recvMin`/`recvMax` its ends for a plan
 * that counts the goods at the least and the weight at the most. The
 * dataset is keyed by what is received; planning is keyed by what is
 * handed over, so both are on the row.
 */
export function exchanges(barterData) {
	const out = [];
	for (const e of barterData || []) {
		for (const s of e.sources || []) {
			if (!s.give) continue;
			const recv = amount(s.quantity_received), giveN = amount(s.give.quantity);
			if (!(recv > 0) || !(giveN > 0)) continue;
			const ends = String(s.quantity_received).split('-').map(Number).filter(n => Number.isFinite(n) && n > 0);
			out.push({
				npcId: s.npc_id, npc: s.npc_name,
				item: e.name, recv, recvText: String(s.quantity_received),
				recvMin: ends.length ? Math.min(...ends) : recv, recvMax: ends.length ? Math.max(...ends) : recv,
				give: s.give.name, giveN, giveText: String(s.give.quantity),
				tries: triesFor(e.name, s.attempts_available)
			});
		}
	}
	return out;
}

/**
 * What is aboard, read from a store: the goods noted in the ship's hold
 * and the goods no storage claims -- a good just bartered is in the
 * ship's inventory until it is put ashore. Goods noted at a harbour are
 * ashore, and a run loads them only from the harbour it sails from. The
 * Barter tab and the Map read the same hold through this, so the two
 * never disagree about what a hull is carrying. The store is handed in
 * rather than imported, to keep this file free of the screen's state.
 */
export function aboardStock(store) {
	const out = {};
	for (const [name, qty] of Object.entries(store.getAllStock())) {
		if (levelOf(name) === null || !(qty > 0)) continue;
		const n = store.stockAt(name, '') + store.stockAt(name, store.ABOARD);
		if (n > 0) out[name] = n;
	}
	return out;
}

/** The trade goods in a stock, as a Map of name to count. */
export function goodsHeld(stock) {
	const out = new Map();
	for (const [name, qty] of Object.entries(stock || {})) {
		if (levelOf(name) !== null && qty > 0) out.set(name, Number(qty));
	}
	return out;
}

/** What a set of goods weighs. */
export function weightHeld(held) {
	let w = 0;
	for (const [name, n] of held) w += n * weightOf(name);
	return w;
}

const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);

/** Islands in nearest-neighbour order from `from`, each visited once. */
function chain(stops, from, npcById) {
	const left = [...stops];
	const out = [];
	let at = from;
	while (left.length) {
		let best = 0;
		if (at) {
			let bestD = Infinity;
			left.forEach((s, i) => {
				const d = dist(at, npcById.get(s.npcId));
				if (d < bestD) { bestD = d; best = i; }
			});
		}
		const [next] = left.splice(best, 1);
		out.push(next);
		at = npcById.get(next.npcId) || at;
	}
	return out;
}

/**
 * The run for one material, from whatever is held.
 *
 * Demand runs down and the hold answers first. To cover `need` of a
 * target: every exchange that hands the target over is tried with what
 * is aboard of its give, best rate first, each island once; only the
 * shortfall goes to the best exchange by rate, whose give is then
 * covered the same way one rung down -- so a [Level 4] aboard on a
 * side path is spent before a land good is bought. The walk stops at a
 * land good, which is bought ashore, and never runs past seven rungs.
 * The islands for a rung are those dealing that exchange, nearest the
 * start first, each for as many attempts as it allows; when they run
 * out the rest waits for a refresh, and the plan says how many.
 *
 * Rungs come out top first, several to a level when the hold covers
 * part of one; every stop carries the index of its rung from the
 * bottom, which is the sailing order.
 */
export function materialPlan({ item, qty = 1, stock = {}, barterData, npcById, start = null, hold = null, showing = [] } = {}) {
	// What the material list shows today, when the sailor has said: an
	// island deals one material exchange a refresh, so with any answer
	// given, only the exchanges seen are the ones a material rung can
	// use; the rungs of trade goods below are the trade board's.
	const shown = new Set(showing.map(a => `${a.npcId}|${a.give}|${a.recv}`));
	const rows = exchanges(barterData).filter(x => npcById.has(x.npcId))
		.filter(x => levelOf(x.item) !== null || !shown.size || shown.has(`${x.npcId}|${x.give}|${x.item}`));
	if (!rows.some(x => x.item === item)) return null;
	const held = goodsHeld(stock);
	const used = new Set();   // an island deals one exchange a run
	const rungs = [];
	const rate = x => x.recv / x.giveN;
	// Every island dealing the same exchange, unused, nearest first.
	const islandsFor = x => rows.filter(y => y.item === x.item && y.give === x.give && !used.has(y.npcId))
		.sort((a, b) => dist(start, npcById.get(a.npcId)) - dist(start, npcById.get(b.npcId)) || a.npc.localeCompare(b.npc));
	// The stops that make `trades` of exchange `x`, taking islands.
	const book = (x, trades) => {
		const stops = [];
		let left = trades;
		for (const y of islandsFor(x)) {
			if (left <= 0) break;
			const times = Math.min(y.tries, left);
			stops.push({ ...y, times });
			used.add(y.npcId);
			left -= times;
		}
		return stops;
	};
	const perRefresh = x => rows.filter(y => y.item === x.item && y.give === x.give).reduce((a, y) => a + y.tries, 0);
	const cover = (target, need, depth) => {
		if (need <= 1e-9 || depth > 7) return;
		// The exchanges handing the target over, the ones the hold can
		// feed first, then by what a trade pays.
		const ex = [];
		const seenKey = new Set();
		for (const x of rows) {
			if (x.item !== target) continue;
			const k = `${x.give}|${x.recvText}|${x.giveText}`;
			if (seenKey.has(k)) continue;
			seenKey.add(k);
			ex.push(x);
		}
		// Ties broken the ladder's way: the higher attempt cap needs fewer
		// redraws, and the give more islands deal is likelier on a board.
		const spread = x => rows.filter(y => y.item === target && y.give === x.give).length;
		const better = (a, b) => rate(b) - rate(a) || b.tries - a.tries || spread(b) - spread(a);
		ex.sort((a, b) => Number((held.get(b.give) || 0) > 0) - Number((held.get(a.give) || 0) > 0) || better(a, b));
		// From the hold, exchange by exchange.
		for (const x of ex) {
			if (need <= 1e-9) break;
			const have = held.get(x.give) || 0;
			if (have <= 0) continue;
			const want = Math.ceil(need / x.recv - 1e-9);
			const can = Math.floor(have / x.giveN + 1e-9);
			const trades = Math.min(want, can);
			if (trades < 1) continue;
			const stops = book(x, trades);
			const made = stops.reduce((a, s) => a + s.times, 0);
			if (!made) continue;
			const giveNeed = made * x.giveN;
			held.set(x.give, have - giveNeed);
			rungs.push({ item: target, give: x.give, recv: x.recv, recvText: x.recvText, giveN: x.giveN,
				need, trades: made, giveNeed, have, short: 0, tradesShort: 0, stops,
				refreshes: 1, seed: null, depth });
			need -= made * x.recv;
		}
		if (need <= 1e-9) return;
		// The shortfall: the best exchange by rate, its give covered a
		// rung down, or bought ashore when it is a land good.
		const best = ex.slice().sort(better)[0];
		if (!best) return;
		const trades = Math.ceil(need / best.recv - 1e-9);
		const stops = book(best, trades);
		const made = stops.reduce((a, s) => a + s.times, 0);
		// No island left to deal it today: the rest waits for another
		// refresh, and nothing is climbed for it now.
		if (!made) {
			rungs.push({ item: target, give: best.give, recv: best.recv, recvText: best.recvText, giveN: best.giveN,
				need, trades: 0, giveNeed: 0, have: 0, short: 0, tradesShort: 0, stops: [], waits: need, refreshes: 0, seed: null, depth });
			return;
		}
		const giveNeed = made * best.giveN;
		const per = perRefresh(best);
		const land = levelOf(best.give) === null;
		rungs.push({ item: target, give: best.give, recv: best.recv, recvText: best.recvText, giveN: best.giveN,
			need, trades: made, giveNeed, have: 0, short: giveNeed, tradesShort: made, stops,
			refreshes: per ? Math.ceil(trades / per) : 0, waits: made < trades ? need - made * best.recv : 0,
			seed: land ? { item: best.give, qty: giveNeed } : null, depth });
		if (!land) cover(best.give, giveNeed, depth + 1);
	};
	cover(item, qty, 0);
	if (!rungs.length) return null;

	// The first thing to get: the deepest rung still short -- its give
	// bought ashore when it is a land good, else traded up from below.
	const shortRungs = rungs.filter(r => r.short > 0);
	const lowest = shortRungs.length ? shortRungs.reduce((a, r) => (r.depth >= a.depth ? r : a)) : null;
	const first = lowest ? { item: lowest.give, n: lowest.short, ashore: !!lowest.seed } : null;

	// Sailing order: the deepest rung first, each rung's islands nearest
	// first from where the last left off. Every stop carries its rung's
	// index from the bottom, for the screen's segments.
	const order = rungs.map((r, i) => i).sort((a, b) => rungs[b].depth - rungs[a].depth || b - a);
	const level = new Map(order.map((i, k) => [i, k]));
	const stops = [];
	let at = start;
	for (const i of order) {
		const here = chain(rungs[i].stops, at, npcById);
		stops.push(...here.map(s => ({ ...s, level: level.get(i) })));
		if (here.length) at = npcById.get(here[here.length - 1].npcId) || at;
	}
	// The rungs in the screen's order: top first, so the reverse is the
	// sailing order and the stop's `level` indexes it.
	const ordered = order.slice().reverse().map(i => rungs[i]);

	// The hold along the way, goods only.
	const held0 = goodsHeld(stock);
	let w = weightHeld(held0);
	for (const s of stops) {
		w += s.times * (s.recv * weightOf(s.item) - s.giveN * weightOf(s.give));
		s.weightAfter = w;
	}
	const peak = Math.max(weightHeld(held0), ...stops.map(s => s.weightAfter));
	return {
		item, qty, rungs: ordered, stops, first,
		trades: stops.reduce((a, s) => a + s.times, 0),
		refreshes: Math.max(0, ...ordered.map(r => r.refreshes)),
		weightStart: weightHeld(held0), weightPeak: peak, hold,
		waits: ordered.reduce((a, r) => a + (r.waits || 0), 0),
		covered: !shortRungs.length && !ordered.some(r => r.waits > 0)
	};
}
