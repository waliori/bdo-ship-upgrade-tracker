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

import { shipbarters } from '../js/all_barter.js';
import { npcs, npcById, TILES, TILE, MAX_ZOOM } from '../js/barter_npcs.js';
import { toPixel, frame, marksFor, pan, zoomBy, createMap, zoomRange } from '../js/map.js';

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

test('the map opens wide enough to show nearly every island', () => {
	// The point of the screen is how spread out the sea is; opening on a
	// corner of it hides the answer.
	const { pins } = frame(createMap(), SIZE);
	assert.ok(pins.length > npcs.length * 0.9, `only ${pins.length} of ${npcs.length} in view`);
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
