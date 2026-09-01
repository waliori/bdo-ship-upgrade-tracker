// The codex draws a species' spawns as a grid over a region, and a
// region's grid does not stop at the shore -- the Goldmont Large
// Battleship "spawned" across the middle of Donghae. This keeps only
// the points that are open water on the chart's own sea mask, and
// rewrites js/sea_monsters.js in place. Rerun after refreshing the
// spawn points from the codex.

import fs from 'node:fs';
import { openSea } from '../js/searoute.js';

const file = new URL('../js/sea_monsters.js', import.meta.url);
let src = fs.readFileSync(file, 'utf8');
let dropped = 0, kept = 0;
src = src.replace(/(\{ key: '([^']+)'[\s\S]*?points: )(\[\[[^\]]*\](?:, \[[^\]]*\])*\]|\[\])/g, (all, head, key, list) => {
	const pts = JSON.parse(list);
	const water = pts.filter(([x, y]) => openSea(x, y));
	dropped += pts.length - water.length; kept += water.length;
	if (pts.length !== water.length) console.log(`${key}: ${pts.length - water.length} of ${pts.length} on land, dropped`);
	return head + '[' + water.map(([x, y]) => `[${x}, ${y}]`).join(', ') + ']';
});
fs.writeFileSync(file, src);
console.log(`kept ${kept}, dropped ${dropped}`);
