// The Barter tab's view: what it keeps in the profile, read back when
// another copy of it arrives (a sync, an import), and written a moment
// after a change so a burst of ticks is one write. A route edit is
// written as a change Undo can take back.

import * as store from '../state.js';
import { combos } from '../ui-state.js';
import { barterKey } from '../clock.js';
import { candidates } from '../barter-board.js';
import { npcById, ports } from '../barter_npcs.js';
import { QUEST_CHOICES, DEFAULT_STOCK, STOCK_LEVELS, readStock } from '../barter-orders.js';
import { imagesOn } from '../shot-reader.js';
import { driftOf } from '../layout-book.js';
import { V, STEP_KEY, STEPS } from './state.js';
import { readWindow } from './board.js';
import { STASHES } from './route.js';
import { cleanApplied, syncHold } from './sail.js';

export const VOUCHER = "Crow's Trade Voucher";

/* ------------------------------------------------------------------ *
 * what the tab remembers
 * ------------------------------------------------------------------ */

// The tab's view lives in the profile under `views.barter` -- written
// the quiet way, no history entry, and so kept per profile, synced and
// exported with the rest. It used to be this localStorage key, which
// is brought across once and left where it is for an older build.
export const VIEW_NS = 'barter';
const LEGACY_KEY = 'bdo-tracker/barter-view';
export const editsBy = new Map();   // the edits of other sets of chains this session, by their key
export const legsCache = new Map();   // the legs of a run bent round the land, by its stops
export function setStep(v) {
	V.step = STEPS.includes(v) ? v : '';
	try { if (V.step) localStorage.setItem(STEP_KEY, V.step); else localStorage.removeItem(STEP_KEY); } catch { /* the session keeps it */ }
}

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
export function restore() {
	if (V.writeTimer || V.writing) return;
	if (!V.migrated) {
		V.migrated = true;
		// The write inside migrateView redraws the page through the
		// store's listeners, once, the first time a profile is opened
		// on this build; the redraw reads the view then and this call
		// finds it already read.
		store.migrateView(VIEW_NS, LEGACY_KEY, x => x);
	}
	const s = store.getView(VIEW_NS);
	const sig = s ? JSON.stringify(s) : null;
	if (sig === V.readSig) return;
	V.readSig = sig;
	V.goal = 'silver'; V.climb = 0; V.item = null; V.qty = 1; V.wants = {};
	V.stockGoal = { ...DEFAULT_STOCK, targets: { ...DEFAULT_STOCK.targets } };
	V.matOrders = { reach: 'want', calls: true, pace: 'full', quests: 'near' };
	V.port = 0; V.routes = { key: '', ids: [] }; V.shape = 'full'; V.routesOther = { key: '', ids: [] }; V.stash = ''; V.sail = null; V.reach = ''; V.planSec = 'ladder'; V.ownWay = false;
	V.board = { day: '', answers: [], own: false }; V.matBoard = { day: '', answers: [], on: [] };
	V.questSkip = { day: '', ids: [] }; V.questPull = { day: '', ids: [] }; V.routeEdit = { key: '', skip: [], nudge: {}, trips: [] }; V.advOpen = false; V.packed = new Set(); V.packLog = { delta: {}, moves: [] };
	if (!s) return;
	try {
		if (['material', 'stock', 'coin'].includes(s.goal)) V.goal = s.goal;
		if (s.stock) V.stockGoal = readStock(s.stock);
		if (STOCK_LEVELS.includes(Number(s.climb)) && Number(s.climb) < 7) V.climb = Number(s.climb);
		if (['parley', 'ladder', 'how', 'chains', 'all', 'none'].includes(s.planSec)) V.planSec = s.planSec;
		V.ownWay = s.ownWay === true;
		if (Array.isArray(s.packed)) V.packed = new Set(s.packed.filter(k => typeof k === 'string' && k.startsWith('g|')));
		if (s.packLog) V.packLog = cleanApplied(s.packLog);
		if (s.routeEdit && typeof s.routeEdit.key === 'string') V.routeEdit = { key: s.routeEdit.key, skip: Array.isArray(s.routeEdit.skip) ? s.routeEdit.skip.map(Number).filter(Number.isFinite).slice(0, 40) : [], nudge: Object.fromEntries(Object.entries(s.routeEdit.nudge || {}).map(([k, v]) => [k, Math.max(-20, Math.min(20, Math.round(Number(v) || 0)))]).filter(([, v]) => v).slice(0, 40)), trips: Array.isArray(s.routeEdit.trips) ? s.routeEdit.trips.filter(x => typeof x === 'string').slice(0, 12) : [] };
		// The orders start shut on every visit: they are set once and
		// forgotten, and a page that opens on all ten of them is a page a
		// new sailor backs out of. (A view that asks for them open is
		// honoured, never written.)
		if (s.advOpen === true) V.advOpen = true;
		if (typeof s.item === 'string') V.item = s.item;
		if (Number(s.qty) > 0) V.qty = Math.min(9999, Math.floor(Number(s.qty)));
		if (s.wants && typeof s.wants === 'object') for (const [k, v] of Object.entries(s.wants)) if (typeof k === 'string' && Number(v) > 0) V.wants[k] = Math.min(9999999, Math.floor(Number(v)));
		if (s.matOrders && typeof s.matOrders === 'object') V.matOrders = { reach: s.matOrders.reach === 'all' ? 'all' : 'want', calls: s.matOrders.calls !== false, pace: s.matOrders.pace === 'fast' ? 'fast' : 'full', quests: QUEST_CHOICES.some(([q]) => q === s.matOrders.quests) ? s.matOrders.quests : 'near', order: ['rich', 'tiers'].includes(s.matOrders.order) ? s.matOrders.order : 'short' };
		if (ports.some(p => p.id === Number(s.port))) V.port = Number(s.port);
		if (STASHES.includes(s.stash)) V.stash = s.stash;
		if (s.routes && typeof s.routes.key === 'string' && Array.isArray(s.routes.ids)) V.routes = { key: s.routes.key, ids: s.routes.ids.filter(id => typeof id === 'string') };
		if (s.shape === 'short') V.shape = 'short';
		if (s.routesOther && typeof s.routesOther.key === 'string' && Array.isArray(s.routesOther.ids)) V.routesOther = { key: s.routesOther.key, ids: s.routesOther.ids.filter(id => typeof id === 'string') };
		if (s.sail && typeof s.sail.key === 'string' && Array.isArray(s.sail.done)) {
			// The run's own record rides along: what was loaded, the
			// figures, the chains, the quests to hand in at home.
			const keep = {};
			// What was bought for the run and the Parley it was planned on
			// ride along too. They were written and never read back, so a
			// run that outlived its page -- a phone gone to sleep, a tab
			// reloaded an hour in, which is most runs -- was recorded as if
			// its shore goods had cost nothing.
			for (const k of ['loaded', 'bagLoaded', 'bagFromHold', 'bought', 'parleyUsed', 'cost', 'silver', 'net', 'trades', 'questsHome', 'chains', 'goal', 'item', 'time', 'port', 'drawnAt', 'lastTick', 'weightStart', 'laidFor', 'appliedN', 'cal']) if (s.sail[k] !== undefined) keep[k] = s.sail[k];
			if (s.sail.applied) keep.applied = cleanApplied(s.sail.applied);
			if (s.sail.packLog) keep.packLog = cleanApplied(s.sail.packLog);
			if (Array.isArray(s.sail.told)) keep.told = s.sail.told.filter(x => x && typeof x.item === 'string' && typeof x.g === 'string');
			V.sail = { key: s.sail.key, done: s.sail.done.map(String), seen: {}, got: {}, kept: Array.isArray(s.sail.kept) ? s.sail.kept.map(String) : [], stops: Array.isArray(s.sail.stops) ? s.sail.stops : [], ...keep };
			for (const [k, v] of Object.entries(s.sail.seen || {})) if (Number(v) > 0) V.sail.seen[k] = Number(v);
			for (const [k, v] of Object.entries(s.sail.got || {})) if (typeof v === 'string') V.sail.got[k] = v;
			// The vouchers said drawn, by stop, and the bar read off the window.
			const vouch = Object.entries(s.sail.vouch || {}).filter(([k, v]) => typeof k === 'string' && Number(v) >= 0);
			if (vouch.length) V.sail.vouch = Object.fromEntries(vouch.map(([k, v]) => [k, Math.min(4, Math.floor(Number(v)))]));
			if (s.sail.parleyFix && typeof s.sail.parleyFix.k === 'string' && Number(s.sail.parleyFix.bar) >= 0) V.sail.parleyFix = { k: s.sail.parleyFix.k, bar: Math.min(1_000_000, Math.round(Number(s.sail.parleyFix.bar))) };
			// The stops traded another number of times than the run said.
			const did = Object.entries(s.sail.did || {}).filter(([, v]) => Number(v) > 0);
			if (did.length) V.sail.did = Object.fromEntries(did.map(([k, v]) => [k, Math.min(9999, Math.floor(Number(v)))]));
			// The legs timed with Arrived, by stop: seconds from the Traded before.
			const arrived = Object.entries(s.sail.arrived || {}).filter(([, v]) => Number(v) > 0);
			if (arrived.length) V.sail.arrived = Object.fromEntries(arrived.map(([k, v]) => [k, Math.round(Number(v))]));
		}
		if (typeof s.reach === 'string') V.reach = s.reach;
		if (s.questSkip && typeof s.questSkip.day === 'string' && Array.isArray(s.questSkip.ids)) V.questSkip = { day: s.questSkip.day, ids: s.questSkip.ids.filter(id => typeof id === 'string') };
		if (s.questPull && typeof s.questPull.day === 'string' && Array.isArray(s.questPull.ids)) V.questPull = { day: s.questPull.day, ids: s.questPull.ids.filter(id => typeof id === 'string') };
		V.matAt = npcById.has(Number(s.matAt)) ? Number(s.matAt) : 0;
		if (s.matBoard && Array.isArray(s.matBoard.answers)) {
			V.matBoard = {
				day: String(s.matBoard.day || ''),
				// `took` marks an island ticked from a board on file or from
				// another sailor's reading rather than read off the window.
				answers: s.matBoard.answers.filter(a => a && npcById.has(Number(a.npcId)) && typeof a.give === 'string' && typeof a.recv === 'string').map(a => ({ npcId: Number(a.npcId), give: a.give, recv: a.recv, ...(a.took === 'book' || a.took === 'fleet' ? { took: a.took } : {}) })),
				// Where a list taken rather than read came from: a board in
				// the book, or another sailor's reading.
				...(s.matBoard.from && (s.matBoard.from.kind === 'book' || s.matBoard.from.kind === 'fleet')
					? { from: { kind: s.matBoard.from.kind, id: String(s.matBoard.from.id || ''), name: String(s.matBoard.from.name || '').slice(0, 40) } }
					: {})
			};
			// A day kept before the run had its own list sailed for
			// every material ticked.
			V.matBoard.on = Array.isArray(s.matBoard.on) ? s.matBoard.on.filter(m => typeof m === 'string') : [];
			V.matBoard.off = Array.isArray(s.matBoard.off) ? s.matBoard.off.filter(m => typeof m === 'string') : [];
			// The attempts each island dealt on the runs recorded on this list.
			if (s.matBoard.used && typeof s.matBoard.used === 'object') V.matBoard.used = Object.fromEntries(Object.entries(s.matBoard.used).map(([k, v]) => [k, Math.max(0, Math.round(Number(v) || 0))]).filter(([k, v]) => npcById.has(Number(k)) && v > 0));
			else delete V.matBoard.used;   // kept before attempts were: read back from today's runs
			// The rolled islands were asked about once this list: not again.
			if (s.matBoard.asked === true) V.matBoard.asked = true;
		}
		if (s.board && Array.isArray(s.board.answers)) {
			V.board = {
				day: String(s.board.day || ''),
				answers: s.board.answers.filter(a => a && npcById.has(Number(a.npcId)) && typeof a.give === 'string' && typeof a.recv === 'string').map(a => ({ npcId: Number(a.npcId), give: a.give, recv: a.recv })),
				// A board sailed on the sailor's own word rather than on
				// one of the forty layouts.
				own: s.board.own === true,
				// The attempts the runs recorded on this board have used, island by
				// island, and the layout they were used on; the last run, when it
				// was stopped part-way; and whether the daily refill has passed
				// since the board was read.
				used: Object.fromEntries(Object.entries(s.board.used || {}).map(([k, v]) => [k, Math.max(0, Math.round(Number(v) || 0))]).filter(([k, v]) => npcById.has(Number(k)) && v > 0)),
				usedFor: typeof s.board.usedFor === 'string' ? s.board.usedFor : '',
				last: s.board.last && Array.isArray(s.board.last.ids) ? { at: Number(s.board.last.at) || 0, ids: s.board.last.ids.filter(x => typeof x === 'string'), isles: (s.board.last.isles || []).filter(Array.isArray).map(l => l.map(Number).filter(Number.isFinite)), done: Number(s.board.last.done) || 0, all: Number(s.board.last.all) || 0, off: s.board.last.off === true } : null,
				rolled: s.board.rolled === true,
				pinned: typeof s.board.pinned === 'string' ? s.board.pinned : '',
				pinnedAt: Number(s.board.pinnedAt) || 0,
				fresh: s.board.fresh === true,
				freshAt: Number(s.board.freshAt) || 0
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
export function persist() {
	oneLayout();
	if (V.writeTimer) clearTimeout(V.writeTimer);
	V.writeTimer = setTimeout(flushView, 250);
	logBoard();
}

/**
 * One layout at a time. A board read on the trade list puts down the
 * material list read before it, and the other way round: a refresh in
 * game deals a new board, so the list read last is the one in front of
 * the sailor and the other is yesterday's news. Said by what was read
 * -- the answers -- so a board the page picks up by itself from the
 * last run's history changes nothing. Not while a run is under way:
 * the run was laid on the board it sails.
 */
const sigOf = answers => answers.map(a => `${a.npcId}|${a.give}|${a.recv}`).sort().join('\n');
let seen = null;
function oneLayout() {
	const now = { trade: sigOf(V.board.answers || []), material: sigOf(V.matBoard.answers || []) };
	if (!seen) { seen = now; return; }
	const traded = now.trade && now.trade !== seen.trade;
	const listed = now.material && now.material !== seen.material;
	if (!V.sail) {
		if (traded && !listed && now.material) {
			V.matBoard = { day: barterKey(), answers: [], on: V.matBoard.on || [], off: V.matBoard.off || [], used: {} };
			now.material = '';
		} else if (listed && !traded && (now.trade || V.board.pinned)) {
			V.board = { day: barterKey(), answers: [], own: false, fresh: true, freshAt: Date.now() };
			now.trade = '';
		}
	}
	seen = now;
}

/** Which list today's layout was read from last: 'trade', 'material', or
 *  '' when neither has one -- and 'both' only for a view kept from
 *  before the two were made to exclude each other. */
export function layoutSide() {
	const trade = (V.board.answers || []).length > 0 || !!V.board.pinned;
	const material = (V.matBoard.answers || []).length > 0 && V.matBoard.day === barterKey();
	return trade && material ? 'both' : trade ? 'trade' : material ? 'material' : '';
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
	if (!combos || !V.board.answers.length || V.board.day !== barterKey()) return;
	const fits = candidates(combos.combos, V.board.answers);
	const drifted = fits.length ? null : driftOf(combos.combos, V.board.answers);
	const id = fits.length === 1 ? fits[0].id : drifted ? drifted.id : null;
	if (!id) return;
	const day = String(V.board.day).slice(0, 10);
	const log = store.getProfile('boardLog', []) || [];
	if (log.some(x => x[0] === day && x[1] === id)) return;
	store.setProfileQuiet('boardLog', [...log, [day, id, drifted ? 1 : 0]]);
}

/** The view as memory holds it, for a write. The bag's packing marks
 *  ride with it: a reload before casting off kept every hold row's tick
 *  (they read the hold) and lost the bag's. */
export const viewNow = () => ({ goal: V.goal, climb: V.climb, planSec: V.planSec, ownWay: V.ownWay, routeEdit: V.routeEdit, stock: V.stockGoal, item: V.item, qty: V.qty, wants: V.wants, matOrders: V.matOrders, port: V.port, routes: V.routes, shape: V.shape, routesOther: V.routesOther, stash: V.stash, board: V.board, matBoard: V.matBoard, matAt: V.matAt, sail: V.sail, reach: V.reach, questSkip: V.questSkip, questPull: V.questPull, packed: [...V.packed].slice(0, 60), packLog: V.packLog });

/**
 * The view written now, as a change Undo can take back: an edit to the
 * route -- a stop moved or skipped, a trip moved or left out, the
 * planner's route again. Everything else the tab writes quietly.
 */
export function persistNamed(label) {
	if (V.writeTimer) { clearTimeout(V.writeTimer); V.writeTimer = null; }
	V.writing = true;
	try {
		syncHold();
		store.setViewNamed(VIEW_NS, viewNow(), label);
	} finally {
		V.writing = false;
	}
	V.readSig = JSON.stringify(store.getView(VIEW_NS));
}

/** Whether the tab is writing its own view down now: what it writes is
 *  what is on screen already, and the page is not drawn again for it. */
export const barterWritingView = () => V.writing === true;

function flushView() {
	if (!V.writeTimer) return;
	clearTimeout(V.writeTimer);
	V.writeTimer = null;
	// The store redraws the page from inside the write, before what was
	// written can be noted here; that redraw must not read it back over
	// the memory it came from.
	V.writing = true;
	try {
		syncHold();
		store.setView(VIEW_NS, viewNow());
	} finally {
		V.writing = false;
	}
	// What was just written is what is in memory: not to be read back.
	const s = store.getView(VIEW_NS);
	V.readSig = s ? JSON.stringify(s) : null;
}

// A write still owed when the page goes is made before it does.
if (typeof window !== 'undefined') {
	window.addEventListener('pagehide', flushView);
	document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushView(); });
	// A screenshot pasted at the tab itself, with no dialog open and
	// nothing asking for one. Both sailors who asked for the readers
	// asked for this: they have the picture on the clipboard already,
	// and finding the button first is a step that answers nothing. The
	// reading opens with the picture in hand. A paste into a field is
	// left alone, and so is one while a dialog is up -- the reading's
	// own dialog takes a paste itself.
	document.addEventListener('paste', e => {
		const screen = document.querySelector('.barter-screen');
		if (!screen || document.querySelector('#dialog:not([hidden])')) return;
		const at = e.target;
		if (at && (at.isContentEditable || /^(INPUT|TEXTAREA)$/.test(at.tagName || ''))) return;
		const files = imagesOn(e.clipboardData);
		if (!files.length) return;
		e.preventDefault();
		readWindow(redrawTab, files);
	});
	// Pictures dropped on the paste zone are read the same way.
	document.addEventListener('dragover', e => {
		const zone = e.target.closest && e.target.closest('.barter-screen .board-drop');
		if (!zone) return;
		e.preventDefault();
		zone.classList.add('over');
	});
	document.addEventListener('dragleave', e => {
		const zone = e.target.closest && e.target.closest('.barter-screen .board-drop');
		if (zone) zone.classList.remove('over');
	});
	document.addEventListener('drop', e => {
		const zone = e.target.closest && e.target.closest('.barter-screen .board-drop');
		if (!zone) return;
		e.preventDefault();
		zone.classList.remove('over');
		const files = [...((e.dataTransfer && e.dataTransfer.files) || [])].filter(f => /^image\//.test(f.type));
		if (files.length) readWindow(redrawTab, files);
	});
}

/** The tab drawn again from outside its own action handler. */
export function redrawTab() {
	const again = document.querySelector('[data-act="barter-redraw"]');
	if (again) again.click();
}
