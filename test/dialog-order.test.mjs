// Who gets the first moment of a load.
//
// Two things can want it at once: the release notes, which a new
// version shows once and then marks read, and the sync's "two copies of
// your inventory", which arrives whenever the server answers. A dialog
// opened over another replaces it, so the notes used to flash up and
// vanish -- and being marked read, they were gone for good.
//
// What can go wrong: a question that opens over the notes, a question
// that never opens at all because nothing released the screen, and a
// release that fires the waiting question twice.

import test from 'node:test';
import assert from 'node:assert/strict';

import { holdScreen, whenScreenFree } from '../js/dialogs.js';

test('a question raised while the screen is held waits, and is asked when it is let go', () => {
	const asked = [];
	const free = holdScreen();
	whenScreenFree(() => asked.push('two copies'));
	assert.deepEqual(asked, [], 'the notes are still up: nothing over them');
	free();
	assert.deepEqual(asked, ['two copies'], 'and the moment they close, the question is asked');
});

test('with nothing holding the screen a question is asked at once', () => {
	const asked = [];
	whenScreenFree(() => asked.push('now'));
	assert.deepEqual(asked, ['now']);
});

test('letting go twice asks the question once', () => {
	const asked = [];
	const free = holdScreen();
	whenScreenFree(() => asked.push('two copies'));
	free();
	free();
	assert.deepEqual(asked, ['two copies']);
});

test('two holds mean two lettings-go before anything is asked', () => {
	const asked = [];
	const a = holdScreen();
	const b = holdScreen();
	whenScreenFree(() => asked.push('two copies'));
	a();
	assert.deepEqual(asked, [], 'one of the two has let go');
	b();
	assert.deepEqual(asked, ['two copies']);
});

test('a waiter that throws does not take the next one down with it', () => {
	const asked = [];
	const free = holdScreen();
	whenScreenFree(() => { throw new Error('the first one is broken'); });
	whenScreenFree(() => asked.push('the second'));
	free();
	assert.deepEqual(asked, ['the second']);
});
