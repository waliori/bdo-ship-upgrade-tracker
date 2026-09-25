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

import { offersFrom, rowsOf, cover, plain, tierIn, isleAt, linesOf, figuresFrom, wholeIn, windowWords } from '../js/barter-shot.js';
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

// The head of the window, off a shot of the whole screen: the game's
// own Barter Information panel with the ship window beside it, the
// chat log under it, and the list filtered to the Crow Coin exchanges.
// The app had been planning this player's day against a full bar of a
// million Parley while the window said 269,692, and counting 1,957
// barters against the window's 2,048.
test('the window’s head gives up the sailor’s Parley and barter count', () => {
	assert.deepEqual(figuresFrom(shot('coinWindowFull')), { parley: 269692, barters: 2048 });
});

test('a shot of the rows alone offers no figures rather than the wrong ones', () => {
	// Every row says what its exchange costs in Parley. None of those is
	// the sailor's bar, and a reader that took the first of them would
	// write 13,829 into the profile and lay every run against it.
	for (const key of ['level1List', 'fiveToSix', 'sixToSeven']) {
		assert.deepEqual(figuresFrom(shot(key)), { parley: null, barters: null }, key);
	}
});

// The head as each client prints it, off players' screenshots found
// for the purpose: the label in the engine's boxes, then a "(?)" and a
// colon or not, then the figure, which in Japanese and Thai carries its
// unit.
test('the lifetime barter count is read by its label in every client’s words', () => {
	const row = (...texts) => {
		let x = 10;
		return texts.map(text => {
			const w = { text, x0: x, y0: 100, x1: x + text.length * 9, y1: 118 };
			x = w.x1 + 6;
			return w;
		});
	};
	const heads = [
		[['Total', 'Barters', '(?)', ':', '2048'], 2048],
		[['Nbr.', "d'échanges", 'accumulés', '(?)', ':', '0'], 0],
		[['Cantidad', 'acumulada', 'de', 'trueques', '(?):', '17'], 17],
		[['Mis', 'intercambios', 'acumulados', '(?)', ':', '0'], 0],
		[['Nº', 'de', 'Trocas', 'Acumuladas(?):', '39909', 'vezes'], 39909],
		[['N°', 'de', 'Trocas', 'Acumuladas', ':', '1,204'], 1204],
		[['Biriken', 'Takas', 'Sayımı', ':', '812'], 812],
		[['私の累積交換回数', '：', '2640回'], 2640],
		[['私の累積', '交換回数：2640回'], 2640],
		[['จำนวนการแลกเปลี่ยน', 'สะสม', ':', '50361ครั้ง'], 50361],
		[['누적', '교환', '횟수', ':', '3,120'], 3120],
		[['Суммарное', 'число', 'обменов', ':', '75'], 75]
	];
	for (const [texts, n] of heads) {
		assert.equal(figuresFrom(row(...texts)).barters, n, texts.join(' '));
	}
	// Words that are not the label leave the field alone.
	assert.equal(figuresFrom(row('Trocas', 'Restantes', ':', '4')).barters, null);
	assert.equal(figuresFrom(row('Tractations', ':', '1,000,000')).barters, null);
});

test('a figure is a figure, and a speed or a refresh count is not', () => {
	assert.equal(wholeIn('269,692'), 269692);
	assert.equal(wholeIn('1.234.567'), 1234567);
	assert.equal(wholeIn('2048'), 2048, 'the barter count is printed ungrouped');
	assert.equal(wholeIn('10/150'), null, 'the refreshes left');
	assert.equal(wholeIn('150.0'), null, 'a ship’s speed');
	assert.equal(wholeIn('1,23'), null, 'a group that is not three digits long');
	assert.equal(wholeIn('abc'), null);
});

// The same shot of the whole screen. Read as one page it gave up no row
// at all: the ship's window stands to the left of the list, so every
// line of the list began with the ship's words and an island is only
// looked for where a line begins. The window is found first now, by the
// two stacks every row repeats, and read on its own.
test('a shot of the whole screen reads, the window found inside it', () => {
	assert.deepEqual(said(read('coinWindowFull')), [
		["Crow's Nest", '[Level 4] Solidified Lava', 'Crow Coin'],
		['Kashuma Island', "[Level 4] Pirate's Key", 'Crow Coin'],
		['Derko Island', '[Level 4] Seashell Deco', 'Crow Coin'],
		["Pakio's Combat Raft", '[Level 4] Amethyst Fragment', 'Crow Coin'],
		["Shipwrecked Haran's Cargo Ship", "[Level 4] Boatman's Manual", 'Crow Coin'],
		["Lantinia's Combat Raft", '[Level 4] Opulent Thread Spool', 'Crow Coin']
	]);
	// The seventh row is cut in half by the foot of the screen, and is a
	// question rather than a guess.
	const cut = read('coinWindowFull').find(r => r.isle.at === 'Unfinished Adrift Vessel');
	assert.ok(cut && !cut.offer, 'a row the screen cut off is not answered for');
});

test('a bracket the engine never closed does not swallow the name after it', () => {
	assert.equal(plain("[Level 41 Boatman's Manual & 1 > [@] Crow Coin"), 'level41boatmansmanual1crowcoin');
	assert.equal(plain('[Level 4] Seashell Deco'), 'seashelldeco');
});

test('a shot that is already only the window loses no row to the cropping', () => {
	// What goes is the litter round the edge -- half a line of glyphs the
	// foot of the shot cut through -- and never a word of a row.
	for (const [key, rows] of [['level1List', 7], ['fiveToSix', 6], ['sixToSeven', 6]]) {
		assert.equal(rowsOf(shot(key), npcs).length, rows, key);
		assert.ok(windowWords(shot(key)).length >= shot(key).length * 0.85, `${key} keeps its words`);
	}
});

/* ------------------------------------------------------------------ *
 * a window in another language
 * ------------------------------------------------------------------ */

import { localized, inEnglish, dense } from '../js/barter-shot.js';

const pack = code => JSON.parse(readFileSync(new URL(`../js/lang/names.${code}.json`, import.meta.url), 'utf8'));
/** A window of rows as a client prints them: island at the left, the
 *  give and the pay to the right, one row a line. */
const windowOf = rows => rows.flatMap(([isle, give, pay], i) => {
	const y = 20 + i * 60;
	return [
		{ text: isle, x0: 10, y0: y, x1: 150, y1: y + 20 },
		{ text: give, x0: 300, y0: y, x1: 520, y1: y + 20 },
		{ text: pay, x0: 640, y0: y, x1: 860, y1: y + 20 }
	];
});
const byAt = at => npcs.find(n => n.at === at);

test('any script is compared without its accents, its tier or its spaces', () => {
	assert.equal(plain('[5단계] 고급 문양의 옷감'), '고급문양의옷감');
	assert.equal(plain("Île d'Orisha"), 'iledorisha');
	assert.equal(plain('[Stufe 5] Luxuriöser gemusterter Stoff'), 'luxuriosergemusterterstoff');
	assert.equal(tierIn('[5단계] 고급 문양의 옷감'), 5);
	assert.equal(tierIn('[Stufe 3] Rundmesser'), 3);
	assert.equal(tierIn('[+4] Panacea'), 4);
	assert.equal(dense('오리샤 섬'), true);
	assert.equal(dense('Insel Orisha'), false);
});

test('a Korean window reads against the game’s Korean names, and comes back in English', () => {
	const kr = pack('kr');
	const E = [['Orisha Island', '[Level 5] Luxury Patterned Fabric', 'Brilliant Pearl Shard'], ['Boa Island', 'Island Tree Coated Plywood', 'Rock Salt Ingot']];
	for (const r of E) for (const n of r) assert.ok(kr[n], `the pack names ${n}`);
	const words = windowOf(E.map(r => r.map(n => kr[n])));
	const rows = offersFrom(words, localized({ isles: npcs, deals }, kr)).map(inEnglish);
	assert.deepEqual(rows.filter(r => r.offer).map(r => [r.isle.at, r.offer.give, r.offer.item]), E);
	assert.equal(rows[0].isle, byAt('Orisha Island'), 'the island is the app’s own again');
});

test('a German window reads too, with the island’s name after its word for island', () => {
	const de = pack('de');
	const E = [['Orisha Island', '[Level 5] Luxury Patterned Fabric', 'Brilliant Pearl Shard']];
	const words = windowOf(E.map(r => r.map(n => de[n])));
	const rows = offersFrom(words, localized({ isles: npcs, deals }, de)).map(inEnglish);
	assert.deepEqual(rows.filter(r => r.offer).map(r => [r.isle.at, r.offer.give, r.offer.item]), E);
});

test('an English client with no pack is read exactly as before', () => {
	const t = localized({ isles: npcs, deals }, {});
	assert.equal(t.isles, npcs);
	assert.equal(t.deals, deals);
});

// Two shots of 2026-09 that read nothing at all. In the first the
// window's edge was taken from "Island" -- the second word of every
// name, whose column moves with the word before it -- and every name
// was cut in half. In the second, a single row, the icon's tall boxes
// between the two lines of writing walked the island's line down into
// "Exchanges Left" and the island was never found.
test('the window starts where the names start, not at their second word', () => {
	assert.deepEqual(said(read('nameShift')), [
		['Racid Island', '[Level 3] Skull Decorated Teacup', 'Deep Sea Memory Filled Glue'],
		['Arakil Island', '[Level 4] Old Chest with Gold Coins', 'Cox Pirates\' Artifact (Parley Expert)'],
		['Al-Naha Island', '[Level 4] Amethyst Fragment', 'Tide-Dyed Standardized Timber Square'],
		['Beiruwa Island', '[Level 4] Headless Dragon Figurine', 'Cox Pirates\' Artifact (Parley Expert)'],
		['Weita Island', '[Level 2] Urchin Spine', 'Island Tree Coated Plywood'],
		['Paratama Island', '[Level 4] Panacea', 'Great Ocean Dark Iron']
	]);
});

test('a shot of one row reads, the icon’s boxes between its lines notwithstanding', () => {
	assert.deepEqual(said(read('oneRow')), [['Padix Island', '[Level 4] Bronze Candlestick', '[Level 5] Mysterious Rock']]);
});
