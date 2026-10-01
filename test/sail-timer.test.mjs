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

test('a run’s stops each get their own moment, and the clock waits at each until Traded', () => {
	const marks = [{ at: 120, label: 'Baeza' }, { at: 300, label: 'Narvo' }, { at: 540, label: 'Iliya' }];
	const end = startTimer(0, 'Baeza and 2 more', marks);
	assert.equal(end, 540, 'the run is over when its last stop is');
	const t0 = timerNow();
	const at = s => timerState(t0.startedAt + s * 1000);

	// On the way to the first: the clock says which stop and how far.
	assert.equal(at(0).next.label, 'Baeza');
	assert.equal(at(0).next.left, 120);
	assert.equal(clockText(at(30)), '1 m 30 s to Baeza · stop 1 of 3');
	// Reached and not traded: it waits there, and does not move on.
	assert.equal(at(150).next, null);
	assert.equal(at(150).wait.label, 'Baeza');
	assert.equal(at(150).wait.over, 30);
	assert.equal(clockText(at(150)), 'at Baeza · stop 1 of 3 — waiting for Traded');
	assert.equal(at(600).wait.label, 'Baeza', 'however long it waits');
	assert.equal(at(600).over, false, 'a run waiting at a stop is not over');
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

test('Traded starts the next leg from the press, early or late', () => {
	// Two islands a minute apart, forty-five seconds planned at each.
	const marks = [{ at: 60, label: 'Baeza', hold: 45, k: 0 }, { at: 165, label: 'Narvo', hold: 45, k: 1 }];
	startTimer(0, 'Baeza and 1 more', marks);
	const started = timerNow().startedAt;
	assert.deepEqual(timerNow().marks.map(m => m.hold), [45, 45], 'the stop’s own time rides on the mark');
	// Traded pressed early, at 20 s -- before the clock reached Baeza: the
	// leg to Narvo (165 - 60 - 45 = 60 s) starts now.
	store.setView('timer', { ...timerNow(), startedAt: started - 20_000 });
	passedStop(0);
	let t = timerNow();
	assert.equal(t.done, 1);
	assert.equal(t.marks[1].at, 80, 'Narvo is one leg from the press');
	assert.equal(timerState(t.startedAt + 50_000).next.label, 'Narvo');
	stopTimer();
	// Pressed late, at 300 s: the leg starts then instead.
	startTimer(0, 'Baeza and 1 more', marks);
	store.setView('timer', { ...timerNow(), startedAt: timerNow().startedAt - 300_000 });
	passedStop(0);
	t = timerNow();
	assert.equal(t.marks[1].at, 360);
	stopTimer();
});

test('a clock can be set back and run again, at the estimate it was given', async () => {
	const { restartTimer } = await import('../js/sail-timer.js');
	assert.equal(restartTimer(), null, 'nothing running, nothing to set back');

	const marks = [{ at: 60, label: 'Baeza' }, { at: 160, label: 'Narvo' }];
	startTimer(0, 'Baeza and 1 more', marks);
	const first = timerNow();

	// A stop ticked off late pushes the marks out, which is what makes a
	// clock that follows the ship rather than the plan.
	await new Promise(r => setTimeout(r, 15));
	passedStop(0);
	const moved = timerNow();
	assert.ok(moved.marks[1].at < 160, 'ticking a stop early pulls the rest in');
	assert.equal(moved.done, 1);

	// Set back: the marks go home to where they were first laid, not to
	// wherever the last attempt drifted to, and nothing is behind it.
	const again = restartTimer();
	assert.equal(again.done, 0, 'no stop is behind a clock just set back');
	assert.equal(again.chimed, false);
	assert.deepEqual(again.marks.map(m => m.at), [60, 160], 'the estimate it was given');
	assert.equal(again.seconds, 160);
	assert.ok(again.startedAt >= first.startedAt, 'it runs from now');
	stopTimer();
});

import { arrivedAt } from '../js/sail-timer.js';

test('Arrived stops the count at the stop, and a pace learned re-spaces the stops ahead', () => {
	const marks = [{ at: 100, label: 'A', hold: 45, k: 0 }, { at: 245, label: 'B', hold: 45, k: 1 }, { at: 390, label: 'C', hold: 45, k: 2 }];
	startTimer(0, 'A and 2 more', marks);
	const started = timerNow().startedAt;
	// The ship is in at 80 s, before the clock's 100: it waits there, and
	// does not chime for A later.
	store.setView('timer', { ...timerNow(), startedAt: started - 80_000 });
	arrivedAt(0);
	let t = timerNow();
	assert.equal(t.marks[0].at, 80);
	assert.ok(t.reached >= 1, 'A counts as reached: no chime for it');
	assert.deepEqual(t.marks.slice(1).map(m => m.at), [225, 370], 'the rest move with it');
	assert.ok(timerState().wait, 'waiting at A for Traded');
	// Now a slower pace is learned: legs of 150 s where 100 were planned.
	const fresh = [{ at: 150, hold: 45, k: 0 }, { at: 345, hold: 45, k: 1 }, { at: 540, hold: 45, k: 2 }];
	arrivedAt(0, fresh);
	t = timerNow();
	assert.deepEqual(t.marks.map(m => m.at), [80, 275, 470], 'spaced as the new pace says, from where the ship is');
	stopTimer();
	// Traded with the run laid again: the next leg is the new pace's.
	startTimer(0, 'A and 2 more', marks);
	store.setView('timer', { ...timerNow(), startedAt: timerNow().startedAt - 130_000 });
	passedStop(0, fresh);
	t = timerNow();
	assert.equal(t.marks[1].at, 130 + 150, 'B is one new-pace leg from the press');
	assert.equal(t.marks[2].at, 130 + 150 + 45 + 150);
	// Marks that no longer match the run are ignored, not misapplied.
	passedStop(1, [{ at: 1, hold: 0, k: 9 }]);
	assert.equal(timerNow().done, 2);
	stopTimer();
});

test('a clock laid on the route before a call was put in takes the run’s marks, and counts to the right stop', () => {
	// Started on A, B, C; the run then gained a call for supplies (k 1),
	// so B and C are stops 2 and 3. Arrived at the call at 150 s.
	const old = [{ at: 100, label: 'A', hold: 30, k: 0 }, { at: 230, label: 'B', hold: 30, k: 1 }, { at: 360, label: 'C', hold: 30, k: 2 }];
	const fresh = [{ at: 100, label: 'A', hold: 30, k: 0 }, { at: 160, label: 'call', hold: 60, k: 1 }, { at: 290, label: 'B', hold: 30, k: 2 }, { at: 420, label: 'C', hold: 30, k: 3 }];
	startTimer(0, 'A and 3 more', old);
	store.setView('timer', { ...timerNow(), startedAt: timerNow().startedAt - 150_000 });
	arrivedAt(1, fresh);
	let t = timerNow();
	assert.equal(t.marks.length, 4, 'the run’s four marks');
	assert.equal(t.marks[1].label, 'call');
	assert.equal(t.marks[1].at, 150, 'in at the call now');
	assert.equal(t.reached, 2);
	assert.ok(timerState().wait, 'waiting at the call, not counting on to B');
	// Supplied at 200 s: B is its own leg from the press, not what the old
	// marks had left of it.
	store.setView('timer', { ...timerNow(), startedAt: timerNow().startedAt - 50_000 });
	passedStop(1, fresh);
	t = timerNow();
	assert.equal(t.done, 2);
	assert.equal(t.marks[2].at, 200 + (290 - 160 - 60), 'B one leg from the press');
	stopTimer();
});

// A browser's audio, counted: every note of a chime is an oscillator.
let notes = 0;
const fakeAudio = () => {
	class AC {
		constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; }
		createOscillator() { notes++; return { frequency: { value: 0 }, connect: x => x, start() {}, stop() {} }; }
		createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: x => x }; }
	}
	globalThis.window = globalThis.window || {};
	globalThis.window.AudioContext = AC;
};
const rewind = s => store.setView('timer', { ...timerNow(), startedAt: timerNow().startedAt - s * 1000 });

test('the whole run rings once at its end, with no stop ticked off on the way', async () => {
	const { watchTimer } = await import('../js/sail-timer.js');
	fakeAudio();
	setMarksMode('whole');
	startTimer(0, 'run', [{ at: 100, label: 'A', hold: 0, k: 0 }, { at: 200, label: 'B', hold: 0, k: 1 }, { at: 300, label: 'C', hold: 0, k: 2 }], 3);
	rewind(3600);
	const before = notes;
	watchTimer(null);
	assert.ok(notes > before, 'the bell rang an hour into a five-minute run');
	assert.equal(timerNow().chimed, true);
	const rung = notes;
	// Traded pressed through the stops afterwards is not a second bell.
	passedStop(0); passedStop(1); passedStop(2);
	watchTimer(null);
	assert.equal(notes, rung, 'one chime for the whole run');
	setMarksMode('each');
	stopTimer();
});

test('the end bell rings once, not again when the last Traded is pressed', async () => {
	const { watchTimer } = await import('../js/sail-timer.js');
	fakeAudio();
	setMarksMode('each');
	startTimer(0, 'A and 1', [{ at: 100, label: 'A', hold: 0, k: 0 }, { at: 200, label: 'B', hold: 0, k: 1 }], 2);
	rewind(150); watchTimer(null);
	passedStop(0);
	rewind(300); watchTimer(null);
	assert.equal(timerNow().chimed, true, 'the end rang as B came up');
	const rung = notes;
	passedStop(1); watchTimer(null);
	assert.equal(notes, rung, 'Traded at the last stop does not ring the end again');
	stopTimer();
});

test('a run laid again mid-sail carries its new count of stops, and a restart goes back to it', async () => {
	const { restartTimer } = await import('../js/sail-timer.js');
	const old = [{ at: 100, label: 'A', hold: 0, k: 0 }, { at: 200, label: 'B', hold: 0, k: 1 }];
	const fresh = [{ at: 100, label: 'A', hold: 0, k: 0 }, { at: 160, label: 'call', hold: 60, k: 1 }, { at: 290, label: 'B', hold: 0, k: 2 }];
	startTimer(0, 'A and 1', old, 2);
	rewind(150);
	arrivedAt(1, fresh, 3);
	assert.equal(timerState().stops, 3, 'of 3 now, the supply call counted');
	const again = restartTimer();
	assert.deepEqual(again.marks.map(m => m.label), ['A', 'call', 'B'], 'the restart counts the run as it now is');
	stopTimer();
});

test('Arrived at a stop past a skipped one waits there, under its own name', () => {
	startTimer(0, 'run', [{ at: 100, label: 'A', hold: 0, k: 0 }, { at: 200, label: 'B', hold: 0, k: 1 }, { at: 300, label: 'C', hold: 0, k: 2 }], 3);
	rewind(250);
	arrivedAt(2);
	const s = timerState();
	assert.ok(s.wait);
	assert.equal(s.wait.label, 'C');
	stopTimer();
});
