// The game's own world map: its favourites, camera slots and loops
// read back onto the chart, and the chart's stops written out for it.

import { courses } from '../courses.js';
import { monsters } from '../sea_monsters.js';
import { esc } from '../fmt.js';
import { T, said, gameName } from '../i18n.js';
import { npcs } from '../barter_npcs.js';
import { nearestWharf } from '../wharves.js';
import { openDialog, closeDialog, toast } from '../dialogs.js';
import { bookmarkXML, writeMode, BOOKMARK_SLOTS, CAMERA_SLOTS, LOOP_SLOTS, FILE_HINT, readGameXML, looksLikeGameXML } from '../worldmap.js';
import { canWriteFiles, gameFolderName, previousBlock } from '../gamefile.js';
import { mv, TRACES_MAX, persist } from './state.js';
import { stopsLive, marksNow, seaBent } from './marks.js';
import { stashRoute, readStash, routeSeq } from './route.js';
import { TRACE_STOPS, cleanTrace, traceAnchors, tracePoints } from './trace.js';

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
	add('favorites', T('Favourites'), r.favorites.map(p => ({ x: p.x, y: p.y, note: p.name })));
	add('cameras', T('Camera slots'), r.cameras.map(p => ({ x: p.x, y: p.y, note: T('Camera {n}', { n: p.index }) })));
	for (const l of r.loops) add(`loop${l.slot}`, T('Loop {n}', { n: l.slot + 1 }), l.points.map(p => ({ x: p.x, y: p.y })));
	gameIn = { sets, dropped: r.dropped, text };
	return gameIn;
}

/** A set as a kept trace: stops while they fit, a drawn line past that. */
function gameSetTrace(g, when) {
	const raw = { name: T('{name} (game)', { name: g.name }), notes: T('From gameVariable.xml, {when}', { when }), points: [], strokes: [], texts: [], areas: [], shown: true, at: Date.now() };
	if (g.points.length <= TRACE_STOPS) raw.points = g.points.map(p => ({ x: p.x, y: p.y, note: p.note }));
	else raw.strokes = [{ pts: g.points.flatMap(p => [p.x, p.y]), colour: mv.inkColour, width: mv.inkWidth }];
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
			if (mv.stops.length && mv.stops.join('.') !== g.stops.join('.')) stashRoute();
			mv.stops = g.stops.slice();
			mv.runTrades = {};
			mv.runStash = readStash(g.calls.map(c => [c.after, c.wharf.name, c.wharf.at, c.wharf.x, c.wharf.y, [], 0, 0]));
			mv.stopsPick = mv.mapPick || '';
			mv.startPort = 0;
			mv.returnHome = false;
			mv.mode = 'route';
			mv.stepIdx = 0;
			routed = g;
			n++;
		} else if (as === 'trace') {
			const t = gameSetTrace(g, when);
			if (!t) continue;
			mv.traces = [t, ...mv.traces.filter(r => r.name !== t.name)].slice(0, TRACES_MAX);
			mv.tracesOn = true;
			if (!first) first = t;
			n++;
		}
	}
	if (!n) return { n: 0 };
	// The chart opens on what came in: the route when one did, else the
	// first trace, ready to be drawn on.
	if (routed) {
		mv.pendingFit = true;
	} else if (first) {
		mv.trace = cleanTrace(first);
		mv.editing = 0;
		mv.mode = 'trace';
		mv.panelOpen = true;
		mv.pendingFit = { points: mv.trace.points.length ? mv.trace.points : traceAnchors(mv.trace) };
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
			const what = `${g.points.length === 1 ? T('{n} point', { n: g.points.length }) : T('{n} points', { n: g.points.length })}${names.length ? ': ' + esc(names.slice(0, 4).join(', ')) + (names.length > 4 ? ', …' : '') : ''}`;
			const on = g.route
				? ` · ${g.stops.length === 1 ? T('{n} barterer', { n: g.stops.length }) : T('{n} barterers', { n: g.stops.length })}${g.calls.length ? `, ${g.calls.length === 1 ? T('{n} wharf call', { n: g.calls.length }) : T('{n} wharf calls', { n: g.calls.length })}` : ''}${g.bends ? `, ${T('{n} on open sea', { n: g.bends })}` : ''}`
				: ` · ${T('none on a barterer')}`;
			return `<label class="map-game-set">
				<span class="map-game-set-name"><b>${esc(g.name)}</b><small>${what}${on}</small></span>
				<select class="purse-inline" data-game-set="${esc(g.key)}">
					<option value="trace"${g.as === 'trace' ? ' selected' : ''}>${T('as a trace')}</option>
					${g.route ? `<option value="route"${g.as === 'route' ? ' selected' : ''}>${T('as the route')}</option>` : ''}
					<option value="skip">${T('leave out')}</option>
				</select>
			</label>`;
		}).join('')}
		${found.dropped ? `<p class="map-game-loopnote">${found.dropped === 1 ? T('{n} point was off the chart and left out.', { n: found.dropped }) : T('{n} points were off the chart and left out.', { n: found.dropped })}</p>` : ''}
	</div>` : gameIn ? `<p class="map-game-fit">${T('Nothing the chart can use in that: no bookmark, camera slot or loop.')}</p>` : '';
	openDialog(`<h2>${T('Bring the game\'s map here')}</h2>
		<p>${T('The favourites, camera slots and loops the game keeps in <code>gameVariable.xml</code>, back onto this chart. Paste the whole file, the <code>&lt;WorldMapQuickScreenPosition&gt;</code> block, or just the lines you want — or open the file. Each set comes in as a trace, or as the route when its points sit on barterers.')}</p>
		<textarea class="map-xml" rows="7" spellcheck="false" data-game-in aria-label="${T('The block from gameVariable.xml')}" placeholder='&lt;BookMark BookMarkName="…" PosX="…" PosY="…" PosZ="…"/&gt;'>${esc(text)}</textarea>
		<div class="map-game-btns">
			<button class="ghost-btn" data-act="map-game-in-file">${T('Open gameVariable.xml…')}</button>
			<button class="ghost-btn" data-act="map-game-in-read">${T('Read it')}</button>
		</div>
		${sets}
		<div class="dialog-actions">
			<button class="ghost-btn" data-close>${T('Close')}</button>
			${found ? `<button class="act" data-act="map-game-in-go">${T('Bring them in')}</button>` : ''}
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
			if (!text.trim()) return toast(T('Paste the block first'));
			if (!looksLikeGameXML(text)) return toast(T('That is not the game’s map: no bookmark, camera slot or loop in it'));
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
				if (!looksLikeGameXML(text)) return toast(T('That file holds no bookmark, camera slot or loop'));
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
			if (!r || !r.n) return toast(T('Nothing chosen to bring in'));
			closeDialog();
			toast(r.routed
				? `${r.routed === 1 ? T('Route plotted: {n} stop from the game\'s map', { n: r.routed }) : T('Route plotted: {n} stops from the game\'s map', { n: r.routed })}${r.n > 1 ? (r.n === 2 ? T(', and {n} trace kept', { n: r.n - 1 }) : T(', and {n} traces kept', { n: r.n - 1 })) : ''}`
				: (r.n === 1 ? T('{n} trace kept from the game\'s map', { n: r.n }) : T('{n} traces kept from the game\'s map', { n: r.n })));
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
		if (!mv.coursesOn.includes(c.id)) continue;
		for (const p of c.points) out.push({ name: p.name || said(c.name), x: p.x, y: p.y });
	}
	for (const m of monsters) {
		if (!mv.huntsOn.includes(m.key) || !m.points.length) continue;
		const mid = m.points.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
		out.push({ name: T('{name} grounds', { name: gameName(m.name) }), x: mid[0] / m.points.length, y: mid[1] / m.points.length });
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
			? `${s.n}: ⚓ ${gameName(s.place.name)} (${gameName(s.place.at)})`
			: `${s.n}: ${gameName(s.place.name)} (${gameName(s.place.at)})`,
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
			? T('Nothing to put on the map: the grounds ticked have no fixed spawn points on the chart')
			: T('Nothing to put on the map yet — plot a stop first'));
	}
	const what = r.source === 'hunt' ? 'hunt' : r.source === 'trace' ? 'traced route' : 'route';
	// Chromium can hold the folder itself; elsewhere the block is pasted.
	const folder = canWriteFiles() ? await gameFolderName() : null;
	const direct = canWriteFiles() ? `<div class="map-game-direct">
			<div class="map-game-direct-head">${T('Or let the app write it')}</div>
			<p>${folder
				? T('Writing to <code>gameVariable.xml</code> in folder <code>{folder}</code>. The first write keeps the untouched file as <code>gameVariable.xml.orig</code>, never overwritten; every write copies the file as it was to <code>gameVariable.xml.bak</code> first. The browser asks once per visit before it touches the folder.', { folder: esc(folder) })
				: T('Choose the <strong>account-number folder</strong> inside <code>UserCache</code> once; the browser remembers it and asks before each write. The first write keeps the untouched file as <code>gameVariable.xml.orig</code>, never overwritten; every write first copies the file as it was to <code>gameVariable.xml.bak</code>.')}
				${T('Do it at the character screen — the game rewrites the file when a character loads.')}</p>
			<div class="map-game-btns">
				<button class="ghost-btn" data-act="map-game-pick">${folder ? T('Choose another folder') : T('Choose the account folder…')}</button>
				<button class="ghost-btn" data-act="map-game-write"${folder ? '' : ' disabled'}>${T('Write it into the game file')}</button>
				${previousBlock() ? `<button class="ghost-btn" data-act="map-game-restore" title="${T('Put back the favourites the last write replaced')}">${T('Restore previous')}</button>` : ''}
			</div>
		</div>` : `<p class="map-game-nodirect">${T('Only Chromium browsers (Chrome, Edge, Brave) can write the file for you; this one cannot, so paste the block by hand.')}</p>`;
	const held = r.bookmarks + r.cameras;
	const fit = r.loop
		? r.loop.bends
			? (r.loop.bends === 1
				? T('Loop {slot} carries all {stops} in order, with {n} turn added to keep the line off the rocks — a loop is a list, not five slots. Your favourites and the map\'s other two loops are left as they are.', { slot: r.loop.slot + 1, stops: r.stops, n: r.loop.bends })
				: T('Loop {slot} carries all {stops} in order, with {n} turns added to keep the line off the rocks — a loop is a list, not five slots. Your favourites and the map\'s other two loops are left as they are.', { slot: r.loop.slot + 1, stops: r.stops, n: r.loop.bends }))
			: T('Loop {slot} carries all {n} in order — a loop is a list, not five slots. Your favourites and the map\'s other two loops are left as they are.', { slot: r.loop.slot + 1, n: r.stops })
		: r.stops <= BOOKMARK_SLOTS
			? T('All {n} fit the map\'s {slots} favourite slots, named.', { n: r.stops, slots: BOOKMARK_SLOTS })
			: r.dropped
				? T('The map\'s Favorites list holds {slots}; points {from}–{to} go on the {cameras} camera slots (the number keys on the map), unnamed but in order, and {n} more do not fit — a loop would hold them all.', { slots: BOOKMARK_SLOTS, from: BOOKMARK_SLOTS + 1, to: held, cameras: CAMERA_SLOTS, n: r.dropped })
				: T('The map\'s Favorites list holds {slots}; points {from}–{to} go on the {cameras} camera slots (the number keys on the map), unnamed but in order.', { slots: BOOKMARK_SLOTS, from: BOOKMARK_SLOTS + 1, to: held, cameras: CAMERA_SLOTS });
	const loopRow = `<div class="map-game-loop">
		<label>${T('Write it as')}
			<select class="purse-inline" data-act="map-game-as">
				<option value=""${gameWrite === 'favorites' ? ' selected' : ''}>${T('favourites — {slots} named, {cameras} camera slots', { slots: BOOKMARK_SLOTS, cameras: CAMERA_SLOTS })}</option>
				${Array.from({ length: LOOP_SLOTS }, (_, i) => `<option value="${i}"${gameWrite === i ? ' selected' : ''}>${T('loop {n} — every point, in order', { n: i + 1 })}</option>`).join('')}
			</select>
		</label>
	</div>`;
	openDialog(`<h2>${r.source === 'hunt' ? T('Put the hunt on the game\'s map') : r.source === 'trace' ? T('Put the traced route on the game\'s map') : T('Put the route on the game\'s map')}</h2>
		<p>${T('Black Desert reads its world map from a file. Paste this block in and the {subject} appear {where}.', {
			subject: what === 'hunt' ? T('courses and grounds you ticked') : T('stops'),
			where: r.loop ? T('as one of the map\'s three navigation loops') : T('under <strong>World Map → Favorites</strong>, numbered in order, each with a locate button')
		})}</p>
		<p class="map-game-fit">${esc(fit)}</p>
		${loopRow}
		<textarea class="map-xml" readonly rows="10" spellcheck="false" aria-label="${T('The XML block for gameVariable.xml')}">${esc(r.xml)}</textarea>
		<div class="map-game-btns">
			<button class="ghost-btn" data-act="map-game-copy">${T('Copy')}</button>
			<button class="ghost-btn" data-act="map-game-save">${T('Download .xml')}</button>
		</div>
		${direct}
		<details class="map-game-how">
			<summary>${T('How to install it')}</summary>
			<ol>
				<li>${T('Go to the <strong>character selection screen</strong>, or close the game — it rewrites this file whenever a character loads, so a paste made while playing is lost.')}</li>
				<li>${T('Open <code>{windows}</code>. On Linux under Steam it is <code>{linux}</code>. The account folder is a number; the <code>gameVariable.xml</code> <em>inside</em> it is the one the map reads, not the one beside it.', { windows: esc(FILE_HINT.windows), linux: esc(FILE_HINT.linux) })}</li>
				<li>${T('Find the <code>&lt;WorldMapQuickScreenPosition Version="4"&gt;</code> block near the end and replace the whole block with this one. It replaces any favourites and camera positions you saved before; to keep camera positions, paste only the <code>&lt;WorldmapBookMark&gt;</code> part.')}</li>
				<li>${T('Save, load a character, open the map: the stops are in Favorites.')}</li>
			</ol>
			<p>${T('The trick is the fishing community\'s — Flockenberger\'s <em>bdo-fish-waypoints</em> is where the file format was worked out.')}</p>
		</details>
		<div class="dialog-actions">
			<button class="ghost-btn" data-act="map-game-in" title="${T('Read favourites, camera slots and loops back out of the game\'s file')}">${T('The other way: bring the game\'s map here')}</button>
			<button class="ghost-btn" data-close>${T('Close')}</button>
		</div>`);
}
