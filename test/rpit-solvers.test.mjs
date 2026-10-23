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

test('a thin ladder under a floor: the shortfall made before the rung above spends, so the climb is not starved', () => {
	// Four [Level 3]s take eight [Level 2]s; a floor of five [Level 2]s
	// with none owned is filled first: thirteen, seven attempts paying two.
	const I = hand();
	I.stations[2].m = 4;
	I.initial.floors = { L2: 5 };
	assert.deepEqual(thinLadder(I, ['s1', 's2', 's3']), [7, 7, 4]);
	const laid = finish(I, ['s1', 's2', 's3'].map((at, k) => ({ at, a: [7, 7, 4][k] })), 0);
	const r = simulate(I, planPolicy(laid.plan), { mode: 'robust' });
	assert.equal(r.deviations.starved || 0, 0);
	assert.equal(r.log.filter(e => e.kind === 'station' && e.at === 's3').reduce((a, e) => a + e.a, 0), 4);
	// Three in the storage: only the two short are made on top.
	I.depots[0].storage = { L2: 3 };
	assert.deepEqual(thinLadder(I, ['s1', 's2', 's3']), [5, 5, 4]);
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

test('a trace says how the plan was found: the starts, every step, the weights, the end', () => {
	const { instance: I } = setupOf({ layout: '25', start: 'Velia', hold: 20000, pace: 'full' });
	const trace = [];
	const out = alns.search(I, { mu: 0, timeMs: Infinity, most: 60, seed: 2, trace });
	const of = k => trace.filter(e => e.k === k);
	assert.equal(of('start').length, 1);
	assert.equal(of('step').length, 60);
	assert.equal(of('weights').length, 1);
	assert.equal(of('end').length, 1);
	assert.equal(of('end')[0].f, out.f);
	// The best never falls, and ends where the search ends.
	let last = -Infinity;
	for (const e of of('step')) { assert.ok(e.best >= last - 1e-9); last = e.best; }
	assert.ok(of('step').every(e => typeof e.op === 'string' && typeof e.rep === 'string' && Number.isFinite(e.f)));
	// Without a trace asked for, nothing is written and the plan is the same.
	assert.deepEqual(alns.search(I, { mu: 0, timeMs: Infinity, most: 60, seed: 2 }).plan, out.plan);
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

test('refills for a fixed route: the fastest set that keeps the ship fed, two in a row where a leg needs them', async () => {
	const { refuel, rationPass } = await import('../js/rpit/common.js');
	// At ten metres a second and six a minute the ship eats 0.01 a metre:
	// a pool of six lasts 600 m. s1 → s2 is 1 000 m; two supply wharves lie
	// on the way, A 350 m from s1, B 350 m from s2, 300 m apart.
	const I = hand();
	I.vehicle.rations = { full: 6, perMinute: 6, perMinuteOver: 6, reserve: 0 };
	I.supplies = [{ id: 'A' }, { id: 'B' }];
	const pts = [...I.travel.points, 'A', 'B'];
	const near = { 'A,s1': 350, 'A,s2': 650, 'B,s1': 650, 'B,s2': 350, 'A,B': 300 };
	const far = (a, b) => near[[a, b].sort().join()] ?? 3000;
	I.travel = { points: pts, matrix: pts.map((a, i) => pts.map((b, j) => (i === j ? 0 : i < 6 && j < 6 ? I.travel.matrix[i][j] : far(a, b)))) };
	// The other legs short: start → s1 200 m (2, leaving 4 -- enough for
	// A at 3.5), and from B on 350 + 100 + 100 m (5.5) to the end.
	const set = (a, b, d) => { const x = pts.indexOf(a), y = pts.indexOf(b); I.travel.matrix[x][y] = I.travel.matrix[y][x] = d; };
	set('start', 's1', 200); set('s2', 's3', 100); set('s3', 'H', 100);
	const plan = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 's2', a: 10 }, { at: 's3', a: 10 }, { at: 'H', sell: 'all' }] };
	const fed = refuel(I, plan);
	assert.deepEqual(fed.visits.map(v => v.at), ['s1', 'A', 'B', 's2', 's3', 'H'], 'one call is not enough: s1 → A → s2 eats 6.5');
	assert.equal(simulate(I, planPolicy(fed), { mode: 'robust' }).deviations.starved, 0);
	// The quick pass, which never puts two calls together, cannot feed it.
	assert.ok(simulate(I, planPolicy(rationPass(I, plan, { chain: false })), { mode: 'robust' }).deviations.starved > 0);
});

test('a session of so many hours: the plan stays inside it, and earns more than the best hour alone', () => {
	const { instance: I } = setupOf({ layout: '25', start: 'Velia', hold: 20000, pace: 'full' });
	const free = alns.solve(I, { timeMs: 400, seed: 3 });
	const T0 = simulate(I, planPolicy(free.plan), { mode: 'robust' }).T;
	const J = { ...I, rules: { ...I.rules, hours: T0 * 2 } };
	const { plan } = alns.search(J, { mu: 0, timeMs: 600, seed: 3 });
	const r = simulate(J, planPolicy(plan), { mode: 'robust' });
	// The session is hours under way, as the sailor's order counts them.
	assert.ok(r.underWay <= T0 * 2 + 1e-6, `${r.underWay} h under way > ${T0 * 2} h`);
	assert.ok(r.R >= simulate(I, planPolicy(free.plan), { mode: 'robust' }).R - 1e-6);
});

test('counted in steps, not milliseconds: the same board gives the same plan twice', () => {
	const { instance: I } = setupOf({ layout: '25', start: 'Velia', hold: 20000, pace: 'fast' });
	const J = { ...I, rules: { ...I.rules, hours: 4 } };
	const a = alns.search(J, { mu: 0, timeMs: Infinity, most: 15, seed: 1 });
	const b = alns.search(J, { mu: 0, timeMs: Infinity, most: 15, seed: 1 });
	assert.equal(a.iterations, 15);
	assert.deepEqual(a.plan, b.plan);
});

test('refills reckon each leg as the simulator times it, lag and all', async () => {
	const { refuel } = await import('../js/rpit/common.js');
	// The hand board's refuel case with three seconds of lag a leg: s1 → A
	// eats 3.5 and the lag 0.3, more than the 3.7 left after the first leg.
	// A planner blind to the lag lays s1 → A → B → s2 and the ship starves.
	const I = hand();
	I.vehicle.rations = { full: 6, perMinute: 6, perMinuteOver: 6, reserve: 0 };
	I.service = { ...I.service, leg: 3 };
	I.supplies = [{ id: 'A' }, { id: 'B' }];
	const pts = [...I.travel.points, 'A', 'B'];
	const near = { 'A,s1': 350, 'A,s2': 650, 'B,s1': 650, 'B,s2': 350, 'A,B': 300 };
	const far = (a, b) => near[[a, b].sort().join()] ?? 3000;
	I.travel = { points: pts, matrix: pts.map((a, i) => pts.map((b, j) => (i === j ? 0 : i < 6 && j < 6 ? I.travel.matrix[i][j] : far(a, b)))) };
	const set = (a, b, d) => { const x = pts.indexOf(a), y = pts.indexOf(b); I.travel.matrix[x][y] = I.travel.matrix[y][x] = d; };
	set('start', 's1', 200); set('s2', 's3', 100); set('s3', 'H', 100);
	const plan = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 's2', a: 10 }, { at: 's3', a: 10 }, { at: 'H', sell: 'all' }] };
	const fed = refuel(I, plan);
	assert.notDeepEqual(fed.visits.map(v => v.at), ['s1', 'A', 'B', 's2', 's3', 'H'], 'the lag makes s1 → A one ration too far');
});
