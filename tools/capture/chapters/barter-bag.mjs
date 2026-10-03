// Bartering, part nine: the character bag.
//
// The sailor's own inventory used as a second hold: switched on under
// Before you sail with the Inventory window's two bars, then the same
// board from Iliya planned twice -- light and fast, where the plan says
// why the bag went unused, and the whole board at full speed, where a
// later trip's goods ride in the bag and come out at a wharf on the way.
//
// The Market is the recorded day (stageSea), as in the parts before.

import {
	seed, tab, click, say, hush, wait, waitFor, film, card,
	doing, stageSea, nameBoard, typeInto
} from '../drive.mjs';
import { point } from '../guide-kit.mjs';
import { barterHand } from '../states.mjs';

/** Mark the first element under `sel` whose text starts with `re`, so a
 *  beat can light the one block it is about. */
const mark = (page, sel, re, name) => page.evaluate((sel, src, name) => {
	const el = [...document.querySelectorAll(sel)].find(e => new RegExp(src, 'i').test((e.innerText || '').trim()));
	if (el) el.dataset.film = name;
}, sel, re.source, name);

export default {
	id: 'barter-bag',
	title: 'The Character Bag',
	at: 'barter',
	blurb: 'Your own inventory as a second hold: the two bars from the Inventory window, what the bag can take, why a run leaves it unused, a later trip’s goods riding in it, and where they come out.',
	staged: true,
	say: {
		open: 'Bartering, part nine. Your character’s bag, used as a second hold.',
		setup: 'Same sailor, same board, sailing from Iliya. Your inventory weighs nothing on the ship, so goods for a later chain can ride in it.',
		before: 'It is switched on under Before you sail. Find "your bag", and click "a second hold".',
		bars: 'It needs the two bars at the foot of the game’s Inventory window. Weight: 612.4 of a 2,150 LT limit.',
		slots: 'And Inventory Slot: 96 of 192 filled.',
		shot: 'Or click "Read the Inventory window" and give it a screenshot: it reads both.',
		free: 'The app works out the room: a bag carries up to 170 percent of your weight limit, less what it already holds, in the slots still empty. Here, 3,042 LT and 96 slots.',
		rules: 'Goods in the bag go in and out at any wharf’s Load Cargo. Sales stay at the seven wharves with a storage keeper. And Level 5 and up, and Great Ocean goods, take a slot each in the bag too.',

		/* --- unused --- */
		fast: 'Now sail it "An hour at most".',
		unused: 'A short run, and the hold has room: the hold tile says the bag is not used, and why. A run with the bag is only kept when it pays better an hour.',

		/* --- used --- */
		steady: 'Switch to the whole board at full speed, and take the most silver.',
		used: 'A long run in trips, and this time the bag carries part of it: the hold tile says how much of the bag, at most.',
		load: 'At the wharf, the bag has its own group on the packing list: what goes into your bag, from the Iliya storage, with the LT and slots it takes.',
		trip: 'And the trip it is for says where it comes out of the bag: at a wharf on the way, before the chain that needs it.',
		route: 'In the route, that wharf stop says the same: out of your bag, aboard.',
		close: 'Leave the bag on, and every run is planned both ways and the better one kept. That is the last of the barter parts.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await stageSea(page, {});
		await seed(page, url, barterHand);
		await tab(page, 'barter', { after: 1200 });
		await nameBoard(page);
		await page.evaluate(() => document.querySelector('[data-act="barter-sec"][data-id="parley"]').click());
		await wait(800);
		await page.evaluate(() => [...document.querySelectorAll('[data-act="barter-order"][data-k="barter-port"]')].find(b => /Iliya/.test(b.innerText)).click());
		await wait(2000);
		await page.evaluate(() => window.scrollTo(0, 0));
		await wait(500);

		const bagRow = async () => {
			await mark(page, '.order-row', /^your bag/, 'bag');
			return '.order-row[data-film="bag"]';
		};
		const allOpen = () => page.evaluate(() => document.querySelector('[data-act="barter-sec"][data-id="all"]').click()).then(() => wait(1400));

		await film(page, `${ctx.out}/${ch.id}.webm`);
		await card(page, ch.n || 'Bartering', ch.title, { line: s.open });
		await say(page, s.setup);
		await doing(page, s.before, async () => {
			const row = await bagRow();
			await page.evaluate(sel => document.querySelector(sel).scrollIntoView({ block: 'center', behavior: 'smooth' }), row);
			await wait(700);
			const on = await page.evaluateHandle(() => [...document.querySelectorAll('[data-act="barter-order"][data-k="barter-bag"]')].find(b => /second hold/.test(b.innerText)));
			await click(page, on.asElement(), { after: 1400 });
		});
		await doing(page, s.bars, async () => {
			await typeInto(page, '[data-act="barter-bag-set"][data-k="now"]', '612.4', { after: 500 });
			await typeInto(page, '[data-act="barter-bag-set"][data-k="max"]', '2150', { after: 700 });
		});
		await doing(page, s.slots, async () => {
			await typeInto(page, '[data-act="barter-bag-set"][data-k="used"]', '96', { after: 500 });
			await typeInto(page, '[data-act="barter-bag-set"][data-k="slots"]', '192', { after: 900 });
		});
		await point(page, '[data-act="barter-bag-shot"]', s.shot, { pad: 10 });
		await point(page, '.bag-free', s.free, { pad: 8 });
		await point(page, await bagRow(), s.rules, { pad: 6 });
		await hush(page);

		/* --- unused ----------------------------------------------- */
		await doing(page, s.fast, async () => {
			await allOpen();
			await click(page, '[data-act="barter-sail-preset"][data-id="hour"]', { after: 2800 });
		});
		await point(page, '.plan-sec[data-sec="chains"] .run-tiles:not(.ladder-tiles) > :nth-child(3)', s.unused, { pad: 6 });
		await hush(page);

		/* --- used ------------------------------------------------- */
		await doing(page, s.steady, async () => {
			await click(page, '[data-act="barter-sail-preset"][data-id="steady"]', { after: 2800 });
			await allOpen();
			await waitFor(page, '.proposal', { upTo: 60000, then: 200 });
			await click(page, '.proposal', { after: 2800 });
		});
		await point(page, '.plan-sec[data-sec="chains"] .run-tiles:not(.ladder-tiles) > :nth-child(3)', s.used, { pad: 6 });
		await click(page, '[data-act="barter-step"][data-id="load"]', { after: 2400 });
		await mark(page, '.pack-group', /^into your bag/, 'bag');
		await point(page, '.pack-group[data-film="bag"]', s.load, { pad: 6 });
		await mark(page, '.trip-card.later', /out of your bag/, 'bagtrip');
		await point(page, '.trip-card[data-film="bagtrip"]', s.trip, { pad: 4 });
		await mark(page, '.run-stop.wharf', /out of your bag, aboard/, 'bagstop');
		await point(page, '.run-stop[data-film="bagstop"]', s.route, { pad: 4 });
		await say(page, s.close);
		await hush(page);
	}
};
