// The sync layer, exercised against a real libSQL file.
//
// Everything here runs the actual server code -- the same routes, the
// same session signing, the same database calls -- against a throwaway
// file database. Only Discord is absent, because the one thing that
// cannot be tested without it is the round trip to Discord itself; the
// session it would have produced is minted here with the server's own
// signing code, so every route past the callback is the real path.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-sync-'));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
// No coalescing window, so a flush is genuinely in the air by the time
// the deletion test reaches it -- the race it exists to cover.
process.env.FLUSH_DELAY_MS = '0';

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser } = await import('../server/db.js');

/** A signed cookie for `id`, produced by the server's own session code. */
function cookieFor(id) {
	const headers = [];
	startSession({ append: (name, value) => headers.push(value) }, id);
	return headers.map(h => h.split(';')[0]).join('; ');
}

// One listener for the whole file, on a port the OS picks.
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

const call = (method, url, { cookie, body, headers } = {}) => fetch(base + url, {
	method,
	headers: {
		...(cookie ? { Cookie: cookie } : {}),
		...(body ? { 'Content-Type': 'application/json' } : {}),
		...headers
	},
	body: body ? JSON.stringify(body) : undefined,
	redirect: 'manual'
});

const SAVE = {
	stock: { 'Tidal Black Stone': 400, 'Sangpyeong Coin': 3000 },
	targets: [{ id: 't1', item: 'Panokseon', qty: 1, active: true, note: '' }],
	strategy: { 'Finely Polished Pine Plywood': 'craft' }
};

await upsertUser({ id: '1001', username: 'Sailor', avatar: null });
await upsertUser({ id: '1002', username: 'Other', avatar: null });
const alice = cookieFor('1001');
const bob = cookieFor('1002');

test('the page is still served', async () => {
	const res = await call('GET', '/');
	assert.equal(res.status, 200);
	assert.match(await res.text(), /Ship Upgrade Tracker/);
});

test('the client is told sync is available', async () => {
	const res = await call('GET', '/api/config');
	assert.deepEqual(await res.json(), { sync: true, push: false, feedback: true, community: true });
});

test('being signed out is an answer, not an error', async () => {
	const res = await call('GET', '/api/me');
	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), { signedIn: false });
});

test('a session names its account', async () => {
	const body = await (await call('GET', '/api/me', { cookie: alice })).json();
	assert.equal(body.signedIn, true);
	assert.equal(body.user.username, 'Sailor');
});

test('a forged session is refused', async () => {
	// Same shape, wrong signature.
	const forged = alice.replace(/\.[^.]+$/, '.notarealsignature');
	const body = await (await call('GET', '/api/me', { cookie: forged })).json();
	assert.equal(body.signedIn, false);
});

test('state needs an account', async () => {
	assert.equal((await call('GET', '/api/state')).status, 401);
	assert.equal((await call('PUT', '/api/state', { body: { rev: 0, data: SAVE } })).status, 401);
});

test('an account that has never synced reads as revision 0', async () => {
	const body = await (await call('GET', '/api/state', { cookie: alice })).json();
	assert.deepEqual(body, { rev: 0, data: null, updatedAt: null, device: null });
});

test('a first push creates revision 1, and reads back', async () => {
	const put = await call('PUT', '/api/state', { cookie: alice, body: { rev: 0, data: SAVE, device: 'desktop' } });
	assert.equal(put.status, 200);
	assert.equal((await put.json()).rev, 1);

	const got = await (await call('GET', '/api/state', { cookie: alice })).json();
	assert.equal(got.rev, 1);
	assert.equal(got.device, 'desktop');
	assert.deepEqual(got.data, SAVE);
});

test('a push based on the current revision moves it on', async () => {
	const next = { ...SAVE, stock: { ...SAVE.stock, 'Tidal Black Stone': 500 } };
	const put = await call('PUT', '/api/state', { cookie: alice, body: { rev: 1, data: next } });
	assert.equal((await put.json()).rev, 2);
});

test('a stale push is refused, and hands back what beat it', async () => {
	const stale = { ...SAVE, stock: { 'Tidal Black Stone': 1 } };
	const res = await call('PUT', '/api/state', { cookie: alice, body: { rev: 1, data: stale } });
	assert.equal(res.status, 409);

	const body = await res.json();
	assert.equal(body.rev, 2);
	// The loser gets the winner's save, which is what lets the browser
	// offer a choice instead of just reporting a failure.
	assert.equal(body.data.stock['Tidal Black Stone'], 500);

	// And the refusal really did not write.
	const got = await (await call('GET', '/api/state', { cookie: alice })).json();
	assert.equal(got.rev, 2);
	assert.equal(got.data.stock['Tidal Black Stone'], 500);
});

test('a first push cannot overwrite an existing save', async () => {
	const res = await call('PUT', '/api/state', { cookie: alice, body: { rev: 0, data: SAVE } });
	assert.equal(res.status, 409);
});

test('one account cannot see or touch another', async () => {
	const got = await (await call('GET', '/api/state', { cookie: bob })).json();
	assert.equal(got.rev, 0);
	assert.equal(got.data, null);

	await call('PUT', '/api/state', { cookie: bob, body: { rev: 0, data: { stock: { Silver: 1 } } } });
	const alicesStill = await (await call('GET', '/api/state', { cookie: alice })).json();
	assert.equal(alicesStill.rev, 2);
	assert.equal(alicesStill.data.stock['Tidal Black Stone'], 500);
});

test('rubbish is refused before it reaches the database', async () => {
	const cases = [
		[{ rev: 2, data: null }, 400],
		[{ rev: 2, data: { stock: [] } }, 400],
		[{ rev: 2, data: { stock: {}, targets: {} } }, 400],
		[{ data: SAVE }, 400],
		[{ rev: -1, data: SAVE }, 400],
		[{ rev: 1.5, data: SAVE }, 400]
	];
	for (const [body, expected] of cases) {
		const res = await call('PUT', '/api/state', { cookie: alice, body });
		assert.equal(res.status, expected, JSON.stringify(body));
	}
});

test('an oversized save is refused, without a 500', async () => {
	const huge = { stock: {} };
	for (let i = 0; i < 120000; i++) huge.stock[`Item number ${i}`] = i;
	const { rev } = await (await call('GET', '/api/state', { cookie: alice })).json();
	const res = await call('PUT', '/api/state', { cookie: alice, body: { rev, data: huge } });
	assert.equal(res.status, 413);

	// And the refusal left the stored save alone.
	const after = await (await call('GET', '/api/state', { cookie: alice })).json();
	assert.equal(after.rev, rev);
});

test('a body that is not JSON is a 400, not a crash', async () => {
	const res = await fetch(base + '/api/state', {
		method: 'PUT',
		headers: { Cookie: alice, 'Content-Type': 'application/json' },
		body: '{ this is not json'
	});
	assert.equal(res.status, 400);
});

test('sign-in redirects to Discord, carrying a state it can check later', async () => {
	const res = await call('GET', '/auth/discord?to=/inventory');
	assert.equal(res.status, 302);
	const url = new URL(res.headers.get('location'));
	assert.equal(url.origin + url.pathname, 'https://discord.com/oauth2/authorize');
	assert.equal(url.searchParams.get('client_id'), 'test-client');
	assert.equal(url.searchParams.get('scope'), 'identify');
	assert.ok(url.searchParams.get('state'));
	assert.ok(res.headers.getSetCookie().some(c => c.startsWith('sail_oauth=')));
});

test('a callback with no matching state cookie is refused', async () => {
	const res = await call('GET', '/auth/discord/callback?code=abc&state=made-up');
	assert.equal(res.status, 302);
	assert.equal(res.headers.get('location'), '/?signin=expired');
});

test('a cancelled sign-in comes back as cancelled', async () => {
	const res = await call('GET', '/auth/discord/callback?error=access_denied');
	assert.equal(res.headers.get('location'), '/?signin=cancelled');
});

test('deleting the account takes the save with it', async () => {
	const res = await call('DELETE', '/api/account', { cookie: bob });
	assert.equal(res.status, 200);
	// The session is cleared, so the old cookie no longer names anyone.
	const me = await (await call('GET', '/api/me', { cookie: bob })).json();
	assert.equal(me.signedIn, false);
});

/* ------------------------------------------------------------------ *
 * Fixes from the review of this branch
 * ------------------------------------------------------------------ */

test('deleting an account leaves nothing behind', async () => {
	const { writeSaveFor, forget } = await import('../server/saves.js');
	const { getSave, deleteAccount, upsertUser: addUser } = await import('../server/db.js');

	await addUser({ id: '1003', username: 'Doomed', avatar: null });
	await writeSaveFor('1003', JSON.stringify(SAVE), 0, 'desk');
	await new Promise(resolve => setTimeout(resolve, 0));

	// forget() is awaited, and only then is the row dropped. Against a
	// local file the write settles in well under a millisecond, so this
	// cannot reproduce the case it was written for -- a flush still out
	// over the network when the delete arrives. What it does hold is the
	// ordering: forget resolves before deleteAccount is called, and
	// nothing reappears afterwards.
	await forget('1003');
	await deleteAccount('1003');

	await new Promise(resolve => setTimeout(resolve, 600));
	assert.equal(await getSave('1003'), null, 'the save came back after deletion');
});

test('a device still signed in cannot resurrect a deleted account', async () => {
	const { getSave, upsertUser: addUser } = await import('../server/db.js');
	await addUser({ id: '1005', username: 'Straggler', avatar: null });
	// Two devices, one account. Sessions are stateless cookies, so
	// deleting the account on one cannot invalidate the other's.
	const desk = cookieFor('1005');
	const phone = cookieFor('1005');

	await call('PUT', '/api/state', { cookie: desk, body: { rev: 0, data: SAVE, device: 'desk' } });
	assert.equal((await call('DELETE', '/api/account', { cookie: desk })).status, 200);

	// The phone finds no save, concludes it has never synced, and pushes
	// revision 0 -- the exact shape that used to re-create the row.
	const res = await call('PUT', '/api/state', { cookie: phone, body: { rev: 0, data: SAVE, device: 'phone' } });
	assert.equal(res.status, 410);
	// It is told to sign out as well as refused.
	assert.ok(res.headers.getSetCookie().some(c => c.startsWith('sail_session=;')));

	// And nothing came back, not even after any flush had time to land.
	await new Promise(resolve => setTimeout(resolve, 100));
	assert.equal(await getSave('1005'), null, 'the save was re-created after deletion');
});

test('the sign-in hand-off cannot be steered off the site', async () => {
	const { beginOAuth, finishOAuth } = await import('../server/session.js');

	// The real flow, minus Discord: mint the state and its cookie, then
	// present both to the callback check as a browser would.
	const roundTrip = to => {
		const jar = [];
		const state = beginOAuth({ append: (_name, value) => jar.push(value) }, to);
		const cookie = jar.map(c => c.split(';')[0]).join('; ');
		return finishOAuth({ headers: { cookie } }, { append: () => {} }, state);
	};

	assert.equal(roundTrip('/inventory?tab=barter').returnTo, '/inventory?tab=barter');

	for (const evil of [
		'https://evil.example',
		'//evil.example',
		// Browsers read `\` as `/` in a Location, so a single slash and a
		// backslash is `//` in everything but the check.
		'/\\evil.example',
		'/\\/evil.example',
		'/fine\r\nSet-Cookie: stolen=1'
	]) {
		assert.equal(roundTrip(evil).returnTo, '/', evil);
	}
});

test('an explicit zero in the environment is a zero, not the default', async () => {
	// FLUSH_DELAY_MS is '0' at the top of this file, and the deletion
	// test above leans on it: a flush must be in the air immediately,
	// not after a default 400ms this process never asked for.
	const { config } = await import('../server/config.js');
	assert.equal(config.flushDelayMs, 0);
});

test('a database that refuses a save is not mistaken for one that is unreachable', async () => {
	const { transient } = await import('../server/db.js');

	// Weather: worth retrying, and the reason a save is held in memory.
	assert.equal(transient(Object.assign(new Error('fetch failed'), { code: 'ETIMEDOUT' })), true);
	assert.equal(transient(new Error('socket hang up')), true);

	// A verdict, not weather. Sending it again unchanged gets the same
	// answer, so the retry loop must not treat it as a bad minute.
	assert.equal(transient(new Error('SQLITE_CONSTRAINT: FOREIGN KEY constraint failed')), false);
	assert.equal(transient(new Error('no such column: payload')), false);
});

test('an account cannot push without limit, and is told to come back', async () => {
	const { upsertUser: addUser } = await import('../server/db.js');
	await addUser({ id: '1004', username: 'Eager', avatar: null });
	const eager = cookieFor('1004');

	// The configured ceiling is well above anything the client does, so
	// reaching it takes deliberate effort -- which is the point.
	const max = (await import('../server/config.js')).config.maxPushesPerMinute;
	let refused = null;
	for (let i = 0; i <= max && !refused; i++) {
		const res = await call('PUT', '/api/state', {
			cookie: eager,
			body: { rev: i, data: SAVE, device: 'desk' }
		});
		if (res.status === 429) refused = res;
	}
	assert.ok(refused, `no push was refused within ${max + 1} attempts`);
	assert.ok(Number(refused.headers.get('retry-after')) > 0, 'no Retry-After to wait on');
});

test('nothing in the API may be cached, whoever is in front of it', async () => {
	// A save is told apart from another account's only by a cookie, so a
	// proxy told to cache generously must still be refused.
	for (const url of ['/api/state', '/api/me']) {
		const res = await call('GET', url, { cookie: alice });
		assert.equal(res.headers.get('cache-control'), 'no-store', url);
		// Cookie must be in there; compression is allowed to append
		// Accept-Encoding, which only makes the caching story stricter.
		assert.match(res.headers.get('vary'), /\bCookie\b/, url);
	}
});

test('every response carries the security headers', async () => {
	const res = await call('GET', '/');
	assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
	assert.doesNotMatch(res.headers.get('content-security-policy'), /script-src[^;]*unsafe-inline/);
	assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
	assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

/* ------------------------------------------------------------------ *
 * the barter profile, added to the save after people were using it
 * ------------------------------------------------------------------ */

test('a save with no profile is stored with no profile', async () => {
	// The field has to be invisible to anyone who has not set one. If the
	// server helpfully added an empty object, every stored save would
	// change shape on its owner's next push, and every already-signed-in
	// browser would find its own copy no longer matching what is stored.
	//
	// Bob deleted his account above, and a deleted account may no longer
	// push. Signing back in re-creates the user row, which upsertUser
	// stands in for here.
	await upsertUser({ id: '1002', username: 'Other', avatar: null });
	await call('PUT', '/api/state', { cookie: bob, body: { rev: 0, data: SAVE } });
	const got = await (await call('GET', '/api/state', { cookie: bob })).json();
	assert.deepEqual(got.data, SAVE);
	assert.ok(!('profile' in got.data));
});

test('a profile survives the round trip', async () => {
	const withProfile = { ...SAVE, profile: { barterCount: 2000, valuePack: true } };
	const put = await call('PUT', '/api/state', { cookie: bob, body: { rev: 1, data: withProfile } });
	assert.equal(put.status, 200);

	const got = await (await call('GET', '/api/state', { cookie: bob })).json();
	assert.deepEqual(got.data.profile, { barterCount: 2000, valuePack: true });
	// And the rest of the save is untouched by its arrival.
	assert.deepEqual(got.data.stock, SAVE.stock);
});

test('a profile that is not an object is refused', async () => {
	for (const bad of [[], 'yes', 3]) {
		const res = await call('PUT', '/api/state', {
			cookie: bob,
			body: { rev: 2, data: { ...SAVE, profile: bad } }
		});
		assert.equal(res.status, 400, `profile ${JSON.stringify(bad)} should be refused`);
	}
});

/* ------------------------------------------------------------------ *
 * Operations: where a change may come from, and whether it is up
 * ------------------------------------------------------------------ */

test('a change from another site is refused, whatever cookie it carries', async () => {
	// No PUBLIC_URL in this file, so the request's own Host is the site.
	const { rev } = await (await call('GET', '/api/state', { cookie: alice })).json();
	const from = origin => call('PUT', '/api/state', { cookie: alice, body: { rev, data: SAVE }, headers: { Origin: origin } });
	assert.equal((await from('https://evil.example')).status, 403);
	assert.equal((await from('null')).status, 403);
	// A browser that names no origin but says the request crossed sites.
	const crossed = await call('POST', '/auth/logout', { cookie: alice, headers: { 'Sec-Fetch-Site': 'cross-site' } });
	assert.equal(crossed.status, 403);

	// The same request from this site goes through as before.
	const ours = await from(base);
	assert.equal(ours.status, 200);
	const same = await call('POST', '/auth/logout', { cookie: alice, headers: { 'Sec-Fetch-Site': 'same-origin' } });
	assert.equal(same.status, 200);
	// And a refusal never reads the body: the stored save did not move.
	const after = await (await call('GET', '/api/state', { cookie: alice })).json();
	assert.equal(after.rev, rev + 1);
});

test('a read is never asked where it came from', async () => {
	const res = await call('GET', '/api/me', { cookie: alice, headers: { Origin: 'https://evil.example' } });
	assert.equal(res.status, 200);
});

test('the healthcheck says the database is answering, and what memory holds', async () => {
	const res = await call('GET', '/healthz');
	assert.equal(res.status, 200);
	assert.equal(res.headers.get('cache-control'), 'no-store');
	const body = await res.json();
	assert.equal(body.ok, true);
	assert.equal(body.db, 'ok');
	assert.equal(typeof body.dirty, 'number');
	assert.equal(typeof body.queued, 'number');
	assert.equal(typeof body.uptime, 'number');
	assert.ok(body.version, 'names the build');
	// Every push above was written out, and counted on the way.
	assert.ok(body.counters.savesFlushed > 0, 'no save was ever flushed');
	assert.ok(body.counters.requests['2xx'] > 0);
	assert.ok(body.counters.requests['4xx'] > 0, 'the refusals above were not counted');
});

test('the schema is versioned, and running the migrations again changes nothing', async () => {
	const { db, migrate, applyMigrations, MIGRATIONS } = await import('../server/db.js');
	const newest = MIGRATIONS[MIGRATIONS.length - 1].version;
	assert.equal(await migrate(), newest);
	const versions = async () => (await db().execute('SELECT version FROM schema_version ORDER BY version')).rows.map(r => Number(r.version));
	assert.deepEqual(await versions(), MIGRATIONS.map(m => m.version));
	// Not the memoised migrate() -- the runner itself, on a database that
	// has already had every step.
	assert.equal(await applyMigrations(), newest);
	assert.equal(await applyMigrations(), newest);
	assert.deepEqual(await versions(), MIGRATIONS.map(m => m.version));
	const { rows } = await db().execute('SELECT COUNT(*) AS n FROM users');
	assert.ok(Number(rows[0].n) > 0, 'the rows survived a second run');
});
