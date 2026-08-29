// What an enhancement attempt actually costs.
//
// The plan used to assume every attempt succeeds -- ten attempts to reach
// +10 -- which under-states a Chiro part by more than tenfold. These are
// the real per-attempt numbers.
//
// Sources, checked 2026-08-25 (the yellow tier 2026-08-26):
//   rates, stone counts, perfect-enhance costs and durability loss come
//     from the enchantment table embedded in each bdocodex item page
//     (https://bdocodex.com/us/item/<id>/);
//   Agris Essence caps come from BDFoundry's Ancient Anvil tables
//     (https://www.blackdesertfoundry.com/agris-essence-enhancing-guide/).
//
// Agris Essence is the pity meter: each failure stores one, and when the
// meter is full the next attempt cannot fail. It is kept per gear group
// and per level, and is spent whenever an enhancement succeeds -- so the
// number of failures before a guaranteed success is a hard ceiling, which
// is the number worth planning against.
//
// All 70 enhanceable ship parts share seven tables. The last of them,
// the yellow tier, is the one that breaks the pattern: a failed attempt
// there takes a level, not just durability.

export const tables = {
	'sailboat': {
		label: 'Bartali Sailboat gear',
		material: 'Black Stone',
		// index = the level you are at; the attempt takes you to index + 1
		levels: [
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 2, perfect: null, durability: 0 },
			{ chance: 1, stones: 3, perfect: null, durability: 0 },
			{ chance: 1, stones: 4, perfect: null, durability: 0 },
			{ chance: 1, stones: 5, perfect: null, durability: 0 },
			{ chance: 1, stones: 6, perfect: null, durability: 0 },
			{ chance: 1, stones: 7, perfect: null, durability: 0 },
			{ chance: 1, stones: 8, perfect: null, durability: 0 },
			{ chance: 1, stones: 9, perfect: null, durability: 0 },
			{ chance: 1, stones: 10, perfect: null, durability: 0 },
		]
	},
	'caravel-blue': {
		label: 'Caravel / Galleass blue',
		material: 'Tidal Black Stone',
		// index = the level you are at; the attempt takes you to index + 1
		levels: [
			{ chance: 0.3, stones: 1, perfect: 5, durability: 5, agris: 3 },
			{ chance: 0.25, stones: 1, perfect: 6, durability: 5, agris: 3 },
			{ chance: 0.2, stones: 1, perfect: 7, durability: 5, agris: 3 },
			{ chance: 0.15, stones: 1, perfect: 10, durability: 5, agris: 4 },
			{ chance: 0.12, stones: 1, perfect: 13, durability: 5, agris: 4 },
			{ chance: 0.1, stones: 2, perfect: 46, durability: 10, agris: 4 },
			{ chance: 0.05, stones: 2, perfect: 92, durability: 10, agris: 7 },
			{ chance: 0.03, stones: 2, perfect: 152, durability: 10, agris: 9 },
			{ chance: 0.02, stones: 2, perfect: 230, durability: 10, agris: 12 },
			{ chance: 0.01, stones: 2, perfect: 460, durability: 10, agris: 20 },
		]
	},
	'caravel-green': {
		label: 'Caravel / Galleass green',
		material: 'Tidal Black Stone',
		// index = the level you are at; the attempt takes you to index + 1
		levels: [
			{ chance: 0.7, stones: 1, perfect: 2, durability: 5, agris: 3 },
			{ chance: 0.6, stones: 1, perfect: 3, durability: 5, agris: 4 },
			{ chance: 0.5, stones: 1, perfect: 3, durability: 5, agris: 4 },
			{ chance: 0.45, stones: 1, perfect: 4, durability: 5, agris: 5 },
			{ chance: 0.4, stones: 1, perfect: 4, durability: 5, agris: 5 },
			{ chance: 0.37, stones: 2, perfect: 6, durability: 10, agris: 5 },
			{ chance: 0.35, stones: 2, perfect: 6, durability: 10, agris: 5 },
			{ chance: 0.33, stones: 2, perfect: 8, durability: 10, agris: 5 },
			{ chance: 0.31, stones: 2, perfect: 8, durability: 10, agris: 5 },
			{ chance: 0.3, stones: 2, perfect: 10, durability: 10, agris: 6 },
		]
	},
	'chiro': {
		label: 'Carrack Chiro / Panokseon Byukgye (blue)',
		material: 'Tidal Black Stone',
		// index = the level you are at; the attempt takes you to index + 1
		levels: [
			{ chance: 0.1, stones: 50, perfect: 800, durability: 10, agris: 4 },
			{ chance: 0.09, stones: 50, perfect: 900, durability: 10, agris: 4 },
			{ chance: 0.07, stones: 50, perfect: 1150, durability: 10, agris: 5 },
			{ chance: 0.05, stones: 50, perfect: 1600, durability: 10, agris: 6 },
			{ chance: 0.04, stones: 50, perfect: 2000, durability: 10, agris: 7 },
			{ chance: 0.025, stones: 50, perfect: 3200, durability: 10, agris: 10 },
			{ chance: 0.015, stones: 50, perfect: 5350, durability: 10, agris: 15 },
			{ chance: 0.01, stones: 50, perfect: 8000, durability: 10, agris: 18 },
			{ chance: 0.008, stones: 50, perfect: 10000, durability: 10, agris: 20 },
			{ chance: 0.005, stones: 50, perfect: 16000, durability: 10, agris: 25 },
		]
	},
	'toro': {
		label: 'Carrack Toro / Panokseon Haemo (green)',
		material: 'Tidal Black Stone',
		// index = the level you are at; the attempt takes you to index + 1
		levels: [
			{ chance: 0.7, stones: 20, perfect: 40, durability: 10, agris: 3 },
			{ chance: 0.6, stones: 20, perfect: 60, durability: 10, agris: 3 },
			{ chance: 0.5, stones: 20, perfect: 60, durability: 10, agris: 3 },
			{ chance: 0.45, stones: 20, perfect: 80, durability: 10, agris: 3 },
			{ chance: 0.4, stones: 20, perfect: 80, durability: 10, agris: 3 },
			{ chance: 0.3, stones: 30, perfect: 150, durability: 10, agris: 4 },
			{ chance: 0.25, stones: 30, perfect: 180, durability: 10, agris: 4 },
			{ chance: 0.2, stones: 30, perfect: 210, durability: 10, agris: 4 },
			{ chance: 0.15, stones: 30, perfect: 300, durability: 10, agris: 4 },
			{ chance: 0.12, stones: 30, perfect: 390, durability: 10, agris: 5 },
		]
	},
	'epheria': {
		label: 'Epheria (old) gear',
		material: 'Tidal Black Stone',
		// index = the level you are at; the attempt takes you to index + 1
		levels: [
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
			{ chance: 1, stones: 1, perfect: null, durability: 0 },
		]
	},
	'yellow': {
		label: 'Falasi / Cheongun yellow',
		material: 'Sunset Tidal Black Stone',
		// The rule that makes this tier different: a failure takes a
		// level as well as durability, which no tier below it does.
		// Cron Stones buy that protection back, at the price in `cron`.
		keepsLevel: false,
		// `chance` is the rate the game quotes at `stack` failstacks,
		// which is the number a player actually enhances at; `base` is
		// the same attempt at zero stacks.
		// index = the level you are at; the attempt takes you to index + 1
		levels: [
			{ chance: 0.24, base: 0.03, stack: 70, stones: 1, perfect: null, durability: 10, agris: 8, cron: 0 },
			{ chance: 0.22, base: 0.02, stack: 100, stones: 1, perfect: null, durability: 10, agris: 9, cron: 290 },
			{ chance: 0.2025, base: 0.015, stack: 125, stones: 1, perfect: null, durability: 10, agris: 9, cron: 360 },
			{ chance: 0.175, base: 0.0125, stack: 130, stones: 1, perfect: null, durability: 10, agris: 11, cron: 380 },
			{ chance: 0.155, base: 0.01, stack: 145, stones: 1, perfect: null, durability: 10, agris: 12, cron: 400 },
			{ chance: 0.136, base: 0.0085, stack: 150, stones: 1, perfect: null, durability: 10, agris: 14, cron: 420 },
			{ chance: 0.1155, base: 0.007, stack: 155, stones: 1, perfect: null, durability: 10, agris: 17, cron: 440 },
			{ chance: 0.0963, base: 0.0055, stack: 165, stones: 1, perfect: null, durability: 10, agris: 20, cron: 460 },
			{ chance: 0.078, base: 0.004, stack: 185, stones: 1, perfect: null, durability: 10, agris: 25, cron: 480 },
			{ chance: 0.0625, base: 0.0025, stack: 240, stones: 1, perfect: null, durability: 10, agris: 30, cron: 540 },
		]
	},
};

/** Which table each part follows. */
export const families = {
	"Epheria Carrack: Advance (Falasi's Cannon)": 'yellow',
	"Epheria Carrack: Advance (Falasi's Figurehead)": 'yellow',
	"Epheria Carrack: Advance (Falasi's Plating)": 'yellow',
	"Epheria Carrack: Advance (Falasi's Sail)": 'yellow',
	"Epheria Carrack: Balance (Falasi's Cannon)": 'yellow',
	"Epheria Carrack: Balance (Falasi's Figurehead)": 'yellow',
	"Epheria Carrack: Balance (Falasi's Plating)": 'yellow',
	"Epheria Carrack: Balance (Falasi's Sail)": 'yellow',
	"Epheria Carrack: Volante (Falasi's Cannon)": 'yellow',
	"Epheria Carrack: Volante (Falasi's Figurehead)": 'yellow',
	"Epheria Carrack: Volante (Falasi's Plating)": 'yellow',
	"Epheria Carrack: Volante (Falasi's Sail)": 'yellow',
	"Epheria Carrack: Valor (Falasi's Cannon)": 'yellow',
	"Epheria Carrack: Valor (Falasi's Figurehead)": 'yellow',
	"Epheria Carrack: Valor (Falasi's Plating)": 'yellow',
	"Epheria Carrack: Valor (Falasi's Sail)": 'yellow',
	"Panokseon: Cheongun's Enhanced Cannon": 'yellow',
	"Panokseon: Cheongun's Enhanced Figurehead": 'yellow',
	"Panokseon: Cheongun's Enhanced Plating": 'yellow',
	"Panokseon: Cheongun's Enhanced Sail": 'yellow',
	"Bartali Sailboat: Old Cannon": 'sailboat',
	"Bartali Sailboat: Old Figurehead": 'sailboat',
	"Bartali Sailboat: Old Plating": 'sailboat',
	"Bartali Sailboat: Old Wind Sail": 'sailboat',
	"Epheria Caravel: Black Dragon Figurehead": 'caravel-blue',
	"Epheria Caravel: Brass Figurehead": 'caravel-green',
	"Epheria Caravel: Enhanced Plating": 'caravel-green',
	"Epheria Caravel: Mayna Cannon": 'caravel-blue',
	"Epheria Caravel: Stratus Wind Sail": 'caravel-blue',
	"Epheria Caravel: Upgraded Plating": 'caravel-blue',
	"Epheria Caravel: Verisha Cannon": 'caravel-green',
	"Epheria Caravel: White Wind Sail": 'caravel-green',
	"Epheria Carrack: Advance (Chiro's Black Plating)": 'chiro',
	"Epheria Carrack: Advance (Chiro's Cannon)": 'chiro',
	"Epheria Carrack: Advance (Chiro's Figurehead)": 'chiro',
	"Epheria Carrack: Advance (Chiro's Sail)": 'chiro',
	"Epheria Carrack: Balance (Chiro's Black Plating)": 'chiro',
	"Epheria Carrack: Balance (Chiro's Cannon)": 'chiro',
	"Epheria Carrack: Balance (Chiro's Figurehead)": 'chiro',
	"Epheria Carrack: Balance (Chiro's Sail)": 'chiro',
	"Epheria Carrack: Toro Cannon": 'toro',
	"Epheria Carrack: Toro Figurehead": 'toro',
	"Epheria Carrack: Toro Plating": 'toro',
	"Epheria Carrack: Toro Sail": 'toro',
	"Epheria Carrack: Valor (Chiro's Black Plating)": 'chiro',
	"Epheria Carrack: Valor (Chiro's Cannon)": 'chiro',
	"Epheria Carrack: Valor (Chiro's Figurehead)": 'chiro',
	"Epheria Carrack: Valor (Chiro's Sail)": 'chiro',
	"Epheria Carrack: Volante (Chiro's Black Plating)": 'chiro',
	"Epheria Carrack: Volante (Chiro's Cannon)": 'chiro',
	"Epheria Carrack: Volante (Chiro's Figurehead)": 'chiro',
	"Epheria Carrack: Volante (Chiro's Sail)": 'chiro',
	"Epheria Galleass: Black Dragon Figurehead": 'caravel-blue',
	"Epheria Galleass: Enhanced Plating": 'caravel-green',
	"Epheria Galleass: Mayna Cannon": 'caravel-blue',
	"Epheria Galleass: Stratus Wind Sail": 'caravel-blue',
	"Epheria Galleass: Upgraded Plating": 'caravel-blue',
	"Epheria Galleass: Verisha Cannon": 'caravel-green',
	"Epheria Galleass: White Horn Figurehead": 'caravel-green',
	"Epheria Galleass: White Wind Sail": 'caravel-green',
	"Epheria: Old Cannon": 'epheria',
	"Epheria: Old Figurehead": 'epheria',
	"Epheria: Old Plating": 'epheria',
	"Epheria: Old Wind Sail": 'epheria',
	"Panokseon: Haemo's Cannon": 'toro',
	"Panokseon: Haemo's Sail": 'toro',
	"Panokseon: Haemo's Figurehead": 'toro',
	"Panokseon: Haemo's Plating": 'toro',
	"Panokseon: Byukgye's Enhanced Cannon": 'chiro',
	"Panokseon: Byukgye's Enhanced Sail": 'chiro',
	"Panokseon: Byukgye's Enhanced Figurehead": 'chiro',
	"Panokseon: Byukgye's Enhanced Plating": 'chiro',
};

/** The table for a part, or null if it cannot be enhanced. */
export function tableFor(base) {
	const id = families[base];
	return id ? tables[id] : null;
}

/**
 * The odds of one attempt at the player's own failstack.
 *
 * The yellow rows carry the rate at zero stacks and the stack the quoted
 * rate was read at, and the quoted numbers all follow the game's usual
 * line -- base plus a tenth of base per stack -- exactly, which is what
 * lets a different stack be priced rather than guessed. Rows without a
 * `base` (every tier below yellow) have one fixed rate regardless of
 * stacks, and return it unchanged.
 *
 * Capped at 90%, where the game stops an enhancement chance climbing.
 */
export function chanceAt(step, failstack = null) {
	if (!step) return 0;
	if (!step.base || failstack === null || !Number.isFinite(failstack)) return step.chance;
	return Math.min(0.9, step.base * (1 + Math.max(0, failstack) / 10));
}
