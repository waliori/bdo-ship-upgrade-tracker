// An area of the chart kept offline: the pinned tile cache and the
// two buttons that fill and forget it.

import { pinTiles, PIN_MAX } from '../map.js';
import { T } from '../i18n.js';
import { toast } from '../dialogs.js';
import { mv } from './state.js';
import { hostSize } from './view.js';

/* ---- an area kept offline ------------------------------------------- *
   A cache of the browser's own, apart from the service worker's: the
   worker looks there first for a tile and its sweep never touches it,
   so what is fetched here stays until it is let go here. */
const PINNED_CACHE = 'tiles-pinned';
let pinnedN = 0;   // tiles in that cache, as last counted, for the button

function canPin() {
	return typeof caches !== 'undefined' && typeof window !== 'undefined' && window.isSecureContext;
}

/** The two chart buttons: keep this area, and forget what is kept --
 *  the second only once something is. */
export function pinButtonsHTML() {
	if (!canPin()) return '';
	const kept = pinnedN ? ` — ${pinnedN === 1 ? T('{n} tile kept so far', { n: pinnedN }) : T('{n} tiles kept so far', { n: pinnedN })}` : '';
	return `<button class="ghost-btn map-pin-btn" data-act="map-pin-area" aria-label="${T('Keep this area offline')}" title="${T('Keep this area offline: the tiles in view and one zoom level either side, fetched now and never shed')}${kept}">⇩${pinnedN ? `<span class="map-pin-n">${pinnedN}</span>` : ''}</button>${pinnedN
		? `<button class="ghost-btn map-pin-btn" data-act="map-pin-forget" aria-label="${T('Forget the offline area')}" title="${T('Forget the offline area: let the {n} kept tiles go', { n: pinnedN })}">⌫</button>` : ''}`;
}

function refreshPinButtons() {
	const slot = document.querySelector('[data-map-pins]');
	if (slot) slot.innerHTML = pinButtonsHTML();
}

/** Count what is kept, and redraw the button when the count changed. */
export async function countPinned() {
	if (!canPin()) return 0;
	try {
		const cache = await caches.open(PINNED_CACHE);
		const n = (await cache.keys()).length;
		if (n !== pinnedN) {
			pinnedN = n;
			refreshPinButtons();
		}
		return n;
	} catch {
		return pinnedN;
	}
}

/**
 * Keep the area in view offline: every tile under the viewport at the
 * level drawn and one either side, fetched into the pinned cache. A
 * view that would take more than PIN_MAX tiles is refused with a word
 * -- zoom in, or keep it in two goes.
 */
export async function pinArea() {
	if (!canPin()) return toast(T('This browser cannot keep tiles offline'));
	const host = document.querySelector('[data-map]');
	if (!host || !mv.mapState) return;
	const tiles = pinTiles(mv.mapState, hostSize(host));
	if (tiles.length > PIN_MAX) return toast(T('That is {n} tiles — more than the {max} an area may keep. Zoom in, or keep it in two goes.', { n: tiles.length, max: PIN_MAX }));
	if (!tiles.length) return toast(T('Nothing in view to keep'));
	toast(tiles.length === 1 ? T('Keeping {n} tile…', { n: tiles.length }) : T('Keeping {n} tiles…', { n: tiles.length }));
	let got = 0, failed = 0;
	try {
		const cache = await caches.open(PINNED_CACHE);
		// Six at a time: enough to be quick, not enough to starve the
		// tiles the chart is drawing right now.
		const queue = tiles.slice();
		await Promise.all(Array.from({ length: 6 }, async () => {
			while (queue.length) {
				const t = queue.shift();
				try {
					if (await cache.match(t.src)) { got++; continue; }
					const res = await fetch(t.src);
					if (res.ok) { await cache.put(t.src, res); got++; } else failed++;
				} catch { failed++; }
			}
		}));
	} catch {
		return toast(T('The browser would not keep the tiles'));
	}
	await countPinned();
	toast(failed
		? (got === 1 ? T('{n} tile kept offline; {failed} could not be fetched', { n: got, failed }) : T('{n} tiles kept offline; {failed} could not be fetched', { n: got, failed }))
		: (got === 1 ? T('{n} tile kept offline — {all} in all', { n: got, all: pinnedN }) : T('{n} tiles kept offline — {all} in all', { n: got, all: pinnedN })));
}

/** Let the kept area go. */
export async function forgetPinned() {
	if (!canPin()) return;
	try {
		await caches.delete(PINNED_CACHE);
	} catch { /* nothing kept, then */ }
	pinnedN = 0;
	refreshPinButtons();
	toast(T('The offline area is forgotten'));
}
