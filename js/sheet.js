// A panel a thumb can move.
//
// On a phone the inventory detail and every dialog come up from the
// bottom edge, because that is the part of the screen a thumb reaches.
// They arrived at one height and stayed there: an item card with eight
// sections in it had most of them below the fold, and the tab bar sat
// over the last of what was visible, so the card looked cut off with no
// way to see the rest of it.
//
// So the bar across the top of one is real. Drag it up and the sheet
// takes the screen; drag it down and it goes back; drag it further, or
// flick it, and it is put away. Tapping the bar -- or pressing Enter on
// it, which is how a keyboard gets at the same thing -- moves it
// between the two heights without the gesture.
//
// Content that overflows still scrolls. The drag only takes the finger
// when there is nothing left to scroll up to, so the two gestures never
// fight over the same stroke.

import { isPhone } from './viewport.js';

/** How far a stroke travels before it is a drag and not a tap. */
const SLOP = 6;
/** Down this far, or this fast, and the sheet is being put away. */
const DISMISS = 96;
const FLICK = 0.55;          // px per ms
/** Up this far and it wants the whole screen; down this far, less. */
const SNAP = 40;

const phone = isPhone;

/* ------------------------------------------------------------------ *
 * what the keyboard covers
 * ------------------------------------------------------------------ */

/**
 * An on-screen keyboard does not make the page smaller. It slides over
 * the bottom of it -- which is exactly where a sheet lives, so Find's
 * results ended up underneath one with only the search box showing above
 * its roof. The browser's own answer is to scroll the *visual* viewport,
 * and a fixed-position sheet is measured against the layout viewport, so
 * it does not come with it.
 *
 * The visual viewport is the part still being looked at. What it leaves
 * hidden at the foot of the page is published as --kb-h; the sheets
 * stand on top of that and take it off their own height. When no
 * keyboard is up it is 0px and every rule reads as it did before.
 */
let hidBelow = -1;

/** Small movements are the browser's own toolbars, not a keyboard --
 *  following those would make a sheet twitch on every scroll. */
const KEYBOARD = 120;

function measureKeyboard() {
	const vv = window.visualViewport;
	if (!vv) return;
	// A pinch shrinks the visual viewport too, and that is not a keyboard.
	const under = vv.scale > 1.01 ? 0
		: Math.round(window.innerHeight - vv.height - vv.offsetTop);
	const next = under > KEYBOARD ? under : 0;
	if (next === hidBelow) return;
	hidBelow = next;
	document.documentElement.style.setProperty('--kb-h', `${next}px`);
	// The sheet has just been given a different height; whatever is being
	// typed into should still be on the visible side of it.
	if (next) requestAnimationFrame(keepFieldInView);
}

/** The field being typed in, kept where it can be seen. */
function keepFieldInView() {
	const el = document.activeElement;
	if (!el || typeof el.closest !== 'function') return;
	if (!el.matches('input, select, textarea')) return;
	if (!el.closest('.dialog-box, .detail')) return;
	el.scrollIntoView({ block: 'nearest' });
}

if (typeof window !== 'undefined' && window.visualViewport) {
	// Both: the height changes when the keyboard arrives, and offsetTop
	// when the browser scrolls the page up to clear it.
	window.visualViewport.addEventListener('resize', measureKeyboard);
	window.visualViewport.addEventListener('scroll', measureKeyboard);
	// A field focused before any of that -- tapping straight into Find's
	// search -- still wants the sheet sized for the keyboard on its way.
	document.addEventListener('focusin', () => setTimeout(measureKeyboard, 350));
	measureKeyboard();
}

/**
 * A render replaces the sheet's element, so how tall it was stopped
 * being remembered -- pressing "+" in the inventory detail folded the
 * sheet someone had just opened out. Kept by name instead, so the same
 * sheet comes back the size it was left.
 */
const heights = new Map();

/* A drag ends in a click on whatever it started over. Swallowing the
   one that follows is what keeps a pull down the face of a card from
   also pressing the button under the finger. */
let deaf = 0;
let listening = false;

function deafen() {
	deaf = performance.now() + 350;
	if (listening) return;
	listening = true;
	document.addEventListener('click', evt => {
		if (performance.now() >= deaf) return;
		evt.stopPropagation();
		evt.preventDefault();
	}, true);
}

/**
 * Make `el` draggable as a bottom sheet.
 *
 * `onDismiss` is what putting it away means -- closing the dialog,
 * dropping the selection -- and is the only way this module ends
 * anything: it never removes the element itself.
 */
export function attachSheet(el, { onDismiss = null, key = '' } = {}) {
	if (!el || el.dataset.sheet) return el;
	el.dataset.sheet = 'on';

	const grab = document.createElement('button');
	grab.type = 'button';
	grab.className = 'sheet-grab';
	grab.setAttribute('aria-label', 'Resize this panel');
	el.prepend(grab);

	if (key && heights.get(key) === 'tall') el.classList.add('tall');

	const tall = () => el.classList.contains('tall');
	const setTall = on => {
		el.classList.toggle('tall', on);
		if (key) heights.set(key, on ? 'tall' : 'rest');
	};

	let gone = false;
	const dismiss = () => {
		if (gone) return;
		gone = true;
		if (key) heights.delete(key);
		if (onDismiss) onDismiss();
	};

	let from = null;        // where the stroke began, and when
	let dragging = false;

	const down = evt => {
		if (!phone() || gone) return;
		if (evt.pointerType === 'mouse' && evt.button !== 0) return;
		const onGrab = !!evt.target.closest('.sheet-grab');
		// Started in the body of the sheet: only ours while there is
		// nothing above to scroll back to, and never over a field.
		if (!onGrab && (el.scrollTop > 0 || evt.target.closest('input, select, textarea'))) return;
		from = { y: evt.clientY, at: evt.timeStamp, onGrab };
		dragging = false;
		// A stroke from the bar is captured at the press, because the bar
		// is 27px tall and the finger is off it within one frame -- and
		// without the capture the rest of the moves go to the veil behind
		// the sheet, where nothing is listening. (A touch the browser
		// captures this way already; a mouse it does not.)
		//
		// To the bar itself, though, and never to the sheet: a captured
		// pointer delivers its click to whatever holds the capture, so
		// capturing the sheet here would make every button in it answer
		// as the sheet instead. A press anywhere else waits until it is
		// a drag and not a press -- see move().
		if (onGrab) capture(grab, evt);
	};

	/** Hold the rest of this stroke, whatever it passes over. */
	const capture = (on, evt) => {
		try { on.setPointerCapture(evt.pointerId); } catch { /* not a capturable pointer */ }
	};

	const move = evt => {
		if (!from) return;
		const d = evt.clientY - from.y;
		if (!dragging) {
			if (Math.abs(d) < SLOP) return;
			// Upward from the body is the scroll the content is owed.
			if (!from.onGrab && d < 0) { from = null; return; }
			dragging = true;
			el.classList.add('dragging');
			// Now it is a drag, so the click it ends in is not a press on
			// anything and the sheet may hold the pointer to the end.
			if (!from.onGrab) capture(el, evt);
		}
		// Nothing above the top of the screen to open into, so an upward
		// pull resists rather than lifting the sheet off its own edge.
		el.style.transform = `translateY(${d < 0 ? d / 3 : d}px)`;
		evt.preventDefault();
	};

	const up = evt => {
		if (!from) return;
		const d = evt.clientY - from.y;
		const speed = d / Math.max(1, evt.timeStamp - from.at);
		const was = dragging;
		from = null;
		dragging = false;
		el.classList.remove('dragging');
		el.style.transform = '';
		if (!was) return;
		deafen();
		if (d > DISMISS || (d > SLOP * 3 && speed > FLICK)) dismiss();
		else if (d > SNAP && tall()) setTall(false);
		else if (d < -SNAP) setTall(true);
	};

	const cancel = () => {
		from = null;
		dragging = false;
		el.classList.remove('dragging');
		el.style.transform = '';
	};

	el.addEventListener('pointerdown', down);
	el.addEventListener('pointermove', move);
	el.addEventListener('pointerup', up);
	el.addEventListener('pointercancel', cancel);

	// A tap on the bar, or Enter on it, is the drag without the drag:
	// out to the whole screen, and back. Not a way to close -- a stray
	// tap should not throw away what someone was reading, and both
	// sheets have a Close of their own for that.
	grab.addEventListener('click', () => {
		if (phone()) setTall(!tall());
	});

	return el;
}
