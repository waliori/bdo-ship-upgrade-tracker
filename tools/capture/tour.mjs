// One run through the whole thing, captioned.
//
// This is the clip to watch if you have never opened the app: queue a
// build, choose how to get there, record what you gathered, make
// something, take a swing at an enhancement, read the tree, and go
// shopping. Nothing is staged -- it drives the real app against a real
// inventory, so if a screen changes the clip stops being a lie the next
// time it is shot.
//
//   node tools/capture/tour.mjs <outdir> [phone]

import { open, seed, tab, click, moveTo, typeInto, say, hush, wait } from './drive.mjs';

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
	settings: {}
};

const ctx = await open(PHONE
	? { width: 390, height: 844, touch: true }
	: { width: 1280, height: 820 });
const { page, url } = ctx;

await seed(page, url, START);
const rec = await page.screencast({ path: `${OUT}/walkthrough${PHONE ? '-phone' : ''}.webm`, fps: 25 });

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

await say(page, 'Enhancing is separate, because attempts fail.');
await say(page, 'It shows the real odds, and the most it can ever cost.');
await hush(page);

await tab(page, 'tree');
await say(page, 'The Tree shows why a build needs what it needs.');
await click(page, '[data-act="tree-pick"]', { after: 700 });
await click(page, '[data-act="tree-target"][data-item="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 1000 });
await say(page, 'A Carrack part, over the Toro part it is made from.');
await hush(page);

await tab(page, 'get');
await say(page, 'And To Get is the shopping list, grouped by where to go.');
await say(page, 'Your data stays in your browser. Sign in only to sync it.');
await hush(page);

await wait(700);
await rec.stop();
await ctx.browser.close();
console.log(`→ walkthrough${PHONE ? '-phone' : ''}.webm`);
