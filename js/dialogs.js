// Toasts and dialogs: the two ways the app speaks outside the screen.
//
// Their own module so that a screen can raise one without importing the
// shell -- ui.js, sync.js and every screen all talk through here.

import { esc } from './fmt.js';

let toastTimer = null;

export function toast(message, undoable = false) {
	const el = document.getElementById('toast');
	el.innerHTML = `<span>${esc(message)}</span>` +
		(undoable ? '<button type="button" data-act="undo">Undo</button>' : '');
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

/** The page behind the veil, out of the tab order and the screen
 *  reader's reach while a dialog is the whole interface. */
function veilShell(on) {
	const shell = document.querySelector('.shell');
	if (shell && 'inert' in shell) shell.inert = on;
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
	dialogDismiss = onDismiss;
	host.onclick = evt => {
		if (evt.target === host || evt.target.hasAttribute('data-close')) dismissDialog();
	};
	// A keyboard arrives inside the dialog, not stranded behind it.
	// Callers that want a specific field focused (the build picker's
	// search) focus it themselves afterwards and simply win.
	const first = host.querySelector('input, select, textarea, button');
	if (first) first.focus();
	return host;
}

export function closeDialog() {
	const host = document.getElementById('dialog');
	host.hidden = true;
	host.innerHTML = '';
	dialogDismiss = null;
	veilShell(false);
	document.dispatchEvent(new CustomEvent('dialog-toggle', { detail: { open: false } }));
	// Focus goes back where it came from, so Escape does not dump a
	// keyboard user at the top of the page.
	if (dialogOpener && dialogOpener.isConnected) dialogOpener.focus();
	dialogOpener = null;
}

/** Close without an answer: the backdrop, a Close button, or Escape. */
export function dismissDialog() {
	const onDismiss = dialogDismiss;
	closeDialog();
	if (onDismiss) onDismiss();
}

