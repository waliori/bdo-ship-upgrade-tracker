// The server as it is actually deployed: sync and push both on, and a
// PUBLIC_URL that names the site. What the other suites cannot see --
// two routers sharing /api, the origin check against a configured URL,
// and the access log.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import webpush from 'web-push';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-ops-'));
process.env.NODE_ENV = 'test';
process.env.PUBLIC_URL = 'https://sail.example';
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.FLUSH_DELAY_MS = '0';
process.env.LOG_REQUESTS = '1';
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

// The log goes to console.log; caught here so it can be read back.
const logged = [];
const realLog = console.log;
console.log = (...args) => { logged.push(args.join(' ')); };

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser } = await import('../server/db.js');
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
	console.log = realLog;
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

function cookieFor(id) {
	const headers = [];
	startSession({ append: (name, value) => headers.push(value) }, id);
	return headers.map(h => h.split(';')[0]).join('; ');
}
await upsertUser({ id: '2001', username: 'Sailor', avatar: null });
const alice = cookieFor('2001');

const call = (method, url, { cookie, body, headers } = {}) => fetch(base + url, {
	method,
	headers: {
		...(cookie ? { Cookie: cookie } : {}),
		...(body ? { 'Content-Type': 'application/json' } : {}),
		...headers
	},
	body: body ? JSON.stringify(body) : undefined
});

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'B' + 'a'.repeat(86), auth: 'b'.repeat(22) } };
const SAVE = { stock: { 'Tidal Black Stone': 400 }, targets: [], strategy: {} };

test('both halves are on', async () => {
	assert.deepEqual(await (await call('GET', '/api/config')).json(), { sync: true, push: true, feedback: true, community: true });
});

test('a push subscription keeps its own body limit when sync is on', async () => {
	// Both routers are mounted on /api. The sync router's parser allows a
	// megabyte for a save, and it used to be mounted on every /api path
	// -- so it parsed the subscription first, and the 8 KB parser behind
	// it, finding the body already read, let a megabyte through.
	const res = await call('POST', '/api/push/subscribe', { body: { subscription: SUB, region: 'eu', padding: 'x'.repeat(20000) } });
	assert.equal(res.status, 413, await res.text());
	// A save still gets its megabyte.
	const big = { ...SAVE, stock: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`Item ${i}`, i])) };
	assert.ok(JSON.stringify(big).length > 8 * 1024);
	assert.equal((await call('PUT', '/api/state', { cookie: alice, body: { rev: 0, data: big } })).status, 200);
});

test('a change must come from PUBLIC_URL when one is set', async () => {
	const from = origin => call('PUT', '/api/state', { cookie: alice, body: { rev: 1, data: SAVE }, headers: { Origin: origin } });
	// The request reaches this server at 127.0.0.1, but the site is the
	// configured one; a request that names the server's own address is a
	// browser on the wrong host, and refused.
	assert.equal((await from(base)).status, 403);
	assert.equal((await from('https://evil.example')).status, 403);
	assert.equal((await from('https://sail.example')).status, 200);
	assert.equal((await from('https://sail.example')).status, 409, 'the earlier one was written');
});

test('every API request leaves one JSON line, and static files leave none', async () => {
	logged.length = 0;
	await call('GET', '/api/me', { cookie: alice });
	await call('GET', '/api/me');
	await call('GET', '/js/planner.js');
	await call('GET', '/');
	await call('GET', '/healthz');
	await new Promise(resolve => setTimeout(resolve, 20));
	const lines = logged.filter(l => l.startsWith('{')).map(l => JSON.parse(l));
	assert.deepEqual(lines.map(l => l.path), ['/api/me', '/api/me']);
	const [signedIn, anonymous] = lines;
	assert.equal(signedIn.method, 'GET');
	assert.equal(signedIn.status, 200);
	assert.equal(typeof signedIn.ms, 'number');
	assert.match(signedIn.acct, /^[0-9a-f]{12}$/, 'the account is a short hash');
	assert.notEqual(signedIn.acct, '2001', 'the account id itself is never written');
	assert.equal(anonymous.acct, undefined);
	assert.ok(!('query' in signedIn));
});

test('the log line is on by default and never carries the query string', async () => {
	logged.length = 0;
	await call('GET', '/api/market?region=eu&ids=');
	await new Promise(resolve => setTimeout(resolve, 20));
	const line = JSON.parse(logged.find(l => l.startsWith('{')));
	assert.equal(line.path, '/api/market');
	assert.equal(line.status, 400);
});
