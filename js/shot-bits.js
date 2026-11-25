// What the pages draw about screenshots before any is read -- the paste
// zones' notes, the guide's pictures, the file chooser -- apart from the
// readers (shot-reader.js, barter-import.js), which are fetched only when a
// screenshot is read: at boot they were 53 KB the first view never used.

import { T } from './i18n.js';

/**
 * The three readers -- sailors, storage, the barter window -- each had
 * their own copy of the same twenty lines: press the panel to choose
 * files, drag a file onto it, and the panel lights up while a file is
 * over it. One copy now, because three copies of one thing is three
 * chances for two of them to fall behind, and because what follows had
 * to be added to all three at once.
 *
 * What follows is the clipboard. On Windows a screenshot is Shift+Win+S
 * and it goes to the clipboard, not to a file -- so every player who
 * shot a window the way the game's own community shoots windows had to
 * open Paint, paste, save somewhere they could find again, and only
 * then come back and hunt for it in a file picker. Oni did that for a
 * while and then wrote in to ask, which is fair: the app's own feedback
 * box has taken a pasted image all along.
 *
 * It is also the better picture. Paint saves what it was given, but a
 * player who pastes into Paint and drags the canvas edge, or saves as
 * JPEG, hands the reader a rescaled or blotchy grid -- and the storage
 * reader finds its slots by a lattice that a rescale puts out by a few
 * pixels. A paste is the shot the game drew, at the size it drew it.
 */
const PASTE_NAMES = new Set(['', 'image.png', 'image.jpg', 'image.jpeg', 'image.webp']);

/** The images on a clipboard, named so the reader can talk about them.
 *  A paste carries one picture and a name the system made up, so a
 *  name worth keeping is kept and anything else is numbered. */
export function imagesOn(data, from = 1) {
	if (!data) return [];
	const out = [];
	const files = data.files ? [...data.files] : [];
	// `items` is the older road to the same pictures, and some browsers
	// fill one and not the other.
	if (!files.length && data.items) {
		for (const it of data.items) {
			if (it.kind !== 'file') continue;
			const f = it.getAsFile();
			if (f) files.push(f);
		}
	}
	for (const f of files) {
		if (!f || !/^image\//.test(f.type || '')) continue;
		const plain = String(f.name || '').toLowerCase();
		if (!PASTE_NAMES.has(plain)) { out.push(f); continue; }
		const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
		out.push(new File([f], `pasted ${from + out.length}.${ext}`, { type: f.type }));
	}
	return out;
}


/**
 * How many screenshots one paste carries depends on the browser, and
 * the zones show it as marks rather than words: Chrome, Edge, Opera and
 * the other Chromium browsers hand over every file copied in a file
 * manager; Firefox hands over one a paste, whatever was copied, and the
 * rest are dropped or chosen. The browser the page is in is the bold one.
 */
const MARK = {
	chrome: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12L2.47 6.5A11 11 0 0 1 21.53 6.5Z" fill="#db4437"/><path d="M12 12L21.53 6.5A11 11 0 0 1 12 23Z" fill="#f4b400"/><path d="M12 12L12 23A11 11 0 0 1 2.47 6.5Z" fill="#0f9d58"/><circle cx="12" cy="12" r="5.6" fill="#fff"/><circle cx="12" cy="12" r="4.3" fill="#4285f4"/></svg>',
	edge: '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="pb-edge" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#0c59a4"/><stop offset="1" stop-color="#3ec1a3"/></linearGradient></defs><circle cx="12" cy="12" r="11" fill="url(#pb-edge)"/><text x="12" y="17" text-anchor="middle" font-size="15" font-weight="700" fill="#fff" font-family="Arial, sans-serif">e</text></svg>',
	opera: '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="10" ry="11" fill="#ff1b2d"/><ellipse cx="12" cy="12" rx="4.4" ry="6.6" fill="#fff"/></svg>',
	firefox: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#ff9500"/><path d="M3.2 8.5C4.6 4 8.5 1.6 13 2.2c-3 1-4.8 3-5.3 5.5z" fill="#ff5a1f"/><circle cx="13" cy="13" r="7.6" fill="#2a3e8f"/><circle cx="14.5" cy="14.5" r="4.6" fill="#5a2ea6" opacity="0.6"/></svg>'
};
export function pasteManyNote() {
	const ua = navigator.userAgent || '';
	const ff = /Firefox\//.test(ua);
	const here = ff ? 'firefox' : /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Chrom(e|ium)\//.test(ua) ? 'chrome' : '';
	const chip = (k, name, ok) => `<span class="pb ${ok ? 'ok' : 'no'}${here === k ? ' here' : ''}" title="${ok ? T('pastes several screenshots at once') : T('pastes one screenshot at a time')}">${MARK[k]}${name}</span>`;
	return `<span class="paste-browsers">${chip('chrome', 'Chrome', true)}${chip('edge', 'Edge', true)}${chip('opera', 'Opera', true)}${chip('firefox', 'Firefox', false)}<span class="pb-note">${ff ? T('One at a time here — drop or choose the files') : T('Several at once with Ctrl+V')}</span></span>`;
}


/**
 * What the reader reads, drawn on the game's own window: the whole
 * window with its head, the same rows cropped, and what the numbered
 * boxes are. `list` is 'trade' or 'material' -- one window, the rows
 * sorted by what they pay -- and `lazy` is for a page that draws it
 * folded away.
 */
export function shotGuideHTML(list = 'trade', { lazy = false } = {}) {
	const mat = list === 'material';
	const l = lazy ? ' loading="lazy"' : '';
	const key = (n, cls, text) => `<li><i class="shot-key ${cls}">${n}</i><span>${text}</span></li>`;
	return `<div class="mat-help-figs">
		<figure class="mat-help-fig"><img src="guide/${mat ? 'material-page' : 'barter-window'}.webp" alt="${T('The Barter Information window, the parts the app reads outlined')}"${l} width="600" height="${mat ? 421 : 418}">
			<figcaption>${mat
		? T('The whole Barter Information window — the same window as for trade goods. The rows paying ship materials go to the material list.')
		: T('The whole Barter Information window. A few rows are enough to find the layout; scroll and shoot again for more. A full-screen shot works too.')}</figcaption></figure>
		<figure class="mat-help-fig"><img src="guide/${mat ? 'material' : 'barter'}-cropped.webp" alt="${T('The same rows, cropped out of the window')}"${l} width="560" height="${mat ? 256 : 258}">
			<figcaption>${T('Cropped to the rows works too: every row is read the same. Only the head’s two figures are missed, and those can be typed in.')}</figcaption></figure>
	</div>
	<ol class="shot-keys">
		${key(1, 'at-head', T('<b>Parley</b> — the bar you hold, written in for the run'))}
		${key(2, 'at-head', T('<b>Total Barters</b> — opens the islands and exchanges your count allows'))}
		${key(3, 'at-head', T('<b>The rows</b> — each one’s island, what it takes and what it pays; what it pays sorts it into the trade goods or the ship material list. A name cut short with “…” is enough.'))}
	</ol>`;
}


/** Ask the system for pictures, and hand them to `then`. */
export function pickShots(then) {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'image/png,image/jpeg,image/webp';
	input.multiple = true;
	input.addEventListener('change', () => { if (input.files && input.files.length) then([...input.files]); });
	input.click();
}
