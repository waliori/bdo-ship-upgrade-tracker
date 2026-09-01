// The Map screen: the chart, your shopping list drawn onto it, and the
// gestures that move it. The viewer's state -- where you are looking,
// what you picked to show, the route you are building -- lives here,
// with the command functions the shell's event handling calls.

import { courses, courseById } from './courses.js';
import { monsters, monsterByKey } from './sea_monsters.js';
import { esc, F } from './fmt.js';
import { currentShip } from './ship.js';
import { img } from './ui-bits.js';
import {
	createMap, frame, marksFor, pan, zoomAt, clampView, fitTo,
	routeFor, routePath, project, placeTile, zoomRange
} from './map.js';
import { npcs, npcById, ports, MAX_ZOOM } from './barter_npcs.js';
import { seaRoute, openSea } from './searoute.js';
import { wharves, nearestWharf } from './wharves.js';
import { habitatsOf, habitatsOfMany } from './habitats.js';
import { monsterArt } from './monster_art.js';
import { gradeById } from './crystals.js';
import { quests } from './quests.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { openPicker } from './picker.js';
import * as store from './state.js';
import { legLengths, pathLength, sailRange, fmtRange, calibrate, fmtDistance, DEFAULT_CAL } from './sailing.js';
import { bookmarkXML, writeMode, BOOKMARK_SLOTS, CAMERA_SLOTS, LOOP_SLOTS, FILE_HINT, toGame } from './worldmap.js';
import { encodeAny, decodeAny } from './share.js';
import { canWriteFiles, gameFolderName, previousBlock } from './gamefile.js';
import { parleyPerTrade, PARLEY, GOODS } from './barter.js';
import { snapshot, barterData, barterProfile, view } from './ui-state.js';

let mapState = null;
let mapPick = null;
let pendingFit = false;

/* The planner's own state: which side-panel mode, the hand-built route,
 * and what you have already visited today. Kept across sessions the
 * same way the active tab is -- it is view state, not inventory. */
const STORE_KEY = 'bdo-tracker/map-view';
let mode = 'sail';            // sail | route | today
let kindFilter = 'all';       // all | material | trade -- one list per run
let panelOpen = true;
let searchQ = '';
let stops = [];               // npc ids, in sail order, chosen by hand
let stopsPick = '';           // the "Showing" view they were plotted under
let done = { day: '', ids: [] };
let restored = false;

let hoverNpc = null;
let pinnedNpc = null;
let fly = null;               // the rAF handle of a flight in progress

let startPort = 0;            // wharf the route sails from; 0 = first stop
let returnHome = false;       // close the loop back to that wharf
let coursesOn = [];           // community courses drawn beneath the route, by id
let huntsOn = [];             // sea monster grounds shown, by species key
let wharvesOn = [];           // 'wharf' and/or 'guild': the wharf managers drawn
let habitatsOn = true;        // the game's habitat markers: a picture per species' ground
let labelsOn = true;          // island names, faint, once the chart is close enough to read them
let sideRight = false;        // the side panel on the right-hand side instead
let follow = true;            // the step player flies the camera along
let stepIdx = 0;              // which stop the step player is on
let stepKey = '';             // the route it was on, to reset when it changes
let tradesMode = 'one';       // one | all -- how many trades a stop is costed at
let savedRoutes = [];         // { name, stops, startPort, returnHome, pick, at }
const SAVED_MAX = 8;
let miniOn = true;            // the minimap is shown
let miniPos = null;           // where it was dragged to, { x, y } from the box's corner, else the default corner
let measuring = false;        // the ruler is armed
let measurePts = [];          // the two ends of a measurement, in world space
let trace = null;             // the route being traced by hand -- see cleanTrace for its shape
let traces = [];              // traced routes kept by name, newest first
const TRACES_MAX = 20;
let traceTool = null;         // 'point' adds a stop per click, 'pen' draws while dragged, 'text' writes on the sea
let penStroke = null;         // the stroke under the pointer right now, in world space
let inkColour = '#ffd77a';    // the ink every new stop, stroke and word is drawn in
let inkWidth = 2.5;           // how thick the pen draws
let inkSize = 14;             // how big a word is written
let inkPlate = true;          // a word sits on a dark plate, to be read over bright water
let pinsOn = true;            // the barterers' own marks are drawn
let tracesOn = true;          // hand-traced routes are drawn
let editing = 0;              // the seq of the word being typed on the chart, 0 for none
let markDrag = null;          // a stop or a word being carried elsewhere: { kind, seq, from, x, y, moved }

/** The barter day: the game's lists refresh at 06:00 UTC, so "today"
 *  rolls over then, not at midnight. */
function barterDay() {
	return new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10);
}

function restore() {
	if (restored) return;
	restored = true;
	try {
		const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
		if (['sail', 'route', 'today', 'hunt', 'trace'].includes(s.mode)) mode = s.mode;
		if (['all', 'material', 'trade'].includes(s.kindFilter)) kindFilter = s.kindFilter;
		// A phone starts with the panel folded: 300 of its 400 pixels are
		// the sea's, until the panel is asked for.
		panelOpen = s.panelOpen === undefined
			? !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 720px)').matches)
			: s.panelOpen !== false;
		if (Array.isArray(s.stops)) stops = s.stops.filter(id => npcById.has(id));
		if (typeof s.stopsPick === 'string') stopsPick = s.stopsPick;
		if (s.done && s.done.day === barterDay()) done = s.done;
		if (ports.some(p => p.id === s.startPort)) startPort = s.startPort;
		returnHome = s.returnHome === true;
		follow = s.follow !== false;
		if (Array.isArray(s.coursesOn)) coursesOn = s.coursesOn.filter(id => courseById[id]);
		if (Array.isArray(s.huntsOn)) huntsOn = s.huntsOn.filter(k => monsterByKey[k]);
		if (Array.isArray(s.wharvesOn)) wharvesOn = s.wharvesOn.filter(k => k === 'wharf' || k === 'guild');
		habitatsOn = s.habitatsOn !== false;
		labelsOn = s.labelsOn !== false;
		pinsOn = s.pinsOn !== false;
		tracesOn = s.tracesOn !== false;
		if (s.trace && typeof s.trace === 'object') trace = cleanTrace(s.trace);
		if (Array.isArray(s.traces)) traces = s.traces.map(cleanTrace).filter(Boolean).slice(0, TRACES_MAX);
		if (INKS.includes(s.inkColour)) inkColour = s.inkColour;
		if (WIDTHS.some(w => w.v === s.inkWidth)) inkWidth = s.inkWidth;
		if (SIZES.some(z => z.v === s.inkSize)) inkSize = s.inkSize;
		inkPlate = s.inkPlate !== false;
		sideRight = s.sideRight === true;
		if (s.tradesMode === 'all') tradesMode = 'all';
		miniOn = s.miniOn !== false;
		if (s.miniPos && Number.isFinite(s.miniPos.x) && Number.isFinite(s.miniPos.y)) miniPos = { x: s.miniPos.x, y: s.miniPos.y };
		if (Array.isArray(s.savedRoutes)) {
			savedRoutes = s.savedRoutes.filter(r => r && typeof r.name === 'string' && Array.isArray(r.stops))
				.map(r => ({ ...r, name: r.name.slice(0, 40), stops: r.stops.filter(id => npcById.has(id)) }))
				.filter(r => r.stops.length).slice(0, SAVED_MAX);
		}
	} catch { /* a fresh chart, then */ }
}

function persist() {
	try {
		localStorage.setItem(STORE_KEY,
			JSON.stringify({ mode, panelOpen, stops, stopsPick, done, startPort, returnHome, follow, kindFilter, coursesOn, huntsOn, wharvesOn, habitatsOn, labelsOn, pinsOn, tracesOn, sideRight, tradesMode, savedRoutes, miniOn, miniPos, trace, traces, inkColour, inkWidth, inkSize, inkPlate }));
	} catch { /* private mode; the session still works */ }
}

function doneSet() {
	if (done.day !== barterDay()) done = { day: barterDay(), ids: [] };
	return new Set(done.ids);
}

/**
 * Which of the game's two refresh lists an exchange belongs to: the
 * trade-item chain deals [Level N] goods and Crow Coins, the ship
 * material list deals everything else. They refresh separately, so a
 * sailing run is planned against one of them, not a mixture.
 */
export function barterKind(name) {
	if (name === 'Crow Coin') return 'coin';
	return name.startsWith('[Level') ? 'trade' : 'material';
}

function kindMatches(name) {
	if (kindFilter === 'all') return true;
	const k = barterKind(name);
	return k === kindFilter || (kindFilter === 'trade' && k === 'coin');
}

function wantedNow() {
	if (mapPick) return { [mapPick]: 1 };
	if (kindFilter === 'all') return snapshot.missing;
	const out = {};
	for (const [k, v] of Object.entries(snapshot.missing)) {
		if (kindMatches(k)) out[k] = v;
	}
	return out;
}

function marksNow() {
	return marksFor(wantedNow(), barterData);
}

/** Everything each barterer trades, keyed by npc id -- built once from
 *  the same file the marks come from, for the pin's card. */
let goodsIndex = null;
function goodsOf(id) {
	if (!goodsIndex) {
		goodsIndex = new Map();
		for (const entry of barterData || []) {
			for (const s of entry.sources) {
				if (!goodsIndex.has(s.npc_id)) goodsIndex.set(s.npc_id, []);
				goodsIndex.get(s.npc_id).push({
					item: entry.name,
					give: s.give && s.give.name,
					giveQty: (s.give && s.give.quantity) || '1',
					recvQty: s.quantity_received || '1',
					tries: s.attempts_available || 0
				});
			}
		}
	}
	return goodsIndex.get(id) || [];
}

/** Whether the plotted route belongs to what the chart is showing.
 *  Change the view and it goes dormant rather than dragging you to
 *  islands that no longer trade the thing; the Route tab offers it
 *  back. */
function stopsLive() {
	return stops.length > 0 && stopsPick === (mapPick || '');
}

/** The stops in sailing order: the hand-plotted route if there is
 *  one for this view -- a single stop included, since one errand is
 *  still a route and its pin already wears the "1" -- else the
 *  suggested loop, turned to sail from home when a wharf is chosen,
 *  since a loop has no direction of its own. */
function routeIds(marks) {
	if (stopsLive()) return stops;
	return [];
}

/** The loop through everything you are short of, as an offer rather
 *  than a default: a chart that draws a route nobody asked for is a
 *  chart telling you where to sail before you have said what for. */
function suggestedIds(marks) {
	let ids = routeFor(marks).map(n => n.id);
	const port = ports.find(p => p.id === startPort);
	if (port && ids.length > 1) {
		const a = npcById.get(ids[0]), b = npcById.get(ids[ids.length - 1]);
		const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
		if (d(port, b) < d(port, a)) ids = [...ids].reverse();
	}
	return ids;
}

/**
 * The same line, bent round whatever land is in the way.
 *
 * Routing costs a few milliseconds a leg, which is nothing on a click
 * and far too much on every frame of a pan -- so the answer is kept
 * until the points themselves change.
 */
const bent = new Map();
export function seaBent(points) {
	if (points.length < 2) return points;
	const key = points.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
	if (!bent.has(key)) {
		if (bent.size > 24) bent.clear();
		bent.set(key, seaRoute(points));
	}
	return bent.get(key);
}

/** Those stops as world points, wharf prepended -- and appended, when
 *  the route is to end where the ship lives. */
function routeWorld(marks) {
	const pts = routeIds(marks).map(id => npcById.get(id)).filter(Boolean);
	const port = ports.find(p => p.id === startPort);
	if (!port || !pts.length) return pts;
	return returnHome ? [port, ...pts, port] : [port, ...pts];
}

/** The Hunt tab: the community courses and the monster grounds, each a
 *  switch. A course is drawn under the route in its own colour with its
 *  named waypoints; a species scatters its codex spawn points over the
 *  sea in the legend colour of the ocean map. The quests that send you
 *  after each monster are listed with it. */
function huntHTML() {
	const byMonster = {};
	for (const q of quests) if (q.monster) (byMonster[q.monster] = byMonster[q.monster] || []).push(q);
	const courseRows = courses.map(c => {
		const on = coursesOn.includes(c.id);
		return `<button class="map-course${on ? ' on' : ''}" data-act="map-course" data-id="${esc(c.id)}" aria-pressed="${on}">
			<span class="map-course-dot"></span>
			<span class="map-row-main"><span class="map-row-name">${esc(c.name)}</span><span class="map-row-sub">${esc(c.sub)}</span></span>
		</button>${on ? `<p class="map-course-note">${esc(c.note)}</p>` : ''}`;
	}).join('');
	const landmarks = [['wharf', 'Wharf managers', 'repair, rations, sailor contracts'], ['guild', 'Guild wharves', "the Old Moon Guild's, for a guild ship"]]
		.map(([k, label, sub]) => {
			const on = wharvesOn.includes(k);
			const n = wharves.filter(w => w.kind === k).length;
			return `<button class="map-course${on ? ' on' : ''}" data-act="map-wharves" data-id="${k}" aria-pressed="${on}">
				<span class="map-course-dot wharf"></span>
				<span class="map-row-main"><span class="map-row-name">${label} · ${n}</span><span class="map-row-sub">${esc(sub)}</span></span>
			</button>`;
		}).join('');
	const kinds = [['adult', 'Sea monsters'], ['young', 'Young ones'], ['ship', 'Ships'], ['boss', 'Bosses'], ['pirate', "Cox Pirates' seals"]];
	const huntRows = kinds.map(([kind, label]) => {
		const list = monsters.filter(m => m.kind === kind);
		if (!list.length) return '';
		return `<div class="map-hunt-kind">${label}</div>` + list.map(m => {
			const on = huntsOn.includes(m.key);
			const qs = byMonster[m.key] || [];
			const pic = monsterArt[m.key] ? `<img class="map-hunt-pic" src="icons/${monsterArt[m.key]}" alt="">` : `<span class="map-hunt-dot ${m.kind}"></span>`;
			return `<button class="map-hunt${on ? ' on' : ''}" data-act="map-hunt" data-id="${esc(m.key)}" aria-pressed="${on}"
				style="--hunt: ${m.colour}" ${m.points.length || m.zones ? '' : 'disabled title="Its ground is not on the chart yet"'}>
				${pic}
				<span class="map-row-main"><span class="map-row-name">${esc(m.name)}</span>
					<span class="map-row-sub">${m.points.length ? `${m.points.length} spawn point${m.points.length === 1 ? '' : 's'}` : m.zones ? 'the habitat marker; no spawn points on the codex yet' : 'ground not charted yet'}${qs.length
						? ' · ' + qs.map(q => q.name.replace(/^\[(Daily|Weekly)\] /, '')).join(', ') : ''}</span>
					${m.note ? `<span class="map-row-sub note">${esc(m.note)}</span>` : ''}</span>
			</button>`;
		}).join('');
	}).join('');
	const picked = coursesOn.length + huntsOn.length;
	const toGame = picked ? `<div class="map-side-btns">
		<button class="ghost-btn wide" data-act="map-hunt-game"
			title="Write what is ticked here into the game's world map">⚑ Put ${picked === 1 ? 'it' : 'these'} on the game's map</button>
	</div>` : '';
	return `<div class="map-courses">
		<div class="map-courses-head">Courses <span class="map-courses-credit">from gpw’s ocean map (Snuggle Sailies Route)</span></div>
		${courseRows}
	</div>
	<div class="map-courses">
		<div class="map-courses-head">Layers</div>
		<button class="map-course${habitatsOn ? ' on' : ''}" data-act="map-habitats" aria-pressed="${habitatsOn}">
			<span class="map-course-dot" style="background:#ffd77a"></span>
			<span class="map-row-main"><span class="map-row-name">Habitat markers</span><span class="map-row-sub">a picture where each species lives, as the game's map shows them</span></span>
		</button>
		<button class="map-course${labelsOn ? ' on' : ''}" data-act="map-labels" aria-pressed="${labelsOn}">
			<span class="map-course-dot" style="background:#cfe3f5"></span>
			<span class="map-row-main"><span class="map-row-name">Island names</span><span class="map-row-sub">faint, once the chart is close enough to read them</span></span>
		</button>
		<button class="map-course${pinsOn ? ' on' : ''}" data-act="map-pins" aria-pressed="${pinsOn}">
			<span class="map-course-dot" style="background:#7ef0d4"></span>
			<span class="map-row-main"><span class="map-row-name">Barterers</span><span class="map-row-sub">the ${npcs.length} island marks — put them away to read the sea itself</span></span>
		</button>
		<button class="map-course${tracesOn ? ' on' : ''}" data-act="map-traces" aria-pressed="${tracesOn}">
			<span class="map-course-dot" style="background:#ffd77a"></span>
			<span class="map-row-main"><span class="map-row-name">Traced routes</span><span class="map-row-sub">what you drew by hand, and every kept trace you have opened an eye on</span></span>
		</button>
		<div class="map-courses-head">Landmarks <span class="map-courses-credit">every wharf on BDOCodex, at its pier</span></div>
		${landmarks}
		<div class="map-courses-head">Grounds <span class="map-courses-credit">every spawn point on BDOCodex</span></div>
		${huntRows}
	</div>${toGame}`;
}

/* ------------------------------------------------------------------ *
 * the screen
 * ------------------------------------------------------------------ */

export function renderMap() {
	restore();
	if (!mapState) mapState = createMap();

	if (!barterData) {
		return '<div class="panel"><p class="empty">Loading the barter routes…</p></div>';
	}

	const marks = marksNow();

	const head = `<div class="summary">
		<span class="summary-title">Where to sail <button class="info-dot" data-act="guide"
			aria-label="Where to see these numbers in game">?</button></span>
		<div class="summary-stats">
			<div>
				<div class="summary-k">Barterers</div>
				<div class="summary-v">${F(marks.size)} of ${npcs.length}</div>
				<div class="summary-sub">${mapPick ? 'trade this' : 'have something on your list'}</div>
			</div>
			<div>
				<div class="summary-k">Showing</div>
				<div class="summary-v"><button class="map-pick-btn" data-act="map-pick-open"
					aria-label="Choose what to look for">${mapPick
						? `${img(mapPick, 'map-icon')}<span>${esc(mapPick)}</span>`
						: '<span>Everything I am short of</span>'}<span class="map-pick-caret">▾</span></button></div>
				<div class="summary-sub">drag to pan · scroll to zoom</div>
			</div>
		</div>
		<div class="map-zoom">
			<button class="ghost-btn" data-act="map-zoom" data-step="-1" aria-label="Zoom out">−</button>
			<button class="ghost-btn" data-act="map-zoom" data-step="1" aria-label="Zoom in">+</button>
			<button class="ghost-btn" data-act="map-fit" aria-label="Fit the marked islands in view">⌖</button>
			<button class="ghost-btn" data-act="map-measure" aria-pressed="${measuring}" aria-label="Measure a distance" title="Ruler: click two points on the sea">⟷</button>
			<button class="ghost-btn" data-act="map-mini" aria-pressed="${miniOn}" aria-label="Show or hide the minimap" title="Minimap: show or hide it; drag its grip to move it">▭</button>
		</div>
	</div>`;

	return head + `<div class="panel map-panel"><div class="map${measuring ? ' measuring' : ''}${sideRight ? ' side-right' : ''}${mode === 'trace' ? ' free-hand' : ''}${traceTool ? ` tracing tool-${traceTool}` : ''}" id="map" data-map>
		<div class="map-layer" data-map-layer></div>
		<div class="map-side-slot" data-map-side>${sideHTML(marks)}</div>
		<div class="map-tip" data-map-tip hidden></div>
		<div class="map-steps" data-map-steps hidden></div>
		<div class="map-coords" data-map-coords hidden></div>
		${miniHTML(marks)}
	</div></div>`;
}

/* ------------------------------------------------------------------ *
 * the side panel
 * ------------------------------------------------------------------ */

function sideHTML(marks) {
	if (!panelOpen) {
		return `<button class="map-side-pill" data-act="map-panel">☰ Where to sail</button>`;
	}
	const tabs = [['sail', 'Sail'], ['route', 'Route'], ['trace', 'Trace'], ['hunt', 'Hunt'], ['today', 'Today']]
		.map(([id, label]) => `<button class="map-tab${mode === id ? ' active' : ''}"
			data-act="map-mode" data-id="${id}">${label}</button>`).join('');
	const body = mode === 'route' ? routeHTML(marks)
		: mode === 'trace' ? traceHTML()
		: mode === 'hunt' ? huntHTML()
		: mode === 'today' ? todayHTML(marks)
		: sailHTML(marks);
	return `<div class="map-side">
		<div class="map-side-head"><span>${
			mode === 'route' ? 'Plot the loop' : mode === 'trace' ? 'Trace a route' : mode === 'hunt' ? 'Hunting grounds' : mode === 'today' ? 'Sailed today' : 'Who has it'
		}</span><span class="map-side-head-btns"><button class="map-side-close" data-act="map-side-flip" aria-label="Move the panel to the other side" title="Move the panel to the ${sideRight ? 'left' : 'right'}">⇄</button><button class="map-side-close" data-act="map-panel" aria-label="Hide the panel">${sideRight ? '›' : '‹'}</button></span></div>
		<div class="map-tabs" role="tablist">${tabs}</div>
		<div class="map-side-body">${body}</div>
	</div>`;
}

/** Up to three item icons, then a count for the rest. */
function iconStrip(items) {
	const shown = items.slice(0, 3).map(i => img(i, 'map-icon')).join('');
	const more = items.length > 3 ? `<span class="map-row-more">+${items.length - 3}</span>` : '';
	return shown + more;
}

function rowHTML(npc, sub, right, act = 'map-row') {
	return `<button class="map-row" data-act="${act}" data-npc="${npc.id}">
		<span class="map-row-dot"></span>
		<span class="map-row-main">
			<span class="map-row-name">${esc(npc.name)}</span>
			<span class="map-row-sub">${sub}</span>
		</span>
		<span class="map-row-right">${right}</span>
	</button>`;
}

function sailHTML(marks) {
	const q = searchQ.trim().toLowerCase();
	const rows = [...marks.entries()]
		.map(([id, m]) => ({ npc: npcById.get(id), m }))
		.filter(r => r.npc && (!q || r.npc.name.toLowerCase().includes(q)
			|| r.npc.at.toLowerCase().includes(q)))
		.sort((a, b) => b.m.items.size - a.m.items.size || a.npc.name.localeCompare(b.npc.name))
		.map(({ npc, m }) => {
			const items = [...m.items.keys()];
			const gives = [...new Set([...m.items.values()].flatMap(s => [...s]))];
			const kind = barterKind(items[0] || '');
			const pool = new Set(goodsOf(npc.id).filter(g => barterKind(g.item) === kind)
				.map(g => g.item)).size;
			return rowHTML(npc,
				`${esc(npc.at)}${pool > 1 ? ` · 1 of ${pool} a refresh` : ''} · for ${esc(gives.slice(0, 2).join(' / ') || '—')}`,
				iconStrip(items));
		}).join('');
	const list = rows
		|| `<p class="empty">${q ? 'No island by that name has it.'
			: 'Nothing on your list is bartered at sea.'}</p>`;
	const draw = rows && !q ? `<p class="map-hint">Today's list is <span class="gterm" role="button" tabindex="0"
		data-guide="draw">a draw</span>: each island deals one offer per list from its own
		pool, so these are the islands where it <em>can</em> appear — the “1 of N” is that
		pool.</p>` : '';
	const kinds = !mapPick ? `<div class="map-kinds">${[
			['all', 'All'], ['material', 'Materials'], ['trade', 'Trade goods']
		].map(([id, label]) => `<button class="map-kind-chip${kindFilter === id ? ' on' : ''}"
			data-act="map-kind" data-id="${id}">${label}</button>`).join('')}</div>` : '';
	return `${kinds}<input class="map-search" type="search" data-act="map-search"
			value="${esc(searchQ)}" placeholder="Filter islands…" aria-label="Filter islands">
		${draw}<div class="map-list" data-map-list>${list}</div>`;
}

function routeHTML(marks) {
	if (stops.length && !stopsLive()) {
		return `<p class="map-hint">You plotted ${stops.length} stops while showing
			<strong>${esc(stopsPick || 'everything you are short of')}</strong>; the chart
			is on something else now, so they are not drawn.</p>
			<div class="map-side-btns">
				<button class="ghost-btn" data-act="map-route-revive">Show that again</button>
				<button class="ghost-btn danger" data-act="map-route-clear">Clear it</button>
			</div>${savedHTML()}`;
	}
	const prof = barterProfile();
	const port = ports.find(p => p.id === startPort);
	// The line as it is sailed, bent round the land, one leg per stop
	// (and one more home when the loop closes).
	const world = seaBent(routeWorld(marks));
	const legs = legLengths(world);
	const legTo = k => port ? legs[k] : k > 0 ? legs[k - 1] : null;
	const me = currentShip();
	const speed = me.speed;
	const cal = sailCal();
	const measured = Number(store.getSetting('sailCal', null)) > 0;
	// A crystal that works in its own sea only lifts the quick end of the
	// range: the slow end is the route sailed where it does nothing.
	const localBoost = me.crystal && gradeById[me.crystal.grade].local ? me.speed.crystal : 0;
	const timeOf = m => m != null ? fmtRange(sailRange(m, speed.total, cal, measured)[0], sailRange(m, speed.total - localBoost, cal, measured)[1]) : '';
	const costs = stops.map(id => stopParley(id, marks, prof));
	const held = prof.parleyHeld;
	const need = costs.reduce((a, b) => a + b, 0);
	let afford = 0;
	for (let acc = 0; afford < costs.length && acc + costs[afford] <= held; afford++) acc += costs[afford];
	const overBudget = held > 0 && afford > 0 && afford < stops.length;

	const list = stops.map((id, k) => {
		const n = npcById.get(id);
		const has = marks.get(id);
		const m = legTo(k);
		const leg = m != null ? `<span class="map-leg">${esc(fmtDistance(m))}${timeOf(m) ? ` · ${esc(timeOf(m))}` : ''}</span>` : '';
		const over = held > 0 && k >= afford;
		return `<div class="map-stop-row${over ? ' over' : ''}">
			<span class="map-stop-n">${k + 1}</span>
			<span class="map-row-main">
				<span class="map-row-name">${esc(n.name)}${leg}</span>
				<span class="map-row-sub">${esc(n.at)}${has
					? ' · ' + esc([...has.items.keys()].join(', '))
					: ' · nothing on your list here'}</span>
				${cargoLine(id, has)}${over ? `<span class="map-row-sub warn">past what your Parley covers</span>` : ''}
			</span>
			<span class="map-row-right">${has ? iconStrip([...has.items.keys()]) : ''}</span>
			<button class="map-x" data-act="map-stop" data-npc="${id}"
				aria-label="Remove ${esc(n.name)} from the route">×</button>
		</div>`;
	}).join('');

	const cover = !held ? `of ${F(PARLEY.max)}`
		: held >= need ? `your ${F(held)} covers it`
		: `your ${F(held)} covers ${afford} of ${stops.length}`;
	const tradesBtn = m => `<button class="chip tiny ${tradesMode === m ? 'active' : ''}" data-act="map-trades" data-id="${m}"
		title="${m === 'one' ? 'One exchange at each stop' : 'Every attempt the offer allows at each stop'}">${m === 'one' ? 'one trade' : 'all attempts'}</button>`;
	// The hold: what the ship as fitted can carry once the crew is
	// aboard, and how many goods of each level that is. A route is only
	// as long as the deck allows.
	const rations = me.crew.appetite
		? `<div class="summary-sub">rations: the crew eats ${F(me.crew.appetite)} a day · a full ${F(me.rations)} lasts ${Math.floor(me.rations / me.crew.appetite)} days</div>`
		: `<div class="summary-sub">rations: ${F(me.rations)} when full · nobody aboard eats</div>`;
	const hold = `<div><div class="summary-k">Hold</div><div class="summary-v">${F(me.hold.free)} LT</div>
				<div class="summary-sub">${F(me.hold.limit)} as fitted${me.hold.crew ? ` less ${F(me.hold.crew)} of crew` : ''} · ${Math.floor(me.hold.free / GOODS[5].weight)} of Lv4–5 · ${Math.floor(me.hold.free / GOODS[6].weight)} of Lv6–7 a run</div>${rations}</div>`;
	const total = pathLength(world);
	const lastStop = npcById.get(stops[stops.length - 1]);
	const wharf = lastStop && !returnHome ? nearestWharf(lastStop.x, lastStop.y, 'wharf') : null;
	const wharfLine = wharf ? `<div class="summary-sub">nearest wharf to the last stop: ${esc(wharf.name)}, ${esc(fmtDistance(wharf.d * 0.25))}</div>` : '';
	const distance = world.length > 1 ? `<div><div class="summary-k">Distance</div><div class="summary-v">${esc(fmtDistance(total))}</div>
				<div class="summary-sub">≈ ${esc(timeOf(total))} at ${speed.total}% · 100% ≈ ${cal} m/s ${measured ? '±10%' : '±20%'} · <button class="linky" data-act="map-sail-cal">timed a leg?</button></div>${wharfLine}</div>` : '';
	const cargo = cargoTile({ weight: me.hold.free });
	const sailingAs = stops.length ? `<p class="map-hint map-as">Sailing as <b>${esc(me.name)}</b> <button class="linky" data-act="map-setup-pick" title="Sail a saved setup instead — the times follow its speed">switch setup ▾</button> · ${speed.total}% · ${F(me.hold.free)} LT free${me.crew.seated ? ` · ${me.crew.seated} aboard` : ''} · <button class="linky" data-act="view" data-id="crew">change</button></p>` : '';
	const stats = stops.length ? `<div class="map-stats">
			<div><div class="summary-k">Stops</div><div class="summary-v">${stops.length}</div></div>
			${distance}
			${hold}
			<div><div class="summary-k"><span class="gterm" role="button" tabindex="0" data-guide="parley">Parley</span></div><div class="summary-v">${F(need)}</div>
				<div class="summary-sub">${cover}</div><div class="chips">${tradesBtn('one')}${tradesBtn('all')}</div></div>
			${cargo}
		</div>
		${overBudget ? `<button class="ghost-btn wide" data-act="map-route-trim" title="Drop the stops past what your Parley covers">Trim to the ${afford} stop${afford === 1 ? '' : 's'} Parley covers</button>` : ''}
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-reverse">⇆ Reverse</button>
			<button class="ghost-btn" data-act="map-route-save" title="Keep this route by name, to come back to">Save…</button>
			<button class="ghost-btn danger" data-act="map-route-clear">Clear</button>
		</div>
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-link" title="A link that opens this route on this chart">Copy link</button>
			<button class="ghost-btn" data-act="map-route-export" title="Save this route as a small JSON file to share or bring back later">Export</button>
			<button class="ghost-btn" data-act="map-route-import" title="Load a route saved from here">Import</button>
		</div>
		<button class="ghost-btn wide" data-act="map-route-game" title="Write these stops into the game's world map as favourites">⚑ Put it on the game's map</button>` : `<div class="map-side-btns"><button class="ghost-btn" data-act="map-route-import" title="Load a route saved from here">Import a route</button></div>`;
	// Nothing is plotted until you say so; this is the offer, next to
	// the other ways of choosing what to look at.
	const seedBtn = !stops.length && marks.size > 1
		? `<button class="ghost-btn wide" data-act="map-route-use">Plot the loop through all ${marks.size} I am short of</button>`
		: '';
	const startRow = `<div class="map-startrow">
		<select class="purse-inline" data-act="map-start" aria-label="Start the route from">
			<option value="0">Start at the first stop</option>
			${ports.map(p => `<option value="${p.id}"${p.id === startPort ? ' selected' : ''}>from ${esc(p.name)}</option>`).join('')}
		</select>
		<label class="inline-check"><input type="checkbox" data-act="map-return"${returnHome ? ' checked' : ''}> and back</label>
	</div>`;
	const empty = !stops.length
		? `<p class="map-hint">No route plotted. Click a pin and “Add stop”, or take the loop below and change it from there.</p>`
		: `<p class="map-hint">Click a pin, then “Add stop”. The numbers sail in this order.</p>`;
	return `${empty}${sailingAs}
		${startRow}${seedBtn}<div class="map-list">${list}</div>${stats}${savedHTML()}`;
}

/* ------------------------------------------------------------------ *
 * what a route costs to sail: time, Parley, and what is in the hold
 * ------------------------------------------------------------------ */

/**
 * What one stop costs in Parley. A marked stop is priced by what you
 * are sailing there for, the dearest kind first -- that is the trade
 * you will make. A bare stop is priced by what the island actually
 * deals, which the barter data knows; only when it deals more than one
 * kind, or none we know of, does a guess come in, and then the cheaper
 * one -- an estimate should undersell the route, not pad it. Times the
 * attempts the offer allows, when the route is costed that way.
 */
function stopParley(id, marks, prof) {
	const mm = marks.get(id);
	const times = tradesMode === 'all' ? triesAt(id, marks) : 1;
	if (mm && mm.items.size) {
		// One exchange per kind you are there for: a material and a
		// trade good at the same island are two trades, two rates.
		const kinds = [...new Set([...mm.items.keys()].map(barterKind))];
		return kinds.reduce((sum, kind) => sum + parleyPerTrade({ ...prof, kind }), 0) * times;
	}
	const deals = [...new Set(goodsOf(id).map(g => barterKind(g.item)))];
	const kind = deals.length === 1 ? deals[0]
		: deals.includes('trade') || !deals.length ? 'trade'
		: deals.includes('coin') ? 'coin' : 'material';
	return parleyPerTrade({ ...prof, kind }) * times;
}

/** The speed the route is sailed at: the ship as the Crew screen has
 *  it -- hull, fitted parts and the sail seats. */
function routeSpeed() {
	return currentShip().speed;
}

/** Metres a second at 100%: the player's own figure if they timed a
 *  leg, else the working estimate. */
function sailCal() {
	const v = Number(store.getSetting('sailCal', null));
	return v > 0 ? v : DEFAULT_CAL;
}

/** How many exchanges a stop allows for what you are there for: the
 *  most any of its offers states, two where the codex states none. */
function triesAt(id, marks) {
	const mm = marks.get(id);
	const goods = goodsOf(id).filter(g => !mm || !mm.items.size || mm.items.has(g.item));
	const t = Math.max(0, ...goods.map(g => Number(g.tries) || 0));
	return t || 2;
}

/** The trade goods in the hold right now: name, level, count, weight. */
function heldGoods() {
	const out = [];
	for (const [name, qty] of Object.entries(store.getAllStock())) {
		const m = /^\[Level (\d)\]/.exec(name);
		if (!m || !qty) continue;
		const lv = Number(m[1]);
		out.push({ name, lv, qty, weight: (GOODS[lv] ? GOODS[lv].weight : 0) * qty });
	}
	return out.sort((a, b) => b.lv - a.lv || a.name.localeCompare(b.name));
}

/** What a stop wants handed over, against what is aboard. */
function cargoLine(id, has) {
	if (!has || !has.items.size) return '';
	const gives = [...new Set([...has.items.values()].flatMap(set => [...set]))].filter(g => /^\[Level/.test(g));
	if (!gives.length) return '';
	const aboard = gives.filter(g => store.getStock(g) > 0);
	return aboard.length
		? `<span class="map-row-sub ok">aboard: ${esc(aboard.map(g => `${F(store.getStock(g))}× ${g}`).join(', '))}</span>`
		: `<span class="map-row-sub warn">hands over ${esc(gives.join(' or '))} — none aboard</span>`;
}

function cargoTile(hold) {
	const goods = heldGoods();
	if (!goods.length) return '';
	const n = goods.reduce((a, g) => a + g.qty, 0);
	const w = goods.reduce((a, g) => a + g.weight, 0);
	const overW = hold && w > hold.weight;
	return `<div><div class="summary-k">Cargo</div><div class="summary-v${overW ? ' amber' : ''}">${F(n)} goods</div>
		<div class="summary-sub">${F(w)} LT${hold ? ` of ${F(hold.weight)} free` : ''}${overW ? ' · over the limit — the ship slows' : ''} · ${esc(goods.map(g => `${F(g.qty)}× Lv${g.lv}`).join(', '))}</div></div>`;
}

/* ------------------------------------------------------------------ *
 * routes kept by name
 * ------------------------------------------------------------------ */

function savedHTML() {
	if (!savedRoutes.length) return '';
	const rows = savedRoutes.map((r, i) => `<div class="map-saved-row">
		<button class="map-row saved" data-act="map-route-load" data-i="${i}" title="Plot this route${r.pick ? ` (for ${esc(r.pick)})` : ''}">
			<span class="map-row-main"><span class="map-row-name">${esc(r.name)}</span>
			<span class="map-row-sub">${r.stops.length} stop${r.stops.length === 1 ? '' : 's'}${r.pick ? ` · ${esc(r.pick)}` : ''}${r.startPort && ports.find(p => p.id === r.startPort) ? ` · from ${esc(ports.find(p => p.id === r.startPort).name)}` : ''}</span></span>
		</button>
		<button class="map-x" data-act="map-route-del" data-i="${i}" aria-label="Forget ${esc(r.name)}">×</button>
	</div>`).join('');
	return `<div class="map-saved"><div class="summary-k">Saved routes</div>${rows}</div>`;
}

function keepRoute(name, ids = stops) {
	if (!ids.length) return;
	const entry = { name, stops: [...ids], startPort, returnHome, pick: stopsPick || '', at: new Date().toISOString().slice(0, 10) };
	savedRoutes = [entry, ...savedRoutes.filter(r => r.name !== name)].slice(0, SAVED_MAX);
}

/** A plot that is about to be replaced is kept as "Previous route"
 *  rather than thrown away -- one click to make is no reason to lose
 *  twenty minutes of choosing. */
function stashRoute() {
	if (stops.length > 1) keepRoute('Previous route');
}

export function saveRouteDialog() {
	if (!stops.length) return;
	const host = openDialog(`
		<h2>Keep this route</h2>
		<p class="dialog-copy">${stops.length} stop${stops.length === 1 ? '' : 's'}${stopsPick ? ` for ${esc(stopsPick)}` : ''}. Up to ${SAVED_MAX} routes are kept on this browser; the game itself keeps three loops.</p>
		<input class="field" type="text" maxlength="40" placeholder="A name — “Tuesday coral run”" data-route-name>
		<div class="dialog-actions">
			<button class="ghost-btn" data-close>Cancel</button>
			<button class="act" data-route-save>Save</button>
		</div>`);
	const input = host.querySelector('[data-route-name]');
	input.focus();
	const save = () => {
		const name = input.value.trim();
		if (!name) return toast('Give it a name');
		keepRoute(name);
		persist();
		closeDialog();
		refreshSide();
		toast(`Kept as “${name}”`);
	};
	host.querySelector('[data-route-save]').addEventListener('click', save);
	input.addEventListener('keydown', evt => { if (evt.key === 'Enter') save(); });
}

export function loadSavedRoute(i) {
	const r = savedRoutes[i];
	if (!r) return;
	if (stops.length && stops.join('.') !== r.stops.join('.')) stashRoute();
	stops = r.stops.filter(id => npcById.has(id));
	startPort = ports.some(p => p.id === r.startPort) ? r.startPort : 0;
	returnHome = r.returnHome === true;
	mapPick = r.pick || null;
	stopsPick = r.pick || '';
	mode = 'route';
	stepIdx = 0;
	pendingFit = true;
	persist();
	refreshSide();
	paintMap();
}

export function deleteSavedRoute(i) {
	const r = savedRoutes[i];
	if (!r) return;
	savedRoutes = savedRoutes.filter((_, k) => k !== i);
	persist();
	refreshSide();
	toast(`Forgot “${r.name}”`);
}

export function setTradesMode(m) {
	tradesMode = m === 'all' ? 'all' : 'one';
	persist();
	refreshSide();
}

/** Drop the stops past what the Parley in the bar covers. */
export function trimRouteToParley() {
	const marks = marksNow();
	const prof = barterProfile();
	if (!prof.parleyHeld) return;
	const kept = [];
	let acc = 0;
	for (const id of stops) {
		const c = stopParley(id, marks, prof);
		if (acc + c > prof.parleyHeld) break;
		acc += c;
		kept.push(id);
	}
	if (!kept.length || kept.length === stops.length) return;
	stashRoute();
	stops = kept;
	persist();
	refreshSide();
	paintMap();
	toast(`Trimmed to ${kept.length} stop${kept.length === 1 ? '' : 's'} — the full route is kept as “Previous route”`);
}

/* ------------------------------------------------------------------ *
 * a route in a link
 * ------------------------------------------------------------------ */

/** The route as a hash fragment the chart can read back: stops,
 *  start wharf, the return, and what it was plotted for. */
export function routeLink() {
	const parts = [`r=${stops.join('.')}`];
	if (startPort) parts.push(`s=${startPort}`);
	if (returnHome) parts.push('h=1');
	if (stopsPick) parts.push(`p=${encodeURIComponent(stopsPick)}`);
	return `${location.origin}${location.pathname}#map/${parts.join(';')}`;
}

/** Read a link's fragment (the part after `#map/`) into the chart.
 *  Returns how many stops landed, 0 for nothing usable. */
export function applyMapLink(fragment) {
	const q = {};
	for (const part of String(fragment || '').split(';')) {
		const i = part.indexOf('=');
		if (i > 0) q[part.slice(0, i)] = part.slice(i + 1);
	}
	if (!q.r) return 0;
	const ids = [];
	for (const s of q.r.split('.')) {
		const id = Number(s);
		if (npcById.has(id) && !ids.includes(id)) ids.push(id);
	}
	if (!ids.length) return 0;
	restore();
	if (stops.length && stops.join('.') !== ids.join('.')) stashRoute();
	stops = ids;
	startPort = ports.some(p => p.id === Number(q.s)) ? Number(q.s) : 0;
	returnHome = q.h === '1';
	let pick;
	try { pick = q.p ? decodeURIComponent(q.p) : null; } catch { pick = null; }
	mapPick = pick;
	stopsPick = pick || '';
	mode = 'route';
	panelOpen = true;
	stepIdx = 0;
	pendingFit = true;
	persist();
	return ids.length;
}

/* ------------------------------------------------------------------ *
 * a route traced by hand
 *
 * A barter route is a list of islands; a hunting run, a scouting line
 * or "the way I go round the reef" is not. Here the sea itself is the
 * input: a click puts a stop where the pointer is, a stroke is drawn as
 * it is dragged, and every point is a place on the chart -- so it zooms
 * and pans with the tiles and never floats. A stop can carry a note. The
 * whole thing travels in a link, a file, or into the game's own map.
 * ------------------------------------------------------------------ */

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };

// The ink a trace is drawn in: eight colours that hold up over blue
// water, three pen widths, three sizes of writing. A closed set, so a
// trace off a stranger's link can only carry ink this chart knows.
const INKS = ['#ffd77a', '#7ef0d4', '#7ec8f0', '#c6a0ff', '#ff8f8f', '#9ce87a', '#ff9de0', '#ffffff'];
const WIDTHS = [{ v: 1.5, label: 'Fine' }, { v: 2.5, label: 'Medium' }, { v: 4.5, label: 'Bold' }];
const SIZES = [{ v: 11, label: 'S' }, { v: 14, label: 'M' }, { v: 19, label: 'L' }];
const LINE_INK = '#7ef0d4';
const inkOf = (c, fallback = INKS[0]) => (INKS.includes(c) ? c : fallback);
const widthOf = w => (WIDTHS.some(x => x.v === Number(w)) ? Number(w) : 2.5);
const sizeOf = z => (SIZES.some(x => x.v === Number(z)) ? Number(z) : 14);

const TRACE_STOPS = 40, TRACE_STROKES = 24, TRACE_WORDS = 24;

/** A trace as stored, bounded: forty stops, two dozen strokes of a few
 *  hundred points, two dozen words, a name and notes of sensible
 *  length. Every mark carries `seq`, the order it was made in, so undo
 *  can walk back through stops, strokes and words as they were laid
 *  down. A trace saved before the ink existed has none of that: its
 *  strokes are bare arrays of coordinates and its marks are numbered
 *  as they are read. */
function cleanTrace(raw) {
	if (!raw || typeof raw !== 'object') return null;
	let seq = 0;
	const stamp = v => { const n = num(v, 1, 1e9); const s = n || seq + 1; seq = Math.max(seq, s); return s; };
	const points = (Array.isArray(raw.points) ? raw.points : []).slice(0, TRACE_STOPS).map(p => {
		const x = num(p && p.x, 0, 200000), y = num(p && p.y, 0, 200000);
		if (x === null || y === null) return null;
		const out = { x, y };
		if (p.note && typeof p.note === 'string') out.note = p.note.slice(0, 120);
		if (INKS.includes(p.colour)) out.colour = p.colour;
		out.seq = stamp(p.seq);
		return out;
	}).filter(Boolean);
	const strokes = (Array.isArray(raw.strokes) ? raw.strokes : []).slice(0, TRACE_STROKES).map(st => {
		const bare = Array.isArray(st);
		const src = bare ? st : (st && Array.isArray(st.pts) ? st.pts : null);
		if (!src) return null;
		const flat = [];
		for (let i = 0; i + 1 < src.length && flat.length < 600; i += 2) {
			const x = num(src[i], 0, 200000), y = num(src[i + 1], 0, 200000);
			if (x !== null && y !== null) flat.push(x, y);
		}
		if (flat.length < 4) return null;
		return {
			pts: flat,
			colour: inkOf(bare ? null : st.colour),
			width: widthOf(bare ? null : st.width),
			seq: stamp(bare ? null : st.seq)
		};
	}).filter(Boolean);
	const texts = (Array.isArray(raw.texts) ? raw.texts : []).slice(0, TRACE_WORDS).map(w => {
		const x = num(w && w.x, 0, 200000), y = num(w && w.y, 0, 200000);
		if (x === null || y === null) return null;
		const words = String(w.text || '').slice(0, 60).trim();
		if (!words) return null;
		return { x, y, text: words, colour: inkOf(w.colour), size: sizeOf(w.size), plate: w.plate !== false, seq: stamp(w.seq) };
	}).filter(Boolean);
	if (!points.length && !strokes.length && !texts.length && !raw.name) return null;
	return {
		name: String(raw.name || '').slice(0, 40),
		notes: String(raw.notes || '').slice(0, 400),
		points, strokes, texts,
		seq,
		shown: raw.shown === true,
		at: Number(raw.at) || Date.now()
	};
}

const blankTrace = () => ({ name: '', notes: '', points: [], strokes: [], texts: [], seq: 0, at: Date.now() });

/** The trace being drawn on, made if there is none, and always with
 *  every list a trace has -- one kept from an older version may not. */
function liveTrace() {
	if (!trace) trace = blankTrace();
	if (!Array.isArray(trace.points)) trace.points = [];
	if (!Array.isArray(trace.strokes)) trace.strokes = [];
	if (!Array.isArray(trace.texts)) trace.texts = [];
	return trace;
}

/** The next number in the order marks were made in. */
function bumpSeq() {
	const t = liveTrace();
	t.seq = (Number(t.seq) || 0) + 1;
	return t.seq;
}

/** A stop or a word on the chart, by the number it was made with. */
function markBySeq(kind, seq) {
	const list = trace ? (kind === 'word' ? trace.texts : trace.points) : null;
	return (list || []).find(m => m.seq === seq) || null;
}

/** Every mark on the trace, whatever kind, newest last. */
function traceMarks(t) {
	if (!t) return [];
	return [
		...(t.points || []).map((it, i) => ({ it, i, list: t.points, kind: 'stop' })),
		...(t.strokes || []).map((it, i) => ({ it, i, list: t.strokes, kind: 'stroke' })),
		...(t.texts || []).map((it, i) => ({ it, i, list: t.texts, kind: 'word' }))
	].sort((a, b) => (Number(a.it.seq) || 0) - (Number(b.it.seq) || 0));
}

/** The traced stops as the route tab counts them: length and time. */
function traceLength() {
	if (!trace || trace.points.length < 2) return 0;
	return pathLength(trace.points);
}

/** How long ago something was kept, in the words a person would use. */
function keptWhen(at) {
	const days = Math.floor((Date.now() - (Number(at) || 0)) / 86400e3);
	if (days <= 0) return 'today';
	if (days === 1) return 'yesterday';
	if (days < 7) return `${days} days ago`;
	if (days < 14) return 'last week';
	if (days < 60) return `${Math.round(days / 7)} weeks ago`;
	return `${Math.round(days / 30)} months ago`;
}

/** A trace at a glance: the shape of it, drawn to fit a stamp. */
function traceThumb(t, w = 52, h = 34) {
	const pts = [...t.points.map(p => [p.x, p.y]), ...traceAnchors(t).map(a => [a.x, a.y])];
	if (!pts.length) return '';
	const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
	const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
	// One scale for both axes, so the drawing keeps its shape.
	const span = Math.max(x1 - x0, y1 - y0, 1);
	const k = (Math.min(w, h) - 8) / span;
	const px = x => (x - (x0 + x1) / 2) * k + w / 2;
	const py = y => (y - (y0 + y1) / 2) * k + h / 2;
	const line = list => {
		let d = '';
		for (const [x, y] of list) d += `${d ? ' L' : 'M'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`;
		return d;
	};
	let out = '';
	if (t.points.length > 1) out += `<path d="${line(t.points.map(p => [p.x, p.y]))}" stroke="${t.points[0].colour || LINE_INK}" stroke-dasharray="3 2"></path>`;
	for (const st of t.strokes || []) {
		const a = Array.isArray(st) ? st : st.pts;
		const list = [];
		for (let i = 0; i + 1 < a.length; i += 2) list.push([a[i], a[i + 1]]);
		out += `<path d="${line(list)}" stroke="${inkOf(Array.isArray(st) ? null : st.colour)}"></path>`;
	}
	for (const p of t.points.slice(0, 10)) out += `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="1.8" fill="${p.colour || LINE_INK}" stroke="none"></circle>`;
	for (const wd of (t.texts || []).slice(0, 8)) out += `<rect x="${(px(wd.x) - 4).toFixed(1)}" y="${(py(wd.y) - 1.5).toFixed(1)}" width="8" height="3" rx="1" fill="${inkOf(wd.colour)}" stroke="none"></rect>`;
	return `<svg class="trace-thumb" viewBox="0 0 ${w} ${h}" aria-hidden="true">${out}</svg>`;
}

/** The traces kept on this browser: what each one is, at a glance, with
 *  an eye that lays it over the chart without opening it. */
function traceShelf() {
	if (!traces.length) {
		return `<div class="map-courses-head">Kept traces</div>
			<p class="map-hint">None kept yet. Draw a route, name it, and press <b>Keep</b> — up to ${TRACES_MAX} live on this browser, and any of them can be laid over the chart with its eye.</p>`;
	}
	const shown = traces.filter(r => r.shown).length;
	const cards = traces.map((r, i) => {
		const bits = [
			`${r.points.length} stop${r.points.length === 1 ? '' : 's'}`,
			r.strokes.length ? `${r.strokes.length} stroke${r.strokes.length === 1 ? '' : 's'}` : '',
			(r.texts || []).length ? `${r.texts.length} word${r.texts.length === 1 ? '' : 's'}` : ''
		].filter(Boolean).join(' · ');
		const open = trace && trace.name && trace.name === r.name;
		return `<div class="trace-card${r.shown ? ' shown' : ''}${open ? ' open' : ''}">
			<button class="trace-eye" data-act="trace-eye" data-i="${i}" aria-pressed="${!!r.shown}"
				title="${r.shown ? 'Take it off the chart' : 'Lay it over the chart'}" aria-label="${r.shown ? 'Hide' : 'Show'} ${esc(r.name || 'this trace')} on the chart">${r.shown ? '◉' : '○'}</button>
			<span class="trace-thumb-box">${traceThumb(r)}</span>
			<span class="trace-card-main">
				<span class="trace-card-name">${esc(r.name || 'untitled')}${open ? '<span class="trace-card-tag">open</span>' : ''}</span>
				<span class="trace-card-sub">${bits} · kept ${keptWhen(r.at)}</span>
				${r.notes ? `<span class="trace-card-note">${esc(r.notes)}</span>` : ''}
			</span>
			<span class="trace-card-btns">
				<button class="ghost-btn tiny" data-act="trace-load" data-i="${i}" title="Open it to draw on">Open</button>
				<button class="ghost-btn tiny" data-act="trace-rename" data-i="${i}" title="Rename it" aria-label="Rename ${esc(r.name || 'this trace')}">✎</button>
				<button class="ghost-btn tiny" data-act="trace-share" data-i="${i}" title="Copy a link to it" aria-label="Copy a link to ${esc(r.name || 'this trace')}">↗</button>
				<button class="map-x" data-act="trace-del" data-i="${i}" aria-label="Forget ${esc(r.name || 'this trace')}">×</button>
			</span>
		</div>`;
	}).join('');
	return `<div class="map-courses-head">Kept traces <span class="map-courses-credit">${traces.length} of ${TRACES_MAX}${shown ? ` · ${shown} on the chart` : ''}</span></div>
		<div class="trace-shelf">${cards}</div>
		${shown ? `<div class="map-side-btns"><button class="ghost-btn" data-act="trace-eye-none">Clear the chart of them</button></div>` : ''}`;
}

function traceHTML() {
	const t = trace || blankTrace();
	const words = t.texts || [];
	const dot = id => (id === 'point' ? LINE_INK : inkColour);
	const tool = (id, label, hint) => `<button class="map-course${traceTool === id ? ' on' : ''}" data-act="trace-tool" data-id="${id}" aria-pressed="${traceTool === id}">
		<span class="map-course-dot" style="background:${dot(id)}"></span>
		<span class="map-row-main"><span class="map-row-name">${label}</span><span class="map-row-sub">${hint}</span></span></button>`;
	const swatch = c => `<button class="map-ink${c === inkColour ? ' on' : ''}" data-act="trace-ink" data-colour="${c}" style="--ink:${c}" aria-pressed="${c === inkColour}" aria-label="Draw in ${c}" title="Draw in this colour"></button>`;
	const pick = (act, list, now, unit) => list.map(o => `<button class="map-pen${o.v === now ? ' on' : ''}" data-act="${act}" data-v="${o.v}" aria-pressed="${o.v === now}" title="${o.label}">${
		unit === 'pen' ? `<span class="map-pen-bar" style="height:${Math.max(2, o.v)}px;background:${inkColour}"></span>` : `<span style="font-size:${Math.round(o.v * 0.8)}px">${o.label}</span>`
	}</button>`).join('');
	const stops = t.points.map((p, i) => `<div class="map-trace-stop">
		<span class="map-trace-n" style="border-color:${p.colour || LINE_INK};color:${p.colour || LINE_INK}">${i + 1}</span>
		<input class="field small" type="text" maxlength="120" placeholder="a note for this stop" value="${esc(p.note || '')}" data-act="trace-point-note" data-i="${i}" aria-label="Note for stop ${i + 1}">
		<button class="map-x" data-act="trace-point-del" data-i="${i}" aria-label="Remove stop ${i + 1}">×</button>
	</div>`).join('');
	const wordRows = words.map((w, i) => `<div class="map-trace-stop">
		<button class="map-trace-n word" style="border-color:${w.colour};color:${w.colour}" data-act="trace-text-ink" data-i="${i}" aria-label="Restyle word ${i + 1}" title="Give this word the ink and size chosen above">✎</button>
		<input class="field small" type="text" maxlength="60" placeholder="the word on the chart" value="${esc(w.text)}" data-act="trace-text" data-i="${i}" aria-label="Word ${i + 1}">
		<button class="map-x" data-act="trace-text-del" data-i="${i}" aria-label="Remove word ${i + 1}">×</button>
	</div>`).join('');
	const m = traceLength();
	const speed = routeSpeed();
	const time = m ? fmtRange(...sailRange(m, speed.total, sailCal(), Number(store.getSetting('sailCal', null)) > 0)) : '';
	const has = t.points.length || t.strokes.length || words.length;
	const saved = traceShelf();
	return `<div class="map-courses">
		<div class="map-courses-head">Tools <span class="map-courses-credit">the islands sit still while you draw</span></div>
		${tool('point', 'Add stops', 'click the sea for a numbered stop; drag one to move it')}
		${tool('pen', 'Draw', 'drag to draw a line; it stays with the chart')}
		${tool('text', 'Write', 'click the sea and type; drag a word to move it, click it to retype')}
		<div class="map-inks" role="group" aria-label="Ink colour">${INKS.map(swatch).join('')}</div>
		<div class="map-style-row">
			<span class="map-style-label">Stroke</span><span class="map-pens">${pick('trace-width', WIDTHS, inkWidth, 'pen')}</span>
			<span class="map-style-label">Words</span><span class="map-pens">${pick('trace-size', SIZES, inkSize, 'text')}</span>
			<button class="map-pen wide${inkPlate ? ' on' : ''}" data-act="trace-plate" aria-pressed="${inkPlate}" title="A dark plate behind a word, to read it over bright water">plate</button>
		</div>
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="trace-undo" ${has ? '' : 'disabled'} title="Take back the last mark, whatever kind it was">↶ Undo</button>
			<button class="ghost-btn" data-act="trace-clear" ${has ? '' : 'disabled'}>Clear</button>
			<button class="ghost-btn${tracesOn ? ' on' : ''}" data-act="map-traces" aria-pressed="${tracesOn}" title="Show or hide everything traced, without losing any of it">${tracesOn ? '◉ Shown' : '○ Hidden'}</button>
		</div>
	</div>
	<div class="map-courses">
		<input class="field" type="text" maxlength="40" placeholder="Name this route" value="${esc(t.name)}" data-act="trace-name" aria-label="Name of the traced route">
		<textarea class="field map-trace-notes" maxlength="400" rows="2" placeholder="Notes — what it is for, when to sail it, what to watch" data-act="trace-notes" aria-label="Notes">${esc(t.notes)}</textarea>
		${t.points.length ? `<div class="map-trace-stops">${stops}</div>` : '<p class="map-hint">No stops yet. Pick <b>Add stops</b> and click the sea, <b>Draw</b> and drag to sketch, or <b>Write</b> and type on the water.</p>'}
		${words.length ? `<div class="map-courses-head">Words on the chart</div><div class="map-trace-stops">${wordRows}</div>` : ''}
		${m ? `<p class="map-hint">${esc(fmtDistance(m))} stop to stop${time ? ` · ≈ ${esc(time)} at ${speed.total}%` : ''}</p>` : ''}
		<div class="map-side-btns">
			<button class="act small" data-act="trace-save" ${has ? '' : 'disabled'} title="Keep it on this browser, by name">Keep</button>
			<button class="ghost-btn" data-act="trace-link" ${has ? '' : 'disabled'} title="A link that carries the whole trace — stops, notes, drawing and words">Copy link</button>
			<button class="ghost-btn" data-act="trace-export" ${has ? '' : 'disabled'} title="A JSON file of it">File</button>
			<button class="ghost-btn" data-act="map-game" data-source="trace" ${t.points.length ? '' : 'disabled'} title="Write the stops into the game's world map as favourites or a loop">⚑ To the game</button>
		</div>
	</div>
	${saved}`;
}

/** One trace's ink on the chart: the line through its stops, the stops
 *  themselves with their notes, every stroke drawn, and every word
 *  written -- each in the ink it was made with. `live` is the trace
 *  being worked on; a kept one laid over the chart is drawn quieter and
 *  does not take the pen's unfinished stroke. */
function traceArt(t, size, live) {
	let html = '';
	const P = p => project(mapState, size, p.x, p.y);
	if (t.points.length > 1) {
		const d = routePath(t.points.map(P), size);
		const c = t.points[0].colour || LINE_INK;
		html += `<svg class="map-route map-trace-line"><path class="map-trace-glow" style="stroke:${c}" d="${d}"></path><path class="map-trace-path" style="stroke:${c}" d="${d}"></path></svg>`;
	}
	const strokes = live && penStroke ? [...t.strokes, { pts: penStroke, colour: inkColour, width: inkWidth }] : t.strokes;
	for (const st of strokes) {
		const pts = Array.isArray(st) ? st : st.pts;
		let d = '';
		for (let i = 0; i + 1 < pts.length; i += 2) {
			const at = project(mapState, size, pts[i], pts[i + 1]);
			d += `${d ? ' L' : 'M'}${at.left.toFixed(1)} ${at.top.toFixed(1)}`;
		}
		if (d) html += `<svg class="map-route map-trace-line"><path class="map-trace-stroke" style="stroke:${inkOf(st.colour)};stroke-width:${widthOf(st.width)}" d="${d}"></path></svg>`;
	}
	const onScreen = at => at.left > -40 && at.top > -40 && at.left < size.w + 40 && at.top < size.h + 40;
	t.points.forEach((p, i) => {
		const at = P(p);
		if (!onScreen(at)) return;
		const c = p.colour || LINE_INK;
		const note = live && p.note ? `<span class="map-trace-note">${esc(p.note)}</span>` : '';
		html += `<span class="map-trace-dot${p.note ? ' noted' : ''}"${live ? ` data-mark="stop" data-seq="${p.seq}"` : ''} style="left:${Math.round(at.left)}px;top:${Math.round(at.top)}px;border-color:${c};color:${c}" title="${esc(p.note || `stop ${i + 1}`)}${live && mode === 'trace' ? ' · drag it to move it' : ''}">${i + 1}${note}</span>`;
	});
	for (const w of (t.texts || [])) {
		if (live && w.seq === editing) continue;          // that one is an input, below
		const at = P(w);
		if (!onScreen(at) || !w.text) continue;
		html += `<span class="map-trace-word${w.plate ? ' plate' : ''}"${live ? ` data-mark="word" data-seq="${w.seq}" title="Drag it where it belongs · click to retype it"` : ''} style="left:${Math.round(at.left)}px;top:${Math.round(at.top)}px;color:${inkOf(w.colour)};font-size:${sizeOf(w.size)}px">${esc(w.text)}</span>`;
	}
	return html;
}

/** Everything traced that is meant to be seen: the kept traces with an
 *  eye open on them, then the one being worked on over the top. */
function paintTrace(layer, size) {
	let box = layer._traceBox;
	if (!box || box.parentNode !== layer) {
		box = layer._traceBox = document.createElement('div');
		box.className = 'map-trace-layer';
		layer.appendChild(box);
	}
	// The drawing is rebuilt whole at every paint; the word being typed
	// is not, so it lives beside it rather than inside it.
	let art = box._art;
	if (!art || art.parentNode !== box) {
		art = box._art = document.createElement('div');
		art.className = 'map-trace-art';
		box.appendChild(art);
	}
	const open = trace && trace.name ? trace.name : null;
	// A kept trace that is open is the one being drawn on; it must not
	// also be painted underneath itself.
	const ghosts = tracesOn ? traces.filter(r => r.shown && r.name !== open) : [];
	const t = tracesOn ? trace : null;
	const empty = !t || (!t.points.length && !t.strokes.length && !(t.texts || []).length && !penStroke);
	if (empty && !ghosts.length) {
		art.innerHTML = '';
		paintWriting(box, size);
		return;
	}
	let html = '';
	for (const g of ghosts) html += `<div class="map-trace-ghost">${traceArt(g, size, false)}</div>`;
	if (!empty) html += traceArt(t, size, true);
	art.innerHTML = html;
	paintWriting(box, size);
}

/** The word being typed is a real input standing on the chart. It is
 *  kept across paints -- rebuilt with the rest it would lose the caret
 *  at every pan -- and only moved. */
function paintWriting(box, size) {
	const item = editing && trace ? (trace.texts || []).find(w => w.seq === editing) : null;
	let edit = box._edit;
	if (edit && (!item || box._editSeq !== editing || edit.parentNode !== box)) { edit.remove(); edit = box._edit = null; }
	if (!item) return;
	if (!edit) {
		edit = box._edit = document.createElement('input');
		box._editSeq = editing;
		edit.className = 'map-trace-write';
		edit.type = 'text';
		edit.maxLength = 60;
		edit.placeholder = 'write here';
		edit.setAttribute('aria-label', 'Word on the chart');
		edit.value = item.text || '';
		edit.addEventListener('input', () => { item.text = edit.value.slice(0, 60); });
		edit.addEventListener('keydown', e => {
			if (e.key === 'Enter') { e.preventDefault(); endWriting(); }
			else if (e.key === 'Escape') { e.preventDefault(); item.text = ''; endWriting(); }
			e.stopPropagation();
		});
		// Losing focus is done typing -- unless the input was torn out
		// from under the pointer. Anything that redraws the whole screen
		// rebuilds the layer this stands in, and the browser blurs what
		// it removes: taking that for "done" threw the word away
		// mid-word. The answer waits a tick, when the removal has
		// settled: gone from the page, the word stays open and the next
		// paint stands it back up where it was.
		edit.addEventListener('blur', () => setTimeout(() => { if (edit.isConnected) endWriting(); }, 0));
		box.appendChild(edit);
		setTimeout(() => { if (box._edit === edit) edit.focus(); }, 0);
	}
	const at = project(mapState, size, item.x, item.y);
	edit.style.left = `${Math.round(Math.max(4, Math.min(size.w - 130, at.left)))}px`;
	edit.style.top = `${Math.round(Math.max(4, Math.min(size.h - 30, at.top)))}px`;
	edit.style.color = inkOf(item.colour);
	edit.style.fontSize = `${sizeOf(item.size)}px`;
}

/** An empty word is no word at all: the only one kept is the one being
 *  typed at this moment. */
function dropBlankWords() {
	if (!trace || !Array.isArray(trace.texts)) return;
	trace.texts = trace.texts.filter(w => String(w.text || '').trim() || w.seq === editing);
}

/** Done typing. */
function endWriting() {
	if (!editing) return;
	editing = 0;
	dropBlankWords();
	persist();
	refreshSide();
	paintMap();
}

function atSea(host, clientX, clientY) {
	const box = host.getBoundingClientRect();
	const p = unproject({ w: box.width, h: box.height }, clientX - box.left, clientY - box.top);
	return { x: Math.round(p.x), y: Math.round(p.y) };
}

function traceAdd(host, clientX, clientY) {
	const t = liveTrace();
	if (t.points.length >= TRACE_STOPS) return toast(`${TRACE_STOPS} stops is the most a trace holds`);
	t.points.push({ ...atSea(host, clientX, clientY), colour: inkColour, seq: bumpSeq() });
	persist();
	refreshSide();
	paintMap();
}

function textAdd(host, clientX, clientY) {
	const t = liveTrace();
	// Whatever was open and still blank was never a word.
	editing = 0;
	dropBlankWords();
	if (t.texts.length >= TRACE_WORDS) return toast(`${TRACE_WORDS} words is the most a trace holds`);
	const w = { ...atSea(host, clientX, clientY), text: '', colour: inkColour, size: inkSize, plate: inkPlate, seq: bumpSeq() };
	t.texts.push(w);
	editing = w.seq;
	persist();
	refreshSide();
	paintMap();
}

function penStart(host, clientX, clientY) {
	const p = atSea(host, clientX, clientY);
	penStroke = [p.x, p.y];
}

function penMove(host, clientX, clientY) {
	if (!penStroke) return;
	const p = atSea(host, clientX, clientY);
	// One point every few screen pixels: enough for a curve, few enough
	// to travel in a link.
	const scale = Math.pow(2, MAX_ZOOM - mapState.zoom);
	const lx = penStroke[penStroke.length - 2], ly = penStroke[penStroke.length - 1];
	if (Math.hypot(p.x - lx, p.y - ly) < 4 * scale) return;
	if (penStroke.length < 1200) penStroke.push(p.x, p.y);
	schedulePaint();
}

function penEnd() {
	if (!penStroke) return;
	if (penStroke.length >= 4) {
		const t = liveTrace();
		if (t.strokes.length >= TRACE_STROKES) toast(`${TRACE_STROKES} strokes is the most a trace holds`);
		else t.strokes.push({ pts: penStroke, colour: inkColour, width: inkWidth, seq: bumpSeq() });
	}
	penStroke = null;
	persist();
	refreshSide();
	paintMap();
}

export function setTraceTool(id) {
	if (editing) endWriting();
	traceTool = traceTool === id ? null : (['pen', 'point', 'text'].includes(id) ? id : null);
	if (traceTool && measuring) toggleMeasure();
	markTraceHost();
	if (traceTool === 'point') toast('Click the sea to add a stop');
	if (traceTool === 'pen') toast('Drag on the sea to draw');
	if (traceTool === 'text') toast('Click the sea, then type');
	refreshSide();
}

/** The map box wears what is going on: which tool has the pointer, and
 *  whether the chart's own markers are listening at all. */
function markTraceHost() {
	const host = document.querySelector('[data-map]');
	if (!host) return;
	host.classList.toggle('tracing', Boolean(traceTool));
	for (const id of ['pen', 'point', 'text']) host.classList.toggle(`tool-${id}`, traceTool === id);
	host.classList.toggle('free-hand', mode === 'trace');
}

/** Every trace-* action from the panel. Returns true when it was one. */
export function traceAction(act, el) {
	const i = Number(el && el.dataset.i);
	switch (act) {
		case 'trace-tool': setTraceTool(el.dataset.id); return true;
		case 'trace-ink': {
			inkColour = inkOf(el.dataset.colour);
			const w = editing && trace ? trace.texts.find(x => x.seq === editing) : null;
			if (w) w.colour = inkColour;
			break;
		}
		case 'trace-width': inkWidth = widthOf(el.dataset.v); break;
		case 'trace-size': {
			inkSize = sizeOf(el.dataset.v);
			const w = editing && trace ? trace.texts.find(x => x.seq === editing) : null;
			if (w) w.size = inkSize;
			break;
		}
		case 'trace-plate': {
			inkPlate = !inkPlate;
			const w = editing && trace ? trace.texts.find(x => x.seq === editing) : null;
			if (w) w.plate = inkPlate;
			break;
		}
		case 'trace-text-ink': {
			const w = trace && trace.texts[i];
			if (!w) return true;
			w.colour = inkColour; w.size = inkSize; w.plate = inkPlate;
			break;
		}
		case 'trace-text-del':
			if (trace && trace.texts[i]) {
				if (trace.texts[i].seq === editing) editing = 0;
				trace.texts.splice(i, 1);
			}
			break;
		case 'trace-undo': {
			// Back through the marks in the order they were made, so a
			// stroke drawn after a stop is the first thing taken back --
			// not every stop first because stops are a different list.
			const marks = traceMarks(trace);
			const last = marks[marks.length - 1];
			if (!last) return true;
			if (last.kind === 'word' && last.it.seq === editing) editing = 0;
			last.list.splice(last.i, 1);
			break;
		}
		case 'trace-clear': trace = null; traceTool = null; editing = 0; break;
		case 'trace-point-del': if (trace && trace.points[i]) trace.points.splice(i, 1); break;
		case 'trace-save': {
			const t = trace;
			if (!t || (!t.points.length && !t.strokes.length && !t.texts.length)) return true;
			const name = t.name.trim() || `Trace ${traces.length + 1}`;
			t.name = name;
			traces = [{ ...t, at: Date.now() }, ...traces.filter(r => r.name !== name)].slice(0, TRACES_MAX);
			toast(`Kept “${name}”`);
			break;
		}
		case 'trace-eye': if (traces[i]) { traces[i].shown = !traces[i].shown; if (traces[i].shown) tracesOn = true; } break;
		case 'trace-eye-none': traces = traces.map(r => ({ ...r, shown: false })); break;
		case 'trace-rename': {
			const r = traces[i];
			if (!r) return true;
			renameTraceDialog(i);
			return true;
		}
		case 'trace-share': {
			const r = traces[i];
			if (!r) return true;
			(async () => {
				try {
					await navigator.clipboard.writeText(traceLink(await encodeAny({
						app: 'bdo-ship-upgrade-tracker', kind: 'trace', version: 2, exported: new Date().toISOString(),
						name: r.name, notes: r.notes, points: r.points, strokes: r.strokes, texts: r.texts || []
					})));
					toast(`Link to “${r.name}” copied`);
				} catch { toast('Could not reach the clipboard'); }
			})();
			return true;
		}
		case 'trace-load': if (traces[i]) { trace = cleanTrace(traces[i]); editing = 0; pendingFit = { points: trace.points.length ? trace.points : traceAnchors(trace) }; } break;
		case 'trace-del': traces = traces.filter((_, k) => k !== i); break;
		case 'trace-link':
			(async () => {
				try {
					await navigator.clipboard.writeText(traceLink(await encodeAny(traceExportObject())));
					toast('Trace link copied');
				} catch { toast('Could not reach the clipboard'); }
			})();
			return true;
		case 'trace-export': {
			const blob = new Blob([JSON.stringify(traceExportObject(), null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url; a.download = `${(trace && trace.name.trim()) || 'trace'}.json`;
			document.body.appendChild(a); a.click(); a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			return true;
		}
		default: return false;
	}
	persist();
	refreshSide();
	paintMap();
	return true;
}

/** Rename a kept trace, in place on the shelf. */
function renameTraceDialog(i) {
	const r = traces[i];
	if (!r) return;
	const host = openDialog(`
		<h2>Rename this trace</h2>
		<p class="dialog-copy">${esc(r.name || 'untitled')} — ${r.points.length} stop${r.points.length === 1 ? '' : 's'}, kept ${keptWhen(r.at)}.</p>
		<input class="field" type="text" maxlength="40" value="${esc(r.name || '')}" data-trace-name>
		<div class="dialog-actions">
			<button class="ghost-btn" data-close>Cancel</button>
			<button class="act" data-trace-rename>Rename</button>
		</div>`);
	const input = host.querySelector('[data-trace-name]');
	input.focus();
	input.select();
	const save = () => {
		const name = input.value.trim();
		if (!name) return toast('Give it a name');
		if (traces.some((o, k) => k !== i && o.name === name)) return toast('There is already a trace by that name');
		if (trace && trace.name === r.name) trace.name = name;
		r.name = name;
		persist();
		closeDialog();
		refreshSide();
		paintMap();
		toast(`Now “${name}”`);
	};
	host.querySelector('[data-trace-rename]').addEventListener('click', save);
	input.addEventListener('keydown', evt => { if (evt.key === 'Enter') save(); });
}

/** A field typed into on the trace panel: the name, the notes, a
 *  stop's note, a word on the chart. */
export function traceChange(el) {
	const act = el.dataset.act;
	if (!['trace-name', 'trace-notes', 'trace-point-note', 'trace-text'].includes(act)) return false;
	const t = liveTrace();
	if (act === 'trace-name') t.name = el.value.slice(0, 40);
	else if (act === 'trace-notes') t.notes = el.value.slice(0, 400);
	else if (act === 'trace-text') {
		const w = t.texts[Number(el.dataset.i)];
		if (w) {
			if (el.value.trim()) w.text = el.value.slice(0, 60);
			else t.texts = t.texts.filter(x => x !== w);
		}
	} else { const p = t.points[Number(el.dataset.i)]; if (p) { if (el.value.trim()) p.note = el.value.slice(0, 120); else delete p.note; } }
	persist();
	paintMap();
	return true;
}

/** Everywhere a trace touches the chart, for fitting the view to it. */
const traceAnchors = t => [
	...(t.strokes || []).flatMap(st => {
		const pts = Array.isArray(st) ? st : st.pts;
		const out = [];
		for (let i = 0; i + 1 < pts.length; i += 2) out.push({ x: pts[i], y: pts[i + 1] });
		return out;
	}),
	...(t.texts || []).map(w => ({ x: w.x, y: w.y }))
];

function traceExportObject() {
	const t = trace || blankTrace();
	return { app: 'bdo-ship-upgrade-tracker', kind: 'trace', version: 2, exported: new Date().toISOString(), name: t.name, notes: t.notes, points: t.points, strokes: t.strokes, texts: t.texts || [] };
}

export function traceLink(payload) {
	return `${location.origin}${location.pathname}#trace/${payload}`;
}

/** A trace from a link or a file, onto the chart. Returns it, or null. */
export async function applyTraceLink(payload) {
	let data;
	try { data = await decodeAny(payload); } catch { return null; }
	return applyTraceObject(data);
}

export function applyTraceObject(data) {
	const t = data && data.kind === 'trace' ? cleanTrace(data) : null;
	if (!t) return null;
	restore();
	trace = t;
	editing = 0;
	mode = 'trace';
	panelOpen = true;
	pendingFit = { points: t.points.length ? t.points : traceAnchors(t) };
	persist();
	return t;
}

/** The traced marks for the game's map, numbered, named by their
 *  notes. A loop is sailed, so it takes the stops alone; favourites are
 *  places, so the words written on the chart come too. */
function tracePoints(withWords = false) {
	if (!trace) return [];
	const stops = trace.points.map((p, i) => ({ name: `${i + 1}: ${p.note || trace.name || 'trace'}`.slice(0, 30), x: p.x, y: p.y }));
	if (!withWords) return stops;
	return [...stops, ...(trace.texts || []).map(w => ({ name: w.text.slice(0, 30), x: w.x, y: w.y }))];
}

/* ------------------------------------------------------------------ *
 * the ruler
 * ------------------------------------------------------------------ */

/** Show or hide the minimap. Hidden, it keeps the place it was dragged to. */
export function toggleMini() {
	miniOn = !miniOn;
	persist();
	const host = document.querySelector('[data-map]');
	if (host) {
		const old = host.querySelector('[data-map-mini]');
		if (old) old.remove();
		if (miniOn) host.insertAdjacentHTML('beforeend', miniHTML(marksNow()));
	}
	const btn = document.querySelector('[data-act="map-mini"][aria-pressed]');
	if (btn) btn.setAttribute('aria-pressed', String(miniOn));
	paintMap();
}

export function toggleMeasure() {
	measuring = !measuring;
	if (!measuring) measurePts = [];
	const btn = document.querySelector('[data-act="map-measure"]');
	if (btn) btn.setAttribute('aria-pressed', String(measuring));
	const host = document.querySelector('[data-map]');
	if (host) host.classList.toggle('measuring', measuring);
	if (measuring) toast('Click two points on the sea');
	paintMap();
}

/** The world point under a screen position. */
function unproject(size, left, top) {
	const scale = Math.pow(2, MAX_ZOOM - mapState.zoom);
	return {
		x: mapState.centre.x + (left - size.w / 2) * scale,
		y: mapState.centre.y + (top - size.h / 2) * scale
	};
}

function measureAt(host, clientX, clientY) {
	const box = host.getBoundingClientRect();
	const p = unproject({ w: box.width, h: box.height }, clientX - box.left, clientY - box.top);
	measurePts = measurePts.length >= 2 ? [p] : [...measurePts, p];
	paintMap();
}

function paintMeasure(layer, size) {
	let svg = layer._measure;
	if (!measurePts.length) {
		if (svg) svg.style.display = 'none';
		if (layer._measureLabel) layer._measureLabel.hidden = true;
		return;
	}
	if (!svg) {
		svg = layer._measure = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'map-route map-measure');
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('class', 'map-measure-line');
		svg.appendChild(path);
		layer.appendChild(svg);
		const label = layer._measureLabel = document.createElement('div');
		label.className = 'map-measure-label';
		layer.appendChild(label);
	}
	svg.style.display = '';
	const world = measurePts.length === 2 ? seaBent(measurePts) : measurePts;
	const pts = world.map(p => project(mapState, size, p.x, p.y));
	const d = pts.length > 1 ? routePath(pts, size) : `M${pts[0].left - 4},${pts[0].top}a4,4 0 1,0 8,0a4,4 0 1,0 -8,0`;
	svg.children[0].setAttribute('d', d);
	const label = layer._measureLabel;
	if (measurePts.length === 2) {
		const m = pathLength(world);
		const speed = routeSpeed();
		const t = fmtRange(...sailRange(m, speed.total, sailCal(), Number(store.getSetting('sailCal', null)) > 0));
		label.textContent = `${fmtDistance(m)}${t ? ` · ≈ ${t}` : ''}`;
		const mid = pts[Math.floor(pts.length / 2)];
		label.style.left = `${mid.left}px`;
		label.style.top = `${mid.top}px`;
		label.hidden = false;
	} else {
		label.hidden = true;
	}
}

/** The game's own coordinates under the pointer. */
function paintCoords(host, clientX, clientY) {
	const el = host.querySelector('[data-map-coords]');
	if (!el || !mapState) return;
	const box = host.getBoundingClientRect();
	const p = unproject({ w: box.width, h: box.height }, clientX - box.left, clientY - box.top);
	const g = toGame(p.x, p.y);
	el.textContent = `X ${F(Math.round(g.x))} · Z ${F(Math.round(g.z))}`;
	el.hidden = false;
}

/** How to calibrate the clock: name a leg you have sailed and how long
 *  it took, and every other leg follows. */
export function openSailCal() {
	const marks = marksNow();
	const world = seaBent(routeWorld(marks));
	const legs = legLengths(world);
	const port = ports.find(p => p.id === startPort);
	const names = [];
	const pts = routeIds(marks).map(id => npcById.get(id).name);
	if (port) names.push(port.name);
	names.push(...pts);
	if (port && returnHome) names.push(port.name);
	const speed = routeSpeed();
	const options = legs.map((m, i) => `<option value="${m}">${esc(names[i] || '?')} → ${esc(names[i + 1] || '?')} · ${esc(fmtDistance(m))}</option>`).join('');
	const host = openDialog(`
		<h2>How fast is 100%?</h2>
		<p class="dialog-copy">The game gives speed as a percentage and never says what 100% is in metres. The chart assumes <b>${DEFAULT_CAL} m/s</b> and shows every time as a range a fifth either way; you are using <b>${sailCal()} m/s</b>. Time one leg in game${speed ? ` at your ${speed.total}%` : ''} and the rest are corrected from it, with the range narrowed to a tenth.</p>
		${legs.length ? `<label class="dialog-label">Leg <select class="field select" data-cal-leg>${options}</select></label>` : '<p class="dialog-copy">Plot a route first, then time one of its legs.</p>'}
		<label class="dialog-label">Took <input class="field" type="text" inputmode="decimal" placeholder="minutes, e.g. 6.5" data-cal-min> minutes</label>
		<div class="dialog-actions">
			<button class="ghost-btn" data-cal-reset>Back to ${DEFAULT_CAL} m/s</button>
			<button class="ghost-btn" data-close>Cancel</button>
			<button class="act" data-cal-save${legs.length ? '' : ' disabled'}>Set</button>
		</div>`);
	host.querySelector('[data-cal-reset]').addEventListener('click', () => {
		store.setSetting('sailCal', null);
		closeDialog();
		refreshSide();
		toast(`Back to ${DEFAULT_CAL} m/s at 100%`);
	});
	host.querySelector('[data-cal-save]').addEventListener('click', () => {
		const metres = Number(host.querySelector('[data-cal-leg]').value);
		const minutes = Number(String(host.querySelector('[data-cal-min]').value).replace(',', '.'));
		const v = calibrate(metres, minutes * 60, speed ? speed.total : 100);
		if (!v) return toast('Give the minutes that leg took');
		store.setSetting('sailCal', v);
		closeDialog();
		refreshSide();
		paintMap();
		toast(`100% is now ${v} m/s on this chart`);
	});
}

function todayHTML(marks) {
	const dn = doneSet();
	const all = [...marks.keys()].map(id => npcById.get(id)).filter(Boolean)
		.sort((a, b) => a.name.localeCompare(b.name));
	if (!all.length) {
		return '<p class="empty">Nothing marked to sail for — pick an item or add a build.</p>';
	}
	const doneCount = all.filter(n => dn.has(n.id)).length;
	const pct = Math.round(doneCount / all.length * 100);
	const rows = all.map(n => {
		const is = dn.has(n.id);
		return `<button class="map-row today${is ? ' done' : ''}" data-act="map-done" data-npc="${n.id}">
			<span class="map-check">✓</span>
			<span class="map-row-main">
				<span class="map-row-name">${esc(n.name)}</span>
				<span class="map-row-sub">${esc(n.at)} · ${esc([...marks.get(n.id).items.keys()].join(', '))}</span>
			</span>
			<span class="map-row-right">${iconStrip([...marks.get(n.id).items.keys()])}</span>
		</button>`;
	}).join('');
	return `<div class="map-ring-row">
			<div class="map-ring" style="background:conic-gradient(var(--teal) ${pct * 3.6}deg, var(--track) 0deg)">
				<span>${pct}%</span></div>
			<div><div class="map-ring-big">${doneCount} of ${all.length} visited</div>
				<div class="map-row-sub"><span class="gterm" role="button" tabindex="0" data-guide="refresh">resets with the game</span> in <b data-until="barter"></b></div></div>
		</div>
		<div class="map-list">${rows}</div>`;
}

function miniHTML(marks) {
	// The minimap frames the islands, not the whole chart: the point of
	// it is "where am I among the barterers", and the sea past them is
	// dead space at this size.
	const b = npcBox();
	const dots = npcs.map(n => `<i class="mini-dot${marks.has(n.id) ? ' wanted' : ''}"
		style="left:${((n.x - b.x0) / (b.x1 - b.x0) * 100).toFixed(1)}%;top:${((n.y - b.y0) / (b.y1 - b.y0) * 100).toFixed(1)}%"></i>`).join('');
	if (!miniOn) return '';
	const at = miniPos ? ` style="left:${Math.round(miniPos.x)}px;top:${Math.round(miniPos.y)}px;right:auto;bottom:auto"` : '';
	return `<div class="map-mini${miniPos ? ' moved' : ''}" data-map-mini title="Jump there"${at}>
		<span class="mini-grip" data-mini-grip title="Drag to move the minimap" aria-hidden="true">⋮⋮</span>
		<button class="mini-hide" data-act="map-mini" title="Hide the minimap" aria-label="Hide the minimap">×</button>
		${dots}<i class="mini-view" data-map-view></i></div>`;
}

let npcBoxCache = null;
function npcBox() {
	if (!npcBoxCache) {
		const xs = npcs.map(n => n.x), ys = npcs.map(n => n.y);
		const px = (Math.max(...xs) - Math.min(...xs)) * 0.06;
		const py = (Math.max(...ys) - Math.min(...ys)) * 0.06;
		npcBoxCache = {
			x0: Math.min(...xs) - px, x1: Math.max(...xs) + px,
			y0: Math.min(...ys) - py, y1: Math.max(...ys) + py
		};
	}
	return npcBoxCache;
}

/** Redraw only the side panel, so a keystroke in its search box or a
 *  toggled stop does not rebuild (and flash) the whole chart. */
function refreshSide() {
	const slot = document.querySelector('[data-map-side]');
	if (!slot) return;
	// Ticking a course or a species rebuilds the whole panel. Without
	// this the list springs back to the top and the row just clicked is
	// off screen -- so the scroll is put back where it was.
	const was = slot.querySelector('.map-side-body');
	const top = was ? was.scrollTop : 0;
	slot.innerHTML = sideHTML(marksNow());
	const now = slot.querySelector('.map-side-body');
	if (now && top) now.scrollTop = top;
}

function refreshSideList() {
	const list = document.querySelector('[data-map-list]');
	if (!list) return refreshSide();
	const html = sailHTML(marksNow());
	// Only the rows; the input above them is the thing being typed in.
	list.outerHTML = html.slice(html.indexOf('<div class="map-list"'));
}

/* ------------------------------------------------------------------ *
 * painting
 * ------------------------------------------------------------------ */

/** One repaint per frame however fast the events report: a trackpad
 *  delivers several moves per frame, a pointer crossing a row of pins
 *  fires enter/leave in pairs, and each paint is work. Everything that
 *  repaints in response to input goes through here. */
let paintRaf = null;
function schedulePaint() {
	if (paintRaf) return;
	paintRaf = requestAnimationFrame(() => {
		paintRaf = null;
		paintMap();
	});
}

/** Zoom on wheel. Wired to the map box itself rather than the document
 *  -- a non-passive document listener would cost the whole app its
 *  passive scrolling -- and non-passive there, so preventDefault still
 *  keeps the page from scrolling under the chart. The box is rebuilt
 *  with the screen, so paintMap re-wires whichever one exists. */
function onWheel(evt) {
	if (!mapState) return;
	if (evt.target.closest('.map-side, .map-tip, .map-steps')) return;   // their scroll, not ours
	evt.preventDefault();
	cancelFly();
	// Anchored under the cursor, and continuous: a notch of the wheel is
	// a quarter-step of magnification, not a lurch to the next level.
	const box = evt.currentTarget.getBoundingClientRect();
	if (zoomAt(mapState, -evt.deltaY * 0.0024,
		{ w: box.width, h: box.height },
		evt.clientX - box.left, evt.clientY - box.top)) schedulePaint();
}

/**
 * Draw the tiles and pins for the current state into the live map.
 *
 * By moving nodes, not by rebuilding them. A drag repaints on every
 * pointer move, and replacing the layer's innerHTML each time meant
 * re-parsing and re-laying-out thirty images and eighty buttons per
 * mouse twitch. Instead each tile and pin is keyed -- by src, by npc id
 * -- reused across paints, and only its position is touched; what
 * scrolls off is removed, what scrolls on is created. The pools live on
 * the layer element, so a re-render of the screen (which builds a fresh
 * layer) starts them clean.
 */
export function paintMap() {
	const host = document.querySelector('[data-map]');
	const layer = host && host.querySelector('[data-map-layer]');
	if (!host || !layer || !barterData) return;

	const size = { w: host.clientWidth, h: host.clientHeight };
	if (!size.w || !size.h) return;

	// A re-render hands us a fresh box; give it its wheel back.
	if (!host._wheelWired) {
		host._wheelWired = true;
		host.addEventListener('wheel', onWheel, { passive: false });
		// The keyboard sails too: arrows pan, + and - zoom, once the box
		// has focus -- and never while typing in the panel.
		host.tabIndex = 0;
		host.addEventListener('keydown', evt => {
			if (evt.target.closest('input, select, textarea, button')) return;
			const step = evt.shiftKey ? 240 : 80;
			const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
			if (moves[evt.key]) {
				evt.preventDefault();
				cancelFly();
				pan(mapState, ...moves[evt.key]);
				schedulePaint();
			} else if (evt.key === '+' || evt.key === '=') { evt.preventDefault(); mapZoomStep(1); }
			else if (evt.key === '-' || evt.key === '_') { evt.preventDefault(); mapZoomStep(-1); }
		});
	}

	const marks = marksNow();

	// A fit was asked for; now the box exists to measure, sail there.
	if (pendingFit) {
		const only = pendingFit.points;
		pendingFit = false;
		// A copy: the chart's own list must not grow course or monster points.
		const points = marks.size ? [...marks.keys()].map(id => npcById.get(id)).filter(Boolean) : [...npcs];
		for (const id of coursesOn) points.push(...courseById[id].points);
		for (const k of huntsOn) points.push(...monsterByKey[k].points.map(([x, y]) => ({ x, y })));
		const probe = { zoom: mapState.zoom, centre: { ...mapState.centre } };
		fitTo(probe, size, only && only.length ? only : points);
		flyTo(probe.centre.x, probe.centre.y, probe.zoom);
	}
	// The view never leaves the charted sea, whatever the gesture did.
	clampView(mapState, size);

	const { tiles, pins } = frame(mapState, size, marks);
	// A layer that faults says so in the console and leaves the others
	// to paint; nothing on the chart depends on another layer's luck.
	const guarded = (fn, ...args) => { try { fn(...args); } catch (err) { console.warn(`[map] ${fn.name} failed:`, err); } };

	const ids = routeIds(marks);
	const key = `${ids.join('.')}|${startPort}|${returnHome}`;
	if (key !== stepKey) { stepKey = key; stepIdx = 0; }
	const currentId = ids.length > 1 ? ids[Math.min(stepIdx, ids.length - 1)] : null;

	guarded(paintTiles, layer, tiles, size);
	guarded(paintPins, layer, pins, marks, currentId);
	guarded(paintPorts, layer, size);
	guarded(paintWharves, layer, size);
	guarded(paintLabels, layer, size);
	guarded(paintHunt, layer, size);
	guarded(paintHabitats, layer, size);
	guarded(paintCourse, layer, size);
	guarded(paintRoute, layer, size, marks);
	guarded(paintMeasure, layer, size);
	guarded(paintTrace, layer, size);
	guarded(paintSteps, host, ids);
	guarded(paintTip, host, size, marks);
	guarded(paintMini, host, size);
}

function paintTiles(layer, tiles, size) {
	const pool = layer._tiles || (layer._tiles = new Map());
	const live = new Set();
	let loading = false;
	for (const t of tiles) {
		live.add(t.src);
		let e = pool.get(t.src);
		if (!e) {
			const img = document.createElement('img');
			img.className = 'map-tile';
			img.src = t.src;
			img.alt = '';
			img.draggable = false;
			// Fading in over the sea colour is what a zoom step looks
			// like while its tiles arrive; popping from dark was a bug
			// report.
			img.addEventListener('load', () => img.classList.add('on'), { once: true });
			if (img.complete && img.naturalWidth) img.classList.add('on');
			pool.set(t.src, (e = { img, z: t.z, x: t.x, y: t.y }));
			// At the front of the layer, always: everything drawn over the
			// sea shares its z-index with the tiles or beats it, so a tile
			// appended after the course line would cover it -- which is
			// what happened on every zoom.
			layer.insertBefore(img, layer.firstChild);
		}
		if (!e.img.classList.contains('on')) loading = true;
		e.img.style.zIndex = 1;
		e.img.style.transform = `translate3d(${t.left}px, ${t.top}px, 0) scale(${t.scale})`;
	}
	// While the new level is still arriving, the old level stays put
	// underneath -- rescaled to line up -- so a zoom crossfades between
	// magnifications instead of blinking through open sea.
	for (const [src, e] of pool) {
		if (live.has(src)) continue;
		if (loading) {
			const at = placeTile(mapState, size, e.z, e.x, e.y);
			e.img.style.zIndex = 0;
			e.img.style.transform = `translate3d(${at.left}px, ${at.top}px, 0) scale(${at.scale})`;
		} else {
			e.img.remove();
			pool.delete(src);
		}
	}
}

function paintPins(layer, pins, marks, currentId) {
	const pool = layer._pins || (layer._pins = new Map());
	const live = new Set();
	// Put away, the barterers leave the sea to the courses, the grounds
	// and whatever is being traced over them.
	if (!pinsOn) pins = [];
	const dn = doneSet();
	for (const p of pins) {
		live.add(p.id);
		let btn = pool.get(p.id);
		if (!btn) {
			btn = document.createElement('button');
			btn.className = 'map-pin';
			btn.dataset.act = 'map-pin';
			btn.dataset.npc = p.id;
			btn.innerHTML = '<span class="map-pin-dot"></span><span class="map-pin-badge"></span>'
				+ '<span class="map-pin-name"><span class="map-pin-npc"></span><span class="map-pin-at"></span></span>';
			// Through the frame throttle, like every other pointer event:
			// skimming a cluster of pins fires these in bursts, and a
			// synchronous paint per crossing stuttered the very hover it
			// was showing.
			btn.addEventListener('pointerenter', () => { hoverNpc = p.id; schedulePaint(); });
			btn.addEventListener('pointerleave', () => { hoverNpc = null; schedulePaint(); });
			pool.set(p.id, btn);
			layer.appendChild(btn);
		}
		const m = p.mark;
		const what = m ? [...m.items.keys()] : [];
		const stopAt = stopsLive() ? stops.indexOf(p.id) : -1;
		const visited = dn.has(p.id);
		btn.classList.toggle('wanted', !!m);
		btn.classList.toggle('current', p.id === currentId);
		btn.classList.toggle('done', visited && (!!m || stopAt >= 0));
		btn.classList.toggle('dim', marks.size > 0 && !m && stopAt < 0);
		btn.title = m ? `${p.name} — ${what.join(', ')}` : p.name;
		// z-index rather than DOM order does what the wanted-last sort in
		// frame() used to: a lit pin paints over a plain one.
		btn.style.zIndex = m || stopAt >= 0 ? 4 : 3;
		btn.style.left = `${p.left}px`;
		btn.style.top = `${p.top}px`;
		const badge = btn.querySelector('.map-pin-badge');
		badge.textContent = stopAt >= 0 ? String(stopAt + 1) : visited && m ? '✓' : '';
		badge.classList.toggle('is-done', stopAt < 0 && visited);
		btn.querySelector('.map-pin-npc').textContent =
			p.name + (m && what.length > 1 ? ` ·${what.length}` : '');
		btn.querySelector('.map-pin-at').textContent = npcById.get(p.id).at;
	}
	for (const [id, btn] of pool) {
		if (!live.has(id)) {
			btn.remove();
			pool.delete(id);
		}
	}
}

function paintRoute(layer, size, marks) {
	// The hand-plotted route wins; the suggested loop through everything
	// marked is what you get before you have plotted one. Either way the
	// chosen wharf anchors it.
	const pts = seaBent(routeWorld(marks)).map(p => project(mapState, size, p.x, p.y));
	const d = routePath(pts, size);

	let svg = layer._route;
	if (!svg) {
		svg = layer._route = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'map-route');
		const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		glow.setAttribute('class', 'map-route-glow');
		const dash = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		dash.setAttribute('class', 'map-route-dash');
		svg.append(glow, dash);
		layer.appendChild(svg);
	}
	svg.children[0].setAttribute('d', d);
	svg.children[1].setAttribute('d', d);
	svg.style.display = d ? '' : 'none';

	// The little ship that sails the route. Its pace scales with the
	// course so a short hop is not a blur and a grand tour not a crawl;
	// the animation restarts only when the stops change, not on a pan,
	// so it keeps its place along the line while you drag the sea.
	let ship = layer._ship;
	if (!ship) {
		ship = layer._ship = document.createElement('div');
		ship.className = 'map-ship';
		layer.appendChild(ship);
	}
	if (!d) {
		ship.style.display = 'none';
		return;
	}
	let len = 0;
	for (let i = 1; i < pts.length; i++) {
		len += Math.hypot(pts[i].left - pts[i - 1].left, pts[i].top - pts[i - 1].top);
	}
	ship.style.display = '';
	ship.style.offsetPath = `path("${d}")`;
	if (ship._for !== stepKey) {
		ship._for = stepKey;
		const dur = Math.max(8, Math.min(42, len / 55));
		ship.style.animation = 'none';
		void ship.offsetWidth;
		ship.style.animation = `map-sail ${dur.toFixed(1)}s linear infinite`;
	}
}

/** The courses switched on: each a line in its own colour beneath the
 *  route, with a labelled mark at its named waypoints. The whole layer
 *  is rebuilt on every paint -- three paths and a dozen labels cost
 *  nothing, and a layer that is written fresh can never keep a copy
 *  from an earlier view. */
function paintCourse(layer, size) {
	let box = layer._courseBox;
	if (!box || box.parentNode !== layer) {
		box = layer._courseBox = document.createElement('div');
		box.className = 'map-course-layer';
		layer.appendChild(box);
	}
	if (!coursesOn.length) { box.innerHTML = ''; return; }
	let html = '';
	for (const id of coursesOn) {
		const c = courseById[id];
		if (!c) continue;
		const d = routePath(seaBent(c.points).map(p => project(mapState, size, p.x, p.y)), size);
		html += `<svg class="map-route map-course-line course-${esc(id)}">
			<path class="map-course-glow" d="${d}"></path><path class="map-course-path" d="${d}"></path></svg>`;
		for (const p of c.points) {
			if (!p.name) continue;
			const at = project(mapState, size, p.x, p.y);
			if (at.left < -80 || at.top < -40 || at.left > size.w + 80 || at.top > size.h + 40) continue;
			html += `<span class="map-waypoint${p.stop ? ' stop' : ''}" title="${esc(p.name)}"
				style="left:${Math.round(at.left)}px;top:${Math.round(at.top)}px">
				<span class="map-waypoint-dot"></span><span class="map-waypoint-name">${esc(p.name)}</span></span>`;
		}
	}
	box.innerHTML = html;
}

/** The monster grounds switched on, as dots on one canvas: a few
 *  hundred spawn points redrawn on every pan is cheap there and would
 *  not be as elements. The legend's shapes: a cross for a grown
 *  monster, a square for a young one, a diamond for a ship, a ring for
 *  a boss. */
function paintHunt(layer, size) {
	let cv = layer._hunt;
	if (!huntsOn.length) { if (cv) cv.style.display = 'none'; return; }
	if (!cv) {
		cv = layer._hunt = document.createElement('canvas');
		cv.className = 'map-hunt-layer';
		layer.appendChild(cv);
	}
	cv.style.display = '';
	const dpr = window.devicePixelRatio || 1;
	if (cv.width !== Math.round(size.w * dpr) || cv.height !== Math.round(size.h * dpr)) {
		cv.width = Math.round(size.w * dpr);
		cv.height = Math.round(size.h * dpr);
		cv.style.width = `${size.w}px`;
		cv.style.height = `${size.h}px`;
	}
	const g = cv.getContext('2d');
	g.setTransform(dpr, 0, 0, dpr, 0, 0);
	g.clearRect(0, 0, size.w, size.h);
	const r = Math.max(2.5, Math.min(6, 1.2 * Math.pow(2, mapState.zoom - 4)));
	g.lineWidth = Math.max(1.2, r / 2.5);
	g.lineCap = 'round';
	for (const key of huntsOn) {
		const m = monsterByKey[key];
		if (!m) continue;
		g.strokeStyle = m.colour;
		g.fillStyle = m.colour;
		g.shadowColor = 'rgba(0,0,0,0.7)';
		g.shadowBlur = 3;
		// A species the codex has no points for -- the crocodiles since
		// their move -- is drawn at its ground instead: a dashed ring,
		// since the spot is approximate, so picking it never shows an
		// empty sea.
		if (!m.points.length && m.zones) {
			for (const [x, y] of m.zones) {
				const at = project(mapState, size, x, y);
				if (at.left < -60 || at.top < -60 || at.left > size.w + 60 || at.top > size.h + 60) continue;
				g.save();
				g.setLineDash([6, 5]);
				g.lineWidth = 2;
				g.beginPath(); g.arc(at.left, at.top, 22, 0, Math.PI * 2); g.stroke();
				g.restore();
				g.beginPath(); g.arc(at.left, at.top, r, 0, Math.PI * 2); g.fill();
			}
			continue;
		}
		for (const [x, y, w] of m.points) {
			const at = project(mapState, size, x, y);
			if (at.left < -10 || at.top < -10 || at.left > size.w + 10 || at.top > size.h + 10) continue;
			// A point can carry how many spawn there (the crocodiles' map
			// counts one, three or four); the mark grows with it.
			const rr = w > 1 ? r * (1 + 0.3 * Math.min(w - 1, 3)) : r;
			g.beginPath();
			if (m.kind === 'pirate') {
				g.arc(at.left, at.top, rr * 0.9, 0, Math.PI * 2); g.fill();
			} else if (m.kind === 'adult') {
				g.moveTo(at.left - rr, at.top - rr); g.lineTo(at.left + rr, at.top + rr);
				g.moveTo(at.left + rr, at.top - rr); g.lineTo(at.left - rr, at.top + rr);
				g.stroke();
			} else if (m.kind === 'young') {
				g.fillRect(at.left - r * 0.7, at.top - r * 0.7, r * 1.4, r * 1.4);
			} else if (m.kind === 'ship') {
				g.moveTo(at.left, at.top - r * 1.2); g.lineTo(at.left + r * 1.2, at.top);
				g.lineTo(at.left, at.top + r * 1.2); g.lineTo(at.left - r * 1.2, at.top);
				g.closePath(); g.fill();
			} else {
				g.arc(at.left, at.top, r * 2, 0, Math.PI * 2); g.stroke();
				g.beginPath(); g.arc(at.left, at.top, r * 0.7, 0, Math.PI * 2); g.fill();
			}
		}
	}
}

function paintPorts(layer, size) {
	const pool = layer._portEls || (layer._portEls = new Map());
	for (const p of ports) {
		const at = project(mapState, size, p.x, p.y);
		let el = pool.get(p.id);
		const off = at.left < -60 || at.top < -60
			|| at.left > size.w + 60 || at.top > size.h + 60;
		if (off) { if (el) el.hidden = true; continue; }
		if (!el) {
			el = document.createElement('button');
			el.className = 'map-port';
			el.dataset.act = 'map-port';
			el.dataset.port = p.id;
			el.title = `Sail the route from ${p.name}`;
			el.innerHTML = '<span class="map-port-dot"></span><span class="map-port-name"></span>';
			el.querySelector('.map-port-name').textContent = p.name;
			pool.set(p.id, el);
			layer.appendChild(el);
		}
		el.hidden = false;
		el.classList.toggle('start', p.id === startPort);
		el.style.left = `${Math.round(at.left)}px`;
		el.style.top = `${Math.round(at.top)}px`;
	}
}

const habitatCache = new Map();
function habitats(m) {
	if (!habitatCache.has(m.key)) habitatCache.set(m.key, habitatsOf(m.points, { onWater: openSea }));
	return habitatCache.get(m.key);
}

/** The markers to draw: one per adult, ship or boss habitat; the young
 *  ones share a marker per ground, naming whoever swims there. */
let markerCache = null;
function habitatMarkers() {
	if (markerCache) return markerCache;
	const out = [];
	for (const m of monsters) {
		// The young share a marker per ground (below); the Cox Pirates' camps, flags and cargo are dots, not grounds.
		if (m.kind === 'young' || m.kind === 'pirate' || (!m.points.length && !m.zones)) continue;
		// The game's own marker where the client keeps one; the spawn
		// clusters only where it does not.
		const spots = m.zones ? m.zones.map(([x, y]) => ({ x, y, n: m.points.length })) : habitats(m);
		spots.forEach((h, i) => out.push({
			key: `${m.key}:${i}`, x: h.x, y: h.y, kind: m.kind, keys: [m.key], colour: m.colour, art: monsterArt[m.key],
			name: m.kind === 'ship' ? `${m.name.split(' ')[0]} Waters` : m.kind === 'pirate' ? m.name : `${m.name} Habitat`,
			sub: `${m.name}${m.approx ? ' · about here' : ''}`, n: h.n
		}));
	}
	const young = monsters.filter(m => m.kind === 'young' && m.points.length);
	habitatsOfMany(young, { onWater: openSea }).forEach((h, i) => {
		const here = young.filter(m => h.species.includes(m.name));
		out.push({
			key: `young:${i}`, x: h.x, y: h.y, kind: 'young', keys: here.map(m => m.key), colour: '#e0c060', art: monsterArt[here[0] && here[0].key],
			name: 'Young Sea Monster Habitat', sub: here.map(m => m.name.replace(/^Young /, '')).join(', '), n: h.n
		});
	});
	markerCache = out;
	return out;
}

/** A picture at each ground, named the way the game names it -- and
 *  one picture for several grounds when, at this zoom, they would print
 *  on top of one another. */
function paintHabitats(layer, size) {
	// The pool is read back from the layer itself, so a marker can never
	// be drawn twice however the layer was rebuilt.
	const pool = new Map([...layer.querySelectorAll('.map-habitat')].map(el => [el.dataset.key, el]));
	const live = new Set();
	if (habitatsOn) {
		const seen = habitatMarkers()
			.map(mk => ({ mk, at: project(mapState, size, mk.x, mk.y) }))
			.filter(({ at }) => at.left > -80 && at.top > -80 && at.left < size.w + 80 && at.top < size.h + 80)
			.sort((a, b) => b.mk.n - a.mk.n);
		// Greedy, biggest ground first: a marker whose label box would
		// touch one already placed joins it instead of covering it. The
		// box is wide and short, like the name under the picture.
		const groups = [];
		for (const s of seen) {
			const g = groups.find(g => Math.abs(g.at.left - s.at.left) < 140 && Math.abs(g.at.top - s.at.top) < 64);
			if (g) g.members.push(s.mk); else groups.push({ at: s.at, members: [s.mk] });
		}
		for (const g of groups) {
			const key = g.members.map(m => m.key).sort().join('+');
			live.add(key);
			const keys = [...new Set(g.members.flatMap(m => m.keys))];
			const on = keys.some(k => huntsOn.includes(k));
			let el = pool.get(key);
			if (!el) {
				const lead = g.members[0];
				const many = g.members.length > 1;
				el = document.createElement('button');
				el.className = `map-habitat ${lead.kind}${many ? ' many' : ''}`;
				el.dataset.key = key;
				el.dataset.act = 'map-hunt';
				el.dataset.id = keys.join(',');
				const subs = g.members.map(m => m.sub.replace(/ · about here$/, ''));
				el.title = many
					? `${subs.join(' · ')} — click to show or hide their spawn points`
					: `${lead.sub} — ${lead.n} spawn point${lead.n === 1 ? '' : 's'} here · click to show or hide them`;
				const pic = lead.art
					? `<img class="map-habitat-pic" src="icons/${lead.art}" alt="">`
					: `<span class="map-habitat-glyph" style="border-color:${lead.colour};color:${lead.colour}">${lead.kind === 'ship' ? '⛵' : '◎'}</span>`;
				const badge = many ? `<span class="map-habitat-count">${g.members.length}</span>` : '';
				el.innerHTML = `<span class="map-habitat-art">${pic}${badge}</span>`
					+ `<span class="map-habitat-name">${esc(many ? `${g.members.length} habitats` : lead.name)}</span>`
					+ `<span class="map-habitat-sub">${esc(many ? [...new Set(subs)].join(', ') : lead.sub)}</span>`;
				pool.set(key, el);
				layer.appendChild(el);
			}
			el.hidden = false;
			el.classList.toggle('on', on);
			el.style.left = `${Math.round(g.at.left)}px`;
			el.style.top = `${Math.round(g.at.top)}px`;
		}
	}
	for (const [key, el] of pool) if (!live.has(key)) el.hidden = true;
}

/** The islands' names, once: every place a barterer or a wharf stands
 *  on that reads as an island, at the middle of what stands there. */
let labelCache = null;
function islandLabels() {
	if (labelCache) return labelCache;
	const sum = new Map();
	const add = (name, x, y) => {
		const k = name.trim();
		if (!sum.has(k)) sum.set(k, { x: 0, y: 0, n: 0 });
		const e = sum.get(k); e.x += x; e.y += y; e.n++;
	};
	const isle = at => /Island|Islands|Eye$|Nest$|Pier$/.test(at) && !/Workshop|Yard/.test(at);
	for (const n of npcs) if (n.at && isle(n.at)) add(n.at.replace(/ Islands?$/, ''), n.x, n.y);
	for (const w of wharves) if (w.at && isle(w.at)) add(w.at.replace(/ Islands?$/, ''), w.x, w.y);
	// The wharves the route can start from name themselves permanently,
	// in their own layer; a label there would be the same word twice.
	labelCache = [...sum.entries()].map(([name, e]) => ({ name, x: e.x / e.n, y: e.y / e.n }));
	return labelCache;
}

/** Faint names over the islands, from a zoom where they can be read. */
function paintLabels(layer, size) {
	const pool = new Map([...layer.querySelectorAll('.map-label')].map(el => [el.dataset.name, el]));
	const show = labelsOn && mapState.zoom >= 4.4;
	// Whatever the chart already spells out -- a wharf's own name, the
	// island written under a barterer the plan wants -- is not written
	// again underneath it. Read back from the layer, which paintPorts
	// and paintPins have just finished with.
	const spoken = new Set();
	if (show) {
		for (const el of layer.querySelectorAll('.map-port-name, .map-pin.wanted .map-pin-at')) {
			const t = (el.textContent || '').trim().replace(/ Islands?$/, '');
			if (t) spoken.add(t.toLowerCase());
		}
	}
	for (const l of islandLabels()) {
		let el = pool.get(l.name);
		const at = project(mapState, size, l.x, l.y);
		const off = !show || spoken.has(l.name.toLowerCase())
			|| at.left < -80 || at.top < -30 || at.left > size.w + 80 || at.top > size.h + 30;
		if (off) { if (el) el.hidden = true; continue; }
		if (!el) {
			el = document.createElement('span');
			el.className = 'map-label';
			el.dataset.name = l.name;
			el.textContent = l.name;
			pool.set(l.name, el);
			layer.appendChild(el);
		}
		el.hidden = false;
		// A touch below the island's middle, where the pins are not.
		el.style.left = `${Math.round(at.left)}px`;
		el.style.top = `${Math.round(at.top) + 18}px`;
	}
}

/** Every wharf manager of the kinds ticked: an anchor and a name. */
function paintWharves(layer, size) {
	const pool = new Map([...layer.querySelectorAll('.map-wharf')].map(el => [Number(el.dataset.i), el]));
	const placed = [];
	wharves.forEach((w, i) => {
		let el = pool.get(i);
		const on = wharvesOn.includes(w.kind);
		const at = project(mapState, size, w.x, w.y);
		const off = !on || at.left < -60 || at.top < -60 || at.left > size.w + 60 || at.top > size.h + 60;
		if (off) { if (el) el.hidden = true; return; }
		// Most piers keep two managers, the harbour's and the guild's, a
		// few steps apart: the second prints a line below the first.
		while (placed.some(p => Math.abs(p.left - at.left) < 70 && Math.abs(p.top - at.top) < 14)) at.top += 15;
		placed.push({ left: at.left, top: at.top });
		if (!el) {
			el = document.createElement('div');
			el.className = `map-wharf ${w.kind}`;
			el.dataset.i = i;
			el.title = `${w.name}${w.at ? ` — ${w.at}` : ''} — ${w.kind === 'guild' ? 'guild wharf manager' : 'wharf manager: repair, rations, sailors'}`;
			el.innerHTML = '<span class="map-wharf-dot">⚓</span><span class="map-wharf-name"></span>';
			el.querySelector('.map-wharf-name').textContent = w.name;
			pool.set(i, el);
			layer.appendChild(el);
		}
		el.hidden = false;
		el.style.left = `${Math.round(at.left)}px`;
		el.style.top = `${Math.round(at.top)}px`;
	});
}

/** The step player: one chip per stop, the current one lit, and a
 *  follow toggle that sails the camera along the route. */
function paintSteps(host, ids) {
	const el = host.querySelector('[data-map-steps]');
	if (!el) return;
	if (ids.length < 2) { el.hidden = true; el._sig = null; return; }
	const cur = npcById.get(ids[Math.min(stepIdx, ids.length - 1)]);
	const sig = `${stepKey}|${stepIdx}|${follow}`;
	if (el._sig === sig) return;
	el._sig = sig;
	el.hidden = false;
	el.innerHTML = `<button class="map-step-nav" data-act="map-step-prev" aria-label="Previous stop">‹</button>
		<div class="map-step-chips">${ids.map((id, i) =>
			`<button class="map-step-chip${i === stepIdx ? ' on' : ''}" data-act="map-step" data-i="${i}"
				title="${esc(npcById.get(id).name)}">${i + 1}</button>`).join('')}</div>
		<button class="map-step-nav" data-act="map-step-next" aria-label="Next stop">›</button>
		<span class="map-step-name">${esc(cur.name)} · ${esc(cur.at)}</span>
		<button class="map-step-follow${follow ? ' on' : ''}" data-act="map-follow">follow</button>`;
	const on = el.querySelector('.map-step-chip.on');
	if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function paintTip(host, size, marks) {
	const tip = host.querySelector('[data-map-tip]');
	if (!tip) return;
	// The trace tab hands the sea to the pen: no card opens over what is
	// being drawn, however the pointer wanders.
	if (mode === 'trace') { tip.hidden = true; tip._for = null; return; }
	const id = hoverNpc || pinnedNpc;
	const npc = id && npcById.get(id);
	if (!npc) {
		tip.hidden = true;
		tip._for = null;
		return;
	}

	const pinned = !hoverNpc && !!pinnedNpc;
	const m = marks.get(id);
	const dn = doneSet();
	const key = [id, mode, pinned, stopsLive() ? stops.indexOf(id) : -1, dn.has(id), m ? m.items.size : 0].join('|');
	if (tip._for !== key) {
		tip._for = key;
		// The trades themselves, numbers and all, from the same file the
		// marks come from: what you hand over, what you get, how many
		// times today's list will let you.
		const trades = m ? goodsOf(id).filter(g => m.items.has(g.item)) : [];
		const qty = q => (q && q !== '1' ? `${q}× ` : '');
		const rows = trades.slice(0, 5).map(g => `<div class="map-tip-row">
				<span class="map-tip-side"${g.give ? ` data-peek="${esc(g.give)}"` : ''}><span class="map-io minus">${img(g.give || '', 'map-icon')}</span><span>${qty(g.giveQty)}${esc(g.give || '—')}</span></span>
				<span class="map-tip-arrow">→</span>
				<span class="map-tip-side get" data-peek="${esc(g.item)}"><span class="map-io plus">${img(g.item, 'map-icon')}</span><span>${qty(g.recvQty)}${esc(g.item)}</span></span>
				<span class="map-tip-tries">${g.tries ? `×${g.tries}` : ''}<span class="map-kind-tag ${barterKind(g.item)}">${
					{ material: 'mat', trade: 'good', coin: 'coin' }[barterKind(g.item)]}</span></span>
			</div>`).join('');
		// The game deals each island one offer per list per refresh, drawn
		// from its own pool -- so the size of that pool is the honest way
		// to say how likely your thing is to be on the table today. The
		// parley quoted is the rate of the list these trades are on.
		const pool = new Set(goodsOf(id).map(g => g.item)).size;
		const prof = barterProfile();
		const kinds = [...new Set((trades.length ? trades.map(g => g.item) : goodsOf(id).map(g => g.item))
			.map(barterKind))];
		const rate = kinds.length === 1
			? `${F(parleyPerTrade({ ...prof, kind: kinds[0] }))} parley a trade`
			: `${F(parleyPerTrade({ ...prof, kind: 'trade' }))}–${F(parleyPerTrade({ ...prof, kind: 'material' }))} parley a trade`;
		const sub = `${esc(npc.at)} · ${rate}`
			+ (pool > 1 ? ` · draws 1 of its ${pool} offers a refresh` : '');
		const onRoute = stopsLive() && stops.includes(id);
		const btns = `<div class="map-tip-btns">
			<button class="ghost-btn" data-act="map-stop" data-npc="${id}">${onRoute ? '− Remove stop' : '+ Add stop'}</button>
			${m ? `<button class="ghost-btn" data-act="map-done" data-npc="${id}">${dn.has(id) ? '✓ Sailed' : 'Mark sailed'}</button>` : ''}
		</div>`;
		tip.innerHTML = `<div class="map-tip-head"><span class="map-tip-name">${esc(npc.name)}</span>
			${pinned ? `<button class="map-x" data-act="map-tip-close" aria-label="Close">×</button>` : ''}</div>
			<div class="map-tip-sub">${sub}</div>
			${rows || '<div class="map-tip-sub none">Nothing on your list here.</div>'}
			${pinned ? btns : ''}`;
	}

	const at = project(mapState, size, npc.x, npc.y);
	tip.classList.toggle('pinned', pinned);
	tip.hidden = false;
	const w = tip.offsetWidth || 264, h = tip.offsetHeight || 140;
	// The step player sits along the bottom edge; the card must not lie
	// over it, or a phone loses the route's controls behind an island's
	// trades. Keep the card above it, and at the top when there is no
	// room above.
	const steps = host.querySelector('[data-map-steps]');
	const floor = steps && !steps.hidden ? steps.offsetTop - 8 : size.h - 10;
	const maxTop = Math.max(10, floor - h);
	tip.style.left = `${Math.max(10, Math.min(size.w - w - 10, at.left + 16))}px`;
	tip.style.top = `${Math.max(10, Math.min(maxTop, at.top - 12))}px`;
}

function paintMini(host, size) {
	const rect = host.querySelector('[data-map-view]');
	const mini = host.querySelector('[data-map-mini]');
	if (!rect || !mini) return;
	const b = npcBox();
	const scale = Math.pow(2, 9 - mapState.zoom);
	const wx0 = mapState.centre.x - size.w / 2 * scale, wx1 = mapState.centre.x + size.w / 2 * scale;
	const wy0 = mapState.centre.y - size.h / 2 * scale, wy1 = mapState.centre.y + size.h / 2 * scale;
	const pc = (v, lo, hi) => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
	const l = pc(wx0, b.x0, b.x1), r = pc(wx1, b.x0, b.x1);
	const t = pc(wy0, b.y0, b.y1), bo = pc(wy1, b.y0, b.y1);
	rect.style.left = `${l.toFixed(1)}%`;
	rect.style.top = `${t.toFixed(1)}%`;
	rect.style.width = `${(r - l).toFixed(1)}%`;
	rect.style.height = `${(bo - t).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ *
 * motion
 * ------------------------------------------------------------------ */

/**
 * Sail the view to a place instead of teleporting it: zoom and centre
 * eased together over half a second. Reading a map is keeping your
 * bearings, and a cut discards them where a glide carries them along.
 */
function flyTo(x, y, zoom = mapState.zoom) {
	const host = document.querySelector('[data-map]');
	if (!host || !mapState) return;
	const size = { w: host.clientWidth, h: host.clientHeight };
	const from = { zoom: mapState.zoom, x: mapState.centre.x, y: mapState.centre.y };
	const probe = {
		zoom: Math.min(zoomRange.max, Math.max(zoomRange.min, zoom)),
		centre: { x, y }
	};
	clampView(probe, size);   // do not fly somewhere the clamp will yank back from
	cancelFly();
	let t0 = null;                // rAF hands us the clock; no other is needed
	const step = t => {
		if (t0 === null) t0 = t;
		const p = Math.min(1, (t - t0) / 550);
		const e = 1 - Math.pow(1 - p, 3);
		mapState.zoom = from.zoom + (probe.zoom - from.zoom) * e;
		mapState.centre.x = from.x + (probe.centre.x - from.x) * e;
		mapState.centre.y = from.y + (probe.centre.y - from.y) * e;
		fly = p < 1 ? requestAnimationFrame(step) : null;
		paintMap();
	};
	fly = requestAnimationFrame(step);
}

function cancelFly() {
	if (fly) cancelAnimationFrame(fly);
	fly = null;
}

/* ------------------------------------------------------------------ *
 * gestures
 * ------------------------------------------------------------------ */

/** Drag to pan, wheel or pinch to zoom. Wired once, for whatever map
 *  exists. */
export function wireMap() {
	let dragging = null;          // one pointer moving the sea
	const touching = new Map();   // every pointer down on the map, for pinch
	let pinch = null;             // { dist } spread at the last frame

	// The panel, the card, the minimap: furniture on top of the sea.
	// A gesture that starts on them is for them, not for the chart.
	const CHROME = '.map-side, .map-side-pill, .map-tip, .map-mini, .map-steps, .map-trace-write';
	const MARKERS = '[data-act="map-pin"], [data-act="map-port"], .map-habitat';
	// Tracing, the markers are scenery: a line drawn across a barterer
	// must not stop dead there and open his trades instead.
	const furniture = () => (mode === 'trace' ? CHROME : `${MARKERS}, ${CHROME}`);

	let pressed = null;           // where the last pointer went down, to tell a click from a drag

	document.addEventListener('pointerdown', evt => {
		const host = evt.target.closest('[data-map]');
		if (!host || evt.target.closest(furniture())) return;
		cancelFly();
		// A stop or a word already on the sea is picked up and carried,
		// not drawn over. The pointer is captured by the map box rather
		// than by the mark itself: the mark is redrawn at every frame of
		// the drag, and a captured element that is replaced stops
		// hearing the pointer that is moving it.
		const grabbed = mode === 'trace' && evt.target.closest('[data-mark]');
		if (grabbed) {
			const kind = grabbed.dataset.mark, seq = Number(grabbed.dataset.seq);
			const m = markBySeq(kind, seq);
			if (m) {
				markDrag = { kind, seq, from: atSea(host, evt.clientX, evt.clientY), x: m.x, y: m.y, px: evt.clientX, py: evt.clientY, moved: false };
				host.setPointerCapture(evt.pointerId);
				host.classList.add('moving-mark');
				return;
			}
		}
		pressed = { x: evt.clientX, y: evt.clientY, host };
		touching.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
		// The pen draws instead of panning: one finger, one stroke.
		if (traceTool === 'pen' && touching.size === 1) {
			penStart(host, evt.clientX, evt.clientY);
			host.setPointerCapture(evt.pointerId);
			return;
		}
		if (touching.size === 2) {
			// A second finger turns the gesture into a pinch, not a drag.
			dragging = null;
			const [a, b] = [...touching.values()];
			pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
		} else {
			dragging = { x: evt.clientX, y: evt.clientY };
		}
		host.setPointerCapture(evt.pointerId);
		host.classList.add('dragging');
	});

	document.addEventListener('pointermove', evt => {
		if (!mapState) return;
		if (touching.has(evt.pointerId)) {
			touching.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
		}
		if (markDrag) {
			const host = document.querySelector('[data-map]');
			if (!host) return;
			const m = markBySeq(markDrag.kind, markDrag.seq);
			const now = atSea(host, evt.clientX, evt.clientY);
			if (m) {
				const hold = v => Math.max(0, Math.min(200000, Math.round(v)));
				m.x = hold(markDrag.x + now.x - markDrag.from.x);
				m.y = hold(markDrag.y + now.y - markDrag.from.y);
			}
			if (Math.hypot(evt.clientX - markDrag.px, evt.clientY - markDrag.py) > 4) markDrag.moved = true;
			schedulePaint();
			return;
		}
		if (penStroke) {
			const host = document.querySelector('[data-map]');
			if (host) penMove(host, evt.clientX, evt.clientY);
			return;
		}

		if (pinch && touching.size === 2) {
			const host = document.querySelector('[data-map]');
			if (!host) return;
			// Continuous: the chart magnifies exactly as fast as the
			// fingers spread, anchored between them -- the same
			// pin-the-world rule the wheel uses.
			const [a, b] = [...touching.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			if (dist > 1 && pinch.dist > 1) {
				const box = host.getBoundingClientRect();
				if (zoomAt(mapState, Math.log2(dist / pinch.dist),
					{ w: box.width, h: box.height },
					(a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top)) schedulePaint();
			}
			pinch.dist = dist;
			return;
		}

		if (!dragging) {
			const host = evt.target.closest && evt.target.closest('[data-map]');
			if (host && !evt.target.closest(furniture())) paintCoords(host, evt.clientX, evt.clientY);
			return;
		}
		pan(mapState, evt.clientX - dragging.x, evt.clientY - dragging.y);
		dragging = { x: evt.clientX, y: evt.clientY };
		schedulePaint();
	});

	const stop = evt => {
		// A mark set down stays where it was let go; a word tapped rather
		// than carried opens for retyping.
		if (markDrag) {
			const { kind, seq, moved } = markDrag;
			markDrag = null;
			document.querySelectorAll('[data-map].moving-mark').forEach(el => el.classList.remove('moving-mark'));
			if (evt) touching.delete(evt.pointerId);
			if (!moved && kind === 'word' && markBySeq('word', seq)) editing = seq;
			persist();
			refreshSide();
			paintMap();
			return;
		}
		// A press that did not move is a click on the sea: with the ruler
		// armed, that is one end of a measurement.
		if (penStroke) penEnd();
		if (evt && evt.type === 'pointerup' && pressed && mapState
			&& Math.hypot(evt.clientX - pressed.x, evt.clientY - pressed.y) < 5) {
			if (measuring) measureAt(pressed.host, evt.clientX, evt.clientY);
			else if (traceTool === 'point') traceAdd(pressed.host, evt.clientX, evt.clientY);
			else if (traceTool === 'text') textAdd(pressed.host, evt.clientX, evt.clientY);
		}
		pressed = null;
		if (evt) touching.delete(evt.pointerId);
		if (touching.size < 2) pinch = null;
		if (touching.size === 1) {
			// The finger that stays keeps panning from where it is.
			const [rest] = touching.values();
			dragging = { x: rest.x, y: rest.y };
			return;
		}
		dragging = null;
		document.querySelectorAll('[data-map].dragging').forEach(el => el.classList.remove('dragging'));
	};
	document.addEventListener('pointerup', stop);
	document.addEventListener('pointercancel', stop);

	// The wheel is not delegated like the rest: it lives on the map box
	// itself, wired by paintMap -- see onWheel.

	// The search box filters as you type, touching only the list under
	// it -- rebuilding the input mid-word would eat the caret.
	document.addEventListener('input', evt => {
		const el = evt.target.closest('[data-act="map-search"]');
		if (!el) return;
		searchQ = el.value;
		refreshSideList();
	});

	// The minimap's grip drags it; the box keeps it inside itself.
	let miniDrag = null;
	document.addEventListener('pointerdown', evt => {
		const grip = evt.target.closest('[data-mini-grip]');
		if (!grip) return;
		const mini = grip.closest('[data-map-mini]');
		const host = mini.closest('[data-map]');
		const r = mini.getBoundingClientRect();
		const h = host.getBoundingClientRect();
		miniDrag = { mini, host, dx: evt.clientX - r.left, dy: evt.clientY - r.top, w: r.width, hgt: r.height, hx: h.left, hy: h.top, hw: h.width, hh: h.height, moved: false };
		grip.setPointerCapture(evt.pointerId);
		evt.preventDefault();
	});
	document.addEventListener('pointermove', evt => {
		if (!miniDrag) return;
		const x = Math.max(0, Math.min(miniDrag.hw - miniDrag.w, evt.clientX - miniDrag.hx - miniDrag.dx));
		const y = Math.max(0, Math.min(miniDrag.hh - miniDrag.hgt, evt.clientY - miniDrag.hy - miniDrag.dy));
		miniPos = { x, y };
		miniDrag.moved = true;
		Object.assign(miniDrag.mini.style, { left: `${Math.round(x)}px`, top: `${Math.round(y)}px`, right: 'auto', bottom: 'auto' });
		miniDrag.mini.classList.add('moved');
	});
	const endMiniDrag = () => {
		if (!miniDrag) return;
		if (miniDrag.moved) persist();
		miniDrag = null;
	};
	document.addEventListener('pointerup', endMiniDrag);
	document.addEventListener('pointercancel', endMiniDrag);

	// A click on the minimap is "take me there": the same spot, scaled
	// up from thumbnail to sea.
	document.addEventListener('click', evt => {
		const mini = evt.target.closest('[data-map-mini]');
		if (!mini || !mapState || evt.target.closest('[data-mini-grip], [data-act]')) return;
		const r = mini.getBoundingClientRect();
		const b = npcBox();
		flyTo(
			b.x0 + (evt.clientX - r.left) / r.width * (b.x1 - b.x0),
			b.y0 + (evt.clientY - r.top) / r.height * (b.y1 - b.y0)
		);
	});

	window.addEventListener('resize', () => {
		if (view === 'map') paintMap();
	});

	// A route file dropped on the sea is a route file opened.
	document.addEventListener('dragover', evt => {
		if (evt.target.closest && evt.target.closest('[data-map]')) evt.preventDefault();
	});
	document.addEventListener('drop', async evt => {
		const host = evt.target.closest && evt.target.closest('[data-map]');
		if (!host) return;
		evt.preventDefault();
		const file = evt.dataTransfer && evt.dataTransfer.files && evt.dataTransfer.files[0];
		if (!file) return;
		try {
			const r = importRoute(await file.text());
			toast(`Route loaded: ${r.stops} stop${r.stops === 1 ? '' : 's'}${r.dropped ? `, ${r.dropped} not on this chart` : ''}`);
			refreshSide();
			paintMap();
		} catch (err) {
			toast(err.message);
		}
	});
}

/* What the shell's event handling steers. */

export function setMapPick(value) {
	mapPick = value;
	// Picking something is asking where it is; sail there.
	pendingFit = true;
}

/** Another screen pointing at the map: show this item's islands. */
export function mapShowItem(item) {
	mapPick = item;
	pinnedNpc = null;
	pendingFit = true;
}

export function mapFit() {
	pendingFit = true;
	paintMap();
}

export function mapZoomStep(step) {
	if (!mapState) return;
	flyTo(mapState.centre.x, mapState.centre.y, mapState.zoom + step * 0.7);
}

export function mapCentreOn(npcId) {
	const at = npcById.get(npcId);
	if (!at || !mapState) return;
	pinnedNpc = npcId;
	hoverNpc = null;
	flyTo(at.x, at.y, Math.max(mapState.zoom, zoomRange.max - 0.35));
}

export function setMapMode(id) {
	if (!['sail', 'route', 'today', 'hunt', 'trace'].includes(id)) return;
	mode = id;
	// Leaving the trace tab puts the pen down and gives the chart's
	// markers their clicks back.
	if (mode !== 'trace') {
		if (editing) endWriting();
		traceTool = null;
	}
	markTraceHost();
	persist();
	refreshSide();
	paintMap();
}

export function toggleMapPanel() {
	panelOpen = !panelOpen;
	persist();
	refreshSide();
}

export function toggleMapStop(npcId) {
	if (!npcById.has(npcId)) return;
	if (stops.length && !stopsLive()) {
		// Plotting under a new view starts a new plot; the old one is
		// kept as "Previous route" rather than lost.
		stashRoute();
		stops = [npcId];
	} else {
		stops = stops.includes(npcId) ? stops.filter(id => id !== npcId) : [...stops, npcId];
	}
	stopsPick = mapPick || '';
	persist();
	refreshSide();
	paintMap();
}

export function useSuggestedRoute() {
	stashRoute();
	stops = suggestedIds(marksNow());
	stopsPick = mapPick || '';
	persist();
	refreshSide();
	paintMap();
}

export function reverseMapRoute() {
	stops = [...stops].reverse();
	persist();
	refreshSide();
	paintMap();
}

export function clearMapRoute() {
	stops = [];
	persist();
	refreshSide();
	paintMap();
}

export function toggleMapDone(npcId) {
	const dn = doneSet();
	if (dn.has(npcId)) dn.delete(npcId); else dn.add(npcId);
	done = { day: barterDay(), ids: [...dn] };
	persist();
	refreshSide();
	paintMap();
}

export function closeMapTip() {
	pinnedNpc = null;
	paintMap();
}

/**
 * The "Showing" picker: what to light the chart for, with the things
 * your builds are short of pinned on top -- the map is the question
 * "where do I get what I still need", so the list leads with exactly
 * that, counts and faces included.
 */
export function openMapPicker() {
	if (!barterData) return;
	const names = [...new Set(barterData.map(b => b.name))];
	const short = names.filter(n => snapshot.missing[n] > 0)
		.sort((a, b) => snapshot.missing[b] - snapshot.missing[a]);
	const rest = names.filter(n => !(snapshot.missing[n] > 0)).sort();
	const kindWord = { material: 'material', trade: 'trade good', coin: 'crow coin' };
	const items = [
		{ id: '', label: 'Everything I am short of', icon: '<span class="row-icon sm map-pick-all">⚓</span>', meta: `${short.length} goods` },
		...short.map(n => ({ id: n, label: n, icon: img(n, ''), meta: `${F(snapshot.missing[n])} short`, group: 'On your build list' })),
		...rest.map(n => ({ id: n, label: n, icon: img(n, ''), sub: kindWord[barterKind(n)], group: 'The rest of the sea' })),
		...monsters.filter(m => m.points.length || m.zones).map(m => ({
			id: `hunt:${m.key}`, label: m.name,
			icon: monsterArt[m.key] ? `<img src="icons/${monsterArt[m.key]}" alt="">` : `<span class="row-icon sm map-pick-all" style="color:${m.colour}">◎</span>`,
			sub: m.points.length ? `${m.points.length} spawn points · ${(m.zones || habitats(m)).length} habitat${(m.zones || habitats(m)).length === 1 ? '' : 's'}` : 'the habitat marker only, so far',
			meta: huntsOn.includes(m.key) ? 'shown' : '', group: 'Hunting grounds'
		}))
	];
	openPicker({
		title: 'What to look for',
		hint: 'The chart lights the islands that barter it, or the waters a species swims in.',
		items, selected: mapPick || '',
		onPick: id => {
			if (id.startsWith('hunt:')) {
				showHunt(id.slice(5));
			} else {
				setMapPick(id || null);
			}
			document.dispatchEvent(new CustomEvent('app-render'));
		}
	});
}

/* The step player. */

function moveStep(i) {
	const ids = routeIds(marksNow());
	if (ids.length < 2) return;
	stepIdx = ((i % ids.length) + ids.length) % ids.length;
	if (follow) {
		const n = npcById.get(ids[stepIdx]);
		if (n) {
			pinnedNpc = n.id;
			hoverNpc = null;
			flyTo(n.x, n.y, Math.max(mapState.zoom, zoomRange.max - 0.5));
		}
	}
	paintMap();
}

export function mapStep(delta) {
	moveStep(stepIdx + delta);
}

export function mapStepTo(i) {
	moveStep(i);
}

export function mapFollowToggle() {
	follow = !follow;
	persist();
	if (follow) moveStep(stepIdx);
	else paintMap();
}

/* The route's anchor. */

export function setMapStart(portId) {
	startPort = ports.some(p => p.id === portId) ? portId : 0;
	persist();
	paintMap();
}

/** Switch a community course on, or off again by choosing it twice. */
export function setMapHabitats() {
	habitatsOn = !habitatsOn;
	persist();
	refreshSide();
	paintMap();
}

export function setMapLabels() {
	labelsOn = !labelsOn;
	persist();
	refreshSide();
	paintMap();
}

/** The barterers' own marks, off and on. */
export function setMapPins() {
	pinsOn = !pinsOn;
	persist();
	refreshSide();
	paintMap();
}

/** Every traced route at once, off and on. */
export function setMapTraces() {
	tracesOn = !tracesOn;
	persist();
	refreshSide();
	paintMap();
}

/** The side panel to the other edge -- right-handed on a phone, or
 *  clear of whatever the left of the chart is showing. */
export function flipMapSide() {
	sideRight = !sideRight;
	persist();
	const host = document.querySelector('[data-map]');
	if (host) host.classList.toggle('side-right', sideRight);
	refreshSide();
}

export function setMapWharves(kind) {
	if (kind !== 'wharf' && kind !== 'guild') return;
	wharvesOn = wharvesOn.includes(kind) ? wharvesOn.filter(k => k !== kind) : [...wharvesOn, kind];
	persist();
	refreshSide();
	paintMap();
}

export function setMapCourse(id) {
	if (!courseById[id]) return;
	coursesOn = coursesOn.includes(id) ? coursesOn.filter(x => x !== id) : [...coursesOn, id];
	persist();
	refreshSide();
	paintMap();
}

/** Switch a species' grounds on or off. */
export function setMapHunt(key) {
	// A shared habitat marker names several species: all on, or all off.
	const keys = String(key).split(',').filter(k => monsterByKey[k]);
	if (!keys.length) return;
	const allOn = keys.every(k => huntsOn.includes(k));
	huntsOn = allOn ? huntsOn.filter(x => !keys.includes(x)) : [...new Set([...huntsOn, ...keys])];
	persist();
	refreshSide();
	paintMap();
}

/** From a quest: show where its monster lives -- the Hunt tab open,
 *  that species on, the chart fitted to it. Nothing else switched off. */
export function showHunt(key) {
	restore();
	if (!monsterByKey[key]) return;
	if (!huntsOn.includes(key)) huntsOn = [...huntsOn, key];
	mode = 'hunt';
	panelOpen = true;
	// Sail to that species' waters, not to everything on the chart.
	const m = monsterByKey[key];
	pendingFit = { points: (m.points.length ? m.points : m.zones || []).map(([x, y]) => ({ x, y })) };
	persist();
}

export function setMapReturn(on) {
	returnHome = on === true;
	persist();
	paintMap();
}

export function mapPortClick(portId) {
	setMapStart(startPort === portId ? 0 : portId);
	refreshSide();
}

/** Bring the chart back to the view a dormant plot was made under. */
export function reviveMapRoute() {
	mapPick = stopsPick || null;
	pendingFit = true;
	pinnedNpc = null;
}

export function setMapKind(id) {
	if (!['all', 'material', 'trade'].includes(id)) return;
	kindFilter = id;
	persist();
	refreshSide();
	paintMap();
}


/* ------------------------------------------------------------------ *
 * a route as a file
 * ------------------------------------------------------------------ */

/**
 * The plotted route as JSON: the stops by barterer id and name, where
 * it sails from, and whether it comes home. Names ride along so the
 * file reads as a route to a person and survives an id the data no
 * longer has; ids are what import trusts.
 */
export function exportRoute() {
	const ids = stopsLive() ? stops : [];
	return JSON.stringify({
		app: 'bdo-ship-upgrade-tracker',
		kind: 'barter-route',
		version: 1,
		exported: new Date().toISOString(),
		for: mapPick || null,
		start: ports.find(p => p.id === startPort) ? { id: startPort, name: ports.find(p => p.id === startPort).name } : null,
		returnHome,
		stops: ids.map(id => {
			const n = npcById.get(id);
			return { npc: id, name: n ? n.name : null, at: n ? n.at : null };
		})
	}, null, 2);
}

/**
 * Take a route file back in. Stops unknown to the chart are dropped
 * and counted, so a file from a newer dataset still lands; the route
 * is plotted under whatever the chart is currently showing.
 */
export function importRoute(text) {
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('That file is not valid JSON.');
	}
	if (data && data.kind === 'trace') {
		const t = applyTraceObject(data);
		if (!t) throw new Error('That trace file is empty.');
		return { stops: t.points.length, dropped: 0, trace: true };
	}
	if (!data || data.kind !== 'barter-route' || !Array.isArray(data.stops)) {
		throw new Error('That file does not hold a barter route or a trace.');
	}
	const ids = [];
	let dropped = 0;
	for (const s of data.stops) {
		const id = Number(s && (s.npc ?? s.id));
		if (npcById.has(id) && !ids.includes(id)) ids.push(id);
		else dropped++;
	}
	if (!ids.length) throw new Error('None of those stops is on this chart.');
	if (stops.length && stops.join('.') !== ids.join('.')) stashRoute();
	stops = ids;
	stopsPick = mapPick || '';
	startPort = data.start && ports.some(p => p.id === Number(data.start.id)) ? Number(data.start.id) : 0;
	returnHome = data.returnHome === true;
	mode = 'route';
	stepIdx = 0;
	persist();
	return { stops: ids.length, dropped };
}

/* ------------------------------------------------------------------ *
 * the game's own map
 * ------------------------------------------------------------------ */

let gameSource = 'route';     // route | hunt -- which list the dialog is writing
let gameWrite = 'favorites';  // favorites, or 0..2 for one of the map's loops

/**
 * The stops the Hunt tab has ticked, as one run.
 *
 * A course is already a loop, so several ticked are sailed one after
 * another rather than saved apart -- that is what a night out hunting
 * actually looks like, and the map keeps only three loops anyway. A
 * species' grounds are a scatter, not a course, so each contributes the
 * middle of its spawn points: one place to steer for.
 */
function huntPoints() {
	const out = [];
	for (const c of courses) {
		if (!coursesOn.includes(c.id)) continue;
		for (const p of c.points) out.push({ name: p.name || c.name, x: p.x, y: p.y });
	}
	for (const m of monsters) {
		if (!huntsOn.includes(m.key) || !m.points.length) continue;
		const mid = m.points.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
		out.push({ name: `${m.name} grounds`, x: mid[0] / m.points.length, y: mid[1] / m.points.length });
	}
	return out.map((p, i) => ({ ...p, name: `${i + 1}: ${p.name}` }));
}

/** The route's stops, in sailing order. */
function routePoints() {
	const ids = stopsLive() ? stops : [];
	return ids.map((id, k) => {
		const n = npcById.get(id);
		return { name: `${k + 1}: ${n.name} (${n.at})`, x: n.x, y: n.y };
	});
}

/**
 * The plotted stops as the game's favourites: the XML block for
 * gameVariable.xml, and how much of the route it holds. Each bookmark
 * is numbered in sailing order and named for the barterer and the
 * island, so the map's list reads as the route does here.
 */
export function gameBookmarks() {
	const loopOnly = gameWrite !== 'favorites';
	const points = gameSource === 'hunt' ? huntPoints() : gameSource === 'trace' ? tracePoints(!loopOnly) : routePoints();
	// One or the other, never both: the favourites are five named pins
	// and ten camera jumps, a loop is the whole run in order. Writing
	// both would spend someone's five favourites on stops the loop
	// already holds. Whichever is not written is left as it was.
	const loop = loopOnly ? gameWrite : null;
	return {
		...bookmarkXML(points, {
			cameras: loop === null,
			bookmarks: loop === null,
			loop,
			// A loop is sailed, so it gets the way round the headlands;
			// a favourite is a place, so it stays the place.
			loopPoints: loop === null ? null : seaBent(points)
		}),
		stops: points.length,
		source: gameSource
	};
}

export function setGameWrite(value) {
	gameWrite = writeMode(value);
}

/**
 * The dialog: the block to paste, and the three things a person has
 * to know to paste it -- which file, when (the game overwrites it on
 * every character switch, so at the character screen or with the game
 * closed), and which part to replace.
 */
export async function openGameExport(source) {
	if (source === 'route' || source === 'hunt' || source === 'trace') gameSource = source;
	const r = gameBookmarks();
	if (!r.stops) return;
	const what = r.source === 'hunt' ? 'hunt' : r.source === 'trace' ? 'traced route' : 'route';
	// Chromium can hold the folder itself; elsewhere the block is pasted.
	const folder = canWriteFiles() ? await gameFolderName() : null;
	const direct = canWriteFiles() ? `<div class="map-game-direct">
			<div class="map-game-direct-head">Or let the app write it</div>
			<p>${folder
				? `Writing to <code>gameVariable.xml</code> in folder <code>${esc(folder)}</code>; the file as it was is copied to <code>gameVariable.xml.bak</code> first. The browser asks once per visit before it touches the folder.`
				: 'Choose the <strong>account-number folder</strong> inside <code>UserCache</code> once; the browser remembers it and asks before each write. Every write first copies the file to <code>gameVariable.xml.bak</code>.'}
				Do it at the character screen — the game rewrites the file when a character loads.</p>
			<div class="map-game-btns">
				<button class="ghost-btn" data-act="map-game-pick">${folder ? 'Choose another folder' : 'Choose the account folder…'}</button>
				<button class="ghost-btn" data-act="map-game-write"${folder ? '' : ' disabled'}>Write it into the game file</button>
				${previousBlock() ? '<button class="ghost-btn" data-act="map-game-restore" title="Put back the favourites the last write replaced">Restore previous</button>' : ''}
			</div>
		</div>` : `<p class="map-game-nodirect">Only Chromium browsers (Chrome, Edge, Brave) can write the file for you; this one cannot, so paste the block by hand.</p>`;
	const held = r.bookmarks + r.cameras;
	const fit = r.loop
		? `Loop ${r.loop.slot + 1} carries all ${r.stops} in order${r.loop.bends
			? `, with ${r.loop.bends} turn${r.loop.bends === 1 ? '' : 's'} added to keep the line off the rocks`
			: ''} — a loop is a list, not five slots. Your favourites and the map's other two loops are left as they are.`
		: r.stops <= BOOKMARK_SLOTS
			? `All ${r.stops} fit the map's ${BOOKMARK_SLOTS} favourite slots, named.`
			: `The map's Favorites list holds ${BOOKMARK_SLOTS}; ${
				`points ${BOOKMARK_SLOTS + 1}–${held} go on the ${CAMERA_SLOTS} camera slots (the number keys on the map), unnamed but in order`
			}${r.dropped ? `, and ${r.dropped} more do not fit — a loop would hold them all` : ''}.`;
	const loopRow = `<div class="map-game-loop">
		<label>Write it as
			<select class="purse-inline" data-act="map-game-as">
				<option value=""${gameWrite === 'favorites' ? ' selected' : ''}>favourites — ${BOOKMARK_SLOTS} named, ${CAMERA_SLOTS} camera slots</option>
				${Array.from({ length: LOOP_SLOTS }, (_, i) => `<option value="${i}"${gameWrite === i ? ' selected' : ''}>loop ${i + 1} — every point, in order</option>`).join('')}
			</select>
		</label>
	</div>`;
	openDialog(`<h2>Put the ${what} on the game's map</h2>
		<p>Black Desert reads its world map from a file. Paste this block in and the
		${what === 'hunt' ? 'courses and grounds you ticked' : 'stops'} appear
		${r.loop ? 'as one of the map\'s three navigation loops' : 'under <strong>World Map → Favorites</strong>, numbered in order, each with a locate button'}.</p>
		<p class="map-game-fit">${esc(fit)}</p>
		${loopRow}
		<textarea class="map-xml" readonly rows="10" spellcheck="false" aria-label="The XML block for gameVariable.xml">${esc(r.xml)}</textarea>
		<div class="map-game-btns">
			<button class="ghost-btn" data-act="map-game-copy">Copy</button>
			<button class="ghost-btn" data-act="map-game-save">Download .xml</button>
		</div>
		${direct}
		<details class="map-game-how">
			<summary>How to install it</summary>
			<ol>
				<li>Go to the <strong>character selection screen</strong>, or close the game — it rewrites this file whenever a character loads, so a paste made while playing is lost.</li>
				<li>Open <code>${esc(FILE_HINT.windows)}</code>. On Linux under Steam it is
					<code>${esc(FILE_HINT.linux)}</code>. The account folder is a number; the <code>gameVariable.xml</code> <em>inside</em> it is the one the map reads, not the one beside it.</li>
				<li>Find the <code>&lt;WorldMapQuickScreenPosition Version="4"&gt;</code> block near the end and replace the whole block with this one. It replaces any favourites and camera positions you saved before; to keep camera positions, paste only the <code>&lt;WorldmapBookMark&gt;</code> part.</li>
				<li>Save, load a character, open the map: the stops are in Favorites.</li>
			</ol>
			<p>The trick is the fishing community's — Flockenberger's <em>bdo-fish-waypoints</em> is where the file format was worked out.</p>
		</details>
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`);
}

