// What a bartered material actually costs you in sea time.
//
// The To Get screen can already say "barter from 27 NPCs for a [Level 5]
// good". That is where every other tool stops, and it is the least
// useful half of the answer: it names the last step of a ladder that
// starts six trades earlier, on land, with a thousand Old Tree Bark.
//
// This works out the whole ladder. A Brilliant Pearl Shard is one
// [Level 5] good, which is one [Level 4], which is half a [Level 3]
// trade because that one pays two -- and so on down to the [Level 1]
// you buy from a villager. Fold that up and one Shard is about three
// trades, whoever you buy it from.
//
// Trades turn into days through the attempt cap, not through Parley.
// It is tempting to reach for Parley -- it is the resource with a bar
// on it -- but a refilled bar buys sixty-nine exchanges at the top rung
// and the list will never offer you that many, so it is never what
// stops you. The cap is: an exchange for a Brilliant Pearl Shard can be
// taken twice before the list has to be redrawn, and the list can be
// redrawn five times a day. Forty Shards is therefore twenty redraws,
// which is four days, and no amount of Parley shortens it.
//
// Every number here is read from a patch note or folded out of the
// barter data, and where the game has not published something it is
// left out rather than guessed at. Parley is priced for the top rung
// only, because that is the only rung Pearl Abyss has ever priced.
//
// What is deliberately not modelled: whether the route you want is on
// today's list. It is redrawn at random from a pool whose weights are
// not published anywhere. So every number here is a floor -- what the
// trip costs if the game offers you what you need -- and the UI says
// "at best" out loud rather than implying a precision it lacks.

/* ------------------------------------------------------------------ *
 * the game's numbers
 * ------------------------------------------------------------------ */

/**
 * Barter Refresh, as the menu charges for it.
 *
 * These moved on 2024-04-03 -- the cooldown halved and Ship Material
 * Refresh went from a flat 40 to 10-then-30 -- and most guides still
 * print the old set. Checked against the in-game menu.
 *
 * The point pool is not the constraint it looks like: 20+40 on trade
 * items plus 10+30 on ship materials is exactly 100, and with a Value
 * Pack 20+40+50 plus 10+30 is exactly 150. The daily allowance pays for
 * the daily allowance of presses and nothing over. What the points
 * really buy is the instant refreshes, which are the only way to press
 * more often than once every two hours.
 */
export const REFRESH = {
	points: 100,
	pointsWithValuePack: 150,
	refillHourUTC: 6,
	cooldownHours: 2,

	// Costs escalate with each press of the day, hence the arrays.
	tradeItem: { costs: [20, 40, 50], perDay: 2, perDayWithValuePack: 3, instantExtra: 30 },
	shipMaterial: { costs: [10, 30], perDay: 2, instantExtra: 30 },

	// Parley spent to bring the two-hour cooldown forward, one press at
	// a time. There is no way to spend less than a whole press.
	reduceCooldown: { parleyPerPress: 50000, minutesPerPress: 5 }
};

/**
 * Parley, and the flat rates that replaced the old sliding scale.
 *
 * The 2026-04-16 patch standardised what had been a spread from 29,430
 * to 58,180: "we have significantly lowered the Parley required for
 * existing trades and standardized the costs across both trade goods
 * and Crow Coins."
 *
 * Read the scope carefully, because it is narrower than it looks. The
 * patch prices exactly two things -- a Crow Coin exchange, and the
 * [Great Ocean] goods that buy ship materials -- and says it adjusted
 * "certain Barter exchanges". What a [Level 2] costs was not published
 * then and has not been since, so nothing here is multiplied up the
 * ladder. These are the top rung's price and are quoted as such.
 */
export const PARLEY = {
	max: 1000000,
	perGreatOceanTrade: 14286,
	perCrowCoinTrade: 21650,
	// Value Pack; a ship's own Parley reduction stacks another 10% on
	// top since 2025-03-06, which the Barter Information window shows
	// and this does not try to guess at.
	valuePackDiscount: 0.1,
	voucher: 250000
};

/**
 * Total completed barters, and what each threshold opens.
 *
 * Rebuilt from the 2026-05-21 patch, which moved every number: three
 * routes are now open from a standing start, the count needed for the
 * last one was halved, and the thresholds were rounded off -- "Adjusted
 * the total barter counts required for trade route expansion to more
 * intuitive values. Example: 2,551 barters -> 2,500 barters."
 *
 * The Brilliant pair is the entry that matters here and it moved too:
 * it is 1,500, at Invernen and Marka. Every guide still says 1,000,
 * which was right until that patch, and the 3,000 and 5,000 figures in
 * circulation are the two thresholds either side of it on this same
 * table -- neither has anything to do with Brilliants.
 *
 * Only what the patch itself lists is here. The old per-level gates
 * that used to sit at 10, 30 and 70 are gone from it: those counts now
 * open Crow Coin routes, and nothing since has restated a [Level 2] or
 * [Level 4] threshold, so none is claimed.
 */
export const ROUTE_UNLOCKS = [
	{ barters: 0, routes: 3 },
	{ barters: 10, routes: 4, opens: 'Kashuma Island — Crow Coin' },
	{ barters: 30, routes: 5, opens: 'Derko Island — Crow Coin' },
	{ barters: 70, routes: 6, opens: "Crow's Nest — Crow Coin" },
	{ barters: 150, routes: 7, opens: "Margoria's Star — Shipwrecked Haran's Cargo Ship" },
	{ barters: 300, routes: 8, opens: "Margoria's Star — Unfinished Adrift Vessel" },
	{ barters: 600, routes: 9, opens: "Margoria's Star — Lantinia's Combat Raft" },
	{ barters: 1200, routes: 10, opens: "Margoria's Star — Pakio's Combat Raft" },
	{ barters: 1500, opens: 'Brilliant Rock Salt Ingot and Brilliant Pearl Shard' },
	{ barters: 2500, routes: 11, opens: "Margoria's Star — Crow Merchants' Vessel" },
	{ barters: 3000, opens: "Margoria's Star — Wandering Merchant's Ship" },
	{ barters: 5000, routes: 12, opens: "Margoria's Star — Shipwrecked Rickun's Ship" },
	{ barters: 10000, opens: "Margoria's Star — Shipwrecked Cox Pirate Ship" },
	{ barters: 20000, opens: "Margoria's Star — Shipwrecked Marine Vessel" }
];

/**
 * Barter levels, in order, and how many steps each tier holds.
 *
 * Master runs to 30 and Guru to 100, which is why this is a table rather
 * than a multiplication.
 */
export const BARTER_TIERS = [
	['Beginner', 10], ['Apprentice', 10], ['Skilled', 10],
	['Professional', 10], ['Artisan', 10], ['Master', 30], ['Guru', 100]
];

/**
 * What each barter level takes off the Parley an exchange costs, as a
 * percentage.
 *
 * Guides will tell you bartering has no Mastery benefit. The game
 * disagrees and publishes the whole curve, one row per level: it opens
 * at nothing, is already worth 8% by the end of Beginner, and then
 * flattens hard -- the last forty levels are worth less than the first
 * two. From Guru 50 it stops entirely at 25.27%, so the table ends there
 * and everything above reads the last value.
 *
 * This stacks with the Value Pack's 10% and, since 2025-03-06, a ship's
 * own 10% while you are aboard.
 */
const PARLEY_DISCOUNT = [
	0, 2.7329, 3.8568, 4.7136, 5.4313, 6.0595, 6.6238, 7.1392, 7.6157, 8.0603,
	8.4779, 8.8723, 9.2466, 9.603, 9.9435, 10.2697, 10.583, 10.8843, 11.1747, 11.455,
	11.726, 11.9882, 12.2423, 12.4887, 12.7279, 12.9602, 13.1861, 13.4059, 13.6198, 13.8281,
	14.0312, 14.2291, 14.4222, 14.6105, 14.7944, 14.9739, 15.1492, 15.3205, 15.4878, 15.6514,
	15.8113, 15.9677, 16.1206, 16.2701, 16.4164, 16.5595, 16.6995, 16.8365, 16.9705, 17.1017,
	17.23, 17.3556, 17.4785, 17.5988, 17.7165, 17.8316, 17.9443, 18.0546, 18.1624, 18.2679,
	18.3711, 18.4721, 18.5708, 18.67, 18.77, 18.87, 18.97, 19.07, 19.17, 19.27,
	19.37, 19.47, 19.57, 19.67, 19.77, 19.87, 19.97, 20.07, 20.17, 20.27,
	20.37, 20.47, 20.57, 20.67, 20.77, 20.87, 20.97, 21.07, 21.17, 21.27,
	21.37, 21.47, 21.57, 21.67, 21.77, 21.87, 21.97, 22.07, 22.17, 22.27,
	22.37, 22.47, 22.57, 22.67, 22.77, 22.87, 22.97, 23.07, 23.17, 23.27,
	23.37, 23.47, 23.57, 23.67, 23.77, 23.87, 23.97, 24.07, 24.17, 24.27,
	24.37, 24.47, 24.57, 24.67, 24.77, 24.87, 24.97, 25.07, 25.17, 25.27
];

/** Every level as a flat list, so a picker can just render it. */
export function barterLevels() {
	const out = [];
	for (const [tier, steps] of BARTER_TIERS) {
		for (let i = 1; i <= steps; i++) out.push(`${tier} ${i}`);
	}
	return out;
}

/** A level name to its place in the table. Beginner 1 is 0. */
export function levelIndex(name) {
	if (!name) return 0;
	const at = barterLevels().indexOf(name);
	return at < 0 ? 0 : at;
}

/** What a barter level takes off an exchange, as a fraction. */
export function levelDiscount(name) {
	const i = Math.min(levelIndex(name), PARLEY_DISCOUNT.length - 1);
	return PARLEY_DISCOUNT[i] / 100;
}

/* ------------------------------------------------------------------ *
 * reading the dataset
 * ------------------------------------------------------------------ */

// The dataset itself is js/all_barter.json: every barter that yields a
// ship material, and the trade-good ladder that leads to one, scraped
// from BDOCodex. It is JSON rather than a module, so its provenance
// lives here, beside the code that reads it.
//
// The 1:1 exchanges are gone from it: the 2026-04-16 patch raised the
// minimum on the two rungs that had one -- "Adjusted the minimum
// exchange amount for level 1 -> level 2 and level 2 -> level 3
// barters. Before: x1-3 After: x2-3" -- so every [Level 2] and
// [Level 3] payout reads 2-3. The two Tidal Black Stone routes that pay
// 1-3 are untouched: they hand over a ship material, not a trade good,
// and the patch did not name them.

const LEVEL = /^\[Level (\d)\]/;

/** The tier of a sea trade good, or null for a ship material. */
export function levelOf(name) {
	const m = LEVEL.exec(name || '');
	return m ? Number(m[1]) : null;
}

/**
 * The middle of a quantity as the dataset writes it: "1", "1-3", "40-60".
 *
 * Averaging a range is the only defensible reading -- the game rolls
 * within it and a plan made on either end is a plan made on luck. The
 * fractions this produces are kept all the way through the fold and
 * only rounded when a whole number is handed to a person.
 */
export function amount(q) {
	if (typeof q === 'number') return q;
	const parts = String(q ?? '1').split('-').map(Number).filter(n => Number.isFinite(n));
	if (!parts.length) return 1;
	return parts.reduce((a, b) => a + b, 0) / parts.length;
}

/**
 * The best exchange on offer for one item: the one that pays the most
 * per trade.
 *
 * "Best" is per trade rather than per Parley because after the April
 * 2026 standardisation those rank the same way, and per trade is the
 * number the rest of this file is counting in.
 */
export function bestExchange(item, barterData) {
	const entry = (barterData || []).find(b => b.name === item);
	if (!entry || !entry.sources || !entry.sources.length) return null;

	let best = null;
	for (const s of entry.sources) {
		if (!s.give) continue;
		const received = amount(s.quantity_received);
		const given = amount(s.give.quantity);
		if (!(received > 0) || !(given > 0)) continue;
		const rate = received / given;
		if (!best || rate > best.rate) {
			best = {
				rate, received, given,
				// The range as the game writes it. The average is what the
				// arithmetic needs; "2-3" is what a person should be shown,
				// because a plan quoted on 2.5 of something reads as a
				// precision the game does not offer.
				receivedText: String(s.quantity_received),
				give: s.give.name,
				npc: s.npc_name,
				// 0 is the dataset's "not stated", not "none allowed".
				attempts: s.attempts_available > 0 ? s.attempts_available : null
			};
		}
	}
	return best;
}

/* ------------------------------------------------------------------ *
 * folding the ladder
 * ------------------------------------------------------------------ */

/**
 * Every trade behind one unit of `item`, from the top of the ladder down
 * to whatever the bottom rung is bought with.
 *
 * Recursion is on the item that has to be handed over. A [Level 5] good
 * is bought with a [Level 4], which is bought with a [Level 3] -- and
 * because that rung pays two at a time, only half a trade of it is
 * charged to us. Those halves are why the totals come out well under the
 * six trades the ladder's height suggests.
 *
 * The walk stops at a [Level 1] good, whose "give" is a land item the
 * barter dataset does not describe as a barter and which this returns as
 * `seed` for the shopping list to price.
 *
 * `seen` guards the recursion. The dataset is a ladder, not a graph, but
 * a bad scrape could close a loop and this should not hang on it.
 */
export function ladder(item, barterData, seen = new Set()) {
	if (seen.has(item)) return null;

	const best = bestExchange(item, barterData);
	if (!best) return null;

	// One press of this exchange eats `given` and pays `received`, so a
	// single unit of this item is a fraction of a trade and a fraction of
	// what goes in. Keeping those two apart is the whole trick: a rung
	// that pays two halves the trades AND halves everything below it.
	const tradesHere = 1 / best.received;
	const givePerUnit = best.given / best.received;

	const step = {
		item,
		give: best.give,
		received: best.received,
		receivedText: best.receivedText,
		given: best.given,
		attempts: best.attempts,
		trades: tradesHere,             // this rung only
		givePerUnit,
		npcs: countNpcs(item, barterData),
		from: null,
		seed: null
	};

	// A [Level 1] good is bought with land goods, which the dataset does
	// not carry a barter for -- that is the floor of the ladder.
	if (levelOf(item) === 1) {
		step.seed = { item: best.give, qty: givePerUnit };
		step.totalTrades = tradesHere;
		return step;
	}

	const below = ladder(best.give, barterData, new Set([...seen, item]));
	step.from = below;
	step.totalTrades = tradesHere + (below ? below.totalTrades * givePerUnit : 0);
	step.seed = below && below.seed
		? { item: below.seed.item, qty: below.seed.qty * givePerUnit }
		: null;
	return step;
}

function countNpcs(item, barterData) {
	const entry = (barterData || []).find(b => b.name === item);
	if (!entry) return 0;
	return new Set(entry.sources.map(s => s.npc_name)).size;
}

/** The ladder as a flat list, top rung first. */
export function rungs(step) {
	const out = [];
	for (let s = step; s; s = s.from) out.push(s);
	return out;
}

/* ------------------------------------------------------------------ *
 * a day of bartering
 * ------------------------------------------------------------------ */

/**
 * How much sea a day holds.
 *
 * A day is counted in refreshes, not in trades. The list you wake up
 * with is one, and every press of Barter Refresh is another, so the
 * daily caps are the whole story: two trade-item presses, three with a
 * Value Pack, and two ship-material ones.
 *
 * Parley rides along as information rather than as a limit. It refills
 * on every press, and a full bar buys sixty-nine exchanges at the top
 * rung -- far more of them than the list will ever offer in one draw --
 * so it has never been what stops anybody. Quoting it as a ceiling
 * would also mean pricing rungs the patch notes have never priced.
 *
 * Instant refreshes are deliberately left out. They are bought with the
 * same point pool the ordinary presses spend, so a player who leans on
 * them is trading tomorrow's presses for today's, and a forecast that
 * counted them would quietly promise a pace nobody can hold.
 */
export function dailyCapacity({ valuePack = false, vouchers = 0, level = null } = {}) {
	const refreshes = 1
		+ (valuePack ? REFRESH.tradeItem.perDayWithValuePack : REFRESH.tradeItem.perDay)
		+ REFRESH.shipMaterial.perDay;

	const perTrade = parleyPerTrade({ valuePack, level });
	const bar = PARLEY.max + vouchers * PARLEY.voucher;

	return {
		refreshes,
		vouchers,
		parley: refreshes * bar,
		perTrade,
		// Top-rung exchanges one refill covers, vouchers included. A
		// voucher is a quarter of a bar and carries its own two-hour
		// cooldown, so this is what a patient player can reach rather
		// than what fits in one sitting.
		tradesPerBar: Math.floor(bar / perTrade)
	};
}

/**
 * What one Great Ocean exchange costs you, specifically.
 *
 * The two reductions multiply rather than add -- a Guru 50 with a Value
 * Pack pays 0.7473 x 0.9, not 1 - 0.3527 -- which is the difference
 * between 9,600 and 9,250 and worth getting right when the answer is
 * "how many exchanges does a bar cover".
 */
export function parleyPerTrade({ valuePack = false, crowCoin = false, level = null } = {}) {
	const base = crowCoin ? PARLEY.perCrowCoinTrade : PARLEY.perGreatOceanTrade;
	const fromLevel = 1 - levelDiscount(level);
	const fromPack = valuePack ? 1 - PARLEY.valuePackDiscount : 1;
	return Math.round(base * fromLevel * fromPack);
}

/* ------------------------------------------------------------------ *
 * the forecast
 * ------------------------------------------------------------------ */

/**
 * The rung that runs out first, and how many refreshes it needs.
 *
 * Parley is not what stops you getting forty Brilliant Pearl Shards. An
 * exchange for one is capped at two attempts, so the list has to be
 * redrawn twenty times whatever your Parley looks like -- and that is
 * days, not hours. The rungs below are capped at ten and are never the
 * problem, which is exactly why the answer is a maximum over rungs
 * rather than a sum: one bottleneck sets the pace and the rest keep up.
 *
 * The assumption, and it is a real one: that the exchange turns up on
 * every refresh. It will not -- the list is drawn at random from a pool
 * whose weights the game does not publish -- so this is the best case
 * and the UI says so. A rung the dataset gives no attempt cap for is
 * skipped rather than guessed at.
 */
export function bottleneck(top, qty) {
	let worst = null;
	let needed = qty;

	for (let r = top; r; r = r.from) {
		if (r.attempts) {
			const perRefresh = r.attempts * r.received;
			const refreshes = needed / perRefresh;
			if (!worst || refreshes > worst.refreshes) {
				worst = { item: r.item, needed, perRefresh, refreshes, attempts: r.attempts };
			}
		}
		needed *= r.givePerUnit;
	}
	return worst;
}

/** The unlock this item is waiting on, or null if nothing gates it. */
export function gateFor(item, barterCount) {
	let needed = null;

	// The Brilliant pair is the only threshold the current patch notes
	// still state, so it is the only one claimed. The per-level gates
	// that guides print alongside it were rewritten on 2026-05-21 and
	// never restated; inventing replacements would lock routes that are
	// open.
	if (/^Brilliant /.test(item)) needed = 1500;

	if (needed === null || barterCount >= needed) return null;
	const row = ROUTE_UNLOCKS.find(r => r.barters === needed);
	return { barters: needed, short: needed - barterCount, opens: row && row.opens };
}

/**
 * What getting `qty` of `item` by barter is going to take.
 *
 * The shape of the answer is deliberate: trades first, because that is
 * the honest unit; days second, because that is the question; and the
 * ladder alongside, because a player who sees that two thirds of the
 * cost sits on the [Level 4] rung can go and buy that rung instead.
 *
 * Returns null for anything the barter dataset has no exchange for --
 * the caller already knows how to say "not bartered".
 */
export function forecast(item, qty, barterData, opts = {}) {
	const { barterCount = 0, valuePack = false, vouchers = 0, level = null } = opts;

	const top = ladder(item, barterData);
	if (!top) return null;

	const day = dailyCapacity({ valuePack, vouchers, level });
	const trades = top.totalTrades * qty;

	// The trip is paced by the rung that runs out first. Parley is not
	// that rung and is not modelled as one -- see dailyCapacity -- so it
	// is priced only where a patch note prices it: the top exchange.
	const limit = bottleneck(top, qty);
	const days = limit ? limit.refreshes / day.refreshes : 0;

	// Every rung is checked, not just the one asked for: a ladder can
	// walk through something the player cannot reach yet.
	const gate = rungs(top)
		.map(r => gateFor(r.item, barterCount))
		.filter(Boolean)
		.sort((a, b) => b.barters - a.barters)[0] || null;

	return {
		item,
		qty,
		trades,
		days,
		limit,
		perUnit: top.totalTrades,
		// What the top rung alone costs in Parley, which is the only
		// rung the game has published a price for.
		topParley: qty * (1 / top.received) * day.perTrade,
		seed: top.seed ? { item: top.seed.item, qty: top.seed.qty * qty } : null,
		rungs: rungs(top),
		capacity: day,
		gate
	};
}

/**
 * A forecast as one line of English.
 *
 * The trade count leads because it is the part that is nearly exact; the
 * days follow because they are the question, and "at best" is not a
 * hedge but the literal reading -- it assumes the list offers the route
 * every single refresh, which it will not.
 */
export function summarise(f) {
	if (!f) return '';
	if (f.gate) {
		return `locked — ${fmt(f.gate.short)} more barters to reach ${fmt(f.gate.barters)}`;
	}

	const trades = `${fmt(Math.ceil(f.trades))} ${Math.ceil(f.trades) === 1 ? 'trade' : 'trades'}`;
	if (f.days < 0.5) return `${trades} — one sitting`;

	const days = Math.ceil(f.days);
	if (days <= 1) return `${trades} — a day's sailing at best`;
	return `${trades} — ${fmt(days)} days at best`;
}

/** Why the forecast lands where it does, for the row that wants detail. */
export function explain(f) {
	if (!f || f.gate || !f.limit) return '';

	// Naming the rung is only worth the words when it is not the thing
	// you asked for -- being told that Brilliant Pearl Shards are
	// limited by Brilliant Pearl Shards teaches nobody anything.
	const where = f.limit.item === f.item ? '' : ` on ${f.limit.item}`;
	return `${fmt(f.limit.perRefresh)} a refresh${where}, ${f.capacity.refreshes} refreshes a day`;
}

function fmt(n) {
	return Math.round(n).toLocaleString('en-GB');
}
