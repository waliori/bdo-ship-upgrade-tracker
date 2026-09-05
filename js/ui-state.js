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
import { marketSilver } from './market.js';
import * as store from './state.js';
import { plan, craftableNow, stockForCrafting, parseEnhanced, resolveRoutes, ownedLevel } from './planner.js';

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
export let invKind = 'all';     // all | materials | parts | goods
export let selected = null;
export let snapshot = null;
export let rows = {};
export let barterData = null;
export let combos = null;       // the forty barter boards, js/barter_combos.json, once read
export let matBoards = null;    // the material boards recorded, js/material_boards.json, once read

export const setView = id => { view = id; };
export const setQuery = q => { query = q; };
export const setPlanFilter = f => { planFilter = f; };
export const setInvFilter = f => { invFilter = f; };
export const setInvKind = k => { invKind = k; };
export const setSelected = item => { selected = item; };
// The Inventory's select mode: several tiles ticked for one action --
// moved to a storage together, or handed back to the bags.
export let invPicking = false;
export const invPicked = new Set();
export const setInvPicking = on => { invPicking = !!on; if (!on) invPicked.clear(); };
export const setBarterData = data => { barterData = data; };
export const setCombos = data => { combos = data; };
export const setMatBoards = data => { matBoards = data; };

// How the Plan and the Inventory order their rows. Shortfall first is the
// question the app exists to answer; the others are for finding a thing
// you already know the name of, or seeing where the bulk is.
export let sort = 'short';
export const setSort = mode => { sort = SORTS.some(s => s.id === mode) ? mode : 'short'; };
export const SORTS = [
	{ id: 'short', label: 'Short first' },
	{ id: 'need', label: 'Most needed' },
	{ id: 'have', label: 'Most owned' },
	{ id: 'name', label: 'A to Z' }
];

/** A comparator over item names for the chosen order. */
export function sorter(mode, stock) {
	const short = r => (r && r.short) || 0;
	const need = r => (r && r.need) || 0;
	return (a, b) => {
		if (mode === 'name') return a.localeCompare(b);
		if (mode === 'need') return need(rows[b]) - need(rows[a]) || a.localeCompare(b);
		if (mode === 'have') return (stock[b] || 0) - (stock[a] || 0) || a.localeCompare(b);
		return short(rows[b]) - short(rows[a]) || need(rows[b]) - need(rows[a]) || a.localeCompare(b);
	};
}

/** The sort control, the same on every screen that has one. */
export function sortSelect() {
	return `<select class="select" data-act="sort" aria-label="Order the rows by">${SORTS.map(s =>
		`<option value="${s.id}"${s.id === sort ? ' selected' : ''}>${s.label}</option>`).join('')}</select>`;
}

/* ------------------------------------------------------------------ *
 * planning
 * ------------------------------------------------------------------ */

export function recompute() {
	recipes = resolveRoutes(store.getAllStrategy(), allRecipes);
	const stock = store.getAllStock();
	// The failstack each yellow part carries into its next attempt, so
	// the plan scales its stones the way the Workshop's forecast does
	// rather than at the quoted stack while the Workshop says otherwise.
	const failstacks = {};
	for (const [base, stack] of Object.entries(store.getProfile('failstacks', {}) || {})) {
		failstacks[base] = { level: ownedLevel(base, stock) + 1, stack };
	}
	snapshot = plan({
		stock,
		targets: store.getTargets(),
		strategy: store.getAllStrategy(),
		failstacks
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
	craftableNow(store.getAllStock(), snapshot.toCraft, recipes, snapshot)
		.filter(c => parseEnhanced(c.item).level === 0);

/** What may be spent making `item` right now: stock no build has
 *  claimed, plus what the plan set aside as this item's own materials. */
export const craftStock = item => stockForCrafting(item, store.getAllStock(), snapshot);

export function totalsToGo() {
	let c = 0;
	let s = 0;
	// Falasi's list first; the Market prices only what he does not sell.
	const market = marketSilver();
	for (const [item, qty] of Object.entries(snapshot.missing)) {
		if (coins[item]) c += coins[item] * qty;
		if (falasi[item]) s += falasi[item] * qty;
		else if (market[item]) s += market[item] * qty;
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
