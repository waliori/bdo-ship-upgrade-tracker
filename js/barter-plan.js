// The hold and the goods: what a good weighs and pays, what a stock
// holds of them, and the table read as flat rows.
//
// Every barter planner reads these -- the run for silver
// (barter-chains.js), the material run (barter-material.js), the
// optimiser and the screens -- so they live apart from any one of
// them. Quantities are the averages of the game's ranges, the way the
// ladder and the loop's ledger already count them, so the counts are
// fractions inside and whole numbers where a person reads them.
//
// Nothing here touches the store or the screen: stock and the table
// come in as arguments.

import { GOODS, SELL_PRICES, RARE_WEIGHT, amount, goodSell, levelOf, rankOf, isGreatOcean, triesFor } from './barter.js';

export { rankOf, isGreatOcean };
import { landGoods } from './land_goods.js';
import { landWeights } from './land_weights.js';

/** The weight of a good, 0 for anything the table does not price. */
const WEIGHTS = new Map();
export function weightOf(name) {
	let w = WEIGHTS.get(name);
	if (w === undefined) {
		const lv = levelOf(name);
		// A land good weighs what its codex page says: a tenth of an LT for
		// most, half for plywood -- little, but a hold loaded with five
		// hundred of something is a hold with something in it.
		w = lv ? (GOODS[lv] ? GOODS[lv].weight : 0) : SELL_PRICES[name] !== undefined ? RARE_WEIGHT : landWeights[name] || 0;
		WEIGHTS.set(name, w);
	}
	return w;
}

/** Whether a good stacks in an inventory slot. [Level 1] to [Level 4]
 *  of one name do; a [Level 5] and up -- the Great Ocean goods with
 *  them -- and the rare pays do not: one slot a unit (BDOCodex
 *  "Stacking: No"; GrumpyG's barter guide says the same). */
export function stacks(name) {
	const lv = levelOf(name);
	if (lv === null) return SELL_PRICES[name] === undefined;
	return lv < 5;
}

/** The slots `k` of one good take: one for what stacks, one a unit
 *  for what does not, none for none. */
export function slotsFor(name, k) {
	if (!(k > 1e-9)) return 0;
	return stacks(name) ? 1 : Math.ceil(k - 1e-9);
}

/** The inventory slots a set of goods takes: one a kind for what
 *  stacks, one a unit for what does not. The same count holds for the
 *  ship's hold, the character's bag and a storage: the game stacks
 *  [Level 1] to [Level 4] everywhere and the rest nowhere. */
export function bagSlotsOf(goods) {
	let n = 0;
	for (const [name, k] of goods) n += slotsFor(name, k);
	return n;
}
/** The same count, said for the hold or a storage. */
export const slotsHeld = bagSlotsOf;

/** How many of `n` more of a good fit in `room` slots, with `have` of
 *  it already among goods that take `used` slots: all of them when it
 *  stacks and a slot holds it already (or one is free), else one a
 *  free slot. */
export function slotFit(name, n, have, used, room) {
	if (!Number.isFinite(room)) return n;
	if (stacks(name)) return have > 1e-9 || used < room ? n : 0;
	const free = room - (used - slotsFor(name, have));
	return Math.max(0, Math.min(n, Math.floor(free - have + 1e-9)));
}

/** What a barterer pays for a good, 0 for the unsellable levels and
 *  for anything that is not a good: the [Great Ocean] and rare goods at
 *  their own price (SELL_PRICES). */
export const sellOf = goodSell;

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
				tries: triesFor(e.name, s.attempts_available),
				// The game's own base Parley for this exchange, where the
				// board carries it: a Crow Coin trade costs half again a
				// trade-good one.
				...(s.parley > 0 ? { parleyBase: s.parley } : {})
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

/**
 * The land goods in a stock, as a Map of name to count: the shore
 * goods a chain starts from, which a sailor can have a pile of instead
 * of buying a fresh one every run. Each weighs what `weightOf` says.
 */
export function landHeld(stock) {
	const out = new Map();
	for (const [name, qty] of Object.entries(stock || {})) {
		if (levelOf(name) === null && landGoods[name] !== undefined && qty > 0) out.set(name, Number(qty));
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
