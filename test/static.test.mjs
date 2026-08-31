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
import fs from 'node:fs';
import path from 'node:path';

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

test('the heavy files travel compressed', async () => {
	// Asked over node:http with an explicit Accept-Encoding, because
	// fetch decompresses transparently and hides the evidence.
	const { encoding } = await new Promise((resolve, reject) => {
		const url = new URL(base + '/js/all_barter.json');
		http.get({
			host: url.hostname, port: url.port, path: url.pathname,
			headers: { 'Accept-Encoding': 'gzip' }
		}, res => {
			res.resume();
			res.on('end', () => resolve({ encoding: res.headers['content-encoding'] }));
		}).on('error', reject);
	});
	assert.equal(encoding, 'gzip', 'a megabyte of barter data went over the wire raw');
});

test('the offline shell is served, and never stale', async () => {
	// The service worker steers every cache decision the page makes, so
	// a stale copy of it would defeat the rules it carries -- it has to
	// revalidate like the modules do. Same for the manifest, and for
	// /index.html, which is the same page '/' already refuses to let go
	// stale.
	for (const url of ['/sw.js', '/manifest.webmanifest', '/index.html']) {
		const res = await fetch(base + url);
		assert.equal(res.status, 200, url);
		assert.match(res.headers.get('cache-control') || '', /no-cache/, url);
	}
	const manifest = await (await fetch(base + '/manifest.webmanifest')).json();
	for (const icon of manifest.icons) {
		assert.equal((await fetch(`${base}/${icon.src}`)).status, 200, icon.src);
	}
	const page = await (await fetch(base + '/')).text();
	assert.match(page, /rel="manifest"/, 'the page never names its manifest');
});

test('every window the field guide shows is served, and shipped', async () => {
	// Two failure modes, both already seen: the server not whitelisting
	// the guide directory, and the Docker image not copying it. The
	// first shows here as a 404; the second is caught by checking the
	// Dockerfile carries every directory the guide depends on.
	const fs = await import('node:fs/promises');
	const guideSrc = await fs.readFile(new URL('../js/guide.js', import.meta.url), 'utf8');
	const imgs = [...guideSrc.matchAll(/guide\/[a-z-]+\.webp/g)].map(m => m[0]);
	assert.ok(imgs.length >= 6, 'the guide lost its pictures');
	for (const img of new Set(imgs)) {
		assert.equal((await fetch(`${base}/${img}`)).status, 200, `${img} is not served`);
	}
	const dockerfile = await fs.readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
	assert.match(dockerfile, /COPY guide \.\/guide/, 'the Docker image would ship without the guide');
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
		['style-src', 'https://fonts.googleapis.com'],
		['font-src', 'https://fonts.gstatic.com'],
		['img-src', 'https://cdn.discordapp.com']         // the signed-in chip
	]) {
		assert.ok(directive(name).includes(origin), `${name} must admit ${origin} — got "${directive(name)}"`);
	}

	// And nothing else may run script. The guided tour's library is
	// vendored precisely so that no CDN needs to be trusted with
	// script-src -- this holds the door shut behind it.
	assert.equal(directive('script-src'), "script-src 'self'");
});

test('the guided tour library is served from here, not a CDN', async () => {
	assert.equal((await fetch(`${base}/js/driver.iife.js`)).status, 200);
	assert.equal((await fetch(`${base}/css/driver.css`)).status, 200);
	const page = await (await fetch(`${base}/`)).text();
	assert.doesNotMatch(page, /jsdelivr|unpkg|cdnjs/, 'the page still names a script CDN');
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

test('no action is worn by both a button and a select', () => {
	// Buttons are answered on click and selects on change, so one name
	// on both means one of them is dead: the control fires an event
	// nothing is listening for, and clicking it does nothing at all --
	// no toast, no error, no sign that anything happened.
	const dir = new URL('../js/', import.meta.url);
	const files = fs.readdirSync(dir)
		.filter(f => f.endsWith('.js') && f !== 'driver.iife.js')
		.map(f => path.join(dir.pathname, f))
		.concat(path.join(new URL('../', import.meta.url).pathname, 'index.html'));

	const on = { button: new Map(), picker: new Map() };
	for (const file of files) {
		const src = fs.readFileSync(file, 'utf8');
		for (const m of src.matchAll(/<(button|select|input)\b[^>]*?data-act="([a-z0-9-]+)"/g)) {
			const kind = m[1] === 'button' ? 'button' : 'picker';
			if (!on[kind].has(m[2])) on[kind].set(m[2], path.basename(file));
		}
	}
	const shared = [...on.button.keys()].filter(a => on.picker.has(a));
	assert.deepEqual(shared, [], shared.map(a =>
		`"${a}" is a button in ${on.button.get(a)} and a select in ${on.picker.get(a)}`).join('; '));
});

test('the offline shell precaches every module the app imports', () => {
	const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
	const shell = new Set([...sw.matchAll(/'(\/js\/[^']+\.js)'/g)].map(m => m[1]));
	const dir = new URL('../js/', import.meta.url);
	// Walk the import graph from the entry point rather than listing the
	// folder: a module nothing imports is not the shell's problem.
	const seen = new Set();
	const walk = name => {
		if (seen.has(name)) return;
		seen.add(name);
		const src = fs.readFileSync(new URL(name, dir), 'utf8');
		for (const m of src.matchAll(/import[^'"]*['"]\.\/([^'"]+)['"]/g)) walk(m[1]);
	};
	walk('boot.js');
	const missing = [...seen].filter(n => !shell.has(`/js/${n}`));
	assert.deepEqual(missing, [], `not precached: ${missing.join(', ')}`);
});
