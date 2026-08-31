// Finding a thing by a few letters of it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { matchItems } from '../js/jump.js';

const names = ['Tidal Black Stone', 'Sunset Tidal Black Stone', 'Black Stone', 'Sunset Coral Essence', '[Level 5] Golden Coral', '+7 Chiro Cannon'];

test('a name that starts with the query comes first, then a word that does, then anything containing it', () => {
	assert.deepEqual(matchItems('tidal', names), ['Tidal Black Stone', 'Sunset Tidal Black Stone']);
	assert.deepEqual(matchItems('black', names), ['Black Stone', 'Tidal Black Stone', 'Sunset Tidal Black Stone']);
	assert.deepEqual(matchItems('coral', names), ['Sunset Coral Essence', '[Level 5] Golden Coral']);
	assert.deepEqual(matchItems('chiro', names), ['+7 Chiro Cannon']);
});

test('nothing for nothing, and the list is capped', () => {
	assert.deepEqual(matchItems('', names), []);
	assert.deepEqual(matchItems('   ', names), []);
	assert.equal(matchItems('o', names, 2).length, 2);
});
