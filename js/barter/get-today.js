// What today's board does toward the To Get list.
//
// To Get reads the barter from the boards on record: how often an offer
// turns up, and so how many days a thing takes. That is the long view.
// The short one is the board in front of the sailor today -- one layout,
// of the material list or of the trade board, whichever was read last
// on the Barter tab -- and what it deals of what is still short: which
// islands, for what, how many times, and how much that can bring home
// today. Pure reading: the Barter tab owns the boards, this only looks.

import { barterKey } from '../clock.js';
import { npcById, isleShort, whoOf } from '../barter_npcs.js';
import { materialDeal } from '../barter-layouts.js';
import { levelOf } from '../barter.js';
import * as store from '../state.js';
import { V } from './state.js';
import { boardNow } from './board.js';
import { matBoardNow, matPageNow } from './material.js';
import { layoutSide, restore } from './view.js';

/** The sides today's layouts stand on, and the one looked at. */
export function todaySides() {
	restore();
	const side = layoutSide();
	const pick = store.getSetting('getTodaySide', '');
	const shown = side === 'both' ? (pick === 'trade' ? 'trade' : 'material') : side;
	return { side, shown };
}

/** One offer as a row: who, for what, how often, and what is left of it today. */
function dealRow(npcId, o, used, rolled) {
	const npc = npcById.get(npcId);
	const perDay = Math.max(0, Number(o.perDay) || 0);
	const left = Math.max(0, perDay - (used[npcId] || 0));
	const giveN = Number(o.giveN) || Number(String(o.qty || '1').split('-')[0]) || 1;
	const recvMin = Number(o.recvN ?? o.recvMin) || 1, recvMax = Number(o.recvMax) || recvMin;
	return {
		npcId, isle: isleShort(npc), who: npc ? whoOf(npc) : '', give: o.give, giveN, recvMin, recvMax,
		perDay, left, rolled: rolled || 0, held: store.getStock(o.give) || 0, shore: levelOf(o.give) === null,
		todayMin: left * recvMin, todayMax: left * recvMax
	};
}

/** Every offer of the day's material list, keyed by what it pays. */
function materialOffers() {
	const mb = matBoardNow();
	const page = matPageNow();
	const used = mb.used || {};
	const out = new Map();
	const add = (item, row) => { if (!out.has(item)) out.set(item, []); out.get(item).push(row); };
	const answered = new Map(mb.answers.map(a => [a.npcId, a]));
	if (page) {
		for (const [npcId, slot] of page.offers) {
			const a = answered.get(npcId);
			if (a) {
				const deal = (slot.options || [slot]).find(o => o.give === a.give && o.recv === a.recv) || materialDeal(npcId, a.give, a.recv);
				if (deal) add(a.recv, dealRow(npcId, { ...deal, give: a.give }, used, 0));
				continue;
			}
			if (slot.options) for (const o of slot.options) add(o.recv, dealRow(npcId, o, used, slot.options.length));
			else add(slot.recv, dealRow(npcId, slot, used, 0));
		}
	} else {
		// The layout not settled yet: what was read, as read.
		for (const a of mb.answers) {
			const deal = materialDeal(a.npcId, a.give, a.recv);
			if (deal) add(a.recv, dealRow(a.npcId, { ...deal, give: a.give, recvN: deal.recvMin }, used, 0));
		}
	}
	return { id: page ? page.id : '', known: !!page, offers: out };
}

/** The trade board's offers that pay something other than a trade good. */
function tradeOffers() {
	const b = boardNow();
	const out = new Map();
	if (!b.combo) return { id: '', known: false, offers: out };
	const used = V.board.usedFor === b.combo.id ? V.board.used || {} : {};
	const add = (item, row) => { if (!out.has(item)) out.set(item, []); out.get(item).push(row); };
	for (const [npcId, give, , recv, o] of b.combo.offers) {
		if (levelOf(recv) !== null) continue;
		const rolls = b.combo.rolls && b.combo.rolls[npcId];
		add(recv, dealRow(npcId, { ...(o || {}), give }, used, rolls ? rolls.options.length : 0));
	}
	return { id: String(b.combo.id), known: true, offers: out };
}

/**
 * Today's board against what is short: `{ side, shown, layout, rows,
 * off }`. `rows` are the items it deals, each with its islands and
 * what today can bring; `off` the items short that it does not deal.
 */
export function todayFor(missing) {
	const { side, shown } = todaySides();
	if (!shown) return { side, shown, layout: null, rows: [], off: [] };
	const lay = shown === 'trade' ? tradeOffers() : materialOffers();
	const rows = [], off = [];
	for (const [item, need] of Object.entries(missing || {})) {
		if (!(need > 0)) continue;
		const deals = (lay.offers.get(item) || []).sort((a, b) => b.todayMax - a.todayMax);
		if (!deals.length) { off.push(item); continue; }
		const sure = deals.filter(d => !d.rolled);
		rows.push({
			item, need,
			deals,
			todayMin: sure.reduce((a, d) => a + d.todayMin, 0),
			todayMax: deals.reduce((a, d) => a + d.todayMax, 0)
		});
	}
	return { side, shown, layout: { list: shown, id: lay.id, known: lay.known, day: barterKey() }, rows, off };
}
