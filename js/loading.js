// The one way the app says "this is on its way".
//
// The chart had it first: a thread of light running along its top edge
// while tiles are in flight, and only once they have been in flight long
// enough to notice (js/map/paint.js). Everything else that waits on the
// wire or on a module -- the Market's prices, the boards, a shared link,
// the sync, a screenshot being read, a language pack -- waited in
// silence, and a press that answers a second later looked like a press
// that did nothing. This is that thread, for the whole page.
//
// Two shapes of it:
//
//   * `loading()` / `whileLoading()` for a wait in code: the thread runs
//     along the top of the window, the region it is for is marked
//     `aria-busy` so a screen reader knows its contents are about to
//     change, and the button that asked (if one is named) is marked too.
//     Waits stack -- two at once keep one thread running until both are
//     done -- and every one is ended in a `finally`, so an error ends it
//     as surely as an answer does.
//   * `loadingNote()` for a wait that is part of what a screen draws --
//     "fetching the boards…" in place of the boards. The same thread
//     runs under the words.
//
// Neither shows before LOADING_DELAY: a fast answer should look like an
// answer, not like a flicker of something that was about to be slow.

import { T } from './i18n.js';

/** How long a wait runs before it is shown at all, in milliseconds. */
export const LOADING_DELAY = 150;
// The chart waits longer: tiles arrive in bursts while it is zoomed and
// panned, and a thread that lit at every burst read as flicker. 300 ms
// was tuned on the chart itself.
export const MAP_LOADING_DELAY = 300;

const hasDOM = typeof document !== 'undefined';
// Every wait in flight, newest last: the bar says what the newest is.
const waits = [];
let bar = null;
let timer = null;
// The regions and buttons marked busy, and by how many waits each.
const marked = new Map();

function barEl() {
	if (bar && bar.isConnected) return bar;
	bar = document.createElement('div');
	bar.className = 'loadbar';
	bar.setAttribute('role', 'progressbar');
	bar.hidden = true;
	document.body.appendChild(bar);
	return bar;
}

function paint() {
	if (!hasDOM || !document.body) return;
	if (!waits.length) {
		clearTimeout(timer);
		timer = null;
		if (bar) {
			bar.classList.remove('on');
			bar.hidden = true;
		}
		return;
	}
	const el = barEl();
	el.setAttribute('aria-label', waits[waits.length - 1].label);
	// Shown once the oldest wait still running has been at it long
	// enough; a wait that ends first never draws anything.
	if (el.classList.contains('on') || timer) return;
	const since = Date.now() - waits[0].at;
	timer = setTimeout(() => {
		timer = null;
		if (!waits.length) return;
		el.hidden = false;
		el.classList.add('on');
	}, Math.max(0, LOADING_DELAY - since));
}

function mark(el, on) {
	if (!el || !el.setAttribute) return;
	const n = (marked.get(el) || 0) + (on ? 1 : -1);
	if (n > 0) {
		marked.set(el, n);
		el.setAttribute('aria-busy', 'true');
		return;
	}
	marked.delete(el);
	el.removeAttribute('aria-busy');
	el.classList.remove('is-busy');
}

/**
 * Start a wait; returns the function that ends it.
 *
 * `label` is what the bar is called to a screen reader -- already
 * translated, since it is a sentence of ours. `at` is the region whose
 * contents are on their way, `by` the button that asked; both are
 * marked `aria-busy` at once, and the button is drawn busy after the
 * same delay as the bar. Ending twice ends once.
 */
export function loading(label = '', { at = null, by = null } = {}) {
	const wait = { label: label || T('Loading…'), at: Date.now() };
	waits.push(wait);
	const els = [at, by].filter(Boolean);
	if (hasDOM) for (const el of els) mark(el, true);
	const btn = by && by.classList ? by : null;
	const btnTimer = btn ? setTimeout(() => { if (marked.has(btn)) btn.classList.add('is-busy'); }, LOADING_DELAY) : null;
	paint();
	let done = false;
	return () => {
		if (done) return;
		done = true;
		clearTimeout(btnTimer);
		const i = waits.indexOf(wait);
		if (i >= 0) waits.splice(i, 1);
		if (hasDOM) for (const el of els) mark(el, false);
		paint();
	};
}

/**
 * Run `work` -- a promise, or a function returning one -- under a wait,
 * and give back what it gives back. A failure is passed on unchanged,
 * to the error path the caller already has; the wait ends either way.
 */
export async function whileLoading(work, label = '', where = {}) {
	const stop = loading(label, where);
	try {
		return await (typeof work === 'function' ? work() : work);
	} finally {
		stop();
	}
}

/** Whether anything is waiting right now. For tests, and for nothing else. */
export const isLoading = () => waits.length > 0;

/**
 * A wait drawn as part of a screen: the words, with the thread running
 * under them once LOADING_DELAY has passed. `text` is markup of ours,
 * already translated. Several drawn at once -- one a card -- say so
 * once: the rest pass `status: false`, so a screen reader is not read
 * the same wait five times.
 */
export const loadingNote = (text, { status = true } = {}) => `<span class="loading-note"${status ? ' role="status"' : ''}>${text}</span>`;
