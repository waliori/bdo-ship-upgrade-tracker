// The chart stood up: the game's own terrain, in three dimensions.
//
// The flat chart draws squares of the codex's map. This draws the
// ground those squares are a photograph of -- the meshes the client
// tessellates its own 3D world map from, baked into tiles by
// tools/build-terrain.mjs and read back here.
//
// Two things make it fit the rest of the map rather than sit beside it.
//
// The first is that it shares the chart's coordinates exactly. A sector
// of terrain is 12,800 game units, the tiles under map/ are cut on the
// same grid, and both are divided by 25 into chart units -- so a
// barterer's position needs no conversion, no fitting and no second
// source of truth. It is the same number.
//
// The second is that the camera *is* the projector. Everything else the
// map draws -- pins, wharves, the route, a hand-drawn trace -- asks
// map.js where a world position lands on the screen. While this view is
// up it answers with the camera's own matrix instead of the flat
// scaling, so every one of those layers stands up with the ground under
// it without knowing this module exists.
//
// WebGL2 and about six hundred lines, rather than a library: the flat
// chart made the same call for the same reason, and a terrain renderer
// that draws one kind of thing is smaller than the loader for one that
// draws everything.

import { MAX_ZOOM, TILE, TILES } from '../barter_npcs.js';
import { setProjector, tileSrc, levelFor } from '../map.js';

/** Sea level, in chart units. js/worldmap.js has it in the game's own
 *  (-8175); everything here is on the chart's divisor. */
export const SEA = -8175 / 25;

/** A sector is 512 chart units; a level-L tile is 2^L of them. */
const SECTOR = 512;

/** How much the relief is stretched. True scale over an ocean this wide
 *  reads as a flat sheet -- the game's own 3D map exaggerates too. */
const EXAG = 2.6;

/** How far the camera may lean over. Past this the horizon swallows the
 *  view and the tile count runs away. */
export const MAX_PITCH = 68;

/** Tiles kept parsed on the GPU. Each is a few hundred kilobytes of
 *  buffer at most; four hundred covers several screens at every level
 *  the view passes through on a zoom. */
const KEEP = 700;

const state = {
	on: false, gl: null, canvas: null, host: null,
	index: null, indexTried: false,
	tiles: new Map(), pending: new Set(), queue: [], floor: new Set(), floorList: [],
	prog: null, sea: null, seaBuf: null,
	skin: null, skinBox: null, skinTex: null, skinLevel: null, skinDirty: false,
	images: new Map(),
	pitch: 52, bearing: 0, style: 'real', sight: 'near',
	clock: 0, raf: null, lastSize: { w: 0, h: 0 },
	cam: null, failed: null
};

/* ------------------------------------------------------------------ *
 * a little matrix arithmetic
 * ------------------------------------------------------------------ */

function mul(a, b) {
	const o = new Float32Array(16);
	for (let r = 0; r < 4; r++) {
		for (let c = 0; c < 4; c++) {
			o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1]
				+ a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
		}
	}
	return o;
}

function perspective(fovy, aspect, near, far) {
	const f = 1 / Math.tan(fovy / 2);
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, (far + near) / (near - far), -1,
		0, 0, 2 * far * near / (near - far), 0
	]);
}

/**
 * The view matrix from a camera position and its own three axes.
 *
 * Written from the basis rather than from a look-at with an up vector
 * on purpose. Looking straight down -- which is exactly what the Level
 * button asks for, and the angle the flat chart is drawn at -- the view
 * axis and the world's up are the same line, their cross product is
 * zero, and a look-at hands back a matrix of NaNs: the whole chart
 * collapses into its own centre. Pitch and bearing give the axes with
 * no degenerate case anywhere in the range.
 */
function basisView(eye, x, y, z) {
	return new Float32Array([
		x[0], y[0], z[0], 0,
		x[1], y[1], z[1], 0,
		x[2], y[2], z[2], 0,
		-dot(x, eye), -dot(y, eye), -dot(z, eye), 1
	]);
}

/** The camera's axes for a lean and a heading. `z` points from what is
 *  being looked at back towards the camera; `x` is the screen's right,
 *  which stays level however far the camera leans; `y` follows. At
 *  pitch 0 and bearing 0 the screen's up is north, which is how the
 *  flat chart is drawn. */
function basis(pitch, bearing) {
	const z = [Math.sin(pitch) * Math.sin(bearing), Math.cos(pitch), Math.sin(pitch) * Math.cos(bearing)];
	const x = [Math.cos(bearing), 0, -Math.sin(bearing)];
	return { x, y: cross(z, x), z };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function norm(v) {
	const l = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / l, v[1] / l, v[2] / l];
}

/* ------------------------------------------------------------------ *
 * the camera
 * ------------------------------------------------------------------ */

/**
 * Where the camera stands for a given chart view.
 *
 * The chart's scale is fixed -- a chart unit is 2^(zoom - 9) screen
 * pixels -- so the camera works in screen pixels too: put it far enough
 * back that the ground through a 40 degree lens is exactly that scale
 * at the point being looked at, then lean it over by the pitch. At
 * pitch 0 this draws precisely what the flat chart draws, which is what
 * makes the switch between them not move anything.
 *
 * Everything is measured from the centre of the view rather than from
 * the chart's origin: a float32 loses a hundredth of a unit out at
 * chart 131,072, and the wobble that puts in a coastline is visible.
 */
function camera(view, size) {
	const s = Math.pow(2, view.zoom - MAX_ZOOM);      // chart units -> px
	const fovy = 40 * Math.PI / 180;
	const dist = (size.h / 2) / Math.tan(fovy / 2);   // px
	const pitch = state.pitch * Math.PI / 180;
	const bear = state.bearing * Math.PI / 180;

	// The point the camera looks at, in pixel space with the view's
	// centre at the origin. The sea is the floor, so that is the height
	// the view pivots about.
	const at = [0, SEA * s * EXAG, 0];
	const ax = basis(pitch, bear);
	const eye = [at[0] + dist * ax.z[0], at[1] + dist * ax.z[1], at[2] + dist * ax.z[2]];
	// Leaning over puts the far ground a long way off; near stays close
	// enough for a hill in front of the camera.
	const far = dist * (2 + 40 * Math.sin(pitch));
	const proj = perspective(fovy, size.w / size.h, dist / 32, far);
	const fog = SIGHT[state.sight].fog;
	const fogFar = dist * (fog[0] + fog[1] * Math.sin(pitch));
	return { s, dist, eye, axes: ax, mvp: mul(proj, basisView(eye, ax.x, ax.y, ax.z)), far, fogFar, centre: view.centre };
}

/**
 * A chart position on the screen, through the camera.
 *
 * This is what map.js hands every other layer while the view is up. A
 * point behind the camera is pushed far off screen rather than folded
 * back in front of it, which is what a bare divide by w would do -- a
 * pin behind your shoulder would otherwise appear in the sky.
 */
function projectThrough(cam, size, x, y, h = SEA) {
	const px = (x - cam.centre.x) * cam.s;
	const pz = (y - cam.centre.y) * cam.s;
	const py = h * cam.s * EXAG;
	const m = cam.mvp;
	const cx = m[0] * px + m[4] * py + m[8] * pz + m[12];
	const cy = m[1] * px + m[5] * py + m[9] * pz + m[13];
	const cw = m[3] * px + m[7] * py + m[11] * pz + m[15];
	if (cw <= 1e-6) return { left: -1e6, top: -1e6, behind: true };
	return {
		left: (cx / cw * 0.5 + 0.5) * size.w,
		top: (0.5 - cy / cw * 0.5) * size.h,
		behind: false
	};
}

/** Where a screen point lands on the sea, in chart units. The inverse
 *  of the above at h = SEA, done by walking the ray rather than
 *  inverting the matrix: two points on the ray, then the crossing. */
export function seaAt(size, px, py) {
	if (!state.cam) return null;
	const cam = state.cam;
	const ndcX = px / size.w * 2 - 1, ndcY = 1 - py / size.h * 2;
	// The ray through the pixel, off the camera's own axes: forward is
	// the way it looks (the negative of z), right and up are its own.
	const fovy = 40 * Math.PI / 180;
	const f = 1 / Math.tan(fovy / 2);
	const { x: right, y: up, z } = cam.axes;
	const fwd = [-z[0], -z[1], -z[2]];
	const ax = ndcX * (size.w / size.h) / f, ay = ndcY / f;
	const dir = norm([
		fwd[0] + ax * right[0] + ay * up[0],
		fwd[1] + ax * right[1] + ay * up[1],
		fwd[2] + ax * right[2] + ay * up[2]
	]);
	const planeY = SEA * cam.s * EXAG;
	if (Math.abs(dir[1]) < 1e-6) return null;
	const t = (planeY - cam.eye[1]) / dir[1];
	if (t <= 0) return null;
	return {
		x: cam.centre.x + (cam.eye[0] + dir[0] * t) / cam.s,
		y: cam.centre.y + (cam.eye[2] + dir[2] * t) / cam.s
	};
}

/* ------------------------------------------------------------------ *
 * the tile pyramid
 * ------------------------------------------------------------------ */

/**
 * A level for a zoom, taken as a whole.
 *
 * The ground itself no longer uses this -- visibleTiles picks a level
 * per tile, by how big it lands -- but the offline area and anything
 * else that wants one number for "how close is this view" still does.
 */
export function levelForZoom(zoom) {
	const lv = state.index ? state.index.levels : [];
	if (!lv.length) return 1;
	const lo = lv[0].level, hi = lv[lv.length - 1].level;
	return Math.max(lo, Math.min(hi, Math.round(7.32 - zoom)));
}

function levelInfo(level) {
	return state.index && state.index.levels.find(l => l.level === level);
}

/** Whether the bake holds this tile. Thirty thousand names would be a
 *  third of a megabyte of index; the bitmap is six kilobytes, and it
 *  saves asking the server for sea. */
function tileExists(info, x, y) {
	if (!info) return false;
	if (x < info.x0 || y < info.y0 || x >= info.x0 + info.w || y >= info.y0 + info.h) return false;
	const i = (y - info.y0) * info.w + (x - info.x0);
	return (info.bitsRaw[i >> 3] >> (i & 7)) & 1;
}

/** The chart box a tile covers. Chart y runs against the sector index,
 *  which is where the + 1 comes from -- tools/build-terrain.mjs packs
 *  the tiles on the same understanding. */
function tileBox(level, x, y) {
	const span = (1 << level) * SECTOR;
	const ix = state.index;
	return {
		x0: ix.offX + x * span, y0: ix.offY - (y + 1) * span,
		x1: ix.offX + (x + 1) * span, y1: ix.offY - y * span, span
	};
}

/* ------------------------------------------------------------------ *
 * reading a tile
 * ------------------------------------------------------------------ */

const FILE_MAGIC = 0x31544442;

/**
 * One baked tile into buffers the GPU can draw.
 *
 * A grid tile stores only a height and a colour per node -- the lattice
 * itself is known, so the x and y are worked out here rather than
 * shipped thirty thousand times. Nodes the bake never covered are holes
 * (open sea, mostly), and a quad missing any corner is simply not
 * drawn: that is what keeps a coastline a coastline.
 */
function parseTile(buf, level, tx, ty) {
	const dv = new DataView(buf);
	if (buf.byteLength < 32 || dv.getUint32(0, true) !== FILE_MAGIC) return null;
	const count = dv.getUint16(10, true);
	const gridN = dv.getUint16(12, true);
	const baseH = dv.getFloat32(18, true);
	const minH = dv.getFloat32(22, true);
	const maxH = dv.getFloat32(26, true);
	const hScale = dv.getUint16(30, true) / 256;
	const box = tileBox(level, tx, ty);

	// Level 0 is the mesh the game itself draws from: every vertex it
	// placed, where it placed it, with the colour it gave it. The
	// levels above are a lattice and carry only what a lattice cannot
	// work out (see the grid branch below).
	if (!gridN) {
		const nv = count;
		const tris = dv.getUint32(14, true);
		const pOff = 32, cOff = pOff + nv * 6, iOff = cOff + Math.ceil(nv * 3 / 4) * 4;
		if (!nv || !tris || buf.byteLength < iOff + tris * 6) return null;
		const q = new Int16Array(buf, pOff, nv * 3);
		const pos = new Float32Array(nv * 3);
		for (let i = 0; i < nv; i++) {
			pos[i * 3] = q[i * 3] / 32;
			pos[i * 3 + 1] = q[i * 3 + 2] / hScale + baseH;
			pos[i * 3 + 2] = q[i * 3 + 1] / 32;
		}
		return {
			pos,
			col: new Uint8Array(buf.slice(cOff, cOff + nv * 3)),
			idx: new Uint16Array(buf.slice(iOff, iOff + tris * 6)),
			box, minH, maxH
		};
	}

	const n = gridN * gridN;
	if (count !== n) return null;
	const hOff = 32, cOff = hOff + n * 2, mOff = cOff + Math.ceil(n * 3 / 4) * 4;
	if (buf.byteLength < mOff + Math.ceil(n / 8)) return null;
	const heights = new Int16Array(buf, hOff, n);
	const colours = new Uint8Array(buf, cOff, n * 3);
	const mask = new Uint8Array(buf, mOff, Math.ceil(n / 8));

	const step = box.span / (gridN - 1);
	const pos = new Float32Array(n * 3);
	const col = new Uint8Array(n * 3);
	for (let gy = 0; gy < gridN; gy++) {
		for (let gx = 0; gx < gridN; gx++) {
			const k = gy * gridN + gx;
			pos[k * 3] = gx * step;
			pos[k * 3 + 1] = heights[k] / hScale + baseH;
			pos[k * 3 + 2] = gy * step;
			col[k * 3] = colours[k * 3];
			col[k * 3 + 1] = colours[k * 3 + 1];
			col[k * 3 + 2] = colours[k * 3 + 2];
		}
	}
	const here = k => (mask[k >> 3] >> (k & 7)) & 1;
	const idx = [];
	for (let gy = 0; gy < gridN - 1; gy++) {
		for (let gx = 0; gx < gridN - 1; gx++) {
			const a = gy * gridN + gx, b = a + 1, c = a + gridN, d = c + 1;
			if (!here(a) || !here(b) || !here(c) || !here(d)) continue;
			idx.push(a, c, b, b, c, d);
		}
	}
	if (!idx.length) return null;
	return { pos, col, idx: new Uint16Array(idx), box, minH, maxH };
}

function upload(gl, mesh) {
	const pos = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, pos);
	gl.bufferData(gl.ARRAY_BUFFER, mesh.pos, gl.STATIC_DRAW);
	const col = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, col);
	gl.bufferData(gl.ARRAY_BUFFER, mesh.col, gl.STATIC_DRAW);
	const idx = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.idx, gl.STATIC_DRAW);
	return { pos, col, idx, count: mesh.idx.length, box: mesh.box, minH: mesh.minH, maxH: mesh.maxH, used: 0 };
}

function drop(gl, tile) {
	gl.deleteBuffer(tile.pos);
	gl.deleteBuffer(tile.col);
	gl.deleteBuffer(tile.idx);
}

/**
 * A tile's bytes, inflated.
 *
 * The bake writes gzip rather than leaning on Content-Encoding: an
 * encoded body gets decoded by whatever is in the way -- a proxy, a
 * CDN, the service worker's cache when it replays -- and two of them
 * disagreeing about whether that has happened yet produces nonsense
 * with no error. Opaque bytes cannot be got wrong on the way, so they
 * are inflated here. A tile written before this (or by hand) still
 * reads: the check is the gzip magic, not a promise in the index.
 */
async function inflate(buf) {
	const head = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
	if (head.length < 2 || head[0] !== 0x1f || head[1] !== 0x8b) return buf;
	if (typeof DecompressionStream !== 'function') throw new Error('no gzip decoder');
	const stream = new Response(buf).body.pipeThrough(new DecompressionStream('gzip'));
	return await new Response(stream).arrayBuffer();
}

/**
 * Ask for a tile, eventually.
 *
 * Not straight to fetch: a lean at a deep zoom wants a good many tiles
 * at once, and a browser given two hundred of them at once spends its
 * connections on them and starves the flat squares the ground is
 * wearing. So they queue, a few at a time, and the queue is emptied at
 * the start of every frame so that what is asked for is always what is
 * in view now rather than what was in view three zooms ago.
 *
 * The order is coarse first (see sortQueue). A zoom throws away the
 * whole selection, and filling two hundred tiles takes ten seconds --
 * during which, fine-first, the chart has almost nothing on it and
 * reads as broken. One coarse tile covers sixteen times the ground of
 * a tile two levels down for the same five kilobytes, so coarse first
 * puts ground everywhere within a second and sharpens it after.
 */
// Four, not six. Six is a browser's whole per-origin budget on HTTP/1.1
// -- which is what a plain http://localhost is, where the deployed site
// is HTTP/2 and multiplexed -- so terrain streaming at six would leave
// nothing for the flat squares, the icons or the modules, and the whole
// page would stall behind ground nobody had asked to see yet.
const IN_FLIGHT = 4;

function want(level, x, y) {
	const key = `${level}_${x}_${y}`;
	if (state.tiles.has(key) || state.pending.has(key) || state.queue.includes(key)) return;
	const info = levelInfo(level);
	if (!tileExists(info, x, y)) {
		state.tiles.set(key, null);   // remembered as empty sea
		return;
	}
	state.queue.push(key);
}

/** Coarsest first, and nearest within a level: what covers the most
 *  ground per tile, where the camera is looking. */
function sortQueue() {
	const level = key => Number(key.slice(0, key.indexOf('_')));
	state.queue.sort((a, b) => level(b) - level(a));
}

function pump() {
	while (state.pending.size < IN_FLIGHT && state.queue.length) {
		const key = state.queue.shift();
		if (state.tiles.has(key) || state.pending.has(key)) continue;
		fetchTile(key);
	}
}

async function fetchTile(key) {
	// The parts can be negative, so this is not a plain split on '_':
	// "1_-5_-31" has four pieces by that reading.
	const m = /^(\d+)_(-?\d+)_(-?\d+)$/.exec(key);
	if (!m) { state.tiles.set(key, null); return; }
	const level = Number(m[1]), x = Number(m[2]), y = Number(m[3]);
	state.pending.add(key);
	try {
		const res = await fetch(`map3d/${level}/${x}_${y}.ter?v=${state.index.stamp}`);
		if (!res.ok) throw new Error(res.status);
		const mesh = parseTile(await inflate(await res.arrayBuffer()), level, x, y);
		state.tiles.set(key, mesh && state.gl ? upload(state.gl, mesh) : null);
	} catch {
		// A tile that will not load is sea until the view is rebuilt.
		state.tiles.set(key, null);
	} finally {
		state.pending.delete(key);
		if (state.on) { pump(); schedule(); }
	}
}

/**
 * The whole world at its coarsest, fetched once and never let go.
 *
 * Without it, swinging the camera onto ground it has not seen draws
 * nothing at all -- not the tiles, which have not arrived, and not a
 * coarser stand-in, because that had never been asked for either. The
 * chart went blank until it was nudged. The top three levels are about
 * sixty tiles and a few hundred kilobytes for the entire world, so they
 * are simply always in hand: the view can be short of detail, but it is
 * never short of ground.
 */
const FLOOR_LEVELS = 3;

function keepFloor() {
	if (!state.index) return;
	const levels = state.index.levels.map(l => l.level).sort((a, b) => b - a).slice(0, FLOOR_LEVELS);
	for (const level of levels) {
		const info = levelInfo(level);
		if (!info) continue;
		for (let x = info.x0; x < info.x0 + info.w; x++) {
			for (let y = info.y0; y < info.y0 + info.h; y++) {
				if (!tileExists(info, x, y)) continue;
				state.floor.add(`${level}_${x}_${y}`);
				state.floorList.push([level, x, y]);
			}
		}
	}
}

/** Forget the tiles nobody has looked at for longest -- except the
 *  floor, which is the whole point of it. */
function evict() {
	if (state.tiles.size <= KEEP) return;
	const live = [...state.tiles.entries()].filter(([k, t]) => t && !state.floor.has(k));
	if (live.length <= KEEP) return;
	live.sort((a, b) => a[1].used - b[1].used);
	for (const [key, tile] of live.slice(0, live.length - KEEP)) {
		drop(state.gl, tile);
		state.tiles.delete(key);
	}
}

/* ------------------------------------------------------------------ *
 * the skin
 * ------------------------------------------------------------------ */

// The colours the meshes carry are the client's own far-distance
// colours -- hazed blue-grey, which is right for terrain seen from
// three kilometres up inside the game and wrong for a chart. The chart
// already has the real ground, though: the squares under map/ are a
// photograph of exactly this terrain on exactly these coordinates. So
// the view wears them. The visible squares are drawn into one canvas
// covering a chart-space box, uploaded as a single texture, and the
// shader finds a point's colour from its own world position -- no
// texture coordinates to bake, nothing new to ship, and the stood-up
// chart is unmistakably the same chart as the flat one.
const SKIN = 2048;

function skinCanvas() {
	if (state.skin) return state.skin;
	const c = document.createElement('canvas');
	c.width = c.height = SKIN;
	state.skin = { canvas: c, ctx: c.getContext('2d', { willReadFrequently: false }) };
	return state.skin;
}

/**
 * The image for one flat tile, fetched once and kept.
 *
 * Kept by when it was last *drawn*, not by when it was fetched. Order
 * of arrival is the wrong rule here: one skin wants about eighty
 * squares at once, and an eviction that throws out the oldest throws
 * out squares the skin is using right now, which fetches them again,
 * which evicts more of them. That thrash is what left the ground
 * wearing the client's own grey at the deepest zooms -- the canvas was
 * nearly empty every time it was uploaded.
 */
const SKIN_KEEP = 320;
let skinTick = 0;

function tileImage(z, x, y) {
	const b = TILES[z];
	if (!b || x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return null;
	const src = tileSrc(z, x, y);
	let img = state.images.get(src);
	if (!img) {
		img = new Image();
		img.decoding = 'async';
		img.onload = () => { state.skinDirty = true; schedule(); };
		img.onerror = () => { /* a square that will not come is open sea */ };
		img.src = src;
		state.images.set(src, img);
	}
	img.tick = skinTick;
	return img.complete && img.naturalWidth ? img : null;
}

function trimImages() {
	if (state.images.size <= SKIN_KEEP) return;
	const live = [...state.images.entries()].sort((a, b) => (a[1].tick || 0) - (b[1].tick || 0));
	for (const [src] of live.slice(0, live.length - SKIN_KEEP)) state.images.delete(src);
}

/**
 * Redraw the skin for a view, if the one in hand no longer covers it.
 *
 * The box is twice the width of what can be seen, so an ordinary pan
 * does not redraw anything; the level is the flat chart's own choice
 * for this zoom, so the squares are the ones it would be drawing.
 */
function ensureSkin(gl, view, size) {
	const per = Math.pow(2, MAX_ZOOM - view.zoom);        // chart units per screen px
	// Wide enough that an ordinary pan does not redraw it, narrow enough
	// that it is eighty squares rather than a hundred and fifty.
	const span = Math.max(size.w, size.h) * per * 1.8;
	const level = levelFor(view.zoom);
	const box = state.skinBox;
	const need = !box || level !== state.skinLevel
		|| Math.abs(box.cx - view.centre.x) > span * 0.18
		|| Math.abs(box.cy - view.centre.y) > span * 0.18
		|| Math.abs(box.span - span) > span * 0.25;
	if (!need && !state.skinDirty) return;

	const next = need
		? { cx: view.centre.x, cy: view.centre.y, span, x0: view.centre.x - span / 2, y0: view.centre.y - span / 2 }
		: box;
	skinTick++;
	const { canvas, ctx } = skinCanvas();
	const unit = next.span / SKIN;                         // chart units per texel
	const tileChart = TILE * Math.pow(2, MAX_ZOOM - level);
	ctx.clearRect(0, 0, SKIN, SKIN);
	const x0 = Math.floor(next.x0 / tileChart), x1 = Math.floor((next.x0 + next.span) / tileChart);
	const y0 = Math.floor(next.y0 / tileChart), y1 = Math.floor((next.y0 + next.span) / tileChart);
	let had = 0;
	for (let tx = x0; tx <= x1; tx++) {
		for (let ty = y0; ty <= y1; ty++) {
			const img = tileImage(level, tx, ty);
			if (!img) continue;
			const dx = (tx * tileChart - next.x0) / unit;
			const dy = (ty * tileChart - next.y0) / unit;
			const d = tileChart / unit;
			ctx.drawImage(img, dx, dy, d, d);
			had++;
		}
	}
	state.skinBox = next;
	state.skinLevel = level;
	state.skinDirty = false;
	trimImages();
	if (!had) return;

	if (!state.skinTex) {
		state.skinTex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, state.skinTex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}
	gl.bindTexture(gl.TEXTURE_2D, state.skinTex);
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
	state.uploads = (state.uploads || 0) + 1;
}

/* ------------------------------------------------------------------ *
 * shaders
 * ------------------------------------------------------------------ */

const TERRAIN_VS = `#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aCol;
uniform mat4 uMVP;
uniform vec2 uOrigin;
uniform float uScale;
uniform float uExag;
uniform vec2 uCentre;
uniform vec3 uSkinBox;      // x0, y0, span -- the chart box the skin covers
out vec3 vCol;
out vec3 vWorld;
out vec2 vSkin;
out float vHeight;
void main() {
	vHeight = aPos.y;
	vec2 chart = uCentre + vec2(uOrigin.x + aPos.x, uOrigin.y + aPos.z);
	vSkin = (chart - uSkinBox.xy) / uSkinBox.z;
	vec3 p = vec3((uOrigin.x + aPos.x) * uScale, aPos.y * uScale * uExag, (uOrigin.y + aPos.z) * uScale);
	vWorld = p;
	vCol = aCol;
	gl_Position = uMVP * vec4(p, 1.0);
}`;

// The normal comes from the derivative of the world position rather
// than a shipped normal: it costs nothing, it is exact for a faceted
// mesh, and it follows the height exaggeration for free.
const TERRAIN_FS = `#version 300 es
precision highp float;
in vec3 vCol;
in vec3 vWorld;
in vec2 vSkin;
in float vHeight;
uniform sampler2D uSkinTex;
uniform float uSkinOn;
uniform vec3 uSun;
uniform vec3 uFog;
uniform float uFogFar;
uniform float uSea;
uniform float uNeon;
uniform float uStep;
out vec4 frag;
void main() {
	vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
	if (n.y < 0.0) n = -n;
	float lam = max(dot(n, uSun), 0.0);

	// The ground the flat chart draws, found by world position; the
	// mesh's own colours stand in past the skin's edge and until the
	// squares have landed.
	vec3 base = vCol / 255.0;
	vec4 skin = texture(uSkinTex, vSkin);
	float inside = step(0.0, vSkin.x) * step(vSkin.x, 1.0) * step(0.0, vSkin.y) * step(vSkin.y, 1.0);
	base = mix(base, skin.rgb, uSkinOn * inside * skin.a);

	// Under the sea the colour darkens towards the deep: a beach that
	// keeps its sand two hundred units down reads as a shallow, which is
	// exactly the mistake a sailing chart must not make.
	float wet = clamp((uSea - vHeight) / 60.0, 0.0, 1.0);
	base = mix(base, base * 0.45 + vec3(0.02, 0.05, 0.07), wet * 0.8);

	vec3 lit = base * (0.72 + 0.46 * lam);
	lit += vec3(0.06, 0.08, 0.10) * pow(1.0 - max(n.y, 0.0), 2.0) * (1.0 - wet);

	if (uNeon > 0.5) {
		float c = vHeight / uStep;
		float d = fwidth(c);
		float line = 1.0 - smoothstep(0.0, 1.0, abs(fract(c - 0.5) - 0.5) / max(d, 1e-5));
		vec3 ground = mix(vec3(0.025, 0.028, 0.05), vec3(0.10, 0.05, 0.02), clamp(lam, 0.0, 1.0));
		lit = ground + vec3(1.0, 0.48, 0.10) * line * (0.55 + 0.45 * lam);
		lit = mix(lit, vec3(0.02, 0.06, 0.10), wet * 0.7);
	}

	float fog = clamp(length(vWorld.xz) / uFogFar, 0.0, 1.0);
	frag = vec4(mix(lit, uFog, fog * fog * 0.92), 1.0);
}`;

const SEA_VS = `#version 300 es
precision highp float;
in vec2 aXZ;
uniform mat4 uMVP;
uniform float uScale;
uniform float uExag;
uniform float uSea;
uniform float uSpan;
uniform vec2 uCentre;
uniform vec3 uSkinBox;
out vec2 vXZ;
out vec2 vSkin;
void main() {
	vec2 p = aXZ * uSpan;
	vXZ = p;
	vec2 chart = uCentre + p / uScale;
	vSkin = (chart - uSkinBox.xy) / uSkinBox.z;
	gl_Position = uMVP * vec4(p.x, uSea * uScale * uExag, p.y, 1.0);
}`;

// The sea wears the same squares the land does, so the water is the
// water the flat chart draws -- the codex's own ocean, with its reefs
// and its shallows -- and all this adds is a long shimmer across it.
// Past the skin's edge it falls back to open blue.
const SEA_FS = `#version 300 es
precision highp float;
in vec2 vXZ;
in vec2 vSkin;
uniform float uTime;
uniform vec3 uFog;
uniform float uFogFar;
uniform float uNeon;
uniform float uSkinOn;
uniform sampler2D uSkinTex;
out vec4 frag;
void main() {
	float w = sin(vXZ.x * 0.010 + uTime * 0.55) * 0.5 + sin(vXZ.y * 0.0081 - uTime * 0.4) * 0.5;
	float glint = pow(max(w, 0.0), 10.0);
	vec3 deep = uNeon > 0.5 ? vec3(0.016, 0.035, 0.062) : vec3(0.043, 0.105, 0.135);
	vec3 top = uNeon > 0.5 ? vec3(0.03, 0.09, 0.14) : vec3(0.075, 0.165, 0.20);
	vec3 c = mix(deep, top, w * 0.5 + 0.5);
	vec4 skin = texture(uSkinTex, vSkin);
	float inside = step(0.0, vSkin.x) * step(vSkin.x, 1.0) * step(0.0, vSkin.y) * step(vSkin.y, 1.0);
	c = mix(c, skin.rgb * (0.96 + 0.08 * w), uSkinOn * inside * skin.a);
	c += glint * (uNeon > 0.5 ? vec3(0.09, 0.18, 0.26) : vec3(0.10, 0.13, 0.13));
	float fog = clamp(length(vXZ) / uFogFar, 0.0, 1.0);
	frag = vec4(mix(c, uFog, fog * fog * 0.92), 1.0);
}`;

function compile(gl, type, src) {
	const sh = gl.createShader(type);
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		throw new Error(gl.getShaderInfoLog(sh) || 'shader failed');
	}
	return sh;
}

function program(gl, vs, fs, attrs) {
	const p = gl.createProgram();
	gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
	gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
	for (let i = 0; i < attrs.length; i++) gl.bindAttribLocation(p, i, attrs[i]);
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog(p) || 'link failed');
	}
	const u = {};
	const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
	for (let i = 0; i < n; i++) {
		const name = gl.getActiveUniform(p, i).name;
		u[name] = gl.getUniformLocation(p, name);
	}
	return { p, u };
}

/* ------------------------------------------------------------------ *
 * mounting
 * ------------------------------------------------------------------ */

export function terrainSupported() {
	if (state.failed) return false;
	if (typeof DecompressionStream !== 'function') {
		state.failed = 'this browser cannot unpack the terrain tiles';
		return false;
	}
	try {
		const c = document.createElement('canvas');
		return !!(c.getContext('webgl2'));
	} catch {
		return false;
	}
}

async function loadIndex() {
	if (state.index || state.indexTried) return state.index;
	state.indexTried = true;
	try {
		const res = await fetch('map3d/index.json');
		if (!res.ok) throw new Error(res.status);
		const ix = await res.json();
		for (const lv of ix.levels) {
			const raw = atob(lv.bits);
			const bytes = new Uint8Array(raw.length);
			for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
			lv.bitsRaw = bytes;
		}
		ix.levels.sort((a, b) => a.level - b.level);
		state.index = ix;
	} catch (err) {
		state.failed = `the terrain is not baked here (${err.message})`;
	}
	return state.index;
}

/** Bring the view up inside the map box. Resolves false when there is
 *  nothing to show -- no WebGL2, or no bake on this deployment. */
export async function enterTerrain(host) {
	if (state.on) return true;
	if (!terrainSupported()) { state.failed = 'this browser has no WebGL2'; return false; }
	if (!await loadIndex()) return false;

	const canvas = document.createElement('canvas');
	canvas.className = 'map-3d';
	canvas.setAttribute('aria-hidden', 'true');
	const layer = host.querySelector('[data-map-layer]');
	host.insertBefore(canvas, layer);

	const gl = canvas.getContext('webgl2', {
		alpha: false, antialias: true, depth: true,
		powerPreference: 'high-performance'
	});
	if (!gl) { canvas.remove(); state.failed = 'this browser has no WebGL2'; return false; }

	state.canvas = canvas;
	state.gl = gl;
	state.host = host;
	state.prog = program(gl, TERRAIN_VS, TERRAIN_FS, ['aPos', 'aCol']);
	state.sea = program(gl, SEA_VS, SEA_FS, ['aXZ']);
	state.seaBuf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, state.seaBuf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	gl.enable(gl.DEPTH_TEST);
	// Nothing here is a solid: the terrain is a sheet with holes in it
	// where the coast ends, and the sea is one quad seen from above or
	// from below depending on the lean. Culling either of them costs a
	// correct picture and saves nothing worth having -- the sea was
	// vanishing entirely, so what read as water was the sea floor.
	gl.disable(gl.CULL_FACE);

	state.on = true;
	host.classList.add('map-has-3d');
	keepFloor();
	setProjector((view, size, x, y) => {
		const cam = state.cam || camera(view, size);
		return projectThrough(cam, size, x, y);
	});
	return true;
}

export function exitTerrain() {
	if (!state.on) return;
	state.on = false;
	setProjector(null);
	const gl = state.gl;
	for (const [, tile] of state.tiles) if (tile) drop(gl, tile);
	state.tiles.clear();
	state.pending.clear();
	state.queue.length = 0;
	state.floor.clear();
	state.floorList.length = 0;
	if (state.raf) cancelAnimationFrame(state.raf);
	state.raf = null;
	loadingLight(false);
	if (state.host) state.host.classList.remove('is-loading');
	if (state.skinTex) gl.deleteTexture(state.skinTex);
	state.skinTex = state.skin = state.skinBox = state.skinLevel = null;
	state.images.clear();
	if (state.canvas) state.canvas.remove();
	if (state.host) state.host.classList.remove('map-has-3d');
	state.canvas = state.gl = state.host = null;
	state.cam = null;
}

export const terrainOn = () => state.on;

/** What the last frame actually did: which levels it drew, how many
 *  tiles are still coming, and whether the ground is wearing the flat
 *  chart's squares yet. For working out why a view looks wrong. */
export function terrainDiag() {
	return {
		on: state.on,
		levels: state.levelsDrawn || null,
		drawn: state.drawn || 0,
		waiting: state.waiting || 0,
		exists: state.exists || 0,
		queued: state.queue.length,
		cached: state.tiles.size,
		floor: `${[...state.floor].filter(k => state.tiles.get(k)).length}/${state.floor.size}`,
		holes: [...state.tiles].filter(([k, t]) => {
			if (t) return false;
			const m = /^(\d+)_(-?\d+)_(-?\d+)$/.exec(k);
			return m && tileExists(levelInfo(Number(m[1])), Number(m[2]), Number(m[3]));
		}).length,
		frameMs: state.frameMs ? Number(state.frameMs.toFixed(1)) : 0,
		uploads: state.uploads || 0,
		dpr: state.dpr || 0,
		skin: state.skinBox ? { level: state.skinLevel, span: Math.round(state.skinBox.span), tex: !!state.skinTex, images: state.images.size } : null
	};
}
export const terrainTrouble = () => state.failed;

export function setStyle(style) {
	state.style = style === 'neon' ? 'neon' : 'real';
	schedule();
}
export const terrainStyle = () => state.style;

/** How far the ground is drawn: 'near' or 'far'. */
export function setSight(how) {
	state.sight = how === 'far' ? 'far' : 'near';
	schedule();
}
export const terrainSight = () => state.sight;

export function tilt(dPitch, dBearing) {
	state.pitch = Math.max(0, Math.min(MAX_PITCH, state.pitch + dPitch));
	state.bearing = (state.bearing + dBearing + 360) % 360;
	schedule();
}
export function setTilt(pitch, bearing) {
	state.pitch = Math.max(0, Math.min(MAX_PITCH, pitch));
	state.bearing = (bearing + 360) % 360;
}
export const tiltNow = () => ({ pitch: state.pitch, bearing: state.bearing });

/* ------------------------------------------------------------------ *
 * drawing
 * ------------------------------------------------------------------ */

/** The chart's own "something is coming" thread, lit for the terrain
 *  too -- and only once the wait is long enough to notice, so a tile
 *  off the disk never makes it flicker. */
let lightTimer = null;
function loadingLight(on) {
	const host = state.host;
	if (!host) return;
	if (on) {
		if (!lightTimer && !host.classList.contains('is-loading')) {
			lightTimer = setTimeout(() => { lightTimer = null; if (state.on) host.classList.add('is-loading'); }, 300);
		}
		return;
	}
	if (lightTimer) { clearTimeout(lightTimer); lightTimer = null; }
	host.classList.remove('is-loading');
}

let pendingDraw = null;
function schedule() {
	if (!state.on || state.raf) return;
	state.raf = requestAnimationFrame(() => {
		state.raf = null;
		if (pendingDraw) drawTerrain(pendingDraw.view, pendingDraw.size);
	});
}

/**
 * The tiles to draw, chosen by how big they land on the screen.
 *
 * One level for the whole view is the wrong answer the moment the
 * camera leans: the water at your feet and the water at the horizon are
 * the same tiles at wildly different sizes, and picking a level for the
 * middle means either a blurry foreground or -- what this did at first
 * -- four hundred of the finest tiles requested at once, most of them
 * for ground a pixel high at the back of the view.
 *
 * So the pyramid is walked instead of indexed. Start at the coarsest
 * level, and split a tile into its four children only while one of its
 * grid cells would still cover more than a few pixels. Near the camera
 * that descends all the way to level 0, the mesh the game itself draws
 * from; at the horizon it stops three or four levels up. This is what
 * every terrain renderer does, and it is what keeps the count in the
 * dozens instead of the hundreds.
 */
// A grid cell bigger than this is worth splitting. It has to stay under
// eight: at the chart's deepest zoom a level 1 cell is eight pixels, and
// if that does not split there is never any reason to load level 0 and
// the mesh the game draws from is never seen.
const SPLIT_PX = 6;

/**
 * How far past the middle of the view the ground is drawn, as a
 * multiple of the box's height, and how quickly the haze closes on it.
 *
 * Two settings rather than one, because the right answer depends on
 * what the view is for. Near is the default: the horizon closes a
 * little way out, which is what a chart wants and what keeps the tile
 * count down. Far opens it up for the view of the whole archipelago
 * that the ground was baked for -- it costs more tiles, but they are
 * coarse ones, since the split test already spends less detail where
 * the haze is thick.
 */
const SIGHT = {
	near: { reach: 3.5, fog: [1.05, 2.2] },
	far: { reach: 7.5, fog: [1.5, 4.0] }
};

const MAX_TILES = 200;

function visibleTiles(view, size) {
	const ix = state.index;
	if (!ix || !state.cam) return [];
	const levels = ix.levels.map(l => l.level);
	const top = Math.max(...levels), bottom = Math.min(...levels);

	// The water the screen can see, as a box. A leaning camera's far
	// corners land past the horizon and come back null, so the box is
	// capped at the distance the fog closes anyway.
	const cap = size.h * SIGHT[state.sight].reach / Math.pow(2, view.zoom - MAX_ZOOM);
	const pts = [];
	for (const [px, py] of [[0, 0], [size.w, 0], [0, size.h], [size.w, size.h], [size.w / 2, size.h / 2]]) {
		const p = seaAt(size, px, py);
		if (p) pts.push(p);
	}
	if (!pts.length) return [];
	let vx0 = Infinity, vx1 = -Infinity, vy0 = Infinity, vy1 = -Infinity;
	for (const p of pts) {
		vx0 = Math.min(vx0, p.x); vx1 = Math.max(vx1, p.x);
		vy0 = Math.min(vy0, p.y); vy1 = Math.max(vy1, p.y);
	}
	vx0 = Math.max(vx0, view.centre.x - cap); vx1 = Math.min(vx1, view.centre.x + cap);
	vy0 = Math.max(vy0, view.centre.y - cap); vy1 = Math.min(vy1, view.centre.y + cap);

	/**
	 * Whether a tile is worth splitting: how many pixels one of its grid
	 * cells covers, against how much of it the fog is going to eat.
	 *
	 * Perspective alone already makes distant cells small, but not small
	 * enough -- at a lean the back half of the view was a hundred and
	 * fifty tiles of ground behind haze, fetched ahead of the ground
	 * underfoot. Detail nobody can see is not detail. A tile behind the
	 * camera answers false, which stops the descent.
	 */
	const per = Math.pow(2, MAX_ZOOM - view.zoom);
	const worthSplitting = (box, span) => {
		// Measured at the corner of the tile nearest the middle of the
		// view, not at its centre. A tile at the top of the pyramid is
		// the size of the world and its centre can be behind the camera
		// or a continent away -- judging it there answered "not worth
		// splitting" for the tile the view is standing on, and the walk
		// never descended at all.
		const nx = Math.min(Math.max(view.centre.x, box.x0), box.x1);
		const ny = Math.min(Math.max(view.centre.y, box.y0), box.y1);
		const cell = span / (ix.grid - 1);
		const a = projectThrough(state.cam, size, nx, ny);
		if (a.behind) return false;
		const b = projectThrough(state.cam, size, nx + cell, ny);
		if (b.behind) return false;
		const px = Math.hypot(b.left - a.left, b.top - a.top);
		// How far into the haze that corner sits, on the shader's own
		// reckoning: detail nobody can see is not detail.
		const away = Math.hypot(nx - view.centre.x, ny - view.centre.y) / per;
		const fog = Math.min(1, away / (state.cam.fogFar || 1));
		return px > SPLIT_PX * (1 + 5 * fog * fog);
	};

	const out = [];
	const walk = (level, x, y) => {
		if (out.length >= MAX_TILES) return;
		const box = tileBox(level, x, y);
		if (box.x1 < vx0 || box.x0 > vx1 || box.y1 < vy0 || box.y0 > vy1) return;
		const fine = level > bottom && worthSplitting(box, box.span);
		if (fine) {
			for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) walk(level - 1, x * 2 + dx, y * 2 + dy);
			return;
		}
		const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
		out.push({ level, x, y, d: Math.hypot(cx - view.centre.x, cy - view.centre.y) });
	};
	const topInfo = levelInfo(top);
	if (!topInfo) return [];
	for (let x = topInfo.x0; x < topInfo.x0 + topInfo.w; x++) {
		for (let y = topInfo.y0; y < topInfo.y0 + topInfo.h; y++) walk(top, x, y);
	}
	out.sort((a, b) => a.d - b.d);
	return out;
}

export function drawTerrain(view, size) {
	if (!state.on || !state.gl) return;
	pendingDraw = { view, size };
	const gl = state.gl;
	const canvas = state.canvas;

	// The Map screen rebuilds its own HTML on plenty of occasions -- a
	// tab, a layer switched, a route replotted -- and the box the canvas
	// was put in goes with it. The canvas itself is fine, and so is its
	// context and every buffer on it; it just has to be put back, or the
	// view draws faithfully into a node nobody can see.
	if (!canvas.isConnected) {
		const host = document.querySelector('[data-map]');
		if (!host) return;
		host.insertBefore(canvas, host.querySelector('[data-map-layer]'));
		host.classList.add('map-has-3d', 'three-d');
		state.host = host;
	}

	const dpr = state.dpr = Math.min(window.devicePixelRatio || 1, 2);
	const w = Math.max(1, Math.round(size.w * dpr)), h = Math.max(1, Math.round(size.h * dpr));
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w; canvas.height = h;
		canvas.style.width = `${size.w}px`;
		canvas.style.height = `${size.h}px`;
	}
	gl.viewport(0, 0, w, h);

	const cam = state.cam = camera(view, size);
	// Whatever was queued for the view as it was is no longer the
	// question; what is in front of the camera now is. The floor asks
	// again first: it is what stands in for everything else, so it is
	// worth having before any of the detail.
	state.queue.length = 0;
	for (const [l, x, y] of state.floorList) want(l, x, y);
	const tiles = visibleTiles(view, size);
	if (state.style === 'real') ensureSkin(gl, view, size);
	const neon = state.style === 'neon' ? 1 : 0;
	const sky = neon ? [0.023, 0.026, 0.045] : [0.055, 0.098, 0.13];
	gl.clearColor(sky[0], sky[1], sky[2], 1);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	const fogFar = cam.fogFar;

	// The sea first, so terrain draws over it and the depth buffer keeps
	// an island's far shore from showing through the water in front.
	const s = state.sea;
	gl.useProgram(s.p);
	gl.bindBuffer(gl.ARRAY_BUFFER, state.seaBuf);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
	gl.uniformMatrix4fv(s.u.uMVP, false, cam.mvp);
	gl.uniform1f(s.u.uScale, cam.s);
	gl.uniform1f(s.u.uExag, EXAG);
	gl.uniform1f(s.u.uSea, SEA);
	gl.uniform1f(s.u.uSpan, cam.far * 1.2);
	gl.uniform1f(s.u.uTime, state.clock);
	gl.uniform1f(s.u.uNeon, neon);
	gl.uniform1f(s.u.uFogFar, fogFar);
	gl.uniform3fv(s.u.uFog, sky);
	gl.uniform2f(s.u.uCentre, view.centre.x, view.centre.y);
	const skinBox = state.skinBox;
	const wearing = neon ? 0 : (state.skinTex && skinBox ? 1 : 0);
	gl.uniform1f(s.u.uSkinOn, wearing);
	gl.uniform3f(s.u.uSkinBox, skinBox ? skinBox.x0 : 0, skinBox ? skinBox.y0 : 0, skinBox ? skinBox.span : 1);
	if (state.skinTex) {
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, state.skinTex);
		gl.uniform1i(s.u.uSkinTex, 0);
	}
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

	const t = state.prog;
	gl.useProgram(t.p);
	gl.uniformMatrix4fv(t.u.uMVP, false, cam.mvp);
	gl.uniform1f(t.u.uScale, cam.s);
	gl.uniform1f(t.u.uExag, EXAG);
	gl.uniform1f(t.u.uSea, SEA);
	gl.uniform1f(t.u.uNeon, neon);
	// Contours are only contours while you can see between them. The
	// interval doubles with the scale so the lines stay about ten pixels
	// apart -- 25 chart units (625 of the game's) at the deepest zoom,
	// and wider as the chart steps back, the way a paper chart does it.
	const per = Math.pow(2, MAX_ZOOM - view.zoom);
	gl.uniform1f(t.u.uStep, 25 * Math.pow(2, Math.max(-3, Math.min(4, Math.round(Math.log2(per / 8))))));
	gl.uniform1f(t.u.uFogFar, fogFar);
	gl.uniform3fv(t.u.uFog, sky);
	gl.uniform3fv(t.u.uSun, new Float32Array(norm([-0.45, 0.78, -0.44])));
	gl.uniform2f(t.u.uCentre, view.centre.x, view.centre.y);
	gl.uniform1f(t.u.uSkinOn, wearing);
	gl.uniform3f(t.u.uSkinBox, skinBox ? skinBox.x0 : 0, skinBox ? skinBox.y0 : 0, skinBox ? skinBox.span : 1);
	if (state.skinTex) {
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, state.skinTex);
		gl.uniform1i(t.u.uSkinTex, 0);
	}

	const now = performance.now();
	const one = tile => {
		tile.used = now;
		gl.uniform2f(t.u.uOrigin, tile.box.x0 - view.centre.x, tile.box.y0 - view.centre.y);
		gl.bindBuffer(gl.ARRAY_BUFFER, tile.pos);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, tile.col);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.UNSIGNED_BYTE, false, 0, 0);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, tile.idx);
		gl.drawElements(gl.TRIANGLES, tile.count, gl.UNSIGNED_SHORT, 0);
	};

	// What is not here yet is asked for, and the coarser tile covering
	// the same ground stands in meanwhile -- the same bargain the flat
	// chart strikes when a zoom outruns its squares. Without it a zoom
	// opens a hole in the world and fills it a second later, which reads
	// as breakage rather than as loading.
	const held = new Map();
	let drawn = 0, waiting = 0;
	const ready = [];
	for (const w of tiles) {
		const tile = state.tiles.get(`${w.level}_${w.x}_${w.y}`);
		if (tile) { ready.push(tile); continue; }
		if (tile === undefined) {
			want(w.level, w.x, w.y);
			waiting++;
			// Up the chain for the first one that is in hand. Anything
			// missing on the way is asked for too: the nearer the level,
			// the sooner the stand-in gets better.
			for (let up = w.level + 1, x = w.x, y = w.y; up <= 8; up++) {
				x = Math.floor(x / 2); y = Math.floor(y / 2);
				const key = `${up}_${x}_${y}`;
				const coarse = state.tiles.get(key);
				if (coarse) { held.set(key, coarse); break; }
				if (coarse === undefined) want(up, x, y);
			}
		}
	}
	// The stand-ins first and pushed a little further away, so the real
	// tile wins every pixel they share the moment it lands.
	if (held.size) {
		gl.enable(gl.POLYGON_OFFSET_FILL);
		gl.polygonOffset(2, 2);
		for (const tile of held.values()) { one(tile); drawn++; }
		gl.disable(gl.POLYGON_OFFSET_FILL);
	}
	for (const tile of ready) { one(tile); drawn++; }
	const byLevel = {};
	let exists = 0;
	for (const w of tiles) {
		byLevel[w.level] = (byLevel[w.level] || 0) + 1;
		if (tileExists(levelInfo(w.level), w.x, w.y)) exists++;
	}
	state.levelsDrawn = byLevel;
	state.exists = exists;
	state.drawn = drawn;
	state.waiting = waiting + state.pending.size;
	loadingLight(state.waiting > 0);
	// Everything this frame wants is in the queue now; order it and let
	// the next few go.
	sortQueue();
	pump();
	evict();

	// The swell only animates while something is moving anyway; a still
	// chart is a still chart, and a phone's battery is not free.
	state.clock = now / 1000;
	// A rough cost for the frame, smoothed: what the governor reads.
	const spent = performance.now() - now;
	state.frameMs = state.frameMs ? state.frameMs * 0.8 + spent * 0.2 : spent;
}

/**
 * The terrain files an area needs, for the offline cache to keep.
 *
 * The level the view draws and the one above it, so a step back still
 * has ground under it -- the same bargain the flat chart's pinning
 * strikes with its own levels.
 */
export function pinList(view, size) {
	if (!state.on || !state.index) return [];
	const out = [];
	const seen = new Set();
	for (const t of visibleTiles(view, size)) {
		// The tile the view would draw, and the one above it, so a step
		// back still has ground under it.
		for (const level of [t.level, t.level + 1]) {
			const info = levelInfo(level);
			const x = level === t.level ? t.x : Math.floor(t.x / 2);
			const y = level === t.level ? t.y : Math.floor(t.y / 2);
			if (!tileExists(info, x, y)) continue;
			const src = `map3d/${level}/${x}_${y}.ter?v=${state.index.stamp}`;
			if (seen.has(src)) continue;
			seen.add(src);
			out.push({ src });
		}
	}
	return out;
}

/** Ask for the tiles a view will need before it needs them -- the same
 *  courtesy the flat chart pays a flight. */
export function prefetch(view, size) {
	if (!state.on || !state.index) return;
	for (const t of visibleTiles(view, size).slice(0, 40)) want(t.level, t.x, t.y);
}
