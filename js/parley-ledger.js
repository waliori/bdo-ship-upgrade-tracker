// What the Parley bar holds after each stop of a run.
//
// A barter costs Parley, the bar starts the run at whatever it holds
// -- a full million after the refill, less if some was spent already
// -- and a Crow's Trade Voucher puts a quarter of a bar back, on its
// own two-hour cooldown, and refuses a full bar. The planner caps the
// attempts at each rung by the Parley the run can reach in all; this
// is the other view of the same numbers: stop by stop, the bar drawn
// like the hold is, a voucher drawn on where it is wanted and the
// clock allows, and a plain warning where the run would stall for
// Parley that no voucher can yet put back.
//
// Pure. `stops` carry `parley`, what the stop spends; `minutesAt(k)`
// is how far into the run stop k is, for the cooldown.

import { PARLEY } from './barter.js';

export const VOUCHER_COOLDOWN_MIN = 120;

/**
 * The ledger: one entry a stop -- { before, spent, after, voucher,
 * short, pct } -- and the totals. `held` is the bar at the start
 * (nought or absent means full); `vouchers` how many are carried. A
 * voucher is drawn on before a stop that the bar cannot pay for, when
 * the cooldown has run since the last; `short` is how much of the
 * stop's spend the bar still could not cover after that, and the bar
 * is not driven below nought -- the stop simply does not happen in
 * full, which the note beside it says.
 */
export function parleyLedger(stops, { held = 0, max = PARLEY.max, vouchers = 0, voucher = PARLEY.voucher, cooldownMin = VOUCHER_COOLDOWN_MIN, minutesAt = () => 0 } = {}) {
	let bar = held > 0 ? Math.min(max, held) : max;
	let left = Math.max(0, Math.floor(vouchers));
	let lastVoucherAt = -Infinity;
	let spentAll = 0, used = 0, shortAll = 0;
	const rows = stops.map((s, k) => {
		const spent = Math.max(0, Math.round(Number(s.parley) || 0));
		const before = bar;
		let drawn = false;
		if (spent > bar && left > 0 && bar < max) {
			const now = minutesAt(k);
			if (now - lastVoucherAt >= cooldownMin) {
				bar = Math.min(max, bar + voucher);
				left--;
				used++;
				lastVoucherAt = now;
				drawn = true;
			}
		}
		const short = Math.max(0, spent - bar);
		bar = Math.max(0, bar - spent);
		spentAll += spent - short;
		shortAll += short;
		return { before, spent, after: bar, voucher: drawn, short, pct: max ? (bar / max) * 100 : 0 };
	});
	return { rows, spent: spentAll, short: shortAll, vouchersUsed: used, vouchersLeft: left, end: bar, max };
}
