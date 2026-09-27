// The material book: what the fleet has read of the material list.
//
// The trade list is one of forty layouts, and a few islands answered
// are enough to say which. The material list is in no such record: its
// islands roll apart from the layouts, and the only boards anyone has
// are the ones somebody read off the window. So this book is written
// from readings alone -- the handful recorded in material_boards.json
// and whatever the fleet has sent since -- and it does two sums.
//
// First, which readings are one board. A reading of the whole window on
// one day is a board; two readings that agree island for island, bar a
// slip, are the same board seen twice, whatever day they were taken.
// That is how a board that comes round again is noticed: nobody numbers
// them, the agreement does.
//
// Then, which board today's is. A sailor who has read a page of the
// window has answered a handful of islands; a board on file that
// agrees at every one of them, and is the only one that does, is very
// likely the board in front of them -- and its other islands are the
// rest of the window, unread. The screen offers them as that, never as
// fact: the sailor takes them.
//
// Identity is the island, what it takes and what it pays. The counts
// are left out: the same board pays 25 seals at one reading and 34 at
// the next, and a board is not a new one for that.
//
// Pure: readings in, boards and fits out. No store, no fetch.

/** How many islands a reading needs to count as a board in the book.
 *  A whole window is forty-odd; a page is six. Two pages is a board. */
export const MIN_BOARD = 10;

/** How many islands have to agree before two boards are called one. */
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
export function offersOf(rows = []) {
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
export function compare(a, b) {
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

/** Two readings are one board when they agree widely and part at no
 *  more than a slip a ten islands. */
export function sameBoard(c) {
	return c.agree >= MIN_SAME && c.differ.length <= Math.floor(c.agree / 10);
}

/**
 * The readings as boards: every recorded board, and the fleet's
 * readings a day at a time -- several sailors reading one day's window
 * are one board, each island taken as most of them read it.
 *
 * `record` is material_boards.json; `sightings` the fleet's material
 * readings as /api/boards?list=material returns them.
 */
export function boardsOf(record, sightings = []) {
	const boards = [];
	for (const b of (record && Array.isArray(record.boards) ? record.boards : [])) {
		boards.push({
			key: `rec:${b.id}`, id: String(b.id), day: b.day || null, filed: true,
			offers: offersOf(b.offers), readers: [], seen: 0
		});
	}
	const byDay = new Map();
	for (const s of sightings) {
		if (!s || !Array.isArray(s.offers) || !s.day) continue;
		const day = String(s.day).slice(0, 10);
		if (!byDay.has(day)) byDay.set(day, []);
		byDay.get(day).push(s);
	}
	for (const [day, list] of byDay) {
		// island -> offer id -> { offer, weight }
		const votes = new Map();
		for (const s of list) {
			const weight = 1 + (Number(s.seen) || 0);
			for (const [npcId, o] of offersOf(s.offers)) {
				if (!votes.has(npcId)) votes.set(npcId, new Map());
				const v = votes.get(npcId);
				const k = idOf(o);
				const had = v.get(k);
				v.set(k, { offer: had ? had.offer : o, weight: (had ? had.weight : 0) + weight });
			}
		}
		const offers = new Map();
		for (const [npcId, v] of votes) {
			const best = [...v.values()].sort((x, y) => y.weight - x.weight)[0];
			offers.set(npcId, best.offer);
		}
		boards.push({
			key: `day:${day}`, id: day, day, filed: false, offers,
			readers: list.map(s => ({ id: s.id, name: s.name || null, mine: Boolean(s.mine), confirmed: Boolean(s.confirmed), seen: Number(s.seen) || 0, islands: Array.isArray(s.offers) ? s.offers.length : 0, day })),
			seen: list.reduce((n, s) => n + 1 + (Number(s.seen) || 0), 0)
		});
	}
	return boards;
}

/**
 * The book: the boards, with every two that are one board made one.
 *
 * Each entry keeps the boards it was made of, so it can say how often
 * it has been seen and on which days, and its offers are the islands'
 * most-read answers across them. The biggest boards go first, so a
 * whole reading is what a partial one is matched against.
 */
export function bookOf(boards) {
	const pages = [];
	const big = boards.filter(b => b.offers.size >= MIN_BOARD).sort((a, b) => b.offers.size - a.offers.size);
	for (const b of big) {
		const home = pages.find(p => sameBoard(compare(b.offers, p.offers)));
		if (home) home.boards.push(b);
		else pages.push({ boards: [b], offers: new Map(b.offers) });
		if (home) home.offers = mergeOffers(home.boards);
	}
	return pages.map(p => {
		const days = p.boards.map(b => b.day).filter(Boolean).sort();
		const filed = p.boards.find(b => b.filed);
		return {
			// A recorded board keeps its letter; one the fleet found is
			// named for the first day it was read.
			id: filed ? filed.id : days[0],
			offers: p.offers,
			boards: p.boards,
			days,
			last: days.length ? days[days.length - 1] : null,
			filed: Boolean(filed),
			times: p.boards.length,
			readers: p.boards.flatMap(b => b.readers),
			tally: tallyOf(p.offers)
		};
	}).sort((a, b) => b.times - a.times || String(b.last || '').localeCompare(String(a.last || '')) || String(a.id).localeCompare(String(b.id)));
}

/**
 * The book when the game's own layouts are known: every one of the
 * material list's layouts is a page, whether anybody has read it yet or
 * not, and what the fleet read is filed under the page it is -- which is
 * what says how often each has come round. A reading that is no layout
 * of the game's (a patch the bake has not caught up with) is a page of
 * its own, as every page was before the game's tables were read.
 */
export function bookFromGame(layouts, boards) {
	const pages = layouts.map(l => ({ ...l, boards: [] }));
	const rest = [];
	for (const b of boards.filter(x => x.offers.size >= MIN_BOARD)) {
		let home = null, most = 0;
		for (const p of pages) {
			const c = compare(b.offers, p.offers);
			if (sameBoard(c) && c.agree > most) { home = p; most = c.agree; }
		}
		if (home) home.boards.push(b); else rest.push(b);
	}
	const made = pages.map(p => {
		const days = p.boards.map(b => b.day).filter(Boolean).sort();
		return {
			id: p.id, row: p.row, game: true, offers: p.offers, boards: p.boards, days,
			last: days.length ? days[days.length - 1] : null, filed: true,
			times: p.boards.length, readers: p.boards.flatMap(b => b.readers || []), tally: tallyOf(p.offers)
		};
	});
	return [...made, ...bookOf(rest)].sort((a, b) => b.times - a.times || String(b.last || '').localeCompare(String(a.last || '')) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

function mergeOffers(boards) {
	const votes = new Map();
	for (const b of boards) {
		for (const [npcId, o] of b.offers) {
			if (!votes.has(npcId)) votes.set(npcId, new Map());
			const v = votes.get(npcId);
			const k = idOf(o);
			const had = v.get(k);
			v.set(k, { offer: had ? had.offer : o, n: (had ? had.n : 0) + 1 });
		}
	}
	const out = new Map();
	for (const [npcId, v] of votes) out.set(npcId, [...v.values()].sort((x, y) => y.n - x.n)[0].offer);
	return out;
}

/** What a board pays, material by material: how many islands each. */
export function tallyOf(offers) {
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

/**
 * How often one island's exchange has been on a board: on how many of
 * the boards read (the book's, each counted once), out of how many
 * named that island at all.
 */
export function seenOn(pages, npcId, give, recv) {
	let n = 0;
	let of = 0;
	for (const p of pages) {
		for (const b of p.boards) {
			const o = b.offers.get(npcId);
			if (b.offers.size < MIN_BOARD) continue;
			of++;
			if (o && o.give === give && o.recv === recv) n++;
		}
	}
	return { n, of };
}
