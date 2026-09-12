// The client, driven in a real browser.
//
// Mostly the sync half, plus the few things about the app itself that
// only a rendered page can answer.
//
// Everything the server can be tested against is covered in
// sync.test.mjs; this covers what only the page can answer -- that the
// signed-out app is unchanged, that a signed-in one pushes what you
// type, that a second browser picks it up, and that two browsers editing
// the same account end at a question rather than at silent data loss.
//
// Discord is stood in for by minting the session cookie with the server's
// own signing code, exactly as sync.test.mjs does. Every line of client
// code past the redirect is the real one.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { RELEASE } from '../js/about.js';

// Wherever this machine keeps a Chrome. CHROME= overrides it.
const CHROME = [
	process.env.CHROME,
	'/opt/pw-browsers/chromium',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/etc/profiles/per-user/' + (process.env.USER || '') + '/bin/google-chrome',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean).find(p => fs.existsSync(p));

// The bar the app is judged up by. It is drawn one of two ways -- a row
// of chips, or, on a phone, the one line that opens the sheet -- and
// either of them means the shell has rendered.
const POUCH_READY = '#pouch .pouch-item, #pouch .pouch-peek';

// Nothing to drive. These are the only tests that need a browser, so a
// machine without one should report them skipped and let the rest of the
// suite speak -- not fail with a puppeteer stack trace.
if (!CHROME) {
	test('the browser tests need a Chrome -- set CHROME=/path/to/chrome', { skip: true }, () => {});
	process.exit(0);
}
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-browser-'));

process.env.NODE_ENV = 'test';
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser, getSave } = await import('../server/db.js');

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await puppeteer.launch({
	executablePath: CHROME,
	args: ['--no-sandbox', '--disable-dev-shm-usage']
});

test.after(async () => {
	await browser.close();
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

/** The Set-Cookie the server would have written after a Discord callback. */
function sessionCookie(id) {
	const written = [];
	startSession({ append: (name, value) => written.push(value) }, id);
	const [pair] = written[0].split(';');
	const eq = pair.indexOf('=');
	return { name: pair.slice(0, eq), value: decodeURIComponent(pair.slice(eq + 1)) };
}

/**
 * A fresh page, optionally already signed in as `id`.
 *
 * Nothing off this machine is allowed to load. The web fonts and the
 * tour's CDN script are no part of what is being tested, and waiting on
 * them turns every page load into a timeout -- so every external request
 * is refused at the door and recorded, which is also how the sign-in
 * test sees where Discord would have been sent.
 */
async function open({ signedIn = null, hash = '', storage = null } = {}) {
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	const external = [];

	await page.setRequestInterception(true);
	page.on('request', req => {
		if (req.url().startsWith(base) || req.url().startsWith('data:')) return req.continue();
		external.push(req.url());
		req.abort().catch(() => { /* the page may already be gone */ });
	});
	page.on('pageerror', err => { throw err; });

	if (signedIn) {
		const c = sessionCookie(signedIn);
		await context.setCookie({ ...c, domain: '127.0.0.1', path: '/' });
	}

	// These pages model a player who has already seen the first-run tour
	// and read the release notes. While either is up the app deliberately
	// holds every push -- the tour's example data must never reach a save
	// -- so an auto-started one would wedge each sync test on a dialog
	// nobody is there to dismiss. This was invisible while the tour's
	// library came from a CDN this harness blocks; vendoring the library
	// made the tour actually start. The tests about the first run plant
	// their own storage and say what they expect.
	await page.evaluateOnNewDocument((planted, release) => {
		try {
			if (planted) {
				localStorage.clear();
				for (const [k, v] of Object.entries(planted)) localStorage.setItem(k, v);
				return;
			}
			localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true');
			localStorage.setItem('bdo-tracker/release', release);
		} catch { /* then a dialog may open, and only those tests mind */ }
	}, storage, RELEASE);

	await page.goto(base + hash, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector(POUCH_READY, { timeout: 15000 });
	return { page, context, external };
}

const chip = page => page.$eval('#account', el => el.textContent.trim()).catch(() => '');

/**
 * A fresh account, so no test can be disturbed by another's leftovers.
 *
 * They would be: a page being closed flushes any queued push, so a
 * context closed at the end of one test can land a write while the next
 * is already reading. Sharing an account across tests makes that a
 * flake; one account each makes it impossible.
 */
let accounts = 2000;
async function account(username = 'Captain') {
	const id = String(++accounts);
	await upsertUser({ id, username, avatar: null });
	return id;
}

/**
 * Wait until `id`'s stored save satisfies `check`.
 *
 * Pushes are debounced by a couple of seconds, so a fixed sleep here
 * would either be flaky or slow. Watching the database directly is both
 * exact and the thing the test actually cares about.
 */
async function storedUntil(id, check, what, timeout = 15000) {
	const deadline = Date.now() + timeout;
	for (;;) {
		const save = await getSave(id);
		if (save && check(JSON.parse(save.payload))) return save;
		if (Date.now() > deadline) assert.fail(`timed out waiting for ${what}`);
		await new Promise(r => setTimeout(r, 150));
	}
}

/** Wait for something, or fail saying what never happened. */
async function until(page, fn, what, timeout = 8000) {
	try {
		await page.waitForFunction(fn, { timeout, polling: 100 });
	} catch {
		assert.fail(`timed out waiting for ${what}`);
	}
}

const setStock = (page, item, qty) => page.evaluate(async (i, q) => {
	const store = await import('/js/state.js');
	store.setStock(i, q);
}, item, qty);

const readStock = (page, item) => page.evaluate(async i => {
	const store = await import('/js/state.js');
	return store.getStock(i);
}, item);

test('the pouch carries Sangpyeong Coins once a build wants them', async () => {
	const { page, context } = await open();

	const chips = () => page.$$eval('#pouch .pouch-k', els => els.map(e => e.textContent.trim()));

	// A Carrack has no use for them, so the bar does not carry them.
	assert.ok(!(await chips()).includes('Sangpyeong Coins'));

	// A Panokseon wants 300 Finely Polished Pine Plywood, and the only
	// recipe for that is 10 Sangpyeong Coins each.
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Panokseon', 1);
	});
	await until(page,
		() => [...document.querySelectorAll('#pouch .pouch-k')].some(e => e.textContent.trim() === 'Sangpyeong Coins'),
		'the Sangpyeong chip');

	const need = await page.$eval(
		'#pouch .pouch-item:has(.pouch-k)',
		() => {
			const chip = [...document.querySelectorAll('#pouch .pouch-item')]
				.find(el => el.querySelector('.pouch-k').textContent.trim() === 'Sangpyeong Coins');
			return chip.querySelector('.pouch-need').textContent.trim();
		}
	);
	assert.match(need, /3,000/);
	await context.close();
});

test('a toast is readable over an open dialog', async () => {
	// The answer to what you just did is usually raised from inside a
	// dialog -- "written to the game file", "could not reach the
	// clipboard" -- so a toast behind the dialog is an answer nobody
	// sees.
	const { page, context } = await open();

	await page.evaluate(async () => {
		const { openDialog, toast } = await import('/js/dialogs.js');
		openDialog('<h2>Something</h2><p>' + 'x'.repeat(400) + '</p>');
		toast('written');
	});
	await until(page, () => !document.getElementById('toast').hidden, 'the toast');

	const onTop = await page.evaluate(() => {
		const el = document.getElementById('toast');
		const b = el.getBoundingClientRect();
		const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
		return { covered: !el.contains(hit), text: el.textContent.trim(), tag: hit && hit.className };
	});
	assert.equal(onTop.text, 'written');
	assert.ok(!onTop.covered, `the dialog is over the toast (${onTop.tag})`);
	await context.close();
});

test('signed out, the app offers sign-in and nothing else changes', async () => {
	const { page, context } = await open();
	await until(page, () => document.querySelector('#account button'), 'the sign-in button');

	assert.match(await chip(page), /Sign in/);
	// The tracker itself is untouched: the pouch and tabs still render.
	assert.ok(await page.$(POUCH_READY));
	assert.ok(await page.$('#tabs'));
	await context.close();
});

test('the sign-in button goes to Discord, carrying where to come back to', async () => {
	const { page, context, external } = await open();
	await until(page, () => document.querySelector('#account button'), 'the sign-in button');

	// Follow the click for real. It leaves for /auth/discord, which
	// redirects on to discord.com -- and that is where the page's
	// interceptor stops it, so the test never depends on Discord being up.
	const started = page.waitForRequest(r => r.url().includes('/auth/discord?to='), { timeout: 8000 });
	await page.click('#account button');
	// The button asks first now; the dialog's Continue is the real door.
	await page.waitForSelector('#dialog [data-go]', { timeout: 8000 });
	await page.click('#dialog [data-go]');
	assert.match(new URL((await started).url()).search, /^\?to=%2F/);

	const deadline = Date.now() + 8000;
	while (!external.some(u => u.startsWith('https://discord.com/')) && Date.now() < deadline) {
		await new Promise(r => setTimeout(r, 100));
	}
	const sent = external.find(u => u.startsWith('https://discord.com/'));
	assert.ok(sent, 'the sign-in never reached Discord');

	const url = new URL(sent);
	assert.equal(url.origin + url.pathname, 'https://discord.com/oauth2/authorize');
	assert.equal(url.searchParams.get('scope'), 'identify');
	assert.equal(url.searchParams.get('client_id'), 'test-client');
	assert.ok(url.searchParams.get('state'), 'no CSRF state was sent');

	await context.close();
});

test('signing in pushes what is here, and a second browser adopts it', async () => {
	const id = await account();

	const first = await open({ signedIn: id });
	await until(first.page, () => document.querySelector('.account-chip.idle'), 'the first pull');
	assert.match(await chip(first.page), /Captain/);

	// Nothing stored yet, so this browser's copy becomes the first save.
	await setStock(first.page, 'Tidal Black Stone', 400);
	await storedUntil(id, s => s.stock['Tidal Black Stone'] === 400, 'the first push to land');
	await first.context.close();

	// A different browser, empty, signing into the same account: it takes
	// what is stored without needing to ask.
	const second = await open({ signedIn: id });
	await until(second.page, () => document.querySelector('.account-chip.idle'), 'the pull to settle');
	assert.equal(await readStock(second.page, 'Tidal Black Stone'), 400);
	await second.context.close();
});

test('a change on one browser reaches the other', async () => {
	const id = await account();
	const first = await open({ signedIn: id });
	await until(first.page, () => document.querySelector('.account-chip.idle'), 'the first pull');
	await setStock(first.page, 'Tidal Black Stone', 400);
	await storedUntil(id, s => s.stock['Tidal Black Stone'] === 400, 'the initial save');

	const second = await open({ signedIn: id });
	await until(second.page, () => document.querySelector('.account-chip.idle'), 'the second pull');

	await setStock(first.page, 'Tidal Black Stone', 555);
	await storedUntil(id, s => s.stock['Tidal Black Stone'] === 555, 'the push to land');

	// The other tab checks when it becomes visible again.
	await second.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await until(second.page, async () => {
		const store = await import('/js/state.js');
		return store.getStock('Tidal Black Stone') === 555;
	}, 'the other browser to pick the change up');

	await first.context.close();
	await second.context.close();
});

test('two browsers editing at once end at a question, not at lost data', async () => {
	const id = await account();
	const first = await open({ signedIn: id });
	await until(first.page, () => document.querySelector('.account-chip.idle'), 'the first pull');
	await setStock(first.page, 'Cobalt Ingot', 1);
	await storedUntil(id, s => s.stock['Cobalt Ingot'] === 1, 'the initial save');

	const second = await open({ signedIn: id });
	await until(second.page, () => document.querySelector('.account-chip.idle'), 'the second pull');

	// Both now hold the same revision. The first push wins; the second is
	// refused and must ask rather than overwrite.
	await setStock(first.page, 'Cobalt Ingot', 100);
	await storedUntil(id, s => s.stock['Cobalt Ingot'] === 100, 'the winning push');

	await setStock(second.page, 'Cobalt Ingot', 999);
	await until(second.page,
		() => document.querySelector('#dialog:not([hidden]) [data-keep-local]'),
		'the conflict dialog');

	assert.match(await second.page.$eval('#dialog', el => el.textContent), /Two copies of your inventory/);

	// Nothing was changed by merely asking.
	assert.equal(await readStock(second.page, 'Cobalt Ingot'), 999);

	// Keeping this browser's copy pushes it over the top of the other.
	await second.page.click('[data-keep-local]');
	await storedUntil(id, s => s.stock['Cobalt Ingot'] === 999, 'the resolved push to land');

	await first.context.close();
	await second.context.close();
});

test('the guided tour never syncs its example data', async () => {
	const id = await account();
	const mine = await open({ signedIn: id });
	await until(mine.page, () => document.querySelector('.account-chip.idle'), 'the first pull');
	await setStock(mine.page, 'Void Sea Crystal', 7);
	await storedUntil(id, s => s.stock['Void Sea Crystal'] === 7, 'the real inventory to save');

	// The tour swaps in worked-through data without saving it. Meanwhile
	// another device saves something. Neither the demo may be pushed, nor
	// may it be offered as "your copy" against what is stored.
	await mine.page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.applyTransient(JSON.stringify({
			stock: { 'Void Sea Crystal': 99999, 'Moon Scale Plywood': 12345 },
			targets: [],
			strategy: {}
		}));
	});

	const other = await open({ signedIn: id });
	await until(other.page, () => document.querySelector('.account-chip.idle'), 'the other pull');
	await setStock(other.page, 'Void Sea Crystal', 8);
	await storedUntil(id, s => s.stock['Void Sea Crystal'] === 8, 'the other push');

	// A tab coming back into view pulls. During the tour it must not.
	await mine.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await new Promise(r => setTimeout(r, 4000));

	assert.equal(
		await mine.page.$eval('#dialog', el => el.hidden), true,
		'the tour was interrupted by a sync conflict'
	);
	const stored = JSON.parse((await getSave(id)).payload);
	assert.equal(stored.stock['Void Sea Crystal'], 8, 'the demo data was pushed');
	assert.ok(!('Moon Scale Plywood' in stored.stock), 'the demo data reached the server');

	await mine.context.close();
	await other.context.close();
});

test('taking the other copy is undoable', async () => {
	const id = await account();
	const mine = await open({ signedIn: id });
	await until(mine.page, () => document.querySelector('.account-chip.idle'), 'the first pull');

	await setStock(mine.page, 'Seaweed Stalk', 12);
	await storedUntil(id, s => s.stock['Seaweed Stalk'] === 12, 'the first push');

	// Another browser gets there first, so this one is offered the choice.
	const other = await open({ signedIn: id });
	await until(other.page, () => document.querySelector('.account-chip.idle'), 'the other pull');
	await setStock(other.page, 'Seaweed Stalk', 77);
	await storedUntil(id, s => s.stock['Seaweed Stalk'] === 77, 'the other push');

	await setStock(mine.page, 'Seaweed Stalk', 34);
	await until(mine.page,
		() => document.querySelector('#dialog:not([hidden]) [data-keep-remote]'),
		'the conflict dialog');

	await mine.page.click('[data-keep-remote]');
	await until(mine.page, async () => {
		const store = await import('/js/state.js');
		return store.getStock('Seaweed Stalk') === 77;
	}, 'the stored copy to be taken');

	// The copy that lost is one Undo away, which is the promise the
	// dialog makes.
	const back = await mine.page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.undo();
		return store.getStock('Seaweed Stalk');
	});
	assert.equal(back, 34);

	await mine.context.close();
	await other.context.close();
});

/**
 * The tour points at things that exist.
 *
 * Worth a test because the way it breaks is silent: a renamed class
 * leaves the step pointing at nothing, and Driver.js answers a selector
 * that matches nothing by centring the popover -- which still reads as a
 * perfectly good tour to whoever wrote it. `.crew-ship` outlived the
 * markup it named by a week that way.
 *
 * What is checked is each step's own selector, on the screen that step
 * navigates to, with a save in place that gives every screen something
 * to show. Driver.js is deliberately not in the loop: whether the
 * highlight has landed at the instant you look is a question about
 * animation frames and whatever repainted last, and asserting on it
 * turned out to be a coin toss rather than a test.
 */
const FURNISHED = JSON.stringify({
	v: 2,
	stock: {
		'Violent Wave Plywood': 120,
		"Violent Sea Monster's Scale": 400,
		"Saltwater Crocodile's Scale": 400,
		"Violent Sea Monster's Bone": 300,
		'Starlight Hardener': 300,
		'Tidal Black Stone': 300,
		'+4 Epheria Carrack: Toro Sail': 1,
		'Crow Coin': 3000,
		Silver: 42000000
	},
	targets: [
		{ id: 'a', item: "Epheria Carrack: Advance (Chiro's Cannon)", qty: 1, active: true },
		{ id: 'b', item: "Epheria Carrack: Advance (Chiro's Sail)", qty: 1, active: true }
	],
	strategy: {},
	history: [],
	settings: {}
});

for (const [where, size] of [['a wide screen', { width: 1280, height: 900 }], ['a phone', { width: 390, height: 844 }]]) {
	test(`every step of the guided tour names something that is there, on ${where}`, async () => {
		const mine = await open({
			storage: { 'bdo-tracker/v2': FURNISHED, 'bdo_ship_upgrade-tour_completed': 'true', 'bdo-tracker/release': RELEASE }
		});
		await mine.page.setViewport(size);
		// Let the icon mapping and the barter catalogue land, so a screen
		// is not measured while it is still filling in.
		await new Promise(r => setTimeout(r, 2500));

		const missing = await mine.page.evaluate(async () => {
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const { guidedTour } = await import('/js/guided-tour.js');
			const gone = [];
			for (const step of guidedTour.steps()) {
				if (step.before) step.before();
				await wait(350);
				if (!step.element) continue;
				if (!document.querySelector(step.element)) gone.push(`${step.popover.title} -> ${step.element}`);
			}
			return gone;
		});

		assert.deepEqual(missing, [], 'these steps name an element no longer on the page');
		await mine.context.close();
	});
}

/**
 * What greets someone on the way in, and in what order.
 *
 * Three things want that first moment and only one may have it, so the
 * rules are worth pinning down: a shared link outranks both, the release
 * notes come before the tour, and a browser that has never seen the app
 * at all is not shown a list of what changed in a version it never had.
 */
const SAVE = JSON.stringify({ v: 2, stock: { 'Violent Wave Plywood': 40 }, targets: [], strategy: {}, history: [], settings: {} });
const RETURNING = { 'bdo-tracker/v2': SAVE, 'bdo_ship_upgrade-tour_completed': 'true' };

/** What is on the screen a moment after the page settles. */
async function greeting(page) {
	await new Promise(r => setTimeout(r, 2600));
	return page.evaluate(() => ({
		dialog: document.querySelector('#dialog:not([hidden]) h2')?.textContent || null,
		tour: !!document.querySelector('.driver-popover'),
		release: localStorage.getItem('bdo-tracker/release')
	}));
}

test('a browser that has seen an older version is shown what changed', async () => {
	const mine = await open({ storage: RETURNING });
	const got = await greeting(mine.page);
	assert.equal(got.dialog, "What's new");
	assert.equal(got.tour, false, 'the tour does not fight the notes');
	assert.equal(got.release, RELEASE, 'and they are not offered twice');
	await mine.context.close();
});

test('having read them, it is not shown them again', async () => {
	const mine = await open({ storage: { ...RETURNING, 'bdo-tracker/release': RELEASE } });
	const got = await greeting(mine.page);
	assert.equal(got.dialog, null);
	assert.equal(got.tour, false);
	await mine.context.close();
});

test('a browser with nothing in it gets the tour, not a list of what it never had', async () => {
	const mine = await open({ storage: {} });
	const got = await greeting(mine.page);
	assert.equal(got.dialog, null, 'no release notes for a first-ever visit');
	assert.equal(got.tour, true);
	assert.equal(got.release, RELEASE, 'and they do not surface tomorrow as news');
	await mine.context.close();
});

test('the notes hand over to the tour when they are closed', async () => {
	// A save, but the tour never taken: the notes come first, then it.
	const mine = await open({ storage: { 'bdo-tracker/v2': SAVE } });
	assert.equal((await greeting(mine.page)).dialog, "What's new");
	await mine.page.click('#dialog [data-close]');
	await until(mine.page, () => document.querySelector('.driver-popover'), 'the tour to follow');
	await mine.context.close();
});

for (const link of ['#share/abc', '#trace/abc', '#ship/abc', '#map/abc']) {
	test(`a shared link (${link}) outranks the notes and the tour`, async () => {
		// Nothing in storage at all: this is someone else's link, opened
		// by a player who has never been here. They came to see one
		// thing, and a dialog over it is in the way.
		const mine = await open({ storage: {}, hash: link });
		const got = await greeting(mine.page);
		assert.equal(got.dialog, null, 'no dialog over a shared link');
		assert.equal(got.tour, false, 'no tour over a shared link');
		assert.equal(got.release, null, 'and the notes still wait under More');
		await mine.context.close();
	});
}
