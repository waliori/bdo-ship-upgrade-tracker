// The ship you are actually sailing: one hull, the parts on it, the
// crew in its seats -- and every tab reads the same one.
//
// The Crew screen picks the hull. What is on it comes from the
// inventory by default -- the best part you hold for each slot -- and
// can be overridden slot by slot, for a part you own but have not
// recorded, or a plan you are weighing. From that one setup follow the
// figures the rest of the app sails by: the speed the Map times a
// route at, the hold a run can carry once the crew's own weight is
// aboard, the numbers the Crew screen sums.

import * as store from './state.js';
import { shipStats } from './ship_stats.js';
import { partStats, slotOf, fitsShip, statsAt, sumStats, loadout } from './part_stats.js';
import { families } from './enhancement.js';
import { crewTotals } from './sailors.js';

export const SLOTS = ['cannon', 'sail', 'figurehead', 'plating'];
const RANK = { yellow: 5, chiro: 4, 'caravel-blue': 4, toro: 3, 'caravel-green': 3, epheria: 2, sailboat: 1 };
const round1 = n => Math.round(n * 10) / 10;

/** The hull in use: chosen on the Crew screen, else the largest
 *  crewed hull in the build queue, else the Sailboat everyone starts on. */
export function shipName() {
	const chosen = store.getProfile('crewShip', null);
	if (chosen && shipStats[chosen]) return chosen;
	const queued = store.getTargets().map(t => t.item).filter(i => shipStats[i] && shipStats[i].crew > 0);
	if (queued.length) return queued.sort((a, b) => shipStats[b].crew - shipStats[a].crew || shipStats[b].cabins - shipStats[a].cabins)[0];
	return 'Epheria Sailboat';
}

/** Every part that goes in a slot on a hull, best tier first. */
export function partsForSlot(ship, slot) {
	return Object.keys(partStats)
		.filter(p => slotOf(p) === slot && fitsShip(p, ship))
		.sort((a, b) => (RANK[families[b]] || 0) - (RANK[families[a]] || 0) || a.localeCompare(b));
}

/** "+7 Chiro's Cannon" -> the part and its level. */
export function splitLevel(name) {
	const m = /^\+(\d+)\s+(.*)$/.exec(name || '');
	return m ? { part: m[2], level: Number(m[1]) } : { part: name || '', level: 0 };
}

/**
 * What is on the hull, slot by slot: the chosen part where one was
 * chosen, else the best owned, else nothing. `source` says which --
 * 'owned', 'chosen', 'chosen-unowned' (chosen but not in the
 * inventory) or 'none'.
 */
export function fittedFor(ship, stock = store.getAllStock()) {
	const owned = loadout(ship, stock, families);
	const chosen = (store.getProfile('fitted', {}) || {})[ship] || {};
	const slots = owned.slots.map(o => {
		const pick = chosen[o.slot];
		const fromStock = () => (o.part ? { ...o, source: 'owned' } : { slot: o.slot, source: 'none' });
		if (pick === undefined) return fromStock();
		if (pick === '') return { slot: o.slot, source: 'none' };
		const { part, level } = splitLevel(pick);
		if (!partStats[part] || !fitsShip(part, ship) || slotOf(part) !== o.slot) return fromStock();
		const have = (stock[level ? `+${level} ${part}` : part] || 0) > 0;
		return { slot: o.slot, part, level, stats: statsAt(part, level), source: have ? 'chosen' : 'chosen-unowned' };
	});
	return { slots, total: sumStats(...slots.map(s => s.stats)) };
}

/** The whole setup, summed. */
export function currentShip() {
	const name = shipName();
	const stats = shipStats[name];
	const fit = fittedFor(name);
	const seats = (store.getProfile('seats', {}) || {})[name] || {};
	const crew = crewTotals(store.getProfile('roster', []) || [], seats, stats);
	const parts = k => Number(fit.total[k]) || 0;
	const limit = stats.weight + parts('weight');
	return {
		name, stats, fit, crew,
		speed: { hull: stats.speed, parts: parts('speed'), crew: crew.speed, total: round1(stats.speed + parts('speed') + crew.speed) },
		accel: round1(stats.accel + parts('accel') + crew.accel),
		turn: round1(stats.turn + parts('turn') + crew.turn),
		brake: round1(stats.brake + parts('brake') + crew.brake),
		// The hold: hull plus what the plating adds, less the crew's own
		// weight -- what is left is what a run can carry.
		hold: { limit, crew: crew.weight, free: Math.max(0, limit - crew.weight) },
		durability: stats.durability + parts('durability') + crew.durability,
		rations: stats.rations + parts('rations') + crew.rations
	};
}

/** Fit a part by hand: an item name with its level, '' for an empty
 *  slot, or null to go back to the best owned. */
export function setFitted(ship, slot, value) {
	if (!shipStats[ship] || !SLOTS.includes(slot)) return null;
	const all = { ...(store.getProfile('fitted', {}) || {}) };
	const forShip = { ...(all[ship] || {}) };
	if (value === null || value === undefined || value === 'auto') delete forShip[slot];
	else forShip[slot] = value === 'none' ? '' : String(value).slice(0, 80);
	if (Object.keys(forShip).length) all[ship] = forShip; else delete all[ship];
	return store.setProfile('fitted', Object.keys(all).length ? all : null);
}
