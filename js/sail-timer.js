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

const NS = 'timer';

/** The presets offered when nothing is running: what a barter round
 *  usually takes, and a couple either side of it. */
export const TIMER_PRESETS = [5, 10, 15, 20, 30];

/**
 * The timer as saved: when it started, how long it was set for, what
 * it was set for, and whether it has already chimed. Null when none is
 * running. A timer older than a day is dropped rather than shown: it
 * belongs to a session that is long over.
 */
export function timerNow() {
	const t = store.getView(NS);
	if (!t || !(Number(t.startedAt) > 0) || !(Number(t.seconds) > 0)) return null;
	if (Date.now() - Number(t.startedAt) > 24 * 3600 * 1000) return null;
	return {
		startedAt: Number(t.startedAt),
		seconds: Number(t.seconds),
		label: typeof t.label === 'string' ? t.label.slice(0, 60) : '',
		chimed: t.chimed === true
	};
}

const write = t => store.setView(NS, t);

/** Start the clock. `seconds` is what it is set for, `label` what the
 *  chime will say it was. Starting again replaces what was running. */
export function startTimer(seconds, label = '') {
	const s = Math.max(30, Math.min(6 * 3600, Math.round(Number(seconds) || 0)));
	write({ startedAt: Date.now(), seconds: s, label: String(label || '').slice(0, 60), chimed: false });
	arm();
	return s;
}

export function stopTimer() {
	write(null);
	arm();
}

/** How it stands: seconds run, seconds left (negative once past), and
 *  whether the estimate has been passed. */
export function timerState(now = Date.now()) {
	const t = timerNow();
	if (!t) return null;
	const ran = Math.max(0, Math.round((now - t.startedAt) / 1000));
	return { ...t, ran, left: t.seconds - ran, over: ran >= t.seconds };
}

/* ------------------------------------------------------------------ *
 * the chime
 * ------------------------------------------------------------------ */

/** Whether the timer makes a sound; a notification is asked for apart,
 *  since one is the browser's business and the other is not. */
export const soundOn = () => store.getSetting('timerSound', true) !== false;
export const setSound = on => store.setSetting('timerSound', on === true);

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

export function chime() {
	if (!soundOn()) return;
	try {
		const Ctor = window.AudioContext || window.webkitAudioContext;
		if (!Ctor) return;
		ctx = ctx || new Ctor();
		if (ctx.state === 'suspended') ctx.resume();
		const at = ctx.currentTime;
		for (let i = 0; i < 3; i++) {
			const t0 = at + i * 0.22;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = 'square';
			osc.frequency.value = 880;
			// A flat note clicks at both ends; a quick ramp in and out is
			// what makes it read as a beep rather than a fault.
			gain.gain.setValueAtTime(0.0001, t0);
			gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
			osc.connect(gain).connect(ctx.destination);
			osc.start(t0);
			osc.stop(t0 + 0.18);
		}
	} catch { /* no audio on this device: the notification still lands */ }
}

/** Whether a notification can be shown without asking again. */
export const canNotify = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

/** Ask for notifications, if the browser has them and has not been
 *  asked. Returns what it ended up as. */
export async function askNotify() {
	if (typeof Notification === 'undefined') return 'unsupported';
	if (Notification.permission !== 'default') return Notification.permission;
	try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

function notify(label) {
	if (!canNotify()) return;
	try {
		const n = new Notification('The ship should be in', {
			body: label ? `${label} — the time you set is up.` : 'The time you set is up.',
			tag: 'bdo-sail-timer',
			icon: 'icon-192.png'
		});
		n.onclick = () => { try { window.focus(); n.close(); } catch { /* the tab is gone */ } };
	} catch { /* the browser said no after all */ }
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
	if (!t || t.chimed) return;
	if (t.over) return fire();
	// A timeout longer than the browser will hold is re-armed on the way.
	pending = setTimeout(arm, Math.min(t.left * 1000 + 50, 60000));
}

function fire() {
	const t = timerNow();
	if (!t || t.chimed) return;
	write({ ...t, chimed: true });
	chime();
	notify(t.label);
	if (redraw) redraw();
}

/* ------------------------------------------------------------------ *
 * what it looks like
 * ------------------------------------------------------------------ */

/** A span of seconds as a sailor reads it: 45 s, 4 m 12 s, 1 h 06 m. */
export function spanText(secs) {
	const s = Math.max(0, Math.round(secs));
	if (s < 60) return `${s} s`;
	const m = Math.floor(s / 60), rest = s % 60;
	if (m < 60) return `${m} m ${String(rest).padStart(2, '0')} s`;
	return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} m`;
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
export function timerHTML({ suggest = 0, label = '' } = {}) {
	const t = timerState();
	const bell = canNotify() ? '' : '<button class="chip tiny" data-act="barter-timer-notify" title="Ask the browser for a notification as well, so it lands with the tab in the background">🔔 notify me too</button>';
	if (!t) {
		const mins = suggest > 0 ? Math.max(1, Math.round(suggest / 60)) : 0;
		const run = mins
			? `<button class="chip tiny primary" data-act="barter-timer-start" data-secs="${Math.round(suggest)}" data-label="${esc(label)}" title="Start the clock at this run's own estimate">⏱ start · ≈ ${mins} m</button>`
			: '';
		return `<span class="sail-timer">${run}<span class="sail-timer-k">${run ? 'or' : '⏱ chime in'}</span>${TIMER_PRESETS.map(m => `<button class="chip tiny" data-act="barter-timer-start" data-secs="${m * 60}" data-label="${esc(label)}" title="Chime in ${m} minutes">${m}</button>`).join('')}<span class="sail-timer-k">m</span>${bell}</span>`;
	}
	const pct = Math.max(0, Math.min(100, (t.ran / t.seconds) * 100));
	const over = t.over;
	// The run's name is the chime's to say, not the chip's: on a phone a
	// long one pushes the clock off its own line.
	return `<span class="sail-timer running${over ? ' over' : ''}"${t.label ? ` title="${esc(t.label)}"` : ''}>
		<span class="sail-timer-bar"><i style="width:${pct.toFixed(1)}%"></i></span>
		<b data-timer-clock>${esc(clockText(t))}</b>
		<button class="map-x" data-act="barter-timer-stop" aria-label="Stop the clock" title="Stop the clock">×</button>
	</span>`;
}

/** What the clock says right now. */
export function clockText(t = timerState()) {
	if (!t) return '';
	if (t.over) return `${spanText(t.ran)} · ${spanText(t.ran - t.seconds)} past the ${spanText(t.seconds)} it was set for`;
	return `${spanText(t.ran)} of ≈ ${spanText(t.seconds)}`;
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

/** A press on one of the chip's buttons. True when it was one of ours
 *  and the screen should be drawn again. */
export function timerAction(act, el, then = null) {
	if (act === 'barter-timer-start') {
		startTimer(Number(el.dataset.secs) || 600, el.dataset.label || '');
		// The press that starts the clock is also what lets the page make
		// a sound later: the browser wants a gesture, and this is it. It
		// wakes the audio without making a noise -- a beep on starting
		// would be the timer crying wolf.
		if (soundOn()) unlockSound();
		return true;
	}
	if (act === 'barter-timer-stop') { stopTimer(); return true; }
	if (act === 'barter-timer-notify') {
		// The browser's own prompt is answered in its own time: the chip
		// is drawn again when it has been, so the ask goes away.
		askNotify().then(() => { if (then) then(); });
		return true;
	}
	return false;
}
