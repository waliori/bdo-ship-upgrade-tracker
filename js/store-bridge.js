// Translates the app's original per-ship storage keys into the global
// inventory.
//
// Every material quantity in the app used to be written through
// setStorage()/getStorage() under a key like "Epheria Caravel-Moon Scale
// Plywood". Those keys treated the same physical material as a different
// pile for every ship and every parent recipe. This module resolves any
// of those key shapes back to the one item it always meant, so the
// existing cards, modals and progress bars read and write real stock
// without each call site having to change.

import { recipes } from './recipes.js';
import { ships } from './ships.js';
import { items as vendorItems } from './vendor_items.js';
import { coins } from './sea_coins.js';
import * as store from './state.js';
import { parseEnhanced, enhancedName } from './planner.js';

/** Keys that were app settings rather than material quantities. */
const PASSTHROUGH = new Set([
	'ship', 'tour_completed', 'auto_tour_enabled', 'waterRipplesEnabled',
	'floating-minimized', 'theme', 'view', 'filter'
]);

const LEGACY_PREFIX = 'bdo_ship_upgrade';

let itemNames = new Set();
let itemsByLength = [];
let shipsByLength = [];

/** Every item name the data files know about. */
export function knownItems() {
	if (itemNames.size) return itemNames;

	const add = name => {
		if (typeof name === 'string' && name) itemNames.add(name);
	};

	for (const [product, recipe] of Object.entries(recipes)) {
		add(product);
		for (const ingredient of Object.keys(recipe)) add(ingredient);
	}
	Object.keys(vendorItems).forEach(add);
	Object.keys(coins).forEach(add);

	itemsByLength = [...itemNames].sort((a, b) => b.length - a.length);
	shipsByLength = [...ships].sort((a, b) => b.length - a.length);
	return itemNames;
}

/**
 * Work out which item (and which kind of value) a legacy key refers to.
 * @returns {{kind: 'quantity'|'enhancement'|'passthrough', item?: string}}
 */
export function resolveKey(key) {
	if (!key || PASSTHROUGH.has(key)) return { kind: 'passthrough' };
	knownItems();

	const ship = shipsByLength.find(n => key.startsWith(n + '-'));
	if (!ship) return { kind: 'passthrough' };

	const tail = key.slice(ship.length + 1);
	if (!tail) return { kind: 'passthrough' };

	// "<ship>-<item>-enhancement" -- the level a part was taken to.
	if (tail.endsWith('-enhancement')) {
		return { kind: 'enhancement', item: tail.slice(0, -'-enhancement'.length) };
	}

	// "<ship>-<recipe>-completed" -- finished items, i.e. items owned.
	if (tail.endsWith('-completed')) {
		const made = tail.slice(0, -'-completed'.length);
		if (itemNames.has(made)) return { kind: 'quantity', item: made };
		return { kind: 'passthrough' };
	}

	// "<ship>-<item>" -- a plain quantity. Checked before the split below
	// because item names contain hyphens of their own.
	if (itemNames.has(tail)) return { kind: 'quantity', item: tail };

	// "<ship>-<recipe>-<material>" -- the same pile, counted under a recipe.
	const parent = itemsByLength.find(n => tail.startsWith(n + '-'));
	if (parent) {
		const material = tail.slice(parent.length + 1);
		if (itemNames.has(material)) return { kind: 'quantity', item: material };
	}

	return { kind: 'passthrough' };
}

/* ------------------------------------------------------------------ *
 * The three helpers app.js calls
 * ------------------------------------------------------------------ */

export function readKey(key) {
	const target = resolveKey(key);
	if (target.kind === 'quantity') {
		const qty = store.getStock(target.item);
		return qty ? String(qty) : '0';
	}
	if (target.kind === 'enhancement') {
		return String(currentLevel(target.item));
	}
	try {
		return localStorage.getItem(`${LEGACY_PREFIX}-${key}`) || '';
	} catch {
		return '';
	}
}

export function writeKey(key, value) {
	const target = resolveKey(key);
	if (target.kind === 'quantity') {
		store.setStock(target.item, Number(value) || 0);
		return;
	}
	if (target.kind === 'enhancement') {
		setLevel(target.item, Number(value) || 0);
		return;
	}
	try {
		localStorage.setItem(`${LEGACY_PREFIX}-${key}`, value);
	} catch (err) {
		console.warn('[store-bridge] could not save setting:', err);
	}
}

export function hasKey(key) {
	const target = resolveKey(key);
	if (target.kind === 'quantity') return store.getStock(target.item) > 0;
	if (target.kind === 'enhancement') return currentLevel(target.item) > 0;
	try {
		return localStorage.getItem(`${LEGACY_PREFIX}-${key}`) !== null;
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ *
 * Enhancement levels are no longer a setting -- they are stock
 * ------------------------------------------------------------------ */

/** The level of the part you own, highest first. */
export function currentLevel(item) {
	const { base } = parseEnhanced(item);
	for (let level = 10; level >= 1; level--) {
		if (store.getStock(enhancedName(base, level)) > 0) return level;
	}
	return 0;
}

/** Move one part from whatever level it is at to `level`. */
export function setLevel(item, level) {
	const { base } = parseEnhanced(item);
	const target = Math.max(0, Math.min(10, Math.floor(level) || 0));
	const from = currentLevel(base);
	if (from === target) return;

	const delta = {};
	const fromName = enhancedName(base, from);
	const toName = enhancedName(base, target);

	if (store.getStock(fromName) > 0) delta[fromName] = -1;
	delta[toName] = (delta[toName] || 0) + 1;

	store.applyDelta(delta, 'enhance', `${base} → ${target > 0 ? '+' + target : 'base'}`);
}

/* ------------------------------------------------------------------ *
 * Compatibility shim for the old aggregation helper
 * ------------------------------------------------------------------ */

/**
 * The original walked a dozen key variants and summed them. Now that
 * every variant resolves to the same item, this is one lookup -- plus the
 * "+10" form, because requirement lists strip that prefix before asking.
 */
export function totalOwned(materialName) {
	return store.getStock(materialName) + store.getStock(`+10 ${materialName}`);
}

/** True when an item can be both crafted and bought, so the choice matters. */
export function hasBuyOption(item) {
	if (!recipes[item]) return false;
	if (coins[item]) return true;
	const methods = vendorItems[item];
	return !!(methods && (methods.Purchase || methods.Market));
}
