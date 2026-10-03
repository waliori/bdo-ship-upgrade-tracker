// Bartering, part one: today's board.
//
// Every run on the trade goods list is planned on one layout of forty,
// and nothing on the Barter tab means anything until it is named. So
// the series opens on naming it -- by an island, by a screenshot, by
// another sailor's reading -- and on everything the bar says once it
// is named: the rolls, the islands your count has not opened, the
// layout book, an island that shows something else, and the refresh
// that throws it all away again.
//
// The fleet in this chapter is staged (stageSea): a capture machine has
// no other sailors to read the board for it, and the film says so in
// its own voice before it shows one.

import path from 'node:path';
import {
	seed, tab, click, typeInto, say, hush, wait, onScreen, waitFor, film, card, still,
	doing, clickText, spot, stageSea
} from '../drive.mjs';
import { QUEUED, point } from '../guide-kit.mjs';
import { useGame } from '../../../js/barter-layouts.js';
import * as GAME from '../../../js/barter_game.js';

/** What the staged fleet has read: layout 4 today, by Ahab and by a
 *  sailor shown without a name, and older readings for the book --
 *  one of them a layout 16 with two slots moved, which is the board
 *  nobody has on file. */
function fleetReadings() {
	const combos = useGame(GAME).combos;
	const of = id => combos.find(c => c.id === id).offers.map(o => o.slice(0, 4));
	const moved = of('16').slice(20, 46).map(o => [...o]);
	for (const [i, from] of [[3, '20'], [9, '5']]) {
		const o = of(from).find(x => x[0] === moved[i][0] && (x[1] !== moved[i][1] || x[3] !== moved[i][3]));
		if (o) moved[i] = [moved[i][0], o[1], '1', o[3]];
	}
	const reading = (id, day, offers, name, seen) => ({ id, day, layout: null, offers, at: 100 - id, seen, name, mine: false, confirmed: false });
	return [
		reading(1, 'today', of('4').slice(0, 26), 'Ahab', 4),
		reading(2, 'today', of('4').slice(30, 42), null, 1),
		reading(3, '2026-09-28', moved, 'Queequeg', 2),
		reading(4, '2026-09-25', of('7').slice(10, 22), 'Starbuck', 0),
		reading(5, '2026-09-21', of('23').slice(0, 40), 'Ishmael', 6),
		reading(6, '2026-09-18', of('31').slice(0, 25), 'Pip', 1)
	];
}

export default {
	id: 'barter-board',
	title: 'Today’s Board',
	at: 'barter',
	blurb: 'The layout named three ways — an island, a screenshot, another sailor’s reading — and everything the bar says once it is: the rolls, the islands your count has not opened, the layout book, an island that shows something else, and the refresh.',
	staged: true,
	say: {
		open: 'Bartering, part one. Before the app can plan a run, it has to know which board the game dealt you.',

		/* --- what the day is for --- */
		goals: 'The Barter tab starts with what today is for. Silver, a stock and Crow Coins all sail the trade goods list. A material reads the ship material list.',
		refresh: 'A Barter Refresh deals one of those two lists, never both. This part is about the trade goods list; materials have a part of their own.',

		/* --- the board --- */
		forty: 'The trade goods list is always one of the game’s forty layouts. Name the layout, and every island’s offer is known.',
		ways: 'There are three ways to name it: one island, a screenshot, or another sailor’s reading.',
		suggest: 'This button is the quickest by hand. It asks about the island that tells the layouts apart best — here, Baeza Island.',
		island: 'But you can look at any island. Click "another island".',
		list: 'The islands that split the layouts best come first. Islands your Total Barters have not opened are greyed, with the count that opens them.',
		eveto: 'Type Eveto, and pick it.',
		offers: 'Now it lists every offer Eveto can show, and how many of the forty layouts have each one.',
		game: 'In the game, open Barter Information and find Eveto Island. It hands over Essence of Liquor for a Level 1 Cherry Tree Seed Pouch.',
		same: 'Pick that same trade here.',
		again: 'If two layouts still fit, it asks about one more island.',
		named: 'One island was enough. Today is layout 4.',
		chains: 'Every chain this board allows is already worked out further down the tab.',
		me: 'Beside the layout: your barter count and barter level, taken from the sailor bar at the top of the page.',
		parley: 'And your Parley. A dashed outline means assumed: the bar refills to one million at every Barter Refresh, so a full bar is the guess until you type yours.',
		seen: 'The islands you looked at are kept here, with an Undo for the last one.',

		/* --- the rolls --- */
		rolls: 'A layout does not fix every island. This chip says how many islands draw their offer at random.',
		rollsdlg: 'Some Level 4 islands pay a Level 5 good on one refresh and Crow Coins on another. Until you say which, the likelier one is planned on.',
		pick: 'Pujara Island shows Crow Coins in my window, so I click that.',
		pools: 'Further down, islands that draw from a pool of offers: materials, Tidal Black Stone, a Lost Trade Box. Nothing is planned on those until you say what they show.',

		/* --- the count --- */
		gated: 'This line counts the islands your barter count has not opened. The game opens each exchange at its own count, so these show nothing to you today.',
		which: '"Which ones" lists them, grouped by the count that opens them. The run is planned without them.',
		count: 'Your count lives in the sailor bar. Open it, and set Total Barters to 1,082 — a newer sailor.',
		fewer: 'Now many more islands are shut, and every chain that climbs through one is gone from the plan.',
		back: 'Put it back to 4,205. Recording a trip adds its trades to this count for you.',

		/* --- a screenshot --- */
		undo: 'Now the second way. Press "Refreshed in game" — what you do after every refresh — and the board is a question again.',
		shot: 'Take a screenshot of the same Barter Information window, and paste it with Control V — or click the box and choose the file.',
		rows: 'Every row is read: the island, what it takes, and what it pays.',
		match: 'Each row is matched against what that island is known to deal, so a name the window cut short still reads. Every row can be corrected from its list.',
		answer: 'Answer the six islands, and the layout is named from all of them at once. Nothing is uploaded; the reading happens in your browser.',

		/* --- the fleet --- */
		staged: 'The third way needs other sailors. The fleet in this part is staged: a machine recording a film has nobody else on its server.',
		clear: 'Throw the board away once more.',
		fleet: 'When a signed-in sailor has read today’s board, the bar says so: who read it, how many islands, and how many others saw the same.',
		take: 'Click "take their reading", and every island they named is answered for you.',

		/* --- the book --- */
		book: 'The layout book keeps all forty layouts.',
		shelf: 'Each card shows the land goods its Level 1 islands want, the goods its coin islands take, how many exchanges it has at each level, and how often it has been seen.',
		filters: 'Filter them: all forty, the ones still standing today, the ones the fleet has read, and yours — the boards you have been dealt yourself.',
		stray: 'Above the shelf: boards that sailors read and that fit no layout on file, each with the layout it is nearest to.',
		page: 'Open a layout, and it lists every island level by level. Islands you saw today are ticked; the ones above your count are locked.',
		level: 'The level chips narrow it, say to the Level 5 exchanges.',
		search: 'And the search finds a layout by an island, a good or its number.',

		/* --- an island that differs --- */
		fix: 'Sometimes an island in game shows something the layout does not. Click "An island shows something else".',
		which2: 'It lists every island, and beside each one what today’s board says it shows. Pick the island.',
		else: 'Ostra Island should show Rare Herb Pile. Mine shows Gooey Monster Blood, so I choose "Something else"…',
		pickit: '…and pick it from every exchange Ostra is known to deal.',
		patched: 'The board is now layout 4 with one island as you saw it. The game moves a slot at a maintenance without renumbering the layout, and the run is planned on what you saw.',
		tell: 'That is a reading worth passing on, so "Tell the fleet" appears. It needs you signed in: the reading goes up with your name on it.',

		/* --- the refresh --- */
		refreshed: 'One last press of "Refreshed in game". Besides forgetting the board, it sets your Parley back to a full bar, because the game refills it at every refresh.',
		material: 'Choose a material, and the tab reads the ship material list instead. Naming one list puts down the other, because a refresh deals only one.',
		close: 'That is the board. The next parts plan runs on it.'
	},

	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		// The fleet and the Market are answered inside the page: the
		// fleet because there is none, the Market so that a chain that
		// can start today can start every time this is shot.
		await stageSea(page, { boards: fleetReadings() });
		await seed(page, url, QUEUED);
		await film(page, `${ctx.out}/${ch.id}.webm`);
		await card(page, ch.n || 'Bartering', ch.title, { line: s.open });

		await tab(page, 'barter', { after: 1400 });

		/* --- what the day is for ---------------------------------- */
		await spot(page, '.goal-cards', s.goals, { pad: 8 });
		await say(page, s.refresh);
		await hush(page);

		/* --- one island ------------------------------------------- */
		await spot(page, '.board-ask', s.forty, { pad: 6 });
		await say(page, s.ways);
		await point(page, '[data-act="barter-board-ask"]', s.suggest, { pad: 8 });
		// Eveto rather than the island suggested, because the still that
		// follows is Eveto's row in the game's own window.
		await doing(page, s.island, () => click(page, '[data-act="barter-board-island"]', { after: 700 }));
		await spot(page, '#dialog .dialog-box', s.list, { pad: 4 });
		await doing(page, s.eveto, async () => {
			await page.type('.picker-in', 'Eveto', { delay: 60 });
			await wait(450);
			await click(page, '.picker-row', { after: 700 });
		});
		await spot(page, '#dialog .dialog-box', s.offers, { pad: 4 });
		await still(page, 'tools/capture/shots/barter-window.webp', { line: s.game });
		await doing(page, s.same, async () => {
			await page.type('.picker-in', 'Essence of Liquor', { delay: 55 });
			await wait(450);
			await clickText(page, '.picker-row', ['Essence of Liquor', 'Cherry Tree Seed Pouch'], { after: 900 });
		});
		for (let go = 0; go < 4 && !(await onScreen(page, '.board-strip')); go++) {
			if (!(await onScreen(page, '[data-act="barter-board-ask"]'))) break;
			if (go === 0) await say(page, s.again);
			await click(page, '[data-act="barter-board-ask"]', { after: 500 });
			await click(page, '.picker-row', { after: 900 });
		}
		await waitFor(page, '.board-strip', { upTo: 20000, then: 400 });
		await spot(page, '.board-strip .board-pill.lead', s.named, { pad: 8 });
		await say(page, s.chains);
		await spot(page, '.board-strip .board-pill.ok:not(.lead)', s.me, { pad: 8 });
		await spot(page, '.board-strip .board-pill.guess', s.parley, { pad: 8 });
		await spot(page, '.board-strip-seen', s.seen, { pad: 8 });
		await hush(page);

		/* --- the rolls -------------------------------------------- */
		if (await onScreen(page, '.rolls-chip')) {
			await spot(page, '.rolls-chip', s.rolls, { pad: 8 });
			await doing(page, s.rollsdlg, () => click(page, '.rolls-chip', { after: 1000 }));
			await doing(page, s.pick, () => click(page, '#dialog .roll-option:not(.on)', { after: 900 }));
			await doing(page, s.pools, () => page.evaluate(() => {
				const p = document.querySelector('#dialog .roll-row.pool');
				if (p) p.scrollIntoView({ block: 'center', behavior: 'smooth' });
			}));
			await clickText(page, '#dialog button', 'Done', { after: 700 }).catch(() => page.keyboard.press('Escape'));
			await wait(500);
			await hush(page);
		}

		/* --- the count -------------------------------------------- */
		await spot(page, '.board-shut', s.gated, { pad: 8 });
		await doing(page, s.which, () => click(page, '[data-act="barter-gated"]', { after: 1200 }));
		await page.keyboard.press('Escape');
		await wait(500);
		await doing(page, s.count, async () => {
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await wait(500);
			await click(page, '[data-act="sail-bar"]', { after: 800 });
			await typeInto(page, '[data-act="barter-count"]', '1082', { after: 900 });
		});
		await point(page, '.board-shut', s.fewer, { pad: 8 });
		await doing(page, s.back, async () => {
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await wait(500);
			await typeInto(page, '[data-act="barter-count"]', '4205', { after: 700 });
			await click(page, '[data-act="sail-bar"]', { after: 700 });
		});
		await hush(page);

		/* --- a screenshot ----------------------------------------- */
		await doing(page, s.undo, () => click(page, '.board-strip [data-act="barter-board-clear"]', { after: 1200 }));
		await doing(page, s.shot, async () => {
			const [chooser] = await Promise.all([
				page.waitForFileChooser(),
				click(page, '.board-drop[data-act="barter-shot"]', { after: 300 })
			]);
			await chooser.accept([path.resolve('tools/capture/shots/barter-window.webp')]);
		});
		await doing(page, s.rows, () => waitFor(page, '#dialog .shot-table', { upTo: 240000, then: 500 }));
		await spot(page, '#dialog .shot-table', s.match, { pad: 4 });
		await doing(page, s.answer, () => click(page, '#dialog [data-use]', { after: 1500 }));
		await waitFor(page, '.board-strip', { upTo: 20000, then: 300 });
		await hush(page);

		/* --- the fleet -------------------------------------------- */
		await say(page, s.staged);
		await doing(page, s.clear, () => click(page, '.board-strip [data-act="barter-board-clear"]', { after: 1500 }));
		await point(page, '.board-fleet', s.fleet, { pad: 8 });
		await doing(page, s.take, () => click(page, '[data-act="barter-fleet-take"]', { after: 1800 }));
		await waitFor(page, '.board-strip', { upTo: 20000, then: 300 });
		await hush(page);

		/* --- the book --------------------------------------------- */
		await doing(page, s.book, () => click(page, '.board-strip [data-act="barter-book"]', { after: 1800 }));
		await spot(page, '.lb-card.today', s.shelf, { pad: 6 });
		await point(page, '#dialog .lb-bar', s.filters, { pad: 6 });
		await point(page, '.lb-card.stray', s.stray, { pad: 6 });
		await doing(page, s.page, () => click(page, '.lb-card.today', { after: 1400 }));
		await doing(page, s.level, () => click(page, '[data-lb-level="L5"]', { after: 1200 }));
		await doing(page, s.search, async () => {
			await click(page, '[data-lb-back]', { after: 900 });
			const box = '#dialog .lb-search';
			if (await onScreen(page, box)) {
				await click(page, box, { after: 200 });
				// Typed into the box as the page has it: a key event alone
				// left the screencast showing the first letter only.
				for (let i = 1; i <= 5; i++) {
					await page.evaluate((sel, v) => {
						const box = document.querySelector(sel);
						box.value = v;
						box.dispatchEvent(new Event('input', { bubbles: true }));
					}, box, 'Ostra'.slice(0, i));
					await wait(130);
				}
				// A screencast can keep the box's tiles stale after a value
				// set from script; a thousandth of opacity draws it again.
				await page.evaluate(() => { document.body.style.opacity = '0.999'; });
				await wait(120);
				await page.evaluate(() => { document.body.style.opacity = ''; });
				await wait(900);
			}
		});
		await page.keyboard.press('Escape');
		await wait(600);
		await hush(page);

		/* --- an island that differs ------------------------------- */
		await doing(page, s.fix, () => click(page, '[data-act="barter-board-fix"]', { after: 1000 }));
		await spot(page, '#dialog .dialog-box', s.which2, { pad: 4 });
		await page.type('.picker-in', 'Ostra', { delay: 70 });
		await wait(500);
		await click(page, '.picker-row', { after: 900 });
		await doing(page, s.else, () => clickText(page, '.picker-row', 'Something else', { after: 900 }));
		await doing(page, s.pickit, () => clickText(page, '.picker-row', ['Balanced Stone Pagoda', 'Gooey Monster Blood'], { after: 1500 }));
		await waitFor(page, '.board-strip', { upTo: 20000, then: 300 });
		await spot(page, '.board-strip .board-pill.lead', s.patched, { pad: 8 });
		await point(page, '[data-act="barter-fleet-tell"]', s.tell, {
			pad: 8,
			act: () => click(page, '[data-act="barter-fleet-tell"]', { after: 600 })
		});
		await hush(page);

		/* --- the refresh ------------------------------------------ */
		await doing(page, s.refreshed, () => click(page, '.board-strip [data-act="barter-board-clear"]', { after: 1500 }));
		await doing(page, s.material, async () => {
			await click(page, '[data-act="barter-goal"][data-id="material"]', { after: 1600 });
		});
		await doing(page, s.close, () => click(page, '[data-act="barter-goal"][data-id="silver"]', { after: 1200 }));
		await hush(page);
	}
};
