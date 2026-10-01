// The hold as it stands: what is aboard, what waits ashore by harbour,
// the floors that hold goods back, and the bar and sheet that show it.

import { esc, F, FC } from '../fmt.js';
import { T, said, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img, codexName, amountInput } from '../ui-bits.js';
import { barterProfile } from '../ui-state.js';
import { currentShip, shownHold, shownSlots, aboardWhat } from '../ship.js';
import { GOODS, PARLEY, COIN_LEVEL, levelOf, levelDiscount } from '../barter.js';
import { goodsHeld, landHeld, weightOf, sellOf, slotsHeld, stacks, rankOf, aboardStock as aboardOf } from '../barter-plan.js';
import { TOWNS } from '../screen-inventory.js';
import { wharves } from '../wharves.js';
import { openDialog } from '../dialogs.js';
import { V } from './state.js';
import { timerHTML } from '../sail-timer.js';
import { fromPort } from './board.js';
import { parleyOf, ordersNow } from './plan.js';
import { STASHES, storeOf, TIER } from './route.js';

/* ------------------------------------------------------------------ *
 * the hold
 * ------------------------------------------------------------------ */

/** What is aboard, as barter-plan reads it: the Map reads the same
 *  hold through the same function, so the two never disagree. */
export const aboardStock = () => aboardOf(store);

/**
 * Every levelled good the sailor keeps, wherever it is -- the hold,
 * the bags, every storage -- as a Map. The stock is counted against
 * the targets from this: a [Level 2] at Velia is as much part of the
 * pile as one aboard, and a target already met somewhere is not worth
 * sailing for again.
 */
export function everythingHeld() {
	const out = new Map();
	for (const [name, qty] of Object.entries(store.getAllStock())) {
		if (levelOf(name) === null || !(qty > 0)) continue;
		out.set(name, Number(qty));
	}
	return out;
}

/**
 * The levels whose floor keeps back everything held of them.
 *
 * A floor is what the run may not spend: what may go into a trade is
 * what is owned of a good above its floor. So a floor of a hundred at
 * [Level 1], against the forty a sailor actually holds, leaves nothing
 * to spend at all -- and the run does the only thing it can, which is
 * to offer no chain that starts from a [Level 1].
 *
 * That is correct, and it looks exactly like a board with nothing on
 * it. Sam set a floor of a hundred while building a stock, sailed four
 * trades, and then spent an evening pressing a list that would not
 * grow, because the app had no way of saying "you told me to keep all
 * of these". It says it now.
 *
 * A level counts as shut only when no good at it clears its floor: one
 * good with a few over is a chain that can still start.
 */
export function floorsShut(orders) {
	const held = everythingHeld();
	const out = [];
	for (const lv of [1, 2, 3, 4, 5, 6]) {
		const floor = (orders.floors || {})[lv] || 0;
		if (!floor) continue;
		const mine = [...held].filter(([name]) => levelOf(name) === lv);
		if (!mine.length) continue;
		if (mine.some(([, n]) => n > floor)) continue;
		out.push({ lv, floor, held: mine.reduce((a, [, n]) => a + n, 0), kinds: mine.length });
	}
	return out;
}

/** The floor that is keeping a coin day's purse empty, or 0: the floor
 *  at the level the coin islands take, when nothing held of that level
 *  clears it. The figures tile asks, so the "—" it would otherwise
 *  print on its own has a reason beside it. */
export function cashFloorNow() {
	if (V.goal !== 'coin') return 0;
	const shut = floorsShut(ordersNow()).find(f => f.lv === COIN_LEVEL);
	return shut ? shut.floor : 0;
}

/** The goods at the storage of the harbour the run sails from. */
export function dockStock() {
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
			if (town === store.ABOARD || town === store.BAG) continue;
			const n = store.stockAt(name, town);
			if (n > 0) {
				if (!byTown.has(town)) byTown.set(town, []);
				byTown.get(town).push({ name, lv: levelOf(name), n });
			}
		}
	}
	return [...byTown].map(([town, goods]) => ({ town, here: !!from && from.name === town, goods: goods.sort((a, b) => rankOf(b.name) - rankOf(a.name) || a.name.localeCompare(b.name)) }))
		.sort((a, b) => Number(b.here) - Number(a.here) || a.town.localeCompare(b.town));
}

/** Where an unload goes: the harbour the run sails from, else the
 *  storage new goods land at, else a storage to choose. */
export function unloadTo() {
	const from = fromPort();
	if (from) return from.name;
	const homes = store.getProfile('homes', {}) || {};
	return homes.goods || '';
}
const unloadTitle = () => (unloadTo() ? T('Put them ashore at {town}', { town: gameName(unloadTo()) }) : T('Put them ashore: choose the storage'));

/** The goods aboard: name, level, count, weight; the highest rank
 *  first (a [Great Ocean] good between the [Level 5]s and [Level 6]s). */
export function held() {
	return [...goodsHeld(aboardStock())]
		.map(([name, n]) => ({ name, lv: levelOf(name), n, weight: n * weightOf(name) }))
		.sort((a, b) => rankOf(b.name) - rankOf(a.name) || a.name.localeCompare(b.name));
}

/** The hold's slots as they stand: the trade goods aboard -- a [Level 5]
 *  and up a slot each, the rest a slot a kind -- and the shore goods in
 *  the hold, a slot a kind. `less` is goods to count as off it. */
export function holdSlotsNow(less = null) {
	const m = goodsHeld(aboardStock());
	for (const name of Object.keys(store.getAllStock())) {
		if (levelOf(name) !== null) continue;
		const n = store.stockAt(name, store.ABOARD);
		if (n > 0) m.set(name, n);
	}
	for (const [name, n] of less || []) m.set(name, Math.max(0, (m.get(name) || 0) - n));
	return slotsHeld(m);
}

/**
 * The hold as one line across the page: the ship, its weight against
 * the limit, what is aboard by level, what waits ashore, and the way
 * into the whole thing -- which opens over the page, so the run under
 * it has the page to itself.
 */
export function holdBarHTML(me, tickedLT = 0, slotsUsed = null) {
	const prof = barterProfile();
	const goods = held();
	// On the wharf step the gauge follows the packing list: a good ticked
	// as fetched weighs in before the app has been told it moved, and one
	// unticked comes off, so the bar answers the press that was made.
	const lt = Math.max(0, goods.reduce((a, g) => a + g.weight, 0) + tickedLT);
	const w = shownHold(me.hold, lt);
	// And the slots: a Volante holds twenty [Level 5]s whatever they weigh.
	const sl = shownSlots(me.hold, slotsUsed ?? holdSlotsNow());
	const pct = w.max > 0 ? Math.min(100, w.total / w.max * 100) : 0;
	const mark = w.mark;
	const state = w.state === 'heavy' || sl.over ? 'over' : w.state;
	const byLv = new Map();
	for (const g of goods) byLv.set(g.lv, (byLv.get(g.lv) || 0) + g.n);
	const levels = [...byLv].sort((a, b) => b[0] - a[0]).map(([lv, n]) => `<span class="hold-bar-lv" style="--tier:${TIER(lv)}" title="${T('{n} of Level {lv} aboard', { n: F(n), lv })}"><i>L${lv}</i>${F(n)}</span>`).join('');
	const from = fromPort();
	const shore = ashore();
	const here = shore.find(t => t.here);
	const elsewhere = shore.filter(t => !t.here).reduce((a, t) => a + t.goods.reduce((x, g) => x + g.n, 0), 0);
	// The shore goods are not trade goods and never go in the hold's
	// weight, but a sailor who has typed a pile of them in should see
	// it counted somewhere: a chain from the shore starts on this.
	const pile = landHeld(store.getAllStock());
	const pileN = [...pile.values()].reduce((a, n) => a + n, 0);
	const ashoreText = [
		here ? T('{n} at {town}, to load', { n: F(here.goods.reduce((a, g) => a + g.n, 0)), town: gameName(here.town) }) : '',
		elsewhere ? T('{n} ashore elsewhere', { n: F(elsewhere) }) : '',
		pileN ? (pile.size === 1 ? T('{n} shore goods over {kinds} kind', { n: F(pileN), kinds: pile.size }) : T('{n} shore goods over {kinds} kinds', { n: F(pileN), kinds: pile.size })) : ''
	].filter(Boolean).join(' · ');
	const weightText = `${w.text} · ${sl.text}${!goods.length ? ` · ${w.aboard ? T('no goods aboard, {n} of it {what}', { n: F(w.aboard), what: said(aboardWhat(w)) }) : T('no goods aboard')}` : w.note ? ` — ${w.note}` : ''}${sl.over ? ` — ${T('more goods than the hull has slots for: the game will not load them all')}` : ''} · ${T('barters to {n}', { n: F(w.deal) })}${tickedLT ? ` · ${T('as ticked below')}` : ''}`;
	// Two different things were in one row here -- what the hull is
	// carrying, and what the sailor can spend -- with the way into the
	// hold hidden at the end of the first as a word. They are two
	// columns now, each with its own heading and its own button, and the
	// clock sits under them where it belongs to neither.
	const parley = prof.parleyHeld > 0 ? Math.min(PARLEY.max, prof.parleyHeld) : PARLEY.max;
	const clock = timerHTML();
	return `<section class="panel hold-bar${state ? ` ${state}` : ''}">
		<div class="hold-cols">
			<section class="hold-col hold-col-ship">
				<div class="hold-col-head">
					<span class="hold-bar-k">⚓ ${T('The hold')}</span>
					<span class="hold-bar-ship">${esc(gameName(me.name))}</span>
					<span class="panel-spacer"></span>
					<button class="ghost-btn sm" data-act="barter-hold-open" title="${T('Open the hold: every good aboard and ashore, with its count')}">${T('Open the hold')} ›</button>
				</div>
				<div class="hold-gauge"><span class="map-load-bar"><i class="${state}" style="width:${pct.toFixed(1)}%"></i><s style="left:${mark.toFixed(1)}%"></s></span><b class="${state ? 'warn' : ''}">${weightText}</b></div>
				<div class="hold-goods">${levels || `<span class="faint">${T('no trade goods aboard')}</span>`}</div>
				${ashoreText ? `<div class="hold-ashore">${esc(ashoreText)}</div>` : from ? '' : `<div class="hold-ashore faint">${T('choose where the run sails from to load goods ashore')}</div>`}
			</section>
			<section class="hold-col hold-col-purse">
				<div class="hold-col-head">
					<span class="hold-bar-k">◈ ${T('To spend')}</span>
					<span class="panel-spacer"></span>
					<button class="ghost-btn sm" data-act="barter-add" title="${T('Record a good that is aboard')}">＋ ${T('A good')}</button>
				</div>
				<div class="hold-purse" title="${T('Your barter count and level are set in the bar at the top of the page; the Parley under Before you sail, step 1')}">
					<span class="hold-purse-n"><b>${F(parley)}</b><span>${T('Parley')}</span></span>
					${prof.vouchers ? `<span class="hold-purse-n"><b>${F(prof.vouchers)}</b><span>${prof.vouchers === 1 ? T('voucher') : T('vouchers')}</span></span>` : ''}
					<span class="hold-purse-n"><b>${F(V.goal === 'material' ? Math.floor(PARLEY.perMaterialTrade * parleyOf(prof).rate) : parleyOf(prof).perTrade)}</b><span>${V.goal === 'material' ? T('a material trade') : T('a trade')}</span></span>
				</div>
				<div class="hold-purse-sub">${esc(prof.level || T('no level set'))} · −${(levelDiscount(prof.level) * 100).toFixed(2)}%${prof.valuePack ? ` ${T('−10% pack')}` : ''}${prof.crew ? ` ${T('−10% crew')}` : ''}</div>
			</section>
		</div>
		${clock ? `<div class="hold-bar-timer">${clock}</div>` : ''}
	</section>`;
}

/**
 * The sheets that open over the page and follow its redraws: the hold,
 * and the run laid out. Each is drawn from the tab's latest state, so
 * a change made inside one -- a count in the hold, a stop ticked off
 * in the run -- redraws it in place, the caret kept where it was.
 */
const SHEETS = {
	hold: { cls: 'hold-dialog', box: 'wide', html: () => holdHTML(currentShip()) }
};

export function openSheet(id) {
	const sheet = SHEETS[id];
	V.sheetOpen = id;
	const host = openDialog(`<div class="${sheet.cls}">${sheet.html()}<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div></div>`, { onDismiss: () => { if (V.sheetOpen === id) V.sheetOpen = null; } });
	host.firstElementChild.classList.add(...sheet.box.split(' '));
}

/** The open sheet redrawn after a change, the caret kept where it was. */
export function refreshSheet() {
	if (!V.sheetOpen) return;
	const sheet = SHEETS[V.sheetOpen];
	const box = document.querySelector(`#dialog:not([hidden]) .${sheet.cls}`);
	if (!box) { V.sheetOpen = null; return; }
	const el = document.activeElement;
	const keep = el && box.contains(el) && el.dataset.act ? { act: el.dataset.act, item: el.dataset.item || '', start: el.selectionStart, end: el.selectionEnd } : null;
	box.innerHTML = `${sheet.html()}<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>`;
	if (!keep) return;
	const again = [...box.querySelectorAll(`[data-act="${keep.act}"]`)].find(x => (x.dataset.item || '') === keep.item);
	if (!again) return;
	again.focus({ preventScroll: true });
	try { if (keep.start != null && again.setSelectionRange) again.setSelectionRange(keep.start, keep.end); } catch { /* not a text field */ }
}

// The shore goods in the hold: loaded at the wharf for a run, the land
// goods a chain starts from. Counted apart from the trade goods, which
// are the hold's own list.
export const shoreAboard = () => Object.keys(store.getAllStock()).filter(n => levelOf(n) === null && store.stockAt(n, store.ABOARD) > 0)
	.map(name => ({ name, n: store.stockAt(name, store.ABOARD), weight: store.stockAt(name, store.ABOARD) * weightOf(name) }))
	.sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));

function holdHTML(me) {
	const goods = held();
	const shore = shoreAboard();
	const lt = goods.reduce((a, g) => a + g.weight, 0) + shore.reduce((a, g) => a + g.weight, 0);
	const n = goods.reduce((a, g) => a + g.n, 0) + shore.reduce((a, g) => a + g.n, 0);
	const worth = goods.reduce((a, g) => a + g.n * sellOf(g.name), 0);
	const w = shownHold(me.hold, lt);
	const sl = shownSlots(me.hold, holdSlotsNow());
	const pct = w.max > 0 ? Math.min(100, w.total / w.max * 100) : 0;
	const mark = w.mark;
	const state = w.state === 'heavy' || sl.over ? 'over' : w.state;
	// The room is the weight's and the slots' together: a [Level 5] and
	// up takes a slot each, so a hold with LT to spare and no slot left
	// has no room at all.
	const free = sl.cap === null ? Infinity : Math.max(0, sl.cap - sl.used);
	const room = lv => Math.min(free, Math.max(0, Math.floor((w.limit - w.total) / GOODS[lv].weight)));
	const sub = !n ? `${w.text} · ${sl.text} · ${w.aboard ? T('no goods aboard, {n} of it {what}', { n: F(w.aboard), what: said(aboardWhat(w)) }) : T('no goods aboard')} · ${w.deal === w.max ? T('barters and moves to {max}', { max: F(w.max) }) : T('barters to {deal}, moves to {max}', { deal: F(w.deal), max: F(w.max) })}`
		: sl.over ? `${w.text} · ${sl.text} — ${T('more goods than the hull has slots for: the game will not load them all')}`
		: w.note ? `${w.text} · ${sl.text} — ${w.note}`
			: `${w.text} · ${sl.text} · ${T('room for {a} more Lv4–5 or {b} Lv6–7 under the limit', { a: room(5), b: room(6) })}`;
	const q = V.holdQ.trim().toLowerCase();
	const passes = g => (!q || g.name.toLowerCase().includes(q)) && (!V.holdLv.size || V.holdLv.has(g.lv));
	const shown = goods.filter(passes);
	const filters = `<div class="hold-filters">
		<input class="field hold-q" type="search" placeholder="${T('Find a good…')}" value="${esc(V.holdQ)}" data-act="barter-hold-q" aria-label="${T('Find a good aboard or ashore')}">
		<span class="chips">${[1, 2, 3, 4, 5, 6, 7].map(lv => `<button class="chip tiny lvl${V.holdLv.has(lv) ? ' active' : ''}" aria-pressed="${V.holdLv.has(lv) ? 'true' : 'false'}" data-act="barter-hold-lv" data-lv="${lv}" style="--tier:${TIER(lv)}" title="${T('Level {lv}', { lv })}">${lv}</button>`).join('')}${V.holdLv.size || q ? `<button class="chip tiny" data-act="barter-hold-clear">${T('clear')}</button>` : ''}</span>
	</div>`;
	const rows = shown.map(g => `<div class="barter-good">
		${img(g.name, 'row-icon')}
		<span class="map-row-main">
			<span class="map-row-name">${codexName(g.name)}</span>
			<span class="map-row-sub">${T('{each} LT each · {all} LT', { each: F(GOODS[g.lv].weight), all: F(g.weight) })} · ${stacks(g.name) ? T('one slot') : T('{n} slots, one each', { n: F(Math.ceil(g.n)) })}${sellOf(g.name) ? ` · ${T('a barterer pays {silver}', { silver: FC(sellOf(g.name)) })}` : ` · ${T('cannot be sold')}`}</span>
		</span>
		<span class="barter-count">
			<button class="map-load-btn" data-act="barter-good" data-item="${esc(g.name)}" data-delta="-1" aria-label="${T('One fewer {name}', { name: esc(gameName(g.name)) })}">−</button>
			${amountInput('purse-inline', g.n, `data-act="barter-good-set" data-item="${esc(g.name)}" aria-label="${T('How many {name} aboard', { name: esc(gameName(g.name)) })}"`)}
			<button class="map-load-btn" data-act="barter-good" data-item="${esc(g.name)}" data-delta="1" aria-label="${T('One more {name}', { name: esc(gameName(g.name)) })}">+</button>
		</span>
		<button class="ghost-btn sm" data-act="barter-unload" data-item="${esc(g.name)}" data-n="${g.n}" title="${unloadTitle()}">${T('Unload')}</button>
	</div>`).join('');
	return `<section class="panel barter-hold">
		<div class="panel-head">
			<h2 class="panel-title teal">${T('The hold')}</h2>
			<span class="panel-sub">${T('aboard <b>{name}</b>', { name: esc(gameName(me.name)) })} · <button class="linky" data-act="view" data-id="crew">${T('change')}</button></span>
			<span class="panel-spacer"></span>
			<span class="panel-btns">
				<button class="ghost-btn" data-act="trip-log" title="${T('Everything a trip brought back, in one go')}">＋ ${T('Log a trip')}</button>
				<button class="ghost-btn" data-act="barter-add" title="${T('Record a good that is aboard')}">＋ ${T('A good')}</button>
			</span>
		</div>
		<div class="map-load-bar" title="${T('The bar runs to the most the hull will move under; the mark is its limit')}"><i class="${state}" style="width:${pct.toFixed(1)}%"></i><s style="left:${mark.toFixed(1)}%"></s></div>
		<div class="summary-sub${state ? ' warn' : ''}">${sub}${worth ? ` · ${T('worth {silver} to a barterer as it is', { silver: FC(worth) })}` : ''}</div>
		${goods.length || shore.length ? `<div class="hold-all"><span class="panel-sub">${T('{n} goods aboard', { n: F(n) })}</span><span class="panel-spacer"></span><button class="ghost-btn sm" data-act="barter-unload-all" title="${unloadTo() ? T('Every good aboard into the storage at {town}', { town: esc(gameName(unloadTo())) }) : T('Every good aboard into a storage you choose')}">${T('Unload all')}</button></div>` : ''}
		${goods.length || ashore().length ? filters : ''}
		${shore.length ? `<div class="hold-shore"><span class="ashore-k">${T('Shore goods aboard')}</span>${shore.map(g => `<div class="barter-good">${img(g.name, 'row-icon')}<span class="map-row-main"><span class="map-row-name">${codexName(g.name)}</span><span class="map-row-sub">${T('{n} aboard · {lt} LT', { n: F(g.n), lt: (Math.round(g.weight * 10) / 10).toLocaleString() })}</span></span><button class="ghost-btn sm" data-act="barter-unload" data-item="${esc(g.name)}" data-n="${g.n}" title="${unloadTitle()}">${T('Unload')}</button></div>`).join('')}</div>` : ''}
		${rows ? `<div class="barter-goods">${shore.length ? `<span class="ashore-k">${T('Trade goods aboard')}</span>` : ''}${rows}</div>` : goods.length ? `<p class="empty">${T('Nothing aboard matches.')}</p>` : shore.length ? '' : `<p class="empty">${T('Nothing recorded aboard. Add a good, or log the trip that brought them back — the counts are the Inventory’s, under Trade goods.')}</p>`}
		${ashoreHTML(passes)}
	</section>`;
}

/**
 * The goods ashore, harbour by harbour, each with a button that puts
 * it aboard. The harbour the run sails from is first and its goods
 * are the ones the chains can start from; a harbour elsewhere says
 * so, since the ship is not there to load them.
 */
function ashoreHTML(passes = () => true) {
	const all = ashore();
	if (!all.length) return '';
	const from = fromPort();
	const places = all.length > 1 ? `<span class="chips ashore-places">${all.map(t => `<button class="chip tiny${V.holdAt === t.town ? ' active' : ''}" aria-pressed="${V.holdAt === t.town ? 'true' : 'false'}" data-act="barter-hold-at" data-town="${esc(t.town)}">${esc(gameName(t.town))}</button>`).join('')}</span>` : '';
	const towns = all.filter(t => !V.holdAt || t.town === V.holdAt).map(t => ({ ...t, goods: t.goods.filter(passes) })).filter(t => t.goods.length);
	const groups = towns.map(t => `<div class="ashore-town${t.here ? ' here' : ''}">
		<div class="ashore-head"><b>${esc(gameName(t.town))}</b><span>${t.here ? T('the run sails from here — its goods can be loaded') : from ? T('not where the run starts') : T('choose where the run sails from to load these')}</span></div>
		${t.goods.map(g => `<div class="barter-good ashore-good">
			${img(g.name, 'row-icon')}
			<span class="map-row-main">
				<span class="map-row-name">${codexName(g.name)}</span>
				<span class="map-row-sub">${T('{n} here · {lt} LT to carry', { n: F(g.n), lt: F(g.n * weightOf(g.name)) })}${sellOf(g.name) ? ` · ${T('a barterer pays {silver} each', { silver: FC(sellOf(g.name)) })}` : ''}</span>
			</span>
			<button class="ghost-btn sm" data-act="barter-load" data-item="${esc(g.name)}" data-town="${esc(t.town)}" data-n="${g.n}" title="${T('Put all {n} aboard', { n: g.n })}">${T('Load {n}', { n: F(g.n) })}</button>
		</div>`).join('')}
	</div>`).join('');
	return `<div class="ashore"><div class="ashore-k">${T('Ashore')}${places}</div>${groups || `<p class="empty">${T('Nothing ashore matches.')}</p>`}</div>`;
}

/** Every other storage with trade goods in it, and the wharf beside
 *  it where there is one: what a run could call for on the way, or
 *  what sits out of its reach. */
export function storesElsewhere() {
	const from = fromPort();
	const out = [];
	for (const town of TOWNS) {
		if (town === store.ABOARD || town === store.BAG || (from && town === from.name)) continue;
		const goods = {};
		for (const [name, qty] of Object.entries(store.getAllStock())) {
			if (levelOf(name) === null || !(qty > 0)) continue;
			const n = store.stockAt(name, town);
			if (n > 0) goods[name] = n;
		}
		if (Object.keys(goods).length) out.push({ town, wharf: wharves.find(w => w.kind === 'wharf' && storeOf(w.at) === town && STASHES.includes(w.at)) || wharves.find(w => w.kind === 'wharf' && w.at === town) || null, goods });
	}
	return out;
}

/** The inventory of everything that is not a trade good: the Gold
 *  Bars and materials a few islands take. */
export function bagsNow() {
	const out = {};
	for (const [name, qty] of Object.entries(store.getAllStock())) if (levelOf(name) === null && qty > 0) out[name] = qty;
	return out;
}
