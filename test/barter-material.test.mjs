// The run for a material: every island ticked, sailed as one route.
//
// What can go wrong: islands sailed in the order they were ticked
// rather than the order that is shortest; a give loaded before the
// harbour that keeps it is called at; a hold loaded past what it
// carries, or a run that gives up on gives the hold could carry in
// two departures; a run that keeps dealing after the want is met, or
// stops short of it when the islands could pay more.

import test from 'node:test';
import assert from 'node:assert/strict';

import { tour, materialRun } from '../js/barter-material.js';

// A sea of our own: five islands in a row east of Velia, a wharf at
// Velia and another far to the north, and an exchange at each island
// that takes a [Level 5] for a few Scales. Ticked in a scrambled
// order, so the route has to be found, not read off.
const L5 = '[Level 5] Faded Gold Dragon Figurine';
const L4 = '[Level 4] Amethyst Fragment';
const BAR = 'Gold Bar 100G';
const PLY = 'Ship Material Nobody Sells';   // a give that is neither a trade good nor a land good
const SALT = 'Rock Salt Ingot';
const L7 = '[Level 7] Crystal Ball of Fortune';
const SCALE = "Violent Sea Monster's Scale";
const REEF = 'Bright Reef Piece';
const npcs = [
	{ id: 1, name: 'A', at: 'Isle A', x: 1000, y: 0 },
	{ id: 2, name: 'B', at: 'Isle B', x: 2000, y: 0 },
	{ id: 3, name: 'C', at: 'Isle C', x: 3000, y: 0 },
	{ id: 4, name: 'D', at: 'Isle D', x: 4000, y: 0 },
	{ id: 5, name: 'E', at: 'Isle E', x: 5000, y: 0 }
];
const npcById = new Map(npcs.map(n => [n.id, n]));
const velia = { id: 1, name: 'Velia', x: 0, y: 0 };
const veliaWharf = { name: 'Croix', kind: 'wharf', at: 'Velia', x: 0, y: 0 };
const northWharf = { name: 'Nord', kind: 'wharf', at: 'Iliya Island', x: 3000, y: -3000 };
const hold = { free: 3000, deal: 4000, max: 5000 };   // three Figurines without slowing, four to barter
const pick = (npcId, item = SCALE, { tries = 2, give = L5, giveN = 1, recv = '3-5' } = {}) => {
	const [lo, hi] = recv.split('-').map(Number);
	return { npcId, npc: npcById.get(npcId).name, item, give, giveN, giveText: String(giveN), recv: (lo + (hi || lo)) / 2, recvMin: lo, recvMax: hi || lo, recvText: recv, tries };
};
const names = stops => stops.map(s => (s.wharf ? `${s.wharf.at}${s.loads && s.loads.length ? `+${s.loads.map(l => l.n).join('/')}` : ''}${s.dropped && s.dropped.length ? `-${s.dropped.map(d => d.n).join('/')}` : ''}` : s.npc));

test('the tour is the shortest way, from a start when given and from the best end when not', () => {
	const pts = [npcs[3], npcs[0], npcs[4], npcs[1], npcs[2]];   // D A E B C
	assert.deepEqual(tour(pts, { start: velia }).map(i => pts[i].name), ['A', 'B', 'C', 'D', 'E']);
	// Without a start the row is walked from one end or the other.
	const free = tour(pts).map(i => pts[i].name).join('');
	assert.ok(free === 'ABCDE' || free === 'EDCBA', free);
	// Made to end near a wharf off E, the free path has to finish at E.
	assert.equal(tour(pts, { end: { x: 5000, y: -3000 } }).map(i => pts[i].name).join(''), 'ABCDE');
	assert.equal(tour(pts, { end: { x: 1000, y: -3000 } }).map(i => pts[i].name).join(''), 'EDCBA');
});

test('every island ticked is one route from the harbour, in the order that is shortest, whatever the order ticked or the material', () => {
	const picks = [pick(4), pick(1, REEF), pick(5), pick(2), pick(3, REEF)];
	const plan = materialRun({ picks, wants: { [SCALE]: 99, [REEF]: 99 }, reach: 'all', stock: { [L5]: 10 }, hold: { free: 20000, deal: 25000, max: 30000 }, start: velia, startWharf: veliaWharf, npcById });
	assert.deepEqual(names(plan.stops), ['A', 'B', 'C', 'D', 'E']);
	assert.equal(plan.islands, 5);
	assert.equal(plan.trades, 10);
	assert.equal(plan.calls, 0);
	assert.equal(plan.got.get(SCALE).min, 18, 'three islands, two tries, three at the least');
	assert.equal(plan.got.get(REEF).min, 12);
	// The hold lightens by a Figurine a trade and the Scales weigh nothing.
	assert.deepEqual(plan.stops.map(s => s.weightAfter), [8000, 6000, 4000, 2000, 0]);
});

test('for the wants the run deals what the want takes and no more; for every island it deals every attempt', () => {
	const picks = [pick(1), pick(2), pick(3)];
	const wanted = materialRun({ picks, wants: { [SCALE]: 7 }, reach: 'want', stock: { [L5]: 10 }, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(wanted.trades, 3, 'seven scales at three a trade is three trades');
	assert.equal(wanted.got.get(SCALE).min, 9);
	assert.equal(wanted.waits.get(SCALE), 0);
	const all = materialRun({ picks, wants: { [SCALE]: 7 }, reach: 'all', stock: { [L5]: 10 }, hold: { free: 20000, deal: 25000, max: 30000 }, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(all.trades, 6);
	// The give short: what is not held is to climb for, island by island.
	const short = materialRun({ picks, wants: { [SCALE]: 99 }, reach: 'all', stock: { [L5]: 1 }, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(short.trades, 1);
	assert.equal(short.missing.length, 1);
	assert.equal(short.missing[0].give, L5);
	assert.equal(short.missing[0].n, 5);
	assert.equal(short.waits.get(SCALE), 96);
});

test('a full run loads to the barter ceiling and goes back to the harbour for the gives that did not fit; a fast run sails once and says what stayed ashore', () => {
	// Ten Figurines in Velia's storage, five islands taking two each:
	// ten thousand weight against a hold that barters under four.
	const picks = [pick(1), pick(2), pick(3), pick(4), pick(5)];
	const base = { picks, wants: { [SCALE]: 99 }, reach: 'all', dock: { [L5]: 10 }, hold, start: velia, startWharf: veliaWharf, npcById };
	const full = materialRun({ ...base, pace: 'full' });
	assert.deepEqual(names(full.stops), ['Velia+4', 'A', 'B', 'Velia+4', 'C', 'D', 'Velia+2', 'E'], 'three departures, the nearest islands first');
	assert.equal(full.returns, 2);
	assert.equal(full.trades, 10);
	assert.equal(full.noRoom.length, 0);
	assert.ok(full.weightPeak <= hold.deal, `never over the ceiling: ${full.weightPeak}`);
	// Each departure leaves with what it will spend and comes back empty.
	assert.deepEqual(full.stops.map(s => s.weightAfter), [4000, 2000, 0, 4000, 2000, 0, 2000, 0]);
	const fast = materialRun({ ...base, pace: 'fast' });
	assert.deepEqual(names(fast.stops), ['Velia+2', 'A'], 'one departure under the limit: A takes two, B would make four');
	assert.equal(fast.returns, 0);
	assert.equal(fast.noRoom.length, 1);
	assert.equal(fast.noRoom[0].n, 8, 'the eight Figurines that stayed ashore');
	assert.equal(fast.noRoom[0].islands.length, 4);
	assert.equal(fast.waits.get(SCALE), 99 - 6);
});

test('a full run leaves what it will not spend in storage when the room is wanted; one island heavier than the hold deals as many times as fit', () => {
	// A [Level 7] aboard that no island takes, and gives for two islands
	// at the harbour: the ball goes ashore so the gives come aboard.
	const picks = [pick(1), pick(2)];
	const plan = materialRun({ picks, wants: { [SCALE]: 99 }, reach: 'all', stock: { [L7]: 1 }, dock: { [L5]: 4 }, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.deepEqual(names(plan.stops), ['Velia+4-1', 'A', 'B']);
	assert.deepEqual(plan.stops[0].dropped, [{ item: L7, n: 1 }]);
	assert.equal(plan.weightStart, 2000);
	assert.equal(plan.stops[0].weightAfter, 4000);
	// An island with six attempts at a Figurine each: the hold takes
	// four, so it deals four and says two stayed ashore.
	const heavy = materialRun({ picks: [pick(1, SCALE, { tries: 6 })], wants: { [SCALE]: 99 }, reach: 'all', dock: { [L5]: 6 }, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.deepEqual(names(heavy.stops), ['Velia+4', 'A']);
	assert.equal(heavy.stops[1].times, 4);
	assert.equal(heavy.noRoom[0].n, 2);
});

test('a give kept at another harbour is called for before the island that takes it, and not at all when calls are off', () => {
	// The Figurine only at Iliya's storage, north of C: the run sails
	// the islands fed from aboard, calls north, then deals the rest.
	const picks = [pick(1), pick(2), pick(3), pick(4)];
	const stores = [{ town: 'Iliya Island', wharf: northWharf, goods: { [L5]: 4 } }];
	const plan = materialRun({ picks, wants: { [SCALE]: 99 }, reach: 'all', stock: { [L5]: 4 }, stores, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(plan.calls, 1);
	assert.equal(plan.trades, 8);
	const seq = names(plan.stops);
	const call = seq.indexOf('Iliya Island+4');
	assert.ok(call > 0 && call < seq.length - 1, `the call is on the way: ${seq.join(' > ')}`);
	// Two islands before the call, from the goods aboard; two after.
	assert.equal(call, 2, seq.join(' > '));
	assert.ok(plan.stops.every(s => s.weightAfter <= hold.deal));
	// The harbour's goods are a stop's loads, so the trip records the move.
	assert.deepEqual(plan.stops[call].loads, [{ item: L5, n: 4 }]);
	const off = materialRun({ picks, wants: { [SCALE]: 99 }, reach: 'all', stock: { [L5]: 4 }, stores, calls: false, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(off.calls, 0);
	assert.equal(off.trades, 4);
	assert.equal(off.missing[0].n, 4, 'the four at Iliya are missing to a run that will not call there');
});

test('without a start harbour the run begins at the island that makes the shortest way, and the storage of no harbour is loaded', () => {
	const picks = [pick(3), pick(1), pick(2)];
	const plan = materialRun({ picks, wants: { [SCALE]: 99 }, reach: 'all', stock: { [L5]: 6 }, dock: { [L5]: 6 }, hold: { free: 20000, deal: 25000, max: 30000 }, start: null, startWharf: null, npcById });
	const seq = names(plan.stops).join('');
	assert.ok(seq === 'ABC' || seq === 'CBA', seq);
	assert.equal(plan.trades, 6, 'the storage of a harbour not sailed from is not aboard');
	assert.equal(plan.calls, 0);
});

test('the start harbour comes first: its storage is loaded and what the run will not spend left there before casting off, and no island is sailed twice', () => {
	// A Figurine aboard for A, two at Velia for B and C, and a Ball
	// aboard that nothing takes: one departure, the harbour first.
	const picks = [pick(1), pick(2), pick(3)];
	const plan = materialRun({ picks: picks.map(x => ({ ...x, tries: 1 })), wants: { [SCALE]: 99 }, reach: 'all', stock: { [L5]: 1, [L7]: 1 }, dock: { [L5]: 2 }, hold: { free: 3000, deal: 3000, max: 4000 }, start: velia, startWharf: veliaWharf, npcById });
	assert.deepEqual(names(plan.stops), ['Velia+2-1', 'A', 'B', 'C']);
	assert.equal(plan.returns, 0);
	assert.equal(plan.weightPeak, 3000, 'what the run sails with, not what sat aboard at the pier');
	assert.equal(plan.weightStart, 3000);
});

test('a give that is no trade good comes out of the bags or the shop: gold bars are bought before casting off and priced, a material short is said to be one', () => {
	const bars = [pick(1, REEF, { give: BAR, recv: '1' }), pick(2, REEF, { give: BAR, recv: '1' })];
	const prices = { [BAR]: { each: 10000000, how: 'fixed' } };
	const plan = materialRun({ picks: bars, wants: { [REEF]: 99 }, reach: 'all', bags: { [BAR]: 1 }, prices, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.deepEqual(names(plan.stops), ['A', 'B'], 'no call: nothing to load at the harbour');
	assert.equal(plan.trades, 4);
	assert.deepEqual(plan.bought, [{ item: BAR, n: 3, each: 10000000, how: 'fixed', total: 30000000 }], 'one from the bags, three bought');
	assert.equal(plan.cost, 30000000);
	assert.deepEqual(plan.missing, []);
	assert.ok(plan.stops.every(s => s.weightAfter === 0), 'a gold bar weighs nothing the hold counts');
	// With buying off, the bars are missing and said to be a land good.
	const off = materialRun({ picks: bars, wants: { [REEF]: 99 }, reach: 'all', bags: { [BAR]: 1 }, buy: false, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(off.trades, 1);
	assert.equal(off.missing[0].kind, 'land');
	assert.equal(off.missing[0].n, 3);
	// A material for a material, out of the bags: a shortfall is a material to find, not a good to climb for or a thing to buy.
	const salt = materialRun({ picks: [pick(1, SALT, { give: PLY, giveN: 2, recv: '1', tries: 3 })], wants: { [SALT]: 99 }, reach: 'all', bags: { [PLY]: 3 }, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(salt.trades, 1);
	assert.equal(salt.missing[0].kind, 'material');
	assert.equal(salt.missing[0].n, 4);
});

test('a give kept where the run cannot load it -- a town without a wharf, or a harbour when calls are off -- is short, and the run says where it sits', () => {
	const picks = [pick(1, REEF, { give: L4 })];
	const stores = [{ town: 'Heidel', wharf: null, goods: { [L4]: 5 } }, { town: 'Iliya Island', wharf: northWharf, goods: { [L4]: 1 } }];
	const plan = materialRun({ picks, wants: { [REEF]: 99 }, reach: 'all', stores, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(plan.trades, 1, 'the one at Iliya, called for');
	assert.equal(plan.missing[0].kind, 'good');
	assert.equal(plan.missing[0].n, 1);
	assert.deepEqual(plan.missing[0].heldAt, [{ town: 'Heidel', n: 5 }]);
	const off = materialRun({ picks, wants: { [REEF]: 99 }, reach: 'all', stores, calls: false, hold, start: velia, startWharf: veliaWharf, npcById });
	assert.equal(off.trades, 0);
	assert.deepEqual(off.missing[0].heldAt, [{ town: 'Heidel', n: 5 }, { town: 'Iliya Island', n: 1 }]);
});
