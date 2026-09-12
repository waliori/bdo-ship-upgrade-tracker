// The clock for the time the ship is out.
//
// What can go wrong: a clock that reads the wrong way round once the
// estimate is past, a stale one from yesterday still counting, a chime
// that fires twice, or a timer the save will not keep.

import test from 'node:test';
import assert from 'node:assert/strict';

import { spanText, clockText, timerState, startTimer, stopTimer, timerNow } from '../js/sail-timer.js';
import { readView } from '../js/profile-shape.js';
import * as store from '../js/state.js';

test('a span reads the way a sailor says it', () => {
	assert.equal(spanText(0), '0 s');
	assert.equal(spanText(45), '45 s');
	assert.equal(spanText(60), '1 m 00 s');
	assert.equal(spanText(75), '1 m 15 s');
	assert.equal(spanText(3725), '1 h 02 m');
	assert.equal(spanText(-5), '0 s', 'never a negative span');
});

test('the clock counts up, and says how far past the estimate it is', () => {
	assert.equal(timerState(), null, 'nothing running to begin with');
	const started = startTimer(600, 'Duch and 4 more');
	assert.equal(started, 600);
	const now = timerNow();
	assert.equal(now.seconds, 600);
	assert.equal(now.chimed, false);

	const at = s => timerState(now.startedAt + s * 1000);
	assert.equal(at(0).over, false);
	assert.equal(clockText(at(75)), '1 m 15 s of ≈ 10 m 00 s');
	// Past the estimate it keeps counting and says so, rather than
	// reading as a countdown that ran out.
	const past = at(725);
	assert.equal(past.over, true);
	assert.equal(past.left, -125);
	assert.equal(clockText(past), '12 m 05 s · 2 m 05 s past the 10 m 00 s it was set for');
	stopTimer();
	assert.equal(timerNow(), null);
});

test('a timer is bounded, and one from yesterday is not shown', () => {
	assert.equal(startTimer(1), 30, 'nothing shorter than half a minute');
	assert.equal(startTimer(99999), 6 * 3600, 'nothing longer than six hours');
	stopTimer();
	// The save keeps the shape...
	assert.deepEqual(readView('timer', { startedAt: 5, seconds: 600, label: 'x', chimed: true }), { startedAt: 5, seconds: 600, label: 'x', chimed: true });
	// ...and a clock from yesterday is not counted up from: it belongs to
	// a session that is long over.
	const day = 24 * 3600 * 1000;
	store.setView('timer', { startedAt: Date.now() - 2 * day, seconds: 600, label: 'last night', chimed: true });
	assert.equal(timerNow(), null, 'a timer more than a day old is gone');
	store.setView('timer', { startedAt: Date.now() - 60_000, seconds: 600, label: 'this one', chimed: false });
	assert.equal(timerNow().label, 'this one');
	stopTimer();
});
