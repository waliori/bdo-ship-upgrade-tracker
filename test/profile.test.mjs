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
import { readProfile } from '../js/profile-shape.js';

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

test('the crew tick and the parley you hold survive the whitelist', () => {
	// Both arrived after the whitelist did, and the whitelist eats what
	// it does not know: the symptom was a checkbox that refused to stay
	// ticked, because every render read the profile back.
	store.setProfile('crew', true);
	store.setProfile('parleyHeld', 850000);
	assert.equal(store.getProfile('crew', false), true);
	assert.equal(store.getProfile('parleyHeld', 0), 850000);
	assert.deepEqual(store.saveShape().profile, { crew: true, parleyHeld: 850000 });
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

test('the quests done list keeps period stamps and drops junk', () => {
	store.adopt({ ...SAVE, profile: { questsDone: {
		'omg-candidum': '2026-08-30', 'khan': 'W2026-08-27', 'ravinia-1': 'once',
		'bad-1': 'yesterday', 'bad-2': 42, ['x'.repeat(41)]: '2026-08-30'
	} } });
	assert.deepEqual(store.getProfile('questsDone'), {
		'omg-candidum': '2026-08-30', 'khan': 'W2026-08-27', 'ravinia-1': 'once'
	});
});

test('claiming a quest is one undo for the stock and the tick together', () => {
	store.adopt({ ...SAVE, profile: {} });
	store.claimQuest('omg-candidum', { 'Crow Coin': 100, 'Tidal Black Stone': 14 }, '2026-08-30', 'Claimed');
	assert.equal(store.getStock('Crow Coin'), 100);
	assert.equal(store.getStock('Tidal Black Stone'), 414);
	assert.equal(store.getProfile('questsDone')['omg-candidum'], '2026-08-30');
	store.undo();
	assert.equal(store.getStock('Crow Coin'), 0);
	assert.equal(store.getStock('Tidal Black Stone'), 400);
	assert.equal(store.getProfile('questsDone'), null);
	// A new stamp sits beside the others; an untick removes only its own.
	store.adopt({ ...SAVE, profile: { questsDone: { 'omg-nineshark': '2026-08-29', 'ravinia-1': 'once' } } });
	store.claimQuest('omg-candidum', {}, '2026-08-30', 'Claimed');
	assert.deepEqual(store.getProfile('questsDone'), { 'omg-nineshark': '2026-08-29', 'ravinia-1': 'once', 'omg-candidum': '2026-08-30' });
	store.unclaimQuest('omg-candidum');
	assert.deepEqual(store.getProfile('questsDone'), { 'omg-nineshark': '2026-08-29', 'ravinia-1': 'once' });
	assert.equal(store.unclaimQuest('never-ticked'), null);
});

test('where an item is kept adds up to the count owned', () => {
	store.adopt({ ...SAVE, profile: { stash: {
		'Tidal Black Stone': { Velia: 300, 'Port Epheria': 100, Nowhere: 0, ['x'.repeat(41)]: 5 },
		['y'.repeat(81)]: { Velia: 1 },
		'Black Stone': 'Velia'
	} } });
	assert.deepEqual(store.getProfile('stash'), { 'Tidal Black Stone': { Velia: 300, 'Port Epheria': 100, Nowhere: 0 } }, 'an empty place is kept until forgotten');
	assert.equal(store.getStock('Tidal Black Stone'), 400);
	// Noting forty more on the ship raises the total by forty.
	store.setStash('Tidal Black Stone', "Ship's hold", 40);
	assert.equal(store.getStock('Tidal Black Stone'), 440);
	// Typing a lower count at Velia lowers the total by the difference.
	store.setStash('Tidal Black Stone', 'Velia', 250);
	assert.equal(store.getStock('Tidal Black Stone'), 390);
	// Forgetting a place hands its count to the bags: the total holds.
	store.setStash('Tidal Black Stone', 'Port Epheria', null);
	assert.equal(store.getStock('Tidal Black Stone'), 390);
	assert.equal(store.getProfile('stash')['Tidal Black Stone']['Port Epheria'], undefined);
	// Typing the total lower than the places comes off the places, largest first.
	store.setStock('Tidal Black Stone', 100);
	assert.deepEqual(store.getProfile('stash')['Tidal Black Stone'], { Velia: 60, "Ship's hold": 40, Nowhere: 0 });
	store.undo();
	assert.equal(store.getStock('Tidal Black Stone'), 390);
	assert.equal(store.getProfile('stash')['Tidal Black Stone'].Velia, 250, 'the places come back with the count');
});


test('a sailor keeps a level log of thirty steps at most, each a time, a level and the stats typed then', () => {
	const log = Array.from({ length: 40 }, (_, i) => ({ t: 1000 + i, level: (i % 10) + 1, stats: { speed: 1.5, bogus: 9 } }));
	const shaped = readProfile({ roster: [{ id: 's1', type: 'Innocent', lv: 4, log: [...log, { t: 'x', level: 3 }, { t: 5, level: 99 }] }] });
	const kept = shaped.roster[0].log;
	assert.equal(kept.length, 30);
	assert.deepEqual(kept[kept.length - 1], { t: 1039, level: 10, stats: { speed: 1.5 } });
	assert.equal(readProfile({ roster: [{ id: 's1', type: 'Innocent', lv: 4, log: 'no' }] }).roster[0].log, undefined);
});
