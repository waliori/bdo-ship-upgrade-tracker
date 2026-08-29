// The Great Ocean, and where the things you are short of actually are.
//
// Everything else in this app answers "what do I need". This answers
// the question that comes straight after it and that no tool answers:
// where do I sail. A barter route is a place, and a list of 36 NPC
// names is not a place -- you cannot tell from it whether those 36 are
// one afternoon's loop or scattered across the whole sea.
//
// Small enough to write rather than import. A tile viewer is a scroll
// offset, a zoom, and a grid of images; a mapping library would be
// twenty times the size of the map data and would have to be fetched
// from somewhere, which this app does not do.
//
// The tiles under map/ are the game's own, cut at three zooms across
// the barter region only -- 510 of them, 1.5 MB, which is less than the
// icons. Coordinates are the game's: a position divided by 2^(9 - zoom)
// is its pixel on that zoom's grid.

import { npcs, npcById, TILES, TILE, MAX_ZOOM } from './barter_npcs.js';

const ZOOMS = Object.keys(TILES).map(Number).sort((a, b) => a - b);
const MIN_Z = ZOOMS[0];
const MAX_Z = ZOOMS[ZOOMS.length - 1];

/** A world position to its pixel on `zoom`'s grid. */
export function toPixel(coord, zoom) {
	return coord / Math.pow(2, MAX_ZOOM - zoom);
}

/** The tile range that covers a pixel box, clamped to what we shipped. */
function tileRange(zoom, left, top, width, height) {
	const b = TILES[zoom];
	return {
		x0: Math.max(b.x0, Math.floor(left / TILE)),
		x1: Math.min(b.x1, Math.floor((left + width) / TILE)),
		y0: Math.max(b.y0, Math.floor(top / TILE)),
		y1: Math.min(b.y1, Math.floor((top + height) / TILE))
	};
}

/**
 * The state of one map: which zoom, and which world position sits in the
 * middle. Panning moves the centre, so a zoom change keeps whatever you
 * were looking at rather than jumping to a corner.
 */
export function createMap({ zoom = MIN_Z, centre = null } = {}) {
	// Opening at the widest zoom is deliberate: the first thing this
	// screen has to answer is "how spread out is this", and starting
	// close in shows a corner of the sea and hides the answer.
	const all = npcs;
	const mid = centre || {
		x: (Math.min(...all.map(n => n.x)) + Math.max(...all.map(n => n.x))) / 2,
		y: (Math.min(...all.map(n => n.y)) + Math.max(...all.map(n => n.y))) / 2
	};
	return { zoom: Math.min(MAX_Z, Math.max(MIN_Z, zoom)), centre: { ...mid } };
}

export const zoomRange = { min: MIN_Z, max: MAX_Z };

/**
 * Everything needed to draw one frame: the tiles under the viewport and
 * the markers on top, both already in viewport pixels.
 *
 * Kept a pure function of (state, size, marks) so the view can be redrawn
 * on a pan without touching the DOM structure, and so it is testable
 * without a browser.
 */
export function frame(state, size, marks = new Map()) {
	const { zoom } = state;
	const cx = toPixel(state.centre.x, zoom);
	const cy = toPixel(state.centre.y, zoom);
	const left = cx - size.w / 2;
	const top = cy - size.h / 2;

	// One tile beyond the viewport on every side, so a pan reveals
	// coastline that is already loaded rather than a flash of sea.
	const r = tileRange(zoom, left - TILE, top - TILE, size.w + TILE * 2, size.h + TILE * 2);
	const tiles = [];
	for (let x = r.x0; x <= r.x1; x++) {
		for (let y = r.y0; y <= r.y1; y++) {
			tiles.push({
				src: `map/${zoom}_${x}_${y}.webp`,
				left: Math.round(x * TILE - left),
				top: Math.round(y * TILE - top)
			});
		}
	}

	// Markers are placed even when slightly outside, so one at the edge
	// half-shows rather than popping in.
	const pad = 40;
	const pins = [];
	for (const n of npcs) {
		const px = toPixel(n.x, zoom) - left;
		const py = toPixel(n.y, zoom) - top;
		if (px < -pad || py < -pad || px > size.w + pad || py > size.h + pad) continue;
		const mark = marks.get(n.id);
		pins.push({ id: n.id, name: n.name, left: Math.round(px), top: Math.round(py), mark });
	}
	// Wanted ones last, so they paint over the rest.
	pins.sort((a, b) => (a.mark ? 1 : 0) - (b.mark ? 1 : 0));

	// The sailing line through the marked islands, in viewport pixels
	// and never culled: a leg between two off-screen stops still
	// crosses the view, and cutting it would break the line.
	const route = routeFor(marks).map(n => ({
		left: Math.round(toPixel(n.x, zoom) - left),
		top: Math.round(toPixel(n.y, zoom) - top)
	}));

	return { tiles, pins, route };
}

/**
 * Which barterers sell what you are short of, and what each one offers.
 *
 * The join is on npc_id, which all_barter.json already carries, so the map
 * needs no data of its own beyond the positions. An NPC that trades
 * three of the things on your list is worth more of a detour than one
 * that trades a single unit of one, which is why the count rides along.
 */
export function marksFor(missing, barterData) {
	const out = new Map();
	if (!barterData) return out;

	const wanted = new Set(Object.keys(missing || {}).filter(k => missing[k] > 0));
	if (!wanted.size) return out;

	for (const entry of barterData) {
		if (!wanted.has(entry.name)) continue;
		for (const s of entry.sources) {
			if (!npcById.has(s.npc_id)) continue;
			let m = out.get(s.npc_id);
			if (!m) out.set(s.npc_id, (m = { items: new Map() }));
			const give = s.give && s.give.name;
			if (!m.items.has(entry.name)) m.items.set(entry.name, new Set());
			if (give) m.items.get(entry.name).add(give);
		}
	}
	return out;
}

/** Pan by a screen-pixel delta, in place. */
export function pan(state, dx, dy) {
	const scale = Math.pow(2, MAX_ZOOM - state.zoom);
	state.centre.x -= dx * scale;
	state.centre.y -= dy * scale;
	return state;
}

/** Step the zoom, keeping the centre. Returns whether it moved. */
export function zoomBy(state, step) {
	const next = Math.min(MAX_Z, Math.max(MIN_Z, state.zoom + step));
	if (next === state.zoom) return false;
	state.zoom = next;
	return true;
}

/**
 * Step the zoom keeping the world point under the cursor where it is.
 *
 * Zooming to the centre is how a map feels broken: the island you are
 * pointing at slides away exactly when you are trying to get closer to
 * it. So the point under (px, py) -- viewport pixels -- is pinned: work
 * out which world coordinate sits there, zoom, then move the centre so
 * the same coordinate sits there again.
 */
export function zoomAt(state, step, size, px, py) {
	const before = Math.pow(2, MAX_ZOOM - state.zoom);
	if (!zoomBy(state, step)) return false;
	const after = Math.pow(2, MAX_ZOOM - state.zoom);
	const dx = px - size.w / 2;
	const dy = py - size.h / 2;
	state.centre.x += dx * (before - after);
	state.centre.y += dy * (before - after);
	return true;
}

/**
 * The world box every zoom actually covers: the intersection of the
 * shipped tile ranges. The view is clamped to it, so every visible
 * spot has a tile at every zoom -- panning or zooming at the edge can
 * no longer land on the void past the chart.
 */
const EXTENT = (() => {
	let x0 = -Infinity, y0 = -Infinity, x1 = Infinity, y1 = Infinity;
	for (const z of ZOOMS) {
		const b = TILES[z];
		const s = Math.pow(2, MAX_ZOOM - z);
		x0 = Math.max(x0, b.x0 * TILE * s);
		y0 = Math.max(y0, b.y0 * TILE * s);
		x1 = Math.min(x1, (b.x1 + 1) * TILE * s);
		y1 = Math.min(y1, (b.y1 + 1) * TILE * s);
	}
	return { x0, y0, x1, y1 };
})();

/** Keep the viewport on the chart, in place. An axis where the chart is
 *  narrower than the view is centred instead. */
export function clampView(state, size) {
	const scale = Math.pow(2, MAX_ZOOM - state.zoom);
	const axis = (c, half, lo, hi) =>
		hi - lo < half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c));
	state.centre.x = axis(state.centre.x, size.w / 2 * scale, EXTENT.x0, EXTENT.x1);
	state.centre.y = axis(state.centre.y, size.h / 2 * scale, EXTENT.y0, EXTENT.y1);
	return state;
}

/**
 * The order to sail the marked islands in.
 *
 * Not the optimum -- that is the travelling salesman -- but the two
 * mistakes a drawn route must not make are visiting an island twice
 * and crossing its own wake, and this makes neither: nearest-neighbour
 * from the westernmost stop, then any leg whose reversal shortens the
 * path is reversed until none does. At 81 islands the whole thing is
 * arithmetic; cached by the set of stops, since a drag repaints every
 * frame but the stops only change when the shopping list does.
 */
let routeCache = { key: '', path: [] };
export function routeFor(marks) {
	const ids = [...marks.keys()].sort((a, b) => a - b);
	const key = ids.join(',');
	if (key === routeCache.key) return routeCache.path;

	const stops = ids.map(id => npcById.get(id)).filter(Boolean);
	const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	let path = stops;
	if (stops.length > 2) {
		let at = stops.reduce((a, b) => (b.x < a.x ? b : a));
		const rest = new Set(stops);
		rest.delete(at);
		path = [at];
		while (rest.size) {
			let best = null;
			for (const n of rest) if (!best || d(at, n) < d(at, best)) best = n;
			rest.delete(best);
			path.push(at = best);
		}
		for (let pass = 0, changed = true; changed && pass < 20; pass++) {
			changed = false;
			for (let i = 0; i < path.length - 2; i++) {
				for (let j = i + 2; j < path.length; j++) {
					const tail = path[j + 1];
					const gain = d(path[i], path[i + 1]) - d(path[i], path[j])
						+ (tail ? d(path[j], tail) - d(path[i + 1], tail) : 0);
					if (gain > 1e-9) {
						let a = i + 1, b = j;
						while (a < b) { const t = path[a]; path[a++] = path[b]; path[b--] = t; }
						changed = true;
					}
				}
			}
		}
	}
	routeCache = { key, path };
	return path;
}

/** Zoom and centre so every given world point is in view, with room to
 *  breathe, in place. */
export function fitTo(state, size, points, pad = 56) {
	if (!points.length) return state;
	const x0 = Math.min(...points.map(p => p.x)), x1 = Math.max(...points.map(p => p.x));
	const y0 = Math.min(...points.map(p => p.y)), y1 = Math.max(...points.map(p => p.y));
	state.zoom = MIN_Z;
	for (let z = MAX_Z; z >= MIN_Z; z--) {
		const s = Math.pow(2, MAX_ZOOM - z);
		if ((x1 - x0) / s <= size.w - pad * 2 && (y1 - y0) / s <= size.h - pad * 2) {
			state.zoom = z;
			break;
		}
	}
	state.centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
	return clampView(state, size);
}
