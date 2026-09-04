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
import { pathLength, legLengths, sailRange, fmtRange, fmtDistance, DEFAULT_CAL, sailSeconds } from './sailing.js';
import { PRESETS, SELL_CHOICES, HOUR_CHOICES, readOrders, presetOrders, onPreset, yardsticks } from './barter-orders.js';
import { propose } from './barter-optimizer.js';
import { coins as coinShop } from './sea_coins.js';
import { landPrices } from './land-cost.js';
import { marketStatus, marketSilver } from './market.js';
import { GOODS, PARLEY, parleyPerTrade, levelOf } from './barter.js';
import { materialPlan, goodsHeld, weightOf, sellOf } from './barter-plan.js';
import { TOWNS } from './screen-inventory.js';
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
let stash = '';          // the wharf goods are left at, '' for the nearest
let board = { day: '', answers: [] };   // what islands were seen to show today: { npcId, give, recv }
let proposed = { key: '', proposals: [], best: null, solos: new Map() };   // the runs worth sailing, for one set of inputs
const legsCache = new Map();   // the legs of a run bent round the land, by its stops
let lastSearch = null;   // what the last search was given, for "fill the rest
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
		if (STASHES.includes(s.stash)) stash = s.stash;
		if (s.routes && typeof s.routes.key === 'string' && Array.isArray(s.routes.ids)) routes = { key: s.routes.key, ids: s.routes.ids.filter(id => typeof id === 'string') };
		if (s.board && Array.isArray(s.board.answers)) {
			board = { day: String(s.board.day || ''), answers: s.board.answers.filter(a => a && npcById.has(Number(a.npcId)) && typeof a.give === 'string' && typeof a.recv === 'string').map(a => ({ npcId: Number(a.npcId), give: a.give, recv: a.recv })) };
		}
	} catch { /* a fresh tab */ }
}

function persist() {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify({ goal, item, qty, port, routes, stash, board }));
	} catch { /* private mode; the session still works */ }
}

/* ------------------------------------------------------------------ *
 * the hold
 * ------------------------------------------------------------------ */

/**
 * What is aboard: the goods noted in the ship's hold, and the goods no
 * storage claims -- a good just bartered is in the ship's inventory
 * until it is put ashore. Goods noted at a harbour are ashore, and a
 * run loads them only from the harbour it sails from.
 */
function aboardStock() {
	const out = {};
	for (const [name, qty] of Object.entries(store.getAllStock())) {
		if (levelOf(name) === null || !(qty > 0)) continue;
		const n = store.stockAt(name, '') + store.stockAt(name, store.ABOARD);
		if (n > 0) out[name] = n;
	}
	return out;
}

/** The goods at the storage of the harbour the run sails from. */
function dockStock() {
	const from = fromPort();
	if (!from) return {};
	const out = {};
	for (const [name, qty] of Object.entries(store.getAllStock())) {
		if (levelOf(name) === null || !(qty > 0)) continue;
		const n = store.stockAt(name, from.name);
		if (n > 0) out[name] = n;
	}
	return out;
}

/** The goods ashore, by harbour: [{ town, goods: [{ name, lv, n }] }],
 *  the run's start port first. */
function ashore() {
	const from = fromPort();
	const byTown = new Map();
	for (const [name, qty] of Object.entries(store.getAllStock())) {
		if (levelOf(name) === null || !(qty > 0)) continue;
		for (const town of TOWNS) {
			if (town === store.ABOARD) continue;
			const n = store.stockAt(name, town);
			if (n > 0) {
				if (!byTown.has(town)) byTown.set(town, []);
				byTown.get(town).push({ name, lv: levelOf(name), n });
			}
		}
	}
	return [...byTown].map(([town, goods]) => ({ town, here: !!from && from.name === town, goods: goods.sort((a, b) => b.lv - a.lv || a.name.localeCompare(b.name)) }))
		.sort((a, b) => Number(b.here) - Number(a.here) || a.town.localeCompare(b.town));
}

/** The goods aboard: name, level, count, weight; heaviest level first. */
function held() {
	return [...goodsHeld(aboardStock())]
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
		${ashoreHTML()}
	</section>`;
}

/**
 * The goods ashore, harbour by harbour, each with a button that puts
 * it aboard. The harbour the run sails from is first and its goods
 * are the ones the chains can start from; a harbour elsewhere says
 * so, since the ship is not there to load them.
 */
function ashoreHTML() {
	const towns = ashore();
	if (!towns.length) return '';
	const from = fromPort();
	const groups = towns.map(t => `<div class="ashore-town${t.here ? ' here' : ''}">
		<div class="ashore-head"><b>${esc(t.town)}</b><span>${t.here ? 'the run sails from here — its goods can be loaded' : from ? 'not where the run starts' : 'choose where the run sails from to load these'}</span></div>
		${t.goods.map(g => `<div class="barter-good ashore-good">
			${img(g.name, 'row-icon')}
			<span class="map-row-main">
				<span class="map-row-name">${codexName(g.name)}</span>
				<span class="map-row-sub">${F(g.n)} here · ${F(g.n * weightOf(g.name))} LT to carry${sellOf(g.name) ? ` · a barterer pays ${FC(sellOf(g.name))} each` : ''}</span>
			</span>
			<button class="ghost-btn sm" data-act="barter-load" data-item="${esc(g.name)}" data-town="${esc(t.town)}" data-n="${g.n}" title="Put all ${g.n} aboard">Load ${F(g.n)}</button>
		</div>`).join('')}
	</div>`).join('');
	return `<div class="ashore"><div class="ashore-k">Ashore</div>${groups}</div>`;
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
			? `${s.dropped.length ? `<div class="run-leave"><span class="run-leave-k">Leaves in storage</span>${s.dropped.map(d => `<span class="run-leave-good">${img(d.item, 'row-icon sm')}<b>${n1(d.n)}×</b>${esc(d.item)}</span>`).join('')}</div>` : ''}${s.sale ? `<div class="run-sell">sells ${n1(s.sale.n)} ${s.sale.levels && s.sale.levels.length === 1 ? `[Level ${s.sale.levels[0]}]` : 'goods'} here for ${FC(Math.round(s.sale.total))}</div>` : ''}`
			: `<div class="run-trade">${img(s.give, 'row-icon sm')}<span>${esc(s.giveText)}× ${esc(s.give)}</span><span class="run-arrow">→</span><span class="run-to" style="--tier:${TIER(levelOf(s.item))}"><i></i>${esc(s.recvText)}× ${esc(s.item)}${four(s)}</span><span class="run-times">×${s.times}</span>${img(s.item, 'row-icon sm')}</div>`;
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

/* ------------------------------------------------------------------ *
 * the sailing orders
 * ------------------------------------------------------------------ */

/** The orders as saved, cleaned; the cash-out preset until any are. */
const ordersNow = () => readOrders(store.getProfile('orders', null));
function setOrders(patch) {
	store.setProfile('orders', readOrders({ ...ordersNow(), ...patch }));
}

/**
 * A rough sailing time for a chain on its own, for the yardstick on
 * its row: straight lines from the start through its islands and back
 * to the nearest wharf, stretched a quarter for the land in the way.
 * The run itself bends every leg round the coast.
 */
function roughHours(c, from) {
	const me = currentShip();
	const pts = [...(from ? [from] : []), ...c.rungs.map(r => npcById.get(r.npcId)).filter(Boolean)];
	const last = pts[pts.length - 1];
	const back = last && stashes.length ? stashes.reduce((a, w) => (Math.hypot(w.x - last.x, w.y - last.y) < Math.hypot(a.x - last.x, a.y - last.y) ? w : a)) : null;
	if (back) pts.push(back);
	if (pts.length < 2) return 0;
	return sailSeconds(pathLength(pts) * 1.25, me.speed.total, sailCal()) / 3600;
}

/** Silver a Parley unit, short: 2.8m → "2.8m/u". */
const perUnitText = v => (v > 0 ? `${FC(Math.round(v))}/unit` : '');
const perHourText = v => (v > 0 ? `${FC(Math.round(v))}/h` : '');

/**
 * The orders bar: the preset, and the drawer of what it set -- which
 * levels a wharf sells, the floor kept back of each level, whether
 * land goods are bought, the pace, where goods are left, where the
 * run sails from.
 */
function ordersHTML(o) {
	const adjusted = !onPreset(o);
	const presets = PRESETS.map(p => `<button class="seg${o.preset === p.id ? ' on' : ''}" data-act="barter-preset" data-id="${p.id}" title="${esc(p.sub)}">${esc(p.label)}</button>`).join('');
	const sel = (act, label, value, options, title = '') => `<label class="run-pick" ${title ? `title="${esc(title)}"` : ''}><span class="run-pick-k">${label}</span><select class="field select" data-act="${act}">${options.map(([v, t]) => `<option value="${esc(String(v))}"${String(v) === String(value) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
	const floors = [1, 2, 3, 4, 5, 6].map(lv => `<label class="run-floor" style="--tier:${TIER(lv)}"><i>${lv}</i>${amountInput('purse-inline', o.floors[lv] || '', `data-act="barter-floor" data-lv="${lv}" placeholder="0" aria-label="Keep back of Level ${lv}"`)}</label>`).join('');
	return `<div class="orders">
		<div class="orders-head">
			<span class="run-pick-k">the run is for</span>
			<span class="segs" role="group" aria-label="What the run is for">${presets}</span>
			${adjusted ? `<span class="orders-adjusted">adjusted · <button class="linky" data-act="barter-preset" data-id="${esc(o.preset)}">back to the preset</button></span>` : `<span class="orders-sub">${esc((PRESETS.find(p => p.id === o.preset) || PRESETS[0]).sub)}</span>`}
		</div>
		<div class="run-picks">
			${sel('barter-sell', 'a wharf sells', o.sell, SELL_CHOICES, 'Which goods a wharf call turns into silver; Level 1 and 2 never sell')}
			${sel('barter-buy', 'land goods', o.buy ? 'yes' : 'no', [['yes', 'bought ashore when a chain starts there'], ['no', 'only what is held — no land chains']])}
			${sel('barter-pace', 'pace', o.pace, [['fast', 'fast: no wharf calls, never slower'], ['full', 'every attempt, storage on the way']])}
			${sel('barter-stash', 'storage at', stash, [['', 'the nearest wharf'], ...stashes.map(w => [w.at, w.at])])}
			${sel('barter-port', 'sails from', port, [[0, 'the first stop'], ...ports.map(p => [p.id, p.name])])}
			${sel('barter-hours', 'under way at most', o.hours, HOUR_CHOICES, 'A run proposed here sails no longer than this')}
		</div>
		<div class="run-floors" title="Kept back for the boards to come: never sold, never spent below this many">
			<span class="run-pick-k">keep back, of every good at a level</span>${floors}
		</div>
	</div>`;
}

/** One chain of the board, to tick: where it starts, how far it
 *  reaches, the islands, the goods, and what one pass of it pays. */
function chainRow(c, on, solo, dockName, from) {
	// The pips are the rungs this chain climbs: from the shore up for a
	// land chain, from the good held for the rest -- a [Level 5] aboard
	// shows 5, 6, 7, not the ladder beneath it.
	const floor = c.from === 'land' ? 1 : levelOf(c.item);
	const pips = [1, 2, 3, 4, 5, 6, 7].filter(l => l >= floor && l <= c.top)
		.map(l => `<i class="${l === floor && c.from !== 'land' ? 'held' : 'on'}${l === c.top ? ' top' : ''}" style="--tier:${TIER(l)}">${l}</i>`).join('');
	const start = c.from === 'land'
		? `<b>${F(c.rungs[0].giveN)}× ${esc(c.item)}</b><span>bought ashore</span>`
		: c.from === 'dock'
			? `<b>${n1(c.load)}× ${esc(c.item)}</b><span>at ${esc(dockName || 'the wharf')} · loaded before casting off</span>`
			: `<b>${n1(c.have)}× ${esc(c.item)}</b><span>already aboard${c.load ? ` · ${n1(c.load)} more at ${esc(dockName || 'the wharf')}` : ''}</span>`;
	return `<button class="chain${on ? ' on' : ''}" data-act="barter-chain" data-id="${esc(c.id)}" style="--tier:${TIER(c.top)}">
		<span class="chain-mark">${on ? '✓' : ''}</span>
		<span class="chain-main">
			<span class="chain-start">${start}</span>
			<span class="chain-pips">${pips}<em>Level ${c.top}</em></span>
			<span class="chain-route">${c.rungs.map(r => esc(r.npc)).join(' › ')}</span>
			<span class="chain-goods">${c.rungs.map(r => img(r.item, 'row-icon sm')).join('')}</span>
		</span>
		<span class="chain-right">
			<b class="${solo.silver ? '' : 'none'}${solo.net < 0 ? ' warn' : ''}">${solo.silver ? FC(Math.round(solo.net)) : '—'}</b>
			${solo.silver ? `<span class="chain-yard">${[solo.yard.perUnit ? `<em>${esc(perUnitText(solo.yard.perUnit))}</em>` : '', solo.yard.perHour ? esc(perHourText(solo.yard.perHour)) : ''].filter(Boolean).join(' · ')}</span>` : ''}
			${solo.cost ? `<span>${FC(Math.round(solo.silver))} sold · ${FC(Math.round(solo.cost))} bought</span>` : solo.bought.some(b => b.how === 'unpriced') ? '<span class="faint">land goods unpriced</span>' : ''}
			<span>${solo.keptWorth ? `${FC(Math.round(solo.keptWorth))} left over` : solo.silver ? 'nothing left over' : 'nothing to sell at this reach'}</span>
			<span>${c.rungs.length} island${c.rungs.length === 1 ? '' : 's'}${from ? '' : ''}</span>
		</span>
	</button>`;
}

/**
 * A chain's run on its own, with the yardsticks on it. What the run
 * would sell anyway -- goods aboard the orders let a wharf sell -- is
 * taken off, so the row says what the chain itself adds.
 */
function soloRun(c, opts, from, base) {
	const run = chainRun({ ...opts, chosen: [c] });
	run.silver = Math.max(0, run.silver - base.silver);
	run.net = run.silver - run.cost;
	run.keptWorth = Math.max(0, run.keptWorth - base.keptWorth);
	run.yard = yardsticks(run.net, run.parleyUsed - base.parleyUsed, roughHours(c, from));
	return run;
}

let expected = { key: '', value: null };

/**
 * What the best run would pay on each layout still standing, weighed
 * by how often each has been seen: the mean, the ends, and the layout
 * that pays best. A quick search, one set at a time, since forty
 * boards are searched at once; kept until the inputs change.
 */
function expectedBest(me, b, prof) {
	if (!combos || !b.standing.length) return null;
	const o = ordersNow();
	const from = fromPort();
	const stock = aboardStock(), dock = dockStock();
	const made = store.getProfile('homemade', []) || [];
	const ship = { speed: me.speed.total, cal: sailCal() };
	const key = JSON.stringify([board.day, b.standing.map(c => c.id), stock, dock, o, port, stash, made, me.hold, ship, Object.keys(marketSilver()).length]);
	if (expected.key === key) return expected.value;
	const parley = parleyOf(prof);
	let sum = 0, weight = 0, min = Infinity, max = -Infinity, best = null;
	for (const combo of b.standing) {
		const data = boardData(combo, barterData, npcById);
		const all = chains(data, stock, dock).filter(c => o.buy || c.from !== 'land');
		const prices = landPrices(all.filter(c => c.from === 'land').map(c => c.item), made);
		const opts = { stock, dock, hold: me.hold, parley, npcById, start: from, stashes, prefer: stashAt(), pace: o.pace, orders: o, prices };
		const { best: top } = propose({ chains: all, opts, ship, timeCap: o.hours, width: 1, depth: 6 });
		const v = top ? top.value : 0;
		const w = Math.max(1, combo.seen || 1);
		sum += v * w;
		weight += w;
		if (v < min) min = v;
		if (v > max) { max = v; best = top ? { id: combo.id, what: `${top.ids.length} chain${top.ids.length === 1 ? '' : 's'}, ${FC(Math.round(top.value))}${top.hours ? ` in ≈ ${fmtRange(top.hours * 3600 * 0.9, top.hours * 3600 * 1.1)}` : ''}` } : null; }
	}
	expected = { key, value: { n: b.standing.length, mean: weight ? sum / weight : 0, min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max, best } };
	return expected.value;
}

/** What a Crow Coin is worth in silver at the coin shop's best rate:
 *  the shop item whose Market price buys the most per coin. */
function coinWorth() {
	const silver = marketSilver();
	let best = null;
	for (const [item, price] of Object.entries(coinShop)) {
		if (!(price > 0) || !(silver[item] > 0)) continue;
		const each = silver[item] / price;
		if (!best || each > best.each) best = { item, each };
	}
	return best;
}

/**
 * The run for silver, in two panels: the board's chains to tick, and
 * the run along the ticked ones -- its figures, each chain's stops as
 * a timeline, what was bought, left on the way and carried home.
 */
function silverParts(me, b) {
	const from = fromPort();
	const head = `<div class="panel-head"><h2 class="panel-title">Chains on offer</h2><span class="panel-sub">tick the ones to sail</span><span class="panel-spacer"></span>${routes.ids.length ? '<button class="linky" data-act="barter-chains-clear">clear</button>' : ''}</div>`;
	const headFill = fill => `<div class="panel-head"><h2 class="panel-title">Chains on offer</h2><span class="panel-sub">tick the ones to sail</span><span class="panel-spacer"></span>${fill ? '<button class="chip tiny primary" data-act="barter-fill" title="Keep what is ticked and add the chains that pay best beside it">fill the rest for me</button>' : ''}${routes.ids.length ? '<button class="linky" data-act="barter-chains-clear">clear</button>' : ''}</div>`;
	const prof = barterProfile();
	if (!b.combo) {
		const ev = expectedBest(me, b, prof);
		const evHTML = ev && ev.n ? `<div class="run-ev">
			<div class="run-tiles">
				<div><div class="summary-k">The best run, on average</div><div class="summary-v gold">${FC(Math.round(ev.mean))}</div><div class="summary-sub">across the ${ev.n} layout${ev.n === 1 ? '' : 's'} still standing, each weighed by how often it has been seen · under these orders</div></div>
				<div><div class="summary-k">From the worst board to the best</div><div class="summary-v">${FC(Math.round(ev.min))} – ${FC(Math.round(ev.max))}</div><div class="summary-sub">${ev.best ? `the best is layout ${esc(ev.best.id)}: ${esc(ev.best.what)}` : ''}</div></div>
			</div>
			<p class="panel-sub barter-caveat">One look at an island names the layout, and the chains and the runs worth sailing follow. The value counts silver net of land goods and the goods kept.</p>
		</div>` : '';
		return {
			chains: `<section class="panel barter-chains">${head}<p class="empty">The chains follow the board: look at one island in the game and tap what it shows.</p></section>`,
			run: `<section class="panel barter-run"><div class="panel-head run-head"><h2 class="panel-title plain">The run</h2><span class="panel-sub">what today could pay, before the board is known</span></div>${ordersHTML(ordersNow())}${evHTML || '<p class="empty">Nothing to lay out until the board is known.</p>'}</section>`
		};
	}
	const o = ordersNow();
	const pace = o.pace;
	const stock = aboardStock(), dock = dockStock();
	// Land chains only when the orders buy ashore.
	const all = chains(b.data, stock, dock).filter(c => o.buy || c.from !== 'land');
	const made = store.getProfile('homemade', []) || [];
	const prices = landPrices(all.filter(c => c.from === 'land').map(c => c.item), made);
	const opts = { stock, dock, hold: me.hold, parley: parleyOf(prof), npcById, start: from, stashes, prefer: stashAt(), pace, orders: o, prices };
	// Each chain on its own, for its row: the list is sorted by the
	// yardstick, silver a Parley unit, the guide's measure of a chain,
	// so the best use of the day's Parley is at the top of its group.
	// The runs worth sailing, searched once for these inputs and kept
	// until any of them change; each chain's run on its own likewise.
	const ship = { speed: me.speed.total, cal: sailCal() };
	const pkey = JSON.stringify([board.day, b.combo.id, stock, dock, o, port, stash, Object.values(prices).map(x => x.each), me.hold, ship, opts.parley]);
	if (proposed.key !== pkey) {
		const base = chainRun({ ...opts, chosen: [] });
		proposed = { key: pkey, solos: new Map(all.map(c => [c.id, soloRun(c, opts, from, base)])), ...propose({ chains: all, opts, ship, timeCap: o.hours }) };
	}
	lastSearch = { chains: all, opts, ship, timeCap: o.hours };
	const solos = proposed.solos;
	all.sort((x, y) => y.top - x.top || (solos.get(y.id).yard.perUnit - solos.get(x.id).yard.perUnit) || x.rungs.length - y.rungs.length || x.rungs[0].npc.localeCompare(y.rungs[0].npc));
	const key = `${board.day}|${b.combo.id}`;
	if (routes.key !== key) routes = { key, ids: proposed.best ? proposed.best.ids : all.length ? [all[0].id] : [] };
	const chosen = all.filter(c => routes.ids.includes(c.id));
	const sameSet = (x, y) => x.length === y.length && x.slice().sort().join('|') === y.slice().sort().join('|');
	const cards = proposed.proposals.map(p => {
		const isl = p.run.stops.filter(s => s.npcId).length;
		const on = sameSet(p.ids, routes.ids);
		return `<button class="proposal${on ? ' on' : ''}" data-act="barter-propose" data-ids="${esc(p.ids.join('\n'))}" title="${on ? 'This is the run laid out on the right' : 'Lay this run out on the right'}">
			<span class="proposal-k">${esc(p.label)}</span>
			<b>${FC(Math.round(p.value))}</b>
			<span class="proposal-yard">${[p.yard.perUnit ? `<em>${esc(perUnitText(p.yard.perUnit))}</em>` : '', p.yard.perHour ? esc(perHourText(p.yard.perHour)) : '', p.hours ? `≈ ${esc(fmtRange(p.hours * 3600 * 0.9, p.hours * 3600 * 1.1))}` : ''].filter(Boolean).join(' · ')}</span>
			<span class="proposal-sub">${p.ids.length} chain${p.ids.length === 1 ? '' : 's'} · ${isl} island${isl === 1 ? '' : 's'} · ${F(p.run.trades)} trades${p.run.cost ? ` · ${FC(Math.round(p.run.cost))} of land goods` : ''}</span>
		</button>`;
	}).join('');
	const proposals = `<div class="proposals">
		<div class="proposals-head"><span>Runs worth sailing</span><span class="faint">found on today’s board under these orders${o.hours ? `, within ${o.hours} hour${o.hours === 1 ? '' : 's'}` : ''} · the value counts silver net of land goods and the goods kept</span></div>
		${cards ? `<div class="proposal-cards">${cards}</div>` : '<p class="empty">Nothing on this board pays under these orders.</p>'}
	</div>`;
	const fillable = chosen.length > 0 && !proposed.proposals.some(p => sameSet(p.ids, routes.ids));
	const groups = [...new Set(all.map(c => c.top))].sort((a, b2) => b2 - a).map(top => {
		const rows = all.filter(c => c.top === top);
		return `<div class="chain-group"><div class="chain-group-head" style="--tier:${TIER(top)}"><i></i><span>Reaches Level ${top}</span><span>${rows.length}</span></div>${rows.map(c => chainRow(c, chosen.includes(c), solos.get(c.id), from && from.name, from)).join('')}</div>`;
	}).join('');
	const chainsPanel = `<section class="panel barter-chains">${headFill(fillable)}${proposals}<div class="chain-list">${groups || `<p class="empty">${o.buy ? 'Nothing climbs on this board.' : 'Nothing held climbs on this board. Let the run buy land goods, or load a good ashore.'}</p>`}</div></section>`;

	const plan = chainRun({ ...opts, chosen });
	for (const s of plan.stops) s.hold = me.hold;
	const legs = legsOf(plan.stops);
	const yard = yardsticks(plan.net, plan.parleyUsed, legs.mid / 3600);
	const islands = plan.stops.filter(s => s.npcId).length, wharfs = plan.stops.length - islands;
	// A fast run refuses a hold over the limit and trades nothing; say
	// so, since the empty run looks like a board with nothing on it.
	const heavy = pace === 'fast' && plan.trades === 0 && chosen.length > 0 && plan.weightStart > me.hold.free;
	const notice = heavy ? `<p class="run-notice warn">The hold is at ${F(Math.round(plan.weightStart))} LT, over the ${F(me.hold.free)} limit, and a fast run makes no wharf call — so nothing trades. Switch the pace to <b>every attempt</b> to call at a wharf first, or leave ${F(Math.round(plan.weightStart - me.hold.free))} LT ashore.</p>` : '';
	const soldLevels = [...new Set(plan.sold.map(x => levelOf(x.item)))].sort((a, b2) => b2 - a);
	const soldWhat = soldLevels.length ? (soldLevels.length === 1 ? `the [Level ${soldLevels[0]}]s` : `Level ${soldLevels[soldLevels.length - 1]} to ${soldLevels[0]}`) : '';
	const runHead = `<div class="panel-head run-head">
		<h2 class="panel-title plain">The run</h2>
		<span class="panel-sub">${chosen.length} chain${chosen.length === 1 ? '' : 's'} ticked · aboard ${esc(me.name)}: ${F(me.hold.free)} LT before it slows, barters up to ${F(me.hold.deal)} · goods counted at the least, weighed at the most</span>
	</div>
	${ordersHTML(o)}`;
	const tile = (k, v, sub, cls = '') => `<div><div class="summary-k">${k}</div><div class="summary-v${cls ? ` ${cls}` : ''}">${v}</div><div class="summary-sub">${sub}</div></div>`;
	const tiles = `<div class="run-tiles">
		${tile(plan.cost ? 'Silver, net' : 'Sold in port', plan.silver ? FC(Math.round(plan.net)) : '—', plan.silver ? `${soldWhat} sold at the wharf${plan.cost ? ` for ${FC(Math.round(plan.silver))} · ${FC(Math.round(plan.cost))} of land goods bought` : ''}${plan.bought.some(b => b.how === 'unpriced') ? ' · some land goods unpriced' : ''}` : chosen.length ? 'no chain ticked sells' : 'pick a chain', plan.net < 0 ? 'warn' : 'gold')}
		${tile('A Parley unit pays', yard.perUnit ? FC(Math.round(yard.perUnit)) : '—', yard.perUnit ? `${F(Math.round(plan.parleyUsed))} Parley of ${F(plan.parleyBar)} · ${F(plan.trades)} trade${plan.trades === 1 ? '' : 's'}${yard.perHour ? ` · ≈ ${FC(Math.round(yard.perHour))} an hour` : ''}` : `${F(plan.trades)} trade${plan.trades === 1 ? '' : 's'} · one unit is one normal trade’s Parley`, 'gold')}
		${tile('Hold at its fullest', plan.stops.length ? `${F(Math.round(plan.weightPeak))} LT` : '—', `${F(me.hold.free)} is the limit · barters to ${F(me.hold.deal)} · moves to ${F(me.hold.max)}`, plan.weightPeak > me.hold.deal ? 'warn' : plan.weightPeak > me.hold.free ? 'amber' : 'teal')}
		${tile('Under way', legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `≈ ${esc(legs.time)} at ${me.speed.total}% · ${islands} island${islands === 1 ? '' : 's'}${wharfs ? `, ${wharfs} wharf call${wharfs === 1 ? '' : 's'}` : ''}${from ? ` · from ${esc(from.name)}` : ''}` : 'pick a chain')}
	</div>${notice}`;
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
	const mk = marketStatus();
	const priceText = b => (b.how === 'made' ? 'made by your workers · costs the run nothing'
		: b.how === 'fixed' ? `${FC(b.each)} each · ${FC(b.total)}`
			: b.how === 'market' ? `${FC(b.each)} each on the Market · ${FC(b.total)}`
				: mk.count ? 'the Market has no price for it' : 'unpriced until the Market answers');
	const bought = list('Bought ashore', `before casting off${plan.cost ? ` · ${FC(Math.round(plan.cost))} in all` : ''}`, plan.bought.map(b => `<div class="run-good">${img(b.item, 'row-icon sm')}<b>${F(Math.ceil(b.n))}×</b><span>${esc(b.item)}</span><span class="faint">${esc(priceText(b))}</span><span class="run-good-worth"><button class="chip tiny${b.how === 'made' ? ' active' : ''}" data-act="barter-homemade" data-item="${esc(b.item)}" title="${b.how === 'made' ? 'Bought after all: price it from the Market' : 'Your workers make this: it costs the run nothing'}">${b.how === 'made' ? '✓ my workers make it' : 'my workers make it'}</button></span></div>`).join(''));
	const loaded = from ? list(`Loaded at ${esc(from.name)}`, 'from the storage, before casting off', plan.loaded.map(s => `<div class="run-good">${img(s.item, 'row-icon sm')}<b>${F(s.n)}×</b><span>${esc(s.item)}</span><span class="run-good-worth"><button class="ghost-btn sm" data-act="barter-load" data-item="${esc(s.item)}" data-town="${esc(from.name)}" data-n="${s.n}" title="Mark them aboard">Loaded ✓</button></span></div>`).join(''), 'teal') : '';
	const stashed = list('Left on the way', 'waiting for another board', plan.stashed.map(s => goodLine(s, s.at)).join(''), 'gold');
	const stockRows = plan.kept.filter(s => s.stock > 0).map(s => goodLine({ ...s, n: s.stock, total: s.stock * s.each }, '')).join('');
	const overRows = plan.kept.filter(s => s.n - s.stock > 1e-9).map(s => goodLine({ ...s, n: s.n - s.stock, total: (s.n - s.stock) * s.each }, '')).join('');
	const kept = list('Kept for the stock', 'the floor the orders keep back, for the boards to come', stockRows, 'teal')
		+ list('Carried home', o.sell <= 3 ? 'nothing pays for these, or no wharf was called at' : 'below the level a wharf sells under these orders', overRows);
	const empty = chosen.length ? '' : '<div class="run-empty">Nothing ticked yet. Pick a chain on the left and the run lays itself out here — every rung, the hold after it, and where it has to call.</div>';
	return {
		chains: chainsPanel,
		run: `<section class="panel barter-run">${runHead}${tiles}</section>${empty}${loaded}${bought}${segs}${stashed}${kept}${chartButton(plan.stops, '')}`
	};
}

/**
 * The run for a material, in the silver run's two panels: the ladder
 * on the left -- every rung from the shore to the material, with what
 * is aboard against what each hands over -- and the run on the right:
 * its choices, its figures, the stops rung by rung as a timeline.
 */
function materialParts(me, data, known) {
	const it = itemNow();
	const from = fromPort();
	const sel = (label, body) => `<label class="run-pick"><span class="run-pick-k">${label}</span>${body}</label>`;
	const portSel = `<select class="field select" data-act="barter-port">${[[0, 'the first stop'], ...ports.map(p => [p.id, p.name])].map(([v, t]) => `<option value="${esc(String(v))}"${String(v) === String(port) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
	const head = (sub) => `<div class="panel-head run-head">
		<h2 class="panel-title plain">The run</h2>
		<span class="panel-sub">${sub}</span>
	</div>`;
	const caveat = known ? '' : '<p class="panel-sub barter-caveat">Until the board is known, an island shows one exchange a refresh, drawn from the table at random, and this is the run the table allows at best — the same reading the Get tab’s forecasts make — with every island dealing once and the hold weighed at every stop.</p>';
	if (!it) {
		return {
			chains: `<section class="panel barter-chains"><div class="panel-head"><h2 class="panel-title">The ladder</h2></div><p class="empty">The barter table deals no material the app knows.</p></section>`,
			run: `<section class="panel barter-run">${head('for a material')}${caveat}</section>`
		};
	}
	const short = (snapshot && snapshot.missing && Number(snapshot.missing[it])) || 0;
	const picks = `<div class="run-picks">
		${sel('for', `<button class="trip-pick run-pick-item" data-act="barter-item" title="Choose the material">${img(it, 'row-icon sm')}<span>${esc(it)}</span> ▾</button>`)}
		${sel('how many', `<span class="run-pick-qty">${amountInput('purse-inline', qty, 'data-act="barter-qty" aria-label="How many"')}${short ? `<button class="linky" data-act="barter-qty-short" data-n="${Math.ceil(short)}" title="What your builds are still short of">short ${F(Math.ceil(short))}</button>` : '<span class="faint">wanted</span>'}</span>`)}
		${sel('sails from', portSel)}
	</div>`;
	// What is aboard and what the start harbour's storage holds, since
	// a run for a material loads what it needs before casting off.
	const stock = aboardStock();
	for (const [name, n] of Object.entries(dockStock())) stock[name] = (stock[name] || 0) + n;
	const plan = materialPlan({ item: it, qty, stock, barterData: data, npcById, start: from, hold: me.hold });
	const ladderHead = `<div class="panel-head"><h2 class="panel-title">The ladder</h2><span class="panel-sub">from the shore to ${esc(it)}</span></div>`;
	if (!plan) {
		return {
			chains: `<section class="panel barter-chains">${ladderHead}<p class="empty">No exchange in the table hands over ${esc(it)}.</p></section>`,
			run: `<section class="panel barter-run">${head(`for ${F(qty)}× ${esc(it)}`)}${picks}${caveat}</section>`
		};
	}
	for (const s of plan.stops) s.hold = me.hold;
	const legs = legsOf(plan.stops);
	const coin = it === 'Crow Coin' ? coinWorth() : null;
	const rungs = [...plan.rungs].reverse();   // the shore first
	const isl = r => (r.stops.length ? r.stops.map(s => `${s.npc}${s.times > 1 ? ` ×${s.times}` : ''}`).join(' › ') : 'no island deals it');

	// The ladder: one row a rung, in the chain rows' clothes, with the
	// level climbed to as the pips and the hold's answer on the right.
	const rows = rungs.map((r, k) => {
		const lv = levelOf(r.item), gl = levelOf(r.give) || 0;
		const ok = r.short <= 0;
		// The pips are the step this rung climbs: the give's level, drawn
		// as held when it is aboard, to the item's -- or to "the material".
		const pips = [1, 2, 3, 4, 5, 6, 7].filter(l => l >= Math.max(1, gl) && l <= (lv || gl))
			.map(l => `<i class="${l === gl && r.have > 0 ? 'held' : 'on'}${l === lv ? ' top' : ''}" style="--tier:${TIER(l)}">${l}</i>`).join('');
		const tr = `${r.trades} trade${r.trades === 1 ? '' : 's'}${r.refreshes > 1 ? ` · ${r.refreshes} refreshes` : ''}`;
		const right = ok
			? `<b class="ok">${F(r.have)}</b><span>aboard, enough</span><span>${tr}</span>`
			: r.have
				? `<b>${F(r.have)}</b><span>aboard · ${F(Math.ceil(r.short))} to get</span><span>${tr}</span>`
				: `<b class="none">—</b><span>${r.seed ? 'bought ashore' : 'none aboard'}</span><span>${tr}</span>`;
		return `<div class="chain rung${ok ? ' ok' : ''}" style="--tier:${TIER(lv || gl + 1)}">
			<span class="chain-mark rung-k">${k + 1}</span>
			<span class="chain-main">
				<span class="chain-start"><b>${F(Math.ceil(r.giveNeed))}× ${esc(r.give)}</b><span class="run-arrow">→</span><b>${esc(r.item)}</b></span>
				<span class="chain-pips">${pips}<em>${lv ? `Level ${lv}` : 'the material'}</em></span>
				<span class="chain-route">${esc(isl(r))}</span>
				<span class="chain-goods">${img(r.give, 'row-icon sm')}${img(r.item, 'row-icon sm')}</span>
			</span>
			<span class="chain-right">${right}</span>
		</div>`;
	}).join('');
	const chainsPanel = `<section class="panel barter-chains barter-ladder">${ladderHead}<div class="chain-list">${rows}</div></section>`;

	// The first thing to get, as the run's lead tile.
	const usesHold = plan.rungs.some(r => r.have > 0);
	const firstTile = plan.covered
		? ['From the hold', `${F(plan.trades)} trade${plan.trades === 1 ? '' : 's'}`, plan.stops.length ? 'what is aboard covers it all · nothing bought, nothing climbed for' : 'what is aboard covers it all', 'teal']
		: plan.first && plan.first.ashore
			? ['Bought ashore', `${F(Math.ceil(plan.first.n))}× ${esc(plan.first.item)}`, `the floor of the ladder · ${usesHold ? 'what is aboard higher up shortens the climb' : 'nothing aboard shortens the climb'}`, 'gold']
			: plan.first
				? ['First to get', `${F(Math.ceil(plan.first.n))}× ${esc(plan.first.item)}`, 'the lowest rung the hold does not cover · what is aboard above it is used', 'gold']
				: ['First to get', '—', '', ''];
	const tile = (k, v, sub, cls = '') => `<div><div class="summary-k">${k}</div><div class="summary-v${cls ? ` ${cls}` : ''}">${v}</div><div class="summary-sub">${sub}</div></div>`;
	const trades = plan.trades;
	const islands = plan.stops.length;
	const tiles = `<div class="run-tiles">
		${tile(...firstTile)}
		${tile('Trades', F(trades), `${plan.refreshes > 1 ? `over ${plan.refreshes} refreshes at best` : 'one sitting at best'} · ${islands} island${islands === 1 ? '' : 's'}, each dealing once a refresh`)}
		${tile('Hold at its fullest', plan.stops.length ? `${F(Math.round(plan.weightPeak))} LT` : '—', `${F(me.hold.free)} is the limit · barters to ${F(me.hold.deal)} · moves to ${F(me.hold.max)}`, plan.weightPeak > me.hold.deal ? 'warn' : plan.weightPeak > me.hold.free ? 'amber' : 'teal')}
		${tile('Under way', legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `≈ ${esc(legs.time)} at ${me.speed.total}%${from ? ` from ${esc(from.name)}` : ''}` : plan.stops.length ? 'one stop' : 'nothing to sail for')}
	</div>`;

	// The stops rung by rung, the shore's rung first, each a segment
	// like a silver chain's.
	const segs = rungs.map((r, k) => {
		const mine = plan.stops.filter(s => s.level === k);
		if (!mine.length) return '';
		const first = plan.stops.findIndex(s => s.level === k);
		const lv = levelOf(r.item);
		return `<section class="panel run-seg" style="--tier:${TIER(lv || (levelOf(r.give) || 0) + 1)}">
			<div class="run-seg-head"><i></i><b>${esc(r.give)} → ${esc(r.item)}</b><em>${lv ? `Level ${lv}` : 'the material'}</em><span>${r.trades} trade${r.trades === 1 ? '' : 's'} at ${mine.length} island${mine.length === 1 ? '' : 's'}${r.refreshes > 1 ? ` · over ${r.refreshes} refreshes` : ''}</span></div>
			<div class="run-stops">${stopRows(mine, legs, { k0: first })}</div>
		</section>`;
	}).join('');
	const empty = plan.stops.length ? '' : '<div class="run-empty">Nothing to sail for: what is aboard already covers the top exchange. Hand it over at the island that deals it.</div>';
	return {
		chains: chainsPanel,
		run: `<section class="panel barter-run">${head(`for <b>${F(qty)}× ${esc(it)}</b>${coin ? ` · worth ≈ ${FC(Math.round(coin.each * qty))} at the coin shop’s best rate, ${FC(Math.round(coin.each))} a coin on ${esc(coin.item)}` : ''} · aboard ${esc(me.name)}: ${F(me.hold.free)} LT before it slows, barters up to ${F(me.hold.deal)}`)}${picks}${tiles}${caveat}</section>${empty}${segs}${chartButton(plan.stops, it)}`
	};
}

export function renderBarter() {
	restore();
	const me = currentShip();
	const b = boardNow();
	if (!barterData) return '<p class="empty">Reading the barter table…</p>';
	const parts = goal === 'material' ? materialParts(me, b.data, !!b.combo) : silverParts(me, b);
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
	const stock = aboardStock();
	const items = tradeGoodNames.filter(n => !(stock[n] > 0)).map(n => ({
		id: n, label: n, icon: img(n, ''), group: `Level ${levelOf(n)}`,
		meta: `${F(GOODS[levelOf(n)].weight)} LT`, sub: sellOf(n) ? `a barterer pays ${FC(sellOf(n))}` : 'cannot be sold'
	}));
	openPicker({
		title: 'Which good is aboard?',
		hint: 'One of the sea trade goods. Its count lives in the Inventory, under Trade goods.',
		items,
		onPick: name => { store.addStock(name, 1, `1 ${name} aboard`, false); then(); }
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
		case 'barter-preset': store.setProfile('orders', presetOrders(el.dataset.id)); return false;
		case 'barter-homemade': {
			const made = store.getProfile('homemade', []) || [];
			const it = el.dataset.item;
			store.setProfile('homemade', made.includes(it) ? made.filter(x => x !== it) : [...made, it], made.includes(it) ? `${it}: bought, not made` : `${it}: made by your workers`);
			return false;
		}
		case 'barter-add': pickGood(redraw); return false;
		case 'barter-item': pickMaterial(redraw); return false;
		// The hold works the count no storage claims: a trade good is never
		// in the bags, so that count is the ship's. Taking away never
		// reaches past what is aboard into a pile ashore.
		case 'barter-good': {
			const d = Number(el.dataset.delta);
			store.addStock(el.dataset.item, d < 0 ? -Math.min(-d, aboardStock()[el.dataset.item] || 0) : d, null, false);
			return false;
		}
		case 'barter-good-drop': store.addStock(el.dataset.item, -(aboardStock()[el.dataset.item] || 0), `${el.dataset.item}: none aboard`, false); return false;
		case 'barter-load': {
			const n = Number(el.dataset.n) || store.stockAt(el.dataset.item, el.dataset.town);
			store.moveStash(el.dataset.item, el.dataset.town, '', n, `${n}× ${el.dataset.item} loaded at ${el.dataset.town}`);
			return false;
		}
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
		case 'barter-propose': routes.ids = String(el.dataset.ids || '').split('\n').filter(Boolean); persist(); return true;
		case 'barter-fill': {
			if (!lastSearch) return false;
			const { best } = propose({ ...lastSearch, seed: routes.ids });
			if (best) { routes.ids = best.ids; persist(); } else toast('Nothing pays beside what is ticked');
			return true;
		}
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
			const have = aboardStock()[el.dataset.item] || 0;
			store.addStock(el.dataset.item, Math.max(0, Math.floor(n)) - have, `${el.dataset.item}: ${F(have)} → ${F(Math.max(0, Math.floor(n)))} aboard`, false);
			return true;
		}
		case 'barter-pace': setOrders({ pace: el.value === 'full' ? 'full' : 'fast' }); return true;
		case 'barter-sell': setOrders({ sell: Number(el.value) }); return true;
		case 'barter-buy': setOrders({ buy: el.value === 'yes' }); return true;
		case 'barter-hours': setOrders({ hours: Number(el.value) }); return true;
		case 'barter-floor': {
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			const floors = { ...ordersNow().floors };
			if (n > 0) floors[el.dataset.lv] = Math.floor(n); else delete floors[el.dataset.lv];
			setOrders({ floors });
			return true;
		}
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
