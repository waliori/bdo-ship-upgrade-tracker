// The trip planner end to end: trips built, the day chosen, laid as one
// plan and judged by the simulator -- never by its own labels.
//
// What can go wrong: a day whose figures are the labels' and not the
// plan's; a board that pays nothing crashing the planner; a day over the
// session; a plan with a waste or a starved leg; two runs differing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { solve, layDay } from '../js/rpit/method.js';
import { buildTrips } from '../js/rpit/trips.js';
import { robustEval } from '../js/rpit/common.js';
import { simulate, planPolicy } from '../js/rpit/simulate.js';
import { validatePlan } from '../tools/rpit/schema.mjs';
import { setupOf } from '../tools/rpit/setup.mjs';
import { tinyOf } from '../tools/rpit/tiny.mjs';
import * as exact from '../tools/rpit/solvers/exact.mjs';
import * as greedy from '../tools/rpit/solvers/greedy.mjs';

const hand = () => ({
	name: 'hand',
	goods: { Land: { level: 0, w: 1, p: 0, b: 10, cap: null }, L1: { level: 1, w: 100, p: 0, b: 0, cap: null }, L2: { level: 2, w: 400, p: 0, b: 0, cap: null }, L3: { level: 3, w: 900, p: 1000000, b: 0, cap: null } },
	stations: [
		{ id: 's1', in: 'Land', q: 10, out: 'L1', ymin: 1, ymax: 1, p: 0.5, m: 10, c: 1 },
		{ id: 's2', in: 'L1', q: 1, out: 'L2', ymin: 2, ymax: 3, p: 0.5, m: 10, c: 1 },
		{ id: 's3', in: 'L2', q: 2, out: 'L3', ymin: 1, ymax: 1, p: 0.5, m: 10, c: 1 }
	],
	depots: [{ id: 'H', storage: {} }, { id: 'D', storage: {} }],
	start: { id: 'start', x: 0, y: 0 },
	travel: { points: ['start', 'H', 'D', 's1', 's2', 's3'], matrix: [[0, 100, 2000, 1000, 2000, 2000], [100, 0, 2000, 2000, 2000, 1000], [2000, 2000, 0, 2000, 2000, 2000], [1000, 2000, 2000, 0, 1000, 2000], [2000, 2000, 2000, 1000, 0, 1000], [2000, 1000, 2000, 2000, 1000, 0]] },
	service: { station: 45, depot: 120 },
	vehicle: { Wfree: 100000, Wdeal: 100000, Wmax: 100000, speed: 10, slowAtMax: 0.5 },
	budgets: { P: 1000, H: null },
	initial: { hold: {}, floors: {} },
	rules: { pace: 'full', dropPolicy: 'any', home: 'H', end: 'H' },
	objective: 'silver_per_hour',
	meta: {}
});
const real = () => setupOf({ layout: '25', start: 'Iliya Island', hold: 20000, pace: 'fast', storage: 'auto' }).instance;
const small = { most: 80, grow: 12, near: 4 };

test('the hand board: the one climb, as the exact search has it', () => {
	const out = solve(hand(), { session: 0 });
	assert.deepEqual(validatePlan(out.plan, hand()), []);
	assert.equal(out.R, 10 * 1000000 - 1000);
	assert.equal(out.info.R, out.R);
	assert.equal(out.info.trips.length, 1);
});

test('a board that pays nothing: an empty day, not an error', () => {
	const I = hand();
	I.goods.L3.p = 0;
	const out = solve(I, { session: 2 });
	assert.equal(out.R, 0);
	assert.deepEqual(out.plan.visits, [{ at: 'H', sell: 'spare', drop: 'spare' }]);
	assert.deepEqual(out.info.trips, []);
});

test('a session shorter than any trip: an empty day', () => {
	const out = solve(hand(), { session: 0.01 });
	assert.equal(out.R, 0);
	assert.deepEqual(out.info.trips, []);
});

test('the figures are the plan\'s own, and the plan is sailable: inside the session, fed, nothing wasted', () => {
	const I = real();
	for (const session of [2, 4]) {
		const out = solve(I, { session, ...small });
		assert.deepEqual(validatePlan(out.plan, I), []);
		const r = simulate(I, planPolicy(out.plan), { mode: 'robust' });
		assert.equal(out.R, r.R);
		assert.equal(out.info.R, r.R);
		assert.ok(r.underWay <= session + 1e-9, `${r.underWay} h under way in ${session}`);
		assert.equal(r.deviations.starved || 0, 0);
		assert.equal(r.pointless.storedTwice + r.pointless.loadThenDrop, 0);
		assert.ok(out.info.bound >= out.R - 1e-6, 'the bound is never below the day');
		assert.ok(out.R > 0);
	}
});

test('the laid day is the sum of its trips when nothing crosses between them', () => {
	const I = real();
	const trips = buildTrips(I, { ...small, session: 4 });
	const one = trips[0];
	const plan = layDay(I, [one]);
	assert.equal(robustEval(I, plan, 0).R, one.R);
});

test('never below greedy, never above the exact search on a tiny cut', () => {
	const I = tinyOf(real(), { chains: 2, rungs: 3 });
	assert.ok(I);
	const e = exact.solve(I, { timeMs: 10000 });
	const g = greedy.solve(I, { timeMs: 300 });
	const m = solve(I, { session: 0 });
	const rate = p => { const r = simulate(I, planPolicy(p), { mode: 'robust' }); return r.T > 0 ? r.R / r.T : 0; };
	assert.ok(e.info.optimal);
	assert.ok(rate(m.plan) >= rate(g.plan) - 1e-6, `${rate(m.plan)} < greedy ${rate(g.plan)}`);
	assert.ok(rate(m.plan) <= rate(e.plan) + 1e-6, `${rate(m.plan)} > exact ${rate(e.plan)}`);
});

test('no session: the best an hour, found by the price of time', () => {
	const I = real();
	const out = solve(I, { session: 0, ...small });
	const r = simulate(I, planPolicy(out.plan), { mode: 'robust' });
	assert.ok(r.T > 0 && r.R / r.T > 0);
	const long = solve(I, { session: 6, ...small });
	assert.ok(r.R / r.T >= long.R / long.T - 1e-6, 'the rate plan earns at least the six-hour plan\'s rate');
});

test('the same board gives the same plan twice', () => {
	const I = real();
	assert.equal(JSON.stringify(solve(I, { session: 3, ...small }).plan), JSON.stringify(solve(I, { session: 3, ...small }).plan));
});

test('the stock goal: a day judged on what it fills', () => {
	const I = real();
	const home = I.depots.find(d => d.id === I.rules.home).storage;
	I.rules.stock = { kind: 'fill', targets: { 1: 40, 2: 40, 3: 40, 4: 40, 5: 20, 6: 20 }, held: { ...home } };
	const out = solve(I, { session: 4, ...small });
	const e = robustEval(I, out.plan, 0);
	assert.ok(e.fill > 0, 'something filled');
	assert.equal(out.f, e.f);
});
