// The Map screen: the chart, your shopping list drawn onto it, and the
// gestures that move it. The viewer's state -- where you are looking,
// what you picked to show, the route you are building -- lives here,
// with the command functions the shell's event handling calls.

import { esc, F } from './fmt.js';
import { img } from './ui-bits.js';
import {
	createMap, frame, marksFor, pan, zoomAt, clampView, fitTo,
	routeFor, routePath, project, placeTile, zoomRange
} from './map.js';
import { npcs, npcById, ports } from './barter_npcs.js';
import { openDialog } from './dialogs.js';
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
let follow = true;            // the step player flies the camera along
let stepIdx = 0;              // which stop the step player is on
let stepKey = '';             // the route it was on, to reset when it changes

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
		if (['all', 'material', 'trade'].includes(s.kindFilter)) kindFilter = s.kindFilter;
		panelOpen = s.panelOpen !== false;
		if (Array.isArray(s.stops)) stops = s.stops.filter(id => npcById.has(id));
		if (typeof s.stopsPick === 'string') stopsPick = s.stopsPick;
		if (s.done && s.done.day === barterDay()) done = s.done;
		if (ports.some(p => p.id === s.startPort)) startPort = s.startPort;
		returnHome = s.returnHome === true;
		follow = s.follow !== false;
	} catch { /* a fresh chart, then */ }
}

function persist() {
	try {
		localStorage.setItem(STORE_KEY,
			JSON.stringify({ mode, panelOpen, stops, stopsPick, done, startPort, returnHome, follow, kindFilter }));
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
 *  one for this view, else the suggested loop -- turned to sail from
 *  home when a wharf is chosen, since a loop has no direction of its
 *  own. */
function routeIds(marks) {
	if (stopsLive() && stops.length >= 2) return stops;
	let ids = routeFor(marks).map(n => n.id);
	const port = ports.find(p => p.id === startPort);
	if (port && ids.length > 1) {
		const a = npcById.get(ids[0]), b = npcById.get(ids[ids.length - 1]);
		const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
		if (d(port, b) < d(port, a)) ids = [...ids].reverse();
	}
	return ids;
}

/** Those stops as world points, wharf prepended -- and appended, when
 *  the route is to end where the ship lives. */
function routeWorld(marks) {
	const pts = routeIds(marks).map(id => npcById.get(id)).filter(Boolean);
	const port = ports.find(p => p.id === startPort);
	if (!port || !pts.length) return pts;
	return returnHome ? [port, ...pts, port] : [port, ...pts];
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
		<span class="summary-title">Where to sail</span>
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
		</div>
	</div>`;

	return head + `<div class="panel map-panel"><div class="map" id="map" data-map>
		<div class="map-layer" data-map-layer></div>
		<div class="map-side-slot" data-map-side>${sideHTML(marks)}</div>
		<div class="map-tip" data-map-tip hidden></div>
		<div class="map-steps" data-map-steps hidden></div>
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
			return rowHTML(npc,
				`${esc(npc.at)} · for ${esc(gives.slice(0, 2).join(' / ') || '—')}`,
				iconStrip(items));
		}).join('');
	const list = rows
		|| `<p class="empty">${q ? 'No island by that name has it.'
			: 'Nothing on your list is bartered at sea.'}</p>`;
	const kinds = !mapPick ? `<div class="map-kinds">${[
			['all', 'All'], ['material', 'Materials'], ['trade', 'Trade goods']
		].map(([id, label]) => `<button class="map-kind-chip${kindFilter === id ? ' on' : ''}"
			data-act="map-kind" data-id="${id}">${label}</button>`).join('')}</div>` : '';
	return `${kinds}<input class="map-search" type="search" data-act="map-search"
			value="${esc(searchQ)}" placeholder="Filter islands…" aria-label="Filter islands">
		<div class="map-list" data-map-list>${list}</div>`;
}

function routeHTML(marks) {
	const per = parleyPerTrade(barterProfile());
	if (stops.length && !stopsLive()) {
		return `<p class="map-hint">You plotted ${stops.length} stops while showing
			<strong>${esc(stopsPick || 'everything you are short of')}</strong>; the chart
			is on something else now, so the suggested loop is drawn instead.</p>
			<div class="map-side-btns">
				<button class="ghost-btn" data-act="map-route-revive">Show that again</button>
				<button class="ghost-btn danger" data-act="map-route-clear">Clear it</button>
			</div>`;
	}
	const list = stops.map((id, k) => {
		const n = npcById.get(id);
		const has = marks.get(id);
		return `<div class="map-stop-row">
			<span class="map-stop-n">${k + 1}</span>
			<span class="map-row-main">
				<span class="map-row-name">${esc(n.name)}</span>
				<span class="map-row-sub">${esc(n.at)}${has
					? ' · ' + esc([...has.items.keys()].join(', '))
					: ' · nothing on your list here'}</span>
			</span>
			<span class="map-row-right">${has ? iconStrip([...has.items.keys()]) : ''}</span>
			<button class="map-x" data-act="map-stop" data-npc="${id}"
				aria-label="Remove ${esc(n.name)} from the route">×</button>
		</div>`;
	}).join('');
	const held = barterProfile().parleyHeld;
	const need = per * stops.length;
	const cover = !held ? `one trade each · of ${F(PARLEY.max)}`
		: held >= need ? `one trade each · your ${F(held)} covers it`
		: `one trade each · your ${F(held)} covers ${Math.floor(held / per)}`;
	const stats = stops.length ? `<div class="map-stats">
			<div><div class="summary-k">Stops</div><div class="summary-v">${stops.length}</div></div>
			<div><div class="summary-k">Parley</div><div class="summary-v">${F(need)}</div>
				<div class="summary-sub">${cover}</div></div>
		</div>
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-reverse">⇆ Reverse</button>
			<button class="ghost-btn danger" data-act="map-route-clear">Clear</button>
		</div>` : '';
	const seedBtn = !stops.length && marks.size > 1
		? `<button class="ghost-btn wide" data-act="map-route-use">Start from the suggested loop</button>` : '';
	const startRow = `<div class="map-startrow">
		<select class="purse-inline" data-act="map-start" aria-label="Start the route from">
			<option value="0">Start at the first stop</option>
			${ports.map(p => `<option value="${p.id}"${p.id === startPort ? ' selected' : ''}>from ${esc(p.name)}</option>`).join('')}
		</select>
		<label class="inline-check"><input type="checkbox" data-act="map-return"${returnHome ? ' checked' : ''}> and back</label>
	</div>`;
	return `<p class="map-hint">Click a pin, then “Add stop”. The numbers sail in this order.</p>
		${startRow}${seedBtn}<div class="map-list">${list}</div>${stats}`;
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

	const { tiles, pins } = frame(mapState, size, marks);

	const ids = routeIds(marks);
	const key = `${ids.join('.')}|${startPort}|${returnHome}`;
	if (key !== stepKey) { stepKey = key; stepIdx = 0; }
	const currentId = ids.length > 1 ? ids[Math.min(stepIdx, ids.length - 1)] : null;

	paintTiles(layer, tiles, size);
	paintPins(layer, pins, marks, currentId);
	paintPorts(layer, size);
	paintRoute(layer, size, marks);
	paintSteps(host, ids);
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

function paintPins(layer, pins, marks, currentId) {
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
			btn.innerHTML = '<span class="map-pin-dot"></span><span class="map-pin-badge"></span>'
				+ '<span class="map-pin-name"><span class="map-pin-npc"></span><span class="map-pin-at"></span></span>';
			btn.addEventListener('pointerenter', () => { hoverNpc = p.id; paintMap(); });
			btn.addEventListener('pointerleave', () => { hoverNpc = null; paintMap(); });
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
	const pts = routeWorld(marks).map(p => project(mapState, size, p.x, p.y));
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
	if (ship._for !== stepKey) {
		ship._for = stepKey;
		const dur = Math.max(8, Math.min(42, len / 55));
		ship.style.animation = 'none';
		void ship.offsetWidth;
		ship.style.animation = `map-sail ${dur.toFixed(1)}s linear infinite`;
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
		// The game deals each island one material offer per refresh, drawn
		// from its own pool -- so the size of that pool is the honest way
		// to say how likely your thing is to be on the table today.
		const pool = new Set(goodsOf(id).map(g => g.item)).size;
		const sub = `${esc(npc.at)} · ${F(parleyPerTrade(barterProfile()))} parley a trade`
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
	tip.style.left = `${Math.max(10, Math.min(size.w - w - 10, at.left + 16))}px`;
	tip.style.top = `${Math.max(10, Math.min(size.h - h - 10, at.top - 12))}px`;
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
	const FURNITURE = '[data-act="map-pin"], [data-act="map-port"], .map-side, .map-side-pill, .map-tip, .map-mini, .map-steps';

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
		if (evt.target.closest('.map-side, .map-tip, .map-steps')) return;   // their scroll, not ours
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
	if (stops.length && !stopsLive()) {
		// Plotting under a new view starts a new plot; the old one was
		// one click to make and would only mislead here.
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
	stops = routeFor(marksNow()).map(n => n.id);
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

	const host = openDialog(`
		<h2>What to look for</h2>
		<p>The chart lights the islands that barter it.</p>
		<input class="field picker-search" type="search" placeholder="Search the sea’s goods…" data-picker-search>
		<div class="picker" data-picker></div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>`);

	const listEl = host.querySelector('[data-picker]');
	const searchEl = host.querySelector('[data-picker-search]');
	const row = (n, tag) => `<button type="button" class="picker-row" data-act="map-pick-set"
		data-item="${esc(n)}">${img(n, 'row-icon sm')}
		<span class="picker-name">${esc(n)}</span><span class="picker-tag">${tag}</span></button>`;

	const paint = term => {
		const t = (term || '').trim().toLowerCase();
		const hit = n => !t || n.toLowerCase().includes(t);
		const a = short.filter(hit), b = rest.filter(hit);
		const everything = t ? '' : `<button type="button" class="picker-row" data-act="map-pick-set" data-item="">
			<span class="row-icon sm map-pick-all">⚓</span>
			<span class="picker-name">Everything I am short of</span>
			<span class="picker-tag">${short.length} goods</span></button>`;
		listEl.innerHTML = (everything
			+ (a.length ? '<div class="picker-head">On your build list</div>'
				+ a.map(n => row(n, `${F(snapshot.missing[n])} short`)).join('') : '')
			+ (b.length ? '<div class="picker-head">The rest of the sea</div>'
				+ b.map(n => row(n, { material: 'material', trade: 'trade good', coin: 'crow coin' }[barterKind(n)])).join('') : ''))
			|| '<p class="empty">Nothing matches that search.</p>';
	};
	paint('');
	searchEl.addEventListener('input', () => paint(searchEl.value));
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
