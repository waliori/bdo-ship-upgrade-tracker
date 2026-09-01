// Spawn points into habitats: near points together, far ones apart.

import test from 'node:test';
import assert from 'node:assert/strict';
import { habitatsOf } from '../js/habitats.js';
import { monsters } from '../js/sea_monsters.js';
import { monsterArt } from '../js/monster_art.js';
import { openSea } from '../js/searoute.js';
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

test('every spawn point and every marker is on the water', () => {
	for (const m of monsters) {
		for (const [x, y] of m.points) assert.ok(openSea(x, y), `${m.key} spawn at ${x},${y} is on land`);
		for (const [x, y] of m.zones || []) assert.ok(openSea(x, y), `${m.key} zone at ${x},${y} is on land`);
		for (const h of habitatsOf(m.points, { onWater: openSea })) assert.ok(openSea(h.x, h.y), `${m.key} marker at ${h.x},${h.y} is on land`);
	}
});

test('a ground that rings an island is marked on the water beside it', () => {
	// Eight points round a "shore" at (5000, 5000); the centre is land.
	const ring = [];
	for (let a = 0; a < 360; a += 45) ring.push([Math.round(5000 + 1500 * Math.cos(a * Math.PI / 180)), Math.round(5000 + 1500 * Math.sin(a * Math.PI / 180))]);
	const onWater = (x, y) => Math.hypot(x - 5000, y - 5000) > 1000;
	const [dry] = habitatsOf(ring);
	assert.ok(!onWater(dry.x, dry.y), 'the plain centre is on the island');
	const [wet] = habitatsOf(ring, { onWater });
	assert.ok(onWater(wet.x, wet.y), 'the marker moved onto the water');
	assert.ok(ring.some(([x, y]) => x === wet.x && y === wet.y), 'to one of its own spawn points');
});

test('the species the codex has no points for are marked by hand, roughly', () => {
	const croc = monsters.find(m => m.key === 'saltwater-crocodile');
	assert.ok(croc.zones && croc.approx, 'north of Cheongsa, approximate');
	assert.ok(croc.zones[0][1] < 18000 && Math.abs(croc.zones[0][0] - 33534) < 2000, 'the crocodiles sit north of Cheongsa');
	const khan = monsters.find(m => m.key === 'khan');
	assert.ok(khan.zones && khan.approx && Math.hypot(khan.zones[0][0] - 65006, khan.zones[0][1] - 48051) < 4000, 'Khan stands off Oquilla’s Eye');
	for (const m of monsters) {
		if (m.key === 'saltwater-crocodile' || m.key === 'khan') continue;
		assert.ok(!m.zones, `${m.key} is marked by its spawns, not a hand-placed zone`);
		assert.ok(m.points.length > 0, `${m.key} has spawn points`);
	}
	const ly = monsters.find(m => m.key === 'lyngbakr');
	assert.equal(ly.points.length, 12, 'the twelve positions bookmarked in game');
	assert.ok(ly.points.every(([, y]) => y < 15000), 'north of the old crocodile ground');
	assert.ok(monsterArt.lyngbakr, 'and a picture');
});
