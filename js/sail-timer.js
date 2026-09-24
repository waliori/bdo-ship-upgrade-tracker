// A clock for the time the ship is out.
//
// A run is planned here and then sailed in the game, where nothing on
// this page can see it. The plan already says how long it should take
// -- six to ten minutes at this speed, over these legs -- so the one
// thing left is to say when that time is up, out loud, because a ship
// left on auto-path is exactly the kind of thing a player wanders off
// from. The timer counts up rather than down: the estimate is a
// straight-line guess the page itself prints as a range, and a
// countdown that reaches nought while the sailor is still at sea reads
// as a broken app. It marks the estimate, chimes once, and goes on
// counting.
//
// The timer lives in its own view, so it survives a reload, a redraw
// and a change of screen, and it is per profile like everything else.
// The chime is made here rather than fetched: three beeps from the
// browser's own oscillator, no file to ship, nothing to load offline,
// and no question about what the page is allowed to fetch.

import { esc } from './fmt.js';
import * as store from './state.js';
import { canReachDevices, subscribeFor, putAlerts, clearAlerts } from './push-sub.js';
import { pushRegion } from './today.js';
import { toast } from './dialogs.js';
import { T, TT, said } from './i18n.js';

const NS = 'timer';

/**
 * Whether every stop chimes or only the end of the run. Stop by stop
 * is the one that matters to somebody sailing on auto-path: the ship
 * arrives, the barter is made, the ship is sent on -- and the page is
 * the only thing watching the clock. The whole run is for a sailor at
 * the keyboard who just wants to know when to look up.
 *
 * The marks are kept either way; this only decides which of them make
 * a sound, so it can be changed in the middle of a run.
 */
export const MARK_CHOICES = [
	['each', TT('each stop'), TT('A chime as the ship reaches every stop, and three at the end')],
	['whole', TT('the whole run'), TT('One chime, when the run should be done')]
];
export const marksMode = () => (store.getSetting('timerMarks', 'each') === 'whole' ? 'whole' : 'each');
export const setMarksMode = mode => store.setSetting('timerMarks', mode === 'whole' ? 'whole' : 'each');

/**
 * The timer as saved: when it started, how long it was set for, what
 * it was set for, and whether it has already chimed. Null when none is
 * running. A timer older than a day is dropped rather than shown: it
 * belongs to a session that is long over.
 *
 * `marks` are the stops the run passes, each at its own second from
 * the start, the last of them the end of the run; `done` is how many
 * have gone by. A clock set by hand has no marks and only an end.
 */
export function timerNow() {
	const t = store.getView(NS);
	if (!t || !(Number(t.startedAt) > 0) || !(Number(t.seconds) > 0)) return null;
	if (Date.now() - Number(t.startedAt) > 24 * 3600 * 1000) return null;
	const marks = Array.isArray(t.marks)
		? t.marks.filter(m => m && Number(m.at) > 0).map(m => ({ at: Math.round(Number(m.at)), label: String(m.label || '').slice(0, 40), hold: Math.max(0, Math.round(Number(m.hold) || 0)), ...(Number.isFinite(Number(m.k)) ? { k: Math.floor(Number(m.k)) } : {}) })).slice(0, 40)
		: [];
	return {
		startedAt: Number(t.startedAt),
		seconds: Number(t.seconds),
		label: typeof t.label === 'string' ? t.label.slice(0, 60) : '',
		chimed: t.chimed === true,
		marks,
		// The estimate the clock was first given, kept so a restart goes
		// back to it rather than to wherever ticking the stops off left
		// the marks. Carried through every write, which is why it is read
		// back here with the rest.
		base: t.base && Number(t.base.seconds) > 0
			? { seconds: Number(t.base.seconds), marks: Array.isArray(t.base.marks) ? t.base.marks : [] }
			: null,
		done: Math.max(0, Math.min(marks.length, Math.floor(Number(t.done) || 0))),
		// The stops the clock has reached and chimed for. Reaching is not
		// passing: the clock waits at a stop until Traded is pressed.
		reached: Math.max(0, Math.min(marks.length, Math.floor(Number(t.reached) || 0)))
	};
}

const write = t => store.setView(NS, t);

/**
 * Start the clock. `seconds` is what it is set for, `label` what the
 * chime will say it was, `marks` the stops along the way as
 * [{ at, label }] in seconds from the start. Starting again replaces
 * what was running.
 */
export function startTimer(seconds, label = '', marks = []) {
	const list = marks.filter(m => m && Number(m.at) > 0).map(m => ({ at: Math.round(Number(m.at)), label: String(m.label || '').slice(0, 40), hold: Math.max(0, Math.round(Number(m.hold) || 0)), ...(Number.isFinite(Number(m.k)) ? { k: Math.floor(Number(m.k)) } : {}) })).slice(0, 40);
	// The end of the run is the last mark, or what was asked for.
	const end = list.length ? list[list.length - 1].at : Number(seconds) || 0;
	const s = Math.max(30, Math.min(6 * 3600, Math.round(end)));
	write({ startedAt: Date.now(), seconds: s, label: String(label || '').slice(0, 60), chimed: false, marks: list, done: 0, reached: 0, base: { seconds: s, marks: list } });
	arm();
	sendSchedule();
	return s;
}

/**
 * The clock told where the ship really is: the stops up to `index` are
 * behind it, and the rest are put off so that the next one is as far
 * ahead as its own leg is long. A sailor who ticks the stops off as
 * they go gets a clock that corrects itself; one who does not gets the
 * estimate it started with, which is the best anything here can do.
 */
export function passedStop(index, fresh = null) {
	const t = timerNow();
	if (!t || !t.marks.length) return;
	// `index` is the stop in the run; a mark carries the stop it is for.
	// A stop with no leg of its own (a second exchange at the same
	// island) has no mark and is passed with the one before it.
	const done = Math.max(0, Math.min(t.marks.length, t.marks.some(m => Number.isFinite(m.k))
		? t.marks.filter(m => m.k <= index).length
		: Math.floor(index) + 1));
	if (done <= t.done) return;
	const ran = Math.max(0, Math.round((Date.now() - t.startedAt) / 1000));
	// Traded pressed is the ship leaving: the next leg starts now, early
	// or late, and takes as long as its own leg -- the stop's own pause
	// is over, whatever the estimate allowed for it.
	const prev = t.marks[done - 1];
	const shift = ran - (prev.at + prev.hold);
	let marks = t.marks.map((m, i) => (i < done ? { ...m, at: Math.max(1, Math.min(m.at, ran)) } : { ...m, at: Math.max(ran + 1, m.at + shift) }));
	// The run's marks laid again at the pace known now: the legs still
	// ahead are spaced as they say. A pace learned mid-run -- or a new
	// default -- would otherwise wait for the next cast-off, and the
	// clock kept ringing on the speed the run left with.
	const byK = t.marks.some(m => Number.isFinite(m.k));
	if (Array.isArray(fresh) && fresh.length === marks.length && fresh.every((m, j) => !byK || m.k === marks[j].k)) {
		const from = fresh[done - 1].at + fresh[done - 1].hold;
		marks = marks.map((m, j) => (j < done ? m : { ...m, at: Math.max(ran + 1, ran + fresh[j].at - from), hold: fresh[j].hold }));
	}
	write({ ...t, marks, done, reached: Math.max(done, Math.min(t.reached, done)), seconds: Math.max(30, marks[marks.length - 1].at), chimed: false });
	arm();
	sendSchedule();
}

/**
 * The ship is at stop `index` -- said by the sailor, not guessed. The
 * clock stops counting toward it (and will not chime for it later),
 * and waits there for Traded as it would have at the estimate. `fresh`
 * is the run's marks laid again, when the pace has just been learned:
 * the stops still ahead are spaced as they say, from this one, so the
 * clock that rang early all run long is put right mid-run rather than
 * at the next cast-off.
 */
export function arrivedAt(index, fresh = null) {
	const t = timerNow();
	if (!t || !t.marks.length) return;
	const byK = t.marks.some(m => Number.isFinite(m.k));
	const i = byK ? t.marks.findIndex(m => m.k === index) : Math.floor(index);
	if (i < t.done || i < 0 || i >= t.marks.length) return;
	const ran = Math.max(1, Math.round((Date.now() - t.startedAt) / 1000));
	const marks = t.marks.map(m => ({ ...m }));
	const was = marks[i].at;
	marks[i].at = Math.min(was, ran);
	const same = Array.isArray(fresh) && fresh.length === marks.length && fresh.every((m, j) => !byK || m.k === marks[j].k);
	for (let j = i + 1; j < marks.length; j++) {
		marks[j].at = same ? marks[i].at + (fresh[j].at - fresh[i].at) + (marks[i].hold - fresh[i].hold) : marks[j].at + (marks[i].at - was);
		marks[j].hold = same ? fresh[j].hold : marks[j].hold;
	}
	write({ ...t, marks, reached: Math.max(t.reached, i + 1), seconds: Math.max(30, marks[marks.length - 1].at), chimed: false });
	arm();
	sendSchedule();
}

/**
 * The moments this clock is going to chime at, handed to the server so
 * that every device of the account hears them. What is sent depends on
 * what was asked for: stop by stop, every mark; the whole run, only its
 * end. Sent again whenever the clock is re-based or the choice
 * changes, since the schedule is replaced rather than added to.
 */
export function sendSchedule() {
	if (!pushOn()) return;
	const t = timerNow();
	if (!t) return clearAlerts(TAG);
	const from = t.startedAt;
	const each = marksMode() === 'each';
	const marks = t.marks.length ? t.marks : [{ at: t.seconds, label: t.label }];
	const alerts = marks
		.map((m, i) => ({ m, i, last: i === marks.length - 1 }))
		// Only the next stop is known: the ones after it come when Traded is
		// pressed, and are sent again then.
		.filter(({ i, last }) => (each || last) && i === t.done)
		.map(({ m, i, last }) => ({
			at: from + m.at * 1000,
			title: last ? (t.marks.length ? T('The run should be done') : T('The ship should be in')) : T('{stop} should be in reach', { stop: m.label || T('A stop') }),
			body: last
				? T('{stop} — every stop on the run has come up.', { stop: m.label || t.label || T('the last stop') })
				: T('Stop {n} of {total} — {left} more after this one.', { n: i + 1, total: marks.length, left: marks.length - i - 1 })
		}));
	putAlerts(TAG, alerts);
}

export function stopTimer() {
	write(null);
	arm();
	if (pushOn()) clearAlerts(TAG);
}

/**
 * The clock set back to nought and run again from now, at the estimate
 * it was first given.
 *
 * A clock that is only ever started by casting off, and can only be
 * thrown away, is wrong for as long as the sailor is away from the
 * keyboard -- and somebody who wanders off from a ship on auto-path is
 * exactly who this was written for. Oni sailed a run, left the desk,
 * came back to a clock long past the end of a short run, and asked how
 * to start it again. He could not: the only control was a cross, and
 * the cross meant forget it.
 *
 * The marks go back to where they were first laid rather than to
 * wherever ticking the stops off moved them, so a run sailed again
 * chimes at its own legs and not at the last attempt's drift.
 */
export function restartTimer() {
	const now = timerNow();
	if (!now) return null;
	const base = now.base || { seconds: now.seconds, marks: now.marks };
	const marks = Array.isArray(base.marks) ? base.marks : [];
	write({
		...now, base, startedAt: Date.now(), chimed: false, done: 0, reached: 0,
		marks, seconds: Math.max(30, marks.length ? marks[marks.length - 1].at : base.seconds)
	});
	arm();
	sendSchedule();
	return timerNow();
}

/**
 * How it stands: seconds run, seconds left to the end (negative once
 * past), whether the end has been passed, and -- when the clock is
 * following a run -- the stop it is on its way to and how far off it
 * is. `next` is null once the last one is behind.
 */
export function timerState(now = Date.now()) {
	const t = timerNow();
	if (!t) return null;
	const ran = Math.max(0, Math.round((now - t.startedAt) / 1000));
	// The stop the ship is making for is the first not yet passed. Once
	// its time has come the clock waits there -- counting nothing more,
	// chiming for nothing further -- until Traded is pressed for it.
	const at = t.done < t.marks.length ? t.done : -1;
	const due = at >= 0 && ran >= t.marks[at].at;
	const wait = due ? { ...t.marks[at], i: at, over: ran - t.marks[at].at } : null;
	const next = at >= 0 && !due ? { ...t.marks[at], i: at, left: t.marks[at].at - ran } : null;
	// While it waits, the end moves with it: what is left is the rest of
	// the run after this stop, and it is not over until the last is passed.
	const left = wait ? t.seconds - t.marks[at].at : t.seconds - ran;
	const over = t.marks.length ? t.done >= t.marks.length && ran >= t.seconds : ran >= t.seconds;
	return { ...t, ran, left, over, next, wait, here: null, stops: t.marks.length };
}

/* ------------------------------------------------------------------ *
 * the chime
 * ------------------------------------------------------------------ */

/** Whether the timer makes any sound at all; a notification is asked
 *  for apart, since one is the browser's business and the other is not. */
export const soundOn = () => soundKind() !== 'off';

/**
 * Whether the chimes go to every device the account has, rather than
 * only to the tab that set them. The clock is still kept here -- the
 * page is what counts the seconds -- but the moments are handed to the
 * server, which says them again to the phone in a pocket and the
 * desktop behind the game. Needs a sign-in: without an account there is
 * nothing to say "these devices are the same sailor".
 */
export const pushOn = () => store.getSetting('timerPush', false) === true && canReachDevices();
export const canPush = () => canReachDevices();

/** The tag every chime of a sailing clock is filed under: one clock,
 *  one schedule, so setting it again replaces what was there. */
const TAG = 'sail';

let ctx = null;

/**
 * Three beeps, the way a microwave says it is done: a short square
 * note, twice, then a third. Made with an oscillator so there is no
 * file to ship and nothing to load when the app is offline.
 *
 * A browser will not let a page make a sound until the person has
 * pressed something, which is why this is only ever reached from a
 * timer the sailor started by hand -- that press is the permission.
 */
/**
 * The audio woken without a sound. A browser will not let a page make
 * a noise until somebody has pressed something, and the press that
 * starts the clock is the only one that is going to come -- so the
 * context is made and resumed there, minutes before it is needed.
 */
export function unlockSound() {
	try {
		const Ctor = window.AudioContext || window.webkitAudioContext;
		if (!Ctor) return;
		ctx = ctx || new Ctor();
		if (ctx.state === 'suspended') ctx.resume();
	} catch { /* no audio on this device */ }
}

/**
 * The sounds on offer. A ship's bell is the one this is for: the run is
 * a watch, the stops are the hours of it, and a bell is what a ship has
 * always said them with. The beeps are kept for anyone who wants a
 * timer rather than a ship.
 */
export const SOUND_CHOICES = [
	['bell', TT('a ship’s bell'), TT('Struck bronze: a pair as each stop comes up, and eight bells — the end of the watch — when the run is done')],
	['beeps', TT('three beeps'), TT('The plain microwave sort')],
	['off', TT('no sound'), TT('Nothing here; a notification can still be shown')]
];

/** Which sound, reading the older on-or-off setting as one of these. */
export function soundKind() {
	const raw = store.getSetting('timerSound', 'bell');
	if (raw === false) return 'off';
	if (raw === true) return 'bell';
	return SOUND_CHOICES.some(([id]) => id === raw) ? raw : 'bell';
}
export const setSoundKind = kind => store.setSetting('timerSound', SOUND_CHOICES.some(([id]) => id === kind) ? kind : 'bell');

/** The audio, made when it is first wanted and kept for the session. */
function audio() {
	const Ctor = window.AudioContext || window.webkitAudioContext;
	if (!Ctor) return null;
	ctx = ctx || new Ctor();
	if (ctx.state === 'suspended') ctx.resume();
	return ctx;
}

/**
 * One strike of a bell, at `t0`.
 *
 * A bell is not a note: the metal rings at partials that are not whole
 * multiples of anything, which is why a sine wave sounds like a phone
 * and a bell sounds like a bell. This is the old FM way of getting
 * there -- one oscillator bending another's pitch, at a ratio chosen to
 * be nothing like a harmonic -- with the bending dying away far faster
 * than the tone, so the strike is bright and clangorous and what is
 * left behind it is almost pure. A second, quieter voice a fifth and an
 * octave up, dying sooner still, is the hammer on the bronze.
 */
function strike(at, t0, { f = 660, gain = 0.22, ring = 2.6 } = {}) {
	const voice = (freq, level, ratio, len, index) => {
		const car = at.createOscillator();
		const mod = at.createOscillator();
		const depth = at.createGain();
		const amp = at.createGain();
		car.frequency.value = freq;
		mod.frequency.value = freq * ratio;
		// The clang: the modulation is deep at the strike and gone in a
		// fifth of a second, which is exactly how long a bell sounds
		// like a hammer before it sounds like a bell.
		depth.gain.setValueAtTime(freq * index, t0);
		depth.gain.exponentialRampToValueAtTime(freq * 0.01, t0 + 0.22);
		amp.gain.setValueAtTime(0.0001, t0);
		amp.gain.exponentialRampToValueAtTime(level, t0 + 0.004);
		amp.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
		mod.connect(depth).connect(car.frequency);
		car.connect(amp).connect(at.destination);
		mod.start(t0); car.start(t0);
		mod.stop(t0 + len); car.stop(t0 + len);
	};
	// 1.41 is about as far from a harmonic as a ratio gets, which is
	// what makes this bronze rather than brass.
	voice(f, gain, 1.41, ring, 2.4);
	voice(f * 3.01, gain * 0.35, 1.73, ring * 0.35, 1.6);
}

/**
 * The bell, struck in pairs the way a ship's is. `pairs` of two: one
 * pair as a stop comes up, four -- eight bells, the end of the watch --
 * when the run is done.
 */
export function bell(pairs = 1, into = null) {
	const at = into || audio();
	if (!at) return;
	const t = at.currentTime + 0.02;
	for (let p = 0; p < pairs; p++) {
		strike(at, t + p * 0.92, { f: 660, gain: 0.22 });
		strike(at, t + p * 0.92 + 0.33, { f: 652, gain: 0.19 });
	}
}

/** The older sound: a short square note, so many times over. */
export function beeps(n = 3, into = null) {
	const at = into || audio();
	if (!at) return;
	const start = at.currentTime;
	for (let i = 0; i < n; i++) {
		const t0 = start + i * 0.22;
		const osc = at.createOscillator();
		const gain = at.createGain();
		osc.type = 'square';
		osc.frequency.value = 880;
		// A flat note clicks at both ends; a quick ramp in and out is
		// what makes it read as a beep rather than a fault.
		gain.gain.setValueAtTime(0.0001, t0);
		gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
		gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
		osc.connect(gain).connect(at.destination);
		osc.start(t0);
		osc.stop(t0 + 0.18);
	}
}

/** The run is done: eight bells, or the three beeps. */
export function chime() {
	if (soundKind() === 'off') return;
	try {
		if (soundKind() === 'bell') bell(4); else beeps(3);
	} catch { /* no audio on this device: the notification still lands */ }
}

/** A stop come up: one pair of the bell, or a single beep -- the end of
 *  the run is still the thing that sounds like an ending. */
export function chimeStop() {
	if (soundKind() === 'off') return;
	try {
		if (soundKind() === 'bell') bell(1); else beeps(1);
	} catch { /* no audio on this device */ }
}

/* ------------------------------------------------------------------ *
 * Notifications, as the four engines actually do them
 * ------------------------------------------------------------------ *
 *
 * The plain `new Notification(...)` works on a desktop and on nothing
 * else. Chrome and Brave on Android throw on the constructor outright
 * -- a notification there has to come from the service worker -- and
 * Safari has the API only once the app is on the Home Screen, where it
 * is again the worker that shows it. Firefox for Android has no
 * Notification API at all. So: the worker first, the constructor as the
 * fallback, and a plain answer when neither is going to happen, because
 * a button that quietly does nothing is worse than one that is not
 * there.
 */

/** Whether the app is running as its own window rather than in a tab.
 *  On Safari this is the difference between having notifications and
 *  not having them. */
export const installed = () => {
	try {
		return window.navigator.standalone === true
			|| (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
	} catch {
		return false;
	}
};

/**
 * What this browser will do about notifications, right now:
 *
 *   'granted'  -- yes, and it has said so
 *   'default'  -- it will ask
 *   'denied'   -- it has been asked and said no
 *   'install'  -- Safari in a tab: they arrive with the Home Screen app
 *   'none'     -- this browser does not do them at all
 */
export function notifySupport() {
	// A page served over plain http to anything but localhost is not a
	// secure context, and no browser will show a notification from one
	// -- nor register the worker that would have shown it. Testing the
	// app from a phone at the desktop's address on the local network is
	// exactly that case, and it is worth saying so rather than leaving a
	// button that does nothing.
	if (typeof window !== 'undefined' && window.isSecureContext === false) return 'insecure';
	if (typeof Notification === 'undefined') return installed() ? 'none' : 'install';
	return Notification.permission === 'granted' ? 'granted'
		: Notification.permission === 'denied' ? 'denied' : 'default';
}

/** Whether a notification can be shown without asking again. */
export const canNotify = () => notifySupport() === 'granted';

/**
 * Ask the browser, and say what it answered. Safari's older form takes
 * a callback and returns nothing, the rest return a promise; both are
 * accepted here rather than guessing which is in front of us.
 */
export async function askNotify() {
	const state = notifySupport();
	if (state !== 'default') return state;
	return new Promise(resolve => {
		let done = false;
		const settle = perm => { if (!done) { done = true; resolve(perm || Notification.permission || 'denied'); } };
		try {
			const asked = Notification.requestPermission(settle);
			if (asked && typeof asked.then === 'function') asked.then(settle, () => settle(Notification.permission));
		} catch {
			settle(Notification.permission);
		}
	});
}

/**
 * Show one. The worker is asked first because on a phone it is the only
 * thing that can; the constructor is there for a desktop with no worker
 * registered yet. Returns whether anything was actually shown, so the
 * caller can say so.
 */
export async function showNote(title, body, tag = 'bdo-sail-timer') {
	if (!canNotify()) return false;
	const opts = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: '/#barter' } };
	try {
		// getRegistration rather than `ready`: `ready` never settles when
		// no worker is registered, and this must not hang a chime.
		const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
		if (reg && typeof reg.showNotification === 'function') {
			await reg.showNotification(title, opts);
			return true;
		}
	} catch { /* fall through to the constructor */ }
	try {
		const n = new Notification(title, opts);
		n.onclick = () => { try { window.focus(); n.close(); } catch { /* the tab is gone */ } };
		return true;
	} catch {
		// Android Chrome and Brave land here: the constructor is illegal
		// and the worker was not there. Nothing to show.
		return false;
	}
}

function notify(title, body) {
	// With the account's own chimes armed, the same words are on their
	// way to every device -- this one included -- and saying it twice
	// here would be two notifications for one stop.
	if (pushOn()) return;
	showNote(title, body);
}

/* ------------------------------------------------------------------ *
 * when it goes off
 * ------------------------------------------------------------------ */

let pending = null;
let redraw = null;

/**
 * The page's own hand on the timer: `onFire` is called when it goes
 * off, so the screen showing it can repaint. Called once at boot; the
 * timeout is re-armed whenever the timer changes, and again when the
 * tab comes back, since a sleeping tab's timers do not keep time.
 */
export function watchTimer(onFire = null) {
	redraw = onFire;
	arm();
	if (typeof document !== 'undefined') {
		document.addEventListener('visibilitychange', () => { if (!document.hidden) arm(); });
	}
}

function arm() {
	if (pending) { clearTimeout(pending); pending = null; }
	const t = timerState();
	if (!t) return;
	// The next thing to sound: a stop the ship has reached, or the end
	// of the run. Either can already be behind us -- a tab asleep for
	// ten minutes comes back to several of them at once -- so the check
	// is "has it gone by", not "is it now".
	if (t.marks.length) {
		if (t.done < t.marks.length && t.reached <= t.done && t.ran >= t.marks[t.done].at) return fireMark();
		if (t.done < t.marks.length && t.reached > t.done) return;   // waiting at a stop: nothing to count to
		if (t.done >= t.marks.length && !t.chimed) return fireEnd();
	} else if (t.over && !t.chimed) return fireEnd();
	const wait = t.marks.length && t.done < t.marks.length ? t.marks[t.done].at - t.ran : t.left;
	if (t.chimed && !(t.marks.length && t.done < t.marks.length)) return;
	// A timeout longer than the browser will hold is re-armed on the way.
	pending = setTimeout(arm, Math.min(Math.max(wait, 0) * 1000 + 50, 60000));
}

/**
 * A stop reached. The last one is the end of the run and sounds like
 * it; the ones before only sound at all when the sailor asked for stop
 * by stop -- but they are still counted off, so the chip can say which
 * stop is next either way.
 */
function fireMark() {
	const t = timerNow();
	if (!t || t.done >= t.marks.length) return;
	const mark = t.marks[t.done];
	const done = t.done + 1;
	const last = done >= t.marks.length;
	// Reached, and chimed for -- not passed: that is the sailor's press.
	write({ ...t, reached: done, chimed: last });
	if (last) {
		chime();
		notify(T('The run should be done'), T('{stop} — every stop on the run has come up.', { stop: mark.label || t.label || T('the last stop') }));
	} else if (marksMode() === 'each') {
		chimeStop();
		const left = t.marks.length - done;
		notify(T('{stop} should be in reach', { stop: mark.label || T('A stop') }), T('Stop {n} of {total} — {left} more after this one.', { n: done, total: t.marks.length, left }));
	}
	if (redraw) redraw();
	arm();
}

function fireEnd() {
	const t = timerNow();
	if (!t || t.chimed) return;
	write({ ...t, chimed: true });
	chime();
	notify(T('The ship should be in'), t.label ? T('{label} — the time you set is up.', { label: t.label }) : T('The time you set is up.'));
	if (redraw) redraw();
}

/* ------------------------------------------------------------------ *
 * what it looks like
 * ------------------------------------------------------------------ */

/** A span of seconds as a sailor reads it: 45 s, 4 m 12 s, 1 h 06 m. */
export function spanText(secs) {
	const s = Math.max(0, Math.round(secs));
	if (s < 60) return T('{s} s', { s });
	const m = Math.floor(s / 60), rest = s % 60;
	if (m < 60) return T('{m} m {s} s', { m, s: String(rest).padStart(2, '0') });
	return T('{h} h {m} m', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}

/**
 * The chip: the clock when one is running, the ways to start one when
 * none is. `suggest` is the run's own estimate in seconds, offered
 * first because it is the answer nine times in ten; the minutes beside
 * it are for a ship sent off without a plan on this page.
 *
 * The clock's text carries `data-timer-clock` so the second hand can
 * move without repainting the screen under it.
 */
export function timerHTML({ suggest = 0, label = '', marks = [] } = {}) {
	const t = timerState();
	// The bell says what this browser is actually going to do: ask,
	// explain why it cannot, or nothing at all once it has said yes.
	const support = notifySupport();
	const bellText = { default: T('🔔 notify me too'), denied: T('🔔 blocked'), install: T('🔔 on the Home Screen'), insecure: T('🔔 needs https'), none: '' };
	const bellWhy = {
		default: T('Ask the browser for a notification as well, so a chime lands with the tab in the background'),
		denied: T('This site is blocked from showing notifications — press to see where to change it'),
		install: T('Safari shows notifications once the app is on the Home Screen — press to see how'),
		insecure: T('This page is served over plain http, where no browser allows notifications — press to see what does work'),
		none: ''
	};
	const bell = support === 'granted' || support === 'none' ? ''
		: `<button class="chip tiny${support === 'denied' || support === 'insecure' ? ' warn' : ''}" data-act="barter-timer-notify" title="${esc(bellWhy[support])}">${bellText[support]}</button>`;
	// What it sounds like, and what it sounds like right now: a press
	// moves to the next sound and plays it, so a sailor can settle on
	// one in three presses rather than starting a run to find out.
	const sound = soundKind();
	const soundName = (SOUND_CHOICES.find(([id]) => id === sound) || SOUND_CHOICES[0])[1];
	const soundWhy = (SOUND_CHOICES.find(([id]) => id === sound) || SOUND_CHOICES[0])[2];
	const ear = `<button class="chip tiny sail-sound${sound === 'off' ? ' off' : ''}" data-act="barter-timer-sound" title="${T('{why} — press to hear the next one', { why: esc(said(soundWhy)) })}">${sound === 'off' ? '🔇' : '🔔'} ${esc(said(soundName))}</button>`;
	// Signed in, the chimes can be said again on every device the
	// account has -- the phone in a pocket while the game has the screen.
	const devices = canPush()
		? `<button class="chip tiny${pushOn() ? ' active' : ''}" data-act="barter-timer-devices" title="${pushOn() ? T('Chiming on every device signed in to this account; press to keep it to this one') : T('Chime on every device signed in to this account — the phone in your pocket as well as this tab')}">📱 ${pushOn() ? T('every device') : T('my devices too')}</button>`
		: '';
	// Which stops make a sound. Offered wherever a run is in hand, and
	// beside a running clock that has stops of its own.
	const mode = marksMode();
	const modes = (marks.length || (t && t.marks.length))
		? `<span class="sail-timer-modes" role="group" aria-label="${T('What chimes')}">${MARK_CHOICES.map(([id, text, why]) => `<button class="chip tiny${mode === id ? ' active' : ''}" data-act="barter-timer-marks" data-id="${id}" title="${esc(said(why))}">${esc(said(text))}</button>`).join('')}</span>`
		: '';
	if (!t) {
		// The estimate as a sailor reads it: a three-hour run said "354 m"
		// before this, which is a number rather than a time.
		const stops = marks.length ? ` · ${marks.length === 1 ? T('{n} stop', { n: marks.length }) : T('{n} stops', { n: marks.length })}` : '';
		const run = suggest > 0
			? `<button class="chip tiny primary" data-act="barter-timer-start" data-secs="${Math.round(suggest)}" data-label="${esc(label)}" data-marks="${esc(JSON.stringify(marks))}" title="${marks.length ? T('Start the clock at this run\'s own estimate, chiming at every stop on the way') : T('Start the clock at this run\'s own estimate')}">⏱ ${T('start')} · ≈ ${esc(spanText(suggest))}${stops}</button>`
			: '';
		// Nothing to start when there is no run in hand: the clock is the
		// run's own, not a kitchen timer.
		if (!run) return `<span class="sail-timer">${ear}${bell}${devices}</span>`;
		return `<span class="sail-timer">${run}${modes}${ear}${bell}${devices}</span>`;
	}
	const pct = Math.max(0, Math.min(100, (t.ran / t.seconds) * 100));
	// The run's name is the chime's to say, not the chip's: on a phone a
	// long one pushes the clock off its own line.
	return `<span class="sail-timer running${t.over ? ' over' : ''}"${t.label ? ` title="${esc(t.label)}"` : ''}>
		<span class="sail-timer-bar"><i style="width:${pct.toFixed(1)}%"></i></span>
		<b data-timer-clock>${esc(clockText(t))}</b>
		<span class="sail-timer-ctl">${modes}${ear}${devices}
		<button class="chip tiny sail-timer-again" data-act="barter-timer-restart" title="${T('Set the clock back to nought and run it again from now, at this run’s own estimate')}">↻ ${T('again')}</button>
		<button class="chip tiny sail-timer-off" data-act="barter-timer-stop" title="${T('Stop the clock and forget it')}">${T('stop')}</button></span>
	</span>`;
}

/**
 * What the clock says right now: on a run, the stop it is making for
 * and how far off, since that is what a sailor is waiting on; on a
 * clock set by hand, how long it has run of what it was set for.
 */
export function clockText(t = timerState()) {
	if (!t) return '';
	if (t.wait) return T('at {stop} · stop {n} of {total} — waiting for Traded', { stop: t.wait.label || T('stop {n}', { n: t.wait.i + 1 }), n: t.wait.i + 1, total: t.stops });
	if (t.next) return T('{left} to {stop} · stop {n} of {total}', { left: spanText(t.next.left), stop: t.next.label || T('stop {n}', { n: t.next.i + 1 }), n: t.next.i + 1, total: t.stops });
	if (t.over) return T('{ran} · {past} past the {set} it was set for', { ran: spanText(t.ran), past: spanText(t.ran - t.seconds), set: spanText(t.seconds) });
	return T('{ran} of ≈ {of}', { ran: spanText(t.ran), of: spanText(t.seconds) });
}


/**
 * The second hand: the clock's own text brought up to date in place,
 * once a second while one is running and never when none is. A repaint
 * would be a heavy way to move a second hand, and would take the
 * focus out of whatever the sailor was typing in.
 */
let beat = null;
export function tickTimer() {
	const els = typeof document !== 'undefined' ? document.querySelectorAll('[data-timer-clock]') : [];
	const t = timerState();
	if (!els.length || !t) {
		if (beat) { clearInterval(beat); beat = null; }
		return;
	}
	const text = clockText(t);
	for (const el of els) el.textContent = text;
	if (!beat) beat = setInterval(tickTimer, 1000);
}

/**
 * The bell pressed: ask, say what came of it, and -- when the answer is
 * yes -- show one there and then, so the sailor sees what a chime looks
 * like on this device rather than finding out ten minutes into a run.
 */
export async function wantNotify() {
	const before = notifySupport();
	if (before === 'insecure') {
		toast(T('Notifications need a secure page. This one is plain http, so no browser will allow them — they work on the live site, or at localhost. The clock still beeps here.'), true);
		return 'insecure';
	}
	if (before === 'none') {
		toast(T('This browser has no notifications — the clock will still beep while this tab is open'));
		return 'none';
	}
	if (before === 'install') {
		toast(T('On iPhone, notifications arrive once the app is added to the Home Screen — Share ▸ Add to Home Screen'), true);
		return 'install';
	}
	if (before === 'denied') {
		toast(T('Notifications are blocked for this site — turn them on in the browser’s site settings'), true);
		return 'denied';
	}
	const perm = await askNotify();
	if (perm !== 'granted') {
		toast(perm === 'denied' ? T('The browser said no — it can be changed in the site settings') : T('No answer from the browser, so nothing has changed'));
		return perm;
	}
	const shown = await showNote(T('Notifications are on'), T('This is what a chime will look like when the ship is in.'), 'bdo-sail-hello');
	toast(shown
		? T('Notifications are on — one just came through to show you')
		: T('The browser allowed them but would not show one; the clock will still beep here'), true);
	return 'granted';
}

/**
 * Turn the account's own chimes on or off. Turning them on needs the
 * browser's permission and a subscription -- made for this and nothing
 * else, so nobody is signed up for the Vell reminder by the back door.
 */
export async function togglePush() {
	if (pushOn()) {
		store.setSetting('timerPush', false);
		await clearAlerts(TAG);
		toast(T('Chimes stay in this tab now'));
		return false;
	}
	if (!canReachDevices()) return false;
	const perm = await askNotify();
	if (perm !== 'granted') {
		toast(T('The browser would not allow notifications — check the site settings'));
		return false;
	}
	const region = pushRegion();
	const ok = await subscribeFor({ region: region || 'na', vell: null });
	store.setSetting('timerPush', ok === true);
	if (ok) {
		sendSchedule();
		// Each device has its own subscription, so each has to be told
		// once. Saying so here is cheaper than the question it saves.
		toast(T('Chimes will reach this device with the tab shut — turn it on once on every device you want them on'), true);
	} else toast(T('This copy of the app cannot send to your other devices'));
	return ok === true;
}

/** The stops a start button carries, or none if it carries nothing a
 *  reader can make sense of. */
function readMarks(raw) {
	try {
		const list = JSON.parse(raw || '[]');
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
}

/** A press on one of the chip's buttons. True when it was one of ours
 *  and the screen should be drawn again. */
export function timerAction(act, el, then = null) {
	if (act === 'barter-timer-start') {
		startTimer(Number(el.dataset.secs) || 600, el.dataset.label || '', readMarks(el.dataset.marks));
		// The press that starts the clock is also what lets the page make
		// a sound later: the browser wants a gesture, and this is it. It
		// wakes the audio without making a noise -- a beep on starting
		// would be the timer crying wolf.
		if (soundOn()) unlockSound();
		return true;
	}
	if (act === 'barter-timer-stop') { stopTimer(); toast(T('The clock is stopped')); return true; }
	if (act === 'barter-timer-restart') {
		const t = restartTimer();
		if (t) toast(T('The clock is running again — {span} to go', { span: spanText(t.seconds) }));
		return true;
	}
	if (act === 'barter-timer-sound') {
		// Round the choices, and let the new one be heard at once -- the
		// press is also what wakes the audio, so the first one is not
		// swallowed.
		const ids = SOUND_CHOICES.map(([id]) => id);
		const next = ids[(ids.indexOf(soundKind()) + 1) % ids.length];
		setSoundKind(next);
		if (next !== 'off') { unlockSound(); chimeStop(); }
		return true;
	}
	if (act === 'barter-timer-marks') {
		setMarksMode(el.dataset.id);
		// Which marks chime has changed, so what the server was told has
		// to change with it.
		sendSchedule();
		return true;
	}
	if (act === 'barter-timer-devices') {
		togglePush().then(() => { if (then) then(); });
		return true;
	}
	if (act === 'barter-timer-notify') {
		// The browser's own prompt is answered in its own time: the chip
		// is drawn again when it has been, so the ask goes away -- and
		// whatever it answered is said out loud, because a button that
		// looks like it did nothing is the one thing worse than a no.
		wantNotify().then(() => { if (then) then(); });
		return true;
	}
	return false;
}
