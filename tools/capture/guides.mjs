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
	onScreen, headerBtn, waitFor, film, cut, card, still, choose, doing, moveTo, clickText, spot
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
			open: 'This is the Yard. It works out what your builds need, and what you still have to find.',
			queue: 'Start by queueing something to build.',
			asks: 'Some ships can be built two ways, so it asks which.',
			costs: 'It shows what each route costs. Either is fine.',
			order: 'Queue a second one. Order matters: if stock runs short, the build at the top gets it first.',
			plan: 'The Plan is everything your queue needs, in one list.',
			colours: 'Red is missing. Blue you can make. Green you already have.',
			own: 'As you gather, type in what you have.',
			replan: 'Every build re-plans around it straight away.',
			trip: 'Or log a whole trip at once, instead of a box at a time.',
			shop: 'The Workshop makes anything you have the materials for.',
			craft: 'Crafting moves real stock. Ingredients out, the product in.',
			undo: 'Made a mistake? Undo steps it back, and Redo puts it forward.',
			enh: 'Enhancing is kept separate, because attempts can fail.',
			odds: 'It shows your real odds at your failstack, and the most the part can end up costing.',
			inv: 'The Inventory is one tile per thing you own, or still need.',
			ways: 'Open one, and every way of getting it is priced.',
			deep: 'What the shop charges, against what making it costs — including its own ingredients, all the way down.',
			level: 'Already levelled a part in game? Record it here.',
			nostones: 'Tell it the level you reached. It spends no stones to agree with you.',
			tree: 'The Tree shows why a build needs what it needs.',
			get: 'And To Get is your shopping list, grouped by where to go for it.',
			close: 'That is the Yard. What you want, what it takes, and what is left to find.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, withPlating);
			await film(page, `${OUT}/the-yard.webm`);
			await card(page, 'One', 'The Yard', { line: s.open });

			await doing(page, s.queue, async () => {
				await tab(page, 'builds', { after: 400 });
				await click(page, '[data-act="add-build"]', { after: 400 });
				await page.type('.picker-search', 'caravel', { delay: 70 });
				await wait(500);
				await click(page, '[data-pick="Epheria Caravel"]', { after: 600 });
			});
			await say(page, s.asks);
			await doing(page, s.costs, () => click(page, '.route:not(.on)', { after: 500 }));
			await doing(page, s.order, async () => {
				await click(page, '[data-act="add-build"]', { after: 400 });
				await page.type('.picker-search', "chiro's sail", { delay: 70 });
				await wait(500);
				await click(page, '[data-pick="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 600 });
			});
			await hush(page);

			await doing(page, s.plan, () => tab(page, 'plan', { after: 500 }));
			await say(page, s.colours);
			await doing(page, s.own, () =>
				typeInto(page, '.own-input[data-item="Violent Wave Plywood"]', '300', { after: 400 }));
			await say(page, s.replan);
			await doing(page, s.trip, () => headerBtn(page, 'trip-log', { after: 600 }));
			await page.keyboard.press('Escape');
			await wait(400);
			await hush(page);

			await doing(page, s.shop, () => tab(page, 'workshop', { after: 500 }));
			await doing(page, s.craft, () => click(page, '.craft-card [data-times="field"]', { after: 900 }));
			await doing(page, s.undo, async () => {
				await headerBtn(page, 'undo', { after: 700 });
				await headerBtn(page, 'redo', { after: 700 });
			});
			await hush(page);
			await say(page, s.enh);
			await say(page, s.odds);
			await hush(page);
			await page.keyboard.press('Escape');
			await wait(300);

			await doing(page, s.inv, () => tab(page, 'inventory', { after: 500 }));
			await waitFor(page, '[data-act="select"][data-item="Violent Wave Plywood"]');
			await doing(page, s.ways, () =>
				click(page, '[data-act="select"][data-item="Violent Wave Plywood"]', { after: 600 }));
			await say(page, s.deep);
			await hush(page);
			await page.keyboard.press('Escape');
			await wait(400);

			await doing(page, s.level, async () => {
				await click(page, '[data-act="query"]', { after: 200 });
				await page.type('[data-act="query"]', 'toro plating', { delay: 70 });
				await wait(600);
				await click(page, '.tile', { after: 500 });
			});
			await doing(page, s.nostones, async () => {
				await click(page, '.lvl:nth-child(8)', { after: 500 });
				await click(page, '[data-act="move-level"]', { after: 800 });
			});
			await hush(page);
			await page.keyboard.press('Escape');
			await wait(400);

			await doing(page, s.tree, async () => {
				await tab(page, 'tree', { after: 500 });
				await click(page, '[data-act="tree-pick"]', { after: 500 });
				await click(page, '[data-act="tree-target"][data-item="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 800 });
			});
			await hush(page);
			await doing(page, s.get, () => tab(page, 'get', { after: 600 }));
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Two -- quests
	 *
	 * Was the front half of a "Sea" chapter that also tried to cover the
	 * Map. The Map is its own chapter now, and this is what was left --
	 * which turned out to be a subject in its own right rather than a
	 * preamble to one.
	 * ============================================================== */
	'quests': {
		n: 'Two', title: 'Quests', at: 'quests',
		blurb: 'The free rewards the sea hands out, and how to record a batch of them at once.',
		say: {
			open: 'This is the Quests tab. It tracks the quests that pay in things you are already short of.',
			what: 'These are the sailing dailies and weeklies, all in one list.',
			marked: 'The ones paying something on your build list are marked, so you can see which are worth the detour.',
			filter: 'Filter them by what they pay, or by who gives them.',
			pays: 'Each row shows what it pays, and how much of it you still need.',
			some: 'Some quests let you pick your reward. Those ask you which when you finish.',
			tick: 'Tick off the ones you did in game.',
			finish: 'Then click Finish.',
			land: 'The rewards go straight into your stock, as one change.',
			undo: 'Got one wrong? Undo puts the whole batch back.',
			reset: 'The ticks clear themselves at the daily reset, so you start each day fresh.',
			clock: 'And these clocks tell you how long you have: dailies, weeklies, and the barter refresh.',
			fav: 'Star the ones you always do, and they sort to the top.',
			groups: 'Or save a set you run together, and tick the whole group at once.',
			map: 'Every quest knows where its giver stands, so a run can hand them in as it passes.',
			close: 'That is Quests. Free materials, tracked against what you are building.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/quests.webm`);
			await card(page, 'Two', 'Quests', { line: s.open });

			await tab(page, 'quests');
			await wait(800);
			await say(page, s.what);
			await spot(page, '.quest', s.marked);
			if (await onScreen(page, '[data-act="quest-filter"]')) {
				await spot(page, '[data-act="quest-filter"]', s.filter);
			} else {
				await say(page, s.filter);
			}
			await say(page, s.pays);
			await say(page, s.some);
			await hush(page);

			// Only the quests paying one fixed reward: a pick-one quest stops
			// Finish to ask which, which is true but not this beat.
			const plain = '.quest:not(.done):not(.selected):has([data-act="quest-claim"]) .quest-check';
			await doing(page, s.tick, async () => {
				await click(page, plain, { after: 400 });
				await click(page, plain, { after: 400 });
				await click(page, plain, { after: 500 });
			});
			await doing(page, s.finish, () => click(page, '[data-act="quest-finish"]', { after: 900 }));
			await say(page, s.land);
			await doing(page, s.undo, async () => {
				await headerBtn(page, 'undo', { after: 700 });
				await headerBtn(page, 'redo', { after: 700 });
			});
			await say(page, s.reset);
			await hush(page);

			if (await onScreen(page, '.map-clocks')) await spot(page, '.map-clocks', s.clock);
			else await say(page, s.clock);

			if (await onScreen(page, '[data-act="quest-fav"]')) {
				await spot(page, '[data-act="quest-fav"]', s.fav,
					{ act: () => click(page, '[data-act="quest-fav"]', { after: 500 }) });
			} else {
				await say(page, s.fav);
			}
			if (await onScreen(page, '[data-act="quest-group-save"]')) {
				await spot(page, '[data-act="quest-group-save"]', s.groups);
			} else {
				await say(page, s.groups);
			}
			await say(page, s.map);
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Three -- your ship
	 *
	 * The first cut of this showed a hull and a screenshot reader and
	 * called it a chapter. The tab is five slots, an appearance set, a
	 * roster with two ways of seating it, a sort, two hot presets, saved
	 * setups and a wall of figures -- so it covers all of them, and
	 * lights up whichever one it is talking about.
	 * ============================================================== */
	'your-ship': {
		n: 'Three', title: 'Your Ship', at: 'crew',
		blurb: 'Parts, crystal, appearance, crew and presets — and where every number on the ship comes from.',
		say: {
			open: 'This is the Ship tab. Everything the app knows about how fast you sail comes from this one screen.',
			hull: 'Start with the hull. Pick the ship you actually sail.',
			slots: 'A ship has four part slots: figurehead, plating, cannon and sail.',
			best: 'Each one fills itself with the best part you own.',
			change: 'Click Change to pick a different one.',
			picker: 'It lists every part that fits the slot, with what each does, and marks the ones you actually hold.',
			back: 'And "Best I own" puts it back to whatever you have.',
			crystal: 'The fifth slot is your sea crystal.',
			crystalpick: 'Pick the one you have socketed, and its bonus goes into the numbers.',
			skin: 'Below that is the appearance set.',
			skinwhy: 'Skins are cosmetic in most games. Here they are not: a full set adds real durability and rations, so tick the pieces you are wearing.',
			stats: 'And this panel at the top is the ship itself: its speed, its hold limit, and how many of the five slots are filled.',
			breakdown: 'The small print under each figure says where it came from — hull, parts, crystal, crew and mastery, added up.',
			mastery: 'Your Sailing Mastery goes in here, and those figures move with it.',
			crew: 'Now the crew. This roster starts empty.',
			shots: 'Typing eighteen sailors in, four growths each, is an evening you will not enjoy. So it reads them off your screenshots instead.',
			drop: 'Screenshot the Manage Sailors window in game, one sailor a shot, and drop them in. It reads them in your browser — nothing is uploaded.',
			take: 'Check the table against the game, then take the ones that are right.',
			hired: 'And there they are, hired, with their real levels and growths.',
			crewstats: 'And the row under the ship fills in. That is what the crew is adding, on top of the hull.',
			sort: 'Sort the list by whatever you are fitting for. Best all round, best for speed, and so on.',
			manual: 'To seat one by hand, click the sailor, then click the seat you want them in.',
			seats: 'Where they sit matters. A sail seat doubles their speed growth, and the wheel doubles turn and brake.',
			auto: 'Or let it arrange the whole crew for you. Click Auto assign.',
			goal: 'It asks what the boat is for, and shows what each answer would actually give you.',
			pick: 'Pick one, and it seats everybody.',
			presets: 'Two hot presets, for swapping crews quickly. Save the current one to a slot.',
			apply: 'And click it to put that crew straight back on.',
			setup: 'A setup is bigger: the whole fit-out, hull, parts, crystal and seating, under a name.',
			fleet: 'The fleet lists every setup you have kept, and every hull you own without one.',
			sailed: 'The one you are sailing is what the Map times its routes at.',
			link: 'And you can copy the whole thing as a link, if someone asks what you sail.',
			close: 'That is your ship. Get this screen right, and every distance and every minute in the app is yours.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/your-ship.webm`);
			await card(page, 'Three', 'Your Ship', { line: s.open });

			await tab(page, 'crew');
			await wait(900);

			/* --- hull and the four parts ------------------------------- */
			await spot(page, '[data-act="crew-ship-pick"], [data-act="crew-ship"]', s.hull);
			await spot(page, '.crew-grid, .slot-card', s.slots, { pad: 6 });
			await spot(page, '.slot-card:not(.crystal):not(.skin)', s.best);
			await spot(page, '[data-act="crew-fit-pick"]', s.change,
				{ act: () => click(page, '[data-act="crew-fit-pick"]', { after: 900 }) });
			await say(page, s.picker);
			await page.keyboard.press('Escape');
			await wait(500);
			if (await onScreen(page, '[data-act="crew-fit-auto"]')) await say(page, s.back);
			await hush(page);

			/* --- crystal ----------------------------------------------- */
			await spot(page, '.slot-card.crystal', s.crystal);
			await spot(page, '[data-act="crew-crystal-pick"]', s.crystalpick,
				{ act: () => click(page, '[data-act="crew-crystal-pick"]', { after: 900 }) });
			await page.keyboard.press('Escape');
			await wait(500);
			await hush(page);

			/* --- appearance set ---------------------------------------- */
			await spot(page, '.slot-card.skin', s.skin);
			await spot(page, '.slot-card.skin', s.skinwhy, {
				act: async () => {
					if (await onScreen(page, '[data-act="crew-skin-slot"]')) {
						await click(page, '[data-act="crew-skin-slot"]', { after: 500 });
					}
				}
			});
			await hush(page);

			/* --- where the numbers are --------------------------------- */
			// The ship's own totals, which are the panel at the top -- not
			// the row beneath it. That row is the crew's contribution, and
			// pointing at it while saying "speed, hold, fitted" was
			// pointing at the wrong thing; it gets its own beat below,
			// once there is a crew to make it non-zero.
			await spot(page, '.ship-card', s.stats, { pad: 6 });
			await spot(page, '.ship-card-facts', s.breakdown, { pad: 6 });
			await spot(page, '[data-act="crew-mastery"]', s.mastery,
				{ act: () => typeInto(page, '[data-act="crew-mastery"]', '750', { after: 400 }) });
			await hush(page);

			/* --- the crew: read it in, then arrange it ------------------ */
			// The reader comes first because the roster really is empty
			// until it runs: an earlier cut of this seated sailors that
			// did not exist yet, and died on the first click.
			await spot(page, '.sailor-list, [data-act="crew-hire"]', s.crew, { pad: 8 });
			await spot(page, '[data-act="crew-import"]', s.shots,
				{ act: () => click(page, '[data-act="crew-import"]', { after: 900 }) });
			await doing(page, s.drop, async () => {
				const input = await page.$('input[data-files]');
				await input.uploadFile(
					path.resolve('tools/capture/shots/sailor-1.webp'),
					path.resolve('tools/capture/shots/sailor-2.webp'),
					path.resolve('tools/capture/shots/sailor-3.webp'),
					path.resolve('tools/capture/shots/sailor-4.webp')
				);
			});
			// The first read fetches the engine -- about six megabytes --
			// and then does a pass of OCR per shot, so this is the one
			// beat in the series that genuinely takes its time.
			await waitFor(page, '.shot-table', { upTo: 180000, then: 700 });
			await doing(page, s.take, () => click(page, '[data-add]', { after: 1400 }));
			await say(page, s.hired);
			await hush(page);

			await spot(page, '[data-act="crew-sort"]', s.sort,
				{ act: () => choose(page, '[data-act="crew-sort"]', 'speed', { after: 500 }).catch(() => {}) });
			await doing(page, s.manual, async () => {
				await click(page, '[data-act="crew-select"]', { after: 600 });
				await click(page, '[data-act="crew-seat"]', { after: 700 });
			});
			await say(page, s.seats);
			await spot(page, '[data-act="crew-auto"]', s.auto,
				{ act: () => click(page, '[data-act="crew-auto"]', { after: 900 }) });
			await say(page, s.goal);
			await doing(page, s.pick, () => click(page, '[data-act="crew-auto-go"]', { after: 1200 }));
			await spot(page, '.crew-stats, .stats', s.crewstats, { pad: 6 });
			await hush(page);

			/* --- presets, setups, the fleet ---------------------------- */
			await spot(page, '.presets, [data-act="crew-preset-save"]', s.presets, {
				pad: 8,
				act: () => click(page, '[data-act="crew-preset-save"][data-p="p1"]', { after: 700 })
			});
			await spot(page, '[data-act="crew-preset-apply"][data-p="p1"]', s.apply,
				{ act: () => click(page, '[data-act="crew-preset-apply"][data-p="p1"]', { after: 700 }) });
			await spot(page, '[data-act="crew-setup-save"]', s.setup,
				{ act: () => click(page, '[data-act="crew-setup-save"]', { after: 800 }) });
			await page.keyboard.press('Escape');
			await wait(500);
			if (await onScreen(page, '[data-act="crew-fleet"]')) {
				await spot(page, '[data-act="crew-fleet"]', s.fleet,
					{ act: () => click(page, '[data-act="crew-fleet"]', { after: 1100 }) });
				await say(page, s.sailed);
				await page.keyboard.press('Escape');
				await wait(500);
			} else {
				await say(page, s.fleet);
				await say(page, s.sailed);
			}
			await hush(page);

			await spot(page, '[data-act="crew-link"]', s.link,
				{ act: () => click(page, '[data-act="crew-link"]', { after: 900 }) });
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Four -- the map
	 *
	 * Shot almost entirely full screen, because that is how the chart is
	 * actually used: the toolbar is explained on the page, the last
	 * button on it is full screen, and everything after that happens
	 * with the sea filling the frame.
	 * ============================================================== */
	'the-map': {
		n: 'Four', title: 'The Map', at: 'map',
		blurb: 'The chart, full screen: the toolbar, the layers, and all five of its tabs.',
		say: {
			open: 'This is the Map. It is the whole sea, with everything you need marked on it.',
			pins: 'Every pin is a barterer holding something you are short of.',
			showing: 'This says what it is marking. Everything you are short of, or one item you choose.',
			tools: 'These buttons across the top are the chart controls.',
			zoom: 'Zoom out, and zoom in. You can also just scroll on the sea.',
			fit: 'This one fits everything marked back into view, if you get lost.',
			mini: 'This toggles the minimap in the corner.',
			full: 'And this is full screen. That is where the chart is worth using, so let us go there.',
			now: 'Now the sea has the whole window.',
			refit: 'Hit fit again, now that the chart has the room. That pulls back until every mark is in view at once.',
			backin: 'Which is most of the sea, so zoom back in a couple of steps to where you actually work.',
			panel: 'The panel on the left is what drives it.',
			layers: 'Start with "On the chart". This controls what gets drawn.',
			chips: 'Barterers, habitats, wharves, guild wharves, island names, and your own drawings. Turn off what you do not need.',
			search: 'There is a search, for finding an island or a good by name.',
			tabs: 'And these five tabs are the tools. We will take them in order.',
			barter: 'Barter is the default. Every island that has something on your list, with what it trades.',
			row: 'Click a row and the chart flies to that island.',
			route: 'Route turns that list into a sailing route.',
			plot: 'Plot the loop, and it draws one, bent around the land rather than through it.',
			legs: 'Every leg gets a distance and a time, at the speed your ship actually sails.',
			save: 'Save the route, share it as a link, or send it to the game map as bookmarks.',
			draw: 'Draw is for routes the list cannot describe. It gives you three tools.',
			point: 'The pin drops a numbered stop, in the order you mean to sail.',
			pen: 'The pen draws a freehand line.',
			text: 'And the text tool types a note straight onto the water.',
			keep: 'Name it and keep it, and it joins your library. Traces share as links too.',
			grounds: 'Grounds is for hunting.',
			where: 'It lists every species: sea monsters, young ones, ships, bosses and the Cox Pirates.',
			monster: 'Click one, and every spawn point it has goes on the chart.',
			more: 'Tick as many as you like, and send the lot to the game map.',
			courses: 'Above them are the known sailing courses, each with a note.',
			today: 'Today is your checklist for this refresh.',
			tick: 'Every island you need, ticked off as you visit it, with the total at the top.',
			pan: 'Drag to pan, scroll to zoom. The drawings and pins move with the chart.',
			esc: 'Escape, or the cross, brings the page back.',
			close: 'That is the Map. Everything you are short of, where it is, and how long it takes to get there.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/the-map.webm`);
			await card(page, 'Four', 'The Map', { line: s.open });

			await doing(page, s.pins, () => tab(page, 'map', { after: 1600 }));
			await wait(900);
			if (!(await onScreen(page, '.map-side'))) await click(page, '[data-act="map-panel"]', { after: 700 });
			await spot(page, '[data-act="map-pick-open"]', s.showing);

			/* --- the toolbar, before we go full screen ------------------ */
			await spot(page, '.map-zoom', s.tools, { pad: 8 });
			await spot(page, '[data-act="map-zoom"][data-step="1"]', s.zoom, {
				act: async () => {
					await click(page, '[data-act="map-zoom"][data-step="1"]', { after: 500 });
					await click(page, '[data-act="map-zoom"][data-step="-1"]', { after: 500 });
				}
			});
			await spot(page, '[data-act="map-fit"]', s.fit,
				{ act: () => click(page, '[data-act="map-fit"]', { after: 900 }) });
			await spot(page, '[data-act="map-mini"]', s.mini,
				{ act: () => click(page, '[data-act="map-mini"]', { after: 700 }) });
			await spot(page, '[data-act="map-full"]', s.full,
				{ act: () => click(page, '[data-act="map-full"]', { after: 1500 }) });
			await hush(page);

			/* --- everything past here is full screen -------------------- */
			await say(page, s.now);
			// Full screen changes the chart's size, not its zoom, so the
			// marks sit in a corner of a much wider frame until it is
			// fitted again. Re-fitting is what a person does here, and it
			// is the first good look at the sea the film gets.
			await spot(page, '[data-act="map-fit"]', s.refit,
				{ act: () => click(page, '[data-act="map-fit"]', { after: 2200 }) });
			// Fit pulls back far enough to hold every mark, which on a
			// full board is the whole sea -- and further out than the
			// chart draws land at, so it is a dull frame to talk over.
			// Two steps back in is where a person actually works anyway.
			await doing(page, s.backin, async () => {
				await click(page, '[data-act="map-zoom"][data-step="1"]', { after: 700 });
				await click(page, '[data-act="map-zoom"][data-step="1"]', { after: 1600 });
			});
			if (!(await onScreen(page, '.map-side'))) await click(page, '[data-act="map-panel"]', { after: 700 });
			await say(page, s.panel);
			if (!(await onScreen(page, '[data-act="map-pins"]'))) {
				await click(page, '[data-act="map-layers"]', { after: 700 });
			}
			await spot(page, '.map-layers', s.layers, { pad: 6 });
			await spot(page, '.map-chips', s.chips, {
				pad: 6,
				act: async () => {
					await click(page, '[data-act="map-habitats"]', { after: 500 });
					await click(page, '[data-act="map-habitats"]', { after: 400 });
				}
			});
			if (await onScreen(page, '[data-act="map-search"]')) {
				await spot(page, '[data-act="map-search"]', s.search);
			} else {
				await say(page, s.search);
			}
			await spot(page, '.map-tab', s.tabs, { pad: 6 });
			await hush(page);

			/* --- tab 1: Barter ----------------------------------------- */
			await doing(page, s.barter, () => click(page, '[data-act="map-mode"][data-id="sail"]', { after: 900 }));
			if (await onScreen(page, '.map-row, .map-npc')) {
				await doing(page, s.row, () => click(page, '.map-row, .map-npc', { after: 1400 }));
			} else {
				await say(page, s.row);
			}
			// The card a pin opens stays up until it is dismissed, and an
			// undismissed one sat over the chart for three tabs after
			// this.
			if (await onScreen(page, '[data-act="map-tip-close"]')) {
				await click(page, '[data-act="map-tip-close"]', { after: 500 });
			}
			await hush(page);

			/* --- tab 2: Route ------------------------------------------ */
			await doing(page, s.route, () => click(page, '[data-act="map-mode"][data-id="route"]', { after: 900 }));
			await doing(page, s.plot, () => click(page, '[data-act="map-route-use"]', { after: 2200 }));
			await say(page, s.legs);
			if (await onScreen(page, '[data-act="map-route-save"]')) {
				await spot(page, '[data-act="map-route-save"]', s.save, { pad: 12 });
			} else {
				await say(page, s.save);
			}
			await hush(page);

			/* --- tab 3: Draw ------------------------------------------- */
			// The barterers go off first: three traced stops are invisible
			// under fifty-eight pins.
			await click(page, '[data-act="map-pins"]', { after: 700 });
			await doing(page, s.draw, () => click(page, '[data-act="map-mode"][data-id="trace"]', { after: 900 }));
			await doing(page, s.point, async () => {
				await click(page, '[data-act="trace-tool"][data-id="point"]', { after: 500 });
				for (const [fx, fy] of [[0.40, 0.24], [0.53, 0.36], [0.46, 0.56]]) {
					await clickIn(page, '#map', fx, fy, { after: 420 });
				}
			});
			await doing(page, s.pen, async () => {
				await click(page, '[data-act="trace-tool"][data-id="pen"]', { after: 500 });
				await drag(page, '#map', 150, -80, { from: [0.58, 0.64], after: 600 });
			});
			await doing(page, s.text, async () => {
				await click(page, '[data-act="trace-tool"][data-id="text"]', { after: 500 });
				await clickIn(page, '#map', 0.44, 0.44, { after: 500 });
				await page.keyboard.type('the long way home', { delay: 70 });
				await wait(500);
			});
			await say(page, s.keep);
			await hush(page);

			/* --- tab 4: Grounds ---------------------------------------- */
			await doing(page, s.grounds, () => click(page, '[data-act="map-mode"][data-id="hunt"]', { after: 1100 }));
			await say(page, s.where);
			// A ground with its spawn points charted: the disabled ones
			// are species BDOCodex has no points for, and pressing one
			// draws nothing at all.
			const ground = '[data-act="map-hunt"]:not([disabled])';
			if (await onScreen(page, ground)) {
				await doing(page, s.monster, () => click(page, ground, { after: 1600 }));
				// A second species, not the same one again: `ground` still
				// matches the one just ticked, and pressing it would take
				// it back off.
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

			/* --- tab 5: Today ------------------------------------------ */
			await doing(page, s.today, () => click(page, '[data-act="map-mode"][data-id="today"]', { after: 1100 }));
			await say(page, s.tick);
			await hush(page);

			/* --- the chart itself -------------------------------------- */
			await doing(page, s.pan, async () => {
				await drag(page, '#map', -170, -70, { after: 400 });
				await drag(page, '#map', 140, 40, { after: 400 });
			});
			await say(page, s.esc);
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Five -- a run
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
		n: 'Five', title: 'A Run', at: 'barter',
		blurb: 'Show it one island, and it plans the whole run: chains, route, checklist and the trip recorded at the end.',
		say: {
			open: 'This is the Barter tab. Show it one island, and it plans a whole run for you.',

			/* --- 1. what the run is for --- */
			kinds: 'First, pick what you are running for.',
			mat: 'A material climbs the ladder to one thing you are short of.',
			silver: 'Silver runs the chains on the board and sells at the end. That is the one we want.',
			level: 'Set your barter level here. It sets the Parley cost of every trade below.',

			/* --- 2. which board --- */
			board: 'Next, tell it what the board looks like.',
			forty: 'Every refresh, the sea uses one of forty layouts.',
			which: 'The app cannot know which one. So you show it a single island.',
			island: 'Click "another island", and pick the one you are looking at.',
			game: 'Now check that island in game. Open Barter Information, set the filter to Normal to Level 1, and find its row. Eveto Island is offering Essence of Liquor, for a Level 1 Cherry Tree Seed Pouch.',
			same: 'Pick that same trade here.',
			again: 'If two layouts still match, it asks you for one more island.',
			got: 'That names the layout. Every chain this refresh allows is now listed below.',

			/* --- 3. the orders --- */
			orders: 'Now tell it what you want out of the run.',
			stock: 'Build the stocks keeps goods back for the next refresh.',
			floors: 'These boxes are how much it keeps back at each level.',
			cash: 'Cash out sells everything for silver instead.',
			pace: 'Pace. Fast keeps you light and quick.',
			loaded: 'Full and loaded fills the hold past the limit. More goods, slower sailing.',
			quests: 'Quests on the way hands in dailies you have already taken, as you pass them.',
			way: 'The way round sets the route order: nearest island first, or one chain at a time.',
			where: 'And here: where you sail from, where your storage is, and a time limit if you want one.',

			/* --- 4. the chains --- */
			chains: 'Now the chains. It has already worked out three runs for you.',
			three: 'The most silver, the most per hour, and the most per Parley. They are rarely the same run.',
			take: 'Click one to use it.',
			tick: 'Or tick chains yourself.',
			fill: 'Fill the rest adds the best chains around the ones you picked.',
			dock: 'The bar at the bottom totals it up: chains, silver, hours, islands.',

			/* --- 5. the run sheet --- */
			lay: 'Click "Lay it out".',
			stops: 'Every stop is listed, in order. What you hand over, and what you get back.',
			hold: 'This bar is your hold after each trade.',
			over: 'Orange means you are over the limit. You still sail, just slower.',
			heavy: 'Red means too heavy to barter. You have to lighten first.',
			wharf: 'That is what a wharf stop is for. Drop the extra into storage, and carry on.',
			parley: 'And this bar is your Parley going down as you trade.',

			/* --- 6. sailing it --- */
			sail: 'Happy with it? Click "Sail this run".',
			chart: 'It goes onto the map as a checklist.',
			full: 'Full screen, if you want more sea and less panel.',
			leg: 'It follows you leg by leg, and every stop is a card with the trade on it.',
			done: 'Tick each stop as you make it. If an island pays a different amount, everything after it re-counts.',

			/* --- 7. recording it --- */
			all: 'Finished sailing? Tick them all off at once.',
			record: 'Then click "Record the trip".',
			lands: 'Silver goes to your purse, leftover goods to your inventory, and the quests are claimed.',
			undo: 'All as one change, so one undo puts it back.',

			/* --- the ship under it --- */
			ship: 'One last thing. The hold size, the speed and every time on that route come from your ship.',
			setup: 'Hull, the four parts, the crystal and the crew aboard. Change the ship, and the whole run re-times.',
			close: 'That is it. Show it one island, and it plans the rest.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/a-run.webm`);
			await card(page, 'Five', 'A Run', { line: s.open });

			await tab(page, 'barter');
			await wait(1200);

			/* --- 1. what the run is for -------------------------------- */
			await say(page, s.kinds);
			await doing(page, s.mat, () => click(page, '[data-act="barter-goal"][data-id="material"]', { after: 300 }));
			await doing(page, s.silver, () => click(page, '[data-act="barter-goal"][data-id="silver"]', { after: 300 }));
			await doing(page, s.level, () => choose(page, '[data-act="barter-level"]', 'Master 5', { after: 300 }));
			await hush(page);

			/* --- 2. which board ---------------------------------------- */
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

			/* --- 3. the orders ----------------------------------------- */
			await say(page, s.orders);
			await doing(page, s.stock, () => click(page, '[data-act="barter-preset"][data-id="stock"]', { after: 300 }));
			// The keep-back row sits below the fold on a 820px frame, so
			// "these boxes" was said over a screen that did not have them
			// on it. `spot` scrolls to it and lights it.
			await spot(page, '.run-floors', s.floors);
			await doing(page, s.cash, () => click(page, '[data-act="barter-preset"][data-id="cash"]', { after: 300 }));
			await say(page, s.pace);
			await doing(page, s.loaded, () => choose(page, '[data-act="barter-pace"]', 'full', { after: 300 }));
			await doing(page, s.quests, () => choose(page, '[data-act="barter-quests"]', 'yes', { after: 300 }));
			await doing(page, s.way, () => choose(page, '[data-act="barter-way"]', 'chain', { after: 300 }));
			await doing(page, s.where, () => moveTo(page, '[data-act="barter-hours"]', { settle: 300 }));
			await hush(page);

			/* --- 4. the chains ----------------------------------------- */
			await waitFor(page, '[data-act="barter-propose"]', { upTo: 60000, then: 300 });
			await say(page, s.chains);
			await say(page, s.three);
			await doing(page, s.take, () => click(page, '[data-act="barter-propose"]', { after: 700 }));
			await doing(page, s.tick, () => click(page, 'button.chain:not(.on)[data-act="barter-chain"]', { after: 700 }));
			await doing(page, s.fill, () => click(page, '[data-act="barter-fill"]', { after: 1800 }));
			await doing(page, s.dock, () => moveTo(page, '[data-act="barter-run-open"]', { settle: 300 }));
			await hush(page);

			/* --- 5. the run sheet -------------------------------------- */
			await waitFor(page, '[data-act="barter-run-open"]', { upTo: 30000, then: 300 });
			await doing(page, s.lay, () => click(page, '[data-act="barter-run-open"]', { after: 1100 }));
			await say(page, s.stops);
			// Each of these names one bar or one state among a hundred
			// rows. Pointed at where the sheet has an example, said
			// plainly where it does not.
			const point = async (sel, line) => {
				if (await onScreen(page, sel)) await spot(page, sel, line);
				else await say(page, line);
			};
			await point('.run-hold .run-bar:not(.parley)', s.hold);
			await point('.run-hold:has(b.amber)', s.over);
			await point('.run-hold:has(b.warn)', s.heavy);
			await point('.run-stop.wharf', s.wharf);
			await point('.run-parley', s.parley);
			await hush(page);

			/* --- 6. sailing it ----------------------------------------- */
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
			await hush(page);

			/* --- 7. recording it --------------------------------------- */
			await doing(page, s.all, async () => {
				await click(page, '[data-act="barter-sail-all"]', { after: 500 });
				await click(page, '[data-act="barter-sail-all-go"]', { after: 1200 });
			});
			await doing(page, s.record, () => click(page, '[data-act="barter-record"]', { after: 1600 }));
			await say(page, s.lands);
			await say(page, s.undo);
			await hush(page);

			/* --- the ship under it ------------------------------------- */
			await doing(page, s.ship, () => tab(page, 'crew', { after: 800 }));
			await say(page, s.setup);
			await say(page, s.close);
			await hush(page);
		}
	},

	/* ============================================================== *
	 * Six -- the harbour
	 *
	 * The one chapter that cannot be shot honestly: a capture machine
	 * has no deployment with players on it, so fleet.mjs invents four
	 * and answers the community API with them. The tab, the digest and
	 * the ranking are the app's own, and the film says so in its second
	 * line rather than in a caption nobody reads.
	 * ============================================================== */
	'the-harbour': {
		n: 'Six', title: 'The Harbour', at: 'community',
		blurb: 'Sixteen boards, what a place on one opens, and exactly what is and is not shared.',
		staged: true,
		say: {
			open: 'Everything so far runs in your browser alone. This last part is the one that needs sign-in.',
			fleet: 'One note first: the sailors on these boards are invented. A machine recording this has no server with real players on it. The tab, the digest and the ranking are the app\'s own.',
			boards: 'Sixteen boards, built from the players who chose to join them.',
			sections: 'They come in five sections: the sea, the runs, quests and hunts, the yard, and charts and hold.',
			how: 'The question mark on a board tells you exactly how that one is counted.',
			yours: 'Your own places sit at the top, so you can see where you stand without hunting for yourself.',
			find: 'And there is a search, if you are after one sailor by name.',
			door: 'Click any place on a board to open that player\'s card.',
			card: 'Their fleet, their crew, their places, and what they have done at sea.',
			look: 'Click Look, and their ship loads onto your own Ship tab, fully fitted.',
			back: 'To look at, not to keep. One click puts yours back.',
			numbers: 'The other half of the tab adds the whole fleet up.',
			cats: 'Which hulls people sail, which parts they fit, which crystals, which quests they run.',
			sort: 'Search it for anything, and sort by most-first or A to Z.',
			useful: 'It is the closest thing to an answer when you are wondering what everyone else fits.',
			offered: 'Nothing goes onto a board that you did not offer.',
			digest: 'You see the exact digest before you agree to it — the numbers, and nothing else.',
			leave: 'And leaving takes it back off again.',
			close: 'Your data stays in your browser. Sign in to sync it between machines, or to join in. Neither is required for anything else in the app.'
		},
		async shoot(ctx, s) {
			const { page, url } = ctx;
			// Before the seed, so /api/config is already saying `community`
			// when the tab strip is first drawn.
			await fakeCommunity(page);
			await seed(page, url, QUEUED);
			await film(page, `${OUT}/the-harbour.webm`);
			await card(page, 'Six', 'The Harbour', { line: s.open });

			await doing(page, s.fleet, () => tab(page, 'community', { after: 900 }));
			await say(page, s.boards);

			/* --- finding your way round the boards --------------------- */
			const point = async (sel, line, opts = {}) => {
				if (await onScreen(page, sel)) await spot(page, sel, line, opts);
				else await say(page, line);
			};
			await point('.comm-cats', s.sections, { pad: 6 });
			await point('[data-act="community-how"]', s.how, { pad: 12 });
			await point('.comm-you', s.yours, { pad: 6 });
			await point('[data-act="community-find"]', s.find, { pad: 10 });
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
			await point('.comm-cats', s.cats, { pad: 6 });
			await point('.comm-numq', s.sort, { pad: 10 });
			await say(page, s.useful);
			await hush(page);

			/* --- what is and is not shared ----------------------------- */
			await point('[data-act="community-join"]', s.offered, { pad: 10 });
			await say(page, s.digest);
			await point('[data-act="community-leave"]', s.leave, { pad: 10 });
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
