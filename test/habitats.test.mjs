// Spawn points into habitats: near points together, far ones apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { habitatsOf } from '../js/habitats.js';
import { monsters } from '../js/sea_monsters.js';
import { monsterArt } from '../js/monster_art.js';
import fs from 'node:fs';

test('points a few kilometres apart form one habitat, a distant cloud another', () => {
	const a = [[1000, 1000], [1500, 1200], [2200, 900], [1800, 1600]];
	const b = [[60000, 60000], [60500, 60200], [61000, 60800]];
	const h = habitatsOf([...a, ...b]);
	assert.equal(h.length, 2);
	assert.ok(h[0].n === 4 && Math.abs(h[0].x - 1625) < 1);
	assert.equal(h[1].n, 3);
	assert.deepEqual(habitatsOf([]), []);
	assert.equal(habitatsOf([[5, 5]]).length, 1, 'a boss with one spawn still has a habitat');
});

test('every species on the chart gets at least one habitat, and its picture is on disk', () => {
	for (const m of monsters) {
		if (!m.points.length) continue;
		assert.ok(habitatsOf(m.points).length >= 1, m.key);
		if (monsterArt[m.key]) assert.ok(fs.existsSync(new URL(`../icons/${monsterArt[m.key]}`, import.meta.url)), m.key);
	}
	assert.ok(monsters.some(m => m.key === 'lyngbakr'), 'the 27 August patch is on the chart');
});

test("a species with the game's own zone is marked there, the crocodile only roughly", () => {
	const nineshark = monsters.find(m => m.key === 'nineshark');
	assert.deepEqual(nineshark.zones, [[47609, 35335]], 'the Margoria ground the game marks');
	const croc = monsters.find(m => m.key === 'saltwater-crocodile');
	assert.ok(croc.zones && croc.approx, 'north of Cheongsa, approximate');
	assert.ok(monsters.find(m => m.key === 'lyngbakr').zones, 'the Lyngbakr has its marker');
	const gm = monsters.find(m => m.key === 'goldmont-medium');
	assert.ok(gm.zones[0][0] > 40000 && gm.approx, 'the Goldmont Medium patrols the open Ross Sea, not a Donghae town');
	assert.ok(croc.zones[0][1] < 18000 && Math.abs(croc.zones[0][0] - 33534) < 2000, 'the crocodiles sit north of Cheongsa');
	assert.ok(monsterArt.lyngbakr, 'and a picture');
});
