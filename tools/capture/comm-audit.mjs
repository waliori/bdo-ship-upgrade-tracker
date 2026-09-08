// A headless look at the Community tab with a fake fleet: every /api
// answer is faked, so no account and no server are needed.
//
// The fleet itself, and the answers about it, live in fleet.mjs -- the
// captures film the same one, so what this audits is what the README
// and the film show.
import puppeteer from 'puppeteer-core';
import { apiAnswers, FLEET } from './fleet.mjs';
import { seed, wait } from './drive.mjs';

const CHROME = process.env.CHROME || '/etc/profiles/per-user/waliori/bin/google-chrome';
const OUT = process.env.OUT || 'tools/capture/out/comm';
const PAGE = `http://127.0.0.1:${process.env.PORT || 8765}/#community`;

const youId = process.env.YOU || '1001';
const A = apiAnswers({ youId });
const me = FLEET.find(r => r.id === youId);

async function shoot(page, name) {
	await wait(500);
	await page.screenshot({ path: `${OUT}/${name}.png` });
	console.log('shot', name);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
const errors = [];
for (const [label, vp] of [['desk', { width: 1440, height: 1000 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
	const page = await browser.newPage();
	await page.setViewport(vp);
	page.on('console', m => { if (m.type() === 'error') errors.push(`${label}: ${m.text()}`); });
	page.on('pageerror', e => errors.push(`${label}: ${e.message}`));
	await page.setRequestInterception(true);
	page.on('request', req => {
		const u = new URL(req.url());
		const json = body => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
		if (u.pathname === '/api/config') return json(A.config);
		if (u.pathname === '/api/me') return json(A.me);
		if (u.pathname === '/api/state') return json(req.method() === 'GET' ? A.state : A.pushed);
		if (u.pathname === '/api/community') return json(A.community);
		if (u.pathname === '/api/community/mine') return json(A.mine);
		if (u.pathname.startsWith('/api/community/find')) return json({ sailors: A.named });
		if (u.pathname.startsWith('/api/community/sailor/')) return json(A.cards[u.pathname.split('/').pop()] || { error: 'no' });
		if (u.pathname.startsWith('/api/community/board/')) return json(A.boards[u.pathname.split('/').pop()] || { error: 'no' });
		if (u.pathname.startsWith('/api/')) return json({});
		req.continue();
	});
	await seed(page, PAGE, me ? me.save : {});
	await wait(800);
	await page.evaluate(() => { location.hash = '#community'; });
	await wait(900);
	await shoot(page, `${label}-fame`);
	const click = async sel => page.evaluate(s => { const el = [...document.querySelectorAll(s)].find(e => e.getBoundingClientRect().width > 0); if (el) el.click(); return !!el; }, sel);
	// Scroll down the hall of fame.
	await page.evaluate(() => window.scrollTo(0, 900));
	await shoot(page, `${label}-fame-2`);
	await page.evaluate(() => window.scrollTo(0, 0));
	await click('[data-act="community-entry"][data-board="ship"]');
	await wait(600);
	await shoot(page, `${label}-card`);
	await page.evaluate(() => { const b = document.querySelector('.comm-card-body'); if (b) b.scrollTop = 600; });
	await shoot(page, `${label}-card-2`);
	await page.evaluate(() => { const b = document.querySelector('.comm-card-body'); if (b) b.scrollTop = 1400; });
	await shoot(page, `${label}-card-3`);
	await page.evaluate(() => { const b = document.querySelector('.comm-card-body'); if (b) b.scrollTop = 0; });
	await click('[data-act="community-sailor-sheet"]');
	await wait(500);
	await shoot(page, `${label}-sailor-sheet`);
	await page.evaluate(() => { const b = document.querySelector('.dialog-box'); if (b) b.scrollTop = 500; });
	await shoot(page, `${label}-sailor-sheet-2`);
	await click('.dialog-actions [data-close]');
	await wait(300);
	await page.evaluate(() => { location.hash = '#community'; });
	await wait(500);
	await click('[data-act="community-entry"][data-board="ship"]');
	await wait(600);
	await click('[data-act="community-look"]');
	await wait(900);
	await click('[data-act="crew-select"]');
	await wait(400);
	await shoot(page, `${label}-look`);
	await page.evaluate(() => window.scrollTo(0, 1400));
	await shoot(page, `${label}-look-2`);
	const before = await page.evaluate(() => (document.querySelector('.crew-panel .panel-sub, .seated-line') || document.body).textContent.match(/(\d+)\/20 seated/)?.[1]);
	await click('[data-act="crew-auto"]');
	await wait(400);
	const toastText = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
	const after = await page.evaluate(() => (document.querySelector('.crew-panel .panel-sub, .seated-line') || document.body).textContent.match(/(\d+)\/20 seated/)?.[1]);
	console.log(label, 'auto assign during a look — seated before/after:', before, after, '| toast:', toastText.trim().slice(0, 80));
	await page.evaluate(() => window.scrollTo(0, 0));
	await click('[data-shared="back"]');
	await wait(500);
	await page.evaluate(() => { location.hash = '#community'; });
	await wait(700);
	await click('[data-act="community-board"][data-id="hunts"]');
	await wait(600);
	await shoot(page, `${label}-board`);
	await click('.dialog-actions [data-close]');
	await wait(300);
	await click('[data-act="community-places"]');
	await wait(400);
	await shoot(page, `${label}-places`);
	await click('.dialog-actions [data-close]');
	await wait(300);
	await click('[data-act="community-join"]');
	await wait(400);
	await shoot(page, `${label}-share`);
	await click('.dialog-actions [data-close]');
	await wait(300);
	await click('[data-act="community-half"][data-id="numbers"]');
	await wait(600);
	await shoot(page, `${label}-numbers`);
	await page.evaluate(() => window.scrollTo(0, 900));
	await shoot(page, `${label}-numbers-2`);
	await page.evaluate(() => window.scrollTo(0, 1800));
	await shoot(page, `${label}-numbers-3`);
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
	console.log(label, 'horizontal overflow:', overflow);
	await page.close();
}
await browser.close();
console.log('errors:', errors.length ? errors.join('\n') : 'none');
