// A plan through a link and back.

import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeShare, decodeShare } from '../js/share.js';

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
