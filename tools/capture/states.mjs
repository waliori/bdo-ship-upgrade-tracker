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
	settings: {},
	// The sailor's own numbers, which live in the shell and are therefore
	// in every frame of every clip. Left unset they read "0 barters · no
	// level", which is the bar asking to be filled in -- a fair thing for
	// a new save to show and a poor thing for a picture in a README to
	// be stuck on. The count is high enough that no route is shut, so a
	// clip never explains a gate it did not mean to.
	profile: { barterCount: 4205, level: 'Master 5', sailingMastery: 750 }
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
	profile: { ...midBuild.profile, crewShip: 'Carrack (Advance)' }
};

export const emptyStart = {
	v: 2,
	stock: {},
	targets: [],
	strategy: {},
	history: [],
	settings: {}
};

/* ------------------------------------------------------------------ *
 * the barter chapters' saves
 * ------------------------------------------------------------------ */

/** Goods noted at one storage: the stock and the place it is kept, as
 *  the Inventory writes them. A trade good with no place noted is in
 *  the ship's hold, so a storage has to be said. */
const keptAt = (town, goods) => ({
	stock: goods,
	stash: Object.fromEntries(Object.keys(goods).map(k => [k, { [town]: goods[k] }]))
});

/** The sailor every barter chapter sails as: the Carrack and the count
 *  the other chapters use, a Master 5 barter level. */
const SAILOR = { barterCount: 4205, level: 'Master 5', sailingMastery: 750, crewShip: 'Carrack (Advance)' };

/**
 * A sailor a few runs in: last week's goods in the Iliya storage at
 * every level -- the stacking ones and a handful of Level 5s and a 6,
 * which take a slot each -- some plywood of their own, two vouchers,
 * and a bar part spent on an earlier board.
 */
const iliya = keptAt('Iliya Island', {
	'[Level 1] Naval Ration': 30, '[Level 1] Fertile Soil': 12, '[Level 1] Raft Toy': 8,
	'[Level 2] Pirate Ship Mast': 24, '[Level 2] Narvo Sea Cucumber': 10, '[Level 2] Balanced Stone Pagoda': 6,
	'[Level 3] Lopters Fishnet': 15, '[Level 3] Round Knife': 9, '[Level 3] Rare Herb Pile': 4,
	'[Level 4] Seashell Deco': 12, '[Level 4] Panacea': 6, '[Level 4] Solidified Lava': 5,
	'[Level 5] Stuffed Morpho Butterfly': 3, '[Level 5] Azure Quartz': 2,
	'[Level 6] Valencian Desert Fine Sword': 1,
	'Pine Plywood': 200
});
export const barterHand = {
	...fittedShip,
	stock: { ...fittedShip.stock, ...iliya.stock },
	profile: { ...SAILOR, stash: iliya.stash, vouchers: 2, parleyHeld: 742300 }
};

/**
 * A thin storage, for a stock day: a few of each level, so the targets
 * leave every level short and the run has something to fill.
 */
const thin = keptAt('Iliya Island', {
	'[Level 1] Naval Ration': 6, '[Level 1] Raft Toy': 4,
	'[Level 2] Pirate Ship Mast': 5, '[Level 2] Balanced Stone Pagoda': 3,
	'[Level 3] Rare Herb Pile': 4, '[Level 3] Round Knife': 2,
	'[Level 4] Seashell Deco': 3
});
export const barterThin = {
	...fittedShip,
	stock: { ...fittedShip.stock, ...thin.stock },
	profile: { ...SAILOR, stash: thin.stash }
};

/**
 * Short of Crow Coins: a purse of 2,000 against builds that want ten
 * times that, and a few Level 4s at Iliya to cash.
 */
const fours = keptAt('Iliya Island', {
	'[Level 4] Seashell Deco': 8, '[Level 4] Panacea': 4, '[Level 4] Solidified Lava': 6, '[Level 4] Boatman\'s Manual': 3,
	'[Level 3] Rare Herb Pile': 6, '[Level 3] Round Knife': 5
});
export const barterCoins = {
	...fittedShip,
	stock: { ...fittedShip.stock, ...fours.stock, 'Crow Coin': 2000 },
	profile: { ...SAILOR, stash: fours.stash }
};

/**
 * A Caravel sailor, two parts short of the materials the ship material
 * list pays: Pure Pearl Crystal for the plating, Bright Reef Piece for
 * the cannon, the seals that make the Cox Pirates' Artifacts for both
 * -- with Level 3 and 4 goods at Port Epheria to hand over for them.
 */
const epheria = keptAt('Port Epheria', {
	'[Level 3] Torn Pirate Treasure Map': 6, '[Level 3] Skull Decorated Teacup': 5, '[Level 3] Weasel Leather Coat': 4,
	'[Level 3] Ancient Orders': 5, '[Level 3] Old Hourglass': 4, '[Level 3] Round Knife': 3,
	'[Level 4] Panacea': 4, '[Level 4] Marine Knights\' Spear': 2
});
export const barterCaravel = {
	v: 2,
	stock: {
		...epheria.stock,
		'+10 Epheria Caravel: Enhanced Plating': 1,
		'+10 Epheria Caravel: Verisha Cannon': 1,
		'Moon Scale Plywood': 120,
		'Pure Pearl Crystal': 8,
		'Bright Reef Piece': 30,
		'Crow Coin': 9000,
		Silver: 300000000
	},
	targets: [T('a', 'Epheria Caravel: Upgraded Plating'), T('b', 'Epheria Caravel: Mayna Cannon')],
	strategy: {},
	history: [],
	settings: {},
	profile: { ...SAILOR, barterCount: 4334, crewShip: 'Epheria Caravel', stash: epheria.stash }
};
