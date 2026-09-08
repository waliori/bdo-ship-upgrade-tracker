// One run through the whole thing, captioned.
//
// This is the clip to watch if you have never opened the app. It walks
// the yard first -- queue a build, choose how to get there, record what
// you gathered, make something, step a mistake back, price a part both
// ways, read the tree, go shopping -- and then the sea: the day's free
// quests, the ship the day is sailed in, the chart, where the shopping
// list becomes a loop with distances on it and a blank stretch of water
// can be drawn on -- and a run on today's board, sailed on that chart.
//
// Nothing is staged. It drives the real app against a real inventory,
// so if a screen changes the clip stops being a lie the next time it is
// shot.
//
//   node tools/capture/tour.mjs <outdir> [phone]

import {
	open, seed, tab, click, clickIn, typeInto, drag, say, hush, wait,
	onScreen, headerBtn, waitFor
} from './drive.mjs';

const OUT = process.argv[2];
const PHONE = process.argv[3] === 'phone';

/* Part-way through a Carrack part: something covered, something short,
 * a part mid-enhancement, and coins in the purse. */
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
	// A Carrack, so the Ship beat has parts to fit and the run at the
	// end has a hold worth the name; the save starts on a Sailboat.
	profile: { crewShip: 'Carrack (Advance)' }
};

const ctx = await open(PHONE
	? { width: 390, height: 844, touch: true }
	: { width: 1280, height: 820 });
const { page, url } = ctx;

/* The Map's side panel is open on a wide screen and folded to a pill on
 * a narrow one, where it would be the whole screen. Every map beat needs
 * it out, so it is asked for rather than assumed. */
const openMapPanel = async () => {
	if (!(await onScreen(page, '.map-side'))) await click(page, '[data-act="map-panel"]', { after: 900 });
};

/* What the chart draws is a strip above the panel's tabs, out on a wide
 * screen and folded on a phone. */
const openLayers = async () => {
	if (!(await onScreen(page, '[data-act="map-pins"]'))) await click(page, '[data-act="map-layers"]', { after: 800 });
};

/* On a phone the panel covers two thirds of the chart, so the drawing
 * itself is done with it folded away -- the chosen tool survives -- and
 * it comes back for the buttons under it. Both are no-ops on a wide
 * screen, where there is room for the panel and the sea at once. */
const foldPanel = async () => {
	if (PHONE) await click(page, '[data-act="map-panel"]', { after: 800 });
};
const unfoldPanel = async () => {
	if (PHONE) await openMapPanel();
};

/* Where on the chart the Draw beat puts things. Bare points -- the sea
 * has no selectors on it -- as fractions of the map's box, chosen over
 * open water and clear of each other: a stroke begun on top of a stop
 * picks the stop up and carries it instead of drawing. */
const PLACES = PHONE
	? {
		stops: [[0.264, 0.296], [0.486, 0.417], [0.264, 0.591]],
		pen: { at: [0.625, 0.643], by: [80, -60] },
		word: [0.514, 0.191]
	}
	: {
		stops: [[0.362, 0.16], [0.50, 0.29], [0.435, 0.54]],
		pen: { at: [0.56, 0.66], by: [140, -70] },
		word: [0.40, 0.44]
	};

await seed(page, url, START);
const rec = await page.screencast({ path: `${OUT}/walkthrough${PHONE ? '-phone' : ''}.webm`, fps: 25 });

/* ---------------------------------------------------------------- *
 * the yard
 * ---------------------------------------------------------------- */

await say(page, 'One inventory. Every build draws from it.');
await say(page, 'Start by queueing something you want to build.');
await hush(page);

await tab(page, 'builds');
await click(page, '[data-act="add-build"]', { after: 700 });
await page.type('.picker-search', 'caravel', { delay: 80 });
await wait(700);
await click(page, '[data-pick="Epheria Caravel"]', { after: 900 });

// The Caravel is reachable two ways, so queueing one asks which.
await say(page, 'Some ships can be reached more than one way, so it asks.');
await say(page, 'It shows what each route costs. Neither is the right answer.');
await click(page, '.route:not(.on)', { after: 900 });
await hush(page);

await click(page, '[data-act="add-build"]', { after: 700 });
await page.type('.picker-search', "chiro's sail", { delay: 80 });
await wait(700);
await click(page, '[data-pick="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 900 });
await say(page, 'Order matters: when stock is short, the top build gets it.');
await hush(page);

await tab(page, 'plan');
await say(page, 'The Plan is everything the queue needs, in one list.');
await say(page, 'Red is missing, blue is still to make, green is covered.');
await hush(page);

await say(page, 'As you gather, type what you have into the box.');
await typeInto(page, '.own-input[data-item="Violent Wave Plywood"]', '300', { after: 900 });
await say(page, 'Every build re-plans around it at once.');
await hush(page);

await tab(page, 'workshop');
await say(page, 'Anything you have the materials for can be made here.');
await click(page, '.craft-card [data-times="field"]', { after: 1400 });
await say(page, 'Crafting moves real stock: ingredients out, product in.');
await hush(page);

await say(page, 'Slipped? Every change can step back, and forward again.');
await headerBtn(page, 'undo', { after: 1300 });
await headerBtn(page, 'redo', { after: 1300 });
await hush(page);

await say(page, 'Enhancing is separate, because attempts fail.');
await say(page, 'It shows the real odds, and the most it can ever cost.');
await hush(page);
// On a phone the tap on the craft card leaves its hover card up, over
// the bar at the thumb; Escape puts it away before the next tab press.
await page.keyboard.press('Escape');
await wait(400);

await tab(page, 'inventory');
// The grid fills in a beat after the tab lands under load.
await waitFor(page, '[data-act="select"][data-item="Violent Wave Plywood"]');
await click(page, '[data-act="select"][data-item="Violent Wave Plywood"]', { after: 900 });
await say(page, 'Open anything and every way of getting it is priced.');
await say(page, 'The shop price, or what making one costs once its');
await say(page, 'own ingredients are priced too, all the way down.');
await hush(page);
// On a phone the panel is a sheet over the screen; leaving it open would
// swallow the next tab press.
await page.keyboard.press('Escape');
await wait(600);

await tab(page, 'tree');
await say(page, 'The Tree shows why a build needs what it needs.');
await click(page, '[data-act="tree-pick"]', { after: 700 });
await click(page, '[data-act="tree-target"][data-item="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 1000 });
await say(page, 'A Carrack part, over the Toro part it is made from.');
await hush(page);

await tab(page, 'get');
await say(page, 'And To Get is the shopping list, grouped by where to go.');
await say(page, 'Each line costs the lot -- and what making it would cost instead.');
await hush(page);

/* ---------------------------------------------------------------- *
 * the sea
 * ---------------------------------------------------------------- */

await tab(page, 'quests');
await say(page, 'Quests is what the sea hands you for free.');
await say(page, 'The ones paying in something on your list are marked.');
// Only the quests that pay one fixed reward: a pick-one quest stops
// Finish to ask which, which is true to the app but not what this beat
// is about. A ticked row takes .selected, so the same selector picks
// the next one along on the second press, not the same one again.
const plain = '.quest:not(.done):not(.selected):has([data-act="quest-claim"]) .quest-check';
await click(page, plain, { after: 700 });
await click(page, plain, { after: 900 });
await say(page, 'Tick a few and Finish records them together.');
await click(page, '[data-act="quest-finish"]', { after: 1600 });
await say(page, 'The rewards land in your stock, as one undoable change.');
await say(page, 'The tick wears off at the reset by itself.');
await hush(page);

await tab(page, 'crew');
await say(page, 'A ship is a hull, four parts, a sea crystal and a crew.');
await say(page, 'Each slot takes the best you hold, or one you choose.');
await hush(page);
await say(page, 'Your Sailing Mastery counts toward speed, too.');
await typeInto(page, '[data-act="crew-mastery"]', '750', { after: 1200 });
await say(page, 'Keep a whole fit-out as a setup and switch between them.');
await hush(page);

await tab(page, 'map');
await openMapPanel();
await say(page, 'The Map is that shopping list drawn on the sea.');
await say(page, 'Every pin is a barterer holding something you are short of.');
await hush(page);

await click(page, '[data-act="map-mode"][data-id="route"]', { after: 1000 });
await say(page, 'Plot the loop and it draws one, bent round the land.');
await click(page, '[data-act="map-route-use"]', { after: 2400 });
await say(page, 'Every leg carries its distance and its minutes --');
await say(page, 'at the speed that ship of yours actually makes.');
await hush(page);

// One strip governs what the chart draws, on every tab. Turning the
// barterers off is both the demonstration and the clean sheet the next
// beat needs: three traced stops are invisible under 58 pins.
await openLayers();
await say(page, 'One strip says what the chart draws --');
await say(page, 'barterers, habitats, wharves, island names, your traces.');
await click(page, '[data-act="map-pins"]', { after: 1500 });
await hush(page);

await click(page, '[data-act="map-mode"][data-id="trace"]', { after: 1000 });
await say(page, 'Draw is for the routes a shopping list cannot express.');
await click(page, '[data-act="trace-tool"][data-id="point"]', { after: 700 });
// On a phone the panel is most of the screen, so it is folded to its
// pill for the drawing itself and brought back for what follows.
await foldPanel();
for (const [fx, fy] of PLACES.stops) await clickIn(page, '#map', fx, fy, { after: 750 });
await say(page, 'Click the sea for a numbered stop, in the order you sail it.');
await unfoldPanel();
await click(page, '[data-act="trace-tool"][data-id="pen"]', { after: 700 });
await foldPanel();
await drag(page, '#map', ...PLACES.pen.by, { from: PLACES.pen.at, after: 900 });
await say(page, 'Drag to draw a line, freehand.');
await unfoldPanel();
await click(page, '[data-act="trace-tool"][data-id="text"]', { after: 700 });
await foldPanel();
await clickIn(page, '#map', ...PLACES.word, { after: 700 });
await page.keyboard.type('the long way home', { delay: 90 });
await wait(1000);
await say(page, 'Or type a word straight onto the water.');
await say(page, 'It is all on the chart, so it pans and zooms with it.');
await unfoldPanel();
await say(page, 'Keep it by name, share a link, or send it to the game map.');
await hush(page);

await drag(page, '#map', -200, -90, { after: 500 });
await say(page, 'Drag to pan. Pinch or scroll to zoom.');
if (PHONE) {
	await click(page, '[data-act="map-zoom"][data-step="1"]', { after: 1100 });
} else {
	await drag(page, '#map', 160, 50, { after: 500 });
	await page.mouse.wheel({ deltaY: -120 });
	await wait(1100);
}
await hush(page);

/* ---------------------------------------------------------------- *
 * the run
 * ---------------------------------------------------------------- */

await tab(page, 'barter');
await say(page, 'Barter plans a run on today\'s board.');
await say(page, 'Every refresh, the whole sea shows one of forty layouts --');
await say(page, 'so look at one island in the game, and tap what it shows.');
await click(page, '[data-act="barter-board-ask"]', { after: 900 });
await page.type('.picker-in', 'raft', { delay: 90 });
await wait(600);
await click(page, '.picker-row', { after: 800 });
await say(page, 'The whole board follows: every chain the day allows, and what it pays.');
// The best run is ticked when the worker's search lands.
await waitFor(page, '[data-act="barter-run-open"]', { then: 600 });
await say(page, 'Tick the chains, and they are one run.');
await hush(page);
await click(page, '[data-act="barter-run-open"]', { after: 1500 });
await say(page, 'Every stop, what to buy before casting off, the quests on the way.');
await click(page, '[data-act="barter-sail"]', { after: 2600 });
await say(page, 'Sail it, and it is on the chart: a checklist, stop by stop.');
await say(page, 'Record the trip at the end, and the whole of it lands in the Inventory.');
await hush(page);

await say(page, 'Your data stays in your browser. Sign in only to sync it.');
await hush(page);

await wait(700);
await rec.stop();
await ctx.browser.close();
console.log(`→ walkthrough${PHONE ? '-phone' : ''}.webm`);
