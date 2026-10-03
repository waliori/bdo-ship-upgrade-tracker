// The Workshop: the half of the yard where a build is made, priced and
// explained. It used to be the back half of the Yard chapter; given room
// of its own it crafts, enhances both ways an attempt can go, opens an
// item all the way down to what it costs, records a level reached in
// game and reads the Tree.

import {
	seed, tab, click, typeInto, say, hush, wait, onScreen, headerBtn,
	film, card, choose, doing, spotAll, track, park
} from '../drive.mjs';
import { QUEUED } from '../guide-kit.mjs';

/* Light a thing and follow it if it is there; otherwise just say it. */
async function pointAt(page, sel, line, opts = {}) {
	if (await onScreen(page, sel)) await track(page, sel, line, opts);
	else if (opts.act) await doing(page, line, opts.act);
	else await say(page, line);
}

/* The queued yard, with a part levelled in game and not yet recorded. */
const YARD = {
	...QUEUED,
	stock: { ...QUEUED.stock, 'Epheria Carrack: Toro Plating': 1 }
};

export default {
	id: 'the-workshop',
	// Overwritten from ORDER once the chapter is in it.
	n: 'Two',
	title: 'The Workshop',
	at: 'workshop',
	blurb: 'Craft and enhance, undo a mistake, price anything in the Inventory, record a level reached in game, and read the Tree.',
	say: {
		open: 'This is the Workshop. It makes what you have the materials for, and records the enhancement attempts you make in game.',

		/* --- crafting --- */
		ready: 'Ready to craft lists every recipe your stock covers, and how many of each you could make right now.',
		ings: 'The chips under each name are its ingredients: what you hold, over what one craft takes.',
		batch: 'Type a batch size and press Craft. Here, ten Violent Wave Plywood.',
		moves: 'Crafting moves real stock. The scales come out, and the plywood goes in.',
		all: 'All makes as many as the stock allows, in one press.',
		mass: 'Where the game has a Mass Process for a recipe, tick it, and the extra it yields is counted too.',
		undo: 'Crafted the wrong thing? Undo steps it back, and Redo puts it forward.',

		/* --- enhancing --- */
		enh: 'Enhancement is kept apart, because an attempt can fail.',
		row: 'Each row is a part you own that can go higher: the next level, what it adds to the ship, and the stones one attempt takes.',
		odds: 'The chance is your real one at the failstack you type, and the line under it says what finishing the part should cost, and the most it could.',
		fs: 'Type your failstack, and the chance moves with it.',
		fail: 'Then record what happened in game. Failed takes the stones; a blue or green part keeps its level.',
		succ: 'Succeeded takes the stones too, and moves the part up a level.',
		yellow: 'Yellow parts are different: a failure drops a level unless Cron Stones held it, so their rows ask which.',

		/* --- the inventory --- */
		inv: 'The Inventory is one tile per thing you hold, or still need.',
		filters: 'Filter it to what is needed, short, owned, or free to spend.',
		kinds: 'Or by kind: materials, ship parts, trade goods, and each barter level from one to seven.',
		find: 'Type a name to find one thing.',
		panel: 'Open its tile, and the panel says where it is held, which builds have reserved it, and which quests pay it.',
		count: 'The count can be set here too, a step at a time or typed straight in.',
		stash: 'A count can be kept per storage. Add one, and the total is your bags plus every storage you have noted it at.',
		ways: 'Further down, every way of getting it, priced.',
		deep: 'The Crow Coin Shop price, against what making it costs, with its own ingredients priced all the way down.',
		buy: 'Anything the Crow Coin Shop sells has a Buy. It asks how many, shows what is left of the purse, and records the goods and the coins as one change.',

		/* --- a level reached in game --- */
		level: 'Already levelled a part in game? Find it in the Inventory.',
		lvls: 'A part and all its levels are one tile. Pick the level you reached.',
		move: 'Then move one to it.',
		nostones: 'The tile now holds one at plus seven. No stones were spent: this records what already happened.',

		/* --- the tree --- */
		tree: 'The Tree shows why a build needs what it needs.',
		pick: 'Pick a build, and its recipe opens as a tree: the part, over what it is made from, over what those are made from.',
		fold: 'Fold any branch away, or expand them all at once.',
		held: 'Every line carries your count, and it can be typed in place, as on the Plan.',
		mapit: 'The map pin beside a sea material opens the Map on where it comes from.',
		close: 'That is the Workshop. Next, To Get: one plan for everything still missing.'
	},
	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await seed(page, url, YARD);
		await film(page, `${ctx.out}/the-workshop.webm`);
		await card(page, ch.n, ch.title, { line: s.open });

		/* --- crafting ---------------------------------------------- */
		await tab(page, 'workshop', { after: 800 });
		await spotAll(page, '.craft-card', s.ready, { pad: 6 });
		await track(page, '.craft-card .ings', s.ings, { pad: 6 });
		const ply = '.craft-card:has([data-item="Violent Wave Plywood"])';
		await track(page, ply, s.batch, {
			pad: 6,
			act: async () => {
				await typeInto(page, `${ply} [data-act="craft-n"]`, '10', { after: 300 });
				await click(page, `${ply} [data-act="craft"][data-times="field"]`, { after: 600 });
				await park(page);
			}
		});
		await pointAt(page, ply, s.moves, { pad: 6 });
		const glue = '.craft-card:has([data-item="Wave Residue Adhesive"])';
		// The whole shelf, not the card: a card made to the last unit
		// leaves the shelf, and a box round it would light the gap.
		await pointAt(page, '.panel:has(.craft-card)', s.all, {
			pad: 4,
			act: async () => {
				await click(page, `${glue} [data-act="craft"]:not([data-times="field"])`, { after: 600 });
				await park(page);
			}
		});
		await pointAt(page, '.craft-card .inline-check', s.mass, { pad: 6 });
		await doing(page, s.undo, async () => {
			await headerBtn(page, 'undo', { after: 800 });
			await headerBtn(page, 'redo', { after: 800 });
		});
		await hush(page);

		/* --- enhancing ---------------------------------------------- */
		const row = '.panel:has([data-act="enhance"])';
		await pointAt(page, row, s.enh, { pad: 4 });
		const one = '[data-act="enhance"][data-result="success"]';
		await pointAt(page, '.row[data-base]', s.row, { pad: 6 });
		await pointAt(page, '.row[data-base] .enh-odds', s.odds, { pad: 8 });
		await pointAt(page, '[data-act="failstacks"]', s.fs, {
			pad: 10,
			act: async () => {
				await typeInto(page, '[data-act="failstacks"]', '20', { after: 300 });
				await park(page);
			}
		});
		await pointAt(page, '[data-act="enhance"][data-result="fail"]', s.fail, {
			pad: 8,
			act: async () => {
				await click(page, '[data-act="enhance"][data-result="fail"]', { after: 500 });
				await park(page);
			}
		});
		await pointAt(page, one, s.succ, {
			pad: 8,
			act: async () => {
				await click(page, one, { after: 600 });
				await park(page);
			}
		});
		await say(page, s.yellow);
		await hush(page);

		/* --- the inventory ------------------------------------------ */
		await doing(page, s.inv, () => tab(page, 'inventory', { after: 700 }));
		await doing(page, s.filters, async () => {
			await click(page, '[data-act="inv-filter"][data-id="short"]', { after: 2200 });
			await click(page, '[data-act="inv-filter"][data-id="all"]', { after: 500 });
		});
		await doing(page, s.kinds, async () => {
			await click(page, '[data-act="inv-kind"][data-id="parts"]', { after: 2200 });
			await click(page, '[data-act="inv-kind"][data-id="all"]', { after: 500 });
		});
		await doing(page, s.find, async () => {
			await click(page, '[data-act="query"]', { after: 200 });
			await page.type('[data-act="query"]', 'wave plywood', { delay: 70 });
			await wait(700);
		});
		await doing(page, s.panel, async () => {
			await click(page, '[data-act="select"][data-item="Violent Wave Plywood"]', { after: 500 });
			await park(page);
		});
		await pointAt(page, 'aside [data-act="own-set"]', s.count, { pad: 40 });
		await pointAt(page, 'aside [data-act="stash-town"]', s.stash, {
			pad: 8,
			act: () => choose(page, 'aside [data-act="stash-town"]', 'Velia', { after: 800 })
		});
		const ways = 'aside .detail-block:has(.way-cost)';
		await doing(page, s.ways, () => page.evaluate(sel => {
			const b = document.querySelector(sel);
			if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' });
		}, ways));
		await pointAt(page, ways, s.deep, { pad: 4 });
		if (await onScreen(page, 'aside [data-act="coin-buy"]')) {
			// No spotlight: the dialog it opens is the subject, and a box
			// left on the button would dim it.
			await doing(page, s.buy, () => click(page, 'aside [data-act="coin-buy"]', { after: 1400 }));
			await page.keyboard.press('Escape');
			await wait(500);
		} else {
			await say(page, s.buy);
		}
		await page.keyboard.press('Escape');
		await wait(400);
		await hush(page);

		/* --- a level reached in game --------------------------------- */
		await doing(page, s.level, async () => {
			await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
			await typeInto(page, '[data-act="query"]', 'toro plating', { after: 600 });
			await click(page, '[data-act="select"][data-item="Epheria Carrack: Toro Plating"]', { after: 500 });
			await park(page);
		});
		await spotAll(page, 'aside .lvl', s.lvls, {
			pad: 6,
			act: () => click(page, 'aside [data-act="select"][data-item="+7 Epheria Carrack: Toro Plating"]', { after: 700 })
		});
		// No spotlight: the button goes as soon as it is pressed, and a box
		// left where it was lights whatever slides up into its place.
		await doing(page, s.move, () => click(page, '[data-act="move-level"]', { after: 1000 }));
		await spotAll(page, 'aside .lvl', s.nostones, { pad: 6 });
		await page.keyboard.press('Escape');
		await wait(400);
		await hush(page);

		/* --- the tree ------------------------------------------------ */
		await doing(page, s.tree, () => tab(page, 'tree', { after: 800 }));
		await doing(page, s.pick, async () => {
			await click(page, '[data-act="tree-pick"]', { after: 700 });
			if (await onScreen(page, '[data-act="tree-target"][data-item="Epheria Carrack: Advance (Chiro\'s Sail)"]')) {
				await click(page, '[data-act="tree-target"][data-item="Epheria Carrack: Advance (Chiro\'s Sail)"]', { after: 900 });
			} else {
				await page.keyboard.press('Escape');
			}
		});
		await doing(page, s.fold, async () => {
			await click(page, '[data-act="tree-none"]', { after: 900 });
			await click(page, '[data-act="tree-all"]', { after: 900 });
		});
		await pointAt(page, 'main [data-act="own-set"]', s.held, { pad: 10 });
		await pointAt(page, '[data-act="goto-map"][data-item="Violent Sea Monster\'s Scale"]', s.mapit, { pad: 10 });
		await hush(page);
		await doing(page, s.close, () => tab(page, 'get', { after: 800 }));
		await hush(page);
	}
};
