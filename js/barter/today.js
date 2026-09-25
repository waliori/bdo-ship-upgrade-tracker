// Today's runs: what the board has dealt, the day's boards and the week.

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img } from '../ui-bits.js';
import { barterProfile, combos } from '../ui-state.js';
import { barterKey, currentPlan } from '../clock.js';
import { npcById, ports } from '../barter_npcs.js';
import { levelOf } from '../barter.js';
import { parleyOf } from './plan.js';

/* ------------------------------------------------------------------ *
 * the days ahead: which boards take a good, and where
 * ------------------------------------------------------------------ */

const takenCache = new Map();

/**
 * How many of the forty boards have an island that takes this good,
 * and the harbour most of those islands are nearest -- so a good left
 * behind can be left where the boards to come will want it.
 */
function takenOn(good) {
	if (!combos) return null;
	if (takenCache.has(good)) return takenCache.get(good);
	const near = npc => ports.reduce((a, p) => (Math.hypot(p.x - npc.x, p.y - npc.y) < Math.hypot(a.x - npc.x, a.y - npc.y) ? p : a));
	let n = 0;
	const harbours = new Map();
	for (const c of combos.combos) {
		const here = c.offers.filter(o => o[1] === good);
		if (!here.length) continue;
		n++;
		for (const o of here) {
			const npc = npcById.get(o[0]);
			if (!npc) continue;
			const p = near(npc);
			harbours.set(p.name, (harbours.get(p.name) || 0) + 1);
		}
	}
	const best = [...harbours].sort((a, b) => b[1] - a[1])[0];
	const out = { n, of: combos.combos.length, harbour: best ? best[0] : '' };
	takenCache.set(good, out);
	return out;
}

/** The note on a good kept: the boards that take it, and where. */
export function takenNote(good) {
	const t = takenOn(good);
	if (!t) return '';
	if (!t.n) return levelOf(good) === 7 ? '' : `<span class="faint">${T('no board takes it further')}</span>`;
	return `<span class="faint">${T('taken on {n} of {of} boards', { n: t.n, of: t.of })}${t.harbour ? T(', mostly near {harbour}', { harbour: esc(gameName(t.harbour)) }) : ''}</span>`;
}

/**
 * The day's boards, one under the other: what each run took out of the
 * storage, what it put back, and the totals across the lot.
 *
 * A sailor with a full Parley bar gets two or three boards out of it
 * before the refill, and the question at the second one is always the
 * same -- what do I load now, and what have I actually gained today?
 * The plan at the top of the page answers the first for the board in
 * front of you; this answers the second, and it can only be honest
 * about boards already sailed: the next refresh deals a different
 * board, and what it will want loaded is not knowable until it is
 * looked at.
 */
export function todayHTML() {
	const today = barterKey();
	const runs = (store.getProfile('runs', []) || []).filter(r => r.day === today);
	if (!runs.length) return '';
	const goods = m => Object.entries(m || {}).sort((a, b) => b[1] - a[1]);
	const line = (m, none) => {
		const list = goods(m);
		if (!list.length) return `<span class="faint">${none}</span>`;
		return list.map(([item, n]) => `<span class="day-good">${img(item, 'row-icon xs')}<b>${F(n)}</b>${esc(gameName(item))}</span>`).join('');
	};
	const sum = key => {
		const out = {};
		for (const r of runs) for (const [item, n] of Object.entries(r[key] || {})) out[item] = (out[item] || 0) + n;
		return out;
	};
	const totals = runs.reduce((a, r) => ({
		trades: a.trades + r.trades, parley: a.parley + r.parley,
		silver: a.silver + r.silver, cost: a.cost + r.cost, stops: a.stops + r.stops
	}), { trades: 0, parley: 0, silver: 0, cost: 0, stops: 0 });
	const bar = parleyOf(barterProfile()).bar;
	// The refill is the region's own: the clock knows which, and every
	// region the app has been told about keeps the UTC one so far.
	const plan = currentPlan();
	const refill = `${String(plan.barter).padStart(2, '0')}:00 ${plan.zone === 'UTC' ? 'UTC' : plan.zone}`;
	const rows = runs.map((r, i) => `<div class="day-run">
		<span class="day-n">${i + 1}</span>
		<span class="day-what">${r.layout ? T('layout {id}', { id: esc(r.layout) }) : T('a board')}${r.goal === 'stock' ? ` · ${T('for the stock')}` : r.goal === 'coin' ? ` · ${T('for Crow Coins')}` : r.goal === 'material' && r.item ? ` · ${T('for {name}', { name: esc(gameName(r.item)) })}` : ''}<em>${r.trades === 1 ? T('{n} trade', { n: F(r.trades) }) : T('{n} trades', { n: F(r.trades) })} · ${T('{n} Parley', { n: F(r.parley) })}${r.silver ? ` · ${T('{silver} sold', { silver: FC(r.silver) })}` : ''}</em></span>
		<span class="day-side"><span class="day-k">${T('loaded')}</span>${line(r.load, T('nothing loaded'))}</span>
		<span class="day-side"><span class="day-k">${T('came back with')}</span>${line(r.got, T('nothing came back'))}</span>
	</div>`).join('');
	return `<section class="panel day-boards">
		<div class="panel-head">
			<h2 class="panel-title">${T('Today’s boards')}</h2>
			<span class="panel-sub">${runs.length === 1 ? T('one board') : T('{n} boards', { n: runs.length })} ${T('since the {time} refill', { time: esc(refill) })} · ${totals.trades === 1 ? T('{n} trade', { n: F(totals.trades) }) : T('{n} trades', { n: F(totals.trades) })} · ${T('{n} Parley of the {bar} the bar holds', { n: F(totals.parley), bar: F(bar) })}${totals.silver ? ` · ${T('{silver} net', { silver: FC(totals.silver - totals.cost) })}` : ''}</span>
		</div>
		<p class="panel-sub barter-caveat day-note">${T('What to load for the <b>next</b> board is in the run’s own sheet, under <b>Lay it out</b>: a refresh deals a different board, so what it will want cannot be known until you have looked at an island on it.')}</p>
		<div class="day-runs">${rows}</div>
		<div class="day-run day-total">
			<span class="day-n">Σ</span>
			<span class="day-what">${T('the day so far')}<em>${T('{n} stops', { n: F(totals.stops) })} · ${runs.length === 1 ? T('{n} board', { n: runs.length }) : T('{n} boards', { n: runs.length })}</em></span>
			<span class="day-side"><span class="day-k">${T('loaded in all')}</span>${line(sum('load'), T('nothing'))}</span>
			<span class="day-side"><span class="day-k">${T('gained in all')}</span>${line(sum('got'), T('nothing'))}</span>
		</div>
	</section>`;
}

/**
 * The runs sailed lately: the last seven days, silver and trades a
 * day, from the trips recorded off the checklist.
 */
export function weekHTML() {
	const runs = store.getProfile('runs', []) || [];
	if (!runs.length) return '';
	const days = [];
	const today = barterKey();
	for (let i = 6; i >= 0; i--) {
		const d = new Date(`${today}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - i);
		days.push(d.toISOString().slice(0, 10));
	}
	const byDay = new Map(days.map(d => [d, { silver: 0, cost: 0, trades: 0, runs: 0 }]));
	for (const r of runs) {
		const b = byDay.get(r.day);
		if (!b) continue;
		b.silver += r.silver; b.cost += r.cost; b.trades += r.trades; b.runs++;
	}
	const week = [...byDay.values()].reduce((a, b) => ({ silver: a.silver + b.silver, cost: a.cost + b.cost, trades: a.trades + b.trades, runs: a.runs + b.runs }), { silver: 0, cost: 0, trades: 0, runs: 0 });
	if (!week.runs) return '';
	const top = Math.max(1, ...[...byDay.values()].map(b => b.silver - b.cost));
	const bars = days.map(d => {
		const b = byDay.get(d);
		const net = b.silver - b.cost;
		const label = new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
		return `<div class="week-day${b.runs ? '' : ' none'}" title="${esc(label)}: ${b.runs ? (b.runs === 1 ? T('{silver} net, {trades} trades, {runs} run', { silver: FC(net), trades: b.trades, runs: b.runs }) : T('{silver} net, {trades} trades, {runs} runs', { silver: FC(net), trades: b.trades, runs: b.runs })) : T('no run recorded')}"><i style="height:${Math.max(2, Math.round(net / top * 40))}px"></i><span>${esc(label.slice(0, 2))}</span></div>`;
	}).join('');
	return `<section class="panel week">
		<div class="panel-head"><h2 class="panel-title">${T('The week')}</h2><span class="panel-sub">${week.runs === 1 ? T('{n} run recorded', { n: week.runs }) : T('{n} runs recorded', { n: week.runs })} · ${T('{silver} net', { silver: FC(week.silver - week.cost) })} · ${T('{n} trades', { n: F(week.trades) })}</span></div>
		<div class="week-bars">${bars}</div>
	</section>`;
}
