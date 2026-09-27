// The game client's barter tables, decoded. Pure functions over the file
// bytes, so a test can feed them a buffer of its own.
//
// Every table is a PABR file: `PABR`, a u32 row count, the rows, then a
// string table whose offset is the u64 in the last eight bytes. A parse
// that does not end exactly at the string table has misread something,
// and says so rather than baking a half-read file.
//
// What the files hold (worked out 2026-09-27 against a whole in-game
// layout, 77 rows of 77, and the five material boards read off the
// barter window, 220 offers of 220):
//
// barter_normal.bss -- two boards, each `u32 regions` then per region
//   `u16 region, u32 slots` and that many 70-byte records.
//   The first is the trade board: 91 islands x 40 rows. A day's board
//   (a "seed" in the game's own scripts; a layout to the community) is
//   one row index used at every island at once. The second is the ship
//   material list, 91 x 41, built the same way.
// bartersubgroup.bss -- the random picks. A record with no goods is not
//   an empty slot: its u16 at +62 names a group, and the board shows one
//   of the group's entries, each as likely as the next. Two blocks: 197
//   groups the trade board points into, then 5 the material list does.
// barter_special.bss -- the Special Barter window (gold bars for maps,
//   crystals, coins by the thousand): 105 records, the same 70 bytes.
// barter_npclist.bss -- ICE-encrypted; region key -> barterer's npc id.
// barterresetoption.bss, barterlifelevelinfo.bss -- pairs of u32: the
//   board's re-roll settings (meaning not yet pinned down) and the
//   barter skill's experience per level.

const MAGIC = 'PABR';

function header(buf, name) {
	if (buf.subarray(0, 4).toString('latin1') !== MAGIC) throw new Error(`${name}: not a plain PABR table (encrypted?)`);
	return { rows: buf.readUInt32LE(4), end: Number(buf.readBigUInt64LE(buf.length - 8)) };
}
const u32 = (b, o) => b.readUInt32LE(o);
// Counts are 64-bit in the file; none comes near 2^32.
const u64 = (b, o) => Number(b.readBigUInt64LE(o));

/**
 * One 70-byte offer record.
 *
 *   +0  u16 region      +2  u32 weight (of 1,000,000: the chance it shows)
 *   +6  u32 give item   +10 u64 give min    +18 u64 give max
 *   +26 u32 recv item   +30 u64 recv min    +38 u64 recv max
 *   +46 u32 base Parley +50 u32 exchanges a day
 *   +54 u32 Total Barters that open it      +58 u32 (1,000,000; 0 on unused material rows)
 *   +62 u16 random group, when there are no goods
 *   +66 u32 category bits (2 shore->1, 4 1->2, 8 2->3, 16 3->4, 32 4->5,
 *           64 material, 128 coins, 256 coin ships, 1024 6->7)
 */
export function offerOf(r) {
	const give = u32(r, 6), recv = u32(r, 26);
	if (!give && !recv) return { group: r.readUInt16LE(62) };
	return {
		weight: u32(r, 2), give, giveMin: u64(r, 10), giveMax: u64(r, 18), recv, recvMin: u64(r, 30), recvMax: u64(r, 38),
		parley: u32(r, 46), perDay: u32(r, 50), gate: u32(r, 54), k58: u32(r, 58), category: u32(r, 66)
	};
}

function board(buf, at) {
	const regions = u32(buf, at);
	at += 4;
	const pools = new Map();
	for (let i = 0; i < regions; i++) {
		const region = buf.readUInt16LE(at), n = u32(buf, at + 2);
		at += 6;
		const slots = [];
		for (let k = 0; k < n; k++, at += 70) {
			const r = buf.subarray(at, at + 70);
			if (r.readUInt16LE(0) !== region) throw new Error(`barter_normal: a record of region ${region} says ${r.readUInt16LE(0)}`);
			slots.push(offerOf(r));
		}
		pools.set(region, slots);
	}
	return { at, pools };
}

/** Both boards of barter_normal.bss: region -> its slots, row by row. */
export function readBarterNormal(buf) {
	const { end } = header(buf, 'barter_normal');
	const trade = board(buf, 4);
	const material = board(buf, trade.at);
	if (material.at !== end) throw new Error(`barter_normal: read to ${material.at}, the string table is at ${end}`);
	return { trade: trade.pools, material: material.pools };
}

/**
 * One 72-byte group entry.
 *
 *   +0  u32 group id    +4  u32 weight      +8  u32 unknown (2..68; 68 on every Level 7 pick)
 *   +12 u32 give item   +16 u64 give min    +24 u64 give max
 *   +32 u32 recv item   +36 u64 recv min    +44 u64 recv max
 *   +52 u32 base Parley +56 u32 exchanges a day
 *   +60 u32 Total Barters that open this option
 *   +64 u32 (1,000,000) +68 u32 category bits
 */
export function entryOf(e) {
	return {
		id: u32(e, 0), weight: u32(e, 4), k8: u32(e, 8), give: u32(e, 12), giveMin: u64(e, 16), giveMax: u64(e, 24),
		recv: u32(e, 32), recvMin: u64(e, 36), recvMax: u64(e, 44), parley: u32(e, 52), perDay: u32(e, 56), gate: u32(e, 60),
		k64: u32(e, 64), category: u32(e, 68)
	};
}

function groups(buf, at, n) {
	const out = new Map();
	for (let g = 0; g < n; g++) {
		const count = u32(buf, at);
		at += 4;
		const list = [];
		for (let i = 0; i < count; i++, at += 72) list.push(entryOf(buf.subarray(at, at + 72)));
		const ids = new Set(list.map(e => e.id));
		if (ids.size !== 1) throw new Error(`bartersubgroup: group ${g} mixes ids ${[...ids].join(',')}`);
		const id = [...ids][0];
		if (out.has(id)) throw new Error(`bartersubgroup: group ${id} twice`);
		out.set(id, list.map(({ id: _id, ...e }) => e));
	}
	return { at, groups: out };
}

/** The random groups: the trade board's, then the material list's. */
export function readSubgroups(buf) {
	const { rows, end } = header(buf, 'bartersubgroup');
	const trade = groups(buf, 8, rows);
	const material = groups(buf, trade.at + 4, u32(buf, trade.at));
	if (material.at !== end) throw new Error(`bartersubgroup: read to ${material.at}, the string table is at ${end}`);
	return { trade: trade.groups, material: material.groups };
}

/** The Special Barter window's offers. */
export function readSpecial(buf) {
	const { rows, end } = header(buf, 'barter_special');
	if (8 + rows * 70 !== end) throw new Error('barter_special: the rows do not fill the file');
	return Array.from({ length: rows }, (_, i) => offerOf(buf.subarray(8 + i * 70, 8 + i * 70 + 70)));
}

/** Region key -> the barterer's npc id. Pass the decrypted file. */
export function readNpcList(buf) {
	const { rows, end } = header(buf, 'barter_npclist');
	if (8 + rows * 4 !== end) throw new Error('barter_npclist: the rows do not fill the file');
	const out = new Map();
	for (let i = 0; i < rows; i++) out.set(buf.readUInt16LE(8 + i * 4), buf.readUInt16LE(10 + i * 4));
	return out;
}

/** A table of u32 pairs. */
export function readPairs(buf, name) {
	const { rows, end } = header(buf, name);
	if (8 + rows * 8 !== end) throw new Error(`${name}: the rows do not fill the file`);
	return Array.from({ length: rows }, (_, i) => [u32(buf, 8 + i * 8), u32(buf, 12 + i * 8)]);
}
