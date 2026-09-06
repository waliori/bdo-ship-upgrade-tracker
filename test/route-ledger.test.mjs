// The loop's ledger: what goes ashore, what comes aboard, what it is worth.

import test from 'node:test';
import assert from 'node:assert/strict';
import { routeLedger, perHour } from '../js/route-ledger.js';
import { GOODS } from '../js/barter.js';

const trades = {
	1: [{ item: 'Tidal Black Stone', give: '[Level 5] Pearl', recv: 2, giveN: 1 }],
	2: [{ item: '[Level 5] Pearl', give: '[Level 4] Shell', recv: 1, giveN: 1 }],
	3: [{ item: 'Moon Vein Flax Fabric', give: '[Level 4] Shell', recv: 3, giveN: 2 }]
};

test('the ledger weighs and prices each stop in order', () => {
	const l = routeLedger({ stops: [1, 2, 3], tradesAt: id => trades[id], aboard: 3000, price: item => (item === 'Tidal Black Stone' ? 1_000_000 : 0) });
	assert.equal(l.start, 3000);
	// Stop 1: a Lv5 (1,000 LT, 10m) goes ashore for two stones (no weight, 1m each).
	assert.deepEqual(l.stops[0], { id: 1, change: -1000, after: 2000, trades: 1 });
	// Stop 2: a Lv4 (1,000 LT, 2m) for a Lv5 (1,000 LT, 10m): the hold is even.
	assert.deepEqual(l.stops[1], { id: 2, change: 0, after: 2000, trades: 1 });
	// Stop 3: two Lv4 for three fabrics the market has not priced.
	assert.deepEqual(l.stops[2], { id: 3, change: -2000, after: 0, trades: 1 });
	assert.equal(l.goodsOut, 4);
	assert.equal(l.goodsIn, 1);
	assert.equal(l.outValue, GOODS[5].sell + 3 * GOODS[4].sell);
	assert.equal(l.inValue, GOODS[5].sell);
	assert.equal(l.mats, 5);
	assert.equal(l.matValue, 2_000_000);
	assert.equal(l.unpriced, 3);
	assert.equal(l.net, GOODS[5].sell + 2_000_000 - GOODS[5].sell - 3 * GOODS[4].sell);
	assert.deepEqual([...l.carry], [['[Level 5] Pearl', 1], ['[Level 4] Shell', 3]]);
});

test('a gold bar handed over is carried out of port but neither weighed nor priced', () => {
	const l = routeLedger({ stops: [9], tradesAt: () => [{ item: 'Tidal Black Stone', give: 'Gold Bar 100G', recv: 20, giveN: 1 }] });
	assert.equal(l.stops[0].change, 0);
	assert.equal(l.goodsOut, 0);
	assert.equal(l.outValue, 0);
	assert.equal(l.carry.get('Gold Bar 100G'), 1);
	assert.equal(l.mats, 20);
});

test('every attempt the offer allows multiplies the stop', () => {
	const l = routeLedger({ stops: [1], tradesAt: id => trades[id], timesAt: () => 3 });
	assert.equal(l.stops[0].change, -3000);
	assert.equal(l.mats, 6);
	assert.equal(l.carry.get('[Level 5] Pearl'), 3);
});

test('an empty loop is an empty ledger, and an hour is an hour', () => {
	const l = routeLedger({ stops: [], tradesAt: () => [] });
	assert.equal(l.stops.length, 0);
	assert.equal(l.net, 0);
	assert.equal(perHour(3_600_000, 1800), 7_200_000);
	assert.equal(perHour(1, 0), null);
});

test('given the hull, the ledger says how much speed each leg keeps', () => {
	// A 1,000 LT hold that moves under up to 1,700: two Lv5 aboard is
	// 2,000, so the leg out of port is at the floor; the first stop
	// hands one over and the leg out of it is half way; the second
	// hands over the other and the hold is light again.
	const l = routeLedger({
		stops: [1, 2],
		tradesAt: () => [{ item: 'Tidal Black Stone', give: '[Level 5] Pearl', recv: 2, giveN: 1 }],
		aboard: 2 * GOODS[5].weight,
		hold: { free: 1000, max: 1700 }
	});
	assert.equal(l.slowStart, 0.5);
	assert.equal(l.stops[0].after, 1000);
	assert.equal(l.stops[0].slow, 1);
	assert.equal(l.stops[1].slow, 1);
	const heavy = routeLedger({ stops: [1], tradesAt: () => [], aboard: 1350, hold: { free: 1000, max: 1700 } });
	assert.equal(heavy.slowStart, 0.75);
	assert.equal(heavy.stops[0].slow, 0.75);
	// Without the hull nothing is slowed and the entries are as they were.
	assert.equal('slow' in routeLedger({ stops: [1], tradesAt: () => [] }).stops[0], false);
});
