// The forty trade layouts, from the game client's own tables.
//
// js/barter_game.js is what tools/bake-barter.mjs read out of the game
// (docs/barter-bake.md). This turns its trade board into the record the
// rest of the app has always read -- `{ combos: [{ id, offers }] }`, an
// offer `[npc, give, qty, recv, info]` -- and adds what the community's
// sheet could never say:
//
// - `info` on every offer: the exchanges a day, the base Parley, the
//   Total Barters that open it, what it pays at least and at most.
// - `rolls`: a slot the game fills at random, one of a few options each
//   as likely as the next -- a [Level 4] island paying a [Level 5] or
//   Crow Coins, a mainland island's four [Level 7]s. The layout still
//   names one of them as its offer, so everything that reads offers
//   goes on working; which one is `picks`, and the board swaps in what
//   the sailor saw.
// - `rare`: an offer that shows only some days -- the Wandering
//   Merchant's Ship, from one day in a hundred to nine in ten depending
//   on the layout. On the board when it shows at least every other day,
//   else only once it was seen there.
//
// The material list is the game's too, and still read from the whole
// table for now; the layouts carry trade goods and coins only.
//
// Loaded on demand, like the table: `useGame(await import(...))`.

import { SAMPLE, SEEN, ROLLED } from './barter_seen.js';
import { tradeGoodNames } from './trade_goods.js';

// The game files name five trade goods by their sea rather than their
// level -- "[Great Ocean] Rust Repair Tool" -- where the app, the codex
// and the barter window say "[Level 5] Rust Repair Tool". The app's
// name is the one used; the bake keeps the game's.
const byBare = new Map(tradeGoodNames.map(n => [n.replace(/^\[[^\]]+\]\s*/, ''), n]));
export const appName = n => (/^\[Level \d\]/.test(n) || n === 'Crow Coin' ? n : byBare.get(n.replace(/^\[[^\]]+\]\s*/, '')) || n);

const FULL = 1e6;
const dealt = name => /^\[Level \d\]/.test(name) || name === 'Crow Coin';
/** A Total Barters figure nobody has: what the game writes against an
 *  exchange it means no sailor to see. Such an offer is on no board. */
export const NEVER = 100000;

let game = null;
let record = null;
let deals = null;

/** Takes the baked tables (the module js/barter_game.js). */
export function useGame(ns) {
	game = ns;
	record = null;
	deals = null;
	return layouts();
}
export const gameReady = () => !!game;

const indexOf = fields => Object.fromEntries(fields.map((f, i) => [f, i]));

/** One offer as the app reads it. */
function offerOf(row, fields) {
	const f = indexOf(fields);
	const name = i => appName(game.GOODS[i][1]);
	const range = (a, b) => (a === b ? String(a) : `${a}-${b}`);
	return {
		give: name(row[f.give]), qty: range(row[f.giveMin], row[f.giveMax]),
		recv: name(row[f.recv]), recvMin: row[f.recvMin], recvMax: row[f.recvMax],
		perDay: row[f.perDay], parley: row[f.parley], gate: row[f.gate],
		chance: row[f.weight] / FULL, category: row[f.category]
	};
}
const keyOf = o => `${o.give}|${o.recv}`;

/**
 * The layouts, as the record. What a random slot names until the sailor
 * says: what the sheet last saw there, else the first option.
 */
export function layouts() {
	if (!game) return null;
	if (record) return record;
	const combos = Object.entries(game.LAYOUTS.trade).map(([id, row]) => {
		const offers = [], rolls = {}, picks = {}, rare = {};
		for (const [npcKey, slots] of Object.entries(game.TRADE)) {
			const npc = Number(npcKey), s = slots[row];
			if (s == null) continue;
			if (typeof s === 'number') {
				// A material island's pool can hold a coin or two among its
				// materials: the slot is the material list's all the same.
				const all = game.GROUPS[s].map(o => offerOf(o, game.OPTION));
				if (!all.every(o => dealt(o.recv))) continue;
				const options = all.filter(o => o.gate < NEVER);
				if (!options.length) continue;
				const was = (ROLLED[id] || {})[npc];
				const pick = options.find(o => keyOf(o) === was) || options[0];
				rolls[npc] = { group: s, options };
				picks[npc] = keyOf(pick);
				offers.push([npc, pick.give, pick.qty, pick.recv, pick]);
				continue;
			}
			const o = offerOf(s, game.OFFER);
			if (!dealt(o.recv) || o.gate >= NEVER) continue;
			// Shown at least every other day, it is planned on; less, only
			// once it has been seen. Either way it names no layout.
			if (o.chance < 1) { rare[npc] = o; if (o.chance < 0.5) continue; }
			offers.push([npc, o.give, o.qty, o.recv, o]);
		}
		return { id, row, seen: SEEN[id] || 0, offers, rolls, picks, rare };
	});
	record = { read: game.BAKED.at, client: game.BAKED.client, source: 'client', sample: SAMPLE, combos };
	return record;
}

/**
 * Every trade-good exchange an island deals on any row, fixed or among a
 * random slot's options: `{ give, qty, recv, gate, ... }`, each once.
 */
export function dealsAt(npcId) {
	if (!game) return [];
	if (!deals) {
		deals = new Map();
		for (const [npcKey, slots] of Object.entries(game.TRADE)) {
			const seen = new Map();
			for (const s of slots) {
				const list = s == null ? [] : typeof s === 'number' ? game.GROUPS[s].map(o => offerOf(o, game.OPTION)) : [offerOf(s, game.OFFER)];
				for (const o of list) if (dealt(o.recv) && o.gate < NEVER && !seen.has(keyOf(o))) seen.set(keyOf(o), o);
			}
			deals.set(Number(npcKey), [...seen.values()]);
		}
	}
	return deals.get(Number(npcId)) || [];
}

/**
 * What an island shows on this layout, given what was seen there: the
 * option it matches if the slot is random or rare, the offer itself if
 * it is fixed and matches, and null if the layout cannot show it.
 */
export function fitsAt(combo, npcId, give, recv) {
	const roll = combo.rolls && combo.rolls[npcId];
	if (roll) return roll.options.find(o => o.give === give && o.recv === recv) || null;
	const rare = combo.rare && combo.rare[npcId];
	if (rare) return rare.give === give && rare.recv === recv ? rare : null;
	const o = combo.offers.find(x => x[0] === npcId);
	return o && o[1] === give && o[3] === recv ? (o[4] || { give, recv }) : null;
}
