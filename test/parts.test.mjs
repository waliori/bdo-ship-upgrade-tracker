// What the parts do for the hull: every enhanceable part has its
// eleven levels, the levels only ever climb, and a loadout picks the
// best of what you hold for the hull it fits.

import test from 'node:test';
import assert from 'node:assert/strict';

import { partStats, statsAt, gainAt, describeStats, fitsShip, slotOf, loadout, sumStats } from '../js/part_stats.js';
import { families } from '../js/enhancement.js';

test('every enhanceable part has its eleven levels of effect', () => {
	for (const base of Object.keys(families)) {
		assert.ok(partStats[base], `${base} has no stats`);
		assert.equal(partStats[base].levels.length, 11, base);
	}
	assert.equal(Object.keys(partStats).length, Object.keys(families).length);
});

test('a level never takes away what the one below gave', () => {
	for (const [base, p] of Object.entries(partStats)) {
		for (let lv = 1; lv <= 10; lv++) {
			for (const [k, v] of Object.entries(p.levels[lv - 1])) {
				assert.ok((p.levels[lv][k] || 0) >= v, `${base} +${lv} ${k}`);
			}
		}
	}
});

test('the gain of a level is the difference, said out loud', () => {
	const g = gainAt("Panokseon: Cheongun's Enhanced Figurehead", 9);
	assert.ok(g.speed > 0 || g.accel > 0 || g.dp > 0);
	assert.match(describeStats(g), /\+/);
	assert.equal(gainAt('Not a part', 0), null);
	assert.equal(statsAt("Epheria Carrack: Advance (Falasi's Cannon)", 10).damage, 55220);
});

test('a part fits the hulls its name says', () => {
	assert.ok(fitsShip('Epheria: Old Cannon', 'Epheria Sailboat'));
	assert.ok(fitsShip('Epheria: Old Cannon', 'Improved Epheria Frigate'));
	assert.ok(!fitsShip('Epheria: Old Cannon', 'Epheria Caravel'));
	assert.ok(fitsShip('Epheria Carrack: Toro Sail', 'Carrack (Valor)'));
	assert.ok(fitsShip("Epheria Carrack: Volante (Chiro's Sail)", 'Carrack (Volante)'));
	assert.ok(!fitsShip("Epheria Carrack: Volante (Chiro's Sail)", 'Carrack (Valor)'));
	assert.ok(fitsShip("Panokseon: Byukgye's Enhanced Plating", 'Panokseon'));
	assert.equal(slotOf("Epheria Carrack: Advance (Chiro's Black Plating)"), 'plating');
	assert.equal(slotOf('Epheria Caravel: White Wind Sail'), 'sail');
});

test('a loadout takes the best of what you hold, per slot, for that hull', () => {
	const stock = {
		'+3 Epheria Carrack: Toro Cannon': 1,
		"+1 Epheria Carrack: Volante (Chiro's Cannon)": 1,
		'+10 Epheria Carrack: Toro Sail': 1,
		"Epheria Carrack: Valor (Chiro's Figurehead)": 1,
		'+7 Epheria Caravel: Brass Figurehead': 1
	};
	const fit = loadout('Carrack (Volante)', stock, families);
	const by = Object.fromEntries(fit.slots.map(s => [s.slot, s]));
	assert.equal(by.cannon.part, "Epheria Carrack: Volante (Chiro's Cannon)", 'a blue part outranks a higher green one');
	assert.equal(by.sail.part, 'Epheria Carrack: Toro Sail');
	assert.equal(by.sail.level, 10);
	assert.equal(by.figurehead.part, undefined, 'a Valor part does not fit a Volante');
	assert.equal(by.plating.part, undefined);
	assert.ok(fit.total.damage > 0);
	assert.deepEqual(sumStats({ speed: 1.5 }, { speed: 2, dp: 3 }), { speed: 3.5, dp: 3 });
});
