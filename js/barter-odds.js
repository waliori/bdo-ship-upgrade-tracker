// How often the offer is actually there.
//
// Every barter forecast in this app used to assume that what you want
// is on the list every time you draw it. It is not, and that is not a
// rounding error: of the four complete ship-material boards recorded,
// a Saltwater Crocodile's Scale exchange was on one. Quoting that as
// "three draws, a day at best" and leaving it there reads as a
// schedule, and a player who follows it spends four days finding out
// otherwise. Worse, it compounds: a plan wanting four materials off
// one list assumed all four turned up, every day.
//
// So the odds are read off the two records the app already keeps.
//
// The ship-material list: `material_boards.json`, four whole boards
// read off the barter window on four refreshes. A board is the entire
// list -- every island, forty-odd offers -- so an item's absence from
// one is real evidence of absence, which is what makes these boards
// worth more than their number suggests.
//
// The trade-good list: the forty layouts (barter-layouts.js, from the
// game's own tables) with how often each was seen -- the community
// sheet's count, kept in barter_seen.js since the app stopped reading
// it: four hundred and ninety-one refreshes. That
// is a large sample, and it says plainly that the top rungs are
// scarce: a [Level 7] Omar Lava Powder is on one refresh in seven,
// where a [Level 3] Rare Herb Pile is on nineteen in twenty.
//
// What is deliberately NOT used: the player's own `matSeen` diary. It
// records the islands they ticked while hunting one material, so it
// says where a thing was and never where it was not -- a sample with
// no absences in it cannot measure how often something is absent, and
// folding it in would push every rate back toward the optimism this
// module exists to remove.
//
// What is measured is presence: the share of draws the exchange was on
// the list at all. A board showing the same material at three islands
// is deliberately NOT counted as three times the yield, even though it
// is three real chances -- that would assume a sailor who visits every
// island offering it inside one refresh, and would make this file's
// numbers rosier than the ones it replaces. Presence alone can only
// ever lengthen a forecast, never shorten one, which is the only
// direction the evidence points.
//
// The estimate is shrunk toward "on every draw" -- exactly what the old
// model assumed -- by one board's worth of weight, because four boards
// is a thin sample and a material recorded once should not read as a
// certainty either way. Anything the boards have never recorded keeps
// the old assumption and says so, so a missing dataset degrades to the
// previous behaviour rather than to a guess.
//
// Pure: no store, no screen, no fetch. Hand it the datasets.

import { T } from './i18n.js';

// The kind test is inlined rather than imported from barter.js, which
// imports this: a leaf module cannot be half-evaluated by a cycle.
const LEVEL = /^\[Level (\d)\]/;
const kindOf = item => item === 'Crow Coin' ? 'coin' : LEVEL.test(item || '') ? 'trade' : 'material';

/** What an unrecorded exchange is assumed to be: on every draw, the
 *  assumption every forecast made before this file existed. */
export const PRIOR_PER_DRAW = 1;

/** How many boards of weight that assumption carries. One: the data
 *  leads, but a single board cannot make a rate certain on its own. */
export const PRIOR_WEIGHT = 1;

/**
 * Index both datasets by item: how many draws it was on, out of how
 * many, and how many islands carried it when it was there.
 *
 * The island count is kept for the sentence under the forecast -- it is
 * worth knowing that a thing shows at three islands when it shows -- and
 * not for the arithmetic, which counts presence only.
 */
export function readOdds({ boards = null, combos = null, pages = null } = {}) {
	const material = pages && pages.length ? gameMaterial(pages) : new Map();
	const trade = new Map();

	const bs = (boards && Array.isArray(boards.boards)) ? boards.boards : [];
	for (const b of pages && pages.length ? [] : bs) {
		const here = new Map();
		for (const o of b.offers || []) {
			const item = o[3];
			if (typeof item !== 'string') continue;
			here.set(item, (here.get(item) || 0) + 1);
		}
		for (const [item, n] of here) {
			const rec = material.get(item) || { slots: 0, on: 0 };
			rec.slots += n;
			rec.on += 1;
			material.set(item, rec);
		}
	}

	const cs = (combos && Array.isArray(combos.combos)) ? combos.combos : [];
	const refreshes = cs.reduce((a, c) => a + (Number(c.seen) || 0), 0);
	for (const c of cs) {
		const seen = Number(c.seen) || 0;
		if (seen <= 0) continue;
		const here = new Map();
		for (const o of c.offers || []) {
			const item = o[3];
			if (typeof item !== 'string') continue;
			here.set(item, (here.get(item) || 0) + 1);
		}
		for (const [item, n] of here) {
			const rec = trade.get(item) || { slots: 0, on: 0 };
			rec.slots += n * seen;
			rec.on += seen;
			trade.set(item, rec);
		}
	}

	return { material, trade, side: sideOdds(cs), boards: pages && pages.length ? pages.length : bs.length, refreshes };
}

/**
 * The trade board's share of the materials: its fixed slots paying one
 * and its pools, each layout weighed by how often it is dealt. A trade
 * refresh can show a material at one of those islands too, so a
 * material's days count both lists -- the material list's draws and the
 * trade board's. `per` is the chance a trade refresh shows the item at
 * all, `islands` how many islands it shows it at when it does.
 */
function sideOdds(cs) {
	const out = new Map();
	const all = cs.reduce((a, c) => a + (Number(c.seen) || 1), 0);
	if (!all) return out;
	for (const c of cs) {
		const w = (Number(c.seen) || 1) / all;
		const here = new Map();
		const add = (item, p) => { const h = here.get(item) || { none: 1, n: 0 }; h.none *= 1 - p; h.n += p; here.set(item, h); };
		for (const o of c.offers || []) if (typeof o[3] === 'string' && !/^\[Level \d\]/.test(o[3]) && o[3] !== 'Crow Coin') add(o[3], o[4] && Number.isFinite(o[4].chance) ? o[4].chance : 1);
		for (const pool of Object.values(c.pools || {})) for (const x of pool.options) if (x.recv !== 'Crow Coin') add(x.recv, (x.chance ?? 1) / pool.options.length);
		for (const [item, h] of here) {
			const rec = out.get(item) || { per: 0, islands: 0 };
			rec.per += (1 - h.none) * w;
			rec.islands += h.n * w;
			out.set(item, rec);
		}
	}
	for (const rec of out.values()) rec.islands = rec.per ? rec.islands / rec.per : 0;
	return out;
}

/**
 * The material list's odds from the game's own tables: for each good,
 * the chance it is on a day's list, over the forty-one layouts taken as
 * equally likely. On one layout a slot shows it with the offer's own
 * chance, or -- a slot the game fills at random -- its share of the
 * options; the list has it if any slot does. Exact where the boards
 * read could only sample, so it is not shrunk toward the old guess.
 */
function gameMaterial(pages) {
	const out = new Map();
	for (const page of pages) {
		const here = new Map();
		const add = (item, p) => {
			const h = here.get(item) || { none: 1, n: 0 };
			h.none *= 1 - p;
			h.n += p;
			here.set(item, h);
		};
		for (const o of page.offers.values()) {
			if (o.options) for (const x of o.options) add(x.recv, (x.chance ?? 1) / o.options.length);
			else add(o.recv, o.chance ?? 1);
		}
		for (const [item, h] of here) {
			const rec = out.get(item) || { per: 0, islands: 0, on: 0 };
			rec.per += (1 - h.none) / pages.length;
			rec.islands += h.n / pages.length;
			rec.on += 1;
			out.set(item, rec);
		}
	}
	for (const rec of out.values()) { rec.exact = true; rec.islands = rec.per ? rec.islands / rec.per : 0; }
	return out;
}

/**
 * How many offers for `item` one draw of its list shows, on average.
 *
 * Returns `{ per, seen, of, kind, recorded }`: `per` is the factor a
 * forecast multiplies its per-draw yield by, `seen` of `of` is the
 * sample it came from, and `recorded` is false when nothing has been
 * observed and the old assumption stands.
 */
export function oddsFor(item, index) {
	const kind = kindOf(item);
	const unknown = { per: PRIOR_PER_DRAW, seen: 0, of: 0, kind, recorded: false };
	if (!index) return unknown;

	// Crow Coin is dealt on the trade list and was on every one of the
	// four hundred and twenty refreshes recorded, so it is left at one
	// rather than shrunk away from a certainty the sample supports.
	const table = kind === 'material' ? index.material : index.trade;
	const of = kind === 'material' ? index.boards : index.refreshes;
	const rec = table && table.get(item);
	// A material the trade board may deal too: its share there rides along.
	const alsoTrade = kind === 'material' && index.side && index.side.get(item) ? { per: Math.min(1, index.side.get(item).per), islands: index.side.get(item).islands } : null;
	// One only the trade board deals is known by that alone.
	if (!rec && alsoTrade) return { per: 0, seen: 0, of, kind, recorded: true, exact: true, islands: 0, alsoTrade };
	if (!rec || !of) return unknown;
	if (rec.exact) return { per: Math.min(1, rec.per), seen: rec.on, of, kind, recorded: true, exact: true, islands: rec.islands, ...(alsoTrade ? { alsoTrade } : {}) };

	// Presence, shrunk toward the old assumption. Never above one: this
	// file exists to take optimism out of a forecast, not to add it.
	const per = Math.min(1, (rec.on + PRIOR_PER_DRAW * PRIOR_WEIGHT) / (of + PRIOR_WEIGHT));
	return { per, seen: rec.on, of, kind, recorded: true, islands: rec.on ? rec.slots / rec.on : 0 };
}

/**
 * The odds said in English, for the line under a forecast.
 *
 * The sample is always named. "Seen on 1 of 4 boards" is a fact a
 * player can weigh; "0.4 offers a draw" is a number they cannot.
 */
export function oddsText(odds) {
	if (!odds || !odds.recorded) return T('no board has recorded this one yet');
	if (odds.kind === 'material') {
		const where = odds.islands >= 2 ? T(', at {n} islands when it is', { n: Math.round(odds.islands) }) : '';
		const trade = odds.alsoTrade ? Math.max(1, Math.round(odds.alsoTrade.per * 100)) : 0;
		if (odds.exact && !odds.per && trade) return T('only on the trade board, on about {pct}% of its refreshes, by the game’s own tables', { pct: trade });
		if (odds.exact && trade) return T('on about {pct}% of material lists and {trade}% of trade boards, by the game’s own tables{where}', { pct: Math.max(1, Math.round(odds.per * 100)), trade, where });
		if (odds.exact) return T('on about {pct}% of material lists, by the game’s own tables{where}', { pct: Math.max(1, Math.round(odds.per * 100)), where });
		return odds.seen >= odds.of
			? T('on every one of the {of} boards recorded{where}', { of: odds.of, where })
			: T('on {seen} of the {of} boards recorded{where}', { seen: odds.seen, of: odds.of, where });
	}
	const pct = Math.round((odds.seen / odds.of) * 100);
	return T('on about {pct}% of refreshes, over {n} recorded', { pct, n: odds.of.toLocaleString('en-GB') });
}

/**
 * The odds along a whole ladder, worst rung first.
 *
 * A chain is only as available as its scarcest rung: climbing to a
 * [Level 7] through a rung that shows up one time in seven is a
 * different proposition from the top rung's own odds, and the forecast
 * has to see all of them to pace the climb.
 */
export function laddersOdds(rungs, index) {
	return (rungs || []).map(r => ({ item: r.item, ...oddsFor(r.item, index) }))
		.sort((a, b) => a.per - b.per);
}
