// The Map screen: the chart, your shopping list drawn onto it, and the
// gestures that move it. The viewer's state -- where you are looking,
// what you picked to show, the route you are building -- lives here,
// with the command functions the shell's event handling calls.

import { sailFor } from './screen-barter.js';
import { courses, courseById } from './courses.js';
import { monsters, monsterByKey } from './sea_monsters.js';
import { esc, F, FC } from './fmt.js';
import { currentShip } from './ship.js';
import { img } from './ui-bits.js';
import {
	createMap, frame, marksFor, pan, zoomAt, clampView, fitTo,
	routeFor, routePath, project, placeTile, zoomRange, CLOSE_ZOOM, levelFor, tilesFor
} from './map.js';
import { npcs, npcById, ports, MAX_ZOOM, TILE } from './barter_npcs.js';
import { seaRoute, setLanes, openSea, nearestWater } from './searoute.js';
import { wharves, nearestWharf } from './wharves.js';
import { habitatsOf, habitatsOfMany } from './habitats.js';
import { monsterArt } from './monster_art.js';
import { gradeById } from './crystals.js';
import { quests } from './quests.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { barterKey, nextSpawn, localLabel } from './clock.js';
import { vellPlan } from './today.js';
import { openPicker } from './picker.js';
import * as store from './state.js';
import { legLengths, pathLength, sailRange, fmtRange, calibrate, fmtDistance, DEFAULT_CAL } from './sailing.js';
import { bookmarkXML, writeMode, BOOKMARK_SLOTS, CAMERA_SLOTS, LOOP_SLOTS, FILE_HINT, toGame, readGameXML, looksLikeGameXML } from './worldmap.js';
import { encodeAny, decodeAny } from './share.js';
import { canWriteFiles, gameFolderName, previousBlock } from './gamefile.js';
import { parleyPerTrade, PARLEY, GOODS, amount, bestExchange, levelOf, triesFor } from './barter.js';
import { marketPrice } from './market.js';
import { routeLedger, perHour } from './route-ledger.js';
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
let runTrades = {};           // npc id -> what a Barter-tab run calls there for: { give, giveText, item, recvText, recv, giveN, times }
let runStash = [];            // the run's wharf calls, threaded between the islands: { i, name, at, x, y, drops, sale, silver }
let done = { day: '', ids: [] };
let restored = false;

let hoverNpc = null;
let pinnedNpc = null;
let hoverStash = -1;          // a wharf call under the pointer, by its place in runStash
let pinnedStash = -1;         // one whose card was opened by a click
let fly = null;               // the rAF handle of a flight in progress
let flightTo = null;          // where it is bound: a map state, for fetching ahead
let drawnLevel = null;        // the tile level the last paint drew
let heldLevel = null;         // the level kept on screen while a zoom is in motion
let settleTimer = null;       // the wheel's quiet moment, after which the zoom lands

let startPort = 0;            // wharf the route sails from; 0 = first stop
let returnHome = false;       // close the loop back to that wharf
let coursesOn = [];           // community courses drawn beneath the route, by id
let huntsOn = [];             // sea monster grounds shown, by species key
let wharvesOn = [];           // 'wharf' and/or 'guild': the wharf managers drawn
let habitatsOn = true;        // the game's habitat markers: a picture per species' ground
let labelsOn = true;          // island names, faint, once the chart is close enough to read them
let sideRight = false;        // the side panel on the right-hand side instead
let follow = true;            // the step player flies the camera along
let nextOnly = false;         // the route drawn faint but for the leg into the current stop
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
let areaDraft = null;         // the corners of an area being shaded, flat world coords, until it is closed
let inkColour = '#ffd77a';    // the ink every new stop, stroke and word is drawn in
let inkWidth = 2.5;           // how thick the pen draws
let inkSize = 14;             // how big a word is written
let inkPlate = true;          // a word sits on a dark plate, to be read over bright water
let hugWater = true;          // a traced leg bends round the land between its stops
let layersOpen = true;        // the strip of chart layers is unfolded
let pinsOn = true;            // the barterers' own marks are drawn
let tracesOn = true;          // hand-traced routes are drawn
let libQ = '';                // the traces library: what is typed in its search
let libSort = 'recent';       // recent | name | size
let libOnly = 'all';          // all | shown
let libOpen = false;          // the library is the dialog on screen
let editing = 0;              // the seq of the word being typed on the chart, 0 for none
let markDrag = null;          // a stop or a word being carried elsewhere: { kind, seq, from, x, y, moved }
let fullOn = false;           // the chart is the whole screen, over the app
let fullTurned = false;       // and turned on its side, for a phone held upright that cannot be told to turn

/** The barter day, on the standing region's clock -- the same one the
 *  Resets dialog corrects, so the countdown and the "sailed today" ticks
 *  roll over together. */
/** Vell's next spawn on the standing region's timetable, or null. */
function vellNext() {
	const plan = vellPlan();
	const next = plan && nextSpawn(plan.zone, plan.times);
	return next ? { at: next.at, label: localLabel(next.at) } : null;
}

function barterDay() {
	return barterKey();
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
		if (s.runTrades && typeof s.runTrades === 'object') runTrades = readTrades(Object.entries(s.runTrades).map(([id, t]) => [Number(id), t.give, t.giveText, t.item, t.recvText, t.recv, t.giveN, t.times]));
		if (Array.isArray(s.runStash)) runStash = readStash(s.runStash.map(c => [c.i, c.name, c.at, c.x, c.y, (c.drops || []).map(d => [d.item, d.n]), c.sale, c.silver, c.quests || []]));
		if (s.done && s.done.day === barterDay()) done = s.done;
		if (ports.some(p => p.id === s.startPort)) startPort = s.startPort;
		returnHome = s.returnHome === true;
		follow = s.follow !== false;
		nextOnly = s.nextOnly === true;
		if (Array.isArray(s.coursesOn)) coursesOn = s.coursesOn.filter(id => courseById[id]);
		if (Array.isArray(s.huntsOn)) huntsOn = s.huntsOn.filter(k => monsterByKey[k]);
		if (Array.isArray(s.wharvesOn)) wharvesOn = s.wharvesOn.filter(k => k === 'wharf' || k === 'guild');
		habitatsOn = s.habitatsOn !== false;
		labelsOn = s.labelsOn !== false;
		pinsOn = s.pinsOn !== false;
		// A phone's panel is 300 of its 400 pixels; the strip folds itself
		// away there until it is asked for, and stays as it is left.
		layersOpen = s.layersOpen === undefined
			? !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 720px)').matches)
			: s.layersOpen !== false;
		hugWater = s.hugWater !== false;
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
	syncLanes();
}

function persist() {
	syncLanes();
	try {
		localStorage.setItem(STORE_KEY,
			JSON.stringify({ mode, panelOpen, stops, stopsPick, runTrades, runStash, done, startPort, returnHome, follow, nextOnly, kindFilter, coursesOn, huntsOn, wharvesOn, habitatsOn, labelsOn, pinsOn, tracesOn, hugWater, layersOpen, sideRight, tradesMode, savedRoutes, miniOn, miniPos, trace, traces, inkColour, inkWidth, inkSize, inkPlate }));
	} catch { /* private mode; the session still works */ }
}

/** The kept traces marked as lanes, handed to the router as the water
 *  the game sails -- once per change, since every route drawn so far
 *  is stale the moment a lane is. */
let lanesKey = '';
function syncLanes() {
	const lanes = traces.filter(r => r.lane && r.points.length > 1).map(r => r.points.map(p => ({ x: p.x, y: p.y })));
	const key = JSON.stringify(lanes);
	if (key === lanesKey) return;
	lanesKey = key;
	setLanes(lanes);
	bent.clear();
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
		if (bent.size > 64) bent.clear();
		bent.set(key, seaRoute(points));
	}
	return bent.get(key);
}

/** Those stops as world points -- the run's wharf calls among them --
 *  with the start wharf prepended, and appended when the route is to
 *  end where the ship lives. */
function routeWorld(marks) {
	const pts = routeSeq(marks).map(s => s.place);
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
			<button class="ghost-btn" data-act="map-full" aria-pressed="${fullOn}" aria-label="Show the chart over the whole screen" title="Full screen: the chart over everything; ✕ or Esc brings the page back">⛶</button>
		</div>
	</div>`;

	// The clocks the sea runs on, always in view over the chart: when
	// the barterers redraw, when the dailies and weeklies reset, and
	// when Vell is next up on this player's servers. A pill on the
	// chart's own corner, so the chart keeps every pixel of its height.
	const vell = vellNext();
	const clocks = `<div class="map-clocks" role="status">
		<span title="Every barterer's list redraws">barter <b data-until="barter"></b></span>
		<span title="The daily quests reset">dailies <b data-until="daily"></b></span>
		<span title="The weekly quests reset">weeklies <b data-until="weekly"></b></span>
		${vell ? `<span title="Vell's next spawn on your servers, ${esc(vell.label)}">Vell <b data-until="at" data-at="${vell.at}"></b></span>` : ''}
	</div>`;
	// Over the whole screen, the header's buttons are out of reach, so
	// the chart carries the few that matter and the way back.
	const fullBar = `<div class="map-full-bar" data-map-fullbar>
		<button class="ghost-btn" data-act="map-zoom" data-step="-1" aria-label="Zoom out">−</button>
		<button class="ghost-btn" data-act="map-zoom" data-step="1" aria-label="Zoom in">+</button>
		<button class="ghost-btn" data-act="map-fit" aria-label="Fit the marked islands in view">⌖</button>
		<button class="ghost-btn" data-act="map-full" aria-label="Back to the page" title="Back to the page (Esc)">✕</button>
	</div>`;
	return head + `<div class="panel map-panel"><div class="map${measuring ? ' measuring' : ''}${sideRight ? ' side-right' : ''}${mode === 'trace' ? ' free-hand' : ''}${traceTool ? ` tracing tool-${traceTool}` : ''}${fullOn ? ' full' : ''}${fullTurned ? ' turned' : ''}" id="map" data-map>
		<div class="map-layer" data-map-layer></div>
		<div class="map-side-slot" data-map-side>${sideHTML(marks)}</div>
		<div class="map-tip" data-map-tip hidden></div>
		<div class="map-steps" data-map-steps hidden></div>
		<div class="map-coords" data-map-coords hidden></div>
		${clocks}
		${fullBar}
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
	const tabs = [['sail', 'Barter'], ['route', 'Route'], ['trace', 'Draw'], ['hunt', 'Grounds'], ['today', 'Today']]
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
		${layersHTML()}
		<div class="map-side-body">${body}</div>
	</div>`;
}

/**
 * What the chart draws, on every tab.
 *
 * These were switches inside the Hunt tab, which made them look like
 * part of hunting; they are not. What is on the chart is the same
 * question whichever tab is open -- plotting a loop past the wharves,
 * tracing over the barterers, reading the grounds -- so they live above
 * the tabs, one row of them, and fold away when they are in the road.
 */
function layersHTML() {
	const wharfN = k => wharves.filter(w => w.kind === k).length;
	const chip = (act, id, on, dot, label, title) => `<button class="map-chip${on ? ' on' : ''}" data-act="${act}"${id ? ` data-id="${id}"` : ''}
		aria-pressed="${on}" title="${esc(title)}"><span class="map-chip-dot" style="background:${dot}"></span>${esc(label)}</button>`;
	const chips = [
		chip('map-pins', '', pinsOn, '#7ef0d4', 'Barterers', `The ${npcs.length} island marks`),
		chip('map-habitats', '', habitatsOn, '#ffd77a', 'Habitats', "A picture where each species lives, as the game's map shows them"),
		chip('map-wharves', 'wharf', wharvesOn.includes('wharf'), '#9fd0f0', 'Wharves', `${wharfN('wharf')} wharf managers — repair, rations, sailor contracts`),
		chip('map-wharves', 'guild', wharvesOn.includes('guild'), '#c6a0ff', 'Guild', `${wharfN('guild')} guild wharves — the Old Moon Guild's, for a guild ship`),
		chip('map-labels', '', labelsOn, '#cfe3f5', 'Islands', 'Island names, faint, once the chart is close enough to read them'),
		chip('map-traces', '', tracesOn, '#ffd77a', 'Traces', 'What you drew by hand, and every kept trace with its eye open')
	].join('');
	const on = [pinsOn, habitatsOn, labelsOn, tracesOn].filter(Boolean).length + wharvesOn.length;
	return `<div class="map-layers${layersOpen ? ' open' : ''}">
		<button class="map-layers-head" data-act="map-layers" aria-expanded="${layersOpen}"
			title="What the chart draws, on every tab">
			<span class="map-layers-caret" aria-hidden="true">${layersOpen ? '▾' : '▸'}</span>
			<span>On the chart</span><span class="map-courses-credit">${on} of 6</span></button>
		${layersOpen ? `<div class="map-chips">${chips}</div>` : ''}
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
			<span class="map-row-name">${esc(npc.at)}</span>
			<span class="map-row-sub">${esc(npc.name)} · ${sub}</span>
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
		.sort((a, b) => b.m.items.size - a.m.items.size || a.npc.at.localeCompare(b.npc.at))
		.map(({ npc, m }) => {
			const items = [...m.items.keys()];
			const gives = [...new Set([...m.items.values()].flatMap(s => [...s]))];
			const kind = barterKind(items[0] || '');
			const pool = new Set(goodsOf(npc.id).filter(g => barterKind(g.item) === kind)
				.map(g => g.item)).size;
			return rowHTML(npc,
				`${pool > 1 ? `1 of ${pool} a refresh · ` : ''}for ${esc(gives.slice(0, 2).join(' / ') || '—')}`,
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
	const ledger = routeLedger({
		stops,
		tradesAt: id => (runTrades[id] ? [runTrades[id]] : stopTrades(id, marks)),
		timesAt: id => (runTrades[id] ? runTrades[id].times : tradesMode === 'all' ? triesAt(id, marks) : 1),
		aboard: heldGoods().reduce((a, g) => a + g.weight, 0),
		price: marketPrice
	});
	const held = prof.parleyHeld;
	const need = costs.reduce((a, b) => a + b, 0);
	let afford = 0;
	for (let acc = 0; afford < costs.length && acc + costs[afford] <= held; afford++) acc += costs[afford];
	const overBudget = held > 0 && afford > 0 && afford < stops.length;

	// The rows follow the line as it is sailed, so a wharf call sits
	// between the two islands it comes between and wears the number the
	// chart gives it.
	let isle = -1;
	const list = routeSeq(marks).map((s, k) => {
		const m = legTo(k);
		const leg = m != null ? `<span class="map-leg">${esc(fmtDistance(m))}${timeOf(m) ? ` · ${esc(timeOf(m))}` : ''}</span>` : '';
		if (s.kind === 'stash') return stashRow(s, leg, k);
		const id = s.id, n = s.place;
		isle++;
		const has = marks.get(id);
		const over = held > 0 && isle >= afford;
		// The row is the stop's step: a tap takes the player -- and the
		// camera, when it follows -- to it, as the chips along the foot do.
		return `<div class="map-stop-row${over ? ' over' : ''}${k === stepIdx ? ' on' : ''}" data-act="map-step" data-i="${k}" data-step-row role="button" tabindex="0" title="Step to ${esc(n.at)}">
			<span class="map-stop-n">${s.n}</span>
			<span class="map-row-main">
				<span class="map-row-name"><span class="map-row-name-t">${esc(n.at)}</span>${leg}</span>
				<span class="map-row-sub">${esc(n.name)}${runTrades[id]
					? ''
					: has ? ' · ' + esc([...has.items.keys()].join(', ')) : ' · nothing on your list here'}</span>
				${runTrades[id] ? runLine(runTrades[id]) : cargoLine(id, has)}${holdAfter(ledger.stops[isle], me.hold)}${over ? `<span class="map-row-sub warn">past what your Parley covers</span>` : ''}
			</span>
			<span class="map-row-right">${runTrades[id] ? img(runTrades[id].item, 'map-icon') : has ? iconStrip([...has.items.keys()]) : ''}</span>
			<button class="map-x" data-act="map-stop" data-npc="${id}"
				aria-label="Remove ${esc(n.at)} from the route">×</button>
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
				<div class="summary-sub">${F(me.hold.limit)} as fitted${me.hold.crew ? ` less ${F(me.hold.crew)} of crew` : ''} · ${Math.floor(me.hold.free / GOODS[5].weight)} of Lv4–5 · ${Math.floor(me.hold.free / GOODS[6].weight)} of Lv6–7 a run · sails slower to ${F(me.hold.max)}</div>${rations}</div>`;
	const total = pathLength(world);
	const lastStop = npcById.get(stops[stops.length - 1]);
	const wharf = lastStop && !returnHome ? nearestWharf(lastStop.x, lastStop.y, 'wharf') : null;
	const wharfLine = wharf ? `<div class="summary-sub">nearest wharf to the last stop: ${esc(wharf.name)}, ${esc(fmtDistance(wharf.d * 0.25))}</div>` : '';
	const distance = world.length > 1 ? `<div><div class="summary-k">Distance</div><div class="summary-v">${esc(fmtDistance(total))}</div>
				<div class="summary-sub">≈ ${esc(timeOf(total))} at ${speed.total}% · 100% ≈ ${cal} m/s ${measured ? '±10%' : '±20%'} · <button class="linky" data-act="map-sail-cal">timed a leg?</button></div>${wharfLine}</div>` : '';
	const cargo = cargoTile({ weight: me.hold.free });
	const mid = world.length > 1 ? sailRange(total, speed.total, cal, measured).reduce((a, b) => a + b) / 2 : 0;
	const worth = worthTile(ledger, mid);
	const carry = carryBlock(ledger);
	const sailingAs = stops.length ? `<p class="map-hint map-as">Sailing as <b>${esc(me.name)}</b> <button class="linky" data-act="map-setup-pick" title="Sail a saved setup instead — the times follow its speed">switch setup ▾</button> · ${speed.total}% · ${F(me.hold.free)} LT free${me.crew.seated ? ` · ${me.crew.seated} aboard` : ''} · <button class="linky" data-act="view" data-id="crew">change</button></p>` : '';
	const stats = stops.length ? `<div class="map-stats">
			<div><div class="summary-k">Stops</div><div class="summary-v">${stops.length}</div>
				${stashLive() ? `<div class="summary-sub">islands · and ${runStash.length} wharf call${runStash.length === 1 ? '' : 's'} to lighten the hold</div>` : ''}</div>
			${distance}
			${hold}
			<div><div class="summary-k"><span class="gterm" role="button" tabindex="0" data-guide="parley">Parley</span></div><div class="summary-v">${F(need)}</div>
				<div class="summary-sub">${cover}</div><div class="chips">${tradesBtn('one')}${tradesBtn('all')}</div></div>
			${worth}
			${cargo}
		</div>${carry}
		${overBudget ? `<button class="ghost-btn wide" data-act="map-route-trim" title="Drop the stops past what your Parley covers">Trim to the ${afford} stop${afford === 1 ? '' : 's'} Parley covers</button>` : ''}
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-reverse">⇆ Reverse</button>
			<button class="ghost-btn" data-act="map-route-save" title="Keep this route by name, to come back to">Save…</button>
			<button class="ghost-btn danger" data-act="map-route-clear">Clear</button>
		</div>
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-link" title="A link that opens this route on this chart">Copy link</button>
			<button class="ghost-btn" data-act="map-route-export" title="Save this route as a small JSON file to share or bring back later">Export</button>
			<button class="ghost-btn" data-act="map-route-import" title="Load a route saved from here, or the game's own gameVariable.xml">Import</button>
		</div>
		<button class="ghost-btn wide" data-act="map-route-game" title="Write these stops into the game's world map as favourites">⚑ Put it on the game's map</button>` : `<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-import" title="Load a route saved from here">Import a route</button>
			<button class="ghost-btn" data-act="map-game-in" title="Read the favourites, camera slots and loops out of gameVariable.xml">From the game's map</button>
		</div>`;
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
 *  most any of its offers allows, the rung's cap where the codex
 *  states none. */
function triesAt(id, marks) {
	const mm = marks.get(id);
	const goods = goodsOf(id).filter(g => !mm || !mm.items.size || mm.items.has(g.item));
	return Math.max(0, ...goods.map(g => triesFor(g.item, Number(g.tries) || 0))) || 2;
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
/** What a Barter-tab run calls at a stop for, on its row. */
function runLine(t) {
	return `<span class="map-row-sub ok">${esc(t.giveText)}× ${esc(t.give)} → ${esc(t.recvText)}× ${esc(t.item)}${t.times > 1 ? `, ${t.times} times` : ''}</span>`;
}

/** A count that may be a fraction of a good, kept to one place. */
const n1 = v => F(Math.round(v * 10) / 10);

/** A wharf call on the route list: what is left in storage there, and
 *  what the [Level 7]s aboard fetch, with none of a barterer's
 *  furniture -- there is nothing to trade at a wharf. */
function stashRow(s, leg, k = -1) {
	const c = s.place;
	const drops = c.drops.map(d => `<span class="map-drop">${img(d.item, 'map-icon')}<b>${n1(d.n)}×</b>${esc(d.item)}</span>`).join('');
	const questsHere = (c.quests || []).length ? `<span class="map-quests">${c.quests.map(q => `<span class="map-quest">📜 ${esc(q)}</span>`).join('')}</span>` : '';
	const questOnly = questsHere && !c.drops.length && !c.sale;
	return `<div class="map-stop-row stash${questOnly ? ' quest' : ''}${k === stepIdx ? ' on' : ''}"${k >= 0 ? ` data-act="map-step" data-i="${k}" data-step-row role="button" tabindex="0" title="Step to ${esc(c.at)}"` : ''}>
		<span class="map-stop-n stash" title="${questOnly ? 'A stop put in for a quest' : 'A pause at a wharf'}">${questOnly ? '📜' : '⚓'}</span>
		<span class="map-row-main">
			<span class="map-row-name"><span class="map-row-name-t">${esc(c.name)}</span>${leg}</span>
			<span class="map-row-sub">stop ${s.n} · ${esc(c.at)}${questOnly ? ' · a quest handed in here' : ` wharf${c.drops.length ? ' · the hold is lightened here' : ' · the hold is sold down here'}`}</span>
			${drops ? `<span class="map-drops">${drops}</span>` : ''}
			${c.sale ? `<span class="map-row-sub ok">sells ${n1(c.sale)} [Level 7]${c.silver ? ` for ${FC(c.silver)}` : ''}</span>` : ''}
			${questsHere}
		</span>
	</div>`;
}

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
 * the loop's ledger: what it hands over, what it brings in, its worth
 * ------------------------------------------------------------------ */

/**
 * The exchanges a stop is sailed for: for each thing on the list the
 * island deals, the offer that pays best per good handed over --
 * quantities as averages of the game's ranges, one press each.
 */
/** A run's trades as they travel: rows of [npc, give, giveText, item,
 *  recvText, recv, giveN, times], kept only where they name a barterer
 *  and a good, keyed by the barterer. */
function readTrades(rows) {
	const out = {};
	for (const r of Array.isArray(rows) ? rows : []) {
		if (!Array.isArray(r) || !npcById.has(Number(r[0])) || typeof r[1] !== 'string' || typeof r[3] !== 'string') continue;
		out[Number(r[0])] = { give: r[1], giveText: String(r[2] ?? ''), item: r[3], recvText: String(r[4] ?? ''), recv: Number(r[5]) || 1, giveN: Number(r[6]) || 1, times: Math.max(1, Number(r[7]) || 1) };
	}
	return out;
}

/**
 * A run's wharf calls as they travel: rows of [after, name, at, x, y,
 * drops, sale, silver], where `after` is how many islands are sailed
 * before the call. A call is a pause, not a barter -- the hold is
 * lightened into storage and the [Level 7]s are sold -- so it carries
 * no npc and lives beside the stops rather than among them.
 */
function readStash(rows) {
	const out = [];
	for (const r of Array.isArray(rows) ? rows : []) {
		if (!Array.isArray(r)) continue;
		const [i, name, at, x, y, drops, sale, silver, quests] = r;
		if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
		out.push({
			// The quests handed in at this call, as the Barter tab laid
			// them: a call put in for a quest carries them and nothing else.
			quests: (Array.isArray(quests) ? quests : []).filter(q => typeof q === 'string' && q).map(q => q.slice(0, 80)).slice(0, 12),
			i: Math.max(0, Math.floor(Number(i)) || 0),
			name: String(name || 'Wharf').slice(0, 40),
			at: String(at || '').slice(0, 40),
			x: Number(x), y: Number(y),
			drops: (Array.isArray(drops) ? drops : [])
				.filter(d => Array.isArray(d) && typeof d[0] === 'string' && Number(d[1]) > 0)
				.map(d => ({ item: d[0], n: Number(d[1]) })).slice(0, 12),
			sale: Math.max(0, Number(sale) || 0),
			silver: Math.max(0, Number(silver) || 0)
		});
	}
	return out.sort((a, b) => a.i - b.i).slice(0, 16);
}

/** The wharf calls as readStash takes them back: what a link, a saved
 *  route and the browser's own copy all carry. */
function stashRows() {
	return runStash.map(c => [c.i, c.name, c.at, c.x, c.y, c.drops.map(d => [d.item, d.n]), c.sale, c.silver, c.quests || []]);
}

/** Whether the run's wharf calls belong to the route as it stands.
 *  They are the Barter tab's reading of one plotted run: edit the
 *  stops by hand and they are dropped rather than left pointing at a
 *  route that no longer passes them. */
function stashLive() {
	return runStash.length > 0 && stopsLive();
}

/**
 * The run in sailing order: the islands plotted, with the wharf calls
 * threaded in where they fall, each carrying the number it wears on
 * the chart. With no calls this is the list of stops and the numbers
 * are the stop numbers, exactly as before -- and with them, the chart
 * counts the way the Barter tab's timeline does, storage pauses
 * included.
 */
function routeSeq(marks) {
	const ids = routeIds(marks);
	const calls = stashLive() ? runStash : [];
	const out = [];
	let c = 0;
	for (let k = 0; k <= ids.length; k++) {
		while (c < calls.length && calls[c].i <= k) { out.push({ kind: 'stash', k: c, place: calls[c] }); c++; }
		if (k < ids.length) out.push({ kind: 'npc', id: ids[k], place: npcById.get(ids[k]) });
	}
	// A call pinned past the end of a shortened route still gets sailed
	// to, at the end, rather than quietly vanishing.
	while (c < calls.length) { out.push({ kind: 'stash', k: c, place: calls[c] }); c++; }
	return out.filter(s => s.place).map((s, n) => ({ ...s, n: n + 1 }));
}

function stopTrades(id, marks) {
	const has = marks.get(id);
	if (!has || !has.items.size) return [];
	const best = new Map();
	for (const g of goodsOf(id)) {
		if (!has.items.has(g.item) || !g.give) continue;
		const recv = amount(g.recvQty), giveN = amount(g.giveQty);
		if (!(recv > 0) || !(giveN > 0)) continue;
		const rate = recv / giveN;
		if (!best.has(g.item) || rate > best.get(g.item).rate) best.set(g.item, { item: g.item, give: g.give, recv, giveN, rate });
	}
	return [...best.values()];
}

/** The hold after this stop's exchanges, on a stop's row. */
function holdAfter(entry, hold) {
	if (!entry || !entry.trades || !entry.change) return '';
	const over = entry.after > hold.free;
	const dead = entry.after > hold.max;
	return `<span class="map-row-sub${dead ? ' warn' : over ? ' amber' : ''}" title="Goods only: what this stop takes aboard and hands over, on top of what was there">hold after: ${F(Math.max(0, entry.after))} LT${dead ? ' — more than the hull will move under' : over ? ' — overweight, slower' : ''}</span>`;
}

/**
 * What the loop is worth: goods received at what a barterer pays for
 * them, materials at what the market pays where it has said, less the
 * goods handed over -- and, when the legs are timed, an hour's worth.
 */
function worthTile(l, seconds) {
	if (!stops.length || (!l.goodsIn && !l.goodsOut && !l.mats)) return '';
	const F0 = n => FC(Math.round(Math.abs(n)));
	const n = v => F(Math.round(v));
	const priced = l.inValue + l.matValue;
	const bits = [];
	if (l.goodsIn) bits.push(`${n(l.goodsIn)} good${l.goodsIn === 1 ? '' : 's'} aboard, worth ${F0(l.inValue)}`);
	if (l.mats) {
		const some = l.unpriced && l.unpriced < l.mats;
		bits.push(`${n(l.mats)} material${l.mats === 1 ? '' : 's'}${l.matValue ? ` at the market's ${F0(l.matValue)}` : ''}${some ? `, ${n(l.unpriced)} of them unpriced` : l.unpriced ? ', none the market prices' : ''}`);
	}
	if (l.goodsOut) bits.push(`${n(l.goodsOut)} good${l.goodsOut === 1 ? '' : 's'} handed over, worth ${F0(l.outValue)} had they been sold`);
	// A headline only when something coming aboard has a price: a loop
	// for stones the market never sells is not "worth minus the goods".
	let head, sub = '';
	if (priced > 0) {
		head = `<div class="summary-v${l.net < 0 ? ' amber' : ''}">${l.net < 0 ? '−' : ''}${F0(l.net)}</div>`;
		const rate = perHour(l.net, seconds);
		if (rate !== null && l.net > 0) sub = `<div class="summary-sub">≈ <b>${F0(rate)}</b> an hour under way, at the middle of the time range</div>`;
	} else {
		head = `<div class="summary-v">${n(l.mats)} material${l.mats === 1 ? '' : 's'}</div>`;
	}
	return `<div><div class="summary-k">Worth</div>${head}
		<div class="summary-sub">${esc(bits.join(' · '))}</div>${sub}</div>`;
}

/**
 * What to carry out of port: every good the loop hands over, how many
 * are aboard already, and where the rest are dealt -- the island that
 * hands the good over and what it takes for it, from the same table.
 */
function carryBlock(l) {
	if (!l.carry.size) return '';
	const rows = [...l.carry].sort((a, b) => (levelOf(b[0]) || 0) - (levelOf(a[0]) || 0) || a[0].localeCompare(b[0])).map(([give, n]) => {
		const need = Math.ceil(n);
		const have = store.getStock(give);
		const short = Math.max(0, need - have);
		const lower = bestExchange(give, barterData);
		const from = lower ? `${lower.npc} hands it over for ${lower.give}` : 'bought on land';
		return `<div class="map-carry-row${short ? '' : ' ok'}">
			${img(give, 'map-icon')}
			<span class="map-row-main"><span class="map-row-name">${F(need)}× ${esc(give)}</span>
				<span class="map-row-sub">${have ? `${F(have)} aboard` : 'none aboard'}${short ? ` · ${F(short)} to get — ${esc(from)}` : ' · enough'}</span></span>
		</div>`;
	}).join('');
	const kinds = l.carry.size;
	const short = [...l.carry].filter(([give, q]) => store.getStock(give) < Math.ceil(q)).length;
	return `<details class="map-carry"${kinds <= 6 ? ' open' : ''}><summary class="summary-k">Carry out of port <span class="map-courses-credit">${kinds} kind${kinds === 1 ? '' : 's'} the loop hands over${short ? `, ${short} not aboard` : ', all aboard'}</span></summary>${rows}</details>`;
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
	const entry = { name, stops: [...ids], startPort, returnHome, pick: stopsPick || '', trades: Object.fromEntries(ids.filter(id => runTrades[id]).map(id => [id, runTrades[id]])), calls: stashRows(), at: new Date().toISOString().slice(0, 10) };
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
	runTrades = readTrades(Object.entries(r.trades || {}).map(([id, t]) => [Number(id), t.give, t.giveText, t.item, t.recvText, t.recv, t.giveN, t.times]));
	runStash = readStash(r.calls || []);
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
	runStash = [];
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
	const trades = stops.filter(id => runTrades[id]).map(id => { const t = runTrades[id]; return [id, t.give, t.giveText, t.item, t.recvText, t.recv, t.giveN, t.times]; });
	if (trades.length) parts.push(`x=${encodeURIComponent(JSON.stringify(trades))}`);
	if (runStash.length) parts.push(`w=${encodeURIComponent(JSON.stringify(stashRows()))}`);
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
	let trades;
	try { trades = q.x ? JSON.parse(decodeURIComponent(q.x)) : []; } catch { trades = []; }
	runTrades = readTrades(trades);
	let calls;
	try { calls = q.w ? JSON.parse(decodeURIComponent(q.w)) : []; } catch { calls = []; }
	runStash = readStash(calls);
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

const TRACE_STOPS = 40, TRACE_STROKES = 24, TRACE_WORDS = 24, TRACE_AREAS = 12, AREA_CORNERS = 60;

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
	// An area is a closed shape: three corners at the least, sixty at
	// the most, shaded in its ink.
	const areas = (Array.isArray(raw.areas) ? raw.areas : []).slice(0, TRACE_AREAS).map(a => {
		const src = a && Array.isArray(a.pts) ? a.pts : null;
		if (!src) return null;
		const flat = [];
		for (let i = 0; i + 1 < src.length && flat.length < AREA_CORNERS * 2; i += 2) {
			const x = num(src[i], 0, 200000), y = num(src[i + 1], 0, 200000);
			if (x !== null && y !== null) flat.push(x, y);
		}
		if (flat.length < 6) return null;
		return { pts: flat, colour: inkOf(a.colour), seq: stamp(a.seq) };
	}).filter(Boolean);
	const texts = (Array.isArray(raw.texts) ? raw.texts : []).slice(0, TRACE_WORDS).map(w => {
		const x = num(w && w.x, 0, 200000), y = num(w && w.y, 0, 200000);
		if (x === null || y === null) return null;
		const words = String(w.text || '').slice(0, 60).trim();
		if (!words) return null;
		return { x, y, text: words, colour: inkOf(w.colour), size: sizeOf(w.size), plate: w.plate !== false, seq: stamp(w.seq) };
	}).filter(Boolean);
	if (!points.length && !strokes.length && !texts.length && !areas.length && !raw.name) return null;
	return {
		name: String(raw.name || '').slice(0, 40),
		notes: String(raw.notes || '').slice(0, 400),
		points, strokes, texts, areas,
		seq,
		shown: raw.shown === true,
		lane: raw.lane === true,
		at: Number(raw.at) || Date.now()
	};
}

const blankTrace = () => ({ name: '', notes: '', points: [], strokes: [], texts: [], areas: [], seq: 0, at: Date.now() });

/** The trace being drawn on, made if there is none, and always with
 *  every list a trace has -- one kept from an older version may not. */
function liveTrace() {
	if (!trace) trace = blankTrace();
	if (!Array.isArray(trace.points)) trace.points = [];
	if (!Array.isArray(trace.strokes)) trace.strokes = [];
	if (!Array.isArray(trace.texts)) trace.texts = [];
	if (!Array.isArray(trace.areas)) trace.areas = [];
	return trace;
}

/** Whether a trace holds anything at all. */
const traceHas = t => Boolean(t && (t.points.length || t.strokes.length || (t.texts || []).length || (t.areas || []).length));

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
		...(t.texts || []).map((it, i) => ({ it, i, list: t.texts, kind: 'word' })),
		...(t.areas || []).map((it, i) => ({ it, i, list: t.areas, kind: 'area' }))
	].sort((a, b) => (Number(a.it.seq) || 0) - (Number(b.it.seq) || 0));
}

/**
 * The water a traced line actually follows. Two stops with an island
 * between them are not a straight leg: the same routing the barter
 * route uses bends it round, over the sea mask built from the chart's
 * own tiles. While a stop is being carried the straight line is drawn
 * instead -- a search per frame of a drag is a search too many, and
 * the water comes back the moment it is set down.
 */
function traceLine(t) {
	if (!t || t.points.length < 2) return t ? t.points : [];
	return hugWater && !markDrag ? seaBent(t.points) : t.points;
}

/** The traced stops as the route tab counts them: length and time --
 *  along the water when the legs are bent round the land. */
function traceLength() {
	if (!trace || trace.points.length < 2) return 0;
	return pathLength(traceLine(trace));
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
 *  an eye that lays it over the chart without opening it.
 *
 *  The panel is 300 pixels of a chart nobody wants covered, so it shows
 *  the newest few and whatever is on the water; twenty of them are
 *  browsed in the library, which has the room for a search and a sort.
 */
function traceShelf() {
	if (!traces.length) {
		return `<div class="map-courses-head">Kept traces</div>
			<p class="map-hint">None kept yet. Draw a route, name it, and press <b>Keep</b> — up to ${TRACES_MAX} live on this browser, and any of them can be laid over the chart with its eye.</p>`;
	}
	const shown = traces.filter(r => r.shown).length;
	const SHELF = 4;
	const near = traces.filter((r, i) => r.shown || i < SHELF);
	const rest = traces.length - near.length;
	const cards = near.map(r => traceCard(r, traces.indexOf(r))).join('');
	return `<div class="map-courses-head">Kept traces <span class="map-courses-credit">${traces.length} of ${TRACES_MAX}${shown ? ` · ${shown} on the chart` : ''}</span></div>
		<div class="trace-shelf">${cards}</div>
		<div class="map-side-btns">
			<button class="ghost-btn wide" data-act="trace-library">${rest > 0 ? `Browse all ${traces.length}…` : 'Browse the traces…'}</button>
			${shown ? `<button class="ghost-btn" data-act="trace-eye-none">Clear the chart</button>` : ''}
		</div>`;
}

/** One trace as a card, on the shelf or in the library. */
function traceCard(r, i) {
	{
		const bits = [
			`${r.points.length} stop${r.points.length === 1 ? '' : 's'}`,
			r.strokes.length ? `${r.strokes.length} stroke${r.strokes.length === 1 ? '' : 's'}` : '',
			(r.texts || []).length ? `${r.texts.length} word${r.texts.length === 1 ? '' : 's'}` : ''
		].filter(Boolean).join(' · ');
		const open = trace && trace.name && trace.name === r.name;
		return `<div class="trace-card${r.shown ? ' shown' : ''}${open ? ' open' : ''}" data-trace="${esc(r.name)}">
			<button class="trace-eye" data-act="trace-eye" data-i="${i}" aria-pressed="${!!r.shown}"
				title="${r.shown ? 'Take it off the chart' : 'Lay it over the chart'}" aria-label="${r.shown ? 'Hide' : 'Show'} ${esc(r.name || 'this trace')} on the chart">${r.shown ? '◉' : '○'}</button>
			<span class="trace-thumb-box">${traceThumb(r)}</span>
			<span class="trace-card-main">
				<span class="trace-card-name">${esc(r.name || 'untitled')}${open ? '<span class="trace-card-tag">open</span>' : ''}${r.lane ? '<span class="trace-card-tag lane">lane</span>' : ''}</span>
				<span class="trace-card-sub">${bits} · kept ${keptWhen(r.at)}</span>
				${r.notes ? `<span class="trace-card-note">${esc(r.notes)}</span>` : ''}
			</span>
			<span class="trace-card-btns">
				<button class="ghost-btn tiny" data-act="trace-load" data-i="${i}" title="Open it to draw on">Open</button>
				<button class="ghost-btn tiny${r.lane ? ' on' : ''}" data-act="trace-lane" data-i="${i}" aria-pressed="${!!r.lane}" title="${r.lane ? 'A lane the game sails: every route near it is drawn along it. Press to make it a plain trace again' : 'Mark it as a lane the game sails, so every route near it is drawn along it and timed as the game would sail it'}" aria-label="${r.lane ? 'Stop treating' : 'Treat'} ${esc(r.name || 'this trace')} as a lane the game sails">⚓</button>
				<button class="ghost-btn tiny" data-act="trace-rename" data-i="${i}" title="Rename it" aria-label="Rename ${esc(r.name || 'this trace')}">✎</button>
				<button class="ghost-btn tiny" data-act="trace-share" data-i="${i}" title="Copy a link to it" aria-label="Copy a link to ${esc(r.name || 'this trace')}">↗</button>
				<button class="map-x" data-act="trace-del" data-i="${i}" aria-label="Forget ${esc(r.name || 'this trace')}">×</button>
			</span>
		</div>`;
	}
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
	const has = traceHas(t) || Boolean(areaDraft);
	const areaRows = (t.areas || []).map((a, i) => `<div class="map-trace-stop">
		<span class="map-trace-n area" style="border-color:${a.colour};color:${a.colour};background:${a.colour}22">▰</span>
		<span class="map-row-sub">an area of ${a.pts.length / 2} corners</span>
		<button class="map-x" data-act="trace-area-del" data-i="${i}" aria-label="Remove area ${i + 1}">×</button>
	</div>`).join('');
	const saved = traceShelf();
	return `<div class="map-courses">
		<div class="map-courses-head">Tools <span class="map-courses-credit">the islands sit still while you draw</span></div>
		${tool('point', 'Add stops', 'click the sea for a numbered stop; drag one to move it')}
		${tool('pen', 'Draw', 'drag to draw a line; it stays with the chart')}
		${tool('text', 'Write', 'click the sea and type; drag a word to move it, click it to retype')}
		${tool('area', 'Shade an area', 'click its corners; click the first again to close it')}
		${areaDraft ? `<div class="map-side-btns map-area-draft"><span class="map-hint">${areaDraft.length / 2} corner${areaDraft.length === 2 ? '' : 's'} so far</span>
			<button class="ghost-btn" data-act="trace-area-close" ${areaDraft.length >= 6 ? '' : 'disabled'}>Close the shape</button>
			<button class="ghost-btn danger" data-act="trace-area-drop">Drop it</button></div>` : ''}
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
			<button class="ghost-btn${hugWater ? ' on' : ''}" data-act="trace-hug" aria-pressed="${hugWater}" title="Bend each leg round the land between its stops, the way the barter route is drawn">${hugWater ? '⛵ Round the land' : '↗ Straight legs'}</button>
		</div>
	</div>
	<div class="map-courses">
		<input class="field" type="text" maxlength="40" placeholder="Name this route" value="${esc(t.name)}" data-act="trace-name" aria-label="Name of the traced route">
		<textarea class="field map-trace-notes" maxlength="400" rows="2" placeholder="Notes — what it is for, when to sail it, what to watch" data-act="trace-notes" aria-label="Notes">${esc(t.notes)}</textarea>
		${t.points.length ? `<div class="map-trace-stops">${stops}</div>` : '<p class="map-hint">No stops yet. Pick <b>Add stops</b> and click the sea, <b>Draw</b> and drag to sketch, or <b>Write</b> and type on the water.</p>'}
		${words.length ? `<div class="map-courses-head">Words on the chart</div><div class="map-trace-stops">${wordRows}</div>` : ''}
		${areaRows ? `<div class="map-courses-head">Areas shaded</div><div class="map-trace-stops">${areaRows}</div>` : ''}
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
		const d = routePath(traceLine(t).map(P), size, hugWater ? 0 : 0.16);
		const c = t.points[0].colour || LINE_INK;
		html += `<svg class="map-route map-trace-line"><path class="map-trace-glow" style="stroke:${c}" d="${d}"></path><path class="map-trace-path" style="stroke:${c}" d="${d}"></path></svg>`;
	}
	// Areas first, under everything: a shaded water with its edge in the
	// same ink, and the one being cornered as a dashed open line.
	for (const a of (t.areas || [])) {
		let d = '';
		for (let i = 0; i + 1 < a.pts.length; i += 2) {
			const at = project(mapState, size, a.pts[i], a.pts[i + 1]);
			d += `${d ? ' L' : 'M'}${at.left.toFixed(1)} ${at.top.toFixed(1)}`;
		}
		if (d) html += `<svg class="map-route map-trace-line"><path class="map-trace-area" style="fill:${inkOf(a.colour)};stroke:${inkOf(a.colour)}" d="${d} Z"></path></svg>`;
	}
	if (live && areaDraft) {
		let d = '';
		const dots = [];
		for (let i = 0; i + 1 < areaDraft.length; i += 2) {
			const at = project(mapState, size, areaDraft[i], areaDraft[i + 1]);
			d += `${d ? ' L' : 'M'}${at.left.toFixed(1)} ${at.top.toFixed(1)}`;
			dots.push(`<circle class="map-trace-corner${i ? '' : ' first'}" cx="${at.left.toFixed(1)}" cy="${at.top.toFixed(1)}" r="${i ? 3 : 6}" style="stroke:${inkColour};fill:${i ? inkColour : 'transparent'}"></circle>`);
		}
		html += `<svg class="map-route map-trace-line"><path class="map-trace-draft" style="stroke:${inkColour}" d="${d}"></path>${dots.join('')}</svg>`;
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
	const empty = !traceHas(t) && !penStroke && !areaDraft;
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

/** The nearest water to a point clicked, when it is close enough to
 *  have been meant -- a stop is a place a hull can float, so one put on
 *  a headland steps off it rather than sitting in a field. */
function onWater(p) {
	const wet = nearestWater(p.x, p.y);
	if (!wet) return null;
	return { x: Math.round(wet.x), y: Math.round(wet.y) };
}

/**
 * Where a screen point falls in the map box's own space. The two are
 * the same offset until the chart is turned on its side for a phone
 * held upright (see enterFull): then the box's x runs down the screen
 * and its y runs leftward, and every pointer has to be turned back.
 */
function inBox(host, clientX, clientY) {
	const r = host.getBoundingClientRect();
	if (!fullTurned) return { x: clientX - r.left, y: clientY - r.top };
	return { x: clientY - r.top, y: r.right - clientX };
}

/** A movement on the screen, as a movement in the box. */
function boxDelta(dx, dy) {
	return fullTurned ? { x: dy, y: -dx } : { x: dx, y: dy };
}

function atSea(host, clientX, clientY) {
	const at = inBox(host, clientX, clientY);
	const p = unproject(hostSize(host), at.x, at.y);
	return { x: Math.round(p.x), y: Math.round(p.y) };
}

function traceAdd(host, clientX, clientY) {
	const t = liveTrace();
	if (t.points.length >= TRACE_STOPS) return toast(`${TRACE_STOPS} stops is the most a trace holds`);
	const at = atSea(host, clientX, clientY);
	const wet = onWater(at);
	if (!wet) return toast('A stop belongs on the water');
	t.points.push({ ...wet, colour: inkColour, seq: bumpSeq() });
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
	traceTool = traceTool === id ? null : (['pen', 'point', 'text', 'area'].includes(id) ? id : null);
	if (traceTool && measuring) toggleMeasure();
	// A shape half-cornered dies with the tool that was cornering it.
	if (traceTool !== 'area' && areaDraft) { areaDraft = null; paintMap(); }
	markTraceHost();
	if (traceTool === 'point') toast('Click the sea to add a stop');
	if (traceTool === 'pen') toast('Drag on the sea to draw');
	if (traceTool === 'text') toast('Click the sea, then type');
	if (traceTool === 'area') toast('Click the corners of the water to shade; click the first one again to close it');
	refreshSide();
}

/** One corner more on the area being shaded -- or, on the first
 *  corner again, the shape closed. */
function areaAdd(host, clientX, clientY) {
	const p = atSea(host, clientX, clientY);
	if (areaDraft && areaDraft.length >= 6) {
		const first = project(mapState, hostSize(host), areaDraft[0], areaDraft[1]);
		const at = inBox(host, clientX, clientY);
		if (Math.hypot(at.x - first.left, at.y - first.top) < 14) return areaClose();
	}
	if (!areaDraft) areaDraft = [];
	if (areaDraft.length >= AREA_CORNERS * 2) return toast(`${AREA_CORNERS} corners is the most an area holds`);
	areaDraft.push(p.x, p.y);
	refreshSide();
	paintMap();
}

function areaClose() {
	if (!areaDraft || areaDraft.length < 6) return;
	const t = liveTrace();
	if (t.areas.length >= TRACE_AREAS) toast(`${TRACE_AREAS} areas is the most a trace holds`);
	else t.areas.push({ pts: areaDraft, colour: inkColour, seq: bumpSeq() });
	areaDraft = null;
	persist();
	refreshSide();
	paintMap();
}

// The box's own size, which a turned box keeps -- its bounding rect is
// the screen's shape, not its own.
const hostSize = host => ({ w: host.clientWidth, h: host.clientHeight });

/** The map box wears what is going on: which tool has the pointer, and
 *  whether the chart's own markers are listening at all. */
function markTraceHost() {
	const host = document.querySelector('[data-map]');
	if (!host) return;
	host.classList.toggle('tracing', Boolean(traceTool));
	for (const id of ['pen', 'point', 'text', 'area']) host.classList.toggle(`tool-${id}`, traceTool === id);
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
		case 'trace-area-close': areaClose(); return true;
		case 'trace-area-drop': areaDraft = null; break;
		case 'trace-area-del': if (trace && trace.areas && trace.areas[i]) trace.areas.splice(i, 1); break;
		case 'trace-undo': {
			// A corner being placed goes back before anything kept does.
			if (areaDraft) {
				areaDraft = areaDraft.length > 2 ? areaDraft.slice(0, -2) : null;
				break;
			}
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
		case 'trace-clear': trace = null; traceTool = null; editing = 0; areaDraft = null; break;
		case 'trace-point-del': if (trace && trace.points[i]) trace.points.splice(i, 1); break;
		case 'trace-save': {
			const t = trace;
			if (!traceHas(t)) return true;
			const name = t.name.trim() || `Trace ${traces.length + 1}`;
			t.name = name;
			// A copy, not the live object: a kept trace has to stand still
			// while the next stroke goes on the one being drawn.
			traces = [{ ...JSON.parse(JSON.stringify(t)), at: Date.now() }, ...traces.filter(r => r.name !== name)].slice(0, TRACES_MAX);
			toast(`Kept “${name}”`);
			break;
		}
		case 'trace-hug': hugWater = !hugWater; break;
		case 'trace-library': openTraceLibrary(); return true;
		case 'trace-lib-sort': libSort = ['recent', 'name', 'size'].includes(el.dataset.id) ? el.dataset.id : 'recent'; refreshLibrary(); return true;
		case 'trace-lib-only': libOnly = el.dataset.id === 'shown' ? 'shown' : 'all'; refreshLibrary(); return true;
		case 'trace-eye': if (traces[i]) { traces[i].shown = !traces[i].shown; if (traces[i].shown) tracesOn = true; } break;
		case 'trace-lane':
			if (traces[i]) {
				if (!traces[i].lane && traces[i].points.length < 2) { toast('A lane needs at least two stops to run between'); return true; }
				traces[i].lane = !traces[i].lane;
				toast(traces[i].lane ? `Routes near “${traces[i].name}” now follow it` : `“${traces[i].name}” is a plain trace again`);
			}
			break;
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
		case 'trace-load':
			if (traces[i]) { trace = cleanTrace(traces[i]); editing = 0; pendingFit = { points: trace.points.length ? trace.points : traceAnchors(trace) }; }
			// Opened from the library, the chart is what you wanted to see.
			if (libOpen) { libOpen = false; closeDialog(); }
			break;
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
	if (libOpen) refreshLibrary();
	paintMap();
	return true;
}

/* ------------------------------------------------------------------ *
 * the traces library
 *
 * Twenty traces do not belong in a 300-pixel column beside the chart.
 * The library is the width of a dialog: a search, a sort, a filter and
 * the cards in a grid big enough to tell one drawing from another at a
 * glance. The cards are the shelf's own, so there is one set of
 * buttons to learn and one to maintain.
 * ------------------------------------------------------------------ */

/** The kept traces the library is showing, in the order it shows them. */
function libraryList() {
	const q = libQ.trim().toLowerCase();
	let list = traces.map((r, i) => ({ r, i }));
	if (libOnly === 'shown') list = list.filter(e => e.r.shown);
	if (q) list = list.filter(e => `${e.r.name} ${e.r.notes} ${(e.r.texts || []).map(w => w.text).join(' ')}`.toLowerCase().includes(q));
	const size = r => r.points.length + r.strokes.length + (r.texts || []).length;
	if (libSort === 'name') list.sort((a, b) => a.r.name.localeCompare(b.r.name));
	else if (libSort === 'size') list.sort((a, b) => size(b.r) - size(a.r));
	else list.sort((a, b) => (b.r.at || 0) - (a.r.at || 0));
	return list;
}

function libraryHTML() {
	const list = libraryList();
	const shown = traces.filter(r => r.shown).length;
	const chip = (act, id, now, label) => `<button class="chip tiny${now ? ' active' : ''}" data-act="${act}" data-id="${id}" aria-pressed="${now}">${label}</button>`;
	const cards = list.length
		? `<div class="trace-grid">${list.map(e => traceCard(e.r, e.i)).join('')}</div>`
		: `<p class="dialog-copy">Nothing here answers to “${esc(libQ)}”${libOnly === 'shown' ? ', among the ones on the chart' : ''}.</p>`;
	return `<div class="lib-bar">
			<input class="field" type="search" placeholder="Search names, notes, and the words written on them"
				value="${esc(libQ)}" data-lib-search aria-label="Search the traces">
		</div>
		<div class="lib-bar">
			<span class="lib-label">Sort</span>
			${chip('trace-lib-sort', 'recent', libSort === 'recent', 'newest')}
			${chip('trace-lib-sort', 'name', libSort === 'name', 'name')}
			${chip('trace-lib-sort', 'size', libSort === 'size', 'biggest')}
			<span class="lib-label">Show</span>
			${chip('trace-lib-only', 'all', libOnly === 'all', `all ${traces.length}`)}
			${chip('trace-lib-only', 'shown', libOnly === 'shown', `on the chart ${shown}`)}
		</div>
		${cards}`;
}

function refreshLibrary() {
	const box = document.querySelector('[data-trace-lib]');
	if (!box) return;
	const was = box.querySelector('[data-lib-search]');
	const caret = was && document.activeElement === was ? was.selectionStart : null;
	box.innerHTML = libraryHTML();
	if (caret !== null) {
		const now = box.querySelector('[data-lib-search]');
		now.focus();
		now.setSelectionRange(caret, caret);
	}
}

/** Every trace kept on this browser, with room to look at them. */
export function openTraceLibrary() {
	libOpen = true;
	const host = openDialog(`
		<h2>The traces you have kept</h2>
		<p class="dialog-copy">${traces.length} of ${TRACES_MAX} on this browser. Open one to draw on it, or open its eye to lay it over the chart beside whatever else you are drawing. Trace the way the game’s auto-path really sails a passage and press ⚓ to make it a lane: every route drawn near it follows it from then on, and is timed as the game sails it.</p>
		<div data-trace-lib>${libraryHTML()}</div>
		<div class="dialog-actions">
			${traces.some(r => r.shown) ? '<button class="ghost-btn" data-act="trace-eye-none">Clear the chart</button>' : ''}
			<button class="ghost-btn" data-close>Close</button>
		</div>`, { onDismiss: () => { libOpen = false; } });
	// The one dialog in the app that wants the width: a grid of drawings
	// reads three across, and two of them is a list with gaps.
	const boxEl = host.querySelector('.dialog-box');
	if (boxEl) boxEl.classList.add('wide');
	host.addEventListener('input', evt => {
		const el = evt.target.closest('[data-lib-search]');
		if (!el) return;
		libQ = el.value.slice(0, 40);
		refreshLibrary();
	});
	const search = host.querySelector('[data-lib-search]');
	if (search) search.focus();
}

/** Rename a kept trace, in place on the shelf. */
function renameTraceDialog(i) {
	const r = traces[i];
	if (!r) return;
	// Asked for from the library, the library is what you go back to.
	const back = libOpen;
	libOpen = false;
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
		if (back) openTraceLibrary();
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
	return { app: 'bdo-ship-upgrade-tracker', kind: 'trace', version: 2, exported: new Date().toISOString(), name: t.name, notes: t.notes, points: t.points, strokes: t.strokes, texts: t.texts || [], areas: t.areas || [] };
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
 * the whole screen
 * ------------------------------------------------------------------ */

const phone = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const upright = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth;

/**
 * The chart over the whole app, as one modal box with its own way out.
 *
 * On a phone it is the whole screen too, where the browser allows it
 * -- no address bar -- and the screen is asked to turn to landscape,
 * which Chrome and Firefox on Android do once the page is full screen.
 * Safari on an iPhone can be asked neither; there the box is turned
 * on its side by CSS instead, so the sea is still wide, and every
 * pointer is turned back to match (inBox, boxDelta).
 */
export async function enterFull() {
	if (fullOn) return;
	fullOn = true;
	dressFull();
	if (phone() && document.documentElement.requestFullscreen) {
		try {
			await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
		} catch { /* the box over the page is what there is */ }
		if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
			try {
				await window.screen.orientation.lock('landscape');
			} catch { /* not granted, or not a thing here: the CSS turn stands in */ }
		}
	}
	settleTurn();
}

export async function exitFull() {
	if (!fullOn) return;
	fullOn = false;
	fullTurned = false;
	if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
		try { window.screen.orientation.unlock(); } catch { /* nothing was held */ }
	}
	if (document.fullscreenElement && document.exitFullscreen) {
		try { await document.exitFullscreen(); } catch { /* already out */ }
	}
	dressFull();
	paintMap();
}

export function toggleFull() {
	return fullOn ? exitFull() : enterFull();
}

export function mapIsFull() {
	return fullOn;
}

/** Turned on its side when the phone is held upright: a screen the
 *  browser turned for us, or one the person turned, is wide already. */
function settleTurn() {
	fullTurned = fullOn && phone() && upright();
	dressFull();
	paintMap();
}

/** The classes that make it so, on the box and on the page around it. */
function dressFull() {
	const host = document.querySelector('[data-map]');
	if (host) {
		host.classList.toggle('full', fullOn);
		host.classList.toggle('turned', fullTurned);
	}
	document.body.classList.toggle('map-full', fullOn);
	document.body.classList.toggle('map-turned', fullTurned);
	for (const b of document.querySelectorAll('.map-zoom [data-act="map-full"]')) b.setAttribute('aria-pressed', String(fullOn));
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
	const at = inBox(host, clientX, clientY);
	const p = unproject(hostSize(host), at.x, at.y);
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
	const d = pts.length > 1 ? routePath(pts, size, 0) : `M${pts[0].left - 4},${pts[0].top}a4,4 0 1,0 8,0a4,4 0 1,0 -8,0`;
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
	const at = inBox(host, clientX, clientY);
	const p = unproject(hostSize(host), at.x, at.y);
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
	const pts = routeIds(marks).map(id => npcById.get(id).at);
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
				<span class="map-row-name">${esc(n.at)}</span>
				<span class="map-row-sub">${esc(n.name)} · ${esc([...marks.get(n.id).items.keys()].join(', '))}</span>
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
	// A dragged position was clamped against the box it was dragged in;
	// this box may be smaller — a window shrunk, a panel grown — so it
	// is clamped again before it is drawn. 176×110 is the minimap's
	// fixed size in tracker.css.
	if (miniPos) {
		const host = document.querySelector('[data-map]');
		if (host && host.clientWidth) {
			miniPos = {
				x: Math.max(0, Math.min(host.clientWidth - 176, miniPos.x)),
				y: Math.max(0, Math.min(host.clientHeight - 110, miniPos.y))
			};
		}
	}
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
	const at = inBox(evt.currentTarget, evt.clientX, evt.clientY);
	zoomMoving();
	if (zoomAt(mapState, -evt.deltaY * 0.0024, hostSize(evt.currentTarget), at.x, at.y)) schedulePaint();
}

/**
 * A zoom gesture is under way. The level on screen is held -- its
 * tiles carry the magnification, scaled -- and the level the zoom
 * lands on is asked for only once the wheel has been quiet for a
 * moment. A wheel from 3 to 7 fetches 7, not 4, 5 and 6 on the way.
 */
function zoomMoving() {
	if (heldLevel === null) heldLevel = drawnLevel === null ? levelFor(mapState.zoom) : drawnLevel;
	clearTimeout(settleTimer);
	settleTimer = setTimeout(zoomSettled, 160);
}

function zoomSettled() {
	settleTimer = null;
	heldLevel = null;
	schedulePaint();
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

	// In motion, the level already on screen is what is drawn, scaled;
	// at rest, the nearest. A flight also asks for where it is going.
	const level = heldLevel === null ? levelFor(mapState.zoom) : heldLevel;
	const { tiles, pins } = frame(mapState, size, marks, level);
	drawnLevel = level;
	const ahead = flightTo ? tilesFor(flightTo, size, levelFor(flightTo.zoom)).filter(t => !t.ahead) : [];
	// A layer that faults says so in the console and leaves the others
	// to paint; nothing on the chart depends on another layer's luck.
	const guarded = (fn, ...args) => { const t0 = performance.now(); try { fn(...args); } catch (err) { console.warn(`[map] ${fn.name} failed:`, err); } if (window.__paintProf) window.__paintProf[fn.name] = (window.__paintProf[fn.name] || 0) + performance.now() - t0; };

	// The route as it is sailed: the islands with the run's wharf calls
	// among them. The step player walks it, the pins take their numbers
	// from it, and the storage marks are its own entries.
	const seq = routeSeq(marks);
	const key = `${seq.map(s => (s.kind === 'npc' ? s.id : `w${s.k}`)).join('.')}|${startPort}|${returnHome}`;
	if (key !== stepKey) { stepKey = key; stepIdx = 0; }
	const current = seq.length > 1 ? seq[Math.min(stepIdx, seq.length - 1)] : null;
	const currentId = current && current.kind === 'npc' ? current.id : null;
	const nums = new Map(seq.filter(s => s.kind === 'npc').map(s => [s.id, s.n]));

	guarded(paintTiles, layer, tiles, size, { hold: heldLevel !== null, ahead });
	// Ports before pins, and both before the island names: each of these
	// three writes words on the sea, and each one gives way to the ones
	// already written. The wharves name themselves permanently and so go
	// first; the barterers fold a name away rather than print over one
	// (declutterPins); the island names come last and skip anything the
	// other two have already said (paintLabels).
	guarded(paintPorts, layer, size);
	guarded(paintPins, layer, pins, marks, currentId, nums);
	guarded(paintWharves, layer, size);
	guarded(paintStash, layer, size, seq, current);
	guarded(paintLabels, layer, size);
	guarded(paintHunt, layer, size);
	guarded(paintHabitats, layer, size);
	guarded(paintCourse, layer, size);
	guarded(paintRoute, layer, size, marks);
	guarded(paintMeasure, layer, size);
	guarded(paintTrace, layer, size);
	guarded(paintSteps, host, seq);
	guarded(paintTip, host, size, marks);
	guarded(paintMini, host, size);
}

/**
 * The tiles, one box per zoom level. A tile is placed once, at its
 * grid position in its level's own pixel space, and never touched
 * again; what a pan or a zoom moves is the level's box -- one
 * transform a frame instead of a hundred, and one layer the
 * compositor slides rather than a hundred images it re-places. On a
 * wide screen at a close zoom, over water the chart covers on every
 * side (the hekaru's, say -- the ocean stalker's is cut short by the
 * chart's edge), that hundred was most of what a pan frame cost.
 *
 * What is asked for, and when, is the bandwidth of the whole chart:
 *
 * - `tiles` is the level being drawn, nearest the middle first, and
 *   each one not yet in the pool is requested in that order -- the
 *   middle of the screen fills before the corners, and the margin
 *   past the edge is asked for last and at low priority.
 * - `hold` is a zoom in motion. Nothing new is requested: the tiles
 *   already on screen carry the animation, scaled, and the levels a
 *   wheel passes through on its way are never fetched. What is still
 *   arriving for a level no longer drawn is cancelled.
 * - `ahead` is where a flight is going: its tiles are requested at
 *   once, in their own level's box, so they are on screen by the time
 *   the flight lands rather than starting to load then.
 * - A tile that scrolls off stays, up to a couple of hundred, so a
 *   pan back is instant and silent rather than a fade-in from the
 *   cache; a tile that scrolls off before it arrived is cancelled.
 * - While the drawn level is still arriving, the level under it stays
 *   put, rescaled to line up, so a zoom crossfades between
 *   magnifications instead of blinking through open sea; and once
 *   the tiles have been in flight for a third of a second the chart
 *   says so, quietly, with a thread of light along its top edge.
 */
const KEEP_TILES = 192;
function paintTiles(layer, tiles, size, { hold = false, ahead = [] } = {}) {
	const pool = layer._tiles || (layer._tiles = new Map());
	const levels = layer._levels || (layer._levels = new Map());
	const tick = layer._tick = (layer._tick || 0) + 1;
	const levelBox = z => {
		let d = levels.get(z);
		if (!d) {
			d = document.createElement('div');
			d.className = 'map-tiles';
			d.dataset.z = z;
			levels.set(z, d);
			// At the front of the layer, always: everything drawn over the
			// sea shares its z-index with the tiles or beats it, so a level
			// appended after the course line would cover it -- which is
			// what happened on every zoom.
			layer.insertBefore(d, layer.firstChild);
		}
		return d;
	};
	// Where a level's box goes so that its tile (x, y) lands at (left,
	// top) on the screen, drawn at `scale`.
	const place = (d, z, x, y, at) => {
		d.style.transform = `translate3d(${at.left - x * TILE * at.scale}px, ${at.top - y * TILE * at.scale}px, 0) scale(${at.scale})`;
	};
	const request = t => {
		const img = document.createElement('img');
		img.className = 'map-tile';
		img.alt = '';
		img.draggable = false;
		img.decoding = 'async';
		img.fetchPriority = t.ahead ? 'low' : 'high';
		img.style.transform = `translate(${t.x * TILE}px, ${t.y * TILE}px)`;
		const e = { img, z: t.z, x: t.x, y: t.y, on: false, seen: tick };
		// Fading in over the sea colour is what a zoom step looks like
		// while its tiles arrive; popping from dark was a bug report. A
		// tile that fails to arrive counts as arrived, or the level
		// under it would be kept for ever.
		const settle = () => { e.on = true; img.classList.add('on'); landed(); };
		img.addEventListener('load', settle, { once: true });
		img.addEventListener('error', settle, { once: true });
		img.src = t.src;
		if (img.complete && img.naturalWidth) settle();
		pool.set(t.key, e);
		levelBox(t.z).appendChild(img);
		return e;
	};
	// Letting go of an image still on its way cancels the request: a
	// level wheeled past, a tile panned away from, costs nothing more.
	const drop = (key, e) => {
		if (!e.on) e.img.src = '';
		e.img.remove();
		pool.delete(key);
	};

	const live = new Set();
	let loading = 0;
	for (const t of tiles) {
		live.add(t.key);
		let e = pool.get(t.key);
		if (!e && !hold) e = request(t);
		if (!e) continue;
		e.seen = tick;
		if (!e.on && !t.ahead) loading++;
	}
	const top = tiles[0];
	const going = ahead.length ? ahead[0].z : -1;
	for (const t of ahead) {
		live.add(t.key);
		const e = pool.get(t.key) || request(t);
		e.seen = tick;
	}
	if (top) {
		const d = levelBox(top.z);
		d.style.zIndex = 1;
		place(d, top.z, top.x, top.y, top);
	}

	// What leaves: unfinished tiles of any level, at once; finished
	// tiles of the drawn level beyond the keep; finished tiles of other
	// levels once the drawn level is whole, except the level a flight
	// is bound for.
	const spare = [];
	for (const [key, e] of pool) {
		if (live.has(key)) continue;
		if (!e.on) { drop(key, e); continue; }
		if (top && e.z === top.z) { spare.push([key, e]); continue; }
		if (e.z === going || (loading && !hold)) continue;
		drop(key, e);
	}
	if (spare.length > KEEP_TILES) {
		spare.sort((a, b) => a[1].seen - b[1].seen);
		for (const [key, e] of spare.slice(0, spare.length - KEEP_TILES)) drop(key, e);
	}
	for (const [z, d] of levels) {
		if (top && z === top.z) continue;
		const e = [...pool.values()].find(v => v.z === z);
		if (!e) { d.remove(); levels.delete(z); continue; }
		// The level a flight is bound for sharpens over the one carrying
		// it as its tiles land -- by standing after it in the layer, not
		// by a higher z-index, which would put it over the course line
		// too; any other level waits underneath.
		if (z === going && top) {
			d.style.zIndex = 1;
			const carrier = levels.get(top.z);
			if (carrier && d.previousElementSibling !== carrier) carrier.after(d);
		} else {
			d.style.zIndex = 0;
		}
		place(d, z, e.x, e.y, placeTile(mapState, size, z, e.x, e.y));
	}

	// The thread of light: shown only once the wait is long enough to
	// notice, so a fast connection never sees it flicker.
	const host = layer.parentElement;
	if (host) {
		if (loading && !hold) {
			if (!host._loadingTimer && !host.classList.contains('is-loading')) {
				host._loadingTimer = setTimeout(() => { host._loadingTimer = null; host.classList.add('is-loading'); }, 300);
			}
		} else {
			if (host._loadingTimer) { clearTimeout(host._loadingTimer); host._loadingTimer = null; }
			host.classList.remove('is-loading');
		}
	}
}

/** A tile has arrived: repaint soon, so the level under it is let go
 *  and the thread of light goes out when the last one lands -- at most
 *  a few times a second, whatever the burst. */
let landedTimer = null;
function landed() {
	if (landedTimer) return;
	landedTimer = setTimeout(() => { landedTimer = null; schedulePaint(); }, 100);
}

function paintPins(layer, pins, marks, currentId, nums = new Map()) {
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
		const isle = npcById.get(p.id).at;
		// A pan moves eighty of these a frame. Moving them by transform
		// leaves layout alone, and the words are written only when they
		// change: a text node replaced with its own text is still a
		// text node re-laid, and eighty islands over a busy corner of
		// the Ross Sea -- the hekaru's and the ocean stalker's water --
		// re-laid three lines each per frame was the stutter there.
		const title = m ? `${isle} (${p.name}) — ${what.join(', ')}` : `${isle} (${p.name})`;
		if (btn.title !== title) btn.title = title;
		// z-index rather than DOM order does what the wanted-last sort in
		// frame() used to: a lit pin paints over a plain one.
		const z = m || stopAt >= 0 ? '4' : '3';
		if (btn.style.zIndex !== z) btn.style.zIndex = z;
		btn.style.transform = `translate(${p.left}px, ${p.top}px)`;
		const badge = btn.querySelector('.map-pin-badge');
		const mark = stopAt >= 0 ? String(nums.get(p.id) || stopAt + 1) : visited && m ? '✓' : '';
		if (badge.textContent !== mark) badge.textContent = mark;
		badge.classList.toggle('is-done', stopAt < 0 && visited);
		const npcText = isle.replace(/ Islands?$/, '') + (m && what.length > 1 ? ` ·${what.length}` : '');
		const npcEl = btn.querySelector('.map-pin-npc');
		if (npcEl.textContent !== npcText) npcEl.textContent = npcText;
		const atEl = btn.querySelector('.map-pin-at');
		if (atEl.textContent !== p.name) atEl.textContent = p.name;
	}
	for (const [id, btn] of pool) {
		if (!live.has(id)) {
			btn.remove();
			pool.delete(id);
		}
	}
	declutterPins(pool, pins);
}

/**
 * Stop the barterers' names printing over each other.
 *
 * Only a wanted pin shows its name unasked, and where the plan wants a
 * dozen islands in one corner of Margoria those names land on top of one
 * another and the corner turns to grey mush. So a name claims the ground
 * it covers and a name that cannot have its own ground is not drawn.
 *
 * The pin itself never goes: the dot, the badge and the hit target are
 * exactly where they were, and hovering one whose name is folded away
 * still shows it -- so nothing becomes unreachable, it just stops
 * shouting over its neighbours. Zooming in spreads them out and the
 * names come back on their own.
 *
 * Order decides who wins the overlap: a numbered stop on the route
 * first, then whatever is nearest the middle of the chart, which is
 * what the reader is looking at.
 */
function declutterPins(pool, pins) {
	const shown = [];
	// The wharves name themselves permanently and were on the chart
	// first, so their words are ground already taken. There are only a
	// handful, so these can be measured properly rather than guessed.
	//
	// Measured once each, though: a name's size never changes, and
	// measuring it on every frame -- after the pins above have all just
	// been moved -- forced the whole layer to be laid out again per
	// frame. Its place comes from where paintPorts put the dot: the name
	// hangs centred under it.
	const layer = pool.values().next().value?.parentElement;
	if (layer) {
		for (const port of layer.querySelectorAll('.map-port')) {
			if (port.hidden) continue;
			const el = port.querySelector('.map-port-name');
			if (!el) continue;
			if (!el._box) el._box = { w: el.offsetWidth, h: el.offsetHeight };
			if (!el._box.w) { el._box = null; continue; }
			if (!port._at) continue;
			const { left, top } = port._at;
			const t = top + 4.5 + 3;
			shown.push({ l: left - el._box.w / 2, r: left + el._box.w / 2, t, b: t + el._box.h });
		}
	}
	// The name hangs east of a dot that sits exactly on the coordinate:
	// half a dot and the gap, then the wider of its two lines. At 10px
	// display type that runs about 5.6px a character, over two lines
	// about 24px tall. Estimated rather than measured because this runs
	// on every pan frame, and 80 getBoundingClientRect calls there is a
	// layout thrash for a label nobody is reading yet.
	const CH = 5.6, H = 24;
	const claim = (btn, left, top) => {
		const npc = btn.querySelector('.map-pin-npc').textContent || '';
		const at = btn.querySelector('.map-pin-at').textContent || '';
		const w = Math.max(npc.length, at.length) * CH;
		const box = { l: left - 8, r: left + 12 + w, t: top - H / 2, b: top + H / 2 };
		for (const s of shown) {
			if (box.l < s.r && box.r > s.l && box.t < s.b && box.b > s.t) return false;
		}
		shown.push(box);
		return true;
	};

	// Only the pins that show a name unasked are worth arranging.
	const named = pins.filter(p => {
		const btn = pool.get(p.id);
		return btn && btn.classList.contains('wanted');
	});
	const mid = namedMid(named);
	named.sort((a, b) => {
		const sa = stopsLive() ? stops.indexOf(a.id) : -1;
		const sb = stopsLive() ? stops.indexOf(b.id) : -1;
		// A stop on the route keeps its name whatever else is near it.
		if ((sa >= 0) !== (sb >= 0)) return sa >= 0 ? -1 : 1;
		if (sa >= 0 && sb >= 0) return sa - sb;
		return ((a.left - mid.x) ** 2 + (a.top - mid.y) ** 2)
			- ((b.left - mid.x) ** 2 + (b.top - mid.y) ** 2);
	});

	for (const p of named) {
		const btn = pool.get(p.id);
		btn.classList.toggle('name-off', !claim(btn, p.left, p.top));
	}
	// A pin with no name of its own to show was never in the running.
	for (const p of pins) {
		const btn = pool.get(p.id);
		if (btn && !btn.classList.contains('wanted')) btn.classList.remove('name-off');
	}
}

/** The middle of whatever is marked, which is where the eye is. */
function namedMid(named) {
	if (!named.length) return { x: 0, y: 0 };
	let x = 0, y = 0;
	for (const p of named) { x += p.left; y += p.top; }
	return { x: x / named.length, y: y / named.length };
}

function paintRoute(layer, size, marks) {
	// The hand-plotted route wins; the suggested loop through everything
	// marked is what you get before you have plotted one. Either way the
	// chosen wharf anchors it.
	const pts = seaBent(routeWorld(marks)).map(p => project(mapState, size, p.x, p.y));
	// The pathfinder already bent these legs round the land; drawn as
	// given they are the shortest water line, and the line agrees with
	// the measured minutes. A bow on top redrew open water as an arc.
	const d = routePath(pts, size, 0);

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
	// The leg into the current stop, bright, with the rest faint: the
	// world points are the start wharf, the stops, and the wharf again
	// when the route goes home, so the stop's point is one along.
	let next = svg._next;
	if (!next) {
		next = svg._next = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		next.setAttribute('class', 'map-route-next');
		svg.appendChild(next);
	}
	const world = routeWorld(marks);
	const seq = routeSeq(marks);
	const at = seq.length > 1 ? Math.min(stepIdx, seq.length - 1) + (world.length > seq.length ? 1 : 0) : -1;
	if (nextOnly && d && at > 0 && at < world.length) {
		const leg = seaBent([world[at - 1], world[at]]).map(p => project(mapState, size, p.x, p.y));
		next.setAttribute('d', routePath(leg, size, 0));
		svg.classList.add('next-only');
	} else {
		next.setAttribute('d', '');
		svg.classList.remove('next-only');
	}

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
		const d = routePath(seaBent(c.points).map(p => project(mapState, size, p.x, p.y)), size, 0);
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
const HUNT_MARGIN = 240;   // css px of sea drawn past each edge of the box

function paintHunt(layer, size) {
	let cv = layer._hunt;
	if (!huntsOn.length) { if (cv) cv.style.display = 'none'; layer._huntAt = null; return; }
	if (!cv) {
		cv = layer._hunt = document.createElement('canvas');
		cv.className = 'map-hunt-layer';
		layer.appendChild(cv);
	}
	cv.style.display = '';
	// A canvas the size of the screen, cleared and redrawn and handed
	// to the GPU again on every frame of a pan, is a cost a pan does
	// not need to pay: the dots do not change, they slide. So it is
	// drawn a margin wider than the box and slid by transform until the
	// pan runs past the margin, the zoom changes, or the grounds do;
	// then once more.
	const was = layer._huntAt;
	const origin = project(mapState, size, 0, 0);
	const key = `${huntsOn.join(',')}|${size.w}x${size.h}`;
	if (was && was.key === key) {
		const r = Math.pow(2, mapState.zoom - was.zoom);
		if (r === 1) {
			const dx = origin.left - was.left, dy = origin.top - was.top;
			if (Math.abs(dx) < HUNT_MARGIN && Math.abs(dy) < HUNT_MARGIN) {
				cv.style.transform = `translate3d(${dx - HUNT_MARGIN}px, ${dy - HUNT_MARGIN}px, 0)`;
				return;
			}
		} else if (r > 0.5 && r < 2) {
			// Mid-zoom, the last drawing is stretched to fit -- the dots
			// grow a little soft for a moment -- and drawn afresh once the
			// wheel has stopped. A ground the size of the hekaru's, filled
			// and outlined wide, is too much to rasterise per notch.
			cv.style.transform = `translate3d(${origin.left - r * (HUNT_MARGIN + was.left)}px, ${origin.top - r * (HUNT_MARGIN + was.top)}px, 0) scale(${r})`;
			clearTimeout(layer._huntSettle);
			layer._huntSettle = setTimeout(() => { layer._huntAt = null; schedulePaint(); }, 140);
			return;
		}
	}
	clearTimeout(layer._huntSettle);
	layer._huntAt = { key, zoom: mapState.zoom, left: origin.left, top: origin.top };
	cv.style.transform = `translate3d(${-HUNT_MARGIN}px, ${-HUNT_MARGIN}px, 0)`;
	const dpr = window.devicePixelRatio || 1;
	const W = size.w + HUNT_MARGIN * 2, H = size.h + HUNT_MARGIN * 2;
	if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
		cv.width = Math.round(W * dpr);
		cv.height = Math.round(H * dpr);
		cv.style.width = `${W}px`;
		cv.style.height = `${H}px`;
	}
	const g = cv.getContext('2d');
	// Drawn in the box's own coordinates, shifted by the margin.
	g.setTransform(dpr, 0, 0, dpr, HUNT_MARGIN * dpr, HUNT_MARGIN * dpr);
	g.clearRect(-HUNT_MARGIN, -HUNT_MARGIN, W, H);
	const r = Math.max(2.5, Math.min(6, 1.2 * Math.pow(2, mapState.zoom - 4)));
	// A ground as an area first: the outline round each cluster of
	// spawns, filled faintly and padded by about a spawn's reach, so a
	// species' water reads at a glance the way the game's own map
	// shades it. The points go on top.
	const o = project(mapState, size, 0, 0), o2 = project(mapState, size, 1000, 0);
	const pxPerK = Math.abs(o2.left - o.left);
	const pad = Math.max(6, Math.min(40, 1.5 * pxPerK));
	for (const key of huntsOn) {
		const m = monsterByKey[key];
		if (!m || !m.points.length) continue;
		for (const h of habitats(m)) {
			if (!h.hull || h.hull.length < 2) continue;
			const pts = h.hull.map(([x, y]) => project(mapState, size, x, y));
			// Skipped only when its whole box lies off the screen: a ground
			// wider than the view has every corner out of sight and still
			// fills it.
			const xs = pts.map(p => p.left), ys = pts.map(p => p.top);
			if (Math.max(...xs) < -pad - HUNT_MARGIN || Math.max(...ys) < -pad - HUNT_MARGIN || Math.min(...xs) > size.w + pad + HUNT_MARGIN || Math.min(...ys) > size.h + pad + HUNT_MARGIN) continue;
			g.beginPath();
			pts.forEach((p, i) => (i ? g.lineTo(p.left, p.top) : g.moveTo(p.left, p.top)));
			g.closePath();
			g.save();
			g.lineJoin = 'round';
			g.lineCap = 'round';
			g.fillStyle = m.colour;
			g.strokeStyle = m.colour;
			g.globalAlpha = 0.14;
			g.lineWidth = pad * 2;
			g.stroke();
			g.fill();
			g.globalAlpha = 0.45;
			g.lineWidth = 1;
			g.stroke();
			g.restore();
		}
	}
	g.lineWidth = Math.max(1.2, r / 2.5);
	g.lineCap = 'round';
	for (const key of huntsOn) {
		const m = monsterByKey[key];
		if (!m) continue;
		g.strokeStyle = m.colour;
		g.fillStyle = m.colour;
		// No shadow blur: a blurred shadow is an offscreen pass per mark,
		// and a hundred of them per redraw was most of the redraw.
		// A species the codex has no points for -- the crocodiles since
		// their move -- is drawn at its ground instead: a dashed ring,
		// since the spot is approximate, so picking it never shows an
		// empty sea.
		if (!m.points.length && m.zones) {
			for (const [x, y] of m.zones) {
				const at = project(mapState, size, x, y);
				if (at.left < -60 - HUNT_MARGIN || at.top < -60 - HUNT_MARGIN || at.left > size.w + 60 + HUNT_MARGIN || at.top > size.h + 60 + HUNT_MARGIN) continue;
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
			if (at.left < -10 - HUNT_MARGIN || at.top < -10 - HUNT_MARGIN || at.left > size.w + 10 + HUNT_MARGIN || at.top > size.h + 10 + HUNT_MARGIN) continue;
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
		el._at = { left: Math.round(at.left), top: Math.round(at.top) };
		el.style.transform = `translate(${el._at.left}px, ${el._at.top}px)`;
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
			el.style.transform = `translate(${Math.round(g.at.left)}px, ${Math.round(g.at.top)}px)`;
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
		for (const el of layer.querySelectorAll('.map-port-name, .map-pin.wanted .map-pin-npc')) {
			const t = (el.textContent || '').trim().replace(/ Islands?$/, '');
			if (t) spoken.add(t.toLowerCase());
		}
	}
	// Margoria is a lot of small islands close together, and at the zoom
	// where the names first appear they used to print straight over each
	// other into a grey smudge. So a name claims a box, and a name whose
	// box is already taken waits for a closer zoom -- where the same two
	// islands are further apart and both fit. Nothing is dropped
	// permanently; zooming in is what asks for more of them.
	//
	// The box is measured from the text rather than the element: these
	// are set in one size, uppercase and nowrap, so a character count is
	// as good as a reflow here and does not cost a layout per label per
	// frame. 10px display type at .14em tracking runs about 7.4px a
	// character; the height is the line box plus a little air.
	const taken = [];
	const CH = 7.4, LINE = 15;
	const clear = (cx, cy, text) => {
		const halfW = (text.length * CH) / 2, halfH = LINE / 2;
		const l = cx - halfW, r = cx + halfW, t = cy - halfH, b = cy + halfH;
		for (const box of taken) {
			if (l < box.r && r > box.l && t < box.b && b > box.t) return null;
		}
		return { l, r, t, b };
	};

	// Nearest the middle of the chart wins the ground it stands on: the
	// island being looked at keeps its name when a neighbour at the edge
	// would otherwise have taken the box first.
	const mid = { x: size.w / 2, y: size.h / 2 };
	const placed = islandLabels()
		.map(l => ({ l, at: project(mapState, size, l.x, l.y) }))
		.sort((a, b) => ((a.at.left - mid.x) ** 2 + (a.at.top - mid.y) ** 2)
			- ((b.at.left - mid.x) ** 2 + (b.at.top - mid.y) ** 2));

	for (const { l, at } of placed) {
		let el = pool.get(l.name);
		const off = !show || spoken.has(l.name.toLowerCase())
			|| at.left < -80 || at.top < -30 || at.left > size.w + 80 || at.top > size.h + 30;
		if (off) { if (el) el.hidden = true; continue; }
		// The label sits 18px below the point, which is where it has to
		// be measured for a collision to mean anything.
		const box = clear(at.left, at.top + 18, l.name);
		if (!box) { if (el) el.hidden = true; continue; }
		taken.push(box);
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
		el.style.transform = `translate(${Math.round(at.left)}px, ${Math.round(at.top) + 18}px) translate(-50%, -50%)`;
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
		// Only a pier-mate is stepped down -- judged on the ground, not
		// on the screen, or zoomed out every wharf in the sea is within
		// a line of another and the column runs off the chart.
		const mate = p => Math.hypot(p.x - w.x, p.y - w.y) < 400
			&& Math.abs(p.left - at.left) < 70 && Math.abs(p.top - at.top) < 14;
		while (placed.some(mate)) at.top += 15;
		placed.push({ left: at.left, top: at.top, x: w.x, y: w.y });
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
		el.style.transform = `translate(${Math.round(at.left)}px, ${Math.round(at.top)}px)`;
	});
}

/**
 * The wharf calls gathered by pier.
 *
 * A run comes back to the same storage keeper as often as the hold
 * needs it -- four calls at Port Epheria is an ordinary [Level 7]
 * climb -- and four anchors on one coordinate is one anchor with three
 * hidden behind it. So the chart draws the pier once and the mark
 * carries every call made there.
 */
function stashPlaces(seq) {
	const by = new Map();
	for (const s of seq) {
		if (s.kind !== 'stash') continue;
		const key = `${Math.round(s.place.x)},${Math.round(s.place.y)}`;
		if (!by.has(key)) by.set(key, { key, x: s.place.x, y: s.place.y, name: s.place.name, at: s.place.at, calls: [] });
		by.get(key).calls.push(s);
	}
	return [...by.values()];
}

/** Every call made at the pier the call `wk` is at, in sailing order. */
function stashGroup(wk, seq) {
	const call = runStash[wk];
	if (!call) return null;
	return stashPlaces(seq).find(g => g.calls.some(s => s.k === wk))
		|| { key: '', x: call.x, y: call.y, name: call.name, at: call.at, calls: [] };
}

/**
 * The run's wharf calls, on the sea.
 *
 * A barterer's stop is a place to trade and wears the route's amber
 * number; a wharf call is the opposite of a trade -- goods go ashore
 * and the [Level 7]s are sold -- so it is drawn as its own kind of
 * mark: a violet anchor on a squared plate, numbered in the same
 * sequence so the chart and the Barter tab's timeline count alike.
 */
function paintStash(layer, size, seq, current) {
	const pool = layer._stash || (layer._stash = new Map());
	const live = new Set();
	for (const g of stashPlaces(seq)) {
		const at = project(mapState, size, g.x, g.y);
		const off = at.left < -60 || at.top < -60 || at.left > size.w + 60 || at.top > size.h + 60;
		live.add(g.key);
		let el = pool.get(g.key);
		if (!el) {
			el = document.createElement('button');
			el.className = 'map-stash';
			el.dataset.act = 'map-stash';
			el.innerHTML = '<span class="map-stash-dot">⚓</span><span class="map-stash-badge"></span>'
				+ '<span class="map-stash-name"><span class="map-stash-who"></span><span class="map-stash-at"></span></span>';
			el.addEventListener('pointerenter', () => { hoverStash = Number(el.dataset.i); hoverNpc = null; schedulePaint(); });
			el.addEventListener('pointerleave', () => { hoverStash = -1; schedulePaint(); });
			pool.set(g.key, el);
			layer.appendChild(el);
		}
		el.dataset.i = g.calls[0].k;
		el.hidden = off;
		if (off) continue;
		const stops = g.calls.map(s => s.n);
		el.title = `${g.name}, ${g.at} wharf — ${g.calls.length > 1
			? `${g.calls.length} calls on this run, at stops ${stops.join(', ')}`
			: `stop ${stops[0]}: ${g.calls[0].place.drops.length
				? `leaves ${g.calls[0].place.drops.map(d => `${n1(d.n)}× ${d.item}`).join(', ')} in storage`
				: g.calls[0].place.sale ? 'sells the goods aboard' : 'a call at the wharf'}`}`;
		el.classList.toggle('current', g.calls.includes(current));
		el.classList.toggle('many', g.calls.length > 1);
		el.style.transform = `translate(${Math.round(at.left)}px, ${Math.round(at.top)}px)`;
		el.querySelector('.map-stash-badge').textContent = g.calls.length > 1 ? `${g.calls.length}×` : String(stops[0]);
		el.querySelector('.map-stash-who').textContent = g.name;
		el.querySelector('.map-stash-at').textContent = g.calls.length > 1
			? `${g.at} · storage, ${g.calls.length} calls`
			: `${g.at} · storage`;
	}
	for (const [k, el] of pool) {
		if (!live.has(k)) { el.remove(); pool.delete(k); }
	}
}

/** The step player: one chip per stop, the current one lit, and a
 *  follow toggle that sails the camera along the route. */
function paintSteps(host, seq) {
	const el = host.querySelector('[data-map-steps]');
	if (!el) return;
	if (seq.length < 2) { el.hidden = true; el._sig = null; return; }
	const cur = seq[Math.min(stepIdx, seq.length - 1)];
	const sig = `${stepKey}|${stepIdx}|${follow}|${nextOnly}`;
	if (el._sig === sig) return;
	el._sig = sig;
	el.hidden = false;
	el.innerHTML = `<button class="map-step-nav" data-act="map-step-prev" aria-label="Previous stop">‹</button>
		<div class="map-step-chips">${seq.map((s, i) =>
			`<button class="map-step-chip${i === stepIdx ? ' on' : ''}${s.kind === 'stash' ? ' stash' : ''}" data-act="map-step" data-i="${i}"
				title="${esc(s.place.at)} · ${esc(s.place.name)}${s.kind === 'stash' ? ' — a wharf call' : ''}">${i + 1}</button>`).join('')}</div>
		<button class="map-step-nav" data-act="map-step-next" aria-label="Next stop">›</button>
		<span class="map-step-name">${esc(cur.place.at)}${cur.kind === 'stash' ? ' wharf' : ''} · ${esc(cur.place.name)}</span>
		<button class="map-step-follow${follow ? ' on' : ''}" data-act="map-follow">follow</button>
		<button class="map-step-follow${nextOnly ? ' on' : ''}" data-act="map-next-only" title="Draw the route faint but for the leg into this stop">next leg</button>`;
	const on = el.querySelector('.map-step-chip.on');
	if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
}

/**
 * What a planned run calls at this island for, on its card: the same
 * hand-over-and-get row the island's own offers are drawn as, in the
 * run's own colour -- a line of names is not a trade until you can see
 * what changes hands.
 */
function runTip(t, id) {
	// The Barter tab's checklist, when this island is on the run being
	// sailed: what it paid, and done -- the same marks as on the tab.
	const on = id ? sailFor(id) : null;
	const check = on ? `<div class="run-check map-tip-check">
		${on.options.length ? `<span class="run-paid"><span>paid</span>${on.options.map(n => `<button class="chip pay${on.paid === n ? ' active' : ''}" data-act="barter-paid" data-map="1" data-npc="${id}" data-n="${n}">${n}</button>`).join('')}</span>` : ''}
		<button class="run-done${on.done ? ' on' : ''}" data-act="barter-stop-done" data-map="1" data-k="n${id}" aria-pressed="${on.done}"><i>${on.done ? '✓' : ''}</i>${on.done ? 'Done' : 'Traded here'}</button>
	</div>` : '';
	return `<div class="map-tip-run">
		<span class="map-tip-k">The run${on ? ' · being sailed' : ''}</span>
		<div class="map-tip-row">
			<span class="map-tip-side" data-peek="${esc(t.give)}"><span class="map-io minus">${img(t.give, 'map-icon')}</span><span>${esc(t.giveText)}× ${esc(t.give)}</span></span>
			<span class="map-tip-arrow">→</span>
			<span class="map-tip-side get" data-peek="${esc(t.item)}"><span class="map-io plus">${img(t.item, 'map-icon')}</span><span>${esc(on && on.paid ? String(on.paid) : t.recvText)}× ${esc(t.item)}</span></span>
			<span class="map-tip-tries">${t.times > 1 ? `×${t.times}` : ''}</span>
		</div>
		${check}
	</div>`;
}

/**
 * A wharf call's card. Nothing is bartered here, so the card says the
 * other thing that happens on a run: what comes off the ship and into
 * storage, and what the [Level 7]s aboard fetch at the counter.
 */
function paintStashTip(host, tip, size, g, pinned) {
	const key = ['stash', g.key, pinned, g.calls.map(s => `${s.n}:${s.place.drops.length}:${s.place.sale}:${(s.place.quests || []).length}`).join(',')].join('|');
	if (tip._for !== key) {
		tip._for = key;
		const visit = s => {
			const c = s.place;
			const rows = c.drops.map(d => `<div class="map-tip-row">
				<span class="map-tip-side ashore" data-peek="${esc(d.item)}"><span class="map-io ashore">${img(d.item, 'map-icon')}</span><span>${esc(d.item)}</span></span>
				<span class="map-tip-tries">${n1(d.n)}×</span>
			</div>`).join('');
			const questRows = (c.quests || []).map(q => `<div class="map-tip-sub quest">📜 ${esc(q)}</div>`).join('');
			return `<span class="map-tip-k stash">Stop ${s.n}</span>
				${c.sale ? `<div class="map-tip-sub sell">sells ${n1(c.sale)} [Level 7]${c.silver ? ` for ${FC(c.silver)}` : ''}</div>` : ''}
				${questRows}
				${rows || (c.sale || questRows ? '' : '<div class="map-tip-sub none">Nothing left ashore this time.</div>')}`;
		};
		tip.innerHTML = `<div class="map-tip-head"><span class="map-tip-name">⚓ ${esc(g.name)}</span>
			${pinned ? '<button class="map-x" data-act="map-tip-close" aria-label="Close">×</button>' : ''}</div>
			<div class="map-tip-sub">${esc(g.at)} wharf · ${g.calls.length > 1
				? `the run calls ${g.calls.length} times`
				: 'a pause, not a barter'}</div>
			${g.calls.map(visit).join('')}`;
	}
	tip.classList.add('stash');
	tip.classList.toggle('pinned', pinned);
	tip.hidden = false;
	const at = project(mapState, size, g.x, g.y);
	const w = tip.offsetWidth || 264, h = tip.offsetHeight || 140;
	const steps = host.querySelector('[data-map-steps]');
	const floor = steps && !steps.hidden ? steps.offsetTop - 8 : size.h - 10;
	const maxTop = Math.max(10, floor - h);
	tip.style.left = `${Math.max(10, Math.min(size.w - w - 10, at.left + 16))}px`;
	tip.style.top = `${Math.max(10, Math.min(maxTop, at.top - 12))}px`;
}

function paintTip(host, size, marks) {
	const tip = host.querySelector('[data-map-tip]');
	if (!tip) return;
	tip.classList.remove('stash');
	// The trace tab hands the sea to the pen: no card opens over what is
	// being drawn, however the pointer wanders.
	if (mode === 'trace') { tip.hidden = true; tip._for = null; return; }
	// A wharf call has its own card: no trades, no Parley, no "add
	// stop" -- what goes ashore there and what the hold fetches.
	// Whatever the pointer is over wins over whatever was pinned, so a
	// pinned call does not sit over the island you are reading.
	const wk = stashLive() ? (hoverStash >= 0 ? hoverStash : hoverNpc ? -1 : pinnedStash) : -1;
	const group = wk >= 0 ? stashGroup(wk, routeSeq(marks)) : null;
	if (group) {
		paintStashTip(host, tip, size, group, hoverStash < 0);
		return;
	}
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
	const sf = runTrades[id] ? sailFor(id) : null;
	const key = [id, mode, pinned, stopsLive() ? stops.indexOf(id) : -1, dn.has(id), m ? m.items.size : 0, sf ? `${sf.done}:${sf.paid}` : ''].join('|');
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
		const sub = `${esc(npc.name)} · ${rate}`
			+ (pool > 1 ? ` · draws 1 of its ${pool} offers a refresh` : '');
		const onRoute = stopsLive() && stops.includes(id);
		const btns = `<div class="map-tip-btns">
			<button class="ghost-btn" data-act="map-stop" data-npc="${id}">${onRoute ? '− Remove stop' : '+ Add stop'}</button>
			${m ? `<button class="ghost-btn" data-act="map-done" data-npc="${id}">${dn.has(id) ? '✓ Sailed' : 'Mark sailed'}</button>` : ''}
		</div>`;
		tip.innerHTML = `<div class="map-tip-head"><span class="map-tip-name">${esc(npc.at)}</span>
			${pinned ? `<button class="map-x" data-act="map-tip-close" aria-label="Close">×</button>` : ''}</div>
			<div class="map-tip-sub">${sub}</div>
			${runTrades[id] ? runTip(runTrades[id], id) : ''}
			${rows || (runTrades[id] ? '' : '<div class="map-tip-sub none">Nothing on your list here.</div>')}
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
	// The level on screen carries the flight; the level at the far end
	// is asked for now, so it is there when the flight lands.
	heldLevel = drawnLevel === null ? levelFor(from.zoom) : drawnLevel;
	flightTo = probe;
	let t0 = null;                // rAF hands us the clock; no other is needed
	const step = t => {
		if (t0 === null) t0 = t;
		const p = Math.min(1, (t - t0) / 550);
		const e = 1 - Math.pow(1 - p, 3);
		mapState.zoom = from.zoom + (probe.zoom - from.zoom) * e;
		mapState.centre.x = from.x + (probe.centre.x - from.x) * e;
		mapState.centre.y = from.y + (probe.centre.y - from.y) * e;
		fly = p < 1 ? requestAnimationFrame(step) : null;
		if (!fly) { heldLevel = null; flightTo = null; }
		paintMap();
	};
	fly = requestAnimationFrame(step);
}

function cancelFly() {
	if (fly) cancelAnimationFrame(fly);
	fly = null;
	flightTo = null;
	if (settleTimer === null) heldLevel = null;
}

/* ------------------------------------------------------------------ *
 * gestures
 * ------------------------------------------------------------------ */

/** Drag to pan, wheel or pinch to zoom. Wired once, for whatever map
 *  exists. */
export function wireMap() {
	let swallowTap = false;       // the last gesture panned; eat its click
	let dragging = null;          // one pointer moving the sea
	const touching = new Map();   // every pointer down on the map, for pinch
	let pinch = null;             // { dist } spread at the last frame

	// The panel, the card, the minimap: furniture on top of the sea.
	// A gesture that starts on them is for them, not for the chart.
	const CHROME = '.map-side, .map-side-pill, .map-tip, .map-mini, .map-steps, .map-trace-write, .map-full-bar';
const MARKERS = '[data-act="map-pin"], [data-act="map-port"], [data-act="map-stash"], .map-habitat';
		// Tracing, the markers are scenery: a line drawn across a barterer
	// must not stop dead there and open his trades instead.
	// The markers used to be furniture too, and a drag that began on one
// died on the pin -- on a phone, half the sea wears a barterer. Now the
// sea takes the gesture wherever it starts, pinch included; a press
// that never leaves the slop is still the tap, answered in stop().
const furniture = () => CHROME;

	let pressed = null;           // where the last pointer went down, to tell a click from a drag

	document.addEventListener('pointerdown', evt => {
		const host = evt.target.closest('[data-map]');
		if (!host || evt.target.closest(furniture())) return;
		swallowTap = false;
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
		// A second finger while the pen is down means a pinch, not a
		// longer line: the stroke so far is dropped rather than kept
		// half-drawn, and the two fingers zoom.
		if (penStroke && touching.size === 2) penStroke = null;
		if (touching.size === 2) {
			// A second finger turns the gesture into a pinch, not a drag.
			dragging = null;
			const [a, b] = [...touching.values()];
			pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
		} else {
			dragging = { x: evt.clientX, y: evt.clientY };
		}
		// Firefox hands the click after a captured gesture to the capture
		// target, not the button it began on -- so a press that starts on
		// a marker goes uncaptured, and its tap stays a plain click in
		// every engine. The document-level listeners pan it all the same.
		if (!(mode !== 'trace' && evt.target.closest(MARKERS))) host.setPointerCapture(evt.pointerId);
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
				const at = inBox(host, (a.x + b.x) / 2, (a.y + b.y) / 2);
				zoomMoving();
				if (zoomAt(mapState, Math.log2(dist / pinch.dist), hostSize(host), at.x, at.y)) schedulePaint();
			}
			pinch.dist = dist;
			return;
		}

		if (!dragging) {
			const host = evt.target.closest && evt.target.closest('[data-map]');
			if (host && !evt.target.closest(furniture())) paintCoords(host, evt.clientX, evt.clientY);
			return;
		}
		const d = boxDelta(evt.clientX - dragging.x, evt.clientY - dragging.y);
		pan(mapState, d.x, d.y);
		dragging = { x: evt.clientX, y: evt.clientY };
		// A tooltip that opened on the touch-down is noise once the
		// finger is clearly sailing, not asking.
		if (hoverNpc) hoverNpc = null;
		schedulePaint();
	});

	const stop = evt => {
		// A mark set down stays where it was let go; a word tapped rather
		// than carried opens for retyping.
		if (markDrag) {
			const { kind, seq, moved } = markDrag;
			const carried = markDrag;
			markDrag = null;
			document.querySelectorAll('[data-map].moving-mark').forEach(el => el.classList.remove('moving-mark'));
			if (evt) touching.delete(evt.pointerId);
			// Set down on a headland, a stop steps off it; a word may
			// stand wherever it is put.
			const m = markBySeq(kind, seq);
			if (m && kind === 'stop') {
				const wet = onWater(m);
				if (wet) { m.x = wet.x; m.y = wet.y; }
				else if (moved) {
					// No water near enough to step off to: the stop goes
					// back where it was picked up, as a click that far
					// inland would have been refused.
					m.x = carried.x; m.y = carried.y;
					toast('A stop belongs on the water');
				}
			}
			if (!moved && kind === 'word' && markBySeq('word', seq)) editing = seq;
			persist();
			refreshSide();
			paintMap();
			return;
		}
		// A press that did not move is a click on the sea: with the ruler
		// armed, that is one end of a measurement.
		if (penStroke) penEnd();
		// A press that travelled was a pan; the click the browser still
		// fires after it must not also work whatever marker it ends on.
		// A press that stayed put is the tap, and that click stands --
		// the markers stopped being furniture, so it reaches them.
		if (evt && evt.type === 'pointerup' && pressed
			&& Math.hypot(evt.clientX - pressed.x, evt.clientY - pressed.y) >= 5) swallowTap = true;
		if (evt && evt.type === 'pointerup' && pressed && mapState
			&& Math.hypot(evt.clientX - pressed.x, evt.clientY - pressed.y) < 5) {
			if (measuring) measureAt(pressed.host, evt.clientX, evt.clientY);
			else if (traceTool === 'point') traceAdd(pressed.host, evt.clientX, evt.clientY);
			else if (traceTool === 'text') textAdd(pressed.host, evt.clientX, evt.clientY);
			else if (traceTool === 'area') areaAdd(pressed.host, evt.clientX, evt.clientY);
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
	document.addEventListener('click', evt => {
		if (!swallowTap) return;
		swallowTap = false;
		if (evt.target.closest && evt.target.closest('[data-map]')) {
			evt.stopPropagation();
			evt.preventDefault();
		}
	}, true);

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
		const at = inBox(host, evt.clientX, evt.clientY);
		miniDrag = { mini, host, dx: at.x - mini.offsetLeft, dy: at.y - mini.offsetTop, w: mini.offsetWidth, hgt: mini.offsetHeight, hw: host.clientWidth, hh: host.clientHeight, moved: false };
		grip.setPointerCapture(evt.pointerId);
		evt.preventDefault();
	});
	document.addEventListener('pointermove', evt => {
		if (!miniDrag) return;
		const at = inBox(miniDrag.host, evt.clientX, evt.clientY);
		const x = Math.max(0, Math.min(miniDrag.hw - miniDrag.w, at.x - miniDrag.dx));
		const y = Math.max(0, Math.min(miniDrag.hh - miniDrag.hgt, at.y - miniDrag.dy));
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
		const at = inBox(mini, evt.clientX, evt.clientY);
		const b = npcBox();
		flyTo(
			b.x0 + at.x / mini.clientWidth * (b.x1 - b.x0),
			b.y0 + at.y / mini.clientHeight * (b.y1 - b.y0)
		);
	});

	window.addEventListener('resize', () => {
		if (view !== 'map') return;
		// A phone turned in the hand: the chart over the whole screen
		// turns with it, or stops having to.
		if (fullOn) settleTurn();
		// The box changed size under the minimap; keep it inside.
		const mini = document.querySelector('[data-map-mini]');
		const host = mini && mini.closest('[data-map]');
		if (mini && host && miniPos) {
			miniPos = {
				x: Math.max(0, Math.min(host.clientWidth - mini.offsetWidth, miniPos.x)),
				y: Math.max(0, Math.min(host.clientHeight - mini.offsetHeight, miniPos.y))
			};
			Object.assign(mini.style, { left: `${Math.round(miniPos.x)}px`, top: `${Math.round(miniPos.y)}px`, right: 'auto', bottom: 'auto' });
		}
		paintMap();
	});

	// The browser's own way out of full screen -- Esc, the back gesture --
	// is the chart's way out too.
	document.addEventListener('fullscreenchange', () => {
		if (!document.fullscreenElement && fullOn) exitFull();
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
			if (r.game) return;
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
	pinnedStash = -1;
	hoverNpc = null;
	flyTo(at.x, at.y, Math.max(mapState.zoom, CLOSE_ZOOM));
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
		runTrades = {};
	} else {
		stops = stops.includes(npcId) ? stops.filter(id => id !== npcId) : [...stops, npcId];
		delete runTrades[npcId];
	}
	// The wharf calls were a planned run's, pinned to its order; edit
	// the stops and they no longer describe the route, so they go.
	runStash = [];
	stopsPick = mapPick || '';
	persist();
	refreshSide();
	paintMap();
}

export function useSuggestedRoute() {
	stashRoute();
	stops = suggestedIds(marksNow());
	runTrades = {};
	runStash = [];
	stopsPick = mapPick || '';
	persist();
	refreshSide();
	paintMap();
}

export function reverseMapRoute() {
	stops = [...stops].reverse();
	runStash = [];
	persist();
	refreshSide();
	paintMap();
}

export function clearMapRoute() {
	stops = [];
	runTrades = {};
	runStash = [];
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
	pinnedStash = -1;
	paintMap();
}

/** A wharf call clicked on the chart: its card opens and the sea
 *  centres on it, the way a barterer's pin does. */
export function mapCentreOnStash(i) {
	const call = stashLive() ? runStash[i] : null;
	if (!call || !mapState) return;
	pinnedStash = i;
	pinnedNpc = null;
	hoverNpc = null;
	flyTo(call.x, call.y, Math.max(mapState.zoom, CLOSE_ZOOM));
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
	const seq = routeSeq(marksNow());
	if (seq.length < 2) return;
	stepIdx = ((i % seq.length) + seq.length) % seq.length;
	// The row in the list follows: lit, and brought into view.
	for (const row of document.querySelectorAll('[data-step-row]')) {
		const on = Number(row.dataset.i) === stepIdx;
		row.classList.toggle('on', on);
		if (on) row.scrollIntoView({ block: 'nearest' });
	}
	if (follow) {
		const s = seq[stepIdx];
		if (s) {
			// The card follows the camera: an island's trades, or what
			// goes ashore at a wharf call.
			pinnedNpc = s.kind === 'npc' ? s.id : null;
			pinnedStash = s.kind === 'stash' ? s.k : -1;
			hoverNpc = null;
			hoverStash = -1;
			flyTo(s.place.x, s.place.y, Math.max(mapState.zoom, CLOSE_ZOOM - 0.15));
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

/** The route drawn faint but for the leg into the current stop, or whole. */
export function mapNextOnlyToggle() {
	nextOnly = !nextOnly;
	persist();
	paintMap();
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

/** Fold the layer strip away, or back. */
export function toggleMapLayers() {
	layersOpen = !layersOpen;
	persist();
	refreshSide();
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
		}),
		// The pauses a planned run makes between those stops: a wharf,
		// how many islands are sailed before it, and what is left there.
		calls: stashLive() ? runStash.map(c => ({
			after: c.i, name: c.name, at: c.at, x: c.x, y: c.y,
			leaves: c.drops.map(d => ({ item: d.item, n: d.n })),
			sells: c.sale, silver: c.silver
		})) : []
	}, null, 2);
}

/**
 * Take a route file back in. Stops unknown to the chart are dropped
 * and counted, so a file from a newer dataset still lands; the route
 * is plotted under whatever the chart is currently showing.
 */
export function importRoute(text) {
	// The game's own file, or a piece of it, is read the other way round.
	if (looksLikeGameXML(text)) {
		const r = gameImportRead(text);
		openGameImport();
		return { stops: r.sets.reduce((n, g) => n + g.points.length, 0), dropped: r.dropped, game: true };
	}
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
	runTrades = {};
	runStash = readStash((Array.isArray(data.calls) ? data.calls : [])
		.map(c => [c.after, c.name, c.at, c.x, c.y, (c.leaves || []).map(d => [d.item, d.n]), c.sells, c.silver]));
	stopsPick = mapPick || '';
	startPort = data.start && ports.some(p => p.id === Number(data.start.id)) ? Number(data.start.id) : 0;
	returnHome = data.returnHome === true;
	mode = 'route';
	stepIdx = 0;
	persist();
	return { stops: ids.length, dropped };
}

/* ------------------------------------------------------------------ *
 * the game's map, read back
 * ------------------------------------------------------------------ */

/** A point this near a barterer on the chart is that barterer: 60
 *  pixels is 15 m of sea, less than an island and more than a hand
 *  that clicked the map near where he stands. */
const SNAP = 60;

let gameIn = null;   // what the last paste read: { sets, dropped, text }

/** The barterer or wharf a chart point stands on, if any. */
function snapPoint(p) {
	let best = null;
	for (const n of npcs) {
		const d = Math.hypot(n.x - p.x, n.y - p.y);
		if (d <= SNAP && (!best || d < best.d)) best = { kind: 'npc', id: n.id, d };
	}
	if (best) return best;
	const w = nearestWharf(p.x, p.y);
	return w && w.d <= SNAP ? { kind: 'wharf', wharf: w, d: w.d } : null;
}

/**
 * The game's favourites, camera slots and loops as things the chart
 * can hold. Each set can be a trace -- the points in order, named
 * where the file names them -- and, when its points sit on barterers,
 * the route: those barterers in that order, a wharf call where a point
 * sits on a wharf. What the export wrote comes back whole that way;
 * favourites a person set by hand come back as the trace they are.
 */
export function gameImportRead(text) {
	const r = readGameXML(text);
	const sets = [];
	const add = (key, name, points) => {
		if (!points.length) return;
		const stops = [];
		const calls = [];
		let onNpc = 0;
		for (const p of points) {
			const at = snapPoint(p);
			if (at && at.kind === 'npc') {
				onNpc++;
				if (!stops.includes(at.id)) stops.push(at.id);
			} else if (at && at.kind === 'wharf') {
				calls.push({ after: stops.length, wharf: at.wharf });
			}
		}
		const bends = points.length - onNpc - calls.length;
		sets.push({
			key, name, points, stops, calls,
			// A route is on offer once a barterer is in it; it is the
			// answer when every point is one, or a wharf on the way.
			route: stops.length > 0,
			as: stops.length > 0 && bends === 0 ? 'route' : 'trace',
			bends
		});
	};
	add('favorites', 'Favourites', r.favorites.map(p => ({ x: p.x, y: p.y, note: p.name })));
	add('cameras', 'Camera slots', r.cameras.map(p => ({ x: p.x, y: p.y, note: `Camera ${p.index}` })));
	for (const l of r.loops) add(`loop${l.slot}`, `Loop ${l.slot + 1}`, l.points.map(p => ({ x: p.x, y: p.y })));
	gameIn = { sets, dropped: r.dropped, text };
	return gameIn;
}

/** A set as a kept trace: stops while they fit, a drawn line past that. */
function gameSetTrace(g, when) {
	const raw = { name: `${g.name} (game)`, notes: `From gameVariable.xml, ${when}`, points: [], strokes: [], texts: [], areas: [], shown: true, at: Date.now() };
	if (g.points.length <= TRACE_STOPS) raw.points = g.points.map(p => ({ x: p.x, y: p.y, note: p.note }));
	else raw.strokes = [{ pts: g.points.flatMap(p => [p.x, p.y]), colour: inkColour, width: inkWidth }];
	return cleanTrace(raw);
}

/**
 * What was read, brought onto the chart: `choice` says for each set's
 * key whether it comes as `trace`, as `route`, or not at all. Traces
 * go to the library, shown, and the first of them is opened for
 * drawing on; a route is plotted the way a route file is.
 */
export function gameImportApply(choice) {
	if (!gameIn) return null;
	const when = new Date().toISOString().slice(0, 10);
	let first = null;
	let routed = null;
	let n = 0;
	for (const g of gameIn.sets) {
		const as = choice[g.key];
		if (as === 'route' && g.route) {
			if (stops.length && stops.join('.') !== g.stops.join('.')) stashRoute();
			stops = g.stops.slice();
			runTrades = {};
			runStash = readStash(g.calls.map(c => [c.after, c.wharf.name, c.wharf.at, c.wharf.x, c.wharf.y, [], 0, 0]));
			stopsPick = mapPick || '';
			startPort = 0;
			returnHome = false;
			mode = 'route';
			stepIdx = 0;
			routed = g;
			n++;
		} else if (as === 'trace') {
			const t = gameSetTrace(g, when);
			if (!t) continue;
			traces = [t, ...traces.filter(r => r.name !== t.name)].slice(0, TRACES_MAX);
			tracesOn = true;
			if (!first) first = t;
			n++;
		}
	}
	if (!n) return { n: 0 };
	// The chart opens on what came in: the route when one did, else the
	// first trace, ready to be drawn on.
	if (routed) {
		pendingFit = true;
	} else if (first) {
		trace = cleanTrace(first);
		editing = 0;
		mode = 'trace';
		panelOpen = true;
		pendingFit = { points: trace.points.length ? trace.points : traceAnchors(trace) };
	}
	persist();
	gameIn = null;
	return { n, routed: routed ? routed.stops.length : 0, first: first ? first.name : null };
}

/** The dialog: a box to paste into, or a file, and then what was
 *  found, each with its way onto the chart. */
export function openGameImport() {
	const found = gameIn && gameIn.sets.length ? gameIn : null;
	const text = gameIn ? gameIn.text : '';
	const sets = found ? `<div class="map-game-sets">
		${found.sets.map(g => {
			const names = g.points.map(p => p.note).filter(Boolean);
			const what = `${g.points.length} point${g.points.length === 1 ? '' : 's'}${names.length ? ': ' + esc(names.slice(0, 4).join(', ')) + (names.length > 4 ? ', …' : '') : ''}`;
			const on = g.route
				? ` · ${g.stops.length} barterer${g.stops.length === 1 ? '' : 's'}${g.calls.length ? `, ${g.calls.length} wharf call${g.calls.length === 1 ? '' : 's'}` : ''}${g.bends ? `, ${g.bends} on open sea` : ''}`
				: ' · none on a barterer';
			return `<label class="map-game-set">
				<span class="map-game-set-name"><b>${esc(g.name)}</b><small>${what}${on}</small></span>
				<select class="purse-inline" data-game-set="${esc(g.key)}">
					<option value="trace"${g.as === 'trace' ? ' selected' : ''}>as a trace</option>
					${g.route ? `<option value="route"${g.as === 'route' ? ' selected' : ''}>as the route</option>` : ''}
					<option value="skip">leave out</option>
				</select>
			</label>`;
		}).join('')}
		${found.dropped ? `<p class="map-game-loopnote">${found.dropped} point${found.dropped === 1 ? ' was' : 's were'} off the chart and left out.</p>` : ''}
	</div>` : gameIn ? '<p class="map-game-fit">Nothing the chart can use in that: no bookmark, camera slot or loop.</p>' : '';
	openDialog(`<h2>Bring the game's map here</h2>
		<p>The favourites, camera slots and loops the game keeps in <code>gameVariable.xml</code>, back onto this chart. Paste the whole file, the <code>&lt;WorldMapQuickScreenPosition&gt;</code> block, or just the lines you want — or open the file. Each set comes in as a trace, or as the route when its points sit on barterers.</p>
		<textarea class="map-xml" rows="7" spellcheck="false" data-game-in aria-label="The block from gameVariable.xml" placeholder='&lt;BookMark BookMarkName="…" PosX="…" PosY="…" PosZ="…"/&gt;'>${esc(text)}</textarea>
		<div class="map-game-btns">
			<button class="ghost-btn" data-act="map-game-in-file">Open gameVariable.xml…</button>
			<button class="ghost-btn" data-act="map-game-in-read">Read it</button>
		</div>
		${sets}
		<div class="dialog-actions">
			<button class="ghost-btn" data-close>Close</button>
			${found ? '<button class="act" data-act="map-game-in-go">Bring them in</button>' : ''}
		</div>`);
}

/** The dialog's buttons. */
export async function gameImportAction(act, el) {
	switch (act) {
		case 'map-game-in':
			gameIn = null;
			return openGameImport();
		case 'map-game-in-read': {
			const box = el.closest('.dialog-box').querySelector('[data-game-in]');
			const text = box ? box.value : '';
			if (!text.trim()) return toast('Paste the block first');
			if (!looksLikeGameXML(text)) return toast('That is not the game’s map: no bookmark, camera slot or loop in it');
			gameImportRead(text);
			return openGameImport();
		}
		case 'map-game-in-file': {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'text/xml,application/xml,.xml';
			input.addEventListener('change', async () => {
				const file = input.files && input.files[0];
				if (!file) return;
				const text = await file.text();
				if (!looksLikeGameXML(text)) return toast('That file holds no bookmark, camera slot or loop');
				gameImportRead(text);
				openGameImport();
			});
			input.click();
			return;
		}
		case 'map-game-in-go': {
			const choice = {};
			for (const sel of el.closest('.dialog-box').querySelectorAll('[data-game-set]')) choice[sel.dataset.gameSet] = sel.value;
			const r = gameImportApply(choice);
			if (!r || !r.n) return toast('Nothing chosen to bring in');
			closeDialog();
			toast(r.routed
				? `Route plotted: ${r.routed} stop${r.routed === 1 ? '' : 's'} from the game's map${r.n > 1 ? `, and ${r.n - 1} trace${r.n === 2 ? '' : 's'} kept` : ''}`
				: `${r.n} trace${r.n === 1 ? '' : 's'} kept from the game's map`);
			return true;
		}
	}
	return false;
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

/** The route's stops, in sailing order -- the wharf calls of a planned
 *  run among them, since the game's map is where the run is actually
 *  sailed and a pause to unload is a place to steer for. */
function routePoints() {
	if (!stopsLive()) return [];
	return routeSeq(marksNow()).map(s => ({
		name: s.kind === 'stash'
			? `${s.n}: ⚓ ${s.place.name} (${s.place.at})`
			: `${s.n}: ${s.place.name} (${s.place.at})`,
		x: s.place.x, y: s.place.y
	}));
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
	if (!r.stops) {
		return toast(gameSource === 'hunt'
			? 'Nothing to put on the map: the grounds ticked have no fixed spawn points on the chart'
			: 'Nothing to put on the map yet — plot a stop first');
	}
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
		<div class="dialog-actions">
			<button class="ghost-btn" data-act="map-game-in" title="Read favourites, camera slots and loops back out of the game's file">The other way: bring the game's map here</button>
			<button class="ghost-btn" data-close>Close</button>
		</div>`);
}


// The lanes are the router's to know about whichever screen draws a
// route first, and they live in this screen's store -- so it is read
// as soon as the module is, not on the first look at the chart.
restore();
