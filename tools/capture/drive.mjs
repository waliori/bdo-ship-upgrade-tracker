// A tiny driver for the README captures.
//
// Headless Chrome does not draw a pointer, so a fake one is injected into
// the page and moved alongside the real mouse: the recording shows where
// the click lands, and the app still gets genuine hover and click events.

import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { RELEASE } from '../../js/about.js';
import * as voice from './voice.mjs';

// Override for a different Chrome or a different port:
//   CHROME=/usr/bin/chromium PORT=9000 node scenes.mjs out
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const PORT = process.env.PORT || 8765;
export const wait = ms => new Promise(r => setTimeout(r, ms));

/**
 * How long the pointer takes to glide onto a thing before pressing it.
 *
 * The README scenes are cut at 620ms and stay there -- this is their
 * pace, and it reads well in a six-second GIF. A narrated chapter makes
 * sixty of these presses, though, where the same 620 is half a minute
 * of watching a cursor travel, so `guide.sh` winds it down.
 */
const GLIDE = Number(process.env.GLIDE || 620);

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

		// A chapter card. The guide films are a series, and a viewer
		// dropped into the middle of one should be told which part they
		// are watching before anything moves.
		const card = document.createElement('div');
		card.id = '__card';
		card.innerHTML = '<div><b></b><i></i></div>';
		if (window.__touch) card.classList.add('phone');
		document.body.appendChild(card);

		// A still from the game itself. Half of what this app does is
		// answer a question about a window in Black Desert, and the
		// honest way to show that is to put the window on screen.
		const still = document.createElement('figure');
		still.id = '__still';
		still.innerHTML = '<img alt=""><figcaption></figcaption>';
		document.body.appendChild(still);

		// The spotlight: a box the size of one control, with everything
		// outside it dimmed. A narrated chapter names a great many small
		// things -- a bar, a row of boxes, one button among nine -- and
		// saying "this bar" over an undifferentiated screenshot of the
		// whole app tells nobody which bar.
		const spot = document.createElement('div');
		spot.id = '__spot';
		document.body.appendChild(spot);

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
			/* The chapter card: the app dimmed behind it, so the frame is
			   still recognisably this app and not a title sequence. */
			#__card { position: fixed; inset: 0; z-index: 2147483645;
				display: flex; align-items: center; justify-content: center;
				background: rgba(4, 12, 22, .82); backdrop-filter: blur(3px);
				opacity: 0; transition: opacity .45s ease; pointer-events: none; }
			#__card.on { opacity: 1; }
			#__card > div { text-align: center; padding: 0 32px;
				font-family: 'Chakra Petch', 'Noto Sans', system-ui, sans-serif; }
			#__card b { display: block; font-size: 54px; font-weight: 700;
				letter-spacing: .4px; color: #eef6fd;
				text-shadow: 0 4px 24px rgba(0,0,0,.6); }
			#__card i { display: block; margin-top: 14px; font-style: normal;
				font-size: 25px; font-weight: 500; letter-spacing: .2px;
				color: rgba(170, 205, 235, .95); }
			#__card.phone b { font-size: 34px; }
			#__card.phone i { font-size: 17px; margin-top: 10px; }
			/* A game screenshot, held over the dimmed app. Bounded by the
			   viewport on both axes so a tall window and a wide one are
			   both whole -- a still that is cropped to fit is worse than
			   no still, since the point of it is a thing you are meant
			   to read. */
			#__still { position: fixed; inset: 0; z-index: 2147483644; margin: 0;
				display: flex; flex-direction: column; align-items: center;
				justify-content: center; gap: 14px; padding: 42px 42px 120px;
				background: rgba(4, 12, 22, .9); backdrop-filter: blur(4px);
				opacity: 0; transition: opacity .4s ease; pointer-events: none; }
			#__still.on { opacity: 1; }
			#__still img { max-width: 100%; max-height: 100%; object-fit: contain;
				border-radius: 10px; border: 1px solid rgba(120, 180, 230, .3);
				box-shadow: 0 18px 60px rgba(0,0,0,.7); }
			#__still figcaption { display: none; font-family: 'Noto Sans', system-ui, sans-serif;
				font-size: 19px; font-weight: 600; color: rgba(180, 212, 240, .96); }
			#__still.titled figcaption { display: block; }
			/* One control lit, the rest of the page dimmed. The dimming is
			   a 9999px shadow spread rather than four rectangles or a
			   clip-path: one element, and it animates from one control to
			   the next instead of blinking between them. */
			#__spot { position: fixed; left: 0; top: 0; width: 0; height: 0;
				z-index: 2147483643; pointer-events: none; border-radius: 10px;
				border: 2px solid rgba(150, 210, 255, .95);
				box-shadow: 0 0 0 9999px rgba(4, 12, 22, .74),
					0 0 22px 3px rgba(120, 195, 255, .45);
				opacity: 0;
				transition: opacity .3s ease, left .34s cubic-bezier(.33,.1,.25,1),
					top .34s cubic-bezier(.33,.1,.25,1), width .34s ease, height .34s ease; }
			#__spot.on { opacity: 1; }
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
async function pick(page, sel, { upTo = 2500 } = {}) {
	if (typeof sel !== 'string') return sel;
	const end = Date.now() + upTo;
	for (;;) {
		const els = await page.$$(sel);
		let sized = null;              // on the page, but something is over it
		for (const el of els) {
			let how = 'gone';
			try {
				how = await el.evaluate(e => {
					const r = e.getBoundingClientRect();
					if (!(r.width > 0 && r.height > 0)) return 'gone';
					// Sized is not the same as reachable. Full screen puts
					// the chart over the page, and the page's own toolbar
					// keeps its width and height underneath it -- so the
					// old test picked a button that was there, measured
					// fine, and swallowed every click into the overlay on
					// top of it. Ask the document what is actually at that
					// point instead. The injected cursor, caption, card,
					// still and spotlight are all pointer-events: none, so
					// none of them answers here.
					const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
					return top === e || e.contains(top) || (top && top.contains(e)) ? 'free' : 'under';
				});
			} catch {
				// The node was replaced between the query and the measure.
				// A handle to a detached element answers nothing, so this
				// is not an error -- it is the page having moved on.
			}
			if (how === 'free') {
				if (sized) await sized.dispose();
				return el;
			}
			// Kept as a fallback rather than dropped: a control can be
			// covered by something harmless -- a tooltip, a shadow -- and
			// clicking it still works. Better to press the covered one
			// than to report that nothing matches.
			if (how === 'under' && !sized) sized = el;
			else await el.dispose();
		}
		if (sized) return sized;
		// Every screen here is rendered from state, so a section that is
		// on the page can still be a different element a moment later --
		// a save landing, a clock rolling over, a mode switch redrawing
		// the panel. A miss is therefore worth asking about again before
		// it is called a miss: without this the film dies at whichever
		// click happened to land in the same millisecond as a re-render,
		// which is a different one every time it is shot.
		if (Date.now() > end) throw new Error(`nothing visible matches ${sel}`);
		await wait(100);
	}
}

/**
 * Whether anything visible answers to a selector, without throwing.
 *
 * Asked once, not waited on: this is how a scene tells a wide screen
 * from a phone, and both answers are ordinary. Waiting two seconds for
 * the answer "no" would put that wait on every tab press of the phone
 * cut.
 */
export async function onScreen(page, sel, { upTo = 0 } = {}) {
	try {
		const el = await pick(page, sel, { upTo });
		if (typeof sel === 'string') await el.dispose();
		return true;
	} catch {
		return false;
	}
}

/**
 * Wait for something to be on the screen -- the runs worth sailing land
 * from a worker a second or two after the board is known, and a scene
 * that presses on before they do finds no run to lay out.
 */
export async function waitFor(page, sel, { upTo = 12000, then = 0 } = {}) {
	const end = Date.now() + upTo;
	while (!(await onScreen(page, sel))) {
		if (Date.now() > end) throw new Error(`still nothing visible matching ${sel} after ${upTo} ms`);
		await wait(200);
	}
	if (then) await wait(then);
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

/**
 * Aim at something and press it.
 *
 * A handle can go stale between being found and being pressed: every
 * screen here is drawn from state, so a save landing or a clock rolling
 * over replaces the very node the pointer just glided onto, and the
 * click lands on an element no longer in the document. `pick` already
 * asks again when it cannot *find* a match; this is the same courtesy
 * one step later, for a match that was found and then swapped out.
 *
 * Only ever retried on that one error, and only from a fresh `pick`.
 * Puppeteer raises it while asserting the node is still connected --
 * before any event is dispatched -- so a retry cannot press twice.
 */
export async function click(page, sel, { after = 700, tries = 3 } = {}) {
	for (let go = 1; ; go++) {
		const el = await pick(page, sel);
		const at = await centreOf(page, el);
		await aim(page, at);
		await wait(GLIDE);
		await press(page);
		await wait(140);
		try {
			await el.click();
		} catch (e) {
			await lift(page);
			if (go >= tries || !/detached|not connected/i.test(e.message)) throw e;
			// Redrawn under the pointer. Let it settle and go again.
			await wait(400);
			continue;
		}
		await lift(page);
		await wait(after);
		return;
	}
}

/**
 * Click the first visible match whose text contains every fragment given.
 *
 * A filtered list is ordered by the app's own idea of relevance, not by
 * what a film needs, so "the first row after typing Cherry Tree" is
 * whichever trade the app ranks first -- which was Powder of Darkness
 * where the screenshot beside it said Essence of Liquor. Naming both
 * ends of the trade is the only way to press the row a viewer is
 * looking at in the game window.
 */
export async function clickText(page, sel, needles, { after = 700 } = {}) {
	const want = [].concat(needles).map(w => w.toLowerCase());
	for (const el of await page.$$(sel)) {
		const txt = (await el.evaluate(e => e.innerText || '')).toLowerCase();
		if (want.every(w => txt.includes(w))) return click(page, el, { after });
	}
	throw new Error(`no ${sel} containing ${want.join(' + ')}`);
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
	await wait(GLIDE * 0.84);
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
	// Asked for with a budget rather than once. The shell redraws on its
	// own -- a clock ticking over, the market answering, a save landing
	// -- and a tab press that happened to land inside one of those
	// redraws used to decide the row was not there at all and go looking
	// for the phone's sheet, which on a wide screen is not there either.
	// A phone pays the budget before falling through, which is the right
	// way round: a wide screen is the common case and never waits.
	if (await onScreen(page, sel, { upTo: 1200 })) return click(page, sel, { after });
	await click(page, '[data-act="tab-sheet"]', { after: 700 });
	await click(page, sel, { after });
}

/**
 * A masthead button -- Find, Log a trip, Undo, Redo.
 *
 * On a phone Find and the log live in the menu, and using one closes
 * it again, so it is opened for each rather than once.
 */
export async function headerBtn(page, act, { after = 900 } = {}) {
	const sel = `[data-act="${act}"]`;
	if (!(await onScreen(page, sel))) await click(page, '[data-act="more"]', { after: 560 });
	await click(page, sel, { after });
}

/* ------------------------------------------------------------------ *
 * the tape, and the narration laid along it
 * ------------------------------------------------------------------ */

/**
 * The film being shot, if one is.
 *
 * Module state rather than something threaded through every verb,
 * because the whole point is that a narrated chapter reads exactly like
 * the silent scenes do: `say(page, '...')` and nothing else. A scene
 * shot without `film()` around it -- every README clip -- finds no reel
 * here and falls back to holding the caption for a reading time, which
 * is what those clips have always done.
 */
let reel = null;

/**
 * The beat of silence left after a line finishes.
 *
 * Narration that butts one sentence against the next is exhausting to
 * listen to, and the pictures need a moment to be looked at anyway.
 */
const GAP = Number(process.env.VOICE_GAP || 280);

/**
 * How far the recording lags the moment `screencast()` hands back.
 *
 * Chrome is asked for frames and then starts sending them, so the tape's
 * time zero is a little after this process thinks it started rolling.
 * Everything downstream is measured from that same instant, so a wrong
 * value here slides the whole soundtrack rather than smearing it --
 * one number to calibrate, not a per-line problem.
 *
 * Measured at -84ms here, by flipping a full-screen div from black to
 * white at a known moment and asking ffmpeg's blackdetect when the
 * black ended: the flip at wall +2004ms landed at 1.92s of video. Two
 * frames' worth, and rounded to -80 because a 25fps screencast cannot
 * resolve finer than 40ms anyway.
 */
const LEAD = Number(process.env.VOICE_LEAD || -80);

/**
 * Start the tape, and the timeline the narration is laid on.
 *
 * Returns nothing useful on purpose: the reel is module state, and what
 * a caller wants back is at `cut()`, when the line list is complete.
 */
export async function film(page, path, { fps = 25, narrate = true } = {}) {
	const rec = await page.screencast({ path, fps });
	reel = { rec, path, narrate, lines: [], t0: Date.now() };
}

/**
 * Stop the tape and hand back what was said and when.
 *
 * The trailing beat is the same one every README clip ends on -- a
 * moment to read the result before it loops or cuts away.
 */
export async function cut({ tail = 900 } = {}) {
	const r = reel;
	reel = null;
	await wait(tail);
	await r.rec.stop();
	return { path: r.path, ms: Date.now() - r.t0, lead: LEAD, lines: r.lines };
}

/**
 * Put a line on screen, say it aloud, and leave it there.
 *
 * With a film rolling the hold is the length of the synthesised audio,
 * so a beat lasts exactly as long as its sentence takes to speak and
 * the pictures can never drift from the words. Without one -- the
 * README clips, which are silent GIFs -- it falls back to a reading
 * rate: roughly 17 characters a second with a floor, the upper end of
 * what a broadcast subtitle asks of a reader, which this one can afford
 * because it is set half again as large.
 */
export async function say(page, text, { hold = null } = {}) {
	const cue = reel && reel.narrate && text ? await voice.clip(text) : null;
	await page.evaluate(t => {
		const cap = document.getElementById('__cap');
		cap.querySelector('span').textContent = t;
		cap.classList.toggle('on', Boolean(t));
	}, text);
	if (!text) return;
	if (cue) {
		// Timed from after the caption is up, so the word and the line
		// under it arrive together.
		reel.lines.push({ text, at: Date.now() - reel.t0, ms: cue.ms, file: cue.path });
		await wait(cue.ms + GAP);
	} else {
		await wait(hold ?? Math.max(1400, Math.round(text.length * 58)));
	}
}

/**
 * Say a line *while* doing the thing it describes.
 *
 * `say` followed by an action means the narrator describes something
 * and then, in silence, it happens -- which is most of what makes a
 * screencast feel slow, and worse, means the sentence is always about
 * a screen that has not changed yet. Here the caption goes up, the
 * clock starts, and the interaction runs against the same stretch of
 * audio, so the pointer is moving while the words are being said.
 *
 * The beat is over when both are: a line longer than its action holds
 * on the result, and an action longer than its line simply finishes.
 */
export async function doing(page, text, act) {
	const cue = reel && reel.narrate && text ? await voice.clip(text) : null;
	await page.evaluate(t => {
		const cap = document.getElementById('__cap');
		cap.querySelector('span').textContent = t;
		cap.classList.toggle('on', Boolean(t));
	}, text);
	const from = Date.now();
	if (cue) reel.lines.push({ text, at: from - reel.t0, ms: cue.ms, file: cue.path });
	const hold = cue ? cue.ms + GAP : Math.max(1400, Math.round(text.length * 58));
	if (act) await act();
	const left = hold - (Date.now() - from);
	if (left > 0) await wait(left);
}

/**
 * Light one thing up and talk about it.
 *
 * Scrolls the target into view first, which is the other half of the
 * job: a line that says "these boxes keep goods back" is worse than
 * useless if the boxes are eight hundred pixels below the fold. `pick`
 * finds it, `centreOf` brings it on screen, and the box is measured
 * only once both have happened.
 *
 * `act` runs against the same stretch of audio, the way `doing` does,
 * for the cases where the thing being pointed at is also being used.
 */
export async function spot(page, sel, text, { pad = 10, act = null, hold = null } = {}) {
	const el = await pick(page, sel);
	await centreOf(page, el);
	const box = await el.evaluate(e => {
		const r = e.getBoundingClientRect();
		return { x: r.left, y: r.top, w: r.width, h: r.height };
	});
	await page.evaluate((b, p) => {
		const s = document.getElementById('__spot');
		s.style.left = `${b.x - p}px`;
		s.style.top = `${b.y - p}px`;
		s.style.width = `${b.w + p * 2}px`;
		s.style.height = `${b.h + p * 2}px`;
		s.classList.add('on');
	}, box, pad);
	await wait(340);
	if (text) await doing(page, text, act);
	else {
		if (act) await act();
		await wait(hold ?? 1400);
	}
	await page.evaluate(() => document.getElementById('__spot').classList.remove('on'));
	await wait(260);
}

/**
 * Light up everything that answers to a selector, as one box.
 *
 * `spot` lights the first match, which is right for "this button" and
 * wrong for "these steps" -- a line about a list that boxes only its
 * first row says something the picture contradicts. This measures the
 * union of every visible match instead.
 *
 * The group is scrolled so its head sits near the top rather than
 * centred, because a list is read downwards; where the union is taller
 * than the frame the box is clipped to the frame, which reads as "these,
 * and more below it" rather than as a box with no bottom edge.
 */
export async function spotAll(page, sel, text, { pad = 10, act = null, hold = null, top = 104 } = {}) {
	const first = await pick(page, sel);
	await first.evaluate((e, t) => {
		const y = e.getBoundingClientRect().top + window.scrollY - t;
		window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
	}, top);
	await wait(760);
	// A second look, and a nudge. Putting the head of the group near the
	// top is right when the group is taller than the frame and wrong when
	// it only just overhangs it -- four slot cards with the fourth cut off
	// by the caption is a box that contradicts a line about four things.
	// Where the whole of it would fit under the caption, scroll the
	// overhang away before measuring for real.
	const over = await page.evaluate((sel, floorPad) => {
		const seen = [...document.querySelectorAll(sel)].map(e => e.getBoundingClientRect()).filter(r => r.width > 0);
		if (!seen.length) return 0;
		const top = Math.min(...seen.map(r => r.top));
		const bottom = Math.max(...seen.map(r => r.bottom));
		const floor = window.innerHeight - floorPad;
		// Only worth doing if it fits once moved: a group taller than the
		// band is clipped whatever we do, and scrolling it merely hides
		// the head as well as the tail.
		if (bottom <= floor || bottom - top > floor - 16) return 0;
		return Math.min(bottom - floor, top - 16);
	}, sel, 150);
	if (over > 0) {
		await page.evaluate(y => window.scrollBy({ top: y, behavior: 'smooth' }), over);
		await wait(620);
	}
	const box = await page.evaluate((s, p) => {
		const seen = [...document.querySelectorAll(s)]
			.map(e => e.getBoundingClientRect())
			.filter(r => r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight);
		if (!seen.length) return null;
		const x = Math.min(...seen.map(r => r.left));
		const y = Math.min(...seen.map(r => r.top));
		const right = Math.max(...seen.map(r => r.right));
		const bottom = Math.max(...seen.map(r => r.bottom));
		// The caption sits along the bottom of the frame, so a box drawn
		// under it is a box nobody sees the edge of.
		const floor = window.innerHeight - 150;
		return { x: x - p, y: Math.max(8, y - p), w: right - x + p * 2, h: Math.min(bottom + p, floor) - Math.max(8, y - p) };
	}, sel, pad);
	await first.dispose();
	if (!box) return say(page, text);
	await page.evaluate(b => {
		const s = document.getElementById('__spot');
		s.style.left = `${b.x}px`;
		s.style.top = `${b.y}px`;
		s.style.width = `${b.w}px`;
		s.style.height = `${b.h}px`;
		s.classList.add('on');
	}, box);
	await wait(340);
	if (text) await doing(page, text, act);
	else {
		if (act) await act();
		await wait(hold ?? 1400);
	}
	await page.evaluate(() => document.getElementById('__spot').classList.remove('on'));
	await wait(260);
}

/**
 * A chapter card, over the dimmed app.
 *
 * `line` is spoken while it is up, which is what keeps a series from
 * opening every part on two seconds of silence; without a film rolling
 * it simply holds long enough to be read.
 */
export async function card(page, title, sub = '', { line = '', hold = 2400 } = {}) {
	await page.evaluate((t, u) => {
		const c = document.getElementById('__card');
		c.querySelector('b').textContent = t;
		c.querySelector('i').textContent = u;
		c.classList.add('on');
	}, title, sub);
	await wait(520);
	if (line) await say(page, line);
	else await wait(hold);
	await page.evaluate(() => document.getElementById('__card').classList.remove('on'));
	if (line) await hush(page);
	await wait(520);
}

/** Clear the caption and wait for it to fade. */
export async function hush(page) {
	await page.evaluate(() => document.getElementById('__cap').classList.remove('on'));
	await wait(320);
}

/**
 * Hold a screenshot of the game over the app.
 *
 * Read off disk and handed over as a data URI rather than fetched: the
 * capture server serves the app, not this harness's own folder, and a
 * still that only appears when the file happens to be reachable is a
 * still that will silently stop appearing.
 *
 * `line` is spoken while it is up, so a beat that says "this is the
 * window the app is asking you about" can show that window as it says
 * it.
 */
export async function still(page, file, { line = '', label = '', hold = 2800 } = {}) {
	const bytes = await readFile(file);
	const ext = /\.png$/i.test(file) ? 'png' : /\.jpe?g$/i.test(file) ? 'jpeg' : 'webp';
	await page.evaluate((src, cap) => {
		const s = document.getElementById('__still');
		s.querySelector('img').src = src;
		s.querySelector('figcaption').textContent = cap;
		s.classList.toggle('titled', Boolean(cap));
		s.classList.add('on');
	}, `data:image/${ext};base64,${bytes.toString('base64')}`, label);
	await wait(640);
	if (line) await say(page, line);
	else await wait(hold);
	await page.evaluate(() => document.getElementById('__still').classList.remove('on'));
	if (line) await hush(page);
	await wait(460);
}

/**
 * Answer a dropdown.
 *
 * The pointer is walked onto it and pressed, because a select that
 * changes with no hand near it reads as the film doing something to
 * itself. Headless Chrome will not open a native select's list, so
 * what the recording shows is the box and its new value -- which is
 * the part that matters, and the sentence under it changing with it.
 */
export async function choose(page, sel, value, { after = 1000 } = {}) {
	const el = await pick(page, sel);
	const at = await centreOf(page, el);
	await aim(page, at);
	await wait(GLIDE * 0.9);
	await press(page);
	await wait(160);
	await el.select(String(value));
	await lift(page);
	await repaint(page);
	await wait(after);
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
export async function drag(page, sel, dx, dy, { steps = 24, after = 700, from = null, hold = null } = {}) {
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
	// A modifier held for the length of the gesture: the chart leans
	// under shift-drag, and pans under the same drag without it.
	if (hold) await page.keyboard.down(hold);
	await page.mouse.down();
	for (let i = 1; i <= steps; i++) {
		const at = { x: start.x + dx * i / steps, y: start.y + dy * i / steps };
		await aim(page, at);
		await wait(30);
	}
	await page.mouse.up();
	if (hold) await page.keyboard.up(hold);
	await page.evaluate(() => {
		const cur = document.getElementById('__cur');
		cur.classList.remove('down');
		cur.style.transition = '';
	});
	await wait(after);
}
