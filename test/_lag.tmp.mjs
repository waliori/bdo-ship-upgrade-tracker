import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
process.env.NODE_ENV = 'test';
const { RELEASE } = await import('../js/about.js');
const app = (await import('../server.js')).default;
const server = app.listen(0);
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: '/etc/profiles/per-user/waliori/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1800, height: 1000, deviceScaleFactor: 2 });
await page.evaluateOnNewDocument(rel => { localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true'); localStorage.setItem('bdo-tracker/release', rel); localStorage.setItem('bdo-tracker/map-view', JSON.stringify({ mode: 'hunt', panelOpen: false, habitatsOn: true })); }, RELEASE);
await page.goto(base + '/#map', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-map]'); await new Promise(r => setTimeout(r, 2500));
const out = '/tmp/claude-1000/-home-waliori-Storage-Big-Nextcloud-computers-Perso-Projects-bdo-ship-upgrade-tracker/247de189-69fb-4985-9bcf-a7fe6c342b37/scratchpad/';
const box = await page.$eval('[data-map]', el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
for (const key of process.argv.slice(2)) {
	await page.evaluate(async k => { const m = await import('/js/screen-map.js'); m.showHunt(k); m.paintMap(); }, key);
	await new Promise(r => setTimeout(r, 2500));
	for (let z = 0; z < 2; z++) { await page.evaluate(async () => { const m = await import('/js/screen-map.js'); m.mapZoomStep(1); }); await new Promise(r => setTimeout(r, 1500)); }
	await new Promise(r => setTimeout(r, 2000));
	const cx = box.x + box.w * 0.55, cy = box.y + box.h * 0.5;
	for (let round = 0; round < 2; round++) {
	await page.tracing.start({ path: out + key + '.json', categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc'] });
	const t0 = Date.now();
	await page.mouse.move(cx, cy); await page.mouse.down();
	for (let i = 1; i <= 40; i++) { await page.mouse.move(cx + Math.sin(i / 4) * 200, cy + Math.cos(i / 4) * 120); await new Promise(r => setTimeout(r, 16)); }
	await page.mouse.up();
	const ms = Date.now() - t0;
	await page.tracing.stop();
	const tr = JSON.parse(fs.readFileSync(out + key + '.json', 'utf8'));
	const sum = {};
	for (const e of tr.traceEvents) if (e.ph === 'X' && e.dur) sum[e.name] = (sum[e.name] || 0) + e.dur / 1000;
	const pick = ['RunTask', 'Commit', 'LayerTreeHost::DoUpdateLayers', 'Canvas2DResourceProviderSharedImage::ProduceCanvasResource', 'RasterizerTaskImpl::RunOnWorkerThread', 'Paint', 'Layout'].map(k => `${k.split('::').pop().slice(0, 14)} ${(sum[k] || 0).toFixed(0)}`).join(' · ');
	console.log(key.padEnd(14), 'round', round, 'drag', ms, 'ms', '|', pick);
	}
	await page.evaluate(async k => { const m = await import('/js/screen-map.js'); m.setMapHunt(k); m.paintMap(); }, key);
}
await browser.close(); server.close();
