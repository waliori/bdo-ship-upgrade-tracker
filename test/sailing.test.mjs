// Distances in the game's metres and the time a hull makes of them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pathLength, legLengths, sailSeconds, calibrate, fmtDistance, fmtDuration, DEFAULT_CAL } from '../js/sailing.js';
import { ports } from '../js/barter_npcs.js';

test('a chart pixel is a quarter of a metre', () => {
	assert.equal(pathLength([{ x: 0, y: 0 }, { x: 4000, y: 0 }]), 1000);
	assert.equal(pathLength([{ x: 0, y: 0 }]), 0);
	// Velia to Port Epheria as the crow flies: a little under four kilometres.
	const [velia, epheria] = ports;
	const m = pathLength([velia, epheria]);
	assert.ok(m > 3600 && m < 3800, `${m}`);
});

test('legs are split at the stops, bends included in the leg they belong to', () => {
	const pts = [{ x: 0, y: 0 }, { x: 400, y: 0, bend: true }, { x: 400, y: 400 }, { x: 800, y: 400 }];
	assert.deepEqual(legLengths(pts), [200, 100]);
	assert.deepEqual(legLengths([{ x: 0, y: 0 }]), []);
});

test('the time a leg takes follows from the speed', () => {
	assert.equal(sailSeconds(875, 100), 100);
	assert.equal(sailSeconds(1100, 100, 22), 50);
	assert.equal(sailSeconds(1000, 0), Infinity);
});

test('one timed leg calibrates the rest', () => {
	assert.equal(calibrate(3300, 300, 100), 11);
	assert.equal(calibrate(3300, 300, 110), 10);
	assert.equal(calibrate(0, 300, 100), null);
	assert.equal(DEFAULT_CAL, 8.75);
});

test('distances and durations read the way a sailor says them', () => {
	assert.equal(fmtDistance(842), '840 m');
	assert.equal(fmtDistance(4230), '4.2 km');
	assert.equal(fmtDistance(23400), '23 km');
	assert.equal(fmtDuration(20), 'under a minute');
	assert.equal(fmtDuration(6 * 60 + 20), '6 min');
	assert.equal(fmtDuration(72 * 60), '1 h 12 min');
});

test('a time is a range: a fifth either way, a tenth once a leg was timed', async () => {
	const { calRange, sailRange, fmtRange } = await import('../js/sailing.js');
	assert.deepEqual(calRange(10), [8, 12]);
	assert.deepEqual(calRange(10, true), [9, 11]);
	const [fast, slow] = sailRange(1200, 100, 10);
	assert.equal(fast, 100);
	assert.equal(slow, 150);
	assert.equal(fmtRange(fast, slow), '2–3 min');
	assert.equal(fmtRange(290, 310), '5 min');
	assert.equal(fmtRange(3600, 4800), '1 h 00 min – 1 h 20 min');
	assert.equal(fmtRange(10, 20), 'under a minute');
});

import { overweightFactor, OVERLOAD_SLOWEST } from '../js/sailing.js';

test('an overweight hull keeps less of its speed, in a straight line to the overload cap', () => {
	// A 10,000 LT limit that moves under up to 17,000.
	assert.equal(overweightFactor(0, 10000, 17000), 1);
	assert.equal(overweightFactor(10000, 10000, 17000), 1);
	assert.equal(overweightFactor(13500, 10000, 17000), 0.75);
	assert.equal(overweightFactor(17000, 10000, 17000), OVERLOAD_SLOWEST);
	// Past the cap it does not move at all; that is a warning elsewhere,
	// so the factor stops at its floor rather than going to nothing.
	assert.equal(overweightFactor(30000, 10000, 17000), OVERLOAD_SLOWEST);
	// A hold with no room over its limit is never slowed.
	assert.equal(overweightFactor(12000, 10000, 10000), 1);
});

import { learnSpeed } from '../js/sailing.js';

test('legs timed with Arrived give back the speed and the cost a leg that timed them', () => {
	// A ship at 123% that sails 9.5 m/s at 100% and loses 25 s a leg.
	const leg = m => ({ m, s: 25 + m / (9.5 * 1.23), pct: 123 });
	const fit = learnSpeed([leg(2000), leg(3500), leg(6000), leg(9000)]);
	assert.deepEqual(fit, { cal: 9.5, lag: 25, n: 4 });
	// Fewer legs, or legs all of a length: the middle one's speed, no lag.
	const one = learnSpeed([leg(3000)]);
	assert.equal(one.lag, 0);
	assert.ok(one.cal < 9.5 && one.cal > 7, `${one.cal}: the leg's own cost is in it`);
	assert.equal(learnSpeed([leg(3000), leg(3100), leg(3050), leg(2990)]).lag, 0);
	// A press forgotten until long after -- or made at once -- is left out.
	assert.deepEqual(learnSpeed([leg(2000), leg(3500), leg(6000), leg(9000), { m: 900, s: 420, pct: 123 }, { m: 6000, s: 20, pct: 123 }]), { cal: 9.5, lag: 25, n: 4 });
	assert.equal(learnSpeed([]), null);
	assert.equal(learnSpeed([{ m: 0, s: 10, pct: 100 }]), null);
});
