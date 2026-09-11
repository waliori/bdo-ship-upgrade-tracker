// Painting: the tiles, pins, ports, wharves, labels, grounds, courses,
// the route and its ship, the cards and the step player, drawn into the
// live box on every frame; and the flight that carries the view.

import { sailFor } from '../screen-barter.js';
import { courseById } from '../courses.js';
import { monsters, monsterByKey } from '../sea_monsters.js';
import { esc, F, FC } from '../fmt.js';
import { img } from '../ui-bits.js';
import { frame, pan, zoomAt, clampView, fitTo, routePath, project, placeTile, zoomRange, levelFor, tilesFor } from '../map.js';
import { npcs, npcById, ports, TILE } from '../barter_npcs.js';
import { openSea } from '../searoute.js';
import { wharves } from '../wharves.js';
import { habitatsOf, habitatsOfMany } from '../habitats.js';
import { monsterArt } from '../monster_art.js';
import { parleyPerTrade, npcGate, npcOpen } from '../barter.js';
import { barterData, barterProfile } from '../ui-state.js';
import { mv, doneSet } from './state.js';
import { mapZoomStep } from './actions.js';
import { marksNow, stopsLive, seaBent, routeWorld, straightLegs, goodsOf, barterKind } from './marks.js';
import { npcBox } from './render.js';
import { routeSeq, n1, stashLive } from './route.js';
import { paintTrace } from './trace.js';
import { inBox, hostSize, paintMeasure, restore3D } from './view.js';
import { drawTerrain, terrainOn, prefetch as prefetchTerrain } from './terrain.js';

/* ------------------------------------------------------------------ *
 * painting
 * ------------------------------------------------------------------ */

/** One repaint per frame however fast the events report: a trackpad
 *  delivers several moves per frame, a pointer crossing a row of pins
 *  fires enter/leave in pairs, and each paint is work. Everything that
 *  repaints in response to input goes through here. */
let paintRaf = null;
export function schedulePaint() {
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
	if (!mv.mapState) return;
	if (evt.target.closest('.map-side, .map-tip, .map-steps')) return;   // their scroll, not ours
	evt.preventDefault();
	cancelFly();
	// Anchored under the cursor, and continuous: a notch of the wheel is
	// a quarter-step of magnification, not a lurch to the next level.
	const at = inBox(evt.currentTarget, evt.clientX, evt.clientY);
	zoomMoving();
	if (zoomAt(mv.mapState, -evt.deltaY * 0.0024, hostSize(evt.currentTarget), at.x, at.y)) schedulePaint();
}

/**
 * A zoom gesture is under way. The level on screen is held -- its
 * tiles carry the magnification, scaled -- and the level the zoom
 * lands on is asked for only once the wheel has been quiet for a
 * moment. A wheel from 3 to 7 fetches 7, not 4, 5 and 6 on the way.
 */
export function zoomMoving() {
	if (mv.heldLevel === null) mv.heldLevel = mv.drawnLevel === null ? levelFor(mv.mapState.zoom) : mv.drawnLevel;
	clearTimeout(mv.settleTimer);
	mv.settleTimer = setTimeout(zoomSettled, 160);
}

function zoomSettled() {
	mv.settleTimer = null;
	mv.heldLevel = null;
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
				pan(mv.mapState, ...moves[evt.key]);
				schedulePaint();
			} else if (evt.key === '+' || evt.key === '=') { evt.preventDefault(); mapZoomStep(1); }
			else if (evt.key === '-' || evt.key === '_') { evt.preventDefault(); mapZoomStep(-1); }
		});
	}

	// Left standing up last time: put it back before anything is placed.
	if (mv.threeD && !terrainOn()) restore3D();

	const marks = marksNow();

	// A fit was asked for; now the box exists to measure, sail there.
	if (mv.pendingFit) {
		const only = mv.pendingFit.points;
		mv.pendingFit = false;
		// A copy: the chart's own list must not grow course or monster points.
		const points = marks.size ? [...marks.keys()].map(id => npcById.get(id)).filter(Boolean) : [...npcs];
		for (const id of mv.coursesOn) points.push(...courseById[id].points);
		for (const k of mv.huntsOn) points.push(...monsterByKey[k].points.map(([x, y]) => ({ x, y })));
		const probe = { zoom: mv.mapState.zoom, centre: { ...mv.mapState.centre } };
		fitTo(probe, size, only && only.length ? only : points);
		flyTo(probe.centre.x, probe.centre.y, probe.zoom);
	}
	// The view never leaves the charted sea, whatever the gesture did.
	clampView(mv.mapState, size);

	// In motion, the level already on screen is what is drawn, scaled;
	// at rest, the nearest. A flight also asks for where it is going.
	const level = mv.heldLevel === null ? levelFor(mv.mapState.zoom) : mv.heldLevel;
	const { tiles, pins } = frame(mv.mapState, size, marks, level);
	mv.drawnLevel = level;
	const ahead = mv.flightTo ? tilesFor(mv.flightTo, size, levelFor(mv.flightTo.zoom)).filter(t => !t.ahead) : [];
	// A flight asks for the ground it is heading for as well, so an
	// island flown to has its relief when it arrives rather than a
	// moment later.
	if (mv.flightTo && terrainOn()) prefetchTerrain(mv.flightTo, size);
	// A layer that faults says so in the console and leaves the others
	// to paint; nothing on the chart depends on another layer's luck.
	const guarded = (fn, ...args) => { const t0 = performance.now(); try { fn(...args); } catch (err) { console.warn(`[map] ${fn.name} failed:`, err); } if (window.__paintProf) window.__paintProf[fn.name] = (window.__paintProf[fn.name] || 0) + performance.now() - t0; };

	// The route as it is sailed: the islands with the run's wharf calls
	// among them. The step player walks it, the pins take their numbers
	// from it, and the storage marks are its own entries.
	const seq = routeSeq(marks);
	const key = `${seq.map(s => (s.kind === 'npc' ? s.id : `w${s.k}`)).join('.')}|${mv.startPort}|${mv.returnHome}`;
	if (key !== mv.stepKey) { mv.stepKey = key; mv.stepIdx = 0; }
	const current = seq.length > 1 ? seq[Math.min(mv.stepIdx, seq.length - 1)] : null;
	const currentId = current && current.kind === 'npc' ? current.id : null;
	const nums = new Map(seq.filter(s => s.kind === 'npc').map(s => [s.id, s.n]));

	// Stood up, the ground is the ground: the terrain draws into its own
	// canvas behind the layer and the flat squares stand down. Every
	// layer after this one is placed by project(), which the terrain
	// view has taken over, so they land on the ground rather than beside
	// it -- see setProjector in map.js.
	if (terrainOn()) guarded(drawTerrain, mv.mapState, size);
	else guarded(paintTiles, layer, tiles, size, { hold: mv.heldLevel !== null, ahead });
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
/** Take the flat squares out of the layer. Standing the chart up draws
 *  ground where they were, and a square left behind shows through every
 *  hole in a coastline. */
export function clearTiles() {
	const layer = document.querySelector('[data-map-layer]');
	if (!layer) return;
	for (const d of layer.querySelectorAll('.map-tiles')) d.remove();
	layer._tiles = null;
	layer._levels = null;
}

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
		place(d, z, e.x, e.y, placeTile(mv.mapState, size, z, e.x, e.y));
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
	if (!mv.pinsOn) pins = [];
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
			btn.addEventListener('pointerenter', () => { mv.hoverNpc = p.id; schedulePaint(); });
			btn.addEventListener('pointerleave', () => { mv.hoverNpc = null; schedulePaint(); });
			pool.set(p.id, btn);
			layer.appendChild(btn);
		}
		const m = p.mark;
		const what = m ? [...m.items.keys()] : [];
		const stopAt = stopsLive() ? mv.stops.indexOf(p.id) : -1;
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
		const sa = stopsLive() ? mv.stops.indexOf(a.id) : -1;
		const sb = stopsLive() ? mv.stops.indexOf(b.id) : -1;
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
	const pts = seaBent(routeWorld(marks)).map(p => project(mv.mapState, size, p.x, p.y));
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
	// The legs the router gave up on, over the line in a warning dash,
	// so a line through a headland is never mistaken for a passage.
	let unrouted = svg._unrouted;
	if (!unrouted) {
		unrouted = svg._unrouted = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		unrouted.setAttribute('class', 'map-route-unrouted');
		svg.appendChild(unrouted);
	}
	unrouted.setAttribute('d', straightLegs(seaBent(routeWorld(marks)))
		.map(l => routePath([l.from, l.to].map(p => project(mv.mapState, size, p.x, p.y)), size, 0)).filter(Boolean).join(' '));
	const world = routeWorld(marks);
	const seq = routeSeq(marks);
	const at = seq.length > 1 ? Math.min(mv.stepIdx, seq.length - 1) + (world.length > seq.length ? 1 : 0) : -1;
	if (mv.nextOnly && d && at > 0 && at < world.length) {
		const leg = seaBent([world[at - 1], world[at]]).map(p => project(mv.mapState, size, p.x, p.y));
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
	if (ship._for !== mv.stepKey) {
		ship._for = mv.stepKey;
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
	if (!mv.coursesOn.length) { box.innerHTML = ''; return; }
	let html = '';
	for (const id of mv.coursesOn) {
		const c = courseById[id];
		if (!c) continue;
		const d = routePath(seaBent(c.points).map(p => project(mv.mapState, size, p.x, p.y)), size, 0);
		html += `<svg class="map-route map-course-line course-${esc(id)}">
			<path class="map-course-glow" d="${d}"></path><path class="map-course-path" d="${d}"></path></svg>`;
		for (const p of c.points) {
			if (!p.name) continue;
			const at = project(mv.mapState, size, p.x, p.y);
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
	if (!mv.huntsOn.length) { if (cv) cv.style.display = 'none'; layer._huntAt = null; return; }
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
	// Flat, a pan slides the drawing rather than redrawing it. Stood up
	// there is no such shortcut: every point moves by a different amount
	// under a camera with a horizon, so the grounds are drawn afresh on
	// every frame -- which is also why the fast paths below are skipped
	// rather than adjusted.
	const was = terrainOn() ? null : layer._huntAt;
	const origin = project(mv.mapState, size, 0, 0);
	const key = `${mv.huntsOn.join(',')}|${size.w}x${size.h}`;
	if (was && was.key === key) {
		const r = Math.pow(2, mv.mapState.zoom - was.zoom);
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
	layer._huntAt = { key, zoom: mv.mapState.zoom, left: origin.left, top: origin.top };
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
	const r = Math.max(2.5, Math.min(6, 1.2 * Math.pow(2, mv.mapState.zoom - 4)));
	// A ground as an area first: the outline round each cluster of
	// spawns, filled faintly and padded by about a spawn's reach, so a
	// species' water reads at a glance the way the game's own map
	// shades it. The points go on top.
	const c = mv.mapState.centre;
	const o = project(mv.mapState, size, c.x, c.y), o2 = project(mv.mapState, size, c.x + 1000, c.y);
	const pxPerK = Math.abs(o2.left - o.left);
	const pad = Math.max(6, Math.min(40, 1.5 * pxPerK));
	for (const key of mv.huntsOn) {
		const m = monsterByKey[key];
		if (!m || !m.points.length) continue;
		for (const h of habitats(m)) {
			if (!h.hull || h.hull.length < 2) continue;
			const pts = h.hull.map(([x, y]) => project(mv.mapState, size, x, y));
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
	for (const key of mv.huntsOn) {
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
				const at = project(mv.mapState, size, x, y);
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
			const at = project(mv.mapState, size, x, y);
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
		const at = project(mv.mapState, size, p.x, p.y);
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
		el.classList.toggle('start', p.id === mv.startPort);
		el._at = { left: Math.round(at.left), top: Math.round(at.top) };
		el.style.transform = `translate(${el._at.left}px, ${el._at.top}px)`;
	}
}

const habitatCache = new Map();
export function habitats(m) {
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
	if (mv.habitatsOn) {
		const seen = habitatMarkers()
			.map(mk => ({ mk, at: project(mv.mapState, size, mk.x, mk.y) }))
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
			const on = keys.some(k => mv.huntsOn.includes(k));
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
	const show = mv.labelsOn && mv.mapState.zoom >= 4.4;
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
		.map(l => ({ l, at: project(mv.mapState, size, l.x, l.y) }))
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
		const on = mv.wharvesOn.includes(w.kind);
		const at = project(mv.mapState, size, w.x, w.y);
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
	const call = mv.runStash[wk];
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
		const at = project(mv.mapState, size, g.x, g.y);
		const off = at.left < -60 || at.top < -60 || at.left > size.w + 60 || at.top > size.h + 60;
		live.add(g.key);
		let el = pool.get(g.key);
		if (!el) {
			el = document.createElement('button');
			el.className = 'map-stash';
			el.dataset.act = 'map-stash';
			el.innerHTML = '<span class="map-stash-dot">⚓</span><span class="map-stash-badge"></span>'
				+ '<span class="map-stash-name"><span class="map-stash-who"></span><span class="map-stash-at"></span></span>';
			el.addEventListener('pointerenter', () => { mv.hoverStash = Number(el.dataset.i); mv.hoverNpc = null; schedulePaint(); });
			el.addEventListener('pointerleave', () => { mv.hoverStash = -1; schedulePaint(); });
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
	const cur = seq[Math.min(mv.stepIdx, seq.length - 1)];
	const sig = `${mv.stepKey}|${mv.stepIdx}|${mv.follow}|${mv.nextOnly}`;
	if (el._sig === sig) return;
	el._sig = sig;
	el.hidden = false;
	el.innerHTML = `<button class="map-step-nav" data-act="map-step-prev" aria-label="Previous stop">‹</button>
		<div class="map-step-chips">${seq.map((s, i) =>
			`<button class="map-step-chip${i === mv.stepIdx ? ' on' : ''}${s.kind === 'stash' ? ' stash' : ''}" data-act="map-step" data-i="${i}"
				title="${esc(s.place.at)} · ${esc(s.place.name)}${s.kind === 'stash' ? ' — a wharf call' : ''}">${i + 1}</button>`).join('')}</div>
		<button class="map-step-nav" data-act="map-step-next" aria-label="Next stop">›</button>
		<span class="map-step-name">${esc(cur.place.at)}${cur.kind === 'stash' ? ' wharf' : ''} · ${esc(cur.place.name)}</span>
		<button class="map-step-follow${mv.follow ? ' on' : ''}" data-act="map-follow">follow</button>
		<button class="map-step-follow${mv.nextOnly ? ' on' : ''}" data-act="map-next-only" title="Draw the route faint but for the leg into this stop">next leg</button>`;
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
	const key = ['stash', g.key, pinned, g.calls.map(s => `${s.n}:${s.place.drops.length}:${s.place.sale}:${(s.place.quests || []).length}:${s.place.rations ? 'r' : ''}`).join(',')].join('|');
	if (tip._for !== key) {
		tip._for = key;
		// Each call is its own block -- the stop, what it sells, what it
		// leaves -- so a wharf the run comes back to eight times reads as
		// eight calls, not one long list of goods.
		const visit = s => {
			const c = s.place;
			const rows = c.drops.map(d => `<div class="map-tip-row">
				<span class="map-tip-side ashore" data-peek="${esc(d.item)}"><span class="map-io ashore">${img(d.item, 'map-icon')}</span><span>${esc(d.item)}</span></span>
				<span class="map-tip-tries">${n1(d.n)}×</span>
			</div>`).join('');
			const questRows = (c.quests || []).map(q => `<div class="map-tip-sub quest">📜 ${esc(q)}</div>`).join('');
			return `<div class="map-tip-call">
				<div class="map-tip-call-head"><span class="map-tip-k stash">Stop ${s.n}</span>${c.sale ? `<span class="map-tip-sub sell">sells ${n1(c.sale)} [Level 7]${c.silver ? ` for ${FC(c.silver)}` : ''}</span>` : ''}</div>
				${questRows}
				${c.rations ? '<div class="map-tip-sub">🍞 rations bought here — the pool is full again</div>' : ''}
				${rows ? `<div class="map-tip-sub ashore-k">leaves in storage</div><div class="map-tip-drops">${rows}</div>` : (c.sale || questRows || c.rations ? '' : '<div class="map-tip-sub none">Nothing left ashore this time.</div>')}
			</div>`;
		};
		tip.innerHTML = `<div class="map-tip-head"><span class="map-tip-name">⚓ ${esc(g.name)}</span>
			${pinned ? '<button class="map-x" data-act="map-tip-close" aria-label="Close">×</button>' : ''}</div>
			<div class="map-tip-sub">${esc(g.at)} wharf · ${g.calls.length > 1
				? `the run calls ${g.calls.length} times`
				: 'a pause, not a barter'}</div>
			<div class="map-tip-calls">${g.calls.map(visit).join('')}</div>`;
	}
	tip.classList.add('stash');
	tip.classList.toggle('pinned', pinned);
	tip.hidden = false;
	const at = project(mv.mapState, size, g.x, g.y);
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
	if (mv.mode === 'trace') { tip.hidden = true; tip._for = null; return; }
	// A wharf call has its own card: no trades, no Parley, no "add
	// stop" -- what goes ashore there and what the hold fetches.
	// Whatever the pointer is over wins over whatever was pinned, so a
	// pinned call does not sit over the island you are reading.
	const wk = stashLive() ? (mv.hoverStash >= 0 ? mv.hoverStash : mv.hoverNpc ? -1 : mv.pinnedStash) : -1;
	const group = wk >= 0 ? stashGroup(wk, routeSeq(marks)) : null;
	if (group) {
		paintStashTip(host, tip, size, group, mv.hoverStash < 0);
		return;
	}
	const id = mv.hoverNpc || mv.pinnedNpc;
	const npc = id && npcById.get(id);
	if (!npc) {
		tip.hidden = true;
		tip._for = null;
		return;
	}

	const pinned = !mv.hoverNpc && !!mv.pinnedNpc;
	const m = marks.get(id);
	const dn = doneSet();
	const sf = mv.runTrades[id] ? sailFor(id) : null;
	const key = [id, mv.mode, pinned, stopsLive() ? mv.stops.indexOf(id) : -1, dn.has(id), m ? m.items.size : 0, sf ? `${sf.done}:${sf.paid}` : ''].join('|');
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
		// An island the barter count has not opened: said before anything
		// it deals, since none of it is for sale to this sailor yet.
		const gate = !npcOpen(id, prof.barterCount)
			? `<div class="map-tip-sub shut">Opens at ${F(npcGate(id))} Total Barters — ${F(npcGate(id) - prof.barterCount)} more</div>`
			: '';
		const sub = `${esc(npc.name)} · ${rate}`
			+ (pool > 1 ? ` · draws 1 of its ${pool} offers a refresh` : '');
		const onRoute = stopsLive() && mv.stops.includes(id);
		const btns = `<div class="map-tip-btns">
			<button class="ghost-btn" data-act="map-stop" data-npc="${id}">${onRoute ? '− Remove stop' : '+ Add stop'}</button>
			${m ? `<button class="ghost-btn" data-act="map-done" data-npc="${id}">${dn.has(id) ? '✓ Sailed' : 'Mark sailed'}</button>` : ''}
		</div>`;
		tip.innerHTML = `<div class="map-tip-head"><span class="map-tip-name">${esc(npc.at)}</span>
			${pinned ? `<button class="map-x" data-act="map-tip-close" aria-label="Close">×</button>` : ''}</div>
			<div class="map-tip-sub">${sub}</div>
			${gate}
			${mv.runTrades[id] ? runTip(mv.runTrades[id], id) : ''}
			${rows || (mv.runTrades[id] ? '' : '<div class="map-tip-sub none">Nothing on your list here.</div>')}
			${pinned ? btns : ''}`;
	}

	const at = project(mv.mapState, size, npc.x, npc.y);
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
	const scale = Math.pow(2, 9 - mv.mapState.zoom);
	const wx0 = mv.mapState.centre.x - size.w / 2 * scale, wx1 = mv.mapState.centre.x + size.w / 2 * scale;
	const wy0 = mv.mapState.centre.y - size.h / 2 * scale, wy1 = mv.mapState.centre.y + size.h / 2 * scale;
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
export function flyTo(x, y, zoom = mv.mapState.zoom) {
	const host = document.querySelector('[data-map]');
	if (!host || !mv.mapState) return;
	const size = { w: host.clientWidth, h: host.clientHeight };
	const from = { zoom: mv.mapState.zoom, x: mv.mapState.centre.x, y: mv.mapState.centre.y };
	const probe = {
		zoom: Math.min(zoomRange.max, Math.max(zoomRange.min, zoom)),
		centre: { x, y }
	};
	clampView(probe, size);   // do not fly somewhere the clamp will yank back from
	cancelFly();
	// The level on screen carries the flight; the level at the far end
	// is asked for now, so it is there when the flight lands.
	mv.heldLevel = mv.drawnLevel === null ? levelFor(from.zoom) : mv.drawnLevel;
	mv.flightTo = probe;
	let t0 = null;                // rAF hands us the clock; no other is needed
	const step = t => {
		if (t0 === null) t0 = t;
		const p = Math.min(1, (t - t0) / 550);
		const e = 1 - Math.pow(1 - p, 3);
		mv.mapState.zoom = from.zoom + (probe.zoom - from.zoom) * e;
		mv.mapState.centre.x = from.x + (probe.centre.x - from.x) * e;
		mv.mapState.centre.y = from.y + (probe.centre.y - from.y) * e;
		mv.fly = p < 1 ? requestAnimationFrame(step) : null;
		if (!mv.fly) { mv.heldLevel = null; mv.flightTo = null; }
		paintMap();
	};
	mv.fly = requestAnimationFrame(step);
}

export function cancelFly() {
	if (mv.fly) cancelAnimationFrame(mv.fly);
	mv.fly = null;
	mv.flightTo = null;
	if (mv.settleTimer === null) mv.heldLevel = null;
}
