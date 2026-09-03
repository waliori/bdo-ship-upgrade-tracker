// Guided tour, built on Driver.js.
//
// The tour walks all nine views in the order someone would actually use
// them: the yard first -- see the plan, queue a build, record what you
// own, craft, go shopping -- and then the sea, where the day is spent:
// the quests, the ship, and the chart. Each step switches tab by
// clicking the real tab button, so there is no second copy of the
// navigation logic to keep in sync, and it works the same on a phone,
// where that button is in the bar at the thumb or behind "All".

import * as store from './state.js';

const DONE_KEY = 'bdo_ship_upgrade-tour_completed';

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
	strategy: {}
});

/** Click a tab and give the render a moment to land. */
function goToTab(id) {
	const btn = document.querySelector(`[data-act="view"][data-id="${id}"]`);
	if (btn) btn.click();
}

/** Open an inventory tile so the detail panel has something in it. */
function selectSampleItem() {
	const tile = [...document.querySelectorAll('.tile')]
		.find(t => t.title === 'Violent Wave Plywood') || document.querySelector('.tile');
	if (tile) tile.click();
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
			overlayOpacity: 0.55,
			overlayColor: '#03080f',
			stagePadding: 8,
			stageRadius: 12,
			allowClose: true,
			animate: true,
			smoothScroll: true,
			doneBtnText: 'Finish',
			closeBtnText: 'Skip',
			nextBtnText: 'Next',
			prevBtnText: 'Back',
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
		const onPhone = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
		const phone = onPhone();
		const all = [
			{
				popover: {
					title: '⚓ One inventory, every build',
					description: 'This tracker keeps a single record of what you own. Every build draws from it, so the same 100 planks are never promised to two ships at once.<br><br><b>The next few screens show an example so there is something to point at — your own data comes back when the tour ends.</b>',
					align: 'center'
				},
				before: () => goToTab('plan')
			},
			{
				// A phone has the bar at the thumb instead of the row above.
				element: phone ? '#tabbar' : '#tabs',
				popover: {
					title: 'The nine views, in two groups',
					description: 'The <b>yard</b>, where a build is planned and made: <b>Plan</b> is what every build needs, <b>Builds</b> is the queue and its priority, <b>Inventory</b> is what you own, <b>Tree</b> shows why a build needs a thing, <b>Workshop</b> is where you craft and enhance, <b>To Get</b> is the shopping list.<br><br>Then the <b>sea</b>, where the day is spent: <b>Map</b> charts the barterers and plots the loop, <b>Quests</b> is what the sea hands out for free, <b>Ship</b> is the hull\'s own numbers and the crew to fill it.'
						+ (phone ? '<br><br>Four sit in the bar at your thumb; <b>All</b> opens the rest.' : '<br><br>The digits <b>1</b>–<b>9</b> switch between them.'),
					side: phone ? 'top' : 'bottom'
				}
			},
			{
				element: '.today',
				popover: {
					title: 'What today can do about it',
					description: 'The plan says what is left; this says what today can do about it — the ship you are sailing, the quests still open that pay in something on your list, how long until the dailies, the weeklies and the barter refill reset, and when <b>Vell</b> is next up on your servers.',
					side: 'bottom'
				},
				before: () => goToTab('plan')
			},
			{
				element: '.stats',
				popover: {
					title: 'Where you stand',
					description: 'Overall coverage, the Crow Coins and silver still to spend, and how many recipes you could make from stock this second.',
					side: 'bottom'
				},
				before: () => goToTab('plan')
			},
			{
				element: '.readybar',
				popover: {
					title: 'Craft it here',
					description: 'Anything you can make right now shows up here. One click crafts it: the ingredients leave your inventory and the product arrives.',
					side: 'bottom'
				}
			},
			{
				element: '.row',
				popover: {
					title: 'Reading a material, and recording it',
					description: 'The bar splits three ways — <span style="color:#4ec9ae">green</span> is covered from stock, <span style="color:#3a89c9">blue</span> is still to craft, <span style="color:#e87a6d">red</span> is missing.<br><br>The <b>− number +</b> box on the right is how many you own. Change it here as you gather and every build updates at once — that is the main thing you will do day to day.',
					side: 'top'
				}
			},
			{
				element: '#pouch',
				popover: {
					title: 'What you are carrying',
					description: 'Coins, silver and enhancement stones sit above every tab, because you spend them from every tab. Type in what you have and each one tells you whether it covers your builds or how far <b>short</b> you are.',
					side: 'bottom'
				},
				before: () => goToTab('plan')
			},
			{
				element: '.queue-head',
				popover: {
					title: 'Your build queue',
					description: 'Add any ship, part or material as a build. Order matters: when stock is short, the build nearest the top gets it first. Use ▲▼ to re-order, ⏸ to park one without losing it.<br><br>Each build says what is still left to pay for it, which falls as you record what you gather.<br><br>Some ships can be reached more than one way — a Caravel from a plain Epheria Sailboat or an Improved one. Queue one and it asks which, shows what each costs, and the build then says the route it is taking.',
					side: 'bottom'
				},
				before: () => goToTab('builds')
			},
			{
				element: '.inv-grid',
				popover: {
					title: 'What you actually own',
					description: 'Set quantities here as you gather. The small bar on each tile shows how much is already spoken for by a build versus how much is still free.',
					side: 'top'
				},
				before: () => goToTab('inventory')
			},
			{
				element: '.detail',
				before: () => {
					goToTab('inventory');
					selectSampleItem();
				},
				popover: {
					title: 'Why an item is reserved',
					description: 'Pick a tile and this panel shows who reserved it and through which recipe, and every way of getting it priced end to end — the shop\'s number beside what making one costs once <i>its</i> ingredients are priced too. Coins and silver stay apart, and anything bartered for is named rather than counted as free.<br><br>Any item name in the app opens its <b>BDOCodex</b> page in a new tab.',
					side: phone ? 'top' : 'left'
				}
			},
			{
				element: '.tpanel',
				popover: {
					title: 'Why it needs what it needs',
					description: 'The Plan is one row per material, which answers "what am I short of". This is the same thing unflattened, and answers the other question: a Carrack sits over the Caravel it is made from, over the Sailboat before that, with the materials of each hanging off the step that wants them.<br><br>Enhancement chains start folded — a +10 pulling in +9 pulling in +8 is ten rows that all say the same thing.',
					side: 'top'
				},
				before: () => goToTab('tree')
			},
			{
				element: '.craft-grid',
				popover: {
					title: 'The workshop',
					description: 'Every recipe you have the materials for, with exactly what it will consume.',
					side: 'top'
				},
				before: () => goToTab('workshop')
			},
			{
				element: '[data-base]',
				popover: {
					title: 'Enhancing',
					description: 'Every part you own that can go higher is listed — whether or not a build is waiting on it — with the stones the next attempt costs and a box for the <b>failstack</b> you are on.<br><br>Blue and green ship parts keep their level when an attempt fails; the yellow Falasi and Cheongun tier drops one, so its cost includes the Cron Stones that prevent it. Record <b>Succeeded</b> or <b>Failed</b> and the materials come off your stock either way.',
					side: 'top'
				},
				before: () => goToTab('workshop')
			},
			{
				element: '.summary',
				popover: {
					title: 'The shopping list',
					description: 'Everything still missing, grouped by how you actually get it — Crow Coins, Falasi silver, barter, worker nodes or hunting — with running totals you can copy out.<br><br>Each line prices the whole quantity, and where a thing can be made instead it says what that would cost, so the choice is one glance rather than arithmetic.',
					side: 'bottom'
				},
				before: () => goToTab('get')
			},
			{
				element: '.quest-clocks',
				popover: {
					title: 'What the sea hands out free',
					description: 'Every quest that pays in a ship material, grouped by how often it comes round, with the ones paying in something your plan still wants marked.<br><br>Tick what you did and <b>Finish</b> records them together: the rewards go into stock as one undoable change, and the tick wears off at the reset by itself. A set you run every day can be kept as a named <b>group</b>, or starred.',
					side: 'bottom'
				},
				before: () => goToTab('quests')
			},
			{
				element: '.ship-card-main',
				popover: {
					title: 'The other half of a ship',
					description: 'Every hull in the game\'s own numbers — weight, slots, cannons, speed — fitted out as five slots: the four parts and the <b>sea crystal</b>. Each takes the best you hold, or one you choose. Your <b>Sailing Mastery</b> goes in beside it and counts toward speed, acceleration, turn and brake.<br><br>Below sits the crew: sailors against the hull\'s seats and cabin space, what their contracts cost, and the certificates on the shopping list. Keep a whole fit-out as a named <b>setup</b> and switch between them here or from the Map.',
					side: 'bottom'
				},
				before: () => goToTab('crew')
			},
			{
				element: '#map',
				popover: {
					title: 'The list, drawn on the sea',
					description: 'Every pin is a barterer holding something you are short of, on the game\'s own chart. Drag to pan, scroll or pinch to zoom.<br><br>The strip above the tabs — <b>On the chart</b> — is what gets drawn: barterers, monster habitats, the 58 wharf managers, guild wharves, island names, and any route you have traced.',
					side: phone ? 'top' : 'left'
				},
				before: () => goToMap('sail')
			},
			{
				element: '.map-tabs',
				popover: {
					title: 'Five things to do with a chart',
					description: '<b>Barter</b> is who has what you are short of. <b>Route</b> plots the loop through them and gives every leg its distance and its minutes, at the speed your ship actually makes — then keeps it by name, in a link, or writes it into the game\'s own world map.<br><br><b>Draw</b> is for the routes a shopping list cannot express: click the sea for a stop, drag to sketch a line, or type a word straight onto the water. <b>Grounds</b> is the monsters and the community courses, and <b>Today</b> is what you have already sailed.',
					side: phone ? 'top' : 'left'
				},
				before: () => goToMap('route')
			},
			{
				// The masthead's buttons are behind the hamburger on a phone,
				// so that is what a phone gets pointed at.
				// The header folds into the hamburger at 780px (css), which is
				// wider than the phone the rest of the tour is cut for --
				// between the two, the actions the step would point at
				// are hidden, so this step follows the header's own rule.
				element: typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 780px)').matches ? '.hamburger' : '.masthead-actions',
				popover: {
					title: 'Undo, and your data',
					description: 'Every change can be undone. <b>Find</b> (Ctrl+K) opens any item or tab, and <b>Log a trip</b> records everything you brought back as one change.<br><br><b>More</b> holds Profiles, Export and Import — a JSON backup, or a link carrying the whole plan — and <b>Help</b>, which plays a film of the whole thing end to end and lists what changed and when each dataset was checked.<br><br>Where the deployment offers it, signing in with Discord keeps this same inventory on your phone as well; without it nothing leaves this browser at all.',
					side: 'bottom'
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
