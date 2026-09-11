// A look at the shell's new sailing bar and the barter gate, on the
// desktop width and the phone.
import puppeteer from 'puppeteer-core';
import { seed, wait } from './drive.mjs';
import { midBuild } from './states.mjs';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = `http://localhost:${process.env.PORT || 8000}/`;
const out = process.argv[2] || '/tmp/gate';

const state = JSON.parse(JSON.stringify(midBuild));
state.profile = { ...(state.profile || {}), barterCount: Number(process.env.BARTERS || 480), level: 'Artisan 5', vouchers: 13, parleyHeld: 1000000, valuePack: true };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--window-size=1440,1000'] });
const errs = [];
for (const [name, w, h] of [['desk', 1440, 1000], ['phone', 390, 844]]) {
	const page = await browser.newPage();
	page.on('console', m => { if (m.type() === 'error') errs.push(`${name}: ${m.text()}`); });
	page.on('pageerror', e => errs.push(`${name}: ${e.message}`));
	await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
	await seed(page, URL, state);
	for (const tab of ['get', 'barter', 'plan']) {
		await page.evaluate(t => { location.hash = `#${t}`; }, tab);
		await wait(tab === 'barter' ? 3500 : 1400);
		await page.screenshot({ path: `${out}-${name}-${tab}.png` });
	}
	if (name === 'desk') {
		// The sailing numbers, opened for typing.
		// A real press, not element.click(): the button takes the focus,
		// which is the case the repaint has to survive.
		const fold = await page.$('[data-act="sail-bar"]');
		await fold.click();
		await wait(600);
		await page.screenshot({ path: `${out}-bar-open.png`, clip: { x: 0, y: 0, width: 1440, height: 420 } });
		const shutBtn = await page.$('[data-act="sail-bar"]');
		await shutBtn.click();
		await wait(400);
		const folded = await page.evaluate(() => !document.querySelector('.pouch-item.sail.barters'));
		console.log('folds back:', folded);
		// And a board with a layout known, so the chains -- and what is
		// shut -- are on the page.
		await page.evaluate(() => { location.hash = '#barter'; });
		await wait(2500);
		for (let i = 0; i < 3; i++) {
			const asked = await page.evaluate(() => {
				const b = document.querySelector('[data-act="barter-board-ask"]');
				if (!b) return false;
				b.click();
				return true;
			});
			if (!asked) break;
			await wait(700);
			// The generic picker: .picker-in to filter, .picker-row to
			// pick. "raft" at the first island settles layout 16, which
			// is one of the eleven with a chain behind a gate.
			const box = await page.$('.dialog .picker-in');
			if (box && i === 0) { await box.type('raft'); await wait(400); }
			await page.evaluate(() => {
				const row = document.querySelector('.dialog .picker-row');
				if (row) row.click();
			});
			await wait(2500);
		}
		await page.screenshot({ path: `${out}-board-known.png`, fullPage: false });
		const shut = await page.evaluate(() => {
			const el = document.querySelector('.barter-shut');
			return el ? el.textContent.trim() : 'no shut line';
		});
		console.log('shut line:', shut);
	}
	// how wide the page really is, and the bar's height
	const m = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
		pouch: (document.getElementById('pouch') || {}).offsetHeight
	}));
	console.log(name, JSON.stringify(m));
	await page.close();
}
await browser.close();
console.log(errs.length ? `CONSOLE ERRORS:\n${errs.join('\n')}` : 'no console errors');
