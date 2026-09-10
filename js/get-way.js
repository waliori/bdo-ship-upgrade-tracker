// The way to get the list, read off the live state.
//
// get-plan.js is pure and wants everything handed to it; this is the
// one place that hands it over -- the shortfall, the prices, the
// barter forecaster at the player's own profile, the quests and which
// are done, the purse and the orders -- so To Get, the Plan's Next
// line and the Quests screen all read the same answer. Memoised on
// what it was computed from: a plan is cheap but not free, and the
// Quests screen asks on every draw.

import { coins } from './sea_coins.js';
import { falasi } from './falasi_vendor.js';
import { marketSilver, marketStatus } from './market.js';
import { items as vendorItems, bulkExchanges } from './vendor_items.js';
import { quests, cadenceOf } from './quests.js';
import { forecast, dailyCapacity } from './barter.js';
import { periodKey } from './clock.js';
import * as store from './state.js';
import { snapshot, barterData, barterProfile, CROW_COIN, SILVER } from './ui-state.js';
import { groundsFor } from './ui-bits.js';
import { wayToGet, readGetOrders } from './get-plan.js';

let memo = null;

/** The orders in force, cleaned. */
export const getOrders = () => readGetOrders(store.getProfile('getOrders', null));

/** Whether a quest is done for the period it is in right now. */
export function questDoneNow(q, done = store.getProfile('questsDone', {}) || {}) {
	return done[q.id] === periodKey(cadenceOf(q));
}

/**
 * The plan for the current shortfall. Recomputed when the shortfall,
 * the purse, the quests' state, the barter profile, the market's
 * prices or the orders change; the same object otherwise.
 */
export function theWay() {
	if (!snapshot) return null;
	const profile = barterProfile();
	const done = store.getProfile('questsDone', {}) || {};
	const orders = getOrders();
	const key = JSON.stringify([
		snapshot.missing, store.getStock(CROW_COIN), store.getStock(SILVER), done, profile, orders,
		marketStatus().at, !!barterData, periodKey('daily'), periodKey('weekly')
	]);
	if (memo && memo.key === key) return memo.way;
	const way = wayToGet({
		missing: snapshot.missing,
		sources: {
			coins,
			silver: falasi,
			market: marketSilver(),
			barter: barterData ? (item, qty) => forecast(item, qty, barterData, profile) : null,
			quests,
			grounds: groundsFor,
			bulk: bulkExchanges,
			acquisition: vendorItems
		},
		state: {
			purse: { coins: store.getStock(CROW_COIN), silver: store.getStock(SILVER) },
			isDone: q => questDoneNow(q, done),
			capacity: dailyCapacity(profile)
		},
		orders
	});
	memo = { key, way };
	return way;
}

/** The quests the plan wants run today, still to do: for the Next line. */
export function todaysQuests() {
	const way = theWay();
	if (!way) return [];
	return way.quests.filter(q => !questDoneNow(q.quest));
}

/** What the plan would take on a pick-one quest, or null. */
export function plannedPick(questId) {
	const way = theWay();
	if (!way) return null;
	const q = way.quests.find(x => x.id === questId);
	return q && q.pick !== null ? q.pick : null;
}
