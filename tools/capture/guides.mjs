// The guide films: five chapters, narrated.
//
// The walkthrough in tour.mjs is one run past everything for someone who
// has never opened the app. These are the other thing -- five parts you
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
	onScreen, headerBtn, waitFor, film, cut, card, still, choose
} from './drive.mjs';
import { warm, engine } from './voice.mjs';
import { fittedShip } from './states.mjs';
import { fakeCommunity } from './fleet.mjs';

const OUT = process.argv[2] || 'tools/capture/out';
const only = process.argv.slice(3);

/* ------------------------------------------------------------------ *
 * the inventories the chapters are shot against
 * ------------------------------------------------------------------ */

/* Part-way through a Carrack part: something covered, something short, a
 * part mid-enhancement, and coins in the purse. The same starting point
 * the walkthrough uses, so the two films agree about what you own. */
const START = {
	v: 2,
	stock: {
		'Violent Wave Plywood': 87,
		"Violent Sea Monster's Scale": 400,
		"Saltwater Crocodile's Scale": 400,
		"Violent Sea Monster's Ooze": 260,
		'Starlight Emulsifier': 260,
		"Blueprint: Chiro's Sail": 10,
		'Epheria Carrack Parts Upgrade Permit: Advance': 1,
		'+7 Epheria Carrack: Toro Sail': 1,
		'Tidal Black Stone': 900,
		'Crow Coin': 42000
	},
	targets: [],
	strategy: {},
	history: [],
	settings: {},
	profile: { crewShip: 'Carrack (Advance)' }
};

/** A part levelled in game and not yet recorded, for the Yard's last beat. */
const withPlating = {
	...START,
	stock: { ...START.stock, 'Epheria Carrack: Toro Plating': 1 }
};

/**
 * The same yard, a few minutes later: two Carrack parts queued, and a
 * Carrack to sail.
 *
 * The Yard queues its builds on camera, so it can open on an empty
 * queue. Every chapter after it opens somewhere that only means
 * anything against a shopping list -- the Map draws a pin per barterer
 * holding something you are short of, and the route it plots is that
 * list joined up. Shot against an empty queue, the pins read "0 of 91"
 * and there is no loop to plot at all, which is how this was found.
 */
const QUEUED = fittedShip;

/* ------------------------------------------------------------------ *
 * the chapters
 * ------------------------------------------------------------------ */

const CHAPTERS = {

	/* ============================================================== *
	 * One -- the yard
	 * ============================================================== */
	'the-yard': {
		n: 'One', title: 'The Yard', at: 'plan',
		blurb: 'Queue a build, record what you gather, make what you can, and price the rest.',
		say: {
			open: 'Every build in this app draws on one inventory: the one you actually have.',
			queue: 'You start by queueing something you want to build.',
			asks: 'Some ships can be reached more than one way, so it asks which.',
			costs: 'It shows what each route costs. Neither of them is the right answer.',
			order: 'Queue a second thing, and the order matters. When stock is short, the build at the top gets it.',
			plan: 'The Plan is everything the queue needs, gathered into one list.',
			colours: 'Red is missing. Blue is still to make. Green is already covered.',
			own: 'As you gather, you type in what you have.',
			replan: 'And every build re-plans around it, at once.',
			trip: 'A whole trip can go in as one change, rather than a box at a time.',
			shop: 'Anything you have the materials for can be made in the Workshop.',
			craft: 'Crafting moves real stock. Ingredients out, the product in.',
			undo: 'Slipped? Every change here steps back, and forward again.',
			enh: 'Enhancing is kept separate, because attempts fail.',
			odds: 'So it shows the real odds at your stack, and the most the part can ever cost you.',
			inv: 'The Inventory is one tile per thing you own, or still need.',
			ways: 'Open any of them and every way of getting it is priced:',
			deep: 'what the shop wants, against what making one costs once its own ingredients are priced too, all the way down.',
			level: 'A part you already levelled in the game is recorded, not re-enhanced.',
			nostones: 'You tell it where the part got to, and it spends nothing to agree with you.',
			tree: 'The Tree is there for the other question: why a build needs what it needs.',
			get: 'And To Get is the shopping list, grouped by where you would go for it.',
			close: 'That is the yard. What you want, what it takes, and what you still have to find.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, withPlating);
			await film(page, `${OUT}/the-yard.webm`);
			await card(page, 'One', 'The Yard', { line: s.open });

			await tab(page, 'builds');
			await say(page, s.queue);
			await click(page, '[data-act="add-build"]', { after: 700 });
			await page.type('.picker-search', 'caravel', { delay: 80 });
			await wait(700);
			await click(page, '[data-pick="Epheria Caravel"]', { after: 900 });
			await say(page, s.asks);
			await say(page, s.costs);
			await click(page, '.route:not(.on)', { after: 900 });
			await hush(page);

			await click(page, '[data-act="add-build"]', { after: 700 });
			await page.type('.picker-search', "chiro's sail", { delay: 80 });
			await wait(700);
			await click(page, '[data-pick="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 900 });
			await say(page, s.order);
			await hush(page);

			await tab(page, 'plan');
			await say(page, s.plan);
			await say(page, s.colours);
			await hush(page);

			await say(page, s.own);
			await typeInto(page, '.own-input[data-item="Violent Wave Plywood"]', '300', { after: 800 });
			await say(page, s.replan);
			await hush(page);

			// The trip log is a dialog, and dismissing it is what puts the
			// Plan back under the pointer for the tab press that follows.
			await headerBtn(page, 'trip-log', { after: 1100 });
			await say(page, s.trip);
			await page.keyboard.press('Escape');
			await wait(500);
			await hush(page);

			await tab(page, 'workshop');
			await say(page, s.shop);
			await click(page, '.craft-card [data-times="field"]', { after: 1400 });
			await say(page, s.craft);
			await hush(page);

			await say(page, s.undo);
			await headerBtn(page, 'undo', { after: 1200 });
			await headerBtn(page, 'redo', { after: 1200 });
			await hush(page);

			await say(page, s.enh);
			await say(page, s.odds);
			await hush(page);
			await page.keyboard.press('Escape');
			await wait(400);

			await tab(page, 'inventory');
			await waitFor(page, '[data-act="select"][data-item="Violent Wave Plywood"]');
			await say(page, s.inv);
			await click(page, '[data-act="select"][data-item="Violent Wave Plywood"]', { after: 900 });
			await say(page, s.ways);
			await say(page, s.deep);
			await hush(page);
			await page.keyboard.press('Escape');
			await wait(600);

			// The part that came back from the game at +7, recorded rather
			// than re-enhanced: the app's answer to a level you already have.
			await click(page, '[data-act="query"]', { after: 200 });
			await page.type('[data-act="query"]', 'toro plating', { delay: 90 });
			await wait(900);
			await say(page, s.level);
			await click(page, '.tile', { after: 900 });
			await click(page, '.lvl:nth-child(8)', { after: 900 });
			await say(page, s.nostones);
			await click(page, '[data-act="move-level"]', { after: 1400 });
			await hush(page);
			await page.keyboard.press('Escape');
			await wait(500);

			await tab(page, 'tree');
			await say(page, s.tree);
			await click(page, '[data-act="tree-pick"]', { after: 700 });
			await click(page, '[data-act="tree-target"][data-item="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 1200 });
			await hush(page);

			await tab(page, 'get');
			await say(page, s.get);
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Two -- the sea
	 * ============================================================== */
	'the-sea': {
		n: 'Two', title: 'The Sea', at: 'map',
		blurb: 'The day\'s free rewards, and the shopping list drawn on the water.',
		say: {
			open: 'The yard says what you need. The sea is where you go and get it.',
			quests: 'Quests is what the sea hands you for free, every day.',
			marked: 'The ones paying in something on your list are marked, so you can tell at a glance which are worth the detour.',
			tick: 'Tick a few off, and Finish records them together.',
			land: 'The rewards land in your stock as one change, which undo can take back.',
			reset: 'The ticks wear off at the daily reset by themselves.',
			map: 'The Map is that same shopping list, drawn on the sea.',
			pins: 'Every pin is a barterer holding something you are short of.',
			route: 'Plot the loop, and it draws you one, bent round the land rather than through it.',
			legs: 'Every leg carries its distance and its minutes,',
			speed: 'worked out at the speed the ship you are actually sailing makes.',
			layers: 'One strip along the top says what the chart draws:',
			what: 'barterers, habitats, wharves, island names, and anything you have drawn yourself.',
			draw: 'Because some routes a shopping list cannot express.',
			stops: 'Click the water for a numbered stop, in the order you mean to sail it.',
			pen: 'Drag to draw a line, freehand.',
			word: 'Or type a word straight onto the sea.',
			chart: 'It all lives on the chart, so it pans and zooms with everything else.',
			keep: 'Keep it under a name, share it as a link, or send it to the game\'s own map as bookmarks.',
			close: 'That is the sea: what is out there, how far, and how long it takes to get to.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/the-sea.webm`);
			await card(page, 'Two', 'The Sea', { line: s.open });

			await tab(page, 'quests');
			await wait(700);
			await say(page, s.quests);
			await say(page, s.marked);
			// Only the quests paying one fixed reward: a pick-one quest
			// stops Finish to ask which, which is true but not this beat.
			const plain = '.quest:not(.done):not(.selected):has([data-act="quest-claim"]) .quest-check';
			await click(page, plain, { after: 600 });
			await click(page, plain, { after: 800 });
			await say(page, s.tick);
			await click(page, '[data-act="quest-finish"]', { after: 1500 });
			await say(page, s.land);
			await say(page, s.reset);
			await hush(page);

			await tab(page, 'map');
			await wait(1400);
			if (!(await onScreen(page, '.map-side'))) await click(page, '[data-act="map-panel"]', { after: 900 });
			await say(page, s.map);
			await say(page, s.pins);
			await hush(page);

			await click(page, '[data-act="map-mode"][data-id="route"]', { after: 1000 });
			await say(page, s.route);
			await click(page, '[data-act="map-route-use"]', { after: 2400 });
			await say(page, s.legs);
			await say(page, s.speed);
			await hush(page);

			// Turning the barterers off is both the demonstration and the
			// clean sheet the drawing beat needs: three traced stops are
			// invisible under fifty-eight pins.
			if (!(await onScreen(page, '[data-act="map-pins"]'))) {
				await click(page, '[data-act="map-layers"]', { after: 800 });
			}
			await say(page, s.layers);
			await say(page, s.what);
			await click(page, '[data-act="map-pins"]', { after: 1400 });
			await hush(page);

			await click(page, '[data-act="map-mode"][data-id="trace"]', { after: 1000 });
			await say(page, s.draw);
			await click(page, '[data-act="trace-tool"][data-id="point"]', { after: 700 });
			for (const [fx, fy] of [[0.362, 0.16], [0.50, 0.29], [0.435, 0.54]]) {
				await clickIn(page, '#map', fx, fy, { after: 700 });
			}
			await say(page, s.stops);
			await click(page, '[data-act="trace-tool"][data-id="pen"]', { after: 700 });
			await drag(page, '#map', 140, -70, { from: [0.56, 0.66], after: 900 });
			await say(page, s.pen);
			await click(page, '[data-act="trace-tool"][data-id="text"]', { after: 700 });
			await clickIn(page, '#map', 0.40, 0.44, { after: 700 });
			await page.keyboard.type('the long way home', { delay: 85 });
			await wait(900);
			await say(page, s.word);
			await say(page, s.chart);
			await say(page, s.keep);
			await hush(page);

			await drag(page, '#map', -200, -90, { after: 500 });
			await drag(page, '#map', 160, 50, { after: 500 });
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Three -- your ship
	 * ============================================================== */
	'your-ship': {
		n: 'Three', title: 'Your Ship', at: 'crew',
		blurb: 'A hull, four parts, a crystal and a crew — read off the game\'s own screenshots.',
		say: {
			open: 'A ship in this game is a hull, four parts, a sea crystal and a crew. The Ship tab is all five at once.',
			slots: 'Each slot takes the best part you already hold, or one you pick yourself.',
			mastery: 'Your Sailing Mastery counts toward speed as well, so it is a number you type in.',
			moves: 'And every figure on the card moves with it.',
			crew: 'The crew is the part nobody enjoys entering. Eighteen sailors, four growths each.',
			why: 'It is also the part that cannot be estimated: a levelled sailor\'s real rolls are what make the speed the game\'s, rather than a guess.',
			shots: 'So it reads them off the screenshots you already took.',
			drop: 'Drop in the game\'s own Manage Sailors window, one sailor a shot.',
			local: 'The reading happens here in the browser. The files never leave the machine.',
			wait: 'It works through them, and comes back with a table rather than a roster,',
			check: 'because a scan that misreads a level should cost you a glance, not a crew.',
			take: 'Check them against the game, and take the ones that are right.',
			setups: 'A whole fit-out can be kept under a name, and switched between.',
			link: 'And the lot of it copies as a link, if someone asks what you are sailing.',
			close: 'That is your ship: every number on it either yours, or read off your own screen.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/your-ship.webm`);
			await card(page, 'Three', 'Your Ship', { line: s.open });

			await tab(page, 'crew');
			await wait(900);
			await say(page, s.slots);
			await hush(page);
			await say(page, s.mastery);
			await typeInto(page, '[data-act="crew-mastery"]', '750', { after: 1200 });
			await say(page, s.moves);
			await hush(page);

			await say(page, s.crew);
			await say(page, s.why);
			await say(page, s.shots);
			await click(page, '[data-act="crew-import"]', { after: 1100 });
			await say(page, s.drop);
			await say(page, s.local);

			// The real thing: the game's own window, cropped to the dialog
			// and handed to the file input the way a person would hand it
			// over. Everything past here is the reader actually reading.
			const input = await page.$('input[data-files]');
			await input.uploadFile(
				path.resolve('tools/capture/shots/sailor-1.webp'),
				path.resolve('tools/capture/shots/sailor-2.webp'),
				path.resolve('tools/capture/shots/sailor-3.webp')
			);
			await say(page, s.wait);
			await say(page, s.check);
			// The first read fetches the engine -- about six megabytes --
			// and then does three passes of OCR, so this is the one beat
			// in the series that genuinely takes its time.
			await waitFor(page, '.shot-table', { upTo: 180000, then: 1200 });
			await say(page, s.take);
			await click(page, '[data-add]', { after: 1800 });
			await hush(page);

			await say(page, s.setups);
			await click(page, '[data-act="crew-setup-save"]', { after: 1100 });
			await page.keyboard.press('Escape');
			await wait(500);
			await hush(page);

			await say(page, s.link);
			await click(page, '[data-act="crew-link"]', { after: 1400 });
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Four -- a run
	 *
	 * The longest of the five, and deliberately so. Bartering is the
	 * half of this app people arrive for, and a clip that ticks three
	 * boxes and sails teaches nobody how to plan a day of it. This runs
	 * the whole way: which of the two kinds of run, telling it what
	 * today's board shows, saying what the run is for, choosing the
	 * chains, reading the sheet it lays out, sailing it, and recording
	 * it at the end.
	 * ============================================================== */
	'a-run': {
		n: 'Four', title: 'A Run', at: 'barter',
		blurb: 'Answer one island, say what the day is for, and sail the run the whole board lays out.',
		say: {
			open: 'Bartering is how most of what the yard wants actually arrives. This tab plans a whole day of it.',

			/* --- 1. the two kinds of run --- */
			kinds: 'A run is for one of two things, and it asks which before anything else.',
			mat: 'A material: the ladder up to one thing you are short of, counted against what is already aboard.',
			silver: 'Or silver: every chain today\'s board allows, and a run along the ones you tick. That is the one to follow here.',
			level: 'Tell it your barter level, because that is what every Parley figure after this is priced at.',

			/* --- 2. what today's board shows --- */
			board: 'Now the board. Every refresh, the whole sea shows one of forty layouts.',
			ask: 'It cannot know which. So it asks about a single island — the one whose offer tells the forty apart best.',
			game: 'The answer is on the game\'s own barter list, set from Normal to Level 1: find that island\'s row, and read across.',
			pick: 'Tap the same thing here.',
			again: 'One look usually names the layout. Where two of the forty still fit, it says so, and asks for one more.',
			follows: 'And the whole board follows from that one answer: every chain the day allows, and what each of them pays.',

			/* --- 3. what the run is for --- */
			orders: 'Next, what you want out of the day.',
			presets: 'Cash out today is the most silver at the wharf tonight. Build the stocks finishes every island and keeps a floor of each level back for tomorrow.',
			pace: 'Pace is the real choice. Fast and light, full but never slower than full speed, or full and loaded —',
			loaded: 'a quarter over the limit, sailing slower for it, and calling at a wharf only where the next island would not deal.',
			quests: 'Quests on the way: the dailies and weeklies you have already taken, handed in where the run passes their taker — or with a stop put in a short way off the route.',
			way: 'The way round: nearest islands first whatever chain they belong to, or each chain climbed to its top before the next.',
			where: 'Where you sail from, where your storage is, and how long you are willing to be out.',
			floors: 'Watch the row along the bottom as it does: that is what the preset keeps back at each level — never sold, never spent below it, so tomorrow\'s board has something to start from.',

			/* --- 4. the chains --- */
			chains: 'Then the chains on offer, and three runs already worked out for you:',
			three: 'the most silver, the most an hour, and the most a Parley unit. They are rarely the same run.',
			take: 'Take one of them as it stands,',
			tick: 'tick the chains you want yourself,',
			fill: 'or keep what is ticked and let it fill the rest around them.',
			dock: 'The bar along the foot keeps the running total: chains, silver net, hours, islands, wharf calls.',

			/* --- 5. laid out --- */
			lay: 'Lay it out, and every stop of it is written down.',
			stops: 'What you hand over at each island, and what comes back.',
			hold: 'The hold after every trade, against the limit — and where it says past the limit, that is you sailing slower for it.',
			heavy: 'Where it says too heavy to barter, the next island will not deal until you lighten first.',
			wharf: 'Which is what a wharf call is for: the surplus goes into storage, and the run carries on.',
			parley: 'And the Parley bar, falling toward whatever you have left of the day\'s million.',

			/* --- 6. sailing it --- */
			sail: 'If it all looks right, sail it. The run goes onto the chart as a checklist.',
			full: 'Full screen, when you would rather have the sea than the sheet.',
			leg: 'It follows you leg by leg, and every stop is a card with the trade on it.',
			done: 'Tick each one off as you make it. What an island actually paid re-counts everything after it.',

			/* --- 7. recording it --- */
			all: 'At the end — or all at once, for a run sailed faster than it can be filmed —',
			record: 'you record the trip.',
			lands: 'The silver goes to the purse, the goods left over into the Inventory, the quests handed in with their rewards.',
			undo: 'All of it as one change, and one Undo.',

			/* --- the ship under all of it --- */
			ship: 'And none of these figures are generic. The hold, the speed and every minute on that route are your ship:',
			setup: 'its hull, the four parts fitted, the crystal and the crew that is aboard.',
			close: 'One island answered, and the day is planned.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/a-run.webm`);
			await card(page, 'Four', 'A Run', { line: s.open });

			await tab(page, 'barter');
			await wait(1400);

			/* --- 1. the two kinds ------------------------------------- */
			await say(page, s.kinds);
			await click(page, '[data-act="barter-goal"][data-id="material"]', { after: 1200 });
			await say(page, s.mat);
			await click(page, '[data-act="barter-goal"][data-id="silver"]', { after: 1200 });
			await say(page, s.silver);
			await hush(page);
			await choose(page, '[data-act="barter-level"]', 'Master 5', { after: 900 });
			await say(page, s.level);
			await hush(page);

			/* --- 2. today's board ------------------------------------- */
			await say(page, s.board);
			await say(page, s.ask);
			await click(page, '[data-act="barter-board-ask"]', { after: 1100 });
			// The game's own window, held over the app while the picker it
			// belongs to is open behind it: the question and where the
			// answer is read from, in one beat.
			await still(page, 'tools/capture/shots/barter-window.webp', { line: s.game });
			await say(page, s.pick);
			await click(page, '.picker-row', { after: 1400 });

			// One island is usually enough to name the layout, but not
			// always: where two of the forty still fit, the tab keeps
			// asking. Which is the real flow, so the film waits it out
			// rather than being seeded into a board that settles first
			// time.
			const settled = () => onScreen(page, 'button.chain[data-act="barter-chain"]');
			for (let go = 0; go < 4 && !(await settled()); go++) {
				// The chip goes as soon as the board is named, and the
				// chains it names take a moment more to draw. Asked for
				// rather than assumed, or the loop reaches for a button
				// that answered its last question a frame ago.
				if (!(await onScreen(page, '[data-act="barter-board-ask"]'))) break;
				if (go === 0) await say(page, s.again);
				await click(page, '[data-act="barter-board-ask"]', { after: 1000 });
				await click(page, '.picker-row', { after: 1500 });
			}
			await waitFor(page, 'button.chain[data-act="barter-chain"]', { upTo: 30000, then: 700 });
			await say(page, s.follows);
			await hush(page);

			/* --- 3. what the run is for -------------------------------- */
			await say(page, s.orders);
			await click(page, '[data-act="barter-preset"][data-id="stock"]', { after: 1100 });
			await say(page, s.presets);
			// The preset is also the honest way to show the floors: it
			// fills all six boxes at once and empties them again. Typing
			// one in by hand does the same thing to the screen and, at a
			// level 1 floor of ten against an empty hold, leaves no run
			// worth sailing at all -- so the panel the next beat points
			// at would be empty.
			await say(page, s.floors);
			await click(page, '[data-act="barter-preset"][data-id="cash"]', { after: 1300 });
			await hush(page);

			await say(page, s.pace);
			await choose(page, '[data-act="barter-pace"]', 'full', { after: 900 });
			await say(page, s.loaded);
			await choose(page, '[data-act="barter-quests"]', 'yes', { after: 900 });
			await say(page, s.quests);
			await choose(page, '[data-act="barter-way"]', 'chain', { after: 900 });
			await say(page, s.way);
			await say(page, s.where);
			await hush(page);

			/* --- 4. the chains ---------------------------------------- */
			await say(page, s.chains);
			// The three proposals come back from a worker a beat after the
			// board is known; there is nothing to point at until they land.
			await waitFor(page, '[data-act="barter-propose"]', { upTo: 60000, then: 500 });
			await say(page, s.three);
			await say(page, s.take);
			await click(page, '[data-act="barter-propose"]', { after: 1600 });
			await say(page, s.tick);
			await click(page, 'button.chain:not(.on)[data-act="barter-chain"]', { after: 1400 });
			await say(page, s.fill);
			await click(page, '[data-act="barter-fill"]', { after: 2600 });
			await say(page, s.dock);
			await hush(page);

			/* --- 5. laid out ------------------------------------------ */
			await waitFor(page, '[data-act="barter-run-open"]', { upTo: 30000, then: 500 });
			await say(page, s.lay);
			await click(page, '[data-act="barter-run-open"]', { after: 1800 });
			await say(page, s.stops);
			await say(page, s.hold);
			await say(page, s.heavy);
			await say(page, s.wharf);
			await say(page, s.parley);
			await hush(page);

			/* --- 6. sailing it ---------------------------------------- */
			await say(page, s.sail);
			await click(page, '[data-act="barter-sail"]', { after: 2800 });
			await hush(page);
			// Sailing lands on the Map. Full screen is the chart without the
			// shell around it, and it is a toggle, so it is turned back off
			// before the run sheet is wanted again.
			if (await onScreen(page, '[data-act="map-full"]')) {
				await click(page, '[data-act="map-full"]', { after: 1800 });
				await say(page, s.full);
				await say(page, s.leg);
				await click(page, '[data-act="map-full"]', { after: 1600 });
			} else {
				await say(page, s.full);
				await say(page, s.leg);
			}
			await hush(page);
			await say(page, s.done);
			if (await onScreen(page, '[data-act="barter-stop-done"]')) {
				await click(page, '[data-act="barter-stop-done"]', { after: 1600 });
			}
			await hush(page);

			/* --- 7. recording it -------------------------------------- */
			await say(page, s.all);
			await click(page, '[data-act="barter-sail-all"]', { after: 1100 });
			await click(page, '[data-act="barter-sail-all-go"]', { after: 2200 });
			await say(page, s.record);
			await click(page, '[data-act="barter-record"]', { after: 2600 });
			await say(page, s.lands);
			await say(page, s.undo);
			await hush(page);

			/* --- the ship under all of it ------------------------------ */
			await tab(page, 'crew', { after: 1400 });
			await say(page, s.ship);
			await say(page, s.setup);
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Five -- the harbour
	 * ============================================================== */
	'the-harbour': {
		n: 'Five', title: 'The Harbour', at: 'community',
		blurb: 'Where a deployment has sign-in: sixteen boards, and nothing on them you did not offer.',
		staged: true,
		say: {
			open: 'Everything so far runs in your browser alone. This last part only exists where a deployment has sign-in.',
			fleet: 'And a note before it does: the sailors on these boards are invented. A machine shooting a film has no server with real players on it. The tab, the digest and the ranking are the app\'s own.',
			boards: 'Sixteen boards, built from the sailors who chose to stand on them.',
			door: 'A place on a board is a door. This is that sailor\'s card:',
			card: 'their fleet, their crew, and what they have done at sea.',
			look: 'And this is their ship, on your own Ship tab, fully fitted.',
			back: 'To look at, and not to keep. One press puts you back on yours.',
			numbers: 'The other half of the tab adds the whole fleet up.',
			offered: 'Nothing goes onto a board that was not offered.',
			digest: 'You see the exact digest before you agree to it, and leaving deletes it again.',
			close: 'Your data stays in your browser. You sign in to sync it between machines, or to take part in this. Neither is required to use anything else.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			// Before the seed, so /api/config is already saying `community`
			// when the tab strip is first drawn.
			await fakeCommunity(page);
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/the-harbour.webm`);
			await card(page, 'Five', 'The Harbour', { line: s.open });

			await tab(page, 'community');
			await wait(1000);
			await say(page, s.fleet);
			await say(page, s.boards);
			await hush(page);

			await click(page, '[data-act="community-entry"][data-board="ship"]', { after: 1900 });
			await say(page, s.door);
			await say(page, s.card);
			await hush(page);

			await click(page, '[data-act="community-look"]', { after: 2500 });
			await say(page, s.look);
			await say(page, s.back);
			await click(page, '[data-shared="back"]', { after: 1700 });
			await hush(page);

			await tab(page, 'community', { after: 1300 });
			await click(page, '[data-act="community-half"][data-id="numbers"]', { after: 1500 });
			await say(page, s.numbers);
			await hush(page);

			await say(page, s.offered);
			await say(page, s.digest);
			await say(page, s.close);
			await hush(page);
		}
	}
};

/* ------------------------------------------------------------------ *
 * shooting them
 * ------------------------------------------------------------------ */

const run = only.length ? only : Object.keys(CHAPTERS);
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
	try {
		await ch.shoot(ctx, ch.say);
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
