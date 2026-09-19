// What each ship part weighs in itself, read off BDOCodex.
//
// js/part_stats.js already carries what a part *gives* the hull --
// including the Weight Limit a plating adds. This is the other number
// on the same page: the item's own mass, the "Weight: 2.50 LT" line,
// which the game charges against the hold the moment the part is
// bolted on. Four parts is ten to twenty LT off a ship that has not
// loaded anything yet.
//
// Run with `node tools/fetch-part-weights.mjs`; it prints the table and,
// with --write, puts an `lt` on every entry in js/part_stats.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partStats } from '../js/part_stats.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const write = process.argv.includes('--write');
const names = Object.keys(partStats);

async function weightOf(id) {
	const res = await fetch(`https://bdocodex.com/us/item/${id}/`, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`);
	const html = await res.text();
	const m = /Weight:\s*([\d.,]+)\s*LT/.exec(html);
	if (!m) throw new Error(`${id}: no weight on the page`);
	return Number(m[1].replace(/,/g, ''));
}

const found = new Map();
let next = 0;
async function worker() {
	while (next < names.length) {
		const name = names[next++];
		try {
			found.set(name, await weightOf(partStats[name].id));
		} catch (err) {
			console.error('\n', err.message, name);
		}
		process.stdout.write(`\r${found.size}/${names.length}`);
		await new Promise(r => setTimeout(r, 150));
	}
}
await Promise.all([worker(), worker(), worker(), worker()]);
process.stdout.write('\n');

for (const name of names) console.log(String(found.get(name) ?? '?').padStart(7), name);

if (write) {
	const file = path.join(root, 'js/part_stats.js');
	let src = fs.readFileSync(file, 'utf8');
	for (const [name, lt] of found) {
		const key = JSON.stringify(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const re = new RegExp(`(${key}: \\{ )(?:lt: [\\d.]+, )?(id: \\d+)`);
		if (!re.test(src)) { console.error('no entry for', name); continue; }
		src = src.replace(re, `$1$2, lt: ${lt}`);
	}
	fs.writeFileSync(file, src);
	console.log(`\nwrote ${found.size} weights into js/part_stats.js`);
}
