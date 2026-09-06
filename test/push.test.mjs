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
process.env.LOG_REQUESTS = '0';
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

// The shape a browser hands over: a service endpoint, a P-256 point and
// a 16-byte secret, both base64url.
const P256DH = 'B' + 'a'.repeat(86);
const AUTH = 'b'.repeat(22);
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: P256DH, auth: AUTH } };

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

test('only the push services browsers use are subscribed to', async () => {
	const { pushService } = await import('../server/push.js');
	for (const ok of [
		'https://fcm.googleapis.com/fcm/send/abc',
		'https://updates.push.services.mozilla.com/wpush/v2/abc',
		'https://a.b.push.services.mozilla.com/wpush/v2/abc',
		'https://wns2-par02p.notify.windows.com/w/?token=abc',
		'https://web.push.apple.com/abc'
	]) assert.ok(pushService(ok), ok);
	// An endpoint is a URL this server will POST to every Vell on the
	// word of whoever posted it, so anywhere else is refused -- including
	// a real service on a plain scheme or hidden in a lookalike host.
	for (const bad of [
		'https://push.example/abc',
		'http://fcm.googleapis.com/fcm/send/abc',
		'https://fcm.googleapis.com.evil.example/abc',
		'https://evilnotify.windows.com/x',
		'not a url'
	]) assert.equal(pushService(bad), false, bad);
	const res = await call('POST', '/api/push/subscribe', { subscription: { ...SUB, endpoint: 'https://push.example/abc' }, region: 'eu' });
	assert.equal(res.status, 400);
	assert.equal((await listPushSubs('eu')).length, 0);
});

test('the keys must be the size the protocol makes them', async () => {
	// Through the validator rather than the route: the route allows six
	// changes a minute from one address, and this file is one address.
	const { looksLikeSubscription } = await import('../server/push.js');
	const withKeys = keys => looksLikeSubscription({ ...SUB, keys });
	assert.ok(withKeys({ p256dh: P256DH, auth: AUTH }));
	assert.ok(withKeys({ p256dh: P256DH + '=', auth: AUTH + '==' }), 'padding is allowed');
	assert.equal(withKeys({ p256dh: 'p', auth: AUTH }), false, 'a one-character point');
	assert.equal(withKeys({ p256dh: 'a'.repeat(129), auth: AUTH }), false, 'a point past the cap');
	assert.equal(withKeys({ p256dh: P256DH, auth: 'b'.repeat(65) }), false, 'a secret past the cap');
	assert.equal(withKeys({ p256dh: P256DH, auth: 'b'.repeat(21) + '!' }), false, 'not base64url');
	assert.equal(withKeys({ p256dh: P256DH }), false, 'no secret at all');
});

test('a subscription body has a few kilobytes and no more', async () => {
	const res = await call('POST', '/api/push/subscribe', { subscription: SUB, region: 'eu', padding: 'x'.repeat(9000) });
	assert.equal(res.status, 413);
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
