// The browser's one push subscription, and what it is for.
//
// A browser gets a single endpoint from its push service, and this app
// has two things to say through it: the Vell reminder, which follows a
// region's timetable and wants no account at all, and a sailor's own
// chimes, which follow a clock set on one device and are meant to reach
// the others. One row, two purposes, so subscribing for the second must
// not quietly sign anybody up for the first.
//
// Everything here fails soft: a deployment without keys, a browser
// without a worker, a refused permission and a server that says no all
// come back the same way -- false, and the page keeps its own clock.

import { me } from './sync.js';

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
 * Subscribe this browser, or bring the row up to date. `region` is the
 * Vell timetable to follow and `vell` whether the reminder is wanted;
 * pass `vell: false` for a subscription made only so that an account's
 * chimes can reach this device. Signed in, the row is the account's as
 * well, which is the whole of how one device's clock reaches another.
 */
export async function subscribeFor({ region, vell }) {
	if (!(await pushAvailable())) return false;
	try {
		const { key } = await (await fetch('/api/push/key')).json();
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
		const res = await fetch('/api/push/subscribe', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subscription: sub.toJSON(), region, vell })
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Give up the subscription entirely: both purposes go with it. */
export async function dropSubscription() {
	try {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();
		if (!sub) return;
		await fetch('/api/push/subscribe', {
			method: 'DELETE', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ endpoint: sub.endpoint })
		}).catch(() => {});
		await sub.unsubscribe();
	} catch { /* then the server's copy dies of a 410 on its next send */ }
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
