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

test('every word has to be there, but not as one run of characters', () => {
	// "+7 toro" used to find nothing: no name contains that string,
	// though "+7 Epheria Carrack: Toro Sail" contains both words.
	const parts = ['+7 Epheria Carrack: Toro Sail', 'Epheria Carrack: Toro Sail', '+7 Epheria Carrack: Toro Cannon'];
	assert.deepEqual(matchItems('+7 toro', parts), ['+7 Epheria Carrack: Toro Sail', '+7 Epheria Carrack: Toro Cannon']);
	assert.deepEqual(matchItems('toro sail', parts), ['Epheria Carrack: Toro Sail', '+7 Epheria Carrack: Toro Sail']);
	// A word that is nowhere in the name still matches nothing.
	assert.deepEqual(matchItems('toro anchor', parts), []);
});

test('a bare part is offered above its own enhancement levels', () => {
	// Sorting on the string alone put "+10" second and the part last.
	const levels = ['+10 Toro Sail', '+2 Toro Sail', 'Toro Sail', '+1 Toro Sail'];
	assert.deepEqual(matchItems('toro sail', levels), ['Toro Sail', '+1 Toro Sail', '+2 Toro Sail', '+10 Toro Sail']);
});
