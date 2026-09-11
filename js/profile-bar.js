// The sailor's own numbers, on every tab.
//
// Seven things about the player decide what half the app says: how many
// barters they have made, what barter level they hold, the Parley in
// the bar, the vouchers in the bag, whether a Value Pack is up, how
// many draws that buys a day, and their Sailing Mastery. The barter
// count alone decides which islands exist for them, which chains are
// sailable, and which materials can be got at all.
//
// They used to be typed into a tile on To Get and a field on the Ship
// tab -- read everywhere, corrected in two places neither of which is
// where the answer is read. So they sit beside the pouch instead, in
// the shell above the tabs: entered once, in view from every screen.
// Nothing here is per-screen state; every chip writes to the profile
// through the same data-act the rest of the app already answers.
//
// Folded is the default, and the reason is the strip itself: it sticks
// to the top of every screen, and seven fields down there would cost a
// second row of the window on every tab for something typed once a
// week. Folded, the numbers are still said -- the count, the level,
// the day's draws, the next island it opens -- and one press puts the
// fields under them.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { img } from './ui-bits.js';
import { barterProfile } from './ui-state.js';
import { dailyCapacity, barterLevels, levelDiscount, npcGates, ROUTE_UNLOCKS } from './barter.js';
import { npcById } from './barter_npcs.js';
import { mateAtTheHelm, masteryBonus } from './ship.js';
import { anyType } from './sailors.js';

/** Open for typing, or folded into the line that reports it. Kept. */
const open = () => store.getSetting('sailBarOpen', false) === true;
export const toggleSailBar = () => store.setSetting('sailBarOpen', !open(), true);

/**
 * The next thing the barter count opens, phrased as the wait for it.
 *
 * Named by the place, which is the half of the patch note's wording
 * that means anything to a sailor: "Derko Island", not "Crow Coin".
 * Where a threshold opens a barterer, the chart says where they stand;
 * where it opens something else -- the Brilliant pair -- the row's own
 * words are the answer.
 */
export function nextUnlock(count) {
	const next = ROUTE_UNLOCKS.filter(r => r.opens && r.barters > count)[0];
	if (!next) return null;
	const id = [...npcGates()].find(([, barters]) => barters === next.barters);
	const npc = id ? npcById.get(id[0]) : null;
	return `${F(next.barters - count)} more open ${npc ? npc.at : next.opens}`;
}

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

/** Folded: everything the chips say, in one chip, with the fields one
 *  press away. */
function summaryHTML(p) {
	const day = dailyCapacity(p);
	const next = nextUnlock(p.barterCount);
	const said = [
		`${F(p.barterCount)} barters`,
		p.level || 'no level',
		`${F(day.lists.trade)}+${F(day.lists.material)} draws`
	].join(' · ');
	return `<button class="pouch-item sail summary" data-act="sail-bar" aria-expanded="false"
		title="Your barter count, level, Parley, vouchers, Value Pack and Sailing Mastery — everything the sea is planned from. Press to set them.">
		<span class="pouch-glyph" aria-hidden="true">⇄</span>
		<span class="pouch-body">
			<span class="pouch-k">The sailor</span>
			<span class="pouch-input plain">${esc(said)}</span>
			<span class="pouch-need">${next ? esc(next) : 'every route open'} · refill in <b data-until="barter"></b></span>
		</span>
		<span class="pouch-fold" aria-hidden="true">✎</span>
	</button>`;
}

/**
 * The chips, built to the pouch's own shape -- picture, label, value, a
 * line of consequence under it -- because they are read the same way
 * and sit in the same strip. The consequence is the point of each one:
 * a barter count means nothing until it is told what it opens next, and
 * a barter level nothing until it is told what an exchange now costs.
 */
export function profileHTML() {
	const p = barterProfile();
	if (!open()) return summaryHTML(p);

	const day = dailyCapacity(p);
	const next = nextUnlock(p.barterCount);
	const mastery = Number(store.getProfile('sailingMastery', 0)) || 0;
	const cut = [
		`−${(levelDiscount(p.level) * 100).toFixed(1)}% level`,
		p.valuePack ? '−10% pack' : '',
		mateCut()
	].filter(Boolean).join(' · ');

	// The group's name is also the way back: one control, at the head of
	// what it folds, instead of a caret adrift at the end of the row.
	const title = `<button class="pouch-group fold" data-act="sail-bar" aria-expanded="true"
		title="Fold these back into one line">The sailor <i aria-hidden="true">▴</i></button>`;

	const chip = (cls, face, label, field, sub, title2) => `<label class="pouch-item sail ${cls}" title="${esc(title2)}">
		<span class="pouch-glyph" aria-hidden="true">${face}</span>
		<span class="pouch-body">
			<span class="pouch-k">${esc(label)}</span>
			${field}
			<span class="pouch-need">${sub}</span>
		</span>
	</label>`;

	const num = (act, value, aria, extra = '') => `<input class="pouch-input" type="text" inputmode="numeric"
		value="${value ? F(value) : ''}" placeholder="0" data-act="${act}" aria-label="${esc(aria)}"${extra}>`;

	const levels = barterLevels().map(name =>
		`<option${name === p.level ? ' selected' : ''}>${esc(name)}</option>`).join('');

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
			'The Parley in your bar right now, so a run can say whether you can afford it. The bar refills to a million at the barter reset.'),

		chip('vouchers', img("Crow's Trade Voucher", 'pouch-icon'), 'Vouchers',
			num('vouchers', p.vouchers, "Crow's Trade Vouchers you carry"),
			`+${F(250_000 * p.vouchers)} Parley in hand`,
			"Crow's Trade Vouchers in the bag: each one recovers 250,000 Parley, a quarter of the bar"),

		// The two that were crammed into one chip. A Value Pack is a
		// thing you have or have not -- a switch, said in words -- and
		// the draws are what it buys, counted with the clock that
		// refills them.
		chip('pack', img('Value Pack', 'pouch-icon'), 'Value Pack',
			`<span class="pouch-switch"><input type="checkbox" data-act="value-pack"${p.valuePack ? ' checked' : ''} aria-label="A Value Pack is up"><b>${p.valuePack ? 'up' : 'off'}</b></span>`,
			p.valuePack ? '+1 trade draw · −10% Parley' : 'would add a draw and −10%',
			'A Value Pack adds a fourth draw of the trade-goods list each day and takes ten per cent off every Parley cost'),

		chip('draws', '<img class="pouch-icon" src="icons/ui_barter_refresh.webp" alt="" decoding="sync">', 'Draws a day',
			`<span class="pouch-input plain">${F(day.lists.trade)} <small>trade</small> + ${F(day.lists.material)} <small>mat</small></span>`,
			`both refill in <b data-until="barter"></b>`,
			`${F(day.lists.trade)} draws of the trade-goods list and ${F(day.lists.material)} of the ship-materials list a day — each list has its own free draw and its own refreshes, and neither can lend the other a press`),

		chip('mastery', '⚓', 'Sailing mastery',
			num('crew-mastery', mastery, 'Sailing mastery', ' data-from="bar"'),
			mastery ? `+${masteryBonus(mastery)}% speed, turn, brake` : 'adds to speed, turn and brake',
			'Sailing Mastery as the game shows it: half a point of speed, acceleration, turn and brake per fifty up to 2,000, a quarter-point per fifty to 3,000')
	].join('');
}
