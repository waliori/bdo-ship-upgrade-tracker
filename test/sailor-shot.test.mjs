// Reading a sailor off a screenshot.
//
// The fixtures are real: word boxes as the vendored engine actually
// handed them over for five of the game's own screenshots, misreads and
// all -- "(+3.3%)3.3%" glued into one word, a Strength of 1.8 with a
// stray "1)" beside it, "35%" where the game printed 3.5%, "Lv.]" for
// "Lv.1", and the roster's own "18/20" sitting on the same line as the
// name. Nothing here runs the engine: this is the parsing, which is
// where every one of those was fixed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sailorFrom, readPanel, matchType, percentsIn, closestType, panelBox } from '../js/sailor-shot.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/sailor-shots.json', import.meta.url), 'utf8'));
const shot = key => raw[key].map(([text, x0, y0, x1, y1]) => ({ text, x0, y0, x1, y1 }));

test('a cropped Selected Sailor panel reads whole', () => {
	const s = sailorFrom(shot('panelDelaine'));
	assert.equal(s.name, 'Delaine');
	assert.equal(s.type, 'Tough');       // the title said so outright
	assert.equal(s.lv, 8);
	assert.equal(s.cond, 100);
	assert.equal(s.aboard, true);
	assert.deepEqual(s.stats, { speed: 1.2, accel: 1.1, turn: 2.4, brake: 5.9 });
	assert.deepEqual(s.warnings, []);
});

test('a growth is the figure with the per-cent sign, not the mark beside it', () => {
	// Kioro's panel has a stray "1)" to the right of Awareness and
	// Strength, which read as a growth of 1 before the sign was required.
	const s = sailorFrom(shot('panelKioro'));
	assert.equal(s.name, 'Kioro');
	assert.deepEqual(s.stats, { speed: 3.9, accel: 1.5, turn: 1.8, brake: 1.8 });
});

test('the whole Manage Sailors window reads, and names the type it never prints', () => {
	const s = sailorFrom(shot('windowNeilMoss'));
	assert.equal(s.name, 'Neil Moss');
	// No title in this window at all: 100 rations, 5 cabins and 300 LT
	// leave Confident, Tough and Tenacious, and the growths pick.
	assert.equal(s.type, 'Confident');
	assert.equal(s.lv, 10);
	assert.deepEqual(s.stats, { speed: 1.6, accel: 1.6, turn: 7.8, brake: 3.3 });
	assert.deepEqual(s.warnings, []);
	assert.deepEqual(s.read, { appetite: 100, cabin: 5, weight: 300, title: null });
});

test('a level lost to the scan does not take the name with it', () => {
	// "Lv.1 Roe" came back as "Lv.]" and "Roe", on a line the window had
	// already put its own "18/20" on.
	const s = sailorFrom(shot('windowRoe'));
	assert.equal(s.name, 'Roe');
	assert.equal(s.lv, 1);
	assert.equal(s.type, 'Enamored');
});

test('a named first mate has no level, no cabin cost and no growths', () => {
	const s = sailorFrom(shot('windowProix'));
	assert.equal(s.name, 'Proix');
	assert.equal(s.type, 'Proix');
	assert.equal(s.lv, 1);
	assert.deepEqual(s.stats, {});
	assert.ok(s.warnings.includes('no growths read'));
});

test('every fixture is found in its own screenshot, wherever the panel sits', () => {
	for (const key of Object.keys(raw)) {
		const box = panelBox(shot(key));
		assert.ok(box, `${key}: no panel`);
		assert.ok(box.x1 > box.x0 && box.y1 > box.y0, `${key}: empty box`);
	}
});

test('a screenshot of something else is not a sailor', () => {
	const words = [
		{ text: 'CROW', x0: 10, y0: 10, x1: 60, y1: 24 },
		{ text: 'COINS', x0: 70, y0: 10, x1: 130, y1: 24 },
		{ text: '39,400', x0: 10, y0: 40, x1: 80, y1: 54 },
		{ text: 'needed', x0: 90, y0: 40, x1: 150, y1: 54 }
	];
	assert.equal(panelBox(words), null);
	assert.equal(sailorFrom(words), null);
});

test('the game prints a growth to one decimal, so a figure without one lost it', () => {
	assert.deepEqual(percentsIn('1.6%'), [1.6]);
	assert.deepEqual(percentsIn('35%'), [3.5]);       // 3.5%, the point scanned away
	assert.deepEqual(percentsIn('0.0%'), [0]);
	assert.deepEqual(percentsIn('(+3.3%)3.3%'), [3.3, 3.3]);
	assert.deepEqual(percentsIn('Endurance'), []);
});

test('a title is matched to a type through a misread letter or two', () => {
	assert.equal(closestType('Innocent'), 'Innocent');
	assert.equal(closestType('lnnocent'), 'Innocent');
	assert.equal(closestType('Dreaming of a Full Haul'), 'Dreaming of a Full Haul');
	assert.equal(closestType('Balenos Whale Sculpture'), null);
});

test('the facts alone name a type where they can, and say so when they cannot', () => {
	// Dreaming of a Full Haul is the only sailor costing thirteen cabins.
	const sure = matchType({ name: 'Utto', title: null, lv: 9, appetite: 150, cabin: 13, weight: 400, stats: {} });
	assert.deepEqual(sure, { type: 'Dreaming of a Full Haul', sure: true });
	// Nothing eats 999.
	assert.deepEqual(matchType({ name: 'x', title: null, lv: 1, appetite: 999, cabin: 4, weight: 77, stats: {} }), { type: null, sure: false });
	// Three types cost five cabins and 300 LT on 100 rations. With no
	// growths read there is nothing to tell them apart, and naming one
	// of the three would be a coin toss dressed as an answer.
	assert.deepEqual(matchType({ name: 'x', title: null, lv: 10, appetite: 100, cabin: 5, weight: 300, stats: {} }),
		{ type: null, sure: false });
	// The growths settle it: this much turn at Lv 10 is a Confident.
	assert.deepEqual(matchType({ name: 'x', title: null, lv: 10, appetite: 100, cabin: 5, weight: 300,
		stats: { speed: 1.6, accel: 1.6, turn: 7.8, brake: 3.3 } }), { type: 'Confident', sure: true });
	// And this much brake is a Tenacious, not the Tough beside it.
	assert.equal(matchType({ name: 'x', title: null, lv: 1, appetite: 100, cabin: 5, weight: 300,
		stats: { speed: 0.2, accel: 0.2, turn: 0.8, brake: 4 } }).type, 'Tenacious');
});

test('a panel that is all there still reads when the words come out of order', () => {
	// The engine hands words back in reading order; nothing here should
	// depend on it, since a crop can put the portrait's badge first.
	const words = shot('panelDelaine');
	const shuffled = [...words].reverse();
	assert.deepEqual(readPanel(shuffled).stats, readPanel(words).stats);
	assert.equal(readPanel(shuffled).name, readPanel(words).name);
});
