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
// BDOCodex fronts itself with a small JavaScript cookie challenge: the
// first response is a page that computes a hash from a cookie it set
// and reloads with the answer. The arithmetic is short enough to do
// here, once, before the tiles are asked for.

import { access, mkdir, writeFile } from 'node:fs/promises';
import { TILES } from '../js/barter_npcs.js';

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

const headers = {
	'User-Agent': UA,
	Cookie: await cookie(),
	Referer: `${HOST}/us/map/`
};

await mkdir(new URL('map/', ROOT), { recursive: true });
let fetched = 0, kept = 0;
const failed = [];
for (const [z, b] of Object.entries(TILES)) {
	for (let x = b.x0; x <= b.x1; x++) {
		for (let y = b.y0; y <= b.y1; y++) {
			const out = new URL(`map/${z}_${x}_${y}.webp`, ROOT);
			if (await exists(out)) { kept++; continue; }
			const r = await fetch(`${HOST}/zonemap/main/${z}/${x}/${y}.webp`, { headers });
			const type = r.headers.get('content-type') || '';
			if (!r.ok || !type.startsWith('image/')) {
				failed.push(`${z}/${x}/${y} (${r.status} ${type})`);
				continue;
			}
			await writeFile(out, Buffer.from(await r.arrayBuffer()));
			fetched++;
		}
	}
}

console.log(`${kept} tiles already on disk, ${fetched} fetched`);
if (failed.length) {
	console.log(`${failed.length} not served -- narrow TILES back or the map will 404 on them:`);
	for (const f of failed) console.log(`  ${f}`);
	process.exitCode = 1;
}
