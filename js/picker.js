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
import { T } from './i18n.js';
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
 * @param {function} [o.onClose]    called when the picker closes, picked or not
 * @param {Array}   [o.chips]       { id, label, on? } — a row of toggles above the list
 * @param {function} [o.onChips]    (id) → { items?, chips? } to reorder or narrow the list
 */
export function openPicker(o) {
	const multi = o.multi === true;
	const picked = new Set(multi ? (o.selected || []) : (o.selected ? [o.selected] : []));
	const host = openDialog(`
		<div class="picker picker-dialog">
			<h2>${esc(o.title)}</h2>
			${o.hint ? `<p class="dialog-copy">${o.hint}</p>` : ''}
			<input class="field picker-in" type="search" placeholder="${T('Type to find…')}" aria-label="${T('Find')}" autocomplete="off">
			${o.chips ? '<div class="picker-chips" data-picker-chips></div>' : ''}
			<div class="picker-list" data-picker-list role="listbox" aria-multiselectable="${multi}"></div>
			<div class="dialog-actions picker-actions">
				${multi ? `<span class="picker-count" data-picker-count></span><button class="ghost-btn" data-picker-clear>${T('Clear')}</button>` : ''}
				<button class="ghost-btn" data-close>${T('Cancel')}</button>
				${multi ? `<button class="act" data-picker-apply>${esc(o.apply || T('Apply'))}</button>` : ''}
			</div>
		</div>`, { onDismiss: () => { if (typeof o.onClose === 'function') o.onClose(); } });
	const input = host.querySelector('.picker-in');
	const list = host.querySelector('[data-picker-list]');
	const chipRow = host.querySelector('[data-picker-chips]');
	const paintChips = () => {
		if (!chipRow) return;
		chipRow.innerHTML = (o.chips || []).map(c =>
			`<button class="chip${c.on ? ' on' : ''}" data-picker-chip="${esc(c.id)}" aria-pressed="${c.on === true}">${esc(c.label)}</button>`).join('');
	};
	if (chipRow) chipRow.addEventListener('click', evt => {
		const chip = evt.target.closest('[data-picker-chip]');
		if (!chip || typeof o.onChips !== 'function') return;
		const next = o.onChips(chip.dataset.pickerChip) || {};
		if (next.items) o.items = next.items;
		if (next.chips) o.chips = next.chips;
		paintChips();
		paint();
	});
	let rows = [];
	let on = 0;

	const paint = () => {
		const q = input.value.trim().toLowerCase();
		// Typing ranks: a name that starts with the letters, then a word
		// that does, then anything that has them -- and the groups give
		// way to that order, since the search is now the order.
		// Every word typed must be somewhere in the row -- "rusalka
		// speed" finds the Rusalka crystal that lifts speed -- and the
		// rows whose name starts with the first word come first.
		const words = q.split(/\s+/).filter(Boolean);
		const rank = it => {
			const l = it.label.toLowerCase();
			const hay = `${l} ${(it.sub || '').toLowerCase()} ${(it.group || '').toLowerCase()}`;
			if (!words.every(w => hay.includes(w))) return -1;
			if (l.startsWith(q)) return 0;
			if (l.startsWith(words[0])) return 1;
			if (l.includes(' ' + words[0]) || l.includes('(' + words[0]) || l.includes('+' + words[0])) return 2;
			return l.includes(words[0]) ? 3 : 4;
		};
		// `boost` breaks a tie between two equally good matches: the trip
		// log uses it so the thing a build is waiting on stays above the
		// thing that merely shares a word with it. Without it the order
		// inside a rank is whatever the caller's array happened to be,
		// which is the right answer only before anything is typed.
		rows = q
			? o.items.map(it => [it, rank(it)]).filter(([, r]) => r >= 0)
				.sort((a, b) => a[1] - b[1] || (b[0].boost || 0) - (a[0].boost || 0))
				.map(([it]) => it)
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
		list.innerHTML = html || `<p class="empty">${esc(o.empty || T('Nothing by that name.'))}</p>`;
		const count = host.querySelector('[data-picker-count]');
		if (count) count.textContent = picked.size ? T('{n} chosen', { n: picked.size }) : '';
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
	paintChips();
	paint();
	return host;
}
