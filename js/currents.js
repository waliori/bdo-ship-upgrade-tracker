// Ocean currents: lanes on the chart a ship rides faster along.
//
// The game's sea has currents, and a ship in one going the right way
// makes far better time than the chart's straight-line arithmetic
// says. The game publishes no chart of them; the community's are
// pictures. So a lane here is drawn by hand -- traced in Draw mode off
// the game's own map, then kept as a current -- and this module says
// what a lane does to a leg: how much of the leg lies in one, going
// with it, and how many metres that is worth at the lane's pace.
//
// The pace is a community figure: 1.7 times the ship's speed with the
// current. Against it nothing is claimed -- the lane counts as open
// water -- since no measured figure exists to claim. Both are on the
// lane, so a player who has timed one can set their own.

import { METRES_PER_PX } from './sailing.js';

export const WITH_CURRENT = 1.7;
export const LANE_WIDTH = 900;        // half-width, in chart units: a band a ship is "in"
export const LANE_MAX = 12;
export const LANE_CORNERS = 120;

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };

/** A lane as kept: a name, a pace, a half-width, and its line as flat chart coords. */
export function cleanLane(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const src = Array.isArray(raw.pts) ? raw.pts : [];
	const pts = [];
	for (let i = 0; i + 1 < src.length && pts.length < LANE_CORNERS * 2; i += 2) {
		const x = num(src[i], 0, 200000), y = num(src[i + 1], 0, 200000);
		if (x !== null && y !== null) pts.push(Math.round(x), Math.round(y));
	}
	if (pts.length < 4) return null;
	return {
		pts,
		name: String(raw.name || '').slice(0, 40) || 'A current',
		factor: num(raw.factor, 1, 5) || WITH_CURRENT,
		width: num(raw.width, 100, 5000) || LANE_WIDTH,
		colour: typeof raw.colour === 'string' && /^#[0-9a-f]{6}$/i.test(raw.colour) ? raw.colour : '#7ec8f0',
		id: String(raw.id || `l${Date.now().toString(36)}`).slice(0, 20)
	};
}

/**
 * The nearest point of a lane to (x, y): its distance, and the lane's
 * direction there, as a unit vector -- the way the current runs.
 */
export function nearestOnLane(lane, x, y) {
	const p = lane.pts;
	let best = null;
	for (let i = 0; i + 3 < p.length; i += 2) {
		const ax = p[i], ay = p[i + 1], bx = p[i + 2], by = p[i + 3];
		const dx = bx - ax, dy = by - ay;
		const len2 = dx * dx + dy * dy;
		const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
		const qx = ax + t * dx, qy = ay + t * dy;
		const d = Math.hypot(x - qx, y - qy);
		if (!best || d < best.d) {
			const len = Math.sqrt(len2) || 1;
			best = { d, dir: [dx / len, dy / len] };
		}
	}
	return best;
}

/**
 * Metres per leg of a route, and what the currents make of them.
 *
 * `points` are chart points with `bend` marking the corners inside a
 * leg, as legLengths reads them. Each leg is walked in short steps; a
 * step whose midpoint lies within a lane's half-width and whose
 * heading agrees with the lane's (more with than across) is sailed at
 * the lane's pace. Returns one entry per leg: the real metres, the
 * effective metres to time the leg by, and the metres spent riding a
 * current.
 */
export function effectiveLegs(points, lanes = [], step = 250) {
	const out = [];
	let run = [];
	const legOf = pts => {
		let metres = 0, effective = 0, current = 0;
		for (let i = 1; i < pts.length; i++) {
			const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
			const len = Math.hypot(bx - ax, by - ay);
			if (!len) continue;
			const hx = (bx - ax) / len, hy = (by - ay) / len;
			const n = Math.max(1, Math.ceil(len / step));
			for (let k = 0; k < n; k++) {
				const f0 = k / n, f1 = (k + 1) / n;
				const seg = len * (f1 - f0) * METRES_PER_PX;
				const mx = ax + (bx - ax) * (f0 + f1) / 2, my = ay + (by - ay) * (f0 + f1) / 2;
				let factor = 1;
				for (const lane of lanes) {
					const near = nearestOnLane(lane, mx, my);
					if (!near || near.d > lane.width) continue;
					const along = near.dir[0] * hx + near.dir[1] * hy;
					if (along > 0.5 && lane.factor > factor) factor = lane.factor;
				}
				metres += seg;
				effective += seg / factor;
				if (factor > 1) current += seg;
			}
		}
		return { metres, effective, current };
	};
	for (const p of points || []) {
		run.push(p);
		if (!p.bend && run.length > 1) {
			out.push(legOf(run));
			run = [p];
		}
	}
	return out;
}

/** The whole route at once: real metres, effective metres, metres on a current. */
export function effectiveTotal(points, lanes = [], step = 250) {
	return effectiveLegs(points, lanes, step).reduce((a, l) => ({ metres: a.metres + l.metres, effective: a.effective + l.effective, current: a.current + l.current }), { metres: 0, effective: 0, current: 0 });
}
