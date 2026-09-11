// A look at the shell's new sailing bar and the barter gate, on the
// desktop width and the phone.
import puppeteer from 'puppeteer-core';
import { seed, wait } from './drive.mjs';
import { midBuild } from './states.mjs';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = `http://localhost:${process.env.PORT || 8000}/`;
const out = process.argv[2] || '/tmp/gate';

const state = JSON.parse(JSON.stringify(midBuild));
state.profile = { ...(state.profile || {}), barterCount: 480, level: 'Artisan 5', vouchers: 13, parleyHeld: 1000000, valuePack: true };

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
