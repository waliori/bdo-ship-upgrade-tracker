// Push for a sailor's own chimes: the keys make it available, and a
// subscription is kept and dropped by the browser that holds it.

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
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

const app = (await import('../server.js')).default;
const { getPushSub } = await import('../server/db.js');
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
	const { build, ...offered } = await (await call('GET', '/api/config')).json();
	assert.deepEqual(offered, { sync: false, push: true, discordDm: false, feedback: true, uploads: true, community: false, presence: true, links: false });
	assert.ok(build, 'the deploy is named, for a report to say where it came from');
	const key = await (await call('GET', '/api/push/key')).json();
	assert.deepEqual(key, { key: keys.publicKey }, 'the Vell timetable is gone, and the key says nothing about it');
});

test('a subscription is kept, and can be dropped', async () => {
	assert.equal((await call('POST', '/api/push/subscribe', { subscription: SUB })).status, 204);
	assert.ok(await getPushSub(SUB.endpoint));
	// An older tab still says which Vell timetable it followed, and
	// whether it wanted the reminder: both are ignored now, any region.
	assert.equal((await call('POST', '/api/push/subscribe', { subscription: SUB, region: 'mars', vell: true })).status, 204);
	assert.equal((await call('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://plain' } })).status, 400);
	// The browser's own secret comes with the address (see the rule
	// below: the address alone is not enough to take it away).
	assert.equal((await call('DELETE', '/api/push/subscribe', { endpoint: SUB.endpoint, auth: AUTH })).status, 204);
	assert.equal(await getPushSub(SUB.endpoint), null);
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
	// An endpoint is a URL this server will POST to on the word of
	// whoever posted it, so anywhere else is refused -- including
	// a real service on a plain scheme or hidden in a lookalike host.
	for (const bad of [
		'https://push.example/abc',
		'http://fcm.googleapis.com/fcm/send/abc',
		'https://fcm.googleapis.com.evil.example/abc',
		'https://evilnotify.windows.com/x',
		'not a url'
	]) assert.equal(pushService(bad), false, bad);
	const res = await call('POST', '/api/push/subscribe', { subscription: { ...SUB, endpoint: 'https://push.example/abc' } });
	assert.equal(res.status, 400);
	assert.equal(await getPushSub('https://push.example/abc'), null);
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
	const res = await call('POST', '/api/push/subscribe', { subscription: SUB, padding: 'x'.repeat(9000) });
	assert.equal(res.status, 413);
});

test('a kept subscription is changed only by the browser that holds it, or its own account', async () => {
	// Through the rule rather than the route, for the same reason as the
	// keys above: six changes a minute from one address.
	const { mayChange } = await import('../server/push.js');
	const row = { sub: { endpoint: SUB.endpoint, keys: { p256dh: P256DH, auth: AUTH } }, userId: '2001' };
	assert.ok(mayChange(null, 'anything', null), 'a new endpoint is anybody\'s to subscribe');
	assert.ok(mayChange(row, AUTH, null), 'the browser holding the secret');
	assert.ok(mayChange(row, AUTH, '9999'), 'the browser holding the secret, signed into another account');
	assert.ok(mayChange(row, 'c'.repeat(22), '2001'), 'the account it is filed under, with new keys');
	assert.equal(mayChange(row, 'c'.repeat(22), '9999'), false, 'somebody who only knows the address');
	assert.equal(mayChange(row, undefined, null), false);
	assert.equal(mayChange({ ...row, userId: null }, 'c'.repeat(22), null), false, 'an unfiled device is not up for grabs either');
});
