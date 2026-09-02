// The game's clocks, in one place.
//
// Three resets pace a sailor's day and none of them is midnight where
// the player sits: daily quests turn over, the barter refresh count
// refills, and weekly quests come round again. Each is a wall-clock time
// on a server's own clock, so it is worked out here the way Vell's
// spawns already were -- from the player's own browser, through Intl,
// with no server asked and nothing to be out of date but the table.
//
// What is actually known, and what is only assumed:
//
//   * NA and EU share one clock and it is UTC. The barter refill at
//     06:00 is Pearl Abyss' own NA/EU update history for "Barter: Ship
//     Material", in as many words. The 00:00 daily and the Thursday
//     weekly are community-tested for those two regions.
//   * Every other region is a guess -- and deliberately the same guess,
//     since no public source has tested them. altarofgaming, the most
//     careful of them, says outright that it has not. So those regions
//     carry `sure: false`, the screen says so, and the times can be
//     corrected in place. Better an admitted assumption than a number
//     presented as fact.
//
// Vell keeps a timetable of its own per region, read off mmotimer.com on
// 2026-08-30, on the same correctable footing.

export const DAILY_RESET_UTC = 0;
export const BARTER_RESET_UTC = 6;
export const WEEKLY_RESET = { day: 4, hour: 0 };   // Thursday 00:00 UTC
export const RESETS_CHECKED = '2026-09-01';

/**
 * When each region's day turns over, on that region's own clock.
 *
 * `zone` is what the hours below are read on, so a region that keeps
 * local time survives its own daylight saving without anything here
 * changing. `sure` is whether anybody has actually checked.
 */
export const REGION_CLOCK = {
	na: { zone: 'UTC', daily: 0, barter: 6, weekly: { day: 4, hour: 0 }, sure: true },
	eu: { zone: 'UTC', daily: 0, barter: 6, weekly: { day: 4, hour: 0 }, sure: true }
};
// The rest are assumed to keep the NA/EU clock until someone says
// otherwise -- which is what the app did for all of them before, only
// now it admits it.
for (const id of ['sea', 'mena', 'kr', 'ru', 'jp', 'th', 'tw', 'sa', 'console_eu', 'console_na', 'console_asia']) {
	REGION_CLOCK[id] = { zone: 'UTC', daily: 0, barter: 6, weekly: { day: 4, hour: 0 }, sure: false };
}

// The plan in force. Kept here rather than read from settings, because
// clock.js sits below the store and everything else in the app: the
// shell sets this when the region changes, and every countdown and
// period key on the page follows it without another import.
let standing = null;

/** Tell the clocks which region they are counting for. */
export function setResetPlan(plan) {
	standing = plan || null;
}

/** The plan the page is counting on right now. */
export function currentPlan() {
	return standing || REGION_CLOCK.na;
}

/** The reset table in force for a region, with any correction applied. */
export function resetPlan(region, override = null) {
	const base = REGION_CLOCK[region] || REGION_CLOCK.na;
	if (!override) return base;
	// A player who knows their own server outranks the table.
	return {
		zone: override.zone || base.zone,
		daily: Number.isFinite(override.daily) ? override.daily : base.daily,
		barter: Number.isFinite(override.barter) ? override.barter : base.barter,
		weekly: override.weekly || base.weekly,
		sure: true,
		custom: true
	};
}

const DAY = 86400e3;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The day a daily is on: a date that turns over at the reset, not at
 *  the player's midnight. */
export function dayKey(now = Date.now(), resetHour = DAILY_RESET_UTC) {
	return new Date(now - resetHour * 3600e3).toISOString().slice(0, 10);
}

/** The week a weekly is on: the date of the Thursday that began it. */
export function weekKey(now = Date.now(), weekly = WEEKLY_RESET) {
	const shifted = new Date(now - weekly.hour * 3600e3);
	const back = (shifted.getUTCDay() - weekly.day + 7) % 7;
	return 'W' + new Date(shifted.getTime() - back * DAY).toISOString().slice(0, 10);
}

/**
 * The period a quest of this cadence is in right now -- the key a "done"
 * mark is stamped with, so it expires by itself at the reset.
 *
 * The key has to turn over on the same clock the countdown counts to, or
 * a tick would clear at a different moment from the reset it belongs to.
 * So a region whose reset is not UTC gets its key from the last reset
 * instant rather than from a UTC date.
 */
export function periodKey(cadence, now = Date.now(), plan = standing) {
	if (cadence === 'daily') {
		if (plan && plan.zone !== 'UTC') return new Date(now - (DAY - untilHourIn(plan.zone, plan.daily, now))).toISOString().slice(0, 10);
		return dayKey(now, plan ? plan.daily : DAILY_RESET_UTC);
	}
	if (cadence === 'weekly') {
		if (plan && plan.zone !== 'UTC') return 'W' + new Date(now - (7 * DAY - untilWeekly(now, plan))).toISOString().slice(0, 10);
		return weekKey(now, plan ? plan.weekly : WEEKLY_RESET);
	}
	return 'once';
}

/** Milliseconds until the next `hour`:00 UTC. */
export function untilHourUTC(hour, now = Date.now()) {
	const d = new Date(now);
	const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour);
	return next > now ? next - now : next + DAY - now;
}
export const untilDaily = (now = Date.now(), plan = null) =>
	plan && plan.zone !== 'UTC' ? untilHourIn(plan.zone, plan.daily, now) : untilHourUTC(plan ? plan.daily : DAILY_RESET_UTC, now);
export const untilBarter = (now = Date.now(), plan = null) =>
	plan && plan.zone !== 'UTC' ? untilHourIn(plan.zone, plan.barter, now) : untilHourUTC(plan ? plan.barter : BARTER_RESET_UTC, now);

/** The same, on a zone's own clock: the next time it reads `hour`:00
 *  there, which survives that zone's daylight saving by itself. */
export function untilHourIn(zone, hour, now = Date.now()) {
	for (let k = 0; k < 3; k++) {
		const w = wallDate(zone, now + k * DAY);
		const at = zonedInstant(zone, w.y, w.m, w.d, hour);
		if (at > now) return at - now;
	}
	return DAY;
}

export function untilWeekly(now = Date.now(), plan = null) {
	const weekly = (plan && plan.weekly) || WEEKLY_RESET;
	if (plan && plan.zone !== 'UTC') {
		const next = nextSpawn(plan.zone, [{ day: weekly.day, hour: weekly.hour }], now);
		return next ? next.at - now : 7 * DAY;
	}
	const d = new Date(now);
	const ahead = (weekly.day - d.getUTCDay() + 7) % 7;
	let next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ahead, weekly.hour);
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

const UNTIL = {
	daily: now => untilDaily(now, currentPlan()),
	weekly: now => untilWeekly(now, currentPlan()),
	barter: now => untilBarter(now, currentPlan())
};

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
/** The barter day, on whichever clock the region refills on. */
export function barterKey(now = Date.now(), plan = standing) {
	if (plan && plan.zone !== 'UTC') return new Date(now - (DAY - untilHourIn(plan.zone, plan.barter, now))).toISOString().slice(0, 10);
	return dayKey(now, plan ? plan.barter : BARTER_RESET_UTC);
}

let lastDay = '';
let lastWeek = '';
let lastBarter = '';

/** Start the minute hand; `onRollover` is called once when a reset
 *  passes while the page is open, so a done quest becomes undone and
 *  the barter day's ticks clear without a reload. */
export function startClocks(onRollover, onTick = null) {
	if (ticking) return;
	// Read on the standing region's clock, so a reset that is not UTC
	// still clears the day's ticks at the moment its countdown reaches
	// zero rather than at some other hour.
	const marks = (now = Date.now()) => [
		periodKey('daily', now),
		periodKey('weekly', now),
		barterKey(now)
	];
	[lastDay, lastWeek, lastBarter] = marks();
	const beat = () => {
		const now = Date.now();
		tickClocks(now);
		if (onTick) onTick(now);
		const [d, w, b] = marks(now);
		if (d !== lastDay || w !== lastWeek || b !== lastBarter) {
			lastDay = d; lastWeek = w; lastBarter = b;
			if (onRollover) onRollover();
		}
	};
	ticking = setInterval(beat, 30000);
	document.addEventListener('visibilitychange', () => { if (!document.hidden) beat(); });
}
