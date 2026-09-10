// What each hull actually is, in the game's own numbers.
//
// The recipes say what a ship costs; this says what you get for it --
// the figures the ship's own window shows, read off each hull's
// BDOCodex mount page on 2026-08-29 (durability, rations, weight,
// inventory, cabins, cannons, reload). The four movement percentages are
// the in-game display values, cross-checked against the community
// stat-comparison table: the codex's movement block is misaligned
// (acceleration always reads 0%), so it is not the source for those.
//
// `cabins` is cabin space, a budget each sailor spends 5-13 of; `crew`
// is how many sailors the hull seats regardless. Both are what the
// Crew screen plans against. The Panokseon's cabin space is 150 on the
// codex and in the comparison table; one guide's sailor table says 110.
// The codex is taken, with the disagreement noted here.
//
// Keys are the names the rest of the app uses for the same hulls.

import { T, TT } from './i18n.js';

export const shipStats = {
	"Bartali Sailboat": {
		durability: 700000, rations: 1000000, weight: 2000, slots: 3,
		cabins: 10, crew: 2, cannons: 1, reload: 17,
		speed: 80, accel: 80, turn: 80, brake: 80,
		note: TT('The purchased hull every Epheria ship begins from. Its one cannon a side is fired standing at it.')
	},
	"Epheria Sailboat": {
		durability: 1000000, rations: 1000000, weight: 5000, slots: 25,
		cabins: 10, crew: 2, cannons: 1, reload: 17,
		speed: 100, accel: 100, turn: 110, brake: 110,
		note: TT('Cargo over guns: five thousand LT and twenty-five slots, one cannon a side.')
	},
	"Improved Epheria Sailboat": {
		durability: 1000000, rations: 1000000, weight: 5000, slots: 25,
		cabins: 10, crew: 2, cannons: 2, reload: 13,
		speed: 100, accel: 100, turn: 110, brake: 110,
		note: TT('The same hull with a second cannon a side, fired from the wheel.')
	},
	"Epheria Frigate": {
		durability: 1200000, rations: 1000000, weight: 4000, slots: 12,
		cabins: 10, crew: 2, cannons: 2, reload: 17,
		speed: 110, accel: 110, turn: 120, brake: 120,
		note: TT('Guns over cargo: two cannons a side, faster and tougher, twelve slots.')
	},
	"Improved Epheria Frigate": {
		durability: 1200000, rations: 1000000, weight: 4000, slots: 12,
		cabins: 10, crew: 2, cannons: 4, reload: 13,
		speed: 110, accel: 110, turn: 120, brake: 120,
		note: TT('Four cannons a side, fired from the wheel.')
	},
	"Epheria Caravel": {
		durability: 1000000, rations: 1100000, weight: 10000, slots: 30,
		cabins: 30, crew: 6, cannons: 2, reload: 13,
		speed: 100, accel: 100, turn: 110, brake: 110,
		note: TT('The trading hull: ten thousand LT, thirty slots, six sailors.')
	},
	"Epheria Galleass": {
		durability: 1200000, rations: 1200000, weight: 8000, slots: 15,
		cabins: 30, crew: 6, cannons: 4, reload: 13,
		speed: 110, accel: 110, turn: 120, brake: 120,
		note: TT('The fighting hull: four cannons a side, six sailors, eight thousand LT.')
	},
	"Carrack (Advance)": {
		durability: 1350000, rations: 1300000, weight: 16500, slots: 40,
		cabins: 110, crew: 20, cannons: 9, reload: 13,
		speed: 110, accel: 100, turn: 115, brake: 115,
		note: TT('The barter Carrack: the most weight and slots of the four, and the toughest.')
	},
	"Carrack (Balance)": {
		durability: 1300000, rations: 1400000, weight: 15000, slots: 35,
		cabins: 110, crew: 20, cannons: 9, reload: 12,
		speed: 115, accel: 100, turn: 115, brake: 115,
		note: TT('Nearly the Advance\'s hold, a little more speed, a second faster on the cannons.')
	},
	"Carrack (Volante)": {
		durability: 1250000, rations: 1400000, weight: 13500, slots: 20,
		cabins: 110, crew: 20, cannons: 9, reload: 12,
		speed: 120, accel: 110, turn: 125, brake: 125,
		note: TT('The fastest hull in the game short of the guild Galleon; twenty slots is the price.')
	},
	"Carrack (Valor)": {
		durability: 1300000, rations: 1500000, weight: 13500, slots: 20,
		cabins: 110, crew: 20, cannons: 9, reload: 11,
		speed: 115, accel: 110, turn: 125, brake: 125,
		note: TT('The hunting Carrack: the fastest reload, the deepest rations, and the Volante\'s handling.')
	},
	"Panokseon": {
		durability: 2000000, rations: 1300000, weight: 12500, slots: 20,
		cabins: 150, crew: 20, cannons: 9, reload: 13,
		speed: 105, accel: 100, turn: 110, brake: 115,
		note: TT('Two million durability and the widest cabin space of any hull; slower than a Carrack, and it rams harder.')
	},
	"Epheria Cog": {
		durability: 100100, rations: 500000, weight: 1080, slots: 1,
		cabins: 0, crew: 0, cannons: 0, reload: 0,
		speed: 140, accel: 140, turn: 115, brake: 115,
		lifespan: 500000,
		note: TT('A throwaway runabout: no sailors, no cannons, no bartering, and a lifespan of 500,000 that repairs cannot restore. Quicker than anything above it.')
	},
	"Rowboat": {
		durability: 70100, rations: 235200, weight: 360, slots: 8,
		cabins: 0, crew: 0, cannons: 0, reload: 0,
		speed: 100, accel: 100, turn: 105, brake: 100,
		note: TT('Enough boat for the coast and the first Great Ocean errands.')
	},
	"Calpheon Rowboat": {
		durability: 70100, rations: 235200, weight: 450, slots: 8,
		cabins: 0, crew: 0, cannons: 0, reload: 0,
		speed: 100, accel: 100, turn: 105, brake: 100,
		note: TT('The Rowboat with a little more weight allowance.')
	},
	"Mediah Rowboat": {
		durability: 70100, rations: 235200, weight: 360, slots: 8,
		cabins: 0, crew: 0, cannons: 0, reload: 0,
		speed: 100, accel: 100, turn: 105, brake: 100,
		note: TT('The Rowboat built from Mediah\'s materials.')
	},
	"Raft": {
		durability: 40100, rations: 85680, weight: 180, slots: 4,
		cabins: 0, crew: 0, cannons: 0, reload: 0,
		speed: 100, accel: 100, turn: 100, brake: 100,
		note: TT('Twenty-five logs and some powder. It floats.')
	}
};

/** Every hull that seats a sailor, in the order the app lists ships. */
export const crewedShips = Object.keys(shipStats).filter(s => shipStats[s].crew > 0);

/** A short line of the numbers a player compares hulls by. */
export function statsLine(ship) {
	const s = shipStats[ship];
	if (!s) return '';
	const bits = [T('{n} LT', { n: s.weight.toLocaleString() }), T('{n} slots', { n: s.slots })];
	if (s.crew) bits.push(T('{n} sailors', { n: s.crew }));
	if (s.cannons) bits.push(s.cannons > 1 ? T('{n} cannons a side', { n: s.cannons }) : T('{n} cannon a side', { n: s.cannons }));
	bits.push(T('speed {n}%', { n: s.speed }));
	return bits.join(' · ');
}
