// The sea monsters' trophies, and what they process into.
//
// A Usable Pirate Ship's Remains chops into a Deep Tide-Dyed
// Standardized Timber Square, a Khan's Tendon dries into ten Moon Vein
// Flax Fabric. Both are in the recipe book now, and both are unlike the
// rest of it in two ways the planner has to get right: the plan does
// not follow them unless asked (the Crow Coin Shop is how those
// materials are really got), and one of them makes ten at a time.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	plan, buying, yieldOf, maxCraftable, craftDelta, craftableNow, totalUnits, waysToGet, resolveRoutes
} from '../js/planner.js';
import { recipes, yields, buyFirst, routes } from '../js/recipes.js';
import { coins } from '../js/sea_coins.js';

const SQUARE = 'Deep Tide-Dyed Standardized Timber Square';
const REMAINS = "Usable Pirate Ship's Remains";
const FABRIC = 'Moon Vein Flax Fabric';
const TENDON = "Khan's Tendon";
const ARTIFACT = "Cox Pirates' Artifact (Combat)";

test('the trophy recipes this test leans on are in the book', () => {
	assert.deepEqual(recipes[SQUARE], { [REMAINS]: 1 });
	assert.deepEqual(recipes[FABRIC], { [TENDON]: 1 });
	assert.equal(yields[FABRIC], 10);
	assert.ok(buyFirst.has(SQUARE) && buyFirst.has(FABRIC) && buyFirst.has(ARTIFACT));
	assert.ok(coins[SQUARE] > 0, 'the shop still sells the square');
});

test('every buy-first item has a recipe and something to buy it with', () => {
	for (const item of buyFirst) {
		assert.ok(recipes[item], `${item} has a recipe`);
		assert.ok(coins[item] > 0, `${item} is sold for Crow Coins`);
	}
});

test('a buy-first material is left to buy, not exploded into its trophy', () => {
	const planned = plan({ stock: {}, targets: [{ id: 'a', item: SQUARE, qty: 144, active: true }], strategy: {} });
	assert.equal(planned.missing[SQUARE], 144);
	assert.equal(planned.missing[REMAINS], undefined);
	assert.equal(buying(SQUARE, {}), true);
	assert.equal(buying('Violent Wave Plywood', {}), false, 'an ordinary recipe is still crafted by default');
});

test('"craft it" turns the trophy recipe on, and "buy" turns an ordinary one off', () => {
	const crafted = plan({ stock: {}, targets: [{ id: 'a', item: SQUARE, qty: 3, active: true }], strategy: { [SQUARE]: 'craft' } });
	assert.equal(crafted.missing[REMAINS], 3);
	assert.equal(crafted.toCraft[SQUARE], 3);
	assert.equal(buying('Violent Wave Plywood', { 'Violent Wave Plywood': 'buy' }), true);
});

test('a trophy in stock is used before the shop is charged', () => {
	// Holding the remains with the recipe switched on: nothing to buy.
	const planned = plan({ stock: { [REMAINS]: 5 }, targets: [{ id: 'a', item: SQUARE, qty: 3, active: true }], strategy: { [SQUARE]: 'craft' } });
	assert.equal(planned.missing[SQUARE], undefined);
	assert.equal(planned.missing[REMAINS], undefined);
	assert.equal(planned.reserved[REMAINS], 3);
});

test('a recipe that makes ten is planned in whole crafts', () => {
	assert.equal(yieldOf(FABRIC), 10);
	assert.equal(yieldOf(SQUARE), 1);
	// 23 fabric is three tendons, not 2.3 and not 23.
	const planned = plan({ stock: {}, targets: [{ id: 'a', item: FABRIC, qty: 23, active: true }], strategy: { [FABRIC]: 'craft' } });
	assert.equal(planned.missing[TENDON], 3);
	assert.equal(totalUnits(FABRIC, 23, { [FABRIC]: 'craft' }), 3);
});

test('the bench counts crafts, and one craft puts ten in stock', () => {
	const stock = { [TENDON]: 2 };
	assert.equal(maxCraftable(FABRIC, stock, recipes), 2);
	assert.deepEqual(craftDelta(FABRIC, 1, recipes), { [FABRIC]: 10, [TENDON]: -1 });
	// Wanting 23 fabric is three crafts, and only two can be run.
	const [ready] = craftableNow(stock, { [FABRIC]: 23 }, recipes);
	assert.equal(ready.possible, 2);
	assert.equal(ready.suggested, 2);
	assert.equal(ready.makes, 10);
	// Wanting eight is one craft, even with tendons to spare.
	assert.equal(craftableNow(stock, { [FABRIC]: 8 }, recipes)[0].suggested, 1);
});

test('one unit is priced at a tenth of the tendon', () => {
	const ctx = { coins, silver: {}, recipes, strategy: {} };
	const craft = waysToGet(FABRIC, ctx).routes.find(r => r.kind === 'craft');
	assert.ok(craft);
	assert.equal(craft.makes, 10);
	assert.equal(craft.coins, coins[TENDON] / 10);
	assert.equal(craft.parts[0].qty, 1, 'the part is listed per craft');
});

test('the artifact has two recipes, and the seals are the one the plan follows unasked', () => {
	assert.deepEqual(Object.keys(routes[ARTIFACT]), ['seals', 'cannons']);
	assert.equal(resolveRoutes({})[ARTIFACT], recipes[ARTIFACT]);
	assert.deepEqual(resolveRoutes({ [ARTIFACT]: 'cannons' })[ARTIFACT], { "Cox Pirates' Broken Cannon": 10 });
	// Picking a route is a way of saying "craft it".
	const planned = plan({ stock: {}, targets: [{ id: 'a', item: ARTIFACT, qty: 2, active: true }], strategy: { [ARTIFACT]: 'cannons' } });
	assert.equal(planned.missing["Cox Pirates' Broken Cannon"], 20);
});
