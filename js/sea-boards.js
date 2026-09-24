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

import { T } from './i18n.js';
import { feature, me } from './sync.js';

/** What the last call brought back, so a redraw does not ask again.
 *  Short: a sighting sent by somebody else is worth having quickly. */
const FRESH_MS = 60_000;

// Two lists come off the one window: the forty layouts ('trade') and
// the ship materials ('material'), which roll on their own. Each has
// its own readings, fetched and held apart.
const listOf = x => (x === 'material' ? 'material' : 'trade');
const heldBy = { trade: { at: 0, boards: [] }, material: { at: 0, boards: [] } };
const askingBy = { trade: null, material: null };
const shelfBy = { trade: { at: 0, boards: [] }, material: { at: 0, boards: [] } };
const stale = list => {
	heldBy[list] = { at: 0, boards: heldBy[list].boards };
	shelfBy[list] = { at: 0, boards: shelfBy[list].boards };
};
const both = () => { stale('trade'); stale('material'); };

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
export async function fleetBoards({ force = false, list = 'trade' } = {}) {
	if (!shared()) return [];
	const l = listOf(list);
	if (!force && Date.now() - heldBy[l].at < FRESH_MS) return heldBy[l].boards;
	if (askingBy[l]) return askingBy[l];
	askingBy[l] = (async () => {
		const res = await api('GET', l === 'material' ? '/api/boards?list=material' : '/api/boards');
		if (res.ok && res.body && Array.isArray(res.body.boards)) {
			heldBy[l] = { at: Date.now(), boards: res.body.boards };
		}
		askingBy[l] = null;
		return heldBy[l].boards;
	})();
	return askingBy[l];
}

/** As far back as the server keeps them: what the layout book is
 *  written from. Asked for when the book is opened and not before --
 *  two months of readings are of no use to a bar that wants today's. */
export async function fleetHistory({ days = 60, force = false, list = 'trade' } = {}) {
	if (!shared()) return [];
	const l = listOf(list);
	if (!force && Date.now() - shelfBy[l].at < FRESH_MS) return shelfBy[l].boards;
	const res = await api('GET', `/api/boards?days=${days}${l === 'material' ? '&list=material' : ''}`);
	if (res.ok && res.body && Array.isArray(res.body.boards)) shelfBy[l] = { at: Date.now(), boards: res.body.boards };
	return shelfBy[l].boards;
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
export async function tellFleet(day, layout, offers, list = 'trade') {
	if (!shared()) return { ok: false, why: T('This deployment keeps no boards.') };
	if (!me()) return { ok: false, why: T('Sign in to put your name to a reading.') };
	const l = listOf(list);
	const res = await api('POST', '/api/boards', {
		day,
		list: l,
		layout: l === 'material' ? null : layout || null,
		offers: offers.map(o => [o.npcId, o.give, String(o.qty || 1), o.recv])
	});
	stale(l);   // ask again next time
	if (!res.ok) return { ok: false, why: (res.body && res.body.error) || T('The reading did not reach the server.') };
	return { ok: true, id: res.body.id, offers: res.body.offers };
}

/** Somebody else's reading is the board you are looking at too. */
export async function sawItToo(id) {
	if (!shared() || !me()) return { ok: false };
	const res = await api('POST', `/api/boards/${id}/seen`);
	both();
	return { ok: res.ok, why: res.body && res.body.error };
}

/** Take your own reading back. */
export async function unsay(id) {
	if (!shared() || !me()) return { ok: false };
	const res = await api('DELETE', `/api/boards/${id}`);
	both();
	return { ok: res.ok, why: res.body && res.body.error };
}

/** Forget what was fetched -- the barter day turned over, or an account
 *  signed in and the answers now have a name to them. */
export function forgetBoards() {
	for (const l of ['trade', 'material']) {
		heldBy[l] = { at: 0, boards: [] };
		shelfBy[l] = { at: 0, boards: [] };
	}
}
