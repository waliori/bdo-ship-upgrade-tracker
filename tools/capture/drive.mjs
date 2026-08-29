// A tiny driver for the README captures.
//
// Headless Chrome does not draw a pointer, so a fake one is injected into
// the page and moved alongside the real mouse: the recording shows where
// the click lands, and the app still gets genuine hover and click events.

import puppeteer from 'puppeteer-core';

// Override for a different Chrome or a different port:
//   CHROME=/usr/bin/chromium PORT=9000 node scenes.mjs out
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PORT = process.env.PORT || 8765;
export const wait = ms => new Promise(r => setTimeout(r, ms));

const CURSOR = `
(() => {
	const draw = () => {
		if (document.getElementById('__cur')) return;
		const c = document.createElement('div');
		c.id = '__cur';
		if (window.__touch) c.classList.add('touch');
		c.innerHTML = \`<svg width="22" height="26" viewBox="0 0 22 26" fill="none">
			<path d="M2 1.5 L2 21 L7 16.5 L10.5 24 L14 22.5 L10.5 15 L17 15 Z"
				fill="#ffffff" stroke="#0b1a2c" stroke-width="1.6" stroke-linejoin="round"/>
		</svg><i></i>\`;
		document.body.appendChild(c);

		// A caption bar, so a clip can say what it is doing. Rendered in
		// the page rather than burned in afterwards, so it picks up the
		// app's own typography and looks like part of it.
		const cap = document.createElement('div');
		cap.id = '__cap';
		cap.innerHTML = '<span></span>';
		document.body.appendChild(cap);

		const css = document.createElement('style');
		css.textContent = \`
			#__cur { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none;
				transform: translate(60px, 60px); transition: transform .5s cubic-bezier(.33,.1,.25,1);
				filter: drop-shadow(0 2px 4px rgba(0,0,0,.55)); }
			#__cur svg { display: block; transition: transform .12s ease; }
			#__cur.down svg { transform: scale(.82); }
			#__cur i { position: absolute; left: 1px; top: 1px; width: 0; height: 0; border-radius: 50%;
				background: rgba(120, 200, 255, .5); transform: translate(-50%, -50%); }
			#__cur.down i { animation: __ripple .45s ease-out; }
			@keyframes __ripple {
				from { width: 0; height: 0; opacity: .9; }
				to { width: 54px; height: 54px; opacity: 0; }
			}
			#__cap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483646;
				display: flex; justify-content: center; padding: 0 16px 22px;
				pointer-events: none; opacity: 0; transition: opacity .28s ease; }
			#__cap.on { opacity: 1; }
			#__cap span { max-width: 760px; padding: 11px 20px; border-radius: 12px;
				background: rgba(6, 17, 30, .93); border: 1px solid rgba(120, 180, 230, .3);
				box-shadow: 0 10px 34px rgba(0,0,0,.5); backdrop-filter: blur(8px);
				font-family: 'Noto Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.45;
				color: #e8f2fb; text-align: center; }
			/* On a phone the pointer reads better as a fingertip. */
			#__cur.touch svg { display: none; }
			#__cur.touch { width: 34px; height: 34px; margin: -17px 0 0 -17px;
				border-radius: 50%; background: rgba(160, 215, 255, .34);
				border: 2px solid rgba(200, 235, 255, .85); }
			#__cur.touch i { left: 15px; top: 15px; }\`;
		document.head.appendChild(css);
	};
	if (document.body) draw();
	else document.addEventListener('DOMContentLoaded', draw);
})();`;

export async function open({ width = 1280, height = 820, touch = false, url = `http://localhost:${PORT}/` } = {}) {
	const browser = await puppeteer.launch({
		headless: true,
		executablePath: CHROME,
		args: ['--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1']
	});
	const page = await browser.newPage();
	await page.setViewport({ width, height, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(CURSOR);
	if (touch) await page.evaluateOnNewDocument('window.__touch = true;');
	page.on('pageerror', e => console.log('  PAGEERR', e.message));
	return { browser, page, url, touch };
}

/** Load the app with a given store payload already in place. */
export async function seed(page, url, state) {
	await page.goto(url, { waitUntil: 'networkidle0' });
	await page.evaluate(s => {
		localStorage.clear();
		localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true');
		localStorage.setItem('bdo-tracker/v1-imported', 'true');
		localStorage.setItem('bdo-tracker/v2', JSON.stringify(s));
	}, state);
	await page.goto(url, { waitUntil: 'networkidle0' });
	await wait(2600);
	await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * Where to aim, in viewport coordinates -- scrolling the target into
 * view first, since a pointer moved to an off-screen point fires no
 * hover at all.
 */
async function centreOf(page, sel) {
	const scrolled = await page.$eval(sel, el => {
		const r = el.getBoundingClientRect();
		if (r.top < 120 || r.bottom > window.innerHeight - 60) {
			el.scrollIntoView({ block: 'center', behavior: 'smooth' });
			return true;
		}
		return false;
	});
	if (scrolled) await wait(800);
	return page.$eval(sel, el => {
		const r = el.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	});
}

/** Glide the pointer onto something and let hover states settle. */
export async function moveTo(page, sel, { settle = 620 } = {}) {
	const at = await centreOf(page, sel);
	await page.evaluate(p => {
		document.getElementById('__cur').style.transform = `translate(${p.x}px, ${p.y}px)`;
	}, at);
	await page.mouse.move(at.x, at.y);
	await wait(settle);
	return at;
}

export async function click(page, sel, { after = 700 } = {}) {
	await moveTo(page, sel);
	await page.evaluate(() => document.getElementById('__cur').classList.add('down'));
	await wait(140);
	await page.click(sel);
	await page.evaluate(() => document.getElementById('__cur').classList.remove('down'));
	await wait(after);
}

/** Click into a field, clear it, and type at a human pace. */
export async function typeInto(page, sel, text, { after = 800 } = {}) {
	await click(page, sel, { after: 200 });
	await page.evaluate(s => {
		const el = document.querySelector(s);
		el.select();
	}, sel);
	await page.keyboard.press('Backspace');
	await page.type(sel, text, { delay: 105 });
	await wait(350);
	await page.keyboard.press('Tab');
	await wait(after);
}

export const tab = (page, id) => click(page, `[data-act="view"][data-id="${id}"]`, { after: 900 });

/**
 * Put a line on screen, and leave it there.
 *
 * Reading rate is the thing to get right: too fast and the clip is
 * useless, too slow and it drags. Roughly 14 characters a second with a
 * floor, which lands close to a comfortable subtitle.
 */
export async function say(page, text, { hold = null } = {}) {
	await page.evaluate(t => {
		const cap = document.getElementById('__cap');
		cap.querySelector('span').textContent = t;
		cap.classList.toggle('on', Boolean(t));
	}, text);
	if (text) await wait(hold ?? Math.max(1500, Math.round(text.length * 70)));
}

/** Clear the caption and wait for it to fade. */
export async function hush(page) {
	await page.evaluate(() => document.getElementById('__cap').classList.remove('on'));
	await wait(320);
}

/**
 * Press, glide, release -- the map's pan gesture.
 *
 * The pointer is walked through intermediate points so the app sees a
 * real drag, not a teleport. The fake cursor's easing is made tight for
 * the duration: at its usual half-second glide it would trail the real
 * pointer by half the gesture and the recording would show the sea
 * moving before the hand does.
 */
export async function drag(page, sel, dx, dy, { steps = 24, after = 700 } = {}) {
	const from = await moveTo(page, sel);
	await page.evaluate(() => {
		const cur = document.getElementById('__cur');
		cur.classList.add('down');
		cur.style.transition = 'transform .06s linear';
	});
	await page.mouse.down();
	for (let i = 1; i <= steps; i++) {
		const at = { x: from.x + dx * i / steps, y: from.y + dy * i / steps };
		await page.evaluate(p => {
			document.getElementById('__cur').style.transform = `translate(${p.x}px, ${p.y}px)`;
		}, at);
		await page.mouse.move(at.x, at.y);
		await wait(30);
	}
	await page.mouse.up();
	await page.evaluate(() => {
		const cur = document.getElementById('__cur');
		cur.classList.remove('down');
		cur.style.transition = '';
	});
	await wait(after);
}
