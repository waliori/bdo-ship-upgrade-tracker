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
// The ladder no longer stops at [Level 5]. Since the coast opened for
// barter the chain runs two rungs higher: a [Level 5] buys a [Level 6]
// at six shore barterers -- Hakoven, Arehaza, the two O'dyllita ports
// and the two in the Land of Morning Light -- and a [Level 6] buys a
// [Level 7] at six more, from the Olvia coast round to Sanctuary. Both
// pay one for one, so each is a whole trade dearer than the rung under
// it. A [Level 7] is the top of the ladder and the table has no use for
// it: nothing in it is bought with one. Whatever they are for is sold
// or handed in somewhere the barter window does not describe, so they
// fold as the dearest thing you can barter for and are never offered
// as the way to anything else.
//
// Trades turn into days through the attempt cap, not through Parley.
// It is tempting to reach for Parley -- it is the resource with a bar
// on it -- but a refilled bar buys sixty-nine exchanges at the top rung
// and the list will never offer you that many, so it is never what
// stops you. The cap is: an exchange for a Brilliant Pearl Shard can be
// taken twice before the list has to be redrawn, and the ship-material
// list -- its own list, with its own free draw and its own presses --
// can be redrawn three times a day. Forty Shards is therefore twenty
// redraws, which is a week, and no amount of Parley shortens it.
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

import { oddsFor, oddsText } from './barter-odds.js';
import { npcs } from './barter_npcs.js';

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

	// Parley spent to bring the two-hour cooldown forward. The dialog
	// prices it by the minute -- "10,000 Parley reduces 1 min. Up to
	// 50,000 Parley can be used at once" -- so one press buys at most
	// five minutes, but any smaller number of minutes is a valid press.
	reduceCooldown: { parleyPerMinute: 10000, maxParleyPerPress: 50000 }
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
	// The ship-material list has its own, far dearer flat rate, in no
	// patch note we have. Derived 2026-08-29 from a live Barter
	// Information window: every material row read 45,384 at Artisan 3
	// (-16.12%) with a Value Pack (-10%), and only a base of 61,430
	// floors to that under the additive discount -- reassuringly round.
	perMaterialTrade: 61430,
	// Value Pack; a crewed ship's own Parley reduction stacks another
	// 10% on top since 2025-03-06, which the Barter Information window
	// shows -- modelled as the opt-in `crew` flag, off by default.
	valuePackDiscount: 0.1,
	crewDiscount: 0.1,
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

// The coastal barterers who deal the [Level 6] and [Level 7] goods are
// not on this table, and deliberately: no patch note in hand states a
// barter count that opens them, and the 2026-08-29 table lists their
// exchanges without one. Until a threshold is published they are
// treated as open -- guessing a gate would grey out a route that a
// player can sail to today.

/**
 * Which barterer each threshold opens: npc id -> the count that opens
 * it.
 *
 * The join is the patch note's own words. `opens` names a place --
 * "Margoria's Star — Shipwrecked Haran's Cargo Ship", "Kashuma Island
 * — Crow Coin" -- and barter_npcs.js says which barterer stands there,
 * so the two halves either side of the dash are matched against `at`
 * and whichever hits is the barterer that opens. Nothing is guessed:
 * a row naming no place (the Brilliant pair) matches nothing and gates
 * nobody, and every barterer the table never names is open from the
 * first day, which is the great majority of the ninety-one.
 *
 * Built on first use rather than at import, so this file can be loaded
 * by anything without the chart's data being walked for nothing.
 */
let gateMemo = null;
export function npcGates() {
	if (gateMemo) return gateMemo;
	const where = new Map();
	for (const n of npcs) {
		if (!where.has(n.at)) where.set(n.at, []);
		where.get(n.at).push(n.id);
	}
	gateMemo = new Map();
	for (const row of ROUTE_UNLOCKS) {
		if (!row.opens) continue;
		for (const part of row.opens.split('\u2014').map(x => x.trim())) {
			for (const id of where.get(part) || []) {
				// The lowest threshold that names a barterer is the one that
				// opens it; a later row naming it again only adds a route.
				if (!gateMemo.has(id) || gateMemo.get(id) > row.barters) gateMemo.set(id, row.barters);
			}
		}
	}
	return gateMemo;
}

/** The count that opens this barterer, or 0 if nothing gates it. */
export const npcGate = npcId => npcGates().get(npcId) || 0;

/**
 * Whether a barterer is open to someone who has made this many.
 *
 * Nought is a real answer, not a missing one: a sailor who has never
 * bartered has the three routes the game starts them with and no more,
 * which is exactly what the table says. So the gates apply from the
 * first barter, and what they shut is shown greyed with the count
 * beside it rather than hidden -- the shell's bar says whose count is
 * being read, and asks for it when it is nought.
 */
export const npcOpen = (npcId, barterCount = 0) => npcGate(npcId) <= Number(barterCount || 0);

/** A threshold as the gate the screens print. */
function gateAt(barters, barterCount) {
	const row = ROUTE_UNLOCKS.find(r => r.barters === barters);
	return { barters, short: barters - barterCount, opens: row && row.opens };
}

/**
 * The table as this player can actually sail it: every exchange at a
 * barterer they have not opened yet taken out.
 *
 * This is the honest input to every plan. A run laid out through
 * Shipwrecked Rickun's Ship is not a run a sailor at 480 barters can
 * make, and a forecast that folds through it is quoting a route that
 * is not there -- the whole reason this exists. What the gate hides,
 * `gateOfItem` explains, so nothing vanishes without a reason beside
 * it.
 *
 * Memoised per table and count, and the very common case -- a player
 * past every threshold the table names -- gets the table back
 * unchanged, identity and all, so nothing downstream that keys a memo
 * on it has to rebuild.
 */
const openMemo = new WeakMap();
export function openTable(barterData, barterCount = 0) {
	if (!barterData) return barterData;
	let byCount = openMemo.get(barterData);
	if (!byCount) openMemo.set(barterData, byCount = new Map());
	if (byCount.has(barterCount)) return byCount.get(barterCount);

	const shut = id => npcGate(id) > barterCount;
	const any = barterData.some(e => (e.sources || []).some(s => shut(s.npc_id)));
	const out = !any ? barterData : barterData
		.map(e => ({ ...e, sources: (e.sources || []).filter(s => !shut(s.npc_id)) }))
		.filter(e => e.sources.length);
	byCount.set(barterCount, out);
	return out;
}

/**
 * The barterers on a table this player cannot reach, each with what it
 * waits on: `{ npcId, npc, barters, opens }`, soonest first. The Barter
 * tab says this out loud rather than quietly drawing a shorter board.
 */
export function shutOut(barterData, barterCount = 0) {
	const seen = new Map();
	for (const e of barterData || []) {
		for (const s of e.sources || []) {
			const g = npcGate(s.npc_id);
			if (g <= barterCount || seen.has(s.npc_id)) continue;
			seen.set(s.npc_id, { npcId: s.npc_id, npc: s.npc_name, ...gateAt(g, barterCount) });
		}
	}
	return [...seen.values()].sort((a, b) => a.barters - b.barters);
}

/**
 * The unlock an item waits on because every island that deals it is
 * shut, or null if anywhere open deals it.
 *
 * The cheapest of the thresholds, not the first: Oquilla's Flower is
 * dealt at Pakio (1,200) and at Donalia (20,000) as well as at six open
 * islands, and what a sailor wants told is the next door, not the last.
 */
export function gateOfItem(item, barterData, barterCount = 0) {
	const entry = (barterData || []).find(b => b.name === item);
	if (!entry || !entry.sources || !entry.sources.length) return null;
	let needed = null;
	for (const s of entry.sources) {
		const g = npcGate(s.npc_id);
		if (g <= barterCount) return null;
		if (needed === null || g < needed) needed = g;
	}
	return needed === null ? null : gateAt(needed, barterCount);
}

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
 *
 * Checked 2026-09-07 against GrumpyG's Parley chart
 * (grumpygreen.cricket/bdo-barter-sailing), which lists the same value
 * at every level named, and against a live Barter window at Artisan 4,
 * which read -16.27%: the table's 16.2701.
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
// from BDOCodex's barter table on 2026-08-29 -- 4,397 exchanges at 91
// barterers, regrouped under the 158 things they hand over (tools/
// build-barter.mjs does the regrouping). It is JSON rather than a
// module, so its provenance lives here, beside the code that reads it.
//
// That pull replaced one from 2025-09-01 that knew 81 barterers and
// stopped at [Level 5]. The ten it added are the shore: Kami at Crow's
// Nest, five ports that turn a [Level 5] into a [Level 6] and four --
// with Chikao and Priko, who already dealt the chain -- that turn a
// [Level 6] into a [Level 7]. Between them 818 existing exchanges also
// moved their quantities, which is why nothing below is hand-copied
// from the old file.
//
// The 1:1 exchanges are gone from the bottom of the chain: the
// 2026-04-16 patch raised the minimum on the two rungs that had one --
// "Adjusted the minimum exchange amount for level 1 -> level 2 and
// level 2 -> level 3 barters. Before: x1-3 After: x2-3" -- so every
// [Level 2] and [Level 3] payout reads 2-3. The Tidal Black Stone
// routes that pay 1-3 are untouched: they hand over a ship material,
// not a trade good, and the patch did not name them.
//
// Not every hand-over is a trade good. The Margoria drifters and the
// shore barterers take Gold Bar 100G for a handful of things -- Tidal
// Black Stone, a single Crow Coin -- and the ladder treats a give the
// table has no exchange for the way it treats the [Level 1] floor: as
// something bought on land, handed back as the seed.

const LEVEL = /^\[Level (\d)\]/;

/** The top rung of the trade chain, as the table stands. */
export const TOP_LEVEL = 7;

/** The tier of a sea trade good, or null for a ship material. */
export function levelOf(name) {
	const m = LEVEL.exec(name || '');
	return m ? Number(m[1]) : null;
}

/**
 * Whether this is the end of the ladder: a [Level 7] good, which the
 * table hands over at six coastal barterers and takes back nowhere.
 * Its sink -- sale, hand-in, whatever the shore does with it -- is
 * outside the barter window and so outside this file. A terminal good
 * still folds (it is one [Level 6] and a trade) but is never a rung on
 * the way to anything, and the forecast never offers it as one.
 */
export function isTerminal(name) {
	return levelOf(name) === TOP_LEVEL;
}

/**
 * Which of the game's exchanges this is, and so which flat rate and
 * which refresh list it lives on: [Level N] goods are the trade chain
 * -- all seven rungs, the coastal [Level 6] and [Level 7] with the
 * rest -- Crow Coin is its own priced exchange dealt on the same
 * trade-item list, and everything else is a ship material. The same
 * split the map's barterKind makes, kept here so the forecast does not
 * need the map.
 */
export function exchangeKind(item) {
	if (item === 'Crow Coin') return 'coin';
	return levelOf(item) === null ? 'material' : 'trade';
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

	// How many islands deal each hand-over, for breaking ties. The rate
	// says what a trade pays; on a dead heat, the exchange with the
	// higher attempt cap needs fewer redraws, and the one more islands
	// offer is likelier to be on somebody's list today. Before this,
	// whichever the scrape happened to list first won.
	const offeredBy = new Map();
	for (const s of entry.sources) {
		if (!s.give) continue;
		if (!offeredBy.has(s.give.name)) offeredBy.set(s.give.name, new Set());
		offeredBy.get(s.give.name).add(s.npc_name);
	}

	let best = null;
	let bestSpread = 0;
	for (const s of entry.sources) {
		if (!s.give) continue;
		const received = amount(s.quantity_received);
		const given = amount(s.give.quantity);
		if (!(received > 0) || !(given > 0)) continue;
		const rate = received / given;
		const attempts = s.attempts_available > 0 ? s.attempts_available : null;
		const spread = offeredBy.get(s.give.name).size;
		const wins = !best
			|| rate > best.rate
			|| (rate === best.rate && ((attempts || 0) > (best.attempts || 0)
				|| ((attempts || 0) === (best.attempts || 0) && spread > bestSpread)));
		if (wins) {
			bestSpread = spread;
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
				attempts
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
 * `seed` for the shopping list to price. It stops the same way at any
 * other give the table has no exchange for -- the Gold Bar 100G a few
 * barterers take -- since a thing nobody barters for is, by the only
 * definition this file has, bought on land.
 *
 * At the top, the ladder now climbs to [Level 7]: a [Level 6] good is
 * one [Level 5] and a trade, a [Level 7] one [Level 6] and a trade, so
 * a ship material bought with a [Level 6] would fold through seven
 * rungs the same way a Brilliant folds through six. [Level 7] is never
 * a rung: no exchange takes one, so no walk ever recurses onto one.
 *
 * `seen` guards the recursion. The dataset is a ladder, not a graph, but
 * a bad scrape could close a loop and this should not hang on it.
 */
export function ladder(item, barterData, seen = new Set()) {
	if (seen.has(item)) return null;

	const best = bestExchange(item, barterData);
	if (!best) return null;

	// The floor: a [Level 1] good, or anything else paid for with
	// something the table never hands over.
	const floor = levelOf(item) === 1 || !bestExchange(best.give, barterData);

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
	if (floor) {
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

/**
 * What a life of bartering adds to every exchange.
 *
 * Read out of the client's own `variedtradecount.bss` on 2026-09-14
 * (`PABR`, six records of three u64s: the first count in the band, the
 * last, and the percent). It is the one thing the total barter count
 * does besides opening routes, and the app had no idea it existed --
 * every coin figure it has ever shown a sailor past 2,500 barters was a
 * third short.
 *
 * The bands are wide and the last one is open: 2,501 barters is the end
 * of the ladder, and the jump there is ten points rather than five.
 */
export const TRADE_COUNT_BONUS = [
	{ from: 0, to: 500, pct: 0 },
	{ from: 501, to: 1000, pct: 5 },
	{ from: 1001, to: 1500, pct: 10 },
	{ from: 1501, to: 2000, pct: 15 },
	{ from: 2001, to: 2500, pct: 20 },
	{ from: 2501, to: Infinity, pct: 30 }
];

/**
 * The percent a sailor's barter count adds, and the band it sits in.
 *
 * A count nobody has stated is nought here, not a guess: showing a
 * sailor who has not said what they have bartered a number a third
 * larger than the exchange window promises would be a lie in the
 * hopeful direction.
 */
export function countBonus(barterCount) {
	const n = Number.isFinite(barterCount) && barterCount > 0 ? barterCount : 0;
	const band = TRADE_COUNT_BONUS.find(b => n >= b.from && n <= b.to) || TRADE_COUNT_BONUS[0];
	const next = TRADE_COUNT_BONUS.find(b => b.from > n) || null;
	return { pct: band.pct, band, next, count: n };
}

/** `n` with the barter-count bonus on it, as the purse will see it. */
export const withBonus = (n, pct) => Math.floor(n * (1 + pct / 100));

/**
 * What a trade good is worth on its own -- what it weighs, and what a
 * barterer pays for it in silver. Read off the goods' item pages on
 * 2026-08-29: the first two levels cannot be sold at all, and the two
 * new levels are the heavy, expensive end. This is the other side of
 * every exchange: a [Level 5] handed over for a ship material is ten
 * million silver not taken.
 */
export const GOODS = {
	1: { weight: 100, sell: 0 },
	2: { weight: 400, sell: 0 },
	3: { weight: 900, sell: 1000000 },
	4: { weight: 1000, sell: 2000000 },
	5: { weight: 1000, sell: 10000000 },
	6: { weight: 2000, sell: 50000000 },
	7: { weight: 2000, sell: 100000000 }
};

/**
 * What the top rung of a ladder hands over for `qty` of the item: how
 * many of which good, what they weigh, and what selling them instead
 * would have paid. Null when the exchange is paid in something that
 * is not a levelled good.
 */
export function handedOver(top, qty = 1) {
	if (!top) return null;
	const level = levelOf(top.give);
	if (!level || !GOODS[level]) return null;
	const count = Math.ceil(top.givePerUnit * qty);
	return {
		give: top.give,
		level,
		count,
		weight: count * GOODS[level].weight,
		worth: count * GOODS[level].sell
	};
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
 * A day is counted in refreshes, not in trades -- and per list, because
 * the game runs two. The trade-good list and the ship-material list
 * refresh independently: each wakes up with its own free draw, and each
 * press of Barter Refresh re-rolls one of them, never both. So the pace
 * is two numbers -- three trade draws a day (four with a Value Pack)
 * and three material draws -- and neither list can lend the other a
 * press. The point pool the presses spend is shared, but it does not
 * force a split worth modelling: the daily allowance pays for both
 * lists' full run of presses (the identity noted on REFRESH), so each
 * list is quoted at its whole allowance.
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
export function dailyCapacity({ valuePack = false, vouchers = 0, level = null, crew = false } = {}) {
	const lists = {
		trade: 1 + (valuePack ? REFRESH.tradeItem.perDayWithValuePack : REFRESH.tradeItem.perDay),
		material: 1 + REFRESH.shipMaterial.perDay
	};
	const refreshes = lists.trade + lists.material;

	const perTrade = parleyPerTrade({ valuePack, level, crew });
	const bar = PARLEY.max + vouchers * PARLEY.voucher;

	return {
		// Each list on its own clock; `refreshes` is the day's total
		// presses across both, which is what the Parley refills ride on.
		lists,
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
 * What one exchange costs you, specifically.
 *
 * The discounts ADD before they apply, and the result is floored --
 * both read straight off a live window on 2026-08-29. Artisan 3 shows
 * "-16.12% for each barter attempt"; with a Value Pack on top, every
 * chain row read 10,554 and every Crow Coin row 15,994, which are
 * floor(base x (1 - 0.2612)) to the silver. Multiplying the two
 * instead predicts 10,785 and 16,344, and the window disagrees. (An
 * earlier version of this function multiplied, on the strength of a
 * guide; the window outranks the guide.)
 *
 * `kind` picks the list: 'material' for the ship-material exchanges,
 * 'coin' for Crow Coin, anything else the trade chain. The old
 * `crowCoin` flag still works.
 */
export function parleyPerTrade({ valuePack = false, crowCoin = false, level = null, crew = false, kind = null } = {}) {
	const base = kind === 'material' ? PARLEY.perMaterialTrade
		: (crowCoin || kind === 'coin') ? PARLEY.perCrowCoinTrade
		: PARLEY.perGreatOceanTrade;
	const off = levelDiscount(level)
		+ (valuePack ? PARLEY.valuePackDiscount : 0)
		+ (crew ? PARLEY.crewDiscount : 0);
	return Math.floor(base * Math.max(0, 1 - off));
}

/* ------------------------------------------------------------------ *
 * the forecast
 * ------------------------------------------------------------------ */

// Where BDOCodex states no attempt cap, the dataset writes 0. Reading
// that as "unlimited" priced Gilded Coral at one sitting for any
// quantity, which is not a floor, it is a fiction. So an unstated cap
// on a ship material is charged the tightest one the dataset does state
// -- the Brilliants' two a draw -- and the number stays finite and
// honest. The trade chain is better known: the community's board record
// (read 2026-09-03) states each rung's cap, and where the codex writes
// 0 -- every [Level 7] exchange, a third of the [Level 5] ones -- the
// rung's cap is the figure, which the codex's own stated values agree
// with on the rungs it does state.
const ASSUMED_ATTEMPTS = 2;
/** What the Crow Coin islands pay in, by name. It is not a levelled
 *  good -- it has no weight, no wharf price and nothing takes it
 *  further -- so every place that asks "what level is this" has to be
 *  told about it by name instead. */
export const COIN = 'Crow Coin';

/** The level the coin islands take, and the only one they take: every
 *  Crow Coin exchange on every recorded board hands over a [Level 4]. */
export const COIN_LEVEL = 4;

export const TRIES_BY_RUNG = { 1: 10, 2: 10, 3: 10, 4: 10, 5: 6, 6: 5, 7: 5, coin: 4 };

/** The attempts an exchange allows: as stated, else the rung's cap. */
export function triesFor(item, stated) {
	if (stated > 0) return stated;
	if (item === COIN) return TRIES_BY_RUNG.coin;
	const lv = levelOf(item);
	return lv && TRIES_BY_RUNG[lv] ? TRIES_BY_RUNG[lv] : ASSUMED_ATTEMPTS;
}

/**
 * The rung that runs out first, and how many days that takes.
 *
 * Parley is not what stops you getting forty Brilliant Pearl Shards. An
 * exchange for one is capped at two attempts, so the material list has
 * to be redrawn twenty times whatever your Parley looks like -- and
 * that is days, not hours. The rungs below are capped at ten and are
 * never the problem, which is exactly why the answer is a worst-over-
 * rungs rather than a sum: one bottleneck sets the pace and the rest
 * keep up. The comparison is made in days, not redraws, because each
 * rung is paced by its own list -- a material rung by the material
 * list's draws, a trade rung by the trade list's -- and a redraw of one
 * list is not a redraw of the other.
 *
 * How often the exchange is on the list at all is the other half, and
 * it used to be missing. It was left out because the game publishes no
 * weights -- but the app records boards, and those are evidence: a
 * Saltwater Crocodile's Scale was on one of the four whole material
 * boards read, so a forecast that assumed it every draw was four times
 * too fast. `odds` is the index from barter-odds.js; with it, every
 * rung is paced by how often it is really there, and `bestRefreshes`
 * keeps the old figure as what the trip takes if the sea is kind.
 * Without it the two are equal and the behaviour is exactly as before.
 */
export function bottleneck(top, qty, lists = null, odds = null) {
	const pace = lists || {
		trade: 1 + REFRESH.tradeItem.perDay,
		material: 1 + REFRESH.shipMaterial.perDay
	};
	let worst = null;
	let needed = qty;

	for (let r = top; r; r = r.from) {
		const attempts = triesFor(r.item, r.attempts);
		const list = exchangeKind(r.item) === 'material' ? 'material' : 'trade';
		const chance = oddsFor(r.item, odds);
		const perRefresh = attempts * r.received;
		const bestRefreshes = needed / perRefresh;
		// A draw the exchange is absent from buys nothing, so the draws
		// needed are the best case over the share of draws it is on.
		const refreshes = bestRefreshes / (chance.per > 0 ? chance.per : 1);
		const days = refreshes / pace[list];
		// The scarcest rung is the one that paces the climb, and scarcity
		// is now part of what makes a rung slow -- a common rung wanted in
		// bulk and a rare one wanted once are compared on the same axis.
		if (!worst || days > worst.days) {
			worst = {
				item: r.item, needed, perRefresh, refreshes, days, list, attempts,
				bestRefreshes, bestDays: bestRefreshes / pace[list], odds: chance
			};
		}
		needed *= r.givePerUnit;
	}
	return worst;
}

/**
 * The unlock this item is waiting on, or null if nothing gates it.
 *
 * Two kinds of gate, and the harder one wins: the thresholds the patch
 * note states for a good by name, and -- when the table is handed in --
 * the islands that deal it, which is how a thing dealt nowhere but a
 * Margoria wreck says so.
 */
export function gateFor(item, barterCount, barterData = null) {
	let needed = null;

	// Only thresholds the current patch notes still state are claimed.
	// The per-level gates guides print were rewritten on 2026-05-21 and
	// never restated; inventing replacements would lock routes that are
	// open. What the patch does state: the Brilliant pair at 1,500, and
	// the Crow Coin routes at the counts that used to gate levels --
	// below the first of those a player has no Crow Coin route at all.
	// The later ones just add islands; they do not lock the coin.
	if (/^Brilliant /.test(item)) needed = 1500;
	if (item === 'Crow Coin') {
		const first = ROUTE_UNLOCKS.find(r => /Crow Coin/.test(r.opens || ''));
		if (first) needed = first.barters;
	}

	const named = needed !== null && barterCount < needed ? gateAt(needed, barterCount) : null;
	const byIsland = barterData ? gateOfItem(item, barterData, barterCount) : null;
	if (!named) return byIsland;
	if (!byIsland) return named;
	return byIsland.barters > named.barters ? byIsland : named;
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
	const { barterCount = 0, valuePack = false, vouchers = 0, level = null, crew = false, odds = null } = opts;

	const day = dailyCapacity({ valuePack, vouchers, level, crew });

	// Folded on the table this player can actually sail. A ladder
	// through an island they have not opened is not a cost, it is a
	// door -- so the rung is priced at whichever open island deals it,
	// and where none does the answer is the door itself.
	const top = ladder(item, openTable(barterData, barterCount));
	if (!top) {
		const shut = gateFor(item, barterCount, barterData);
		return shut
			? {
				item, qty, gate: shut, trades: 0, days: 0, bestDays: 0,
				scarcest: null, limit: null, perUnit: 0, topParley: 0,
				seed: null, cargo: null, rungs: [], capacity: day
			}
			: null;
	}

	const trades = top.totalTrades * qty;

	// The trip is paced by the rung that runs out first, each rung on
	// its own list's clock. Parley is not that rung and is not modelled
	// as one -- see dailyCapacity -- so it is priced only where a patch
	// note prices it: the top exchange.
	const limit = bottleneck(top, qty, day.lists, odds);
	const days = limit ? limit.days : 0;

	// Every rung is checked, not just the one asked for: a ladder can
	// walk through something the player cannot reach yet.
	const gate = rungs(top)
		.map(r => gateFor(r.item, barterCount, barterData))
		.filter(Boolean)
		.sort((a, b) => b.barters - a.barters)[0] || null;

	// The rarest rung on the whole climb, which is not always the one
	// that paces it: a [Level 7] wanted once can be scarcer than the
	// [Level 3] whose bulk sets the days, and a sailor should know.
	const scarcest = rungs(top)
		.map(r => ({ item: r.item, ...oddsFor(r.item, odds) }))
		.filter(o => o.recorded)
		.sort((a, b) => a.per - b.per)[0] || null;

	return {
		item,
		qty,
		trades,
		days,
		// What the trip takes if every draw offers what you want, which
		// is what this forecast used to quote as the whole answer.
		bestDays: limit ? limit.bestDays : 0,
		scarcest,
		limit,
		perUnit: top.totalTrades,
		// What the top rung alone costs in Parley, which is the only
		// rung the game has published a price for -- at the rate of the
		// exchange it actually is: a ship material at the material
		// list's dearer flat rate, Crow Coin at its own, the chain at
		// the Great Ocean one. The Get screen and the map already price
		// this way; the forecast quoting the chain rate for a material
		// disagreed with both by a factor of four.
		topParley: qty * (1 / top.received)
			* parleyPerTrade({ valuePack, level, crew, kind: exchangeKind(item) }),
		seed: top.seed ? { item: top.seed.item, qty: top.seed.qty * qty } : null,
		// The goods the top exchange takes, and what they were worth.
		cargo: handedOver(top, qty),
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
		// Naming the door is the point: "2,520 more barters" is a wall,
		// "2,520 more open the Wandering Merchant's Ship" is a plan.
		const opens = f.gate.opens ? ` open ${f.gate.opens.replace(/^[^\u2014]*\u2014\s*/, '')}` : ` to reach ${fmt(f.gate.barters)}`;
		return `locked — ${fmt(f.gate.short)} more barters${opens}`;
	}

	const trades = `${fmt(Math.ceil(f.trades))} ${Math.ceil(f.trades) === 1 ? 'trade' : 'trades'}`;
	const days = Math.ceil(f.days);
	const best = Math.ceil(f.bestDays || f.days);

	// Where the boards say the offer is not always there, the two figures
	// are different and both are said: the first is what to plan on, the
	// second what a kind sea would allow. Where they agree there is
	// nothing to add, and the sentence reads as it always did.
	if (days > best) {
		const span = days === 1 ? 'about a day' : `about ${fmt(days)} days`;
		return `${trades} — ${span}, ${best <= 1 ? 'one' : fmt(best)} if the offer is always up`;
	}
	if (f.days < 0.5) return `${trades} — one sitting`;
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
	const pace = `${fmt(f.limit.perRefresh)} a refresh${where}, ${f.capacity.lists[f.limit.list]} refreshes of its list a day`;
	const seen = f.limit.odds && f.limit.odds.recorded && f.limit.odds.per < 1
		? ` · ${oddsText(f.limit.odds)}`
		: '';
	return pace + seen;
}

function fmt(n) {
	return Math.round(n).toLocaleString('en-GB');
}
