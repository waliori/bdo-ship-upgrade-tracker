// The barter bake: the decoders over buffers of their own, and the baked
// file held to what was seen in the game.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { iceDecrypt, iceEncrypt } from '../tools/barter-bake/ice.mjs';
import { readBarterNormal, readSubgroups, readSpecial, readNpcList, readPairs } from '../tools/barter-bake/tables.mjs';
import { BAKED, OFFER, OPTION, LAYOUTS, GOODS, TRADE, MATERIAL, GROUPS, MATERIAL_GROUPS } from '../js/barter_game.js';

/** A PABR table: the magic, a row count, the body, and the string table's offset. */
function pabr(rows, body) {
	const head = Buffer.alloc(8);
	head.write('PABR', 0, 'latin1');
	head.writeUInt32LE(rows, 4);
	const end = Buffer.alloc(8);
	end.writeBigUInt64LE(BigInt(8 + body.length));
	return Buffer.concat([head, body, end]);
}
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
/** A 70-byte offer record. */
function record(region, o) {
	const r = Buffer.alloc(70);
	r.writeUInt16LE(region, 0);
	if (o.group != null) { r.writeUInt16LE(o.group, 62); return r; }
	r.writeUInt32LE(o.weight ?? 1e6, 2);
	r.writeUInt32LE(o.give, 6); r.writeBigUInt64LE(BigInt(o.giveMin ?? 1), 10); r.writeBigUInt64LE(BigInt(o.giveMax ?? 1), 18);
	r.writeUInt32LE(o.recv, 26); r.writeBigUInt64LE(BigInt(o.recvMin ?? 1), 30); r.writeBigUInt64LE(BigInt(o.recvMax ?? 1), 38);
	r.writeUInt32LE(o.parley ?? 14286, 46); r.writeUInt32LE(o.perDay ?? 10, 50); r.writeUInt32LE(o.gate ?? 0, 54);
	r.writeUInt32LE(1e6, 58); r.writeUInt32LE(o.category ?? 4, 66);
	return r;
}
const pool = (region, recs) => { const h = Buffer.alloc(6); h.writeUInt16LE(region, 0); h.writeUInt32LE(recs.length, 2); return Buffer.concat([h, ...recs.map(o => record(region, o))]); };

test('ICE: what is encrypted decrypts to itself, eight bytes at a time, and a short tail is left as it is', () => {
	const plain = Buffer.from(Array.from({ length: 67 }, (_, i) => (i * 37 + 11) & 0xff));
	const sealed = iceEncrypt(plain);
	assert.notDeepEqual(sealed.subarray(0, 64), plain.subarray(0, 64));
	assert.deepEqual(sealed.subarray(64), plain.subarray(64), 'the three bytes past the last block are untouched');
	assert.deepEqual(iceDecrypt(sealed), plain);
});

test('the trade board and the material list are read slot by slot, and an empty-looking slot names its group', () => {
	// The first board's island count is the table's own row count.
	const body = Buffer.concat([
		pool(409, [{ give: 800053, recv: 800061, perDay: 6, gate: 70, category: 32 }, { group: 56 }]),
		u32(1), pool(409, [{ give: 50, recv: 5824, giveMin: 1, giveMax: 1, recvMin: 3, recvMax: 3, parley: 61430, perDay: 2, weight: 500000, category: 64 }])
	]);
	const { trade, material } = readBarterNormal(pabr(1, body));
	const [fixed, random] = trade.get(409);
	assert.equal(fixed.give, 800053);
	assert.equal(fixed.recv, 800061);
	assert.equal(fixed.perDay, 6);
	assert.equal(fixed.gate, 70);
	assert.equal(fixed.category, 32);
	assert.deepEqual(random, { group: 56 });
	const [m] = material.get(409);
	assert.equal(m.weight, 500000, 'the chance the offer shows');
	assert.equal(m.parley, 61430);
	assert.equal(m.recvMin, 3);
});

test('a table that does not end where its string table begins is refused', () => {
	const body = Buffer.concat([pool(409, [{ give: 1, recv: 2 }]), u32(0)]);
	const bad = pabr(1, body);
	bad.writeBigUInt64LE(BigInt(8 + body.length + 70), bad.length - 8);
	assert.throws(() => readBarterNormal(bad), /string table/);
	assert.throws(() => readBarterNormal(Buffer.from('NOPE0000')), /not a plain PABR/);
});

test('the random groups: two blocks, each a count and its 72-byte options', () => {
	const option = (id, recv, gate) => {
		const e = Buffer.alloc(72);
		e.writeUInt32LE(id, 0); e.writeUInt32LE(1e6, 4); e.writeUInt32LE(24, 8);
		e.writeUInt32LE(800053, 12); e.writeBigUInt64LE(1n, 16); e.writeBigUInt64LE(1n, 24);
		e.writeUInt32LE(recv, 32); e.writeBigUInt64LE(40n, 36); e.writeBigUInt64LE(60n, 44);
		e.writeUInt32LE(21650, 52); e.writeUInt32LE(4, 56); e.writeUInt32LE(gate, 60); e.writeUInt32LE(128, 68);
		return e;
	};
	const body = Buffer.concat([u32(2), option(56, 800061, 151), option(56, 10, 151), u32(1), u32(1), option(3, 10, 0)]);
	const { trade, material } = readSubgroups(pabr(1, body));
	assert.deepEqual(trade.get(56).map(e => [e.recv, e.recvMin, e.recvMax, e.perDay, e.gate]), [[800061, 40, 60, 4, 151], [10, 40, 60, 4, 151]]);
	assert.equal(material.get(3).length, 1);
});

test('the barterer list, the Special Barter window and the pair tables', () => {
	const list = Buffer.alloc(8);
	list.writeUInt16LE(409, 0); list.writeUInt16LE(58948, 2); list.writeUInt16LE(966, 4); list.writeUInt16LE(58978, 6);
	assert.deepEqual([...readNpcList(pabr(2, list))], [[409, 58948], [966, 58978]]);
	assert.equal(readSpecial(pabr(1, record(0, { give: 5, recv: 10, recvMin: 10000, recvMax: 10000 })))[0].recvMax, 10000);
	assert.deepEqual(readPairs(pabr(2, Buffer.concat([u32(20), u32(40), u32(50), u32(2)])), 'x'), [[20, 40], [50, 2]]);
});

/* ------------------------------------------------------------------ *
 * the baked file
 * ------------------------------------------------------------------ */

const F = Object.fromEntries(OFFER.map((f, i) => [f, i])), G = Object.fromEntries(OPTION.map((f, i) => [f, i]));
const name = i => GOODS[i][1];
const STARRY = 58978, AJIR = 58966;

test('the baked boards are whole: every row there, every group a slot names is baked', () => {
	assert.ok(BAKED.at && BAKED.client, 'a bake says when and from which client');
	for (const [board, rows, groups] of [[TRADE, 40, GROUPS], [MATERIAL, 41, MATERIAL_GROUPS]]) {
		for (const [npc, slots] of Object.entries(board)) {
			assert.equal(slots.length, rows, `barterer ${npc}`);
			for (const s of slots) if (typeof s === 'number') assert.ok(groups[s] && groups[s].length, `group ${s}`);
		}
	}
	const rows = Object.values(LAYOUTS.trade);
	assert.equal(new Set(rows).size, 40, 'every trade row is one layout');
});

test('layout 31 as the game showed it on 2026-09-27: Starry Midnight Port takes Azure Quartz, Ajir rolls a Statue\'s Tear or coins', () => {
	const k = LAYOUTS.trade['31'];
	const starry = TRADE[STARRY][k];
	assert.equal(name(starry[F.give]), '[Level 5] Azure Quartz');
	assert.equal(name(starry[F.recv]), '[Level 6] Black Rose Bouquet');
	assert.equal(starry[F.perDay], 5);
	const ajir = TRADE[AJIR][k];
	assert.equal(typeof ajir, 'number', 'a random slot');
	const options = GROUPS[ajir].map(o => [name(o[G.recv]), o[G.perDay], o[G.recvMin], o[G.recvMax]]);
	assert.deepEqual(options.sort(), [['Crow Coin', 4, 40, 60], ['[Level 5] Statue\'s Tear', 6, 1, 1]].sort());
});

test('no Level 1 slot is random, so a board is known from its Level 1 islands', () => {
	for (const slots of Object.values(TRADE)) {
		for (const s of slots) {
			if (typeof s !== 'number') continue;
			assert.ok(!GROUPS[s].some(o => /^\[Level 1\]/.test(name(o[G.recv]))), `group ${s} rolls a [Level 1]`);
		}
	}
});

test('every material board read off the barter window is one row of the baked material list', async () => {
	const boards = JSON.parse(await readFile(new URL('../js/material_boards.json', import.meta.url), 'utf8')).boards;
	for (const board of boards) {
		const k = LAYOUTS.material[board.id];
		assert.ok(k != null, `board ${board.id} has a row`);
		for (const [npc, give, giveN, recv, recvN, perDay] of board.offers) {
			const s = MATERIAL[npc][k];
			assert.ok(Array.isArray(s), `${board.id}: barterer ${npc} has an offer`);
			assert.equal(name(s[F.give]).replace(/^\[[^\]]+\] /, ''), give.replace(/^\[[^\]]+\] /, ''));
			assert.equal(name(s[F.recv]).replace(/^\[[^\]]+\] /, ''), recv.replace(/^\[[^\]]+\] /, ''));
			assert.equal(s[F.giveMin], giveN);
			assert.ok(recvN >= s[F.recvMin] && recvN <= s[F.recvMax]);
			assert.equal(s[F.perDay], perDay);
		}
	}
});
