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

	const r = tileRange(zoom, left, top, size.w, size.h);
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

	return { tiles, pins };
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
