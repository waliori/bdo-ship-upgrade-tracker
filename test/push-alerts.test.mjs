// An account's own chimes: a clock set on one device reaching the rest.
//
// A subscription made while signed in belongs to the account as well as
// to a region, and a set of chimes put under a tag is sent to every one
// of that account's devices when its moment comes. What can go wrong: a
// chime set by a stranger, one set for someone else's account, a run
// restarted chiming twice for the same stop, a row that is sent again
// every sweep, and a moment so far off that the row sits there for ever.
//
// Discord is stood in for by minting the session cookie with the
// server's own signing code, exactly as sync.test.mjs does.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import webpush from 'web-push';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-alerts-'));
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser, listUserPushSubs, duePushAlerts, countPushAlerts } = await import('../server/db.js');
const { readAlert, sendDueAlerts, MAX_ALERTS, MAX_AHEAD_MS } = await import('../server/push.js');

function cookieFor(id) {
	const headers = [];
	startSession({ append: (name, value) => headers.push(value) }, id);
	return headers.map(h => h.split(';')[0]).join('; ');
}

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = (method, url, { cookie, body } = {}) => fetch(base + url, {
	method,
	headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
	body: body ? JSON.stringify(body) : undefined
});

const P256DH = 'B' + 'a'.repeat(86);
const AUTH = 'b'.repeat(22);
const subFor = n => ({ endpoint: `https://fcm.googleapis.com/fcm/send/dev${n}`, keys: { p256dh: P256DH, auth: AUTH } });

await upsertUser({ id: '2001', username: 'oni', avatar: null });
await upsertUser({ id: '2002', username: 'someone else', avatar: null });
const oni = cookieFor('2001');
const other = cookieFor('2002');

test('a subscription made while signed in belongs to the account, and one made signed out does not', async () => {
	assert.equal((await call('POST', '/api/push/subscribe', { cookie: oni, body: { subscription: subFor('desk'), region: 'na' } })).status, 204);
	assert.equal((await call('POST', '/api/push/subscribe', { cookie: oni, body: { subscription: subFor('phone'), region: 'na' } })).status, 204);
	assert.equal((await call('POST', '/api/push/subscribe', { body: { subscription: subFor('stranger'), region: 'na' } })).status, 204);
	const mine = await listUserPushSubs('2001');
	assert.deepEqual(mine.map(s => s.endpoint).sort(), [
		'https://fcm.googleapis.com/fcm/send/devdesk',
		'https://fcm.googleapis.com/fcm/send/devphone'
	], 'both of this account’s devices, and nobody else’s');
	assert.equal((await listUserPushSubs('2002')).length, 0);
});

test('only a signed-in sailor can set a chime, and only for their own account', async () => {
	const out = await call('PUT', '/api/push/alerts', { body: { tag: 'run', alerts: [{ at: Date.now() + 60e3, title: 'nope' }] } });
	assert.equal(out.status, 401, 'signed out is not an account');
	// There is no way to name an account in the request at all: the
	// session is the only thing that says whose chimes these are.
	assert.equal((await call('PUT', '/api/push/alerts', { cookie: other, body: { tag: 'run', alerts: [{ at: Date.now() + 60e3, title: 'theirs' }] } })).status, 204);
	assert.equal(await countPushAlerts('2001'), 0);
	assert.equal(await countPushAlerts('2002'), 1);
	await call('DELETE', '/api/push/alerts', { cookie: other, body: { tag: 'run' } });
});

test('a run’s stops go in under one tag, and setting them again replaces them', async () => {
	const now = Date.now();
	const stops = [
		{ at: now + 60e3, title: 'Baeza should be in reach', body: 'Stop 1 of 3' },
		{ at: now + 180e3, title: 'Narvo should be in reach', body: 'Stop 2 of 3' },
		{ at: now + 300e3, title: 'The run should be done', body: 'every stop has come up' }
	];
	assert.equal((await call('PUT', '/api/push/alerts', { cookie: oni, body: { tag: 'run', alerts: stops } })).status, 204);
	assert.equal(await countPushAlerts('2001'), 3);
	// The clock restarted: the same tag, so the old schedule goes.
	assert.equal((await call('PUT', '/api/push/alerts', { cookie: oni, body: { tag: 'run', alerts: stops.slice(0, 1) } })).status, 204);
	assert.equal(await countPushAlerts('2001'), 1, 'one run, one schedule');
	// Stopping the clock takes it away entirely.
	assert.equal((await call('DELETE', '/api/push/alerts', { cookie: oni, body: { tag: 'run' } })).status, 204);
	assert.equal(await countPushAlerts('2001'), 0);
});

test('a chime is sent once and then gone, however many devices heard it', async () => {
	const now = Date.now();
	await call('PUT', '/api/push/alerts', {
		cookie: oni,
		body: { tag: 'run', alerts: [{ at: now - 1000, title: 'Baeza should be in reach', body: 'Stop 1 of 3' }, { at: now + 3600e3, title: 'later' }] }
	});
	// A moment already past was kept as the server's own "now", which is
	// a few milliseconds after this test's, so the sweep is asked from
	// here rather than from the moment the chime was written for.
	assert.equal((await duePushAlerts(Date.now())).length, 1, 'only what is due');
	// The endpoints are made up, so every send fails at the push service
	// -- which is the point: the row is done either way, or the sweep
	// would try it again for ever.
	assert.equal(await sendDueAlerts(Date.now()), 1);
	assert.equal(await countPushAlerts('2001'), 1, 'the one still to come is still to come');
	assert.equal((await duePushAlerts(now)).length, 0);
	await call('DELETE', '/api/push/alerts', { cookie: oni });
});

test('a chime is bounded: words, how far ahead, and how many at a time', () => {
	const now = 1_700_000_000_000;
	assert.equal(readAlert({ at: now + 60e3, title: 'x'.repeat(200), body: 'y'.repeat(500) }, now).title.length, 80);
	assert.equal(readAlert({ at: now + 60e3, title: 'ok', body: 'y'.repeat(500) }, now).body.length, 200);
	assert.equal(readAlert({ at: now + MAX_AHEAD_MS + 60e3, title: 'too far' }, now), null);
	assert.equal(readAlert({ at: now + 60e3, title: '   ' }, now), null, 'a chime with nothing to say is not one');
	// A moment already past is kept, at now: a tab that was asleep should
	// still say what it was going to say.
	assert.equal(readAlert({ at: now - 60e3, title: 'late' }, now).at, now);
	assert.ok(MAX_ALERTS >= 20 && MAX_ALERTS <= 100);
});

test('too many chimes at once is refused, and a tag that is not a name is refused', async () => {
	const now = Date.now();
	const many = Array.from({ length: MAX_ALERTS + 1 }, (_, i) => ({ at: now + i * 1000, title: `stop ${i}` }));
	assert.equal((await call('PUT', '/api/push/alerts', { cookie: oni, body: { tag: 'run', alerts: many } })).status, 400);
	assert.equal((await call('PUT', '/api/push/alerts', { cookie: oni, body: { tag: 'Run With Spaces', alerts: [] } })).status, 400);
	assert.equal((await call('PUT', '/api/push/alerts', { cookie: oni, body: { tag: 'run', alerts: 'not a list' } })).status, 400);
	assert.equal(await countPushAlerts('2001'), 0);
});

test('a device subscribed for its owner’s chimes is not signed up for Vell', async () => {
	const { listPushSubs } = await import('../server/db.js');
	// Vell first, the way it has always been: the row wants the reminder.
	await call('POST', '/api/push/subscribe', { cookie: oni, body: { subscription: subFor('bell'), region: 'na', vell: true } });
	assert.ok((await listPushSubs('na')).some(s => s.endpoint.endsWith('devbell')));
	// A device subscribed only so a chime can reach it asks for nothing
	// from the timetable.
	await call('POST', '/api/push/subscribe', { cookie: oni, body: { subscription: subFor('quiet'), region: 'na', vell: false } });
	const audience = (await listPushSubs('na')).map(s => s.endpoint);
	assert.ok(!audience.some(e => e.endsWith('devquiet')), 'the quiet one is left out of the Vell round');
	assert.ok((await listUserPushSubs('2001')).some(s => s.endpoint.endsWith('devquiet')), 'but its owner’s chimes still reach it');
	// A device that has never subscribed, subscribing for its chimes and
	// saying nothing about Vell, is not put on the Vell round either.
	await call('POST', '/api/push/subscribe', { cookie: oni, body: { subscription: subFor('fresh'), region: 'na' } });
	assert.ok(!(await listPushSubs('na')).some(s => s.endpoint.endsWith('devfresh')), 'a new row asks for nothing it was not asked for');
	assert.ok((await listUserPushSubs('2001')).some(s => s.endpoint.endsWith('devfresh')));
	// Saying nothing either way leaves an existing row as it was.
	await call('POST', '/api/push/subscribe', { cookie: oni, body: { subscription: subFor('quiet'), region: 'na' } });
	assert.ok(!(await listPushSubs('na')).some(e => String(e.endpoint).endsWith('devquiet')));
	await call('POST', '/api/push/subscribe', { cookie: oni, body: { subscription: subFor('bell'), region: 'na' } });
	assert.ok((await listPushSubs('na')).some(s => s.endpoint.endsWith('devbell')));
});
