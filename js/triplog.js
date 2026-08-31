// Back from a trip: several things at once, as one change.
//
// Coming off the water with five kinds of loot and typing each into
// its own row on two different tabs is the sort of chore that makes
// a tracker fall behind the game. This takes them all in one box --
// each item picked from a list with its picture -- and records them
// as one undoable step.

import { esc, F, parseAmount } from './fmt.js';
import * as store from './state.js';
import { img, allItems } from './ui-bits.js';
import { CROW_COIN, SILVER, SANGPYEONG } from './ui-state.js';
import { quests } from './quests.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { openPicker } from './picker.js';

let known = null;
function names() {
	if (!known) {
		// Everything with a recipe or a source, the currencies, and
		// whatever a quest pays -- a trip brings back all of those.
		known = [...new Set([...allItems(), CROW_COIN, SILVER, SANGPYEONG,
			...quests.flatMap(q => [...Object.keys(q.rewards), ...(q.choice || []).flatMap(c => Object.keys(c))])])]
			.sort((a, b) => a.localeCompare(b));
	}
	return known;
}

// The rows being filled in: { item, qty } -- kept here so the dialog
// can be re-opened after the picker without losing them.
let lines = [];

function rowHTML(l, i) {
	return `<div class="trip-row" data-i="${i}">
		<button class="trip-pick${l.item ? '' : ' empty'}" data-trip-pick="${i}" title="Choose the item">${l.item ? `${img(l.item, 'row-icon sm')}<span>${esc(l.item)}</span>` : '<span class="trip-plus">+</span><span>Choose an item…</span>'}</button>
		<input class="field trip-qty" type="text" inputmode="numeric" placeholder="how many" value="${esc(l.qty)}" data-trip-qty="${i}" aria-label="How many">
		<button class="map-x" data-trip-del="${i}" aria-label="Remove this line">×</button>
	</div>`;
}

function pickFor(i) {
	const stock = store.getAllStock();
	openPicker({
		title: 'Which item?',
		items: names().map(n => ({ id: n, label: n, icon: img(n, ''), meta: stock[n] ? `you hold ${F(stock[n])}` : '' })),
		selected: lines[i] && lines[i].item,
		onPick: item => {
			lines[i].item = item;
			openTripLog(i);
		}
	});
}

/** Open the log; `focusRow` puts the caret in that row's count. */
export function openTripLog(focusRow = null) {
	if (!lines.length) lines = [{ item: '', qty: '' }, { item: '', qty: '' }, { item: '', qty: '' }];
	const host = openDialog(`
		<h2>Log a trip</h2>
		<p class="dialog-copy">Everything you brought back, in one go. Counts add to what you hold; a minus takes away. One Undo takes the whole trip back.</p>
		<div class="trip-rows" data-trip-rows>${lines.map(rowHTML).join('')}</div>
		<div class="dialog-actions">
			<button class="ghost-btn" data-trip-more>+ another line</button>
			<button class="ghost-btn" data-trip-cancel>Cancel</button>
			<button class="act" data-trip-save>Record</button>
		</div>`);
	const rows = host.querySelector('[data-trip-rows]');
	const readQty = () => { for (const inp of rows.querySelectorAll('[data-trip-qty]')) lines[Number(inp.dataset.tripQty)].qty = inp.value; };
	// Read the counts before the list changes, never after -- the old
	// inputs outnumber the new lines for a moment.
	const repaint = () => { rows.innerHTML = lines.map(rowHTML).join(''); };
	rows.addEventListener('click', evt => {
		const pick = evt.target.closest('[data-trip-pick]');
		if (pick) { readQty(); closeDialog(); return pickFor(Number(pick.dataset.tripPick)); }
		const del = evt.target.closest('[data-trip-del]');
		if (del) { readQty(); lines.splice(Number(del.dataset.tripDel), 1); if (!lines.length) lines.push({ item: '', qty: '' }); repaint(); }
	});
	host.querySelector('[data-trip-more]').addEventListener('click', () => {
		readQty();
		lines.push({ item: '', qty: '' });
		repaint();
		rows.lastElementChild.querySelector('[data-trip-pick]').focus();
	});
	host.querySelector('[data-trip-cancel]').addEventListener('click', () => { lines = []; closeDialog(); });
	const save = () => {
		readQty();
		const delta = {};
		const used = [];
		for (const l of lines) {
			if (!l.item && !String(l.qty).trim()) continue;
			if (!l.item) return toast('A line has a count but no item — choose one');
			const n = parseAmount(String(l.qty));
			if (n === null || !n) return toast(`How many ${l.item}?`);
			delta[l.item] = (delta[l.item] || 0) + n;
			used.push(l.item);
		}
		if (!used.length) return toast('Nothing to record');
		store.applyDelta(delta, 'trip', `Logged a trip: ${used.join(', ')}`);
		lines = [];
		closeDialog();
		toast(`Recorded ${used.length} ${used.length === 1 ? 'item' : 'items'} from the trip`, true);
	};
	host.querySelector('[data-trip-save]').addEventListener('click', save);
	host.addEventListener('keydown', evt => {
		if (evt.key === 'Enter' && evt.target.matches('[data-trip-qty]')) {
			evt.preventDefault();
			const next = evt.target.closest('.trip-row').nextElementSibling;
			if (next) next.querySelector('[data-trip-pick]').focus(); else save();
		}
	});
	const target = focusRow !== null && rows.querySelector(`[data-trip-qty="${focusRow}"]`);
	if (target) target.focus(); else rows.querySelector('[data-trip-pick]').focus();
}
