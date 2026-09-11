// How many are out, against the real server and a real database.
//
// What can go wrong: a token that is not one being written to the table,
// the same browser counted twice, a browser that has gone quiet still
// counted as out, and the roll -- how many have ever opened it -- being
// confused with how many are out now.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-presence-'));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
delete process.env.DISCORD_CLIENT_ID;
delete process.env.DISCORD_CLIENT_SECRET;
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;

const app = (await import('../server.js')).default;
const { touchPresence, countPresence, upsertUser } = await import('../server/db.js');

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

const hello = token => fetch(`${base}/api/presence`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ token })
});

test('a browser says hello and is counted once, however often it says it', async () => {
	const first = await (await hello('browser-one-aaaa')).json();
	assert.equal(first.online, 1);
	const again = await (await hello('browser-one-aaaa')).json();
	// The counts are cached for a moment, so the table is the witness.
	const counts = await countPresence(Date.now() - 60_000);
	assert.equal(counts.online, 1, 'the same token twice is one browser');
	assert.equal(counts.sailors, 1);
	assert.ok(again.online >= 1);
});

test('a second browser joins the count and the roll', async () => {
	await hello('browser-two-bbbb');
	const counts = await countPresence(Date.now() - 60_000);
	assert.equal(counts.online, 2);
	assert.equal(counts.sailors, 2);
});

test('a browser that has gone quiet is off the count but stays on the roll', async () => {
	await touchPresence('browser-old-cccc', Date.now() - 60 * 60 * 1000);
	const counts = await countPresence(Date.now() - 5 * 60 * 1000);
	assert.equal(counts.online, 2, 'an hour-old hello is not someone at sea');
	assert.equal(counts.sailors, 3, 'but they have opened it, and always will have');
});

test('anything that is not a token is refused rather than stored', async () => {
	for (const bad of ['', 'short', 'a'.repeat(65), 'has spaces in it', '../../etc/passwd']) {
		const res = await hello(bad);
		assert.equal(res.status, 400, `refused: ${bad}`);
	}
	const counts = await countPresence(0);
	assert.equal(counts.sailors, 3, 'nothing new was written');
});

test('the crew is the accounts, counted apart from the browsers', async () => {
	const before = await countPresence(0);
	assert.equal(before.crew, 0, 'nobody has signed in yet');
	await upsertUser({ id: 'user-one', username: 'One', avatar: null });
	await upsertUser({ id: 'user-two', username: 'Two', avatar: null });
	await upsertUser({ id: 'user-one', username: 'One again', avatar: null });
	const after = await countPresence(0);
	assert.equal(after.crew, 2, 'signing in twice is one account');
	assert.equal(after.sailors, 3, 'and an account is not a browser on the roll');
});

test('the page is told the count is on', async () => {
	const config = await (await fetch(`${base}/api/config`)).json();
	assert.equal(config.presence, true);
	assert.equal(config.sync, false, 'and it runs without sign-in');
});
