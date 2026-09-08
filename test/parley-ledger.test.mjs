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

test('a voucher is drawn on where the bar cannot pay, and refuses a full bar', () => {
	const { rows, vouchersUsed, vouchersLeft } = parleyLedger([stop(200000), stop(200000)], { held: 300000, vouchers: 2, minutesAt: () => 0 });
	assert.equal(rows[0].voucher, false, 'nothing drawn while the bar can pay');
	assert.equal(rows[1].voucher, true);
	assert.equal(rows[1].before, 100000, 'the bar as it stood, before the quarter went back');
	assert.equal(rows[1].after, 150000);
	assert.equal(rows[1].short, 0);
	assert.equal(vouchersUsed, 1);
	assert.equal(vouchersLeft, 1);
	// A full bar takes no voucher, however many are carried.
	const full = parleyLedger([stop(1200000)], { vouchers: 3 });
	assert.equal(full.rows[0].voucher, false);
	assert.equal(full.rows[0].short, 200000);
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
