// One pool, honoured by the bench.
//
// The planner reserves stock for builds in priority order; the Workshop,
// the Plan's "craftable now" and the item's detail all ask whether a
// craft can be made. They used to ask against the whole of stock, so a
// material the top build had claimed was offered to the second build's
// craft -- the one promise the README leads with, broken on the bench.
// Now a craft is checked against the free remainder plus what the plan
// set aside as that craft's own ingredients.
//
// The second half pins the Plan and the Workshop to one figure: a
// failstack carried into a yellow attempt prices that attempt in both.

import test from 'node:test';
import assert from 'node:assert/strict';

import { plan, craftableNow, stockForCrafting, maxCraftable, expectedAttempts } from '../js/planner.js';
import { recipes } from '../js/recipes.js';

const PRIO = 'Delicately Polished Support';   // needs Violent Sea Monster's Bone + Starlight Hardener
const NEXT = 'Sturdy Coral Support';          // needs Lyngbakr's Bone + Starlight Hardener + Starlight Emulsifier
const targets = [
	{ id: 'a', item: PRIO, qty: 1, active: true },
	{ id: 'b', item: NEXT, qty: 1, active: true }
];

test('the recipes this test leans on still share the hardener', () => {
	assert.equal(recipes[PRIO]['Starlight Hardener'], 1);
	assert.equal(recipes[NEXT]['Starlight Hardener'], 1);
});

test('a material the top build reserved is not on the bench for the second', () => {
	const stock = { 'Starlight Hardener': 1, "Lyngbakr's Bone": 1, 'Starlight Emulsifier': 1 };
	const planned = plan({ stock, targets, strategy: {} });
	assert.equal(planned.reserved['Starlight Hardener'], 1);
	assert.equal(planned.free['Starlight Hardener'], undefined, 'nothing of it is free');

	// Against the whole of stock the craft looks possible; against what
	// may actually be spent it is not.
	assert.equal(maxCraftable(NEXT, stock, recipes), 1);
	const bench = stockForCrafting(NEXT, stock, planned);
	assert.equal(bench['Starlight Hardener'], undefined);
	assert.equal(maxCraftable(NEXT, bench, recipes), 0);
	assert.deepEqual(craftableNow(stock, planned.toCraft, recipes, planned), []);
});

test('the plan\'s own earmark for a craft stays on the bench for that craft', () => {
	const stock = { 'Starlight Hardener': 2, "Lyngbakr's Bone": 1, 'Starlight Emulsifier': 1 };
	const planned = plan({ stock, targets, strategy: {} });
	// Both hardeners are reserved -- one for each build -- but the
	// second was set aside *via* the Sturdy Coral Support, which is what
	// crafting it spends.
	assert.equal(planned.reserved['Starlight Hardener'], 2);
	const bench = stockForCrafting(NEXT, stock, planned);
	assert.equal(bench['Starlight Hardener'], 1);
	assert.equal(bench["Lyngbakr's Bone"], 1);
	const ready = craftableNow(stock, planned.toCraft, recipes, planned);
	assert.deepEqual(ready.map(c => c.item), [NEXT]);
	assert.equal(ready[0].possible, 1);
	// And the top build's hardener is still not there for it.
	assert.equal(stockForCrafting(PRIO, stock, planned)['Starlight Hardener'], 1);
});

test('without a plan to consult the whole of stock is the bench, as before', () => {
	const stock = { 'Starlight Hardener': 1 };
	assert.deepEqual(stockForCrafting(NEXT, stock, null), stock);
	assert.deepEqual(stockForCrafting(NEXT, stock, {}), stock);
});

const YELLOW = "Epheria Carrack: Advance (Falasi's Cannon)";

test('a carried failstack prices the next attempt the way the Workshop does', () => {
	// The quoted rate is the table's; a much higher stack lifts the
	// chance, so fewer attempts -- and fewer stones -- are expected.
	const quoted = expectedAttempts(YELLOW, 4);
	const stacked = expectedAttempts(YELLOW, 4, 200);
	assert.ok(stacked < quoted, `${stacked} < ${quoted}`);
	assert.equal(expectedAttempts(YELLOW, 4, null), quoted);

	// In the plan: holding +4, going for +5, with the stack carried for
	// that very attempt. The stones scale by the stacked figure.
	const stock = { [`+4 ${YELLOW}`]: 1 };
	const target = [{ id: 'y', item: `+5 ${YELLOW}`, qty: 1, active: true }];
	const plain = plan({ stock, targets: target, strategy: {} });
	const carried = plan({ stock, targets: target, strategy: {}, failstacks: { [YELLOW]: { level: 5, stack: 200 } } });
	// The stone has a recipe of its own, so it lands in toCraft rather
	// than missing; the Cron Stones alongside it are bought, so missing.
	const stones = p => (p.toCraft['Sunset Tidal Black Stone'] || 0) + (p.missing['Cron Stone'] || 0);
	assert.ok(stones(plain) > 0);
	assert.ok(stones(carried) < stones(plain), `${stones(carried)} < ${stones(plain)}`);

	// A stack recorded for another level is not this attempt's.
	const elsewhere = plan({ stock, targets: target, strategy: {}, failstacks: { [YELLOW]: { level: 7, stack: 200 } } });
	assert.equal(stones(elsewhere), stones(plain));
});
