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
// The tiles under map/ are the game's own, the whole world at every
// zoom the codex cuts real ground for -- 1 to 7, the world in two
// tiles a side up to 128 (tools/fetch-map-tiles.mjs says where they
// come from). Coordinates are the game's: a position divided by
// 2^(9 - zoom) is its pixel on that zoom's grid. The zoom itself is
// continuous -- a chart that snaps between magnifications feels like
// a slide carousel, not a sea -- and the shipped levels are just where
// the pixels come from.

import { npcs, npcById, TILES, TILE, MAX_ZOOM, TILES_STAMP } from './barter_npcs.js';
import { ALIAS } from './tile_alias.js';

const ZOOMS = Object.keys(TILES).map(Number).sort((a, b) => a - b);
const MIN_Z = ZOOMS[0];
const MAX_Z = ZOOMS[ZOOMS.length - 1];

/** The zoom the chart opens at: the world at 2,048 pixels a side, so
 *  the whole sea is in view on any screen without shrinking it to a
 *  stamp -- the widest level shipped is for stepping back further. */
export const OPEN_ZOOM = 3;

/** How close a call on an island flies in: the island and its
 *  neighbours, the way the chart showed them when 5 was as deep as it
 *  went. Rooftops are for the wheel. */
export const CLOSE_ZOOM = 4.65;

/** A world position to its pixel on `zoom`'s grid. Works for fractional
 *  zooms, which is what makes the zoom continuous. */
export function toPixel(coord, zoom) {
	return coord / Math.pow(2, MAX_ZOOM - zoom);
}

/** The file holding tile (z, x, y). The open sea is one texture the
 *  codex repeats, so identical tiles are shipped once and the rest
 *  point at that one (tools/fetch-map-tiles.mjs keeps the table). */
export function tileFile(z, x, y) {
	const key = `${z}_${x}_${y}`;
	return `map/${ALIAS[key] || key}.webp`;
}

/** The URL a tile is asked for by: its file, stamped with the set's
 *  date. The server says a tile never changes, and every cache between
 *  it and the screen -- the browser's, the service worker's, the
 *  proxies' -- keeps it for a year on that word; a refetched set is
 *  told apart by its stamp, not by anyone checking. */
export function tileSrc(z, x, y) {
	return `${tileFile(z, x, y)}?v=${TILES_STAMP}`;
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
export function createMap({ zoom = OPEN_ZOOM, centre = null } = {}) {
	// Opening wide is deliberate: the first thing this screen has to
	// answer is "how spread out is this", and starting close in shows
	// a corner of the sea and hides the answer.
	const all = npcs;
	const mid = centre || {
		x: (Math.min(...all.map(n => n.x)) + Math.max(...all.map(n => n.x))) / 2,
		y: (Math.min(...all.map(n => n.y)) + Math.max(...all.map(n => n.y))) / 2
	};
	return { zoom: Math.min(MAX_Z, Math.max(MIN_Z, zoom)), centre: { ...mid } };
}

export const zoomRange = { min: MIN_Z, max: MAX_Z };

/** A viewport point for a world position, under the current view. */
export function project(state, size, x, y) {
	return {
		left: toPixel(x, state.zoom) - (toPixel(state.centre.x, state.zoom) - size.w / 2),
		top: toPixel(y, state.zoom) - (toPixel(state.centre.y, state.zoom) - size.h / 2)
	};
}

/** Where one specific shipped tile lands under the current view -- used
 *  to keep the old level's tiles beneath the new one while it loads. */
export function placeTile(state, size, z, x, y) {
	const g = Math.pow(2, state.zoom - z);
	const at = project(state, size, 0, 0);
	return { left: x * TILE * g + at.left, top: y * TILE * g + at.top, scale: g };
}

/** The nearest shipped level to a zoom. */
export function levelFor(zoom) {
	return Math.max(MIN_Z, Math.min(MAX_Z, Math.round(zoom)));
}

/**
 * The tiles of one level under the viewport, in viewport pixels, the
 * nearest to the middle first -- so the middle of the screen fills
 * before the corners. Half a tile past the edge on every side, so a
 * pan reveals coastline that is already loaded rather than a flash of
 * sea; a tile wholly in that margin is marked `ahead`, for the
 * painter to ask for last and at low priority.
 */
export function tilesFor(state, size, level) {
	const { zoom } = state;
	const left = toPixel(state.centre.x, zoom) - size.w / 2;
	const top = toPixel(state.centre.y, zoom) - size.h / 2;
	const f = Math.pow(2, zoom - level);
	const pad = TILE / 2;
	const r = tileRange(level, left / f - pad, top / f - pad, size.w / f + pad * 2, size.h / f + pad * 2);
	const tiles = [];
	for (let x = r.x0; x <= r.x1; x++) {
		for (let y = r.y0; y <= r.y1; y++) {
			const l = x * TILE * f - left, t = y * TILE * f - top, w = TILE * f;
			const ahead = l + w <= 0 || t + w <= 0 || l >= size.w || t >= size.h;
			const d = Math.hypot(l + w / 2 - size.w / 2, t + w / 2 - size.h / 2);
			tiles.push({
				key: `${level}_${x}_${y}`,
				src: tileSrc(level, x, y),
				z: level, x, y, scale: f, left: l, top: t, ahead, d
			});
		}
	}
	tiles.sort((a, b) => a.ahead - b.ahead || a.d - b.d);
	return tiles;
}

/**
 * Everything needed to draw one frame: the tiles under the viewport and
 * the markers on top, both already in viewport pixels.
 *
 * Kept a pure function of (state, size, marks) so the view can be redrawn
 * on a pan without touching the DOM structure, and so it is testable
 * without a browser.
 *
 * The zoom is continuous but the shipped tiles are not: the frame
 * draws one level, scaled the rest of the way. Left to itself that is
 * the nearest level -- never more than half a step of stretch. While
 * a zoom is in motion the caller passes the level it is holding
 * instead: the tiles already on screen carry the animation, and the
 * levels passed through on the way are never asked for.
 */
export function frame(state, size, marks = new Map(), level = null) {
	const { zoom } = state;
	const left = toPixel(state.centre.x, zoom) - size.w / 2;
	const top = toPixel(state.centre.y, zoom) - size.h / 2;
	const tiles = tilesFor(state, size, level === null ? levelFor(zoom) : levelFor(level));

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
	// No layering order here: the painter keys pins by id and reuses the
	// nodes across frames, so DOM order could not track a sort anyway --
	// z-index puts a lit pin over a plain one.

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

/** Move the zoom by a (fractional) amount, keeping the centre. Returns
 *  whether it moved. */
export function zoomBy(state, dz) {
	const next = Math.min(MAX_Z, Math.max(MIN_Z, state.zoom + dz));
	if (Math.abs(next - state.zoom) < 1e-9) return false;
	state.zoom = next;
	return true;
}

/**
 * Move the zoom keeping the world point under the cursor where it is.
 *
 * Zooming to the centre is how a map feels broken: the island you are
 * pointing at slides away exactly when you are trying to get closer to
 * it. So the point under (px, py) -- viewport pixels -- is pinned: work
 * out which world coordinate sits there, zoom, then move the centre so
 * the same coordinate sits there again.
 */
export function zoomAt(state, dz, size, px, py) {
	const before = Math.pow(2, MAX_ZOOM - state.zoom);
	if (!zoomBy(state, dz)) return false;
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

/** The charted world box, for anything that needs to scale it down --
 *  the minimap does. */
export const chartBox = EXTENT;

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
 * path is reversed until none does. At 91 islands the whole thing is
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

/**
 * The route as one SVG path, gently bowed: each leg is a quadratic
 * curve whose control point sits a little off the midpoint, so the
 * line reads as a sailing course rather than a ruler. Points are
 * viewport pixels, as frame() and project() hand them out.
 */
/**
 * One segment against a box, by Liang-Barsky: the part of it inside,
 * or null when it misses the box entirely.
 */
function clipSegment(a, b, box) {
	const dx = b.left - a.left, dy = b.top - a.top;
	const p = [-dx, dx, -dy, dy];
	const q = [a.left - box.x0, box.x1 - a.left, a.top - box.y0, box.y1 - a.top];
	let t0 = 0, t1 = 1;
	for (let i = 0; i < 4; i++) {
		if (p[i] === 0) {
			if (q[i] < 0) return null;
			continue;
		}
		const r = q[i] / p[i];
		if (p[i] < 0) {
			if (r > t1) return null;
			if (r > t0) t0 = r;
		} else {
			if (r < t0) return null;
			if (r < t1) t1 = r;
		}
	}
	return {
		a: { left: a.left + t0 * dx, top: a.top + t0 * dy },
		b: { left: a.left + t1 * dx, top: a.top + t1 * dy },
		whole: t0 === 0
	};
}

/**
 * A line cut to what can be seen, as runs of points.
 *
 * Zoomed in on one island, the far end of a route is millions of pixels
 * off screen, and a browser asked to draw a path that long quietly
 * gives up part way -- the line stops in open water with no edge in
 * sight. Cutting each leg to a box a little larger than the viewport
 * keeps every coordinate small enough to draw, and the line still runs
 * off the edge the way it should.
 */
export function clipRuns(pts, size, pad = 400) {
	const box = { x0: -pad, y0: -pad, x1: size.w + pad, y1: size.h + pad };
	const runs = [];
	let run = null;
	for (let i = 1; i < pts.length; i++) {
		const seg = clipSegment(pts[i - 1], pts[i], box);
		if (!seg) {
			run = null;
			continue;
		}
		// A leg whose start was trimmed cannot continue the run before it.
		if (run && seg.whole) run.push(seg.b);
		else runs.push(run = [seg.a, seg.b]);
	}
	return runs;
}

/**
 * The path itself. Given a viewport it is cut to what can be drawn
 * first, which is why a long route no longer stops in mid-ocean.
 */
export function routePath(pts, size = null, bow = 0.16) {
	if (pts.length < 2) return '';
	const runs = size ? clipRuns(pts, size) : [pts];
	let d = '';
	for (const run of runs) {
		if (run.length < 2) continue;
		d += `${d ? ' ' : ''}M ${run[0].left.toFixed(1)} ${run[0].top.toFixed(1)}`;
		for (let i = 1; i < run.length; i++) {
			const a = run[i - 1], b = run[i];
			// A line already bent round the land must not be bowed as
			// well: the bow is a sixth of the leg sideways, which is a
			// headland's worth of it. `bow: 0` draws exactly the points
			// given.
			if (!bow) { d += ` L ${b.left.toFixed(1)} ${b.top.toFixed(1)}`; continue; }
			const dx = b.left - a.left, dy = b.top - a.top;
			const len = Math.hypot(dx, dy) || 1;
			const k = Math.min(bow * len, 52);
			d += ` Q ${((a.left + b.left) / 2 - dy / len * k).toFixed(1)}`
				+ ` ${((a.top + b.top) / 2 + dx / len * k).toFixed(1)}`
				+ ` ${b.left.toFixed(1)} ${b.top.toFixed(1)}`;
		}
	}
	return d;
}

/** Zoom and centre so every given world point is in view, with room to
 *  breathe, in place. */
export function fitTo(state, size, points, pad = 56) {
	if (!points.length) return state;
	const x0 = Math.min(...points.map(p => p.x)), x1 = Math.max(...points.map(p => p.x));
	const y0 = Math.min(...points.map(p => p.y)), y1 = Math.max(...points.map(p => p.y));
	// The zoom at which each span exactly fills its padded box; one
	// island asks for infinity and gets the closest we have.
	const zx = MAX_ZOOM - Math.log2(Math.max(1e-9, (x1 - x0) / Math.max(1, size.w - pad * 2)));
	const zy = MAX_ZOOM - Math.log2(Math.max(1e-9, (y1 - y0) / Math.max(1, size.h - pad * 2)));
	state.zoom = Math.min(MAX_Z, Math.max(MIN_Z, Math.min(zx, zy)));
	state.centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
	return clampView(state, size);
}
