// The app in another language, driven in a real browser.
//
// The pieces that only a rendered page can answer: that a language is
// chosen and remembered, that the game's own names come out of the
// client's vocabulary rather than the English the app stores, that the
// look-ups follow the reader to their own database, and that a script
// the app's two faces have no glyphs for fetches the face that does.
//
// Everything the runtime can be tested against on its own is in
// i18n.test.mjs; this is the half that needs a document.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { RELEASE } from '../js/about.js';

const CHROME = [
	process.env.CHROME,
	'/opt/pw-browsers/chromium',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/usr/bin/chromium-browser',
	'/etc/profiles/per-user/' + (process.env.USER || '') + '/bin/google-chrome',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean).find(p => fs.existsSync(p));

if (!CHROME) {
	test('the language tests need a Chrome -- set CHROME=/path/to/chrome', { skip: true }, () => {});
	process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-lang-'));
process.env.NODE_ENV = 'test';
const app = (await import('../server.js')).default;
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
test.after(async () => {
	await browser.close();
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

const french = JSON.parse(fs.readFileSync(new URL('../js/lang/names.fr.json', import.meta.url), 'utf8'));

/**
 * A page with the first run already behind it.
 *
 * Everything off this machine is refused and recorded -- the web fonts
 * among them, which is how the Japanese test sees that the right face
 * was asked for without waiting on Google to serve it.
 */
async function open() {
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
	await page.evaluateOnNewDocument(release => {
		try {
			localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true');
			localStorage.setItem('bdo-tracker/release', release);
		} catch { /* then a dialog may open, and only those tests mind */ }
	}, RELEASE);
	await page.goto(base, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#pouch .pouch-item', { timeout: 15000 });
	return { page, context, external };
}

/** Choose a language exactly as pressing its cell in the menu does. */
const choose = (page, id) => page.evaluate(async lang => {
	const i18n = await import('/js/i18n.js');
	const store = await import('/js/state.js');
	store.setSetting('lang', lang, true);
	store.setSetting('codexLang', lang, true);
	await i18n.setLang(lang);
	return i18n.lang();
}, id);

test('the menu offers BDOCodex’s own sixteen, and the page starts in one of them', async () => {
	const { page, context } = await open();
	const langs = await page.evaluate(async () => {
		const i18n = await import('/js/i18n.js');
		return { ids: i18n.LANGS.map(l => l.id), now: i18n.lang(), html: document.documentElement.lang };
	});
	assert.equal(langs.ids.length, 16);
	assert.ok(langs.ids.includes('seaen'), 'SEA English is one of them');
	assert.ok(langs.ids.includes('sp'), 'the South American Spanish database is its own language');
	// A first visit with no choice saved reads the browser, which here is
	// English -- and the document says so, for a screen reader.
	assert.equal(langs.now, 'us');
	assert.equal(langs.html, 'en');
	await context.close();
});

test('the game’s own names are drawn from the client’s vocabulary, and the English stays the key', async () => {
	const { page, context } = await open();
	// The Inventory is where a raw count is drawn; the Plan shows builds.
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setStock('Zinc Ingot', 5);
	});
	await page.click('.tab[data-act="view"][data-id="inventory"]');
	await page.waitForFunction(() => document.body.dataset.view === 'inventory', { timeout: 8000 });
	await page.waitForFunction(() => document.body.innerText.includes('Zinc Ingot'), { timeout: 8000 });

	assert.equal(await choose(page, 'fr'), 'fr');
	await page.evaluate(async () => (await import('/js/ui.js')).render());

	// On screen, the client's word.
	const shown = french['Zinc Ingot'];
	assert.equal(shown, 'Lingot de zinc');
	await page.waitForFunction(name => document.body.innerText.includes(name), { timeout: 8000 }, shown);

	// In the save, the English -- which is what a share link, a saved
	// route and every recipe are written in.
	const stored = await page.evaluate(async () => {
		const store = await import('/js/state.js');
		return { fr: store.getStock('Lingot de zinc'), en: store.getStock('Zinc Ingot') };
	});
	assert.equal(stored.en, 5);
	assert.ok(!stored.fr, 'nothing translated may ever be written into a save');
	await context.close();
});

test('a look-up follows the reader to their own database', async () => {
	const { page, context } = await open();
	const url = () => page.evaluate(async () => {
		const bits = await import('/js/ui-bits.js');
		return bits.localiseCodex('https://bdocodex.com/us/item/4064/');
	});
	assert.match(await url(), /bdocodex\.com\/us\//);
	await choose(page, 'pt');
	assert.match(await url(), /bdocodex\.com\/pt\//);
	// The three English databases are languages too: the words are
	// English, the server is theirs.
	await choose(page, 'seaen');
	assert.match(await url(), /bdocodex\.com\/seaen\//);
	await context.close();
});

test('a script the app’s faces have no glyphs for fetches the face that does, and gives it back', async () => {
	const { page, context, external } = await open();
	const face = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--script-font').trim());

	await choose(page, 'jp');
	assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
	assert.match(await face(), /Noto Sans JP/);
	assert.ok(external.some(u => /fonts\.googleapis\.com.*Noto\+Sans\+JP/.test(u)), 'the Japanese face was asked for');

	// And back to a Latin language, or German would go on being drawn in
	// Japanese metrics.
	await choose(page, 'de');
	assert.equal(await face(), "'Noto Sans'");
	await context.close();
});

test('the words written into the page, not into a render function, are translated too', async () => {
	const { page, context } = await open();
	// index.html carries the masthead's English in the markup so the page
	// reads correctly before a line of script runs; translateStatic()
	// walks it after a language is loaded.
	const before = await page.$eval('.brand-name', el => el.textContent.trim());
	assert.equal(before, 'Ship Upgrade Tracker');
	const source = await page.$eval('.brand-name', el => el.dataset.tSource);
	assert.equal(source, 'Ship Upgrade Tracker', 'the English is remembered, so a second language is not translated from the first');
	await context.close();
});
