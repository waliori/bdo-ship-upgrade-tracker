// Read every sea crystal off BDOCodex and write js/sea_crystals.js.
//
// A ship has one crystal slot. Each codex id is one crystal with one
// effect at one value -- "Margoria Sea Crystal" is seventy items, not
// one -- so the app keeps them by id and shows the effect beside the
// name. The ranges: Eltro/Serni/Zulatia/Margoria 756501-756780 (four
// grades, seven stats, ten steps), Rusalka 756821-756827, Ebenruth's
// Nol 59321 and the Oceanteared Nols 59440-59446. `lt` is what the
// crystal itself weighs, which the hold pays for. Run with
// `node tools/fetch-sea-crystals.mjs`; it is polite to the codex (four
// at a time) and takes a couple of minutes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const ids = [];
for (let i = 756501; i <= 756780; i++) ids.push(i);
for (let i = 756821; i <= 756827; i++) ids.push(i);
ids.push(59321);
for (let i = 59440; i <= 59446; i++) ids.push(i);

const unescape = s => s.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const strip = s => unescape(s.replace(/<[^>]+>/g, '\n')).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

async function fetchOne(id) {
	const res = await fetch(`https://bdocodex.com/us/item/${id}/`, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
	const html = await res.text();
	// What the crystal weighs in itself: the hold pays it like any other
	// thing bolted on. Every one of them is 1 LT, but it is read rather
	// than assumed, the same as everything else here.
	const lt = Number((/Weight:\s*([\d.,]+)\s*LT/.exec(html) || [])[1] || 0);
	const lines = strip(html);
	const name = (lines.find(l => l.endsWith(' - BDO Codex')) || '').replace(/ - BDO Codex$/, '');
	const effects = [];
	// "- Effect", "- Effect:" or "- Effects:", then the lines until the
	// next heading -- or the page's own script, on the Nol's page.
	const stop = l => l.startsWith('-') || l === 'Weight' || l.startsWith('"') || l.startsWith('}') || l.startsWith('window.') || l.startsWith('function ');
	for (let i = 0; i < lines.length; i++) {
		if (/^- Effects?:?$/.test(lines[i])) {
			for (let j = i + 1; j < lines.length && !stop(lines[j]); j++) effects.push(lines[j].replace(/[",]+$/, ''));
			break;
		}
	}
	const usage = (lines.find(l => l.startsWith('- Usage')) || '').replace(/^- Usage:?\s*/, '');
	const grade = /Rusalka/.test(name) ? 'rusalka' : /Margoria/.test(name) ? 'margoria' : /Zulatia/.test(name) ? 'zulatia'
		: /Serni/.test(name) ? 'serni' : /Eltro/.test(name) ? 'eltro' : /Nol/.test(name) ? 'nol' : 'other';
	return { id, name, grade, lt, effects: [...new Set(effects)], usage };
}

const out = [];
let next = 0;
async function worker() {
	while (next < ids.length) {
		const id = ids[next++];
		try {
			out.push(await fetchOne(id));
			process.stdout.write(`\r${out.length}/${ids.length}`);
		} catch (err) {
			console.error('\n', err.message);
		}
		await new Promise(r => setTimeout(r, 150));
	}
}
await Promise.all([worker(), worker(), worker(), worker()]);
out.sort((a, b) => a.id - b.id);

const body = out.map(c => `\t{ id: ${c.id}, name: ${JSON.stringify(c.name)}, grade: '${c.grade}', lt: ${c.lt}, effects: ${JSON.stringify(c.effects)}${c.usage ? `, usage: ${JSON.stringify(c.usage)}` : ''} }`).join(',\n');
const file = `// Every sea crystal a ship can carry, and the Nols, read off BDOCodex
// on ${new Date().toISOString().slice(0, 10)} by tools/fetch-sea-crystals.mjs. One entry per
// codex id: a name is a grade, an id is one effect at one value.
//
// The grades, weakest first: Eltro, Serni, Zulatia, Margoria, Rusalka
// (2025-02-06, "slightly higher effects than Margoria" and, unlike the
// others, not limited to a sea area). Ebenruth's Nol shares the slot;
// the Oceanteared Nol (Rusalka Sea Crystal + Ebenruth's Nol, by
// Manufacture) carries both.

export const crystals = [
${body}
];

export const crystalById = Object.fromEntries(crystals.map(c => [c.id, c]));
`;
fs.writeFileSync(path.join(root, 'js', 'sea_crystals.js'), file);
console.log(`\nwrote ${out.length} crystals`);
