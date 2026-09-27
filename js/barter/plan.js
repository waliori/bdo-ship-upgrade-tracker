// The plan: what the day is for, the ladder, the ways of sailing and the
// orders, Before you sail, and the chains on offer with their runs alone.

import { esc, F, FC } from '../fmt.js';
import { T, said, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img, amountInput } from '../ui-bits.js';
import { barterData, barterProfile, SILVER } from '../ui-state.js';
import { barterKey, currentPlan } from '../clock.js';
import { currentShip } from '../ship.js';
import { npcById, ports, isleOf, isleShort } from '../barter_npcs.js';
import { sailSeconds, METRES_PER_PX } from '../sailing.js';
import { WAY_CHOICES, QUEST_CHOICES, SELL_CHOICES, LAND_CHOICES, VOUCHER_CHOICES, HOUR_CHOICES, AIM_CHOICES, NOTHING, STOCK_LEVELS, SAIL_PRESETS, sailPresetOf, readOrders, readStock, yardsticks } from '../barter-orders.js';
import { PARLEY, COIN, COIN_LEVEL, dailyCapacity, parleyPerTrade, levelOf, countBonus, withBonus } from '../barter.js';
import { goodsHeld, landHeld } from '../barter-plan.js';
import { pickShots } from '../barter-import.js';
import { readWords, shotLang, triage } from '../shot-reader.js';
import { chainRun } from '../barter-chains.js';
import { seaDist, routeLength } from '../barter-route.js';
import { bagFigures, bagRoom, BAG_OVER } from '../bag-shot.js';
import { toast, openDialog, closeDialog } from '../dialogs.js';
import { V } from './state.js';
import { boardNow, fromPort, sailCal } from './board.js';
import { everythingHeld } from './hold.js';
import { materialParts } from './material.js';
import { packingCount } from './packing.js';
import { silverParts } from './parts.js';
import { STASHES, STORE_NAMES, bagSet, stashes, n1, TIER, runTime, chartData, chartFragmentOf } from './route.js';
import { sailing } from './sail.js';
import { VOUCHER, persist } from './view.js';

/** The run as the wharf step lays it, laid now if nothing has: the
 *  same builder the tab draws with, so the chart and the tab agree. */
function planNow() {
	if (V.lastRoute && Date.now() - V.lastRoute.at < 1500) return V.lastRoute;
	if (!barterData || sailing()) return null;
	const me = currentShip();
	const b = boardNow();
	V.shownPlan = null;
	V.lastRoute = null;
	try {
		store.readingAsWas(V.sail && V.sail.applied, () => (V.goal === 'material' ? materialParts(me, b.data) : silverParts(me, b)));
	} catch { return null; }
	return V.lastRoute;
}

/** The chart fragment for the run as planned now, after a change made
 *  on the chart -- a stop moved or skipped, a chain unticked -- so the
 *  chart follows the plan. Null while a run is sailed or none is laid. */
export function plannedChart() {
	const r = planNow();
	return r && r.plan.stops.length ? chartFragmentOf(chartData(r.plan.stops, r.pick)) : null;
}

/**
 * The chart's side panel for a run that is planned and not yet cast
 * off: the wharf step's own route, with what is aboard and Cast off.
 * Null when the chart holds some other route, so the chart's own list
 * is drawn instead.
 */
export function planSheetHTML(chartIds) {
	const r = planNow();
	if (!r || !r.plan.stops.length) return null;
	const same = chartIds.length === r.ids.length && chartIds.every((id, i) => id === r.ids[i]);
	if (!same) return null;
	const plan = r.plan, legs = r.legs, book = r.book;
	const from = fromPort();
	const aboard = plan.order ? packingCount(plan, from, plan.order) : { all: 0, done: 0 };
	const figs = [plan.stops.length === 1 ? T('{n} stop', { n: plan.stops.length }) : T('{n} stops', { n: plan.stops.length }),
		plan.net ? FC(Math.round(plan.net)) : '', legs.total ? `≈ ${esc(runTime(legs, book))}` : ''].filter(Boolean).join(' · ');
	const ready = !!(V.shownPlan && V.shownPlan.stops && V.shownPlan.stops.length);
	return `<div class="map-run-head">
		<div class="map-run-title"><b>${T('The run · planned')}</b><span>${figs}</span></div>
	</div>
	<div class="map-plan-bar">
		<span class="map-plan-aboard">${aboard.all ? T('{n} of {of} aboard', { n: aboard.done, of: aboard.all }) : T('nothing to load')}</span>
		<button class="linky" data-act="barter-step" data-id="load">${T('Pack at the wharf')} ›</button>
		<span class="panel-spacer"></span>
		<button class="act" data-act="barter-cast-off"${ready ? '' : ' disabled'} title="${T('Each stop goes into the hold as you tick it; at the end the run is recorded')}">${img(currentShip().name, 'ship-ico')} ${T('Cast off')}</button>
	</div>
	<div class="map-plan-route">${r.segs}</div>`;
}

export function chartButton(stops, pick) {
	const data = chartData(stops, pick);
	if (!data) return '';
	const { ids, trades, calls } = data;
	const what = calls.length ? (calls.length === 1 ? T('{isles} islands and {calls} wharf call', { isles: ids.length, calls: calls.length }) : T('{isles} islands and {calls} wharf calls', { isles: ids.length, calls: calls.length })) : T('these stops');
	return `<button class="ghost-btn run-chart" data-act="barter-chart" data-ids="${ids.join('.')}" data-pick="${esc(pick || '')}" data-trades="${esc(JSON.stringify(trades))}" data-stash="${esc(JSON.stringify(calls))}" title="${T('Plot {what} on the Map, in this order', { what })}">${T('Draw it on the chart')}</button>`;
}

// The Parley the run can reach in all: what the bar holds now -- full
// after the refill, less when some was spent already -- and a quarter
// of a bar for each voucher carried. The ledger drawn beside each stop
// says where the vouchers are actually drawn on, and where the two-hour
// cooldown leaves a stop short.
// A bar nobody has typed a number into is taken as a full one. That is
// the only sensible guess -- most sailors plan at the start of a day,
// when it is full, and a run planned against nought would be no run at
// all -- but it is a guess, and a plan that spends a million Parley the
// sailor has not got is a plan that strands a ship halfway up a chain.
// So the figures say when the number is assumed rather than known.
export const parleyGuessed = prof => !(prof.parleyHeld > 0);

/** A barter list refreshed in game -- the trade goods or the ship
 *  materials, whichever -- fills the Parley bar again. */
export function parleyRefilled() {
	store.setProfileMany({ parleyHeld: PARLEY.max, parleyDay: barterKey() });
}
// Vouchers the sailor is keeping are not the run's to plan on, so the
// bar the planner budgets against leaves them out too.
export const parleyOf = prof => ({
	bar: (prof.parleyHeld > 0 ? Math.min(PARLEY.max, prof.parleyHeld) : PARLEY.max) + (ordersNow().vouchers === 'keep' ? 0 : prof.vouchers * PARLEY.voucher),
	held: prof.parleyHeld > 0 ? Math.min(PARLEY.max, prof.parleyHeld) : PARLEY.max,
	vouchers: ordersNow().vouchers === 'keep' ? 0 : prof.vouchers,
	perTrade: parleyPerTrade({ ...prof, kind: 'trade' })
});
export const stashAt = () => stashes.find(w => w.at === V.stash) || null;

/* ------------------------------------------------------------------ *
 * the sailing orders
 * ------------------------------------------------------------------ */

/**
 * The ticks handed back to the search, when they were the search's own.
 *
 * The best chains for a light, fast run are not the best chains for a
 * hold loaded past its limit: sailed the other way they can burn the
 * whole Parley bar half-way up four ladders and sell nothing at all.
 * So a change to how the run is sailed lets the search pick again --
 * unless the sailor ticked the chains themselves, in which case they
 * are theirs and stay.
 */
export function retickIfAuto() {
	const mine = V.proposed.best && V.proposed.best.ids.length === V.routes.ids.length && V.proposed.best.ids.every(id => V.routes.ids.includes(id));
	if (mine && V.routes.key) V.routesAuto = V.routes.key;
}

/** The orders as saved, cleaned; the cash-out preset until any are. */
const PRESET_KEYS = ['pace', 'hours', 'vouchers', 'buy', 'landFrom', 'way'];
export const ordersNow = () => readOrders(store.getProfile('orders', null));
export function setOrders(patch) {
	// An order a card sets, changed by hand: the card these orders now
	// match is the one chosen, or "my own way" when they match none.
	if (PRESET_KEYS.some(k => k in patch)) { V.ownWay = false; persist(); }
	store.setProfile('orders', readOrders({ ...ordersNow(), ...patch }));
}

/* ------------------------------------------------------------------ *
 * orders saved under a name
 * ------------------------------------------------------------------ */

/**
 * The sailor's own orders, saved under a name: the two presets answer
 * "cash out or build the stocks" and nothing else, and a sailor who
 * has settled on a way of running -- no quests, from Iliya, the shore
 * goods out of the pile, the stock up to Level 4 -- should not set it
 * up again every time the goal changes. What is saved is the whole
 * shape: the orders, the stock's targets and ceiling, and where the
 * run sails from and leaves goods.
 */
const savedNow = () => {
	const raw = store.getProfile('savedOrders', []);
	return Array.isArray(raw) ? raw.filter(x => x && typeof x.name === 'string' && x.orders).slice(0, SAVED_MAX) : [];
};
const SAVED_MAX = 12;

function saveOrders(name) {
	const clean = name.trim().slice(0, 40);
	if (!clean) return;
	const mine = savedNow().filter(x => x.name.toLowerCase() !== clean.toLowerCase());
	const entry = { name: clean, goal: V.goal, orders: ordersNow(), stock: { ...V.stockGoal, targets: { ...V.stockGoal.targets } }, port: V.port, stash: V.stash };
	store.setProfile('savedOrders', [entry, ...mine].slice(0, SAVED_MAX));
	toast(T('Saved as “{name}”', { name: clean }));
}

export function applySaved(name) {
	const it = savedNow().find(x => x.name === name);
	if (!it) return;
	store.setProfile('orders', readOrders(it.orders));
	if (it.stock) V.stockGoal = readStock(it.stock);
	if (it.goal === 'stock' || it.goal === 'silver' || it.goal === 'material') V.goal = it.goal;
	if (ports.some(p => p.id === Number(it.port))) V.port = Number(it.port);
	if (STASHES.includes(it.stash)) V.stash = it.stash;
	persist();
}

export function dropSaved(name) {
	store.setProfile('savedOrders', savedNow().filter(x => x.name !== name));
}

/** The strip of saved orders: what is kept, and the way to keep these. */
function savedHTML() {
	const mine = savedNow();
	const chips = mine.map(x => `<span class="saved-chip"><button class="chip tiny" data-act="barter-saved" data-name="${esc(x.name)}" title="${T('Set the whole day back to this — the ladder as well as the sailing')}${x.goal === 'stock' ? ` · ${T('a stock run')}` : ''}">${esc(x.name)}</button><button class="map-x" data-act="barter-saved-drop" data-name="${esc(x.name)}" aria-label="${T('Forget {name}', { name: esc(x.name) })}">×</button></span>`).join('');
	return `<div class="orders-saved">
		<span class="run-pick-k">${T('your own orders')}</span>
		${chips || `<span class="orders-sub">${T('none saved yet')}</span>`}
		<button class="chip tiny primary" data-act="barter-save" title="${T('Keep these orders, the targets and the ceiling under a name')}">＋ ${T('save these')}</button>
	</div>`;
}

export function askSaveOrders(then) {
	const host = openDialog(`
		<h2>${T('Save these orders')}</h2>
		<p class="dialog-copy">${T('The whole day is kept under the name — both steps of it: what the run is for and where the climb ends, what a wharf sells and what is kept back, the pace, the quests, the way round, where it sails from and leaves goods, and for a stock run the targets and the ceiling. Sailing under it again sets all of that back.')}</p>
		<input class="field save-name" maxlength="40" placeholder="${T('fill the low levels')}" aria-label="${T('A name for these orders')}">
		<div class="dialog-actions"><button class="act quiet" data-close>${T('Cancel')}</button><button class="act" data-save>${T('Save')}</button></div>`);
	const box = host.querySelector('.save-name');
	box.focus();
	const done = () => { saveOrders(box.value); closeDialog(); then(); };
	host.querySelector('[data-save]').addEventListener('click', done);
	box.addEventListener('keydown', e => { if (e.key === 'Enter') done(); });
}

/**
 * A rough sailing time for a chain on its own, for the yardstick on
 * its row: the legs by water from the start through its islands and
 * back to the nearest wharf. The run itself bends every leg round the
 * coast.
 */
function roughHours(c, from) {
	const me = currentShip();
	const pts = [...(from ? [from] : []), ...c.rungs.map(r => npcById.get(r.npcId)).filter(Boolean)];
	const last = pts[pts.length - 1];
	const back = last && stashes.length ? stashes.reduce((a, w) => (seaDist(last, w) < seaDist(last, a) ? w : a)) : null;
	if (back) pts.push(back);
	if (pts.length < 2) return 0;
	return sailSeconds(routeLength(pts) * METRES_PER_PX, me.speed.sea, sailCal()) / 3600;
}

/**
 * What the run comes to as the islands that pay a range decide it.
 *
 * The run is laid at the least -- every 2-3 paying 2 -- since what an
 * island paid is tapped at the island, and the checklist is laid again
 * from it. Before sailing that leaves one question: how much better
 * can it go? The same chains laid with every such island paying its
 * most answer it, and halfway is the middle of the two -- a run laid
 * at a count of 2.5 made fractions of goods the planner rounds its own
 * way, and came out above the most. Laid once more, so kept until the
 * run's inputs change.
 */
export function payRangeHTML(plan, opts, chosen, edits, seen, coining, stocking) {
	const open = plan.stops.filter(s => s.npcId && (s.rangeMax ?? s.recvMax) > (s.rangeMin ?? s.recvMin) && !(seen[s.npcId] > 0));
	if (!open.length || stocking) return '';
	const key = JSON.stringify([chosen.map(c => c.id), edits, seen, opts.orders, opts.pace, opts.hold, opts.stock, opts.dock, opts.parley, [...(opts.loadCap || [])]]);
	if (V.payMemo.key === key) return V.payMemo.html;
	const at = pick => {
		const s2 = { ...seen };
		for (const s of open) s2[s.npcId] = pick(s.rangeMin ?? s.recvMin, s.rangeMax ?? s.recvMax);
		return chainRun({ ...opts, seen: s2, chosen, ...edits });
	};
	const val = run => (coining ? withBonus(run.coins || 0, countBonus(barterProfile().barterCount).pct) : run.net || 0);
	const said = v => (coining ? `${F(Math.round(v))} ${T('coins')}` : FC(Math.round(v)));
	const most = at((a, b) => b);
	// The top rung is capped by its island's attempts, so an island that
	// pays more below it often buys no more silver -- it leaves more
	// goods over, carried home or left in storage. Said, or the three
	// figures read as the same run three times.
	const over = run => [...(run.kept || []), ...(run.stashed || [])].reduce((a, x) => a + (Number(x.n) || 0), 0);
	const mid = { v: (val(plan) + val(most)) / 2, trades: ((plan.trades || 0) + (most.trades || 0)) / 2, over: (over(plan) + over(most)) / 2 };
	const cell = (k, v, trades, left, cls = '') => `<span class="pay-range-cell${cls ? ` ${cls}` : ''}"><em>${k}</em><b>${said(v)}</b><small>${T('{n} trades', { n: F(Math.round(trades || 0)) })}${Math.round(left) ? ` · ${T('{n} goods left over', { n: F(Math.round(left)) })}` : ''}</small></span>`;
	const html = `<div class="pay-range"><span class="pay-range-k">${open.length === 1 ? T('{n} island on this run pays a range', { n: open.length }) : T('{n} islands on this run pay a range', { n: open.length })}</span>
		${cell(T('each pays its least'), val(plan), plan.trades, over(plan), 'on')}${cell(T('halfway'), mid.v, mid.trades, mid.over)}${cell(T('each pays its most'), val(most), most.trades, over(most))}
		<span class="pay-range-note">${T('The run is laid at the least; tap what each island paid as you sail and the rest is laid again from it.')}</span></div>`;
	V.payMemo = { key, html };
	return html;
}

/** Silver a Parley unit, short: 2.8m → "2.8m/u". */
export const perUnitText = v => (v > 0 ? T('{silver}/unit', { silver: FC(Math.round(v)) }) : '');
export const perHourText = v => (v > 0 ? T('{silver}/h', { silver: FC(Math.round(v)) }) : '');

/**
 * The orders bar: the preset, and the drawer of what it set -- which
 * levels a wharf sells, the floor kept back of each level, whether
 * land goods are bought, the pace, where goods are left, where the
 * run sails from.
 */
/**
 * How many goods the table has at each level -- fourteen at every
 * level from 1 to 4, more above -- so a target typed once can say what
 * it comes to in all. Read from the table, not written down, because
 * a patch that adds a good should not need this file changed.
 */
function kindsPerLevel() {
	if (V.kindsMemo && V.kindsMemo.of === barterData) return V.kindsMemo.at;
	const sets = new Map();
	const add = name => {
		const lv = levelOf(name);
		if (!lv) return;
		if (!sets.has(lv)) sets.set(lv, new Set());
		sets.get(lv).add(name);
	};
	for (const it of barterData || []) { add(it.name); for (const x of it.sources || []) add(x.give && x.give.name); }
	V.kindsMemo = { of: barterData, at: new Map([...sets].map(([lv, set]) => [lv, set.size])) };
	return V.kindsMemo.at;
}

/**
 * What a run banks toward the targets: the goods it ends holding less
 * the goods it started with, each counted only up to the target still
 * short. What it makes over a target is counted apart -- that is not
 * stock, it is next week's fuel, and saying so keeps the headline
 * honest.
 */
export function stockGains(plan, aboard) {
	const held = everythingHeld();
	const delta = new Map();
	const move = (name, n) => delta.set(name, (delta.get(name) || 0) + n);
	for (const [name, n] of goodsHeld(aboard)) move(name, -n);
	for (const l of plan.loaded) move(l.item, -l.n);
	for (const g of [...plan.kept, ...plan.stashed]) move(g.item, g.n);
	const byLevel = new Map();
	let total = 0, spare = 0;
	for (const [name, n] of delta) {
		if (n <= 1e-9) continue;
		const lv = levelOf(name);
		if (!lv) continue;
		const want = V.stockGoal.targets[lv] || 0;
		const short = Math.max(0, want - (held.get(name) || 0));
		const toward = Math.min(n, short);
		if (toward > 1e-9) { byLevel.set(lv, (byLevel.get(lv) || 0) + toward); total += toward; }
		spare += n - toward;
	}
	return { byLevel: [...byLevel].sort((a, b) => a[0] - b[0]), total: Math.round(total), spare: Math.round(spare) };
}

/**
 * How far off the targets still are, and how many days like this one
 * they would take. The Parley a day allows is what paces it -- the
 * board refreshes faster than a bar refills -- so the count is runs of
 * this size, turned into days at the day's own bar.
 */
export function aheadHTML(gains, plan, prof) {
	if (!gains) return '';
	const held = everythingHeld();
	const kinds = kindsPerLevel();
	let short = 0;
	for (const lv of STOCK_LEVELS) {
		const want = V.stockGoal.targets[lv] || 0;
		if (!want || lv > V.stockGoal.ceiling) continue;
		let mine = 0;
		for (const [name, n] of held) if (levelOf(name) === lv) mine += Math.min(n, want);
		short += want * (kinds.get(lv) || 0) - mine;
	}
	if (short <= 0) return `<p class="run-ahead full">${T('Every target is met. Raise them, lift the ceiling a level, or go back to {link} and start selling the pile.', { link: `<button class="linky" data-act="barter-goal" data-id="silver">${T('the silver run')}</button>` })}</p>`;
	// Nothing banked: either nothing is ticked, or what is ticked makes
	// only goods the targets already have enough of. The two want
	// different answers, so they get different sentences.
	if (!gains.total || !plan.parleyUsed) {
		return `<p class="run-ahead">${T('{n} goods short of the targets.', { n: F(short) })} ${plan.trades
			? T('What is ticked banks none of what is short — it makes goods already up to their target. Raise a target, or tick a chain that ends lower.')
			: T('Tick the chains to sail, or let the search fill them in.')}</p>`;
	}
	const day = dailyCapacity({ valuePack: prof.valuePack, vouchers: prof.vouchers, level: prof.level, crew: prof.crew });
	const runs = Math.ceil(short / gains.total);
	// A run is a board, so the day allows as many as the trade list
	// refreshes -- and no more than the Parley pays for.
	const perDay = Math.max(1, Math.min(day.lists.trade, Math.floor(day.parley / Math.max(1, plan.parleyUsed))));
	const days = Math.ceil(runs / perDay);
	// A storage counts slots, not weight: one to a kind, however many of
	// it. That is the limit a stock like this one actually runs into.
	const slots = STOCK_LEVELS.filter(lv => lv <= V.stockGoal.ceiling && (V.stockGoal.targets[lv] || 0) > 0).reduce((a, lv) => a + (kinds.get(lv) || 0), 0);
	return `<p class="run-ahead">${T('<b>{n}</b> goods short of the targets', { n: F(short) })} · ${runs === 1 ? T('<b>{n}</b> more run like this one', { n: F(runs) }) : T('<b>{n}</b> more runs like this one', { n: F(runs) })} · ${days === 1 ? T('about <b>{n}</b> day', { n: F(days) }) : T('about <b>{n}</b> days', { n: F(days) })} ${perDay === 1 ? T('at {n} board a day', { n: F(perDay) }) : T('at {n} boards a day', { n: F(perDay) })}${prof.barterCount ? ` · ${T('<b>{n}</b> barters by then', { n: F(prof.barterCount + runs * plan.trades) })}` : ''}${slots ? ` · ${T('the full stock is <b>{n}</b> storage slots, one to a kind', { n: F(slots) })}` : ''}</p>`;
}

/* ------------------------------------------------------------------ *
 * the plan: where today ends, how to sail it
 * ------------------------------------------------------------------ */

/** The head of one of the plan's three steps: what the day is for,
 *  what the game is showing, and the run itself. */
export function dayStep(n, title, sub = '', side = '') {
	return `<div class="day-step"><i>${n}</i><b>${title}</b>${sub ? `<span class="day-step-sub">${sub}</span>` : ''}<span class="panel-spacer"></span>${side}</div>`;
}

/**
 * What the day is for: the first question, because the answer decides
 * which list of the barter window is read next -- the forty layouts for
 * silver, a stock or coins, the material list for a material -- and so
 * which screenshot is asked for.
 */
export function goalCardsHTML() {
	const card = (id, icon, label, sub, reads) => `<button class="goal-card${V.goal === id ? ' on' : ''}" data-act="barter-goal" data-id="${id}" aria-pressed="${V.goal === id}">
		<span class="goal-card-top">${icon}<b>${label}</b></span>
		<span class="goal-card-sub">${sub}</span>
		<span class="goal-card-reads">${reads}</span>
	</button>`;
	const board = T('reads: the trade goods list');
	return `<div class="goal-cards" role="group" aria-label="${T('What the run is for')}">
		${card('silver', img(SILVER, 'goal-icon'), T('Silver'), T('The chains of today’s board, climbed and sold'), board)}
		${card('stock', '<span class="goal-emoji" aria-hidden="true">📦</span>', T('A stock'), T('The same board, sailed to fill the storage: nothing sold'), board)}
		${card('coin', img(COIN, 'goal-icon'), T('Crow Coins'), T('The same board, climbed to [Level 4] for the coin islands'), board)}
		${card('material', '<span class="goal-emoji" aria-hidden="true">⚓</span>', T('A material'), T('Ship materials, from the islands that deal them'), T('reads: the ship material list'))}
	</div>`;
}

/** The level the day's climbs end at, whatever the day is for. */
const topNow = () => (V.goal === 'stock' ? V.stockGoal.ceiling : V.goal === 'coin' ? COIN_LEVEL : V.climb || 7);

/**
 * The levels a wharf may be told to sell from. A rung is flipped by
 * moving that line, not by setting a rule of its own: told to sell a
 * level, the line drops to the lowest choice that takes it in; told to
 * keep one, it rises to the lowest choice above it. So flipping Level 4
 * to sold sells Level 3 as well, and the ladder says so.
 */
const SELL_LINES = SELL_CHOICES.map(([v]) => Number(v)).sort((a, b) => a - b);
export const sellFrom = lv => SELL_LINES.filter(v => v <= lv).pop() || SELL_LINES[0];
export const keepFrom = lv => SELL_LINES.find(v => v > lv) || NOTHING;

/** The levels a wharf sells under these orders, among those reached. */
const soldLevelsOf = (o, top) => [3, 4, 5, 6, 7].filter(lv => lv <= top && lv >= o.sell);

/** The day in a sentence: where the climb ends and what becomes of it. */
export function goalLine(o) {
	const top = topNow();
	if (V.goal === 'coin') return T('Climb to Level {lv}, cash it in for Crow Coins', { lv: COIN_LEVEL });
	const sold = V.goal === 'stock' ? [] : soldLevelsOf(o, top);
	// Nothing sells for two quite different reasons: a stock run sells
	// nothing on purpose, and a silver run whose climb stops below the
	// level a wharf pays for sells nothing because there is nothing at
	// that reach to sell. Said apart, since one is an order and the
	// other is a thing the sailor may not have meant.
	if (!sold.length) return V.goal === 'stock'
		? T('Climb to Level {lv}, sell nothing — building stock', { lv: top })
		: T('Climb to Level {lv}, where a wharf pays for nothing', { lv: top });
	// One whole sentence rather than a phrase dropped into a hole: what
	// a wharf sells is always a level and everything above it, and a
	// fragment like "Level 5 to 7" carries a capital of its own that
	// reads as a mistake in the middle of a French or a Turkish line.
	return sold.length === 1
		? T('Climb to Level {lv}, sell Level {sell} at the wharf', { lv: top, sell: sold[0] })
		: T('Climb to Level {lv}, sell Level {sell} and up at the wharf', { lv: top, sell: sold[0] });
}

/**
 * The ladder: the shore and the seven levels in a row, the rung the
 * day's climb ends at lit, and under every rung what is held of it,
 * what becomes of it, and how many are kept back. The goal, the
 * ceiling, the sell rule and the floors were four controls in three
 * places; they are one picture of the same thing, so they are drawn as
 * one.
 */
export function ladderHTML(o, { fits = null, tickedN = 0 } = {}) {
	const stocking = V.goal === 'stock', coining = V.goal === 'coin';
	const top = topNow();
	const heldAt = new Map();
	for (const [name, n] of everythingHeld()) heldAt.set(levelOf(name), (heldAt.get(levelOf(name)) || 0) + n);
	const pile = [...landHeld(store.getAllStock()).values()].reduce((a, n) => a + n, 0);
	const kinds = kindsPerLevel();
	const everything = everythingHeld();
	const rungs = [0, 1, 2, 3, 4, 5, 6, 7].map(lv => {
		if (!lv) return `<div class="rung shore"><span class="rung-node" aria-hidden="true">⌂</span><span class="rung-name">${T('The shore')}</span><span class="rung-held">${pile ? T('{n} land goods held', { n: F(pile) }) : T('land goods')}</span><span class="rung-fate none"></span></div>`;
		const reached = lv <= top;
		const sold = !stocking && !coining && reached && lv >= 3 && lv >= o.sell;
		const canFlip = !stocking && !coining && reached && lv >= 3;
		let fate, tone;
		if (!reached) { fate = T('not reached'); tone = 'off'; }
		else if (coining && lv === COIN_LEVEL) { fate = T('cashed in'); tone = 'gold'; }
		else if (sold) { fate = T('sold'); tone = 'gold'; }
		else if (lv < top && !stocking) { fate = lv >= 5 ? T('kept') : T('climbs on'); tone = lv >= 5 ? 'teal' : 'mute'; }
		else { fate = T('kept'); tone = 'teal'; }
		const fateHTML = canFlip
			? `<button class="rung-fate ${tone}" data-act="barter-fate" data-lv="${lv}" title="${sold ? T('Tap: keep it as stock instead') : T('Tap: sell it at the wharf instead')}">${fate}</button>`
			: `<span class="rung-fate ${tone}">${fate}</span>`;
		// A keep line: a floor under a silver or a coin run, a target --
		// which is a floor as well -- under a stock run.
		const want = stocking ? V.stockGoal.targets[lv] || 0 : o.floors[lv] || 0;
		const keep = !reached || (!stocking && lv > 6) ? '<span class="rung-keep none" aria-hidden="true"></span>'
			: `<label class="rung-keep${want ? ' set' : ''}" title="${stocking ? T('What to keep of every good at this level: the run fills it and never spends below it') : T('Never sold, never handed on: this many of every good at this level stay with you')}"><span>${stocking ? T('each') : T('keep')}</span>${amountInput('purse-inline', want || '', `data-act="${stocking ? 'barter-target' : 'barter-floor'}" data-lv="${lv}" placeholder="0" aria-label="${stocking ? T('Keep of every Level {lv} good', { lv }) : T('Keep back of Level {lv}', { lv })}"`)}</label>`;
		// How far along a stock level is, under its keep line.
		let note = '';
		if (stocking && reached && want) {
			const of = kinds.get(lv) || 0;
			const done = [...everything].filter(([name]) => levelOf(name) === lv).reduce((a, [, k]) => a + Math.min(k, want), 0);
			note = `<span class="rung-note${done >= want * of ? ' full' : ''}">${done >= want * of ? T('stock|full') : T('{n} short of {of}', { n: F(want * of - done), of: F(want * of) })}</span>`;
		}
		const coinNode = lv === COIN_LEVEL ? `<span class="rung-coin-line" aria-hidden="true"></span><button class="rung-node coin${coining ? ' on' : ''}" aria-pressed="${coining ? 'true' : 'false'}" data-act="barter-coin-node" title="${T('Cash Level 4 in at the coin islands instead of climbing on')}">${img(COIN, 'rung-coin')}</button><span class="rung-name coin">${T('Crow Coins')}</span><span class="rung-fate ${coining ? 'gold' : 'mute'}">${coining ? T('the goal') : T('or cash in')}</span>` : '';
		return `<div class="rung${reached ? '' : ' dim'}${lv === top && !coining ? ' top' : ''}" style="--tier:${TIER(lv)}">
			<button class="rung-node" data-act="barter-rung" data-lv="${lv}" title="${T('End the climb at Level {lv}', { lv })}"${coining ? '' : ` aria-pressed="${lv === top}"`}>${lv}</button>
			<span class="rung-name">${T('Level {lv}', { lv })}</span>
			<span class="rung-held">${heldAt.get(lv) ? T('{n} held', { n: F(heldAt.get(lv)) }) : T('none held')}</span>
			${fateHTML}${keep}${note}${coinNode}
		</div>`;
	}).join('');
	const sold = stocking || coining ? [] : soldLevelsOf(o, top);
	const floorsSaid = Object.entries(stocking ? {} : o.floors).filter(([, n]) => n > 0).map(([lv, n]) => T('{n} of Level {lv}', { n: F(n), lv })).join(', ');
	const tile = (k, v, sub, cls = '') => `<div><div class="summary-k">${k}</div><div class="summary-v${cls ? ` ${cls}` : ''}">${v}</div><div class="summary-sub">${sub}</div></div>`;
	const aims = stocking ? `<div class="ladder-aim"><span class="run-pick-k">${T('the day is for')}</span><span class="segs" role="group" aria-label="${T('What the stock run is for')}">${AIM_CHOICES.map(([id, label, title]) => `<button class="seg${V.stockGoal.aim === id ? ' on' : ''}" aria-pressed="${V.stockGoal.aim === id ? 'true' : 'false'}" data-act="barter-aim" data-id="${id}" title="${esc(said(title))}">${esc(said(label))}</button>`).join('')}</span><span class="orders-sub">${esc(said((AIM_CHOICES.find(([a]) => a === V.stockGoal.aim) || AIM_CHOICES[0])[2]))}</span></div>` : '';
	return `<div class="ladder-head"><span class="panel-spacer"></span><button class="linky" data-act="barter-hold-open" title="${T('Open the hold: every good aboard and ashore, with its count')}">${T('Open the hold')} ›</button><button class="linky" data-act="barter-add" title="${T('Record a good that is aboard')}">＋ ${T('A good')}</button></div>
		<p class="ladder-copy">${stocking ? T('Click the level where the stock ends. Under each level: what you hold, and what to keep of every good there.') : T('Click the level where today’s climb ends. Under each level: what you hold, what happens to it, and how many to keep back.')}</p>
		<div class="ladder" role="group" aria-label="${T('The level the climbs stop at')}">${rungs}</div>
		<p class="ladder-hint">${stocking
		? T('A target is what to keep of <b>every</b> good at that level, and it is a floor as well: the run fills it and never spends below it, so a level fills before anything climbs from it and only the surplus goes up. Nothing is sold at a wharf while the stock is the goal.')
		: coining
			? T('a floor is held back from the coin islands too: a [Level 4] kept is a [Level 4] not cashed, so a floor at 4 is what this day pays for in coins')
			: T('Tap <b class="gold">sold</b> / <b class="teal">kept</b> to flip what the wharf does with a level. A keep number is never sold or handed on.')}</p>
		${aims}
		<div class="ladder-foot">
			<div class="ladder-goal">${goalLine(o)}</div>
			<div class="run-tiles ladder-tiles">
				${tile(T('The climb ends at'), T('Level {lv}', { lv: top }), coining ? T('then the coin islands') : top === 7 ? T('the top of the ladder') : T('Level {lv} and up are not sailed', { lv: top + 1 }))}
				${tile(coining ? T('Cashed in') : T('Sold at the wharf'), coining ? T('Level {lv}', { lv: COIN_LEVEL }) : sold.length ? (sold.length === 1 ? T('Level {lv}', { lv: sold[0] }) : T('Level {lv} and up', { lv: sold[0] })) : T('nothing'), `${coining ? T('for Crow Coins, at the islands that pay in them') : sold.length ? T('for silver, at a wharf call') : T('the wharf only stores today')}${floorsSaid ? ` · ${T('keeping {list}', { list: floorsSaid })}` : ''}`, 'gold')}
				${tile(T('Chains that fit'), fits === null ? '—' : F(fits), fits === null ? T('the board is not read yet') : tickedN === 1 ? T('on today’s board, {n} ticked', { n: tickedN }) : T('on today’s board, {n} ticked', { n: tickedN }), 'blue')}
			</div>
			<div class="plan-next"><span class="panel-sub">${T('Nothing is bought or sailed yet — the next step chooses how.')}</span><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="how">${T('OK, that’s the goal')} ›</button></div>
		</div>`;
}

/** An order as a row of chips -- or a box, where the choices are too
 *  many for a row -- with the sentence the chosen one carries. */
/** Whether the sailor's own bag is a second hold, and what it takes:
 *  worked out from the Inventory window's two bars, typed or read. */
function bagRowHTML() {
	const b = bagSet();
	const r = bagRoom(b);
	const chips = `<span class="chips">${[['off', T('not used')], ['on', T('a second hold')]].map(([v, t]) => `<button class="chip tiny${(b.on ? 'on' : 'off') === v ? ' active' : ''}" aria-pressed="${(b.on ? 'on' : 'off') === v ? 'true' : 'false'}" data-act="barter-order" data-k="barter-bag" data-v="${v}">${t}</button>`).join('')}</span>`;
	const box = (k, v, label, tenths = false) => `<input class="amt purse-inline" type="text" inputmode="${tenths ? 'decimal' : 'numeric'}" autocomplete="off" value="${v > 0 ? esc((tenths ? Math.round(v * 10) / 10 : v).toLocaleString()) : ''}" placeholder="0" data-act="barter-bag-set" data-k="${k}" aria-label="${esc(label)}">`;
	const bars = b.on ? `<div class="bag-bars">
		<label class="run-pause"><span>${T('Weight')}</span>${box('now', b.now, T('The weight your inventory holds now'), true)}<span>/</span>${box('max', b.max, T('Your weight limit'))}<span>LT</span></label>
		<label class="run-pause"><span>${T('Inventory Slot')}</span>${box('used', b.used, T('The inventory slots filled'))}<span>/</span>${box('slots', b.slots, T('The inventory slots you have'))}</label>
		<button class="chip tiny" data-act="barter-bag-shot" title="${T('A screenshot of the Inventory window: its foot says both')}">📷 ${T('Read the Inventory window')}</button>
	</div>` : '';
	const sub = !b.on ? T('Your inventory weighs nothing on the ship: sailors carry a later chain’s goods in it, moved at any wharf.')
		: r.lt === null ? T('The two bars at the foot of the Inventory window, typed in or read off a screenshot of it: the app works out what the bag takes.')
			: `<span class="bag-free">${r.slots === null ? T('{lt} LT free for the run', { lt: `<b>${F(r.lt)}</b>` }) : T('{lt} LT and {n} slots free for the run', { lt: `<b>${F(r.lt)}</b>`, n: `<b>${F(r.slots)}</b>` })}</span><span class="bag-why">${T('It carries up to {most} LT (170% of your {max} LT limit) and already holds {now} LT.', { most: F(Math.floor(b.max * BAG_OVER)), max: F(b.max), now: LT1(b.now) })} ${T('A later chain’s goods ride in it and go in and out at any wharf’s Load Cargo; sales stay at a wharf with a storage. The run without it is kept when it pays better an hour.')}</span>`;
	return `<div class="order-row" title="${T('Your own inventory, used as a second hold: goods go in and out of it at a wharf only')}"><span class="order-k">${T('your bag')}</span><div class="order-v">${chips}${bars}<span class="run-pick-sub">${sub}</span></div></div>`;
}

/** A weight as the Inventory window prints it, to the tenth. */
const LT1 = n => (Math.round(n * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

/**
 * The Inventory window's two bars, read off a screenshot of it, in a
 * dialog like the barter window's: the reader's progress while the
 * engine is fetched and the picture read -- a first read takes a few
 * seconds, and a page that says nothing meanwhile looks broken -- then
 * the figures found, to be checked before they are written in.
 */
export function readBagShot(files) {
	let reading = null;   // the read under way; a Stop or a close lets it go
	let found = null;
	const host = () => document.getElementById('dialog');
	const draw = body => {
		const inner = host().hidden ? null : host().querySelector('[data-bag-body]');
		if (inner) inner.innerHTML = body;
		else {
			const box = openDialog(`<h2>${T('Read the Inventory window')}</h2><div data-bag-body>${body}</div>`, { onDismiss: () => { reading = null; } }).querySelector('.dialog-box');
			if (box) box.classList.add('shot-box');
		}
		wire();
	};
	const readingView = (at, text) => `<p class="dialog-note">${esc(text)}</p>
		<div class="shot-bar"><i style="width:${Math.round(at * 100)}%"></i></div>
		<div class="dialog-actions"><button class="act quiet" data-stop>${T('Stop')}</button></div>`;
	const line = (k, v) => `<div class="bag-read-row"><span>${k}</span><b>${v === null ? `<em class="faint">${T('not found')}</em>` : v}</b></div>`;
	const reviewView = () => {
		const f = found;
		const any = f && Object.values(f).some(v => v !== null);
		const r = bagRoom({ ...bagSet(), ...Object.fromEntries(Object.entries(f || {}).filter(([, v]) => v !== null)) });
		return `${any ? `<div class="bag-read">
			${line(T('Weight'), f.max === null ? null : `${LT1(f.now)} / ${F(f.max)} LT`)}
			${line(T('Inventory Slot'), f.slots === null ? null : `${F(f.used)} / ${F(f.slots)}`)}
		</div>
		${r.lt !== null ? `<p class="dialog-note">${r.slots === null ? T('{lt} LT free for the run', { lt: `<b>${F(r.lt)}</b>` }) : T('{lt} LT and {n} slots free for the run', { lt: `<b>${F(r.lt)}</b>`, n: `<b>${F(r.slots)}</b>` })}${f.max === null || f.slots === null ? ` ${T('What was not found keeps the figure typed before.')}` : ''}</p>` : ''}`
		: `<p class="dialog-note">${T('No weight or slots found: the foot of the Inventory window, with its two bars, is what is read')}</p>`}
		<div class="dialog-actions">
			<button class="act quiet" data-again>${T('Read another')}</button>
			<span class="panel-spacer"></span>
			<button class="act quiet" data-close>${T('Cancel')}</button>
			<button class="act" data-use${any ? '' : ' disabled'}>${T('Use these')}</button>
		</div>`;
	};
	const failView = why => `<p class="dialog-note">${esc(why)}</p>
		<div class="dialog-actions"><button class="act quiet" data-again>${T('Read another')}</button><span class="panel-spacer"></span><button class="act quiet" data-close>${T('Close')}</button></div>`;
	const use = () => {
		const got = Object.fromEntries(Object.entries(found || {}).filter(([, v]) => v !== null));
		if (!Object.keys(got).length) return;
		closeDialog();
		store.setProfile('bag', { ...bagSet(), on: true, ...got }, T('Read your inventory’s weight and slots'));
		const r = bagRoom(bagSet());
		if (r.lt !== null) toast(r.slots === null ? T('{lt} LT free for the run', { lt: F(r.lt) }) : T('{lt} LT and {n} slots free for the run', { lt: F(r.lt), n: F(r.slots) }));
	};
	function wire() {
		const box = host();
		const on = (sel, fn) => box.querySelectorAll(sel).forEach(el => el.addEventListener('click', fn));
		on('[data-stop]', () => { reading = null; closeDialog(); });
		on('[data-close]', () => closeDialog());
		on('[data-again]', () => pickShots(run));
		on('[data-use]', use);
	}
	async function run(list) {
		const { take, skipped } = await triage([...(list || [])].slice(0, 1));
		if (!take.length) { draw(failView(skipped.length ? `${skipped[0].file.name}: ${skipped[0].why}` : T('The screenshot could not be read'))); return; }
		const me = reading = {};
		draw(readingView(0, T('Fetching the reader…')));
		// The engine's own steps: fetching and starting it, then reading.
		const say = ({ text = '', at = 0 }) => {
			if (reading !== me) return;
			const read = /recogni/i.test(text);
			const bar = host().querySelector('.shot-bar i'), note = host().querySelector('.dialog-note');
			if (bar) bar.style.width = `${Math.round((read ? 0.35 + 0.65 * (at || 0) : 0.35 * (at || 0)) * 100)}%`;
			if (note) note.textContent = read ? T('Reading the two bars — {name}', { name: take[0].name }) : T('Fetching the reader…');
		};
		try {
			const { words } = await readWords(take[0], { lang: shotLang(), onProgress: say });
			if (reading !== me) return;
			found = bagFigures(words);
			draw(reviewView());
		} catch (err) {
			if (reading === me) draw(failView(T('The screenshot could not be read')));
		}
	}
	run(files);
}

function orderRow(act, label, value, options, title = '') {
	const chosen = options.find(([v]) => String(v) === String(value)) || options[0];
	const pick = options.length > 6
		? `<select class="field select" data-act="${act}" aria-label="${esc(label)}">${options.map(([v, t]) => `<option value="${esc(String(v))}"${String(v) === String(value) ? ' selected' : ''}>${esc(said(t))}</option>`).join('')}</select>`
		: `<span class="chips">${options.map(([v, t]) => `<button class="chip tiny${String(v) === String(value) ? ' active' : ''}" aria-pressed="${String(v) === String(value) ? 'true' : 'false'}" data-act="barter-order" data-k="${act}" data-v="${esc(String(v))}">${esc(said(t))}</button>`).join('')}</span>`;
	return `<div class="order-row"${title ? ` title="${esc(title)}"` : ''}><span class="order-k">${label}</span><div class="order-v">${pick}${chosen && chosen[2] ? `<span class="run-pick-sub">${esc(said(chosen[2]))}</span>` : ''}</div></div>`;
}

const PACE_CHOICES = () => [['fast', T('fast'), T('No wharf calls, never slower than full speed: only what the hold carries under the limit')], ['steady', T('full, never slower'), T('Every attempt, the hold kept under the limit by calling at a wharf to leave the surplus — more calls, full speed')], ['full', T('full, loaded'), T('Every attempt, the hold taken up to the barter ceiling — a quarter over the limit, sailing slower — and a wharf call only where the next island would not deal')]];
const labelOf = (options, value) => { const hit = options.find(([v]) => String(v) === String(value)) || options[0]; return said(hit[1]); };

/** The card that is chosen: none once "my own way" was pressed, else
 *  the one the orders match -- and none when they match no card. */
const presetNow = o => (V.ownWay ? '' : sailPresetOf(o));

/** How the orders read in a line, for the head of their section. */
export function howLine(o) {
	const named = SAIL_PRESETS.find(p => p.id === presetNow(o));
	if (named) return said(named.label);
	return [labelOf(PACE_CHOICES(), o.pace), labelOf(LAND_CHOICES, o.buy ? (o.landFrom === 'stock' ? 'stock' : 'buy') : 'no'), o.hours ? labelOf(HOUR_CHOICES, o.hours) : T('no time cap')].filter(Boolean).join(' · ');
}

/**
 * How to sail it.
 *
 * Three ways of going about it as cards, then the three orders that
 * change a run most in plain sight -- where the first good comes from,
 * how hard the hull is worked, and which harbour it all happens
 * around. Everything else is a thing a sailor sets once and forgets,
 * so it waits behind the fold.
 *
 * Nothing here touches what the ladder set. A card that reached over
 * and changed the sell line or the floors was this step undoing the
 * one before it.
 */
export function howHTML(o, figs = null) {
	const stocking = V.goal === 'stock', coining = V.goal === 'coin';
	const on = presetNow(o);
	// Each way of sailing says what it would come to for the chains
	// ticked, so they are chosen between on what they pay and how long
	// they take rather than on what their names suggest.
	const fig = id => { const f = figs && figs.get(id); return f ? `<span class="preset-fig${f.wait ? ' wait' : ''}"><b>${f.big}</b><span>${f.sub}</span>${f.mine ? `<em class="preset-mine">${T('your ticked chains, sailed this way: {v}', { v: f.mine })}</em>` : ''}</span>` : ''; };
	const cards = `${figs && figs.size ? `<p class="preset-note">${T('Under each: the best run the search finds sailing that way today. Choosing one ticks those chains — unless you ticked your own, which stay.')}</p>` : ''}<div class="preset-cards">${SAIL_PRESETS.map(p => `<button class="preset-card${on === p.id ? ' on' : ''}" data-act="barter-sail-preset" data-id="${p.id}" aria-pressed="${on === p.id}"><span class="preset-name"><i></i>${esc(said(p.label))}</span><span class="preset-line">${esc(said(p.sub))}</span>${fig(p.id)}</button>`).join('')}
		<button class="preset-card custom${on ? '' : ' on'}" data-act="barter-adv" aria-expanded="${V.advOpen}"><span class="preset-name"><i></i>${T('My own way')}</span><span class="preset-line">${on ? T('Set every order yourself: where the first goods come from, the pace, the time, the vouchers, the quests.') : esc(howLine(o))}</span><span class="preset-fig"><span>${on ? `${T('every order')} ▾` : V.advOpen ? `${T('hide the orders')} ▴` : `${T('show the orders')} ▾`}</span></span></button>
	</div>`;
	const named = SAIL_PRESETS.find(p => p.id === on);
	const rows = `${named ? `<p class="orders-set-k">${T('What “{name}” sets', { name: esc(said(named.label)) })}</p>` : ''}${orderRow('barter-buy', T('land goods'), o.buy ? (o.landFrom === 'stock' ? 'stock' : 'buy') : 'no', LAND_CHOICES)}
		${orderRow('barter-pace', T('pace'), o.pace, PACE_CHOICES())}
		${orderRow('barter-hours', T('under way at most'), o.hours, HOUR_CHOICES, T('A run proposed here sails no longer than this'))}
		${orderRow('barter-vouchers', T('trade vouchers'), o.vouchers, VOUCHER_CHOICES, T('Whether the run draws on the Crow’s Trade Vouchers you carry; each is a quarter of a bar, on its own two-hour cooldown'))}
		${orderRow('barter-way', T('the way round'), o.way, WAY_CHOICES, T('One route through every rung of every chain ticked, each after the rung beneath it — the nearest islands first, whatever chain they belong to — or each chain climbed to its top before the next'))}
		${named ? `<p class="orders-set-k">${T('And, whichever way you sail')}</p>` : ''}
		${orderRow('barter-stash', T('storage at'), V.stash, [['', T('the nearest wharf')], ...stashes.map(w => [w.at, gameName(STORE_NAMES[w.at] || w.at)])])}
		${orderRow('barter-quests', T('quests on the way'), o.quests, QUEST_CHOICES, T('The dailies and weeklies already taken, handed in where the run passes their taker or at a stop put in a short way off the route; the barter quests counted off the run\'s trades; the hunts only when their grounds lie on the way'))}
`;
	const fromLadder = `<div class="from-ladder"><span>${T('From the step above')}</span><b>${esc(goalLine(o))}</b><button class="linky" data-act="barter-sec" data-id="ladder">${T('change it there')} ›</button></div>`;
	// Where the ship leaves from is not a way of sailing, it is a fact
	// about the sailor -- where their storage is -- and no card can know
	// it, so it is the one thing asked beside the cards.
	return `${cards}
		${named ? `<div class="orders-fold"><button class="linky" data-act="barter-orders-fold" aria-expanded="${V.advOpen}">${V.advOpen ? `${T('hide the orders')} ▴` : `${T('show what this way sets')} ▾`}</button><span class="panel-sub">${T('change any of them and the card that matches is chosen — or “My own way” when none does')}</span></div>` : ''}
		${V.advOpen ? `<div class="order-rows">${rows}</div>${savedHTML()}` : ''}
		${stocking || coining ? '' : fromLadder}
		<div class="plan-next"><span class="panel-sub">${esc(howLine(o))}</span><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="chains">${T('OK, pick the chains')} ›</button></div>`;
}

/**
 * The Parley the day is planned on: the bar as it stands and the
 * vouchers carried. They lived in the sailor's pouch with the barter
 * count, but they are not facts about the sailor -- the count is; the
 * bar is what today has left in it -- so they are the first thing the
 * plan asks, before where the day ends. A bar nobody has typed is
 * planned as a full one, and the section says so until it is typed.
 */
export function parleyLine(prof) {
	const v = prof.vouchers ? ` · ${prof.vouchers === 1 ? T('{n} voucher', { n: prof.vouchers }) : T('{n} vouchers', { n: prof.vouchers })}` : '';
	const from = fromPort();
	const home = from ? ` · ${T('from {port}', { port: gameName(from.name) })}` : '';
	return parleyGuessed(prof) ? `${T('Parley {n} · assumed full', { n: F(PARLEY.max) })}${v}${home}` : `${T('Parley {n}', { n: F(Math.min(PARLEY.max, prof.parleyHeld)) })}${v}${home}`;
}
export function parleyHTML(prof) {
	const o = ordersNow();
	const day = dailyCapacity(prof);
	const clock = currentPlan();
	const refill = `${String(clock.barter).padStart(2, '0')}:00 ${clock.zone === 'UTC' ? 'UTC' : clock.zone}`;
	const guessed = parleyGuessed(prof);
	const held = guessed ? 0 : Math.min(PARLEY.max, prof.parleyHeld);
	const pct = ((guessed ? PARLEY.max : held) / PARLEY.max) * 100;
	return `<div class="parley-plan">
		<div class="parley-fields">
			<div class="parley-field"><label class="parley-field-in"><span class="summary-k">${T('Parley in the bar now')}</span><input class="purse-inline wide" type="text" inputmode="numeric" value="${held ? F(held) : ''}" placeholder="${F(PARLEY.max)}" data-act="parley-held" aria-label="${T('Parley in the bar right now')}"><em>${T('as the barter window’s head reads it')}</em></label>
			<div class="parley-gauge${guessed ? ' guess' : ''}"><div class="run-bar parley"><i style="width:${pct.toFixed(1)}%"></i></div><div class="parley-gauge-k"><span>${guessed ? T('a full bar, taken as read — type yours above, or') : T('{n} of {max}', { n: F(held), max: F(PARLEY.max) })}</span>${guessed ? `<button class="chip tiny" data-act="barter-parley-full">${T('it really is full')}</button>` : ''}<span class="panel-spacer"></span><span>${T('{n} trades a refill', { n: F(day.tradesPerBar) })} · ${T('{each} a trade', { each: F(parleyOf(prof).perTrade) })} · ${T('refills at {time}', { time: esc(refill) })}</span></div></div></div>
			<label class="parley-field"><span class="summary-k">${img(VOUCHER, 'row-icon xs')} ${T('Vouchers carried')}</span><input class="purse-inline" type="text" inputmode="numeric" value="${prof.vouchers ? F(prof.vouchers) : ''}" placeholder="0" data-act="vouchers" aria-label="${T('{name}s you carry', { name: gameName(VOUCHER) })}"><em>${T('each puts {n} back, on a two-hour cooldown', { n: F(PARLEY.voucher) })}</em></label>
		</div>
		<div class="order-rows plain">${orderRow('barter-port', T('Your home port'), V.port, [[0, T('the first stop')], ...ports.map(p => [p.id, gameName(p.name)])], T('Where the run leaves from and comes back to, and whose storage it loads from'))}
		<div class="order-row" title="${T('How long the ship actually sits at a stop, apart from the sailing: only the clock uses these')}"><span class="order-k">${T('a stop takes, apart from the sailing')}</span><div class="order-v run-pauses">
			<label class="run-pause">${amountInput('purse-inline', o.pause.isle || 0, `data-act="barter-pause" data-at="isle" aria-label="${T('Seconds at an island, bartering')}"`)}<span>${T('s bartering, then on')}<em>${T('opening the window, the trades, under way again')}</em></span></label>
			<label class="run-pause">${amountInput('purse-inline', o.pause.call || 0, `data-act="barter-pause" data-at="call" aria-label="${T('Seconds at a wharf or a quest stop')}"`)}<span>${T('s at a wharf or a quest')}<em>${T('storing, selling, handing in — the longer sort of stop')}</em></span></label>
		</div></div>
		${bagRowHTML()}</div>
		<div class="plan-next"><span class="panel-sub">${T('The barter window’s screenshot fills both in — Read the window, above.')}</span><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="ladder">${T('OK, where does today end?')} ›</button></div>
	</div>`;
}

/** One part of the plan: a numbered head that says what is set inside,
 *  and the body when it is the part that is open. */
const secOpen = id => V.planSec === 'all' || V.planSec === id;
export function planSection(n, id, title, summary, body) {
	const open = secOpen(id);
	return `<section class="panel plan-sec${open ? ' open' : ''}" data-sec="${id}">
		<button class="plan-sec-head" data-act="barter-sec" data-id="${id}" aria-expanded="${open}"><i>${n}</i><b>${title}</b><span>${summary}</span><em aria-hidden="true">${open ? '▴' : '▾'}</em></button>
		${open ? `<div class="plan-sec-body">${body}</div>` : ''}
	</section>`;
}

/** A chain the Market stops before its first trade: the cut that says
 *  so, or null. One it only thins -- enough listed for some attempts --
 *  is not cut at all and is no concern of this. */
export const marketDead = solo => (solo && (solo.cut || []).find(x => x.why === 'market' && !x.done)) || null;

/** One chain of the board, to tick: where it starts, how far it
 *  reaches, the islands, the goods, and what one pass of it pays. */
export function chainRow(c, on, solo, dockName, from, ladder = null, shut = null) {
	// The pips are the rungs this chain climbs: from the shore up for a
	// land chain, from the good held for the rest -- a [Level 5] aboard
	// shows 5, 6, 7, not the ladder beneath it.
	const floor = c.from === 'land' ? 1 : levelOf(c.item);
	const pips = [1, 2, 3, 4, 5, 6, 7].filter(l => l >= floor && l <= c.top)
		.map(l => `<i class="${l === floor && c.from !== 'land' ? 'held' : 'on'}${l === c.top ? ' top' : ''}" style="--tier:${TIER(l)}">${l}</i>`).join('');
	// The figure at the head of a card is what this chain, sailed on its
	// own, will really take: what it buys, or what it loads. It used to
	// be what the first island *offers* -- ten attempts, so "10x" -- on a
	// card whose run, a line lower, said five; and for a land chain it
	// was the count of one trade, "300x Coconut", on a run that buys
	// three thousand. Sam read those numbers as the ones to act on, which
	// is what a number at the head of a card is for. Where the run alone
	// does nothing at all the old figure stands, so a card never says 0x.
	const runOf = list => { const hit = solo && solo.trades > 0 ? (list || []).find(x => x.item === c.item) : null; return hit ? Math.ceil(hit.n) : 0; };
	const buys = runOf(solo && solo.bought) || runOf(solo && solo.taken);
	const loads = runOf(solo && solo.loaded);
	const start = c.from === 'land'
		? `<b>${F(buys || c.rungs[0].giveN)}× ${esc(gameName(c.item))}</b><span>${T('bought ashore')}${buys && buys !== c.rungs[0].giveN ? ` · ${T('{n} a trade', { n: F(c.rungs[0].giveN) })}` : ''}</span>`
		: c.from === 'dock'
			? `<b>${n1(loads || c.load)}× ${esc(gameName(c.item))}</b><span>${T('at {where} · loaded before casting off', { where: dockName ? esc(gameName(dockName)) : T('the wharf') })}</span>`
			: `<b>${n1(c.have)}× ${esc(gameName(c.item))}</b><span>${T('already aboard')}${c.load ? ` · ${T('{n} more at {where}', { n: n1(c.load), where: dockName ? esc(gameName(dockName)) : T('the wharf') })}` : ''}</span>`;
	// A ladder with more than one start: the card is the start shown,
	// and a row of the starts beneath it -- the shore, or a good held --
	// each with what the climb from there pays; one is sailed, since
	// the islands above deal once.
	const group = ladder ? ladder.starts.map(x => x.id).join('\n') : '';
	const startOf = x => (x.from === 'land' ? T('the shore · {n}× {name}', { n: F(x.rungs[0].giveN), name: esc(gameName(x.item)) }) : x.from === 'dock' ? T('{name} · {n} ashore', { name: esc(gameName(x.item)), n: n1(x.waiting || x.load) }) : T('{name} · {n} aboard', { name: esc(gameName(x.item)), n: n1(x.have) }));
	const starts = ladder ? `<div class="chain-starts" style="--tier:${TIER(c.top)}"><span class="chain-starts-k">${T('start from')}</span>${ladder.starts.map(x => {
		const sol = ladder.solos.get(x.id);
		const picked = ladder.chosen.includes(x);
		const dry = marketDead(sol);
		if (dry && !picked) return `<span class="chip tiny dry" title="${dry.listed
			? T('The Central Market has only {n} {good} listed and the first island takes {want} a trade, so the climb cannot start from the shore. It is asked again every half hour.', { n: F(dry.listed), good: esc(gameName(dry.good)), want: F(dry.want) })
			: T('The Central Market has no {good} listed and the first island takes {want} a trade, so the climb cannot start from the shore. It is asked again every half hour.', { good: esc(gameName(dry.good)), want: F(dry.want) })}"><i class="chain-start-lv" style="--tier:${TIER(1)}">⌂</i>${startOf(x)}<em class="dry-why">${dry.listed ? T('only {n} on the Market', { n: F(dry.listed) }) : T('none on the Market')}</em></span>`;
		return `<button class="chip tiny${picked ? ' active' : x === c ? ' shown' : ''}" data-act="barter-chain-start" data-id="${esc(x.id)}" data-group="${esc(group)}" title="${x.from === 'land' ? T('Buy {n}× {name} ashore and climb from Level 1', { n: F(x.rungs[0].giveN), name: esc(gameName(x.item)) }) : T('Climb from the {n}× {name} held', { n: n1(x.have + x.load), name: esc(gameName(x.item)) })} — ${T('the islands above deal once, so one start is sailed')}"><i class="chain-start-lv" style="--tier:${TIER(x.from === 'land' ? 1 : levelOf(x.item))}">${x.from === 'land' ? '⌂' : levelOf(x.item)}</i>${startOf(x)}${sol && sol.silver ? `<em>${FC(Math.round(sol.net))}</em>` : ''}</button>`;
	}).join('')}</div>` : '';
	// A climb through an island the barter count has not opened is shown
	// rather than dropped -- it is what the day's board holds, and what
	// the next threshold is worth -- but it cannot be ticked, and where
	// the silver would be it says what opens it.
	if (shut) {
		const npc = npcById.get(shut.npcId);
		return `<button class="chain shut" disabled style="--tier:${TIER(c.top)}" title="${T('{isle} opens at {barters} Total Barters', { isle: esc(gameName(isleOf(npc) || shut.npc)), barters: F(shut.barters) })}">
			<span class="chain-mark">🔒</span>
			<span class="chain-main">
				<span class="chain-start">${start}</span>
				<span class="chain-pips">${pips}<em>${T('Level {lv}', { lv: c.top })}</em></span>
				<span class="chain-route">${c.rungs.map(r => `<span class="${r.npcId === shut.npcId ? 'chain-shut-isle' : ''}">${esc(isleShort(npcById.get(r.npcId)) || r.npc)}</span>`).join(' › ')}</span>
				<span class="chain-goods">${c.rungs.map(r => img(r.item, 'row-icon sm')).join('')}</span>
			</span>
			<span class="chain-right">
				<b class="none">${T('locked')}</b>
				<span class="chain-yard"><em>${esc(gameName(isleOf(npc) || shut.npc))}</em></span>
				<span>${T('opens at {barters} Total Barters', { barters: F(shut.barters) })}</span>
				<span>${T('{n} more to go', { n: F(shut.short) })}</span>
			</span>
		</button>`;
	}
	// A chain that would start on a good the Market has not got: said on
	// the card, before it is ticked and a sailor goes to the counter.
	const outOf = solo && (solo.cut || []).find(x => x.why === 'market');
	// ...and when it cannot make even its first trade it is not a chain
	// to tick: drawn, because it is what the board holds, but greyed and
	// saying why on its own face. One already ticked stays pressable, so
	// it can be unticked.
	const dry = marketDead(solo);
	const dryLine = dry ? `<span class="chain-dry">${img(dry.good, 'row-icon xs')}<span>${dry.listed ? T('only <b>{n}</b> on the Central Market', { n: F(dry.listed) }) : T('<b>none</b> on the Central Market')} · ${T('{n} needed a trade', { n: F(dry.want) })}${dry.held >= dry.want ? ` · ${T('you keep {n}: take land goods <i>from my storage</i>', { n: F(dry.held) })}` : ''}</span></span>` : '';
	const card = `<button class="chain${on ? ' on' : ''}${dry ? ' dry' : ''}" data-act="barter-chain" data-id="${esc(c.id)}"${group ? ` data-group="${esc(group)}"` : ''}${dry && !on ? ' disabled' : ''} style="--tier:${TIER(c.top)}"${dry ? ` title="${dry.listed
		? T('This climb starts on {want}× {good} bought ashore, and the Central Market has only {listed} listed. It is asked again every half hour.', { want: F(dry.want), good: esc(gameName(dry.good)), listed: F(dry.listed) })
		: T('This climb starts on {want}× {good} bought ashore, and the Central Market has none listed. It is asked again every half hour.', { want: F(dry.want), good: esc(gameName(dry.good)) })}"` : ''}>
		<span class="chain-mark">${on ? '✓' : dry ? '∅' : ''}</span>
		<span class="chain-main">
			<span class="chain-start">${start}</span>${dryLine}
			<span class="chain-pips">${pips}<em>${T('Level {lv}', { lv: c.top })}</em></span>
			<span class="chain-route">${c.rungs.map(r => esc(isleShort(npcById.get(r.npcId)) || r.npc)).join(' › ')}</span>
			<span class="chain-goods">${c.rungs.map(r => img(r.item, 'row-icon sm')).join('')}</span>
		</span>
		<span class="chain-right">
			<b class="${solo.silver ? '' : 'none'}${solo.net < 0 ? ' warn' : ''}">${solo.silver ? FC(Math.round(solo.net)) : dry ? T('cannot start') : '—'}</b>
			${!solo.silver && !dry ? `<span class="chain-why">${soloWhy(c, solo)}</span>` : ''}
			${solo.silver && solo.net < 0 ? `<span class="chain-why">${T('loses silver: the land goods cost more than the wharf pays')}</span>` : ''}
			${solo.silver ? `<span class="chain-yard">${[solo.yard.perUnit ? `<em>${esc(perUnitText(solo.yard.perUnit))}</em>` : '', solo.yard.perHour ? esc(perHourText(solo.yard.perHour)) : ''].filter(Boolean).join(' · ')}</span>` : ''}
			${outOf ? `<span class="warn" title="${outOf.listed
				? T('The Central Market has only {n} of it listed, and the first island takes {want} a trade. The prices are asked again every half hour.', { n: F(outOf.listed), want: F(outOf.want) })
				: T('The Central Market has none of it listed, and the first island takes {want} a trade. The prices are asked again every half hour.', { want: F(outOf.want) })}">${outOf.listed ? T('only {n} on the Market', { n: F(outOf.listed) }) : T('none on the Market')}</span>` : ''}
			${solo.cost ? `<span>${T('{sold} sold · {bought} bought', { sold: FC(Math.round(solo.silver)), bought: FC(Math.round(solo.cost)) })}</span>` : solo.bought.some(b => b.how === 'unpriced') ? `<span class="faint">${T('land goods unpriced')}</span>` : ''}
			<span>${solo.keptWorth ? T('{silver} left over', { silver: FC(Math.round(solo.keptWorth)) }) : solo.silver ? T('nothing left over') : T('nothing to sell at this reach')}</span>
			<span>${c.rungs.length === 1 ? T('{n} island', { n: c.rungs.length }) : T('{n} islands', { n: c.rungs.length })}${from ? '' : ''}</span>
		</span>
	</button>`;
	return ladder ? `<div class="chain-ladder${on ? ' on' : ''}">${card}${starts}</div>` : card;
}

/**
 * Why a chain sailed on its own sells nothing, in one short line under
 * its dash: a floor holding its goods back, its top below what the
 * wharf sells, the Parley, the hold -- the dash alone read as a chain
 * that was broken.
 */
function soloWhy(c, solo) {
	const cut = (solo.cut || [])[0];
	if (cut && cut.why === 'floor') return T('stops at Level {lv}: your floor keeps them', { lv: cut.level });
	if (cut && cut.why === 'parley') return T('stops: the Parley runs out');
	if (cut && (cut.why === 'hold' || cut.why === 'over' || cut.why === 'share')) return T('stops: the hold is full');
	if (cut && cut.why === 'market') return T('stops: the Market has too few');
	const o = ordersNow();
	if (c.item === COIN || V.goal === 'coin') return '';
	if (c.top < o.sell) return o.sell === NOTHING ? T('kept — the wharf sells nothing') : T('reaches Level {top}; the wharf sells Level {sell} up — kept', { top: c.top, sell: o.sell });
	return '';
}

/**
 * A chain's run on its own, with the yardsticks on it. What the run
 * would sell anyway -- goods aboard the orders let a wharf sell -- is
 * taken off, so the row says what the chain itself adds.
 */
export function soloRun(c, opts, from, base) {
	const run = chainRun({ ...opts, chosen: [c] });
	run.silver = Math.max(0, run.silver - base.silver);
	run.net = run.silver - run.cost;
	run.keptWorth = Math.max(0, run.keptWorth - base.keptWorth);
	run.yard = yardsticks(run.net, run.parleyUsed - base.parleyUsed, roughHours(c, from));
	return run;
}
