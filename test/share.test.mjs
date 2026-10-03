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

test('a short link is ten characters, and the address knows one', async () => {
	const { shortLinkId } = await import('../js/share.js');
	assert.equal(shortLinkId('#s/AbCd-12_34'), 'AbCd-12_34');
	assert.equal(shortLinkId('#s/short'), null);
	assert.equal(shortLinkId('#share/AbCd-12_34'), null);
	assert.equal(shortLinkId(''), null);
	// As they are written now: the id in the query, where a chat app
	// reading the link for its preview can see it.
	assert.equal(shortLinkId('', '?s=AbCd-12_34'), 'AbCd-12_34');
	assert.equal(shortLinkId('#plan', '?l=ship&s=AbCd-12_34'), 'AbCd-12_34');
	assert.equal(shortLinkId('', '?s=short'), null);
});

test('an opened link leaves nothing in the address that would open it again', async () => {
	const { plainSearch } = await import('../js/share.js');
	assert.equal(plainSearch('?s=AbCd-12_34'), '');
	assert.equal(plainSearch('?l=ship'), '');
	assert.equal(plainSearch('?theirs&l=trace'), '?theirs=');
	assert.equal(plainSearch(''), '');
});

test('a trace packed as steps unpacks to the same strokes, and packs to half the address', async () => {
	const { packTrace, unpackTrace } = await import('../js/map/trace.js');
	const { encodeAny } = await import('../js/share.js');
	// A drawn line wanders, and so does what it packs to: from 0.66 to
	// 0.71 of the address over many random strokes, so with Math.random
	// one run in twenty-five came out over the line below. The strokes
	// are drawn from a fixed seed instead -- the same wander every run,
	// a typical one (about 0.68).
	let seed = 0x5eed;
	const random = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const rnd = (a, b) => a + Math.floor(random() * (b - a));
	const stroke = n => { const p = []; let x = rnd(60000, 90000), y = rnd(50000, 80000); for (let i = 0; i < n; i++) { x += rnd(-40, 40); y += rnd(-40, 40); p.push(x, y); } return { pts: p, colour: '#ffd77a', width: 2.5, seq: 1 }; };
	const trace = { kind: 'trace', version: 2, name: 'Reef', points: [{ x: 1, y: 2 }], strokes: [stroke(150), stroke(150), [1, 2, 3, 4]], texts: [], areas: [{ pts: [1, 2, 3, 4, 5, 6] }], inkLines: true };
	const packed = packTrace(trace);
	assert.equal(packed.steps, true);
	assert.deepEqual(packed.strokes[0].pts.slice(0, 2), trace.strokes[0].pts.slice(0, 2), 'the first pair stands');
	assert.deepEqual(packed.strokes[2], [1, 2, 2, 2], 'a bare stroke stays bare');
	assert.deepEqual(unpackTrace(packed), { ...trace, version: 3 });
	assert.deepEqual(unpackTrace(trace), trace, 'a trace not packed is left as it is');
	const whole = (await encodeAny(trace)).length, less = (await encodeAny(packed)).length;
	assert.ok(less < whole * 0.7, `${less} of ${whole}`);
});
