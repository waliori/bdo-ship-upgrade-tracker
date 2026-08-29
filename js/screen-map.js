// The Map screen: the chart, your shopping list drawn onto it, and the
// gestures that move it. The viewer's state -- where you are looking,
// what you picked to show -- lives here, with the command functions the
// shell's event handling calls.

import { esc, F } from './fmt.js';
import { createMap, frame, marksFor, pan, zoomBy, zoomAt } from './map.js';
import { npcs, npcById } from './barter_npcs.js';
import { snapshot, barterData, view } from './ui-state.js';

let mapState = null;
let mapPick = null;

/**
 * The chart, and your shopping list drawn onto it.
 *
 * Everything else here answers "what do I need"; this answers the
 * question straight after, which nothing else does: where do I sail.
 * A row saying "barter from 36 NPCs" cannot tell you whether those 36
 * are one afternoon's loop or scattered across the whole sea, and a
 * chart can.
 *
 * The frame is painted once into the screen HTML and then moved by
 * hand on a drag -- re-rendering the whole app on every mousemove would
 * be both slow and enough to lose the drag.
 */
export function renderMap() {
	if (!mapState) mapState = createMap();

	if (!barterData) {
		return '<div class="panel"><p class="empty">Loading the barter routes…</p></div>';
	}

	const wanted = mapPick ? { [mapPick]: 1 } : snapshot.missing;
	const marks = marksFor(wanted, barterData);

	const options = [...new Set(barterData.map(b => b.name))].sort()
		.map(n => `<option${n === mapPick ? ' selected' : ''}>${esc(n)}</option>`).join('');

	const head = `<div class="summary">
		<span class="summary-title">Where to sail</span>
		<div class="summary-stats">
			<div>
				<div class="summary-k">Barterers</div>
				<div class="summary-v">${F(marks.size)} of ${npcs.length}</div>
				<div class="summary-sub">${mapPick ? 'trade this' : 'have something on your list'}</div>
			</div>
			<div>
				<div class="summary-k">Showing</div>
				<div class="summary-v"><select class="purse-inline" data-act="map-pick"
					aria-label="What to look for"><option value=""${mapPick ? '' : ' selected'}
					>Everything I am short of</option>${options}</select></div>
				<div class="summary-sub">drag to pan · scroll to zoom</div>
			</div>
		</div>
		<div class="map-zoom">
			<button class="ghost-btn" data-act="map-zoom" data-step="-1" aria-label="Zoom out">−</button>
			<button class="ghost-btn" data-act="map-zoom" data-step="1" aria-label="Zoom in">+</button>
		</div>
	</div>`;

	return head + `<div class="panel map-panel"><div class="map" id="map" data-map>
		<div class="map-layer" data-map-layer></div>
	</div></div>`;
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

	const wanted = mapPick ? { [mapPick]: 1 } : snapshot.missing;
	const marks = marksFor(wanted, barterData);
	const { tiles, pins } = frame(mapState, size, marks);

	const tilePool = layer._tiles || (layer._tiles = new Map());
	const liveTiles = new Set();
	for (const t of tiles) {
		liveTiles.add(t.src);
		let img = tilePool.get(t.src);
		if (!img) {
			img = document.createElement('img');
			img.className = 'map-tile';
			img.src = t.src;
			img.alt = '';
			img.draggable = false;
			tilePool.set(t.src, img);
			layer.appendChild(img);
		}
		img.style.left = `${t.left}px`;
		img.style.top = `${t.top}px`;
	}
	for (const [src, img] of tilePool) {
		if (!liveTiles.has(src)) {
			img.remove();
			tilePool.delete(src);
		}
	}

	const pinPool = layer._pins || (layer._pins = new Map());
	const livePins = new Set();
	for (const p of pins) {
		livePins.add(p.id);
		let btn = pinPool.get(p.id);
		if (!btn) {
			btn = document.createElement('button');
			btn.className = 'map-pin';
			btn.dataset.act = 'map-pin';
			btn.dataset.npc = p.id;
			btn.innerHTML = '<span class="map-pin-dot"></span><span class="map-pin-name"></span>';
			pinPool.set(p.id, btn);
			layer.appendChild(btn);
		}
		const m = p.mark;
		const what = m ? [...m.items.keys()] : [];
		btn.classList.toggle('wanted', !!m);
		btn.title = m ? `${p.name} — ${what.join(', ')}` : p.name;
		// z-index rather than DOM order does what the wanted-last sort in
		// frame() used to: a lit pin paints over a plain one.
		btn.style.zIndex = m ? 2 : 1;
		btn.style.left = `${p.left}px`;
		btn.style.top = `${p.top}px`;
		btn.querySelector('.map-pin-name').textContent =
			p.name + (m && what.length > 1 ? ` ·${what.length}` : '');
	}
	for (const [id, btn] of pinPool) {
		if (!livePins.has(id)) {
			btn.remove();
			pinPool.delete(id);
		}
	}
}

/** Drag to pan, wheel or pinch to zoom. Wired once, for whatever map
 *  exists. */
export function wireMap() {
	let dragging = null;          // one pointer moving the sea
	const touching = new Map();   // every pointer down on the map, for pinch
	let pinch = null;             // { dist } spread at the last zoom step
	let raf = null;

	// One repaint per frame however fast the pointer reports; a trackpad
	// can deliver several moves per frame and each paint is work.
	const repaint = () => {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = null;
			paintMap();
		});
	};

	document.addEventListener('pointerdown', evt => {
		const host = evt.target.closest('[data-map]');
		if (!host || evt.target.closest('[data-act="map-pin"]')) return;
		touching.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
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

		if (pinch && touching.size === 2) {
			const host = document.querySelector('[data-map]');
			if (!host) return;
			// Zoom levels are discrete, so the pinch steps once per
			// half-again change in finger spread, anchored between the
			// fingers -- the same pin-the-world rule the wheel uses.
			const [a, b] = [...touching.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			const grown = dist / pinch.dist;
			if (grown > 1.4 || grown < 1 / 1.4) {
				const box = host.getBoundingClientRect();
				const ok = zoomAt(mapState, grown > 1 ? 1 : -1,
					{ w: box.width, h: box.height },
					(a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top);
				if (ok) repaint();
				pinch.dist = dist;
			}
			return;
		}

		if (!dragging) return;
		pan(mapState, evt.clientX - dragging.x, evt.clientY - dragging.y);
		dragging = { x: evt.clientX, y: evt.clientY };
		repaint();
	});

	const stop = evt => {
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

	document.addEventListener('wheel', evt => {
		const host = evt.target.closest('[data-map]');
		if (!host || !mapState) return;
		evt.preventDefault();
		// Anchored under the cursor: the island you are wheeling towards
		// stays put instead of sliding off towards the centre.
		const box = host.getBoundingClientRect();
		const ok = zoomAt(mapState, evt.deltaY < 0 ? 1 : -1,
			{ w: box.width, h: box.height },
			evt.clientX - box.left, evt.clientY - box.top);
		if (ok) paintMap();
	}, { passive: false });

	window.addEventListener('resize', () => {
		if (view === 'map') paintMap();
	});
}

/* What the shell's event handling steers. */

export function setMapPick(value) {
	mapPick = value;
}

export function mapZoomStep(step) {
	if (mapState && zoomBy(mapState, step)) paintMap();
}

export function mapCentreOn(npcId) {
	const at = npcById.get(npcId);
	if (at && mapState) {
		mapState.centre = { x: at.x, y: at.y };
		paintMap();
	}
}
