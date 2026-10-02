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
import { T, said, gameName } from './i18n.js';
import * as store from './state.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { LIMITS, triage, readStorageShots, wireShotIntake, close as closeReader } from './shot-reader.js';
import { allItems, img } from './ui-bits.js';
import { isLandGood } from './land_goods.js';
import { TOWNS } from './screen-inventory.js';
import { stacks, slotsHeld } from './barter-plan.js';
import { levelOf } from './barter.js';
import { holdGoods, hullSlots, inHoldAt } from './hold-room.js';
import { currentShip, shownSlots } from './ship.js';

/** Where a reading is written by default, remembered between goes: a
 *  player reads the same storage every week. */
const lastPlace = () => store.getSetting('shotStore', '');
/** Update (only what was read is written) or replace (what is kept
 *  there and not in the shots goes too), remembered likewise. */
const lastMode = () => (store.getSetting('shotMode', 'update') === 'replace' ? 'replace' : 'update');
const PLACES = ['', ...TOWNS];

/** The name for a slot that this app actually keeps a count of.
 *
 *  An icon can belong to several names -- the codex lists a barter good
 *  both as "Statue's Tear" and as "[Level 5] Statue's Tear" -- and only
 *  one of them is the name the rest of the app uses. Where none of them
 *  is, the slot is something the app does not track, and it is left
 *  out rather than invented. */
/** The slot size, in pixels, under which icons stop being told apart:
 *  the app's own are 44 across, and the game draws a slot a little
 *  larger than its icon at its usual interface size. */
const SLOT_MIN = 42;

function knownName(row, known) {
	const names = row.alsoCalled || [row.item];
	return names.find(n => known.has(n)) || null;
}

/** A good the game keeps as one stack: a trade good under [Level 5]
 *  and the shore goods a chain starts from. The game never splits a
 *  stack, a thousand of it or ten thousand (owner's rule, 2026-10-02),
 *  so a stack is one slot whatever its figure. Everything else is left
 *  to add up slot by slot -- a ship part is one to a slot, and so are
 *  the goods that do not stack. */
const oneStack = name => (levelOf(name) !== null ? stacks(name) : isLandGood(name));

/**
 * The reading, gathered: one line an item, counting every slot it was
 * seen in.
 *
 * A storage is read a screenful at a time, so several shots are one
 * storage and their slots add up. A stack is the exception: the game
 * never splits one, so a good that stacks seen in two slots is the same
 * stack seen twice -- two shots that overlap where the overlap was not
 * found -- or an icon misread. Its largest figure is kept, as one slot,
 * and the line is marked to be checked.
 */
export function gather(results, known) {
	const by = new Map();
	for (const shot of results) {
		for (const row of shot.rows || []) {
			const name = knownName(row, known);
			if (!name) continue;
			if (!by.has(name)) by.set(name, { item: name, n: 0, slots: 0, seen: 0, guessed: 0, shots: [] });
			const line = by.get(name);
			const qty = Math.max(0, Number(row.qty) || 0);
			line.seen++;
			if (oneStack(name)) {
				line.n = Math.max(line.n, qty);
				line.slots = 1;
				// one slot to check: unsure of its figure, or seen twice
				if (!row.sure || line.seen > 1) line.guessed = 1;
			} else {
				// A good that does not stack -- a [Level 5] and up, the [Great
				// Ocean] goods, the rare pays -- is one to a slot in the game, so
				// each slot of it is one, whatever figure the reader thought it
				// saw on it.
				const one = levelOf(name) !== null && !stacks(name);
				line.n += one ? 1 : qty;
				line.slots++;
				if (!row.sure) line.guessed++;
			}
			// the doubtful slots' corners first: they are the ones to look at
			if (row.corner) { if (row.sure) line.shots.push(row.corner); else line.shots.unshift(row.corner); }
		}
	}
	return [...by.values()].sort((a, b) =>
		(b.guessed > 0) - (a.guessed > 0) || b.n - a.n || a.item.localeCompare(b.item));
}

/**
 * Read a storage off screenshots.
 *
 * `handOff` turns the dialog from one that writes counts into one that
 * hands them back: the trip log borrows it that way, so a sailor who
 * has just come off a run can shoot the hold and have the lines filled
 * in rather than picking forty items by hand. It is `{ label, note,
 * onRows }` -- what the button says, what the head says, and where the
 * rows go instead of into the Inventory.
 */
export function openStorageImport(after = () => {}, handOff = null) {
	let stop = null;            // an AbortController while a batch is being read
	let rows = [];              // the gathered reading, as the table has it
	let skipped = [];           // files that were not read, and why
	let shared = 0;             // rows of slots two shots both had, counted once
	let shaky = [];             // shots whose lattice the icons did not believe
	let unnamed = 0;            // slots that held something the app does not know
	let small = [];             // shots whose slots are too small to tell apart
	let place = lastPlace();
	let mode = lastMode();
	let taken = [];             // every file read so far: Read more adds to them, and they are read again together
	let adding = false;         // the next batch adds to the reading rather than starting it afresh
	const keep = new Set();     // things the replace would take away that the sailor kept

	const host = () => document.getElementById('dialog');
	// Opened once and redrawn in place: opening it again counts as
	// dismissing the one already there, and this dialog's dismissal
	// stops the batch.
	const draw = body => {
		const inner = host().hidden ? null : host().querySelector('[data-shot-body]');
		if (inner) inner.innerHTML = body;
		else {
			const box = openDialog(`<h2>${T('Read a storage from screenshots')}</h2><div data-shot-body>${body}</div>`,
				{ onDismiss: () => { if (stop) stop.abort(); closeReader(); } }).querySelector('.dialog-box');
			if (box) box.classList.add('wide', 'shot-box');
		}
		wire();
	};

	/* --- what to drop ------------------------------------------------ */
	const placePicker = () => `<div class="shot-lang">
		<label for="shot-store">${T('This storage is')}</label>
		<select id="shot-store" class="purse-inline" data-place>
			${PLACES.map(t => `<option value="${esc(t)}"${t === place ? ' selected' : ''}>${t ? esc(gameName(t)) : T('your bags')}</option>`).join('')}
		</select>
		<span class="row-sub">${T('Every count read is written as what is kept there. Drop all the screenshots of one storage together — they are one storage, and their slots add up.')}</span>
	</div>
	<div class="shot-mode" role="radiogroup" aria-label="${T('What the screenshots do')}">
		<label><input type="radio" name="shot-mode" value="update" data-mode${mode === 'update' ? ' checked' : ''}> <b>${T('Update')}</b> <span class="row-sub">${T('Write what the screenshots show; everything else kept there stays as it is.')}</span></label>
		<label><input type="radio" name="shot-mode" value="replace" data-mode${mode === 'replace' ? ' checked' : ''}> <b>${T('Replace')}</b> <span class="row-sub">${T('The screenshots are the whole storage: what is kept there and not in them goes. Add every screenshot first — Read more adds to the table — and write when you are done.')}</span></label>
	</div>`;

	// The drop zone and what the shots are of come first; how the reading
	// works is folded under them. On a phone the explanation filled a
	// screen and a half before the one control that mattered.
	const pickView = () => `
		${handOff ? `<p class="dialog-note">${said(handOff.note)}</p>` : ''}
		${adding && rows.length ? `<p class="dialog-note shot-adding">${T('Adding to the {n} lines read so far: the new screenshots are read together with the ones before, and nothing is written until you say so.', { n: rows.length })}</p>` : ''}
		${handOff ? '' : placePicker()}
		<div class="shot-drop" data-drop tabindex="0" role="button" aria-label="${T('Choose screenshots to read')}">
			<div class="shot-drop-mark">🏰</div>
			<div><b>${T('Drop screenshots here, or paste one')}</b></div>
			<div class="row-sub">${T('{paste}, or {link}', { paste: `<b>${T('Ctrl+V')}</b>`, link: `<button class="link-btn" data-choose>${T('choose files')}</button>` })}</div>
			<div class="row-sub quiet">${T('A shot taken with Shift+Win+S goes to the clipboard — paste it straight in, no file to save first.')}</div>
			<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-files>
		</div>
		<details class="help-more shot-how">
			<summary>${T('How it reads')}</summary>
			<p class="dialog-note">${T('A screenshot of the storage window reads, and so does a shot of the whole screen with the window open — the panel is found in it. Several at a time is the point: scroll the storage, shoot each screenful, drop the lot.')}</p>
			<ul class="shot-kinds">
				<li>${T('<b>What is read</b> — the picture in each slot, against the icons this app already carries, and the figure written over the corner.')}</li>
				<li>${T('<b>What is not</b> — anything the app keeps no count of. A storage is mostly that, and it is left alone.')}</li>
				<li>${T('<b>What a ship part is read as</b> — the part itself. The game draws every level of a part with the same picture, so a +10 sail comes back as a sail; set the level on its tile afterwards, or untick it here.')}</li>
				<li>${T('<b>How the counts are checked</b> — every line comes back with the corner of its slot beside it, as the screenshot had it, so a count is checked at a glance. One the reader is not sure of is marked ⚠ with its best reading written in; a mouse pointer lying over a figure is the usual reason.')}</li>
			</ul>
			<p class="dialog-note quiet">${T('Up to {files} at a time, {mb} MB each, PNG, JPEG or WebP.', { files: LIMITS.files, mb: Math.round(LIMITS.bytes / 1024 / 1024) })}
				${T('They are read in this browser and never uploaded, and a storage needs no reader fetched for it: the pictures and the figures are both read off the pixels.')}</p>
		</details>
		<div class="dialog-actions">${adding && rows.length ? `<button class="act quiet" data-back>‹ ${T('Back to the table')}</button>` : ''}<button class="act quiet" data-close>${T('Close')}</button></div>`;

	/* --- reading ----------------------------------------------------- */
	const readingView = (at, text) => `
		<p class="dialog-note">${esc(text)}</p>
		<div class="shot-bar"><i style="width:${Math.round(at * 100)}%"></i></div>
		<div class="dialog-actions"><button class="act quiet" data-stop>${T('Stop')}</button></div>`;

	/* --- the review table -------------------------------------------- */
	const rowHTML = (r, i) => {
		const have = store.stockAt(r.item, place);
		const move = r.n - have;
		return `<tr class="shot-row${r.take === false ? ' off' : ''}">
			<td><input type="checkbox" data-take="${i}"${r.take === false ? '' : ' checked'} aria-label="${T('Write this one in')}"></td>
			<td class="shot-item">${img(r.item, 'row-icon')}<span>${esc(gameName(r.item))}</span>${r.slots > 1 ? `<span class="row-sub">${T('{n} slots', { n: r.slots })}</span>` : ''}${r.seen > r.slots ? `<span class="row-sub">${T('seen in {n} slots: the game keeps it as one stack, so the largest figure is written', { n: r.seen })}</span>` : ''}</td>
			<td><input class="purse-inline narrow" data-n="${i}" value="${r.n}" inputmode="numeric" aria-label="${T('How many of {item}', { item: esc(gameName(r.item)) })}"></td>
			<td class="shot-note">${have === r.n ? `<span class="quiet">${T('already right')}</span>` : `${F(have)} → <b>${F(r.n)}</b>${move > 0 ? ` <span class="quiet">(+${F(move)})</span>` : ` <span class="quiet">(${F(move)})</span>`}`}</td>
			<td class="shot-note shot-proof">${r.shots.slice(0, 4).map(src => `<img class="shot-corner" src="${esc(src)}" alt="${T('the corner of the slot as the screenshot had it')}">`).join('')}${r.shots.length > 4 ? `<span class="quiet">+${r.shots.length - 4}</span>` : ''}${r.guessed
		? `<span class="shot-warn" title="${T('The reader was not sure of the figure over {slots}. What is written here is its best reading: check it against the slot beside it.', { slots: r.guessed === 1 ? T('one slot') : T('{n} slots', { n: r.guessed }) })}">⚠ ${r.guessed === r.slots ? T('check this one') : T('check {n} of {slots}', { n: r.guessed, slots: r.slots })}</span>`
		: ''}</td>
		</tr>`;
	};

	// What a replace takes away: kept at this place, not in the reading.
	// Never a ship part at a level -- the reader reads every level as the
	// plain part -- and never a trade good from the bags, which are the
	// hold's; and nothing the sailor ticked to keep.
	const goneList = () => {
		if (mode !== 'replace' || handOff) return [];
		const read = new Set(rows.map(r => r.item));
		return Object.keys(store.getAllStock())
			.filter(item => !read.has(item) && store.stockAt(item, place) > 0 && !/^\+\d+\s/.test(item) && !(place === '' && levelOf(item) !== null))
			.map(item => ({ item, n: store.stockAt(item, place) }))
			.sort((a, b) => a.item.localeCompare(b.item));
	};
	const goneHTML = gone => (gone.length ? `<details class="shot-gone" open><summary>${gone.length === 1
		? T('{n} thing kept at {place} is not in the screenshots, and goes', { n: gone.length, place: esc(place ? gameName(place) : T('your bags')) })
		: T('{n} things kept at {place} are not in the screenshots, and go', { n: gone.length, place: esc(place ? gameName(place) : T('your bags')) })}</summary>
		<p class="row-sub">${T('Untick anything that is there and the screenshots missed. Ship parts at a level are never taken away: the reader cannot tell the levels apart.')}</p>
		<ul class="remove-list">${gone.map(g => `<li><input type="checkbox" data-gone="${esc(g.item)}"${keep.has(g.item) ? '' : ' checked'} aria-label="${T('Take this one away')}">${img(g.item, 'row-icon sm')}<span>${esc(gameName(g.item))}</span><b>${F(g.n)}</b></li>`).join('')}</ul></details>` : '');

	const reviewView = () => {
		const taking = rows.filter(r => r.take !== false);
		const gone = goneList();
		const going = gone.filter(g => !keep.has(g.item));
		const total = taking.reduce((a, r) => a + r.n, 0);
		// The slots what is written takes at this storage, counted the
		// game's way: a [Level 5] and up one a unit, the rest one a kind.
		// The storage's own size is not read off the shots, so this says
		// what is taken and holds nothing back.
		const slots = slotsHeld(new Map(taking.map(r => [r.item, r.n])));
		// Written into the ship's hold -- a trade good in the bags is aboard
		// -- the reading is the game's own and is written as read, but a
		// hold it takes past the hull's slots is said: a misread, most
		// likely, and the hold shows over until it is put right.
		const aboard = holdGoods();
		let into = false;
		for (const r of [...taking, ...going.map(g => ({ item: g.item, n: 0 }))]) {
			if (!inHoldAt(r.item, place)) continue;
			into = true;
			aboard.set(r.item, Math.max(0, (aboard.get(r.item) || 0) - store.stockAt(r.item, place)) + r.n);
		}
		const holdOver = into && slotsHeld(aboard) > hullSlots() ? shownSlots(currentShip().hold, slotsHeld(aboard)) : null;
		const guessed = taking.filter(r => r.guessed).length;
		return `
		<p class="dialog-note">${rows.length
		? `${unnamed
			? T('Read {things} this app keeps a count of, and passed over {slots} of what it does not.', { things: rows.length === 1 ? T('{n} thing', { n: rows.length }) : T('{n} things', { n: rows.length }), slots: unnamed === 1 ? T('{n} slot', { n: unnamed }) : T('{n} slots', { n: unnamed }) })
			: T('Read {things} this app keeps a count of.', { things: rows.length === 1 ? T('{n} thing', { n: rows.length }) : T('{n} things', { n: rows.length }) })} ${T('These are written as what is kept at <b>{place}</b>, so anything of yours that is there and not in the shot should be unticked.', { place: esc(place ? gameName(place) : T('your bags')) })}`
		: skipped.length ? T('No storage slots were found in the rest of those.') : T('No storage slots were found in those.')}</p>
		${skipped.length ? `<details class="shot-skipped"><summary>${T('{n} not read', { n: skipped.length })}</summary>${skipped.map(s => `<div class="row-sub">${esc(s.name)} — ${esc(said(s.why))}</div>`).join('')}</details>` : ''}
		${guessed ? `<p class="dialog-note quiet">${guessed === 1 ? T('One line has a count the reader was not sure of — its best reading is written in and marked ⚠.') : T('{n} lines have counts the reader was not sure of — its best reading is written in and marked ⚠.', { n: guessed })} ${T('Every line has the corner of its slot beside it, as the screenshot had it, to check the count against.')}</p>` : ''}
		${small.length ? `<p class="dialog-note shot-small">⚠ ${small.length === 1
			? T('The slots in {file} are only {px} pixels across, and the reader needs about {min} to tell one icon from another — so most of this storage was not read, and what is listed below is not the whole of it. Shoot the game at its full size, and paste the shot in rather than saving it through another program.', { file: `<b>${esc(small[0].file)}</b>`, px: small[0].pitch, min: SLOT_MIN })
			: T('The slots in {n} of these shots are under {min} pixels across, which is too small to tell one icon from another — so most of those storages were not read. Shoot the game at its full size, and paste the shots in rather than saving them through another program.', { n: small.length, min: SLOT_MIN })}</p>` : ''}
		${shaky.length ? `<p class="dialog-note quiet">${shaky.length === 1
			? T('The slots in {files} could not be lined up with any confidence — a small or blurred shot, or not a storage at all — so everything read from it is marked ⚠.', { files: shaky.map(n => `<b>${esc(n)}</b>`).join(', ') })
			: T('The slots in {files} could not be lined up with any confidence — a small or blurred shot, or not a storage at all — so everything read from them is marked ⚠.', { files: shaky.map(n => `<b>${esc(n)}</b>`).join(', ') })}</p>` : ''}
		${shared ? `<p class="dialog-note quiet">${shared === 1
			? T('One row of slots was in two of the screenshots — the storage was scrolled between them — and was counted once.')
			: T('{n} rows of slots were in two of the screenshots — the storage was scrolled between them — and were counted once.', { n: shared })}</p>` : ''}
		${rows.length ? `<div class="shot-table-wrap"><table class="shot-table">
			<thead><tr><th></th><th>${T('What')}</th><th>${T('How many')}</th><th>${T('at {place}', { place: esc(place ? gameName(place) : T('the bags')) })}</th><th></th></tr></thead>
			<tbody>${rows.map(rowHTML).join('')}</tbody>
		</table></div>${slots ? `<p class="dialog-note quiet">${T('What is ticked takes {n} slots there: a [Level 5] and up one each, the rest one a kind.', { n: F(slots) })}</p>` : ''}${holdOver ? `<p class="dialog-note warn">⚠ ${T('Written as read, this puts the ship\'s hold at {text}: more than the hull has. Nothing is left out, and the hold shows over until some of it goes ashore — check the counts against the shots.', { text: esc(holdOver.text) })}</p>` : ''}` : ''}
		${goneHTML(gone)}
		${handOff ? '' : `<div class="shot-lang">${placePicker()}</div>`}
		<div class="dialog-actions">
			<button class="act quiet" data-again>${T('Read more')}</button>
			<span class="panel-spacer"></span>
			<button class="act quiet" data-close>${T('Cancel')}</button>
			<button class="act" data-write${taking.length || going.length ? '' : ' disabled'}>${!taking.length && !going.length ? T('Nothing ticked')
		: mode === 'replace' && !handOff ? T('Replace {place}: {n} written, {m} taken away', { place: esc(place ? gameName(place) : T('your bags')), n: taking.length, m: going.length })
			: `${handOff ? T('{label} · {n}', { label: said(handOff.label), n: taking.length }) : T('Write {n} in', { n: taking.length })}${total ? ` · ${T('{n} in all', { n: F(total) })}` : ''}`}</button>
		</div>`;
	};

	/* --- doing it ---------------------------------------------------- */
	async function run(files) {
		const { take, skipped: out } = await triage([...files]);
		// Read more adds: the shots so far and the new ones are read again
		// together, so a row two of them share is still counted once, and
		// what was typed over or unticked in the table is kept.
		const more = adding && rows.length;
		adding = false;
		const edits = more ? new Map(rows.map(r => [r.item, { take: r.take, n: r.n, typed: r.typed }])) : new Map();
		taken = more ? [...taken, ...take] : take;
		skipped = out.map(s => ({ name: s.file.name, why: s.why }));
		if (!taken.length) { rows = []; draw(reviewView()); return; }
		stop = new AbortController();
		draw(readingView(0, T('Learning the icons…')));
		const onProgress = p => {
			const bar = host().querySelector('.shot-bar i');
			const note = host().querySelector('.dialog-note');
			if (!bar || !note) return;
			const at = p.stage === 'reading' ? 0.4 + p.at * 0.6 : p.stage === 'done' ? 1 : (p.at || 0) * 0.4;
			bar.style.width = `${Math.round(at * 100)}%`;
			// A storage needs no engine fetched for it: the only wait is
			// the five hundred icons a slot is named against.
			note.textContent = p.stage === 'reading'
				? T('Reading {i} of {n} — {name}', { i: p.i + 1, n: p.n, name: p.name })
				: p.stage === 'done' ? T('Done') : T('Learning the icons…');
		};
		let results;
		try {
			results = await readStorageShots(taken, { onProgress, signal: stop.signal });
		} catch (err) {
			draw(`<p class="dialog-note warn">${T('The reader could not start: {why}', { why: esc(err && err.message ? err.message : String(err)) })}</p>
				<div class="dialog-actions"><button class="act quiet" data-again>${T('Try again')}</button><button class="act" data-close>${T('Close')}</button></div>`);
			return;
		} finally {
			stop = null;
		}
		unnamed = 0;
		shared = 0;
		shaky = results.filter(r => r.shaky && (r.rows || []).length).map(r => r.file);
		// A shot whose slots are smaller than the app's own icons. The grid
		// is still found, but a 37-pixel slot held against a 44-pixel icon
		// matches almost nothing: Oni's bags came back as three things out
		// of sixty, under a sentence that read as if the lot had been seen.
		small = results.filter(r => r.pitch > 0 && r.pitch < SLOT_MIN).map(r => ({ file: r.file, pitch: r.pitch }));
		for (const shot of results) {
			shared += shot.sharedRows || 0;
			if (shot.why) skipped.push({ name: shot.file, why: shot.why });
			unnamed += shot.unknown || 0;
		}
		rows = gather(results, new Set(allItems()));
		for (const r of rows) {
			const e = edits.get(r.item);
			if (!e) continue;
			if (e.take === false) r.take = false;
			if (e.typed) { r.n = e.n; r.typed = true; r.guessed = 0; }
		}
		draw(reviewView());
	}

	/* --- writing it -------------------------------------------------- */
	function write() {
		const taking = rows.filter(r => r.take !== false);
		const going = handOff ? [] : goneList().filter(g => !keep.has(g.item));
		if (!taking.length && !going.length) return;
		// Handed back rather than written: whoever asked for the reading
		// decides what the counts mean.
		if (handOff) {
			closeReader();
			closeDialog();
			handOff.onRows(taking.map(r => ({ item: r.item, n: r.n })));
			return;
		}
		// A trade good is never in the bags -- what no storage claims is
		// aboard -- so a reading of the bags that holds trade goods is
		// really a reading of the hold, and the Inventory would show it
		// as such anyway.
		const done = store.setStashAll(
			[...taking.map(r => ({ item: r.item, n: r.n })), ...going.map(g => ({ item: g.item, n: 0 }))],
			place,
			going.length ? T('Replaced {place} from screenshots: {n} counts, {m} taken away', { place: place || T('the bags'), n: taking.length, m: going.length })
			: taking.length === 1
				? T('Read {n} count off a screenshot of {place}', { n: taking.length, place: place || T('the bags') })
				: T('Read {n} counts off a screenshot of {place}', { n: taking.length, place: place || T('the bags') })
		);
		store.setSetting('shotStore', place, true);
		closeReader();
		closeDialog();
		toast(done
			? going.length ? T('{place} replaced: {n} written, {m} taken away', { place: place ? gameName(place) : T('your bags'), n: taking.length, m: going.length })
			: (taking.length === 1
				? T('{n} count written in at {place}', { n: taking.length, place: place ? gameName(place) : T('your bags') })
				: T('{n} counts written in at {place}', { n: taking.length, place: place ? gameName(place) : T('your bags') }))
			: T('Everything read was already right'), true);
		after();
	}

	/* --- wiring ------------------------------------------------------ */
	function wire() {
		const box = host();
		wireShotIntake(box, run);
		const on = (sel, ev, fn) => box.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
		on('[data-place]', 'change', e => {
			place = e.target.value;
			store.setSetting('shotStore', place, true);
			draw(rows.length ? reviewView() : pickView());
		});
		on('[data-stop]', 'click', () => { if (stop) stop.abort(); });
		on('[data-again]', 'click', () => { adding = rows.length > 0; draw(pickView()); });
		on('[data-back]', 'click', () => { adding = false; draw(reviewView()); });
		on('[data-mode]', 'change', e => {
			mode = e.target.value === 'replace' ? 'replace' : 'update';
			store.setSetting('shotMode', mode, true);
			draw(rows.length ? reviewView() : pickView());
		});
		on('[data-gone]', 'change', e => {
			const item = e.target.dataset.gone;
			if (e.target.checked) keep.delete(item); else keep.add(item);
			draw(reviewView());
		});
		on('[data-write]', 'click', write);
		on('[data-take]', 'change', e => {
			rows[Number(e.target.dataset.take)].take = e.target.checked;
			draw(reviewView());
		});
		on('[data-n]', 'change', e => {
			const r = rows[Number(e.target.dataset.n)];
			r.n = Math.max(0, Math.floor(Number(String(e.target.value).replace(/[^\d]/g, '')) || 0));
			r.guessed = 0;              // typed over: not a guess any more
			r.typed = true;             // and kept when Read more reads the lot again
			draw(reviewView());
		});
	}

	draw(pickView());
}
