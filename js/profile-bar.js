// Who is sailing, on every tab.
//
// Five numbers about the player -- how many barters they have made,
// what barter level they hold, the Parley in the bar, the vouchers in
// the bag, whether a Value Pack is up -- decide what half the app says.
// The barter count alone decides which islands exist for them, which
// chains are sailable and which materials can be got at all.
//
// They used to be typed into a tile on To Get, which is the one screen
// that is not about the sea. So they sit beside the pouch instead, in
// the shell above the tabs: entered once, in view from every screen,
// and read by the Barter tab, the Map, To Get and the forecast alike.
// Nothing here is per-screen state -- every chip writes to the profile
// through the same data-act the rest of the app already answers.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { barterProfile } from './ui-state.js';
import { dailyCapacity, barterLevels, levelDiscount, ROUTE_UNLOCKS } from './barter.js';
import { mateAtTheHelm } from './ship.js';
import { anyType } from './sailors.js';

/**
 * The ten per cent a first mate takes off every Parley cost: whether it
 * is already being had, and if not, who aboard could be seated for it.
 * A discount nobody knows about is a discount nobody takes.
 */
function mateCut() {
	const mate = mateAtTheHelm();
	if (mate && Number(mate.type.parley) > 0) return `−10% crew · ${esc(mate.sailor.name)} at the helm`;
	const ashore = (store.getProfile('roster', []) || []).find(s => Number((anyType[s.type] || {}).parley) > 0);
	return ashore ? `seat ${esc(ashore.name)} as First Mate for −10%` : '';
}

/**
 * Whether the numbers stand open for typing, or folded into the line
 * that reports them.
 *
 * Folded is the default, and the reason is the strip itself: it sticks
 * to the top of every screen, and five more fields down there cost a
 * second row of the window on every tab for something that is typed
 * once a week. Folded, everything is still *said* -- the count, the
 * level, the day's draws, the next island it opens -- and one press
 * puts the fields under it. The choice is remembered.
 */
const open = () => store.getSetting('sailBarOpen', false) === true;
export const toggleSailBar = () => store.setSetting('sailBarOpen', !open(), true);

/** Folded: everything the five chips say, in one chip, with the fields
 *  one press away. */
function summaryHTML(p) {
	const day = dailyCapacity(p);
	const next = nextUnlock(p.barterCount);
	const said = [
		`${F(p.barterCount)} barters`,
		p.level || 'no level',
		`${F(day.lists.trade)}+${F(day.lists.material)} draws`
	].join(' · ');
	return `<button class="pouch-item sail summary" data-act="sail-bar" aria-expanded="false"
		title="Your barter count, level, Parley, vouchers and Value Pack — everything the sea is planned from. Press to set them.">
		<span class="pouch-glyph" aria-hidden="true">⇄</span>
		<span class="pouch-body">
			<span class="pouch-k">Sailing</span>
			<span class="pouch-input plain">${esc(said)}</span>
			<span class="pouch-need">${next ? esc(next) : 'every route open'} · refill in <b data-until="barter"></b></span>
		</span>
		<span class="pouch-fold" aria-hidden="true">✎</span>
	</button>`;
}

/** The next thing the barter count opens, phrased as the wait for it. */
export function nextUnlock(count) {
	const next = ROUTE_UNLOCKS.filter(r => r.opens && r.barters > count)[0];
	if (!next) return null;
	// "120 more open Lantinia's Combat Raft": the count unlocks islands
	// at fixed thresholds, and this is the next door.
	return `${F(next.barters - count)} more open ${next.opens.replace(/^[^—]*—\s*/, '')}`;
}

/**
 * The sailor's own numbers, as chips in the shell's bar.
 *
 * Built to the pouch's own shape -- glyph, label, value, a line of
 * consequence under it -- because they are read the same way and sit in
 * the same strip. The consequence is the point of each one: a barter
 * count is meaningless until it is told what it opens next, and a
 * barter level until it is told what an exchange now costs.
 */
export function profileHTML() {
	const p = barterProfile();
	// Folded, the chip names itself; open, the group is titled once and
	// the five chips run on from it.
	if (!open()) return summaryHTML(p);
	const title = '<span class="pouch-group" aria-hidden="true">Sailing</span>';
	const day = dailyCapacity(p);
	const next = nextUnlock(p.barterCount);
	// What is already coming off, or -- when the crew's ten per cent is
	// not -- who to seat for it.
	const cut = [
		`−${(levelDiscount(p.level) * 100).toFixed(1)}% level`,
		p.valuePack ? '−10% pack' : '',
		mateCut()
	].filter(Boolean).join(' · ');

	const chip = (cls, glyph, label, field, sub, title) => `<label class="pouch-item sail ${cls}" title="${esc(title)}">
		<span class="pouch-glyph" aria-hidden="true">${glyph}</span>
		<span class="pouch-body">
			<span class="pouch-k">${esc(label)}</span>
			${field}
			<span class="pouch-need">${sub}</span>
		</span>
	</label>`;

	const num = (act, value, aria) => `<input class="pouch-input" type="text" inputmode="numeric"
		value="${F(value)}" data-act="${act}" aria-label="${esc(aria)}">`;

	const levels = barterLevels().map(name =>
		`<option${name === p.level ? ' selected' : ''}>${esc(name)}</option>`).join('');

	const shut = `<button class="pouch-item sail fold-shut" data-act="sail-bar" aria-expanded="true" title="Fold these back into one line">
		<span class="pouch-fold" aria-hidden="true">▴</span>
	</button>`;

	return [
		title,
		chip('barters', '⇄', 'Total barters', num('barter-count', p.barterCount, 'Your Total Barters'),
			next ? esc(next) : 'every route open',
			'Your Total Barters, as the Barter Information window shows it. It decides which islands you can barter at — a run is never planned through one you have not opened. A trip recorded on the Barter tab adds its trades; type over it whenever the two drift.'),
		chip('level', '✲', 'Barter level',
			`<select class="pouch-input select" data-act="barter-level" aria-label="Your barter level"><option value=""${p.level ? '' : ' selected'}>—</option>${levels}</select>`,
			`${F(day.perTrade)} a trade${cut ? ` · ${cut}` : ''}`,
			'Your barter level, as the Barter window shows it: every level takes a share off what an exchange costs in Parley'),
		chip('parley', '◈', 'Parley', num('parley-held', p.parleyHeld, 'Parley in the bar right now'),
			`${F(day.tradesPerBar)} trades a refill`,
			'The Parley in your bar right now, so a run can say whether you can afford it'),
		chip('vouchers', '✦', 'Vouchers', num('vouchers', p.vouchers, "Crow's Trade Vouchers you carry"),
			'Crow’s Trade Vouchers',
			"Crow's Trade Vouchers in the bag: each one is another 250,000 Parley"),
		chip('draws', '◴', 'Draws a day',
			`<span class="pouch-input plain">${F(day.lists.trade)}+${F(day.lists.material)}</span>`,
			`refill in <b data-until="barter"></b> · <label class="inline-check"><input type="checkbox" data-act="value-pack"${p.valuePack ? ' checked' : ''}> Value Pack</label>`,
			`${F(day.lists.trade)} draws of the trade-goods list and ${F(day.lists.material)} of the ship-materials list a day — the two refresh on their own clocks. A Value Pack adds a trade-list draw and takes 10% off every Parley cost.`),
		shut
	].join('');
}
