// The game's own habitat markers, off the client's world map table.
//
// `worldmapmonster.dbss` is what the game draws on its world map: one
// icon per named ground, with the ground's name and its exact position.
// It is the thing `js/sea_monsters.js` used to guess at by averaging the
// codex's spawn clouds -- the guess was out by up to twenty kilometres,
// because a species with spawns from Velia to Nampo has a centre that is
// nowhere in particular.
//
// Reading it needs the table itself, which lives in the client's archive:
//
//   bdo-data-extractor extract --game <install> worldmapmonster <dir>
//   node tools/read-worldmap-monsters.mjs --src <dir>/gamecommondata/binary
//
// (iDevelopThings/bdo-data-extractor; flags go after the subcommand.)
// It prints the `zones` line for every species the client marks, and
// names the sea grounds it marks that this app does not model, so a
// patch that adds one does not pass unnoticed.
//
// The format, since nobody has published it. The offset file is
// `[u32 count][count x 10]`, each entry `[u16 key][u32 offset][u32 size]`,
// and the record starts at `offset - 2` in the data file. A record is
// `[u16 key][u16 key again]`, then wide strings -- `[u32 chars][u32 0]`
// followed by UTF-16LE -- for the recommended AP, the final AP and the
// ground's name, then `[f32 X][f32 Y][f32 Z]`, then the icon path as a
// narrow string in the same shape. The position is the game's own, so
// the chart transform applies: x = X/25 + 68600, y = 72200 - Z/25.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { monsters } from '../js/sea_monsters.js';
import { openSea } from '../js/searoute.js';

const ROOT = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const argAt = f => (process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : null);
const SRC = argAt('--src') || path.join(ROOT, 'tools', 'gamecommondata', 'binary');
for (const f of ['worldmapmonster.dbss', 'worldmapmonsteroffset.dbss']) {
	if (!fs.existsSync(path.join(SRC, f))) {
		console.error(`No ${f} under ${SRC}. Extract it from the client first:\n`
			+ '  bdo-data-extractor extract --game <install> worldmapmonster <dir>\n'
			+ '  node tools/read-worldmap-monsters.mjs --src <dir>/gamecommondata/binary');
		process.exit(1);
	}
}

/** Every row: its name, its position and the icon it draws. */
function readGrounds(dir) {
	const data = fs.readFileSync(path.join(dir, 'worldmapmonster.dbss'));
	const index = fs.readFileSync(path.join(dir, 'worldmapmonsteroffset.dbss'));
	const rows = index.readUInt32LE(0);
	const out = [];
	for (let i = 0; i < rows; i++) {
		const p = 4 + i * 10;
		const key = index.readUInt16LE(p), off = index.readUInt32LE(p + 2), size = index.readUInt32LE(p + 6);
		const start = off - 2;
		if (start < 0 || start + size > data.length) continue;
		const b = data.subarray(start, start + size);
		let q = 4;
		const wide = [];
		while (q + 8 <= b.length) {
			const len = b.readUInt32LE(q), pad = b.readUInt32LE(q + 4);
			if (pad !== 0 || len > 300 || q + 8 + len * 2 > b.length) break;
			wide.push(b.subarray(q + 8, q + 8 + len * 2).toString('utf16le'));
			q += 8 + len * 2;
		}
		if (q + 12 > b.length) continue;
		const pos = [b.readFloatLE(q), b.readFloatLE(q + 4), b.readFloatLE(q + 8)];
		let icon = '';
		const r = q + 12;
		if (r + 8 <= b.length) {
			const len = b.readUInt32LE(r), pad = b.readUInt32LE(r + 4);
			if (pad === 0 && len > 0 && len < 300 && r + 8 + len <= b.length) icon = b.subarray(r + 8, r + 8 + len).toString('latin1');
		}
		if (!icon || !Number.isFinite(pos[0]) || Math.abs(pos[0]) > 2e6 || Math.abs(pos[2]) > 2e6) continue;
		out.push({
			key, name: wide[wide.length - 1] || '', icon,
			x: Math.round(pos[0] / 25 + 68600), y: Math.round(72200 - pos[2] / 25)
		});
	}
	return out;
}

// The client writes its labels in Korean. These are the sea grounds this
// app knows; a ground on the water that is not here is reported, not
// dropped, because that is how a new one announces itself.
const SPECIES = {
	'헤카루': 'hekaru',
	'표류추적자': 'ocean-stalker',
	'칸디둠': 'candidum',
	'나인샤크': 'nineshark',
	'검은무쇠이빨': 'black-rust',
	'린바크': 'lyngbakr',
	'바다 악어': 'saltwater-crocodile',
	'레크라샨': 'lekrashan',
	'벨': 'vell',
	'골드몬트 해적선': ['goldmont-small', 'goldmont-medium', 'goldmont-large'],
	'마고리아 유령 전투함': 'margoria-ghost-ship',
	'저주받은 해적선': 'cursed-pirate-ship'
};
// Named water that is not a monster's ground: harbours, ruins, and the
// barter wrecks, which the app already has from the codex.
const NOT_A_GROUND = ['용왕님의 궁전', '시크라이아 해저 유적', '오킬루아의 눈', '해적 섬', '얼렁뚱땅 해적단'];

const grounds = readGrounds(SRC);
console.log(`${grounds.length} habitat markers on the client's world map`);
const wet = grounds.filter(g => openSea(g.x, g.y));
console.log(`${wet.length} of them on open water\n`);

const zones = new Map();
const unknown = [];
for (const g of wet) {
	// "Hekaru and Ocean Stalker", "Nineshark, Candidum, Black Rust": one
	// icon can name several species, and each of them is marked there.
	const parts = g.name.split(/,\s*|와\s+|과\s+/).map(s => s.trim()).filter(Boolean);
	const keys = parts.flatMap(p => [SPECIES[p] || []].flat());
	if (!keys.length) {
		if (!NOT_A_GROUND.includes(g.name) && !g.icon.includes('Ocean_Change')) unknown.push(g);
		continue;
	}
	for (const k of keys) {
		if (!zones.has(k)) zones.set(k, []);
		zones.get(k).push([g.x, g.y]);
	}
}

for (const [key, spots] of [...zones].sort()) {
	const m = monsters.find(m => m.key === key);
	spots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const line = `zones: [${spots.map(s => `[${s[0]}, ${s[1]}]`).join(', ')}]`;
	const was = m && m.zones ? ` (had ${m.zones.map(z => z.join(',')).join(' ')})` : m ? '' : ' — NOT MODELLED';
	console.log(`${key}${was}\n\t${line},`);
}
if (unknown.length) {
	console.log('\nGrounds on the water this app does not model:');
	for (const g of unknown) console.log(`  ${String(g.x).padStart(6)},${String(g.y).padEnd(6)} ${g.name}  [${g.icon.split('/').pop()}]`);
}
