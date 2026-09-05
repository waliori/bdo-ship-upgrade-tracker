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
import { npcs, npcById, ports, TILES, TILE, MAX_ZOOM } from '../js/barter_npcs.js';
import {
	toPixel, frame, marksFor, pan, zoomBy, zoomAt, createMap, zoomRange, tileFile,
	clampView, routeFor, fitTo, routePath, project, placeTile
} from '../js/map.js';

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

test('every barterer says where it stands', () => {
	// `at` comes from the BDOCodex node database by nearest-node match;
	// a missing one would render an empty line under the pin.
	for (const n of npcs) {
		assert.ok(typeof n.at === 'string' && n.at.length, `${n.name} has no place`);
		assert.ok(typeof n.region === 'string' && n.region.length, `${n.name} has no region`);
	}
});

test('every wharf sits on the charted sea, at every zoom', () => {
	// A port outside the tiles would anchor routes to a spot the map
	// cannot show.
	for (const p of ports) {
		assert.ok(p.name && p.x > 0 && p.y > 0, `${p.name || p.id} is incomplete`);
		for (const z of Object.keys(TILES).map(Number)) {
			const b = TILES[z];
			const tx = Math.floor(toPixel(p.x, z) / TILE);
			const ty = Math.floor(toPixel(p.y, z) / TILE);
			assert.ok(tx >= b.x0 && tx <= b.x1 && ty >= b.y0 && ty <= b.y1,
				`${p.name} off the chart at z${z}`);
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
	// corner of it hides the answer. Since the shore joined, the whole
	// sea is wider than a laptop view holds at the opening zoom -- Haemo
	// Island to Arehaza is 1,600 pixels at zoom 3 -- so the outermost
	// ports may start just off-screen; the heart of it must not.
	const { pins } = frame(createMap(), SIZE);
	assert.ok(pins.length > npcs.length * 0.85, `only ${pins.length} of ${npcs.length} in view`);
});

test('the shore is on the chart: the ten coastal barterers, at every zoom', () => {
	// Four of them stand past where the tiles used to end -- Haemo
	// Island west of it, the two O'dyllita ports south, Arehaza on the
	// eastern edge -- and TILES was widened to hold them. Each is joined
	// both ways: a position here, and exchanges in all_barter.json.
	const shore = [58979, 58973, 58981, 58980, 58984, 58983, 58974, 58976, 58978, 58977];
	const inRoutes = new Set(shipbarters.flatMap(e => e.sources.map(s => s.npc_id)));
	for (const id of shore) {
		const n = npcById.get(id);
		assert.ok(n, `${id} has no position`);
		assert.ok(inRoutes.has(id), `${n.name} trades nothing in the dataset`);
		for (const z of Object.keys(TILES).map(Number)) {
			const b = TILES[z];
			const tx = Math.floor(toPixel(n.x, z) / TILE);
			const ty = Math.floor(toPixel(n.y, z) / TILE);
			assert.ok(tx >= b.x0 && tx <= b.x1 && ty >= b.y0 && ty <= b.y1, `${n.name} off the chart at z${z}`);
		}
	}
	assert.equal(npcs.length, 91);
	// The far ones by name, so a coordinate typo cannot hide behind the loop.
	assert.equal(npcById.get(58980).at, 'Haemo Island');
	assert.equal(npcById.get(58983).at, "Crow's Nest");
	assert.ok(npcById.get(58980).x < 16000 && npcById.get(58978).y > 96000);
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
				// Through the alias table: an open-sea tile is one file
				// standing in for many, and it is that file that must exist.
				const name = tileFile(z, x, y);
				try {
					await fs.access(new URL(`../${name}`, import.meta.url));
				} catch {
					missing.push(`${z}_${x}_${y} -> ${name}`);
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
		const [z, x, y] = t.key.split('_').map(Number);
		const b = TILES[z];
		assert.ok(x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1, `${t.key} was not downloaded`);
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

test('every pin still carries its mark for the painter to layer by', () => {
	// frame() no longer orders pins -- the painter reuses keyed nodes, so
	// DOM order could not follow a sort anyway; z-index does the layering
	// off the mark. What the frame owes it is the mark itself.
	const marks = marksFor({ 'Brilliant Pearl Shard': 40 }, shipbarters);
	const { pins } = frame(createMap(), SIZE, marks);
	const lit = pins.filter(p => p.mark);
	assert.ok(lit.length > 0, 'nothing marked in view');
	for (const p of lit) assert.ok(marks.has(p.id), `${p.id} lit without a mark`);
	assert.equal(lit.length, pins.filter(p => marks.has(p.id)).length);
});

/* ------------------------------------------------------------------ *
 * staying on the chart
 * ------------------------------------------------------------------ */

test('a clamped view has a tile under every pixel, at every zoom', () => {
	// The bug this pins down: pan to an edge, or zoom in near one, and
	// the viewport hangs off the chart showing bare background. At the
	// widest zooms the whole world is smaller than the view and sits
	// centred in open sea; there, every pixel of the world is covered.
	for (const z of [zoomRange.min, 3, zoomRange.max]) {
		const world = Math.pow(2, z) * TILE;
		const cover = Math.ceil(Math.min(SIZE.w, world) / TILE) * Math.ceil(Math.min(SIZE.h, world) / TILE);
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

/* ------------------------------------------------------------------ *
 * continuous zoom
 * ------------------------------------------------------------------ */

test('a fractional zoom draws the nearest level, scaled the rest', () => {
	const state = createMap({ zoom: 3.5 });
	clampView(state, SIZE);
	const { tiles } = frame(state, SIZE);
	assert.ok(tiles.length, 'no tiles at a half zoom');
	for (const t of tiles) {
		assert.equal(t.z, 4, 'half-way rounds to the sharper level');
		assert.ok(Math.abs(t.scale - Math.pow(2, 3.5 - 4)) < 1e-9);
	}
});

test('a fractional zoom step still pins the cursor world point', () => {
	const cursor = { x: 900, y: 150 };
	const state = createMap({ zoom: 4 });
	const scale = z => Math.pow(2, MAX_ZOOM - z);
	const before = state.centre.x + (cursor.x - SIZE.w / 2) * scale(state.zoom);
	assert.ok(zoomAt(state, 0.3, SIZE, cursor.x, cursor.y));
	const after = state.centre.x + (cursor.x - SIZE.w / 2) * scale(state.zoom);
	assert.ok(Math.abs(before - after) < 1e-6);
});

test('project and placeTile land exactly where frame does', () => {
	const state = createMap({ zoom: 4.2 });
	clampView(state, SIZE);
	const { tiles, pins } = frame(state, SIZE);

	const t = tiles[0];
	const at = placeTile(state, SIZE, t.z, t.x, t.y);
	assert.ok(Math.abs(at.left - t.left) < 1e-6, 'tile x drifted');
	assert.ok(Math.abs(at.top - t.top) < 1e-6, 'tile y drifted');
	assert.ok(Math.abs(at.scale - t.scale) < 1e-9, 'tile scale drifted');

	assert.ok(pins.length, 'no pin to check against');
	const pin = pins[0];
	const n = npcById.get(pin.id);
	const p = project(state, SIZE, n.x, n.y);
	assert.ok(Math.abs(p.left - pin.left) <= 0.5 && Math.abs(p.top - pin.top) <= 0.5);
});

test('routePath bows every leg and starts at the first stop', () => {
	assert.equal(routePath([]), '');
	assert.equal(routePath([{ left: 3, top: 4 }]), '');
	const d = routePath([{ left: 0, top: 0 }, { left: 100, top: 0 }, { left: 100, top: 80 }]);
	assert.ok(d.startsWith('M 0.0 0.0'), d);
	assert.equal((d.match(/Q/g) || []).length, 2, 'one curve per leg');
});

test('a line too long to draw is cut to what can be seen', () => {
	// Zoomed onto one island, the far end of a course is millions of
	// pixels away; a browser handed a path that long stops drawing part
	// way through, and the line ends in open water.
	const size = { w: 1200, h: 640 };
	const far = [
		{ left: -4_000_000, top: 320 },
		{ left: 600, top: 320 },
		{ left: 5_000_000, top: 320 }
	];
	const d = routePath(far, size);
	for (const n of d.match(/-?\d+(\.\d+)?/g).map(Number)) {
		assert.ok(Math.abs(n) < 100_000, `${n} is too big to draw`);
	}
	// It still crosses the whole viewport rather than stopping inside it.
	assert.match(d, /^M -400\.0 /);
	assert.ok(d.includes('1600.0'), d);
});

test('a leg wholly off screen is dropped, and the line breaks rather than bending', () => {
	const size = { w: 100, h: 100 };
	// Two visible stretches with a long excursion far above the viewport
	// between them: two subpaths, not one line cutting across.
	const pts = [
		{ left: 10, top: 50 }, { left: 60, top: 50 },
		{ left: 60, top: -9000 }, { left: 20, top: -9000 },
		{ left: 20, top: 40 }, { left: 80, top: 40 }
	];
	const d = routePath(pts, size);
	assert.equal((d.match(/M /g) || []).length, 2, d);
	// Nothing is drawn for the excursion itself.
	assert.ok(!/-9000/.test(d));
});

test('without a viewport the path is the plain line it always was', () => {
	const pts = [{ left: 0, top: 0 }, { left: 10, top: 0 }];
	assert.match(routePath(pts), /^M 0\.0 0\.0 Q /);
	assert.equal(routePath([{ left: 1, top: 1 }]), '');
});
