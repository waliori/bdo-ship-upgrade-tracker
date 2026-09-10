// Back from a trip: several things at once, as one change.
//
// Coming off the water with five kinds of loot and typing each into
// its own row on two different tabs is the sort of chore that makes
// a tracker fall behind the game. This takes them all in one box --
// each item picked from a list with its picture -- and records them
// as one undoable step.

import { esc, F, parseAmount } from './fmt.js';
import { T, said, gameName } from './i18n.js';
import * as store from './state.js';
import { img, allItems, offerableItems } from './ui-bits.js';
import { snapshot } from './ui-state.js';
import { CROW_COIN, SILVER, SANGPYEONG } from './ui-state.js';
import { quests } from './quests.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { openPicker } from './picker.js';
import { KINDS, kindOf } from './kinds.js';

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
		<button class="trip-pick${l.item ? '' : ' empty'}" data-trip-pick="${i}" title="${T('Choose the item')}">${l.item ? `${img(l.item, 'row-icon sm')}<span>${esc(gameName(l.item))}</span>` : `<span class="trip-plus">+</span><span>${T('Choose an item…')}</span>`}</button>
		<input class="field trip-qty" type="text" inputmode="numeric" placeholder="${T('how many')}" value="${esc(l.qty)}" data-trip-qty="${i}" aria-label="${T('How many')}">
		<button class="map-x" data-trip-del="${i}" aria-label="${T('Remove this line')}">×</button>
	</div>`;
}

/**
 * The list to choose from, in the order a sailor coming off the water
 * wants it.
 *
 * What the builds are short of comes first, because that is what the
 * trip was for -- it was previously one alphabetical run of every name
 * the app knows, where the thing you sailed out for sat between two
 * things you will never hold. Then what is already in stock, which is
 * the other common case: topping up a pile. Then everything else, still
 * there to be typed at.
 *
 * The eleven enhancement levels of each ship part are left out unless
 * they are real for this player -- nobody comes back from a barter run
 * with a +7 sail, and 720 of the 938 names are those.
 */
function pickerItems(query = '') {
	const stock = store.getAllStock();
	const needed = (snapshot && snapshot.missing) || {};
	const offered = offerableItems(names(), { query, stock, needed });

	const want = [], held = [], rest = [];
	for (const n of offered) {
		const short = Number(needed[n]) || 0;
		const have = Number(stock[n]) || 0;
		if (short > 0) {
			want.push({ id: n, label: gameName(n), icon: img(n, ''), group: T('Your builds still need'),
				meta: T('{n} short', { n: F(short) }), sub: have ? T('you hold {n}', { n: F(have) }) : '', boost: 2 });
		} else if (have > 0) {
			held.push({ id: n, label: gameName(n), icon: img(n, ''), group: T('Already in your stock'),
				meta: T('you hold {n}', { n: F(have) }), boost: 1 });
		} else {
			rest.push({ id: n, label: gameName(n), icon: img(n, ''), group: T('Everything else') });
		}
	}
	// Biggest shortfall first: the deeper the hole, the more likely it is
	// what was just sailed for.
	want.sort((a, b) => (Number(needed[b.id]) || 0) - (Number(needed[a.id]) || 0) || a.id.localeCompare(b.id));
	held.sort((a, b) => (Number(stock[b.id]) || 0) - (Number(stock[a.id]) || 0) || a.id.localeCompare(b.id));
	return [...want, ...held, ...rest];
}

function pickFor(i) {
	const items = pickerItems();
	const shortOf = items.filter(it => it.boost === 2).length;
	// One kind at a time when asked: a trip that brought back goods is
	// logged from the goods, without the planks in between.
	let kind = 'all';
	const chipsFor = () => [['all', T('Everything')], ...KINDS.map(k => [k.id, said(k.label)])].map(([id, label]) => ({ id, label, on: kind === id }));
	openPicker({
		title: T('Which item?'),
		hint: shortOf
			? (shortOf === 1
				? T('The one thing your builds are still short of is first. Type to reach anything else.')
				: T('The {n} things your builds are still short of are first. Type to reach anything else.', { n: shortOf }))
			: T('Type to find anything you brought back.'),
		items,
		chips: chipsFor(),
		onChips: id => {
			kind = id;
			return { items: kind === 'all' ? items : items.filter(it => kindOf(it.id) === kind), chips: chipsFor() };
		},
		selected: lines[i] && lines[i].item,
		onPick: item => {
			lines[i].item = item;
			openTripLog(i);
		}
	});
}

/** Where the counts land, when a kind has a storage of its own. */
function homesNote() {
	const homes = store.getProfile('homes', {}) || {};
	const parts = KINDS.filter(k => homes[k.id]).map(k => T('{kind} at {where}', { kind: said(k.label).toLowerCase(), where: gameName(homes[k.id]) }));
	return parts.length ? ` ${T('What arrives is noted where it is kept: {list} — set on the Inventory.', { list: esc(parts.join(', ')) })}` : '';
}

/** Open the log; `focusRow` puts the caret in that row's count. */
export function openTripLog(focusRow = null) {
	if (!lines.length) lines = [{ item: '', qty: '' }, { item: '', qty: '' }, { item: '', qty: '' }];
	const host = openDialog(`
		<h2>${T('Log a trip')}</h2>
		<p class="dialog-copy">${T('Everything you brought back, in one go. Counts add to what you hold; a minus takes away. One Undo takes the whole trip back.')}${homesNote()}</p>
		<div class="trip-rows" data-trip-rows>${lines.map(rowHTML).join('')}</div>
		<div class="dialog-actions">
			<button class="ghost-btn" data-trip-more>${T('+ another line')}</button>
			<button class="ghost-btn" data-trip-cancel>${T('Cancel')}</button>
			<button class="act" data-trip-save>${T('Record')}</button>
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
			if (!l.item) return toast(T('A line has a count but no item — choose one'));
			const n = parseAmount(String(l.qty), { signed: true });
			if (n === null || !n) return toast(T('How many {item}?', { item: gameName(l.item) }));
			delta[l.item] = (delta[l.item] || 0) + n;
			used.push(l.item);
		}
		if (!used.length) return toast(T('Nothing to record'));
		store.applyDelta(delta, 'trip', T('Logged a trip: {items}', { items: used.map(gameName).join(', ') }));
		lines = [];
		closeDialog();
		toast(used.length === 1
			? T('Recorded {n} item from the trip', { n: used.length })
			: T('Recorded {n} items from the trip', { n: used.length }), true);
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
