// Guided tour, built on Driver.js.
//
// The tour walks the five tabs in the order someone would actually use
// them: see the plan, queue a build, record what you own, craft, then go
// shopping. Each step switches tab by clicking the real tab button, so
// there is no second copy of the navigation logic to keep in sync.

import * as store from './state.js';

const DONE_KEY = 'bdo_ship_upgrade-tour_completed';
const AUTO_KEY = 'bdo_ship_upgrade-auto_tour_enabled';

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
		'Crow Coin': 3000
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

class GuidedTour {
	constructor() {
		this.driver = null;
		this.running = false;
	}

	resolveDriver() {
		if (typeof window.driver === 'function') return window.driver;
		if (window.driver && typeof window.driver.js?.driver === 'function') return window.driver.js.driver;
		if (window.driver && typeof window.driver.driver === 'function') return window.driver.driver;
		return null;
	}

	create(steps) {
		const driverFn = this.resolveDriver();
		if (!driverFn) return null;

		// Driver.js resolves a step's element the moment it moves to it, so
		// the tab has to change *before* the move, not from inside the
		// step's own highlight hook.
		const hop = delta => {
			const at = this.driver ? this.driver.getActiveIndex() : 0;
			const next = steps[at + delta];
			if (next && next.before) next.before();
			if (delta > 0) this.driver.moveNext();
			else this.driver.movePrevious();
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
				element: '#tabs',
				popover: {
					title: 'The five views',
					description: '<b>Plan</b> is what every build needs. <b>Builds</b> is the queue and its priority. <b>Inventory</b> is what you own. <b>Workshop</b> is where you craft and enhance. <b>To Get</b> is the shopping list.',
					side: 'bottom'
				}
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
				element: '.purse',
				popover: {
					title: 'Crow Coins and silver',
					description: 'Type in what you are carrying and the totals above turn into what you are actually <b>short</b> — not just what the shopping list costs.',
					side: 'bottom'
				},
				before: () => goToTab('plan')
			},
			{
				element: '.queue-head',
				popover: {
					title: 'Your build queue',
					description: 'Add any ship, part or material as a build. Order matters: when stock is short, the build nearest the top gets it first. Use ▲▼ to re-order, ⏸ to park one without losing it.',
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
					description: 'Pick a tile and this panel shows who reserved it and through which recipe, where to buy it, and — when an item can be both made and bought — lets you choose which.',
					side: 'left'
				}
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
					description: 'Every part you own that can go higher is listed — whether or not a build is waiting on it — with the stones the next attempt costs.<br><br>Ship parts keep their level when an attempt fails, so record <b>Succeeded</b> or <b>Failed</b> and the stones come off your stock either way.',
					side: 'top'
				},
				before: () => goToTab('workshop')
			},
			{
				element: '.summary',
				popover: {
					title: 'The shopping list',
					description: 'Everything still missing, grouped by how you actually get it — Crow Coins, Falasi silver, barter, worker nodes or hunting — with running totals you can copy out.',
					side: 'bottom'
				},
				before: () => goToTab('get')
			},
			{
				element: '.masthead-actions',
				popover: {
					title: 'Undo, and your data',
					description: 'Every change can be undone. Export writes a JSON backup you can import on another machine — nothing leaves your browser otherwise. Water toggles the background effect.',
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

	startTour() {
		if (this.running) return;
		const steps = this.steps();
		this.driver = this.create(steps);
		if (!this.driver) {
			console.warn('[tour] Driver.js is not available yet');
			return;
		}

		// Swap in the example, keeping the real data to hand back later.
		this.realData = store.capture();
		store.applyTransient(DEMO);

		goToTab('plan');
		this.running = true;
		this.driver.setSteps(steps);
		this.driver.drive();
	}

	/** Show the tour once, the first time someone opens the app. */
	checkAndShowInitialTour() {
		let done = 'true';
		let auto = 'true';
		try {
			done = localStorage.getItem(DONE_KEY);
			auto = localStorage.getItem(AUTO_KEY);
		} catch {
			return;
		}
		if (done === 'true' || auto === 'false') return;
		setTimeout(() => this.startTour(), 900);
	}

	reset() {
		try {
			localStorage.removeItem(DONE_KEY);
		} catch {
			/* ignore */
		}
	}
}

export const guidedTour = new GuidedTour();
