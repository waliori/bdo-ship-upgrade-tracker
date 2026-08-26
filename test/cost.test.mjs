// What things cost.
//
// The cost model's one job is to answer "what will this actually take?"
// without lying, and there are exactly three ways it could lie: quietly
// invent an exchange rate between Crow Coins and silver, quietly price a
// bartered material at zero, or quote a total the plan will not charge.
// Every test here is aimed at one of those.
//
// The numbers are read from the real data files, so a recipe or a price
// changing is allowed to change them -- what is asserted is the
// relationship between numbers, not the numbers themselves.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	costRoutes, waysToGet, remainingCost, outstanding, beats, plan
} from '../js/planner.js';
import { recipes } from '../js/recipes.js';
import { coins } from '../js/sea_coins.js';
import { falasi } from '../js/falasi_vendor.js';
import { items as vendorItems } from '../js/vendor_items.js';
import { shipDescriptions } from '../js/ships.js';

const ctx = { coins, silver: falasi, recipes, strategy: {} };
const of = (routes, kind) => routes.find(r => r.kind === kind);

test('a shop item is priced at the shop price, and nothing else', () => {
	const { routes } = waysToGet('Starlight Hardener', ctx);
	const shop = of(routes, 'coin');
	assert.ok(shop, 'Starlight Hardener is sold for Crow Coins');
	assert.equal(shop.coins, coins['Starlight Hardener']);
	assert.equal(shop.silver, 0);
	assert.equal(outstanding(shop), 0);
});

test('a craft is priced through its recipe, not stopped at the top of it', () => {
	// Delicately Polished Support is made from a bone and a Starlight
	// Hardener. The hardener has a shop price; a model that only looked
	// at the item itself would report the craft as costing nothing.
	const craft = of(waysToGet('Delicately Polished Support', ctx).routes, 'craft');
	assert.ok(craft);
	assert.equal(craft.coins, coins['Starlight Hardener']);
});

test('nothing unpriceable is quietly counted as free', () => {
	const craft = of(waysToGet('Delicately Polished Support', ctx).routes, 'craft');
	// The bone is bartered for. It has to be named, not valued at zero.
	assert.deepEqual(craft.needs, { "Violent Sea Monster's Bone": 1 });
	assert.equal(outstanding(craft), 1);
});

test('coins and silver are never added together', () => {
	// The Caravel wants a permit bought with silver and materials bought
	// with coins. Both totals must survive the walk separately.
	const craft = of(waysToGet('Epheria Caravel', ctx).routes, 'craft');
	assert.ok(craft.coins > 0, 'has a coin cost');
	assert.ok(craft.silver > 0, 'has a silver cost');
});

test('a route only wins when it beats the other on every count', () => {
	const cheaper = { coins: 100, silver: 0, needs: {} };
	const dearer = { coins: 300, silver: 0, needs: {} };
	const awkward = { coins: 0, silver: 0, needs: { "Violent Sea Monster's Scale": 2 } };

	assert.equal(beats(cheaper, dearer), true);
	assert.equal(beats(dearer, cheaper), false);
	// Free in coins but two barter runs deep: neither one is the answer.
	assert.equal(beats(awkward, cheaper), false);
	assert.equal(beats(cheaper, awkward), false);
});

test('a real trade-off is reported as a choice, not as a winner', () => {
	// Violent Wave Plywood is 300 coins in the shop, or two bartered
	// scales. Calling either of those cheaper would be inventing a price
	// for barter.
	const { routes, best } = waysToGet('Violent Wave Plywood', ctx);
	assert.equal(routes.length, 2);
	assert.equal(best, null);
});

test('pricing follows the craft-or-buy choice the player made', () => {
	const item = "Epheria Carrack: Advance (Chiro's Sail)";
	const per = recipes[item]['Violent Wave Plywood'];

	const crafting = of(waysToGet(item, ctx).routes, 'craft');
	const buying = of(waysToGet(item, {
		...ctx, strategy: { 'Violent Wave Plywood': 'buy' }
	}).routes, 'craft');

	// Buying the plywood instead of making it costs its shop price, and
	// takes its ingredients off the list of things to go and find.
	assert.equal(buying.coins - crafting.coins, coins['Violent Wave Plywood'] * per);
	assert.ok(outstanding(buying) < outstanding(crafting));
});

test('what is left to pay falls as stock is recorded', () => {
	const targets = [{ id: '1', item: 'Violent Wave Plywood', qty: 10, active: true }];
	const scale = "Violent Sea Monster's Scale";

	const cold = remainingCost(plan({ stock: {}, targets }).targets[0].tree, ctx);
	const warm = remainingCost(plan({ stock: { [scale]: 4 }, targets }).targets[0].tree, ctx);

	assert.equal(cold.needs[scale], 10);
	assert.equal(warm.needs[scale], 6);
});

test('what is left to pay is only what the plan could not cover', () => {
	const targets = [{ id: '1', item: 'Violent Wave Plywood', qty: 3, active: true }];
	const done = remainingCost(plan({
		stock: { "Violent Sea Monster's Scale": 3, "Saltwater Crocodile's Scale": 3 },
		targets
	}).targets[0].tree, ctx);

	assert.equal(done.coins, 0);
	assert.equal(done.silver, 0);
	assert.equal(outstanding(done), 0);
});

test('a recipe that needs itself is priced, not hung on', () => {
	const looped = {
		'Ouroboros': { 'Tail': 1 },
		'Tail': { 'Ouroboros': 1, 'Starlight Hardener': 2 }
	};
	const routes = costRoutes('Ouroboros', { coins, silver: falasi, recipes: looped });
	const craft = of(routes, 'craft');
	assert.ok(craft, 'the cycle still yields a priced route');
	assert.equal(craft.coins, coins['Starlight Hardener'] * 2);
	// The second lap round the loop is where it stops, and says so.
	assert.equal(craft.needs['Ouroboros'], 1);
});

test('an enhancement is priced by attempts, not by one lucky try', () => {
	// A +3 part costs more than the +2 it comes from plus a single
	// attempt's stones, because most attempts fail.
	const two = of(waysToGet('+2 Epheria Carrack: Toro Sail', ctx).routes, 'enhance');
	const three = of(waysToGet('+3 Epheria Carrack: Toro Sail', ctx).routes, 'enhance');
	const oneTry = recipes['+3 Epheria Carrack: Toro Sail']['Tidal Black Stone']
		* coins['Tidal Black Stone'];

	assert.ok(three.coins > two.coins + oneTry, 'failed attempts are paid for too');
});

test('every item the app can name links somewhere, and shows something', async () => {
	// Both halves come from the icon mapping: the picture beside a name
	// and the link under it. An item added to a data file without an
	// entry there renders a broken image and a name with nowhere to go,
	// and nothing else in the app would complain.
	const fs = await import('node:fs/promises');
	const map = JSON.parse(await fs.readFile(new URL('../icon_mapping.json', import.meta.url), 'utf8'));

	const named = new Set([
		...Object.keys(coins),
		...Object.keys(falasi),
		...Object.keys(vendorItems),
		...Object.keys(shipDescriptions)
	]);
	for (const [product, recipe] of Object.entries(recipes)) {
		named.add(product);
		for (const ingredient of Object.keys(recipe)) named.add(ingredient);
	}

	// Enhancement levels share their base item's page.
	const bases = [...new Set([...named].map(name => name.replace(/^\+\d+\s+/, '')))];
	assert.deepEqual(bases.filter(name => !(map[name] && map[name].url)), [], 'items with no BDOCodex link');

	const icons = new Set(await fs.readdir(new URL('../icons/', import.meta.url)));
	const broken = Object.entries(map)
		.filter(([, entry]) => entry.icon && !icons.has(entry.icon))
		.map(([name]) => name);
	assert.deepEqual(broken, [], 'items whose icon file is missing');
});
