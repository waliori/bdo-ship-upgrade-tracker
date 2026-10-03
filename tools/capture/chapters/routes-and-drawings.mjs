// Routes and Drawings: the Map's Route and Draw tabs.
//
// They were two beats of the Map chapter, said over a plotted loop and
// three dots on the sea. Each is a tool of its own -- one plans a loop
// and times it at your own ship, the other draws what no list can say
// and carries it to a friend or into the game -- so they get a part of
// their own, shot full screen the way the chart is used.

import {
	seed, tab, click, clickIn, drag, say, hush, wait, onScreen,
	film, card, choose, doing, spotAll, track, park
} from '../drive.mjs';
import { QUEUED } from '../guide-kit.mjs';

/* Light a thing and follow it if it is there; otherwise just say it. */
async function pointAt(page, sel, line, opts = {}) {
	if (await onScreen(page, sel)) await track(page, sel, line, opts);
	else if (opts.act) await doing(page, line, opts.act);
	else await say(page, line);
}

/* Shut whatever dialog a press opened, and the hover card a pin left. */
async function shut(page) {
	if (await onScreen(page, '#dialog .dialog-box')) {
		await page.keyboard.press('Escape');
		await wait(500);
	}
}

export default {
	id: 'routes-and-drawings',
	// Overwritten from ORDER once the chapter is in it.
	n: 'Six',
	title: 'Routes and Drawings',
	at: 'map',
	blurb: 'A loop through what you are short of, timed at your own ship, saved, shared and put on the game\'s own map; and routes of your own drawn on the sea.',
	say: {
		open: 'The Map\'s Route and Draw tabs: a loop through what you are short of, timed at your own ship, and routes of your own, drawn straight onto the sea.',

		/* --- the loop --- */
		route: 'Route turns the list of islands into a sailing route.',
		plot: 'Plot the loop, and it joins every island you are short of, bent round the land rather than through it.',
		stats: 'The tiles total it up: the stops, the distance and the time at your ship\'s speed, the hold, the rations it eats, and the Parley it costs.',
		parley: 'Parley is counted at one trade a stop, or at every attempt the offer allows.',
		legs: 'Every stop is a row: what that island has for you, and how the hold stands after it.',
		start: 'Say where you sail from, and whether you come back, and the times follow.',
		step: 'Click a stop, and the chart flies to it.',
		drop: 'The cross takes a stop off, and a pin\'s card puts one back on.',
		setup: 'The route is timed at the ship you sail. Switch setup times it at another one you have kept.',
		reverse: 'Reverse sails it the other way round.',
		save: 'Save keeps it by name. Eight are kept, and none is dropped without asking.',
		link: 'Copy link puts the route in an address. Signed in, it is a short one.',
		file: 'Export and Import carry it as a small file instead.',

		/* --- into the game --- */
		game: 'And Put it on the game\'s map writes the stops into Black Desert\'s own world map.',
		as: 'As favourites, named and numbered, or as one of the map\'s three navigation loops.',
		paste: 'Copy the block, or download it, and paste it into gameVariable.xml at the character screen. Or let the app write it into the game\'s folder itself, keeping a copy of the old file.',

		/* --- draw --- */
		draw: 'Draw is for routes the list cannot describe.',
		tools: 'Four tools: add stops, draw, write, and shade an area.',
		stops: 'Add stops drops a numbered stop wherever you click, in the order you mean to sail. Legs bend round the land.',
		ink: 'Pick another ink, and the next stops start a second line, numbered on its own.',
		pen: 'Draw is a freehand line.',
		text: 'Write puts a note straight onto the water.',
		area: 'And shade an area marks a stretch of sea: click its corners, then the first one again.',
		undo: 'Undo takes back the last mark, whatever kind it was.',
		name: 'Give it a name and a note.',
		keep: 'Keep puts it on the shelf below.',
		share: 'Copy link carries the whole drawing, stops, lines, words and all, to anyone, with nothing of theirs touched.',
		togame: 'To the game writes its lines into the game\'s map too, a loop each.',
		shelf: 'The shelf keeps the newest; the eye lays one over the chart beside what you are drawing.',
		library: 'And Browse opens the whole library, with a search and every drawing as a card.',
		close: 'That is routing and drawing. A loop timed at your own ship, and a way to show anyone else the sea you mean.'
	},
	async shoot(ctx, s, ch) {
		const { page, url } = ctx;
		await seed(page, url, QUEUED);
		await film(page, `${ctx.out}/routes-and-drawings.webm`);
		await card(page, ch.n, ch.title, { line: s.open });

		await tab(page, 'map', { after: 1600 });
		await click(page, '.map-zoom [data-act="map-full"]', { after: 1400 });
		if (!(await onScreen(page, '.map-side'))) await click(page, '[data-act="map-panel"]', { after: 700 });
		// What the chart draws is the Map chapter's subject; folded, it
		// leaves the narrow panel to the route.
		if (await onScreen(page, '.map-chips')) await click(page, '[data-act="map-layers"]', { after: 600 });

		/* --- the loop ---------------------------------------------- */
		await doing(page, s.route, () => click(page, '[data-act="map-mode"][data-id="route"]', { after: 900 }));
		await doing(page, s.plot, () => click(page, '[data-act="map-route-use"]', { after: 2600 }));
		await pointAt(page, '.map-stats', s.stats, { pad: 4 });
		await pointAt(page, '[data-act="map-trades"]', s.parley, {
			pad: 8,
			act: async () => {
				await click(page, '[data-act="map-trades"][data-id="all"]', { after: 1100 });
				await click(page, '[data-act="map-trades"][data-id="one"]', { after: 700 });
			}
		});
		await track(page, '.map-stop-row', s.legs, { pad: 4 });
		await pointAt(page, '.map-startrow', s.start, {
			pad: 6,
			act: async () => {
				const v = await page.$eval('[data-act="map-start"] option:nth-child(2)', o => o.value).catch(() => null);
				if (v) await choose(page, '[data-act="map-start"]', v, { after: 1000 });
				await click(page, '[data-act="map-return"]', { after: 1200 });
			}
		});
		await doing(page, s.step, async () => {
			await click(page, '.map-stop-row:nth-of-type(3)', { after: 1600 });
			if (await onScreen(page, '[data-act="map-step-next"]')) {
				await click(page, '[data-act="map-step-next"]', { after: 1300 });
			}
		});
		await doing(page, s.drop, async () => {
			await click(page, '.map-stop-row [data-act="map-stop"]', { after: 1200 });
			await park(page, 0.6, 0.5);
		});
		await shut(page);
		if (await onScreen(page, '[data-act="map-setup-pick"]')) {
			await track(page, '[data-act="map-setup-pick"]', s.setup, { pad: 8 });
		} else {
			await say(page, s.setup);
		}
		await track(page, '[data-act="map-route-reverse"]', s.reverse, {
			pad: 8,
			act: () => click(page, '[data-act="map-route-reverse"]', { after: 1300 })
		});
		await doing(page, s.save, async () => {
			await click(page, '[data-act="map-route-save"]', { after: 900 });
			if (await onScreen(page, '#dialog input')) {
				await page.keyboard.type('Scales and bones', { delay: 60 });
				await wait(300);
				await page.keyboard.press('Enter');
				await wait(900);
			}
			await shut(page);
		});
		await track(page, '[data-act="map-route-link"]', s.link, {
			pad: 8,
			act: async () => {
				await click(page, '[data-act="map-route-link"]', { after: 1200 });
				await shut(page);
			}
		});
		await spotAll(page, '[data-act="map-route-export"], [data-act="map-route-import"]', s.file, { pad: 6 });
		await hush(page);

		/* --- into the game ------------------------------------------- */
		await doing(page, s.game, () => click(page, '[data-act="map-route-game"]', { after: 1400 }));
		await pointAt(page, '#dialog .map-game-loop', s.as, {
			pad: 6,
			act: async () => {
				await choose(page, '#dialog [data-act="map-game-as"]', '0', { after: 1100 });
				await choose(page, '#dialog [data-act="map-game-as"]', '', { after: 600 });
			}
		});
		await pointAt(page, '#dialog .map-game-btns', s.paste, { pad: 8 });
		await shut(page);
		await hush(page);

		/* --- draw -------------------------------------------------- */
		// The plotted loop and the barterers go off first: three traced
		// stops are invisible under fifty pins and a loop.
		if (await onScreen(page, '[data-act="map-route-clear"]')) await click(page, '[data-act="map-route-clear"]', { after: 700 });
		if (!(await onScreen(page, '[data-act="map-pins"]'))) await click(page, '[data-act="map-layers"]', { after: 600 });
		if (await onScreen(page, '[data-act="map-pins"].on')) await click(page, '[data-act="map-pins"]', { after: 600 });
		if (await onScreen(page, '[data-act="map-habitats"].on')) await click(page, '[data-act="map-habitats"]', { after: 600 });
		await click(page, '[data-act="map-layers"]', { after: 500 });
		await doing(page, s.draw, () => click(page, '[data-act="map-mode"][data-id="trace"]', { after: 900 }));
		await spotAll(page, '[data-act="trace-tool"]', s.tools, { pad: 6 });
		await doing(page, s.stops, async () => {
			await click(page, '[data-act="trace-tool"][data-id="point"]', { after: 500 });
			for (const [fx, fy] of [[0.50, 0.24], [0.62, 0.34], [0.58, 0.52]]) {
				await clickIn(page, '#map', fx, fy, { after: 420 });
			}
		});
		await doing(page, s.ink, async () => {
			await click(page, '[data-act="trace-ink"]:nth-child(3)', { after: 500 });
			for (const [fx, fy] of [[0.76, 0.28], [0.84, 0.44]]) {
				await clickIn(page, '#map', fx, fy, { after: 420 });
			}
		});
		await doing(page, s.pen, async () => {
			await click(page, '[data-act="trace-tool"][data-id="pen"]', { after: 500 });
			await drag(page, '#map', 240, -40, { from: [0.42, 0.82], steps: 30, after: 600 });
		});
		await doing(page, s.text, async () => {
			await click(page, '[data-act="trace-tool"][data-id="text"]', { after: 500 });
			await clickIn(page, '#map', 0.47, 0.72, { after: 500 });
			await page.keyboard.type('the long way home', { delay: 70 });
			await wait(300);
			await page.keyboard.press('Enter');
			await wait(400);
		});
		await doing(page, s.area, async () => {
			await click(page, '[data-act="trace-tool"][data-id="area"]', { after: 500 });
			// Open water, clear of the minimap in the corner: a click there
			// lands on the minimap and is no corner at all.
			for (const [fx, fy] of [[0.62, 0.52], [0.74, 0.52], [0.76, 0.66], [0.62, 0.66]]) {
				await clickIn(page, '#map', fx, fy, { after: 360 });
			}
			await clickIn(page, '#map', 0.62, 0.52, { after: 1400 });
			if (await onScreen(page, '[data-act="trace-area-close"]:not([disabled])')) {
				await click(page, '[data-act="trace-area-close"]', { after: 700 });
			}
		});
		await track(page, '[data-act="trace-undo"]', s.undo, {
			pad: 8,
			act: () => click(page, '[data-act="trace-undo"]', { after: 1000 })
		});
		await doing(page, s.name, async () => {
			if (await onScreen(page, '[data-act="trace-name"]')) {
				await click(page, '[data-act="trace-name"]', { after: 200 });
				await page.keyboard.type('Morning loop', { delay: 60 });
				await page.keyboard.press('Tab');
				await wait(300);
			}
			if (await onScreen(page, '[data-act="trace-notes"]')) {
				await click(page, '[data-act="trace-notes"]', { after: 200 });
				await page.keyboard.type('Two lines: out by the north, back by the south.', { delay: 35 });
				await page.keyboard.press('Tab');
				await wait(300);
			}
		});
		await track(page, '[data-act="trace-save"]', s.keep, {
			pad: 8,
			act: async () => {
				await click(page, '[data-act="trace-save"]', { after: 1000 });
				await shut(page);
			}
		});
		await track(page, '[data-act="trace-link"]', s.share, {
			pad: 8,
			act: async () => {
				await click(page, '[data-act="trace-link"]', { after: 1000 });
				await shut(page);
			}
		});
		await pointAt(page, '[data-act="map-game"][data-source="trace"]', s.togame, { pad: 8 });
		await pointAt(page, '.trace-eye, [data-act="trace-eye"]', s.shelf, { pad: 8 });
		await doing(page, s.library, async () => {
			if (await onScreen(page, '[data-act="trace-library"]')) await click(page, '[data-act="trace-library"]', { after: 1500 });
		});
		await shut(page);
		await hush(page);
		await say(page, s.close);
		await hush(page);
	}
};
