// The browser's one push subscription, for a sailor's own chimes.
//
// A browser gets a single endpoint from its push service. Signed in, the
// server files it under the account, which is how a clock set on one
// device reaches the others.
//
// Everything here fails soft: a deployment without keys, a browser
// without a worker, a refused permission and a server that says no all
// come back the same way -- false, and the page keeps its own clock.

import { me, onAccount } from './sync.js';

const b64ToBytes = s => {
	const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
	return Uint8Array.from(b, c => c.charCodeAt(0));
};

/** Whether this deployment and this browser can do push at all. */
export async function pushAvailable() {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
	try {
		const cfg = await (await fetch('/api/config')).json();
		return !!(cfg && cfg.push);
	} catch {
		return false;
	}
}

/**
 * Subscribe this browser, or bring the row up to date. Signed in, the
 * row is the account's as well, which is the whole of how one device's
 * clock reaches another.
 */
export async function subscribePush() {
	if (!(await pushAvailable())) return false;
	try {
		const { key } = await (await fetch('/api/push/key')).json();
		const reg = await navigator.serviceWorker.ready;
		const had = await reg.pushManager.getSubscription();
		const sub = had || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
		const res = await fetch('/api/push/subscribe', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subscription: sub.toJSON() })
		});
		return res.ok;
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ *
 * The chimes an account has asked for
 * ------------------------------------------------------------------ */

/** Whether an account is signed in here at all: without one there is
 *  nothing to reach the other devices by. */
export const canReachDevices = () => !!me();

/**
 * Hand the server a set of chimes under a tag, replacing whatever
 * stood there. `alerts` are { at (a moment in ms), title, body }.
 * An empty list is how a schedule is taken down.
 */
export async function putAlerts(tag, alerts) {
	if (!canReachDevices()) return false;
	try {
		const res = await fetch('/api/push/alerts', {
			method: 'PUT', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tag, alerts })
		});
		return res.ok;
	} catch {
		return false;
	}
}

export async function clearAlerts(tag) {
	if (!canReachDevices()) return false;
	try {
		const res = await fetch('/api/push/alerts', {
			method: 'DELETE', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ tag })
		});
		return res.ok;
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ *
 * Chimes as Discord messages
 * ------------------------------------------------------------------ */

let dm = null;

/** What the server said last: `{ available, on }`, or null when the
 *  deployment has no bot or nobody is signed in. */
export const discordDm = () => dm;

export async function loadDiscordDm() {
	dm = null;
	if (!canReachDevices()) return null;
	try {
		const cfg = await (await fetch('/api/config')).json();
		if (!cfg || !cfg.discordDm) return null;
		const res = await fetch('/api/discord-dm');
		dm = res.ok ? await res.json() : null;
	} catch {
		dm = null;
	}
	return dm;
}

onAccount(() => { loadDiscordDm(); });

/** Switch the messages on or off. `{ ok, error }`: the server sends the
 *  first one itself, so a refusal from Discord comes back here. */
export async function setDiscordDm(on) {
	try {
		const res = await fetch('/api/discord-dm', {
			method: 'PUT', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ on })
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) return { ok: false, error: body.error || '' };
		dm = { available: true, on: Boolean(body.on) };
		return { ok: true };
	} catch {
		return { ok: false, error: '' };
	}
}
