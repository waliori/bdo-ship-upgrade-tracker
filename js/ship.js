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
import { skinFor, skinStats, SKIN_SLOTS } from './ship_skins.js';
import { shipStats } from './ship_stats.js';
import { partStats, slotOf, fitsShip, statsAt, sumStats, loadout } from './part_stats.js';
import { families } from './enhancement.js';
import { crewTotals } from './sailors.js';
import { crystalById, crystalStats } from './crystals.js';

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

/** The sea crystal on a hull, if one is set: the codex entry and its stats. */
export function crystalFor(ship) {
	const id = (store.getProfile('crystal', {}) || {})[ship];
	const c = id ? crystalById[id] : null;
	return c ? { ...c, stats: crystalStats(c) } : null;
}

/** Set the crystal on a hull by codex id; null takes it out. */
export function setCrystal(ship, id) {
	if (!shipStats[ship]) return null;
	const all = { ...(store.getProfile('crystal', {}) || {}) };
	if (id && crystalById[id]) all[ship] = Number(id); else delete all[ship];
	return store.setProfile('crystal', Object.keys(all).length ? all : null);
}

/** The whole setup, summed: hull, parts, the crystal, the crew. */
/**
 * What Sailing Mastery adds to speed, acceleration, turn and brake, in
 * percentage points: the game's table -- half a point per fifty
 * mastery up to 2,000 (20%), a quarter-point per fifty from there to
 * 3,000 (25%), and no more above that.
 */
export function masteryBonus(mastery = store.getProfile('sailingMastery', 0) || 0) {
	const m = Math.max(0, Math.min(3000, Math.floor(Number(mastery) || 0)));
	const steps = Math.floor(m / 50);
	const pct = m <= 2000 ? steps * 0.5 : 20 + (steps - 40) * 0.25;
	return Math.round(pct * 100) / 100;
}


/* ------------------------------------------------------------------ *
 * The appearance set
 * ------------------------------------------------------------------ */

/** Which slots of a hull's skin the player says they have. */
export function skinWorn(ship) {
	return ((store.getProfile('skins', {}) || {})[ship]) || {};
}

/** Turn one slot of the set on or off. */
export function setSkinSlot(ship, slot, on) {
	if (!skinFor(ship) || !SKIN_SLOTS.includes(slot)) return null;
	const all = { ...(store.getProfile('skins', {}) || {}) };
	const mine = { ...(all[ship] || {}) };
	if (on) mine[slot] = true; else delete mine[slot];
	if (Object.keys(mine).length) all[ship] = mine; else delete all[ship];
	return store.setProfile('skins', Object.keys(all).length ? all : null);
}

/** The whole set on or off at once, which is how it is bought. */
export function setSkinAll(ship, on) {
	if (!skinFor(ship)) return null;
	const all = { ...(store.getProfile('skins', {}) || {}) };
	if (on) all[ship] = Object.fromEntries(SKIN_SLOTS.map(k => [k, true]));
	else delete all[ship];
	return store.setProfile('skins', Object.keys(all).length ? all : null);
}

/** What the set on this hull is adding right now. */
export function skinTotals(ship) {
	return skinStats(ship, skinWorn(ship));
}

export function currentShip() {
	const name = shipName();
	const stats = shipStats[name];
	const fit = fittedFor(name);
	const crystal = crystalFor(name);
	const gem = k => (crystal && Number(crystal.stats[k])) || 0;
	const seats = (store.getProfile('seats', {}) || {})[name] || {};
	const crew = crewTotals(store.getProfile('roster', []) || [], seats, stats);
	const parts = k => Number(fit.total[k]) || 0;
	const mastery = masteryBonus();
	// The appearance set is not only a look: its four slots carry speed,
	// weight, turn and durability, so it belongs in the same sum.
	const skinT = skinStats(name, skinWorn(name));
	const skin = k => Number(skinT[k]) || 0;
	const limit = stats.weight + parts('weight') + gem('weight') + skin('weight');
	return {
		name, stats, fit, crew, crystal, mastery, skin: skinT, skinWorn: skinWorn(name),
		speed: { hull: stats.speed, parts: parts('speed'), crystal: gem('speed'), crew: crew.speed, mastery, skin: skin('speed'), total: round1(stats.speed + parts('speed') + gem('speed') + crew.speed + mastery + skin('speed')) },
		accel: round1(stats.accel + parts('accel') + gem('accel') + crew.accel + mastery + skin('accel')),
		turn: round1(stats.turn + parts('turn') + gem('turn') + crew.turn + mastery + skin('turn')),
		brake: round1(stats.brake + parts('brake') + gem('brake') + crew.brake + mastery + skin('brake')),
		// The hold: hull plus what the plating and a crystal add, less the
		// crew's own weight -- what is left is what a run can carry.
		hold: { limit, crew: crew.weight, free: Math.max(0, limit - crew.weight) },
		durability: stats.durability + parts('durability') + gem('durability') + crew.durability + skin('durability'),
		rations: stats.rations + parts('rations') + crew.rations,
		damage: parts('damage') + gem('damage')
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

/* ------------------------------------------------------------------ *
 * setups: a hull with its parts, crystal and seating, kept by name
 * ------------------------------------------------------------------ */

/** The saved setups, newest last: { id, name, ship, fitted, crystal, seats }. */
/**
 * What a saved setup would sail like, without loading it.
 *
 * currentShip() answers the same question for the setup that is
 * standing, but it reads the profile -- so comparing two saved setups
 * meant loading each in turn and remembering the numbers. This works
 * them out from the setup's own record instead, which is what lets the
 * Ship screen put them side by side.
 *
 * Crew is counted from the seats the setup kept, against the roster as
 * it is now: the roster is shared between setups, so a sailor who has
 * been dismissed since simply no longer counts, which is the truth.
 */
export function setupSummary(setup) {
	const stats = shipStats[setup && setup.ship];
	if (!stats) return null;
	const parts = [];
	for (const raw of Object.values(setup.fitted || {})) {
		if (!raw) continue;
		const { part, level } = splitLevel(raw);
		if (partStats[part]) parts.push(statsAt(part, level));
	}
	const total = sumStats(...parts);
	const c = setup.crystal ? crystalById[setup.crystal] : null;
	const gemStats = c ? crystalStats(c) : {};
	const gem = k => Number(gemStats[k]) || 0;
	const got = k => Number(total[k]) || 0;
	const crew = crewTotals(store.getProfile('roster', []) || [], setup.seats || {}, stats);
	const mastery = masteryBonus();
	// A setup keeps the skin it was saved with, so two setups of the same
	// hull -- one skinned, one not -- compare as the different ships they
	// actually are.
	const skinT = skinStats(setup.ship, setup.skin || {});
	const skin = k => Number(skinT[k]) || 0;
	const limit = stats.weight + got('weight') + gem('weight') + skin('weight');
	return {
		ship: setup.ship,
		skinned: Object.values(setup.skin || {}).filter(Boolean).length,
		fittedCount: Object.values(setup.fitted || {}).filter(Boolean).length,
		slots: stats.slots,
		seated: Object.keys(setup.seats || {}).length,
		crystal: c ? c.name : null,
		speed: round1(stats.speed + got('speed') + gem('speed') + crew.speed + mastery + skin('speed')),
		hold: Math.max(0, limit - crew.weight),
		durability: stats.durability + got('durability') + gem('durability') + crew.durability + skin('durability')
	};
}

export function listSetups() {
	const all = store.getProfile('setups', {}) || {};
	return Object.entries(all).map(([id, s]) => ({ id, ...s }));
}

/** What is sailed right now, as a setup would keep it. */
export function currentSetup() {
	const ship = shipName();
	return {
		ship,
		fitted: (store.getProfile('fitted', {}) || {})[ship] || {},
		crystal: (store.getProfile('crystal', {}) || {})[ship] || null,
		seats: (store.getProfile('seats', {}) || {})[ship] || {},
		skin: skinWorn(ship)
	};
}

/** Keep the current ship under a name; the same name replaces. */
export function saveSetup(name) {
	const clean = String(name || '').trim().slice(0, 40) || shipName();
	const all = { ...(store.getProfile('setups', {}) || {}) };
	const existing = Object.keys(all).find(id => all[id].name === clean);
	const id = existing || `s${Date.now().toString(36)}`;
	const cur = currentSetup();
	all[id] = { name: clean, ship: cur.ship, ...(Object.keys(cur.fitted).length ? { fitted: cur.fitted } : {}), ...(cur.crystal ? { crystal: cur.crystal } : {}), ...(Object.keys(cur.seats).length ? { seats: cur.seats } : {}), ...(Object.keys(cur.skin).length ? { skin: cur.skin } : {}) };
	store.setProfile('setups', all);
	return id;
}

/** Sail a saved setup: its hull becomes the current one, with its parts,
 *  crystal and seating; the crew roster itself is shared. */
export function loadSetup(id) {
	const s = (store.getProfile('setups', {}) || {})[id];
	if (!s || !shipStats[s.ship]) return false;
	const fitted = { ...(store.getProfile('fitted', {}) || {}) };
	if (s.fitted) fitted[s.ship] = s.fitted; else delete fitted[s.ship];
	const crystal = { ...(store.getProfile('crystal', {}) || {}) };
	if (s.crystal) crystal[s.ship] = s.crystal; else delete crystal[s.ship];
	const seats = { ...(store.getProfile('seats', {}) || {}) };
	if (s.seats) seats[s.ship] = s.seats; else delete seats[s.ship];
	const skins = { ...(store.getProfile('skins', {}) || {}) };
	if (s.skin) skins[s.ship] = s.skin; else delete skins[s.ship];
	store.setProfileQuiet('fitted', Object.keys(fitted).length ? fitted : null);
	store.setProfileQuiet('crystal', Object.keys(crystal).length ? crystal : null);
	store.setProfileQuiet('seats', Object.keys(seats).length ? seats : null);
	store.setProfileQuiet('skins', Object.keys(skins).length ? skins : null);
	store.setProfile('crewShip', s.ship);
	return true;
}

export function deleteSetup(id) {
	const all = { ...(store.getProfile('setups', {}) || {}) };
	if (!(id in all)) return false;
	delete all[id];
	store.setProfile('setups', Object.keys(all).length ? all : null);
	return true;
}

/** Which saved setup, if any, is exactly what is sailed right now. */
export function activeSetupId() {
	const cur = JSON.stringify(currentSetup());
	// The keys have to be written in the order currentSetup() writes
	// them: this compares the two as JSON, so a field added to one and
	// not the other -- or added in the wrong place -- means no setup is
	// ever the one being sailed.
	return (listSetups().find(s => JSON.stringify({
		ship: s.ship,
		fitted: s.fitted || {},
		crystal: s.crystal || null,
		seats: s.seats || {},
		skin: s.skin || {}
	}) === cur) || {}).id || null;
}
