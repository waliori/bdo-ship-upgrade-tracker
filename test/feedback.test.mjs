// The feedback box as it is actually used: a post with screenshots on
// it, and the ceilings that keep the inbox a list of things to do.
//
// Against the real server and the real routes, like sync.test.mjs. The
// ceilings are set small here -- two open, two a day, a second between
// two sends -- because what is being tested is that each one is met and
// says so, not the size of the numbers in production.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-feedback-'));
const uploads = path.join(dir, 'uploads');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.UPLOAD_DIR = uploads;
process.env.ADMIN_IDS = '3001';
process.env.MAX_OPEN_REPORTS = '2';
process.env.MAX_REPORTS_PER_DAY = '2';
process.env.REPORT_GAP_SECONDS = '1';
delete process.env.FEEDBACK_WEBHOOK_URL;

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser } = await import('../server/db.js');

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

const send = (url, bytes, type, { cookie } = {}) => fetch(base + url, {
	method: 'POST',
	headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': type },
	body: bytes
});

const json = res => res.json();
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// A real 1x1 PNG and a real 1x1 GIF: what the sniffer has to recognise,
// and small enough to keep in the file.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

await upsertUser({ id: '3001', username: 'Bosun', avatar: null });
await upsertUser({ id: '3002', username: 'Sailor', avatar: null });
await upsertUser({ id: '3003', username: 'Other', avatar: null });
await upsertUser({ id: '3004', username: 'Eager', avatar: null });
const bosun = cookieFor('3001');
const sailor = cookieFor('3002');
const other = cookieFor('3003');
const eager = cookieFor('3004');

/* ------------------------------------------------------------------ *
 * What the box will take
 * ------------------------------------------------------------------ */

test('the box states its own ceilings, and needs an account to ask', async () => {
	assert.equal((await call('GET', '/api/feedback/mine')).status, 401);
	const mine = await json(await call('GET', '/api/feedback/mine', { cookie: sailor }));
	assert.equal(mine.open, 0);
	assert.equal(mine.limits.open, 2);
	assert.ok(mine.limits.images >= 1, 'this deployment can take screenshots');
	assert.equal(mine.limits.exempt, false);
	assert.deepEqual(mine.files, []);
	// The operator is outside the ceilings, and is told so.
	assert.equal((await json(await call('GET', '/api/feedback/mine', { cookie: bosun }))).limits.exempt, true);
});

/* ------------------------------------------------------------------ *
 * The pictures
 * ------------------------------------------------------------------ */

test('a screenshot is read from its bytes, not from what it claims to be', async () => {
	assert.equal((await send('/api/feedback/image', PNG, 'image/png')).status, 401);

	const up = await send('/api/feedback/image?name=shot.png', PNG, 'image/png', { cookie: sailor });
	assert.equal(up.status, 201);
	const file = await json(up);
	assert.equal(file.mime, 'image/png');
	assert.equal(file.width, 1);
	assert.equal(file.height, 1);
	assert.equal(file.name, 'shot.png');

	// A GIF passes through whole, because a canvas would flatten it.
	assert.equal((await send('/api/feedback/image', GIF, 'image/gif', { cookie: sailor })).status, 201);

	// Not an image at all, however it is labelled.
	assert.equal((await send('/api/feedback/image', Buffer.from('<html>hello</html>'), 'image/png', { cookie: sailor })).status, 415);
	// And a type the route does not take is not read at all.
	assert.equal((await send('/api/feedback/image', Buffer.from('hello'), 'text/html', { cookie: sailor })).status, 415);
});

test('a screenshot is served to the account that sent it, and to admins', async () => {
	const file = await json(await send('/api/feedback/image?name=map.png', PNG, 'image/png', { cookie: sailor }));

	const mine = await fetch(`${base}/api/feedback/file/${file.id}`, { headers: { Cookie: sailor } });
	assert.equal(mine.status, 200);
	assert.equal(mine.headers.get('content-type'), 'image/png');
	assert.equal(Buffer.from(await mine.arrayBuffer()).equals(PNG), true);

	assert.equal((await fetch(`${base}/api/feedback/file/${file.id}`, { headers: { Cookie: bosun } })).status, 200);
	// Somebody else's screenshot is not merely forbidden, it is not there.
	assert.equal((await fetch(`${base}/api/feedback/file/${file.id}`, { headers: { Cookie: other } })).status, 404);
	assert.equal((await fetch(`${base}/api/feedback/file/${file.id}`)).status, 404);

	// Taking one off again is the sender's to do, and nobody else's.
	assert.equal((await call('DELETE', `/api/feedback/image/${file.id}`, { cookie: other })).status, 404);
	assert.equal((await call('DELETE', `/api/feedback/image/${file.id}`, { cookie: sailor })).status, 200);
	assert.equal((await fetch(`${base}/api/feedback/file/${file.id}`, { headers: { Cookie: sailor } })).status, 404);
});

test('a post carries its own pictures and nobody else’s', async () => {
	const ours = await json(await send('/api/feedback/image?name=here.png', PNG, 'image/png', { cookie: sailor }));
	const theirs = await json(await send('/api/feedback/image', PNG, 'image/png', { cookie: other }));

	// Everything this account is still holding comes back to the dialog,
	// so a draft picked up again finds its pictures where it left them.
	const mine = await json(await call('GET', '/api/feedback/mine', { cookie: sailor }));
	assert.ok(mine.files.some(f => f.id === ours.id));

	const post = [
		'## The chart is upside down',
		'',
		'1. open the **Map**',
		'2. look at it',
		'',
		`![what it looks like](attachment:${ours.id})`
	].join('\n');
	const sent = await call('POST', '/api/feedback', {
		cookie: sailor,
		body: { kind: 'bug', text: post, format: 'md', page: 'map', version: '1.1', files: [ours.id, theirs.id], username: 'Sailor' }
	});
	assert.equal(sent.status, 201);

	// Open first, newest first: the post just sent is at the head of it.
	const { entries } = await json(await call('GET', '/api/feedback', { cookie: bosun }));
	const entry = entries[0];
	assert.equal(entry.format, 'md');
	assert.equal(entry.text, post);
	assert.equal(entry.files.length, 1, 'the borrowed id is not attached');
	assert.equal(entry.files[0].id, ours.id);
	assert.equal(entry.files[0].width, 1);

	// The borrowed one is untouched: still its owner's, still unsent.
	assert.equal((await call('DELETE', `/api/feedback/image/${theirs.id}`, { cookie: other })).status, 200);
	// And the one that was sent can no longer be taken off on its own.
	assert.equal((await call('DELETE', `/api/feedback/image/${ours.id}`, { cookie: sailor })).status, 409);
});

/* ------------------------------------------------------------------ *
 * How often, and how many
 * ------------------------------------------------------------------ */

test('one at a time, so many open, so many in a day', async () => {
	const one = { kind: 'idea', text: 'A thing the app might do', format: 'md' };
	assert.equal((await call('POST', '/api/feedback', { cookie: eager, body: one })).status, 201);

	const again = await call('POST', '/api/feedback', { cookie: eager, body: one });
	assert.equal(again.status, 429);
	assert.ok(again.headers.get('retry-after'), 'and it says when to come back');

	await wait(1100);
	assert.equal((await call('POST', '/api/feedback', { cookie: eager, body: one })).status, 201);

	await wait(1100);
	const third = await call('POST', '/api/feedback', { cookie: eager, body: one });
	assert.equal(third.status, 429);
	assert.match((await json(third)).error, /waiting on an answer/);

	// Answered, and the day's ceiling is the one still standing.
	const { entries } = await json(await call('GET', '/api/feedback', { cookie: bosun }));
	for (const entry of entries.filter(e => e.userId === '3004')) {
		await call('POST', `/api/feedback/${entry.id}/status`, { cookie: bosun, body: { status: 'done' } });
	}
	const fourth = await call('POST', '/api/feedback', { cookie: eager, body: one });
	assert.equal(fourth.status, 429);
	assert.match((await json(fourth)).error, /in a day/);
});

test('the operator is outside the ceilings', async () => {
	const one = { kind: 'other', text: 'Testing the box itself', format: 'md' };
	for (let i = 0; i < 3; i++) {
		assert.equal((await call('POST', '/api/feedback', { cookie: bosun, body: one })).status, 201);
	}
});

/* ------------------------------------------------------------------ *
 * The inbox
 * ------------------------------------------------------------------ */

test('an entry thrown away takes its pictures off the disk with it', async () => {
	const file = await json(await send('/api/feedback/image?name=gone.png', PNG, 'image/png', { cookie: sailor }));
	const on = path.join(uploads, `${file.id}.png`);
	assert.equal(fs.existsSync(on), true);

	await wait(1100);
	const sent = await call('POST', '/api/feedback', {
		cookie: sailor,
		body: { kind: 'other', text: 'One to throw away', format: 'md', files: [file.id] }
	});
	assert.equal(sent.status, 201);
	const { id } = await json(sent);

	assert.equal((await call('DELETE', `/api/feedback/${id}`, { cookie: sailor })).status, 403);
	assert.equal((await call('DELETE', `/api/feedback/${id}`, { cookie: bosun })).status, 200);
	assert.equal(fs.existsSync(on), false, 'the bytes are gone too');

	const { entries } = await json(await call('GET', '/api/feedback', { cookie: bosun }));
	assert.equal(entries.some(e => e.id === id), false);
});
