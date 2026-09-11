// The pouch, on every tab. Spent from wherever you happen to be, so it
// sits in the shell above the tabs instead of belonging to one screen.

import { esc, F, FC } from './fmt.js';
import * as store from './state.js';
import { img } from './ui-bits.js';
import { rows, totalsToGo, CROW_COIN, SILVER, SANGPYEONG, STONES } from './ui-state.js';
import { profileHTML } from './profile-bar.js';

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
				<input class="pouch-input" type="text" inputmode="numeric" value="${FC(held)}"
					data-act="purse" data-item="${esc(e.item)}" data-exact="${held}" title="${F(held)}"
					aria-label="${esc(e.label)} you hold">
				<span class="pouch-need">${esc(sub)}</span>
			</span>
		</label>`;
	}).join('');

	// One strip, two groups: what is in the bags, and what is true of
	// the sailor carrying them. They are in the same row rather than
	// stacked because the row already scrolls on a phone -- a second
	// bar would cost another line of the screen on every tab -- and
	// because both are the same kind of thing: a number you keep
	// correct once and every screen then reads.
	return `<span class="pouch-title">Carrying</span><div class="pouch-list">${chips}${profileHTML()}</div>`;
}

/**
 * Repaint the pouch -- but never while someone is typing in it. A state
 * change re-renders everything, and swapping the inputs out mid-edit would
 * steal the caret; the blur handler in wire() paints the pending update.
 */
export function paintPouch({ force = false } = {}) {
	const host = document.getElementById('pouch');
	if (!host) return;
	// `force` is for the one change that comes from inside the bar and
	// means to redraw it: folding the sailing numbers open or shut. The
	// press leaves the focus on the button, which would otherwise look
	// exactly like someone typing in a purse.
	if (!force && host.contains(document.activeElement)) return;
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

