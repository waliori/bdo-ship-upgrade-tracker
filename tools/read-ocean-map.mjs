// Read gpw's Black Desert Ocean Map, and take the marks off it.
//
// The community's ocean map draws things the codex does not carry a
// position for -- Vell, and since 2026-09-13 the Hollow Maretta, whose
// dark rings the legend calls "Maretta". To use them the picture has to
// be laid on the chart, and the map says where it goes itself: it also
// draws the sea monsters' spawns, and those the codex does give us. So
// the crosses are found by their colour, matched against the points in
// js/sea_monsters.js, and the transform that carries one onto the other
// is solved for. It comes out an exact 20 world units to the pixel, and
// the marks then land within ten units -- half a pixel -- of the codex's
// own, which is as good as this data gets.
//
// With the map in place the rings are found by their shape: a navy
// annulus about twelve pixels across, light in the middle and clear
// outside, which is nothing else on the sheet.
//
//   node tools/read-ocean-map.mjs path/to/ocean-map-v1.6.png
//
// Chrome does the decoding, as it does for the sea mask: a PNG decoder
// is the one thing this repository does not already have, and the
// browser is here for the capture harness anyway.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { monsters } from '../js/sea_monsters.js';
import { openSea } from '../js/searoute.js';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const FILE = process.argv[2];
if (!FILE || !fs.existsSync(FILE)) {
	console.error('Usage: node tools/read-ocean-map.mjs <ocean map png>');
	process.exit(1);
}
const CHROME = [
	process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/chromium',
	'/usr/bin/google-chrome', `/etc/profiles/per-user/${process.env.USER || ''}/bin/google-chrome`,
	`/etc/profiles/per-user/${process.env.USER || ''}/bin/google-chrome-stable`
].find(p => p && fs.existsSync(p));
if (!CHROME) {
	console.error('No Chrome found. Set CHROME=/path/to/chrome.');
	process.exit(1);
}

// The species whose crosses the map and the codex both have, by the
// glow each is drawn with. The mark itself is near black; the colour is
// in the halo round it, which is what these test.
const SPECIES = [
	{ keys: ['hekaru', 'young-hekaru'], glow: (r, g, b) => r - g > 45 && b - g > 45 && Math.abs(r - b) < 35 && r > 130 },
	{ keys: ['nineshark', 'young-nineshark'], glow: (r, g, b) => g - r > 45 && g - b > 35 && g > 140 },
	{ keys: ['ocean-stalker', 'young-ocean-stalker'], glow: (r, g, b) => b - r > 60 && b > 195 && g > r && g < b - 25 },
	{ keys: ['black-rust', 'young-black-rust'], glow: (r, g, b) => b - r > 45 && r - g > 45 && b > 200 }
];

/** Run `fn` over the picture's pixels, inside the browser. */
async function withPixels(file, fn, arg) {
	const b64 = fs.readFileSync(file).toString('base64');
	const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
	try {
		const page = await browser.newPage();
		await page.setContent('<canvas id=c></canvas>');
		return await page.evaluate(async (b64, src, arg) => {
			const img = new Image();
			img.src = 'data:image/png;base64,' + b64;
			await img.decode();
			const c = document.getElementById('c');
			c.width = img.width; c.height = img.height;
			const ctx = c.getContext('2d', { willReadFrequently: true });
			ctx.drawImage(img, 0, 0);
			return (new Function('return ' + src)())(ctx.getImageData(0, 0, c.width, c.height), arg);
		}, b64, fn.toString(), arg);
	} finally { await browser.close(); }
}

const read = await withPixels(FILE, (d, tests) => {
	const W = d.width, H = d.height, px = d.data;

	/** Blobs of the pixels `ok` accepts, as centres. */
	const blobs = (ok) => {
		const m = new Uint8Array(W * H);
		for (let i = 0, p = 0; i < px.length; i += 4, p++) if (ok(px[i], px[i + 1], px[i + 2])) m[p] = 1;
		const seen = new Uint8Array(W * H), out = [], stack = new Int32Array(1 << 22);
		for (let p = 0; p < m.length; p++) {
			if (!m[p] || seen[p]) continue;
			let top = 0, n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
			stack[top++] = p; seen[p] = 1;
			while (top) {
				const q = stack[--top], qx = q % W, qy = (q / W) | 0;
				n++; sx += qx; sy += qy;
				if (qx < x0) x0 = qx; if (qx > x1) x1 = qx;
				if (qy < y0) y0 = qy; if (qy > y1) y1 = qy;
				for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
					const nx = qx + dx, ny = qy + dy;
					if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
					const np = ny * W + nx;
					if (m[np] && !seen[np]) { seen[np] = 1; stack[top++] = np; }
				}
			}
			if (n >= 20 && x1 - x0 < 40 && y1 - y0 < 40) out.push({ x: sx / n, y: sy / n, n });
		}
		return out;
	};

	// The rings: navy at radius six, nothing navy just inside or just
	// outside, and a light middle.
	const navy = new Uint8Array(W * H), sum = new Int32Array(W * H);
	for (let i = 0, p = 0; i < px.length; i += 4, p++) {
		const r = px[i], g = px[i + 1], b = px[i + 2];
		sum[p] = r + g + b;
		navy[p] = (sum[p] < 300 && b > r + 15) ? 1 : 0;
	}
	const N = 24, cos = [], sin = [];
	for (let k = 0; k < N; k++) { cos.push(Math.cos(k / N * 2 * Math.PI)); sin.push(Math.sin(k / N * 2 * Math.PI)); }
	const seen = [];
	for (let y = 12; y < H - 12; y++) for (let x = 12; x < W - 12; x++) {
		if (sum[y * W + x] < 420) continue;
		let on = 0, inside = 0, clear = 0;
		for (let k = 0; k < N; k++) {
			if (navy[Math.round(y + 6 * sin[k]) * W + Math.round(x + 6 * cos[k])]) on++;
			if (!navy[Math.round(y + 3.5 * sin[k]) * W + Math.round(x + 3.5 * cos[k])]) inside++;
			if (!navy[Math.round(y + 10 * sin[k]) * W + Math.round(x + 10 * cos[k])]) clear++;
		}
		if (on < 20 || inside < 23 || clear < 22) continue;
		const near = seen.find(o => Math.abs(o.sx / o.n - x) < 14 && Math.abs(o.sy / o.n - y) < 14);
		if (near) { near.n++; near.sx += x; near.sy += y; }
		else seen.push({ sx: x, sy: y, n: 1 });
	}
	return {
		w: W, h: H,
		marks: tests.map(src => blobs(new Function('r', 'g', 'b', 'return ' + src))),
		rings: seen.map(o => ({ x: Math.round(o.sx / o.n), y: Math.round(o.sy / o.n) }))
	};
}, SPECIES.map(s => s.glow.toString().replace(/^.*?=>\s*/, '')));

console.log(`${path.basename(FILE)}: ${read.w}x${read.h}`);

// Lay the picture on the chart: nearest-neighbour matching between the
// crosses found and the codex's points, then a least-squares fit of
// scale and offset, until it stops moving.
let f = { sx: 20, sy: 20, tx: 3450, ty: -930 };
let pairs = [];
for (let round = 0; round < 20; round++) {
	pairs = [];
	SPECIES.forEach((s, i) => {
		const found = read.marks[i];
		for (const key of s.keys) for (const [wx, wy] of monsters.find(m => m.key === key).points) {
			const px = (wx - f.tx) / f.sx, py = (wy - f.ty) / f.sy;
			let best = null, bd = 1e9;
			for (const b of found) { const d = Math.hypot(b.x - px, b.y - py); if (d < bd) { bd = d; best = b; } }
			if (best && bd < 10) pairs.push([best.x, best.y, wx, wy]);
		}
	});
	const solve = (i, j) => {
		const n = pairs.length;
		const sp = pairs.reduce((a, p) => a + p[i], 0), sw = pairs.reduce((a, p) => a + p[j], 0);
		const spp = pairs.reduce((a, p) => a + p[i] * p[i], 0), spw = pairs.reduce((a, p) => a + p[i] * p[j], 0);
		const s = (n * spw - sp * sw) / (n * spp - sp * sp);
		return [s, (sw - s * sp) / n];
	};
	const [sx, tx] = solve(0, 2), [sy, ty] = solve(1, 3);
	const moved = Math.abs(sx - f.sx) + Math.abs(sy - f.sy) + Math.abs(tx - f.tx) + Math.abs(ty - f.ty);
	f = { sx, tx, sy, ty };
	if (moved < 1e-6) break;
}
const res = pairs.map(p => Math.hypot(p[0] * f.sx + f.tx - p[2], p[1] * f.sy + f.ty - p[3])).sort((a, b) => a - b);
console.log(`fitted on ${pairs.length} spawn marks: x = ${f.sx.toFixed(4)} px ${f.tx > 0 ? '+' : '-'} ${Math.abs(f.tx).toFixed(1)}, `
	+ `y = ${f.sy.toFixed(4)} px ${f.ty > 0 ? '+' : '-'} ${Math.abs(f.ty).toFixed(1)}`);
console.log(`  error: median ${res[res.length >> 1].toFixed(1)}, nine in ten under ${res[Math.floor(res.length * 0.9)].toFixed(1)} units`);

// The legend draws a ring of its own; it is not in the sea.
const legend = read.rings.filter(r => r.x > read.w * 0.7 && r.y < read.h * 0.37);
const points = read.rings.filter(r => !legend.includes(r))
	.map(r => [Math.round(r.x * f.sx + f.tx), Math.round(r.y * f.sy + f.ty)])
	.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const dry = points.filter(([x, y]) => !openSea(x, y));
console.log(`${points.length} Maretta rings (${legend.length} in the legend), ${dry.length} of them on land`);
if (dry.length) console.log('  on land:', JSON.stringify(dry));
console.log(`\tpoints: [${points.map(p => `[${p[0]}, ${p[1]}]`).join(', ')}] },`);

const out = path.join(ROOT, 'tools', 'ocean-map-rings.json');
if (process.argv.includes('--write')) {
	fs.writeFileSync(out, JSON.stringify(points));
	console.log('wrote', path.relative(ROOT, out));
}
