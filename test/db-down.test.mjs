// A database that is configured but cannot be reached. The page must
// still be served -- the tracker works without one -- and the
// healthcheck must say so with a 503, which is the one signal a
// supervisor gets that sync is down while the site is up.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.LOG_REQUESTS = '0';
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
// A file in a directory that does not exist: libSQL cannot open it, and
// fails at once rather than after a network timeout.
process.env.TURSO_DATABASE_URL = 'file:/nonexistent/sail/tracker.db';
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';

const realWarn = console.warn;
console.warn = () => {};   // the boot-time "tables not ready yet" is expected here
const app = (await import('../server.js')).default;
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => { console.warn = realWarn; server.close(); });

test('the page is served while the database is not', async () => {
	assert.equal((await fetch(`${base}/`)).status, 200);
	assert.deepEqual(await (await fetch(`${base}/api/config`)).json(), { sync: true, push: false, feedback: true, community: true, presence: true });
});

test('the healthcheck reports the database down with a 503', async () => {
	const res = await fetch(`${base}/healthz`);
	assert.equal(res.status, 503);
	const body = await res.json();
	assert.equal(body.ok, false);
	assert.equal(body.db, 'down');
});
