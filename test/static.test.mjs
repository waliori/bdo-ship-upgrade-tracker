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
import http from 'node:http';

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

test('the modules are never served stale against each other', async () => {
	// There is no build step, so a module keeps its filename while its
	// contents change. A cache that holds one file from before a deploy
	// and another from after it produces a page that dies on an import
	// that no longer exists -- which is what a max-age on js/ once did.
	for (const url of ['/js/planner.js', '/js/recipes.js', '/js/ui.js', '/css/tracker.css', '/icon_mapping.json']) {
		const res = await fetch(base + url);
		assert.equal(res.status, 200, url);
		const cache = res.headers.get('cache-control') || '';
		assert.ok(/no-cache|no-store|max-age=0/.test(cache),
			`${url} must revalidate, got "${cache}"`);
	}
});

test('revalidating a module costs nothing when it has not changed', async () => {
	// no-cache stores and revalidates rather than refetching, so the
	// correctness above is not paid for on every page load.
	//
	// Asked over node:http rather than fetch, because undici attaches
	// `cache-control: no-cache` to every request it makes, and a server
	// is right to answer that with the whole file rather than a 304. No
	// browser sends it unless the reader forces a reload.
	const first = await fetch(base + '/js/recipes.js');
	const etag = first.headers.get('etag');
	assert.ok(etag, 'a module is served with an ETag to revalidate against');

	const { statusCode, bytes } = await new Promise((resolve, reject) => {
		const url = new URL(base + '/js/recipes.js');
		http.get({
			host: url.hostname, port: url.port, path: url.pathname,
			headers: { 'If-None-Match': etag }
		}, res => {
			let bytes = 0;
			res.on('data', chunk => { bytes += chunk.length; });
			res.on('end', () => resolve({ statusCode: res.statusCode, bytes }));
		}).on('error', reject);
	});

	assert.equal(statusCode, 304);
	assert.equal(bytes, 0);
});

test('an icon may be cached, but not forever', async () => {
	// Icons are addressed by the game's item id, so a name really does
	// keep its contents -- but `immutable` would make a wrong one
	// unfixable, and one has already needed fixing.
	const res = await fetch(base + '/icons/00049778.webp');
	assert.equal(res.status, 200);
	const cache = res.headers.get('cache-control') || '';
	assert.match(cache, /max-age=\d+/);
	assert.doesNotMatch(cache, /immutable/);
});

test('the CSP admits every origin the page actually loads from', async () => {
	// The avatar was blocked in every deployment because img-src named
	// nothing but 'self' -- the policy was tightened without checking what
	// the client fetches. Links out to BDOCodex need no entry: navigating
	// away is not a fetch, and CSP does not govern it.
	const csp = (await fetch(base + '/')).headers.get('content-security-policy');
	const directive = name => (csp.split(';').find(d => d.trim().startsWith(name)) || '').trim();

	for (const [name, origin] of [
		['script-src', 'https://cdn.jsdelivr.net'],       // the guided tour
		['style-src', 'https://cdn.jsdelivr.net'],        // and its stylesheet
		['style-src', 'https://fonts.googleapis.com'],
		['font-src', 'https://fonts.gstatic.com'],
		['img-src', 'https://cdn.discordapp.com']         // the signed-in chip
	]) {
		assert.ok(directive(name).includes(origin), `${name} must admit ${origin} — got "${directive(name)}"`);
	}
});

test('the avatar the client builds is an origin the CSP allows', async () => {
	// Tied to the source rather than to a copy of it, so moving the avatar
	// to another host fails here rather than in a browser console.
	const fs = await import('node:fs/promises');
	const sync = await fs.readFile(new URL('../js/sync.js', import.meta.url), 'utf8');
	const hosts = [...sync.matchAll(/https:\/\/([a-z0-9.-]+)/g)].map(m => m[1]);
	assert.ok(hosts.length, 'sync.js fetches something external');

	const csp = (await fetch(base + '/')).headers.get('content-security-policy');
	for (const host of new Set(hosts)) {
		assert.ok(csp.includes(host), `${host} is fetched by sync.js but absent from the CSP`);
	}
});
