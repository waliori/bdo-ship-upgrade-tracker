// What kind of thing a name is: a material, a ship part, or a sea
// trade good.
//
// The item list runs to a thousand names and three quite different
// things are in it -- the stones and planks a build eats, the parts
// and hulls it makes, and the [Level N] goods a barter run carries --
// and a list that mixes them makes "show me my trade goods" a matter
// of scrolling. This is the one place the split is decided, so the
// Inventory's chips, the Find box and the trip log agree on it.

import { recipes } from './recipes.js';
import { shipGroups } from './ships.js';
import { levelOf } from './barter.js';
import { parseEnhanced } from './planner.js';

const hulls = new Set(shipGroups.flatMap(g => g.items));

/** The kinds, in the order a chip row shows them. */
export const KINDS = [
	{ id: 'materials', label: 'Materials' },
	{ id: 'parts', label: 'Ship parts' },
	{ id: 'goods', label: 'Trade goods' }
];

/** 'goods' for a [Level N] trade good, 'parts' for a hull or an
 *  enhanceable part at any level, 'materials' for the rest. */
export function kindOf(name) {
	if (levelOf(name) !== null) return 'goods';
	const { base } = parseEnhanced(name || '');
	if (hulls.has(base) || recipes[`+1 ${base}`]) return 'parts';
	return 'materials';
}

/** The label a row can wear, or '' for the plain case. */
export function kindTag(name) {
	const k = kindOf(name);
	return k === 'goods' ? 'trade good' : k === 'parts' ? 'ship part' : '';
}
