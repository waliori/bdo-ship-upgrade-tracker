// A level named in the barter's prose is drawn as the level chip, after
// the sentence is translated: each pack writes the tag its own way, and
// a tag inside an attribute is left as it is.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { lvChips } from '../js/lv-chips.js';

const chips = html => [...html.matchAll(/<i class="lv-chip" style="--tier:var\(--tier-(\d)\)"/g)].map(m => Number(m[1]));
const pack = async id => JSON.parse(await readFile(new URL(`../js/lang/${id}.json`, import.meta.url), 'utf8'));

test('each language\'s level tag becomes the chip of its level', () => {
	assert.deepEqual(chips(lvChips('back at Iliya: sells 3 [Level 7]', 'en')), [7]);
	assert.deepEqual(chips(lvChips('zurück: verkauft 3 [Stufe 7], [St. 5] Statue', 'de')), [7, 5]);
	assert.deepEqual(chips(lvChips('vende 3 «Nivel 7 - …» y Nivel 5 - Lágrima', 'es')), [7, 5]);
	assert.deepEqual(chips(lvChips('продать [7 ур.] и [Уровень 4]', 'ru')), [7, 4]);
	assert.deepEqual(chips(lvChips('[+7] sat', 'tr')), [7]);
	assert.deepEqual(chips(lvChips('[7阶段]', 'cn')), [7]);
	// English left untranslated in a pack is chipped too.
	assert.deepEqual(chips(lvChips('sell 2 [Level 6]', 'de')), [6]);
	// The Spanish name keeps its space after the chip; the sentence form
	// takes the "- …" with it.
	assert.match(lvChips('Nivel 5 - Lágrima', 'es'), /<\/i> Lágrima$/);
	assert.doesNotMatch(lvChips('vende «Nivel 7 - …».', 'es'), /…|«|»/);
});

test('a tag inside an attribute, and text with no level, are left alone', () => {
	const html = '<b title="a [Level 5] good">[Level 5] Azure</b>';
	const out = lvChips(html, 'en');
	assert.match(out, /title="a \[Level 5\] good"/);
	assert.deepEqual(chips(out), [5]);
	assert.equal(lvChips('Level 4 to 7, sold at the wharf', 'en'), 'Level 4 to 7, sold at the wharf');
	assert.equal(lvChips('', 'en'), '');
});

test('every pack\'s barter sentences with a level tag come out with a chip', async () => {
	const keys = ['back at {port}: sells {n} [Level 7]', 'sell {n} [Level 7]', 'The same board, climbed to [Level 4] for the coin islands', 'the [Level {lv}]s'];
	for (const id of ['de', 'es', 'fr', 'pt', 'ru', 'sp', 'jp', 'kr', 'cn', 'tw', 'th', 'tr']) {
		const p = await pack(id);
		for (const k of keys) {
			const v = String(p[k] || k).replace('{lv}', '5');
			assert.equal(chips(lvChips(v, id)).length, 1, `${id}: ${v}`);
		}
	}
});
