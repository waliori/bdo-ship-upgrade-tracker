// Read the per-level rolls of every sailor type off the community sheet
// and write js/sailor_rolls.js.
//
// The game grows a sailor by a hidden roll at every level-up, and the
// only record of what each level can add is the community "BDO Sailors"
// sheet (by Sheen, raw data NekoNeko) -- one tab per type, with the
// least and the most a level-up has been seen to add to each stat. The
// level-10 bands in js/sailors.js were read off its summary tab; the
// per-level rows are what let a level-5 sailor be judged against the
// range level 5 can actually hold, and every possible level-10 outcome
// be counted. Run with `node tools/fetch-sailor-rolls.mjs`.
//
// Values are written in tenths of a percent, as integers, so the sums
// the app does over them stay exact.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = '1CFJOgyhnw2_Rq4UM2zs2uK6J15nipv1LiwrDQUWxU0o';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// The sheet's names for what js/sailors.js calls the same type.
const TYPE_NAMES = { 'Born on the Sea': 'Born-in-the-Sea' };
// Named sailors the sheet also charts; the app has no such types.
const SKIP = new Set(['Hetario', 'Pacuna', 'Arkahn']);
const KEYS = { Endurance: 'speed', Wits: 'accel', Awareness: 'turn', Strength: 'brake', Force: 'force', Focus: 'focus', Vision: 'vision' };

async function text(url) {
	const res = await fetch(url, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return res.text();
}

/** A CSV as rows of cells; the sheet quotes only its first cell. */
function rows(csv) {
	return csv.split(/\r?\n/).map(line => {
		const out = [];
		let cell = '', quoted = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (quoted) {
				if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
			} else if (c === '"') quoted = true;
			else if (c === ',') { out.push(cell); cell = ''; } else cell += c;
		}
		out.push(cell);
		return out;
	});
}

const tenths = v => Math.round(Number(v) * 10);

/** One type's tab: four blocks of eight stat rows under a "Level 1 …
 *  Level 10" header -- least growth, most growth, least total, most
 *  total, in that order whatever the block is titled. */
function parseTab(csv) {
	const r = rows(csv);
	const type = (r[0] && r[0][0] || '').trim();
	const blocks = [];
	for (let i = 0; i < r.length; i++) {
		if (r[i][3] !== 'Level 1' || r[i][12] !== 'Level 10') continue;
		const block = {};
		for (let j = i + 1; j < r.length && r[j][2]; j++) {
			const key = KEYS[(r[j][2].split(' ')[0] || '').trim()];
			if (!key) continue;
			const vals = r[j].slice(3, 13).map(tenths);
			if (vals.some(v => !Number.isFinite(v))) continue;
			block[key] = vals;
		}
		blocks.push(block);
	}
	return { type, blocks };
}

const gids = [...new Set([...(await text(`https://docs.google.com/spreadsheets/d/${SHEET}/htmlview`)).matchAll(/gid=(\d+)/g)].map(m => m[1]))];
const out = {};
const notes = [];
for (const gid of gids) {
	const csv = await text(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`);
	const { type, blocks } = parseTab(csv);
	if (!type || /^New \d/.test(type) || SKIP.has(type) || blocks.length < 4) continue;
	const name = TYPE_NAMES[type] || type;
	const [minG, maxG, minT, maxT] = blocks;
	const stats = {};
	for (const key of Object.keys(minG)) {
		const min = minG[key], max = maxG[key] || min;
		if (!min.some(Boolean) && !max.some(Boolean)) continue;
		// The totals the sheet prints are the running sums of its
		// growths; a tab whose sums disagree was edited by hand and is
		// worth a look before it is trusted.
		const sum = a => a.reduce((acc, v, i) => (acc.push((acc[i - 1] || 0) + v), acc), []);
		if (minT[key] && sum(min).join() !== minT[key].join()) notes.push(`${name} ${key}: least growth does not sum to the least total`);
		if (maxT[key] && sum(max).join() !== maxT[key].join()) notes.push(`${name} ${key}: most growth does not sum to the most total`);
		if (min.some((v, i) => v > max[i])) notes.push(`${name} ${key}: a least growth above the most`);
		stats[key] = { min, max };
	}
	out[name] = stats;
}

const names = Object.keys(out).sort();
const lines = names.map(n => `\t${JSON.stringify(n)}: {\n${Object.entries(out[n]).map(([k, v]) => `\t\t${k}: { min: [${v.min.join(', ')}], max: [${v.max.join(', ')}] }`).join(',\n')}\n\t}`);
const today = new Date().toISOString().slice(0, 10);
const file = `// What each level-up can add to a sailor, by type and stat.
//
// Read off the community "BDO Sailors" sheet (by Sheen, raw data
// NekoNeko) by tools/fetch-sailor-rolls.mjs on ${today}: for every
// type, the least and the most a level has been seen to add to each
// stat. Index 0 is the level-1 base; index n is what the step to level
// n + 1 adds. Everything is in tenths of a percent, as integers, so
// that the sums the app takes over them are exact and every possible
// outcome of a level can be counted. js/sailors.js reads these; a type
// missing here falls back to its level-10 band.

export const ROLLS_READ = '${today}';

export const sailorRolls = {
${lines.join(',\n')}
};
`;
fs.writeFileSync(path.join(root, 'js', 'sailor_rolls.js'), file);
console.log(`wrote js/sailor_rolls.js: ${names.length} types`);
for (const n of notes) console.log(`note: ${n}`);
