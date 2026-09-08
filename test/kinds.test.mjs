// The three kinds of thing in the item list, and the trade goods that
// make the third one real.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { kindOf, kindTag, KINDS } from '../js/kinds.js';
import { tradeGoods, tradeGoodNames } from '../js/trade_goods.js';

const barter = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const icons = JSON.parse(await readFile(new URL('../icon_mapping.json', import.meta.url), 'utf8'));

test('a good, a part and a material each know what they are', () => {
	assert.equal(kindOf('[Level 5] Golden Coral'), 'goods');
	assert.equal(kindOf('Epheria Caravel'), 'parts');
	assert.equal(kindOf('Epheria Carrack: Toro Sail'), 'parts');
	assert.equal(kindOf('+7 Epheria Carrack: Toro Sail'), 'parts');
	assert.equal(kindOf('Tidal Black Stone'), 'materials');
	assert.equal(kindOf('Crow Coin'), 'materials');
	assert.equal(kindTag('[Level 1] Raft Toy'), 'trade good');
	assert.equal(kindTag('Tidal Black Stone'), '');
	assert.deepEqual(KINDS.map(k => k.id), ['materials', 'parts', 'goods']);
});

test('the trade goods module is exactly what the barter table hands over or takes in', () => {
	const seen = new Set();
	for (const e of barter) {
		if (/^\[Level/.test(e.name)) seen.add(e.name);
		for (const s of e.sources) if (s.give && /^\[Level/.test(s.give.name)) seen.add(s.give.name);
	}
	assert.deepEqual(new Set(tradeGoodNames), seen);
	assert.equal(tradeGoodNames.length, seen.size);
	for (const [lv, names] of Object.entries(tradeGoods)) {
		for (const n of names) assert.ok(n.startsWith(`[Level ${lv}]`), n);
	}
	assert.deepEqual(Object.keys(tradeGoods), ['1', '2', '3', '4', '5', '6', '7']);
});

test('every trade good has a picture, so it can be picked and shown', () => {
	for (const n of tradeGoodNames) assert.ok(icons[n] && icons[n].icon, `${n} has no icon`);
});
