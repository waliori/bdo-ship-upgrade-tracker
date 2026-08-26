// The README captures. Each scene records one thing a player actually
// does, at a pace you can follow, with the pointer visible.
//
//   node scenes.mjs <outdir> [sceneName ...]

import { open, seed, tab, click, moveTo, typeInto, wait } from './drive.mjs';
import { midBuild, readyToCraft, recordLevel, emptyStart } from './states.mjs';

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
