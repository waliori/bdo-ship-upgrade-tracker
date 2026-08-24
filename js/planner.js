// Requirement planning over a shared inventory.
//
// Nothing here is stored. Given what you own and what you are building,
// these functions work out what is reserved, what is still to craft and
// what you are short of. Targets are processed in priority order against
// one draining pool, so the same physical material is never promised to
// two builds at once.

import { recipes as defaultRecipes } from './recipes.js';

/** Recipes an item can be made from, honouring a "I'll just buy this" choice. */
function recipeFor(item, strategy, recipes) {
	if (strategy[item] === 'buy') return null;
	return recipes[item] || null;
}

function bump(obj, key, amount) {
	if (!amount) return;
	obj[key] = (obj[key] || 0) + amount;
}

/**
 * Walk one requirement, taking from `pool` first and only exploding the
 * recipe for whatever is left over. Returns a tree node for the UI and
 * writes totals into `acc`.
 */
function explode(item, qty, pool, acc, ctx, seen, via) {
	const node = { item, need: qty, fromStock: 0, toCraft: 0, missing: 0, via, children: [] };

	const held = pool[item] || 0;
	const take = Math.min(held, qty);
	if (take > 0) {
		pool[item] = held - take;
		node.fromStock = take;
		bump(acc.reserved, item, take);
		(acc.reservedBy[item] || (acc.reservedBy[item] = [])).push({
			targetId: ctx.targetId,
			targetItem: ctx.targetItem,
			qty: take,
			via
		});
	}

	const outstanding = qty - take;
	if (outstanding <= 0) return node;

	const recipe = recipeFor(item, ctx.strategy, ctx.recipes);

	// `seen` guards a recipe that (directly or indirectly) needs itself.
	if (recipe && !seen.has(item)) {
		node.toCraft = outstanding;
		bump(acc.toCraft, item, outstanding);
		const deeper = new Set(seen).add(item);
		for (const [ingredient, per] of Object.entries(recipe)) {
			node.children.push(
				explode(ingredient, per * outstanding, pool, acc, ctx, deeper, item)
			);
		}
	} else {
		node.missing = outstanding;
		bump(acc.missing, item, outstanding);
	}

	return node;
}

/**
 * Total raw units a build needs from scratch, ignoring everything you own.
 * Used as the denominator for progress so the figure doesn't move around
 * as stock changes.
 */
export function totalUnits(item, qty, strategy = {}, recipes = defaultRecipes, seen = new Set()) {
	const recipe = recipeFor(item, strategy, recipes);
	if (!recipe || seen.has(item)) return qty;
	const deeper = new Set(seen).add(item);
	let sum = 0;
	for (const [ingredient, per] of Object.entries(recipe)) {
		sum += totalUnits(ingredient, per * qty, strategy, recipes, deeper);
	}
	return sum;
}

/**
 * Plan every active target against one shared pool.
 *
 * @param {object}   opts
 * @param {object}   opts.stock     item -> owned quantity
 * @param {Array}    opts.targets   [{id, item, qty, active}] in priority order
 * @param {object}   opts.strategy  item -> 'craft' | 'buy'
 * @param {object}   [opts.recipes]
 */
export function plan({ stock = {}, targets = [], strategy = {}, recipes = defaultRecipes } = {}) {
	const pool = { ...stock };
	const acc = { reserved: {}, reservedBy: {}, toCraft: {}, missing: {} };
	const results = [];

	for (const target of targets) {
		if (target.active === false) continue;

		const before = { missing: { ...acc.missing } };
		const ctx = {
			targetId: target.id,
			targetItem: target.item,
			strategy,
			recipes
		};
		const tree = explode(target.item, target.qty, pool, acc, ctx, new Set(), null);

		// How much of this target's requirement is still unmet.
		let missingUnits = 0;
		for (const [item, qty] of Object.entries(acc.missing)) {
			missingUnits += qty - (before.missing[item] || 0);
		}
		const total = totalUnits(target.item, target.qty, strategy, recipes);
		const progress = total > 0 ? Math.max(0, Math.min(100, ((total - missingUnits) / total) * 100)) : 100;

		results.push({
			id: target.id,
			item: target.item,
			qty: target.qty,
			tree,
			totalUnits: total,
			missingUnits,
			progress,
			complete: missingUnits === 0
		});
	}

	const free = {};
	for (const [item, qty] of Object.entries(stock)) {
		const left = qty - (acc.reserved[item] || 0);
		if (left > 0) free[item] = left;
	}

	return {
		targets: results,
		reserved: acc.reserved,
		reservedBy: acc.reservedBy,
		toCraft: acc.toCraft,
		missing: acc.missing,
		free,
		leftover: pool
	};
}

/**
 * Plan a single item as if it were the only thing being built.
 * Used by the per-ship view so selecting a ship still works on its own.
 */
export function planOne(item, qty, stock = {}, strategy = {}, recipes = defaultRecipes) {
	return plan({
		stock,
		targets: [{ id: '_one', item, qty, active: true }],
		strategy,
		recipes
	});
}

/* ------------------------------------------------------------------ *
 * Crafting
 * ------------------------------------------------------------------ */

/** How many of `item` you could make right now from what is on hand. */
export function maxCraftable(item, stock = {}, recipes = defaultRecipes) {
	const recipe = recipes[item];
	if (!recipe) return 0;
	let best = Infinity;
	for (const [ingredient, per] of Object.entries(recipe)) {
		if (per <= 0) continue;
		best = Math.min(best, Math.floor((stock[ingredient] || 0) / per));
		if (best === 0) return 0;
	}
	return Number.isFinite(best) ? best : 0;
}

/** The stock movement one craft would cause: ingredients out, product in. */
export function craftDelta(item, times = 1, recipes = defaultRecipes) {
	const recipe = recipes[item];
	if (!recipe || times < 1) return null;
	const delta = { [item]: times };
	for (const [ingredient, per] of Object.entries(recipe)) {
		delta[ingredient] = (delta[ingredient] || 0) - per * times;
	}
	return delta;
}

/**
 * Everything you could make this second that something actually wants.
 * `wanted` is the planner's `toCraft` map.
 */
export function craftableNow(stock = {}, wanted = {}, recipes = defaultRecipes) {
	const out = [];
	for (const item of Object.keys(wanted)) {
		const possible = maxCraftable(item, stock, recipes);
		if (possible > 0) {
			out.push({ item, possible, wanted: wanted[item], suggested: Math.min(possible, wanted[item]) });
		}
	}
	return out.sort((a, b) => b.suggested - a.suggested);
}

/* ------------------------------------------------------------------ *
 * Enhancement
 * ------------------------------------------------------------------ */

const ENHANCED = /^\+(\d+)\s+(.*)$/;

/** Split "+7 Foo" into its level and base name. */
export function parseEnhanced(item) {
	const m = ENHANCED.exec(item);
	return m ? { level: Number(m[1]), base: m[2] } : { level: 0, base: item };
}

export function enhancedName(base, level) {
	return level > 0 ? `+${level} ${base}` : base;
}

/**
 * What one enhancement attempt costs.
 *
 * Ship parts never lose a level on failure, so a failed attempt spends
 * the stones and nothing else -- which is why success and failure need
 * separate deltas.
 */
export function enhanceStep(base, toLevel, recipes = defaultRecipes) {
	const target = enhancedName(base, toLevel);
	const recipe = recipes[target];
	if (!recipe) return null;

	const from = enhancedName(base, toLevel - 1);
	const stones = {};
	for (const [ingredient, per] of Object.entries(recipe)) {
		if (ingredient !== from) stones[ingredient] = per;
	}

	const onSuccess = { [target]: 1, [from]: -1 };
	for (const [item, per] of Object.entries(stones)) onSuccess[item] = -per;

	const onFailure = {};
	for (const [item, per] of Object.entries(stones)) onFailure[item] = -per;

	return { from, to: target, stones, onSuccess, onFailure };
}

/** The highest level of `base` currently owned, or 0. */
export function ownedLevel(base, stock = {}) {
	for (let level = 10; level >= 1; level--) {
		if ((stock[enhancedName(base, level)] || 0) > 0) return level;
	}
	return 0;
}

/* ------------------------------------------------------------------ *
 * Shopping
 * ------------------------------------------------------------------ */

/**
 * Group what you are short of by how it is actually obtained.
 *
 * @param {object} missing   item -> quantity short
 * @param {object} sources   lookup functions supplied by the caller so the
 *                           planner stays free of data-file imports
 */
export function shoppingList(missing, sources = {}) {
	const {
		coins = {},
		silver = {},
		acquisition = {},
		barter = null
	} = sources;

	const groups = new Map();
	const add = (key, entry) => {
		if (!groups.has(key)) groups.set(key, { key, items: [], coins: 0, silver: 0 });
		const g = groups.get(key);
		g.items.push(entry);
		g.coins += entry.coins || 0;
		g.silver += entry.silver || 0;
	};

	for (const [item, qty] of Object.entries(missing)) {
		if (qty <= 0) continue;
		const entry = { item, qty };

		if (coins[item]) {
			entry.coins = coins[item] * qty;
			entry.unit = `${coins[item].toLocaleString()} coins each`;
			add('Crow Coins', entry);
			continue;
		}
		if (silver[item]) {
			entry.silver = silver[item] * qty;
			entry.unit = `${silver[item].toLocaleString()} silver each`;
			add('Falasi (silver)', entry);
			continue;
		}
		// A curated source is more specific than "it is barterable", so it
		// decides the group; barter detail rides along in the same entry.
		const trade = barter ? barter(item) : null;
		if (trade) entry.barter = trade;

		const methods = acquisition[item];
		if (methods) {
			const key = Object.keys(methods)[0] || 'Other';
			entry.detail = (methods[key] || []).join(', ');
			add(key, entry);
			continue;
		}
		if (trade) {
			add('Barter', entry);
			continue;
		}
		add('Other', entry);
	}

	return [...groups.values()].sort((a, b) => b.items.length - a.items.length);
}

/** Items blocking the most builds, worst first. */
export function bottlenecks(planResult, limit = 5) {
	const blocking = new Map();
	for (const target of planResult.targets) {
		const walk = node => {
			if (node.missing > 0) {
				const rec = blocking.get(node.item) || { item: node.item, qty: 0, targets: new Set() };
				rec.qty += node.missing;
				rec.targets.add(target.item);
				blocking.set(node.item, rec);
			}
			node.children.forEach(walk);
		};
		walk(target.tree);
	}
	return [...blocking.values()]
		.map(r => ({ item: r.item, qty: r.qty, targets: [...r.targets] }))
		.sort((a, b) => b.targets.length - a.targets.length || b.qty - a.qty)
		.slice(0, limit);
}

/** Flatten a requirement tree to the leaves you have to obtain yourself. */
export function leaves(node, out = {}) {
	if (!node.children.length) {
		bump(out, node.item, node.need);
	} else {
		node.children.forEach(child => leaves(child, out));
	}
	return out;
}
