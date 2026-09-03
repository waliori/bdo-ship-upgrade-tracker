// The Barter tab: the hold as it stands, and a run planned from it.
//
// The chart plots a route you choose; the ledger prices it. This is
// the other way round: say what you are sailing for -- silver, or a
// material a build is short of -- and the run is laid out from the
// goods aboard: which islands, in what order, what changes hands at
// each, the hold after every stop, and what a barterer pays at the
// end. It is the best the table allows, since each island shows one
// exchange a refresh and the table is every exchange it can show; the
// screen says so once and the numbers are read with that in mind.

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
import { marketPrice } from './market.js';
import { silverPlan, materialPlan, goodsHeld, weightOf, sellOf } from './barter-plan.js';
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
let land = false;        // buy the land goods a [Level 1] exchange takes
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
		land = s.land === true;
		if (s.board && Array.isArray(s.board.answers)) {
			board = { day: String(s.board.day || ''), answers: s.board.answers.filter(a => a && npcById.has(Number(a.npcId)) && typeof a.give === 'string' && typeof a.recv === 'string').map(a => ({ npcId: Number(a.npcId), give: a.give, recv: a.recv })) };
		}
	} catch { /* a fresh tab */ }
}

function persist() {
	try {
		localStorage.setItem(STORE_KEY, JSON.stringify({ goal, item, qty, port, land, board }));
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
			<button class="ghost-btn" data-act="trip-log" title="Everything a trip brought back, in one go">＋ Log a trip</button>
			<button class="ghost-btn" data-act="barter-add" title="Record a good that is aboard">＋ A good</button>
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

function boardHTML(b) {
	if (!combos) return '<p class="panel-sub barter-caveat">The record of the boards did not load, so the run is planned on the whole table at best.</p>';
	const since = new Date(combos.sample.since + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
	const seen = board.answers.map(a => `<span class="chip tiny active" title="${esc(a.give)} → ${esc(a.recv)}">${esc(npcById.get(a.npcId).name)}</span>`).join('');
	if (b.combo) {
		return `<div class="barter-board known">
			<div class="barter-board-head"><b>Today's board is layout ${esc(b.combo.id)}</b> <span class="panel-sub">· seen ${b.combo.seen} of ${combos.sample.refreshes} refreshes since ${esc(since)} · every island's offer is known; the material islands roll on their own and are read from the whole table</span></div>
			<div class="chips">${seen}<button class="chip tiny" data-act="barter-board-clear" title="The board was refreshed in game: start again">Refreshed in game</button></div>
		</div>`;
	}
	const ask = askable(b.standing, npcById, fromPort());
	if (!b.standing.length) {
		return `<div class="barter-board"><div class="barter-board-head"><b>No layout shows that.</b> <span class="panel-sub">The record is from ${esc(combos.read)}; the game may have moved on. Planning on the whole table at best.</span></div>
			<div class="chips">${seen}<button class="chip tiny" data-act="barter-board-undo">Undo</button></div></div>`;
	}
	const first = ask[0] ? npcById.get(ask[0].npcId) : null;
	const lead = board.answers.length
		? `<b>${b.standing.length} layouts fit so far.</b> <span class="panel-sub">One more look settles it.</span>`
		: `<b>Which board is the sea showing?</b> <span class="panel-sub">Look at one island in the game and tap what it offers; the whole board follows, since every refresh is one of ${combos.combos.length} layouts.</span>`;
	return `<div class="barter-board">
		<div class="barter-board-head">${lead}</div>
		<div class="chips">${seen}${first ? `<button class="chip" data-act="barter-board-ask" data-npc="${first.id}" title="The island whose offer tells the layouts apart best${ask[0].worst > 1 ? ` — leaves ${ask[0].worst} at worst` : ''}">What does ${esc(first.name)} at ${esc(first.at)} show? ▾</button>` : ''}<button class="chip" data-act="barter-board-island">another island…</button>${board.answers.length ? '<button class="chip tiny" data-act="barter-board-undo">Undo</button>' : ''}</div>
	</div>`;
}

/* ------------------------------------------------------------------ *
 * the run
 * ------------------------------------------------------------------ */

/** Metres a second at 100%: the player's own figure if they timed a
 *  leg, else the working estimate. */
function sailCal() {
	const v = Number(store.getSetting('sailCal', null));
	return v > 0 ? v : DEFAULT_CAL;
}

/** The materials the table deals, with what the builds are short of. */
function materials() {
	const missing = (snapshot && snapshot.missing) || {};
	return (barterData || []).filter(e => levelOf(e.name) === null && e.sources && e.sources.length)
		.map(e => ({ name: e.name, short: Number(missing[e.name]) || 0 }))
		.sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
}

/** The material a run is for: the one chosen, else the biggest
 *  shortfall the table can answer. */
function itemNow() {
	const list = materials();
	if (item && list.some(m => m.name === item)) return item;
	return list.length ? list[0].name : null;
}

/** The legs of a run, bent round the land: distance and time. */
function legsOf(stops) {
	const from = ports.find(p => p.id === port) || null;
	const pts = [...(from ? [from] : []), ...stops.map(s => npcById.get(s.npcId)).filter(Boolean)];
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

function stopRows(stops, legs) {
	const from = legs.from;
	return stops.map((s, k) => {
		const npc = npcById.get(s.npcId);
		const m = from ? legs.legs[k] : k > 0 ? legs.legs[k - 1] : null;
		const leg = m != null ? `<span class="map-leg">${esc(fmtDistance(m))} · ${esc(legs.timeOf(m))}</span>` : '';
		const hold = s.hold;
		const over = s.weightAfter > hold.free, dead = s.weightAfter > hold.max;
		return `<div class="map-stop-row${dead ? ' over' : ''}">
			<span class="map-stop-n">${k + 1}</span>
			<span class="map-row-main">
				<span class="map-row-name">${esc(npc.name)}${leg}</span>
				<span class="map-row-sub">${esc(npc.at)}</span>
				<span class="map-row-sub ok">${esc(s.giveText)}× ${esc(s.give)} → ${esc(s.recvText)}× ${esc(s.item)}${s.times > 1 ? `, ${s.times} times` : ''}</span>
				<span class="map-row-sub${dead ? ' warn' : over ? ' amber' : ''}">hold after: ${F(Math.max(0, Math.round(s.weightAfter)))} LT${dead ? ' — more than the hull will move under' : over ? ' — overweight, slower' : ''}</span>
			</span>
			<span class="map-row-right">${img(s.item, 'map-icon')}</span>
		</div>`;
	}).join('');
}

function chartButton(stops, pick) {
	if (!stops.length) return '';
	const ids = [...new Set(stops.map(s => s.npcId))];
	return `<div class="map-side-btns">
		<button class="ghost-btn" data-act="barter-chart" data-ids="${ids.join('.')}" data-pick="${esc(pick || '')}" title="Plot these stops on the Map, in this order">Draw it on the chart</button>
	</div>`;
}

function silverHTML(me, data) {
	const prof = barterProfile();
	const from = fromPort();
	const plan = silverPlan({
		stock: store.getAllStock(), barterData: data,
		hold: me.hold,
		parley: { bar: PARLEY.max + prof.vouchers * PARLEY.voucher, perTrade: parleyPerTrade({ ...prof, kind: 'trade' }) },
		npcById, start: from, price: marketPrice, land
	});
	for (const s of plan.stops) s.hold = me.hold;
	const legs = legsOf(plan.stops);
	const hasGoods = held().length > 0;
	const landBox = `<label class="check barter-land"><input type="checkbox" data-act="barter-land" ${land ? 'checked' : ''}> buy the land goods a [Level 1] exchange takes, for a hold with nothing to trade up <span class="detail-note">— they weigh nothing here</span></label>`;
	if (!plan.stops.length) {
		return `${landBox}<p class="empty">${hasGoods
			? 'Nothing aboard can be traded up under this hold: the goods are worth what they are.'
			: 'Nothing aboard to trade. Record the goods in the hold, or tick the land goods to plan a run from the shore.'}</p>`;
	}
	const rate = legs.mid > 0 && plan.gain > 0 ? Math.round(plan.gain / (legs.mid / 3600)) : 0;
	const stats = `<div class="map-stats barter-stats">
		<div><div class="summary-k">Worth at the end</div><div class="summary-v">${FC(Math.round(plan.silver))}</div>
			<div class="summary-sub">${plan.startValue ? `${FC(Math.round(plan.startValue))} as it stands now · ` : ''}<b>+${FC(Math.round(plan.gain))}</b> for the run${rate ? ` · ≈ ${FC(rate)} an hour under way` : ''}</div></div>
		<div><div class="summary-k">Trades</div><div class="summary-v">${F(plan.trades)}</div>
			<div class="summary-sub">${F(Math.round(plan.parleyUsed))} Parley of ${F(plan.parleyBar)} · ${plan.stops.length} island${plan.stops.length === 1 ? '' : 's'}, each dealing once</div></div>
		<div><div class="summary-k">Hold at its fullest</div><div class="summary-v${plan.weightPeak > me.hold.max ? ' amber' : ''}">${F(Math.round(plan.weightPeak))} LT</div>
			<div class="summary-sub">${F(me.hold.free)} without slowing · ${F(me.hold.max)} at most${plan.weightPeak > me.hold.free ? ' · overweight for part of the run' : ''}</div></div>
		${legs.total ? `<div><div class="summary-k">Under way</div><div class="summary-v">${esc(fmtDistance(legs.total))}</div>
			<div class="summary-sub">≈ ${esc(legs.time)} at ${me.speed.total}%${from ? ` from ${esc(from.name)}` : ''}</div></div>` : ''}
	</div>`;
	const line = (label, list, f) => (list.length ? `<div class="detail-block"><div class="detail-label">${label}</div>${list.map(f).join('')}</div>` : '');
	const sold = line('Sell at the end', plan.sold, s => `<div class="detail-line"><span>${img(s.item, 'row-icon sm')} ${n1(s.n)}× ${esc(s.item)}</span><span class="n teal">${FC(Math.round(s.total))}</span></div>`);
	const kept = line('Carried home, for the next run', plan.kept, s => `<div class="detail-line"><span>${img(s.item, 'row-icon sm')} ${n1(s.n)}× ${esc(s.item)}</span><span class="n faint">unsold</span></div>`);
	const bought = line('Bought ashore before casting off', plan.bought, s => `<div class="detail-line"><span>${img(s.item, 'row-icon sm')} ${F(Math.ceil(s.n))}× ${esc(s.item)}</span></div>`);
	return `${landBox}${stats}${bought}
		<div class="detail-block"><div class="detail-label">Stops, in sailing order</div>${stopRows(plan.stops, legs)}</div>
		${sold}${kept}${chartButton(plan.stops, '')}`;
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
		${plan.stops.length ? `${stats}<div class="detail-block"><div class="detail-label">Stops, in sailing order</div>${stopRows(plan.stops, legs)}</div>` : ''}
		${chartButton(plan.stops, it)}`;
}

export function renderBarter() {
	restore();
	const me = currentShip();
	const goalChip = (id, label, title) => `<button class="chip ${goal === id ? 'active' : ''}" data-act="barter-goal" data-id="${id}" title="${esc(title)}">${label}</button>`;
	const portSel = `<label class="barter-from">from
		<select class="field select" data-act="barter-port" aria-label="The wharf the run sails from">
			<option value="0" ${port ? '' : 'selected'}>the first stop</option>
			${ports.map(p => `<option value="${p.id}" ${p.id === port ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
		</select></label>`;
	const b = boardNow();
	const body = !barterData
		? '<p class="empty">Reading the barter table…</p>'
		: goal === 'material' ? materialHTML(me, b.data) : silverHTML(me, b.data);
	const caveat = b.combo
		? ''
		: '<p class="panel-sub barter-caveat">Until the board is known, an island shows one exchange a refresh, drawn from the table at random, and this is the run the table allows at best — the same reading the Get tab’s forecasts make — with every island dealing once and the hold weighed at every stop.</p>';
	return `<div class="barter-layout">
		${holdHTML(me)}
		<section class="panel barter-run">
			<div class="panel-head">
				<h2 class="panel-title">A run for</h2>
				<div class="chips">${goalChip('silver', 'Silver', 'The most a barterer pays at the end, from what is aboard')}${goalChip('material', 'A material', 'The ladder to one material, against what is aboard')}</div>
				<span class="panel-spacer"></span>
				${portSel}
			</div>
			${barterData ? boardHTML(b) : ''}${caveat}
			${body}
		</section>
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
		case 'barter-land': land = el.checked === true; persist(); return true;
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
	return parts.join(';');
}
