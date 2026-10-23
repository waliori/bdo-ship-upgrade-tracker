// The study of the planners, against the real server: a study sent as
// the page sends one -- gzipped, signed in or not -- is kept with its
// body as sent, and the run recorded after it goes under its id; an
// outcome for a study that is not the sender's, or is nobody's, is
// refused; a study without an id or a planner is refused.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-study-'));

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
process.env.MARKET_FIXTURE = new URL('./fixtures/market.json', import.meta.url).href;
const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser, listStudies } = await import('../server/db.js');
const { readStudy } = await import('../server/study.js');

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

const post = (url, body, { cookie, gz = true } = {}) => fetch(base + url, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', ...(gz ? { 'Content-Encoding': 'gzip' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
	body: gz ? zlib.gzipSync(JSON.stringify(body)) : JSON.stringify(body)
});
const unpack = s => JSON.parse(zlib.gunzipSync(Buffer.from(s, 'base64')).toString());

await upsertUser({ id: '3001', username: 'Admiral', avatar: 'abc' });
const ID = '0f6b2c1e-8d7a-4b3c-9e1f-2a3b4c5d6e7f';
const ID2 = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const study = { id: ID, planner: 'new', release: '1.5', layout: '34', day: '2026-10-19', at: 1, instance: { stations: [{ id: '1' }] }, trace: [{ k: 'start', f: 1 }, { k: 'end', f: 2 }], plan: { visits: [] }, R: 2, T: 1 };

test('a study has to carry an id and name its planner', () => {
	assert.ok(readStudy(null).error);
	assert.ok(readStudy({ planner: 'new' }).error);
	assert.ok(readStudy({ id: ID }).error);
	assert.ok(readStudy({ id: 'not-an-id', planner: 'new' }).error);
	const ok = readStudy(study);
	assert.equal(ok.error, undefined);
	assert.equal(ok.layout, '34');
	assert.deepEqual(unpack(ok.body), study);
});

test('a stranger\'s study is kept as sent, gzipped, and the run recorded goes under it', async () => {
	let res = await post('/api/study', study);
	assert.equal(res.status, 200, await res.text());
	res = await post(`/api/study/${ID}/sailed`, { silver: 5, done: 3 });
	assert.equal(res.status, 200, await res.text());
	const rows = await listStudies(0);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].userId, null);
	assert.equal(rows[0].planner, 'new');
	assert.deepEqual(unpack(rows[0].body), study);
	assert.deepEqual(unpack(rows[0].sailed), { silver: 5, done: 3 });
	assert.ok(rows[0].sailedAt > 0);
});

test('an outcome for a study that is not there, or not the sender\'s, is refused', async () => {
	let res = await post(`/api/study/${ID2}/sailed`, { silver: 1 });
	assert.equal(res.status, 404);
	const cookie = cookieFor('3001');
	res = await post('/api/study', { ...study, id: ID2 }, { cookie, gz: false });
	assert.equal(res.status, 200, await res.text());
	// A stranger cannot write the outcome of the admiral's study.
	res = await post(`/api/study/${ID2}/sailed`, { silver: 1 });
	assert.equal(res.status, 404);
	res = await post(`/api/study/${ID2}/sailed`, { silver: 1 }, { cookie });
	assert.equal(res.status, 200);
	const rows = await listStudies(0);
	assert.equal(rows.find(r => r.id === ID2).userId, '3001');
	// And a study without a planner is refused.
	res = await post('/api/study', { id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e' });
	assert.equal(res.status, 400);
});
