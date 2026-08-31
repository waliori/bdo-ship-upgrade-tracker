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
