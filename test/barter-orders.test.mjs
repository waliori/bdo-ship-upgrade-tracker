// The sailing orders, and what they do to a run: which levels a wharf
// sells, the floors kept back, land goods on or off, the yardstick.
//
// What can go wrong: a floor that is spent through, a Level 5 sold
// under orders that sell 7s only, a preset that does not round-trip
// through the profile, a yardstick divided by nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PRESETS, DEFAULT_ORDERS, readOrders, presetOrders, onPreset, sellable, floorOf, yardsticks, PARLEY_UNIT, countAs, ratioKey } from '../js/barter-orders.js';
import { chains, chainRun } from '../js/barter-chains.js';
import { boardData } from '../js/barter-board.js';
import { levelOf } from '../js/barter.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';
import { readProfile } from '../js/profile-shape.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8')).combos;
const layout = combos.find(c => c.id === '1');   // Gangdalpo takes Azure Quartz for a Level 6
const data = boardData(layout, barterData, npcById);
const stashes = ['Velia', 'Iliya Island', 'Port Epheria'].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));
const hold = { free: 16500, deal: 20625, max: 28050 };
const parley = { bar: 1000000, perTrade: 14286 };
const iliya = ports.find(p => p.name === 'Iliya Island');

test('the orders read clean from whatever was saved, and a preset round-trips through the profile', () => {
	assert.equal(readOrders(null).preset, 'cash');
	assert.deepEqual(readOrders({ preset: 'nope', sell: 4, floors: { 3: '20', 9: 5, 2: -1 }, pace: 'slow', hours: 99 }), { ...DEFAULT_ORDERS, floors: { 3: 20 } });
	for (const p of PRESETS) {
		const o = presetOrders(p.id);
		assert.ok(onPreset(o), p.id);
		assert.deepEqual(readProfile({ orders: o }).orders, o);
	}
	assert.ok(!onPreset({ ...presetOrders('floor'), sell: 5 }));
});

test('what sells and what is kept follow the orders', () => {
	const cash = presetOrders('cash'), stock = presetOrders('floor');
	assert.ok(sellable('[Level 5] Azure Quartz', cash));
	assert.ok(!sellable('[Level 5] Azure Quartz', stock));
	assert.ok(sellable('[Level 7] Golden Eagle Brooch', stock));
	assert.ok(!sellable('[Level 2] Urchin Spine', { ...cash, sell: 3 }), 'nothing pays for a Level 2');
	assert.equal(floorOf('[Level 4] Panacea', stock), 40);
	assert.equal(floorOf('[Level 4] Panacea', cash), 0);
	assert.equal(floorOf('Tidal Black Stone', stock), 0);
});

test('under cash-out the Level 5s aboard that nothing takes are sold at the last wharf; under the stock orders they are kept', () => {
	const stock = { '[Level 5] Luxury Patterned Fabric': 12 };
	const base = { chosen: [], stock, hold, parley, npcById, start: iliya, stashes };
	const cash = chainRun({ ...base, orders: presetOrders('cash') });
	assert.equal(cash.silver, 12 * 10000000);
	assert.equal(cash.kept.length, 0);
	const keep = chainRun({ ...base, orders: presetOrders('floor') });
	assert.equal(keep.silver, 0);
	assert.equal(keep.kept[0].n, 12);
	assert.equal(keep.kept[0].stock, 4, 'the floor of four is the stock; the rest is left over');
});

test('a floor is never spent through: five Azure Quartz with a floor of four climb one', () => {
	const stock = { '[Level 5] Azure Quartz': 5 };
	const all = chains(data, stock);
	const c = all.find(x => x.from === 'hold' && x.item === '[Level 5] Azure Quartz' && x.top === 7);
	assert.ok(c);
	const p = chainRun({ chosen: [c], stock, hold, parley, npcById, start: iliya, stashes, pace: 'fast', orders: presetOrders('floor') });
	assert.equal(p.stops.filter(s => s.npcId)[0].times, 1);
	assert.equal(p.silver, 100000000);
	assert.equal(p.kept.find(k => k.item === '[Level 5] Azure Quartz').n, 4);
	const all5 = chainRun({ chosen: [c], stock, hold, parley, npcById, start: iliya, stashes, pace: 'fast', orders: presetOrders('cash') });
	assert.equal(all5.stops.filter(s => s.npcId)[0].times, 5);
});

test('goods at the start harbour are loaded before casting off and the chain says so', () => {
	const dock = { '[Level 5] Azure Quartz': 5 };
	const all = chains(data, {}, dock);
	const c = all.find(x => x.item === '[Level 5] Azure Quartz' && x.top === 7);
	assert.equal(c.from, 'dock');
	assert.equal(c.load, 5);
	assert.equal(c.have, 0);
	assert.ok(c.id.startsWith('hold:'), 'the id does not change when the goods are loaded');
	const p = chainRun({ chosen: [c], stock: {}, dock, hold, parley, npcById, start: iliya, stashes, pace: 'fast', orders: presetOrders('cash') });
	assert.deepEqual(p.loaded, [{ item: '[Level 5] Azure Quartz', n: 5 }]);
	assert.equal(p.weightStart, 5000);
	assert.equal(p.silver, 500000000);
});

test('land goods priced take the run to a net figure; unpriced ones say so', () => {
	const c = chains(data).find(x => x.from === 'land' && x.top === 7);
	const prices = { [c.item]: { each: 100000, how: 'market' } };
	const p = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: iliya, stashes, orders: presetOrders('cash'), prices });
	assert.equal(p.bought[0].how, 'market');
	assert.equal(p.cost, Math.ceil(p.bought[0].n) * 100000);
	assert.equal(p.net, p.silver - p.cost);
	const q = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: iliya, stashes, orders: presetOrders('cash') });
	assert.equal(q.bought[0].how, 'unpriced');
	assert.equal(q.net, q.silver);
});

test('what an island was seen to pay replaces the range', () => {
	const c = chains(data).find(x => x.from === 'land' && x.top === 7);
	const ranged = c.rungs.find(r => r.recvMin !== r.recvMax);
	assert.ok(ranged, 'a chain from the shore passes a 2-3 exchange');
	const least = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: iliya, stashes, orders: presetOrders('cash') });
	const most = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: iliya, stashes, orders: presetOrders('cash'), seen: { [ranged.npcId]: ranged.recvMax } });
	const at = p => p.stops.find(s => s.npcId === ranged.npcId);
	assert.equal(at(most).recvText, String(ranged.recvMax));
	assert.ok(most.trades >= least.trades, 'an island that paid three hands more on than one counted at two');
});

test('the yardsticks and the record of ratios', () => {
	const y = yardsticks(1000000000, PARLEY_UNIT * 20, 2);
	assert.equal(y.perUnit, 50000000);
	assert.equal(y.perHour, 500000000);
	assert.deepEqual(yardsticks(0, 0, 0), { perUnit: 0, perHour: 0 });
	const r = { npcId: 1, give: 'a', item: 'b', recv: 2.5, recvMin: 2, recvMax: 3 };
	assert.equal(countAs(r, { count: 'least' }), null);
	assert.equal(countAs(r, { count: 'average' }), 2.5);
	assert.equal(countAs(r, { count: 'seen' }, {}), null);
	assert.equal(countAs(r, { count: 'seen' }, { [ratioKey(r)]: { 2: 1, 3: 4 } }), 3);
	assert.equal(countAs({ ...r, recvMin: 2, recvMax: 2 }, { count: 'average' }), null, 'a fixed exchange is not a range');
	assert.equal(levelOf('[Level 3] x'), 3);
});

test('a save that names the preset by its old id lands on the same orders', () => {
	// "Build the stocks" became "Sell the top, keep a floor" when the tab
	// grew a goal that actually builds one. A save written before that
	// must come up on the preset, not as "adjusted" beside it.
	const old = readOrders({ preset: 'stock', sell: 7, floors: { 1: 10, 2: 30, 3: 30, 4: 40, 5: 4 }, buy: true, pace: 'full' });
	assert.equal(old.preset, 'floor');
	assert.ok(onPreset(old), 'the orders still match the preset they came from');
	assert.deepEqual(old.floors, presetOrders('floor').floors);
	// A name that was never a preset still falls back to cash.
	assert.equal(readOrders({ preset: 'nonsense' }).preset, 'cash');
});
