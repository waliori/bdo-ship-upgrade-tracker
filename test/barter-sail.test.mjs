// A run as it is recorded, and the keys a run's edits are kept under.
//
// What can go wrong: a 2-3 island always written into the Inventory as
// 3, so the counts drift up run after run; or a route edited on the
// wharf filed under a key the profile cuts short, so the edits are lost
// on the next reload once three chains are ticked.

import test from 'node:test';
import assert from 'node:assert/strict';

import { halfEven, digest, tripOf, stopKey, planOfSail } from '../js/barter/sail.js';
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

test('what an island paid past the run’s count is left at the next storage call, not carried to the end', () => {
	// GodSpeedGT's layout 19: Ryubio pays 2-3 Masts and the run counted 2.
	const isle = (npcId, give, item, times) => ({ npcId, npc: 'X', give, giveText: '1', giveN: 1, item, recv: 2, recvMin: 2, recvMax: 3, recvText: '2-3', times });
	const iliya = { wharf: { name: 'Dario', at: 'Iliya Island', x: 0, y: 0 }, dropped: [{ item: '[Level 2] Pirate Ship Mast', n: 3 }, { item: '[Level 3] Scout Binoculars', n: 3 }], loads: [] };
	const stops = [
		isle(58967, '[Level 1] Dried Blue Rose', '[Level 2] Pirate Ship Mast', 4),
		isle(58928, '[Level 2] Pirate Ship Mast', '[Level 3] Scout Binoculars', 5),
		iliya,
		isle(58970, '[Level 3] Scout Binoculars', '[Level 4] Solidified Lava', 7),
		{ ...iliya, dropped: [{ item: '[Level 4] Solidified Lava', n: 14 }] }
	];
	const keys = stops.map((s, k) => stopKey(s, k, stops));
	const sail = (done, seen) => ({ stops, done: keys.slice(0, done), seen });
	const left = (plan, k) => Object.fromEntries(plan.stops[k].dropped.map(d => [d.item, d.n]));
	// Said 3 a trade: 12 Masts, 5 to Marcini, so the call leaves 7, not 3.
	const said = planOfSail(sail(0, { 58967: 3, 58928: 2 }));
	assert.equal(left(said, 2)['[Level 2] Pirate Ship Mast'], 7);
	assert.equal(left(said, 2)['[Level 3] Scout Binoculars'], 3);
	assert.deepEqual(left(said, 4), { '[Level 4] Solidified Lava': 14 }, 'left once, at the first call');
	// Into storage as the Inventory takes it, so the hold is back to the run's.
	const on = sail(3, { 58967: 3, 58928: 2 });
	const trip = tripOf(planOfSail(on), on, null);
	assert.equal(trip.moves.filter(m => m.item === '[Level 2] Pirate Ship Mast' && m.to).reduce((a, m) => a + m.n, 0), 7);
	assert.equal((trip.delta['[Level 2] Pirate Ship Mast'] || 0) - 7, 0, 'nothing of the Masts left aboard');
	// Not said and not sailed yet: the run's own counts.
	assert.equal(left(planOfSail(sail(0, {})), 2)['[Level 2] Pirate Ship Mast'], 3);
});
