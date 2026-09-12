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
			// A browser that asked for less movement gets the stage cut,
			// not slid, and the page jumped to each step rather than
			// scrolled there.
			animate: !stillness(),
			smoothScroll: !stillness(),
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
		const phone = isPhone();
		// The Community tab is only there where the server has accounts
		// to stand on its boards; the tour says nothing about it otherwise.
		const harbour = feature('community');
		const all = [
			{
				popover: {
					title: '⚓ Parts, quests, routes and the map',
					description: 'This tracker keeps a single record of what you own. Every build draws from it, so the same 100 planks are never promised to two ships at once.<br><br><b>The next few screens show an example so there is something to point at — your own data comes back when the tour ends.</b>',
					align: 'center'
				},
				before: () => goToTab('plan')
			},
			{
				// A phone has the bar at the thumb instead of the dock above.
				element: phone ? '#tabbar' : '#tabs',
				popover: {
					title: 'Every section, in one dock',
					description: 'The <b>yard</b>, where a build is planned and made: <b>Plan</b> is what every build needs, <b>Builds</b> is the queue and its priority, <b>Inventory</b> is what you own, <b>Tree</b> shows why a build needs a thing, <b>Workshop</b> is where you craft and enhance, <b>To Get</b> is the shopping list.<br><br>Then the <b>sea</b>, where the day is spent: <b>Map</b> charts the barterers and plots the loop, <b>Quests</b> is what the sea hands out for free, <b>Ship</b> is the hull\'s own numbers and the crew to fill it, and <b>Barter</b> plans a run on today\'s board.'
						+ (harbour ? ' And the <b>harbour</b>: <b>Community</b>, the boards every sailor who takes part is on.' : '')
						+ (phone ? '<br><br>Four sit in the bar at your thumb; <b>Menu</b> opens the rest.' : '<br><br>The digits <b>1</b>–<b>9</b> switch between them, <b>0</b> is the tenth.'),
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
					description: 'Coins, silver and enhancement stones sit above every tab, because you spend them from every tab. Type in what you have and each one tells you whether it covers your builds or how far <b>short</b> you are.'
						+ (phone
							? '<br><br>On a phone it is one line — what is held, and in red what is missing. Press it and <b>Carrying</b> opens with the fields in it, the numbers about you among them: total barters, barter level, Parley, vouchers, Value Pack, Sailing Mastery, the Bos\'n Jacks you have out and the region your Market prices come from.'
							: '<br><br>Beside them, <b>The sailor</b>: your total barters, barter level, Parley, vouchers, Value Pack, Sailing Mastery, the Bos\'n Jacks you have out and the region your Market prices come from. Press it to open the fields.')
						+ ' They are read by every screen, so they are set once, here — and the barter count decides which islands will deal with you at all.',
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
				// Scoped to the screen: the pouch above it carries a
				// `.summary` of its own -- the sailor's numbers, folded
				// into their line -- and a bare '.summary' picked that
				// instead, so the tour lit the bar while talking about
				// the shopping list.
				element: '#screen .summary',
				popover: {
					title: 'The shopping list',
					description: 'Everything still missing, as its own icon and number — biggest shortfall first, tinted by the money it wants, and a press on any of them narrows the screen to that one thing. The whole list copies out as text or CSV. <b>The way to get it</b> reads the whole list at once and gives each thing one way — the quests, the Crow Coin Shop, barter, Falasi, the Market — with its reason on the line and the days it takes, following the goal you pick above it.<br><br><b>Every way</b> is the other reading: grouped by where a thing is got, each line pricing the whole quantity, with what making it instead would cost.',
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
					description: 'Every hull in the game\'s own numbers — weight, slots, cannons, speed — fitted out as five slots: the four parts and the <b>sea crystal</b>. Each takes the best you hold, or one you choose. Your <b>Sailing Mastery</b> goes in beside it and counts toward speed, acceleration, turn and brake.<br><br>Below sits the crew: sailors against the hull\'s seats and cabin space, what their contracts cost, and the certificates on the shopping list.<br><br>A crew is <b>read off your own screenshots</b>: open Manage Sailors in game, drop the picture in, and the names, levels, condition and every growth come back in a table to check before a thing is written — in whichever of the sixteen languages the game is played in. <b>Auto assign</b> asks what the boat is <i>for</i> — bartering, speed, sea monsters — and seats them for that, since the seat that doubles two growths at once makes the sums disagree. Keep a whole fit-out as a named <b>setup</b> and switch between them here or from the Map.',
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
				// The ⛰ in the zoom bar. The step describes the lean
				// rather than performing it: standing the chart up
				// fetches terrain, and the tour has no business pulling
				// down a few hundred tiles to make a point.
				element: '[data-act="map-3d"]',
				popover: {
					title: 'And stood up on the real ground',
					description: 'Overhead is the right way to read a route and the wrong way to read a coast. <b>⛰</b> leans the chart over and puts the game\'s own terrain under the sea — the same chart, the same pins and the same plotted loop, placed on the ground instead of beside it.<br><br>Shift-drag leans and turns it, an ordinary drag carries the water, and <b>Level</b> puts you back overhead facing north. <b>Ground</b> paints the islands in the colours you know; <b>Neon</b> draws contour lines over dark water instead. Where you leave it is where it opens next time.',
					side: phone ? 'top' : 'left'
				},
				before: () => goToMap('sail')
			},
			{
				element: '.map-tabs',
				popover: {
					title: 'Five things to do with a chart',
					description: '<b>Barter</b> is who has what you are short of. <b>Route</b> plots the loop through them and gives every leg its distance and its minutes, at the speed your ship actually makes — says the stop the rations run low after — then keeps it by name, in a link, or writes it into the game\'s own world map.<br><br><b>Draw</b> is for the routes a shopping list cannot express: click the sea for a stop, drag to sketch a line, or type a word straight onto the water. <b>Grounds</b> is the monsters and the community courses, and <b>Today</b> is what you have already sailed.<br><br>A run laid out on the Barter tab is sailed here too: the route on the chart, and this panel the run sheet, stop by stop.',
					side: phone ? 'top' : 'left'
				},
				before: () => goToMap('route')
			},
			{
				element: '.barter-bar',
				popover: {
					title: 'Today\'s board',
					description: 'The trade-goods barters are not rolled island by island: every refresh the whole sea shows one of forty fixed layouts. So this asks what <i>one</i> island is showing — tap it from that island\'s possible offers — and the whole board follows: every chain the day allows, listed by how far it reaches and what it pays.<br><br><b>Silver</b> is a run along the chains you tick; <b>A material</b> is one route through every island dealing the thing your plan is short of.<br><br>Only the islands your <b>total barters</b> have opened are planned through: the rest sit locked under the list, with a line saying how many more barters open them. Nothing is ever routed through a barterer you cannot reach.',
					side: 'bottom'
				},
				before: () => goToTab('barter')
			},
			{
				element: '.hold-bar',
				popover: {
					title: 'The hold, and the run',
					description: 'The hold is what is actually aboard, weighed against the ship as fitted and the ceiling the islands still deal under; goods ashore are listed by harbour with a Load button. Under it, the <b>sailing orders</b> — cash out today or build the stocks, the pace, which levels a wharf sells — and the figures every chain comes to.<br><br>Tick chains and a strip along the foot keeps the run in a line: <b>Lay it out</b> opens every stop, what to buy before casting off, and the quests handed in on the way, and <b>Sail this run</b> takes it to the Map as a checklist. <b>Record the trip</b> at the end puts the whole of it in the Inventory as one change.',
					side: 'bottom'
				},
				before: () => goToTab('barter')
			},
			...(harbour ? [{
				element: '.comm-head',
				popover: {
					title: 'The harbour',
					description: 'Sixteen boards — mastery, the best ship, the best sailor, the most silver from runs, the most monsters hunted, the luckiest at the anvil — and the fleet in numbers: the hulls most sailed, the parts most fitted, the islands most plotted.<br><br>Only the sailors who take part are on it, by name or as an unnamed sailor, and you see exactly what would be shared before you agree. A place on a board opens what it is about: another sailor\'s ship, stood up on the Ship tab to look at.',
					side: 'bottom'
				},
				before: () => goToTab('community')
			}] : []),
			{
				// The masthead's verbs, and the menu that holds the rest.
				element: phone ? '#tabbar' : '.masthead-actions',
				popover: {
					title: 'Undo, and your data',
					description: 'Every change can be undone, and redone. <b>Log a trip</b> records everything you brought back as one change, <b>Help</b> plays a film of the whole app end to end and lists when each dataset was checked, and <b>Discord</b> is the sailors\' own server — the room this was written for.<br><br><b>Menu</b> (M) is the one menu the app has: every section, <b>Find</b> (Ctrl+K) for any item or tab, Profiles, Export and Import — a JSON backup, or a link carrying the whole plan — the theme, <b>What\'s new</b> and <b>Feedback</b>.'
						+ (phone ? ' On a phone the thumb bar\'s last slot opens it.' : '')
						+ '<br><br>Where the deployment offers it, signing in with Discord keeps this same inventory on your phone as well; without it nothing leaves this browser at all.',
					side: phone ? 'top' : 'bottom'
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
