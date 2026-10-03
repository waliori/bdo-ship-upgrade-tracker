// A run as it is recorded, and the keys a run's edits are kept under.
//
// What can go wrong: a 2-3 island always written into the Inventory as
// 3, so the counts drift up run after run; or a route edited on the
// wharf filed under a key the profile cuts short, so the edits are lost
// on the next reload once three chains are ticked.

import test from 'node:test';
import assert from 'node:assert/strict';

import { halfEven, digest, tripOf, stopKey } from '../js/barter/sail.js';
import { VIEW_NS } from '../js/barter/view.js';
import { readView } from '../js/profile-shape.js';

test('a half rounds to the even whole, so a guessed range is wrong both ways', () => {
	assert.equal(halfEven(2.5), 2);
	assert.equal(halfEven(3.5), 4);
	assert.equal(halfEven(7.5), 8);
	assert.equal(halfEven(2.4), 2);
	assert.equal(halfEven(2.6), 3);
	assert.equal(halfEven(-2.5), -2);
	assert.equal(halfEven(5), 5);
});

test('a stop paying 2-3 that nobody said is recorded at the middle, rounded once', () => {
	const stopAt = times => ({ npcId: 58922, npc: 'X', give: '[Level 1] Raft Toy', giveN: 1, item: '[Level 2] Filtered Drinking Water', recvMin: 2, recvMax: 3, times });
	const record = times => {
		const stops = [stopAt(times)];
		return tripOf({ stops }, { done: [stopKey(stops[0], 0, stops)], seen: {} }, null).delta;
	};
	// One trade: 2.5, which used to be written as 3 every time.
	assert.equal(record(1)['[Level 2] Filtered Drinking Water'], 2);
	assert.equal(record(1)['[Level 1] Raft Toy'], -1);
	// Three: 7.5, the half going the other way.
	assert.equal(record(3)['[Level 2] Filtered Drinking Water'], 8);
	// Two: 5, exactly.
	assert.equal(record(2)['[Level 2] Filtered Drinking Water'], 5);
	// What the island was seen to pay is what is written.
	const stops = [stopAt(1)];
	const said = tripOf({ stops }, { done: [stopKey(stops[0], 0, stops)], seen: { 58922: 3 } }, null).delta;
	assert.equal(said['[Level 2] Filtered Drinking Water'], 3);
});

test('a route edit’s key outlives the profile’s cut at any number of chains', () => {
	const ids = Array.from({ length: 8 }, (_, i) => `land:[Level 1] Good Number ${i}>${i}`);
	const key = digest(`2026-10-01|31|${ids.join(',')}|sea`);
	assert.ok(key.length <= 40, `${key} is short`);
	assert.equal(key, digest(`2026-10-01|31|${ids.join(',')}|sea`), 'the same run, the same key');
	assert.notEqual(key, digest(`2026-10-01|31|${ids.slice(1).join(',')}|sea`));
	const back = readView(VIEW_NS, { routeEdit: { key, skip: [58922], nudge: {}, trips: [] } });
	assert.equal(back.routeEdit.key, key, 'read back whole, so the edits are found again');
});
