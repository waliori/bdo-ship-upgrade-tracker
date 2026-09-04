// The Barter tab: the hold as it stands, and a run planned from it.
//
// The chart plots a route you choose; the ledger prices it. This is
// the other way round: say what you are sailing for -- silver, or a
// material a build is short of -- and the run is laid out: which
// islands, in what order, what changes hands at each, the hold after
// every stop, and what a barterer pays. The run for silver is planned
// on today's board, once one island has been looked at: the board's
// chains from the shore to a [Level 7] are listed, the sailor ticks
// the ones to sail, and the run follows them with the goods no rung
// ahead takes left at a wharf when the hull needs the room. The run
// for a material reads the whole table until the board is known, and
// the material islands always, since those roll on their own.

import { esc, F, FC } from './fmt.js';
import * as store from './state.js';
import { img, codexName, amountInput } from './ui-bits.js';
import { snapshot, barterData, barterProfile, combos } from './ui-state.js';
import { barterKey } from './clock.js';
import { candidates, askable, offersAt, boardData } from './barter-board.js';
import { currentShip } from './ship.js';
import { npcById, ports } from './barter_npcs.js';
import { seaRoute } from './searoute.js';
import { pathLength, legLengths, sailRange, fmtRange, fmtDistance, DEFAULT_CAL } from './sailing.js';
import { GOODS, PARLEY, parleyPerTrade, levelOf } from './barter.js';
import { materialPlan, goodsHeld, weightOf, sellOf } from './barter-plan.js';
import { chains, chainRun } from './barter-chains.js';
import { wharves } from './wharves.js';
import { tradeGoodNames } from './trade_goods.js';
import { openPicker } from './picker.js';
import { openTripLog } from './triplog.js';
import { toast } from './dialogs.js';

/* ------------------------------------------------------------------ *
 * what the tab remembers
 * ------------------------------------------------------------------ */

const STORE_KEY = 'bdo-tracker/barter-view';
let goal = 'silver';     // silver | material
let item = null;         // the material a run is for
let qty = 1;             // how many of it
let port = 0;            // the wharf the run sails from, 0 for none
let routes = { key: '', ids: [] };     // the chains ticked, for one board (day|layout)
let pace = 'fast';       // fast: the attempts the top can use | full: every attempt, storage on the way
let stash = '';          // the wharf goods are left at, '' for the nearest
let board = { day: '', answers: [] };   // what islands were seen to show today: { npcId, give, recv }
let restored = false;

function restore() {
	if (restored) return;
	restored = true;
	try {
		const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
		if (!s) return;
		if (s.goal === 'material') goal = 'material';
		if (typeof s.item === 'string') item = s.item;
		if (Number(s.qty) > 0) qty = Math.min(9999, Math.floor(Number(s.qty)));
		if (ports.some(p => p.id === Number(s.port))) port = Number(s.port);
		if (s.pace === 'full') pace = 'full';
		if (STASHES.includes(s.stash)) stash = s.stash;
		if (s.routes && typeof s.routes.key === 'string' && Array.isArray(s.routes.ids)) routes = { key: s.routes.key, ids: s.routes.ids.filter(id => typeof id === 'string') };
		if (s.board && Array.isArray(s.board.answers)) {
			board = { day: String(s.board.day || ''), answers: s.board.answers.filter(a => a && npcById.has(Number(a.npcId)) && typeof a.give === 'string' && typeof a.recv === 'string').map(a => ({ npcId: Number(a.npcId), give: a.give, recv: a.recv })) };
		}
	} catch { /* a fresh tab */ }
}

function persist() {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify({ goal, item, qty, port, routes, pace, stash, board }));
	} catch { /* private mode; the session still works */ }
}

/* ------------------------------------------------------------------ *
 * the hold
 * ------------------------------------------------------------------ */

/** The goods aboard: name, level, count, weight; heaviest level first. */
function held() {
	return [...goodsHeld(store.getAllStock())]
		.map(([name, n]) => ({ name, lv: levelOf(name), n, weight: n * weightOf(name) }))
		.sort((a, b) => b.lv - a.lv || a.name.localeCompare(b.name));
}

function holdHTML(me) {
	const goods = held();
	const lt = goods.reduce((a, g) => a + g.weight, 0);
	const n = goods.reduce((a, g) => a + g.n, 0);
	const worth = goods.reduce((a, g) => a + g.n * sellOf(g.name), 0);
	const free = me.hold.free, max = me.hold.max;
	const pct = max > 0 ? Math.min(100, lt / max * 100) : 0;
	const mark = max > 0 ? Math.min(100, free / max * 100) : 100;
	const state = lt > max ? 'dead' : lt > free ? 'over' : '';
	const room = lv => Math.max(0, Math.floor((free - lt) / GOODS[lv].weight));
	const sub = !n ? `nothing aboard · the hold takes ${F(free)} LT, and sails slower to ${F(max)}`
		: state === 'dead' ? `${F(lt)} LT — past the ${F(max)} the hull will move under`
			: state === 'over' ? `${F(lt)} LT — over the ${F(free)} limit, sailing slower`
				: `${F(lt)} LT of ${F(free)} · room for ${room(5)} more Lv4–5 or ${room(6)} Lv6–7`;
	const rows = goods.map(g => `<div class="barter-good">
		${img(g.name, 'row-icon')}
		<span class="map-row-main">
			<span class="map-row-name">${codexName(g.name)}</span>
			<span class="map-row-sub">${F(GOODS[g.lv].weight)} LT each · ${F(g.weight)} LT${sellOf(g.name) ? ` · a barterer pays ${FC(sellOf(g.name))}` : ' · cannot be sold'}</span>
		</span>
		<span class="barter-count">
			<button class="map-load-btn" data-act="barter-good" data-item="${esc(g.name)}" data-delta="-1" aria-label="One fewer ${esc(g.name)}">−</button>
			${amountInput('purse-inline', g.n, `data-act="barter-good-set" data-item="${esc(g.name)}" aria-label="How many ${esc(g.name)} aboard"`)}
			<button class="map-load-btn" data-act="barter-good" data-item="${esc(g.name)}" data-delta="1" aria-label="One more ${esc(g.name)}">+</button>
		</span>
		<button class="map-x" data-act="barter-good-drop" data-item="${esc(g.name)}" aria-label="None of ${esc(g.name)} aboard">×</button>
	</div>`).join('');
	return `<section class="panel barter-hold">
		<div class="panel-head">
			<h2 class="panel-title teal">The hold</h2>
			<span class="panel-sub">aboard <b>${esc(me.name)}</b> · <button class="linky" data-act="view" data-id="crew">change</button></span>
			<span class="panel-spacer"></span>
			<span class="panel-btns">
				<button class="ghost-btn" data-act="trip-log" title="Everything a trip brought back, in one go">＋ Log a trip</button>
				<button class="ghost-btn" data-act="barter-add" title="Record a good that is aboard">＋ A good</button>
			</span>
		</div>
		<div class="map-load-bar" title="The bar runs to the most the hull will move under; the mark is its limit"><i class="${state}" style="width:${pct.toFixed(1)}%"></i><s style="left:${mark.toFixed(1)}%"></s></div>
		<div class="summary-sub${state ? ' warn' : ''}">${sub}${worth ? ` · worth ${FC(worth)} to a barterer as it is` : ''}</div>
		${rows ? `<div class="barter-goods">${rows}</div>` : '<p class="empty">Nothing recorded aboard. Add a good, or log the trip that brought them back — the counts are the Inventory’s, under Trade goods.</p>'}
	</section>`;
}

/* ------------------------------------------------------------------ *
 * today's board
 * ------------------------------------------------------------------ */

/**
 * The layouts still standing after what was seen today, and the table
 * a run is planned on: the board itself once one layout is left, the
 * whole table until then. What was seen lapses with the barter day,
 * since the sea redraws every board at the refill.
 */
function boardNow() {
	if (!combos || !barterData) return { standing: [], combo: null, data: barterData };
	if (board.day !== barterKey()) {
		board = { day: barterKey(), answers: [] };
		persist();
	}
	const standing = board.answers.length ? candidates(combos.combos, board.answers) : combos.combos;
	const combo = standing.length === 1 ? standing[0] : null;
	return { standing, combo, data: combo ? boardData(combo, barterData, npcById) : barterData };
}

const fromPort = () => ports.find(p => p.id === port) || null;

/**
 * The board bar: which layout the sea is showing, or the question that
 * finds it, with the goal toggle and the refresh beside it.
 */
function boardHTML(b) {
	const goalChip = (id, label, title) => `<button class="seg${goal === id ? ' on' : ''}" data-act="barter-goal" data-id="${id}" title="${esc(title)}">${label}</button>`;
	const goals = `<span class="segs" role="group" aria-label="What the run is for">${goalChip('silver', 'Silver', 'The chains of today’s board, and a run along the ones ticked')}${goalChip('material', 'A material', 'The ladder to one material, against what is aboard')}</span>`;
	// The bar is one row of three parts: what the board is, what was
	// looked at to find it, and what to do next. Each keeps its own
	// column, so a long explanation never squeezes the buttons.
	const bar = (cls, lead, sub, seen, acts) => `<div class="barter-bar${cls ? ` ${cls}` : ''}">
		<div class="barter-bar-info"><div class="barter-bar-lead">${lead}</div><div class="barter-bar-sub">${sub}</div></div>
		${seen ? `<div class="barter-bar-seen"><span class="barter-bar-k">looked at</span><span class="chips">${seen}</span></div>` : ''}
		<div class="barter-bar-acts">${goals}${acts}</div>
	</div>`;
	if (!combos) return bar('', '<b>Today’s board</b>', 'The record of the boards did not load, so a run is planned on the whole table at best.', '', '');
	const since = new Date(combos.sample.since + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
	// Each answer wears the good it handed back, so a mistyped island is
	// spotted without hovering for the tooltip.
	const seen = board.answers.map(a => `<span class="chip tiny active board-seen" title="${esc(a.give)} → ${esc(a.recv)}">${img(a.recv, 'row-icon xs')}${esc(npcById.get(a.npcId).name)}</span>`).join('')
		+ (board.answers.length ? '<button class="chip tiny" data-act="barter-board-undo" title="Take back the last island looked at">↶ Undo</button>' : '');
	if (b.combo) {
		return bar('known',
			`<b>Layout ${esc(b.combo.id)}</b><span>today’s board</span>`,
			`seen ${b.combo.seen} of ${combos.sample.refreshes} refreshes since ${esc(since)} · every island’s offer is known; the material islands roll on their own and are read from the whole table, and which of its four [Level 7] goods an island pays is not the layout’s to say`,
			seen,
			'<button class="ghost-btn sm" data-act="barter-board-clear" title="The board was refreshed in game: start again">↻ Refreshed in game</button>');
	}
	const ask = askable(b.standing, npcById, fromPort());
	if (!b.standing.length) {
		return bar('lost',
			'<b>No layout shows that</b><span>nothing in the record fits</span>',
			`The record is from ${esc(combos.read)}; the game may have moved on.`,
			seen,
			'<button class="ghost-btn sm" data-act="barter-board-clear">↻ Start again</button>');
	}
	const first = ask[0] ? npcById.get(ask[0].npcId) : null;
	const lead = board.answers.length
		? `<b>${b.standing.length} layouts fit</b><span>one more look settles it</span>`
		: '<b>Which board?</b><span>today’s board</span>';
	const acts = `${first ? `<button class="chip primary" data-act="barter-board-ask" data-npc="${first.id}" title="The island whose offer tells the layouts apart best${ask[0].worst > 1 ? ` — leaves ${ask[0].worst} at worst` : ''}">What does <b>${esc(first.name)}</b> show? ▾</button>` : ''}<button class="chip" data-act="barter-board-island" title="Look at an island of your own choosing instead">another island…</button>`;
	return bar('', lead, `Look at one island in the game and tap what it offers; the whole board follows, since every refresh is one of ${combos.combos.length} layouts.`, seen, acts);
}

/* ------------------------------------------------------------------ *
 * the run
 * ------------------------------------------------------------------ */

/** The materials the table deals, with what the builds are short of. */
function materials() {
	const missing = (snapshot && snapshot.missing) || {};
	return (barterData || []).filter(e => levelOf(e.name) === null && e.sources && e.sources.length)
		.map(e => ({ name: e.name, short: Number(missing[e.name]) || 0 }))
		.sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
}

/** Metres a second at 100%: the player's own figure if they timed a
 *  leg, else the working estimate. */
function sailCal() {
	const v = Number(store.getSetting('sailCal', null));
	return v > 0 ? v : DEFAULT_CAL;
}

/** The material a run is for: the one chosen, else the biggest
 *  shortfall the table can answer. */
function itemNow() {
	const list = materials();
	if (item && list.some(m => m.name === item)) return item;
	return list.length ? list[0].name : null;
}

// Where goods can be left on the way: the harbours with a storage
// keeper beside the wharf manager.
const STASHES = ['Velia', 'Port Epheria', 'Iliya Island', 'Ancado Inner Harbor', "Oquilla's Eye"];
const stashes = STASHES.map(at => wharves.find(w => w.kind === 'wharf' && w.at === at)).filter(Boolean);

/** The legs of a run, bent round the land: distance and time. */
function legsOf(stops) {
	const from = ports.find(p => p.id === port) || null;
	const pts = [...(from ? [from] : []), ...stops.map(s => s.wharf || npcById.get(s.npcId)).filter(Boolean)];
	if (pts.length < 2) return { total: 0, legs: [], time: '' };
	const world = seaRoute(pts.map(p => ({ x: p.x, y: p.y })));
	const total = pathLength(world);
	const legs = legLengths(world);   // one a stop after the first, bends included
	const me = currentShip();
	const measured = Number(store.getSetting('sailCal', null)) > 0;
	const range = m => sailRange(m, me.speed.total, sailCal(), measured);
	const [fast, slow] = range(total);
	return { total, legs, from, time: fmtRange(fast, slow), mid: (fast + slow) / 2, timeOf: m => fmtRange(...range(m)) };
}

const n1 = v => F(Math.round(v * 10) / 10);
const TIER = lv => `var(--tier-${Math.max(1, Math.min(7, lv || 1))})`;

/**
 * The stops of a run as a timeline: island or wharf, the leg to it,
 * what changes hands, what is left ashore or sold, and the hold after
 * it against the weight limit. `k0` numbers the first stop; `board`
 * is set when a [Level 7] is the record's, though the island may pay
 * another of its four.
 */
function stopRows(stops, legs, { k0 = 0, board = false } = {}) {
	const four = s => (board && levelOf(s.item) === 7 ? ', or another of the island’s four' : '');
	return stops.map((s, i) => {
		const k = k0 + i;
		const place = s.wharf || npcById.get(s.npcId);
		const m = legs.from ? legs.legs[k] : k > 0 ? legs.legs[k - 1] : null;
		const leg = m != null ? `<span class="run-leg">${esc(fmtDistance(m))} · ${esc(legs.timeOf(m))}</span>` : '';
		const hold = s.hold;
		const over = s.weightAfter > hold.free, heavy = s.weightAfter > hold.deal, dead = s.weightAfter > hold.max;
		const fill = Math.min(100, Math.min(s.weightAfter, hold.free) / hold.max * 100);
		const extra = Math.max(0, Math.min(s.weightAfter, hold.deal) - hold.free) / hold.max * 100;
		const worse = Math.max(0, Math.min(s.weightAfter, hold.max) - hold.deal) / hold.max * 100;
		const did = s.wharf
			? `${s.dropped.length ? `<div class="run-leave"><span class="run-leave-k">Leaves in storage</span>${s.dropped.map(d => `<span class="run-leave-good">${img(d.item, 'row-icon sm')}<b>${n1(d.n)}×</b>${esc(d.item)}</span>`).join('')}</div>` : ''}${s.sale ? `<div class="run-sell">sells the ${n1(s.sale.n)} [Level 7] here for ${FC(Math.round(s.sale.total))}</div>` : ''}`
			: `<div class="run-trade"><span>${esc(s.giveText)}× ${esc(s.give)}</span><span class="run-arrow">→</span><span class="run-to" style="--tier:${TIER(levelOf(s.item))}"><i></i>${esc(s.recvText)}× ${esc(s.item)}${four(s)}</span><span class="run-times">×${s.times}</span>${img(s.item, 'row-icon sm')}</div>`;
		return `<div class="run-stop${s.wharf ? ' wharf' : ''}${s.sale ? ' sale' : ''}${i === stops.length - 1 ? ' last' : ''}">
			<div class="run-rail"><i></i><b>${k + 1}</b><i></i></div>
			<div class="run-main">
				<div class="run-stop-head">${s.wharf ? '<span class="run-anchor" title="A pause at a wharf, not a barter">⚓</span>' : ''}<b>${esc(place.name)}</b><span>${esc(place.at)}${s.wharf ? ' wharf' : ''}</span>${leg}</div>
				${did}
			</div>
			<div class="run-hold">
				<div><span>hold</span><b class="${heavy ? 'warn' : over ? 'amber' : ''}">${F(Math.max(0, Math.round(s.weightAfter)))} LT</b></div>
				<div class="run-bar"><i style="width:${fill.toFixed(1)}%"></i><i class="over" style="width:${extra.toFixed(1)}%"></i><i class="heavy" style="width:${worse.toFixed(1)}%"></i></div>
				${dead ? '<div class="run-note warn">more than the hull will move under</div>' : heavy ? '<div class="run-note warn">too heavy to barter — lighten first</div>' : over ? '<div class="run-note">past the limit — sailing slower</div>' : ''}
			</div>
		</div>`;
	}).join('');
}

/** The chart button: the islands in order, what each is called at for,
 *  and the wharf calls between them, so the Map's route says the same
 *  as the run -- the same stops, in the same order, under the same
 *  numbers. A call is pinned to the count of islands sailed before it,
 *  which is where the chart threads it back in. */
function chartButton(stops, pick) {
	if (!stops.length) return '';
	const isles = stops.filter(s => s.npcId);
	const ids = [...new Set(isles.map(s => s.npcId))];
	const trades = isles.map(s => [s.npcId, s.give, s.giveText, s.item, s.recvText, s.recvMin, s.giveN, s.times]);
	const calls = [];
	let n = 0;
	for (const s of stops) {
		if (s.npcId) { n++; continue; }
		if (!s.wharf || (!s.dropped.length && !s.sale)) continue;
		calls.push([n, s.wharf.name, s.wharf.at, s.wharf.x, s.wharf.y,
			s.dropped.map(d => [d.item, Math.round(d.n * 10) / 10]),
			s.sale ? Math.round(s.sale.n * 10) / 10 : 0,
			s.sale ? Math.round(s.sale.total) : 0]);
	}
	const what = calls.length ? `${ids.length} islands and ${calls.length} wharf call${calls.length === 1 ? '' : 's'}` : 'these stops';
	return `<button class="ghost-btn run-chart" data-act="barter-chart" data-ids="${ids.join('.')}" data-pick="${esc(pick || '')}" data-trades="${esc(JSON.stringify(trades))}" data-stash="${esc(JSON.stringify(calls))}" title="Plot ${what} on the Map, in this order">Draw it on the chart</button>`;
}

const parleyOf = prof => ({ bar: PARLEY.max + prof.vouchers * PARLEY.voucher, perTrade: parleyPerTrade({ ...prof, kind: 'trade' }) });
const stashAt = () => stashes.find(w => w.at === stash) || null;

/** One chain of the board, to tick: where it starts, how far it
 *  reaches, the islands, the goods, and what one pass of it pays. */
function chainRow(c, on, solo) {
	const pips = [1, 2, 3, 4, 5, 6, 7].map(l => `<i class="${l <= c.top ? 'on' : ''}${l === c.top ? ' top' : ''}" style="--tier:${TIER(l)}">${l}</i>`).join('');
	const start = c.from === 'land'
		? `<b>${F(c.rungs[0].giveN)}× ${esc(c.item)}</b><span>bought ashore</span>`
		: `<b>${n1(c.have)}× ${esc(c.item)}</b><span>already aboard</span>`;
	return `<button class="chain${on ? ' on' : ''}" data-act="barter-chain" data-id="${esc(c.id)}" style="--tier:${TIER(c.top)}">
		<span class="chain-mark">${on ? '✓' : ''}</span>
		<span class="chain-main">
			<span class="chain-start">${start}</span>
			<span class="chain-pips">${pips}<em>Level ${c.top}</em></span>
			<span class="chain-route">${c.rungs.map(r => esc(r.npc)).join(' › ')}</span>
			<span class="chain-goods">${c.rungs.map(r => img(r.item, 'row-icon sm')).join('')}</span>
		</span>
		<span class="chain-right">
			<b class="${solo.silver ? '' : 'none'}">${solo.silver ? FC(Math.round(solo.silver)) : '—'}</b>
			<span>${solo.keptWorth ? `${FC(Math.round(solo.keptWorth))} left over` : solo.silver ? 'nothing left over' : 'nothing to sell at this reach'}</span>
			<span>${c.rungs.length} island${c.rungs.length === 1 ? '' : 's'}</span>
		</span>
	</button>`;
}

/**
 * The run for silver, in two panels: the board's chains to tick, and
 * the run along the ticked ones -- its figures, each chain's stops as
 * a timeline, what was bought, left on the way and carried home.
 */
function silverParts(me, b) {
	const from = fromPort();
	const head = `<div class="panel-head"><h2 class="panel-title">Chains on offer</h2><span class="panel-sub">tick the ones to sail</span><span class="panel-spacer"></span>${routes.ids.length ? '<button class="linky" data-act="barter-chains-clear">clear</button>' : ''}</div>`;
	if (!b.combo) {
		return {
			chains: `<section class="panel barter-chains">${head}<p class="empty">The chains follow the board: look at one island in the game and tap what it shows.</p></section>`,
			run: `<section class="panel barter-run"><div class="panel-head"><h2 class="panel-title plain">The run</h2></div><p class="empty">Nothing to lay out until the board is known.</p></section>`
		};
	}
	const prof = barterProfile();
	const stock = store.getAllStock();
	const all = chains(b.data, stock);
	const key = `${board.day}|${b.combo.id}`;
	if (routes.key !== key) routes = { key, ids: all.length ? [all[0].id] : [] };
	const chosen = all.filter(c => routes.ids.includes(c.id));
	const opts = { stock, hold: me.hold, parley: parleyOf(prof), npcById, start: from, stashes, prefer: stashAt(), pace };
	const groups = [...new Set(all.map(c => c.top))].sort((a, b2) => b2 - a).map(top => {
		const rows = all.filter(c => c.top === top);
		return `<div class="chain-group"><div class="chain-group-head" style="--tier:${TIER(top)}"><i></i><span>Reaches Level ${top}</span><span>${rows.length}</span></div>${rows.map(c => chainRow(c, chosen.includes(c), chainRun({ ...opts, chosen: [c] }))).join('')}</div>`;
	}).join('');
	const chainsPanel = `<section class="panel barter-chains">${head}<div class="chain-list">${groups || '<p class="empty">Nothing climbs on this board.</p>'}</div></section>`;

	const plan = chainRun({ ...opts, chosen });
	for (const s of plan.stops) s.hold = me.hold;
	const legs = legsOf(plan.stops);
	const rate = legs.mid > 0 && plan.silver > 0 ? Math.round(plan.silver / (legs.mid / 3600)) : 0;
	const islands = plan.stops.filter(s => s.npcId).length, wharfs = plan.stops.length - islands;
	// The three choices are of a kind and of a size, so they sit in a
	// row of their own under the heading rather than wrapping one at a
	// time off the end of it and leaving the line half empty.
	const sel = (act, label, value, options) => `<label class="run-pick"><span class="run-pick-k">${label}</span><select class="field select" data-act="${act}">${options.map(([v, t]) => `<option value="${esc(String(v))}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
	const runHead = `<div class="panel-head run-head">
		<h2 class="panel-title plain">The run</h2>
		<span class="panel-sub">${chosen.length} chain${chosen.length === 1 ? '' : 's'} ticked · aboard ${esc(me.name)}: ${F(me.hold.free)} LT before it slows, barters up to ${F(me.hold.deal)} · goods counted at the least, weighed at the most</span>
	</div>
	<div class="run-picks">
		${sel('barter-pace', 'pace', pace, [['fast', 'fast: no wharf calls, never slower'], ['full', 'every attempt, storage on the way']])}
		${sel('barter-stash', 'storage at', stash, [['', 'the nearest wharf'], ...stashes.map(w => [w.at, w.at])])}
		${sel('barter-port', 'sails from', port, [[0, 'the first stop'], ...ports.map(p => [p.id, p.name])])}
	</div>`;
	const tile = (k, v, sub, cls = '') => `<div><div class="summary-k">${k}</div><div class="summary-v${cls ? ` ${cls}` : ''}">${v}</div><div class="summary-sub">${sub}</div></div>`;
	const tiles = `<div class="run-tiles">
		${tile('Sold in port', plan.silver ? FC(Math.round(plan.silver)) : '—', plan.silver ? `the [Level 7]s, at the wharf${rate ? ` · ≈ ${FC(rate)} an hour under way` : ''}` : chosen.length ? 'no chain ticked sells' : 'pick a chain', 'gold')}
		${tile('Trades', F(plan.trades), `${F(Math.round(plan.parleyUsed))} Parley of ${F(plan.parleyBar)} · ${islands} island${islands === 1 ? '' : 's'}${wharfs ? ` · ${wharfs} wharf call${wharfs === 1 ? '' : 's'}` : ''}`)}
		${tile('Hold at its fullest', plan.stops.length ? `${F(Math.round(plan.weightPeak))} LT` : '—', `${F(me.hold.free)} is the limit · barters to ${F(me.hold.deal)} · moves to ${F(me.hold.max)}`, plan.weightPeak > me.hold.deal ? 'warn' : plan.weightPeak > me.hold.free ? 'amber' : 'teal')}
		${tile('Under way', legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `≈ ${esc(legs.time)} at ${me.speed.total}%${from ? ` from ${esc(from.name)}` : ''}` : 'pick a chain')}
	</div>`;
	const segs = plan.order.map((c, k) => {
		const first = plan.stops.findIndex(s => s.chain === k);
		const mine = plan.stops.filter(s => s.chain === k);
		const soldHere = plan.sold.filter(s => s.chain === k).reduce((a, s) => a + s.total, 0);
		const leftHere = plan.stashed.filter(s => s.chain === k).reduce((a, s) => a + s.total, 0);
		return `<section class="panel run-seg" style="--tier:${TIER(c.top)}">
			<div class="run-seg-head"><i></i><b>${esc(c.rungs[0].npc)} chain</b><em>Level ${c.top}</em><span>${soldHere ? `${FC(Math.round(soldHere))} sold` : 'nothing sold'}${leftHere ? ` · ${FC(Math.round(leftHere))} left on the way` : ''}${mine.length ? '' : ' · every island already dealt'}</span><button class="map-x" data-act="barter-chain" data-id="${esc(c.id)}" aria-label="Untick this chain">×</button></div>
			${mine.length ? `<div class="run-stops">${stopRows(mine, legs, { k0: first, board: true })}</div>` : ''}
		</section>`;
	}).join('');
	const worth = s => (s.total ? `would sell for ${FC(Math.round(s.total))}` : 'cannot be sold');
	const goodLine = (s, at) => `<div class="run-good"><i style="--tier:${TIER(levelOf(s.item))}">${levelOf(s.item) ? `L${levelOf(s.item)}` : '·'}</i>${img(s.item, 'row-icon sm')}<b>${n1(s.n)}×</b><span>${esc(s.item)}</span>${at ? `<span class="faint">at ${esc(at)}</span>` : ''}<span class="run-good-worth">${worth(s)}</span></div>`;
	const list = (title, sub, rows, cls = '') => (rows.length ? `<section class="panel run-list ${cls}"><div class="panel-head"><h2 class="panel-title">${title}</h2><span class="panel-sub">${sub}</span></div>${rows}</section>` : '');
	const bought = list('Bought ashore', 'before casting off', plan.bought.map(s => `<div class="run-good">${img(s.item, 'row-icon sm')}<b>${F(Math.ceil(s.n))}×</b><span>${esc(s.item)}</span></div>`).join(''));
	const stashed = list('Left on the way', 'waiting for another board', plan.stashed.map(s => goodLine(s, s.at)).join(''), 'gold');
	const kept = list('Carried home', 'aboard at the end', plan.kept.map(s => goodLine(s, '')).join(''));
	const empty = chosen.length ? '' : '<div class="run-empty">Nothing ticked yet. Pick a chain on the left and the run lays itself out here — every rung, the hold after it, and where it has to call.</div>';
	return {
		chains: chainsPanel,
		run: `<section class="panel barter-run">${runHead}${tiles}</section>${empty}${bought}${segs}${stashed}${kept}${chartButton(plan.stops, '')}`
	};
}

function materialHTML(me, data) {
	const it = itemNow();
	if (!it) return '<p class="empty">The barter table deals no material the app knows.</p>';
	const short = (snapshot && snapshot.missing && Number(snapshot.missing[it])) || 0;
	const pick = `<div class="barter-for">
		<button class="trip-pick" data-act="barter-item" title="Choose the material">${img(it, 'row-icon sm')}<span>${esc(it)}</span> ▾</button>
		<span class="barter-qty">${amountInput('purse-inline', qty, 'data-act="barter-qty" aria-label="How many"')} wanted${short ? ` · <button class="linky" data-act="barter-qty-short" data-n="${Math.ceil(short)}">your builds are short ${F(Math.ceil(short))}</button>` : ''}</span>
	</div>`;
	const from = fromPort();
	const plan = materialPlan({ item: it, qty, stock: store.getAllStock(), barterData: data, npcById, start: from, hold: me.hold });
	if (!plan) return `${pick}<p class="empty">No exchange in the table hands over ${esc(it)}.</p>`;
	for (const s of plan.stops) s.hold = me.hold;
	const legs = legsOf(plan.stops);
	// The first thing to get, in one line.
	let first;
	if (plan.covered) first = `<p class="map-hint ok">What is aboard already covers the top exchange: ${F(Math.ceil(plan.rungs[0].giveNeed))}× ${esc(plan.rungs[0].give)} wanted, ${F(plan.rungs[0].have)} aboard.</p>`;
	else if (plan.first && plan.first.ashore) first = `<p class="map-hint"><b>First, ashore:</b> ${F(Math.ceil(plan.first.n))}× ${esc(plan.first.item)} — the floor of the ladder, bought on land. Nothing aboard shortens the climb.</p>`;
	else if (plan.first) first = `<p class="map-hint"><b>First:</b> ${F(Math.ceil(plan.first.n))}× ${esc(plan.first.item)} more — the lowest rung the hold does not cover; what is aboard above it is used.</p>`;
	else first = '';
	const rungs = [...plan.rungs].reverse().map(r => {
		const ok = r.short <= 0;
		const isl = r.stops.length ? r.stops.map(s => `${s.npc}${s.times > 1 ? ` ×${s.times}` : ''}`).join(', ') : 'no island';
		return `<div class="detail-line barter-rung${ok ? ' ok' : ''}">
			<span>${img(r.give, 'row-icon sm')} ${F(Math.ceil(r.giveNeed))}× ${esc(r.give)} → ${img(r.item, 'row-icon sm')} ${esc(r.item)}</span>
			<span class="n ${ok ? 'teal' : r.have ? 'blue' : 'faint'}">${ok ? `${F(r.have)} aboard, enough` : r.have ? `${F(r.have)} aboard, ${F(Math.ceil(r.short))} to get` : `${r.trades} trade${r.trades === 1 ? '' : 's'}`}</span>
			<span class="barter-rung-sub">${ok ? 'nothing to trade here' : `${r.trades} trade${r.trades === 1 ? '' : 's'} at ${esc(isl)}${r.refreshes > 1 ? ` · over ${r.refreshes} refreshes` : ''}`}</span>
		</div>`;
	}).join('');
	const stats = `<div class="map-stats barter-stats">
		<div><div class="summary-k">Trades</div><div class="summary-v">${F(plan.rungs.reduce((a, r) => a + (r.short > 0 ? r.trades : 0), 0))}</div>
			<div class="summary-sub">${plan.refreshes > 1 ? `over ${plan.refreshes} refreshes at best` : 'one sitting at best'} · the islands’ attempts, one exchange each</div></div>
		<div><div class="summary-k">Hold at its fullest</div><div class="summary-v${plan.weightPeak > me.hold.max ? ' amber' : ''}">${F(Math.round(plan.weightPeak))} LT</div>
			<div class="summary-sub">${F(me.hold.free)} without slowing · ${F(me.hold.max)} at most</div></div>
		${legs.total ? `<div><div class="summary-k">Under way</div><div class="summary-v">${esc(fmtDistance(legs.total))}</div>
			<div class="summary-sub">≈ ${esc(legs.time)} at ${me.speed.total}%${from ? ` from ${esc(from.name)}` : ''}</div></div>` : ''}
		<div><div class="summary-k">Stops</div><div class="summary-v">${plan.stops.length}</div>
			<div class="summary-sub">each island dealing once a refresh</div></div>
	</div>`;
	return `${pick}${first}
		<div class="detail-block"><div class="detail-label">The ladder, from the bottom</div>${rungs}</div>
		${plan.stops.length ? `${stats}<div class="detail-block"><div class="detail-label">Stops, in sailing order</div><div class="run-stops">${stopRows(plan.stops, legs)}</div></div>` : ''}
		${chartButton(plan.stops, it)}`;
}

export function renderBarter() {
	restore();
	const me = currentShip();
	const b = boardNow();
	if (!barterData) return '<p class="empty">Reading the barter table…</p>';
	const parts = goal === 'material'
		? { chains: '', run: `<section class="panel barter-run"><div class="panel-head"><h2 class="panel-title plain">A run for a material</h2></div><div class="run-picks one"><label class="run-pick"><span class="run-pick-k">sails from</span><select class="field select" data-act="barter-port"><option value="0"${port ? '' : ' selected'}>the first stop</option>${ports.map(p => `<option value="${p.id}"${p.id === port ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label></div>${b.combo ? '' : '<p class="panel-sub barter-caveat">Until the board is known, an island shows one exchange a refresh, drawn from the table at random, and this is the run the table allows at best — the same reading the Get tab’s forecasts make — with every island dealing once and the hold weighed at every stop.</p>'}${materialHTML(me, b.data)}</section>` }
		: silverParts(me, b);
	return `<div class="barter-screen">
		${boardHTML(b)}
		<div class="barter-layout">
			<div class="barter-left">${holdHTML(me)}${parts.chains}</div>
			<div class="barter-right">${parts.run}</div>
		</div>
	</div>`;
}

/* ------------------------------------------------------------------ *
 * what the tab answers to
 * ------------------------------------------------------------------ */

function pickGood(then) {
	const stock = store.getAllStock();
	const items = tradeGoodNames.filter(n => !(stock[n] > 0)).map(n => ({
		id: n, label: n, icon: img(n, ''), group: `Level ${levelOf(n)}`,
		meta: `${F(GOODS[levelOf(n)].weight)} LT`, sub: sellOf(n) ? `a barterer pays ${FC(sellOf(n))}` : 'cannot be sold'
	}));
	openPicker({
		title: 'Which good is aboard?',
		hint: 'One of the sea trade goods. Its count lives in the Inventory, under Trade goods.',
		items,
		onPick: name => { store.setStock(name, 1); then(); }
	});
}

function pickMaterial(then) {
	const list = materials();
	openPicker({
		title: 'A run for which material?',
		hint: 'What your builds are short of comes first.',
		items: list.map(m => ({
			id: m.name, label: m.name, icon: img(m.name, ''),
			group: m.short ? 'Your builds are short of' : 'Everything the table deals',
			meta: m.short ? `${F(Math.ceil(m.short))} short` : ''
		})),
		selected: itemNow(),
		onPick: name => { item = name; persist(); then(); }
	});
}

/** What one island is showing: its possible offers, commonest first. */
function pickOffer(npcId, then) {
	const { standing } = boardNow();
	const npc = npcById.get(npcId);
	const items = offersAt(standing, npcId).map(o => ({
		id: `${o.give}|${o.recv}`, label: `${o.give} → ${o.recv}`, icon: img(o.recv, ''),
		sub: `hands over ${o.qty}× ${o.give}`,
		meta: standing.length > 1 ? `${o.ids.length} of ${standing.length}` : ''
	}));
	items.push({ id: '', label: 'Something else', sub: 'an offer the record has never seen there', group: '' });
	openPicker({
		title: `What does ${npc.name} show?`,
		hint: `${npc.at}. The offer on the barter window right now.`,
		items,
		onPick: id => {
			if (!id) { toast('The record has no layout with that offer; the run stays on the whole table'); return; }
			const [give, recv] = id.split('|');
			board.answers.push({ npcId, give, recv });
			persist();
			then();
		}
	});
}

/** An island of the player's own choosing, the telling ones first. */
function pickIsland(then) {
	const { standing } = boardNow();
	const list = askable(standing, npcById, fromPort());
	openPicker({
		title: 'Which island are you looking at?',
		hint: 'The ones whose offer tells the layouts apart best come first.',
		items: list.map(a => {
			const n = npcById.get(a.npcId);
			return { id: String(a.npcId), label: n.name, sub: n.at, icon: '', meta: a.worst > 1 ? `${a.worst} left at worst` : 'settles it' };
		}),
		onPick: id => pickOffer(Number(id), then)
	});
}

/** A click on the tab. Returns true when it was one of ours, with the
 *  screen to be redrawn by the caller. */
export function barterAction(act, el, redraw) {
	switch (act) {
		case 'barter-goal': goal = el.dataset.id === 'material' ? 'material' : 'silver'; persist(); return true;
		case 'barter-add': pickGood(redraw); return false;
		case 'barter-item': pickMaterial(redraw); return false;
		case 'barter-good': store.addStock(el.dataset.item, Number(el.dataset.delta)); return false;
		case 'barter-good-drop': store.setStock(el.dataset.item, 0); return false;
		case 'barter-qty-short': qty = Math.max(1, Number(el.dataset.n) || 1); persist(); return true;
		case 'barter-trip': openTripLog(); return false;
		case 'barter-board-ask': pickOffer(Number(el.dataset.npc), redraw); return false;
		case 'barter-board-island': pickIsland(redraw); return false;
		case 'barter-board-undo': board.answers.pop(); persist(); return true;
		case 'barter-board-clear': board.answers = []; persist(); return true;
		case 'barter-chain': {
			const id = el.dataset.id;
			routes.ids = routes.ids.includes(id) ? routes.ids.filter(x => x !== id) : [...routes.ids, id];
			persist();
			return true;
		}
		case 'barter-chains-clear': routes.ids = []; persist(); return true;
		default: return false;
	}
}

/** A value typed or chosen on the tab. */
export function barterChange(el, parseAmount) {
	switch (el.dataset.act) {
		case 'barter-port': port = ports.some(p => p.id === Number(el.value)) ? Number(el.value) : 0; persist(); return true;
		case 'barter-qty': {
			const n = parseAmount(el.value);
			if (n === null) return true;
			qty = Math.max(1, Math.min(9999, Math.floor(n)));
			persist();
			return true;
		}
		case 'barter-good-set': {
			const n = parseAmount(el.value);
			if (n === null) return true;
			store.setStock(el.dataset.item, n);
			return true;
		}
		case 'barter-pace': pace = el.value === 'full' ? 'full' : 'fast'; persist(); return true;
		case 'barter-stash': stash = STASHES.includes(el.value) ? el.value : ''; persist(); return true;
		default: return false;
	}
}

/** The stops as a chart link fragment, for the Map to take in. */
export function chartFragment(el) {
	const ids = String(el.dataset.ids || '').split('.').filter(Boolean);
	if (!ids.length) { toast('Nothing to draw'); return null; }
	const parts = [`r=${ids.join('.')}`];
	if (port) parts.push(`s=${port}`);
	if (el.dataset.pick) parts.push(`p=${encodeURIComponent(el.dataset.pick)}`);
	if (el.dataset.trades) parts.push(`x=${encodeURIComponent(el.dataset.trades)}`);
	if (el.dataset.stash && el.dataset.stash !== '[]') parts.push(`w=${encodeURIComponent(el.dataset.stash)}`);
	return parts.join(';');
}
