// Several saves on one browser, and none of them moving the main one.

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
	store: new Map(),
	getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
	setItem(k, v) { this.store.set(k, String(v)); },
	removeItem(k) { this.store.delete(k); }
};
const { keyFor } = await import('../js/state.js');
const { listProfiles, createProfile, deleteProfile, slugify, PROFILE_MAX } = await import('../js/profiles.js');

test('the main profile keeps the key the app always used', () => {
	assert.equal(keyFor(''), 'bdo-tracker/v2');
	assert.equal(keyFor('alt'), 'bdo-tracker/v2@alt');
	assert.equal(listProfiles()[0].slug, '');
});

test('a new profile gets its own key, empty or copied, and a unique slug', () => {
	localStorage.setItem('bdo-tracker/v2', '{"v":2,"stock":{"Silver":5}}');
	const a = createProfile('My Alt');
	assert.equal(a, 'my-alt');
	assert.equal(localStorage.getItem(keyFor(a)), null, 'empty by default');
	const b = createProfile('My Alt', { copy: true });
	assert.equal(b, 'my-alt-2');
	assert.equal(localStorage.getItem(keyFor(b)), localStorage.getItem('bdo-tracker/v2'));
	assert.deepEqual(listProfiles().map(p => p.name), ['Main', 'My Alt', 'My Alt']);
	assert.ok(deleteProfile(b));
	assert.equal(localStorage.getItem(keyFor(b)), null);
	assert.equal(listProfiles().length, 2);
	assert.equal(deleteProfile(''), false, 'the main one cannot be deleted');
});

test('there is a ceiling, and a slug is always something', () => {
	while (listProfiles().length < PROFILE_MAX) assert.ok(createProfile('x' + listProfiles().length));
	assert.equal(createProfile('one too many'), null);
	assert.equal(slugify('!!!'), 'profile');
	assert.equal(slugify("Naru's Carrack plan, 2026"), 'naru-s-carrack-plan-2026');
});
