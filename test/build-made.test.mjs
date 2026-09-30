// A build made is a build done.
//
// Crafting a build's own item used to leave the build standing: the item
// went into the inventory, the plan covered the build from it, and the
// card read "Ready" exactly as it had before the craft. The made item
// has to stay in the inventory -- the Ship tab reads the fleet and the
// fitted parts from it -- so the build keeps count of what it has made,
// the plan sets those aside, and a build made in full is closed.

import test from 'node:test';
import assert from 'node:assert/strict';

import { plan } from '../js/planner.js';
import * as store from '../js/state.js';

const SHIP = 'Epheria Sailboat';

test('a made one is set aside, so the rest of the build is still planned', () => {
	const r = plan({ stock: { [SHIP]: 1 }, targets: [{ id: 'a', item: SHIP, qty: 2, made: 1 }] }).targets[0];
	assert.equal(r.tree.need, 1, 'only the one still to make is asked for');
	assert.equal(r.tree.fromStock, 0, 'the made one does not cover it');
	assert.equal(r.tree.toCraft, 1);
	assert.equal(Math.round(r.progress), 50, 'the made one counts as done in the progress');
});

test('a made one no longer held sets nothing aside', () => {
	const r = plan({ stock: {}, targets: [{ id: 'a', item: SHIP, qty: 2, made: 1 }] }).targets[0];
	assert.equal(r.tree.need, 1);
	assert.equal(Math.round(r.progress), 50);
});

test('the made one is held for its build, not handed to another', () => {
	const p = plan({
		stock: { [SHIP]: 1 },
		targets: [{ id: 'a', item: SHIP, qty: 2, made: 1 }, { id: 'b', item: SHIP, qty: 1 }]
	});
	assert.equal(p.targets[1].tree.fromStock, 0);
	assert.equal(p.free[SHIP], undefined);
});

test('marking made counts up, closes in full, keeps the stock, and undoes', () => {
	store.setStock(SHIP, 1);
	const t = store.addTarget(SHIP, 2);
	store.markTargetMade(t.id, 1);
	assert.equal(store.getTarget(t.id).made, 1);
	assert.equal(store.getTarget(t.id).qty, 2);

	// The stepper cannot go below what is made.
	store.setTargetQty(t.id, 1);
	assert.equal(store.getTarget(t.id).qty, 2);

	store.markTargetMade(t.id, 1);
	assert.equal(store.getTarget(t.id), null, 'made in full, the build is closed');
	assert.equal(store.getStock(SHIP), 1, 'and what it made stays in the inventory');

	store.undo();
	assert.equal(store.getTarget(t.id).made, 1);
	store.removeTarget(t.id);
});

test('a save keeps what a build has made, and never a whole build of it', () => {
	store.adopt({ stock: {}, targets: [
		{ id: 'a', item: SHIP, qty: 3, made: 2 },
		{ id: 'b', item: SHIP, qty: 2, made: 5 },
		{ id: 'c', item: SHIP, qty: 1 }
	] });
	assert.deepEqual(store.getTargets().map(t => t.made), [2, 1, undefined]);
});
