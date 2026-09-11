// The shell. Renders whichever screen is up, owns the event wiring, and
// starts everything -- while every screen lives in its own module and
// every piece of shared state in ui-state.js. Nothing here holds its
// own copy of anything: each screen is a projection of state.js through
// planner.js, rebuilt on every change.

import { shipGroups } from './ships.js';
import { routeInfo } from './recipes.js';
import { tableFor } from './enhancement.js';
import { iconLoader } from './icon-loader.js';
import { esc, F, parseAmount } from './fmt.js';
import * as store from './state.js';
import { initSync, openAccount, feature, me } from './sync.js';
import { maxCraftable, craftDelta, enhanceStep, parseEnhanced } from './planner.js';
import {
	view, selected, recipes, barterData, snapshot, query,
	setView, setQuery, setPlanFilter, setInvFilter, setInvKind, setSelected, setBarterData, setCombos, setMatBoards,
	recompute, readyCrafts, craftStock, CROW_COIN, SILVER, setSort, invPicking, invPicked, setInvPicking
} from './ui-state.js';
import { kindOf } from './kinds.js';
import { toast, openDialog, closeDialog, dismissDialog } from './dialogs.js';
import { allItems, CODEX_LANGS, img } from './ui-bits.js';
import { encodeShare, decodeShare, shareLink, shareSize } from './share.js';
import { massProcess } from './vendor_items.js';
import { loadMarket, onMarket, setRegion as setMarketRegion } from './market.js';
import { paintPouch, measurePouch } from './pouch.js';
import { toggleSailBar, openRoutes } from './profile-bar.js';
import { hidePeek, wirePeek } from './peek.js';
import { openGuide, wireGuide } from './guide.js';
import { renderPlan } from './screen-plan.js';
import { renderBuilds, openBuildPicker, askRoute, toggleBlockers } from './screen-builds.js';
import { renderInventory } from './screen-inventory.js';
import { renderBarter, barterAction, barterChange, barterType, chartFragment, runSheetHTML, sailChart } from './screen-barter.js';
import { renderTree, pickTreeTarget, folded, setTreeTarget, collapseAll } from './screen-tree.js';
import { renderWorkshop, pendingEnhancements, toggleBlocked } from './screen-workshop.js';
import { renderCrew, crewAction, crewChange, applyShipSetup, openSetupPicker, selectSailor, setLooking } from './screen-crew.js';
import { statusLine } from './today.js';
import { renderQuests, questAction, questDone, wantedQuests, setQuestPay, setQuestFocus } from './screen-quests.js';
import { renderCommunity, communityAction, wireCommunity } from './screen-community.js';
import { openVellDialog, openResetsDialog } from './today.js';
import { startClocks, tickClocks } from './clock.js';
import { recordProgress } from './pace.js';
import { openJump } from './jump.js';
import { openItemCard } from './item-card.js';
import { attachSheet } from './sheet.js';
import { isPhone, onPhoneChange } from './viewport.js';
import { film } from './film.js';

import { openProfiles, activeProfile } from './profiles.js';
import { DATA, CHANGES, LATEST, RELEASES, RELEASE } from './about.js';
import { openTables } from './screen-tables.js';
import { toggleVellReminder, checkVellReminder } from './today.js';
import { openTripLog } from './triplog.js';
import { pickGameFolder, writeGameFile, restoreGameFile } from './gamefile.js';
import { renderGet, shoppingText, shoppingCSV, getAction, getChange } from './screen-get.js';
import { openCoinBuy } from './coin-shop.js';
import {
	renderMap, paintMap, wireMap, setMapPick, mapZoomStep, mapCentreOn, mapCentreOnStash,
	mapShowItem, mapFit, setMapMode, toggleMapPanel, toggleMapStop,
	useSuggestedRoute, reverseMapRoute, clearMapRoute, setMapCourse, setMapHunt, showHunt, toggleMapDone, closeMapTip,
	saveRouteDialog, loadSavedRoute, deleteSavedRoute, mapWritingView, loadPreviousRoute, deletePreviousRoute, openRationCal, putRationsCall, setRationsAboard, pinArea, forgetPinned, setTradesMode, trimRouteToParley, routeLink, applyMapLink, toggleMeasure, openSailCal, setMapWharves, toggleMini, setMapHabitats, setMapLabels, setMapPins, setMapTraces, toggleMapLayers, flipMapSide, traceAction, traceChange, applyTraceLink,
	openMapPicker, mapStep, mapStepTo, mapFollowToggle, mapNextOnlyToggle, setMapStart, setMapReturn, mapPortClick,
	reviveMapRoute, setMapKind, exportRoute, importRoute, openGameExport, gameBookmarks, setGameWrite,
	toggleFull, exitFull, mapIsFull, gameImportAction, setRunSheet,
	toggle3D, levelMap, setMapStyle
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
	{ id: 'crew', label: 'Ship', icon: '⚓', group: 'sea' },
	// Last, so the digit shortcuts the first nine tabs answer to stay put.
	{ id: 'barter', label: 'Barter', icon: '⇄', group: 'sea' },
	// The harbour: only where there are accounts to stand on its boards.
	// Past the ten with a digit, and shown once the server has said so.
	{ id: 'community', label: 'Community', icon: '☸', group: 'harbour', when: () => feature('community') }
];

/** The tabs this deployment shows. A tab with a `when` waits on it. */
const tabs = () => TABS.filter(t => !t.when || t.when());

// The four a phone gets at the thumb; the rest live behind "Menu".
const THUMB_TABS = ['plan', 'inventory', 'map', 'quests'];

/**
 * Everything that is not a section, in the one menu the app has. The
 * verbs a wide screen keeps in the masthead come first, so that on a
 * phone -- where the masthead holds only Undo and the account -- they
 * are the first thing in the sheet; the rest are the settings and the
 * doors that used to sit behind "More". A `when` keeps an item to the
 * deployments and accounts it is for; a `label` that is a function
 * says the current state, for the toggles.
 */
const MENU = [
	{ group: 'Do', items: [
		{ act: 'jump', icon: '⌕', label: 'Find', hint: 'an item or a section · Ctrl+K' },
		{ act: 'trip-log', icon: '＋', label: 'Log a trip', hint: 'everything a trip brought back, as one change' },
		{ act: 'undo', icon: '↶', label: 'Undo', hint: () => (store.canUndo() ? store.lastChange().label : 'nothing to undo') },
		{ act: 'redo', icon: '↷', label: 'Redo', hint: () => (store.canRedo() ? store.nextRedo().label : 'nothing to redo') }
	] },
	{ group: 'Your save', items: [
		{ act: 'profiles', icon: '👤', label: 'Profiles', hint: 'separate saves on this browser' },
		{ act: 'export', icon: '⇪', label: 'Export', hint: 'a file, or a link' },
		{ act: 'import', icon: '⇩', label: 'Import', hint: 'a file saved from here' },
		{ act: 'reset', icon: '✕', label: 'Start fresh', hint: 'clears everything, one Undo away', danger: true }
	] },
	{ group: 'Help', items: [
		{ act: 'whats-new', icon: '✦', label: 'What’s new', hint: 'what arrived since you were last here' },
		{ act: 'help', icon: '?', label: 'Help', hint: 'the film, the data’s dates' },
		{ act: 'tables', icon: '▤', label: 'Enhancement tables', hint: 'the seven tables, lit at your stack' },
		{ act: 'tour', icon: '➤', label: 'Tour', hint: 'a walk through your own screen' },
		{ act: 'feedback', icon: '✎', label: 'Feedback', hint: 'something wrong, or something you want' },
		{ act: 'inbox', icon: '✉', label: 'Feedback inbox', hint: 'what people have written in', when: () => Boolean(me() && me().admin) }
	] },
	{ group: 'The page', items: [
		{ act: 'theme', icon: '◐', label: () => `Theme: ${store.getSetting('theme', 'dark')}`, hint: 'dark, light, or as the system has it', keep: true },
		{ act: 'water', icon: '≈', label: () => `Water ${store.getSetting('water', false) === true ? 'on' : 'off'}`, hint: 'the shader behind the page', keep: true }
	] }
];

/* Everything that answers by going somewhere else. Chosen inside a
   dialog, the dialog has done its job and gets out of the way -- the
   item card's "Show the barterers on the map" used to leave the card
   standing over the map it had just drawn. */
const NAV_ACTS = new Set(['view', 'open-item', 'goto-map', 'goto-quests', 'goto-tree', 'goto-workshop', 'goto-get', 'quest-map']);

let water = null;
// Debounces the search box; showView cancels it so a stale query cannot
// repaint the next tab. Declared here because both need it.
let queryTimer = null;
// Each tab keeps the search typed on it, so coming back finds it as left.
const queries = {};
// And where it was scrolled to: a tab left half-way down a long list
// comes back there, not at the top. Kept for the session only.
const scrolls = {};
let scrollBack = null;   // the position the next render puts back, if any

/** Note where this tab was left, and ask for the next one's place back. */
function leaveScroll(from, to) {
	scrolls[from] = window.scrollY || 0;
	scrollBack = scrolls[to] || 0;
}


/**
 * The phone's section bar. Nine tabs will not fit a thumb's reach, and
 * a row that scrolls sideways hides whatever is past the edge -- people
 * did not know the rest were there. So four sit in the bar and the last
 * slot opens a sheet with every one of them, named and counted. Where
 * the standing tab is not one of the four, that slot becomes it, so the
 * bar always says where you are.
 */
function paintTabBar(counts) {
	const bar = document.getElementById('tabbar');
	if (!bar) return;
	const cell = (t, extra = '') => `<button class="tabbar-btn${view === t.id ? ' active' : ''}${extra}"
		data-act="view" data-id="${t.id}" aria-current="${view === t.id}" title="${t.label}">
		<span class="tabbar-icon" aria-hidden="true">${t.icon}</span><span class="tabbar-label">${t.label}</span>
		${counts[t.id] ? `<span class="tabbar-count">${counts[t.id]}</span>` : ''}</button>`;
	const four = THUMB_TABS.map(id => TABS.find(t => t.id === id)).filter(Boolean);
	const here = tabs().find(t => t.id === view);
	// The standing tab always has a seat: an odd one takes the last of
	// the four rather than hiding behind "Menu".
	const seats = four.some(t => t.id === view) || !here ? four : [...four.slice(0, 3), here];
	const rest = tabs().filter(t => !seats.some(s => s.id === t.id));
	const waiting = rest.reduce((n, t) => n + (counts[t.id] || 0), 0);
	bar.innerHTML = seats.map(t => cell(t)).join('')
		+ `<button class="tabbar-btn all" data-act="tab-sheet" aria-haspopup="dialog" title="Every section, and everything else">
			<span class="tabbar-icon" aria-hidden="true">☰</span><span class="tabbar-label">Menu</span>
			${waiting ? `<span class="tabbar-count">${waiting}</span>` : ''}</button>`;
	measureTabBar();
}

/**
 * Publish the tab bar's height.
 *
 * The bar is fixed to the bottom edge and belongs to the page, not to
 * the shell -- and .shell carries a stacking context of its own, so
 * nothing inside it can be raised over the bar however high its
 * z-index. The inventory sheet's last line went under it. Now the sheet
 * is told where the bar begins and stops there.
 */
function measureTabBar() {
	const bar = document.getElementById('tabbar');
	if (!bar) return;
	const h = getComputedStyle(bar).display === 'none' ? 0 : bar.offsetHeight;
	document.documentElement.style.setProperty('--tabbar-h', `${h}px`);
	// And the dock's, so what sticks under it -- the pouch -- knows
	// where the top of the page really is.
	const dock = document.getElementById('tabs');
	const d = dock && getComputedStyle(dock).display !== 'none' ? dock.offsetHeight : 0;
	document.documentElement.style.setProperty('--dock-h', `${d}px`);
}

/**
 * The menu: every section, named, counted and grouped the way the dock
 * groups them, and then everything else the app can do. One sheet for
 * every screen -- the thumb bar's last slot on a phone, the masthead's
 * Menu on a wide one, M on the keyboard -- so nothing is behind a
 * second menu anywhere. On a wide screen it stands as a drawer at the
 * right edge; on a phone it is the sheet at the thumb.
 */
function openTabSheet() {
	const counts = lastCounts;
	const group = (id, title, note) => `<div class="sheet-head">${title} <span class="sheet-note">${note}</span></div>
		<div class="sheet-grid">${tabs().filter(t => t.group === id).map(t => `
			<button class="sheet-tab${view === t.id ? ' active' : ''}" data-act="view" data-id="${t.id}" aria-current="${view === t.id}">
				<span class="sheet-icon" aria-hidden="true">${t.icon}</span>
				<span class="sheet-name">${t.label}</span>
				${counts[t.id] ? `<span class="sheet-count">${counts[t.id]}</span>` : ''}
			</button>`).join('')}</div>`;
	const text = v => (typeof v === 'function' ? v() : v);
	const items = MENU.map(g => {
		const list = g.items.filter(i => !i.when || i.when());
		if (!list.length) return '';
		return `<div class="sheet-head">${esc(g.group)}</div>
			<div class="sheet-list">${list.map(i => `
				<button class="sheet-item${i.danger ? ' danger' : ''}" data-act="${i.act}"${(i.act === 'undo' && !store.canUndo()) || (i.act === 'redo' && !store.canRedo()) ? ' disabled' : ''}>
					<span class="sheet-item-icon" aria-hidden="true">${i.icon}</span>
					<span class="sheet-item-text"><span>${esc(text(i.label))}</span><small>${esc(text(i.hint))}</small></span>
				</button>`).join('')}</div>`;
	}).join('');
	const who = me();
	const account = feature('sync')
		? `<div class="sheet-head">Account</div><div class="sheet-list">${who
			? `<button class="sheet-item" data-act="account"><span class="sheet-item-icon" aria-hidden="true">●</span><span class="sheet-item-text"><span>${esc(who.username)}</span><small>synced to your Discord account · sync now, sign out, delete</small></span></button>`
			: '<button class="sheet-item" data-act="signin"><span class="sheet-item-icon" aria-hidden="true">○</span><span class="sheet-item-text"><span>Sign in with Discord</span><small>the same inventory on every device, and a place on the boards</small></span></button>'}</div>`
		: '';
	// Two halves, so a wide screen -- whose dock already shows the
	// sections -- can put the verbs first and the sections after.
	const host = openDialog(`<h2>Menu</h2>
		<div class="sheet-sections">
		${group('yard', 'The yard', 'planning and making')}
		${group('sea', 'The sea', 'the day itself')}
		${tabs().some(t => t.group === 'harbour') ? group('harbour', 'The harbour', 'the other sailors') : ''}
		</div>
		<div class="sheet-rest">${items}${account}</div>
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`);
	host.firstElementChild.classList.add('menu-sheet');
	// The standing section takes the focus, so the keyboard lands where
	// the eye does; the sheet's own Close is not what anyone came for.
	const here = isPhone() ? host.querySelector('.sheet-tab.active') || host.querySelector('.sheet-tab') : host.querySelector('.sheet-item:not(:disabled)');
	if (here) here.focus({ preventScroll: true });
}

/** Is the menu the dialog standing right now? */
const menuOpen = () => {
	const host = document.getElementById('dialog');
	return Boolean(host && !host.hidden && host.querySelector('.menu-sheet'));
};

// What the badges said at the last render, for the sheet.
let lastCounts = {};

export function render() {
	recompute();
	// The page says which section it is on, so a stylesheet can make
	// room where one section needs it -- the chart on a short screen.
	document.body.dataset.view = view;
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
	// The dock: every section as a cell, the icon over the name, the
	// count at its corner, the groups told apart by a hairline. The
	// same cells the phone's thumb bar draws, across the top of a wide
	// screen instead of the bottom of a narrow one -- and all of them,
	// so nothing is past an edge.
	const shown = tabs();
	document.getElementById('tabs').innerHTML = shown.map((t, i) => `${i > 0 && shown[i - 1].group !== t.group ? '<span class="tab-gap" aria-hidden="true"></span>' : ''}
		<button class="tab ${view === t.id ? 'active' : ''}" role="tab"
			aria-selected="${view === t.id}" aria-controls="screen"
			tabindex="${view === t.id ? 0 : -1}"
			data-act="view" data-id="${t.id}" id="tab-${t.id}" title="${t.label}${i < 10 ? ` (${(i + 1) % 10})` : ''}">
			<span class="tab-icon" aria-hidden="true">${t.icon}</span><span class="tab-label">${t.label}</span>${counts[t.id] ? `<span class="tab-count">${counts[t.id]}</span>` : ''}
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

	lastCounts = counts;
	paintTabBar(counts);

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
	// The chart's side panel scrolls, and a render replaces it whole.
	// Ticking a stop Done part-way down a nineteen-stop run records goods
	// and moves the pouch, so it is a real render and not a redraw of the
	// panel -- and the reader was put back at the top of the list every
	// time, with the stop they had just ticked off the screen. refreshSide
	// keeps the offset for its own redraws; this keeps it for the ones
	// that go through here.
	const sideTop = (document.querySelector('.map-side-body') || {}).scrollTop || 0;
	root.className = 'screen';
	if (view === 'plan') root.innerHTML = renderPlan();
	else if (view === 'builds') root.innerHTML = renderBuilds();
	else if (view === 'inventory') root.innerHTML = renderInventory();
	else if (view === 'tree') root.innerHTML = renderTree();
	else if (view === 'workshop') root.innerHTML = renderWorkshop();
	else if (view === 'map') root.innerHTML = renderMap();
	else if (view === 'barter') root.innerHTML = renderBarter();
	else if (view === 'crew') root.innerHTML = renderCrew();
	else if (view === 'quests') root.innerHTML = renderQuests();
	else if (view === 'community') root.innerHTML = renderCommunity();
	else root.innerHTML = renderGet();
	restoreFocus(root, focus);
	// On a phone the inventory detail is a sheet at the bottom edge, and
	// a sheet is something a thumb can move: out to the whole screen,
	// back, or away. Named, so a render -- pressing "+" redraws the
	// panel -- does not fold it back up under the hand that opened it.
	const drawer = root.querySelector('.detail.open');
	if (drawer) attachSheet(drawer, { key: 'inventory', onDismiss: () => { setSelected(null); render(); } });
	// The map draws itself after the shell exists, since it has to
	// measure the box it was given before it knows which tiles to ask
	// for.
	if (view === 'map') {
		paintMap();
		const side = root.querySelector('.map-side-body');
		if (side && sideTop) side.scrollTop = sideTop;
	}
	tickClocks();
	syncHash();
	// The tab just switched to, scrolled back to where it was left.
	if (scrollBack !== null) {
		const y = scrollBack;
		scrollBack = null;
		window.scrollTo(0, Math.min(y, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)));
	}
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

/**
 * Put a search on a tab you are not standing on yet.
 *
 * showView() takes the tab's remembered query as it arrives, so setting
 * one has to go through the same store or it is overwritten a line
 * later. This is how a door into To Get arrives with the item in the
 * search box.
 */
function setQueryFor(id, text) {
	queries[id] = text;
}

function showView(id) {
	// The phone menu, if it was standing open, goes with the old screen.
	closeBar();
	// So does a chart standing over the whole screen.
	if (id !== 'map') exitFull();
	queries[view] = query;
	if (id !== view) leaveScroll(view, id);
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
	if ((id === 'get' || id === 'map' || id === 'barter') && !barterData) loadBarter();
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
	// The flag is cleared whatever happens below -- a malformed item in
	// the address (a broken percent-sequence) throws out of the decode,
	// and a flag left set would freeze the address bar for the session.
	try {
		// Back and forward switch screens like a tab press does.
		closeBar();
		if (m[1] !== 'map') exitFull();
		queries[view] = query;
		if (m[1] !== view) leaveScroll(view, m[1]);
		setView(m[1]);
		setQuery(queries[m[1]] || '');
		if (m[1] === 'inventory') {
			// A bare #inventory is the grid with nothing open: Back from an
			// item's address closes the item, as it should.
			let item = null;
			if (m[2]) {
				try { item = decodeURIComponent(m[2]); } catch { item = null; }
			}
			setSelected(item);
		}
		// A route in a link: plotted, the chart flown to it, and the address
		// cleaned like every other payload -- a reload of the link would
		// otherwise stash the route as "Previous" again each time, and the
		// list of saved routes holds eight.
		if (m[1] === 'map' && m[2]) {
			const n = applyMapLink(m[2]);
			if (n) toast(`Route from the link: ${n} stop${n === 1 ? '' : 's'}`);
			history.replaceState(null, '', `${location.pathname}${location.search}#map`);
		}
		store.setSetting('view', m[1]);
	} finally {
		applyingHash = false;
	}
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
		// The boards ride with the table: the Barter tab needs both, and
		// a table without its boards still plans at best.
		const [table, boards, mats] = await Promise.all([
			fetch('js/all_barter.json'),
			fetch('js/barter_combos.json').catch(() => null),
			fetch('js/material_boards.json').catch(() => null)
		]);
		if (!table.ok) throw new Error(String(table.status));
		setBarterData(await table.json());
		if (boards && boards.ok) setCombos(await boards.json());
		if (mats && mats.ok) setMatBoards(await mats.json());
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


/**
 * The shader behind the page, fetched the moment it is switched on.
 *
 * It is off by default, so a static import made every visitor pay 25 KB
 * for a canvas most of them never see. Imported here instead, which
 * costs the people who turn it on one short wait and everybody else
 * nothing.
 *
 * A full-screen animation is also exactly what `prefers-reduced-motion`
 * is for. The setting still wins if it is set by hand -- it is a
 * deliberate choice, and refusing to honour it would be its own kind of
 * rude -- but nothing starts the water on that browser by itself.
 */
async function waterOn() {
	if (water) {
		water.show();
		water.play();
		return;
	}
	try {
		const { default: RealisticWaterRipples } = await import('./realistic-water-ripples.js');
		// Turned on and off again while the module was in flight.
		if (store.getSetting('water', false) !== true) return;
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

/** True when the browser has asked for less movement. */
function wantsStillness() {
	return typeof window.matchMedia === 'function'
		&& window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

/* ------------------------------------------------------------------ *
 * whether the save is reaching the disk
 * ------------------------------------------------------------------ */

/**
 * A save that fails is the one thing this app must not be quiet about:
 * every count typed from then on lives in memory only, and closing the
 * tab loses it. The store says so once per streak (tracker-save-failed)
 * and again when a write goes through (tracker-save-ok); a red badge
 * stands in the masthead for as long as it lasts, with Export in reach.
 */
function saveBadge(on, reason = null) {
	let badge = document.getElementById('save-badge');
	if (!on) {
		if (badge) badge.remove();
		return;
	}
	if (!badge) {
		badge = document.createElement('div');
		badge.id = 'save-badge';
		badge.className = 'save-badge';
		badge.setAttribute('role', 'alert');
		const head = document.querySelector('.masthead');
		if (head) head.after(badge); else document.body.prepend(badge);
	}
	const why = reason === 'quota' ? 'storage full' : 'storage unavailable';
	badge.innerHTML = `<span>Not saving — ${why}. What you change now is not kept.</span>
		<button class="ghost-btn" data-act="export">Export now</button>`;
}

function wireSaveHealth() {
	window.addEventListener('tracker-save-failed', evt => {
		const reason = evt.detail && evt.detail.reason;
		saveBadge(true, reason);
		toast(reason === 'quota'
			? 'This browser will not store any more — export a file before you close the tab'
			: 'This browser is not keeping the save — export a file before you close the tab');
	});
	window.addEventListener('tracker-save-ok', () => saveBadge(false));
	const health = store.saveHealth();
	if (!health.ok) saveBadge(true, health.reason);
	if (health.broken) offerBrokenSave();
}

/**
 * The save that could not be read at boot, kept beside the key by the
 * store. It is offered as a download rather than thrown away: it is
 * someone's inventory, and a text editor may well get it back.
 */
function offerBrokenSave() {
	const broken = store.brokenSave();
	if (!broken) return;
	const host = openDialog(`
		<h2>A save that could not be read</h2>
		<p class="dialog-copy">The data this browser had was not valid when the page opened, so the tracker started empty rather than write over it. The unreadable copy is kept — ${F(broken.text.length)} characters of it — and can be downloaded as a file to look at, or to send along with a bug report.</p>
		<div class="dialog-actions">
			<button class="act" data-broken-save>Download it</button>
			<button class="ghost-btn" data-close>Later</button>
		</div>`);
	host.querySelector('[data-broken-save]').addEventListener('click', () => {
		const blob = new Blob([broken.text], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${broken.key.replace(/[^a-z0-9.-]+/gi, '-')}.json`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
		closeDialog();
	});
}

/* ------------------------------------------------------------------ *
 * theme
 * ------------------------------------------------------------------ */

/** The three answers, in the order the button walks them. */
const THEMES = ['dark', 'light', 'system'];
const THEME_COLOR = { dark: '#0a1728', light: '#eef3f8' };
let systemTheme = null;   // the matchMedia for "system", once it is wanted

/** What the page is painted as right now: dark or light. */
function resolvedTheme() {
	const t = store.getSetting('theme', 'dark');
	if (t === 'light' || t === 'dark') return t;
	return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/**
 * Put the chosen theme on <html>. "system" takes the attribute off and
 * lets the stylesheet's prefers-color-scheme branch decide, and keeps
 * an ear on it so the address-bar colour follows a change of scheme
 * while the page is open. The page starts dark in the HTML itself, so
 * nobody who never chose sees a flash of the other one.
 */
function applyTheme() {
	const t = store.getSetting('theme', 'dark');
	const root = document.documentElement;
	if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
	else root.removeAttribute('data-theme');
	const meta = document.querySelector('meta[name="theme-color"]');
	if (meta) meta.setAttribute('content', THEME_COLOR[resolvedTheme()]);
	if (t === 'system' && !systemTheme && typeof window.matchMedia === 'function') {
		systemTheme = window.matchMedia('(prefers-color-scheme: light)');
		const follow = () => { if (store.getSetting('theme', 'dark') === 'system') applyTheme(); };
		if (typeof systemTheme.addEventListener === 'function') systemTheme.addEventListener('change', follow);
		else systemTheme.addListener(follow);
	}
	syncThemeButton();
}

/** The menu draws the theme from the setting each time it opens. */
function syncThemeButton() {}

/** The next theme round: dark, light, system, dark. */
function cycleTheme() {
	const t = store.getSetting('theme', 'dark');
	const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
	store.setSetting('theme', next, true);
	applyTheme();
	toast(next === 'system' ? `Theme follows the system — ${resolvedTheme()} right now` : `Theme: ${next}`);
}

/** The menu draws the water switch from the setting each time it opens. */
function syncWaterButton() {}

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

/* The menu, shut if it is the dialog standing. */
const closeBar = () => {
	if (menuOpen()) closeDialog();
};

function wire() {
	// A styled tip for anything wearing data-tip: the browser's yellow
	// rectangle reads like a debugger, not like the app. One element,
	// moved under whatever is pointed at or focused.
	const tip = document.createElement('div');
	tip.className = 'app-tip';
	tip.hidden = true;
	document.body.appendChild(tip);
	const showTip = target => {
		tip.textContent = target.dataset.tip;
		tip.hidden = false;
		const w = tip.offsetWidth, h = tip.offsetHeight;
		const r = target.getBoundingClientRect();
		const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
		const y = r.top - h - 10 >= 4 ? r.top - h - 10 : r.bottom + 10;
		tip.style.left = `${Math.round(x)}px`;
		tip.style.top = `${Math.round(y)}px`;
	};
	const hideTip = () => { tip.hidden = true; };
	document.addEventListener('pointerover', evt => {
		const t = evt.target.closest('[data-tip]');
		if (t) showTip(t); else if (!tip.hidden) hideTip();
	});
	document.addEventListener('focusin', evt => {
		const t = evt.target.closest('[data-tip]');
		if (t) showTip(t);
	});
	document.addEventListener('focusout', hideTip);
	document.addEventListener('scroll', hideTip, true);
	document.addEventListener('pointerdown', hideTip, true);

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

		// Everything the trace panel does answers to the one handler.
		if (act.startsWith('trace-') && traceAction(act, el)) return;
		// The Barter tab: a run drawn on the chart goes to the Map; the
		// rest is the tab's own, redrawn when it says so.
		if (act === 'barter-chart') {
			const frag = chartFragment(el);
			if (!frag) return;
			// Drawn from the run's sheet, the sheet goes: the chart is the answer.
			if (el.closest('.dialog')) closeDialog();
			applyMapLink(frag);
			showView('map');
			return;
		}
		// Sailing a run is done on the Map: the checklist is kept, the
		// route drawn on the chart, and the chart's panel becomes the
		// sheet -- the same rows the run popup had, chart in view.
		if (act === 'barter-sail') {
			if (!barterAction(act, el, render)) return;
			const frag = sailChart();
			if (el.closest('.dialog')) closeDialog();
			if (frag) applyMapLink(frag);
			setMapMode('route');
			showView('map');
			return;
		}
		// Done ticked on the Map's sheet steps the chart to the next stop.
		if (act === 'barter-stop-done' && el.closest('.map-run')) {
			const row = el.closest('.run-stop');
			const was = barterAction(act, el, render);
			if (row && !row.classList.contains('done')) mapStepTo(Number(row.dataset.i) + 1);
			if (was) render();
			return;
		}
		if (act.startsWith('barter-') && act !== 'barter-level') {
			if (barterAction(act, el, render)) render();
			return;
		}

		// Picking anything out of the menu puts it away -- unless the
		// item is a toggle that is better watched changing, in which
		// case the sheet is drawn again with the new state on it. What
		// opens a dialog of its own replaces the sheet anyway.
		const fromMenu = el.closest('.menu-sheet');
		const keeps = fromMenu && MENU.some(g => g.items.some(i => i.act === act && i.keep));
		if (fromMenu && !keeps && act !== 'more') closeDialog();

		// A way through to a screen leaves behind the dialog it was chosen
		// from: the answer is on the screen now, and the item card that
		// offered it would otherwise still be standing over the map it
		// just sent you to.
		if (NAV_ACTS.has(act) && el.closest('.dialog')) closeDialog();

		switch (act) {
			case 'view': if (el.dataset.quest) setQuestFocus(el.dataset.quest); showView(el.dataset.id); return;
			case 'tab-sheet': return openTabSheet();
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
			// The sailing numbers, folded into their line or open for
			// typing. The pouch alone is repainted -- nothing about the
			// screens below it has changed -- and the keyboard is put
			// back on the button that did it, which both states have.
			case 'sail-bar': {
				toggleSailBar();
				paintPouch({ force: true });
				// The keyboard is put back on the button that did it,
				// which both states have -- but only for the keyboard.
				// `detail` is 0 when a press came from Enter or Space;
				// giving a mouse the focus ring back would leave a box
				// standing in the bar after every fold.
				if (evt.detail === 0) {
					const back = document.querySelector('#pouch [data-act="sail-bar"]');
					if (back) back.focus({ preventScroll: true });
				}
				return;
			}
			// Every threshold and where the count stands among them.
			case 'routes': return openRoutes();
			case 'blockers-all': toggleBlockers(); return render();
			case 'enh-blocked': toggleBlocked(); return render();
			case 'open-item': hidePeek(); showView('inventory'); setSelected(el.dataset.item); return render();
			case 'vell-edit': return openVellDialog();
			case 'resets-edit': return openResetsDialog();
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
				loadMarket({ force: true }).then(ok => {
					toast(ok ? 'Market prices refreshed' : 'The Market did not answer — showing the last prices it gave');
					// The button that asked is in the bar, and so is the
					// line that says how old the prices are: the render
					// the new prices fire cannot repaint a bar the focus
					// is standing in, so this one asks for it.
					paintPouch({ force: true });
				});
				return;
			case 'water': toggleWater(); if (keeps) openTabSheet(); return;
			case 'theme': cycleTheme(); if (keeps) openTabSheet(); return;
			case 'tour': return startTour();
			case 'whats-new': return openWhatsNew();
			case 'help': return openHelp();
			case 'tables': return openTables(el.dataset.stack ? Number(el.dataset.stack) : null);
			case 'guide': return openGuide();
			case 'signin':
			case 'account': return openAccount();
			case 'feedback': return import('./feedback.js').then(m => m.openFeedback());
			case 'inbox': return import('./feedback.js').then(m => m.openInbox());
			// The masthead's Menu and the thumb bar's are the one sheet;
			// pressed while it stands, it goes.
			case 'more': if (menuOpen()) closeDialog(); else openTabSheet(); return;
			case 'map-zoom': mapZoomStep(Number(el.dataset.step)); return;
			case 'map-fit': mapFit(); return;
			case 'map-pin':
			case 'map-row': {
				const npc = Number(el.dataset.npc);
				mapCentreOn(npc);
				// A pin pressed brings its stop up the sheet.
				const row = document.querySelector(`.map-run .run-stop[data-npc="${npc}"]`);
				if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
				return;
			}
			case 'map-stash': mapCentreOnStash(Number(el.dataset.i)); return;
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
			case 'map-route-prev': loadPreviousRoute(); return;
			case 'map-route-prev-del': deletePreviousRoute(); return;
			case 'map-ration-cal': return openRationCal();
			case 'map-rations-call': putRationsCall(Number(el.dataset.k)); return;
			case 'map-pin-area': pinArea(); return;
			case 'map-pin-forget': forgetPinned(); return;
			case 'map-route-trim': trimRouteToParley(); return;
			case 'map-trades': setTradesMode(el.dataset.id); return;
			case 'map-measure': toggleMeasure(); return;
			case 'map-mini': toggleMini(); return;
			case 'map-full': toggleFull(); return;
			case 'map-3d': toggle3D(); return;
			case 'map-level': levelMap(); return;
			case 'map-style': setMapStyle(el.dataset.id); return;
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
			case 'map-pins': setMapPins(); return;
			case 'map-traces': setMapTraces(); return;
			case 'map-layers': toggleMapLayers(); return;
			case 'map-setup-pick': openSetupPicker(() => render()); return;
			case 'map-side-flip': flipMapSide(); return;
			case 'map-hunt': setMapHunt(el.dataset.id); return;
			case 'quest-map': showHunt(el.dataset.monster); return showView('map');
			// An island named on the community boards: the chart, flown there
			// once it has drawn itself.
			case 'community-isle': {
				const npc = Number(el.dataset.npc);
				if (el.closest('.dialog')) closeDialog();
				showView('map');
				setTimeout(() => mapCentreOn(npc), 350);
				return;
			}
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
			case 'map-game-in': case 'map-game-in-read': case 'map-game-in-file': case 'map-game-in-go':
				if (await gameImportAction(act, el)) render();
				return;
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
					toast(r.first
						? `Written — the untouched file is kept as ${r.original}. Load a character and open the map`
						: `Written — the file as it was is ${r.backup}, the untouched one ${r.original}. Load a character and open the map`);
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
				input.accept = 'application/json,.json,application/xml,text/xml,.xml';
				input.addEventListener('change', async () => {
					const file = input.files && input.files[0];
					if (!file) return;
					try {
						const r = importRoute(await file.text());
						if (r.game) return;
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
			case 'map-step': mapStepTo(Number(el.dataset.i), el.closest('.map-run') ? true : undefined); return;
			case 'map-follow': mapFollowToggle(); return;
			case 'map-next-only': mapNextOnlyToggle(); return;
			case 'map-port': mapPortClick(Number(el.dataset.port)); return;
			// Doors out of an item's detail: each opens the screen that
			// owns that part of the answer with the screen already
			// pointed at the item, rather than dropping you at the top of
			// it to find the thing again yourself. ui-bits.waysThrough
			// draws them; these are what they do.
			case 'goto-map': mapShowItem(el.dataset.item); showView('map'); return;
			case 'goto-quests': setQuestPay(el.dataset.item); showView('quests'); return render();
			// The plan's quest rows open the quest itself, lit and scrolled to.
			case 'get-quest': setQuestFocus(el.dataset.quest); showView('quests'); return render();
			case 'goto-tree': {
				// The Tree unfolds one queued build, so a door into it
				// carries which build that is -- worked out where the
				// door was drawn, out of the trees themselves. Searching
				// for the item keeps the branch leading down to it and
				// folds the rest away; a build is its own whole tree and
				// wants no search at all.
				const build = el.dataset.build || el.dataset.item;
				setTreeTarget(build);
				setQueryFor('tree', build === el.dataset.item ? '' : el.dataset.item);
				showView('tree');
				return render();
			}
			// The Tree, the Workshop and To Get all narrow by the same
			// search box, so a door into one arrives with the item in it
			// -- and it is kept as that tab's query, so coming back finds
			// it as it was left.
			case 'goto-workshop': setQueryFor('workshop', el.dataset.item); showView('workshop'); return render();
			case 'goto-get': setQueryFor('get', el.dataset.item); showView('get'); return render();
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
			case 'inv-kind': setInvKind(el.dataset.id); return render();
			// Select mode: tiles tick instead of opening, and the bar above
			// the grid moves the ticked ones to a storage together.
			case 'inv-select': setInvPicking(!invPicking); if (invPicking) setSelected(null); return render();
			case 'inv-pick': {
				const it = el.dataset.item;
				if (invPicked.has(it)) invPicked.delete(it); else invPicked.add(it);
				return render();
			}
			case 'inv-pick-all': {
				let items;
				try { items = JSON.parse(el.dataset.items || '[]'); } catch { items = []; }
				for (const it of items) if (store.getStock(it) > 0) invPicked.add(it);
				return render();
			}
			case 'inv-pick-none': invPicked.clear(); return render();
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
			case 'copy-csv':
				try {
					await navigator.clipboard.writeText(act === 'copy-csv' ? shoppingCSV() : shoppingText());
					toast(act === 'copy-csv' ? 'Shortfall list copied as CSV' : 'Shortfall list copied');
				} catch {
					toast('Could not reach the clipboard');
				}
				return;
			// The Crow Coin Shop, wherever it is offered from: the To Get
			// list, the Inventory panel. One dialog, one change.
			case 'coin-buy':
				openCoinBuy(el.dataset.item, Number(el.dataset.n) || 1);
				return;
			case 'craft': {
				const item = el.dataset.item;
				const field = el.dataset.times === 'field'
					? el.closest('.craft-actions').querySelector('.craft-n')
					: null;
				const asked = field ? parseAmount(field.value) : Number(el.dataset.times);
				const want = Math.max(1, asked || 1);
				const times = Math.min(want, maxCraftable(item, craftStock(item), recipes));
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
				// Counted for the career, in the same change as the craft.
				store.applyDelta(delta, 'craft', label, { tally: store.tallied({ made: { [item]: times } }) });
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
				// The failstack moves with the attempt: a failure adds one
				// (Crons or not), a success spends the stack, and the next
				// level starts from its own recommended one. It moves in
				// the same change as the stones, so the Undo the toast
				// offers takes back the attempt, not half of it.
				const tier = (tableFor(base) || { levels: [] }).levels[level - 1];
				// The attempt is counted for the career in the same change.
				let stackPatch = { tally: store.tallied({ tries: 1, wins: ok ? 1 : 0, drops: dropped ? 1 : 0 }) };
				if (tier && tier.base) {
					const stacks = { ...(store.getProfile('failstacks', {}) || {}) };
					if (ok) delete stacks[base];
					else stacks[base] = (stacks[base] ?? tier.stack) + 1;
					stackPatch.failstacks = Object.keys(stacks).length ? stacks : null;
				}
				store.applyDelta(
					spend,
					'enhance',
					ok ? `${base} reached +${level}`
						: dropped ? `${base} fell to +${level - 2} — no Crons on the attempt`
						: `Failed attempt at +${level} ${base}`,
					stackPatch
				);
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
				if (act.startsWith('get-') && getAction(act, el)) return render();
				if (act.startsWith('community-') && communityAction(act, el)) return render();
		}
	});

	// Every typed-in quantity lands here: stock on the Plan and in the
	// inventory detail, the pouch, and how many of a build you want.
	document.addEventListener('change', evt => {
		// The Value Pack is a tick rather than a number, so it lands first
		// and on its own.
		const vp = evt.target.closest('[data-act="value-pack"]');
		if (vp) {
			store.setProfile('valuePack', vp.checked);
			// The tick is in the bar, and so are the two chips it moves
			// -- the word beside it and the draws a day. The render the
			// store fires cannot repaint a bar the focus is standing in,
			// so this one asks for it.
			return paintPouch({ force: true });
		}


		// The level is a name, not a number, so it lands before the
		// numeric parse below rather than going through it.
		const lvl = evt.target.closest('[data-act="barter-level"]');
		if (lvl) {
			store.setProfile('level', lvl.value || null);
			// Same: the Parley a trade under the select is the bar's own.
			return paintPouch({ force: true });
		}

		// How the route is written to the game's map -- favourites or one
		// of its loops. A select answers on change, not on click.
		const gw = evt.target.closest('[data-act="map-game-as"]');
		if (gw) {
			setGameWrite(gw.value);
			return openGameExport();
		}

		// The region every Market price in the app is quoted in. It is a
		// chip in the bar, so the age line beside it is repainted here
		// rather than waiting for the focus to leave the select.
		const mreg = evt.target.closest('[data-act="market-region"]');
		if (mreg) {
			setMarketRegion(mreg.value);
			return paintPouch({ force: true });
		}

		// The plan's orders: the days a week at sea, and the coins kept
		// back. The activity chips are buttons and answer a click.
		const gc = evt.target.closest('[data-act="get-days"], [data-act="get-reserve"]');
		if (gc) return getChange(gc, parseAmount);

		// The ticked tiles, moved to one storage as one change.
		const pl = evt.target.closest('[data-act="inv-place"]');
		if (pl) {
			const town = pl.value === 'bags' ? '' : pl.value;
			if (!pl.value) return;
			const items = [...invPicked];
			const done = store.placeAll(items, town);
			invPicked.clear();
			if (done) toast(town ? `${items.length === 1 ? items[0] : `${items.length} items`} noted at ${town}` : `${items.length === 1 ? items[0] : `${items.length} items`} back in the bags`, true);
			else render();
			return;
		}
		const hm = evt.target.closest('[data-act="inv-home"]');
		if (hm) return store.setHome(hm.dataset.kind, hm.value);

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

		// The sailor list's order is a select now that a growth can be
		// picked to sort by, and a select answers on change -- but the
		// order is this screen's own state, so nothing writes and nothing
		// would redraw without asking for it.
		const cso = evt.target.closest('[data-act="crew-sort"]');
		if (cso) { crewAction('crew-sort', cso); return render(); }

		const cw = evt.target.closest('[data-act^="crew-"]');
		if (cw && crewChange(cw)) return;
		const tr = evt.target.closest('[data-act^="trace-"]');
		if (tr && traceChange(tr)) return;

		const ms = evt.target.closest('[data-act="map-start"]');
		if (ms) return setMapStart(Number(ms.value));

		const mr = evt.target.closest('[data-act="map-return"]');
		if (mr) return setMapReturn(mr.checked);

		const mra = evt.target.closest('[data-act="map-rations-aboard"]');
		if (mra) return setRationsAboard(mra.value);

		const bc = evt.target.closest('[data-act^="barter-"]');
		if (bc && bc.dataset.act !== 'barter-count' && bc.dataset.act !== 'barter-level' && barterChange(bc, parseAmount)) return render();

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
		// A number typed in the bar and committed with Enter keeps the
		// focus where it is, so the chips around it are repainted here
		// rather than waiting for the focus to leave the bar.
		const bar = document.getElementById('pouch');
		if (bar && bar.contains(el)) paintPouch({ force: true });
	});

	// The pouch holds its ground while you type in it; once focus leaves it
	// entirely, catch it up with whatever the change already recorded.
	wirePeek();
	wireGuide();
	wireMap();

	document.addEventListener('keydown', evt => {
		const dialog = document.getElementById('dialog');
		// A row playing a button -- a place on a community board --
		// answers Enter and Space as a button would.
		if ((evt.key === 'Enter' || evt.key === ' ') && evt.target.matches && evt.target.matches('[role="button"][data-act]:not(button)')) {
			evt.preventDefault();
			evt.target.click();
			return;
		}
		const inField = evt.target.closest('input, textarea, select, [contenteditable]');
		// The single-key shortcuts answer only when nothing that reads
		// keys of its own has the focus: the page itself, or a tab. A
		// chip, a tile, a stepper or anything playing a button keeps
		// its keys -- a "1" typed at a quantity stepper is a quantity.
		const onBare = evt.target === document.body
			|| evt.target === document.documentElement
			|| (evt.target.closest && evt.target.closest('.tab, .tabs') && !evt.target.closest('[role="button"], .chip, [contenteditable]'));

		// Ctrl+K anywhere, / outside a field: find anything. The digits
		// switch tabs, the way they do in a browser -- 1 to 9 for the
		// first nine, 0 for the tenth.
		if ((evt.ctrlKey || evt.metaKey) && !evt.altKey && evt.key.toLowerCase() === 'k') {
			evt.preventDefault();
			return openJumpPalette();
		}
		if (!inField && onBare && dialog.hidden && !evt.ctrlKey && !evt.metaKey && !evt.altKey) {
			if (evt.key === '/') {
				evt.preventDefault();
				return openJumpPalette();
			}
			// M is the menu, from anywhere on the page.
			if (evt.key === 'm' || evt.key === 'M') {
				evt.preventDefault();
				return openTabSheet();
			}
			if (/^[0-9]$/.test(evt.key)) {
				const at = evt.key === '0' ? 9 : Number(evt.key) - 1;
				if (TABS[at]) {
					evt.preventDefault();
					return showView(TABS[at].id);
				}
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

		// Inside the menu the arrows walk the items, Home and End jump
		// to the ends, as a menu is expected to.
		if (menuOpen() && evt.target.closest && evt.target.closest('.menu-sheet') && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(evt.key)) {
			const items = [...document.querySelectorAll('.menu-sheet .sheet-tab, .menu-sheet .sheet-item')].filter(b => !b.hidden && !b.disabled);
			if (items.length) {
				evt.preventDefault();
				const i = items.indexOf(evt.target);
				const next = evt.key === 'Home' ? 0 : evt.key === 'End' ? items.length - 1
					: evt.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
				items[next].focus();
			}
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
			} else if (mapIsFull()) {
				exitFull();
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
				'a[href], input, select, textarea, button:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])')]
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
		const row = tabs();
		const at = row.findIndex(t => t.id === view);
		const to = evt.key === 'Home' ? 0
			: evt.key === 'End' ? row.length - 1
			: (at + step + row.length) % row.length;
		showView(row[to].id);
		const btn = document.querySelector('.tab.active');
		if (btn) btn.focus();
	});

	// Landing in a quantity field selects what is there, so typing a new
	// number replaces it instead of appending to it.
	document.addEventListener('focusin', evt => {
		if (evt.target.classList && evt.target.classList.contains('amt')) evt.target.select();
	});

	window.addEventListener('resize', () => { measurePouch(); measureTabBar(); });
	// Turning a phone swaps the tab row for the thumb bar or back; the
	// sheets stand on the bar's height, so it is measured again.
	onPhoneChange(() => { measureTabBar(); measurePouch(); });

	// The pouch writes big silver the short way ("1.96b"); under the
	// caret it swaps to the exact digits, so editing never rounds what
	// you hold. parseAmount reads either form on the way back in.
	document.addEventListener('focusin', evt => {
		const el = evt.target.closest('[data-act="purse"]');
		if (!el || el.dataset.exact === undefined || el.value === el.dataset.exact) return;
		el.value = el.dataset.exact;
		el.select();
	});

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
		const el = evt.target.closest('[data-act="query"], [data-act="barter-hold-q"], [data-act="barter-chain-q"], [data-act="barter-mat-q"]');
		if (!el) return;
		if (el.dataset.act === 'query') setQuery(el.value);
		else if (!barterType(el)) return;
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
		tabs: tabs(),
		go: (kind, value) => {
			if (kind === 'tab') return showView(value);
			// Not the Inventory any more: an item nobody owns has no row
			// there, so the panel opened empty and Find looked broken.
			// The card says what the app knows about it either way, and
			// still opens the Inventory for anyone who wanted that.
			openItemCard(value);
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

/** A ship setup in a link: shown first, taken only on purpose. */
async function openSharedShip(payload) {
	let setup;
	try {
		setup = (await decodeShare(payload)).setup;
	} catch {
		return toast('That link does not carry a ship setup the tracker can read');
	}
	if (!setup || !setup.ship) return toast('That link does not carry a ship setup');
	const fitted = Object.entries(setup.fitted || {}).filter(([, part]) => part);
	const missing = fitted.filter(([, part]) => !(store.getStock(part) > 0)).map(([, part]) => part);
	const sailors = (setup.roster || []).length;
	const partRows = fitted.length
		? fitted.map(([slot, part]) => {
			const held = store.getStock(part) > 0;
			return `<div class="share-part${held ? ' held' : ''}">${img(part, 'share-part-icon')}
				<span class="share-part-name">${esc(part)} <small>${esc(slot)}</small></span>
				<span class="share-part-have">${held ? 'you hold it' : 'not in your inventory'}</span></div>`;
		}).join('')
		: '<p class="empty">No parts chosen by hand — the hull as it comes.</p>';
	const host = openDialog(`
		<h2>A ship in a link</h2>
		<p class="dialog-copy">Someone's <b>${esc(setup.ship)}</b>${sailors ? ` · ${sailors} sailor${sailors === 1 ? '' : 's'} on the roster` : ''}${setup.crystal ? ' · a sea crystal chosen' : ''}. Looking costs nothing; taking it replaces that hull's parts and seats and your roster, and one Undo takes it back.</p>
		<div class="share-parts">${partRows}</div>
		<div class="dialog-actions">
			${missing.length ? `<button class="act quiet" data-ship-queue title="Each missing part joins the build queue, so the plan prices the way to this ship">Queue the ${missing.length} missing part${missing.length === 1 ? '' : 's'}</button>` : ''}
			<button class="ghost-btn" data-close>Just looking</button>
			<button class="act" data-ship-take>Make it my ship</button>
		</div>`);
	host.querySelector('[data-ship-take]').addEventListener('click', () => {
		closeDialog();
		if (applyShipSetup(setup)) toast(`Sailing as ${setup.ship} — one Undo takes it back`, true);
	});
	const queue = host.querySelector('[data-ship-queue]');
	if (queue) queue.addEventListener('click', () => {
		closeDialog();
		for (const part of missing) store.addTarget(part, 1);
		toast(`Queued ${missing.length} part${missing.length === 1 ? '' : 's'} to build`, true);
	});
}

/**
 * Another sailor's boat, stood up on the Ship tab to look at: their
 * hull, parts, crystal, seats and roster in place of yours for as long
 * as the bar stands, and one press brings yours back. Nothing done
 * meanwhile is kept. `sailorId` opens the look on one of the crew.
 */
function lookAtShip(save, { name = 'a sailor', sailorId = null } = {}) {
	if (sharedKept) store.restore(sharedKept);
	closeDialog();
	sharedKept = store.capture();
	store.applyTransient(JSON.stringify(save));
	setLooking(true);
	selectSailor(sailorId);
	showSharedBar(save, { label: `Looking at ${name}’s ship — to look at, not to change.`, take: false });
	showView('crew');
}

function showSharedBar(save, { label = 'Looking at a shared plan — nothing you do here is saved.', take = true } = {}) {
	let bar = document.getElementById('shared-bar');
	if (!bar) {
		bar = document.createElement('div');
		bar.id = 'shared-bar';
		bar.className = 'shared-bar';
		document.body.appendChild(bar);
	}
	bar.innerHTML = `<span>${esc(label)}</span>
		${take ? `<button class="ghost-btn" data-shared="merge">Merge into mine</button>
		<button class="ghost-btn" data-shared="replace">Keep it, replace mine</button>` : ''}
		<button class="act" data-shared="back">Back to mine</button>`;
	bar.hidden = false;
	// The shell leaves room under its last line for the bar -- and on a
	// phone for the section bar the bar now stands on.
	document.querySelector('.shell')?.classList.add('shared');
	bar.onclick = evt => {
		const b = evt.target.closest('[data-shared]');
		if (!b) return;
		store.restore(sharedKept);
		sharedKept = null;
		setLooking(false);
		bar.hidden = true;
		document.querySelector('.shell')?.classList.remove('shared');
		if (b.dataset.shared === 'merge') { store.merge(save, 'Merged a shared plan'); toast('Merged the shared plan into yours', true); }
		else if (b.dataset.shared === 'replace') { store.adopt(save, 'Took a shared plan'); toast('Replaced yours with the shared plan', true); }
		else toast('Back to your own plan');
	};
}

/** Past this many characters a chat app is likely to cut the link. */
const LONG_LINK = 2000;

function doExport() {
	const host = openDialog(`
		<h2>Take the plan with you</h2>
		<p class="dialog-copy">A file is a backup and moves between machines. A link opens the same plan on any browser — stock, builds and crew all ride in the address — to look at without saving, or to take in. The link leaves out the diaries the app keeps for itself, which is what makes one long.</p>
		<p class="dialog-copy" data-link-size>Measuring the link…</p>
		<div class="dialog-actions">
			<button class="act" data-export-file>Download a file</button>
			<button class="ghost-btn" data-export-link>Copy a link</button>
			<button class="ghost-btn" data-close>Cancel</button>
		</div>`);
	host.querySelector('[data-export-file]').addEventListener('click', () => { closeDialog(); downloadExport(); });
	// The link is built once, up front, so its length can be said before
	// it is copied: a chat app cuts a long address short, and a cut link
	// opens as nothing.
	const shape = store.saveShape();
	const built = encodeShare(shape, { slim: true }).then(payload => shareLink(payload));
	const sizeLine = host.querySelector('[data-link-size]');
	built.then(link => {
		const n = shareSize(link);
		if (!sizeLine || !sizeLine.isConnected) return;
		if (n > LONG_LINK) {
			sizeLine.classList.add('warn');
			sizeLine.textContent = `The link is ${F(n)} characters long. Chat apps often cut a link past ${F(LONG_LINK)}, so a file is the safer way to send this one.`;
		} else {
			sizeLine.textContent = `The link is ${F(n)} characters long.`;
		}
	}).catch(() => { if (sizeLine) sizeLine.textContent = 'The link could not be built on this browser.'; });
	host.querySelector('[data-export-link]').addEventListener('click', async () => {
		try {
			const link = await built;
			await navigator.clipboard.writeText(link);
			closeDialog();
			const n = shareSize(link);
			toast(n > LONG_LINK
				? `Link copied — ${F(n)} characters; a chat app may cut it, so a file is safer`
				: `Link copied — ${F(n)} characters of address`);
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
		// What the file names that this build does not know -- an item
		// renamed by a patch, a save from a newer version. Said before the
		// choice, not after: the counts still come in under those names,
		// and nothing here will show them.
		const seen = store.inspectImport(incoming);
		const strange = [...new Set([...seen.unknownItems, ...seen.unknownTargets])];
		const strangeLine = strange.length
			? `<p class="dialog-copy warn">${F(strange.length)} item${strange.length === 1 ? '' : 's'} this version does not know: ${esc(strange.slice(0, 6).join(', '))}${strange.length > 6 ? '…' : ''}. ${strange.length === 1 ? 'Its count comes' : 'Their counts come'} in all the same, but no screen will show ${strange.length === 1 ? 'it' : 'them'} until a version that knows the name${strange.length === 1 ? '' : 's'}.</p>`
			: '';
		const host = openDialog(`
			<h2>Bring in this file?</h2>
			${strangeLine}
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
 * What arrived since you were last here.
 *
 * Shown by hand from the More menu, and once by itself when a browser
 * that has seen an older release opens a newer one. The notes live in
 * about.js, which CHANGELOG.md is also generated from -- so what a
 * player reads here and what a reader finds in the repository are the
 * same sentences.
 *
 * The pictures are the narrow copies under docs/media/small: they are
 * the only ones inside the Docker image, and a dialog on a phone should
 * not pull down a two-megabyte GIF to make its point. They load lazily,
 * so the sections nobody scrolls to cost nothing.
 */
function openWhatsNew({ onClose = null } = {}) {
	const r = RELEASES[0];
	const headline = r.sections.filter(s => s.media);
	const rest = r.sections.filter(s => !s.media);
	const points = list => (list && list.length
		? `<ul class="news-points">${list.map(p => `<li>${p}</li>`).join('')}</ul>` : '');

	// Who asked for it, in their own words, above the fold. A player who
	// wrote in and then had to open "everything else" to find themselves
	// has been thanked in a drawer.
	const t = r.thanks;
	const thanks = t && t.who && t.who.length ? `<section class="news-thanks">
		<h3>Asked for by you</h3>
		<p>${t.text}</p>
		<ul class="news-points">${t.who.map(w => `<li><b>${esc(w.name)}</b> — <i>“${w.said}”</i> ${w.did}</li>`).join('')}</ul>
		${t.foot ? `<p class="news-thanks-foot">${t.foot}</p>` : ''}
	</section>` : '';

	const host = openDialog(`
		<h2>What's new</h2>
		<p class="news-rel"><b>${esc(r.name)}</b> · version ${esc(r.id)} · ${esc(r.date)}</p>
		<p class="dialog-copy">${r.blurb}</p>
		${thanks}
		<div class="news">
			${headline.map(s => `<section class="news-item">
				<h3>${s.title}</h3>
				<img class="news-shot" src="${esc(s.media)}" alt="${esc(s.alt || '')}" loading="lazy">
				<p>${s.text}</p>
				${points(s.points)}
			</section>`).join('')}
		</div>
		<details class="help-more">
			<summary>Everything else in this release</summary>
			${rest.map(s => `<section class="news-item plain">
				<h3>${s.title}</h3>
				${s.text ? `<p>${s.text}</p>` : ''}
				${points(s.points)}
			</section>`).join('')}
		</details>
		<p class="dialog-copy">The same notes are in
			<a href="https://github.com/waliori/bdo-ship-upgrade-tracker/blob/main/CHANGELOG.md"
				target="_blank" rel="noopener">CHANGELOG.md</a>.</p>
		<div class="dialog-actions">
			<button class="act quiet" data-close>Close</button>
			<button class="act" data-act="tour">Show me around</button>
		</div>
	`, { onDismiss: onClose });
	markReleaseSeen();
	return host;
}

/** Remember that this release's notes have been read. */
function markReleaseSeen() {
	try {
		localStorage.setItem(RELEASE_KEY, RELEASE);
	} catch {
		/* private mode: it will offer again, which is the safe way round */
	}
}

/**
 * The walkthrough, as a film.
 *
 * The guided tour points at things on your own screen, which is the right
 * way to learn a control you are looking at. This is for the other
 * question -- "what is this for" -- answered once, end to end, without
 * having to do anything. It is the real app, driven and narrated; the
 * only invented thing in it is the sailors on the boards, since a
 * machine shooting a film has no deployment with players on it.
 *
 * Seven chapters joined rather than the single run this used to be, which
 * buys two things: thirteen minutes can be entered at the part you
 * actually wanted, and each part is a file of its own under
 * docs/media/guide for linking at.
 *
 * One cut for every screen now. The narrow cut existed because the
 * captions are drawn into the picture at a size a phone cannot read;
 * the film carries a caption track of its own instead, which a phone
 * renders at its own size. And a fourteen-minute film neither autoplays
 * nor loops -- `preload="metadata"` keeps it off the wire until it is
 * asked for, which matters rather more at thirty megabytes than it did
 * at seven.
 */
function openHelp() {
	const at = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	// The offsets are generated beside the film; what each part is for is
	// copy, and stays here.
	const WHAT = {
		'The Yard': 'set your numbers, queue a build, record what you gather, make it',
		'To Get': 'one way to each thing you are short of, in the days it takes',
		Quests: 'the free rewards, and recording a batch of them at once',
		'Your Ship': 'parts, crystal, appearance, and a crew read off your screenshots',
		'A Run': 'answer one island, and sail what the board lays out',
		'The Map': 'the chart full screen and stood up, and all five of its tabs',
		'The Harbour': 'the boards, and what is and is not shared'
	};
	const host = openDialog(`
		<h2>How this works</h2>
		<p>Thirteen minutes, in seven parts — the real app, driven and narrated. Start anywhere.</p>
		<video class="help-film" src="docs/media/walkthrough.mp4" controls preload="metadata" playsinline>
			<track kind="captions" srclang="en" label="English" src="docs/media/walkthrough.vtt">
		</video>
		<ol class="film-chapters">${film.map((c, i) => {
		// "Three — Your Ship" is the mark's own label; the number is
		// already in the list, so the list shows the name.
		const name = c.title.split('—').pop().trim();
		return `<li><button data-seek="${c.at}"><b>${i + 1}. ${esc(name)}</b><span>${esc(WHAT[name] || '')}</span><em>${at(c.at)}</em></button></li>`;
	}).join('')}</ol>
		<details class="help-more">
			<summary>Day by day</summary>
			<p class="dialog-copy">The working diary. What arrived between one <i>version</i> and the next is under <b>Menu → What's new</b>.</p>
			${CHANGES.slice(0, 6).map(c => `<div class="help-change"><b>${esc(c.date)}</b> — ${esc(c.title)}<ul>${c.notes.map(n => `<li>${n}</li>`).join('')}</ul></div>`).join('')}
		</details>
		<p class="dialog-copy">Look-ups open on BDOCodex in
			<select class="field select inline" data-act="codex-lang" aria-label="BDOCodex language">${CODEX_LANGS.map(([id, name]) => `<option value="${id}"${(store.getSetting('codexLang', 'us') || 'us') === id ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select>
		</p>
		<details class="help-more">
			<summary>The data, and when it was checked</summary>
			<div class="help-data">${DATA.map(d => `<div class="kv-row"><span>${esc(d.what)}</span><span class="n">${esc(d.asOf)}${d.from ? ` · ${esc(d.from)}` : ''}</span></div>`).join('')}</div>
			<p class="dialog-copy">A patch can move any of these. The Market prices are live; everything else is a snapshot the app was checked against on the date shown.</p>
		</details>
		<p class="dialog-copy help-credit">Built by <b>waliori</b> ·
			<a href="https://github.com/waliori/bdo-ship-upgrade-tracker" target="_blank" rel="noopener">the source</a>,
			free to use and to fork under
			<a href="https://github.com/waliori/bdo-ship-upgrade-tracker/blob/main/LICENSE" target="_blank" rel="noopener">MIT with Attribution</a>
			— which asks that a fork keep this line.</p>
		<div class="dialog-actions">
			<button class="act quiet" data-close>Close</button>
			<button class="act" data-act="tour">Walk me through my own screen</button>
		</div>
	`);
	// The chapter list is the only way into the middle of it: a browser
	// will not surface an mp4's own chapter marks, so the offsets are
	// kept beside the film and seeking is done by hand. Playing from a
	// standing start is the viewer's business -- thirteen minutes is not
	// something to begin without being asked.
	// `player`, not `film`: the chapter offsets imported above are called
	// that, and a const here of the same name shadows them for the whole
	// function -- including the template above, which reads them before
	// this line runs.
	const player = host.querySelector('video');
	if (player) {
		for (const b of host.querySelectorAll('[data-seek]')) {
			b.addEventListener('click', () => {
				player.currentTime = Number(b.dataset.seek);
				player.play().catch(() => { /* a browser that would rather not */ });
			});
		}
	}
	return host;
}

async function startTour() {
	// Whatever asked for it -- the Help film, most likely -- gets out of
	// the way first. A tour that highlights the page from behind a dialog
	// is worse than no tour.
	closeDialog();
	try {
		const { guidedTour } = await import('./guided-tour.js');
		if (!await guidedTour.startTour('main')) {
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
	store.useKinds(kindOf);
	store.init();

	// Before anything is drawn, so the first paint is the chosen one.
	applyTheme();

	const saved = store.getSetting('view');
	if (saved && TABS.some(t => t.id === saved)) setView(saved);
	// Someone sent this link. A bare #map is a reload of your own, and so
	// is #inventory/<item> -- the app writes that itself whenever an item
	// is open. A hash carrying a shared payload -- #share/, #trace/,
	// #ship/, #map/ -- is a thing another player wanted you to look at,
	// and neither the tour nor the notes interrupt that; they wait for
	// the next plain visit, unmarked. Read before applyHash(), which
	// rewrites a share link to a plain #plan on the way through.
	const arrivedOnALink = /^#(share|trace|ship|map)\/.+/.test(location.hash);
	// A link or a reload with a hash names a place, and the address bar
	// outranks the remembered tab.
	applyHash();

	wire();
	window.addEventListener('hashchange', applyHash);
	wireSaveHealth();
	// A quiet write that is the Map's own -- its view, a moment after a
	// stroke -- is not a reason to redraw the Map over the pen.
	store.subscribe((_, reason) => {
		if (reason === 'profile-quiet' && mapWritingView()) return;
		render();
	});
	render();
	// The minute hand on every countdown, a repaint when a reset passes
	// with the page open, and the Vell reminder if it was asked for.
	startClocks(render, checkVellReminder);
	whatsNewToast();
	// Which save this page is on. Sync mirrors the main profile only:
	// a second profile is a second save, and the account holds one.
	const prof = activeProfile();
	const profBtn = document.querySelector('[data-act="profiles"]');
	if (profBtn && prof.slug) profBtn.textContent = `Profile: ${prof.name}`;

	loadBarter();
	// A failed fetch leaves barterData unset on purpose; the network
	// coming back is the retry signal.
	window.addEventListener('online', loadBarter);

	if (store.getSetting('water', false) === true && !wantsStillness()) waterOn();
	syncWaterButton();

	const legacyDialogUp = offerLegacyImport();

	// The release notes, then the tour -- or neither, for someone who
	// followed a link here to see one particular thing.
	await firstRun({ arrivedOnALink, legacyDialogUp });

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
		wireCommunity(render, { look: lookAtShip });
		setRunSheet(runSheetHTML);
		initSync({ toast, openDialog, closeDialog, rerender: render })
			.catch(err => console.warn('[ui] sync unavailable:', err));
	}
}

/** One line about what changed since the last visit, once. */
/**
 * The day's diary line, for someone who was here yesterday.
 *
 * This is the small one: a toast naming the newest working entry. The
 * release notes are the other thing, and they get a dialog of their own
 * -- see firstRun().
 */
function whatsNewToast() {
	// The release notes say it better and at more length. When they are
	// about to open, a toast saying the same thing over the top of them
	// is just noise.
	if (releaseSeen() !== RELEASE) return;
	const KEY = 'bdo-tracker/seen';
	let seen = null;
	try { seen = localStorage.getItem(KEY); } catch { /* then say nothing */ }
	if (seen && seen !== LATEST) toast(`New since your last visit: ${CHANGES[0].title}. The details are under Help.`);
	try { localStorage.setItem(KEY, LATEST); } catch { /* private mode */ }
}

/** Which release, if any, this browser last read the notes for. */
const RELEASE_KEY = 'bdo-tracker/release';
function releaseSeen() {
	try {
		return localStorage.getItem(RELEASE_KEY);
	} catch {
		// No storage to ask: treat it as read, so a private window is not
		// shown the same notes on every load.
		return RELEASE;
	}
}

/**
 * What greets someone when the page opens, and in what order.
 *
 * Three things want the first moment, and only one of them may have it:
 *
 *   - A shared link outranks everything. Someone opening a plan, a
 *     route, a trace or a ship that another player sent them came to
 *     see that, and a dialog over it -- however new -- is in the way.
 *     They have not asked to be introduced to the app; they have asked
 *     to look at one thing in it.
 *   - Otherwise the release notes, once, for a browser that has seen an
 *     older version of this app.
 *   - Then the tour, for a browser that has never seen it -- when the
 *     notes are closed rather than behind them.
 *
 * `arrivedOnALink` is worked out before the address bar is tidied, since
 * applyHash() rewrites a share link to a plain #plan on the way through.
 */
async function firstRun({ arrivedOnALink, legacyDialogUp }) {
	// The legacy-import question owns the screen when it is up: the tour
	// would swap demo data in underneath it, and "Import it" would then
	// merge a player's history into numbers the tour throws away.
	if (arrivedOnALink || legacyDialogUp) {
		// Their notes are still waiting under More; nothing is marked read.
		return;
	}

	let tourDone = true;
	try {
		tourDone = localStorage.getItem('bdo_ship_upgrade-tour_completed') === 'true';
	} catch { /* then no tour, which is the quiet way round */ }

	const unread = releaseSeen() !== RELEASE;
	// A browser with nothing in it has never seen an older version of
	// this app, so "what's new" is a list of things it has never known
	// was missing. It gets the tour instead, and the notes are marked
	// read so they do not appear tomorrow as if they were news.
	const nothingSaved = !Object.keys(store.getAllStock()).length && !store.getTargets().length;
	const brandNew = !tourDone && nothingSaved;

	if (unread && !brandNew) {
		// The tour follows the notes rather than fighting them: closing
		// the dialog is what starts it. "Show me around" is the same
		// thing said out loud, and closes the dialog on its own way in.
		openWhatsNew({ onClose: tourDone ? null : () => startTour() });
		return;
	}
	if (unread) markReleaseSeen();
	if (!tourDone) {
		try {
			const { guidedTour } = await import('./guided-tour.js');
			guidedTour.checkAndShowInitialTour();
		} catch {
			/* the tour is optional */
		}
	}
}
