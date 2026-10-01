// Rebuilds js/all_barter.json from a fresh pull of BDOCodex's barter table.
//
// The table comes down one row per exchange -- an NPC, what he takes,
// what he hands back -- and the app wants it the other way up: one
// entry per thing you can receive, with every exchange that yields it
// underneath. That regrouping is all this does.
//
//   node tools/build-barter.mjs <rows.json>
//
// <rows.json> is the parsed table: {npc_id, npc_name, attempts_available,
// give:{id,name,quantity}, receive:{id,name,quantity}} per row, with the
// quantities left as the site prints them -- "1", "2-3", "300-600" --
// because js/barter.js reads the range itself and shows it as written.
//
// The file is written on one line and carries no icon paths. It is the
// largest thing the app precaches, fetched again on every deploy, and
// nobody reads it but the code: the icon loader keys on names through
// icon_mapping.json, so the icon each row once carried was a third of
// the file spent on a field nothing drew. Pipe it through `jq .` to read
// it.
//
// Nothing is filtered. If a row says an exchange exists, it is kept,
// whatever it pays; the judgement about which one to take lives in
// barter.js, next to the reasons.

import { readFile, writeFile } from 'node:fs/promises';
import { buildTradeGoods } from './build-trade-goods.mjs';
import { buildLandGoods } from './build-land-goods.mjs';

const [rowsPath] = process.argv.slice(2);
if (!rowsPath) {
	console.error('usage: node tools/build-barter.mjs <rows.json>');
	process.exit(2);
}

const OUT = new URL('../js/all_barter.json', import.meta.url);
const rows = JSON.parse(await readFile(rowsPath, 'utf8'));

const byReceived = new Map();
for (const r of rows) {
	const id = String(r.receive.id);
	if (!byReceived.has(id)) {
		byReceived.set(id, { id, name: r.receive.name, sources: [] });
	}
	const give = { id: String(r.give.id), name: r.give.name, quantity: String(r.give.quantity) };
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

await writeFile(OUT, JSON.stringify(out) + '\n');
// The goods list the item pickers read is cut from the same table.
await buildTradeGoods();
await buildLandGoods();

const npcs = new Set(rows.map(r => r.npc_id));
console.log(`${out.length} received items, ${rows.length} exchanges, ${npcs.size} NPCs`);
