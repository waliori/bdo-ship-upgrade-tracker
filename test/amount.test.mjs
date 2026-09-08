// What a typed number means: the locale's grouping, k/m/b, and the two
// edges that used to go wrong -- a count too large to be one, and the
// minus the trip log promises.

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAmount, AMOUNT_CAP } from '../js/fmt.js';

test('a plain count, and the short forms', () => {
	assert.equal(parseAmount('12'), 12);
	assert.equal(parseAmount('4k'), 4000);
	assert.equal(parseAmount('1.5m'), 1_500_000);
	assert.equal(parseAmount(''), 0);
	assert.equal(parseAmount('abc'), null);
});

test('a figure past any inventory is a typo, not Infinity', () => {
	const huge = '9'.repeat(400);
	assert.equal(parseAmount(huge), null);
	assert.equal(parseAmount('9999999b'), null);
	assert.equal(parseAmount(String(AMOUNT_CAP)), AMOUNT_CAP);
});

test('a minus is refused unless the caller allows one', () => {
	assert.equal(parseAmount('-3'), null);
	assert.equal(parseAmount('-3', { signed: true }), -3);
	assert.equal(parseAmount('−2k', { signed: true }), -2000, 'the typographic minus too');
	assert.equal(parseAmount('-', { signed: true }), null);
});
