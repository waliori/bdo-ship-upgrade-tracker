// The room the ship's hold has left, in slots.
//
// The game takes no good into a hold whose slots are full: a [Level 5]
// and up takes a slot each, the levels under it a slot a kind (owner's
// rule, 2026-10-01). So every press that puts goods aboard by hand --
// a packing tick, a load from a storage, the hold sheet's count, the
// Inventory moving goods to the ship -- asks here first, puts aboard
// what fits and says what did not. What already happened is another
// matter: a trade recorded at sea, a sync or a screenshot of the game
// is written as it is, and the hold shows over rather than lose it.
//
// Only goods sit in these slots. The rations are a pool the character
// carries, never a count in the hold, and the crew and the parts are
// not inventory at all.

import * as store from './state.js';
import { T, gameName } from './i18n.js';
import { F } from './fmt.js';
import { currentShip } from './ship.js';
import { levelOf } from './barter.js';
import { slotsHeld, slotFit, fitInto, aboardStock } from './barter-plan.js';

/** Whether goods noted at `place` are in the ship's hold: the hold
 *  itself, or -- a trade good -- the count no storage claims, which is
 *  where the app has always kept the ones aboard. */
export const inHoldAt = (item, place) => place === store.ABOARD || (place === '' && levelOf(item) !== null);

/** The goods in the hold as it stands, as a Map: the trade goods
 *  aboard and whatever else is noted in the ship's hold. `less` is a
 *  list of [name, n] counted as already off. */
export function holdGoods(less = null) {
	const m = new Map(Object.entries(aboardStock(store)));
	for (const name of Object.keys(store.getAllStock())) {
		if (levelOf(name) !== null) continue;
		const n = store.stockAt(name, store.ABOARD);
		if (n > 0) m.set(name, n);
	}
	for (const [name, n] of less || []) m.set(name, Math.max(0, (m.get(name) || 0) - n));
	return m;
}

/** The slots the hold's goods take now. */
export const holdSlotsUsed = (less = null) => slotsHeld(holdGoods(less));

/** The slots the hull sailed has; Infinity for an old hold without. */
export function hullSlots() {
	const s = currentShip().hold.slots;
	return Number.isFinite(s) ? s : Infinity;
}

/**
 * What of `adds` -- a list of [name, n] going aboard, in the order it
 * is loaded -- fits the hold's free slots, and what does not:
 * { fit, left, free, slots }, `fit` and `left` lists of [name, n].
 */
export function fitAboard(adds) {
	const slots = hullSlots();
	return { ...fitInto(holdGoods(), adds, slots), slots };
}

/**
 * The same, a good at a time and each whole or not at all: for a move
 * that takes everything of a good, which cannot leave half of it where
 * it was.
 */
export function wholeAboard(adds) {
	const slots = hullSlots(), m = holdGoods();
	const free = Number.isFinite(slots) ? Math.max(0, slots - slotsHeld(m)) : Infinity;
	const fit = [], left = [];
	for (const [name, n] of adds) {
		if (!(n > 0)) continue;
		const have = m.get(name) || 0;
		if (slotFit(name, n, have, slotsHeld(m), slots) >= n) { fit.push([name, n]); m.set(name, have + n); } else left.push([name, n]);
	}
	return { fit, left, free, slots };
}

/**
 * The Inventory's "move them all to the bags", which for a trade good
 * is the ship: the goods that would pass the hold's slots stay where
 * they are. { items, refused }: the items to move, and the refusal to
 * say, null when everything fits.
 */
export function placeableAboard(items) {
	const aboard = holdGoods();
	const adds = items.filter(it => levelOf(it) !== null).map(it => [it, store.getStock(it) - (aboard.get(it) || 0)]);
	const r = wholeAboard(adds);
	if (!r.left.length) return { items, refused: null };
	const out = new Set(r.left.map(([name]) => name));
	return { items: items.filter(it => !out.has(it)), refused: r };
}

/** A place forgotten hands its count back to the bags, which for a
 *  trade good is the ship: refused, with the words why, when the hold
 *  has not the slots for it. '' when it may go ahead. */
export function forgetSaid(item, town) {
	const n = town && town !== store.ABOARD && inHoldAt(item, '') ? store.stockAt(item, town) : 0;
	if (!(n > 0)) return '';
	const r = wholeAboard([[item, n]]);
	return r.left.length ? refusedSaid(r) : '';
}

/** A count typed or bumped at the ship's hold, held to its free slots:
 *  { n, said }, `n` the count to write and `said` what did not fit. */
export function cappedAboard(item, town, after) {
	const before = store.stockAt(item, town);
	if (town !== store.ABOARD || !(after > before)) return { n: after, said: '' };
	const r = fitAboard([[item, after - before]]);
	const k = r.fit.reduce((a, [, m]) => a + m, 0);
	return { n: before + k, said: r.left.length ? refusedSaid(r, k > 0) : '' };
}

/** A total typed or bumped in the Inventory: what it adds lands at the
 *  good's home, which for a trade good with none is the ship, so the
 *  rise is held to the hold's free slots there. A count past the slots
 *  is a typo, since the game cannot hold it. { n, said }. */
export function cappedOwn(item, after) {
	const before = store.getStock(item);
	if (!(after > before) || !inHoldAt(item, store.homeOf(item))) return { n: after, said: '' };
	const r = fitAboard([[item, after - before]]);
	const k = r.fit.reduce((a, [, m]) => a + m, 0);
	return { n: before + k, said: r.left.length ? refusedSaid(r, k > 0) : '' };
}

const listed = list => list.map(([name, n]) => (n > 1 ? `${F(n)}× ${gameName(name)}` : gameName(name))).join(', ');

/**
 * The words for goods the hold would not take: how many slots it has
 * free, and what did not go aboard. `loaded` says whether the rest was
 * loaded, so the sentence does not promise a load that never happened.
 */
export function refusedSaid({ left, free, slots }, loaded = false) {
	const what = listed(left);
	if (!(free > 0)) return T('The hold\'s {slots} slots are full: {what} did not go aboard. A [Level 5] and up takes a slot each — put something ashore first.', { slots: F(slots), what });
	return loaded
		? T('Loaded what fits: the hold had {free} of its {slots} slots free, and {what} did not go aboard. A [Level 5] and up takes a slot each.', { free: F(free), slots: F(slots), what })
		: T('The hold has {free} of its {slots} slots free: {what} did not go aboard. A [Level 5] and up takes a slot each.', { free: F(free), slots: F(slots), what });
}

/** Said after a hull change, when the goods aboard take more slots
 *  than the new hull has: nothing is taken off, the hold shows over,
 *  and this says so. '' when they fit. */
export function overSaid() {
	const slots = hullSlots(), used = holdSlotsUsed();
	if (!(used > slots)) return '';
	return T('The goods aboard take {used} slots and this hull has {slots}: nothing was taken off, so put some ashore before casting off.', { used: F(used), slots: F(slots) });
}

/** A hull change's own words, with the over-the-slots note after them
 *  when there is one. */
export const withOver = said => { const o = overSaid(); return o ? `${said} — ${o}` : said; };
