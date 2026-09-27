// Today's board: which of the forty layouts the sea is showing.
//
// The trade-goods barters are not rolled island by island. Every
// refresh the whole board is one of forty layouts -- rows of the game
// client's own table, baked by tools/bake-barter.mjs and turned into
// the record by barter-layouts.js -- so one island's offer, looked at in
// the game, names the layout, and with it what every other island is
// showing.
//
// Not every slot is fixed. A few the game fills at random from a small
// set (a [Level 4] island paying a [Level 5] or Crow Coins, a mainland
// island's four [Level 7]s), and a few show only some days. Those tell
// the layouts apart only by ruling one out that cannot show what was
// seen; the layout itself stays what it is.
//
// Pure: the layouts, the answers and the codex table come in, the
// standing layouts, the island worth asking about next, and the board
// as a barter table go out.

import { levelOf } from './barter.js';
import { dealsAt, fitsAt } from './barter-layouts.js';

const offerMaps = new WeakMap();

/** A layout's offers by barterer: id to { give, qty, recv, info }. */
export function offersOf(combo) {
	let m = offerMaps.get(combo);
	if (!m) {
		m = new Map(combo.offers.map(([id, give, qty, recv, info]) => [id, { give, qty, recv, info: info || null }]));
		offerMaps.set(combo, m);
	}
	return m;
}

/** Whether an island's slot on this layout is left to chance: a random
 *  pick, or an offer that shows only some days. */
export const rolledAt = (combo, npcId) => !!((combo.rolls && combo.rolls[npcId]) || (combo.rare && combo.rare[npcId]));

/** Every trade-good exchange the game says an island deals, on any
 *  row: `{ give, qty, recv, gate }`, each once. */
export function clientDeals(npcId) {
	return dealsAt(npcId);
}

/**
 * Whether the game is known to deal this exchange at this island at
 * all, on any layout: in the client's table for it, or on the record.
 * What a sailor saw that is known here and merely on the wrong layout
 * is a slot the game has moved; what is known nowhere is a new exchange
 * or a slip, and only other eyes can say which.
 */
export function knownAt(combos, npcId, give, recv) {
	const bare = s => String(s || '').replace(/^\[[^\]]+\]\s*/, '');
	if (dealsAt(npcId).some(o => bare(o.give) === bare(give) && bare(o.recv) === bare(recv))) return 'client';
	for (const c of combos || []) {
		const o = offersOf(c).get(npcId);
		if (o && o.give === give && o.recv === recv) return 'record';
	}
	return null;
}

/**
 * What the count opens at this island today, or null if we cannot say.
 *
 * The game gates each exchange on its own total-barter count, not each
 * barterer: an island is open to you while the one thing it is offering
 * today is not, and its barter window is then simply blank. A layout is
 * one row of every island's forty-exchange pool, so the gate is the
 * one on the offer the layout names there -- the game's own figure.
 *
 * Null where there is none to read (a board of the sailor's own):
 * unknown is treated as open, because hiding an island a sailor can
 * plainly trade at is the worse mistake of the two.
 */
export function exchangeGate(combo, npcId) {
	if (!combo) return null;
	// An island that is the sailor's word and not the layout's: the gate
	// is that exchange's own, wherever in the table the game keeps it.
	if (combo.patched && combo.patched.includes(npcId)) {
		const seen = offersOf(combo).get(npcId);
		const o = seen && dealsAt(npcId).find(x => x.give === seen.give && x.recv === seen.recv);
		return o && typeof o.gate === 'number' ? o.gate : null;
	}
	const o = offersOf(combo).get(npcId);
	return o && o.info && typeof o.info.gate === 'number' ? o.info.gate : null;
}

/**
 * The offers on this board that a barter count has not opened, as the
 * same shape the board's own shut list takes.
 *
 * This is why a board the app drew could not be sailed: the layouts
 * were recorded by players with everything unlocked, so until now the
 * app spoke for a 20,000-barter account. At 1,082 barters barely seven
 * islands in ten on a board are actually open, and a chain wants every
 * one of its rungs.
 */
export function gatedOffers(combo, count) {
	if (!combo || !Number.isFinite(Number(count))) return [];
	const n = Number(count);
	const out = [];
	for (const [npcId, o] of offersOf(combo)) {
		const gate = exchangeGate(combo, npcId);
		if (gate !== null && gate > n) out.push({ npcId, give: o.give, recv: o.recv, gate });
	}
	return out;
}

/** The layouts every answer leaves standing. An answer is what one
 *  island was seen to show: { npcId, give, recv }. A layout is ruled out
 *  by an island it says shows something else; at a slot the game fills
 *  at random, only by something none of the options is; and not at all
 *  by an island it has no trade slot for. */
export function candidates(combos, answers) {
	return combos.filter(c => answers.every(a => {
		if (!offersOf(c).has(a.npcId) && !rolledAt(c, a.npcId)) return true;
		return !!fitsAt(c, a.npcId, a.give, a.recv);
	}));
}

/** What one island can show across the layouts standing: each
 *  distinct offer and the layouts that show it, commonest first. A
 *  random slot shows any of its options. */
export function offersAt(combos, npcId) {
	const seen = new Map();
	const add = (o, id) => {
		const key = `${o.give}|${o.recv}`;
		if (!seen.has(key)) seen.set(key, { give: o.give, qty: o.qty, recv: o.recv, ids: [] });
		if (!seen.get(key).ids.includes(id)) seen.get(key).ids.push(id);
	};
	for (const c of combos) {
		const roll = c.rolls && c.rolls[npcId];
		if (roll) { for (const o of roll.options) add(o, c.id); continue; }
		if (c.rare && c.rare[npcId]) add(c.rare[npcId], c.id);
		const o = offersOf(c).get(npcId);
		if (o) add(o, c.id);
	}
	return [...seen.values()].sort((a, b) => b.ids.length - a.ids.length || a.give.localeCompare(b.give));
}

/**
 * The islands worth looking at, best first: the one whose offer leaves
 * the fewest layouts standing at worst, then the one with the most
 * different offers, then the nearest to `near`. An island every
 * standing layout agrees on tells nothing and is left out, and so is one
 * any standing layout leaves to chance: what it shows today says little
 * about which layout this is.
 */
export function askable(combos, npcById, near = null) {
	const ids = new Set(combos.flatMap(c => c.offers.map(o => o[0])));
	const out = [];
	for (const id of ids) {
		if (!npcById.has(id)) continue;
		if (combos.some(c => rolledAt(c, id))) continue;
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
 * board exactly the way they read the whole table. The attempts, what
 * is paid and the Parley are the game's own where the layout carries
 * them; a board of the sailor's own falls back on the codex, and an
 * exchange the codex never listed on one for one, capped by its rung.
 *
 * The ship-material exchanges ride along unchanged: the layouts carry
 * trade goods and coins only, so for them the whole table stands.
 *
 * `answers` are what islands were seen to show today. At a slot the
 * game fills at random, what was seen is the offer; one at an island
 * the layout has nothing for -- an offer that shows only some days --
 * is put on the board as seen.
 */
export function boardData(combo, barterData, npcById, answers = [], shut = []) {
	// The exchanges this sailor has looked at and found shut: the game
	// gates each one on its own barter count, and an island whose only
	// offer today is above that count shows nothing at all. They are
	// left off the board rather than planned through -- a chain that
	// climbs a rung the sailor cannot trade is not a run.
	const closed = new Set(shut.map(x => `${x.npcId}|${x.give}|${x.recv}`));
	const codex = new Map();
	const entries = new Map();
	for (const e of barterData || []) {
		if (levelOf(e.name) === null && e.name !== 'Crow Coin') entries.set(e.name, { ...e, sources: [...e.sources] });
		for (const s of e.sources) codex.set(`${s.npc_id}|${s.give.name}|${e.name}`, { entry: e, source: s });
	}
	const listed = offersOf(combo);
	const said = new Map(answers.map(a => [a.npcId, a]));
	const offers = [];
	for (const [id, give, qty, recv, info] of combo.offers) {
		// A random slot shows what was seen there, when it is one of its options.
		const a = combo.rolls && combo.rolls[id] ? said.get(id) : null;
		const o = a ? fitsAt(combo, id, a.give, a.recv) : null;
		offers.push(o ? [id, o.give, o.qty, o.recv, o] : [id, give, qty, recv, info]);
	}
	for (const a of answers) {
		if (listed.has(a.npcId) || !npcById.has(a.npcId)) continue;
		const o = fitsAt(combo, a.npcId, a.give, a.recv);
		const known = codex.get(`${a.npcId}|${a.give}|${a.recv}`);
		offers.push([a.npcId, a.give, o ? o.qty : known ? String(known.source.give.quantity) : '1', a.recv, o]);
	}
	for (const [id, give, qty, recv, info] of offers) {
		if (closed.has(`${id}|${give}|${recv}`)) continue;
		const known = codex.get(`${id}|${give}|${recv}`);
		if (!entries.has(recv)) {
			const e = known ? known.entry : null;
			entries.set(recv, { id: e ? e.id : recv, name: recv, ...(e && e.icon ? { icon: e.icon } : {}), sources: [] });
		}
		const src = known ? known.source : null;
		entries.get(recv).sources.push(info && info.perDay
			? {
				npc_id: id, npc_name: src ? src.npc_name : npcById.get(id).name,
				attempts_available: info.perDay,
				give: { ...(src ? src.give : { name: give }), quantity: qty },
				quantity_received: info.recvMin === info.recvMax ? String(info.recvMin) : `${info.recvMin}-${info.recvMax}`,
				parley: info.parley
			}
			: {
				npc_id: id, npc_name: src ? src.npc_name : npcById.get(id).name,
				attempts_available: src ? src.attempts_available : 0,
				give: { ...(src ? src.give : { name: give }), quantity: qty },
				quantity_received: src ? src.quantity_received : '1'
			});
	}
	return [...entries.values()];
}
