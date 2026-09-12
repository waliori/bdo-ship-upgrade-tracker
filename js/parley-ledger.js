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
 * short, wait, pct } -- and the totals. `held` is the bar at the start
 * (nought or absent means full); `vouchers` how many are carried;
 * `use` whether to draw on them at all, which is the sailor's to say --
 * a voucher is a thing with its own worth, and a run is not always what
 * one is for.
 *
 * **When a voucher is drawn.** Not at the last moment. A voucher is
 * worth a quarter of a bar and nothing more, so it is wasted if the bar
 * is fuller than that when it is drawn -- but it also starts a two-hour
 * cooldown, and the sooner that clock starts the sooner the next one
 * can come. So it goes in as soon as there is room for the whole of it
 * and the run is going to need it: the rungs still ahead cost more than
 * the bar holds. A run that finishes without it draws none at all.
 *
 * `short` is how much of a stop's spend the bar could not cover, and
 * `wait` -- when a voucher is wanted, held, and still on its cooldown
 * -- is how many minutes are left of it, so the sheet can say to wait
 * rather than only that nothing can be done.
 */
export function parleyLedger(stops, { held = 0, max = PARLEY.max, vouchers = 0, voucher = PARLEY.voucher, cooldownMin = VOUCHER_COOLDOWN_MIN, minutesAt = () => 0, use = true } = {}) {
	let bar = held > 0 ? Math.min(max, held) : max;
	let left = use ? Math.max(0, Math.floor(vouchers)) : 0;
	let lastVoucherAt = -Infinity;
	let spentAll = 0, used = 0, shortAll = 0;
	// What every stop from k on costs: whether the run needs a voucher
	// at all is this against the bar, not the stop in front of us.
	const spends = stops.map(s => Math.max(0, Math.round(Number(s.parley) || 0)));
	const ahead = new Array(spends.length + 1).fill(0);
	for (let i = spends.length - 1; i >= 0; i--) ahead[i] = ahead[i + 1] + spends[i];
	const rows = stops.map((s, k) => {
		const spent = spends[k];
		const before = bar;
		let drawn = false;
		let wait = 0;
		// Wanted: the rest of the run costs more than the bar holds.
		const wanted = left > 0 && ahead[k] > bar;
		if (wanted) {
			const room = max - bar >= voucher;
			const since = minutesAt(k) - lastVoucherAt;
			if (room && since >= cooldownMin) {
				bar = Math.min(max, bar + voucher);
				left--;
				used++;
				lastVoucherAt = minutesAt(k);
				drawn = true;
			} else if (spent > bar) {
				// The stop cannot be paid for and no voucher can come yet:
				// how long until one can is the useful thing to say.
				wait = room ? Math.max(0, Math.ceil(cooldownMin - since)) : 0;
			}
		}
		const short = Math.max(0, spent - bar);
		bar = Math.max(0, bar - spent);
		spentAll += spent - short;
		shortAll += short;
		return { before, spent, after: bar, voucher: drawn, short, wait, pct: max ? (bar / max) * 100 : 0 };
	});
	return { rows, spent: spentAll, short: shortAll, vouchersUsed: used, vouchersLeft: left, end: bar, max };
}
