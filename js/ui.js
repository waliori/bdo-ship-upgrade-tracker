// The shell. Renders whichever screen is up, owns the event wiring, and
// starts everything -- while every screen lives in its own module and
// every piece of shared state in ui-state.js. Nothing here holds its
// own copy of anything: each screen is a projection of state.js through
// planner.js, rebuilt on every change.

import { shipGroups } from './ships.js';
import { routeInfo } from './recipes.js';
import { tableFor } from './enhancement.js';
import { iconLoader } from './icon-loader.js';
import RealisticWaterRipples from './realistic-water-ripples.js';
import { esc, F, parseAmount } from './fmt.js';
import * as store from './state.js';
import { initSync, openAccount } from './sync.js';
import { maxCraftable, craftDelta, enhanceStep, parseEnhanced } from './planner.js';
import {
	view, selected, recipes, barterData, snapshot, query,
	setView, setQuery, setPlanFilter, setInvFilter, setSelected, setBarterData,
	recompute, readyCrafts, CROW_COIN, SILVER, setSort
} from './ui-state.js';
import { toast, openDialog, closeDialog, dismissDialog } from './dialogs.js';
import { allItems, CODEX_LANGS } from './ui-bits.js';
import { encodeShare, decodeShare, shareLink } from './share.js';
import { massProcess } from './vendor_items.js';
import { loadMarket, onMarket, setRegion as setMarketRegion } from './market.js';
import { paintPouch, measurePouch } from './pouch.js';
import { hidePeek, wirePeek } from './peek.js';
import { openGuide, wireGuide } from './guide.js';
import { renderPlan } from './screen-plan.js';
import { renderBuilds, openBuildPicker, askRoute, toggleBlockers } from './screen-builds.js';
import { renderInventory } from './screen-inventory.js';
import { renderTree, pickTreeTarget, folded, setTreeTarget, collapseAll } from './screen-tree.js';
import { renderWorkshop, pendingEnhancements, toggleBlocked } from './screen-workshop.js';
import { renderCrew, crewAction, crewChange, applyShipSetup, openSetupPicker } from './screen-crew.js';
import { statusLine } from './today.js';
import { renderQuests, questAction, questDone, wantedQuests } from './screen-quests.js';
import { openVellDialog } from './today.js';
import { startClocks, tickClocks } from './clock.js';
import { recordProgress } from './pace.js';
import { openJump } from './jump.js';

import { openProfiles, activeProfile } from './profiles.js';
import { DATA, CHANGES, LATEST } from './about.js';
import { toggleVellReminder, checkVellReminder } from './today.js';
import { openTripLog } from './triplog.js';
import { pickGameFolder, writeGameFile, restoreGameFile } from './gamefile.js';
import { renderGet, shoppingText } from './screen-get.js';
import {
	renderMap, paintMap, wireMap, setMapPick, mapZoomStep, mapCentreOn,
	mapShowItem, mapFit, setMapMode, toggleMapPanel, toggleMapStop,
	useSuggestedRoute, reverseMapRoute, clearMapRoute, setMapCourse, setMapHunt, showHunt, toggleMapDone, closeMapTip,
	saveRouteDialog, loadSavedRoute, deleteSavedRoute, setTradesMode, trimRouteToParley, routeLink, applyMapLink, toggleMeasure, openSailCal, setMapWharves, toggleMini, setMapHabitats, setMapLabels, flipMapSide, traceAction, traceChange, applyTraceLink,
	openMapPicker, mapStep, mapStepTo, mapFollowToggle, setMapStart, setMapReturn, mapPortClick,
	reviveMapRoute, setMapKind, exportRoute, importRoute, openGameExport, gameBookmarks, setGameWrite
} from './screen-map.js';

// Two groups: the yard, where a build is planned and made, and the
// sea, where the day is spent. A divider in the tab row says so.
const TABS = [
	{ id: 'plan', label: 'Plan', icon: '◈', group: 'yard' },
	{ id: 'builds', label: 'Builds', icon: '⚒', group: 'yard' },
	{ id: 'inventory', label: 'Inventory', icon: '▦', group: 'yard' },
	{ id: 'tree', label: 'Tree', icon: '⌥', group: 'yard' },
	{ id: 'workshop', label: 'Workshop', icon: '⚙', group: 'yard' },
	{ id: 'get', label: 'To Get', icon: '☰', group: 'yard' },
	{ id: 'map', label: 'Map', icon: '⌖', group: 'sea' },
	{ id: 'quests', label: 'Quests', icon: '✦', group: 'sea' },
	{ id: 'crew', label: 'Ship', icon: '⚓', group: 'sea' }
];

let water = null;
// Debounces the search box; showView cancels it so a stale query cannot
// repaint the next tab. Declared here because both need it.
let queryTimer = null;
// Each tab keeps the search typed on it, so coming back finds it as left.
const queries = {};


export function render() {
	recompute();
	// Where each build stands today, for the pace -- never the tour's
	// example numbers.
	if (!store.isTransient()) recordProgress(snapshot.targets);

	const counts = {
		builds: store.getTargets().length,
		// The badge counts what the grid will show: currencies live in the
		// pouch, so silver alone must not read as one mysterious item.
		inventory: Object.keys(store.getAllStock())
			.filter(i => i !== CROW_COIN && i !== SILVER).length,
		// Anything actionable: a recipe you can make, or an enhancement
		// attempt you hold the part and the stones for.
		workshop: readyCrafts().length + pendingEnhancements().filter(e => !e.blocked).length,
		get: Object.keys(snapshot.missing).length,
		// The quests that pay in something the plan still wants -- short
		// of, or still to craft or buy -- and are still to do this period.
		quests: wantedQuests().filter(q => !questDone(q)).length
	};

	// A tablist for the keyboard: the active tab is the one Tab stop,
	// and the arrow keys walk the rest (wired in wire()).
	document.getElementById('tabs').innerHTML = TABS.map((t, i) => `${i > 0 && TABS[i - 1].group !== t.group ? '<span class="tab-gap" aria-hidden="true"></span>' : ''}
		<button class="tab ${view === t.id ? 'active' : ''}" role="tab"
			aria-selected="${view === t.id}" aria-controls="screen"
			tabindex="${view === t.id ? 0 : -1}"
			data-act="view" data-id="${t.id}" id="tab-${t.id}" title="${t.label} (${i + 1})">
			<span class="tab-icon" aria-hidden="true">${t.icon}</span>${t.label}${counts[t.id] ? `<span class="tab-count">${counts[t.id]}</span>` : ''}
		</button>`).join('');
	// The day's clocks and the ship, in one line, wherever the Plan's
	// own strip is not on the page.
	const status = document.getElementById('status');
	if (status) {
		const line = view === 'plan' || !store.getActiveTargets().length ? '' : statusLine();
		status.innerHTML = line;
		status.hidden = !line;
	}
	const screenHost = document.getElementById('screen');
	if (screenHost) screenHost.setAttribute('aria-labelledby', `tab-${view}`);

	// Only fade the tab row when there is in fact something past the edge.
	const tabBar = document.getElementById('tabs');
	tabBar.classList.toggle('scrolls', tabBar.scrollWidth > tabBar.clientWidth + 1);

	const undoBtn = document.getElementById('undo-btn');
	if (undoBtn) {
		undoBtn.disabled = !store.canUndo();
		undoBtn.title = store.canUndo() ? `Undo: ${store.lastChange().label}` : 'Nothing to undo';
	}
	const redoBtn = document.getElementById('redo-btn');
	if (redoBtn) {
		redoBtn.disabled = !store.canRedo();
		redoBtn.title = store.canRedo() ? `Redo: ${store.nextRedo().label}` : 'Nothing to redo';
	}

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
	else if (view === 'crew') root.innerHTML = renderCrew();
	else if (view === 'quests') root.innerHTML = renderQuests();
	else root.innerHTML = renderGet();
	restoreFocus(root, focus);
	// The map draws itself after the shell exists, since it has to
	// measure the box it was given before it knows which tiles to ask
	// for.
	if (view === 'map') paintMap();
	tickClocks();
	syncHash();
}

/**
 * A render replaces the whole screen, which would throw away the field
 * someone is typing in. Remember which one it was -- by what it edits,
 * not by node identity -- and put the caret back where it was.
 */
function captureFocus(root) {
	const el = document.activeElement;
	if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'SELECT')
		|| !root.contains(el) || !el.dataset.act) return null;
	const parts = [`[data-act="${el.dataset.act}"]`];
	if (el.dataset.item) parts.push(`[data-item="${el.dataset.item}"]`);
	if (el.dataset.target) parts.push(`[data-target="${el.dataset.target}"]`);
	const sel = parts.join('');
	// The Tree can show the same item on several branches, so the selector
	// alone would put the caret back in the first of them. Which occurrence
	// it was disambiguates.
	let nth;
	try {
		nth = [...root.querySelectorAll(sel)].indexOf(el);
	} catch {
		return null;   // an item name that will not survive a selector
	}
	return { sel, nth: Math.max(0, nth), start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(root, focus) {
	if (!focus) return;
	let matches;
	try {
		matches = root.querySelectorAll(focus.sel);
	} catch {
		return;
	}
	const next = matches[focus.nth] || matches[0];
	if (!next) return;
	next.focus();
	try {
		next.setSelectionRange(focus.start, focus.end);
	} catch {
		/* not a field with a caret */
	}
}

function showView(id) {
	queries[view] = query;
	setView(id);
	setQuery(queries[id] || '');
	// A search typed on the old tab must not repaint the new one with a
	// stale query when its debounce fires.
	clearTimeout(queryTimer);
	// setSetting notifies, and the render subscription answers -- calling
	// render() here as well would draw the heaviest path twice per tap.
	store.setSetting('view', id);
	syncHash();
	// The button that had focus was just rebuilt; without this, a keyboard
	// user pressing Enter on a tab lands back at the top of the page.
	const active = document.querySelector('.tab.active');
	if (active && document.activeElement === document.body) active.focus({ preventScroll: true });
	if ((id === 'get' || id === 'map') && !barterData) loadBarter();
}

/**
 * The address bar names the tab, and the selected item when there is
 * one, so a place in the app survives a reload and travels in a link.
 * A tab change is a step Back can retrace; changing the selection within
 * a tab only rewrites the entry.
 */
let applyingHash = false;

function syncHash() {
	if (applyingHash) return;
	const want = '#' + view + (view === 'inventory' && selected ? '/' + encodeURIComponent(selected) : '');
	if (location.hash === want) return;
	const sameView = (location.hash + '/').startsWith('#' + view + '/') || location.hash === '#' + view;
	if (sameView) history.replaceState(null, '', want);
	else location.hash = want;
}

function applyHash() {
	const m = location.hash.match(/^#([a-z]+)(?:\/(.*))?$/);
	// A plan in a link: offered, and the address cleaned so a reload does
	// not offer it twice.
	if (m && m[1] === 'share' && m[2]) {
		const payload = m[2];
		history.replaceState(null, '', `${location.pathname}${location.search}#plan`);
		openShared(payload);
		return true;
	}
	// A traced route in a link: onto the chart, and the address cleaned.
	if (m && m[1] === 'trace' && m[2]) {
		const payload = m[2];
		history.replaceState(null, '', `${location.pathname}${location.search}#map`);
		setView('map');
		applyTraceLink(payload).then(t => { toast(t ? `Trace from the link: ${t.name || 'untitled'}` : 'That link does not hold a trace'); render(); });
		return true;
	}
	if (m && m[1] === 'ship' && m[2]) {
		const payload = m[2];
		history.replaceState(null, '', `${location.pathname}${location.search}#crew`);
		setView('crew');
		openSharedShip(payload);
		return true;
	}
	if (!m || !TABS.some(t => t.id === m[1])) return false;
	applyingHash = true;
	queries[view] = query;
	setView(m[1]);
	setQuery(queries[m[1]] || '');
	if (m[1] === 'inventory' && m[2]) setSelected(decodeURIComponent(m[2]));
	// A route in a link: plotted, and the chart flown to it.
	if (m[1] === 'map' && m[2]) {
		const n = applyMapLink(m[2]);
		if (n) toast(`Route from the link: ${n} stop${n === 1 ? '' : 's'}`);
	}
	store.setSetting('view', m[1]);
	applyingHash = false;
	return true;
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
let barterLoading = null;

async function loadBarter() {
	if (barterData || barterLoading) return;
	barterLoading = (async () => {
		const res = await fetch('js/all_barter.json');
		if (!res.ok) throw new Error(String(res.status));
		setBarterData(await res.json());
	})();
	try {
		await barterLoading;
	} catch {
		// Left unset rather than set to [], so opening To Get or the Map
		// after the network comes back tries again instead of showing an
		// empty ocean until someone reloads.
		barterLoading = null;
		return;
	}
	barterLoading = null;
	// Barter lines appear on more screens than these two -- the Tree and
	// the inventory detail draw their buttons from the same data -- so
	// whichever is up gets the second paint.
	render();
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

// The dialog's veil blurs the whole viewport, water included, and a
// blur over a canvas that redraws every frame is a full-screen
// re-blur every frame. Hold the water still while a dialog is up.
document.addEventListener('dialog-toggle', evt => {
	if (!water) return;
	try {
		if (evt.detail.open) water.pause();
		else water.play();
	} catch { /* the shader is decorative */ }
});

function syncWaterButton() {
	const btn = document.getElementById('water-btn');
	if (!btn) return;
	const on = store.getSetting('water', false) === true;
	const label = btn.querySelector('span') || btn;
	label.textContent = `≈ Water ${on ? 'on' : 'off'}`;
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
			// A click anywhere else closes the More menu.
			const pop = document.getElementById('more-menu');
			if (pop && !pop.hidden && !evt.target.closest('#more-menu')) {
				pop.hidden = true;
				const btn = document.querySelector('[data-act="more"]');
				if (btn) btn.setAttribute('aria-expanded', 'false');
			}
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

		// Picking anything out of the More menu puts it away.
		if (act !== 'more' && el.closest('#more-menu')) {
			document.getElementById('more-menu').hidden = true;
			const btn = document.querySelector('[data-act="more"]');
			if (btn) btn.setAttribute('aria-expanded', 'false');
		}

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
			case 'blockers-all': toggleBlockers(); return render();
			case 'enh-blocked': toggleBlocked(); return render();
			case 'open-item': hidePeek(); showView('inventory'); setSelected(el.dataset.item); return render();
			case 'vell-edit': return openVellDialog();
			case 'jump': return openJumpPalette();
			case 'profiles': return openProfiles({ toast });
			case 'vell-notify': return toggleVellReminder();
			case 'trip-log': return openTripLog();
			case 'quest-pay-pick': return questAction(act, el);
			case 'quest-pay-del': questAction(act, el); return render();
			case 'stash-del': store.setStash(el.dataset.item, el.dataset.town, null); return;
			case 'export': return doExport();
			case 'import': return doImport();
			case 'reset': return doReset();
			case 'market-refresh':
				loadMarket({ force: true }).then(ok => toast(ok ? 'Market prices refreshed' : 'The Market did not answer — showing the last prices it gave'));
				return;
			case 'water': return toggleWater();
			case 'tour': return startTour();
			case 'help': return openHelp();
			case 'guide': return openGuide();
			case 'signin':
			case 'account': return openAccount();
			case 'more': {
				const pop = document.getElementById('more-menu');
				const open = !pop.hidden;
				pop.hidden = open;
				el.setAttribute('aria-expanded', String(!open));
				return;
			}
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
			case 'map-route-save': return saveRouteDialog();
			case 'map-route-load': loadSavedRoute(Number(el.dataset.i)); return;
			case 'map-route-del': deleteSavedRoute(Number(el.dataset.i)); return;
			case 'map-route-trim': trimRouteToParley(); return;
			case 'map-trades': setTradesMode(el.dataset.id); return;
			case 'map-measure': toggleMeasure(); return;
			case 'map-mini': toggleMini(); return;
			case 'map-sail-cal': return openSailCal();
			case 'map-route-link':
				try {
					await navigator.clipboard.writeText(routeLink());
					toast('Route link copied');
				} catch {
					toast('Could not reach the clipboard');
				}
				return;
			case 'map-course': setMapCourse(el.dataset.id); return;
			case 'map-wharves': setMapWharves(el.dataset.id); return;
			case 'map-habitats': setMapHabitats(); return;
			case 'map-labels': setMapLabels(); return;
			case 'trace-tool': case 'trace-undo': case 'trace-clear': case 'trace-point-del': case 'trace-save': case 'trace-load': case 'trace-del': case 'trace-link': case 'trace-export': traceAction(act, el); return;
			case 'map-setup-pick': openSetupPicker(() => render()); return;
			case 'map-side-flip': flipMapSide(); return;
			case 'map-hunt': setMapHunt(el.dataset.id); return;
			case 'quest-map': showHunt(el.dataset.monster); return showView('map');
			case 'map-route-export': {
				// A route is a few dozen bytes of ids; a file is how it
				// reaches a friend, or another optimiser.
				const blob = new Blob([exportRoute()], { type: 'application/json' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `barter-route-${new Date().toISOString().slice(0, 10)}.json`;
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				return;
			}
			case 'map-route-game': return openGameExport('route');
			case 'map-hunt-game': return openGameExport('hunt');
			case 'map-game': return openGameExport(el.dataset.source);
			case 'map-game-pick': {
				try {
					await pickGameFolder();
				} catch (err) {
					if (err && err.name !== 'AbortError') toast(err.message);
					return;
				}
				return openGameExport();
			}
			case 'map-game-write': {
				try {
					const r = await writeGameFile(gameBookmarks().xml);
					toast(`Written — the old file is ${r.backup}. Load a character and open the map`);
				} catch (err) {
					toast(err.message);
				}
				return openGameExport();
			}
			case 'map-game-restore': {
				try {
					await restoreGameFile();
					toast('Previous favourites put back');
				} catch (err) {
					toast(err.message);
				}
				return openGameExport();
			}
			case 'map-game-copy': {
				try {
					await navigator.clipboard.writeText(gameBookmarks().xml);
					toast('Copied — paste it over the block in gameVariable.xml');
				} catch {
					toast('Could not reach the clipboard');
				}
				return;
			}
			case 'map-game-save': {
				// The same block as a file, for a person who would rather
				// open two editors side by side than trust a clipboard.
				const blob = new Blob([gameBookmarks().xml], { type: 'application/xml' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `worldmap-favorites-${new Date().toISOString().slice(0, 10)}.xml`;
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				return;
			}
			case 'map-route-import': {
				const input = document.createElement('input');
				input.type = 'file';
				input.accept = 'application/json,.json';
				input.addEventListener('change', async () => {
					const file = input.files && input.files[0];
					if (!file) return;
					try {
						const r = importRoute(await file.text());
						toast(`Route loaded — ${r.stops} stops${r.dropped ? `, ${r.dropped} not on this chart` : ''}`);
						render();
					} catch (err) {
						toast(err.message);
					}
				});
				input.click();
				return;
			}
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
				onPick: name => {
					const info = routeInfo[el.dataset.item] && routeInfo[el.dataset.item][name];
					toast(`${el.dataset.item} — ${info ? info.label.charAt(0).toLowerCase() + info.label.slice(1) : name}`, true);
				}
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
				const delta = craftDelta(item, times, recipes);
				// Mass Process is the same recipe run ten at a time, plus a
				// Black Stone Powder per batch -- recording it that way has
				// to spend the powder too, or the powder count drifts.
				const mass = el.closest('.craft-card')?.querySelector('[data-mass-process]');
				let label = `Crafted ${times} × ${item}`;
				if (mass && mass.checked && massProcess[item]) {
					const { extra, batch } = massProcess[item];
					const powder = Math.ceil(times / batch);
					if (store.getStock(extra) < powder) {
						return toast(`Mass Process wants ${F(powder)} ${extra} for that batch — you hold ${F(store.getStock(extra))}`);
					}
					delta[extra] = (delta[extra] || 0) - powder;
					label = `Mass Processed ${times} × ${item}`;
				}
				store.applyDelta(delta, 'craft', label);
				toast(`${label}`, true);
				return;
			}
			case 'enhance': {
				const row = el.closest('[data-base]');
				const base = row.getAttribute('data-base');
				const level = Number(row.getAttribute('data-level'));
				const step = enhanceStep(base, level);
				if (!step) return;
				const ok = el.dataset.result === 'success';
				// 'dropped' is the yellow tier's third outcome: the attempt
				// was made without Cron Stones, so no Crons are spent and
				// the part falls a level.
				const dropped = el.dataset.result === 'dropped' && step.onFailureDropped;
				// Recording an attempt spends real stock; short of it, the
				// clamp at zero would eat the shortfall and mint the part
				// from nothing. The level picker is the way to record gear
				// that was enhanced outside the app.
				const spend = ok ? step.onSuccess : dropped ? step.onFailureDropped : step.onFailure;
				const short = Object.entries(spend)
					.filter(([item, d]) => d < 0 && store.getStock(item) < -d)
					.map(([item]) => item);
				if (short.length) {
					toast(`Not enough ${short.join(', ')} for that attempt — to record a level you already have, open the part and pick the level`);
					return;
				}
				store.applyDelta(
					spend,
					'enhance',
					ok ? `${base} reached +${level}`
						: dropped ? `${base} fell to +${level - 2} — no Crons on the attempt`
						: `Failed attempt at +${level} ${base}`
				);
				// The failstack moves with the attempt: a failure adds one
				// (Crons or not), a success spends the stack, and the next
				// level starts from its own recommended one.
				const tier = (tableFor(base) || { levels: [] }).levels[level - 1];
				if (tier && tier.base) {
					const stacks = { ...(store.getProfile('failstacks', {}) || {}) };
					if (ok) delete stacks[base];
					else stacks[base] = (stacks[base] ?? tier.stack) + 1;
					store.setProfile('failstacks', stacks);
				}
				if (dropped) {
					toast(`${base} fell to +${level - 2} — the Crons stayed in your pocket`, true);
					return;
				}
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
				if (!id) return;
				const entry = store.removeTarget(id);
				if (entry) toast(`${entry.label} — Undo brings it back`, true);
				return;
			}
			default:
				// The Crew screen owns its own verbs; most change the save
				// (and repaint through it), the rest are session state.
				if (act.startsWith('crew-') && crewAction(act, el)) return render();
				if (act.startsWith('quest-') && questAction(act, el)) return render();
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

		// How the route is written to the game's map -- favourites or one
		// of its loops. A select answers on change, not on click.
		const gw = evt.target.closest('[data-act="map-game-as"]');
		if (gw) {
			setGameWrite(gw.value);
			return openGameExport();
		}

		const mreg = evt.target.closest('[data-act="market-region"]');
		if (mreg) return setMarketRegion(mreg.value);

		const st = evt.target.closest('[data-act="stash-town"]');
		// A new place starts empty; the count typed into it is added to
		// the total, since it is a count you have somewhere.
		if (st && st.value) return store.setStash(st.dataset.item, st.value, 0);

		const cl = evt.target.closest('[data-act="codex-lang"]');
		if (cl) return store.setSetting('codexLang', cl.value);

		const so = evt.target.closest('[data-act="sort"]');
		if (so) {
			setSort(so.value);
			return render();
		}

		const cs = evt.target.closest('[data-act="crew-ship"]');
		if (cs) return store.setProfile('crewShip', cs.value || null);

		const cw = evt.target.closest('[data-act^="crew-"]');
		if (cw && crewChange(cw)) return;
		const tr = evt.target.closest('[data-act^="trace-"]');
		if (tr && traceChange(tr)) return;

		const ms = evt.target.closest('[data-act="map-start"]');
		if (ms) return setMapStart(Number(ms.value));

		const mr = evt.target.closest('[data-act="map-return"]');
		if (mr) return setMapReturn(mr.checked);

		const el = evt.target.closest(
			'[data-act="own-set"], [data-act="purse"], [data-act="target-qty"],'
			+ ' [data-act="barter-count"], [data-act="vouchers"], [data-act="parley-held"],'
			+ ' [data-act="failstacks"], [data-act="stash-set"]');
		if (!el) return;
		const n = parseAmount(el.value);
		if (n === null) return render();   // gibberish: put the stored value back
		if (el.dataset.act === 'stash-set') store.setStash(el.dataset.item, el.dataset.town, n);
		else if (el.dataset.act === 'target-qty') store.setTargetQty(el.dataset.target, n);
		else if (el.dataset.act === 'barter-count') store.setProfile('barterCount', n);
		else if (el.dataset.act === 'vouchers') store.setProfile('vouchers', n);
		else if (el.dataset.act === 'parley-held') store.setProfile('parleyHeld', n);
		else if (el.dataset.act === 'failstacks') {
			const stacks = { ...(store.getProfile('failstacks', {}) || {}) };
			stacks[el.dataset.base] = n;
			store.setProfile('failstacks', stacks);
		}
		else store.setStock(el.dataset.item, n);
	});

	// The pouch holds its ground while you type in it; once focus leaves it
	// entirely, catch it up with whatever the change already recorded.
	wirePeek();
	wireGuide();
	wireMap();

	document.addEventListener('keydown', evt => {
		const dialog = document.getElementById('dialog');
		const inField = evt.target.closest('input, textarea, select, [contenteditable]');

		// Ctrl+K anywhere, / outside a field: find anything. The digits
		// switch tabs, the way they do in a browser.
		if ((evt.ctrlKey || evt.metaKey) && !evt.altKey && evt.key.toLowerCase() === 'k') {
			evt.preventDefault();
			return openJumpPalette();
		}
		if (!inField && dialog.hidden && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
			if (evt.key === '/') {
				evt.preventDefault();
				return openJumpPalette();
			}
			if (/^[1-9]$/.test(evt.key) && TABS[Number(evt.key) - 1]) {
				evt.preventDefault();
				return showView(TABS[Number(evt.key) - 1].id);
			}
		}

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
		// field being typed in, then the inventory detail panel. Someone
		// abandoning an edit is not asking to lose the panel around it.
		if (evt.key === 'Escape') {
			if (!dialog.hidden) {
				evt.preventDefault();
				dismissDialog();
			} else if (evt.target.closest('input, textarea, select')) {
				evt.target.blur();
			} else if (selected) {
				setSelected(null);
				render();
			}
			return;
		}

		// Enter in the Workshop's batch-size field is the same as pressing
		// the button beside it.
		if (evt.key === 'Enter' && evt.target.classList && evt.target.classList.contains('craft-n')) {
			const btn = evt.target.closest('.craft-actions')?.querySelector('[data-act="craft"][data-times="field"]');
			if (btn) {
				evt.preventDefault();
				btn.click();
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
	document.addEventListener('input', evt => {
		const el = evt.target.closest('[data-act="query"]');
		if (!el) return;
		setQuery(el.value);
		clearTimeout(queryTimer);
		queryTimer = setTimeout(render, 120);
	});

	// The water is pure decoration, and decoration has no business
	// burning battery in a tab nobody is looking at.
	document.addEventListener('quests-refilter', () => render());
	document.addEventListener('app-render', () => render());

	document.addEventListener('visibilitychange', () => {
		if (!water) return;
		if (document.visibilityState === 'hidden') water.pause();
		else water.play();
	});
}

/** The find box: a tab opens, an item opens in the Inventory's panel. */
function openJumpPalette() {
	openJump({
		tabs: TABS,
		go: (kind, value) => {
			if (kind === 'tab') return showView(value);
			showView('inventory');
			setSelected(value);
			render();
		}
	});
}

/** A plan in a link: looked at without saving, or taken in. */
let sharedKept = null;

async function openShared(payload) {
	let save;
	try {
		save = await decodeShare(payload);
	} catch {
		return toast('That link does not carry a plan the tracker can read');
	}
	const items = Object.keys(save.stock || {}).length;
	const builds = (save.targets || []).length;
	const host = openDialog(`
		<h2>A plan in a link</h2>
		<p class="dialog-copy">This link carries ${items} item${items === 1 ? '' : 's'} in stock and ${builds} build${builds === 1 ? '' : 's'}. Look around it without touching yours, or take it in.</p>
		<div class="dialog-actions">
			<button class="act" data-share-look>Look around</button>
			<button class="ghost-btn" data-share-merge>Merge into mine</button>
			<button class="ghost-btn danger" data-share-replace>Replace mine</button>
			<button class="ghost-btn" data-close>Ignore</button>
		</div>`);
	host.querySelector('[data-share-look]').addEventListener('click', () => {
		closeDialog();
		sharedKept = store.capture();
		store.applyTransient(JSON.stringify(save));
		showSharedBar(save);
	});
	host.querySelector('[data-share-merge]').addEventListener('click', () => {
		closeDialog();
		store.merge(save, 'Merged a shared plan');
		toast('Merged the shared plan into yours', true);
	});
	host.querySelector('[data-share-replace]').addEventListener('click', () => {
		closeDialog();
		store.adopt(save, 'Took a shared plan');
		toast('Replaced yours with the shared plan', true);
	});
}

/** A ship setup in a link: the hull, its parts, its crew. */
async function openSharedShip(payload) {
	let setup;
	try {
		setup = (await decodeShare(payload)).setup;
	} catch {
		return toast('That link does not carry a ship setup the tracker can read');
	}
	if (!setup || !setup.ship) return toast('That link does not carry a ship setup');
	const parts = Object.values(setup.fitted || {}).filter(Boolean).length;
	const sailors = (setup.roster || []).length;
	const host = openDialog(`
		<h2>A ship setup in a link</h2>
		<p class="dialog-copy"><b>${esc(setup.ship)}</b>, ${parts} part${parts === 1 ? '' : 's'} chosen by hand, ${sailors} sailor${sailors === 1 ? '' : 's'} on the roster. Taking it in makes it your ship — the roster and that hull's seats are replaced; one Undo takes it back.</p>
		<div class="dialog-actions">
			<button class="act" data-ship-take>Make it my ship</button>
			<button class="ghost-btn" data-close>Ignore</button>
		</div>`);
	host.querySelector('[data-ship-take]').addEventListener('click', () => {
		closeDialog();
		if (applyShipSetup(setup)) toast(`Sailing as ${setup.ship}`, true);
	});
}

function showSharedBar(save) {
	let bar = document.getElementById('shared-bar');
	if (!bar) {
		bar = document.createElement('div');
		bar.id = 'shared-bar';
		bar.className = 'shared-bar';
		document.body.appendChild(bar);
	}
	bar.innerHTML = `<span>Looking at a shared plan — nothing you do here is saved.</span>
		<button class="ghost-btn" data-shared="merge">Merge into mine</button>
		<button class="ghost-btn" data-shared="replace">Keep it, replace mine</button>
		<button class="act" data-shared="back">Back to mine</button>`;
	bar.hidden = false;
	bar.onclick = evt => {
		const b = evt.target.closest('[data-shared]');
		if (!b) return;
		store.restore(sharedKept);
		sharedKept = null;
		bar.hidden = true;
		if (b.dataset.shared === 'merge') { store.merge(save, 'Merged a shared plan'); toast('Merged the shared plan into yours', true); }
		else if (b.dataset.shared === 'replace') { store.adopt(save, 'Took a shared plan'); toast('Replaced yours with the shared plan', true); }
		else toast('Back to your own plan');
	};
}

function doExport() {
	const host = openDialog(`
		<h2>Take the plan with you</h2>
		<p class="dialog-copy">A file is a backup and moves between machines. A link opens the same plan on any browser — stock, builds and crew all ride in the address — to look at without saving, or to take in.</p>
		<div class="dialog-actions">
			<button class="act" data-export-file>Download a file</button>
			<button class="ghost-btn" data-export-link>Copy a link</button>
			<button class="ghost-btn" data-close>Cancel</button>
		</div>`);
	host.querySelector('[data-export-file]').addEventListener('click', () => { closeDialog(); downloadExport(); });
	host.querySelector('[data-export-link]').addEventListener('click', async () => {
		try {
			const link = shareLink(await encodeShare(store.saveShape()));
			await navigator.clipboard.writeText(link);
			closeDialog();
			toast(`Link copied — ${Math.round(link.length / 1024)} KB of address`);
		} catch {
			toast('Could not build or copy the link');
		}
	});
}

function downloadExport() {
	const blob = new Blob([store.exportJSON()], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	// Dated, so keeping more than one backup does not mean the second
	// silently replacing the first in the downloads folder.
	const stamp = new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
	a.download = `ship-tracker-${stamp}.json`;
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
		let text;
		let incoming;
		try {
			text = await file.text();
			incoming = JSON.parse(text);
		} catch {
			return toast('That file is not valid JSON.');
		}
		if (!incoming || typeof incoming !== 'object' || !incoming.stock) {
			return toast('That file does not contain tracker data.');
		}
		// Importing replaces everything, which deserves saying before it
		// happens rather than in the past tense afterwards.
		const items = Object.keys(incoming.stock).length;
		const builds = Array.isArray(incoming.targets) ? incoming.targets.length : 0;
		const host = openDialog(`
			<h2>Bring in this file?</h2>
			<p>It holds ${F(items)} items and ${F(builds)} builds. <b>Replace</b> makes it the whole
			tracker — your stock, your build queue and your choices. <b>Merge</b> keeps the higher
			count of any item, adds builds you do not have, and leaves every choice you have
			already made alone. Either way, one Undo brings the current data back.</p>
			<div class="dialog-actions">
				<button class="act quiet" data-cancel>Keep what I have</button>
				<button class="act quiet" data-merge>Merge it in</button>
				<button class="act" data-accept>Replace everything</button>
			</div>
		`);
		host.querySelector('[data-cancel]').addEventListener('click', () => closeDialog());
		host.querySelector('[data-merge]').addEventListener('click', () => {
			closeDialog();
			const result = store.merge(incoming);
			toast(`Merged — ${result.items} counts raised, ${result.targets} builds added`, true);
		});
		host.querySelector('[data-accept]').addEventListener('click', () => {
			closeDialog();
			try {
				const result = store.importJSON(text);
				toast(`Replaced tracker data — ${result.items} items, ${result.targets} builds`, true);
			} catch (err) {
				toast(err.message);
			}
		});
	});
	input.click();
}

function doReset() {
	const items = Object.keys(store.getAllStock()).length;
	const builds = store.getTargets().length;
	const host = openDialog(`
		<h2>Start fresh?</h2>
		<p>This clears your stock (${F(items)} items), your build queue (${F(builds)} builds),
		your choices and your barter profile. One Undo brings it all back — but Export first
		if this is a copy you may ever want again.</p>
		<div class="dialog-actions">
			<button class="act quiet" data-cancel>Keep everything</button>
			<button class="act" data-accept>Start fresh</button>
		</div>
	`);
	host.querySelector('[data-cancel]').addEventListener('click', () => closeDialog());
	host.querySelector('[data-accept]').addEventListener('click', () => {
		closeDialog();
		store.adopt({ stock: {}, targets: [], strategy: {}, profile: {} }, 'Started fresh');
		toast('Everything cleared — Undo brings it back', true);
	});
}

function offerLegacyImport() {
	if (store.hasImportedLegacy()) return false;

	const shipNames = shipGroups.flatMap(g => g.items);
	const legacy = store.readLegacyData(shipNames, allItems());
	if (!legacy || !Object.keys(legacy.stock).length) {
		store.markLegacyImported();
		return false;
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
	return true;
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
		<details class="help-more">
			<summary>What's new</summary>
			${CHANGES.slice(0, 6).map(c => `<div class="help-change"><b>${esc(c.date)}</b> — ${esc(c.title)}<ul>${c.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`).join('')}
		</details>
		<p class="dialog-copy">Look-ups open on BDOCodex in
			<select class="field select inline" data-act="codex-lang" aria-label="BDOCodex language">${CODEX_LANGS.map(([id, name]) => `<option value="${id}"${(store.getSetting('codexLang', 'us') || 'us') === id ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select>
		</p>
		<details class="help-more">
			<summary>The data, and when it was checked</summary>
			<div class="help-data">${DATA.map(d => `<div class="kv-row"><span>${esc(d.what)}</span><span class="n">${esc(d.asOf)}${d.from ? ` · ${esc(d.from)}` : ''}</span></div>`).join('')}</div>
			<p class="dialog-copy">A patch can move any of these. The Market prices are live; everything else is a snapshot the app was checked against on the date shown.</p>
		</details>
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
		if (!guidedTour.startTour('main')) {
			toast('The tour could not load — check your connection and try again');
		}
	} catch (err) {
		console.warn('[ui] tour unavailable:', err);
		toast('The tour could not load — check your connection and try again');
	}
}

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */

export async function init() {
	store.init();

	const saved = store.getSetting('view');
	if (saved && TABS.some(t => t.id === saved)) setView(saved);
	// A link or a reload with a hash names a place, and the address bar
	// outranks the remembered tab.
	applyHash();

	wire();
	window.addEventListener('hashchange', applyHash);
	store.subscribe(() => render());
	render();
	// The minute hand on every countdown, a repaint when a reset passes
	// with the page open, and the Vell reminder if it was asked for.
	startClocks(render, checkVellReminder);
	whatsNew();
	// Which save this page is on. Sync mirrors the main profile only:
	// a second profile is a second save, and the account holds one.
	const prof = activeProfile();
	const profBtn = document.querySelector('[data-act="profiles"]');
	if (profBtn && prof.slug) profBtn.textContent = `Profile: ${prof.name}`;

	loadBarter();
	// A failed fetch leaves barterData unset on purpose; the network
	// coming back is the retry signal.
	window.addEventListener('online', loadBarter);

	if (store.getSetting('water', false) === true) waterOn();
	syncWaterButton();

	const legacyDialogUp = offerLegacyImport();

	// First-run tour, once the screens are on the page -- but not on top
	// of the legacy-import question. Starting it would swap in demo data
	// under the open dialog, and "Import it" would then merge a player's
	// history into example numbers the tour throws away.
	if (!legacyDialogUp) {
		try {
			const { guidedTour } = await import('./guided-tour.js');
			guidedTour.checkAndShowInitialTour();
		} catch {
			/* the tour is optional */
		}
	}

	// Icon metadata arrives asynchronously; repaint once it is ready.
	try {
		await iconLoader.init();
		render();
	} catch {
		/* icons fall back to the app mark */
	}

	// Market prices ride on the icon mapping, which is where an item's
	// codex id lives -- so they are asked for after it, and repaint the
	// costs when they land. Offline, the last copy this browser saw
	// prices the plan until the network is back.
	onMarket(render);
	loadMarket();
	window.addEventListener('online', () => loadMarket());

	// Sync last, and never blocking: on a deployment without it this is
	// one request that comes back "no" and nothing more happens.
	if (prof.slug) {
		const acct = document.getElementById('account');
		if (acct) acct.innerHTML = `<span class="account-chip off" title="Sync mirrors the Main profile only">sync off on this profile</span>`;
	} else {
		initSync({ toast, openDialog, closeDialog, rerender: render })
			.catch(err => console.warn('[ui] sync unavailable:', err));
	}
}

/** One line about what changed since the last visit, once. */
function whatsNew() {
	const KEY = 'bdo-tracker/seen';
	let seen = null;
	try { seen = localStorage.getItem(KEY); } catch { /* then say nothing */ }
	if (seen && seen !== LATEST) toast(`New since your last visit: ${CHANGES[0].title}. The details are under Help.`);
	try { localStorage.setItem(KEY, LATEST); } catch { /* private mode */ }
}
