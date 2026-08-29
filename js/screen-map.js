// The Map screen: the chart, your shopping list drawn onto it, and the
// gestures that move it. The viewer's state -- where you are looking,
// what you picked to show, the route you are building -- lives here,
// with the command functions the shell's event handling calls.

import { esc, F } from './fmt.js';
import {
	createMap, frame, marksFor, pan, zoomAt, clampView, fitTo,
	routeFor, routePath, project, placeTile, zoomRange
} from './map.js';
import { npcs, npcById } from './barter_npcs.js';
import { parleyPerTrade, PARLEY } from './barter.js';
import { snapshot, barterData, barterProfile, view } from './ui-state.js';

let mapState = null;
let mapPick = null;
let pendingFit = false;

/* The planner's own state: which side-panel mode, the hand-built route,
 * and what you have already visited today. Kept across sessions the
 * same way the active tab is -- it is view state, not inventory. */
const STORE_KEY = 'bdo-tracker/map-view';
let mode = 'sail';            // sail | route | today
let panelOpen = true;
let searchQ = '';
let stops = [];               // npc ids, in sail order, chosen by hand
let done = { day: '', ids: [] };
let restored = false;

let hoverNpc = null;
let pinnedNpc = null;
let fly = null;               // the rAF handle of a flight in progress

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
		if (['sail', 'route', 'today'].includes(s.mode)) mode = s.mode;
		panelOpen = s.panelOpen !== false;
		if (Array.isArray(s.stops)) stops = s.stops.filter(id => npcById.has(id));
		if (s.done && s.done.day === barterDay()) done = s.done;
	} catch { /* a fresh chart, then */ }
}

function persist() {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify({ mode, panelOpen, stops, done }));
	} catch { /* private mode; the session still works */ }
}

function doneSet() {
	if (done.day !== barterDay()) done = { day: barterDay(), ids: [] };
	return new Set(done.ids);
}

function wantedNow() {
	return mapPick ? { [mapPick]: 1 } : snapshot.missing;
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
				goodsIndex.get(s.npc_id).push({ item: entry.name, give: s.give && s.give.name });
			}
		}
	}
	return goodsIndex.get(id) || [];
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
			<button class="ghost-btn" data-act="map-fit" aria-label="Fit the marked islands in view">⌖</button>
		</div>
	</div>`;

	return head + `<div class="panel map-panel"><div class="map" id="map" data-map>
		<div class="map-layer" data-map-layer></div>
		<div class="map-side-slot" data-map-side>${sideHTML(marks)}</div>
		<div class="map-tip" data-map-tip hidden></div>
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
	const tabs = [['sail', 'Sail'], ['route', 'Route'], ['today', 'Today']]
		.map(([id, label]) => `<button class="map-tab${mode === id ? ' active' : ''}"
			data-act="map-mode" data-id="${id}">${label}</button>`).join('');
	const body = mode === 'route' ? routeHTML(marks)
		: mode === 'today' ? todayHTML(marks)
		: sailHTML(marks);
	return `<div class="map-side">
		<div class="map-side-head"><span>${
			mode === 'route' ? 'Plot the loop' : mode === 'today' ? 'Sailed today' : 'Who has it'
		}</span><button class="map-side-close" data-act="map-panel" aria-label="Hide the panel">‹</button></div>
		<div class="map-tabs" role="tablist">${tabs}</div>
		<div class="map-side-body">${body}</div>
	</div>`;
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
		.filter(r => r.npc && (!q || r.npc.name.toLowerCase().includes(q)))
		.sort((a, b) => b.m.items.size - a.m.items.size || a.npc.name.localeCompare(b.npc.name))
		.map(({ npc, m }) => {
			const items = [...m.items.keys()];
			const gives = [...new Set([...m.items.values()].flatMap(s => [...s]))];
			return rowHTML(npc,
				`for ${esc(gives.slice(0, 2).join(' / ') || '—')}`,
				items.length > 1 ? `·${items.length}` : esc(items[0] || ''));
		}).join('');
	const list = rows
		|| `<p class="empty">${q ? 'No island by that name has it.'
			: 'Nothing on your list is bartered at sea.'}</p>`;
	return `<input class="map-search" type="search" data-act="map-search"
			value="${esc(searchQ)}" placeholder="Filter islands…" aria-label="Filter islands">
		<div class="map-list" data-map-list>${list}</div>`;
}

function routeHTML(marks) {
	const per = parleyPerTrade(barterProfile());
	const list = stops.map((id, k) => {
		const n = npcById.get(id);
		const has = marks.get(id);
		return `<div class="map-stop-row">
			<span class="map-stop-n">${k + 1}</span>
			<span class="map-row-main">
				<span class="map-row-name">${esc(n.name)}</span>
				<span class="map-row-sub">${has
					? esc([...has.items.keys()].join(', '))
					: 'nothing on your list here'}</span>
			</span>
			<button class="map-x" data-act="map-stop" data-npc="${id}"
				aria-label="Remove ${esc(n.name)} from the route">×</button>
		</div>`;
	}).join('');
	const stats = stops.length ? `<div class="map-stats">
			<div><div class="summary-k">Stops</div><div class="summary-v">${stops.length}</div></div>
			<div><div class="summary-k">Parley</div><div class="summary-v">${F(per * stops.length)}</div>
				<div class="summary-sub">one trade each · of ${F(PARLEY.max)}</div></div>
		</div>
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-reverse">⇆ Reverse</button>
			<button class="ghost-btn danger" data-act="map-route-clear">Clear</button>
		</div>` : '';
	const seedBtn = !stops.length && marks.size > 1
		? `<button class="ghost-btn wide" data-act="map-route-use">Start from the suggested loop</button>` : '';
	return `<p class="map-hint">Click a pin, then “Add stop”. The numbers sail in this order.</p>
		${seedBtn}<div class="map-list">${list}</div>${stats}`;
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
				<span class="map-row-sub">${esc([...marks.get(n.id).items.keys()].join(', '))}</span>
			</span>
		</button>`;
	}).join('');
	return `<div class="map-ring-row">
			<div class="map-ring" style="background:conic-gradient(var(--teal) ${pct * 3.6}deg, var(--track) 0deg)">
				<span>${pct}%</span></div>
			<div><div class="map-ring-big">${doneCount} of ${all.length} visited</div>
				<div class="map-row-sub">resets 06:00 UTC with the game</div></div>
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
	return `<div class="map-mini" data-map-mini title="Jump there">${dots}<i class="mini-view" data-map-view></i></div>`;
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
	if (slot) slot.innerHTML = sideHTML(marksNow());
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

	const marks = marksNow();

	// A fit was asked for; now the box exists to measure, sail there.
	if (pendingFit) {
		pendingFit = false;
		const points = marks.size ? [...marks.keys()].map(id => npcById.get(id)).filter(Boolean) : npcs;
		const probe = { zoom: mapState.zoom, centre: { ...mapState.centre } };
		fitTo(probe, size, points);
		flyTo(probe.centre.x, probe.centre.y, probe.zoom);
	}
	// The view never leaves the charted sea, whatever the gesture did.
	clampView(mapState, size);

	const { tiles, pins, route } = frame(mapState, size, marks);

	paintTiles(layer, tiles, size);
	paintPins(layer, pins, marks);
	paintRoute(layer, route, size);
	paintTip(host, size, marks);
	paintMini(host, size);
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
			layer.appendChild(img);
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

function paintPins(layer, pins, marks) {
	const pool = layer._pins || (layer._pins = new Map());
	const live = new Set();
	const dn = doneSet();
	for (const p of pins) {
		live.add(p.id);
		let btn = pool.get(p.id);
		if (!btn) {
			btn = document.createElement('button');
			btn.className = 'map-pin';
			btn.dataset.act = 'map-pin';
			btn.dataset.npc = p.id;
			btn.innerHTML = '<span class="map-pin-dot"></span><span class="map-pin-badge"></span><span class="map-pin-name"></span>';
			btn.addEventListener('pointerenter', () => { hoverNpc = p.id; paintMap(); });
			btn.addEventListener('pointerleave', () => { hoverNpc = null; paintMap(); });
			pool.set(p.id, btn);
			layer.appendChild(btn);
		}
		const m = p.mark;
		const what = m ? [...m.items.keys()] : [];
		const stopAt = stops.indexOf(p.id);
		const visited = dn.has(p.id);
		btn.classList.toggle('wanted', !!m);
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
		btn.querySelector('.map-pin-name').textContent =
			p.name + (m && what.length > 1 ? ` ·${what.length}` : '');
	}
	for (const [id, btn] of pool) {
		if (!live.has(id)) {
			btn.remove();
			pool.delete(id);
		}
	}
}

function paintRoute(layer, autoRoute, size) {
	// The hand-plotted route wins; the suggested loop through everything
	// marked is what you get before you have plotted one.
	const pts = stops.length >= 2
		? stops.map(id => npcById.get(id)).filter(Boolean).map(n => project(mapState, size, n.x, n.y))
		: autoRoute;
	const d = routePath(pts);

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
	const key = (stops.length >= 2 ? 'plot:' + stops.join('.') : 'auto:' + pts.length);
	if (ship._for !== key) {
		ship._for = key;
		const dur = Math.max(8, Math.min(42, len / 55));
		ship.style.animation = 'none';
		void ship.offsetWidth;
		ship.style.animation = `map-sail ${dur.toFixed(1)}s linear infinite`;
	}
}

function paintTip(host, size, marks) {
	const tip = host.querySelector('[data-map-tip]');
	if (!tip) return;
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
	const key = [id, mode, pinned, stops.indexOf(id), dn.has(id), m ? m.items.size : 0].join('|');
	if (tip._for !== key) {
		tip._for = key;
		const rows = m
			? [...m.items.entries()].slice(0, 5).map(([item, gives]) =>
				`<div class="map-tip-row"><span>${esc([...gives][0] || '—')}</span>
					<span class="map-tip-arrow">→</span><span>${esc(item)}</span></div>`).join('')
			: '';
		const others = new Set(goodsOf(id).map(g => g.item)).size - (m ? m.items.size : 0);
		const sub = `${F(parleyPerTrade(barterProfile()))} parley a trade`
			+ (others > 0 ? ` · ${others} other good${others > 1 ? 's' : ''}` : '');
		const onRoute = stops.includes(id);
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
	tip.style.left = `${Math.max(10, Math.min(size.w - 250, at.left + 16))}px`;
	tip.style.top = `${Math.max(10, Math.min(size.h - 130, at.top - 12))}px`;
	tip.hidden = false;
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
	let raf = null;

	// The panel, the card, the minimap: furniture on top of the sea.
	// A gesture that starts on them is for them, not for the chart.
	const FURNITURE = '[data-act="map-pin"], .map-side, .map-side-pill, .map-tip, .map-mini';

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
		if (!host || evt.target.closest(FURNITURE)) return;
		cancelFly();
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
			// Continuous: the chart magnifies exactly as fast as the
			// fingers spread, anchored between them -- the same
			// pin-the-world rule the wheel uses.
			const [a, b] = [...touching.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			if (dist > 1 && pinch.dist > 1) {
				const box = host.getBoundingClientRect();
				if (zoomAt(mapState, Math.log2(dist / pinch.dist),
					{ w: box.width, h: box.height },
					(a.x + b.x) / 2 - box.left, (a.y + b.y) / 2 - box.top)) repaint();
			}
			pinch.dist = dist;
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
		if (evt.target.closest('.map-side, .map-tip')) return;   // their scroll, not ours
		evt.preventDefault();
		cancelFly();
		// Anchored under the cursor, and continuous: a notch of the
		// wheel is a quarter-step of magnification, not a lurch to the
		// next level.
		const box = host.getBoundingClientRect();
		if (zoomAt(mapState, -evt.deltaY * 0.0024,
			{ w: box.width, h: box.height },
			evt.clientX - box.left, evt.clientY - box.top)) repaint();
	}, { passive: false });

	// The search box filters as you type, touching only the list under
	// it -- rebuilding the input mid-word would eat the caret.
	document.addEventListener('input', evt => {
		const el = evt.target.closest('[data-act="map-search"]');
		if (!el) return;
		searchQ = el.value;
		refreshSideList();
	});

	// A click on the minimap is "take me there": the same spot, scaled
	// up from thumbnail to sea.
	document.addEventListener('click', evt => {
		const mini = evt.target.closest('[data-map-mini]');
		if (!mini || !mapState) return;
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
	if (!['sail', 'route', 'today'].includes(id)) return;
	mode = id;
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
	stops = stops.includes(npcId) ? stops.filter(id => id !== npcId) : [...stops, npcId];
	persist();
	refreshSide();
	paintMap();
}

export function useSuggestedRoute() {
	stops = routeFor(marksNow()).map(n => n.id);
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
