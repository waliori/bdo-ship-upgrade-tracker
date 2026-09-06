// The sea's quests placed on the chart, and laid along a run: a stop
// says what is taken, done or handed in there, a leg which grounds it
// passes.
//
// What can go wrong: a quest whose place the chart does not know, goods
// taken for an island the run never reaches, a hunt noted on every leg,
// an island counted as the harbour next to it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { quests, questById } from '../js/quests.js';
import { placesOf, questsAlong } from '../js/quest-places.js';
import { ports, npcs } from '../js/barter_npcs.js';

const isle = at => npcs.find(n => n.at === at);

test('every quest step names a place the chart knows', () => {
	for (const q of quests) {
		assert.ok(q.at && q.at.length, `${q.id} says where it is done`);
		assert.equal(placesOf(q).length, q.at.length, `${q.id}: every step placed`);
		for (const p of placesOf(q)) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
	}
});

test('along a run from Velia past Baremi to Iliya: the goods for Baremi taken at Velia and handed in there, the goods for Narvo not taken, Iliya’s own quests at Iliya and not at Baremi', () => {
	const route = [ports[0], isle('Baremi Island'), ports[2]];
	const { at, legs, count } = questsAlong(quests, route);
	const ids = k => (at.get(k) || []).map(x => `${x.q.id}:${x.step.what}`);
	assert.ok(ids(0).includes('goods-baremi:take'), ids(0).join(' '));
	assert.ok(!ids(0).includes('goods-narvo:take'), 'Narvo is not on the run');
	assert.ok(ids(0).includes('hungry:take and hand in'), 'a hunt reported at Velia');
	assert.deepEqual(ids(1), ['goods-baremi:hand in'], 'Baremi is not Iliya, though it lies close');
	assert.ok(ids(2).includes('wider:take and hand in') && ids(2).includes('supplies-iliya:hand in'), ids(2).join(' '));
	assert.ok(!ids(2).includes('worldsend-1:take'), 'supplies for Ancado are not taken: the run does not go there');
	// A hunt is noted once, on the leg nearest its grounds, with the distance.
	const hunts = [...legs.values()].flat();
	const hungry = hunts.filter(x => x.q.id === 'hungry');
	assert.equal(hungry.length, 1);
	assert.ok(hungry[0].dist >= 0 && hungry[0].dist <= 8000);
	assert.ok(count >= 8, `${count} quests along the run`);
});

test('a quest already handed in on the way is not the harbour’s business twice', () => {
	const q = questById['supplies-oquilla'];
	const { at } = questsAlong([q], [ports[2], isle('Baremi Island'), ports[2]]);
	assert.deepEqual([...at.keys()], [], 'taken at Iliya only when Oquilla’s Eye comes later');
	const { at: at2 } = questsAlong([q], [ports[2], { x: 64378, y: 47067 }]);
	assert.deepEqual((at2.get(0) || []).map(x => x.step.what), ['take']);
	assert.deepEqual((at2.get(1) || []).map(x => x.step.what), ['hand in']);
});
