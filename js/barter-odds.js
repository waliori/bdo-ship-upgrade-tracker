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
// The trade-good list: `barter_combos.json`, forty layouts with how
// often each was seen across four hundred and twenty refreshes. That
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
export function readOdds({ boards = null, combos = null } = {}) {
	const material = new Map();
	const trade = new Map();

	const bs = (boards && Array.isArray(boards.boards)) ? boards.boards : [];
	for (const b of bs) {
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

	return { material, trade, boards: bs.length, refreshes };
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
	if (!rec || !of) return unknown;

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
	if (!odds || !odds.recorded) return 'no board has recorded this one yet';
	if (odds.kind === 'material') {
		const where = odds.islands >= 2 ? `, at ${Math.round(odds.islands)} islands when it is` : '';
		return odds.seen >= odds.of
			? `on every one of the ${odds.of} boards recorded${where}`
			: `on ${odds.seen} of the ${odds.of} boards recorded${where}`;
	}
	const pct = Math.round((odds.seen / odds.of) * 100);
	return `on about ${pct}% of refreshes, over ${odds.of.toLocaleString('en-GB')} recorded`;
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
