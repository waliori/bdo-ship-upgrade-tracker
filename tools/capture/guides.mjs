// The guide films: seven chapters, narrated.
//
// The walkthrough in tour.mjs is one run past everything for someone who
// has never opened the app. These are the other thing -- seven parts you
// can be sent to one of, when the question is "how does the Map work"
// and not "what is this".
//
// Each chapter drives the real app against a seeded inventory, says what
// it is doing out loud, and writes two files: the silent screencast and
// a timeline of what was said and when. mix.mjs turns that pair into the
// mp4 and its captions. Nothing is staged but the harbour, for the same
// reason it is staged in tour.mjs -- a capture machine has no deployment
// with other players on it -- and the chapter says so in its own voice.
//
// The script of each chapter is the `say` block at its head, apart from
// the choreography that performs it. That split is not tidiness: every
// line is synthesised before a frame is shot, so the film can hold each
// beat for exactly as long as its sentence takes to speak, and the whole
// script has to be readable in one go for that to happen.
//
//   node tools/capture/guides.mjs <outdir> [chapter ...]
//   node tools/capture/guides.mjs tools/capture/out the-chart

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	open, seed, tab, click, clickIn, typeInto, drag, say, hush, wait,
	onScreen, headerBtn, waitFor, film, cut, card, still, choose, doing, moveTo, clickText, spot, spotAll, track, park
} from './drive.mjs';
import { warm, engine } from './voice.mjs';
import { fakeCommunity } from './fleet.mjs';
import { withPlating, QUEUED, TO_GET, point, ORDER } from './guide-kit.mjs';
import { readdir } from 'node:fs/promises';

const OUT = process.argv[2] || 'tools/capture/out';

/**
 * `point`, with a spotlight that follows its target -- for a line whose
 * action redraws the very thing it lights. Says the line over whatever
 * is there when the screen has nothing to light.
 */
async function pointAt(page, sel, line, opts = {}) {
	if (await onScreen(page, sel)) await track(page, sel, line, opts);
	else if (opts.act) await doing(page, line, opts.act);
	else await say(page, line);
}
const only = process.argv.slice(3);

/* ------------------------------------------------------------------ *
 * the chapters
 * ------------------------------------------------------------------ */

const CHAPTERS = {

	/* ============================================================== *
	 * One -- the yard
	 * ============================================================== */
	'the-yard': {
		n: 'One', title: 'The Yard', at: 'plan',
		blurb: 'The sailor bar, the build queue, the Plan, and three ways to record what you hold: typed, a whole trip, or screenshots of a storage.',
		say: {
			open: 'This is the Yard: the tabs where a build is planned. Plan, Builds, Inventory, Tree and Workshop.',

			/* --- the sailor --- */
			sailor: 'Start with the bar under the tabs. These are the numbers about you that every screen plans from. Click it open.',
			count: 'Total Barters first. Type the count your Barter window shows in game. It decides which islands will trade with you at all.',
			blevel: 'Your barter level. It sets what every exchange costs in Parley.',
			pack: 'Tick Value Pack if one is running. It adds a draw a day and takes ten per cent off the Parley.',
			corsair: 'Corsair is for a Corsair at the wheel: one per cent more speed, acceleration, turn and brake.',
			bmastery: 'Your Sailing Mastery, as the character window shows it. It counts toward speed, acceleration, turn and brake.',
			blog: 'The sailing log you carry. Its mastery is already in your total, so only its top speed is added on top.',
			pets: 'And your Bos\'n Jacks. Their talent adds fifty LT of ship weight a tier, across the five pets you can have out. Open the nest, set all five at once, and save.',
			bregion: 'Region is where the Central Market prices are read from.',
			once: 'Type them once, and every tab reads them. Fold the bar away.',

			/* --- the queue --- */
			builds: 'Now the Builds tab. This is the queue: what you mean to build, in the order you want it done.',
			add: 'Add a build. The picker takes ships, parts, or a stack of materials, and the chips narrow it down.',
			ship: 'Start with a ship: the Epheria Caravel.',
			asks: 'A Caravel can be built two ways, so it asks which. Each way shows how much material it takes in all.',
			improved: 'Take the Improved Sailboat. It costs a little more, and adds a solo cannon volley. Either choice can be changed later.',
			part: 'Then a part: Chiro\'s Sail, for the Carrack Advance.',
			cards: 'Each build is a card: how far along it is, and what is still to get, in coins, silver and goods.',
			order: 'Order matters. When stock runs short, the build at the top gets it first. Move the sail up.',
			pause: 'The Caravel can wait. Pause it, and it stops claiming stock until you start it again.',
			blockers: 'Under the queue are the biggest blockers: the missing things holding the most up. A count can be typed right on the row.',

			/* --- the plan --- */
			plan: 'The Plan tab is everything the active builds need, in one list.',
			next: 'The Next line says the one most useful thing to do right now.',
			today: 'Today shows your ship, the quests that pay into your list, and how long until the dailies, the weeklies and the barter refresh reset.',
			stats: 'Then the totals: how much is covered, what is still missing, and how many recipes you can craft now.',
			groups: 'The list is grouped. What you are building, then red for missing, blue for what is crafted from other things, and green for covered.',
			filter: 'Filter it to the missing only, when that is all you want to see.',
			own: 'As you gather, type what you hold into the box. Here, a hundred Starlight Hardener.',
			replan: 'It leaves the missing list, and every build re-plans around it at once.',
			short: 'Big numbers can be typed short. Two k is two thousand, and twelve thousand can be written with the separators your language uses.',

			/* --- a trip --- */
			trip: 'Or record a whole trip in one go. Log a trip takes everything you brought back.',
			tripline: 'Pick the item and type how many. Add a line for each thing.',
			tripsave: 'Record, and the whole trip goes in as one change.',
			undo: 'So one Undo takes the whole trip back, and Redo puts it in again.',

			/* --- a storage, off screenshots --- */
			shots: 'Or skip the typing. Screenshot your storage window in game, and give the shots to Read a storage on the Inventory.',
			reads: 'Here are two shots of one storage, scrolled between. It finds the slots, names each icon it knows, and reads the count written over it. It all runs in your browser; nothing is uploaded.',
			summary: 'It says how many things it read, how many slots it passed over, and that the row both shots share was counted once.',
			check: 'Every line keeps the corner of its slot beside it, so a count is checked at a glance. One the reader was not sure of is marked: check this one.',
			where: 'Say which storage this is. Update writes what the shots show; Replace treats the shots as the whole storage.',
			write: 'Nothing is written until you press Write.',
			landed: 'And there it is in the Inventory, all of it at Velia, as one change.',
			levels: 'Trade goods are grouped by level, each with its Lv chip. Level 5 and up take a slot each; everything else takes one slot a kind.',
			undo2: 'One Undo takes the whole storage back out again.',
			close: 'That is the Yard: what you want built, and what you hold toward it. Next, the Workshop, where it gets made.'
		},
		async shoot(ctx, s, ch) {
			const { page, url } = ctx;
			await seed(page, url, withPlating);
			await film(page, `${OUT}/the-yard.webm`);
			await card(page, ch.n, ch.title, { line: s.open });

			/* --- the sailor's own numbers, before anything is planned -- */
			// Set first because the barter count gates the sea: a plan
			// made before it is given is a plan for somebody else's
			// account. The seed carries them for every later chapter;
			// here they are typed in, which is how a player meets them.
			await track(page, '[data-act="sail-bar"]', s.sailor,
				{ act: () => click(page, '[data-act="sail-bar"]', { after: 600 }) });
			await track(page, '.pouch-item.sail.barters', s.count,
				{ act: () => typeInto(page, '[data-act="barter-count"]', '4205', { after: 400 }) });
			await track(page, '.pouch-item.sail.level', s.blevel,
				{ act: () => choose(page, '[data-act="barter-level"]', 'Master 5', { after: 400 }) });
			await track(page, '.pouch-item.sail.pack', s.pack,
				{ act: () => click(page, '[data-act="value-pack"]', { after: 500 }) });
			await track(page, '.pouch-item.sail.corsair', s.corsair);
			await track(page, '.pouch-item.sail.mastery', s.bmastery,
				{ act: () => typeInto(page, '[data-act="crew-mastery"]', '750', { after: 400 }) });
			await track(page, '.pouch-item.sail.log', s.blog,
				{ act: () => choose(page, '[data-act="sailing-log"]', 'srulk', { after: 400 }) });
			// The nest is a chip that opens an editor of its own, so it is
			// opened, a tier set, and shut again -- the row of birds in the
			// bar is only ever read.
			await pointAt(page, '.pouch-item.sail.pets', s.pets, {
				act: async () => {
					await click(page, '[data-act="pets"]', { after: 1000 });
					// "All five" at tier 4 is one press, which is the point
					// of the grid: it was twenty presses round five chips.
					await click(page, '.pet-row.head .pet-cell[data-tier="4"]', { after: 800 });
					await click(page, '[data-pet-save]', { after: 900 });
				}
			});
			await track(page, '.pouch-item.sail.region', s.bregion);
			await doing(page, s.once, () => click(page, '[data-act="sail-bar"]', { after: 600 }));
			await hush(page);

			/* --- the queue --------------------------------------------- */
			await doing(page, s.builds, () => tab(page, 'builds', { after: 600 }));
			await doing(page, s.add, async () => {
				await click(page, '[data-act="add-build"]', { after: 700 });
				await click(page, '.build-kinds [data-kind="ship"]', { after: 600 });
				await click(page, '.build-kinds [data-kind="part"]', { after: 600 });
				await click(page, '.build-kinds [data-kind="all"]', { after: 400 });
			});
			await doing(page, s.ship, async () => {
				await page.type('.picker-search', 'caravel', { delay: 70 });
				await wait(500);
				await click(page, '[data-pick="Epheria Caravel"]', { after: 700 });
			});
			await spotAll(page, '#dialog [data-act="route"]', s.asks, { pad: 6 });
			await doing(page, s.improved,
				() => click(page, '[data-act="route"][data-route="improved"]', { after: 900 }));
			await doing(page, s.part, async () => {
				await click(page, '[data-act="add-build"]', { after: 500 });
				await page.type('.picker-search', "chiro's sail", { delay: 70 });
				await wait(500);
				await click(page, '[data-pick="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 900 });
			});
			await spotAll(page, '.build', s.cards, { pad: 6 });
			// The sail is the second card; its up arrow is the second one.
			await doing(page, s.order, () => click(page, '.build ~ .build [data-act="move"][data-dir="-1"]', { after: 900 }));
			await doing(page, s.pause, () => click(page, '.build ~ .build [data-act="pause"]', { after: 1000 }));
			await pointAt(page, '.panel:has(.panel-title.amber)', s.blockers, {
				pad: 4,
				act: () => typeInto(page, '.panel:has(.panel-title.amber) [data-act="own-set"]', '40', { after: 500 })
			});
			await hush(page);

			/* --- the plan ---------------------------------------------- */
			await doing(page, s.plan, () => tab(page, 'plan', { after: 700 }));
			await pointAt(page, '.next-step', s.next, { pad: 6 });
			await pointAt(page, '.today', s.today, { pad: 6 });
			await pointAt(page, '.stats', s.stats, { pad: 6 });
			await spotAll(page, '.panel:has(.panel-title)', s.groups, { pad: 4 });
			await doing(page, s.filter, async () => {
				await click(page, '[data-act="plan-filter"][data-id="short"]', { after: 1000 });
			});
			// Lit before it is typed in: once the count is in, the row leaves
			// the missing list, and that leaving is the next line.
			await track(page, '.row:has([data-act="own-set"][data-item="Starlight Hardener"])', s.own, { pad: 4 });
			await doing(page, s.replan, async () => {
				await typeInto(page, '[data-act="own-set"][data-item="Starlight Hardener"]', '100', { after: 1600 });
				await click(page, '[data-act="plan-filter"][data-id="all"]', { after: 800 });
			});
			await track(page, '.row:has([data-act="own-set"][data-item="Tidal Black Stone"])', s.short, {
				pad: 4,
				act: () => typeInto(page, '[data-act="own-set"][data-item="Tidal Black Stone"]', '2k', { after: 600 })
			});
			await hush(page);

			/* --- a whole trip ------------------------------------------ */
			await doing(page, s.trip, () => headerBtn(page, 'trip-log', { after: 800 }));
			await doing(page, s.tripline, async () => {
				await click(page, '[data-trip-pick="0"]', { after: 600 });
				await page.keyboard.type("sea monster's bone", { delay: 60 });
				await wait(500);
				await clickText(page, '.picker-row', "Violent Sea Monster's Bone", { after: 600 });
				await typeInto(page, '[data-trip-qty="0"]', '100', { after: 300 });
				await click(page, '[data-trip-pick="1"]', { after: 600 });
				await page.keyboard.type('plywood', { delay: 60 });
				await wait(500);
				await clickText(page, '.picker-row', 'Violent Wave Plywood', { after: 600 });
				await typeInto(page, '[data-trip-qty="1"]', '20', { after: 300 });
			});
			await doing(page, s.tripsave, () => click(page, '[data-trip-save]', { after: 1000 }));
			await doing(page, s.undo, async () => {
				await headerBtn(page, 'undo', { after: 900 });
				await headerBtn(page, 'redo', { after: 900 });
			});
			await hush(page);

			/* --- a storage, read off the screenshots of it ------------- */
			// Two screenfuls of one storage, scrolled between. The reading
			// is ten seconds of arithmetic with nothing to look at, so it
			// happens under the sentence that says what it is doing; then
			// it is written and taken back again, because what it would
			// write is somebody else's storage and the chapters after this
			// plan on this save's own.
			await doing(page, s.shots, async () => {
				await tab(page, 'inventory', { after: 500 });
				await click(page, '[data-act="inv-shot"]', { after: 900 });
			});
			await doing(page, s.reads, async () => {
				const input = await page.$('#dialog input[type=file]');
				await input.uploadFile(
					path.resolve('tools/capture/shots/storage-1.webp'),
					path.resolve('tools/capture/shots/storage-2.webp')
				);
				await waitFor(page, '.shot-table', { upTo: 180000, then: 600 });
			});
			await spotAll(page, '#dialog .dialog-note:has(~ .shot-table-wrap)', s.summary, { pad: 6, top: 90 });
			await track(page, '.shot-table tbody tr:nth-child(1)', s.check, { pad: 6 });
			await track(page, '#dialog .shot-lang', s.where, {
				pad: 8,
				act: () => choose(page, '#shot-store', 'Velia', { after: 600 })
			});
			await pointAt(page, '#dialog [data-write]', s.write, { pad: 8 });
			await doing(page, s.landed, async () => {
				await click(page, '#dialog [data-write]', { after: 1200 });
				if (await onScreen(page, '#dialog .dialog-box')) await page.keyboard.press('Escape');
				await wait(500);
				await page.evaluate(() => window.scrollTo({ top: 260, behavior: 'smooth' }));
			});
			await spotAll(page, '.inv-band', s.levels, { pad: 6 });
			await doing(page, s.undo2, () => headerBtn(page, 'undo', { after: 1200 }));
			await hush(page);
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Two -- to get
	 *
	 * The planner is To Get's default reading and the app's answer to
	 * "what do I actually do next", so it gets a chapter rather than the
	 * one line the Yard used to give it.
	 * ============================================================== */
	'to-get': {
		n: 'Two', title: 'To Get', at: 'get',
		blurb: 'One way to each thing you are short of, under a goal you set, in the days it takes, and what it will never do.',
		say: {
			open: 'This is To Get. Once a build is queued, it answers what is left: what to do next, and when it will be done.',

			/* --- still to get --- */
			short: 'Still to get, at the top: everything you are short of, biggest first, tinted by what the shop would charge for it.',
			only: 'Press one, and the whole screen narrows to that one thing.',
			unonly: 'Press it again, and everything is back.',
			copy: 'The list copies out as text, or as rows for a spreadsheet.',
			modes: 'Two readings below it. The way to get it picks one way for each thing. Every way lists them all.',

			/* --- the headline --- */
			done: 'The plan opens on the headline: how many days until you have the lot.',
			pace: 'Under it, the thing that sets that pace. Barter days are always called an estimate, since which board a refresh deals is chance.',
			figures: 'Beside it, the coins it will spend against what you can spare, and how many things are left, across how many steps.',

			/* --- the goal --- */
			matters: 'Then it asks what matters most to you, because there is no right answer.',
			soon: 'Soonest spends the purse wherever that buys a day.',
			coins: 'Keep the coins spends Crow Coins only where nothing else sells the thing.',
			silver: 'Keep the silver leaves the Central Market alone, and buys from Falasi only what only he sells.',
			watch: 'The day count and the spend follow every choice. With this purse all three land on the same day, so the goal only moves the plan where there is a real choice to make.',

			/* --- the knobs --- */
			days: 'Tell it how many days a week you actually sail. Three days a week, and the same plan takes longer on the calendar.',
			reserve: 'Type the Crow Coins you want to keep back. The plan never spends them, and works around what is left.',
			doing: 'And say what you are willing to do at all.',
			quests: 'Switch the dailies and weeklies off, and the plan stops counting on what they pay.',
			hunt: 'Turn hunting on, and a sea monster drop becomes something to go and kill for, instead of something to buy. A hunt is never counted in the days.',
			barter: 'Turn bartering off, and the barter lists stop counting. What only a barter brings drops out of the days, into the steps no rate is counted for.',
			never: 'What this plan will never do is written out underneath, drawn from the choices you just made, so you know what it is not counting.',

			/* --- the steps --- */
			todayb: 'Today\'s board waits for the layout you read on the Barter tab. Once one is read, it lists what that board deals toward this list, island by island, with a tick for each.',
			steps: 'Then the steps, in the order they are done: the quests to run, the rewards to take, the Crow Coin Shop, bartering at sea, and so on down.',
			step: 'Each step says where it happens, and carries its own total.',
			quest: 'A quest step lists each quest, how many times to run it, where it is handed in, and which reward to take from a pick-one.',
			pick: 'Make it my pick remembers that choice, so claiming the quest on the Quests tab takes one press.',
			odds: 'A barter step is paced by how often that offer is really on the list, from the game\'s own tables, not by how often it could be.',
			fold: 'Fold a step away once you are done with it.',

			/* --- the other reading --- */
			every: 'Every way is the other reading: everything grouped by how you get it, the Crow Coin Shop, Falasi, the Market, barter and the rest.',
			totals: 'Each group carries a running total, measured against what is in your purse.',
			close: 'That is To Get. Not what you could do, but what to do, and when it ends.'
		},
		async shoot(ctx, s, ch) {
			const { page, url } = ctx;
			await seed(page, url, TO_GET);
			await film(page, `${OUT}/to-get.webm`);
			await card(page, ch.n, ch.title, { line: s.open });

			await tab(page, 'get');
			await wait(1400);

			/* --- still to get ------------------------------------------ */
			// `.summary` alone is the sailor chip as well, and that one is
			// higher up the page: the line about what you are short of was
			// lighting the barter count.
			await track(page, '.want-band', s.short, { pad: 6 });
			await doing(page, s.only, async () => {
				await click(page, '.want-band .want', { after: 300 });
				await park(page, 0.97, 0.9);
			});
			await doing(page, s.unonly, async () => {
				await click(page, '.want-band .want.on', { after: 300 });
				await park(page, 0.97, 0.9);
			});
			await pointAt(page, '.get-copy', s.copy, { pad: 8 });
			// Both readings, not whichever chip happens to be first: the
			// line names them as a pair.
			await track(page, '.controls .chips', s.modes, { pad: 8 });
			await hush(page);

			/* --- the headline ------------------------------------------ */
			// The card's head up under the tabs: left where it lands, the
			// headline sits behind the caption.
			await page.evaluate(() => {
				const h = document.querySelector('.way-head');
				if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
			});
			await wait(700);
			await track(page, '.way-headline', s.done, { pad: 8 });
			await pointAt(page, '.way-pace', s.pace, { pad: 8 });
			await track(page, '.way-tiles', s.figures, { pad: 8 });
			await hush(page);

			/* --- the goal ----------------------------------------------- */
			await track(page, '.way-prefs', s.matters, { pad: 8 });
			await doing(page, s.soon, () => click(page, '[data-act="get-preset"][data-id="soon"]', { after: 700 }));
			await doing(page, s.coins, () => click(page, '[data-act="get-preset"][data-id="coins"]', { after: 900 }));
			await doing(page, s.silver, () => click(page, '[data-act="get-preset"][data-id="silver"]', { after: 900 }));
			// The headline and the prefs in one frame: the line is about the
			// figure moving as the choice does.
			await track(page, '.way-head-top', s.watch, {
				pad: 6,
				act: () => click(page, '[data-act="get-preset"][data-id="soon"]', { after: 900 })
			});
			await hush(page);

			/* --- the knobs ---------------------------------------------- */
			await track(page, '[data-act="get-days"]', s.days,
				{ pad: 10, act: () => choose(page, '[data-act="get-days"]', '3', { after: 900 }) });
			await pointAt(page, '[data-act="get-reserve"]', s.reserve, {
				pad: 10,
				act: () => typeInto(page, '[data-act="get-reserve"]', '20000', { after: 900 })
			});
			await track(page, '.way-opts', s.doing, { pad: 8 });
			await doing(page, s.quests, () => click(page, '[data-act="get-doing"][data-id="quests"]', { after: 1100 }));
			// Back on: the steps below are about a plan that runs the quests.
			await click(page, '[data-act="get-doing"][data-id="quests"]', { after: 800 });
			await doing(page, s.hunt, () => click(page, '[data-act="get-doing"][data-id="hunt"]', { after: 1100 }));
			// Hunting off again before bartering goes: with both, the drops
			// leave the days for the hunt and the barter line says nothing.
			await click(page, '[data-act="get-doing"][data-id="hunt"]', { after: 800 });
			await doing(page, s.barter, () => click(page, '[data-act="get-doing"][data-id="barter"]', { after: 1100 }));
			// Put it back: the steps beat below is about a plan that barters.
			await click(page, '[data-act="get-doing"][data-id="barter"]', { after: 800 });
			// The days back to every day, and the purse back in play.
			await choose(page, '[data-act="get-days"]', '7', { after: 600 });
			await typeInto(page, '[data-act="get-reserve"]', '0', { after: 600 });
			if (!(await onScreen(page, '.way-rule-grid'))) {
				await click(page, '.way-rules [data-act="get-fold"]', { after: 700 }).catch(() => {});
			}
			await pointAt(page, '.way-rules', s.never, { pad: 8 });
			await hush(page);

			/* --- the steps ---------------------------------------------- */
			await pointAt(page, '.get-today', s.todayb, { pad: 6 });
			// Folded first, and then all of them lit. A step open at its
			// full height pushes the rest off the frame, so the line about
			// the steps "in order" was said over one step and a gap; folded
			// they are a list, and the head of each is exactly what the
			// line claims -- where it happens, and how long it takes.
			// One at a time and re-queried each round: a fold re-renders the
			// panel, so every handle taken before the first click is
			// detached by the second.
			for (let go = 0; go < 12; go++) {
				const open = await page.$('.way-step-head[aria-expanded="true"]');
				if (!open) break;
				await open.click();
				await open.dispose();
				await wait(220);
			}
			await wait(600);
			await spotAll(page, '.way-step', s.steps, { pad: 6 });
			await pointAt(page, '.way-step-count', s.step, { pad: 8 });
			// The quests step opened again, for the two lines about it.
			const qstep = '[data-act="get-fold"][data-id="quests"]';
			if (await onScreen(page, qstep)) {
				await doing(page, s.quest, () => click(page, qstep, { after: 1000 }));
			} else {
				await say(page, s.quest);
			}
			await pointAt(page, '[data-act="get-pick"]', s.pick, {
				pad: 8,
				act: () => click(page, '[data-act="get-pick"]', { after: 900 })
			});
			const barter = '[data-act="get-fold"][data-id="step-barter"]';
			if (await onScreen(page, barter)) {
				await doing(page, s.odds, async () => {
					await click(page, barter, { after: 600 });
					await page.evaluate(sel => {
						const h = document.querySelector(sel);
						if (h) window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
					}, barter);
					await wait(600);
				});
			} else {
				await say(page, s.odds);
			}
			await doing(page, s.fold, async () => {
				for (let go = 0; go < 6; go++) {
					const open = await page.$('.way-step-head[aria-expanded="true"]');
					if (!open) break;
					await click(page, open, { after: 500 });
				}
			});
			await hush(page);

			/* --- the other reading -------------------------------------- */
			await doing(page, s.every, async () => {
				await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
				await wait(500);
				await click(page, '[data-act="get-mode"][data-id="source"]', { after: 1200 });
			});
			await pointAt(page, '.panel:has([data-act="coin-buy"])', s.totals, { pad: 4 });
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Three -- quests
	 *
	 * Was the front half of a "Sea" chapter that also tried to cover the
	 * Map. The Map is its own chapter now, and this is what was left --
	 * which turned out to be a subject in its own right rather than a
	 * preamble to one.
	 * ============================================================== */
	'quests': {
		n: 'Three', title: 'Quests', at: 'quests',
		blurb: 'The sailing dailies and weeklies, what each pays against your list, claiming one or a batch, pick-one rewards, groups and favourites.',
		say: {
			open: 'This is the Quests tab: the sailing dailies and weeklies, and what each one pays, set against what you are short of.',
			clocks: 'The clocks first. Dailies reset at midnight UTC, weeklies on Thursday, and the barter refresh at six in the morning.',
			groups: 'The quests are grouped by how often they come round: daily, weekly, and once.',
			row: 'Each row is one quest: who gives it, where, the monster it asks for, and every reward it pays.',
			marked: 'A quest paying something your builds need is marked, so the ones worth the detour stand out.',
			mapit: 'On the map opens the Map on where that monster is found.',
			total: 'Under each group, what all of them together pay in a day, or in a week.',

			/* --- finding them --- */
			filter: 'Filter the list. Pays what I need shows only the quests paying into your builds.',
			left: 'Still to do hides what you have already done today.',
			pay: 'Or pick the rewards themselves. Tick an item, and only the quests paying in it are left.',
			unpay: 'The cross on the chip takes that filter off again.',
			search: 'And the search finds a quest by its name, its place, or its reward.',

			/* --- one at a time --- */
			claim: 'Done one in game? Press Claimed.',
			claimed: 'Its rewards go into your stock, and the quest is ticked off until the reset.',
			notdone: 'Not done takes the tick back off. Undo takes the rewards back too.',
			pickone: 'Some quests let you pick one reward. Claimed asks which one you took.',
			kept: 'The choice is kept, so next time Claimed records the same reward in one press.',
			ahead: 'Choose ahead answers that question now, before you have even run the quest.',

			/* --- a batch --- */
			tick: 'Ran several? Tick each one you did.',
			bar: 'A bar comes up with how many are ticked.',
			finish: 'Press Finish, and every ticked quest is recorded at once. A pick-one with no choice yet asks for it on the way.',
			land: 'The rewards land in your stock as one change.',
			undo: 'Got one wrong? Undo puts the whole batch back, and Redo puts it in again.',
			tickall: 'Tick all ticks every quest still open in a group. Untick all clears the ticks.',

			/* --- groups and stars --- */
			group: 'Run the same set every day? Tick them, and save them as a group under a name.',
			chip: 'The group is a chip now. One press ticks every quest in it that is still to do.',
			fav: 'Star the quests that matter to you, and the Favourites chip shows just those.',
			chain: 'The one-off quests are here too, with Ravinia\'s log counting the letters you have recorded.',
			reset: 'The ticks wear off at the reset by themselves, so each day starts fresh.',
			close: 'That is Quests. Free materials, tracked against what you are building.'
		},
		async shoot(ctx, s, ch) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/quests.webm`);
			await card(page, ch.n, ch.title, { line: s.open });

			await tab(page, 'quests');
			await wait(800);
			const row = id => `.quest:has([data-quest="${id}"])`;
			await track(page, '.quest-clocks', s.clocks, { pad: 8 });
			await track(page, '.panel-head:has([data-cadence="daily"])', s.groups, { pad: 6 });
			await track(page, row('omg-blackrust'), s.row, { pad: 4 });
			// The ones that pay something on the list, and as many of them
			// as the frame holds: the line is about which rows are marked,
			// and a box round one row shows no marking at all.
			await spotAll(page, '.quest.wanted', s.marked, { pad: 6 });
			await pointAt(page, `${row('omg-blackrust')} [data-act="quest-map"]`, s.mapit, { pad: 8 });
			await pointAt(page, '.quest-total', s.total, { pad: 6 });
			await hush(page);

			/* --- finding them ------------------------------------------- */
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await wait(500);
			await track(page, '[data-act="quest-filter"][data-id="wanted"]', s.filter, {
				pad: 8,
				act: () => click(page, '[data-act="quest-filter"][data-id="wanted"]', { after: 1200 })
			});
			await track(page, '[data-act="quest-filter"][data-id="left"]', s.left, {
				pad: 8,
				act: () => click(page, '[data-act="quest-filter"][data-id="left"]', { after: 1000 })
			});
			await click(page, '[data-act="quest-filter"][data-id="all"]', { after: 600 });
			await doing(page, s.pay, async () => {
				await click(page, '[data-act="quest-pay-pick"]', { after: 800 });
				await clickText(page, '#dialog .picker-row', 'Delicately Polished Support', { after: 500 });
				await click(page, '#dialog [data-picker-apply]', { after: 1200 });
			});
			// No spotlight: the chip goes with the press.
			if (await onScreen(page, '[data-act="quest-pay-del"]')) {
				await doing(page, s.unpay, () => click(page, '[data-act="quest-pay-del"]', { after: 900 }));
			} else {
				await say(page, s.unpay);
			}
			await doing(page, s.search, async () => {
				await typeInto(page, '.controls [data-act="query"], [data-act="query"]', 'crocodile', { after: 1600 });
				await typeInto(page, '.controls [data-act="query"], [data-act="query"]', '', { after: 600 });
			});
			await hush(page);

			/* --- one at a time ------------------------------------------ */
			// A quest claimed sorts to the foot of its group, so the row is
			// lit where it lands rather than where it was pressed.
			await doing(page, s.claim, () => click(page, `${row('lively')} [data-act="quest-claim"]`, { after: 1000 }));
			await track(page, row('lively'), s.claimed, { pad: 4 });
			await doing(page, s.notdone, async () => {
				await click(page, `${row('lively')} [data-act="quest-undone"]`, { after: 900 });
				await headerBtn(page, 'undo', { after: 900 });
			});
			await doing(page, s.pickone, async () => {
				await click(page, `${row('omg-blackrust')} [data-act="quest-claim-pick"]`, { after: 2600 });
				await clickText(page, '#dialog .picker-row', 'Wave Residue Adhesive', { after: 1000 });
			});
			await pointAt(page, `${row('omg-blackrust')} .quest-recall`, s.kept, { pad: 8 });
			await doing(page, s.ahead, async () => {
				await click(page, `${row('omg-candidum')} [data-act="quest-pick-set"]`, { after: 1400 });
				await click(page, '#dialog .picker-row:last-of-type', { after: 1000 });
			});
			await hush(page);

			/* --- a batch ------------------------------------------------ */
			await doing(page, s.tick, async () => {
				for (const id of ['wider', 'worldsend-1', 'goods-baremi', 'hekaru']) {
					await click(page, `${row(id)} [data-act="quest-check"]`, { after: 350 });
				}
			});
			await pointAt(page, '[data-act="quest-finish"]', s.bar, { pad: 10 });
			await doing(page, s.finish, async () => {
				await click(page, '[data-act="quest-finish"]', { after: 1400 });
				if (await onScreen(page, '#dialog .picker-row')) await click(page, '#dialog .picker-row:last-of-type', { after: 1000 });
			});
			await say(page, s.land);
			await doing(page, s.undo, async () => {
				await headerBtn(page, 'undo', { after: 900 });
				await headerBtn(page, 'redo', { after: 900 });
			});
			await pointAt(page, '[data-act="quest-select-shown"][data-cadence="daily"]', s.tickall, {
				pad: 8,
				act: async () => {
					await click(page, '[data-act="quest-select-shown"][data-cadence="daily"]', { after: 1300 });
					await click(page, '[data-act="quest-select-none"]', { after: 900 });
				}
			});
			await hush(page);

			/* --- groups and stars --------------------------------------- */
			await doing(page, s.group, async () => {
				await click(page, `${row('worldsend-2')} [data-act="quest-check"]`, { after: 350 });
				await click(page, `${row('goods-narvo')} [data-act="quest-check"]`, { after: 350 });
				await click(page, '[data-act="quest-group-save"]', { after: 800 });
				await page.type('[data-quest-group-name]', 'Morning dailies', { delay: 60 });
				await wait(300);
				await click(page, '[data-quest-group-save]', { after: 900 });
				if (await onScreen(page, '[data-act="quest-select-none"]')) await click(page, '[data-act="quest-select-none"]', { after: 700 });
			});
			await pointAt(page, '[data-act="quest-group-pick"]', s.chip, {
				pad: 8,
				act: () => click(page, '[data-act="quest-group-pick"]', { after: 1200 })
			});
			if (await onScreen(page, '[data-act="quest-select-none"]')) await click(page, '[data-act="quest-select-none"]', { after: 600 });
			await doing(page, s.fav, async () => {
				await click(page, `${row('omg-nineshark')} [data-act="quest-fav"]`, { after: 500 });
				await click(page, `${row('charity')} [data-act="quest-fav"]`, { after: 500 });
				await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
				await wait(400);
				await click(page, '[data-act="quest-filter"][data-id="fav"]', { after: 1400 });
			});
			await click(page, '[data-act="quest-filter"][data-id="once"]', { after: 900 });
			await pointAt(page, '.quest-chain', s.chain, { pad: 8 });
			await doing(page, s.reset, () => click(page, '[data-act="quest-filter"][data-id="all"]', { after: 900 }));
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Four -- your ship
	 *
	 * The first cut of this showed a hull and a screenshot reader and
	 * called it a chapter. The tab is five slots, an appearance set, a
	 * roster with two ways of seating it, a sort, two hot presets, saved
	 * setups and a wall of figures -- so it covers all of them, and
	 * lights up whichever one it is talking about.
	 * ============================================================== */
	'your-ship': {
		n: 'Four', title: 'Your Ship', at: 'crew',
		blurb: 'Hull, parts, crystal and appearance; the crew read off screenshots and seated by hand or by goal; presets, saved setups, the fleet, and a ship in a link.',
		say: {
			open: 'This is the Ship tab. Everything the app knows about how fast you sail, and how much you carry, comes from this one screen.',

			/* --- the ship --- */
			card: 'At the top is the ship itself: the hull, what it is for, and its speed, its hold and how many of its five slots are fitted.',
			hold: 'The hold is the limit in LT, and the slots it has. Past the limit the ship still sails, only slower.',
			facts: 'Under every figure is where it comes from: the hull, the parts, the crystal, the crew and your mastery, added up.',
			mastery: 'Your Sailing Mastery is read from the bar under the tabs, where you typed it in.',
			hull: 'Change ship lists every hull in the game, with its crew, cabin space, weight, slots and speed.',
			back: 'Pick the one you sail. Here, the Carrack Advance stays.',

			/* --- parts, crystal, set --- */
			slots: 'Fitted out shows the four part slots: cannon, sail, figurehead and plating.',
			best: 'Each slot takes the best part you hold, by itself. This Carrack has a plus ten Toro Cannon and a plus four Toro Sail.',
			change: 'Change opens every part that fits the slot, with what it does at plus ten, and marks the one you hold.',
			weigh: 'Pick one you do not own yet, and its level, and every figure is worked out as if it were fitted, marked as a plan.',
			bestown: 'Best I own puts back whatever you actually hold.',
			crystal: 'The fifth slot is the sea crystal. Every grade from Eltro to Rusalka is listed, with its effect.',
			crystalpick: 'Pick the one you have socketed, and its bonus goes into the numbers.',
			skin: 'Then the appearance set. Here it is not only a look: a full set adds durability and rations, so tick the pieces you wear.',

			/* --- the crew, read in --- */
			crew: 'Now the crew. The ship is drawn with every seat it has, and the roster starts empty.',
			shots: 'Typing a crew in, four growths each, is an evening. So Read screenshots takes the game\'s own Manage Sailors window instead.',
			drop: 'Screenshot one sailor a shot, and drop them all in.',
			reads: 'It reads them in your browser; nothing is uploaded. The window never prints a sailor\'s type, so it is worked out from the appetite, the cabin cost and the weight.',
			table: 'Check the table against the game. A type can be corrected here, and a sailor already on the roster is brought up to date instead of hired twice.',
			take: 'Then take them.',
			hired: 'And there they are on the sailor list, with their real levels and growths.',
			sort: 'Sort the list by whatever you are fitting for: best all round, or one growth at a time.',
			select: 'Click a sailor, and the panel on the right shows everything about them.',
			growths: 'The growths are typed straight from the sailor window, and every figure downstream follows them.',

			/* --- seating it --- */
			seat: 'To seat one by hand, click the sailor, then click the seat.',
			seats: 'Where they sit matters. A sail seat doubles their speed and acceleration, and the wheel doubles turn and brake.',
			auto: 'Or let it arrange the whole crew. Auto assign asks what the boat is for.',
			goals: 'Each goal shows what the crew would come to under it: speed, acceleration, turn, brake, cannons, or all round.',
			pick: 'Pick one, and it chooses who comes aboard as well as who sits where.',
			row: 'The row under the ship fills in. That is what the crew adds, on top of the hull and the parts.',

			/* --- presets, setups and the fleet --- */
			presets: 'Two presets are kept per hull, for swapping crews quickly. Save this speed crew to the first.',
			cannons: 'Arrange it for cannons, and save that to the second.',
			apply: 'Now one click on a preset puts that crew straight back on.',
			setup: 'A setup is bigger: the hull, its parts, the crystal and the seating, kept under a name.',
			other: 'Change to another hull, and its own seats and parts come up. Keep that one as a setup too.',
			fleet: 'Your fleet lists every setup you have kept, and every hull in your inventory without one.',
			sail: 'Sail one, and it becomes the ship the Map and the Barter tab time their routes at.',
			link: 'And Copy link carries the whole ship, hull, parts, crystal and crew, in one address, for when someone asks what you sail.',
			close: 'That is your ship. Get this screen right, and every distance and every minute in the app is yours.'
		},
		async shoot(ctx, s, ch) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/your-ship.webm`);
			await card(page, ch.n, ch.title, { line: s.open });

			await tab(page, 'crew');
			await wait(900);

			/* --- the ship ----------------------------------------------- */
			await track(page, '.ship-card-main', s.card, { pad: 6 });
			await pointAt(page, '.ship-card-facts > div:nth-child(2)', s.hold, { pad: 8 });
			await spotAll(page, '.ship-card-facts, .ship-card-specs', s.facts, { pad: 6 });
			await track(page, '.crew-mastery.read', s.mastery, { pad: 8 });
			await doing(page, s.hull, () => click(page, '[data-act="crew-ship-pick"]', { after: 1200 }));
			await doing(page, s.back, async () => {
				await clickText(page, '#dialog .picker-row', 'Epheria Carrack: Advance', { after: 900 });
				if (await onScreen(page, '#dialog .dialog-box')) await page.keyboard.press('Escape');
			});
			await hush(page);

			/* --- parts, crystal, set ------------------------------------ */
			const sail = '.slot-card:has([data-act="crew-fit-pick"][data-slot="sail"])';
			await spotAll(page, '.slot-card:not(.crystal):not(.skin)', s.slots, { pad: 6 });
			await spotAll(page, '.slot-card:not(.crystal):not(.skin):not(.empty)', s.best, { pad: 6 });
			await doing(page, s.change, () => click(page, `${sail} [data-act="crew-fit-pick"]`, { after: 1200 }));
			await doing(page, s.weigh, async () => {
				await clickText(page, '#dialog .picker-row', "Chiro's Sail", { after: 900 });
				// It asks the level next; the top one.
				if (await onScreen(page, '#dialog .picker-row')) await click(page, '#dialog .picker-row:last-of-type', { after: 900 });
				await page.evaluate(sel => document.querySelector(sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), sail);
				await wait(600);
			});
			// No spotlight on a button that goes when it is pressed.
			await doing(page, s.bestown, () => click(page, '[data-act="crew-fit-auto"][data-slot="sail"]', { after: 900 }));
			await track(page, '.slot-card.crystal', s.crystal, { pad: 6 });
			await doing(page, s.crystalpick, async () => {
				await click(page, '[data-act="crew-crystal-pick"]', { after: 1100 });
				await page.keyboard.type('rusalka', { delay: 70 });
				await wait(500);
				await click(page, '#dialog .picker-row', { after: 900 });
				if (await onScreen(page, '#dialog .dialog-box')) await page.keyboard.press('Escape');
			});
			await track(page, '.slot-card.skin', s.skin, {
				pad: 6,
				act: () => click(page, '[data-act="crew-skin-all"]', { after: 900 })
			});
			await hush(page);

			/* --- the crew, read in -------------------------------------- */
			// The reader comes first because the roster really is empty
			// until it runs: an earlier cut of this seated sailors that
			// did not exist yet, and died on the first click.
			await track(page, '.crew-panel:has([data-act="crew-auto"])', s.crew, { pad: 4 });
			// Nor on one that opens a dialog: the box would dim the dialog.
			await doing(page, s.shots, () => click(page, '[data-act="crew-import"]', { after: 1200 }));
			await doing(page, s.drop, async () => {
				const input = await page.$('#dialog input[type=file]');
				await input.uploadFile(...[1, 2, 3, 4, 5].map(i => path.resolve(`tools/capture/shots/sailor-${i}.webp`)));
			});
			// The first read fetches the engine -- about six megabytes --
			// and then does a pass of OCR per shot, so this is the one
			// beat in the series that genuinely takes its time.
			await doing(page, s.reads, () => waitFor(page, '.shot-table', { upTo: 180000, then: 700 }));
			await pointAt(page, '.shot-table', s.table, { pad: 6 });
			await doing(page, s.take, () => click(page, '[data-add]', { after: 1400 }));
			await track(page, '.crew-panel:has([data-act="crew-import"])', s.hired, { pad: 4 });
			await track(page, '[data-act="crew-sort"]', s.sort, {
				pad: 8,
				act: () => choose(page, '[data-act="crew-sort"]', 'speed', { after: 900 }).catch(() => {})
			});
			await doing(page, s.select, async () => {
				await click(page, '[data-act="crew-select"]', { after: 600 });
				await page.evaluate(() => {
					const p = document.querySelector('.crew-sel');
					if (p) window.scrollTo({ top: p.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
				});
				await wait(700);
			});
			await pointAt(page, '.crew-sel', s.growths, { pad: 4 });
			// Off again: the seating line wants a click on the sailor first.
			if (await onScreen(page, '[data-act="crew-clear-sel"]')) await click(page, '[data-act="crew-clear-sel"]', { after: 500 });
			await hush(page);

			/* --- seating it -------------------------------------------- */
			await doing(page, s.seat, async () => {
				await click(page, '[data-act="crew-select"]', { after: 600 });
				await click(page, '[data-act="crew-seat"][data-seat="sail:0"]', { after: 900 });
			});
			await say(page, s.seats);
			await doing(page, s.auto, () => click(page, '[data-act="crew-auto"]', { after: 1100 }));
			await pointAt(page, '#dialog [data-act="crew-auto-go"]', s.goals, { pad: 6 });
			await doing(page, s.pick, () => click(page, '[data-act="crew-auto-go"][data-goal="speed"]', { after: 1300 }));
			await pointAt(page, '.crew-stats', s.row, { pad: 4 });
			await hush(page);

			/* --- presets, setups, the fleet ----------------------------- */
			await track(page, '.crew-panel:has([data-act="crew-preset-save"])', s.presets, {
				pad: 4,
				act: () => click(page, '[data-act="crew-preset-save"][data-p="p1"]', { after: 900 })
			});
			await doing(page, s.cannons, async () => {
				await click(page, '[data-act="crew-auto"]', { after: 1000 });
				await click(page, '[data-act="crew-auto-go"][data-goal="cannon"]', { after: 1000 });
				await click(page, '[data-act="crew-preset-save"][data-p="p2"]', { after: 900 });
			});
			await track(page, '[data-act="crew-preset-apply"][data-p="p1"]', s.apply, {
				pad: 8,
				act: () => click(page, '[data-act="crew-preset-apply"][data-p="p1"]', { after: 900 })
			});
			await doing(page, s.setup, async () => {
				await click(page, '[data-act="crew-setup-save"]', { after: 900 });
				await typeInto(page, '[data-setup-name]', 'Barter Carrack', { after: 300 }).catch(() => {});
				if (await onScreen(page, '[data-setup-save]')) await click(page, '[data-setup-save]', { after: 900 });
			});
			await doing(page, s.other, async () => {
				await click(page, '[data-act="crew-ship-pick"]', { after: 1000 });
				await clickText(page, '#dialog .picker-row', 'Epheria Carrack: Valor', { after: 1200 });
				if (await onScreen(page, '#dialog .dialog-box')) await page.keyboard.press('Escape');
				await click(page, '[data-act="crew-setup-save"]', { after: 900 });
				await typeInto(page, '[data-setup-name]', 'Hunting Valor', { after: 300 }).catch(() => {});
				if (await onScreen(page, '[data-setup-save]')) await click(page, '[data-setup-save]', { after: 900 });
			});
			await doing(page, s.fleet, () => click(page, '[data-act="crew-fleet"]', { after: 1300 }));
			await doing(page, s.sail, async () => {
				await clickText(page, '#dialog .fleet-row.can', 'Barter Carrack', { after: 1200 });
			});
			if (await onScreen(page, '#dialog .dialog-box')) await page.keyboard.press('Escape');
			await wait(500);
			await hush(page);

			await track(page, '[data-act="crew-link"]', s.link, {
				pad: 8,
				act: () => click(page, '[data-act="crew-link"]', { after: 1000 })
			});
			if (await onScreen(page, '#dialog .dialog-box')) await page.keyboard.press('Escape');
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Five -- the map
	 *
	 * Shot almost entirely full screen, because that is how the chart is
	 * actually used: the toolbar is explained on the page, the last
	 * button on it is full screen, and everything after that happens
	 * with the sea filling the frame.
	 * ============================================================== */
	'the-map': {
		n: 'Five', title: 'The Map', at: 'map',
		blurb: 'The chart and its tools, the ruler, the terrain it stands up on, what it draws, who has what you need, the hunting grounds and today\'s checklist.',
		say: {
			open: 'This is the Map: the whole sea, with everything you are short of marked on it.',
			pins: 'Every pin is a barterer who can deal something on your list.',
			count: 'The head says how many of the ninety-one barterers that is.',
			showing: 'Showing is what the chart marks. Everything you are short of, or one item you choose.',
			one: 'Pick one, and only the islands dealing that one thing are left.',
			all: 'Everything I am short of brings the rest back.',
			clocks: 'The pill on the chart counts down to the barter refresh, the dailies and the weeklies.',

			/* --- the tools --- */
			tools: 'The buttons along the top are the chart\'s tools.',
			zoom: 'Zoom out and in. Scrolling on the sea does the same, and dragging pans.',
			fit: 'This one fits everything marked back into view, if you get lost.',
			ruler: 'The ruler measures any two points on the sea. Click one, then the other.',
			coords: 'It gives the distance in metres, and the time your ship takes to sail it.',
			mini: 'This hides or shows the minimap in the corner. Click on the minimap to jump anywhere.',

			/* --- 3D --- */
			stand: 'And 3D stands the chart up.',
			terrain: 'That is the game\'s own terrain, read out of the client. Not a picture of it: the real heightmap.',
			lean: 'Shift-drag to lean it, and the islands come up out of the water.',
			curve: 'The world curves away toward the horizon, the way the game\'s own map does, and the pins and the routes bend with it.',
			ground: 'Ground paints it in the colours the client ships.',
			neon: 'Neon draws it as contours, the way the game\'s own 3D map does.',
			flat: 'And Level looks straight down again, facing north.',

			/* --- full screen --- */
			full: 'The last button is full screen. That is where the chart is worth using.',
			now: 'Now the sea has the whole window. The few buttons that matter come with it.',
			refit: 'Fit again, now that the chart has the room.',
			panel: 'The panel drives the chart, and the arrows swap it to the other side.',

			/* --- what it draws --- */
			layers: 'On the chart is what gets drawn, whichever tab is open.',
			chips: 'Barterers, the habitats where each species lives, the wharf managers, guild wharves, island names, and your own drawings.',
			habitats: 'The habitats are the pictures of where each species lives. Turn them off when the chart gets busy.',
			wharves: 'The wharves mark every wharf manager, for repairs, rations and sailors.',
			names: 'And the island names come up once you are close enough to read them.',

			/* --- who has it --- */
			tabs: 'Five tabs: Who has it, Route, Draw, Hunt and Today. Route and Draw have a part of their own, after this one.',
			who: 'Who has it lists every island dealing something on your list, the most first, with what it trades for.',
			kinds: 'Narrow it to materials or to trade goods.',
			pool: 'One of N is that island\'s pool: each refresh it deals one offer out of N, so this is where the thing can turn up, not where it will.',
			row: 'Click a row, and the chart flies to that island.',
			card: 'Its card lists what it trades, and adds it to a route.',

			/* --- hunt --- */
			hunt: 'Hunt is for what you kill rather than trade.',
			errands: 'At the top, the hunting quests you have taken. Work out today\'s loop picks a ground for each, and puts the calls in order.',
			grounds: 'Every species is listed: sea monsters, young ones, ships, bosses, the Cox Pirates, and the Hollow Maretta, with the thirty-eight spots it rings at.',
			monster: 'Click one, and every spawn point it has goes on the chart.',
			more: 'Tick as many as you like. The lot can be sent to the game\'s own world map as favourites.',
			courses: 'Above them are the known sailing courses, each with a note on what it is for.',

			/* --- today --- */
			today: 'Today is a checklist for this refresh: every island you need, to tick off as you visit.',
			tick: 'The ring counts how many you have been to, and it all clears with the barter refresh.',
			esc: 'Escape, or the cross, brings the page back.',
			close: 'That is the Map. Everything you are short of, where it is, and how long it takes to get there.'
		},
		async shoot(ctx, s, ch) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/the-map.webm`);
			await card(page, ch.n, ch.title, { line: s.open });

			await doing(page, s.pins, () => tab(page, 'map', { after: 1800 }));
			if (!(await onScreen(page, '.map-side'))) await click(page, '[data-act="map-panel"]', { after: 700 });
			await pointAt(page, '.summary-stats > div:first-child', s.count, { pad: 8 });
			await track(page, '[data-act="map-pick-open"]', s.showing, { pad: 8 });
			await doing(page, s.one, async () => {
				await click(page, '[data-act="map-pick-open"]', { after: 900 });
				await page.keyboard.type('sea monster\'s scale', { delay: 55 });
				await wait(500);
				await clickText(page, '#dialog .picker-row', "Violent Sea Monster's Scale", { after: 1600 });
			});
			await doing(page, s.all, async () => {
				await click(page, '[data-act="map-pick-open"]', { after: 900 });
				await clickText(page, '#dialog .picker-row', 'Everything I am short of', { after: 1400 });
			});
			await pointAt(page, '.map-clocks', s.clocks, { pad: 8 });
			await hush(page);

			/* --- the tools ---------------------------------------------- */
			await track(page, '.map-zoom', s.tools, { pad: 8 });
			await track(page, '[data-act="map-zoom"][data-step="1"]', s.zoom, {
				act: async () => {
					await click(page, '[data-act="map-zoom"][data-step="1"]', { after: 600 });
					await click(page, '[data-act="map-zoom"][data-step="-1"]', { after: 600 });
					await drag(page, '#map', -120, 40, { from: [0.62, 0.5], after: 500 });
				}
			});
			await track(page, '[data-act="map-fit"]', s.fit,
				{ act: () => click(page, '[data-act="map-fit"]', { after: 1100 }) });
			await doing(page, s.ruler, async () => {
				await click(page, '[data-act="map-measure"]', { after: 600 });
				await clickIn(page, '#map', 0.52, 0.42, { after: 500 });
				await clickIn(page, '#map', 0.74, 0.62, { after: 900 });
			});
			await say(page, s.coords);
			await click(page, '[data-act="map-measure"]', { after: 600 });
			await track(page, '[data-act="map-mini"]', s.mini, {
				act: async () => {
					await click(page, '[data-act="map-mini"]', { after: 1200 });
					await click(page, '[data-act="map-mini"]', { after: 900 });
				}
			});
			await hush(page);

			/* --- the chart stood up ------------------------------------ */
			// The terrain is meshes off the client, fetched per tile, so
			// this is the one control in the series that needs real time
			// to answer before there is anything to talk about.
			await track(page, '[data-act="map-3d"]', s.stand,
				{ act: () => click(page, '[data-act="map-3d"]', { after: 4200 }) });
			await say(page, s.terrain);
			await doing(page, s.lean, () => drag(page, '#map', 0, -150, { hold: 'Shift', after: 900 }));
			// Leaning is what makes the curve visible, so the line about it
			// is said to a chart already leaned rather than to a flat one.
			await say(page, s.curve);
			await doing(page, s.ground, () =>
				click(page, '[data-act="map-style"][data-id="real"]', { after: 1400 }));
			await doing(page, s.neon, () =>
				click(page, '[data-act="map-style"][data-id="neon"]', { after: 1800 }));
			await doing(page, s.flat, async () => {
				await click(page, '[data-act="map-style"][data-id="real"]', { after: 900 });
				await click(page, '[data-act="map-level"]', { after: 1200 });
			});
			// Back to looking down for the rest of it: the tabs below are
			// about what the chart draws, not how it is drawn.
			await click(page, '.map-zoom [data-act="map-3d"]', { after: 1600 });
			await hush(page);

			/* --- full screen ------------------------------------------- */
			await doing(page, s.full, () => click(page, '.map-zoom [data-act="map-full"]', { after: 1500 }));
			await pointAt(page, '[data-map-fullbar]', s.now, { pad: 8 });
			// Full screen changes the chart's size, not its zoom, so the
			// marks sit in a corner of a much wider frame until it is
			// fitted again.
			await doing(page, s.refit, async () => {
				await click(page, '[data-act="map-fit"]', { after: 1800 });
				await click(page, '[data-act="map-zoom"][data-step="1"]', { after: 1200 });
			});
			if (!(await onScreen(page, '.map-side'))) await click(page, '[data-act="map-panel"]', { after: 700 });
			await track(page, '[data-act="map-side-flip"]', s.panel, {
				pad: 8,
				act: async () => {
					await click(page, '[data-act="map-side-flip"]', { after: 1200 });
					await click(page, '[data-act="map-side-flip"]', { after: 1000 });
				}
			});
			await hush(page);

			/* --- what it draws ----------------------------------------- */
			if (!(await onScreen(page, '[data-act="map-pins"]'))) {
				await click(page, '[data-act="map-layers"]', { after: 700 });
			}
			await track(page, '.map-layers', s.layers, { pad: 6 });
			await track(page, '.map-chips', s.chips, { pad: 6 });
			// No spotlight on these three: what they change is the chart, and
			// a box round the chip dims the very thing being talked about.
			await doing(page, s.habitats, async () => {
				await click(page, '[data-act="map-habitats"]', { after: 1300 });
				await click(page, '[data-act="map-habitats"]', { after: 900 });
			});
			await doing(page, s.wharves, () => click(page, '[data-act="map-wharves"][data-id="wharf"]', { after: 1300 }));
			await doing(page, s.names, async () => {
				await click(page, '[data-act="map-wharves"][data-id="wharf"]', { after: 400 });
				if (!(await onScreen(page, '[data-act="map-labels"].on'))) await click(page, '[data-act="map-labels"]', { after: 400 });
				await click(page, '[data-act="map-zoom"][data-step="1"]', { after: 900 });
				await click(page, '[data-act="map-zoom"][data-step="1"]', { after: 1400 });
			});
			await click(page, '[data-act="map-zoom"][data-step="-1"]', { after: 600 });
			await click(page, '[data-act="map-zoom"][data-step="-1"]', { after: 600 });
			await click(page, '[data-act="map-layers"]', { after: 600 });
			await hush(page);

			/* --- who has it -------------------------------------------- */
			// Five tabs named, so five tabs lit.
			await spotAll(page, '.map-tab', s.tabs, { pad: 6 });
			await doing(page, s.who, () => click(page, '[data-act="map-mode"][data-id="sail"]', { after: 900 }));
			await track(page, '.map-kinds', s.kinds, {
				pad: 6,
				act: async () => {
					await click(page, '[data-act="map-kind"][data-id="material"]', { after: 1300 });
					await click(page, '[data-act="map-kind"][data-id="all"]', { after: 700 });
				}
			});
			await pointAt(page, '.map-side .map-hint', s.pool, { pad: 6 });
			await doing(page, s.row, () => click(page, '.map-list .map-row', { after: 1800 }));
			await pointAt(page, '.map-tip', s.card, { pad: 6 });
			// The card a pin opens stays up until it is dismissed.
			if (await onScreen(page, '[data-act="map-tip-close"]')) {
				await click(page, '[data-act="map-tip-close"]', { after: 500 });
			}
			await hush(page);

			/* --- hunt -------------------------------------------------- */
			await doing(page, s.hunt, () => click(page, '[data-act="map-mode"][data-id="hunt"]', { after: 1100 }));
			if (await onScreen(page, '[data-act="map-errands"]')) {
				await doing(page, s.errands, () => click(page, '[data-act="map-errands"]', { after: 2200 }));
				// Put away again, or its loop sits over the grounds below.
				if (await onScreen(page, '[data-act="map-errands"]')) await click(page, '[data-act="map-errands"]', { after: 800 });
			}
			await say(page, s.grounds);
			// The siren by name, because the line before this one names her.
			const ground = '[data-act="map-hunt"]:not([disabled])';
			const siren = '[data-act="map-hunt"][data-id="hollow-maretta"]:not([disabled])';
			const first = await onScreen(page, siren) ? siren : ground;
			if (await onScreen(page, first)) {
				await doing(page, s.monster, () => click(page, first, { after: 1600 }));
				// A second species, not the same one again.
				await doing(page, s.more, () => click(page, `${ground}:not(.on)`, { after: 1300 }));
			} else {
				await say(page, s.monster);
				await say(page, s.more);
			}
			if (await onScreen(page, '[data-act="map-course"]')) {
				await doing(page, s.courses, () => click(page, '[data-act="map-course"]', { after: 1300 }));
			} else {
				await say(page, s.courses);
			}
			await hush(page);

			/* --- today ------------------------------------------------- */
			await doing(page, s.today, async () => {
				await click(page, '[data-act="map-mode"][data-id="today"]', { after: 900 });
				await click(page, '[data-act="map-done"]', { after: 600 });
				await click(page, '[data-act="map-done"]:not(.done)', { after: 600 });
			});
			await pointAt(page, '.map-ring-row', s.tick, { pad: 6 });
			await hush(page);

			await doing(page, s.esc, async () => {
				await page.keyboard.press('Escape');
				await wait(900);
			});
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Six -- a run
	 *
	 * The longest of the five, and deliberately so: bartering is the
	 * half of this app people arrive for, and a clip that ticks three
	 * boxes and sails teaches nobody how to plan a run.
	 *
	 * Two rules this chapter is written to, both learned the hard way.
	 * Say what a control does, in the order someone using it would meet
	 * it -- not what it means. And say it *while* it happens: `doing()`
	 * runs the interaction against the same stretch of audio, because a
	 * sentence delivered to a screen that has not moved yet is the thing
	 * that makes one of these feel slow.
	 *
	 * "The refresh", never "the day". The board turns over as often as a
	 * player pays to turn it over, and several times a day is normal.
	 * ============================================================== */
	'a-run': {
		n: 'Six', title: 'A Run', at: 'barter',
		blurb: 'Four kinds of day, and the whole of one: the board named, the chains, the sheet, the clock, and the trip recorded at the end.',
		say: {
			open: 'This is the Barter tab. Show it one island, and it plans a whole run for you.',

			/* --- 1. what the day is for --- */
			kinds: 'First, what the day is for. There are four of them, and they are not the same run.',
			silver: 'Silver climbs the chains on the board and sells the tops at a wharf.',
			stockg: 'A stock sails the same board to fill the storage instead. Nothing is sold at all.',
			target: 'Say how many of every good you want at a level. That is a floor as well as a target, so a level fills before anything climbs from it.',
			ceil: 'And climb no higher than stops the ladder where your stock ends — a Level 4 you already hold is stock, not fuel.',
			banked: 'So the run is scored on what it banks: the goods it is short of, the runs left, and the storage slots they will take.',
			coing: 'Crow Coins is the third. Every board has ten to fourteen islands paying in coins, and they take a Level 4 and nothing else.',
			coinsub: 'So a coin day is a climb to four, cashed in — counted in coins, against what your builds are still short of.',
			matg: 'And a material climbs the ladder to one thing on your list.',
			back: 'We will sail this one for silver.',
			level: 'The barter count and level you set at the start are doing real work here: the count decides which islands are on the board at all, and the level prices every Parley figure below.',

			/* --- 2. which board --- */
			board: 'Next, tell it what the board looks like.',
			forty: 'Every refresh, the sea uses one of forty layouts.',
			which: 'The app cannot know which one. So you show it a single island.',
			island: 'Click "another island", and pick the one you are looking at.',
			game: 'Now check that island in game. Open Barter Information, set the filter to Normal to Level 1, and find its row. Eveto Island is offering Essence of Liquor, for a Level 1 Cherry Tree Seed Pouch.',
			same: 'Pick that same trade here.',
			again: 'If two layouts still match, it asks you for one more island.',
			got: 'That names the layout. Every chain this refresh allows is now listed below.',
			shot: 'Or skip the clicking. Screenshot that same window, drop it here, and every row of it is read at once.',
			rows: 'Each row is matched against what that island is known to deal, so a name the window cut short still reads, and six rows usually settle the board.',
			book: 'The layout book keeps all forty, with how often each has been seen, the boards you have been dealt yourself, and any board a sailor has read that is in no record at all.',
			page: 'A layout opens island by island, marked where it agrees with what you saw and where your barter count has not opened an exchange.',
			fix: 'And if an island shows something the board does not say, tell it here. If that is one slot the game has moved, the board follows — and that is the reading worth telling the fleet.',

			/* --- 3. the orders --- */
			orders: 'Now tell it what you want out of the run.',
			floorp: 'Sell the top, keep a floor finishes every island and sells the top, but leaves something of every level for tomorrow\'s board.',
			floors: 'These boxes are that floor. It is what the selling never touches — which on an empty storage means there is nothing left to sell, and the tab says so rather than proposing a run.',
			cash: 'Cash out today is the other one: the most silver at the wharf tonight, from what is aboard and at the harbour. That is the day we will sail.',
			pace: 'Pace. Fast keeps you light and quick.',
			loaded: 'Full and loaded fills the hold past the limit. More goods, slower sailing.',
			quests: 'Quests on the way hands in dailies you have already taken, as you pass them.',
			vouchers: 'Trade vouchers are yours to spend or keep. Drawn on, one goes in as soon as the run needs it and a whole quarter fits, which starts its two-hour cooldown as early as it can be started.',
			way: 'The way round sets the route order: nearest island first, or one chain at a time.',
			where: 'And here: where you sail from, where your storage is, and a time limit if you want one.',
			saved: 'A way of running you like can be kept under a name — the orders, the targets and the ceiling with them.',

			/* --- 4. the chains --- */
			chains: 'Now the chains. It has already worked out three runs for you.',
			three: 'The most silver, the most per hour, and the most per Parley. They are rarely the same run.',
			take: 'Click one to use it.',
			tick: 'Or tick chains yourself.',
			market: 'A chain that starts ashore buys its first good on the Central Market, and the run is held to what is actually listed there. One the Market has none of cannot be ticked, and says why.',
			fill: 'Fill the rest adds the best chains around the ones you picked.',
			dock: 'The bar at the bottom totals it up: chains, silver, hours, islands.',

			/* --- 5. the run sheet --- */
			lay: 'Click "Lay it out".',
			shelves: 'The sheet opens on two shelves, tiled the way the game\'s own window is.',
			load: 'Load before casting off is what to take with you, and what it costs to buy ashore.',
			after: 'In the storage after is what comes home — and what was sold on the way.',
			stops: 'Below them, every stop in order. What you hand over, and what you get back.',
			hold: 'This bar is your hold after each trade.',
			over: 'Orange means you are over the limit. You still sail, just slower.',
			heavy: 'Red means too heavy to barter. You have to lighten first.',
			wharf: 'That is what a wharf stop is for. Drop the extra into storage, and carry on.',
			parley: 'And this bar is your Parley going down as you trade.',

			/* --- 6. the clock --- */
			clock: 'Before you cast off, the clock at the foot of the sheet.',
			est: 'It starts at this run\'s own estimate and counts up, and it carries your own pace: seconds for bartering and going on, seconds for a wharf or a quest.',
			bell: 'It rings a ship\'s bell at every stop rather than only at the end — a pair struck as each stop comes up, eight bells when the run is done.',
			devices: 'And it reaches every device signed in to your account, so the phone in your pocket rings with this tab shut.',
			go: 'Start it.',
			keeps: 'Out of the sheet it keeps time on the tab itself. Ticking a stop off re-bases the rest, so a slow island does not make the whole run chime early.',

			/* --- 7. sailing it --- */
			sail: 'Happy with it? Click "Sail this run".',
			chart: 'It goes onto the map as a checklist.',
			full: 'Full screen, if you want more sea and less panel.',
			leg: 'It follows you leg by leg, and every stop is a card with the trade on it.',
			done: 'Tick each stop as you make it. If an island pays a different amount, everything after it re-counts.',

			/* --- 8. recording it --- */
			all: 'Finished sailing? Tick them all off at once.',
			record: 'Then click "Record the trip".',
			lands: 'Silver goes to your purse, leftover goods to your inventory, and the quests are claimed.',
			undo: 'All as one change, so one undo puts it back.',

			/* --- 9. the day so far --- */
			boards: 'And the trip joins today\'s boards.',
			day: 'Every run since the refill: what it loaded, what it came back with, and the day\'s totals across the Parley bar.',
			next: 'What it will not do is guess the next board. A refresh deals a different one, and the panel says so.',

			/* --- the ship under it --- */
			ship: 'One last thing. The hold size, the speed and every time on that route come from your ship.',
			setup: 'Hull, the four parts, the crystal and the crew aboard. Change the ship, and the whole run re-times.',
			close: 'That is it. Show it one island, and it plans the rest.'
		},
		async shoot(ctx, s, ch) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/a-run.webm`);
			await card(page, ch.n, ch.title, { line: s.open });

			await tab(page, 'barter');
			await wait(1200);

			/* --- 1. which board ---------------------------------------- */
			// The board comes before the goals now, and not only because
			// it reads better: three of the four kinds of day are empty
			// screens until a layout is named. A stock sheet with no board
			// behind it has nothing to fill, and a coin day has nothing to
			// cash, so showing them first would be showing four blanks.
			await say(page, s.board);
			await say(page, s.forty);
			await say(page, s.which);
			// The island is named rather than left to whichever one the tab
			// suggests, because the still that follows is a photograph of
			// Eveto's row in the game's own window: if the app answered about
			// some other island the two would be telling different stories.
			await doing(page, s.island, async () => {
				await click(page, '[data-act="barter-board-island"]', { after: 500 });
				await page.type('.picker-in', 'Eveto', { delay: 55 });
				await wait(450);
				await click(page, '.picker-row', { after: 600 });
			});
			await still(page, 'tools/capture/shots/barter-window.webp', { line: s.game });
			await doing(page, s.same, async () => {
				await page.type('.picker-in', 'Essence of Liquor', { delay: 55 });
				await wait(450);
				// Both ends of the trade, or the app's own ranking picks a
				// different one and the film contradicts the screenshot it
				// just showed.
				await clickText(page, '.picker-row',
					['Essence of Liquor', 'Cherry Tree Seed Pouch'], { after: 700 });
			});

			// One island usually names the layout. Where two of the forty
			// still fit the tab keeps asking, which is the real flow, so the
			// film answers again rather than being seeded past it.
			const settled = () => onScreen(page, 'button.chain[data-act="barter-chain"]');
			for (let go = 0; go < 4 && !(await settled()); go++) {
				// The chip goes the moment the board is named and the chains it
				// names take a beat to draw, so its absence is asked about
				// rather than assumed.
				if (!(await onScreen(page, '[data-act="barter-board-ask"]'))) break;
				if (go === 0) await say(page, s.again);
				await click(page, '[data-act="barter-board-ask"]', { after: 500 });
				await click(page, '.picker-row', { after: 900 });
			}
			await waitFor(page, 'button.chain[data-act="barter-chain"]', { upTo: 30000, then: 400 });
			await say(page, s.got);
			await hush(page);

			/* --- 1b. the same, off a screenshot; and the book ---------- */
			// The window read rather than clicked through. The board is
			// already named, so the rows are looked at and the dialog put
			// away: answering it again would say nothing new, and the point
			// is that the six rows on screen are the six in the picture the
			// film showed a moment ago.
			await doing(page, s.shot, async () => {
				await click(page, '[data-act="barter-shot"]', { after: 800 });
				const input = await page.$('#dialog input[type=file]');
				await input.uploadFile(path.resolve('tools/capture/shots/barter-window.webp'));
			});
			await doing(page, s.rows, () => waitFor(page, '#dialog .shot-table', { upTo: 240000, then: 500 }));
			await page.keyboard.press('Escape');
			await wait(500);
			await doing(page, s.book, () => click(page, '[data-act="barter-book"]', { after: 1200 }));
			await doing(page, s.page, async () => {
				await click(page, '.lb-card.today, .lb-card:not(.stray)', { after: 1200 });
				await click(page, '[data-lb-level="L5"]', { after: 900 });
			});
			await page.keyboard.press('Escape');
			await wait(500);
			await doing(page, s.fix, () => click(page, '[data-act="barter-board-fix"]', { after: 1200 }));
			await page.keyboard.press('Escape');
			await wait(500);
			await hush(page);

			/* --- 2. what the day is for -------------------------------- */
			// The goal toggle lives on the board bar, beside the layout it
			// has just named -- which is the right place for it, because
			// all four sail the same board and differ only in what they do
			// with it. Each is pressed and shown, then silver is chosen
			// again: it is the day the rest of the chapter sails.
			await say(page, s.kinds);
			await doing(page, s.silver, () => click(page, '[data-act="barter-goal"][data-id="silver"]', { after: 500 }));
			await doing(page, s.stockg, () => click(page, '[data-act="barter-goal"][data-id="stock"]', { after: 1600 }));
			await spot(page, '.stock-rows', s.target, {
				pad: 6,
				act: () => typeInto(page, '.stock-row .purse-inline', '30', { after: 1200 })
			});
			await spot(page, '[data-act="barter-ceiling"]', s.ceil, {
				pad: 10,
				act: () => choose(page, '[data-act="barter-ceiling"]', '4', { after: 1400 })
			});
			await point(page, '.run-ahead', s.banked, { pad: 8 });
			await doing(page, s.coing, () => click(page, '[data-act="barter-goal"][data-id="coin"]', { after: 1800 }));
			await point(page, '.orders-coin', s.coinsub, { pad: 8 });
			await doing(page, s.matg, () => click(page, '[data-act="barter-goal"][data-id="material"]', { after: 1100 }));
			await doing(page, s.back, () => click(page, '[data-act="barter-goal"][data-id="silver"]', { after: 900 }));
			await say(page, s.level);
			await hush(page);

			/* --- 3. the orders ----------------------------------------- */
			await say(page, s.orders);
			// "Build the stocks" until 1.2, when the tab grew a goal that
			// actually builds one. The preset is the other day: it sells,
			// and the floors are there so selling does not strip the pile.
			await doing(page, s.floorp, () => click(page, '[data-act="barter-preset"][data-id="floor"]', { after: 900 }));
			// The keep-back row sits below the fold on a 820px frame, so
			// "these boxes" was said over a screen that did not have them
			// on it. `spot` scrolls to it and lights it.
			await spot(page, '.run-floors', s.floors);
			// And off it again, because this save holds no trade goods at
			// all: with a floor of ten at every level there is nothing the
			// run is allowed to sell, and the tab says so rather than
			// proposing a run. True of the app, and a poor thing to sail a
			// chapter on -- so the run itself cashes out.
			await doing(page, s.cash, () => click(page, '[data-act="barter-preset"][data-id="cash"]', { after: 900 }));
			await say(page, s.pace);
			await doing(page, s.loaded, () => choose(page, '[data-act="barter-pace"]', 'full', { after: 300 }));
			await doing(page, s.quests, () => choose(page, '[data-act="barter-quests"]', 'yes', { after: 300 }));
			await doing(page, s.vouchers, () => choose(page, '[data-act="barter-vouchers"]', 'use', { after: 300 }));
			await doing(page, s.way, () => choose(page, '[data-act="barter-way"]', 'chain', { after: 300 }));
			await doing(page, s.where, () => moveTo(page, '[data-act="barter-hours"]', { settle: 300 }));
			await point(page, '.orders-saved', s.saved, { pad: 8 });
			await hush(page);

			/* --- 4. the chains ----------------------------------------- */
			await waitFor(page, '[data-act="barter-propose"]', { upTo: 60000, then: 300 });
			await say(page, s.chains);
			await say(page, s.three);
			await doing(page, s.take, () => click(page, '[data-act="barter-propose"]', { after: 700 }));
			await doing(page, s.tick, () => click(page, 'button.chain:not(.on):not(:disabled)[data-act="barter-chain"]', { after: 700 }));
			// The Market is the live one, so whether a shelf is bare on the
			// day of the shoot is not the film's to arrange: a chain it has
			// run dry is pointed at when there is one, and a chain bought
			// ashore when there is not -- the sentence is true of both.
			await point(page, (await onScreen(page, '.chain.dry')) ? '.chain.dry' : 'button.chain[data-act="barter-chain"]', s.market, { pad: 8 });
			await doing(page, s.fill, () => click(page, '[data-act="barter-fill"]', { after: 1800 }));
			await doing(page, s.dock, () => moveTo(page, '[data-act="barter-run-open"]', { settle: 300 }));
			await hush(page);

			/* --- 5. the run sheet -------------------------------------- */
			await waitFor(page, '[data-act="barter-run-open"]', { upTo: 30000, then: 300 });
			await doing(page, s.lay, () => click(page, '[data-act="barter-run-open"]', { after: 1400 }));
			// The sheet opens on the two shelves now -- what to load, and
			// what is in the storage after -- and the stop list is below
			// them. Everything that used to be said twice is said once.
			await say(page, s.shelves);
			await point(page, '.shelf:first-of-type .shelf-tiles', s.load, { pad: 8 });
			await point(page, '.shelf:last-of-type .shelf-tiles', s.after, { pad: 8 });
			await say(page, s.stops);
			// Each of the rest names one bar or one state among a hundred
			// rows, and whether this board dealt one is not the script's to
			// promise -- `point` speaks the line either way.
			await point(page, '.run-hold .run-bar:not(.parley)', s.hold);
			await point(page, '.run-hold:has(b.amber)', s.over);
			await point(page, '.run-hold:has(b.warn)', s.heavy);
			await point(page, '.run-stop.wharf', s.wharf);
			await point(page, '.run-parley', s.parley);
			await hush(page);

			/* --- 6. the clock ------------------------------------------ */
			// The clock is at the foot of the sheet, beside Sail this run,
			// because that is the moment it is wanted: the ship is about to
			// leave and the estimate is already on the button.
			await page.evaluate(() => { const f = document.querySelector('.run-foot'); if (f) f.scrollIntoView({ block: 'center' }); });
			await wait(700);
			// Everything the clock offers is said while it is still idle:
			// starting it swaps the chips for a counting bar, so a beat
			// about what chimes has to come before the press, not after.
			await point(page, '.run-foot [data-act="barter-timer-start"]', s.clock, { pad: 8 });
			await say(page, s.est);
			await point(page, '.sail-timer-modes', s.bell, { pad: 8 });
			await point(page, '[data-act="barter-timer-devices"]', s.devices, { pad: 10 });
			await doing(page, s.go, () => click(page, '.run-foot [data-act="barter-timer-start"]', { after: 1800 }));
			await hush(page);

			/* --- 7. sailing it ----------------------------------------- */
			await doing(page, s.sail, () => click(page, '[data-act="barter-sail"]', { after: 2000 }));
			await say(page, s.chart);
			// Sailing lands on the Map. Full screen is a toggle, so it is
			// turned back off before the sail bar is wanted again.
			const canFull = await onScreen(page, '[data-act="map-full"]');
			if (canFull) await doing(page, s.full, () => click(page, '[data-act="map-full"]', { after: 900 }));
			else await say(page, s.full);
			await say(page, s.leg);
			if (canFull) await click(page, '[data-act="map-full"]', { after: 900 });
			await doing(page, s.done, async () => {
				if (await onScreen(page, '[data-act="barter-stop-done"]')) {
					await click(page, '[data-act="barter-stop-done"]', { after: 700 });
				}
			});
			await say(page, s.keeps);
			await hush(page);

			/* --- 8. recording it --------------------------------------- */
			await doing(page, s.all, async () => {
				await click(page, '[data-act="barter-sail-all"]', { after: 500 });
				await click(page, '[data-act="barter-sail-all-go"]', { after: 1200 });
			});
			await doing(page, s.record, () => click(page, '[data-act="barter-record"]', { after: 1600 }));
			await say(page, s.lands);
			await say(page, s.undo);
			await hush(page);

			/* --- 9. the day so far ------------------------------------- */
			// Recording the trip is what puts a board on this panel, so it
			// can only be shown here -- and here it is showing the run the
			// chapter has just sailed rather than a seeded one.
			await tab(page, 'barter', { after: 1200 });
			await point(page, '.day-boards .panel-head', s.boards, { pad: 8 });
			await point(page, '.day-total', s.day, { pad: 8 });
			await point(page, '.day-note', s.next, { pad: 8 });
			await hush(page);

			/* --- the ship under it ------------------------------------- */
			await doing(page, s.ship, () => tab(page, 'crew', { after: 800 }));
			await say(page, s.setup);
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Seven -- the harbour
	 *
	 * The one chapter that cannot be shot honestly: a capture machine
	 * has no deployment with players on it, so fleet.mjs invents four
	 * and answers the community API with them. The tab, the digest and
	 * the ranking are the app's own, and the film says so in its second
	 * line rather than in a caption nobody reads.
	 * ============================================================== */
	'the-harbour': {
		n: 'Seven', title: 'The Harbour', at: 'community',
		blurb: 'Signing in puts you on the boards; how you are shown, what a place opens, the fleet in numbers, leaving, the feedback box and the Menu.',
		staged: true,
		say: {
			open: 'Everything so far runs in your browser alone. This part has other sailors in it, and it needs sign-in.',
			fleet: 'One note first: the sailors on these boards are invented. A machine recording this has no server with real players on it. The tab, the digest and the ranking are the app\'s own.',

			/* --- on the boards --- */
			signin: 'Signing in with Discord puts you on the boards by name. The first time, the tab says so, and what is shared: the numbers, never your stock, your notes or your traces.',
			shown: 'Change how you are shown picks your Discord name, or an unnamed sailor: still counted and ranked, but shown only as a sailor.',
			digest: 'Under it is the exact digest that would be shared right now. Nothing else of your save goes up.',
			places: 'Your own places sit at the top, so you can see where you stand without hunting for yourself.',

			/* --- the boards --- */
			boards: 'Sixteen boards, in five sections: the sea, the runs, quests and hunts, the yard, and charts and hold.',
			section: 'Press a section to see just its boards.',
			how: 'The question mark on a board says exactly how it is counted.',
			find: 'And Find a sailor searches the boards by name. An unnamed sailor cannot be found that way; that is what unnamed means.',

			/* --- a place is a door --- */
			door: 'Click any place on a board to open that sailor\'s card.',
			card: 'Their fleet, their crew, their places, and what they have done at sea.',
			look: 'Look stands their ship up on your own Ship tab, fully fitted and crewed.',
			back: 'To look at, not to keep. One press puts yours back.',

			/* --- the fleet in numbers --- */
			numbers: 'The other half of the tab adds the whole fleet up.',
			cats: 'Which hulls people sail, which parts they fit, which crystals, which islands they plot routes through, and which quests they run.',
			item: 'Click a line, and its card opens: what it costs, and what it is made from.',
			sort: 'Search it for anything, and sort by most first or A to Z.',

			/* --- leaving --- */
			leave: 'Leave the boards takes your places off, and deletes the digest the server holds.',
			stays: 'Your save is untouched, and signing in again will not quietly put you back. Stay keeps you on.',

			/* --- writing in --- */
			box: 'One more door, in the Menu: Feedback.',
			kinds: 'Something wrong, an idea, or something else. It reaches whoever runs this copy of the app.',
			post: 'A report is a post, not a form: bold, lists, quotes, a link, and a screenshot pasted straight in.',
			preview: 'Preview shows it the way it will be read.',
			attached: 'Your name, the screen you were on and the build you are running go with it, so nobody has to ask which version.',

			/* --- the menu --- */
			menu: 'The Menu holds the rest of the app: Find, the trip log, Undo and Redo, at the top.',
			saves: 'Profiles keep separate saves on one browser. Export and Import move a save as a file or a link.',
			help: 'Help plays this film, the Tour walks through your own screen, and What\'s new lists each release.',
			look2: 'And the theme, the water behind the page, and the language, which changes the app and every item name together.',
			close: 'Your data stays in your browser. Sign in to sync it between machines, or to join in. Neither is required for anything else in the app.'
		},
		async shoot(ctx, s, ch) {
			const { page, url } = ctx;
			// Before the seed, so /api/config is already saying `community`
			// when the tab strip is first drawn.
			await fakeCommunity(page);
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/the-harbour.webm`);
			await card(page, ch.n, ch.title, { line: s.open });

			await doing(page, s.fleet, () => tab(page, 'community', { after: 900 }));

			/* --- on the boards ----------------------------------------- */
			await pointAt(page, '.comm-notice', s.signin, { pad: 6 });
			await doing(page, s.shown, () => click(page, '.comm-notice [data-act="community-join"], [data-act="community-join"]', { after: 1300 }));
			await doing(page, s.digest, async () => {
				await page.evaluate(() => {
					const b = document.querySelector('#dialog .dialog-box');
					if (b) b.scrollBy({ top: 260, behavior: 'smooth' });
				});
				await wait(900);
			});
			await page.keyboard.press('Escape');
			await wait(500);
			await pointAt(page, '.comm-you', s.places, { pad: 6 });
			await hush(page);

			/* --- the boards -------------------------------------------- */
			await pointAt(page, '[data-act="community-sec"]', s.boards, { pad: 6 });
			await doing(page, s.section, async () => {
				await click(page, '[data-act="community-sec"][data-id="runs"]', { after: 1500 });
				await click(page, '[data-act="community-sec"][data-id="all"]', { after: 700 });
			});
			await doing(page, s.how, () => click(page, '[data-act="community-how"]', { after: 1300 }));
			await page.keyboard.press('Escape');
			await wait(500);
			await doing(page, s.find, async () => {
				await click(page, '[data-act="community-find"]', { after: 1100 });
				await page.keyboard.type('sea', { delay: 90 });
				await wait(900);
			});
			await page.keyboard.press('Escape');
			await wait(500);
			await hush(page);

			/* --- a place on a board is a door -------------------------- */
			await doing(page, s.door, () =>
				click(page, '[data-act="community-entry"][data-board="ship"]', { after: 1400 }));
			await say(page, s.card);
			await doing(page, s.look, () => click(page, '[data-act="community-look"]', { after: 1800 }));
			await doing(page, s.back, () => click(page, '[data-shared="back"]', { after: 1100 }));
			await hush(page);

			/* --- the fleet in numbers ---------------------------------- */
			await doing(page, s.numbers, async () => {
				await tab(page, 'community', { after: 800 });
				await click(page, '[data-act="community-half"][data-id="numbers"]', { after: 1000 });
			});
			await spotAll(page, '[data-act="community-cat"]', s.cats, { pad: 6 });
			await doing(page, s.item, () => click(page, '[data-act="community-item"]', { after: 1400 }));
			await page.keyboard.press('Escape');
			await wait(500);
			await pointAt(page, '[data-act="community-numq"]', s.sort, {
				pad: 10,
				act: async () => {
					await click(page, '[data-act="community-sort"][data-id="name"]', { after: 1000 });
					await click(page, '[data-act="community-sort"][data-id="count"]', { after: 600 });
				}
			});
			await hush(page);

			/* --- leaving ----------------------------------------------- */
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await wait(500);
			await doing(page, s.leave, () => click(page, '.comm-you [data-act="community-leave"], [data-act="community-leave"]', { after: 1300 }));
			await doing(page, s.stays, () => click(page, '#dialog [data-close]', { after: 900 }));
			await hush(page);

			/* --- writing in -------------------------------------------- */
			// The box is under Menu rather than on this tab, but it belongs
			// to the same half of the app -- the half with other people in
			// it -- and this is the only chapter signed in, which the box
			// needs.
			await doing(page, s.box, async () => {
				await click(page, '[data-act="more"]', { after: 700 });
				await click(page, '[data-act="feedback"]', { after: 1400 });
			});
			await pointAt(page, '.fb-kinds', s.kinds, {
				pad: 8,
				act: () => click(page, '.fb-kind:not(.on)', { after: 600 })
			});
			await pointAt(page, '.fb-compose', s.post, {
				pad: 6,
				act: async () => {
					await click(page, '.fb-text', { after: 300 });
					await page.keyboard.type('The stock run fills a level before it climbs from it, which is exactly what I asked for.', { delay: 32 });
					await wait(400);
					await click(page, '.fb-mark[data-mark="quote"]', { after: 600 });
				}
			});
			await doing(page, s.preview, () => click(page, '#dialog [data-act="preview"]', { after: 1200 }));
			await pointAt(page, '.fb-meta', s.attached, { pad: 8 });
			await page.keyboard.press('Escape');
			await wait(600);
			await hush(page);

			/* --- the menu ---------------------------------------------- */
			await doing(page, s.menu, () => click(page, '[data-act="more"]', { after: 1000 }));
			// The drawer scrolls on its own, which spotAll's window scroll
			// does not reach: bring the group into the drawer's view first.
			await page.evaluate(() => document.querySelector('.sheet-item[data-act="profiles"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
			await wait(500);
			await spotAll(page, '.sheet-item[data-act="profiles"], .sheet-item[data-act="export"], .sheet-item[data-act="import"]', s.saves, { pad: 6, top: 60 });
			// The drawer scrolls on its own, which spotAll's window scroll
			// does not reach: bring the group into the drawer's view first.
			await page.evaluate(() => document.querySelector('.sheet-item[data-act="whats-new"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
			await wait(500);
			await spotAll(page, '.sheet-item[data-act="whats-new"], .sheet-item[data-act="help"], .sheet-item[data-act="tour"]', s.help, { pad: 6, top: 60 });
			// The drawer scrolls on its own, which spotAll's window scroll
			// does not reach: bring the group into the drawer's view first.
			await page.evaluate(() => document.querySelector('.sheet-item[data-act="theme"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
			await wait(500);
			await spotAll(page, '.sheet-item[data-act="theme"], .sheet-item[data-act="water"], .sheet-item[data-act="language"]', s.look2, { pad: 6, top: 60 });
			await page.keyboard.press('Escape');
			await wait(600);
			await say(page, s.close);
			await hush(page);
		}
	}

};

/* ------------------------------------------------------------------ *
 * shooting them
 * ------------------------------------------------------------------ */

// The chapters written one to a file, under chapters/. Each exports a
// chapter of the shape above, with an `id`; its `shoot` is handed the
// output folder as `ctx.out`.
for (const f of (await readdir(new URL('./chapters/', import.meta.url)).catch(() => [])).filter(f => f.endsWith('.mjs')).sort()) {
	const ch = (await import(`./chapters/${f}`)).default;
	if (CHAPTERS[ch.id]) throw new Error(`chapter ${ch.id} is defined twice`);
	CHAPTERS[ch.id] = ch;
}
// Numbered by where they stand in the film, so a chapter added or moved
// is never captioned with a number it no longer has.
const WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
	'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
ORDER.forEach((id, i) => { if (CHAPTERS[id]) CHAPTERS[id].n = WORDS[i] || String(i + 1); });

const run = only.length ? only : ORDER.filter(id => CHAPTERS[id]);
for (const name of run) {
	if (!CHAPTERS[name]) {
		console.log(`? unknown chapter ${name}`);
		process.exit(1);
	}
}

// Every line in one go, before any browser opens. Loading the model is
// most of the cost of saying anything, so a hundred lines said in one
// process is a couple of minutes where the same hundred said one at a
// time is a quarter of an hour -- and a line synthesised mid-take would
// freeze the picture while it was thought about.
console.log(`voice: ${engine()}`);
await warm(run.flatMap(name => Object.values(CHAPTERS[name].say)));

for (const name of run) {
	const ch = CHAPTERS[name];
	console.log(`shooting ${name} -- ${ch.n}, ${ch.title}`);
	// A browser each: the harbour installs a faked sign-in that must not
	// leak into a chapter shot after it, and a chapter that dies takes
	// only its own context down with it.
	const ctx = await open({ width: 1280, height: 820 });
	ctx.out = OUT;
	try {
		await ch.shoot(ctx, ch.say, ch);
		const reel = await cut();
		await writeFile(`${OUT}/${name}.json`, JSON.stringify({
			...reel, id: name, n: ch.n, title: ch.title, blurb: ch.blurb, staged: Boolean(ch.staged)
		}, null, '\t'));
		console.log(`  → ${name}.webm  (${(reel.ms / 1000).toFixed(0)}s, ${reel.lines.length} lines)`);
	} finally {
		await ctx.browser.close();
	}
}
console.log('done');
