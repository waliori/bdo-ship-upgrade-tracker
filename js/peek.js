// The hover card: what a thing is made of, or where it comes from,
// parked under whatever the pointer -- or the keyboard focus -- is on.

import { peekHTML } from './ui-bits.js';

let peekTimer = null;
let peekOn = null;
let rearmTimer = null;
let leaveTimer = null;
let lastX = -1;
let lastY = -1;
// The element the open card describes, so the link can be undone.
let describedEl = null;

// A finger cannot hover: the synthetic mouseover after a tap would park
// the card over the content with nothing to put it away. Tracked from
// the pointer actually in use rather than the device, so a convertible
// earns the card back the moment a mouse moves.
let hoverable = !(window.matchMedia && window.matchMedia('(hover: none)').matches);

/** Put the card away and cancel any show on its way. */
function putAway() {
	clearTimeout(peekTimer);
	clearTimeout(leaveTimer);
	peekTimer = null;
	leaveTimer = null;
	peekOn = null;
	const host = document.getElementById('peek');
	if (host && !host.hidden) host.hidden = true;
	if (describedEl) {
		describedEl.removeAttribute('aria-describedby');
		describedEl = null;
	}
}

/** Whether a card is up, or about to be. */
function peekLive() {
	const host = document.getElementById('peek');
	return !!(peekTimer || peekOn || (host && !host.hidden));
}

/**
 * A scroll puts the card away and leaves it there. Re-arming from
 * under the pointer here would run elementFromPoint -- a forced
 * layout -- on every scroll tick and pop cards up mid-scroll, which
 * read as the page flickering; and when nothing is showing there is
 * nothing to do at all.
 */
function onScroll() {
	if (!peekLive()) return;
	clearTimeout(rearmTimer);
	putAway();
}

export function hidePeek() {
	clearTimeout(rearmTimer);
	putAway();
	// A render tears the card down while the pointer sits still over the
	// same row -- or while the keyboard's focus is on it -- and nothing
	// would ever bring it back. So one short beat later, re-arm from the
	// focused row if there is one, else from where the pointer last was.
	rearmTimer = setTimeout(() => {
		const host = document.getElementById('peek');
		if (peekTimer || (host && !host.hidden) || !document.hasFocus()) return;
		const active = document.activeElement;
		const focused = active && active.closest ? active.closest('[data-peek]') : null;
		if (focused) return showSoon(focused, true);
		if (!hoverable || lastX < 0) return;
		const under = document.elementFromPoint(lastX, lastY);
		const el = under && under.closest ? under.closest('[data-peek]') : null;
		if (el) showSoon(el);
	}, 80);
}

/** Park the card under what you are pointing at, inside the viewport. */
function placePeek(host, el) {
	const box = el.getBoundingClientRect();
	const w = host.offsetWidth;
	const h = host.offsetHeight;
	let x = box.left;
	let y = box.bottom + 8;
	if (y + h > window.innerHeight - 8) y = Math.max(8, box.top - h - 8);
	if (x + w > window.innerWidth - 8) x = Math.max(8, window.innerWidth - w - 8);
	host.style.left = `${Math.round(x)}px`;
	host.style.top = `${Math.round(y)}px`;
}

/** The card itself, now. */
function reveal(host, el) {
	const html = peekHTML(el.dataset.peek);
	if (!html) return;
	host.innerHTML = html;
	host.hidden = false;
	peekOn = el.dataset.peek;
	placePeek(host, el);
	// A screen reader on the row hears the card as its description.
	if (describedEl && describedEl !== el) describedEl.removeAttribute('aria-describedby');
	describedEl = el;
	el.setAttribute('aria-describedby', host.id);
}

// A short delay, so sweeping across a grid of tiles does not flash a
// card for every one of them. `keyboard` is the focus path: a keyboard
// is not a finger, so it shows the card whether or not the device can
// hover -- a tablet with a keyboard on it still tabs through the tiles.
function showSoon(el, keyboard = false) {
	if (!hoverable && !keyboard) return;
	const host = document.getElementById('peek');
	if (!host) return;
	if (el.dataset.peek === peekOn) return;
	putAway();
	peekTimer = setTimeout(() => {
		peekTimer = null;
		reveal(host, el);
	}, 280);
}

/**
 * A finger's hover: a tap on a row or a chip that does nothing else
 * shows the card, a second tap -- or one anywhere else -- puts it
 * away. Controls keep their own meaning; a tile still opens its
 * panel, a button still presses.
 */
function onTap(evt) {
	if (hoverable) return;
	const host = document.getElementById('peek');
	if (!host) return;
	if (evt.target.closest('#peek')) return;
	const el = evt.target.closest('[data-peek]');
	const control = evt.target.closest('button, a, input, select, textarea, label, summary');
	if (!el || control) {
		putAway();
		return;
	}
	if (peekOn === el.dataset.peek && !host.hidden) {
		putAway();
		return;
	}
	putAway();
	reveal(host, el);
}

function leaveFor(from, to) {
	if (!from) return;
	// Moving straight onto another one: its own show takes over, and
	// hiding here would cancel the card before it ever appeared.
	if (to && to.closest && to.closest('[data-peek]')) return;
	// Onto the card itself: it stays, so "Open in Inventory" can be
	// reached. There is a gap of a few pixels between the row and the
	// card, so the leave is given a beat to arrive there.
	if (to && to.closest && to.closest('#peek')) return;
	clearTimeout(leaveTimer);
	leaveTimer = setTimeout(() => { leaveTimer = null; hidePeek(); }, 140);
}

/**
 * The card's one action, from the keyboard. Tabbing onto a row shows
 * the card; Enter or "o" while it is up takes the item to the
 * Inventory, the way the card's own button does with a mouse. Enter is
 * left alone on anything that already answers to it -- a tile is a
 * button and opens its panel; a chip presses -- so only the plain
 * rows take it, and "o" works on all of them.
 */
function onKey(evt) {
	if (evt.key === 'Escape') {
		clearTimeout(rearmTimer);
		putAway();
		return;
	}
	if (evt.key !== 'Enter' && evt.key !== 'o') return;
	if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
	const host = document.getElementById('peek');
	if (!host || host.hidden || !describedEl) return;
	if (!evt.target.closest || evt.target.closest('[data-peek]') !== describedEl) return;
	if (evt.target.closest('input, textarea, select, [contenteditable]')) return;
	if (evt.key === 'Enter' && evt.target.closest('button, a, summary, [role="button"]')) return;
	const open = host.querySelector('[data-act="open-item"]');
	if (!open) return;
	evt.preventDefault();
	open.click();
}

export function wirePeek() {
	if (!document.getElementById('peek')) return;

	const notePointer = evt => {
		if (evt.pointerType) hoverable = evt.pointerType !== 'touch';
		lastX = evt.clientX;
		lastY = evt.clientY;
	};
	document.addEventListener('pointerdown', notePointer, true);
	document.addEventListener('pointermove', notePointer, true);

	document.addEventListener('mouseover', evt => {
		// Arriving on the card cancels the leave that was about to hide it.
		if (evt.target.closest('#peek')) {
			clearTimeout(leaveTimer);
			leaveTimer = null;
			return;
		}
		const el = evt.target.closest('[data-peek]');
		if (el) showSoon(el);
	});
	document.addEventListener('mouseout', evt => {
		// Off the card to anywhere but a row: put it away.
		if (evt.target.closest('#peek')) {
			const to = evt.relatedTarget;
			if (to && to.closest && (to.closest('#peek') || to.closest('[data-peek]'))) return;
			hidePeek();
			return;
		}
		leaveFor(evt.target.closest('[data-peek]'), evt.relatedTarget);
	});
	document.addEventListener('click', onTap);

	// The same card for the keyboard: tabbing onto a tile or a chip shows
	// what hovering it would.
	document.addEventListener('focusin', evt => {
		const el = evt.target.closest ? evt.target.closest('[data-peek]') : null;
		if (el) showSoon(el, true);
	});
	document.addEventListener('focusout', evt =>
		leaveFor(
			evt.target.closest ? evt.target.closest('[data-peek]') : null,
			evt.relatedTarget
		));
	document.addEventListener('scroll', onScroll, true);
	window.addEventListener('blur', hidePeek);

	// Escape puts the card away for good -- no re-arm, or it would be
	// back before the key was released. Enter and "o" open the item.
	document.addEventListener('keydown', onKey);
}
