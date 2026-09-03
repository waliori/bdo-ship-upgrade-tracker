// A barter run planned from what is aboard.
//
// The rest of the barter code answers "what does getting this cost":
// the ladder folds an item into trades, the forecast paces it in days.
// This file answers the other question a sailor asks before casting
// off -- "with what I am holding, where do I go" -- in two shapes. For
// silver: which exchanges, at which islands, turn the goods in the
// hold into the most a barterer will pay at the end, within the hold's
// weight, each island's attempts and the Parley bar. For a material:
// which rung of its ladder the hold already covers, what is the first
// thing missing, and the stops in sailing order from there.
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

import { GOODS, amount, levelOf, ladder } from './barter.js';

/** Where the table states no attempt cap, the tightest one it does. */
export const ASSUMED_TRIES = 2;

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
				tries: s.attempts_available > 0 ? s.attempts_available : ASSUMED_TRIES
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

/**
 * What one of each good is worth at the end of a run, looking up the
 * chain: what a barterer pays for it, or what it becomes further up
 * if that is more -- a [Level 5] is ten million on its own, but the
 * [Level 6] it turns into is fifty. A material is worth what `price`
 * says; the market's figure when there is one, else nothing. The
 * lookahead is what makes a greedy plan sensible at the bottom rungs,
 * where a trade pays nothing yet and is worth making anyway.
 */
export function worthOf(rows, price = () => 0) {
	const memo = new Map();
	const byGive = new Map();
	for (const r of rows) {
		if (!byGive.has(r.give)) byGive.set(r.give, []);
		byGive.get(r.give).push(r);
	}
	const worth = (name, seen = new Set()) => {
		if (memo.has(name)) return memo.get(name);
		if (seen.has(name)) return 0;
		let best = levelOf(name) === null ? (Number(price(name)) || 0) : sellOf(name);
		for (const r of byGive.get(name) || []) {
			// Only up the chain: a good handed over for a material is a
			// dead end for silver unless the market prices it.
			const up = worth(r.item, new Set([...seen, name]));
			best = Math.max(best, r.recv / r.giveN * up);
		}
		memo.set(name, best);
		return best;
	};
	return worth;
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
 * The run for silver.
 *
 * Level by level from the bottom the hold holds: every exchange that
 * takes a good aboard and pays the next level up is ranked by what it
 * adds -- what the goods received are worth at the end, less what the
 * goods handed over would have sold for -- per Parley spent, and taken
 * in that order for as many attempts as the island allows, the goods
 * aboard cover, the bar pays for and the hull will still move under.
 * Each island deals once a run, since it shows one exchange at a time.
 *
 * `hold` is { free, max }: the weight the hull carries without slowing
 * and the most it moves under at all. `parley` is { bar, perTrade }.
 * `land` lets the plan buy the land goods a [Level 1] exchange takes,
 * for a hold with nothing aboard; they weigh nothing here, which is
 * said on the screen.
 */
export function silverPlan({ stock = {}, barterData, hold, parley, npcById, start = null, price = () => 0, land = false } = {}) {
	const rows = exchanges(barterData);
	const worth = worthOf(rows, price);
	const held = goodsHeld(stock);
	// The rows by what they take, and by the level they pay: the
	// lookahead asks both questions for every candidate trade.
	const byGive = new Map();
	for (const r of rows) {
		if (!byGive.has(r.give)) byGive.set(r.give, []);
		byGive.get(r.give).push(r);
	}
	const takes = name => byGive.get(name) || [];
	const pays = new Map();
	for (const r of rows) {
		const lv = levelOf(r.item);
		if (lv === null) continue;
		if (!pays.has(lv)) pays.set(lv, []);
		pays.get(lv).push(r);
	}
	const startValue = [...held].reduce((a, [n, q]) => a + q * sellOf(n), 0);
	let weight = weightHeld(held);
	const notes = [];
	if (weight > hold.max) notes.push('over');
	const perTrade = parley.perTrade;
	let bar = parley.bar;
	const used = new Set();
	const trades = [];
	const bought = new Map();   // land goods the plan buys, by name

	// How many of a [Level 1] good the rung above could take this run:
	// what stops a hold with nothing aboard being filled with a land
	// good's worth of [Level 1]s that no island can trade on. Beyond
	// the floor the islands' own attempt caps do the same work.
	const absorb = name => takes(name).filter(r => levelOf(r.item) === 2 && !used.has(r.npcId))
		.reduce((a, r) => a + r.tries * r.giveN, 0);

	// The headroom the goods aboard above a level still need to climb:
	// each good walked up its best exchanges, as many as the islands'
	// attempts allow, adding what each rung puts on the scales. A
	// feeder trade lower down may only fill the hold up to what is
	// left once that is kept back -- a [Level 1] traded into [Level
	// 2]s that pay nothing this run must not take the thousand LT a
	// [Level 5] needs to become a [Level 6].
	const reserveAbove = lv => {
		let keep = 0;
		for (const [name, count] of held) {
			if (!(levelOf(name) > lv) || count <= 0) continue;
			let c = count, cur = name;
			for (;;) {
				const ups = takes(cur).filter(r => levelOf(r.item) === levelOf(cur) + 1 && !used.has(r.npcId));
				if (!ups.length) break;
				const best = ups.reduce((a, r) => (r.recv / r.giveN > a.recv / a.giveN ? r : a));
				const capacity = ups.reduce((a, r) => a + r.tries * r.giveN, 0);
				const climb = Math.min(c, capacity);
				if (climb <= 0) break;
				keep += climb * Math.max(0, best.recv / best.giveN * weightOf(best.item) - weightOf(cur));
				c = climb * best.recv / best.giveN;
				cur = best.item;
			}
		}
		return keep;
	};

	// One rung's allocation: the exchanges that take a good aboard at
	// this level (or, at the floor, a land good) and pay the level
	// above, best first, each for the attempts that fit.
	const rung = (lv, group) => {
		let made = 0;
		const cands = (pays.get(lv + 1) || []).filter(r => {
			if (used.has(r.npcId)) return false;
			const g = levelOf(r.give);
			if (lv === 0) return g === null && land;
			return g === lv && (held.get(r.give) || 0) >= r.giveN;
		}).map(r => {
			const gain = r.recv * worth(r.item) - r.giveN * sellOf(r.give);
			return { r, gain, per: gain / Math.max(1, perTrade) };
		}).filter(c => c.gain > 0).sort((a, b) => b.per - a.per || a.r.npc.localeCompare(b.r.npc));

		for (const { r, gain } of cands) {
			if (used.has(r.npcId)) continue;
			const ashore = levelOf(r.give) === null;
			const canGive = ashore ? Infinity : Math.floor((held.get(r.give) || 0) / r.giveN + 1e-9);
			let times = Math.min(r.tries, canGive, Math.floor(bar / perTrade));
			if (ashore) {
				const room = absorb(r.item) - (held.get(r.item) || 0);
				times = Math.min(times, Math.floor(room / r.recv + 1e-9));
			}
			// The hull's ceiling, less what the goods above still need: as
			// many attempts as fit under that.
			const dw = r.recv * weightOf(r.item) - r.giveN * weightOf(r.give);
			const cap = hold.max - reserveAbove(lv);
			if (dw > 0 && weight + times * dw > cap) times = Math.floor((cap - weight) / dw + 1e-9);
			if (times < 1) continue;
			if (ashore) bought.set(r.give, (bought.get(r.give) || 0) + times * r.giveN);
			else held.set(r.give, held.get(r.give) - times * r.giveN);
			held.set(r.item, (held.get(r.item) || 0) + times * r.recv);
			weight += times * dw;
			bar -= times * perTrade;
			used.add(r.npcId);
			trades.push({ ...r, times, parley: times * perTrade, gain: gain * times, weightAfter: weight, level: lv, group });
			made++;
		}
		return made;
	};

	// The goods already aboard are traded from the top down first --
	// a [Level 5] becoming a [Level 6] is forty million, and it claims
	// the hold's headroom before a [Level 1] feeder that pays nothing
	// yet does. Then upward sweeps let what those trades handed over
	// climb on, until a sweep adds nothing. The order the trades were
	// allocated in is the order they are sailed, so the hold checked
	// here is the hold at each stop.
	let group = 0;
	for (let pass = 0; pass < 7; pass++) {
		let made = 0;
		for (let lv = 6; lv >= 0; lv--) made += rung(lv, group++);
		if (!made) break;
	}

	// Sailing order. The natural one is rung by rung from the bottom --
	// the low goods are traded first because the high rungs eat what
	// they pay -- each rung's islands nearest-first from wherever the
	// last left the ship. That order can put the hold over its ceiling
	// somewhere the allocation order did not, and then the allocation
	// order is sailed instead: it was checked stop by stop.
	const order = key => {
		const out = [];
		let at = start;
		const keys = [...new Set(trades.map(key))].sort((a, b) => a - b);
		for (const k of keys) {
			const here = chain(trades.filter(t => key(t) === k), at, npcById);
			out.push(...here);
			if (here.length) at = npcById.get(here[here.length - 1].npcId) || at;
		}
		return out;
	};
	const weighed = list => {
		let w = weightHeld(goodsHeld(stock));
		return list.map(s => {
			w += s.times * (s.recv * weightOf(s.item) - s.giveN * weightOf(s.give));
			return { ...s, weightAfter: w };
		});
	};
	let stops = weighed(order(t => t.level));
	if (stops.some(s => s.weightAfter > hold.max + 1e-6)) stops = weighed(order(t => t.group));
	const peak = Math.max(weightHeld(goodsHeld(stock)), ...stops.map(s => s.weightAfter));

	const sold = [...held].filter(([n, q]) => q > 1e-9 && sellOf(n) > 0)
		.map(([n, q]) => ({ item: n, n: q, each: sellOf(n), total: q * sellOf(n) }))
		.sort((a, b) => b.total - a.total);
	const kept = [...held].filter(([n, q]) => q > 1e-9 && !sellOf(n)).map(([n, q]) => ({ item: n, n: q }));
	const endValue = sold.reduce((a, s) => a + s.total, 0);
	return {
		stops, sold, kept,
		bought: [...bought].map(([item, n]) => ({ item, n })),
		silver: endValue,
		gain: endValue - startValue,
		startValue,
		parleyUsed: parley.bar - bar,
		parleyBar: parley.bar,
		trades: stops.reduce((a, s) => a + s.times, 0),
		weightStart: weightHeld(goodsHeld(stock)),
		weightPeak: peak,
		hold,
		notes
	};
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
