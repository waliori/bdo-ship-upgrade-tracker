// Rebuilds js/all_barter.json from a fresh pull of BDOCodex's barter table.
//
// The table comes down one row per exchange -- an NPC, what he takes,
// what he hands back -- and the app wants it the other way up: one
// entry per thing you can receive, with every exchange that yields it
// underneath. That regrouping is all this does, plus carrying the icon
// paths across, because the app's file has always had them and the
// row file does not.
//
//   node tools/build-barter.mjs <rows.json> [query_raw.json]
//
// <rows.json> is the parsed table: {npc_id, npc_name, attempts_available,
// give:{id,name,quantity}, receive:{id,name,quantity}} per row, with the
// quantities left as the site prints them -- "1", "2-3", "300-600" --
// because js/barter.js reads the range itself and shows it as written.
//
// [query_raw.json] is the site's untouched query.php response, which
// names an icon beside every item id. Given, every item gets its icon
// from there; without it, icons are carried over from the file being
// replaced for the ids it already knew, and left out for the rest. The
// UI does not read this field -- the icon loader keys on names through
// icon_mapping.json -- so a missing one costs nothing but completeness.
//
// Nothing is filtered. If a row says an exchange exists, it is kept,
// whatever it pays; the judgement about which one to take lives in
// barter.js, next to the reasons.

import { readFile, writeFile } from 'node:fs/promises';
import { buildTradeGoods } from './build-trade-goods.mjs';

const [rowsPath, rawPath] = process.argv.slice(2);
if (!rowsPath) {
	console.error('usage: node tools/build-barter.mjs <rows.json> [query_raw.json]');
	process.exit(2);
}

const OUT = new URL('../js/all_barter.json', import.meta.url);
const rows = JSON.parse(await readFile(rowsPath, 'utf8'));

// id -> icon path. The old file first, the raw query over it: the query
// is today's truth, the old file is what we had.
const icons = new Map();
try {
	for (const entry of JSON.parse(await readFile(OUT, 'utf8'))) {
		if (entry.icon) icons.set(String(entry.id), entry.icon);
		for (const s of entry.sources) {
			if (s.give && s.give.icon) icons.set(String(s.give.id), s.give.icon);
		}
	}
} catch { /* first build; nothing to carry over */ }

if (rawPath) {
	// Each cell reads <a href="/us/item/800003/" ...>...[img src="/items/
	// new_icon/.../00800003.webp" ...]: the id and the icon that follows
	// it. The slashes come JSON-escaped and are unescaped before matching.
	// The site sends it with a byte-order mark, which JSON.parse rejects.
	const raw = JSON.parse((await readFile(rawPath, 'utf8')).replace(/^\uFEFF/, ''));
	const cell = /\/us\/item\/(\d+)\/[^[]*\[img src="([^"]+)"/g;
	for (const row of raw.aaData || []) {
		for (const html of row) {
			if (typeof html !== 'string') continue;
			for (const m of html.matchAll(cell)) icons.set(m[1], m[2]);
		}
	}
}

const byReceived = new Map();
for (const r of rows) {
	const id = String(r.receive.id);
	if (!byReceived.has(id)) {
		const entry = { id, name: r.receive.name };
		if (icons.has(id)) entry.icon = icons.get(id);
		entry.sources = [];
		byReceived.set(id, entry);
	}
	const give = { id: String(r.give.id), name: r.give.name };
	if (icons.has(give.id)) give.icon = icons.get(give.id);
	give.quantity = String(r.give.quantity);
	byReceived.get(id).sources.push({
		npc_id: r.npc_id,
		npc_name: r.npc_name,
		attempts_available: r.attempts_available,
		give,
		quantity_received: String(r.receive.quantity)
	});
}

// The order the last build used: entries by name, sources by NPC then
// by what is handed over -- plain code-unit order, so "[Level" sorts
// after the ship materials, as it always has.
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const out = [...byReceived.values()].sort((a, b) => cmp(a.name, b.name));
for (const e of out) e.sources.sort((a, b) => cmp(a.npc_name, b.npc_name) || cmp(a.give.name, b.give.name));

await writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
// The goods list the item pickers read is cut from the same table.
await buildTradeGoods();

const npcs = new Set(rows.map(r => r.npc_id));
const missingIcon = out.filter(e => !e.icon).length
	+ out.reduce((n, e) => n + e.sources.filter(s => !s.give.icon).length, 0);
console.log(`${out.length} received items, ${rows.length} exchanges, ${npcs.size} NPCs`
	+ (missingIcon ? `, ${missingIcon} without an icon` : ''));
