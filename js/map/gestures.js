// The gestures that move the chart: drag, pinch, tap, the pen and the
// marks carried under it, the minimap's grip, a file dropped on the sea.

import { pan, zoomAt } from '../map.js';
import { toast } from '../dialogs.js';
import { view } from '../ui-state.js';
import { mv, persist } from './state.js';
import { cancelFly, schedulePaint, zoomMoving, paintMap, flyTo } from './paint.js';
import { refreshSide, refreshSideList, npcBox } from './render.js';
import { importRoute } from './route.js';
import { markBySeq, penStart, penMove, onWater, penEnd, traceAdd, textAdd, areaAdd } from './trace.js';
import { atSea, inBox, hostSize, paintCoords, boxDelta, measureAt, settleTurn, exitFull, tiltMap } from './view.js';
import { terrainOn, seaAt } from './terrain.js';

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
	const CHROME = '.map-side, .map-side-pill, .map-tip, .map-mini, .map-steps, .map-trace-write, .map-full-bar, .map-tilt';
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
		const grabbed = mv.mode === 'trace' && evt.target.closest('[data-mark]');
		if (grabbed) {
			const kind = grabbed.dataset.mark, seq = Number(grabbed.dataset.seq);
			const m = markBySeq(kind, seq);
			if (m) {
				mv.markDrag = { kind, seq, from: atSea(host, evt.clientX, evt.clientY), x: m.x, y: m.y, px: evt.clientX, py: evt.clientY, moved: false };
				host.setPointerCapture(evt.pointerId);
				host.classList.add('moving-mark');
				return;
			}
		}
		pressed = { x: evt.clientX, y: evt.clientY, host };
		touching.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
		// The pen draws instead of panning: one finger, one stroke.
		if (mv.traceTool === 'pen' && touching.size === 1) {
			penStart(host, evt.clientX, evt.clientY);
			host.setPointerCapture(evt.pointerId);
			return;
		}
		// A second finger while the pen is down means a pinch, not a
		// longer line: the stroke so far is dropped rather than kept
		// half-drawn, and the two fingers zoom.
		if (mv.penStroke && touching.size === 2) mv.penStroke = null;
		if (touching.size === 2) {
			// A second finger turns the gesture into a pinch, not a drag.
			dragging = null;
			const [a, b] = [...touching.values()];
			pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
		} else {
			// Stood up, a drag does one of two things. Held plain it takes
			// hold of the water under the pointer and carries it, which is
			// the only pan that feels right once the ground has a horizon
			// -- a fixed number of pixels moves the near sea and the far
			// sea by quite different amounts. Held with shift, or with the
			// right button, it leans the camera instead.
			const lean = terrainOn() && (evt.shiftKey || evt.button === 2);
			const at = inBox(host, evt.clientX, evt.clientY);
			dragging = {
				x: evt.clientX, y: evt.clientY, lean,
				grab: terrainOn() && !lean ? seaAt(hostSize(host), at.x, at.y) : null
			};
		}
		// Firefox hands the click after a captured gesture to the capture
		// target, not the button it began on -- so a press that starts on
		// a marker goes uncaptured, and its tap stays a plain click in
		// every engine. The document-level listeners pan it all the same.
		if (!(mv.mode !== 'trace' && evt.target.closest(MARKERS))) host.setPointerCapture(evt.pointerId);
		host.classList.add('dragging');
	});

	// Stood up, the right button leans the camera, so the menu it would
	// otherwise open is in the way of the gesture rather than beside it.
	// Only over the sea: the panel, the cards and the buttons keep
	// theirs, where copying a name or opening a link is the point.
	document.addEventListener('contextmenu', evt => {
		if (!terrainOn()) return;
		const host = evt.target.closest('[data-map]');
		if (!host || evt.target.closest(furniture())) return;
		evt.preventDefault();
	});

	document.addEventListener('pointermove', evt => {
		if (!mv.mapState) return;
		if (touching.has(evt.pointerId)) {
			touching.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
		}
		if (mv.markDrag) {
			const host = document.querySelector('[data-map]');
			if (!host) return;
			const m = markBySeq(mv.markDrag.kind, mv.markDrag.seq);
			const now = atSea(host, evt.clientX, evt.clientY);
			if (m) {
				const hold = v => Math.max(0, Math.min(200000, Math.round(v)));
				m.x = hold(mv.markDrag.x + now.x - mv.markDrag.from.x);
				m.y = hold(mv.markDrag.y + now.y - mv.markDrag.from.y);
			}
			if (Math.hypot(evt.clientX - mv.markDrag.px, evt.clientY - mv.markDrag.py) > 4) mv.markDrag.moved = true;
			schedulePaint();
			return;
		}
		if (mv.penStroke) {
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
				if (zoomAt(mv.mapState, Math.log2(dist / pinch.dist), hostSize(host), at.x, at.y)) schedulePaint();
			}
			// Stood up, the same two fingers do what shift-drag does on a
			// keyboard, which a phone has not got: slid together they lean
			// the camera, twisted they turn it. Leaning is only read while
			// the fingers are not spreading, so a plain pinch stays a
			// plain pinch.
			const mid = (a.y + b.y) / 2;
			const angle = Math.atan2(b.y - a.y, b.x - a.x);
			if (terrainOn()) {
				let turn = angle - (pinch.angle === undefined ? angle : pinch.angle);
				while (turn > Math.PI) turn -= Math.PI * 2;
				while (turn < -Math.PI) turn += Math.PI * 2;
				const slide = mid - (pinch.mid === undefined ? mid : pinch.mid);
				const spread = Math.abs(dist - pinch.dist);
				if (Math.abs(turn) > 0.008 || (spread < 2.5 && Math.abs(slide) > 1)) {
					// The chart turns the way the fingers turn.
					tiltMap(spread < 2.5 ? -slide * 0.28 : 0, turn * 180 / Math.PI);
				}
			}
			pinch.dist = dist;
			pinch.mid = mid;
			pinch.angle = angle;
			return;
		}

		if (!dragging) {
			const host = evt.target.closest && evt.target.closest('[data-map]');
			if (host && !evt.target.closest(furniture())) paintCoords(host, evt.clientX, evt.clientY);
			return;
		}
		const d = boxDelta(evt.clientX - dragging.x, evt.clientY - dragging.y);
		if (dragging.lean) {
			// Dragging up leans the camera towards the horizon, which is
			// the way every map that tilts has taught people to expect.
			tiltMap(-d.y * 0.28, -d.x * 0.35);
			dragging = { ...dragging, x: evt.clientX, y: evt.clientY };
			return;
		}
		if (dragging.grab) {
			// Where the water the finger took hold of has got to, and the
			// centre moved back by the difference. Worked out against the
			// camera as it stands each frame, so it converges instead of
			// drifting.
			const host = document.querySelector('[data-map]');
			const at = host && inBox(host, evt.clientX, evt.clientY);
			const now = host && seaAt(hostSize(host), at.x, at.y);
			if (now) {
				mv.mapState.centre.x += dragging.grab.x - now.x;
				mv.mapState.centre.y += dragging.grab.y - now.y;
			}
		} else {
			pan(mv.mapState, d.x, d.y);
		}
		dragging = { ...dragging, x: evt.clientX, y: evt.clientY };
		// A tooltip that opened on the touch-down is noise once the
		// finger is clearly sailing, not asking.
		if (mv.hoverNpc) mv.hoverNpc = null;
		schedulePaint();
	});

	const stop = evt => {
		// A mark set down stays where it was let go; a word tapped rather
		// than carried opens for retyping.
		if (mv.markDrag) {
			const { kind, seq, moved } = mv.markDrag;
			const carried = mv.markDrag;
			mv.markDrag = null;
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
			if (!moved && kind === 'word' && markBySeq('word', seq)) mv.editing = seq;
			persist();
			refreshSide();
			paintMap();
			return;
		}
		// A press that did not move is a click on the sea: with the ruler
		// armed, that is one end of a measurement.
		if (mv.penStroke) penEnd();
		// A press that travelled was a pan; the click the browser still
		// fires after it must not also work whatever marker it ends on.
		// A press that stayed put is the tap, and that click stands --
		// the markers stopped being furniture, so it reaches them.
		if (evt && evt.type === 'pointerup' && pressed
			&& Math.hypot(evt.clientX - pressed.x, evt.clientY - pressed.y) >= 5) swallowTap = true;
		if (evt && evt.type === 'pointerup' && pressed && mv.mapState
			&& Math.hypot(evt.clientX - pressed.x, evt.clientY - pressed.y) < 5) {
			if (mv.measuring) measureAt(pressed.host, evt.clientX, evt.clientY);
			else if (mv.traceTool === 'point') traceAdd(pressed.host, evt.clientX, evt.clientY);
			else if (mv.traceTool === 'text') textAdd(pressed.host, evt.clientX, evt.clientY);
			else if (mv.traceTool === 'area') areaAdd(pressed.host, evt.clientX, evt.clientY);
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
		mv.searchQ = el.value;
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
		mv.miniPos = { x, y };
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
		if (!mini || !mv.mapState || evt.target.closest('[data-mini-grip], [data-act]')) return;
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
		if (mv.fullOn) settleTurn();
		// The box changed size under the minimap; keep it inside.
		const mini = document.querySelector('[data-map-mini]');
		const host = mini && mini.closest('[data-map]');
		if (mini && host && mv.miniPos) {
			mv.miniPos = {
				x: Math.max(0, Math.min(host.clientWidth - mini.offsetWidth, mv.miniPos.x)),
				y: Math.max(0, Math.min(host.clientHeight - mini.offsetHeight, mv.miniPos.y))
			};
			Object.assign(mini.style, { left: `${Math.round(mv.miniPos.x)}px`, top: `${Math.round(mv.miniPos.y)}px`, right: 'auto', bottom: 'auto' });
		}
		paintMap();
	});

	// The browser's own way out of full screen -- Esc, the back gesture --
	// is the chart's way out too.
	document.addEventListener('fullscreenchange', () => {
		if (!document.fullscreenElement && mv.fullOn) exitFull();
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
