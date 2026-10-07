// The simulator every RPIT solver is judged by, on a board small enough
// to work out by hand: a land good becomes a [Level 1], two of those
// pay two or three [Level 2]s, two [Level 2]s make a [Level 3] that a
// wharf buys.
//
// What can go wrong: a plan scored at a different figure than the game
// gives; the same seed drawing differently twice; an island dealing
// with a ship over its ceiling, or an attempt ending past the hull's
// limit; the Parley or a floor overspent; a drop allowed where the
// rules forbid it; a pointless action not counted.

import test from 'node:test';
import assert from 'node:assert/strict';

import { simulate, evaluate, planPolicy } from '../tools/rpit/simulate.mjs';
import { validateInstance, validatePlan } from '../tools/rpit/schema.mjs';

const tiny = (over = {}) => {
	const I = {
		name: 'tiny',
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
		depots: [{ id: 'H', storage: { L2: 5 } }, { id: 'D', storage: {} }],
		start: { id: 'start', x: 0, y: 0 },
		// start, H, D, s1, s2, s3: a line of one-kilometre legs, and
		// two kilometres anywhere else.
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
	};
	return { ...I, ...over, vehicle: { ...I.vehicle, ...(over.vehicle || {}) }, rules: { ...I.rules, ...(over.rules || {}) } };
};
const climb = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 's2', a: 10 }, { at: 's3', a: 10 }, { at: 'H', sell: 'all' }] };

test('the hand-made board is a valid instance, and the climb a valid plan', () => {
	assert.deepEqual(validateInstance(tiny()), []);
	assert.deepEqual(validatePlan(climb, tiny()), []);
	assert.ok(validatePlan({ visits: [{ at: 's1', a: 11 }, { at: 's1', a: 1 }] }, tiny()).length >= 3, 'too many attempts, a station twice, no depot at the end');
});

test('robust: the climb scores what it scores on paper', () => {
	const r = simulate(tiny(), planPolicy(climb), { mode: 'robust' });
	// Ten [Level 1]s, twenty [Level 2]s counted at the least, ten [Level 3]s
	// sold for ten million, less the hundred land goods at ten each.
	assert.equal(r.trades, 30);
	assert.equal(r.R, 10 * 1000000 - 100 * 10);
	// Four legs of a kilometre at ten metres a second, three islands and one call.
	assert.ok(Math.abs(r.T - (400 + 3 * 45 + 120) / 3600) < 1e-9);
	assert.equal(r.calls, 1);
	assert.equal(r.P, 30);
	assert.deepEqual(r.pointless, { loadThenDrop: 0, idleCalls: 0, consecutiveCalls: 0, emptyVisits: 0 });
});

test('sample: an island pays the same at every attempt, drawn once for the board', () => {
	const I = tiny();
	for (const seed of [1, 2, 3, 4, 5, 6]) {
		const r = simulate(I, planPolicy(climb), { mode: 'sample', seed });
		assert.equal(new Set(r.log[2].Y).size, 1);
		assert.equal(r.log[2].Y.length, 10);
	}
});

test('sample: scenario k is the same board whatever order it is sailed in', () => {
	// Two islands paying two or three, visited in either order: each is
	// seen to pay the same in both runs.
	const I = tiny({ stations: [...tiny().stations, { id: 's4', in: 'L1', q: 1, out: 'L2', ymin: 2, ymax: 3, p: 0.5, m: 10, c: 1 }] });
	I.travel = { points: [...I.travel.points, 's4'], matrix: [...I.travel.matrix.map(r => [...r, 2000]), [...I.travel.points.map(() => 2000), 0]] };
	const a = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 's2', a: 5 }, { at: 's4', a: 5 }, { at: 'H' }] };
	const b = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 's4', a: 5 }, { at: 's2', a: 5 }, { at: 'H' }] };
	for (const seed of [1, 2, 3, 4]) {
		const ra = simulate(I, planPolicy(a), { mode: 'sample', seed }), rb = simulate(I, planPolicy(b), { mode: 'sample', seed });
		const paid = r => Object.fromEntries(r.log.filter(e => e.kind === 'station').map(e => [e.at, e.Y[0]]));
		assert.deepEqual(paid(ra), paid(rb));
	}
});

test('sample: an island that pays two leaves room a pessimist would not use', () => {
	// 4500 limit: robust weighs each [Level 2] attempt at three and stops
	// at three; on a board that pays two, the sailor sees it and goes on.
	const I = tiny({ vehicle: { Wfree: 4500, Wdeal: 4500, Wmax: 4500 }, stations: tiny().stations.map(s => ({ ...s, p: 0 })) });
	assert.equal(simulate(I, planPolicy(climb), { mode: 'robust' }).log[2].a, 3);
	// 1000 aboard, 2 × 400 − 100 an attempt: five end exactly at the limit.
	assert.equal(simulate(I, planPolicy(climb), { mode: 'sample', seed: 1 }).log[2].a, 5);
});

test('sample: the same seed draws the same yields, another seed others', () => {
	const I = tiny();
	const a = simulate(I, planPolicy(climb), { mode: 'sample', seed: 7 });
	const b = simulate(I, planPolicy(climb), { mode: 'sample', seed: 7 });
	assert.deepEqual(a.log.map(e => e.Y), b.log.map(e => e.Y));
	const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map(s => simulate(I, planPolicy(climb), { mode: 'sample', seed: s }).log[2].Y.join(''));
	assert.ok(new Set(seeds).size > 1);
});

test('sample with p = 1 pays the most every time, with p = 0 the least', () => {
	const at = p => tiny({ stations: tiny().stations.map(s => ({ ...s, p })) });
	const hi = simulate(at(1), planPolicy(climb), { mode: 'sample', seed: 3 });
	const lo = simulate(at(0), planPolicy(climb), { mode: 'sample', seed: 3 });
	assert.ok(hi.log[2].Y.every(y => y === 3));
	assert.ok(lo.log[2].Y.every(y => y === 2));
	// Thirty [Level 2]s make fifteen [Level 3]s, but the island deals ten.
	assert.equal(hi.R, lo.R);
	assert.ok(hi.carried === 0 && hi.log[4].sold.L3 === 10);
});

test('an island will not deal with a ship over its ceiling', () => {
	const I = tiny({ vehicle: { Wfree: 3000, Wdeal: 4000, Wmax: 5000 }, initial: { hold: { L3: 5 }, floors: {} } });
	const r = simulate(I, planPolicy(climb), { mode: 'robust' });
	// Nothing aboard ever comes off, so every island says no.
	assert.equal(r.deviations.refusedOverDeal, 3);
	assert.ok([1, 2, 3].every(k => r.log[k].a === 0));
	// And sails slower for the weight: the first leg at 4500 of a 3000-5000 band.
	assert.ok(r.log[1].time > (1000 / (10 * 0.625) + 45) / 3600 - 1e-9);
});

test('attempts stop where the next might end past the hull limit', () => {
	const I = tiny({ vehicle: { Wfree: 4500, Wdeal: 4500, Wmax: 4500 } });
	const r = simulate(I, planPolicy(climb), { mode: 'robust' });
	// 1000 aboard after the [Level 1]s; each [Level 2] attempt may add 3 × 400 − 100.
	assert.equal(r.log[2].a, 3);
	assert.equal(r.deviations.clampedAttempts >= 1, true);
	assert.ok(r.log.every(e => e.W <= 4500 + 1e-9));
});

test('the Parley and the floors are never overspent', () => {
	const poor = simulate(tiny({ budgets: { P: 5, H: null } }), planPolicy(climb), { mode: 'robust' });
	assert.equal(poor.log[1].a, 5);
	assert.equal(poor.P, 5);
	const kept = simulate(tiny({ initial: { hold: {}, floors: { L1: 8 } } }), planPolicy(climb), { mode: 'robust' });
	assert.equal(kept.log[2].a, 2, 'ten made, eight kept back');
});

test('a drop away from home is refused when the rules keep goods at home only', () => {
	const plan = { load: { L2: 5 }, visits: [{ at: 'D', drop: { L2: 5 } }, { at: 'H' }] };
	const any = simulate(tiny(), planPolicy(plan), { mode: 'robust' });
	const home = simulate(tiny({ rules: { dropPolicy: 'home_only' } }), planPolicy(plan), { mode: 'robust' });
	assert.equal(any.deviations.refusedDrop, 0);
	assert.equal(home.deviations.refusedDrop, 1);
	// Loaded at home before casting off, left at the first call: for nothing.
	assert.equal(any.pointless.loadThenDrop, 1);
	// And the call home after it did nothing, straight after another call.
	assert.equal(any.pointless.idleCalls, 1);
	assert.equal(any.pointless.consecutiveCalls, 1);
});

test('an island sailed to that deals nothing is a pointless stop', () => {
	// The [Level 3] island before any [Level 2] is made: nothing to give it.
	const plan = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 's3', a: 5 }, { at: 's2', a: 10 }, { at: 'H', sell: 'all' }] };
	const r = simulate(tiny(), planPolicy(plan), { mode: 'robust' });
	assert.equal(r.log[2].a, 0);
	assert.equal(r.pointless.emptyVisits, 1);
});

test('a spare drop leaves what the visits ahead will not take, whatever the yields', () => {
	const plan = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 's2', a: 10 }, { at: 'D', drop: 'spare' }, { at: 's3', a: 4 }, { at: 'H', sell: 'all' }] };
	assert.deepEqual(validatePlan(plan, tiny()), []);
	for (const seed of [1, 2, 3]) {
		const r = simulate(tiny(), planPolicy(plan), { mode: 'sample', seed });
		const made = r.log[2].Y.reduce((a, y) => a + y, 0);
		assert.equal(r.log[3].dropped.L2, made - 8, 'four attempts ahead take eight');
		assert.equal(r.log[4].a, 4);
	}
});

test('evaluate: the rate of means, and a robust run beside the sampled ones', () => {
	const r = evaluate(tiny(), planPolicy(climb), { scenarios: 20, seed: 1, solver: 'hand' });
	assert.equal(r.scenarios, 20);
	assert.ok(Math.abs(r.rateOfMeans - r.mean.R / r.mean.T) < 1e-6);
	assert.equal(r.robust.R, 10 * 1000000 - 1000);
	assert.equal(r.solver, 'hand');
});

test('a wharf loads to the hold limit and no further; only exchanges go past it', () => {
	// 4 000 LT limit: of twenty [Level 2]s at 400 waiting at home, ten fit.
	const I = tiny({ vehicle: { Wfree: 4000, Wdeal: 6800, Wmax: 6800 } });
	I.depots[0].storage = { L2: 20 };
	const plan = { load: { L2: 20 }, visits: [{ at: 's3', a: 10 }, { at: 'H', sell: 'all' }] };
	const r = simulate(I, planPolicy(plan), { mode: 'robust' });
	assert.equal(r.log[0].loaded.L2, 10);
	assert.equal(r.deviations.refusedLoad, 1);
});

test('a hold of few slots takes no more of what does not stack', () => {
	// [Level 3] made not to stack, five slots: ten attempts would need ten.
	const I = tiny({ vehicle: { slots: 5 } });
	I.goods.L3 = { ...I.goods.L3, level: 5, stack: false };
	const r = simulate(I, planPolicy(climb), { mode: 'robust' });
	// L2 stacks in one slot; each [Level 3] takes its own.
	assert.equal(r.log[3].a, 4);
	assert.equal(r.log[3].why, 'slots');
});

test('rations: sailing eats the pool, a wharf fills it, running dry is counted', () => {
	// 10 m/s, four one-kilometre legs: 400 s of sailing.
	const rations = { full: 100, perMinute: 6, perMinuteOver: 3, reserve: 0.1 };
	const r = simulate(tiny({ vehicle: { rations } }), planPolicy(climb), { mode: 'robust' });
	assert.ok(Math.abs(r.eaten - 40) < 1e-6, `${r.eaten}`);
	assert.equal(r.deviations.starved, 0);
	assert.equal(r.refills, 1, 'the call at the end fills it');
	// A pool too small for the run runs dry on the way.
	const dry = simulate(tiny({ vehicle: { rations: { ...rations, full: 15 } } }), planPolicy(climb), { mode: 'robust' });
	assert.ok(dry.deviations.starved >= 1);
	// A call for supplies on the way fills it again: s1 → D (supplies) → s2.
	const I = tiny({ vehicle: { rations: { ...rations, full: 30 } } });
	I.supplies = [{ id: 'S' }];
	I.travel = { points: [...I.travel.points, 'S'], matrix: [...I.travel.matrix.map((row, i) => [...row, i === 3 || i === 4 ? 500 : 2000]), [2000, 2000, 2000, 500, 500, 2000, 0]] };
	const plan = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 'S' }, { at: 's2', a: 10 }, { at: 's3', a: 10 }, { at: 'H', sell: 'all' }] };
	const fed = simulate(I, planPolicy(plan), { mode: 'robust' });
	assert.equal(fed.log[2].kind, 'supply');
	assert.equal(fed.deviations.starved, 0);
	assert.equal(fed.pointless.idleCalls, 0, 'a call that filled the pool did something');
});

test('vouchers: a quarter of a bar each, drawn when the island asks for more than the bar holds, two hours apart', () => {
	const stations = tiny().stations.map(s => ({ ...s, c: s.id === 's3' ? 200 : 0 }));
	const plan = { buy: { Land: 100 }, visits: [{ at: 's1', a: 10 }, { at: 's2', a: 10 }, { at: 's3', a: 3 }, { at: 'H', sell: 'all' }] };
	// A bar of 300 pays one attempt; no vouchers, one it is.
	const bare = simulate(tiny({ stations, budgets: { P: 300, H: null } }), planPolicy(plan), { mode: 'robust' });
	assert.equal(bare.log[3].a, 1);
	// Two vouchers of 250: the first goes in at once (550), the second only
	// after its two-hour cooldown, the ship waiting at the island (800).
	const I = tiny({ stations, budgets: { P: 300, H: null, vouchers: { n: 2, each: 250, max: 1000, cooldownH: 2 } } });
	const r = simulate(I, planPolicy(plan), { mode: 'robust' });
	assert.equal(r.log[3].a, 3);
	assert.equal(r.vouchersUsed, 2);
	assert.ok(Math.abs(r.waited - 2) < 1e-9, `${r.waited} h waited`);
	assert.ok(Math.abs(r.T - bare.T - 2) < 1e-6);
	// A bar too full for a whole quarter draws none.
	const full = simulate(tiny({ stations, budgets: { P: 900, H: null, vouchers: { n: 2, each: 250, max: 1000, cooldownH: 2 } } }), planPolicy({ ...plan, visits: plan.visits.map(v => (v.at === 's3' ? { at: 's3', a: 5 } : v)) }), { mode: 'robust' });
	assert.equal(full.vouchersUsed, 0);
	assert.equal(full.log[3].a, 4);
});
