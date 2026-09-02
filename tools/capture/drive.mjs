// A tiny driver for the README captures.
//
// Headless Chrome does not draw a pointer, so a fake one is injected into
// the page and moved alongside the real mouse: the recording shows where
// the click lands, and the app still gets genuine hover and click events.

import puppeteer from 'puppeteer-core';
import { RELEASE } from '../../js/about.js';

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
		if (window.__touch) cap.classList.add('phone');
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
			/* Sized to be read, not to be tidy. These clips get watched in a
			   README at half width and on a phone held at arm's length, so
			   the caption is set at roughly twice the app's body text and
			   the bar is allowed to be as wide as the frame. */
			#__cap { position: fixed; left: 0; right: 0; bottom: 0; z-index: 2147483646;
				display: flex; justify-content: center; padding: 0 14px 26px;
				pointer-events: none; opacity: 0; transition: opacity .28s ease; }
			#__cap.on { opacity: 1; }
			#__cap span { max-width: 1080px; padding: 15px 28px; border-radius: 14px;
				background: rgba(6, 17, 30, .95); border: 1px solid rgba(120, 180, 230, .34);
				box-shadow: 0 12px 40px rgba(0,0,0,.55); backdrop-filter: blur(8px);
				font-family: 'Noto Sans', system-ui, sans-serif; font-size: 27px; line-height: 1.32;
				font-weight: 600; letter-spacing: .1px;
				color: #eef6fd; text-align: center; text-wrap: balance; }
			/* A phone frame is a third the width, so the same 27px would
			   wrap to four lines and cover the screen it is describing. */
			#__cap.phone { padding: 0 10px 18px; }
			#__cap.phone span { padding: 11px 16px; border-radius: 12px;
				font-size: 20px; line-height: 1.3; }
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

/**
 * Load the app with a given store payload already in place.
 *
 * The seed must land before any app code runs: the app keeps its state
 * in memory and writes it back on a debounce and on unload, so a value
 * planted after load is clobbered with the copy the page started on.
 * Registered scripts stack, so a later seed on the same page wins by
 * running last. The release key keeps What's New out of the frame, and
 * `networkidle0` is gone with the double goto -- the icon and tile tail
 * keeps the wire warm long past `load`.
 */
export async function seed(page, url, state) {
	await page.evaluateOnNewDocument((s, release) => {
		localStorage.clear();
		localStorage.setItem('bdo_ship_upgrade-tour_completed', 'true');
		localStorage.setItem('bdo-tracker/v1-imported', 'true');
		localStorage.setItem('bdo-tracker/release', release);
		localStorage.setItem('bdo-tracker/v2', JSON.stringify(s));
	}, state, RELEASE);
	await page.goto(url, { waitUntil: 'load' });
	await wait(2600);
	await page.evaluate(() => window.scrollTo(0, 0));
}

/**
 * The first match that is actually on the screen.
 *
 * Some controls have two copies in the page at once: a section button
 * lives both in the row above -- hidden below 640px -- and in the bar at
 * the thumb, and the "All" sheet adds a third. A selector alone is then
 * ambiguous, and aiming at the hidden one clicks nothing at all, so the
 * clip comes out showing a dead press.
 */
async function pick(page, sel) {
	if (typeof sel !== 'string') return sel;
	const els = await page.$$(sel);
	for (const el of els) {
		const on = await el.evaluate(e => {
			const r = e.getBoundingClientRect();
			return r.width > 0 && r.height > 0;
		});
		if (on) return el;
		await el.dispose();
	}
	throw new Error(`nothing visible matches ${sel}`);
}

/** Whether anything visible answers to a selector, without throwing. */
export async function onScreen(page, sel) {
	try {
		await pick(page, sel);
		return true;
	} catch {
		return false;
	}
}

/**
 * Where to aim, in viewport coordinates -- scrolling the target into
 * view first, since a pointer moved to an off-screen point fires no
 * hover at all.
 */
async function centreOf(page, el) {
	const scrolled = await el.evaluate(e => {
		const r = e.getBoundingClientRect();
		if (r.top < 120 || r.bottom > window.innerHeight - 60) {
			e.scrollIntoView({ block: 'center', behavior: 'smooth' });
			return true;
		}
		return false;
	});
	if (scrolled) await wait(800);
	return el.evaluate(e => {
		const r = e.getBoundingClientRect();
		return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
	});
}

/** Put the drawn pointer somewhere, gliding, and move the real one with it. */
async function aim(page, at) {
	await page.evaluate(p => {
		document.getElementById('__cur').style.transform = `translate(${p.x}px, ${p.y}px)`;
	}, at);
	await page.mouse.move(at.x, at.y);
}

/** Glide the pointer onto something and let hover states settle. */
export async function moveTo(page, sel, { settle = 620 } = {}) {
	const el = await pick(page, sel);
	const at = await centreOf(page, el);
	await aim(page, at);
	await wait(settle);
	return at;
}

const press = page => page.evaluate(() => document.getElementById('__cur').classList.add('down'));
const lift = page => page.evaluate(() => document.getElementById('__cur').classList.remove('down'));

export async function click(page, sel, { after = 700 } = {}) {
	const el = await pick(page, sel);
	const at = await centreOf(page, el);
	await aim(page, at);
	await wait(620);
	await press(page);
	await wait(140);
	await el.click();
	await lift(page);
	await wait(after);
}

/**
 * Click a bare point on the chart, given as a fraction of the map's box.
 *
 * The sea carries no selectors -- a traced stop or a written word goes
 * wherever the click lands -- so a scene has to name a place the only
 * way there is: a fraction across and a fraction down whatever the
 * chart is showing.
 */
export async function clickIn(page, sel, fx, fy, { after = 650 } = {}) {
	const el = await pick(page, sel);
	const box = await el.boundingBox();
	const at = { x: box.x + box.width * fx, y: box.y + box.height * fy };
	await aim(page, at);
	await wait(520);
	await press(page);
	await wait(140);
	await page.mouse.click(at.x, at.y);
	await lift(page);
	await wait(after);
	return at;
}

/**
 * Force the whole page to be drawn again.
 *
 * Headless Chrome's screencast captures the composited surface, and a
 * repaint driven by a keyboard event -- a typed value committing on
 * blur -- can leave those tiles stale while a layer of its own, like
 * the fake cursor, goes on updating. Waiting does not help: the frames
 * keep coming, and every one of them shows the number you just
 * replaced. Nudging an inherited property invalidates the lot, and at
 * a thousandth of an opacity it moves nothing on screen, so it costs
 * the GIF nothing either.
 */
async function repaint(page) {
	await page.evaluate(() => { document.body.style.opacity = '0.999'; });
	await wait(120);
	await page.evaluate(() => { document.body.style.opacity = ''; });
	await wait(160);
}

/** Click into a field, clear it, and type at a human pace. */
export async function typeInto(page, sel, text, { after = 800 } = {}) {
	const el = await pick(page, sel);
	await click(page, el, { after: 200 });
	await el.evaluate(e => e.select());
	await page.keyboard.press('Backspace');
	await page.keyboard.type(text, { delay: 105 });
	await wait(350);
	// Tab commits it: the field's change event is what the app listens for.
	await page.keyboard.press('Tab');
	await repaint(page);
	await wait(after);
}

/**
 * Go to a section.
 *
 * A wide screen has the row of nine above the page. A phone has four at
 * the thumb and the rest behind "All", so the same press is sometimes
 * two: open the sheet, then choose. Which it is depends only on what is
 * on the screen, so the scene never has to say.
 */
export async function tab(page, id, { after = 900 } = {}) {
	const sel = `[data-act="view"][data-id="${id}"]`;
	if (await onScreen(page, sel)) return click(page, sel, { after });
	await click(page, '[data-act="tab-sheet"]', { after: 700 });
	await click(page, sel, { after });
}

/**
 * A masthead button -- Find, Log a trip, Undo, Redo.
 *
 * On a phone they are folded behind the hamburger, and using one closes
 * it again, so it is opened for each rather than once.
 */
export async function headerBtn(page, act, { after = 900 } = {}) {
	const sel = `[data-act="${act}"]`;
	if (!(await onScreen(page, sel))) await click(page, '[data-act="menu"]', { after: 560 });
	await click(page, sel, { after });
}

/**
 * Put a line on screen, and leave it there.
 *
 * Reading rate is the thing to get right: too fast and the clip is
 * useless, too slow and it drags. Roughly 17 characters a second with a
 * floor -- the upper end of what a broadcast subtitle asks of a reader,
 * which this one can afford because it is set half again as large.
 */
export async function say(page, text, { hold = null } = {}) {
	await page.evaluate(t => {
		const cap = document.getElementById('__cap');
		cap.querySelector('span').textContent = t;
		cap.classList.toggle('on', Boolean(t));
	}, text);
	if (text) await wait(hold ?? Math.max(1400, Math.round(text.length * 58)));
}

/** Clear the caption and wait for it to fade. */
export async function hush(page) {
	await page.evaluate(() => document.getElementById('__cap').classList.remove('on'));
	await wait(320);
}

/**
 * Press, glide, release -- the map's pan gesture, and the Draw tab's pen.
 *
 * The pointer is walked through intermediate points so the app sees a
 * real drag, not a teleport. The fake cursor's easing is made tight for
 * the duration: at its usual half-second glide it would trail the real
 * pointer by half the gesture and the recording would show the sea
 * moving before the hand does.
 *
 * `from` starts the gesture at a fraction of the target's box instead of
 * its centre, which is how a stroke gets drawn somewhere in particular.
 */
export async function drag(page, sel, dx, dy, { steps = 24, after = 700, from = null } = {}) {
	let start;
	if (from) {
		const el = await pick(page, sel);
		const box = await el.boundingBox();
		start = { x: box.x + box.width * from[0], y: box.y + box.height * from[1] };
		await aim(page, start);
		await wait(520);
	} else {
		start = await moveTo(page, sel);
	}
	await page.evaluate(() => {
		const cur = document.getElementById('__cur');
		cur.classList.add('down');
		cur.style.transition = 'transform .06s linear';
	});
	await page.mouse.down();
	for (let i = 1; i <= steps; i++) {
		const at = { x: start.x + dx * i / steps, y: start.y + dy * i / steps };
		await aim(page, at);
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
