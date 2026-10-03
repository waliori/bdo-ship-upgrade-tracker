// Bartering, part six: a day for Crow Coins.
//
// The same board climbed to Level 4 and cashed in at the islands that
// pay in coins. The sailor's purse is 2,000 against builds that want
// nearly twenty thousand from the Crow Coin Shop, and the Iliya storage
// holds a few Level 4s and 3s to start from -- so the run is counted in
// coins, and against what is still short.
//
// The Market is the recorded day (stageSea), as in the parts before.

import {
	seed, tab, click, say, hush, wait, waitFor, film, card,
	doing, spot, stageSea, nameBoard
} from '../drive.mjs';
import { point } from '../guide-kit.mjs';
import { barterCoins } from '../states.mjs';

export default {
	id: 'barter-coins',
	title: 'A Crow Coin Day',
	at: 'barter',
	blurb: 'The board climbed to Level 4 and cashed in at the coin islands: the coin node on the ladder, floors held back, the runs counted in coins as a range, chains started from Level 4s in storage, and how many more runs the builds still want.',
	staged: true,
	say: {
		open: 'Bartering, part six. A day for Crow Coins.',
		setup: 'This sailor has 2,000 Crow Coins, and their builds want nearly twenty thousand from the Crow Coin Shop. The storage at Iliya holds a few Level 3 and Level 4 goods.',
		goal: 'Click "Crow Coins".',
		islands: 'Every board has islands that pay in Crow Coins, and they take a Level 4 and nothing else. So a coin day is a climb to Level 4, cashed in.',
		node: 'The ladder shows it: Level 4 is cashed in, and the Crow Coins node beside it is the goal. On a silver day, that same node switches the day to coins.',
		floor: 'A keep number at Level 4 is held back from the coin islands too. A Level 4 you keep is one you do not cash.',
		tiles: 'Climb to Level 4, cash it in, and how many chains on today’s board end at a coin island.',

		chains: 'The chains.',
		three: 'The runs worth sailing are counted in coins now, and as a range: an island states a range, and the game pays one figure out of it. The most coins, the most an hour, the most for each unit of Parley.',
		held: 'The first chains start from what is held: one Level 4 from the Iliya storage, straight to a coin island. One trade each, since a coin island deals once a refresh.',
		start: 'Start from shows the other ways in: from the shore, or from the Level 3s in storage.',
		take: 'Take the most coins.',
		coins: 'The run: the coins, as the islands state them, and how many islands pay.',
		trades: 'The trades, and the coins each unit of Parley brings.',
		ahead: 'And the line under it, against your builds: what this run pays, how many coins are still short of what they want, and how many more runs like this one that is.',
		close: 'Load, sail and record it like any other run; the coins go into your purse with the trip. Next, a material day.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await stageSea(page, {});
		await seed(page, url, barterCoins);
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
		await doing(page, s.goal, () => click(page, '[data-act="barter-goal"][data-id="coin"]', { after: 2000 }));
		await say(page, s.islands);
		await doing(page, s.node, async () => {
			if (!(await page.$('.ladder'))) await click(page, '.plan-sec[data-sec="ladder"] [data-act="barter-sec"][data-id="ladder"]', { after: 1000 });
			await page.evaluate(() => document.querySelector('.ladder').scrollIntoView({ block: 'center', behavior: 'smooth' }));
			await wait(800);
			await spot(page, '[data-act="barter-coin-node"]', '', { pad: 14, hold: 2400 });
		});
		await spot(page, '[data-act="barter-floor"][data-lv="4"]', s.floor, { pad: 16 });
		await spot(page, '.run-tiles.ladder-tiles', s.tiles, { pad: 8 });
		await hush(page);

		await doing(page, s.chains, () => click(page, '.plan-sec[data-sec="chains"] [data-act="barter-sec"][data-id="chains"]', { after: 1600 }));
		await waitFor(page, '.proposal', { upTo: 60000, then: 300 });
		await spot(page, '.proposals', s.three, { pad: 6 });
		await point(page, 'button.chain[data-id^="hold:[Level 4]"]', s.held, { pad: 6 });
		await point(page, '.chain-starts', s.start, { pad: 6 });
		await doing(page, s.take, () => click(page, '.proposal', { after: 2400 }));
		const tile = n => `.run-tiles:not(.ladder-tiles) > :nth-child(${n})`;
		await point(page, tile(1), s.coins, { pad: 6 });
		await point(page, tile(2), s.trades, { pad: 6 });
		await point(page, '.run-ahead', s.ahead, { pad: 6 });
		await say(page, s.close);
		await hush(page);
	}
};
