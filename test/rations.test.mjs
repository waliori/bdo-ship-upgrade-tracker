// The pool over a route: the arithmetic behind the Rations tile.

import test from 'node:test';
import assert from 'node:assert/strict';
import { legRations, rationPlan, calibrateRations, rateRange, fmtRations, fmtRationRange, DEFAULT_RATION_RATE, RATION_RESERVE } from '../js/rations.js';

test('a leg eats the drain over its minutes plus what the crew eats in that time', () => {
	// A leg of exactly ten minutes at a known rate, no band: the crew's
	// 1,440 a day is one a minute.
	const [lo, hi] = legRations([10, 10], { rate: 1000, measured: true, appetite: 1440 });
	const [rlo, rhi] = rateRange(1000, true);
	assert.equal(lo, rlo * 10 + 10);
	assert.equal(hi, rhi * 10 + 10);
	// The estimate's band is wider than a watched leg's.
	const est = legRations([10, 10], { rate: 1000 });
	assert.ok(est[0] < lo && est[1] > hi);
	// Nonsense minutes eat nothing.
	assert.deepEqual(legRations([NaN, 3]), [0, 0]);
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

test('one watched leg calibrates the drain, less the crew', () => {
	// The pool fell 61,440 over 60 minutes with a crew eating 1,440 a
	// day: 60 of that was the crew, the rest 1,023 a minute.
	assert.equal(calibrateRations(61_440, 60, 1440), 1023);
	assert.equal(calibrateRations(0, 60), null);
	assert.equal(calibrateRations(100, 0), null);
	// A crew that eats more than the pool fell says nothing usable.
	assert.equal(calibrateRations(10, 1440, 100_000), null);
});

test('the estimate is an order of magnitude: a Carrack lasts hours, not minutes or days', () => {
	const hours = 1_300_000 / DEFAULT_RATION_RATE / 60;
	assert.ok(hours > 2 && hours < 6, `${hours} h`);
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
