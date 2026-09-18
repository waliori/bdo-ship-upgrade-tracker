// What the fleet saw: the browser's half of /api/boards.
//
// The barter board is the same for everyone on a server and it is
// redrawn at the refill, so a board somebody else read an hour ago is
// the board in front of you. This fetches those readings, sends yours,
// and says "I saw the same" about somebody else's.
//
// Nothing here decides anything. Which layout a reading is, whether it
// agrees with the forty the app knows, and what to do when it does not
// are screen-barter's questions -- this only carries the post.

import { feature, me } from './sync.js';

/** What the last call brought back, so a redraw does not ask again.
 *  Short: a sighting sent by somebody else is worth having quickly. */
const FRESH_MS = 60_000;
let held = { at: 0, boards: [] };
let asking = null;

async function api(method, path, body) {
	const res = await fetch(path, {
		method,
		headers: body ? { 'Content-Type': 'application/json' } : undefined,
		body: body ? JSON.stringify(body) : undefined,
		credentials: 'same-origin'
	});
	let payload = null;
	try { payload = await res.json(); } catch { /* a proxy's error page, not ours */ }
	return { ok: res.ok, status: res.status, body: payload };
}

/** Does this deployment carry the fleet's readings at all? It rides
 *  with sync: no accounts, nobody to put a name to a sighting. */
export function shared() {
	return feature('sync');
}

/** Everything the fleet has read lately, newest first. Held for a
 *  minute; `force` is for just after sending one of your own. */
export async function fleetBoards({ force = false } = {}) {
	if (!shared()) return [];
	if (!force && Date.now() - held.at < FRESH_MS) return held.boards;
	if (asking) return asking;
	asking = (async () => {
		const res = await api('GET', '/api/boards');
		if (res.ok && res.body && Array.isArray(res.body.boards)) {
			held = { at: Date.now(), boards: res.body.boards };
		}
		asking = null;
		return held.boards;
	})();
	return asking;
}

/** The readings of one barter day, the most confirmed first and the
 *  newest before the older. */
export async function boardsFor(day, opts) {
	return (await fleetBoards(opts))
		.filter(b => b.day === day)
		.sort((a, b) => b.seen - a.seen || b.at - a.at);
}

/**
 * Tell the fleet what you saw.
 *
 * `offers` are `{ npcId, give, qty, recv }` -- what the app already
 * keeps as today's answers. Sending twice in a day is not two
 * sightings: the server merges them, so the honest thing to do is send
 * again whenever another island has been looked at.
 */
export async function tellFleet(day, layout, offers) {
	if (!shared()) return { ok: false, why: 'This deployment keeps no boards.' };
	if (!me()) return { ok: false, why: 'Sign in to put your name to a reading.' };
	const res = await api('POST', '/api/boards', {
		day,
		layout: layout || null,
		offers: offers.map(o => [o.npcId, o.give, String(o.qty || 1), o.recv])
	});
	held = { at: 0, boards: held.boards };   // ask again next time
	if (!res.ok) return { ok: false, why: (res.body && res.body.error) || 'The reading did not reach the server.' };
	return { ok: true, id: res.body.id, offers: res.body.offers };
}

/** Somebody else's reading is the board you are looking at too. */
export async function sawItToo(id) {
	if (!shared() || !me()) return { ok: false };
	const res = await api('POST', `/api/boards/${id}/seen`);
	held = { at: 0, boards: held.boards };
	return { ok: res.ok, why: res.body && res.body.error };
}

/** Take your own reading back. */
export async function unsay(id) {
	if (!shared() || !me()) return { ok: false };
	const res = await api('DELETE', `/api/boards/${id}`);
	held = { at: 0, boards: held.boards };
	return { ok: res.ok, why: res.body && res.body.error };
}

/** Forget what was fetched -- the barter day turned over, or an account
 *  signed in and the answers now have a name to them. */
export function forgetBoards() {
	held = { at: 0, boards: [] };
}
