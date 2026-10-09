// The trip planner: one trip laid and labelled, the catalogue grown from
// the climbs, and the labels true to the simulator.
//
// What can go wrong: a label that says more than the trip earns; a trip
// from a depot that still loads at home or starts where the ship is; a
// catalogue that grows without bound or differs between two runs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { tripOf, fromTo } from '../js/rpit/trips.js';
import { indexOf } from '../js/rpit/common.js';
import { thinLadder } from '../js/rpit/insert.js';
import { simulate, planPolicy } from '../js/rpit/simulate.js';
import { setupOf } from '../tools/rpit/setup.mjs';

// The simulator's hand-made board: land → L1 → L2 (two or three) → L3, sold.
const hand = () => ({
	name: 'hand',
	goods: {
		Land: { level: 0, w: 1, p: 0, b: 10, cap: null },
		L1: { level: 1, w: 100, p: 0, b: 0, cap: null },
		L2: { level: 2, w: 400, p: 0, b: 0, cap: null },
		L3: { level: 3, w: 900, p: 1000000, b: 0, cap: null }
	},
	stations: [
		{ id: 's1', in: 'Land', q: 10, out: 'L1', ymin: 1, ymax: 1, p: 0.5, m: 10, c: 1 },
		{ id: 's2', in: 'L1', q: 1, out: 'L2', ymin: 2, ymax: 3, p: 0.5, m: 10, c: 1 },
		{ id: 's3', in: 'L2', q: 2, out: 'L3', ymin: 1, ymax: 1, p: 0.5, m: 10, c: 1 }
	],
	depots: [{ id: 'H', storage: {} }, { id: 'D', storage: {} }],
	start: { id: 'start', x: 0, y: 0 },
	travel: {
		points: ['start', 'H', 'D', 's1', 's2', 's3'],
		matrix: [
			[0, 100, 2000, 1000, 2000, 2000],
			[100, 0, 2000, 2000, 2000, 1000],
			[2000, 2000, 0, 2000, 2000, 2000],
			[1000, 2000, 2000, 0, 1000, 2000],
			[2000, 2000, 2000, 1000, 0, 1000],
			[2000, 1000, 2000, 2000, 1000, 0]
		]
	},
	service: { station: 45, depot: 120 },
	vehicle: { Wfree: 100000, Wdeal: 100000, Wmax: 100000, speed: 10, slowAtMax: 0.5 },
	budgets: { P: 1000, H: null },
	initial: { hold: {}, floors: {} },
	rules: { pace: 'full', dropPolicy: 'any', home: 'H', end: 'H' },
	objective: 'silver_per_hour',
	meta: {}
});
const ladder = I => { const a = thinLadder(I, ['s1', 's2', 's3']); return ['s1', 's2', 's3'].map((at, k) => ({ at, a: a[k] })); };

test('a trip laid from where the ship is: its label is what the simulator says', () => {
	const I = hand();
	const t = tripOf(I, ladder(I), { chainIds: [0] });
	assert.ok(t);
	assert.equal(t.id, '0');
	assert.equal(t.from, 'start');
	assert.equal(t.to, 'H');
	assert.equal(t.R, 10 * 1000000 - 1000);
	assert.deepEqual(t.att, { s1: 10, s2: 10, s3: 10 });
	assert.deepEqual(t.buys, { Land: 100 });
	const r = simulate(I, planPolicy(t.plan), { mode: 'robust' });
	assert.equal(t.R, r.R);
	assert.equal(t.T, r.underWay);
	assert.equal(t.P, r.P);
});

test('a trip from a depot starts there: the leg to its first island is the depot\'s, and the hold is empty', () => {
	const I = hand();
	const J = fromTo(I, 'D', 'H');
	const { dist } = indexOf(J);
	assert.equal(dist('start', 's1'), 2000);
	assert.equal(J.rules.home, 'D');
	assert.equal(J.rules.end, 'H');
	assert.deepEqual(J.initial.hold, {});
	assert.equal(indexOf(I).dist('start', 's1'), 1000, 'the instance given is untouched');
	const t = tripOf(I, ladder(I), { from: 'D', to: 'H', chainIds: [0] });
	assert.ok(t);
	assert.equal(t.from, 'D');
	// 1000 m more on the first leg, at ten metres a second.
	assert.ok(t.T > tripOf(I, ladder(I), { chainIds: [0] }).T);
});

test('a trip that earns nothing is no trip', () => {
	const I = hand();
	I.goods.L3.p = 0;
	assert.equal(tripOf(I, ladder(I), { chainIds: [0] }), null);
});
