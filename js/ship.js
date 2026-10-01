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
import { F } from './fmt.js';
import { T, TT, gameName } from './i18n.js';
import { skinFor, skinStats, SKIN_SLOTS } from './ship_skins.js';
import { shipStats, bigShips } from './ship_stats.js';
import { partStats, slotOf, fitsShip, statsAt, sumStats, loadout, partLT } from './part_stats.js';
import { families, FAMILY_RANK } from './enhancement.js';
import { crewTotals, mateAboard, fitSeats } from './sailors.js';
import { crystalById, crystalStats } from './crystals.js';
import { hullTick, BREEZY_EVERY } from './rations.js';

export const SLOTS = ['cannon', 'sail', 'figurehead', 'plating'];

/**
 * How far past its limit a hull will still sail: to 170% of it, slower
 * the further over, and not at all beyond. The figure is the one the
 * community ship calculators quote (a 24,640 LT hold "loads" 41,888);
 * the game's own tooltip gives only the limit.
 */
export const OVERLOAD = 1.7;
/**
 * How far past its limit a ship still barters.
 *
 * The same 170%: the islands deal right up to the point the hull stops
 * moving, and there is no band in between where you can sail but not
 * trade. This was 125% until 2026-09-11, read off a single session in
 * which a 27,000 LT hold seemed to refuse past about 34,000 -- which is
 * what a quarter over looks like, and is why it was believed. It was
 * wrong, and it was costing every barter route a third of its hold:
 * chains were cut short, material runs were split, and a plan said a
 * second trip was needed where one would have done.
 *
 * Kept as a name of its own rather than folded into OVERLOAD, because
 * the two are different facts about the game that happen to agree, and
 * a patch that moved one would not necessarily move the other.
 */
export const BARTER_OVER = OVERLOAD;
// The part families ranked, from enhancement.js: the picker offers the
// best tier first, and the boards score by the same order.
const RANK = FAMILY_RANK;
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
 *
 * `gear` is what the parts weigh in themselves, which the hold pays for:
 * see the note on the hold in currentShip().
 */
export function fittedFor(ship, stock = store.getAllStock(), chosen = (store.getProfile('fitted', {}) || {})[ship] || {}) {
	const owned = loadout(ship, stock, families);
	const slots = owned.slots.map(o => {
		const pick = chosen[o.slot];
		const fromStock = () => (o.part ? { ...o, source: 'owned' } : { slot: o.slot, source: 'none' });
		if (pick === undefined) return fromStock();
		if (pick === '') return { slot: o.slot, source: 'none' };
		const { part, level } = splitLevel(pick);
		if (!partStats[part] || !fitsShip(part, ship) || slotOf(part) !== o.slot) return fromStock();
		const have = (stock[level ? `+${level} ${part}` : part] || 0) > 0;
		return { slot: o.slot, part, level, stats: statsAt(part, level), lt: partLT(part), source: have ? 'chosen' : 'chosen-unowned' };
	});
	return {
		slots: slots.map(s => ({ ...s, lt: s.part ? partLT(s.part) : 0 })),
		total: sumStats(...slots.map(s => s.stats)),
		gear: slots.reduce((sum, s) => sum + (s.part ? partLT(s.part) : 0), 0)
	};
}

/** What the parts of a loadout weigh in themselves, in LT. */
export function gearLT(slots) {
	return (slots || []).reduce((sum, s) => sum + (s && s.part ? partLT(s.part) : 0), 0);
}

/** The sea crystal on a hull, if one is set: the codex entry and its stats. */
export function crystalFor(ship) {
	return crystalOf((store.getProfile('crystal', {}) || {})[ship]);
}

/** A crystal by codex id, with its stats; null for none. */
function crystalOf(id) {
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

/**
 * Who is seated on a hull, kept to the seats that hull really has: a
 * Caravel has no named positions at all, so an arrangement saved when
 * the app drew them reads here as the cabins the game draws.
 */
export function seatedOn(ship = shipName()) {
	return fitSeats(ship, (store.getProfile('seats', {}) || {})[ship] || {}, shipStats[ship]);
}

/**
 * What the mate at the wheel takes off every Parley cost, as a fraction:
 * Cleia's skill is ten per cent, and nobody else's is anything. It is a
 * fact about who is seated, not a preference, so the barter figures read
 * it here instead of asking for a tick.
 */
export function parleyOff(ship = shipName()) {
	const m = mateAboard(store.getProfile('roster', []) || [], seatedOn(ship));
	return m ? Number(m.type.parley) || 0 : 0;
}

/** The mate whose skill is switched on, for a screen that wants to name them. */
export function mateAtTheHelm(ship = shipName()) {
	return mateAboard(store.getProfile('roster', []) || [], seatedOn(ship));
}

/** The whole setup, summed: hull, parts, the crystal, the crew. */
/**
 * What Sailing Mastery adds to speed, acceleration, turn and brake, in
 * percentage points: the game's table -- half a point per fifty
 * mastery up to 2,000 (20%), a quarter-point per fifty from there to
 * 3,000 (25%), and no more above that.
 */
/**
 * The Corsair's own point. A Corsair at the wheel gives the ship one
 * per cent of speed, acceleration, turn and brake -- a flat point on
 * each, like Sailing Mastery's, since those stats are percentages
 * already. It is the class, not the hull, so it is a fact about the
 * sailor and lives beside the Value Pack.
 */
export const CORSAIR_BONUS = 1;

/**
 * The sailing logs: life-skill gear worn by the character, not the
 * ship. Each adds Sailing Mastery by its enhancement level -- the same
 * ladder as the sailor's clothes, read off the in-game tooltips (TRI
 * Loggia 130, TRI Srulk 180, TET Manos 300 match) and the 2025 update
 * note (Loggia 3-280, Srulk 4-330, Manos 5-400) -- and a flat "Max Big
 * Ship Speed" whatever the level.
 *
 * Two things follow from the game's own ship window. The mastery a log
 * gives is already inside the Sailing Mastery the Life Skill tab shows,
 * which is the figure typed into the pouch -- so it is said, not added
 * again. And the top speed is not in the Speed % that window shows (a
 * Carrack reads 197.1% with a Manos log aboard, with no 15% in it), so
 * it goes where top speed matters: the time a leg takes at sea.
 */
export const LOG_LEVELS = ['+0', '+1', '+2', '+3', '+4', '+5', '+6', '+7', '+8', '+9', '+10', '+11', '+12', '+13', '+14', '+15', 'PRI', 'DUO', 'TRI', 'TET', 'PEN'];
// The three share one picture in the game; the grade's frame and the
// enhancement written on it are what tell them apart (the codex's
// grade_frame_1 / _2 / _4: green, blue, orange).
export const SAILING_LOGS = {
	loggia: { name: 'Loggia Sailing Log', grade: 1, speed: 5, exp: 3, mastery: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 39, 45, 51, 57, 63, 70, 90, 130, 200, 280] },
	srulk: { name: 'Srulk Sailing Log', grade: 2, speed: 10, exp: 5, mastery: [4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 50, 58, 66, 74, 80, 95, 125, 180, 250, 330] },
	manos: { name: 'Manos Sailing Log', grade: 4, speed: 15, exp: 10, mastery: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 120, 160, 220, 300, 400] }
};
/** The log worn, as { kind, lv, name, mastery, speed }, or null. */
export function sailingLog() {
	const raw = store.getProfile('sailingLog', null);
	const log = raw && SAILING_LOGS[raw.kind];
	if (!log) return null;
	const lv = Math.max(0, Math.min(LOG_LEVELS.length - 1, Math.floor(Number(raw.lv) || 0)));
	return { kind: raw.kind, lv, grade: log.grade, name: log.name, mastery: log.mastery[lv], speed: log.speed, exp: log.exp, level: LOG_LEVELS[lv] };
}
export const corsairBonus = () => (store.getProfile('corsair', false) === true ? CORSAIR_BONUS : 0);

export function masteryBonus(mastery = store.getProfile('sailingMastery', 0) || 0) {
	const m = Math.max(0, Math.min(3000, Math.floor(Number(mastery) || 0)));
	const steps = Math.floor(m / 50);
	const pct = m <= 2000 ? steps * 0.5 : 20 + (steps - 40) * 0.25;
	return Math.round(pct * 100) / 100;
}


/* ------------------------------------------------------------------ *
 * The pets aboard
 * ------------------------------------------------------------------ */

/**
 * Bos'n Jack: the one pet in the game whose talent is ship weight.
 *
 * "Big Ship Inventory Weight", fifty LT a tier -- 50, 100, 150, 200 --
 * and a tier 5 still reads 200, because the fifth step of the talent
 * is what being the Alpha Pet buys and not what the fifth tier gives.
 * The talent stacks across the five pets the game lets out at once, so
 * five tier 4s are a thousand LT, and a tier 5 set as Alpha makes one
 * of them 250. BDOCodex skills 49167-49170 are the four steps and its
 * pet entries carry them; the 250 is community-sourced and has no
 * entry of its own, which is why it is added here rather than listed.
 *
 * It is a fact about the player and not about any one hull -- the pets
 * follow you onto whichever ship you sail -- so it is kept in the
 * profile beside the sailing mastery and asked for in the same bar.
 */
const PET_LT = [0, 50, 100, 150, 200, 200];
/** What being the Alpha Pet is worth on a tier 5: one more step. */
export const ALPHA_LT = 50;
/** How many pets the game lets you have out at once. */
export const PET_SLOTS = 5;

/** The Bos'n Jacks you have summoned, as five slots of tier, 0 empty. */
export function bosnJacks() {
	const saved = store.getProfile('bosnJacks', []) || [];
	return Array.from({ length: PET_SLOTS }, (_, i) => Number(saved[i]) || 0);
}

/** Whether one of them is your Alpha Pet, which only a tier 5 can be
 *  worth anything as. */
export function bosnAlpha() {
	return store.getProfile('bosnAlpha', false) === true && bosnJacks().includes(5);
}

/** What a nest of birds is worth, in LT, before any hull is named: what
 *  the editor counts up as it is being set out. */
export function petLT(tiers = bosnJacks(), alpha = bosnAlpha()) {
	const lt = tiers.reduce((sum, t) => sum + (PET_LT[t] || 0), 0);
	return lt + (alpha && tiers.includes(5) ? ALPHA_LT : 0);
}

/** And what they add to a hull's limit: the same, or nothing at all on
 *  anything the game does not call a Big Ship. */
export function petWeight(ship, tiers = bosnJacks(), alpha = bosnAlpha()) {
	return bigShips.has(ship) ? petLT(tiers, alpha) : 0;
}


/* ------------------------------------------------------------------ *
 * The fishing place
 * ------------------------------------------------------------------ */

/**
 * The Otter's rod, which is ship equipment like anything else.
 *
 * "Can be installed on: Epheria Carrack" -- the fishing place is the
 * Carrack's alone, and a Panokseon has nowhere to put it. It is the
 * thing the Fish seat waits for: a sailor sat there fishes only once
 * the rod is aboard, so a crew with that seat filled is a ship with the
 * rod installed, and the hold pays its litre.
 *
 * Crio in Velia trades it for 200 Crow Coin Coupons, as often as you
 * like, once the Otter quests are done. Codex item 59455; the weight is
 * off its own page, 2026-09-15.
 */
export const OTTER_ROD = { id: 59455, name: 'Oceanbound Otter Fishing Rod', lt: 1 };

/** Whether the fishing place is in use: a Carrack with someone in the
 *  Fish seat, which is the one seat that needs the rod. */
export function rodAboard(ship = shipName(), seats = null) {
	const seated = seats || (store.getProfile('seats', {}) || {})[ship] || {};
	return /^Carrack/.test(ship) && Object.keys(seated).some(k => k.startsWith('fish:'));
}

/**
 * The whole row at once, and the Alpha with it.
 *
 * One write, not five: the editor holds its own draft while it is open
 * and lands it here when it is done, so setting out a full nest of
 * birds is a single change, a single entry in the history, and a
 * single pass over the screens that read the hold. Pressing each bird
 * round its tiers wrote the save and redrew the app twenty times to
 * say "five tier fours", which is what an editor is for.
 */
export function setPets(tiers, alpha = false) {
	const next = Array.from({ length: PET_SLOTS }, (_, i) =>
		Math.max(0, Math.min(5, Math.floor(Number((tiers || [])[i]) || 0))));
	while (next.length && !next[next.length - 1]) next.pop();
	return store.setProfileMany({
		bosnJacks: next.length ? next : null,
		bosnAlpha: alpha === true && next.includes(5) ? true : null
	}, T('Changed the pets aboard'));
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

/**
 * What the ship eats under sail: a tick of the hull's own take and the
 * appetite of everyone seated, and a BreezySail every BREEZY_EVERY
 * seconds when the sailor keeps it going (`breezy`: that interval, or
 * 0). `measured` says whether this hull's take was read in game; `cal`
 * is the rations a minute the sailor watched this ship's pool fall, or
 * 0. rations.js drainRate turns it into a rate, the same way for the
 * Map and the barter planner.
 */
export function rationDrain(me = currentShip()) {
	const hull = hullTick(me.name);
	const crew = (me.crew && me.crew.appetite) || 0;
	return { tick: hull.n + crew, hull: hull.n, crew, measured: hull.measured, breezy: store.getProfile('breezy', false) === true ? BREEZY_EVERY : 0, cal: rationCalFor(me.name) };
}

/**
 * The ration drain the sailor watched, for one hull. It is kept per
 * ship, since a Carrack with a full crew eats three times a bare
 * Sailboat's. It used to be one number for the device, and a save
 * holding that number still has it: it goes on standing for every ship
 * not watched since (filed under '*').
 */
export function rationCalFor(name) {
	const raw = store.getSetting('rationCal', null);
	if (Number(raw) > 0) return Number(raw);
	if (!raw || typeof raw !== 'object') return 0;
	if (Object.prototype.hasOwnProperty.call(raw, name)) return Number(raw[name]) > 0 ? Number(raw[name]) : 0;
	return Number(raw['*']) > 0 ? Number(raw['*']) : 0;
}

/** Set (a rate) or clear (null) the watched drain for one hull. A clear
 *  is kept as a 0, so a figure from before it was per ship does not
 *  stand in for it again. */
export function setRationCal(name, rate) {
	const raw = store.getSetting('rationCal', null);
	const all = Number(raw) > 0 ? { '*': Number(raw) } : raw && typeof raw === 'object' ? { ...raw } : {};
	all[name] = Number(rate) > 0 ? Math.round(Number(rate)) : 0;
	store.setSetting('rationCal', all);
}

export function currentShip() {
	return shipFrom(currentSetup());
}

/**
 * A ship worked out from a setup -- the hull, the parts picked by hand,
 * the crystal, the seating and the skin -- the one sum every figure of
 * a ship comes from. The ship sailed is the current setup put through
 * it; a saved setup in the Fleet list is put through the same, so the
 * two cannot disagree. They did: the Fleet row summed only the parts
 * picked by hand (none of the best owned for the slots left alone),
 * left the Corsair point out and read the seats as saved, and showed
 * the setup being sailed at 115% beside a Ship card at 127.5%.
 */
export function shipFrom(setup) {
	const name = setup.ship;
	const stats = shipStats[name];
	const fit = fittedFor(name, store.getAllStock(), setup.fitted || {});
	const crystal = crystalOf(setup.crystal);
	const gem = k => (crystal && Number(crystal.stats[k])) || 0;
	const seats = fitSeats(name, setup.seats || {}, stats);
	const crew = crewTotals(store.getProfile('roster', []) || [], seats, stats);
	const parts = k => Number(fit.total[k]) || 0;
	const mastery = masteryBonus();
	const corsair = corsairBonus();
	// The appearance set is not only a look: its four slots carry speed,
	// weight, turn and durability, so it belongs in the same sum.
	const worn = setup.skin || {};
	const skinT = skinStats(name, worn);
	const skin = k => Number(skinT[k]) || 0;
	// The pets are the player's, not the hull's, and they only count on
	// a Big Ship -- but on one they are simply more hold, so they go in
	// the same sum as everything else bolted on.
	const pets = petWeight(name);
	const limit = stats.weight + parts('weight') + gem('weight') + skin('weight') + pets;
	// What the fit-out weighs in itself. A plating lifts the limit and
	// then sits in the hold like anything else: the game charges the
	// item's own LT the moment it is bolted on, so a Carrack with a
	// Falasi set aboard and nothing loaded already reads 18 / 24,640.
	// Small numbers, but they are the difference between this figure and
	// the one the ship's own window shows, which is what a run is
	// planned against. The crystal is a litre of it whatever its grade,
	// and so is the rod in a Carrack's fishing place.
	const rod = rodAboard(name, seats) ? OTTER_ROD.lt : 0;
	const gear = Math.round((fit.gear + (crystal ? Number(crystal.lt) || 0 : 0) + rod) * 100) / 100;
	// Everything aboard before a single good is loaded.
	const aboard = crew.weight + gear;
	// The hold as a sum, line by line, the way the speed already reads:
	// what each thing aboard adds or takes.
	const lines = [{ label: T('hull'), lt: stats.weight }];
	for (const s of fit.slots) if (s.stats && Number(s.stats.weight)) lines.push({ label: `${s.level ? `+${s.level} ` : ''}${gameName(s.part).replace(/^.*?: /, '')}`, lt: Number(s.stats.weight) });
	if (gem('weight')) lines.push({ label: gameName(crystal.name), lt: gem('weight') });
	if (skin('weight')) lines.push({ label: T('appearance set'), lt: skin('weight') });
	if (pets) {
		const jacks = bosnJacks().filter(Boolean).length;
		const pet = gameName("Bos'n Jack");
		const alpha = bosnAlpha();
		lines.push({
			label: jacks === 1
				? (alpha ? T('{n} {name}, one Alpha', { n: jacks, name: pet }) : T('{n} {name}', { n: jacks, name: pet }))
				: (alpha ? T('{n} {name}s, one Alpha', { n: jacks, name: pet }) : T('{n} {name}s', { n: jacks, name: pet })),
			lt: pets
		});
	}
	if (crew.weight) lines.push({ label: crew.seated === 1 ? T('{n} sailor aboard', { n: crew.seated }) : T('{n} sailors aboard', { n: crew.seated }), lt: -crew.weight });
	if (gear) {
		const fitted = fit.slots.filter(s => s.part).length;
		const what = [
			fitted ? (fitted === 1 ? T('{n} part', { n: fitted }) : T('{n} parts', { n: fitted })) : '',
			crystal && Number(crystal.lt) ? T('the crystal') : '',
			rod ? T("the Otter's rod") : ''
		].filter(Boolean);
		const said = what.length > 1 ? T('{list} and {last}', { list: what.slice(0, -1).join(', '), last: what[what.length - 1] }) : what[0];
		const one = what.length === 1 && fitted <= 1;
		lines.push({ label: one ? T('{what}, its own weight', { what: said }) : T('{what}, their own weight', { what: said }), lt: -gear });
	}
	return {
		name, stats, fit, crew, crystal, mastery, corsair, skin: skinT, skinWorn: worn,
		speed: (() => {
			const total = round1(stats.speed + parts('speed') + gem('speed') + crew.speed + mastery + corsair + skin('speed'));
			const log = sailingLog();
			// `sea` is the speed a leg is timed at: the window's total with
			// the log's top speed on it.
			return { hull: stats.speed, parts: parts('speed'), crystal: gem('speed'), crew: crew.speed, mastery, corsair, skin: skin('speed'), total, log: log ? log.speed : 0, sea: round1(total * (1 + (log ? log.speed : 0) / 100)) };
		})(),
		// The same sum, term by term, for the three the ship card lists
		// beside the speed.
		terms: Object.fromEntries(['accel', 'turn', 'brake'].map(k => [k, { hull: stats[k], parts: parts(k), crystal: gem(k), crew: crew[k], mastery, corsair, skin: skin(k) }])),
		dp: parts('dp') + gem('dp') + skin('dp'),
		accel: round1(stats.accel + parts('accel') + gem('accel') + crew.accel + mastery + corsair + skin('accel')),
		turn: round1(stats.turn + parts('turn') + gem('turn') + crew.turn + mastery + corsair + skin('turn')),
		brake: round1(stats.brake + parts('brake') + gem('brake') + crew.brake + mastery + corsair + skin('brake')),
		// The hold: hull plus what the plating and a crystal add, less what
		// is aboard before anything is loaded -- the crew's own weight and
		// the parts' -- and what is left is what a run can carry. `deal`
		// is the most it carries and still barters, at BARTER_OVER; `max`
		// the most the hull will move under at all, at OVERLOAD. `slots` is
		// the hull's inventory slots: nothing in the model sits in them
		// but goods, and a [Level 5] and up takes one a unit.
		hold: { limit, crew: crew.weight, gear, aboard, free: Math.max(0, limit - aboard), deal: Math.max(0, Math.round(limit * BARTER_OVER) - aboard), max: Math.max(0, Math.round(limit * OVERLOAD) - aboard), slots: stats.slots, lines },
		durability: stats.durability + parts('durability') + gem('durability') + crew.durability + skin('durability'),
		rations: stats.rations + parts('rations') + crew.rations,
		damage: parts('damage') + gem('damage')
	};
}

/**
 * The hold's slots as every screen shows them, beside the LT: `used`
 * slots of the hull's -- one a kind for what stacks, one a unit for a
 * [Level 5] and up (slotsHeld in barter-plan.js).
 */
export function shownSlots(hold, used = 0) {
	// An old saved plan kept a hold without slots: the count alone then.
	const cap = hold && Number.isFinite(hold.slots) ? hold.slots : null;
	const n = Math.max(0, Math.round(Number(used) || 0));
	return {
		used: n, cap, over: cap !== null && n > cap, full: cap !== null && n >= cap,
		text: cap !== null ? T('{used} / {cap} slots', { used: F(n), cap: F(cap) }) : T('{n} slots', { n: F(n) }),
		// The figures alone, for a place that labels them "slots" already.
		short: cap !== null ? `${F(n)} / ${F(cap)}` : F(n)
	};
}

/**
 * The hold as the game's Ship Info shows it: everything aboard --
 * goods, the crew's own weight and the parts' -- over the limit the
 * hull, its parts, its crystal and its set add up to. The planner works
 * in goods alone against a limit less what is already aboard, which is
 * the same arithmetic; this is the one face every screen shows.
 * `goods` is the goods' weight in LT.
 * Two marks, not three: the limit, and the 170% at which the hull stops
 * moving and the islands stop dealing together. `deal` and `max` are
 * both kept -- callers ask each by name, and they are separate facts --
 * so the band between them is simply empty while the two agree.
 */
export function shownHold(hold, goods = 0) {
	const crew = hold.crew || 0;
	// What the hull carries before a good is loaded: the crew and the
	// parts bolted on. Older saved plans kept a hold without `aboard`;
	// the crew alone is what those meant.
	const aboard = hold.aboard === undefined ? crew : hold.aboard;
	const total = Math.max(0, Math.round(goods + aboard));
	const limit = hold.limit, deal = hold.deal + aboard, max = hold.max + aboard;
	const state = total > max ? 'dead' : total > deal ? 'heavy' : total > limit ? 'over' : '';
	return {
		total, limit, deal, max, crew, gear: hold.gear || 0, aboard, state,
		// Shares of the fullest the hull moves under, for a bar.
		fill: max ? Math.min(100, Math.min(total, limit) / max * 100) : 0,
		extra: max ? Math.max(0, Math.min(total, deal) - limit) / max * 100 : 0,
		worse: max ? Math.max(0, Math.min(total, max) - deal) / max * 100 : 0,
		mark: max ? Math.min(100, limit / max * 100) : 100,
		text: T('{total} / {limit} LT', { total: F(total), limit: F(limit) }),
		note: state === 'dead' ? T('more than the hull will move under, and past dealing — lighten first')
			: state === 'heavy' ? T('too heavy to barter — lighten first')
			: state === 'over' ? T('past the limit — sailing slower') : ''
	};
}

/**
 * What the weight already aboard is made of, for a line that names it:
 * 'crew and gear', 'crew', 'gear', or '' on a bare hull -- the gear
 * being the parts, the crystal and the rod, which all weigh something.
 * The figure beside it is `hold.aboard`.
 */
export function aboardWhat(hold) {
	const crew = (hold && hold.crew) || 0, gear = (hold && hold.gear) || 0;
	return crew && gear ? TT('crew and gear') : crew ? TT('crew') : gear ? TT('gear') : '';
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
 * them out from the setup's own record instead, through the same
 * shipFrom the sailed ship goes through, which is what lets the Ship
 * screen put them side by side and agree with the Ship card.
 *
 * Crew is counted from the seats the setup kept, against the roster as
 * it is now: the roster is shared between setups, so a sailor who has
 * been dismissed since simply no longer counts, which is the truth.
 */
export function setupSummary(setup) {
	if (!setup || !shipStats[setup.ship]) return null;
	const me = shipFrom(setup);
	return {
		ship: setup.ship,
		skinned: Object.values(setup.skin || {}).filter(Boolean).length,
		fittedCount: me.fit.slots.filter(sl => sl.part).length,
		slots: me.stats.slots,
		seated: me.crew.seated,
		crystal: me.crystal ? me.crystal.name : null,
		speed: me.speed.total,
		hold: me.hold.free,
		durability: me.durability
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

/**
 * Keep the current ship under a name; the same name replaces.
 *
 * A hull kept as a setup is a hull owned, so it goes into the inventory
 * along with the setup unless one is already recorded there. That is the
 * whole of the fleet and the hold being one thing rather than two: the
 * Ship tab and the Inventory disagreed about how many ships a player
 * had, and the boards, which read the inventory, sided with neither.
 * Both writes are one step, so one Undo takes back both.
 */
export function saveSetup(name) {
	const clean = String(name || '').trim().slice(0, 40) || shipName();
	const all = { ...(store.getProfile('setups', {}) || {}) };
	// The same name replaces; anything else is a new id. The clock alone
	// is not enough for that -- two setups kept in the same millisecond
	// would be one setup, the second silently over the first -- so a
	// taken id is walked past.
	let id = Object.keys(all).find(key => all[key].name === clean);
	if (!id) {
		const stamp = `s${Date.now().toString(36)}`;
		id = stamp;
		for (let i = 1; id in all; i++) id = `${stamp}-${i.toString(36)}`;
	}
	const cur = currentSetup();
	all[id] = { name: clean, ship: cur.ship, ...(Object.keys(cur.fitted).length ? { fitted: cur.fitted } : {}), ...(cur.crystal ? { crystal: cur.crystal } : {}), ...(Object.keys(cur.seats).length ? { seats: cur.seats } : {}), ...(Object.keys(cur.skin).length ? { skin: cur.skin } : {}) };
	const gained = store.getStock(cur.ship) > 0 ? {} : { [cur.ship]: 1 };
	store.applyDelta(gained, 'profile', gained[cur.ship] ? T('Kept "{name}" and put the {ship} in the hold', { name: clean, ship: gameName(cur.ship) }) : T('Kept "{name}"', { name: clean }), { setups: all });
	return id;
}

/**
 * The hulls the inventory says are owned.
 *
 * The other half of the same idea: a ship recorded in the hold is in
 * the fleet, whether or not a setup was ever named for it. The Ship
 * tab lists these beside the setups, and the digest counts them.
 */
export function ownedHulls() {
	const stock = store.getAllStock();
	return Object.keys(shipStats).filter(ship => (stock[ship] || 0) > 0);
}

/**
 * The fleet as a whole: the saved setups, and after them every owned
 * hull that no setup covers, as a row of its own.
 *
 * An owned hull carries a synthetic id so the list can be keyed and
 * acted on; nothing is written under it, and it disappears the moment
 * a setup for that hull is saved or the hull leaves the hold.
 */
export const OWNED_PREFIX = 'hull:';
export const hullOfRow = id => (String(id || '').startsWith(OWNED_PREFIX) ? String(id).slice(OWNED_PREFIX.length) : null);

export function listFleet() {
	const setups = listSetups();
	const covered = new Set(setups.map(s => s.ship));
	const bare = ownedHulls().filter(ship => !covered.has(ship))
		.map(ship => ({ id: `${OWNED_PREFIX}${ship}`, name: ship, ship, owned: true }));
	return [...setups, ...bare];
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
	// One change, not five: a fit assembled by hand is replaced here, and
	// the Undo the toast offers has to bring all of it back.
	store.setProfileMany({
		fitted: Object.keys(fitted).length ? fitted : null,
		crystal: Object.keys(crystal).length ? crystal : null,
		seats: Object.keys(seats).length ? seats : null,
		skins: Object.keys(skins).length ? skins : null,
		crewShip: s.ship
	}, T('Sailed the setup "{name}"', { name: s.name }));
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
	const cur = canon(currentSetup());
	// Compared with the keys in one fixed order, so a setup written by
	// an older version -- or synced from another device -- with its
	// fields in another order is still recognised as the one sailed.
	return (listSetups().find(s => canon({
		ship: s.ship,
		fitted: s.fitted || {},
		crystal: s.crystal || null,
		seats: s.seats || {},
		skin: s.skin || {}
	}) === cur) || {}).id || null;
}

/** JSON with every object's keys sorted, so equal things read equal. */
function canon(v) {
	if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
	if (v && typeof v === 'object') {
		return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
	}
	return JSON.stringify(v === undefined ? null : v);
}
