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

import { esc } from './fmt.js';
import { openDialog, closeDialog } from './dialogs.js';
import { LIMITS, triage, readWords, close as closeReader } from './shot-reader.js';
import { offersFrom } from './barter-shot.js';
import { npcs, isleOf, whoOf } from './barter_npcs.js';
import { img } from './ui-bits.js';

/**
 * The dialog.
 *
 * `deals` is every exchange the codex lists (barter-plan.js's
 * `exchanges`), and `onAnswers` what to do with the rows the player
 * keeps.
 */
export function openBarterImport({ deals, onAnswers = () => {} } = {}) {
	let stop = null;
	let rows = [];            // what was read: { isle, offer, near, keep }
	let skipped = [];

	const host = () => document.getElementById('dialog');
	const draw = body => {
		const inner = host().hidden ? null : host().querySelector('[data-shot-body]');
		if (inner) inner.innerHTML = body;
		else {
			const box = openDialog(`<h2>Read the barter window</h2><div data-shot-body>${body}</div>`,
				{ onDismiss: () => { if (stop) stop.abort(); closeReader(); } }).querySelector('.dialog-box');
			if (box) box.classList.add('wide', 'shot-box');
		}
		wire();
	};

	/* --- what to drop ------------------------------------------------ */
	const pickView = () => `
		<p class="dialog-note">Open the barter window in game and screenshot the list. Scroll it and shoot again for more of the board — several at a time is the point, and the rows add up.</p>
		<ul class="shot-kinds">
			<li><b>What is read</b> — the island at the start of each row, what it takes and what it pays. A name the window cut short is enough.</li>
			<li><b>What it is read against</b> — the exchanges the codex says that island deals, so a row is never a guess at a spelling.</li>
			<li><b>Which language</b> — the client's English names, which is what the app's own tables are in. A window in another language will not match them.</li>
		</ul>
		<div class="shot-drop" data-drop tabindex="0" role="button" aria-label="Choose screenshots to read">
			<div class="shot-drop-mark">⚖</div>
			<div><b>Drop screenshots here</b></div>
			<div class="row-sub">or <button class="link-btn" data-choose>choose files</button></div>
			<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden data-files>
		</div>
		<p class="dialog-note quiet">Up to ${LIMITS.files} at a time, ${Math.round(LIMITS.bytes / 1024 / 1024)} MB each, PNG, JPEG or WebP.
			They are read in this browser and never uploaded — the first read fetches about 6 MB of reader, once.</p>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>`;

	/* --- reading ----------------------------------------------------- */
	const readingView = (at, text) => `
		<p class="dialog-note">${esc(text)}</p>
		<div class="shot-bar"><i style="width:${Math.round(at * 100)}%"></i></div>
		<div class="dialog-actions"><button class="act quiet" data-stop>Stop</button></div>`;

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
			<td><input type="checkbox" data-take="${i}"${r.keep ? ' checked' : ''}${pick.length ? '' : ' disabled'} aria-label="Use this row"></td>
			<td class="shot-item">${img(r.keep ? r.keep.item : '', 'row-icon')}<span><b>${esc(isleOf(r.isle))}</b><span class="row-sub">${esc(whoOf(r.isle))}</span></span></td>
			<td>${pick.length
		? `<select class="purse-inline" data-offer="${i}" aria-label="What ${esc(isleOf(r.isle))} is showing">
				${pick.map((d, k) => `<option value="${k}"${k === chosen ? ' selected' : ''}>${esc(d.give)} → ${esc(d.item)}</option>`).join('')}
				<option value="">— none of these</option>
			</select>`
		: '<span class="quiet">nothing the codex lists fits that row</span>'}</td>
			<td class="shot-note">${r.offer ? '<span class="quiet">read</span>' : `<span class="shot-warn" title="${esc(r.why || '')}">⚠ ${esc(r.why || 'unsure')}</span>`}</td>
		</tr>`;
	};

	const reviewView = () => {
		const taking = rows.filter(r => r.keep);
		return `
		<p class="dialog-note">${rows.length
		? `Read ${rows.length} island${rows.length === 1 ? '' : 's'}. Check them against the window — a row read wrong puts the whole board on the wrong layout, and every one of these can be corrected from the list beside it.`
		: 'No barter rows were found in those. The window has to show the list itself: the island on the left of each row is what the rows are found by.'}</p>
		${skipped.length ? `<details class="shot-skipped"><summary>${skipped.length} not read</summary>${skipped.map(s => `<div class="row-sub">${esc(s.name)} — ${esc(s.why)}</div>`).join('')}</details>` : ''}
		${rows.length ? `<div class="shot-table-wrap"><table class="shot-table">
			<thead><tr><th></th><th>Island</th><th>Showing</th><th></th></tr></thead>
			<tbody>${rows.map(rowHTML).join('')}</tbody>
		</table></div>` : ''}
		<div class="dialog-actions">
			<button class="act quiet" data-again>Read more</button>
			<span class="panel-spacer"></span>
			<button class="act quiet" data-close>Cancel</button>
			<button class="act" data-use${taking.length ? '' : ' disabled'}>${taking.length ? `Answer ${taking.length} island${taking.length === 1 ? '' : 's'}` : 'Nothing ticked'}</button>
		</div>`;
	};

	/* --- doing it ---------------------------------------------------- */
	async function run(files) {
		const { take, skipped: out } = await triage([...files]);
		skipped = out.map(s => ({ name: s.file.name, why: s.why }));
		if (!take.length) { rows = []; draw(reviewView()); return; }
		stop = new AbortController();
		draw(readingView(0, 'Fetching the reader…'));
		const say = (at, text) => {
			const bar = host().querySelector('.shot-bar i');
			const note = host().querySelector('.dialog-note');
			if (bar) bar.style.width = `${Math.round(at * 100)}%`;
			if (note) note.textContent = text;
		};
		const seen = new Map();
		for (let i = 0; i < take.length; i++) {
			if (stop.signal.aborted) break;
			say(i / take.length, `Reading ${i + 1} of ${take.length} — ${take[i].name}`);
			try {
				const { words } = await readWords(take[i]);
				for (const row of offersFrom(words, { isles: npcs, deals })) {
					// An island read twice takes the later reading: the
					// second shot is the one the player scrolled to.
					seen.set(row.isle.id, { ...row, keep: row.offer || null });
				}
			} catch (err) {
				skipped.push({ name: take[i].name, why: err && err.message ? err.message : 'could not be read' });
			}
		}
		stop = null;
		rows = [...seen.values()].sort((a, b) => isleOf(a.isle).localeCompare(isleOf(b.isle)));
		draw(reviewView());
	}

	/* --- keeping it -------------------------------------------------- */
	async function use() {
		const taking = rows.filter(r => r.keep);
		if (!taking.length) return;
		const answers = taking.map(r => ({ npcId: r.isle.id, give: r.keep.give, recv: r.keep.item, qty: r.keep.giveText || '1' }));
		closeReader();
		closeDialog();
		// What the answers mean is the tab's business -- some of these
		// rows are the material list, which belongs to no layout -- so
		// the tab says what it did with them. Whether they are worth
		// telling the fleet is the tab's to say too: a reading is news
		// when it fits no layout on file, and the bar offers it then.
		onAnswers(answers);
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
}
