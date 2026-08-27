// The yellow tier: Falasi and Cheongun.
//
// Added in the August 2026 patch, and the first ship gear that breaks two
// rules the app had baked in everywhere: a failed attempt drops a level,
// and an attempt costs Cron Stones as well as a stone. Both are easy to
// model wrongly in a way nothing else would notice, so they are pinned
// here.
//
// The recipes were read off the workshop designs on BDOCodex
// (design/9037 for Cheongun, design/9041 and up for Falasi) rather than
// from the patch notes alone, because the notes leave the variant
// question open and the designs settle it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { recipes } from '../js/recipes.js';
import { tableFor, families } from '../js/enhancement.js';
import { expectedAttempts, unprotectedAttempts, enhanceStep } from '../js/planner.js';
import { falasi } from '../js/falasi_vendor.js';
import { ships } from '../js/ships.js';

const VARIANTS = ['Advance', 'Balance', 'Volante', 'Valor'];
const TYPES = ['Cannon', 'Sail', 'Figurehead', 'Plating'];
const CHIRO = { Cannon: 'Cannon', Sail: 'Sail', Figurehead: 'Figurehead', Plating: 'Black Plating' };

const falasiPart = (v, t) => `Epheria Carrack: ${v} (Falasi's ${t})`;
const cheongunPart = t => `Panokseon: Cheongun's Enhanced ${t}`;
const yellowParts = [
	...VARIANTS.flatMap(v => TYPES.map(t => falasiPart(v, t))),
	...TYPES.map(cheongunPart)
];

test('a Falasi part eats a +10 Chiro part of its own Carrack variant', () => {
	// The patch notes write one recipe for all four variants and leave it
	// ambiguous whether the Chiro part has to match. The workshop design
	// says it does -- an Advance part takes an Advance part and an Advance
	// permit -- and getting this wrong would let the plan satisfy a Valor
	// build out of Advance stock.
	for (const v of VARIANTS) {
		for (const t of TYPES) {
			const recipe = recipes[falasiPart(v, t)];
			assert.ok(recipe, `${falasiPart(v, t)} has a recipe`);
			assert.equal(recipe[`+10 Epheria Carrack: ${v} (Chiro's ${CHIRO[t]})`], 1);
			assert.equal(recipe[`Falasi's Epheria Carrack Parts Upgrade Permit: ${v}`], 1);
			assert.equal(recipe[`Blueprint: Falasi's ${t}`], 10);
		}
	}
});

test('every yellow part is built from the same three new materials', () => {
	for (const part of yellowParts) {
		const recipe = recipes[part];
		assert.equal(recipe['Sturdy Coral Support'], 125, part);
		assert.equal(recipe['Raging Wave Plywood'], 75, part);
		assert.equal(recipe['Dormant Crimson Coral Adhesive'], 50, part);
	}
});

test('each new material rests on one Lyngbakr drop', () => {
	assert.deepEqual(recipes['Sturdy Coral Support'],
		{ "Lyngbakr's Bone": 1, 'Starlight Hardener': 1, 'Starlight Emulsifier': 1 });
	assert.deepEqual(recipes['Raging Wave Plywood'],
		{ "Lyngbakr's Scale": 1, 'Starlight Hardener': 1, 'Starlight Emulsifier': 1 });
	assert.deepEqual(recipes['Dormant Crimson Coral Adhesive'],
		{ "Lyngbakr's Fluid": 1, 'Starlight Hardener': 1, 'Starlight Emulsifier': 1 });
});

test('a Sunset Tidal Black Stone is a hundred ordinary ones', () => {
	assert.deepEqual(recipes['Sunset Tidal Black Stone'],
		{ 'Sunset Coral Essence': 1, 'Tidal Black Stone': 100 });
});

test('a yellow attempt spends Cron Stones from +2 upwards, and none at +1', () => {
	for (const part of yellowParts) {
		const first = enhanceStep(part, 1);
		assert.equal(first.stones['Sunset Tidal Black Stone'], 1, part);
		assert.equal(first.stones['Cron Stone'], undefined, `${part} +1 needs no Cron`);

		for (let level = 2; level <= 10; level++) {
			const step = enhanceStep(part, level);
			assert.equal(step.stones['Sunset Tidal Black Stone'], 1, `${part} +${level}`);
			assert.ok(step.stones['Cron Stone'] > 0, `${part} +${level} costs Cron`);
		}
	}
	// The prices are the game's, and they climb.
	assert.equal(enhanceStep(falasiPart('Advance', 'Cannon'), 2).stones['Cron Stone'], 290);
	assert.equal(enhanceStep(falasiPart('Advance', 'Cannon'), 10).stones['Cron Stone'], 540);
});

test('every yellow part follows the yellow table, and nothing else does', () => {
	for (const part of yellowParts) {
		assert.equal(families[part], 'yellow', part);
		assert.equal(tableFor(part).keepsLevel, false, part);
		assert.equal(tableFor(part).material, 'Sunset Tidal Black Stone', part);
	}
	const chiro = "Epheria Carrack: Advance (Chiro's Sail)";
	assert.notEqual(families[chiro], 'yellow');
	assert.notEqual(tableFor(chiro).keepsLevel, false);
});

test('going without Cron Stones is not a plan', () => {
	// Each failure drops a level that has to be re-climbed, so the cost
	// compounds. The whole point of the Cron price is that this number is
	// unreachable -- if a refactor ever makes the two comparable, the
	// fall-back model has quietly stopped being applied.
	const part = falasiPart('Advance', 'Cannon');
	let protectedStones = 0;
	for (let level = 0; level < 10; level++) protectedStones += expectedAttempts(part, level);

	const exposed = unprotectedAttempts(part, 10);
	assert.ok(exposed > protectedStones * 1000,
		`unprotected ${Math.round(exposed)} should dwarf protected ${Math.round(protectedStones)}`);
});

test('gear that holds its level has no fall-back cost to report', () => {
	assert.equal(unprotectedAttempts("Epheria Carrack: Advance (Chiro's Sail)"), null);
	assert.equal(unprotectedAttempts('not a ship part at all'), null);
});

test('the permits are the five-billion-silver ones', () => {
	for (const v of VARIANTS) {
		assert.equal(falasi[`Falasi's Epheria Carrack Parts Upgrade Permit: ${v}`], 5_000_000_000);
	}
	assert.equal(falasi["Cheongun's Panokseon Parts Upgrade Permit"], 5_000_000_000);
});

test('the new parts can be queued as builds', () => {
	for (const part of yellowParts) assert.ok(ships.includes(part), `${part} is queueable`);
});

test('every yellow part has its ten enhancement levels', () => {
	for (const part of yellowParts) {
		for (let level = 1; level <= 10; level++) {
			const below = level === 1 ? part : `+${level - 1} ${part}`;
			assert.equal(recipes[`+${level} ${part}`][below], 1, `+${level} ${part}`);
		}
		assert.equal(recipes[`+11 ${part}`], undefined, 'and stops at ten');
	}
});
