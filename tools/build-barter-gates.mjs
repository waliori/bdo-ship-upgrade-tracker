// The barter count each of today's exchanges needs, baked from the game
// client's own table.
//
// The game does not open an island as a unit. Every one of the 3,129
// live normal exchanges carries its own total-barter threshold, at
// offset +54 of its 70-byte record in `barter_normal.bss`. Each island
// has a pool of exactly 40 exchanges; a day's board is one index into
// that pool used for every island at once, so layout N is row k of
// Baeza's forty, row k of Grandiha's forty, and so on. That makes the
// gate for an offer a lookup, not a guess: the row the layout stands on,
// at the island the offer is at.
//
// Which is why a board the app drew could not be sailed. The layouts
// were recorded by players with everything unlocked, so the app spoke
// for a 20,000-barter account: at 1,082 barters barely seven islands in
// ten on a board are actually open, and a chain wants all of its rungs.
//
// Run against an extracted client (see the notes in js/barter_gates.js
// for how the .bss files are got out of Paz/):
//
//   node tools/build-barter-gates.mjs <dir with the .bss files> \
//        <dir with items.json> [<barter_npclist.bss, decrypted>]
//
// The npc list is ICE-encrypted in the archive and the extractor does
// not decrypt; pass the decrypted copy separately if the one beside the
// other tables does not start with PABR.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [poolDir, dataDir, npcListArg] = process.argv.slice(2);
if (!poolDir || !dataDir) {
	console.error('usage: build-barter-gates.mjs <bss dir> <gamedata dir> [npclist.bss]');
	process.exit(1);
}
const here = new URL('../js/', import.meta.url);

const u16 = (b, o) => b.readUInt16LE(o);
const u32 = (b, o) => b.readUInt32LE(o);
const u64 = (b, o) => Number(b.readBigUInt64LE(o));

/** One 91-region section: each region's slots, in order, holes and all. */
function section(b, at, n) {
	const pools = new Map();
	for (let i = 0; i < n; i++) {
		const key = u16(b, at), count = u32(b, at + 2), recs = at + 6;
		const slots = [];
		for (let s = 0; s < count; s++) {
			const o = recs + s * 70;
			const give = u32(b, o + 6), recv = u32(b, o + 26);
			// A reserved slot still carries its region key, so the test is
			// the pair of item ids, never an all-zero record.
			slots.push(!give && !recv ? null
				: { give, giveQty: u32(b, o + 10), recv, gate: u32(b, o + 54) });
		}
		pools.set(key, slots);
		at = recs + count * 70;
	}
	return { at, pools };
}

const pool = await readFile(join(poolDir, 'barter_normal.bss'));
if (pool.subarray(0, 4).toString() !== 'PABR') throw new Error('barter_normal.bss is not plain');
// Two sections, not one: 91 regions of 40 slots, then 91 of 41. The
// second is the special-barter pool and is not what a day's board is
// drawn from, but it must be walked to prove the first was read whole.
const A = section(pool, 8, u32(pool, 4));
const B = section(pool, A.at + 4, u32(pool, A.at));
if (B.at !== u64(pool, pool.length - 8)) throw new Error('the parse did not reach the string table');

const npcFile = npcListArg || join(poolDir, 'barter_npclist.bss');
const list = await readFile(npcFile);
if (list.subarray(0, 4).toString() !== 'PABR') throw new Error(`${npcFile} is ICE-encrypted; pass a decrypted copy`);
const npcOf = new Map();
for (let i = 0; i < u32(list, 4); i++) npcOf.set(u16(list, 8 + i * 4), u16(list, 10 + i * 4));

const items = new Map();
for (const it of JSON.parse(await readFile(join(dataDir, 'items.json'), 'utf8'))) if (it.name) items.set(it.id, it.name);

const record = JSON.parse(await readFile(new URL('barter_combos.json', here), 'utf8'));
const combos = record.combos;
const bare = s => String(s || '').replace(/^\[[^\]]+\]\s*/, '');

// The island pools, by the npc id the rest of the app uses.
const byNpc = new Map();
for (const [region, slots] of A.pools) if (npcOf.has(region)) byNpc.set(npcOf.get(region), slots);

/**
 * Which row of the pool each layout stands on: the one that reproduces
 * the most of that layout's recorded offers. Solved rather than
 * hardcoded, so a re-bake against a newer client re-checks itself --
 * and the answer must be a bijection, every row claimed exactly once.
 */
const rows = {};
for (const c of combos) {
	let best = -1, hit = -1;
	for (let k = 0; k < 40; k++) {
		let n = 0;
		for (const [npc, give, qty, recv] of c.offers) {
			const slot = (byNpc.get(npc) || [])[k];
			if (slot && bare(items.get(slot.give)) === bare(give) && bare(items.get(slot.recv)) === bare(recv)
				&& String(slot.giveQty) === String(qty).split('-')[0]) n++;
		}
		if (n > hit) { hit = n; best = k; }
	}
	rows[c.id] = best;
}
const claimed = Object.values(rows);
if (new Set(claimed).size !== 40 || claimed.some(k => k < 0 || k > 39)) throw new Error('the layouts do not claim all forty rows');

// The layout standing on each row, so a cell can be checked against the
// offer the app actually says is there.
const layoutOn = new Map(combos.map(c => [rows[c.id], c]));

let cells = 0, agreed = 0;
const gates = {};
for (const [npc, slots] of byNpc) {
	const col = new Array(40).fill(null);
	for (let k = 0; k < 40; k++) {
		const c = layoutOn.get(k);
		const rec = c && c.offers.find(o => o[0] === npc);
		const slot = slots[k];
		if (!rec || !slot) continue;
		cells++;
		// Only where the client and the record say the same thing. Where
		// they differ the record has drifted, or the client ships no row
		// at all, and a gate read off the wrong offer would hide an
		// island a sailor can plainly trade at.
		if (bare(items.get(slot.give)) === bare(rec[1]) && bare(items.get(slot.recv)) === bare(rec[3])
			&& String(slot.giveQty) === String(rec[2]).split('-')[0]) { col[k] = slot.gate; agreed++; }
	}
	if (col.some(g => g !== null)) gates[npc] = col;
}

// The pools themselves, a row a layout: what the client says each island
// deals on it, whether the community's record has that row or not. Two
// uses. A row the record lacks is filled from here, so a board is whole
// where the client is; and what a sailor says they saw can be held up
// against everything the game is known to deal at that island, which is
// how a slot the game has moved is told from a thumb that slipped. Goods
// are written once and pointed at, or this would be the biggest file in
// the app.
// In the app's spelling, not the client's: the client files some
// [Level 5] goods under "[Great Ocean]", and a good called two things
// is two goods to everything downstream.
const spelt = new Map();
for (const c of combos) for (const [, give, , recv] of c.offers) { spelt.set(bare(give), give); spelt.set(bare(recv), recv); }
for (const e of JSON.parse(await readFile(new URL('all_barter.json', here), 'utf8'))) {
	if (!spelt.has(bare(e.name))) spelt.set(bare(e.name), e.name);
	for (const src of e.sources || []) if (src.give && !spelt.has(bare(src.give.name))) spelt.set(bare(src.give.name), src.give.name);
}
const goods = [];
const goodAt = new Map();
const point = id => {
	const said = items.get(id);
	const name = said ? (spelt.get(bare(said)) || said) : null;
	if (!name) return -1;
	if (!goodAt.has(name)) { goodAt.set(name, goods.length); goods.push(name); }
	return goodAt.get(name);
};
const pools = {};
for (const [npc, slots] of byNpc) {
	const col = slots.slice(0, 40).map(slot => {
		if (!slot) return null;
		const g = point(slot.give), r = point(slot.recv);
		return g < 0 || r < 0 ? null : [g, slot.giveQty, r, slot.gate];
	});
	if (col.some(Boolean)) pools[npc] = col;
}

const head = `// The barter count each exchange needs, from the game client.
//
// Generated by tools/build-barter-gates.mjs -- do not edit by hand.
//
// ROWS is the row of an island's forty-exchange pool that each layout
// stands on; GATES is, per barterer, the total-barter count that opens
// the exchange on each of those rows. A null is a row the client and
// the community's record disagree about, or one the client ships no
// exchange for at all -- the two tiers it leaves out are Level 4 -> 5
// at thirteen islands and Level 6 -> 7 at the six mainland barterers.
// Null means unknown, and unknown is treated as open: the app will
// never hide an island on a guess.
//
// POOLS is the client's own table, whole: per barterer, row by row,
// [give, how many, receive, gate] with the goods as indexes into GOODS.
// It is what fills a row the record has not got, and what a sailor's
// reading is held up against before it is called new.
//
// Baked ${new Date().toISOString().slice(0, 10)} from barter_normal.bss against
// barter_combos.json read ${record.read}: ${agreed} of ${cells} rows agreed
// (${(agreed / cells * 100).toFixed(1)}%), across ${Object.keys(gates).length} barterers.

`;
await writeFile(new URL('barter_gates.js', here),
	`${head}export const ROWS = ${JSON.stringify(rows)};\n\nexport const GATES = ${JSON.stringify(gates)};\n\nexport const GOODS = ${JSON.stringify(goods)};\n\nexport const POOLS = ${JSON.stringify(pools)};\n`);
console.log(`js/barter_gates.js — ${agreed}/${cells} rows (${(agreed / cells * 100).toFixed(1)}%), ${Object.keys(gates).length} barterers`);
