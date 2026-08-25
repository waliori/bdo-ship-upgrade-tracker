// With nothing configured, the tracker is what it always was.
//
// This is the deployment most people get: a static site with no Discord
// app and no database. It must serve the page, tell the client there is
// no sync to offer, and not expose a single sync route -- a sign-in
// button that 404s is worse than no button.
//
// Node runs each test file in its own process, which is what lets this
// file boot the server with a clean environment while sync.test.mjs
// boots it with a configured one.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
for (const name of [
	'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET',
	'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'PUBLIC_URL'
]) delete process.env[name];

const app = (await import('../server.js')).default;
const { syncEnabled } = await import('../server/config.js');

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

test('sync stays off when it has not been configured', () => {
	assert.equal(syncEnabled, false);
});

test('the page and its assets are served', async () => {
	assert.equal((await fetch(`${base}/`)).status, 200);
	assert.equal((await fetch(`${base}/js/planner.js`)).status, 200);
	assert.equal((await fetch(`${base}/icon_mapping.json`)).status, 200);
});

test('the client is told there is no sync', async () => {
	const res = await fetch(`${base}/api/config`);
	assert.deepEqual(await res.json(), { sync: false });
});

test('no sync routes exist at all', async () => {
	for (const [method, url] of [
		['GET', '/auth/discord'],
		['GET', '/auth/discord/callback'],
		['GET', '/api/me'],
		['GET', '/api/state'],
		['PUT', '/api/state']
	]) {
		const res = await fetch(base + url, { method, redirect: 'manual' });
		assert.equal(res.status, 404, `${method} ${url}`);
	}
});

test('the repository is not served alongside the app', async () => {
	for (const url of ['/package.json', '/Dockerfile', '/server.js', '/server/config.js']) {
		assert.equal((await fetch(base + url)).status, 404, url);
	}
});
