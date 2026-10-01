// A storage read off screenshots, counted the way the game keeps it: a
// [Level 5] and up -- the [Great Ocean] goods with them -- is one to a
// slot (owner's rule, 2026-10-01), so a slot of it is one whatever figure
// the reader thought it saw; the levels under it stack, and their figure
// is the count.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gather } from '../js/storage-import.js';
import { slotsHeld } from '../js/barter-plan.js';

test('a storage reading counts a [Level 5] one a slot, and a stack by its figure', () => {
	const L5 = "[Level 5] Statue's Tear", L4 = '[Level 4] Panacea', GO = "[Level 5] Cox Pirates' Journal";
	const known = new Set([L5, L4, GO]);
	const shot = { rows: [
		{ item: L5, qty: 1, sure: true }, { item: L5, qty: 1, sure: true }, { item: L5, qty: 7, sure: false },
		{ item: L4, qty: 120, sure: true },
		{ item: GO, qty: 3, sure: false }
	] };
	const rows = gather([shot], known);
	const by = Object.fromEntries(rows.map(r => [r.item, r]));
	assert.equal(by[L5].n, 3, 'three slots of a [Level 5] are three of it, a misread 7 included');
	assert.equal(by[L5].slots, 3);
	assert.equal(by[L4].n, 120, 'a stack is its figure');
	assert.equal(by[GO].n, 1, 'a [Great Ocean] good is one a slot too');
	// And the slots the reading takes in the storage.
	assert.equal(slotsHeld(new Map(rows.map(r => [r.item, r.n]))), 3 + 1 + 1);
});
