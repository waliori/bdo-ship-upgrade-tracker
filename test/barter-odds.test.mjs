// How often the offer is really there.
//
// The forecast used to assume the exchange was on the list every time
// you drew it, which made every rare thing look four times closer than
// it is. These pin the correction: that it is read off the boards, that
// it can only ever lengthen a forecast, that a thing no board has
// recorded keeps the old best-case number and says so, and that a
// missing dataset leaves the app exactly as it was.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { readOdds, oddsFor, oddsText } from '../js/barter-odds.js';
import { forecast, summarise, bottleneck, ladder } from '../js/barter.js';

const here = p => new URL(p, import.meta.url);
const boards = JSON.parse(await readFile(here('../js/material_boards.json'), 'utf8'));
const combos = JSON.parse(await readFile(here('../js/barter_combos.json'), 'utf8'));
const table = JSON.parse(await readFile(here('../js/all_barter.json'), 'utf8'));
const index = readOdds({ boards, combos });

test('the index is built from whole boards and the recorded layouts', () => {
	assert.equal(index.boards, boards.boards.length);
	assert.equal(index.refreshes, combos.combos.reduce((a, c) => a + c.seen, 0));
	assert.ok(index.material.size > 10 && index.trade.size > 50);
});

test('a material on one board in four is counted as such, and the sample is said', () => {
	const odds = oddsFor("Saltwater Crocodile's Scale", index);
	assert.equal(odds.recorded, true);
	assert.equal(odds.kind, 'material');
	assert.equal(odds.seen, 1);
	assert.equal(odds.of, 4);
	// Shrunk toward the old assumption by one board's weight: (1+1)/(4+1).
	assert.equal(odds.per, 0.4);
	assert.match(oddsText(odds), /on 1 of the 4 boards recorded/);
});

test('nothing is ever counted as more available than always', () => {
	for (const item of [...index.material.keys(), ...index.trade.keys()]) {
		assert.ok(oddsFor(item, index).per <= 1, item);
	}
});

test('a thing every board carried is unchanged, so a common material is not slowed', () => {
	const odds = oddsFor('Bright Reef Piece', index);
	assert.equal(odds.per, 1);
	const was = forecast('Bright Reef Piece', 100, table, {});
	const now = forecast('Bright Reef Piece', 100, table, { odds: index });
	assert.equal(now.days, was.days);
	assert.equal(summarise(now), summarise(was));
});

test('a scarce material takes longer than it used to, and both figures are quoted', () => {
	const was = forecast("Saltwater Crocodile's Scale", 100, table, {});
	const now = forecast("Saltwater Crocodile's Scale", 100, table, { odds: index });
	assert.ok(now.days > was.days, `${now.days} > ${was.days}`);
	// The old figure survives as the floor, not as the answer.
	assert.equal(Math.round(now.bestDays * 100), Math.round(was.days * 100));
	assert.match(summarise(now), /about \d+ days, \d+ if the offer is always up/);
});

test('an item no board has recorded keeps the old number and says that is what it is', () => {
	const odds = oddsFor("Violent Sea Monster's Bone", index);
	assert.equal(odds.recorded, false);
	assert.equal(odds.per, 1);
	assert.match(oddsText(odds), /no board has recorded this one yet/);
	const was = forecast("Violent Sea Monster's Bone", 100, table, {});
	const now = forecast("Violent Sea Monster's Bone", 100, table, { odds: index });
	assert.equal(now.days, was.days);
});

test('with no datasets at all the forecast is exactly what it was', () => {
	const empty = readOdds({});
	for (const item of ['Bright Reef Piece', "Saltwater Crocodile's Scale", 'Tidal Black Stone']) {
		const was = forecast(item, 60, table, {});
		const now = forecast(item, 60, table, { odds: empty });
		assert.equal(now.days, was.days, item);
		assert.equal(oddsFor(item, null).per, 1);
	}
});

test('the trade list is read off four hundred refreshes, and the top rungs are the scarce ones', () => {
	const low = oddsFor('[Level 7] Omar Lava Powder', index);
	const high = oddsFor('[Level 3] Rare Herb Pile', index);
	assert.ok(low.per < 0.25, `${low.per}`);
	assert.ok(high.per > 0.9, `${high.per}`);
	assert.match(oddsText(low), /% of refreshes, over 420 recorded/);
});

test('the rung that paces a climb is chosen on how often it is there, not on bulk alone', () => {
	const top = ladder('Bright Reef Piece', table);
	const plain = bottleneck(top, 100, { trade: 3, material: 3 });
	const wise = bottleneck(top, 100, { trade: 3, material: 3 }, index);
	// Scarcity can only add draws, so the paced rung never gets faster.
	assert.ok(wise.days >= plain.days);
	assert.ok(wise.refreshes >= wise.bestRefreshes);
	assert.equal(Math.round(wise.bestRefreshes * 1000), Math.round(plain.refreshes * 1000));
});

test('the whole climb is looked at, so the scarcest rung is named even when another sets the pace', () => {
	const f = forecast('Bright Reef Piece', 100, table, { odds: index });
	assert.ok(f.scarcest, 'a recorded rung was found');
	for (const r of f.rungs) {
		const o = oddsFor(r.item, index);
		if (o.recorded) assert.ok(f.scarcest.per <= o.per, `${r.item} is rarer than the one named`);
	}
});
