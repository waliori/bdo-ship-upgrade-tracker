// Back from a trip: several things at once, as one change.
//
// Coming off the water with five kinds of loot and typing each into
// its own row on two different tabs is the sort of chore that makes
// a tracker fall behind the game. This takes them all in one box and
// records them as one undoable step.

import { esc, parseAmount } from './fmt.js';
import * as store from './state.js';
import { allItems } from './ui-bits.js';
import { CROW_COIN, SILVER, SANGPYEONG } from './ui-state.js';
import { quests } from './quests.js';
import { openDialog, closeDialog, toast } from './dialogs.js';

let known = null;

function row(i) {
	return `<div class="trip-row">
		<input class="field trip-item" list="trip-items" placeholder="Item" aria-label="Item ${i + 1}" autocomplete="off">
		<input class="field trip-qty" type="text" inputmode="numeric" placeholder="+ how many" aria-label="How many of item ${i + 1}">
	</div>`;
}

export function openTripLog() {
	if (!known) {
		known = new Map();
		// Everything with a recipe or a source, the currencies, and
		// whatever a quest pays -- a trip brings back all of those.
		const names = [...allItems(), CROW_COIN, SILVER, SANGPYEONG,
			...quests.flatMap(q => [...Object.keys(q.rewards), ...(q.choice || []).flatMap(c => Object.keys(c))])];
		for (const name of names) known.set(name.toLowerCase(), name);
	}
	const host = openDialog(`
		<h2>Log a trip</h2>
		<p class="dialog-copy">Everything you brought back, in one go. Counts add to what you hold; a minus takes away.</p>
		<datalist id="trip-items">${[...known.values()].sort((a, b) => a.localeCompare(b)).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
		<div class="trip-rows" data-trip-rows>${[0, 1, 2, 3].map(row).join('')}</div>
		<div class="dialog-actions">
			<button class="ghost-btn" data-trip-more>+ another line</button>
			<button class="ghost-btn" data-close>Cancel</button>
			<button class="act" data-trip-save>Record</button>
		</div>`);
	const rows = host.querySelector('[data-trip-rows]');
	host.querySelector('[data-trip-more]').addEventListener('click', () => {
		rows.insertAdjacentHTML('beforeend', row(rows.children.length));
		rows.lastElementChild.querySelector('.trip-item').focus();
	});
	const save = () => {
		const delta = {};
		const names = [];
		for (const r of rows.querySelectorAll('.trip-row')) {
			const raw = r.querySelector('.trip-item').value.trim();
			const qtyRaw = r.querySelector('.trip-qty').value.trim();
			if (!raw && !qtyRaw) continue;
			const name = known.get(raw.toLowerCase());
			if (!name) return toast(`${raw || 'A line'} is not an item the tracker knows`);
			const n = parseAmount(qtyRaw);
			if (n === null || !n) return toast(`How many ${name}?`);
			delta[name] = (delta[name] || 0) + n;
			names.push(name);
		}
		if (!names.length) return toast('Nothing to record');
		store.applyDelta(delta, 'trip', `Logged a trip: ${names.join(', ')}`);
		closeDialog();
		toast(`Recorded ${names.length} ${names.length === 1 ? 'item' : 'items'} from the trip`, true);
	};
	host.querySelector('[data-trip-save]').addEventListener('click', save);
	host.addEventListener('keydown', evt => {
		if (evt.key === 'Enter' && evt.target.classList.contains('trip-qty')) {
			evt.preventDefault();
			const next = evt.target.closest('.trip-row').nextElementSibling;
			if (next) next.querySelector('.trip-item').focus(); else save();
		}
	});
	rows.querySelector('.trip-item').focus();
}
