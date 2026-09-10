// A route traced by hand: the Draw tab, its tools and ink, the traces
// kept and their library, and a trace in a link or a file.

import { esc } from '../fmt.js';
import { T, TT, said } from '../i18n.js';
import { routePath, project } from '../map.js';
import { MAX_ZOOM } from '../barter_npcs.js';
import { nearestWater } from '../searoute.js';
import { openDialog, closeDialog, toast } from '../dialogs.js';
import * as store from '../state.js';
import { pathLength, sailRange, fmtRange, fmtDistance } from '../sailing.js';
import { encodeAny, decodeAny } from '../share.js';
import { mv, TRACES_MAX, persist, traceClipNote, restore } from './state.js';
import { seaBent } from './marks.js';
import { paintMap, schedulePaint } from './paint.js';
import { refreshSide } from './render.js';
import { routeSpeed, sailCal } from './route.js';
import { atSea, toggleMeasure, hostSize, inBox } from './view.js';

/* ------------------------------------------------------------------ *
 * a route traced by hand
 *
 * A barter route is a list of islands; a hunting run, a scouting line
 * or "the way I go round the reef" is not. Here the sea itself is the
 * input: a click puts a stop where the pointer is, a stroke is drawn as
 * it is dragged, and every point is a place on the chart -- so it zooms
 * and pans with the tiles and never floats. A stop can carry a note. The
 * whole thing travels in a link, a file, or into the game's own map.
 * ------------------------------------------------------------------ */

const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null; };

// The ink a trace is drawn in: eight colours that hold up over blue
// water, three pen widths, three sizes of writing. A closed set, so a
// trace off a stranger's link can only carry ink this chart knows.
export const INKS = ['#ffd77a', '#7ef0d4', '#7ec8f0', '#c6a0ff', '#ff8f8f', '#9ce87a', '#ff9de0', '#ffffff'];
export const WIDTHS = [{ v: 1.5, label: TT('Fine') }, { v: 2.5, label: TT('Medium') }, { v: 4.5, label: TT('Bold') }];
// One letter each, because they sit inside a 19-pixel button. A language
// that abbreviates differently says so; one that does not leaves them.
export const SIZES = [{ v: 11, label: TT('pen size|S') }, { v: 14, label: TT('pen size|M') }, { v: 19, label: TT('pen size|L') }];
const LINE_INK = '#7ef0d4';
const inkOf = (c, fallback = INKS[0]) => (INKS.includes(c) ? c : fallback);
const widthOf = w => (WIDTHS.some(x => x.v === Number(w)) ? Number(w) : 2.5);
const sizeOf = z => (SIZES.some(x => x.v === Number(z)) ? Number(z) : 14);

export const TRACE_STOPS = 40, TRACE_STROKES = 24, TRACE_WORDS = 24, TRACE_AREAS = 12, AREA_CORNERS = 60;

/** A trace as stored, bounded: forty stops, two dozen strokes of a few
 *  hundred points, two dozen words, a name and notes of sensible
 *  length. Every mark carries `seq`, the order it was made in, so undo
 *  can walk back through stops, strokes and words as they were laid
 *  down. A trace saved before the ink existed has none of that: its
 *  strokes are bare arrays of coordinates and its marks are numbered
 *  as they are read. */
export function cleanTrace(raw) {
	if (!raw || typeof raw !== 'object') return null;
	let seq = 0;
	const stamp = v => { const n = num(v, 1, 1e9); const s = n || seq + 1; seq = Math.max(seq, s); return s; };
	const points = (Array.isArray(raw.points) ? raw.points : []).slice(0, TRACE_STOPS).map(p => {
		const x = num(p && p.x, 0, 200000), y = num(p && p.y, 0, 200000);
		if (x === null || y === null) return null;
		const out = { x, y };
		if (p.note && typeof p.note === 'string') out.note = p.note.slice(0, 120);
		if (INKS.includes(p.colour)) out.colour = p.colour;
		out.seq = stamp(p.seq);
		return out;
	}).filter(Boolean);
	const strokes = (Array.isArray(raw.strokes) ? raw.strokes : []).slice(0, TRACE_STROKES).map(st => {
		const bare = Array.isArray(st);
		const src = bare ? st : (st && Array.isArray(st.pts) ? st.pts : null);
		if (!src) return null;
		const flat = [];
		for (let i = 0; i + 1 < src.length && flat.length < 600; i += 2) {
			const x = num(src[i], 0, 200000), y = num(src[i + 1], 0, 200000);
			if (x !== null && y !== null) flat.push(x, y);
		}
		if (flat.length < 4) return null;
		return {
			pts: flat,
			colour: inkOf(bare ? null : st.colour),
			width: widthOf(bare ? null : st.width),
			seq: stamp(bare ? null : st.seq)
		};
	}).filter(Boolean);
	// An area is a closed shape: three corners at the least, sixty at
	// the most, shaded in its ink.
	const areas = (Array.isArray(raw.areas) ? raw.areas : []).slice(0, TRACE_AREAS).map(a => {
		const src = a && Array.isArray(a.pts) ? a.pts : null;
		if (!src) return null;
		const flat = [];
		for (let i = 0; i + 1 < src.length && flat.length < AREA_CORNERS * 2; i += 2) {
			const x = num(src[i], 0, 200000), y = num(src[i + 1], 0, 200000);
			if (x !== null && y !== null) flat.push(x, y);
		}
		if (flat.length < 6) return null;
		return { pts: flat, colour: inkOf(a.colour), seq: stamp(a.seq) };
	}).filter(Boolean);
	const texts = (Array.isArray(raw.texts) ? raw.texts : []).slice(0, TRACE_WORDS).map(w => {
		const x = num(w && w.x, 0, 200000), y = num(w && w.y, 0, 200000);
		if (x === null || y === null) return null;
		const words = String(w.text || '').slice(0, 60).trim();
		if (!words) return null;
		return { x, y, text: words, colour: inkOf(w.colour), size: sizeOf(w.size), plate: w.plate !== false, seq: stamp(w.seq) };
	}).filter(Boolean);
	if (!points.length && !strokes.length && !texts.length && !areas.length && !raw.name) return null;
	return {
		name: String(raw.name || '').slice(0, 40),
		notes: String(raw.notes || '').slice(0, 400),
		points, strokes, texts, areas,
		seq,
		shown: raw.shown === true,
		lane: raw.lane === true,
		at: Number(raw.at) || Date.now()
	};
}

const blankTrace = () => ({ name: '', notes: '', points: [], strokes: [], texts: [], areas: [], seq: 0, at: Date.now() });

/** The trace being drawn on, made if there is none, and always with
 *  every list a trace has -- one kept from an older version may not. */
function liveTrace() {
	if (!mv.trace) mv.trace = blankTrace();
	if (!Array.isArray(mv.trace.points)) mv.trace.points = [];
	if (!Array.isArray(mv.trace.strokes)) mv.trace.strokes = [];
	if (!Array.isArray(mv.trace.texts)) mv.trace.texts = [];
	if (!Array.isArray(mv.trace.areas)) mv.trace.areas = [];
	return mv.trace;
}

/** Whether a trace holds anything at all. */
const traceHas = t => Boolean(t && (t.points.length || t.strokes.length || (t.texts || []).length || (t.areas || []).length));

/** The next number in the order marks were made in. */
function bumpSeq() {
	const t = liveTrace();
	t.seq = (Number(t.seq) || 0) + 1;
	return t.seq;
}

/** A stop or a word on the chart, by the number it was made with. */
export function markBySeq(kind, seq) {
	const list = mv.trace ? (kind === 'word' ? mv.trace.texts : mv.trace.points) : null;
	return (list || []).find(m => m.seq === seq) || null;
}

/** Every mark on the trace, whatever kind, newest last. */
function traceMarks(t) {
	if (!t) return [];
	return [
		...(t.points || []).map((it, i) => ({ it, i, list: t.points, kind: 'stop' })),
		...(t.strokes || []).map((it, i) => ({ it, i, list: t.strokes, kind: 'stroke' })),
		...(t.texts || []).map((it, i) => ({ it, i, list: t.texts, kind: 'word' })),
		...(t.areas || []).map((it, i) => ({ it, i, list: t.areas, kind: 'area' }))
	].sort((a, b) => (Number(a.it.seq) || 0) - (Number(b.it.seq) || 0));
}

/**
 * The water a traced line actually follows. Two stops with an island
 * between them are not a straight leg: the same routing the barter
 * route uses bends it round, over the sea mask built from the chart's
 * own tiles. While a stop is being carried the straight line is drawn
 * instead -- a search per frame of a drag is a search too many, and
 * the water comes back the moment it is set down.
 */
function traceLine(t) {
	if (!t || t.points.length < 2) return t ? t.points : [];
	return mv.hugWater && !mv.markDrag ? seaBent(t.points) : t.points;
}

/** The traced stops as the route tab counts them: length and time --
 *  along the water when the legs are bent round the land. */
function traceLength() {
	if (!mv.trace || mv.trace.points.length < 2) return 0;
	return pathLength(traceLine(mv.trace));
}

/** How long ago something was kept, in the words a person would use. */
function keptWhen(at) {
	const days = Math.floor((Date.now() - (Number(at) || 0)) / 86400e3);
	if (days <= 0) return T('today');
	if (days === 1) return T('yesterday');
	if (days < 7) return T('{n} days ago', { n: days });
	if (days < 14) return T('last week');
	if (days < 60) return T('{n} weeks ago', { n: Math.round(days / 7) });
	return T('{n} months ago', { n: Math.round(days / 30) });
}

/** A trace at a glance: the shape of it, drawn to fit a stamp. */
function traceThumb(t, w = 52, h = 34) {
	const pts = [...t.points.map(p => [p.x, p.y]), ...traceAnchors(t).map(a => [a.x, a.y])];
	if (!pts.length) return '';
	const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
	const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
	// One scale for both axes, so the drawing keeps its shape.
	const span = Math.max(x1 - x0, y1 - y0, 1);
	const k = (Math.min(w, h) - 8) / span;
	const px = x => (x - (x0 + x1) / 2) * k + w / 2;
	const py = y => (y - (y0 + y1) / 2) * k + h / 2;
	const line = list => {
		let d = '';
		for (const [x, y] of list) d += `${d ? ' L' : 'M'}${px(x).toFixed(1)} ${py(y).toFixed(1)}`;
		return d;
	};
	let out = '';
	if (t.points.length > 1) out += `<path d="${line(t.points.map(p => [p.x, p.y]))}" stroke="${t.points[0].colour || LINE_INK}" stroke-dasharray="3 2"></path>`;
	for (const st of t.strokes || []) {
		const a = Array.isArray(st) ? st : st.pts;
		const list = [];
		for (let i = 0; i + 1 < a.length; i += 2) list.push([a[i], a[i + 1]]);
		out += `<path d="${line(list)}" stroke="${inkOf(Array.isArray(st) ? null : st.colour)}"></path>`;
	}
	for (const p of t.points.slice(0, 10)) out += `<circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="1.8" fill="${p.colour || LINE_INK}" stroke="none"></circle>`;
	for (const wd of (t.texts || []).slice(0, 8)) out += `<rect x="${(px(wd.x) - 4).toFixed(1)}" y="${(py(wd.y) - 1.5).toFixed(1)}" width="8" height="3" rx="1" fill="${inkOf(wd.colour)}" stroke="none"></rect>`;
	return `<svg class="trace-thumb" viewBox="0 0 ${w} ${h}" aria-hidden="true">${out}</svg>`;
}

/** The traces kept on this browser: what each one is, at a glance, with
 *  an eye that lays it over the chart without opening it.
 *
 *  The panel is 300 pixels of a chart nobody wants covered, so it shows
 *  the newest few and whatever is on the water; twenty of them are
 *  browsed in the library, which has the room for a search and a sort.
 */
function traceShelf() {
	if (!mv.traces.length) {
		return `<div class="map-courses-head">${T('Kept traces')}</div>
			<p class="map-hint">${T('None kept yet. Draw a route, name it, and press <b>Keep</b> — up to {max} live on this browser, and any of them can be laid over the chart with its eye.', { max: TRACES_MAX })}</p>`;
	}
	const shown = mv.traces.filter(r => r.shown).length;
	const SHELF = 4;
	const near = mv.traces.filter((r, i) => r.shown || i < SHELF);
	const rest = mv.traces.length - near.length;
	const cards = near.map(r => traceCard(r, mv.traces.indexOf(r))).join('');
	return `<div class="map-courses-head">${T('Kept traces')} <span class="map-courses-credit">${T('{n} of {max}', { n: mv.traces.length, max: TRACES_MAX })}${shown ? ` · ${T('{n} on the chart', { n: shown })}` : ''}</span></div>
		<div class="trace-shelf">${cards}</div>
		<div class="map-side-btns">
			<button class="ghost-btn wide" data-act="trace-library">${rest > 0 ? T('Browse all {n}…', { n: mv.traces.length }) : T('Browse the traces…')}</button>
			${shown ? `<button class="ghost-btn" data-act="trace-eye-none">${T('Clear the chart')}</button>` : ''}
		</div>`;
}

/** One trace as a card, on the shelf or in the library. */
function traceCard(r, i) {
	{
		const bits = [
			r.points.length === 1 ? T('{n} stop', { n: r.points.length }) : T('{n} stops', { n: r.points.length }),
			r.strokes.length ? (r.strokes.length === 1 ? T('{n} stroke', { n: r.strokes.length }) : T('{n} strokes', { n: r.strokes.length })) : '',
			(r.texts || []).length ? (r.texts.length === 1 ? T('{n} word', { n: r.texts.length }) : T('{n} words', { n: r.texts.length })) : ''
		].filter(Boolean).join(' · ');
		const open = mv.trace && mv.trace.name && mv.trace.name === r.name;
		return `<div class="trace-card${r.shown ? ' shown' : ''}${open ? ' open' : ''}" data-trace="${esc(r.name)}">
			<button class="trace-eye" data-act="trace-eye" data-i="${i}" aria-pressed="${!!r.shown}"
				title="${r.shown ? T('Take it off the chart') : T('Lay it over the chart')}" aria-label="${r.shown ? T('Hide {name} on the chart', { name: esc(r.name || T('this trace')) }) : T('Show {name} on the chart', { name: esc(r.name || T('this trace')) })}">${r.shown ? '◉' : '○'}</button>
			<span class="trace-thumb-box">${traceThumb(r)}</span>
			<span class="trace-card-main">
				<span class="trace-card-name">${esc(r.name || T('untitled'))}${open ? `<span class="trace-card-tag">${T('open')}</span>` : ''}${r.lane ? `<span class="trace-card-tag lane">${T('lane')}</span>` : ''}</span>
				<span class="trace-card-sub">${bits} · ${T('kept {when}', { when: keptWhen(r.at) })}</span>
				${r.notes ? `<span class="trace-card-note">${esc(r.notes)}</span>` : ''}
			</span>
			<span class="trace-card-btns">
				<button class="ghost-btn tiny" data-act="trace-load" data-i="${i}" title="${T('Open it to draw on')}">${T('Open')}</button>
				<button class="ghost-btn tiny${r.lane ? ' on' : ''}" data-act="trace-lane" data-i="${i}" aria-pressed="${!!r.lane}" title="${r.lane ? T('A lane the game sails: every route near it is drawn along it. Press to make it a plain trace again') : T('Mark it as a lane the game sails, so every route near it is drawn along it and timed as the game would sail it')}" aria-label="${r.lane ? T('Stop treating {name} as a lane the game sails', { name: esc(r.name || T('this trace')) }) : T('Treat {name} as a lane the game sails', { name: esc(r.name || T('this trace')) })}">⚓</button>
				<button class="ghost-btn tiny" data-act="trace-rename" data-i="${i}" title="${T('Rename it')}" aria-label="${T('Rename {name}', { name: esc(r.name || T('this trace')) })}">✎</button>
				<button class="ghost-btn tiny" data-act="trace-share" data-i="${i}" title="${T('Copy a link to it')}" aria-label="${T('Copy a link to {name}', { name: esc(r.name || T('this trace')) })}">↗</button>
				<button class="map-x" data-act="trace-del" data-i="${i}" aria-label="${T('Forget {name}', { name: esc(r.name || T('this trace')) })}">×</button>
			</span>
		</div>`;
	}
}

export function traceHTML() {
	const t = mv.trace || blankTrace();
	const words = t.texts || [];
	const dot = id => (id === 'point' ? LINE_INK : mv.inkColour);
	const tool = (id, label, hint) => `<button class="map-course${mv.traceTool === id ? ' on' : ''}" data-act="trace-tool" data-id="${id}" aria-pressed="${mv.traceTool === id}">
		<span class="map-course-dot" style="background:${dot(id)}"></span>
		<span class="map-row-main"><span class="map-row-name">${label}</span><span class="map-row-sub">${hint}</span></span></button>`;
	const swatch = c => `<button class="map-ink${c === mv.inkColour ? ' on' : ''}" data-act="trace-ink" data-colour="${c}" style="--ink:${c}" aria-pressed="${c === mv.inkColour}" aria-label="${T('Draw in {colour}', { colour: c })}" title="${T('Draw in this colour')}"></button>`;
	const pick = (act, list, now, unit) => list.map(o => `<button class="map-pen${o.v === now ? ' on' : ''}" data-act="${act}" data-v="${o.v}" aria-pressed="${o.v === now}" title="${said(o.label)}">${
		unit === 'pen' ? `<span class="map-pen-bar" style="height:${Math.max(2, o.v)}px;background:${mv.inkColour}"></span>` : `<span style="font-size:${Math.round(o.v * 0.8)}px">${said(o.label)}</span>`
	}</button>`).join('');
	const stops = t.points.map((p, i) => `<div class="map-trace-stop">
		<span class="map-trace-n" style="border-color:${p.colour || LINE_INK};color:${p.colour || LINE_INK}">${i + 1}</span>
		<input class="field small" type="text" maxlength="120" placeholder="${T('a note for this stop')}" value="${esc(p.note || '')}" data-act="trace-point-note" data-i="${i}" aria-label="${T('Note for stop {n}', { n: i + 1 })}">
		<button class="map-x" data-act="trace-point-del" data-i="${i}" aria-label="${T('Remove stop {n}', { n: i + 1 })}">×</button>
	</div>`).join('');
	const wordRows = words.map((w, i) => `<div class="map-trace-stop">
		<button class="map-trace-n word" style="border-color:${w.colour};color:${w.colour}" data-act="trace-text-ink" data-i="${i}" aria-label="${T('Restyle word {n}', { n: i + 1 })}" title="${T('Give this word the ink and size chosen above')}">✎</button>
		<input class="field small" type="text" maxlength="60" placeholder="${T('the word on the chart')}" value="${esc(w.text)}" data-act="trace-text" data-i="${i}" aria-label="${T('Word {n}', { n: i + 1 })}">
		<button class="map-x" data-act="trace-text-del" data-i="${i}" aria-label="${T('Remove word {n}', { n: i + 1 })}">×</button>
	</div>`).join('');
	const m = traceLength();
	const speed = routeSpeed();
	const time = m ? fmtRange(...sailRange(m, speed.total, sailCal(), Number(store.getSetting('sailCal', null)) > 0)) : '';
	const has = traceHas(t) || Boolean(mv.areaDraft);
	const areaRows = (t.areas || []).map((a, i) => `<div class="map-trace-stop">
		<span class="map-trace-n area" style="border-color:${a.colour};color:${a.colour};background:${a.colour}22">▰</span>
		<span class="map-row-sub">${T('an area of {n} corners', { n: a.pts.length / 2 })}</span>
		<button class="map-x" data-act="trace-area-del" data-i="${i}" aria-label="${T('Remove area {n}', { n: i + 1 })}">×</button>
	</div>`).join('');
	const saved = traceShelf();
	return `<div class="map-courses">
		<div class="map-courses-head">${T('Tools')} <span class="map-courses-credit">${T('the islands sit still while you draw')}</span></div>
		${tool('point', T('Add stops'), T('click the sea for a numbered stop; drag one to move it'))}
		${tool('pen', T('Draw'), T('drag to draw a line; it stays with the chart'))}
		${tool('text', T('Write'), T('click the sea and type; drag a word to move it, click it to retype'))}
		${tool('area', T('Shade an area'), T('click its corners; click the first again to close it'))}
		${mv.areaDraft ? `<div class="map-side-btns map-area-draft"><span class="map-hint">${mv.areaDraft.length === 2 ? T('{n} corner so far', { n: mv.areaDraft.length / 2 }) : T('{n} corners so far', { n: mv.areaDraft.length / 2 })}</span>
			<button class="ghost-btn" data-act="trace-area-close" ${mv.areaDraft.length >= 6 ? '' : 'disabled'}>${T('Close the shape')}</button>
			<button class="ghost-btn danger" data-act="trace-area-drop">${T('Drop it')}</button></div>` : ''}
		<div class="map-inks" role="group" aria-label="${T('Ink colour')}">${INKS.map(swatch).join('')}</div>
		<div class="map-style-row">
			<span class="map-style-label">${T('Stroke')}</span><span class="map-pens">${pick('trace-width', WIDTHS, mv.inkWidth, 'pen')}</span>
			<span class="map-style-label">${T('Words')}</span><span class="map-pens">${pick('trace-size', SIZES, mv.inkSize, 'text')}</span>
			<button class="map-pen wide${mv.inkPlate ? ' on' : ''}" data-act="trace-plate" aria-pressed="${mv.inkPlate}" title="${T('A dark plate behind a word, to read it over bright water')}">${T('plate')}</button>
		</div>
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="trace-undo" ${has ? '' : 'disabled'} title="${T('Take back the last mark, whatever kind it was')}">↶ ${T('Undo')}</button>
			<button class="ghost-btn" data-act="trace-clear" ${has ? '' : 'disabled'}>${T('Clear')}</button>
			<button class="ghost-btn${mv.tracesOn ? ' on' : ''}" data-act="map-traces" aria-pressed="${mv.tracesOn}" title="${T('Show or hide everything traced, without losing any of it')}">${mv.tracesOn ? `◉ ${T('Shown')}` : `○ ${T('Hidden')}`}</button>
			<button class="ghost-btn${mv.hugWater ? ' on' : ''}" data-act="trace-hug" aria-pressed="${mv.hugWater}" title="${T('Bend each leg round the land between its stops, the way the barter route is drawn')}">${mv.hugWater ? `⛵ ${T('Round the land')}` : `↗ ${T('Straight legs')}`}</button>
		</div>
	</div>
	<div class="map-courses">
		<input class="field" type="text" maxlength="40" placeholder="${T('Name this route')}" value="${esc(t.name)}" data-act="trace-name" aria-label="${T('Name of the traced route')}">
		<textarea class="field map-trace-notes" maxlength="400" rows="2" placeholder="${T('Notes — what it is for, when to sail it, what to watch')}" data-act="trace-notes" aria-label="${T('Notes')}">${esc(t.notes)}</textarea>
		${t.points.length ? `<div class="map-trace-stops">${stops}</div>` : `<p class="map-hint">${T('No stops yet. Pick <b>Add stops</b> and click the sea, <b>Draw</b> and drag to sketch, or <b>Write</b> and type on the water.')}</p>`}
		${words.length ? `<div class="map-courses-head">${T('Words on the chart')}</div><div class="map-trace-stops">${wordRows}</div>` : ''}
		${areaRows ? `<div class="map-courses-head">${T('Areas shaded')}</div><div class="map-trace-stops">${areaRows}</div>` : ''}
		${m ? `<p class="map-hint">${T('{distance} stop to stop', { distance: esc(fmtDistance(m)) })}${time ? ` · ${T('≈ {time} at {percent}%', { time: esc(time), percent: speed.total })}` : ''}</p>` : ''}
		<div class="map-side-btns">
			<button class="act small" data-act="trace-save" ${has ? '' : 'disabled'} title="${T('Keep it on this browser, by name')}">${T('Keep')}</button>
			<button class="ghost-btn" data-act="trace-link" ${has ? '' : 'disabled'} title="${T('A link that carries the whole trace — stops, notes, drawing and words')}">${T('Copy link')}</button>
			<button class="ghost-btn" data-act="trace-export" ${has ? '' : 'disabled'} title="${T('A JSON file of it')}">${T('File')}</button>
			<button class="ghost-btn" data-act="map-game" data-source="trace" ${t.points.length ? '' : 'disabled'} title="${T('Write the stops into the game\'s world map as favourites or a loop')}">⚑ ${T('To the game')}</button>
		</div>
	</div>
	${saved}`;
}

/** One trace's ink on the chart: the line through its stops, the stops
 *  themselves with their notes, every stroke drawn, and every word
 *  written -- each in the ink it was made with. `live` is the trace
 *  being worked on; a kept one laid over the chart is drawn quieter and
 *  does not take the pen's unfinished stroke. */
function traceArt(t, size, live) {
	let html = '';
	const P = p => project(mv.mapState, size, p.x, p.y);
	if (t.points.length > 1) {
		const d = routePath(traceLine(t).map(P), size, mv.hugWater ? 0 : 0.16);
		const c = t.points[0].colour || LINE_INK;
		html += `<svg class="map-route map-trace-line"><path class="map-trace-glow" style="stroke:${c}" d="${d}"></path><path class="map-trace-path" style="stroke:${c}" d="${d}"></path></svg>`;
	}
	// Areas first, under everything: a shaded water with its edge in the
	// same ink, and the one being cornered as a dashed open line.
	for (const a of (t.areas || [])) {
		let d = '';
		for (let i = 0; i + 1 < a.pts.length; i += 2) {
			const at = project(mv.mapState, size, a.pts[i], a.pts[i + 1]);
			d += `${d ? ' L' : 'M'}${at.left.toFixed(1)} ${at.top.toFixed(1)}`;
		}
		if (d) html += `<svg class="map-route map-trace-line"><path class="map-trace-area" style="fill:${inkOf(a.colour)};stroke:${inkOf(a.colour)}" d="${d} Z"></path></svg>`;
	}
	if (live && mv.areaDraft) {
		let d = '';
		const dots = [];
		for (let i = 0; i + 1 < mv.areaDraft.length; i += 2) {
			const at = project(mv.mapState, size, mv.areaDraft[i], mv.areaDraft[i + 1]);
			d += `${d ? ' L' : 'M'}${at.left.toFixed(1)} ${at.top.toFixed(1)}`;
			dots.push(`<circle class="map-trace-corner${i ? '' : ' first'}" cx="${at.left.toFixed(1)}" cy="${at.top.toFixed(1)}" r="${i ? 3 : 6}" style="stroke:${mv.inkColour};fill:${i ? mv.inkColour : 'transparent'}"></circle>`);
		}
		html += `<svg class="map-route map-trace-line"><path class="map-trace-draft" style="stroke:${mv.inkColour}" d="${d}"></path>${dots.join('')}</svg>`;
	}
	const strokes = live && mv.penStroke ? [...t.strokes, { pts: mv.penStroke, colour: mv.inkColour, width: mv.inkWidth }] : t.strokes;
	for (const st of strokes) {
		const pts = Array.isArray(st) ? st : st.pts;
		let d = '';
		for (let i = 0; i + 1 < pts.length; i += 2) {
			const at = project(mv.mapState, size, pts[i], pts[i + 1]);
			d += `${d ? ' L' : 'M'}${at.left.toFixed(1)} ${at.top.toFixed(1)}`;
		}
		if (d) html += `<svg class="map-route map-trace-line"><path class="map-trace-stroke" style="stroke:${inkOf(st.colour)};stroke-width:${widthOf(st.width)}" d="${d}"></path></svg>`;
	}
	const onScreen = at => at.left > -40 && at.top > -40 && at.left < size.w + 40 && at.top < size.h + 40;
	t.points.forEach((p, i) => {
		const at = P(p);
		if (!onScreen(at)) return;
		const c = p.colour || LINE_INK;
		const note = live && p.note ? `<span class="map-trace-note">${esc(p.note)}</span>` : '';
		html += `<span class="map-trace-dot${p.note ? ' noted' : ''}"${live ? ` data-mark="stop" data-seq="${p.seq}"` : ''} style="left:${Math.round(at.left)}px;top:${Math.round(at.top)}px;border-color:${c};color:${c}" title="${esc(p.note || T('stop {n}', { n: i + 1 }))}${live && mv.mode === 'trace' ? ` · ${T('drag it to move it')}` : ''}">${i + 1}${note}</span>`;
	});
	for (const w of (t.texts || [])) {
		if (live && w.seq === mv.editing) continue;          // that one is an input, below
		const at = P(w);
		if (!onScreen(at) || !w.text) continue;
		html += `<span class="map-trace-word${w.plate ? ' plate' : ''}"${live ? ` data-mark="word" data-seq="${w.seq}" title="${T('Drag it where it belongs · click to retype it')}"` : ''} style="left:${Math.round(at.left)}px;top:${Math.round(at.top)}px;color:${inkOf(w.colour)};font-size:${sizeOf(w.size)}px">${esc(w.text)}</span>`;
	}
	return html;
}

/** Everything traced that is meant to be seen: the kept traces with an
 *  eye open on them, then the one being worked on over the top. */
export function paintTrace(layer, size) {
	let box = layer._traceBox;
	if (!box || box.parentNode !== layer) {
		box = layer._traceBox = document.createElement('div');
		box.className = 'map-trace-layer';
		layer.appendChild(box);
	}
	// The drawing is rebuilt whole at every paint; the word being typed
	// is not, so it lives beside it rather than inside it.
	let art = box._art;
	if (!art || art.parentNode !== box) {
		art = box._art = document.createElement('div');
		art.className = 'map-trace-art';
		box.appendChild(art);
	}
	const open = mv.trace && mv.trace.name ? mv.trace.name : null;
	// A kept trace that is open is the one being drawn on; it must not
	// also be painted underneath itself.
	const ghosts = mv.tracesOn ? mv.traces.filter(r => r.shown && r.name !== open) : [];
	const t = mv.tracesOn ? mv.trace : null;
	const empty = !traceHas(t) && !mv.penStroke && !mv.areaDraft;
	if (empty && !ghosts.length) {
		art.innerHTML = '';
		paintWriting(box, size);
		return;
	}
	let html = '';
	for (const g of ghosts) html += `<div class="map-trace-ghost">${traceArt(g, size, false)}</div>`;
	// The first stroke is drawn before there is a trace to hold it.
	if (!empty) html += traceArt(t || blankTrace(), size, true);
	art.innerHTML = html;
	paintWriting(box, size);
}

/** The word being typed is a real input standing on the chart. It is
 *  kept across paints -- rebuilt with the rest it would lose the caret
 *  at every pan -- and only moved. */
function paintWriting(box, size) {
	const item = mv.editing && mv.trace ? (mv.trace.texts || []).find(w => w.seq === mv.editing) : null;
	let edit = box._edit;
	if (edit && (!item || box._editSeq !== mv.editing || edit.parentNode !== box)) { edit.remove(); edit = box._edit = null; }
	if (!item) return;
	if (!edit) {
		edit = box._edit = document.createElement('input');
		box._editSeq = mv.editing;
		edit.className = 'map-trace-write';
		edit.type = 'text';
		edit.maxLength = 60;
		edit.placeholder = T('write here');
		edit.setAttribute('aria-label', T('Word on the chart'));
		edit.value = item.text || '';
		edit.addEventListener('input', () => { item.text = edit.value.slice(0, 60); });
		edit.addEventListener('keydown', e => {
			if (e.key === 'Enter') { e.preventDefault(); endWriting(); }
			else if (e.key === 'Escape') { e.preventDefault(); item.text = ''; endWriting(); }
			e.stopPropagation();
		});
		// Losing focus is done typing -- unless the input was torn out
		// from under the pointer. Anything that redraws the whole screen
		// rebuilds the layer this stands in, and the browser blurs what
		// it removes: taking that for "done" threw the word away
		// mid-word. The answer waits a tick, when the removal has
		// settled: gone from the page, the word stays open and the next
		// paint stands it back up where it was.
		edit.addEventListener('blur', () => setTimeout(() => { if (edit.isConnected) endWriting(); }, 0));
		box.appendChild(edit);
		setTimeout(() => { if (box._edit === edit) edit.focus(); }, 0);
	}
	const at = project(mv.mapState, size, item.x, item.y);
	edit.style.left = `${Math.round(Math.max(4, Math.min(size.w - 130, at.left)))}px`;
	edit.style.top = `${Math.round(Math.max(4, Math.min(size.h - 30, at.top)))}px`;
	edit.style.color = inkOf(item.colour);
	edit.style.fontSize = `${sizeOf(item.size)}px`;
}

/** An empty word is no word at all: the only one kept is the one being
 *  typed at this moment. */
function dropBlankWords() {
	if (!mv.trace || !Array.isArray(mv.trace.texts)) return;
	mv.trace.texts = mv.trace.texts.filter(w => String(w.text || '').trim() || w.seq === mv.editing);
}

/** Done typing. */
export function endWriting() {
	if (!mv.editing) return;
	mv.editing = 0;
	dropBlankWords();
	persist();
	refreshSide();
	paintMap();
}

/** The nearest water to a point clicked, when it is close enough to
 *  have been meant -- a stop is a place a hull can float, so one put on
 *  a headland steps off it rather than sitting in a field. */
export function onWater(p) {
	const wet = nearestWater(p.x, p.y);
	if (!wet) return null;
	return { x: Math.round(wet.x), y: Math.round(wet.y) };
}

export function traceAdd(host, clientX, clientY) {
	const t = liveTrace();
	if (t.points.length >= TRACE_STOPS) return toast(T('{n} stops is the most a trace holds', { n: TRACE_STOPS }));
	const at = atSea(host, clientX, clientY);
	const wet = onWater(at);
	if (!wet) return toast(T('A stop belongs on the water'));
	t.points.push({ ...wet, colour: mv.inkColour, seq: bumpSeq() });
	persist();
	refreshSide();
	paintMap();
}

export function textAdd(host, clientX, clientY) {
	const t = liveTrace();
	// Whatever was open and still blank was never a word.
	mv.editing = 0;
	dropBlankWords();
	if (t.texts.length >= TRACE_WORDS) return toast(T('{n} words is the most a trace holds', { n: TRACE_WORDS }));
	const w = { ...atSea(host, clientX, clientY), text: '', colour: mv.inkColour, size: mv.inkSize, plate: mv.inkPlate, seq: bumpSeq() };
	t.texts.push(w);
	mv.editing = w.seq;
	persist();
	refreshSide();
	paintMap();
}

export function penStart(host, clientX, clientY) {
	const p = atSea(host, clientX, clientY);
	mv.penStroke = [p.x, p.y];
}

export function penMove(host, clientX, clientY) {
	if (!mv.penStroke) return;
	const p = atSea(host, clientX, clientY);
	// One point every few screen pixels: enough for a curve, few enough
	// to travel in a link.
	const scale = Math.pow(2, MAX_ZOOM - mv.mapState.zoom);
	const lx = mv.penStroke[mv.penStroke.length - 2], ly = mv.penStroke[mv.penStroke.length - 1];
	if (Math.hypot(p.x - lx, p.y - ly) < 4 * scale) return;
	if (mv.penStroke.length < 1200) mv.penStroke.push(p.x, p.y);
	schedulePaint();
}

export function penEnd() {
	if (!mv.penStroke) return;
	if (mv.penStroke.length >= 4) {
		const t = liveTrace();
		if (t.strokes.length >= TRACE_STROKES) toast(T('{n} strokes is the most a trace holds', { n: TRACE_STROKES }));
		else t.strokes.push({ pts: mv.penStroke, colour: mv.inkColour, width: mv.inkWidth, seq: bumpSeq() });
	}
	mv.penStroke = null;
	persist();
	refreshSide();
	paintMap();
}

export function setTraceTool(id) {
	if (mv.editing) endWriting();
	mv.traceTool = mv.traceTool === id ? null : (['pen', 'point', 'text', 'area'].includes(id) ? id : null);
	if (mv.traceTool && mv.measuring) toggleMeasure();
	// A shape half-cornered dies with the tool that was cornering it.
	if (mv.traceTool !== 'area' && mv.areaDraft) { mv.areaDraft = null; paintMap(); }
	markTraceHost();
	if (mv.traceTool === 'point') toast(T('Click the sea to add a stop'));
	if (mv.traceTool === 'pen') toast(T('Drag on the sea to draw'));
	if (mv.traceTool === 'text') toast(T('Click the sea, then type'));
	if (mv.traceTool === 'area') toast(T('Click the corners of the water to shade; click the first one again to close it'));
	refreshSide();
}

/** One corner more on the area being shaded -- or, on the first
 *  corner again, the shape closed. */
export function areaAdd(host, clientX, clientY) {
	const p = atSea(host, clientX, clientY);
	if (mv.areaDraft && mv.areaDraft.length >= 6) {
		const first = project(mv.mapState, hostSize(host), mv.areaDraft[0], mv.areaDraft[1]);
		const at = inBox(host, clientX, clientY);
		if (Math.hypot(at.x - first.left, at.y - first.top) < 14) return areaClose();
	}
	if (!mv.areaDraft) mv.areaDraft = [];
	if (mv.areaDraft.length >= AREA_CORNERS * 2) return toast(T('{n} corners is the most an area holds', { n: AREA_CORNERS }));
	mv.areaDraft.push(p.x, p.y);
	refreshSide();
	paintMap();
}

function areaClose() {
	if (!mv.areaDraft || mv.areaDraft.length < 6) return;
	const t = liveTrace();
	if (t.areas.length >= TRACE_AREAS) toast(T('{n} areas is the most a trace holds', { n: TRACE_AREAS }));
	else t.areas.push({ pts: mv.areaDraft, colour: mv.inkColour, seq: bumpSeq() });
	mv.areaDraft = null;
	persist();
	refreshSide();
	paintMap();
}

/** The map box wears what is going on: which tool has the pointer, and
 *  whether the chart's own markers are listening at all. */
export function markTraceHost() {
	const host = document.querySelector('[data-map]');
	if (!host) return;
	host.classList.toggle('tracing', Boolean(mv.traceTool));
	for (const id of ['pen', 'point', 'text', 'area']) host.classList.toggle(`tool-${id}`, mv.traceTool === id);
	host.classList.toggle('free-hand', mv.mode === 'trace');
}

/** Every trace-* action from the panel. Returns true when it was one. */
export function traceAction(act, el) {
	const i = Number(el && el.dataset.i);
	switch (act) {
		case 'trace-tool': setTraceTool(el.dataset.id); return true;
		case 'trace-ink': {
			mv.inkColour = inkOf(el.dataset.colour);
			const w = mv.editing && mv.trace ? mv.trace.texts.find(x => x.seq === mv.editing) : null;
			if (w) w.colour = mv.inkColour;
			break;
		}
		case 'trace-width': mv.inkWidth = widthOf(el.dataset.v); break;
		case 'trace-size': {
			mv.inkSize = sizeOf(el.dataset.v);
			const w = mv.editing && mv.trace ? mv.trace.texts.find(x => x.seq === mv.editing) : null;
			if (w) w.size = mv.inkSize;
			break;
		}
		case 'trace-plate': {
			mv.inkPlate = !mv.inkPlate;
			const w = mv.editing && mv.trace ? mv.trace.texts.find(x => x.seq === mv.editing) : null;
			if (w) w.plate = mv.inkPlate;
			break;
		}
		case 'trace-text-ink': {
			const w = mv.trace && mv.trace.texts[i];
			if (!w) return true;
			w.colour = mv.inkColour; w.size = mv.inkSize; w.plate = mv.inkPlate;
			break;
		}
		case 'trace-text-del':
			if (mv.trace && mv.trace.texts[i]) {
				if (mv.trace.texts[i].seq === mv.editing) mv.editing = 0;
				mv.trace.texts.splice(i, 1);
			}
			break;
		case 'trace-area-close': areaClose(); return true;
		case 'trace-area-drop': mv.areaDraft = null; break;
		case 'trace-area-del': if (mv.trace && mv.trace.areas && mv.trace.areas[i]) mv.trace.areas.splice(i, 1); break;
		case 'trace-undo': {
			// A corner being placed goes back before anything kept does.
			if (mv.areaDraft) {
				mv.areaDraft = mv.areaDraft.length > 2 ? mv.areaDraft.slice(0, -2) : null;
				break;
			}
			// Back through the marks in the order they were made, so a
			// stroke drawn after a stop is the first thing taken back --
			// not every stop first because stops are a different list.
			const marks = traceMarks(mv.trace);
			const last = marks[marks.length - 1];
			if (!last) return true;
			if (last.kind === 'word' && last.it.seq === mv.editing) mv.editing = 0;
			last.list.splice(last.i, 1);
			break;
		}
		case 'trace-clear': mv.trace = null; mv.traceTool = null; mv.editing = 0; mv.areaDraft = null; break;
		case 'trace-point-del': if (mv.trace && mv.trace.points[i]) mv.trace.points.splice(i, 1); break;
		case 'trace-save': {
			const t = mv.trace;
			if (!traceHas(t)) return true;
			const name = t.name.trim() || `Trace ${mv.traces.length + 1}`;
			t.name = name;
			// A copy, not the live object: a kept trace has to stand still
			// while the next stroke goes on the one being drawn.
			mv.traces = [{ ...JSON.parse(JSON.stringify(t)), at: Date.now() }, ...mv.traces.filter(r => r.name !== name)].slice(0, TRACES_MAX);
			const clip = traceClipNote(t);
			toast(clip ? T('Kept “{name}” — {clip}', { name, clip }) : T('Kept “{name}”', { name }));
			break;
		}
		case 'trace-hug': mv.hugWater = !mv.hugWater; break;
		case 'trace-library': openTraceLibrary(); return true;
		case 'trace-lib-sort': mv.libSort = ['recent', 'name', 'size'].includes(el.dataset.id) ? el.dataset.id : 'recent'; refreshLibrary(); return true;
		case 'trace-lib-only': mv.libOnly = el.dataset.id === 'shown' ? 'shown' : 'all'; refreshLibrary(); return true;
		case 'trace-eye': if (mv.traces[i]) { mv.traces[i].shown = !mv.traces[i].shown; if (mv.traces[i].shown) mv.tracesOn = true; } break;
		case 'trace-lane':
			if (mv.traces[i]) {
				if (!mv.traces[i].lane && mv.traces[i].points.length < 2) { toast(T('A lane needs at least two stops to run between')); return true; }
				mv.traces[i].lane = !mv.traces[i].lane;
				toast(mv.traces[i].lane ? T('Routes near “{name}” now follow it', { name: mv.traces[i].name }) : T('“{name}” is a plain trace again', { name: mv.traces[i].name }));
			}
			break;
		case 'trace-eye-none': mv.traces = mv.traces.map(r => ({ ...r, shown: false })); break;
		case 'trace-rename': {
			const r = mv.traces[i];
			if (!r) return true;
			renameTraceDialog(i);
			return true;
		}
		case 'trace-share': {
			const r = mv.traces[i];
			if (!r) return true;
			(async () => {
				try {
					await navigator.clipboard.writeText(traceLink(await encodeAny({
						app: 'bdo-ship-upgrade-tracker', kind: 'trace', version: 2, exported: new Date().toISOString(),
						name: r.name, notes: r.notes, points: r.points, strokes: r.strokes, texts: r.texts || []
					})));
					toast(T('Link to “{name}” copied', { name: r.name }));
				} catch { toast(T('Could not reach the clipboard')); }
			})();
			return true;
		}
		case 'trace-load':
			if (mv.traces[i]) { mv.trace = cleanTrace(mv.traces[i]); mv.editing = 0; mv.pendingFit = { points: mv.trace.points.length ? mv.trace.points : traceAnchors(mv.trace) }; }
			// Opened from the library, the chart is what you wanted to see.
			if (mv.libOpen) { mv.libOpen = false; closeDialog(); }
			break;
		case 'trace-del': mv.traces = mv.traces.filter((_, k) => k !== i); break;
		case 'trace-link':
			(async () => {
				try {
					await navigator.clipboard.writeText(traceLink(await encodeAny(traceExportObject())));
					toast(T('Trace link copied'));
				} catch { toast(T('Could not reach the clipboard')); }
			})();
			return true;
		case 'trace-export': {
			const blob = new Blob([JSON.stringify(traceExportObject(), null, 2)], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url; a.download = `${(mv.trace && mv.trace.name.trim()) || 'trace'}.json`;
			document.body.appendChild(a); a.click(); a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			return true;
		}
		default: return false;
	}
	persist();
	refreshSide();
	if (mv.libOpen) refreshLibrary();
	paintMap();
	return true;
}

/* ------------------------------------------------------------------ *
 * the traces library
 *
 * Twenty traces do not belong in a 300-pixel column beside the chart.
 * The library is the width of a dialog: a search, a sort, a filter and
 * the cards in a grid big enough to tell one drawing from another at a
 * glance. The cards are the shelf's own, so there is one set of
 * buttons to learn and one to maintain.
 * ------------------------------------------------------------------ */

/** The kept traces the library is showing, in the order it shows them. */
function libraryList() {
	const q = mv.libQ.trim().toLowerCase();
	let list = mv.traces.map((r, i) => ({ r, i }));
	if (mv.libOnly === 'shown') list = list.filter(e => e.r.shown);
	if (q) list = list.filter(e => `${e.r.name} ${e.r.notes} ${(e.r.texts || []).map(w => w.text).join(' ')}`.toLowerCase().includes(q));
	const size = r => r.points.length + r.strokes.length + (r.texts || []).length;
	if (mv.libSort === 'name') list.sort((a, b) => a.r.name.localeCompare(b.r.name));
	else if (mv.libSort === 'size') list.sort((a, b) => size(b.r) - size(a.r));
	else list.sort((a, b) => (b.r.at || 0) - (a.r.at || 0));
	return list;
}

function libraryHTML() {
	const list = libraryList();
	const shown = mv.traces.filter(r => r.shown).length;
	const chip = (act, id, now, label) => `<button class="chip tiny${now ? ' active' : ''}" data-act="${act}" data-id="${id}" aria-pressed="${now}">${label}</button>`;
	const cards = list.length
		? `<div class="trace-grid">${list.map(e => traceCard(e.r, e.i)).join('')}</div>`
		: `<p class="dialog-copy">${mv.libOnly === 'shown' ? T('Nothing here answers to “{q}”, among the ones on the chart.', { q: esc(mv.libQ) }) : T('Nothing here answers to “{q}”.', { q: esc(mv.libQ) })}</p>`;
	return `<div class="lib-bar">
			<input class="field" type="search" placeholder="${T('Search names, notes, and the words written on them')}"
				value="${esc(mv.libQ)}" data-lib-search aria-label="${T('Search the traces')}">
		</div>
		<div class="lib-bar">
			<span class="lib-label">${T('Sort')}</span>
			${chip('trace-lib-sort', 'recent', mv.libSort === 'recent', T('newest'))}
			${chip('trace-lib-sort', 'name', mv.libSort === 'name', T('name'))}
			${chip('trace-lib-sort', 'size', mv.libSort === 'size', T('biggest'))}
			<span class="lib-label">${T('Show')}</span>
			${chip('trace-lib-only', 'all', mv.libOnly === 'all', T('all {n}', { n: mv.traces.length }))}
			${chip('trace-lib-only', 'shown', mv.libOnly === 'shown', T('on the chart {n}', { n: shown }))}
		</div>
		${cards}`;
}

function refreshLibrary() {
	const box = document.querySelector('[data-trace-lib]');
	if (!box) return;
	const was = box.querySelector('[data-lib-search]');
	const caret = was && document.activeElement === was ? was.selectionStart : null;
	box.innerHTML = libraryHTML();
	if (caret !== null) {
		const now = box.querySelector('[data-lib-search]');
		now.focus();
		now.setSelectionRange(caret, caret);
	}
}

/** Every trace kept on this browser, with room to look at them. */
export function openTraceLibrary() {
	mv.libOpen = true;
	const host = openDialog(`
		<h2>${T('The traces you have kept')}</h2>
		<p class="dialog-copy">${T('{n} of {max} on this browser. Open one to draw on it, or open its eye to lay it over the chart beside whatever else you are drawing. Trace the way the game’s auto-path really sails a passage and press ⚓ to make it a lane: every route drawn near it follows it from then on, and is timed as the game sails it.', { n: mv.traces.length, max: TRACES_MAX })}</p>
		<div data-trace-lib>${libraryHTML()}</div>
		<div class="dialog-actions">
			${mv.traces.some(r => r.shown) ? `<button class="ghost-btn" data-act="trace-eye-none">${T('Clear the chart')}</button>` : ''}
			<button class="ghost-btn" data-close>${T('Close')}</button>
		</div>`, { onDismiss: () => { mv.libOpen = false; } });
	// The one dialog in the app that wants the width: a grid of drawings
	// reads three across, and two of them is a list with gaps.
	const boxEl = host.querySelector('.dialog-box');
	if (boxEl) boxEl.classList.add('wide');
	host.addEventListener('input', evt => {
		const el = evt.target.closest('[data-lib-search]');
		if (!el) return;
		mv.libQ = el.value.slice(0, 40);
		refreshLibrary();
	});
	const search = host.querySelector('[data-lib-search]');
	if (search) search.focus();
}

/** Rename a kept trace, in place on the shelf. */
function renameTraceDialog(i) {
	const r = mv.traces[i];
	if (!r) return;
	// Asked for from the library, the library is what you go back to.
	const back = mv.libOpen;
	mv.libOpen = false;
	const host = openDialog(`
		<h2>${T('Rename this trace')}</h2>
		<p class="dialog-copy">${r.points.length === 1
			? T('{name} — {n} stop, kept {when}.', { name: esc(r.name || T('untitled')), n: r.points.length, when: keptWhen(r.at) })
			: T('{name} — {n} stops, kept {when}.', { name: esc(r.name || T('untitled')), n: r.points.length, when: keptWhen(r.at) })}</p>
		<input class="field" type="text" maxlength="40" value="${esc(r.name || '')}" data-trace-name>
		<div class="dialog-actions">
			<button class="ghost-btn" data-close>${T('Cancel')}</button>
			<button class="act" data-trace-rename>${T('Rename')}</button>
		</div>`);
	const input = host.querySelector('[data-trace-name]');
	input.focus();
	input.select();
	const save = () => {
		const name = input.value.trim();
		if (!name) return toast(T('Give it a name'));
		if (mv.traces.some((o, k) => k !== i && o.name === name)) return toast(T('There is already a trace by that name'));
		if (mv.trace && mv.trace.name === r.name) mv.trace.name = name;
		r.name = name;
		persist();
		closeDialog();
		refreshSide();
		paintMap();
		toast(T('Now “{name}”', { name }));
		if (back) openTraceLibrary();
	};
	host.querySelector('[data-trace-rename]').addEventListener('click', save);
	input.addEventListener('keydown', evt => { if (evt.key === 'Enter') save(); });
}

/** A field typed into on the trace panel: the name, the notes, a
 *  stop's note, a word on the chart. */
export function traceChange(el) {
	const act = el.dataset.act;
	if (!['trace-name', 'trace-notes', 'trace-point-note', 'trace-text'].includes(act)) return false;
	const t = liveTrace();
	if (act === 'trace-name') t.name = el.value.slice(0, 40);
	else if (act === 'trace-notes') t.notes = el.value.slice(0, 400);
	else if (act === 'trace-text') {
		const w = t.texts[Number(el.dataset.i)];
		if (w) {
			if (el.value.trim()) w.text = el.value.slice(0, 60);
			else t.texts = t.texts.filter(x => x !== w);
		}
	} else { const p = t.points[Number(el.dataset.i)]; if (p) { if (el.value.trim()) p.note = el.value.slice(0, 120); else delete p.note; } }
	persist();
	paintMap();
	return true;
}

/** Everywhere a trace touches the chart, for fitting the view to it. */
export const traceAnchors = t => [
	...(t.strokes || []).flatMap(st => {
		const pts = Array.isArray(st) ? st : st.pts;
		const out = [];
		for (let i = 0; i + 1 < pts.length; i += 2) out.push({ x: pts[i], y: pts[i + 1] });
		return out;
	}),
	...(t.texts || []).map(w => ({ x: w.x, y: w.y }))
];

/** The Map's data as it stands in memory -- what the view holds once
 *  the write owed has gone through -- as a copy, for a test or a tool
 *  that wants to read it without waiting on the debounce. */
export function currentMapData() {
	return JSON.parse(JSON.stringify({ stops: mv.stops, stopsPick: mv.stopsPick, runTrades: mv.runTrades, runStash: mv.runStash, done: mv.done, startPort: mv.startPort, returnHome: mv.returnHome, savedRoutes: mv.savedRoutes, prevRoute: mv.prevRoute, rationsAboard: mv.rationsAboard, trace: mv.trace, traces: mv.traces }));
}

function traceExportObject() {
	const t = mv.trace || blankTrace();
	return { app: 'bdo-ship-upgrade-tracker', kind: 'trace', version: 2, exported: new Date().toISOString(), name: t.name, notes: t.notes, points: t.points, strokes: t.strokes, texts: t.texts || [], areas: t.areas || [] };
}

export function traceLink(payload) {
	return `${location.origin}${location.pathname}#trace/${payload}`;
}

/** A trace from a link or a file, onto the chart. Returns it, or null. */
export async function applyTraceLink(payload) {
	let data;
	try { data = await decodeAny(payload); } catch { return null; }
	return applyTraceObject(data);
}

export function applyTraceObject(data) {
	const t = data && data.kind === 'trace' ? cleanTrace(data) : null;
	if (!t) return null;
	restore();
	mv.trace = t;
	mv.editing = 0;
	mv.mode = 'trace';
	mv.panelOpen = true;
	mv.pendingFit = { points: t.points.length ? t.points : traceAnchors(t) };
	persist();
	return t;
}

/** The traced marks for the game's map, numbered, named by their
 *  notes. A loop is sailed, so it takes the stops alone; favourites are
 *  places, so the words written on the chart come too. */
export function tracePoints(withWords = false) {
	if (!mv.trace) return [];
	const stops = mv.trace.points.map((p, i) => ({ name: `${i + 1}: ${p.note || mv.trace.name || 'trace'}`.slice(0, 30), x: p.x, y: p.y }));
	if (!withWords) return stops;
	return [...stops, ...(mv.trace.texts || []).map(w => ({ name: w.text.slice(0, 30), x: w.x, y: w.y }))];
}
