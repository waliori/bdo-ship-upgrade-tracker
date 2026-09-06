// The crew: who can be hired, what each one is good for, what keeps
// them well, and how many a hull will carry.
//
// Read from the official sailing guide and the community sailor tables
// on 2026-08-29 -- the wiki for positions, condition and the certificate;
// the tables for the hiring pool, which the wiki does not list. Where the
// two disagreed (cabin counts) the hulls' own codex pages settled it, in
// ship_stats.js.
//
// The per-type figures are the LEVEL-1 BASE. A level-up adds a small
// hidden roll, so a sailor's true numbers drift inside a band: `l10`
// carries [min, average, max] at level 10, read from the community "BDO
// Sailors" sheet (by Sheen, raw data NekoNeko) on 2026-09-02 and
// confirmed against BDOCodex, whose sailor pages publish exactly the
// maxima. What each level-up can add -- the least and the most, level
// by level -- is in sailor_rolls.js from the same sheet, and is what
// the bands below are built from; `l10` is the fallback for a type it
// does not list. The game shows each sailor's real rolls; typed into
// the roster, they outrank every estimate here.

import { sailorRolls } from './sailor_rolls.js';

/** The one item every sailor costs, and where it is sold. */
export const contract = {
	item: 'Sailor Contract Certificate',
	silver: 3000000,
	sellers: 'Philaberto Falasi (Port Epheria), Islin Bartali and Proix (Velia), and the wharf managers',
	hireAt: 'the wharf managers at Velia, Port Epheria and Iliya Island'
};

/**
 * The hiring pool. The name a sailor is hired under is the type itself.
 *
 * `cabin` is the cabin space each one spends aboard; `appetite` how many
 * rations a day they eat; `weight` what they add to the hull's limit.
 * The four movement numbers and the three cannon numbers are the
 * level-1 base; `l10` is that stat's [min, avg, max] at level 10.
 * `at` is where the type turns up for hire.
 */
// `codex` is the sailor's id on BDOCodex (query.php?a=sailors), matched
// to each type by appetite, cabin and weight and confirmed by which stat
// it grows most -- the portrait the game shows in the sailor list lives
// there, and fetch-icons files it under the type's name.
export const pool = [
	{ type: 'Born-in-the-Sea', codex: 59070, race: 'Giant', appetite: 150, cabin: 10, weight: 500, speed: 2.0, accel: 0.3, turn: 0.3, brake: 0.3, at: ['Iliya'],
		l10: { speed: [3.0, 3.2, 3.4], accel: [1.3, 1.5, 1.7], turn: [0.6, 0.8, 1.0], brake: [0.6, 0.8, 1.0] } },
	{ type: 'Ambitious', codex: 59053, race: 'Goblin', appetite: 150, cabin: 10, weight: 200, speed: 1.6, accel: 0.2, turn: 0.2, brake: 0.2, at: ['Velia', 'Epheria'],
		l10: { speed: [2.7, 3.1, 3.4], accel: [1.1, 1.3, 1.5], turn: [1.1, 1.3, 1.5], brake: [1.1, 1.3, 1.5] } },
	{ type: 'Innocent', codex: 59055, race: 'Goblin', appetite: 150, cabin: 10, weight: 200, speed: 1.2, accel: 0.3, turn: 0.3, brake: 0.3, at: ['Velia', 'Epheria'],
		l10: { speed: [2.8, 3.4, 4.0], accel: [1.2, 1.4, 1.6], turn: [1.4, 2.0, 2.5], brake: [1.4, 2.0, 2.5] },
		note: 'Slower to start than an Ambitious one, and the best speed of any sailor by the time it is levelled.' },
	{ type: 'Experienced', codex: 59066, race: 'Human', appetite: 150, cabin: 10, weight: 250, speed: 1.0, accel: 1.0, turn: 0.3, brake: 0.3, at: ['Velia', 'Epheria'],
		l10: { speed: [2.1, 2.5, 2.8], accel: [2.1, 2.5, 2.8], turn: [1.3, 1.5, 1.7], brake: [1.3, 1.5, 1.7] } },
	{ type: 'Powerful', codex: 59069, race: 'Giant', appetite: 150, cabin: 8, weight: 500, speed: 1.0, accel: 1.0, turn: 1.0, brake: 1.0, at: ['Iliya'],
		l10: { speed: [2.1, 2.5, 2.8], accel: [2.1, 2.5, 2.8], turn: [2.1, 2.5, 2.8], brake: [2.1, 2.5, 2.8] } },
	{ type: 'Dreaming of a Full Haul', codex: 59068, race: 'Giant', appetite: 150, cabin: 13, weight: 400, speed: 0.2, accel: 1.4, turn: 0.2, brake: 0.2, at: ['Epheria', 'Iliya'],
		l10: { speed: [1.1, 1.3, 1.5], accel: [3.5, 5.0, 6.5], turn: [1.1, 1.3, 1.5], brake: [1.1, 1.3, 1.5] } },
	{ type: 'Honest', codex: 59063, race: 'Human', appetite: 120, cabin: 7, weight: 200, speed: 0.5, accel: 0.5, turn: 0.5, brake: 0.5, at: ['Iliya'],
		l10: { speed: [1.6, 2.0, 2.3], accel: [1.6, 2.0, 2.3], turn: [1.6, 2.0, 2.3], brake: [1.6, 2.0, 2.3] } },
	{ type: 'Strong', codex: 59065, race: 'Human', appetite: 100, cabin: 8, weight: 250, speed: 0.5, accel: 0.5, turn: 1.5, brake: 1.5, at: ['Iliya'],
		l10: { speed: [1.4, 1.6, 1.8], accel: [1.4, 1.6, 1.8], turn: [3.5, 4.2, 4.8], brake: [3.5, 4.2, 4.8] } },
	{ type: 'Smart', codex: 59071, race: 'Giant', appetite: 100, cabin: 5, weight: 500, speed: 0.4, accel: 0.4, turn: 0.4, brake: 0.4, at: ['Velia', 'Epheria'],
		l10: { speed: [1.3, 1.5, 1.7], accel: [1.3, 1.5, 1.7], turn: [1.3, 1.5, 1.7], brake: [1.3, 1.5, 1.7] } },
	{ type: 'Diligent', codex: 59054, race: 'Goblin', appetite: 80, cabin: 10, weight: 100, speed: 0.3, accel: 0.3, turn: 2.0, brake: 2.0, at: ['Iliya'],
		l10: { speed: [1.2, 1.4, 1.6], accel: [1.2, 1.4, 1.6], turn: [3.6, 4.0, 4.4], brake: [3.6, 4.0, 4.4] } },
	{ type: 'Calculating', codex: 59058, race: 'Dwarf', appetite: 150, cabin: 10, weight: 300, speed: 0.3, accel: 1.2, turn: 0.3, brake: 0.3, at: ['Velia', 'Epheria'],
		l10: { speed: [1.3, 1.5, 1.7], accel: [2.8, 3.4, 4.0], turn: [1.9, 2.5, 3.1], brake: [1.9, 2.5, 3.1] } },
	{ type: 'Confident', codex: 59061, race: 'Dwarf', appetite: 100, cabin: 5, weight: 300, speed: 0.3, accel: 0.3, turn: 3.0, brake: 0.6, at: ['Velia', 'Epheria'],
		l10: { speed: [1.3, 1.5, 1.7], accel: [1.3, 1.5, 1.7], turn: [7.1, 7.7, 8.3], brake: [2.6, 3.3, 3.9] } },
	{ type: 'Tough', codex: 59064, race: 'Human', appetite: 100, cabin: 5, weight: 300, speed: 0.3, accel: 0.3, turn: 0.6, brake: 3.0, at: ['Velia', 'Epheria'],
		l10: { speed: [1.3, 1.5, 1.7], accel: [1.3, 1.5, 1.7], turn: [2.6, 3.3, 3.9], brake: [7.1, 7.7, 8.3] } },
	{ type: 'Enamored', codex: 59056, race: 'Goblin', appetite: 150, cabin: 10, weight: 300, speed: 0.2, accel: 1.6, turn: 0.2, brake: 0.2, at: ['Velia', 'Epheria'],
		l10: { speed: [1.1, 1.3, 1.5], accel: [2.7, 3.1, 3.4], turn: [1.1, 1.3, 1.5], brake: [1.1, 1.3, 1.5] } },
	{ type: 'Treasure-Seeking', codex: 59059, race: 'Dwarf', appetite: 110, cabin: 5, weight: 300, speed: 0.2, accel: 0.2, turn: 4.0, brake: 0.8, at: ['Velia', 'Epheria'],
		l10: { speed: [1.1, 1.3, 1.5], accel: [1.1, 1.3, 1.5], turn: [5.6, 6.0, 6.4], brake: [1.8, 2.0, 2.2] } },
	{ type: 'Tenacious', codex: 59062, race: 'Dwarf', appetite: 100, cabin: 5, weight: 300, speed: 0.2, accel: 0.2, turn: 0.8, brake: 4.0, at: ['Velia'],
		l10: { speed: [1.1, 1.3, 1.5], accel: [1.1, 1.3, 1.5], turn: [1.8, 2.0, 2.2], brake: [5.6, 6.0, 6.4] } },
	{ type: 'Quick-Witted', codex: 59072, race: 'Giant', appetite: 150, cabin: 10, weight: 500, speed: 0.2, accel: 0.2, turn: 0.2, brake: 3.0, force: 0.2, focus: 5.0, vision: 0.2, at: ['Velia', 'Iliya'],
		l10: { speed: [1.1, 1.8, 2.5], accel: [1.7, 2.4, 3.0], turn: [1.5, 1.8, 2.0], brake: [5.7, 7.8, 9.8], force: [1.1, 1.3, 1.5], focus: [9.1, 11.1, 13.0], vision: [1.1, 1.3, 1.5] } },
	// Quick's cannon base read force 3.0 / vision 0.2 in the guide; the
	// community sheet and the codex maxima agree it is the other way,
	// and the patch that reshaped them puts Force at 3.5–5% by level 10.
	{ type: 'Quick', codex: 59057, race: 'Goblin', appetite: 100, cabin: 10, weight: 250, speed: 0.2, accel: 1.5, turn: 0.2, brake: 0.2, force: 2.0, focus: 0.2, vision: 6.0, at: ['Velia', 'Iliya'],
		l10: { speed: [1.1, 1.8, 2.5], accel: [4.6, 6.2, 7.8], turn: [1.3, 1.7, 2.0], brake: [2.2, 2.9, 3.5], force: [3.5, 4.3, 5.0], focus: [1.2, 1.5, 1.8], vision: [6.9, 7.0, 7.1] } },
	{ type: 'Realistic', codex: 59060, race: 'Dwarf', appetite: 100, cabin: 10, weight: 300, speed: 0.2, accel: 0.2, turn: 3.0, brake: 0.2, force: 0.2, focus: 0.2, vision: 15.0, at: ['Velia', 'Iliya'],
		l10: { speed: [1.1, 1.8, 2.5], accel: [1.7, 2.4, 3.0], turn: [5.7, 7.8, 9.8], brake: [2.2, 2.9, 3.5], force: [1.2, 1.4, 1.5], focus: [1.2, 1.4, 1.5], vision: [41.9, 45.0, 48.0] } },
	{ type: 'Curious', codex: 59067, race: 'Human', appetite: 100, cabin: 10, weight: 300, speed: 0.2, accel: 1.0, turn: 0.2, brake: 1.0, force: 1.0, focus: 3.0, vision: 0.2, at: ['Velia', 'Iliya'],
		l10: { speed: [1.1, 1.8, 2.5], accel: [3.9, 4.6, 5.2], turn: [1.5, 1.8, 2.0], brake: [4.0, 5.3, 6.6], force: [2.6, 3.8, 5.0], focus: [6.1, 7.6, 9.0], vision: [1.1, 1.2, 1.3] } }
];

export const poolByType = Object.fromEntries(pool.map(s => [s.type, s]));

/** Where a sailor stands, and what standing there does with their stats. */
export const positions = [
	{ name: 'Sail', effect: 'Endurance and Wits count double', for: 'speed and acceleration' },
	{ name: 'Wheel', effect: 'Awareness and Strength count double', for: 'turning and braking' },
	{ name: 'Cannon', effect: 'Focus, Force and Vision count double', for: 'cannon damage, reload and range -- the Panokseon has two more of these than a Carrack' },
	{ name: 'Deck', effect: '+10,000 durability for every cabin the sailor costs', for: 'a ten-cabin sailor is a hundred thousand durability' },
	{ name: 'Mess', effect: '+5,000 rations for every cabin the sailor costs', for: 'longer between ports' },
	{ name: 'Fish', effect: 'auto-fishing with an Oceanbound Otter Fishing Rod aboard', for: 'a Carrack only; the gauge fills every 180 s under way' },
	{ name: 'First Mate', effect: 'the sailor\'s own skill is switched on', for: 'the three named first mates below' }
];

/** Condition and sickness, and what mends each. */
export const care = [
	{ item: 'Raisin Bread', effect: '+1 condition', from: 'a wharf manager, for silver' },
	{ item: 'Chowder', effect: '+10 condition', from: 'cooking: Dried Pearl Oyster Flesh ×1 (or Dried Shellfish ×5), Pepper ×2, Pork ×2, Milk ×1, Teff Bread ×1' },
	{ item: 'Elixir of Regeneration', effect: 'cures a sick sailor and restores condition to 100%', from: 'alchemy: Mandragora Essence ×1, Essence of Nature ×1, Oil of Regeneration ×1, Troll Blood ×2, Grape ×4' },
	{ item: 'Tears of the Star', effect: 'cures a sick sailor', from: 'the Pearl Shop, 50 pearls' }
];

/** Emergency rations, by the grade of food thrown at them. */
export const rations = [
	{ grade: 'White', restores: 80 },
	{ grade: 'Green', restores: 100 },
	{ grade: 'Blue', restores: 240 },
	{ grade: 'Yellow', restores: 4000 },
	{ grade: 'Orange', restores: 22000 }
];

/**
 * How sailing experience is shared out. Each sailor aboard gets a
 * smaller share, but the crew as a whole earns more -- from eleven
 * sailors up it is four times a lone sailor's, split evenly. The guide
 * publishes these points and no others.
 */
export const expSplit = [
	{ aboard: 1, each: 100, total: 100 },
	{ aboard: 5, each: 44, total: 220 },
	{ aboard: 10, each: 37, total: 370 },
	{ aboard: 11, each: null, total: 400, note: 'and every count above it: 400% in total, shared equally' }
];

/** The three sailors with a name of their own, and how each is met. */
// `npc` is the first mate's page on BDOCodex (they are people before they
// are sailors), which is where their portrait comes from.
export const firstMates = [
	{ name: 'Proix', npc: 58045, portrait: '/items/ui_artwork/ic_01463.webp', trait: 'Breezy Sail lasts longer', from: 'finish the "[The Great Expedition] In Search of Khan" questline' },
	{ name: 'Cleia', npc: 41056, portrait: '/items/ui_artwork/ic_00496.webp', trait: 'Parley costs 10% less', from: 'obtain the Golden Pocket Watch from a Special Barter' },
	{ name: 'Tranan Underfoe', npc: 40008, portrait: '/items/ui_artwork/ic_00008.webp', trait: 'the ship repairs itself from repair materials in its inventory', from: 'obtain the Fancy Figurehead where the Saltwater Crocodiles are' }
];

/**
 * The account-wide sailor cap is 60. Slots above the starting handful
 * come from Sailor's Oaths -- five along the main sailing questline that
 * ends at Oquilla's Eye, three from Chulong's Gift at Moodle Village --
 * and a Captain's Medallion for 7,000 Loyalties buys another.
 */
export const slotSources = [
	{ from: '[The Great Expedition] First Sailboat into Oquilla\'s Eye and the main sailing questline', oaths: 5 },
	{ from: 'Chulong\'s Gift (Chulong, Moodle Village in Nampo)', oaths: 3 },
	{ from: 'Captain\'s Medallion, 7,000 Loyalties', oaths: 1 }
];

export const SAILOR_CAP = 60;


/**
 * A crew plan against a hull: what it spends and what it grows.
 *
 * `crew` is `{ [type]: count }`. Returns the totals the Crew screen
 * reads, with both budgets -- sailors seated and cabin space -- measured
 * against the hull. Anything beyond either is a plan the game will
 * refuse, and is flagged rather than clamped so the row can say so.
 */
export function planCrew(crew, ship) {
	const totals = { sailors: 0, cabins: 0, weight: 0, appetite: 0, silver: 0,
		speed: 0, accel: 0, turn: 0, brake: 0, force: 0, focus: 0, vision: 0 };
	for (const [type, n] of Object.entries(crew || {})) {
		const s = poolByType[type];
		const count = Math.max(0, Math.floor(Number(n) || 0));
		if (!s || !count) continue;
		totals.sailors += count;
		totals.cabins += s.cabin * count;
		totals.weight += s.weight * count;
		totals.appetite += s.appetite * count;
		totals.silver += contract.silver * count;
		for (const k of ['speed', 'accel', 'turn', 'brake', 'force', 'focus', 'vision']) {
			totals[k] += (s[k] || 0) * count;
		}
	}
	const seats = ship ? ship.crew : 0;
	const space = ship ? ship.cabins : 0;
	return {
		...totals,
		seats,
		space,
		overSeats: seats ? Math.max(0, totals.sailors - seats) : 0,
		overSpace: space ? Math.max(0, totals.cabins - space) : 0
	};
}

/* ------------------------------------------------------------------ *
 * The Manage Sailors board: seats, a roster, and what a crew adds up to
 * ------------------------------------------------------------------ */

/**
 * The three first mates as sailors that can be hired onto the roster:
 * the game gives them fixed, modest stats, no cabin cost, and a skill
 * the First Mate seat switches on.
 */
export const mateTypes = firstMates.map(m => ({
	type: m.name, race: m.name === 'Tranan Underfoe' ? 'Dwarf' : 'Human', mate: true,
	appetite: 100, cabin: 0, weight: 200,   // each adds 200 LT, read off the sailor window
	speed: 0.5, accel: 0.5, turn: 0.5, brake: 0.5,
	skill: `${m.trait} — ${m.from}`
}));

export const anyType = Object.fromEntries([...pool, ...mateTypes].map(s => [s.type, s]));

/** The seats a hull has, in the order the board draws them. */
const POSITIONS = [
	{ pos: 'sail', label: 'Sail', n: 1, effect: 'speed and acceleration count double' },
	{ pos: 'wheel', label: 'Wheel', n: 1, effect: 'turning and braking count double' },
	{ pos: 'cannon', label: 'Cannon', n: 1, effect: 'cannon damage, reload and range' },
	{ pos: 'deck', label: 'Deck', n: 1, effect: '+10,000 durability for every cabin the sailor costs' },
	{ pos: 'mess', label: 'Mess', n: 1, effect: '+5,000 rations for every cabin the sailor costs' },
	{ pos: 'firstmate', label: 'First Mate', n: 1, effect: "the sailor's own skill switches on" },
	{ pos: 'fish', label: 'Fish', n: 1, effect: 'auto-fishing under way — a Carrack only' }
];

/**
 * The seat every hull of that name has over the common frame: each
 * Carrack is built around one extra seat, and which one is the whole
 * difference between them; the Panokseon carries two more guns.
 */
const EXTRA = {
	'Carrack (Advance)': { mess: 1 },
	'Carrack (Balance)': { sail: 1 },
	'Carrack (Volante)': { sail: 1 },
	'Carrack (Valor)': { cannon: 1 },
	Panokseon: { cannon: 2 }
};

/**
 * Which seats a hull offers: the named positions first, as many as the
 * hull seats, then cabins for the rest -- the hull's own extra seat
 * included. Only a Carrack has a fishing seat.
 */
export function seatsFor(ship, stats) {
	const crew = stats ? stats.crew : 0;
	const extra = EXTRA[ship] || {};
	const out = [];
	for (const p of POSITIONS) {
		if (p.pos === 'fish' && !/^Carrack/.test(ship)) continue;
		const n = p.n + (extra[p.pos] || 0);
		for (let i = 0; i < n && out.length < crew; i++) out.push({ key: `${p.pos}:${i}`, pos: p.pos, label: p.label, effect: p.effect });
	}
	for (let i = 0; out.length < crew; i++) out.push({ key: `cabin:${i}`, pos: 'cabin', label: 'Cabin', effect: 'no role, but aboard: weight and appetite count, and they level along' });
	return out;
}

/**
 * A saved arrangement kept to the seats this hull really has: a crew
 * seated when the board drew a second sail keeps nobody there on a
 * hull whose extra seat is a Mess or a gun, so no seat pays out twice.
 */
export function fitSeats(ship, seats, stats) {
	const keys = new Set(seatsFor(ship, stats).map(x => x.key));
	if (!keys.size) return { ...(seats || {}) };   // an unknown hull: leave it be
	const out = {};
	for (const [k, id] of Object.entries(seats || {})) if (keys.has(k)) out[k] = id;
	return out;
}

/** A sailor's stat at their level: what the level usually holds. */
export function statOf(sailor, key) {
	const t = anyType[sailor.type];
	if (!t) return 0;
	// Every level adds a hidden roll, so the estimate is the middle of
	// what the level can hold. The game shows each sailor's real
	// numbers; typed into the roster, they outrank this.
	if (sailor.stats && Number.isFinite(sailor.stats[key])) return sailor.stats[key];
	const band = statBand(sailor.type, key, sailor.lv || 1);
	return band ? band.avg : (t[key] || 0);   // a first mate's figures do not grow
}

/* ------------------------------------------------------------------ *
 * what a level can hold: the rolls, level by level
 * ------------------------------------------------------------------ */

const clampLv = lv => Math.min(10, Math.max(1, Math.floor(Number(lv) || 1)));

/** What a type's stat can add at each level, in tenths, or null. */
export function rollsFor(type, key) {
	const r = sailorRolls[type];
	return r && r[key] ? r[key] : null;
}

/**
 * The [min, avg, max] a stat can be at a level -- what a typed roll is
 * judged against. Summed level by level from the rolls where the type
 * has them: the least every level-up could add, the most, and the mean
 * of every path between, which is the middle since each level-up is
 * as likely to land anywhere in its range. A type without rolls walks
 * the line from its base to its level-10 band instead.
 */
export function statBand(type, key, lv = 10) {
	const n = clampLv(lv);
	const r = rollsFor(type, key);
	if (r) {
		let lo = 0, hi = 0;
		for (let i = 0; i < n; i++) { lo += r.min[i]; hi += r.max[i]; }
		return { min: lo / 10, avg: Math.round((lo + hi) / 2) / 10, max: hi / 10 };
	}
	const t = anyType[type];
	const band = t && t.l10 && t.l10[key];
	if (!band) return null;
	const base = t[key] || 0;
	const f = (n - 1) / 9;
	const at = v => Math.round((base + (v - base) * f) * 10) / 10;
	return { min: at(band[0]), avg: at(band[1]), max: at(band[2]) };
}

/**
 * Every value a stat can hold at a level and how likely each one is,
 * each level-up drawn evenly from its own range -- the community sheet
 * records the ends of each range and nothing about its shape, so even
 * is the honest assumption. `dist` maps tenths to probability; `paths`
 * is how many distinct roll histories there are.
 */
export function rollOutcomes(type, key, lv = 10) {
	const r = rollsFor(type, key);
	if (!r) return null;
	const n = clampLv(lv);
	let dist = new Map([[r.min[0], 1]]);
	let paths = 1;
	for (let i = 1; i < n; i++) {
		const lo = r.min[i], hi = r.max[i], w = hi - lo + 1;
		paths *= w;
		const next = new Map();
		for (const [v, p] of dist) for (let g = lo; g <= hi; g++) next.set(v + g, (next.get(v + g) || 0) + p / w);
		dist = next;
	}
	return { dist, paths };
}

/**
 * Where a roll stands among every roll the level could have made:
 * the share of paths below it and at it, the value most paths reach,
 * and the mean. Null for a type without rolls.
 */
export function rollRank(type, key, lv, value) {
	const o = rollOutcomes(type, key, lv);
	if (!o) return null;
	const v = Math.round(Number(value) * 10);
	let below = 0, at = 0, above = 0, mode = 0, modeP = 0, mean = 0;
	for (const [x, p] of o.dist) {
		if (x < v) below += p; else if (x === v) at += p; else above += p;
		if (p > modeP) { modeP = p; mode = x; }
		mean += x * p;
	}
	return { below, at, above, mode: mode / 10, mean: Math.round(mean) / 10, paths: o.paths };
}

export const STAT_KEYS = ['speed', 'accel', 'turn', 'brake', 'force', 'focus', 'vision'];

/* ---- the level log ---------------------------------------------------- *
   A sailor's level is typed in as it changes, and what it was before is
   lost with it -- which is a pity, since the level a sailor reached on
   what day is how a player tells a fast grower from a slow one. So
   each roster entry can carry a small log: when the level changed,
   to what, and the typed stats at the time when there were any. */

export const LEVEL_LOG_MAX = 30;

/**
 * The sailor with `level` written in and the change logged: a new
 * entry when the level differs from the last one logged (or, with no
 * log yet, from the level the sailor had), nothing when it does not,
 * and never more than LEVEL_LOG_MAX entries, the oldest going first.
 * The entry keeps the stats as typed at the moment of the change, so
 * a roll can be read against the level it was rolled at.
 */
export function logLevel(sailor, level, now = Date.now()) {
	const lv = Math.min(10, Math.max(1, Math.floor(Number(level) || sailor.lv || 1)));
	const log = Array.isArray(sailor.log) ? sailor.log : [];
	const last = log.length ? log[log.length - 1].level : sailor.lv;
	if (lv === last) return { ...sailor, lv };
	const entry = { t: now, level: lv };
	if (sailor.stats && Object.keys(sailor.stats).length) entry.stats = { ...sailor.stats };
	return { ...sailor, lv, log: [...log, entry].slice(-LEVEL_LOG_MAX) };
}

/** The log as steps, newest first: what it went from, to, and when. */
export function levelSteps(sailor) {
	const log = Array.isArray(sailor && sailor.log) ? sailor.log : [];
	const out = [];
	for (let i = log.length - 1; i >= 0; i--) {
		const from = i > 0 ? log[i - 1].level : null;
		out.push({ from, to: log[i].level, t: log[i].t, stats: log[i].stats || null });
	}
	return out;
}

/**
 * What a seated crew adds to the hull. A Sail seat doubles speed and
 * acceleration, the Wheel doubles turning and braking, the Deck pays
 * durability and the Mess rations by the sailor's cabin cost; every
 * sailor aboard adds weight, eats, and spends cabin space.
 */
export function crewTotals(roster, seats, stats) {
	const byId = new Map((roster || []).map(s => [s.id, s]));
	const t = { seated: 0, cabins: 0, weight: 0, appetite: 0, speed: 0, accel: 0, turn: 0, brake: 0,
		force: 0, focus: 0, vision: 0, durability: 0, rations: 0, sick: 0 };
	for (const [key, id] of Object.entries(seats || {})) {
		const s = byId.get(id);
		const type = s && anyType[s.type];
		if (!type) continue;
		const pos = key.split(':')[0];
		t.seated++;
		t.cabins += type.cabin;
		t.weight += type.weight;
		t.appetite += type.appetite;
		// A sick sailor still eats, weighs and takes a cabin, and gives
		// the seat nothing until mended.
		if ((s.cond ?? 100) <= 0) {
			t.sick++;
			continue;
		}
		const m = (k, mult = 1) => statOf(s, k) * mult;
		t.speed += m('speed', pos === 'sail' ? 2 : 1);
		t.accel += m('accel', pos === 'sail' ? 2 : 1);
		t.turn += m('turn', pos === 'wheel' ? 2 : 1);
		t.brake += m('brake', pos === 'wheel' ? 2 : 1);
		if (pos === 'cannon') {
			t.force += m('force', 2);
			t.focus += m('focus', 2);
			t.vision += m('vision', 2);
		}
		if (pos === 'deck') t.durability += type.cabin * 10000;
		if (pos === 'mess') t.rations += type.cabin * 5000;
	}
	for (const k of ['speed', 'accel', 'turn', 'brake', 'force', 'focus', 'vision']) t[k] = Math.round(t[k] * 10) / 10;
	t.seats = stats ? stats.crew : 0;
	t.space = stats ? stats.cabins : 0;
	t.overSpace = Math.max(0, t.cabins - t.space);
	return t;
}

/**
 * Fill the seats sensibly from a roster: the first mate to their seat,
 * the fastest to the sails, the best handler to the wheel, the gunners
 * to the cannons, the costliest cabins to the Deck and the Mess (where
 * cabin cost is the whole point), and everyone left to a cabin.
 */
export function autoAssign(roster, ship, stats) {
	const seats = seatsFor(ship, stats);
	const left = [...(roster || [])].filter(s => anyType[s.type]);
	const out = {};
	const t = s => anyType[s.type];
	const gunner = s => t(s).force !== undefined;
	// The cabin budget is kept: a sailor who would not fit stays ashore,
	// however good, because the game will not seat them either.
	const space = stats && stats.cabins > 0 ? stats.cabins : Infinity;
	let used = 0;
	const take = (seat, score, only = () => true) => {
		if (out[seat.key]) return;
		const pick = left.filter(s => only(s) && used + t(s).cabin <= space).sort((a, b) => score(b) - score(a))[0];
		if (!pick) return;
		out[seat.key] = pick.id;
		used += t(pick).cabin;
		left.splice(left.indexOf(pick), 1);
	};
	const of = pos => seats.filter(x => x.pos === pos);
	// Specialists first, so a gunner is not swept up by a sail: the mate
	// to the bow, the gunners to the cannons, then the fastest to the
	// sails, the best handler to the wheel, the costliest cabins to the
	// Deck and the Mess, and everyone left wherever is free.
	for (const seat of of('firstmate')) take(seat, s => statOf(s, 'speed'), s => t(s).mate);
	for (const seat of of('cannon')) take(seat, s => statOf(s, 'force') + statOf(s, 'focus') + statOf(s, 'vision'), s => gunner(s) && !t(s).mate);
	for (const seat of of('sail')) take(seat, s => statOf(s, 'speed') + statOf(s, 'accel'), s => !t(s).mate);
	for (const seat of of('wheel')) take(seat, s => statOf(s, 'turn') + statOf(s, 'brake'), s => !t(s).mate);
	for (const seat of [...of('deck'), ...of('mess')]) take(seat, s => t(s).cabin, s => !t(s).mate);
	for (const seat of seats) take(seat, () => 0);
	return out;
}
