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

import { passedStop, marksMode, setMarksMode, MARK_CHOICES } from '../js/sail-timer.js';

test('a run’s stops each get their own moment, and the last of them is the end', () => {
	const marks = [{ at: 120, label: 'Baeza' }, { at: 300, label: 'Narvo' }, { at: 540, label: 'Iliya' }];
	const end = startTimer(0, 'Baeza and 2 more', marks);
	assert.equal(end, 540, 'the run is over when its last stop is');
	const t0 = timerNow();
	const at = s => timerState(t0.startedAt + s * 1000);

	// On the way to the first: the clock says which stop and how far.
	assert.equal(at(0).next.label, 'Baeza');
	assert.equal(at(0).next.left, 120);
	assert.equal(clockText(at(30)), '1 m 30 s to Baeza · stop 1 of 3');
	// Past the first, it is making for the second.
	assert.equal(at(150).next.label, 'Narvo');
	assert.equal(at(150).next.i, 1);
	// Past the last there is no next, and the end has gone by.
	assert.equal(at(600).next, null);
	assert.equal(at(600).over, true);
	stopTimer();
});

test('ticking a stop off puts the rest of the run back by however late it was', () => {
	const marks = [{ at: 100, label: 'A' }, { at: 200, label: 'B' }, { at: 300, label: 'C' }];
	startTimer(0, 'A and 2 more', marks);
	const started = timerNow().startedAt;
	// The first stop is ticked off when it is reached -- but the clock is
	// rewound so that "now" is a hundred seconds late.
	store.setView('timer', { ...timerNow(), startedAt: started - 200_000 });
	passedStop(0);
	const t = timerNow();
	assert.equal(t.done, 1);
	assert.equal(t.marks[0].at, 100, 'a stop already behind keeps the moment it had');
	assert.deepEqual(t.marks.slice(1).map(m => m.at), [300, 400], 'the rest are put back by the hundred seconds lost');
	assert.equal(t.seconds, 400, 'and the run ends later than it was going to');
	stopTimer();
});

test('which stops make a sound is a choice, and the marks are kept either way', () => {
	assert.equal(marksMode(), 'each', 'stop by stop is the default: it is the one for sailing away from the keyboard');
	setMarksMode('whole');
	assert.equal(marksMode(), 'whole');
	setMarksMode('nonsense');
	assert.equal(marksMode(), 'each', 'anything else falls back to stop by stop');
	assert.deepEqual(MARK_CHOICES.map(c => c[0]), ['each', 'whole']);
});

test('the time a stop takes is counted, and the clock says which half of it you are in', () => {
	// Two islands a minute apart, forty-five seconds spent at each.
	const marks = [{ at: 60, label: 'Baeza', hold: 45 }, { at: 165, label: 'Narvo', hold: 45 }];
	startTimer(0, 'Baeza and 1 more', marks);
	const t0 = timerNow();
	assert.deepEqual(t0.marks.map(m => m.hold), [45, 45], 'the stop’s own time rides on the mark');
	const at = s => timerState(t0.startedAt + s * 1000);

	// On the way to the first: a leg.
	assert.equal(clockText(at(30)), '30 s to Baeza · stop 1 of 2');
	// Arrived, and bartering: the clock is counting the stop now, not a
	// leg, and says so rather than folding it into the next arrival.
	assert.equal(at(70).here.label, 'Baeza');
	assert.equal(clockText(at(70)), 'at Baeza · under way in 35 s');
	// Under way again: back to counting the leg.
	assert.equal(at(110).here, null);
	assert.equal(clockText(at(110)), '55 s to Narvo · stop 2 of 2');
	// And the second island's arrival is a minute later than the leg
	// alone would make it -- the forty-five seconds at the first is in
	// the number, which is the whole point of typing it.
	assert.equal(t0.marks[1].at - t0.marks[0].at, 105, 'a 60 s leg and the 45 s spent before it');
	stopTimer();
});
