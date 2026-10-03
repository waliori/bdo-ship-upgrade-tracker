// Bartering, part eight: a short trip.
//
// The board turned round: not the best set of chains, but one trade
// picked and what fits round it. Shown first before the board is read
// (the maybes), then on layout 4 from Iliya with last week's goods --
// a trade picked, one fitted on the way, its goods taken one island
// further and back -- and last the same list on a stock day, which is
// the case it was asked for: fetch the one good the storage is low on.
//
// The Market is the recorded day (stageSea), as in the parts before.

import {
	seed, tab, click, say, hush, wait, waitFor, film, card,
	doing, spot, stageSea, nameBoard
} from '../drive.mjs';
import { point } from '../guide-kit.mjs';
import { barterHand } from '../states.mjs';

export default {
	id: 'barter-short',
	title: 'A Short Trip',
	at: 'barter',
	blurb: 'One picked trade and what fits round it: the maybes before the board is read, every trade on its own with its minutes there and back, a trade picked, another fitted on the way, goods taken one island further, and the same list counted in stock.',
	staged: true,
	say: {
		open: 'Bartering, part eight. A short trip: one trade you are going for, and what fits round it.',
		setup: 'Same sailor, sailing from Iliya with last week’s goods in storage. The board is not read yet.',
		shape: 'At the head of the plan, switch "the run" from Full run to Short trip.',
		maybe: 'Before the board is read, the short trip lists where what you hold could be traded, and on how many of the forty layouts each trade appears. These are maybes, not today’s board.',
		name: 'Name the board, as in part one: Eveto shows Essence of Liquor for a Cherry Tree Seed Pouch.',
		list: 'Now every trade on today’s board is listed on its own, best first for what it adds a minute: the island, the trade, what you hold of the good it takes, what it pays, and the minutes there and back from your harbour.',
		pick: 'Pick the trade you are going for. Pujara Island takes the six Level 4 Panaceas in the storage for Level 5 Portraits of the Ancient.',
		run: 'The run is worked out at once: sixty million at the wharf, six trades, five or six minutes under way.',
		fits: 'Below it: what fits on the way. Each trade says what it adds to this trip and the minutes it costs, and the hold stays under its limit.',
		add: 'Ostra Island costs a minute. Add it.',
		further: 'Now a picked trade can take its goods one island further: the Rare Herb Piles from Ostra, on to Al-Naha for Level 4 Seashell Decos.',
		less: '"One island less" stops it one island sooner again.',
		drop: 'And the cross takes a trade off the trip.',
		sold: 'At the foot, folded: the trades that cannot be made, each with the reason — no slot left in the hold, the Parley runs out, nothing to hand over.',

		stock: 'The short trip came from a sailor who wanted to fetch the one good the storage was low on. Click "A stock".',
		low: 'Now each trade says what it adds to the stock, and marks the goods you are low on against your targets.',
		close: 'Load at the wharf, sail and record a short trip like any other run. Next, the character bag.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await stageSea(page, {});
		await seed(page, url, barterHand);
		await tab(page, 'barter', { after: 1200 });
		await page.evaluate(() => document.querySelector('[data-act="barter-sec"][data-id="parley"]').click());
		await wait(800);
		await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-order"][data-k="barter-port"]')].find(b => /Iliya/.test(b.innerText)).click());
		await wait(2000);
		await page.evaluate(() => window.scrollTo(0, 0));
		await wait(500);

		const openSec = async () => {
			if (!(await page.$('.plan-sec[data-sec="chains"].open'))) await click(page, '.plan-sec[data-sec="chains"] [data-act="barter-sec"][data-id="chains"]', { after: 1600 });
		};
		const row = async re => {
			const h = await page.evaluateHandle(src => [...document.querySelectorAll('[data-act="barter-short-add"]:not([data-grows])')].find(b => new RegExp(src).test(b.innerText)) || null, re);
			return h.asElement();
		};

		await film(page, `${ctx.out}/${ch.id}.webm`);
		await card(page, ch.n || 'Bartering', ch.title, { line: s.open });
		await say(page, s.setup);
		await doing(page, s.shape, () => click(page, '[data-act="barter-shape"][data-id="short"]', { after: 1600 }));
		await doing(page, s.maybe, async () => {
			await openSec();
			await page.evaluate(() => document.querySelector('.st-list.maybe').scrollIntoView({ block: 'center', behavior: 'smooth' }));
			await wait(900);
		});
		await doing(page, s.name, async () => {
			await nameBoard(page);
			await openSec();
		});
		await hush(page);

		await waitFor(page, '[data-act="barter-short-add"]', { upTo: 60000, then: 300 });
		await spot(page, '.plan-sec[data-sec="chains"] .st-list', s.list, { pad: 6 });
		await doing(page, s.pick, async () => click(page, await row('Pujara'), { after: 2400 }));
		await point(page, '.plan-sec[data-sec="chains"] .run-tiles', s.run, { pad: 6 });
		await page.evaluate(() => {
			const h = [...document.querySelectorAll('.plan-sec[data-sec="chains"] .plan-sub-head')].find(e => /fits on the way/i.test(e.innerText));
			if (h) h.dataset.film = 'fits';
		});
		await point(page, '.plan-sub-head[data-film="fits"]', s.fits, { pad: 6 });
		await doing(page, s.add, async () => click(page, await row('Ostra'), { after: 2400 }));
		// Lit, then pressed: the press redraws the list under the light.
		const litThenPress = (sel, pad) => async () => {
			await spot(page, sel, '', { pad, hold: 1600 });
			await click(page, sel, { after: 1800 });
		};
		await doing(page, s.further, litThenPress('[data-act="barter-short-add"][data-grows]', 6));
		await doing(page, s.less, litThenPress('[data-act="barter-short-back"]', 10));
		await doing(page, s.drop, litThenPress('[data-act="barter-short-drop"]', 12));
		await point(page, '.plan-sec[data-sec="chains"] .st-more:last-of-type', s.sold, { pad: 6 });
		await hush(page);

		await doing(page, s.stock, async () => {
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await wait(600);
			await click(page, '[data-act="barter-goal"][data-id="stock"]', { after: 2400 });
			await openSec();
		});
		await point(page, '.plan-sec[data-sec="chains"] .st-list', s.low, { pad: 6 });
		await say(page, s.close);
		await hush(page);
	}
};
