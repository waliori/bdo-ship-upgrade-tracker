// Reading today's board off the screenshots you already took.
//
// The Barter tab works out which of the forty layouts the sea is
// showing by asking about one island at a time: what does Baeza show?
// -- and the answer narrows the forty to a handful, and the next
// answer settles it. That works, and it is still five presses and a
// squint at the game.
//
// The window itself says all of it at once. So: screenshot the barter
// list, drop it here, and every row in it is read (barter-shot.js) --
// island, what it takes, what it pays -- against the exchanges the
// codex says that island deals. What comes back is a table to check,
// because a row read wrong would put the whole board on the wrong
// layout, and then the button that answers every one of those islands
// at once.
//
// Whether a reading is worth telling the fleet is not asked here. It is
// news when it fits no layout on file, and only the Barter tab knows
// that -- after the answers are in -- so the offer is made on its bar.

import { esc, F } from './fmt.js';
import { T, said, gameName, gameNamesFor } from './i18n.js';
import { toast } from './dialogs.js';
import { triage, readWords, close as closeReader, shotLang } from './shot-reader.js';
import { offersFrom, figuresFrom, localized, inEnglish } from './barter-shot.js';
import { npcs, isleOf, whoOf } from './barter_npcs.js';
import { img } from './ui-bits.js';
import * as store from './state.js';
import { barterKey } from './clock.js';

/**
 * What the reader reads, drawn on the game's own window: the whole
 * window with its head, the same rows cropped, and what the numbered
 * boxes are. `list` is 'trade' or 'material' -- one window, the rows
 * sorted by what they pay -- and `lazy` is for a page that draws it
 * folded away.
 */
export function shotGuideHTML(list = 'trade', { lazy = false } = {}) {
	const mat = list === 'material';
	const l = lazy ? ' loading="lazy"' : '';
	const key = (n, cls, text) => `<li><i class="shot-key ${cls}">${n}</i><span>${text}</span></li>`;
	return `<div class="mat-help-figs">
		<figure class="mat-help-fig"><img src="guide/${mat ? 'material-page' : 'barter-window'}.webp" alt="${T('The Barter Information window, the parts the app reads outlined')}"${l} width="600" height="${mat ? 421 : 418}">
			<figcaption>${mat
		? T('The whole Barter Information window — the same window as for trade goods. The rows paying ship materials go to the material list.')
		: T('The whole Barter Information window. A few rows are enough to find the layout; scroll and shoot again for more. A full-screen shot works too.')}</figcaption></figure>
		<figure class="mat-help-fig"><img src="guide/${mat ? 'material' : 'barter'}-cropped.webp" alt="${T('The same rows, cropped out of the window')}"${l} width="560" height="${mat ? 256 : 258}">
			<figcaption>${T('Cropped to the rows works too: every row is read the same. Only the head’s two figures are missed, and those can be typed in.')}</figcaption></figure>
	</div>
	<ol class="shot-keys">
		${key(1, 'at-head', T('<b>Parley</b> — the bar you hold, written in for the run'))}
		${key(2, 'at-head', T('<b>Total Barters</b> — opens the islands and exchanges your count allows'))}
		${key(3, 'at-head', T('<b>The rows</b> — each one’s island, what it takes and what it pays; what it pays sorts it into the trade goods or the ship material list. A name cut short with “…” is enough.'))}
	</ol>`;
}

/* ------------------------------------------------------------------ *
 * the reading, on the page
 *
 * There is no dialog. The page already shows where to paste and what
 * the screenshot should look like; a dialog that said it all again, and
 * a box to press before a paste was taken, were two steps that answered
 * nothing. A paste, a drop or a picked file starts the read at once,
 * and the progress and then the table to check stand under the paste
 * zone, in a box the page draws wherever it has one: `shotInlineHTML`
 * is what that box holds, and it survives every redraw of the page.
 * ------------------------------------------------------------------ */

let now = null;   // { stage: 'reading'|'review', at, text, rows, skipped, figures, stop, deals, onAnswers }

/** Paint every box the page has for the reading. */
function paint() {
	for (const box of document.querySelectorAll('[data-shot-inline]')) box.innerHTML = shotInlineHTML();
}

/** Ask the system for pictures, and hand them to `then`. */
export function pickShots(then) {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'image/png,image/jpeg,image/webp';
	input.multiple = true;
	input.addEventListener('change', () => { if (input.files && input.files.length) then([...input.files]); });
	input.click();
}

const choices = r => {
	// The shortlist, best first, and the way to say none of them. A row
	// the reader was sure of still gets the list: it is the only way to
	// correct it, and it costs a glance to ignore.
	const list = (r.near || []).map(n => n.deal);
	if (r.offer && !list.some(d => d.give === r.offer.give && d.item === r.offer.item)) list.unshift(r.offer);
	return list.slice(0, 4);
};

const rowHTML = (r, i) => {
	const pick = choices(r);
	const chosen = r.keep ? pick.findIndex(d => d.give === r.keep.give && d.item === r.keep.item) : -1;
	return `<tr class="shot-row${r.keep ? '' : ' off'}">
		<td><input type="checkbox" data-take="${i}"${r.keep ? ' checked' : ''}${pick.length ? '' : ' disabled'} aria-label="${T('Use this row')}"></td>
		<td class="shot-item">${img(r.keep ? r.keep.item : '', 'row-icon')}<span><b>${esc(gameName(isleOf(r.isle)))}</b><span class="row-sub">${esc(gameName(whoOf(r.isle)))}</span></span></td>
		<td>${pick.length
	? `<select class="purse-inline" data-offer="${i}" aria-label="${T('What {isle} is showing', { isle: esc(gameName(isleOf(r.isle))) })}">
			${pick.map((d, k) => `<option value="${k}"${k === chosen ? ' selected' : ''}>${esc(gameName(d.give))} → ${esc(gameName(d.item))}</option>`).join('')}
			<option value="">${T('— none of these')}</option>
		</select>`
	: `<span class="quiet">${T('nothing the codex lists fits that row')}</span>`}</td>
		<td class="shot-note">${r.offer ? `<span class="quiet">${T('read')}</span>` : `<span class="shot-warn" title="${esc(said(r.why) || '')}">⚠ ${esc(said(r.why) || T('unsure'))}</span>`}</td>
	</tr>`;
};

// What the window's head said about the sailor, against what the app
// has been planning with. Only shown where it differs: a figure that
// already agrees is not news.
const figuresHTML = figures => {
	const lines = [];
	if (figures.parley > 0 && figures.parley !== store.getProfile('parleyHeld', 0)) {
		lines.push(T('<b>Parley</b> {n}', { n: F(figures.parley) })
			+ (store.getProfile('parleyHeld', 0) > 0
				? ` · ${T('the app has {n}', { n: F(store.getProfile('parleyHeld', 0)) })}`
				: ` · ${T('the app has been planning against a full bar')}`));
	}
	if (figures.barters > 0 && figures.barters !== store.getProfile('barterCount', 0)) {
		lines.push(T('<b>Total Barters</b> {n}', { n: F(figures.barters) })
			+ ` · ${T('the app has {n}', { n: F(store.getProfile('barterCount', 0)) })}`);
	}
	if (!lines.length) return '';
	return `<div class="shot-figures"><label class="inline-check">
		<input type="checkbox" data-figures${figures.take ? ' checked' : ''}>
		<span>${T('The window’s head also says:')} ${lines.join(' · ')} — ${T('write these in')}</span>
	</label></div>`;
};

// The head read and the rows did not: the figures are still worth
// having.
const figuresOnly = () => now.figures.take && !!figuresHTML(now.figures);

/** What the page's box holds: the read under way, the table to check,
 *  or nothing at all. */
export function shotInlineHTML() {
	if (!now) return '';
	if (now.stage === 'reading') {
		return `<div class="shot-inline-box">
			<p class="dialog-note" data-shot-say>${esc(now.text)}</p>
			<div class="shot-bar"><i style="width:${Math.round(now.at * 100)}%"></i></div>
			<div class="dialog-actions"><button class="act quiet" data-shot-stop>${T('Stop')}</button></div>
		</div>`;
	}
	const { rows, skipped } = now;
	const taking = rows.filter(r => r.keep);
	return `<div class="shot-inline-box">
		<p class="dialog-note">${rows.length
	? `${rows.length === 1 ? T('Read {n} island.', { n: rows.length }) : T('Read {n} islands.', { n: rows.length })} ${T('Check them against the window — a row read wrong puts the whole board on the wrong layout, and every one of these can be corrected from the list beside it.')}`
	: T('No barter rows were found in those. The window has to show the list itself: the island on the left of each row is what the rows are found by.')}</p>
		${skipped.length ? `<details class="shot-skipped"><summary>${T('{n} not read', { n: skipped.length })}</summary>${skipped.map(x => `<div class="row-sub">${esc(x.name)} — ${esc(said(x.why))}</div>`).join('')}</details>` : ''}
		${rows.length ? `<div class="shot-table-wrap"><table class="shot-table">
			<thead><tr><th></th><th>${T('Island')}</th><th>${T('Showing')}</th><th></th></tr></thead>
			<tbody>${rows.map(rowHTML).join('')}</tbody>
		</table></div>` : ''}
		${figuresHTML(now.figures)}
		<div class="dialog-actions">
			<button class="act quiet" data-shot-again>${T('Read more')}</button>
			<span class="panel-spacer"></span>
			<button class="act quiet" data-shot-cancel>${T('Cancel')}</button>
			<button class="act" data-shot-use${taking.length || figuresOnly() ? '' : ' disabled'}>${taking.length
		? (taking.length === 1 ? T('Answer {n} island', { n: taking.length }) : T('Answer {n} islands', { n: taking.length }))
		: figuresOnly() ? T('Write the figures in') : T('Nothing ticked')}</button>
		</div>
	</div>`;
}

/**
 * Read screenshots of the barter window, on the page. `deals` is every
 * exchange the codex lists (barter-plan.js's `exchanges`), and
 * `onAnswers` what to do with the rows the player keeps. A second
 * paste while a table is up adds to it: a scrolled window is more of
 * the same board.
 */
export async function readBarterShots({ files, deals, onAnswers = () => {} }) {
	wireOnce();
	if (now && now.stop) now.stop.abort();
	const { take, skipped: out } = await triage([...files]);
	const was = now && now.stage === 'review' ? now : null;
	now = {
		stage: 'reading', at: 0, text: T('Fetching the reader…'),
		rows: was ? was.rows : [], skipped: out.map(x => ({ name: x.file.name, why: x.why })),
		figures: was ? was.figures : { parley: null, barters: null, take: true },
		stop: new AbortController(), deals, onAnswers
	};
	const me = now;
	paint();
	const box = document.querySelector('[data-shot-inline]');
	if (box && box.scrollIntoView) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	const say = (at, text) => {
		me.at = at; me.text = text;
		const bar = document.querySelector('[data-shot-inline] .shot-bar i');
		const note = document.querySelector('[data-shot-inline] [data-shot-say]');
		if (bar) bar.style.width = `${Math.round(at * 100)}%`;
		if (note) note.textContent = text;
		else paint();
	};
	const seen = new Map(me.rows.map(r => [r.isle.id, r]));
	if (take.length) {
		// The islands and exchanges as the client names them. What is
		// read is handed back in English, which is what the app keeps.
		const lang = shotLang();
		const tables = localized({ isles: npcs, deals }, await gameNamesFor(lang).catch(() => ({})));
		for (let i = 0; i < take.length; i++) {
			if (me.stop.signal.aborted) break;
			say(i / take.length, T('Reading {i} of {n} — {name}', { i: i + 1, n: take.length, name: take[i].name }));
			try {
				const { words } = await readWords(take[i], { lang });
				// The head of the window says what the sailor's own bar
				// holds and how many barters are behind them.
				const head = figuresFrom(words);
				if (head.parley > 0) me.figures.parley = head.parley;
				if (head.barters > 0) me.figures.barters = head.barters;
				for (const read of offersFrom(words, tables)) {
					const row = inEnglish(read);
					// An island read twice takes the later reading: the
					// second shot is the one the player scrolled to.
					seen.set(row.isle.id, { ...row, keep: row.offer || null });
				}
			} catch (err) {
				me.skipped.push({ name: take[i].name, why: err && err.message ? err.message : T('could not be read') });
			}
		}
	}
	// Stopped, or overtaken by a newer paste: that one owns the box.
	if (now !== me) return;
	if (me.stop.signal.aborted && !seen.size) { now = null; paint(); return; }
	me.stop = null;
	me.rows = [...seen.values()].sort((a, b) => isleOf(a.isle).localeCompare(isleOf(b.isle)));
	me.stage = 'review';
	paint();
}

function done() {
	if (now && now.stop) now.stop.abort();
	now = null;
	closeReader();
	paint();
}

function use() {
	const me = now;
	if (!me) return;
	const taking = me.rows.filter(r => r.keep);
	if (!taking.length && !figuresOnly()) return;
	const answers = taking.map(r => ({ npcId: r.isle.id, give: r.keep.give, recv: r.keep.item, qty: r.keep.giveText || '1' }));
	if (me.figures.take) {
		if (me.figures.parley > 0) store.setProfileMany({ parleyHeld: Math.round(me.figures.parley), parleyDay: barterKey() });
		if (me.figures.barters > 0) store.setProfile('barterCount', Math.round(me.figures.barters));
	}
	done();
	// What the answers mean is the tab's business -- some of these rows
	// are the material list, which belongs to no layout -- so the tab
	// says what it did with them.
	if (answers.length) me.onAnswers(answers);
	else toast(T('The window’s figures are written in'), true);
}

// The box is drawn again with the page, so its controls are answered
// from the document rather than wired one box at a time.
let wired = false;
function wireOnce() {
	if (wired || typeof document === 'undefined') return;
	wired = true;
	document.addEventListener('click', e => {
		const el = e.target.closest('[data-shot-inline] button');
		if (!el || !now) return;
		if (el.hasAttribute('data-shot-stop')) { if (now.stop) now.stop.abort(); }
		else if (el.hasAttribute('data-shot-cancel')) done();
		else if (el.hasAttribute('data-shot-use')) use();
		else if (el.hasAttribute('data-shot-again')) {
			const me = now;
			pickShots(files => readBarterShots({ files, deals: me.deals, onAnswers: me.onAnswers }));
		} else return;
		e.preventDefault();
		e.stopPropagation();
	});
	document.addEventListener('change', e => {
		const el = e.target.closest('[data-shot-inline] [data-take], [data-shot-inline] [data-offer], [data-shot-inline] [data-figures]');
		if (!el || !now || now.stage !== 'review') return;
		e.stopPropagation();
		if (el.hasAttribute('data-figures')) { now.figures.take = !!el.checked; paint(); return; }
		if (el.hasAttribute('data-take')) {
			const r = now.rows[Number(el.dataset.take)];
			r.keep = el.checked ? (r.keep || choices(r)[0] || null) : null;
		} else {
			const r = now.rows[Number(el.dataset.offer)];
			const pick = choices(r);
			r.keep = el.value === '' ? null : pick[Number(el.value)] || null;
		}
		paint();
	});
}
