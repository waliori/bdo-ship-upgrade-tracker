// A storage read off screenshots, counted the way the game keeps it: a
// [Level 5] and up -- the [Great Ocean] goods with them -- is one to a
// slot (owner's rule, 2026-10-01), so a slot of it is one whatever figure
// the reader thought it saw; the levels under it stack, and their figure
// is the count.

import test from 'node:test';
import assert from 'node:assert/strict';

import { gather } from '../js/storage-import.js';
import { slotsHeld, fitInto } from '../js/barter-plan.js';

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

// A stack never splits (owner's rule, 2026-10-02): the game keeps a good
// that stacks as one stack, one slot, past a thousand as under it. So a
// stack seen in two slots is one stack seen twice, not two stacks.
test('a stack of more than a thousand is one slot, read, held or loaded', () => {
	const L2 = '[Level 2] Big Stone Slab', shore = 'Aloe';
	const known = new Set([L2, shore]);
	const one = gather([{ rows: [{ item: L2, qty: 1500, sure: true }, { item: shore, qty: 2400, sure: true }] }], known);
	const by = Object.fromEntries(one.map(r => [r.item, r]));
	assert.equal(by[L2].n, 1500);
	assert.equal(by[L2].slots, 1, 'fifteen hundred of a [Level 2] is one slot');
	assert.equal(by[L2].guessed, 0);
	assert.equal(slotsHeld(new Map([[L2, 1500], [shore, 2400]])), 2, 'one slot a kind, whatever the count');
	// The same stack in two overlapping shots: one stack, its figure once,
	// and the line marked to be checked.
	const twice = gather([{ rows: [{ item: L2, qty: 1500, sure: true }] }, { rows: [{ item: L2, qty: 1500, sure: true }] }], known);
	assert.equal(twice[0].n, 1500, 'not 3,000: the game would not have split it');
	assert.equal(twice[0].slots, 1);
	assert.equal(twice[0].seen, 2);
	assert.equal(twice[0].guessed, 1, 'seen twice, so it is to be checked');
	// And the hold takes 1,200 more of it into a full hold that has it already.
	const full = new Map([[L2, 1500], ...Array.from({ length: 19 }, (_, i) => [`[Level 5] x${i}`, 1])]);
	assert.deepEqual(fitInto(full, [[L2, 1200]], 20).fit, [[L2, 1200]]);
});
