// Undo and redo, as a pair.
//
// The store runs happily outside a browser -- persistence is
// best-effort behind try/catch -- so the semantics can be tested where
// they live. What matters is the pairing: redo restores exactly what
// undo removed, the two can trade one change indefinitely, and a new
// change forfeits the redo rather than replaying it on top of the
// wrong present.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../js/state.js';

test('redo puts back what undo took away', () => {
	store.setStock('Steel', 10);
	store.setStock('Steel', 25);

	assert.ok(store.undo());
	assert.equal(store.getStock('Steel'), 10);
	assert.ok(store.canRedo());

	assert.ok(store.redo());
	assert.equal(store.getStock('Steel'), 25);
	assert.equal(store.canRedo(), false);
});

test('the same change can be traded back and forth indefinitely', () => {
	store.setStock('Pine Plywood', 700);
	for (let round = 0; round < 3; round++) {
		store.undo();
		assert.equal(store.getStock('Pine Plywood'), 0, `round ${round}: undo`);
		store.redo();
		assert.equal(store.getStock('Pine Plywood'), 700, `round ${round}: redo`);
	}
});

test('a new change forfeits the redo', () => {
	store.setStock('Flax Fabric', 100);
	store.undo();
	assert.ok(store.canRedo());

	// History forked: redoing the 100 now would land on top of the 5.
	store.setStock('Flax Fabric', 5);
	assert.equal(store.canRedo(), false);
	assert.equal(store.redo(), null);
	assert.equal(store.getStock('Flax Fabric'), 5);
});

test('targets come back whole, and the redo is itself undoable', () => {
	const before = store.getTargets().length;
	store.addTarget('Epheria Caravel', 1);
	assert.equal(store.getTargets().length, before + 1);

	store.undo();
	assert.equal(store.getTargets().length, before);

	store.redo();
	assert.equal(store.getTargets().length, before + 1);
	assert.equal(store.getTargets().at(-1).item, 'Epheria Caravel');

	// The redo went back onto the history like any other change.
	store.undo();
	assert.equal(store.getTargets().length, before);
});

test('an empty stack answers null, not an accident', () => {
	while (store.canUndo()) store.undo();
	while (store.canRedo()) store.redo();
	while (store.canUndo()) store.undo();
	assert.equal(store.undo(), null);
	assert.equal(store.redo() === null || store.canRedo(), true);
});
