// The material book: the game's material layouts, M1 to M41, and which
// of them today's material list is.
//
// The material list is one of forty-one layouts in the client's own
// tables (barter_game.js, read through barter-layouts.js), as the trade
// list is one of forty. A sailor who has read a page of the window has
// answered a handful of islands; a layout that agrees at every one of
// them, and is the only one that does, is the list in front of them --
// and its other islands are the rest of the window, unread. The screen
// offers them as that, never as fact: the sailor takes them.
//
// (The book was once written from the fleet's readings alone, before
// the client's layouts were read. That side of it went with the fleet's
// material sharing, on 2026-09-28.)
//
// Identity is the island, what it takes and what it pays. The counts
// are left out: the same layout pays 25 seals at one reading and 34 at
// the next.
//
// Pure: layouts and answers in, pages and fits out. No store, no fetch.

/** How many islands have to agree before a page that parts at one is
 *  still let stand: one slip is forgiven on a page that agrees widely. */
export const MIN_SAME = 8;

/** How many answered islands have to agree before a board is offered
 *  as today's: fewer, and two boards sharing a common slot fit alike. */
export const MIN_FIT = 3;

/** An offer's identity: what the island takes and what it pays. */
const idOf = o => `${o.give}→${o.recv}`;
/** Whether two offers are the same, where either may be a slot the game
 *  fills at random: then any of its options is it. */
const sameOffer = (o, p) => idOf(o) === idOf(p)
	|| (p.options && p.options.some(x => idOf(x) === idOf(o)))
	|| (o.options && o.options.some(x => idOf(x) === idOf(p)));
/** An offer the book can say is on today's window: not a random slot,
 *  and not one that shows less than every other day. */
const certain = o => !o.options && !(o.chance < 0.5);

/** A reading's rows, any of the shapes they come in, as a Map of
 *  island -> { give, recv, giveN, recvN }. The record's rows are
 *  `[npcId, give, giveN, recv, recvN, left]`; the fleet's are
 *  `[npcId, give, giveN, recv]`; today's answers are objects. */
function offersOf(rows = []) {
	const out = new Map();
	for (const r of rows) {
		const npcId = Number(Array.isArray(r) ? r[0] : r && r.npcId);
		const give = String((Array.isArray(r) ? r[1] : r && r.give) || '');
		const recv = String((Array.isArray(r) ? r[3] : r && r.recv) || '');
		if (!npcId || !give || !recv) continue;
		const giveN = Number(Array.isArray(r) ? r[2] : r.giveN || r.qty) || 1;
		const recvN = Number(Array.isArray(r) ? r[4] : r.recvN) || 0;
		out.set(npcId, { give, recv, giveN, recvN });
	}
	return out;
}

/**
 * How two readings stand to each other: the islands both name and
 * agree on, the ones both name and part at, and the ones only one
 * names -- which is no evidence either way.
 */
function compare(a, b) {
	let agree = 0;
	const differ = [];
	for (const [npcId, o] of a) {
		const p = b.get(npcId);
		if (!p) continue;
		if (sameOffer(o, p)) agree++;
		else differ.push(npcId);
	}
	return { agree, differ };
}

/**
 * The book: every one of the material list's layouts is a page, with
 * what it pays tallied. `times` and the rest of the page's shape stay,
 * nought and empty, for the screens that sort and draw by them.
 */
export function bookFromGame(layouts) {
	return layouts.map(p => ({
		id: p.id, row: p.row, game: true, offers: p.offers, boards: [], days: [],
		last: null, filed: true, times: 0, readers: [], tally: tallyOf(p.offers)
	})).sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

/** What a board pays, material by material: how many islands each. */
function tallyOf(offers) {
	const out = new Map();
	for (const o of offers.values()) out.set(o.recv, (out.get(o.recv) || 0) + 1);
	return [...out].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/**
 * Which board on file today's answers are.
 *
 * Every page is weighed against the answers: where it agrees, where it
 * parts, and what it would add. A page that parts nowhere still stands
 * (one slip is forgiven on a page that agrees widely). The fit is
 * `sure` when exactly one standing page agrees at MIN_FIT islands or
 * more -- or exactly one of them agrees everywhere; then `fill` is what
 * it says of the islands not yet answered, less the slots the game
 * fills at random and the offers that show less than every other day.
 * When several stand, `splitter` is the island that tells them apart
 * best, so the sailor knows which row of the window to read next.
 */
export function fitOf(answers, pages) {
	const mine = offersOf(answers);
	if (!mine.size || !pages.length) return { standing: [], best: null, sure: false, fill: [], splitter: null, answered: mine.size };
	const weighed = pages.map(page => {
		const c = compare(mine, page.offers);
		return { page, agree: c.agree, differ: c.differ, adds: page.offers.size - c.agree - c.differ.length };
	});
	const standing = weighed
		.filter(w => w.differ.length === 0 || (w.differ.length === 1 && w.agree >= MIN_SAME))
		.sort((a, b) => b.agree - a.agree || a.differ.length - b.differ.length || b.page.times - a.page.times);
	// A page that agrees everywhere beats pages let through on a slip:
	// the slip is forgiven for a misread, not preferred to the match.
	const agreeing = standing.filter(w => w.agree >= MIN_FIT);
	const exact = agreeing.filter(w => !w.differ.length);
	const fit = exact.length === 1 ? exact : agreeing;
	const sure = fit.length === 1;
	const best = sure ? fit[0] : null;
	const fill = best ? [...best.page.offers].filter(([npcId, o]) => !mine.has(npcId) && certain(o)).map(([npcId, o]) => ({ npcId, ...o })) : [];
	let splitter = null;
	if (!sure && fit.length > 1) {
		const at = new Map();
		for (const w of fit) {
			for (const [npcId, o] of w.page.offers) {
				if (mine.has(npcId)) continue;
				if (!at.has(npcId)) at.set(npcId, new Set());
				at.get(npcId).add(idOf(o));
			}
		}
		let most = 1;
		for (const [npcId, ids] of at) if (ids.size > most) { most = ids.size; splitter = npcId; }
	}
	return { standing, best, sure, fill, splitter, answered: mine.size };
}
