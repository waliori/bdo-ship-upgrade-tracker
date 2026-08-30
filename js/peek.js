// The hover card: what a thing is made of, or where it comes from,
// parked under whatever the pointer -- or the keyboard focus -- is on.

import { peekHTML } from './ui-bits.js';

let peekTimer = null;
let peekOn = null;
let rearmTimer = null;
let lastX = -1;
let lastY = -1;

// A finger cannot hover: the synthetic mouseover after a tap would park
// the card over the content with nothing to put it away. Tracked from
// the pointer actually in use rather than the device, so a convertible
// earns the card back the moment a mouse moves.
let hoverable = !(window.matchMedia && window.matchMedia('(hover: none)').matches);

/** Put the card away and cancel any show on its way. */
function putAway() {
	clearTimeout(peekTimer);
	peekTimer = null;
	peekOn = null;
	const host = document.getElementById('peek');
	if (host && !host.hidden) host.hidden = true;
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
	// same row, and nothing would ever bring it back -- so one short
	// beat later, re-arm from where the pointer last was.
	if (!hoverable || lastX < 0) return;
	rearmTimer = setTimeout(() => {
		const host = document.getElementById('peek');
		if (peekTimer || (host && !host.hidden) || !document.hasFocus()) return;
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

// A short delay, so sweeping across a grid of tiles does not flash a
// card for every one of them.
function showSoon(el) {
	if (!hoverable) return;
	const host = document.getElementById('peek');
	if (!host) return;
	if (el.dataset.peek === peekOn) return;
	putAway();
	peekTimer = setTimeout(() => {
		peekTimer = null;
		const html = peekHTML(el.dataset.peek);
		if (!html) return;
		host.innerHTML = html;
		host.hidden = false;
		peekOn = el.dataset.peek;
		placePeek(host, el);
	}, 280);
}

function leaveFor(from, to) {
	if (!from) return;
	// Moving straight onto another one: its own show takes over, and
	// hiding here would cancel the card before it ever appeared.
	if (to && to.closest && to.closest('[data-peek]')) return;
	hidePeek();
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
		const el = evt.target.closest('[data-peek]');
		if (el) showSoon(el);
	});
	document.addEventListener('mouseout', evt =>
		leaveFor(evt.target.closest('[data-peek]'), evt.relatedTarget));

	// The same card for the keyboard: tabbing onto a tile or a chip shows
	// what hovering it would.
	document.addEventListener('focusin', evt => {
		const el = evt.target.closest ? evt.target.closest('[data-peek]') : null;
		if (el) showSoon(el);
	});
	document.addEventListener('focusout', evt =>
		leaveFor(
			evt.target.closest ? evt.target.closest('[data-peek]') : null,
			evt.relatedTarget
		));
	document.addEventListener('scroll', onScroll, true);
	window.addEventListener('blur', hidePeek);

	// Escape puts the card away for good -- no re-arm, or it would be
	// back before the key was released.
	document.addEventListener('keydown', evt => {
		if (evt.key !== 'Escape') return;
		clearTimeout(rearmTimer);
		putAway();
	});
}
