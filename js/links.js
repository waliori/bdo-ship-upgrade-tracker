// One link, short where it can be.
//
// Everything shareable -- a plan, a ship setup, a drawing, a route --
// has two addresses. The long one carries the thing itself, gzipped
// into the fragment, and works anywhere with nobody's help: a browser
// on its own, a deployment with no database, a player who never signed
// in. The short one is ten characters the server keeps the thing
// under, and it is what a signed-in player gets, since a drawing in
// the long form runs to thousands of characters and a chat app cuts
// those.
//
// The choice is made here, once, so a caller asks for a link and gets
// the best one going. The long form is the fallback whenever the short
// cannot be had: signed out, the deployment without it, or the server
// not answering just now.

import { canKeepLink, keepLink, feature, me } from './sync.js';
import { shortLink } from './share.js';
import { T } from './i18n.js';
import { toast, openDialog, closeDialog } from './dialogs.js';
import { esc } from './fmt.js';

/**
 * The link for `data`, a thing of `kind` (plan, ship, trace, route).
 * `longForm` builds the address-only link and is only called when
 * the short one is not to be had. Resolves to { url, short }.
 */
export async function buildLink(kind, data, longForm) {
	if (canKeepLink()) {
		try {
			return { url: shortLink(await keepLink(kind, data)), short: true };
		} catch {
			// The long form still works; the toast says which it got.
		}
	}
	return { url: await longForm(), short: false };
}

/** What the toast says once `said` is done: which link it got, and
 *  where a short one is to be had when it was the long. */
export function linkToast(said, short) {
	if (short) return T('{said} — a short one, kept with your account', { said });
	if (feature('links') && !me()) return T('{said} — sign in for a short one', { said });
	return said;
}

/**
 * Put `url` on the clipboard and say `said`. A clipboard that will not
 * take it -- a browser that wants the press closer to the write than
 * a trip to the server allows -- gets the link in a dialog to copy by
 * hand instead, rather than a shrug.
 */
export async function copyLink(url, said, short) {
	try {
		await navigator.clipboard.writeText(url);
		toast(linkToast(said, short));
	} catch {
		const host = openDialog(`
			<h2>${T('Your link')}</h2>
			<p class="dialog-copy">${T('The clipboard would not take it from here, so here it is to copy.')}</p>
			<label class="dialog-field"><input class="field" type="text" readonly value="${esc(url)}" data-link-text></label>
			<div class="dialog-actions">
				<button class="act" data-link-copy>${T('Copy')}</button>
				<button class="ghost-btn" data-close>${T('Close')}</button>
			</div>`);
		const field = host.querySelector('[data-link-text]');
		field.focus(); field.select();
		host.querySelector('[data-link-copy]').addEventListener('click', async () => {
			try { await navigator.clipboard.writeText(url); closeDialog(); toast(linkToast(said, short)); } catch { field.select(); }
		});
	}
}
