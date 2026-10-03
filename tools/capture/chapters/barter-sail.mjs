// Bartering, part four: under sail, and the trip recorded.
//
// Cast off from the wharf, the clock and its bells, the cockpit one
// stop at a time -- Traded, an island that pays a range, the Parley the
// game shows, the leg timed -- the run on the chart, every stop ticked
// at once, and the results recorded as one change that one Undo takes
// back. The day's boards and the week close it.
//
// The Market is the recorded day (stageSea), as in parts two and three.

import {
	seed, tab, click, say, hush, wait, onScreen, waitFor, film, card,
	doing, spot, stageSea, nameBoard
} from '../drive.mjs';
import { point } from '../guide-kit.mjs';
import { barterHand } from '../states.mjs';

export default {
	id: 'barter-sail',
	title: 'Under Sail',
	at: 'barter',
	blurb: 'Cast off, the clock and its bells, the cockpit one stop at a time — Traded, a range paid, the Parley the game shows, a leg timed — the run on the chart, every stop ticked at once, the trip recorded and undone, and the day’s boards.',
	staged: true,
	say: {
		open: 'Bartering, part four. Under sail: one stop at a time, and the trip recorded at the end.',
		setup: 'Light and fast from Iliya, on a bar just refilled, with everything the run needs ticked aboard.',

		/* --- the bells, before casting off --- */
		bells: 'Before you cast off, the clock’s chimes. A ship’s bell by default — click it to hear the next sound: three beeps, or none.',
		notify: '"Notify me too" asks the browser for a notification as well, so a chime lands while the game has the screen. Signed in, a chip beside it sends the chimes to every device on your account.',
		cast: 'Click "Cast off".',
		running: 'The ship sets sail. The clock starts at this run’s own estimate, and the tab moves to the third step: one stop at a time.',

		/* --- the clock --- */
		clock: 'This bar is the clock: the time to the next stop, and which stop it is.',
		marks: 'It chimes at each stop — a pair of bells as each comes up, and eight bells at the end — or only once, for the whole run.',
		again: '"Again" starts it over from now; "stop" puts it away.',

		/* --- the cockpit --- */
		island: 'The stop, in letters you can read across the room: the island, what you hand over, what you get back, and how many times.',
		tiles: 'Under it: the hold before and after, the Parley, and the rations.',
		gameparley: 'If the Parley in the game differs, type what the game shows here, and the rest of the run is counted from it.',
		traded: 'Trade in the game, then press Traded. The stop is written into the hold, and the next one comes up.',
		range: 'This island pays two or three a trade. Tap what it paid, and the rest of the run is laid again from it.',
		other: 'If you traded a different number of times, say so under it.',
		inhold: 'The hold, as it stands now and after this stop, with its slots.',
		legs: '"Time my legs" adds an Arrived button: press it as the ship reaches each island. After five legs, the clock uses your ship’s own speed.',
		arrived: 'Arrived.',
		glance: 'The stop opens in glance mode, large. "Full view" brings the rest of the cockpit round it; "Glance mode" goes back.',

		/* --- on the chart --- */
		chart: '"On the chart" opens the run on the Map, with the same checklist beside it.',
		map: 'Every stop is a numbered pin with the route drawn between them. The side panel carries the same stop and clock, and the strip at the foot steps through the legs.',
		mapback: 'Back to the Barter tab.',

		/* --- all at once --- */
		all: 'Finished sailing and did not tick as you went? Click "All done".',
		allpick: 'Tick off every stop and every quest handed in, at once.',
		left: 'Stops that pay a range are left for you, because only you saw what they paid.',
		paid: 'Tap what each one paid, one after another. Each answer lays the rest of the run again, so the results add up to what you really got.',

		/* --- results --- */
		grows: 'Paid more than the least, the run carries more goods, so it can grow by a few stops further on. Those are ticked the same way.',
		results: 'The results: stops, the trades made and your new Total Barters, the silver, the Parley spent and the time under way.',
		exchange: 'The exchange, as recording will write it: what you handed over, and what you received.',
		record: 'Click "Record the trip".',
		recorded: 'The Parley, Total Barters, the quests and the log move together, as one change.',
		undo: 'So one Undo takes the whole trip back…',
		redo: '…and Redo puts it back again.',
		boards: 'Below, today’s boards: every run since the refill, what it loaded and what it came back with, and the day’s totals.',
		next: 'What to load for the next board is not guessed: a refresh deals a different board, so it waits until you have read it.',
		week: 'The week, run by run, and every past run with all its stops.',
		close: 'That is a whole run. The next parts sail the same board for other things: a stock, Crow Coins, a material.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await stageSea(page, {});
		// A bar just refilled and no vouchers carried. With vouchers the
		// run draws them at stops that "All done" ticks without saying so,
		// and the recorded Parley then comes out at 1 (see the report).
		await seed(page, url, { ...barterHand, profile: { ...barterHand.profile, parleyHeld: 1000000, vouchers: 0 } });
		await tab(page, 'barter', { after: 1200 });
		await nameBoard(page);
		// Off camera: Iliya as home port, Light and fast, and the Load
		// step with every row ticked.
		await page.evaluate(() => document.querySelector('[data-act="barter-sec"][data-id="parley"]').click());
		await wait(800);
		await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-order"][data-k="barter-port"]')].find(b => /Iliya/.test(b.innerText)).click());
		await wait(2500);
		await page.evaluate(() => document.querySelector('[data-act="barter-step"][data-id="load"]').click());
		await wait(2500);
		// "Tick them all" is a toggle, so only the ones not yet on.
		for (let go = 0; go < 6; go++) {
			const left = await page.evaluate(() => {
				const b = document.querySelector('[data-act="barter-pack-all"]:not(.active)');
				if (b) { b.click(); return true; }
				return false;
			});
			if (!left) break;
			await wait(1500);
		}
		await page.evaluate(() => window.scrollTo(0, 0));
		await wait(600);

		await film(page, `${ctx.out}/${ch.id}.webm`);
		await card(page, ch.n || 'Bartering', ch.title, { line: s.open });
		await spot(page, '.hold-bar', s.setup, { pad: 6 });

		/* --- the bells -------------------------------------------- */
		await point(page, '[data-act="barter-timer-sound"]', s.bells, {
			pad: 10,
			act: async () => {
				await click(page, '[data-act="barter-timer-sound"]', { after: 900 });
				await click(page, '[data-act="barter-timer-sound"]', { after: 900 });
				await click(page, '[data-act="barter-timer-sound"]', { after: 600 });
			}
		});
		await point(page, '[data-act="barter-timer-notify"]', s.notify, { pad: 10 });
		await doing(page, s.cast, () => click(page, '[data-act="barter-cast-off"]', { after: 600 }));
		await say(page, s.running);
		await waitFor(page, '.cockpit', { upTo: 20000, then: 2500 });
		await hush(page);

		/* --- the clock -------------------------------------------- */
		await point(page, '.cockpit-clock', s.clock, { pad: 6 });
		await point(page, '.sail-timer-modes', s.marks, { pad: 8 });
		await point(page, '[data-act="barter-timer-restart"]', s.again, { pad: 10 });
		await hush(page);

		/* --- the cockpit ------------------------------------------ */
		await point(page, '.cockpit-trade', s.island, { pad: 6 });
		await point(page, '.cockpit-figs', s.tiles, { pad: 6 });
		await point(page, '[data-act="barter-parley-fix"]', s.gameparley, { pad: 12 });

		await doing(page, s.traded, () => click(page, '[data-act="barter-stop-done"], [data-act="barter-paid"]', { after: 3200 }));
		if (await onScreen(page, '[data-act="barter-paid"]')) {
			await doing(page, s.range, () => click(page, '[data-act="barter-paid"]', { after: 3200 }));
		}
		await point(page, '[data-act="barter-did-open"]', s.other, { pad: 8 });
		await point(page, '[data-act="barter-slots"]', s.inhold, { pad: 6 });
		await doing(page, s.legs, () => click(page, '[data-act="barter-time-legs"]', { after: 1200 }));
		if (await onScreen(page, '[data-act="barter-arrived"]')) await doing(page, s.arrived, () => click(page, '[data-act="barter-arrived"]', { after: 1200 }));
		await doing(page, s.glance, async () => {
			await click(page, '[data-act="barter-glance"]', { after: 1600 });
			await click(page, '[data-act="barter-glance"]', { after: 1200 });
		});
		await hush(page);

		/* --- on the chart ----------------------------------------- */
		await doing(page, s.chart, () => click(page, '[data-act="barter-sail-chart"]', { after: 3000 }));
		await say(page, s.map);
		await doing(page, s.mapback, () => tab(page, 'barter', { after: 1800 }));
		await hush(page);

		/* --- all at once ------------------------------------------ */
		await doing(page, s.all, () => click(page, '[data-act="barter-sail-all"]', { after: 1000 }));
		await doing(page, s.allpick, () => click(page, '[data-act="barter-sail-all-go"]', { after: 3000 }));
		// Only the cockpit's own button: once the run is done the stop
		// list below has a small tick per stop, and pressing that unticks.
		const next = '.cockpit [data-act="barter-paid"], .cockpit [data-act="barter-stop-done"]';
		const pay = async n => {
			for (let i = 0; i < n && await onScreen(page, next); i++) {
				// The cockpit redraws itself after every press; a press that
				// lands on the old button is pressed again on the new one.
				await click(page, next, { after: 1000 }).catch(() => wait(600));
			}
		};
		if (await onScreen(page, '.cockpit [data-act="barter-paid"]')) {
			await say(page, s.left);
			await doing(page, s.paid, () => pay(4));
		}
		if (await onScreen(page, next)) await doing(page, s.grows, () => pay(30));
		await hush(page);

		/* --- results ---------------------------------------------- */
		if (!(await onScreen(page, '[data-act="barter-record"]'))) await click(page, '[data-act="barter-step"][data-id="results"]', { after: 2000 });
		await point(page, '.run-tiles', s.results, { pad: 6 });
		await point(page, '.exchange', s.exchange, { pad: 6 });
		await doing(page, s.record, () => click(page, '[data-act="barter-record"]', { after: 2600 }));
		await say(page, s.recorded);
		await doing(page, s.undo, async () => {
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await wait(600);
			await click(page, '[data-act="undo"]', { after: 2200 });
		});
		await doing(page, s.redo, () => click(page, '[data-act="redo"]', { after: 2200 }));
		await point(page, '.day-boards .panel-head', s.boards, { pad: 6 });
		await point(page, '.day-note', s.next, { pad: 6 });
		await point(page, '.panel.week', s.week, { pad: 6 });
		await say(page, s.close);
		await hush(page);
	}
};
