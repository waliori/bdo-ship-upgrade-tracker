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
// Market prices from a recorded answer, never the live Market, so a run
// plans the same on any day (see server/market.js).
process.env.MARKET_FIXTURE = new URL('./fixtures/market.json', import.meta.url).href;
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

// What index.html calls the app, whatever that is today.
const brandInMarkup = (fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
	.match(/class="brand-name"[^>]*>([^<]+)</) || [])[1].trim();

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

test('the language flies its flag in the masthead, on a phone as on a desktop', async () => {
	const { page, context } = await open();
	const button = () => page.evaluate(() => {
		const b = document.getElementById('lang-btn');
		if (!b) return null;
		const r = b.getBoundingClientRect();
		return { flag: b.querySelector('.lang-flag').textContent, title: b.title, wide: r.width > 0 && r.height > 0 };
	});

	// It stands in the masthead rather than three presses into the menu,
	// and says which language is on without a word.
	const first = await button();
	assert.ok(first, 'the masthead carries the language');
	assert.equal(first.flag, '\u{1F1FA}\u{1F1F8}', 'and starts on the flag of the language the page is in');
	assert.match(first.title, /US English/, 'with the name of it for a pointer and a reader');

	// Pressing it opens the sixteen, each with its flag in front of its
	// own name -- the flag alone would not tell the two Spanishes apart.
	await page.click('#lang-btn');
	await page.waitForSelector('.lang-grid .lang-pick', { timeout: 8000 });
	const rows = await page.$$eval('.lang-pick', els => els.map(el => ({
		flag: (el.querySelector('.lang-flag') || {}).textContent || '', label: el.textContent.trim() })));
	assert.equal(rows.length, 16);
	assert.ok(rows.every(r => r.flag && r.label.length > r.flag.length), 'every one is a flag and a name');

	// And choosing one changes the flag the masthead flies.
	await page.click('.lang-pick[data-id="fr"]');
	await page.waitForFunction(() => document.documentElement.lang === 'fr', { timeout: 8000 });
	const after = await button();
	assert.equal(after.flag, '\u{1F1EB}\u{1F1F7}');
	assert.match(after.title, /Français/);

	// A phone is where it was hidden worst, so it is drawn there too --
	// and the row it joins still fits across the screen.
	await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
	await page.evaluate(async () => (await import('/js/ui.js')).render());
	const phone = await button();
	assert.equal(phone.wide, true, 'the flag is in the phone masthead, not folded into the menu');
	const fits = await page.evaluate(() => {
		const a = document.getElementById('masthead-actions');
		return a.scrollWidth <= a.clientWidth + 1;
	});
	assert.equal(fits, true, 'and the masthead still fits a phone across');
	await context.close();
});

test('the game’s own names are drawn from the client’s vocabulary, and the English stays the key', async () => {
	const { page, context } = await open();
	// The Inventory is where a raw count is drawn; the Plan shows builds.
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setStock('Zinc Ingot', 5);
	});
	// Setting stock redraws the whole shell, so the tab has to be waited
	// for rather than clicked at: clicking the node from the render before
	// last hits an element that is no longer in the page.
	const inventoryTab = '.tab[data-act="view"][data-id="inventory"]';
	await page.waitForSelector(inventoryTab, { timeout: 8000 });
	// Clicked as whatever tab is on the page at that moment, and again
	// until the Inventory is up: the Market's prices land and redraw the
	// shell at their own pace, and a handle taken a moment earlier can be
	// gone by the time it is pressed.
	await page.waitForFunction(sel => {
		if (document.body.dataset.view === 'inventory') return true;
		const tab = [...document.querySelectorAll(sel)].find(e => e.getBoundingClientRect().width > 0);
		if (tab) tab.click();
		return false;
	}, { timeout: 8000, polling: 200 }, inventoryTab);
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

test('the app’s own words change too, and a missing one falls back to the English', async () => {
	const { page, context } = await open();
	const tabs = () => page.$$eval('.tab .tab-label', els => els.map(e => e.textContent.trim()));
	const english = await tabs();
	assert.ok(english.includes('Inventory'), `the English tab bar: ${english.join(', ')}`);

	// German is a pack the app ships. Whatever share of it is translated,
	// the tab bar is the first thing anyone reads, so it is translated.
	await choose(page, 'de');
	await page.evaluate(async () => (await import('/js/ui.js')).render());
	const german = await tabs();
	assert.equal(german.length, english.length, 'the same tabs, in the same order');
	assert.notDeepEqual(german, english, 'something on the tab bar moved');
	assert.ok(!german.includes('Inventory'), `Inventory was not translated: ${german.join(', ')}`);

	// A sentence the pack has never heard of draws the English it was
	// written as, rather than a blank or a key.
	const fallback = await page.evaluate(async () => {
		const { T } = await import('/js/i18n.js');
		return T('a sentence no pack will ever carry');
	});
	assert.equal(fallback, 'a sentence no pack will ever carry');
	await context.close();
});

test('Russian gets its three forms, where English has two', async () => {
	const { page, context } = await open();
	await choose(page, 'ru');

	// Russian counts in one / few / many, and the pack carries all of
	// them against a single English key. Nothing in the call site knows
	// that -- T() asks Intl.PluralRules, so the same line of code is
	// right in every language.
	const key = '<b>{n}</b> chains';
	const said = await page.evaluate(async k => {
		const { T } = await import('/js/i18n.js');
		return [1, 2, 5, 21].map(n => T(k, { n }));
	}, key);

	const [one, few, many, twentyOne] = said.map(x => x.replace(/<\/?b>/g, ''));
	assert.match(one, /^1 /, one);
	// Each form is different from the others -- which is the point.
	assert.notEqual(one.slice(2), few.slice(2), `1 and 2 should not read alike: ${one} / ${few}`);
	assert.notEqual(few.slice(2), many.slice(2), `2 and 5 should not read alike: ${few} / ${many}`);
	// 21 takes the same form as 1 in Russian, which a naive n === 1 test
	// would get wrong.
	assert.equal(twentyOne.replace(/^21 /, ''), one.replace(/^1 /, ''), `21 should read like 1: ${twentyOne} / ${one}`);
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
	// The app's own name, read off index.html rather than written here,
	// so a rename does not quietly turn this test into a check that the
	// app is still called whatever it was called the day it was written.
	const marked = await page.$eval('.brand-name', el => ({ text: el.textContent.trim(), source: el.dataset.tSource }));
	assert.ok(marked.text, 'the brand name is drawn');
	assert.equal(marked.source, marked.text, 'the English is remembered, so a second language is not translated from the first');
	assert.equal(marked.source, brandInMarkup, 'and what is remembered is what the markup says');
	await context.close();
});
