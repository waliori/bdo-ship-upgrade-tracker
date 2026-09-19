// Counting a storage off the screenshots you already took.
//
// The Inventory is the one place in this app that asks a player to type
// what they already know: a warehouse of two hundred slots, read off
// one screen and typed into another. So: drop the screenshots in. Every
// slot is matched against the icons the app already carries
// (storage-shot.js), the figure over each corner is read
// (shot-reader.js), and what comes back is a table to check before a
// single count is written.
//
// Two things it is careful about, because both are the difference
// between a help and a mess:
//
//   * A slot it cannot name does not become a guess. A storage is full
//     of things this app has no business knowing -- elixirs, gear,
//     memory fragments -- and they are counted and left alone.
//   * A count it could not make out is shown as a guess of one, with
//     the corner of the slot as it was beside it, so the player fixes
//     it with a glance instead of trusting it.
//
// Nothing is written until "Write these in" is pressed, and what is
// written is one change: one Undo takes the whole reading back.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { LIMITS, triage, readStorageShots, close as closeReader } from './shot-reader.js';
import { allItems, img } from './ui-bits.js';
import { TOWNS } from './screen-inventory.js';

/** Where a reading is written by default, remembered between goes: a
 *  player reads the same storage every week. */
const lastPlace = () => store.getSetting('shotStore', '');
const PLACES = ['', ...TOWNS];

/** The name for a slot that this app actually keeps a count of.
 *
 *  An icon can belong to several names -- the codex lists a barter good
 *  both as "Statue's Tear" and as "[Level 5] Statue's Tear" -- and only
 *  one of them is the name the rest of the app uses. Where none of them
 *  is, the slot is something the app does not track, and it is left
 *  out rather than invented. */
function knownName(row, known) {
	const names = row.alsoCalled || [row.item];
	return names.find(n => known.has(n)) || null;
}

/**
 * The reading, gathered: one line an item, counting every slot it was
 * seen in.
 *
 * A storage is read a screenful at a time, so several shots are one
 * storage and their slots add up. Two slots of the same thing add up
 * too -- the game splits a stack over slots once it passes a thousand.
 */
function gather(results, known) {
	const by = new Map();
	for (const shot of results) {
		for (const row of shot.rows || []) {
			const name = knownName(row, known);
			if (!name) continue;
			if (!by.has(name)) by.set(name, { item: name, n: 0, slots: 0, guessed: 0, shots: [] });
			const line = by.get(name);
			line.n += Math.max(0, Number(row.qty) || 0);
			line.slots++;
			if (!row.sure) line.guessed++;
			// the doubtful slots' corners first: they are the ones to look at
			if (row.corner) { if (row.sure) line.shots.push(row.corner); else line.shots.unshift(row.corner); }
		}
	}
	return [...by.values()].sort((a, b) =>
		(b.guessed > 0) - (a.guessed > 0) || b.n - a.n || a.item.localeCompare(b.item));
}

export function openStorageImport(after = () => {}) {
	let stop = null;            // an AbortController while a batch is being read
	let rows = [];              // the gathered reading, as the table has it
	let skipped = [];           // files that were not read, and why
	let shared = 0;             // rows of slots two shots both had, counted once
	let shaky = [];             // shots whose lattice the icons did not believe
	let unnamed = 0;            // slots that held something the app does not know
	let place = lastPlace();

	const host = () => document.getElementById('dialog');
	// Opened once and redrawn in place: opening it again counts as
	// dismissing the one already there, and this dialog's dismissal
	// stops the batch.
	const draw = body => {
		const inner = host().hidden ? null : host().querySelector('[data-shot-body]');
		if (inner) inner.innerHTML = body;
		else {
			const box = openDialog(`<h2>Read a storage from screenshots</h2><div data-shot-body>${body}</div>`,
				{ onDismiss: () => { if (stop) stop.abort(); closeReader(); } }).querySelector('.dialog-box');
			if (box) box.classList.add('wide', 'shot-box');
		}
		wire();
	};

	/* --- what to drop ------------------------------------------------ */
	const placePicker = () => `<div class="shot-lang">
		<label for="shot-store">This storage is</label>
		<select id="shot-store" class="purse-inline" data-place>
			${PLACES.map(t => `<option value="${esc(t)}"${t === place ? ' selected' : ''}>${t ? esc(t) : 'your bags'}</option>`).join('')}
		</select>
		<span class="row-sub">Every count read is written as what is kept there. Drop all the screenshots of one storage together — they are one storage, and their slots add up.</span>
	</div>`;

	const pickView = () => `
		<p class="dialog-note">A screenshot of the storage window reads, and so does a shot of the whole screen with the window open — the panel is found in it. Several at a time is the point: scroll the storage, shoot each screenful, drop the lot.</p>
		<ul class="shot-kinds">
			<li><b>What is read</b> — the picture in each slot, against the icons this app already carries, and the figure written over the corner.</li>
			<li><b>What is not</b> — anything the app keeps no count of. A storage is mostly that, and it is left alone.</li>
			<li><b>What a ship part is read as</b> — the part itself. The game draws every level of a part with the same picture, so a +10 sail comes back as a sail; set the level on its tile afterwards, or untick it here.</li>
			<li><b>How the counts are checked</b> — every line comes back with the corner of its slot beside it, as the screenshot had it, so a count is checked at a glance. One the reader is not sure of is marked ⚠ with its best reading written in; a mouse pointer lying over a figure is the usual reason.</li>
		</ul>
		${placePicker()}
		<div class="shot-drop" data-drop tabindex="0" role="button" aria-label="Choose screenshots to read">
			<div class="shot-drop-mark">🏰</div>
			<div><b>Drop screenshots here</b></div>
			<div class="row-sub">or <button class="link-btn" data-choose>choose files</button></div>
			<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-files>
		</div>
		<p class="dialog-note quiet">Up to ${LIMITS.files} at a time, ${Math.round(LIMITS.bytes / 1024 / 1024)} MB each, PNG, JPEG or WebP.
			They are read in this browser and never uploaded, and a storage needs no reader fetched for it: the pictures and the figures are both read off the pixels.</p>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>`;

	/* --- reading ----------------------------------------------------- */
	const readingView = (at, text) => `
		<p class="dialog-note">${esc(text)}</p>
		<div class="shot-bar"><i style="width:${Math.round(at * 100)}%"></i></div>
		<div class="dialog-actions"><button class="act quiet" data-stop>Stop</button></div>`;

	/* --- the review table -------------------------------------------- */
	const rowHTML = (r, i) => {
		const have = store.stockAt(r.item, place);
		const move = r.n - have;
		return `<tr class="shot-row${r.take === false ? ' off' : ''}">
			<td><input type="checkbox" data-take="${i}"${r.take === false ? '' : ' checked'} aria-label="Write this one in"></td>
			<td class="shot-item">${img(r.item, 'row-icon')}<span>${esc(r.item)}</span>${r.slots > 1 ? `<span class="row-sub">${r.slots} slots</span>` : ''}</td>
			<td><input class="purse-inline narrow" data-n="${i}" value="${r.n}" inputmode="numeric" aria-label="How many of ${esc(r.item)}"></td>
			<td class="shot-note">${have === r.n ? '<span class="quiet">already right</span>' : `${F(have)} → <b>${F(r.n)}</b>${move > 0 ? ` <span class="quiet">(+${F(move)})</span>` : ` <span class="quiet">(${F(move)})</span>`}`}</td>
			<td class="shot-note shot-proof">${r.shots.slice(0, 4).map(src => `<img class="shot-corner" src="${esc(src)}" alt="the corner of the slot as the screenshot had it">`).join('')}${r.shots.length > 4 ? `<span class="quiet">+${r.shots.length - 4}</span>` : ''}${r.guessed
		? `<span class="shot-warn" title="The reader was not sure of the figure over ${r.guessed === 1 ? 'one slot' : `${r.guessed} slots`}. What is written here is its best reading: check it against the slot beside it.">⚠ ${r.guessed === r.slots ? 'check this one' : `check ${r.guessed} of ${r.slots}`}</span>`
		: ''}</td>
		</tr>`;
	};

	const reviewView = () => {
		const taking = rows.filter(r => r.take !== false);
		const total = taking.reduce((a, r) => a + r.n, 0);
		const guessed = taking.filter(r => r.guessed).length;
		return `
		<p class="dialog-note">${rows.length
		? `Read ${rows.length} thing${rows.length === 1 ? '' : 's'} this app keeps a count of${unnamed ? `, and passed over ${unnamed} slot${unnamed === 1 ? '' : 's'} of what it does not` : ''}. These are written as what is kept at <b>${esc(place || 'your bags')}</b>, so anything of yours that is there and not in the shot should be unticked.`
		: `No storage slots were found in ${skipped.length ? 'the rest of ' : ''}those.`}</p>
		${skipped.length ? `<details class="shot-skipped"><summary>${skipped.length} not read</summary>${skipped.map(s => `<div class="row-sub">${esc(s.name)} — ${esc(s.why)}</div>`).join('')}</details>` : ''}
		${guessed ? `<p class="dialog-note quiet">${guessed === 1 ? 'One line has a count' : `${guessed} lines have counts`} the reader was not sure of — its best reading is written in and marked ⚠. Every line has the corner of its slot beside it, as the screenshot had it, to check the count against.</p>` : ''}
		${shaky.length ? `<p class="dialog-note quiet">The slots in ${shaky.map(n => `<b>${esc(n)}</b>`).join(', ')} could not be lined up with any confidence — a small or blurred shot, or not a storage at all — so everything read from ${shaky.length === 1 ? 'it' : 'them'} is marked ⚠.</p>` : ''}
		${shared ? `<p class="dialog-note quiet">${shared === 1 ? 'One row of slots was' : `${shared} rows of slots were`} in two of the screenshots — the storage was scrolled between them — and ${shared === 1 ? 'was' : 'were'} counted once.</p>` : ''}
		${rows.length ? `<div class="shot-table-wrap"><table class="shot-table">
			<thead><tr><th></th><th>What</th><th>How many</th><th>at ${esc(place || 'the bags')}</th><th></th></tr></thead>
			<tbody>${rows.map(rowHTML).join('')}</tbody>
		</table></div>` : ''}
		<div class="shot-lang">${placePicker()}</div>
		<div class="dialog-actions">
			<button class="act quiet" data-again>Read more</button>
			<span class="panel-spacer"></span>
			<button class="act quiet" data-close>Cancel</button>
			<button class="act" data-write${taking.length ? '' : ' disabled'}>${taking.length ? `Write ${taking.length} in${total ? ` · ${F(total)} in all` : ''}` : 'Nothing ticked'}</button>
		</div>`;
	};

	/* --- doing it ---------------------------------------------------- */
	async function run(files) {
		const { take, skipped: out } = await triage([...files]);
		skipped = out.map(s => ({ name: s.file.name, why: s.why }));
		if (!take.length) { rows = []; draw(reviewView()); return; }
		stop = new AbortController();
		draw(readingView(0, 'Learning the icons…'));
		const onProgress = p => {
			const bar = host().querySelector('.shot-bar i');
			const note = host().querySelector('.dialog-note');
			if (!bar || !note) return;
			const at = p.stage === 'reading' ? 0.4 + p.at * 0.6 : p.stage === 'done' ? 1 : (p.at || 0) * 0.4;
			bar.style.width = `${Math.round(at * 100)}%`;
			// A storage needs no engine fetched for it: the only wait is
			// the five hundred icons a slot is named against.
			note.textContent = p.stage === 'reading'
				? `Reading ${p.i + 1} of ${p.n} — ${p.name}`
				: p.stage === 'done' ? 'Done' : 'Learning the icons…';
		};
		let results;
		try {
			results = await readStorageShots(take, { onProgress, signal: stop.signal });
		} catch (err) {
			draw(`<p class="dialog-note warn">The reader could not start: ${esc(err && err.message ? err.message : String(err))}</p>
				<div class="dialog-actions"><button class="act quiet" data-again>Try again</button><button class="act" data-close>Close</button></div>`);
			return;
		} finally {
			stop = null;
		}
		unnamed = 0;
		shared = 0;
		shaky = results.filter(r => r.shaky && (r.rows || []).length).map(r => r.file);
		for (const shot of results) {
			shared += shot.sharedRows || 0;
			if (shot.why) skipped.push({ name: shot.file, why: shot.why });
			unnamed += shot.unknown || 0;
		}
		rows = gather(results, new Set(allItems()));
		draw(reviewView());
	}

	/* --- writing it -------------------------------------------------- */
	function write() {
		const taking = rows.filter(r => r.take !== false);
		if (!taking.length) return;
		// A trade good is never in the bags -- what no storage claims is
		// aboard -- so a reading of the bags that holds trade goods is
		// really a reading of the hold, and the Inventory would show it
		// as such anyway.
		const done = store.setStashAll(
			taking.map(r => ({ item: r.item, n: r.n })),
			place,
			`Read ${taking.length} ${taking.length === 1 ? 'count' : 'counts'} off a screenshot of ${place || 'the bags'}`
		);
		store.setSetting('shotStore', place, true);
		closeReader();
		closeDialog();
		toast(done
			? `${taking.length} ${taking.length === 1 ? 'count' : 'counts'} written in at ${place || 'your bags'}`
			: 'Everything read was already right', true);
		after();
	}

	/* --- wiring ------------------------------------------------------ */
	function wire() {
		const box = host();
		const drop = box.querySelector('[data-drop]');
		const input = box.querySelector('[data-files]');
		if (drop && input) {
			const choose = () => input.click();
			drop.addEventListener('click', choose);
			drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
			input.addEventListener('change', () => { if (input.files && input.files.length) run(input.files); });
			for (const ev of ['dragenter', 'dragover']) {
				drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); });
			}
			for (const ev of ['dragleave', 'drop']) {
				drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); });
			}
			drop.addEventListener('drop', e => {
				const files = e.dataTransfer && e.dataTransfer.files;
				if (files && files.length) run(files);
			});
		}
		const on = (sel, ev, fn) => box.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
		on('[data-place]', 'change', e => {
			place = e.target.value;
			store.setSetting('shotStore', place, true);
			draw(rows.length ? reviewView() : pickView());
		});
		on('[data-stop]', 'click', () => { if (stop) stop.abort(); });
		on('[data-again]', 'click', () => draw(pickView()));
		on('[data-write]', 'click', write);
		on('[data-take]', 'change', e => {
			rows[Number(e.target.dataset.take)].take = e.target.checked;
			draw(reviewView());
		});
		on('[data-n]', 'change', e => {
			const r = rows[Number(e.target.dataset.n)];
			r.n = Math.max(0, Math.floor(Number(String(e.target.value).replace(/[^\d]/g, '')) || 0));
			r.guessed = 0;              // typed over: not a guess any more
			draw(reviewView());
		});
	}

	draw(pickView());
}
