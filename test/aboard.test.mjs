// What is aboard: the hold and the bags, never a harbour's storage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { aboardStock } from '../js/barter-plan.js';

/** A store with goods spread over the bags, the hold and two harbours. */
function fakeStore(places) {
	const ABOARD = "Ship's hold";
	const all = {};
	for (const [item, where] of Object.entries(places)) all[item] = Object.values(where).reduce((a, b) => a + b, 0);
	return {
		ABOARD,
		getAllStock: () => all,
		stockAt: (item, town) => (places[item] && places[item][town]) || 0
	};
}

test('goods in the hold and the bags count; goods ashore at a harbour do not', () => {
	const store = fakeStore({
		'[Level 5] Pearl': { '': 2, "Ship's hold": 3, Velia: 10 },
		'[Level 3] Rope': { Iliya: 4 },
		'[Level 1] Cloth': { '': 1 },
		'Tidal Black Stone': { '': 50, "Ship's hold": 2 }
	});
	assert.deepEqual(aboardStock(store), { '[Level 5] Pearl': 5, '[Level 1] Cloth': 1 });
	// A material is not a good: it weighs nothing in the hold's reckoning.
	assert.equal(aboardStock(store)['Tidal Black Stone'], undefined);
});

test('an empty store is an empty hold', () => {
	assert.deepEqual(aboardStock(fakeStore({})), {});
});
