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
import { T, said, gameName } from './i18n.js';
import * as store from './state.js';
import { img, codexName, copyName, amountInput } from './ui-bits.js';
import { snapshot, barterData, barterProfile, combos, matBoards, totalsToGo, SILVER } from './ui-state.js';
import { barterKey, periodKey, currentPlan } from './clock.js';
import { candidates, askable, offersAt, offersOf, boardData, gatedOffers, exchangeGate, clientDeals } from './barter-board.js';
import { currentShip, shownHold, aboardWhat } from './ship.js';
import { npcById, ports, isleOf, whoOf, isleShort } from './barter_npcs.js';
import { seaRoute } from './searoute.js';
import { pathLength, legLengths, sailRange, fmtRange, fmtDistance, DEFAULT_CAL, sailSeconds } from './sailing.js';
import { quests, cadenceOf } from './quests.js';
import { questDone, wantedQuests, rewardOf } from './screen-quests.js';
import { layQuests } from './quest-places.js';
import { PARLEY_UNIT, WAY_CHOICES, QUEST_CHOICES, SELL_CHOICES, LAND_CHOICES, VOUCHER_CHOICES, PAUSE_MAX, HOUR_CHOICES, COUNT_CHOICES, AIM_CHOICES, NOTHING, DEFAULT_STOCK, STOCK_LEVELS, SAIL_PRESETS, sailPresetOf, readOrders, readStock, stockOrders, yardsticks, countAs, ratioKey } from './barter-orders.js';
import { propose } from './barter-optimizer.js';
import { coins as coinShop } from './sea_coins.js';
import { landPrices } from './land-cost.js';
import { marketStatus, marketSilver } from './market.js';
import { GOODS, PARLEY, COIN, COIN_LEVEL, nextGateAbove, dailyCapacity, parleyPerTrade, levelOf, levelDiscount, ROUTE_UNLOCKS, npcGate, npcOpen, countBonus, withBonus } from './barter.js';
import { parleyLedger } from './parley-ledger.js';
import { exchanges, goodsHeld, landHeld, weightOf, sellOf, aboardStock as aboardOf } from './barter-plan.js';
import { openBarterImport } from './barter-import.js';
import { imagesOn } from './shot-reader.js';
import { openLayoutBook } from './layouts-view.js';
import { driftOf } from './layout-book.js';
import { boardsFor, sawItToo, tellFleet, shared as boardsShared } from './sea-boards.js';
import { me } from './sync.js';
import { TOWNS } from './screen-inventory.js';
import { questIcon } from './quest_icons.js';
import { chains, chainRun, tailOf } from './barter-chains.js';
import { materialRun } from './barter-material.js';
import { wharves } from './wharves.js';
import { tradeGoodNames } from './trade_goods.js';
import { landGoods } from './land_goods.js';
import { openPicker } from './picker.js';
import { openTripLog } from './triplog.js';
import { toast, openDialog, closeDialog } from './dialogs.js';
import { cheer } from './cheer.js';
import { timerHTML, timerAction, timerState, startTimer, stopTimer, passedStop, spanText } from './sail-timer.js';

/* ------------------------------------------------------------------ *
 * what the tab remembers
 * ------------------------------------------------------------------ */

// The tab's view lives in the profile under `views.barter` -- written
// the quiet way, no history entry, and so kept per profile, synced and
// exported with the rest. It used to be this localStorage key, which
// is brought across once and left where it is for an older build.
const VIEW_NS = 'barter';
const LEGACY_KEY = 'bdo-tracker/barter-view';
let goal = 'silver';     // silver | stock | coin | material
let item = null;         // the material a run is for
let qty = 1;             // how many of it
let wants = {};          // and of every other material ticked today: material -> how many
let climb = 0;           // the level a silver run's climbs stop at, 0 for the top
let stockGoal = { ...DEFAULT_STOCK, targets: { ...DEFAULT_STOCK.targets } };   // the stock run: what to keep of every good at a level, where the climbs stop, what the day is for
let matOrders = { reach: 'want', calls: true, pace: 'full', quests: 'near' };   // sail for the wants, or every island ticked; call at a harbour for a give held there; one departure, or as many as the hold needs
let port = 0;            // the wharf the run sails from, 0 for none
let routes = { key: '', ids: [] };     // the chains ticked, for one board (day|layout)
let stash = '';          // the wharf goods are left at, '' for the nearest
let board = { day: '', answers: [] };   // what islands were seen to show today: { npcId, give, recv }
let reach = '';   // a good the item board is asked to reach, for the material run
let matBoard = { day: '', answers: [] };   // what the material list was seen to show today: { npcId, give, recv }
let planSec = 'ladder';   // the part of the plan that is open: ladder | how | chains | all | none
let advOpen = false;      // every order, unfolded
let questSkip = { day: '', ids: [] };   // quests left out of today's runs by hand
let questPull = { day: '', ids: [] };   // quests taken in by hand today, whatever the way round
let sailAll = { open: false, stops: true, quests: true };   // the ask before every stop and quest is ticked off at once
let sail = null;   // the run being sailed: { key, done: [stop keys], seen: { npcId: paid }, got: { npcId: item }, kept: [wharf stop keys whose [Level 7]s were not sold], stops: [...] }
// The filters on the hold and the chain list, for the session.
let holdQ = '', holdLv = new Set(), holdAt = '';
let chainQ = '', chainFrom = '', chainTop = 0;
let proposed = { key: '', proposals: [], best: null, solos: new Map(), partial: false, working: false };   // the runs worth sailing, for one set of inputs; `working` while the worker is still out on them
let routesAuto = '';   // the routes key whose ticks were left to the search still out, to be set when it answers
let filling = false;   // "fill the rest" asked and not yet answered
const legsCache = new Map();   // the legs of a run bent round the land, by its stops
let lastSearch = null;   // what the last search was given, for "fill the rest
let readSig = null;   // the view as last read from the profile, as text: a different one -- synced in, imported, migrated -- is read again
// The page is four steps -- plan, load, sail, results -- and these are
// the session's own: which step is up, which part of the plan is open,
// where the cockpit stands. None of it is worth a profile write.
let step = '';            // plan | load | sail | results; '' follows the run
let glance = false;       // the cockpit drawn large, to be read across a room
let cursor = null;        // the stop the cockpit was sent to, by its key
let skipped = new Set();  // stops passed over on the cockpit, by their key
let packed = new Set();   // goods bought or fetched and ticked aboard on the packing list
let lastTrip = null;      // what the last Record came to, for the results
let migrated = false;
let writeTimer = null;   // a write of the view still to be made
let writing = false;     // the write under way: the store redraws the page from inside it

/**
 * The view read from the profile, when the profile holds a different
 * one from the last read -- the first time, and after a sync or an
 * import puts another there. Compared as text, not by identity: every
 * profile write rebuilds the views table, and an equal view read back
 * mid-action would undo what the action had changed in memory. The
 * tab starts from its defaults each time, so a field the new view
 * lacks does not keep the old one's value. A write of this tab's own
 * still owed is newer than anything read, and is not overwritten.
 */
function restore() {
	if (writeTimer || writing) return;
	if (!migrated) {
		migrated = true;
		// The write inside migrateView redraws the page through the
		// store's listeners, once, the first time a profile is opened
		// on this build; the redraw reads the view then and this call
		// finds it already read.
		store.migrateView(VIEW_NS, LEGACY_KEY, x => x);
	}
	const s = store.getView(VIEW_NS);
	const sig = s ? JSON.stringify(s) : null;
	if (sig === readSig) return;
	readSig = sig;
	goal = 'silver'; climb = 0; item = null; qty = 1; wants = {};
	stockGoal = { ...DEFAULT_STOCK, targets: { ...DEFAULT_STOCK.targets } };
	matOrders = { reach: 'want', calls: true, pace: 'full', quests: 'near' };
	port = 0; routes = { key: '', ids: [] }; stash = ''; sail = null; reach = ''; planSec = 'ladder'; advOpen = false;
	board = { day: '', answers: [], own: false }; matBoard = { day: '', answers: [] };
	questSkip = { day: '', ids: [] }; questPull = { day: '', ids: [] };
	if (!s) return;
	try {
		if (['material', 'stock', 'coin'].includes(s.goal)) goal = s.goal;
		if (s.stock) stockGoal = readStock(s.stock);
		if (STOCK_LEVELS.includes(Number(s.climb)) && Number(s.climb) < 7) climb = Number(s.climb);
		if (['ladder', 'how', 'chains', 'all', 'none'].includes(s.planSec)) planSec = s.planSec;
		advOpen = s.advOpen === true;
		if (typeof s.item === 'string') item = s.item;
		if (Number(s.qty) > 0) qty = Math.min(9999, Math.floor(Number(s.qty)));
		if (s.wants && typeof s.wants === 'object') for (const [k, v] of Object.entries(s.wants)) if (typeof k === 'string' && Number(v) > 0) wants[k] = Math.min(9999, Math.floor(Number(v)));
		if (s.matOrders && typeof s.matOrders === 'object') matOrders = { reach: s.matOrders.reach === 'all' ? 'all' : 'want', calls: s.matOrders.calls !== false, pace: s.matOrders.pace === 'fast' ? 'fast' : 'full', quests: QUEST_CHOICES.some(([q]) => q === s.matOrders.quests) ? s.matOrders.quests : 'near' };
		if (ports.some(p => p.id === Number(s.port))) port = Number(s.port);
		if (STASHES.includes(s.stash)) stash = s.stash;
		if (s.routes && typeof s.routes.key === 'string' && Array.isArray(s.routes.ids)) routes = { key: s.routes.key, ids: s.routes.ids.filter(id => typeof id === 'string') };
		if (s.sail && typeof s.sail.key === 'string' && Array.isArray(s.sail.done)) {
			// The run's own record rides along: what was loaded, the
			// figures, the chains, the quests to hand in at home.
			const keep = {};
			// What was bought for the run and the Parley it was planned on
			// ride along too. They were written and never read back, so a
			// run that outlived its page -- a phone gone to sleep, a tab
			// reloaded an hour in, which is most runs -- was recorded as if
			// its shore goods had cost nothing.
			for (const k of ['loaded', 'bought', 'parleyUsed', 'cost', 'silver', 'net', 'trades', 'questsHome', 'chains', 'goal', 'item', 'time', 'port']) if (s.sail[k] !== undefined) keep[k] = s.sail[k];
			sail = { key: s.sail.key, done: s.sail.done.map(String), seen: {}, got: {}, kept: Array.isArray(s.sail.kept) ? s.sail.kept.map(String) : [], stops: Array.isArray(s.sail.stops) ? s.sail.stops : [], ...keep };
			for (const [k, v] of Object.entries(s.sail.seen || {})) if (Number(v) > 0) sail.seen[k] = Number(v);
			for (const [k, v] of Object.entries(s.sail.got || {})) if (typeof v === 'string') sail.got[k] = v;
		}
		if (typeof s.reach === 'string') reach = s.reach;
		if (s.questSkip && typeof s.questSkip.day === 'string' && Array.isArray(s.questSkip.ids)) questSkip = { day: s.questSkip.day, ids: s.questSkip.ids.filter(id => typeof id === 'string') };
		if (s.questPull && typeof s.questPull.day === 'string' && Array.isArray(s.questPull.ids)) questPull = { day: s.questPull.day, ids: s.questPull.ids.filter(id => typeof id === 'string') };
		if (s.matBoard && Array.isArray(s.matBoard.answers)) {
			matBoard = { day: String(s.matBoard.day || ''), answers: s.matBoard.answers.filter(a => a && npcById.has(Number(a.npcId)) && typeof a.give === 'string' && typeof a.recv === 'string').map(a => ({ npcId: Number(a.npcId), give: a.give, recv: a.recv })) };
		}
		if (s.board && Array.isArray(s.board.answers)) {
			board = {
				day: String(s.board.day || ''),
				answers: s.board.answers.filter(a => a && npcById.has(Number(a.npcId)) && typeof a.give === 'string' && typeof a.recv === 'string').map(a => ({ npcId: Number(a.npcId), give: a.give, recv: a.recv })),
				// A board sailed on the sailor's own word rather than on
				// one of the forty layouts.
				own: s.board.own === true
			};
		}
	} catch { /* a view this build does not read: the defaults stand */ }
}

/**
 * The view written to the profile -- a moment later, so a burst of
 * ticks or typing is one write and, since the store redraws the page
 * on every profile write, one redraw after the action's own. The
 * session's own things -- the filters, the all-done ask -- stay here.
 */
function persist() {
	if (writeTimer) clearTimeout(writeTimer);
	writeTimer = setTimeout(flushView, 250);
	logBoard();
}

/**
 * Write down which layout today's board turned out to be.
 *
 * Nobody presses anything for this: the moment the answers settle on
 * one layout -- or on one with a slot moved -- it goes in the profile's
 * log, once a day a layout, and that is all the layout book needs to
 * say which boards this sailor is dealt most. A board that settles and
 * is then unsettled by an Undo stays written; the log is of boards that
 * were looked at, and that one was.
 */
function logBoard() {
	if (!combos || !board.answers.length || board.day !== barterKey()) return;
	const fits = candidates(combos.combos, board.answers);
	const drifted = fits.length ? null : driftOf(combos.combos, board.answers);
	const id = fits.length === 1 ? fits[0].id : drifted ? drifted.id : null;
	if (!id) return;
	const day = String(board.day).slice(0, 10);
	const log = store.getProfile('boardLog', []) || [];
	if (log.some(x => x[0] === day && x[1] === id)) return;
	store.setProfileQuiet('boardLog', [...log, [day, id, drifted ? 1 : 0]]);
}

function flushView() {
	if (!writeTimer) return;
	clearTimeout(writeTimer);
	writeTimer = null;
	// The store redraws the page from inside the write, before what was
	// written can be noted here; that redraw must not read it back over
	// the memory it came from.
	writing = true;
	try {
		store.setView(VIEW_NS, { goal, climb, planSec, advOpen, stock: stockGoal, item, qty, wants, matOrders, port, routes, stash, board, matBoard, sail, reach, questSkip, questPull });
	} finally {
		writing = false;
	}
	// What was just written is what is in memory: not to be read back.
	const s = store.getView(VIEW_NS);
	readSig = s ? JSON.stringify(s) : null;
}

// A write still owed when the page goes is made before it does.
if (typeof window !== 'undefined') {
	window.addEventListener('pagehide', flushView);
	document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushView(); });
	// A screenshot pasted at the tab itself, with no dialog open and
	// nothing asking for one. Both sailors who asked for the readers
	// asked for this: they have the picture on the clipboard already,
	// and finding the button first is a step that answers nothing. The
	// reader opens with the picture in hand. A paste into a field is
	// left alone, and so is one while a dialog is up -- the dialog has
	// its own listener, and two reads of one picture is one too many.
	document.addEventListener('paste', e => {
		const screen = document.querySelector('.barter-screen');
		if (!screen || document.querySelector('#dialog:not([hidden])')) return;
		const at = e.target;
		if (at && (at.isContentEditable || /^(INPUT|TEXTAREA)$/.test(at.tagName || ''))) return;
		const files = imagesOn(e.clipboardData);
		if (!files.length) return;
		e.preventDefault();
		readWindow(() => { const again = document.querySelector('[data-act="barter-redraw"]'); if (again) again.click(); }, files);
	});
}

/* ------------------------------------------------------------------ *
 * the hold
 * ------------------------------------------------------------------ */

/** What is aboard, as barter-plan reads it: the Map reads the same
 *  hold through the same function, so the two never disagree. */
const aboardStock = () => aboardOf(store);

/**
 * Every levelled good the sailor keeps, wherever it is -- the hold,
 * the bags, every storage -- as a Map. The stock is counted against
 * the targets from this: a [Level 2] at Velia is as much part of the
 * pile as one aboard, and a target already met somewhere is not worth
 * sailing for again.
 */
function everythingHeld() {
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
function floorsShut(orders) {
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
function cashFloorNow() {
	if (goal !== 'coin') return 0;
	const shut = floorsShut(ordersNow()).find(f => f.lv === COIN_LEVEL);
	return shut ? shut.floor : 0;
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

/** Where an unload goes: the harbour the run sails from, else the
 *  storage new goods land at, else a storage to choose. */
function unloadTo() {
	const from = fromPort();
	if (from) return from.name;
	const homes = store.getProfile('homes', {}) || {};
	return homes.goods || '';
}
const unloadTitle = () => (unloadTo() ? T('Put them ashore at {town}', { town: gameName(unloadTo()) }) : T('Put them ashore: choose the storage'));

/** The goods aboard: name, level, count, weight; heaviest level first. */
function held() {
	return [...goodsHeld(aboardStock())]
		.map(([name, n]) => ({ name, lv: levelOf(name), n, weight: n * weightOf(name) }))
		.sort((a, b) => b.lv - a.lv || a.name.localeCompare(b.name));
}

/**
 * The hold as one line across the page: the ship, its weight against
 * the limit, what is aboard by level, what waits ashore, and the way
 * into the whole thing -- which opens over the page, so the run under
 * it has the page to itself.
 */
function holdBarHTML(me, tickedLT = 0) {
	const prof = barterProfile();
	const goods = held();
	// On the wharf step the gauge follows the packing list: a good ticked
	// as fetched weighs in before the app has been told it moved, and one
	// unticked comes off, so the bar answers the press that was made.
	const lt = Math.max(0, goods.reduce((a, g) => a + g.weight, 0) + tickedLT);
	const w = shownHold(me.hold, lt);
	const pct = w.max > 0 ? Math.min(100, w.total / w.max * 100) : 0;
	const mark = w.mark;
	const state = w.state === 'heavy' ? 'over' : w.state;
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
	const weightText = `${w.text}${!goods.length ? ` · ${w.aboard ? T('no goods aboard, {n} of it {what}', { n: F(w.aboard), what: said(aboardWhat(w)) }) : T('no goods aboard')}` : w.note ? ` — ${w.note}` : ''} · ${T('barters to {n}', { n: F(w.deal) })}${tickedLT ? ` · ${T('as ticked below')}` : ''}`;
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
				<div class="hold-purse" title="${T('Set the Parley you hold and your level in the bar at the top of the page, where every screen reads them')}">
					<span class="hold-purse-n"><b>${F(parley)}</b><span>${T('Parley')}</span></span>
					${prof.vouchers ? `<span class="hold-purse-n"><b>${F(prof.vouchers)}</b><span>${prof.vouchers === 1 ? T('voucher') : T('vouchers')}</span></span>` : ''}
					<span class="hold-purse-n"><b>${F(parleyOf(prof).perTrade)}</b><span>${T('a trade')}</span></span>
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
let sheetOpen = null;   // which sheet is up, if any

function openSheet(id) {
	const sheet = SHEETS[id];
	sheetOpen = id;
	const host = openDialog(`<div class="${sheet.cls}">${sheet.html()}<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div></div>`, { onDismiss: () => { if (sheetOpen === id) sheetOpen = null; } });
	host.firstElementChild.classList.add(...sheet.box.split(' '));
}

/** The open sheet redrawn after a change, the caret kept where it was. */
function refreshSheet() {
	if (!sheetOpen) return;
	const sheet = SHEETS[sheetOpen];
	const box = document.querySelector(`#dialog:not([hidden]) .${sheet.cls}`);
	if (!box) { sheetOpen = null; return; }
	const el = document.activeElement;
	const keep = el && box.contains(el) && el.dataset.act ? { act: el.dataset.act, item: el.dataset.item || '', start: el.selectionStart, end: el.selectionEnd } : null;
	box.innerHTML = `${sheet.html()}<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button></div>`;
	if (!keep) return;
	const again = [...box.querySelectorAll(`[data-act="${keep.act}"]`)].find(x => (x.dataset.item || '') === keep.item);
	if (!again) return;
	again.focus({ preventScroll: true });
	try { if (keep.start != null && again.setSelectionRange) again.setSelectionRange(keep.start, keep.end); } catch { /* not a text field */ }
}

function holdHTML(me) {
	const goods = held();
	const lt = goods.reduce((a, g) => a + g.weight, 0);
	const n = goods.reduce((a, g) => a + g.n, 0);
	const worth = goods.reduce((a, g) => a + g.n * sellOf(g.name), 0);
	const w = shownHold(me.hold, lt);
	const pct = w.max > 0 ? Math.min(100, w.total / w.max * 100) : 0;
	const mark = w.mark;
	const state = w.state === 'heavy' ? 'over' : w.state;
	const room = lv => Math.max(0, Math.floor((w.limit - w.total) / GOODS[lv].weight));
	const sub = !n ? `${w.text} · ${w.aboard ? T('no goods aboard, {n} of it {what}', { n: F(w.aboard), what: said(aboardWhat(w)) }) : T('no goods aboard')} · ${w.deal === w.max ? T('barters and moves to {max}', { max: F(w.max) }) : T('barters to {deal}, moves to {max}', { deal: F(w.deal), max: F(w.max) })}`
		: w.note ? `${w.text} — ${w.note}`
			: `${w.text} · ${T('room for {a} more Lv4–5 or {b} Lv6–7 under the limit', { a: room(5), b: room(6) })}`;
	const q = holdQ.trim().toLowerCase();
	const passes = g => (!q || g.name.toLowerCase().includes(q)) && (!holdLv.size || holdLv.has(g.lv));
	const shown = goods.filter(passes);
	const filters = `<div class="hold-filters">
		<input class="field hold-q" type="search" placeholder="${T('Find a good…')}" value="${esc(holdQ)}" data-act="barter-hold-q" aria-label="${T('Find a good aboard or ashore')}">
		<span class="chips">${[1, 2, 3, 4, 5, 6, 7].map(lv => `<button class="chip tiny lvl${holdLv.has(lv) ? ' active' : ''}" data-act="barter-hold-lv" data-lv="${lv}" style="--tier:${TIER(lv)}" title="${T('Level {lv}', { lv })}">${lv}</button>`).join('')}${holdLv.size || q ? `<button class="chip tiny" data-act="barter-hold-clear">${T('clear')}</button>` : ''}</span>
	</div>`;
	const rows = shown.map(g => `<div class="barter-good">
		${img(g.name, 'row-icon')}
		<span class="map-row-main">
			<span class="map-row-name">${codexName(g.name)}</span>
			<span class="map-row-sub">${T('{each} LT each · {all} LT', { each: F(GOODS[g.lv].weight), all: F(g.weight) })}${sellOf(g.name) ? ` · ${T('a barterer pays {silver}', { silver: FC(sellOf(g.name)) })}` : ` · ${T('cannot be sold')}`}</span>
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
		${goods.length || ashore().length ? filters : ''}
		${rows ? `<div class="barter-goods">${rows}</div>` : goods.length ? `<p class="empty">${T('Nothing aboard matches.')}</p>` : `<p class="empty">${T('Nothing recorded aboard. Add a good, or log the trip that brought them back — the counts are the Inventory’s, under Trade goods.')}</p>`}
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
	const places = all.length > 1 ? `<span class="chips ashore-places">${all.map(t => `<button class="chip tiny${holdAt === t.town ? ' active' : ''}" data-act="barter-hold-at" data-town="${esc(t.town)}">${esc(gameName(t.town))}</button>`).join('')}</span>` : '';
	const towns = all.filter(t => !holdAt || t.town === holdAt).map(t => ({ ...t, goods: t.goods.filter(passes) })).filter(t => t.goods.length);
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
		board = { day: barterKey(), answers: [], own: false };
		persist();
	}
	const standing = board.answers.length ? candidates(combos.combos, board.answers) : combos.combos;
	// The board the sailor is actually looking at, when the record has
	// nothing that fits it. The forty layouts are a snapshot: the game
	// edits a slot at a maintenance without renumbering anything, and
	// once in a while what is in front of somebody is a board nobody
	// has on file. Rather than fall back to the whole table -- which is
	// every island's every exchange, and a fiction -- the islands they
	// told us about are made into a board of their own. It has to be
	// asked for, because until it is, a board half looked at is worse
	// than the table.
	// And between the two: a board that fits nothing because the game
	// has moved a slot on it. That is recognised rather than asked for --
	// it is the layout it always was, with an island or two as seen.
	const drifted = !standing.length && !board.own ? driftOf(combos.combos, board.answers) : null;
	const combo = standing.length === 1 ? standing[0]
		: drifted || ((!standing.length && board.own && board.answers.length) ? ownCombo(board.answers) : null);
	// Two reasons an island is not on the board, and they are told
	// apart: the client's own table says the count has not opened
	// today's exchange there, or the sailor looked and found it shut
	// where the table has nothing to say. Both leave the board the same
	// way; only the second is theirs to take back.
	const gated = gatedOffers(combo, barterProfile().barterCount);
	const told = shutNow();
	const shut = [...gated, ...told];
	return { standing, combo, shut, gated, told, data: combo ? boardData(combo, barterData, npcById, board.answers, shut) : barterData };
}

/**
 * What was seen today, as a layout in its own right.
 *
 * The same shape the forty have, so everything downstream -- the
 * board, the chains, the run, the gates -- reads it without knowing
 * the difference. Its id is not a number, which is how the bar tells a
 * sailor it is theirs and not the record's.
 */
function ownCombo(answers) {
	return { id: 'yours', seen: 0, own: true, offers: answers.map(a => [a.npcId, a.give, '1', a.recv]) };
}

/**
 * The exchanges this sailor has found shut, still shut.
 *
 * The client's table covers most of a board but not all of it: it ships
 * no [Level 4] -> [Level 5] row for thirteen islands and nothing at all
 * for the six mainland [Level 6] -> [Level 7] barterers, and where it
 * and the community's record disagree the gate is left unread rather
 * than read off the wrong offer. Those are the ones a sailor can still
 * find blank, so their word stands in: an exchange seen shut at 1,082
 * barters is shut until the next count on the game's own ladder, and
 * then worth trying again.
 */
function shutNow(prof = barterProfile()) {
	const seen = store.getProfile('shutOffers', []) || [];
	const count = Number(prof.barterCount) || 0;
	return seen.filter(x => count < nextGateAbove(x.at));
}

const fromPort = () => ports.find(p => p.id === port) || null;

/**
 * The board bar: which layout the sea is showing, or the question that
 * finds it, with the goal toggle and the refresh beside it.
 */
function boardHTML(b) {
	const prof = barterProfile();
	// Two shapes. A board that is known is a fact, and facts are a line
	// of ticked pills: the layout, the sailor's count, the Parley bar --
	// dashed where the app is assuming rather than reading. A board that
	// is not known is a question, and the quickest answer is a
	// screenshot, so the question is a place to paste one.
	const parleyPill = parleyGuessed(prof)
		? `<button class="board-pill guess" data-act="barter-parley-full" title="${T('Not read from a screenshot and not typed in — tap if the bar really is full')}">${T('Parley {n} · assumed full — that’s right?', { n: F(PARLEY.max) })}</button>`
		: `<span class="board-pill ok"><i>✓</i>${T('Parley {n}', { n: F(Math.min(PARLEY.max, prof.parleyHeld)) })}</span>`;
	const mePill = `<span class="board-pill ok" title="${T('Set the Parley you hold and your level in the bar at the top of the page, where every screen reads them')}"><i>✓</i>${prof.barterCount === 1 ? T('{n} barter', { n: F(prof.barterCount) }) : T('{n} barters', { n: F(prof.barterCount) })}${prof.level ? ` · ${esc(prof.level)}` : ''}</span>`;
	const bar = (cls, lead, sub, seen, acts, note = '') => (cls === 'known'
		? `<div class="board-strip">
			<div class="board-strip-row"><span class="board-strip-k">${T('Today’s board')}</span><span class="board-pill ok lead"><i>✓</i>${lead}</span>${mePill}${parleyPill}${seen ? `<span class="chips board-strip-seen">${seen}</span>` : ''}<span class="panel-spacer"></span><span class="board-strip-acts">${acts}</span></div>
			<div class="board-strip-sub">${sub}</div>${note}
		</div>`
		: `<section class="panel board-ask${cls ? ` ${cls}` : ''}">
			<div class="panel-head"><h2 class="panel-title">${T('Today’s board')}</h2><span class="panel-sub board-ask-lead">${lead}</span></div>
			<div class="panel-body">
				${acts ? `<button class="board-drop" data-act="barter-shot"><b class="by-key">${T('Paste your barter window here')}</b><b class="by-touch">${T('Add a screenshot of your barter window')}</b><span class="by-key">${T('Open the barter window in game, take a screenshot, press <kbd>Ctrl</kbd> <kbd>V</kbd>. The layout, your Parley and your barter count are read from it. Nothing is uploaded.')}</span><span class="by-touch">${T('Tap to choose the picture. The layout, your Parley and your barter count are read from it, on this device — nothing is uploaded.')}</span></button>` : ''}
				${acts ? `<div class="board-ask-acts"><span class="board-ask-or">${T('or')}</span>${acts}</div>` : ''}
				${seen ? `<div class="barter-bar-seen"><span class="barter-bar-k">${T('looked at')}</span><span class="chips">${seen}</span></div>` : ''}
				<p class="board-ask-sub">${sub}</p>${note}
			</div>
		</section>`);
	// The material islands are not part of any layout, so with a
	// material as the goal there is no layout to ask after: the bar is
	// the goal toggle and a word on where the day's list is ticked.
	if (goal === 'material') return bar('', `<b>${T('Today’s material list')}</b><span>${T('ticked below')}</span>`, T('The material islands roll on their own, apart from the forty layouts, so no island is asked about here: open the barter window in game and tick, below, the islands showing what you are after.'), '', '');
	if (!combos) return bar('', `<b>${T('Today’s board')}</b>`, T('The record of the boards did not load, so a run is planned on the whole table at best.'), '', '');
	const since = new Date(combos.sample.since + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
	// Each answer wears the good it handed back, so a mistyped island is
	// spotted without hovering for the tooltip.
	const seen = board.answers.map(a => `<span class="chip tiny active board-seen" title="${esc(gameName(a.give))} → ${esc(gameName(a.recv))}">${img(a.recv, 'row-icon xs')}${esc(isleShort(npcById.get(a.npcId)))}</span>`).join('')
		+ (board.answers.length ? `<button class="chip tiny" data-act="barter-board-undo" title="${T('Take back the last island looked at')}">↶ ${T('Undo')}</button>` : '');
	if (b.combo) {
		// What the count leaves out. Said on the bar, because an island
		// quietly missing from a board is the one thing worse than one
		// that cannot be sailed -- and said in two lines, because the
		// client's own table is a fact and the sailor's sighting is a
		// note they can take back.
		const today = offersOf(b.combo);
		const onBoard = x => {
			const o = today.get(x.npcId);
			return o && o.give === x.give && o.recv === x.recv;
		};
		const isles = list => esc(list.map(x => isleShort(npcById.get(x.npcId)) || '').filter(Boolean).join(', '));
		const gated = (b.gated || []).filter(onBoard);
		const told = (b.told || []).filter(onBoard);
		const next = gated.length ? Math.min(...gated.map(x => x.gate)) : 0;
		// A count nobody has typed reads as nought, and nought is a real
		// answer -- but it is also the answer that leaves the thinnest
		// board of all, so at nought the line says where to fix it
		// rather than leaving a veteran wondering what broke.
		const gatedLine = gated.length
			? `<div class="board-shut">${T('<b>{n} of {of} islands</b> are not open at {barters} barters — the game unlocks each exchange on its own count, so these show nothing today.', { n: gated.length, of: b.combo.offers.length, barters: F(prof.barterCount) })} ${prof.barterCount ? T('The next opens at <b>{n}</b>.', { n: F(next) }) : T('Set your <b>Total Barters</b> in the bar above if that is not you.')} <button class="linky" data-act="barter-gated">${T('which ones')}</button></div>`
			: '';
		const shutLine = fleetLine() + gatedLine + (told.length
			? `<div class="board-shut">${told.length === 1
				? T('<b>1 more island</b> is left out: {isles} — you looked and it was not trading.', { isles: isles(told) })
				: T('<b>{n} more islands</b> are left out: {isles} — you looked and they were not trading.', { n: told.length, isles: isles(told) })} <button class="linky" data-act="barter-shut-clear">${told.length === 1 ? T('put it back') : T('put them back')}</button></div>`
			: '');
		if (b.combo.own) {
			return bar('known',
				`<b>${T('Your own board')}</b><span>${b.combo.offers.length === 1 ? T('{n} island as you read them', { n: b.combo.offers.length }) : T('{n} islands as you read them', { n: b.combo.offers.length })}</span>`,
				T('No layout in the record fits what you saw, so the board is what you told it and nothing else — every chain below climbs only the islands above. The record is from {when} and the game moves a slot at a maintenance without renumbering anything, so this is worth passing on.', { when: esc(combos.read) }),
				seen,
				`<button class="ghost-btn sm" data-act="barter-shot" title="${T('Read more of the window off a screenshot')}">📷 ${T('Read the window')}</button><button class="ghost-btn sm" data-act="barter-book" title="${T('Every layout on file, how often each has been seen, and the boards sailors have read that are in no record')}">📖 ${T('The layout book')}</button>${tellChip()}<button class="ghost-btn sm" data-act="barter-own-board" title="${T('Go back to planning on the whole table instead')}">↩ ${T('the whole table')}</button><button class="ghost-btn sm" data-act="barter-board-clear" title="${T('The board was refreshed in game: start again')}">↻ ${T('Refreshed in game')}</button>`,
				fleetLine());
		}
		const fix = `<button class="ghost-btn sm" data-act="barter-board-fix" title="${T('An island is showing something the board below does not say, or nothing at all: say what you see, and the board follows')}">✎ ${T('An island shows something else…')}</button>`;
		if (b.combo.patched) {
			const moved = b.combo.was.map(d => `<b title="${T('You saw {sawGive} → {sawRecv}; the record has {filedGive} → {filedRecv}', { sawGive: esc(gameName(d.saw.give)), sawRecv: esc(gameName(d.saw.recv)), filedGive: esc(gameName(d.filed.give)), filedRecv: esc(gameName(d.filed.recv)) })}">${esc(isleShort(npcById.get(d.npcId)) || '')}</b>`).join(` ${T('and')} `);
			return bar('known',
				`<b>${T('Layout {id}', { id: esc(b.combo.id) })}</b><span>${b.combo.patched.length === 1 ? T('with one island as you saw it') : T('with {n} islands as you saw them', { n: b.combo.patched.length })}</span>`,
				b.combo.patched.length === 1
					? T('What you answered fits layout {id} everywhere but {moved}, so the board is that layout with that island as you saw it. The game moves a slot at a maintenance without renumbering anything — which makes this worth telling the fleet.', { id: esc(b.combo.id), moved })
					: T('What you answered fits layout {id} everywhere but {moved}, so the board is that layout with those islands as you saw them. The game moves a slot at a maintenance without renumbering anything — which makes this worth telling the fleet.', { id: esc(b.combo.id), moved }),
				seen,
				`${tellChip(true)}<button class="ghost-btn sm" data-act="barter-shot" title="${T('Read more of the window off a screenshot')}">📷 ${T('Read the window')}</button><button class="ghost-btn sm" data-act="barter-book" title="${T('Every layout on file, how often each has been seen, and the boards sailors have read that are in no record')}">📖 ${T('The layout book')}</button>${fix}<button class="ghost-btn sm" data-act="barter-board-clear" title="${T('The board was refreshed in game: start again')}">↻ ${T('Refreshed in game')}</button>`,
				shutLine);
		}
		return bar('known',
			`<b>${T('Layout {id}', { id: esc(b.combo.id) })}</b><span>${T('today’s board')}</span>`,
			T('seen {n} of {of} refreshes since {since} · every island’s offer is known; the material islands roll on their own and are read from the whole table, and which of its four [Level 7] goods an island pays is not the layout’s to say', { n: b.combo.seen, of: combos.sample.refreshes, since: esc(since) }),
			seen,
			`<button class="ghost-btn sm" data-act="barter-shot" title="${T('Read more of the window off a screenshot — the rows are matched against what each island deals')}">📷 ${T('Read the window')}</button><button class="ghost-btn sm" data-act="barter-book" title="${T('Every layout on file, how often each has been seen, and the boards sailors have read that are in no record')}">📖 ${T('The layout book')}</button>${fix}<button class="ghost-btn sm" data-act="barter-board-clear" title="${T('The board was refreshed in game: start again')}">↻ ${T('Refreshed in game')}</button>`,
			shutLine);
	}
	// Never asked about an island this sailor cannot sail to: its offer
	// is not on any barter window they can open.
	const ask = askable(b.standing, npcById, fromPort()).filter(a => npcOpen(a.npcId, prof.barterCount));
	if (!b.standing.length) {
		return bar('lost',
			`<b>${T('No layout shows that')}</b><span>${T('nothing in the record fits')}</span>`,
			T('The record is from {when}; the game moves a slot at a maintenance without renumbering anything, so it may simply have moved on. Sail what you saw instead — the run is then planned on those islands and nothing else — and tell the fleet, because a board the record has never seen is exactly what is worth passing on.', { when: esc(combos.read) }),
			seen,
			`<button class="chip primary" data-act="barter-own-board" title="${T('Plan on the islands you have answered, instead of on the whole table')}">⚑ ${T('Sail what you saw')}</button><button class="ghost-btn sm" data-act="barter-shot" title="${T('Read the whole window off a screenshot, and offer it to the fleet')}">📷 ${T('Read the window')}</button><button class="ghost-btn sm" data-act="barter-book" title="${T('Every layout on file, how often each has been seen, and the boards sailors have read that are in no record')}">📖 ${T('The layout book')}</button>${tellChip(true)}<button class="ghost-btn sm" data-act="barter-board-clear">↻ ${T('Start again')}</button>`,
			fleetLine());
	}
	const first = ask[0] ? npcById.get(ask[0].npcId) : null;
	const lead = board.answers.length
		? `<b>${T('{n} layouts fit', { n: b.standing.length })}</b><span>${T('one more look settles it')}</span>`
		: `<b>${T('Which board?')}</b><span>${T('today’s board')}</span>`;
	// What somebody else has already read of it. Said here rather than
	// only once the layout is known, because this is the question their
	// reading answers.
	const fleetNote = fleetLine();
	const acts = `${first ? `<button class="chip primary" data-act="barter-board-ask" data-npc="${first.id}" title="${T('The island whose offer tells the layouts apart best')}${ask[0].worst > 1 ? ` — ${T('leaves {n} at worst', { n: ask[0].worst })}` : ''}">${T('What does <b>{isle}</b> show?', { isle: esc(gameName(isleOf(first))) })} ▾</button>` : ''}<button class="chip" data-act="barter-board-island" title="${T('Look at an island of your own choosing instead')}">${T('another island…')}</button><button class="ghost-btn sm" data-act="barter-book" title="${T('Every layout on file, how often each has been seen, and the boards sailors have read that are in no record')}">📖 ${T('The layout book')}</button>`;
	return bar('', lead, T('Look at one island in the game and tap what it offers; the whole board follows, since every refresh is one of {n} layouts. Or screenshot the window and let it read every row at once.', { n: combos.combos.length }), seen, acts, fleetNote);
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
	if (item === '') return null;   // put down on purpose: nothing open
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
	const pts = [...(from ? [from] : []), ...stops.map(s => s.place || s.wharf || npcById.get(s.npcId)).filter(Boolean)];
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
	return { total, legs, from, time: fmtRange(fast, slow), mid: (fast + slow) / 2, timeOf: m => fmtRange(...range(m)), secondsOf: m => { const [a, b] = range(m); return (a + b) / 2; } };
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
function questPlan(stops, mode, hold, weightStart = 0) {
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
const skippedToday = () => (questSkip.day === barterKey() ? questSkip.ids : []);
const pulledToday = () => (questPull.day === barterKey() ? questPull.ids : []);

const questTitle = q => q.name.replace(/^(\[[^\]]+\]\s*)+/, '');
/** The quest's name as the way to its row on the Quests tab. */
const questLink = q => `<button class="linky run-quest-name" data-act="view" data-id="quests" data-quest="${esc(q.id)}" title="${esc(said(q.where))}${q.note ? ` — ${esc(said(q.note))}` : ''} · ${T('open on the Quests tab')}">${questIcon(q) ? `<img class="quest-pip" src="${esc(questIcon(q))}" alt="" loading="lazy">` : ''}${esc(questTitle(q))}</button>`;
const questWanted = () => new Set(wantedQuests().map(q => q.id));

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
function tradesDone(on, stops) {
	const full = on && Array.isArray(on.stops) && on.stops.length ? on.stops : stops;
	return full.reduce((a, s, k) => a + (s.npcId && ticked(on.done, s, k, full) ? Number(s.times) || 0 : 0), 0);
}

/** One quest handed in at a stop: the quest, its taker, its cadence,
 *  and the way to record it. */
function questChip(x, wanted, trades = 0, made = 0) {
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
function questsLine(qp, mode) {
	if (mode === 'no') return '';
	const bits = [T('<b>{n}</b> handed in on the way', { n: qp.count })];
	if (qp.added) bits.push(qp.added === 1 ? T('{n} stop put in', { n: qp.added }) : T('{n} stops put in', { n: qp.added }));
	if (qp.off.length) bits.push(T('{n} off the way', { n: qp.off.length }));
	return `<span class="run-quests-line" title="${T('Under the orders: {orders}', { orders: esc(said((QUEST_CHOICES.find(([k]) => k === mode) || QUEST_CHOICES[0])[1])) })}">📜 ${bits.join(' · ')}</span>`;
}

/** The quests handed in at the harbour before casting off, and the
 *  ones the run cannot take in. */
function questsPanels(qp, from) {
	const wanted = questWanted();
	const home = qp.home.length && from ? `<section class="panel run-list run-quests-home"><div class="panel-head"><h2 class="panel-title">${T('Quests at {port}', { port: esc(gameName(from.name)) })}</h2><span class="panel-sub">${T('handed in before casting off')}</span></div><div class="run-quests">${qp.home.map(x => questChip(x, wanted)).join('')}</div></section>` : '';
	const offN = qp.off.length + qp.skipped.length;
	const off = offN ? `<details class="panel run-list run-quests-off"><summary class="panel-head"><h2 class="panel-title">${T('Quests off the way')}</h2><span class="panel-sub">${T('{n} not taken in by this run · open to take one in', { n: offN })}</span></summary><div class="run-quests">${qp.off.map(questOff).join('')}${qp.skipped.map(questSkipped).join('')}</div></details>` : '';
	return home + off;
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
function ledgerOf(stops, legs) {
	const prof = barterProfile();
	const at = [];
	let t = 0;
	stops.forEach((s, k) => {
		const m = legs && legs.from ? legs.legs[k] : k > 0 && legs ? legs.legs[k - 1] : null;
		if (m != null && legs.secondsOf) t += legs.secondsOf(m) / 60;
		at[k] = t;
	});
	return parleyLedger(stops, { held: prof.parleyHeld, vouchers: prof.vouchers, use: ordersNow().vouchers !== 'keep', minutesAt: k => at[k] || 0 });
}

/** What pressing a stop done is called, by the sort of stop it is. */
const doneLabel = s => (s.wharf ? T('Called here') : s.hunt ? T('Hunted here') : s.quest ? T('Handed in') : T('Traded here'));

/** Which of its four [Level 7]s an island may pay, said after the one
 *  the plan named -- on the board's own runs only. */
function fourNote(s, board) {
	if (!board || levelOf(s.item) !== 7) return '';
	const last = (store.getProfile('sevens', {}) || {})[s.npcId];
	return last && last.item !== s.item ? T(', or another of the island’s four — it paid {name} last time', { name: esc(gameName(last.item)) }) : last ? ` — ${T('as it paid last time')}` : T(', or another of the island’s four');
}

/** What happens at a stop: the exchange at an island, the loads, the
 *  goods left and the sale at a wharf, nothing at a quest stop. */
function stopDid(s, board = false) {
	if (s.quest) return '';
	if (s.wharf) return `${s.loads && s.loads.length ? `<div class="run-leave"><span class="run-leave-k">${T('Loads from storage')}</span>${s.loads.map(d => `<span class="run-leave-good">${img(d.item, 'row-icon sm')}<b>${n1(d.n)}×</b>${esc(gameName(d.item))}</span>`).join('')}</div>` : ''}${s.dropped.length ? `<div class="run-leave"><span class="run-leave-k">${T('Leaves in storage')}</span>${s.dropped.map(d => `<span class="run-leave-good">${img(d.item, 'row-icon sm')}<b>${n1(d.n)}×</b>${esc(gameName(d.item))}</span>`).join('')}</div>` : ''}${s.sale ? `<div class="run-sell">${T('sells {n} {what} here for {silver}', { n: n1(s.sale.n), what: s.sale.levels && s.sale.levels.length === 1 ? `[Level ${s.sale.levels[0]}]` : T('goods'), silver: FC(Math.round(s.sale.total)) })}</div>` : ''}`;
	return `<div class="run-trade">${img(s.give, 'row-icon sm')}<span>${esc(s.giveText)}× ${esc(gameName(s.give))}</span><span class="run-arrow">→</span><span class="run-to" style="--tier:${TIER(levelOf(s.item))}"><i></i>${esc(s.recvText)}× ${esc(gameName(s.item))}${fourNote(s, board)}</span><span class="run-got"><span class="run-times">×${s.times}</span>${img(s.item, 'row-icon sm')}</span></div>`;
}

/**
 * What a stop on the checklist asks besides Done: the count an island
 * that pays a range paid, which of its four [Level 7]s it handed over,
 * and whether a wharf call's goods were sold there or kept aboard.
 */
function stopAsks(s, k, stops, on, { paid = true } = {}) {
	const key = stopKey(s, k, stops);
	const ask = paid ? paidAsk(s, on.seen[s.npcId]) : '';
	let got = '';
	if (s.npcId && levelOf(s.item) === 7) {
		const four = seventhsOf(s.npcId);
		if (four.length > 1) got = `<span class="run-paid"><span>${T('got')}</span>${four.map(name => `<button class="chip pay${(on.got || {})[s.npcId] === name ? ' active' : ''}" data-act="barter-got" data-npc="${s.npcId}" data-item="${esc(name)}" title="${esc(gameName(name))}">${img(name, 'row-icon sm')}</button>`).join('')}</span>`;
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

function stopRows(stops, legs, { k0 = 0, board = false, sailing = null, tag = null, notes = null, ledger = null, map = false } = {}) {
	const wanted = notes ? questWanted() : new Set();
	// The bar after each stop: the whole run's book when the caller
	// drew it up -- these stops may be one chain's segment of it, so
	// the book is read at the stop's place in the run -- else this
	// list's own, which starts where the list does.
	const book = ledger || ledgerOf(stops, legs);
	const rowAt = k => (ledger ? book.rows[k] : book.rows[k - k0]);
	// On the checklist the barter quests count what the stops ticked
	// Done have dealt, so the count climbs as the run is sailed.
	const made = sailing ? tradesDone(sailing, stops) : 0;
	const check = (s, k) => {
		if (!sailing) return '';
		const key = stopKey(s, k, stops);
		const done = ticked(sailing.done, s, k, stops);
		return `<div class="run-check">${stopAsks(s, k, stops, sailing)}<button class="run-done${done ? ' on' : ''}" data-act="barter-stop-done" data-k="${esc(key)}" aria-pressed="${done}"><i>${done ? '✓' : ''}</i>${done ? T('Done') : doneLabel(s)}</button></div>`;
	};
	return stops.map((s, i) => {
		const k = k0 + i;
		const place = s.place || s.wharf || npcById.get(s.npcId);
		const m = legs.from ? legs.legs[k] : k > 0 ? legs.legs[k - 1] : null;
		const leg = m != null ? `<span class="run-leg">${esc(fmtDistance(m))} · ${esc(legs.timeOf(m))}</span>` : '';
		// The hold as the game shows it: goods and crew over the limit --
		// the ship's own where the stop was kept without one.
		const w = shownHold(s.hold || currentShip().hold, s.weightAfter);
		const over = w.state === 'over', heavy = w.state === 'heavy' || w.state === 'dead', dead = w.state === 'dead';
		const did = stopDid(s, board);
		return `<div class="run-stop${s.wharf ? ' wharf' : ''}${s.quest ? ' quest' : ''}${s.sale ? ' sale' : ''}${i === stops.length - 1 ? ' last' : ''}${sailing && ticked(sailing.done, s, k, stops) ? ' done' : ''}" data-i="${k}"${s.npcId ? ` data-npc="${s.npcId}"` : ''}${map ? ' data-step-row' : ''}>
			<div class="run-rail"><i></i><b>${k + 1}</b><i></i></div>
			<div class="run-main">
				<div class="run-stop-head">${s.wharf ? `<span class="run-anchor" title="${T('A pause at a wharf, not a barter')}">⚓</span>` : s.quest ? `<span class="run-anchor" title="${s.hunt ? T('A stop put in to hunt, not a barter') : T('A stop put in for a quest, not a barter')}">${s.hunt ? '🎯' : '📜'}</span>` : ''}${map ? `<button class="run-stop-fly" data-act="map-step" data-i="${k}" title="${T('Fly the chart here, and step to it')}">${esc(s.quest ? gameName(place.name) : s.wharf ? T('{at} wharf', { at: gameName(place.at) }) : gameName(isleOf(place)))}</button>` : `<b>${esc(s.quest ? gameName(place.name) : s.wharf ? T('{at} wharf', { at: gameName(place.at) }) : gameName(isleOf(place)))}</b>`}<span>${esc(s.quest ? gameName(place.who) : s.wharf ? gameName(place.name) : gameName(whoOf(place)))}</span>${tag ? tag(s) : ''}${leg}</div>
				${did}
				${notes && notes.at(k).length ? `<div class="run-quests">${notes.at(k).map(x => questChip(x, wanted, notes.trades || 0, made)).join('')}</div>` : ''}
				${check(s, k)}
			</div>
			<div class="run-hold">
				<div><span>${T('hold')}</span><b class="${heavy ? 'warn' : over ? 'amber' : ''}" title="${T('Everything aboard, crew included, over the limit — as the game\'s Ship Info reads')}">${esc(w.text)}</b></div>
				<div class="run-bar"><i style="width:${w.fill.toFixed(1)}%"></i><i class="over" style="width:${w.extra.toFixed(1)}%"></i><i class="heavy" style="width:${w.worse.toFixed(1)}%"></i></div>
				${w.note ? `<div class="run-note${dead || heavy ? ' warn' : ''}">${w.note}</div>` : ''}
				${parleyBar(rowAt(k), s)}
			</div>
		</div>`;
	}).join('');
}

/**
 * The Parley bar after a stop, drawn under the hold's: what is left of
 * the bar, the quarter a voucher put back, and the stop that would
 * stall for want of it.
 */
function parleyBar(row, s) {
	if (!row) return '';
	const low = row.after < row.max * 0.1;
	const spent = s.npcId && row.spent ? `−${F(row.spent)}` : '';
	return `<div class="run-parley${row.short ? ' short' : low ? ' low' : ''}">
		<div><span>${T('parley')}</span><b class="${row.short ? 'warn' : low ? 'amber' : ''}">${F(row.after)}</b>${spent ? `<small>${spent}</small>` : ''}</div>
		<div class="run-bar parley"><i style="width:${Math.min(100, row.pct).toFixed(1)}%"></i></div>
		${row.voucher ? `<div class="run-note teal">${T('a voucher drawn on here — a quarter of a bar back')}</div>` : ''}
		${row.short ? `<div class="run-note warn">${T('{n} Parley short', { n: F(row.short) })} — ${s.parley && s.times ? T('{n} of the {of} attempts wait', { n: Math.ceil(row.short / (s.parley / s.times)), of: s.times }) : T('the bar is empty')}${row.voucher ? '' : row.wait ? T('; a voucher can be drawn in <b>{n} min</b>, and the cooldown is the only thing in the way', { n: F(row.wait) }) : T(', and there is no voucher to draw on')}</div>` : ''}
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
function cutsHTML(plan, pace, name) {
	if (!plan.cut || !plan.cut.length) return '';
	const lines = plan.cut.map(c => {
		const chain = plan.order[c.chain];
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
							: T('there is nothing left to hand over at {where}', { where });
		// The way out, where there is one: a pace that calls at a wharf,
		// or the weight to put ashore before casting off.
		// A good the Market is out of may still be in a storage of the
		// sailor's own: the orders can take it from there instead.
		if (c.why === 'market') {
			const own = c.held >= c.want
				? T('You keep <b>{n}</b> of it — {link}', { n: F(c.held), link: `<button class="chip tiny primary" data-act="barter-land-from" data-id="stock" title="${T('Start the land chains from the shore goods you already keep, instead of buying them')}">${T('take land goods from my storage')} →</button>` })
				: `<span class="run-cut-out">${T('it comes back when somebody lists some; the prices are asked again every half hour')}</span>`;
			return `<li><b>${name(chain)}</b> ${got} — ${why}. ${own}</li>`;
		}
		const out = c.why === 'hold' || c.why === 'over' || c.why === 'share'
			? (pace === 'fast'
				? `<button class="chip tiny primary" data-act="barter-pace-set" data-id="steady" title="${T('Every attempt, still under the limit, a wharf call to leave the surplus')}">${T('full, never slower')} →</button>`
				: `<span class="run-cut-out">${T('leave <b>{n} LT</b> ashore before casting off', { n: F(Math.max(1, (c.need || 0) - (c.free || 0))) })}</span>`)
			: '';
		return `<li><b>${name(chain)}</b> ${got} — ${why}.${out ? ` ${out}` : ''}</li>`;
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
function chartData(stops, pick) {
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
		if (!s.wharf || (!s.dropped.length && !s.sale && !(s.loads && s.loads.length) && !questsAt(s).length)) continue;
		calls.push([n, s.wharf.name, s.wharf.at, s.wharf.x, s.wharf.y,
			s.dropped.map(d => [d.item, Math.round(d.n * 10) / 10]),
			s.sale ? Math.round(s.sale.n * 10) / 10 : 0,
			s.sale ? Math.round(s.sale.total) : 0,
			questsAt(s)]);
	}
	return { ids, pick: pick || '', trades, calls };
}

/** The route as a fragment for the chart's address (applyMapLink). */
function chartFragmentOf(data) {
	if (!data || !data.ids.length) return null;
	const parts = [`r=${data.ids.join('.')}`];
	if (port) parts.push(`s=${port}`);
	if (data.pick) parts.push(`p=${encodeURIComponent(data.pick)}`);
	if (data.trades.length) parts.push(`x=${encodeURIComponent(JSON.stringify(data.trades))}`);
	if (data.calls.length) parts.push(`w=${encodeURIComponent(JSON.stringify(data.calls))}`);
	return parts.join(';');
}

function chartButton(stops, pick) {
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
const parleyGuessed = prof => !(prof.parleyHeld > 0);
const parleyOf = prof => ({
	bar: (prof.parleyHeld > 0 ? Math.min(PARLEY.max, prof.parleyHeld) : PARLEY.max) + prof.vouchers * PARLEY.voucher,
	held: prof.parleyHeld > 0 ? Math.min(PARLEY.max, prof.parleyHeld) : PARLEY.max,
	vouchers: prof.vouchers,
	perTrade: parleyPerTrade({ ...prof, kind: 'trade' })
});
const stashAt = () => stashes.find(w => w.at === stash) || null;

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
function retickIfAuto() {
	const mine = proposed.best && proposed.best.ids.length === routes.ids.length && proposed.best.ids.every(id => routes.ids.includes(id));
	if (mine && routes.key) routesAuto = routes.key;
}

/** The orders as saved, cleaned; the cash-out preset until any are. */
const ordersNow = () => readOrders(store.getProfile('orders', null));
function setOrders(patch) {
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
	const entry = { name: clean, goal, orders: ordersNow(), stock: { ...stockGoal, targets: { ...stockGoal.targets } }, port, stash };
	store.setProfile('savedOrders', [entry, ...mine].slice(0, SAVED_MAX));
	toast(T('Saved as “{name}”', { name: clean }));
}

function applySaved(name) {
	const it = savedNow().find(x => x.name === name);
	if (!it) return;
	store.setProfile('orders', readOrders(it.orders));
	if (it.stock) stockGoal = readStock(it.stock);
	if (it.goal === 'stock' || it.goal === 'silver' || it.goal === 'material') goal = it.goal;
	if (ports.some(p => p.id === Number(it.port))) port = Number(it.port);
	if (STASHES.includes(it.stash)) stash = it.stash;
	persist();
}

function dropSaved(name) {
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

function askSaveOrders(then) {
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
const perUnitText = v => (v > 0 ? T('{silver}/unit', { silver: FC(Math.round(v)) }) : '');
const perHourText = v => (v > 0 ? T('{silver}/h', { silver: FC(Math.round(v)) }) : '');

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
let kindsMemo = null;
function kindsPerLevel() {
	if (kindsMemo && kindsMemo.of === barterData) return kindsMemo.at;
	const sets = new Map();
	const add = name => {
		const lv = levelOf(name);
		if (!lv) return;
		if (!sets.has(lv)) sets.set(lv, new Set());
		sets.get(lv).add(name);
	};
	for (const it of barterData || []) { add(it.name); for (const x of it.sources || []) add(x.give && x.give.name); }
	kindsMemo = { of: barterData, at: new Map([...sets].map(([lv, set]) => [lv, set.size])) };
	return kindsMemo.at;
}

/**
 * What a run banks toward the targets: the goods it ends holding less
 * the goods it started with, each counted only up to the target still
 * short. What it makes over a target is counted apart -- that is not
 * stock, it is next week's fuel, and saying so keeps the headline
 * honest.
 */
function stockGains(plan, aboard) {
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
		const want = stockGoal.targets[lv] || 0;
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
function aheadHTML(gains, plan, prof) {
	if (!gains) return '';
	const held = everythingHeld();
	const kinds = kindsPerLevel();
	let short = 0;
	for (const lv of STOCK_LEVELS) {
		const want = stockGoal.targets[lv] || 0;
		if (!want || lv > stockGoal.ceiling) continue;
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
	const slots = STOCK_LEVELS.filter(lv => lv <= stockGoal.ceiling && (stockGoal.targets[lv] || 0) > 0).reduce((a, lv) => a + (kinds.get(lv) || 0), 0);
	return `<p class="run-ahead">${T('<b>{n}</b> goods short of the targets', { n: F(short) })} · ${runs === 1 ? T('<b>{n}</b> more run like this one', { n: F(runs) }) : T('<b>{n}</b> more runs like this one', { n: F(runs) })} · ${days === 1 ? T('about <b>{n}</b> day', { n: F(days) }) : T('about <b>{n}</b> days', { n: F(days) })} ${perDay === 1 ? T('at {n} board a day', { n: F(perDay) }) : T('at {n} boards a day', { n: F(perDay) })}${prof.barterCount ? ` · ${T('<b>{n}</b> barters by then', { n: F(prof.barterCount + runs * plan.trades) })}` : ''}${slots ? ` · ${T('the full stock is <b>{n}</b> storage slots, one to a kind', { n: F(slots) })}` : ''}</p>`;
}

/* ------------------------------------------------------------------ *
 * the plan: where today ends, how to sail it
 * ------------------------------------------------------------------ */

/** What the day is for. It used to sit on the board's bar, where it
 *  read as something about the board; it is the first thing the plan
 *  asks, so it heads the plan. */
function goalChips() {
	const chip = (id, label, title) => `<button class="seg${goal === id ? ' on' : ''}" data-act="barter-goal" data-id="${id}" title="${esc(title)}">${label}</button>`;
	return `<span class="segs" role="group" aria-label="${T('What the run is for')}">${chip('silver', T('Silver'), T('The chains of today’s board, and a run along the ones ticked'))}${chip('stock', T('A stock'), T('The same board, sailed to fill the storage instead: nothing sold, the climbs stopped where the stock ends'))}${chip('coin', `${img(COIN, 'goal-icon')}${T('Crow Coins')}`, T('The same board, sailed to the islands that pay in Crow Coins: every climb stops at [Level 4], where the coin islands take them'))}${chip('material', T('A material'), T('The ladder to one material, against what is aboard'))}</span>`;
}

/** The level the day's climbs end at, whatever the day is for. */
const topNow = () => (goal === 'stock' ? stockGoal.ceiling : goal === 'coin' ? COIN_LEVEL : climb || 7);

/**
 * The levels a wharf may be told to sell from. A rung is flipped by
 * moving that line, not by setting a rule of its own: told to sell a
 * level, the line drops to the lowest choice that takes it in; told to
 * keep one, it rises to the lowest choice above it. So flipping Level 4
 * to sold sells Level 3 as well, and the ladder says so.
 */
const SELL_LINES = SELL_CHOICES.map(([v]) => Number(v)).sort((a, b) => a - b);
const sellFrom = lv => SELL_LINES.filter(v => v <= lv).pop() || SELL_LINES[0];
const keepFrom = lv => SELL_LINES.find(v => v > lv) || NOTHING;

/** The levels a wharf sells under these orders, among those reached. */
const soldLevelsOf = (o, top) => [3, 4, 5, 6, 7].filter(lv => lv <= top && lv >= o.sell);

/** The day in a sentence: where the climb ends and what becomes of it. */
function goalLine(o) {
	const top = topNow();
	if (goal === 'coin') return T('Climb to Level {lv}, cash it in for Crow Coins', { lv: COIN_LEVEL });
	const sold = goal === 'stock' ? [] : soldLevelsOf(o, top);
	// Nothing sells for two quite different reasons: a stock run sells
	// nothing on purpose, and a silver run whose climb stops below the
	// level a wharf pays for sells nothing because there is nothing at
	// that reach to sell. Said apart, since one is an order and the
	// other is a thing the sailor may not have meant.
	if (!sold.length) return goal === 'stock'
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
function ladderHTML(o, { fits = null, tickedN = 0 } = {}) {
	const stocking = goal === 'stock', coining = goal === 'coin';
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
		const want = stocking ? stockGoal.targets[lv] || 0 : o.floors[lv] || 0;
		const keep = !reached || (!stocking && lv > 6) ? '<span class="rung-keep none" aria-hidden="true"></span>'
			: `<label class="rung-keep${want ? ' set' : ''}" title="${stocking ? T('What to keep of every good at this level: the run fills it and never spends below it') : T('Never sold, never handed on: this many of every good at this level stay with you')}"><span>${stocking ? T('each') : T('keep')}</span>${amountInput('purse-inline', want || '', `data-act="${stocking ? 'barter-target' : 'barter-floor'}" data-lv="${lv}" placeholder="0" aria-label="${stocking ? T('Keep of every Level {lv} good', { lv }) : T('Keep back of Level {lv}', { lv })}"`)}</label>`;
		// How far along a stock level is, under its keep line.
		let note = '';
		if (stocking && reached && want) {
			const of = kinds.get(lv) || 0;
			const done = [...everything].filter(([name]) => levelOf(name) === lv).reduce((a, [, k]) => a + Math.min(k, want), 0);
			note = `<span class="rung-note${done >= want * of ? ' full' : ''}">${done >= want * of ? T('stock|full') : T('{n} short of {of}', { n: F(want * of - done), of: F(want * of) })}</span>`;
		}
		const coinNode = lv === COIN_LEVEL ? `<span class="rung-coin-line" aria-hidden="true"></span><button class="rung-node coin${coining ? ' on' : ''}" data-act="barter-coin-node" title="${T('Cash Level 4 in at the coin islands instead of climbing on')}">${img(COIN, 'rung-coin')}</button><span class="rung-name coin">${T('Crow Coins')}</span><span class="rung-fate ${coining ? 'gold' : 'mute'}">${coining ? T('the goal') : T('or cash in')}</span>` : '';
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
	const aims = stocking ? `<div class="ladder-aim"><span class="run-pick-k">${T('the day is for')}</span><span class="segs" role="group" aria-label="${T('What the stock run is for')}">${AIM_CHOICES.map(([id, label, title]) => `<button class="seg${stockGoal.aim === id ? ' on' : ''}" data-act="barter-aim" data-id="${id}" title="${esc(said(title))}">${esc(said(label))}</button>`).join('')}</span><span class="orders-sub">${esc(said((AIM_CHOICES.find(([a]) => a === stockGoal.aim) || AIM_CHOICES[0])[2]))}</span></div>` : '';
	return `<div class="ladder-head">${goalChips()}<span class="panel-spacer"></span><button class="linky" data-act="barter-hold-open" title="${T('Open the hold: every good aboard and ashore, with its count')}">${T('Open the hold')} ›</button><button class="linky" data-act="barter-add" title="${T('Record a good that is aboard')}">＋ ${T('A good')}</button></div>
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
function orderRow(act, label, value, options, title = '') {
	const chosen = options.find(([v]) => String(v) === String(value)) || options[0];
	const pick = options.length > 6
		? `<select class="field select" data-act="${act}" aria-label="${esc(label)}">${options.map(([v, t]) => `<option value="${esc(String(v))}"${String(v) === String(value) ? ' selected' : ''}>${esc(said(t))}</option>`).join('')}</select>`
		: `<span class="chips">${options.map(([v, t]) => `<button class="chip tiny${String(v) === String(value) ? ' active' : ''}" data-act="barter-order" data-k="${act}" data-v="${esc(String(v))}">${esc(said(t))}</button>`).join('')}</span>`;
	return `<div class="order-row"${title ? ` title="${esc(title)}"` : ''}><span class="order-k">${label}</span><div class="order-v">${pick}${chosen && chosen[2] ? `<span class="run-pick-sub">${esc(said(chosen[2]))}</span>` : ''}</div></div>`;
}

const PACE_CHOICES = () => [['fast', T('fast'), T('No wharf calls, never slower than full speed: only what the hold carries under the limit')], ['steady', T('full, never slower'), T('Every attempt, the hold kept under the limit by calling at a wharf to leave the surplus — more calls, full speed')], ['full', T('full, loaded'), T('Every attempt, the hold taken up to the barter ceiling — a quarter over the limit, sailing slower — and a wharf call only where the next island would not deal')]];
const labelOf = (options, value) => { const hit = options.find(([v]) => String(v) === String(value)) || options[0]; return said(hit[1]); };

/** How the orders read in a line, for the head of their section. */
function howLine(o) {
	const from = fromPort();
	const named = SAIL_PRESETS.find(p => p.id === sailPresetOf(o));
	if (named) return [said(named.label), from ? T('from {port}', { port: gameName(from.name) }) : ''].filter(Boolean).join(' · ');
	return [labelOf(PACE_CHOICES(), o.pace), labelOf(LAND_CHOICES, o.buy ? (o.landFrom === 'stock' ? 'stock' : 'buy') : 'no'), o.hours ? labelOf(HOUR_CHOICES, o.hours) : T('no time cap'), from ? T('from {port}', { port: gameName(from.name) }) : ''].filter(Boolean).join(' · ');
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
function howHTML(o, figs = null) {
	const stocking = goal === 'stock', coining = goal === 'coin';
	const on = sailPresetOf(o);
	// Each way of sailing says what it would come to for the chains
	// ticked, so they are chosen between on what they pay and how long
	// they take rather than on what their names suggest.
	const fig = id => { const f = figs && figs.get(id); return f ? `<span class="preset-fig"><b>${f.big}</b><span>${f.sub}</span></span>` : ''; };
	const cards = `${figs && figs.size ? `<p class="preset-note">${T('Under each: what it would come to with the chains ticked now. Choosing one lets the search pick the chains again, unless you ticked them yourself.')}</p>` : ''}<div class="preset-cards">${SAIL_PRESETS.map(p => `<button class="preset-card${on === p.id ? ' on' : ''}" data-act="barter-sail-preset" data-id="${p.id}" aria-pressed="${on === p.id}"><span class="preset-name"><i></i>${esc(said(p.label))}</span><span class="preset-line">${esc(said(p.sub))}</span>${fig(p.id)}</button>`).join('')}
		<button class="preset-card custom${on ? '' : ' on'}" data-act="barter-adv" aria-expanded="${advOpen}"><span class="preset-name"><i></i>${T('My own way')}</span><span class="preset-line">${on ? T('Set every order yourself: where the first goods come from, the pace, the time, the vouchers, the quests.') : esc(howLine(o))}</span><span class="preset-fig"><span>${advOpen ? `${T('hide the orders')} ▴` : `${T('every order')} ▾`}</span></span></button>
	</div>`;
	const rows = `${orderRow('barter-buy', T('land goods'), o.buy ? (o.landFrom === 'stock' ? 'stock' : 'buy') : 'no', LAND_CHOICES)}
		${orderRow('barter-pace', T('pace'), o.pace, PACE_CHOICES())}
		${orderRow('barter-hours', T('under way at most'), o.hours, HOUR_CHOICES, T('A run proposed here sails no longer than this'))}
		${orderRow('barter-stash', T('storage at'), stash, [['', T('the nearest wharf')], ...stashes.map(w => [w.at, gameName(w.at)])])}
		${orderRow('barter-vouchers', T('trade vouchers'), o.vouchers, VOUCHER_CHOICES, T('Whether the run draws on the Crow’s Trade Vouchers you carry; each is a quarter of a bar, on its own two-hour cooldown'))}
		${orderRow('barter-quests', T('quests on the way'), o.quests, QUEST_CHOICES, T('The dailies and weeklies already taken, handed in where the run passes their taker or at a stop put in a short way off the route; the barter quests counted off the run\'s trades; the hunts only when their grounds lie on the way'))}
		${orderRow('barter-way', T('the way round'), o.way, WAY_CHOICES, T('One route through every rung of every chain ticked, each after the rung beneath it — the nearest islands first, whatever chain they belong to — or each chain climbed to its top before the next'))}
		${orderRow('barter-ratio', T('a 2-3 counts'), o.count, COUNT_CHOICES, T('How an exchange that pays a range is counted; the checklist records what your runs saw'))}
		<div class="order-row" title="${T('How long the ship actually sits at a stop, apart from the sailing: only the clock uses these')}"><span class="order-k">${T('a stop takes, apart from the sailing')}</span><div class="order-v run-pauses">
			<label class="run-pause">${amountInput('purse-inline', o.pause.isle || 0, `data-act="barter-pause" data-at="isle" aria-label="${T('Seconds at an island, bartering')}"`)}<span>${T('s bartering, then on')}<em>${T('opening the window, the trades, under way again')}</em></span></label>
			<label class="run-pause">${amountInput('purse-inline', o.pause.call || 0, `data-act="barter-pause" data-at="call" aria-label="${T('Seconds at a wharf or a quest stop')}"`)}<span>${T('s at a wharf or a quest')}<em>${T('storing, selling, handing in — the longer sort of stop')}</em></span></label>
		</div></div>`;
	const fromLadder = `<div class="from-ladder"><span>${T('From the step above')}</span><b>${esc(goalLine(o))}</b><button class="linky" data-act="barter-sec" data-id="ladder">${T('change it there')} ›</button></div>`;
	// Where the ship leaves from is not a way of sailing, it is a fact
	// about the sailor -- where their storage is -- and no card can know
	// it, so it is the one thing asked beside the cards.
	return `${cards}
		<div class="order-rows plain">${orderRow('barter-port', T('Your home port'), port, [[0, T('the first stop')], ...ports.map(p => [p.id, gameName(p.name)])], T('Where the run leaves from and comes back to, and whose storage it loads from'))}</div>
		${advOpen ? `<div class="order-rows">${rows}</div>${savedHTML()}` : ''}
		${stocking || coining ? '' : fromLadder}
		<div class="plan-next"><span class="panel-sub">${esc(howLine(o))}</span><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="chains">${T('OK, pick the chains')} ›</button></div>`;
}

/** One part of the plan: a numbered head that says what is set inside,
 *  and the body when it is the part that is open. */
const secOpen = id => planSec === 'all' || planSec === id;
function planSection(n, id, title, summary, body) {
	const open = secOpen(id);
	return `<section class="panel plan-sec${open ? ' open' : ''}" data-sec="${id}">
		<button class="plan-sec-head" data-act="barter-sec" data-id="${id}" aria-expanded="${open}"><i>${n}</i><b>${title}</b><span>${summary}</span><em aria-hidden="true">${open ? '▴' : '▾'}</em></button>
		${open ? `<div class="plan-sec-body">${body}</div>` : ''}
	</section>`;
}

/** A chain the Market stops before its first trade: the cut that says
 *  so, or null. One it only thins -- enough listed for some attempts --
 *  is not cut at all and is no concern of this. */
const marketDead = solo => (solo && (solo.cut || []).find(x => x.why === 'market' && !x.done)) || null;

/** One chain of the board, to tick: where it starts, how far it
 *  reaches, the islands, the goods, and what one pass of it pays. */
function chainRow(c, on, solo, dockName, from, ladder = null, shut = null) {
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

/* ------------------------------------------------------------------ *
 * the search, off the main thread
 * ------------------------------------------------------------------ */

// How long a search may take before it answers with the best so far.
const SEARCH_BUDGET_MS = 1500;
// How long past that to wait before the worker is given up on.
const SEARCH_PATIENCE_MS = 10000;

let worker = null;        // the one long-lived worker, made on first use
let workerLost = false;   // no Worker here, or it failed: search on this thread
let reqSeq = 0;
let pending = null;       // the request out: { id, tag, args, then, timer }

function workerOf() {
	if (worker || workerLost) return worker;
	const Ctor = globalThis.Worker;
	if (typeof Ctor !== 'function') { workerLost = true; return null; }
	try {
		worker = new Ctor(new URL('./barter-worker.js', import.meta.url), { type: 'module' });
	} catch { workerLost = true; return null; }
	worker.onmessage = evt => {
		const { id, result, error } = evt.data || {};
		// An answer to a request since superseded is a straggler.
		if (!pending || pending.id !== id) return;
		const req = pending;
		settle();
		if (error) answerHere(req); else req.then(result);
	};
	worker.onerror = () => {
		// The module failed to load or threw outside a request: this
		// thread takes over for the session.
		const req = pending;
		dropWorker();
		workerLost = true;
		if (req) answerHere(req);
	};
	return worker;
}

function settle() {
	if (pending && pending.timer) clearTimeout(pending.timer);
	pending = null;
}

function dropWorker() {
	if (worker) worker.terminate();
	worker = null;
	settle();
}

/** A request answered on this thread after all. */
function answerHere(req) {
	req.then(propose(req.args));
}

/**
 * propose() asked of the worker. Returns the result at once when the
 * search has to run on this thread -- no Worker, or one that failed --
 * else null, with `then(result)` called when the answer comes. One
 * request is out at a time: a new one supersedes the last, whose
 * worker is stopped rather than left to finish stale work ahead of
 * the fresh question, and whose `then` is never called. `tag` names
 * what the request is for, so a render can tell whether the answer
 * it is waiting for is still on its way.
 */
function proposeAsync(args, tag, then) {
	if (pending) dropWorker();
	const w = workerOf();
	if (!w) return propose(args);
	const id = ++reqSeq;
	const timer = setTimeout(() => {
		// Nothing back long past the budget: the worker is stuck. This
		// thread answers, and the next ask gets a fresh worker.
		const req = pending;
		dropWorker();
		if (req) answerHere(req);
	}, SEARCH_BUDGET_MS + SEARCH_PATIENCE_MS);
	pending = { id, tag, args, then, timer };
	try {
		w.postMessage({ id, ...args, budgetMs: SEARCH_BUDGET_MS });
	} catch {
		// Something in the arguments would not clone: this thread instead.
		settle();
		return propose(args);
	}
	return null;
}

const searching = tag => !!pending && pending.tag === tag;

/** The tab redrawn from outside a click -- when the worker answers:
 *  its own hidden button, pressed, goes through the page's one click
 *  handler, which redraws after the tab's actions. Nothing happens
 *  when the tab is not on the page; the answer waits in `proposed`. */
function redrawSoon() {
	const btn = document.querySelector('[data-act="barter-redraw"]');
	if (btn) btn.click();
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
	const key = JSON.stringify([board.day, b.standing.map(c => c.id), stock, dock, o, port, stash, made, me.hold, ship, Object.keys(marketSilver()).length, prof.barterCount]);
	if (expected.key === key) return expected.value;
	const parley = parleyOf(prof);
	let sum = 0, weight = 0, min = Infinity, max = -Infinity, best = null;
	for (const combo of b.standing) {
		// Each layout still standing is folded with its own gates: which
		// exchanges a count has not opened depends on the layout, since
		// a layout is one row of every island's pool.
		const data = boardData(combo, barterData, npcById, board.answers, [...gatedOffers(combo, prof.barterCount), ...shutNow(prof)]);
		const all = chains(data, stock, dock, prof.barterCount).filter(c => (o.buy || c.from !== 'land') && !c.gate);
		const prices = landPrices(all.filter(c => c.from === 'land').map(c => c.item), made);
		const opts = { stock, dock, hold: me.hold, parley, npcById, start: from, stashes, prefer: stashAt(), pace: o.pace, orders: o, prices };
		const { best: top } = propose({ chains: all, opts, ship, timeCap: o.hours, width: 1, depth: 6 });
		const v = top ? top.value : 0;
		const w = Math.max(1, combo.seen || 1);
		sum += v * w;
		weight += w;
		if (v < min) min = v;
		if (v > max) { max = v; best = top ? { id: combo.id, what: `${top.ids.length === 1 ? T('{n} chain, {silver}', { n: top.ids.length, silver: FC(Math.round(top.value)) }) : T('{n} chains, {silver}', { n: top.ids.length, silver: FC(Math.round(top.value)) })}${top.hours ? ` ${T('in ≈ {time}', { time: fmtRange(top.hours * 3600 * 0.9, top.hours * 3600 * 1.1) })}` : ''}` } : null; }
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
function takenNote(good) {
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
function todayHTML() {
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
function weekHTML() {
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

/* ------------------------------------------------------------------ *
 * sailing the run: the checklist, and the trip recorded
 * ------------------------------------------------------------------ */

/** The key a checklist belongs to: the goal and what it lays out. */
// The checklist belongs to one run: the goal, the board, the chains
// ticked and the harbour. Two chain ids side by side already run past
// the length the profile keeps a string at, so the key is a short
// digest of them -- it is only ever compared, never read.
const sailKey = () => digest(goal === 'material' ? `material|${itemNow()}|${qty}|${port}` : `${goal}|${routes.key}|${routes.ids.slice().sort().join('.')}|${port}`);
function digest(str) {
	// FNV-1a, 32 bits: the same short key for the same run, always.
	let h = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	return `${str.slice(0, str.indexOf('|'))}:${h.toString(16)}`;
}
/** The checklist for the run on screen, or null when not sailing it. */
const sailing = () => (sail && sail.key === sailKey() ? sail : null);
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
const stopKey = (s, k, stops) => (s.npcId
	? `n${s.npcId}`
	: s.quest
		? `q${s.place.name}@${stops.slice(0, k).filter(x => x.quest && x.place && x.place.name === s.place.name).length}`
		: `w${s.wharf.name}@${stops.slice(0, k).filter(x => x.wharf && x.wharf.name === s.wharf.name).length}`);

/** What a stop was called before the key above was stable. A checklist
 *  saved mid-run keeps its old ticks, so they are still answered to --
 *  read only, and never written again. */
const stopKeyWas = (s, k, stops) => (s.npcId
	? `n${s.npcId}`
	: s.quest
		? `q${s.place.name}@${stops.slice(0, k).filter(x => x.npcId).length}`
		: `w${s.wharf.name}@${stops.slice(0, k).filter(x => x.npcId).length}`);

/** Whether a list of ticks holds this stop, under either name. */
const ticked = (list, s, k, stops) => {
	const l = list || [];
	return l.includes(stopKey(s, k, stops)) || l.includes(stopKeyWas(s, k, stops));
};

/**
 * What the Map's stop card asks: is this island on the checklist being
 * sailed, is it done, what did it pay, what could it. Null when no run
 * is being sailed or the island is not on it.
 */
export function sailFor(npcId) {
	restore();
	if (!sail || !Array.isArray(sail.stops)) return null;
	const s = sail.stops.find(x => x.npcId === npcId);
	if (!s) return null;
	return { done: sail.done.includes(`n${npcId}`), paid: sail.seen[npcId] || null, ask: paidAsk(s, sail.seen[npcId], true), item: s.item, recvText: s.recvText };
}

/**
 * The bar under a run: "Sail it" when the run is only laid out; the
 * count of stops done and the two ways off the water when it is being
 * sailed -- the trip recorded, or the checklist dropped.
 */
/** What the chime calls a run: where it starts and how far it goes. */
function runLabel(plan) {
	const isles = plan.stops.filter(s => s.npcId).map(s => isleShort(npcById.get(s.npcId)) || s.npc);
	if (!isles.length) return T('the run');
	return isles.length === 1 ? isles[0] : T('{isle} and {n} more', { isle: isles[0], n: isles.length - 1 });
}

/** What one stop is called, for a chime that names it. */
const stopLabel = s => (s.npcId ? isleShort(npcById.get(s.npcId)) || s.npc : s.wharf ? gameName(s.wharf.at) : s.place ? gameName(s.place.name) : T('a stop'));

/**
 * The stops of a run as the clock keeps them: each at its own second
 * from casting off, the last of them the end of the run.
 *
 * The legs are already bent round the coast and already have a time on
 * them; this only adds them up. Where the run has no harbour to sail
 * from, the first stop is where the ship already is and carries no leg
 * -- it is not something to wait for, so it is not a mark.
 */
function runMarks(plan, legs) {
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
		const hold = (s.npcId ? pause.isle : pause.call) || 0;
		// A stop with no leg is one the ship is already at -- a second
		// exchange at the same island. There is nothing to wait for, so
		// no mark; the time it takes is real all the same.
		if (leg > 0) {
			at += legs.secondsOf(leg);
			out.push({ at: Math.round(at), label: stopLabel(s), hold });
		}
		at += hold;
	});
	return out;
}

function sailBar(plan) {
	if (!plan || !plan.stops.length) return '';
	const on = sailing();
	// The clock for the time the ship is out, set to this run's own
	// estimate: the page cannot see the ship, so the one thing it can do
	// is say when the time is up.
	const legs = legsOf(plan.stops);
	const clock = timerHTML({ suggest: legs.mid || 0, label: runLabel(plan), marks: runMarks(plan, legs) });
	if (!on) return `<div class="sail-bar"><button class="act" data-act="barter-sail" title="${T('Tick the stops off as you go; at the end the whole trip goes into the Inventory as one change')}">⛵ ${T('Sail this run')}</button><span class="faint">${T('tick each stop off as you sail; what an island paid re-counts the rest; Record at the end puts the whole trip in the Inventory in one Undo')}</span><span class="panel-spacer"></span>${clock}</div>`;
	const n = plan.stops.filter((s, k) => ticked(on.done, s, k, plan.stops)).length;
	const questsLeft = [...(plan.questsHome || []), ...plan.stops.flatMap(s => s.quests || [])].map(x => x.q).filter(q => !questDone(q)).length;
	// The whole run done at once: which of it, asked in place.
	// What the recorder will have to guess at: an island that pays a
	// range and was never asked what it paid. Said here rather than
	// left to be found out later, because the guess goes into the
	// Inventory and a sailor who knows the number can still give it --
	// the chips are on the stops, a press each.
	const guessed = unsaid(sailedPlan() || plan, on).length;
	const guessNote = guessed
		? `<span class="sail-guess" title="${T('Press the count an island paid on its stop, and the trip is recorded at that instead')}">${guessed === 1
			? T('{n} island’s pay not said', { n: guessed })
			: T('{n} islands’ pay not said', { n: guessed })} — ${T('recorded at the middle of the range')}</span>`
		: '';
	const all = sailAll.open ? `<div class="sail-all">
		<span class="sail-all-k">${T('Tick off, all at once')}</span>
		<label class="inline-check"><input type="checkbox" data-act="barter-sail-all-pick" data-id="stops"${sailAll.stops ? ' checked' : ''}> ${T('every stop, {n} still to go', { n: plan.stops.length - n })}</label>
		<label class="inline-check"><input type="checkbox" data-act="barter-sail-all-pick" data-id="quests"${sailAll.quests ? ' checked' : ''}${questsLeft ? '' : ' disabled'}> ${T('the quests handed in, {n} still open', { n: questsLeft })}</label>
		<span class="panel-spacer"></span>
		<button class="ghost-btn sm" data-act="barter-sail-all-drop">${T('Cancel')}</button>
		<button class="act" data-act="barter-sail-all-go" title="${T('Every stop ticked, every quest handed in and its reward recorded, in one go')}">${T('Tick them all')}</button>
	</div>` : '';
	return `<div class="sail-bar sailing">
		<span class="sail-n">${T('<b>{n}</b> of {of} stops done', { n, of: plan.stops.length })}${questsLeft ? ` · ${questsLeft === 1 ? T('{n} quest open', { n: questsLeft }) : T('{n} quests open', { n: questsLeft })}` : ''}</span>
		${guessNote}
		${clock}
		<span class="panel-spacer"></span>
		<button class="ghost-btn sm" data-act="barter-sail-drop" title="${T('Drop the checklist; nothing is recorded')}">${T('Abandon')}</button>
		${sailAll.open ? '' : `<button class="ghost-btn sm" data-act="barter-sail-all" title="${T('Tick every stop and every quest off at once')}">${T('All done…')}</button>`}
		<button class="act" data-act="barter-record" ${n ? '' : 'disabled'} title="${T('The stops done go into the Inventory as one change')}">${T('Record the trip')}</button>
		${all}
	</div>`;
}

/**
 * What this run's islands were seen to pay, as the plan counts it.
 *
 * A coin figure is typed off the game's window, which shows it with the
 * sailor's barter bonus on; the plan counts coins bare and puts the
 * bonus on at the end. Fed back as typed, the bonus went on twice. So a
 * coin island's figure has it taken off again here, and everything else
 * passes through.
 */
function bareCoins(n) {
	const { pct } = countBonus(barterProfile().barterCount);
	return Math.max(1, Math.round(n / (1 + pct / 100)));
}
function planSeen(on) {
	if (!on || !on.seen) return {};
	const coinIsles = new Set((on.stops || []).filter(x => x.item === COIN).map(x => String(x.npcId)));
	return Object.fromEntries(Object.entries(on.seen).map(([id, n]) => [id, coinIsles.has(String(id)) ? bareCoins(n) : n]));
}

/** The most counts an island may pay before chips stop being an answer. */
const PAID_CHIPS = 6;

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
	if (!s || !s.npcId || !(s.recvMax > s.recvMin)) return '';
	const lo = Math.ceil(s.recvMin), hi = Math.floor(s.recvMax);
	const flag = map ? ' data-map="1"' : '';
	if (hi - lo + 1 > PAID_CHIPS) {
		return `<span class="run-paid"><span>${T('paid')}</span><input class="purse-inline narrow run-paid-n" inputmode="numeric" data-act="barter-paid-n"${flag} data-npc="${s.npcId}" value="${said > 0 ? said : ''}" placeholder="${lo}–${hi}" aria-label="${T('What the island paid, as the game’s window showed it')}" title="${T('What the island paid, as the game’s window showed it')}"></span>`;
	}
	const opts = [];
	for (let n = lo; n <= hi; n++) opts.push(n);
	return `<span class="run-paid"><span>${T('paid')}</span>${opts.map(n => `<button class="chip pay${said === n ? ' active' : ''}" data-act="barter-paid"${flag} data-npc="${s.npcId}" data-n="${n}">${n}</button>`).join('')}</span>`;
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

/** The stops done whose island pays a range and was never asked about:
 *  what the recording has to guess at, so it can say so. */
function unsaid(plan, on) {
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
function tripOf(plan, on, from) {
	const delta = {}, moves = [];
	const add = (item, n) => { if (Math.round(n)) delta[item] = (delta[item] || 0) + Math.round(n); };
	// An island that paid another of its four [Level 7]s than the plan
	// named: the good sold or carried is the one it paid.
	const renamed = new Map();
	for (const s of plan.stops) if (s.npcId && (on.got || {})[s.npcId]) renamed.set(s.item, on.got[s.npcId]);
	const as = name => renamed.get(name) || name;
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
		if (!ticked(on.done, s, k, plan.stops) || s.quest) continue;
		if (s.wharf) {
			// The sale, unless the sailor said the goods were kept: then
			// they stay in the delta, and go into the Inventory.
			if (!ticked(on.kept, s, k, plan.stops)) for (const x of (s.sale && s.sale.items) || []) { add(as(x.item), -x.n); silver += x.total; }
			for (const d of s.dropped || []) moves.push({ item: as(d.item), from: '', to: s.wharf.at, n: Math.round(d.n) });
			for (const l of s.loads || []) moves.push({ item: l.item, from: s.wharf.at, to: '', n: Math.round(l.n) });
			continue;
		}
		const paid = paidAt(s, on);
		// Coins come with the sailor's barter-count bonus -- a fifth more
		// past two thousand barters. The plan has always promised them
		// with it and the recording wrote them without, so every coin
		// day came up short by exactly the bonus. A figure the sailor
		// typed is the window's own and has it on already.
		if (s.item === COIN && !((on.seen || {})[s.npcId] > 0)) {
			add(COIN, withBonus(s.times * paid, countBonus(barterProfile().barterCount).pct));
			handOver(s.give, s.times * s.giveN);
			trades += s.times;
			continue;
		}
		handOver(s.give, s.times * s.giveN);
		add(as(s.item), s.times * paid);
		trades += s.times;
	}
	if (on.done.length && from) for (const l of plan.loaded || []) moves.push({ item: l.item, from: from.name, to: '', n: Math.round(l.n) });
	if (silver - spent) add(SILVER, silver - Math.round(spent));
	return { delta, moves, silver, trades, spent: Math.round(spent) };
}

/**
 * A stop ticked done. At a stop with quests handed in they are claimed
 * and the rewards recorded -- but one whose pick-one reward is not
 * remembered keeps its button, to be asked.
 */
function markDone(on, k) {
	on.done = [...on.done, k];
	persist();
	cheer();
	const plan = shownPlan || planOfSail(on);
	if (!plan) return;
	const at = plan.stops.findIndex((s, i) => stopKey(s, i, plan.stops) === k || stopKeyWas(s, i, plan.stops) === k);
	// The clock is told where the ship really is: the legs still ahead
	// are counted from now rather than from an estimate made before the
	// ship left, so a run that ran late does not chime early all the way
	// to the end.
	if (at >= 0) passedStop(at);
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
function sailRecord(plan) {
	const num = v => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : 0);
	const questsOf = s => (s.quests || []).map(x => ({ id: x.q.id, what: x.step.what, who: x.step.who || '' }));
	const stops = plan.stops.map(x => (x.npcId
		? { npcId: x.npcId, npc: x.npc, give: x.give, giveText: x.giveText, giveN: num(x.giveN), item: x.item, recv: num(x.recv), recvMin: num(x.recvMin), recvMax: num(x.recvMax), recvText: x.recvText, times: num(x.times), parley: num(x.parley), weightAfter: num(x.weightAfter), level: num(x.level), chain: num(x.chain), quests: questsOf(x) }
		: x.quest ? { quest: true, hunt: x.hunt ? String(x.hunt) : null, place: { name: x.place.name, who: x.place.who || '', x: num(x.place.x), y: num(x.place.y) }, weightAfter: num(x.weightAfter), chain: num(x.chain), quests: questsOf(x) }
			: { wharf: { name: x.wharf.name, at: x.wharf.at, x: num(x.wharf.x), y: num(x.wharf.y) }, dropped: (x.dropped || []).map(d => ({ item: d.item, n: num(d.n) })), loads: (x.loads || []).map(l => ({ item: l.item, n: num(l.n) })), sale: x.sale ? { n: num(x.sale.n), total: num(x.sale.total), levels: (x.sale.levels || []).map(num), items: (x.sale.items || []).map(i => ({ item: i.item, n: num(i.n), total: num(i.total) })) } : null, weightAfter: num(x.weightAfter), chain: num(x.chain), quests: questsOf(x) }));
	const legs = legsOf(plan.stops);
	return {
		stops,
		loaded: (plan.loaded || []).map(l => ({ item: l.item, n: num(l.n) })),
		bought: (plan.bought || []).filter(b => b.n > 0).slice(0, 40).map(b => ({ item: b.item, n: num(b.n), each: num(b.each || (b.total && b.n ? b.total / b.n : 0)) })),
		cost: num(plan.cost), silver: num(plan.silver), net: num(plan.net), trades: num(plan.trades), parleyUsed: num(plan.parleyUsed),
		questsHome: (plan.questsHome || []).map(x => ({ id: x.q.id, what: x.step.what, who: x.step.who || '' })),
		chains: (plan.order || []).map(c => ({ name: isleShort(npcById.get(c.rungs[0].npcId)) || c.rungs[0].npc, top: c.top })),
		goal, item: goal === 'material' ? itemNow() || '' : '',
		time: legs.time || '', port
	};
}

/** The quests a kept stop names, with the quest itself put back. */
function hydrate(list) {
	return (list || []).map(x => { const q = quests.find(y => y.id === x.id); return q ? { q, step: { what: x.what, who: x.who } } : null; }).filter(Boolean);
}

/** The run being sailed, as a plan the recorder and the sheet can read. */
function planOfSail(on) {
	if (!on || !Array.isArray(on.stops) || !on.stops.length || !on.stops.some(s => s.npcId && s.give)) return null;
	const stops = on.stops.map(s => ({ ...s, quests: hydrate(s.quests) }));
	return { stops, loaded: on.loaded || [], bought: on.bought || [], cost: on.cost || 0, parleyUsed: on.parleyUsed || 0, questsHome: hydrate(on.questsHome), silver: on.silver || 0, net: on.net || 0, trades: on.trades || 0 };
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
const stranded = () => (sail && Array.isArray(sail.done) && sail.done.length && planOfSail(sail)
	&& (!sailing() || !shownPlan || !shownPlan.stops || !shownPlan.stops.length) ? sail : null);

function strandedHTML() {
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
function sailedPlan() {
	const on = sailing();
	return (on && planOfSail(on)) || shownPlan;
}

/** The route the run being sailed draws on the chart, or null --
 *  built from the kept stops each time, since the fragment is longer
 *  than the profile keeps a string. */
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
	if (!plan) return null;
	const isles = plan.stops.filter(s => s.npcId).map(s => s.npcId);
	const same = chartIds.length === isles.length && chartIds.every((id, i) => id === isles[i]);
	const legs = legsOf(plan.stops);
	const book = ledgerOf(plan.stops, legs);
	const notes = { at: k => (plan.stops[k] && plan.stops[k].quests) || [], trades: plan.trades || 0, count: plan.stops.reduce((a, s) => a + (s.quests || []).length, 0), home: plan.questsHome };
	const n = plan.stops.filter((s, k) => ticked(on.done, s, k, plan.stops)).length;
	const chainTags = (on.chains || []).map(c => `<span class="run-chain-tag" style="--tier:${TIER(c.top)}"><i></i>${esc(c.name)}<em>L${c.top}</em></span>`).join('');
	const head = `<div class="map-run-head">
		<div class="map-run-title"><b>${on.goal === 'material' ? T('For {name}', { name: on.item ? esc(gameName(on.item)) : T('a material') }) : T('The run')}</b><span>${plan.stops.length === 1 ? T('{n} stop', { n: plan.stops.length }) : T('{n} stops', { n: plan.stops.length })}${on.net ? ` · ${FC(Math.round(on.net))}${on.cost ? ` ${T('net')}` : ''}` : ''}${on.time ? ` · ≈ ${esc(on.time)}` : ''}${book.short ? ` · <b class="warn">${T('{n} Parley short', { n: F(book.short) })}</b>` : ''}</span></div>
		${chainTags ? `<div class="run-seg-chains">${chainTags}</div>` : ''}
		${on.loaded && on.loaded.length ? `<details class="map-run-fold"><summary>${T('Loaded before casting off')} · ${on.loaded.length}</summary>${on.loaded.map(l => `<div class="run-leave-good">${img(l.item, 'row-icon sm')}<b>${F(l.n)}×</b>${esc(gameName(l.item))}</div>`).join('')}</details>` : ''}
	</div>`;
	const rows = stopRows(plan.stops, legs, { board: true, sailing: on, notes, ledger: book, map: same });
	return `${head}${sailBar(plan)}<div class="run-stops map-run-stops">${rows}</div><p class="map-hint map-run-hint">${T('{n} of {of} done', { n, of: plan.stops.length })} · ${same ? T('press a stop’s name to fly there and step the chart to it') : T('press a stop’s name to fly there')} · ${T('the Barter tab holds the plan behind this run')}</p>`;
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

function recordTrip(plan, from, on = sailing()) {
	if (!on || !plan) return;
	const trip = tripOf(plan, on, from);
	// What the run took and what it brought back, from the one honest
	// record of it: the change it made to the Inventory. Spent goods are
	// what had to be loaded, gained goods are what is in the storage
	// now. Kept so the day's boards can be read back one under the
	// other -- what went into the first, what came out of it, and so on.
	const moved = (sign, drop) => Object.fromEntries(Object.entries(trip.delta)
		.filter(([item, n]) => item !== drop && Math.sign(n) === sign && Math.abs(n) >= 1)
		.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
		.slice(0, 20)
		.map(([item, n]) => [item, Math.abs(Math.round(n))]));
	const runs = [...(store.getProfile('runs', []) || []), {
		day: barterKey(), silver: trip.silver, cost: trip.spent || Math.round(plan.cost || 0), trades: trip.trades, parley: Math.round(plan.parleyUsed || 0),
		stops: on.done.length, goal: on.goal || goal, item: on.goal ? on.item || '' : goal === 'material' ? itemNow() || '' : '',
		load: moved(-1, SILVER), got: moved(1, SILVER), layout: (boardNow().combo || {}).id || ''
	}].slice(-60);
	// What the islands were seen to pay goes into the record, so the
	// counting can follow the sailor's own runs.
	const ratios = { ...(store.getProfile('ratios', {}) || {}) };
	const sevens = { ...(store.getProfile('sevens', {}) || {}) };
	for (const [k, s] of plan.stops.entries()) {
		if (!ticked(on.done, s, k, plan.stops) || !s.npcId) continue;
		const n = on.seen[s.npcId] && s.item === COIN ? bareCoins(on.seen[s.npcId]) : on.seen[s.npcId];
		if (n && s.recvMin !== s.recvMax) {
			const key = ratioKey(s);
			ratios[key] = { ...(ratios[key] || {}), [n]: ((ratios[key] || {})[n] || 0) + s.times };
		}
		const got = (on.got || {})[s.npcId];
		if (got) sevens[s.npcId] = { item: got, day: barterKey() };
	}
	// The barter quests count the trip's trades; one made up is done,
	// its reward in the bags, and the count carries over to the next run
	// until the period turns.
	const progress = { ...(store.getProfile('questProgress', {}) || {}) };
	const questsDone = { ...(store.getProfile('questsDone', {}) || {}) };
	const made = [];
	if (trip.trades > 0) {
		for (const q of quests) {
			if (!q.barters || questDone(q, questsDone)) continue;
			const key = periodKey(cadenceOf(q));
			const n = (progress[q.id] && progress[q.id].key === key ? progress[q.id].n : 0) + trip.trades;
			if (n >= q.barters && rewardOf(q)) {
				questsDone[q.id] = key;
				delete progress[q.id];
				for (const [item, d] of Object.entries(rewardOf(q))) trip.delta[item] = (trip.delta[item] || 0) + d;
				made.push(q);
			} else progress[q.id] = { key, n };
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
	const prof = barterProfile();
	const perTrade = parleyOf(prof).perTrade;
	const parleySpent = Math.round(plan.stops.reduce((a, s, k) => a + (s.npcId && ticked(on.done, s, k, plan.stops) ? (Number(s.parley) > 0 ? Number(s.parley) : (Number(s.times) || 0) * perTrade) : 0), 0));
	const bar = prof.parleyHeld > 0 ? Math.min(PARLEY.max, prof.parleyHeld) : PARLEY.max;
	const drawn = parleySpent > bar && ordersNow().vouchers !== 'keep' ? Math.min(prof.vouchers, Math.ceil((parleySpent - bar) / PARLEY.voucher)) : 0;
	// Never nought: nought is how "nobody has said" is written.
	const parleyLeft = Math.max(1, Math.min(PARLEY.max, bar + drawn * PARLEY.voucher - parleySpent));
	const spentOf = parleySpent > 0 ? { parleyHeld: parleyLeft, parleyDay: barterKey(), ...(drawn ? { vouchers: prof.vouchers - drawn } : {}) } : {};
	store.applyTrip({ delta: trip.delta, moves: trip.moves, profile: { runs, ratios, sevens, tally, ...counted, ...spentOf, questProgress: Object.keys(progress).length ? progress : null, questsDone: Object.keys(questsDone).length ? questsDone : null }, label: `${on.done.length === 1 ? T('Sailed a run: {n} stop', { n: on.done.length }) : T('Sailed a run: {n} stops', { n: on.done.length })}${trip.silver ? `, ${T('{silver} sold', { silver: FC(trip.silver) })}` : ''}` });
	sail = null;
	// What it came to, for the results step to show until the next run is
	// cast off: the page would otherwise fall back to the plan the moment
	// the checklist went, with nothing said about where the silver went.
	lastTrip = { stops: on.done.length, trades: Math.round(trip.trades), silver: trip.silver, spent: trip.spent || 0, net: trip.silver - (trip.spent || 0), coins: Math.round(trip.delta[COIN] || 0), parley: parleySpent };
	step = 'results';
	cursor = null;
	skipped = new Set();
	packed = new Set();
	// The trip is in the book, so the clock that timed it is done.
	stopTimer();
	persist();
	// One toast, since a second would only paint over the first and take
	// its Undo with it -- and a route opening is news that belongs beside
	// what opened it.
	const opened = counted.barterCount ? justOpened(counted.barterCount - Math.round(trip.trades), counted.barterCount) : null;
	toast(`${on.done.length === 1 ? T('Recorded: {n} stop', { n: on.done.length }) : T('Recorded: {n} stops', { n: on.done.length })}${trip.silver ? ` · ${T('{silver} in silver', { silver: FC(trip.silver) })}` : ''}${trip.trades ? ` · ${trip.trades === 1 ? T('{n} barter, {all} in all', { n: F(Math.round(trip.trades)), all: F(counted.barterCount) }) : T('{n} barters, {all} in all', { n: F(Math.round(trip.trades)), all: F(counted.barterCount) })}` : ''}${made.length ? ` · ${T('{quests} made up', { quests: made.map(questTitle).join(', ') })}` : ''}${opened ? ` — ${T('{what} is open now', { what: opened })}` : ''}`, true);
}

/**
 * What to load before casting off, and what is in the storage after:
 * the run as two shelves, with an arrow between them.
 *
 * Everything here is already in the sheet further down, item by item
 * with its price and its buttons. This is the other thing a sailor
 * wants from a plan and could not get: the two ends of it, side by
 * side, in the shape the game's own storage window has -- one tile a
 * kind, the count on it -- so it can be read against the screen while
 * loading, or sent to a guildmate as one picture.
 */
/**
 * One entry a good, the counts added up: what a run buys or fetches for
 * two chains is bought or fetched once, in one trip to the counter.
 *
 * What the row says and what its button does are the same number. They
 * were not: merging two lines of two added the counts for the reader
 * and left the button on the first line's two, so the list asked for
 * four and moved half of them -- the very thing a sailor wrote in
 * about, in a corner of the app nobody had looked at for it.
 */
function oneEach(list) {
	const by = new Map();
	for (const x of list) {
		const had = by.get(x.item);
		if (had) had.n += x.n; else by.set(x.item, { ...x });
	}
	for (const x of by.values()) if (x.load) x.load = { ...x.load, n: x.n };
	return [...by.values()];
}

/**
 * Whether a thing on the packing list is marked as aboard.
 *
 * What the hold already holds starts ticked -- there is nothing to
 * fetch -- and everything else starts clear. Either way the sailor's
 * own press is what decides: `packed` carries the marks they have
 * made, and for a row that starts ticked a mark means "take it off".
 */
const packedNow = x => (String(x.key || '').startsWith('a|') ? !packed.has(x.key) : packed.has(x.key));

/** What the packing list holds, in its three piles: to buy at the
 *  Market, to take out of a storage or off the pile of shore goods, and
 *  what the run starts from that is aboard already. */
function packingOf(plan, from, chosen = []) {
	const perTrade = item => {
		const st = (plan.stops || []).find(x => x.npcId && x.give === item);
		if (!st) return '';
		const times = st.times === 1 ? T('{n} trade', { n: F(st.times) }) : T('{n} trades', { n: F(st.times) });
		return st.giveN > 1 ? `${T('{n} a trade', { n: F(st.giveN) })} · ${times}` : times;
	};
	const market = (plan.bought || []).filter(b => b.n > 0).map(b => ({
		item: b.item, n: Math.ceil(b.n), per: perTrade(b.item), key: `b|${b.item}`,
		where: b.how === 'made' ? T('your workers make it') : b.each ? T('bought · {silver}', { silver: FC(b.total) }) : marketStatus().count ? T('no Market price for it') : T('unpriced until the Market answers'),
		act: `${copyName(b.item)}<button class="chip tiny${b.how === 'made' ? ' active' : ''}" data-act="barter-homemade" data-item="${esc(b.item)}" title="${b.how === 'made' ? T('Bought after all: price it from the Market') : T('Your workers make this: it costs the run nothing')}">${b.how === 'made' ? `✓ ${T('mine')}` : T('my workers')}</button>`
	}));
	const storage = [
		...(plan.loaded || []).filter(l => l.n > 0).map(l => ({ item: l.item, n: l.n, per: perTrade(l.item), where: from ? T('from {town}', { town: gameName(from.name) }) : T('from the storage'), load: from ? { town: from.name, n: l.n } : null, key: `l|${l.item}` })),
		...(plan.taken || []).filter(t => t.n > 0).map(t => ({ item: t.item, n: Math.ceil(t.n), per: perTrade(t.item), where: T('from your pile · {n} left', { n: F(t.left) }), key: `t|${t.item}` }))
	];
	// What the run starts from that is in the hold already. It is there
	// to be seen and counted against the game's own window, and where
	// there is a harbour to put it back at, to be put back: a sailor who
	// loaded the wrong thing should not have to go looking for the hold
	// to undo it.
	const at = from ? from.name : unloadTo();
	// One line a good, and the count is the hold's own. Two chains can
	// start from the same pile -- a [Level 3] that climbs two ways --
	// and the list drew it twice, with one tick box between them:
	// ticking either turned both, which is the plainest way there is of
	// looking broken. Adding the two up was no better, since the six
	// goods the two chains share are six goods, not twelve.
	const hold = aboardStock();
	const aboardItems = [...new Set(chosen.filter(c => c.from !== 'land' && c.have > 0).map(c => c.item))];
	const aboard = aboardItems.map(item => ({
		item, n: hold[item] || 0, per: perTrade(item), where: T('in the hold now'), key: `a|${item}`,
		act: at ? `<button class="chip tiny" data-act="barter-unload" data-item="${esc(item)}" title="${T('Put them back in the storage at {town}', { town: esc(gameName(at)) })}">${T('put it back')}</button>` : ''
	})).filter(x => x.n > 0);
	return { market: oneEach(market), storage: oneEach(storage), aboard };
}

/**
 * The packing list as a tally: how many things it names, and how many
 * are aboard already. What the run starts from is aboard by definition;
 * a good taken out of a storage leaves the list the moment it is
 * loaded, since the plan is laid again from the Inventory; the rest is
 * ticked by hand and remembered for as long as the page is open.
 */
/** What the ticks on the packing list change about the hold's weight:
 *  goods ticked as fetched that the app still counts ashore weigh in,
 *  goods aboard with their tick taken off come out. */
function packingLT(plan, from, chosen) {
	const p = packingOf(plan, from, chosen);
	return p.storage.filter(x => packedNow(x)).reduce((a, x) => a + x.n * weightOf(x.item), 0)
		- p.aboard.filter(x => !packedNow(x)).reduce((a, x) => a + x.n * weightOf(x.item), 0);
}

function packingCount(plan, from, chosen) {
	const p = packingOf(plan, from, chosen);
	const list = [...p.market, ...p.storage, ...p.aboard];
	// What is already in the hold needs no fetching, so it counts as
	// done unless the sailor has taken the tick off to check it again.
	return { all: list.length, done: list.filter(x => packedNow(x)).length };
}

/**
 * The packing list: a sailor standing at the wharf with the game open
 * beside the app, fetching one thing at a time. Three piles by where
 * the thing comes from, a box to tick on each, the count large enough
 * to read at a glance and the name there to copy into the Market.
 */
function packingHTML(plan, from, chosen = []) {
	if (!plan || !plan.stops || !plan.stops.length) return '';
	const p = packingOf(plan, from, chosen);
	const row = x => {
		const on = packedNow(x);
		const lv = levelOf(x.item);
		// One box a row, and it always turns both ways. It is the
		// sailor's own mark -- "I have this" -- and nothing else: moving
		// goods between a storage and the hold is what the chip beside it
		// does, and a box that sometimes moved things and sometimes did
		// not was a box nobody could trust.
		const box = `<button class="pack-box${on ? ' on' : ''}" data-act="barter-pack" data-k="${esc(x.key)}" aria-pressed="${on}" aria-label="${on ? T('Not aboard after all') : T('Mark them aboard')}">${on ? '✓' : ''}</button>`;
		const act = [x.load ? `<button class="chip tiny" data-act="barter-load" data-item="${esc(x.item)}" data-town="${esc(x.load.town)}" data-n="${x.load.n}" title="${T('Take them out of the storage here, in the app as well')}">${T('Loaded')} ✓</button>` : '', x.act || ''].filter(Boolean).join('');
		return `<div class="pack-row${on ? ' on' : ''}">${box}<span class="pack-icon"${lv ? ` style="--tier:${TIER(lv)}"` : ''}>${img(x.item, 'row-icon')}</span><span class="pack-what"><b>${esc(gameName(x.item))}</b><em>${esc(x.where)}</em></span><span class="pack-n"><b>${n1(x.n)}</b><em>${esc(x.per)}</em></span>${act ? `<span class="pack-act">${act}</span>` : ''}</div>`;
	};
	const group = (title, sub, list, none) => `<section class="panel pack-group"><div class="panel-head"><h2 class="panel-title">${title}</h2><span class="panel-sub">${sub}</span></div>${list.length ? list.map(row).join('') : `<p class="empty">${none}</p>`}</section>`;
	const where = from ? gameName(from.name) : '';
	return `<div class="pack-groups">
		${group(T('Buy at the Market'), `${plan.cost ? T('{silver} to buy', { silver: FC(Math.round(plan.cost)) }) : T('before casting off')}${p.market.length ? ` · ${T('shore goods are not weighed against the hold here')}` : ''}`, p.market, T('nothing to buy — the run starts from what is held'))}
		${group(T('Take from storage'), where ? esc(T('{at} wharf', { at: where })) : T('before casting off'), p.storage, T('nothing in storage is needed'))}
		${group(T('Already aboard'), T('checked against the hold'), p.aboard, T('nothing the run starts from is aboard yet'))}
	</div>`;
}

/** What is in hand when the run is over: carried home, left at a wharf
 *  on the way, the silver and the coins. One tile a kind, as the game's
 *  own storage window draws them. */
function afterShelfHTML(plan, from) {
	if (!plan || !plan.kept) return '';
	const tile = (item, n, note = '') => {
		const lv = levelOf(item);
		return `<span class="shelf-tile"${note ? ` title="${esc(gameName(item))} — ${esc(note)}"` : ''}>
			<i class="shelf-lv${lv ? '' : ' shore'}"${lv ? ` style="--tier:${TIER(lv)}"` : ''}>${lv ? `L${lv}` : '⌂'}</i>
			${img(item, 'shelf-icon')}
			<b>${n1(n)}</b>
			<span>${esc(gameName(item))}</span>
			${note ? `<em>${esc(note)}</em>` : ''}
		</span>`;
	};
	const back = new Map();
	const add = (item, n, at, how) => {
		const key = `${item}|${at}|${how}`;
		back.set(key, { item, n: (back.get(key) ? back.get(key).n : 0) + n, at, how });
	};
	for (const g of plan.kept || []) {
		// What is inside the floor is the stock; what is over it is what
		// the next board climbs with. The two are different answers to
		// "what is this for", so the tile says which.
		if (g.stock > 1e-9) add(g.item, g.stock, from ? from.name : '', 'stock');
		if (g.n - g.stock > 1e-9) add(g.item, g.n - g.stock, from ? from.name : '', 'spare');
	}
	for (const g of plan.stashed || []) add(g.item, g.n, g.at || '', 'left');
	const noteOf = x => [x.at ? T('at {where}', { where: gameName(x.at) }) : '', x.how === 'stock' ? T('kept for the stock') : x.how === 'left' ? T('left on the way') : ''].filter(Boolean).join(' · ');
	const backRows = [...back.values()].filter(x => x.n > 0).sort((a, b) => (levelOf(b.item) || 0) - (levelOf(a.item) || 0) || b.n - a.n);
	const kinds = n => (n === 1 ? T('{n} kind', { n }) : T('{n} kinds', { n }));
	const sold = plan.silver > 0 ? `<span class="shelf-tile silver"><b>${FC(Math.round(plan.silver))}</b><span>${T('sold at the wharf')}</span></span>` : '';
	// Coins are not cargo, so they are not a tile like a good is -- but
	// they are the whole of what a coin run brings back, and a shelf
	// that did not show them would be telling half the story.
	const purse = coinsOf(plan);
	const paid = plan.coins > 0 ? `<span class="shelf-tile silver coin">${img(COIN, 'shelf-icon')}<b>${coinRange(purse.min, purse.max)}</b><span>${T('Crow Coins')}</span>${purse.pct ? `<em>${T('+{pct}% for {n} barters', { pct: purse.pct, n: F(purse.count) })}</em>` : ''}</span>` : '';
	if (!backRows.length && !sold && !paid) return '';
	return `<section class="panel run-shelves after"><div class="shelf">
		<div class="shelf-head"><h2 class="panel-title">${T('In the storage after')}</h2><span class="panel-sub">${backRows.length ? `${kinds(backRows.length)} · ${T('{n} goods', { n: F(Math.round(backRows.reduce((a, x) => a + x.n, 0))) })}${plan.silver ? ` · ${T('{silver} sold', { silver: FC(Math.round(plan.silver)) })}` : ''}${plan.coins ? ` · ${T('{n} coins', { n: coinRange(purse.min, purse.max) })}` : ''}` : plan.coins ? T('{n} Crow Coins, and nothing else to carry', { n: coinRange(purse.min, purse.max) }) : plan.silver ? T('all of it sold at the wharf') : T('nothing comes back')}</span></div>
		<div class="shelf-tiles">${paid}${sold}${backRows.map(x => tile(x.item, x.n, noteOf(x))).join('')}</div>
	</div></section>`;
}

/**
 * What a run's coins really come to.
 *
 * Two things sit between the table and the purse. The table states a
 * range -- the exchange window in the game names one number out of it,
 * and which number is the board's business, not ours -- so the run is
 * worth a range and not the bottom of one. And the total barter count
 * adds a percent to it (TRADE_COUNT_BONUS in barter.js, read out of the
 * client), which the app knew nothing about until now: a sailor past
 * 2,500 barters takes a third more than every figure here used to say.
 *
 * `base` is what the islands state, `min`/`max` what lands.
 */
function coinsOf(plan) {
	const { pct, count, next } = countBonus(barterProfile().barterCount);
	return {
		baseMin: Math.round(plan.coins), baseMax: Math.round(plan.coinsMax),
		min: withBonus(plan.coins, pct), max: withBonus(plan.coinsMax, pct),
		pct, count, next,
		any: plan.coins > 0
	};
}

/** A coin figure as the range it is: "234 to 494", or one number when
 *  every exchange on the run states one. */
const coinRange = (a, b, sign = '') => (b > a ? T('{a} to {b}', { a: `${sign}${F(a)}`, b: `${sign}${F(b)}` }) : `${sign}${F(a)}`);

/** Where the bonus came from, for the line under a coin figure. */
function bonusNote(c) {
	if (!c.count) return T('set your Total Barters in the bar to count the barter bonus');
	if (!c.pct) return T('no barter bonus yet · {n} more barters for +{pct}%', { n: F(c.next ? c.next.from - c.count : 0), pct: c.next ? c.next.pct : 0 });
	return T('{range} at the islands · <b>+{pct}%</b> for {n} barters', { range: coinRange(c.baseMin, c.baseMax), pct: c.pct, n: F(c.count) });
}

/**
 * What the coins are for. The app already knows what the builds still
 * want from the Crow Coin Shop -- it is the figure the purse in the
 * masthead carries -- so a run that pays in coins can say what it is
 * worth in the only terms that matter: how much nearer this is to the
 * thing being built, and how many more runs like it that leaves.
 */
function coinPurseHTML(plan) {
	const want = totalsToGo().coins;
	const held = store.getStock(COIN);
	const coin = img(COIN, 'coin-icon');
	const c = coinsOf(plan);
	if (!want) {
		return plan.coins
			? `<p class="run-ahead">${coin}${T('{range} coins this run · {n} in the purse. Nothing your builds want is bought with coins yet, so these are for whatever comes next.', { range: coinRange(c.min, c.max), n: F(held) })}</p>`
			: '';
	}
	const short = Math.max(0, want - held);
	if (!short) return `<p class="run-ahead full">${coin}${T('The purse already covers the {n} coins your builds want. Anything this run pays is over and above it.', { n: F(want) })}</p>`;
	if (!plan.coins) return `<p class="run-ahead">${coin}${T('<b>{n}</b> coins short of the {want} your builds want. Tick the chains that end at an island paying in coins.', { n: F(short), want: F(want) })}</p>`;
	// How many more runs is a range too, and the right way round: the
	// most this run can pay is the fewest runs it takes.
	const most = Math.ceil(short / c.max), fewest = Math.ceil(short / c.min);
	const runs = most === fewest ? F(most) : `${F(most)}–${F(fewest)}`;
	return `<p class="run-ahead">${coin}${fewest === 1
		? T('<b>{range}</b> coins this run · <b>{short}</b> short of the {want} your builds want · <b>{runs}</b> more run like this one', { range: coinRange(c.min, c.max), short: F(short), want: F(want), runs })
		: T('<b>{range}</b> coins this run · <b>{short}</b> short of the {want} your builds want · <b>{runs}</b> more runs like this one', { range: coinRange(c.min, c.max), short: F(short), want: F(want), runs })}</p>`;
}

// The plan on screen, for the record button to read back.
let shownPlan = null;

/**
 * The run for silver, in two panels: the board's chains to tick, and
 * the run along the ticked ones -- its figures, each chain's stops as
 * a timeline, what was bought, left on the way and carried home.
 */
function silverParts(me, b) {
	const from = fromPort();
	const chainActs = fill => `<div class="chain-acts"><span class="panel-sub">${T('tick the ones to sail')}</span><span class="panel-spacer"></span>${fill ? `<button class="chip tiny primary" data-act="barter-fill" title="${T('Keep what is ticked and add the chains that pay best beside it')}"${filling ? ' disabled aria-busy="true"' : ''}>${filling ? T('filling…') : T('fill the rest for me')}</button>` : ''}${routes.ids.length ? `<button class="linky" data-act="barter-chains-clear">${T('clear')}</button>` : ''}</div>`;
	const prof = barterProfile();
	// A stock run is the same board and the same run, told something
	// else: nothing is sold at a wharf, every target is a floor, and the
	// climbs stop where the stock ends.
	const stocking = goal === 'stock';
	// A coin run is the same board again, sailed to the islands that pay
	// in Crow Coins. They take a [Level 4] and nothing else, so the
	// ceiling is not a choice here: it is four, and the last rung of a
	// chain is the island that cashes it.
	const coining = goal === 'coin';
	if (!b.combo) {
		// What a layout pays on average is a silver figure, and a stock
		// run is not for silver: the targets are all there is to set
		// until an island has been looked at.
		const ev = stocking || coining ? null : expectedBest(me, b, prof);
		const evHTML = ev && ev.n && ev.max > 0 ? `<div class="run-ev">
			<div class="run-tiles">
				<div><div class="summary-k">${T('The best run, on average')}</div><div class="summary-v gold">${FC(Math.round(ev.mean))}</div><div class="summary-sub">${ev.n === 1 ? T('across the {n} layout still standing, each weighed by how often it has been seen · under these orders', { n: ev.n }) : T('across the {n} layouts still standing, each weighed by how often it has been seen · under these orders', { n: ev.n })}</div></div>
				<div><div class="summary-k">${T('From the worst board to the best')}</div><div class="summary-v">${FC(Math.round(ev.min))} – ${FC(Math.round(ev.max))}</div><div class="summary-sub">${ev.best ? T('the best is layout {id}: {what}', { id: esc(ev.best.id), what: esc(ev.best.what) }) : ''}</div></div>
			</div>
			<p class="panel-sub barter-caveat">${T('One look at an island names the layout, and the chains and the runs worth sailing follow. The value counts silver net of land goods and the goods kept.')}</p>
		</div>` : '';
		const reachNote = reach ? `<div class="reach-bar"><span>${T('Reaching <b>{name}</b> for the material run. Look at one island first: the chains that pass it follow from the board.', { name: esc(gameName(reach)) })}</span><button class="chip tiny" data-act="barter-goal" data-id="material">← ${T('the material run')}</button><button class="chip tiny" data-act="barter-reach-clear">${T('clear')}</button></div>` : '';
		const oNow = stocking ? stockOrders(ordersNow(), stockGoal) : ordersNow();
		return {
			secs: [
				['ladder', T('Where today ends'), esc(goalLine(oNow)), ladderHTML(oNow)],
				['how', T('How to sail it'), esc(howLine(oNow)), howHTML(oNow)],
				['chains', T('Chains on offer'), T('the board is not read yet'), `${reachNote}<div class="chains-wait"><p>${board.answers.length
					? T('Nearly there: one more island settles which board this is, and the chains follow.')
					: T('The chains follow the board: look at one island in the game and tap what it shows.')}</p><button class="chip primary" data-act="barter-board-island">${T('Tell it what an island shows')} ›</button>${prof.barterCount ? '' : `<p class="chains-wait-note">${T('Your Total Barters read nought, which leaves almost every island shut. Set them in the bar at the top of the page — the number is in the game’s Barter Information window.')}</p>`}</div>${evHTML}`]
			],
			load: '', dock: '', things: { all: 0, done: 0 }, stops: 0, time: ''
		};
	}
	const o = stocking ? stockOrders(ordersNow(), stockGoal) : ordersNow();
	const ceilingNow = stocking ? stockGoal.ceiling : coining ? COIN_LEVEL : climb;
	const pace = o.pace;
	const stock = aboardStock(), dock = dockStock();
	// Land chains only when the orders buy ashore.
	// The board's chains, less the ones that climb through an island
	// this sailor has not opened: those are not runs, they are doors,
	// and they are counted for the line that says so rather than laid
	// out as if they could be sailed today.
	// The shore goods the sailor keeps, wherever they are. A land chain
	// is only on offer when the pile covers its first rung, if the
	// orders take the shore goods from the pile rather than buying.
	const land = landHeld(store.getAllStock());
	const covered = c => c.from !== 'land' || o.landFrom !== 'stock' || (land.get(c.item) || 0) >= c.rungs[0].giveN;
	const everything = chains(b.data, stock, dock, prof.barterCount, ceilingNow, coining);

	const shutChains = everything.filter(c => c.gate && (o.buy || c.from !== 'land') && covered(c));
	let all = everything.filter(c => (o.buy || c.from !== 'land') && !c.gate && covered(c));
	// Asked to reach a good for the material run: only the chains that
	// pass it, each cut there, so the run ends with that good aboard.
	if (reach) {
		all = all.filter(c => c.rungs.some(r => r.item === reach)).map(c => {
			const i = c.rungs.findIndex(r => r.item === reach);
			const rungs = c.rungs.slice(0, i + 1);
			return { ...c, rungs, top: levelOf(reach), id: `${c.id}>${i}` };
		});
	}
	const made = store.getProfile('homemade', []) || [];
	const prices = landPrices(all.filter(c => c.from === 'land').map(c => c.item), made);
	// How the ranges are counted: the record of past runs or the
	// average when the orders say so, and always what this run has seen.
	const seen = {};
	const ratios = store.getProfile('ratios', {}) || {};
	if (o.count !== 'least') for (const c of all) for (const r of c.rungs) { const n = countAs(r, o, ratios); if (n) seen[r.npcId] = n; }
	Object.assign(seen, planSeen(sailing()));
	// Everything the sailor holds, wherever it is: a floor is about the
	// pile, not about the hold, so a run must know the whole of it
	// before it decides what it may spend.
	const owned = Object.fromEntries(everythingHeld());
	const opts = { stock, dock, hold: me.hold, parley: parleyOf(prof), npcById, start: from, stashes, prefer: stashAt(), pace, orders: o, prices, seen, keep: reach ? [reach] : [], land, owned };
	// Each chain on its own, for its row: the list is sorted by the
	// yardstick, silver a Parley unit, the guide's measure of a chain,
	// so the best use of the day's Parley is at the top of its group.
	// The runs worth sailing, searched once for these inputs and kept
	// until any of them change; each chain's run on its own likewise.
	const ship = { speed: me.speed.total, cal: sailCal() };
	// The barter count is part of the key, and has to be: it decides
	// which chains exist at all. Without it, raising the count left the
	// solo runs keyed to the old, shorter set -- and the first chain the
	// new count opened had no run in the map, which threw inside the
	// render and froze the tab on the old board.
	// What the sets are judged by: the stock, said as plain data so the
	// search can take it to the worker.
	const aim = coining ? { kind: 'coins' } : stocking ? { targets: stockGoal.targets, held: [...everythingHeld()], kind: stockGoal.aim } : null;
	// The ceiling is part of the key as much as the barter count is: it
	// decides which chains exist at all, and a search kept across a
	// change of it would answer for chains this board no longer lists.
	const ceiling = ceilingNow;
	const pkey = JSON.stringify([board.day, b.combo.id, stock, dock, owned, [...land], o, port, stash, Object.values(prices).map(x => x.each), me.hold, ship, opts.parley, opts.seen, reach, prof.barterCount, aim, ceiling, b.shut]);
	const search = { chains: all, opts, ship, timeCap: o.hours, aim };
	// The search goes to the worker and the page draws meanwhile; asked
	// again when the inputs change, or when an answer is owed and no
	// request is out for it -- a fill superseded it, or the worker went.
	if (proposed.key !== pkey || (proposed.working && !searching(pkey))) {
		let solos = proposed.solos;
		if (proposed.key !== pkey) {
			const base = chainRun({ ...opts, chosen: [] });
			solos = new Map(all.map(c => [c.id, soloRun(c, opts, from, base)]));
		}
		const found = proposeAsync(search, pkey, result => {
			// The inputs moved on before the answer came: a newer request
			// is out for them, and this answer is nobody's.
			if (proposed.key !== pkey) return;
			proposed = { ...proposed, ...result, working: false };
			if (routesAuto === routes.key) {
				routesAuto = '';
				routes = { key: routes.key, ids: proposed.best ? proposed.best.ids : all.length ? [all[0].id] : [] };
				persist();
			}
			redrawSoon();
		});
		// Until the answer comes the last proposals stand in, when they
		// belong to this board, under a note that the search is out.
		const onBoard = new Set(all.map(c => c.id));
		proposed = found
			? { key: pkey, solos, ...found, working: false }
			: { key: pkey, solos, proposals: proposed.proposals.filter(p => p.ids.every(id => onBoard.has(id))), best: proposed.key === pkey ? proposed.best : null, partial: false, working: true };
	}
	lastSearch = search;
	// Ticks left to the search -- a new board, or a way of sailing just
	// changed under ticks that were the search's own -- take its answer
	// as soon as there is one, whether it came from the worker or was
	// already in hand.
	if (!proposed.working && routesAuto && routesAuto === routes.key) {
		routesAuto = '';
		routes = { key: routes.key, ids: proposed.best ? proposed.best.ids : all.length ? [all[0].id] : [] };
		persist();
	}
	const solos = proposed.solos;
	all.sort((x, y) => y.top - x.top || (solos.get(y.id).yard.perUnit - solos.get(x.id).yard.perUnit) || x.rungs.length - y.rungs.length || isleOf(npcById.get(x.rungs[0].npcId)).localeCompare(isleOf(npcById.get(y.rungs[0].npcId))));
	const key = `${board.day}|${b.combo.id}|${reach}`;
	// A new board's ticks are the best run found; while that is still
	// being found nothing is ticked, and the answer ticks it.
	if (routes.key !== key) {
		routes = { key, ids: proposed.working ? [] : proposed.best ? proposed.best.ids : all.length ? [all[0].id] : [] };
		routesAuto = proposed.working ? key : '';
	}
	const chosen = all.filter(c => routes.ids.includes(c.id));
	const sameSet = (x, y) => x.length === y.length && x.slice().sort().join('|') === y.slice().sort().join('|');
	const cards = proposed.proposals.map(p => {
		const isl = p.run.stops.filter(s => s.npcId).length;
		const on = sameSet(p.ids, routes.ids);
		// A stock run's card counts goods, not silver: what it banks
		// toward the targets, and what that is level by level.
		const got = stocking ? stockGains(p.run, stock) : null;
		// A card compares runs, so its big figure is the one that is
		// least a guess: what the run pays at worst, with the bonus on
		// it like everywhere else.
		const paid = coining ? coinsOf(p.run) : null;
		const big = coining ? (p.run.coins ? `${img(COIN, 'tile-icon')}+${coinRange(paid.min, paid.max)}` : '—') : stocking ? (got.total ? `+${F(got.total)}` : '—') : FC(Math.round(p.value));
		const yard = coining
			? [p.run.parleyUsed ? `<em>${T('{n}/unit', { n: F(Math.round(paid.min / (p.run.parleyUsed / PARLEY_UNIT))) })}</em>` : '', p.hours ? T('{n} an hour', { n: F(Math.round(paid.min / p.hours)) }) : '', p.hours ? `≈ ${esc(fmtRange(p.hours * 3600 * 0.9, p.hours * 3600 * 1.1))}` : ''].filter(Boolean).join(' · ')
			: stocking
				? [got.byLevel.map(([lv, n]) => `L${lv} +${F(n)}`).join(' · '), p.hours ? `≈ ${esc(fmtRange(p.hours * 3600 * 0.9, p.hours * 3600 * 1.1))}` : ''].filter(Boolean).join(' · ')
				: [p.yard.perUnit ? `<em>${esc(perUnitText(p.yard.perUnit))}</em>` : '', p.yard.perHour ? esc(perHourText(p.yard.perHour)) : '', p.hours ? `≈ ${esc(fmtRange(p.hours * 3600 * 0.9, p.hours * 3600 * 1.1))}` : ''].filter(Boolean).join(' · ');
		return `<button class="proposal${on ? ' on' : ''}" data-act="barter-propose" data-ids="${esc(p.ids.join('\n'))}" title="${on ? T('This is the run laid out on the right') : T('Lay this run out on the right')}">
			<span class="proposal-k">${esc(said(p.label))}</span>
			<b>${big}</b>
			<span class="proposal-yard">${yard}</span>
			<span class="proposal-sub">${p.ids.length === 1 ? T('{n} chain', { n: p.ids.length }) : T('{n} chains', { n: p.ids.length })} · ${isl === 1 ? T('{n} island', { n: isl }) : T('{n} islands', { n: isl })} · ${T('{n} trades', { n: F(p.run.trades) })}${p.run.cost ? ` · ${T('{silver} of land goods', { silver: FC(Math.round(p.run.cost)) })}` : ''}</span>
		</button>`;
	}).join('');
	const budgetText = T('best found in {n} s', { n: (SEARCH_BUDGET_MS / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) });
	const proposals = `<div class="proposals${proposed.working ? ' working' : ''}">
		<div class="proposals-head"><span>${T('Runs worth sailing')}</span><span class="faint">${proposed.working ? T('working out the runs…') : `${T('found on today’s board under these orders')}${o.hours ? `, ${o.hours === 1 ? T('within {n} hour', { n: o.hours }) : T('within {n} hours', { n: o.hours })}` : ''}${proposed.partial ? ` · ${budgetText}` : ''}`} · ${T('the value counts silver net of land goods and the goods kept')}</span></div>
		${cards ? `<div class="proposal-cards">${cards}</div>` : proposed.working ? `<div class="proposal-cards"><div class="proposal placeholder" aria-busy="true"><span class="proposal-k">${T('Working out the runs…')}</span><b>&nbsp;</b><span class="proposal-sub">${T('the board’s chains, searched in the background')}</span></div></div>` : `<p class="empty">${stocking ? T('Nothing on this board climbs toward the stock under these orders.') : T('Nothing on this board pays under these orders.')}</p>`}
	</div>`;
	const fillable = chosen.length > 0 && !proposed.proposals.some(p => sameSet(p.ids, routes.ids));
	// The list, filtered: a word in an island's or a good's name, where
	// the chain starts, the level it reaches. A ticked chain always shows.
	const cq = chainQ.trim().toLowerCase();
	const passes = c => chosen.includes(c) || ((!cq || c.item.toLowerCase().includes(cq) || c.rungs.some(r => r.npc.toLowerCase().includes(cq) || r.item.toLowerCase().includes(cq) || (npcById.get(r.npcId) || {}).at.toLowerCase().includes(cq)))
		&& (!chainFrom || (chainFrom === 'held' ? c.from !== 'land' : c.from === 'land'))
		&& (!chainTop || (chainTop === 'coin' ? c.pays === 'coin' : c.top === chainTop && c.pays !== 'coin')));
	const listed = all.filter(passes);
	// One card a ladder. A good held part-way up a chain from the shore
	// climbs the same islands to the same top, and the islands deal
	// once: the chains are one climb with a choice of where to start --
	// the shore, or the good held -- not two runs at the [Level 7]. So a
	// chain whose rungs are the tail of a longer one's is folded into
	// that card, as a start to pick; the longest is the ladder's own.
	const ladders = new Map();
	for (const c of all) {
		const longest = all.reduce((best, d) => (tailOf(d, c) && (!best || d.rungs.length > best.rungs.length) ? d : best), null) || c;
		if (!ladders.has(longest.id)) ladders.set(longest.id, []);
		ladders.get(longest.id).push(c);
	}
	for (const list of ladders.values()) list.sort((x, y) => y.rungs.length - x.rungs.length);
	// The levels the list shows are the ones anything reaches, shut or
	// not: a reach whose only climbs are behind a door still has a group,
	// so the door is where a reader looks for it.
	// A chain that ends in coins is not "a reach" like the others: it
	// cashes a [Level 4] rather than climbing past one, so it gets its
	// own group rather than sitting among the chains that stop at four.
	const reachOf = c => (c.pays === 'coin' ? 'coin' : c.top);
	const tops = [...new Set([...all, ...shutChains].map(reachOf))].sort((a, b2) => (a === 'coin' ? -1 : b2 === 'coin' ? 1 : b2 - a));
	const chainFilters = `<div class="chain-filters">
		<input class="field hold-q" type="search" placeholder="${T('Find an island, a place or a good…')}" value="${esc(chainQ)}" data-act="barter-chain-q" aria-label="${T('Find a chain')}">
		<span class="chips">
			<button class="chip tiny${chainFrom === 'held' ? ' active' : ''}" data-act="barter-chain-from" data-id="held" title="${T('Chains that start from a good held, aboard or at the harbour')}">${T('from what is held')}</button>
			<button class="chip tiny${chainFrom === 'land' ? ' active' : ''}" data-act="barter-chain-from" data-id="land" title="${T('Chains that start with a land good bought ashore')}">${T('bought ashore')}</button>
			${tops.map(t => `<button class="chip tiny lvl${chainTop === t ? ' active' : ''}" data-act="barter-chain-top" data-lv="${t}" style="--tier:${TIER(t === 'coin' ? COIN_LEVEL : t)}" title="${t === 'coin' ? T('Chains that end at an island paying in Crow Coins') : T('Chains that reach Level {lv}', { lv: t })}">${t === 'coin' ? img(COIN, 'chip-icon') : t}</button>`).join('')}
			${cq || chainFrom || chainTop ? `<button class="chip tiny" data-act="barter-chain-clear">${T('clear')}</button>` : ''}
		</span>
	</div>`;
	const groups = tops.map(top => {
		const coinGroup = top === 'coin';
		// The ladders at this reach, each with the starts the filters
		// leave in; the card shows the start ticked, else the best.
		const rows = [...ladders.values()].filter(list => reachOf(list[0]) === top).map(list => {
			const starts = list.filter(c => listed.includes(c));
			if (!starts.length) return '';
			// The card shows the start ticked, else the best one that can
			// actually be sailed: a climb from the shore on a good the
			// Market has none of is no start at all, and the [Level 3]s
			// waiting at the wharf are -- so the card is theirs.
			const shown = starts.find(c => chosen.includes(c))
				|| starts.slice().sort((x, y) => Number(marketDead(solos.get(x.id))) - Number(marketDead(solos.get(y.id))) || all.indexOf(x) - all.indexOf(y))[0];
			// A chain with no run of its own yet -- the set moved under a
			// memo -- is drawn as nothing rather than thrown over.
			const solo = solos.get(shown.id);
			if (!solo) return '';
			return chainRow(shown, chosen.includes(shown), solo, from && from.name, from, starts.length > 1 ? { starts, chosen, solos } : null);
		}).filter(Boolean);
		// The climbs at this reach that are not this sailor's yet: the
		// same search filters them, so a word typed finds them too.
		const locked = shutChains.filter(c => reachOf(c) === top && passes(c))
			.map(c => chainRow(c, false, null, from && from.name, from, null, c.gate));
		if (!rows.length && !locked.length) return '';
		const of = [...ladders.values()].filter(list => reachOf(list[0]) === top).length;
		return `<div class="chain-group${coinGroup ? ' coin' : ''}"><div class="chain-group-head" style="--tier:${TIER(coinGroup ? COIN_LEVEL : top)}"><i></i><span>${coinGroup ? `${img(COIN, 'group-icon')}${T('Cashed in for Crow Coins')}` : T('Reaches Level {lv}', { lv: top })}</span><span>${rows.length !== of ? T('{n} of {of}', { n: rows.length, of }) : rows.length}${locked.length ? ` · ${T('{n} locked', { n: locked.length })}` : ''}</span></div>${rows.join('')}${locked.join('')}</div>`;
	}).join('');
	// What pays the good today, and whether its give is held: the answer
	// even when no chain from the shore reaches it.
	const pays = reach ? exchanges(b.data).filter(x => x.item === reach && npcById.has(x.npcId)) : [];
	const paysText = pays.length
		? T('Today {list}.', { list: pays.map(x => `${T('<b>{isle}</b> pays it for {n}× {name}', { isle: esc(gameName(isleOf(npcById.get(x.npcId)))), n: esc(x.giveText), name: esc(gameName(x.give)) })}${heldOf(x.give).run > 0 ? ` ${T('({n} held)', { n: F(heldOf(x.give).run) })}` : ` ${T('(none held)')}`}`).join('; ') })
		: T('No island on today’s board pays it.');
	const reachBar = reach ? `<div class="reach-bar"><span>${T('Reaching <b>{name}</b> for the material run: the chains that pass it, cut there, so it comes home aboard.', { name: esc(gameName(reach)) })} ${paysText}${all.length ? '' : pays.length ? ` ${T('Nothing on this board climbs to that give — wait for a refresh, or clear.')}` : ` ${T('Wait for a refresh, or clear.')}`}</span><button class="chip tiny" data-act="barter-goal" data-id="material" title="${T('Back to the material run')}">← ${T('the material run')}</button><button class="chip tiny" data-act="barter-reach-clear">${T('clear')}</button></div>` : '';
	// The chains left out because a rung of theirs stands at an island
	// this sailor has not opened. Said out loud and by name: a board
	// that quietly showed three fewer chains than it holds would be the
	// same lie the app used to tell, only in the other direction.
	const shutIsles = [...new Map(shutChains.map(c => [c.gate.npcId, c.gate])).values()].sort((a, b) => a.barters - b.barters);
	const shutNote = shutIsles.length
		? `<div class="barter-shut"><b>${shutChains.length === 1 ? T('{n} chain on this board is not yours to sail yet', { n: shutChains.length }) : T('{n} chains on this board are not yours to sail yet', { n: shutChains.length })}</b> — ${shutIsles.map(g => T('{isle} opens at {barters} Total Barters, {short} more', { isle: esc(gameName(isleOf(npcById.get(g.npcId)) || g.npc)), barters: F(g.barters), short: F(g.short) })).join('; ')}. ${shutChains.length === 1 ? T('It is listed below, locked, and left out of the run and of the runs worth sailing.') : T('They are listed below, locked, and left out of the run and of the runs worth sailing.')}${prof.barterCount ? '' : ` ${T('Your Total Barters read nought — set them in the bar at the top of the page.')}`} <button class="linky" data-act="routes">${T('every route and its count')} →</button></div>`
		: '';
	// A floor that keeps back everything held of a level is a level no
	// chain can start from, and a board that looks empty for no reason
	// anyone can see. It is said here, above the list it emptied.
	//
	// What it means depends on what the day is for. On a stock run the
	// floors are the targets themselves, and a level held back is the
	// run working: it is filling that level, not climbing off it. On any
	// other run a floor is a thing the sailor asked for and may well
	// have forgotten, so the way out is offered beside it.
	const shutByFloor = floorsShut(o);
	const floorWhy = shutByFloor.map(f => T('you hold <b>{held}</b> of {kinds} against a floor of <b>{floor}</b>', {
		held: F(f.held), floor: F(f.floor),
		kinds: f.kinds === 1 ? T('{n} kind of [Level {lv}]', { n: f.kinds, lv: f.lv }) : T('{n} kinds of [Level {lv}]', { n: f.kinds, lv: f.lv })
	})).join('; ');
	// A floor at the level a coin day cashes is the one that costs most
	// and shows least: the run climbs, the trades happen, and the purse
	// says nothing at all, because a [Level 4] kept back is a [Level 4]
	// not handed to a coin island. It is the run obeying an order set
	// weeks ago on some other kind of day.
	const cashShut = coining ? shutByFloor.find(f => f.lv === COIN_LEVEL) : null;
	const dropFloors = lvs => `<button class="chip tiny primary" data-act="barter-floor-clear" data-lvs="${esc(lvs.join(','))}" title="${T('Set those floors back to none, so the run may spend what you hold')}">${lvs.length === 1 ? T('drop that floor') : T('drop those floors')} →</button>`;
	const one = shutByFloor.length === 1;
	const floorNote = !shutByFloor.length ? '' : stocking
		? `<div class="barter-shut floors"><b>${one
			? T('A level is being filled, not climbed off')
			: T('{n} levels are being filled, not climbed off', { n: shutByFloor.length })}</b> — ${floorWhy}. ${one
			? T('Nothing climbs from it until the stock is made up, which is what the target is for.')
			: T('Nothing climbs from them until the stock is made up, which is what the targets are for.')} ${T('For a run that climbs straight past them, set the lower targets to none.')}</div>`
		: cashShut
			? `<div class="barter-shut floors"><b>${T('Nothing will be cashed for coins')}</b> — ${T('you hold <b>{held}</b> of {kinds} against a floor of <b>{floor}</b>, and a [Level {lv}] kept back is a [Level {lv}] not handed to a coin island. The climbing happens, the purse stays empty.', {
				held: F(cashShut.held), floor: F(cashShut.floor), lv: cashShut.lv,
				kinds: cashShut.kinds === 1 ? T('{n} kind of [Level {lv}]', { n: cashShut.kinds, lv: cashShut.lv }) : T('{n} kinds of [Level {lv}]', { n: cashShut.kinds, lv: cashShut.lv })
			})} ${dropFloors(shutByFloor.map(f => f.lv))}</div>`
			: `<div class="barter-shut floors"><b>${one
				? T('A floor is holding the run back')
				: T('{n} floors are holding the run back', { n: shutByFloor.length })}</b> — ${floorWhy}. ${one
				? T('There is none of it to spend, so no chain can start from it.')
				: T('There is none of them to spend, so no chain can start from them.')} ${dropFloors(shutByFloor.map(f => f.lv))}</div>`;
	const chainsBody = `<div class="barter-chains">${chainActs(fillable)}${floorNote}${shutNote}${reachBar}${reach ? '' : proposals}${all.length ? chainFilters : ''}<div class="chain-list">${groups || `<p class="empty">${!all.length ? (o.landFrom === 'stock' && o.buy ? T('No chain on this board starts from a shore good you keep. Let the run buy its land goods ashore, or add what you have with ＋ A good.') : o.buy ? T('Nothing climbs on this board.') : T('Nothing held climbs on this board. Let the run buy land goods, or load a good ashore.')) : T('No chain matches.')}</p>`}</div></div>`;

	const plan = chainRun({ ...opts, chosen });
	for (const s of plan.stops) s.hold = me.hold;
	// The quests handed in on the way, with a stop put in for a taker
	// off the route: the run's stops from here on are those.
	const qp = questPlan(plan.stops, o.quests, me.hold, plan.weightStart);
	plan.stops = qp.stops;
	plan.questsHome = qp.home;
	shownPlan = plan;
	const legs = legsOf(plan.stops);
	// The Parley bar, stop by stop, for the whole run at once -- the
	// chain segments below draw their own stops from the same book.
	const book = ledgerOf(plan.stops, legs);
	const parley = parleyOf(prof);
	const yard = yardsticks(plan.net, plan.parleyUsed, legs.mid / 3600);
	const islands = plan.stops.filter(s => s.npcId).length, wharfs = plan.stops.filter(s => s.wharf).length;
	// A fast run refuses a hold over the limit and trades nothing; say
	// so, since the empty run looks like a board with nothing on it.
	const heavy = pace === 'fast' && plan.trades === 0 && chosen.length > 0 && plan.weightStart > me.hold.free;
	const peak = shownHold(me.hold, plan.weightPeak), atStart = shownHold(me.hold, plan.weightStart);
	const chainName = c => T('{isle} chain', { isle: esc(isleShort(npcById.get(c.rungs[0].npcId)) || c.rungs[0].npc) });
	// What the coins come to once the barter-count bonus is on them.
	const purse = coinsOf(plan);
	// Nothing traded at all is its own sentence; a chain that climbed
	// part of the way is the commoner case and says which chain and how
	// far. Both, where both are true.
	const notice = `${heavy ? `<p class="run-notice warn">${T('The hold is at {text}, over the limit, and a fast run makes no wharf call — so nothing trades. Switch the pace to a <b>full</b> one to call at a wharf first, or leave {lt} LT ashore.', { text: esc(atStart.text), lt: F(Math.round(atStart.total - atStart.limit)) })}</p>` : ''}${heavy ? '' : cutsHTML(plan, pace, chainName)}`;
	const soldLevels = [...new Set(plan.sold.map(x => levelOf(x.item)))].sort((a, b2) => b2 - a);
	const soldWhat = soldLevels.length ? (soldLevels.length === 1 ? T('the [Level {lv}]s', { lv: soldLevels[0] }) : T('Level {from} to {to}', { from: soldLevels[soldLevels.length - 1], to: soldLevels[0] })) : '';
	const tile = (k, v, sub, cls = '') => `<div><div class="summary-k">${k}</div><div class="summary-v${cls ? ` ${cls}` : ''}">${v}</div><div class="summary-sub">${sub}</div></div>`;
	// What a stock run is worth, in goods rather than silver: what it
	// banks toward the targets, level by level, and what it leaves the
	// pile standing at.
	const gains = stocking ? stockGains(plan, stock) : null;
	const tiles = coining ? `<div class="run-tiles">
		${tile(`${img(COIN, 'tile-icon')}${T('Crow Coins')}`, plan.coins ? coinRange(purse.min, purse.max, '+') : '—', plan.coins ? `${bonusNote(purse)} · ${plan.stops.filter(s => s.item === COIN).length === 1 ? T('{n} island paying', { n: F(plan.stops.filter(s => s.item === COIN).length) }) : T('{n} islands paying', { n: F(plan.stops.filter(s => s.item === COIN).length) })}` : chosen.length ? (cashFloorNow() ? T('every [Level {lv}] you hold is under the floor of {floor} you keep back, so none is cashed', { lv: COIN_LEVEL, floor: F(cashFloorNow()) }) : T('no chain ticked cashes a [Level 4] for coins')) : T('pick a chain'), 'gold')}
		${tile(T('Trades'), plan.trades ? F(plan.trades) : '—', plan.trades ? `${T('{spent} Parley of {bar}', { spent: F(Math.round(plan.parleyUsed)), bar: F(plan.parleyBar) })} · ${T('{n} barters behind you, {after} after', { n: F(prof.barterCount), after: F(prof.barterCount + plan.trades) })}${plan.coins && plan.parleyUsed ? ` · ${T('{n} coins a Parley unit', { n: F(Math.round(purse.min / (plan.parleyUsed / PARLEY_UNIT))) })}` : ''}` : T('one barter counts as one, whatever it trades'), 'gold')}
		${tile(T('Hold at its fullest'), plan.stops.length ? esc(peak.text) : '—', `${peak.note || T('under the limit')} · ${peak.deal === peak.max ? T('barters and moves to {max}', { max: F(peak.max) }) : T('barters to {deal} · moves to {max}', { deal: F(peak.deal), max: F(peak.max) })}`, peak.state === 'heavy' || peak.state === 'dead' ? 'warn' : peak.state === 'over' ? 'amber' : 'teal')}
		${tile(T('Parley at the end'), plan.stops.length ? F(book.end) : '—', `${T('{spent} spent from {held}', { spent: F(book.spent), held: F(parley.held) })}${parleyGuessed(prof) ? ` · ${T('a full bar, taken as read — type yours in the pouch')}` : ''}${prof.vouchers ? ` · ${prof.vouchers === 1 ? T('{used} of {of} voucher drawn on', { used: book.vouchersUsed, of: prof.vouchers }) : T('{used} of {of} vouchers drawn on', { used: book.vouchersUsed, of: prof.vouchers })}` : ''}${book.short ? ` · <b class="warn">${T('{n} short', { n: F(book.short) })}</b>` : ''}`, book.short ? 'warn' : book.end < PARLEY.max * 0.1 ? 'amber' : 'teal')}
		${tile(T('Under way'), legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `${T('≈ {time} at {speed}%', { time: esc(legs.time), speed: me.speed.total })} · ${islands === 1 ? T('{n} island', { n: islands }) : T('{n} islands', { n: islands })}${wharfs ? `, ${wharfs === 1 ? T('{n} wharf call', { n: wharfs }) : T('{n} wharf calls', { n: wharfs })}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}` : T('pick a chain'))}
	</div>${coinPurseHTML(plan)}` : stocking ? `<div class="run-tiles">
		${tile(T('The stock gains'), gains.total ? `+${F(gains.total)}` : '—', gains.total ? `${gains.byLevel.map(([lv, n]) => `L${lv} +${F(n)}`).join(' · ')}${gains.spare ? ` · ${T('{n} over the targets, to climb with', { n: F(gains.spare) })}` : ''}` : chosen.length ? T('nothing this run banks is short') : T('pick a chain'), 'teal')}
		${tile(T('Trades'), plan.trades ? F(plan.trades) : '—', plan.trades ? `${T('{spent} Parley of {bar}', { spent: F(Math.round(plan.parleyUsed)), bar: F(plan.parleyBar) })} · ${T('{n} barters behind you, {after} after', { n: F(prof.barterCount), after: F(prof.barterCount + plan.trades) })}` : T('one barter counts as one, whatever it trades'), 'gold')}
		${tile(T('Hold at its fullest'), plan.stops.length ? esc(peak.text) : '—', `${peak.note || T('under the limit')} · ${peak.deal === peak.max ? T('barters and moves to {max}', { max: F(peak.max) }) : T('barters to {deal} · moves to {max}', { deal: F(peak.deal), max: F(peak.max) })}`, peak.state === 'heavy' || peak.state === 'dead' ? 'warn' : peak.state === 'over' ? 'amber' : 'teal')}
		${tile(T('Parley at the end'), plan.stops.length ? F(book.end) : '—', `${T('{spent} spent from {held}', { spent: F(book.spent), held: F(parley.held) })}${parleyGuessed(prof) ? ` · ${T('a full bar, taken as read — type yours in the pouch')}` : ''}${prof.vouchers ? ` · ${prof.vouchers === 1 ? T('{used} of {of} voucher drawn on', { used: book.vouchersUsed, of: prof.vouchers }) : T('{used} of {of} vouchers drawn on', { used: book.vouchersUsed, of: prof.vouchers })}` : ''}${book.short ? ` · <b class="warn">${T('{n} short', { n: F(book.short) })}</b>` : ''}`, book.short ? 'warn' : book.end < PARLEY.max * 0.1 ? 'amber' : 'teal')}
		${tile(T('Under way'), legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `${T('≈ {time} at {speed}%', { time: esc(legs.time), speed: me.speed.total })} · ${islands === 1 ? T('{n} island', { n: islands }) : T('{n} islands', { n: islands })}${wharfs ? `, ${wharfs === 1 ? T('{n} wharf call', { n: wharfs }) : T('{n} wharf calls', { n: wharfs })}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}` : T('pick a chain'))}
	</div>${aheadHTML(gains, plan, prof)}` : `<div class="run-tiles">
		${tile(plan.cost ? T('Silver, net') : T('Sold in port'), plan.silver ? FC(Math.round(plan.net)) : '—', plan.silver ? `${T('{what} sold at the wharf', { what: soldWhat })}${plan.cost ? ` ${T('for {silver} · {cost} of land goods bought', { silver: FC(Math.round(plan.silver)), cost: FC(Math.round(plan.cost)) })}` : ''}${plan.bought.some(b => b.how === 'unpriced') ? ` · ${T('some land goods unpriced')}` : ''}` : chosen.length ? T('no chain ticked sells') : T('pick a chain'), plan.net < 0 ? 'warn' : 'gold')}
		${tile(T('A Parley unit pays'), yard.perUnit ? FC(Math.round(yard.perUnit)) : '—', yard.perUnit ? `${T('{spent} Parley of {bar}', { spent: F(Math.round(plan.parleyUsed)), bar: F(plan.parleyBar) })} · ${plan.trades === 1 ? T('{n} trade', { n: F(plan.trades) }) : T('{n} trades', { n: F(plan.trades) })}${yard.perHour ? ` · ${T('≈ {silver} an hour', { silver: FC(Math.round(yard.perHour)) })}` : ''}` : `${plan.trades === 1 ? T('{n} trade', { n: F(plan.trades) }) : T('{n} trades', { n: F(plan.trades) })} · ${T('one unit is one normal trade’s Parley')}`, 'gold')}
		${tile(T('Hold at its fullest'), plan.stops.length ? esc(peak.text) : '—', `${peak.note || T('under the limit')} · ${peak.deal === peak.max ? T('barters and moves to {max}', { max: F(peak.max) }) : T('barters to {deal} · moves to {max}', { deal: F(peak.deal), max: F(peak.max) })}`, peak.state === 'heavy' || peak.state === 'dead' ? 'warn' : peak.state === 'over' ? 'amber' : 'teal')}
		${tile(T('Parley at the end'), plan.stops.length ? F(book.end) : '—', `${T('{spent} spent from {held}', { spent: F(book.spent), held: F(parley.held) })}${parleyGuessed(prof) ? ` · ${T('a full bar, taken as read — type yours in the pouch')}` : ''}${prof.vouchers ? ` · ${prof.vouchers === 1 ? T('{used} of {of} voucher drawn on', { used: book.vouchersUsed, of: prof.vouchers }) : T('{used} of {of} vouchers drawn on', { used: book.vouchersUsed, of: prof.vouchers })}` : ''}${book.short ? ` · <b class="warn">${T('{n} short', { n: F(book.short) })}</b>` : ''}`, book.short ? 'warn' : book.end < PARLEY.max * 0.1 ? 'amber' : 'teal')}
		${tile(T('Under way'), legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `${T('≈ {time} at {speed}%', { time: esc(legs.time), speed: me.speed.total })} · ${islands === 1 ? T('{n} island', { n: islands }) : T('{n} islands', { n: islands })}${wharfs ? `, ${wharfs === 1 ? T('{n} wharf call', { n: wharfs }) : T('{n} wharf calls', { n: wharfs })}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}` : T('pick a chain'))}
	</div>`;
	// One route through every chain: the stops in sailing order, each
	// tagged with its chain, the chains named in the head with the way
	// to untick each. Chain after chain: a segment a chain.
	const oneRoute = o.way === 'sea' && plan.order.length > 1;
	const segs = oneRoute ? (plan.stops.length ? `<section class="panel run-seg run-seg-all" style="--tier:${TIER(Math.max(...plan.order.map(c => c.top)))}">
			<div class="run-seg-head"><i></i><b>${plan.lots.length > 1 ? T('One route, {n} lots', { n: plan.lots.length }) : T('One route, every chain at once')}</b><span>${islands === 1 ? T('{n} island', { n: islands }) : T('{n} islands', { n: islands })}${wharfs ? `, ${wharfs === 1 ? T('{n} wharf call', { n: wharfs }) : T('{n} wharf calls', { n: wharfs })}` : ''} · ${T('the nearest rung the ship holds the give for, whatever its chain')}${plan.lots.length > 1 ? ` · ${T('as many chains at once as the hold carries, the tops sold before the next lot')}` : ''}</span></div>
			<div class="run-seg-chains">${plan.lots.map(lot => lot.map(k => {
				const c = plan.order[k];
				const isl = plan.stops.filter(s => s.chain === k && s.npcId).length;
				const cutHere = plan.cut.some(x => x.chain === k);
				const count = cutHere
					? T('{n} of {of} islands', { n: isl, of: c.rungs.length })
					: isl === 1 ? T('{n} island', { n: isl }) : T('{n} islands', { n: isl });
				return `<span class="run-chain-tag" style="--tier:${TIER(c.top)}"><i></i>${chainName(c)}<em>L${c.top}</em><small${cutHere ? ` class="short" title="${T('This chain does not get to the top — see the note under the tiles')}"` : ''}>${count}</small><button class="map-x" data-act="barter-chain" data-id="${esc(c.id)}" aria-label="${T('Untick this chain')}">×</button></span>`;
			}).join('')).join(`<span class="run-lot-sep">${T('then')}</span>`)}</div>
			<div class="run-stops">${stopRows(plan.stops, legs, { board: true, sailing: sailing(), notes: qp, ledger: book, tag: s => (s.npcId ? `<em class="run-chain-tag sm" style="--tier:${TIER(plan.order[s.chain].top)}"><i></i>${chainName(plan.order[s.chain])}</em>` : '') })}</div>
		</section>` : '') : plan.order.map((c, k) => {
		const first = plan.stops.findIndex(s => s.chain === k);
		const mine = plan.stops.filter(s => s.chain === k);
		const soldHere = plan.sold.filter(s => s.chain === k).reduce((a, s) => a + s.total, 0);
		const leftHere = plan.stashed.filter(s => s.chain === k).reduce((a, s) => a + s.total, 0);
		return `<section class="panel run-seg" style="--tier:${TIER(c.top)}">
			<div class="run-seg-head"><i></i><b>${T('{isle} chain', { isle: esc(isleShort(npcById.get(c.rungs[0].npcId)) || c.rungs[0].npc) })}</b><em>${T('Level {lv}', { lv: c.top })}</em><span>${soldHere ? T('{silver} sold', { silver: FC(Math.round(soldHere)) }) : T('nothing sold')}${leftHere ? ` · ${T('{silver} left on the way', { silver: FC(Math.round(leftHere)) })}` : ''}${mine.length ? '' : (() => { const cut = plan.cut.find(x => x.chain === k); return cut && cut.why === 'market' ? ` · ${cut.listed ? T('cannot start: only {n} {good} on the Market', { n: F(cut.listed), good: esc(gameName(cut.good)) }) : T('cannot start: no {good} on the Market', { good: esc(gameName(cut.good)) })}` : ` · ${T('every island already dealt')}`; })()}</span><button class="map-x" data-act="barter-chain" data-id="${esc(c.id)}" aria-label="${T('Untick this chain')}">×</button></div>
			${mine.length ? `<div class="run-stops">${stopRows(mine, legs, { k0: first, board: true, sailing: sailing(), notes: qp, ledger: book })}</div>` : ''}
		</section>`;
	}).join('');
	const worth = s => (s.total ? T('would sell for {silver}', { silver: FC(Math.round(s.total)) }) : T('cannot be sold'));
	const goodLine = (s, at) => `<div class="run-good"><i style="--tier:${TIER(levelOf(s.item))}">${levelOf(s.item) ? `L${levelOf(s.item)}` : '·'}</i>${img(s.item, 'row-icon sm')}<b>${n1(s.n)}×</b><span>${esc(gameName(s.item))}</span>${at ? `<span class="faint">${T('at {where}', { where: esc(gameName(at)) })}</span>` : ''}${takenNote(s.item)}<span class="run-good-worth">${worth(s)}</span></div>`;
	// Everything above is on the shelves at the top of the sheet already,
	// tile for tile. What a list adds is what each good is worth and how
	// often a board takes it -- worth having, not worth reading past
	// every time -- so the lists are one fold, shut.
	const group = (title, rows) => (rows ? `<div class="run-fold-group"><h3>${title}</h3>${rows}</div>` : '');
	const stashedRows = plan.stashed.map(s => goodLine(s, s.at)).join('');
	const stockRows = plan.kept.filter(s => s.stock > 0).map(s => goodLine({ ...s, n: s.stock, total: s.stock * s.each }, '')).join('');
	const overRows = plan.kept.filter(s => s.n - s.stock > 1e-9).map(s => goodLine({ ...s, n: s.n - s.stock, total: (s.n - s.stock) * s.each }, '')).join('');
	const inner = group(T('Kept for the stock'), stockRows)
		+ group(o.sell <= 3 ? T('Carried home — nothing pays for these') : T('Carried home — below the level a wharf sells'), overRows)
		+ group(T('Left on the way, waiting for another board'), stashedRows)
		+ group(T('Taken from your pile of shore goods'), (plan.taken || []).map(t => `<div class="run-good">${img(t.item, 'row-icon sm')}<b>${F(Math.ceil(t.n))}×</b><span>${esc(gameName(t.item))}</span><span class="faint">${T('{n} left after this run', { n: F(t.left) })}</span></div>`).join(''));
	const kept = inner
		? `<details class="panel run-list run-fold"><summary><b>${T('Every good, in a list')}</b><span class="panel-sub">${T('what each is worth, and how often a board takes it')}</span></summary>${inner}</details>`
		: '';
	// The strip along the foot of the plan: the run in a line as the
	// chains are ticked, and the way on to the wharf.
	const foot = chosen.length ? runDockHTML([
		chosen.length === 1 ? T('<b>{n}</b> chain', { n: chosen.length }) : T('<b>{n}</b> chains', { n: chosen.length }),
		coining ? (plan.coins ? `<b class="gold">${coinRange(purse.min, purse.max)}</b> ${T('coins')}` : '') : stocking ? (gains.total ? `<b class="teal">+${F(gains.total)}</b> ${T('goods')}` : '') : plan.silver ? `<b class="gold">${FC(Math.round(plan.net))}</b>${plan.cost ? ` ${T('net')}` : ''}` : '',
		`${plan.stops.length === 1 ? T('<b>{n}</b> stop', { n: plan.stops.length }) : T('<b>{n}</b> stops', { n: plan.stops.length })}${legs.total ? ` · ≈ ${esc(legs.time)}` : ''}`,
		plan.trades ? `${plan.trades === 1 ? T('<b>{n}</b> trade', { n: F(plan.trades) }) : T('<b>{n}</b> trades', { n: F(plan.trades) })} · ${T('{n} Parley left', { n: F(book.end) })}` : '',
		qp.count ? `📜 ${qp.count === 1 ? T('<b>{n}</b> quest', { n: qp.count }) : T('<b>{n}</b> quests', { n: qp.count })}` : '',
		peak.state === 'heavy' || peak.state === 'dead' ? `<b class="warn">${T('too heavy')}</b>` : peak.state === 'over' ? `<b class="amber">${T('over the limit')}</b>` : ''
	]) : '';
	// What each way of sailing would come to for these same chains.
	const presetFigs = new Map(chosen.length ? SAIL_PRESETS.map(p => {
		const oo = { ...o, ...p.orders };
		const run = chainRun({ ...opts, pace: oo.pace, orders: oo, chosen });
		const lg = legsOf(run.stops);
		const big = coining ? (run.coins ? `${F(withBonus(run.coins, countBonus(prof.barterCount).pct))}+` : '—') : stocking ? (() => { const g = stockGains(run, stock); return g.total ? `+${F(g.total)}` : '—'; })() : run.silver ? FC(Math.round(run.net)) : '—';
		const calls = run.stops.filter(x => x.wharf).length;
		return [p.id, { big, sub: `${lg.total ? `≈ ${esc(lg.time)}` : T('no way')} · ${run.trades === 1 ? T('{n} trade', { n: F(run.trades) }) : T('{n} trades', { n: F(run.trades) })}${calls ? ` · ${calls === 1 ? T('{n} wharf call', { n: calls }) : T('{n} wharf calls', { n: calls })}` : ''}` }];
	}) : []);
	const runFigures = `<div class="run-as-ticked"><div class="plan-sub-head"><b>${T('The run')}</b><span>${chosen.length === 1 ? T('{n} chain ticked', { n: chosen.length }) : T('{n} chains ticked', { n: chosen.length })} · ${T('aboard {ship}: the limit is {lt} LT', { ship: esc(gameName(me.name)), lt: F(peak.limit) })}${peak.aboard ? `, ${T('{n} of it {what}', { n: F(peak.aboard), what: said(aboardWhat(peak)) })}` : ''}, ${T('barters to {n}', { n: F(peak.deal) })} · ${T('goods counted at the least, weighed at the most')}</span></div>${tiles}${notice}</div>`;
	const worthSaid = coining ? (plan.coins ? T('{n} coins', { n: coinRange(purse.min, purse.max) }) : '') : stocking ? (gains.total ? `+${F(gains.total)}` : '') : plan.silver ? FC(Math.round(plan.net)) : '';
	const chainsSummary = chosen.length
		? [chosen.length === 1 ? T('{n} chain ticked', { n: chosen.length }) : T('{n} chains ticked', { n: chosen.length }), worthSaid, plan.stops.length === 1 ? T('{n} stop', { n: plan.stops.length }) : T('{n} stops', { n: plan.stops.length })].filter(Boolean).join(' · ')
		: proposed.working ? T('working out the runs…') : T('nothing ticked yet');
	// The wharf: the hold as it stands, what has to come aboard before
	// the lines are let go, what the run leaves behind it, and the route
	// stop by stop for whoever wants to read it before sailing it.
	const firstOver = plan.stops.findIndex(x => ['over', 'heavy', 'dead'].includes(shownHold(me.hold, x.weightAfter).state));
	const overNote = firstOver >= 0 && !heavy ? `<div class="barter-shut hold-over"><b>${T('The hold passes its limit at stop {n}', { n: firstOver + 1 })}</b> — ${T('it reaches {text}: sailing slower, still trading.', { text: esc(peak.text) })}${wharfs ? ` ${wharfs === 1 ? T('{n} wharf call is in the run to leave goods on the way.', { n: wharfs }) : T('{n} wharf calls are in the run to leave goods on the way.', { n: wharfs })}` : ''}</div>` : '';
	const routeFold = plan.stops.length ? `<details class="panel route-fold"${sailing() ? '' : ' open'}><summary><b>${T('The route, stop by stop')}</b><span class="panel-sub">${plan.stops.length === 1 ? T('{n} stop', { n: plan.stops.length }) : T('{n} stops', { n: plan.stops.length })}${legs.total ? ` · ${esc(fmtDistance(legs.total))} · ≈ ${esc(legs.time)}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}</span>${questsLine(qp, o.quests)}<span class="panel-spacer"></span>${chartButton(plan.stops, '')}</summary>${segs}</details>` : '';
	const empty = chosen.length ? '' : `<div class="run-empty">${T('Nothing ticked. Tick a chain and the run lays itself out here — every rung, the hold after it, and where it has to call.')}</div>`;
	const load = `${notice}${overNote}${empty}${packingHTML(plan, from, chosen)}${afterShelfHTML(plan, from)}${questsPanels(qp, from)}${routeFold}${kept}`;
	return {
		secs: [
			['ladder', T('Where today ends'), esc(goalLine(o)), ladderHTML(o, { fits: all.length, tickedN: chosen.length })],
			['how', T('How to sail it'), esc(howLine(o)), howHTML(o, presetFigs)],
			['chains', T('Chains on offer'), esc(chainsSummary), `${chainsBody}${chosen.length ? runFigures : ''}`]
		],
		load, dock: foot, packLT: packingLT(plan, from, chosen), things: packingCount(plan, from, chosen), stops: plan.stops.length, time: legs.time || ''
	};
}

/**
 * The run for a material, in the silver run's two panels: the ladder
 * on the left -- every rung from the shore to the material, with what
 * is aboard against what each hands over -- and the run on the right:
 * its choices, its figures, the stops rung by rung as a timeline.
 */
/** Today's material list, as answered; lapses with the barter day. */
function matBoardNow() {
	if (matBoard.day !== barterKey()) { matBoard = { day: barterKey(), answers: [] }; persist(); }
	return matBoard;
}

/**
 * What the recorded material boards say about one island's exchange:
 * on how many of them it showed, out of how many recorded.
 */
function matSeenOn(npcId, give, recv) {
	if (!matBoards || !matBoards.boards) return null;
	const n = matBoards.boards.filter(b => b.offers.some(o => o[0] === npcId && o[1] === give && o[3] === recv)).length;
	return { n, of: matBoards.boards.length };
}

// The material list's filters, for the session.
let matQ = '', matOnly = '', matLv = 0;

/** What is held of a good for the run: aboard, and at the start
 *  harbour's storage; and elsewhere, which is not sailed with. */
function heldOf(name) {
	const aboard = aboardStock()[name] || 0;
	const dock = dockStock()[name] || 0;
	const total = store.getStock(name) || 0;
	return { aboard, dock, run: aboard + dock, elsewhere: Math.max(0, total - aboard - dock) };
}

/**
 * The strip across the top of the material list: one tile for every
 * material on today's run -- each an island is ticked as showing, and
 * the one chosen -- in the order they came, with its want and its
 * ticks. The chosen one is lit; tapping it again puts it down, so
 * nothing is chosen and the run is only what is ticked. A tile with
 * ticks has a cross that unticks them all, which takes the material
 * off the run.
 */
function matStripHTML(mats, it) {
	const mb = matBoardNow();
	const tiles = mats.map(m => {
		const k = mb.answers.filter(a => a.recv === m.it).length;
		const on = m.it === it;
		return `<span class="mat-tile${on ? ' active' : ''}">
			<button class="mat-tile-main" data-act="barter-mat-pick" data-item="${esc(m.it)}" title="${esc(gameName(m.it))}: ${k === 1 ? T('{n} island ticked', { n: k }) : T('{n} islands ticked', { n: k })} · ${T('{n} wanted', { n: F(m.qty) })}${on ? ` · ${T('tap again to put it down')}` : ''}" aria-pressed="${on}">${img(m.it, 'row-icon md')}<span class="mat-tile-text"><span class="mat-tile-name">${esc(gameName(m.it))}</span><span class="mat-tile-sub"><span>${T('{n} wanted', { n: F(m.qty) })}</span><span class="mat-tile-tick${k ? ' some' : ''}">${k ? T('{n} ticked', { n: k }) : T('none ticked')}</span></span></span></button>
			${k ? `<button class="mat-tile-x" data-act="barter-mat-drop" data-item="${esc(m.it)}" title="${k === 1 ? T('Untick its {n} island: the run no longer sails for {name}', { n: k, name: esc(gameName(m.it)) }) : T('Untick its {n} islands: the run no longer sails for {name}', { n: k, name: esc(gameName(m.it)) })}" aria-label="${T('Take {name} off the run', { name: esc(gameName(m.it)) })}">×</button>` : ''}
		</span>`;
	}).join('');
	return `<div class="mat-strip">
		${tiles}
		<button class="mat-tile add" data-act="barter-mat-add" title="${T('Tick islands for another material too: one run sails for all of them')}">+ ${mats.length ? T('another material') : T('a material')}</button>
		<span class="panel-spacer"></span>
		${mb.answers.length ? `<button class="linky faint" data-act="barter-mat-clear">${T('clear the day')}</button>` : ''}
	</div>`;
}

/**
 * The material list for one material -- the main way a material is
 * planned. Every island that can deal it, by what it takes, each a
 * tick for "showing today"; an island shows one material exchange a
 * refresh, so a tick for one exchange is that island's answer. What is
 * held of each give is on the group, since that is the whole question
 * here: the climb to a give is the item board's business.
 */
function matListHTML(it, data, { short = 0, boards = 0 } = {}) {
	const mb = matBoardNow();
	const barters = barterProfile().barterCount;
	const rows = exchanges(data).filter(x => x.item === it && npcById.has(x.npcId));
	if (!rows.length) return '';
	const byGive = new Map();
	for (const x of rows) { if (!byGive.has(x.give)) byGive.set(x.give, []); byGive.get(x.give).push(x); }
	const ticked = (npcId, give) => mb.answers.some(a => a.npcId === npcId && a.give === give && a.recv === it);
	const elsewhere = npcId => mb.answers.find(a => a.npcId === npcId && !(a.recv === it));
	const q = matQ.trim().toLowerCase();
	const lvs = [...new Set(rows.map(x => levelOf(x.give) || 0))].sort((a, b) => a - b);
	const badge = lv => `<i class="tier-badge" style="--tier:${TIER(lv || 1)}">${lv ? `L${lv}` : '·'}</i>`;
	const groups = [...byGive]
		.map(([give, xs]) => ({ give, xs, held: heldOf(give), any: xs.some(x => ticked(x.npcId, give)) }))
		.filter(g => (!matLv || (levelOf(g.give) || 0) === matLv)
			&& (matOnly !== 'held' || g.held.run > 0 || g.held.elsewhere > 0)
			&& (matOnly !== 'today' || g.any)
			&& (!q || g.give.toLowerCase().includes(q) || g.xs.some(x => { const n = npcById.get(x.npcId); return n.at.toLowerCase().includes(q) || n.name.toLowerCase().includes(q); })))
		.sort((a, b) => Number(b.any) - Number(a.any) || Number(b.held.run > 0) - Number(a.held.run > 0) || (b.xs[0].recv / b.xs[0].giveN) - (a.xs[0].recv / a.xs[0].giveN) || a.give.localeCompare(b.give))
		.map(({ give, xs, held, any }) => {
			const lv = levelOf(give);
			const chips = xs
				.filter(x => !q || give.toLowerCase().includes(q) || npcById.get(x.npcId).at.toLowerCase().includes(q) || npcById.get(x.npcId).name.toLowerCase().includes(q))
				.sort((a, b) => Number(ticked(b.npcId, give)) - Number(ticked(a.npcId, give)) || isleOf(npcById.get(a.npcId)).localeCompare(isleOf(npcById.get(b.npcId))))
				.map(x => {
					const on = ticked(x.npcId, give);
					const other = elsewhere(x.npcId);
					const seen = matSeenOn(x.npcId, give, it);
					const npc = npcById.get(x.npcId);
					// An island the barter count has not opened is shown
					// rather than hidden -- it is where this material is
					// dealt, and worth knowing -- but it cannot be ticked
					// and it says what opens it.
					const gate = npcGate(x.npcId);
					if (!npcOpen(x.npcId, barters)) {
						return `<button class="chip mat-isle shut" disabled title="${esc(gameName(npc.at))} — ${esc(gameName(npc.name))} · ${T('opens at {barters} Total Barters, {short} more', { barters: F(gate), short: F(gate - barters) })}">🔒 ${esc(isleShort(npc))}<span class="mat-isle-who">${F(gate)}</span></button>`;
					}
					return `<button class="chip mat-isle${on ? ' active' : ''}${other ? ' other' : ''}" data-act="barter-mat-tick" data-npc="${x.npcId}" data-give="${esc(give)}" title="${esc(gameName(npc.at))} — ${esc(gameName(npc.name))}${other ? ` · ${T('today it shows {give} → {recv}', { give: gameName(other.give), recv: gameName(other.recv) })}` : ''}${seen && seen.of ? ` · ${T('showed this on {n} of {of} recorded boards', { n: seen.n, of: seen.of })}` : ''}">${on ? '✓ ' : ''}${esc(isleShort(npc))}<span class="mat-isle-who">${esc(gameName(whoOf(npc)))}</span>${seen && seen.of ? `<span class="mat-isle-seen${seen.n ? ' some' : ''}">${seen.n}/${seen.of}</span>` : ''}</button>`;
				}).join('');
			const have = held.run > 0
				? `<span class="mat-held ok">${T('{n} held', { n: F(held.run) })}${held.dock ? ` · ${T('{n} at the harbour', { n: F(held.dock) })}` : ''}${held.elsewhere ? ` · ${T('{n} elsewhere', { n: F(held.elsewhere) })}` : ''}</span>`
				: held.elsewhere
					? `<span class="mat-held">${T('{n} elsewhere, none aboard', { n: F(held.elsewhere) })}</span>`
					: `<span class="mat-held none">${T('none held')}</span>${any ? `<button class="linky mat-board-link" data-act="barter-reach" data-item="${esc(give)}" title="${T('Show the item board\'s chains that reach it')}">${T('item board')} →</button>` : ''}`;
			const on = xs.filter(x => ticked(x.npcId, give)).length;
			return `<div class="mat-give${any ? ' on' : ''}" style="--tier:${TIER(lv || 1)}">
				<div class="mat-give-left">
					<div class="mat-give-head">${badge(lv)}${img(give, 'row-icon sm')}<b title="${esc(gameName(give))}">${xs[0].giveText !== '1' ? `${esc(xs[0].giveText)}× ` : ''}${esc(lv ? give.replace(/^\[Level \d\]\s*/, '') : give)}</b><span class="run-arrow">→</span><b class="mat-get">${esc(xs[0].recvText)}×</b></div>
					<div class="mat-give-meta">${have}<span class="faint">${T('{n} of {of} ticked', { n: on || 0, of: xs.length })}</span></div>
				</div>
				<div class="chips mat-isles">${chips}</div>
			</div>`;
		}).join('');
	const n = mb.answers.filter(a => a.recv === it).length;
	const filters = `<div class="chain-filters mat-filters">
		<input class="field hold-q" type="search" placeholder="${T('Find an island, a barterer or a give…')}" value="${esc(matQ)}" data-act="barter-mat-q" aria-label="${T('Find in the material list')}">
		<button class="chip tiny${matOnly === 'today' ? ' active' : ''}" data-act="barter-mat-only" data-id="today" title="${T('Only the islands ticked as showing it today')}">${T('showing today')}</button>
		<button class="chip tiny${matOnly === 'held' ? ' active' : ''}" data-act="barter-mat-only" data-id="held" title="${T('Only the exchanges whose give you hold')}">${T('I hold the give')}</button>
		<span class="mat-filters-rule"></span>
		${lvs.map(l => `<button class="chip tiny lvl${matLv === l ? ' active' : ''}" data-act="barter-mat-lv" data-lv="${l}" style="--tier:${TIER(l || 1)}" title="${l ? T('Gives of Level {lv}', { lv: l }) : T('Land goods')}">${l || '·'}</button>`).join('')}
		${q || matOnly || matLv ? `<button class="linky faint mat-filters-clear" data-act="barter-mat-filters-clear">${T('clear')}</button>` : ''}
	</div>`;
	const isles = new Set(rows.map(x => x.npcId)).size;
	const allN = mb.answers.length;
	const kinds = new Set(mb.answers.map(a => a.recv)).size;
	// The material, what the day says of it, and the want: the head of
	// the list. Its name opens the picker, for a material not yet
	// ticked anywhere.
	const head = `<div class="mat-head">
		${img(it, 'row-icon mat-head-icon')}
		<div class="mat-head-text">
			<button class="mat-head-name" data-act="barter-item" title="${T('Choose the material')}">${esc(gameName(it))} <span class="caret">▾</span></button>
			<div class="mat-head-sub">${n ? (isles === 1 ? T('<b>{n}</b> of {of} island that can deal it ticked', { n, of: isles }) : T('<b>{n}</b> of {of} islands that can deal it ticked', { n, of: isles })) : `${isles === 1 ? T('{n} island can deal it', { n: isles }) : T('{n} islands can deal it', { n: isles })}, ${byGive.size === 1 ? T('for {n} give', { n: byGive.size }) : T('for {n} gives', { n: byGive.size })} · ${T('tick the ones showing it today')}`}${kinds > 1 ? ` · ${T('{n} in all, for {kinds} materials', { n: allN, kinds })}` : ''}${boards ? ` · ${T('{n} boards recorded; an island’s n/m is how many showed this', { n: boards })}` : ''}</div>
		</div>
		<label class="mat-want"><span class="run-pick-k">${T('wanted')}</span>${amountInput('purse-inline', qty, `data-act="barter-qty" aria-label="${T('How many')}"`)}</label>
		${short ? `<button class="chip mat-short" data-act="barter-qty-short" data-n="${Math.ceil(short)}" title="${T('Set wanted to what your builds are still short of')}">${T('short {n}', { n: F(Math.ceil(short)) })}</button>` : ''}
	</div>`;
	return `${head}${filters}<div class="mat-gives">${groups || `<p class="empty">${T('No give on today’s boards matches these filters.')}</p>`}</div>`;
}

/**
 * The run for a material: the material list across the page -- the
 * main way, since that is what the game shows -- and under it the
 * run along the islands ticked: what it is for and how it is sailed,
 * what each material comes to against its want, the run in figures,
 * what to have before casting off and what to get first, the stops as
 * one timeline, and the bar that sails it.
 */
function materialParts(me, data) {
	const it = itemNow();
	const from = fromPort();
	const mats = matsToday();
	if (!it && !materials().length) {
		return { secs: [['ladder', T('What today is for'), T('for a material'), `<div class="ladder-head">${goalChips()}</div><p class="empty">${T('The barter table deals no material the app knows.')}</p>`]], load: '', dock: '', things: { all: 0, done: 0 }, stops: 0, time: '' };
	}
	const short = it ? (snapshot && snapshot.missing && Number(snapshot.missing[it])) || 0 : 0;
	const showing = matBoardNow().answers;
	const listPanel = `<div class="ladder-head">${goalChips()}</div><section class="barter-chains mat-list hero">
		${matStripHTML(mats, it)}
		${it ? matListHTML(it, data, { short, boards: matBoards && matBoards.boards ? matBoards.boards.length : 0 }) : `<div class="mat-pick-hint">${mats.length ? T('No material is open. Tap one above to tick its islands, or add another; the run below sails for every one ticked.') : T('Nothing on the run yet. Add a material and tick the islands showing it today.')}</div>`}
	</section>`;
	const rows = exchanges(data).filter(x => npcById.has(x.npcId));
	// A tick kept from before a save was moved, or from before the
	// gate was known, is not a stop: the run only calls where the
	// barter count says it may.
	const picks = showing.map(a => rows.find(x => x.npcId === a.npcId && x.give === a.give && x.item === a.recv))
		.filter(x => x && npcOpen(x.npcId, barterProfile().barterCount));
	const plan = materialRun({
		picks, wants: new Map(mats.map(m => [m.it, m.qty])), reach: matOrders.reach, pace: matOrders.pace, calls: matOrders.calls,
		stock: aboardStock(), dock: dockStock(), stores: storesElsewhere(), bags: bagsNow(),
		prices: landPrices([...new Set(picks.map(x => x.give).filter(g => levelOf(g) === null))], store.getProfile('homemade', []) || []),
		hold: me.hold, start: from, startWharf: from ? stashes.find(w => w.at === from.name) || null : null, npcById
	});
	for (const s of plan.stops) s.hold = me.hold;
	const qp = questPlan(plan.stops, matOrders.quests, me.hold, plan.weightStart);
	plan.stops = qp.stops;
	plan.questsHome = qp.home;
	shownPlan = plan.stops.length ? { stops: plan.stops, cost: plan.cost, bought: plan.bought || [], parleyUsed: 0, questsHome: qp.home } : null;
	const legs = legsOf(plan.stops);
	// What is short splits two ways: some of it may sit in a storage the
	// run cannot load from -- to bring to the harbour first -- and the
	// rest is not held at all, to climb for on the item board.
	const shortRows = plan.missing.map(m => { const there = m.heldAt.reduce((a, h) => a + h.n, 0); return { ...m, bring: Math.min(m.n, there), climb: Math.max(0, m.n - there) }; });
	const toBring = shortRows.filter(m => m.bring > 0);
	const toClimb = shortRows.filter(m => m.climb > 0);
	const coin = mats.some(m => m.it === 'Crow Coin') ? coinWorth() : null;
	const gotText = m => { const g = plan.got.get(m.it); return g.min === g.max ? F(g.min) : `${F(g.min)}–${F(g.max)}`; };
	const portSel = `<label class="run-pick"><span class="run-pick-k">${T('from')}</span><select class="field select" data-act="barter-port">${[[0, T('the first stop')], ...ports.map(p => [p.id, gameName(p.name)])].map(([v, t]) => `<option value="${esc(String(v))}"${String(v) === String(port) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
	// The head: what the run is for, each material with its want, and
	// where it sails from.
	const forChips = mats.length
		? `<div class="mat-run-for">${mats.map(m => `<span class="mat-for${m.it === it ? ' active' : ''}" title="${esc(gameName(m.it))}: ${T('{n} wanted', { n: F(m.qty) })}${coin && m.it === 'Crow Coin' ? ` · ${T('worth ≈ {silver} at the coin shop’s best rate', { silver: FC(Math.round(coin.each * m.qty)) })}` : ''}">${img(m.it, 'row-icon sm')}<b>${F(m.qty)}×</b><span>${esc(gameName(m.it))}</span></span>`).join('')}</div>`
		: `<span class="panel-sub">${T('for the materials ticked')}</span>`;
	const head = `<div class="run-head mat-run-head">${forChips}${portSel}</div>`;
	// The orders a material run takes: how far it goes, how it treats
	// the hold, and whether it puts in at a harbour for a give kept
	// there.
	const ordersRow = `<div class="mat-orders">
		<label class="mat-order" title="${T('Home once every want is met, or every island ticked dealt as many times as its gives allow')}"><span class="run-pick-k">${T('sail for')}</span>
			<select class="purse-inline" data-act="barter-mat-reach">
				<option value="want"${matOrders.reach === 'want' ? ' selected' : ''}>${T('the wants, then home')}</option>
				<option value="all"${matOrders.reach === 'all' ? ' selected' : ''}>${T('every island ticked')}</option>
			</select>
		</label>
		<label class="mat-order" title="${T('Full: every give ticked, in as many departures as the hold needs, what the run will not spend left in storage. Fast: one departure under the limit the ship still sails at full speed at; what does not fit stays ashore')}"><span class="run-pick-k">${T('pace')}</span>
			<select class="purse-inline" data-act="barter-mat-pace">
				<option value="full"${matOrders.pace === 'full' ? ' selected' : ''}>${T('full')}</option>
				<option value="fast"${matOrders.pace === 'fast' ? ' selected' : ''}>${T('fast')}</option>
			</select>
		</label>
		<label class="inline-check mat-order" title="${T('Put in at another harbour on the way for a give kept in its storage')}"><input type="checkbox" data-act="barter-mat-calls"${matOrders.calls ? ' checked' : ''}> ${T('harbour calls for a give kept there')}</label>
		<label class="mat-order" title="${T('The dailies and weeklies already taken, handed in where the run passes their taker or at a stop put in a short way off the route; the hunts only when their grounds lie on the way')}"><span class="run-pick-k">${T('quests')}</span>
			<select class="purse-inline" data-act="barter-mat-quests">${QUEST_CHOICES.map(([v, t]) => `<option value="${v}"${matOrders.quests === v ? ' selected' : ''}>${esc(said(t))}</option>`).join('')}</select>
		</label>
	</div>`;
	// What the run comes to: each material against its want, as a bar;
	// then the run in figures, each with its sign.
	const yieldRows = mats.map(m => {
		const g = plan.got.get(m.it), w = plan.waits.get(m.it);
		const pct = m.qty > 0 ? Math.min(100, g.min / m.qty * 100) : 0;
		const pctMax = m.qty > 0 ? Math.min(100, g.max / m.qty * 100) : 0;
		const state = g.max <= 0 ? 'none' : w <= 0 ? 'met' : 'part';
		return `<div class="mat-yield-row ${state}">${img(m.it, 'row-icon sm')}<span class="mat-yield-name">${esc(gameName(m.it))}</span><b class="mat-yield-n">${g.max > 0 ? gotText(m) : '0'}<small> ${T('of {n}', { n: F(m.qty) })}</small></b><span class="mat-yield-bar"><i style="width:${pctMax.toFixed(1)}%"></i><i class="least" style="width:${pct.toFixed(1)}%"></i></span><span class="mat-yield-note">${state === 'met' ? T('the want is met') : state === 'none' ? (showing.some(a => a.recv === m.it) ? T('nothing comes of it today') : T('no island ticked')) : T('{n} still wanted · another refresh', { n: F(Math.ceil(w)) })}</span></div>`;
	}).join('');
	const peakM = shownHold(me.hold, plan.weightPeak);
	const holdCls = peakM.state === 'heavy' || peakM.state === 'dead' ? 'warn' : peakM.state === 'over' ? 'amber' : 'ok';
	const fig = (icon, v, sub, cls = '') => `<span class="mat-fig${cls ? ` ${cls}` : ''}"><i>${icon}</i><span class="mat-fig-text"><b>${v}</b>${sub ? `<small>${sub}</small>` : ''}</span></span>`;
	const figs = plan.stops.length ? `<div class="mat-figs">
		${fig('⛵', plan.islands === 1 ? T('{n} island', { n: plan.islands }) : T('{n} islands', { n: plan.islands }), plan.trades === 1 ? T('{n} trade', { n: plan.trades }) : T('{n} trades', { n: plan.trades }))}
		${plan.calls ? fig('⚓', plan.calls === 1 ? T('{n} harbour call', { n: plan.calls }) : T('{n} harbour calls', { n: plan.calls }), plan.returns ? T('{n} departures: the hold cannot carry every give at once', { n: plan.returns + 1 }) : T('to load from storage')) : ''}
		${fig('⚖', esc(peakM.text), `${T('at its fullest')} · ${holdCls === 'ok' ? T('under the limit') : holdCls === 'amber' ? T('over the limit: sailing slower') : T('over {n}: too heavy to barter', { n: F(peakM.deal) })}`, holdCls)}
		${legs.total ? fig('⏱', esc(legs.time), `${T('{dist} at {speed}%', { dist: esc(fmtDistance(legs.total)), speed: me.speed.total })}${from ? ` ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}`) : ''}
		${plan.cost ? fig(img(SILVER, 'row-icon xs'), FC(plan.cost), T('to buy ashore first')) : ''}
	</div>` : '';
	const summary = plan.ticked ? `<div class="mat-summary">${yieldRows ? `<div class="mat-yield">${yieldRows}</div>` : ''}${figs}</div>` : '';
	// A row of a goods list: the tier, the icon, the count, the name,
	// the note, and what can be done about it.
	const good = (name, n, note, act = '') => { const lv = levelOf(name); return `<div class="run-good mat-good"><i style="--tier:${TIER(lv || 1)}">${lv ? `L${lv}` : '·'}</i>${img(name, 'row-icon sm')}<b>${F(Math.ceil(n))}×</b><span>${esc(gameName(name))}</span><span class="faint">${note}</span>${copyName(name)}${act ? `<span class="run-good-worth">${act}</span>` : ''}</div>`; };
	// Before casting off: the land goods to buy ashore, and the gives
	// held in a storage the run cannot load from, to be brought to the
	// harbour first. What the harbour's own storage lends is the first
	// stop, so it is not repeated here.
	// At the Market, and how many it has: a run buys no more than are
	// listed, so the figure is the room there is, not a warning -- until
	// it is nearly all of it.
	const howBought = b => (b.how === 'fixed' ? T('from a storage keeper, for silver')
		: b.how === 'market' ? (b.stock === null || b.stock === undefined
			? T('at the Market')
			: Math.ceil(b.n) >= b.stock ? T('at the Market · {n} listed — all of them', { n: F(b.stock) }) : T('at the Market · {n} listed', { n: F(b.stock) }))
			: b.how === 'made' ? T('your workers make it') : T('no price known'));
	const before = plan.bought.length || toBring.length ? `<section class="panel run-list amber mat-goods"><div class="panel-head"><h2 class="panel-title">${T('Before casting off')}</h2><span class="panel-sub">${T('what the run hands over that is not aboard yet')}${plan.cost ? ` · ${T('{silver} to buy', { silver: FC(plan.cost) })}` : ''}</span></div>
		${plan.bought.map(b => good(b.item, b.n, `${T('buy ashore')} · ${howBought(b)}${b.total ? ` · ${FC(b.total)}` : ''} · ${T('for {isles}', { isles: esc([...new Set(plan.stops.filter(x => x.npcId && x.give === b.item).map(x => isleShort(npcById.get(x.npcId))))].join(', ')) })}`)).join('')}
		${toBring.map(m => good(m.give, m.bring, `${T('at {where}', { where: esc(m.heldAt.map(h => `${gameName(h.town)} (${F(h.n)})`).join(', ')) })} · ${T('bring it to {where} first', { where: from ? esc(T('{port}’s storage', { port: gameName(from.name) })) : T('the harbour the run sails from') })}${matOrders.calls ? '' : `, ${T('or let the run call there')}`} · ${T('for {isles}', { isles: esc(m.islands.map(n => isleShort(n)).join(', ')) })}`)).join('')}
	</section>` : '';
	// To get first: what the run assumed got before casting off, since
	// none is held anywhere. The route is laid out with it all the same,
	// so the sailor sees what the day would bring and what it takes.
	const missing = toClimb.length ? `<section class="panel run-list orange mat-goods"><div class="panel-head"><h2 class="panel-title">${T('To get first')}</h2><span class="panel-sub">${T('none is held anywhere · the run below is laid out as if it were')}${from ? `, ${T('in {port}’s storage', { port: esc(gameName(from.name)) })}` : `, ${T('aboard')}`}</span></div>
		${toClimb.map(m => good(m.give, m.climb, `${T('for {isles}', { isles: esc(m.islands.map(n => isleShort(n)).join(', ')) })} · ${m.kind === 'good' ? T('the item board climbs for it') : m.kind === 'land' ? T('a land good, bought ashore') : T('a ship material the table deals: tick islands for it too')}`, m.kind === 'good' ? `<button class="chip primary" data-act="barter-reach" data-item="${esc(m.give)}" title="${T('Switch to the item board and show the chains that reach it today')}">${T('item board')} →</button>` : m.kind === 'material' && materials().some(x => x.name === m.give) ? `<button class="chip" data-act="barter-mat-go" data-item="${esc(m.give)}" title="${T('Tick the islands showing it today')}">${T('tick it')} →</button>` : '')).join('')}
	</section>` : '';
	// Gives held that the run could not take aboard: on a fast run, the
	// full pace would go back for them; on a full run, one island asks
	// more than the hold barters under.
	const ashore = plan.noRoom.length ? `<section class="panel run-list amber mat-goods"><div class="panel-head"><h2 class="panel-title">${T('Stays ashore')}</h2><span class="panel-sub">${matOrders.pace === 'fast' ? T('held, but one departure under the limit cannot carry it all') : T('held, but more than the hold barters under, even alone')}</span>${matOrders.pace === 'fast' ? `<span class="panel-spacer"></span><button class="chip tiny primary" data-act="barter-mat-pace-set" data-id="full" title="${T('Sail in as many departures as the hold needs')}">${T('sail the full run')} →</button>` : ''}</div>
		${plan.noRoom.map(m => good(m.give, m.n, `${T('for {isles}', { isles: esc(m.islands.map(n => isleShort(n)).join(', ')) })} · ${T('{n} LT', { n: F(Math.round(m.n * weightOf(m.give))) })}`)).join('')}
	</section>` : '';
	// The stops as one timeline, since the order runs across the
	// materials: the shortest way through every island ticked, whatever
	// each deals, with a harbour call where a give is loaded and a
	// return to it when the hold could not carry everything at once.
	// The head says what comes of it for each material against its want.
	const got = mats.filter(m => plan.got.get(m.it).max > 0);
	const segs = plan.stops.length ? `<section class="panel run-seg mat-seg" style="--tier:${TIER(6)}">
		<div class="run-seg-head"><span class="mat-seg-icons">${(got.length ? got : mats.slice(0, 1)).map(m => img(m.it, 'row-icon xs')).join('')}</span><b>${esc((got.length ? got : mats.slice(0, 1)).map(m => gameName(m.it)).join(', '))}</b><span>${plan.islands === 1 ? T('{n} island', { n: plan.islands }) : T('{n} islands', { n: plan.islands })} · ${plan.trades === 1 ? T('{n} trade', { n: plan.trades }) : T('{n} trades', { n: plan.trades })}${plan.calls ? ` · ${plan.calls === 1 ? T('{n} harbour call', { n: plan.calls }) : T('{n} harbour calls', { n: plan.calls })}` : ''}${plan.returns ? ` · ${T('{n} departures', { n: plan.returns + 1 })}` : ''}</span>${mats.map(m => { const g = plan.got.get(m.it); return `<em class="mat-got${g.min >= m.qty ? ' met' : ''}" title="${esc(gameName(m.it))}: ${T('{got} of the {want} wanted', { got: gotText(m), want: F(m.qty) })}">${T('{got} of {want}', { got: gotText(m), want: F(m.qty) })}</em>`; }).join('')}</div>
		<div class="run-stops">${stopRows(plan.stops, legs, { sailing: sailing(), notes: qp })}</div>
	</section>` : '';
	const empty = !plan.ticked
		? `<div class="run-empty">${it ? T('Nothing ticked. Open the barter window in game and tap each island of the list that shows <b>{name}</b> today — the run lays itself out here.', { name: esc(gameName(it)) }) : T('Nothing ticked. Open a material and tap each island showing it today — the run lays itself out here.')}</div>`
		: !plan.stops.length ? `<div class="run-empty">${T('The islands ticked deal nothing today.')}</div>` : '';
	const foot = plan.ticked ? runDockHTML([
		...mats.map(m => { const g = plan.got.get(m.it); return `${img(m.it, 'row-icon xs')}${T('{got} of {want}', { got: `<b class="${g.min >= m.qty ? 'teal' : ''}">${g.max > 0 ? gotText(m) : '0'}</b>`, want: F(m.qty) })}`; }),
		plan.stops.length ? `${plan.islands === 1 ? T('<b>{n}</b> island', { n: plan.islands }) : T('<b>{n}</b> islands', { n: plan.islands })}${plan.calls ? `, ${plan.calls === 1 ? T('{n} call', { n: plan.calls }) : T('{n} calls', { n: plan.calls })}` : ''}` : '',
		legs.total ? `≈ <b>${esc(legs.time)}</b>` : '',
		qp.count ? `📜 ${qp.count === 1 ? T('<b>{n}</b> quest', { n: qp.count }) : T('<b>{n}</b> quests', { n: qp.count })}` : '',
		holdCls === 'warn' ? `<b class="warn">${T('too heavy')}</b>` : holdCls === 'amber' ? `<b class="amber">${T('over the limit')}</b>` : ''
	]) : '';
	const routeFold = plan.stops.length ? `<details class="panel route-fold"${sailing() ? '' : ' open'}><summary><b>${T('The route, stop by stop')}</b><span class="panel-sub">${mats.length ? T('for {materials}', { materials: esc(mats.map(m => gameName(m.it)).join(', ')) }) : T('for a material')}${legs.total ? ` · ≈ ${esc(legs.time)}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}</span>${questsLine(qp, matOrders.quests)}<span class="panel-spacer"></span>${chartButton(plan.stops, it || (mats[0] && mats[0].it) || '')}</summary>${segs}</details>` : '';
	const matsSaid = mats.length ? mats.map(m => `${F(m.qty)}× ${gameName(m.it)}`).join(', ') : T('nothing on the run yet');
	const comes = plan.ticked ? mats.map(m => { const g = plan.got.get(m.it); return T('{got} of {want}', { got: g.max > 0 ? gotText(m) : '0', want: F(m.qty) }); }).join(' · ') : T('nothing ticked yet');
	return {
		secs: [
			['ladder', T('What today is for'), esc(matsSaid), `${listPanel}<div class="plan-next"><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="how">${T('OK, that’s the goal')} ›</button></div>`],
			['how', T('How to sail it'), esc([matOrders.pace === 'fast' ? T('fast') : T('full'), matOrders.reach === 'all' ? T('every island ticked') : T('the wants, then home'), from ? T('from {port}', { port: gameName(from.name) }) : ''].filter(Boolean).join(' · ')), `${head}${ordersRow}<div class="plan-next"><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="chains">${T('OK, see what comes of it')} ›</button></div>`],
			['chains', T('What comes of it'), esc(comes), summary || `<p class="empty">${T('Nothing ticked. Open a material and tap each island showing it today — the run lays itself out here.')}</p>`]
		],
		load: `${empty}${before}${missing}${ashore}${questsPanels(qp, from)}${routeFold}`,
		dock: foot, things: { all: plan.bought.length + toBring.length, done: 0 }, stops: plan.stops.length, time: legs.time || ''
	};
}

/**
 * The strip along the foot of the page while something is ticked: the
 * run in a line -- what it comes to, how long, how heavy -- and the
 * button that opens the whole of it over the page. It stays in view as
 * the chains or the islands are ticked above, so the answer is never
 * out of sight and never in the way.
 */
function runDockHTML(figs) {
	return `<div class="run-dock"><span class="run-dock-k">${T('The run')}</span><span class="run-dock-figs">${figs.filter(Boolean).map(f => `<span>${f}</span>`).join('')}</span><button class="act run-dock-open" data-act="barter-step" data-id="load" title="${T('What to have aboard before casting off, and the route stop by stop')}">${T('Load at the wharf')} ›</button></div>`;
}

/* ------------------------------------------------------------------ *
 * the four steps
 * ------------------------------------------------------------------ */

/** The step on screen: the one asked for, else wherever the run is. */
const stepNow = () => step || (sailing() ? 'sail' : 'plan');

/** The Parley the stops done have spent, as the recorder counts it. */
function parleySpentOf(plan, on) {
	const perTrade = parleyOf(barterProfile()).perTrade;
	return Math.round(plan.stops.reduce((a, s, k) => a + (s.npcId && ticked(on.done, s, k, plan.stops) ? (Number(s.parley) > 0 ? Number(s.parley) : (Number(s.times) || 0) * perTrade) : 0), 0));
}

/** The stop the cockpit stands at: the one it was sent to, else the
 *  first not done and not passed over, else the first not done. */
function stopAt(plan, on) {
	const keys = plan.stops.map((s, k) => stopKey(s, k, plan.stops));
	const done = k => ticked(on.done, plan.stops[k], k, plan.stops);
	if (cursor !== null && keys.includes(cursor)) return keys.indexOf(cursor);
	let at = keys.findIndex((key, k) => !done(k) && !skipped.has(key));
	if (at < 0) at = keys.findIndex((key, k) => !done(k));
	return at;
}

/** A stop's place and keeper, as the sheet names them. */
function stopNames(s) {
	const place = s.place || s.wharf || npcById.get(s.npcId);
	return {
		place: s.quest ? gameName(place.name) : s.wharf ? T('{at} wharf', { at: gameName(place.at) }) : gameName(isleOf(place)),
		who: s.quest ? gameName(place.who) : s.wharf ? gameName(place.name) : gameName(whoOf(place)),
		kind: s.wharf ? T('a wharf call') : s.hunt ? T('a hunt on the way') : s.quest ? T('a quest handed in') : s.item === COIN ? T('pays Crow Coins') : T('a barter')
	};
}

/** The four steps across the head of the page, each saying where it is. */
function stepperHTML(parts, now) {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	const doneN = plan ? plan.stops.filter((s, k) => ticked(on.done, s, k, plan.stops)).length : 0;
	const at = plan ? stopAt(plan, on) : -1;
	const order = ['plan', 'load', 'sail', 'results'];
	// The number and the name are their own elements, so a narrow screen
	// can keep the numbers and drop the names from the steps you are not
	// on: four cards with their titles is a screenful of furniture
	// before the page begins.
	const cell = (id, n, k, title, sub) => `<button class="step${now === id ? ' on' : ''}${order.indexOf(id) < order.indexOf(now) ? ' past' : ''}" data-act="barter-step" data-id="${id}" aria-current="${now === id ? 'step' : 'false'}"><span class="step-k"><i>${n}</i><em>${k}</em></span><b>${title}</b><span class="step-sub">${sub}</span></button>`;
	return `<nav class="steps" aria-label="${T('The steps of a run')}">
		${cell('plan', 1, T('Plan'), T('What is today for?'), parts.secs[0][2])}
		${cell('load', 2, T('Load'), T('Pack at the wharf'), parts.stops ? (parts.things.all === 1 ? T('{n} thing to have aboard', { n: parts.things.all }) : T('{n} things to have aboard', { n: parts.things.all })) : T('tick a chain first'))}
		${cell('sail', 3, T('Sail'), T('One stop at a time'), plan ? (at >= 0 ? T('stop {n} of {of}', { n: at + 1, of: plan.stops.length }) : T('every stop ticked')) : parts.stops ? `${parts.stops === 1 ? T('{n} stop', { n: parts.stops }) : T('{n} stops', { n: parts.stops })}${parts.time ? ` · ≈ ${esc(parts.time)}` : ''}` : T('nothing planned yet'))}
		${cell('results', 4, T('Results'), T('What the run did'), plan ? T('{n} of {of} stops done', { n: doneN, of: plan.stops.length }) : lastTrip ? T('recorded') : T('nothing under way'))}
	</nav>`;
}

/** A run under way, said on every step but its own. */
function underWayHTML(now) {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	if (!plan || now === 'sail' || now === 'results') return '';
	const at = stopAt(plan, on);
	// The clock rides along: away from the cockpit it is the one figure
	// about a run under way that changes on its own.
	const t = timerState();
	return `<button class="under-way" data-act="barter-step" data-id="sail"><i></i><b>${T('Run in progress')}</b><span>${at >= 0 ? T('stop {n} of {of}', { n: at + 1, of: plan.stops.length }) : T('every stop ticked')}</span>${t ? `<span class="under-way-clock">⏱ ${esc(spanText(t.ran))}</span>` : ''}<span class="amber">${T('not recorded')}</span><span class="panel-spacer"></span><span class="linky">${T('Back to the run')} ›</span></button>`;
}

/** What the last Record did, until the next run is cast off. */
function recordedHTML() {
	if (!lastTrip || sailing()) return '';
	return `<div class="recorded-strip"><i>✓</i><span>${T('Trip recorded')}${lastTrip.net ? ` · ${T('Silver')} <b class="gold">${lastTrip.net > 0 ? '+' : '−'}${FC(Math.abs(lastTrip.net))}</b>` : ''}${lastTrip.coins ? ` · <b class="gold">+${F(lastTrip.coins)}</b> ${T('coins')}` : ''} · ${T('inventory, storage and Parley moved together.')}</span><span class="panel-spacer"></span><button class="linky" data-act="barter-undo-record">↶ ${T('Undo')}</button><button class="map-x" data-act="barter-recorded-ok" aria-label="${T('Close')}">×</button></div>`;
}

/** The mini bars a stop carries: the hold after it and the Parley. */
function stopBars(s, row) {
	const w = shownHold(s.hold || currentShip().hold, s.weightAfter);
	const bad = w.state === 'heavy' || w.state === 'dead', over = w.state === 'over';
	return { w, bad, over, hold: `<div class="mini-bar"><div><span>${T('hold')}</span><b class="${bad ? 'warn' : over ? 'amber' : ''}">${esc(w.text)}</b></div><div class="run-bar"><i style="width:${w.fill.toFixed(1)}%"></i><i class="over" style="width:${w.extra.toFixed(1)}%"></i><i class="heavy" style="width:${w.worse.toFixed(1)}%"></i></div></div>`,
		parley: row ? `<div class="mini-bar"><div><span>${T('parley')}</span><b class="${row.short ? 'warn' : ''}">${F(row.after)}</b></div><div class="run-bar parley"><i style="width:${Math.min(100, row.pct).toFixed(1)}%"></i></div></div>` : '' };
}

/**
 * The cockpit: one stop, large, with the one thing to press; the stop
 * after it; and the rest of the run down the side, each with its tick.
 * Glance mode is the same stop drawn to be read from across a room,
 * for a sailor who is at the game and only looks over.
 */
function sailHTML() {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	if (!plan) return `<p class="empty step-empty">${T('Nothing is under way. Plan a run, load at the wharf and cast off — the cockpit opens here.')}</p>`;
	const stops = plan.stops;
	const legs = legsOf(stops);
	const book = ledgerOf(stops, legs);
	const notes = { at: k => (stops[k] && stops[k].quests) || [], trades: plan.trades || 0 };
	const wanted = questWanted();
	const made = tradesDone(on, stops);
	const doneN = stops.filter((s, k) => ticked(on.done, s, k, stops)).length;
	const clock = timerHTML({ suggest: legs.mid || 0, label: runLabel(plan), marks: runMarks(plan, legs) });
	const legOf = k => { const m = legs.from ? legs.legs[k] : k > 0 ? legs.legs[k - 1] : null; return m != null ? `${fmtDistance(m)} · ${legs.timeOf(m)}` : ''; };
	const at = stopAt(plan, on);
	const guessed = unsaid(plan, on).length;
	const questsLeft = [...(plan.questsHome || []), ...stops.flatMap(s => s.quests || [])].map(x => x.q).filter(q => !questDone(q)).length;
	const allAsk = sailAll.open ? `<div class="sail-all">
		<span class="sail-all-k">${T('Tick off, all at once')}</span>
		<label class="inline-check"><input type="checkbox" data-act="barter-sail-all-pick" data-id="stops"${sailAll.stops ? ' checked' : ''}> ${T('every stop, {n} still to go', { n: stops.length - doneN })}</label>
		<label class="inline-check"><input type="checkbox" data-act="barter-sail-all-pick" data-id="quests"${sailAll.quests ? ' checked' : ''}${questsLeft ? '' : ' disabled'}> ${T('the quests handed in, {n} still open', { n: questsLeft })}</label>
		<span class="panel-spacer"></span>
		<button class="ghost-btn sm" data-act="barter-sail-all-drop">${T('Cancel')}</button>
		<button class="act" data-act="barter-sail-all-go" title="${T('Every stop ticked, every quest handed in and its reward recorded, in one go')}">${T('Tick them all')}</button>
	</div>` : '';
	const foot = `<div class="sail-bar sailing cockpit-foot">
		<span class="sail-n">${T('<b>{n}</b> of {of} stops done', { n: doneN, of: stops.length })}${questsLeft ? ` · ${questsLeft === 1 ? T('{n} quest open', { n: questsLeft }) : T('{n} quests open', { n: questsLeft })}` : ''}</span>
		${guessed ? `<span class="sail-guess" title="${T('Press the count an island paid on its stop, and the trip is recorded at that instead')}">${guessed === 1 ? T('{n} island’s pay not said', { n: guessed }) : T('{n} islands’ pay not said', { n: guessed })} — ${T('recorded at the middle of the range')}</span>` : ''}
		<span class="panel-spacer"></span>
		<button class="ghost-btn sm" data-act="barter-sail-chart" title="${T('The route on the Map, with the same checklist beside it')}">🗺 ${T('On the chart')}</button>
		<button class="ghost-btn sm" data-act="barter-sail-drop" title="${T('Drop the checklist; nothing is recorded')}">${T('Abandon')}</button>
		${sailAll.open ? '' : `<button class="ghost-btn sm" data-act="barter-sail-all" title="${T('Tick every stop and every quest off at once')}">${T('All done…')}</button>`}
		<button class="act" data-act="barter-step" data-id="results">${T('See the results')} ›</button>
		${allAsk}
	</div>`;
	if (at < 0) {
		return `<div class="all-ticked"><i>✓</i><span><b>${T('Every stop is ticked.')}</b> ${T('The results step shows what the run did and records it.')}</span><button class="act" data-act="barter-step" data-id="results">${T('See the results')} ›</button></div>${restHTML(plan, on, book, legOf, -1)}${foot}`;
	}
	const s = stops[at], key = stopKey(s, at, stops), names = stopNames(s);
	const done = ticked(on.done, s, at, stops);
	const row = book.rows[at], prev = at > 0 ? book.rows[at - 1] : null;
	const bars = stopBars(s, row);
	// The one thing to press. An island that pays two or three is asked
	// which as it is ticked, since the press is the same press; one that
	// pays a wide range has a box to type the window's figure into.
	const lo = Math.ceil(s.recvMin || 0), hi = Math.floor(s.recvMax || 0);
	const fewPays = s.npcId && hi > lo && hi - lo + 1 <= PAID_CHIPS;
	const press = done
		? `<button class="cockpit-go done" data-act="barter-stop-done" data-k="${esc(key)}">✓ ${T('Done')} — ${T('untick')}</button>`
		: fewPays
			? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(n => `<button class="cockpit-go" data-act="barter-paid" data-npc="${s.npcId}" data-n="${n}">${T('Traded · paid {n}', { n })}</button>`).join('')
			: `<button class="cockpit-go" data-act="barter-stop-done" data-k="${esc(key)}">${s.npcId ? T('Traded ×{n}', { n: F(s.times) }) : doneLabel(s)}</button>`;
	const ask = s.npcId && hi > lo
		? (fewPays ? `<p class="cockpit-ask">${T('This island pays <b>{range}</b> a trade. Tap what it paid — the run is then recorded exactly.', { range: esc(s.recvText) })}</p>`
			: `<p class="cockpit-ask">${T('This island pays a range. Type what the window showed:')} ${paidAsk(s, on.seen[s.npcId])} <span class="${on.seen[s.npcId] > 0 ? 'teal' : 'guess'}">${on.seen[s.npcId] > 0 ? T('recorded exactly') : T('else the middle of the range is assumed')}</span></p>`)
		: '';
	const extra = stopAsks(s, at, stops, on, { paid: false });
	const questsHere = notes.at(at).length ? `<div class="run-quests">${notes.at(at).map(x => questChip(x, wanted, notes.trades, made)).join('')}</div>` : '';
	const tierOf = name => (levelOf(name) ? ` style="--tier:${TIER(levelOf(name))}"` : '');
	const trade = s.npcId
		? `<div class="cockpit-trade${glance ? ' big' : ''}">
			<div class="cockpit-good"><span class="cockpit-icon"${tierOf(s.give)}>${img(s.give, 'cockpit-img')}</span><b>${esc(s.giveText)}× ${esc(gameName(s.give))}</b><em>${levelOf(s.give) ? T('Level {lv}', { lv: levelOf(s.give) }) : T('a land good')}</em></div>
			<span class="cockpit-arrow">→</span>
			<div class="cockpit-good get"${tierOf(s.item)}><span class="cockpit-icon"${tierOf(s.item)}>${img(s.item, 'cockpit-img')}</span><b>${esc(s.recvText)}× ${esc(gameName(s.item))}</b><em>${s.item === COIN ? T('coins') : T('Level {lv}', { lv: levelOf(s.item) })}${fourNote(s, true)}</em></div>
			<div class="cockpit-times"><b>×${F(s.times)}</b><span>${T('times')}</span></div>
		</div>`
		: `<div class="cockpit-call">${stopDid(s, true) || `<span class="faint">${names.kind}</span>`}</div>`;
	const figures = `<div class="cockpit-figs">
		<div class="cockpit-fig"><div class="cockpit-fig-k"><span>${T('hold')}</span><span>${bars.w.note || ''}</span></div><div class="cockpit-fig-v"><b class="${bars.bad ? 'warn' : bars.over ? 'amber' : ''}">${esc(bars.w.text)}</b></div><div class="run-bar"><i style="width:${bars.w.fill.toFixed(1)}%"></i><i class="over" style="width:${bars.w.extra.toFixed(1)}%"></i><i class="heavy" style="width:${bars.w.worse.toFixed(1)}%"></i></div></div>
		${row ? `<div class="cockpit-fig"><div class="cockpit-fig-k"><span>${T('parley')}</span><span>${s.npcId && row.spent ? `−${F(row.spent)}` : ''}</span></div><div class="cockpit-fig-v">${prev ? `<span>${F(prev.after)}</span><i>→</i>` : ''}<b class="${row.short ? 'warn' : ''}">${F(row.after)}</b></div><div class="run-bar parley"><i style="width:${Math.min(100, row.pct).toFixed(1)}%"></i></div>${row.voucher ? `<div class="run-note teal">${T('a voucher drawn on here — a quarter of a bar back')}</div>` : ''}${row.short ? `<div class="run-note warn">${T('{n} Parley short', { n: F(row.short) })}</div>` : ''}</div>` : ''}
	</div>`;
	const head = `<div class="panel-head cockpit-head"><h2 class="panel-title">${T('Stop {n} of {of}', { n: at + 1, of: stops.length })}</h2><span class="panel-sub">${esc(legOf(at))}</span><span class="panel-spacer"></span><button class="linky" data-act="barter-glance">${glance ? T('full view') : T('Glance mode')}</button></div>${clock ? `<div class="cockpit-clock">${clock}</div>` : ''}`;
	const under = `<div class="cockpit-under"><button class="linky" data-act="barter-sail-skip" data-k="${esc(key)}">${s.npcId ? T('island didn’t deal — skip it') : T('skip this stop')}</button><span>·</span><button class="linky" data-act="barter-step" data-id="results">${T('stop here, see the results')}</button></div>`;
	const next = stops[at + 1];
	const nextHTML = next ? (() => { const nn = stopNames(next); return `<div class="cockpit-next"><span class="cockpit-next-k">${T('next')}</span><b>${esc(nn.place)}</b><span>${esc(legOf(at + 1))}</span>${next.npcId ? `<span>${esc(next.giveText)}× ${esc(gameName(next.give))} → <span class="tiered" style="--tier:${TIER(levelOf(next.item))}">${esc(next.recvText)}× ${esc(gameName(next.item))}</span> ×${F(next.times)}</span>` : `<span>${nn.kind}</span>`}</div>`; })() : '';
	if (glance) {
		return `<section class="panel cockpit glance">${head}<div class="panel-body">
			<div class="cockpit-place">${esc(names.place)}</div>
			${trade}${figures}${ask}${extra ? `<div class="run-check">${extra}</div>` : ''}
			<div class="cockpit-press">${press}</div>
		</div></section>${foot}`;
	}
	return `<div class="cockpit-grid">
		<div class="cockpit-col">
			<section class="panel cockpit">${head}<div class="panel-body">
				<div><div class="cockpit-place">${esc(names.place)}</div><div class="cockpit-who">${esc(names.who)} · ${names.kind}</div></div>
				${trade}${figures}${ask}${extra ? `<div class="run-check">${extra}</div>` : ''}${questsHere}
				<div class="cockpit-press">${press}</div>
				${under}
			</div></section>
			${nextHTML}
		</div>
		${restHTML(plan, on, book, legOf, at)}
	</div>${foot}`;
}

/** The rest of the run, down the side of the cockpit: every stop with
 *  its tick, what changes hands, and the two bars after it. */
function restHTML(plan, on, book, legOf, at) {
	const stops = plan.stops;
	const doneN = stops.filter((s, k) => ticked(on.done, s, k, stops)).length;
	const rows = stops.map((s, k) => {
		const key = stopKey(s, k, stops), names = stopNames(s), done = ticked(on.done, s, k, stops);
		const bars = stopBars(s, book.rows[k]);
		const what = s.npcId
			? `${img(s.give, 'row-icon xs')}<span>${esc(s.giveText)}× ${esc(gameName(s.give))}</span><span class="faint">→</span>${img(s.item, 'row-icon xs')}<span class="tiered" style="--tier:${TIER(levelOf(s.item))}">${esc(s.recvText)}× ${esc(gameName(s.item))}</span><b>×${F(s.times)}</b>`
			: `<span>${s.wharf ? [s.loads && s.loads.length ? T('Loads from storage') : '', s.dropped && s.dropped.length ? T('Leaves in storage') : '', s.sale ? T('sells {n} {what} here for {silver}', { n: n1(s.sale.n), what: T('goods'), silver: FC(Math.round(s.sale.total)) }) : ''].filter(Boolean).join(' · ') || names.kind : names.kind}</span>`;
		return `<div class="rest-row${k === at ? ' here' : ''}${done ? ' done' : ''}${skipped.has(key) && !done ? ' skipped' : ''}" data-act="barter-sail-jump" data-k="${esc(key)}" role="button" tabindex="0">
			<button class="rest-dot${done ? ' on' : ''}" data-act="barter-stop-done" data-k="${esc(key)}" aria-pressed="${done}" title="${T('tick this stop')}">${done ? '✓' : k + 1}</button>
			<div class="rest-main"><div class="rest-head"><b>${esc(names.place)}</b><span>${esc(names.who)}</span></div><div class="rest-what">${what}</div>${bars.bad || bars.over ? `<div class="rest-note">${bars.w.note || T('over the limit')}</div>` : ''}</div>
			<div class="rest-bars">${bars.hold}${bars.parley}<span class="rest-leg">${esc(legOf(k))}</span></div>
		</div>`;
	}).join('');
	return `<section class="panel rest-panel"><div class="panel-head"><h2 class="panel-title">${T('The rest of the run')}</h2><span class="panel-sub">${T('{n} of {of} done', { n: doneN, of: stops.length })} · ${T('tap a stop to jump to it')}</span></div>${rows}</section>`;
}

/**
 * What the run did: the figures so far, the stops one under another,
 * and the receipt -- what recording will take and what it will give --
 * before the press that writes it all down. It stands for a run half
 * sailed as well as for a whole one, since only ticked stops count.
 */
function resultsHTML() {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	const logs = `${todayHTML()}${weekHTML()}`;
	if (!plan) {
		const was = lastTrip ? `<section class="panel"><div class="panel-head"><h2 class="panel-title">${T('The run, recorded')}</h2><span class="panel-sub">${lastTrip.stops === 1 ? T('Recorded: {n} stop', { n: lastTrip.stops }) : T('Recorded: {n} stops', { n: lastTrip.stops })}</span></div><div class="panel-body"><div class="run-tiles">
			<div><div class="summary-k">${T('Trades made')}</div><div class="summary-v">${F(lastTrip.trades)}</div><div class="summary-sub">${T('Total Barters → {n}', { n: F(barterProfile().barterCount) })}</div></div>
			<div><div class="summary-k">${T('Silver, net')}</div><div class="summary-v gold">${lastTrip.net ? `${lastTrip.net > 0 ? '+' : '−'}${FC(Math.abs(lastTrip.net))}` : '—'}</div><div class="summary-sub">${lastTrip.spent ? T('{sold} sold · {bought} bought', { sold: FC(lastTrip.silver), bought: FC(lastTrip.spent) }) : T('sold at the wharf')}</div></div>
			${lastTrip.coins ? `<div><div class="summary-k">${T('Crow Coins')}</div><div class="summary-v gold">+${F(lastTrip.coins)}</div><div class="summary-sub"></div></div>` : ''}
			<div><div class="summary-k">${T('Parley spent')}</div><div class="summary-v teal">${F(lastTrip.parley)}</div><div class="summary-sub"></div></div>
		</div><p class="recorded-line">✓ ${T('Recorded.')} <button class="linky" data-act="barter-undo-record">${T('Undo')}</button></p></div></section>` : `<p class="empty step-empty">${T('No run to sum up yet. Results appear here as soon as a run is under way — complete or not.')}</p>`;
		return `${was}${logs}`;
	}
	const stops = plan.stops;
	const from = ports.find(p => p.id === on.port) || fromPort();
	const trip = tripOf(plan, on, from);
	const prof = barterProfile();
	const doneN = stops.filter((s, k) => ticked(on.done, s, k, stops)).length;
	const complete = doneN === stops.length;
	const at = stopAt(plan, on);
	const spent = parleySpentOf(plan, on);
	const bar = parleyOf(prof).held;
	const coins = trip.delta[COIN] || 0;
	const guessedCoins = unsaid(plan, on).some(s => s.item === COIN);
	const wharfTicked = stops.some((s, k) => s.wharf && s.sale && ticked(on.done, s, k, stops));
	const byLevel = sign => {
		const m = new Map();
		for (const [item, n] of Object.entries(trip.delta)) {
			if (item === SILVER || item === COIN || Math.sign(n) !== sign) continue;
			const lv = levelOf(item) || 0;
			m.set(lv, (m.get(lv) || 0) + Math.abs(n));
		}
		return [...m].sort((a, b) => a[0] - b[0]).map(([lv, n]) => (lv ? T('{n}× Level {lv}', { n: F(n), lv }) : T('{n}× land goods', { n: F(n) }))).join(', ');
	};
	const gained = Object.entries(trip.delta).filter(([item, n]) => n > 0 && levelOf(item)).reduce((a, [, n]) => a + n, 0);
	const stocking = (on.goal || goal) === 'stock', coining = (on.goal || goal) === 'coin';
	const tile = (k, v, sub, cls = '') => `<div><div class="summary-k">${k}</div><div class="summary-v${cls ? ` ${cls}` : ''}">${v}</div><div class="summary-sub">${sub}</div></div>`;
	const timer = timerState();
	const tiles = `<div class="run-tiles">
		${tile(T('Stops'), `${doneN} / ${stops.length}`, complete ? T('every stop ticked') : at >= 0 ? T('stop {n} is next', { n: at + 1 }) : '')}
		${tile(T('Trades made'), F(trip.trades), `${T('of {n} planned', { n: F(plan.trades || 0) })} · ${T('Total Barters → {n}', { n: F(prof.barterCount + Math.round(trip.trades)) })}`)}
		${coining ? tile(T('Crow Coins so far'), coins ? `+${F(coins)}` : '—', guessedCoins ? T('the middle of the range assumed until typed') : T('as typed at each island'), 'gold')
		: stocking ? tile(T('Goods so far'), gained ? `+${F(gained)}` : '—', byLevel(1) || T('nothing received yet'), 'teal')
			: tile(T('Silver so far'), trip.silver ? FC(trip.silver) : '—', wharfTicked ? T('sold at the wharf call') : T('nothing sold until the wharf call is ticked'), 'gold')}
		${tile(T('Parley spent'), F(spent), `${T('{n} left of {bar}', { n: F(Math.max(0, bar - spent)), bar: F(bar) })}${parleyGuessed(prof) ? ` · ${T('assumed full')}` : ''}`, 'teal')}
		${tile(T('Under way'), timer ? esc(spanText(timer.ran)) : '—', on.time ? T('≈ {time} planned', { time: esc(on.time) }) : '')}
	</div>`;
	const log = stops.map((s, k) => {
		const d = ticked(on.done, s, k, stops), names = stopNames(s);
		const said_ = s.npcId && (on.seen || {})[s.npcId] > 0 ? ` · ${T('paid {n}', { n: F(on.seen[s.npcId]) })}` : '';
		const line = s.npcId ? `${esc(s.giveText)}× ${esc(gameName(s.give))} → ${esc(s.recvText)}× ${esc(gameName(s.item))} ×${F(s.times)}${said_}` : s.wharf && s.sale ? T('sells {n} {what} here for {silver}', { n: n1(s.sale.n), what: T('goods'), silver: FC(Math.round(s.sale.total)) }) : names.kind;
		const cost = s.npcId ? (Number(s.parley) > 0 ? Number(s.parley) : (Number(s.times) || 0) * parleyOf(prof).perTrade) : 0;
		return `<div class="log-row${d ? ' done' : ''}"><span class="rest-dot${d ? ' on' : ''}" aria-hidden="true">${d ? '✓' : k + 1}</span><div><b>${esc(names.place)}</b><em>${line}</em></div><span class="log-right">${d ? (cost ? T('−{n} Parley', { n: F(Math.round(cost)) }) : T('Done')) : T('not yet')}</span></div>`;
	}).join('');
	const line = (k, v, cls = '') => `<div class="receipt-line"><span>${k}</span><b${cls ? ` class="${cls}"` : ''}>${v}</b></div>`;
	const net = trip.silver - trip.spent;
	const receipt = `<div class="receipt-cols">
		<div class="receipt-col"><div class="receipt-k">${T('You spent')}</div>
			${line(T('Land goods bought'), trip.spent ? FC(trip.spent) : '—')}
			${line(T('Parley'), F(spent))}
			${line(T('Out of your storage'), byLevel(-1) || T('nothing of yours'))}</div>
		<div class="receipt-col"><div class="receipt-k">${T('You got')}</div>
			${line(T('Silver at the wharf'), trip.silver ? FC(trip.silver) : '—', 'gold')}
			${coins ? line(T('Crow Coins'), `+${F(coins)}`, guessedCoins ? 'gold guess' : 'gold') : ''}
			${line(T('Goods received'), byLevel(1) || T('none'))}
			${line(T('Total Barters'), `+${F(Math.round(trip.trades))}`)}</div>
	</div>
	<div class="receipt-net"><span>${T('Silver, net')}</span><b class="${net < 0 ? 'warn' : 'gold'}">${net ? `${net > 0 ? '+' : '−'}${FC(Math.abs(net))}` : '—'}</b></div>
	<div class="receipt-acts"><span class="panel-sub">${T('Recording moves inventory, storage, Silver, Parley, Total Barters and the log as one Undo. Only ticked stops count.')}</span><button class="linky danger" data-act="barter-sail-drop" title="${T('Drop the checklist; nothing is recorded')}">${T('Abandon')}</button><button class="act" data-act="barter-record" ${doneN ? '' : 'disabled'} title="${T('The stops done go into the Inventory as one change')}">${T('Record the trip')}</button></div>`;
	return `<section class="panel"><div class="panel-head"><h2 class="panel-title">${complete ? T('The run, complete') : T('The run so far')}</h2><span class="panel-sub">${timer ? `${T('under way')} ⏱ ${esc(spanText(timer.ran))}` : ''}</span><span class="panel-spacer"></span><button class="linky" data-act="barter-step" data-id="sail">‹ ${T('Back to the run')}</button></div><div class="panel-body">${tiles}</div></section>
		<div class="results-grid">
			<section class="panel log-panel"><div class="panel-head"><h2 class="panel-title">${T('Stop by stop')}</h2><span class="panel-sub">${complete ? T('complete') : T('{n} still to go', { n: stops.length - doneN })}</span></div>${log}</section>
			<section class="panel"><div class="panel-head"><h2 class="panel-title">${T('The receipt')}</h2><span class="panel-sub">${complete ? T('what recording will change') : T('incomplete — records only what is ticked')}</span></div><div class="panel-body">${receipt}</div></section>
		</div>${logs}`;
}

export function renderBarter() {
	restore();
	const me = currentShip();
	const b = boardNow();
	if (!barterData) return `<p class="empty">${T('Reading the barter table…')}</p>`;
	// One column, the page's width, and four steps across its head: the
	// plan -- the board, where the day ends, how it is sailed, the chains
	// -- then the wharf, the cockpit and the results. One step is on the
	// page at a time, so each has one job and one thing to press.
	// Nothing is drawn until this render draws it: a board just cleared
	// must not leave the last board's run standing in for one.
	shownPlan = null;
	const parts = goal === 'material' ? materialParts(me, b.data) : silverParts(me, b);
	setTimeout(refreshSheet, 0);
	const now = stepNow();
	const on = sailing();
	const secs = parts.secs.map(([id, title, summary, body], i) => planSection(i + 1, id, title, summary, body)).join('');
	const planStep = `${boardHTML(b)}
		<div class="plan-fold"><span>${T('Three steps · each opens when the one before is settled')}</span><span class="panel-spacer"></span><button class="linky" data-act="barter-sec" data-id="all">${T('show all')}</button><button class="linky" data-act="barter-sec" data-id="none">${T('collapse all')}</button></div>
		${secs}${parts.dock || ''}`;
	const loadFoot = `<div class="load-dock"><button class="linky" data-act="barter-step" data-id="plan">‹ ${T('Back to the plan')}</button><span class="run-dock-figs"><span>${parts.things.all ? T('{n} of {of} aboard', { n: parts.things.done, of: parts.things.all }) : ''}</span></span>${on ? `<button class="act" data-act="barter-step" data-id="sail">${T('Back to the run')} ›</button>` : `<button class="act" data-act="barter-cast-off"${shownPlan && shownPlan.stops && shownPlan.stops.length ? '' : ' disabled'} title="${T('Tick the stops off as you go; at the end the whole trip goes into the Inventory as one change')}">⛵ ${T('Cast off')}</button>`}</div>`;
	const loadStep = `${holdBarHTML(me, parts.packLT || 0)}${parts.load || `<p class="empty step-empty">${T('Nothing to pack yet. Tick a chain on the plan and what it needs is listed here.')}</p>`}${loadFoot}`;
	const body = now === 'load' ? loadStep : now === 'sail' ? sailHTML() : now === 'results' ? resultsHTML() : planStep;
	return `<div class="barter-screen step-${now}">
		<button hidden data-act="barter-redraw" tabindex="-1" aria-hidden="true"></button>
		${strandedHTML()}${underWayHTML(now)}${recordedHTML()}
		${stepperHTML(parts, now)}
		${body}
	</div>`;
}


/* ------------------------------------------------------------------ *
 * what the tab answers to
 * ------------------------------------------------------------------ */

function pickGood(then) {
	const stock = aboardStock();
	const all = store.getAllStock();
	const items = tradeGoodNames.filter(n => !(stock[n] > 0)).map(n => ({
		id: n, label: gameName(n), icon: img(n, ''), group: T('Level {lv}', { lv: levelOf(n) }),
		meta: T('{n} LT', { n: F(GOODS[levelOf(n)].weight) }), sub: sellOf(n) ? T('a barterer pays {silver}', { silver: FC(sellOf(n)) }) : T('cannot be sold')
	}));
	// The shore goods too: a chain starts from one of these, and a
	// sailor with a pile of them should not be told to buy more. They
	// are materials like any other, so the count lives in the Inventory
	// beside the planks and the stones.
	items.push(...Object.keys(landGoods).filter(n => !(all[n] > 0)).sort().map(n => ({
		id: n, label: gameName(n), icon: img(n, ''), group: T('Bought ashore — what a chain starts from'),
		sub: T('a land good: the first rung of a chain from the shore')
	})));
	openPicker({
		title: T('Which good is aboard?'),
		hint: T('A sea trade good, or a shore good a chain starts from. The count lives in the Inventory.'),
		items,
		onPick: name => { store.addStock(name, 1, T('1 {name} aboard', { name }), false); then(); }
	});
}

function pickMaterial(then) {
	const list = materials();
	openPicker({
		title: T('A run for which material?'),
		hint: T('What your builds are short of comes first.'),
		items: list.map(m => ({
			id: m.name, label: gameName(m.name), icon: img(m.name, ''),
			group: m.short ? T('Your builds are short of') : T('Everything the table deals'),
			meta: m.short ? T('{n} short', { n: F(Math.ceil(m.short)) }) : ''
		})),
		selected: itemNow(),
		onPick: name => { setMaterial(name); then(); }
	});
}

/** The material the list is for, each keeping its own want. */
function setMaterial(name) {
	const now = itemNow();
	if (now) wants[now] = qty;
	// Its own want: what was typed for it before, else what the builds
	// are short of, else one -- read before it is the open one, since
	// the open one's want is `qty`. Put down (no name), nothing is open.
	if (name && name !== now) qty = wantOf(name);
	item = name;
	persist();
}

/** The want of a material: what was typed for it, else what the
 *  builds are short of, else one. */
function wantOf(name) {
	if (name === itemNow()) return qty;
	if (wants[name] > 0) return wants[name];
	const short = (materials().find(m => m.name === name) || {}).short || 0;
	return short ? Math.ceil(short) : 1;
}

/** The materials on today's run, in the order they came: every one an
 *  island is ticked as showing, first tick first, and the one open if
 *  it is not among them, each with its want. A tile keeps its place
 *  when it is opened. */
function matsToday() {
	const it = itemNow();
	const seen = [...new Set(matBoardNow().answers.map(a => a.recv))];
	const all = it && !seen.includes(it) ? [...seen, it] : seen;
	return all.filter(m => materials().some(x => x.name === m)).map(m => ({ it: m, qty: wantOf(m) }));
}

/** Every other storage with trade goods in it, and the wharf beside
 *  it where there is one: what a run could call for on the way, or
 *  what sits out of its reach. */
function storesElsewhere() {
	const from = fromPort();
	const out = [];
	for (const town of TOWNS) {
		if (town === store.ABOARD || (from && town === from.name)) continue;
		const goods = {};
		for (const [name, qty] of Object.entries(store.getAllStock())) {
			if (levelOf(name) === null || !(qty > 0)) continue;
			const n = store.stockAt(name, town);
			if (n > 0) goods[name] = n;
		}
		if (Object.keys(goods).length) out.push({ town, wharf: wharves.find(w => w.kind === 'wharf' && w.at === town) || null, goods });
	}
	return out;
}

/** The inventory of everything that is not a trade good: the Gold
 *  Bars and materials a few islands take. */
function bagsNow() {
	const out = {};
	for (const [name, qty] of Object.entries(store.getAllStock())) if (levelOf(name) === null && qty > 0) out[name] = qty;
	return out;
}

/* ------------------------------------------------------------------ *
 * the window, read off a screenshot -- and the fleet's own readings
 * ------------------------------------------------------------------ */

/**
 * The barter window, read whole.
 *
 * Every row the screenshot had is answered at once, and an island
 * answered again replaces what was said about it before: a second shot
 * of a scrolled window is more of the same board, not a contradiction.
 */
function readWindow(then, files = null) {
	boardNow();   // the day's answers, reset if the refill has passed
	openBarterImport({
		files,
		deals: exchanges(barterData),
		onAnswers: answers => {
			// The window is one list and the app keeps two: the forty
			// layouts, and the material islands, which roll on their own
			// and belong to no layout. A row is told apart by what it
			// pays -- a ship material is not a trade good -- and goes to
			// the list it belongs to, which is the same split boardData
			// makes of the whole table.
			const mb = matBoardNow();
			let mats = 0;
			for (const a of answers) {
				const material = levelOf(a.recv) === null && a.recv !== 'Crow Coin';
				const list = material ? mb.answers : board.answers;
				const i = list.findIndex(x => x.npcId === a.npcId);
				if (i >= 0) list.splice(i, 1);   // an island shows one exchange
				list.push({ npcId: a.npcId, give: a.give, recv: a.recv });
				if (material) mats++;
			}
			persist();
			const board_ = answers.length - mats;
			toast(`${answers.length === 1 ? T('{n} island read off the screenshot', { n: answers.length }) : T('{n} islands read off the screenshot', { n: answers.length })}${mats ? ` — ${T('{n} on today\'s board, {mats} ticked on the material list', { n: board_, mats })}` : ''}`, true);
			then();
		}
	});
}

/** What the fleet has read of today's board, once it has been asked
 *  for. Kept a day at a time, since that is how long a board lives. */
let fleet = { day: '', list: [], asked: false };

/** Ask the server what others have seen, once a barter day, and redraw
 *  when it answers. Quiet where there is no server to ask. */
function fleetNow() {
	if (!boardsShared()) return [];
	const day = barterKey();
	if (fleet.day !== day) fleet = { day, list: [], asked: false };
	if (!fleet.asked) {
		fleet.asked = true;
		boardsFor(day).then(list => {
			fleet = { day, list, asked: true };
			redrawSoon();
		}).catch(() => {});
	}
	return fleet.list;
}

/** Somebody else's reading, taken as your own: every island they named
 *  is answered, and the app is told you saw the same board. */
function takeFleetBoard(id, then) {
	const seen = fleet.list.find(b => String(b.id) === String(id));
	if (!seen) return;
	boardNow();   // the day's answers, reset if the refill has passed
	for (const [npcId, give, , recv] of seen.offers) {
		if (!npcById.has(Number(npcId))) continue;
		board.answers = board.answers.filter(x => x.npcId !== Number(npcId));
		board.answers.push({ npcId: Number(npcId), give: String(give), recv: String(recv) });
	}
	persist();
	toast(seen.offers.length === 1
		? T('Today\'s board as {who} read it: {n} island answered', { who: seen.name ? seen.name : T('another sailor'), n: seen.offers.length })
		: T('Today\'s board as {who} read it: {n} islands answered', { who: seen.name ? seen.name : T('another sailor'), n: seen.offers.length }), true);
	if (!seen.mine && !seen.confirmed) sawItToo(seen.id).then(() => { fleet.asked = false; });
	then();
}

/**
 * The layout book: the record and the fleet's readings, side by side,
 * in a dialog of their own. The bar above asks which board it is today;
 * this is where the evidence is kept, and the two presses in it that
 * change today's board come back here to be done.
 */
function openBook(then) {
	if (!combos) { toast(T('The record of the boards did not load')); return; }
	boardNow();   // the day's answers, reset if the refill has passed
	openLayoutBook({
		combos,
		answers: board.answers,
		day: barterKey(),
		count: Number.isFinite(Number(barterProfile().barterCount)) ? Number(barterProfile().barterCount) : null,
		log: store.getProfile('boardLog', []) || [],
		onTake: (said, readers) => {
			for (const a of said) {
				if (!npcById.has(a.npcId)) continue;
				board.answers = board.answers.filter(x => x.npcId !== a.npcId);
				board.answers.push({ npcId: a.npcId, give: a.give, recv: a.recv });
			}
			// a layout with a slot moved is sailed as that layout; a board
			// in no record at all is sailed as seen, or not at all
			board.own = !candidates(combos.combos, board.answers).length && !driftOf(combos.combos, board.answers);
			persist();
			toast(said.length === 1
				? T('Today\'s board as the fleet read it: {n} island answered', { n: said.length })
				: T('Today\'s board as the fleet read it: {n} islands answered', { n: said.length }), true);
			for (const r of readers) if (!r.mine && !r.confirmed) sawItToo(r.id).then(() => { fleet.asked = false; });
			then();
		},
		// a reading is news when the record has no such board, and only then
		onTell: worthTelling() ? done => tellTheFleet(() => { done(); then(); }) : null
	});
}

/**
 * Offer what has been answered so far to everyone else on the server.
 *
 * The screenshot reader offers this as it reads, but a board answered
 * island by island in the usual way is worth exactly as much -- and a
 * board that fits none of the forty layouts is worth more, because
 * that is the record itself being out of date.
 */
function tellTheFleet(then) {
	const b = boardNow();
	if (!board.answers.length) return;
	if (!me()) { toast(T('Sign in from the Menu to put your name to a reading')); return; }
	toast(T('Sending today’s board…'));
	// A board of the sailor's own is not a layout number, and saying so
	// would put a word where everyone else's reading has a figure.
	tellFleet(barterKey(), b.combo && !b.combo.own ? b.combo.id : null, board.answers.map(a => ({ ...a, qty: '1' }))).then(out => {
		toast(out.ok
			? (board.answers.length === 1
				? T('The fleet has your reading of today\'s board — {n} island, with your name on it', { n: board.answers.length })
				: T('The fleet has your reading of today\'s board — {n} islands, with your name on it', { n: board.answers.length }))
			: T('It did not go: {why}', { why: said(out.why) }), out.ok);
		fleet.asked = false;
		then();
	});
}

/** The chip that does it, where there is a server and something to
 *  send. */
function worthTelling() {
	const b = boardNow();
	return Boolean(board.answers.length) && (!b.standing.length || Boolean(b.combo && (b.combo.own || b.combo.patched)));
}

function tellChip(lost = false) {
	if (!boardsShared() || !worthTelling()) return '';
	return `<button class="${lost ? 'chip primary' : 'ghost-btn sm'}" data-act="barter-fleet-tell" title="${me()
		? T('Everyone with the page open today can sail on it, with your name on the reading')
		: T('Sign in from the Menu first — a reading goes up with a name on it')}">📣 ${T('Tell the fleet')}</button>`;
}

/**
 * What the fleet has seen today, as a line under the board bar.
 *
 * A board is the same for everyone on a server until the refill, so
 * somebody else's reading of it is the answer to the question this bar
 * is asking. Their name is on it, and the count beside it is how many
 * others have since looked and found the same.
 */
function fleetLine() {
	const list = fleetNow();
	if (!list.length) return '';
	const best = list[0];
	const who = best.name ? esc(best.name) : T('a sailor who is not shown by name');
	const others = list.length - 1;
	const isles = best.offers.length === 1 ? T('<b>{n} island</b>', { n: best.offers.length }) : T('<b>{n} islands</b>', { n: best.offers.length });
	return `<div class="board-fleet">${best.mine
		? T('{isles} of today\'s board as you read it', { isles })
		: T('{isles} of today\'s board read by {who}', { isles, who })}${best.seen ? ` · ${best.seen === 1 ? T('{n} sailor has seen the same', { n: F(best.seen) }) : T('{n} sailors have seen the same', { n: F(best.seen) })}` : ''}${best.layout ? ` · ${T('they make it <b>layout {id}</b>', { id: esc(best.layout) })}` : ''}
		${best.mine ? '' : `<button class="linky" data-act="barter-fleet-take" data-id="${esc(String(best.id))}">${T('take their reading')}</button>`}
		${others > 0 ? `<button class="linky quiet" data-act="barter-book" title="${T('Every reading, in the layout book')}">${others === 1 ? T('and {n} other', { n: others }) : T('and {n} others', { n: others })}</button>` : ''}</div>`;
}

/** What one island is showing: its possible offers, commonest first. */
const SHUT = '\u0000shut';

function pickOffer(npcId, then) {
	// Asked of the layouts still standing -- or, once the board is
	// settled, of the board itself, which may be a layout as the sailor
	// saw it and so not one of the forty at all.
	const now = boardNow();
	const standing = now.combo && !now.combo.own ? [now.combo] : now.standing;
	const npc = npcById.get(npcId);
	const items = offersAt(standing, npcId).map(o => ({
		id: `${o.give}|${o.recv}`, label: `${gameName(o.give)} → ${gameName(o.recv)}`, icon: img(o.recv, ''),
		sub: T('hands over {n}× {name}', { n: o.qty, name: gameName(o.give) }),
		meta: standing.length > 1 ? T('{n} of {of}', { n: o.ids.length, of: standing.length }) : ''
	}));
	items.push({ id: '', label: T('Something else'), sub: T('an offer the record has never seen there'), group: '' });
	// An island with nothing on its window is not a mistake and not an
	// empty day: every exchange has its own barter count to open, so the
	// one this island is showing today may simply not be this sailor's
	// yet. Said here, it is remembered against that exchange.
	const showing = standing.length === 1 ? offersAt(standing, npcId)[0] : null;
	if (showing) items.push({ id: SHUT, label: T('Nothing — its window is blank for me'), sub: T('it leaves today’s board; the exchange it is on is not open to you yet, or not there at all'), group: '' });
	const pick = id => {
		if (id === SHUT) return shut();
		const [give, recv] = id.split('|');
		board.answers = board.answers.filter(x => x.npcId !== npcId);
		board.answers.push({ npcId, give, recv });
		persist();
		then();
	};
	/** This island's offer today, noted as not the sailor's yet. */
	const shut = () => {
		const prof = barterProfile();
		const at = Math.max(0, Number(prof.barterCount) || 0);
		const seen = (store.getProfile('shutOffers', []) || []).filter(x => !(x.npcId === npcId && x.give === showing.give && x.recv === showing.recv));
		store.setProfile('shutOffers', [...seen, { npcId, give: showing.give, recv: showing.recv, at }].slice(-200));
		const opens = nextGateAbove(at);
		toast(Number.isFinite(opens)
			? T('{isle} is left out: {give} → {recv} is not open at {n} barters, and the next unlock is at {opens}', { isle: gameName(isleOf(npc)), give: gameName(showing.give), recv: gameName(showing.recv), n: F(at), opens: F(opens) })
			: T('{isle} is left out: {give} → {recv} is not open at {n} barters', { isle: gameName(isleOf(npc)), give: gameName(showing.give), recv: gameName(showing.recv), n: F(at) }), true);
		then();
	};
	openPicker({
		title: T('What does {isle} show?', { isle: gameName(isleOf(npc)) }),
		hint: T('{who}, its barterer. The offer on the barter window right now.', { who: gameName(whoOf(npc)) }),
		items,
		onPick: id => {
			if (id) return pick(id);
			// An offer no standing layout lists at this island: the codex
			// knows every exchange the island deals, so the sailor can
			// still say which. The layouts with a row for the island that
			// says otherwise fall away; a layout with no row for it stands,
			// and the offer is put on its board as seen.
			const listed = new Set(items.map(i => i.id));
			// ...and so does the game's own table, which has rows the codex
			// never listed. Between them this is every exchange the island
			// is known to deal, on any board.
			const known = new Map(exchanges(barterData).filter(x => x.npcId === npcId).map(x => [`${x.give}|${x.item}`, x]));
			for (const o of clientDeals(npcId)) if (!known.has(`${o.give}|${o.recv}`)) known.set(`${o.give}|${o.recv}`, { npcId, give: o.give, item: o.recv, giveText: o.qty });
			const codex = [...known.values()].filter(x => !listed.has(`${x.give}|${x.item}`))
				.sort((a, b) => (levelOf(b.item) || 0) - (levelOf(a.item) || 0) || a.give.localeCompare(b.give));
			if (!codex.length) { toast(T('The record has no layout with that offer; the run stays on the whole table')); return; }
			openPicker({
				title: T('What does {isle} show?', { isle: gameName(isleOf(npc)) }),
				hint: T('Every exchange {who} is known to deal, from the codex and the game\'s own table. Pick what the window shows: if it is this layout with a slot moved, the board follows.', { who: gameName(whoOf(npc)) }),
				items: codex.map(x => ({ id: `${x.give}|${x.item}`, label: `${gameName(x.give)} → ${gameName(x.item)}`, icon: img(x.item, ''), sub: T('hands over {n}× {name}', { n: x.giveText, name: gameName(x.give) }) })),
				onPick: pick
			});
		}
	});
}

/** An island of the player's own choosing, the telling ones first. */
function pickIsland(then) {
	const { standing } = boardNow();
	// The islands this sailor has not opened are listed too -- greyed,
	// unpickable, and saying what opens them. Hiding them made the list
	// look short for no reason a reader could see; shown, it is a map of
	// what the count is worth.
	const barters = barterProfile().barterCount;
	const list = askable(standing, npcById, fromPort());
	openPicker({
		title: T('Which island are you looking at?'),
		hint: T('The ones whose offer tells the layouts apart best come first. The ones your Total Barters have not opened are greyed, with the count that opens them.'),
		items: [...list].sort((a, b) => Number(npcOpen(b.npcId, barters)) - Number(npcOpen(a.npcId, barters))).map(a => {
			const n = npcById.get(a.npcId);
			const gate = npcGate(a.npcId);
			const shut = gate > barters;
			return {
				id: String(a.npcId), label: gameName(isleOf(n)), icon: '',
				sub: shut ? `${gameName(whoOf(n))} · ${T('opens at {barters} Total Barters', { barters: F(gate) })}` : gameName(whoOf(n)),
				meta: shut ? T('{n} more', { n: F(gate - barters) }) : a.worst > 1 ? T('{n} left at worst', { n: a.worst }) : T('settles it'),
				disabled: shut
			};
		}),
		onPick: id => pickOffer(Number(id), then)
	});
}

/**
 * The islands today's board holds that this count has not opened.
 *
 * A list rather than a dialog with a button: there is nothing to do
 * about a gate but sail more, so it says which islands, what each is
 * offering and the count that opens it, and leaves.
 */
function showGated() {
	const { combo, gated } = boardNow();
	if (!combo || !gated.length) return;
	const prof = barterProfile();
	const rows = [...gated]
		.map(x => ({ ...x, name: isleOf(npcById.get(x.npcId)) || '' }))
		.sort((a, b) => a.gate - b.gate || a.name.localeCompare(b.name));
	openPicker({
		title: T('Not open at your barter count'),
		hint: T('The game unlocks each exchange on its own total, not each island. These {n} are on today\'s board but show nothing at {barters} barters, so the run is planned without them. Read from the game client\'s own table.', { n: rows.length, barters: F(prof.barterCount) }),
		items: rows.map(x => ({
			id: String(x.npcId),
			label: gameName(x.name),
			icon: img(x.recv, ''),
			sub: `${gameName(x.give)} → ${gameName(x.recv)}`,
			meta: T('opens at {n}', { n: F(x.gate) }),
			group: T('opens at {n} barters', { n: F(x.gate) })
		})),
		onPick: () => {}
	});
}

/**
 * Any island on today's board, to say it shows something else.
 *
 * The layouts are the community's record and the game's own table, and
 * neither is the game: a slot is moved at a maintenance, a row was
 * written down wrong, an exchange is above a sailor's count and the
 * window is simply blank. Once the layout is settled this is the one
 * door for all of that -- name the island, then say what its window
 * shows, or that it shows nothing.
 *
 * The count is taken into account before anybody is asked: an island
 * whose exchange the client gates above this sailor's count is listed
 * greyed, with the count that opens it, because a blank window there is
 * the game working and nothing to report.
 */
function pickAnyIsland(then) {
	const { combo } = boardNow();
	if (!combo) return;
	const barters = Number(barterProfile().barterCount) || 0;
	const seen = store.getProfile('shutOffers', []) || [];
	const rows = [...offersOf(combo)]
		.filter(([npcId]) => npcById.has(npcId))
		.map(([npcId, o]) => {
			const gate = Math.max(npcGate(npcId) || 0, exchangeGate(combo, npcId) || 0);
			return {
				npcId, o, gate, name: isleOf(npcById.get(npcId)) || '',
				locked: gate > barters,
				off: seen.some(x => x.npcId === npcId && x.give === o.give && x.recv === o.recv),
				mine: (combo.patched || []).includes(npcId)
			};
		})
		.sort((a, b) => Number(a.locked) - Number(b.locked) || a.name.localeCompare(b.name));
	openPicker({
		title: T('Which island shows something else?'),
		hint: T('Open its barter window in game. Beside each island is what today\'s board says it shows. The greyed ones are above your {n} barters: their windows are blank for you, and that is the game, not the record.', { n: F(barters) }),
		items: rows.map(r => ({
			id: String(r.npcId),
			label: gameName(r.name),
			icon: img(r.o.recv, ''),
			sub: `${gameName(r.o.give)} → ${gameName(r.o.recv)}`,
			meta: r.locked ? T('opens at {n}', { n: F(r.gate) }) : r.off ? T('left out — shows nothing') : r.mine ? T('as you saw it') : '',
			disabled: r.locked
		})),
		onPick: id => {
			const r = rows.find(x => String(x.npcId) === id);
			if (!r) return;
			if (r.off) {
				store.setProfile('shutOffers', seen.filter(x => !(x.npcId === r.npcId && x.give === r.o.give && x.recv === r.o.recv)));
				toast(T('{isle} is back on the board', { isle: gameName(r.name) }), true);
				then();
				return;
			}
			pickOffer(r.npcId, then);
		}
	});
}

/** A click on the tab. Returns true when it was one of ours, with the
 *  screen to be redrawn by the caller. */
export function barterAction(act, el, redraw) {
	restore();
	if (act.startsWith('barter-timer-')) return timerAction(act, el, redraw);
	switch (act) {
		case 'barter-goal': goal = ['material', 'stock', 'coin'].includes(el.dataset.id) ? el.dataset.id : 'silver'; persist(); return true;
		// Which of the four steps is on the page. Asked for by hand, it
		// stays asked for: the page does not slide out from under a sailor
		// reading it because a stop was ticked somewhere else.
		case 'barter-step': step = ['plan', 'load', 'sail', 'results'].includes(el.dataset.id) ? el.dataset.id : 'plan'; return true;
		// Which part of the plan is open. Pressing the open one shuts it.
		case 'barter-sec': {
			const id = el.dataset.id;
			planSec = id === 'all' || id === 'none' ? id : planSec === id ? 'none' : id;
			persist();
			return true;
		}
		case 'barter-adv': advOpen = !advOpen; persist(); return true;
		case 'barter-glance': glance = !glance; return true;
		// A rung of the ladder: where the day's climbs end. On a coin day
		// the ceiling is the coin islands' own, so picking another rung is
		// asking for a different day, and says so by changing the goal.
		case 'barter-rung': {
			const lv = Number(el.dataset.lv);
			if (!STOCK_LEVELS.includes(lv)) return false;
			if (goal === 'stock') stockGoal = { ...stockGoal, ceiling: lv };
			else { if (goal === 'coin' && lv !== COIN_LEVEL) goal = 'silver'; climb = lv >= 7 ? 0 : lv; }
			persist();
			return true;
		}
		case 'barter-coin-node': goal = goal === 'coin' ? 'silver' : 'coin'; persist(); return true;
		// Sold or kept, flipped on the rung itself.
		case 'barter-fate': {
			const lv = Number(el.dataset.lv);
			const o = ordersNow();
			setOrders({ sell: lv >= o.sell ? keepFrom(lv) : sellFrom(lv) });
			return true;
		}
		// An order chosen from a row of chips rather than a box: the same
		// answer the box would have given.
		case 'barter-order': return barterChange({ dataset: { act: el.dataset.k }, value: el.dataset.v, checked: el.dataset.v === 'true' }, n => Number(n));
		// The bar really is full: said once, so the figures stop hedging.
		case 'barter-parley-full': {
			store.setProfileMany({ parleyHeld: PARLEY.max, parleyDay: barterKey() });
			toast(T('The Parley bar is full — the run is planned on {n}', { n: F(PARLEY.max) }), true);
			return true;
		}
		// A thing on the packing list, fetched. Nothing is moved by this:
		// buying at the Market and taking goods out of a storage are the
		// game's own doing, and this is the sailor keeping their place.
		case 'barter-pack': {
			const k = String(el.dataset.k || '');
			if (packed.has(k)) packed.delete(k); else packed.add(k);
			return true;
		}
		case 'barter-save': askSaveOrders(redraw); return false;
		case 'barter-saved': applySaved(el.dataset.name); return true;
		case 'barter-saved-drop': dropSaved(el.dataset.name); return true;
		case 'barter-aim': stockGoal = { ...stockGoal, aim: AIM_CHOICES.some(([a]) => a === el.dataset.id) ? el.dataset.id : 'fill' }; persist(); return true;
		// A sailing preset lays over the orders rather than replacing
		// them: what the ladder set stays exactly as the ladder left it.
		case 'barter-sail-preset': {
			const p = SAIL_PRESETS.find(x => x.id === el.dataset.id);
			if (p) { retickIfAuto(); setOrders({ ...p.orders }); }
			return false;
		}
		case 'barter-homemade': {
			const made = store.getProfile('homemade', []) || [];
			const it = el.dataset.item;
			store.setProfile('homemade', made.includes(it) ? made.filter(x => x !== it) : [...made, it], made.includes(it) ? T('{item}: bought, not made', { item: it }) : T('{item}: made by your workers', { item: it }));
			return false;
		}
		case 'barter-add': pickGood(redraw); return false;
		case 'barter-hold-open': openSheet('hold'); return false;
		case 'barter-quest-skip': questSkip = { day: barterKey(), ids: [...new Set([...skippedToday(), el.dataset.quest])] }; questPull = { day: barterKey(), ids: pulledToday().filter(id => id !== el.dataset.quest) }; persist(); return true;
		case 'barter-quest-unskip': questSkip = { day: barterKey(), ids: skippedToday().filter(id => id !== el.dataset.quest) }; persist(); return true;
		case 'barter-quest-pull': questPull = { day: barterKey(), ids: [...new Set([...pulledToday(), el.dataset.quest])] }; persist(); return true;
		case 'barter-item': pickMaterial(redraw); return false;
		// The hold works the count no storage claims: a trade good is never
		// in the bags, so that count is the ship's. Taking away never
		// reaches past what is aboard into a pile ashore.
		case 'barter-good': {
			const d = Number(el.dataset.delta);
			store.addStock(el.dataset.item, d < 0 ? -Math.min(-d, aboardStock()[el.dataset.item] || 0) : d, null, false);
			return false;
		}
		case 'barter-unload': {
			const item = el.dataset.item;
			const n = aboardStock()[item] || 0;
			if (!n) return false;
			const to = unloadTo();
			if (to) { store.moveStash(item, '', to, n, T('{n}× {item} unloaded at {town}', { n, item, town: to })); return false; }
			openPicker({
				title: T('Unload {n}× {item} where?', { n, item: gameName(item) }),
				hint: T('The storage the goods go into. Choose where the run sails from and the hold unloads there without asking.'),
				items: TOWNS.filter(t => t !== store.ABOARD).map(t => ({ id: t, label: gameName(t) })),
				onPick: t => { store.moveStash(item, '', t, n, T('{n}× {item} unloaded at {town}', { n, item, town: t })); redraw(); }
			});
			return false;
		}
		case 'barter-load': {
			const n = Number(el.dataset.n) || store.stockAt(el.dataset.item, el.dataset.town);
			store.moveStash(el.dataset.item, el.dataset.town, '', n, T('{n}× {item} loaded at {town}', { n, item: el.dataset.item, town: el.dataset.town }));
			// Marked aboard while the run is already being sailed: the
			// checklist was frozen with this load still to make, and Record
			// makes whatever loads it still lists -- so this one would be
			// moved out of the harbour twice. It comes off the list here.
			if (sail && Array.isArray(sail.loaded)) {
				sail.loaded = sail.loaded.map(l => (l.item === el.dataset.item ? { ...l, n: Math.max(0, l.n - n) } : l)).filter(l => l.n > 0);
				persist();
			}
			return false;
		}
		case 'barter-qty-short': qty = Math.max(1, Number(el.dataset.n) || 1); if (itemNow()) wants[itemNow()] = qty; persist(); return true;
		case 'barter-mat-pick': setMaterial(el.dataset.item === itemNow() ? '' : el.dataset.item); return true;
		case 'barter-mat-go': setMaterial(el.dataset.item); return true;
		case 'barter-mat-drop': {
			// Its ticks gone, the material is off the run; put down too,
			// if it was the one open, so it leaves the strip.
			const mb = matBoardNow();
			mb.answers = mb.answers.filter(a => a.recv !== el.dataset.item);
			if (itemNow() === el.dataset.item) setMaterial('');
			persist();
			const seen = { ...(store.getProfile('matSeen', {}) || {}) };
			seen[mb.day] = mb.answers.map(a => [a.npcId, a.give, a.recv]);
			store.setProfileQuiet('matSeen', seen);
			return true;
		}
		case 'barter-mat-add': pickMaterial(redraw); return false;
		case 'barter-trip': openTripLog(); return false;
		case 'barter-board-ask': pickOffer(Number(el.dataset.npc), redraw); return false;
		case 'barter-shot': readWindow(redraw); return false;
		case 'barter-book': openBook(redraw); return false;
		case 'barter-fleet-take': takeFleetBoard(el.dataset.id, redraw); return false;
		case 'barter-fleet-tell': tellTheFleet(redraw); return false;
		// A board the record has never seen, sailed on the sailor's own
		// word rather than on the whole table's fiction.
		case 'barter-own-board': board.own = !board.own; persist(); return true;
		case 'barter-board-island': pickIsland(redraw); return false;
		case 'barter-gated': showGated(); return false;
		case 'barter-board-fix': pickAnyIsland(redraw); return false;
		case 'barter-shut-clear': store.setProfile('shutOffers', []); toast(T('Every island is back on the board'), true); return true;
		case 'barter-board-undo': board.answers.pop(); persist(); return true;
		case 'barter-pace-set': setOrders({ pace: el.dataset.id === 'full' ? 'full' : el.dataset.id === 'steady' ? 'steady' : 'fast' }); return true;
		case 'barter-mat-pace-set': matOrders = { ...matOrders, pace: el.dataset.id === 'fast' ? 'fast' : 'full' }; persist(); return true;
		case 'barter-mat-tick': {
			const mb = matBoardNow();
			const npcId = Number(el.dataset.npc), give = el.dataset.give, recv = itemNow();
			const i = mb.answers.findIndex(a => a.npcId === npcId);
			const same = i >= 0 && mb.answers[i].give === give && mb.answers[i].recv === recv;
			if (i >= 0) mb.answers.splice(i, 1);   // an island shows one exchange: a new tick replaces the old
			if (!same) mb.answers.push({ npcId, give, recv });
			persist();
			// Into the record, so the material list's habits can be learnt.
			const seen = { ...(store.getProfile('matSeen', {}) || {}) };
			seen[mb.day] = mb.answers.map(a => [a.npcId, a.give, a.recv]);
			store.setProfileQuiet('matSeen', seen);
			return true;
		}
		case 'barter-mat-clear': matBoard = { day: barterKey(), answers: [] }; persist(); return true;
		case 'barter-mat-only': matOnly = matOnly === el.dataset.id ? '' : el.dataset.id; return true;
		case 'barter-mat-lv': matLv = matLv === Number(el.dataset.lv) ? 0 : Number(el.dataset.lv); return true;
		case 'barter-mat-filters-clear': matQ = ''; matOnly = ''; matLv = 0; return true;
		// From the material run to the item board: the chains that reach
		// the give not held, and no others, until cleared.
		case 'barter-reach': reach = el.dataset.item || ''; goal = 'silver'; persist(); return true;
		case 'barter-reach-clear': reach = ''; persist(); return true;
		case 'barter-board-clear': board.answers = []; board.own = false; persist(); return true;
		case 'barter-chain': {
			// Ticked, a start replaces the ladder's other starts: one
			// climb up those islands, from one place.
			const id = el.dataset.id;
			const group = String(el.dataset.group || '').split('\n').filter(Boolean);
			routes.ids = routes.ids.includes(id) ? routes.ids.filter(x => x !== id) : [...routes.ids.filter(x => !group.includes(x)), id];
			routesAuto = '';
			persist();
			return true;
		}
		case 'barter-chain-start': {
			const id = el.dataset.id;
			const group = String(el.dataset.group || '').split('\n').filter(Boolean);
			routes.ids = [...routes.ids.filter(x => !group.includes(x)), id];
			routesAuto = '';
			persist();
			return true;
		}
		case 'barter-chains-clear': routes.ids = []; routesAuto = ''; persist(); return true;
		case 'barter-hold-lv': { const lv = Number(el.dataset.lv); if (holdLv.has(lv)) holdLv.delete(lv); else holdLv.add(lv); return true; }
		case 'barter-hold-at': holdAt = holdAt === el.dataset.town ? '' : el.dataset.town; return true;
		case 'barter-hold-clear': holdQ = ''; holdLv = new Set(); holdAt = ''; return true;
		case 'barter-chain-from': chainFrom = chainFrom === el.dataset.id ? '' : el.dataset.id; return true;
		case 'barter-chain-top': { const lv = el.dataset.lv === 'coin' ? 'coin' : Number(el.dataset.lv); chainTop = chainTop === lv ? 0 : lv; return true; }
		case 'barter-chain-clear': chainQ = ''; chainFrom = ''; chainTop = 0; return true;
		// Casting off from the wharf: the same checklist the Map's own
		// "Sail this run" makes, and the cockpit opened over it.
		case 'barter-cast-off': {
			if (!barterAction('barter-sail', el, redraw)) return false;
			step = 'sail';
			cursor = null;
			skipped = new Set();
			lastTrip = null;
			return true;
		}
		case 'barter-sail': {
			if (!shownPlan) return false;
			sail = { key: sailKey(), done: [], seen: {}, got: {}, kept: [], ...sailRecord(shownPlan) };
			// Sailing starts the clock, since that press is the moment the
			// ship leaves -- and it is the gesture the browser wants before
			// the page is allowed to make a sound.
			//
			// Said out loud, because it used to happen in silence: a
			// sailor who never asked for a clock, and never saw one start,
			// came back from the kitchen to a number counting up at them
			// with no idea what had set it going or how to set it right.
			const legs = legsOf(shownPlan.stops);
			// A clock already running is left alone only when it is this
			// run's own and still has time on it -- the sailor pressed
			// start a moment before pressing Sail. Any other clock is a
			// run that is over: it used to be kept, so the second run of
			// a day sailed under the first one's clock, long past its end.
			const ticking = timerState();
			const mine = ticking && !ticking.over && ticking.label === runLabel(shownPlan).slice(0, 60);
			const set = legs.mid > 0 && !mine ? startTimer(legs.mid, runLabel(shownPlan), runMarks(shownPlan, legs)) : 0;
			if (set) toast(T('Cast off — the clock is running, ≈ {span}. It has “again” and “stop” on it.', { span: spanText(set) }));
			persist();
			return true;
		}
		case 'barter-got': {
			const on = sailing();
			if (!on) return false;
			if (on.got[el.dataset.npc] === el.dataset.item) delete on.got[el.dataset.npc]; else on.got[el.dataset.npc] = el.dataset.item;
			persist();
			return true;
		}
		// The run is dropped, and its clock with it: a clock with no run
		// behind it only counts up at whoever comes back to the page.
		case 'barter-sail-drop': sail = null; sailAll.open = false; cursor = null; skipped = new Set(); step = 'plan'; stopTimer(); persist(); return true;
		// The cockpit sent to one stop, or past one. A stop passed over is
		// not ticked and not recorded: it is only out of the way.
		case 'barter-sail-jump': cursor = String(el.dataset.k); return true;
		case 'barter-sail-skip': { skipped.add(String(el.dataset.k)); cursor = null; return true; }
		// What the last Record came to, put away or taken back.
		case 'barter-recorded-ok': lastTrip = null; return true;
		case 'barter-undo-record': {
			const label = store.undo();
			lastTrip = null;
			toast(label ? T('Reverted: {what}', { what: label }) : T('Nothing to undo'));
			return true;
		}
		case 'barter-sail-all': sailAll.open = true; return true;
		case 'barter-sail-all-drop': sailAll.open = false; return true;
		case 'barter-sail-all-go': {
			const on = sailing();
			const plan = sailedPlan();
			if (!on || !plan) return false;
			// The quests first: handing them in redraws the run without the
			// stops put in for them, and the stops ticked are the ones left.
			// Handing a lot in frees the way for takers left out before,
			// and the run laid again takes them in: so again, until the run
			// has nothing left to hand in.
			let claimed = 0;
			for (let round = 0; sailAll.quests && round < 6; round++) {
				const list = [...(plan.questsHome || []), ...plan.stops.flatMap(s => s.quests || [])].filter(x => x.step.what !== 'hunt').map(x => x.q).filter((q, i, a) => a.indexOf(q) === i && !questDone(q) && rewardOf(q));
				if (!list.length) break;
				store.claimQuests(list.map(q => ({ id: q.id, delta: rewardOf(q), key: periodKey(cadenceOf(q)) })), list.length === 1 ? T('Handed in {n} quest along the run', { n: list.length }) : T('Handed in {n} quests along the run', { n: list.length }));
				claimed += list.length;
			}
			const stops = plan.stops;
			if (sailAll.stops) on.done = [...new Set([...on.done, ...stops.map((s, i) => stopKey(s, i, stops))])];
			sailAll.open = false;
			persist();
			if (!claimed) cheer({ big: true });
			// Ticking the lot never asks what an island paid, and most of
			// what a climb trades pays a range -- so say what will be
			// guessed at while the stops are still there to be pressed.
			const guessing = sailAll.stops ? unsaid(sailedPlan() || plan, on).length : 0;
			const guessSaid = guessing
				? ` · ${guessing === 1
					? T('{n} island’s pay was not said, so it is recorded at the middle of its range', { n: guessing })
					: T('{n} islands’ pay was not said, so they are recorded at the middle of their range', { n: guessing })}`
				: '';
			toast(`${sailAll.stops ? T('Every stop ticked off') : T('Nothing ticked')}${claimed ? ` · ${claimed === 1 ? T('{n} quest handed in, the rewards in the bags', { n: claimed }) : T('{n} quests handed in, the rewards in the bags', { n: claimed })}` : ''}${guessSaid}${sailAll.stops ? ` — ${T('Record the trip puts it in the Inventory')}` : ''}`, claimed > 0);
			return true;
		}
		case 'barter-stop-done': {
			const on = sailing() || (el.dataset.map ? sail : null);
			if (!on) return false;
			const k = String(el.dataset.k);
			if (on.done.includes(k)) { on.done = on.done.filter(x => x !== k); persist(); } else markDone(on, k);
			// The cockpit follows the run rather than the last thing pressed.
			cursor = null;
			return true;
		}
		case 'barter-sold': {
			const on = sailing() || (el.dataset.map ? sail : null);
			if (!on) return false;
			const k = String(el.dataset.k);
			on.kept = el.checked ? (on.kept || []).filter(x => x !== k) : [...(on.kept || []), k];
			persist();
			return true;
		}
		case 'barter-paid': {
			const on = sailing() || (el.dataset.map ? sail : null);
			if (!on) return false;
			const n = Number(el.dataset.n);
			if (on.seen[el.dataset.npc] === n) delete on.seen[el.dataset.npc]; else on.seen[el.dataset.npc] = n;
			persist();
			// Saying what the island paid is saying the exchange was made:
			// the stop is done with it, one press instead of two.
			if (on.seen[el.dataset.npc] && !on.done.includes(`n${el.dataset.npc}`)) markDone(on, `n${el.dataset.npc}`);
			cursor = null;
			return true;
		}
		// The floors that were holding the run back, let go of together.
		case 'barter-floor-clear': {
			const lvs = String(el.dataset.lvs || '').split(',').map(Number).filter(n => n >= 1 && n <= 6);
			if (!lvs.length) return true;
			const floors = { ...ordersNow().floors };
			for (const lv of lvs) delete floors[lv];
			setOrders({ floors });
			toast(lvs.length === 1
				? T('The [Level {lv}] floor is gone — the run may spend what you hold', { lv: lvs[0] })
				: T('{n} floors are gone — the run may spend what you hold', { n: lvs.length }));
			return true;
		}
		case 'barter-record': recordTrip(sailedPlan(), fromPort()); return false;
		case 'barter-record-stranded': {
			const on = stranded();
			if (!on) return false;
			// From the harbour it was sailed from, not the one on screen now.
			recordTrip(planOfSail(on), ports.find(p => p.id === on.port) || fromPort(), on);
			return true;
		}
		case 'barter-propose': routes.ids = String(el.dataset.ids || '').split('\n').filter(Boolean); routesAuto = ''; persist(); return true;
		// The worker answered: nothing to change, the screen redraws.
		case 'barter-redraw': return true;
		case 'barter-fill': {
			if (!lastSearch || filling) return false;
			routesAuto = '';
			const seed = routes.ids.slice();
			const take = ({ best }) => {
				filling = false;
				if (best) { routes.ids = best.ids; persist(); } else toast(T('Nothing pays beside what is ticked'));
			};
			const found = proposeAsync({ ...lastSearch, seed }, 'fill', result => { take(result); redrawSoon(); });
			if (found) take(found); else filling = true;
			return true;
		}
		default: return false;
	}
}

/** A filter typed on the tab: true when the screen should redraw. */
export function barterType(el) {
	if (el.dataset.act === 'barter-hold-q') { holdQ = el.value; return true; }
	if (el.dataset.act === 'barter-chain-q') { chainQ = el.value; return true; }
	if (el.dataset.act === 'barter-mat-q') { matQ = el.value; return true; }
	return false;
}

/** A value typed or chosen on the tab. */
export function barterChange(el, parseAmount) {
	switch (el.dataset.act) {
		case 'barter-paid-n': {
			const on = sailing() || (el.dataset.map ? sail : null);
			if (!on) return false;
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			if (n > 0) on.seen[el.dataset.npc] = Math.floor(n); else delete on.seen[el.dataset.npc];
			persist();
			if (n > 0 && !on.done.includes(`n${el.dataset.npc}`)) markDone(on, `n${el.dataset.npc}`);
			return true;
		}
		case 'barter-port': port = ports.some(p => p.id === Number(el.value)) ? Number(el.value) : 0; persist(); return true;
		case 'barter-qty': {
			const n = parseAmount(el.value);
			if (n === null) return true;
			qty = Math.max(1, Math.min(9999, Math.floor(n)));
			if (itemNow()) wants[itemNow()] = qty;
			persist();
			return true;
		}
		case 'barter-mat-reach': matOrders = { ...matOrders, reach: el.value === 'all' ? 'all' : 'want' }; persist(); return true;
		case 'barter-mat-calls': matOrders = { ...matOrders, calls: el.checked }; persist(); return true;
		case 'barter-mat-pace': matOrders = { ...matOrders, pace: el.value === 'fast' ? 'fast' : 'full' }; persist(); return true;
		case 'barter-good-set': {
			const n = parseAmount(el.value);
			if (n === null) return true;
			const have = aboardStock()[el.dataset.item] || 0;
			store.addStock(el.dataset.item, Math.max(0, Math.floor(n)) - have, T('{item}: {before} → {after} aboard', { item: el.dataset.item, before: F(have), after: F(Math.max(0, Math.floor(n))) }), false);
			return true;
		}
		case 'barter-pace': retickIfAuto(); setOrders({ pace: el.value === 'full' ? 'full' : el.value === 'steady' ? 'steady' : 'fast' }); return true;
		case 'barter-way': setOrders({ way: el.value === 'chain' ? 'chain' : 'sea' }); return true;
		case 'barter-sail-all-pick': sailAll[el.dataset.id === 'quests' ? 'quests' : 'stops'] = !!el.checked; return false;
		case 'barter-quests': setOrders({ quests: QUEST_CHOICES.some(([q]) => q === el.value) ? el.value : 'no' }); return true;
		case 'barter-mat-quests': matOrders = { ...matOrders, quests: QUEST_CHOICES.some(([q]) => q === el.value) ? el.value : 'no' }; persist(); return true;
		case 'barter-sell': setOrders({ sell: Number(el.value) }); return true;
		case 'barter-buy': retickIfAuto(); setOrders({ buy: el.value !== 'no', landFrom: el.value === 'stock' ? 'stock' : 'buy' }); return true;
		case 'barter-land-from': setOrders({ buy: true, landFrom: el.dataset.id === 'stock' ? 'stock' : 'buy' }); return true;
		case 'barter-vouchers': setOrders({ vouchers: el.value === 'keep' ? 'keep' : 'use' }); return true;
		case 'barter-pause': {
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			const key = el.dataset.at === 'call' ? 'call' : 'isle';
			setOrders({ pause: { ...ordersNow().pause, [key]: Math.max(0, Math.min(PAUSE_MAX, Math.floor(n))) } });
			return true;
		}
		case 'barter-hours': setOrders({ hours: Number(el.value) }); return true;
		case 'barter-ratio': setOrders({ count: el.value }); return true;
		case 'barter-floor': {
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			const floors = { ...ordersNow().floors };
			if (n > 0) floors[el.dataset.lv] = Math.floor(n); else delete floors[el.dataset.lv];
			setOrders({ floors });
			return true;
		}
		case 'barter-stash': stash = STASHES.includes(el.value) ? el.value : ''; persist(); return true;
		case 'barter-target': {
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			stockGoal = { ...stockGoal, targets: { ...stockGoal.targets, [el.dataset.lv]: Math.max(0, Math.floor(n)) } };
			persist();
			return true;
		}
		case 'barter-ceiling': stockGoal = { ...stockGoal, ceiling: STOCK_LEVELS.includes(Number(el.value)) ? Number(el.value) : stockGoal.ceiling }; persist(); return true;
		default: return false;
	}
}

/** The stops as a chart link fragment, for the Map to take in. */
export function chartFragment(el) {
	const ids = String(el.dataset.ids || '').split('.').filter(Boolean);
	if (!ids.length) { toast(T('Nothing to draw')); return null; }
	const parts = [`r=${ids.join('.')}`];
	if (port) parts.push(`s=${port}`);
	if (el.dataset.pick) parts.push(`p=${encodeURIComponent(el.dataset.pick)}`);
	if (el.dataset.trades) parts.push(`x=${encodeURIComponent(el.dataset.trades)}`);
	if (el.dataset.stash && el.dataset.stash !== '[]') parts.push(`w=${encodeURIComponent(el.dataset.stash)}`);
	return parts.join(';');
}
