// The fleet: every ship you have kept, and the way through them.
//
// Setups started as chips, then became cards, then rows grouped by hull
// -- and each of those was fine at three and wrong at thirty. A list
// that lives on the screen has to be drawn every time the screen is,
// however long it is, and it pushes everything below it further away
// the more ships you keep. Eleven already filled a viewport.
//
// So the screen keeps one line -- the ship being sailed, which is the
// only one that changes what the Map does -- and the rest live behind a
// door: searched by name or hull, narrowed to one hull, sorted by what
// you actually choose on, and paged so that a hundred setups cost the
// same to draw as ten.

import { esc, F } from './fmt.js';
import { img } from './ui-bits.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import {
	listSetups, setupSummary, loadSetup, deleteSetup, activeSetupId
} from './ship.js';

const PAGE = 8;

// What the dialog is showing, kept across repaints of itself so that
// deleting a row does not throw away the search that found it.
let query = '';
let hull = '';
let sort = 'name';
let page = 0;

const SORTS = [
	['name', 'Name'],
	['speed', 'Fastest'],
	['hold', 'Biggest hold'],
	['fitted', 'Most fitted']
];

/** Every setup with its figures worked out, and its hull. */
function fleet() {
	return listSetups().map(s => ({ ...s, sum: setupSummary(s) }));
}

/** The rows that match the search and the hull filter, in order. */
function shown(all, active) {
	const q = query.trim().toLowerCase();
	const words = q.split(/\s+/).filter(Boolean);
	let rows = all.filter(s => {
		if (hull && s.ship !== hull) return false;
		if (!words.length) return true;
		const hay = `${s.name} ${s.ship}`.toLowerCase();
		return words.every(w => hay.includes(w));
	});
	const by = {
		name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
		speed: (a, b) => (b.sum ? b.sum.speed : -1) - (a.sum ? a.sum.speed : -1),
		hold: (a, b) => (b.sum ? b.sum.hold : -1) - (a.sum ? a.sum.hold : -1),
		fitted: (a, b) => (b.sum ? b.sum.fittedCount : -1) - (a.sum ? a.sum.fittedCount : -1)
	};
	rows.sort(by[sort] || by.name);
	// Whatever is being sailed stands at the top of whatever is shown --
	// it is the one row whose state the rest are measured against.
	rows = [...rows.filter(s => s.id === active), ...rows.filter(s => s.id !== active)];
	return rows;
}

/** "+5%" against the ship being sailed, where that means anything. */
function diff(sum, here, key, unit) {
	if (!here || !sum) return '';
	const d = Math.round((sum[key] - here[key]) * 10) / 10;
	if (!d) return '';
	return `<span class="setup-diff ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${F(d)}${unit}</span>`;
}

function rowHTML(s, active, here) {
	if (!s.sum) {
		return `<div class="fleet-row gone" data-id="${esc(s.id)}">
			<span class="fleet-name">${esc(s.name)}</span>
			<span class="fleet-figs">${esc(s.ship)} is no longer a hull here</span>
			<button class="map-x" data-act="fleet-del" data-id="${esc(s.id)}" aria-label="Forget ${esc(s.name)}">×</button></div>`;
	}
	const on = s.id === active;
	// The whole line is the way aboard: a full-row button underneath,
	// the way a roster tile takes its tap, with only the × standing
	// clear of it. The row being sailed offers no way to sail it again.
	return `<div class="fleet-row${on ? ' on' : ' can'}" data-id="${esc(s.id)}">
		${on ? '' : `<button class="fleet-hit" data-act="fleet-sail" data-id="${esc(s.id)}" title="Sail ${esc(s.name)} — the Map times its routes at this ship" aria-label="Sail ${esc(s.name)}"></button>`}
		${img(s.ship, 'fleet-icon')}
		<span class="fleet-name">${on ? '<span class="setup-flag">⚓</span>' : ''}${esc(s.name)}
			<small>${esc(s.ship)}</small></span>
		<span class="fleet-figs">
			<span class="setup-fig">speed <b>${s.sum.speed}%</b>${on ? '' : diff(s.sum, here, 'speed', '%')}</span>
			<span class="setup-fig">hold <b>${F(s.sum.hold)} LT</b>${on ? '' : diff(s.sum, here, 'hold', ' LT')}</span>
			<span class="setup-fig">fitted <b>${s.sum.fittedCount}/${s.sum.slots}</b></span>
			${s.sum.seated ? `<span class="setup-fig">crew <b>${s.sum.seated}</b></span>` : ''}
			${s.sum.skinned ? `<span class="setup-fig">skin <b>${s.sum.skinned}/4</b></span>` : ''}
		</span>
		<span class="fleet-acts">
			${on ? '<span class="setup-sailing">sailing</span>' : '<span class="fleet-go" aria-hidden="true">sail ⛵</span>'}
			<button class="map-x" data-act="fleet-del" data-id="${esc(s.id)}" aria-label="Forget the setup ${esc(s.name)}">×</button>
		</span>
	</div>`;
}

/**
 * The fleet, opened.
 *
 * Repaints itself in place rather than reopening: typing in the search
 * must not close and reopen a dialog under the caret.
 */
export function openFleet() {
	page = 0;
	const host = openDialog('<div class="fleet"></div>');
	// The fleet needs more width than a dialog's 560px: five columns of
	// figures that have to line up, plus a Sail button on the end. Asking
	// for it here rather than widening every dialog in the app.
	const box = host.querySelector('.dialog-box');
	if (box) box.classList.add('wide');
	paint(host);
	const input = host.querySelector('.fleet-search');
	if (input) input.focus();
	return host;
}

function paint(host) {
	const all = fleet();
	const active = activeSetupId();
	const here = (all.find(s => s.id === active) || {}).sum || null;
	const rows = shown(all, active);
	const pages = Math.max(1, Math.ceil(rows.length / PAGE));
	if (page >= pages) page = pages - 1;
	const slice = rows.slice(page * PAGE, page * PAGE + PAGE);

	// One chip per hull actually kept, with its count -- the fastest way
	// to "just the Panokseons" when there are thirty of them.
	const hulls = [...new Map(all.map(s => [s.ship, 0])).keys()]
		.map(h => [h, all.filter(s => s.ship === h).length])
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

	const box = host.querySelector('.fleet');
	box.innerHTML = `
		<h2>Your fleet</h2>
		<p class="dialog-copy">${all.length === 1 ? 'One ship kept' : `${all.length} ships kept`}. The one being sailed is what the Map times its routes at, and what the others are measured against.</p>
		<input class="field fleet-search" type="search" placeholder="Search by name or hull…" aria-label="Search the fleet" value="${esc(query)}" autocomplete="off">
		<div class="fleet-filters">
			<button class="chip${hull ? '' : ' active'}" data-act="fleet-hull" data-hull="">All ${all.length}</button>
			${hulls.map(([h, n]) => `<button class="chip${hull === h ? ' active' : ''}" data-act="fleet-hull" data-hull="${esc(h)}">${esc(h)} ${n}</button>`).join('')}
			<span class="fleet-sort">
				<label for="fleet-sort-sel">Sort</label>
				<select class="field select inline" id="fleet-sort-sel" data-act="fleet-sort">
					${SORTS.map(([k, l]) => `<option value="${k}"${sort === k ? ' selected' : ''}>${l}</option>`).join('')}
				</select>
			</span>
		</div>
		<div class="fleet-list">${slice.length
			? slice.map(s => rowHTML(s, active, here)).join('')
			: '<p class="empty">No ship by that name.</p>'}</div>
		${pages > 1 ? `<div class="fleet-pager">
			<button class="ghost-btn" data-act="fleet-page" data-to="${page - 1}"${page === 0 ? ' disabled' : ''}>← Back</button>
			<span>${page * PAGE + 1}–${Math.min(rows.length, (page + 1) * PAGE)} of ${rows.length}</span>
			<button class="ghost-btn" data-act="fleet-page" data-to="${page + 1}"${page >= pages - 1 ? ' disabled' : ''}>Next →</button>
		</div>` : ''}
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`;

	const input = box.querySelector('.fleet-search');
	input.addEventListener('input', () => {
		query = input.value;
		page = 0;
		const at = input.selectionStart;
		paint(host);
		const next = host.querySelector('.fleet-search');
		next.focus();
		next.setSelectionRange(at, at);
	});
	box.querySelector('[data-act="fleet-sort"]').addEventListener('change', evt => {
		sort = evt.target.value;
		page = 0;
		paint(host);
	});
	box.addEventListener('click', evt => {
		const el = evt.target.closest('[data-act]');
		if (!el) return;
		const act = el.dataset.act;
		if (act === 'fleet-hull') { hull = el.dataset.hull; page = 0; return paint(host); }
		if (act === 'fleet-page') { page = Number(el.dataset.to); return paint(host); }
		if (act === 'fleet-del') { deleteSetup(el.dataset.id); return paint(host); }
		if (act === 'fleet-sail') {
			const s = listSetups().find(x => x.id === el.dataset.id);
			if (loadSetup(el.dataset.id)) {
				closeDialog();
				toast(`Sailing ${s ? s.name : 'it'}`);
			}
		}
	});
}
