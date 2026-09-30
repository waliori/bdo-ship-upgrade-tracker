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
// island pays are not asked here: that is settled at the stop.
//
// And the pools: the islands a trade layout only names, which draw one
// of a score of offers each refresh -- mostly ship materials, Tidal
// Black Stone, a Lost Trade Box -- every option as likely as the next
// by the game's own tables. Nothing is planned on one until it is said,
// so they are asked here too: what it pays, then for what.
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
 * two options the sailor can see -- and the pools, `pool: true`. `said`
 * is what they answered.
 */
export function rollAsks(combo, answers = V.board.answers) {
	if (!combo) return [];
	const out = [];
	for (const [key, pool] of Object.entries(combo.pools || {})) {
		const npcId = Number(key);
		if (!npcById.has(npcId)) continue;
		const options = openOptions(pool);
		if (!options.length) continue;
		const a = answers.find(x => x.npcId === npcId);
		const said = a ? options.find(o => o.give === a.give && o.recv === a.recv) || null : null;
		out.push({ npcId, options, said, likely: null, pool: true, blank: (V.board.blank || []).includes(npcId), of: pool.options.length });
	}
	for (const [key, roll] of Object.entries(combo.rolls || {})) {
		const npcId = Number(key);
		if (!itemOrCoins(roll) || !npcById.has(npcId)) continue;
		const options = openOptions(roll);
		if (options.length < 2) continue;
		const a = answers.find(x => x.npcId === npcId);
		const said = a ? options.find(o => o.give === a.give && o.recv === a.recv) || null : null;
		out.push({ npcId, options, said, likely: likelyAt(combo, npcId), blank: (V.board.blank || []).includes(npcId) });
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
		if (answers.some(x => x.npcId === npcId) || (V.board.blank || []).includes(npcId)) continue;
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
	if (!combo || (!combo.rolls && !combo.pools) || combo.own) return;
	const day = barterKey();
	const all = { ...(store.getProfile('rolls', {}) || {}) };
	let changed = false;
	for (const a of answers) {
		const roll = combo.rolls[a.npcId] || (combo.pools && combo.pools[a.npcId]);
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
	const left = asks.filter(x => !x.said && !x.blank).length;
	return left
		? `<button class="chip tiny rolls-chip warn" data-act="barter-rolls" title="${T('These islands show one of several exchanges, a different one each refresh; which one changes the route')}">🎲 ${left === 1 ? T('{n} island draws its offer — which?', { n: left }) : T('{n} islands draw their offer — which?', { n: left })}</button>`
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
			if (x.pool) return poolRow(x, npc, f);
			return `<div class="roll-row${x.said || x.blank ? ' said' : ''}${x.blank ? ' blank' : ''}">
				<div class="roll-head"><b>${esc(gameName(isleOf(npc)))}</b><span class="faint">${esc(gameName(npc.name))} · ${T('takes {n}× {give}', { n: esc(x.options[0].qty), give: esc(gameName(x.options[0].give)) })}</span>${f ? `<span class="faint">${T('the fleet saw it {n} times', { n: F(f.total) })}</span>` : ''}${blankBtn(x)}</div>
				<div class="roll-options">${x.options.map(option).join('')}</div>
			</div>`;
		};
		// Nothing on its window today -- a draw above the sailor's count, or
		// a blank: said, the island is left out of the day's plans.
		const blankBtn = x => `<button class="chip tiny roll-blank${x.blank ? ' active' : ''}" data-act="barter-roll-blank" data-npc="${x.npcId}" aria-pressed="${!!x.blank}" title="${T('The island shows you nothing today — what it drew is above your barter count, or its window is blank. It is left out of today’s plans.')}">${x.blank ? '✓ ' : ''}${T('not on my window')}</button>`;
		// A pool: what it pays first, as icons with the fleet's share, then
		// the exchanges paying that one -- there are a score of them.
		const poolRow = (x, npc, f) => {
			// The same exchange stands once a barter-count step in the game's
			// table: one tile each, all the same to the sailor.
			const pays = new Map(), once = new Set();
			for (const o of x.options) { if (once.has(keyOf(o))) continue; once.add(keyOf(o)); if (!pays.has(o.recv)) pays.set(o.recv, []); pays.get(o.recv).push(o); }
			const pctOf = list => (f ? Math.round((list.reduce((a, o) => a + (f.seen[keyOf(o)] || 0), 0) / f.total) * 100) : null);
			const open = expand.get(x.npcId) || (x.said ? x.said.recv : '');
			const payChip = ([recv, list]) => { const pct = pctOf(list); return `<button class="roll-pay${open === recv ? ' on' : ''}${x.said && x.said.recv === recv ? ' said' : ''}" data-act="barter-roll-pays" data-npc="${x.npcId}" data-recv="${esc(recv)}" aria-pressed="${open === recv}" title="${esc(gameName(recv))}">${img(recv, 'row-icon sm')}<span>${esc(gameName(recv))}</span><em>${F(list.length)}${pct !== null ? ` · ⚓${pct}%` : ''}</em></button>`; };
			const list = open ? pays.get(open) || [] : [];
			const option = o => {
				const on = x.said === o;
				const pct = f ? Math.round(((f.seen[keyOf(o)] || 0) / f.total) * 100) : null;
				const pay = o.recvMin === o.recvMax ? F(o.recvMin) : `${F(o.recvMin)}–${F(o.recvMax)}`;
				return `<button class="roll-option mini${on ? ' on' : ''}" data-act="barter-roll-pick" data-npc="${x.npcId}" data-give="${esc(o.give)}" data-recv="${esc(o.recv)}" aria-pressed="${on}">
					<span class="roll-trade">${img(o.give, 'row-icon sm')}<span class="faint">→</span>${img(o.recv, 'row-icon sm')}</span>
					<span class="roll-name"><b>${esc(o.qty)}× ${esc(gameName(o.give))}</b> → ${esc(pay)}</span>
					<span class="roll-meta">${T('{n} a day', { n: F(o.perDay) })}${pct !== null ? ` · <i class="pay-fleet">⚓${pct}%</i>` : ''}</span>
				</button>`;
			};
			const openN = new Set(x.options.map(keyOf)).size;
			return `<div class="roll-row pool${x.said || x.blank ? ' said' : ''}${x.blank ? ' blank' : ''}">
				<div class="roll-head"><b>${esc(gameName(isleOf(npc)))}</b><span class="faint">${esc(gameName(npc.name))} · ${T('draws one of {n} offers open to you', { n: F(openN) })}</span>${blankBtn(x)}${f ? `<span class="faint">${T('the fleet saw it {n} times', { n: F(f.total) })}</span>` : ''}${x.said ? `<span class="roll-said">✓ ${esc(gameName(x.said.give))} → ${esc(gameName(x.said.recv))}</span>` : ''}</div>
				<div class="roll-pays"><span class="roll-pays-k">${T('it pays')}</span>${[...pays].sort((a, b) => b[1].length - a[1].length).map(payChip).join('')}</div>
				${list.length ? `<div class="roll-options pool-options"><span class="roll-pays-k">${T('for')}</span>${list.map(option).join('')}</div>` : ''}
			</div>`;
		};
		const pools = asks.filter(x => x.pool), coinRolls = asks.filter(x => !x.pool);
		return `<h2>${T('Today’s rolls')}</h2>
			${coinRolls.length ? `<p class="dialog-copy">${T('Layout {id} is known, but these islands pay a good or Crow Coins, a different one each day. Look at each in the game and tap what it shows; until then the likelier one is planned on.', { id: esc(combo.id) })}</p>
			<div class="rolls">${coinRolls.map(row).join('')}</div>` : ''}
			${pools.length ? `<p class="dialog-copy">${T('These islands draw one of their offers each refresh — materials, Tidal Black Stone, a Lost Trade Box. Tap what each pays in the game, then for what; nothing is planned on one until it is said. Your answers count toward the fleet’s share of each layout.')}</p>
			<div class="rolls">${pools.map(row).join('')}</div>` : ''}
			<div class="dialog-actions"><button class="act" data-close>${T('Done')}</button></div>`;
	};
	const expand = new Map();
	const host = openDialog(draw(), { onDismiss: redraw });
	host.addEventListener('click', e => {
		const p = e.target.closest('[data-act="barter-roll-pays"]');
		if (p) {
			e.stopPropagation();
			expand.set(Number(p.dataset.npc), p.dataset.recv);
			host.querySelector('.dialog-box').innerHTML = draw();
			return;
		}
		const nb = e.target.closest('[data-act="barter-roll-blank"]');
		if (nb) {
			e.stopPropagation();
			const npcId = Number(nb.dataset.npc);
			const blank = new Set(V.board.blank || []);
			if (blank.has(npcId)) blank.delete(npcId);
			else { blank.add(npcId); V.board.answers = V.board.answers.filter(x => x.npcId !== npcId); }
			V.board.blank = [...blank];
			persist();
			host.querySelector('.dialog-box').innerHTML = draw();
			return;
		}
		const b = e.target.closest('[data-act="barter-roll-pick"]');
		if (!b) return;
		e.stopPropagation();
		const npcId = Number(b.dataset.npc);
		V.board.answers = [...V.board.answers.filter(x => x.npcId !== npcId), { npcId, give: b.dataset.give, recv: b.dataset.recv }];
		V.board.blank = (V.board.blank || []).filter(n => n !== npcId);
		persist();
		noteRolls(combo);
		host.querySelector('.dialog-box').innerHTML = draw();
	});
}
