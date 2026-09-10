// The fleet: every ship you own or have kept, and the way through them.
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
import { T, TT, said, gameName } from './i18n.js';
import { img } from './ui-bits.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import * as store from './state.js';
import {
	listFleet, listSetups, setupSummary, loadSetup, deleteSetup, activeSetupId, hullOfRow, shipName, OWNED_PREFIX
} from './ship.js';

const PAGE = 8;

// What the dialog is showing, kept across repaints of itself so that
// deleting a row does not throw away the search that found it.
let query = '';
let hull = '';
let sort = 'name';
let page = 0;

const SORTS = [
	['name', TT('Name')],
	['speed', TT('Fastest')],
	['hold', TT('Biggest hold')],
	['fitted', TT('Most fitted')]
];

/**
 * Every ship in the fleet with its figures worked out: the saved setups
 * first, then the hulls the inventory says are owned that no setup
 * covers. An owned hull is a real ship -- it can be sailed, and it
 * counts on the boards -- it simply has no parts named for it yet.
 */
function fleet() {
	return listFleet().map(s => ({ ...s, sum: setupSummary(s) }));
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
			<span class="fleet-name">${esc(gameName(s.name))}</span>
			<span class="fleet-figs">${T('{ship} is no longer a hull here', { ship: esc(gameName(s.ship)) })}</span>
			<button class="map-x" data-act="fleet-del" data-id="${esc(s.id)}" aria-label="${T('Forget {name}', { name: esc(gameName(s.name)) })}">×</button></div>`;
	}
	const on = s.id === active;
	// An owned hull is not a setup: it is named for its hull, it has no
	// name of its own to forget, and the × takes it out of the hold
	// rather than out of a list.
	const drop = s.owned
		? T('Take the {ship} out of the inventory', { ship: gameName(s.ship) })
		: T('Forget the setup {name}', { name: gameName(s.name) });
	// The whole line is the way aboard: a full-row button underneath,
	// the way a roster tile takes its tap, with only the × standing
	// clear of it. The row being sailed offers no way to sail it again.
	return `<div class="fleet-row${on ? ' on' : ' can'}${s.owned ? ' bare' : ''}" data-id="${esc(s.id)}">
		${on ? '' : `<button class="fleet-hit" data-act="fleet-sail" data-id="${esc(s.id)}" title="${T('Sail {name} — the Map times its routes at this ship', { name: esc(gameName(s.name)) })}" aria-label="${T('Sail {name}', { name: esc(gameName(s.name)) })}"></button>`}
		${img(s.ship, 'fleet-icon')}
		<span class="fleet-name">${on ? '<span class="setup-flag">⚓</span>' : ''}${esc(gameName(s.name))}
			<small>${s.owned ? T('in your inventory · no setup kept') : esc(gameName(s.ship))}</small></span>
		<span class="fleet-figs">
			<span class="setup-fig">${T('speed')} <b>${s.sum.speed}%</b>${on ? '' : diff(s.sum, here, 'speed', '%')}</span>
			<span class="setup-fig">${T('hold')} <b>${F(s.sum.hold)} LT</b>${on ? '' : diff(s.sum, here, 'hold', ' LT')}</span>
			<span class="setup-fig">${T('fitted')} <b>${s.sum.fittedCount}/${s.sum.slots}</b></span>
			${s.sum.seated ? `<span class="setup-fig">${T('crew')} <b>${s.sum.seated}</b></span>` : ''}
			${s.sum.skinned ? `<span class="setup-fig">${T('skin')} <b>${s.sum.skinned}/4</b></span>` : ''}
		</span>
		<span class="fleet-acts">
			${on ? `<span class="setup-sailing">${T('sailing')}</span>` : `<span class="fleet-go" aria-hidden="true">${T('sail ⛵')}</span>`}
			<button class="map-x" data-act="fleet-del" data-id="${esc(s.id)}" aria-label="${esc(drop)}">×</button>
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
	// What is sailed: the setup that matches it exactly, or -- when none
	// does -- the owned hull it is, so an unfitted ship still shows as
	// the one under way.
	const active = activeSetupId() || `${OWNED_PREFIX}${shipName()}`;
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
		<h2>${T('Your fleet')}</h2>
		<p class="dialog-copy">${T('{ships} — the setups you have kept, and the hulls in your inventory that no setup covers. The one being sailed is what the Map times its routes at, and what the others are measured against.', { ships: all.length === 1 ? T('One ship') : T('{n} ships', { n: all.length }) })}</p>
		<input class="field fleet-search" type="search" placeholder="${T('Search by name or hull…')}" aria-label="${T('Search the fleet')}" value="${esc(query)}" autocomplete="off">
		<div class="fleet-filters">
			<button class="chip${hull ? '' : ' active'}" data-act="fleet-hull" data-hull="">${T('All {n}', { n: all.length })}</button>
			${hulls.map(([h, n]) => `<button class="chip${hull === h ? ' active' : ''}" data-act="fleet-hull" data-hull="${esc(h)}">${esc(gameName(h))} ${n}</button>`).join('')}
			<span class="fleet-sort">
				<label for="fleet-sort-sel">${T('Sort')}</label>
				<select class="field select inline" id="fleet-sort-sel" data-act="fleet-sort">
					${SORTS.map(([k, l]) => `<option value="${k}"${sort === k ? ' selected' : ''}>${said(l)}</option>`).join('')}
				</select>
			</span>
		</div>
		<div class="fleet-list">${slice.length
			? slice.map(s => rowHTML(s, active, here)).join('')
			: `<p class="empty">${T('No ship by that name.')}</p>`}</div>
		${pages > 1 ? `<div class="fleet-pager">
			<button class="ghost-btn" data-act="fleet-page" data-to="${page - 1}"${page === 0 ? ' disabled' : ''}>${T('← Back')}</button>
			<span>${T('{from}–{to} of {total}', { from: page * PAGE + 1, to: Math.min(rows.length, (page + 1) * PAGE), total: rows.length })}</span>
			<button class="ghost-btn" data-act="fleet-page" data-to="${page + 1}"${page >= pages - 1 ? ' disabled' : ''}>${T('Next →')}</button>
		</div>` : ''}
		<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>`;

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
		if (act === 'fleet-del') {
			const bare = hullOfRow(el.dataset.id);
			// Out of the hold, which is where an owned hull lives; the
			// change is one step, so the toast's Undo puts the ship back.
			if (bare) store.setStock(bare, 0, T('Took the {ship} out of the inventory', { ship: gameName(bare) }));
			else deleteSetup(el.dataset.id);
			return paint(host);
		}
		if (act === 'fleet-sail') {
			const bare = hullOfRow(el.dataset.id);
			if (bare) {
				store.setProfile('crewShip', bare, T('Sailing the {ship}', { ship: gameName(bare) }));
				closeDialog();
				return toast(T('Sailing the {ship}', { ship: gameName(bare) }));
			}
			const s = listSetups().find(x => x.id === el.dataset.id);
			if (loadSetup(el.dataset.id)) {
				closeDialog();
				toast(s ? T('Sailing {name}', { name: gameName(s.name) }) : T('Sailing it'));
			}
		}
	});
}
