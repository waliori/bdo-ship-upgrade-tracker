// Bartering, part seven: a material day.
//
// A refresh dealt the ship material list, not the trade goods. The
// sailor is building two Caravel parts -- Upgraded Plating and the
// Mayna Cannon -- and holds Level 3 and 4 goods at Port Epheria to hand
// over. Two pages of the game's barter window (shot 2026-09-24, layout
// M37) name the list; the run is planned toward what the builds are
// short of; the material book, the islands for one material, and the
// To Get screen's own reading of the same board follow.
//
// The Market is the recorded day (stageSea), as in the parts before.

import path from 'node:path';
import {
	seed, tab, click, say, hush, wait, waitFor, film, card, still,
	doing, spot, stageSea
} from '../drive.mjs';
import { point } from '../guide-kit.mjs';
import { barterCaravel } from '../states.mjs';

const shot = name => path.resolve(`tools/capture/chapters/${name}`);

/** Read one page of the window off a screenshot, through the paste
 *  zone's own file chooser, and wait for the rows. */
async function readPage(page, file) {
	const [chooser] = await Promise.all([
		page.waitForFileChooser(),
		click(page, '.barter-screen [data-act="barter-shot"]', { after: 300 })
	]);
	await chooser.accept([file]);
	await waitFor(page, '#dialog .shot-table', { upTo: 240000, then: 600 });
}

export default {
	id: 'barter-material',
	title: 'A Material Day',
	at: 'barter',
	blurb: 'The ship material list read off two screenshots and named as one of 41 layouts, the materials your builds are short of, the islands that deal one, the run toward them, the material book, and To Get’s own reading of today’s board with Sail it.',
	say: {
		open: 'Bartering, part seven. A material day: the refresh dealt the ship material list.',
		setup: 'This sailor is building two Caravel parts, the Upgraded Plating and the Mayna Cannon, and keeps Level 3 and 4 goods at Port Epheria to hand over.',
		goal: 'Click "A material". The tab now reads the ship material list instead of the trade goods.',
		list: 'The material list is one of the game’s forty-one material layouts, M1 to M41. Name it, and every island on it is known.',
		game: 'Open Barter Information in the game, on the ship material list, and take a screenshot of the whole window.',
		paste: 'Paste it here, or click the box and choose the file.',
		rows: 'Each row paying a ship material is read and matched against what that island deals.',
		answer: 'Answer them.',
		head: 'The window’s head is read too: the Parley and your Total Barters. The app offers to write them in.',
		fits: 'Seven islands fit three layouts. The bar says which island tells them apart, so read one more page.',
		second: 'The second page.',
		named: 'Layout M37. It agrees at every island read, and its other islands are filled in from the layout.',

		/* --- the plan --- */
		wanted: 'The materials wanted: everything on this list your builds are short of, with how many.',
		short: 'Pure Pearl Crystal: two islands today you can trade with, and the Parley it costs.',
		cant: 'Moon Scale Plywood: no island today deals it for a good you hold. Those are kept on the list and said plainly.',
		isles: '"The islands" lists who deals a material today, best payers first: the good each takes, how many times a day, and what you hold of it. And the ones you cannot do today, because the give is not held.',
		how: 'How to sail it: for the wants and then home, or every island you can trade with; the island order; vouchers; quests on the way; and whether goods stored at another harbour are fetched on the way.',
		comes: 'And what comes of it: how many of each want this refresh brings, and how many are still wanted after.',
		none: 'What nothing on this list deals is said too.',
		figs: 'The islands, the trades, the harbour call to load the Level 3s from Port Epheria, the hold, the time and the Parley.',

		/* --- the book --- */
		book: 'The material book shows all forty-one layouts, with what each one pays.',
		page: 'Open M37, today’s, island by island.',

		/* --- to get --- */
		toget: 'The To Get screen reads the same board. Open To Get.',
		today: 'Today’s board: on the material list, layout M37 — what it deals toward your list today, island by island, and what each brings.',
		tick: 'Tick an island off when you have traded there.',
		blocked: 'The islands that cannot be done today are folded below.',
		sail: '"Sail it on the Barter tab" hands this board to the Barter tab, and the run is planned the same way.',
		close: 'A refresh deals the material list or the trade goods, never both. Reading one puts down the other. Next, a short trip.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await stageSea(page, {});
		await seed(page, url, barterCaravel);
		await tab(page, 'barter', { after: 1400 });

		await film(page, `${ctx.out}/${ch.id}.webm`);
		await card(page, ch.n || 'Bartering', ch.title, { line: s.open });
		await say(page, s.setup);
		await doing(page, s.goal, () => click(page, '[data-act="barter-goal"][data-id="material"]', { after: 2000 }));
		await say(page, s.list);
		await still(page, shot('material-window.webp'), { line: s.game });
		await doing(page, s.paste, () => readPage(page, shot('material-window.webp')));
		await spot(page, '#dialog .shot-table', s.rows, { pad: 4 });
		await point(page, '#dialog .inline-check', s.head, { pad: 6 });
		await doing(page, s.answer, () => click(page, '#dialog [data-use]', { after: 2400 }));
		await point(page, '.barter-screen section.panel', s.fits, { pad: 4 });
		await doing(page, s.second, async () => {
			await readPage(page, shot('material-window-2.webp'));
			await click(page, '#dialog [data-use]', { after: 2400 });
		});
		await point(page, '.barter-screen section.panel', s.named, { pad: 4 });
		await hush(page);

		/* --- the plan --------------------------------------------- */
		await doing(page, s.wanted, async () => {
			await page.evaluate(() => document.querySelector('.plan-sec[data-sec="ladder"]').scrollIntoView({ block: 'start', behavior: 'smooth' }));
			await wait(800);
		});
		// The rows carry no name of their own, so the two talked about
		// are marked by the material they are for.
		await page.evaluate(() => {
			for (const sec of document.querySelectorAll('.mat-need')) {
				const t = sec.innerText || '';
				if (t.startsWith('Pure Pearl Crystal')) sec.dataset.film = 'pearl';
				if (t.startsWith('Moon Scale Plywood')) sec.dataset.film = 'moon';
			}
		});
		await point(page, '.mat-need[data-film="pearl"]', s.short, { pad: 6 });
		await point(page, '.mat-need[data-film="moon"]', s.cant, { pad: 6 });
		await doing(page, s.isles, () => click(page, '[data-act="barter-mat-isles"]', { after: 1800 }));
		await page.keyboard.press('Escape');
		await wait(600);
		// Opened if shut, never pressed shut: the head is a toggle.
		const open = async id => {
			if (!(await page.$(`.plan-sec[data-sec="${id}"].open`))) await click(page, `.plan-sec[data-sec="${id}"] [data-act="barter-sec"][data-id="${id}"]`, { after: 1400 });
			await page.evaluate(i => document.querySelector(`.plan-sec[data-sec="${i}"]`).scrollIntoView({ block: 'start', behavior: 'smooth' }), id);
			await wait(800);
		};
		await doing(page, s.how, () => open('how'));
		await doing(page, s.comes, () => open('chains'));
		await say(page, s.none);
		await say(page, s.figs);
		await hush(page);

		/* --- the book --------------------------------------------- */
		await doing(page, s.book, async () => {
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await wait(600);
			await click(page, '[data-act="barter-mat-book"]', { after: 1800 });
		});
		await doing(page, s.page, () => click(page, '[data-mb-open="M37"]', { after: 1800 }));
		await page.keyboard.press('Escape');
		await wait(600);
		await hush(page);

		/* --- to get ----------------------------------------------- */
		await doing(page, s.toget, () => tab(page, 'get', { after: 2400 }));
		await spot(page, '.get-today', s.today, { pad: 6 });
		await point(page, '[data-act="get-today-tick"]', s.tick, {
			pad: 10,
			act: () => click(page, '[data-act="get-today-tick"]', { after: 900 })
		});
		await point(page, '[data-act="get-today-blocked"]', s.blocked, { pad: 8 });
		await doing(page, s.sail, () => click(page, '.get-today [data-act="view"][data-id="barter"]', { after: 2400 }));
		await say(page, s.close);
		await hush(page);
	}
};
