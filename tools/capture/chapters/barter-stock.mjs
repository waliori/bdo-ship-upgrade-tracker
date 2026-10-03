// Bartering, part five: a stock day.
//
// The same board, sailed to fill the storage rather than to sell. The
// sailor is a newer one with a thin storage at Iliya -- a few goods at
// each of the first four levels -- so every level is short of its
// target and the plan has something to fill; then a level is let go
// and the ceiling brought down, and the run follows each change.
//
// The Market is the recorded day (stageSea), as in the parts before.

import {
	seed, tab, click, say, hush, wait, waitFor, film, card,
	doing, spot, stageSea, nameBoard, typeInto
} from '../drive.mjs';
import { point } from '../guide-kit.mjs';
import { barterThin } from '../states.mjs';

export default {
	id: 'barter-stock',
	title: 'A Stock Day',
	at: 'barter',
	blurb: 'The board sailed to fill the storage: targets by level that are floors as well, the ceiling, the fullest stock and what it banks, how many more runs it takes, a level let go and the ceiling brought down.',
	staged: true,
	say: {
		open: 'Bartering, part five. A stock day: the same board, sailed to fill your storage instead of your purse.',
		setup: 'This sailor is newer. Their storage at Iliya holds a few goods at each of the first four levels, and that is all.',
		goal: 'Click "A stock". Nothing is sold at a wharf on a stock day.',
		ladder: 'The ladder now says where the stock ends: Level 4, by default. Level 5 and up are not sailed.',
		targets: 'Under each level, a target: how many to keep of every good at that level. Ten of each Level 1, thirty of each Level 2 and 3, forty of each Level 4.',
		short: 'Beside it, how far short the storage is. Every level here is short.',
		floor: 'A target is a floor as well. The run fills a level before anything climbs from it, and never spends below it.',
		aim: 'And what the day is for: the stock itself, or the barter count — every trade toward the next unlock, whatever it trades.',

		/* --- the chains --- */
		chains: 'Down to the chains.',
		filling: 'This note says why every chain stops low: four levels are being filled, not climbed off. Nothing climbs from them until the stock is made up.',
		three: 'The runs worth sailing are counted in goods now: the fullest stock, the most an hour, the most for each unit of Parley.',
		take: 'Take the fullest stock.',
		cards: 'Each chain says where it stops, and why: the good it makes is still short of its target, so it stays as stock.',
		gains: 'The run: what the stock gains, level by level.',
		trades: 'The trades, with your barter count before and after.',
		ahead: 'And under the figures, how far there is to go: the goods still short of the targets, how many more runs like this one, how many days at three boards a day, and how many storage slots the full stock will take. A storage is never capped, only counted.',

		/* --- a level let go --- */
		letgo: 'Say Level 1 does not matter to you. Set its target to nothing.',
		climbs: 'Now the Level 1 goods climb straight on, and the run fills Level 2 instead.',
		ceiling: 'And the ceiling: click Level 3, and the stock stops there. Level 4 is not sailed today.',
		load: 'Load at the wharf and tick the land goods aboard. The storage after shows what this run banks at Iliya, good by good.',
		close: 'That is a stock day. Next, a day for Crow Coins.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await stageSea(page, {});
		await seed(page, url, barterThin);
		await tab(page, 'barter', { after: 1200 });
		await nameBoard(page);
		await page.evaluate(() => document.querySelector('[data-act="barter-sec"][data-id="parley"]').click());
		await wait(800);
		await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-order"][data-k="barter-port"]')].find(b => /Iliya/.test(b.innerText)).click());
		await wait(2000);
		await page.evaluate(() => window.scrollTo(0, 0));
		await wait(500);

		await film(page, `${ctx.out}/${ch.id}.webm`);
		await card(page, ch.n || 'Bartering', ch.title, { line: s.open });
		await say(page, s.setup);
		await doing(page, s.goal, () => click(page, '[data-act="barter-goal"][data-id="stock"]', { after: 2000 }));
		await doing(page, s.ladder, async () => {
			if (!(await page.$('.ladder'))) await click(page, '.plan-sec[data-sec="ladder"] [data-act="barter-sec"][data-id="ladder"]', { after: 1000 });
			await page.evaluate(() => document.querySelector('.ladder').scrollIntoView({ block: 'center', behavior: 'smooth' }));
			await wait(800);
		});
		await spot(page, '[data-act="barter-target"][data-lv="2"]', s.targets, { pad: 16 });
		await spot(page, '.ladder', s.short, { pad: 8 });
		await say(page, s.floor);
		await spot(page, '.ladder-aim', s.aim, { pad: 8 });
		await hush(page);

		/* --- the chains ------------------------------------------- */
		await doing(page, s.chains, () => click(page, '.plan-sec[data-sec="chains"] [data-act="barter-sec"][data-id="chains"]', { after: 1600 }));
		await point(page, '.barter-shut.floors', s.filling, { pad: 6 });
		await waitFor(page, '.proposal', { upTo: 60000, then: 300 });
		await spot(page, '.proposals', s.three, { pad: 6 });
		await doing(page, s.take, () => click(page, '.proposal', { after: 2200 }));
		await point(page, 'button.chain.on', s.cards, { pad: 6 });
		const tile = n => `.run-tiles:not(.ladder-tiles) > :nth-child(${n})`;
		await point(page, tile(1), s.gains, { pad: 6 });
		await point(page, tile(2), s.trades, { pad: 6 });
		await point(page, '.run-ahead', s.ahead, { pad: 6 });
		await hush(page);

		/* --- a level let go --------------------------------------- */
		// One part of the plan open at a time, and its head a toggle: a
		// part is opened only when it is shut.
		const open = async id => {
			if (!(await page.$(`.plan-sec[data-sec="${id}"].open`))) await click(page, `.plan-sec[data-sec="${id}"] [data-act="barter-sec"][data-id="${id}"]`, { after: 1400 });
		};
		await doing(page, s.letgo, async () => {
			await open('ladder');
			await typeInto(page, '[data-act="barter-target"][data-lv="1"]', '0', { after: 2200 });
		});
		await doing(page, s.climbs, async () => {
			await open('chains');
			await waitFor(page, '.proposals', { upTo: 60000, then: 300 });
			await spot(page, '.proposals', '', { pad: 6, hold: 2600 });
		});
		await doing(page, s.ceiling, async () => {
			await open('ladder');
			await click(page, '[data-act="barter-rung"][data-lv="3"]', { after: 2200 });
		});
		await doing(page, s.load, async () => {
			await click(page, '[data-act="barter-step"][data-id="load"]', { after: 2200 });
			// The shelf fills from what is ticked aboard.
			for (let go = 0; go < 6 && await page.$('.pack-box:not(.on)'); go++) {
				await click(page, '.pack-box:not(.on)', { after: 1400 });
			}
			await page.evaluate(() => { const sh = document.querySelector('.shelf'); if (sh) sh.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
			await wait(900);
		});
		await point(page, '.shelf', s.close, { pad: 6 });
		await hush(page);
	}
};
