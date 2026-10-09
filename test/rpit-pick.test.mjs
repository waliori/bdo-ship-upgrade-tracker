// The day chosen among trips: exact under the session, the attempt caps,
// the storages, the Market, the Parley and the stored-twice rule, with a
// bound that is never below the best.
//
// What can go wrong: a day over the session; an island asked for more
// than it allows across two trips; a bound below a feasible day, which
// would cut the best away; two trips dropping the same good at a wharf.

import test from 'node:test';
import assert from 'node:assert/strict';

import { pickDay, bound, legHours } from '../js/rpit/pick.js';

// A toy board: three wharves, two islands, trips as labels only.
const toy = () => ({
	goods: { A: { level: 1, w: 1, p: 0, b: 0, cap: 10 }, B: { level: 2, w: 1, p: 1, b: 0, cap: null } },
	stations: [{ id: 'x', in: 'A', q: 1, out: 'B', ymin: 1, ymax: 1, p: 1, m: 6, c: 1 }, { id: 'y', in: 'A', q: 1, out: 'B', ymin: 1, ymax: 1, p: 1, m: 4, c: 1 }],
	depots: [{ id: 'H', storage: { A: 5 } }, { id: 'D', storage: {} }],
	travel: { points: ['start', 'H', 'D', 'x', 'y'], matrix: [[0, 0, 3600, 1, 1], [0, 0, 3600, 1, 1], [3600, 3600, 0, 1, 1], [1, 1, 1, 0, 1], [1, 1, 1, 1, 0]] },
	vehicle: { speed: 1 },
	budgets: { P: 100, vouchers: { n: 1, each: 50 } },
	rules: { home: 'H', end: 'H', underWaySpeed: 1 }
});
const trip = (id, o) => ({ id, from: 'start', to: 'H', f: 0, T: 1, P: 0, att: {}, loads: {}, buys: {}, drops: {}, ...o, R: o.f });

test('the most within the session, and the attempt caps across trips', () => {
	const trips = [
		trip('a', { f: 10, T: 1, att: { x: 4 } }),
		trip('b', { f: 9, T: 1, att: { x: 4 } }),   // x allows 6: a and b together ask 8
		trip('c', { f: 5, T: 1, att: { y: 4 } }),
		trip('d', { f: 4, T: 1.5, att: {} })
	];
	const day = pickDay(toy(), trips, { H: 2 });
	assert.deepEqual(day.trips.map(t => t.id), ['a', 'c']);
	assert.equal(day.value, 15);
	assert.ok(day.bound >= 15 - 1e-9, `bound ${day.bound}`);
});

test('the bound is never below the best day, on every toy catalogue', () => {
	for (let n = 1; n <= 6; n++) {
		const trips = [];
		for (let i = 0; i < n; i++) trips.push(trip(`t${i}`, { f: 3 + (i * 7) % 5, T: 0.5 + (i % 3) * 0.5, att: { x: 1 + i % 3, y: i % 2 } }));
		for (const H of [1, 2, 3]) {
			const day = pickDay(toy(), trips, { H });
			assert.ok(bound(toy(), trips, { H }) >= day.value - 1e-9, `n ${n} H ${H}`);
		}
	}
});

test('Parley: the bar plus the vouchers, not the bar alone', () => {
	const trips = [trip('a', { f: 10, P: 80 }), trip('b', { f: 9, P: 60 })];
	assert.equal(pickDay(toy(), trips, { H: 3 }).value, 19);        // 140 ≤ 100 + 50
	const I = toy(); I.budgets.vouchers = null;
	assert.equal(pickDay(I, trips, { H: 3 }).value, 10);            // 140 > 100
});

test('the storage, the Market and a drop before a load', () => {
	const t1 = trip('a', { f: 10, loads: { H: { A: 4 } } });
	const t2 = trip('b', { f: 9, loads: { H: { A: 4 } } });           // 8 > the 5 in storage
	assert.deepEqual(pickDay(toy(), [t1, t2], { H: 3 }).trips.map(t => t.id), ['a']);
	const t3 = trip('c', { f: 1, drops: { H: { A: 3 } }, T: 0.1 });   // leaves 3 more at home
	assert.deepEqual(pickDay(toy(), [t1, t2, t3], { H: 3 }).trips.map(t => t.id), ['a', 'c', 'b'], 'the drop sailed before the load it feeds');
	const b1 = trip('d', { f: 10, buys: { A: 6 } }), b2 = trip('e', { f: 9, buys: { A: 6 } });  // cap 10
	assert.deepEqual(pickDay(toy(), [b1, b2], { H: 3 }).trips.map(t => t.id), ['d']);
});

test('no good dropped at the same wharf by two trips', () => {
	const t1 = trip('a', { f: 10, drops: { H: { B: 1 } } });
	const t2 = trip('b', { f: 9, drops: { H: { B: 1 } } });
	const t3 = trip('c', { f: 8, drops: { D: { B: 1 } } });
	assert.deepEqual(pickDay(toy(), [t1, t2, t3], { H: 3 }).trips.map(t => t.id), ['a', 'c']);
});

test('the first trip leaves from where the ship is; a trip from a depot follows one that ends there or pays the leg', () => {
	assert.equal(legHours(toy(), 'H', 'D'), 1);
	const a = trip('a', { f: 10, T: 1, to: 'D' });
	const b = trip('b', { f: 9, T: 1, from: 'D', to: 'H' });
	const c = trip('c', { f: 9, T: 1, from: 'D', to: 'H' });
	assert.deepEqual(pickDay(toy(), [a, b], { H: 2 }).trips.map(t => t.id), ['a', 'b']);
	// b alone would need the hour from the start (at H) to D: 2 h for 9.
	assert.deepEqual(pickDay(toy(), [b], { H: 2 }).trips.map(t => t.id), ['b']);
	assert.deepEqual(pickDay(toy(), [b], { H: 1.5 }).trips, []);
	// Two trips from D after one to D: the second pays the leg H → D again.
	assert.deepEqual(pickDay(toy(), [a, b, c], { H: 3 }).trips.map(t => t.id), ['a', 'b']);
});

test('nothing fits: an empty day, not an error', () => {
	assert.deepEqual(pickDay(toy(), [trip('a', { f: 10, T: 3 })], { H: 2 }), { value: 0, trips: [], bound: 0, nodes: 1 });
});
