// A plan through a link and back.

import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare, shareSize, slimShape, SLIM_DROP } from '../js/share.js';

const save = { stock: { 'Tidal Black Stone': 400, Silver: 5000000 }, targets: [{ id: 't1', item: 'Carrack (Valor)', qty: 1, active: true, note: '' }], strategy: {}, profile: { barterCount: 1200 } };

test('a save survives the trip, packed', async () => {
	const text = await encodeShare(save);
	assert.equal(text[0], 'z');
	assert.match(text, /^[A-Za-z0-9_-]+$/, 'address-safe');
	assert.deepEqual(await decodeShare(text), save);
});

test('a plain packing reads too, and rubbish does not', async () => {
	const plain = 'p' + Buffer.from(JSON.stringify(save)).toString('base64url');
	assert.deepEqual(await decodeShare(plain), save);
	await assert.rejects(decodeShare('x' + 'abc'));
	await assert.rejects(decodeShare('p' + Buffer.from('[1,2]').toString('base64url')));
	await assert.rejects(decodeShare('zabc'));
});

test('a real-sized save stays a short address', async () => {
	const stock = {};
	for (let i = 0; i < 300; i++) stock[`Some Material Number ${i}`] = i * 7;
	const text = await encodeShare({ ...save, stock });
	assert.ok(text.length < 4000, `${text.length} chars`);
});

test('anything small travels the same way -- a traced route, say', async () => {
	const { encodeAny, decodeAny } = await import('../js/share.js');
	const trace = { kind: 'trace', name: 'Reef run', notes: 'go slow', points: [{ x: 1, y: 2, note: 'start' }, { x: 3000, y: 4000 }], strokes: [[1, 2, 3, 4, 5, 6]] };
	const text = await encodeAny(trace);
	assert.match(text, /^[zp][A-Za-z0-9_-]+$/);
	assert.deepEqual(await decodeAny(text), trace);
	await assert.rejects(() => decodeAny('xnope'));
});

/** A profile with everything a season leaves in it. */
function heavyProfile() {
	const profile = { barterCount: 3000, crewShip: 'Carrack (Valor)', roster: [{ id: 'r1', type: 'Ambitious', name: 'Kit' }], setups: { s1: { name: 'Trade', ship: 'Carrack (Volante)' } }, fitted: { 'Carrack (Valor)': { sail: '+10 Sail' } } };
	profile.matSeen = {};
	for (let d = 1; d <= 14; d++) profile.matSeen[`2026-08-${String(d).padStart(2, '0')}`] = Array.from({ length: 120 }, (_, i) => [1000 + i, `[Level 1] Something ${i}`, `[Level 2] Other ${i}`]);
	profile.progress = {};
	for (let t = 0; t < 20; t++) profile.progress[`t${t}`] = Object.fromEntries(Array.from({ length: 31 }, (_, d) => [`2026-08-${String(d + 1).padStart(2, '0')}`, d * 100]));
	profile.views = { map: { traces: Array.from({ length: 20 }, () => ({ points: Array.from({ length: 500 }, (_, i) => ({ x: 100000 + i, y: 90000 + i, seq: i })) })) } };
	return profile;
}

test('a profile heavy with diaries and traces packs plain without overflowing, and packs slim without them', async () => {
	const heavy = { ...save, profile: heavyProfile() };
	const json = JSON.stringify(heavy);
	assert.ok(json.length > 300_000, `${json.length} bytes of save -- past what a spread into fromCharCode takes`);
	// The plain packing used to spread every byte onto the argument stack.
	const gzip = globalThis.CompressionStream;
	globalThis.CompressionStream = undefined;
	let plain;
	try {
		plain = await encodeShare(heavy);
	} finally {
		globalThis.CompressionStream = gzip;
	}
	assert.equal(plain[0], 'p');
	assert.deepEqual(await decodeShare(plain), heavy, 'and reads back whole');
	assert.equal(shareSize(plain), plain.length);

	const full = await encodeShare(heavy);
	const slim = await encodeShare(heavy, { slim: true });
	assert.ok(shareSize(slim) < shareSize(full) / 4, `${shareSize(slim)} slim against ${shareSize(full)} full`);
	const back = await decodeShare(slim);
	assert.deepEqual(back.stock, heavy.stock);
	for (const k of SLIM_DROP) assert.ok(!(k in back.profile), `${k} left out`);
	assert.deepEqual(back.profile.setups, heavy.profile.setups, 'the ship setups travel');
	assert.deepEqual(back.profile.roster, heavy.profile.roster);
	assert.deepEqual(back.profile.fitted, heavy.profile.fitted);
	assert.equal(back.profile.crewShip, 'Carrack (Valor)');
	assert.equal(back.profile.barterCount, 3000);
	assert.ok(!('profile' in slimShape({ stock: {}, profile: { views: {} } })), 'a profile that was only views goes entirely');
	assert.equal(shareSize(undefined), 0);
});
