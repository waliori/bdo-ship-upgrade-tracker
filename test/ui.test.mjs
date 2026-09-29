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
// The hold's ceilings are the app's to state, not this file's to
// remember -- see the material run test.
const { shipStats } = await import('../js/ship_stats.js');
const app = (await import('../server.js')).default;
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
test.after(async () => { await browser.close(); server.close(); });

const wait = ms => new Promise(r => setTimeout(r, ms));

// The bar the app is judged up by. It is drawn one of two ways -- a row
// of chips, or, on a phone, the one line that opens the sheet -- and
// either of them means the shell has rendered.
const POUCH_READY = '#pouch .pouch-item, #pouch .pouch-peek';


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
	await page.waitForSelector(POUCH_READY, { timeout: 15000 });
	return { page, context, errors };
}
const seed = page => page.evaluate(async () => {
	const store = await import('/js/state.js');
	store.addTarget('Carrack (Valor)', 1);
	store.setProfile('crewShip', 'Carrack (Valor)');
	store.setStock("+4 Epheria Carrack: Valor (Chiro's Sail)", 1);
	store.setStock('Tidal Black Stone', 300);
});
// Clicking through the page rather than through a handle: every screen
// here is drawn from the store and redrawn when it changes, so an
// element found a tick ago may be detached by the time a real mouse
// click reaches it -- which is a test that fails one run in five for a
// reason that has nothing to do with what it is testing.
const tap = (page, sel) => page.evaluate(s => {
	const el = document.querySelector(s);
	if (!el) throw new Error(`nothing matches ${s}`);
	el.click();
}, sel);
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
	await tap(page, '[data-act="crew-fit-pick"][data-slot="cannon"]');
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

test('a Crow Coin purchase moves the goods and the coins together, and undoes as one', async () => {
	const { page, context, errors } = await open('#get');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Valor)', 1);
		store.setStock('Crow Coin', 5000);
	});
	// The plan may get the stones off the quests; the Buy is on the
	// by-source reading, where every coin-priced line carries one.
	await page.waitForSelector('[data-act="get-mode"][data-id="source"]', { timeout: 10000 });
	await page.evaluate(() => document.querySelector('[data-act="get-mode"][data-id="source"]').click());
	await page.waitForSelector('.coin-buy', { timeout: 10000 });
	// Tidal Black Stone: ten coins each, and a Carrack wants hundreds.
	await page.evaluate(() => [...document.querySelectorAll('.row')]
		.find(r => /Tidal Black Stone/.test(r.textContent)).querySelector('.coin-buy').click());
	await page.waitForFunction(() => /Buy with Crow Coins/i.test(document.querySelector('#dialog h2')?.textContent || ''), { timeout: 10000 });
	// It opens on what the purse can actually cover, not on the shortfall.
	assert.equal(await page.evaluate(() => document.querySelector('.buy-n').value.replace(/,/g, '')), '500');
	await page.evaluate(() => { const f = document.querySelector('.buy-n'); f.value = '120'; f.dispatchEvent(new Event('input', { bubbles: true })); });
	await wait(100);
	assert.match(await text(page, '.buy-sum'), /1,200 coins/);
	await page.click('[data-buy]'); await wait(400);
	const after = await page.evaluate(async () => {
		const store = await import('/js/state.js');
		return { stone: store.getStock('Tidal Black Stone'), coins: store.getStock('Crow Coin') };
	});
	assert.deepEqual(after, { stone: 120, coins: 3800 }, 'the goods in and the coins out');
	const back = await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.undo();
		return { stone: store.getStock('Tidal Black Stone'), coins: store.getStock('Crow Coin') };
	});
	assert.deepEqual(back, { stone: 0, coins: 5000 }, 'and one Undo takes back both halves');
	assert.deepEqual(errors, []);
	await context.close();
});

test('To Get opens on the way to get it, follows the goal picked, and hands a pick to the Quests screen', async () => {
	const { page, context, errors } = await open('#get');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Valor)', 1);
		store.setStock('Crow Coin', 5000);
	});
	await page.waitForSelector('.way-head', { timeout: 10000 });
	assert.match(await text(page, '.way-headline'), /done in|not inside/i);
	// The plan is a numbered run of steps, not a heap of groups.
	assert.ok(await count(page, '.way-step') >= 2, 'more than one step');
	assert.equal(await page.evaluate(() => document.querySelector('.way-step-n').textContent.trim()), '1');
	// Every missing item is on the page exactly as many times as it has
	// legs, and each leg says why.
	const whys = await page.evaluate(() => [...document.querySelectorAll('.way-why')].map(e => e.textContent.trim()));
	assert.ok(whys.length > 5 && whys.every(w => w.length > 8), 'a reason on every line');
	// A goal is one press, and the chip lights.
	await page.evaluate(() => document.querySelector('[data-act="get-preset"][data-id="coins"]').click()); await wait(300);
	assert.equal(await page.evaluate(() => document.querySelector('.way-pref.on').dataset.id), 'coins');
	assert.equal(await page.evaluate(async () => (await import('/js/state.js')).getProfile('getOrders').preset), 'coins');
	// A pick the plan would take is remembered for the Quests screen.
	const pick = await page.$('[data-act="get-pick"]');
	if (pick) {
		const { quest, i } = await pick.evaluate(e => ({ quest: e.dataset.quest, i: Number(e.dataset.i) }));
		await pick.click(); await wait(300);
		assert.equal(await page.evaluate(async q => (await import('/js/state.js')).getProfile('questPicks')[q], quest), i);
	}
	// A step folds away and comes back.
	const before = await count(page, '.way-row');
	await page.evaluate(() => document.querySelector('.way-step-head[data-id^="step-"]').click()); await wait(300);
	assert.ok(await count(page, '.way-row') < before, 'folding a step hides its rows');
	await page.evaluate(() => document.querySelector('.way-step-head[data-id^="step-"]').click()); await wait(300);
	assert.equal(await count(page, '.way-row'), before, 'and unfolding brings them back');

	// The other reading is a chip away, and Copy follows it.
	await page.evaluate(() => document.querySelector('[data-act="get-mode"][data-id="source"]').click()); await wait(300);
	assert.equal(await count(page, '.way-head'), 0);
	assert.ok(await count(page, '.group-head') > 0);
	assert.deepEqual(errors, []);
	await context.close();
});

test('too dear to buy is said, not clamped', async () => {
	const { page, context, errors } = await open('#get');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Valor)', 1);
		store.setStock('Crow Coin', 50);
	});
	await page.waitForSelector('[data-act="get-mode"][data-id="source"]', { timeout: 10000 });
	await page.evaluate(() => document.querySelector('[data-act="get-mode"][data-id="source"]').click());
	await page.waitForSelector('.coin-buy', { timeout: 10000 });
	await page.evaluate(() => [...document.querySelectorAll('.row')]
		.find(r => /Tidal Black Stone/.test(r.textContent)).querySelector('.coin-buy').click());
	await page.waitForSelector('.buy-n', { timeout: 10000 });
	await page.evaluate(() => { const f = document.querySelector('.buy-n'); f.value = '600'; f.dispatchEvent(new Event('input', { bubbles: true })); });
	await wait(100);
	assert.match(await text(page, '.buy-sum'), /you hold 50 . enough for 5/);
	assert.equal(await page.evaluate(() => document.querySelector('[data-buy]').disabled), true);
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
	await tap(page, '[data-act="quest-pay-pick"]'); await wait(200);
	await page.evaluate(() => [...document.querySelectorAll('.picker-row')].find(r => r.textContent.includes('Tidal Black Stone')).click());
	await tap(page, '[data-picker-apply]'); await wait(300);
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
	await tap(page, '[data-act="quest-pick-set"]'); await wait(300);
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

test('on a phone the pouch is one line, the sheet holds the fields, and a dialog opened from it puts it back', async () => {
	const { page, context, errors } = await open('#plan', { touch: true });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setStock('Crow Coin', 12000);
		store.setStock('Silver', 1960000000);
		store.setProfile('barterCount', 4205);
	});
	await wait(500);
	assert.equal(await count(page, '#pouch .pouch-item'), 0, 'no row of chips on a phone');
	assert.match(await text(page, '.pouch-peek'), /12,000.*1\.96b.*4,205/s, 'what is held, on one line');
	assert.ok(await page.evaluate(() => document.getElementById('pouch').offsetHeight) < 56, 'and one line high');

	await tap(page, '.pouch-peek'); await wait(400);
	assert.equal(await count(page, '.pouch-sheet [data-act="purse"]'), 2, 'both purses are fields in the sheet');
	assert.ok(await count(page, '.pouch-sheet [data-act="barter-count"]') === 1, 'the sailor is open in it, not folded');
	// Typing in the sheet moves the line behind it.
	await page.$eval('.pouch-sheet [data-act="purse"][data-item="Crow Coin"]', el => {
		el.value = '70000';
		el.dispatchEvent(new Event('change', { bubbles: true }));
		el.blur();
	});
	await wait(400);
	assert.match(await text(page, '.pouch-peek'), /70,000/, 'the line behind it keeps up');

	// The nest replaces the sheet; answering it brings the sheet back.
	await tap(page, '.pouch-sheet [data-act="pets"]'); await wait(400);
	assert.equal(await count(page, '.pouch-sheet'), 0, 'the nest stands in front of it');
	await tap(page, '[data-pet-save]'); await wait(500);
	assert.equal(await count(page, '.pouch-sheet'), 1, 'and the sheet is underneath again');
	// Closing the sheet itself is the end of it.
	await tap(page, '.dialog-box [data-close]'); await wait(500);
	assert.equal(await count(page, '#dialog:not([hidden])'), 0, 'Done closes it for good');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the hire picker names each race once', async () => {
	const { page, context, errors } = await open('#crew');
	// Let the screen settle before reaching for a button on it. The Ship
	// tab redraws once more after its first paint, and a handle taken
	// before that is a node no longer in the document by the time the
	// click lands -- which every other test on this screen already waits
	// out.
	await wait(600);
	await page.click('[data-act="crew-hire"]'); await wait(300);
	const groups = await page.evaluate(() => [...document.querySelectorAll('.picker-group')].map(g => g.textContent.trim()));
	assert.deepEqual(groups, [...new Set(groups)], 'no heading repeats');
	assert.equal(groups.length, 5, 'four races and the first mates');
	// Rank by speed: the list goes flat and the fastest growth leads.
	// The chips are clicked from inside the page: the picker redraws on
	// each, and a handle taken a moment earlier is a node no longer there.
	const chip = id => page.$eval(`[data-picker-chip="${id}"]`, el => el.click());
	await chip('sort:speed'); await wait(200);
	assert.equal(await count(page, '.picker-group'), 0, 'a ranked list has no headings');
	assert.equal(await text(page, '.picker-row .picker-label'), 'Innocent', 'the best level-10 speed leads');
	// Narrow to one race.
	await chip('sort:speed'); await wait(200); await chip('race:Goblin'); await wait(200);
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

test('the phone menu is the one sheet, and a section chosen from it closes it', async () => {
	const { page, context, errors } = await open('#plan', { touch: true });
	await page.click('[data-act="more"]'); await wait(300);
	assert.equal(await count(page, '#dialog .menu-sheet'), 1, 'the masthead\'s Menu opens the sheet');
	assert.ok(await count(page, '.menu-sheet [data-act="jump"]') > 0, 'Find is in it, since the phone masthead has no room for it');
	await page.keyboard.press('Escape'); await wait(300);
	await page.click('[data-act="tab-sheet"]'); await wait(300);
	assert.equal(await count(page, '#dialog .menu-sheet'), 1, 'the thumb bar\'s last slot opens the same sheet');
	await page.click('.menu-sheet .sheet-tab[data-id="inventory"]'); await wait(300);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), true, 'a section press closes it');
	assert.equal(await page.evaluate(() => location.hash), '#inventory');
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

test('items leave the Inventory from the select bar or the Delete key, after asking, and one Undo brings them back', async () => {
	const { page, context, errors } = await open('#inventory');
	const [a, b] = await page.evaluate(async () => {
		const store = await import('/js/state.js');
		const { allItems } = await import('/js/ui-bits.js');
		const pick = allItems().filter(n => !/^\+\d/.test(n)).slice(0, 2);
		store.setStock(pick[0], 30);
		store.setStockAt(pick[0], 'Velia', 12);
		store.setStock(pick[1], 5);
		return pick;
	});
	await wait(300);
	const stockOf = it => page.evaluate(async i => { const s = await import('/js/state.js'); return [s.getStock(i), s.stockAt(i, 'Velia')]; }, it);
	const beforeA = await stockOf(a), beforeB = await stockOf(b);
	assert.ok(beforeA[0] > 0 && beforeA[1] === 12 && beforeB[0] === 5);
	await tap(page, '[data-act="inv-select"]'); await wait(200);
	await tap(page, `.tile[data-item="${a.replace(/"/g, '\\"')}"]`); await wait(150);
	await tap(page, `.tile[data-item="${b.replace(/"/g, '\\"')}"]`); await wait(150);
	await tap(page, '[data-act="inv-remove"]'); await wait(300);
	assert.match(await text(page, '#dialog h2'), /remove from the inventory/i, 'it asks first');
	assert.equal(await count(page, '#dialog .remove-list li'), 2, 'and lists what goes');
	await tap(page, '[data-remove-go]'); await wait(300);
	assert.deepEqual(await stockOf(a), [0, 0], 'gone from the bags and from Velia');
	assert.deepEqual(await stockOf(b), [0, 0]);
	await page.evaluate(async () => (await import('/js/state.js')).undo()); await wait(300);
	assert.deepEqual(await stockOf(a), beforeA, 'one Undo brings both back, where they were');
	assert.deepEqual(await stockOf(b), beforeB);
	// The Delete key, on the card that is open.
	await tap(page, '[data-act="inv-select"]'); await wait(200);
	await tap(page, `.tile[data-item="${b.replace(/"/g, '\\"')}"]`); await wait(300);
	await page.evaluate(() => document.activeElement && document.activeElement.blur());
	await page.keyboard.press('Delete'); await wait(300);
	assert.match(await text(page, '#dialog h2'), /remove from the inventory/i);
	await tap(page, '#dialog [data-close]'); await wait(200);
	assert.deepEqual(await stockOf(b), beforeB, 'cancelled, nothing moved');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the Results step opens with no run under way, and keeps past runs there', async () => {
	const { page, context, errors } = await open('#barter');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setProfile('runs', [{ day: '2026-09-24', at: Date.now() - 86400000, silver: 300000000, cost: 0, net: 300000000, trades: 12, parley: 120000, stops: 5, goal: 'silver', layout: '24', port: 'Iliya Island' }]);
	});
	await wait(400);
	await tap(page, '[data-act="barter-step"][data-id="results"]'); await wait(600);
	assert.ok(await page.$('.barter-screen.step-results'), 'Results opens without a run');
	assert.match(await text(page, '.step-empty'), /no run under way/i);
	assert.match(await text(page, '.barter-screen'), /past runs/i, 'and the runs before are there');
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.barter-screen'); await wait(400);
	assert.ok(await page.$('.barter-screen.step-results'), 'and it is still there after a reload');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a count said on the way lays the run again without loading anything more at the harbour', async () => {
	const { page, context, errors } = await open('#barter');
	const r = await page.evaluate(async () => {
		const { V } = await import('/js/barter/state.js');
		const { sailKey, syncSail, castOffCaps, castOffLand } = await import('/js/barter/sail.js');
		const slab = '[Level 2] Big Stone Slab', knife = '[Level 3] Round Knife', tear = "[Level 5] Statue's Tear";
		const iliya = { name: 'Dario', at: 'Iliya Island', x: 0, y: 0 };
		const louruve = { npcId: 58985, npc: 'Julio', give: slab, giveN: 1, item: knife, recv: 2, recvMin: 2, recvMax: 3, recvText: '2-3', times: 5, parley: 1000, weightAfter: 0, level: 3, chain: 0 };
		const call = { wharf: iliya, dropped: [], loads: [{ item: tear, n: 5 }], sale: null, weightAfter: 0, chain: 0 };
		// Cast off with the slabs ticked aboard: nothing left to load at the
		// start, the Statue's Tears picked up at a call back.
		V.sail = { key: sailKey(), done: ['n58985'], seen: { 58985: 2 }, got: {}, kept: [], laidFor: '{}', stops: [louruve, call], loaded: [], bagLoaded: [], bagFromHold: [], weightStart: 11611, bought: [], cost: 0 };
		const caps = Object.fromEntries(castOffCaps(V.sail, { [slab]: 4, [tear]: 5, 'Cactus Rind': 10 }));
		// Laid again at "paid 2", free to load: four more slabs out of storage.
		syncSail({ stops: [{ ...louruve, times: 9, recvText: '2' }, call], loaded: [{ item: slab, n: 4 }], bagLoaded: [], bagFromHold: [], weightStart: 13211, bought: [], cost: 0, order: [] });
		// And the shore goods bought at the Market: no more than were bought,
		// unless the run takes them off the sailor's own pile.
		V.sail.bought = [{ item: 'Grilled Bird Meat', n: 300, each: 1000 }];
		const land = Object.fromEntries(castOffLand(V.sail, { landFrom: 'market' }));
		const pile = castOffLand(V.sail, { landFrom: 'stock' });
		return { caps, loaded: V.sail.loaded, weightStart: V.sail.weightStart, times: V.sail.stops[0].times, land, pile };
	});
	assert.deepEqual(r.caps, { '[Level 2] Big Stone Slab': 0, "[Level 5] Statue's Tear": 5 }, 'nothing more of a good at the harbour than the run took out of it');
	assert.deepEqual(r.loaded, [], 'what was loaded before casting off stays what was loaded');
	assert.equal(r.weightStart, 11611);
	assert.equal(r.times, 5, 'the stop sailed stays as it was sailed');
	assert.deepEqual(r.land, { 'Grilled Bird Meat': 300 });
	assert.equal(r.pile, null);
	assert.deepEqual(errors, []);
	await context.close();
});

test('a wharf call keeps its tick when a re-laying puts another call at the same wharf before it', async () => {
	const { page, context, errors } = await open('#barter');
	const r = await page.evaluate(async () => {
		const { stopKey, ticked } = await import('/js/barter/sail.js');
		const epheria = { name: 'Srulk', at: 'Port Epheria', x: 0, y: 0 };
		const arehaza = { npcId: 58984, npc: 'Hanipu' }, karpu = { npcId: 58974, npc: 'Karpu' };
		const sold = { wharf: epheria, dropped: [], sale: { n: 5 } };
		// As sailed: Arehaza, Karpu, then Port Epheria to sell what Karpu paid.
		const before = [arehaza, karpu, sold];
		const done = before.map((s, k) => stopKey(s, k, before));
		// Laid again: a call at Port Epheria put in after Arehaza, ahead of it.
		const early = { wharf: epheria, dropped: [], sale: { n: 5 } };
		const after = [arehaza, early, karpu, sold];
		return { early: ticked(done, early, 1, after), sold: ticked(done, sold, 3, after) };
	});
	assert.equal(r.sold, true, 'the call that was made keeps its tick');
	assert.equal(r.early, false, 'the call put in ahead does not take it');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a [Level 7] an island paid under another name is written off only once it was paid', async () => {
	const { page, context, errors } = await open('#barter');
	const delta = await page.evaluate(async () => {
		const { tripOf } = await import('/js/barter/sail.js');
		const W = "[Level 7] Top-Quality Heidelian Wine", C = '[Level 7] Calpheon Golden Candle Stand', S = '[Level 6] Top-Quality Coconut Syrup';
		const epheria = { name: 'Srulk', at: 'Port Epheria', x: 0, y: 0 }, iliya = { name: 'Dario', at: 'Iliya Island', x: 0, y: 0 };
		const sale = n => ({ n, total: n * 1e8, levels: [7], items: [{ item: W, n, total: n * 1e8 }] });
		const stops = [
			// the wine loaded at Iliya, sold at Port Epheria
			{ wharf: epheria, dropped: [], sale: sale(5), weightAfter: 0 },
			// Karpu pays Candle Stands where the layout names the wine
			{ npcId: 58974, npc: 'Karpu', give: S, giveN: 1, item: W, recv: 1, recvMin: 1, recvMax: 1, times: 5, weightAfter: 0 },
			// and those are sold at the next wharf
			{ wharf: iliya, dropped: [], sale: sale(5), weightAfter: 0 }
		];
		const keys = ['wSrulk@0', 'n58974', 'wDario@0'];
		const on = { done: keys, seen: {}, got: { 58974: C }, kept: [] };
		const whole = tripOf({ stops, loaded: [] }, on, null).delta;
		const part = tripOf({ stops, loaded: [] }, { ...on, done: keys.slice(0, 2) }, null).delta;
		return { whole, part, W, C };
	});
	assert.equal(delta.whole[delta.W], -5, 'the wine sold at Port Epheria is the wine');
	assert.equal(delta.whole[delta.C] || 0, 0, 'the Candle Stands paid are the ones sold after');
	assert.equal(delta.part[delta.W], -5);
	assert.equal(delta.part[delta.C], 5, 'paid and not yet sold, they are aboard');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a ship in a link can be looked at on the Ship tab, and the bar brings your own back', async () => {
	const { page, context, errors } = await open('#crew');
	const link = await page.evaluate(async () => {
		const s = await import('/js/share.js');
		const setup = { ship: 'Carrack (Valor)', fitted: { cannon: "+9 Epheria Carrack: Valor (Chiro's Cannon)" }, roster: [], seats: {} };
		return s.shareLink(await s.encodeShare({ stock: {}, setup })).replace('#share/', '#ship/');
	});
	const p2 = await context.newPage();
	await p2.goto(link, { waitUntil: 'domcontentloaded' }); await wait(900);
	const mine = await p2.evaluate(async () => (await import('/js/state.js')).getProfile('crewShip', null));
	await p2.click('[data-ship-look]'); await wait(600);
	assert.equal(await count(p2, '#dialog:not([hidden]) [data-ship-look]'), 0, 'the dialog is closed');
	assert.equal(await p2.evaluate(async () => (await import('/js/state.js')).getProfile('crewShip', null)), 'Carrack (Valor)', 'the shared hull is the one shown');
	assert.equal(await p2.evaluate(() => !document.getElementById('shared-bar').hidden), true, 'with the bar that says it is only a look');
	await p2.click('#shared-bar [data-shared="back"]'); await wait(400);
	assert.equal(await p2.evaluate(async () => (await import('/js/state.js')).getProfile('crewShip', null)), mine, 'and yours is back');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the day rides under the pouch on every tab but the Plan, and the More menu opens and closes', async () => {
	const { page, context, errors } = await open('#builds');
	await seed(page); await wait(300);
	assert.match(await text(page, '#status'), /Epheria Carrack: Valor/);
	await page.click('#tab-plan'); await wait(200);
	assert.equal(await page.evaluate(() => document.getElementById('status').hidden), true);
	await page.click('[data-act="more"]'); await wait(200);
	assert.equal(await count(page, '#dialog .menu-sheet'), 1);
	await page.click('.menu-sheet [data-act="help"]'); await wait(300);
	assert.equal(await count(page, '#dialog .menu-sheet'), 0, 'picking an item closes it');
	assert.match(await text(page, '#dialog h2'), /how this works/i, 'and what was picked stands in its place');
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
	// The whole chart on screen: the grip is at its foot, and the page
	// above the chart is taller than the window's spare height.
	await page.evaluate(() => document.querySelector('[data-map]').scrollIntoView({ block: 'center' })); await wait(300);
	const grip = await page.$('[data-mini-grip]');
	const g = await grip.boundingBox();
	await page.mouse.move(g.x + 5, g.y + 5); await page.mouse.down();
	await page.mouse.move(g.x - 300, g.y - 200, { steps: 6 }); await page.mouse.up(); await wait(200);
	const box = await page.$eval('[data-map-mini]', el => ({ left: el.style.left, top: el.style.top, moved: el.classList.contains('moved') }));
	assert.ok(box.moved && parseInt(box.left) >= 0 && parseInt(box.top) >= 0, JSON.stringify(box));
	// Pressed from inside the page: the dock sticks over the top edge, and a click scrolled to there would land on it.
	await page.evaluate(() => document.querySelector('[data-act="map-mini"][aria-pressed]').click()); await wait(200);
	assert.equal(await count(page, '[data-map-mini]'), 0, 'hidden');
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector(POUCH_READY); await wait(1000);
	assert.equal(await count(page, '[data-map-mini]'), 0, 'still hidden after a reload');
	await page.evaluate(() => document.querySelector('[data-act="map-mini"][aria-pressed]').click()); await wait(300);
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
		// The trace lives in the profile's view now, written a moment
		// after each change; the screen hands over what it holds.
		const t = (await import('/js/screen-map.js')).currentMapData().trace;
		return encodeAny({ kind: 'trace', name: 'Test run', notes: '', points: t.points, strokes: t.strokes });
	});
	await page.evaluate(() => localStorage.removeItem('bdo-tracker/v2'));
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
	// The whole chart on screen, so a mark near its foot is not below the window.
	await page.evaluate(() => document.querySelector('[data-map]').scrollIntoView({ block: 'center' })); await wait(300);
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
		const t = (await import('/js/screen-map.js')).currentMapData().trace;
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
	const held = () => page.evaluate(async () => (await import('/js/screen-map.js')).currentMapData().trace);
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
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector(POUCH_READY); await wait(1500);
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
	await page.click('.masthead-actions [data-act="help"]'); await wait(400);
	await page.keyboard.press('Escape'); await wait(400);
	assert.equal(await page.evaluate(() => document.activeElement?.dataset?.act), 'help');
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
	// fraction of every name the app knows -- a shade over a third of
	// the eleven hundred, now that the shore goods a barter chain starts
	// from are in the list a trip can be logged against.
	assert.ok(seen.rows < 500, `the picker is still offering ${seen.rows} rows`);
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
	// Forty setups on four hulls, and the four hulls they bought are in
	// the inventory -- not four more rows beside them.
	assert.match(await text(page, '.setups-panel'), /40 ships across 4 hulls/);
	assert.equal(await page.evaluate(async () => (await import('/js/ship.js')).ownedHulls().length), 4);

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

	// Find is in the menu and nowhere in the masthead, so it is opened
	// the way the keyboard shortcut does.
	await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control');
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
	assert.equal(await page.evaluate(() => document.querySelector('.tpick-name').innerText), 'Epheria Carrack: Valor');
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
	const after = await page.evaluate(async () => (await import('/js/screen-map.js')).currentMapData());
	assert.deepEqual(after.stops, xml.ids, 'the route is back, in order');
	assert.equal(after.traces[0].name, 'Loop 1 (game)');
	assert.equal(after.traces[0].points.length, 6);
	assert.equal(after.traces[0].shown, true);
	assert.match(await text(page, '#toast'), /Route plotted: 5 stops/);
	assert.deepEqual(errors, []);
	await context.close();
});

/** The run laid out is the tab's second step: what to have aboard, and
 *  the route stop by stop. Reached from the strip along the foot of the
 *  plan, or from the steps across its head. */
async function laidOut(page) {
	const there = await page.evaluate(() => !!document.querySelector('.barter-screen.step-load'));
	if (!there) {
		await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-step"][data-id="load"]')].find(e => e.getBoundingClientRect().width > 0).click());
		await wait(400);
	}
	await page.waitForSelector('.barter-screen.step-load', { timeout: 10000 });
	await wait(200);
	// The route is laid from what is aboard: everything on the packing
	// list ticked, row by row, the way a sailor at the wharf does it.
	for (let i = 0; i < 40; i++) {
		// Clicked as an element, not at a point on the screen: a row low
		// on a long list sits under the bar pinned at the foot, and a
		// click there presses "Back to the plan".
		const clicked = await page.evaluate(() => { const b = document.querySelector('.pack-row:not(.on) .pack-box'); if (b) b.click(); return !!b; });
		if (!clicked) break;
		await wait(150);
	}
	await wait(200);
}

/** Back to the plan. The tests seed `planSec: 'all'`, so all four of
 *  its parts are open and every control is on the page at once. */
async function toPlan(page) {
	await page.evaluate(() => { const b = [...document.querySelectorAll('[data-act="barter-step"][data-id="plan"]')].find(e => e.getBoundingClientRect().width > 0); if (b) b.click(); });
	await wait(400);
	await page.waitForSelector('.barter-screen.step-plan', { timeout: 10000 });
}

test('a run long enough to eat the rations puts in at a sea wharf for supplies, and BreezySail eats more', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	const got = await page.evaluate(async () => {
		const R = await import('/js/barter/route.js'); const store = await import('/js/state.js'); const { npcById } = await import('/js/barter_npcs.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)');
		// Back and forth between Iliya's coin islands and Ancado's, far
		// enough apart that the pool cannot last the round.
		const far = [...npcById.values()].filter(n => n.x > 100000).slice(0, 2), near = [...npcById.values()].filter(n => n.x > 70000 && n.x < 76000).slice(0, 2);
		const stops = [];
		for (let i = 0; i < 16; i++) stops.push({ npcId: (i % 2 ? far : near)[i % 4 < 2 ? 0 : 1].id, weightAfter: 0, times: 1 });
		const run = on => { store.setProfile('breezy', on); return R.withRations(stops.map(s => ({ ...s })), 0); };
		const plain = run(false), breezy = run(true);
		const low = list => list.filter(s => s.npcId && s.pool && s.pool.left < s.pool.full * 0.1).length;
		const calls = list => list.filter(s => s.refill);
		const L = R.legsOf(breezy); const dbg = breezy.map((s, k) => [s.refill ? 'R' : s.wharf ? 'W' : 'i', s.pool && Math.round(s.pool.left / 1000), L.legs[k] != null ? Math.round(L.secondsOf(L.legs[k])) : null]);
		// A run kept before its stops carried their rations reads them again.
		const marks = R.rationMarks(stops.map(({ pool, ...s }) => s), 0);
		const chart = R.chartData(breezy, '').calls.some(c => c[9] === 'rations');
		// A call fills the pool whatever is left, so one made nearly full is
		// wasted: every call comes when the pool is low.
		// On short hops round one sea, where any wharf is near: calls come
		// late, the pool low, not the moment one happens to be on the way.
		const round = [...npcById.values()].filter(n => n.x > 70000 && n.x < 80000 && n.y > 55000 && n.y < 66000).slice(0, 8);
		const hops = []; for (let i = 0; i < 90; i++) hops.push({ npcId: round[i % round.length].id, weightAfter: 0, times: 1 });
		store.setProfile('breezy', true);
		const busy = R.withRations(hops, 0).filter(s => s.refill);
		const lateCalls = busy.length > 0 && busy.every(s => s.pool.left < s.pool.full / 3) ? true : busy.map(s => Math.round(s.pool.left / 1000));
		return { lateCalls, chart, marks: marks.every(m => m && m.full > 0 && m.left <= m.full), dbg, from: !!L.from, plain: calls(plain).length, breezy: calls(breezy).length, at: [...new Set(calls(breezy).map(s => s.wharf.at))], low: low(plain) + low(breezy), short: breezy.some(s => s.pool && s.pool.short), line: R.rationsLine(breezy) };
	});
	assert.ok(got.plain >= 1, `a call for supplies: ${JSON.stringify(got)}`);
	assert.ok(got.breezy >= got.plain, `BreezySail kept going needs as many calls or more: ${JSON.stringify(got)}`);
	assert.equal(got.low, 0, `never under the reserve at an island: ${JSON.stringify(got.dbg)}`);
	assert.equal(got.short, false);
	assert.ok(got.marks, 'the rations worked out again for a run kept without them');
	assert.ok(got.chart, 'a call for supplies goes on the chart as a rations call');
	assert.equal(got.lateCalls, true, 'every call made with the pool low');
	assert.ok(got.at.every(at => !['Calpheon City', 'Altinova', "O'dyllita"].includes(at)), 'only sea wharves');
	assert.match(got.line, /calls? for supplies put in/);
	assert.match(got.line, /BreezySail every 50 s/);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the material book is the game’s own layouts, every one, and a page read off the window says which it is', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.setView('barter', { goal: 'material' }); store.flush(); });
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('[data-act="barter-mat-book"]', { timeout: 20000 });
	const said = Number((await text(page, '[data-act="barter-mat-book"]')).match(/(\d+) boards/)[1]);
	await page.evaluate(() => document.querySelector('[data-act="barter-mat-book"]').click());
	await page.waitForSelector('.mb-card', { timeout: 10000 });
	// As many as the bar says: the dialog used to draw the readings alone.
	assert.equal(await count(page, '.mb-card'), said, 'every board the bar counts');
	assert.ok(said >= 40, `the game's layouts: ${said}`);
	assert.match(await text(page, '.dialog-note'), /layouts, taken from the game’s own files/);
	assert.equal(await text(page, '.mb-card .mb-num'), 'M1', 'named by their row in the game’s table');
	// The book is the game's, not the fleet's: nothing to tell, nobody to thank.
	assert.equal(await count(page, '[data-mb-tell], [data-mb-seen], .lb-readers'), 0);
	await page.evaluate(() => document.querySelector('[data-close]').click()); await wait(300);
	// A coin day on the material list: rows paying Crow Coins read off the
	// window go to the material list, not the trade board, and find their board.
	await page.evaluate(async () => {
		const { takeRead } = await import('/js/barter/board.js'); const ui = await import('/js/ui.js');
		takeRead([[58904, '[Level 4] Green Salt Lump'], [58901, '[Level 2] Urchin Spine'], [58903, '[Level 4] Opulent Thread Spool'], [58902, '[Level 3] Scout Binoculars'], [58964, '[Level 2] Pirate Gold Coin'], [58963, '[Level 2] Monster Tentacle']].map(([npcId, give]) => ({ npcId, give, recv: 'Crow Coin' })));
		ui.render();
	}); await wait(800);
	assert.match(await text(page, '.mat-say'), /board M11/, 'the coin rows found their material board');
	assert.equal(await count(page, '.mat-steps, [data-act="barter-mat-tell"], [data-act="barter-mat-fleet-take"]'), 0, 'no steps to share it by');
	// The islands M11 fills at random are asked about as it is found:
	// each once, its exchanges under what they pay, with the game's odds.
	await page.waitForSelector('.dialog .rolls', { timeout: 5000 });
	const asked = await count(page, '.dialog .roll-row');
	assert.ok(asked >= 2, `the rolled islands asked about: ${asked}`);
	assert.match(await text(page, '.dialog .roll-option .roll-meta'), /🎲\d+%/);
	await page.evaluate(() => document.querySelector('.dialog [data-act="barter-mat-roll-pick"][data-npc="50817"]').click()); await wait(200);
	const picked = await page.evaluate(async () => {
		const { V } = await import('/js/barter/state.js'); const store = await import('/js/state.js');
		const b = document.querySelector('.dialog [data-npc="50817"][aria-pressed="true"]');
		return { on: !!b, answered: V.matBoard.answers.some(a => a.npcId === 50817 && a.give === b.dataset.give && !a.took), kept: Object.keys(store.getProfile('rolls', {})).includes('M11|50817') };
	});
	assert.deepEqual(picked, { on: true, answered: true, kept: true }, 'said, taken onto the list, counted for the fleet');
	await page.evaluate(() => document.querySelector('.dialog [data-close]').click()); await wait(500);
	assert.equal(await count(page, '.dialog .rolls'), 0, 'asked once, not again at the redraw');
	assert.match(await text(page, '.mat-bar .rolls-chip'), new RegExp(`${asked - 1} island`), 'the chip counts what is left to say');
	// A refresh deals the material list or the trade board, never both: a
	// trade board still standing from before adds none of its coin islands.
	const both = await page.evaluate(async () => {
		const { V } = await import('/js/barter/state.js'); const { barterKey } = await import('/js/clock.js'); const ui = await import('/js/ui.js'); const store = await import('/js/state.js');
		store.setProfile('barterCount', 20000);
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)');
		for (const g of ['[Level 4] Pirate\'s Key', '[Level 4] Solidified Lava', '[Level 4] Seashell Deco', "[Level 4] Marine Knights' Spear", '[Level 4] Panacea', '[Level 4] Amethyst Fragment', '[Level 4] Headless Dragon Figurine', '[Level 4] Old Chest with Gold Coins', '[Level 4] Stolen Pirate Dagger', '[Level 4] Green Salt Lump']) store.setStock(g, 3);
		V.board = { ...V.board, day: barterKey(), answers: [], pinned: '4' };
		ui.render();
		await new Promise(r => setTimeout(r, 500));
		return [...new Set((V.shownPlan ? V.shownPlan.stops : []).filter(x => x.npcId).map(x => x.parleyBase))];
	});
	assert.ok(!both.includes(21650), `no trade-list coin island on the route: ${both.join(', ')}`);
	assert.ok(both.includes(29430), 'the material list\'s own');
	// Nor a trade-list coin island read off the window.
	const read = await page.evaluate(async () => {
		const { V } = await import('/js/barter/state.js'); const { barterKey } = await import('/js/clock.js'); const ui = await import('/js/ui.js'); const L = await import('/js/barter-layouts.js');
		const onMat = new Set(V.matBoard.answers.map(a => a.npcId));
		let row = null;
		for (const c of L.layouts().combos) { const o = c.offers.find(x => x[3] === 'Crow Coin' && !onMat.has(x[0]) && x[1] === '[Level 4] Pirate\'s Key'); if (o) { row = { npcId: o[0], give: o[1], recv: o[3] }; break; } }
		if (!row) return 'no row';
		V.board = { ...V.board, day: barterKey(), answers: [row], pinned: '' };
		ui.render();
		await new Promise(r => setTimeout(r, 500));
		return (V.shownPlan ? V.shownPlan.stops : []).some(x => x.npcId === row.npcId) ? 'on the route' : `off: ${row.npcId}`;
	});
	assert.match(read, /^off/);
	// Each exchange opens at its own count, as the game's table has it --
	// not at a route-unlock list's figure for the island: Shipwrecked Cox
	// Pirate Ship was held back to 10,000 barters from a sailor at 4,489
	// trading there.
	const cox = await page.evaluate(async () => {
		const store = await import('/js/state.js'); const { V } = await import('/js/barter/state.js'); const ui = await import('/js/ui.js');
		store.setProfile('barterCount', 4489);
		ui.render();
		await new Promise(r => setTimeout(r, 500));
		return (V.shownPlan ? V.shownPlan.stops : []).some(x => x.npcId === 50822);
	});
	assert.ok(cox, 'Shipwrecked Cox Pirate Ship is sailed for at 4,489 barters');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a material layout read: what the builds need is chosen, today’s islands are split into what can be done and what cannot, and one route sails what can', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'material', port: 0, planSec: 'all', advOpen: true, matOrders: { reach: 'want', calls: true, pace: 'full', quests: 'no' } });
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.mat-list.hero', { timeout: 15000 });
	// A material the builds are short of that M1 deals at two islands or
	// more for a trade good: the first island's give is held at Velia, the
	// others' are not.
	const pick = await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); store.setProfile('barterCount', 20000);
		const L = await import('/js/barter-layouts.js'); const { snapshot } = await import('/js/ui-state.js'); const { levelOf } = await import('/js/barter.js');
		const page = L.materialPages().find(p => p.id === 'M1');
		const by = new Map();
		for (const [npcId, o] of page.offers) if (!o.options && (snapshot.missing[o.recv] || 0) > 0 && levelOf(o.give) !== null) { if (!by.has(o.recv)) by.set(o.recv, []); by.get(o.recv).push({ npcId, give: o.give }); }
		const [mat, isles] = [...by].find(([, v]) => v.length >= 2 && new Set(v.map(x => x.give)).size >= 2);
		for (const x of isles) store.setStock(x.give, 0);
		store.setStockAt(isles[0].give, 'Velia', 2, 'ashore');
		const { takeRead } = await import('/js/barter/board.js');
		takeRead([...page.offers].filter(([, o]) => !o.options).map(([npcId, o]) => ({ npcId, give: o.give, recv: o.recv })));
		return { mat, held: isles[0], other: isles.find(x => x.give !== isles[0].give) };
	});
	await wait(800);
	// Read whole, the layout is known and filled in: nothing to press.
	assert.match(await text(page, '.mat-say'), /board M1/);
	assert.equal(await count(page, '[data-act="barter-mat-fill"]'), 0, 'filled in without asking');
	// The material is chosen by itself, since the builds are short of it.
	const need = sel => page.evaluate((m, q) => { const sec = [...document.querySelectorAll('.mat-need')].find(el => el.querySelector('.mat-need-text b').textContent === m); return sec ? [...sec.querySelectorAll(q)].map(r => r.textContent.replace(/\s+/g, ' ').trim()) : null; }, pick.mat, sel);
	assert.ok(await need('.mat-need-text'), `${pick.mat} is on the run`);
	// The material says what doing all of it takes; its islands are a press away.
	assert.match((await need('.mat-need-text small')).join(' '), /1 island today you can trade with.*all of them: [\d,]+ Parley for [\d,–]+.*whose give you do not hold/);
	assert.deepEqual(await need('.mat-row'), [], 'no island list on the page');
	await page.evaluate(m => document.querySelector(`[data-act="barter-mat-isles"][data-item="${window.CSS.escape(m)}"]`).click(), pick.mat); await wait(400);
	assert.ok(await count(page, '#dialog .mat-row:not(.off)') >= 1, 'the island whose give is held can be done');
	assert.ok(await count(page, '#dialog .mat-row.off') >= 1, 'the one whose give is not held cannot');
	await page.evaluate(() => document.querySelector('#dialog [data-close]').click()); await wait(300);
	assert.equal(await count(page, '[data-act="barter-mat-only"], [data-act="barter-mat-tick"]'), 0, 'no filters, nothing to tick');
	// One route, for what can be done: the harbour where the give is kept, then the island.
	await laidOut(page);
	const route = () => page.evaluate(async () => { const { V } = await import('/js/barter/state.js'); return V.shownPlan ? V.shownPlan.stops.map(s => (s.wharf ? 'wharf' : s.npcId)) : []; });
	let stops = await route();
	assert.ok(stops.includes(pick.held.npcId), 'the island that can be done');
	assert.ok(stops.indexOf('wharf') >= 0 && stops.indexOf('wharf') < stops.indexOf(pick.held.npcId), `the harbour before it: ${stops.join(', ')}`);
	assert.ok(!stops.includes(pick.other.npcId), 'not the one that cannot');
	// Without the call, the give is to bring first.
	await toPlan(page);
	await page.evaluate(() => document.querySelector('[data-act="barter-order"][data-k="barter-mat-calls"][data-v="false"]').click()); await wait(400);
	await laidOut(page);
	stops = await route();
	assert.ok(!stops.includes('wharf'), `no call: ${stops.join(', ')}`);
	assert.match(await text(page, '.run-list.amber'), /Bring to the harbour first.*at Velia \(2\)/i);
	// The route is the sailor's to change: an island skipped comes off it,
	// and the bar above the stops puts it back.
	await toPlan(page);
	await page.evaluate(() => document.querySelector('[data-act="barter-order"][data-k="barter-mat-calls"][data-v="true"]').click()); await wait(400);
	await laidOut(page);
	const isles = (await route()).filter(x => x !== 'wharf');
	if (isles.length >= 2) {
		await page.evaluate(id => document.querySelector(`[data-act="barter-route-skip"][data-npc="${id}"]`).click(), isles[0]); await wait(500);
		assert.ok(!(await route()).includes(isles[0]), 'skipped');
		assert.ok(await page.$(`[data-act="barter-route-unskip"][data-npc="${isles[0]}"]`), 'and can be put back');
		await page.evaluate(() => document.querySelector('[data-act="barter-route-reset"]').click()); await wait(500);
		assert.ok((await route()).includes(isles[0]), 'back on the route');
		// Moved one later within its trip.
		const before = await route();
		await page.evaluate(id => document.querySelector(`[data-act="barter-route-nudge"][data-npc="${id}"][data-by="1"]`).click(), isles[0]); await wait(500);
		const after = await route();
		assert.ok(after.indexOf(isles[0]) >= before.indexOf(isles[0]), `moved later: ${before.join(',')} → ${after.join(',')}`);
		await page.evaluate(() => document.querySelector('[data-act="barter-route-reset"]').click()); await wait(400);
	}
	// What comes home, one tile a material.
	assert.ok(await page.$('.run-shelves.after'), 'the storage after');
	// A run recorded on today's list has used its islands' attempts: the
	// next one does not send the ship back to them.
	await page.evaluate(async () => {
		const { V } = await import('/js/barter/state.js'); const { noteMatUsed } = await import('/js/barter/material.js'); const { stopKey } = await import('/js/barter/sail.js'); const ui = await import('/js/ui.js');
		const plan = V.shownPlan;
		noteMatUsed(plan, { done: plan.stops.map((x, k) => stopKey(x, k, plan.stops)) });
		ui.render();
	}); await wait(500);
	assert.ok(!(await route()).includes(pick.held.npcId), 'an island traded out today is not sailed to again');
	await toPlan(page);
	assert.match((await need('.mat-need-text small')).join(' '), /traded out today/);
	await page.evaluate(async () => { const { V } = await import('/js/barter/state.js'); V.matBoard.used = {}; (await import('/js/ui.js')).render(); }); await wait(400);
	// Nothing to pick: every material the builds are short of that the
	// list pays is on the run, with no way to take one off or add one.
	await toPlan(page);
	assert.equal(await count(page, '[data-act="barter-mat-drop"], [data-act="barter-mat-add"]'), 0, 'no picking');
	// Its want is its own.
	await page.evaluate(m => { const el = [...document.querySelectorAll('.mat-need')].find(x => x.querySelector('.mat-need-text b').textContent === m).querySelector('[data-act="barter-mat-want"]'); el.value = '7'; el.dispatchEvent(new Event('change', { bubbles: true })); }, pick.mat); await wait(400);
	assert.equal(await page.evaluate(async m => (await import('/js/barter/state.js')).V.wants[m], pick.mat), 7);
	// And back to what the builds need.
	await page.evaluate(m => document.querySelector(`[data-act="barter-mat-want-reset"][data-item="${window.CSS.escape(m)}"]`).click(), pick.mat); await wait(400);
	assert.equal(await page.evaluate(async m => (await import('/js/barter/state.js')).V.wants[m], pick.mat), undefined);
	// Where the ship is now: any barterer, found by typing -- the run then
	// starts there -- and back to the home port with one press.
	await page.evaluate(() => document.querySelector('[data-act="barter-mat-at-pick"]').click()); await wait(400);
	await page.type('.picker-in', 'Shipwrecked Marine'); await wait(200);
	await page.keyboard.press('Enter'); await wait(500);
	assert.ok(await page.evaluate(async () => (await import('/js/barter/state.js')).V.matAt > 0), 'the ship is at the island picked');
	assert.match(await text(page, '[data-act="barter-mat-at-pick"]'), /Shipwrecked Marine/);
	await page.evaluate(() => document.querySelector('[data-act="barter-mat-at-home"]').click()); await wait(400);
	assert.equal(await page.evaluate(async () => (await import('/js/barter/state.js')).V.matAt), 0);
	// The island order is the sailor's to choose.
	await page.evaluate(() => document.querySelector('[data-act="barter-order"][data-k="barter-mat-order"][data-v="rich"]').click()); await wait(400);
	assert.equal(await page.evaluate(async () => (await import('/js/barter/state.js')).V.matOrders.order), 'rich');
	// And the orders are chips, like the trade goods' run.
	await page.evaluate(() => document.querySelector('[data-act="barter-order"][data-k="barter-mat-reach"][data-v="all"]').click()); await wait(400);
	assert.ok(await page.$eval('[data-act="barter-order"][data-k="barter-mat-reach"][data-v="all"]', el => el.classList.contains('active')));
	// A ship already past the ceiling with no home port to leave things at:
	// the run says so, and how to fix it.
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.setStockAt('[Level 7] Crystal Ball of Fortune', store.ABOARD, 40, 'aboard'); });
	await wait(500);
	await laidOut(page);
	assert.match(await text(page, '.barter-screen'), /leaves heavier than its limit.*home port/i);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the hold is a line across the Barter tab that opens over the page, and the dialog follows a change made in it', async () => {
	const { page, context, errors } = await open('#barter');
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); store.setProfile('barterCount', 20000);
		store.setStock('[Level 5] Azure Quartz', 5);
		store.setStock('[Level 7] Crystal Ball of Fortune', 2);
		store.setStockAt('[Level 5] Luxury Patterned Fabric', 'Iliya Island', 12, 'ashore');
	});
	await wait(1200);
	// One column: no two-column layout left on the tab.
	assert.equal(await count(page, '.barter-layout'), 0);
	assert.equal(await count(page, '.barter-screen > .barter-hold'), 0, 'the full hold is not on the page');
	// The plan says what is held rung by rung, so the ladder carries the
	// counts; the weight is the wharf's question, and the bar is there.
	assert.match(await text(page, '.ladder'), /L(evel )?7[\s\S]*2 held/i);
	await laidOut(page);
	// Waited for rather than slept on: the tab redraws when the stock
	// above lands, and half a second is comfortable until the machine is
	// running the rest of this file beside it.
	await page.waitForFunction(() => /16,500 LT/.test(document.querySelector('.hold-bar')?.textContent || ''), { timeout: 15000 });
	const bar = await text(page, '.hold-bar');
	assert.match(bar, /The hold.*Epheria Carrack: Advance.*9,000 \/ 16,500 LT/i);
	assert.match(bar, /L7\s*2.*L5\s*5/);
	await page.evaluate(() => document.querySelector('.hold-bar [data-act="barter-hold-open"]').click()); await wait(400);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), false);
	assert.match(await text(page, '#dialog .barter-hold'), /Azure Quartz.*Crystal Ball of Fortune|Crystal Ball of Fortune.*Azure Quartz/);
	// One more Ball, from inside the dialog: the dialog stays and re-counts.
	await page.evaluate(() => document.querySelector('#dialog [data-act="barter-good"][data-item="[Level 7] Crystal Ball of Fortune"][data-delta="1"]').click()); await wait(400);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), false, 'still up');
	assert.equal(await page.$eval('#dialog [data-act="barter-good-set"][data-item="[Level 7] Crystal Ball of Fortune"]', el => el.value), '3');
	assert.match(await text(page, '.hold-bar'), /11,000 \/ 16,500 LT/, 'the bar under it follows');
	await page.keyboard.press('Escape'); await wait(300);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), true);
	assert.deepEqual(errors, []);
	await context.close();
});

test('a chain card opens its climb step by step: every island in full, what it takes and pays, the card left unticked', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58948, give: '[Level 6] Top-Quality Coconut Syrup', recv: "[Level 7] Artisan's Seashell Necklace" }, { npcId: 58901, give: 'Vinegar', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.chain .chain-steps-open', { timeout: 15000 }); await wait(2000);
	const was = await page.$eval('.chain', el => el.classList.contains('on'));
	const rungs = await page.$eval('.chain', el => el.querySelectorAll('.chain-goods img').length);
	await page.evaluate(() => document.querySelector('.chain .chain-steps-open').click()); await wait(400);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), false, 'the dialog is up');
	assert.equal(await page.$$eval('#dialog .chain-step:not(.call)', els => els.length), rungs, 'a step for every island of the climb');
	const first = await page.$eval('#dialog .chain-step:not(.call) .chain-step-place b', el => el.textContent);
	assert.ok(first.length > 2 && !first.endsWith('…'), 'the island in full');
	assert.match(await text(page, '#dialog .chain-step:not(.call) .chain-step-meta'), /trades/);
	assert.equal(await page.$eval('.chain', el => el.classList.contains('on')), was, 'opening it does not tick the chain');
	await page.keyboard.press('Escape'); await wait(300);
	assert.deepEqual(errors, []);
	await context.close();
});

test('a layout that rolls a good or coins asks which, with the likelier picked, and the board follows the answer', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		// Layout 31, pinned by one [Level 1] island, at 4,406 barters: Ajir,
		// Orffs and Narvo each pay a [Level 5] or Crow Coins today.
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58901, give: 'Powder of Time', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		store.setProfile('barterCount', 4406);
		store.addTarget('Carrack (Advance)', 1);
		store.setProfile('crewShip', 'Carrack (Advance)');
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.rolls-chip', { timeout: 20000 });
	// Three coin rolls, and the pools the layout only names.
	const asked = Number((await text(page, '.rolls-chip')).match(/(\d+) islands draw/)[1]);
	await tap(page, '.rolls-chip'); await wait(400);
	assert.equal(await count(page, '#dialog .roll-row:not(.pool)'), 3);
	const pools = await count(page, '#dialog .roll-row.pool');
	assert.ok(pools >= 3, `the pools asked too: ${pools}`);
	assert.equal(asked, 3 + pools);
	assert.equal(await count(page, '#dialog .roll-option.likely'), 3, 'each has the likelier picked, until said');
	// Ajir showed coins.
	await page.evaluate(() => [...document.querySelectorAll('#dialog [data-act="barter-roll-pick"]')].find(b => b.dataset.npc === '58966' && b.dataset.recv === 'Crow Coin').click()); await wait(300);
	assert.equal(await count(page, '#dialog .roll-row.said'), 1);
	// A pool: what it pays, then for what -- nothing planned until said.
	const pool = await page.evaluate(() => {
		const row = document.querySelector('#dialog .roll-row.pool');
		row.querySelector('[data-act="barter-roll-pays"]').click();
		return row.querySelector('.roll-head b').textContent;
	}); await wait(300);
	const pick = await page.evaluate(name => {
		const row = [...document.querySelectorAll('#dialog .roll-row.pool')].find(r => r.querySelector('.roll-head b').textContent === name);
		const b = row.querySelector('[data-act="barter-roll-pick"]');
		const out = { npcId: Number(b.dataset.npc), give: b.dataset.give, recv: b.dataset.recv };
		b.click();
		return out;
	}, pool); await wait(300);
	assert.equal(await count(page, '#dialog .roll-row.said'), 2);
	await page.keyboard.press('Escape'); await wait(800);
	assert.match(await text(page, '.rolls-chip'), new RegExp(`${asked - 2} islands draw`));
	const drawn = await page.evaluate(async p => {
		const { V } = await import('/js/barter/state.js'); const { boardNow } = await import('/js/barter/board.js'); const store = await import('/js/state.js');
		const b = boardNow();
		return { said: V.board.answers.some(a => a.npcId === p.npcId && a.give === p.give && a.recv === p.recv), on: b.data.some(e => e.name === p.recv && e.sources.some(s => s.npc_id === p.npcId)), rolls: store.getProfile('rolls', {})[`31|${p.npcId}`] };
	}, pick);
	assert.equal(drawn.said, true, 'the pool said is an answer of the trade board');
	assert.equal(drawn.on, true, 'and on the board, as said');
	assert.deepEqual(drawn.rolls.seen, { [`${pick.give}|${pick.recv}`]: 1 }, 'counted for the fleet');
	const r = await page.evaluate(async () => {
		const { boardNow } = await import('/js/barter/board.js');
		const store = await import('/js/state.js');
		const b = boardNow();
		const at = b.data.filter(e => e.sources.some(s => s.npc_id === 58966)).map(e => e.name).filter(n => n === 'Crow Coin' || n.startsWith('[Level'));
		return { layout: b.combo.id, at, rolls: store.getProfile('rolls', {})['31|58966'] };
	});
	assert.equal(r.layout, '31');
	assert.deepEqual(r.at, ['Crow Coin'], 'the board plans Ajir on the coins');
	assert.deepEqual(r.rolls.seen, { '[Level 4] Panacea|Crow Coin': 1 }, 'counted once for the fleet');
	assert.deepEqual(errors, []);
	await context.close();
});

test('two chains on one pile: the second start says none are left, asks before it is ticked, and either can be sailed', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		// Layout 1: two islands take a [Level 4] Panacea.
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), pinned: '1', answers: [] } });
		store.setStockAt('[Level 4] Panacea', 'Iliya Island', 5);
		// Every island open: the two that take it are far from the start.
		store.setProfile('barterCount', 20000);
		store.addTarget('Carrack (Advance)', 1);
		store.setProfile('crewShip', 'Carrack (Advance)');
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.chain', { timeout: 15000 });
	// The search ticks its best run when it answers: let it, then untick.
	await page.waitForFunction(() => document.querySelector('.proposals:not(.working)'), { timeout: 30000 }); await wait(500);
	await tap(page, '[data-act="barter-chains-clear"]'); await wait(1500);
	// The cards that start from the Panacea: one ticked, and the other.
	// Where a chain from the Panacea is ticked: its own card, or a start on
	// a ladder's card -- whichever the board draws it as.
	const scaleCards = () => page.$$eval('button.chain[data-id], .chain-starts .chip[data-id]', els => {
		const out = new Map();
		for (const e of els) if (e.dataset.id.includes('Panacea') && !e.dataset.id.startsWith('land:')) out.set(e.dataset.id, { id: e.dataset.id, act: e.dataset.act, on: e.classList.contains('on') || e.classList.contains('active'), text: e.textContent.replace(/\s+/g, ' ') });
		return [...out.values()];
	});
	const press = id => page.evaluate(x => [...document.querySelectorAll('.chain-starts .chip[data-id], button.chain[data-id]')].find(e => e.dataset.id === x).click(), id);
	const before = await scaleCards();
	assert.equal(before.length, 2, 'two chains start from the Panacea');
	await press(before[0].id); await wait(2000);
	const other = (await scaleCards()).find(x => x.id === before[1].id);
	assert.equal(other.act, 'barter-chain-claim', 'the other asks first');
	assert.match(other.text, /0 of 5 left/);
	await press(other.id); await wait(500);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), false, 'the dialog explains');
	assert.equal(await count(page, '#dialog .claim-chain'), 2, 'both chains side by side');
	assert.ok((await scaleCards()).find(x => x.id === before[0].id).on, 'nothing changed by asking');
	// Sail the second instead: it is ticked, the first is not.
	await page.evaluate(id => [...document.querySelectorAll('#dialog [data-act="barter-claim-pick"]')].find(e => e.dataset.id === id).click(), other.id); await wait(2000);
	const last = await scaleCards();
	assert.equal(last.find(x => x.id === other.id).on, true);
	assert.equal(last.find(x => x.id === before[0].id).on, false);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').hidden), true);
	assert.deepEqual(errors, []);
	await context.close();
});

test('a run recorded adds its trades to Total Barters, and says what that opened', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58948, give: '[Level 6] Top-Quality Coconut Syrup', recv: "[Level 7] Artisan's Seashell Necklace" }, { npcId: 58901, give: 'Vinegar', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		// Nine barters short of the first route the count opens.
		store.setProfile('barterCount', 1);
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.chain', { timeout: 15000 });
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); });
	await page.waitForFunction(() => document.querySelector('[data-act="barter-cast-off"]:not([disabled]), .run-dock'), { timeout: 20000 });
	await laidOut(page);
	await page.evaluate(() => document.querySelector('[data-act="barter-cast-off"]').click()); await wait(2500);
	// Every stop ticked off, then recorded from the results step.
	await page.evaluate(() => document.querySelector('.cockpit-foot [data-act="barter-sail-all"]').click()); await wait(600);
	await page.evaluate(() => document.querySelector('.cockpit-foot [data-act="barter-sail-all-go"]').click()); await wait(1500);
	const trades = await page.evaluate(() => Number(document.querySelector('.sail-n').textContent.match(/(\d+) of/)[1]));
	assert.ok(trades > 0, 'stops were ticked off');
	await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-step"][data-id="results"]')].find(e => e.getBoundingClientRect().width > 0).click()); await wait(1500);
	await page.evaluate(() => document.querySelector('[data-act="barter-record"]').click()); await wait(1500);
	const count2 = await page.evaluate(async () => (await import('/js/state.js')).getProfile('barterCount', 0));
	assert.ok(count2 > 1, `Total Barters moved: ${count2}`);
	// The toast names the newest trade route the count opened -- the last
	// threshold crossed, since a long run can pass more than one.
	const { ROUTE_UNLOCKS } = await import('../js/barter.js');
	const opened = ROUTE_UNLOCKS.filter(r => r.opens && r.barters > 1 && r.barters <= count2).pop();
	const said = await text(page, '#toast');
	assert.match(said, /barter/i);
	if (opened) assert.ok(said.includes(opened.opens), `${said} names ${opened.opens}`);
	// And one Undo takes the count back with the goods.
	const back = await page.evaluate(async () => { const store = await import('/js/state.js'); store.undo(); return store.getProfile('barterCount', 0); });
	assert.equal(back, 1, 'the count comes back with everything else the run wrote');
	assert.deepEqual(errors, []);
	await context.close();
});

test('abandoned keeping what was traded, the stops ticked are recorded: the count, what each island has left, the Parley', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58948, give: '[Level 6] Top-Quality Coconut Syrup', recv: "[Level 7] Artisan's Seashell Necklace" }, { npcId: 58901, give: 'Vinegar', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		store.setProfile('barterCount', 1);
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.chain', { timeout: 15000 });
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); });
	await page.waitForFunction(() => document.querySelector('[data-act="barter-cast-off"]:not([disabled]), .run-dock'), { timeout: 20000 });
	await laidOut(page);
	await page.evaluate(() => document.querySelector('[data-act="barter-cast-off"]').click()); await wait(2500);
	await page.evaluate(() => document.querySelector('.cockpit-foot [data-act="barter-sail-all"]').click()); await wait(600);
	await page.evaluate(() => document.querySelector('.cockpit-foot [data-act="barter-sail-all-go"]').click()); await wait(1500);
	await tap(page, '[data-act="barter-step"][data-id="sail"]'); await wait(500);
	await page.evaluate(() => document.querySelector('[data-act="barter-sail-drop"]').click()); await wait(400);
	await tap(page, '[data-abandon="keep"]'); await wait(1500);
	const r = await page.evaluate(async () => {
		const { V } = await import('/js/barter/state.js');
		const store = await import('/js/state.js');
		return { count: store.getProfile('barterCount', 0), used: Object.keys(V.board.used || {}).length, runs: (store.getProfile('runs', []) || []).length, parley: store.getProfile('parleyHeld', 0) };
	});
	assert.ok(r.count > 1, `Total Barters moved: ${r.count}`);
	assert.ok(r.used > 0, 'the islands traded have that many fewer left today');
	assert.equal(r.runs, 1, 'an entry under Past runs');
	assert.ok(r.parley > 0 && r.parley < 1000000, `the Parley came off the bar: ${r.parley}`);
	assert.equal(await page.evaluate(async () => (await import('/js/barter/sail.js')).sailing()), null, 'and the run is gone');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the running clock draws the sailor’s own ship crossing the leg', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58948, give: '[Level 6] Top-Quality Coconut Syrup', recv: "[Level 7] Artisan's Seashell Necklace" }, { npcId: 58901, give: 'Vinegar', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		store.setProfile('barterCount', 1);
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.waitForSelector('.chain', { timeout: 15000 });
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); });
	await page.waitForFunction(() => document.querySelector('[data-act="barter-cast-off"]:not([disabled]), .run-dock'), { timeout: 20000 });
	await laidOut(page);
	await page.evaluate(() => document.querySelector('[data-act="barter-cast-off"]').click()); await wait(600);
	// Casting off: the ship dropped in, close up, over the page, the clock's
	// own strip held back under it -- and a press skips to the clock.
	assert.equal(await count(page, '.castoff-fx .setsail canvas'), 1, 'the set-sail card');
	assert.ok(await page.evaluate(() => document.body.classList.contains('sail-scene-hold')), 'the strip waits under it');
	await page.evaluate(() => document.querySelector('.castoff-fx').click()); await wait(300);
	assert.equal(await count(page, '.castoff-fx'), 0, 'a press skips it');
	assert.equal(await page.evaluate(() => document.body.classList.contains('sail-scene-hold')), false, 'and the strip is shown');
	await wait(1100);
	// Casting off starts the clock; if it did not, start it.
	if (!(await count(page, 'canvas[data-sail-scene]'))) { await tap(page, '[data-act="barter-timer-start"]'); await wait(1500); }
	await wait(600);
	assert.equal(await page.$eval('canvas[data-sail-scene]', el => el.dataset.ship), 'icons/ship_14.webp', 'the Carrack (Advance) itself');
	// Drawn, not blank: the canvas has pixels that are not the sky.
	const drawn = await page.$eval('canvas[data-sail-scene]', el => { const d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
	assert.ok(drawn > 1000, `${drawn} pixels drawn`);
	// It sails on smoothly, not a jump a second: every look a third of a
	// second apart finds it further along.
	const along = [];
	for (let i = 0; i < 5; i++) { along.push(await page.evaluate(async () => (await import('/js/sail-scene.js')).sceneNow().px)); await wait(300); }
	for (let i = 1; i < along.length; i++) assert.ok(along[i] > along[i - 1], `moving on: ${along.join(', ')}`);
	// Traded early: the ship makes fast, and the next leg starts from its
	// start -- not part-way along it, and not after a wait.
	const leg0 = await page.evaluate(async () => (await import('/js/sail-scene.js')).sceneNow().leg);
	await page.evaluate(() => { const b = document.querySelector('.cockpit-go[data-act="barter-stop-done"], .cockpit-go[data-act="barter-paid"]'); if (b) b.click(); });
	await page.waitForFunction(n => import('/js/sail-scene.js').then(m => { const x = m.sceneNow(); return x && x.leg > n && x.mode === 'run'; }), { timeout: 10000, polling: 100 }, leg0);
	const next = await page.evaluate(async () => (await import('/js/sail-scene.js')).sceneNow());
	assert.ok(next.px < 0.05, `the next leg starts at its start: ${next.px}`);
	// The tab drew itself again on the press; the sea is still drawn on the
	// canvas that is on the page, at its full size -- not on a stray one,
	// and not on a blank one left at the browser's 300 pixels.
	assert.equal(next.drawnOn, true, 'drawn on the canvas on the page');
	const box = await page.$eval('canvas[data-sail-scene]', el => el.clientWidth);
	assert.ok(next.backing >= box, `the canvas is sized to its box: ${next.backing} for ${box}`);
	// ...having sailed there: the view travelled on a leg, the pier behind.
	assert.ok(next.camX > 0, `the view moved on with the ship: ${next.camX}`);
	// Glance mode and the full view morph one into the other, and leave
	// the panel as they found it.
	const glanced = await count(page, '.cockpit.glance');
	const moving = await page.evaluate(() => { document.querySelector('[data-act="barter-glance"]').click(); return document.getAnimations().length; });
	assert.ok(moving > 0, `the parts travel: ${moving} animations`);
	await wait(1500);
	assert.notEqual(await count(page, '.cockpit.glance'), glanced, 'the view changed');
	assert.equal(await page.$eval('section.panel.cockpit', el => el.getAttribute('style') || ''), '', 'nothing left on the panel');
	assert.equal(await count(page, 'section.panel.cockpit > div[style*="z-index"]'), 0, 'and its stand-in face is gone');
	// The Map's panel sails the same ship.
	await page.evaluate(() => document.querySelector('[data-act="barter-sail-chart"]').click());
	await page.waitForFunction(() => document.querySelector('.cockpit.compact canvas[data-sail-scene]'), { timeout: 10000 }); await wait(800);
	assert.equal(await page.evaluate(async () => (await import('/js/sail-scene.js')).sceneNow().drawnOn), true, 'drawn on the chart\'s panel');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the run laid out is the wharf step: a strip along the foot appears as chains are ticked and leads to it, and a chain unticked there redraws it in place', async () => {
	const { page, context, errors } = await open('#barter');
	// One island's offer pins today's layout; the run sails from Iliya.
	// The view is the profile's, seeded once the tab has drawn and its
	// first write of the view -- a moment after -- is out.
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58948, give: '[Level 6] Top-Quality Coconut Syrup', recv: "[Level 7] Artisan's Seashell Necklace" }, { npcId: 58901, give: 'Vinegar', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.chain', { timeout: 15000 });
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); store.setProfile('barterCount', 20000); });
	// The runs worth sailing are searched in a module worker, which
	// stays up between searches; the cards it answered with are on the
	// page and no longer marked as being worked out. Waited for rather
	// than slept on: how long the search takes depends on the board and
	// on what else the machine is doing, so a fixed pause is a test that
	// fails under a full parallel run and nowhere else.
	await page.waitForFunction(() => document.querySelector('.proposal') && !document.querySelector('.proposals.working'), { timeout: 20000 });
	assert.ok(page.workers().some(w => w.url().endsWith('/js/barter-worker.js')), `the search worker is running: ${page.workers().map(w => w.url()).join(', ') || 'no workers'}`);
	assert.equal(await count(page, '.proposals.working'), 0, 'the worker has answered');
	assert.ok(await count(page, '.proposal') >= 1, 'with runs worth sailing');
	// The four steps of a run across the head, the plan the one on screen.
	assert.equal(await count(page, '.steps .step'), 4);
	assert.ok(await page.$('.barter-screen.step-plan'));
	// The plan's four parts -- the Parley, the ladder, the sailing, the
	// chains -- each with a numbered head that says what is set inside it.
	assert.equal(await count(page, '.plan-sec'), 4);
	assert.match(await text(page, '.plan-sec[data-sec="parley"] .plan-sec-head'), /Before you sail.*Parley [\d,]+/i);
	assert.match(await text(page, '.plan-sec[data-sec="ladder"] .plan-sec-head'), /Where today ends.*Climb to Level \d/i);
	// The trip is logged from the masthead alone.
	assert.equal(await count(page, '.barter-screen [data-act="trip-log"]'), 0);
	// The ladder is the goal, the ceiling, the sell rule and the floors
	// as one picture: the shore and seven rungs, the day's top lit.
	assert.equal(await count(page, '.ladder .rung'), 8);
	assert.equal(await count(page, '.ladder .rung.top'), 1);
	// What stands under a head stands in a padded body, not against the edge.
	const inset = await page.evaluate(() => { const p = document.querySelector('.plan-sec[data-sec="chains"]'); const o = p.querySelector('.chain-list'); return o.getBoundingClientRect().left - p.getBoundingClientRect().left; });
	assert.ok(inset >= 12, `the chains stand ${inset}px in from the panel's edge`);
	// A fresh board comes with the best run ticked; cleared, there is no
	// strip, and the run is not laid out on the page.
	await page.evaluate(() => document.querySelector('[data-act="barter-chains-clear"]').click()); await wait(500);
	assert.equal(await count(page, '.run-dock'), 0);
	assert.equal(await count(page, '.run-seg'), 0);
	await page.evaluate(() => document.querySelector('.chain').click()); await wait(1500);
	const dock = await text(page, '.run-dock');
	assert.match(dock, /1 chain.*stop/i, dock);
	assert.equal(await count(page, '.barter-screen .run-seg'), 0, 'the stops are not on the plan');
	// The strip stays at the foot of the window as the page scrolls.
	await page.evaluate(() => window.scrollTo(0, 700)); await wait(200);
	const rect = await page.evaluate(() => { const r = document.querySelector('.run-dock').getBoundingClientRect(); return { bottom: r.bottom, h: window.innerHeight }; });
	assert.ok(rect.bottom <= rect.h && rect.bottom > rect.h - 80, `the strip sits at the foot: ${rect.bottom} of ${rect.h}`);
	await page.evaluate(() => document.querySelector('.chain:not(.on)').click()); await wait(1500);
	assert.match(await text(page, '.run-dock'), /2 chains/);
	// The wharf step: what to have aboard, and the route stop by stop.
	await laidOut(page);
	assert.ok(await page.$('.hold-bar'), 'the hold as it stands');
	assert.equal(await count(page, '.pack-group'), 3, 'what to buy, what to fetch, what is already aboard');
	assert.match(await text(page, '.route-fold'), /The route, stop by stop/i);
	// Two chains under the default way round: one route, every stop tagged with its chain.
	await toPlan(page);
	assert.equal(await page.$eval('[data-act="barter-order"][data-k="barter-way"].active', el => el.dataset.v), 'sea');
	await laidOut(page);
	assert.equal(await count(page, '.run-seg-all'), 1, 'one timeline for both chains');
	assert.equal(await count(page, '.run-seg-chains .run-chain-tag'), 2);
	assert.equal(await count(page, '.run-stop:not(.wharf):not(.quest):not(.start)'), await count(page, '.run-stop .run-chain-tag.sm'), 'every island stop names its chain');
	// Chain after chain: a segment a chain.
	await toPlan(page);
	await page.evaluate(() => document.querySelector('[data-act="barter-order"][data-k="barter-way"][data-v="chain"]').click()); await wait(1500);
	await laidOut(page);
	assert.equal(await count(page, '.run-seg-all'), 0);
	assert.equal(await count(page, '.run-seg'), 2);
	assert.ok(await page.$('.load-dock [data-act="barter-cast-off"]'), 'the way out to sea is on the strip');
	assert.equal(await page.$eval('.load-dock', el => getComputedStyle(el).position), 'sticky', 'and stays in view as the step scrolls');
	assert.ok(await page.$('.route-fold [data-act="barter-chart"]'), 'with the chart beside the route');
	// The quests along the run, on the wharf step: the supplies for Dario
	// handed in at Iliya before casting off, a count on the strip and in
	// the route's head, the quests the run cannot take in listed; none
	// of it when the orders say none.
	await toPlan(page);
	assert.equal(await page.$eval('[data-act="barter-order"][data-k="barter-quests"].active', el => el.dataset.v), 'near', 'on the way only, by default');
	await laidOut(page);
	assert.equal(await count(page, '.run-stop.quest'), 0, 'no stop put in on the way only');
	assert.match(await text(page, '.run-quests-home'), /Quests at Iliya Island.*Supplies Delivery \(Iliya Island\)/i);
	assert.match(await text(page, '.route-fold summary'), /\d+ handed in on the way/);
	assert.ok(await page.$('.run-quests-off'), 'what the run cannot take in is listed');
	await toPlan(page);
	assert.match(await text(page, '.run-dock'), /\d+ quests/, 'and a count on the plan\'s own strip');
	await page.evaluate(() => document.querySelector('[data-act="barter-order"][data-k="barter-quests"][data-v="no"]').click()); await wait(1500);
	await laidOut(page);
	assert.equal(await count(page, '.run-quests-home'), 0, 'none under those orders');
	assert.equal(await count(page, '.run-stop.quest'), 0);
	await toPlan(page);
	assert.doesNotMatch(await text(page, '.run-dock'), /quests/);
	await page.evaluate(() => document.querySelector('[data-act="barter-order"][data-k="barter-quests"][data-v="near"]').click()); await wait(1500);
	await laidOut(page);
	assert.equal(await count(page, '.run-quests-home'), 1);
	// A taker off the way, asked for by name: a stop put in for it whatever the way round; the cross takes it out again.
	const far = await page.$eval('.run-quests-off [data-act="barter-quest-pull"]', el => el.dataset.quest);
	await page.evaluate(() => document.querySelector('.run-quests-off [data-act="barter-quest-pull"]').click()); await wait(1500);
	assert.ok(await page.$(`.run-stop.quest [data-act="barter-quest-skip"][data-quest="${far}"]`), 'a stop put in for it');
	await page.evaluate(id => document.querySelector(`.run-stop.quest [data-act="barter-quest-skip"][data-quest="${id}"]`).click(), far); await wait(1500);
	assert.equal(await count(page, `.run-stop.quest [data-quest="${far}"]`), 0, 'and taken out again');
	await page.evaluate(id => document.querySelector(`[data-act="barter-quest-unskip"][data-quest="${id}"]`).click(), far); await wait(1200);
	// With a short way round: stops put in for takers close by.
	await toPlan(page);
	await page.evaluate(() => document.querySelector('[data-act="barter-order"][data-k="barter-quests"][data-v="yes"]').click()); await wait(1500);
	await laidOut(page);
	assert.ok(await count(page, '.run-stop.quest') > 0, 'stops put in');
	// A quest left out by hand goes to the off-the-way list, and comes back from there.
	const first = await page.$eval('.run-quests-home .run-quest [data-act="barter-quest-skip"]', el => el.dataset.quest);
	await page.evaluate(() => document.querySelector('.run-quests-home .run-quest [data-act="barter-quest-skip"]').click()); await wait(1200);
	assert.equal(await page.evaluate(id => [...document.querySelectorAll('.run-quests-home [data-act="barter-quest-skip"]')].some(el => el.dataset.quest === id), first), false, 'left out');
	assert.ok(await page.$(`[data-act="barter-quest-unskip"][data-quest="${first}"]`), 'listed off the way, with the way back');
	await page.evaluate(id => document.querySelector(`[data-act="barter-quest-unskip"][data-quest="${id}"]`).click(), first); await wait(1200);
	assert.ok(await page.$(`[data-act="barter-quest-skip"][data-quest="${first}"]`), 'taken back in');
	// The quest's name leads to its row on the Quests tab.
	assert.ok(await page.$(`.run-quest [data-act="view"][data-id="quests"][data-quest="${first}"]`));
	// Casting off opens the cockpit: one stop at a time, the rest of the
	// run beside it, and the press that ticks this one off.
	await page.evaluate(() => document.querySelector('[data-act="barter-cast-off"]').click()); await wait(2500);
	assert.ok(await page.$('.barter-screen.step-sail'), 'the run is under way, on its own step');
	assert.ok(await page.$('.cockpit .cockpit-go'), 'with one thing to press');
	// It opens drawn large -- the game has the screen, the page is beside
	// it -- and the full view, with the rest of the run, is a press away.
	assert.ok(await page.$('.cockpit.glance'), 'the cockpit starts in the glance view');
	await page.evaluate(() => document.querySelector('[data-act="barter-glance"]').click()); await wait(800);
	assert.equal(await count(page, '.cockpit.glance'), 0);
	assert.ok(await count(page, '.rest-row') > 0, 'and the rest of the run beside it');
	const wasAt = await text(page, '.cockpit-place');
	// The burst of light is gone in a second, so it is looked for first.
	await page.evaluate(() => document.querySelector('.cockpit-go').click()); await wait(300);
	assert.ok(await page.$('.cheer'), 'a burst of light for the stop done');
	await wait(1000);
	assert.notEqual(await text(page, '.cockpit-place'), wasAt, 'and the cockpit moves on to the next stop');
	assert.match(await text(page, '.cockpit-foot .sail-n'), /1 of \d+ stops done/);
	// The rest at once: asked in place which of it, then every stop ticked and every quest handed in.
	await page.evaluate(() => document.querySelector('.cockpit-foot [data-act="barter-sail-all"]').click()); await wait(800);
	assert.match(await text(page, '.sail-all'), /Tick off, all at once.*every stop.*the quests handed in/i);
	await page.evaluate(() => document.querySelector('.cockpit-foot [data-act="barter-sail-all-go"]').click()); await wait(1500);
	// The islands that pay a range are not ticked by that: each waits to
	// be told what it paid, and the cockpit stands at the first of them.
	// Saying it -- a chip a count -- ticks the stop with it.
	// Saying the counts lays the run again, and more trades can bring a
	// barter quest within reach -- a quest stop the run now makes, and on
	// some days a wharf call and another island that pays a range with it
	// (which quests are open turns over at the daily reset). Each round
	// says what is asked and ticks the rest at once, until none is left.
	for (let round = 0; round < 4 && !/(\d+) of \1 stops done/.test(await text(page, '.sail-n')); round++) {
		if (round) {
			await page.evaluate(() => document.querySelector('.cockpit-foot [data-act="barter-sail-all"]').click()); await wait(800);
			await page.evaluate(() => document.querySelector('.cockpit-foot [data-act="barter-sail-all-go"]').click()); await wait(1500);
		}
		for (let i = 0; i < 20; i++) {
			const chips = await page.$$('.cockpit-press [data-act="barter-paid"]');
			// Pressed as an element: the set-sail card may still be over the page.
			if (chips.length) { await chips[chips.length - 1].evaluate(b => b.click()); await wait(900); continue; }
			const typed = await page.$('.cockpit [data-act="barter-paid-n"]');
			if (!typed) break;
			// A range: the value is typed -- or, the first time, taken off the
			// chips under the box -- and the stop waits for Traded to be
			// pressed, rather than moving on the moment a number is in.
			const place = await text(page, '.cockpit-place');
			// Saying the count redraws the press and the chips, not the stop:
			// the pictures on it are the same elements after as before.
			await page.evaluate(() => { const im = document.querySelector('.cockpit .cockpit-trade img'); if (im) im.__kept = true; });
			if (!i) {
				assert.ok(await count(page, '.cockpit .paid-pick') >= 3, 'the least, the middle, the most');
				await page.evaluate(() => [...document.querySelectorAll('.cockpit .paid-pick')][1].click());
			} else await page.evaluate(() => { const el = document.querySelector('.cockpit [data-act="barter-paid-n"]'); el.value = String(Math.round((Number(el.min) || 0) || 400)); el.dispatchEvent(new Event('change', { bubbles: true })); });
			await wait(700);
			assert.equal(await text(page, '.cockpit-place'), place, 'still at the same stop');
			assert.ok(await page.evaluate(() => { const im = document.querySelector('.cockpit .cockpit-trade img'); return !im || im.__kept === true; }), 'the stop was not drawn again');
			assert.match(await text(page, '.cockpit-press'), /Traded ×\d+ · paid [\d,]+/, 'the press says what was paid');
			await page.evaluate(() => document.querySelector('.cockpit-press [data-act="barter-stop-done"]').click());
			await wait(900);
		}
	}
	const allText = await text(page, '.sail-n');
	assert.match(allText, /(\d+) of \1 stops done/, `${allText} — at: ${await text(page, '.cockpit .panel-body')}`);
	// Every stop ticked, the step says so and points at the results.
	assert.match(await text(page, '.all-ticked'), /Every stop is ticked/i);
	// The results: the figures, the stops one under another, and the
	// receipt of what recording will change.
	await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-step"][data-id="results"]')].find(e => e.getBoundingClientRect().width > 0).click()); await wait(1500);
	assert.match(await text(page, '.run-tiles'), /Stops[\s\S]*Trades made[\s\S]*Parley spent/i);
	assert.ok(await count(page, '.log-row') > 0, 'the stops one under another');
	assert.match(await text(page, '.exchange'), /You handed over[\s\S]*You received/i);
	assert.ok(await count(page, '.exchange .shelf-tile img') > 0, 'the exchange as tiles, each good with its icon');
	assert.ok(await page.$('[data-act="barter-record"]'), 'and the press that writes it down');
	// The checklist dropped, what was traded kept: back to the plan, and the run is a plan again.
	await page.evaluate(() => document.querySelector('[data-act="barter-sail-drop"]').click()); await wait(600);
	await page.evaluate(() => document.querySelector('[data-abandon="keep"]').click()); await wait(1200);
	// Kept, the stops ticked are recorded as Record would: the results.
	assert.ok(await page.$('.barter-screen.step-results'));
	assert.equal(await count(page, '.cockpit'), 0);
	await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-step"][data-id="plan"]')].find(e => e.getBoundingClientRect().width > 0).click()); await wait(1200);
	// A chain unticked from the plan: one chain fewer on the strip.
	await page.evaluate(() => document.querySelector('.chain.on').click()); await wait(1500);
	assert.match(await text(page, '.run-dock'), /1 chain\b/);
	assert.deepEqual(errors, []);
	await context.close();
});

test('the cockpit weighs the hold from the Inventory, shows each stop before and after, and a stop traded another number of times is put right', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58948, give: '[Level 6] Top-Quality Coconut Syrup', recv: "[Level 7] Artisan's Seashell Necklace" }, { npcId: 58901, give: 'Vinegar', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.chain', { timeout: 15000 });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); store.setProfile('barterCount', 4006);
		store.setStockAt('[Level 2] Conch Shell Ornament', 'Iliya Island', 20, 'ashore');
		store.setStock('Silver', 900000000);
	});
	await page.waitForFunction(() => document.querySelector('.proposal') && !document.querySelector('.proposals.working'), { timeout: 20000 });
	await wait(1500);
	await laidOut(page);
	await tap(page, '[data-act="barter-cast-off"]'); await wait(2500);
	// Something the run does not trade, aboard: the plan never weighed it,
	// the ship's window does.
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.setStockAt('[Level 1] Unidentified Ancient Mural', '', 10); }); await wait(600);
	// On to the first island that deals a fixed count.
	for (let i = 0; i < 8 && !(await page.$('[data-act="barter-did-open"]')); i++) {
		await page.evaluate(() => { const b = document.querySelector('.cockpit-go[data-act="barter-stop-done"]:not(.done)'); if (b) b.click(); }); await wait(900);
	}
	assert.ok(await page.$('[data-act="barter-did-open"]'), 'an island stop, with the way to put its count right');
	const weighed = await page.evaluate(async () => {
		const plan = await import('/js/barter-plan.js'); const sail = await import('/js/barter/sail.js');
		return Math.round([...sail.aboardNow()].reduce((a, [n, q]) => a + q * plan.weightOf(n), 0));
	});
	const figure = await text(page, '.cockpit-fig-v');
	const crew = await page.evaluate(async () => { const ship = await import('/js/ship.js'); return ship.shownHold(ship.currentShip().hold, 0).total; });
	assert.ok(figure.replace(/[^\d→]/g, '').startsWith(String(weighed + crew)), `the hold before the stop is the Inventory's, mural and all: ${figure} vs ${weighed + crew}`);
	// The hold across the stop, good by good.
	assert.match(await text(page, '.hold-slots-legend'), /after this stop/i);
	assert.ok(await count(page, '.hold-tiles .shelf-tile.moved, .hold-tiles .shelf-tile.new, .hold-tiles .shelf-tile.gone') >= 1, 'the goods the stop changes are marked');
	// Traded more times than the run said.
	const s = await page.evaluate(async () => {
		const sail = await import('/js/barter/sail.js'); const store = await import('/js/state.js');
		const npc = Number(document.querySelector('[data-act="barter-did-open"]').dataset.npc);
		const st = sail.sailedPlan().stops.find(x => x.npcId === npc);
		return { npc, times: st.times, giveN: st.giveN, give: st.give, had: store.getStock(st.give) };
	});
	await tap(page, '[data-act="barter-did-open"]'); await wait(400);
	const n = s.times + 1;
	await page.evaluate(v => { const el = document.querySelector('[data-act="barter-did-n"]'); el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); }, n); await wait(1200);
	// An island that pays a range still asks what it paid, and the tick comes with that.
	const pressed = await page.evaluate(npc => { const b = document.querySelector(`.cockpit-press [data-act="barter-paid"][data-npc="${npc}"]`); if (b) b.click(); return { b: !!b, press: (document.querySelector('.cockpit-press') || {}).textContent, did: (document.querySelector('.cockpit') || {}).textContent.slice(0, 300) }; }, s.npc); await wait(1200);
	const left = await page.evaluate(async give => (await import('/js/state.js')).getStock(give), s.give);
	assert.equal(s.had - left, Math.round(n * s.giveN), `the hold gave what was really handed over, and the stop is ticked: ${JSON.stringify({ s, n, pressed })}`);
	// Back at that stop, the count said and the run's own beside it; the run's again takes the correction back.
	await page.evaluate(k => { const el = [...document.querySelectorAll('[data-act="barter-sail-jump"]')].find(e => e.dataset.k === k); if (el) el.click(); else { const g = document.querySelector('[data-act="barter-glance"]'); if (g) g.click(); } }, `n${s.npc}`); await wait(600);
	await page.evaluate(k => { const el = [...document.querySelectorAll('[data-act="barter-sail-jump"]')].find(e => e.dataset.k === k); if (el) el.click(); }, `n${s.npc}`); await wait(600);
	if (s.times !== n) assert.match(await text(page, '.did-ask'), new RegExp(`×${s.times}`));
	await page.evaluate(v => { const el = document.querySelector('[data-act="barter-did-n"]'); el.value = String(v); el.dispatchEvent(new Event('change', { bubbles: true })); }, s.times); await wait(1200);
	assert.equal(s.had - await page.evaluate(async give => (await import('/js/state.js')).getStock(give), s.give), Math.round(s.times * s.giveN));
	assert.deepEqual(errors, []);
	await context.close();
});

test('Abandon asks: put everything back undoes the packing and refunds it, keep leaves the hold as traded; the wharf step stays readable', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58948, give: '[Level 6] Top-Quality Coconut Syrup', recv: "[Level 7] Artisan's Seashell Necklace" }, { npcId: 58901, give: 'Vinegar', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.chain', { timeout: 15000 });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); store.setProfile('barterCount', 4006);
		store.setStockAt('[Level 2] Conch Shell Ornament', 'Iliya Island', 20, 'ashore');
		store.setStock('Silver', 900000000);
	});
	await page.waitForFunction(() => document.querySelector('.proposal') && !document.querySelector('.proposals.working'), { timeout: 20000 });
	await wait(1500);
	const snap = () => page.evaluate(async () => { const s = await import('/js/state.js'); const places = Object.fromEntries(Object.entries(s.getProfile('stash', {})).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0))]).filter(([, v]) => Object.keys(v).length)); return JSON.stringify({ stock: s.getAllStock(), stash: places }); });
	const before = await snap();
	await laidOut(page);
	assert.notEqual(await snap(), before, 'packing moved goods and spent silver');
	await tap(page, '[data-act="barter-cast-off"]'); await wait(2500);
	await page.evaluate(() => { const b = document.querySelector('.cockpit-go[data-act="barter-stop-done"]'); if (b) b.click(); }); await wait(800);
	// What the wharf step said is there to read while sailing.
	await tap(page, '[data-act="barter-step"][data-id="load"]'); await wait(500);
	assert.ok(await page.$('.panel.told .told-row'), 'the wharf step as it was, to read');
	// Abandon asks.
	await tap(page, '[data-act="barter-step"][data-id="sail"]'); await wait(500);
	await page.evaluate(() => document.querySelector('[data-act="barter-sail-drop"]').click()); await wait(400);
	assert.match(await text(page, '#dialog h2'), /abandon this run/i);
	await tap(page, '[data-abandon="back"]'); await wait(800);
	assert.equal(await snap(), before, 'put back: the Inventory is as it was before the packing, silver refunded');
	assert.equal(await page.evaluate(async () => (await import('/js/barter/sail.js')).sailing()), null, 'and the run is gone');
	// One Undo brings the run back, as it stood.
	await page.evaluate(async () => (await import('/js/state.js')).undo()); await wait(800);
	assert.ok(await page.evaluate(async () => !!(await import('/js/barter/sail.js')).sailing()), 'Undo brings the run back');
	const traded = await snap();
	await tap(page, '[data-act="barter-step"][data-id="sail"]'); await wait(500);
	await page.evaluate(() => document.querySelector('[data-act="barter-sail-drop"]').click()); await wait(400);
	await tap(page, '[data-abandon="keep"]'); await wait(800);
	assert.equal(await snap(), traded, 'keep: the hold and storages stay as the trades left them');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the packing list ticks both ways, and what a row says is what its button moves', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const { barterKey } = await import('/js/clock.js');
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'silver', port: 1002, planSec: 'all', advOpen: true, board: { day: barterKey(), answers: [{ npcId: 58948, give: '[Level 6] Top-Quality Coconut Syrup', recv: "[Level 7] Artisan's Seashell Necklace" }, { npcId: 58901, give: 'Vinegar', recv: '[Level 1] Cherry Tree Seed Pouch' }] } });
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.chain', { timeout: 15000 });
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); store.setProfile('barterCount', 4006);
		// Goods waiting at the harbour the run sails from, so a chain
		// starts there and the middle pile has something in it.
		store.setStockAt('[Level 2] Conch Shell Ornament', 'Iliya Island', 20, 'ashore');
	});
	await page.waitForFunction(() => document.querySelector('.proposal') && !document.querySelector('.proposals.working'), { timeout: 20000 });
	// The chain that starts from what is waiting at the wharf, on its
	// own: beside the search's picks it would be a later lot, and a later
	// lot's goods wait in the storage for the call before it.
	await page.evaluate(() => document.querySelectorAll('.chain.on').forEach(c => c.click())); await wait(1500);
	const ticked = await page.evaluate(() => {
		for (const c of document.querySelectorAll('.chain:not(.on):not([disabled])')) {
			if (/loaded before casting off/i.test(c.innerText)) { c.click(); return true; }
		}
		return false;
	});
	assert.ok(ticked, 'a chain that loads from the harbour is on the board');
	await wait(2500);
	await laidOut(page);
	assert.equal(await count(page, '.pack-group'), 3, 'what to buy, what to fetch, what is already aboard');
	// Every box is a button, and every one of them turns both ways: a
	// tick that could not be taken off was the list telling the sailor
	// what they had rather than asking.
	const keys = await page.$$eval('.pack-box', es => es.map(e => ({ tag: e.tagName, k: e.dataset.k })));
	assert.ok(keys.length > 0, 'the list has rows');
	assert.ok(keys.every(x => x.tag === 'BUTTON' && x.k), 'every box is a button with a row of its own');
	assert.equal(new Set(keys.map(x => x.k)).size, keys.length, 'one row a good, so one box a good');
	// Ticking loads for real. The goods waiting at Iliya went into the
	// hold when their row was ticked, and the row moved to Already aboard.
	const conch = '[Level 2] Conch Shell Ornament';
	const where = () => page.evaluate(async i => { const st = await import('/js/state.js'); return { iliya: st.stockAt(i, 'Iliya Island'), aboard: st.stockAt(i, '') + st.stockAt(i, st.ABOARD) }; }, conch);
	const loaded = await where();
	assert.ok(loaded.iliya < 20 && loaded.aboard > 0, `the ticked storage row moved its goods aboard: ${JSON.stringify(loaded)}`);
	assert.match(await text(page, '.pack-group:last-child'), new RegExp(gameNameOf(conch), 'i'));
	// A market row: its tick is goods in the hold, both ways.
	const mk = await page.$eval('.pack-group:first-child .pack-box', e => ({ item: e.dataset.item, n: Number(e.dataset.n), on: e.classList.contains('on') }));
	const inHold = () => page.evaluate(async i => { const st = await import('/js/state.js'); return st.stockAt(i, st.ABOARD); }, mk.item);
	assert.ok(mk.on, 'ticked on the way in');
	assert.equal(await inHold(), mk.n, `${mk.n} ${mk.item} in the hold`);
	await page.evaluate(() => document.querySelector('.pack-group:first-child .pack-box').click()); await wait(1500);
	assert.equal(await inHold(), 0, 'unticked: off the ship again');
	await page.evaluate(() => document.querySelector('.pack-group:first-child .pack-box').click()); await wait(1500);
	assert.equal(await inHold(), mk.n, 'ticked again: back aboard');
	// Aboard, and ticked by being aboard: the tick that loaded it is the
	// only one it needs. Unticked, it goes back into the storage.
	const aboardBox = () => page.$eval('.pack-group:last-child .pack-box', e => ({ k: e.dataset.k, on: e.classList.contains('on') }));
	const ab = await aboardBox();
	assert.ok(ab.k.startsWith('a|') && ab.on, `already aboard, already ticked: ${JSON.stringify(ab)}`);
	await page.evaluate(() => document.querySelector('.pack-group:last-child .pack-box').click()); await wait(2000);
	assert.equal((await where()).iliya, 20, 'unticked: put back, every one of them');
	// Loaded once more, then the whole hold ashore in one press.
	await page.evaluate(() => { const b = [...document.querySelectorAll('.pack-box')].find(e => e.dataset.k === 'l|[Level 2] Conch Shell Ornament'); if (b) b.click(); }); await wait(2000);
	assert.ok((await where()).aboard > 0, 'loaded again from its row');
	await page.evaluate(() => document.querySelector('[data-act="barter-hold-open"]').click()); await wait(800);
	await page.evaluate(() => document.querySelector('[data-act="barter-unload-all"]').click()); await wait(2000);
	assert.equal((await where()).iliya, 20, 'Unload all: back at Iliya');
	assert.equal(await inHold(), 0, 'and the market goods with it');
	assert.deepEqual(errors, []);
	await context.close();
});

/** A game name as the page prints it, for a regexp. */
const gameNameOf = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the material run: each island at its own Parley and within the bar, each departure loaded to the limit, and back to the harbour for the gives that did not fit', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'material', port: 1, planSec: 'all', advOpen: true, matOrders: { reach: 'all', calls: true, pace: 'full', quests: 'no' } });
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.mat-list.hero', { timeout: 15000 });
	// A Caravel, which holds ten thousand and barters to seventeen,
	// against every island of M1 whose give is a trade good, each give
	// held at Velia: far more than one departure carries.
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Epheria Caravel', 1); store.setProfile('crewShip', 'Epheria Caravel'); store.setProfile('barterCount', 20000);
		// Vouchers enough that the hold, not the Parley, is what sends it back.
		store.setProfile('vouchers', 40);
		const L = await import('/js/barter-layouts.js'); const { levelOf } = await import('/js/barter.js');
		const page = L.materialPages().find(p => p.id === 'M1');
		const offers = [...page.offers].filter(([, o]) => !o.options && levelOf(o.give) !== null);
		for (const g of new Set(offers.map(([, o]) => o.give))) store.setStockAt(g, 'Velia', 10, 'ashore');
		const { takeRead } = await import('/js/barter/board.js'); const { matOn } = await import('/js/barter/material.js');
		takeRead([...page.offers].filter(([, o]) => !o.options).map(([npcId, o]) => ({ npcId, give: o.give, recv: o.recv })));
		for (const m of new Set(offers.map(([, o]) => o.recv))) matOn(m, true);
	});
	await wait(800);
	// The route as planned, before anything is packed: the load step read
	// without ticking its list, which would load the hold for real.
	const toLoad = async () => {
		await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-step"][data-id="load"]')].find(el => el.getBoundingClientRect().width > 0).click());
		await page.waitForSelector('.barter-screen.step-load', { timeout: 10000 }); await wait(300);
		await page.evaluate(() => { const d = document.querySelector('details.route-fold'); if (d) d.open = true; }); await wait(200);
	};
	const planned = () => page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent));
	const holdsNow = () => page.$$eval('.run-stop .run-hold > div:first-child b', els => els.map(el => Number(el.textContent.split('/')[0].replace(/[^\d]/g, ''))));
	await toLoad();
	let stops = await planned();
	assert.equal(stops[0], 'Velia wharf', 'the first stop loads at the harbour');
	assert.ok(stops.filter(x => x === 'Velia wharf').length >= 2, `back to Velia for the rest: ${stops.join(', ')}`);
	assert.doesNotMatch(await text(page, '.barter-screen') || '', /Stays ashore/i, 'nothing stays ashore on a loaded run');
	// Every departure loaded to the limit and no further: a wharf puts no
	// more aboard, whatever the ceiling the exchanges may reach.
	const FREE = shipStats['Epheria Caravel'].weight;
	let holds = await holdsNow();
	assert.ok(holds.every(w => w <= FREE), `${holds.join(', ')} against ${FREE}`);
	assert.equal(await count(page, '[data-act="barter-mat-pace-set"]'), 0, 'no pace to choose');
	await toPlan(page);
	assert.match(await text(page, '.barter-screen'), /Each departure is loaded up to the hold’s limit/);
	// Packed and laid again from the hold: each island at the game's own
	// price for it, less the sailor's discounts, the run's Parley their
	// sum, and never more than the bar and the vouchers pay for.
	await laidOut(page);
	const priced = await page.evaluate(async () => {
		const { V } = await import('/js/barter/state.js');
		const { parleyOf } = await import('/js/barter/plan.js');
		const { barterProfile } = await import('/js/ui-state.js');
		const L = await import('/js/barter-layouts.js');
		return { rate: parleyOf(barterProfile()).rate, bar: parleyOf(barterProfile()).bar, isles: V.shownPlan.stops.filter(x => x.npcId && x.times > 0).map(x => ({ times: x.times, parley: x.parley, base: x.parleyBase, game: L.materialDeal(x.npcId, x.give, x.item).parley })), used: V.shownPlan.parleyUsed };
	});
	assert.ok(priced.isles.length > 0);
	for (const x of priced.isles) {
		assert.equal(x.base, x.game, 'the game’s own base');
		assert.equal(x.parley, x.times * Math.floor(x.base * priced.rate));
	}
	assert.equal(priced.used, priced.isles.reduce((a, x) => a + x.parley, 0));
	assert.ok(priced.used <= priced.bar, `${priced.used} of ${priced.bar}`);
	// The first trip is aboard now; the rest still comes from Velia.
	stops = await planned();
	assert.ok(stops.includes('Velia wharf'), `the next trips call at Velia: ${stops.join(', ')}`);
	holds = await holdsNow();
	assert.ok(holds.every(w => w <= FREE), `packed, still under the limit: ${holds.join(', ')}`);
	assert.deepEqual(errors, []);
	await context.close();
});

test('before casting off: a gold bar an island takes is bought ashore and priced, and a give kept where the run cannot load it is to be brought to the harbour first', async () => {
	const { page, context, errors } = await open('#barter');
	await page.waitForSelector('.barter-screen', { timeout: 15000 }); await wait(600);
	await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.setView('barter', { goal: 'material', port: 1, planSec: 'all', advOpen: true, matOrders: { reach: 'want', calls: true, pace: 'full', quests: 'no' } });
		store.flush();
	});
	await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.mat-list.hero', { timeout: 15000 });
	// Two islands of the game's layouts: one taking a Gold Bar, one taking
	// an Amethyst Fragment -- the Amethyst kept at Heidel, which has no
	// wharf: out of the run's reach.
	const two = await page.evaluate(async () => {
		const store = await import('/js/state.js');
		store.addTarget('Carrack (Advance)', 1); store.setProfile('crewShip', 'Carrack (Advance)'); store.setProfile('barterCount', 20000);
		store.setStockAt('[Level 4] Amethyst Fragment', 'Heidel', 2, 'ashore');
		const L = await import('/js/barter-layouts.js');
		const find = give => { for (const p of L.materialPages()) for (const [npcId, o] of p.offers) if (!o.options && o.give === give) return { npcId, give, recv: o.recv }; return null; };
		const gold = find('Gold Bar 100G'), ame = find('[Level 4] Amethyst Fragment');
		const { takeRead } = await import('/js/barter/board.js'); const { matOn } = await import('/js/barter/material.js');
		takeRead([gold]);
		matOn(gold.recv, true);
		return { gold, ame };
	});
	await wait(600);
	assert.match(await text(page, '.mat-figs'), /to buy ashore first/i);
	await laidOut(page);
	let stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent));
	assert.equal(stops.length, 1, `one island, no harbour call: ${stops.join(', ')}`);
	// The Gold Bar was on the packing list to buy, and its tick bought it:
	// it is aboard now, and the run starts from it.
	assert.ok(await page.evaluate(async () => { const store = await import('/js/state.js'); return store.stockAt('Gold Bar 100G', store.ABOARD) > 0; }), 'bought and aboard');
	assert.equal(await count(page, '.run-list.orange'), 0, 'nothing to climb for');
	// A second island, whose give sits at Heidel.
	await page.evaluate(async a => { const { takeRead } = await import('/js/barter/board.js'); const { matOn } = await import('/js/barter/material.js'); const ui = await import('/js/ui.js'); takeRead([a]); matOn(a.recv, true); ui.render(); }, two.ame); await wait(600);
	await laidOut(page);
	const bring = await text(page, '.run-list.amber');
	assert.match(bring, /Bring to the harbour first.*Amethyst Fragment.*at Heidel \(2\).*bring it to Velia/i);
	stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent + (s.classList.contains('wharf') ? '|wharf' : '')));
	assert.equal(stops.length, 1, `the run is laid with what it can reach, the island waiting for its give: ${stops.join(', ')}`);
	// Moved to Velia, the give is loaded at the first stop.
	await page.evaluate(async () => { const store = await import('/js/state.js'); store.setStockAt('[Level 4] Amethyst Fragment', 'Heidel', 0, 'moved'); store.setStockAt('[Level 4] Amethyst Fragment', 'Velia', 2, 'moved'); });
	await wait(500);
	await laidOut(page);
	// Taken from Velia's storage by its tick on the packing list: aboard,
	// and its island on the route.
	stops = await page.$$eval('.run-stop', els => els.map(s => s.querySelector('.run-stop-head b').textContent + (s.classList.contains('wharf') ? '|wharf' : '')));
	assert.equal(stops.length, 2, `both islands: ${stops.join(', ')}`);
	assert.ok(await page.evaluate(async () => { const store = await import('/js/state.js'); return store.stockAt('[Level 4] Amethyst Fragment', store.ABOARD) + store.stockAt('[Level 4] Amethyst Fragment', '') >= 2; }), 'loaded from Velia');
	assert.equal(await count(page, '.run-list.amber'), 0, 'nothing left to bring');
	assert.deepEqual(errors, []);
	await context.close();
});

test('the shell answers the keyboard: digits and 0 switch tabs from the page, not from a chip; a failed save shows a badge; the theme turns', async () => {
	const { page, context, errors } = await open('#plan');
	await seed(page); await wait(300);
	await page.keyboard.press('0'); await wait(300);
	assert.equal(await page.evaluate(() => location.hash), '#barter', '0 is the tenth tab');
	await page.keyboard.press('1'); await wait(300);
	assert.equal(await page.evaluate(() => location.hash), '#plan');
	await page.focus('.chip'); await page.keyboard.press('3'); await wait(300);
	assert.equal(await page.evaluate(() => location.hash), '#plan', 'a digit on a chip is the chip\'s');
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('tracker-save-failed', { detail: { reason: 'quota' } })));
	assert.match(await text(page, '#save-badge'), /Not saving — storage full/);
	await page.evaluate(() => window.dispatchEvent(new CustomEvent('tracker-save-ok', { detail: {} })));
	assert.equal(await count(page, '#save-badge'), 0, 'a save that goes through clears it');
	await page.click('[data-act="more"]'); await wait(100);
	await page.click('[data-act="theme"]'); await wait(200);
	assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
	assert.equal(await page.evaluate(() => document.querySelector('meta[name="theme-color"]').content), '#eef3f8');
	assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()), '#eef3f8', 'the light tokens are on');
	await page.click('[data-act="more"]'); await wait(100);
	await page.click('[data-act="export"]'); await wait(800);
	assert.match(await text(page, '[data-link-size]'), /characters long/);
	assert.equal(await page.evaluate(() => document.getElementById('dialog').getAttribute('aria-labelledby')), await page.evaluate(() => document.querySelector('#dialog h2').id), 'the dialog is named by its heading');
	assert.equal(await page.evaluate(() => document.getElementById('tabbar').inert), true, 'the thumb bar is behind the veil too');
	assert.deepEqual(errors, []);
	await context.close();
});

test('a phone on its side is a phone: the thumb bar and the menu, and the hover card opens from the keyboard', async () => {
	const context = await browser.createBrowserContext();
	const page = await context.newPage();
	await page.emulate({ viewport: { width: 844, height: 390, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 13) Mobile' });
	await page.evaluateOnNewDocument(release => { try { localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true'); localStorage.setItem('bdo-tracker/release', release); } catch { /* fine */ } }, RELEASE);
	await page.goto(base + '/#plan', { waitUntil: 'domcontentloaded' });
	await page.waitForSelector(POUCH_READY, { timeout: 15000 });
	const shown = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
	assert.equal(await shown('#tabbar'), true, 'the thumb bar is up');
	assert.equal(await shown('[data-act="more"]'), true, 'the menu button is there');
	assert.equal(await shown('.masthead-actions [data-act="jump"]'), false, 'Find has moved into the menu');
	assert.equal(await shown('#tabs'), false, 'the dock is not');
	assert.equal(await page.evaluate(async () => (await import('/js/viewport.js')).isPhone()), true);
	await context.close();

	const desk = await open('#inventory');
	await seed(desk.page); await wait(300);
	// A tile the card has something to say about: a stone with a price.
	await desk.page.focus('.tile[data-peek="Tidal Black Stone"]'); await wait(600);
	assert.equal(await desk.page.evaluate(() => document.getElementById('peek').hidden), false, 'focus shows the card');
	assert.equal(await desk.page.evaluate(() => document.activeElement.getAttribute('aria-describedby')), 'peek');
	await desk.page.keyboard.press('o'); await wait(400);
	assert.equal(await count(desk.page, '.detail.open'), 1, '"o" opens the item');
	assert.deepEqual(desk.errors, []);
	await desk.context.close();
});
