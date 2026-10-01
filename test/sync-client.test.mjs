// The browser half of sync, against a server played by hand.
//
// sync.test.mjs runs the real server; this runs the real client with
// fetch answered by each test, so the decisions the client makes on its
// own -- push or ask, retry or start again -- can be pinned down: the
// first pull after offline edits, a profile-only browser signing in, a
// server that lost the row, an offline pull, and a save too big for a
// keepalive request.

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
	store: new Map(),
	getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
	setItem(k, v) { this.store.set(k, String(v)); },
	removeItem(k) { this.store.delete(k); },
	get length() { return this.store.size; },
	key(i) { return [...this.store.keys()][i] ?? null; }
};
globalThis.window = {
	handlers: {},
	addEventListener(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); },
	dispatchEvent() { return true; }
};
globalThis.document = {
	handlers: {},
	addEventListener(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); },
	getElementById() { return null; },
	visibilityState: 'visible'
};
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'Linux' }, configurable: true });
globalThis.location = { search: '', pathname: '/', origin: 'http://x' };
globalThis.history = { replaceState() {} };

const store = await import('../js/state.js');

const USER = { id: 'u1', username: 'Sailor', avatar: null };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/**
 * A fresh copy of sync.js, signed in, with `answer(method, path, body)`
 * playing the server for /api/state. Resolves once the first pull is
 * done, with the requests seen and the dialogs opened.
 */
async function signIn(answer, n) {
	const seen = [];
	const asked = [];
	globalThis.fetch = async (path, init = {}) => {
		const method = init.method || 'GET';
		const body = init.body ? JSON.parse(init.body) : null;
		seen.push({ method, path, body, keepalive: init.keepalive });
		if (path === '/api/config') return json(200, { sync: true });
		if (path === '/api/me') return json(200, { signedIn: true, user: USER });
		return answer(method, path, body);
	};
	const sync = await import(`../js/sync.js?${n}`);
	await sync.initSync({
		openDialog: html => {
			asked.push(html);
			return { querySelector: () => ({ addEventListener() {} }) };
		},
		closeDialog() {},
		toast() {},
		rerender() {}
	});
	return { sync, seen, asked };
}

const puts = seen => seen.filter(r => r.method === 'PUT' && r.path === '/api/state');

/** Sign every copy loaded so far out, the way a deleted account does, so
 *  one test's client does not push into the next test's server. */
test.afterEach(async () => {
	globalThis.fetch = async () => json(410, { error: 'gone' });
	store.setStock('Signed out marker', Date.now() % 1000 + 1);
	await sleep(600);
});

test('a copy only ahead of the server is pushed, not put to the player as two copies', async () => {
	store.adopt({ stock: { Steel: 9 }, targets: [], strategy: {}, profile: {} }, 'reset');
	store.setSetting('sync.rev', 5);
	store.setSetting('sync.revWho', USER.id);
	const { seen, asked } = await signIn((method) => method === 'GET'
		? json(200, { rev: 5, data: { stock: { Steel: 4 }, targets: [], strategy: {} } })
		: json(200, { rev: 6, updatedAt: 1 }), 1);
	await sleep(10);
	assert.equal(asked.length, 0, 'nothing to choose between');
	const put = puts(seen);
	assert.equal(put.length, 1);
	assert.equal(put[0].body.rev, 5);
	assert.equal(put[0].body.data.stock.Steel, 9, 'the edits made here go up');
});

test('the same revision learned under another account is no agreement', async () => {
	store.adopt({ stock: { Steel: 9 }, targets: [], strategy: {}, profile: {} }, 'reset');
	store.setSetting('sync.rev', 5);
	store.setSetting('sync.revWho', 'someone-else');
	const { seen, asked } = await signIn(() => json(200, { rev: 5, data: { stock: { Steel: 4 }, targets: [], strategy: {} } }), 2);
	await sleep(10);
	assert.equal(asked.length, 1, 'the player is asked');
	assert.equal(puts(seen).length, 0);
});

test('a browser holding only a profile is asked, not silently replaced', async () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { barterCount: 77 } }, 'reset');
	store.setSetting('sync.rev', 0);
	const { asked } = await signIn(() => json(200, { rev: 3, data: { stock: { Steel: 4 }, targets: [], strategy: {} } }), 3);
	await sleep(10);
	assert.equal(asked.length, 1);
	assert.equal(store.getProfile('barterCount'), 77, 'the profile here is untouched');
});

test('a server that lost the row takes this copy as its first save, instead of stalling', async () => {
	store.adopt({ stock: { Steel: 9 }, targets: [], strategy: {}, profile: {} }, 'reset');
	store.setSetting('sync.rev', 5);
	store.setSetting('sync.revWho', USER.id);
	let row = { rev: 5, data: { stock: { Steel: 9 }, targets: [], strategy: {} } };
	const { sync, seen } = await signIn((method, path, body) => {
		if (method === 'GET') return json(200, row);
		if (body.rev !== row.rev) return json(409, { error: 'Someone else saved first.', rev: row.rev, data: row.data });
		row = { rev: row.rev + 1, data: body.data };
		return json(200, { rev: row.rev, updatedAt: 1 });
	}, 4);
	await sleep(10);
	assert.equal(puts(seen).length, 0, 'the two agree, nothing to send');
	// The server restarts without the row.
	row = { rev: 0, data: null };
	store.setStock('Steel', 12);
	await sleep(800);
	const put = puts(seen);
	assert.deepEqual(put.map(p => p.body.rev), [5, 0], 'refused at 5, then sent as the first save');
	assert.equal(row.rev, 1);
	assert.equal(row.data.stock.Steel, 12);
	assert.equal(sync.me().id, USER.id);
});

test('a pull with no network says nothing and throws nothing', async () => {
	store.adopt({ stock: { Steel: 9 }, targets: [], strategy: {}, profile: {} }, 'reset');
	store.setSetting('sync.rev', 1);
	store.setSetting('sync.revWho', USER.id);
	let offline = false;
	await signIn(() => {
		if (offline) throw new TypeError('Failed to fetch');
		return json(200, { rev: 1, data: { stock: { Steel: 9 }, targets: [], strategy: {} } });
	}, 5);
	offline = true;
	let unhandled = null;
	const onRejection = err => { unhandled = err; };
	process.on('unhandledRejection', onRejection);
	for (const fn of document.handlers.visibilitychange) fn();
	await sleep(20);
	process.off('unhandledRejection', onRejection);
	assert.equal(unhandled, null);
});

test('a save too big for a keepalive request still leaves with the page', async () => {
	store.adopt({ stock: { Steel: 9 }, targets: [], strategy: {}, profile: {} }, 'reset');
	store.setSetting('sync.rev', 1);
	store.setSetting('sync.revWho', USER.id);
	const { seen } = await signIn((method) => method === 'GET'
		? json(200, { rev: 1, data: { stock: { Steel: 9 }, targets: [], strategy: {} } })
		: json(200, { rev: 2, updatedAt: 1 }), 6);
	const big = {};
	for (let i = 0; i < 4000; i++) big[`Some long item name number ${i}`] = i + 1;
	store.replaceStock(big, 'lots');
	window.handlers.pagehide.at(-1)();
	await sleep(10);
	const put = puts(seen).at(-1);
	assert.ok(put, 'the push went');
	assert.equal(put.keepalive, false, 'sent the ordinary way, as a keepalive would be refused');

	// A small one goes as a keepalive, and a refused keepalive falls back.
	store.adopt({ stock: { Steel: 3 }, targets: [], strategy: {}, profile: {} }, 'small');
	const before = seen.length;
	const real = globalThis.fetch;
	globalThis.fetch = (path, init) => (init && init.keepalive ? Promise.reject(new TypeError('keepalive refused')) : real(path, init));
	window.handlers.pagehide.at(-1)();
	await sleep(10);
	globalThis.fetch = real;
	const after = puts(seen.slice(before));
	assert.equal(after.length, 1);
	assert.equal(after[0].keepalive, false);
});
