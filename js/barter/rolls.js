// Today's rolls: the islands a layout leaves to chance between a good
// and Crow Coins.
//
// A layout fixes most of the board, but a few [Level 4] islands roll
// each day between two exchanges -- Ajir on layout 31 pays a [Level 5]
// Statue's Tear or 40-60 Crow Coins -- and which one it is changes the
// route: a chain up through Ajir, or a coin stop. So once the layout is
// known the sailor is asked, island by island, with the fleet's share of
// each beside it and the likelier one picked already; a barter
// screenshot answers it just as well. The four [Level 7]s a mainland
// island pays and the material islands are not asked here: the one is
// settled at the stop, the other is the material list's.
//
// What the sailor says is an answer like any other island's, kept in
// V.board.answers; and it is counted once a board day in the profile's
// `rolls`, which the fleet adds up.

import { esc, F } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img } from '../ui-bits.js';
import { barterProfile } from '../ui-state.js';
import { barterKey } from '../clock.js';
import { npcById, isleOf } from '../barter_npcs.js';
import { COIN } from '../barter.js';
import { openDialog } from '../dialogs.js';
import { V } from './state.js';
import { fleetRolls } from './fleet.js';
import { persist } from './view.js';

const keyOf = o => `${o.give}|${o.recv}`;
/** A roll between a trade good and coins. */
const itemOrCoins = roll => roll.options.some(o => o.recv === COIN) && roll.options.some(o => o.recv !== COIN);

/** How often the sailor was shown each option here, on this layout. */
const mine = (combo, npcId) => {
	const e = (store.getProfile('rolls', {}) || {})[`${combo.id}|${npcId}`];
	return e && e.seen ? e.seen : null;
};

/**
 * The option a roll is taken to be until the sailor says: the one the
 * fleet was shown more than half the time (three sightings at least),
 * else the sailor's own majority, else the layout's own.
 */
export function likelyAt(combo, npcId) {
	const roll = combo.rolls[npcId];
	const open = openOptions(roll);
	const best = counts => {
		if (!counts) return null;
		const total = Object.values(counts).reduce((a, b) => a + b, 0);
		const [key, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
		return key && total >= 3 && n * 2 > total ? open.find(o => keyOf(o) === key) || null : null;
	};
	const f = fleetRolls(combo.id, npcId);
	return best(f && f.seen) || best(mine(combo, npcId)) || open.find(o => keyOf(o) === combo.picks[npcId]) || open[0] || null;
}

/** The options a sailor's barter count opens. */
function openOptions(roll, count = barterProfile().barterCount) {
	const n = Number(count);
	return roll.options.filter(o => !Number.isFinite(n) || o.gate <= n);
}

/**
 * The item-or-coins rolls on this board worth asking about: those with
 * two options the sailor can see. `said` is what they answered.
 */
export function rollAsks(combo, answers = V.board.answers) {
	if (!combo || !combo.rolls) return [];
	const out = [];
	for (const [key, roll] of Object.entries(combo.rolls)) {
		const npcId = Number(key);
		if (!itemOrCoins(roll) || !npcById.has(npcId)) continue;
		const options = openOptions(roll);
		if (options.length < 2) continue;
		const a = answers.find(x => x.npcId === npcId);
		const said = a ? options.find(o => o.give === a.give && o.recv === a.recv) || null : null;
		out.push({ npcId, options, said, likely: likelyAt(combo, npcId) });
	}
	return out.sort((a, b) => isleOf(npcById.get(a.npcId)).localeCompare(isleOf(npcById.get(b.npcId))));
}

/**
 * What the board takes each unanswered roll to be, as answers boardData
 * reads: the likely option wherever it is not the layout's own.
 */
export function assumedRolls(combo, answers = V.board.answers) {
	if (!combo || !combo.rolls) return [];
	const out = [];
	for (const key of Object.keys(combo.rolls)) {
		const npcId = Number(key);
		if (answers.some(x => x.npcId === npcId)) continue;
		const o = likelyAt(combo, npcId);
		if (o && keyOf(o) !== combo.picks[npcId]) out.push({ npcId, give: o.give, recv: o.recv });
	}
	return out;
}

/**
 * The rolls the sailor answered on this board, counted once a board day
 * in the profile: what the fleet's share is added up from.
 */
export function noteRolls(combo, answers = V.board.answers) {
	if (!combo || !combo.rolls || combo.own) return;
	const day = barterKey();
	const all = { ...(store.getProfile('rolls', {}) || {}) };
	let changed = false;
	for (const a of answers) {
		const roll = combo.rolls[a.npcId];
		const o = roll && roll.options.find(x => x.give === a.give && x.recv === a.recv);
		if (!o) continue;
		const key = `${combo.id}|${a.npcId}`;
		const was = all[key] || {};
		if (was.day === day && was.pick === keyOf(o)) continue;
		const seen = { ...(was.seen || {}) };
		// Said again the same day, a different option: the first was a slip.
		if (was.day === day && was.pick && seen[was.pick] > 0) seen[was.pick] -= 1;
		seen[keyOf(o)] = (seen[keyOf(o)] || 0) + 1;
		all[key] = { day, pick: keyOf(o), seen: Object.fromEntries(Object.entries(seen).filter(([, n]) => n > 0)) };
		changed = true;
	}
	if (changed) store.setProfile('rolls', Object.fromEntries(Object.entries(all).slice(-400)));
}

/** The strip's chip: how many rolls are still to say, or that all are. */
export function rollsChipHTML(combo) {
	const asks = rollAsks(combo);
	if (!asks.length) return '';
	const left = asks.filter(x => !x.said).length;
	return left
		? `<button class="chip tiny rolls-chip warn" data-act="barter-rolls" title="${T('These islands pay a good or Crow Coins, a different one each day; which one changes the route')}">🎲 ${left === 1 ? T('{n} island rolls a good or coins — which?', { n: left }) : T('{n} islands roll a good or coins — which?', { n: left })}</button>`
		: `<button class="chip tiny rolls-chip ok" data-act="barter-rolls" title="${T('What the islands that roll a good or coins showed today')}">🎲 ${T('rolls said')}</button>`;
}

/** The dialog: every roll, its options side by side. */
export function openRolls(combo, redraw) {
	const draw = () => {
		const asks = rollAsks(combo);
		const row = x => {
			const npc = npcById.get(x.npcId);
			const f = fleetRolls(combo.id, x.npcId);
			const option = o => {
				const on = x.said ? x.said === o : x.likely === o;
				const pct = f ? Math.round(((f.seen[keyOf(o)] || 0) / f.total) * 100) : null;
				const pay = o.recvMin === o.recvMax ? F(o.recvMin) : `${F(o.recvMin)}–${F(o.recvMax)}`;
				return `<button class="roll-option${on ? ' on' : ''}${!x.said && on ? ' likely' : ''}" data-act="barter-roll-pick" data-npc="${x.npcId}" data-give="${esc(o.give)}" data-recv="${esc(o.recv)}" aria-pressed="${x.said === o}">
					<span class="roll-trade">${img(o.give, 'row-icon sm')}<span class="faint">→</span>${img(o.recv, 'row-icon sm')}</span>
					<span class="roll-name"><b>${esc(gameName(o.recv))}</b> × ${esc(pay)}</span>
					<span class="roll-meta">${T('{n} a day', { n: F(o.perDay) })}${pct !== null ? ` · <i class="pay-fleet">⚓${pct}%</i>` : ''}${!x.said && on ? ` · ${T('likely')}` : ''}</span>
				</button>`;
			};
			return `<div class="roll-row${x.said ? ' said' : ''}">
				<div class="roll-head"><b>${esc(gameName(isleOf(npc)))}</b><span class="faint">${esc(gameName(npc.name))} · ${T('takes {n}× {give}', { n: esc(x.options[0].qty), give: esc(gameName(x.options[0].give)) })}</span>${f ? `<span class="faint">${T('the fleet saw it {n} times', { n: F(f.total) })}</span>` : ''}</div>
				<div class="roll-options">${x.options.map(option).join('')}</div>
			</div>`;
		};
		return `<h2>${T('Today’s rolls')}</h2>
			<p class="dialog-copy">${T('Layout {id} is known, but these islands pay a good or Crow Coins, a different one each day. Look at each in the game and tap what it shows; until then the likelier one is planned on.', { id: esc(combo.id) })}</p>
			<div class="rolls">${asks.map(row).join('')}</div>
			<div class="dialog-actions"><button class="act" data-close>${T('Done')}</button></div>`;
	};
	const host = openDialog(draw(), { onDismiss: redraw });
	host.addEventListener('click', e => {
		const b = e.target.closest('[data-act="barter-roll-pick"]');
		if (!b) return;
		e.stopPropagation();
		const npcId = Number(b.dataset.npc);
		V.board.answers = [...V.board.answers.filter(x => x.npcId !== npcId), { npcId, give: b.dataset.give, recv: b.dataset.recv }];
		persist();
		noteRolls(combo);
		host.querySelector('.dialog-box').innerHTML = draw();
	});
}
