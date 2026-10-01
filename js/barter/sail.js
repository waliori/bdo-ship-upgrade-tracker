// The run under way: its stops by key, what each island paid, the trip
// the ticks come to and how it is written into the hold, and recording it.

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img } from '../ui-bits.js';
import { barterProfile, SILVER } from '../ui-state.js';
import { barterKey, periodKey } from '../clock.js';
import { npcById, ports, isleOf, isleShort } from '../barter_npcs.js';
import { quests, cadenceOf } from '../quests.js';
import { questDone, rewardOf } from '../screen-quests.js';
import { ratioKey } from '../barter-orders.js';
import { PARLEY, COIN, levelOf, ROUTE_UNLOCKS } from '../barter.js';
import { weightOf } from '../barter-plan.js';
import { toast } from '../dialogs.js';
import { cheer } from '../cheer.js';
import { V } from './state.js';
import { stopTimer, passedStop } from '../sail-timer.js';
import { boardNow, fromPort, itemNow, noteUsed } from './board.js';
import { noteMatUsed } from './material.js';
import { bringUp, stopAt, stopNames, cockpitHTML } from './cockpit.js';
import { planSheetHTML, parleyOf, ordersNow } from './plan.js';
import { storeOf, legsOf, skippedToday, questTitle, TIER, ledgerOf, runTime, sevenOf, chartData, chartFragmentOf } from './route.js';
import { VIEW_NS, setStep, restore, persist, viewNow, flushView } from './view.js';

/* ------------------------------------------------------------------ *
 * sailing the run: the checklist, and the trip recorded
 * ------------------------------------------------------------------ */

/** The key a checklist belongs to: the goal and what it lays out. */
// The checklist belongs to one run: the goal, the board, the chains
// ticked and the harbour. Two chain ids side by side already run past
// the length the profile keeps a string at, so the key is a short
// digest of them -- it is only ever compared, never read.
export const sailKey = () => digest(V.goal === 'material' ? `material|${itemNow()}|${V.qty}|${V.port}` : `${V.goal}|${V.routes.key}|${V.routes.ids.slice().sort().join('.')}|${V.port}`);
/** A long key folded to a short one, the part before its first `|` kept readable. */
export function digest(str) {
	// FNV-1a, 32 bits: the same short key for the same run, always.
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	const cut = str.indexOf('|');
	return `${cut < 0 ? '' : str.slice(0, Math.min(cut, 24))}:${h.toString(16)}`;
}
/** The checklist for the run on screen, or null when not sailing it. */
export const sailing = () => (V.sail && V.sail.key === sailKey() ? V.sail : null);
/**
 * A stop's name on the checklist.
 *
 * An island is its own name and always has been. A wharf or a quest
 * taker can be called at twice in one run, so one of those needs
 * saying which visit it is -- and it used to be said by counting the
 * islands that came before it.
 *
 * That count is not the stop's own. Saying what an island paid lays
 * the run again from the rungs it opened, and a run laid again moves
 * its wharf calls about: the same call, at the same pier, for the same
 * reason, would answer to `wVelia@3` before the count and `wVelia@4`
 * after it. The tick stayed behind under the old name, the recorder
 * looked for the new one, and the sale at that call went into the
 * Inventory as nothing at all -- the silver quietly missing from a
 * run the sailor had ticked off in full.
 *
 * So a visit is numbered among the visits to that same place, which is
 * what "the second time at Velia" meant all along, and which no amount
 * of re-counting can shift.
 */
//
// And a wharf call or a quest stop is named after the island before it
// as well: "Port Epheria, after Epheria Sentry Post". Numbered among
// the calls at that wharf alone, a call a re-laying put in earlier took
// the number -- and the tick -- of the call the sailor had made: the
// [Level 7]s sold there came back into the hold, and the sale recorded
// was of goods still aboard.
const islandBefore = (stops, k) => { for (let i = Math.min(k, stops.length) - 1; i >= 0; i--) if (stops[i] && stops[i].npcId) return stops[i].npcId; return 0; };
export const stopKey = (s, k, stops) => {
	if (s.npcId) return `n${s.npcId}`;
	if (s.wait) return `v${s.waitAt}@${stops.slice(0, k).filter(x => x.wait && x.waitAt === s.waitAt).length}`;
	const after = islandBefore(stops, k);
	const same = x => (s.quest ? x.quest && x.place && x.place.name === s.place.name : x.wharf && x.wharf.name === s.wharf.name);
	const n = stops.slice(0, k).filter((x, i) => same(x) && islandBefore(stops, i) === after).length;
	return s.quest ? `q${s.place.name}>${after}@${n}` : `w${s.wharf.name}>${after}@${n}`;
};

/** What a stop was called before the key above: a checklist saved
 *  mid-run keeps its old ticks, so they are still answered to -- read
 *  only, and never written again. */
const stopKeysWas = (s, k, stops) => (s.npcId || s.wait ? [] : s.quest
	? [`q${s.place.name}@${stops.slice(0, k).filter(x => x.npcId).length}`, `q${s.place.name}@${stops.slice(0, k).filter(x => x.quest && x.place && x.place.name === s.place.name).length}`]
	: [`w${s.wharf.name}@${stops.slice(0, k).filter(x => x.npcId).length}`, `w${s.wharf.name}@${stops.slice(0, k).filter(x => x.wharf && x.wharf.name === s.wharf.name).length}`]);

/** Whether a list of ticks holds this stop, under any of its names. */
export const ticked = (list, s, k, stops) => {
	const l = list || [];
	return l.includes(stopKey(s, k, stops)) || stopKeysWas(s, k, stops).some(x => l.includes(x));
};

/**
 * What the Map's stop card asks: is this island on the checklist being
 * sailed, is it done, what did it pay, what could it. Null when no run
 * is being sailed or the island is not on it.
 */
export function sailFor(npcId) {
	restore();
	if (!V.sail || !Array.isArray(V.sail.stops)) return null;
	const s = V.sail.stops.find(x => x.npcId === npcId);
	if (!s) return null;
	return { done: V.sail.done.includes(`n${npcId}`), paid: V.sail.seen[npcId] || null, ask: paidAsk(s, V.sail.seen[npcId], true), owes: owesCount(s, V.sail), item: sevenOf(s, V.sail), recvText: s.recvText };
}

/** What the chime calls a run: where it starts and how far it goes. */
export function runLabel(plan) {
	const isles = plan.stops.filter(s => s.npcId).map(s => isleShort(npcById.get(s.npcId)) || s.npc);
	if (!isles.length) return T('the run');
	return isles.length === 1 ? isles[0] : T('{isle} and {n} more', { isle: isles[0], n: isles.length - 1 });
}

/** What one stop is called, for a chime that names it. */
const stopLabel = s => (s.npcId ? isleShort(npcById.get(s.npcId)) || s.npc : s.wait ? isleShort(npcById.get(s.waitAt)) || T('a wait') : s.wharf ? gameName(s.wharf.at) : s.place ? gameName(s.place.name) : T('a stop'));

/**
 * The stops of a run as the clock keeps them: each at its own second
 * from casting off, the last of them the end of the run.
 *
 * The legs are already bent round the coast and already have a time on
 * them; this only adds them up. Where the run has no harbour to sail
 * from, the first stop is where the ship already is and carries no leg
 * -- it is not something to wait for, so it is not a mark.
 */
export function runMarks(plan, legs, book) {
	if (!legs || !legs.legs.length) return [];
	const pause = ordersNow().pause || { isle: 0, call: 0 };
	const out = [];
	let at = 0;
	plan.stops.forEach((s, i) => {
		const leg = legs.from ? legs.legs[i] : legs.legs[i - 1];
		// However long this sort of stop takes before the ship is under
		// way again: a wharf call or a quest is the longer kind. It is
		// carried on the mark as well as added to the running total, so
		// the clock can say "under way in 40 s" rather than folding it
		// silently into the next arrival.
		// A wait for a voucher's cooldown is a hold like any other,
		// only longer: the clock says so, and every arrival after it
		// moves on by as much.
		const wait = s.wait ? s.wait * 60 : book && book.rows[i] ? (book.rows[i].wait || 0) * 60 : 0;
		const hold = (s.wait ? 0 : (s.npcId ? pause.isle : pause.call) || 0) + wait;
		// A stop with no leg is one the ship is already at -- a second
		// exchange at the same island. There is nothing to wait for, so
		// no mark; the time it takes is real all the same.
		if (leg > 0) {
			at += legs.secondsOf(leg);
			out.push({ at: Math.round(at), label: stopLabel(s), hold, k: i });
		}
		at += hold;
	});
	return out;
}

/**
 * What this run's islands were seen to pay, as the plan counts it: the
 * window's own figures. Coins included -- the window pays what the
 * island states, with no barter-count bonus on top (397 at a 360-440
 * island, 2026-09-28), so there is nothing to take off.
 */
export function planSeen(on) {
	if (!on || !on.seen) return {};
	return { ...on.seen };
}

/** The most counts an island may pay before chips stop being an answer. */
export const PAID_CHIPS = 6;

/**
 * Whether a stop still owes its count: an island that pays a range,
 * not yet told what it paid. Such a stop is not ticked -- the tick
 * would have to guess, and every guess drifted the Inventory one way
 * or the other -- so the press that would tick it asks instead.
 */
export const owesCount = (s, on) => !!(s && s.npcId && rangeOf(s).hi > rangeOf(s).lo && !((on && on.seen || {})[s.npcId] > 0));

/** The range an island pays, as the table gives it -- kept even once
 *  the run has been laid again at the count it was seen to pay. */
export const rangeOf = s => ({ lo: Math.ceil((s.rangeMin ?? s.recvMin) || 0), hi: Math.floor((s.rangeMax ?? s.recvMax) || 0) });

/**
 * How a stop asks what its island paid.
 *
 * A [Level 2] pays 2 or 3, and two chips is the right question. A coin
 * island pays "360-440", and the checklist drew that as eighty-one
 * buttons in a row -- a hundred and eleven at Donalia. A range that
 * wide is a number to type, and the number to type is the one in the
 * game's window, which already has the sailor's barter bonus on it.
 */
export function paidAsk(s, said, map = false) {
	const { lo, hi } = rangeOf(s || {});
	if (!s || !s.npcId || !(hi > lo)) return '';
	const flag = map ? ' data-map="1"' : '';
	if (hi - lo + 1 > PAID_CHIPS) {
		return `<span class="run-paid"><span>${T('paid')}</span><input class="purse-inline narrow run-paid-n" inputmode="numeric" data-act="barter-paid-n"${flag} data-npc="${s.npcId}" value="${said > 0 ? said : ''}" placeholder="${lo}–${hi}" aria-label="${T('What the island paid, as the game’s window showed it')}" title="${T('What the island paid, as the game’s window showed it')}"></span>`;
	}
	const opts = [];
	for (let n = lo; n <= hi; n++) opts.push(n);
	return `<span class="run-paid"><span>${T('paid')}</span>${opts.map(n => `<button class="chip pay${said === n ? ' active' : ''}" aria-pressed="${said === n ? 'true' : 'false'}" data-act="barter-paid"${flag} data-npc="${s.npcId}" data-n="${n}">${n}</button>`).join('')}</span>`;
}

/**
 * What an island is recorded as having paid.
 *
 * The count the sailor pressed, where they pressed one. Where they did
 * not -- and "All done" never asks -- the range has to be guessed at,
 * and the guess used to be the bottom of it. Every exchange in the
 * game that pays a [Level 2] or a [Level 3] pays "2-3", so a climb
 * recorded that way wrote 2 into the Inventory every time the game
 * paid 3, and the counts drifted below the truth a little further with
 * every run. The middle of the range is the honest guess when nobody
 * has said otherwise: it is wrong by half a good rather than by a
 * whole one, and it is wrong in both directions instead of always the
 * same one, so a season of runs does not pull the Inventory down.
 *
 * Planning is a different question and keeps its own orders -- a run
 * counts an exchange at the least unless told otherwise, because a
 * plan that promises more than it brings is a plan that strands a
 * ship. This is only what goes into the Inventory afterwards.
 */
function paidAt(s, on) {
	const said = (on.seen || {})[s.npcId];
	if (said > 0) return said;
	if (s.recvMin > 0 && s.recvMax > s.recvMin) return (s.recvMin + s.recvMax) / 2;
	return s.recvMin || s.recv;
}

/** Rounded to the nearest whole, a half to the even one: 2.5 is 2 and
 *  7.5 is 8, so the halves a guessed range leaves fall both ways. */
export function halfEven(n) {
	const f = Math.floor(n), d = n - f;
	if (Math.abs(d - 0.5) > 1e-9) return Math.round(n);
	return f % 2 === 0 ? f : f + 1;
}

/** The stops done whose island pays a range and was never asked about:
 *  what the recording has to guess at, so it can say so. */
export function unsaid(plan, on) {
	if (!plan || !on) return [];
	return plan.stops.filter((s, k) => s.npcId
		&& ticked(on.done, s, k, plan.stops)
		&& s.recvMax > s.recvMin
		&& !((on.seen || {})[s.npcId] > 0));
}

/**
 * The trip as the Inventory takes it, from the stops done: goods
 * handed over and received -- at what the island was seen to pay, else
 * the middle of what it could have -- the goods sold and the silver
 * they paid, the goods left in a harbour's storage, and the goods
 * loaded from one. Land goods come off the stock only when the stock
 * has them.
 */
export function tripOf(plan, on, from) {
	const delta = {}, moves = [];
	// Added up as they come, halves and all, and rounded once at the end:
	// rounded stop by stop, every lone 2-3 recorded as 3, since a half
	// always rounds up -- the guess was meant to be wrong both ways.
	const add = (item, n) => { if (n) delta[item] = (delta[item] || 0) + n; };
	// An island that paid another of its four [Level 7]s than the plan
	// named: the goods it paid are sold or carried under their own name
	// -- those goods, and from that stop on. The rename was once taken
	// from every stop at the start and put on every good of the plan's
	// name, so five Heidelian Wines loaded from Iliya and sold at Port
	// Epheria were written off as Candle Stands an island further on had
	// not yet paid, and the wine stayed in the hold.
	const owed = new Map(), bagOwed = new Map();   // plan's name -> [{ to, n }] still to be sold or moved
	const owe = (m, name, to, n) => { if (n > 0) m.set(name, [...(m.get(name) || []), { to, n }]); };
	const parts = (m, name, n) => {
		const out = [];
		let left = n;
		for (const e of m.get(name) || []) {
			if (left <= 1e-9) break;
			const t = Math.min(e.n, left);
			if (t > 0) { out.push([e.to, t]); e.n -= t; left -= t; }
		}
		if (left > 1e-9) out.push([name, left]);
		return out;
	};
	let silver = 0, trades = 0, spent = 0;
	// A give handed over. A trade good, or a shore good the sailor keeps,
	// comes off the Inventory. A shore good they do not keep was bought
	// for the run -- and the silver that bought it has to come off too.
	// It never did: a run put what it sold into the purse and left what
	// it spent there as well, so a sailor building a stock from the shore
	// watched their Silver climb with every run that cost them money.
	const priceOf = new Map((plan.bought || []).map(b => [b.item, Number(b.each) || 0]));
	const leftOf = new Map();
	const handOver = (give, units) => {
		if (levelOf(give) !== null) return add(give, -units);
		if (!leftOf.has(give)) leftOf.set(give, store.getStock(give));
		const mine = Math.min(units, leftOf.get(give));
		leftOf.set(give, leftOf.get(give) - mine);
		if (mine > 0) add(give, -mine);
		spent += (units - mine) * (priceOf.get(give) || 0);
	};
	for (const [k, s] of plan.stops.entries()) {
		if (!ticked(on.done, s, k, plan.stops) || s.quest || s.wait) continue;
		if (s.wharf) {
			// The sale, unless the sailor said the goods were kept: then
			// they stay in the delta, and go into the Inventory.
			if (!ticked(on.kept, s, k, plan.stops)) for (const x of (s.sale && s.sale.items) || []) { for (const [name, n] of parts(owed, x.item, x.n)) add(name, -n); silver += x.total; }
			for (const d of s.dropped || []) for (const [name, n] of parts(owed, d.item, d.n)) moves.push({ item: name, from: '', to: storeOf(s.wharf.at), n: Math.round(n) });
			for (const l of s.loads || []) moves.push({ item: l.item, from: storeOf(s.wharf.at), to: '', n: Math.round(l.n) });
			// Load Cargo at this wharf: goods between the hold and the bag.
			for (const b of s.toBag || []) for (const [name, n] of parts(owed, b.item, b.n)) { moves.push({ item: name, from: '', to: store.BAG, n: Math.round(n) }); if (name !== b.item) owe(bagOwed, b.item, name, n); }
			for (const b of s.fromBag || []) for (const [name, n] of parts(bagOwed, b.item, b.n)) { moves.push({ item: name, from: store.BAG, to: '', n: Math.round(n) }); if (name !== b.item) owe(owed, b.item, name, n); }
			continue;
		}
		const paid = paidAt(s, on);
		// Coins not said are recorded at the middle of the range, as the
		// island states it: no barter-count bonus is paid on coins.
		if (s.item === COIN && !((on.seen || {})[s.npcId] > 0)) {
			add(COIN, s.times * paid);
			handOver(s.give, s.times * s.giveN);
			trades += s.times;
			continue;
		}
		handOver(s.give, s.times * s.giveN);
		const got = sevenOf(s, on);
		add(got, s.times * paid);
		if (got !== s.item) owe(owed, s.item, got, s.times * paid);
		trades += s.times;
	}
	// What the harbour loaded: the hold's goods aboard, the bag's into the
	// bag -- off the ship's weight, and not read as cargo by the next run.
	if (on.done.length && from) {
		for (const l of plan.loaded || []) moves.push({ item: l.item, from: from.name, to: '', n: Math.round(l.n) });
		for (const l of plan.bagLoaded || []) moves.push({ item: l.item, from: from.name, to: store.BAG, n: Math.round(l.n) });
	}
	if (on.done.length) for (const l of plan.bagFromHold || []) moves.push({ item: l.item, from: '', to: store.BAG, n: Math.round(l.n) });
	if (silver - spent) add(SILVER, silver - Math.round(spent));
	for (const [item, n] of Object.entries(delta)) {
		const r = halfEven(n);
		if (r) delta[item] = r; else delete delta[item];
	}
	return { delta, moves, silver, trades, spent: Math.round(spent) };
}

/* ------------------------------------------------------------------ *
 * the hold, stop by stop
 * ------------------------------------------------------------------ */

/**
 * What a run under way has written into the Inventory so far, and the
 * write that brings it up to the ticks.
 *
 * Traded is pressed at the island, and the hold in the game changes
 * then -- so the hold here does too: every tick, untick and count said
 * writes the difference between what the ticked stops come to and what
 * was written before, into the ship's hold. Record then writes only
 * the rest: the Parley, the barter count, the log. The run itself is
 * still laid from the hold it cast off with (`readingAsWas`), or it
 * would be laid again from goods it has already traded away.
 */
const NO_HOLD = { delta: {}, moves: [] };
export const moveKey = m => `${m.item}\u0001${m.from}\u0001${m.to}`;
function netMoves(list) {
	const by = new Map();
	for (const m of list || []) {
		const n = Math.round(Number(m.n) || 0);
		if (!n || m.from === m.to) continue;
		const k = moveKey(m);
		by.set(k, { item: m.item, from: m.from, to: m.to, n: ((by.get(k) || {}).n || 0) + n });
	}
	return [...by.values()].filter(m => m.n > 0);
}
export function cleanApplied(a) {
	const delta = {};
	for (const [k, v] of Object.entries((a && a.delta) || {})) if (typeof k === 'string' && Number.isFinite(Number(v)) && Math.round(Number(v))) delta[k] = Math.round(Number(v));
	const moves = netMoves(Array.isArray(a && a.moves) ? a.moves.filter(m => m && typeof m.item === 'string' && typeof m.from === 'string' && typeof m.to === 'string') : []);
	return { delta, moves };
}
/** Two writes as one, net: goods moved there and back again cancel. */
export function mergeApplied(a, b) {
	const delta = { ...((a && a.delta) || {}) };
	for (const [k, v] of Object.entries((b && b.delta) || {})) { const d = Math.round((delta[k] || 0) + v); if (d) delta[k] = d; else delete delta[k]; }
	const by = new Map();
	for (const m of [...((a && a.moves) || []), ...((b && b.moves) || [])]) {
		const n = Math.round(Number(m.n) || 0);
		if (!n || m.from === m.to) continue;
		const lo = m.from < m.to ? m.from : m.to, hi = m.from < m.to ? m.to : m.from;
		const k = `${m.item}\u0001${lo}\u0001${hi}`;
		const e = by.get(k) || { item: m.item, lo, hi, n: 0 };
		e.n += m.from === lo ? n : -n;
		by.set(k, e);
	}
	const moves = [...by.values()].filter(e => e.n).map(e => (e.n > 0 ? { item: e.item, from: e.lo, to: e.hi, n: e.n } : { item: e.item, from: e.hi, to: e.lo, n: -e.n }));
	return { delta, moves };
}

/** The write that turns `was` into `want`. */
function holdDiff(want, was = NO_HOLD) {
	const delta = {};
	for (const k of new Set([...Object.keys(want.delta), ...Object.keys(was.delta)])) {
		const d = Math.round((want.delta[k] || 0) - (was.delta[k] || 0));
		if (d) delta[k] = d;
	}
	const wm = new Map(want.moves.map(m => [moveKey(m), m])), am = new Map(was.moves.map(m => [moveKey(m), m]));
	const moves = [];
	for (const k of new Set([...wm.keys(), ...am.keys()])) {
		const m = wm.get(k) || am.get(k);
		const n = ((wm.get(k) || {}).n || 0) - ((am.get(k) || {}).n || 0);
		if (n > 0) moves.push({ item: m.item, from: m.from, to: m.to, n });
		else if (n < 0) moves.push({ item: m.item, from: m.to, to: m.from, n: -n });
	}
	return { delta, moves };
}
// Where a tick's write lands. A shore good comes off the ship's hold and
// goes back onto it; a trade good handed over comes off the hold first,
// and one received goes where trade goods aboard have always been kept.
// Silver and coins are the purse's.
const intoHold = (item, d) => (levelOf(item) !== null ? (d < 0 ? store.ABOARD : false) : weightOf(item) > 0 ? store.ABOARD : false);
const holdEmpty = d => !Object.keys(d.delta).length && !d.moves.length;
/** The trip the ticks come to, read against the hold as it cast off. */
function tripAsSailed(plan, on, from) {
	return store.readingAsWas(on.applied, () => tripOf(plan, on, from));
}
export function syncHold() {
	const on = V.sail;
	if (!on || !Array.isArray(on.done)) return;
	const plan = planOfSail(on);
	if (!plan) return;
	const from = ports.find(p => p.id === on.port) || fromPort();
	const trip = tripAsSailed(plan, on, from);
	const want = { delta: trip.delta, moves: netMoves(trip.moves) };
	const was = on.applied || NO_HOLD;
	const step = holdDiff(want, was);
	if (holdEmpty(step)) return;
	// Named after the stop the press was made at, when it was one.
	const last = plan.stops.map((s, k) => (ticked(on.done, s, k, plan.stops) ? s : null)).filter(Boolean).pop();
	const more = on.done.length > (on.appliedN || 0);
	const label = more && last ? T('Traded at {place}: the hold', { place: stopNames(last).place }) : T('The hold follows the run’s ticks');
	on.applied = want;
	on.appliedN = on.done.length;
	store.applyTrip({ delta: step.delta, moves: step.moves, at: intoHold, label });
}
/**
 * The goods aboard as the Inventory has them: trade goods in the hold,
 * and shore goods noted on the ship -- what the game's window shows.
 */
export function aboardNow() {
	const out = new Map();
	for (const name of Object.keys(store.getAllStock())) {
		if (name === COIN || name === SILVER) continue;
		const n = levelOf(name) !== null ? store.stockAt(name, '') + store.stockAt(name, store.ABOARD) : store.stockAt(name, store.ABOARD);
		if (n > 0) out.set(name, n);
	}
	return out;
}
// Whether a place a write names is the ship: the hold for a trade good,
// the ship's own line for a shore good.
const onShip = (item, place) => place === store.ABOARD || (place === '' && levelOf(item) !== null);
function aboardOfTrip(t) {
	const out = new Map();
	const add = (item, n) => { if (n) out.set(item, (out.get(item) || 0) + n); };
	for (const [item, d] of Object.entries(t.delta)) if (item !== COIN && item !== SILVER && (levelOf(item) !== null || weightOf(item) > 0)) add(item, d);
	for (const m of t.moves) {
		const a = onShip(m.item, m.from), b = onShip(m.item, m.to);
		if (a && !b) add(m.item, -m.n); else if (!a && b) add(m.item, m.n);
	}
	return out;
}
/**
 * What each stop does to the hold, good by good: the trip with the stop
 * ticked against the trip without it, the other ticks as they stand.
 * The harbour's loads at the start are the wharf step's, not a stop's.
 */
export function stopEffects(plan, on) {
	const bare = { ...plan, loaded: [], bagLoaded: [], bagFromHold: [] };
	const read = done => aboardOfTrip(store.readingAsWas(on.applied, () => tripOf(bare, { ...on, done }, null)));
	return plan.stops.map((s, k) => {
		if (s.quest || s.wait) return new Map();
		const key = stopKey(s, k, plan.stops), was = stopKeysWas(s, k, plan.stops);
		const without = on.done.filter(x => x !== key && !was.includes(x));
		const a = read([...without, key]), b = read(without);
		const out = new Map();
		for (const item of new Set([...a.keys(), ...b.keys()])) { const d = (a.get(item) || 0) - (b.get(item) || 0); if (d) out.set(item, d); }
		return out;
	});
}

/** Every tick's write taken back: the hold as it cast off. */
export function unsyncHold(on) {
	if (!on || !on.applied) return;
	const back = holdDiff(NO_HOLD, on.applied);
	on.applied = null;
	if (!holdEmpty(back)) store.applyTrip({ delta: back.delta, moves: back.moves, at: intoHold, label: T('The run dropped: the hold as it cast off') });
}

/**
 * The run dropped, nothing recorded, one of two ways, each one change
 * that one Undo takes back with the run where it stood:
 *
 *   'keep' -- the trades were made in game: the hold and the storages
 *             stay as the ticked stops left them.
 *   'back' -- nothing was done in game: every tick is taken back, and
 *             the packing too -- goods back where they were taken from,
 *             what was bought at the Market refunded -- as if the run
 *             had never been planned. Says what came back.
 */
export function abandonRun(mode = 'back') {
	const on = V.sail;
	if (!on) return null;
	if (V.writeTimer) { clearTimeout(V.writeTimer); V.writeTimer = null; }
	let back = { delta: {}, moves: [] };
	if (mode === 'back') {
		back = mergeApplied(on.applied ? holdDiff(NO_HOLD, on.applied) : back, on.packLog ? holdDiff(NO_HOLD, on.packLog) : back);
	}
	V.sail = null;
	V.writing = true;
	try {
		const views = { ...(store.getProfile('views', {}) || {}), [VIEW_NS]: viewNow() };
		store.applyTrip({ delta: back.delta, moves: back.moves, at: intoHold, profile: { views }, viewKeys: { [VIEW_NS]: ['sail'] },
			label: mode === 'back' ? T('The run dropped: everything put back') : T('The run dropped: what was traded kept') });
	} finally {
		V.writing = false;
	}
	const s = store.getView(VIEW_NS);
	V.readSig = s ? JSON.stringify(s) : null;
	return { refund: Math.max(0, back.delta[SILVER] || 0), goods: back.moves.reduce((a, m) => a + m.n, 0), packed: !!on.packLog };
}

/**
 * A stop ticked done. At a stop with quests handed in they are claimed
 * and the rewards recorded -- but one whose pick-one reward is not
 * remembered keeps its button, to be asked.
 */
export function markDone(on, k) {
	on.done = [...on.done, k];
	persist();
	cheer();
	const plan = V.shownPlan || planOfSail(on);
	if (!plan) return;
	const at = plan.stops.findIndex((s, i) => stopKey(s, i, plan.stops) === k || stopKeysWas(s, i, plan.stops).includes(k));
	// The voucher's cooldown runs from the press that drew it, and a
	// wait with no such press counts from the stop before it. Which stop
	// it was rides along, so a leg timed with Arrived knows where from.
	on.lastTick = Date.now();
	if (at >= 0) on.lastAt = at;
	// A voucher counts only once the sailor says it was drawn (the
	// cockpit's Drawn press), which starts its cooldown there.
	persist();
	// The clock is told where the ship really is: the legs still ahead
	// are counted from now rather than from an estimate made before the
	// ship left, so a run that ran late does not chime early all the way
	// to the end.
	if (at >= 0) passedStop(at, runMarks(plan, legsOf(plan.stops), ledgerOf(plan.stops, legsOf(plan.stops))), plan.stops.length);
	const stop = plan.stops[at];
	const list = ((stop && stop.quests) || []).filter(x => x.step.what !== 'hunt').map(x => x.q).filter(q => !questDone(q) && rewardOf(q));
	if (list.length) {
		store.claimQuests(list.map(q => ({ id: q.id, delta: rewardOf(q), key: periodKey(cadenceOf(q)) })), T('Handed in {what} at {where}', { what: list.length === 1 ? questTitle(list[0]) : T('{n} quests', { n: list.length }), where: stop.place ? stop.place.name : stop.wharf ? stop.wharf.at : isleOf(npcById.get(stop.npcId)) }));
		toast(T('{what} handed in — the rewards are in the bags', { what: list.length === 1 ? questTitle(list[0]) : T('{n} quests', { n: list.length }) }), true);
	}
}

/**
 * What the checklist keeps of a run while it is sailed: every stop as
 * the sheet draws it -- the trade, the count, the hold and the Parley
 * after it, a wharf call's sales and drops, the quests handed in there
 * by id -- and the run's own figures, so the sheet can be drawn again
 * on the Map, and the trip recorded from there, without the Barter tab
 * standing behind it. The profile's view bounds it (VIEW_CAPS), so
 * only what is drawn is kept: no hold object, no quest object.
 */
export function sailRecord(plan) {
	const num = v => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : 0);
	const questsOf = s => (s.quests || []).map(x => ({ id: x.q.id, what: x.step.what, who: x.step.who || '' }));
	// The rations on arrival, and what a wharf takes on: withRations' marks.
	const poolOf = x => (x.pool ? { pool: { left: num(x.pool.left), full: num(x.pool.full), take: num(x.pool.take), short: x.pool.short === true } } : {});
	const stops = plan.stops.map(x => ({ ...(x.npcId
		? { npcId: x.npcId, npc: x.npc, give: x.give, giveText: x.giveText, giveN: num(x.giveN), item: x.item, recv: num(x.recv), recvMin: num(x.recvMin), recvMax: num(x.recvMax), rangeMin: num(x.rangeMin ?? x.recvMin), rangeMax: num(x.rangeMax ?? x.recvMax), recvText: x.recvText, times: num(x.times), parley: num(x.parley), weightAfter: num(x.weightAfter), level: num(x.level), chain: num(x.chain), quests: questsOf(x) }
		: x.wait ? { wait: num(x.wait), waitAt: x.waitAt, weightAfter: num(x.weightAfter), chain: num(x.chain) }
		: x.quest ? { quest: true, hunt: x.hunt ? String(x.hunt) : null, place: { name: x.place.name, who: x.place.who || '', x: num(x.place.x), y: num(x.place.y) }, weightAfter: num(x.weightAfter), chain: num(x.chain), quests: questsOf(x) }
			: { wharf: { name: x.wharf.name, at: x.wharf.at, x: num(x.wharf.x), y: num(x.wharf.y) }, dropped: (x.dropped || []).map(d => ({ item: d.item, n: num(d.n) })), loads: (x.loads || []).map(l => ({ item: l.item, n: num(l.n) })), ...(x.toBag ? { toBag: x.toBag.map(d => ({ item: d.item, n: num(d.n) })) } : {}), ...(x.fromBag ? { fromBag: x.fromBag.map(d => ({ item: d.item, n: num(d.n) })) } : {}), sale: x.sale ? { n: num(x.sale.n), total: num(x.sale.total), levels: (x.sale.levels || []).map(num), items: (x.sale.items || []).map(i => ({ item: i.item, n: num(i.n), total: num(i.total) })) } : null, weightAfter: num(x.weightAfter), chain: num(x.chain), quests: questsOf(x), ...(x.refill ? { refill: true } : {}) }), ...poolOf(x) }));
	const legs = legsOf(plan.stops);
	const book = ledgerOf(plan.stops, legs);
	return {
		stops,
		loaded: (plan.loaded || []).map(l => ({ item: l.item, n: num(l.n) })),
		bagLoaded: (plan.bagLoaded || []).map(l => ({ item: l.item, n: num(l.n) })),
		bagFromHold: (plan.bagFromHold || []).map(l => ({ item: l.item, n: num(l.n) })),
		weightStart: num(plan.weightStart),
		bought: (plan.bought || []).filter(b => b.n > 0).slice(0, 40).map(b => ({ item: b.item, n: num(b.n), each: num(b.each || (b.total && b.n ? b.total / b.n : 0)) })),
		cost: num(plan.cost), silver: num(plan.silver), net: num(plan.net), trades: num(plan.trades), parleyUsed: num(plan.parleyUsed),
		questsHome: (plan.questsHome || []).map(x => ({ id: x.q.id, what: x.step.what, who: x.step.who || '' })),
		chains: (plan.order || []).map(c => ({ name: isleShort(npcById.get(c.rungs[0].npcId)) || c.rungs[0].npc, top: c.top })),
		goal: V.goal, item: V.goal === 'material' ? itemNow() || '' : '',
		time: runTime(legs, book) || '', port: V.port
	};
}

/**
 * The checklist laid again from what the islands paid.
 *
 * The run's stops were written down once, at cast-off, and a count
 * tapped on the way -- Sokota paid three, not two -- laid the plan
 * again on the tab and left the checklist standing as it was: the
 * cockpit and the Map went on saying the old counts and the old
 * weights all the way to the end. So whenever the plan is laid with a
 * new set of answers, the record is written again from it. The ticks
 * are kept -- they are keyed by place, not by position -- and a stop
 * put in or taken out by the new laying is simply there or not.
 */
export function syncSail(plan) {
	const on = sailing();
	if (!on || !plan || !plan.stops || !plan.stops.length) return;
	const laidFor = JSON.stringify(on.seen || {});
	if (on.laidFor === laidFor) return;
	// Quest stops ticked before the new laying keep their tick by place:
	// laid again, a quest stop can move among the stops and answer to a
	// new name, and the tick stayed behind on the old one.
	const oldStops = Array.isArray(on.stops) ? on.stops : [];
	const questPlaces = new Set(oldStops.filter((s, k) => s.quest && s.place && ticked(on.done, s, k, oldStops)).map(s => s.place.name));
	// What has been sailed stays as it was sailed. Laid again from the
	// cast-off with the new counts, the run can reorder or add stops
	// before the ship's place -- a call to sell a good loaded at the
	// start, put in ahead of the call already made -- and the ticks and
	// the hold were then read against a route nobody sailed. So the new
	// laying is taken from the last stop ticked on; where it no longer
	// passes there, the run is kept as it is.
	const rec = sailRecord(plan);
	let last = -1;
	oldStops.forEach((s, k) => { if (ticked(on.done, s, k, oldStops)) last = k; });
	if (last >= 0) {
		const key = stopKey(oldStops[last], last, oldStops);
		const j = rec.stops.findIndex((s, i) => stopKey(s, i, rec.stops) === key);
		if (j < 0) { on.laidFor = laidFor; persist(); return; }
		rec.stops = [...oldStops.slice(0, last + 1), ...rec.stops.slice(j + 1)];
		// And what was loaded before casting off stays what was loaded:
		// the hold is written from it, and a new laying's load is goods
		// still in the storage behind the ship.
		for (const k of ['loaded', 'bagLoaded', 'bagFromHold', 'weightStart', 'bought', 'cost']) if (k in on) rec[k] = on[k];
	}
	Object.assign(on, rec, { laidFor });
	// A quest stop the new laying puts in, whose quests were all handed
	// in already -- "All done" hands them in before the counts are said
	// -- is a stop already made: ticked, not left standing at the end.
	const done = new Set(on.done);
	on.stops.forEach((s, k) => {
		if (!s.quest) return;
		const qs = hydrate(s.quests);
		if (s.place && questPlaces.has(s.place.name)) done.add(stopKey(s, k, on.stops));
		else if (qs.length && qs.every(x => x.q && questDone(x.q))) done.add(stopKey(s, k, on.stops));
	});
	on.done = [...done];
	persist();
}

/**
 * What a run already cast off may take out of the harbour's storage:
 * what it loaded there, what it put in the bag there, and what its
 * calls back pick up -- and nothing more of any good that waits there.
 *
 * Saying what an island paid lays the run again from the cast-off, and
 * that laying was free to load again. Big Stone Slabs ticked aboard
 * before casting off, and four more still in the storage at Iliya: told
 * that Louruve paid two, not three, the new laying wanted nine slabs,
 * the checklist took its load from it, and the hold was written four
 * slabs that never left the storage -- with the stops after Louruve
 * counting on eighteen Round Knives out of ten. The storage is behind
 * the ship once it sails, so the laying is held to what came out of it.
 */
export function castOffCaps(on, dock) {
	if (!on || !Array.isArray(on.stops)) return null;
	const cap = new Map();
	for (const name of Object.keys(dock || {})) if (levelOf(name) !== null) cap.set(name, 0);
	for (const l of [...(on.loaded || []), ...(on.bagLoaded || []), ...on.stops.flatMap(s => s.loads || [])]) cap.set(l.item, (cap.get(l.item) || 0) + (Number(l.n) || 0));
	return cap;
}

/**
 * The shore goods a run already cast off has to hand: what it bought at
 * the Market before casting off, and no more. The same laying again at a
 * count said on the way was free to buy more -- three hundred Grilled
 * Bird Meat bought, four hundred planned after the tap -- and the stops
 * after it counted on goods nobody bought, the record then charging the
 * silver for them. Goods taken off the sailor's own pile are the pile's
 * to say, and left alone.
 */
export function castOffLand(on, orders) {
	if (!on || !Array.isArray(on.bought) || !on.bought.length || (orders && orders.landFrom === 'stock')) return null;
	const cap = new Map();
	for (const b of on.bought) cap.set(b.item, (cap.get(b.item) || 0) + (Number(b.n) || 0));
	return cap;
}

/** The quests a kept stop names, with the quest itself put back. */
function hydrate(list) {
	return (list || []).map(x => { const q = quests.find(y => y.id === x.id); return q ? { q, step: { what: x.what, who: x.who } } : null; }).filter(Boolean);
}

/** The run being sailed, as a plan the recorder and the sheet can read. */
export function planOfSail(on) {
	if (!on || !Array.isArray(on.stops) || !on.stops.length || !on.stops.some(s => s.npcId && s.give)) return null;
	// A stop traded another number of times than the run said -- ten
	// where it said seven -- is read at the count the sailor gave: the
	// hold, the Parley and the record all follow it.
	const did = on.did || {};
	const stops = on.stops.map(s => {
		const n = s.npcId ? Number(did[s.npcId]) || 0 : 0;
		const redone = n > 0 && n !== s.times ? { times: n, planned: s.times, parley: Number(s.parley) > 0 && s.times > 0 ? s.parley * n / s.times : s.parley } : {};
		return { ...s, ...redone, quests: hydrate(s.quests) };
	});
	return { stops, loaded: on.loaded || [], bagLoaded: on.bagLoaded || [], bagFromHold: on.bagFromHold || [], weightStart: on.weightStart || 0, bought: on.bought || [], cost: on.cost || 0, parleyUsed: on.parleyUsed || 0, questsHome: hydrate(on.questsHome), silver: on.silver || 0, net: on.net || 0, trades: on.trades || 0 };
}

/**
 * A checklist whose run is no longer the one on screen.
 *
 * The checklist belongs to a run by its key -- the board, the chains
 * ticked, the harbour -- and the natural thing to do at the end of a
 * run is to change one of those before pressing Record: tell the app
 * the board was refreshed, untick the chains, move to the next harbour.
 * The key moved, the checklist stopped answering to the screen, and
 * nothing said it was still there; the next "Sail this run" wrote over
 * it, and a trip ticked off in full was never recorded at all.
 *
 * It is all still in hand -- the stops as they were sailed, the ticks,
 * what the islands paid -- so it is offered back: record it, or let it
 * go, before anything else is sailed.
 */
// Either the run on screen is another run, or there is no run on screen
// at all -- "Refreshed in game" leaves the checklist's key standing and
// the board empty, so nothing is drawn and there is no Record to press.
export const stranded = () => (V.sail && Array.isArray(V.sail.done) && V.sail.done.length && planOfSail(V.sail)
	&& (!sailing() || !V.shownPlan || !V.shownPlan.stops || !V.shownPlan.stops.length) ? V.sail : null);

export function strandedHTML() {
	const on = stranded();
	if (!on) return '';
	const plan = planOfSail(on);
	const n = plan.stops.filter((s, k) => ticked(on.done, s, k, plan.stops)).length;
	if (!n) return '';
	return `<div class="barter-shut stranded"><b>${T('A run you sailed is not recorded yet')}</b> — ${n === 1
		? T('{n} stop of it is ticked off, and the board has moved on since. It is all still here.', { n })
		: T('{n} stops of it are ticked off, and the board has moved on since. It is all still here.', { n })}
		<button class="chip tiny primary" data-act="barter-record-stranded" title="${T('Put the trip in the Inventory as it was sailed — one Undo takes it back')}">${T('Record it')} →</button>
		<button class="chip tiny" data-act="barter-sail-drop" title="${T('Drop the checklist; nothing is recorded')}">${T('let it go')}</button></div>`;
}

/**
 * The run as the recorder must read it: the one that was sailed.
 *
 * `shownPlan` is laid again from the Inventory on every redraw, so it
 * is the run as it would be planned *now* -- and by the time a sailor
 * presses Record they have been away for half an hour, said what three
 * islands paid, and perhaps put a count right by hand. Any of that
 * lays a different run: different counts, and a wharf call that moves
 * by one island. The checklist's ticks are named after the frozen
 * stops (`sailing.stops`), so a call that moved takes its tick with
 * it -- the sale at it was simply not recorded, and the silver went
 * missing.
 *
 * So the recorder reads the run that was ticked, and the live one only
 * where there is no frozen copy to read.
 */
export function sailedPlan() {
	const on = sailing();
	return (on && planOfSail(on)) || V.shownPlan;
}

/** The route the run being sailed draws on the chart, or null --
 *  built from the kept stops each time, since the fragment is longer
 *  than the profile keeps a string. */
/** The islands of the run being sailed, in order, as the chart lists a
 *  route: to tell whether the chart holds it. Null when none is. */
export function sailIds() {
	const plan = planOfSail(sailing());
	return plan ? [...new Set(plan.stops.filter(s => s.npcId).map(s => s.npcId))] : null;
}

export function sailChart() {
	const on = sailing();
	const plan = planOfSail(on);
	return plan ? chartFragmentOf(chartData(plan.stops, on.item || '')) : null;
}

/**
 * The run sheet for the Map: the checklist as the Barter tab's run
 * popup draws it -- the rail, the trades, the hold and the Parley
 * after each stop, the wharf calls, the quests handed in, Done -- for
 * the run being sailed, when the chart holds the same islands in the
 * same order. Null when there is no such run, and the Map draws its
 * plotting list instead. `chartIds` are the chart's islands in order;
 * a row's head then steps the chart to it.
 */
export function runSheetHTML(chartIds = []) {
	const on = sailing();
	const plan = planOfSail(on);
	if (!plan) return planSheetHTML(chartIds);
	const legs = legsOf(plan.stops);
	const book = ledgerOf(plan.stops, legs);
	const chainTags = (on.chains || []).map(c => `<span class="run-chain-tag" style="--tier:${TIER(c.top)}"><i></i>${esc(c.name)}<em>L${c.top}</em></span>`).join('');
	const head = `<div class="map-run-head">
		<div class="map-run-title"><b>${on.goal === 'material' ? T('For {name}', { name: on.item ? esc(gameName(on.item)) : T('a material') }) : T('The run')}</b><span>${plan.stops.length === 1 ? T('{n} stop', { n: plan.stops.length }) : T('{n} stops', { n: plan.stops.length })}${on.net ? ` · ${FC(Math.round(on.net))}${on.cost ? ` ${T('net')}` : ''}` : ''}${on.time ? ` · ≈ ${esc(on.time)}` : ''}${book.short ? ` · <b class="warn">${T('{n} Parley short', { n: F(book.short) })}</b>` : ''}</span></div>
		${chainTags ? `<div class="run-seg-chains">${chainTags}</div>` : ''}
		${on.loaded && on.loaded.length ? `<details class="map-run-fold"><summary>${T('Loaded before casting off')} · ${on.loaded.length}</summary>${on.loaded.map(l => `<div class="run-leave-good">${img(l.item, 'row-icon sm')}<b>${F(l.n)}×</b>${esc(gameName(l.item))}</div>`).join('')}</details>` : ''}
	</div>`;
	return `${head}${cockpitHTML({ map: true })}`;
}

/**
 * The stop the cockpit stands at, for the chart to step to: its index,
 * the island, or -- for a call -- the wharf and how many islands come
 * before it, which is how the chart threads its calls. Null when no
 * run is being sailed or every stop is ticked.
 */
export function sailCurrent() {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	if (!plan) return null;
	const at = stopAt(plan, on);
	if (at < 0) return null;
	const s = plan.stops[at];
	return { at, npcId: s.npcId || null, wharfAt: s.wharf ? s.wharf.at : s.quest && s.place ? s.place.name : null, before: plan.stops.slice(0, at).filter(x => x.npcId).length };
}

/**
 * The chart stepped to a stop: the cockpit goes there too. `npcId`
 * names an island; a call is `before`, how many islands come before
 * it, and `wharfAt`. Answers whether the cockpit moved.
 */
export function sailJump({ npcId = null, wharfAt = null, before = -1 } = {}) {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	if (!plan) return false;
	const stops = plan.stops;
	let k = -1;
	if (npcId) k = stops.findIndex(s => s.npcId === npcId);
	else {
		let n = 0;
		for (let i = 0; i < stops.length && k < 0; i++) {
			const s = stops[i];
			if (s.npcId) { n++; continue; }
			if (n === before && !s.wait && (!wharfAt || (s.wharf && s.wharf.at === wharfAt) || (s.place && s.place.name === wharfAt))) k = i;
		}
	}
	if (k < 0) return false;
	const key = stopKey(stops[k], k, stops);
	if (V.cursor === key) return false;
	V.cursor = key;
	return true;
}

/** The trip recorded: one change, and a line in the log of runs. */
/**
 * What this run's trades opened, if they opened anything: the trade
 * route the count crossed a threshold for. Worth a second toast --
 * a route opening is the one thing the barter count is actually for,
 * and it happens on the sea while the player is looking at a checklist.
 */
function justOpened(before, after) {
	// The last threshold crossed, not the first: a long run can pass
	// two, and the newest route is the news.
	const rows = ROUTE_UNLOCKS.filter(r => r.opens && r.barters > before && r.barters <= after);
	return rows.length ? rows[rows.length - 1].opens : null;
}

export function recordTrip(plan, from, on = sailing(), { abandoned = false } = {}) {
	if (!on || !plan) return;
	const trip = tripAsSailed(plan, on, from);
	// What the run took and what it brought back, from the one honest
	// record of it: the change it made to the Inventory. Spent goods are
	// what had to be loaded, gained goods are what is in the storage
	// now. Kept so the day's boards can be read back one under the
	// other -- what went into the first, what came out of it, and so on.
	const moved = (sign, drop) => {
		const m = Object.fromEntries(Object.entries(trip.delta)
			.filter(([item, n]) => item !== drop && Math.sign(n) === sign && Math.abs(n) >= 1)
			.map(([item, n]) => [item, Math.abs(Math.round(n))]));
		// The shore goods bought and handed over went out as much as the
		// goods out of the storage did, though the Inventory never held
		// them.
		// Counted once: a shore good bought at the wharf is in the
		// Inventory now, and in the change already.
		if (sign < 0) {
			const shore = {};
			for (const [k, s] of plan.stops.entries()) if (s.npcId && levelOf(s.give) === null && ticked(on.done, s, k, plan.stops)) shore[s.give] = (shore[s.give] || 0) + Math.round(s.times * s.giveN);
			for (const [give, n] of Object.entries(shore)) m[give] = Math.max(m[give] || 0, n);
		}
		return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 20));
	};
	// Every stop ticked, compactly, so the run can be read back whole
	// from the history: the place, the trade, what it was said to pay.
	const prof = barterProfile();
	const perTrade = parleyOf(prof).perTrade;
	const parleySpent = Math.round(plan.stops.reduce((a, s, k) => a + (s.npcId && ticked(on.done, s, k, plan.stops) ? (Number(s.parley) > 0 ? Number(s.parley) : (Number(s.times) || 0) * perTrade) : 0), 0));
	const bookOf = ledgerOf(plan.stops, legsOf(plan.stops));
	const stopsLog = plan.stops.map((s, k) => {
		if (!ticked(on.done, s, k, plan.stops)) return null;
		const names = stopNames(s);
		if (s.npcId) return { k: 'n', id: s.npcId, p: names.place, w: names.who, g: s.give, gn: s.giveText, i: s.item, r: s.recvText, t: s.times, s: (on.seen || {})[s.npcId] || 0, c: Math.round(Number(s.parley) || 0), v: bookOf.rows[k] && bookOf.rows[k].voucher ? 1 : 0 };
		if (s.wharf) return { k: 'w', p: names.place, w: names.who, sale: s.sale && !ticked(on.kept, s, k, plan.stops) ? { n: Math.round(s.sale.n * 10) / 10, silver: Math.round(s.sale.total) } : null };
		if (s.wait) return { k: 'v', p: names.place, t: Math.round(s.wait) };
		return { k: 'q', p: names.place, w: names.who };
	}).filter(Boolean).slice(0, 300);
	const drawnOn = plan.stops.reduce((n, s, k) => n + (ticked(on.done, s, k, plan.stops) ? (bookOf.rows[k] && bookOf.rows[k].drawn) || 0 : 0), 0);
	const runs = [...(store.getProfile('runs', []) || []), {
		day: barterKey(), at: Date.now(), silver: trip.silver, cost: trip.spent || Math.round(plan.cost || 0), net: trip.silver - (trip.spent || 0), trades: trip.trades, parley: parleySpent, coins: Math.round(trip.delta[COIN] || 0), vouchers: drawnOn,
		stops: on.done.length, goal: on.goal || V.goal, item: on.goal ? on.item || '' : V.goal === 'material' ? itemNow() || '' : '',
		load: moved(-1, SILVER), got: moved(1, SILVER), layout: (boardNow().combo || {}).id || '',
		time: on.time || '', port: from ? from.name : '', chains: (on.chains || []).map(c => c.name).slice(0, 12), stops_: stopsLog,
		...(() => { const isles = []; let done = 0; plan.stops.forEach((s, k) => { if (ticked(on.done, s, k, plan.stops)) done++; if (s.npcId && Number.isFinite(s.chain)) (isles[s.chain] = isles[s.chain] || []).push(s.npcId); }); return done < plan.stops.length ? { cont: { ids: V.routes.ids.slice(0, 20), isles: isles.filter(Boolean), done, all: plan.stops.length } } : {}; })()
	}].slice(-60);
	// What the islands were seen to pay goes into the record, so the
	// counting can follow the sailor's own runs.
	const ratios = { ...(store.getProfile('ratios', {}) || {}) };
	const sevens = { ...(store.getProfile('sevens', {}) || {}) };
	for (const [k, s] of plan.stops.entries()) {
		if (!ticked(on.done, s, k, plan.stops) || !s.npcId) continue;
		const n = on.seen[s.npcId];
		if (n && s.recvMin !== s.recvMax) {
			const key = ratioKey(s);
			ratios[key] = { ...(ratios[key] || {}), [n]: ((ratios[key] || {})[n] || 0) + s.times };
		}
		const got = (on.got || {})[s.npcId];
		if (got) {
			const was = sevens[s.npcId] || {};
			const seen = { ...(was.seen || (was.item ? { [was.item]: 1 } : {})) };
			seen[got] = (seen[got] || 0) + 1;
			sevens[s.npcId] = { item: got, day: barterKey(), seen };
		}
	}
	// The barter quests count the trip's trades, and the count carries
	// over to the next run until the period turns. A quest made up is
	// not a quest handed in: its reward comes when its stop is ticked
	// Handed in, or it is claimed on the Quests tab -- it used to land
	// in the bags at Record, for quests the sailor had never taken. And
	// a run sailed with the quests left out counts none.
	const progress = { ...(store.getProfile('questProgress', {}) || {}) };
	const questsDone = { ...(store.getProfile('questsDone', {}) || {}) };
	const made = [];
	if (trip.trades > 0 && ordersNow().quests !== 'no') {
		const skipped = skippedToday();
		for (const q of quests) {
			if (!q.barters || questDone(q, questsDone) || skipped.includes(q.id)) continue;
			const key = periodKey(cadenceOf(q));
			progress[q.id] = { key, n: Math.min(q.barters, (progress[q.id] && progress[q.id].key === key ? progress[q.id].n : 0) + Math.round(trip.trades)) };
		}
	}
	// The career's totals move with the run, in the same change.
	const last = runs[runs.length - 1];
	const tally = store.tallied({ runs: 1, silver: last.silver, cost: last.cost, trades: last.trades, parley: last.parley, stops: last.stops, quests: Object.fromEntries(made.map(q => [q.id, 1])) });
	// Total Barters is the game's own lifetime count, and every exchange
	// on the run is one of them -- it is what opens the next trade route
	// and what the barter quests are counted against. It was typed in
	// once and then left to rot while the app watched the very trades it
	// counts go by, so a player who sailed with the checklist had to
	// remember to go and read the number out of the Barter Information
	// window again. It moves with the run now, and can still be typed
	// over when the two drift.
	const counted = trip.trades > 0
		? { barterCount: (Number(store.getProfile('barterCount', 0)) || 0) + Math.round(trip.trades) }
		: {};
	// The Parley the trip spent comes off the bar, and the vouchers it
	// drew on out of the bags. The figures tile has always said "74,032
	// spent from 1,000,000" -- and then the next run was laid against the
	// same million, because nothing wrote the answer down. The bar is
	// stamped with the barter day, so the reset fills it again.
	const bar = prof.parleyHeld > 0 ? Math.min(PARLEY.max, prof.parleyHeld) : PARLEY.max;
	// The vouchers drawn on are the ledger's: the ones the ticked stops
	// drew, whether the bar as typed needed them or not, never more
	// than are carried.
	const drawn = ordersNow().vouchers !== 'keep' ? Math.min(prof.vouchers, drawnOn) : 0;
	// Never nought: nought is how "nobody has said" is written.
	// A bar read off the game's window mid-run is the truer start: the
	// ledger counted from it, after the last stop ticked, is what is left.
	const lastTicked = plan.stops.reduce((m, st, k) => (ticked(on.done, st, k, plan.stops) ? k : m), -1);
	const fromWindow = on.parleyFix && lastTicked >= 0 && bookOf.rows[lastTicked] ? bookOf.rows[lastTicked].after : null;
	const parleyLeft = Math.max(1, Math.min(PARLEY.max, fromWindow !== null ? fromWindow : bar + drawn * PARLEY.voucher - parleySpent));
	const spentOf = parleySpent > 0 ? { parleyHeld: parleyLeft, parleyDay: barterKey(), ...(drawn ? { vouchers: prof.vouchers - drawn } : {}) } : {};
	// The hold has had the ticked stops written into it as they were
	// ticked: what is left to write is the rest.
	const rest = holdDiff({ delta: trip.delta, moves: netMoves(trip.moves) }, on.applied || NO_HOLD);
	const applied = on.applied || null;
	// The attempts the run spent on today's islands go into the same
	// change as its record: an Undo that gave back the hold and the
	// Parley but left the islands marked as traded laid the next plan on
	// a board with fewer chains than the sea still offers. What the page
	// had still to write is written first, so the change's "before" is
	// the board as it stood, not as it stood a quarter-second ago. (The
	// hold is not synced on the way: what is left to write of it was
	// worked out above, from the ticks as they stand.)
	flushView({ hold: false });
	noteUsed(plan, on);
	noteMatUsed(plan, on);
	// Abandoned, the run goes out in the same change as its record, as
	// abandonRun's does: one Undo brings both back, the run where it
	// stood. (Recorded, the run is done with; its Undo, on the results
	// strip, takes the ticks back too.)
	if (V.writeTimer) { clearTimeout(V.writeTimer); V.writeTimer = null; }
	if (abandoned) V.sail = null;
	const views = { views: { ...(store.getProfile('views', {}) || {}), [VIEW_NS]: viewNow() } };
	const viewKeys = { [VIEW_NS]: abandoned ? ['sail', 'board', 'matBoard'] : ['board', 'matBoard'] };
	V.writing = true;
	let entry;
	try {
		entry = store.applyTrip({ delta: rest.delta, moves: rest.moves, at: intoHold, profile: { runs, ratios, sevens, tally, ...counted, ...spentOf, questProgress: Object.keys(progress).length ? progress : null, questsDone: Object.keys(questsDone).length ? questsDone : null, ...views }, viewKeys, label: `${on.done.length === 1 ? T('Sailed a run: {n} stop', { n: on.done.length }) : T('Sailed a run: {n} stops', { n: on.done.length })}${trip.silver ? `, ${T('{silver} sold', { silver: FC(trip.silver) })}` : ''}` });
	} finally {
		V.writing = false;
	}
	{ const s = store.getView(VIEW_NS); V.readSig = s ? JSON.stringify(s) : null; }
	V.sail = null;
	// What it came to, for the results step to show until the next run is
	// cast off: the page would otherwise fall back to the plan the moment
	// the checklist went, with nothing said about where the silver went.
	bringUp('.barter-screen .steps');
	V.lastTrip = { entry: entry && entry.t, applied, goal: on.goal || V.goal, stops: on.done.length, trades: Math.round(trip.trades), silver: trip.silver, spent: trip.spent || 0, net: trip.silver - (trip.spent || 0), coins: Math.round(trip.delta[COIN] || 0), parley: parleySpent, vouchers: drawn, gave: moved(-1, SILVER), got: moved(1, SILVER) };
	setStep('results');
	V.cursor = null;
	V.skipped = new Set();
	V.packed = new Set();
	// The trip is in the book, so the clock that timed it is done.
	stopTimer();
	persist();
	// One toast, since a second would only paint over the first and take
	// its Undo with it -- and a route opening is news that belongs beside
	// what opened it.
	const opened = counted.barterCount ? justOpened(counted.barterCount - Math.round(trip.trades), counted.barterCount) : null;
	toast(`${on.done.length === 1 ? T('Recorded: {n} stop', { n: on.done.length }) : T('Recorded: {n} stops', { n: on.done.length })}${trip.silver ? ` · ${T('{silver} in silver', { silver: FC(trip.silver) })}` : ''}${trip.trades ? ` · ${trip.trades === 1 ? T('{n} barter, {all} in all', { n: F(Math.round(trip.trades)), all: F(counted.barterCount) }) : T('{n} barters, {all} in all', { n: F(Math.round(trip.trades)), all: F(counted.barterCount) })}` : ''}${made.length ? ` · ${T('{quests} made up', { quests: made.map(questTitle).join(', ') })}` : ''}${opened ? ` — ${T('{what} is open now', { what: opened })}` : ''}`, true);
}
