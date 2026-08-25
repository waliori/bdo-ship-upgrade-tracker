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
let account = null;      // { id, username, avatar } once signed in
let available = false;   // does this deployment offer sync at all
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
 *  the same inventory always produces the same text to compare. */
function localText() {
	const save = store.saveShape();
	const stock = {};
	for (const key of Object.keys(save.stock).sort()) stock[key] = save.stock[key];
	const strategy = {};
	for (const key of Object.keys(save.strategy).sort()) strategy[key] = save.strategy[key];
	return JSON.stringify({ stock, targets: save.targets, strategy });
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
	const got = await api('GET', '/api/state');
	if (!got.ok) return say('error', 'could not reach the server');

	const remote = got.body;
	const localEmpty = isEmpty(store.saveShape());

	// Nothing stored yet: this browser's copy becomes the first save.
	if (remote.rev === 0 || !remote.data) {
		setRev(0);
		return push(true);
	}

	// Nothing here yet: take what is stored, no question needed.
	if (localEmpty) {
		return take(remote, 'Loaded your saved inventory');
	}

	const remoteText = JSON.stringify(remote.data);
	if (remoteText === localText()) {
		// Already the same on both sides -- adopt the revision and go quiet.
		setRev(remote.rev);
		lastPushed = localText();
		return say('idle');
	}

	askWhichCopy(remote, 'You have an inventory here and another one saved.');
}

/** Replace what is here with what the server has. */
function take(remote, message) {
	store.adopt(remote.data, 'Took the saved inventory');
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
			return say('idle');
		}
		if (res.status === 409) {
			// Another browser got there first. Its save came back with the
			// refusal, so we can show both without a second request.
			failures = 0;
			return askWhichCopy(res.body, 'Another device saved while you were working.');
		}
		if (res.status === 401) {
			account = null;
			return say('out');
		}
		// Too fast, not wrong. The save is fine and will go through; it
		// just has to wait, which is what the backoff already does.
		if (res.status === 429) {
			retryLater();
			return say('syncing', 'saving shortly');
		}
		// Any other 4xx is about this save and will not get better by being
		// sent again; anything else is the server having a moment, and is
		// worth another try.
		if (res.status >= 500) retryLater();
		say('error', (res.body && res.body.error) || 'that did not save');
	} catch {
		// Offline, most likely. The local copy is untouched, and this will
		// keep trying quietly until the network comes back -- so it is a
		// state, not a failure.
		retryLater();
		say('error', 'offline — your data is safe here');
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
		return take(remote, `Updated from ${remote.device || 'another device'}`);
	}
	askWhichCopy(remote, 'Another device saved while you were working.');
}

/* ------------------------------------------------------------------ *
 * Conflicts
 * ------------------------------------------------------------------ */

const countOf = data => ({
	items: Object.keys((data && data.stock) || {}).length,
	builds : ((data && data.targets) || []).length
});

const when = ms => {
	if (!ms) return 'at some point';
	const mins = Math.round((Date.now() - ms) / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
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
	const from = remote.device ? `on ${remote.device}` : 'elsewhere';

	const host = hooks.openDialog(`
		<h2>Two copies of your inventory</h2>
		<p>${esc(headline)} Nothing has been changed yet — pick the one to keep, and the other is still one Undo away.</p>
		<div class="dialog-list">
			<div class="dialog-row"><span>Here on ${esc(deviceName())}</span><span class="n">${mine.items} items · ${mine.builds} builds</span></div>
			<div class="dialog-row"><span>Saved ${esc(from)}, ${esc(when(remote.updatedAt))}</span><span class="n">${theirs.items} items · ${theirs.builds} builds</span></div>
		</div>
		<div class="dialog-actions">
			<button class="act quiet" data-keep-remote>Use the saved one</button>
			<button class="act" data-keep-local>Keep what is here</button>
		</div>
	`);

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
		take(remote, 'Took the saved inventory');
	});
}

const esc = s => String(s).replace(/[&<>"']/g, c =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ *
 * The header chip
 * ------------------------------------------------------------------ */

const NOTE = {
	syncing: 'Saving…',
	idle: 'Synced',
	conflict: 'Needs a decision',
	error: 'Not saved'
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
		host.innerHTML = `<button class="ghost-btn" data-act="signin" title="Sign in to keep this inventory on your other devices">Sign in</button>`;
		return;
	}

	const src = avatarURL(account);
	const note = detail || NOTE[status] || '';
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
		<p>Your inventory is saved to your Discord account, so the same one follows you between machines. ${esc(detail || NOTE[status] || '')}.</p>
		<div class="dialog-actions">
			<button class="act quiet" data-forget>Delete my saved data</button>
			<button class="act quiet" data-signout>Sign out</button>
			<button class="act" data-now>Sync now</button>
		</div>
	`);

	host.querySelector('[data-now]').addEventListener('click', async () => {
		hooks.closeDialog();
		await pull();
		await push(true);
	});

	host.querySelector('[data-signout]').addEventListener('click', async () => {
		await api('POST', '/auth/logout');
		account = null;
		hooks.closeDialog();
		say('out');
		// The local copy stays exactly where it is -- signing out of a
		// device should not empty it.
		if (hooks.toast) hooks.toast('Signed out. Your inventory is still here.');
	});

	host.querySelector('[data-forget]').addEventListener('click', () => {
		hooks.closeDialog();
		confirmDelete();
	});
}

function confirmDelete() {
	const host = hooks.openDialog(`
		<h2>Delete your saved data?</h2>
		<p>This removes the copy stored under your Discord account, and the account record with it. What is in this browser stays — export it first if you want a backup.</p>
		<div class="dialog-actions">
			<button class="act quiet" data-close>Keep it</button>
			<button class="act bad" data-yes>Delete it</button>
		</div>
	`);
	host.querySelector('[data-yes]').addEventListener('click', async () => {
		const res = await api('DELETE', '/api/account');
		hooks.closeDialog();
		if (!res.ok) return hooks.toast && hooks.toast('That could not be deleted.');
		account = null;
		setRev(0);
		lastPushed = null;
		say('out');
		if (hooks.toast) hooks.toast('Your saved data has been deleted.');
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
		cancelled: 'Sign-in cancelled — nothing has changed.',
		expired: 'That sign-in took too long. Try again.',
		failed: 'Discord could not sign you in. Try again in a moment.'
	}[outcome];
	if (message && hooks.toast) hooks.toast(message);
	params.delete('signin');
	const query = params.toString();
	history.replaceState(null, '', location.pathname + (query ? `?${query}` : ''));
}

export function signIn() {
	location.href = `/auth/discord?to=${encodeURIComponent(location.pathname + location.search)}`;
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
	if (!config.ok || !config.body || !config.body.sync) return;

	available = true;
	readSignInResult();

	const me = await api('GET', '/api/me');
	if (!me.ok || !me.body || !me.body.signedIn) {
		say('out');
		return;
	}

	account = me.body.user;
	// Not "Synced" yet -- nothing has been compared. Saying so before the
	// first pull would be a claim the app cannot make.
	say('syncing');

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
