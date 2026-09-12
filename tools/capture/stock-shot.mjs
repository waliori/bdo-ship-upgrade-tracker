// A look at the stock run, driven end to end.
//
// The save is the one this was built for: ten barters, a pile of shore
// goods and a handful of low trade goods ashore at Iliya. The board is
// answered live, since a layout is only known once an island has been
// looked at, and then every part of the stock run is exercised in turn
// -- the sheet of targets, the tiles, the proposals, orders saved
// under a name and put back on, the silver run left as it was, and the
// run laid out. What it prints is the page's own words, so a run of it
// can be read without opening the pictures.
//
//   CHROME=/usr/bin/google-chrome node tools/capture/stock-shot.mjs /tmp/stock
import puppeteer from 'puppeteer-core';
import { seed, wait } from './drive.mjs';
import { midBuild } from './states.mjs';

const CHROME = process.env.CHROME || '/etc/profiles/per-user/waliori/bin/google-chrome';
const URL = `http://localhost:${process.env.PORT || 8000}/`;
const out = process.argv[2] || '/tmp/stock';

const state = JSON.parse(JSON.stringify(midBuild));
state.stock = {
	...state.stock,
	'[Level 1] Bronze Statue': 12,
	'[Level 1] Rough Amethyst': 4,
	'[Level 2] Bronze Coin': 6,
	'[Level 3] Coral Piece': 3,
	'[Level 5] Azure Quartz': 5
};
// The pile is ashore at Iliya, not aboard: a hold that starts over the
// limit trades nothing, and the stock is a storage pile anyway.
state.profile = {
	...(state.profile || {}),
	stash: {
		'[Level 1] Bronze Statue': { 'Iliya Island': 12 },
		'[Level 1] Rough Amethyst': { 'Iliya Island': 4 },
		'[Level 2] Bronze Coin': { 'Iliya Island': 6 },
		'[Level 3] Coral Piece': { 'Iliya Island': 3 },
		'[Level 5] Azure Quartz': { 'Iliya Island': 5 }
	},
	orders: { preset: 'cash', sell: 7, floors: {}, buy: true, landFrom: 'stock', pace: 'full', hours: 0, count: 'least', way: 'sea', quests: 'near' }
};
// The 72 shore goods a stock sailor keeps: a pile of every one the
// board might start a chain from.
for (const name of ['Cinnamon', 'Tin Ingot', 'Birch Plywood', 'Coconut', 'Aloe', 'Beer', 'Brass Ingot', 'Cedar Plywood', 'Chicken Meat', 'Copper Ingot', 'Cactus Rind', 'Bloody Tree Knot', "Clown's Blood", 'Cooking Honey', 'Cactus Thorn', 'Caphras Tree Plywood', 'Clear Liquid Reagent']) state.stock[name] = 300;
state.profile = { ...(state.profile || {}), barterCount: 10, level: 'Artisan 5', vouchers: 13, parleyHeld: 1000000, valuePack: true };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1500,1200'] });
const errs = [];
const page = await browser.newPage();
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', e => errs.push(String(e.message)));
await page.setViewport({ width: 1500, height: 1200, deviceScaleFactor: 2 });
await seed(page, URL, state);
await page.evaluate(() => { location.hash = '#barter'; });
await wait(2500);

// The stock goal, then the board answered so the chains appear.
await page.evaluate(() => document.querySelector('[data-act="barter-goal"][data-id="stock"]').click());
await wait(1200);
await page.screenshot({ path: `${out}-1-before-board.png` });

// One island rarely names the layout: answer until the board is known.
for (let i = 0; i < 6; i++) {
	const ask = await page.$('[data-act="barter-board-ask"]');
	if (!ask) break;
	await ask.click();
	await wait(800);
	const row = await page.$('.picker-row');
	if (!row) break;
	await row.click();
	await wait(1800);
}
await wait(4000);
await page.screenshot({ path: `${out}-2-board.png` });

// What the sheet says, in text, so a run of this script can be read
// without opening the pictures.
const said = await page.evaluate(() => {
	const t = sel => [...document.querySelectorAll(sel)].map(x => x.textContent.replace(/\s+/g, ' ').trim());
	return {
		rows: t('.stock-row'),
		head: t('.stock-head'),
		tiles: t('.run-tiles > div'),
		ahead: t('.run-ahead'),
		cards: t('.proposal'),
		chains: document.querySelectorAll('.chain').length,
		tops: [...new Set(t('.chain-group-head'))]
	};
});
console.log(JSON.stringify(said, null, 1));

// Orders saved under a name, then applied again.
const saveBtn = await page.$('[data-act="barter-save"]');
if (saveBtn) {
	// A synthetic click: the run dock sits over the foot of the page.
	await page.evaluate(() => document.querySelector('[data-act="barter-save"]').click());
	await wait(900);
	await page.type('.save-name', 'fill the low levels', { delay: 20 });
	await page.evaluate(() => document.querySelector('[data-save]').click());
	await wait(1200);
	const chips = await page.evaluate(() => [...document.querySelectorAll('.orders-saved')].map(x => x.textContent.replace(/\s+/g, ' ').trim()));
	console.log('saved:', JSON.stringify(chips));
	await page.screenshot({ path: `${out}-4-saved.png` });
	// Change the ceiling, then put the saved orders back on.
	await page.select('[data-act="barter-ceiling"]', '2');
	await wait(1500);
	const moved = await page.evaluate(() => document.querySelector('[data-act="barter-ceiling"]').value);
	await page.evaluate(() => document.querySelector('[data-act="barter-saved"]').click());
	await wait(1800);
	const back = await page.evaluate(() => document.querySelector('[data-act="barter-ceiling"]').value);
	console.log('ceiling moved to', moved, '-> saved orders put it back to', back);
}

// Back to the silver run: its own tiles, untouched by any of this.
await page.evaluate(() => document.querySelector('[data-act="barter-goal"][data-id="silver"]').click());
await wait(3000);
console.log('silver tiles:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.run-tiles > div')].map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 70)))));
await page.screenshot({ path: `${out}-5-silver.png` });
await page.evaluate(() => document.querySelector('[data-act="barter-goal"][data-id="stock"]').click());
await wait(2500);

// The run laid out: the sheet over the page.
const open = await page.$('[data-act="barter-run-open"]');
if (open) {
	await open.click();
	await wait(2000);
	await page.screenshot({ path: `${out}-3-sheet.png` });
	const sheet = await page.evaluate(() => [...document.querySelectorAll('.run-list')].map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 220)));
	console.log('sheet lists:', JSON.stringify(sheet, null, 1));
}
console.log('errors:', errs.length ? errs : 'none');
await browser.close();
