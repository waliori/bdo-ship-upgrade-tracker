// The Parley bar, stop by stop.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parleyLedger } from '../js/parley-ledger.js';

const stop = (parley, times = 1) => ({ npcId: 1, parley, times });

test('the bar counts down from what it holds, a wharf costs nothing', () => {
	const { rows, spent, end } = parleyLedger([stop(100000), { wharf: {} }, stop(250000)], { held: 600000 });
	assert.deepEqual(rows.map(r => [r.before, r.spent, r.after, r.short]), [[600000, 100000, 500000, 0], [500000, 0, 500000, 0], [500000, 250000, 250000, 0]]);
	assert.equal(spent, 350000);
	assert.equal(end, 250000);
	assert.equal(rows[2].pct, 25);
});

test('nought held means a full bar', () => {
	assert.equal(parleyLedger([stop(1)], {}).rows[0].before, 1000000);
});

test('a voucher goes in as soon as the run is going to need it, not at the last moment', () => {
	// Two stops of 200,000 against a bar of 300,000: the run needs a
	// quarter it has not got, so the voucher is drawn at the first stop
	// rather than the second. It costs nothing to draw it early -- there
	// is room for the whole quarter either way -- and it starts the
	// two-hour cooldown two stops sooner, which is the whole point.
	const { rows, vouchersUsed, vouchersLeft } = parleyLedger([stop(200000), stop(200000)], { held: 300000, vouchers: 2, minutesAt: () => 0 });
	assert.deepEqual(rows.map(r => r.voucher), [true, false]);
	assert.equal(rows[0].before, 300000, 'the bar as it stood, before the quarter went back');
	assert.equal(rows[0].after, 350000);
	assert.equal(rows[1].after, 150000);
	assert.equal(vouchersUsed, 1, 'one was all the run wanted');
	assert.equal(vouchersLeft, 1);
});

test('a run that finishes on its own bar draws no voucher at all', () => {
	const { rows, vouchersUsed, end } = parleyLedger([stop(200000), stop(200000)], { held: 1000000, vouchers: 3, minutesAt: () => 0 });
	assert.deepEqual(rows.map(r => r.voucher), [false, false], 'nothing is spent on a run that does not need it');
	assert.equal(vouchersUsed, 0);
	assert.equal(end, 600000);
});

test('a voucher goes in the moment a whole quarter fits, and never into a fuller bar', () => {
	// Three stops of a quarter, a half and the rest, against a full bar
	// the run will outspend. Nothing is drawn at the first -- a quarter
	// into a full bar throws most of it away -- and at the second, with
	// exactly 250,000 gone, the whole of it fits and in it goes.
	const { rows } = parleyLedger([stop(250000), stop(250000), stop(600000)], { held: 1000000, vouchers: 2, minutesAt: () => 0 });
	assert.deepEqual(rows.map(r => r.voucher), [false, true, false]);
	assert.equal(rows[1].before, 750000);
	assert.equal(rows[1].after, 750000, 'a quarter back, a quarter spent');
	assert.equal(rows[2].after, 150000);
	// A bar that is full at the only stop there is takes nothing.
	const full = parleyLedger([stop(1200000)], { vouchers: 3 });
	assert.equal(full.rows[0].voucher, false);
	assert.equal(full.rows[0].short, 200000);
});

test('the sailor can keep their vouchers, and then the run is simply short', () => {
	const keep = parleyLedger([stop(200000), stop(200000)], { held: 300000, vouchers: 2, use: false, minutesAt: () => 0 });
	assert.deepEqual(keep.rows.map(r => r.voucher), [false, false]);
	assert.equal(keep.vouchersUsed, 0);
	assert.equal(keep.short, 100000, 'the second stop is a hundred thousand short without one');
	assert.equal(keep.vouchersLeft, 0, 'none were counted as available to the run');
});

test('a stop that cannot be paid for says how long the cooldown has left', () => {
	const at = [0, 30, 60];
	const { rows } = parleyLedger([stop(900000), stop(200000), stop(300000)], { held: 1000000, vouchers: 3, minutesAt: k => at[k] });
	assert.equal(rows[1].voucher, true, 'the first voucher, at thirty minutes');
	assert.equal(rows[2].wait, 90, 'the next one is ninety minutes off');
	assert.ok(rows[2].short > 0);
	// Nothing to wait for when there are no vouchers left to wait for.
	const none = parleyLedger([stop(1200000)], { held: 1000000, vouchers: 0 });
	assert.equal(none.rows[0].wait, 0);
});

test('the second voucher waits two hours, and a stop that comes sooner is short', () => {
	const at = [0, 30, 60, 150];
	const { rows, short } = parleyLedger([stop(900000), stop(200000), stop(200000), stop(200000)], { held: 1000000, vouchers: 3, minutesAt: k => at[k] });
	assert.deepEqual(rows.map(r => [r.voucher, r.short, r.after]), [
		[false, 0, 100000],
		[true, 0, 150000],       // 30 min: the first voucher
		[false, 50000, 0],       // 60 min: the cooldown has not run
		[true, 0, 50000]         // 150 min: it has
	]);
	assert.equal(short, 50000);
});
