// The Vell reminder by push: the keys make it available, a subscription
// is kept by region, and the minute hand knows when a region is due.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import webpush from 'web-push';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-push-'));
process.env.NODE_ENV = 'test';
for (const name of ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'PUBLIC_URL']) delete process.env[name];
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

const app = (await import('../server.js')).default;
const { dueRegions } = await import('../server/push.js');
const { listPushSubs } = await import('../server/db.js');
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = (method, url, body) => fetch(base + url, {
	method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
	body: body ? JSON.stringify(body) : undefined
});

const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };

test('push is offered without Discord, once the keys are set', async () => {
	assert.deepEqual(await (await call('GET', '/api/config')).json(), { sync: false, push: true });
	const key = await (await call('GET', '/api/push/key')).json();
	assert.equal(key.key, keys.publicKey);
	assert.deepEqual(key.regions, ['eu', 'na']);
});

test('a subscription is kept by region, and can be dropped', async () => {
	assert.equal((await call('POST', '/api/push/subscribe', { subscription: SUB, region: 'eu' })).status, 204);
	assert.equal((await call('POST', '/api/push/subscribe', { subscription: SUB, region: 'na' })).status, 204, 'the same endpoint moves region');
	assert.equal((await listPushSubs('eu')).length, 0);
	assert.deepEqual((await listPushSubs('na')).map(s => s.endpoint), [SUB.endpoint]);
	assert.equal((await call('POST', '/api/push/subscribe', { subscription: SUB, region: 'mars' })).status, 400);
	assert.equal((await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://plain' }, region: 'eu' })).status, 400);
	assert.equal((await call('DELETE', '/api/push/subscribe', { endpoint: SUB.endpoint })).status, 204);
	assert.equal((await listPushSubs('na')).length, 0);
});

test('a region is due once, a quarter of an hour before its spawn', () => {
	// EU: Sunday 14:00 Berlin (CEST) = 12:00 UTC on 2026-08-30.
	const spawn = Date.parse('2026-08-30T12:00:00Z');
	const before = 15 * 60e3;
	assert.deepEqual(dueRegions(spawn - before, {}, before).map(d => d.region), ['eu']);
	assert.deepEqual(dueRegions(spawn - before + 30e3, {}, before).map(d => d.region), ['eu'], 'still inside the beat');
	assert.deepEqual(dueRegions(spawn - before - 61e3, {}, before), [], 'too early');
	assert.deepEqual(dueRegions(spawn - before, { eu: spawn }, before), [], 'already sent for this spawn');
	assert.deepEqual(dueRegions(spawn - 5 * 60e3, {}, before), [], 'the window has passed');
});
