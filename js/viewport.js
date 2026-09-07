// What counts as a phone, said once.
//
// The stylesheet, the sheets, the tour and the shell each used to keep
// their own idea of it -- 640 here, 720 there, 780 for the header -- and
// a phone held on its side matched none of them: 844 pixels wide is a
// desktop by width, so it got the tab row, the full masthead and a
// dialog centred over a screen 390 pixels tall. A short screen driven by
// a finger is a phone whichever way it is held, so the query says so,
// and the CSS repeats the same text (a media query cannot read a
// variable) under the comment that names this file.

/** The phone: narrow, or short and touched. */
export const PHONE_MQ = '(max-width: 720px), ((max-height: 520px) and (pointer: coarse))';

/**
 * Where the masthead folds into the hamburger. Wider than the phone
 * itself: at 760px the brand and the five buttons do not fit on one line
 * without the header growing a second, so the fold comes first.
 */
export const MENU_MQ = '(max-width: 780px), ((max-height: 520px) and (pointer: coarse))';

const query = mq => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(mq) : null);

/** True while the page is a phone's, by PHONE_MQ. */
export function isPhone() {
	const m = query(PHONE_MQ);
	return !!(m && m.matches);
}

/** True while the header is behind the hamburger, by MENU_MQ. */
export function isFolded() {
	const m = query(MENU_MQ);
	return !!(m && m.matches);
}

/**
 * Call `cb(isPhone)` whenever the answer changes -- a rotation, a window
 * dragged narrower. Returns the function that stops listening.
 */
export function onPhoneChange(cb) {
	const m = query(PHONE_MQ);
	if (!m) return () => {};
	const handler = evt => cb(evt.matches);
	if (typeof m.addEventListener === 'function') m.addEventListener('change', handler);
	else m.addListener(handler);
	return () => {
		if (typeof m.removeEventListener === 'function') m.removeEventListener('change', handler);
		else m.removeListener(handler);
	};
}
