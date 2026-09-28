// The route: where goods can be left, the legs by water and their times,
// the quests on the way, the stops as the wharf step and the cockpit list
// them, a still of every leg, and the chart the route is drawn on.

import { esc, F, FC } from '../fmt.js';
import { T, said, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img } from '../ui-bits.js';
import { barterData, barterProfile } from '../ui-state.js';
import { barterKey, periodKey } from '../clock.js';
import { currentShip, shownHold } from '../ship.js';
import { npcById, ports, isleOf, whoOf, isleShort, TILES, TILE, MAX_ZOOM } from '../barter_npcs.js';
import { seaRoute, seaLeg } from '../searoute.js';
import { tileSrc } from '../map.js';
import { pathLength, legLengths, sailRange, fmtRange, fmtDistance } from '../sailing.js';
import { quests, cadenceOf } from '../quests.js';
import { questDone, wantedQuests } from '../screen-quests.js';
import { layQuests } from '../quest-places.js';
import { QUEST_CHOICES } from '../barter-orders.js';
import { levelOf } from '../barter.js';
import { parleyLedger } from '../parley-ledger.js';
import { weightOf } from '../barter-plan.js';
import { questIcon } from '../quest_icons.js';
import { bagRoom } from '../bag-shot.js';
import { wharves } from '../wharves.js';
import { V } from './state.js';
import { fleetSevens } from './fleet.js';
import { fromPort, sailCal, sailLag } from './board.js';
import { parleyNotes } from './cockpit.js';
import { aboardStock } from './hold.js';
import { ordersNow } from './plan.js';
import { sailing, stopKey, ticked, owesCount, paidAsk } from './sail.js';
import { VOUCHER, legsCache } from './view.js';

// Where goods can be left on the way: the harbours with a storage
// keeper beside the wharf manager. The Morning Light pair are named
// here by their pier, and the wharf's storage list names them by the
// storage keeper's town (BDOCodex: Doodol keeps Moodle Village's storage
// beside the Dami Pier wharf, Goyoung Nopsae Pass's beside Dallae Pier).
export const STASHES = ['Velia', 'Port Epheria', 'Iliya Island', 'Ancado Inner Harbor', "Oquilla's Eye", 'Dami Pier', 'Dallae Pier'];
export const STORE_NAMES = { 'Dami Pier': "Nampo's Moodle Village", 'Dallae Pier': "Nopsae's Byeot County" };
// The Inventory's storage each of them is: the Moodle Village keeper is
// the one the Inventory has always called Nampo.
const STORE_KEYS = { 'Dami Pier': 'Nampo', 'Dallae Pier': "Nopsae's Byeot County" };
export const storeOf = at => STORE_KEYS[at] || at;
// Every wharf's Load Cargo moves goods between the bag and the ship,
// storage keeper or not; and the bag, when the sailor sails that way.
export const docks = wharves.filter(w => w.kind === 'wharf');
// The Inventory window's two bars are what the sailor gives; what the
// bag takes is worked out from them (bag-shot.js).
export const bagSet = () => store.getProfile('bag', null) || { on: false, now: 0, max: 0, used: 0, slots: 0 };
export const bagNow = () => { const b = bagSet(); const r = bagRoom(b); return b.on && r.lt > 0 ? { free: r.lt, slots: r.slots } : null; };
export const stashes = STASHES.map(at => wharves.find(w => w.kind === 'wharf' && w.at === at)).filter(Boolean);

/** The legs of a run, bent round the land: distance and time. */
/** Where a stop is: the quest's spot, the wharf, or the island -- a
 *  wait is at the island whose barter it waits to make. */
export const placeOf = s => s.place || s.wharf || npcById.get(s.npcId || s.waitAt);

/**
 * The waits put into the run as stops of their own.
 *
 * Where the Parley bar cannot pay for a barter and a voucher is still on
 * its cooldown, the ship waits at that island until one can be drawn.
 * That is a thing the sailor does -- stands still for an hour, with a
 * clock on it, and may well decide to go home instead -- so it is a
 * stop on the list like any other, just before the barter it waits
 * for, rather than a note under it. The ledger is drawn again with the
 * waits in, and a wait long enough to need a second one (a barter
 * dearer than a quarter) gets its own, up to a few rounds.
 */
export function withWaits(stops, weightStart = 0) {
	let out = stops;
	for (let round = 0; round < 3; round++) {
		const book = ledgerOf(out, legsOf(out));
		if (!book.rows.some((r, k) => r.wait > 0 && !out[k].wait)) return out;
		const next = [];
		out.forEach((s, k) => {
			const r = book.rows[k];
			if (r.wait > 0 && !s.wait && s.npcId) {
				const before = next.length ? next[next.length - 1].weightAfter : weightStart;
				next.push({ wait: r.wait, waitAt: s.npcId, weightAfter: before, chain: s.chain, hold: s.hold });
			}
			next.push(s);
		});
		out = next;
	}
	return out;
}

export function legsOf(stops) {
	const from = ports.find(p => p.id === V.port) || null;
	const pts = [...(from ? [from] : []), ...stops.map(placeOf).filter(Boolean)];
	if (pts.length < 2) return { total: 0, legs: [], time: '', timeWith: () => '' };
	// Bending the legs round the land is the dear part of a redraw, and
	// the same stops bend the same way, so the answer is kept by them.
	const ck = pts.map(p => `${p.x},${p.y}`).join(';');
	let bent = legsCache.get(ck);
	if (!bent) {
		const world = seaRoute(pts.map(p => ({ x: p.x, y: p.y })));
		bent = { total: pathLength(world), legs: legLengths(world) };
		if (legsCache.size > 200) legsCache.clear();
		legsCache.set(ck, bent);
	}
	const { total, legs } = bent;   // one leg a stop after the first, bends included
	const me = currentShip();
	// Every figure in use was measured -- the default is timed legs too --
	// so the range is the narrow one.
	const measured = true;
	// What each leg costs apart from the sailing, where timed legs have
	// shown one: on every leg, so on the whole run once a leg.
	const lag = sailLag();
	const range = m => { const [a, b] = sailRange(m, me.speed.sea, sailCal(), measured); return [a + lag, b + lag]; };
	const n = legs.filter(m => m > 0).length;
	const [fast, slow] = (([a, b]) => [a + lag * n, b + lag * n])(sailRange(total, me.speed.sea, sailCal(), measured));
	// `timeWith` is the same range with minutes stood still added --
	// the waits the Parley ledger puts in for a voucher's cooldown.
	return { total, legs, from, time: fmtRange(fast, slow), mid: (fast + slow) / 2, timeOf: m => fmtRange(...range(m)), secondsOf: m => { const [a, b] = range(m); return (a + b) / 2; }, timeWith: min => fmtRange(fast + min * 60, slow + min * 60) };
}

/** How far a barter quest has come in its period. */
function questProgressOf(q) {
	const p = (store.getProfile('questProgress', {}) || {})[q.id];
	return p && p.key === periodKey(cadenceOf(q)) ? p.n : 0;
}

/**
 * The quests handed in along a run, under `mode` -- 'no', 'yes' (the
 * dailies and weeklies: deliveries, talks, the barter quests counted
 * off the run's trades) or 'hunts' (those and the hunts whose grounds
 * a leg passes). The sailor is taken to have accepted them already.
 * The answer is the run's stops again with a stop put in wherever a
 * taker lies a short way off the route, and for each stop what is
 * handed in there; `home` is handed in at the harbour before casting
 * off; `off` the quests the run cannot take in, and why.
 */
export function questPlan(stops, mode, hold, weightStart = 0) {
	const none = { stops, at: () => [], home: [], off: [], skipped: [], count: 0, added: 0 };
	if (mode === 'no' || !stops.length) return none;
	const from = fromPort();
	const pts = [...(from ? [from] : []), ...stops.map(s => s.wharf || npcById.get(s.npcId))];
	if (pts.some(p => !p)) return none;
	const skipped = skippedToday();
	const live = quests.filter(q => !questDone(q) && !skipped.includes(q.id) && (cadenceOf(q) === 'daily' || cadenceOf(q) === 'weekly') && (mode === 'hunts' || !q.monster));
	const o = from ? 1 : 0;
	const trades = pts.map((p, i) => (i < o ? 0 : stops[i - o].times || 0));
	// On the way only: no stop put in, except for a taker asked for by name.
	const laid = layQuests(live, pts.map(p => ({ x: p.x, y: p.y })), { trades, progress: questProgressOf, detour: mode === 'near' ? 0 : 8000, forced: new Set(pulledToday()) });
	const out = [], at = [];
	let home = [], weight = weightStart, chain = 0;
	laid.route.forEach((e, r) => {
		if (e.fixed && e.i < o) { home = e.steps; return; }
		if (e.fixed) {
			const s = stops[e.i - o];
			s.quests = e.steps;
			out.push(s); at.push(e.steps); weight = s.weightAfter; chain = s.chain;
		} else {
			out.push({ quest: true, hunt: e.hunt || null, place: { x: e.x, y: e.y, name: e.place, who: e.who }, quests: e.steps, weightAfter: weight, chain, hold });
			at.push(e.steps);
		}
	});
	return {
		stops: out,
		at: k => at[k] || [],
		home, off: laid.off,
		skipped: skipped.map(id => quests.find(q => q.id === id)).filter(q => q && !questDone(q)),
		count: home.length + at.reduce((a, l) => a + l.length, 0),
		added: out.filter(s => s.quest).length,
		trades: trades.reduce((a, n) => a + n, 0)
	};
}

/** The quests left out of today's runs by hand, and the ones taken in
 *  by hand whatever the way round; both lapse at the refill. */
export const skippedToday = () => (V.questSkip.day === barterKey() ? V.questSkip.ids : []);
export const pulledToday = () => (V.questPull.day === barterKey() ? V.questPull.ids : []);

export const questTitle = q => q.name.replace(/^(\[[^\]]+\]\s*)+/, '');
/** The quest's name as the way to its row on the Quests tab. */
const questLink = q => `<button class="linky run-quest-name" data-act="view" data-id="quests" data-quest="${esc(q.id)}" title="${esc(said(q.where))}${q.note ? ` — ${esc(said(q.note))}` : ''} · ${T('open on the Quests tab')}">${questIcon(q) ? `<img class="quest-pip" src="${esc(questIcon(q))}" alt="" loading="lazy">` : ''}${esc(questTitle(q))}</button>`;
export const questWanted = () => new Set(wantedQuests().map(q => q.id));

/** A barter quest's count, as it stands and as this run leaves it.
 *  `trades` is what the whole run makes, `made` what the stops ticked
 *  Done have made already: those count now, since the game counts a
 *  barter when it is dealt, and the rest are still to come. */
function questCount(q, trades, made = 0) {
	const have = questProgressOf(q) + made;
	const left = Math.max(0, trades - made);
	const period = cadenceOf(q) === 'weekly' ? T('this week') : T('today');
	if (have >= q.barters) return T('{n} of {of} {period} · made up', { n: F(Math.min(have, q.barters)), of: F(q.barters), period });
	return `${T('{n} of {of} {period}', { n: F(have), of: F(q.barters), period })}${left ? made ? ` · ${T('{n} more this run', { n: F(left) })}` : ` · ${T('this run adds {n}', { n: F(left) })}` : ''}`;
}

/** The trades the stops ticked Done on the checklist have made so far,
 *  over the whole run -- these rows may be one segment of it. */
export function tradesDone(on, stops) {
	const full = on && Array.isArray(on.stops) && on.stops.length ? on.stops : stops;
	return full.reduce((a, s, k) => a + (s.npcId && ticked(on.done, s, k, full) ? Number(s.times) || 0 : 0), 0);
}

/** One quest handed in at a stop: the quest, its taker, its cadence,
 *  and the way to record it. */
export function questChip(x, wanted, trades = 0, made = 0) {
	const { q, step } = x;
	const done = questDone(q);
	const hunt = step.what === 'hunt';
	return `<span class="run-quest${hunt ? ' hunt' : ''}${wanted.has(q.id) ? ' wanted' : ''}${done ? ' done' : ''}">
		<i>${hunt ? '🎯' : '📜'}</i><b>${done ? T('done') : hunt ? T('hunt') : T('hand in')}</b>${questLink(q)}<small>${hunt ? esc(said(q.where).replace(/^[^—]*—\s*/, '')) : `${esc(gameName(step.who))} · ${esc(cadenceOf(q) === 'weekly' ? T('weekly') : cadenceOf(q) === 'daily' ? T('daily') : T('once'))}`}${q.barters ? ` · ${esc(questCount(q, trades, made))}` : ''}</small>
		<span class="run-quest-acts">${done || hunt ? '' : `<button class="chip tiny" data-act="quest-claim" data-quest="${esc(q.id)}" title="${T('Record the reward as claimed')}">${T('claimed')}</button>`}<button class="map-x" data-act="barter-quest-skip" data-quest="${esc(q.id)}" title="${T('Leave this quest out of today\'s runs')}" aria-label="${T('Leave this quest out')}">×</button></span>
	</span>`;
}

/** A quest the run cannot take in, and why. */
function questOff(x) {
	const { q, step } = x;
	const why = x.why === 'far' ? T('{who} at {place} · {dist} off the way', { who: esc(gameName(step.who)), place: esc(gameName(step.place)), dist: esc(fmtDistance(x.dist * 0.25)) })
		: x.why === 'grounds' ? (Number.isFinite(x.dist)
			? T('the {monster} grounds · {dist} off the way', { monster: esc((q.monster && q.monster.replace(/-/g, ' ')) || ''), dist: esc(fmtDistance(x.dist * 0.25)) })
			: T('the {monster} grounds lie off the way', { monster: esc((q.monster && q.monster.replace(/-/g, ' ')) || '') }))
			: `${esc(questCount(q, x.adds))} · ${T('{n} more after it', { n: F(x.left) })}`;
	return `<span class="run-quest off"><i>📜</i>${questLink(q)}<small>${why}</small>${x.why === 'far' || x.why === 'grounds' ? `<span class="run-quest-acts"><button class="chip tiny" data-act="barter-quest-pull" data-quest="${esc(q.id)}" title="${T('Put a stop in for it today, whatever the way round')}">${T('take it in')}</button></span>` : ''}</span>`;
}

/** A quest left out by hand, and the way to take it back in. */
function questSkipped(q) {
	return `<span class="run-quest off"><i>📜</i>${questLink(q)}<small>${T('left out today')}</small><span class="run-quest-acts"><button class="chip tiny" data-act="barter-quest-unskip" data-quest="${esc(q.id)}">${T('take it in')}</button></span></span>`;
}

/** The line in the sheet's head: what the run takes in. */
export function questsLine(qp, mode) {
	if (mode === 'no') return '';
	const bits = [T('<b>{n}</b> handed in on the way', { n: qp.count })];
	if (qp.added) bits.push(qp.added === 1 ? T('{n} stop put in', { n: qp.added }) : T('{n} stops put in', { n: qp.added }));
	if (qp.off.length) bits.push(T('{n} off the way', { n: qp.off.length }));
	return `<span class="run-quests-line" title="${T('Under the orders: {orders}', { orders: esc(said((QUEST_CHOICES.find(([k]) => k === mode) || QUEST_CHOICES[0])[1])) })}">📜 ${bits.join(' · ')}</span>`;
}

/** The quests handed in at the harbour before casting off, and the
 *  ones the run cannot take in. */
export function questsPanels(qp, from) {
	const wanted = questWanted();
	const home = qp.home.length && from ? `<section class="panel run-list run-quests-home"><div class="panel-head"><h2 class="panel-title">${T('Quests at {port}', { port: esc(gameName(from.name)) })}</h2><span class="panel-sub">${T('handed in before casting off')}</span></div><div class="run-quests">${qp.home.map(x => questChip(x, wanted)).join('')}</div></section>` : '';
	const offN = qp.off.length + qp.skipped.length;
	const off = offN ? `<details class="panel run-list run-quests-off"><summary class="panel-head"><h2 class="panel-title">${T('Quests off the way')}</h2><span class="panel-sub">${T('{n} not taken in by this run · open to take one in', { n: offN })}</span></summary><div class="run-quests">${qp.off.map(questOff).join('')}${qp.skipped.map(questSkipped).join('')}</div></details>` : '';
	return home + off;
}

export const n1 = v => F(Math.round(v * 10) / 10);
export const TIER = lv => `var(--tier-${Math.max(1, Math.min(7, lv || 1))})`;

/**
 * The stops of a run as a timeline: island or wharf, the leg to it,
 * what changes hands, what is left ashore or sold, and the hold after
 * it against the weight limit. `k0` numbers the first stop; `board`
 * is set when a [Level 7] is the record's, though the island may pay
 * another of its four.
 */
/** The [Level 7] goods an island pays, from the whole table. */
function seventhsOf(npcId) {
	const out = [];
	for (const e of barterData || []) {
		if (levelOf(e.name) !== 7) continue;
		if ((e.sources || []).some(x => x.npc_id === npcId)) out.push(e.name);
	}
	return out.sort();
}

/**
 * The Parley ledger for these stops, the clock read off the legs: how
 * far into the run each stop is, at the middle of the leg's range.
 */
export function ledgerOf(stops, legs) {
	const prof = barterProfile();
	const pause = ordersNow().pause || { isle: 0, call: 0 };
	const at = [];
	let t = 0;
	stops.forEach((s, k) => {
		const m = legs && legs.from ? legs.legs[k] : k > 0 && legs ? legs.legs[k - 1] : null;
		if (m != null && legs.secondsOf) t += legs.secondsOf(m) / 60;
		at[k] = t;
		t += (s.wait ? 0 : (s.npcId ? pause.isle : pause.call) || 0) / 60;
	});
	return parleyLedger(stops, { held: prof.parleyHeld, vouchers: prof.vouchers, use: ordersNow().vouchers !== 'keep', minutesAt: k => at[k] || 0 });
}

/** How long the run takes, the waits for a voucher's cooldown included. */
export const runTime = (legs, book) => (book && book.waited ? legs.timeWith(book.waited) : legs.time);

/** What pressing a stop done is called, by the sort of stop it is. */
export const doneLabel = s => (s.wait ? T('Waited — voucher drawn') : s.wharf ? (s.loads && s.loads.length ? (s.sale ? T('Loaded and sold') : T('Loaded')) : T('Called here')) : s.hunt ? T('Hunted here') : s.quest ? T('Handed in') : T('Traded here'));

/**
 * Which of its four [Level 7]s an island has paid, run after run: a
 * count per good, and the one it pays most. An island's layout names
 * one of the four and the island hands over whichever it likes, so the
 * count is the only way to know which to expect.
 */
function sevensSeen(npcId) {
	const e = (store.getProfile('sevens', {}) || {})[npcId];
	if (!e) return null;
	const seen = e.seen && Object.keys(e.seen).length ? e.seen : e.item ? { [e.item]: 1 } : {};
	const total = Object.values(seen).reduce((a, b) => a + b, 0);
	if (!total) return null;
	const [item, n] = Object.entries(seen).sort((a, b) => b[1] - a[1])[0];
	return { seen, total, item, n };
}
/** The [Level 7] a stop is shown paying: the one tapped on this run,
 *  else the one the island has paid you more than half the time (seen
 *  at least twice), else the one it paid the fleet more than half the
 *  time (seen at least three times), else the plan's. */
export function sevenOf(s, on = sailing()) {
	if (!s || !s.npcId || levelOf(s.item) !== 7) return s ? s.item : '';
	const said = on && (on.got || {})[s.npcId];
	if (said) return said;
	const k = sevensSeen(s.npcId);
	if (k && k.total >= 2 && k.n * 2 > k.total) return k.item;
	const f = fleetSevens(s.npcId);
	if (!k && f && f.total >= 3) {
		const [item, n] = Object.entries(f.seen).sort((a, b) => b[1] - a[1])[0];
		if (n * 2 > f.total && seventhsOf(s.npcId).includes(item)) return item;
	}
	return s.item;
}

/** Which of its four [Level 7]s an island may pay, said after the one
 *  shown -- on the board's own runs only. */
export function fourNote(s, board) {
	if (!board || levelOf(s.item) !== 7) return '';
	const on = sailing();
	if (on && (on.got || {})[s.npcId]) return ` — ${T('as you said it paid')}`;
	const k = sevensSeen(s.npcId);
	if (!k) return T(', or another of the island’s four');
	const shown = sevenOf(s, on);
	return T(', or another of the island’s four — it paid this {n} of {total} times', { n: F(k.seen[shown] || 0), total: F(k.total) });
}

/** What happens at a stop: the exchange at an island, the loads, the
 *  goods left and the sale at a wharf, nothing at a quest stop. */
export function stopDid(s, board = false) {
	if (s.quest) return '';
	// A wait trades nothing: it stands still for a voucher's cooldown.
	if (s.wait) return `<div class="run-trade">${img(VOUCHER, 'row-icon sm')}<span>${T('Wait {n} min', { n: F(s.wait) })} — ${T('the voucher’s cooldown, then one is drawn and the run goes on')}</span></div>`;
	if (s.wharf) return `${bagMovesHTML(s)}${s.loads && s.loads.length ? `<div class="run-leave"><span class="run-leave-k">${T('Loads from storage')}</span>${s.loads.map(d => `<span class="run-leave-good">${img(d.item, 'row-icon sm')}<b>${n1(d.n)}×</b>${esc(gameName(d.item))}</span>`).join('')}</div>` : ''}${s.dropped.length ? `<div class="run-leave"><span class="run-leave-k">${T('Leaves in storage')}</span>${s.dropped.map(d => `<span class="run-leave-good">${img(d.item, 'row-icon sm')}<b>${n1(d.n)}×</b>${esc(gameName(d.item))}</span>`).join('')}</div>` : ''}${s.sale ? `<div class="run-sell">${T('sells {n} {what} here for {silver}', { n: n1(s.sale.n), what: s.sale.levels && s.sale.levels.length === 1 ? `[Level ${s.sale.levels[0]}]` : T('goods'), silver: FC(Math.round(s.sale.total)) })}</div>` : ''}`;
	return `<div class="run-trade">${img(s.give, 'row-icon sm')}<span>${esc(s.giveText)}× ${esc(gameName(s.give))}</span><span class="run-arrow">→</span><span class="run-to" style="--tier:${TIER(levelOf(s.item))}"><i></i>${esc(s.recvText)}× ${esc(gameName(sevenOf(s)))}${fourNote(s, board)}</span><span class="run-got"><span class="run-times">×${s.times}</span>${img(sevenOf(s), 'row-icon sm')}</span></div>`;
}

/**
 * What a stop on the checklist asks besides Done: the count an island
 * that pays a range paid, which of its four [Level 7]s it handed over,
 * and whether a wharf call's goods were sold there or kept aboard.
 */
export function stopAsks(s, k, stops, on, { paid = true } = {}) {
	const key = stopKey(s, k, stops);
	const ask = paid ? paidAsk(s, on.seen[s.npcId]) : '';
	let got = '';
	if (s.npcId && levelOf(s.item) === 7) {
		const four = seventhsOf(s.npcId);
		const k = sevensSeen(s.npcId), likely = sevenOf(s, { got: {} });
		const said = (on.got || {})[s.npcId];
		// Your own share, and the fleet's beside it: the record names one
		// of the four and the game pays any, so what sailors were paid is
		// the only guide to which to expect.
		const f = fleetSevens(s.npcId);
		if (four.length > 1) got = `<span class="run-paid"><span>${T('got')}</span>${four.map(name => {
			const pct = k ? Math.round(((k.seen[name] || 0) / k.total) * 100) : null;
			const fleet = f ? Math.round(((f.seen[name] || 0) / f.total) * 100) : null;
			const title = [gameName(name), k ? T('paid you {n} of {total} times', { n: F(k.seen[name] || 0), total: F(k.total) }) : '', f ? T('paid the fleet {n} of {total} times', { n: F(f.seen[name] || 0), total: F(f.total) }) : ''].filter(Boolean).join(' — ');
			return `<button class="chip pay${said === name ? ' active' : !said && name === likely ? ' likely' : ''}" data-act="barter-got" data-npc="${s.npcId}" data-item="${esc(name)}" title="${esc(title)}">${img(name, 'row-icon sm')}${pct !== null ? `<i class="pay-pct">${pct}%</i>` : ''}${fleet !== null ? `<i class="pay-fleet" aria-label="${esc(T('the fleet: {pct}%', { pct: fleet }))}">⚓${fleet}%</i>` : ''}</button>`;
		}).join('')}</span>`;
	}
	// A wharf call that sells: whether the [Level 7]s were sold there.
	// Sold, the silver goes to the pouch and the goods are gone; kept,
	// they go into the Inventory with the rest of the trip.
	let sold = '';
	if (s.wharf && s.sale && s.sale.n > 0) {
		const kept = ticked(on.kept, s, k, stops);
		sold = `<label class="inline-check run-sold${kept ? ' kept' : ''}" title="${T('Untick if the goods were not sold here — they go into the Inventory instead of the silver into the pouch')}"><input type="checkbox" data-act="barter-sold" data-k="${esc(key)}"${kept ? '' : ' checked'}> ${kept ? T('kept aboard — into the Inventory') : T('sold — {silver} to the pouch', { silver: FC(Math.round(s.sale.total)) })}</label>`;
	}
	return `${ask}${got}${sold}`;
}

/**
 * What the sailor changed on the route, said at its head: the islands
 * taken off, each with a way back, the stops moved, and one press to
 * have the planner's route again.
 */
export function routeEditBar(plan) {
	const moved = Object.keys(V.routeEdit.nudge).length;
	const tripsMoved = (V.routeEdit.trips || []).length ? 1 : 0;
	if (!V.routeEdit.skip.length && !moved && !tripsMoved) return `<p class="route-edit-help">${T('Move a stop sooner or later with ↑ ↓, or skip an island: the route is laid again round your change — a stop never goes ahead of the one that makes its goods.')}</p>`;
	const off = V.routeEdit.skip.map(id => `<button class="chip tiny" data-act="barter-route-unskip" data-npc="${id}" title="${T('Put this island back on the route')}">↺ ${esc(isleShort(npcById.get(id)) || String(id))}</button>`).join('');
	const whole = (plan.skippedWhole || []).length;
	return `<div class="route-edit-bar"><span>${V.routeEdit.skip.length ? (V.routeEdit.skip.length === 1 ? T('{n} island taken off', { n: V.routeEdit.skip.length }) : T('{n} islands taken off', { n: V.routeEdit.skip.length })) : ''}${V.routeEdit.skip.length && moved ? ' · ' : ''}${moved ? (moved === 1 ? T('{n} stop moved', { n: moved }) : T('{n} stops moved', { n: moved })) : ''}${tripsMoved ? `${V.routeEdit.skip.length || moved ? ' · ' : ''}${T('the trips reordered')}` : ''}${whole ? ` · ${whole === 1 ? T('{n} chain not sailed at all', { n: whole }) : T('{n} chains not sailed at all', { n: whole })}` : ''}</span>${off}<span class="panel-spacer"></span><button class="chip tiny primary" data-act="barter-route-reset" title="${T('Every change taken back: the route the planner found shortest')}">↺ ${T('back to the optimised route')}</button></div>`;
}

/** A wharf call's goods into the sailor's bag and out of it again, at
 *  the wharf's Load Cargo. */
function bagMovesHTML(s) {
	const line = (k, list) => (list && list.length ? `<div class="run-leave bag"><span class="run-leave-k">${k}</span>${list.map(d => `<span class="run-leave-good">${img(d.item, 'row-icon sm')}<b>${n1(d.n)}×</b>${esc(gameName(d.item))}</span>`).join('')}</div>` : '');
	return line(T('Into your bag'), s.toBag) + line(T('Out of your bag, aboard'), s.fromBag);
}

/**
 * The row before the first stop: casting off, with what goes aboard at
 * the harbour and what the hold weighs as the lines are let go. Stop 1
 * on the Map is a barter, and the load taken on before it was written
 * only in a fold in the head -- so a sailor comparing the sheet's
 * weights with the game's found stop 1 a load short and went looking.
 */
export function castOffRow(plan, from) {
	const goods = [...(plan.loaded || []).map(l => ({ item: l.item, n: l.n, how: from ? T('from {town}', { town: gameName(from.name) }) : T('from the storage') })),
		...(plan.bought || []).filter(b => b.n > 0).map(b => ({ item: b.item, n: b.n, how: T('bought ashore') })),
		...(plan.taken || []).filter(t => t.n > 0).map(t => ({ item: t.item, n: t.n, how: T('from your pile') }))];
	// What is really in the hold that the run hands over: read off the
	// Inventory, not the plan.
	const stock = aboardStock();
	const inHoldNow = [...new Set(plan.stops.filter(x => x.npcId && x.give).map(x => x.give))].filter(g => stock[g] > 0).map(g => ({ item: g, n: stock[g] }));
	const bagged = [...(plan.bagLoaded || []), ...(plan.bagFromHold || [])].filter(l => l.n > 0);
	if (!goods.length && !inHoldNow.length && !(plan.weightStart > 0) && !(plan.spares || []).length && !bagged.length) return '';
	const w = shownHold((plan.stops[0] && plan.stops[0].hold) || currentShip().hold, plan.weightStart || 0);
	const heavy = w.state === 'heavy' || w.state === 'dead', over = w.state === 'over';
	return `<div class="run-stop start">
		<div class="run-rail"><i></i><b>⚓</b><i></i></div>
		<div class="run-main">
			<div class="run-stop-head"><b>${from ? T('Cast off from {port}', { port: esc(gameName(from.name)) }) : T('Cast off')}</b><span>${T('the hold as the lines are let go')}</span></div>
			${inHoldNow.length ? `<div class="run-leave"><span class="run-leave-k">${T('In the hold')}</span>${inHoldNow.map(g => `<span class="run-leave-good">${img(g.item, 'row-icon sm')}<b>${F(g.n)}×</b> ${esc(gameName(g.item))}</span>`).join('')}</div>` : ''}
			${(plan.spares || []).length && from ? `<div class="run-leave left-home"><span class="run-leave-k">${T('Left at {port} before casting off', { port: esc(gameName(from.name)) })}</span>${plan.spares.map(g => `<span class="run-leave-good">${img(g.item, 'row-icon sm')}<b>${F(g.n)}×</b> ${esc(gameName(g.item))}<span class="faint">${g.sell ? T('sold at the wharf') : T('into storage')}</span></span>`).join('')}</div>` : ''}
			${goods.length ? `<div class="run-leave"><span class="run-leave-k">${from ? T('Taken aboard at {port} before casting off', { port: esc(gameName(from.name)) }) : T('Taken aboard before casting off')}</span>${goods.map(g => `<span class="run-leave-good">${img(g.item, 'row-icon sm')}<b>${n1(g.n)}×</b> ${esc(gameName(g.item))} <em class="faint">· ${esc(g.how)}</em></span>`).join('')}</div>` : ''}
			${bagged.length ? `<div class="run-leave bag"><span class="run-leave-k">${from ? T('Into your bag at {port}, not the hold', { port: esc(gameName(from.name)) }) : T('Into your bag, not the hold')}</span>${bagged.map(g => `<span class="run-leave-good">${img(g.item, 'row-icon sm')}<b>${n1(g.n)}×</b> ${esc(gameName(g.item))}</span>`).join('')}<em class="faint">${T('{lt} LT of the {free} it takes', { lt: F(Math.round(bagged.reduce((a, g) => a + g.n * weightOf(g.item), 0))), free: F((plan.bag && plan.bag.free) || 0) })}</em></div>` : ''}
		</div>
		<div class="run-hold">
			<div><span>${T('hold')}</span><b class="${heavy ? 'warn' : over ? 'amber' : ''}">${esc(w.text)}</b></div>
			<div class="run-bar"><i style="width:${w.fill.toFixed(1)}%"></i><i class="over" style="width:${w.extra.toFixed(1)}%"></i><i class="heavy" style="width:${w.worse.toFixed(1)}%"></i></div>
		</div>
	</div>`;
}

/**
 * A still of the chart for one leg: the water from `from` to `to`,
 * the tiles at one level and the leg drawn over them, bent round the
 * land as the route sails it. A picture, not a map -- nothing to pan
 * or zoom -- so a sailor moving stops about on the wharf can see where
 * each leg goes without leaving the page. The legs are already bent
 * and kept by the time the route is drawn, so this costs the tiles.
 */
const SNAP = { w: 300, h: 120, pad: 16 };
function legSnap(from, to) {
	if (!from || !to || (from.x === to.x && from.y === to.y)) return '';
	const pts = seaLeg(from, to);
	const x0 = Math.min(...pts.map(p => p.x)), x1 = Math.max(...pts.map(p => p.x));
	const y0 = Math.min(...pts.map(p => p.y)), y1 = Math.max(...pts.map(p => p.y));
	const levels = Object.keys(TILES).map(Number).sort((a, b) => a - b);
	const lo = levels[0], hi = levels[levels.length - 1];
	// The exact zoom at which the leg fills the picture, padding and all;
	// the tiles are taken from the level at or just above it, for detail,
	// and the whole drawn smaller to fit. A long leg -- twenty kilometres
	// down a coast -- asks for less than the coarsest level there is, and
	// was drawn at that level full size, so it ran off the picture. A
	// short one is not blown up past the finest level.
	const need = MAX_ZOOM - Math.log2(Math.max(1e-9, (x1 - x0) / (SNAP.w - SNAP.pad * 2), (y1 - y0) / (SNAP.h - SNAP.pad * 2)));
	const z = Math.max(lo, Math.min(hi, Math.ceil(need)));
	const k = Math.min(1, Math.pow(2, need - z));   // drawn at k of the level's size
	const per = Math.pow(2, MAX_ZOOM - z);
	const vw = SNAP.w / k, vh = SNAP.h / k;          // the box at the level's own size
	const cx = (x0 + x1) / 2 / per, cy = (y0 + y1) / 2 / per;
	const ox = cx - vw / 2, oy = cy - vh / 2;
	const bnd = TILES[z];
	const tiles = [];
	for (let tx = Math.max(bnd.x0, Math.floor(ox / TILE)); tx <= Math.min(bnd.x1, Math.floor((ox + vw) / TILE)); tx++) {
		for (let ty = Math.max(bnd.y0, Math.floor(oy / TILE)); ty <= Math.min(bnd.y1, Math.floor((oy + vh) / TILE)); ty++) {
			tiles.push(`<img src="${tileSrc(z, tx, ty)}" alt="" loading="lazy" decoding="async" style="left:${Math.round(tx * TILE - ox)}px;top:${Math.round(ty * TILE - oy)}px">`);
		}
	}
	// The line in the picture's own pixels, so it keeps its weight
	// however far the tiles are scaled.
	const px = p => [((p.x / per - ox) * k).toFixed(1), ((p.y / per - oy) * k).toFixed(1)];
	const [ax, ay] = px(pts[0]), [ex, ey] = px(pts[pts.length - 1]);
	return `<div class="leg-snap" aria-hidden="true"><div class="leg-snap-in" style="width:${SNAP.w}px;height:${SNAP.h}px"><div class="leg-snap-tiles" style="width:${Math.ceil(vw)}px;height:${Math.ceil(vh)}px;transform:scale(${k.toFixed(4)})">${tiles.join('')}</div><svg viewBox="0 0 ${SNAP.w} ${SNAP.h}" width="${SNAP.w}" height="${SNAP.h}"><polyline points="${pts.map(p => px(p).join(',')).join(' ')}"/><circle class="from" cx="${ax}" cy="${ay}" r="4"/><circle class="to" cx="${ex}" cy="${ey}" r="5"/></svg></div></div>`;
}

export function stopRows(stops, legs, { k0 = 0, board = false, sailing = null, tag = null, notes = null, ledger = null, map = false, edit = false, snap = edit, trip = null, before = null } = {}) {
	const wanted = notes ? questWanted() : new Set();
	// The bar after each stop: the whole run's book when the caller
	// drew it up -- these stops may be one chain's segment of it, so
	// the book is read at the stop's place in the run -- else this
	// list's own, which starts where the list does.
	const book = ledger || ledgerOf(stops, legs);
	// On the checklist the barter quests count what the stops ticked
	// Done have dealt, so the count climbs as the run is sailed.
	const made = sailing ? tradesDone(sailing, stops) : 0;
	const check = (s, k) => {
		if (!sailing) return '';
		const key = stopKey(s, k, stops);
		const done = ticked(sailing.done, s, k, stops);
		const owed = !done && owesCount(s, sailing);
		return `<div class="run-check">${stopAsks(s, k, stops, sailing)}<button class="run-done${done ? ' on' : ''}${owed ? ' waits' : ''}" data-act="barter-stop-done" data-k="${esc(key)}" aria-pressed="${done}"${owed ? ` title="${T('Tap what it paid first')}"` : ''}><i>${done ? '✓' : ''}</i>${done ? T('Done') : owed ? T('paid…?') : doneLabel(s)}</button></div>`;
	};
	return stops.map((s, i) => {
		const k = k0 + i;
		const place = placeOf(s);
		const ahead = trip ? trip(s, k) : '';
		const m = legs.from ? legs.legs[k] : k > 0 ? legs.legs[k - 1] : null;
		const leg = m != null ? `<span class="run-leg">${esc(fmtDistance(m))} · ${esc(legs.timeOf(m))}</span>` : '';
		// The hold as the game shows it: goods and crew over the limit --
		// the ship's own where the stop was kept without one.
		const w = shownHold(s.hold || currentShip().hold, s.weightAfter);
		const over = w.state === 'over', heavy = w.state === 'heavy' || w.state === 'dead', dead = w.state === 'dead';
		const did = stopDid(s, board);
		return `${ahead}<div class="run-stop${s.wharf ? ' wharf' : ''}${s.quest ? ' quest' : ''}${s.sale ? ' sale' : ''}${i === stops.length - 1 ? ' last' : ''}${sailing && ticked(sailing.done, s, k, stops) ? ' done' : ''}" data-i="${k}"${s.npcId ? ` data-npc="${s.npcId}"` : ''}${map ? ' data-step-row' : ` data-act="barter-fly"${s.wharf ? ` data-wharf="${esc(s.wharf.at)}" data-before="${stops.slice(0, i).filter(x => x.npcId).length}"` : ''}`}>
			<div class="run-rail"><i></i><b>${k + 1}</b><i></i></div>
			<div class="run-main">
				<div class="run-stop-head">${s.wait ? `<span class="run-anchor" title="${T('A wait for a voucher’s cooldown, not a barter')}">⏳</span>` : s.wharf ? `<span class="run-anchor" title="${T('A pause at a wharf, not a barter')}">⚓</span>` : s.quest ? `<span class="run-anchor" title="${s.hunt ? T('A stop put in to hunt, not a barter') : T('A stop put in for a quest, not a barter')}">${s.hunt ? '🎯' : '📜'}</span>` : ''}${map ? `<button class="run-stop-fly" data-act="map-step" data-i="${k}" title="${T('Fly the chart here, and step to it')}">${esc(s.quest ? gameName(place.name) : s.wharf ? T('{at} wharf', { at: gameName(place.at) }) : gameName(isleOf(place)))}</button>` : `<b class="run-stop-name">${esc(s.quest ? gameName(place.name) : s.wharf ? T('{at} wharf', { at: gameName(place.at) }) : gameName(isleOf(place)))}</b>`}<span>${esc(s.quest ? gameName(place.who) : s.wharf ? gameName(place.name) : gameName(whoOf(place)))}</span>${tag ? tag(s) : ''}${leg}</div>
				${did}
				${edit && s.npcId ? `<div class="route-edit"><button class="chip tiny" data-act="barter-route-nudge" data-npc="${s.npcId}" data-by="-1" title="${T('Sail here one stop sooner')}" aria-label="${T('Sooner')}">↑</button><button class="chip tiny" data-act="barter-route-nudge" data-npc="${s.npcId}" data-by="1" title="${T('Sail here one stop later')}" aria-label="${T('Later')}">↓</button><button class="chip tiny warn" data-act="barter-route-skip" data-npc="${s.npcId}" title="${T('Take this island off the route: its chain stops before it, and the rest of the route is laid again without it')}">${T('skip')}</button></div>` : ''}
				${snap ? legSnap(i > 0 ? placeOf(stops[i - 1]) : k0 === 0 ? ports.find(p => p.id === V.port) : before ? placeOf(before) : null, place) : ''}
				${notes && notes.at(k).length ? `<div class="run-quests">${notes.at(k).map(x => questChip(x, wanted, notes.trades || 0, made)).join('')}</div>` : ''}
				${check(s, k)}
			</div>
			<div class="run-hold">
				<div><span>${T('hold')}</span><b class="${heavy ? 'warn' : over ? 'amber' : ''}" title="${T('Everything aboard, crew included, over the limit — as the game\'s Ship Info reads')}">${esc(w.text)}</b></div>
				<div class="run-bar"><i style="width:${w.fill.toFixed(1)}%"></i><i class="over" style="width:${w.extra.toFixed(1)}%"></i><i class="heavy" style="width:${w.worse.toFixed(1)}%"></i></div>
				${w.note ? `<div class="run-note${dead || heavy ? ' warn' : ''}">${w.note}</div>` : ''}
				${parleyBar(book, ledger ? k : k - k0, s)}
			</div>
		</div>`;
	}).join('');
}

/**
 * The Parley bar after a stop, drawn under the hold's: what is left of
 * the bar, the quarter a voucher put back, and the stop that would
 * stall for want of it.
 */
function parleyBar(book, k, s) {
	const row = book && book.rows[k];
	if (!row) return '';
	const low = row.after < row.max * 0.1;
	const spent = s.npcId && row.spent ? `−${F(row.spent)}` : '';
	const pn = parleyNotes(book, k, s);
	return `<div class="run-parley${pn.cls ? ` ${pn.cls}` : low ? ' low' : ''}">
		<div><span>${T('parley')}</span><b class="${row.short ? 'warn' : low ? 'amber' : ''}">${F(row.after)}</b>${spent ? `<small>${spent}</small>` : ''}</div>
		<div class="run-bar parley"><i style="width:${Math.min(100, row.pct).toFixed(1)}%"></i></div>
		${pn.note}
	</div>`;
}

/**
 * The chains that were ticked and did not get all the way up.
 *
 * A chain is three islands on its card and one island in the run, and
 * until now nothing said so out loud: the coins never arrived, the
 * goods came home half-climbed, and the only sign was a small "1 stops"
 * on a chip. The hold is nearly always the answer -- a fast run makes
 * no wharf call, so the climb stops where the next trade would not fit
 * under the limit -- and the answer is worth being exact about: what
 * the trade would have put on, against what was left.
 *
 * One line a chain, the first reason only. Everything after a chain
 * stops follows from its having stopped.
 */
export function cutsHTML(plan, pace, name) {
	if (!plan.cut || !plan.cut.length) return '';
	// Nothing left to hand over is, as often as not, two chains ticked on
	// one pile: the Golden Fish Scales Arehaza takes are the ones Starry
	// Midnight Port would have, and the chain that gets there second finds
	// the hold empty of them. Said as that, with where they went.
	const spentBy = c => {
		if (c.why !== 'nothing' || !c.give) return '';
		const s = plan.stops.find(x => x.npcId && x.give === c.give && x.chain !== c.chain && x.times > 0);
		return s ? isleShort(npcById.get(s.npcId)) || s.npc : '';
	};
	const lines = plan.cut.map(c => {
		const chain = plan.order[c.chain];
		const untick = chain && chain.id && !String(chain.id).includes('>') ? ` <button class="chip tiny" data-act="barter-chain" data-id="${esc(chain.id)}" title="${T('Take this chain off the run')}">${T('untick')}</button>` : '';
		// The island named is the one the chain could not deal at -- it
		// never got there, so it is never the island it "stopped at".
		const where = esc(isleShort(npcById.get(c.npcId)) || c.npc);
		const got = c.done
			? (c.of === 1 ? T('does {n} of {of} island', { n: F(c.done), of: F(c.of) }) : T('does {n} of {of} islands', { n: F(c.done), of: F(c.of) }))
			: T('never starts');
		// What it was that stopped the climb, in the words of the thing
		// that stopped it.
		const why = c.why === 'hold'
			? (pace === 'fast'
				? T('the trade at {where} puts on <b>{need} LT</b> and the hold has <b>{free}</b> left under the limit', { where, need: F(c.need), free: F(c.free) })
				: T('the trade at {where} puts on <b>{need} LT</b> and the hold has <b>{free}</b> left under the barter ceiling', { where, need: F(c.need), free: F(c.free) }))
			: c.why === 'share'
				? T('the hold is shared out among the chains ticked and there was none left for the climb past {where}', { where })
				: c.why === 'over'
					? T('the hold is <b>{over} LT</b> over the limit before it casts off, and a fast run makes no wharf call', { over: F(c.over) })
					: c.why === 'parley'
						? T('the Parley bar runs out before {where}', { where })
						: c.why === 'market'
							? (c.listed
								? T('{where} takes {icon}<b>{want}× {good}</b> a trade and the Central Market has only <b>{listed}</b> listed', { where, icon: img(c.good, 'row-icon xs'), want: F(c.want), good: esc(gameName(c.good)), listed: F(c.listed) })
								: T('the Central Market has no {icon}<b>{good}</b> listed right now, and {where} takes {want} a trade', { icon: img(c.good, 'row-icon xs'), good: esc(gameName(c.good)), where, want: F(c.want) }))
							: c.why === 'dealt'
							? T('another chain reaches {where} first, and an island deals once a run', { where })
							: c.why === 'floor'
								? T('{where} takes the {icon}<b>{good}</b> it made, and your floor keeps <b>{floor}</b> of every [Level {lv}] back — you hold only {owned}', { where, icon: img(c.good, 'row-icon xs'), good: esc(gameName(c.good)), floor: F(c.floor), lv: c.level, owned: F(c.owned) })
								: c.why === 'skipped'
									? T('you took {where} off the route', { where })
									: spentBy(c)
										? T('another ticked chain hands the {icon}<b>{good}</b> over first, at {other} — both start from the same goods, and there are not enough for two', { icon: img(c.give, 'row-icon xs'), good: esc(gameName(c.give)), other: esc(spentBy(c)) })
										: T('there is nothing left to hand over at {where}', { where });
		// The way out, where there is one: a pace that calls at a wharf,
		// or the weight to put ashore before casting off.
		// A good the Market is out of may still be in a storage of the
		// sailor's own: the orders can take it from there instead.
		if (c.why === 'market') {
			const own = c.held >= c.want
				? T('You keep <b>{n}</b> of it — {link}', { n: F(c.held), link: `<button class="chip tiny primary" data-act="barter-land-from" data-id="stock" title="${T('Start the land chains from the shore goods you already keep, instead of buying them')}">${T('take land goods from my storage')} →</button>` })
				: `<span class="run-cut-out">${T('it comes back when somebody lists some; the prices are asked again every half hour')}</span>`;
			return `<li><b>${name(chain)}</b> ${got} — ${why}. ${own}${untick}</li>`;
		}
		if (c.why === 'floor') {
			return `<li><b>${name(chain)}</b> ${got} — ${why}.${untick} <button class="chip tiny primary" data-act="barter-floor-clear" data-lvs="${c.level}" title="${T('Set that floor back to none, so the run may spend what it makes')}">${T('drop the Level {lv} floor', { lv: c.level })}</button></li>`;
		}
		const out = c.why === 'hold' || c.why === 'over' || c.why === 'share'
			? (pace === 'fast'
				? `<button class="chip tiny primary" data-act="barter-pace-set" data-id="steady" title="${T('Every attempt, still under the limit, a wharf call to leave the surplus')}">${T('full, never slower')} →</button>`
				: `<span class="run-cut-out">${T('leave <b>{n} LT</b> ashore before casting off', { n: F(Math.max(1, (c.need || 0) - (c.free || 0))) })}</span>`)
			: '';
		return `<li><b>${name(chain)}</b> ${got} — ${why}.${out ? ` ${out}` : ''}${untick}</li>`;
	}).join('');
	return `<div class="run-cut"><b>${plan.cut.length === 1 ? T('A ticked chain does not get to the top') : T('{n} ticked chains do not get to the top', { n: F(plan.cut.length) })}</b><ul>${lines}</ul></div>`;
}

/**
 * The three paces side by side for the chains ticked: what each brings
 * in, how long it takes, how many wharf calls it makes and how full the
 * hold gets -- so the choice is made on numbers, not on a word. The
 * one under way is marked; a press on another takes it.
 */
/** The chart button: the islands in order, what each is called at for,
 *  and the wharf calls between them, so the Map's route says the same
 *  as the run -- the same stops, in the same order, under the same
 *  numbers. A call is pinned to the count of islands sailed before it,
 *  which is where the chart threads it back in. */
/** The route a run draws on the chart: the islands, the trades, the calls. */
export function chartData(stops, pick) {
	if (!stops.length) return null;
	const isles = stops.filter(s => s.npcId);
	const ids = [...new Set(isles.map(s => s.npcId))];
	const trades = isles.map(s => [s.npcId, s.give, s.giveText, s.item, s.recvText, s.recvMin, s.giveN, s.times]);
	const calls = [];
	let n = 0;
	const questsAt = s => (s.quests || []).map(x => `${x.step.what === 'hunt' ? 'hunt' : x.step.who}: ${questTitle(x.q)}`);
	for (const s of stops) {
		if (s.npcId) { n++; continue; }
		if (s.quest) { calls.push(s.hunt ? [n, s.place.name, 'hunting grounds', s.place.x, s.place.y, [], 0, 0, questsAt(s)] : [n, s.place.who, s.place.name, s.place.x, s.place.y, [], 0, 0, questsAt(s)]); continue; }
		if (!s.wharf || (!s.dropped.length && !s.sale && !(s.loads && s.loads.length) && !(s.toBag && s.toBag.length) && !(s.fromBag && s.fromBag.length) && !questsAt(s).length)) continue;
		calls.push([n, s.wharf.name, s.wharf.at, s.wharf.x, s.wharf.y,
			s.dropped.map(d => [d.item, Math.round(d.n * 10) / 10]),
			s.sale ? Math.round(s.sale.n * 10) / 10 : 0,
			s.sale ? Math.round(s.sale.total) : 0,
			questsAt(s)]);
	}
	return { ids, pick: pick || '', trades, calls };
}

/** The route as a fragment for the chart's address (applyMapLink). */
export function chartFragmentOf(data) {
	if (!data || !data.ids.length) return null;
	const parts = [`r=${data.ids.join('.')}`];
	if (V.port) parts.push(`s=${V.port}`);
	if (data.pick) parts.push(`p=${encodeURIComponent(data.pick)}`);
	if (data.trades.length) parts.push(`x=${encodeURIComponent(JSON.stringify(data.trades))}`);
	if (data.calls.length) parts.push(`w=${encodeURIComponent(JSON.stringify(data.calls))}`);
	return parts.join(';');
}
