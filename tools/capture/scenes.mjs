// The README captures. Each scene records one thing a player actually
// does, at a pace you can follow, with the pointer visible.
//
//   node scenes.mjs <outdir> [sceneName ...]

import { open, seed, tab, click, clickIn, drag, moveTo, typeInto, choose, wait, waitFor } from './drive.mjs';
import { midBuild, readyToCraft, recordLevel, fittedShip, emptyStart, onePartToGo } from './states.mjs';
import { fakeCommunity, FLEET } from './fleet.mjs';
import path from 'node:path';
import { useGame } from '../../js/barter-layouts.js';
import * as GAME from '../../js/barter_game.js';

const OUT = process.argv[2];
const only = process.argv.slice(3);

/** The link the page last put on the clipboard, made into one that
 *  really reloads. Headless Chrome answers the read only once the
 *  origin has been allowed it; and a link that differs from the page
 *  only by its hash is a jump within the document, not a load, so the
 *  seed for the other end would never run -- a query string makes it
 *  a different address. */
async function copiedLink(browser, page, url, kind) {
	await browser.defaultBrowserContext().overridePermissions(url, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
	const link = await page.evaluate(() => navigator.clipboard.readText());
	if (!link.includes(`#${kind}/`)) throw new Error(`no ${kind} link on the clipboard: ${link.slice(0, 60)}`);
	const there = new URL(link);
	there.searchParams.set('theirs', '1');
	return there.href;
}

const rec = async (page, name, body) => {
	const r = await page.screencast({ path: `${OUT}/${name}.webm`, fps: 25 });
	await body();
	await wait(900);            // a beat on the result, so the loop reads
	await r.stop();
	console.log(`  → ${name}.webm`);
};

/**
 * Today's board, named. A layout is only known once an island or two
 * has been looked at, and nothing on the Barter tab exists before it
 * is -- so every scene that wants chains starts by answering it. Done
 * before the recording starts: it is setup, not a thing to watch.
 */
/** Put one panel at the top of the frame, so the clip is of the thing
 *  and not of the whole page with the thing somewhere in it. */
async function frame(page, sel, { top = 16 } = {}) {
	await page.evaluate((s, t) => {
		const el = document.querySelector(s);
		if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - t));
	}, sel, top);
	await wait(500);
}

async function nameTheBoard(page, upTo = 6) {
	for (let i = 0; i < upTo; i++) {
		const ask = await page.$('[data-act="barter-board-ask"]');
		if (!ask) return;
		await ask.click();
		await wait(700);
		const row = await page.$('.picker-row');
		if (!row) return;
		await row.click();
		await wait(1500);
	}
}

/**
 * The Barter tab with today's board named, on the goal asked for.
 *
 * The tab is four steps now -- Plan, Load, Sail, Results -- and the
 * plan answers "what is today for?" before it reads the board, so the
 * goal card is pressed first, the way a sailor meets them. Setup, so
 * the presses are plain clicks and not filmed.
 */
async function barterDay(page, url, state, { goal = 'silver' } = {}) {
	await seed(page, url, state);
	await tab(page, 'barter');
	await wait(1200);
	if (goal !== 'silver') {
		await page.evaluate(g => document.querySelector(`[data-act="barter-goal"][data-id="${g}"]`).click(), goal);
		await wait(1200);
	}
	await nameTheBoard(page);
	// The runs worth sailing come back from a worker; the best one is
	// ticked when it lands, and that is what puts the run along the foot.
	await waitFor(page, '.board-strip', { upTo: 20000, then: 600 });
}

/** Open one of the plan's four parts (Before you sail, Where today
 *  ends, How to sail it / Your short trip, Chains on offer) -- only one
 *  is open at a time, and pressing the open one shuts it. */
async function openPart(page, id) {
	await page.evaluate(i => {
		const sec = document.querySelector(`.plan-sec[data-sec="${i}"]`);
		if (sec && sec.classList.contains('open')) return;
		document.querySelector(`[data-act="barter-sec"][data-id="${i}"]`).click();
	}, id);
	await wait(1200);
}

/** A plain press, for setup: no pointer, nothing to watch. */
const press = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

/** The Load step, with every row of the packing list ticked aboard. */
async function packed(page) {
	await press(page, '[data-act="barter-step"][data-id="load"]');
	await waitFor(page, '[data-act="barter-cast-off"]', { then: 1200 });
	for (const b of await page.$$('[data-act="barter-pack-all"]:not(.active)')) {
		await b.click();
		await wait(700);
	}
	await wait(800);
}

/**
 * Casting off plays a close-up of the ship dropping into the water and
 * the camera pulling back into the clock. On a capture machine shooting
 * beside other work the canvas runs slow, so the clip lets it play for
 * a moment and then presses it away, as a sailor can.
 */
async function castOff(page, { watch = 2600 } = {}) {
	await tap(page, '[data-act="barter-cast-off"]', { after: watch });
	if (await page.$('.castoff-fx')) await tap(page, '.castoff-fx .setsail', { after: 1200 });
}

/** The chart, framed: the bar above it and the sea filling the rest of
 *  the window, so a clip never scrolls to reach a stop or a tool. */
async function frameMap(page, top = 200) {
	await frame(page, '#map', { top });
}

/** Hover something whose card is shown on a hover, and nudge the
 *  pointer once inside it: a redraw can take the card down under a
 *  still pointer, and a headless page has no focus to bring it back. */
async function hover(page, sel, { settle = 1600 } = {}) {
	const at = await moveTo(page, sel, { settle: 400 });
	await page.mouse.move(at.x + 6, at.y + 2, { steps: 3 });
	await wait(500);
	// Taken down by a redraw before it was seen: off the row and back.
	if (!(await page.evaluate(() => { const p = document.getElementById('peek'); return p && !p.hidden; }))) {
		await page.mouse.move(at.x + 6, at.y - 40, { steps: 2 });
		await wait(120);
		await page.mouse.move(at.x + 4, at.y, { steps: 3 });
	}
	await wait(settle);
}

/**
 * Press something that is already on the screen, where it is.
 *
 * `click` scrolls its target into the middle of the window when it sits
 * near an edge -- right for a row in a list, wrong for the bars pinned
 * along the foot of the Barter tab (the run, Cast off, the cockpit's
 * buttons): those never need scrolling to, and scrolling to them drags
 * the page under the clip.
 */
async function tap(page, sel, { after = 700 } = {}) {
	const at = await page.evaluate(s => {
		const el = [...document.querySelectorAll(s)].find(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight; });
		if (!el) return null;
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	}, sel);
	if (!at) return click(page, sel, { after });
	await page.evaluate(p => { document.getElementById('__cur').style.transform = `translate(${p.x}px, ${p.y}px)`; }, at);
	await page.mouse.move(at.x, at.y, { steps: 8 });
	await wait(620);
	await page.evaluate(() => document.getElementById('__cur').classList.add('down'));
	await wait(140);
	await page.mouse.click(at.x, at.y);
	await page.evaluate(() => document.getElementById('__cur').classList.remove('down'));
	await wait(after);
}

/** Take the fake pointer away before a still is shot. */
const noCursor = page => page.evaluate(() => { const c = document.getElementById('__cur'); if (c) c.remove(); });

/**
 * A server the 1.4 scenes need and a machine shooting a clip has not
 * got: a fleet that has read today's board, and a Central Market with
 * some shelves bare. Answered inside the page, like the community's in
 * fleet.mjs, and for the same reason said the same way -- these two
 * clips are staged, and the README says so where they appear. A scene
 * that uses it opens a browser of its own, so the fakery cannot leak
 * into the scene shot after it.
 */
async function fakeSea(page, { boards = [], bare = null } = {}) {
	await page.evaluateOnNewDocument(A => {
		const real = window.fetch.bind(window);
		const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
		window.fetch = (input, init = {}) => {
			const href = typeof input === 'string' ? input : input.url;
			let at;
			try { at = new URL(href, location.href); } catch { return real(input, init); }
			if (at.pathname === '/api/config') return Promise.resolve(json({ sync: true }));
			if (at.pathname === '/api/me') return Promise.resolve(json({ signedIn: false }));
			if (at.pathname === '/api/boards') {
				return import('/js/clock.js').then(m => json({ boards: A.boards.map(b => ({ ...b, day: b.day === 'today' ? m.barterKey() : b.day })) }));
			}
			if (at.pathname === '/api/market' && A.bare !== null) {
				const prices = {};
				(at.searchParams.get('ids') || '').split(',').filter(Boolean).forEach((id, i) => {
					prices[id] = { price: 1800 + (i * 37) % 900, base: 1800, stock: i % A.bare === 0 ? 0 : 40000 + i * 13, at: Date.now() };
				});
				return Promise.resolve(json({ region: 'na', at: Date.now(), prices, failed: 0 }));
			}
			return real(input, init);
		};
	}, { boards, bare });
}

/** What the fleet is said to have read: layout 16 with two slots moved,
 *  seen today by two sailors, and a handful of older readings. */
function fleetReadings() {
	const combos = useGame(GAME).combos;
	const of = id => combos.find(c => c.id === id).offers.map(o => o.slice(0, 4));
	const moved = of('16').slice(0, 26).map(o => [...o]);
	for (const [i, from] of [[3, '20'], [9, '5']]) {
		const o = of(from).find(x => x[0] === moved[i][0]);
		moved[i] = [moved[i][0], o[1], '1', o[3]];
	}
	const reading = (id, day, offers, name, seen) => ({ id, day, layout: null, offers, at: 100 - id, seen, name, mine: false, confirmed: false });
	return [
		reading(1, 'today', moved, 'Ahab', 4),
		reading(2, 'today', moved.slice(8, 20), null, 1),
		reading(3, '2026-09-15', of('7').slice(0, 30), 'Queequeg', 2),
		reading(4, '2026-09-12', of('7').slice(10, 22), 'Starbuck', 0),
		reading(5, '2026-09-10', of('23').slice(0, 40), 'Ishmael', 6),
		reading(6, '2026-09-08', of('31').slice(0, 25), 'Pip', 1)
	];
}

const shot = name => path.resolve(`tools/capture/shots/${name}`);

/* Where the two drawing clips put things on the chart, as fractions of
 * its box with the chart framed at the top of the window: three stops
 * on open water right of the side panel, a pen stroke begun well clear
 * of them, and a word. */
const STOPS = [[0.40, 0.30], [0.55, 0.47], [0.42, 0.66]];
const PEN = [0.60, 0.74];
const WORD = [0.58, 0.26];

const scenes = {
	/* 1.4 — a storage read off the screenshots of it: two screenfuls,
	 * scrolled between, the row they share counted once. The reading
	 * itself is ten seconds of nothing to watch, so the tape starts when
	 * the table is up. */
	async 'read-a-storage'({ page, url }) {
		// A narrow window, so the dialog is the frame: the subject is a
		// column of small pictures, and at full width they are specks once
		// the clip is cut to what the What's New dialog serves.
		await page.setViewport({ width: 880, height: 680, deviceScaleFactor: 1 });
		await seed(page, url, fittedShip);
		await tab(page, 'inventory');
		await click(page, '[data-act="inv-shot"]', { after: 900 });
		const input = await page.$('#dialog input[type=file]');
		await input.uploadFile(shot('storage-1.webp'), shot('storage-2.webp'));
		await waitFor(page, '.shot-table', { upTo: 180000, then: 900 });
		await rec(page, 'read-a-storage', async () => {
			await wait(900);
			await moveTo(page, '.shot-table tbody tr:nth-child(3) .shot-corner');
			await wait(1300);
			await page.evaluate(() => document.querySelector('.shot-table-wrap').scrollTo({ top: 520, behavior: 'smooth' }));
			await wait(2000);
			await page.evaluate(() => document.querySelector('.shot-table-wrap').scrollTo({ top: 1500, behavior: 'smooth' }));
			await wait(2000);
			await moveTo(page, '#dialog .dialog-note.quiet');
			await wait(1500);
		});
		await page.keyboard.press('Escape');
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* 1.4 — the barter window read the same way: every row of the shot
	 * answered at once, and the board settled from it. */
	async 'read-the-window'({ page, url }) {
		await page.setViewport({ width: 940, height: 640, deviceScaleFactor: 1 });
		await seed(page, url, fittedShip);
		await tab(page, 'barter');
		// The paste zone opens the file chooser itself; the reading
		// opens its dialog with the picture in hand.
		const [chooser] = await Promise.all([page.waitForFileChooser(), click(page, '[data-act="barter-shot"]', { after: 900 })]);
		await chooser.accept([shot('barter-window.webp')]);
		await waitFor(page, '#dialog .shot-table', { upTo: 240000, then: 900 });
		await rec(page, 'read-the-window', async () => {
			await wait(1200);
			await moveTo(page, '.shot-table tbody tr:nth-child(2)');
			await wait(1400);
			await click(page, '#dialog [data-use]', { after: 1200 });
			await frame(page, '.board-strip', { top: 24 });
			await moveTo(page, '.board-strip-k');
			await wait(2200);
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* 1.4 — the layout book, with a fleet made up for the purpose (see
	 * fakeSea): the shelf, a board that is in no record, and a layout
	 * opened out island by island. */
	async 'the-layout-book'() {
		const own = await open({ width: 1040, height: 720 });
		await fakeSea(own.page, { boards: fleetReadings() });
		await seed(own.page, own.url, fittedShip);
		await tab(own.page, 'barter');
		await wait(1200);
		await rec(own.page, 'the-layout-book', async () => {
			await wait(500);
			await click(own.page, '[data-act="barter-book"]', { after: 1800 });
			await moveTo(own.page, '.lb-card.stray');
			await wait(1200);
			await click(own.page, '.lb-card.stray', { after: 2600 });
			await click(own.page, '[data-lb-back]', { after: 900 });
			await click(own.page, '[data-lb-open="layout:7"]', { after: 1600 });
			await click(own.page, '[data-lb-level="L5"]', { after: 2200 });
		});
		await own.browser.close();
	},

	/* 1.4 — a chain whose first good the Central Market has none of: not
	 * a chain to tick, and saying why on its own face. The Market here is
	 * made up (fakeSea), with every third shelf bare. */
	async 'a-dry-chain'() {
		const own = await open({ width: 1180, height: 700 });
		await fakeSea(own.page, { bare: 3 });
		await barterDay(own.page, own.url, fittedShip);
		// The chains are the plan's fourth part, shut until opened.
		await openPart(own.page, 'chains');
		await waitFor(own.page, '.chain.dry', { upTo: 20000, then: 800 });
		await frame(own.page, '.chain.dry', { top: 90 });
		await rec(own.page, 'a-dry-chain', async () => {
			await wait(900);
			await moveTo(own.page, '.chain.dry .chain-dry');
			await wait(2400);
			await moveTo(own.page, '.chain:not(.dry):not(.shut)');
			await wait(1600);
		});
		await own.browser.close();
	},


	/* 1.3 — the board a real barter count can sail. Seeded at 1,082,
	 * which is the count the player who reported this actually has. */
	async 'your-own-board'({ page, url }) {
		// A shorter window for this one: the subject is two lines of a
		// bar and the list behind them, and at the full height they are
		// a tenth of the frame -- unreadable once the clip is cut to the
		// width the dialog serves.
		await page.setViewport({ width: 1180, height: 620, deviceScaleFactor: 1 });
		const state = JSON.parse(JSON.stringify(fittedShip));
		state.profile = { ...(state.profile || {}), barterCount: 1082 };
		await barterDay(page, url, state);
		await waitFor(page, '.board-shut', { then: 600 });
		await frame(page, '.board-strip', { top: 24 });
		await rec(page, 'your-own-board', async () => {
			await wait(700);
			await moveTo(page, '.board-shut');
			await wait(1100);
			await click(page, '[data-act="barter-gated"]', { after: 2400 });
			await wait(1800);
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* 1.3 — the day's errands worked out as one loop. */
	async 'todays-errands'({ page, url }) {
		await seed(page, url, fittedShip);
		await tab(page, 'map');
		await wait(1500);
		await click(page, '[data-act="map-mode"][data-id="hunt"]', { after: 900 });
		await frameMap(page);
		await rec(page, 'todays-errands', async () => {
			await wait(600);
			await click(page, '[data-act="map-errands"]', { after: 900 });
			await waitFor(page, '.errand-stops', { then: 1800 });
			// Down the list of calls, so the clip shows the hunts and
			// what to kill at each rather than the first four wharves.
			// Scrolled inside the panel only: the page stays put.
			await page.evaluate(() => {
				const stop = document.querySelector('.errand-stop.hunt');
				const box = stop && stop.closest('.map-side-body');
				if (box) box.scrollTo({ top: box.scrollTop + stop.getBoundingClientRect().top - box.getBoundingClientRect().top - 40, behavior: 'smooth' });
			});
			await wait(2200);
			await moveTo(page, '.errand-stop.hunt .errand-row');
			await wait(1200);
		});
	},

	/* 1.3 — a call taken hold of: the chart flies there and the call
	 * opens with every quest done at it. */
	async 'a-call-in-hand'({ page, url }) {
		await seed(page, url, fittedShip);
		await tab(page, 'map');
		await wait(1500);
		await click(page, '[data-act="map-mode"][data-id="hunt"]', { after: 900 });
		await click(page, '[data-act="map-errands"]', { after: 600 });
		await waitFor(page, '.errand-stops', { then: 1200 });
		await frameMap(page);
		await page.evaluate(() => {
			const stop = document.querySelector('.errand-stop.hunt');
			const box = stop && stop.closest('.map-side-body');
			if (box) box.scrollTo({ top: box.scrollTop + stop.getBoundingClientRect().top - box.getBoundingClientRect().top - 120 });
		});
		await wait(700);
		await rec(page, 'a-call-in-hand', async () => {
			await wait(600);
			await click(page, '.errand-stop.hunt .errand-row', { after: 2600 });
			await wait(2200);
		});
	},

	/* 1.2 — a day that is not for silver: a target of every good at a
	 * level, the level the stock ends at, and a run counted in goods.
	 * The targets and the ceiling are the ladder now (Where today ends);
	 * the runs worth sailing are under Chains on offer. */
	async 'a-stock'({ page, url }) {
		await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
		await barterDay(page, url, fittedShip, { goal: 'stock' });
		await openPart(page, 'ladder');
		await frame(page, '.plan-sec[data-sec="ladder"]', { top: 12 });
		await rec(page, 'a-stock', async () => {
			await wait(600);
			await typeInto(page, '[data-act="barter-target"][data-lv="2"]', '40', { after: 1200 });
			await click(page, '[data-act="barter-rung"][data-lv="3"]', { after: 1600 });
			await moveTo(page, '.ladder-goal', { settle: 1200 });
			await click(page, '[data-act="barter-sec"][data-id="chains"]', { after: 1400 });
			// The runs worth sailing come back from a worker.
			await waitFor(page, '.proposal:not(.placeholder)', { upTo: 20000, then: 600 });
			await click(page, '.proposal:not(.placeholder)', { after: 2000 });
			await moveTo(page, '.run-ahead', { settle: 2000 });
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* 1.2 — the fourth kind of day: climb to [Level 4] and cash it in
	 * at an island that pays in Crow Coins. */
	async 'crow-coins'({ page, url }) {
		// A purse short of what the builds want, so the line at the foot
		// has something to say.
		const state = JSON.parse(JSON.stringify(fittedShip));
		state.stock['Crow Coin'] = 2000;
		await barterDay(page, url, state, { goal: 'coin' });
		await openPart(page, 'chains');
		await waitFor(page, '.proposal:not(.placeholder)', { upTo: 20000, then: 1200 });
		await frame(page, '.proposals', { top: 16 });
		await rec(page, 'crow-coins', async () => {
			await wait(700);
			await click(page, '.proposal:not(.placeholder):not(.on)', { after: 2400 });
			await moveTo(page, '.run-ahead', { settle: 2400 });
		});
	},

	/* 1.2 — the clock, started by Cast off on the Load step: the ship
	 * drops into the water, the camera pulls back into the clock, and
	 * Traded sails it on to the next stop. */
	async 'the-clock'({ page, url }) {
		// Tall enough that the clock and Traded are both in the frame
		// once the cockpit opens, so nothing scrolls under the clip.
		await page.setViewport({ width: 1180, height: 960, deviceScaleFactor: 1 });
		await barterDay(page, url, fittedShip);
		await packed(page);
		await frame(page, '.barter-screen .steps', { top: 8 });
		await rec(page, 'the-clock', async () => {
			await wait(500);
			await castOff(page, { watch: 3000 });
			await frame(page, '.barter-screen .steps', { top: 8 });
			await tap(page, '.cockpit-clock', { after: 1800 });
			await tap(page, '[data-act="barter-stop-done"]', { after: 3600 });
			await tap(page, '.cockpit-clock .sail-timer', { after: 1200 });
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* 1.2 — the two shelves on the Load step: what to have aboard before
	 * casting off, and what is in the storage after, tiled the way the
	 * game's own window is. The second fills as the first is ticked. */
	async 'two-shelves'({ page, url }) {
		// Tall enough for the packing list and the shelf under it at once.
		await page.setViewport({ width: 1180, height: 1000, deviceScaleFactor: 1 });
		await barterDay(page, url, fittedShip);
		await press(page, '[data-act="barter-step"][data-id="load"]');
		await waitFor(page, '[data-act="barter-cast-off"]', { then: 1500 });
		await frame(page, '.pack-groups', { top: 12 });
		await rec(page, 'two-shelves', async () => {
			await wait(700);
			await moveTo(page, '.pack-row', { settle: 1200 });
			await click(page, '[data-act="barter-pack-all"]:not(.active)', { after: 1400 });
			await frame(page, '.pack-groups', { top: 12 });
			await tap(page, '.run-shelves .shelf-tile', { after: 2400 });
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* 1.2 — the day's boards, on the Results step: what each run loaded,
	 * what it brought back, and the totals across the Parley bar. */
	async 'todays-boards'({ page, url }) {
		// The day is the game's barter day, which only the page's own
		// clock knows: asked of it before the save is written.
		await page.goto(url, { waitUntil: 'load' });
		const barterDay = await page.evaluate(() => import('/js/clock.js').then(m => m.barterKey()));
		const state = JSON.parse(JSON.stringify(fittedShip));
		state.profile = {
			...state.profile,
			runs: [
				{ day: barterDay, silver: 0, cost: 0, trades: 20, parley: 210240, stops: 2, goal: 'stock', item: '', layout: '26', load: { 'Brass Ingot': 200 }, got: { '[Level 1] Fertile Soil': 10, '[Level 1] Unidentified Ancient Mural': 10 } },
				{ day: barterDay, silver: 19600000, cost: 386000, trades: 14, parley: 147168, stops: 5, goal: 'coin', item: '', layout: '12', load: { 'Pine Plywood': 10 }, got: { 'Crow Coin': 1240, '[Level 2] Narvo Sea Cucumber': 6 } }
			]
		};
		await seed(page, url, state);
		await tab(page, 'barter');
		await press(page, '[data-act="barter-step"][data-id="results"]');
		// The step press brings the steps up a beat later; framed after it.
		await waitFor(page, '.day-boards', { then: 2000 });
		await frame(page, '.barter-screen .steps', { top: 8 });
		await rec(page, 'todays-boards', async () => {
			await wait(900);
			await moveTo(page, '.day-run', { settle: 1400 });
			await moveTo(page, '.day-total', { settle: 2400 });
		});
	},

	/* 1.5 — the four steps of a run, one on the page at a time: the plan
	 * with today's board read, the Load step's packing list ticked
	 * aboard, Cast off into the cockpit, and the Results step. */
	async 'four-steps'({ page, url }) {
		await page.setViewport({ width: 1280, height: 860, deviceScaleFactor: 1 });
		await barterDay(page, url, fittedShip);
		// The best run lands from a worker and redraws the page; framed
		// once it has.
		await waitFor(page, '.run-dock [data-act="barter-step"][data-id="load"]', { upTo: 20000, then: 2000 });
		await frame(page, '.barter-screen .steps', { top: 8 });
		await rec(page, 'four-steps', async () => {
			await wait(900);
			await tap(page, '.run-dock [data-act="barter-step"][data-id="load"]', { after: 1600 });
			await frame(page, '.barter-screen .steps', { top: 8 });
			await tap(page, '[data-act="barter-pack-all"]:not(.active)', { after: 1400 });
			await castOff(page, { watch: 2200 });
			await frame(page, '.barter-screen .steps', { top: 8 });
			await wait(1400);
			await tap(page, '.steps [data-act="barter-step"][data-id="results"]', { after: 2200 });
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* 1.5 — the hold counts slots as well as LT. A [Level 5], [Level 6],
	 * [Level 7] or [Great Ocean] good takes a slot each; a stack of
	 * anything under them is one slot however big. On a Volante, which
	 * has twenty, the gauge says so, and so does every row of the hold. */
	async 'the-slots'({ page, url }) {
		await page.setViewport({ width: 1180, height: 760, deviceScaleFactor: 1 });
		const state = JSON.parse(JSON.stringify(fittedShip));
		state.profile.crewShip = 'Carrack (Volante)';
		Object.assign(state.stock, {
			'[Level 5] Azure Quartz': 3,
			'[Level 5] Elixir of Youth': 2,
			'[Level 5] Octagonal Box': 1,
			'[Level 6] Golden Sand Ring': 1,
			'[Level 3] Scout Binoculars': 2,
			'[Level 2] Pirate Gold Coin': 6
		});
		await barterDay(page, url, state);
		await press(page, '[data-act="barter-step"][data-id="load"]');
		await waitFor(page, '.hold-bar', { then: 1200 });
		await frame(page, '.hold-bar', { top: 12 });
		await rec(page, 'the-slots', async () => {
			await wait(700);
			await moveTo(page, '.hold-gauge b', { settle: 1800 });
			await click(page, '.hold-col-ship [data-act="barter-hold-open"]', { after: 1400 });
			// A row of five-up goods says "N slots, one each"; a stack
			// under them says "one slot".
			await moveTo(page, '.barter-hold .barter-good:has([data-item="[Level 5] Azure Quartz"]) .map-row-sub', { settle: 1600 });
			await moveTo(page, '.barter-hold .barter-good:has([data-item="[Level 3] Scout Binoculars"]) .map-row-sub', { settle: 1400 });
			// One more of a [Level 5] is one more slot on the gauge.
			for (let i = 0; i < 2; i++) {
				await click(page, '.barter-hold [data-act="barter-good"][data-item="[Level 5] Azure Quartz"][data-delta="1"]', { after: 900 });
			}
			await moveTo(page, '.barter-hold .map-load-bar', { settle: 1800 });
		});
		await page.keyboard.press('Escape');
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* 1.5 — a short trip: one trade picked off today's board, then
	 * taken one island further, and a trade that fits round it added. */
	async 'a-short-trip'({ page, url }) {
		await page.setViewport({ width: 1180, height: 820, deviceScaleFactor: 1 });
		await barterDay(page, url, fittedShip);
		await frame(page, '.plan-shape', { top: 12 });
		await rec(page, 'a-short-trip', async () => {
			await wait(600);
			await click(page, '[data-act="barter-shape"][data-id="short"]', { after: 1200 });
			await click(page, '[data-act="barter-sec"][data-id="chains"]', { after: 1600 });
			await waitFor(page, '.st-row:not(.off)', { upTo: 20000, then: 600 });
			await moveTo(page, '.st-row:not(.off) .st-figs', { settle: 900 });
			await click(page, '.st-row:not(.off)', { after: 1800 });
			await click(page, '.st-row.grows', { after: 1800 });
			await click(page, '.st-row:not(.off):not(.grows)', { after: 2000 });
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* Queue a build and watch the plan grow around it. */
	async 'queue-a-build'({ page, url }) {
		await seed(page, url, emptyStart);
		await tab(page, 'builds');
		await rec(page, 'queue-a-build', async () => {
			await wait(500);
			await click(page, '[data-act="add-build"]', { after: 900 });
			await page.type('.picker-search', "chiro's sail", { delay: 95 });
			await wait(900);
			await click(page, '[data-pick="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 1400 });
			await tab(page, 'plan');
			await wait(1200);
		});
	},

	/* The main loop: type in what you gathered, everything re-plans. */
	async 'record-what-you-own'({ page, url }) {
		await seed(page, url, {
			...midBuild,
			stock: { ...midBuild.stock, "Violent Sea Monster's Bone": 0, 'Starlight Hardener': 0 }
		});
		// The Missing list at the top of the frame, so typing into it never
		// scrolls the page under the clip.
		await frame(page, '.own-input[data-item="Violent Sea Monster\'s Bone"]', { top: 300 });
		await rec(page, 'record-what-you-own', async () => {
			await wait(600);
			await typeInto(page, '.own-input[data-item="Violent Sea Monster\'s Bone"]', '150', { after: 1100 });
			await typeInto(page, '.own-input[data-item="Starlight Hardener"]', '150', { after: 1500 });
		});
	},

	/* Craft a named batch; the stock actually moves. */
	async craft({ page, url }) {
		await seed(page, url, readyToCraft);
		await tab(page, 'workshop');
		await rec(page, 'craft', async () => {
			await wait(600);
			await typeInto(page, '.craft-card .craft-n', '40', { after: 500 });
			await click(page, '.craft-card [data-times="field"]', { after: 900 });
			// Off the cards: they re-sort after a craft, and a pointer left
			// where the button was hovers another recipe's card.
			await moveTo(page, '[data-act="view"][data-id="workshop"]', { settle: 1400 });
		});
	},

	/* Record a level you already reached in game -- no stones spent. */
	async 'record-a-level'({ page, url }) {
		await seed(page, url, recordLevel);
		await tab(page, 'inventory');
		await rec(page, 'record-a-level', async () => {
			await wait(400);
			await click(page, '[data-act="query"]', { after: 200 });
			await page.type('[data-act="query"]', 'toro plating', { delay: 95 });
			await wait(900);
			await click(page, '.tile', { after: 900 });
			await click(page, '.lvl:nth-child(8)', { after: 900 });
			await click(page, '[data-act="move-level"]', { after: 1500 });
		});
	},

	/* Two ways to the same ship, and the choice is yours. */
	async 'choose-a-route'({ page, url }) {
		await seed(page, url, emptyStart);
		await tab(page, 'builds');
		await rec(page, 'choose-a-route', async () => {
			await wait(500);
			await click(page, '[data-act="add-build"]', { after: 800 });
			await page.type('.picker-search', 'caravel', { delay: 90 });
			await wait(800);
			await click(page, '[data-pick="Epheria Caravel"]', { after: 1500 });
			await click(page, '.route:not(.on)', { after: 1600 });
		});
	},

	/* Why a build needs what it needs. */
	async 'the-tree'({ page, url }) {
		await seed(page, url, {
			...midBuild,
			targets: [{ id: 'c', item: 'Carrack (Advance)', qty: 1, active: true }]
		});
		await tab(page, 'tree');
		// The tree's own toolbar near the top, so Expand all has the whole
		// window to open into -- below 120px, or the press scrolls the page
		// to bring the button to the middle. The tab redraws once after
		// it opens; framed after that.
		await wait(2000);
		await frame(page, '[data-act="tree-all"]', { top: 130 });
		await rec(page, 'the-tree', async () => {
			// Opens on the useful view -- folded chains, whole spine
			// visible -- because the first frame is the thumbnail.
			await wait(900);
			await click(page, '[data-act="tree-all"]', { after: 2000 });
			await click(page, '[data-act="tree-none"]', { after: 1600 });
		});
	},

	/* Hover anything and see what goes into it. */
	/* What a thing really costs: the hover card, then both routes.
	 * Stays on one screen throughout -- a tab switch repaints every
	 * pixel, which doubles the GIF for nothing. */
	async 'what-it-costs'({ page, url }) {
		// Taller than the rest: the ways to get it sit at the foot of the
		// panel the click opens.
		await page.setViewport({ width: 1280, height: 1080, deviceScaleFactor: 1 });
		await seed(page, url, midBuild);
		await tab(page, 'inventory');
		await wait(700);
		await page.evaluate(() => window.scrollTo(0, 0));
		await rec(page, 'what-it-costs', async () => {
			await wait(500);
			await moveTo(page, '[data-act="select"][data-item="Delicately Polished Support"]', { settle: 2200 });
			await click(page, '[data-act="select"][data-item="Delicately Polished Support"]', { after: 2600 });
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* The shopping list, drawn on the sea, then plotted as a loop. */
	async 'chart-the-loop'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(1600);
		await frameMap(page);
		await rec(page, 'chart-the-loop', async () => {
			await wait(600);
			await click(page, '[data-act="map-mode"][data-id="route"]', { after: 1000 });
			await click(page, '[data-act="map-route-use"]', { after: 2800 });
		});
	},

	/* A route the barter list cannot express: stops, a line, a word.
	 * Nothing scrolls and the tiles never move, so the only pixels that
	 * change are the ink -- which is what keeps this one small. */
	async 'draw-a-route'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(1600);
		await click(page, '[data-act="map-mode"][data-id="trace"]', { after: 900 });
		await click(page, '[data-act="trace-tool"][data-id="point"]', { after: 700 });
		await frameMap(page);
		await rec(page, 'draw-a-route', async () => {
			await wait(500);
			for (const [fx, fy] of STOPS) {
				await clickIn(page, '#map', fx, fy, { after: 650 });
			}
			await click(page, '[data-act="trace-tool"][data-id="pen"]', { after: 600 });
			// Begun well clear of the stops: a drag started on a mark
			// carries the mark off instead of drawing.
			await drag(page, '#map', 170, -110, { from: PEN, after: 900 });
		});
	},

	/* The day's free rewards, ticked and recorded together.
	 *
	 * Kept short on purpose. Ticking a row opens the bar above the list
	 * and pushes every row below it down, so each press repaints the
	 * whole frame -- which is why this one is given a narrower, slower
	 * encode in shoot.sh than the clips that only change a corner. */
	async 'claim-a-quest'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'quests');
		await wait(800);
		// Only the quests paying one fixed reward: a pick-one quest stops
		// Finish to ask which, and a hand-in asks which good went -- both
		// true, neither what this shows. Their Claimed buttons carry a
		// title saying so; a plain one has none.
		const plain = '.quest:not(.done):not(.selected):has([data-act="quest-claim"]:not([title])) .quest-check';
		// The tab keeps the scroll it was left at; the ticked bar is at
		// the head of the list, and the first plain rows a screen down.
		// A search for the barter quests puts two plain ones near the head
		// of the list, under the bar that ticking opens.
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.type('[data-act="query"]', 'barter', { delay: 20 });
		await wait(900);
		await frame(page, '[data-act="query"]', { top: 150 });
		await rec(page, 'claim-a-quest', async () => {
			await wait(300);
			await click(page, plain, { after: 350 });
			await click(page, plain, { after: 500 });
			await click(page, '[data-act="quest-finish"]', { after: 1300 });
		});
	},

	/* A hull is five slots and a crew, and its speed is a real number:
	 * type the Sailing Mastery into the bar and the whole card moves.
	 *
	 * The field moved out of this screen and into the shell, so the clip
	 * opens the sailor bar first -- which is the honest picture anyway:
	 * one number, typed once, that every tab reads.
	 *
	 * The pointer is kept off the slot cards -- hovering one opens the
	 * peek card over half the screen, and a full-width overlay appearing
	 * and going again costs more in the GIF than it explains. */
	async 'fit-a-ship'({ page, url }) {
		// A new sailor's mastery, so the number typed in is a change.
		await seed(page, url, { ...fittedShip, profile: { ...fittedShip.profile, sailingMastery: 0 } });
		await tab(page, 'crew');
		await wait(900);
		await click(page, '[data-act="sail-bar"]', { after: 700 });
		await rec(page, 'fit-a-ship', async () => {
			await wait(500);
			await typeInto(page, '[data-act="crew-mastery"]', '1500', { after: 1800 });
		});
	},

	/* The chart stood up on the game's own terrain, and painted both
	 * ways. Every pixel moves in this one -- a tilting heightmap is the
	 * worst case a GIF can be given -- so it is kept to a few seconds
	 * and shoot.sh gives it the narrowest, slowest encode here. */
	async 'stand-it-up'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(2200);
		await frameMap(page);
		await wait(800);
		await frameMap(page);
		await rec(page, 'stand-it-up', async () => {
			await wait(300);
			// Pressed where they are: a scroll here repaints a heightmap.
			await tap(page, '[data-act="map-3d"]', { after: 3800 });
			await drag(page, '#map', 0, -130, { hold: 'Shift', after: 700 });
			await tap(page, '[data-act="map-style"][data-id="neon"]', { after: 2600 });
		});
		// Back down, so a scene shot after this one is not tilted.
		await click(page, '[data-act="map-3d"]', { after: 900 });
	},

	/* What the plan costs in days, and how that answer moves with what
	 * you tell it: the goal, the days a week you sail, and the ways you
	 * are willing to use. On this save the barter draws set the pace
	 * whatever the goal, so the goal changes what is bought and the day
	 * count moves with the days a week and the ways. The headline and the
	 * steps both redraw, so this one is given a narrower frame. */
	async 'the-way'({ page, url }) {
		await seed(page, url, onePartToGo);
		await tab(page, 'get');
		await wait(1100);
		await frame(page, '[data-act="get-preset"]', { top: 150 });
		await rec(page, 'the-way', async () => {
			await wait(400);
			await click(page, '[data-act="get-preset"][data-id="coins"]', { after: 1300 });
			await choose(page, '[data-act="get-days"]', '3', { after: 1600 });
			await click(page, '[data-act="get-doing"][data-id="quests"]', { after: 1800 });
			await click(page, '[data-act="get-doing"][data-id="quests"]', { after: 1000 });
			await choose(page, '[data-act="get-days"]', '7', { after: 1300 });
			await click(page, '[data-act="get-preset"][data-id="soon"]', { after: 1200 });
		});
	},

	/* A ship in a link. The whole fit-out -- hull, four parts, crystal,
	 * roster and seating -- copied from the Ship tab with one press, and
	 * then what the link does at the other end: opened on a save that
	 * has none of it, it says whose ship it is and what is on it, which
	 * of the parts you hold, and offers the boat itself or its missing
	 * parts as builds. The boat is the fleet's Volante, so the parts are
	 * ones the receiving save does not have. The screencast rides across
	 * the reload: it is the page's, not the document's. */
	async 'share-a-ship'({ browser, page, url }) {
		const theirs = FLEET.find(s => s.username === 'Sea-Wolf').save.profile;
		await seed(page, url, { ...midBuild, profile: { crewShip: theirs.crewShip, fitted: theirs.fitted, crystal: theirs.crystal, seats: theirs.seats, roster: theirs.roster, sailingMastery: theirs.sailingMastery } });
		await tab(page, 'crew');
		await wait(900);
		await rec(page, 'share-a-ship', async () => {
			await wait(700);
			await click(page, '[data-act="crew-link"]', { after: 1600 });
			await seed(page, await copiedLink(browser, page, url, 'ship'), emptyStart);
			await waitFor(page, '[data-ship-take]', { then: 2400 });
			await click(page, '[data-ship-take]', { after: 2200 });
		});
	},

	/* A drawing in a link. Three stops, a line and a word, named and
	 * copied; then the link opened on an empty save flies its chart to
	 * the drawing. Same page across the reload, as above. Taller than
	 * the other clips: the Write tool and the name field sit low in the
	 * panel, and a page that scrolls to reach them repaints every
	 * pixel. */
	async 'share-a-drawing'({ browser, page, url }) {
		await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(1600);
		await click(page, '[data-act="map-mode"][data-id="trace"]', { after: 900 });
		await click(page, '[data-act="trace-tool"][data-id="point"]', { after: 700 });
		await frameMap(page);
		await rec(page, 'share-a-drawing', async () => {
			await wait(400);
			for (const [fx, fy] of STOPS) {
				await clickIn(page, '#map', fx, fy, { after: 550 });
			}
			await click(page, '[data-act="trace-tool"][data-id="pen"]', { after: 500 });
			await drag(page, '#map', 170, -110, { from: PEN, after: 700 });
			await click(page, '[data-act="trace-tool"][data-id="text"]', { after: 500 });
			await clickIn(page, '#map', WORD[0], WORD[1], { after: 500 });
			await page.keyboard.type('Cox camp here', { delay: 80 });
			await page.keyboard.press('Enter');
			await wait(700);
			await typeInto(page, '[data-act="trace-name"]', 'Night run to Cox', { after: 600 });
			await click(page, '[data-act="trace-link"]', { after: 1500 });
			await seed(page, await copiedLink(browser, page, url, 'trace'), emptyStart);
			await frameMap(page);
			await wait(2200);
		});
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},

	/* A run on today's board: one island looked at and the board
	 * follows; the best run is ticked and waits along the foot of the
	 * page; Load at the wharf packs it, Cast off sails it, and On the
	 * chart puts it on the Map. The last beat repaints the whole frame,
	 * so shoot.sh gives this one the narrower, slower encode. */
	async 'plan-a-run'({ page, url }) {
		await seed(page, url, fittedShip);
		await tab(page, 'barter');
		await wait(1200);
		await frame(page, '.barter-screen .steps', { top: 8 });
		await rec(page, 'plan-a-run', async () => {
			await wait(500);
			await click(page, '[data-act="barter-board-ask"]', { after: 900 });
			await page.type('.picker-in', 'raft', { delay: 95 });
			await wait(700);
			await click(page, '.picker-row', { after: 800 });
			// The runs worth sailing come back from a worker; the best
			// one is ticked when it lands, and that is when the run dock
			// along the foot has a run on it.
			await waitFor(page, '.run-dock [data-act="barter-step"][data-id="load"]', { upTo: 20000, then: 1400 });
			await tap(page, '.run-dock [data-act="barter-step"][data-id="load"]', { after: 1600 });
			await click(page, '[data-act="barter-pack-all"]:not(.active)', { after: 1000 });
			await castOff(page, { watch: 1800 });
			await tap(page, '[data-act="barter-sail-chart"]', { after: 3400 });
		});
	},

	async 'peek-a-recipe'({ page, url }) {
		await seed(page, url, midBuild);
		// Park the view on the crafting rows before the tape rolls -- a
		// scroll in a GIF changes every pixel and triples the file size.
		await page.evaluate(() => {
			document.querySelector('.row[data-peek*="Wave Residue"]')
				.scrollIntoView({ block: 'center' });
		});
		await wait(2500);
		await rec(page, 'peek-a-recipe', async () => {
			await wait(500);
			await hover(page, '.row[data-peek*="Wave Residue"]', { settle: 1900 });
			await hover(page, '.row[data-peek*="Toro Sail"]', { settle: 1900 });
		});
	},

	/* A place on a board is a door: a row on Best ship opens that
	 * sailor's card, and the card stands the Ship tab up on their boat.
	 *
	 * The only staged thing in this harness. The tab, the digest and the
	 * ranking are the app's own; the four sailors they run on are
	 * invented, because a capture machine has no deployment with players
	 * on it. fleet.mjs holds them, and the README says so beside the
	 * clip. Its own browser, so the faked sign-in cannot leak into a
	 * scene shot after it. */
	async 'the-boards'() {
		const own = await open({ width: 1280, height: 900 });
		await fakeCommunity(own.page);
		await seed(own.page, own.url, midBuild);
		await tab(own.page, 'community');
		await wait(1200);
		await rec(own.page, 'the-boards', async () => {
			await wait(600);
			await click(own.page, '[data-act="community-entry"][data-board="ship"]', { after: 1800 });
			// It ends on their boat, held: that is the payoff, and the bar
			// along the foot is the clip's last word -- a look, not a keep.
			// Pressing back would spend the closing seconds on whatever
			// bare hull the seeded save happens to be sailing.
			await click(own.page, '[data-act="community-look"]', { after: 2600 });
			await wait(1200);
		});
		await own.browser.close();
	}
};

const stills = {
	async hero({ page, url }) {
		await page.setViewport({ width: 1280, height: 1140, deviceScaleFactor: 1 });
		await seed(page, url, midBuild);
		await page.evaluate(() => document.getElementById('__cur').remove());
		await page.screenshot({ path: `${OUT}/hero.png` });
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},
	async 'to-get'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'get');
		await click(page, '[data-act="get-mode"][data-id="source"]');
		await wait(500);
		await page.evaluate(() => document.getElementById('__cur').remove());
		await page.screenshot({ path: `${OUT}/to-get.png` });
	},
	/**
	 * The plan, which is what To Get opens on: the card that says where
	 * it lands and the first steps under it. The quest list is folded so
	 * the whole shape fits one frame -- a day's dailies would push the
	 * steps a screen and a half down.
	 */
	async 'the-plan'({ page, url }) {
		await page.setViewport({ width: 1180, height: 1180, deviceScaleFactor: 1 });
		await seed(page, url, onePartToGo);
		await tab(page, 'get');
		await wait(900);
		await page.evaluate(() => {
			const b = document.querySelector('[data-act="get-fold"][data-id="quests"]');
			if (b) b.click();
		});
		await wait(500);
		// The rules this plan keeps to are a line to open, and shut here:
		// the still is of where it lands and the steps, not the small print.
		await page.evaluate(() => {
			const b = document.querySelector('[data-act="get-fold"][data-id="rules"][aria-expanded="true"]');
			if (b) b.click();
		});
		await wait(500);
		await page.evaluate(() => {
			const el = document.querySelector('.way-head');
			if (el) window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 24);
			const cur = document.getElementById('__cur');
			if (cur) cur.remove();
		});
		await wait(350);
		await page.screenshot({ path: `${OUT}/the-plan.png` });
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},
	async map({ page, url }) {
		// Taller than the other stills, so the chart is most of the frame
		// rather than the bottom half of it.
		await page.setViewport({ width: 1280, height: 1060, deviceScaleFactor: 1 });
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(2600);
		await frame(page, '#map', { top: 150 });
		await wait(1200);
		await noCursor(page);
		await page.screenshot({ path: `${OUT}/map.png` });
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},
	async quests({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'quests');
		await wait(900);
		await page.evaluate(() => document.getElementById('__cur').remove());
		await page.screenshot({ path: `${OUT}/quests.png` });
	},
	async community() {
		// Wider than the rest of the stills: at 1280 a board row wraps its
		// hull under its parts, and the boards are the point of the shot.
		const own = await open({ width: 1440, height: 1000 });
		await fakeCommunity(own.page);
		await seed(own.page, own.url, midBuild);
		await tab(own.page, 'community');
		await wait(1600);
		await own.page.evaluate(() => {
			document.getElementById('__cur').remove();
			window.scrollTo(0, 0);
		});
		await own.page.screenshot({ path: `${OUT}/community.png` });
		await own.browser.close();
	},
	async inventory({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'inventory');
		await page.evaluate(() => {
			document.getElementById('__cur').remove();
			document.querySelector('.tile').click();
		});
		await wait(600);
		await page.screenshot({ path: `${OUT}/inventory.png` });
	}
};

/**
 * The pictures a chat shows when a link to the app is dropped in it --
 * one per card in server/preview.js, 1200 x 630 at one device pixel,
 * written to og/ at the repository root, and og/home.png again as the
 * fallback og.png. Each is the thing its card names, filled in and
 * settled: no pointer, no thread of light still running, no dialog
 * half-open.
 */
const OG = path.resolve('og');

/** Nothing on its way: no loading thread lit and nothing marked busy,
 *  for most of a second running. */
async function settled(page, { upTo = 20000 } = {}) {
	const end = Date.now() + upTo;
	let quiet = 0;
	while (Date.now() < end && quiet < 4) {
		const busy = await page.evaluate(() => !!document.querySelector('.loadbar.on, [aria-busy="true"], .is-busy, .proposals.working'));
		quiet = busy ? 0 : quiet + 1;
		await wait(250);
	}
}

async function ogShot(page, name) {
	// The real pointer off anything with a hover card: the chart shows
	// an island's card under a pointer left resting on its pin.
	await page.mouse.move(2, 2);
	await settled(page);
	await noCursor(page);
	await page.evaluate(() => {
		// The toasts a press leaves are about the press, not the card.
		document.querySelectorAll('.toast, #toast, .toasts').forEach(t => { t.style.display = 'none'; });
	});
	await wait(300);
	const file = `${OG}/${name}.png`;
	await page.screenshot({ path: file });
	// Every chat a link is dropped in fetches this, so it is kept under
	// 600 KB: a card over that is quantised to a 256-colour palette,
	// which a picture of flat UI colour hardly shows. The chart's
	// terrain is the one that needs it.
	const { statSync, renameSync } = await import('node:fs');
	const { spawnSync } = await import('node:child_process');
	if (statSync(file).size > 600000) {
		const out = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', 'split[a][b];[a]palettegen=max_colors=256:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a', `${file}.tmp.png`]);
		if (out.status === 0) renameSync(`${file}.tmp.png`, file);
	}
	console.log(`  → og/${name}.png (${Math.round(statSync(file).size / 1024)} KB)`);
}

const ogCards = {
	/* The front page: the Plan, part-way through two Carrack parts. */
	async home({ page, url }) {
		await seed(page, url, fittedShip);
		await ogShot(page, 'home');
	},
	/* A plan in a link, opened and looked around: the other sailor's
	 * builds and stock on the Plan, under the bar that says whose. */
	async plan({ page, url }) {
		await seed(page, url, emptyStart);
		const link = await page.evaluate(async save => {
			const m = await import('/js/share.js');
			return m.shareLink(await m.encodeShare(save, { slim: true }));
		}, midBuild);
		const there = new URL(link);
		there.searchParams.set('theirs', '1');
		await seed(page, there.href, emptyStart);
		await waitFor(page, '[data-share-look]', { then: 400 });
		await press(page, '[data-share-look]');
		await wait(1600);
		// Their builds and what those still need, under the bar along the
		// foot that says this is a shared plan being looked at.
		await frame(page, '.summary', { top: 16 });
		await ogShot(page, 'plan');
	},
	/* A ship setup: the fleet's Volante with its four parts and a crew
	 * of sixteen, on the Ship tab. */
	async ship({ page, url }) {
		const theirs = FLEET.find(s => s.username === 'Sea-Wolf').save.profile;
		await seed(page, url, { ...midBuild, profile: { ...midBuild.profile, crewShip: theirs.crewShip, fitted: theirs.fitted, crystal: theirs.crystal, seats: theirs.seats, roster: theirs.roster, sailingMastery: theirs.sailingMastery } });
		await tab(page, 'crew');
		await wait(1200);
		// The ship's own card at the top: its name, the figures, and the
		// crew's strip under it.
		await page.evaluate(() => {
			const card = document.querySelector('[data-act="crew-link"]').closest('.panel, section');
			window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 12);
		});
		await wait(500);
		await ogShot(page, 'ship');
	},
	/* A drawing on the chart: three stops, a freehand line and a word. */
	async trace({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(1600);
		// Full screen: the chart is the whole card.
		await click(page, '[data-act="map-full"]', { after: 1500 });
		await click(page, '[data-act="map-mode"][data-id="trace"]', { after: 700 });
		await click(page, '[data-act="trace-tool"][data-id="point"]', { after: 500 });
		for (const [fx, fy] of STOPS) await clickIn(page, '#map', fx, fy, { after: 350 });
		await click(page, '[data-act="trace-tool"][data-id="pen"]', { after: 400 });
		await drag(page, '#map', 150, -90, { from: PEN, after: 500 });
		await click(page, '[data-act="trace-tool"][data-id="text"]', { after: 400 });
		await clickIn(page, '#map', WORD[0], WORD[1], { after: 400 });
		await page.keyboard.type('Cox camp here', { delay: 10 });
		await page.keyboard.press('Enter');
		await wait(800);
		await ogShot(page, 'trace');
	},
	/* A barter loop plotted on the chart, every leg timed. */
	async route({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(1600);
		await click(page, '[data-act="map-full"]', { after: 1500 });
		await click(page, '[data-act="map-mode"][data-id="route"]', { after: 800 });
		await click(page, '[data-act="map-route-use"]', { after: 2600 });
		await ogShot(page, 'route');
	},
	/* The Barter tab: today's board read, the four steps over it, and
	 * the run along the foot. */
	async barter({ page, url }) {
		await barterDay(page, url, fittedShip);
		await waitFor(page, '.run-dock', { upTo: 20000 });
		await frame(page, '.barter-screen .steps', { top: 10 });
		await ogShot(page, 'barter');
	},
	/* The chart: a pin for every barterer with something on the list. */
	async map({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(1600);
		await click(page, '[data-act="map-full"]', { after: 2400 });
		await ogShot(page, 'map');
	},
	/* The sailing dailies and weeklies, which of them pay the list. */
	async quests({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'quests');
		await wait(900);
		await page.evaluate(() => window.scrollTo(0, 0));
		await frame(page, '[data-act="query"]', { top: 16 });
		await ogShot(page, 'quests');
	},
	/* The community boards, on the example fleet (fleet.mjs). */
	async community({ page }) {
		const own = await open({ width: 1200, height: 630 });
		await fakeCommunity(own.page);
		await seed(own.page, own.url, midBuild);
		await tab(own.page, 'community');
		await wait(1600);
		await frame(own.page, '.panel', { top: 0 });
		await own.page.evaluate(() => {
			const sea = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^The sea$/i.test(e.textContent.trim()) && e.closest('section, div'));
			const head = document.querySelector('[data-act="community-entry"]');
			const el = head ? head.closest('section, .panel') : sea;
			if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
		});
		await ogShot(own.page, 'community');
		await own.browser.close();
	}
};

stills.og = async ctx => {
	const { mkdir, copyFile } = await import('node:fs/promises');
	await mkdir(OG, { recursive: true });
	const own = await open({ width: 1200, height: 630 });
	try {
		for (const [name, card] of Object.entries(ogCards)) {
			// OG=map,trace re-shoots just those cards while iterating.
			if (process.env.OG && !process.env.OG.split(',').includes(name)) continue;
			await card(own);
		}
	} finally {
		await own.browser.close();
	}
	await copyFile(`${OG}/home.png`, path.resolve('og.png'));
};

const all = { ...scenes, ...stills };
const run = only.length ? only : Object.keys(all);

// A scene that dies is reported and the rest still shot: one moved
// button should cost one clip, not the forty behind it. The browser is
// opened again after a failure, since a scene can die with a dialog up
// or a recording running.
let ctx = await open();
const failed = [];
for (const name of run) {
	if (!all[name]) {
		console.log(`? unknown scene ${name}`);
		continue;
	}
	console.log(`recording ${name}`);
	try {
		await all[name](ctx);
	} catch (err) {
		failed.push(name);
		console.log(`  ✖ ${name}: ${err.message.split('\n')[0]}`);
		await ctx.page.screenshot({ path: `${OUT}/${name}.failed.png` }).catch(() => {});
		await ctx.browser.close().catch(() => {});
		ctx = await open();
	}
}
await ctx.browser.close();
console.log(failed.length ? `done -- ${failed.length} failed: ${failed.join(' ')}` : 'done');
if (failed.length) process.exitCode = 1;
