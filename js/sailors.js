// The crew: who can be hired, what each one is good for, what keeps
// them well, and how many a hull will carry.
//
// Read from the official sailing guide and the community sailor tables
// on 2026-08-29 -- the wiki for positions, condition and the certificate;
// the tables for the hiring pool, which the wiki does not list. Where the
// two disagreed (cabin counts) the hulls' own codex pages settled it, in
// ship_stats.js. Only what could be verified is here; growth is given as
// each type's specialisation per level, because the exact roll bands are
// published for one type only.

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
 * The four movement numbers and the three cannon numbers are how fast
 * that stat grows per level -- the shape of the sailor, not a total.
 * `at` is where the type turns up for hire.
 */
export const pool = [
	{ type: 'Born-in-the-Sea', race: 'Giant', appetite: 150, cabin: 10, weight: 500, speed: 2.0, accel: 0.3, turn: 0.3, brake: 0.3, at: ['Iliya'] },
	{ type: 'Ambitious', race: 'Goblin', appetite: 150, cabin: 10, weight: 200, speed: 1.6, accel: 0.2, turn: 0.2, brake: 0.2, at: ['Velia', 'Epheria'] },
	{ type: 'Innocent', race: 'Goblin', appetite: 150, cabin: 10, weight: 200, speed: 1.2, accel: 0.3, turn: 0.3, brake: 0.3, at: ['Velia', 'Epheria'],
		note: 'Slower to start than an Ambitious one, and the best speed growth of any sailor by the time it is levelled.' },
	{ type: 'Experienced', race: 'Human', appetite: 150, cabin: 10, weight: 250, speed: 1.0, accel: 1.0, turn: 0.3, brake: 0.3, at: ['Velia', 'Epheria'] },
	{ type: 'Powerful', race: 'Giant', appetite: 150, cabin: 8, weight: 500, speed: 1.0, accel: 1.0, turn: 1.0, brake: 1.0, at: ['Iliya'] },
	{ type: 'Dreaming of a Full Haul', race: 'Giant', appetite: 150, cabin: 13, weight: 400, speed: 0.2, accel: 1.4, turn: 0.2, brake: 0.2, at: ['Epheria', 'Iliya'] },
	{ type: 'Honest', race: 'Human', appetite: 120, cabin: 7, weight: 200, speed: 0.5, accel: 0.5, turn: 0.5, brake: 0.5, at: ['Iliya'] },
	{ type: 'Strong', race: 'Human', appetite: 100, cabin: 8, weight: 250, speed: 0.5, accel: 0.5, turn: 1.5, brake: 1.5, at: ['Iliya'] },
	{ type: 'Smart', race: 'Giant', appetite: 100, cabin: 5, weight: 500, speed: 0.4, accel: 0.4, turn: 0.4, brake: 0.4, at: ['Velia', 'Epheria'] },
	{ type: 'Diligent', race: 'Goblin', appetite: 80, cabin: 10, weight: 100, speed: 0.3, accel: 0.3, turn: 2.0, brake: 2.0, at: ['Iliya'] },
	{ type: 'Calculating', race: 'Dwarf', appetite: 150, cabin: 10, weight: 300, speed: 0.3, accel: 1.2, turn: 0.3, brake: 0.3, at: ['Velia', 'Epheria'] },
	{ type: 'Confident', race: 'Dwarf', appetite: 100, cabin: 5, weight: 300, speed: 0.3, accel: 0.3, turn: 3.0, brake: 0.6, at: ['Velia', 'Epheria'] },
	{ type: 'Tough', race: 'Human', appetite: 100, cabin: 5, weight: 300, speed: 0.3, accel: 0.3, turn: 0.6, brake: 3.0, at: ['Velia', 'Epheria'] },
	{ type: 'Enamored', race: 'Goblin', appetite: 150, cabin: 10, weight: 300, speed: 0.2, accel: 1.6, turn: 0.2, brake: 0.2, at: ['Velia', 'Epheria'] },
	{ type: 'Treasure-Seeking', race: 'Dwarf', appetite: 110, cabin: 5, weight: 300, speed: 0.2, accel: 0.2, turn: 4.0, brake: 0.8, at: ['Velia', 'Epheria'] },
	{ type: 'Tenacious', race: 'Dwarf', appetite: 100, cabin: 5, weight: 300, speed: 0.2, accel: 0.2, turn: 0.8, brake: 4.0, at: ['Velia'] },
	{ type: 'Quick-Witted', race: 'Giant', appetite: 150, cabin: 10, weight: 500, speed: 0.2, accel: 0.2, turn: 0.2, brake: 3.0, force: 0.2, focus: 5.0, vision: 0.2, at: ['Velia', 'Iliya'] },
	{ type: 'Quick', race: 'Goblin', appetite: 100, cabin: 10, weight: 250, speed: 0.2, accel: 1.5, turn: 0.2, brake: 0.2, force: 3.0, focus: 0.2, vision: 0.2, at: ['Velia', 'Iliya'] },
	{ type: 'Realistic', race: 'Dwarf', appetite: 100, cabin: 10, weight: 300, speed: 0.2, accel: 0.2, turn: 3.0, brake: 0.2, force: 0.2, focus: 0.2, vision: 15.0, at: ['Velia', 'Iliya'] },
	{ type: 'Curious', race: 'Human', appetite: 100, cabin: 10, weight: 300, speed: 0.2, accel: 1.0, turn: 0.2, brake: 1.0, force: 1.0, focus: 3.0, vision: 0.2, at: ['Velia', 'Iliya'] }
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
export const firstMates = [
	{ name: 'Proix', trait: 'Breezy Sail lasts longer', from: 'finish the "[The Great Expedition] In Search of Khan" questline' },
	{ name: 'Cleia', trait: 'Parley costs 10% less', from: 'obtain the Golden Pocket Watch from a Special Barter' },
	{ name: 'Tranan Underfoe', trait: 'the ship repairs itself from repair materials in its inventory', from: 'obtain the Fancy Figurehead where the Saltwater Crocodiles are' }
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

/** The face the game gives each race of sailor -- the contract items
 *  on BDOCodex carry the portraits, one per race, so a Human sailor of
 *  any temperament wears the same one. */
export const portraits = { Human: 'Skilled Human Sailor', Giant: 'Skilled Giant Sailor', Goblin: 'Skilled Goblin Sailor', Dwarf: 'Skilled Dwarf Sailor' };

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
	appetite: 100, cabin: 0, weight: 300,
	speed: 0.5, accel: 0.5, turn: 0.5, brake: 0.5,
	skill: `${m.trait} — ${m.from}`
}));

export const anyType = Object.fromEntries([...pool, ...mateTypes].map(s => [s.type, s]));

/** The seats a hull has, in the order the board draws them. */
const POSITIONS = [
	{ pos: 'sail', label: 'Sail', n: 2, effect: 'speed and acceleration count double' },
	{ pos: 'wheel', label: 'Wheel', n: 1, effect: 'turning and braking count double' },
	{ pos: 'cannon', label: 'Cannon', n: 1, effect: 'cannon damage, reload and range' },
	{ pos: 'deck', label: 'Deck', n: 1, effect: '+10,000 durability for every cabin the sailor costs' },
	{ pos: 'mess', label: 'Mess', n: 1, effect: '+5,000 rations for every cabin the sailor costs' },
	{ pos: 'firstmate', label: 'First Mate', n: 1, effect: "the sailor's own skill switches on" },
	{ pos: 'fish', label: 'Fish', n: 1, effect: 'auto-fishing under way — a Carrack only' }
];

/**
 * Which seats a hull offers: the named positions first, as many as the
 * hull seats, then cabins for the rest. A Panokseon has two more cannon
 * seats than a Carrack; only a Carrack has a fishing seat.
 */
export function seatsFor(ship, stats) {
	const crew = stats ? stats.crew : 0;
	const out = [];
	for (const p of POSITIONS) {
		if (p.pos === 'fish' && !/^Carrack/.test(ship)) continue;
		const n = p.pos === 'cannon' && ship === 'Panokseon' ? 3 : p.n;
		for (let i = 0; i < n && out.length < crew; i++) out.push({ key: `${p.pos}:${i}`, pos: p.pos, label: p.label, effect: p.effect });
	}
	for (let i = 0; out.length < crew; i++) out.push({ key: `cabin:${i}`, pos: 'cabin', label: 'Cabin', effect: 'no role, but aboard: weight and appetite count, and they level along' });
	return out;
}

/** A sailor's stat at their level: growth times level. */
export function statOf(sailor, key) {
	const t = anyType[sailor.type];
	return t ? Math.round((t[key] || 0) * (sailor.lv || 1) * 10) / 10 : 0;
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
		if ((s.cond ?? 100) <= 0) t.sick++;
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
	const take = (seat, score, only = () => true) => {
		if (out[seat.key]) return;
		const pick = left.filter(only).sort((a, b) => score(b) - score(a))[0];
		if (!pick) return;
		out[seat.key] = pick.id;
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
