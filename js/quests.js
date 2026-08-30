// What the sea hands out for free, quest by quest.
//
// A shopping list that ignores quest rewards overstates the grind:
// Ravinia's Ship Upgrade Log alone is fifty of each Upgrade material
// and twenty Tidal Black Stones, once per family, and the Old Moon
// Guild's dailies pay in Crow Coins and stones every day a sea monster
// dies. These are the ones whose rewards are ship materials or the
// coins that buy them, read off BDOCodex's quest list on 2026-08-30
// (query.php?a=quests carries every reward with its quantity; which of
// them is a pick-one comes from the community sailing sheet, where a
// starred reward is a choice). The ones that pay only in sailing
// experience, textbooks or Origin of Wind are left out.
//
// Each entry names what completing it puts in your bags; `choice` is
// the set you pick one from; `monster` names the species in
// sea_monsters.js whose grounds the Map can show for it (a young-one
// quest points at whichever young species has grounds nearest the
// quest giver). The Quests screen groups them by how often
// they can be done, and records a reward with one press, so a claimed
// letter lands in stock like a craft does.

export const quests = [
	{
		id: 'ravinia-1',
		name: "Ravinia's Ship Upgrade Log I — Wiggly-Waggly Letter",
		where: "Ravinia, Crow's Nest; then Carpuro at Oquilla's Eye",
		repeat: 'once per family',
		note: 'One log a day; the letter carries the materials. Do not abandon a letter — it cannot be taken again.',
		rewards: { 'Tidal Black Stone': 10, 'Graphite Ingot for Upgrade': 25, 'Timber for Upgrade': 25, 'Adhesive for Upgrade': 25 }
	},
	{
		id: 'ravinia-3',
		name: "Ravinia's Ship Upgrade Log III — Lovey-Dovey Letter",
		where: "Curio, Oquilla's Eye",
		repeat: 'once per family',
		rewards: { 'Chowder': 10, 'Elixir of Regeneration': 1 }
	},
	{
		id: 'ravinia-4',
		name: "Ravinia's Ship Upgrade Log IV — Wiggly-Waggly Letter",
		where: 'Wale, Wale Farm near Olvia',
		repeat: 'once per family',
		rewards: { 'Tidal Black Stone': 10, 'Graphite Ingot for Upgrade': 25, 'Timber for Upgrade': 25, 'Adhesive for Upgrade': 25 }
	},
	{
		id: 'ravinia-6',
		name: "Ravinia's Ship Upgrade Log VI — Lovey-Dovey Letter",
		where: 'Chief Diega, Iliya Island',
		repeat: 'once per family',
		rewards: { 'Chowder': 10, 'Elixir of Regeneration': 1 }
	},
	{
		id: 'ravinia-7',
		name: "Ravinia's Ship Upgrade Log VII — Sparkly-Shiny Letter",
		where: 'Dichzy Borne, Lema Island',
		repeat: 'once per family',
		note: 'Logs II and V pay in sailing experience only, so they are not listed.',
		rewards: { 'Crow Coin': 1000 }
	},
	{
		id: 'omg-young',
		monster: 'young-nineshark',
		name: "[Daily] Old Moon Guild's Young Sea Monster Hunter",
		where: "Ravikel, Oquilla's Eye — any five young sea monsters",
		repeat: 'daily',
		note: 'Either this or one of the three single-monster hunts below, not both, per day.',
		rewards: { 'Oquilla Coin': 3, 'Tear of the Ocean': 1, 'Moon Scale Plywood': 10, 'Moon Vein Flax Fabric': 3 }
	},
	{
		id: 'omg-candidum',
		monster: 'candidum',
		name: "[Daily] Old Moon Guild's Candidum Hunter",
		where: "Ravikel, Oquilla's Eye — one Candidum",
		repeat: 'daily',
		rewards: { 'Crow Coin': 100, 'Oquilla Coin': 1 },
		choice: [{ 'Tidal Black Stone': 14 }, { 'Violent Wave Plywood': 1 }]
	},
	{
		id: 'omg-nineshark',
		monster: 'nineshark',
		name: "[Daily] Old Moon Guild's Nineshark Hunter",
		where: "Ravikel, Oquilla's Eye — one Nineshark",
		repeat: 'daily',
		rewards: { 'Crow Coin': 100, 'Oquilla Coin': 1 },
		choice: [{ 'Tidal Black Stone': 14 }, { 'Delicately Polished Support': 1 }]
	},
	{
		id: 'omg-blackrust',
		monster: 'black-rust',
		name: "[Daily] Old Moon Guild's Black Rust Hunter",
		where: "Ravikel, Oquilla's Eye — one Black Rust",
		repeat: 'daily',
		rewards: { 'Crow Coin': 100, 'Oquilla Coin': 1 },
		choice: [{ 'Tidal Black Stone': 14 }, { 'Wave Residue Adhesive': 1 }]
	},
	{
		id: 'omg-w-candidum',
		monster: 'candidum',
		name: "[Weekly] Old Moon Guild's Candidum Hunter",
		where: "Ravikel, Oquilla's Eye — one Candidum",
		repeat: 'weekly',
		rewards: { 'Crow Coin': 500 },
		choice: [{ 'Tidal Black Stone': 60 }, { 'Ruddy Manganese Nodule': 4 }, { 'Violent Wave Plywood': 1 }]
	},
	{
		id: 'omg-w-nineshark',
		monster: 'nineshark',
		name: "[Weekly] Old Moon Guild's Nineshark Hunter",
		where: "Ravikel, Oquilla's Eye — one Nineshark",
		repeat: 'weekly',
		rewards: { 'Crow Coin': 500 },
		choice: [{ 'Tidal Black Stone': 60 }, { 'Tear of the Ocean': 2 }, { 'Delicately Polished Support': 1 }]
	},
	{
		id: 'omg-w-blackrust',
		monster: 'black-rust',
		name: "[Weekly] Old Moon Guild's Black Rust Hunter",
		where: "Ravikel, Oquilla's Eye — one Black Rust",
		repeat: 'weekly',
		rewards: { 'Crow Coin': 500 },
		choice: [{ 'Tidal Black Stone': 60 }, { "Cox Pirates' Artifact (Combat)": 6 }, { 'Wave Residue Adhesive': 1 }]
	},
	{
		id: 'charity',
		monster: 'young-hekaru',
		name: '[Daily] Our Guild is Not a Charity Group',
		where: "the soldier at Oquilla's Eye — two young sea monsters",
		repeat: 'daily',
		rewards: { 'Oquilla Coin': 1 },
		choice: [{ 'Tide-Dyed Standardized Timber Square': 5 }, { 'Violent Wave Plywood': 1 }]
	},
	{
		id: 'hekaru',
		monster: 'hekaru',
		name: '[Daily] Do You Have What it Takes?',
		where: "the soldier at Oquilla's Eye — one Hekaru",
		repeat: 'daily',
		rewards: { 'Oquilla Coin': 1 },
		choice: [{ "Cox Pirates' Artifact (Combat)": 3 }, { 'Delicately Polished Support': 1 }]
	},
	{
		id: 'winwin',
		monster: 'ocean-stalker',
		name: '[Daily] Win-win Situation',
		where: "the soldier at Oquilla's Eye — one Ocean Stalker",
		repeat: 'daily',
		rewards: { 'Oquilla Coin': 1 },
		choice: [{ 'Deep Tide-Dyed Standardized Timber Square': 4 }, { 'Wave Residue Adhesive': 1 }]
	},
	{
		id: 'increase',
		monster: 'young-ocean-stalker',
		name: '[Weekly] Monster Increase Report',
		where: "the soldier at Oquilla's Eye — twenty young sea monsters",
		repeat: 'weekly',
		rewards: { "Cox Pirates' Artifact (Combat)": 2 }
	},
	{
		id: 'swordfish',
		name: '[Weekly] So You Wanna Live in Oquilla?',
		where: "Kario, Oquilla's Eye — hand in one Yellow Swordfish",
		repeat: 'weekly',
		rewards: { 'Oquilla Coin': 10 }
	},
	{
		id: 'otters',
		name: '[Weekly] For the Young Otter Merchants',
		where: "Kario, Oquilla's Eye — hand in 5 Iridescent Coral Piece and 50 Coral Piece",
		repeat: 'weekly',
		rewards: { 'Oquilla Coin': 15, 'Seaweed Stalk': 45, 'Ruddy Manganese Nodule': 15 }
	},
	{
		id: 'margoria',
		monster: 'nineshark',
		name: "[Weekly] Old Moon Guild's Request: Defeat Margoria Sea Monsters",
		where: 'Elro, the guild wharf manager — five Nineshark, Candidum or Black Rust',
		repeat: 'weekly, resets Thursday',
		note: 'A guild quest; the [Guild] drenched materials it also pays go to the guild, not to you.',
		rewards: { 'Crow Coin': 200 }
	},
	{
		id: 'khan',
		monster: 'khan',
		name: "[Weekly] Old Moon Guild's Request: Uncover Oquilla's Eye's Secret",
		where: 'Elro, the guild wharf manager — defeat Khan, at any difficulty',
		repeat: 'weekly, resets Thursday',
		note: 'A guild quest; the [Guild] drenched materials it also pays go to the guild, not to you.',
		rewards: { 'Crow Coin': 300 }
	},
	{
		id: 'hampering',
		monster: 'black-rust',
		name: '[Daily] Hampering Monsters in the Sea',
		where: "Haeran, Oquilla's Eye — two Black Rust or two Nineshark (Chasing Dark High Seas)",
		repeat: 'daily',
		rewards: { 'Crow Coin': 200 },
		choice: [{ 'Oquilla Emerald Fresh Water': 1 }, { 'Oquilla Aquamarine Fresh Water': 1 }, { 'Oquilla Golden Fresh Water': 1 }]
	},
	{
		id: 'darkseas',
		monster: 'black-rust',
		name: '[Weekly] They Came from Dark High Seas',
		where: "Haeran, Oquilla's Eye — four Black Rust (Chasing Dark High Seas)",
		repeat: 'weekly',
		rewards: { 'Crow Coin': 500 },
		choice: [{ 'Oquilla Emerald Fresh Water': 3 }, { 'Oquilla Aquamarine Fresh Water': 3 }, { 'Oquilla Golden Fresh Water': 3 }]
	},
	{
		id: 'crocodile',
		monster: 'saltwater-crocodile',
		name: '[Weekly] Ferocious Saltwater Crocodile',
		where: "Bave Ricksa, Oquilla's Eye — four Saltwater Crocodile",
		repeat: 'weekly',
		rewards: {},
		choice: [{ "Saltwater Crocodile's Scale": 5 }, { "Violent Sea Monster's Scale": 5 }]
	},
	{
		id: 'hungry',
		monster: 'hekaru',
		name: '[Daily] Wanted: Hungry Sea Creatures',
		where: 'Proix, Velia — three Hungry Hekaru',
		repeat: 'daily',
		rewards: { 'Crow Coin': 50 }
	},
	{
		id: 'coxscouts',
		monster: 'cox-pirates',
		name: '[Daily] Wanted: Cox Scouts in Disguise',
		where: 'Proix, Velia — twenty Cox Pirates infiltrating the islands',
		repeat: 'daily',
		rewards: { 'Crow Coin': 50 }
	},
	{
		id: 'recover',
		name: '[Weekly] How to Recover Sailors',
		where: 'Proix, Velia — hand in 20 Chowder',
		repeat: 'weekly',
		note: 'Also pays 10 Special Balenos Meal, which the tracker does not hold.',
		rewards: { 'Crow Coin': 200 }
	},
	{
		id: 'goods-baremi',
		name: '[Daily] Delivering Goods: Baremi Island',
		where: 'Miya, Velia — deliver Barter Trade Goods (1) to Serapu on Baremi',
		repeat: 'daily',
		rewards: { 'Crow Coin': 20 }
	},
	{
		id: 'goods-narvo',
		name: '[Daily] Delivering Goods: Narvo Island',
		where: 'Miya, Velia — deliver Barter Trade Goods (1) to Akenisi on Narvo',
		repeat: 'daily',
		rewards: { 'Crow Coin': 20 }
	},
	{
		id: 'goods-tinberra',
		name: '[Daily] Delivering Goods: Tinberra Island',
		where: 'Miya, Velia — deliver Barter Trade Goods (1) to Mulicia on Tinberra',
		repeat: 'daily',
		rewards: { 'Crow Coin': 20 }
	},
	{
		id: 'supplies-iliya',
		name: '[Daily] Supplies Delivery (Iliya Island)',
		where: "Croix, Velia — deliver Croix's supplies to Dario on Iliya",
		repeat: 'daily',
		rewards: { 'Crow Coin': 50, "Cox Pirates' Artifact (Parley Beginner)": 1 }
	},
	{
		id: 'supplies-tinberra',
		name: '[Daily] Supplies Delivery (Tinberra Island)',
		where: 'Rovinia, Velia — deliver her supplies to Shanjo on Tinberra',
		repeat: 'daily',
		rewards: { 'Crow Coin': 100 }
	},
	{
		id: 'supplies-oquilla',
		name: "[Daily] Supplies Delivery (Oquilla's Eye)",
		where: "Dario, Iliya Island — deliver his supplies to Ravikel at Oquilla's Eye",
		repeat: 'daily',
		rewards: { 'Crow Coin': 100, "Cox Pirates' Artifact (Parley Beginner)": 2 }
	},
	{
		id: 'lively',
		name: '[Barter] [Daily] Lively Iliya Island',
		where: 'the villager on Iliya Island — barter fifteen times',
		repeat: 'daily',
		rewards: { 'Crow Coin': 50 },
		choice: [{ 'Enhanced Island Tree Coated Plywood': 10 }, { "Cox Pirates' Artifact (Parley Expert)": 1 }, { 'Pure Pearl Crystal': 2 }, { 'Deep Sea Memory Filled Glue': 8 }, { 'Bright Reef Piece': 8 }]
	},
	{
		id: 'wider',
		name: '[Barter] [Daily] Sailing to a Wider World',
		where: 'Dario, Iliya Island — barter twenty times',
		repeat: 'daily',
		note: 'Plus a pick of one Lost Trade Box or one Part for Explorer\'s Compass, neither of which the tracker holds.',
		rewards: { 'Crow Coin': 50 }
	},
	{
		id: 'nexus',
		name: '[Barter] [Weekly] Iliya Island, the Barter Nexus',
		where: 'Priko, Iliya Island — barter a hundred times',
		repeat: 'weekly',
		note: 'Also pays 3 Riddle-Me Barter Support Box, which the tracker does not hold.',
		rewards: { 'Crow Coin': 200 }
	},
	{
		id: 'worldsend-1',
		name: "[Daily] At World's End I: Ancado Inner Harbor",
		where: 'Priko, Iliya Island — deliver supplies to Samia in Ancado Inner Harbor',
		repeat: 'daily',
		note: 'Also pays a Riddle-Me Barter Support Box, which the tracker does not hold.',
		rewards: { 'Crow Coin': 50 }
	},
	{
		id: 'worldsend-2',
		name: "[Daily] At World's End II: Hakoven Island",
		where: 'Priko, Iliya Island — deliver supplies to Rosina on Hakoven Island',
		repeat: 'daily',
		note: 'Also pays a Riddle-Me Barter Support Box, which the tracker does not hold.',
		rewards: { 'Crow Coin': 100 }
	},
	{
		id: 'pirates',
		name: '[Daily] Subjugating the Pirates',
		where: 'Haim, Kuit Islands — hand over 1,000 Pirate Bandanas',
		repeat: 'daily',
		rewards: { 'Crow Coin': 300 }
	},
	{
		id: 'lyngbakr',
		name: '[Weekly] Lyngbakr Ecology Survey',
		where: 'Gangman, Cheongsa Island wharf — two Lyngbakr',
		repeat: 'weekly',
		note: 'Also pays 6 Red Sea Monster Meat and 3 Ocean Essence, which the tracker does not hold.',
		rewards: { 'Crow Coin': 500 }
	}
];

export const questById = Object.fromEntries(quests.map(q => [q.id, q]));

/** How often a quest can be done: 'daily', 'weekly' or 'once'. */
export function cadenceOf(q) {
	return q.repeat.startsWith('daily') ? 'daily' : q.repeat.startsWith('weekly') ? 'weekly' : 'once';
}

/** The quests whose rewards touch anything in `wanted` (a shortfall map). */
export function questsFor(wanted) {
	const keys = new Set(Object.keys(wanted || {}));
	return quests.filter(q => Object.keys(q.rewards).some(k => keys.has(k))
		|| (q.choice || []).some(c => Object.keys(c).some(k => keys.has(k))));
}
