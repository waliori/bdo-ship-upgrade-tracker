// Bartering, part three: at the wharf.
//
// The Load step is where the plan becomes goods in a hold: what to buy
// at the Market, what to take out of the storage, what is aboard
// already, what the storage will hold after -- and the route laid stop
// by stop from what is ticked. The run filmed is the most silver on
// layout 4 from Iliya, which the hold cannot carry in one go, so it is
// sailed as trips; and a second look at the same board sailed loaded
// heavy shows what the hold does past its limit.
//
// The Market is the recorded day (stageSea), as in part two.

import {
	seed, tab, click, say, hush, wait, onScreen, waitFor, film, card,
	doing, spot, stageSea, nameBoard
} from '../drive.mjs';
import { point } from '../guide-kit.mjs';
import { barterHand } from '../states.mjs';

export default {
	id: 'barter-wharf',
	title: 'At the Wharf',
	at: 'barter',
	blurb: 'The Load step: the hold in weight and slots, the Parley to spend, a run cut into trips, what to buy at the Market and take from the storage, what the storage holds after, and the route stop by stop — wharf calls, supplies, quests, vouchers — with stops moved or skipped, and the same board loaded heavy.',
	staged: true,
	say: {
		open: 'Bartering, part three. At the wharf: the plan becomes goods in your hold.',
		setup: 'Same board, same sailor, sailing from Iliya Island. This time we take the run that makes the most silver.',
		load: 'Click "Load at the wharf".',

		/* --- the hold and the purse --- */
		hold: 'The hold, as it stands: its weight against the ship’s limit, and its slots. A Carrack Advance has forty.',
		sheet: '"Open the hold" lists every good aboard, with what a barterer pays for it, and every good waiting in the storage at your port, ready to load.',
		spend: 'Beside it, what there is to spend: the Parley, the vouchers, and what one trade costs at your barter level.',

		/* --- trips --- */
		trips: 'This run is cut into trips. The hold cannot carry every chain’s first goods at once, so the run comes back to Iliya for the rest.',
		trip1: 'Trip one is loaded now.',
		later: 'Trip two is picked up at the wharf on the way, at stop nine. Each trip can be moved sooner or later with the arrows, or left out.',

		/* --- the packing list --- */
		market: 'Buy at the Market: the land goods the chains start from, how many, and what they cost.',
		tickm: 'Tick a row when it is in your hold in game. The tick is real: the silver comes off your purse, and the goods go into the ship’s hold in the app.',
		workers: 'If your own workers make a good, click "my workers", and it costs the run nothing.',
		storage: 'Take from storage: goods the run climbs from, waiting at Iliya. "Tick them all" moves them from the storage to the hold.',
		aboard: 'They show under "Already aboard" now, checked against the hold, each with "put it back".',
		slots: 'A tick never loads more than the hull has slots for. Level 5 and up take a slot each; if they do not fit, it loads what fits and says what did not.',
		after: 'In the storage after: what comes home to Iliya, and the silver the wharf calls bring in.',
		quests: 'The dailies handed in at Iliya before casting off, and the ones this run passes by.',

		/* --- the route --- */
		route: 'Then the route, stop by stop: how many stops, how far, how long, and the quests handed in on the way.',
		chart: '"Draw it on the chart" puts the whole route on the Map, in this order.',
		lots: 'Chains are climbed together, as many at once as the hold carries, the tops sold before the next lot.',
		rations: 'The rations: what the run eats, as an estimate. A tick every seven seconds: the hull’s share, plus the crew’s appetite.',
		castoff: 'The first card is the hold as the lines are let go.',
		stop: 'Every stop says what you hand over, what you get back, and how many times.',
		bars: 'And on the right, the hold, its slots, the Parley and the rations after the stop.',
		voucher: 'Where the Parley would run short, a voucher is drawn on — here, at the first island.',
		leg: 'Each leg is drawn on a small chart.',
		wharf: 'A wharf call: buy supplies here, the goods it loads from storage for the next trip, what it sells and for how much, and the quests handed in.',
		skip: 'Every stop can be moved sooner or later, or skipped. Skip one, and the route is laid again round it.',
		undo: 'The change can be taken back with Undo, at the top of the page.',

		/* --- loaded heavy --- */
		heavy: 'One more thing. Back on the plan, choose "The whole board, loaded heavy".',
		limit: 'A wharf loads the hold only up to its limit. The exchanges can take it further, up to 170 percent.',
		amber: 'An amber figure means the hold is over its limit there. You still sail, only slower, until a wharf takes the extra off.',
		close: 'Back to Light and fast, if you prefer to stay quick. Next, part four: casting off.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await stageSea(page, {});
		await seed(page, url, barterHand);
		await tab(page, 'barter', { after: 1200 });
		await nameBoard(page);
		// Off camera: Iliya as home port, and the most silver on the board.
		await page.evaluate(() => document.querySelector('[data-act="barter-sec"][data-id="parley"]').click());
		await wait(800);
		await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-order"][data-k="barter-port"]')].find(b => /Iliya/.test(b.innerText)).click());
		await wait(2000);
		await page.evaluate(() => document.querySelector('.plan-sec[data-sec="chains"] [data-act="barter-sec"]').click());
		await waitFor(page, '.proposal', { upTo: 60000, then: 300 });
		await page.evaluate(() => document.querySelector('.proposal').click());
		await wait(2500);
		await page.evaluate(() => window.scrollTo(0, 0));
		await wait(500);

		await film(page, `${ctx.out}/${ch.id}.webm`);
		await card(page, ch.n || 'Bartering', ch.title, { line: s.open });
		await spot(page, '.board-strip', s.setup, { pad: 6 });
		await doing(page, s.load, () => click(page, '[data-act="barter-step"][data-id="load"]', { after: 2200 }));

		/* --- the hold and the purse ------------------------------- */
		await spot(page, '.hold-bar', s.hold, { pad: 6 });
		await doing(page, s.sheet, () => click(page, '[data-act="barter-hold-open"]', { after: 1600 }));
		await page.keyboard.press('Escape');
		await wait(600);
		await point(page, '.hold-col-purse', s.spend, { pad: 6 });
		await hush(page);

		/* --- trips ------------------------------------------------ */
		await point(page, '.trip-card.now', s.trips, { pad: 4 });
		await say(page, s.trip1);
		await point(page, '.trip-card.later', s.later, { pad: 4 });
		await hush(page);

		/* --- the packing list ------------------------------------- */
		await spot(page, '.trip-card.now .pack-group', s.market, { pad: 4 });
		await doing(page, s.tickm, () => click(page, '.trip-card.now .pack-group [data-act="barter-pack"]', { after: 1800 }));
		await point(page, '.trip-card.now [data-act="barter-homemade"]', s.workers, { pad: 8 });
		await doing(page, s.storage, () => click(page, '.trip-card.now [data-act="barter-pack-all"]', { after: 2000 }));
		await point(page, '.trip-card.now .pack-group:nth-of-type(3), .trip-card.now .pack-group:last-of-type', s.aboard, { pad: 4 });
		await point(page, '.hold-bar', s.slots, { pad: 6 });
		await point(page, '.shelf', s.after, { pad: 6 });
		await point(page, '.run-quests-home', s.quests, { pad: 6 });
		await hush(page);

		/* --- the route -------------------------------------------- */
		await point(page, '.route-fold > summary', s.route, { pad: 6 });
		await point(page, '[data-act="barter-chart"]', s.chart, { pad: 8 });
		await point(page, '.run-seg-head', s.lots, { pad: 6 });
		await point(page, '.run-rations-line', s.rations, { pad: 6 });
		await point(page, '.run-stop.start', s.castoff, { pad: 4 });
		await spot(page, '.run-stop:not(.start):not(.wharf)', s.stop, { pad: 4 });
		await point(page, '.run-stop:not(.start):not(.wharf) .run-rations', s.bars, { pad: 30 });
		await point(page, '.run-stop:has(.run-parley.voucher)', s.voucher, { pad: 4 });
		await point(page, '.run-stop .leg-snap', s.leg, { pad: 4 });
		await point(page, '.run-stop.wharf', s.wharf, { pad: 4 });
		await doing(page, s.skip, () => click(page, '.run-stop:not(.start):not(.wharf) [data-act="barter-route-skip"]', { after: 2200 }));
		await doing(page, s.undo, async () => {
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await wait(700);
			await click(page, '[data-act="undo"]', { after: 1800 });
		});
		await hush(page);

		/* --- loaded heavy ----------------------------------------- */
		await doing(page, s.heavy, async () => {
			await click(page, '[data-act="barter-step"][data-id="plan"]', { after: 1200 });
			if (!(await onScreen(page, '[data-act="barter-sail-preset"][data-id="full"]'))) {
				await click(page, '.plan-sec[data-sec="how"] [data-act="barter-sec"][data-id="how"]', { after: 1000 });
			}
			await click(page, '[data-act="barter-sail-preset"][data-id="full"]', { after: 2200 });
			await click(page, '[data-act="barter-step"][data-id="load"]', { after: 2200 });
		});
		await point(page, '.hold-bar', s.limit, { pad: 6 });
		await point(page, '.run-stop:has(b.amber)', s.amber, { pad: 4 });
		await doing(page, s.close, async () => {
			await click(page, '[data-act="barter-step"][data-id="plan"]', { after: 1200 });
			if (!(await onScreen(page, '[data-act="barter-sail-preset"][data-id="quick"]'))) {
				await click(page, '.plan-sec[data-sec="how"] [data-act="barter-sec"][data-id="how"]', { after: 1000 });
			}
			await click(page, '[data-act="barter-sail-preset"][data-id="quick"]', { after: 1600 });
		});
		await hush(page);
	}
};
