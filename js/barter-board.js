// Today's board: which of the forty layouts the sea is showing.
//
// The trade-goods barters are not rolled island by island. Every
// refresh the whole board is one of forty fixed layouts -- the
// community's record of them is js/barter_combos.json, read by
// tools/fetch-barter-combos.mjs -- so one island's offer, looked at in
// the game, names the layout, and with it what every other island is
// showing. The material islands are the exception: they roll on their
// own and are not part of any layout.
//
// Pure: the layouts, the answers and the codex table come in, the
// standing layouts, the island worth asking about next, and the board
// as a barter table go out.

import { levelOf } from './barter.js';

const offerMaps = new WeakMap();

/** A layout's offers by barterer: id to { give, qty, recv }. */
export function offersOf(combo) {
	let m = offerMaps.get(combo);
	if (!m) {
		m = new Map(combo.offers.map(([id, give, qty, recv]) => [id, { give, qty, recv }]));
		offerMaps.set(combo, m);
	}
	return m;
}

/** The layouts every answer leaves standing. An answer is what one
 *  island was seen to show: { npcId, give, recv }. */
export function candidates(combos, answers) {
	return combos.filter(c => answers.every(a => {
		const o = offersOf(c).get(a.npcId);
		return !!o && o.give === a.give && o.recv === a.recv;
	}));
}

/** What one island can show across the layouts standing: each
 *  distinct offer and the layouts that show it, commonest first. */
export function offersAt(combos, npcId) {
	const seen = new Map();
	for (const c of combos) {
		const o = offersOf(c).get(npcId);
		if (!o) continue;
		const key = `${o.give}|${o.recv}`;
		if (!seen.has(key)) seen.set(key, { ...o, ids: [] });
		seen.get(key).ids.push(c.id);
	}
	return [...seen.values()].sort((a, b) => b.ids.length - a.ids.length || a.give.localeCompare(b.give));
}

/**
 * The islands worth looking at, best first: the one whose offer leaves
 * the fewest layouts standing at worst, then the one with the most
 * different offers, then the nearest to `near`. An island every
 * standing layout agrees on tells nothing and is left out.
 */
export function askable(combos, npcById, near = null) {
	const ids = new Set(combos.flatMap(c => c.offers.map(o => o[0])));
	const out = [];
	for (const id of ids) {
		if (!npcById.has(id)) continue;
		const offers = offersAt(combos, id);
		if (offers.length < 2) continue;
		out.push({ npcId: id, worst: Math.max(...offers.map(o => o.ids.length)), distinct: offers.length });
	}
	const d = id => { const n = npcById.get(id); return near ? Math.hypot(n.x - near.x, n.y - near.y) : 0; };
	return out.sort((a, b) => a.worst - b.worst || b.distinct - a.distinct || d(a.npcId) - d(b.npcId) || npcById.get(a.npcId).name.localeCompare(npcById.get(b.npcId).name));
}

/**
 * A layout as a barter table, in the shape js/all_barter.json has, so
 * the ladder, the chart's marks and the run planners read today's
 * board exactly the way they read the whole table. The attempts and
 * the quantity received are the codex's where it has the exchange; the
 * few offers the record saw dealt that the codex never listed are
 * given as one for one, capped by their rung.
 *
 * The ship-material exchanges ride along unchanged: those islands roll
 * on their own, so for them the whole table is still the truth. And a
 * [Level 7] is named by its island, not by the record: the layout fixes
 * what the six [Level 7] islands take, but which of its own four goods
 * each pays was seen to differ from the record on the same layout, so
 * only the level is certain -- which is all the weight and the price
 * hang on.
 */
export function boardData(combo, barterData, npcById) {
	const codex = new Map();
	const entries = new Map();
	for (const e of barterData || []) {
		if (levelOf(e.name) === null && e.name !== 'Crow Coin') entries.set(e.name, { ...e, sources: [...e.sources] });
		for (const s of e.sources) codex.set(`${s.npc_id}|${s.give.name}|${e.name}`, { entry: e, source: s });
	}
	for (const [id, give, qty, recv] of combo.offers) {
		const known = codex.get(`${id}|${give}|${recv}`);
		const name = levelOf(recv) === 7 ? `[Level 7] one of ${npcById.get(id).at}'s goods` : recv;
		if (!entries.has(name)) {
			const e = known && name === recv ? known.entry : null;
			entries.set(name, { id: e ? e.id : name, name, ...(e && e.icon ? { icon: e.icon } : {}), sources: [] });
		}
		const src = known ? known.source : null;
		entries.get(name).sources.push({
			npc_id: id,
			npc_name: src ? src.npc_name : npcById.get(id).name,
			attempts_available: src ? src.attempts_available : 0,
			give: { ...(src ? src.give : { name: give }), quantity: qty },
			quantity_received: src ? src.quantity_received : '1'
		});
	}
	return [...entries.values()];
}
