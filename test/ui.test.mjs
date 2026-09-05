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
const { RELEASE } = await import('../js/about.js');
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
	await page.evaluateOnNewDocument(release => { try { localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true'); localStorage.setItem('bdo-tracker/release', release); } catch { /* fine */ } }, RELEASE);
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
	await seed(page);
	// Waiting for the thing rather than for a number of milliseconds:
	// the Ship screen does more work than it did when this was written
	// and a fixed 200ms went from comfortable to marginal under a full
	// parallel run, which is how a test starts failing one time in ten.
	await page.waitForSelector('[data-act="crew-fit-pick"][data-slot="cannon"]', { timeout: 10000 });
	await page.click('[data-act="crew-fit-pick"][data-slot="cannon"]');
	await page.waitForSelector('.picker-row', { timeout: 10000 });
	assert.ok(await count(page, '.picker-row') >= 3, 'parts to choose from');
	await page.type('.picker-in', 'chiro');
	await page.waitForFunction(() => /chiro/i.test(document.querySelector('.picker-row.on .picker-label')?.textContent || ''), { timeout: 10000 });
	assert.match(await text(page, '.picker-row.on .picker-label'), /Chiro/, 'typing ranks the part first');
	await page.keyboard.press('Enter');
	await page.waitForFunction(() => /which level/i.test(document.querySelector('#dialog h2')?.textContent || ''), { timeout: 10000 });
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

test('a pick-one favourite chosen ahead claims in one press', async () => {
	const { page, context, errors } = await open('#quests');
	// Choose ahead: the picker opens, the pick is kept, nothing claimed.
	await page.click('[data-act="quest-pick-set"]'); await wait(300);
	assert.match(await text(page, '#dialog h2'), /which reward do you take/i);
	await page.evaluate(() => document.querySelector('.picker-row').click()); await wait(300);
	assert.equal(await count(page, '.quest.done'), 0, 'choosing ahead claims nothing');
	const picks = await page.evaluate(async () => (await import('/js/state.js')).getProfile('questPicks', {}));
	assert.equal(Object.keys(picks).length, 1, 'the favourite is kept');
	// The row now records it in one press, no picker in the way.
	const id = Object.keys(picks)[0];
	await page.click(`[data-act="quest-claim"][data-quest="${id}"]`); await wait(300);
	assert.ok(await count(page, '.quest.done') >= 1, 'one press, no question');
	assert.equal(await count(page, '#dialog:not([hidden])'), 0, 'no picker opened');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the pouch shortens big silver and hands the caret exact digits', async () => {
	const { page, context, errors } = await open('#plan');
	await page.evaluate(async () => (await import('/js/state.js')).setStock('Silver', 1960000000));
	await wait(400);
	const sel = '[data-act="purse"][aria-label="Silver you hold"]';
	assert.equal(await page.$eval(sel, el => el.value), '1.96b');
	await page.focus(sel); await wait(100);
	assert.equal(await page.$eval(sel, el => el.value), '1960000000', 'the caret gets exact digits');
	await page.$eval(sel, el => el.blur()); await wait(300);
	assert.equal(await page.$eval(sel, el => el.value), '1.96b', 'the short form comes back');
	assert.equal(await page.evaluate(async () => (await import('/js/state.js')).getStock('Silver')), 1960000000, 'focus alone changes nothing');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the hire picker names each race once', async () => {
	const { page, context, errors } = await open('#crew');
	await page.click('[data-act="crew-hire"]'); await wait(300);
	const groups = await page.evaluate(() => [...document.querySelectorAll('.picker-group')].map(g => g.textContent.trim()));
	assert.deepEqual(groups, [...new Set(groups)], 'no heading repeats');
	assert.equal(groups.length, 5, 'four races and the first mates');
	// Rank by speed: the list goes flat and the fastest growth leads.
	await page.click('[data-picker-chip="sort:speed"]'); await wait(200);
	assert.equal(await count(page, '.picker-group'), 0, 'a ranked list has no headings');
	assert.equal(await text(page, '.picker-row .picker-label'), 'Innocent', 'the best level-10 speed leads');
	// Narrow to one race.
	await page.click('[data-picker-chip="sort:speed"]'); await page.click('[data-picker-chip="race:Goblin"]'); await wait(200);
	const left = await page.evaluate(() => [...document.querySelectorAll('.picker-row .picker-sub')].map(s => s.textContent));
	assert.ok(left.length > 0 && left.every(s => s.startsWith('Goblin')), 'only goblins remain');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a drag that starts on a barterer pin pans the chart, a tap still opens it', async () => {
	const { page, context, errors } = await open('#map');
	await page.waitForSelector('.map-pin:not([hidden])', { timeout: 15000 }); await wait(1500);
	const midPin = () => page.evaluate(() => {
		const box = document.querySelector('[data-map]').getBoundingClientRect();
		const mid = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
		const pins = [...document.querySelectorAll('.map-pin:not([hidden])')]
			.map(p => { const r = p.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })
			.filter(p => Math.abs(p.x - mid.x) < box.width * 0.3 && Math.abs(p.y - mid.y) < box.height * 0.3);
		return pins[0] || null;
	});
	const at = await midPin();
	assert.ok(at, 'a pin near the middle of the chart');
	const firstPinX = () => page.evaluate(() => document.querySelector('.map-pin:not([hidden])').getBoundingClientRect().left);
	const before = await firstPinX();
	await page.mouse.move(at.x, at.y);
	await page.mouse.down();
	await page.mouse.move(at.x + 140, at.y, { steps: 10 }); await wait(300);
	await page.mouse.up(); await wait(500);
	assert.ok(Math.abs(await firstPinX() - before) > 60, 'the chart moved under the drag');
	// A tap without movement still opens the pin's tip.
	const tap = await midPin();
	assert.ok(tap, 'a pin to tap');
	await page.mouse.click(tap.x, tap.y); await wait(800);
	assert.equal(await page.evaluate(() => document.querySelector('[data-map-tip]').hidden), false, 'the tap opened the tip');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a habitat tap counts once, not twice', async () => {
	const { page, context, errors } = await open('#map', { touch: true });
	await page.waitForSelector('.map-habitat:not([hidden])', { timeout: 15000 }); await wait(1500);
	await page.evaluate(() => {
		window.__habClicks = 0;
		document.addEventListener('click', e => { if (e.target.closest('.map-habitat')) window.__habClicks++; }, true);
	});
	const at = await page.evaluate(() => {
		const h = document.querySelector('.map-habitat:not([hidden])');
		const r = h.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	});
	await page.touchscreen.tap(at.x, at.y); await wait(400);
	assert.equal(await page.evaluate(() => window.__habClicks), 1, 'one tap, one click');
	await page.touchscreen.tap(at.x, at.y); await wait(400);
	assert.equal(await page.evaluate(() => window.__habClicks), 2, 'the second tap counts once too');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the phone menu goes with the screen it was opened over', async () => {
	const { page, context, errors } = await open('#plan', { touch: true });
	await page.click('[data-act="menu"]'); await wait(200);
	assert.equal(await count(page, '.masthead-actions.open'), 1, 'the menu opened');
	await page.click('.tabbar-btn[data-id="inventory"]'); await wait(300);
	assert.equal(await count(page, '.masthead-actions.open'), 0, 'a tab press closes it');
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

test('a ship in a link is looked at first, and the missing parts can queue', async () => {
	const { page, context, errors } = await open('#crew');
	const link = await page.evaluate(async () => {
		const s = await import('/js/share.js');
		const setup = { ship: 'Carrack (Valor)', fitted: { cannon: "+9 Epheria Carrack: Valor (Chiro's Cannon)" }, roster: [], seats: {} };
		return s.shareLink(await s.encodeShare({ stock: {}, setup })).replace('#share/', '#ship/');
	});
	const p2 = await context.newPage();
	await p2.goto(link, { waitUntil: 'domcontentloaded' }); await wait(900);
	assert.match(await text(p2, '#dialog h2'), /a ship in a link/i);
	assert.equal(await count(p2, '.share-part'), 1, 'the fitted part is laid out');
	assert.match(await text(p2, '.share-part'), /not in your inventory/i);
	await p2.click('[data-ship-queue]'); await wait(400);
	const targets = await p2.evaluate(async () => (await import('/js/state.js')).saveShape().targets.map(t => t.item));
	assert.ok(targets.includes("+9 Epheria Carrack: Valor (Chiro's Cannon)"), 'the missing part joined the queue');
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

test('a sea crystal is chosen by grade and shows on the ship card', async () => {
	const { page, context, errors } = await open('#crew');
	await seed(page); await wait(400);
	assert.equal(await count(page, '.slot-card.crystal'), 1);
	await page.click('[data-act="crew-crystal-pick"]'); await wait(200);
	assert.ok(await count(page, '.picker-row') > 280, 'every variant is offered');
	await page.type('.picker-in', 'rusalka speed'); await wait(150);
	await page.keyboard.press('Enter'); await wait(400);
	assert.match(await text(page, '.slot-card.crystal'), /Rusalka Sea Crystal.*speed \+4\.5%/i);
	assert.match(await text(page, '.ship-card'), /crystal 4\.5/);
	await page.click('[data-act="crew-crystal-none"]'); await wait(300);
	assert.match(await text(page, '.slot-card.crystal'), /No crystal/);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the hunt courses and grounds stay above the tiles through a zoom', async () => {
	const { page, context, errors } = await open('#map', { touch: true });
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'hunt', panelOpen: false, coursesOn: ['balenos', 'lekrashan'], huntsOn: ['nineshark'], habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.map-course-line'); await wait(800);
	// Tiles that have arrived and would paint over a layer: a higher
	// z-index, or the same one and a later place in the DOM.
	const covered = () => page.evaluate(() => {
		const layer = document.querySelector('[data-map-layer]');
		const kids = [...layer.children];
		const zi = e => { const z = getComputedStyle(e).zIndex; return z === 'auto' ? 0 : Number(z); };
		// The tiles sit in one box per zoom level; the box is what stacks.
		const above = el => kids.filter(t => t.classList.contains('map-tiles') && [...t.children].some(i => getComputedStyle(i).opacity === '1')
			&& (zi(t) > zi(el) || (zi(t) === zi(el) && kids.indexOf(t) > kids.indexOf(el)))).length;
		const course = layer.querySelector('.map-course-layer');
		return { course: above(course), hunt: above(layer.querySelector('.map-hunt-layer')), tiles: layer.querySelectorAll('.map-tile').length };
	});
	const zoom = () => page.evaluate(async () => { const m = await import('/js/screen-map.js'); m.mapZoomStep(1); });
	for (let i = 0; i < 4; i++) {
		await zoom(); await wait(500);
		const c = await covered();
		assert.ok(c.tiles > 0, 'tiles on the chart');
		assert.equal(c.course, 0, `no tile over the course after ${i + 1} zoom steps`);
		assert.equal(c.hunt, 0, `no tile over the hunt dots after ${i + 1} zoom steps`);
	}
	assert.ok(await count(page, '.map-course-path[d]:not([d=""])') > 0, 'the course still has a path');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a species without spawn points still marks its ground when picked', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'hunt', panelOpen: false, habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-map-layer]'); await wait(600);
	await page.evaluate(() => import('/js/screen-map.js').then(m => { m.showHunt('saltwater-crocodile'); m.paintMap(); })); await wait(1800);
	// The fit centres on the ground; the hunt canvas must have ink there.
	const painted = await page.evaluate(() => {
		const cv = document.querySelector('.map-hunt-layer'); if (!cv) return 'no canvas';
		const dpr = window.devicePixelRatio || 1, g = cv.getContext('2d');
		const cx = Math.round(cv.width / 2), cy = Math.round(cv.height / 2);
		const d = g.getImageData(cx - 30 * dpr, cy - 30 * dpr, 60 * dpr, 60 * dpr).data;
		let ink = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
		return ink;
	});
	assert.ok(typeof painted === 'number' && painted > 20, `ink at the crocodiles' ground: ${painted}`);
	assert.deepEqual(errors, []);
	await context.close();
});

test('island names show once the chart is close, hide on the toggle, and the panel flips sides', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'hunt', panelOpen: true, habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-map-layer]'); await wait(600);
	const shownLabels = () => page.evaluate(() => [...document.querySelectorAll('.map-label')].filter(e => getComputedStyle(e).display !== 'none').length);
	assert.equal(await shownLabels(), 0, 'too far out to read names');
	for (let i = 0; i < 2; i++) { await page.evaluate(() => import('/js/screen-map.js').then(m => m.mapZoomStep(1))); await wait(700); }
	let shown = 0;
	for (let i = 0; i < 10 && shown <= 3; i++) { await wait(300); shown = await shownLabels(); }
	assert.ok(shown > 3, `names appear once close (${shown})`);
	// Never the same name twice: what the ports and the wanted pins
	// already spell out is not written again underneath them.
	const doubled = await page.evaluate(() => {
		const seen = new Map();
		const put = (t, from) => { const k = (t || '').trim().replace(/ Islands?$/, '').toLowerCase(); if (k) seen.set(k, (seen.get(k) || []).concat(from)); };
		for (const e of document.querySelectorAll('.map-port-name')) put(e.textContent, 'port');
		for (const e of document.querySelectorAll('.map-pin.wanted .map-pin-at')) put(e.textContent, 'pin');
		for (const e of document.querySelectorAll('.map-label')) if (getComputedStyle(e).display !== 'none') put(e.textContent, 'label');
		return [...seen].filter(([, from]) => from.includes('label') && from.length > 1).map(([k]) => k);
	});
	assert.deepEqual(doubled, [], 'no island named twice');
	await page.click('[data-act="map-labels"]'); await wait(300);
	assert.equal(await shownLabels(), 0, 'and go on the toggle');
	assert.equal(await page.evaluate(() => document.querySelector('[data-map]').classList.contains('side-right')), false);
	await page.click('[data-act="map-side-flip"]'); await wait(300);
	assert.equal(await page.evaluate(() => document.querySelector('[data-map]').classList.contains('side-right')), true, 'the panel moved right');
	const side = await page.evaluate(() => { const r = document.querySelector('.map-side').getBoundingClientRect(), m = document.querySelector('[data-map]').getBoundingClientRect(); return r.left - m.left > (m.width / 2); });
	assert.ok(side, 'and sits on the right half of the chart');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a route traced by hand: stops by click, a note, a link back, and it stays put through a zoom', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'trace', panelOpen: true, habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-act="trace-tool"]'); await wait(600);
	await page.click('[data-act="trace-tool"][data-id="point"]'); await wait(200);
	const box = await (await page.$('[data-map]')).boundingBox();
	// Two clicks on open sea, right of the panel.
	const at = [[box.x + box.width * 0.7, box.y + box.height * 0.3], [box.x + box.width * 0.85, box.y + box.height * 0.5]];
	for (const [x, y] of at) { await page.mouse.click(x, y); await wait(250); }
	assert.equal(await count(page, '.map-trace-dot'), 2, 'two stops on the chart');
	assert.equal(await count(page, '.map-trace-stop'), 2, 'and in the panel');
	const dotBefore = await page.evaluate(() => { const d = document.querySelector('.map-trace-dot'); return [parseFloat(d.style.left), parseFloat(d.style.top)]; });
	// A note on the first stop.
	await page.type('[data-act="trace-point-note"][data-i="0"]', 'start here');
	await page.$eval('[data-act="trace-point-note"][data-i="0"]', el => el.dispatchEvent(new Event('change', { bubbles: true }))); await wait(200);
	assert.equal(await text(page, '.map-trace-dot.noted .map-trace-note'), 'start here');
	// Zoom: the stop moves with the chart, so its screen position changes.
	await page.evaluate(() => import('/js/screen-map.js').then(m => m.mapZoomStep(1))); await wait(500);
	const dotAfter = await page.evaluate(() => { const d = document.querySelector('.map-trace-dot'); return [parseFloat(d.style.left), parseFloat(d.style.top)]; });
	assert.notDeepEqual(dotAfter, dotBefore, 'anchored to the sea, not the screen');
	// Through a link and back.
	const payload = await page.evaluate(async () => {
		const { encodeAny } = await import('/js/share.js');
		const t = JSON.parse(localStorage.getItem('bdo-tracker/map-view')).trace;
		return encodeAny({ kind: 'trace', name: 'Test run', notes: '', points: t.points, strokes: t.strokes });
	});
	await page.evaluate(() => localStorage.removeItem('bdo-tracker/map-view'));
	await page.goto(base + '/#trace/' + payload, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.map-trace-dot', { timeout: 15000 }); await wait(500);
	assert.equal(await count(page, '.map-trace-dot'), 2, 'the link carried both stops');
	assert.equal(await page.evaluate(() => document.querySelector('[data-act="trace-name"]').value), 'Test run');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the pen has ink: a colour, a width, words on the water -- and undo walks back the way it came', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'trace', panelOpen: true, habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-act="trace-tool"]'); await wait(600);
	const box = await (await page.$('[data-map]')).boundingBox();
	const sea = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];

	// The trace tab hands the sea to the pen: the chart's markers stay in
	// view but stop answering, so a line can be drawn across one.
	assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.map-port')).pointerEvents), 'none');
	await page.click('[data-act="map-mode"][data-id="sail"]'); await wait(300);
	assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('.map-port')).pointerEvents), 'none');
	await page.click('[data-act="map-mode"][data-id="trace"]'); await wait(300);

	// Violet, bold, drawn.
	await page.click('[data-act="trace-ink"][data-colour="#c6a0ff"]'); await wait(150);
	await page.click('[data-act="trace-width"][data-v="4.5"]'); await wait(150);
	await page.click('[data-act="trace-tool"][data-id="pen"]'); await wait(200);
	await page.mouse.move(...sea(0.55, 0.3));
	await page.mouse.down();
	for (let i = 1; i <= 6; i++) { await page.mouse.move(...sea(0.55 + i * 0.03, 0.3 + i * 0.02)); await wait(30); }
	await page.mouse.up(); await wait(300);
	const pen = await page.evaluate(() => { const p = document.querySelector('.map-trace-stroke'); return [p.style.stroke, p.style.strokeWidth]; });
	assert.deepEqual(pen, ['rgb(198, 160, 255)', '4.5'], 'the stroke kept the ink and the width it was drawn with');

	// A word on the water, typed where it was put.
	await page.click('[data-act="trace-tool"][data-id="text"]'); await wait(200);
	await page.mouse.click(...sea(0.75, 0.62)); await wait(300);
	await page.waitForSelector('.map-trace-write');
	await page.type('.map-trace-write', 'reef here');
	await page.keyboard.press('Enter'); await wait(300);
	assert.equal(await text(page, '.map-trace-word'), 'reef here');
	assert.equal(await page.evaluate(() => document.querySelector('.map-trace-word').style.color), 'rgb(198, 160, 255)');
	assert.equal(await count(page, '[data-act="trace-text"]'), 1, 'and it is listed in the panel');

	// Stop, stroke, stop: undo must take back the last thing done, not
	// empty one list before it touches another.
	await page.click('[data-act="trace-tool"][data-id="point"]'); await wait(200);
	await page.mouse.click(...sea(0.6, 0.75)); await wait(250);
	await page.click('[data-act="trace-tool"][data-id="pen"]'); await wait(200);
	await page.mouse.move(...sea(0.5, 0.8));
	await page.mouse.down();
	for (let i = 1; i <= 5; i++) { await page.mouse.move(...sea(0.5 + i * 0.02, 0.8 - i * 0.02)); await wait(30); }
	await page.mouse.up(); await wait(300);
	await page.click('[data-act="trace-tool"][data-id="point"]'); await wait(200);
	await page.mouse.click(...sea(0.68, 0.85)); await wait(250);
	const marks = () => page.evaluate(() => [document.querySelectorAll('.map-trace-dot').length, document.querySelectorAll('.map-trace-stroke').length, document.querySelectorAll('.map-trace-word').length]);
	assert.deepEqual(await marks(), [2, 2, 1], 'two stops, two strokes, a word');
	await page.click('[data-act="trace-undo"]'); await wait(250);
	assert.deepEqual(await marks(), [1, 2, 1], 'the last stop went first');
	await page.click('[data-act="trace-undo"]'); await wait(250);
	assert.deepEqual(await marks(), [1, 1, 1], 'then the stroke drawn before it');
	await page.click('[data-act="trace-undo"]'); await wait(250);
	assert.deepEqual(await marks(), [0, 1, 1], 'then the stop before that');
	await page.click('[data-act="trace-undo"]'); await wait(250);
	assert.deepEqual(await marks(), [0, 1, 0], 'then the word');

	// The ink travels with the trace.
	const back = await page.evaluate(async () => {
		const { encodeAny, decodeAny } = await import('/js/share.js');
		const t = JSON.parse(localStorage.getItem('bdo-tracker/map-view')).trace;
		return decodeAny(await encodeAny({ kind: 'trace', name: 'Ink run', notes: '', points: t.points, strokes: t.strokes, texts: t.texts }));
	});
	assert.equal(back.strokes[0].colour, '#c6a0ff');
	assert.equal(back.strokes[0].width, 4.5);
	assert.deepEqual(errors, []);
	await context.close();
});

test('a stop and a word are picked up and carried to where they belong', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'trace', panelOpen: true, habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-act="trace-tool"]'); await wait(600);
	const box = await (await page.$('[data-map]')).boundingBox();
	const sea = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
	const held = () => page.evaluate(() => JSON.parse(localStorage.getItem('bdo-tracker/map-view')).trace);
	const carry = async (sel, dx, dy) => {
		const at = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
		await page.mouse.move(...at);
		await page.mouse.down();
		for (let i = 1; i <= 5; i++) { await page.mouse.move(at[0] + dx * i / 5, at[1] + dy * i / 5); await wait(30); }
		await page.mouse.up(); await wait(300);
	};

	// A stop, carried.
	await page.click('[data-act="trace-tool"][data-id="point"]'); await wait(200);
	await page.mouse.click(...sea(0.55, 0.35)); await wait(300);
	const stopWas = (await held()).points[0];
	await carry('.map-trace-dot', 90, 60);
	const stopNow = (await held()).points[0];
	assert.notDeepEqual([stopNow.x, stopNow.y], [stopWas.x, stopWas.y], 'the stop went where it was let go');
	assert.ok(stopNow.x > stopWas.x && stopNow.y > stopWas.y, 'and in the direction it was carried');
	assert.equal(await count(page, '.map-trace-dot'), 1, 'carrying a stop does not lay down another');

	// A word, carried -- and tapped, which opens it for retyping.
	await page.click('[data-act="trace-tool"][data-id="text"]'); await wait(200);
	await page.mouse.click(...sea(0.75, 0.6)); await wait(300);
	await page.waitForSelector('.map-trace-write');
	await page.type('.map-trace-write', 'sho');
	// A redraw of the whole screen tears the input out from under the
	// hand; the word must survive it and go on being typed.
	await page.evaluate(() => import('/js/ui.js').then(m => m.render())); await wait(400);
	await page.waitForSelector('.map-trace-write');
	await page.type('.map-trace-write', 'al');
	await page.keyboard.press('Enter'); await wait(300);
	const wordWas = (await held()).texts[0];
	assert.equal(wordWas.text, 'shoal', 'the word was not lost to a redraw');
	await carry('.map-trace-word', -80, 70);
	const wordNow = (await held()).texts[0];
	assert.ok(wordNow.x < wordWas.x && wordNow.y > wordWas.y, 'the word followed the pointer');
	assert.equal(wordNow.text, 'shoal', 'and kept what it says');
	await page.click('.map-trace-word'); await wait(300);
	assert.equal(await page.evaluate(() => { const e = document.querySelector('.map-trace-write'); return e && e.value; }), 'shoal', 'a tap opens it to retype');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the barterers and the traces are layers like any other, on whichever tab is open', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'sail', panelOpen: true, habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.map-pin'); await wait(700);
	// What the chart draws is the same question on every tab, so the
	// switches are above them rather than inside the hunting one.
	assert.equal(await count(page, '.map-chip'), 6, 'the strip is there on the barter tab');
	for (const id of ['route', 'trace', 'hunt', 'today']) {
		await page.click(`[data-act="map-mode"][data-id="${id}"]`); await wait(300);
		assert.equal(await count(page, '.map-chip'), 6, `and on ${id}`);
	}
	await page.click('[data-act="map-mode"][data-id="sail"]'); await wait(300);
	// It folds away when it is in the road, and comes back.
	await page.click('[data-act="map-layers"]'); await wait(300);
	assert.equal(await count(page, '.map-chip'), 0);
	await page.click('[data-act="map-layers"]'); await wait(300);
	assert.equal(await count(page, '.map-chip'), 6);
	assert.ok(await count(page, '.map-pin') > 10, 'the islands are marked to begin with');
	await page.click('[data-act="map-pins"]'); await wait(400);
	assert.equal(await count(page, '.map-pin'), 0, 'put away, the marks leave the sea bare');
	await page.click('[data-act="map-pins"]'); await wait(400);
	assert.ok(await count(page, '.map-pin') > 10, 'and come back');

	// The wharves answer to the strip too.
	await page.click('[data-act="map-wharves"][data-id="wharf"]'); await wait(400);
	assert.ok(await count(page, '.map-wharf') > 10, 'the wharf managers come out');
	await page.click('[data-act="map-wharves"][data-id="wharf"]'); await wait(400);
	assert.equal(await count(page, '.map-wharf:not([hidden])'), 0, 'and go away again');

	// The same for what is traced by hand.
	await page.click('[data-act="map-mode"][data-id="trace"]'); await wait(400);
	await page.click('[data-act="trace-tool"][data-id="point"]'); await wait(200);
	const box = await (await page.$('[data-map]')).boundingBox();
	for (const [fx, fy] of [[0.6, 0.35], [0.75, 0.5]]) { await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await wait(250); }
	assert.equal(await count(page, '.map-trace-dot'), 2);
	await page.click('[data-act="map-traces"]'); await wait(400);
	assert.equal(await count(page, '.map-trace-dot'), 0, 'hidden, not lost');
	assert.equal(await count(page, '.map-trace-stop'), 2, 'the stops are still on the panel');
	await page.click('[data-act="map-traces"]'); await wait(400);
	assert.equal(await count(page, '.map-trace-dot'), 2, 'and shown again');
	assert.deepEqual(errors, []);
	await context.close();
});

test('traces are kept on a shelf: named, drawn small, renamed, and laid over the chart by their eye', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'trace', panelOpen: true, habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('[data-act="trace-tool"]'); await wait(600);
	const box = await (await page.$('[data-map]')).boundingBox();
	const sea = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy];
	const keep = async (name, spots) => {
		await page.click('[data-act="trace-tool"][data-id="point"]'); await wait(200);
		for (const [fx, fy] of spots) { await page.mouse.click(...sea(fx, fy)); await wait(220); }
		await page.$eval('[data-act="trace-name"]', (el, n) => { el.value = n; el.dispatchEvent(new Event('change', { bubbles: true })); }, name);
		await wait(200);
		await page.click('[data-act="trace-save"]'); await wait(350);
		await page.click('[data-act="trace-clear"]'); await wait(350);
	};
	await keep('Coral loop', [[0.55, 0.3], [0.66, 0.42], [0.75, 0.3]]);
	await keep('Cox run', [[0.5, 0.6], [0.62, 0.7]]);
	assert.equal(await count(page, '.trace-card'), 2, 'both are on the shelf');
	assert.equal(await count(page, '.trace-thumb'), 2, 'each drawn small');
	assert.ok((await text(page, '.trace-card')).includes('kept today'));

	// The eye lays one over the chart without opening it.
	assert.equal(await count(page, '.map-trace-ghost'), 0);
	await page.click('.trace-card:last-child [data-act="trace-eye"]'); await wait(400);
	assert.equal(await count(page, '.map-trace-ghost'), 1, 'one trace laid over the chart');
	assert.equal(await count(page, '.map-trace-ghost .map-trace-dot'), 3, 'with its three stops');
	assert.equal(await page.evaluate(() => document.querySelector('[data-act="trace-name"]').value), '', 'and nothing opened to draw on');

	// Renaming it.
	await page.click('.trace-card:last-child [data-act="trace-rename"]'); await wait(300);
	await page.$eval('[data-trace-name]', el => { el.value = ''; });
	await page.type('[data-trace-name]', 'Reef road');
	await page.click('[data-trace-rename]'); await wait(400);
	assert.ok((await text(page, '.trace-shelf')).includes('Reef road'), 'the shelf calls it what it is now');
	assert.equal(await count(page, '.map-trace-ghost'), 1, 'and it is still on the chart');

	// Opening one puts it in hand, and it is not then drawn twice.
	await page.click('.trace-card:last-child [data-act="trace-load"]'); await wait(600);
	assert.equal(await page.evaluate(() => document.querySelector('[data-act="trace-name"]').value), 'Reef road');
	assert.equal(await count(page, '.map-trace-ghost'), 0, 'the one in hand is not also a ghost of itself');
	assert.equal(await count(page, '.map-trace-dot'), 3);
	assert.deepEqual(errors, []);
	await context.close();
});

test('a phone is given a bar at the thumb, not a tab row that scrolls out of sight', async () => {
	const { page, context, errors } = await open('#crew', { touch: true });
	await wait(400);
	assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('tabs')).display), 'none', 'the sideways row is put away');
	assert.equal(await count(page, '.tabbar-btn'), 5, 'four sections and the way to the rest');
	assert.ok(await page.evaluate(() => !!document.querySelector('.tabbar-btn.active[data-id="crew"]')), 'the standing section has a seat of its own');
	await page.click('[data-act="tab-sheet"]'); await wait(400);
	assert.equal(await count(page, '.sheet-tab'), 10, 'every section, named');
	await page.click('.sheet-tab[data-id="workshop"]'); await wait(700);
	assert.equal(await page.evaluate(() => location.hash), '#workshop');
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), true, 'and the sheet closes behind it');
	assert.ok(await page.evaluate(() => !!document.querySelector('.tabbar-btn.active[data-id="workshop"]')));
	const wide = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
	assert.equal(wide[0], wide[1], 'and nothing hangs off the side');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a traced leg goes round the land, and a stop cannot be put on it', async () => {
	const { page, context, errors } = await open('#map');
	// Two stops with an island between them: Akenisi's water to Kami's.
	const seed = {
		name: 'Blocked', notes: '', seq: 2, at: Date.now(), strokes: [], texts: [],
		points: [{ x: 61554, y: 60679, colour: '#ffd77a', seq: 1 }, { x: 78047, y: 44418, colour: '#ffd77a', seq: 2 }]
	};
	await page.evaluate(t => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'trace', panelOpen: true, habitatsOn: false, pinsOn: false, trace: t })); }, seed);
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.map-trace-path'); await wait(900);
	const path = () => page.$eval('.map-trace-path', el => el.getAttribute('d'));
	const bits = d => ({ turns: (d.match(/L/g) || []).length, bows: (d.match(/Q/g) || []).length });
	const bent = bits(await path());
	assert.ok(bent.turns >= 3, 'the leg turns where the water turns');
	assert.equal(bent.bows, 0, 'a line already bent round the land is not bowed as well');

	await page.click('[data-act="trace-hug"]'); await wait(500);
	const straight = bits(await path());
	assert.equal(straight.turns, 0, 'straight legs are one sweep');
	assert.equal(straight.bows, 1);
	await page.click('[data-act="trace-hug"]'); await wait(500);

	// A stop is a place a hull can float: the desert is not one.
	const box = await (await page.$('[data-map]')).boundingBox();
	await page.click('[data-act="trace-tool"][data-id="point"]'); await wait(200);
	await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.75); await wait(400);
	assert.equal(await count(page, '.map-trace-dot'), 2, 'the click on land laid down nothing');
	assert.ok((await text(page, '#toast')).includes('water'), 'and said why');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the traces library: a search, a sort, a filter, and the shelf keeps to a few', async () => {
	const { page, context, errors } = await open('#map');
	const names = ['Coral loop', 'Cox run', 'Vell watch', 'Hekaru sweep', 'Morning barter', 'Ross reef', 'Oquilla loop', 'Nineshark line', 'Padix bay', 'Illya circuit'];
	const traces = names.map((n, i) => ({
		name: n, notes: i === 5 ? 'the shallow way' : '', at: Date.now() - i * 86400e3, seq: 9, shown: i === 8,
		points: [{ x: 40000 + i * 500, y: 40000, seq: 1 }, { x: 42000 + i * 500, y: 43000, seq: 2 }],
		strokes: [], texts: []
	}));
	await page.evaluate(t => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'trace', panelOpen: true, habitatsOn: false, traces: t })); }, traces);
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.trace-card'); await wait(700);
	// The panel is a column beside a chart: it shows a few and the way to the rest.
	assert.equal(await count(page, '.map-side .trace-card'), 5, 'four newest and the one on the chart');
	assert.ok((await text(page, '[data-act="trace-library"]')).includes('10'));

	await page.click('[data-act="trace-library"]'); await wait(500);
	assert.equal(await count(page, '.trace-grid .trace-card'), 10, 'all of them, with room');
	await page.type('[data-lib-search]', 'loop'); await wait(400);
	assert.equal(await count(page, '.trace-grid .trace-card'), 2, 'the search narrows it');
	await page.$eval('[data-lib-search]', el => { el.value = 'shallow'; el.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(400);
	assert.equal(await count(page, '.trace-grid .trace-card'), 1, 'and reads the notes too');
	await page.$eval('[data-lib-search]', el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }); await wait(400);

	await page.click('[data-act="trace-lib-only"][data-id="shown"]'); await wait(400);
	assert.equal(await count(page, '.trace-grid .trace-card'), 1, 'only what is on the chart');
	await page.click('[data-act="trace-lib-only"][data-id="all"]'); await wait(400);
	await page.click('[data-act="trace-lib-sort"][data-id="name"]'); await wait(400);
	assert.equal(await text(page, '.trace-grid .trace-card .trace-card-name'), 'Coral loop', 'sorted by name');

	// Opening one from the library is a thing you do to see the chart.
	await page.click('.trace-grid .trace-card [data-act="trace-load"]'); await wait(700);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), true, 'the library stands aside');
	assert.equal(await page.evaluate(() => document.querySelector('[data-act="trace-name"]').value), 'Coral loop');
	assert.deepEqual(errors, []);
	await context.close();
});

test('habitat markers never print on top of one another, at any zoom', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'hunt', panelOpen: false, habitatsOn: true })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.map-habitat'); await wait(800);
	const gaps = () => page.evaluate(() => {
		const els = [...document.querySelectorAll('.map-habitat')].filter(e => getComputedStyle(e).display !== 'none');
		const at = els.map(e => { const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(e.style.transform); return [parseFloat(m[1]), parseFloat(m[2])]; });
		// Two labels touch when both their horizontal and vertical gaps are small.
		let touching = 0;
		for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) {
			if (Math.abs(at[i][0] - at[j][0]) < 140 && Math.abs(at[i][1] - at[j][1]) < 64) touching++;
		}
		return { n: els.length, touching, grouped: els.filter(e => e.classList.contains('many')).length };
	});
	const first = await gaps();
	assert.ok(first.n > 0 && first.grouped > 0, 'at the widest zoom some grounds share a picture');
	for (let i = 0; i < 4; i++) {
		const g = await gaps();
		assert.equal(g.touching, 0, `${g.touching} label pairs touch after ${i} zoom steps`);
		await page.evaluate(async () => { const m = await import('/js/screen-map.js'); m.mapZoomStep(1); }); await wait(500);
	}
	assert.deepEqual(errors, []);
	await context.close();
});

test('habitat markers follow a pan, hide and return once, and the Lyngbakr stands alone', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'hunt', panelOpen: false, habitatsOn: true })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('#pouch .pouch-item'); await wait(1500);
	const marker = () => page.evaluate(() => { const e = document.querySelector('.map-habitat:not([hidden])'); return e ? [e.dataset.key, e.style.transform] : null; });
	const pin = () => page.evaluate(() => { const e = document.querySelector('[data-act="map-pin"]:not([hidden])'); return e ? e.style.transform : null; });
	const before = { m: await marker(), p: await pin() };
	// A drag on open sea: a spot inside the box that no pin, marker or
	// panel sits on -- the chart's furniture takes its own gestures.
	const spot = await page.evaluate(() => {
		const box = document.getElementById('map').getBoundingClientRect();
		const furniture = '[data-act="map-pin"], [data-act="map-port"], .map-habitat, .map-side, .map-side-pill, .map-tip, .map-mini, .map-steps, .map-wharf';
		for (let y = 0.2; y < 0.9; y += 0.1) for (let x = 0.2; x < 0.95; x += 0.1) {
			const px = box.left + box.width * x, py = box.top + box.height * y;
			const el = document.elementFromPoint(px, py);
			if (el && el.closest('[data-map]') && !el.closest(furniture)) return { x: px, y: py };
		}
		return null;
	});
	assert.ok(spot, 'some open sea to drag');
	await page.mouse.move(spot.x, spot.y); await page.mouse.down();
	await page.mouse.move(spot.x - 220, spot.y - 140, { steps: 6 }); await page.mouse.up(); await wait(400);
	const after = { m: await marker(), p: await pin() };
	assert.notEqual(after.p, before.p, 'the pins moved');
	assert.notEqual(after.m[1], before.m[1], 'the markers moved with them');
	const keys = () => page.evaluate(() => [...document.querySelectorAll('.map-habitat')].map(e => e.dataset.key));
	const once = await keys();
	assert.equal(new Set(once).size, once.length, 'one element per marker');
	await page.click('[data-act="map-panel"]'); await wait(300);
	// Painted, not merely flagged: a class that sets its own display
	// once beat the hidden attribute, and the markers stayed on screen.
	const shown = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].filter(e => getComputedStyle(e).display !== 'none').length, sel);
	assert.ok(await shown('.map-habitat') > 0, 'markers painted while on');
	await page.click('[data-act="map-habitats"]'); await wait(200);
	assert.equal(await shown('.map-habitat'), 0, 'none painted once off');
	await page.click('[data-act="map-habitats"]'); await wait(300);
	assert.ok(await shown('.map-habitat') > 0, 'painted again');
	// The wharf managers answer their own toggle the same way.
	await page.click('[data-act="map-wharves"][data-id="wharf"]'); await wait(200);
	assert.ok(await shown('.map-wharf.wharf') > 0, 'wharves painted while on');
	await page.click('[data-act="map-wharves"][data-id="wharf"]'); await wait(200);
	assert.equal(await shown('.map-wharf.wharf'), 0, 'none painted once off');
	const again = await keys();
	assert.equal(new Set(again).size, again.length, 'still one element per marker');
	// The Lyngbakr ground is its own: no Nineshark or Black Rust marker within a few kilometres.
	const clash = await page.evaluate(async () => {
		const { monsters } = await import('/js/sea_monsters.js');
		const ly = monsters.find(m => m.key === 'lyngbakr');
		const cx = ly.points.reduce((a, p) => a + p[0], 0) / ly.points.length, cy = ly.points.reduce((a, p) => a + p[1], 0) / ly.points.length;
		return monsters.filter(m => ['nineshark', 'black-rust'].includes(m.key)).flatMap(m => m.points).filter(([x, y]) => Math.hypot(x - cx, y - cy) < 8000).length;
	});
	assert.equal(clash, 0);
	assert.deepEqual(errors, []);
	await context.close();
});

test('a dialog opened from the More menu hands focus back to More, not to the page', async () => {
	// The opener is a button inside a menu that closes behind it, and
	// .focus() on a hidden element quietly does nothing -- so Escape used
	// to leave a keyboard user standing on <body> at the top of the page.
	const { page, context, errors } = await open('#plan');
	await wait(400);
	await page.click('[data-act="more"]'); await wait(200);
	await page.click('[data-act="export"]'); await wait(500);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), false);
	await page.keyboard.press('Escape'); await wait(400);
	assert.equal(await page.evaluate(() => document.activeElement?.dataset?.act), 'more',
		'focus went back to the menu the dialog was chosen from');
	// A dialog opened from a button that is still on screen still returns
	// to that button, which is the case that already worked.
	await page.click('[data-act="jump"]'); await wait(400);
	await page.keyboard.press('Escape'); await wait(400);
	assert.equal(await page.evaluate(() => document.activeElement?.dataset?.act), 'jump');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the tour library is not run until the tour is asked for', async () => {
	// 25 KB of Driver.js parsed on a page nobody tours is 25 KB wasted, so
	// the <script> tag is gone and guided-tour.js inserts it on demand.
	// The service worker still precaches the file for offline, which is
	// why this asks whether the library has *run* -- window.driver is
	// defined by executing it -- rather than whether it came down.
	const { page, context, errors } = await open('#plan');
	await wait(800);
	assert.equal(await page.evaluate(() => typeof window.driver), 'undefined', 'the library ran before anyone asked for a tour');

	await page.click('[data-act="more"]'); await wait(200);
	await page.click('[data-act="tour"]'); await wait(3000);
	assert.notEqual(await page.evaluate(() => typeof window.driver), 'undefined', 'asking for the tour did not bring the library in');
	assert.ok(await page.evaluate(() => !!document.querySelector('.driver-popover')), 'and no tour appeared');
	await page.evaluate(() => document.querySelector('.driver-popover-close-btn')?.click());
	await wait(900);
	assert.equal(await page.evaluate(() => !!document.querySelector('.driver-popover')), false, 'and it would not close again');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the water shader is only started when it is switched on', async () => {
	// It is off by default, so a static import made every visitor parse a
	// canvas most of them never see. The module is imported by waterOn().
	const { page, context, errors } = await open('#plan');
	await wait(800);
	assert.equal(await page.evaluate(() => !!document.querySelector('canvas')), false, 'a shader nobody asked for is running');
	await page.click('[data-act="more"]'); await wait(200);
	await page.click('[data-act="water"]'); await wait(2500);
	assert.ok(await page.evaluate(() => !!document.querySelector('canvas')), 'switching it on started nothing');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the names on the chart do not print over each other', async () => {
	// Margoria puts a dozen wanted islands in one corner, and their names
	// used to land on top of one another. Each layer now gives way to the
	// ones already written; a folded-away name is still there on hover.
	const { page, context, errors } = await open('#map');
	await page.waitForSelector('.map-tile', { timeout: 20000 });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget("Epheria Carrack: Valor (Chiro's Sail)", 1);
		store.addTarget("Epheria Carrack: Valor (Chiro's Cannon)", 1);
	});
	await wait(3000);
	const seen = await page.evaluate(() => {
		const visible = el => {
			if (el.hidden || el.offsetParent === null) return false;
			for (let n = el; n && n !== document.body; n = n.parentElement) {
				if (Number(getComputedStyle(n).opacity) === 0) return false;
			}
			return true;
		};
		const boxes = [...document.querySelectorAll('.map-pin-at, .map-label, .map-port-name')]
			.filter(visible).map(el => el.getBoundingClientRect()).filter(r => r.width > 0);
		let overlaps = 0;
		for (let i = 0; i < boxes.length; i++) {
			for (let j = i + 1; j < boxes.length; j++) {
				const a = boxes[i], b = boxes[j];
				if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++;
			}
		}
		return { shown: boxes.length, overlaps };
	});
	assert.ok(seen.shown > 5, 'the chart stopped naming anything at all');
	assert.equal(seen.overlaps, 0, `${seen.overlaps} pairs of names are printing over each other`);
	// The pin itself never goes away, only its name.
	const pins = await count(page, '.map-pin.wanted');
	assert.ok(pins > await count(page, '.map-pin.wanted:not(.name-off)'), 'nothing was folded away to make room');
	assert.ok(pins > 0);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the region starts at NA, and the Vell clock follows whichever region is standing', async () => {
	// One setting decides two things: which server the Market is priced
	// against, and which timetable Vell is counted down to. They must not
	// be able to disagree, so both read the same default.
	const { page, context, errors } = await open('#plan');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Valor)', 1);
	});
	await wait(1200);
	const start = await page.evaluate(async () => {
		const market = await import('/js/market.js');
		const today = await import('/js/today.js');
		return { def: market.DEFAULT_REGION, active: market.region(), first: market.REGIONS[0][0], vell: today.vellPlan() };
	});
	assert.equal(start.def, 'na');
	assert.equal(start.active, 'na', 'a browser that has never chosen is not on NA');
	assert.equal(start.first, 'na', 'and NA is not the first region offered');
	assert.equal(start.vell.label, 'NA');
	assert.equal(start.vell.zone, 'America/Los_Angeles', 'Vell is being counted to the wrong server');
	assert.match(await text(page, '.today'), /NA: .*Los Angeles time/, 'the Vell tile does not say which server it means');

	// Change the region and the timetable moves with it.
	await page.evaluate(async () => { (await import('/js/market.js')).setRegion('eu'); });
	await wait(1200);
	const moved = await page.evaluate(async () => (await import('/js/today.js')).vellPlan());
	assert.equal(moved.label, 'EU');
	assert.equal(moved.zone, 'Europe/Berlin', 'the Vell clock did not follow the region');
	assert.match(await text(page, '.today'), /EU: .*Berlin time/);

	// The daily, weekly and barter resets are the game's own UTC clocks
	// and belong to no server, so they must not move with the region.
	const clocks = await page.evaluate(async () => {
		const c = await import('/js/clock.js');
		return { daily: c.DAILY_RESET_UTC, barter: c.BARTER_RESET_UTC, weekly: c.WEEKLY_RESET };
	});
	assert.deepEqual(clocks, { daily: 0, barter: 6, weekly: { day: 4, hour: 0 } });
	assert.deepEqual(errors, []);
	await context.close();
});

test('Find offers a part once, not once per enhancement level', async () => {
	// 720 of the 938 names the app knows are "+N something", from 72
	// parts. Offering them all made "toro sail" eleven near-identical
	// rows. A level is offered when it is real -- held, wanted, or typed.
	const { page, context, errors } = await open('#plan');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setStock('+4 Epheria Carrack: Toro Sail', 1);
	});
	await wait(1200);
	const find = async q => {
		await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control');
		await wait(400);
		await page.type('.jump-in', q); await wait(500);
		const rows = await page.evaluate(() => [...document.querySelectorAll('.jump-row .jump-name')].map(e => e.textContent));
		await page.keyboard.press('Escape'); await wait(300);
		return rows;
	};
	const plain = await find('toro sail');
	assert.equal(plain[0], 'Epheria Carrack: Toro Sail', 'the part itself is not the first answer');
	assert.ok(plain.includes('+4 Epheria Carrack: Toro Sail'), 'the level actually held is not offered');
	assert.equal(plain.filter(n => /^\+/.test(n)).length, 1, 'levels nobody holds are still being listed');

	// Naming a level brings it back, so nothing is unreachable.
	const asked = await find('+7 toro');
	assert.ok(asked.length > 0, 'typing a level found nothing at all');
	assert.ok(asked.every(n => n.startsWith('+7 ')), 'typing a level offered other levels too');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the trip log puts what the builds are short of at the top', async () => {
	// Coming off the water, the thing you sailed for should not be
	// somewhere in one alphabetical run of every name in the game.
	const { page, context, errors } = await open('#plan');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget("Epheria Carrack: Valor (Chiro's Sail)", 1);
	});
	await wait(1500);
	await page.click('[data-act="trip-log"]'); await wait(600);
	await page.evaluate(() => document.querySelector('[data-trip-pick]').click());
	await wait(1200);
	const seen = await page.evaluate(() => ({
		groups: [...document.querySelectorAll('.picker-group')].map(e => e.textContent),
		firstRow: document.querySelector('.picker-row .picker-label')?.textContent,
		firstMeta: document.querySelector('.picker-row .picker-meta')?.textContent,
		rows: document.querySelectorAll('.picker-row').length,
	}));
	assert.equal(seen.groups[0], 'Your builds still need', 'the needed things are not first');
	assert.ok(seen.groups.includes('Everything else'), 'and there is no way through to the rest');
	assert.match(seen.firstMeta || '', /short/, 'the top row does not say how many are wanted');
	// The enhancement levels are filtered here too, so the list is a
	// fraction of every name the app knows.
	assert.ok(seen.rows < 400, `the picker is still offering ${seen.rows} rows`);
	assert.deepEqual(errors, []);
	await context.close();
});

test('Find opens a card for an item, even one nobody owns', async () => {
	// It used to switch to the Inventory and select the thing, which is a
	// dead end for anything with no stock: no row, so an empty panel and
	// a search that looked broken.
	const { page, context, errors } = await open('#plan');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget("Epheria Carrack: Valor (Chiro's Sail)", 1);
	});
	await wait(1500);
	const card = async q => {
		await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control');
		await wait(400);
		await page.type('.jump-in', q); await wait(500);
		await page.keyboard.press('Enter'); await wait(1000);
		return page.evaluate(() => {
			const c = document.querySelector('.item-card');
			return c && { title: c.querySelector('h2')?.innerText, sections: [...c.querySelectorAll('.card-part h3')].map(h => h.innerText) };
		});
	};
	// Something the plan wants: it should say so, and how to get it.
	const wanted = await card('Tidal Black Stone');
	assert.ok(wanted, 'no card opened at all');
	assert.match(wanted.title, /Tidal Black Stone/i);
	assert.ok(wanted.sections.includes('WHERE IT STANDS'), 'the card never says where it stands');
	assert.ok(wanted.sections.some(s => /BARTER/i.test(s)), 'a bartered item does not say where to barter for it');
	await page.keyboard.press('Escape'); await wait(400);

	// And something owned by nobody and wanted by nothing still answers.
	const stranger = await card('Sunset Coral');
	assert.ok(stranger, 'an item with no stock still opens nothing');
	assert.ok(stranger.sections.length > 0, 'the card came up empty');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a fleet of sixty costs the screen one line, and the dialog searches it', async () => {
	// Chips, then cards, then rows: each was fine at three and wrong at
	// thirty, because anything drawn inline grows without limit and
	// pushes the rest of the screen away. The screen now keeps only the
	// ship being sailed -- the one that decides what the Map times its
	// routes at -- and the rest live behind a door.
	const { page, context, errors } = await open('#crew');
	await wait(600);
	await page.evaluate(async () => {
		const ship = await import('/js/ship.js');
		const store = await import('/js/state.js');
		const hulls = ['Panokseon', 'Carrack (Advance)', 'Carrack (Valor)', 'Epheria Caravel'];
		for (let i = 0; i < 40; i++) {
			const h = hulls[i % hulls.length];
			store.setProfile('crewShip', h);
			ship.saveSetup(`${h.split(' ')[0]} run ${i + 1}`);
		}
		store.setProfile('crewShip', 'Panokseon');
	});
	await wait(2200);

	// Forty ships, and not one of them drawn on the screen itself.
	assert.equal(await count(page, '.fleet-row'), 0, 'the fleet is being drawn inline again');
	const bar = await page.evaluate(() => document.querySelector('.setups-panel').getBoundingClientRect().height);
	assert.ok(bar < 200, `the fleet strip grew to ${Math.round(bar)}px`);
	assert.match(await text(page, '.setups-panel'), /40 kept/);

	await page.click('[data-act="crew-fleet"]'); await wait(700);
	// A page at a time, and it says where you are in the whole.
	assert.equal(await count(page, '.fleet-row'), 8);
	assert.match(await text(page, '.fleet-pager'), /1.8 of 40/);
	// The one being sailed is first and offers no way to sail it again.
	assert.ok(await page.evaluate(() => document.querySelector('.fleet-row').classList.contains('on')),
		'the ship being sailed is not at the top');
	assert.equal(await count(page, '.fleet-row.on [data-act="fleet-sail"]'), 0);

	// Search narrows it.
	await page.type('.fleet-search', 'valor'); await wait(600);
	assert.match(await text(page, '.fleet-pager'), /of 10/, 'searching did not narrow the fleet');

	// A hull chip narrows it a different way, with counts to choose on.
	await page.evaluate(() => { const i = document.querySelector('.fleet-search'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); });
	await wait(500);
	await page.evaluate(() => [...document.querySelectorAll('[data-act="fleet-hull"]')].find(c => /Caravel/.test(c.innerText)).click());
	await wait(600);
	assert.match(await text(page, '.fleet-pager'), /of 10/);

	// Sorting reorders, and paging moves.
	await page.select('[data-act="fleet-sort"]', 'speed'); await wait(600);
	await page.click('[data-act="fleet-page"]:not([disabled])'); await wait(600);
	assert.match(await text(page, '.fleet-pager'), /9.10 of 10/);

	// And sailing one from the dialog closes it and switches the ship.
	await page.evaluate(() => [...document.querySelectorAll('[data-act="fleet-hull"]')].find(c => /All/.test(c.innerText)).click());
	await wait(600);
	await page.click('.fleet-row:not(.on) [data-act="fleet-sail"]'); await wait(1200);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), true, 'the fleet stayed open after sailing one');
	assert.deepEqual(errors, []);
	await context.close();
});



test('the appearance set is fitted like a part, and its stats count', async () => {
	// Both sets fill four slots and every slot carries a stat, so a ship
	// wearing one is a different ship. The app used to price hulls as
	// though skins were only a look.
	const { page, context, errors } = await open('#crew');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setProfile('crewShip', 'Carrack (Valor)');
	});
	await wait(1500);
	const read = () => page.evaluate(async () => {
		const me = (await import('/js/ship.js')).currentShip();
		return { speed: me.speed.total, hold: me.hold.limit, durability: me.durability };
	});
	const before = await read();
	assert.ok(await page.evaluate(() => !!document.querySelector('.slot-card.skin')), 'a Carrack is offered no set');

	await page.click('[data-act="crew-skin-all"][data-on="1"]');
	await wait(1400);
	const after = await read();
	assert.equal(after.speed - before.speed, 3, 'the overlay is not adding its speed');
	assert.equal(after.hold - before.hold, 600, 'nor its weight limit');
	assert.equal(after.durability - before.durability, 100000, 'nor its durability');

	// One slot off again, and only that slot's stat goes with it.
	await page.click('.skin-slot input[data-slot="plating"]');
	await wait(1200);
	const part = await read();
	assert.equal(part.hold, before.hold, 'taking the plating off left its weight behind');
	assert.equal(part.speed, after.speed, 'and took the figurehead down with it');

	// A hull with no set in the game is offered none rather than an empty card.
	await page.evaluate(async () => {
		(await import('/js/state.js')).setProfile('crewShip', 'Panokseon');
	});
	await wait(1400);
	assert.equal(await page.evaluate(() => !!document.querySelector('.slot-card.skin')), false,
		'the Panokseon has no appearance set, so it should be offered none');
	assert.deepEqual(errors, []);
	await context.close();
});

test('on a phone a card and the inventory panel are sheets a thumb can move', async () => {
	// Two complaints, one shape. The item card Find opens was laid out to
	// a minimum width wider than the box holding it, so a phone clipped
	// the right-hand column off every row; and the inventory panel came
	// up under the tab bar, which is fixed to the page while the panel
	// lives inside .shell and cannot be raised over it. Both are bottom
	// sheets now, and a sheet is something you can pull open, push back,
	// and throw away.
	const { page, context, errors } = await open('#inventory', { touch: true });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setStock('Black Stone', 4);
	});
	await wait(700);

	// The card, which is the longest thing the app puts in a dialog.
	await page.evaluate(async () => {
		const { openItemCard } = await import('/js/item-card.js');
		openItemCard('Black Stone');
	});
	await wait(400);
	const card = await page.evaluate(() => {
		const b = document.querySelector('.dialog-box');
		const r = b.getBoundingClientRect();
		return { clipped: b.scrollWidth > b.clientWidth, bottom: Math.round(r.bottom),
			viewport: window.innerHeight, grab: !!b.querySelector('.sheet-grab') };
	});
	assert.equal(card.clipped, false, 'the card is wider than the sheet holding it');
	assert.equal(card.bottom, card.viewport, 'and does not sit in the middle of the screen');
	assert.equal(card.grab, true, 'a sheet has a bar to take hold of');

	// A tap on that bar opens it out, and a tap back folds it in.
	await page.click('.dialog-box .sheet-grab'); await wait(300);
	assert.equal(await page.evaluate(() => document.querySelector('.dialog-box').classList.contains('tall')), true);
	await page.click('.dialog-box .sheet-grab'); await wait(300);
	assert.equal(await page.evaluate(() => document.querySelector('.dialog-box').classList.contains('tall')), false);

	// A button inside a sheet is still a button: taking hold of the sheet
	// on every press used to send the click to the sheet instead.
	await page.click('.dialog-box [data-act="open-item"]'); await wait(600);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), true,
		'a way through to a screen leaves the card behind');

	// And the panel it opened stops where the tab bar starts.
	const panel = await page.evaluate(() => {
		const d = document.querySelector('.detail.open');
		return { bottom: Math.round(d.getBoundingClientRect().bottom),
			bar: Math.round(document.getElementById('tabbar').getBoundingClientRect().top),
			grab: !!d.querySelector('.sheet-grab') };
	});
	assert.equal(panel.grab, true, 'the inventory panel is a sheet too');
	assert.equal(panel.bottom, panel.bar, 'and its last line is not under the tab bar');

	// Pulled down far enough, it is put away.
	const bar = await page.$('.detail.open .sheet-grab');
	const box = await bar.boundingBox();
	const x = box.x + box.width / 2, y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + i * 25);
	await page.mouse.up();
	await wait(400);
	assert.equal(await count(page, '.detail.open'), 0, 'a pull downwards puts the sheet away');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a sheet stands on top of the keyboard rather than under it', async () => {
	// A phone keyboard does not make the page smaller -- it slides over
	// the bottom of it, which is where a sheet lives. Find's results
	// ended up underneath one with only the search box on its roof.
	// sheet.js publishes what the visual viewport says is covered, and
	// the sheets take it off their own foot and their own height. There
	// is no way to raise a real keyboard from here, so this drives the
	// measurement the same way the browser does: by setting it.
	const { page, context, errors } = await open('#plan', { touch: true });
	await wait(400);
	const kb = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kb-h').trim());
	assert.equal(await kb(), '0px', 'nothing is covered until something is');

	// Find lives in the header, which on a phone is folded behind the
	// hamburger -- so it is opened the way the keyboard shortcut does.
	await page.evaluate(() => document.querySelector('[data-act="jump"]').click());
	await wait(400);
	await page.keyboard.type('black'); await wait(300);
	const floor = () => page.evaluate(() => Math.round(document.querySelector('.dialog-box').getBoundingClientRect().bottom));
	assert.equal(await floor(), await page.evaluate(() => window.innerHeight), 'with no keyboard it sits on the bottom edge');

	// 380px of keyboard.
	await page.evaluate(() => document.documentElement.style.setProperty('--kb-h', '380px'));
	await wait(400);
	const up = await page.evaluate(() => {
		const b = document.querySelector('.dialog-box');
		const f = b.querySelector('input');
		return { bottom: Math.round(b.getBoundingClientRect().bottom), top: Math.round(b.getBoundingClientRect().top),
			field: Math.round(f.getBoundingClientRect().bottom), roof: window.innerHeight - 380 };
	});
	assert.equal(up.bottom, up.roof, 'the sheet stands on the keyboard');
	assert.ok(up.field < up.roof, 'and what is being typed into is above it');
	assert.ok(up.top >= 0, 'without being pushed off the top of the screen');
	await page.keyboard.press('Escape'); await wait(300);

	// The inventory panel clears whichever is in the way -- the tab bar,
	// or the keyboard that is covering the tab bar as well.
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setStock('Black Stone', 4);
	});
	await page.evaluate(() => document.querySelector('.tabbar-btn[data-id="inventory"]').click());
	await wait(700);
	await page.click('.tile'); await wait(400);
	assert.equal(await page.evaluate(() => Math.round(document.querySelector('.detail.open').getBoundingClientRect().bottom)),
		await page.evaluate(() => window.innerHeight - 380), 'the panel stops at the keyboard, not at the tab bar');

	await page.evaluate(() => document.documentElement.style.setProperty('--kb-h', '0px'));
	await wait(400);
	assert.equal(await page.evaluate(() => Math.round(document.querySelector('.detail.open').getBoundingClientRect().bottom)),
		await page.evaluate(() => Math.round(document.getElementById('tabbar').getBoundingClientRect().top)),
		'and back to the tab bar when the keyboard goes away');
	assert.deepEqual(errors, []);
	await context.close();
});

test('an item says which other screens know it, and opens them pointed at it', async () => {
	// What the app knows about one item is spread across nine screens,
	// and each used to keep it to itself: the Inventory panel said what
	// you held and stopped, so finding out that two quests pay in the
	// thing meant remembering to go and look. The card and the panel
	// draw the same row of doors now, out of one function, and each door
	// opens its screen already pointed at the item.
	const { page, context, errors } = await open('#map');
	// The barterers have to be loaded before a door can count them.
	await page.waitForFunction(() => document.querySelectorAll('.map-npc, .map-pin').length > 0
		|| document.querySelector('#screen').innerText.includes('barter'), { timeout: 15000 }).catch(() => {});
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Valor)', 1);
		store.setStock("Cox Pirates' Artifact (Parley Beginner)", 3);
	});
	await wait(1800);

	const doors = sel => page.evaluate(s => [...document.querySelectorAll(`${s} .door`)]
		.map(d => d.dataset.act), sel);

	// The card, for something bartered, paid by quests and still short.
	await page.evaluate(async () => {
		const { openItemCard } = await import('/js/item-card.js');
		openItemCard("Cox Pirates' Artifact (Parley Beginner)");
	});
	await wait(500);
	const onCard = await doors('.dialog-box');
	assert.deepEqual(onCard, ['open-item', 'goto-map', 'goto-quests', 'goto-tree', 'goto-get'],
		'the card offers every screen with something to say, and nothing else');
	await page.keyboard.press('Escape'); await wait(300);

	// The panel, same item: the same doors bar the one it is standing in.
	await page.evaluate(async () => {
		const s = await import('/js/ui-state.js');
		s.setView('inventory');
		s.setSelected("Cox Pirates' Artifact (Parley Beginner)");
		(await import('/js/ui.js')).render();
	});
	await wait(600);
	assert.deepEqual(await doors('.detail'), ['goto-map', 'goto-quests', 'goto-tree', 'goto-get'],
		'the Inventory panel does not offer to open the Inventory');

	// Quests, narrowed to what pays in it.
	await page.evaluate(() => document.querySelector('.detail [data-act="goto-quests"]').click());
	await wait(900);
	assert.equal(await page.evaluate(() => location.hash), '#quests');
	assert.ok((await text(page, '#screen')).includes('Paying in 1 item'),
		'and the list is narrowed to the quests that pay in it');

	// The Tree is a build unfolded, so a material's door has to carry the
	// build and then search -- and the search has to see inside the
	// enhancement chains, which are folded shut when a build opens.
	// With one build there is nothing to choose, so the door does not
	// name it: the panel's "Reserved by" is a line above, and saying it
	// again is what made the first cut of this row read as a stutter.
	await page.evaluate(async () => {
		const s = await import('/js/ui-state.js');
		s.setView('inventory'); s.setSelected('Black Stone');
		(await import('/js/ui.js')).render();
	});
	await wait(700);
	assert.equal(await page.evaluate(() => document.querySelector('.detail [data-act="goto-tree"]').innerText.replace(/\s+/g, ' ').trim()),
		'⌥ Tree', 'one build, so nothing to disambiguate');
	assert.equal(await page.evaluate(() => document.querySelector('.detail [data-act="goto-tree"]').dataset.build),
		'Carrack (Valor)', 'but the door still knows which tree it opens');
	await page.evaluate(() => document.querySelector('.detail [data-act="goto-tree"]').click());
	await wait(1000);
	assert.equal(await page.evaluate(() => location.hash), '#tree');
	assert.equal(await page.evaluate(() => document.querySelector('.tpick-name').innerText), 'Carrack (Valor)');
	assert.equal(await page.evaluate(() => document.querySelector('.tsearch').value), 'Black Stone');
	assert.ok(await count(page, '.trow') > 1, 'and the branches leading down to it are open');

	// To Get arrives with it in the search box.
	await page.evaluate(async () => {
		const s = await import('/js/ui-state.js');
		s.setView('inventory'); s.setSelected('Black Stone');
		(await import('/js/ui.js')).render();
	});
	await wait(700);
	await page.evaluate(() => document.querySelector('.detail [data-act="goto-get"]').click());
	await wait(900);
	assert.equal(await page.evaluate(() => location.hash), '#get');
	assert.equal(await page.evaluate(() => document.querySelector('#screen input[type="search"]').value), 'Black Stone');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the chart goes over the whole screen and comes back on Esc, ✕, or leaving the tab', async () => {
	const { page, context, errors } = await open('#map');
	await seed(page); await wait(1200);
	const before = await page.$eval('[data-map]', el => ({ w: el.clientWidth, h: el.clientHeight }));
	await page.click('.map-zoom [data-act="map-full"]'); await wait(300);
	const full = await page.$eval('[data-map]', el => ({
		full: el.classList.contains('full'), turned: el.classList.contains('turned'),
		w: el.clientWidth, h: el.clientHeight, bar: getComputedStyle(el.querySelector('.map-full-bar')).display,
		body: document.body.classList.contains('map-full')
	}));
	assert.ok(full.full && full.body && !full.turned, JSON.stringify(full));
	assert.equal(full.w, 1280); assert.equal(full.h, 900);
	assert.equal(full.bar, 'flex', 'the way back is on the chart');
	assert.ok(full.w > before.w && full.h > before.h, 'bigger than the panel it left');
	// The sea still answers: a drag pans, a wheel zooms, without a fault.
	await page.mouse.move(640, 450); await page.mouse.down(); await page.mouse.move(700, 480, { steps: 4 }); await page.mouse.up(); await wait(200);
	await page.keyboard.press('Escape'); await wait(300);
	assert.equal(await page.$eval('[data-map]', el => el.classList.contains('full')), false, 'Esc brings the page back');
	assert.equal(await page.$eval('body', el => el.classList.contains('map-full')), false);
	await page.click('.map-zoom [data-act="map-full"]'); await wait(200);
	await page.click('.map-full-bar [data-act="map-full"]'); await wait(200);
	assert.equal(await page.$eval('[data-map]', el => el.classList.contains('full')), false, '✕ brings it back');
	await page.click('.map-zoom [data-act="map-full"]'); await wait(200);
	// Back, or a link, to another tab: the chart does not stay over it.
	await page.evaluate(() => { location.hash = '#plan'; }); await wait(400);
	assert.equal(await page.$eval('body', el => el.classList.contains('map-full')), false, 'another tab is not under the chart');
	assert.deepEqual(errors, []);
	await context.close();
});

test('on a phone held upright the full chart turns on its side, and the pointer is turned with it', async () => {
	const { page, context, errors } = await open('#map', { touch: true });
	await seed(page); await wait(1200);
	await page.click('.map-zoom [data-act="map-full"]'); await wait(400);
	const box = await page.$eval('[data-map]', el => {
		const r = el.getBoundingClientRect();
		return { full: el.classList.contains('full'), turned: el.classList.contains('turned'), w: el.clientWidth, h: el.clientHeight, sw: Math.round(r.width), sh: Math.round(r.height) };
	});
	// Its own width is the screen's height: the sea is wide again.
	assert.ok(box.full && box.turned, JSON.stringify(box));
	assert.equal(box.w, 860); assert.equal(box.h, 400);
	assert.equal(box.sw, 400); assert.equal(box.sh, 860);
	// The readout under the pointer runs the box's way: down the screen
	// is east on the chart, and leftward is south.
	const read = async (x, y) => {
		await page.mouse.move(x, y); await wait(120);
		const t = await text(page, '[data-map-coords]');
		const m = /X (-?[\d,.\s]+) · Z (-?[\d,.\s]+)/.exec(t);
		assert.ok(m, `a readout: ${t}`);
		return { x: Number(m[1].replace(/[^\d-]/g, '')), z: Number(m[2].replace(/[^\d-]/g, '')) };
	};
	const a = await read(200, 300);
	const down = await read(200, 500);
	const left = await read(100, 300);
	assert.ok(down.x > a.x && Math.abs(down.z - a.z) < 1000, `down the screen is east: ${JSON.stringify([a, down])}`);
	assert.ok(left.z < a.z && Math.abs(left.x - a.x) < 1000, `leftward is south: ${JSON.stringify([a, left])}`);
	// A finger dragged down the screen carries the sea down the screen:
	// what was under it at the start is under it at the end.
	const under = async (x, y) => { const p = await read(x, y); return p; };
	const start = await under(200, 300);
	await page.touchscreen.touchStart(200, 300);
	await page.touchscreen.touchMove(200, 400); await page.touchscreen.touchMove(200, 500);
	await page.touchscreen.touchEnd(); await wait(300);
	const end = await under(200, 500);
	assert.ok(Math.abs(end.x - start.x) < 2500 && Math.abs(end.z - start.z) < 2500, `the sea followed the finger: ${JSON.stringify([start, end])}`);
	// Turned the other way, the phone is wide already and the box is not turned.
	await page.setViewport({ width: 860, height: 400, isMobile: true, hasTouch: true }); await wait(400);
	assert.equal(await page.$eval('[data-map]', el => el.classList.contains('turned')), false, 'a wide phone needs no turning');
	assert.equal(await page.$eval('[data-map]', el => el.classList.contains('full')), true);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the game\'s favourites come back as the route they were written from, and a loop as a trace', async () => {
	const { page, context, errors } = await open('#map');
	await seed(page); await wait(1200);
	// A route of five written out as the game's favourites, plus a loop
	// of the same five with a bend on open sea.
	const xml = await page.evaluate(async () => {
		const w = await import('/js/worldmap.js');
		const { npcs } = await import('/js/barter_npcs.js');
		const pts = npcs.slice(0, 5).map((n, i) => ({ name: `${i + 1}: ${n.name}`, x: n.x, y: n.y }));
		const fav = w.bookmarkXML(pts).xml;
		const loop = w.bookmarkXML([...pts, { name: 'bend', x: 50000, y: 50000 }], { loop: 0, bookmarks: false, cameras: false }).xml;
		return { fav, loop, ids: npcs.slice(0, 5).map(n => n.id) };
	});
	await page.click('[data-act="map-mode"][data-id="route"]'); await wait(300);
	await page.click('[data-act="map-game-in"]'); await wait(300);
	assert.equal(await count(page, '[data-game-in]'), 1, 'the paste box');
	await page.evaluate(x => { document.querySelector('[data-game-in]').value = x; }, xml.fav + xml.loop);
	await page.click('[data-act="map-game-in-read"]'); await wait(300);
	const rows = await page.$$eval('.map-game-set', els => els.map(el => ({ name: el.querySelector('b').textContent, as: el.querySelector('select').value, opts: [...el.querySelectorAll('option')].map(o => o.value) })));
	assert.deepEqual(rows.map(r => r.name), ['Favourites', 'Loop 1']);
	assert.equal(rows[0].as, 'route', 'five barterers is the route');
	assert.equal(rows[1].as, 'trace', 'a bend on open sea makes it a trace by default');
	assert.ok(rows[1].opts.includes('route'), 'though the route is on offer');
	await page.click('[data-act="map-game-in-go"]'); await wait(500);
	const after = await page.evaluate(() => JSON.parse(localStorage.getItem('bdo-tracker/map-view')));
	assert.deepEqual(after.stops, xml.ids, 'the route is back, in order');
	assert.equal(after.traces[0].name, 'Loop 1 (game)');
	assert.equal(after.traces[0].points.length, 6);
	assert.equal(after.traces[0].shown, true);
	assert.match(await text(page, '#toast'), /Route plotted: 5 stops/);
	assert.deepEqual(errors, []);
	await context.close();
});

test('one run for several materials: each keeps its ticks and its want, and a give kept at another harbour is called for on the way', async () => {
	const { page, context, errors } = await open('#barter');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/barter-view', JSON.stringify({ goal: 'material', item: "Violent Sea Monster's Scale", qty: 20, port: 0 })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.mat-list.hero', { timeout: 15000 });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)');
		// The Figurine only at Velia's storage: a run has to put in there for it.
		store.setStockAt('[Level 5] Faded Gold Dragon Figurine', 'Velia', 2, 'ashore');
	});
	await wait(500);
	// The Figurine group deals the Scale: tick its island.
	const tickFor = give => page.evaluate(g => { const grp = [...document.querySelectorAll('.mat-give')].find(el => el.querySelector('.mat-give-head b').textContent.includes(g)); grp.querySelector('[data-act="barter-mat-tick"]').click(); }, give);
	await tickFor('Faded Gold Dragon Figurine'); await wait(400);
	let stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent + (s.classList.contains('wharf') ? '|wharf' : '')));
	assert.deepEqual(stops, ['Velia wharf|wharf', 'Shipwrecked Ancient Relic Cargo Ship'], 'the harbour first, the island after');
	assert.match(await text(page, '.run-stop.wharf'), /Loads from storage.*Faded Gold Dragon Figurine/i);
	// Without the call, the give is missing instead.
	await page.click('[data-act="barter-mat-calls"]'); await wait(400);
	stops = await page.$$eval('.run-stop', els => els.length);
	assert.equal(stops, 0, 'no call, no run');
	assert.match(await text(page, '.run-tiles'), /Bring to the harbour.*held at Velia, where the run cannot load it/i);
	await page.click('[data-act="barter-mat-calls"]'); await wait(400);
	// A second material through the picker: its own ticks, its own want.
	await page.evaluate(() => document.querySelector('[data-act="barter-mat-add"]').click()); await wait(300);
	await page.type('.picker-in', 'Bright Reef Piece'); await wait(150);
	await page.keyboard.press('Enter'); await wait(500);
	// Its own want: what the builds are short of, not the Scale's twenty.
	const want = await page.$eval('.mat-want .purse-inline', el => el.value);
	assert.ok(want !== '20' && Number(want) > 0, `a fresh want for a fresh material: ${want}`);
	// Hold the give its first group takes, and tick that group's island.
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		const give = document.querySelector('.mat-give-head b').title;
		store.setStock(give, 5);
	});
	await wait(400);
	await page.evaluate(() => document.querySelector('[data-act="barter-mat-tick"]').click()); await wait(400);
	const strip = await page.$$eval('.mat-tile:not(.add)', els => els.map(c => c.textContent.replace(/\s+/g, ' ').trim()));
	assert.equal(strip.length, 2, 'both materials on the strip');
	assert.ok(strip.some(t => /Violent Sea Monster's Scale.*20 wanted.*1 ticked/.test(t)), strip.join(' / '));
	assert.ok(strip.some(t => new RegExp(`Bright Reef Piece.*${want} wanted.*1 ticked`).test(t)), strip.join(' / '));
	assert.match(await text(page, '.run-head'), new RegExp(`${want}× Bright Reef Piece, 20× Violent Sea Monster's Scale`));
	stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent));
	assert.equal(stops.length, 3, `the harbour and both islands: ${stops.join(', ')}`);
	// Back to the first material: its want and ticks are as they were.
	await page.evaluate(() => document.querySelector('.mat-tile:not(.active):not(.add)').click()); await wait(400);
	const back = await page.$eval('.mat-tile.active', el => el.textContent.replace(/\s+/g, ' ').trim());
	assert.match(back, /Violent Sea Monster's Scale.*20 wanted.*1 ticked/);
	assert.equal(await page.$eval('.mat-want .purse-inline', el => el.value), '20');
	// "Every island ticked" sails past the want.
	await page.select('[data-act="barter-mat-reach"]', 'all'); await wait(400);
	assert.equal(await page.$eval('[data-act="barter-mat-reach"]', el => el.value), 'all');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the material run is one route through every island ticked: a full run goes back to the harbour when the hold cannot carry every give, a fast run sails once and says what stayed ashore', async () => {
	const { page, context, errors } = await open('#barter');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/barter-view', JSON.stringify({ goal: 'material', item: "Violent Sea Monster's Scale", qty: 999, port: 1, matOrders: { reach: 'all', calls: true, pace: 'full' } })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.mat-list.hero', { timeout: 15000 });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)');
		// Twenty-two thousand weight of gives at Velia, against a hold
		// that barters under twenty thousand six hundred.
		store.setStockAt("[Level 5] Statue's Tear", 'Velia', 18, 'ashore');
		store.setStockAt('[Level 5] Faded Gold Dragon Figurine', 'Velia', 4, 'ashore');
	});
	await wait(500);
	// Every island of both groups ticked, one at a time, since each
	// tick redraws the list.
	const tickAll = async give => {
		for (let i = 0; i < 12; i++) {
			const more = await page.evaluate(g => { const grp = [...document.querySelectorAll('.mat-give')].find(el => el.querySelector('.mat-give-head b').textContent.includes(g)); const chip = grp && grp.querySelector('.mat-isle:not(.active)'); if (chip) chip.click(); return !!chip; }, give);
			if (!more) break;
			await wait(250);
		}
	};
	await tickAll("Statue's Tear"); await tickAll('Faded Gold Dragon Figurine');
	let stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent));
	assert.equal(stops.filter(n => n !== 'Velia wharf').length, 11, `eleven islands, each once: ${stops.join(', ')}`);
	assert.equal(stops.filter(n => n === 'Velia wharf').length, 2, `two departures from Velia: ${stops.join(', ')}`);
	assert.equal(stops[0], 'Velia wharf', 'the first stop loads at the harbour');
	assert.match(await text(page, '.run-tiles'), /2 departures/);
	assert.match(await text(page, '.run-seg-head'), /22 trades/);
	assert.equal(await count(page, '.run-list.amber'), 0, 'nothing stays ashore on a full run');
	// The hold never over the barter ceiling, on any stop.
	const holds = await page.$$eval('.run-stop .run-hold b', els => els.map(el => Number(el.textContent.replace(/[^\d]/g, ''))));
	assert.ok(holds.every(w => w <= 20625), holds.join(', '));
	// Fast: one departure under the limit the ship still sails fast at.
	await page.select('[data-act="barter-mat-pace"]', 'fast'); await wait(500);
	stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent));
	assert.equal(stops.filter(n => n === 'Velia wharf').length, 1, `one departure: ${stops.join(', ')}`);
	assert.ok(stops.length < 12, 'fewer islands than a full run');
	assert.equal(await count(page, '.run-list.amber'), 1, 'what stayed ashore is said');
	assert.match(await text(page, '.run-list.amber'), /Stays ashore/i);
	const fastHolds = await page.$$eval('.run-stop .run-hold b', els => els.map(el => Number(el.textContent.replace(/[^\d]/g, ''))));
	assert.ok(fastHolds.every(w => w <= 16500), fastHolds.join(', '));
	// The way back to the full run is on the panel.
	await page.evaluate(() => document.querySelector('[data-act="barter-mat-pace-set"]').click()); await wait(500);
	assert.equal(await page.$eval('[data-act="barter-mat-pace"]', el => el.value), 'full');
	assert.equal(await count(page, '.run-list.amber'), 0);
	assert.deepEqual(errors, []);
	await context.close();
});

test('before casting off: a gold bar an island takes is bought ashore and priced, and a give kept where the run cannot load it is to be brought to the harbour first', async () => {
	const { page, context, errors } = await open('#barter');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/barter-view', JSON.stringify({ goal: 'material', item: 'Golden Turtle Shell', qty: 4, port: 1, matOrders: { reach: 'want', calls: true, pace: 'full' } })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.mat-list.hero', { timeout: 15000 });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)');
		// Amethyst at Heidel, which has no wharf: out of the run's reach.
		store.setStockAt('[Level 4] Amethyst Fragment', 'Heidel', 2, 'ashore');
	});
	await wait(500);
	const tickFor = give => page.evaluate(g => { const grp = [...document.querySelectorAll('.mat-give')].find(el => el.querySelector('.mat-give-head b').textContent.includes(g)); grp.querySelector('[data-act="barter-mat-tick"]').click(); }, give);
	await tickFor('Gold Bar 100G'); await wait(400);
	let stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent));
	assert.equal(stops.length, 1, `one island, no harbour call: ${stops.join(', ')}`);
	assert.match(await text(page, '.run-tiles'), /buys 2× Gold Bar 100G ashore first for 20m/i);
	const before = await text(page, '.run-list.amber');
	assert.match(before, /Before casting off/i);
	assert.match(before, /2× Gold Bar 100G.*buy ashore.*storage keeper.*20m/i);
	assert.equal(await count(page, '.run-list.orange'), 0, 'nothing to climb for');
	// A second material whose give sits at Heidel.
	await page.evaluate(() => document.querySelector('[data-act="barter-mat-add"]').click()); await wait(300);
	await page.type('.picker-in', 'Golden Galley Figurine'); await wait(150);
	await page.keyboard.press('Enter'); await wait(500);
	await tickFor('Amethyst Fragment'); await wait(400);
	const bring = await text(page, '.run-list.amber');
	assert.match(bring, /Amethyst Fragment.*at Heidel \(2\).*bring it to Velia/i);
	assert.match(await text(page, '.run-tiles'), /Bring to the harbour/i);
	stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent));
	assert.equal(stops.length, 1, 'the Figurine island is not sailed: its give is out of reach');
	// Moved to Velia, the give is loaded at the first stop and the island joins the route.
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.setStockAt('[Level 4] Amethyst Fragment', 'Heidel', 0, 'moved'); store.setStockAt('[Level 4] Amethyst Fragment', 'Velia', 2, 'moved'); });
	await wait(500);
	stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent + (s.classList.contains('wharf') ? '|wharf' : '')));
	assert.equal(stops[0], 'Velia wharf|wharf', `loads at Velia first: ${stops.join(', ')}`);
	assert.equal(stops.length, 3, stops.join(', '));
	assert.match(await text(page, '.run-stop.wharf'), /Loads from storage.*Amethyst Fragment/i);
	assert.doesNotMatch(await text(page, '.run-list.amber'), /Amethyst/);
	assert.deepEqual(errors, []);
	await context.close();
});
