// Keeping the line on the water.
//
// The mask is built from the chart's own tiles, so the thing worth
// testing is not the pixels but the promises made about them: open sea
// is open, an island is not, a clear leg is left alone, and a blocked
// one comes back as a way round rather than a line through a rock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { isSea, seaCell, seaLeg, seaRoute } from '../js/searoute.js';
import { SEA_CELL, SEA_SIDE } from '../js/seamask.js';
import { npcs, npcById, ports } from '../js/barter_npcs.js';

const at = name => npcs.find(n => n.name === name) || ports.find(p => p.name === name);

test('the mask knows the sea from the shore', () => {
	// Deep Margoria is water; a wharf is not, since a wharf is a place
	// on land beside it.
	assert.equal(isSea(40000, 40000), true);
	assert.equal(isSea(30000, 30000), true);
	assert.equal(isSea(at('Velia').x, at('Velia').y), false);
	// And nothing outside the chart is water.
	assert.equal(seaCell(-1, 10), false);
	assert.equal(seaCell(10, SEA_SIDE), false);
});

test('a leg with clear water is left exactly as it was', () => {
	const a = at('Velia'), b = at('Iliya Island');
	assert.deepEqual(seaLeg(a, b), [a, b]);
});

test('a blocked leg comes back as a way round, on water throughout', () => {
	const a = at('Akenisi'), b = at('Kami');
	const leg = seaLeg(a, b);
	assert.ok(leg.length > 2, 'a detour');
	assert.equal(leg[0], a);
	assert.equal(leg[leg.length - 1], b);
	// Every turn it invents is at sea -- the barterers at each end are
	// on their islands, which is why the ends are exempt.
	for (const p of leg.slice(1, -1)) {
		assert.ok(isSea(p.x, p.y), `a turn on land at ${Math.round(p.x)},${Math.round(p.y)}`);
	}
	// And it is a route, not a wander: no longer than three times the
	// straight line it could not take.
	const len = leg.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - leg[i].x, p.y - leg[i].y), 0);
	assert.ok(len < 3 * Math.hypot(b.x - a.x, b.y - a.y), `${Math.round(len)} units is a wander`);
});

test('a route keeps its stops, in order, and marks what it added', () => {
	const stops = ['Akenisi', 'Kami', 'Belgio'].map(at);
	const line = seaRoute(stops);
	// The stops are still there, still themselves, still in order.
	const kept = line.filter(p => !p.bend);
	assert.deepEqual(kept, stops);
	assert.ok(line.length > stops.length, 'turns were added');
	// Everything added is a turn at sea, and carries no stop's name.
	for (const p of line.filter(p => p.bend)) {
		assert.ok(isSea(p.x, p.y));
		assert.equal(p.name, undefined);
	}
});

test('one point, or none, is not a route', () => {
	assert.deepEqual(seaRoute([]), []);
	const one = [at('Velia')];
	assert.deepEqual(seaRoute(one), one);
});

test('every barterer is within reach of open water', () => {
	// A stop the router cannot get a ship near would silently fall back
	// to a straight line through the island for ever.
	for (const n of [...npcs, ...ports]) {
		let near = false;
		const cx = Math.floor(n.x / SEA_CELL), cy = Math.floor(n.y / SEA_CELL);
		for (let dx = -3; dx <= 3 && !near; dx++) {
			for (let dy = -3; dy <= 3 && !near; dy++) if (seaCell(cx + dx, cy + dy)) near = true;
		}
		assert.ok(near, `${n.name} has no water within three cells`);
	}
	assert.ok(npcById.size > 0);
});
