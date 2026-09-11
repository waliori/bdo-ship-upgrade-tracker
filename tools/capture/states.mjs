// Seed states for the README captures. Each is a full v2 store payload,
// chosen so the screen shows something a real player would recognise:
// part-built, some things covered, some missing.

const T = (id, item, qty = 1) => ({ id, item, qty, active: true });

export const midBuild = {
	v: 2,
	stock: {
		'Violent Wave Plywood': 87,
		'Wave Residue Adhesive': 80,
		'Delicately Polished Support': 64,
		"Violent Sea Monster's Scale": 96,
		"Saltwater Crocodile's Scale": 61,
		"Violent Sea Monster's Ooze": 40,
		"Violent Sea Monster's Bone": 96,
		'Starlight Hardener': 140,
		'Starlight Emulsifier': 22,
		"Blueprint: Chiro's Cannon": 10,
		"Blueprint: Chiro's Sail": 6,
		'Epheria Carrack Parts Upgrade Permit: Advance': 2,
		'+10 Epheria Carrack: Toro Cannon': 1,
		'+4 Epheria Carrack: Toro Sail': 1,
		'Tidal Black Stone': 640,
		'Crow Coin': 32992,
		Silver: 420000000
	},
	targets: [
		T('a', "Epheria Carrack: Advance (Chiro's Cannon)"),
		T('b', "Epheria Carrack: Advance (Chiro's Sail)")
	],
	strategy: {},
	history: [],
	settings: {}
};

/**
 * One Carrack part to go, with a purse that nearly covers it.
 *
 * For the plan still: a single build keeps the steps to a handful, and
 * the coins are set just under what the shop wants so the card has a
 * real figure to show for what the quests bring in.
 */
export const onePartToGo = {
	...midBuild,
	stock: {
		'Crow Coin': 44852,
		Silver: 1000000000,
		'Tidal Black Stone': 2885,
		'Violent Wave Plywood': 87,
		'Wave Residue Adhesive': 80
	},
	targets: [T('a', "Epheria Carrack: Advance (Chiro's Cannon)")]
};

/** Enough on hand that the Workshop has something to make. */
export const readyToCraft = {
	...midBuild,
	stock: {
		...midBuild.stock,
		"Violent Sea Monster's Scale": 400,
		"Saltwater Crocodile's Scale": 400,
		"Violent Sea Monster's Bone": 300,
		'Starlight Hardener': 300
	}
};

/** A part levelled in game, waiting to be recorded. */
export const recordLevel = {
	...midBuild,
	stock: { ...midBuild.stock, 'Epheria Carrack: Toro Plating': 1 }
};

/**
 * A Carrack, with the parts held for it.
 *
 * The hull a save starts on is an Epheria Sailboat, which takes none of
 * the Carrack parts this inventory is full of -- so every slot card
 * reads "nothing fitted", which is a poor picture of a screen whose
 * point is that each slot takes the best you already hold.
 */
export const fittedShip = {
	...midBuild,
	profile: { crewShip: 'Carrack (Advance)' }
};

export const emptyStart = {
	v: 2,
	stock: {},
	targets: [],
	strategy: {},
	history: [],
	settings: {}
};
