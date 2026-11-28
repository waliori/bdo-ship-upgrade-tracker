// The Special Barter gauge: one pool every barter adds to, by tier.
//
// What can go wrong: a tier read off the wrong good, the [Great Ocean]
// goods counted as plain [Level 5]s, a run from before the last Special
// counted again, a mixed day not adding up, a zone that is not a zone.

import test from 'node:test';
import assert from 'node:assert/strict';
import { POOL, ZONE, tierOf, fillOf, countsSince, standing, plus } from '../js/special-barter.js';

test('a tier is the level handed over, the Great Ocean goods apart', () => {
	assert.equal(tierOf('Pure Pearl Crystal', '[Level 1] Cheese Pie'), '0');
	assert.equal(tierOf('[Level 6] Gold Coin Bundle', '[Level 7] Golden Galley Figurine'), '6');
	assert.equal(tierOf('[Level 4] Panacea', '[Level 5] Opulent Coral Trinket'), '4g');
	assert.equal(tierOf('[Level 4] Panacea', 'Crow Coin'), '4');
});

test('one tier alone fills the pool at its own column; a mixed day adds the shares', () => {
	for (const t of Object.keys(POOL)) assert.ok(Math.abs(fillOf({ [t]: POOL[t] }) - 1) < 1e-9, t);
	assert.ok(Math.abs(fillOf({ 0: 200, 2: 100, 6: 20 }) - (200 / POOL[0] + 100 / POOL[2] + 20 / POOL[6])) < 1e-9);
	assert.ok(ZONE.lo > 0.9 && ZONE.lo < 1 && ZONE.hi > 1 && ZONE.hi < 1.1, JSON.stringify(ZONE));
});

test('only the runs after the last Special count, and a correction adds on top', () => {
	const runs = [
		{ at: 100, stops_: [{ k: 'n', g: '[Level 6] X', i: '[Level 7] Y', t: 10 }] },
		{ at: 300, stops_: [{ k: 'n', g: '[Level 6] X', i: '[Level 7] Y', t: 5 }, { k: 'w', p: 'Iliya' }, { k: 'n', g: 'Pure Pearl Crystal', i: '[Level 1] Z', t: 7 }] }
	];
	assert.deepEqual(countsSince(runs, 200), { 6: 5, 0: 7 });
	assert.deepEqual(plus({ 6: 5 }, { 6: -9, 1: 3, bogus: 4 }), { 6: 0, 1: 3 });
});

test('one reported part-way through a run takes the stops before it out of the next', () => {
	const run = { at: 500, stops_: [{ k: 'n', g: '[Level 6] X', i: '[Level 7] Y', t: 4 }, { k: 'w', p: 'Iliya' }, { k: 'n', g: 'Pure Pearl Crystal', i: '[Level 1] Z', t: 7 }, { k: 'n', g: '[Level 2] A', i: '[Level 3] B', t: 3 }] };
	const later = { at: 900, stops_: [{ k: 'n', g: '[Level 6] X', i: '[Level 7] Y', t: 2 }] };
	// reported at 400 with two island stops ticked: only the third counts
	assert.deepEqual(countsSince([later, run], 400, 2), { 2: 3, 6: 2 });
	assert.deepEqual(countsSince([run], 400, 0), { 6: 4, 0: 7, 2: 3 });
});

test('the barters left to the zone are counted in the sailor\'s own mix', () => {
	const none = standing({});
	assert.equal(none.left, null);
	const half = standing({ 6: 37 });
	assert.ok(half.fill > 0.49 && half.fill < 0.51);
	assert.equal(half.left, Math.ceil((ZONE.lo - half.fill) * POOL[6]));
	assert.ok(!half.inside);
	assert.ok(standing({ 6: 74 }).inside);
	assert.equal(standing({ 6: 74 }).left, 0);
});

test('the profile keeps the gauge bounded, and the digest shares the reports as counts only', async () => {
	const { readProfile } = await import('../js/profile-shape.js');
	const { digest } = await import('../js/digest.js');
	const p = readProfile({ special: { since: 5, plus: { 6: 3, 9: 4, '4g': -2, x: 1 }, reports: [{ at: 7, c: { 6: 70, 0: 0, bad: 3 } }, { at: 0, c: { 1: 2 } }, { at: 8, c: {} }], junk: 1 } });
	assert.deepEqual(p.special, { since: 5, plus: { 6: 3, '4g': -2 }, reports: [{ at: 7, c: { 6: 70 } }] });
	assert.deepEqual(digest({ profile: { special: p.special } }).special, [{ 6: 70 }]);
	assert.equal(readProfile({ special: { junk: 1 } }).special, undefined);
});
