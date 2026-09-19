// The layout book: every board the sea is known to deal, and every
// board somebody saw that is not among them.
//
// A refresh deals one of forty-odd layouts, and the app ships a record
// of them. The record is a snapshot -- the game moves a slot at a
// maintenance without renumbering anything -- so beside it there is
// what the fleet has actually read (sea-boards.js): a reading that pins
// one layout is a vote that the layout still stands as written, and a
// reading that fits none is either a slip of somebody's thumb or the
// record being out of date, and what tells those apart is how many
// others looked and saw the same.
//
// This file only does the sums. Pixels are layouts-view.js's, the post
// is sea-boards.js's, and what a layout *is* stays barter-board.js's.

import { candidates, offersOf, knownAt } from './barter-board.js';
import { levelOf } from './barter.js';

/** A sighting's offers -- `[npcId, give, qty, recv]` as the server
 *  keeps them -- as the answers the board logic asks for. */
export const answersOf = offers =>
	(offers || []).map(([npcId, give, , recv]) => ({ npcId: Number(npcId), give: String(give), recv: String(recv) }));

/**
 * The layout nearest a reading, and where they part.
 *
 * Any two layouts on file differ at two dozen islands or more, so a
 * reading that parts from its nearest at one or two is that layout with
 * a slot moved -- and one that parts from everything at twenty is a new
 * board, or not a board at all.
 */
export function nearestLayout(combos, answers) {
	let best = null;
	for (const combo of combos) {
		const filed = offersOf(combo);
		const differ = [];
		let agree = 0;
		for (const a of answers) {
			const o = filed.get(a.npcId);
			if (!o) continue;
			if (o.give === a.give && o.recv === a.recv) agree++;
			else differ.push({ npcId: a.npcId, saw: { give: a.give, recv: a.recv }, filed: { give: o.give, recv: o.recv } });
		}
		if (!best || differ.length < best.differ.length || (differ.length === best.differ.length && agree > best.agree)) {
			best = { combo, agree, differ };
		}
	}
	return best;
}

/**
 * A layout the game has edited, recognised from what a sailor saw.
 *
 * When nothing on file fits, the likeliest story by far is not a new
 * board but an old one with a slot moved: the game does that at a
 * maintenance, without renumbering anything. So the answers that stop
 * every layout fitting are set aside, and if what is left pins exactly
 * one layout -- and pins it on more islands than were set aside, or a
 * single odd island could drag any reading onto any layout -- the board
 * is that layout, with those islands as the sailor saw them.
 *
 * What comes back is a layout in its own right, with the base's number
 * (its row in the client's table is still its row) and `patched`, the
 * islands that are the sailor's word and not the record's. Null when
 * the reading is too thin or too strange to say.
 */
export function driftOf(combos, answers, { most = 3, least = 3 } = {}) {
	if (!answers.length || candidates(combos, answers).length) return null;
	const near = nearestLayout(combos, answers);
	if (!near || !near.differ.length || near.differ.length > most) return null;
	if (near.agree < least || near.agree < near.differ.length * 2) return null;
	const odd = new Set(near.differ.map(d => d.npcId));
	const rest = answers.filter(a => !odd.has(a.npcId));
	const fits = candidates(combos, rest);
	if (fits.length !== 1 || fits[0].id !== near.combo.id) return null;
	const base = near.combo;
	const seen = new Map(near.differ.map(d => [d.npcId, d.saw]));
	return {
		...base,
		offers: base.offers.map(o => (seen.has(o[0]) ? [o[0], seen.get(o[0]).give, '1', seen.get(o[0]).recv] : o)),
		filled: (base.filled || []).filter(id => !odd.has(id)),
		patched: [...odd],
		was: near.differ
	};
}

/** What a layout pays, counted by the level of the good: the shape of
 *  a board at a glance. Coins and the odd trade box are `other`. */
export function levelsOf(combo) {
	const out = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, coin: 0, other: 0 };
	for (const [, , , recv] of combo.offers) {
		const lv = levelOf(recv);
		if (lv) out[lv]++;
		else if (recv === 'Crow Coin') out.coin++;
		else out.other++;
	}
	return out;
}

/** Two readings of one day are one board when no island is said to
 *  show two things. */
const agreeing = (a, b) => {
	const seen = new Map(a.map(x => [x.npcId, `${x.give}|${x.recv}`]));
	return b.every(x => !seen.has(x.npcId) || seen.get(x.npcId) === `${x.give}|${x.recv}`);
};

/**
 * The book.
 *
 * `sightings` are what /api/boards gave back, any number of days of
 * them. Out come the layouts on file, each with what the fleet has said
 * of it, and the strays: boards that fit nothing on file, a day's
 * agreeing readings gathered into one, the best attested first.
 *
 * A reading that leaves several layouts standing pins none and is
 * counted for none -- three islands of a board are true of a dozen
 * layouts and evidence for no one of them.
 */
export function bookOf(combos, sightings, { today = '', answers = [] } = {}) {
	const standing = new Set((answers.length ? candidates(combos, answers) : combos).map(c => c.id));
	const pages = new Map(combos.map(c => [c.id, {
		id: c.id, combo: c, filed: c.seen || 0, levels: levelsOf(c),
		standing: standing.has(c.id), today: Boolean(answers.length) && standing.size === 1 && standing.has(c.id),
		readers: [], sailors: 0, confirms: 0, days: []
	}]));
	const loose = [];
	let open = 0;
	for (const s of sightings || []) {
		const said = answersOf(s.offers);
		if (!said.length) continue;
		const fits = candidates(combos, said);
		if (fits.length === 1) {
			const page = pages.get(fits[0].id);
			page.sailors++;
			page.confirms += s.seen || 0;
			if (!page.days.includes(s.day)) page.days.push(s.day);
			page.readers.push({ id: s.id, name: s.name || null, mine: Boolean(s.mine), day: s.day, islands: said.length, seen: s.seen || 0 });
		} else if (!fits.length) loose.push({ ...s, said });
		else open++;
	}
	for (const page of pages.values()) page.days.sort().reverse();

	// the strays, a day at a time, agreeing readings as one board
	const strays = [];
	for (const s of loose.sort((a, b) => (b.seen || 0) - (a.seen || 0) || b.at - a.at)) {
		let home = strays.find(g => g.day === s.day && agreeing(g.said, s.said));
		if (!home) {
			home = { key: `${s.day}#${s.id}`, day: s.day, said: [], readers: [], seen: 0, today: s.day === today };
			strays.push(home);
		}
		for (const a of s.said) if (!home.said.some(x => x.npcId === a.npcId)) home.said.push(a);
		home.readers.push({ id: s.id, name: s.name || null, mine: Boolean(s.mine), confirmed: Boolean(s.confirmed), islands: s.said.length, seen: s.seen || 0 });
		home.seen += s.seen || 0;
	}
	for (const g of strays) {
		g.near = nearestLayout(combos, g.said);
		// held up against everything the game is known to deal at each
		// island, on any layout: what is known nowhere is either new to
		// the game or a slip, and is counted apart
		g.unknown = g.said.filter(a => !knownAt(combos, a.npcId, a.give, a.recv)).length;
		// how far to believe it: everyone who read it and everyone who
		// then said they saw the same
		g.weight = g.readers.length + g.seen;
	}
	strays.sort((a, b) => (b.today - a.today) || b.weight - a.weight || (a.day < b.day ? 1 : -1));
	return { layouts: [...pages.values()], strays, open, standing: standing.size };
}

/** The layouts a word finds: an island's name or a good's, in what a
 *  layout takes or pays. `nameOf` turns a barterer's id into the words
 *  a sailor would type. */
export function searchBook(layouts, query, nameOf) {
	const q = String(query || '').trim().toLowerCase();
	if (!q) return layouts.map(page => ({ page, hits: null }));
	// a layout's own number is asked for by number, and "3" is in half the goods' names
	const byId = layouts.filter(page => String(page.id).toLowerCase() === q);
	if (byId.length) return byId.map(page => ({ page, hits: null }));
	const out = [];
	for (const page of layouts) {
		const hits = page.combo.offers.filter(([id, give, , recv]) =>
			give.toLowerCase().includes(q) || recv.toLowerCase().includes(q) || nameOf(id).toLowerCase().includes(q)).map(o => o[0]);
		if (hits.length) out.push({ page, hits: new Set(hits) });
	}
	return out;
}
