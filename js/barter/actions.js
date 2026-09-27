// What a press, a change or a keystroke on the Barter tab does: one
// switch for the clicks, one for the fields, one for typing, each
// returning whether the tab should be drawn again.

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import * as store from '../state.js';
import { barterKey, periodKey } from '../clock.js';
import { currentShip, shownHold } from '../ship.js';
import { npcById, ports, isleShort } from '../barter_npcs.js';
import { noteLeg, LEARN_AT, timingLegs, setTimingLegs } from '../ship-pace.js';
import { cadenceOf } from '../quests.js';
import { questDone, rewardOf } from '../screen-quests.js';
import { QUEST_CHOICES, PAUSE_MAX, AIM_CHOICES, STOCK_LEVELS, SAIL_PRESETS, sailPresetOf } from '../barter-orders.js';
import { PARLEY, COIN_LEVEL, levelOf } from '../barter.js';
import { pickShots } from '../barter-import.js';
import { sawItToo } from '../sea-boards.js';
import { pageName as matPageName } from '../material-book-view.js';
import { TOWNS } from '../screen-inventory.js';
import { cutOf } from '../barter-short.js';
import { figure } from '../bag-shot.js';
import { openPicker } from '../picker.js';
import { openTripLog } from '../triplog.js';
import { toast, openDialog, closeDialog } from '../dialogs.js';
import { cheer } from '../cheer.js';
import { V, STEPS } from './state.js';
import { timerAction, timerState, timerNow, startTimer, stopTimer, passedStop, arrivedAt, spanText } from '../sail-timer.js';
import { fromPort, sailCal, itemNow, readWindow, takeFleetBoard, openBook, tellTheFleet, pickOffer, pickIsland, showGated, pickAnyIsland, boardNow } from './board.js';
import { openRolls } from './rolls.js';
import { castOffFx, bringUp } from './cockpit.js';
import { aboardStock, unloadTo, held, openSheet, shoreAboard } from './hold.js';
import { matBoardNow, matFleetNow, matFitNow, noteMatSeen, takeMatOffers, tellMatFleet, openMatBook, pickGood, pickMaterial, setMaterial } from './material.js';
import { packedNow, unloadMoves, packApply, toldOf } from './packing.js';
import { parleyRefilled, retickIfAuto, ordersNow, setOrders, applySaved, dropSaved, askSaveOrders, sellFrom, keepFrom, readBagShot, chainStepsDialog, chainClaimDialog } from './plan.js';
import { STASHES, bagSet, legsOf, skippedToday, pulledToday, ledgerOf } from './route.js';
import { sailKey, sailing, stopKey, ticked, runLabel, runMarks, owesCount, rangeOf, unsyncHold, abandonRun, markDone, sailRecord, planOfSail, stranded, sailedPlan, recordTrip } from './sail.js';
import { proposeAsync, redrawSoon } from './search.js';
import { setStep, restore, persist, persistNamed } from './view.js';

/** A click on the tab. Returns true when it was one of ours, with the
 *  screen to be redrawn by the caller. */
export function barterAction(act, el, redraw) {
	restore();
	V.lastRoute = null;
	if (act.startsWith('barter-timer-')) return timerAction(act, el, redraw);
	switch (act) {
		case 'barter-goal': V.goal = ['material', 'stock', 'coin'].includes(el.dataset.id) ? el.dataset.id : 'silver'; persist(); return true;
		// Which of the four steps is on the page. Asked for by hand, it
		// stays asked for: the page does not slide out from under a sailor
		// reading it because a stop was ticked somewhere else.
		case 'barter-step': setStep(STEPS.includes(el.dataset.id) ? el.dataset.id : 'plan'); bringUp('.barter-screen .steps'); return true;
		// Which part of the plan is open. Pressing the open one shuts it.
		case 'barter-sec': {
			const id = el.dataset.id;
			V.planSec = id === 'all' || id === 'none' ? id : V.planSec === id ? 'none' : id;
			if (V.planSec === id && id !== 'all' && id !== 'none') bringUp(`.plan-sec[data-sec="${id}"]`);
			persist();
			return true;
		}
		// "My own way" is a choice like the cards beside it: the first
		// press chooses it and opens the orders, a press after that
		// folds them away and back, and it stays chosen either way.
		case 'barter-adv':
			if (!V.ownWay && sailPresetOf(ordersNow())) { V.ownWay = true; V.advOpen = true; } else { V.ownWay = true; V.advOpen = !V.advOpen; }
			persist();
			return true;
		case 'barter-orders-fold': V.advOpen = !V.advOpen; persist(); return true;
		case 'barter-glance': V.glance = !V.glance; return true;
		case 'barter-slots': V.slotsOpen = !V.slotsOpen; return true;
		// A rung of the ladder: where the day's climbs end. On a coin day
		// the ceiling is the coin islands' own, so picking another rung is
		// asking for a different day, and says so by changing the goal.
		case 'barter-rung': {
			const lv = Number(el.dataset.lv);
			if (!STOCK_LEVELS.includes(lv)) return false;
			if (V.goal === 'stock') V.stockGoal = { ...V.stockGoal, ceiling: lv };
			else { if (V.goal === 'coin' && lv !== COIN_LEVEL) V.goal = 'silver'; V.climb = lv >= 7 ? 0 : lv; }
			persist();
			return true;
		}
		case 'barter-coin-node': V.goal = V.goal === 'coin' ? 'silver' : 'coin'; persist(); return true;
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
		// A thing on the packing list, fetched. A row that loads the hold
		// loads it for real, or unloads it; the bag's rows are a mark the
		// sailor keeps their place by, kept with the run.
		case 'barter-pack': {
			const k = String(el.dataset.k || '');
			const x = { key: k, item: el.dataset.item, n: Number(el.dataset.n) || 0, cost: Number(el.dataset.cost) || 0 };
			if (/^[bltasu]\|/.test(k)) { packApply([x], !packedNow(x), fromPort()); return true; }
			if (V.packed.has(k)) V.packed.delete(k); else V.packed.add(k);
			persist();
			return true;
		}
		// Every row of a group to one state: all aboard, or none. A row
		// already aboard ("a|") is ticked by being absent from the set.
		case 'barter-pack-all': {
			const want = el.dataset.on !== '1';
			const rows = JSON.parse(el.dataset.rows || '[]');
			const loads = rows.filter(x => /^[bltasu]\|/.test(x.key) && packedNow(x) !== want);
			if (loads.length) packApply(loads, want, fromPort());
			const marks = rows.filter(x => !/^[bltasu]\|/.test(x.key));
			for (const x of marks) if (want) V.packed.add(String(x.key)); else V.packed.delete(String(x.key));
			if (marks.length) persist();
			return true;
		}
		case 'barter-save': askSaveOrders(redraw); return false;
		case 'barter-saved': applySaved(el.dataset.name); return true;
		case 'barter-saved-drop': dropSaved(el.dataset.name); return true;
		case 'barter-aim': V.stockGoal = { ...V.stockGoal, aim: AIM_CHOICES.some(([a]) => a === el.dataset.id) ? el.dataset.id : 'fill' }; persist(); return true;
		// A sailing preset lays over the orders rather than replacing
		// them: what the ladder set stays exactly as the ladder left it.
		case 'barter-sail-preset': {
			const p = SAIL_PRESETS.find(x => x.id === el.dataset.id);
			if (p) { V.ownWay = false; retickIfAuto(); setOrders({ ...p.orders }); persist(); }
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
		case 'barter-quest-skip': V.questSkip = { day: barterKey(), ids: [...new Set([...skippedToday(), el.dataset.quest])] }; V.questPull = { day: barterKey(), ids: pulledToday().filter(id => id !== el.dataset.quest) }; persist(); return true;
		case 'barter-quest-unskip': V.questSkip = { day: barterKey(), ids: skippedToday().filter(id => id !== el.dataset.quest) }; persist(); return true;
		case 'barter-quest-pull': V.questPull = { day: barterKey(), ids: [...new Set([...pulledToday(), el.dataset.quest])] }; persist(); return true;
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
			const shoreGood = levelOf(item) === null;
			const n = shoreGood ? store.stockAt(item, store.ABOARD) : aboardStock()[item] || 0;
			if (!n) return false;
			const to = unloadTo();
			const put = t => store.applyTrip({ moves: unloadMoves(item, t), label: T('{n}× {item} unloaded at {town}', { n, item, town: t }) });
			if (to) { put(to); return false; }
			openPicker({
				title: T('Unload {n}× {item} where?', { n, item: gameName(item) }),
				hint: T('The storage the goods go into. Choose where the run sails from and the hold unloads there without asking.'),
				items: TOWNS.filter(t => t !== store.ABOARD).map(t => ({ id: t, label: gameName(t) })),
				onPick: t => { put(t); redraw(); }
			});
			return false;
		}
		// The whole hold ashore at once: every good aboard, trade goods
		// and shore goods, into the storage the run sails from.
		case 'barter-unload-all': {
			const items = [...held().map(g => g.name), ...shoreAboard().map(g => g.name)];
			if (!items.length) return false;
			const put = t => store.applyTrip({ moves: items.flatMap(i => unloadMoves(i, t)), label: T('The hold unloaded at {town}', { town: t }) });
			const to = unloadTo();
			if (to) { put(to); return false; }
			openPicker({
				title: T('Unload the whole hold where?'),
				hint: T('The storage the goods go into. Choose where the run sails from and the hold unloads there without asking.'),
				items: TOWNS.filter(t => t !== store.ABOARD).map(t => ({ id: t, label: gameName(t) })),
				onPick: t => { put(t); redraw(); }
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
			if (V.sail && Array.isArray(V.sail.loaded)) {
				V.sail.loaded = V.sail.loaded.map(l => (l.item === el.dataset.item ? { ...l, n: Math.max(0, l.n - n) } : l)).filter(l => l.n > 0);
				persist();
			}
			return false;
		}
		case 'barter-qty-short': V.qty = Math.max(1, Number(el.dataset.n) || 1); if (itemNow()) V.wants[itemNow()] = V.qty; persist(); return true;
		case 'barter-mat-pick': setMaterial(el.dataset.item === itemNow() ? '' : el.dataset.item); return true;
		case 'barter-mat-go': setMaterial(el.dataset.item); return true;
		case 'barter-mat-drop': {
			// Off the run, and put down too if it was the one open, so it
			// leaves the strip. Its islands stay ticked: the window still
			// shows them, whether or not the run goes for them.
			const mb = matBoardNow();
			mb.on = mb.on.filter(m => m !== el.dataset.item);
			if (itemNow() === el.dataset.item) setMaterial('');
			persist();
			return true;
		}
		case 'barter-mat-add': pickMaterial(redraw); return false;
		case 'barter-trip': openTripLog(); return false;
		case 'barter-board-ask': pickOffer(Number(el.dataset.npc), redraw); return false;
		// The paste zone, pressed: the pictures are chosen straight away,
		// and the reading opens with them.
		case 'barter-shot': pickShots(files => readWindow(redraw, files)); return false;
		case 'barter-bag-shot': pickShots(files => readBagShot(files)); return false;
		case 'barter-book': openBook(redraw); return false;
		case 'barter-fleet-take': takeFleetBoard(el.dataset.id, redraw); return false;
		case 'barter-fleet-tell': tellTheFleet(redraw); return false;
		// A board the record has never seen, sailed on the sailor's own
		// word rather than on the whole table's fiction.
		case 'barter-own-board': V.board.own = !V.board.own; persist(); return true;
		case 'barter-board-island': pickIsland(redraw); return false;
		case 'barter-gated': showGated(); return false;
		case 'barter-board-fix': pickAnyIsland(redraw); return false;
		case 'barter-shut-clear': store.setProfile('shutOffers', []); toast(T('Every island is back on the board'), true); return true;
		case 'barter-board-undo': V.board.answers.pop(); persist(); return true;
		case 'barter-rolls': { const b = boardNow(); if (b.combo) openRolls(b.combo, redraw); return false; }
		case 'barter-pace-set': setOrders({ pace: el.dataset.id === 'full' ? 'full' : el.dataset.id === 'steady' ? 'steady' : 'fast' }); return true;
		case 'barter-mat-pace-set': V.matOrders = { ...V.matOrders, pace: el.dataset.id === 'fast' ? 'fast' : 'full' }; persist(); return true;
		case 'barter-mat-tick': {
			const mb = matBoardNow();
			const npcId = Number(el.dataset.npc), give = el.dataset.give, recv = itemNow();
			const i = mb.answers.findIndex(a => a.npcId === npcId);
			const same = i >= 0 && mb.answers[i].give === give && mb.answers[i].recv === recv;
			// A tick taken from a board, pressed, is the sailor saying the
			// window shows it: it becomes a reading. Pressed again, it goes.
			if (same && mb.answers[i].took) { delete mb.answers[i].took; persist(); noteMatSeen(); return true; }
			if (i >= 0) mb.answers.splice(i, 1);   // an island shows one exchange: a new tick replaces the old
			if (!same) mb.answers.push({ npcId, give, recv });
			if (!same && !mb.on.includes(recv)) mb.on.push(recv);
			persist();
			// Into the record, so the material list's habits can be learnt.
			const seen = { ...(store.getProfile('matSeen', {}) || {}) };
			seen[mb.day] = mb.answers.map(a => [a.npcId, a.give, a.recv]);
			store.setProfileQuiet('matSeen', seen);
			return true;
		}
		case 'barter-mat-book': openMatBook(redraw); return false;
		case 'barter-mat-whole': matBoardNow().whole = true; persist(); return true;
		case 'barter-mat-tell': tellMatFleet(redraw); return false;
		case 'barter-mat-fill': {
			const fit = matFitNow();
			if (!fit.sure) return true;
			const n = takeMatOffers(fit.fill, 'book');
			toast(n === 1 ? T('{n} island ticked from {board}', { n, board: matPageName(fit.best.page) }) : T('{n} islands ticked from {board}', { n, board: matPageName(fit.best.page) }), true);
			return true;
		}
		case 'barter-mat-fleet-take': {
			const seen = matFleetNow().find(b => String(b.id) === String(el.dataset.id));
			if (!seen) return true;
			// Their islands stand in for the ones not read here; one read
			// here keeps its own answer.
			const n = takeMatOffers(seen.offers.map(o => ({ npcId: o[0], give: String(o[1]), recv: String(o[3]) })), 'fleet');
			matBoardNow().from = { kind: 'fleet', name: seen.name ? String(seen.name).slice(0, 40) : '' };
			persist();
			toast(n === 1 ? T('Today’s material list as {who} read it: {n} island ticked', { who: seen.name ? seen.name : T('another sailor'), n }) : T('Today’s material list as {who} read it: {n} islands ticked', { who: seen.name ? seen.name : T('another sailor'), n }), true);
			if (!seen.mine && !seen.confirmed) sawItToo(seen.id).then(() => { V.matFleet.asked = false; });
			return true;
		}
		case 'barter-mat-clear':
			V.matBoard = { day: barterKey(), answers: [], on: matBoardNow().on, told: 0 };
			// A refresh in game fills the Parley bar again; clearing the
			// day's list by hand says nothing about the bar.
			if (!el.dataset.keepParley) parleyRefilled();
			persist();
			return true;
		case 'barter-mat-only': V.matOnly = V.matOnly === el.dataset.id ? '' : el.dataset.id; return true;
		case 'barter-mat-lv': V.matLv = V.matLv === Number(el.dataset.lv) ? 0 : Number(el.dataset.lv); return true;
		case 'barter-mat-filters-clear': V.matQ = ''; V.matOnly = ''; V.matLv = 0; return true;
		// From the material run to the item board: the chains that reach
		// the give not held, and no others, until cleared.
		case 'barter-reach': V.reach = el.dataset.item || ''; V.goal = 'silver'; persist(); return true;
		case 'barter-reach-clear': V.reach = ''; persist(); return true;
		case 'barter-board-clear': V.board = { day: barterKey(), answers: [], own: false, fresh: true, freshAt: Date.now() }; parleyRefilled(); persist(); return true;
		case 'barter-board-same': V.board = { ...V.board, rolled: false }; persist(); return true;
		case 'barter-port-set': V.port = ports.some(p => p.id === Number(el.dataset.id)) ? Number(el.dataset.id) : 0; persistNamed(T('Changed where the run sails from')); return true;
		case 'barter-continue': {
			const ids = String(el.dataset.ids || '').split('\n').filter(Boolean);
			if (!ids.length) return false;
			V.routes.ids = ids;
			V.routesAuto = '';
			if (V.board.last) V.board = { ...V.board, last: { ...V.board.last, off: true } };
			persistNamed(T('Continued the last run'));
			return true;
		}
		case 'barter-continue-drop': if (V.board.last) V.board = { ...V.board, last: { ...V.board.last, off: true } }; persist(); return true;
		case 'barter-chain-steps': chainStepsDialog(el.dataset.id); return false;
		case 'barter-chain-claim': chainClaimDialog(el.dataset.id, el.dataset.group || ''); return false;
		// One of two chains on the same pile, picked in the dialog: it is
		// ticked, and the chains that would have taken its goods are not.
		case 'barter-claim-pick': {
			const id = el.dataset.id;
			const drop = new Set([...String(el.dataset.drop || '').split('\n'), ...String(el.dataset.group || '').split('\n')].filter(Boolean));
			drop.delete(id);
			V.routes.ids = [...V.routes.ids.filter(x => !drop.has(x) && x !== id), id];
			V.routesAuto = '';
			persist();
			closeDialog();
			return true;
		}
		case 'barter-chain': {
			// Ticked, a start replaces the ladder's other starts: one
			// climb up those islands, from one place.
			const id = el.dataset.id;
			const group = String(el.dataset.group || '').split('\n').filter(Boolean);
			V.routes.ids = V.routes.ids.includes(id) ? V.routes.ids.filter(x => x !== id) : [...V.routes.ids.filter(x => !group.includes(x)), id];
			V.routesAuto = '';
			persist();
			return true;
		}
		// A trip left out on the wharf step: its chains unticked, the run
		// laid again without them.
		case 'barter-trip-drop': {
			const ids = String(el.dataset.ids || '').split('\n').filter(Boolean);
			if (!ids.length) return false;
			V.routes.ids = V.routes.ids.filter(x => !ids.includes(x));
			V.routesAuto = '';
			persistNamed(T('Left a trip out of the run'));
			return true;
		}
		// A trip sailed sooner or later: the order of every trip after the
		// first, as the wharf step drew them, with this one moved a place.
		case 'barter-trip-move': {
			const keys = String(el.dataset.keys || '').split('\n').filter(Boolean);
			const i = keys.indexOf(String(el.dataset.key)), j = i + Number(el.dataset.by || 0);
			if (i < 0 || j < 0 || j >= keys.length) return false;
			[keys[i], keys[j]] = [keys[j], keys[i]];
			V.routeEdit = { ...V.routeEdit, trips: keys };
			persistNamed(T('Moved a trip'));
			return true;
		}
		case 'barter-chain-start': {
			const id = el.dataset.id;
			const group = String(el.dataset.group || '').split('\n').filter(Boolean);
			V.routes.ids = [...V.routes.ids.filter(x => !group.includes(x)), id];
			V.routesAuto = '';
			persist();
			return true;
		}
		case 'barter-chains-clear': V.routes.ids = []; V.routesAuto = ''; persist(); return true;
		// Full run or short trip: each keeps its own ticks, so going back
		// finds them as they were.
		case 'barter-shape': {
			const want = el.dataset.id === 'short' ? 'short' : 'full';
			if (want === V.shape) return false;
			[V.routes, V.routesOther] = [V.routesOther, V.routes];
			V.shape = want;
			V.routesAuto = '';
			persist();
			return true;
		}
		// A trade put on the short trip, or a picked one taken an island
		// further: the longer cut stands where the shorter one was.
		case 'barter-short-add': {
			const id = el.dataset.id, grows = el.dataset.grows;
			if (!id || V.routes.ids.includes(id)) return false;
			V.routes.ids = grows && V.routes.ids.includes(grows) ? V.routes.ids.map(x => (x === grows ? id : x)) : [...V.routes.ids, id];
			persistNamed(T('Added a trade to the short trip'));
			return true;
		}
		case 'barter-short-drop': {
			if (!V.routes.ids.includes(el.dataset.id)) return false;
			V.routes.ids = V.routes.ids.filter(x => x !== el.dataset.id);
			persistNamed(T('Took a trade off the short trip'));
			return true;
		}
		case 'barter-short-back': {
			const { base, k } = cutOf(el.dataset.id);
			if (k < 1 || !V.routes.ids.includes(el.dataset.id)) return false;
			V.routes.ids = V.routes.ids.map(x => (x === el.dataset.id ? `${base}>${k - 1}` : x));
			persistNamed(T('Stopped a trade one island sooner'));
			return true;
		}
		case 'barter-hold-lv': { const lv = Number(el.dataset.lv); if (V.holdLv.has(lv)) V.holdLv.delete(lv); else V.holdLv.add(lv); return true; }
		case 'barter-hold-at': V.holdAt = V.holdAt === el.dataset.town ? '' : el.dataset.town; return true;
		case 'barter-hold-clear': V.holdQ = ''; V.holdLv = new Set(); V.holdAt = ''; return true;
		case 'barter-chain-from': V.chainFrom = V.chainFrom === el.dataset.id ? '' : el.dataset.id; return true;
		case 'barter-chain-top': { const lv = el.dataset.lv === 'coin' ? 'coin' : Number(el.dataset.lv); V.chainTop = V.chainTop === lv ? 0 : lv; return true; }
		case 'barter-chain-clear': V.chainQ = ''; V.chainFrom = ''; V.chainTop = 0; return true;
		// Casting off from the wharf: the same checklist the Map's own
		// "Sail this run" makes, and the cockpit opened over it.
		case 'barter-route-skip': {
			const id = Number(el.dataset.npc);
			if (id && !V.routeEdit.skip.includes(id)) V.routeEdit = { ...V.routeEdit, skip: [...V.routeEdit.skip, id] };
			persistNamed(T('Took an island off the route'));
			toast(T('{isle} is off the route — the chain stops before it, and the route is laid again', { isle: isleShort(npcById.get(id)) || String(id) }));
			return true;
		}
		case 'barter-route-unskip': {
			const id = Number(el.dataset.npc);
			V.routeEdit = { ...V.routeEdit, skip: V.routeEdit.skip.filter(x => x !== id) };
			persistNamed(T('Put an island back on the route'));
			return true;
		}
		case 'barter-route-nudge': {
			const id = String(el.dataset.npc);
			const by = (V.routeEdit.nudge[id] || 0) + Number(el.dataset.by || 0);
			const nudge = { ...V.routeEdit.nudge };
			if (by) nudge[id] = Math.max(-20, Math.min(20, by)); else delete nudge[id];
			V.routeEdit = { ...V.routeEdit, nudge };
			persistNamed(T('Moved a stop on the route'));
			return true;
		}
		case 'barter-route-reset': V.routeEdit = { ...V.routeEdit, skip: [], nudge: {}, trips: [] }; persistNamed(T('Back to the optimised route')); return true;
		case 'barter-cast-off': {
			if (!barterAction('barter-sail', el, redraw)) return false;
			setStep('sail');
			V.cursor = null;
			V.skipped = new Set();
			V.lastTrip = null;
			bringUp('.barter-screen .steps');
			setTimeout(castOffFx, 0);
			return true;
		}
		case 'barter-sail': {
			if (!V.shownPlan) return false;
			// The packing the wharf step wrote goes with the run, for Abandon
			// to put back; and what the step said, to be read on the way.
			V.sail = { key: sailKey(), done: [], seen: {}, got: {}, kept: [], laidFor: '{}', cal: sailCal(), ...sailRecord(V.shownPlan), packLog: V.packLog, told: toldOf(V.shownPlan, fromPort()) };
			V.packLog = { delta: {}, moves: [] };
			// Sailing starts the clock, since that press is the moment the
			// ship leaves -- and it is the gesture the browser wants before
			// the page is allowed to make a sound.
			//
			// Said out loud, because it used to happen in silence: a
			// sailor who never asked for a clock, and never saw one start,
			// came back from the kitchen to a number counting up at them
			// with no idea what had set it going or how to set it right.
			const legs = legsOf(V.shownPlan.stops);
			// A clock already running is left alone only when it is this
			// run's own and still has time on it -- the sailor pressed
			// start a moment before pressing Sail. Any other clock is a
			// run that is over: it used to be kept, so the second run of
			// a day sailed under the first one's clock, long past its end.
			const ticking = timerState();
			const mine = ticking && !ticking.over && ticking.label === runLabel(V.shownPlan).slice(0, 60);
			const set = legs.mid > 0 && !mine ? startTimer(legs.mid, runLabel(V.shownPlan), runMarks(V.shownPlan, legs)) : 0;
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
		// Abandon asks which it was: traded in game and stopped, or never
		// done at all.
		case 'barter-sail-drop': askAbandon(redraw); return false;
		// The cockpit sent to one stop, or past one. A stop passed over is
		// not ticked and not recorded: it is only out of the way.
		case 'barter-sail-jump': V.cursor = String(el.dataset.k); return true;
		case 'barter-sail-skip': { V.skipped.add(String(el.dataset.k)); V.cursor = null; return true; }
		// What the last Record came to, put away or taken back.
		case 'barter-recorded-ok': V.lastTrip = null; return true;
		case 'barter-undo-record': {
			// Only while the run is the last change: an Undo here after a
			// tick or a port change took back that instead, and the run's
			// hold writes with it.
			const top = store.lastChange();
			if (!V.lastTrip || !top || top.t !== V.lastTrip.entry) {
				V.lastTrip = null;
				toast(T('Changes came after the run was recorded: take those back first with the Undo at the top'));
				return true;
			}
			const label = store.undo();
			// The stops written into the hold as they were ticked go back
			// with the rest of the run.
			if (label && V.lastTrip && V.lastTrip.applied) unsyncHold({ applied: V.lastTrip.applied });
			V.lastTrip = null;
			toast(label ? T('Reverted: {what}', { what: label }) : T('Nothing to undo'));
			return true;
		}
		case 'barter-sail-all': V.sailAll.open = true; return true;
		case 'barter-sail-all-drop': V.sailAll.open = false; return true;
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
			for (let round = 0; V.sailAll.quests && round < 6; round++) {
				const list = [...(plan.questsHome || []), ...plan.stops.flatMap(s => s.quests || [])].filter(x => x.step.what !== 'hunt').map(x => x.q).filter((q, i, a) => a.indexOf(q) === i && !questDone(q) && rewardOf(q));
				if (!list.length) break;
				store.claimQuests(list.map(q => ({ id: q.id, delta: rewardOf(q), key: periodKey(cadenceOf(q)) })), list.length === 1 ? T('Handed in {n} quest along the run', { n: list.length }) : T('Handed in {n} quests along the run', { n: list.length }));
				claimed += list.length;
			}
			const stops = plan.stops;
			// The stops that pay a range and were never told what they
			// paid stay open: a tick there would be a guess, and the
			// cockpit is sent to the first of them to ask.
			const owed = V.sailAll.stops ? stops.filter(s => owesCount(s, on)) : [];
			if (V.sailAll.stops) on.done = [...new Set([...on.done, ...stops.filter(s => !owesCount(s, on)).map(s => stopKey(s, stops.indexOf(s), stops))])];
			if (owed.length) V.cursor = stopKey(owed[0], stops.indexOf(owed[0]), stops);
			V.sailAll.open = false;
			// The clock is told where the ship now is, as a Traded tells it:
			// past the last stop before the first one still open. It went on
			// counting to stop 1 with the cockpit at stop 3.
			if (V.sailAll.stops) {
				const open = stops.findIndex((x, i) => !ticked(on.done, x, i, stops));
				const past = open < 0 ? stops.length - 1 : open - 1;
				on.lastTick = Date.now();
				if (past >= 0) passedStop(past);
			}
			persist();
			if (!claimed && !owed.length) cheer({ big: true });
			const guessing = owed.length;
			const guessSaid = guessing
				? ` · ${guessing === 1
					? T('{n} island pays a range and waits for its count — tap what it paid', { n: guessing })
					: T('{n} islands pay a range and wait for their count — tap what each paid', { n: guessing })}`
				: '';
			toast(`${V.sailAll.stops ? (owed.length ? T('Every stop with a known count ticked off') : T('Every stop ticked off')) : T('Nothing ticked')}${claimed ? ` · ${claimed === 1 ? T('{n} quest handed in, the rewards in the bags', { n: claimed }) : T('{n} quests handed in, the rewards in the bags', { n: claimed })}` : ''}${guessSaid}${V.sailAll.stops ? ` — ${T('Record the trip puts it in the Inventory')}` : ''}`, claimed > 0);
			return true;
		}
		case 'barter-did-open': V.didOpen = Number(el.dataset.npc) || 0; return true;
		case 'barter-stop-done': {
			const on = sailing() || (el.dataset.map ? V.sail : null);
			if (!on) return false;
			const k = String(el.dataset.k);
			if (on.done.includes(k)) { on.done = on.done.filter(x => x !== k); persist(); V.cursor = null; return true; }
			// A stop that pays a range is ticked by saying what it paid,
			// not by this press: the cockpit goes there and asks.
			const plan = sailedPlan();
			const owed = plan && plan.stops.find((x, i) => stopKey(x, i, plan.stops) === k && owesCount(x, on));
			if (owed) {
				V.cursor = k;
				toast(T('{isle} pays {range} — tap what it paid, and the stop is ticked with it', { isle: isleShort(npcById.get(owed.npcId)) || owed.npc, range: `${rangeOf(owed).lo}-${rangeOf(owed).hi}` }));
				if (V.step !== 'sail' && !el.dataset.map) setStep('sail');
				return true;
			}
			markDone(on, k);
			// The cockpit follows the run rather than the last thing pressed.
			V.cursor = null;
			return true;
		}
		case 'barter-sold': {
			const on = sailing() || (el.dataset.map ? V.sail : null);
			if (!on) return false;
			const k = String(el.dataset.k);
			on.kept = el.checked ? (on.kept || []).filter(x => x !== k) : [...(on.kept || []), k];
			persist();
			return true;
		}
		// The ship is there: the leg is timed from the press that sent it
		// off, and the speed learned again from the last dozen.
		case 'barter-time-legs': setTimingLegs(!timingLegs()); return true;
		case 'barter-arrived': {
			const on = sailing();
			const plan = on ? sailedPlan() : null;
			const at = Number(el.dataset.at), key = el.dataset.k;
			if (!plan || !plan.stops[at] || !key) return false;
			const legs = legsOf(plan.stops);
			const m = legs.from ? legs.legs[at] : at > 0 ? legs.legs[at - 1] : null;
			const t = timerNow();
			const from = on.lastTick || (t && t.startedAt) || 0;
			const secs = from ? Math.round((Date.now() - from) / 1000) : 0;
			on.arrived = { ...(on.arrived || {}), [key]: secs };
			persist();
			if (!(m > 0) || secs < 5) { arrivedAt(at); return true; }
			// A hold past its limit sails slower, by a curve that is itself
			// a guess: such a leg says nothing about the ship.
			const me = currentShip();
			const before = at > 0 ? plan.stops[at - 1].weightAfter : plan.weightStart;
			if (shownHold(me.hold, before || 0).state) {
				arrivedAt(at);
				toast(T('Leg timed at {t}, not counted: the hold was over its limit', { t: spanText(secs) }));
				return true;
			}
			const { pace, learned } = noteLeg(me.name, { m, s: secs, pct: me.speed.sea });
			const shipName = gameName(me.name);
			if (learned) {
				// The ship's own figure, the moment there is one: said once,
				// in a dialog, and the clock put right for the rest of the run.
				arrivedAt(at, runMarks(plan, legsOf(plan.stops), ledgerOf(plan.stops, legsOf(plan.stops))));
				openDialog(`<h2>${T('Your {ship}’s speed', { ship: esc(shipName) })}</h2>
					<p class="dialog-copy">${T('From the {n} legs you timed: <b>{v} m/s</b> at 100%, and <b>{lag} s</b> a leg getting under way and coming in. Every time and every chime for this ship uses it from now on — the clock has put the rest of this run right already.', { n: pace.n, v: pace.cal, lag: pace.lag })}</p>
					<p class="dialog-copy">${T('Keep pressing Arrived whenever you like: each leg refines it. Other ships keep the default until they are timed too.')}</p>
					<div class="dialog-actions"><button class="act" data-close>${T('Good')}</button></div>`);
			} else if (pace.from === 'ship') {
				arrivedAt(at, runMarks(plan, legsOf(plan.stops), ledgerOf(plan.stops, legsOf(plan.stops))));
				toast(T('Leg timed at {t}. Your {ship}: {v} m/s at 100%, {lag} s a leg, from its last {n} legs', { t: spanText(secs), ship: shipName, v: pace.cal, lag: pace.lag, n: pace.n }));
			} else {
				arrivedAt(at);
				toast(pace.from === 'hand'
					? T('Leg timed at {t}. It is kept for this ship; the speed set by hand on the Route tab is the one in use.', { t: spanText(secs) })
					: T('Leg {n} of {of} timed at {t}. After {of}, your {ship}’s own speed is used.', { n: Math.min(pace.n, LEARN_AT), of: LEARN_AT, t: spanText(secs), ship: shipName }));
			}
			return true;
		}
		case 'barter-paid': {
			const on = sailing() || (el.dataset.map ? V.sail : null);
			if (!on) return false;
			const n = Number(el.dataset.n);
			if (on.seen[el.dataset.npc] === n) {
				// The count taken back is the trade not yet said: the stop
				// goes back to waiting, rather than being recorded at the
				// middle of what the island might have paid.
				delete on.seen[el.dataset.npc];
				on.done = on.done.filter(x => x !== `n${el.dataset.npc}`);
			} else on.seen[el.dataset.npc] = n;
			persist();
			// Saying what the island paid is saying the exchange was made:
			// the stop is done with it, one press instead of two.
			if (on.seen[el.dataset.npc] && !on.done.includes(`n${el.dataset.npc}`)) markDone(on, `n${el.dataset.npc}`);
			V.cursor = null;
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
		case 'barter-record': { const on = sailing(); recordTrip(sailedPlan(), (on && ports.find(p => p.id === on.port)) || fromPort()); return false; }
		case 'barter-record-stranded': {
			const on = stranded();
			if (!on) return false;
			// From the harbour it was sailed from, not the one on screen now.
			recordTrip(planOfSail(on), ports.find(p => p.id === on.port) || fromPort(), on);
			return true;
		}
		case 'barter-propose': V.routes.ids = String(el.dataset.ids || '').split('\n').filter(Boolean); V.routesAuto = ''; persist(); return true;
		// The worker answered: nothing to change, the screen redraws.
		case 'barter-redraw': return true;
		case 'barter-fill': {
			if (!V.lastSearch || V.filling) return false;
			V.routesAuto = '';
			const seed = V.routes.ids.slice();
			const take = ({ best }) => {
				V.filling = false;
				if (best) { V.routes.ids = best.ids; persist(); } else toast(T('Nothing pays beside what is ticked'));
			};
			const found = proposeAsync({ ...V.lastSearch, seed }, 'fill', result => { take(result); redrawSoon(); });
			if (found) take(found); else V.filling = true;
			return true;
		}
		default: return false;
	}
}

/** A filter typed on the tab: true when the screen should redraw. */
export function barterType(el) {
	if (el.dataset.act === 'barter-hold-q') { V.holdQ = el.value; return true; }
	if (el.dataset.act === 'barter-chain-q') { V.chainQ = el.value; return true; }
	if (el.dataset.act === 'barter-mat-q') { V.matQ = el.value; return true; }
	return false;
}

/** A value typed or chosen on the tab. */
export function barterChange(el, parseAmount) {
	switch (el.dataset.act) {
		case 'barter-paid-n': {
			const on = sailing() || (el.dataset.map ? V.sail : null);
			if (!on) return false;
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			if (n > 0) on.seen[el.dataset.npc] = Math.floor(n); else delete on.seen[el.dataset.npc];
			persist();
			if (n > 0 && !on.done.includes(`n${el.dataset.npc}`)) markDone(on, `n${el.dataset.npc}`);
			return true;
		}
		// How many times an island was really traded: ten where the run said
		// seven. The hold, the Parley and the record follow the count given;
		// the run's own count again takes the correction back.
		case 'barter-did-n': {
			const on = sailing() || (el.dataset.map ? V.sail : null);
			if (!on) return false;
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			const npc = String(el.dataset.npc);
			const laid = (on.stops || []).find(x => String(x.npcId) === npc);
			const did = { ...(on.did || {}) };
			if (n > 0 && laid && Math.floor(n) !== laid.times) did[npc] = Math.min(9999, Math.floor(n)); else delete did[npc];
			on.did = did;
			persist();
			if (n > 0 && laid && !on.done.includes(`n${npc}`) && !owesCount(laid, on)) markDone(on, `n${npc}`);
			return true;
		}
		case 'barter-port': V.port = ports.some(p => p.id === Number(el.value)) ? Number(el.value) : 0; persist(); return true;
		case 'barter-qty': {
			const n = parseAmount(el.value);
			if (n === null) return true;
			V.qty = Math.max(1, Math.min(9999, Math.floor(n)));
			if (itemNow()) V.wants[itemNow()] = V.qty;
			persist();
			return true;
		}
		case 'barter-mat-reach': V.matOrders = { ...V.matOrders, reach: el.value === 'all' ? 'all' : 'want' }; persist(); return true;
		case 'barter-mat-calls': V.matOrders = { ...V.matOrders, calls: el.checked }; persist(); return true;
		case 'barter-mat-pace': V.matOrders = { ...V.matOrders, pace: el.value === 'fast' ? 'fast' : 'full' }; persist(); return true;
		case 'barter-good-set': {
			const n = parseAmount(el.value);
			if (n === null) return true;
			const have = aboardStock()[el.dataset.item] || 0;
			store.addStock(el.dataset.item, Math.max(0, Math.floor(n)) - have, T('{item}: {before} → {after} aboard', { item: el.dataset.item, before: F(have), after: F(Math.max(0, Math.floor(n))) }), false);
			return true;
		}
		case 'barter-pace': retickIfAuto(); setOrders({ pace: el.value === 'full' ? 'full' : el.value === 'steady' ? 'steady' : 'fast' }); return true;
		case 'barter-way': setOrders({ way: el.value === 'chain' ? 'chain' : 'sea' }); return true;
		case 'barter-sail-all-pick': V.sailAll[el.dataset.id === 'quests' ? 'quests' : 'stops'] = !!el.checked; return false;
		case 'barter-quests': setOrders({ quests: QUEST_CHOICES.some(([q]) => q === el.value) ? el.value : 'no' }); return true;
		case 'barter-mat-quests': V.matOrders = { ...V.matOrders, quests: QUEST_CHOICES.some(([q]) => q === el.value) ? el.value : 'no' }; persist(); return true;
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
		case 'barter-floor': {
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			const floors = { ...ordersNow().floors };
			if (n > 0) floors[el.dataset.lv] = Math.floor(n); else delete floors[el.dataset.lv];
			setOrders({ floors });
			return true;
		}
		case 'barter-stash': V.stash = STASHES.includes(el.value) ? el.value : ''; persist(); return true;
		case 'barter-bag': store.setProfile('bag', { ...bagSet(), on: el.value === 'on' }); return true;
		case 'barter-bag-set': {
			const k = ['now', 'max', 'used', 'slots'].includes(el.dataset.k) ? el.dataset.k : null;
			const n = el.value.trim() === '' ? 0 : k === 'now' ? figure(el.value) ?? parseAmount(el.value) : parseAmount(el.value);
			if (!k || n === null) return true;
			store.setProfile('bag', { ...bagSet(), [k]: Math.max(0, n) });
			return true;
		}
		case 'barter-target': {
			const n = parseAmount(el.value === '' ? '0' : el.value);
			if (n === null) return true;
			V.stockGoal = { ...V.stockGoal, targets: { ...V.stockGoal.targets, [el.dataset.lv]: Math.max(0, Math.floor(n)) } };
			persist();
			return true;
		}
		default: return false;
	}
}

/** The stops as a chart link fragment, for the Map to take in. */
export function chartFragment(el) {
	const ids = String(el.dataset.ids || '').split('.').filter(Boolean);
	if (!ids.length) { toast(T('Nothing to draw')); return null; }
	const parts = [`r=${ids.join('.')}`];
	if (V.port) parts.push(`s=${V.port}`);
	if (el.dataset.pick) parts.push(`p=${encodeURIComponent(el.dataset.pick)}`);
	if (el.dataset.trades) parts.push(`x=${encodeURIComponent(el.dataset.trades)}`);
	if (el.dataset.stash && el.dataset.stash !== '[]') parts.push(`w=${encodeURIComponent(el.dataset.stash)}`);
	return parts.join(';');
}

/** Abandon, asked: keep what was traded, or put everything back. */
function askAbandon(redraw) {
	const on = sailing();
	if (!on) return;
	const host = openDialog(`
		<h2>${T('Abandon this run?')}</h2>
		<p class="dialog-copy">${T('Nothing is recorded either way: no Parley, no Total Barters, no entry under Past runs.')}</p>
		<div class="abandon-choices">
			<button class="abandon-choice" data-abandon="keep"><b>${T('Keep what I traded')}</b><span>${T('The trades were made in game. The hold and your storages stay as the ticked stops left them.')}</span></button>
			<button class="abandon-choice" data-abandon="back"><b>${T('Put everything back')}</b><span>${on.packLog ? T('Nothing was done in game. Every tick is taken back, and the packing too: goods go back where they were taken from and what was bought at the Market is refunded.') : T('Nothing was done in game. Every tick is taken back. This run was cast off before the packing was kept, so what was packed stays aboard.')}</span></button>
		</div>
		<div class="dialog-actions"><button class="act quiet" data-close>${T('Cancel')}</button></div>`);
	host.querySelector('[data-close]')?.focus();
	host.querySelectorAll('[data-abandon]').forEach(b => b.addEventListener('click', () => {
		const mode = b.dataset.abandon;
		closeDialog();
		const done = abandonRun(mode);
		V.sailAll.open = false; V.cursor = null; V.skipped = new Set();
		setStep('plan');
		stopTimer();
		bringUp('.barter-screen .steps');
		if (done && mode === 'back') toast(done.refund
			? T('Everything put back: {n} goods where they were, {silver} silver refunded. One Undo brings the run back.', { n: F(done.goods), silver: FC(done.refund) })
			: T('Everything put back: {n} goods where they were. One Undo brings the run back.', { n: F(done.goods) }), true);
		else if (done) toast(T('Run dropped; the hold stays as you traded. One Undo brings the run back.'), true);
		redraw();
	}));
}
