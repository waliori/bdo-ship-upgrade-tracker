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

export const emptyStart = {
	v: 2,
	stock: {},
	targets: [],
	strategy: {},
	history: [],
	settings: {}
};
