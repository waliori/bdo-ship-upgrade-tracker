// Where things are: the storages, the homes new counts land at, the
// group moves, the ship's hold, and a trip applied as one change.
//
// What can go wrong: a count taken off the ship coming off a pile at a
// harbour instead, places that add up to more than the total, a home
// that catches an import, a move that invents goods, a trip whose
// deposits and sales disagree with its stock.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../js/state.js';
import { kindOf } from '../js/kinds.js';

const Q = '[Level 5] Azure Quartz';
const F = '[Level 5] Luxury Patterned Fabric';
// The places with a count: an emptied place stays noted until it is
// forgotten, and these tests are about the counts.
const placed = item => Object.fromEntries(Object.entries((store.getProfile('stash', {}) || {})[item] || {}).filter(([, n]) => n > 0));

store.useKinds(kindOf);

test('a count that grows lands at the kind\'s home; one that shrinks comes off the bags first', () => {
	store.setHome('goods', 'Iliya Island');
	store.setStock(Q, 0);
	store.addStock(Q, 5);
	assert.deepEqual(placed(Q), { 'Iliya Island': 5 });
	assert.equal(store.stockAt(Q, ''), 0);
	store.addStock(Q, 3, null, false);           // three more, aboard
	assert.equal(store.stockAt(Q, ''), 3);
	store.addStock(Q, -1, null, false);          // one fewer aboard: off the ship, not off Iliya
	assert.equal(store.stockAt(Q, ''), 2);
	assert.deepEqual(placed(Q), { 'Iliya Island': 5 });
	store.addStock(Q, -4);                       // four fewer, from nowhere in particular: the bags first, then the biggest pile
	assert.equal(store.getStock(Q), 3);
	assert.deepEqual(placed(Q), { 'Iliya Island': 3 });
	store.setHome('goods', '');
});

test('a plain material has no home unless one is set, and an import lands nowhere', () => {
	store.setStock('Steel', 0);
	store.addStock('Steel', 4);
	assert.deepEqual(placed('Steel'), {});
	store.setHome('materials', 'Velia');
	store.addStock('Steel', 2);
	assert.deepEqual(placed('Steel'), { Velia: 2 });
	store.replaceStock({ Steel: 10 });
	assert.equal(store.getStock('Steel'), 10);
	assert.deepEqual(placed('Steel'), { Velia: 2 }, 'a replaced stock does not land at the home');
	store.setHome('materials', '');
});

test('several items moved to one storage as one change, and back in one Undo', () => {
	store.setStock(Q, 0);
	store.placeAll([Q], '');
	store.setStock(Q, 5);
	store.setStock(F, 12);
	store.placeAll([Q, F, 'Nothing Owned'], 'Iliya Island');
	assert.deepEqual(placed(Q), { 'Iliya Island': 5 });
	assert.deepEqual(placed(F), { 'Iliya Island': 12 });
	assert.ok(store.undo());
	assert.deepEqual(placed(Q), {});
	assert.deepEqual(placed(F), {});
	store.redo();
	store.placeAll([Q], '');
	assert.deepEqual(placed(Q), {});
	assert.equal(store.getStock(Q), 5, 'a move never changes the total');
});

test('a move between places never invents goods', () => {
	store.setStock(Q, 5);
	store.placeAll([Q], 'Iliya Island');
	store.moveStash(Q, 'Iliya Island', '', 3);
	assert.equal(store.stockAt(Q, ''), 3);
	assert.deepEqual(placed(Q), { 'Iliya Island': 2 });
	store.moveStash(Q, 'Iliya Island', '', 9);   // nine of two: the two move, no more
	assert.deepEqual(placed(Q), {});
	assert.equal(store.stockAt(Q, ''), 5);
	assert.equal(store.moveStash(Q, 'Iliya Island', '', 1), null, 'nothing left there to move');
});

test('a trip applies as one change: goods gone and gained, silver in, deposits noted, a load taken off the harbour', () => {
	store.setStock(Q, 5);
	store.placeAll([Q], 'Iliya Island');
	store.setStock('Silver', 0);
	store.setStock('[Level 7] Golden Eagle Brooch', 0);
	store.applyTrip({
		delta: { [Q]: -5, '[Level 6] Top-Quality Gamtu Crate': 5, '[Level 3] Old Hourglass': 2, Silver: 500000000 },
		moves: [{ item: Q, from: 'Iliya Island', to: '', n: 5 }, { item: '[Level 3] Old Hourglass', from: '', to: 'Velia', n: 2 }],
		profile: { runs: [{ day: '2026-09-04', silver: 500000000, cost: 0, trades: 10, parley: 142860, stops: 3, goal: 'silver', item: '' }] },
		label: 'a run'
	});
	assert.equal(store.getStock(Q), 0);
	assert.deepEqual(placed(Q), {});
	assert.equal(store.getStock('Silver'), 500000000);
	assert.equal(store.getStock('[Level 6] Top-Quality Gamtu Crate'), 5);
	assert.deepEqual(placed('[Level 3] Old Hourglass'), { Velia: 2 });
	assert.equal(store.getProfile('runs').length, 1);
	assert.ok(store.undo());
	assert.equal(store.getStock(Q), 5);
	assert.deepEqual(placed(Q), { 'Iliya Island': 5 });
	assert.equal(store.getStock('Silver'), 0);
	assert.equal(store.getProfile('runs', null), null);
});
