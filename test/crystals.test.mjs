// The sea crystals: every codex entry parses to a number the ship can add.

import test from 'node:test';
import assert from 'node:assert/strict';
import { crystals, crystalById, GRADES, crystalStats, crystalVariant, crystalsOf } from '../js/crystals.js';

test('every crystal has one effect the ship understands', () => {
	assert.equal(crystals.length, 295);
	for (const c of crystals) {
		const s = crystalStats(c);
		const keys = Object.keys(s).filter(k => k !== 'breezy');
		if (c.grade === 'nol' && c.id === 59321) assert.deepEqual(s, { breezy: true });
		else assert.equal(keys.length, 1, `${c.id} ${c.name}: ${JSON.stringify(c.effects)}`);
		assert.ok(crystalVariant(c), `${c.id} has a variant label`);
	}
});

test('the grades are whole, and Rusalka tops Margoria', () => {
	for (const g of ['eltro', 'serni', 'zulatia', 'margoria']) assert.equal(crystalsOf(g).length, 70, g);
	assert.equal(crystalsOf('rusalka').length, 7);
	assert.equal(crystalsOf('nol').length, 8);
	const best = grade => Math.max(...crystalsOf(grade).map(c => crystalStats(c).speed || 0));
	assert.equal(best('margoria'), 4);
	assert.equal(best('rusalka'), 4.5);
	assert.equal(crystalStats(crystalById[59444]).weight, 1350);
	assert.equal(crystalStats(crystalById[756827]).damage, 2340);
	assert.equal(GRADES.map(g => g.id).join(','), 'eltro,serni,zulatia,margoria,rusalka,nol');
});
