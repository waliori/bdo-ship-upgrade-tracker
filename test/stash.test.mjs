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
import { placeableAboard, forgetSaid, cappedAboard, cappedOwn, refusedSaid, overSaid, holdSlotsUsed, hullSlots } from '../js/hold-room.js';

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

test('a stop written into the hold comes off the ship first, and the hold as it cast off can still be read', () => {
	const W = 'Maple Plywood';
	store.setStock(W, 0);
	store.setStock(Q, 0);
	store.addStock(W, 30, null, 'Iliya Island');
	store.moveStash(W, 'Iliya Island', store.ABOARD, 10);
	// The stop: ten plywood handed over, one [Level 5] received.
	const into = (item, d) => (item === W || d < 0 ? store.ABOARD : false);
	store.applyTrip({ delta: { [W]: -10, [Q]: 1 }, at: into, label: 'Traded' });
	assert.equal(store.stockAt(W, store.ABOARD), 0, 'off the ship, not off Iliya');
	assert.equal(store.stockAt(W, 'Iliya Island'), 20);
	assert.equal(store.getStock(Q), 1);
	const was = store.readingAsWas({ delta: { [W]: -10, [Q]: 1 }, moves: [] }, () => [store.stockAt(W, store.ABOARD), store.getStock(Q), store.stockAt(W, 'Iliya Island')]);
	assert.deepEqual(was, [10, 0, 20], 'read as it cast off');
	assert.equal(store.stockAt(W, store.ABOARD), 0, 'and nothing was written');
	// Unticked: the plywood goes back onto the ship.
	store.applyTrip({ delta: { [W]: 10, [Q]: -1 }, at: into, label: 'Unticked' });
	assert.equal(store.stockAt(W, store.ABOARD), 10);
	assert.equal(store.getStock(Q), 0);
	store.setStock(W, 0);
});

// The hold's slots are enforced where goods go aboard by hand, and only
// flagged where what is written already happened (owner, 2026-10-01).
// A Volante has twenty slots; a [Level 5] takes one each.
const S1 = "[Level 5] Statue's Tear", S2 = '[Level 5] Azure Quartz', S3 = '[Level 5] Luxury Patterned Fabric', L2 = '[Level 2] Fine Leather Shoes';
const onVolante = () => {
	store.setHome('goods', '');
	store.removeItems(Object.keys(store.getAllStock()), 'clear');
	store.setProfile('crewShip', 'Carrack (Volante)');
	assert.equal(hullSlots(), 20);
};

test('the Inventory moves to the ship only what the hold has slots for, and says what stayed', () => {
	onVolante();
	store.addStock(S1, 18, null, false);           // 18 slots aboard
	store.setStockAt(S2, 'Iliya Island', 5);         // would take 5 more
	store.setStockAt(L2, 'Velia', 40);               // a stack: one slot
	const { items, refused } = placeableAboard([S2, L2]);
	assert.deepEqual(items, [L2], 'the stack fits in one slot; the five [Level 5]s do not');
	assert.deepEqual(refused.left, [[S2, 5]]);
	assert.equal(refused.free, 2);
	store.placeAll(items, '');
	assert.equal(store.stockAt(S2, 'Iliya Island'), 5, 'what did not fit stays where it was');
	assert.equal(holdSlotsUsed(), 19);
	assert.match(refusedSaid(refused), /2 of its 20 slots free/);
	assert.match(refusedSaid(refused), /Azure Quartz/);
	// A place forgotten hands its count to the ship: refused past the slots.
	assert.match(forgetSaid(S2, 'Iliya Island'), /did not go aboard/);
	store.setStockAt(S3, 'Velia', 1);
	assert.equal(forgetSaid(S3, 'Velia'), '', 'one fits the slot left');
	// A count typed at the ship's hold is held to the free slots.
	const capped = cappedAboard(S3, store.ABOARD, 4);
	assert.equal(capped.n, 1);
	assert.match(capped.said, /3× .*Luxury Patterned Fabric/);
	assert.deepEqual(cappedAboard(S3, 'Velia', 9), { n: 9, said: '' }, 'a storage is never capped');
	store.setProfile('crewShip', null);
});

test('a trade recorded, or a hull swapped for a smaller one, keeps every good and shows the hold over', () => {
	onVolante();
	store.addStock(S1, 20, null, false);
	// A recorded stop: what happened in the game is written as it is.
	store.applyTrip({ delta: { [S2]: 3 }, at: () => store.ABOARD, label: 'Traded' });
	assert.equal(store.stockAt(S2, store.ABOARD), 3, 'nothing dropped');
	assert.equal(holdSlotsUsed(), 23);
	assert.match(overSaid(), /take 23 slots and this hull has 20/);
	// Twenty-five slots on a bigger hull: nothing to say.
	store.setProfile('crewShip', 'Carrack (Advance)');
	assert.ok(hullSlots() >= 23);
	assert.equal(overSaid(), '');
	store.setProfile('crewShip', null);
});

test('the item card\'s + and a typed total land a trade good on the ship only into its free slots', () => {
	onVolante();
	store.addStock(S1, 19, null, false);            // 19 of 20 slots
	// The card's +10 on a [Level 5] whose home is the ship: one fits.
	const up = cappedOwn(S2, store.getStock(S2) + 10);
	assert.equal(up.n, 1);
	assert.match(up.said, /9× .*Azure Quartz did not go aboard/);
	store.setStock(S2, up.n);
	assert.equal(holdSlotsUsed(), 20);
	// A typed total past the slots is held at what is there; down is never held.
	assert.equal(cappedOwn(S1, 25).n, 19);
	assert.deepEqual(cappedOwn(S1, 5), { n: 5, said: '' });
	// A stack already aboard takes no new slot; a home ashore is never capped.
	assert.equal(cappedOwn('[Level 3] Ancient Orders', 50).n, 0, 'a new stack finds no slot in a full hold');
	store.setStock(S2, 0);
	store.addStock(L2, 1, null, false);              // the last slot, a stack
	assert.equal(cappedOwn(L2, 999).n, 999, 'more of a stack aboard takes no new slot');
	store.setHome('goods', 'Velia');
	assert.deepEqual(cappedOwn(S3, 7), { n: 7, said: '' }, 'lands at Velia, not aboard');
	store.setHome('goods', '');
	store.setProfile('crewShip', null);
});
