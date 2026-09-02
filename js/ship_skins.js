// The two appearance sets, and what they add to a hull.
//
// A skin in this game is not only a look. Both sets fill the ship's four
// appearance slots -- figurehead, plating, cannon, sail -- and each slot
// carries a real stat, so a ship wearing one is faster, holds more and
// takes more punishment than the same ship without. That is worth
// planning against, and the app was pricing hulls as though it did not
// exist.
//
// Read off the BDOCodex item pages on 2026-09-01, per-slot, and checked
// against the community write-ups:
//
//   Benelois Ship Parts      336016-336019  (the set box is 336020)
//   Oquilla Carrack Overlay  602210-602213  (Advance/Balance/Volante/Valor)
//
// The four Oquilla overlays differ only in appearance; the stats are
// identical, which is why they are one entry with variants rather than
// four.
//
// The two sets are got in quite different ways, and it matters:
//
//   * Benelois is CRAFTED. Each part's codex page says so in as many
//     words -- "Craft at the Ship Part Workshop in Port Epheria 1-4,
//     2F." -- and each has a design behind it (designs 9031-9034), at
//     Beginner 0 skill. So it is something the app can plan for, like
//     any other part: the recipes are below.
//   * The Oquilla Carrack Overlay is Pearl Shop, 6,370 pearls. There is
//     no crafted equivalent for a Carrack.
//
// The Byukgye workshop at Nampo Moodle makes Panokseon *gear*, which is
// ship parts and already lives in part_stats.js, not an appearance set.
// The Panokseon has no appearance set at all.

export const SKIN_SLOTS = ['figurehead', 'plating', 'cannon', 'sail'];

export const shipSkins = {
	'Benelois Ship Parts': {
		source: 'Crafted',
		where: 'Ship Part Workshop, Port Epheria 1-4, 2F',
		skill: 'Beginner 0',
		codex: 336020,
		note: 'Blue and white sails. Crafted a slot at a time at Port Epheria.',
		ships: [
			'Bartali Sailboat', 'Epheria Sailboat', 'Improved Epheria Sailboat',
			'Epheria Frigate', 'Improved Epheria Frigate', 'Epheria Caravel', 'Epheria Galleass'
		],
		parts: {
			figurehead: {
				codex: 336017, name: 'Benelois Figurehead', stats: { speed: 1 },
				recipe: { 'Sturdy Elder Tree Plywood': 20, 'Pure Vanadium Crystal': 20, 'Brass Ingot': 100, 'Elder Tree Sap': 500, 'Trace of Nature': 100 }
			},
			plating: {
				codex: 336016, name: 'Benelois Plating', stats: { weight: 100 },
				recipe: { 'Sturdy Elder Tree Plywood': 100, 'Pure Vanadium Crystal': 100, 'Titanium Ingot': 100, 'Elder Tree Sap': 500, 'Black Crystal': 100, 'Trace of Nature': 100 }
			},
			cannon: {
				codex: 336018, name: 'Benelois Cannon', stats: { durability: 1000 },
				recipe: { 'Sturdy Elder Tree Plywood': 20, 'Pure Vanadium Crystal': 20, 'Brass Ingot': 100, 'Powder of Flame': 500, 'Trace of Nature': 100 }
			},
			sail: {
				codex: 336019, name: 'Benelois Sail', stats: { turn: 2 },
				recipe: { 'Sturdy Elder Tree Plywood': 10, 'Tough Flax Fabric': 200, 'Blue Coral': 10, 'White Coral': 10, 'Trace of Nature': 100 }
			}
		}
	},
	'Oquilla Carrack Overlay': {
		source: 'Pearl Shop',
		pearls: 6370,
		codex: 602210,
		note: 'One look per Carrack; the stats are the same on all four. BreezySail gets its own effect.',
		variants: [
			{ name: 'Advance', codex: 602210, ship: 'Carrack (Advance)' },
			{ name: 'Balance', codex: 602211, ship: 'Carrack (Balance)' },
			{ name: 'Volante', codex: 602212, ship: 'Carrack (Volante)' },
			{ name: 'Valor', codex: 602213, ship: 'Carrack (Valor)' }
		],
		ships: ['Carrack (Advance)', 'Carrack (Balance)', 'Carrack (Volante)', 'Carrack (Valor)'],
		parts: {
			figurehead: { codex: 602210, name: 'Carrack Overlay Figurehead', stats: { speed: 3 } },
			plating: { codex: 602210, name: 'Carrack Overlay Plating', stats: { weight: 600 } },
			cannon: { codex: 602210, name: 'Carrack Overlay Cannon', stats: { durability: 100000 } },
			sail: { codex: 602210, name: 'Carrack Overlay Sail', stats: { turn: 5 } }
		}
	}
};

/** The set a hull can wear, if there is one. The Panokseon has none. */
export function skinFor(ship) {
	for (const [name, skin] of Object.entries(shipSkins)) {
		if (skin.ships.includes(ship)) return { name, ...skin };
	}
	return null;
}

/**
 * What a set adds, summed over the slots that are on.
 *
 * `worn` is the set of slot names the player says they have; a set is
 * bought whole but the slots are separate items, and someone part-way
 * through should not be told they have all four.
 */
export function skinStats(ship, worn) {
	const skin = skinFor(ship);
	const out = { speed: 0, accel: 0, turn: 0, brake: 0, weight: 0, durability: 0 };
	if (!skin || !worn) return out;
	for (const slot of SKIN_SLOTS) {
		if (!worn[slot]) continue;
		const part = skin.parts[slot];
		if (!part) continue;
		for (const [k, v] of Object.entries(part.stats)) out[k] = (out[k] || 0) + v;
	}
	return out;
}

/** True when every slot of the set is on. */
export function skinComplete(ship, worn) {
	const skin = skinFor(ship);
	return !!skin && SKIN_SLOTS.every(s => worn && worn[s]);
}
