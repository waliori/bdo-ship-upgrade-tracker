// Guided tour, built on Driver.js.
//
// The tour walks every section in the order someone would actually use
// them: the yard first -- see the plan, queue a build, record what you
// own, craft, go shopping -- then the sea, where the day is spent: the
// quests, the ship, the chart, and the run planned on today's board --
// and the harbour, where there is one. Each step switches tab by
// clicking the real tab button, so there is no second copy of the
// navigation logic to keep in sync, and it works the same on a phone,
// where that button is in the bar at the thumb or behind "Menu".

import * as store from './state.js';
import { isPhone } from './viewport.js';
import { feature } from './sync.js';
import { T } from './i18n.js';

const DONE_KEY = 'bdo_ship_upgrade-tour_completed';

/** True when the browser has asked for less movement. */
const stillness = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
	&& window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * A worked-through example to talk over: a Carrack part part-way built,
 * with something craftable, something short, and a part mid-enhancement.
 * It is never saved -- the real data is captured first and put back when
 * the tour ends.
 */
const DEMO = JSON.stringify({
	stock: {
		'Violent Wave Plywood': 120,
		"Violent Sea Monster's Scale": 60,
		"Saltwater Crocodile's Scale": 55,
		'Tidal Black Stone': 300,
		'+4 Epheria Carrack: Toro Sail': 1,
		'Starlight Hardener': 80,
		"Blueprint: Chiro's Sail": 6,
		'Moon Vein Flax Fabric': 90,
		'Epheria Carrack: Toro Cannon': 1,
		'Crow Coin': 3000,
		Silver: 42000000
	},
	targets: [
		{ id: 'demo-1', item: "Epheria Carrack: Valor (Chiro's Sail)", qty: 1, active: true },
		{ id: 'demo-2', item: "Epheria Carrack: Valor (Chiro's Cannon)", qty: 1, active: true }
	],
	strategy: {},
	// The sailor's own numbers belong to a worked example as much as the
	// stock does. Left unset the bar reads "0 barters · no level" and asks
	// to be filled in -- which is the right thing for a new save and the
	// wrong thing to walk somebody past while saying that the count
	// decides which islands will deal with you at all. The hull is the
	// one the queued parts are for, so the Ship step is about the boat
	// the example is building rather than the sloop a save starts on.
	profile: {
		barterCount: 4205,
		level: 'Master 5',
		sailingMastery: 750,
		crewShip: 'Carrack (Valor)'
	}
});

/** Click a tab and give the render a moment to land. */
function goToTab(id) {
	const btn = document.querySelector(`[data-act="view"][data-id="${id}"]`);
	if (btn) btn.click();
}

/**
 * The Map, with its side panel out and a given tab up.
 *
 * The panel is open on a wide screen and folded to a pill on a narrow
 * one, where it would be the whole screen -- so it is asked for rather
 * than assumed, and a step can point at a tab that is really there.
 */
function goToMap(mode) {
	goToTab('map');
	if (!document.querySelector('.map-side')) {
		const pill = document.querySelector('[data-act="map-panel"]');
		if (pill) pill.click();
	}
	if (!mode) return;
	const btn = document.querySelector(`[data-act="map-mode"][data-id="${mode}"]`);
	if (btn) btn.click();
}

class GuidedTour {
	constructor() {
		this.driver = null;
		this.running = false;
		// The in-flight fetch of Driver.js, so two clicks share one.
		this.loading = null;
		// Set while the tour is up: the store subscription that keeps the
		// highlight on its element across a repaint, and its debounce.
		this.stopWatching = null;
		this.restage = null;
	}

	resolveDriver() {
		if (typeof window.driver === 'function') return window.driver;
		if (window.driver && typeof window.driver.js?.driver === 'function') return window.driver.js.driver;
		if (window.driver && typeof window.driver.driver === 'function') return window.driver.driver;
		return null;
	}

	/**
	 * Fetch the library and its stylesheet, once, the first time a tour
	 * is asked for.
	 *
	 * It used to be a plain <script defer> in the page, which meant every
	 * visit paid for 25 KB of tour library whether or not anyone toured.
	 * The tag is gone; this puts it back at the moment it is needed. The
	 * promise is kept so a second Tour click while the first is still in
	 * flight waits on the same request rather than starting another.
	 */
	loadDriver() {
		if (this.resolveDriver()) return Promise.resolve(true);
		if (this.loading) return this.loading;
		this.loading = new Promise(resolve => {
			if (!document.querySelector('link[data-driver-css]')) {
				const css = document.createElement('link');
				css.rel = 'stylesheet';
				css.href = 'css/driver.css';
				css.dataset.driverCss = '';
				document.head.appendChild(css);
			}
			const tag = document.createElement('script');
			tag.src = 'js/driver.iife.js';
			// Either way the caller is told: startTour() says so out loud
			// rather than appearing to do nothing.
			tag.onload = () => resolve(!!this.resolveDriver());
			tag.onerror = () => { this.loading = null; resolve(false); };
			document.head.appendChild(tag);
		});
		return this.loading;
	}

	create(steps) {
		const driverFn = this.resolveDriver();
		if (!driverFn) return null;

		// Driver.js resolves a step's element the moment it moves to it, so
		// the tab has to change *before* the move, not from inside the
		// step's own highlight hook.
		//
		// And a tab change repaints the screen twice -- the render the
		// click causes, and one more a frame behind it. Moving in
		// between staged an element that was thrown away with the nodes
		// it stood on a moment later, which is why half the steps used
		// to land as a popover in the middle of the page instead of
		// pointing at anything. So the move waits for the second paint,
		// and a refresh afterwards catches anything later still.
		const hop = delta => {
			const at = this.driver ? this.driver.getActiveIndex() : 0;
			const next = steps[at + delta];
			if (next && next.before) next.before();
			setTimeout(() => {
				// Skip may have landed inside that wait.
				if (!this.running || !this.driver) return;
				if (delta > 0) this.driver.moveNext();
				else this.driver.movePrevious();
				// Twice: once for the repaint a tab change causes, and again
				// for anything slower behind it -- a screen that waits on
				// the chart's tiles, say. Refresh only re-measures where
				// the popover should sit, so a second one is invisible.
				for (const at of [140, 420]) {
					setTimeout(() => {
						if (this.running && this.driver) this.driver.refresh();
					}, at);
				}
			}, 90);
		};

		return driverFn({
			onNextClick: () => hop(1),
			onPrevClick: () => hop(-1),
			showProgress: true,
			showButtons: ['next', 'previous', 'close'],
			// Dressed in the app's own tokens (tracker-recent.css).
			popoverClass: 'sail-tour',
			overlayOpacity: 0.55,
			overlayColor: '#03080f',
			stagePadding: 8,
			stageRadius: 12,
			allowClose: true,
			// A browser that asked for less movement gets the stage cut,
			// not slid, and the page jumped to each step rather than
			// scrolled there.
			animate: !stillness(),
			smoothScroll: !stillness(),
			doneBtnText: T('Finish'),
			closeBtnText: T('Skip'),
			nextBtnText: T('Next'),
			prevBtnText: T('Back'),
			onDestroyed: () => {
				this.running = false;
				this.driver = null;
				clearTimeout(this.restage);
				if (this.stopWatching) this.stopWatching();
				this.stopWatching = null;
				this.restoreRealData();
				try {
					localStorage.setItem(DONE_KEY, 'true');
				} catch {
					/* ignore */
				}
			}
		});
	}

	steps() {
		const phone = isPhone();
		// The Community tab is only there where the server has accounts
		// to stand on its boards; the tour says nothing about it otherwise.
		const harbour = feature('community');
		// On a phone each step is a sheet at the thumb; a step about the
		// thumb bar itself puts its sheet at the top.
		const atTop = phone ? 'sail-tour tour-top' : 'sail-tour';
		// A dozen stops, a few lines each. It was twenty-three, some of
		// them a hundred and twenty words, and most people closed it at
		// "1 of 23"; what it left out is one press away on each screen.
		const all = [
			{
				popover: {
					title: T('⚓ Parts, quests, routes and the map'),
					description: T('One record of what you own, and every build draws from it — the same 100 planks are never promised twice.<br><br><b>The next screens use an example; your own data comes back when the tour ends.</b>'),
					align: 'center'
				},
				before: () => goToTab('plan')
			},
			{
				// A phone has the bar at the thumb instead of the dock above.
				element: phone ? '#tabbar' : '#tabs',
				popover: {
					title: T('Every section, in one dock'),
					description: T('The <b>yard</b> on the left plans and makes a build; the <b>sea</b> on the right is where the day is spent.')
						+ (harbour ? ' ' + T('<b>Community</b> is the harbour.') : '')
						+ ' ' + (phone ? T('Four sit at your thumb; <b>Menu</b> opens the rest.') : T('The digits <b>1</b>–<b>9</b> and <b>0</b> switch between them.')),
					side: phone ? 'top' : 'bottom',
					popoverClass: atTop
				}
			},
			{
				element: '.row',
				popover: {
					title: T('Reading a material, and recording it'),
					description: T('<span style="color:#4ec9ae">Green</span> is covered from stock, <span style="color:#3a89c9">blue</span> still to craft, <span style="color:#e87a6d">red</span> missing. The <b>− number +</b> box is how many you own: change it as you gather and every build updates.'),
					side: 'top'
				},
				before: () => goToTab('plan')
			},
			{
				element: '#pouch',
				popover: {
					title: T('What you are carrying'),
					description: T('Coins, silver and stones, set once and read by every screen — each says whether it covers your builds. <b>The sailor</b> beside them holds your barter count, which decides the islands that will deal with you.'),
					side: 'bottom'
				},
				before: () => goToTab('plan')
			},
			{
				element: '.queue-head',
				popover: {
					title: T('Your build queue'),
					description: T('Add a ship, part or material. When stock is short the build nearest the top gets it first; ▲▼ re-order, ⏸ parks one.'),
					side: 'bottom'
				},
				before: () => goToTab('builds')
			},
			{
				element: '.inv-grid',
				popover: {
					title: T('What you actually own'),
					description: T('Set quantities here, or read a storage off a screenshot. A tile\'s bar shows how much a build has spoken for; pick one to see who and why.'),
					side: 'top'
				},
				before: () => goToTab('inventory')
			},
			{
				element: '.craft-grid',
				popover: {
					title: T('The workshop'),
					description: T('Every recipe you have the materials for, crafted in one press — and below, every part that can go higher, with its stones, its <b>failstack</b> and Succeeded / Failed.'),
					side: 'top'
				},
				before: () => goToTab('workshop')
			},
			{
				// Scoped to the screen: the pouch carries a `.summary` of its own.
				element: '#screen .summary',
				popover: {
					title: T('The shopping list'),
					description: T('Everything still missing, biggest first. <b>The way to get it</b> gives each thing one way — quests, the Crow Coin Shop, barter, the Market — and the days it takes.'),
					side: 'bottom'
				},
				before: () => goToTab('get')
			},
			{
				element: '.quest-clocks',
				popover: {
					title: T('What the sea hands out free'),
					description: T('Every quest that pays in a ship material, the ones your plan wants marked. Tick several and <b>Finish</b> records them as one change; the ticks wear off at the reset.'),
					side: 'bottom'
				},
				before: () => goToTab('quests')
			},
			{
				element: '.ship-card-main',
				popover: {
					title: T('Your ship'),
					description: T('The hull in the game\'s own numbers, its four parts and crystal, and the crew — read off a screenshot of Manage Sailors and seated for what the boat is for.'),
					side: 'bottom'
				},
				before: () => goToTab('crew')
			},
			{
				element: '.map-tabs',
				popover: {
					title: T('The list, drawn on the sea'),
					description: T('<b>Who has it</b> pins the barterers holding what you are short of; <b>Route</b> plots the loop at your ship\'s real speed; <b>Draw</b> sketches on the water; <b>Hunt</b> shows the grounds; <b>Today</b> ticks off where you have been.'),
					side: phone ? 'top' : 'left'
				},
				before: () => goToMap('sail')
			},
			{
				// The board's own panel: the strip once a board is known, the ask before.
				element: '.board-strip, .board-ask',
				popover: {
					title: T('Today\'s board'),
					description: T('Every refresh the whole sea shows one of forty fixed layouts, so tell it what <i>one</i> island is showing — tap the offer or read a screenshot — and the board follows. Then pick what the day is for: <b>Silver</b>, <b>A stock</b>, <b>Crow Coins</b>, or <b>A material</b>, which reads the ship-material list on its own.'),
					side: 'bottom'
				},
				before: () => goToTab('barter')
			},
			{
				element: '.steps',
				popover: {
					title: T('A run in four steps'),
					description: T('<b>Plan</b> where the day ends and tick the chains. <b>Load</b> packs the hold. <b>Sail</b> goes one stop at a time, the clock waiting at each island. <b>Results</b> records the trip as one change.'),
					side: 'bottom'
				},
				before: () => goToTab('barter')
			},
			...(harbour ? [{
				element: '.comm-head',
				popover: {
					title: T('The harbour'),
					description: T('The boards and the fleet in numbers. Signing in puts you on them, and one press here takes you off again. Only numbers are shared, never your stock, your notes or your traces.'),
					side: 'bottom'
				},
				before: () => goToTab('community')
			}] : []),
			{
				// The masthead's verbs, and the menu that holds the rest.
				element: phone ? '#tabbar' : '.masthead-actions',
				popover: {
					title: T('Undo, and your data'),
					description: T('Every change can be undone. <b>Help</b> plays a film of the whole app. <b>Menu</b> (M) holds every section, Find (Ctrl+K), Export and Import, the theme and What\'s new.'),
					side: phone ? 'top' : 'bottom',
					popoverClass: atTop
				},
				before: () => goToTab('plan')
			}
		];

		// Every step is kept: when its element is absent (an empty queue has
		// no build rows) Driver.js simply centres the popover, which still
		// reads correctly.
		return all;
	}

	/** Put the user's own data back after the walkthrough. */
	restoreRealData() {
		if (!this.realData) return;
		const saved = this.realData;
		this.realData = null;
		store.restore(saved);
	}

	/** True when the tour is up; false when Driver.js never arrived, so
	 *  the caller can say so instead of silently doing nothing. */
	async startTour() {
		if (this.running) return true;
		// The library is fetched on the first tour rather than on every
		// page load, so this is where it arrives.
		if (!await this.loadDriver()) {
			console.warn('[tour] Driver.js could not be loaded');
			return false;
		}
		// Two clicks in quick succession: the second waited on the same
		// load and must not start a second tour behind the first.
		if (this.running) return true;
		const steps = this.steps();
		this.driver = this.create(steps);
		if (!this.driver) {
			console.warn('[tour] Driver.js is not available yet');
			return false;
		}

		// Swap in the example, keeping the real data to hand back later.
		this.realData = store.capture();
		store.applyTransient(DEMO);

		// Anything that repaints the screen throws away the node the
		// highlight was on, and the popover is left pointing at a gap.
		// Plenty does, long after the tour has started: the icon mapping
		// lands, the barter catalogue lands, Market prices land, a clock
		// ticks over. So every repaint re-measures the step -- refresh
		// only moves the ring and the popover to where the element is
		// now, so doing it often is invisible and doing it too rarely is
		// the bug.
		this.stopWatching = store.subscribe(() => {
			if (!this.running || !this.driver) return;
			clearTimeout(this.restage);
			this.restage = setTimeout(() => {
				if (this.running && this.driver) this.driver.refresh();
			}, 60);
		});

		goToTab('plan');
		this.running = true;
		this.driver.setSteps(steps);
		this.driver.drive();
		return true;
	}

	/** Show the tour once, the first time someone opens the app. */
	checkAndShowInitialTour() {
		let done;
		try {
			done = localStorage.getItem(DONE_KEY);
		} catch {
			return;
		}
		if (done === 'true') return;
		// Fire and forget: the tour loads its library first now, and a
		// first visit with no network simply gets no tour.
		setTimeout(() => { this.startTour().catch(() => { /* no tour, then */ }); }, 900);
	}
}

export const guidedTour = new GuidedTour();
