// A thing kept under a short link, against the real server.
//
// Like boards.test.mjs: the actual routes and the actual database, with
// a session minted by the server's own signing code. What a link has to
// look like to be kept, who may keep one, and that anyone may open it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-links-'));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.FLUSH_DELAY_MS = '0';
process.env.MAX_LINKS_PER_ACCOUNT = '3';
process.env.MAX_LINK_BYTES = String(16 * 1024);

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser, getLink, deleteAccount } = await import('../server/db.js');
const { readLink, newId } = await import('../server/links.js');

function cookieFor(id) {
	const headers = [];
	startSession({ append: (name, value) => headers.push(value) }, id);
	return headers.map(h => h.split(';')[0]).join('; ');
}

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

const call = (method, url, { cookie, body } = {}) => fetch(base + url, {
	method,
	headers: {
		...(cookie ? { Cookie: cookie } : {}),
		...(body ? { 'Content-Type': 'application/json' } : {})
	},
	body: body ? JSON.stringify(body) : undefined
});

await upsertUser({ id: '4001', username: 'Admiral', avatar: 'abc' });
await upsertUser({ id: '4002', username: 'Deckhand', avatar: null });
const admiral = cookieFor('4001');
const deckhand = cookieFor('4002');

/* ------------------------------------------------------------------ *
 * what may be kept
 * ------------------------------------------------------------------ */

test('a link is one of four things, each in its own shape', () => {
	assert.ok(readLink(null).error);
	assert.ok(readLink({ kind: 'essay', data: { text: 'hello' } }).error);
	assert.ok(readLink({ kind: 'plan', data: 'stock' }).error, 'a string is not a thing');
	assert.ok(readLink({ kind: 'plan', data: { targets: [] } }).error, 'a plan needs a stock');
	assert.ok(readLink({ kind: 'ship', data: { fitted: {} } }).error, 'a setup names its hull');
	assert.ok(readLink({ kind: 'trace', data: { name: 'x' } }).error, 'a trace says so');
	assert.ok(readLink({ kind: 'route', data: { r: [] } }).error, 'a route has stops');
	assert.deepEqual(readLink({ kind: 'plan', data: { stock: { a: 1 } } }), { kind: 'plan', payload: '{"stock":{"a":1}}' });
	assert.equal(readLink({ kind: 'ship', data: { ship: 'Epheria Caravel' } }).kind, 'ship');
	assert.equal(readLink({ kind: 'trace', data: { kind: 'trace', strokes: [] } }).kind, 'trace');
	assert.equal(readLink({ kind: 'route', data: { r: [1, 2] } }).kind, 'route');
});

test('an id is ten address-safe characters, and no two are alike', () => {
	const ids = new Set(Array.from({ length: 200 }, newId));
	assert.equal(ids.size, 200);
	for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{10}$/);
});

/* ------------------------------------------------------------------ *
 * the routes
 * ------------------------------------------------------------------ */

test('keeping a link takes an account; opening one does not', async () => {
	const out = await call('POST', '/api/links', { body: { kind: 'route', data: { r: [1, 2] } } });
	assert.equal(out.status, 401);

	const kept = await call('POST', '/api/links', { cookie: admiral, body: { kind: 'route', data: { r: [1, 2], h: 1 } } });
	assert.equal(kept.status, 200);
	const { id } = await kept.json();
	assert.match(id, /^[A-Za-z0-9_-]{10}$/);

	const opened = await call('GET', `/api/links/${id}`);
	assert.equal(opened.status, 200);
	assert.equal(opened.headers.get('cache-control'), 'no-store');
	const body = await opened.json();
	assert.equal(body.kind, 'route');
	assert.deepEqual(body.data, { r: [1, 2], h: 1 });
	assert.ok(body.at > 0);

	// Opened is counted, not by whom.
	await call('GET', `/api/links/${id}`);
	const row = await getLink(id);
	assert.equal(row.userId, '4001');
	assert.equal(row.opened, 2);
});

test('a link nobody kept is a 404, whatever its shape', async () => {
	assert.equal((await call('GET', '/api/links/AAAAAAAAAA')).status, 404);
	assert.equal((await call('GET', '/api/links/short')).status, 404);
	assert.equal((await call('GET', '/api/links/far-too-long-for-an-id')).status, 404);
});

test('what is not a link is refused, and so is too much of one', async () => {
	const bad = await call('POST', '/api/links', { cookie: admiral, body: { kind: 'plan', data: { targets: [] } } });
	assert.equal(bad.status, 400);
	const strokes = [{ pts: Array.from({ length: 4000 }, (_, i) => i) }];
	const big = await call('POST', '/api/links', { cookie: admiral, body: { kind: 'trace', data: { kind: 'trace', strokes } } });
	assert.equal(big.status, 413);
});

test('the payload comes back as given: a plan with its profile, a trace with its strokes', async () => {
	const plan = { stock: { 'Tidal Black Stone': 400 }, targets: [{ id: 't1', item: 'Carrack (Valor)', qty: 1 }], strategy: {}, profile: { barterCount: 1200 } };
	const kept = await call('POST', '/api/links', { cookie: deckhand, body: { kind: 'plan', data: plan } });
	const { id } = await kept.json();
	assert.deepEqual((await (await call('GET', `/api/links/${id}`)).json()).data, plan);

	const trace = { kind: 'trace', version: 3, steps: true, name: 'Reef', points: [], strokes: [{ pts: [70000, 60000, 3, -2, 4, 1], colour: '#ffd77a', width: 2.5 }], texts: [], areas: [] };
	const t = await (await call('POST', '/api/links', { cookie: deckhand, body: { kind: 'trace', data: trace } })).json();
	assert.deepEqual((await (await call('GET', `/api/links/${t.id}`)).json()).data, trace);
});

test('an account keeps so many; past that the oldest go', async () => {
	const ids = [];
	for (let i = 0; i < 5; i++) {
		const r = await call('POST', '/api/links', { cookie: admiral, body: { kind: 'route', data: { r: [i + 1] } } });
		ids.push((await r.json()).id);
		// The trim runs behind the answer; give it a beat.
		await new Promise(resolve => setTimeout(resolve, 20));
	}
	const alive = [];
	for (const id of ids) if ((await call('GET', `/api/links/${id}`)).status === 200) alive.push(id);
	assert.deepEqual(alive, ids.slice(-3), 'the three newest remain');
});

test('deleting the account takes its links with it', async () => {
	const r = await call('POST', '/api/links', { cookie: deckhand, body: { kind: 'ship', data: { ship: 'Epheria Caravel' } } });
	const { id } = await r.json();
	assert.equal((await call('GET', `/api/links/${id}`)).status, 200);
	await deleteAccount('4002');
	assert.equal((await call('GET', `/api/links/${id}`)).status, 404);
});
