// The chart stood up.
//
// Almost everything here can be wrong and still draw something that
// looks like terrain, so the tests are about the ways it would look
// right and be wrong: ground that sits half a sector from the island
// whose name is printed on it, a height that reads back as a different
// height, a tile the index says exists and the bake never wrote, and a
// view that stops answering "where does this land on the screen" the
// way the rest of the map expects.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

import { fromGame } from '../js/worldmap.js';
import { npcs } from '../js/barter_npcs.js';
import { frame, project, setProjector, createMap, toPixel } from '../js/map.js';

const SIZE = { w: 1200, h: 640 };
const ROOT = new URL('../', import.meta.url);

/** The bake's own constants, as tools/build-terrain.mjs writes them. */
const SECTOR_GAME = 12800;
const SCALE = 25;

let index = null;
try {
	index = JSON.parse(await readFile(new URL('map3d/index.json', ROOT), 'utf8'));
} catch { /* no bake on this checkout; the shape tests still run */ }

/* ------------------------------------------------------------------ *
 * the two grids agree
 * ------------------------------------------------------------------ */

test('a terrain sector lands where the chart says its ground is', () => {
	// The whole design rests on this: the terrain meshes are cut on the
	// same 12,800-unit sectors as the radar tiles, and js/worldmap.js
	// already knows how a game position becomes a chart one. If these
	// two ever disagree the ground slides off the islands, so the sum
	// is written out here rather than trusted.
	for (const [sx, sy] of [[0, 0], [16, -31], [-100, 100], [-65, -31]]) {
		const corner = fromGame(sx * SECTOR_GAME, (sy + 1) * SECTOR_GAME);
		assert.equal(corner.x, 68600 + sx * (SECTOR_GAME / SCALE));
		assert.equal(corner.y, 72200 - (sy + 1) * (SECTOR_GAME / SCALE));
	}
});

test('a sector is 512 chart units, which is a round number of tile pixels', () => {
	const sector = SECTOR_GAME / SCALE;
	assert.equal(sector, 512);
	// At the deepest zoom a chart unit is a pixel, so a sector is two
	// tiles of the flat chart across. Any other answer means the two
	// pyramids could never line up.
	assert.equal(toPixel(sector, 9), 512);
	assert.equal(toPixel(sector, 8), 256);
});

/* ------------------------------------------------------------------ *
 * the bake
 * ------------------------------------------------------------------ */

test('the index describes levels that exist, coarser as they go up', { skip: !index }, () => {
	assert.ok(index.levels.length >= 1);
	assert.equal(index.sector, 512);
	assert.equal(index.offX, 68600);
	assert.equal(index.offY, 72200);
	assert.equal(index.scale, SCALE);
	let last = null;
	for (const lv of index.levels) {
		assert.equal(lv.span, 1 << lv.level, `level ${lv.level} spans 2^level sectors`);
		assert.ok(lv.tiles > 0);
		assert.ok(lv.w > 0 && lv.h > 0);
		// A bitmap has to be long enough to hold a bit per cell of its
		// own box, or tileExists reads past the end and says "sea".
		assert.ok(Buffer.from(lv.bits, 'base64').length >= Math.ceil(lv.w * lv.h / 8));
		if (last) assert.ok(lv.tiles <= last.tiles, 'a coarser level has no more tiles');
		last = lv;
	}
});

test('every tile the index claims is on disk, and reads back', { skip: !index }, async () => {
	const lv = index.levels[index.levels.length - 1];   // the coarsest: few, and quick
	const bits = Buffer.from(lv.bits, 'base64');
	const claimed = [];
	for (let i = 0; i < lv.w * lv.h; i++) {
		if ((bits[i >> 3] >> (i & 7)) & 1) claimed.push([lv.x0 + (i % lv.w), lv.y0 + Math.floor(i / lv.w)]);
	}
	assert.equal(claimed.length, lv.tiles);

	for (const [x, y] of claimed) {
		const url = new URL(`map3d/${lv.level}/${x}_${y}.ter`, ROOT);
		assert.ok((await stat(url)).size > 32, `${lv.level}/${x}_${y} is more than a header`);
		const buf = await readFile(url);
		assert.equal(buf.readUInt32LE(0), 0x31544442, 'BDT1');
		assert.equal(buf.readUInt16LE(4), lv.level);
		assert.equal(buf.readInt16LE(6), x);
		assert.equal(buf.readInt16LE(8), y);

		const n = buf.readUInt16LE(10);
		const grid = buf.readUInt16LE(12);
		assert.equal(n, grid * grid, 'a grid tile has a node per lattice point');
		const baseH = buf.readFloatLE(18);
		const minH = buf.readFloatLE(22), maxH = buf.readFloatLE(26);
		const hScale = buf.readUInt16LE(30) / 256;
		assert.ok(hScale > 0);
		assert.ok(minH <= maxH);
		assert.equal(buf.length, 32 + n * 2 + Math.ceil(n * 3 / 4) * 4 + Math.ceil(n / 8));

		// Heights have to survive the quantisation: a node that reads
		// back outside its own tile's range is a packing bug, and it
		// would show as a spike through the sea.
		const mask = buf.subarray(32 + n * 2 + Math.ceil(n * 3 / 4) * 4);
		let covered = 0;
		for (let i = 0; i < n; i++) {
			if (!((mask[i >> 3] >> (i & 7)) & 1)) continue;
			covered++;
			const h = buf.readInt16LE(32 + i * 2) / hScale + baseH;
			assert.ok(h >= minH - 1 && h <= maxH + 1, `height ${h} outside ${minH}..${maxH}`);
		}
		assert.ok(covered > 0, 'a written tile has ground in it');
	}
});

/* ------------------------------------------------------------------ *
 * the projector
 * ------------------------------------------------------------------ */

test('a projector takes over where every layer is placed, and gives it back', () => {
	const state = createMap({ zoom: 5 });
	const flat = project(state, SIZE, state.centre.x, state.centre.y);
	// The centre of the view is the centre of the box, flat.
	assert.ok(Math.abs(flat.left - SIZE.w / 2) < 1e-6);
	assert.ok(Math.abs(flat.top - SIZE.h / 2) < 1e-6);

	setProjector(() => ({ left: 7, top: 9 }));
	try {
		assert.deepEqual(project(state, SIZE, 1000, 2000), { left: 7, top: 9 });
		// And the pins follow it, which is the point: the terrain view
		// moves them without knowing they exist.
		const f = frame(state, SIZE, new Map());
		assert.equal(f.pins.length, npcs.length, 'every pin is on screen at (7, 9)');
		assert.deepEqual(f.pins[0].left, 7);
		assert.deepEqual(f.pins[0].top, 9);
	} finally {
		setProjector(null);
	}
	assert.deepEqual(project(state, SIZE, state.centre.x, state.centre.y), flat);
});

test('a point behind the camera is placed off the screen, not folded in front of it', () => {
	// The terrain view answers with a huge negative rather than a
	// wrapped coordinate; every layer culls on the same test the flat
	// chart uses, so this is what keeps a pin behind your shoulder out
	// of the sky.
	const state = createMap({ zoom: 5 });
	setProjector((view, size, x) => (x > 0 ? { left: -1e6, top: -1e6, behind: true } : { left: 5, top: 5 }));
	try {
		const f = frame(state, SIZE, new Map());
		assert.equal(f.pins.length, 0, 'nothing behind the camera is drawn');
	} finally {
		setProjector(null);
	}
});
