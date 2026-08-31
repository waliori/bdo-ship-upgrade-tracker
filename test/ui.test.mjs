// The page's own flows, driven in a real browser: the picker, the
// Crew screen's bulk actions, the trip log, a plan and a ship in a
// link. Skipped where there is no Chrome, like browser.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = [
	process.env.CHROME, '/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium',
	'/usr/bin/chromium-browser', '/etc/profiles/per-user/' + (process.env.USER || '') + '/bin/google-chrome',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean).find(p => fs.existsSync(p));

if (!CHROME) {
	test('the ui tests need a Chrome -- set CHROME=/path/to/chrome', { skip: true }, () => {});
	process.exit(0);
}

process.env.NODE_ENV = 'test';
for (const name of ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'PUBLIC_URL']) delete process.env[name];
const app = (await import('../server.js')).default;
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
test.after(async () => { await browser.close(); server.close(); });

const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(hash = '#plan', { touch = false } = {}) {
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	if (touch) await page.emulate({ viewport: { width: 400, height: 860, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 13) Mobile' });
	else await page.setViewport({ width: 1280, height: 900 });
	const errors = [];
	page.on('pageerror', err => errors.push(err.message));
	await page.setRequestInterception(true);
	page.on('request', req => (req.url().startsWith(base) || req.url().startsWith('data:')) ? req.continue() : req.abort().catch(() => {}));
	await page.evaluateOnNewDocument(() => { try { localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true'); } catch { /* fine */ } });
	await page.goto(base + '/' + hash, { waitUntil: 'domcontentloaded' });
	await page.waitForSelector('#pouch .pouch-item', { timeout: 15000 });
	return { page, context, errors };
}
const seed = page => page.evaluate(async () => {
	const store = await import('/js/state.js');
	store.addTarget('Carrack (Valor)', 1);
	store.setProfile('crewShip', 'Carrack (Valor)');
	store.setStock("+4 Epheria Carrack: Valor (Chiro's Sail)", 1);
	store.setStock('Tidal Black Stone', 300);
});
const text = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
const count = (page, sel) => page.evaluate(s => document.querySelectorAll(s).length, sel);

test('a slot is fitted through the picker, and an unheld part can be recorded', async () => {
	const { page, context, errors } = await open('#crew');
	await seed(page); await wait(500);
	await page.click('[data-act="crew-fit-pick"][data-slot="cannon"]'); await wait(200);
	assert.ok(await count(page, '.picker-row') >= 3, 'parts to choose from');
	await page.type('.picker-in', 'chiro'); await wait(150);
	assert.match(await text(page, '.picker-row.on .picker-label'), /Chiro/, 'typing ranks the part first');
	await page.keyboard.press('Enter'); await wait(200);
	assert.match(await text(page, '#dialog h2'), /which level/i);
	await page.evaluate(() => [...document.querySelectorAll('.picker-row')].find(r => r.textContent.includes('+9')).click()); await wait(400);
	assert.match(await text(page, '.slot-card'), /\+9/);
	assert.match(await text(page, '.slot-card .fit-tag'), /not in your inventory/i);
	await page.click('[data-act="crew-fit-add"]'); await wait(400);
	assert.match(await text(page, '.slot-card .fit-tag'), /in your inventory/i);
	assert.equal(await page.evaluate(async () => (await import('/js/state.js')).getStock("+9 Epheria Carrack: Valor (Chiro's Cannon)")), 1);
	assert.deepEqual(errors, []);
	await context.close();
});

test('sailors are hired with a portrait, ticked together, and dismissed after a second ask', async () => {
	const { page, context, errors } = await open('#crew');
	await seed(page); await wait(400);
	for (let i = 0; i < 2; i++) {
		await page.click('[data-act="crew-hire"]'); await wait(200);
		assert.ok(await count(page, '.picker-row .sailor-face') > 10, 'portraits in the picker');
		await page.evaluate(k => document.querySelectorAll('.picker-row')[k].click(), i); await wait(200);
		await page.click('[data-hire]'); await wait(300);
	}
	assert.equal(await count(page, '.roster-card'), 2);
	await page.click('[data-act="crew-check"]'); await wait(200);
	await page.click('[data-act="crew-check"]:not(.on)'); await wait(200);
	assert.match(await text(page, '.crew-bulk'), /2 ticked/);
	await page.click('[data-act="crew-bulk"][data-op="dismiss"]'); await wait(100);
	assert.equal(await count(page, '.roster-card'), 2, 'the first press only asks');
	assert.match(await text(page, '[data-act="crew-bulk"][data-op="dismiss"]'), /sure/);
	await page.click('[data-act="crew-bulk"][data-op="dismiss"]'); await wait(300);
	assert.equal(await count(page, '.roster-card'), 0);
	assert.deepEqual(errors, []);
	await context.close();
});

test('a trip is logged through the picker, lines can go, and it is one undo', async () => {
	const { page, context, errors } = await open('#plan');
	await page.click('[data-act="trip-log"]'); await wait(200);
	await page.click('[data-trip-pick="0"]'); await wait(200);
	await page.type('.picker-in', 'tidal black'); await page.keyboard.press('Enter'); await wait(300);
	assert.match(await text(page, '.trip-row'), /^Tidal Black Stone/);
	await page.type('[data-trip-qty="0"]', '12');
	await page.click('[data-trip-del="2"]'); await wait(100);
	assert.equal(await count(page, '.trip-row'), 2);
	await page.click('[data-trip-save]'); await wait(300);
	assert.equal(await page.evaluate(async () => (await import('/js/state.js')).getStock('Tidal Black Stone')), 12);
	await page.evaluate(async () => (await import('/js/state.js')).undo());
	assert.equal(await page.evaluate(async () => (await import('/js/state.js')).getStock('Tidal Black Stone')), 0);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the quests narrow to the rewards ticked, and a pick-one claim asks which', async () => {
	const { page, context, errors } = await open('#quests');
	await page.click('[data-act="quest-pay-pick"]'); await wait(200);
	await page.evaluate(() => [...document.querySelectorAll('.picker-row')].find(r => r.textContent.includes('Tidal Black Stone')).click());
	await page.click('[data-picker-apply]'); await wait(300);
	assert.equal(await count(page, '.pay-chip'), 1);
	const shown = await count(page, '.quest');
	assert.ok(shown > 0 && shown < 37, `${shown} quests narrowed`);
	await page.click('[data-act="quest-claim-pick"]'); await wait(200);
	assert.match(await text(page, '#dialog h2'), /which reward/i);
	await page.evaluate(() => document.querySelector('.picker-row').click()); await wait(300);
	assert.ok(await count(page, '.quest.done') >= 1, 'ticked done');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a plan and a ship travel in links', async () => {
	const { page, context, errors } = await open('#crew');
	await seed(page); await wait(300);
	const share = await page.evaluate(async () => { const s = await import('/js/share.js'); const st = await import('/js/state.js'); return s.shareLink(await s.encodeShare(st.saveShape())); });
	const p2 = await context.newPage();
	await p2.goto(share, { waitUntil: 'domcontentloaded' }); await wait(600);
	assert.match(await text(p2, '#dialog h2'), /a plan in a link/i);
	await p2.click('[data-share-look]'); await wait(300);
	assert.equal(await p2.evaluate(async () => (await import('/js/state.js')).isTransient()), true);
	await p2.click('[data-shared="back"]'); await wait(200);
	assert.equal(await p2.evaluate(async () => (await import('/js/state.js')).isTransient()), false);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the day rides under the pouch on every tab but the Plan, and the More menu opens and closes', async () => {
	const { page, context, errors } = await open('#builds');
	await seed(page); await wait(300);
	assert.match(await text(page, '#status'), /Carrack \(Valor\)/);
	await page.click('#tab-plan'); await wait(200);
	assert.equal(await page.evaluate(() => document.getElementById('status').hidden), true);
	await page.click('[data-act="more"]'); await wait(100);
	assert.equal(await page.evaluate(() => document.getElementById('more-menu').hidden), false);
	await page.click('[data-act="help"]'); await wait(200);
	assert.equal(await page.evaluate(() => document.getElementById('more-menu').hidden), true, 'picking an item closes it');
	assert.deepEqual(errors, []);
	await context.close();
});

test('on a phone the map starts with the sea, and a tap shows the hover card', async () => {
	const { page, context, errors } = await open('#map', { touch: true });
	await seed(page); await wait(1200);
	assert.equal(await count(page, '.map-side-pill'), 1, 'the panel is folded to a pill');
	await page.goto(base + '/#get', { waitUntil: 'domcontentloaded' });
	// A late repaint -- prices, the barter table -- puts any card away,
	// so the tap waits for the page to settle, as a thumb would.
	await page.waitForNetworkIdle({ idleTime: 600 }).catch(() => {}); await wait(300);
	const row = await page.$('.row[data-peek] > img');
	await row.evaluate(e => e.scrollIntoView({ block: 'center' })); await wait(200);
	const b = await row.boundingBox();
	await page.touchscreen.tap(b.x + 10, b.y + b.height / 2); await wait(300);
	assert.equal(await page.evaluate(() => document.getElementById('peek').hidden), false);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the minimap hides, comes back, and stays where it is dragged', async () => {
	const { page, context, errors } = await open('#map');
	await seed(page); await wait(1200);
	assert.equal(await count(page, '[data-map-mini]'), 1);
	const grip = await page.$('[data-mini-grip]');
	const g = await grip.boundingBox();
	await page.mouse.move(g.x + 5, g.y + 5); await page.mouse.down();
	await page.mouse.move(g.x - 300, g.y - 200, { steps: 6 }); await page.mouse.up(); await wait(200);
	const box = await page.$eval('[data-map-mini]', el => ({ left: el.style.left, top: el.style.top, moved: el.classList.contains('moved') }));
	assert.ok(box.moved && parseInt(box.left) >= 0 && parseInt(box.top) >= 0, JSON.stringify(box));
	await page.click('[data-act="map-mini"][aria-pressed]'); await wait(200);
	assert.equal(await count(page, '[data-map-mini]'), 0, 'hidden');
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#pouch .pouch-item'); await wait(1000);
	assert.equal(await count(page, '[data-map-mini]'), 0, 'still hidden after a reload');
	await page.click('[data-act="map-mini"][aria-pressed]'); await wait(300);
	const again = await page.$eval('[data-map-mini]', el => el.style.left);
	assert.equal(again, box.left, 'back where it was dragged');
	assert.deepEqual(errors, []);
	await context.close();
});
