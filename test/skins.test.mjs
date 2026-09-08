// The appearance sets: a look that is also four stats.

import test from 'node:test';
import assert from 'node:assert/strict';
import { shipSkins, skinFor, skinStats, skinComplete, SKIN_SLOTS } from '../js/ship_skins.js';
import { shipStats } from '../js/ship_stats.js';

test('both sets are the numbers the codex prints, per slot', () => {
	// Read off the BDOCodex item pages on 2026-09-01: Benelois
	// 336016-336019, the Carrack overlays 602210-602213. The four
	// overlays differ only in appearance, which is why they are one
	// entry with variants.
	const carrack = skinStats('Carrack (Valor)', { figurehead: 1, plating: 1, cannon: 1, sail: 1 });
	assert.equal(carrack.speed, 3);
	assert.equal(carrack.turn, 5);
	assert.equal(carrack.weight, 600);
	assert.equal(carrack.durability, 100000);

	const epheria = skinStats('Epheria Sailboat', { figurehead: 1, plating: 1, cannon: 1, sail: 1 });
	assert.equal(epheria.speed, 1);
	assert.equal(epheria.turn, 2);
	assert.equal(epheria.weight, 100);
	assert.equal(epheria.durability, 1000);
});

test('every hull that can wear a set is a hull the app knows', () => {
	for (const [name, skin] of Object.entries(shipSkins)) {
		assert.ok(skin.ships.length, `${name} fits nothing`);
		for (const ship of skin.ships) {
			assert.ok(shipStats[ship], `${name} claims to fit ${ship}, which is not a hull here`);
		}
		for (const slot of SKIN_SLOTS) {
			assert.ok(skin.parts[slot], `${name} has no ${slot}`);
			assert.ok(Object.keys(skin.parts[slot].stats).length, `${name}'s ${slot} does nothing`);
		}
	}
});

test('no hull can wear two sets, and the Panokseon wears none', () => {
	// Benelois covers the Bartali/Epheria line and the overlays the four
	// Carracks; nothing is in both lists, so skinFor is unambiguous.
	const seen = new Set();
	for (const skin of Object.values(shipSkins)) {
		for (const ship of skin.ships) {
			assert.ok(!seen.has(ship), `${ship} is in two sets`);
			seen.add(ship);
		}
	}
	assert.equal(skinFor('Panokseon'), null, 'the Panokseon has no appearance set in the game');
	assert.equal(skinFor('Rowboat'), null);
	assert.equal(skinFor('Carrack (Valor)').name, 'Oquilla Carrack Overlay');
	assert.equal(skinFor('Epheria Caravel').name, 'Benelois Ship Parts');
});

test('a set worn a piece at a time counts only the pieces', () => {
	// It is bought whole but the slots are separate items, so someone
	// part-way through must not be given the whole set's numbers.
	const some = skinStats('Carrack (Valor)', { figurehead: 1, sail: 1 });
	assert.equal(some.speed, 3);
	assert.equal(some.turn, 5);
	assert.equal(some.weight, 0, 'a plating nobody has is adding weight');
	assert.equal(some.durability, 0);
	assert.equal(skinComplete('Carrack (Valor)', { figurehead: 1, sail: 1 }), false);
	assert.equal(skinComplete('Carrack (Valor)', { figurehead: 1, plating: 1, cannon: 1, sail: 1 }), true);
	// And a hull with no set is all zeroes rather than an error.
	assert.deepEqual(skinStats('Panokseon', { figurehead: 1 }),
		{ speed: 0, accel: 0, turn: 0, brake: 0, weight: 0, durability: 0 });
});
