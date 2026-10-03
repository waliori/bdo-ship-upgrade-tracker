// The one loading thread: waits stack, and every one of them ends --
// on an answer, on an error, and when ended twice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loading, whileLoading, isLoading, loadingNote, LOADING_DELAY } from '../js/loading.js';

test('a wait ends on its answer and on its error alike', async () => {
	assert.equal(isLoading(), false);
	const got = await whileLoading(Promise.resolve(7), 'x');
	assert.equal(got, 7);
	assert.equal(isLoading(), false, 'an answer ends it');
	await assert.rejects(whileLoading(() => Promise.reject(new Error('no')), 'x'), /no/);
	assert.equal(isLoading(), false, 'an error ends it too, and is passed on');
	await assert.rejects(whileLoading(() => { throw new Error('at once'); }, 'x'), /at once/);
	assert.equal(isLoading(), false, 'so does one thrown before any promise');
});

test('waits stack, and ending one twice ends it once', () => {
	const a = loading('a');
	const b = loading('b');
	a();
	a();
	assert.equal(isLoading(), true, 'b is still out');
	b();
	assert.equal(isLoading(), false);
});

test('a drawn wait shows nothing before the delay, and says so once when asked', () => {
	assert.ok(LOADING_DELAY >= 100 && LOADING_DELAY <= 300, 'about 150 ms');
	assert.match(loadingNote('Fetching'), /class="loading-note" role="status">Fetching</);
	assert.doesNotMatch(loadingNote('Fetching', { status: false }), /role=/);
});
