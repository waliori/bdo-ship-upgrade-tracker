// The barter profile, and the people already using the app.
//
// A barter count and a Value Pack tick are facts about the player, so
// they belong in the save rather than in this browser's preferences --
// re-typing a barter count on a phone is exactly what sync exists to
// avoid. But the field was added to a shape that people already have
// open, and there are two ways that goes wrong:
//
//   * A save written before the field existed no longer matches the one
//     this browser would write, so the first load after the update asks
//     every signed-in player to resolve a conflict that is not real.
//   * A device that has not reloaded pushes the old three fields, the
//     new code reads the missing fourth as "cleared", and a barter count
//     is wiped off every other device.
//
// Everything here is aimed at one of those two.

import test from 'node:test';
import assert from 'node:assert/strict';

// state.js writes through localStorage and only touches `window` inside
// init(), which nothing here calls. A stub keeps the writes quiet.
globalThis.localStorage = {
	store: new Map(),
	getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
	setItem(k, v) { this.store.set(k, String(v)); },
	removeItem(k) { this.store.delete(k); },
	get length() { return this.store.size; },
	key(i) { return [...this.store.keys()][i] ?? null; }
};

const store = await import('../js/state.js');

const SAVE = {
	stock: { 'Tidal Black Stone': 400 },
	targets: [{ id: 't1', item: 'Panokseon', qty: 1, active: true, note: '' }],
	strategy: {}
};

/** Back to a known, profile-free save between tests. */
function reset() {
	store.adopt({ ...SAVE, profile: {} }, 'reset');
}

/* ------------------------------------------------------------------ *
 * invisible until it is used
 * ------------------------------------------------------------------ */

test('a save with no profile set looks exactly as it always did', () => {
	reset();
	const shape = store.saveShape();
	assert.deepEqual(Object.keys(shape), ['stock', 'targets', 'strategy']);
	assert.ok(!('profile' in shape));
});

test('the profile appears only once there is something in it', () => {
	reset();
	store.setProfile('barterCount', 2000);
	assert.deepEqual(store.saveShape().profile, { barterCount: 2000 });

	// And setting it back to nothing takes it out again, so a player who
	// tries the field and clears it goes back to the old shape rather
	// than carrying an empty object around forever.
	store.setProfile('barterCount', 0);
	assert.ok(!('profile' in store.saveShape()));
});

/* ------------------------------------------------------------------ *
 * the older device
 * ------------------------------------------------------------------ */

test('a save from before the field leaves the profile alone', () => {
	// This is the one that matters. A phone that has not been reloaded
	// still pushes three fields; reading that as "cleared" would wipe a
	// barter count the desktop just set.
	reset();
	store.setProfile('barterCount', 2000);
	store.setProfile('valuePack', true);

	store.adopt({ ...SAVE, stock: { Silver: 5 } }, 'from an older device');

	assert.equal(store.getProfile('barterCount'), 2000);
	assert.equal(store.getProfile('valuePack'), true);
	assert.equal(store.getStock('Silver'), 5, 'the rest of the save still lands');
});

test('an empty profile is a deliberate clear, and is obeyed', () => {
	reset();
	store.setProfile('barterCount', 2000);
	store.adopt({ ...SAVE, profile: {} }, 'cleared elsewhere');
	assert.equal(store.getProfile('barterCount', 0), 0);
});

test('a profile that is there is taken', () => {
	reset();
	store.setProfile('barterCount', 10);
	store.adopt({ ...SAVE, profile: { barterCount: 7000, valuePack: true } }, 'from the desktop');
	assert.equal(store.getProfile('barterCount'), 7000);
	assert.equal(store.getProfile('valuePack'), true);
});

/* ------------------------------------------------------------------ *
 * what may be in it
 * ------------------------------------------------------------------ */

test('only the two known keys survive a round trip', () => {
	reset();
	store.adopt({ ...SAVE, profile: { barterCount: 5, valuePack: true, mischief: 'yes' } }, 'x');
	assert.deepEqual(store.saveShape().profile, { barterCount: 5, valuePack: true });
});

test('a barter count is a whole number that cannot go negative', () => {
	reset();
	store.adopt({ ...SAVE, profile: { barterCount: -40 } }, 'x');
	assert.equal(store.getProfile('barterCount', 0), 0);

	store.adopt({ ...SAVE, profile: { barterCount: 12.7 } }, 'x');
	assert.equal(store.getProfile('barterCount'), 12);

	store.adopt({ ...SAVE, profile: { barterCount: 'lots' } }, 'x');
	assert.equal(store.getProfile('barterCount', 0), 0);
});

test('a Value Pack is on or it is absent, never anything else', () => {
	reset();
	store.adopt({ ...SAVE, profile: { valuePack: 'true' } }, 'x');
	assert.equal(store.getProfile('valuePack', false), false);
});

test('a profile that is not an object is ignored, not thrown on', () => {
	for (const bad of [[], 'yes', 3, null]) {
		reset();
		store.setProfile('barterCount', 40);
		store.adopt({ ...SAVE, profile: bad }, 'x');
		// null and the non-objects are not a profile, so they cannot be a
		// clear either -- the count stands.
		assert.equal(store.getProfile('barterCount'), 40, `profile ${JSON.stringify(bad)}`);
	}
});

/* ------------------------------------------------------------------ *
 * the rest of the app
 * ------------------------------------------------------------------ */

test('the profile is exported with the save', () => {
	reset();
	store.setProfile('barterCount', 2000);
	const out = JSON.parse(store.exportJSON());
	assert.deepEqual(out.profile, { barterCount: 2000 });
	assert.ok(out.stock, 'and the export still carries everything else');
});

test('a file exported before the field imports without clearing it', () => {
	reset();
	store.setProfile('barterCount', 2000);
	store.importJSON(JSON.stringify({ v: 2, ...SAVE }));
	assert.equal(store.getProfile('barterCount'), 2000);
});

test('changing the profile can be undone', () => {
	reset();
	store.setProfile('barterCount', 2000);
	store.setProfile('barterCount', 3000);
	store.undo();
	assert.equal(store.getProfile('barterCount'), 2000);
});
