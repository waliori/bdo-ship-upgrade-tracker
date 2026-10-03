// How far apart the chart's fixed points are, by water.
//
// A run is planned on distances, and a straight line between two
// islands is the wrong distance the moment a headland stands between
// them: the nearest island as the crow flies is not the nearest as the
// ship sails, and a route laid on straight lines sails round the land
// it never counted. The router in js/searoute.js bends a leg round the
// land exactly, but it takes tens of milliseconds a leg cold, and a
// run search lays hundreds of routes -- too slow to ask at every step.
//
// The points a run is laid between never move: the barter islands, the
// harbours a run sails from and the wharves it calls at. So every leg
// between two of them is bent once here and its length written down,
// in metres, into js/sea_dist.js: a table the planners read at no
// cost. A leg the router gives up on -- through the land, as between
// two river wharves -- is written at its straight length, which is the
// line the chart draws for it.
//
// Rerun this when the sea mask, the islands or the wharves change:
//
//   node tools/build-sea-dist.mjs [--out js/sea_dist.js]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { seaLeg } from '../js/searoute.js';
import { pathLength } from '../js/sailing.js';
import { ports, npcs } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'js/sea_dist.js';

// One entry a place: two wharves on one pier are one point.
const points = [];
const seen = new Set();
for (const p of [...ports, ...npcs, ...wharves]) {
	const k = `${p.x},${p.y}`;
	if (seen.has(k)) continue;
	seen.add(k);
	points.push({ x: p.x, y: p.y });
}
const n = points.length;
const pairs = n * (n - 1) / 2;
const metres = new Uint16Array(pairs);
const t0 = Date.now();
let k = 0;
for (let i = 0; i < n; i++) {
	for (let j = i + 1; j < n; j++) {
		const m = pathLength(seaLeg(points[i], points[j]));
		metres[k++] = Math.min(65535, Math.round(m));
	}
	if (i % 10 === 0) console.error(`${k} of ${pairs} legs, ${Math.round((Date.now() - t0) / 1000)} s`);
}
const bytes = new Uint8Array(metres.length * 2);
for (let i = 0; i < metres.length; i++) { bytes[2 * i] = metres[i] & 255; bytes[2 * i + 1] = metres[i] >> 8; }
const b64 = Buffer.from(bytes).toString('base64');

const src = `// How far apart the chart's fixed points are, by water: the barter
// islands, the harbours and the wharves, every pair of them, in
// metres along the leg js/searoute.js bends round the land -- or the
// straight line, where the router finds no water between them. Built
// by tools/build-sea-dist.mjs; rerun it when the sea mask, the
// islands or the wharves change. ${n} points, ${pairs} legs.
//
// SEA_DIST_POINTS lists the points as [x, y] in chart pixels;
// SEA_DIST is the legs as little-endian 16-bit metres, one for each
// pair (i, j) with i < j, row by row. js/barter-route.js reads it.

export const SEA_DIST_POINTS = ${JSON.stringify(points.map(p => [p.x, p.y]))};

export const SEA_DIST = '${b64}';
`;
fs.writeFileSync(path.join(ROOT, OUT), src);
console.error(`wrote ${OUT}: ${n} points, ${pairs} legs, ${Math.round(src.length / 1024)} KB, ${Math.round((Date.now() - t0) / 1000)} s`);
