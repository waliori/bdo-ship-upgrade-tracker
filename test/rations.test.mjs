// The pool over a route: the arithmetic behind the Rations tile.

import test from 'node:test';
import assert from 'node:assert/strict';
import { drainRate, drainOver, legRations, rationPlan, calibrateRations, rateRange, fmtRations, fmtRationRange, rationsOver, perMinute, hullTick, TICK_SECONDS, BREEZY_RATIONS, BREEZY_EVERY, RATION_RESERVE } from '../js/rations.js';

test('a tick takes the hull and every appetite aboard, as the pool was watched falling', () => {
	// An Advance with its full crew read 3,050 a tick: 1,200 the hull,
	// 1,150 the main seats, 700 the cabins (four 150s and a 100).
	assert.equal(hullTick('Carrack (Advance)').n + 1150 + 700, 3050);
	assert.deepEqual(hullTick('Carrack (Volante)'), { n: 1200, measured: true });
	// The Bartali read 1,500 with 250 of appetite aboard; its own take is
	// the rest, and nobody has read it bare.
	assert.deepEqual(hullTick('Bartali Sailboat'), { n: 1250, measured: false });
	// Balance and Valor are taken at the Advance's figure, unread.
	assert.deepEqual(hullTick('Carrack (Balance)'), { n: 1200, measured: false });
	// A hull nobody has read is a Carrack's, and says so.
	assert.equal(hullTick('Epheria Galleass').measured, false);
	// A minute is 60/7 ticks.
	assert.equal(TICK_SECONDS, 7);
	assert.equal(Math.round(rationsOver(70, { tick: 3050 })), 30_500);
	assert.equal(Math.round(perMinute({ tick: 3050 })), Math.round(3050 * 60 / 7));
	// BreezySail kept going: 8,150 a use, one every fifty seconds.
	assert.equal(rationsOver(BREEZY_EVERY * 3 + 1, { tick: 3050, breezy: BREEZY_EVERY }) - rationsOver(BREEZY_EVERY * 3 + 1, { tick: 3050 }), 3 * BREEZY_RATIONS);
	// A leg watched in game: 6 m 58 s from Theonil to Iliya with that
	// crew and BreezySail kept going, the pool 535,400 -> 286,300.
	const leg = rationsOver(418, { tick: 3050, breezy: BREEZY_EVERY });
	assert.ok(Math.abs(leg - 249_100) / 249_100 < 0.05, `${Math.round(leg)} against 249,100`);
	assert.equal(rationsOver(0, { tick: 3050, breezy: 20 }), 0);
});

test('a leg eats the drain over its quick and slow minutes', () => {
	const [lo, hi] = legRations([10, 10], { rate: 1000, measured: true });
	const [rlo, rhi] = rateRange(1000, true);
	assert.equal(lo, rlo * 10);
	assert.equal(hi, rhi * 10);
	// Nonsense minutes eat nothing.
	assert.deepEqual(legRations([NaN, 3], { rate: 1000 }), [0, 0]);
});

test('the plan finds the stop after which the pool runs below the reserve, at the slow end', () => {
	// Four legs of 20 minutes at 1,000 a minute ±15%: the slow end eats
	// 23,000 a leg. A 100,000 pool with a 10% reserve is below 10,000
	// after the fourth leg (100 - 92 = 8k) and not before (100 - 69 = 31k).
	const p = rationPlan({ legs: [[20, 20], [20, 20], [20, 20], [20, 20]], aboard: 100_000, full: 100_000, rate: 1000, measured: true });
	assert.equal(p.lowAfter, 4);
	assert.equal(Math.round(p.legs[2].left[0]), 31_000);
	assert.equal(Math.round(p.left[0]), 8_000);
	assert.equal(Math.round(p.use[1]), 92_000);
	// With less aboard it comes sooner.
	assert.equal(rationPlan({ legs: [[20, 20], [20, 20], [20, 20]], aboard: 40_000, full: 100_000, rate: 1000, measured: true }).lowAfter, 2);
	// A pool that never dips answers 0.
	assert.equal(rationPlan({ legs: [[5, 5]], aboard: 1_300_000, full: 1_300_000 }).lowAfter, 0);
	// Nothing typed means full.
	assert.equal(rationPlan({ legs: [], full: 1_300_000 }).start, 1_300_000);
});

test('a call for rations fills the pool again and the reckoning goes on from full', () => {
	const p = rationPlan({ legs: [{ minutes: [20, 20], refill: true }, [20, 20], [20, 20], [20, 20]], aboard: 30_000, full: 100_000, rate: 1000, measured: true });
	// The first leg leaves 7k -- low -- and the wharf fills it; three
	// legs from full leave 31k, which is above the reserve.
	assert.equal(p.lowAfter, 1);
	assert.equal(Math.round(p.legs[0].left[0]), 7_000);
	assert.equal(Math.round(p.left[0]), 31_000);
});

test('one watched leg calibrates the drain', () => {
	assert.equal(calibrateRations(61_440, 60), 1024);
	assert.equal(calibrateRations(0, 60), null);
	assert.equal(calibrateRations(100, 0), null);
});

test('a full crew on a Carrack empties its pool in under an hour of sailing', () => {
	const minutes = 1_300_000 / perMinute({ tick: 3050 });
	assert.ok(minutes > 40 && minutes < 60, `${minutes} min`);
	assert.equal(RATION_RESERVE, 0.1);
});

test('ration counts read as a person reads the pool', () => {
	assert.equal(fmtRations(1_300_000), '1.3 M');
	assert.equal(fmtRations(45_000), '45 k');
	assert.equal(fmtRations(812), '812');
	assert.equal(fmtRationRange([40_000, 90_000]), '40–90 k');
	assert.equal(fmtRationRange([900_000, 1_200_000]), '900 k–1.2 M');
	assert.equal(fmtRationRange([1_000, 1_000]), '1 k');
});

test('one drain rule: the watched figure outranks the ticks, and an overweight leg has no BreezySail', () => {
	const drain = { tick: 3050, breezy: BREEZY_EVERY, cal: 0 };
	const ticks = 3050 * 60 / TICK_SECONDS;
	const sail = BREEZY_RATIONS * 60 / BREEZY_EVERY;
	assert.equal(drainRate(drain), ticks + sail);
	assert.equal(drainRate(drain, { overweight: true }), ticks, 'the game will not use BreezySail past the limit');
	assert.equal(drainRate({ ...drain, breezy: 0 }), perMinute({ tick: 3050 }));
	// Watched on this ship: that figure, less BreezySail's share overweight.
	assert.equal(drainRate({ ...drain, cal: 40_000 }), 40_000);
	assert.equal(drainRate({ ...drain, cal: 40_000 }, { overweight: true }), 40_000 - sail);
	assert.equal(drainRate({ ...drain, cal: 20_000 }, { overweight: true }), ticks, 'never below the ticks alone');
	assert.equal(drainOver(120, drain), 2 * drainRate(drain));
	assert.equal(drainOver(0, drain), 0);
	// A leg can carry its own rate into the plan.
	const plan = rationPlan({ legs: [{ minutes: [1, 1], rate: 1000 }, { minutes: [1, 1] }], full: 100_000, rate: 2000 });
	assert.ok(plan.legs[0].use[1] < plan.legs[1].use[0]);
});
