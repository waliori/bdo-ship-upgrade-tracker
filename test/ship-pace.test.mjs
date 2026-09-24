// How fast a ship really sails, ship by ship.
//
// What can go wrong: a ship's figure used before it has legs enough, one
// ship's legs timing another, a figure set by hand losing to the legs,
// the first build's device-kept legs left winning as if set by hand.

import test from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../js/state.js';
import { paceOf, noteLeg, forgetPace, LEARN_AT, timingLegs, setTimingLegs } from '../js/ship-pace.js';
import { DEFAULT_CAL, DEFAULT_LAG } from '../js/sailing.js';

// A Carrack at 226.7% that sails 8.75 m/s at 100% and loses 23 s a leg.
const leg = m => ({ m, s: 23 + m / (8.75 * 2.267), pct: 226.7 });

test('the first build’s legs, kept on the device, move to the ship sailing and stop reading as set by hand', () => {
	store.setSetting('sailLog', [leg(3000), leg(6000)]);
	store.setSetting('sailCal', 17.7);
	const p = paceOf('Carrack (Advance)');
	assert.equal(p.from, 'default', 'two legs are not enough, and the old figure is gone');
	assert.equal(p.n, 2);
	assert.equal(store.getSetting('sailCal', null), null);
	assert.equal(store.getSetting('sailLog', null), null);
	forgetPace('Carrack (Advance)');
});

test('a ship is timed at the default until it has legs enough, then at its own', () => {
	const ship = 'Carrack (Advance)';
	assert.deepEqual(paceOf(ship), { cal: DEFAULT_CAL, lag: DEFAULT_LAG, from: 'default', n: 0 });
	const legs = [2000, 3500, 6000, 9000, 14000];
	let last;
	for (const [i, m] of legs.entries()) {
		last = noteLeg(ship, leg(m));
		assert.equal(last.learned, i === LEARN_AT - 1, `leg ${i + 1}: learned only on the ${LEARN_AT}th`);
	}
	assert.equal(last.pace.from, 'ship');
	assert.equal(last.pace.n, 5);
	assert.ok(Math.abs(last.pace.cal - 8.75) < 0.05 && Math.abs(last.pace.lag - 23) <= 1, JSON.stringify(last.pace));
	// Another hull is untouched.
	assert.equal(paceOf('Epheria Galleass').from, 'default');
	// It lives in the profile, which syncs.
	assert.equal(store.getProfile('shipPace', {})[ship].log.length, 5);
	// A leg more refines it, and is not "learned" again.
	assert.equal(noteLeg(ship, leg(4400)).learned, false);
	// A figure set by hand on the Route tab wins, and giving it up goes back.
	store.setSetting('sailCal', 10);
	assert.equal(paceOf(ship).from, 'hand');
	store.setSetting('sailCal', null);
	assert.equal(paceOf(ship).from, 'ship');
	forgetPace(ship);
	assert.equal(paceOf(ship).from, 'default');
});

test('Arrived is offered only when asked for', () => {
	assert.equal(timingLegs(), false);
	setTimingLegs(true);
	assert.equal(timingLegs(), true);
	setTimingLegs(false);
	assert.equal(timingLegs(), false);
});
