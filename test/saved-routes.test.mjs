// Routes kept by name keep their places; the previous route has its own.

import test from 'node:test';
import assert from 'node:assert/strict';
import { keepNamed, replaceAt, splitPrevious, SAVED_MAX, PREVIOUS } from '../js/saved-routes.js';

const r = (name, n = 1) => ({ name, stops: Array.from({ length: n }, (_, i) => i + 1) });
const eight = Array.from({ length: SAVED_MAX }, (_, i) => r(`route ${i + 1}`));

test('a new name goes in at the top while there is room, and the same name replaces itself', () => {
	const one = keepNamed([], r('coral'));
	assert.equal(one.full, false);
	assert.deepEqual(one.list.map(x => x.name), ['coral']);
	const two = keepNamed(one.list, r('pearl'));
	assert.deepEqual(two.list.map(x => x.name), ['pearl', 'coral']);
	const again = keepNamed(two.list, r('coral', 5));
	assert.deepEqual(again.list.map(x => x.name), ['coral', 'pearl']);
	assert.equal(again.list[0].stops.length, 5);
});

test('a ninth name is refused rather than evicting the eighth silently', () => {
	const full = keepNamed(eight, r('ninth'));
	assert.equal(full.full, true);
	assert.equal(full.list, eight);
	// The same eight names still save over themselves when full.
	const same = keepNamed(eight, r('route 8', 3));
	assert.equal(same.full, false);
	assert.equal(same.list.length, SAVED_MAX);
	assert.equal(same.list[0].name, 'route 8');
});

test('the player chooses which one makes room', () => {
	const out = replaceAt(eight, 2, r('ninth'));
	assert.equal(out.length, SAVED_MAX);
	assert.equal(out[0].name, 'ninth');
	assert.ok(!out.some(x => x.name === 'route 3'));
	assert.ok(out.some(x => x.name === 'route 8'));
});

test('an old list with the previous route among the named ones is taken apart', () => {
	const old = [r(PREVIOUS), ...eight.slice(0, 3)];
	const { routes, previous } = splitPrevious(old);
	assert.equal(previous.name, PREVIOUS);
	assert.deepEqual(routes.map(x => x.name), ['route 1', 'route 2', 'route 3']);
	assert.equal(splitPrevious(eight).previous, null);
});
