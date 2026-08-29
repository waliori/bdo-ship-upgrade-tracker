// The interface's shared state, and the one place it is recomputed.
//
// Every screen is a projection of state.js through planner.js; what
// they all share -- the resolved recipe book, the current plan, the
// flattened rows, which tab and filters are up -- lives here as live
// bindings. Screens import and read them; the few writers outside
// recompute() go through the setters below, because an imported
// binding cannot be assigned from the importing side.

import { recipes as allRecipes } from './recipes.js';
import { coins } from './sea_coins.js';
import { falasi } from './falasi_vendor.js';
import * as store from './state.js';
import { plan, craftableNow, parseEnhanced, resolveRoutes } from './planner.js';

// The recipe book as the user's chosen routes make it. An upgrade with
// two ways in -- the Caravel, the Galleass -- reads here as whichever one
// they picked, so nothing downstream has to know routes exist.
export let recipes = allRecipes;

// Currencies are held in stock like anything else, so they undo, export
// and sync for free -- but they are kept out of the item grid, which is
// for things with recipes and sources.
export const CROW_COIN = 'Crow Coin';
export const SILVER = 'Silver';

// Sangpyeong Coins are money too, even though they sit in your bags like a
// material: they buy Finely Polished Pine Plywood, which the Panokseon
// wants 300 of and each Byukgye's part another 50 -- thousands of coins in
// a build, earned from Moodle Village dailies rather than bought. It stays
// in the item grid as well, since where it comes from is worth reading.
export const SANGPYEONG = 'Sangpyeong Coin';

// Everything an enhancement attempt burns other than the part itself --
// derived from the recipes, so a new stone in a future update shows up in
// the pouch without anyone editing this file.
export const STONES = (() => {
	const set = new Set();
	for (const [product, recipe] of Object.entries(allRecipes)) {
		const made = parseEnhanced(product);
		if (made.level === 0) continue;
		for (const item of Object.keys(recipe)) {
			if (parseEnhanced(item).base === made.base) continue;
			set.add(item);
		}
	}
	return [...set];
})();

export let view = 'plan';
export let query = '';
export let planFilter = 'all';
export let invFilter = 'all';
export let selected = null;
export let snapshot = null;
export let rows = {};
export let barterData = null;

export const setView = id => { view = id; };
export const setQuery = q => { query = q; };
export const setPlanFilter = f => { planFilter = f; };
export const setInvFilter = f => { invFilter = f; };
export const setSelected = item => { selected = item; };
export const setBarterData = data => { barterData = data; };

/* ------------------------------------------------------------------ *
 * planning
 * ------------------------------------------------------------------ */

export function recompute() {
	recipes = resolveRoutes(store.getAllStrategy(), allRecipes);
	snapshot = plan({
		stock: store.getAllStock(),
		targets: store.getTargets(),
		strategy: store.getAllStrategy()
	});

	// Collapse every build's requirement tree into one row per item.
	//
	// Enhancement chains are folded away: a "+10 part" pulls in +9, +8 … +1
	// and the base item, which would otherwise fill the plan with ten rows
	// per part. Only the level a build actually asks for is kept -- the
	// steps in between belong to the Workshop. The base part and the stones
	// still appear, because those are things you have to go and get.
	rows = {};
	for (const target of snapshot.targets) {
		const walk = (node, root) => {
			const here = parseEnhanced(node.item);
			const from = node.via ? parseEnhanced(node.via) : null;
			const midChain = here.level > 0 && from && from.level > 0 && from.base === here.base;

			if (!midChain) {
				const r = rows[node.item] || (rows[node.item] = { need: 0, take: 0, craft: 0, short: 0 });
				r.need += node.need;
				r.take += node.fromStock;
				r.craft += node.toCraft;
				r.short += node.missing;
				// The thing you queued is the goal, not a material for it.
				if (root) r.isTarget = true;
			}
			node.children.forEach(child => walk(child, false));
		};
		walk(target.tree, true);
	}
	for (const [item, holders] of Object.entries(snapshot.reservedBy)) {
		if (rows[item]) rows[item].resv = holders;
	}
}

export const readyCrafts = () =>
	craftableNow(store.getAllStock(), snapshot.toCraft, recipes)
		.filter(c => parseEnhanced(c.item).level === 0);

export function totalsToGo() {
	let c = 0;
	let s = 0;
	for (const [item, qty] of Object.entries(snapshot.missing)) {
		if (coins[item]) c += coins[item] * qty;
		if (falasi[item]) s += falasi[item] * qty;
	}
	return { coins: c, silver: s, lines: Object.keys(snapshot.missing).length };
}

/** What the player has told us about their own bartering. */
export function barterProfile() {
	return {
		barterCount: Number(store.getProfile('barterCount', 0)) || 0,
		valuePack: store.getProfile('valuePack', false) === true,
		crew: store.getProfile('crew', false) === true,
		level: store.getProfile('level', null),
		vouchers: Number(store.getProfile('vouchers', 0)) || 0,
		// Parley in the bar right now, for "can I afford this route".
		parleyHeld: Number(store.getProfile('parleyHeld', 0)) || 0
	};
}
