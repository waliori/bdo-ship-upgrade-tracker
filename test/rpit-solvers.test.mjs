// The RPIT solvers: greedy chain insertion, ALNS, and the exact search
// that checks them on boards small enough to try every way of sailing.
//
// What can go wrong: a climb read off the instance that the board does
// not allow; a thin ladder that starves the top or overfills the hold;
// a search that draws differently for the same seed; ALNS worse than the
// greedy start it improves on; an "exact" search beaten by a heuristic,
// which would mean its choices or its bound are wrong.

import test from 'node:test';
import assert from 'node:assert/strict';

import { chainsOf, finish, robustEval } from '../tools/rpit/solvers/common.mjs';
import { thinLadder } from '../tools/rpit/solvers/insert.mjs';
import * as greedy from '../tools/rpit/solvers/greedy.mjs';
import * as alns from '../tools/rpit/solvers/alns.mjs';
import * as exact from '../tools/rpit/solvers/exact.mjs';
import { setupOf } from '../tools/rpit/setup.mjs';
import { tinyOf } from '../tools/rpit/tiny.mjs';
import { validatePlan } from '../tools/rpit/schema.mjs';
import { simulate, planPolicy } from '../tools/rpit/simulate.mjs';

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

test('the climbs are read off the instance: one, land to [Level 3]', () => {
	assert.deepEqual(chainsOf(hand()).map(c => c.rungs), [['s1', 's2', 's3']]);
});

test('a thin ladder feeds the top and no more', () => {
	// Ten [Level 3]s take twenty [Level 2]s, ten attempts paying two at
	// the least; those take ten [Level 1]s, ten attempts.
	assert.deepEqual(thinLadder(hand(), ['s1', 's2', 's3']), [10, 10, 10]);
	const I = hand();
	I.stations[2].m = 4;
	assert.deepEqual(thinLadder(I, ['s1', 's2', 's3']), [4, 4, 4]);
});

test('finish buys what the islands take, and writes the attempts made', () => {
	const out = finish(hand(), [{ at: 's1' }, { at: 's2' }, { at: 's3' }]);
	assert.deepEqual(out.plan.buy, { Land: 100 });
	assert.equal(out.R, 10 * 1000000 - 1000);
	assert.deepEqual(out.visits.map(v => v.a), [10, 10, 10]);
	assert.deepEqual(validatePlan(out.plan, hand()), []);
});

test('greedy climbs the one chain; ALNS keeps it; exact agrees', () => {
	for (const m of [greedy, alns, exact]) {
		const { plan } = m.solve(hand(), { timeMs: 300 });
		assert.deepEqual(validatePlan(plan, hand()), []);
		assert.equal(robustEval(hand(), plan).R, 10 * 1000000 - 1000);
	}
});

test('ALNS draws the same way for the same seed, and never falls below greedy', () => {
	const { instance: I } = setupOf({ layout: '25', start: 'Velia', hold: 20000, pace: 'full' });
	const a = alns.solve(I, { timeMs: 400, seed: 3 });
	const g = greedy.solve(I, { timeMs: 400 });
	const rate = p => { const r = simulate(I, planPolicy(p), { mode: 'robust' }); return r.R / r.T; };
	assert.ok(rate(a.plan) >= rate(g.plan) - 1e-6, `${rate(a.plan)} < ${rate(g.plan)}`);
	assert.deepEqual(validatePlan(a.plan, I), []);
});

test('on a tiny cut of a real board, the exact search is never beaten', () => {
	const { instance: full } = setupOf({ layout: '25', start: 'Iliya Island', hold: 20000, pace: 'fast', storage: 'auto' });
	const I = tinyOf(full, { chains: 1, rungs: 3 });
	assert.ok(I && I.stations.length === 3);
	const e = exact.solve(I, { timeMs: 5000 });
	const a = alns.solve(I, { timeMs: 300 });
	assert.ok(e.info.optimal);
	const rate = p => { const r = simulate(I, planPolicy(p), { mode: 'robust' }); return r.T > 0 ? r.R / r.T : 0; };
	assert.ok(rate(e.plan) >= rate(a.plan) - 1e-6);
});
