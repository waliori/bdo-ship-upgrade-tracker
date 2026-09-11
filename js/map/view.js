// The box itself: where a pointer falls in it, the chart over the
// whole screen, the ruler, the coordinates readout and the minimap's
// switch.

import { F } from '../fmt.js';
import { routePath, project } from '../map.js';
import { MAX_ZOOM } from '../barter_npcs.js';
import { toast } from '../dialogs.js';
import * as store from '../state.js';
import { pathLength, sailRange, fmtRange, fmtDistance } from '../sailing.js';
import { toGame } from '../worldmap.js';
import { mv, persist } from './state.js';
import { enterTerrain, exitTerrain, terrainOn, terrainTrouble, setStyle, terrainStyle, setTilt, tilt as tiltBy, tiltNow, MAX_PITCH } from './terrain.js';
import { marksNow, seaBent } from './marks.js';
import { paintMap, clearTiles } from './paint.js';
import { miniHTML } from './render.js';
import { routeSpeed, sailCal } from './route.js';

/**
 * Where a screen point falls in the map box's own space. The two are
 * the same offset until the chart is turned on its side for a phone
 * held upright (see enterFull): then the box's x runs down the screen
 * and its y runs leftward, and every pointer has to be turned back.
 */
export function inBox(host, clientX, clientY) {
	const r = host.getBoundingClientRect();
	if (!mv.fullTurned) return { x: clientX - r.left, y: clientY - r.top };
	return { x: clientY - r.top, y: r.right - clientX };
}

/** A movement on the screen, as a movement in the box. */
export function boxDelta(dx, dy) {
	return mv.fullTurned ? { x: dy, y: -dx } : { x: dx, y: dy };
}

export function atSea(host, clientX, clientY) {
	const at = inBox(host, clientX, clientY);
	const p = unproject(hostSize(host), at.x, at.y);
	return { x: Math.round(p.x), y: Math.round(p.y) };
}

// The box's own size, which a turned box keeps -- its bounding rect is
// the screen's shape, not its own.
export const hostSize = host => ({ w: host.clientWidth, h: host.clientHeight });

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
	if (mv.fullOn) return;
	mv.fullOn = true;
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
	if (!mv.fullOn) return;
	mv.fullOn = false;
	mv.fullTurned = false;
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
	return mv.fullOn ? exitFull() : enterFull();
}

export function mapIsFull() {
	return mv.fullOn;
}

/** Turned on its side when the phone is held upright: a screen the
 *  browser turned for us, or one the person turned, is wide already. */
export function settleTurn() {
	mv.fullTurned = mv.fullOn && phone() && upright();
	dressFull();
	paintMap();
}

/** The classes that make it so, on the box and on the page around it. */
function dressFull() {
	const host = document.querySelector('[data-map]');
	if (host) {
		host.classList.toggle('full', mv.fullOn);
		host.classList.toggle('turned', mv.fullTurned);
	}
	document.body.classList.toggle('map-full', mv.fullOn);
	document.body.classList.toggle('map-turned', mv.fullTurned);
	for (const b of document.querySelectorAll('.map-zoom [data-act="map-full"]')) b.setAttribute('aria-pressed', String(mv.fullOn));
}

/* ------------------------------------------------------------------ *
 * the chart stood up
 * ------------------------------------------------------------------ */

/**
 * Into the terrain view and back out again.
 *
 * Nothing about the chart's own state changes on the way: the same
 * centre, the same zoom, the same everything drawn on it. What changes
 * is who answers "where does this world position land on the screen" --
 * so the switch lands on the same water you were looking at, seen from
 * a different chair.
 */
export async function toggle3D() {
	const host = document.querySelector('[data-map]');
	if (!host) return;
	if (terrainOn()) {
		exitTerrain();
		mv.threeD = false;
		dress3D();
		persist();
		paintMap();
		return;
	}
	setTilt(mv.pitch, mv.bearing);
	const up = await enterTerrain(host);
	if (!up) {
		toast(terrainTrouble() || 'The terrain view is not available here');
		return;
	}
	mv.threeD = true;
	// The flat squares are still in the layer, under the ground that has
	// just been drawn; they would show through every hole in a coastline.
	clearTiles();
	dress3D();
	persist();
	paintMap();
}

/** A chart left standing up comes back standing up: the preference
 *  survives the reload, the WebGL context does not, so the first paint
 *  after a render puts it back. Failing quietly matters here -- a
 *  browser that cannot do it should show the flat chart, not an error
 *  on every repaint. */
let reviving = false;
export function restore3D() {
	if (reviving || !mv.threeD || terrainOn()) return;
	const host = document.querySelector('[data-map]');
	if (!host) return;
	reviving = true;
	setTilt(mv.pitch, mv.bearing);
	enterTerrain(host).then(up => {
		reviving = false;
		if (!up) { mv.threeD = false; return; }
		clearTiles();
		dress3D();
		paintMap();
	}, () => { reviving = false; mv.threeD = false; });
}

/** The lean, from a drag or a key. Persisted, so the view comes back
 *  the way it was left. */
export function tiltMap(dPitch, dBearing) {
	if (!terrainOn()) return;
	tiltBy(dPitch, dBearing);
	const now = tiltNow();
	mv.pitch = now.pitch;
	mv.bearing = now.bearing;
	persist();
	paintMap();
}

/** Straight down and facing north: the flat chart's own angle, which is
 *  the way back to a view you can read coordinates off. */
export function levelMap() {
	if (!terrainOn()) return;
	setTilt(0, 0);
	mv.pitch = 0;
	mv.bearing = 0;
	persist();
	paintMap();
}

export function setMapStyle(style) {
	setStyle(style);
	for (const b of document.querySelectorAll('[data-act="map-style"]')) {
		b.setAttribute('aria-pressed', String(b.dataset.id === terrainStyle()));
	}
	paintMap();
}

export const mapStyleNow = () => terrainStyle();
export const map3D = () => terrainOn();
export const maxPitch = () => MAX_PITCH;

function dress3D() {
	const host = document.querySelector('[data-map]');
	if (host) host.classList.toggle('three-d', mv.threeD);
	for (const b of document.querySelectorAll('[data-act="map-3d"]')) b.setAttribute('aria-pressed', String(mv.threeD));
	const bar = document.querySelector('[data-map-tiltbar]');
	if (bar) bar.hidden = !mv.threeD;
}

/* ------------------------------------------------------------------ *
 * the ruler
 * ------------------------------------------------------------------ */

/** Show or hide the minimap. Hidden, it keeps the place it was dragged to. */
export function toggleMini() {
	mv.miniOn = !mv.miniOn;
	persist();
	const host = document.querySelector('[data-map]');
	if (host) {
		const old = host.querySelector('[data-map-mini]');
		if (old) old.remove();
		if (mv.miniOn) host.insertAdjacentHTML('beforeend', miniHTML(marksNow()));
	}
	const btn = document.querySelector('[data-act="map-mini"][aria-pressed]');
	if (btn) btn.setAttribute('aria-pressed', String(mv.miniOn));
	paintMap();
}

export function toggleMeasure() {
	mv.measuring = !mv.measuring;
	if (!mv.measuring) mv.measurePts = [];
	const btn = document.querySelector('[data-act="map-measure"]');
	if (btn) btn.setAttribute('aria-pressed', String(mv.measuring));
	const host = document.querySelector('[data-map]');
	if (host) host.classList.toggle('measuring', mv.measuring);
	if (mv.measuring) toast('Click two points on the sea');
	paintMap();
}

/** The world point under a screen position. */
function unproject(size, left, top) {
	const scale = Math.pow(2, MAX_ZOOM - mv.mapState.zoom);
	return {
		x: mv.mapState.centre.x + (left - size.w / 2) * scale,
		y: mv.mapState.centre.y + (top - size.h / 2) * scale
	};
}

export function measureAt(host, clientX, clientY) {
	const at = inBox(host, clientX, clientY);
	const p = unproject(hostSize(host), at.x, at.y);
	mv.measurePts = mv.measurePts.length >= 2 ? [p] : [...mv.measurePts, p];
	paintMap();
}

export function paintMeasure(layer, size) {
	let svg = layer._measure;
	if (!mv.measurePts.length) {
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
	const world = mv.measurePts.length === 2 ? seaBent(mv.measurePts) : mv.measurePts;
	const pts = world.map(p => project(mv.mapState, size, p.x, p.y));
	const d = pts.length > 1 ? routePath(pts, size, 0) : `M${pts[0].left - 4},${pts[0].top}a4,4 0 1,0 8,0a4,4 0 1,0 -8,0`;
	svg.children[0].setAttribute('d', d);
	const label = layer._measureLabel;
	if (mv.measurePts.length === 2) {
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
export function paintCoords(host, clientX, clientY) {
	const el = host.querySelector('[data-map-coords]');
	if (!el || !mv.mapState) return;
	const at = inBox(host, clientX, clientY);
	const p = unproject(hostSize(host), at.x, at.y);
	const g = toGame(p.x, p.y);
	el.textContent = `X ${F(Math.round(g.x))} · Z ${F(Math.round(g.z))}`;
	el.hidden = false;
}
