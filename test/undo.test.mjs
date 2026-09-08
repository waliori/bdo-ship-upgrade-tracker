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

test('a stock change and a profile change made together come back together', () => {
	store.adopt({ stock: { 'Cron Stone': 10 }, targets: [], strategy: {}, profile: {} });
	store.applyDelta({ 'Cron Stone': -3 }, 'enhance', 'Failed attempt', { failstacks: { Part: 31 } });
	assert.equal(store.getStock('Cron Stone'), 7);
	assert.deepEqual(store.getProfile('failstacks'), { Part: 31 });

	assert.equal(store.undo(), 'Failed attempt');
	assert.equal(store.getStock('Cron Stone'), 10);
	assert.equal(store.getProfile('failstacks'), null);

	assert.ok(store.redo());
	assert.equal(store.getStock('Cron Stone'), 7);
	assert.deepEqual(store.getProfile('failstacks'), { Part: 31 });
});

test('several profile fields written as one change are one undo', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { crewShip: 'Epheria Sailboat', vouchers: 2 } });
	store.setProfileMany({ crewShip: 'Epheria Caravel', vouchers: 5, barterCount: 40 }, 'Sailed a setup');
	assert.equal(store.getProfile('crewShip'), 'Epheria Caravel');
	assert.equal(store.getProfile('barterCount'), 40);
	assert.equal(store.lastChange().label, 'Sailed a setup');

	assert.equal(store.undo(), 'Sailed a setup');
	assert.equal(store.getProfile('crewShip'), 'Epheria Sailboat');
	assert.equal(store.getProfile('vouchers'), 2);
	assert.equal(store.getProfile('barterCount'), null);
	// Nothing to change is nothing to undo.
	assert.equal(store.setProfileMany({ crewShip: 'Epheria Sailboat' }), null);
});

test('the undo label says what changed, not "your barter profile" for everything', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: {} });
	store.setProfile('roster', [{ id: 'r1', type: 'Ambitious', name: 'Kit', lv: 1, cond: 100 }]);
	assert.equal(store.lastChange().label, 'Changed the roster');
	store.setProfile('crewShip', 'Epheria Caravel');
	assert.equal(store.lastChange().label, 'Changed the ship you sail');
	store.setProfile('barterCount', 12);
	assert.equal(store.lastChange().label, 'Changed your barter count');
	store.setProfile('barterCount', 13, 'Counted a trade');
	assert.equal(store.lastChange().label, 'Counted a trade');
});

test('what is typed while looking around a shared plan goes back with the rest', () => {
	store.adopt({ stock: { Steel: 1 }, targets: [], strategy: {}, profile: { barterCount: 40 } });
	const kept = store.capture();
	store.applyTransient(JSON.stringify({ stock: { Plank: 5 }, targets: [], strategy: {}, profile: { barterCount: 7 } }));
	assert.equal(store.getProfile('barterCount'), 7, 'the shared plan\'s own profile is what is looked at');
	store.setProfile('barterCount', 999);
	store.setProfile('vouchers', 3);
	assert.equal(store.getProfile('barterCount'), 999);

	assert.ok(store.restore(kept));
	assert.equal(store.getProfile('barterCount'), 40);
	assert.equal(store.getProfile('vouchers'), null);
	assert.equal(store.getStock('Steel'), 1);
	assert.equal(store.getStock('Plank'), 0);
});

test('a count past any warehouse is held at the cap, not Infinity', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: {} });
	store.setStock('Steel', Infinity);
	assert.equal(store.getStock('Steel'), store.STOCK_CAP);
	assert.ok(Number.isFinite(store.getStock('Steel')));
});

test('undo takes back the claim, not the favourite starred after it', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: {} });
	store.claimQuest('q1', { 'Cron Stone': 2 }, '2026-09-06', 'Claimed a quest');
	// The app notes something by itself afterwards -- no history entry.
	store.setProfileQuiet('questFavs', ['q7']);
	assert.deepEqual(store.getProfile('questFavs'), ['q7']);
	assert.equal(store.undo(), 'Claimed a quest');
	assert.equal(store.getStock('Cron Stone'), 0);
	assert.equal(store.getProfile('questsDone'), null, 'the claim is gone');
	assert.deepEqual(store.getProfile('questFavs'), ['q7'], 'the quiet write is not');
	assert.ok(store.redo());
	assert.deepEqual(store.getProfile('questsDone'), { q1: '2026-09-06' });
	assert.equal(store.getStock('Cron Stone'), 2);
	assert.deepEqual(store.getProfile('questFavs'), ['q7']);
});

test('a history entry holds only the profile fields the change touched', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { barterCount: 5, roster: [{ id: 'r1', type: 'Ambitious' }] } });
	store.setProfile('vouchers', 3);
	const entry = store.lastChange();
	assert.ok(!('prevProfile' in entry), 'no whole copy');
	assert.deepEqual(entry.prevProfileFields, { vouchers: null }, 'the field was absent before');
	store.setProfile('barterCount', 6);
	assert.deepEqual(store.lastChange().prevProfileFields, { barterCount: 5 });
	store.undo();
	store.undo();
	assert.equal(store.getProfile('vouchers'), null);
	assert.equal(store.getProfile('barterCount'), 5);
	assert.equal(store.getProfile('roster').length, 1, 'an untouched field is untouched');
});
