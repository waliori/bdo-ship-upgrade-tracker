// Requirement planning over a shared inventory.
//
// Nothing here is stored. Given what you own and what you are building,
// these functions work out what is reserved, what is still to craft and
// what you are short of. Targets are processed in priority order against
// one draining pool, so the same physical material is never promised to
// two builds at once.

import { T } from './i18n.js';
import { recipes as defaultRecipes, routes, yields, buyFirst } from './recipes.js';
import { tableFor, chanceAt } from './enhancement.js';

/** Recipes an item can be made from, honouring a "I'll just buy this" choice. */
/**
 * The recipe book with each branching upgrade resolved to the route the
 * user picked.
 *
 * Doing it once, here, is what keeps every other function honest: plan,
 * craftDelta, maxCraftable and the rest all take a recipe map, so once
 * the map says "this Caravel comes from an Improved Sailboat" they all
 * agree without any of them having to know that routes exist.
 *
 * Returns the untouched book when nothing has been chosen, so the common
 * case allocates nothing.
 */
export function resolveRoutes(strategy = {}, recipes = defaultRecipes) {
	let out = null;
	for (const [item, variants] of Object.entries(routes)) {
		const picked = variants[strategy[item]];
		if (!picked || picked === recipes[item]) continue;
		out = out || { ...recipes };
		out[item] = picked;
	}
	return out || recipes;
}

/** Which route is in force for an item -- the first is the default. */
export function routeOf(item, strategy = {}) {
	const variants = routes[item];
	if (!variants) return null;
	const names = Object.keys(variants);
	return names.includes(strategy[item]) ? strategy[item] : names[0];
}

/**
 * Whether the plan buys `item` rather than crafting it.
 *
 * The player's own choice when they have made one; otherwise the
 * catalogue's default, which is to craft anything with a recipe except
 * the few whose recipe is a side door (`buyFirst` in recipes.js).
 */
export function buying(item, strategy = {}) {
	const mode = strategy[item];
	return mode ? mode === 'buy' : buyFirst.has(item);
}

/** How many one craft of `item` makes: one, for all but a few. */
export const yieldOf = item => yields[item] || 1;

function recipeFor(item, strategy, recipes) {
	if (buying(item, strategy)) return null;
	return recipes[item] || null;
}

/**
 * Expected attempts to get one success at `level` of `base`, given that a
 * full Agris meter guarantees the try after `agris` failures. 1 when the
 * step cannot fail, or when we have no table for the part.
 */
function triesAtLevel(step, failstack = null) {
	if (!step) return 1;
	const chance = chanceAt(step, failstack);
	if (chance >= 1) return 1;
	const cap = step.agris ?? 0;
	let tries = 0;
	let stillFailing = 1;
	for (let k = 1; k <= cap; k++) {
		tries += k * chance * stillFailing;
		stillFailing *= 1 - chance;
	}
	return tries + (cap + 1) * stillFailing;
}

/**
 * Attempts to get one success at `level` of `base`.
 *
 * This is the level-held case throughout: every tier below the yellow
 * gear holds its level on a failure by the game's own rules, and the
 * yellow tier holds it because the Cron Stones that do so are part of
 * its recipe. `unprotectedAttempts` is what skipping them would cost.
 */
export function expectedAttempts(base, level, failstack = null) {
	const table = tableFor(base);
	const step = table && table.levels[level];
	if (!step || step.chance >= 1) return 1;
	return triesAtLevel(step, failstack);
}

/**
 * What one level costs on gear that falls back when an attempt fails.
 *
 * Yellow ship gear is the first tier where a failure takes a level, so
 * the attempts at a level are no longer the whole story: each failure
 * also costs the climb back up to it. Writing a(i) for the attempts
 * spent at level i and C(i) for everything advancing from i to i+1
 * takes,
 *
 *     C(i) = a(i) + (a(i) - 1) * C(i - 1)
 *
 * -- a(i) attempts here, and each of the a(i) - 1 failures drops you a
 * level that then has to be re-climbed at its own full cost. C(0) is
 * just a(0), since +0 has nowhere to fall to.
 *
 * The Agris meter belongs to the step, not to the visit: it is only
 * spent when that step succeeds, so a level drop leaves it where it was
 * and it is still there when you climb back. That is why a(i) is counted
 * once here rather than once per visit -- the total attempts at a step
 * stay capped at agris + 1 however many times you fall past it. The
 * level below is the part that gets done again, and its own meter was
 * reset by the success that brought you up.
 *
 * The result is not a plan, it is the argument for Cron Stones: it runs
 * to tens of millions of stones by +10.
 *
 * Returns null for gear that holds its level, which has no such cost.
 */
export function unprotectedAttempts(base, to = 10) {
	const table = tableFor(base);
	if (!table || table.keepsLevel !== false) return null;
	let tries = 0;
	let total = 0;
	for (let i = 0; i < to; i++) {
		const step = table.levels[i];
		if (!step) break;
		const each = triesAtLevel(step);
		tries = i === 0 ? each : each + (each - 1) * tries;
		total += tries;
	}
	return total;
}


/**
 * How much of `ingredient` a single craft of `product` really consumes.
 *
 * For everything but enhancement this is the recipe quantity. An
 * enhancement recipe describes one attempt, and most attempts fail --
 * the part carries over but the stones are gone -- so the stones are
 * scaled by how many attempts that level is expected to take. The part
 * being enhanced is not scaled: you only ever need the one.
 */
function perCraft(product, ingredient, quantity, failstacks = null) {
	const made = parseEnhanced(product);
	if (made.level === 0) return quantity;
	if (parseEnhanced(ingredient).base === made.base) return quantity;
	// The stack the player carries prices the one attempt it is for --
	// the next level on that part -- so the Plan quotes the same
	// figure the Workshop's forecast does. Every level past it is
	// priced at its quoted stack, as the forecast prices them.
	const held = failstacks && failstacks[made.base];
	const stack = held && held.level === made.level ? held.stack : null;
	return quantity * expectedAttempts(made.base, made.level - 1, stack);
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
		// Whole crafts: nine fabric short is still one tendon dried.
		const crafts = Math.ceil(outstanding / yieldOf(item));
		for (const [ingredient, per] of Object.entries(recipe)) {
			const need = Math.ceil(perCraft(item, ingredient, per, ctx.failstacks) * crafts);
			node.children.push(
				explode(ingredient, need, pool, acc, ctx, deeper, item)
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
	const crafts = Math.ceil(qty / yieldOf(item));
	let sum = 0;
	for (const [ingredient, per] of Object.entries(recipe)) {
		const need = Math.ceil(perCraft(item, ingredient, per) * crafts);
		sum += totalUnits(ingredient, need, strategy, recipes, deeper);
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
 * @param {object}   [opts.failstacks]  base -> { level, stack }: the stack
 *                   carried into the next attempt on that part, so the
 *                   stones are scaled the way the Workshop scales them
 */
export function plan({ stock = {}, targets = [], strategy = {}, recipes = defaultRecipes, failstacks = null } = {}) {
	// Resolved once, up front, so no caller can forget to -- an upgrade
	// with two routes has to explode down the one that was chosen.
	recipes = resolveRoutes(strategy, recipes);
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
			recipes,
			failstacks
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

/** How many crafts of `item` you could run right now from what is on
 *  hand -- crafts, not units: see `yieldOf`. */
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

/** The stock movement `times` crafts would cause: ingredients out,
 *  product in -- ten in, for a recipe that makes ten. */
export function craftDelta(item, times = 1, recipes = defaultRecipes) {
	const recipe = recipes[item];
	if (!recipe || times < 1) return null;
	const delta = { [item]: times * yieldOf(item) };
	for (const [ingredient, per] of Object.entries(recipe)) {
		delta[ingredient] = (delta[ingredient] || 0) - per * times;
	}
	return delta;
}

/**
 * What may be spent crafting `item`: the stock nothing has claimed, plus
 * whatever the plan earmarked as this very item's ingredients.
 *
 * Reservations are the whole point of one shared pool -- a plank held
 * for the top build is not there to be turned into something for the
 * second -- so a craft is checked against the free remainder, not the
 * total. The one exception is the material the plan itself set aside
 * *for this craft*: it is reserved "via" the item, and making the item
 * is exactly what that reservation was for.
 */
export function stockForCrafting(item, stock = {}, planned = null) {
	if (!planned || !planned.reservedBy) return stock;
	const out = {};
	for (const [ing, qty] of Object.entries(stock)) {
		let held = qty;
		for (const h of planned.reservedBy[ing] || []) if (h.via !== item) held -= h.qty;
		if (held > 0) out[ing] = held;
	}
	return out;
}

/**
 * Everything you could make this second that something actually wants.
 * `wanted` is the planner's `toCraft` map, in units; `possible` and
 * `suggested` are crafts, which is what the Workshop records, and
 * `makes` says how many units each one is.
 * With the plan itself passed as `planned`, reserved stock is not
 * counted as available.
 */
export function craftableNow(stock = {}, wanted = {}, recipes = defaultRecipes, planned = null) {
	const out = [];
	for (const item of Object.keys(wanted)) {
		const possible = maxCraftable(item, stockForCrafting(item, stock, planned), recipes);
		if (possible > 0) {
			const makes = yieldOf(item);
			const crafts = Math.ceil(wanted[item] / makes);
			out.push({ item, possible, wanted: wanted[item], suggested: Math.min(possible, crafts), makes });
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
 * Blue and green ship parts hold their level on a failure, so failing
 * spends the stones and nothing else. The yellow tier falls a level
 * unless Cron Stones held it -- the recipe prices the Crons in, so
 * `onFailure` is the held outcome, and `onFailureDropped` is the same
 * attempt made without them: no Crons spent, and the part a level
 * poorer. Which of the two happened is the player's to record.
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

	const step = { from, to: target, stones, onSuccess, onFailure };

	const table = tableFor(base);
	if (table && table.keepsLevel === false && stones['Cron Stone'] && toLevel >= 2) {
		const dropped = {};
		for (const [item, per] of Object.entries(stones)) {
			if (item !== 'Cron Stone') dropped[item] = -per;
		}
		dropped[from] = -1;
		dropped[enhancedName(base, toLevel - 2)] = 1;
		step.onFailureDropped = dropped;
	}

	return step;
}

/**
 * What taking `base` from one level to another really costs.
 *
 * The recipes describe one successful attempt per level, which is the
 * floor, not the forecast: a Chiro part succeeds 0.5% of the time at +9.
 * Agris Essence is what makes this answerable -- each failure stores one,
 * and when the meter is full the next attempt cannot fail, so there is a
 * genuine worst case rather than an open-ended tail.
 *
 * Returns null for parts with no table, and for the older gear that
 * succeeds every time (where the recipe already tells the whole truth).
 */
export function enhancementForecast(base, from = 0, to = 10, failstack = null) {
	const table = tableFor(base);
	if (!table) return null;

	const steps = [];
	let minimum = 0;
	let expected = 0;
	let ceiling = 0;
	let perfect = 0;
	let durability = 0;
	let certain = true;

	for (let level = from; level < to; level++) {
		const step = table.levels[level];
		if (!step) break;
		// The stack in hand is for the next attempt only: a success resets
		// it, so every level after the first is priced at its own quoted
		// stack, and the tiers that ignore stacks return their rate as is.
		const chance = chanceAt(step, level === from ? failstack : null);
		if (chance < 1) certain = false;

		// Expected attempts when the (agris + 1)-th try is guaranteed.
		const cap = step.agris ?? 0;
		let tries = 0;
		let stillFailing = 1;
		for (let k = 1; k <= cap; k++) {
			tries += k * chance * stillFailing;
			stillFailing *= 1 - chance;
		}
		tries += (cap + 1) * stillFailing;
		const worst = cap + 1;

		minimum += step.stones;
		expected += step.stones * tries;
		ceiling += step.stones * worst;
		perfect += step.perfect || 0;
		durability += step.durability * cap;

		steps.push({
			level,
			chance,
			agris: cap,
			stones: step.stones,
			attempts: tries,
			expected: step.stones * tries,
			ceiling: step.stones * worst,
			perfect: step.perfect
		});
	}

	if (!steps.length || certain) return null;

	return {
		material: table.material,
		label: table.label,
		steps,
		minimum,
		expected: Math.round(expected),
		ceiling,
		perfect: perfect || null,
		// Durability is priced at the pity cap, not the mean: `expected`
		// says what the stones will probably cost, these two say what the
		// hull can lose at the very worst. Mixing the two in one sentence
		// would overstate the likely bill.
		durabilityCeiling: durability,
		repairsCeiling: Math.ceil(durability / 100)
	};
}

/** The highest level of `base` currently owned, or 0. */
export function ownedLevel(base, stock = {}) {
	for (let level = 10; level >= 1; level--) {
		if ((stock[enhancedName(base, level)] || 0) > 0) return level;
	}
	return 0;
}

/* ------------------------------------------------------------------ *
 * What things cost
 * ------------------------------------------------------------------ */

/**
 * A cost is a vector, never a single number.
 *
 * Crow Coins and silver do not convert into one another at any rate the
 * game publishes, and plenty of materials have no price at all -- they
 * are bartered for, or they drop. So every route reports all three:
 * coins, silver, and the things you still have to go and find. Anything
 * that pretends otherwise would be inventing an exchange rate.
 */
const emptyCost = () => ({ coins: 0, silver: 0, needs: {} });

function mergeCost(into, part, times) {
	into.coins += part.coins * times;
	into.silver += part.silver * times;
	for (const [item, qty] of Object.entries(part.needs)) {
		into.needs[item] = (into.needs[item] || 0) + qty * times;
	}
}

/** How many unpriceable things a route leaves you to go and get. */
export function outstanding(cost) {
	let n = 0;
	for (const qty of Object.values(cost.needs)) n += qty;
	return n;
}

/**
 * The order used to pick a sub-ingredient's route while pricing a craft.
 *
 * Fewest things left to find wins first: a route the app can price is
 * one you can act on this evening, and one that ends in "and then barter
 * for six scales" is not. Coins, then silver, break the tie. This is a
 * default, not a judgement -- the top-level comparison shows every route
 * and only calls one of them cheaper when it beats the others outright.
 */
const rank = (a, b) =>
	outstanding(a) - outstanding(b) || a.coins - b.coins || a.silver - b.silver;

/** True when `a` costs no more than `b` on every axis, and less on one. */
export function beats(a, b) {
	const oa = outstanding(a);
	const ob = outstanding(b);
	return a.coins <= b.coins && a.silver <= b.silver && oa <= ob
		&& (a.coins < b.coins || a.silver < b.silver || oa < ob);
}

/**
 * The one route to price an ingredient by.
 *
 * It follows the player's own craft-or-buy choice, so a total quoted
 * here is a total the plan will actually charge them -- and where they
 * have expressed no choice, the default is the same one the planner
 * uses. Falls back to naming the item as something still to find, which
 * is the honest answer for anything bartered or dropped.
 */
function pickRoute(item, ctx, seen) {
	const ways = costRoutes(item, ctx, seen).sort(rank);
	if (!ways.length) return { kind: 'find', label: null, coins: 0, silver: 0, needs: { [item]: 1 } };
	const buy = buying(item, ctx.strategy);
	const shop = r => r.kind === 'coin' || r.kind === 'silver';
	return ways.find(r => shop(r) === buy) || ways[0];
}

/**
 * Every way of getting one of `item` that the data knows how to price.
 *
 * @param {string} item
 * @param {object} ctx  { coins, silver, recipes, strategy }
 */
export function costRoutes(item, ctx = {}, seen = new Set()) {
	const { coins = {}, silver = {}, recipes = defaultRecipes } = ctx;
	const out = [];

	if (coins[item] > 0) {
		out.push({ kind: 'coin', label: T('Crow Coin Shop'), coins: coins[item], silver: 0, needs: {} });
	}
	if (silver[item] > 0) {
		out.push({ kind: 'silver', label: T('Falasi vendor'), coins: 0, silver: silver[item], needs: {} });
	}

	// `seen` is a path guard, not a memo: a recipe that reached itself
	// would otherwise recurse forever.
	const recipe = seen.has(item) ? null : recipes[item];
	if (recipe) {
		const inner = new Set(seen).add(item);
		const cost = emptyCost();
		const parts = [];
		// A route prices one unit. The parts are listed per craft, which
		// is how the recipe reads, and the cost is divided by what a
		// craft makes -- a tenth of a tendon per fabric.
		const makes = yieldOf(item);
		for (const [ingredient, quantity] of Object.entries(recipe)) {
			const per = perCraft(item, ingredient, quantity);
			const one = pickRoute(ingredient, ctx, inner);
			mergeCost(cost, one, per / makes);
			parts.push({ item: ingredient, qty: per, via: one.label, cost: one });
		}
		const enhanced = parseEnhanced(item).level > 0;
		out.push({
			kind: enhanced ? 'enhance' : 'craft',
			label: enhanced ? T('Enhance it') : T('Make it'),
			coins: cost.coins,
			silver: cost.silver,
			needs: cost.needs,
			makes,
			parts
		});
	}

	return out;
}

/**
 * What is left to pay for a build.
 *
 * Every leaf of its tree that stock could not cover and a recipe could
 * not make, priced the way the plan will actually get it. So this is the
 * bill for the route the player chose, not for a cheaper one they did
 * not, and it shrinks as they record what they gather.
 */
export function remainingCost(node, ctx = {}) {
	const total = emptyCost();
	(function walk(n) {
		if (n.missing > 0) mergeCost(total, pickRoute(n.item, ctx, new Set()), n.missing);
		for (const child of n.children || []) walk(child);
	})(node);
	return total;
}

/**
 * The priced routes to an item, best first, and the one worth
 * recommending -- or null when they trade off against each other and the
 * choice is genuinely the player's.
 */
export function waysToGet(item, ctx = {}) {
	const routes = costRoutes(item, ctx).sort(rank);
	const clear = routes.length > 1 && routes.slice(1).every(other => beats(routes[0], other));
	return { routes, best: clear ? routes[0] : null };
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
		// The Market's prices, kept apart from Falasi's fixed list: they
		// are a different shop, and a moving one.
		market = {},
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

		// Whether a thing can be bartered for is asked before any of the
		// grouping, because it is not a group -- it is the other side of
		// every price below. Nine hundred Tidal Black Stones at ten coins
		// each is only a bargain next to what bartering for them costs,
		// and that comparison is the whole reason this screen exists.
		// The quantity goes with it: the question is about the shortfall
		// in front of you, not about one unit of it.
		const trade = barter ? barter(item, qty) : null;
		if (trade) entry.barter = trade;

		if (coins[item]) {
			entry.coins = coins[item] * qty;
			entry.unit = T('{n} coins each', { n: coins[item].toLocaleString() });
			add('Crow Coins', entry);
			continue;
		}
		if (silver[item]) {
			entry.silver = silver[item] * qty;
			entry.unit = T('{n} silver each', { n: silver[item].toLocaleString() });
			add('Falasi (silver)', entry);
			continue;
		}
		if (market[item]) {
			entry.silver = market[item] * qty;
			entry.unit = T('about {n} silver each, last sold', { n: market[item].toLocaleString() });
			entry.market = true;
			add('Central Market (silver)', entry);
			continue;
		}
		// A curated source is more specific than "it is barterable", so it
		// decides the group.
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

