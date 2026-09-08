// Quests finished together, remembered choices, favourites and groups:
// the state under the Quests tab.

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
	store: new Map(),
	getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
	setItem(k, v) { this.store.set(k, String(v)); },
	removeItem(k) { this.store.delete(k); }
};
const store = await import('../js/state.js');
const { readProfile } = await import('../js/profile-shape.js');
const { quests, questById, cadenceOf } = await import('../js/quests.js');
const { periodKey } = await import('../js/clock.js');

test('several quests claimed at once are one change, and one undo', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: {} });
	const key = id => periodKey(cadenceOf(questById[id]));
	store.claimQuests([
		{ id: 'charity', key: key('charity'), delta: { 'Tidal Black Stone': 10 } },
		{ id: 'increase', key: key('increase'), delta: { 'Tidal Black Stone': 5, 'Crow Coin': 100 } }
	], 'Finished 2 quests');
	assert.equal(store.getStock('Tidal Black Stone'), 15);
	assert.equal(store.getStock('Crow Coin'), 100);
	assert.deepEqual(store.getProfile('questsDone'), { charity: key('charity'), increase: key('increase') });
	store.undo();
	assert.equal(store.getStock('Tidal Black Stone'), 0);
	assert.equal(store.getProfile('questsDone', null), null);
	assert.equal(store.claimQuests([], 'nothing'), null);
});

test('the memory of picks, favourites and groups survives the profile, bounded', () => {
	const p = readProfile({
		questPicks: { charity: 1, junk: 'x', far: 99 },
		questFavs: ['charity', 'charity', 7, 'hekaru'],
		questGroups: { Morning: ['charity', 'hekaru', 5], '': ['x'], Empty: [] },
		setups: { s1: { name: 'Fast', ship: 'Epheria Caravel', fitted: { sail: 'x', hat: 'y' }, crystal: 756531, seats: { 'sail:0': 'abc', bad: 'z' } }, s2: { name: 'no hull' } },
		sailingMastery: 3500
	});
	assert.deepEqual(p.questPicks, { charity: 1 });
	assert.deepEqual(p.questFavs, ['charity', 'hekaru']);
	assert.deepEqual(p.questGroups, { Morning: ['charity', 'hekaru'] });
	assert.deepEqual(p.setups, { s1: { name: 'Fast', ship: 'Epheria Caravel', fitted: { sail: 'x' }, crystal: 756531, seats: { 'sail:0': 'abc' } } });
	assert.equal(p.sailingMastery, 3000);
	assert.equal(readProfile({ sailingMastery: 0 }).sailingMastery, undefined);
});

test('every quest links to its codex page', () => {
	for (const q of quests) assert.match(q.codex || '', /^\d+\/\d+$/, q.id);
});
