// A current makes a leg shorter in time, going with it, and nothing else.

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLane, nearestOnLane, effectiveLegs, effectiveTotal, WITH_CURRENT } from '../js/currents.js';
import { legLengths } from '../js/sailing.js';

// A lane running east along y = 1000, from x = 0 to x = 10000.
const east = cleanLane({ name: 'Easterly', pts: [0, 1000, 10000, 1000] });

test('a lane is kept whole, and a bad one is refused', () => {
	assert.equal(east.factor, WITH_CURRENT);
	assert.equal(east.name, 'Easterly');
	assert.equal(cleanLane({ pts: [1, 2] }), null, 'one point is not a lane');
	assert.equal(cleanLane({ pts: [0, 0, 100, 100], factor: 2.2 }).factor, 2.2);
	assert.equal(cleanLane({ pts: [0, 0, 100, 100], factor: 99 }).factor, 5, 'a pace is capped');
	assert.equal(cleanLane(null), null);
});

test('the nearest point of a lane, and the way it runs there', () => {
	const n = nearestOnLane(east, 5000, 1300);
	assert.equal(n.d, 300);
	assert.deepEqual(n.dir, [1, 0]);
	assert.equal(nearestOnLane(east, -500, 1000).d, 500, 'past the end, the end is nearest');
});

test('a leg with the current is timed at its pace; against it, and off it, at the ship\'s', () => {
	const withIt = [{ x: 0, y: 1000 }, { x: 10000, y: 1000 }];
	const against = [{ x: 10000, y: 1000 }, { x: 0, y: 1000 }];
	const off = [{ x: 0, y: 5000 }, { x: 10000, y: 5000 }];
	const plain = legLengths(withIt)[0];
	const a = effectiveLegs(withIt, [east])[0];
	assert.ok(Math.abs(a.metres - plain) < 1e-6, 'the real metres are the chart\'s');
	assert.ok(Math.abs(a.effective - plain / WITH_CURRENT) < 1e-6, 'the whole leg rides the current');
	assert.ok(Math.abs(a.current - plain) < 1e-6);
	const b = effectiveLegs(against, [east])[0];
	assert.ok(Math.abs(b.effective - plain) < 1e-6, 'against it nothing is claimed');
	assert.equal(b.current, 0);
	const c = effectiveLegs(off, [east])[0];
	assert.ok(Math.abs(c.effective - plain) < 1e-6);
	assert.equal(c.current, 0);
});

test('a leg half in a lane is half at its pace, and the total adds up', () => {
	// East for 10 km, the lane only under the first 5 km of it.
	const short = cleanLane({ pts: [0, 1000, 5000, 1000] });
	const legs = effectiveLegs([{ x: 0, y: 1000 }, { x: 10000, y: 1000 }], [short], 100);
	const plain = legLengths([{ x: 0, y: 1000 }, { x: 10000, y: 1000 }])[0];
	// The lane's half-width reaches 900 past its end, so a little over half rides it.
	assert.ok(legs[0].current > plain * 0.5 && legs[0].current < plain * 0.6, `${legs[0].current} of ${plain}`);
	assert.ok(legs[0].effective < plain && legs[0].effective > plain / WITH_CURRENT);
	const t = effectiveTotal([{ x: 0, y: 1000 }, { x: 10000, y: 1000, bend: true }, { x: 10000, y: 5000 }], [short], 100);
	assert.ok(Math.abs(t.metres - legLengths([{ x: 0, y: 1000 }, { x: 10000, y: 1000, bend: true }, { x: 10000, y: 5000 }])[0]) < 1e-6);
	assert.ok(t.current > 0 && t.effective < t.metres);
	assert.deepEqual(effectiveLegs([], [east]), []);
});
