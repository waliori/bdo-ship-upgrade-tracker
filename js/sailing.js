// How far, and how long: the chart's distances in the game's metres,
// and the minutes a hull makes of them.
//
// The chart's pixel is 25 world units and a unit is a centimetre, so a
// pixel is a quarter of a metre -- the same transform the world-map
// export is checked against. What a ship does with a metre is less
// settled: the game gives speed as a percentage and never says what
// 100% is. The figure here is a working estimate, and the Route tab
// lets a player who has timed a leg replace it with their own -- one
// timed leg calibrates every other.

import { shipStats } from './ship_stats.js';
import { loadout } from './part_stats.js';
import { families } from './enhancement.js';
import { crewTotals } from './sailors.js';

export const METRES_PER_PX = 0.25;
// Metres a second at 100% speed. An estimate: replace it by timing a leg.
export const DEFAULT_CAL = 11;

/** Metres along a polyline of chart points. */
export function pathLength(points) {
	let m = 0;
	for (let i = 1; i < (points || []).length; i++) {
		m += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
	}
	return m * METRES_PER_PX;
}

/**
 * Metres per leg of a route whose bends are marked: a leg runs from one
 * stop to the next, bends included, so the answer has one entry per
 * stop after the first.
 */
export function legLengths(points) {
	const legs = [];
	let run = [];
	for (const p of points || []) {
		run.push(p);
		if (!p.bend && run.length > 1) {
			legs.push(pathLength(run));
			run = [p];
		}
	}
	return legs;
}

/**
 * The speed a hull actually sails at: its own figure, the best part in
 * each slot, and the crew in the sail seats -- the same sum the Crew
 * screen shows, so the two never disagree.
 */
export function speedPct(ship, stock = {}, roster = [], seats = {}) {
	const s = shipStats[ship];
	if (!s) return null;
	const fit = loadout(ship, stock, families);
	const crew = crewTotals(roster, seats, s);
	const parts = Number(fit.total.speed) || 0;
	return { hull: s.speed, parts, crew: crew.speed, total: Math.round((s.speed + parts + crew.speed) * 10) / 10 };
}

export const speedMs = (pct, cal = DEFAULT_CAL) => cal * pct / 100;

/** Seconds to sail `metres` at `pct` speed. */
export function sailSeconds(metres, pct, cal = DEFAULT_CAL) {
	const v = speedMs(pct, cal);
	return v > 0 ? metres / v : Infinity;
}

/** What one timed leg says 100% is worth: metres a second. */
export function calibrate(metres, seconds, pct) {
	if (!(metres > 0) || !(seconds > 0) || !(pct > 0)) return null;
	return Math.round((metres / seconds) / (pct / 100) * 100) / 100;
}

export function fmtDistance(m) {
	if (!(m >= 0)) return '';
	return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`;
}

export function fmtDuration(s) {
	if (!Number.isFinite(s) || s < 0) return '';
	const min = Math.round(s / 60);
	if (min < 1) return 'under a minute';
	if (min < 60) return `${min} min`;
	return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}
