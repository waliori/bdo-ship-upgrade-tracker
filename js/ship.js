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
import { families, FAMILY_RANK } from './enhancement.js';
import { crewTotals, mateAboard } from './sailors.js';
import { crystalById, crystalStats } from './crystals.js';

export const SLOTS = ['cannon', 'sail', 'figurehead', 'plating'];

/**
 * How far past its limit a hull will still sail: to 170% of it, slower
 * the further over, and not at all beyond. The figure is the one the
 * community ship calculators quote (a 24,640 LT hold "loads" 41,888);
 * the game's own tooltip gives only the limit.
 */
export const OVERLOAD = 1.7;
/** How far past its limit a ship still barters: the islands stop
 *  dealing above this. No patch note gives the figure; a 27,000 LT
 *  hold was seen dealing up to about 33,750 and refused past 34,000
 *  (2026-09-04), which is the game's usual overweight step. */
export const BARTER_OVER = 1.25;
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

/**
 * What the mate at the wheel takes off every Parley cost, as a fraction:
 * Cleia's skill is ten per cent, and nobody else's is anything. It is a
 * fact about who is seated, not a preference, so the barter figures read
 * it here instead of asking for a tick.
 */
export function parleyOff(ship = shipName()) {
	const seats = (store.getProfile('seats', {}) || {})[ship] || {};
	const m = mateAboard(store.getProfile('roster', []) || [], seats);
	return m ? Number(m.type.parley) || 0 : 0;
}

/** The mate whose skill is switched on, for a screen that wants to name them. */
export function mateAtTheHelm(ship = shipName()) {
	const seats = (store.getProfile('seats', {}) || {})[ship] || {};
	return mateAboard(store.getProfile('roster', []) || [], seats);
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
	// The hold as a sum, line by line, the way the speed already reads:
	// what each thing aboard adds or takes.
	const lines = [{ label: 'hull', lt: stats.weight }];
	for (const s of fit.slots) if (s.stats && Number(s.stats.weight)) lines.push({ label: `${s.level ? `+${s.level} ` : ''}${s.part.replace(/^.*?: /, '')}`, lt: Number(s.stats.weight) });
	if (gem('weight')) lines.push({ label: crystal.name, lt: gem('weight') });
	if (skin('weight')) lines.push({ label: 'appearance set', lt: skin('weight') });
	if (crew.weight) lines.push({ label: `${crew.seated} sailor${crew.seated === 1 ? '' : 's'} aboard`, lt: -crew.weight });
	return {
		name, stats, fit, crew, crystal, mastery, skin: skinT, skinWorn: skinWorn(name),
		speed: { hull: stats.speed, parts: parts('speed'), crystal: gem('speed'), crew: crew.speed, mastery, skin: skin('speed'), total: round1(stats.speed + parts('speed') + gem('speed') + crew.speed + mastery + skin('speed')) },
		accel: round1(stats.accel + parts('accel') + gem('accel') + crew.accel + mastery + skin('accel')),
		turn: round1(stats.turn + parts('turn') + gem('turn') + crew.turn + mastery + skin('turn')),
		brake: round1(stats.brake + parts('brake') + gem('brake') + crew.brake + mastery + skin('brake')),
		// The hold: hull plus what the plating and a crystal add, less the
		// crew's own weight -- what is left is what a run can carry. `deal`
		// is the most it carries and still barters, at BARTER_OVER; `max`
		// the most the hull will move under at all, at OVERLOAD.
		hold: { limit, crew: crew.weight, free: Math.max(0, limit - crew.weight), deal: Math.max(0, Math.round(limit * BARTER_OVER) - crew.weight), max: Math.max(0, Math.round(limit * OVERLOAD) - crew.weight), lines },
		durability: stats.durability + parts('durability') + gem('durability') + crew.durability + skin('durability'),
		rations: stats.rations + parts('rations') + crew.rations,
		damage: parts('damage') + gem('damage')
	};
}

/**
 * The hold as the game's Ship Info shows it: everything aboard --
 * goods and the crew's own weight -- over the limit the hull, its parts,
 * its crystal and its set add up to. The planner works in goods alone
 * against a limit less the crew, which is the same arithmetic; this is
 * the one face every screen shows. `goods` is the goods' weight in LT.
 * The three marks are the game's: the limit, the barter ceiling a
 * quarter over it, and the most the hull moves under.
 */
export function shownHold(hold, goods = 0) {
	const crew = hold.crew || 0;
	const total = Math.max(0, Math.round(goods + crew));
	const limit = hold.limit, deal = hold.deal + crew, max = hold.max + crew;
	const state = total > max ? 'dead' : total > deal ? 'heavy' : total > limit ? 'over' : '';
	return {
		total, limit, deal, max, crew, state,
		// Shares of the fullest the hull moves under, for a bar.
		fill: max ? Math.min(100, Math.min(total, limit) / max * 100) : 0,
		extra: max ? Math.max(0, Math.min(total, deal) - limit) / max * 100 : 0,
		worse: max ? Math.max(0, Math.min(total, max) - deal) / max * 100 : 0,
		mark: max ? Math.min(100, limit / max * 100) : 100,
		text: `${Math.round(total).toLocaleString()} / ${Math.round(limit).toLocaleString()} LT`,
		note: state === 'dead' ? 'more than the hull will move under' : state === 'heavy' ? 'too heavy to barter — lighten first' : state === 'over' ? 'past the limit — sailing slower' : ''
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
	store.applyDelta(gained, 'profile', `Kept "${clean}"${gained[cur.ship] ? ` and put the ${cur.ship} in the hold` : ''}`, { setups: all });
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
	}, `Sailed the setup "${s.name}"`);
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
