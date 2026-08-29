// The chart.
//
// A map is mostly arithmetic, and arithmetic that is wrong by a factor
// of two still draws something that looks like a map. So the tests here
// are about the three ways it could look right and be wrong: a position
// landing on the wrong tile, a pan moving by the wrong amount at a
// given zoom, and a marker claiming an island sells something it does
// not.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';

const shipbarters = JSON.parse(
	await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
import { npcs, npcById, TILES, TILE, MAX_ZOOM } from '../js/barter_npcs.js';
import { toPixel, frame, marksFor, pan, zoomBy, zoomAt, createMap, zoomRange, clampView, routeFor, fitTo } from '../js/map.js';

const SIZE = { w: 1200, h: 640 };

/* ------------------------------------------------------------------ *
 * the data we shipped
 * ------------------------------------------------------------------ */

test('every barterer in the routes has a position', () => {
	// A missing one would silently vanish from the map rather than
	// erroring, which is the kind of gap nothing else would catch.
	const inRoutes = new Set();
	for (const entry of shipbarters) {
		for (const s of entry.sources) inRoutes.add(s.npc_id);
	}
	const missing = [...inRoutes].filter(id => !npcById.has(id));
	assert.deepEqual(missing, [], 'barterers with no coordinates');
	assert.equal(npcs.length, inRoutes.size);
});

test('every position falls inside the tiles we downloaded', () => {
	// The viewer clamps to the shipped range, so a position outside it
	// would put a pin over blank sea for ever.
	for (const z of Object.keys(TILES).map(Number)) {
		const b = TILES[z];
		for (const n of npcs) {
			const tx = Math.floor(toPixel(n.x, z) / TILE);
			const ty = Math.floor(toPixel(n.y, z) / TILE);
			assert.ok(tx >= b.x0 && tx <= b.x1, `${n.name} x tile ${tx} outside z${z}`);
			assert.ok(ty >= b.y0 && ty <= b.y1, `${n.name} y tile ${ty} outside z${z}`);
		}
	}
});

/* ------------------------------------------------------------------ *
 * arithmetic
 * ------------------------------------------------------------------ */

test('a position halves with every zoom step out', () => {
	const n = npcs[0];
	assert.equal(toPixel(n.x, MAX_ZOOM), n.x);
	assert.equal(toPixel(n.x, MAX_ZOOM - 1), n.x / 2);
	assert.equal(toPixel(n.x, MAX_ZOOM - 2), n.x / 4);
});

test('a drag moves the world by the same distance at any zoom', () => {
	// Panning 100 screen pixels has to shift the view 100 screen pixels
	// whatever the zoom, which means shifting the world coordinate by
	// more when zoomed out. Getting this backwards makes the map feel
	// like it is sliding on ice at one zoom and stuck at another.
	for (const z of [zoomRange.min, zoomRange.max]) {
		const state = createMap({ zoom: z });
		const before = toPixel(state.centre.x, z);
		pan(state, -100, 0);
		assert.ok(Math.abs((toPixel(state.centre.x, z) - before) - 100) < 1e-6,
			`zoom ${z} moved the wrong distance`);
	}
});

test('zoom stops at the levels we have tiles for', () => {
	const state = createMap({ zoom: zoomRange.min });
	assert.equal(zoomBy(state, -1), false, 'cannot go below the widest');
	assert.equal(state.zoom, zoomRange.min);

	state.zoom = zoomRange.max;
	assert.equal(zoomBy(state, 1), false, 'cannot go past the closest');
	assert.equal(state.zoom, zoomRange.max);
});

test('zooming at the cursor keeps the pointed-at world where it is', () => {
	// The island under the cursor must not slide away as you zoom
	// towards it. World-at-cursor = centre + (cursor - middle) * scale,
	// and it has to come out the same on both sides of the step.
	const size = { w: 1200, h: 640 };
	const cursor = { x: 900, y: 150 };
	for (const step of [1, -1]) {
		const state = createMap({ zoom: 4 });
		const scale = z => Math.pow(2, MAX_ZOOM - z);
		const before = state.centre.x + (cursor.x - size.w / 2) * scale(state.zoom);
		assert.ok(zoomAt(state, step, size, cursor.x, cursor.y));
		const after = state.centre.x + (cursor.x - size.w / 2) * scale(state.zoom);
		assert.ok(Math.abs(before - after) < 1e-6, `step ${step} moved the cursor's world point`);
	}
});

test('zooming at the exact centre is the plain zoom', () => {
	const size = { w: 1200, h: 640 };
	const a = createMap({ zoom: 4 });
	const b = createMap({ zoom: 4 });
	zoomAt(a, 1, size, size.w / 2, size.h / 2);
	zoomBy(b, 1);
	assert.deepEqual(a, b);
});

test('a refused zoom step does not move the centre either', () => {
	const state = createMap({ zoom: zoomRange.max });
	const centre = { ...state.centre };
	assert.equal(zoomAt(state, 1, { w: 1200, h: 640 }, 100, 100), false);
	assert.deepEqual(state.centre, centre);
});

test('the map opens wide enough to show nearly every island', () => {
	// The point of the screen is how spread out the sea is; opening on a
	// corner of it hides the answer.
	const { pins } = frame(createMap(), SIZE);
	assert.ok(pins.length > npcs.length * 0.9, `only ${pins.length} of ${npcs.length} in view`);
});

test('every tile the ranges promise is actually on disk', async () => {
	// The viewer trusts TILES completely: anything inside a range is
	// fetched without checking. A declared column that never shipped is
	// therefore a 404 re-requested on every repaint of the map -- and the
	// test below cannot catch it, because it only checks that frame()
	// stays inside the ranges, not that the ranges tell the truth.
	const fs = await import('node:fs/promises');
	const missing = [];
	for (const [z, b] of Object.entries(TILES)) {
		for (let x = b.x0; x <= b.x1; x++) {
			for (let y = b.y0; y <= b.y1; y++) {
				const name = `${z}_${x}_${y}.webp`;
				try {
					await fs.access(new URL(`../map/${name}`, import.meta.url));
				} catch {
					missing.push(name);
				}
			}
		}
	}
	assert.deepEqual(missing, [], 'tiles declared but never downloaded');
});

test('a frame only asks for tiles that exist', () => {
	const state = createMap();
	// Shove the view far past the edge of the world.
	pan(state, -100000, -100000);
	const { tiles } = frame(state, SIZE);
	for (const t of tiles) {
		const [z, x, y] = t.src.replace('map/', '').replace('.webp', '').split('_').map(Number);
		const b = TILES[z];
		assert.ok(x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1, `${t.src} was not downloaded`);
	}
});

/* ------------------------------------------------------------------ *
 * what the pins claim
 * ------------------------------------------------------------------ */

test('an island is only marked if it really trades the thing', () => {
	const marks = marksFor({ 'Brilliant Pearl Shard': 40 }, shipbarters);
	assert.ok(marks.size > 0);

	const truth = new Set();
	for (const s of shipbarters.find(b => b.name === 'Brilliant Pearl Shard').sources) {
		truth.add(s.npc_id);
	}
	assert.deepEqual([...marks.keys()].sort(), [...truth].sort());
});

test('a marked island says which of your shortfalls it covers', () => {
	// These two share barterers, which is what makes the count worth
	// carrying: an island covering two of your shortfalls is a better
	// detour than one covering a single unit of one.
	const marks = marksFor({ 'Bright Reef Piece': 1, 'Cobalt Ingot': 1 }, shipbarters);
	const both = [...marks.values()].filter(m => m.items.size > 1);
	assert.ok(both.length, 'no island trades both, so the count is untested');
	for (const m of both) {
		for (const gives of m.items.values()) assert.ok(gives.size > 0, 'no goods listed');
	}
});

test('nothing is marked when nothing is short', () => {
	assert.equal(marksFor({}, shipbarters).size, 0);
	assert.equal(marksFor({ 'Brilliant Pearl Shard': 0 }, shipbarters).size, 0);
	assert.equal(marksFor({ 'Brilliant Pearl Shard': 1 }, null).size, 0);
});

test('something with no barter route marks nothing, rather than erroring', () => {
	assert.equal(marksFor({ 'Cron Stone': 500 }, shipbarters).size, 0);
});

test('wanted pins are drawn last so they land on top', () => {
	const marks = marksFor({ 'Brilliant Pearl Shard': 40 }, shipbarters);
	const { pins } = frame(createMap(), SIZE, marks);
	const firstMarked = pins.findIndex(p => p.mark);
	assert.ok(firstMarked >= 0, 'nothing marked in view');
	assert.ok(pins.slice(firstMarked).every(p => p.mark), 'a plain pin sorted after a marked one');
});

/* ------------------------------------------------------------------ *
 * staying on the chart
 * ------------------------------------------------------------------ */

test('a clamped view has a tile under every pixel, at every zoom', () => {
	// The bug this pins down: pan to an edge, or zoom in near one, and
	// the viewport hangs off the chart showing bare background.
	const cover = Math.ceil(SIZE.w / TILE) * Math.ceil(SIZE.h / TILE);
	for (const z of [zoomRange.min, zoomRange.max]) {
		for (const [dx, dy] of [[1e6, 1e6], [-1e6, -1e6], [1e6, -1e6]]) {
			const state = createMap({ zoom: z });
			pan(state, dx, dy);
			clampView(state, SIZE);
			const { tiles } = frame(state, SIZE);
			assert.ok(tiles.length >= cover, `z${z} pan(${dx},${dy}): ${tiles.length} tiles for ${cover} needed`);
		}
	}
});

test('zooming in at a corner cannot leave the chart either', () => {
	const state = createMap();
	pan(state, -1e6, -1e6);
	clampView(state, SIZE);
	while (zoomAt(state, 1, SIZE, 0, 0)) clampView(state, SIZE);
	const { tiles } = frame(state, SIZE);
	const cover = Math.ceil(SIZE.w / TILE) * Math.ceil(SIZE.h / TILE);
	assert.ok(tiles.length >= cover, `holes at the edge after zooming in: ${tiles.length} < ${cover}`);
});

/* ------------------------------------------------------------------ *
 * the route
 * ------------------------------------------------------------------ */

test('the route visits every marked island exactly once', () => {
	const marks = marksFor({ 'Brilliant Pearl Shard': 40 }, shipbarters);
	const path = routeFor(marks);
	assert.equal(path.length, marks.size);
	assert.equal(new Set(path.map(n => n.id)).size, marks.size);
	for (const n of path) assert.ok(marks.has(n.id), `${n.name} is not marked`);
});

test('the route beats sailing the islands in naive west-to-east order', () => {
	// Not optimal -- that is the travelling salesman -- but a drawn route
	// that is longer than just reading the map left to right would be
	// worse than no route.
	const marks = marksFor({ 'Bright Reef Piece': 1, 'Cobalt Ingot': 1 }, shipbarters);
	assert.ok(marks.size > 3, 'too few stops to say anything');
	const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
	const len = p => p.reduce((s, n, i) => (i ? s + d(p[i - 1], n) : 0), 0);
	const naive = [...marks.keys()].map(id => npcById.get(id)).sort((a, b) => a.x - b.x);
	assert.ok(len(routeFor(marks)) <= len(naive) + 1e-6);
});

test('one stop is a route of one, and no stops is no route', () => {
	assert.equal(routeFor(new Map()).length, 0);
	const one = new Map([[npcs[0].id, {}]]);
	assert.deepEqual(routeFor(one).map(n => n.id), [npcs[0].id]);
});

test('the frame carries the route in viewport pixels, uncropped', () => {
	const marks = marksFor({ 'Brilliant Pearl Shard': 40 }, shipbarters);
	const state = createMap();
	clampView(state, SIZE);
	const { route } = frame(state, SIZE, marks);
	assert.equal(route.length, marks.size, 'a leg was culled');
});

/* ------------------------------------------------------------------ *
 * fitting
 * ------------------------------------------------------------------ */

test('fitting to the marked islands puts every one of them in view', () => {
	// A viewport tall enough that a fit is geometrically possible even
	// for the widest-flung goods; a laptop-letterbox view of Cobalt
	// Ingot cannot hold every island at any zoom we ship, and then the
	// widest, centred view is the right answer rather than a bug.
	const size = { w: 1200, h: 900 };
	for (const item of ['Brilliant Pearl Shard', 'Cobalt Ingot', 'Bright Reef Piece']) {
		const marks = marksFor({ [item]: 1 }, shipbarters);
		const state = createMap();
		fitTo(state, size, [...marks.keys()].map(id => npcById.get(id)));
		const inView = new Set(frame(state, size, marks).pins
			.filter(p => p.mark && p.left >= 0 && p.left <= size.w && p.top >= 0 && p.top <= size.h)
			.map(p => p.id));
		for (const id of marks.keys()) {
			assert.ok(inView.has(id), `${npcById.get(id).name} out of view fitting ${item}`);
		}
	}
});

test('fitting one island goes in close instead of staying wide', () => {
	const state = createMap();
	fitTo(state, SIZE, [npcs[0]]);
	assert.equal(state.zoom, zoomRange.max);
	assert.deepEqual(state.centre, { x: npcs[0].x, y: npcs[0].y });
});
