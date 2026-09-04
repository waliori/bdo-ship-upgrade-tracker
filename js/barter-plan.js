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

import { GOODS, amount, levelOf, ladder, triesFor } from './barter.js';

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
 * quantities as numbers. The dataset is keyed by what is received;
 * planning is keyed by what is handed over, so both are on the row.
 */
export function exchanges(barterData) {
	const out = [];
	for (const e of barterData || []) {
		for (const s of e.sources || []) {
			if (!s.give) continue;
			const recv = amount(s.quantity_received), giveN = amount(s.give.quantity);
			if (!(recv > 0) || !(giveN > 0)) continue;
			out.push({
				npcId: s.npc_id, npc: s.npc_name,
				item: e.name, recv, recvText: String(s.quantity_received),
				give: s.give.name, giveN, giveText: String(s.give.quantity),
				tries: triesFor(e.name, s.attempts_available)
			});
		}
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
 * The run for one material.
 *
 * The ladder says which exchange pays best at each rung; this counts
 * each rung against the hold. From the top: how many of the rung's
 * give are wanted, how many are aboard, how many trades cover the rest
 * -- and the rung below is only asked for what those trades hand over.
 * The islands for a rung are those dealing that same exchange, nearest
 * the start first, each for as many attempts as it allows; when they
 * run out the rest waits for a refresh, and the plan says how many.
 */
export function materialPlan({ item, qty = 1, stock = {}, barterData, npcById, start = null, hold = null } = {}) {
	const top = ladder(item, barterData);
	if (!top) return null;
	const rows = exchanges(barterData);
	const held = goodsHeld(stock);
	const rungs = [];
	const used = new Set();   // an island deals one exchange a run
	let need = qty;
	for (let r = top; r; r = r.from) {
		const have = held.get(r.give) || 0;
		const recvNeed = need;                                    // of r.item
		const trades = Math.ceil(recvNeed / r.received - 1e-9);   // at this rung
		const giveNeed = trades * r.given;                        // of r.give
		const short = Math.max(0, giveNeed - have);
		// Only the trades the shortfall forces are made below; what is
		// aboard covers the rest of this rung's hand-over.
		const tradesShort = Math.ceil(short / r.given - 1e-9);
		const same = rows.filter(x => x.item === r.item && x.give === r.give && npcById.has(x.npcId) && !used.has(x.npcId))
			.sort((a, b) => dist(start, npcById.get(a.npcId)) - dist(start, npcById.get(b.npcId)) || a.npc.localeCompare(b.npc));
		const stops = [];
		let left = trades;
		for (const x of same) {
			if (left <= 0) break;
			const times = Math.min(x.tries, left);
			stops.push({ ...x, times });
			used.add(x.npcId);
			left -= times;
		}
		const perRefresh = same.reduce((a, x) => a + x.tries, 0);
		rungs.push({
			item: r.item, give: r.give, recv: r.received, recvText: r.receivedText, giveN: r.given,
			need: recvNeed, trades, giveNeed, have, short, tradesShort, stops,
			refreshes: perRefresh ? Math.ceil(trades / perRefresh) : 0,
			seed: r.seed && !r.from ? r.seed : null
		});
		if (short <= 0) break;         // the hold covers this rung's give
		need = tradesShort * r.given;  // the rung below hands over this many
	}
	// The first thing to get: the lowest rung still short is where the
	// run starts -- its give bought ashore when that is the seed, else
	// traded up from whatever is aboard below it.
	const lowest = rungs[rungs.length - 1];
	let first = null;
	if (lowest.short > 0) {
		first = lowest.seed
			? { item: lowest.give, n: lowest.short, ashore: true }
			: { item: lowest.give, n: lowest.short, ashore: false };
	}
	// Sailing order: the bottom rung first, each rung's islands nearest
	// first from where the last left off.
	const stops = [];
	let at = start;
	for (let i = rungs.length - 1; i >= 0; i--) {
		const here = chain(rungs[i].stops, at, npcById);
		stops.push(...here.map(s => ({ ...s, level: rungs.length - 1 - i })));
		if (here.length) at = npcById.get(here[here.length - 1].npcId) || at;
	}
	// The hold along the way, goods only.
	let w = weightHeld(held);
	for (const s of stops) {
		w += s.times * (s.recv * weightOf(s.item) - s.giveN * weightOf(s.give));
		s.weightAfter = w;
	}
	const peak = Math.max(weightHeld(held), ...stops.map(s => s.weightAfter));
	return {
		item, qty, rungs, stops, first,
		trades: stops.reduce((a, s) => a + s.times, 0),
		refreshes: Math.max(0, ...rungs.map(r => r.refreshes)),
		weightStart: weightHeld(held), weightPeak: peak, hold,
		covered: rungs[0].short <= 0
	};
}
