// Keeping one inventory on more than one machine.
//
// The tracker is a local-first app and stays one: localStorage is the
// truth, everything works offline, and none of this runs unless the
// deployment has been given a Discord app and a database. Sync is a
// mirror of that local truth, not a replacement for it -- if the server
// is down, or you never sign in, nothing about the app changes.
//
// The hard part of syncing is not moving the JSON, it is what happens
// when two browsers both edited. That is settled with a revision number:
// every push says which revision it was based on, and the server refuses
// one built on a revision that has since moved. A refusal is not an
// error here -- it is the moment to show both copies and let the user
// say which one is theirs.

import * as store from './state.js';
import { esc } from './fmt.js';
import { T, said } from './i18n.js';

const REV_KEY = 'sync.rev';
const DEVICE_KEY = 'sync.device';

// Long enough that typing a quantity does not push on every keystroke,
// short enough that switching to your phone finds the change already there.
//
// This used to be measured in seconds, because a push meant waiting on
// two round trips to a database on another continent and there was no
// point in paying that often. The server now answers a push from memory
// and writes it out behind the request, so the cost is a local request
// and the delay can be what it should always have been: about as long as
// the gap between two keystrokes.
const PUSH_DELAY = 500;

// A push that failed is not a change that went away. Left alone, a
// single edit that met a bad moment would sit unsent until the next
// edit -- which might be tomorrow. So a failure is retried on its own,
// backing off up to about half a minute.
const RETRY_MIN = 1500;
const RETRY_MAX = 30000;

let hooks = {};
let account = null;      // { id, username, avatar, share, admin } once signed in
let available = false;   // does this deployment offer sync at all
let features = {};       // what /api/config said this deployment has
const watchers = new Set();   // told when the account changes
const pushed = new Set();     // told when a push has landed on the server
let status = 'off';      // off | out | idle | syncing | error | conflict
let detail = '';
let pushTimer = null;
let inFlight = false;
let lastPushed = null;   // the save text we know the server has
let resolving = false;   // a conflict dialog is open; hold all pushes
let again = false;       // a change landed while a push was in the air
let failures = 0;        // consecutive failed pushes, for the backoff

/* ------------------------------------------------------------------ *
 * Talking to the server
 * ------------------------------------------------------------------ */

async function api(method, path, body) {
	const res = await fetch(path, {
		method,
		headers: body ? { 'Content-Type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined,
		// The session is a cookie; without this it would not be sent.
		credentials: 'same-origin'
	});
	let payload = null;
	try {
		payload = await res.json();
	} catch {
		// A proxy error page rather than our JSON.
	}
	return { ok: res.ok, status: res.status, body: payload };
}

/* ------------------------------------------------------------------ *
 * What we are syncing
 * ------------------------------------------------------------------ */

/** The save as the server will store it, with keys in a stable order so
 *  the same inventory always produces the same text to compare.
 *
 *  The profile is appended only when there is one, and `saveShape` omits
 *  it while it is empty. That is deliberate: this text is what firstPull
 *  compares against the stored copy to decide whether the two sides
 *  agree, so a field that appeared unconditionally would make every
 *  already-signed-in player differ from their own save on the first load
 *  after this shipped, and each of them would be asked to resolve a
 *  conflict that does not exist. Nobody who has not set a barter count
 *  sees any change at all. */
function localText() {
	const save = store.saveShape();
	const stock = {};
	for (const key of Object.keys(save.stock).sort()) stock[key] = save.stock[key];
	const strategy = {};
	for (const key of Object.keys(save.strategy).sort()) strategy[key] = save.strategy[key];

	const out = { stock, targets: save.targets, strategy };
	if (save.profile) out.profile = save.profile;
	return JSON.stringify(out);
}

const isEmpty = data =>
	!data || (!Object.keys(data.stock || {}).length && !(data.targets || []).length);

const rev = () => Number(store.getSetting(REV_KEY, 0)) || 0;
const setRev = value => store.setSetting(REV_KEY, value);

/** A name for this browser, so the other one can say where a save came
 *  from. Guessed from the user agent and never sent anywhere else. */
function deviceName() {
	let name = store.getSetting(DEVICE_KEY, null);
	if (name) return name;
	const ua = navigator.userAgent || '';
	name = /Mobi|Android|iPhone/.test(ua) ? 'phone'
		: /iPad|Tablet/.test(ua) ? 'tablet'
		: /Mac/.test(ua) ? 'Mac'
		: /Windows/.test(ua) ? 'Windows'
		: /Linux/.test(ua) ? 'Linux'
		: 'this browser';
	store.setSetting(DEVICE_KEY, name);
	return name;
}

function say(next, note = '') {
	status = next;
	detail = note;
	paint();
}

/** The account changed -- signed in, out, or its standing on the boards. */
function tell() {
	for (const fn of watchers) {
		try { fn(account); } catch { /* one watcher's fault is not another's */ }
	}
}

/* ------------------------------------------------------------------ *
 * What the rest of the page may ask
 * ------------------------------------------------------------------ */

/** Does this deployment have `name` -- sync, push, feedback, community? */
export function feature(name) {
	return features[name] === true;
}

/** Who is signed in, or null. A copy: nobody edits the account from outside. */
export function me() {
	return account ? { ...account } : null;
}

/** Be told whenever the account changes. Returns the way to stop. */
export function onAccount(fn) {
	watchers.add(fn);
	return () => watchers.delete(fn);
}

/**
 * Be told when a push has actually landed -- not when the save changed
 * here, which is half a second earlier and no use to anything asking
 * the server a question about it.
 *
 * The community boards are the caller: what they show about you is
 * worked out from the copy the server holds, so the moment to ask them
 * again is the moment that copy caught up. Returns the way to stop.
 */
export function onPushed(fn) {
	pushed.add(fn);
	return () => pushed.delete(fn);
}

function landed() {
	for (const fn of pushed) {
		try {
			fn();
		} catch {
			// A watcher's trouble is its own; the save is saved.
		}
	}
}

/** A call on the API for another module, with the session cookie along. */
export function call(method, path, body) {
	return api(method, path, body);
}

/** Take part in the community boards, change how you are shown, or leave. */
export async function setShare(share) {
	const res = await api('PUT', '/api/community/share', { share });
	if (!res.ok) throw new Error((res.body && res.body.error) || T('The boards did not answer.'));
	if (account) account = { ...account, share: res.body.share };
	tell();
	return res.body.share;
}

/* ------------------------------------------------------------------ *
 * Pull and push
 * ------------------------------------------------------------------ */

/**
 * The first pull after signing in, which is the only one that has to
 * make a decision.
 *
 * Afterwards both sides agree on a revision and conflicts are detected
 * by the server. Here there is no shared history yet, so the four cases
 * are spelled out: whichever side is empty loses, and when both have
 * something the user is asked rather than guessed at.
 */
async function firstPull() {
	if (!account || resolving) return;

	// `api` throws when the network itself is down, and that must not
	// escape: initSync awaits this, and an escaped rejection would end
	// sync for the whole session over a bad first second.
	let got;
	try {
		got = await api('GET', '/api/state');
	} catch {
		got = { ok: false };
	}
	if (!got.ok) {
		// This is the one pull that decides everything -- without it the
		// revision is unknown and every later push is a guess. So it does
		// not give up: try again, a little later each time.
		say('error', T('could not reach the server — retrying'));
		failures++;
		setTimeout(firstPull, Math.min(RETRY_MIN * 2 ** (failures - 1), RETRY_MAX));
		return;
	}
	failures = 0;

	const remote = got.body;
	const localEmpty = isEmpty(store.saveShape());

	// Nothing stored yet: this browser's copy becomes the first save.
	if (remote.rev === 0 || !remote.data) {
		setRev(0);
		return push(true);
	}

	// Nothing here yet: take what is stored, no question needed.
	if (localEmpty) {
		return take(remote, T('Loaded your saved inventory'));
	}

	const remoteText = JSON.stringify(remote.data);
	if (remoteText === localText()) {
		// Already the same on both sides -- adopt the revision and go quiet.
		setRev(remote.rev);
		lastPushed = localText();
		return say('idle');
	}

	askWhichCopy(remote, T('You have an inventory here and another one saved.'));
}

/** Replace what is here with what the server has. */
function take(remote, message) {
	store.adopt(remote.data, T('Took the saved inventory'));
	setRev(remote.rev);
	lastPushed = localText();
	say('idle');
	if (hooks.toast) hooks.toast(message, true);
	if (hooks.rerender) hooks.rerender();
}

/** Send this browser's copy up. `force` skips the unchanged check. */
async function push(force = false) {
	if (!account || resolving) return;
	// Example data is on screen. Try again when it is not, rather than
	// dropping the change that was queued before the tour started.
	if (store.isTransient()) return schedulePush();
	const text = localText();
	if (!force && text === lastPushed) return say('idle');
	// Something is already in the air. Note that there is more to send and
	// let that push hand over when it lands, rather than waiting out
	// another full delay for a change that is ready now.
	if (inFlight) {
		again = true;
		return;
	}

	inFlight = true;
	clearTimeout(pushTimer);
	pushTimer = null;
	say('syncing');
	try {
		const res = await api('PUT', '/api/state', {
			rev: rev(),
			data: JSON.parse(text),
			device: deviceName()
		});

		if (res.ok) {
			setRev(res.body.rev);
			lastPushed = text;
			failures = 0;
			landed();
			return say('idle');
		}
		if (res.status === 409) {
			// Another browser got there first. Its save came back with the
			// refusal, so we can show both without a second request -- but
			// only when it actually did. A refusal with nothing in it (a
			// proxy's error page, a server that has lost the save) offers
			// no choice to make, and "Use the saved one" on an empty body
			// would wipe the inventory it was meant to protect. That is a
			// bad moment, not a conflict: try again later.
			if (!res.body || !res.body.data) {
				retryLater();
				return say('error', T('that did not save'));
			}
			failures = 0;
			// The revision lives in the same key as the save, so another
			// tab of this browser writing its new revision wakes this one,
			// which reloads and may already have a push in the air at the
			// old number. The server refuses it -- and hands back what
			// that tab saved, which is byte for byte what was sent. Two
			// identical copies are not a choice to put to anyone: adopt
			// the revision and go quiet.
			if (JSON.stringify(res.body.data) === text) {
				setRev(res.body.rev);
				lastPushed = text;
				return say('idle');
			}
			return askWhichCopy(res.body, T('Another device saved while you were working.'));
		}
		// The account behind this session was deleted -- from another
		// device, since this one still thinks it is signed in. Sign out
		// here too; the local copy stays, as it does for any sign-out.
		if (res.status === 410) {
			account = null;
			setRev(0);
			lastPushed = null;
			say('out');
			if (hooks.toast) hooks.toast(T('That account was deleted, so nothing is saved online any more. Your inventory is still here.'));
			return;
		}
		if (res.status === 401) {
			account = null;
			return say('out');
		}
		// Too fast, not wrong. The save is fine and will go through; it
		// just has to wait, which is what the backoff already does.
		if (res.status === 429) {
			retryLater();
			return say('syncing', T('saving shortly'));
		}
		// Any other 4xx is about this save and will not get better by being
		// sent again; anything else is the server having a moment, and is
		// worth another try.
		if (res.status >= 500) retryLater();
		say('error', (res.body && res.body.error) || T('that did not save'));
	} catch {
		// Offline, most likely. The local copy is untouched, and this will
		// keep trying quietly until the network comes back -- so it is a
		// state, not a failure.
		retryLater();
		say('error', T('offline — your data is safe here'));
	} finally {
		inFlight = false;
		// A change that arrived mid-flight goes now, not in half a second.
		if (again) {
			again = false;
			schedulePush(0);
		}
	}
}

function schedulePush(delay = PUSH_DELAY) {
	if (!account || resolving) return;
	clearTimeout(pushTimer);
	pushTimer = setTimeout(() => push(), delay);
}

/** Come back to a push that did not land, a little later each time. */
function retryLater() {
	failures++;
	schedulePush(Math.min(RETRY_MIN * 2 ** (failures - 1), RETRY_MAX));
}

/** Check for someone else's changes -- on focus, and when asked. */
async function pull() {
	if (!account || resolving || inFlight || store.isTransient()) return;
	const got = await api('GET', '/api/state');
	if (!got.ok || !got.body) return;
	const remote = got.body;
	// Only ever move forwards. A server that lost an unflushed revision --
	// a hard restart, a flush that never landed -- comes back naming a
	// revision older than the one this browser already has, and adopting
	// that would quietly undo work nobody asked to undo. Sitting still is
	// safe: the next push settles it, through the conflict dialog if the
	// two have genuinely diverged.
	if (remote.rev <= rev() || !remote.data) return;

	// The stored save has moved on. If nothing has changed here since our
	// last push, taking it is safe and silent.
	if (localText() === lastPushed) {
		return take(remote, T('Updated from {device}', { device: remote.device || T('another device') }));
	}
	askWhichCopy(remote, T('Another device saved while you were working.'));
}

/* ------------------------------------------------------------------ *
 * Conflicts
 * ------------------------------------------------------------------ */

const countOf = data => ({
	items: Object.keys((data && data.stock) || {}).length,
	builds : ((data && data.targets) || []).length
});

const when = ms => {
	if (!ms) return T('at some point');
	const mins = Math.round((Date.now() - ms) / 60000);
	if (mins < 1) return T('just now');
	if (mins < 60) return mins === 1 ? T('{n} minute ago', { n: mins }) : T('{n} minutes ago', { n: mins });
	const hours = Math.round(mins / 60);
	if (hours < 24) return hours === 1 ? T('{n} hour ago', { n: hours }) : T('{n} hours ago', { n: hours });
	const days = Math.round(hours / 24);
	return days === 1 ? T('{n} day ago', { n: days }) : T('{n} days ago', { n: days });
};

/**
 * Two copies, and no way to tell which is wanted.
 *
 * Merging them is the tempting answer and the wrong one: an inventory is
 * a set of counts, and there is no arithmetic that turns "400 stones
 * here, 250 there" into a number that was ever true. So both are
 * described, neither is touched until the choice is made, and whichever
 * loses is still one Undo away.
 */
function askWhichCopy(remote, headline) {
	if (resolving) return;
	resolving = true;
	say('conflict');
	clearTimeout(pushTimer);

	const mine = countOf(store.saveShape());
	const theirs = countOf(remote.data);
	const from = remote.device ? T('on {device}', { device: remote.device }) : T('elsewhere');

	const host = hooks.openDialog(`
		<h2>${T('Two copies of your inventory')}</h2>
		<p>${esc(headline)} ${T('Nothing has been changed yet — pick the one to keep, and the other is still one Undo away.')}</p>
		<div class="dialog-list">
			<div class="dialog-row"><span>${T('Here on {device}', { device: esc(deviceName()) })}</span><span class="n">${T('{items} items · {builds} builds', { items: mine.items, builds: mine.builds })}</span></div>
			<div class="dialog-row"><span>${T('Saved {where}, {when}', { where: esc(from), when: esc(when(remote.updatedAt)) })}</span><span class="n">${T('{items} items · {builds} builds', { items: theirs.items, builds: theirs.builds })}</span></div>
		</div>
		<div class="dialog-actions">
			<button class="act quiet" data-keep-remote>${T('Use the saved one')}</button>
			<button class="act" data-keep-local>${T('Keep what is here')}</button>
		</div>
	`, {
		// Clicking past the dialog is not an answer, and it must not jam
		// the works: `resolving` held pushes only while the question was
		// on screen. Nothing is decided on the user's behalf -- the two
		// copies still disagree, so the very next push meets the same
		// refusal and asks again, and a pull on refocus does too.
		onDismiss: () => {
			resolving = false;
			say('conflict');
		}
	});

	host.querySelector('[data-keep-local]').addEventListener('click', async () => {
		hooks.closeDialog();
		resolving = false;
		// Adopt the winning revision so our push is no longer stale, then
		// send this browser's copy over the top of it.
		setRev(remote.rev);
		await push(true);
	});

	host.querySelector('[data-keep-remote]').addEventListener('click', () => {
		hooks.closeDialog();
		resolving = false;
		take(remote, T('Took the saved inventory'));
	});
}

/* ------------------------------------------------------------------ *
 * The header chip
 * ------------------------------------------------------------------ */

const NOTE = {
	syncing: () => T('Saving…'),
	idle: () => T('Synced'),
	conflict: () => T('Needs a decision'),
	error: () => T('Not saved')
};

function avatarURL(user) {
	return user.avatar
		? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`
		: null;
}

function paint() {
	const host = document.getElementById('account');
	if (!host) return;

	if (!available) {
		host.innerHTML = '';
		return;
	}

	if (!account) {
		host.innerHTML = `<button class="ghost-btn" data-act="signin" title="${T('Sign in to keep this inventory on your other devices')}">${T('Sign in')}</button>`;
		return;
	}

	const src = avatarURL(account);
	const note = said(detail) || (NOTE[status] ? NOTE[status]() : '');
	host.innerHTML = `<button class="ghost-btn account-chip ${esc(status)}" data-act="account"
			title="${esc(account.username)} — ${esc(note)}">
		${src ? `<img class="account-avatar" src="${esc(src)}" alt="" width="20" height="20">` : ''}
		<span class="account-name">${esc(account.username)}</span>
		<span class="account-note">${esc(note)}</span>
	</button>`;
}

function openAccountDialog() {
	const host = hooks.openDialog(`
		<h2>${esc(account.username)}</h2>
		<p>${T('Your inventory is saved to your Discord account, so the same one follows you between machines.')} ${esc(said(detail) || (NOTE[status] ? NOTE[status]() : ''))}.</p>
		${feature('community') ? `<p class="dialog-copy">${account.share === 'named' ? T('You are on the <b>community boards</b> by name.') : account.share === 'anon' ? T('You are on the <b>community boards</b> as an unnamed sailor.') : T('You are not on the <b>community boards</b>; nothing about your save is shown to anyone.')} <a href="#community" data-act="view" data-id="community">${T('Open the boards')}</a></p>` : ''}
		<div class="dialog-actions">
			<button class="act quiet" data-forget>${T('Delete my saved data')}</button>
			<button class="act quiet" data-signout>${T('Sign out')}</button>
			<button class="act" data-now>${T('Sync now')}</button>
		</div>
	`);

	host.querySelector('[data-now]').addEventListener('click', async () => {
		hooks.closeDialog();
		await pull();
		await push(true);
	});

	host.querySelector('[data-signout]').addEventListener('click', async () => {
		try { await api('POST', '/auth/logout'); } catch { /* signed out locally all the same */ }
		account = null;
		hooks.closeDialog();
		say('out');
		tell();
		// The local copy stays exactly where it is -- signing out of a
		// device should not empty it.
		if (hooks.toast) hooks.toast(T('Signed out. Your inventory is still here.'));
	});

	host.querySelector('[data-forget]').addEventListener('click', () => {
		hooks.closeDialog();
		confirmDelete();
	});
}

function confirmDelete() {
	const host = hooks.openDialog(`
		<h2>${T('Delete your saved data?')}</h2>
		<p>${T('This removes the copy stored under your Discord account, and the account record with it. What is in this browser stays — export it first if you want a backup.')}</p>
		<div class="dialog-actions">
			<button class="act quiet" data-close>${T('Keep it')}</button>
			<button class="act bad" data-yes>${T('Delete it')}</button>
		</div>
	`);
	host.querySelector('[data-yes]').addEventListener('click', async () => {
		const res = await api('DELETE', '/api/account');
		hooks.closeDialog();
		if (!res.ok) return hooks.toast && hooks.toast(T('That could not be deleted.'));
		account = null;
		setRev(0);
		lastPushed = null;
		say('out');
		tell();
		if (hooks.toast) hooks.toast(T('Your saved data has been deleted.'));
	});
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

/** Resolve once the tour has handed the user's own data back. */
function whenReal() {
	if (!store.isTransient()) return Promise.resolve();
	return new Promise(resolve => {
		const tick = setInterval(() => {
			if (store.isTransient()) return;
			clearInterval(tick);
			resolve();
		}, 500);
	});
}

/** Report on a sign-in that came back from Discord, then tidy the URL so
 *  a refresh does not show the message again. */
function readSignInResult() {
	const params = new URLSearchParams(location.search);
	const outcome = params.get('signin');
	if (!outcome) return;
	const message = {
		cancelled: T('Sign-in cancelled — nothing has changed.'),
		expired: T('That sign-in took too long. Try again.'),
		failed: T('Discord could not sign you in. Try again in a moment.')
	}[outcome];
	if (message && hooks.toast) hooks.toast(message);
	params.delete('signin');
	const query = params.toString();
	history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
}

export function signIn() {
	// One tap used to leave for discord.com with no warning at all --
	// mid-plan, the whole page gone. Say where the door goes first.
	const host = hooks.openDialog(`
		<h2>${T('Sign in with Discord')}</h2>
		<p>${T('Sync keeps this inventory on your Discord account, so the same one follows you between machines. You will go to discord.com to sign in, and come straight back here.')}</p>
		<div class="dialog-actions">
			<button class="act quiet" data-cancel>${T('Cancel')}</button>
			<button class="act" data-go>${T('Continue to Discord')}</button>
		</div>
	`);
	host.querySelector('[data-cancel]').addEventListener('click', () => hooks.closeDialog());
	host.querySelector('[data-go]').addEventListener('click', () => {
		location.href = `/auth/discord?to=${encodeURIComponent(location.pathname + location.search)}`;
	});
}

export function openAccount() {
	if (account) openAccountDialog();
	else signIn();
}

export function isAvailable() {
	return available;
}

/**
 * Start syncing, if this deployment can.
 *
 * Everything is behind the config check, so on a static deployment this
 * costs one request that returns `{sync:false}` and then does nothing at
 * all -- no button, no listeners, no timers.
 */
export async function initSync(callbacks = {}) {
	hooks = callbacks;

	let config;
	try {
		config = await api('GET', '/api/config');
	} catch {
		return;
	}
	if (!config.ok || !config.body) return;
	features = config.body;
	// The Community tab waits on this answer; now it can be drawn.
	if (features.community && hooks.rerender) hooks.rerender();
	if (!features.sync) return;

	available = true;
	readSignInResult();

	const me = await api('GET', '/api/me');
	if (!me.ok || !me.body || !me.body.signedIn) {
		say('out');
		return;
	}

	account = { ...me.body.user, share: me.body.share || null, admin: me.body.admin === true };
	// Not "Synced" yet -- nothing has been compared. Saying so before the
	// first pull would be a claim the app cannot make.
	say('syncing');
	tell();

	// Watch for changes before the first pull rather than after it. A
	// quantity typed while that request is in flight is still a change
	// that has to reach the server, and registering afterwards would drop
	// exactly those keystrokes on the floor.
	//
	// Settings and the guided tour's example data are not changes to the
	// save; localText() not moving is what filters them out.
	store.subscribe((_state, reason) => {
		if (reason === 'settings' || reason === 'transient') return;
		if (store.isTransient()) return;
		if (localText() !== lastPushed) schedulePush();
	});

	// Coming back to the tab is the moment another machine's work is most
	// likely to be waiting.
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') pull();
	});

	// The guided tour may already be up, showing worked-through example
	// data that was never saved. Comparing that against the stored copy
	// would offer to replace a real inventory with the demo, so the first
	// pull waits until the real data is back on screen.
	await whenReal();
	await firstPull();

	// A queued push must not be lost to a closing tab. `keepalive` lets
	// the request outlive the page, which an ordinary fetch does not --
	// and unlike sendBeacon it can do the PUT the API already has, so
	// there is no write-only side door to secure.
	window.addEventListener('pagehide', () => {
		if (!account || resolving) return;
		clearTimeout(pushTimer);
		pushTimer = null;
		again = false;
		// Anything the server has not confirmed goes now, whether it was
		// waiting on the delay or on a push that is still in the air. The
		// question is not "was something queued" but "does the server have
		// this yet", and only the second one is answerable here.
		const text = localText();
		if (text === lastPushed) return;
		fetch('/api/state', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ rev: rev(), data: JSON.parse(text), device: deviceName() }),
			credentials: 'same-origin',
			keepalive: true
		}).catch(() => {
			// Nothing can be reported from a page that is going away. The
			// local copy is intact and the next visit will push it.
		});
	});
}
