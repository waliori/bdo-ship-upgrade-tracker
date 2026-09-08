// Where the sea is.
//
// A route drawn straight from island to island crosses whatever lies
// between, and what usually lies between is land. To bend a leg round a
// headland the app has to know which parts of the chart are water, and
// the only thing that knows is the chart itself: the tiles under map/
// paint the sea one flat colour and everything else in greens, greys and
// sand.
//
// So this reads the zoom-5 tiles -- the whole world at 8192x8192, fine
// enough for the Valencia river to read as water -- and writes a
// bitmask, one bit per 8x8 pixel cell, into js/seamask.js.
// Chrome does the decoding, since a webp decoder is the one thing this
// repository does not already have and the browser is already here for
// the capture harness.
//
//   node tools/build-seamask.mjs [--zoom 5] [--out js/seamask.js]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import http from 'node:http';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const ZOOM = process.argv.includes('--zoom') ? Number(process.argv[process.argv.indexOf('--zoom') + 1]) : 5;
const TILES = 2 ** ZOOM;     // tiles a side: the whole world
const CELL = 8;              // pixels a cell covers
const WET = process.argv.includes('--wet') ? Number(process.argv[process.argv.indexOf('--wet') + 1]) : 0.85;
const SIDE = TILES * 256 / CELL;

const CHROME = [
	process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/chromium',
	'/usr/bin/google-chrome', `/etc/profiles/per-user/${process.env.USER || ''}/bin/google-chrome`
].find(p => p && fs.existsSync(p));
if (!CHROME) {
	console.error('No Chrome found. Set CHROME=/path/to/chrome.');
	process.exit(1);
}

// The tiles are served rather than read from disk: a canvas will not
// give up its pixels for a file:// image.
const server = http.createServer((req, res) => {
	const url = decodeURIComponent(req.url.split('?')[0]);
	// The page itself, so the canvas and the tiles share an origin and
	// the pixels can actually be read back.
	if (url === '/') {
		return res.writeHead(200, { 'Content-Type': 'text/html' })
			.end('<!doctype html><canvas id=c width=256 height=256></canvas>');
	}
	const file = path.join(ROOT, url);
	if (!file.startsWith(path.join(ROOT, 'map'))) return res.writeHead(403).end();
	fs.readFile(file, (err, body) => err
		? res.writeHead(404).end()
		: res.writeHead(200, { 'Content-Type': 'image/webp' }).end(body));
}).listen(0);
const port = server.address().port;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

const grid = new Uint8Array(SIDE * SIDE);   // 1 = water
let missing = 0;
for (let tx = 0; tx < TILES; tx++) {
	for (let ty = 0; ty < TILES; ty++) {
		const cells = await page.evaluate(async (url, CELL, WET) => {
			const img = new Image();
			img.src = url;
			try {
				await new Promise((ok, no) => { img.onload = ok; img.onerror = no; });
			} catch {
				return null;
			}
			const c = document.getElementById('c');
			const g = c.getContext('2d', { willReadFrequently: true });
			g.clearRect(0, 0, 256, 256);
			g.drawImage(img, 0, 0);
			const d = g.getImageData(0, 0, 256, 256).data;
			const per = 256 / CELL;
			const out = new Array(per * per).fill(0);
			for (let cy = 0; cy < per; cy++) {
				for (let cx = 0; cx < per; cx++) {
					let wet = 0;
					for (let y = 0; y < CELL; y++) {
						for (let x = 0; x < CELL; x++) {
							const i = ((cy * CELL + y) * 256 + (cx * CELL + x)) * 4;
							// The sea is the one colour with no red in it.
							if (d[i] < 48 && d[i + 1] >= 40 && d[i + 2] >= 40) wet++;
						}
					}
					// A cell is water only if it is nearly all water, so a
					// shoreline counts as land and a route keeps its distance.
					out[cy * per + cx] = wet >= CELL * CELL * WET ? 1 : 0;
				}
			}
			return out;
		}, `http://localhost:${port}/map/${ZOOM}_${tx}_${ty}.webp`, CELL, WET);
		if (!cells) { missing++; continue; }
		const per = 256 / CELL;
		for (let cy = 0; cy < per; cy++) {
			for (let cx = 0; cx < per; cx++) {
				grid[(ty * per + cy) * SIDE + (tx * per + cx)] = cells[cy * per + cx];
			}
		}
	}
}
await browser.close();
server.close();

const bytes = new Uint8Array(Math.ceil(grid.length / 8));
for (let i = 0; i < grid.length; i++) if (grid[i]) bytes[i >> 3] |= 1 << (i & 7);
const water = grid.reduce((a, b) => a + b, 0);

const out = process.argv.includes('--out')
	? process.argv[process.argv.indexOf('--out') + 1]
	: path.join(ROOT, 'js', 'seamask.js');
fs.writeFileSync(out, `// Where the sea is: one bit per ${CELL}x${CELL} pixel cell of the zoom-${ZOOM}
// chart, 1 for water. Built by tools/build-seamask.mjs from the tiles
// under map/ -- rerun it when those change. ${water} of ${grid.length} cells
// are water, which is the ocean this app is about.
//
// A cell is ${CELL * Math.pow(2, 9 - ZOOM)} world units across; chart position
// divided by that is the cell it falls in.

export const SEA_ZOOM = ${ZOOM};
export const SEA_CELL = ${CELL * Math.pow(2, 9 - ZOOM)};
export const SEA_SIDE = ${SIDE};
export const SEA_BITS = '${Buffer.from(bytes).toString('base64')}';
`);
console.log(`${water}/${grid.length} cells water (${(100 * water / grid.length).toFixed(1)}%), ${missing} tiles missing`);
console.log(`wrote ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} kB)`);
