// Bartering, part two: a day for silver, planned.
//
// The board is named off camera -- part one shows how -- and the film
// walks the plan's four parts in the order the tab asks them: what the
// bar holds and where the ship sails from, where today's climb ends,
// how it is sailed, and the chains. The sailor has last week's goods in
// the Iliya storage at every level, so the plan has a choice to make
// between buying ashore and climbing from what is held.
//
// The Central Market is the recorded day the tests plan against
// (stageSea), so the chains and the one shelf that is bare on it are
// the same on every shoot; the film says so.

import {
	seed, tab, click, typeInto, say, hush, wait, onScreen, waitFor, film, card,
	doing, spot, stageSea, nameBoard
} from '../drive.mjs';
import { point } from '../guide-kit.mjs';
import { barterHand } from '../states.mjs';

const sec = id => `.plan-sec[data-sec="${id}"]`;

export default {
	id: 'barter-silver',
	title: 'A Silver Day',
	at: 'barter',
	blurb: 'The plan for silver, part by part: the Parley and the vouchers, the home port, where the climb ends and what the wharf sells, the five ways to sail it and every order behind them, and the chains — three runs proposed, the Market’s counts, a chain started from your own storage.',
	staged: true,
	say: {
		open: 'Bartering, part two. A day for silver: climb the chains on today’s board and sell the tops at a wharf.',
		setup: 'The board is already named — layout 4, as in part one. This sailor has last week’s goods in the Iliya storage, at every level.',
		market: 'One note: the Central Market in this film is a recorded day, so the run plans the same every time it is shot.',
		plan: 'The plan has four parts, and each one opens when the one before is settled.',

		/* --- 1. before you sail --- */
		before: 'One: Before you sail.',
		parley: 'The Parley in your bar now, as the head of the barter window shows it. This sailor has already spent some today: 742,300 is left.',
		vouchers: 'Vouchers carried. Each Crow’s Trade Voucher puts 250,000 Parley back, on a two-hour cooldown.',
		port: 'Your home port: where the run leaves from, comes back to, and whose storage it loads from. This sailor keeps goods at Iliya Island, so click Iliya.',
		pauses: 'How long a stop takes apart from the sailing. Only the clock uses these.',
		bag: 'And your bag as a second hold, which has a part of its own.',

		/* --- 2. where today ends --- */
		ends: 'Two: where today ends.',
		ladder: 'This ladder runs from the shore to Level 7. Under each level: how many you hold, what happens to them, and how many to keep back.',
		rung: 'Click a level, and the climb ends there. At Level 5, nothing is carried past it.',
		top: 'Click Level 7 again. Today we climb to the top.',
		fate: 'The tag under a level says what the wharf does with it. Tap "sold" and Level 5 is kept as stock instead…',
		fateback: '…tap again, and it is sold.',
		keep: 'A keep number is a floor. Keep 4 at Level 4, and the run never hands over or sells the last four.',
		tiles: 'The line under the ladder says it in words: climb to Level 7, sell Level 5 and up, and how many chains on today’s board fit that.',

		/* --- 3. how to sail it --- */
		how: 'Three: how to sail it. Five ways, and under each, the best run the search finds sailing that way today.',
		fast: 'Light and fast keeps the hold under its limit, and calls at a wharf only when one lies on the way and pays for the minute it costs.',
		hour: 'An hour at most is the best run that fits in about an hour. Click a card, and the run is sailed that way; the line under each card says what your own ticked chains come to sailed that way.',
		whole: 'The whole board at full speed takes every trade, and drops goods at a wharf whenever the hold fills.',
		heavy: 'Loaded heavy takes every trade too: the wharf loads to the limit, the exchanges push the hold past it, and the ship sails slower with fewer wharf calls.',
		nosilver: 'Spend no silver uses only goods you already own.',
		own: 'My own way opens every order behind those cards.',
		orders: 'Where land goods come from — bought ashore, from your storage, or only what is held. The pace. A time limit. Whether vouchers are drawn on. The way round. Which storage the wharf calls use. BreezySail, for the rations. And quests on the way.',
		side: 'Also trade for: chains that end in ship materials, Great Ocean goods, and Lost Trade Boxes. Great Ocean goods are on by default and sold like a Level 7.',
		save: 'A way of sailing you like can be kept under a name. Click "save these"…',
		named: '…name it, and it is one click next time: the ladder, the orders, the port, all set back at once.',
		back: 'Back to Light and fast.',

		/* --- 4. the chains --- */
		chains: 'Four: the chains on offer.',
		three: 'It has already found the runs worth sailing on this board: the most silver, the most an hour, and the most for each unit of Parley. They are rarely the same run.',
		take: 'Click one, and its chains are ticked for you.',
		card: 'Each card is one chain. Where its first good comes from, the levels it climbs, its islands in order, and what it pays sailed on its own: silver, silver per Parley unit, silver an hour.',
		starts: 'Start from: a chain can start at the shore, or from a good you already hold part-way up the same climb. Here, the Round Knives in the Iliya storage.',
		held: 'This chain starts from Level 4 Panaceas in the Iliya storage, loaded before casting off. Nothing is bought for it.',
		dry: 'A chain that starts ashore buys its first good on the Central Market, and is held to what is listed there. This one needs Fine Fancy Feathers, and the Market has none, so it cannot be ticked and says why.',
		search: 'Search the chains for an island or a good, or narrow them to what is held, what is bought ashore, or the level a chain reaches.',
		tick: 'Or tick chains yourself. Every tick re-plans the whole run.',
		fill: '"Fill the rest for me" adds the best chains around the ones you picked.',
		run: 'Under the chains, the run adds up.',
		silver: 'Silver, net of the land goods bought.',
		unit: 'What one unit of Parley pays, and the Parley the run spends.',
		hold: 'The hold at its fullest, in LT and in slots. Level 5 and up, and Great Ocean goods, take a slot each; the levels under them stack, one slot a kind.',
		end: 'The Parley left at the end, and how many of your vouchers the run draws on.',
		under: 'And the time under way, at your ship’s own speed.',
		range: 'Some islands pay a range. The run is laid at the least; the best case is beside it.',
		warn: 'If a ticked chain cannot get to the top — the hold shared out, or a chain that needs the same goods — it is said here, with the fix.',
		dock: 'The bar at the foot keeps the run’s totals in sight.',
		close: 'That is the plan. Load at the wharf, and the run is laid stop by stop.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await stageSea(page, {});
		await seed(page, url, barterHand);
		await tab(page, 'barter', { after: 1200 });
		await nameBoard(page);
		await film(page, `${ctx.out}/${ch.id}.webm`);
		await card(page, ch.n || 'Bartering', ch.title, { line: s.open });

		await spot(page, '.board-strip', s.setup, { pad: 6 });
		await say(page, s.market);
		await say(page, s.plan);
		await hush(page);

		/* --- 1. before you sail ----------------------------------- */
		await doing(page, s.before, () => click(page, `${sec('parley')} [data-act="barter-sec"][data-id="parley"]`, { after: 900 }));
		await spot(page, '[data-act="parley-held"]', s.parley, { pad: 12 });
		await spot(page, '[data-act="vouchers"]', s.vouchers, { pad: 12 });
		await doing(page, s.port, () => page.evaluate(() => {
			const b = [...document.querySelectorAll('[data-act="barter-order"][data-k="barter-port"]')].find(x => /Iliya/.test(x.innerText));
			b.scrollIntoView({ block: 'center', behavior: 'smooth' });
		}).then(() => wait(600)).then(async () => {
			const el = await page.evaluateHandle(() => [...document.querySelectorAll('[data-act="barter-order"][data-k="barter-port"]')].find(x => /Iliya/.test(x.innerText)));
			await click(page, el.asElement(), { after: 1500 });
		}));
		await spot(page, '.run-pauses', s.pauses, { pad: 8 });
		await point(page, '[data-act="barter-order"][data-k="barter-bag"]', s.bag, { pad: 10 });
		await hush(page);

		/* --- 2. where today ends ---------------------------------- */
		await doing(page, s.ends, () => click(page, `${sec('ladder')} [data-act="barter-sec"][data-id="ladder"]`, { after: 1000 }));
		await spot(page, '.ladder', s.ladder, { pad: 8 });
		await doing(page, s.rung, () => click(page, '[data-act="barter-rung"][data-lv="5"]', { after: 1400 }));
		await doing(page, s.top, () => click(page, '[data-act="barter-rung"][data-lv="7"]', { after: 1400 }));
		await doing(page, s.fate, () => click(page, '[data-act="barter-fate"][data-lv="5"]', { after: 1200 }));
		await doing(page, s.fateback, () => click(page, '[data-act="barter-fate"][data-lv="5"]', { after: 1200 }));
		// The ladder redraws as the plan behind it settles, and a field
		// found a moment before can be gone by the press: asked again.
		await doing(page, s.keep, async () => {
			for (let go = 0; ; go++) {
				try { return await typeInto(page, '[data-act="barter-floor"][data-lv="4"]', '4', { after: 1200 }); }
				catch (e) { if (go >= 2 || !/detached|not clickable/i.test(e.message)) throw e; await wait(700); }
			}
		});
		await spot(page, '.run-tiles.ladder-tiles', s.tiles, { pad: 8 });
		await hush(page);

		/* --- 3. how to sail it ------------------------------------ */
		await doing(page, s.how, () => click(page, `${sec('how')} [data-act="barter-sec"][data-id="how"]`, { after: 1600 }));
		await spot(page, '[data-act="barter-sail-preset"][data-id="quick"]', s.fast, { pad: 6 });
		await doing(page, s.hour, () => click(page, '[data-act="barter-sail-preset"][data-id="hour"]', { after: 1600 }));
		await spot(page, '[data-act="barter-sail-preset"][data-id="steady"]', s.whole, { pad: 6 });
		await spot(page, '[data-act="barter-sail-preset"][data-id="full"]', s.heavy, { pad: 6 });
		await spot(page, '[data-act="barter-sail-preset"][data-id="own"]', s.nosilver, { pad: 6 });
		await doing(page, s.own, () => click(page, '[data-act="barter-adv"]', { after: 1400 }));
		await point(page, `${sec('how')} .order-rows:not(.side-rows)`, s.orders, { pad: 6 });
		await point(page, '.side-rows', s.side, { pad: 6 });
		await doing(page, s.save, () => click(page, '[data-act="barter-save"]', { after: 900 }));
		await doing(page, s.named, async () => {
			await page.keyboard.type('Iliya, light', { delay: 70 });
			await wait(400);
			await click(page, '#dialog [data-save]', { after: 1200 });
			if (await onScreen(page, '.orders-saved')) await spot(page, '.orders-saved', '', { pad: 8, hold: 1200 });
		});
		await doing(page, s.back, () => click(page, '[data-act="barter-sail-preset"][data-id="quick"]', { after: 1600 }));
		await hush(page);

		/* --- 4. the chains ---------------------------------------- */
		await doing(page, s.chains, () => click(page, `${sec('chains')} [data-act="barter-sec"][data-id="chains"]`, { after: 1600 }));
		await waitFor(page, '.proposal', { upTo: 60000, then: 300 });
		await spot(page, '.proposals', s.three, { pad: 8 });
		await doing(page, s.take, () => click(page, '.proposal', { after: 1800 }));
		await spot(page, 'button.chain.on', s.card, { pad: 6 });
		await point(page, '.chain-starts', s.starts, { pad: 6 });
		await point(page, 'button.chain[data-id^="hold:[Level 4]"]', s.held, { pad: 6 });
		await point(page, '.chain.dry', s.dry, { pad: 6 });
		await spot(page, '[data-act="barter-chain-q"]', s.search, { pad: 10 });
		await doing(page, s.tick, () => click(page, 'button.chain:not(.on):not(.dry):not(:disabled)', { after: 1600 }));
		if (await onScreen(page, '[data-act="barter-fill"]')) await doing(page, s.fill, () => click(page, '[data-act="barter-fill"]', { after: 2000 }));
		await hush(page);

		await page.evaluate(() => { const t = document.querySelectorAll('.run-tiles')[1]; if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
		await wait(800);
		await say(page, s.run);
		const tile = n => `.run-tiles:not(.ladder-tiles) > :nth-child(${n})`;
		await point(page, tile(1), s.silver, { pad: 6 });
		await point(page, tile(2), s.unit, { pad: 6 });
		await point(page, tile(3), s.hold, { pad: 6 });
		await point(page, tile(4), s.end, { pad: 6 });
		await point(page, tile(5), s.under, { pad: 6 });
		await point(page, '.pay-range', s.range, { pad: 6 });
		await point(page, '.run-cut', s.warn, { pad: 6 });
		await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
		await wait(900);
		await say(page, s.dock);
		await say(page, s.close);
		await hush(page);
	}
};
