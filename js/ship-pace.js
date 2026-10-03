// How fast a ship really sails, ship by ship.
//
// The game gives speed as a percentage and never says what 100% is in
// metres, so every time on the chart and every chime of the clock rests
// on a figure somebody measured. The default is one sailor's: five legs
// of a Carrack timed with Arrived on 23 September 2026, which fitted
// 8.75 m/s at 100% and 23 s a leg getting under way and coming in, to
// within seconds on every leg. Before that it was 11 m/s, and the clock
// rang a minute or two before the ship came in.
//
// A sailor whose ship does not keep to it can time their own legs: with
// "time my legs" on, the cockpit has an Arrived press, and after five
// legs the ship's own figure is worked out and used for that ship --
// told once, refined by every leg after. It lives in the profile, so it
// syncs, and it is kept by hull, since a Carrack and a Galleass do not
// sail alike. A figure set by hand on the chart's Route tab still wins
// over both, as it always did.

import * as store from './state.js';
import { learnSpeed, DEFAULT_CAL, DEFAULT_LAG } from './sailing.js';
import { currentShip } from './ship.js';

/** Legs a ship's own figure waits for before it is used. */
export const LEARN_AT = 5;
/** Legs kept a ship: the last dozen, so the figure follows the ship. */
export const PACE_LOG = 12;

const logs = () => store.getProfile('shipPace', {}) || {};

/** The legs timed on a ship, oldest first. */
export const legsTimed = ship => (logs()[ship] || {}).log || [];

/**
 * The pace a ship is timed at: { cal, lag, from, n } -- metres a second
 * at 100%, seconds a leg apart from the sailing, and where it comes
 * from: 'hand' (set on the Route tab), 'ship' (its own legs, once there
 * are LEARN_AT of them), or 'default'. `n` is the legs timed on it.
 */
export function paceOf(ship) {
	moveOldLog(ship);
	const hand = Number(store.getSetting('sailCal', null));
	const log = legsTimed(ship);
	if (hand > 0) return { cal: hand, lag: 0, from: 'hand', n: log.length };
	const fit = log.length >= LEARN_AT ? learnSpeed(log) : null;
	if (fit) return { cal: fit.cal, lag: fit.lag, from: 'ship', n: log.length };
	return { cal: DEFAULT_CAL, lag: DEFAULT_LAG, from: 'default', n: log.length };
}

/**
 * One leg timed on a ship: { m, s, pct }. Returns what it changed:
 * { pace, learned } -- the pace now, and whether this was the leg that
 * made the ship's own figure the one used.
 */
export function noteLeg(ship, leg) {
	const before = paceOf(ship);
	const log = [...legsTimed(ship), { m: Math.round(leg.m), s: Math.round(leg.s), pct: Math.round(leg.pct * 10) / 10, at: Date.now() }].slice(-PACE_LOG);
	store.setProfileQuiet('shipPace', { ...logs(), [ship]: { log } });
	const pace = paceOf(ship);
	return { pace, learned: before.from === 'default' && pace.from === 'ship' };
}

// The first build of Arrived kept the legs on the device, and wrote the
// figure it fitted where a figure set by hand goes -- which would now
// read as set by hand and win over everything. Those legs are moved to
// the ship that is sailing, once, and the device's copy cleared.
let moved = false;
function moveOldLog(ship) {
	if (moved || !ship) return;
	moved = true;
	const old = store.getSetting('sailLog', null);
	if (!Array.isArray(old) || !old.length) return;
	const log = [...legsTimed(ship), ...old.filter(x => x && x.m > 0 && x.s > 0 && x.pct > 0)].slice(-PACE_LOG);
	store.setProfileQuiet('shipPace', { ...logs(), [ship]: { log } });
	store.setSetting('sailCal', null, true);
	store.setSetting('sailLag', null, true);
	store.setSetting('sailLog', null);
}

/** The pace of the ship sailing now. */
export const paceNow = () => paceOf(currentShip().name);

/** A ship's timed legs forgotten: back to the default. */
export function forgetPace(ship) {
	const next = { ...logs() };
	delete next[ship];
	store.setProfileQuiet('shipPace', next);
}

/** Whether the cockpit offers Arrived: asked for by the sailor. */
export const timingLegs = () => store.getProfile('timeLegs', false) === true;
export const setTimingLegs = on => store.setProfileQuiet('timeLegs', on === true);
