// Guided tour, built on Driver.js.
//
// The tour walks the five tabs in the order someone would actually use
// them: see the plan, queue a build, record what you own, craft, then go
// shopping. Each step switches tab by clicking the real tab button, so
// there is no second copy of the navigation logic to keep in sync.

const DONE_KEY = 'bdo_ship_upgrade-tour_completed';
const AUTO_KEY = 'bdo_ship_upgrade-auto_tour_enabled';

/** Click a tab and give the render a moment to land. */
function goToTab(id) {
	const btn = document.querySelector(`[data-act="view"][data-id="${id}"]`);
	if (btn) btn.click();
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
					description: 'This tracker keeps a single record of what you own. Every build draws from it, so the same 100 planks are never promised to two ships at once. Everything is saved in your browser.',
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
				element: '.row-meter',
				popover: {
					title: 'Reading a material',
					description: 'The bar splits three ways — <span style="color:#4ec9ae">green</span> is covered from stock, <span style="color:#3a89c9">blue</span> is still to craft, <span style="color:#e87a6d">red</span> is missing. The line underneath says which build reserved it, and through which recipe.',
					side: 'top'
				}
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
					description: 'Every recipe you have the materials for, with what it will consume. Enhancement lives below: ship parts keep their level when an attempt fails, so record Succeeded or Failed and the stones are counted either way.',
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

	startTour() {
		if (this.running) return;
		const steps = this.steps();
		this.driver = this.create(steps);
		if (!this.driver) {
			console.warn('[tour] Driver.js is not available yet');
			return;
		}
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
