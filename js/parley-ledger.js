// What the Parley bar holds after each stop of a run.
//
// A barter costs Parley, the bar starts the run at whatever it holds
// -- a full million after the refill, less if some was spent already
// -- and a Crow's Trade Voucher puts a quarter of a bar back, on its
// own two-hour cooldown, and refuses a full bar. The planner caps the
// attempts at each rung by the Parley the run can reach in all; this
// is the other view of the same numbers: stop by stop, the bar drawn
// like the hold is, a voucher drawn on where it is wanted and the
// clock allows, a wait where the bar runs short before the next one
// can come, and a plain warning where no voucher can put it back.
//
// Pure. `stops` carry `parley`, what the stop spends; `minutesAt(k)`
// is how far into the run stop k is, for the cooldown.

import { PARLEY } from './barter.js';

export const VOUCHER_COOLDOWN_MIN = 120;

/**
 * The ledger: one entry a stop -- { before, spent, after, voucher,
 * wait, delay, short, dry, pct } -- and the totals. `held` is the bar
 * at the start (nought or absent means full); `vouchers` how many are
 * carried; `use` whether to draw on them at all, which is the sailor's
 * to say -- a voucher is a thing with its own worth, and a run is not
 * always what one is for.
 *
 * **When a voucher is drawn.** Not at the last moment. A voucher is
 * worth a quarter of a bar and nothing more, so it is wasted if the bar
 * is fuller than that when it is drawn -- but it also starts a two-hour
 * cooldown, and the sooner that clock starts the sooner the next one
 * can come. So it goes in as soon as there is room for the whole of it
 * and the run is going to need it: the rungs still ahead cost more than
 * the bar holds. A run that finishes without it draws none at all.
 *
 * **When the bar runs short.** The stops of a run come one after the
 * other, and a barter that cannot be paid for is not sailed past: the
 * ship waits where it is. With a voucher in hand and its cooldown still
 * running, the wait is the rest of the cooldown -- `wait`, in minutes
 * -- after which the voucher goes in and the stop is traded; every stop
 * after it comes that much later, which `delay` carries, the minutes
 * waited so far. With no voucher to come, the bar is `dry`: that stop
 * and every barter after it wait for the refill, and `short` says what
 * each would have cost. `dryAt` is the first such stop, `waited` the
 * minutes the whole run stands still.
 */
export function parleyLedger(stops, { held = 0, max = PARLEY.max, vouchers = 0, voucher = PARLEY.voucher, cooldownMin = VOUCHER_COOLDOWN_MIN, minutesAt = () => 0, use = true } = {}) {
	let bar = held > 0 ? Math.min(max, held) : max;
	let left = use ? Math.max(0, Math.floor(vouchers)) : 0;
	let lastVoucherAt = -Infinity;
	let spentAll = 0, used = 0, shortAll = 0, delay = 0, dryAt = -1;
	// What every stop from k on costs: whether the run needs a voucher
	// at all is this against the bar, not the stop in front of us.
	const spends = stops.map(s => Math.max(0, Math.round(Number(s.parley) || 0)));
	const ahead = new Array(spends.length + 1).fill(0);
	for (let i = spends.length - 1; i >= 0; i--) ahead[i] = ahead[i + 1] + spends[i];
	const rows = stops.map((s, k) => {
		const spent = spends[k];
		const before = bar;
		let now = minutesAt(k) + delay;
		let drawn = 0;
		let wait = 0;
		const room = () => max - bar >= voucher;
		const draw = () => { bar = Math.min(max, bar + voucher); left--; used++; lastVoucherAt = now; drawn++; };
		// Wanted: the rest of the run costs more than the bar holds.
		if (left > 0 && ahead[k] > bar && room() && now - lastVoucherAt >= cooldownMin) draw();
		// Short, with a voucher still to come: the ship waits out the
		// cooldown here, draws it, and only then trades. A stop dearer
		// than a quarter waits out the next one too.
		while (spent > bar && left > 0 && room()) {
			const w = Math.max(0, Math.ceil(cooldownMin - (now - lastVoucherAt)));
			wait += w; delay += w; now += w;
			draw();
		}
		const short = Math.max(0, spent - bar);
		const dry = short > 0 || (dryAt >= 0 && spent > 0);
		if (dry && dryAt < 0) dryAt = k;
		// Past the dry stop nothing is paid for: the run stands.
		const paid = dryAt >= 0 && k > dryAt ? 0 : spent - short;
		bar = Math.max(0, bar - paid);
		spentAll += paid;
		shortAll += spent - paid;
		return { before, spent, after: bar, voucher: drawn > 0, drawn, wait, delay, short: spent - paid, dry, pct: max ? (bar / max) * 100 : 0 };
	});
	return { rows, spent: spentAll, short: shortAll, vouchersUsed: used, vouchersLeft: left, end: bar, max, waited: delay, dryAt };
}
