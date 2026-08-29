// The shell. Renders whichever screen is up, owns the event wiring, and
// starts everything -- while every screen lives in its own module and
// every piece of shared state in ui-state.js. Nothing here holds its
// own copy of anything: each screen is a projection of state.js through
// planner.js, rebuilt on every change.

import { shipGroups } from './ships.js';
import { tableFor } from './enhancement.js';
import { iconLoader } from './icon-loader.js';
import RealisticWaterRipples from './realistic-water-ripples.js';
import { esc, F, parseAmount } from './fmt.js';
import * as store from './state.js';
import { initSync, openAccount } from './sync.js';
import { maxCraftable, craftDelta, enhanceStep, parseEnhanced } from './planner.js';
import {
	view, selected, recipes, barterData, snapshot,
	setView, setQuery, setPlanFilter, setInvFilter, setSelected, setBarterData,
	recompute, readyCrafts
} from './ui-state.js';
import { toast, openDialog, closeDialog, dismissDialog } from './dialogs.js';
import { allItems } from './ui-bits.js';
import { paintPouch, measurePouch } from './pouch.js';
import { hidePeek, wirePeek } from './peek.js';
import { openGuide } from './guide.js';
import { renderPlan } from './screen-plan.js';
import { renderBuilds, openBuildPicker, askRoute } from './screen-builds.js';
import { renderInventory } from './screen-inventory.js';
import { renderTree, pickTreeTarget, folded, setTreeTarget, collapseAll } from './screen-tree.js';
import { renderWorkshop } from './screen-workshop.js';
import { renderGet, shoppingText } from './screen-get.js';
import {
	renderMap, paintMap, wireMap, setMapPick, mapZoomStep, mapCentreOn,
	mapShowItem, mapFit, setMapMode, toggleMapPanel, toggleMapStop,
	useSuggestedRoute, reverseMapRoute, clearMapRoute, toggleMapDone, closeMapTip,
	openMapPicker, mapStep, mapStepTo, mapFollowToggle, setMapStart, setMapReturn, mapPortClick,
	reviveMapRoute, setMapKind
} from './screen-map.js';

const TABS = [
	{ id: 'plan', label: 'Plan' },
	{ id: 'builds', label: 'Builds' },
	{ id: 'inventory', label: 'Inventory' },
	{ id: 'tree', label: 'Tree' },
	{ id: 'workshop', label: 'Workshop' },
	{ id: 'get', label: 'To Get' },
	{ id: 'map', label: 'Map' }
];

let water = null;


export function render() {
	recompute();

	const counts = {
		builds: store.getTargets().length,
		inventory: Object.keys(store.getAllStock()).length,
		workshop: readyCrafts().length,
		get: Object.keys(snapshot.missing).length
	};

	// A tablist for the keyboard: the active tab is the one Tab stop,
	// and the arrow keys walk the rest (wired in wire()).
	document.getElementById('tabs').innerHTML = TABS.map(t => `
		<button class="tab ${view === t.id ? 'active' : ''}" role="tab"
			aria-selected="${view === t.id}" tabindex="${view === t.id ? 0 : -1}"
			data-act="view" data-id="${t.id}">
			${t.label}${counts[t.id] ? `<span class="tab-count">${counts[t.id]}</span>` : ''}
		</button>`).join('');

	// Only fade the tab row when there is in fact something past the edge.
	const tabBar = document.getElementById('tabs');
	tabBar.classList.toggle('scrolls', tabBar.scrollWidth > tabBar.clientWidth + 1);

	const undoBtn = document.getElementById('undo-btn');
	if (undoBtn) undoBtn.disabled = !store.canUndo();
	const redoBtn = document.getElementById('redo-btn');
	if (redoBtn) redoBtn.disabled = !store.canRedo();

	paintPouch();

	hidePeek();

	const root = document.getElementById('screen');
	const focus = captureFocus(root);
	root.className = 'screen';
	if (view === 'plan') root.innerHTML = renderPlan();
	else if (view === 'builds') root.innerHTML = renderBuilds();
	else if (view === 'inventory') root.innerHTML = renderInventory();
	else if (view === 'tree') root.innerHTML = renderTree();
	else if (view === 'workshop') root.innerHTML = renderWorkshop();
	else if (view === 'map') root.innerHTML = renderMap();
	else root.innerHTML = renderGet();
	restoreFocus(root, focus);
	// The map draws itself after the shell exists, since it has to
	// measure the box it was given before it knows which tiles to ask
	// for.
	if (view === 'map') paintMap();
}

/**
 * A render replaces the whole screen, which would throw away the field
 * someone is typing in. Remember which one it was -- by what it edits,
 * not by node identity -- and put the caret back where it was.
 */
function captureFocus(root) {
	const el = document.activeElement;
	if (!el || el.tagName !== 'INPUT' || !root.contains(el) || !el.dataset.act) return null;
	const parts = [`[data-act="${el.dataset.act}"]`];
	if (el.dataset.item) parts.push(`[data-item="${el.dataset.item}"]`);
	if (el.dataset.target) parts.push(`[data-target="${el.dataset.target}"]`);
	return { sel: parts.join(''), start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(root, focus) {
	if (!focus) return;
	let next;
	try {
		next = root.querySelector(focus.sel);
	} catch {
		return;   // an item name that will not survive a selector
	}
	if (!next) return;
	next.focus();
	try {
		next.setSelectionRange(focus.start, focus.end);
	} catch {
		/* not a field with a caret */
	}
}

function showView(id) {
	setView(id);
	setQuery('');
	store.setSetting('view', id);
	render();
}

/**
 * Pull in the barter dataset once, in the background. It is large, so it
 * never blocks a paint -- and loading it up front rather than on entering
 * "To Get" avoids a second render swapping the view out from under you.
 *
 * Fetched as JSON rather than imported as a module: it is a megabyte of
 * pure data, and JSON.parse takes it off the JavaScript compiler's plate.
 * What the numbers mean, and which patch notes they were read against,
 * is documented where the dataset is read -- barter.js.
 */
async function loadBarter() {
	if (barterData) return;
	try {
		const res = await fetch('js/all_barter.json');
		if (!res.ok) throw new Error(String(res.status));
		setBarterData(await res.json());
	} catch {
		setBarterData([]);
	}
	// Both screens are built out of this data and both are showing a
	// placeholder until it lands, so both need the second paint.
	if (view === 'get' || view === 'map') render();
}


function waterOn() {
	if (water) {
		water.show();
		water.play();
		return;
	}
	try {
		water = RealisticWaterRipples.create(document.body, {
			resolution: 512,
			dropRadius: 30,
			perturbance: 0.06,
			interactive: true,
			initiallyVisible: true,
			initiallyRunning: true
		});
		if (!water.init()) water = null;
	} catch {
		water = null;
	}
}

function waterOff() {
	if (!water) return;
	try {
		water.destroy();
	} catch {
		/* ignore */
	}
	water = null;
}

function syncWaterButton() {
	const btn = document.getElementById('water-btn');
	if (!btn) return;
	const on = store.getSetting('water', false) === true;
	btn.textContent = `≈ Water ${on ? 'on' : 'off'}`;
	btn.classList.toggle('on', on);
}

function toggleWater() {
	const next = !(store.getSetting('water', false) === true);
	store.setSetting('water', next);
	if (next) waterOn();
	else waterOff();
	syncWaterButton();
}


function targetIdFrom(el) {
	const row = el.closest('[data-target]');
	return row ? row.getAttribute('data-target') : null;
}

function wire() {
	document.addEventListener('click', async evt => {
		// A link out to BDOCodex is the browser's business, not ours --
		// it must not also select a tile or dismiss a panel on the way.
		if (evt.target.closest('a[data-codex]')) return;

		const el = evt.target.closest('[data-act]');
		if (!el) {
			// Clicking past the tiles puts the detail panel away. Reading
			// the panel itself is not clicking past anything, so a click
			// inside it leaves the selection alone.
			if (view === 'inventory' && selected && !evt.target.closest('.detail')) {
				setSelected(null);
				render();
			}
			return;
		}
		const act = el.getAttribute('data-act');

		// Picking something out of the phone menu puts it away again.
		if (act !== 'menu' && el.closest('.masthead-actions.open')) {
			document.getElementById('masthead-actions').classList.remove('open');
			const burger = document.querySelector('[data-act="menu"]');
			if (burger) burger.setAttribute('aria-expanded', 'false');
		}

		switch (act) {
			case 'view': showView(el.dataset.id); return;
			case 'undo': {
				const label = store.undo();
				toast(label ? `Reverted: ${label}` : 'Nothing to undo');
				return;
			}
			case 'redo': {
				const label = store.redo();
				toast(label ? `Redone: ${label}` : 'Nothing to redo');
				return;
			}
			case 'add-build': return openBuildPicker();
			case 'export': return doExport();
			case 'import': return doImport();
			case 'water': return toggleWater();
			case 'tour': return startTour();
			case 'help': return openHelp();
			case 'guide': return openGuide();
			case 'signin':
			case 'account': return openAccount();
			case 'menu': {
				// The header's buttons do not fit a phone, so below a certain
				// width they live behind this and are shown on demand.
				const bar = document.getElementById('masthead-actions');
				const open = bar.classList.toggle('open');
				el.setAttribute('aria-expanded', String(open));
				return;
			}
			case 'map-zoom': mapZoomStep(Number(el.dataset.step)); return;
			case 'map-fit': mapFit(); return;
			case 'map-pin':
			case 'map-row': mapCentreOn(Number(el.dataset.npc)); return;
			case 'map-mode': setMapMode(el.dataset.id); return;
			case 'map-panel': toggleMapPanel(); return;
			case 'map-stop': toggleMapStop(Number(el.dataset.npc)); return;
			case 'map-route-use': useSuggestedRoute(); return;
			case 'map-route-revive': reviveMapRoute(); return render();
			case 'map-route-reverse': reverseMapRoute(); return;
			case 'map-route-clear': clearMapRoute(); return;
			case 'map-done': toggleMapDone(Number(el.dataset.npc)); return;
			case 'map-tip-close': closeMapTip(); return;
			case 'map-pick-open': return openMapPicker();
			case 'map-kind': setMapKind(el.dataset.id); return;
			case 'map-pick-set': setMapPick(el.dataset.item || null); closeDialog(); return render();
			case 'map-step-prev': mapStep(-1); return;
			case 'map-step-next': mapStep(1); return;
			case 'map-step': mapStepTo(Number(el.dataset.i)); return;
			case 'map-follow': mapFollowToggle(); return;
			case 'map-port': mapPortClick(Number(el.dataset.port)); return;
			case 'goto-map': mapShowItem(el.dataset.item); showView('map'); return;
			case 'plan-filter': setPlanFilter(el.dataset.id); return render();
			case 'tree-pick': return pickTreeTarget();
			case 'tree-target': setTreeTarget(el.dataset.item); closeDialog(); return render();
			case 'tree-fold': {
				const id = el.dataset.id;
				if (folded.has(id)) folded.delete(id); else folded.add(id);
				return render();
			}
			case 'tree-all': folded.clear(); return render();
			case 'tree-none': collapseAll(); return render();
			case 'inv-filter': setInvFilter(el.dataset.id); return render();
			case 'select': setSelected(el.dataset.item); return render();
			case 'deselect': setSelected(null); return render();
			case 'strategy':
				if (selected) store.setStrategy(selected, el.dataset.mode);
				return;
			case 'ask-route': return askRoute(el.dataset.item, {
				onPick: name => toast(
					`${el.dataset.item} — ${name === 'improved' ? 'by way of the Improved hull' : 'straight from the base hull'}`,
					true
				)
			});
			case 'bump':
				if (selected) store.addStock(selected, Number(el.dataset.delta));
				return;
			case 'own':
				store.addStock(el.dataset.item, Number(el.dataset.delta));
				return;
			case 'move-level': {
				const from = el.dataset.from;
				const to = el.dataset.to;
				store.applyDelta({ [from]: -1, [to]: 1 }, 'level',
					`${parseEnhanced(to).base} recorded at +${parseEnhanced(to).level}`);
				setSelected(to);
				toast(`Recorded at +${parseEnhanced(to).level} — no stones spent`, true);
				return;
			}
			case 'copy':
				try {
					await navigator.clipboard.writeText(shoppingText());
					toast('Shortfall list copied');
				} catch {
					toast('Could not reach the clipboard');
				}
				return;
			case 'craft': {
				const item = el.dataset.item;
				const field = el.dataset.times === 'field'
					? el.closest('.craft-actions').querySelector('.craft-n')
					: null;
				const asked = field ? parseAmount(field.value) : Number(el.dataset.times);
				const want = Math.max(1, asked || 1);
				const times = Math.min(want, maxCraftable(item, store.getAllStock(), recipes));
				if (times < 1) return toast('Not enough materials for that');
				store.applyDelta(craftDelta(item, times, recipes), 'craft', `Crafted ${times} × ${item}`);
				toast(`Crafted ${times} × ${item}`, true);
				return;
			}
			case 'enhance': {
				const row = el.closest('[data-base]');
				const base = row.getAttribute('data-base');
				const level = Number(row.getAttribute('data-level'));
				const step = enhanceStep(base, level);
				if (!step) return;
				const ok = el.dataset.result === 'success';
				store.applyDelta(
					ok ? step.onSuccess : step.onFailure,
					'enhance',
					ok ? `${base} reached +${level}` : `Failed attempt at +${level} ${base}`
				);
				// Only the steps that actually spend Cron are being held by
				// it; +1 costs none, and has nothing to fall to anyway.
				const held = (tableFor(base) || {}).keepsLevel !== false || !step.stones['Cron Stone']
					? 'kept its level'
					: 'held its level on the Cron Stones';
				toast(ok ? `${base} is now +${level}` : `Materials spent — ${base} ${held}`, true);
				return;
			}
			case 'move': {
				const id = targetIdFrom(el);
				if (id) store.moveTarget(id, Number(el.dataset.dir));
				return;
			}
			case 'qty': {
				const id = targetIdFrom(el);
				const t = id && store.getTarget(id);
				if (t) store.setTargetQty(id, t.qty + Number(el.dataset.delta));
				return;
			}
			case 'pause': {
				const id = targetIdFrom(el);
				if (id) store.toggleTarget(id);
				return;
			}
			case 'remove': {
				const id = targetIdFrom(el);
				if (id) store.removeTarget(id);
				return;
			}
			default:
		}
	});

	// Every typed-in quantity lands here: stock on the Plan and in the
	// inventory detail, the pouch, and how many of a build you want.
	document.addEventListener('change', evt => {
		// The Value Pack is a tick rather than a number, so it lands first
		// and on its own.
		const vp = evt.target.closest('[data-act="value-pack"]');
		if (vp) return store.setProfile('valuePack', vp.checked);

		const cr = evt.target.closest('[data-act="crew-discount"]');
		if (cr) return store.setProfile('crew', cr.checked);

		// The level is a name, not a number, so it lands before the
		// numeric parse below rather than going through it.
		const lvl = evt.target.closest('[data-act="barter-level"]');
		if (lvl) return store.setProfile('level', lvl.value || null);

		const ms = evt.target.closest('[data-act="map-start"]');
		if (ms) return setMapStart(Number(ms.value));

		const mr = evt.target.closest('[data-act="map-return"]');
		if (mr) return setMapReturn(mr.checked);

		const el = evt.target.closest(
			'[data-act="own-set"], [data-act="purse"], [data-act="target-qty"],'
			+ ' [data-act="barter-count"], [data-act="vouchers"], [data-act="parley-held"]');
		if (!el) return;
		const n = parseAmount(el.value);
		if (n === null) return render();   // gibberish: put the stored value back
		if (el.dataset.act === 'target-qty') store.setTargetQty(el.dataset.target, n);
		else if (el.dataset.act === 'barter-count') store.setProfile('barterCount', n);
		else if (el.dataset.act === 'vouchers') store.setProfile('vouchers', n);
		else if (el.dataset.act === 'parley-held') store.setProfile('parleyHeld', n);
		else store.setStock(el.dataset.item, n);
	});

	// The pouch holds its ground while you type in it; once focus leaves it
	// entirely, catch it up with whatever the change already recorded.
	wirePeek();
	wireMap();

	document.addEventListener('keydown', evt => {
		const dialog = document.getElementById('dialog');

		// Ctrl+Z / Ctrl+Shift+Z (and Ctrl+Y), everywhere except inside a
		// field -- there the browser's own text undo has first claim.
		if ((evt.ctrlKey || evt.metaKey) && !evt.altKey
			&& (evt.key.toLowerCase() === 'z' || evt.key.toLowerCase() === 'y')
			&& !evt.target.closest('input, textarea, select')) {
			evt.preventDefault();
			const redoing = evt.key.toLowerCase() === 'y' || evt.shiftKey;
			const label = redoing ? store.redo() : store.undo();
			toast(label
				? `${redoing ? 'Redone' : 'Reverted'}: ${label}`
				: `Nothing to ${redoing ? 'redo' : 'undo'}`);
			return;
		}

		// Escape peels the layers in order: the dialog first, then the
		// inventory detail panel.
		if (evt.key === 'Escape') {
			if (!dialog.hidden) {
				evt.preventDefault();
				dismissDialog();
			} else if (selected) {
				setSelected(null);
				render();
			}
			return;
		}

		// While a dialog is up it is the whole interface, so Tab cycles
		// inside it rather than wandering the page behind the veil.
		if (evt.key === 'Tab' && !dialog.hidden) {
			const focusable = [...dialog.querySelectorAll(
				'a[href], input, select, textarea, button:not([disabled]), video[controls]')]
				.filter(el => el.offsetParent !== null);
			if (!focusable.length) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const outside = !dialog.contains(document.activeElement);
			if (evt.shiftKey && (document.activeElement === first || outside)) {
				evt.preventDefault();
				last.focus();
			} else if (!evt.shiftKey && (document.activeElement === last || outside)) {
				evt.preventDefault();
				first.focus();
			}
		}
	});

	// The tabs are a tablist: arrows move through it, Home and End jump.
	document.getElementById('tabs').addEventListener('keydown', evt => {
		const step = { ArrowRight: 1, ArrowLeft: -1 }[evt.key];
		if (step === undefined && evt.key !== 'Home' && evt.key !== 'End') return;
		evt.preventDefault();
		const at = TABS.findIndex(t => t.id === view);
		const to = evt.key === 'Home' ? 0
			: evt.key === 'End' ? TABS.length - 1
			: (at + step + TABS.length) % TABS.length;
		showView(TABS[to].id);
		const btn = document.querySelector('.tab.active');
		if (btn) btn.focus();
	});

	// Landing in a quantity field selects what is there, so typing a new
	// number replaces it instead of appending to it.
	document.addEventListener('focusin', evt => {
		if (evt.target.classList && evt.target.classList.contains('amt')) evt.target.select();
	});

	window.addEventListener('resize', measurePouch);

	document.addEventListener('focusout', evt => {
		const host = document.getElementById('pouch');
		if (!host || !host.contains(evt.target)) return;
		if (host.contains(evt.relatedTarget)) return;
		paintPouch();
	});

	// Debounced: a render rebuilds the whole screen and re-runs the
	// planner, which is far too much work to do between two keystrokes
	// of "brilliant". The caret survives because render() restores it.
	let queryTimer = null;
	document.addEventListener('input', evt => {
		const el = evt.target.closest('[data-act="query"]');
		if (!el) return;
		setQuery(el.value);
		clearTimeout(queryTimer);
		queryTimer = setTimeout(render, 120);
	});

	// The water is pure decoration, and decoration has no business
	// burning battery in a tab nobody is looking at.
	document.addEventListener('visibilitychange', () => {
		if (!water) return;
		if (document.visibilityState === 'hidden') water.pause();
		else water.play();
	});
}

function doExport() {
	const blob = new Blob([store.exportJSON()], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'ship-tracker.json';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doImport() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'application/json,.json';
	input.addEventListener('change', async () => {
		const file = input.files && input.files[0];
		if (!file) return;
		try {
			const result = store.importJSON(await file.text());
			toast(`Imported ${result.items} items and ${result.targets} builds`);
		} catch (err) {
			toast(err.message);
		}
	});
	input.click();
}

function offerLegacyImport() {
	if (store.hasImportedLegacy()) return;

	const shipNames = shipGroups.flatMap(g => g.items);
	const legacy = store.readLegacyData(shipNames, allItems());
	if (!legacy || !Object.keys(legacy.stock).length) {
		store.markLegacyImported();
		return;
	}

	const list = Object.entries(legacy.stock)
		.sort((a, b) => b[1] - a[1])
		.map(([item, qty]) => `<div class="dialog-row"><span>${esc(item)}</span><span class="n">${F(qty)}</span></div>`)
		.join('');

	const host = openDialog(`
		<h2>Bring your progress across?</h2>
		<p>Your old per-ship counts can become one shared inventory. The same material was counted separately for each ship, so the highest count found is used rather than the sum — this may under-count, and you can correct anything afterwards in Inventory.</p>
		<div class="dialog-list">${list}</div>
		<p>${legacy.keys} saved values across ${legacy.ships.length} ships. Your old data stays untouched either way.</p>
		<div class="dialog-actions">
			<button class="act quiet" data-skip>Start fresh</button>
			<button class="act" data-accept>Import it</button>
		</div>
	`);

	host.querySelector('[data-skip]').addEventListener('click', () => {
		store.markLegacyImported();
		closeDialog();
		render();
	});
	host.querySelector('[data-accept]').addEventListener('click', () => {
		store.applyLegacyImport(legacy.stock, legacy.ships);
		closeDialog();
		toast(`Imported ${Object.keys(legacy.stock).length} items`);
	});
}

/**
 * The walkthrough, as a film.
 *
 * The guided tour points at things on your own screen, which is the right
 * way to learn a control you are looking at. This is for the other
 * question -- "what is this for" -- answered once, end to end, without
 * having to do anything. It is the real app, driven and captioned, with a
 * narrower cut for a phone.
 */
function openHelp() {
	const phone = window.matchMedia('(max-width: 720px)').matches;
	const file = phone ? 'walkthrough-phone.mp4' : 'walkthrough.mp4';
	const host = openDialog(`
		<h2>How this works</h2>
		<p>Two minutes, end to end: queue a build, choose how to get there, record what you gathered, make something, see what it will really cost, and take the list shopping.</p>
		<video class="help-film" src="docs/media/${file}" controls autoplay muted playsinline loop></video>
		<div class="dialog-actions">
			<button class="act quiet" data-close>Close</button>
			<button class="act" data-act="tour">Walk me through my own screen</button>
		</div>
	`);
	// The captions are the narration, so it starts muted and stays that
	// way; unmuting an autoplaying video is a good way to be hated.
	const film = host.querySelector('video');
	if (film) film.play().catch(() => { /* a browser that would rather not */ });
	return host;
}

async function startTour() {
	// Whatever asked for it -- the Help film, most likely -- gets out of
	// the way first. A tour that highlights the page from behind a dialog
	// is worse than no tour.
	closeDialog();
	try {
		const { guidedTour } = await import('./guided-tour.js');
		guidedTour.startTour('main');
	} catch (err) {
		console.warn('[ui] tour unavailable:', err);
	}
}

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */

export async function init() {
	store.init();

	const saved = store.getSetting('view');
	if (saved && TABS.some(t => t.id === saved)) setView(saved);

	wire();
	store.subscribe(() => render());
	render();

	loadBarter();

	if (store.getSetting('water', false) === true) waterOn();
	syncWaterButton();

	offerLegacyImport();

	// First-run tour, once the screens are on the page.
	try {
		const { guidedTour } = await import('./guided-tour.js');
		guidedTour.checkAndShowInitialTour();
	} catch {
		/* the tour is optional */
	}

	// Icon metadata arrives asynchronously; repaint once it is ready.
	try {
		await iconLoader.init();
		render();
	} catch {
		/* icons fall back to the app mark */
	}

	// Sync last, and never blocking: on a deployment without it this is
	// one request that comes back "no" and nothing more happens.
	initSync({ toast, openDialog, closeDialog, rerender: render })
		.catch(err => console.warn('[ui] sync unavailable:', err));
}
