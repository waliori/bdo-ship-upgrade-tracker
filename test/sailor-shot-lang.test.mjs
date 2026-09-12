// Reading a sailor off a screenshot taken in another language.
//
// The fixtures are real: word boxes as the vendored engine actually
// handed them over, in the browser, for four screenshots a player sent
// in -- two crops of the Korean sailor panel off a phone 375 pixels
// wide, the whole 繁體中文 Manage Sailors window, and a crop of the
// Russian one. Nothing here runs the engine: this is the parsing.
//
// What each screenshot says, checked by eye against the picture:
//
//   Korean   Lv.10 디래인   88/100  식성 150  선실 10  200.0LT
//                           끈기 4.1  눈치 1.6  감각 2.4  완력 2.7
//   Korean   Lv.8  디래인   73/82   식성 150  선실 10  200.0LT
//                           끈기 3.5  눈치 1.4  감각 2.1  완력 2.1
//   繁體     Lv.10 迪萊因   51/100  食物 150  船艙 10  200.0LT
//                           韌性 4.8  眼色 2.0  感覺 2.7  腕力 2.5
//   Русский  Ур.10 Ниэлнад 75/100  Аппетит 150  кают 10  200.0LT
//                           3.9  1.3  2.3  1.9
//
// Every one of those figures comes back, misreads and all: "200.0LT"
// arrived as "200.0 ㄴ ㅠㅜ" and as "200.01Т", "1.6%" as "16%", 正在
// as "EE", and three of the four labels the Chinese window prints were
// broken into single characters on the way.

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
	assert.equal(s.aboard, true);         // [탑승중], a syllable a word
	// 150 rations, 10 cabins and 200 LT leave Ambitious and Innocent,
	// and this much Endurance at level 10 is the Innocent of the two --
	// but only just, so it is marked rather than asserted.
	assert.equal(s.type, 'Innocent');
	assert.deepEqual(s.read, { appetite: 150, cabin: 10, weight: 200, title: null });
	assert.deepEqual(s.stats, { speed: 4.1, accel: 1.6, turn: 2.4, brake: 2.7 });
	assert.deepEqual(s.warnings, ['type guessed']);
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
	assert.deepEqual(s.stats, { speed: 3.5, accel: 1.4, turn: 2.1, brake: 2.1 });
});

test('the whole 繁體中文 Manage Sailors window reads, list and all', () => {
	const { words, locale } = shot('windowChineseDelaine');
	const s = sailorFrom(words, locale);
	assert.equal(s.name, '迪萊因');
	assert.equal(s.lv, 10);
	assert.equal(s.cond, 51);
	assert.deepEqual(s.read, { appetite: 150, cabin: 10, weight: 200, title: null });
	// 眼色 came back "啃 色" and 感覺 "万 覺", so two of the four growths
	// were found by where they sit rather than by what they are called.
	assert.deepEqual(s.stats, { speed: 4.8, accel: 2, turn: 2.7, brake: 2.5 });
	assert.equal(s.aboard, false);        // [正在等待] -- ashore
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
