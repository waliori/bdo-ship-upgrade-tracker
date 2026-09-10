// Toasts and dialogs: the two ways the app speaks outside the screen.
//
// Their own module so that a screen can raise one without importing the
// shell -- ui.js, sync.js and every screen all talk through here.

import { esc } from './fmt.js';
import { T } from './i18n.js';
import { attachSheet } from './sheet.js';

let toastTimer = null;

export function toast(message, undoable = false) {
	const el = document.getElementById('toast');
	el.innerHTML = `<span>${esc(message)}</span>` +
		(undoable ? `<button type="button" data-act="undo">${T('Undo')}</button>` : '');
	el.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}

/* ------------------------------------------------------------------ *
 * dialogs
 * ------------------------------------------------------------------ */

/**
 * `onDismiss` fires when the dialog is put away without an answer -- the
 * backdrop, Escape, or a plain Close button. A caller that was holding
 * work while the question was on screen (the sync conflict) uses it to
 * let go; the buttons that *are* answers call closeDialog() directly
 * and never trigger it.
 */
let dialogDismiss = null;   // the open dialog's onDismiss, for Escape
let dialogOpener = null;    // where focus returns when the last dialog closes

/** Still there, and still something focus can actually land on.
 *  `offsetParent` is null for anything display:none or inside it, which
 *  is what a closed menu does to the button that was clicked in it. */
function focusable(el) {
	return !!el && el.isConnected && !el.hidden && !el.disabled && el.offsetParent !== null;
}

/** The page behind the veil, out of the tab order and the screen
 *  reader's reach while a dialog is the whole interface. The phone's
 *  section bar stands outside .shell, and is just as much behind it. */
function veilShell(on) {
	for (const el of document.querySelectorAll('.shell, #tabbar')) {
		if ('inert' in el) el.inert = on;
	}
}

/**
 * Name the dialog after its own heading, so a screen reader announces
 * "Bring in this file?" rather than "dialog". Headings are written into
 * the HTML by every caller; the first one is given an id if it has
 * none, and the host points at it. A dialog without one falls back to
 * saying it is a dialog, which is at least not wrong.
 */
let headingSeq = 0;
function nameDialog(host) {
	const heading = host.querySelector('h2, .dialog-title');
	if (!heading) {
		host.removeAttribute('aria-labelledby');
		return;
	}
	if (!heading.id) heading.id = `dialog-title-${++headingSeq}`;
	host.setAttribute('aria-labelledby', heading.id);
}

export function openDialog(html, { onDismiss = null } = {}) {
	const host = document.getElementById('dialog');
	// A dialog opened over another replaces it, which dismisses the
	// first in every sense -- anything it was holding gets let go, and
	// the opener recorded then is still where focus belongs at the end.
	if (!host.hidden) {
		const prev = dialogDismiss;
		dialogDismiss = null;
		if (prev) prev();
	} else {
		dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		veilShell(true);
		document.dispatchEvent(new CustomEvent('dialog-toggle', { detail: { open: true } }));
	}
	host.innerHTML = `<div class="dialog-box">${html}</div>`;
	host.hidden = false;
	nameDialog(host);
	dialogDismiss = onDismiss;
	// On a phone a dialog is a sheet at the bottom edge, and the bar
	// across the top of it is how a thumb opens it out or puts it away.
	attachSheet(host.firstElementChild, { onDismiss: dismissDialog });
	host.onclick = evt => {
		if (evt.target === host || evt.target.hasAttribute('data-close')) dismissDialog();
	};
	// A keyboard arrives inside the dialog, not stranded behind it.
	// Callers that want a specific field focused (the build picker's
	// search) focus it themselves afterwards and simply win.
	//
	// preventScroll, because in a long dialog the first focusable thing
	// is often the Close button at the very bottom -- focusing it
	// scrolled the box past its own heading, so What's New opened
	// half-way down itself. The sheet's own grab bar is not an answer to
	// anything and is skipped, or it would take the focus from the
	// search box every dialog that has one wants.
	const first = host.querySelector('input, select, textarea, button:not(.sheet-grab)');
	if (first) first.focus({ preventScroll: true });
	return host;
}

export function closeDialog() {
	const host = document.getElementById('dialog');
	host.hidden = true;
	host.innerHTML = '';
	host.removeAttribute('aria-labelledby');
	dialogDismiss = null;
	veilShell(false);
	document.dispatchEvent(new CustomEvent('dialog-toggle', { detail: { open: false } }));
	// Focus goes back where it came from, so Escape does not dump a
	// keyboard user at the top of the page.
	//
	// Being in the document is not enough to be focusable: everything
	// opened from the More menu is opened from a button the menu then
	// hides, and .focus() on a hidden element quietly does nothing --
	// which is how Escape out of Export used to land on <body> after
	// all. So the menu's own button stands in for the item chosen from
	// it, and the masthead for anything else that has gone away.
	const back = focusable(dialogOpener)
		? dialogOpener
		: (dialogOpener && dialogOpener.closest('#more-menu') && focusable(document.querySelector('[data-act="more"]'))
			? document.querySelector('[data-act="more"]')
			: null);
	if (back) back.focus();
	dialogOpener = null;
}

/** Close without an answer: the backdrop, a Close button, or Escape. */
export function dismissDialog() {
	const onDismiss = dialogDismiss;
	closeDialog();
	if (onDismiss) onDismiss();
}

