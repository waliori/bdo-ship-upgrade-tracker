// Reading a sailor off a screenshot taken in another language.
//
// The fixtures are real: word boxes as the vendored engine actually
// handed them over for four screenshots a player sent in -- two crops
// of the Korean sailor panel off a phone 375 pixels wide, the whole
// 繁體中文 Manage Sailors window, and a crop of the Russian one.
// Nothing here runs the engine.
//
// What each screenshot says, checked by eye against the picture:
//
//   Korean  Lv.10 디래인   88/100  식성 150  선실 10  200.0LT
//                          끈기 4.1  눈치 1.6  감각 2.4  완력 2.7
//   Korean  Lv.8  디래인   73/82   식성 150  선실 10  200.0LT
//                          끈기 3.5  눈치 1.4  감각 2.1  완력 2.1
//   繁體    Lv.10 迪萊因   51/100  食物 150  船艙 10  200.0LT
//                          韌性 4.8  眼色 2.0  感覺 2.7  腕力 2.5
//   Русский Ур.10 Ниэлнад 75/100  Аппетит 150  кают 10  200.0LT
//                          3.9  1.3  2.3  1.9
//
// Three growths are missing from what the reader gets back, and all
// three are the scan's: "4.1%" came back "4.%" and "2.1%" came back
// "2.%", the per-cent sign eating the decimal. A growth that was not
// read is left out and said so; it is not guessed at.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sailorFrom, panelBox } from '../js/sailor-shot.js';
import { localeFor, LANGS } from '../js/sailor-locales.js';

const raw = JSON.parse(readFileSync(new URL('./fixtures/sailor-shots-lang.json', import.meta.url), 'utf8'));
const shot = key => ({
	locale: localeFor(raw[key].lang),
	words: raw[key].words.map(([text, x0, y0, x1, y1]) => ({ text, x0, y0, x1, y1 }))
});

test('a Korean sailor panel reads, name and all', () => {
	const { words, locale } = shot('panelKoreanDelaine');
	const s = sailorFrom(words, locale);
	assert.equal(s.name, '디레인');        // 디래인 -- one vowel the scan lost
	assert.equal(s.lv, 10);
	assert.equal(s.cond, 88);
	assert.equal(s.type, 'Innocent');     // 150 rations, 10 cabins, 200 LT
	assert.deepEqual(s.read, { appetite: 150, cabin: 10, weight: 200, title: null });
	assert.deepEqual(s.stats, { accel: 1.6, turn: 2.4, brake: 2.7 });
	assert.ok(s.warnings.includes('some growths not read'));   // 끈기 came back "4.%"
});

test('the level is found where the scan lost the "Lv." in front of it', () => {
	// The Korean model makes nothing of a Latin "Lv.8": it came back as
	// "ㄴ" and "/.8". The name is then the line above the one saying
	// where the sailor is standing, and the level is the figure on it.
	const { words, locale } = shot('panelKoreanDelaineLv8');
	const s = sailorFrom(words, locale);
	assert.equal(s.lv, 8);
	assert.equal(s.name, '디레인');
	assert.equal(s.cond, 89);             // 73/82
	assert.deepEqual(s.stats, { speed: 3.5, accel: 1.4, brake: 2.1 });
});

test('the whole 繁體中文 Manage Sailors window reads, list and all', () => {
	const { words, locale } = shot('windowChineseDelaine');
	const s = sailorFrom(words, locale);
	assert.equal(s.name, '迪萊因');
	assert.equal(s.lv, 10);
	assert.equal(s.cond, 51);
	assert.deepEqual(s.read, { appetite: 150, cabin: 10, weight: 200, title: null });
	// 感覺's "2.7%" came back "2.7y"; 韌性, 眼色 and 腕力 are the game's.
	assert.equal(s.stats.speed, 4.8);
	assert.equal(s.stats.accel, 2);
	assert.equal(s.stats.brake, 2.5);
});

test('a Russian panel reads whole, "Ур." and Cyrillic name included', () => {
	const { words, locale } = shot('panelRussianNielnad');
	const s = sailorFrom(words, locale);
	assert.equal(s.name, 'Ниэлнад');
	assert.equal(s.lv, 10);
	assert.equal(s.cond, 75);
	assert.equal(s.type, 'Innocent');
	assert.deepEqual(s.stats, { speed: 3.9, accel: 1.3, turn: 2.3, brake: 1.9 });
	assert.deepEqual(s.warnings, []);
});

test('every language reads its own panel, and none of them reads it wrong', () => {
	for (const key of Object.keys(raw)) {
		const { words, locale } = shot(key);
		assert.ok(panelBox(words, { locale }), `${key}: no panel`);
		const s = sailorFrom(words, locale);
		assert.ok(s, `${key}: nothing read`);
		// The weight is the one fact every client writes the same way,
		// and the type hangs off it.
		assert.equal(s.read.weight, 200, key);
		for (const [k, v] of Object.entries(s.stats)) assert.ok(v > 0 && v < 50, `${key}: ${k} ${v}`);
	}
});

test('the shape of the panel carries a language whose words are wrong', () => {
	// Every label in this locale is nonsense, which is what a language
	// nobody here could check would amount to. The weight still carries
	// LT, the growths are still a grid of per-cents in a fixed order,
	// and the sailor still comes back.
	const { words } = shot('panelRussianNielnad');
	const locale = localeFor('ru');
	const blind = { ...locale, labels: Object.fromEntries(Object.keys(locale.labels).map(k => [k, ['zzzzzz']])) };
	const s = sailorFrom(words, blind);
	assert.ok(s, 'no panel without its labels');
	assert.equal(s.read.weight, 200);
	assert.deepEqual(s.stats, { speed: 3.9, accel: 1.3, turn: 2.3, brake: 1.9 });
});

test('every language the game lists can be read for', () => {
	// The game's own menu has sixteen entries; each one has to name a
	// model the reader can actually fetch.
	const models = new Set(['eng', 'rus', 'jpn', 'kor', 'chi_sim', 'chi_tra', 'tha']);
	assert.equal(LANGS.length, 16);
	for (const lang of LANGS) {
		const locale = localeFor(lang.tag);
		assert.ok(models.has(locale.tess), `${lang.tag}: ${locale.tess}`);
		assert.ok(locale.labels.appetite.length, `${lang.tag}: no appetite label`);
		assert.equal(locale.titles.Tough, 'Tough');
	}
});
