// Find anything: one box that reaches every item and every tab.
//
// Each screen has its own search, and each one is cleared when you
// leave it -- right for a filter, wrong for "where is Sunset Coral in
// this app". Ctrl+K (or / on its own) opens this; type, arrow, Enter.
// An item opens in the Inventory's detail panel, which is where its
// count, its reservations and every way to get it already live.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { img, allItems } from './ui-bits.js';
import { openDialog, closeDialog } from './dialogs.js';

/** The names that match, best first: a name that starts with the
 *  query, then one with a word that does, then one that contains it. */
export function matchItems(q, names, limit = 12) {
	const s = String(q || '').trim().toLowerCase();
	if (!s) return [];
	const rank = name => {
		const n = name.toLowerCase();
		if (n.startsWith(s)) return 0;
		if (n.includes(' ' + s) || n.includes('[' + s) || n.includes('+' + s)) return 1;
		return n.includes(s) ? 2 : -1;
	};
	return names.map(name => [name, rank(name)])
		.filter(([, r]) => r >= 0)
		.sort((a, b) => a[1] - b[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
		.slice(0, limit)
		.map(([name]) => name);
}

let items = null;

export function openJump({ tabs, go }) {
	if (!items) items = allItems().sort((a, b) => a.localeCompare(b));
	const host = openDialog(`
		<div class="jump">
			<input class="field jump-in" type="search" placeholder="Find an item or a tab… (Ctrl+K)" aria-label="Find" autocomplete="off">
			<div class="jump-list" data-jump-list></div>
			<div class="jump-hint">↑ ↓ to move · Enter to open · 1–9 switch tabs anywhere</div>
		</div>`);
	const input = host.querySelector('.jump-in');
	const list = host.querySelector('[data-jump-list]');
	let rows = [];
	let on = 0;

	const paint = () => {
		const q = input.value.trim();
		const ql = q.toLowerCase();
		const tabHits = q ? tabs.filter(t => t.label.toLowerCase().includes(ql)).map(t => ({ kind: 'tab', value: t.id, label: t.label })) : [];
		const itemHits = matchItems(q, items).map(name => ({ kind: 'item', value: name, label: name }));
		rows = [...tabHits, ...itemHits];
		on = Math.min(on, Math.max(0, rows.length - 1));
		list.innerHTML = rows.length ? rows.map((r, i) => `<button class="jump-row${i === on ? ' on' : ''}" data-i="${i}">
			${r.kind === 'item' ? img(r.value, 'row-icon sm') : '<span class="jump-tab">tab</span>'}
			<span class="jump-name">${esc(r.label)}</span>
			${r.kind === 'item' && store.getStock(r.value) ? `<span class="jump-own">${F(store.getStock(r.value))} owned</span>` : ''}
		</button>`).join('') : (q ? '<p class="empty">Nothing by that name.</p>' : '');
	};
	const pick = i => {
		const r = rows[i];
		if (!r) return;
		closeDialog();
		go(r.kind, r.value);
	};
	input.addEventListener('input', () => { on = 0; paint(); });
	input.addEventListener('keydown', evt => {
		if (evt.key === 'ArrowDown') { evt.preventDefault(); on = Math.min(rows.length - 1, on + 1); paint(); }
		else if (evt.key === 'ArrowUp') { evt.preventDefault(); on = Math.max(0, on - 1); paint(); }
		else if (evt.key === 'Enter') { evt.preventDefault(); pick(on); }
	});
	list.addEventListener('click', evt => {
		const row = evt.target.closest('.jump-row');
		if (row) pick(Number(row.dataset.i));
	});
	input.focus();
	paint();
}
