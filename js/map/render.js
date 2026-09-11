// The screen's HTML: the head and the box, the side panel with its
// tabs, and the Barter, Grounds and Today tabs themselves; the minimap;
// and the redraws of the panel alone.

import { courses } from '../courses.js';
import { monsters } from '../sea_monsters.js';
import { esc, F } from '../fmt.js';
import { img } from '../ui-bits.js';
import { createMap } from '../map.js';
import { npcs, npcById } from '../barter_npcs.js';
import { wharves } from '../wharves.js';
import { monsterArt } from '../monster_art.js';
import { quests } from '../quests.js';
import { nextSpawn, localLabel } from '../clock.js';
import { vellPlan } from '../today.js';
import { barterData } from '../ui-state.js';
import { mv, restore, doneSet } from './state.js';
import { marksNow, barterKind, goodsOf } from './marks.js';
import { countPinned, pinButtonsHTML } from './offline.js';
import { terrainStyle, terrainReach, reachRange } from './terrain.js';
import { routeHTML } from './route.js';
import { traceHTML } from './trace.js';

/** Vell's next spawn on the standing region's timetable, or null. */
function vellNext() {
	const plan = vellPlan();
	const next = plan && nextSpawn(plan.zone, plan.times);
	return next ? { at: next.at, label: localLabel(next.at) } : null;
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
		const on = mv.coursesOn.includes(c.id);
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
			const on = mv.huntsOn.includes(m.key);
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
	const picked = mv.coursesOn.length + mv.huntsOn.length;
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
	countPinned();
	restore();
	if (!mv.mapState) mv.mapState = createMap();

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
				<div class="summary-sub">${mv.mapPick ? 'trade this' : 'have something on your list'}</div>
			</div>
			<div>
				<div class="summary-k">Showing</div>
				<div class="summary-v"><button class="map-pick-btn" data-act="map-pick-open"
					aria-label="Choose what to look for">${mv.mapPick
						? `${img(mv.mapPick, 'map-icon')}<span>${esc(mv.mapPick)}</span>`
						: '<span>Everything I am short of</span>'}<span class="map-pick-caret">▾</span></button></div>
				<div class="summary-sub">drag to pan · scroll to zoom</div>
			</div>
		</div>
		<div class="map-zoom">
			<button class="ghost-btn" data-act="map-zoom" data-step="-1" aria-label="Zoom out">−</button>
			<button class="ghost-btn" data-act="map-zoom" data-step="1" aria-label="Zoom in">+</button>
			<button class="ghost-btn" data-act="map-fit" aria-label="Fit the marked islands in view">⌖</button>
			<button class="ghost-btn" data-act="map-measure" aria-pressed="${mv.measuring}" aria-label="Measure a distance" title="Ruler: click two points on the sea">⟷</button>
			<button class="ghost-btn" data-act="map-3d" aria-pressed="${mv.threeD}" aria-label="Stand the chart up"
				title="Stand the chart up: the game's own terrain, read out of your client">⛰</button>
			<button class="ghost-btn" data-act="map-mini" aria-pressed="${mv.miniOn}" aria-label="Show or hide the minimap" title="Minimap: show or hide it; drag its grip to move it">▭</button>
			<button class="ghost-btn" data-act="map-full" aria-pressed="${mv.fullOn}" aria-label="Show the chart over the whole screen" title="Full screen: the chart over everything; ✕ or Esc brings the page back">⛶</button>
			<span class="map-pins" data-map-pins>${pinButtonsHTML()}</span>
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
		<button class="ghost-btn" data-act="map-3d" aria-pressed="${mv.threeD}" aria-label="Stand the chart up" title="Stand the chart up">⛰</button>
		<button class="ghost-btn" data-act="map-full" aria-label="Back to the page" title="Back to the page (Esc)">✕</button>
	</div>`;

	// Shown only while the chart is standing up: which way the ground is
	// painted, and the way back to looking straight down at it.
	const tiltBar = `<div class="map-tilt" data-map-tiltbar${mv.threeD ? '' : ' hidden'}>
		<button class="map-tilt-btn" data-act="map-style" data-id="real" aria-pressed="${terrainStyle() === 'real'}"
			title="The colours the client ships on the terrain itself">Ground</button>
		<button class="map-tilt-btn" data-act="map-style" data-id="neon" aria-pressed="${terrainStyle() === 'neon'}"
			title="Contours, the way the game's own 3D map draws them">Neon</button>
		<button class="map-tilt-btn" data-act="map-level" title="Look straight down again, facing north">⤓ Level</button>
		<label class="map-sight" title="How far the ground is drawn. Further shows the archipelago to the horizon and asks for more tiles; nearer keeps a chart's horizon">
			<span>Sight</span>
			<input type="range" id="map-sight" data-act="map-sight" min="${reachRange.min}" max="${reachRange.max}"
				step="0.5" value="${terrainReach()}" aria-label="How far the ground is drawn">
			<b data-map-sight-n>${Math.round(terrainReach() * 10) / 10}×</b>
		</label>
		<span class="map-tilt-hint">shift-drag to lean</span>
	</div>`;
	return head + `<div class="panel map-panel"><div class="map${mv.measuring ? ' measuring' : ''}${mv.sideRight ? ' side-right' : ''}${mv.mode === 'trace' ? ' free-hand' : ''}${mv.traceTool ? ` tracing tool-${mv.traceTool}` : ''}${mv.fullOn ? ' full' : ''}${mv.fullTurned ? ' turned' : ''}" id="map" data-map>
		<div class="map-layer" data-map-layer></div>
		<div class="map-side-slot" data-map-side>${sideHTML(marks)}</div>
		<div class="map-tip" data-map-tip hidden></div>
		<div class="map-steps" data-map-steps hidden></div>
		<div class="map-coords" data-map-coords hidden></div>
		${clocks}
		${fullBar}
		${tiltBar}
		${miniHTML(marks)}
	</div></div>`;
}

/* ------------------------------------------------------------------ *
 * the side panel
 * ------------------------------------------------------------------ */

function sideHTML(marks) {
	if (!mv.panelOpen) {
		return `<button class="map-side-pill" data-act="map-panel">☰ Where to sail</button>`;
	}
	const tabs = [['sail', 'Barter'], ['route', 'Route'], ['trace', 'Draw'], ['hunt', 'Grounds'], ['today', 'Today']]
		.map(([id, label]) => `<button class="map-tab${mv.mode === id ? ' active' : ''}"
			data-act="map-mode" data-id="${id}">${label}</button>`).join('');
	const body = mv.mode === 'route' ? routeHTML(marks)
		: mv.mode === 'trace' ? traceHTML()
		: mv.mode === 'hunt' ? huntHTML()
		: mv.mode === 'today' ? todayHTML(marks)
		: sailHTML(marks);
	return `<div class="map-side">
		<div class="map-side-head"><span>${
			mv.mode === 'route' ? 'Plot the loop' : mv.mode === 'trace' ? 'Trace a route' : mv.mode === 'hunt' ? 'Hunting grounds' : mv.mode === 'today' ? 'Sailed today' : 'Who has it'
		}</span><span class="map-side-head-btns"><button class="map-side-close" data-act="map-side-flip" aria-label="Move the panel to the other side" title="Move the panel to the ${mv.sideRight ? 'left' : 'right'}">⇄</button><button class="map-side-close" data-act="map-panel" aria-label="Hide the panel">${mv.sideRight ? '›' : '‹'}</button></span></div>
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
		chip('map-pins', '', mv.pinsOn, '#7ef0d4', 'Barterers', `The ${npcs.length} island marks`),
		chip('map-habitats', '', mv.habitatsOn, '#ffd77a', 'Habitats', "A picture where each species lives, as the game's map shows them"),
		chip('map-wharves', 'wharf', mv.wharvesOn.includes('wharf'), '#9fd0f0', 'Wharves', `${wharfN('wharf')} wharf managers — repair, rations, sailor contracts`),
		chip('map-wharves', 'guild', mv.wharvesOn.includes('guild'), '#c6a0ff', 'Guild', `${wharfN('guild')} guild wharves — the Old Moon Guild's, for a guild ship`),
		chip('map-labels', '', mv.labelsOn, '#cfe3f5', 'Islands', 'Island names, faint, once the chart is close enough to read them'),
		chip('map-traces', '', mv.tracesOn, '#ffd77a', 'Traces', 'What you drew by hand, and every kept trace with its eye open')
	].join('');
	const on = [mv.pinsOn, mv.habitatsOn, mv.labelsOn, mv.tracesOn].filter(Boolean).length + mv.wharvesOn.length;
	return `<div class="map-layers${mv.layersOpen ? ' open' : ''}">
		<button class="map-layers-head" data-act="map-layers" aria-expanded="${mv.layersOpen}"
			title="What the chart draws, on every tab">
			<span class="map-layers-caret" aria-hidden="true">${mv.layersOpen ? '▾' : '▸'}</span>
			<span>On the chart</span><span class="map-courses-credit">${on} of 6</span></button>
		${mv.layersOpen ? `<div class="map-chips">${chips}</div>` : ''}
	</div>`;
}

/** Up to three item icons, then a count for the rest. */
export function iconStrip(items) {
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
	const q = mv.searchQ.trim().toLowerCase();
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
	const kinds = !mv.mapPick ? `<div class="map-kinds">${[
			['all', 'All'], ['material', 'Materials'], ['trade', 'Trade goods']
		].map(([id, label]) => `<button class="map-kind-chip${mv.kindFilter === id ? ' on' : ''}"
			data-act="map-kind" data-id="${id}">${label}</button>`).join('')}</div>` : '';
	return `${kinds}<input class="map-search" type="search" data-act="map-search"
			value="${esc(mv.searchQ)}" placeholder="Filter islands…" aria-label="Filter islands">
		${draw}<div class="map-list" data-map-list>${list}</div>`;
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

export function miniHTML(marks) {
	// The minimap frames the islands, not the whole chart: the point of
	// it is "where am I among the barterers", and the sea past them is
	// dead space at this size.
	const b = npcBox();
	const dots = npcs.map(n => `<i class="mini-dot${marks.has(n.id) ? ' wanted' : ''}"
		style="left:${((n.x - b.x0) / (b.x1 - b.x0) * 100).toFixed(1)}%;top:${((n.y - b.y0) / (b.y1 - b.y0) * 100).toFixed(1)}%"></i>`).join('');
	if (!mv.miniOn) return '';
	// A dragged position was clamped against the box it was dragged in;
	// this box may be smaller — a window shrunk, a panel grown — so it
	// is clamped again before it is drawn. 176×110 is the minimap's
	// fixed size in tracker-map.css.
	if (mv.miniPos) {
		const host = document.querySelector('[data-map]');
		if (host && host.clientWidth) {
			mv.miniPos = {
				x: Math.max(0, Math.min(host.clientWidth - 176, mv.miniPos.x)),
				y: Math.max(0, Math.min(host.clientHeight - 110, mv.miniPos.y))
			};
		}
	}
	const at = mv.miniPos ? ` style="left:${Math.round(mv.miniPos.x)}px;top:${Math.round(mv.miniPos.y)}px;right:auto;bottom:auto"` : '';
	return `<div class="map-mini${mv.miniPos ? ' moved' : ''}" data-map-mini title="Jump there"${at}>
		<span class="mini-grip" data-mini-grip title="Drag to move the minimap" aria-hidden="true">⋮⋮</span>
		<button class="mini-hide" data-act="map-mini" title="Hide the minimap" aria-label="Hide the minimap">×</button>
		${dots}<i class="mini-view" data-map-view></i></div>`;
}

let npcBoxCache = null;
export function npcBox() {
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
export function refreshSide() {
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

export function refreshSideList() {
	const list = document.querySelector('[data-map-list]');
	if (!list) return refreshSide();
	const html = sailHTML(marksNow());
	// Only the rows; the input above them is the thing being typed in.
	list.outerHTML = html.slice(html.indexOf('<div class="map-list"'));
}
