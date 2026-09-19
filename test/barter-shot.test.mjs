// Reading the barter window off a screenshot.
//
// The fixtures are real: word boxes as the vendored engine actually
// handed them over for three shots of the game's own barter list -- the
// land goods at the top of the ladder, a [Level 5] to [Level 6] page
// and a [Level 6] to [Level 7] one -- ellipses, misreads and all.
// "Faded Gold Dra...", "Supreme Gold C.", "Luxury Patterne.", a Shadow
// Ornament Mirror whose second half wrapped under the Parley cost, and
// an island called "Sanctuary Coastal" because the column had no room
// for Outpost.
//
// Nothing here runs the engine. This is the part that turns those
// words into offers, which is where every one of those was dealt with.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { offersFrom, rowsOf, cover, plain, tierIn, isleAt, linesOf } from '../js/barter-shot.js';
import { npcs } from '../js/barter_npcs.js';
import { exchanges } from '../js/barter-plan.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/barter-shots.json', import.meta.url), 'utf8'));
const shot = key => raw[key].map(([text, x0, y0, x1, y1, conf]) => ({ text, x0, y0, x1, y1, conf }));
const deals = exchanges(JSON.parse(readFileSync(new URL('../js/all_barter.json', import.meta.url), 'utf8')));
const read = key => offersFrom(shot(key), { isles: npcs, deals });
const said = rows => rows.filter(r => r.offer).map(r => [r.isle.at, r.offer.give, r.offer.item]);

test('a page of the ladder reads, island by island', () => {
	assert.deepEqual(said(read('fiveToSix')), [
		['Arehaza', '[Level 5] Faded Gold Dragon Figurine', '[Level 6] Golden Cactus Bouquet'],
		['Grándiha', '[Level 5] Golden Fish Scale', '[Level 6] Mossy Silver Log Decoration'],
		['Hakoven Island', '[Level 5] Supreme Gold Candlestick', '[Level 6] Golden Sand Ring'],
		['Starry Midnight Port', '[Level 5] 102 Year Old Golden Herb', '[Level 6] Shadow Ornament Mirror'],
		['Haemo Island', '[Level 5] Luxury Patterned Fabric', '[Level 6] Hanji Country Wild Berry Crate'],
		['Dallae Pier', '[Level 5] Mysterious Rock', '[Level 6] Sharp Safflower Blade Crate']
	]);
});

test('the six coastal barterers read, and their names were cut short', () => {
	// "Sanctuary Coastal" and "Sausan Garrison" are as much of the name
	// as the column had room for.
	assert.deepEqual(said(read('sixToSeven')), [
		['Olvia Coast', '[Level 6] Golden Sand Ring', '[Level 7] Organic Honey Crate'],
		['Lema Island', '[Level 6] Hanji Country Wild Berry Crate', '[Level 7] Balenos Rainbow Coral'],
		['Iliya Island', '[Level 6] Sharp Safflower Blade Crate', "[Level 7] Artisan's Seashell Necklace"],
		['Epheria Sentry Post', '[Level 6] Golden Cactus Bouquet', '[Level 7] Golden Eagle Brooch'],
		['Sanctuary Coastal Outpost', '[Level 6] Shadow Ornament Mirror', "[Level 7] Rusalka's Thorny Bouquet"],
		['Sausan Garrison Wharf', '[Level 6] Mossy Silver Log Decoration', '[Level 7] Omar Lava Powder']
	]);
});

test('the land goods at the foot of the ladder read too', () => {
	const rows = read('level1List');
	assert.deepEqual(said(rows).slice(0, 6), [
		['Eveto Island', 'Powder of Darkness', '[Level 1] Cherry Tree Seed Pouch'],
		['Duch Island', 'Star Anise', '[Level 1] Unidentified Ancient Mural'],
		['Luivano Island', "Sinner's Blood", '[Level 1] Golden Sand'],
		['Mariveno Island', "Clown's Blood", '[Level 1] Fertile Soil'],
		['Ephde Rune Island', 'Resplendent Obsidian', '[Level 1] Rakeflower Seed Pouch'],
		['Paratama Island', 'Beer', '[Level 1] Fertile Soil']
	]);
});

test('a row the screenshot cut in half is not an answer, but it is a shortlist', () => {
	// The last row of that shot has its island and its give good and
	// nothing else: the window was taller than the screenshot.
	const last = read('level1List').at(-1);
	assert.equal(last.isle.at, 'Staren Island');
	assert.equal(last.offer, null);
	assert.ok(last.near && last.near.length);
	assert.equal(last.near[0].deal.give, 'Brass Ingot');
});

test('nothing but the islands the window actually named', () => {
	// Every row starts with an island in its own column. A good in the
	// middle of a row that happens to be an island's name -- and there
	// are several -- must not open a row of its own.
	for (const key of ['level1List', 'fiveToSix', 'sixToSeven']) {
		const rows = rowsOf(shot(key), npcs);
		assert.ok(rows.length >= 6 && rows.length <= 8, `${key}: ${rows.length} rows`);
		assert.equal(new Set(rows.map(r => r.isle.id)).size, rows.length, `${key}: an island twice`);
	}
});

/* ------------------------------------------------------------------ *
 * the pieces
 * ------------------------------------------------------------------ */

test('a name is compared without its tier, its case or its spaces', () => {
	assert.equal(plain('[Level 6] Golden Sand Ring'), 'goldensandring');
	assert.equal(plain("Rusalka's Thorny Bouquet"), 'rusalkasthornybouquet');
	assert.equal(tierIn('[Level 5] Faded Gold Dra...'), 5);
	assert.equal(tierIn('Powder of Darkness'), null);
});

test('a name the window cut short still counts as that name', () => {
	const row = plain('[Level 5] Faded Gold Dra... Parley: 9,247 required');
	assert.ok(cover('[Level 5] Faded Gold Dragon Figurine', row) > 0.9);
	assert.ok(cover('[Level 5] Faded Gold Dragon Figurine', plain('Faded Go')) < 1);
});

test('a name that wrapped is picked up where it broke off', () => {
	const row = plain('[Level 6] Shadow Exchanges Left: 5 Parley: 9,247 required Ornament Mirror');
	assert.equal(cover('[Level 6] Shadow Ornament Mirror', row), 1);
});

test('a short name has to be there in full', () => {
	assert.equal(cover('Beer', plain('Bee Keeper Exchanges Left: 10')), 0);
	assert.equal(cover('Beer', plain('Y Beer 3 Parley')), 1);
});

test('an island is read at the start of a row and nowhere else', () => {
	const words = [
		{ text: 'Iliya', x0: 10, y0: 0, x1: 60, y1: 20 },
		{ text: 'Island', x0: 62, y0: 0, x1: 120, y1: 20 },
		{ text: '[Level', x0: 300, y0: 0, x1: 340, y1: 20 },
		{ text: '6]', x0: 342, y0: 0, x1: 360, y1: 20 }
	];
	const line = linesOf(words)[0];
	assert.equal(isleAt(line, npcs, { left: 200 }).isle.at, 'Iliya Island');
	// the same words, but the island sits in the middle of the row
	const shifted = linesOf(words.map(w => ({ ...w, x0: w.x0 + 400, x1: w.x1 + 400 })))[0];
	assert.equal(isleAt(shifted, npcs, { left: 200 }), null);
});

test('a line of furniture is not an island', () => {
	const line = linesOf([
		{ text: 'Exchanges', x0: 10, y0: 0, x1: 90, y1: 20 },
		{ text: 'Left:', x0: 92, y0: 0, x1: 120, y1: 20 },
		{ text: '10', x0: 122, y0: 0, x1: 140, y1: 20 }
	])[0];
	assert.equal(isleAt(line, npcs, { left: 400 }), null);
});
