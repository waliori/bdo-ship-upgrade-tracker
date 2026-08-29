// The pouch, on every tab. Spent from wherever you happen to be, so it
// sits in the shell above the tabs instead of belonging to one screen.

import { esc, F, FC } from './fmt.js';
import * as store from './state.js';
import { img } from './ui-bits.js';
import { rows, totalsToGo, CROW_COIN, SILVER, SANGPYEONG, STONES } from './ui-state.js';

/**
 * The pouch: coins, silver, Sangpyeong Coins and enhancement stones, on
 * every tab.
 *
 * These are spent from wherever you happen to be -- buying on To Get,
 * enhancing in the Workshop -- so they sit in the shell above the tabs
 * instead of belonging to one screen. Everything past the two headline
 * currencies only appears once a build needs it or you hold some, so the
 * bar stays short.
 */
export function pouchHTML() {
	const totals = totalsToGo();

	const entries = [
		{ item: CROW_COIN, label: 'Crow Coins', need: totals.coins, where: "Crow Coin Shop, Oquilla's Eye" },
		{ item: SILVER, label: 'Silver', need: totals.silver, where: 'Falasi, port of Epheria', glyph: '\u25C9' }
	];

	// Coins and stones are earned or dropped, not priced, so they join the
	// bar only once a build wants them or you are holding some -- that way
	// a Carrack plan never carries a Panokseon currency it has no use for.
	const carried = (item, label, where) => {
		const need = rows[item] ? rows[item].need : 0;
		return { item, label, need, where };
	};

	const optional = [carried(SANGPYEONG, 'Sangpyeong Coins', 'Moodle Village dailies')];
	STONES.forEach(item => optional.push(carried(item, item, 'spent on enhancement attempts')));

	optional
		.filter(e => e.need > 0 || store.getStock(e.item) > 0)
		.sort((a, b) => b.need - a.need || a.label.localeCompare(b.label))
		.forEach(e => entries.push(e));

	const chips = entries.map(e => {
		const held = store.getStock(e.item);
		const short = Math.max(0, e.need - held);
		const state = !e.need ? 'idle' : short ? 'short' : 'ok';
		const sub = !e.need
			? 'none needed yet'
			: short
				? `${FC(short)} short of ${FC(e.need)}`
				: `enough for all ${FC(e.need)}`;
		return `<label class="pouch-item ${state}" title="${esc(e.item)} \u2014 ${esc(e.where)}">
			${e.glyph ? `<span class="pouch-glyph" aria-hidden="true">${e.glyph}</span>` : img(e.item, 'pouch-icon')}
			<span class="pouch-body">
				<span class="pouch-k">${esc(e.label)}</span>
				<input class="pouch-input" type="text" inputmode="numeric" value="${F(held)}"
					data-act="purse" data-item="${esc(e.item)}" aria-label="${esc(e.label)} you hold">
				<span class="pouch-need">${esc(sub)}</span>
			</span>
		</label>`;
	}).join('');

	return `<span class="pouch-title">Carrying</span><div class="pouch-list">${chips}</div>`;
}

/**
 * Repaint the pouch -- but never while someone is typing in it. A state
 * change re-renders everything, and swapping the inputs out mid-edit would
 * steal the caret; the blur handler in wire() paints the pending update.
 */
export function paintPouch() {
	const host = document.getElementById('pouch');
	if (!host) return;
	if (host.contains(document.activeElement)) return;
	host.innerHTML = pouchHTML();
	measurePouch();
}

/**
 * Publish the pouch's height so anything else that sticks (the inventory
 * detail panel) can clear it instead of sliding underneath.
 */
export function measurePouch() {
	const host = document.getElementById('pouch');
	if (!host) return;
	const h = getComputedStyle(host).position === 'sticky' ? host.offsetHeight : 0;
	document.documentElement.style.setProperty('--pouch-h', `${h}px`);
}

