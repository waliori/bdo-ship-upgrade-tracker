// The sea floor and everything above it: the game's own terrain, baked
// into tiles the chart can draw in three dimensions.
//
// Black Desert's 3D world map is not a picture. The client tessellates
// terrain on the GPU and composites a neon pass over it, so there is
// nothing to copy -- but the terrain it draws from is in the archive,
// one mesh per sector, and that decodes:
//
//   Paz/pad*.paz -> mapdata_real/sectormapinfo_combine/<x>_<y>_0_lod.mapdata
//
//     u32   magic 0x11001100
//     u32   unknown (always 5 in the sets seen)
//     u32   vertexCount
//     u32   indexCount
//     ---   vertexCount x 20 bytes ---------------------------------
//     f32   x, y, z      the game's own world position, absolute
//     u8[4] unknown      a packed normal, most likely
//     u8[4] r, g, b, a   the terrain's colour at that vertex
//     ---   indexCount x u16 ---------------------------------------
//     u16   triangle indices
//     ---   ~1 KB trailer, not identified --------------------------
//
// A sector is 12,800 game units square, which is the same grid the
// radar tiles under map/ are cut on -- so the flat chart and this one
// agree by construction, not by fitting.
//
// Getting the files out of the archive is a separate job and not ours:
// iDevelopThings/bdo-data-extractor reads the paz on Linux, and
//
//   bdo-data-extractor extract --game "<install>" _0_lod.mapdata <dir>
//
// leaves the whole world in <dir>. Point --src at it.
//
// What comes out here is a pyramid, cut the way map/ is cut: level 0 is
// one sector at the mesh's own detail, and each level above it covers
// twice as much ground at a fixed grid, so the far view draws a few
// hundred tiles instead of thirty thousand. The client picks a level
// from the zoom exactly as the flat chart picks one.

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import process from 'node:process';

/* ------------------------------------------------------------------ *
 * the two coordinate systems
 * ------------------------------------------------------------------ */

// js/worldmap.js owns these; they are repeated rather than imported so
// this tool stays runnable on its own, and a drift between the two
// would show up as terrain sliding off the flat tiles immediately.
const SCALE = 25;
const OFF_X = 68600;
const OFF_Y = 72200;

/** A sector is 12,800 game units, which is 512 chart units. */
const SECTOR = 12800 / SCALE;

/** Grid tiles above level 0 sample 33 x 33 nodes: 32 quads a side, so
 *  four tiles fold into one by dropping every other sample and their
 *  shared edges line up exactly. */
const GRID = 33;

/** The chart position of a sector's corner. The y axis runs the other
 *  way -- chart y = OFF_Y - Z/25 -- so the sector's low chart y comes
 *  from its *high* game Z, which is why sy + 1 appears here. */
function tileOrigin(sx, sy, span) {
	return {
		x: OFF_X + sx * span * SECTOR,
		y: OFF_Y - (sy + 1) * span * SECTOR
	};
}

/* ------------------------------------------------------------------ *
 * reading one mesh
 * ------------------------------------------------------------------ */

const MAGIC = 0x11001100;

/**
 * One sector's mesh, in chart space.
 *
 * Positions come back as chart x, chart y and height (all in chart
 * units, height being the game's Y on the same divisor). The winding
 * is reversed on the way: chart y runs opposite to game Z, which
 * mirrors every triangle, and a mirrored triangle faces away from the
 * camera.
 */
function readMesh(buf) {
	if (buf.length < 16 || buf.readUInt32LE(0) !== MAGIC) return null;
	const nv = buf.readUInt32LE(8);
	const ni = buf.readUInt32LE(12);
	const need = 16 + nv * 20 + ni * 2;
	if (nv === 0 || ni < 3 || buf.length < need) return null;

	const pos = new Float32Array(nv * 3);
	const col = new Uint8Array(nv * 3);
	for (let i = 0; i < nv; i++) {
		const o = 16 + i * 20;
		pos[i * 3] = buf.readFloatLE(o) / SCALE + OFF_X;
		pos[i * 3 + 1] = OFF_Y - buf.readFloatLE(o + 8) / SCALE;
		pos[i * 3 + 2] = buf.readFloatLE(o + 4) / SCALE;
		col[i * 3] = buf[o + 16];
		col[i * 3 + 1] = buf[o + 17];
		col[i * 3 + 2] = buf[o + 18];
	}
	const idx = new Uint16Array(ni - (ni % 3));
	for (let t = 0; t + 2 < ni; t += 3) {
		idx[t] = buf.readUInt16LE(16 + nv * 20 + t * 2);
		idx[t + 1] = buf.readUInt16LE(16 + nv * 20 + (t + 2) * 2);
		idx[t + 2] = buf.readUInt16LE(16 + nv * 20 + (t + 1) * 2);
	}
	// An index past the vertex array is a mesh we have misread; better
	// to drop the sector than to hand the GPU a bad draw call.
	for (let i = 0; i < idx.length; i++) if (idx[i] >= nv) return null;
	return { nv, pos, col, idx };
}

/* ------------------------------------------------------------------ *
 * the tile file
 * ------------------------------------------------------------------ */

// 'BDT1'. Little-endian throughout, which every target this runs on is.
const FILE_MAGIC = 0x31544442;

/**
 * One tile, packed.
 *
 *   u32  magic        'BDT1'
 *   u16  level
 *   i16  sx, sy       the tile's index at that level
 *   u16  vertexCount
 *   u16  gridN        0 for a native mesh, 33 for a sampled grid
 *   u32  triangleCount
 *   f32  baseH        the height the i16 heights are measured from
 *   f32  minH, maxH   the tile's height range, for culling
 *   u16  hScale       height steps per chart unit, x256
 *   ---  vertexCount x 3 x i16 ----------------------------------
 *        x, y         chart units from the tile's corner, x32
 *        h            chart units from baseH, x8
 *   ---  vertexCount x 3 x u8, padded to 4 -----------------------
 *        r, g, b
 *   ---  triangleCount x 3 x u16 ---------------------------------
 *
 * x32 on the horizontal keeps a thirty-second of a chart unit, which at
 * the deepest zoom is a thirty-second of a pixel, and leaves room for
 * the overlap skirt the meshes carry past their own cell. The height's
 * step is the tile's own, so a sector keeps a sixteenth of a unit and
 * a tile spanning half the world still fits its mountains.
 */
function packTile(level, sx, sy, span, mesh) {
	const org = tileOrigin(sx, sy, span);
	let minH = Infinity, maxH = -Infinity;
	for (let i = 0; i < mesh.nv; i++) {
		const h = mesh.pos[i * 3 + 2];
		if (h < minH) minH = h;
		if (h > maxH) maxH = h;
	}
	const baseH = Math.round((minH + maxH) / 2);
	// How many steps a chart unit of height is worth. A sector's relief
	// is small and gets the full sixteenth-of-a-unit; a tile covering
	// half the world has kilometres of it and takes what fits.
	const half = Math.max(1, maxH - baseH, baseH - minH);
	const hScale = Math.min(8, 32000 / half);
	const tris = mesh.idx.length / 3;

	const head = 32;
	const posBytes = mesh.nv * 6;
	const colBytes = Math.ceil(mesh.nv * 3 / 4) * 4;
	const out = Buffer.alloc(head + posBytes + colBytes + tris * 6);
	out.writeUInt32LE(FILE_MAGIC, 0);
	out.writeUInt16LE(level, 4);
	out.writeInt16LE(sx, 6);
	out.writeInt16LE(sy, 8);
	out.writeUInt16LE(mesh.nv, 10);
	out.writeUInt16LE(mesh.gridN || 0, 12);
	out.writeUInt32LE(tris, 14);
	out.writeFloatLE(baseH, 18);
	out.writeFloatLE(minH, 22);
	out.writeFloatLE(maxH, 26);
	out.writeUInt16LE(Math.max(1, Math.min(65535, Math.round(hScale * 256))), 30);

	const clamp = v => Math.max(-32768, Math.min(32767, Math.round(v)));
	for (let i = 0; i < mesh.nv; i++) {
		const o = head + i * 6;
		out.writeInt16LE(clamp((mesh.pos[i * 3] - org.x) * 32), o);
		out.writeInt16LE(clamp((mesh.pos[i * 3 + 1] - org.y) * 32), o + 2);
		out.writeInt16LE(clamp((mesh.pos[i * 3 + 2] - baseH) * hScale), o + 4);
	}
	mesh.col.copy ? mesh.col.copy(out, head + posBytes) : Buffer.from(mesh.col).copy(out, head + posBytes);
	const io = head + posBytes + colBytes;
	for (let i = 0; i < mesh.idx.length; i++) out.writeUInt16LE(mesh.idx[i], io + i * 2);
	return out;
}

/**
 * A sampled tile, packed.
 *
 * Same header, and then only what a regular grid cannot work out for
 * itself: a height and a colour per node, and one bit each saying
 * whether the node was covered at all. The x and y are the grid's, the
 * triangles are the grid's -- storing either would be storing the same
 * lattice thirty thousand times.
 *
 *   ---  GRID x GRID x i16 ---  height, from baseH, x hScale
 *   ---  GRID x GRID x u8[3] -- colour, padded to 4
 *   ---  ceil(GRID^2 / 8) -----  one bit per node, set when covered
 */
function packGrid(level, tx, ty, grid) {
	const n = GRID * GRID;
	let minH = Infinity, maxH = -Infinity, covered = 0;
	for (let i = 0; i < n; i++) {
		if (!grid.seen[i]) continue;
		covered++;
		if (grid.h[i] < minH) minH = grid.h[i];
		if (grid.h[i] > maxH) maxH = grid.h[i];
	}
	if (!covered) return null;
	const baseH = Math.round((minH + maxH) / 2);
	const half = Math.max(1, maxH - baseH, baseH - minH);
	const hScale = Math.min(8, 32000 / half);

	// Quads whose four corners were all covered -- what the tile will
	// actually draw, written into the header so the client can size its
	// index buffer before it reads the mask.
	let quads = 0;
	for (let gy = 0; gy < GRID - 1; gy++) {
		for (let gx = 0; gx < GRID - 1; gx++) {
			if (grid.seen[gy * GRID + gx] && grid.seen[gy * GRID + gx + 1]
				&& grid.seen[(gy + 1) * GRID + gx] && grid.seen[(gy + 1) * GRID + gx + 1]) quads++;
		}
	}
	if (!quads) return null;

	const head = 32;
	const hBytes = n * 2;
	const cBytes = Math.ceil(n * 3 / 4) * 4;
	const mBytes = Math.ceil(n / 8);
	const out = Buffer.alloc(head + hBytes + cBytes + mBytes);
	out.writeUInt32LE(FILE_MAGIC, 0);
	out.writeUInt16LE(level, 4);
	out.writeInt16LE(tx, 6);
	out.writeInt16LE(ty, 8);
	out.writeUInt16LE(n, 10);
	out.writeUInt16LE(GRID, 12);
	out.writeUInt32LE(quads * 2, 14);
	out.writeFloatLE(baseH, 18);
	out.writeFloatLE(minH, 22);
	out.writeFloatLE(maxH, 26);
	out.writeUInt16LE(Math.max(1, Math.min(65535, Math.round(hScale * 256))), 30);
	for (let i = 0; i < n; i++) {
		const v = grid.seen[i] ? Math.max(-32768, Math.min(32767, Math.round((grid.h[i] - baseH) * hScale))) : 0;
		out.writeInt16LE(v, head + i * 2);
		const c = head + hBytes + i * 3;
		out[c] = Math.max(0, Math.min(255, Math.round(grid.r[i])));
		out[c + 1] = Math.max(0, Math.min(255, Math.round(grid.g[i])));
		out[c + 2] = Math.max(0, Math.min(255, Math.round(grid.b[i])));
		if (grid.seen[i]) out[head + hBytes + cBytes + (i >> 3)] |= 1 << (i & 7);
	}
	return out;
}

/**
 * A tile on disk: the packed bytes, gzipped.
 *
 * Deliberately not `Content-Encoding: gzip` on a plain file. An encoded
 * body is decoded by whatever is in the way -- a proxy, a CDN, the
 * service worker's cache on replay -- and when two of them disagree
 * about whether it has been decoded already the tile arrives as
 * nonsense with no error anywhere. Opaque bytes that the reader
 * inflates itself cannot be got wrong by anything in between, and it
 * costs a fraction of a millisecond a tile.
 */
async function writeTile(file, packed) {
	const gz = gzipSync(packed, { level: 9 });
	await writeFile(file, gz);
	return gz.length;
}

/* ------------------------------------------------------------------ *
 * sampling a mesh onto a grid
 * ------------------------------------------------------------------ */

/**
 * Rasterize triangles into a height and colour grid.
 *
 * The grid is the tile's own cell, GRID nodes a side counting both
 * edges. Nodes no triangle covers stay empty and the triangles that
 * would have used them are dropped, so a coastline keeps its shape
 * instead of being dragged out to sea by an invented vertex.
 */
function sampleInto(grid, mesh, org, span) {
	const { h, r, g, b, seen } = grid;
	const step = (span * SECTOR) / (GRID - 1);
	const pos = mesh.pos, col = mesh.col, idx = mesh.idx;

	for (let t = 0; t < idx.length; t += 3) {
		const a = idx[t] * 3, c = idx[t + 1] * 3, d = idx[t + 2] * 3;
		const ax = (pos[a] - org.x) / step, ay = (pos[a + 1] - org.y) / step;
		const bx = (pos[c] - org.x) / step, by = (pos[c + 1] - org.y) / step;
		const cx = (pos[d] - org.x) / step, cy = (pos[d + 1] - org.y) / step;
		const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
		if (!den) continue;

		const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx)));
		const x1 = Math.min(GRID - 1, Math.floor(Math.max(ax, bx, cx)));
		const y0 = Math.max(0, Math.ceil(Math.min(ay, by, cy)));
		const y1 = Math.min(GRID - 1, Math.floor(Math.max(ay, by, cy)));
		if (x1 < x0 || y1 < y0) continue;

		for (let gy = y0; gy <= y1; gy++) {
			for (let gx = x0; gx <= x1; gx++) {
				const w0 = ((by - cy) * (gx - cx) + (cx - bx) * (gy - cy)) / den;
				const w1 = ((cy - ay) * (gx - cx) + (ax - cx) * (gy - cy)) / den;
				const w2 = 1 - w0 - w1;
				if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
				const height = w0 * pos[a + 2] + w1 * pos[c + 2] + w2 * pos[d + 2];
				const k = gy * GRID + gx;
				// Ridges win ties: a sampled grid that takes the lower
				// of two surfaces eats its own cliff edges.
				if (seen[k] && h[k] >= height) continue;
				seen[k] = 1;
				h[k] = height;
				r[k] = w0 * col[a] + w1 * col[c] + w2 * col[d];
				g[k] = w0 * col[a + 1] + w1 * col[c + 1] + w2 * col[d + 1];
				b[k] = w0 * col[a + 2] + w1 * col[c + 2] + w2 * col[d + 2];
			}
		}
	}
}

function emptyGrid() {
	const n = GRID * GRID;
	return {
		h: new Float32Array(n), r: new Float32Array(n),
		g: new Float32Array(n), b: new Float32Array(n),
		seen: new Uint8Array(n)
	};
}


/** Four grids into one, by dropping every other sample. The tiles share
 *  their edge nodes, so 2 x (33 - 1) + 1 is 33 again with no seam. */
function foldGrids(quads) {
	const out = emptyGrid();
	for (let q = 0; q < 4; q++) {
		const src = quads[q];
		if (!src) continue;
		const ox = (q & 1) ? (GRID - 1) / 2 : 0;
		// An odd tile index is the *lower* chart y -- the axis is
		// flipped against the game's Z -- so it folds into the bottom
		// half of its parent, not the top.
		const oy = (q & 2) ? 0 : (GRID - 1) / 2;
		for (let gy = 0; gy < GRID; gy += 2) {
			for (let gx = 0; gx < GRID; gx += 2) {
				const k = gy * GRID + gx;
				if (!src.seen[k]) continue;
				const t = (oy + gy / 2) * GRID + (ox + gx / 2);
				if (out.seen[t] && out.h[t] >= src.h[k]) continue;
				out.seen[t] = 1;
				out.h[t] = src.h[k];
				out.r[t] = src.r[k];
				out.g[t] = src.g[k];
				out.b[t] = src.b[k];
			}
		}
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * the index
 * ------------------------------------------------------------------ */

/** Which tiles exist at a level, as a bitmap over the level's own box.
 *  Thirty thousand names would be a third of a megabyte; the bitmap is
 *  six kilobytes and answers the only question the client asks. */
function bitmapFor(keys) {
	const xs = [...keys].map(k => Number(k.split('_')[0]));
	const ys = [...keys].map(k => Number(k.split('_')[1]));
	const x0 = Math.min(...xs), x1 = Math.max(...xs);
	const y0 = Math.min(...ys), y1 = Math.max(...ys);
	const w = x1 - x0 + 1, h = y1 - y0 + 1;
	const bits = Buffer.alloc(Math.ceil(w * h / 8));
	for (const k of keys) {
		const [x, y] = k.split('_').map(Number);
		const i = (y - y0) * w + (x - x0);
		bits[i >> 3] |= 1 << (i & 7);
	}
	return { x0, y0, w, h, bits: bits.toString('base64') };
}

/* ------------------------------------------------------------------ *
 * the run
 * ------------------------------------------------------------------ */

function arg(name, dflt = null) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}

async function main() {
	const src = arg('src');
	const out = arg('out', 'map3d');
	const maxLevel = Number(arg('levels', 8));
	const box = arg('bbox');
	// Level 0 is the mesh exactly as the game ships it, which is what
	// the two deepest zooms want; --flat leaves it out for a smaller
	// bake that stops short of rooftops.
	const native = !process.argv.includes('--flat');
	if (!src) {
		console.error('usage: node tools/build-terrain.mjs --src <dir of *_0_lod.mapdata> [--out map3d] [--levels 8] [--flat] [--bbox sx0,sy0,sx1,sy1]');
		process.exit(1);
	}
	const limit = box ? box.split(',').map(Number) : null;

	const files = (await readdir(src, { recursive: true, withFileTypes: true }))
		.filter(e => e.isFile() && e.name.endsWith('_0_lod.mapdata'))
		.map(e => path.join(e.parentPath || e.path, e.name))
		// Event dressing and instance dungeons live on the same naming
		// but not on the world's grid; only mapdata_real is the world.
		.filter(p => p.includes(`mapdata_real${path.sep}sectormapinfo_combine`));
	console.log(`${files.length} sector meshes`);

	await rm(out, { recursive: true, force: true });
	await mkdir(out, { recursive: true });
	if (native) await mkdir(path.join(out, '0'), { recursive: true });

	// Level 1 is sampled straight from the meshes; every level above it
	// folds the one below, which is why only this pass touches them.
	let grids = new Map();
	const levels = [];
	const startLevel = 1;
	let kept = 0, skipped = 0, bytes = 0;
	let seaMin = Infinity, seaMax = -Infinity;

	const level0 = new Set();
	for (const file of files) {
		const m = /(-?\d+)_(-?\d+)_0_lod\.mapdata$/.exec(file);
		if (!m) continue;
		const sx = Number(m[1]), sy = Number(m[2]);
		if (limit && (sx < limit[0] || sx > limit[2] || sy < limit[1] || sy > limit[3])) continue;

		// A sector with no terrain in it is a 23-byte file saying so --
		// open sea, of which this world has a great deal. Not a failure.
		const mesh = readMesh(await readFile(file));
		if (!mesh) { skipped++; continue; }
		kept++;

		if (native) {
			bytes += await writeTile(path.join(out, '0', `${sx}_${sy}.ter`), packTile(0, sx, sy, 1, mesh));
			level0.add(`${sx}_${sy}`);
		}

		for (let i = 0; i < mesh.nv; i++) {
			const h = mesh.pos[i * 3 + 2];
			if (h < seaMin) seaMin = h;
			if (h > seaMax) seaMax = h;
		}

		// Straight into level 1's grid while the mesh is in hand.
		const tx = Math.floor(sx / 2), ty = Math.floor(sy / 2);
		const key = `${tx}_${ty}`;
		let grid = grids.get(key);
		if (!grid) grids.set(key, grid = emptyGrid());
		sampleInto(grid, mesh, tileOrigin(tx, ty, 2), 2);

		if (kept % 4000 === 0) console.log(`  ${kept} sectors...`);
	}
	if (!kept) {
		console.error('no sector meshes read -- is --src the extractor\'s output directory?');
		process.exit(1);
	}
	if (native) {
		levels.push({ level: 0, span: 1, tiles: level0.size, ...bitmapFor(level0) });
		console.log(`level 0: ${level0.size} tiles, ${(bytes / 1e6).toFixed(1)} MB (the mesh as the game ships it)`);
	}
	console.log(`${kept} sectors with terrain${skipped ? `, ${skipped} empty (open sea)` : ''}`);

	for (let level = startLevel; level <= maxLevel; level++) {
		const span = 1 << level;
		await mkdir(path.join(out, String(level)), { recursive: true });
		const keys = new Set();
		let lvlBytes = 0;
		for (const [key, grid] of grids) {
			const [tx, ty] = key.split('_').map(Number);
			const packed = packGrid(level, tx, ty, grid);
			if (!packed) continue;
			lvlBytes += await writeTile(path.join(out, String(level), `${tx}_${ty}.ter`), packed);
			keys.add(key);
		}
		if (!keys.size) break;
		levels.push({ level, span, tiles: keys.size, ...bitmapFor(keys) });
		bytes += lvlBytes;
		console.log(`level ${level}: ${keys.size} tiles, ${(lvlBytes / 1e6).toFixed(1)} MB`);

		if (level === maxLevel) break;
		const next = new Map();
		for (const [key, grid] of grids) {
			const [tx, ty] = key.split('_').map(Number);
			const px = Math.floor(tx / 2), py = Math.floor(ty / 2);
			const pk = `${px}_${py}`;
			let quad = next.get(pk);
			if (!quad) next.set(pk, quad = [null, null, null, null]);
			quad[(tx & 1) | ((ty & 1) << 1)] = grid;
		}
		grids = new Map([...next].map(([k, quad]) => [k, foldGrids(quad)]));
	}

	const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
	await writeFile(path.join(out, 'index.json'), JSON.stringify({
		stamp, sector: SECTOR, grid: GRID, offX: OFF_X, offY: OFF_Y, scale: SCALE, gzip: true,
		height: { min: seaMin, max: seaMax },
		levels
	}));
	console.log(`\n${(bytes / 1e6).toFixed(1)} MB in ${out}/  stamp ${stamp}`);
	console.log(`height range ${seaMin.toFixed(0)} to ${seaMax.toFixed(0)} chart units`);
}

main().catch(e => { console.error(e); process.exit(1); });
