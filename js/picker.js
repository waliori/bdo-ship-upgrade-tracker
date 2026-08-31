// A picker: one list with pictures, a search box and the keyboard, for
// choosing one thing or several.
//
// A native <select> shows a word and nothing else. Most of what this
// app asks you to choose has a face -- an item, a hull, a sailor type --
// and a fact worth seeing beside it: what you hold, what it costs, what
// it does. So every choice goes through here: rows with an icon, a line
// under the name, a figure on the right, grouped when that helps, found
// by typing, ticked when several are wanted.

import { esc } from './fmt.js';
import { openDialog, closeDialog } from './dialogs.js';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.hint]         a line under the title
 * @param {Array}  o.items          { id, label, sub?, icon? (html), meta?, group?, disabled? }
 * @param {string|string[]} [o.selected]
 * @param {boolean} [o.multi]
 * @param {string} [o.empty]        what to say for no match
 * @param {string} [o.apply]        the button label in multi mode
 * @param {function} o.onPick       (id) in single mode, (ids[]) in multi
 */
export function openPicker(o) {
	const multi = o.multi === true;
	const picked = new Set(multi ? (o.selected || []) : (o.selected ? [o.selected] : []));
	const host = openDialog(`
		<div class="picker">
			<h2>${esc(o.title)}</h2>
			${o.hint ? `<p class="dialog-copy">${o.hint}</p>` : ''}
			<input class="field picker-in" type="search" placeholder="Type to find…" aria-label="Find" autocomplete="off">
			<div class="picker-list" data-picker-list role="listbox" aria-multiselectable="${multi}"></div>
			<div class="dialog-actions picker-actions">
				${multi ? `<span class="picker-count" data-picker-count></span><button class="ghost-btn" data-picker-clear>Clear</button>` : ''}
				<button class="ghost-btn" data-close>Cancel</button>
				${multi ? `<button class="act" data-picker-apply>${esc(o.apply || 'Apply')}</button>` : ''}
			</div>
		</div>`);
	const input = host.querySelector('.picker-in');
	const list = host.querySelector('[data-picker-list]');
	let rows = [];
	let on = 0;

	const paint = () => {
		const q = input.value.trim().toLowerCase();
		// Typing ranks: a name that starts with the letters, then a word
		// that does, then anything that has them -- and the groups give
		// way to that order, since the search is now the order.
		const rank = it => {
			const l = it.label.toLowerCase();
			if (l.startsWith(q)) return 0;
			if (l.includes(' ' + q) || l.includes('(' + q) || l.includes('+' + q)) return 1;
			if (l.includes(q)) return 2;
			return `${it.sub || ''} ${it.group || ''}`.toLowerCase().includes(q) ? 3 : -1;
		};
		rows = q
			? o.items.map(it => [it, rank(it)]).filter(([, r]) => r >= 0).sort((a, b) => a[1] - b[1]).map(([it]) => it)
			: o.items;
		on = Math.min(on, Math.max(0, rows.length - 1));
		let html = '';
		let lastGroup = null;
		rows.forEach((it, i) => {
			if (!q && it.group !== lastGroup) {
				lastGroup = it.group;
				if (it.group) html += `<div class="picker-group">${esc(it.group)}</div>`;
			}
			const isOn = picked.has(it.id);
			html += `<button class="picker-row${i === on ? ' on' : ''}${isOn ? ' picked' : ''}${it.disabled ? ' off' : ''}" data-i="${i}" role="option" aria-selected="${isOn}" ${it.disabled ? 'disabled' : ''}>
				${multi ? `<span class="picker-tick">${isOn ? '✓' : ''}</span>` : ''}
				${it.icon ? `<span class="picker-icon">${it.icon}</span>` : ''}
				<span class="picker-main"><span class="picker-label">${esc(it.label)}</span>${it.sub ? `<span class="picker-sub">${esc(it.sub)}</span>` : ''}</span>
				${it.meta ? `<span class="picker-meta">${esc(it.meta)}</span>` : ''}
			</button>`;
		});
		list.innerHTML = html || `<p class="empty">${esc(o.empty || 'Nothing by that name.')}</p>`;
		const count = host.querySelector('[data-picker-count]');
		if (count) count.textContent = picked.size ? `${picked.size} chosen` : '';
		const cur = list.querySelector('.picker-row.on');
		if (cur) cur.scrollIntoView({ block: 'nearest' });
	};
	const choose = i => {
		const it = rows[i];
		if (!it || it.disabled) return;
		if (multi) {
			if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id);
			paint();
			return;
		}
		closeDialog();
		o.onPick(it.id);
	};
	input.addEventListener('input', () => { on = 0; paint(); });
	input.addEventListener('keydown', evt => {
		if (evt.key === 'ArrowDown') { evt.preventDefault(); on = Math.min(rows.length - 1, on + 1); paint(); }
		else if (evt.key === 'ArrowUp') { evt.preventDefault(); on = Math.max(0, on - 1); paint(); }
		else if (evt.key === 'Enter') { evt.preventDefault(); if (multi && evt.ctrlKey) apply(); else choose(on); }
	});
	list.addEventListener('click', evt => {
		const row = evt.target.closest('.picker-row');
		if (row) { on = Number(row.dataset.i); choose(on); input.focus(); }
	});
	const apply = () => { closeDialog(); o.onPick([...picked]); };
	if (multi) {
		host.querySelector('[data-picker-apply]').addEventListener('click', apply);
		host.querySelector('[data-picker-clear]').addEventListener('click', () => { picked.clear(); paint(); });
	}
	input.focus();
	paint();
	return host;
}
