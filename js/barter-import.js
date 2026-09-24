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
import { T, said, gameName, readerLang, gameNamesFor } from './i18n.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { LIMITS, triage, readWords, wireShotIntake, close as closeReader } from './shot-reader.js';
import { offersFrom, figuresFrom, localized, inEnglish } from './barter-shot.js';
import { LANGS as GAME_LANGS, langByTag, DEFAULT_LANG } from './sailor-locales.js';
import { npcs, isleOf, whoOf } from './barter_npcs.js';
import { img } from './ui-bits.js';
import * as store from './state.js';
import { barterKey } from './clock.js';

/**
 * The dialog.
 *
 * `deals` is every exchange the codex lists (barter-plan.js's
 * `exchanges`), and `onAnswers` what to do with the rows the player
 * keeps.
 */
/** The client's language, as the sailor reader keeps it: one setting
 *  for every screenshot of the game, first guessed from the app's. */
const shotLang = () => {
	const chosen = store.getSetting('shotLang', null);
	if (chosen && langByTag[chosen]) return chosen;
	const fromApp = readerLang();
	return langByTag[fromApp] ? fromApp : DEFAULT_LANG;
};

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

export function openBarterImport({ deals, onAnswers = () => {}, files = null, guide = '' } = {}) {
	let stop = null;
	let rows = [];            // what was read: { isle, offer, near, keep }
	let skipped = [];
	// What the head of the window said about the sailor, and whether
	// they want it written in. Offered rather than written: a figure
	// read wrong and applied in silence is worse than one not read.
	let figures = { parley: null, barters: null, take: true };

	const host = () => document.getElementById('dialog');
	const draw = body => {
		const inner = host().hidden ? null : host().querySelector('[data-shot-body]');
		if (inner) inner.innerHTML = body;
		else {
			const box = openDialog(`<h2>${T('Read the barter window')}</h2><div data-shot-body>${body}</div>`,
				{ onDismiss: () => { if (stop) stop.abort(); closeReader(); } }).querySelector('.dialog-box');
			if (box) box.classList.add('wide', 'shot-box');
		}
		wire();
	};

	/* --- what to drop ------------------------------------------------ */
	const pickView = () => `
		${guide === 'material-whole' ? `<figure class="mat-help-fig"><img src="guide/material-scroll.webp" alt="${T('Three screenshots of the whole window, the list scrolled between each')}" width="1000" height="245">
			<figcaption>${T('A board the book does not know: shoot the whole window, scroll the list down, shoot again, to the end — then drop or paste them all here together. A row on two shots is read once.')}</figcaption></figure>`
		: shotGuideHTML(guide === 'material' ? 'material' : 'trade')}
		<ul class="shot-kinds">
			<li>${T('<b>What it is read against</b> — the exchanges the codex says that island deals, so a row is never a guess at a spelling.')}</li>
		</ul>
		${langPick()}
		<div class="shot-drop" data-drop tabindex="0" role="button" aria-label="${T('Choose screenshots to read')}">
			<div class="shot-drop-mark">⚖</div>
			<div><b>${T('Drop screenshots here, or paste one')}</b></div>
			<div class="row-sub">${T('{paste}, or {link}', { paste: `<b>${T('Ctrl+V')}</b>`, link: `<button class="link-btn" data-choose>${T('choose files')}</button>` })}</div>
			<div class="row-sub quiet">${T('A shot taken with Shift+Win+S goes to the clipboard — paste it straight in, no file to save first.')}</div>
			<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-files>
		</div>
		<p class="dialog-note quiet">${T('Up to {files} at a time, {mb} MB each, PNG, JPEG or WebP.', { files: LIMITS.files, mb: Math.round(LIMITS.bytes / 1024 / 1024) })}
			${T('They are read in this browser and never uploaded — the first read fetches about 6 MB of reader, once.')}</p>
		<div class="dialog-actions"><button class="act quiet" data-close>${T('Close')}</button></div>`;

	/** The game's language: which reader reads the shot, and which of
	 *  the game's names its rows are matched against. */
	const langPick = () => {
		const lang = langByTag[shotLang()];
		return `<div class="shot-lang">
			<label for="shot-lang">${T("Your game's language")}</label>
			<select id="shot-lang" class="purse-inline" data-lang>
				${GAME_LANGS.map(l => `<option value="${esc(l.tag)}"${l.tag === lang.tag ? ' selected' : ''}>${esc(l.label)}</option>`).join('')}
			</select>
			<span class="row-sub">${lang.mb
		? T('{label} is another script — about {mb} MB of reader, fetched once. The rows are matched against the game’s own names in it.', { label: esc(lang.label), mb: lang.mb })
		: T('The rows are matched against the game’s own names in it.')}</span>
		</div>`;
	};

	/* --- reading ----------------------------------------------------- */
	const readingView = (at, text) => `
		<p class="dialog-note">${esc(text)}</p>
		<div class="shot-bar"><i style="width:${Math.round(at * 100)}%"></i></div>
		<div class="dialog-actions"><button class="act quiet" data-stop>${T('Stop')}</button></div>`;

	/* --- the review table -------------------------------------------- */
	const choices = r => {
		// The shortlist, best first, and the way to say none of them.
		// A row the reader was sure of still gets the list: it is the
		// only way to correct it, and it costs a glance to ignore.
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

	// What the window's head said about the sailor, against what the
	// app has been planning with. Only shown where it differs: a figure
	// that already agrees is not news.
	const figuresHTML = () => {
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
	// having, and used to be shown beside a button that could not be
	// pressed.
	const figuresOnly = () => figures.take && !!figuresHTML();

	const reviewView = () => {
		const taking = rows.filter(r => r.keep);
		return `
		<p class="dialog-note">${rows.length
		? `${rows.length === 1 ? T('Read {n} island.', { n: rows.length }) : T('Read {n} islands.', { n: rows.length })} ${T('Check them against the window — a row read wrong puts the whole board on the wrong layout, and every one of these can be corrected from the list beside it.')}`
		: T('No barter rows were found in those. The window has to show the list itself: the island on the left of each row is what the rows are found by.')}</p>
		${skipped.length ? `<details class="shot-skipped"><summary>${T('{n} not read', { n: skipped.length })}</summary>${skipped.map(s => `<div class="row-sub">${esc(s.name)} — ${esc(said(s.why))}</div>`).join('')}</details>` : ''}
		${rows.length ? `<div class="shot-table-wrap"><table class="shot-table">
			<thead><tr><th></th><th>${T('Island')}</th><th>${T('Showing')}</th><th></th></tr></thead>
			<tbody>${rows.map(rowHTML).join('')}</tbody>
		</table></div>` : ''}
		${figuresHTML()}
		<div class="dialog-actions">
			<button class="act quiet" data-again>${T('Read more')}</button>
			<span class="panel-spacer"></span>
			<button class="act quiet" data-close>${T('Cancel')}</button>
			<button class="act" data-use${taking.length || figuresOnly() ? '' : ' disabled'}>${taking.length
			? (taking.length === 1 ? T('Answer {n} island', { n: taking.length }) : T('Answer {n} islands', { n: taking.length }))
			: figuresOnly() ? T('Write the figures in') : T('Nothing ticked')}</button>
		</div>`;
	};

	/* --- doing it ---------------------------------------------------- */
	async function run(files) {
		const { take, skipped: out } = await triage([...files]);
		skipped = out.map(s => ({ name: s.file.name, why: s.why }));
		if (!take.length) { rows = []; draw(reviewView()); return; }
		stop = new AbortController();
		draw(readingView(0, T('Fetching the reader…')));
		const say = (at, text) => {
			const bar = host().querySelector('.shot-bar i');
			const note = host().querySelector('.dialog-note');
			if (bar) bar.style.width = `${Math.round(at * 100)}%`;
			if (note) note.textContent = text;
		};
		const seen = new Map();
		// The islands and exchanges as the client names them. What is
		// read is handed back in English, which is what the app keeps.
		const lang = shotLang();
		const tables = localized({ isles: npcs, deals }, await gameNamesFor(lang).catch(() => ({})));
		for (let i = 0; i < take.length; i++) {
			if (stop.signal.aborted) break;
			say(i / take.length, T('Reading {i} of {n} — {name}', { i: i + 1, n: take.length, name: take[i].name }));
			try {
				const { words } = await readWords(take[i], { lang });
				// The head of the window says what the sailor's own bar
				// holds and how many barters are behind them. Both are
				// fields the app otherwise asks them to type and then
				// watches go stale, and both are right there in the shot.
				const said = figuresFrom(words);
				if (said.parley > 0) figures.parley = said.parley;
				if (said.barters > 0) figures.barters = said.barters;
				for (const read of offersFrom(words, tables)) {
					const row = inEnglish(read);
					// An island read twice takes the later reading: the
					// second shot is the one the player scrolled to.
					seen.set(row.isle.id, { ...row, keep: row.offer || null });
				}
			} catch (err) {
				skipped.push({ name: take[i].name, why: err && err.message ? err.message : T('could not be read') });
			}
		}
		stop = null;
		rows = [...seen.values()].sort((a, b) => isleOf(a.isle).localeCompare(isleOf(b.isle)));
		draw(reviewView());
	}

	/* --- keeping it -------------------------------------------------- */
	async function use() {
		const taking = rows.filter(r => r.keep);
		if (!taking.length && !figuresOnly()) return;
		const answers = taking.map(r => ({ npcId: r.isle.id, give: r.keep.give, recv: r.keep.item, qty: r.keep.giveText || '1' }));
		if (figures.take) {
			if (figures.parley > 0) store.setProfileMany({ parleyHeld: Math.round(figures.parley), parleyDay: barterKey() });
			if (figures.barters > 0) store.setProfile('barterCount', Math.round(figures.barters));
		}
		closeReader();
		closeDialog();
		// What the answers mean is the tab's business -- some of these
		// rows are the material list, which belongs to no layout -- so
		// the tab says what it did with them. Whether they are worth
		// telling the fleet is the tab's to say too: a reading is news
		// when it fits no layout on file, and the bar offers it then.
		if (answers.length) onAnswers(answers);
		else toast(T('The window’s figures are written in'), true);
	}

	/* --- wiring ------------------------------------------------------ */
	function wire() {
		const box = host();
		wireShotIntake(box, run);
		const on = (sel, ev, fn) => box.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
		on('[data-figures]', 'change', e => { figures.take = !!e.target.checked; });
		on('[data-lang]', 'change', e => {
			store.setSetting('shotLang', e.target.value, true);
			draw(pickView());
		});
		on('[data-stop]', 'click', () => { if (stop) stop.abort(); });
		on('[data-again]', 'click', () => draw(pickView()));
		on('[data-use]', 'click', use);
		on('[data-take]', 'change', e => {
			const r = rows[Number(e.target.dataset.take)];
			r.keep = e.target.checked ? (r.keep || choices(r)[0] || null) : null;
			draw(reviewView());
		});
		on('[data-offer]', 'change', e => {
			const r = rows[Number(e.target.dataset.offer)];
			const pick = choices(r);
			r.keep = e.target.value === '' ? null : pick[Number(e.target.value)] || null;
			draw(reviewView());
		});
	}

	draw(pickView());
	// Pasted onto the page rather than into this dialog: the picture is
	// already in hand, so the read starts with it.
	if (files && files.length) run(files);
}
