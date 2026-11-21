// The sea's quests handed in along a run: every taker placed on the
// chart, a stop put in where one lies a short way off the route, a hunt
// only after a leg has passed its grounds, a barter quest only once the
// run's trades have made its count up.
//
// What can go wrong: a quest whose place the chart does not know, a
// hand-in put before the kill it needs, a taker miles off treated as
// on the way, an island counted as the harbour next to it, a barter
// quest handed in short of its count.

import test from 'node:test';
import assert from 'node:assert/strict';

import { quests, questById } from '../js/quests.js';
import { placesOf, handIn, layQuests } from '../js/quest-places.js';
import { ports, npcs } from '../js/barter_npcs.js';

const isle = at => npcs.find(n => n.at === at);
const daily = quests.filter(q => /daily|weekly/.test(q.repeat));

test('every quest step names a place the chart knows, and every quest has a taker', () => {
	for (const q of quests) {
		assert.ok(q.at && q.at.length, `${q.id} says where it is done`);
		assert.equal(placesOf(q).length, q.at.length, `${q.id}: every step placed`);
		assert.ok(handIn(q), `${q.id} is handed in somewhere`);
	}
});

test('a loop from Velia by Baeza and Tinberra: deliveries handed in where the run passes, a stop put in for Baremi close by, Ancado far off, hunts only after their grounds, barter quests only once made up', () => {
	const route = [ports[0], isle('Baeza Island'), isle('Tinberra Island'), ports[0]];
	const trades = [0, 10, 12, 0];
	const { route: laid, off, legs } = layQuests(daily, route, { trades, progress: () => 0 });
	const ids = e => e.steps.map(x => x.q.id);
	const entry = name => laid.find(e => e.quest && e.place === name);
	assert.ok(ids(laid[0]).includes('recover'), 'the Chowder handed in at Velia before casting off');
	assert.ok(ids(laid.find(e => e.fixed && e.i === 2)).includes('goods-tinberra'), 'goods for Tinberra handed in there');
	assert.ok(entry('Baremi Island') && ids(entry('Baremi Island')).includes('goods-baremi'), 'a stop put in at Baremi');
	assert.ok(off.some(x => x.q.id === 'worldsend-1' && x.why === 'far'), 'Ancado is too far off the way');
	// The barter quests: fifteen and twenty made up on the way, the hundred not.
	const iliya = entry('Iliya Island wharf');
	assert.ok(iliya && ids(iliya).includes('lively') && ids(iliya).includes('wider'), 'the two dailies handed in at Iliya, put in after the trades');
	assert.ok(laid.indexOf(iliya) > laid.findIndex(e => e.fixed && e.i === 2), 'after the twenty-second trade, at Tinberra');
	const nexus = off.find(x => x.q.id === 'nexus');
	assert.ok(nexus && nexus.why === 'short' && nexus.left === 78, 'the hundred: 22 of it this run, 78 more after');
	// A hunt gets a stop at its grounds, and is handed in only after it.
	const grounds = laid.find(e => e.hunt && e.hunt.key === 'hekaru');
	assert.ok(grounds, 'a stop put in at the Hekaru grounds');
	assert.ok(grounds.steps.some(x => x.q.id === 'hungry' && x.step.what === 'hunt'));
	const hungry = laid.find(e => e.steps.some(x => x.q.id === 'hungry' && x.step.what !== 'hunt' && x.step.what !== 'take'));
	assert.ok(hungry && laid.indexOf(hungry) > laid.indexOf(grounds), 'handed in after the grounds');
	assert.equal([...legs.keys()].includes(laid.indexOf(grounds)), true, 'the grounds stop named for what draws them');
	assert.ok(off.some(x => x.q.id === 'omg-candidum' && x.why === 'grounds'), 'the Candidum grounds lie too far off the way');
	// Baremi lies a mile from Iliya, and is not Iliya.
	assert.ok(!ids(entry('Baremi Island')).includes('supplies-iliya'));
});

test('a quest given by someone else is fetched before it is handed in: at the harbour when the giver is there, else a stop put in at the giver', () => {
	const route = [ports[0], isle('Baeza Island'), isle('Tinberra Island'), ports[0]];
	const { route: laid } = layQuests(daily, route, { trades: [0, 10, 12, 0], progress: () => 0 });
	const at = (id, what) => laid.findIndex(e => e.steps.some(x => x.q.id === id && (what === 'take' ? x.step.what === 'take' : x.step.what !== 'take' && x.step.what !== 'hunt')));
	assert.equal(at('goods-tinberra', 'take'), 0, 'Miya gives the goods at Velia, before casting off');
	assert.ok(at('goods-tinberra') > 0, 'and they are handed in at Tinberra');
	const q = questById['supplies-oquilla'];
	const far = layQuests([q], [ports[0], isle('Tinberra Island'), ports[0]], { forced: new Set([q.id]) }).route;
	const take = far.findIndex(e => e.steps.some(x => x.step.what === 'take'));
	const give = far.findIndex(e => e.steps.some(x => x.step.what !== 'take'));
	assert.ok(take > 0 && far[take].quest && far[take].place === 'Iliya Island wharf', 'a stop put in at Dario, Iliya');
	assert.ok(take < give, 'before Ravikel takes it in');
	// Liara, 2026-11-20: the Cox Scouts hunt showed its grounds and its hand-in
	// at Proix, never where to take it. Taken and handed in at Velia, it is
	// fetched at Velia before the grounds: at the start when the run sets out
	// from there, else at a stop put in before the hunt.
	const cox = questById['coxscouts'];
	const fromVelia = layQuests([cox], [ports[0], isle('Tinberra Island'), ports[0]], { forced: new Set([cox.id]) }).route;
	const step = (r, pick) => r.findIndex(e => e.steps.some(x => x.q.id === 'coxscouts' && pick(x.step.what)));
	assert.equal(step(fromVelia, w => w === 'take'), 0, 'taken at Velia before casting off');
	const iliya = ports.find(p => p.name === 'Iliya Island');
	const fromIliya = layQuests([cox], [iliya, isle('Tinberra Island'), iliya], { forced: new Set([cox.id]) }).route;
	const took = step(fromIliya, w => w === 'take'), hunt = step(fromIliya, w => w === 'hunt'), back = step(fromIliya, w => w !== 'take' && w !== 'hunt');
	assert.ok(took > 0 && fromIliya[took].place === 'Velia', `a stop put in at Proix, Velia (${fromIliya.map(e => e.place || e.i).join(' > ')})`);
	assert.ok(took < hunt && hunt < back, 'taken, then hunted, then handed in');
});

test('a barter quest already part-way counts its progress, and a run that does not pass its taker puts a stop in only once it is made up', () => {
	const q = questById['nexus'];
	const route = [ports[0], isle('Baremi Island'), ports[0]];
	const short = layQuests([q], route, { trades: [0, 30, 0], progress: () => 60 });
	assert.equal(short.off.length, 1); assert.equal(short.off[0].left, 10);
	const made = layQuests([q], route, { trades: [0, 30, 0], progress: () => 70 });
	assert.equal(made.off.length, 0);
	const at = made.route.find(e => e.steps.length);
	assert.ok(at.quest && at.place === 'Iliya Island', 'a stop put in at Iliya, the taker');
	assert.ok(made.route.indexOf(at) > 1, 'after the trades at Baremi');
});
