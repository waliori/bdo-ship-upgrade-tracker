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
		const above = el => kids.filter(t => t.classList.contains('map-tile') && getComputedStyle(t).opacity === '1'
			&& (zi(t) > zi(el) || (zi(t) === zi(el) && kids.indexOf(t) > kids.indexOf(el)))).length;
		const course = layer.querySelector('.map-course-layer');
		return { course: above(course), hunt: above(layer.querySelector('.map-hunt-layer')), tiles: kids.filter(t => t.classList.contains('map-tile')).length };
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

test('the barterers and the traces are layers like any other', async () => {
	const { page, context, errors } = await open('#map');
	await page.evaluate(() => { localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'hunt', panelOpen: true, habitatsOn: false })); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.map-pin'); await wait(700);
	assert.ok(await count(page, '.map-pin') > 10, 'the islands are marked to begin with');
	await page.click('[data-act="map-pins"]'); await wait(400);
	assert.equal(await count(page, '.map-pin'), 0, 'put away, the marks leave the sea bare');
	await page.click('[data-act="map-pins"]'); await wait(400);
	assert.ok(await count(page, '.map-pin') > 10, 'and come back');

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
	assert.equal(await count(page, '.sheet-tab'), 9, 'every section, named');
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
		const at = els.map(e => [parseFloat(e.style.left), parseFloat(e.style.top)]);
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
	const marker = () => page.evaluate(() => { const e = document.querySelector('.map-habitat:not([hidden])'); return e ? [e.dataset.key, e.style.left] : null; });
	const pin = () => page.evaluate(() => { const e = document.querySelector('[data-act="map-pin"]:not([hidden])'); return e ? e.style.left : null; });
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
