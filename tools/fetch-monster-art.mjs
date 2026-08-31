// Fetch each sea monster's artwork off its BDOCodex page, for the
// habitat markers on the chart. The young ones and the ghost ship have
// only a placeholder there (ic_00559), so a young species borrows its
// adult's picture and the placeholder is skipped. Writes icons/monster-
// <key>.webp and js/monster_art.js. `node tools/fetch-monster-art.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const NPC = {
	hekaru: 21414, 'ocean-stalker': 21416, candidum: 21417, nineshark: 21420, 'black-rust': 21419,
	'young-hekaru': 21425, 'young-ocean-stalker': 21426, 'young-candidum': 21422, 'young-nineshark': 21424, 'young-black-rust': 21423,
	'goldmont-small': 21427, 'goldmont-medium': 21428, 'goldmont-large': 21429,
	'saltwater-crocodile': 21447, lekrashan: 21477, khan: 59050, 'cox-pirates': 28834
};
const PLACEHOLDER = 'ic_00559';
const art = {};
for (const [key, id] of Object.entries(NPC)) {
	const html = await (await fetch(`https://bdocodex.com/us/npc/${id}/`, { headers: { 'User-Agent': UA } })).text();
	const m = /og:image" content="([^"]+)"/.exec(html);
	if (!m || m[1].includes(PLACEHOLDER)) { console.log(`${key}: no artwork of its own`); continue; }
	const file = `monster-${key}.webp`;
	const bytes = Buffer.from(await (await fetch(m[1], { headers: { 'User-Agent': UA } })).arrayBuffer());
	fs.writeFileSync(path.join(root, 'icons', file), bytes);
	art[key] = file;
	console.log(`${key}: ${file} (${bytes.length} bytes)`);
	await new Promise(r => setTimeout(r, 200));
}
// The young borrow the adult's picture.
for (const key of Object.keys(NPC)) {
	if (!art[key] && key.startsWith('young-') && art[key.slice(6)]) art[key] = art[key.slice(6)];
}
const body = Object.entries(art).map(([k, f]) => `\t'${k}': '${f}'`).join(',\n');
fs.writeFileSync(path.join(root, 'js', 'monster_art.js'), `// Each sea monster's artwork, from its BDOCodex page, for the habitat
// markers on the chart -- fetched by tools/fetch-monster-art.mjs on
// ${new Date().toISOString().slice(0, 10)}. A young species wears its adult's picture; a
// species with no picture of its own is not here and gets a glyph.

export const monsterArt = {
${body}
};
`);
console.log('wrote js/monster_art.js');
