// The sailor's own numbers, on every tab.
//
// Nine things about the player decide what half the app says: how many
// barters they have made, what barter level they hold, the Parley in
// the bar, the vouchers in the bag, whether a Value Pack is up, how
// many draws that buys a day, their Sailing Mastery, the Bos'n Jacks
// they have out, and the region they play. The barter count alone decides which islands exist for
// them, which chains are sailable, and which materials can be got at
// all; the region is what every Market price in the app is quoted in.
//
// They used to be typed into a tile on To Get and a field on the Ship
// tab -- read everywhere, corrected in two places neither of which is
// where the answer is read. The region was worse: it priced the whole
// app from a select in one screen's summary. So they sit beside the pouch instead, in
// the shell above the tabs: entered once, in view from every screen.
// Nothing here is per-screen state; every chip writes to the profile
// through the same data-act the rest of the app already answers.
//
// Folded is the default, and the reason is the strip itself: it sticks
// to the top of every screen, and seven fields down there would cost a
// second row of the window on every tab for something typed once a
// week. Folded, the numbers are still said -- the count, the level,
// the day's draws, the region the prices are in, the next island it
// opens -- and one press puts the fields under them.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { img } from './ui-bits.js';
import { barterProfile } from './ui-state.js';
import { dailyCapacity, barterLevels, levelDiscount, npcGates, ROUTE_UNLOCKS } from './barter.js';
import { npcById } from './barter_npcs.js';
import { mateAtTheHelm, masteryBonus, bosnJacks, bosnAlpha, petLT, setPets, PET_SLOTS } from './ship.js';
import { anyType } from './sailors.js';
import { openDialog, closeDialog } from './dialogs.js';
import { REGIONS as MARKET_REGIONS, region as marketRegion, priceAge } from './market.js';

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

/** The region as the chip says it: "NA", not "na". */
const regionLabel = () =>
	(MARKET_REGIONS.find(([id]) => id === marketRegion()) || ['', '—'])[1];

/** Folded: everything the chips say, in one chip, with the fields one
 *  press away. */
function summaryHTML(p) {
	const day = dailyCapacity(p);
	const next = nextUnlock(p.barterCount);
	const said = [
		`${F(p.barterCount)} barters`,
		p.level || 'no level',
		`${F(day.lists.trade)}+${F(day.lists.material)} draws`,
		regionLabel()
	].join(' · ');
	// Nought barters is what the game gives a sailor who has never
	// bartered -- three routes and no more -- and the app plans on it.
	// It is also what a save that has never been told says, so the one
	// number the sea is planned from asks for itself until it is given.
	const blank = !p.barterCount;
	return `<button class="pouch-item sail summary${blank ? ' asking' : ''}" data-act="sail-bar" aria-expanded="false"
		title="Your barter count, level, Parley, vouchers, Value Pack, Sailing Mastery and region — everything the sea is planned and priced from. Press to set them.">
		<span class="pouch-glyph" aria-hidden="true">⇄</span>
		<span class="pouch-body">
			<span class="pouch-k">The sailor</span>
			<span class="pouch-input plain">${esc(said)}</span>
			<span class="pouch-need">${blank
				? 'set your Total Barters — it decides which islands you can sail to'
				: `${esc(next || 'every route open')} · refill in <b data-until="barter"></b>`}</span>
		</span>
		<span class="pouch-fold" aria-hidden="true">✎</span>
	</button>`;
}

/** The tier names, as the pet window says them. */
const TIER_NAME = ['no pet', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5'];

/** The birds themselves, filled or not, at whatever size they are being
 *  read at. Shown, never pressed: the row is a picture of the nest, and
 *  the editor behind it is where it is changed. */
const petBirds = (tiers, cls = '') => `<span class="pet-pips${cls ? ` ${cls}` : ''}">${tiers
	.map(t => `<span class="pet-pip t${t}" title="${esc(TIER_NAME[t])}">${img("Bos'n Jack", 'pet-pic')}<i aria-hidden="true">${t || ''}</i></span>`)
	.join('')}</span>`;

/** What the birds are worth, said the way the hold will say it. */
function petSub(tiers, alpha) {
	const lt = petLT(tiers, alpha);
	return lt ? `+${F(lt)} LT on big ships` : 'adds to a big ship\'s hold';
}

/**
 * The nest, as one chip that opens onto the editor.
 *
 * It was five buttons pressed round their tiers, which is up to twenty
 * presses to say "five tier fours" -- each of them a write to the save
 * and a redraw of every screen that reads the hold. So the row of birds
 * is only ever read here now, and the choosing happens in a grid where
 * a tier is one press and the whole nest is one.
 */
function petsHTML() {
	const tiers = bosnJacks();
	const alpha = bosnAlpha();
	const on = tiers.filter(Boolean).length;
	return `<button class="pouch-item sail pets" data-act="pets"
		title="The Bos'n Jacks you have summoned. Each one's talent is Big Ship Inventory Weight — +50 LT a tier, stacking across the five pets the game lets out at once. It counts on the Epheria line, the Carracks and the Panokseon only. Press to set them.">
		${img("Bos'n Jack", 'pouch-icon')}
		<span class="pouch-body">
			<span class="pouch-k">Bos'n Jacks</span>
			${petBirds(tiers)}
			<span class="pouch-need">${esc(petSub(tiers, alpha))}${on && alpha ? ' · one Alpha' : ''}</span>
		</span>
		<span class="pouch-fold" aria-hidden="true">✎</span>
	</button>`;
}

/**
 * The chips, built to the pouch's own shape/**
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

	const chip = (cls, face, label, field, sub, title2, after = '') => `<label class="pouch-item sail ${cls}" title="${esc(title2)}">
		<span class="pouch-glyph" aria-hidden="true">${face}</span>
		<span class="pouch-body">
			<span class="pouch-k">${esc(label)}${after}</span>
			${field}
			<span class="pouch-need">${sub}</span>
		</span>
	</label>`;

	const num = (act, value, aria, extra = '') => `<input class="pouch-input" type="text" inputmode="numeric"
		value="${value ? F(value) : ''}" placeholder="0" data-act="${act}" aria-label="${esc(aria)}"${extra}>`;

	const levels = barterLevels().map(name =>
		`<option${name === p.level ? ' selected' : ''}>${esc(name)}</option>`).join('');

	const regions = MARKET_REGIONS.map(([id, label]) =>
		`<option value="${id}"${id === marketRegion() ? ' selected' : ''}>${esc(label)}</option>`).join('');

	return [
		title,
		chip('barters', '⇄', 'Total barters', num('barter-count', p.barterCount, 'Your Total Barters'),
			next ? esc(next) : 'every route open',
			'Your Total Barters, as the Barter Information window shows it. It decides which islands you can barter at — a run is never planned through one you have not opened. A trip recorded on the Barter tab adds its trades; type over it whenever the two drift.',
			' <button class="info-dot" data-act="routes" aria-label="Every trade route and the count that opens it">?</button>'),

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
			'Sailing Mastery as the game shows it: half a point of speed, acceleration, turn and brake per fifty up to 2,000, a quarter-point per fifty to 3,000'),

		// The server you play on, which is a fact about the sailor and
		// not about any one screen: every Market price in the app -- the
		// buy list, the item cards, what a barter's cargo would have
		// sold for -- is quoted in this region's silver, and Vell's
		// timetable is read from it too. It lived in a tile on To Get,
		// which priced the whole app from a select most people never
		// scrolled to.
		// The pets out at the moment. Bos'n Jack is the only pet in the
		// game whose talent is ship weight, and it is the player's
		// rather than the ship's -- the same five birds follow you onto
		// whichever hull you sail -- so it is asked for here and not on
		// the Ship tab.
		petsHTML(),

		chip('region', '⊕', 'Region',
			`<select class="pouch-input select" data-act="market-region" aria-label="Which region's Central Market prices the plan">${regions}</select>`,
			`${esc(priceAge())} · <button class="linky" data-act="market-refresh">refresh</button>`,
			"The region your Central Market prices come from, and the one Vell's times are read for. Every silver figure in the app is this region's.")
	].join('');
}

/**
 * The pets aboard: a grid, because a nest is a small table of facts.
 *
 * Five slots down the side, the six tiers across -- none, then 1 to 5 --
 * and every cell one press. The header row sets all five at once, which
 * is the answer most of the time: pets are fed up together, and a
 * player with five Bos'n Jacks usually has five of the same tier. The
 * mixed nest is still one press a bird, and never more.
 *
 * The whole thing is a draft until Save. Nothing touches the profile
 * while it is open, so pressing around costs a class on a button and
 * nothing else -- no write, no history entry, and no redraw of the
 * screens that plan against the hold.
 */
export function openPets() {
	let tiers = bosnJacks();
	let alpha = bosnAlpha();

	const cell = (tier, slot) => `<button type="button" class="pet-cell t${tier}"
		data-slot="${slot === null ? '' : slot}" data-tier="${tier}"
		aria-label="${slot === null ? `All five at ${TIER_NAME[tier]}` : `Pet ${slot + 1}: ${TIER_NAME[tier]}`}"
		title="${slot === null ? `Set all five to ${TIER_NAME[tier]}` : TIER_NAME[tier]}">${tier || '—'}</button>`;

	const head = `<div class="pet-row head">
		<span class="pet-row-k">all five</span>
		${[0, 1, 2, 3, 4, 5].map(t => cell(t, null)).join('')}
	</div>`;

	const rows = Array.from({ length: PET_SLOTS }, (_, i) => `<div class="pet-row" data-row="${i}">
		<span class="pet-row-k">${img("Bos'n Jack", 'pet-row-pic')}<b>Pet ${i + 1}</b></span>
		${[0, 1, 2, 3, 4, 5].map(t => cell(t, i)).join('')}
	</div>`).join('');

	const host = openDialog(`
		<h2>The pets aboard</h2>
		<p class="dialog-copy"><b>Bos'n Jack</b> is the one pet in the game whose talent is ship weight: <i>Big Ship Inventory Weight</i>, fifty LT a tier, and it stacks across the five pets you can have out at once. It counts on the Epheria line, the Carracks and the Panokseon — not on a Cog, a rowboat or the Bartali.</p>
		<div class="pet-grid">${head}${rows}</div>
		<label class="pet-alpha-row"><input type="checkbox" data-pet-alpha> <span>One of them is my <b>Alpha Pet</b><i>The Alpha's talent goes up a level, which on a Tier 5 is +250 LT instead of +200. Only one pet can be the Alpha.</i></span></label>
		<div class="pet-sum"><span class="pet-sum-birds"></span><b class="pet-sum-lt"></b></div>
		<div class="dialog-actions">
			<button class="ghost-btn" data-close>Cancel</button>
			<button class="act" data-pet-save>Save</button>
		</div>`);

	// The draft, drawn. Only classes, a checkbox and two spans move, so
	// a press is a repaint of this dialog and nothing else.
	const paint = () => {
		for (const b of host.querySelectorAll('.pet-row:not(.head) .pet-cell')) {
			b.classList.toggle('on', tiers[Number(b.dataset.slot)] === Number(b.dataset.tier));
		}
		const five = tiers.every(t => t === tiers[0]) ? tiers[0] : -1;
		for (const b of host.querySelectorAll('.pet-row.head .pet-cell')) {
			b.classList.toggle('on', Number(b.dataset.tier) === five);
		}
		const box = host.querySelector('[data-pet-alpha]');
		// An Alpha is only ever worth anything on a tier 5, so the offer
		// is only ever live when there is one for it to sit on.
		box.disabled = !tiers.includes(5);
		box.checked = alpha && !box.disabled;
		host.querySelector('.pet-alpha-row').classList.toggle('off', box.disabled);
		host.querySelector('.pet-sum-birds').innerHTML = petBirds(tiers, 'lg');
		host.querySelector('.pet-sum-lt').textContent = petSub(tiers, alpha && tiers.includes(5));
	};

	host.addEventListener('click', evt => {
		const b = evt.target.closest('.pet-cell');
		if (!b) return;
		const tier = Number(b.dataset.tier);
		if (b.dataset.slot === '') tiers = tiers.map(() => tier);
		else tiers[Number(b.dataset.slot)] = tier;
		if (!tiers.includes(5)) alpha = false;
		paint();
	});
	host.querySelector('[data-pet-alpha]').addEventListener('change', e => { alpha = e.target.checked; paint(); });
	host.querySelector('[data-pet-save]').addEventListener('click', () => {
		setPets(tiers, alpha);
		closeDialog();
	});
	paint();
	// The dialog focuses its first control by itself, which here is
	// "set all five to none" -- a ring around the one cell that undoes
	// the nest, and one Space from doing it. Save is the safe landing.
	host.querySelector('[data-pet-save]').focus({ preventScroll: true });
}

/**
 * Every threshold, and where your count stands among them.
 *
 * The one table the game never shows you in one piece: which island
 * each total opens, which are yours already, and how far off the next
 * one is. Opened from the bar and from the line on the Barter tab that
 * says a chain is not yours to sail yet.
 */
export function openRoutes() {
	const count = barterProfile().barterCount;
	const gates = npcGates();
	const rows = ROUTE_UNLOCKS.filter(r => r.opens).map(r => {
		const id = [...gates].find(([, barters]) => barters === r.barters);
		const npc = id ? npcById.get(id[0]) : null;
		const open = count >= r.barters;
		return `<tr class="${open ? 'open' : 'shut'}">
			<td class="routes-n">${F(r.barters)}</td>
			<td>${npc ? `<b>${esc(npc.at)}</b><span>${esc(npc.name)}</span>` : `<b>${esc(r.opens)}</b><span>not an island — a pair of goods</span>`}</td>
			<td class="routes-state">${open ? '<i>✓</i> open' : `${F(r.barters - count)} more`}</td>
		</tr>`;
	}).join('');
	const open = ROUTE_UNLOCKS.filter(r => r.opens && count >= r.barters).length;
	openDialog(`<h2>The trade routes</h2>
		<p class="dialog-copy">The game opens the sea island by island as your <b>Total Barters</b> climb. At <b>${F(count)}</b> you have <b>${open}</b> of the ${ROUTE_UNLOCKS.filter(r => r.opens).length} the patch notes name — and nothing in this app is ever planned through one you have not opened.</p>
		<div class="routes-table"><table><tbody>${rows}</tbody></table></div>
		<p class="dialog-copy faint">Three routes are open from the first day, before any of these. The coastal barterers that deal the [Level 6] and [Level 7] goods are not on this table: no patch note states a count for them, so the app treats them as open to everyone.</p>
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`);
}
