// The README captures. Each scene records one thing a player actually
// does, at a pace you can follow, with the pointer visible.
//
//   node scenes.mjs <outdir> [sceneName ...]

import { open, seed, tab, click, clickIn, drag, moveTo, typeInto, wait, waitFor } from './drive.mjs';
import { midBuild, readyToCraft, recordLevel, fittedShip, emptyStart } from './states.mjs';

const OUT = process.argv[2];
const only = process.argv.slice(3);

const rec = async (page, name, body) => {
	const r = await page.screencast({ path: `${OUT}/${name}.webm`, fps: 25 });
	await body();
	await wait(900);            // a beat on the result, so the loop reads
	await r.stop();
	console.log(`  → ${name}.webm`);
};

const scenes = {
	/* Queue a build and watch the plan grow around it. */
	async 'queue-a-build'({ page, url }) {
		await seed(page, url, emptyStart);
		await tab(page, 'builds');
		await rec(page, 'queue-a-build', async () => {
			await wait(500);
			await click(page, '[data-act="add-build"]', { after: 900 });
			await page.type('.picker-search', "chiro's sail", { delay: 95 });
			await wait(900);
			await click(page, '[data-pick="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 1400 });
			await tab(page, 'plan');
			await wait(1200);
		});
	},

	/* The main loop: type in what you gathered, everything re-plans. */
	async 'record-what-you-own'({ page, url }) {
		await seed(page, url, {
			...midBuild,
			stock: { ...midBuild.stock, "Violent Sea Monster's Bone": 0, 'Starlight Hardener': 0 }
		});
		await rec(page, 'record-what-you-own', async () => {
			await wait(600);
			await typeInto(page, '.own-input[data-item="Violent Sea Monster\'s Bone"]', '150', { after: 1100 });
			await typeInto(page, '.own-input[data-item="Starlight Hardener"]', '150', { after: 1500 });
		});
	},

	/* Craft a named batch; the stock actually moves. */
	async craft({ page, url }) {
		await seed(page, url, readyToCraft);
		await tab(page, 'workshop');
		await rec(page, 'craft', async () => {
			await wait(600);
			await typeInto(page, '.craft-card .craft-n', '40', { after: 500 });
			await click(page, '.craft-card [data-times="field"]', { after: 1800 });
		});
	},

	/* Record a level you already reached in game -- no stones spent. */
	async 'record-a-level'({ page, url }) {
		await seed(page, url, recordLevel);
		await tab(page, 'inventory');
		await rec(page, 'record-a-level', async () => {
			await wait(400);
			await click(page, '[data-act="query"]', { after: 200 });
			await page.type('[data-act="query"]', 'toro plating', { delay: 95 });
			await wait(900);
			await click(page, '.tile', { after: 900 });
			await click(page, '.lvl:nth-child(8)', { after: 900 });
			await click(page, '[data-act="move-level"]', { after: 1500 });
		});
	},

	/* Two ways to the same ship, and the choice is yours. */
	async 'choose-a-route'({ page, url }) {
		await seed(page, url, emptyStart);
		await tab(page, 'builds');
		await rec(page, 'choose-a-route', async () => {
			await wait(500);
			await click(page, '[data-act="add-build"]', { after: 800 });
			await page.type('.picker-search', 'caravel', { delay: 90 });
			await wait(800);
			await click(page, '[data-pick="Epheria Caravel"]', { after: 1500 });
			await click(page, '.route:not(.on)', { after: 1600 });
		});
	},

	/* Why a build needs what it needs. */
	async 'the-tree'({ page, url }) {
		await seed(page, url, {
			...midBuild,
			targets: [{ id: 'c', item: 'Carrack (Advance)', qty: 1, active: true }]
		});
		await tab(page, 'tree');
		await rec(page, 'the-tree', async () => {
			// Opens on the useful view -- folded chains, whole spine
			// visible -- because the first frame is the thumbnail.
			await wait(900);
			await click(page, '[data-act="tree-all"]', { after: 2000 });
			await click(page, '[data-act="tree-none"]', { after: 1600 });
		});
	},

	/* Hover anything and see what goes into it. */
	/* What a thing really costs: the hover card, then both routes.
	 * Stays on one screen throughout -- a tab switch repaints every
	 * pixel, which doubles the GIF for nothing. */
	async 'what-it-costs'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'inventory');
		await wait(700);
		await rec(page, 'what-it-costs', async () => {
			await wait(500);
			await moveTo(page, '[data-act="select"][data-item="Delicately Polished Support"]', { settle: 2200 });
			await click(page, '[data-act="select"][data-item="Delicately Polished Support"]', { after: 2600 });
		});
	},

	/* The shopping list, drawn on the sea, then plotted as a loop. */
	async 'chart-the-loop'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(1600);
		await rec(page, 'chart-the-loop', async () => {
			await wait(600);
			await click(page, '[data-act="map-mode"][data-id="route"]', { after: 1000 });
			await click(page, '[data-act="map-route-use"]', { after: 2800 });
		});
	},

	/* A route the barter list cannot express: stops, a line, a word.
	 * Nothing scrolls and the tiles never move, so the only pixels that
	 * change are the ink -- which is what keeps this one small. */
	async 'draw-a-route'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(1600);
		await click(page, '[data-act="map-mode"][data-id="trace"]', { after: 900 });
		await click(page, '[data-act="trace-tool"][data-id="point"]', { after: 700 });
		await rec(page, 'draw-a-route', async () => {
			await wait(500);
			for (const [fx, fy] of [[0.24, 0.32], [0.42, 0.48], [0.28, 0.68]]) {
				await clickIn(page, '#map', fx, fy, { after: 650 });
			}
			await click(page, '[data-act="trace-tool"][data-id="pen"]', { after: 600 });
			await drag(page, '#map', 190, -120, { from: [0.28, 0.70], after: 900 });
		});
	},

	/* The day's free rewards, ticked and recorded together.
	 *
	 * Kept short on purpose. Ticking a row opens the bar above the list
	 * and pushes every row below it down, so each press repaints the
	 * whole frame -- which is why this one is given a narrower, slower
	 * encode in shoot.sh than the clips that only change a corner. */
	async 'claim-a-quest'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'quests');
		await wait(800);
		// Only the quests paying one fixed reward: a pick-one quest stops
		// Finish to ask which, which is true but not what this shows.
		const plain = '.quest:not(.done):not(.selected):has([data-act="quest-claim"]) .quest-check';
		await rec(page, 'claim-a-quest', async () => {
			await wait(300);
			await click(page, plain, { after: 350 });
			await click(page, plain, { after: 500 });
			await click(page, '[data-act="quest-finish"]', { after: 1300 });
		});
	},

	/* A hull is five slots and a crew, and its speed is a real number:
	 * type in the Sailing Mastery and the whole card moves.
	 *
	 * The pointer is kept off the slot cards -- hovering one opens the
	 * peek card over half the screen, and a full-width overlay appearing
	 * and going again costs more in the GIF than it explains. */
	async 'fit-a-ship'({ page, url }) {
		await seed(page, url, fittedShip);
		await tab(page, 'crew');
		await wait(900);
		await rec(page, 'fit-a-ship', async () => {
			await wait(500);
			await typeInto(page, '[data-act="crew-mastery"]', '750', { after: 1500 });
		});
	},

	/* A run on today's board: one island looked at, the board follows,
	 * the chains are ticked into a run, and Sail this run puts it on the
	 * chart as a checklist. The last beat flies to the Map, whose tiles
	 * repaint the whole frame, so shoot.sh gives this one the narrower,
	 * slower encode. */
	async 'plan-a-run'({ page, url }) {
		await seed(page, url, fittedShip);
		await tab(page, 'barter');
		await wait(1200);
		await rec(page, 'plan-a-run', async () => {
			await wait(500);
			await click(page, '[data-act="barter-board-ask"]', { after: 900 });
			await page.type('.picker-in', 'raft', { delay: 95 });
			await wait(700);
			await click(page, '.picker-row', { after: 800 });
			// The runs worth sailing come back from a worker; the best
			// one is ticked when it lands, and that is when there is a
			// run to lay out.
			await waitFor(page, '[data-act="barter-run-open"]', { then: 1400 });
			await click(page, '[data-act="barter-run-open"]', { after: 1800 });
			await click(page, '[data-act="barter-sail"]', { after: 2600 });
		});
	},

	async 'peek-a-recipe'({ page, url }) {
		await seed(page, url, midBuild);
		// Park the view on the crafting rows before the tape rolls -- a
		// scroll in a GIF changes every pixel and triples the file size.
		await page.evaluate(() => {
			document.querySelector('.row[data-peek*="Wave Residue"]')
				.scrollIntoView({ block: 'center' });
		});
		await wait(700);
		await rec(page, 'peek-a-recipe', async () => {
			await wait(500);
			await moveTo(page, '.row[data-peek*="Wave Residue"]', { settle: 1700 });
			await moveTo(page, '.row[data-peek*="Toro Sail"]', { settle: 1700 });
		});
	}
};

const stills = {
	async hero({ page, url }) {
		await page.setViewport({ width: 1280, height: 1140, deviceScaleFactor: 1 });
		await seed(page, url, midBuild);
		await page.evaluate(() => document.getElementById('__cur').remove());
		await page.screenshot({ path: `${OUT}/hero.png` });
		await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
	},
	async 'to-get'({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'get');
		await page.evaluate(() => document.getElementById('__cur').remove());
		await page.screenshot({ path: `${OUT}/to-get.png` });
	},
	async map({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'map');
		await wait(2200);
		await page.evaluate(() => document.getElementById('__cur').remove());
		await page.screenshot({ path: `${OUT}/map.png` });
	},
	async quests({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'quests');
		await wait(900);
		await page.evaluate(() => document.getElementById('__cur').remove());
		await page.screenshot({ path: `${OUT}/quests.png` });
	},
	async inventory({ page, url }) {
		await seed(page, url, midBuild);
		await tab(page, 'inventory');
		await page.evaluate(() => {
			document.getElementById('__cur').remove();
			document.querySelector('.tile').click();
		});
		await wait(600);
		await page.screenshot({ path: `${OUT}/inventory.png` });
	}
};

const all = { ...scenes, ...stills };
const run = only.length ? only : Object.keys(all);

const ctx = await open();
for (const name of run) {
	if (!all[name]) {
		console.log(`? unknown scene ${name}`);
		continue;
	}
	console.log(`recording ${name}`);
	await all[name](ctx);
}
await ctx.browser.close();
console.log('done');
