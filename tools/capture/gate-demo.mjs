// One chain, on one board, either side of the threshold that opens it.
//
// Layout 16 holds a climb whose [Level 4] rung is dealt at the Wandering
// Merchant's Ship, which the game opens at 3,000 Total Barters. This
// answers the board in the app, then reads the chain list at 2,999 and
// again at 3,000 -- the same day, the same board, one barter apart.
//
//   CHROME=/path/to/chrome PORT=8000 node tools/capture/gate-demo.mjs /tmp/demo
import puppeteer from 'puppeteer-core';
import { seed, wait } from './drive.mjs';
import { midBuild } from './states.mjs';

const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const URL = `http://localhost:${process.env.PORT || 8000}/`;
const out = process.argv[2] || '/tmp/gate-demo';

const state = JSON.parse(JSON.stringify(midBuild));
state.profile = { ...(state.profile || {}), barterCount: 2999, level: 'Artisan 5', vouchers: 13, parleyHeld: 1000000, valuePack: true };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGE ERROR:', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });
await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 2 });
await seed(page, URL, state);
await page.evaluate(() => { location.hash = '#barter'; });
await wait(3000);

// Answer the board: "raft" at the first island settles layout 16.
for (let i = 0; i < 3; i++) {
	const asked = await page.evaluate(() => {
		const b = document.querySelector('[data-act="barter-board-ask"]');
		if (!b) return false;
		b.click();
		return true;
	});
	if (!asked) break;
	await wait(700);
	const box = await page.$('.dialog .picker-in');
	if (box && i === 0) { await box.type('raft'); await wait(400); }
	await page.evaluate(() => { const r = document.querySelector('.dialog .picker-row'); if (r) r.click(); });
	await wait(2500);
}

const read = async () => page.evaluate(() => ({
	layout: (document.querySelector('.barter-bar-lead b') || {}).textContent || '?',
	note: (document.querySelector('.barter-shut') || {}).textContent || '',
	locked: [...document.querySelectorAll('.chain.shut')].map(el => el.querySelector('.chain-route').textContent.trim()),
	open: [...document.querySelectorAll('.chain:not(.shut)')].map(el => el.querySelector('.chain-route').textContent.trim())
}));

const shot = async name => {
	const panel = await page.$('.barter-chains');
	if (panel) await panel.screenshot({ path: `${out}-${name}.png` });
};

const before = await read();
await shot('2999');
console.log(`— at 2,999 barters, ${before.layout}`);
console.log(`  locked chains: ${before.locked.length}`);
before.locked.forEach(r => console.log(`   🔒 ${r}`));
console.log(`  open chains:   ${before.open.length}`);

await page.evaluate(async () => {
	const store = await import('/js/state.js');
	store.setProfile('barterCount', 3000);
});
await wait(2500);
console.log('  bar says:', await page.evaluate(() => (document.querySelector('#pouch .pouch-item.sail') || {}).textContent.replace(/\s+/g, ' ').trim()));
const after = await read();
await shot('3000');
console.log(`— at 3,000 barters, ${after.layout}`);
console.log(`  locked chains: ${after.locked.length}`);
console.log(`  open chains:   ${after.open.length}`);
const gained = after.open.filter(r => !before.open.includes(r));
console.log(`  chains that one barter opened: ${gained.length}`);
gained.forEach(r => console.log(`   ✓ ${r}`));

await browser.close();
