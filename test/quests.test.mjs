// The free things: every quest reward names a real item, and the ones
// that pay in what you are short of come first.

import test from 'node:test';
import assert from 'node:assert/strict';

import { quests, questById, questsFor, cadenceOf } from '../js/quests.js';
import { recipes } from '../js/recipes.js';
import { items as vendorItems } from '../js/vendor_items.js';
import { coins } from '../js/sea_coins.js';
import { falasi } from '../js/falasi_vendor.js';
import { care } from '../js/sailors.js';

const known = new Set([
	...Object.keys(recipes), ...Object.values(recipes).flatMap(r => Object.keys(r)),
	...Object.keys(vendorItems), ...Object.keys(coins), ...Object.keys(falasi),
	...care.map(c => c.item), 'Crow Coin', 'Oquilla Coin', 'Tear of the Ocean'
]);

test('every reward is a thing the app can hold', () => {
	for (const q of quests) {
		for (const item of Object.keys(q.rewards)) assert.ok(known.has(item), `${q.name}: ${item}`);
		for (const c of q.choice || []) for (const item of Object.keys(c)) assert.ok(known.has(item), `${q.name}: ${item}`);
		assert.ok(questById[q.id] === q);
	}
});

test('the full Ravinia line is fifty of each Upgrade material and twenty stones', () => {
	const total = {};
	for (const q of quests.filter(q => q.id.startsWith('ravinia'))) {
		for (const [item, n] of Object.entries(q.rewards)) total[item] = (total[item] || 0) + n;
	}
	assert.equal(total['Graphite Ingot for Upgrade'], 50);
	assert.equal(total['Timber for Upgrade'], 50);
	assert.equal(total['Adhesive for Upgrade'], 50);
	assert.equal(total['Tidal Black Stone'], 20);
	assert.equal(total['Crow Coin'], 1000);
});

test('a shortfall picks out the quests that pay in it', () => {
	const hits = questsFor({ 'Tidal Black Stone': 40 }).map(q => q.id);
	assert.ok(hits.includes('ravinia-1'));
	assert.ok(hits.includes('omg-nineshark'));
	assert.ok(hits.includes('omg-w-nineshark'), 'a choice reward counts');
	assert.ok(!hits.includes('otters'));
	assert.deepEqual(questsFor({}), []);
});

test('every quest has a cadence the screen can group by', () => {
	for (const q of quests) assert.ok(['daily', 'weekly', 'once'].includes(cadenceOf(q)), q.name);
	assert.equal(cadenceOf(questById['ravinia-1']), 'once');
	assert.equal(cadenceOf(questById['khan']), 'weekly');
	assert.equal(cadenceOf(questById['omg-nineshark']), 'daily');
});
