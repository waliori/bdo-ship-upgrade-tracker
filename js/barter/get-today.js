// What today's board does toward the To Get list.
//
// To Get reads the barter from the boards on record: how often an offer
// turns up, and so how many days a thing takes. That is the long view.
// The short one is the board in front of the sailor today -- one layout,
// of the material list or of the trade board, whichever was refreshed
// last: a refresh deals one or the other, never both -- and what it
// deals of what is still short: which islands, for what, how many
// times, and whether each can be done. And one press hands the Barter
// tab the run that does it, the same planner the tab sails with.

import { barterKey } from '../clock.js';
import { npcById, isleShort, whoOf } from '../barter_npcs.js';
import { materialDeal, materialPages } from '../barter-layouts.js';
import { levelOf } from '../barter.js';
import { chains } from '../barter-chains.js';
import { landGoods } from '../land_goods.js';
import * as store from '../state.js';
import { barterProfile, barterData } from '../ui-state.js';
import { V } from './state.js';
import { boardNow } from './board.js';
import { fleetRolls } from './fleet.js';
import { matBoardNow, matPageNow } from './material.js';
import { aboardStock, dockStock } from './hold.js';
import { layoutSide, restore, persist } from './view.js';
import { setOrders, ordersNow } from './plan.js';

/** The sides today's layouts stand on, and the one looked at. */
export function todaySides() {
	restore();
	const side = layoutSide();
	const pick = store.getSetting('getTodaySide', '');
	const shown = side === 'both' ? (pick === 'trade' ? 'trade' : 'material') : side;
	return { side, shown };
}

/**
 * One offer as a row: who, for what, how often, what is left of it
 * today, and whether it can be done -- `state` 'ok', 'give' (the good it
 * takes is not held and no chain of today's board reaches it), 'gate'
 * (the count has not opened it), 'done' (traded out today) or 'draw'
 * (a pool not read yet: it may show this, or another of its offers).
 */
function dealRow(npcId, o, used, { draw = 0, hits = 0, gives = [], climb = null } = {}) {
	const npc = npcById.get(npcId);
	const perDay = Math.max(0, Number(o.perDay) || 0);
	const left = Math.max(0, perDay - (used[npcId] || 0));
	const giveN = Number(o.giveN) || Number(String(o.qty || '1').split('-')[0]) || 1;
	const recvMin = Number(o.recvN ?? o.recvMin) || 1, recvMax = Number(o.recvMax) || recvMin;
	const held = store.getStock(o.give) || 0;
	const shore = levelOf(o.give) === null && !!landGoods[o.give];
	const gate = Number(o.gate) || 0;
	const state = draw ? 'draw'
		: gate > (Number(barterProfile().barterCount) || 0) ? 'gate'
		: perDay > 0 && left <= 0 ? 'done'
		: held >= giveN || shore || climb ? 'ok' : 'give';
	return {
		npcId, isle: isleShort(npc), who: npc ? whoOf(npc) : '', give: o.give, giveN, recvMin, recvMax,
		perDay, left, draw, hits, gives, held, shore, gate, climb, state,
		todayMin: state === 'ok' ? left * recvMin : 0, todayMax: state === 'ok' ? left * recvMax : 0,
		maybe: state === 'draw' ? left * recvMax : 0
	};
}

/** A slot the game draws from, as one row a thing it may pay: how many of
 *  its offers pay it, and for what. */
function drawRows(npcId, options, used, add, layout = '') {
	// What the fleet was shown here on this layout, when it has said.
	const f = layout ? fleetRolls(layout, npcId) : null;
	const by = new Map(), once = new Set();
	for (const o of options) {
		if (o.recv === 'Crow Coin' || once.has(`${o.give}|${o.recv}`)) continue;
		once.add(`${o.give}|${o.recv}`);
		if (!by.has(o.recv)) by.set(o.recv, []);
		by.get(o.recv).push(o);
	}
	for (const [recv, list] of by) {
		const best = list.reduce((a, o) => ((Number(o.recvMax) || 0) > (Number(a.recvMax) || 0) ? o : a));
		const seen = f ? list.reduce((a, o) => a + (f.seen[`${o.give}|${o.recv}`] || 0), 0) : 0;
		add(recv, { ...dealRow(npcId, best, used, { draw: new Set(options.map(o => `${o.give}|${o.recv}`)).size, hits: list.length, gives: [...new Set(list.map(o => o.give))] }), fleet: f ? { pct: Math.round(seen / f.total * 100), total: f.total } : null });
	}
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
				if (deal) add(a.recv, dealRow(npcId, { ...deal, give: a.give }, used));
				continue;
			}
			if (slot.options) drawRows(npcId, slot.options, used, add, page.id);
			else add(slot.recv, dealRow(npcId, slot, used));
		}
	} else {
		// The layout not settled yet: what was read, as read.
		for (const a of mb.answers) {
			const deal = materialDeal(a.npcId, a.give, a.recv);
			if (deal) add(a.recv, dealRow(a.npcId, { ...deal, give: a.give, recvN: deal.recvMin }, used));
		}
	}
	return { id: page ? page.id : '', known: !!page, offers: out };
}

/**
 * The trade board's islands paying what is short: its fixed slots, the
 * pools as read today, and the pools not read yet as what they may
 * draw. A give not held is still doable when one of today's chains
 * climbs to it -- `climb` names the start.
 */
function tradeOffers(missing) {
	const b = boardNow();
	const out = new Map();
	if (!b.combo) return { id: '', known: false, offers: out };
	const used = V.board.usedFor === b.combo.id ? V.board.used || {} : {};
	const add = (item, row) => { if (!out.has(item)) out.set(item, []); out.get(item).push(row); };
	const short = Object.keys(missing).filter(n => missing[n] > 0);
	const prof = barterProfile();
	// The chains of today's board that end at a material wanted: which
	// island each reaches, and from what.
	const reach = new Map();
	for (const c of chains(b.data, aboardStock(), dockStock(), prof.barterCount, 0, false, null, { mats: short })) {
		if (c.pays !== 'material' || c.gate) continue;
		const at = c.rungs[c.rungs.length - 1].npcId;
		const was = reach.get(at);
		if (!was || (was.from === 'land' && c.from !== 'land') || (was.from === c.from && c.rungs.length < was.rungs.length)) reach.set(at, c);
	}
	const climbOf = npcId => { const c = reach.get(npcId); return c ? { from: c.from, item: c.item, rungs: c.rungs.length } : null; };
	const said = new Map((V.board.answers || []).map(a => [a.npcId, a]));
	// An island said to show nothing today is off the board.
	const blank = new Set(V.board.blank || []);
	for (const [npcId, give, , recv, o] of b.combo.offers) {
		if (levelOf(recv) !== null || recv === 'Crow Coin' || blank.has(npcId)) continue;
		add(recv, dealRow(npcId, { ...(o || {}), give }, used, { climb: climbOf(npcId) }));
	}
	for (const [key, pool] of Object.entries(b.combo.pools || {})) {
		const npcId = Number(key);
		if (blank.has(npcId)) continue;
		const a = said.get(npcId);
		const drawn = a && pool.options.find(o => o.give === a.give && o.recv === a.recv);
		if (drawn) { add(drawn.recv, dealRow(npcId, drawn, used, { climb: climbOf(npcId) })); continue; }
		drawRows(npcId, pool.options, used, add, String(b.combo.id));
	}
	return { id: String(b.combo.id), known: true, offers: out };
}

// Whether any barter pays it, on either list: what nothing barters for
// is not "off today's layout", it is off every layout.
let paysMemo = null;
function bartered(item) {
	if (!paysMemo) {
		paysMemo = new Set((barterData || []).map(e => e.name));
		for (const p of materialPages()) for (const o of p.offers.values()) for (const x of [o, ...(o.options || [])]) paysMemo.add(x.recv);
	}
	return paysMemo.has(item);
}

/**
 * Today's board against what is short: `{ side, shown, layout, rows,
 * off, blocked, done }`. `rows` are the items it deals, each with its
 * islands and what today can bring; `off` the items short it does not
 * deal; `blocked` the islands that deal one but cannot be done today;
 * `done` when every island of the board that deals one is traded out.
 */
export function todayFor(missing) {
	const { side, shown } = todaySides();
	if (!shown) return { side, shown, layout: null, rows: [], off: [], blocked: [], done: false };
	const lay = shown === 'trade' ? tradeOffers(missing || {}) : materialOffers();
	const rows = [], off = [], blocked = [];
	for (const [item, need] of Object.entries(missing || {})) {
		if (!(need > 0)) continue;
		const deals = (lay.offers.get(item) || []).sort((a, b) => b.todayMax - a.todayMax);
		const can = deals.filter(d => d.state === 'ok' || d.state === 'draw');
		for (const d of deals) if (d.state !== 'ok' && d.state !== 'draw') blocked.push({ item, ...d });
		if (!can.length) { if (!deals.length && bartered(item)) off.push(item); continue; }
		rows.push({
			item, need, deals: can,
			todayMin: can.reduce((a, d) => a + d.todayMin, 0),
			todayMax: can.reduce((a, d) => a + d.todayMax, 0),
			maybe: can.reduce((a, d) => a + d.maybe, 0)
		});
	}
	const any = rows.length + blocked.length;
	const done = any > 0 && !rows.some(r => r.deals.some(d => d.state === 'ok')) && blocked.some(d => d.state === 'done');
	return { side, shown, layout: { list: shown, id: lay.id, known: lay.known, day: barterKey() }, rows, off, blocked, done };
}

/**
 * Today's run for the To Get list, handed to the Barter tab: on the
 * material list the material run, which is for every short material
 * the list pays; on the trade board the chains ending at the islands
 * that pay one, ticked. The Barter tab plans and sails it.
 */
export function sailToday(list) {
	if (list === 'material') {
		V.goal = 'material';
	} else {
		if (V.goal === 'material') V.goal = 'silver';
		setOrders({ side: { ...(ordersNow().side || {}), mats: true } });
		V.tickSide = true;
	}
	V.step = 'plan';
	V.planSec = 'chains';
	persist();
}
