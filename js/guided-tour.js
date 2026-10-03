// Guided tour, built on Driver.js.
//
// The tour walks the app in the order someone would actually use it:
// the yard first -- the plan, the builds, what you own and how it is
// read off a screenshot, the shopping list, what you carry -- then the
// sea: a run on the Barter tab in its four steps, the hold it keeps to
// and the clock it sails by, the chart, the ship and the quests, and
// last the masthead and the menu behind it. Each step switches tab by
// clicking the real tab button, so there is no second copy of the
// navigation logic to keep in sync.
//
// The same tour has to read on a desk and on a phone, and those are two
// different pages: the tab row is a bar at the thumb that seats four
// sections and keeps the rest behind Menu, the chart's panel is folded,
// a control is often in the page twice with only one copy showing. So
// a step does not name an element, it names how to find one -- the
// first copy that is actually on the screen, per layout -- and says
// what it says per layout too. Its target is looked up again whenever
// the page repaints or is turned on its side.

import * as store from './state.js';
import { isPhone } from './viewport.js';
import { feature } from './sync.js';
import { T } from './i18n.js';
import { barterKey } from './clock.js';
import { hushTimer } from './sail-timer.js';
import { holdSlotsUsed, hullSlots } from './hold-room.js';
import { F } from './fmt.js';
import { V as barterView, STEP_KEY } from './barter/state.js';
import { flushView, keepLayoutSeen } from './barter/view.js';
import { STORE_KEY as MAP_KEY } from './map/state.js';
import { sailKey, sailRecord, runMarks, runLabel } from './barter/sail.js';
import { sailCal, fromPort } from './barter/board.js';
import { toldOf } from './barter/packing.js';
import { legsOf } from './barter/route.js';

const DONE_KEY = 'bdo_ship_upgrade-tour_completed';

/** True when the browser has asked for less movement. */
const stillness = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
	&& window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/*
 * A worked-through example to talk over: a Carrack part part-way built,
 * with something craftable, something short, and a part mid-enhancement
 * -- and a barter run on today's board, so the Barter steps point at a
 * real one. It is never saved: the real data is captured first and put
 * back when the tour ends, and the store writes nothing while it is in.
 *
 * The run is layout 4 of the game's forty, read off two islands, from
 * Iliya Island: two [Level 5]s and a [Level 1] climbed to [Level 7] and
 * sold at the wharf. The chain ids are the Barter tab's own for these
 * goods on that layout; a patch that re-deals layout 4 is caught by the
 * tour's tests (the hold and the clock steps then have no run to show).
 * For the clock step the run is cast off the way the Sail press casts
 * it off -- from the route the Load step laid -- so the clock's stops
 * are the cockpit's, and in the page's language.
 */
const PORT = 1002;   // Iliya Island
const LAYOUT = '4';
const CHAINS = [
	'hold:[Level 5] Elixir of Youth:58977.58973',
	'hold:[Level 5] Mysterious Rock:58980.58954',
	'hold:[Level 1] Raft Toy:58955.58942.58907.58949'
];
// The two islands whose offers settle the layout.
const ANSWERS = [
	{ npcId: 50814, give: "[Level 4] Boatman's Manual", recv: 'Crow Coin' },
	{ npcId: 50815, give: '[Level 4] Headless Dragon Figurine', recv: 'Crow Coin' }
];
const HOLD = "Ship's hold";
const ILIYA = 'Iliya Island';
// Where the goods are: two [Level 5]s and two [Level 3]s aboard, the
// rest in the storage at Iliya. The same at sea: the run is cast off as
// the packing list stood, nothing ticked.
const GOODS = {
	'[Level 5] Elixir of Youth': { [HOLD]: 4 },
	'[Level 3] Scout Binoculars': { [HOLD]: 2 },
	'[Level 5] Mysterious Rock': { [ILIYA]: 4 },
	'[Level 1] Raft Toy': { [ILIYA]: 4 },
	'[Level 1] Golden Sand': { [ILIYA]: 18 },
	'[Level 2] Big Stone Slab': { [ILIYA]: 5 }
};
// How long ago the example cast off: the clock is a few minutes short
// of the first island.
const UNDER_WAY = 150;

/**
 * The example as the store takes it, with the board of today, so it
 * reads as read this morning. `sea` is the run cast off -- its record
 * and its clock, from castOff() -- for the Sail step; without it the
 * run is at the wharf, on the Load step and its packing list.
 */
function example(sea = null) {
	const day = barterKey();
	const stock = {
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
	};
	for (const [name, at] of Object.entries(GOODS)) stock[name] = Object.values(at).reduce((a, n) => a + n, 0);
	const barter = { port: PORT, routes: { key: `${day}|${LAYOUT}|`, ids: CHAINS }, board: { day, answers: ANSWERS }, ...(sea ? { sail: sea.sail } : {}) };
	return JSON.stringify({
		stock,
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
		// the example is building rather than the sloop a save starts on --
		// and the hold step's twenty slots are that Valor's.
		profile: {
			barterCount: 4205,
			level: 'Master 5',
			sailingMastery: 750,
			crewShip: 'Carrack (Valor)',
			stash: GOODS,
			views: { barter, ...(sea ? { timer: sea.timer } : {}) }
		}
	});
}

/**
 * The example run cast off, as the Sail press does it: the run's record
 * from the route on screen, and a clock set on its stops -- started a
 * few minutes ago, so it is counting towards the first island. Null
 * while no route of the example's is laid yet: the tour clears the
 * tab's route when it starts, so one there now was laid on the example.
 */
function castOff() {
	const plan = barterView.shownPlan;
	if (!plan || !Array.isArray(plan.stops) || !plan.stops.length) return null;
	const marks = runMarks(plan, legsOf(plan.stops));
	if (!marks.length) return null;
	const sail = { key: sailKey(), done: [], seen: {}, got: {}, kept: [], laidFor: '{}', cal: sailCal(), ...sailRecord(plan), packLog: { delta: {}, moves: [] }, told: toldOf(plan, fromPort()) };
	const seconds = Math.max(30, Math.min(6 * 3600, Math.round(marks[marks.length - 1].at)));
	const timer = {
		startedAt: Date.now() - UNDER_WAY * 1000, seconds, label: runLabel(plan).slice(0, 60),
		chimed: false, marks, done: 0, reached: 0, legAt: 0, of: plan.stops.length,
		base: { seconds, marks }
	};
	return { sail, timer };
}

/**
 * The Barter tab's memory, and what the tour's screens keep in this
 * browser beside the save, kept to be put back. The tab's state lives in
 * one object of the module's own, beside the store: the board, the run,
 * the step up, the searches out. The example's view is read into it when
 * the tab draws, so the sailor's is copied here first -- any write of it
 * still owed is made now, while the store still saves -- and put back
 * whole when the tour ends. The live handles (the workers, the request
 * out, the timers) are left as they are by then.
 */
const LIVE = new Set(['worker', 'presetWorker', 'expectWorker', 'pending', 'untilBeat', 'writeTimer', 'writing', 'reqSeq', 'expectSeq']);
function keepBarter() {
	flushView();
	const kept = {};
	for (const [k, v] of Object.entries(barterView)) {
		if (LIVE.has(k)) continue;
		try { kept[k] = window.structuredClone(v); } catch { kept[k] = v; }
	}
	// Two things the tour's screens keep in this browser beside the save:
	// the Barter tab's step, and the chart's panel (the tour opens it on a
	// phone and folds it again, and the fold is written down). Each goes
	// back to what it said, or to not being there at all.
	const local = {};
	for (const k of [STEP_KEY, MAP_KEY]) {
		try { local[k] = localStorage.getItem(k); } catch { /* none kept */ }
	}
	const seen = keepLayoutSeen();
	return () => {
		// A write of the example's view still owed is dropped: made now, it
		// would land on the sailor's save.
		if (barterView.writeTimer) {
			clearTimeout(barterView.writeTimer);
			barterView.writeTimer = null;
		}
		for (const k of Object.keys(barterView)) if (!LIVE.has(k) && !(k in kept)) delete barterView[k];
		Object.assign(barterView, kept);
		seen();
		for (const [k, was] of Object.entries(local)) {
			try {
				if (localStorage.getItem(k) === was) continue;
				if (was === null) localStorage.removeItem(k);
				else localStorage.setItem(k, was);
			} catch { /* the session keeps it */ }
		}
	};
}

/** On the screen: drawn with a size, not hidden, not invisible. */
function onScreen(el) {
	if (!el || !el.isConnected) return false;
	const r = el.getBoundingClientRect();
	if (!(r.width > 0 && r.height > 0)) return false;
	return getComputedStyle(el).visibility !== 'hidden';
}

/**
 * The first match that is actually on the screen.
 *
 * A selector alone is ambiguous here: a section button is both in the
 * tab row (hidden on a phone) and in the bar at the thumb (hidden on a
 * desk), and the old tour, taking whichever came first, highlighted a
 * box of no size and floated its popover over nothing. Several
 * selectors are tried in turn, so a step can say what it wants and
 * what will do instead.
 */
function shown(...sels) {
	for (const sel of sels) {
		for (const el of document.querySelectorAll(sel)) if (onScreen(el)) return el;
	}
	return null;
}

/** Fixed or sticky: scrolling the page does not move it. */
function pinned(el) {
	for (let at = el; at && at !== document.body; at = at.parentElement) {
		const pos = getComputedStyle(at).position;
		if (pos === 'fixed' || pos === 'sticky') return true;
	}
	return false;
}

/** Click a tab. The tab row's copy is clicked even on a phone, where it
 *  is not drawn: a click is a click, and it is always in the page. */
function goToTab(id) {
	const btn = document.querySelector(`[data-act="view"][data-id="${id}"]`);
	if (btn && document.body.dataset.view !== id) btn.click();
}

/** The section's name as the page says it, in the page's language. */
function tabName(id) {
	const label = document.querySelector(`#tabs [data-id="${id}"] .tab-label`);
	return label ? label.textContent.trim() : id;
}

/**
 * Where a section is on a phone, when it is not one of the four at the
 * thumb: "☰ Menu › Builds", above the step's text. A desk shows every
 * tab in the row at the top, so it needs no telling.
 */
function whereOnPhone(id) {
	if (!isPhone() || document.querySelector(`#tabbar [data-act="view"][data-id="${id}"]`)) return '';
	return `<span class="tour-where">☰ ${T('Menu')} › ${tabName(id)}</span>`;
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
		// The steps being driven, and the layout their words were dressed for.
		this.list = [];
		this.phone = false;
		// What the tour moved and must put back: the tab it started on,
		// the scroll, the Barter tab's memory, the chart's panel.
		this.was = null;
		// The example's run is cast off (the clock step) rather than at
		// the wharf, and the run, once cast off.
		this.sea = false;
		this.run = null;
		// A step is being moved to; the watchers keep their hands off.
		this.moving = false;
		// The step last shown.
		this.at = 0;
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

	create() {
		const driverFn = this.resolveDriver();
		if (!driverFn) return null;
		return driverFn({
			// Back, Next and the arrow keys all come here, so a step can
			// open its screen before it is shown and be passed over when
			// that screen has nothing for it.
			onNextClick: () => this.hop(1),
			onPrevClick: () => this.hop(-1),
			showProgress: true,
			showButtons: ['next', 'previous', 'close'],
			// Dressed in the app's own tokens (tracker-recent.css).
			popoverClass: 'sail-tour',
			overlayOpacity: 0.55,
			overlayColor: '#03080f',
			stagePadding: 8,
			stageRadius: 12,
			allowClose: true,
			// What is highlighted is the example's, to be looked at: a
			// press on it -- a packing tick, the clock's stop, the step
			// buttons -- would act on example data, or write the step up as
			// this device's own.
			disableActiveInteraction: true,
			// The keys are the tour's own; see startTour().
			allowKeyboardControl: false,
			// A browser that asked for less movement gets the stage cut,
			// not slid, and the page jumped to each step rather than
			// scrolled there. A phone is always jumped: its sheet moves
			// the target again straight after, and two scrolls in a row
			// read as the page lurching.
			animate: !stillness(),
			smoothScroll: !stillness() && !isPhone(),
			doneBtnText: T('Finish'),
			closeBtnText: T('Skip'),
			nextBtnText: T('Next'),
			prevBtnText: T('Back'),
			onPopoverRender: popover => {
				// The step on screen, for finish() once Driver.js has let go.
				if (this.driver) this.at = this.driver.getActiveIndex();
				// The keyboard lands on Next, so Enter goes on. Driver.js
				// focuses the first button it finds, which is the close
				// cross -- Enter on it ended the tour -- and it does so
				// right after this hook, so this waits a tick.
				setTimeout(() => {
					if (popover.nextButton && popover.wrapper.isConnected) popover.nextButton.focus({ preventScroll: true });
					this.place();
				}, 0);
			},
			onDestroyed: () => this.finish()
		});
	}

	/**
	 * Move a step forward or back.
	 *
	 * Driver.js finds a step's element the moment it moves to it, so the
	 * tab has to change *before* the move, not from inside the step's
	 * own highlight hook -- and a tab change repaints the screen twice,
	 * the render the click causes and one more a frame behind it. So the
	 * step is moved to once its element is really there, and a step
	 * whose element never comes (an empty queue has no build rows; a
	 * phone has no tab row) is passed over rather than shown as a
	 * popover pointing at nothing.
	 */
	async hop(delta) {
		if (!this.running || !this.driver || this.moving) return;
		const from = this.driver.getActiveIndex() ?? 0;
		this.moving = true;
		try {
			for (let to = from + delta; ; to += delta) {
				if (to < 0) return;
				if (to >= this.list.length) {
					this.driver.destroy();
					return;
				}
				if (await this.ready(to, from)) {
					this.show(to);
					return;
				}
				// Skip may have landed inside that wait.
				if (!this.running || !this.driver) return;
			}
		} finally {
			this.moving = false;
		}
	}

	/** Open step `to`'s screen and wait for its element; false if none comes. */
	async ready(to, from = -1) {
		const step = this.list[to];
		const left = this.list[from];
		if (left && left.leave && left !== step) left.leave();
		if (step.before) step.before();
		if (!step.find) return true;
		for (let waited = 0; waited < 1500; waited += 60) {
			await new Promise(r => setTimeout(r, 60));
			if (!this.running) return false;
			// A screen drawn a moment after the click -- the chart, a lazy
			// tab -- has its fold opened once it is there.
			if (step.again) step.again();
			// Twice over a frame apart, so a screen still being drawn again
			// a moment later is not caught half way.
			if (waited >= 120 && step.find()) return true;
		}
		return false;
	}

	/** Show step `i`, its words dressed for the layout as it is now. */
	show(i) {
		if (!this.driver) return;
		this.dress();
		this.driver.moveTo(i);
		// Anything slower behind it -- the chart's tiles, a lazy screen --
		// is caught by one more look.
		setTimeout(() => this.check(), 450);
	}

	/**
	 * On a phone the step is a sheet across the foot of the screen, and a
	 * sheet over the thing it is talking about is no help. So the page is
	 * scrolled until the target sits in the space above the sheet --
	 * centred there, or from its top when it is taller than that -- and
	 * when that cannot be done (the bar at the thumb is fixed to the
	 * bottom; the last row of a page cannot scroll any higher) the sheet
	 * goes to the top of the screen instead.
	 */
	place() {
		if (!this.running || !this.driver) return;
		const pop = document.querySelector('.driver-popover.sail-tour');
		if (!pop) return;
		pop.classList.remove('tour-top');
		const el = this.driver.getActiveElement();
		if (!isPhone() || !el || el.id === 'driver-dummy-element' || !el.isConnected) return;
		const gap = 10;
		const sheet = pop.getBoundingClientRect();
		let r = el.getBoundingClientRect();
		if (!pinned(el)) {
			const room = sheet.top - gap * 2;
			const want = r.height >= room ? gap : gap + (room - r.height) / 2;
			const dy = r.top - want;
			if (Math.abs(dy) > 2) window.scrollBy({ top: dy, behavior: 'instant' });
			r = el.getBoundingClientRect();
		}
		if (r.bottom > sheet.top - 2 && r.top > sheet.height + gap * 2) pop.classList.add('tour-top');
		this.driver.refresh();
	}

	/**
	 * Is the highlight still on something? Anything that repaints the
	 * screen throws away the node the highlight was on -- the icon
	 * mapping lands, the barter catalogue lands, a Market price lands --
	 * and refresh only re-measures the node it has, so a thrown-away one
	 * left the ring and the popover at the top-left corner of nothing.
	 * A lost target is found again and the step shown on it; one still
	 * there is only re-measured, which is invisible.
	 */
	check() {
		if (!this.running || !this.driver || this.moving) return;
		const i = this.driver.getActiveIndex();
		const step = this.list[i];
		if (!step) return;
		const el = this.driver.getActiveElement();
		if (step.find && (!el || el.id === 'driver-dummy-element' || !onScreen(el))) {
			if (step.find()) this.show(i);
			return;
		}
		this.driver.refresh();
		this.place();
	}

	/**
	 * Turned on its side, or a window dragged across the phone's width:
	 * the page swaps its tab row for the bar at the thumb, so the step
	 * is opened again for the layout it is now on -- its screen, its
	 * target and its words.
	 */
	relayout() {
		if (!this.running || !this.driver || this.moving) return;
		const phone = isPhone();
		if (phone === this.phone) {
			this.check();
			return;
		}
		this.phone = phone;
		const i = this.driver.getActiveIndex() ?? 0;
		this.moving = true;
		this.ready(i).then(ok => {
			this.moving = false;
			if (!this.running || !this.driver) return;
			if (ok) this.show(i);
			else this.hop(1);
		});
	}

	/** Each step's title and text, said for the layout it is on now. */
	dress() {
		for (const step of this.list) {
			step.popover.title = step.title();
			step.popover.description = step.text();
		}
	}

	/**
	 * The steps. Each says how to find its element (`find`, the first
	 * copy on the screen, tried per layout), what to open first
	 * (`before`) and what to close behind it (`leave`), and its words as
	 * functions, so they are said for the layout the step is shown on.
	 */
	steps() {
		const phone = () => isPhone();
		// The Community tab is only there where the server has accounts
		// to stand on its boards; the tour says nothing about it otherwise.
		const harbour = feature('community');
		const accounts = feature('sync');
		const list = [];
		const add = (id, s) => {
			const step = {
				id,
				...s,
				popover: { side: s.side, align: s.align }
			};
			if (s.find) step.element = () => s.find() || undefined;
			list.push(step);
		};

		// Fourteen stops, a few lines each. The tour was twenty-three, some
		// of them a hundred and twenty words, and most people closed it at
		// "1 of 23"; what it leaves out is one press away on each screen.
		add('welcome', {
			title: () => T('⚓ Parts, quests, routes and the map'),
			text: () => T('One record of what you own, and every build draws from it — the same 100 planks are never promised twice.<br><br><b>The next screens use an example; your own data comes back when the tour ends.</b>'),
			align: 'center',
			before: () => goToTab('plan')
		});
		add('sections', {
			// A desk has the row of sections at the top; a phone the bar at
			// the thumb, which is fixed, so its sheet goes up top.
			find: () => (phone() ? shown('#tabbar') : shown('#tabs')),
			title: () => (phone() ? T('Every section, at your thumb') : T('Every section, in one dock')),
			text: () => (phone()
				? T('<b>Plan</b>, <b>Inventory</b>, <b>Map</b> and <b>Barter</b> sit at your thumb. The last seat, <b>Menu</b>, opens every other section, and takes the name of the one you are on.')
				: T('The <b>yard</b> on the left plans and makes a build; the <b>sea</b> on the right is where the day is spent.')
					+ (harbour ? ' ' + T('<b>Community</b> is the harbour.') : '')
					+ ' ' + T('The digits <b>1</b>–<b>9</b> and <b>0</b> switch between them.')),
			side: 'bottom',
			before: () => goToTab('plan')
		});
		add('plan', {
			find: () => shown('#screen .row'),
			title: () => T('Reading a material, and recording it'),
			text: () => T('<span style="color:#4ec9ae">Green</span> is covered from stock, <span style="color:#3a89c9">blue</span> still to craft, <span style="color:#e87a6d">red</span> missing. The <b>− number +</b> box is how many you own: change it as you gather and every build updates.'),
			side: 'top',
			before: () => goToTab('plan')
		});
		add('builds', {
			find: () => shown('#screen .queue-head'),
			title: () => T('Your build queue'),
			text: () => whereOnPhone('builds') + T('Add a ship, part or material. When stock is short the build nearest the top gets it first; ▲▼ re-order, ⏸ parks one. The <b>Workshop</b> crafts and enhances what you have the materials for.'),
			side: 'bottom',
			before: () => goToTab('builds')
		});
		add('inventory', {
			find: () => shown('#screen [data-act="inv-shot"]', '#screen .inv-left .controls'),
			title: () => T('What you actually own'),
			text: () => T('Type a count on any tile, or <b>📷 Read a storage</b> off screenshots of the game’s window — read in this browser, nothing uploaded. The Ship tab reads Manage Sailors and the Barter tab the barter window the same way.'),
			side: 'bottom',
			before: () => goToTab('inventory')
		});
		add('get', {
			// The way to get it is To Get's first view; a sailor who left it
			// on Every way gets the list's own head instead.
			find: () => shown('#screen .way-head-top', '#screen .summary > :first-child'),
			title: () => T('The shopping list'),
			text: () => whereOnPhone('get') + T('Everything still missing, and <b>the way to get it</b>: one way for each thing — quests, the Crow Coin Shop, barter, the Market — in the order it is done, with the days it takes.'),
			side: 'bottom',
			before: () => goToTab('get')
		});
		add('pouch', {
			find: () => shown('#pouch'),
			title: () => T('What you are carrying'),
			text: () => T('Coins, silver and stones, set once and read by every screen — each says whether it covers your builds. <b>The sailor</b> beside them holds your barter count, which decides the islands that will deal with you.'),
			side: 'bottom',
			before: () => goToTab('plan')
		});
		add('run', {
			find: () => shown('#screen .barter-screen .steps'),
			title: () => T('A run in four steps'),
			text: () => T('<b>Plan</b>: say what the day is for, tell it today’s board — one island, or a screenshot of the barter window — and tick the chains. <b>Load</b> packs the hold, <b>Sail</b> goes one stop at a time, and <b>Results</b> records the trip as one change.'),
			side: 'bottom',
			before: () => goToTab('barter')
		});
		// The hold is drawn on the Load step, over the example's packing
		// list; the clock on the Sail step, the example run cast off a few
		// minutes ago. The step up is switched in memory only -- a press on
		// the step's button would write it down as this device's -- and the
		// one the sailor had is put back when the tour ends.
		const onStep = id => {
			if (barterView.step === id && shown(`#screen .steps [data-act="barter-step"][data-id="${id}"].on`)) return;
			barterView.step = id;
			const again = document.querySelector('[data-act="barter-redraw"]');
			if (again) again.click();
		};
		add('hold', {
			find: () => shown('#screen .hold-col-ship', '#screen .hold-bar'),
			title: () => T('The hold: LT and slots'),
			text: () => T('The gauge weighs the hold against the hull’s limit and counts its slots. Every [Level 5] good and up takes a slot of its own: {used} of {slots} here.', { used: F(holdSlotsUsed()), slots: F(hullSlots()) })
				+ ' ' + T('A tick on the packing list loads it for real, and never more than fits.'),
			side: 'bottom',
			before: () => {
				this.atSea(false);
				goToTab('barter');
				onStep('load');
			},
			again: () => onStep('load')
		});
		add('clock', {
			find: () => shown('#screen .cockpit-clock .sail-timer.running', '#screen .hold-bar-timer'),
			title: () => T('The sailing clock'),
			text: () => T('Here the example run has cast off. The clock counts down to the next island and waits there until you press <b>Traded</b>. It chimes when the ship should be in; the chips beside it choose how.'),
			side: 'bottom',
			// Cast off from the route the Load step laid; if it has not laid
			// one yet, the Load step is drawn first and the run cast off on
			// the next look.
			before: () => {
				goToTab('barter');
				onStep(this.atSea(true) ? 'sail' : 'load');
			},
			again: () => onStep(this.atSea(true) ? 'sail' : 'load'),
			leave: () => this.atSea(false)
		});
		add('map', {
			find: () => shown('#screen .map-tabs'),
			title: () => T('The list, drawn on the sea'),
			text: () => T('<b>Who has it</b> pins the barterers holding what you are short of; <b>Route</b> plots the loop at your ship\'s real speed; <b>Draw</b> sketches on the water; <b>Hunt</b> shows the grounds; <b>Today</b> ticks off where you have been.'),
			side: 'right',
			// The panel is out on a desk and folded on a phone, where it
			// would cover the chart: opened for the step, folded again after.
			before: () => {
				goToTab('map');
				this.unfoldMapPanel();
			},
			again: () => this.unfoldMapPanel(),
			leave: () => this.foldMapPanel()
		});
		add('ship', {
			find: () => shown('#screen .ship-card-main'),
			title: () => T('Your ship'),
			text: () => whereOnPhone('crew') + T('The hull in the game\'s own numbers, its four parts and crystal, and the crew — read off a screenshot of Manage Sailors and seated for what the boat is for.'),
			side: 'bottom',
			before: () => goToTab('crew')
		});
		add('quests', {
			find: () => shown('#screen .quest .quest-main', '#screen .quest', '#screen .quest-clocks'),
			title: () => T('What the sea hands out free'),
			text: () => whereOnPhone('quests') + T('Every quest that pays in a ship material, the ones your plan wants marked. Tick several and <b>Finish</b> records them as one change; the ticks wear off at the reset.'),
			side: 'bottom',
			before: () => goToTab('quests')
		});
		add('menu', {
			// The masthead on both: a desk's spells out Help and Menu, a
			// phone's keeps the flag, the account and ⋯ for the menu.
			find: () => shown('#masthead-actions'),
			title: () => T('Undo, the language and the menu'),
			text: () => (phone()
				? T('Every change can be undone, and the flag picks the language. <b>⋯</b>, or the last seat of the bar, opens the <b>Menu</b>: every section, Help’s film, Find, Export and Import, the theme.')
				: T('Every change can be undone, and the flag picks the language. <b>Help</b> plays a film of the whole app; <b>Menu</b> (M) holds the rest: Find (Ctrl+K), Export and Import, the theme.'))
				+ (accounts ? ' ' + (harbour
					? T('<b>Sign in</b> keeps one save on every device and puts you on the <b>Community</b> boards — only numbers are shared.')
					: T('<b>Sign in</b> keeps one save on every device.')) : ''),
			side: 'bottom',
			before: () => goToTab('plan')
		});
		return list;
	}

	/** The chart's panel out, if it is folded; remembered, to fold again. */
	unfoldMapPanel() {
		const pill = shown('#screen .map-side-pill');
		if (!pill || !this.was) return;
		pill.click();
		this.was.panelOpened = true;
	}

	/** The chart's panel folded again, if the tour was what opened it. */
	foldMapPanel() {
		if (!this.was || !this.was.panelOpened) return;
		const close = shown('#screen .map-side [data-act="map-panel"]');
		if (close) close.click();
		this.was.panelOpened = false;
	}

	/**
	 * Everything the tour moved, put back: the chart's panel, the Barter
	 * tab's memory, the sailor's own data, the clock, the tab and the
	 * scroll it started on. The panel goes first, while the example is
	 * still in: a press on the chart writes its view, and that write must
	 * land on the example and not on the real save. The Barter tab's
	 * memory goes back before the save does, so the redraw the save's
	 * return sets off reads the sailor's own run and not the example's.
	 */
	finish() {
		const was = this.was;
		this.running = false;
		this.driver = null;
		clearTimeout(this.restage);
		clearInterval(this.watchdog);
		if (this.stopWatching) this.stopWatching();
		this.stopWatching = null;
		if (this.unhook) this.unhook();
		this.unhook = null;
		const left = this.list[this.at];
		if (left && left.leave) left.leave();
		this.foldMapPanel();
		if (was && was.barter) was.barter();
		this.restoreRealData();
		this.sea = false;
		this.run = null;
		hushTimer(false);
		if (was && was.view) goToTab(was.view);
		if (was) window.scrollTo(0, was.scroll || 0);
		this.was = null;
		try {
			localStorage.setItem(DONE_KEY, 'true');
		} catch {
			/* ignore */
		}
	}

	/**
	 * The example at the wharf, or cast off: swapped in when it changes.
	 * False when it cannot be cast off yet, the Load step not having laid
	 * its route; it is cast off once, and the same run sailed after that.
	 */
	atSea(on) {
		if (!this.realData) return false;
		if (this.sea === on) return true;
		if (on && !this.run) this.run = castOff();
		if (on && !this.run) return false;
		this.sea = on;
		// The tab reads a view again only when no write of its own is owed,
		// so the one owed is made first (to the example; nothing is saved).
		flushView();
		store.applyTransient(example(on ? this.run : null));
		return true;
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
		this.driver = this.create();
		if (!this.driver) {
			console.warn('[tour] Driver.js is not available yet');
			return false;
		}
		this.was = {
			view: document.body.dataset.view || 'plan',
			scroll: window.scrollY,
			barter: keepBarter(),
			panelOpened: false
		};
		// The route on the tab is the sailor's until the example's is laid;
		// see castOff().
		barterView.shownPlan = null;
		this.run = null;

		// Swap in the example, keeping the real data to hand back later.
		// The clock is hushed first: from here it reads the example's run,
		// which must not chime or reach the server as the sailor's.
		hushTimer(true);
		this.realData = store.capture();
		this.sea = false;
		store.applyTransient(example(false));

		// A repaint can throw away the node the highlight is on; see check().
		this.stopWatching = store.subscribe(() => {
			if (!this.running || !this.driver) return;
			clearTimeout(this.restage);
			this.restage = setTimeout(() => this.check(), 60);
		});
		// Not every repaint goes through the store -- the barter table
		// arriving, a screen drawn lazily -- so the highlight is also
		// looked at twice a second. Re-measuring a node still there is
		// invisible; only a lost one is shown again.
		this.watchdog = setInterval(() => this.check(), 500);

		// A turn of the phone, a window dragged narrower.
		let resized = null;
		const onResize = () => {
			clearTimeout(resized);
			resized = setTimeout(() => this.relayout(), 150);
		};
		// While the tour is up the keyboard is the tour's: Find would open
		// a palette behind the overlay, and Undo would step back a change
		// to the example nobody can see.
		//
		// The arrows and Escape are answered here rather than by Driver.js,
		// which ignores them while its stage is still sliding -- and a
		// stage slides on animation frames, which a tab in the background
		// does not get, so a key could be lost for good.
		const onKey = evt => {
			if (!this.running || !this.driver) return;
			if ((evt.ctrlKey || evt.metaKey) && ['k', 'z', 'y'].includes(String(evt.key).toLowerCase())) {
				evt.preventDefault();
				evt.stopPropagation();
				return;
			}
			if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
			const move = { ArrowRight: 1, ArrowLeft: -1 }[evt.key];
			if (move) {
				evt.preventDefault();
				evt.stopPropagation();
				this.hop(move);
			} else if (evt.key === 'Escape') {
				evt.preventDefault();
				evt.stopPropagation();
				this.driver.destroy();
			}
		};
		window.addEventListener('resize', onResize);
		document.addEventListener('keydown', onKey, true);
		this.unhook = () => {
			clearTimeout(resized);
			window.removeEventListener('resize', onResize);
			document.removeEventListener('keydown', onKey, true);
		};

		this.phone = isPhone();
		this.list = this.steps();
		this.dress();
		this.running = true;
		this.driver.setSteps(this.list);
		await this.ready(0);
		if (!this.running || !this.driver) return true;
		this.driver.drive(0);
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
