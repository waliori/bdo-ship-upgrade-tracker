// The game's clocks, in one place.
//
// Three resets pace a sailor's day and none of them is midnight where
// the player sits: daily quests turn over at 00:00 UTC, the barter
// refresh count refills at 06:00 UTC (the NA/EU update history for
// "Barter: Ship Material" says so in as many words), and weekly quests
// reset on Thursday at 00:00 UTC. Vell keeps a timetable of its own per
// region -- read off mmotimer.com on 2026-08-30, and it moves with
// events, so the app says when it was checked and lets the times be
// corrected in place rather than pretending they are fixed.

export const DAILY_RESET_UTC = 0;
export const BARTER_RESET_UTC = 6;
export const WEEKLY_RESET = { day: 4, hour: 0 };   // Thursday 00:00 UTC

const DAY = 86400e3;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The day a daily is on: a date that turns over at the reset, not at
 *  the player's midnight. */
export function dayKey(now = Date.now(), resetHour = DAILY_RESET_UTC) {
	return new Date(now - resetHour * 3600e3).toISOString().slice(0, 10);
}

/** The week a weekly is on: the date of the Thursday that began it. */
export function weekKey(now = Date.now()) {
	const shifted = new Date(now - WEEKLY_RESET.hour * 3600e3);
	const back = (shifted.getUTCDay() - WEEKLY_RESET.day + 7) % 7;
	return 'W' + new Date(shifted.getTime() - back * DAY).toISOString().slice(0, 10);
}

/** The period a quest of this cadence is in right now -- the key a
 *  "done" mark is stamped with, so it expires by itself at the reset. */
export function periodKey(cadence, now = Date.now()) {
	if (cadence === 'daily') return dayKey(now);
	if (cadence === 'weekly') return weekKey(now);
	return 'once';
}

/** Milliseconds until the next `hour`:00 UTC. */
export function untilHourUTC(hour, now = Date.now()) {
	const d = new Date(now);
	const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour);
	return next > now ? next - now : next + DAY - now;
}
export const untilDaily = (now = Date.now()) => untilHourUTC(DAILY_RESET_UTC, now);
export const untilBarter = (now = Date.now()) => untilHourUTC(BARTER_RESET_UTC, now);

export function untilWeekly(now = Date.now()) {
	const d = new Date(now);
	const ahead = (WEEKLY_RESET.day - d.getUTCDay() + 7) % 7;
	let next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ahead, WEEKLY_RESET.hour);
	if (next <= now) next += 7 * DAY;
	return next - now;
}

/** "2 d 3 h", "5 h 12 m", "48 m", "under a minute". */
export function countdown(ms) {
	if (!(ms > 0)) return 'now';
	const m = Math.floor(ms / 60000);
	if (m < 1) return 'under a minute';
	const d = Math.floor(m / 1440);
	const h = Math.floor((m % 1440) / 60);
	const min = m % 60;
	if (d) return `${d} d ${h} h`;
	if (h) return `${h} h ${min} m`;
	return `${min} m`;
}

/* ------------------------------------------------------------------ *
 * Time zones: a spawn is a wall-clock time on a server's clock.
 * ------------------------------------------------------------------ */

/** The zone's offset from UTC at that instant, in minutes. */
function zoneOffset(zone, at) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
		hour: '2-digit', minute: '2-digit', second: '2-digit'
	}).formatToParts(new Date(at));
	const get = t => Number(parts.find(p => p.type === t).value);
	const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
	return Math.round((wall - Math.floor(at / 1000) * 1000) / 60000);
}

/** The calendar date, in the zone, of an instant. */
function wallDate(zone, at) {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short'
	}).formatToParts(new Date(at));
	const get = t => parts.find(p => p.type === t).value;
	return { y: Number(get('year')), m: Number(get('month')) - 1, d: Number(get('day')), day: DAYS.indexOf(get('weekday')) };
}

/** The instant at which the zone's clocks read y-m-d h:min. Two passes
 *  settle a date that sits across a daylight-saving change. */
export function zonedInstant(zone, y, m, d, h, min = 0) {
	let at = Date.UTC(y, m, d, h, min);
	for (let i = 0; i < 2; i++) at = Date.UTC(y, m, d, h, min) - zoneOffset(zone, at) * 60000;
	return at;
}

/**
 * The next time a timetable fires. `times` are { day, hour, minute } on
 * the clock of `zone`; the answer is an instant and which entry it is.
 */
export function nextSpawn(zone, times, now = Date.now()) {
	let best = null;
	for (const t of times || []) {
		for (let k = 0; k < 9; k++) {
			const w = wallDate(zone, now + k * DAY);
			if (w.day !== t.day) continue;
			const at = zonedInstant(zone, w.y, w.m, w.d, t.hour, t.minute || 0);
			if (at > now && (!best || at < best.at)) best = { at, entry: t };
		}
	}
	return best;
}

/** Vell's timetable by server, on the server's own clock. Checked
 *  against mmotimer.com on 2026-08-30. */
export const VELL = {
	eu: { label: 'EU', zone: 'Europe/Berlin', times: [{ day: 3, hour: 19 }, { day: 0, hour: 14 }] },
	na: { label: 'NA', zone: 'America/Los_Angeles', times: [{ day: 3, hour: 17 }, { day: 0, hour: 14 }] }
};
export const VELL_CHECKED = '2026-08-30';

/** "Wed 19:00" on whatever clock the entry is kept in. */
export function timeLabel(t) {
	return `${DAYS[t.day]} ${String(t.hour).padStart(2, '0')}:${String(t.minute || 0).padStart(2, '0')}`;
}

/** The same instant on the player's own clock: "Sun 13:00". */
export function localLabel(at) {
	const d = new Date(at);
	return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ *
 * The ticking parts of the page.
 * ------------------------------------------------------------------ */

const UNTIL = { daily: untilDaily, weekly: untilWeekly, barter: untilBarter };

/** Every countdown the page shows, brought up to date in place -- a
 *  repaint would be a heavy way to move a minute hand. */
export function tickClocks(now = Date.now()) {
	for (const el of document.querySelectorAll('[data-until]')) {
		const kind = el.dataset.until;
		const ms = UNTIL[kind] ? UNTIL[kind](now) : Number(el.dataset.at) - now;
		el.textContent = countdown(ms);
	}
}

let ticking = null;
let lastDay = '';
let lastWeek = '';
let lastBarter = '';

/** Start the minute hand; `onRollover` is called once when a reset
 *  passes while the page is open, so a done quest becomes undone and
 *  the barter day's ticks clear without a reload. */
export function startClocks(onRollover) {
	if (ticking) return;
	lastDay = dayKey();
	lastWeek = weekKey();
	lastBarter = dayKey(Date.now(), BARTER_RESET_UTC);
	const beat = () => {
		const now = Date.now();
		tickClocks(now);
		const d = dayKey(now), w = weekKey(now), b = dayKey(now, BARTER_RESET_UTC);
		if (d !== lastDay || w !== lastWeek || b !== lastBarter) {
			lastDay = d; lastWeek = w; lastBarter = b;
			if (onRollover) onRollover();
		}
	};
	ticking = setInterval(beat, 30000);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
}
