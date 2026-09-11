// The chart's state and its keeping: the one object the map modules
// share, the preferences kept in this browser, the data kept in the
// profile's view, and the reads and writes between them.

import { courseById } from '../courses.js';
import { monsterByKey } from '../sea_monsters.js';
import { npcById, ports } from '../barter_npcs.js';
import { setLanes } from '../searoute.js';
import { barterKey } from '../clock.js';
import * as store from '../state.js';
import { SAVED_MAX, splitPrevious } from '../saved-routes.js';
import { readView } from '../profile-shape.js';
import { bent } from './marks.js';
import { readTrades, readStash } from './route.js';
import { INKS, WIDTHS, SIZES, cleanTrace } from './trace.js';

export const STORE_KEY = 'bdo-tracker/map-view';
export const TRACES_MAX = 20;

/* The planner's own state: which side-panel mode, the hand-built route,
 * and what you have already visited today. Kept across sessions the
 * same way the active tab is -- it is view state, not inventory.
 *
 * One object, not a spread of module variables: every map module reads
 * and writes it through `mv` -- `mv.stops`, `mv.mode` -- so a change
 * made in one is what the next one sees. */
export const mv = {
	mapState: null,
	mapPick: null,
	pendingFit: false,

	mode: 'sail',            // sail | route | today
	kindFilter: 'all',       // all | material | trade -- one list per run
	panelOpen: true,
	searchQ: '',
	stops: [],               // npc ids, in sail order, chosen by hand
	stopsPick: '',           // the "Showing" view they were plotted under
	runTrades: {},           // npc id -> what a Barter-tab run calls there for: { give, giveText, item, recvText, recv, giveN, times }
	runStash: [],            // the run's wharf calls, threaded between the islands: { i, name, at, x, y, drops, sale, silver }
	done: { day: '', ids: [] },
	rationsAboard: null,     // rations in the pool right now, as typed; null means full
	restored: false,

	hoverNpc: null,
	pinnedNpc: null,
	hoverStash: -1,          // a wharf call under the pointer, by its place in runStash
	pinnedStash: -1,         // one whose card was opened by a click
	fly: null,               // the rAF handle of a flight in progress
	flightTo: null,          // where it is bound: a map state, for fetching ahead
	drawnLevel: null,        // the tile level the last paint drew
	heldLevel: null,         // the level kept on screen while a zoom is in motion
	settleTimer: null,       // the wheel's quiet moment, after which the zoom lands

	startPort: 0,            // wharf the route sails from; 0 = first stop
	returnHome: false,       // close the loop back to that wharf
	coursesOn: [],           // community courses drawn beneath the route, by id
	huntsOn: [],             // sea monster grounds shown, by species key
	wharvesOn: [],           // 'wharf' and/or 'guild': the wharf managers drawn
	habitatsOn: true,        // the game's habitat markers: a picture per species' ground
	labelsOn: true,          // island names, faint, once the chart is close enough to read them
	sideRight: false,        // the side panel on the right-hand side instead
	follow: true,            // the step player flies the camera along
	nextOnly: false,         // the route drawn faint but for the leg into the current stop
	stepIdx: 0,              // which stop the step player is on
	stepKey: '',             // the route it was on, to reset when it changes
	tradesMode: 'one',       // one | all -- how many trades a stop is costed at
	savedRoutes: [],         // { name, stops, startPort, returnHome, pick, at }
	prevRoute: null,         // the plot before the last replot, in a slot of its own -- never one of the eight
	miniOn: true,            // the minimap is shown
	miniPos: null,           // where it was dragged to, { x, y } from the box's corner, else the default corner
	measuring: false,        // the ruler is armed
	measurePts: [],          // the two ends of a measurement, in world space
	trace: null,             // the route being traced by hand -- see cleanTrace for its shape
	traces: [],              // traced routes kept by name, newest first
	traceTool: null,         // 'point' adds a stop per click, 'pen' draws while dragged, 'text' writes on the sea
	penStroke: null,         // the stroke under the pointer right now, in world space
	areaDraft: null,         // the corners of an area being shaded, flat world coords, until it is closed
	inkColour: '#ffd77a',    // the ink every new stop, stroke and word is drawn in
	inkWidth: 2.5,           // how thick the pen draws
	inkSize: 14,             // how big a word is written
	inkPlate: true,          // a word sits on a dark plate, to be read over bright water
	hugWater: true,          // a traced leg bends round the land between its stops
	layersOpen: true,        // the strip of chart layers is unfolded
	pinsOn: true,            // the barterers' own marks are drawn
	tracesOn: true,          // hand-traced routes are drawn
	libQ: '',                // the traces library: what is typed in its search
	libSort: 'recent',       // recent | name | size
	libOnly: 'all',          // all | shown
	libOpen: false,          // the library is the dialog on screen
	editing: 0,              // the seq of the word being typed on the chart, 0 for none
	markDrag: null,          // a stop or a word being carried elsewhere: { kind, seq, from, x, y, moved }
	threeD: false,           // the chart is stood up: the game's own terrain, drawn (js/map/terrain.js)
	pitch: 52,               // how far the camera leans over in that view, in degrees
	bearing: 0,              // and which way it faces, clockwise from north
	fullOn: false,           // the chart is the whole screen, over the app
	fullTurned: false,       // and turned on its side, for a phone held upright that cannot be told to turn
};

/** The barter day, on the standing region's clock -- the same one the
 *  Resets dialog corrects, so the countdown and the "sailed today" ticks
 *  roll over together. */
export function barterDay() {
	return barterKey();
}

/* ---- what is kept where ------------------------------------------------ *
   The chart keeps two kinds of thing. Preferences -- which tab, which
   layers, which side the panel sits, the ink -- are this browser's and
   stay under STORE_KEY in localStorage. Data -- the route plotted, the
   run's trades and calls, the routes kept by name, the traces, what
   was sailed today, the rations aboard -- is the player's and lives in
   the profile's view, so it exports, syncs and switches with the
   profile. The first restore on a build that knows the difference
   lifts the data out of the old key into the view. */
const VIEW_NS = 'map';
const DATA_KEYS = ['stops', 'stopsPick', 'runTrades', 'runStash', 'done', 'startPort', 'returnHome', 'savedRoutes', 'prevRoute', 'rationsAboard', 'trace', 'traces'];
let readSig = null;      // the view as last read or written, as text, so a synced change is read and an own write is not
let writeTimer = null;   // the view write owed, a moment after the last change
let writingView = false; // inside the map's own write of its view -- see mapWritingView

/**
 * Whether the store is being written by the Map right now. The page
 * redraws on every profile write, and a redraw of the Map in the
 * middle of a stroke, a word being typed or a stop being carried
 * throws the pen out of the player's hand -- so ui.js asks this and
 * leaves the Map alone for a write that is the Map's own: what it
 * wrote is what it is already showing.
 */
export function mapWritingView() {
	return writingView;
}

/** A write of the view with the flag up, so the redraw it causes is
 *  known for what it is. */
function writeView(fn) {
	writingView = true;
	try {
		fn();
	} finally {
		writingView = false;
	}
}

export function restore() {
	if (!mv.restored) {
		mv.restored = true;
		restorePrefs();
		// The write inside migrateView redraws the page through the
		// store's listeners, once, the first time a profile is opened
		// on this build; the redraw reads the view then.
		writeView(() => store.migrateView(VIEW_NS, STORE_KEY, s => Object.fromEntries(DATA_KEYS.filter(k => s[k] !== undefined).map(k => [k, s[k]]))));
	}
	restoreData();
}

function restorePrefs() {
	try {
		const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
		if (['sail', 'route', 'today', 'hunt', 'trace'].includes(s.mode)) mv.mode = s.mode;
		if (['all', 'material', 'trade'].includes(s.kindFilter)) mv.kindFilter = s.kindFilter;
		// A phone starts with the panel folded: 300 of its 400 pixels are
		// the sea's, until the panel is asked for.
		mv.panelOpen = s.panelOpen === undefined
			? !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 720px)').matches)
			: s.panelOpen !== false;
		mv.follow = s.follow !== false;
		mv.nextOnly = s.nextOnly === true;
		if (Array.isArray(s.coursesOn)) mv.coursesOn = s.coursesOn.filter(id => courseById[id]);
		if (Array.isArray(s.huntsOn)) mv.huntsOn = s.huntsOn.filter(k => monsterByKey[k]);
		if (Array.isArray(s.wharvesOn)) mv.wharvesOn = s.wharvesOn.filter(k => k === 'wharf' || k === 'guild');
		mv.habitatsOn = s.habitatsOn !== false;
		mv.labelsOn = s.labelsOn !== false;
		mv.pinsOn = s.pinsOn !== false;
		// A phone's panel is 300 of its 400 pixels; the strip folds itself
		// away there until it is asked for, and stays as it is left.
		mv.layersOpen = s.layersOpen === undefined
			? !(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 720px)').matches)
			: s.layersOpen !== false;
		mv.hugWater = s.hugWater !== false;
		mv.tracesOn = s.tracesOn !== false;
		if (INKS.includes(s.inkColour)) mv.inkColour = s.inkColour;
		if (WIDTHS.some(w => w.v === s.inkWidth)) mv.inkWidth = s.inkWidth;
		if (SIZES.some(z => z.v === s.inkSize)) mv.inkSize = s.inkSize;
		mv.inkPlate = s.inkPlate !== false;
		mv.sideRight = s.sideRight === true;
		if (s.tradesMode === 'all') mv.tradesMode = 'all';
		mv.miniOn = s.miniOn !== false;
		if (s.miniPos && Number.isFinite(s.miniPos.x) && Number.isFinite(s.miniPos.y)) mv.miniPos = { x: s.miniPos.x, y: s.miniPos.y };
	} catch { /* a fresh chart, then */ }
}

/**
 * The data, from the profile's view. Read again whenever the view has
 * changed under us -- a sync from another device, an import, a profile
 * switched -- and never when the change is our own write, which is
 * what is in memory already. Starts from the defaults each time, so a
 * field the new view lacks does not keep the old one's value.
 */
let readRef = null;   // the view object last read, so an unchanged store costs no stringify
function restoreData() {
	// Not while a write of our own is owed or under way: the store
	// notifies from inside the write, before the signature below has
	// been taken, and reading back then would replace the trace under
	// the pen with a copy -- and drop the blank word being typed.
	if (writeTimer || writingView) return;
	const v = store.getView(VIEW_NS);
	if (v === readRef) return;
	readRef = v;
	const sig = v ? JSON.stringify(v) : null;
	if (sig === readSig) return;
	readSig = sig;
	mv.stops = []; mv.stopsPick = ''; mv.runTrades = {}; mv.runStash = []; mv.done = { day: '', ids: [] };
	mv.startPort = 0; mv.returnHome = false; mv.savedRoutes = []; mv.prevRoute = null; mv.rationsAboard = null;
	mv.trace = null; mv.traces = [];
	mv.stepIdx = 0;
	const s = v || {};
	try {
		if (Array.isArray(s.stops)) mv.stops = s.stops.filter(id => npcById.has(id));
		if (typeof s.stopsPick === 'string') mv.stopsPick = s.stopsPick;
		if (s.runTrades && typeof s.runTrades === 'object') mv.runTrades = readTrades(Object.entries(s.runTrades).map(([id, t]) => [Number(id), t.give, t.giveText, t.item, t.recvText, t.recv, t.giveN, t.times]));
		if (Array.isArray(s.runStash)) mv.runStash = readStash(s.runStash.map(c => [c.i, c.name, c.at, c.x, c.y, (c.drops || []).map(d => [d.item, d.n]), c.sale, c.silver, c.quests || [], c.rations ? 'rations' : '']));
		if (s.done && s.done.day === barterDay() && Array.isArray(s.done.ids)) mv.done = { day: s.done.day, ids: s.done.ids.filter(id => npcById.has(id)) };
		if (Number.isFinite(s.rationsAboard) && s.rationsAboard >= 0) mv.rationsAboard = s.rationsAboard;
		if (ports.some(p => p.id === s.startPort)) mv.startPort = s.startPort;
		mv.returnHome = s.returnHome === true;
		if (s.trace && typeof s.trace === 'object') mv.trace = cleanTrace(s.trace);
		if (Array.isArray(s.traces)) mv.traces = s.traces.map(cleanTrace).filter(Boolean).slice(0, TRACES_MAX);
		const cleanRoute = r => ({ ...r, name: r.name.slice(0, 40), stops: r.stops.filter(id => npcById.has(id)) });
		const isRoute = r => r && typeof r.name === 'string' && Array.isArray(r.stops);
		if (Array.isArray(s.savedRoutes)) {
			// A chart from before the previous route had its own slot
			// kept it among the named ones; it is lifted out here.
			const split = splitPrevious(s.savedRoutes.filter(isRoute).map(cleanRoute).filter(r => r.stops.length));
			mv.savedRoutes = split.routes.slice(0, SAVED_MAX);
			if (split.previous) mv.prevRoute = split.previous;
		}
		if (isRoute(s.prevRoute)) {
			const r = cleanRoute(s.prevRoute);
			if (r.stops.length) mv.prevRoute = r;
		}
	} catch { /* a view this build does not read: the defaults stand */ }
	syncLanes();
}

/** The preferences to this browser now, and the data to the profile a
 *  moment later -- so a burst of clicks is one write and, since the
 *  store redraws the page on every profile write, one redraw. */
export function persist() {
	syncLanes();
	try {
		localStorage.setItem(STORE_KEY,
			JSON.stringify({ mode: mv.mode, panelOpen: mv.panelOpen, follow: mv.follow, nextOnly: mv.nextOnly, kindFilter: mv.kindFilter, coursesOn: mv.coursesOn, huntsOn: mv.huntsOn, wharvesOn: mv.wharvesOn, habitatsOn: mv.habitatsOn, labelsOn: mv.labelsOn, pinsOn: mv.pinsOn, tracesOn: mv.tracesOn, hugWater: mv.hugWater, layersOpen: mv.layersOpen, sideRight: mv.sideRight, tradesMode: mv.tradesMode, miniOn: mv.miniOn, miniPos: mv.miniPos, inkColour: mv.inkColour, inkWidth: mv.inkWidth, inkSize: mv.inkSize, inkPlate: mv.inkPlate, threeD: mv.threeD, pitch: mv.pitch, bearing: mv.bearing, farSight: mv.farSight }));
	} catch { /* private mode; the session still works */ }
	if (writeTimer) clearTimeout(writeTimer);
	writeTimer = setTimeout(flushView, 250);
}

function flushView() {
	if (!writeTimer) return;
	clearTimeout(writeTimer);
	writeTimer = null;
	writeView(() => store.setView(VIEW_NS, { stops: mv.stops, stopsPick: mv.stopsPick, runTrades: mv.runTrades, runStash: mv.runStash, done: mv.done, startPort: mv.startPort, returnHome: mv.returnHome, savedRoutes: mv.savedRoutes, prevRoute: mv.prevRoute, rationsAboard: mv.rationsAboard, trace: mv.trace, traces: mv.traces }));
	// What was just written is what is in memory: not to be read back.
	const v = store.getView(VIEW_NS);
	readRef = v;
	readSig = v ? JSON.stringify(v) : null;
}

// A write still owed when the page goes is made before it does.
if (typeof window !== 'undefined') {
	window.addEventListener('pagehide', flushView);
	window.addEventListener('beforeunload', flushView);
}

/**
 * Whether a trace kept now would come back shorter: the save holds a
 * stroke to 300 points and a view to a size, and a trace past either
 * is clipped on the way in. Said when it is kept, not found out later.
 */
export function traceClipNote(t) {
	const longStroke = (t.strokes || []).some(st => st.pts.length > 600);
	let fits = true;
	try {
		const kept = readView(VIEW_NS, { traces: [t] });
		fits = !!kept && JSON.stringify(kept.traces[0]).length >= JSON.stringify(t).length * 0.98;
	} catch { /* the shape said nothing; the stroke check stands */ }
	if (longStroke) return 'its longest stroke is more than the 300 points the save keeps of one, and will be shortened';
	if (!fits) return 'it is more than the save keeps of a trace, and will be clipped';
	return '';
}

/** The kept traces marked as lanes, handed to the router as the water
 *  the game sails -- once per change, since every route drawn so far
 *  is stale the moment a lane is. */
let lanesKey = '';
function syncLanes() {
	const lanes = mv.traces.filter(r => r.lane && r.points.length > 1).map(r => r.points.map(p => ({ x: p.x, y: p.y })));
	const key = JSON.stringify(lanes);
	if (key === lanesKey) return;
	lanesKey = key;
	setLanes(lanes);
	bent.clear();
}

export function doneSet() {
	if (mv.done.day !== barterDay()) mv.done = { day: barterDay(), ids: [] };
	return new Set(mv.done.ids);
}

// The lanes are the router's to know about whichever screen draws a
// route first, and they live in this screen's data -- which is in the
// profile now, and the profile is not loaded when this module is. So
// the read waits for the store: a tick after boot has opened it, and
// again on every change to it, which is also what brings a route
// synced from another device onto the chart. restore() is cheap once
// it has run: it compares the view's identity, then its text.
store.subscribe(() => restore());
if (typeof window !== 'undefined') setTimeout(restore, 0);
