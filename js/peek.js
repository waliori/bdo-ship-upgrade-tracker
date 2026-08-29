// The hover card: what a thing is made of, or where it comes from,
// parked under whatever the pointer -- or the keyboard focus -- is on.

import { peekHTML } from './ui-bits.js';

let peekTimer = null;
let peekOn = null;

export function hidePeek() {
	clearTimeout(peekTimer);
	peekOn = null;
	const host = document.getElementById('peek');
	if (host) host.hidden = true;
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

export function wirePeek() {
	const host = document.getElementById('peek');
	if (!host) return;

	// A short delay, so sweeping across a grid of tiles does not flash a
	// card for every one of them.
	const showSoon = el => {
		if (el.dataset.peek === peekOn) return;
		hidePeek();
		peekTimer = setTimeout(() => {
			const html = peekHTML(el.dataset.peek);
			if (!html) return;
			host.innerHTML = html;
			host.hidden = false;
			peekOn = el.dataset.peek;
			placePeek(host, el);
		}, 280);
	};

	const leaveFor = (from, to) => {
		if (!from) return;
		// Moving straight onto another one: its own show takes over, and
		// hiding here would cancel the card before it ever appeared.
		if (to && to.closest && to.closest('[data-peek]')) return;
		hidePeek();
	};

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
	document.addEventListener('scroll', hidePeek, true);
	window.addEventListener('blur', hidePeek);
}
