// The wharf roll: every manager the codex knows, on the chart, with a
// kind the map's toggles understand.

import test from 'node:test';
import assert from 'node:assert/strict';

import { wharves, nearestWharf } from '../js/wharves.js';

test('the roll is the full one, not the three knowledge groups', () => {
	assert.ok(wharves.filter(w => w.kind === 'wharf').length >= 40, 'wharf managers');
	assert.ok(wharves.filter(w => w.kind === 'guild').length >= 15, 'guild wharves');
});

test('every entry is a place on the chart', () => {
	const names = new Set();
	for (const w of wharves) {
		assert.ok(['wharf', 'guild'].includes(w.kind), w.name);
		assert.ok(Number.isFinite(w.x) && Number.isFinite(w.y) && w.x > 10000 && w.y > 5000, w.name);
		assert.ok(!names.has(w.name), `${w.name} listed twice`);
		names.add(w.name);
	}
});

test('the harbours the game is known by are all here', () => {
	const has = name => wharves.some(w => w.name === name);
	for (const name of ['Croix', 'Gangman', 'Ravikel', 'Anax', 'Dario', 'Bartholomeo', 'Robert', 'Sebastian']) {
		assert.ok(has(name), name);
	}
	assert.equal(wharves.find(w => w.name === 'Gangman').at, 'Cheongsa Island');
});

test('the nearest wharf answers by kind', () => {
	const w = nearestWharf(68000, 68000, 'wharf');
	assert.equal(w.name, 'Croix', 'Velia is the nearest to its own bay');
	assert.equal(nearestWharf(68000, 68000, 'guild').name, 'Robert');
});
