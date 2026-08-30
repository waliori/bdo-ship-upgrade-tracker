// What the sea hands out for free, quest by quest.
//
// A shopping list that ignores quest rewards overstates the grind:
// Ravinia's Ship Upgrade Log alone is fifty of each Upgrade material
// and twenty Tidal Black Stones, once per family, and the Old Moon
// Guild's dailies pay in Crow Coins and stones every day a sea monster
// dies. These are the ones whose rewards are ship materials, read off
// BDOCodex on 2026-08-29 (the Ravinia logs and Khan's weekly by their
// quest pages; the Oquilla's Eye dailies from the community guides,
// which the codex pages did not render).
//
// Each entry names what completing it puts in your bags. The Quests
// screen groups them by how often they can be done, and records a
// reward with one press, so a claimed letter lands in stock like a
// craft does.

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
		name: "[Daily] Old Moon Guild's Young Sea Monster Hunter",
		where: "Ravikel, Oquilla's Eye — any five young sea monsters",
		repeat: 'daily',
		rewards: { 'Tear of the Ocean': 1, 'Moon Vein Flax Fabric': 3, 'Moon Scale Plywood': 10, 'Oquilla Coin': 1 }
	},
	{
		id: 'omg-nineshark',
		name: "[Daily] Old Moon Guild's Nineshark Hunter",
		where: "Ravikel, Oquilla's Eye — one Nineshark",
		repeat: 'daily',
		rewards: { 'Crow Coin': 100, 'Tidal Black Stone': 14, 'Oquilla Coin': 1 }
	},
	{
		id: 'omg-blackrust',
		name: "[Daily] Old Moon Guild's Black Rust Hunter",
		where: "Ravikel, Oquilla's Eye — one Black Rust",
		repeat: 'daily',
		rewards: { 'Crow Coin': 100, 'Tidal Black Stone': 14, 'Oquilla Coin': 1 }
	},
	{
		id: 'omg-candidum',
		name: "[Daily] Old Moon Guild's Candidum Hunter",
		where: "Ravikel, Oquilla's Eye — one Candidum",
		repeat: 'daily',
		rewards: { 'Crow Coin': 100, 'Tidal Black Stone': 14, 'Oquilla Coin': 1 }
	},
	{
		id: 'omg-w-blackrust',
		name: "[Weekly] Old Moon Guild's Black Rust Hunter",
		where: "Ravikel, Oquilla's Eye — three Black Rust",
		repeat: 'weekly',
		rewards: { "Cox Pirates' Artifact (Combat)": 6 },
		choice: [{ 'Crow Coin': 500 }, { 'Tidal Black Stone': 60 }]
	},
	{
		id: 'omg-w-candidum',
		name: "[Weekly] Old Moon Guild's Candidum Hunter",
		where: "Ravikel, Oquilla's Eye — three Candidum",
		repeat: 'weekly',
		rewards: { 'Ruddy Manganese Nodule': 4 },
		choice: [{ 'Crow Coin': 500 }, { 'Tidal Black Stone': 60 }]
	},
	{
		id: 'omg-w-nineshark',
		name: "[Weekly] Old Moon Guild's Nineshark Hunter",
		where: "Ravikel, Oquilla's Eye — three Nineshark",
		repeat: 'weekly',
		rewards: { 'Tear of the Ocean': 2 },
		choice: [{ 'Crow Coin': 500 }, { 'Tidal Black Stone': 60 }]
	},
	{
		id: 'khan',
		name: "[Weekly] Old Moon Guild's Request: Uncover Oquilla's Eye's Secret",
		where: 'Elro, the guild wharf manager — a guild quest to defeat Khan',
		repeat: 'weekly, resets Thursday',
		rewards: { 'Crow Coin': 300 }
	},
	{
		id: 'otters',
		name: '[Weekly] For the Young Otter Merchants',
		where: "Kario, Oquilla's Eye — hand in 50 Coral Piece and 5 Iridescent Coral Piece",
		repeat: 'weekly',
		rewards: { 'Seaweed Stalk': 45, 'Ruddy Manganese Nodule': 15, 'Oquilla Coin': 15 }
	},
	{
		id: 'hekaru',
		name: '[Daily] Do You Have What it Takes?',
		where: "the soldier at Oquilla's Eye — one Hekaru",
		repeat: 'daily',
		rewards: { "Cox Pirates' Artifact (Combat)": 3 }
	},
	{
		id: 'winwin',
		name: '[Daily] Win-win Situation',
		where: "the soldier at Oquilla's Eye — one Ocean Stalker",
		repeat: 'daily',
		rewards: { 'Deep Tide-Dyed Standardized Timber Square': 4, 'Oquilla Coin': 1 }
	},
	{
		id: 'supplies-oquilla',
		name: "[Daily] Supplies Delivery (Oquilla's Eye)",
		where: 'Dario, Iliya Island',
		repeat: 'daily',
		rewards: { 'Crow Coin': 40, 'Deep Tide-Dyed Standardized Timber Square': 2 }
	},
	{
		id: 'supplies-iliya',
		name: '[Daily] Supplies Delivery (Iliya Island)',
		where: 'Croix, Velia',
		repeat: 'daily',
		rewards: { 'Crow Coin': 30, 'Seaweed Stalk': 1 }
	},
	{
		id: 'hampering',
		name: '[Daily] Hampering Monsters in the Sea',
		where: 'Lekrashan — twenty Black Rust or Nineshark',
		repeat: 'daily',
		rewards: { 'Crow Coin': 200 }
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
