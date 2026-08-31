// How fast a build is actually moving, and when it lands at that pace.
//
// The plan says how much is left; the thing a grinder wants to know is
// how many more evenings that is. Each day a build is in the queue, the
// units it has covered are noted once; the pace is the change over the
// last fortnight, and the finish is the shortfall divided by it. The
// diary rides in the profile, so it syncs with the save and a phone and
// a desktop agree on the pace -- written quietly, since nobody typed it
// and nobody would want to undo it.

import * as store from './state.js';

const WINDOW_DAYS = 14;
const KEEP_DAYS = 30;
const DAY = 86400e3;

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const read = () => store.getProfile('progress', {}) || {};

/**
 * Note where every queued build stands today. Called on each repaint;
 * writes only when a figure changed, and forgets builds that left the
 * queue and days older than a month.
 */
export function recordProgress(targets, now = Date.now()) {
	const was = read();
	const day = today(now);
	const next = {};
	let dirty = false;
	for (const t of targets || []) {
		if (!t.id || !(t.totalUnits > 0)) continue;
		const covered = Math.max(0, t.totalUnits - t.missingUnits);
		const entry = { ...(was[t.id] || {}) };
		for (const d of Object.keys(entry)) if (daysBetween(d, day) > KEEP_DAYS) { delete entry[d]; dirty = true; }
		if (entry[day] !== covered) { entry[day] = covered; dirty = true; }
		next[t.id] = entry;
	}
	if (Object.keys(was).some(id => !next[id])) dirty = true;
	if (dirty) store.setProfileQuiet('progress', Object.keys(next).length ? next : null);
}

/**
 * The pace of one build: units a day over the window, and the days left
 * at that pace. Null until there are two different days to compare;
 * `perDay` 0 when nothing has moved.
 */
export function paceOf(target, now = Date.now()) {
	const entry = read()[target.id];
	if (!entry) return null;
	const day = today(now);
	const days = Object.keys(entry).filter(d => d !== day && daysBetween(d, day) <= WINDOW_DAYS).sort();
	if (!days.length) return null;
	const first = days[0];
	const span = daysBetween(first, day);
	if (span < 1) return null;
	const covered = Math.max(0, target.totalUnits - target.missingUnits);
	const perDay = Math.max(0, (covered - entry[first]) / span);
	const left = target.missingUnits;
	return { perDay, span, daysLeft: left <= 0 ? 0 : perDay > 0 ? left / perDay : Infinity };
}

/** "about 19 days at this fortnight's pace", or why there is no figure. */
export function paceText(target, now = Date.now()) {
	const p = paceOf(target, now);
	if (!p) return '';
	if (target.missingUnits <= 0) return '';
	if (p.perDay <= 0) return `no progress in the last ${p.span === 1 ? 'day' : `${p.span} days`}`;
	const d = p.daysLeft;
	const when = d < 1 ? 'less than a day' : d < 1.5 ? 'about a day' : `about ${Math.round(d)} days`;
	return `${when} at the last ${p.span === 1 ? "day's" : `${p.span} days'`} pace`;
}

/** For tests: forget everything. */
export function resetPace() {
	store.setProfileQuiet('progress', null);
}
