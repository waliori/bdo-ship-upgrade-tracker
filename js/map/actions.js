// What the shell's event handling steers: the verbs a click on the
// Map calls, from picking what to show to stepping along the route.

import { courseOf } from '../courses.js';
import { errandPlan, dropErrands, startErrands, harbours } from './errands.js';
import { monsters, monsterByKey } from '../sea_monsters.js';
import { F } from '../fmt.js';
import { img } from '../ui-bits.js';
import { CLOSE_ZOOM } from '../map.js';
import { npcById, ports } from '../barter_npcs.js';
import { monsterArt } from '../monster_art.js';
import { openPicker } from '../picker.js';
import { snapshot, barterData } from '../ui-state.js';
import { mv, persist, doneSet, barterDay, restore } from './state.js';
import { stopsLive, suggestedIds, marksNow, barterKind } from './marks.js';
import { paintMap, flyTo, habitats } from './paint.js';
import { refreshSide } from './render.js';
import { stashRoute, stashLive, routeSeq } from './route.js';
import { endWriting, markTraceHost } from './trace.js';

/* What the shell's event handling steers. */

export function setMapPick(value) {
	mv.mapPick = value;
	// Picking something is asking where it is; sail there.
	mv.pendingFit = true;
}

/** Another screen pointing at the map: show this item's islands. */
export function mapShowItem(item) {
	mv.mapPick = item;
	mv.pinnedNpc = null;
	mv.pendingFit = true;
}

export function mapFit() {
	mv.pendingFit = true;
	paintMap();
}

export function mapZoomStep(step) {
	if (!mv.mapState) return;
	flyTo(mv.mapState.centre.x, mv.mapState.centre.y, mv.mapState.zoom + step * 0.7);
}

export function mapCentreOn(npcId) {
	const at = npcById.get(npcId);
	if (!at || !mv.mapState) return;
	mv.pinnedNpc = npcId;
	mv.pinnedStash = -1;
	mv.hoverNpc = null;
	flyTo(at.x, at.y, Math.max(mv.mapState.zoom, CLOSE_ZOOM));
}

export function setMapMode(id) {
	if (!['sail', 'route', 'today', 'hunt', 'trace'].includes(id)) return;
	mv.mode = id;
	// Leaving the trace tab puts the pen down and gives the chart's
	// markers their clicks back.
	if (mv.mode !== 'trace') {
		if (mv.editing) endWriting();
		mv.traceTool = null;
	}
	markTraceHost();
	persist();
	refreshSide();
	paintMap();
}

export function toggleMapPanel() {
	mv.panelOpen = !mv.panelOpen;
	persist();
	refreshSide();
}

export function toggleMapStop(npcId) {
	if (!npcById.has(npcId)) return;
	if (mv.stops.length && !stopsLive()) {
		// Plotting under a new view starts a new plot; the old one is
		// kept as "Previous route" rather than lost.
		stashRoute();
		mv.stops = [npcId];
		mv.runTrades = {};
	} else {
		mv.stops = mv.stops.includes(npcId) ? mv.stops.filter(id => id !== npcId) : [...mv.stops, npcId];
		delete mv.runTrades[npcId];
	}
	// The wharf calls were a planned run's, pinned to its order; edit
	// the stops and they no longer describe the route, so they go.
	mv.runStash = [];
	mv.stopsPick = mv.mapPick || '';
	persist();
	refreshSide();
	paintMap();
}

export function useSuggestedRoute() {
	stashRoute();
	mv.stops = suggestedIds(marksNow());
	mv.runTrades = {};
	mv.runStash = [];
	mv.stopsPick = mv.mapPick || '';
	persist();
	refreshSide();
	paintMap();
}

export function reverseMapRoute() {
	mv.stops = [...mv.stops].reverse();
	mv.runStash = [];
	persist();
	refreshSide();
	paintMap();
}

export function clearMapRoute() {
	mv.stops = [];
	mv.runTrades = {};
	mv.runStash = [];
	persist();
	refreshSide();
	paintMap();
}

export function toggleMapDone(npcId) {
	const dn = doneSet();
	if (dn.has(npcId)) dn.delete(npcId); else dn.add(npcId);
	mv.done = { day: barterDay(), ids: [...dn] };
	persist();
	refreshSide();
	paintMap();
}

export function closeMapTip() {
	mv.pinnedNpc = null;
	mv.pinnedStash = -1;
	paintMap();
}

/** A wharf call clicked on the chart: its card opens and the sea
 *  centres on it, the way a barterer's pin does. */
export function mapCentreOnStash(i) {
	const call = stashLive() ? mv.runStash[i] : null;
	if (!call || !mv.mapState) return;
	mv.pinnedStash = i;
	mv.pinnedNpc = null;
	mv.hoverNpc = null;
	flyTo(call.x, call.y, Math.max(mv.mapState.zoom, CLOSE_ZOOM));
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
			meta: mv.huntsOn.includes(m.key) ? 'shown' : '', group: 'Hunting grounds'
		}))
	];
	openPicker({
		title: 'What to look for',
		hint: 'The chart lights the islands that barter it, or the waters a species swims in.',
		items, selected: mv.mapPick || '',
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

function moveStep(i, fly = mv.follow) {
	const seq = routeSeq(marksNow());
	if (seq.length < 2) return;
	mv.stepIdx = ((i % seq.length) + seq.length) % seq.length;
	// The row in the list follows: lit, and brought into view.
	for (const row of document.querySelectorAll('[data-step-row]')) {
		const on = Number(row.dataset.i) === mv.stepIdx;
		row.classList.toggle('on', on);
		if (on) row.scrollIntoView({ block: 'nearest' });
	}
	if (fly) {
		const s = seq[mv.stepIdx];
		if (s) {
			// The card follows the camera: an island's trades, or what
			// goes ashore at a wharf call.
			mv.pinnedNpc = s.kind === 'npc' ? s.id : null;
			mv.pinnedStash = s.kind === 'stash' ? s.k : -1;
			mv.hoverNpc = null;
			mv.hoverStash = -1;
			flyTo(s.place.x, s.place.y, Math.max(mv.mapState.zoom, CLOSE_ZOOM - 0.15));
		}
	}
	paintMap();
}

export function mapStep(delta) {
	moveStep(mv.stepIdx + delta);
}

/** Step to `i`; `fly` takes the camera there whether or not it follows. */
export function mapStepTo(i, fly = undefined) {
	moveStep(i, fly === undefined ? mv.follow : fly);
}

export function mapFollowToggle() {
	mv.follow = !mv.follow;
	persist();
	if (mv.follow) moveStep(mv.stepIdx);
	else paintMap();
}

/** The route drawn faint but for the leg into the current stop, or whole. */
export function mapNextOnlyToggle() {
	mv.nextOnly = !mv.nextOnly;
	persist();
	paintMap();
}

/* The route's anchor. */

export function setMapStart(portId) {
	mv.startPort = ports.some(p => p.id === portId) ? portId : 0;
	persist();
	paintMap();
}

/** Switch a community course on, or off again by choosing it twice. */
export function setMapHabitats() {
	mv.habitatsOn = !mv.habitatsOn;
	persist();
	refreshSide();
	paintMap();
}

export function setMapLabels() {
	mv.labelsOn = !mv.labelsOn;
	persist();
	refreshSide();
	paintMap();
}

/** The barterers' own marks, off and on. */
export function setMapPins() {
	mv.pinsOn = !mv.pinsOn;
	persist();
	refreshSide();
	paintMap();
}

/** Fold the layer strip away, or back. */
export function toggleMapLayers() {
	mv.layersOpen = !mv.layersOpen;
	persist();
	refreshSide();
}

/** Every traced route at once, off and on. */
export function setMapTraces() {
	mv.tracesOn = !mv.tracesOn;
	persist();
	refreshSide();
	paintMap();
}

/** The side panel to the other edge -- right-handed on a phone, or
 *  clear of whatever the left of the chart is showing. */
export function flipMapSide() {
	mv.sideRight = !mv.sideRight;
	persist();
	const host = document.querySelector('[data-map]');
	if (host) host.classList.toggle('side-right', mv.sideRight);
	refreshSide();
}

export function setMapWharves(kind) {
	if (kind !== 'wharf' && kind !== 'guild') return;
	mv.wharvesOn = mv.wharvesOn.includes(kind) ? mv.wharvesOn.filter(k => k !== kind) : [...mv.wharvesOn, kind];
	persist();
	refreshSide();
	paintMap();
}

export function setMapCourse(id) {
	if (!courseOf(id)) return;
	mv.coursesOn = mv.coursesOn.includes(id) ? mv.coursesOn.filter(x => x !== id) : [...mv.coursesOn, id];
	persist();
	refreshSide();
	paintMap();
}

/** Switch a species' grounds on or off. */
/**
 * The day's errands, on or off.
 *
 * Switching it on is what works the loop out -- a score of calls whose
 * legs have to be searched round the islands -- so the panel is
 * repainted first, with the button showing pressed, and the plan made
 * after: otherwise the page hangs on a press that has not visibly
 * happened yet.
 */
export function setMapErrands() {
	const on = mv.coursesOn.includes('dailies');
	if (on) {
		mv.coursesOn = mv.coursesOn.filter(x => x !== 'dailies');
		dropErrands();
		persist();
		refreshSide();
		paintMap();
		return;
	}
	mv.coursesOn = [...mv.coursesOn, 'dailies'];
	persist();
	startErrands();
	refreshSide();
	afterPaint(() => {
		errandPlan();
		refreshSide();
		paintMap();
	});
}

/**
 * Run something once the browser has actually drawn.
 *
 * A timeout of nought is not enough: it runs before the frame, so the
 * "working it out" line never reaches the screen and the press looks
 * like it did nothing for six seconds. A frame, then a task inside it.
 */
function afterPaint(fn) {
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(fn, 0));
	else setTimeout(fn, 0);
}

/** The harbour the day starts and ends at, or which repeatables it is
 *  for: either one makes the loop a different loop. */
export function setMapErrandFrom(name) {
	if (!harbours().some(h => h.name === name)) return;
	mv.errandFrom = name;
	dropErrands();
	persist();
	if (!mv.coursesOn.includes('dailies')) return refreshSide();
	startErrands();
	refreshSide();
	afterPaint(() => { errandPlan(); refreshSide(); paintMap(); });
}

export function setMapErrandKinds(id) {
	if (id !== 'both' && id !== 'daily' && id !== 'weekly') return;
	mv.errandKinds = id;
	dropErrands();
	persist();
	if (!mv.coursesOn.includes('dailies')) return refreshSide();
	startErrands();
	refreshSide();
	afterPaint(() => { errandPlan(); refreshSide(); paintMap(); });
}

export function setMapHunt(key) {
	// A shared habitat marker names several species: all on, or all off.
	const keys = String(key).split(',').filter(k => monsterByKey[k]);
	if (!keys.length) return;
	const allOn = keys.every(k => mv.huntsOn.includes(k));
	mv.huntsOn = allOn ? mv.huntsOn.filter(x => !keys.includes(x)) : [...new Set([...mv.huntsOn, ...keys])];
	persist();
	refreshSide();
	paintMap();
}

/** From a quest: show where its monster lives -- the Hunt tab open,
 *  that species on, the chart fitted to it. Nothing else switched off. */
export function showHunt(key) {
	restore();
	if (!monsterByKey[key]) return;
	if (!mv.huntsOn.includes(key)) mv.huntsOn = [...mv.huntsOn, key];
	mv.mode = 'hunt';
	mv.panelOpen = true;
	// Sail to that species' waters, not to everything on the chart.
	const m = monsterByKey[key];
	mv.pendingFit = { points: (m.points.length ? m.points : m.zones || []).map(([x, y]) => ({ x, y })) };
	persist();
}

export function setMapReturn(on) {
	mv.returnHome = on === true;
	persist();
	paintMap();
}

export function mapPortClick(portId) {
	setMapStart(mv.startPort === portId ? 0 : portId);
	refreshSide();
}

/** Bring the chart back to the view a dormant plot was made under. */
export function reviveMapRoute() {
	mv.mapPick = mv.stopsPick || null;
	mv.pendingFit = true;
	mv.pinnedNpc = null;
}

export function setMapKind(id) {
	if (!['all', 'material', 'trade'].includes(id)) return;
	mv.kindFilter = id;
	persist();
	refreshSide();
	paintMap();
}
