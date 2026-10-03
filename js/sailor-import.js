// Hiring a crew off the screenshots you already took.
//
// Typing eighteen sailors in, four growths each, is the dullest quarter
// of an hour this app can ask for -- and it is the one thing the app
// cannot estimate its way round, because a levelled sailor's real rolls
// are what makes a ship's speed the game's rather than a guess.
//
// So: drop the screenshots in. Either window will do, the Selected
// Sailor panel or the whole Manage Sailors one, and both at once is
// fine. Everything is read here in the page (shot-reader.js) and the
// files never leave the machine -- what comes back is a table to check
// before a single thing is written, because a scan that misreads a
// level should cost a glance, not a roster.
//
// Nothing is written until "Add" is pressed, and a sailor already on
// the roster under that name is updated rather than hired twice.

import { esc } from './fmt.js';
import { T, said } from './i18n.js';
import * as store from './state.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { anyType, pool, mateTypes, SAILOR_CAP, logLevel, STAT_NAMES, statBand } from './sailors.js';
import { LIMITS, triage, readShots, wireShotIntake, close as closeReader, shotLang, shotLangNote } from './shot-reader.js';

const MOVES = ['speed', 'accel', 'turn', 'brake'];
const CANNON = ['patience', 'force', 'focus', 'vision'];

const newId = () => 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e5).toString(36);
const roster = () => store.getProfile('roster', []) || [];

/** The sailor on the roster this reading is of, if there is one. */
function alreadyHired(read, list) {
	const name = (read.name || '').trim().toLowerCase();
	if (!name) return null;
	return list.find(s => s.name.trim().toLowerCase() === name && (!read.type || s.type === read.type))
		|| list.find(s => s.name.trim().toLowerCase() === name) || null;
}

/** Every type a row can be set to, mates last -- the picker for a misread. */
const TYPE_OPTIONS = [...pool.map(t => t.type).sort(), ...mateTypes.map(t => t.type)];

/* ------------------------------------------------------------------ *
 * the dialog
 * ------------------------------------------------------------------ */

export function openSailorImport(after = () => {}) {
	let stop = null;          // an AbortController while a batch is being read
	let rows = [];            // what was read, as the review table has it
	let skipped = [];         // files that were not read, and why

	const host = () => document.getElementById('dialog');
	// The dialog is opened once and then redrawn in place. Opening it
	// again would count as dismissing the one already there -- and this
	// dialog's dismissal stops the batch, so a redraw between two shots
	// would have stopped the very reading it was drawing.
	const draw = body => {
		const inner = host().hidden ? null : host().querySelector('[data-shot-body]');
		if (inner) inner.innerHTML = body;
		else {
			const box = openDialog(`<h2>${T('Read sailors from screenshots')}</h2><div data-shot-body>${body}</div>`,
				{ onDismiss: () => { if (stop) stop.abort(); closeReader(); } }).querySelector('.dialog-box');
			// A row of a dozen sailors, each with a name, a type, a level
			// and four growths, does not fit a dialog's 560px -- the fleet
			// asks for the same room for the same reason.
			if (box) box.classList.add('wide', 'shot-box');
		}
		wire();
	};

	/* --- what to drop ------------------------------------------------ */
	// Two windows in the game show a sailor and the reader takes either,
	// but only if the player knows which two -- the panel is easy to
	// miss, and a shot of the roster list alone has nothing in it to
	// read. So both are named, and what a crop has to keep is said
	// outright: everything from the name down to the last growth.
	const pickView = () => {
		return `
		<p class="dialog-note">${T('Either of these reads, and a mixture of both is fine — <b>one sailor a shot</b>.')}</p>
		<ul class="shot-kinds">
			<li>${T('<b>Manage Sailors</b> — the whole window as it is on screen, or the right-hand pane cropped out of it.')}</li>
			<li>${T('<b>Selected Sailor</b> — the smaller panel on its own, the one with the type in angle brackets.')}</li>
		</ul>
		<p class="dialog-note quiet">${T("Whichever it is, keep the sailor's name at the top and the last growth at the bottom inside the crop: the name, the condition, the appetite, the cabin cost, the weight and the growths are all read off it.")}</p>
		${shotLangNote()}
		<div class="shot-drop" data-drop tabindex="0" role="button" aria-label="${T('Choose screenshots to read')}">
			<div class="shot-drop-mark">⛵</div>
			<div><b>${T('Drop screenshots here, or paste one')}</b></div>
			<div class="row-sub">${T('{paste}, or {link}', { paste: `<b>${T('Ctrl+V')}</b>`, link: `<button class="link-btn" data-choose>${T('choose files')}</button>` })}</div>
			<div class="row-sub quiet">${T('A shot taken with Shift+Win+S goes to the clipboard — paste it straight in, no file to save first.')}</div>
			<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-files>
		</div>
		<p class="dialog-note quiet">${T('Up to {files} at a time, {mb} MB each, PNG, JPEG or WebP.', { files: LIMITS.files, mb: Math.round(LIMITS.bytes / 1024 / 1024) })}
			${T('They are read in this browser and never uploaded — the first read fetches about 6 MB of reader, once.')}</p>
		<div class="dialog-actions"><button class="act quiet" data-close>${T('Close')}</button></div>`;
	};

	/* --- reading ----------------------------------------------------- */
	const readingView = (at, text) => `
		<p class="dialog-note">${esc(text)}</p>
		<div class="shot-bar"><i style="width:${Math.round(at * 100)}%"></i></div>
		<div class="dialog-actions"><button class="act quiet" data-stop>${T('Stop')}</button></div>`;

	/* --- the review table -------------------------------------------- */
	const rowHTML = (r, i) => {
		const t = r.type ? anyType[r.type] : null;
		const growths = [...MOVES, ...CANNON].filter(k => r.stats[k] !== undefined);
		const band = k => (r.type ? statBand(r.type, k, r.lv) : null);
		const odd = k => {
			const b = band(k);
			return b && (r.stats[k] < b.min - 0.05 || r.stats[k] > b.max + 0.05);
		};
		return `<tr class="shot-row${r.take ? '' : ' off'}">
			<td><input type="checkbox" data-take="${i}"${r.take && r.type ? ' checked' : ''}${r.type ? '' : ` disabled title="${T('Say which type first')}"`} aria-label="${T('Take this one')}"></td>
			<td><input class="field shot-name" data-name="${i}" value="${esc(r.name)}" maxlength="30" aria-label="${T('Name')}"></td>
			<td><select class="purse-inline" data-type="${i}" aria-label="${T('Type')}">
				<option value=""${r.type ? '' : ' selected'}>—</option>
				${TYPE_OPTIONS.map(x => `<option${x === r.type ? ' selected' : ''}>${esc(x)}</option>`).join('')}
			</select></td>
			<td><input class="purse-inline narrow" data-lv="${i}" value="${r.lv}" inputmode="numeric" aria-label="${T('Level')}"${t && t.mate ? ' disabled' : ''}></td>
			<td>${growths.length
		? growths.map(k => `<span class="shot-stat${odd(k) ? ' odd' : ''}" title="${odd(k) ? T('{stat} — outside what this type can roll at this level', { stat: esc(said((STAT_NAMES[k] || {}).game || k)) }) : esc(said((STAT_NAMES[k] || {}).game || k))}">${esc(said((STAT_NAMES[k] || {}).game || k).slice(0, 3))} ${r.stats[k]}</span>`).join('')
		: `<span class="quiet">${T('none read')}</span>`}</td>
			<td class="shot-note">${r.onto ? T('updates <b>{name}</b>', { name: esc(r.onto.name) }) : T('new')}${r.warnings.length ? `<span class="shot-warn" title="${esc(r.warnings.map(w => said(w)).join('; '))}">⚠ ${esc(said(r.warnings[0]))}</span>` : ''}</td>
		</tr>`;
	};

	const reviewView = () => {
		// A row whose type could not be worked out cannot be written --
		// the type is what every figure the app keeps hangs off -- so it
		// waits, unticked, for the select beside it to be answered.
		const taking = rows.filter(r => r.take && r.type);
		const adding = taking.filter(r => !r.onto).length;
		const room = SAILOR_CAP - roster().length;
		return `
		<p class="dialog-note">${rows.length ? `${rows.length === 1 ? T('Read {n} sailor.', { n: rows.length }) : T('Read {n} sailors.', { n: rows.length })} ${T('Check them against the game — the type is worked out from the appetite, the cabin cost and the weight where the window does not name it, and a growth outside what the level can roll is marked.')}` : T('No sailor panel was found in any of those.')}</p>
		${skipped.length ? `<details class="shot-skipped"><summary>${T('{n} not read', { n: skipped.length })}</summary>${skipped.map(s => `<div class="row-sub">${esc(s.name)} — ${esc(said(s.why))}</div>`).join('')}</details>` : ''}
		${rows.length ? `<div class="shot-table-wrap"><table class="shot-table">
			<thead><tr><th></th><th>${T('Name')}</th><th>${T('Type')}</th><th>${T('Lv')}</th><th>${T('Growths')}</th><th></th></tr></thead>
			<tbody>${rows.map(rowHTML).join('')}</tbody>
		</table></div>` : ''}
		${adding > room ? `<p class="dialog-note warn">${T('That is {adding} new sailors and there is room for {room}. Untick some, or dismiss a few first.', { adding, room })}</p>` : ''}
		<div class="dialog-actions">
			<button class="act quiet" data-again>${T('Read more')}</button>
			<span class="panel-spacer"></span>
			<button class="act quiet" data-close>${T('Cancel')}</button>
			<button class="act" data-add${taking.length && adding <= room ? '' : ' disabled'}>${taking.length ? T('Take {n}', { n: taking.length }) : T('Nothing ticked')}</button>
		</div>`;
	};

	/* --- doing it ---------------------------------------------------- */
	async function run(files) {
		const { take, skipped: out } = await triage([...files]);
		skipped = out.map(s => ({ name: s.file.name, why: s.why }));
		if (!take.length) { rows = []; draw(reviewView()); return; }
		stop = new AbortController();
		draw(readingView(0, T('Fetching the reader…')));
		const onProgress = p => {
			const box = host().querySelector('.shot-bar i');
			const note = host().querySelector('.dialog-note');
			if (!box || !note) return;
			const at = p.stage === 'reading' ? p.at : p.stage === 'done' ? 1 : (p.at || 0) * 0.3;
			box.style.width = `${Math.round(at * 100)}%`;
			note.textContent = p.stage === 'reading'
				? T('Reading {i} of {n} — {name}', { i: p.i + 1, n: p.n, name: p.name })
				: p.stage === 'done' ? T('Done') : T('Fetching the reader… {text}', { text: p.text || '' });
		};
		let results;
		try {
			results = await readShots(take, { onProgress, signal: stop.signal, lang: shotLang() });
		} catch (err) {
			draw(`<p class="dialog-note warn">${T('The reader could not start: {why}', { why: esc(err && err.message ? err.message : String(err)) })}</p>
				<div class="dialog-actions"><button class="act quiet" data-again>${T('Try again')}</button><button class="act" data-close>${T('Close')}</button></div>`);
			return;
		} finally {
			stop = null;
		}
		const list = roster();
		rows = [];
		for (const r of results) {
			if (!r.sailor) { skipped.push({ name: r.file, why: r.why }); continue; }
			const s = r.sailor;
			rows.push({ ...s, take: Boolean(s.type), onto: alreadyHired(s, list), file: r.file });
		}
		draw(reviewView());
	}

	/* --- writing it -------------------------------------------------- */
	function commit() {
		const list = [...roster()];
		let added = 0, updated = 0;
		for (const r of rows) {
			if (!r.take || !r.type) continue;
			const mate = (anyType[r.type] || {}).mate;
			const stats = mate ? {} : { ...r.stats };
			const at = r.onto ? list.findIndex(s => s.id === r.onto.id) : -1;
			if (at >= 0) {
				// A level typed in writes a line in the sailor's log, and
				// that is as true of a level read off a screenshot.
				const was = list[at];
				const next = logLevel({ ...was, name: r.name || was.name, type: r.type, cond: r.cond, stats: Object.keys(stats).length ? stats : was.stats }, r.lv);
				list[at] = next;
				updated++;
			} else {
				list.push({ id: newId(), name: r.name || r.type, type: r.type, lv: r.lv, cond: r.cond, ...(Object.keys(stats).length ? { stats } : {}) });
				added++;
			}
		}
		store.setProfile('roster', list);
		closeReader();
		closeDialog();
		const said = [added ? T('{n} hired', { n: added }) : '', updated ? T('{n} brought up to date', { n: updated }) : ''].filter(Boolean).join(' · ');
		toast(said ? T('Read off the screenshots: {what}', { what: said }) : T('Nothing to take'), true);
		after();
	}

	/* --- wiring ------------------------------------------------------ */
	function wire() {
		const box = host();
		wireShotIntake(box, run);
		const on = (sel, ev, fn) => box.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
		on('[data-stop]', 'click', () => { if (stop) stop.abort(); });
		on('[data-again]', 'click', () => draw(pickView()));
		on('[data-add]', 'click', commit);
		on('[data-take]', 'change', e => {
			rows[Number(e.target.dataset.take)].take = e.target.checked;
			draw(reviewView());
		});
		on('[data-name]', 'input', e => {
			const r = rows[Number(e.target.dataset.name)];
			r.name = e.target.value.slice(0, 30);
			r.onto = alreadyHired(r, roster());
		});
		on('[data-type]', 'change', e => {
			const r = rows[Number(e.target.dataset.type)];
			r.type = e.target.value || null;
			r.take = r.take || Boolean(r.type);
			r.warnings = r.warnings.filter(w => !/^type /.test(w));
			r.onto = alreadyHired(r, roster());
			draw(reviewView());
		});
		on('[data-lv]', 'change', e => {
			const r = rows[Number(e.target.dataset.lv)];
			r.lv = Math.min(10, Math.max(1, Math.floor(Number(e.target.value) || 1)));
			r.warnings = r.warnings.filter(w => w !== 'no level');
			draw(reviewView());
		});
	}

	draw(pickView());
}
