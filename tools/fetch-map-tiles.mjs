// Fetches the chart's tiles from where they come from.
//
// The tiles under map/ are BDOCodex's own -- /zonemap/main/{z}/{x}/{y}
// .webp, the layer its world map draws -- served as webp already, so
// they are saved byte for byte and nothing is re-encoded. This is how
// the 2026-08-28 refetch confirmed the shipped set: every tile came
// back identical.
//
//   node tools/fetch-map-tiles.mjs
//
// Reads TILES from js/barter_npcs.js and downloads whatever those
// ranges promise that map/ does not already hold. Widen a range there
// first, run this, and the every-tile-exists test is satisfied again.
// Nothing on disk is overwritten.
//
// The codex serves zooms 0 to 9 as webp and a 40px png placeholder
// past that; real ground stops at 7 (checked 2026-09-05 over Velia:
// the 8 and 9 tiles are the 7 tile upscaled and blurred). The whole
// world at zooms 1-7 is 21,844 tiles, so they are fetched a few at a
// time rather than one after another.
//
// Half of them are open sea, and the codex's open sea is one texture
// repeated: at zoom 7 one tile comes back 5,512 times. Those are kept
// once. After the fetch every tile is hashed, each group of identical
// files keeps its first by (zoom, x, y) and loses the rest, and
// js/tile_alias.js says which file stands in for each missing one --
// 54 MB of copies, in a folder that is synced and copied into an
// image, for a 90 KB table. A tile the table already covers counts as
// on disk, so a rerun fetches nothing it has.
//
// BDOCodex fronts itself with a small JavaScript cookie challenge: the
// first response is a page that computes a hash from a cookie it set
// and reloads with the answer. The arithmetic is short enough to do
// here, once, before the tiles are asked for -- and again if the
// answer stops being accepted partway through a long run.

import { access, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TILES } from '../js/barter_npcs.js';
import { ALIAS } from '../js/tile_alias.js';

const ROOT = new URL('../', import.meta.url);
const HOST = 'https://bdocodex.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0';

/** The challenge page's own function, transcribed: a fixed loop over
 *  the code the __js_p_ cookie carries. */
function jhash(b) {
	let x = 123456789, k = 0;
	for (let i = 0; i < 1677696; i++) {
		x = ((x + b) ^ (x + (x % 3) + (x % 17) + b) ^ i) % 16776960;
		if (x % 117 === 0) k = (k + 1) % 1111;
	}
	return k;
}

async function cookie() {
	const r = await fetch(`${HOST}/us/map/`, { headers: { 'User-Agent': UA } });
	const jar = { bddatabaselang: 'us' };
	for (const c of r.headers.getSetCookie()) {
		const [k, v] = c.split(';')[0].split('=');
		jar[k.trim()] = v;
	}
	const code = parseInt((jar.__js_p_ || '0').split(',')[0], 10);
	jar.__jhash_ = String(jhash(code));
	jar.__jua_ = encodeURIComponent(UA);
	return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

const exists = p => access(p).then(() => true, () => false);

let headers = null;
async function refresh() {
	headers = { 'User-Agent': UA, Cookie: await cookie(), Referer: `${HOST}/us/map/` };
}
await refresh();

await mkdir(new URL('map/', ROOT), { recursive: true });
const jobs = [];
for (const [z, b] of Object.entries(TILES)) {
	for (let x = b.x0; x <= b.x1; x++) {
		for (let y = b.y0; y <= b.y1; y++) jobs.push({ z, x, y });
	}
}

let fetched = 0, kept = 0, done = 0;
const failed = [];
const WORKERS = 6;

/** One tile: skip if on disk, else fetch; a non-image answer is tried
 *  once more after a fresh cookie before it counts as not served. */
async function one({ z, x, y }) {
	const key = `${z}_${x}_${y}`;
	const out = new URL(`map/${key}.webp`, ROOT);
	if (ALIAS[key] || await exists(out)) { kept++; return; }
	for (let attempt = 0; attempt < 2; attempt++) {
		const r = await fetch(`${HOST}/zonemap/main/${z}/${x}/${y}.webp`, { headers });
		const type = r.headers.get('content-type') || '';
		if (r.ok && type.startsWith('image/webp')) {
			await writeFile(out, Buffer.from(await r.arrayBuffer()));
			fetched++;
			return;
		}
		if (attempt === 0 && !type.startsWith('image/')) { await refresh(); continue; }
		failed.push(`${z}/${x}/${y} (${r.status} ${type})`);
		return;
	}
}

let next = 0;
const seen = {};
async function worker() {
	while (next < jobs.length) {
		const job = jobs[next++];
		await one(job);
		done++;
		if (fetched && fetched % 500 === 0 && !(fetched in seen)) { seen[fetched] = 1; process.stdout.write(`  ${done}/${jobs.length} (${fetched} fetched)\n`); }
	}
}
await Promise.all(Array.from({ length: WORKERS }, worker));

console.log(`${kept} tiles already on disk, ${fetched} fetched`);
await dedupe();
if (failed.length) {
	console.log(`${failed.length} not served -- narrow TILES back or the map will 404 on them:`);
	for (const f of failed) console.log(`  ${f}`);
	process.exitCode = 1;
}

/** Keep one file per distinct image and write the alias table. */
async function dedupe() {
	const dir = new URL('map/', ROOT);
	const names = (await readdir(dir)).filter(n => n.endsWith('.webp'))
		.map(n => n.slice(0, -5).split('_').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
	const canon = new Map();
	const alias = new Map(Object.entries(ALIAS));
	let dropped = 0;
	for (const [z, x, y] of names) {
		const key = `${z}_${x}_${y}`;
		const h = createHash('md5').update(await readFile(new URL(`${key}.webp`, dir))).digest('hex');
		const first = canon.get(h);
		if (!first) { canon.set(h, key); continue; }
		await unlink(new URL(`${key}.webp`, dir));
		alias.set(key, first);
		dropped++;
	}
	// A tile already aliased whose stand-in was itself dropped this run
	// cannot happen -- a stand-in is the first of its group by (z, x, y)
	// and a rerun sorts the same way -- but a table is cheap to check.
	for (const [k, v] of alias) if (alias.has(v)) alias.set(k, alias.get(v));
	const byCanon = new Map();
	for (const [k, v] of alias) byCanon.set(v, [...(byCanon.get(v) || []), k]);
	const lines = [...byCanon].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
		.map(([v, ks]) => `\t${JSON.stringify(v)}: ${JSON.stringify(ks.join(' '))}`);
	const out = `// Generated by tools/fetch-map-tiles.mjs -- do not edit.
//
// The tiles under map/ that are byte-identical to another are kept
// once: each key is the file that stands in for the tiles listed
// against it, as "z_x_y" names. The codex's open sea is one texture
// repeated, so most of zoom 7 is one file. js/map.js resolves a tile
// through this before asking for it.

const GROUPS = {
${lines.join(',\n')}
};

/** Tile name -> the name of the file that holds it. */
export const ALIAS = Object.freeze(Object.fromEntries(
	Object.entries(GROUPS).flatMap(([file, names]) => names.split(' ').map(n => [n, file]))
));
`;
	await writeFile(new URL('js/tile_alias.js', ROOT), out);
	console.log(`${dropped} duplicate tiles dropped this run; ${alias.size} stand in for another in js/tile_alias.js`);
}
