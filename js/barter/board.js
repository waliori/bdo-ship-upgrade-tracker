// Today's board: which of the forty layouts the sea is showing, the
// board's strip and its ask, a board taken back from the history or
// continued part-way, and the islands answered by hand or from the fleet.

import { esc, F } from '../fmt.js';
import { T, said, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img } from '../ui-bits.js';
import { snapshot, barterData, barterProfile, combos } from '../ui-state.js';
import { barterKey } from '../clock.js';
import { candidates, askable, offersAt, offersOf, boardData, gatedOffers, exchangeGate, clientDeals } from '../barter-board.js';
import { npcById, npcs, ports, isleOf, whoOf, isleShort } from '../barter_npcs.js';
import { paceNow } from '../ship-pace.js';
import { PARLEY, COIN, nextGateAbove, levelOf, npcGate, npcOpen } from '../barter.js';
import { exchanges } from '../barter-plan.js';
import { openBarterImport } from '../barter-import.js';
import { openLayoutBook } from '../layouts-view.js';
import { driftOf } from '../layout-book.js';
import { coinSides } from '../barter-layouts.js';
import { boardsFor, sawItToo, tellFleet, shared as boardsShared } from '../sea-boards.js';
import { me } from '../sync.js';
import { cutOf } from '../barter-short.js';
import { openPicker } from '../picker.js';
import { toast } from '../dialogs.js';
import { V } from './state.js';
import { aboardStock } from './hold.js';
import { matBoardNow, noteMatSeen, tradeShotHelp, matBarHTML } from './material.js';
import { parleyGuessed } from './plan.js';
import { chartData } from './route.js';
import { sailKey, ticked } from './sail.js';
import { redrawSoon } from './search.js';
import { assumedRolls, noteRolls, rollsChipHTML } from './rolls.js';
import { persist } from './view.js';

/* ------------------------------------------------------------------ *
 * today's board
 * ------------------------------------------------------------------ */

/**
 * The layouts still standing after what was seen today, and the table
 * a run is planned on: the board itself once one layout is left, the
 * whole table until then. What was seen lapses with the barter day,
 * since the sea redraws every board at the refill.
 */
export function boardNow() {
	if (!combos || !barterData) return { standing: [], combo: null, data: barterData };
	if (V.board.day !== barterKey()) {
		// The refill has passed since the board was read. It used to be
		// dropped here, and a sailor who stopped a run in the evening came
		// back to an empty board and typed it all in again. It is kept now,
		// with the attempts used on it, and the page asks: the sailor, who
		// has the game open, says whether it changed.
		V.board = { ...V.board, day: barterKey(), rolled: V.board.answers.length > 0 };
		persist();
	}
	// Nothing read on this board, and the board was not said to be
	// refreshed: it is the board the last run was sailed on, however long
	// ago, with what that run and the ones before it on the same layout
	// used of it. Only "Refreshed in game" starts from nothing.
	if (!V.board.answers.length && !V.board.pinned && !V.board.fresh) {
		const h = boardFromHistory(V.board.freshAt || 0);
		if (h) { V.board = { ...V.board, ...h }; persist(); }
	}
	const pinned = !V.board.answers.length && V.board.pinned ? combos.combos.filter(c => String(c.id) === String(V.board.pinned)) : [];
	const standing = V.board.answers.length ? candidates(combos.combos, V.board.answers) : pinned.length ? pinned : combos.combos;
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
	const drifted = !standing.length && !V.board.own ? driftOf(combos.combos, V.board.answers) : null;
	const combo = standing.length === 1 ? standing[0]
		: drifted || ((!standing.length && V.board.own && V.board.answers.length) ? ownCombo(V.board.answers) : null);
	// Two reasons an island is not on the board, and they are told
	// apart: the client's own table says the count has not opened
	// today's exchange there, or the sailor looked and found it shut
	// where the table has nothing to say. Both leave the board the same
	// way; only the second is theirs to take back.
	const gated = gatedOffers(combo, barterProfile().barterCount);
	const told = shutNow();
	const shut = [...gated, ...told];
	// The islands the layout leaves to chance: what the sailor said is
	// counted for the fleet, and the rest are planned at their likelier.
	if (combo && combo.rolls) noteRolls(combo);
	const rolled = combo && combo.rolls ? assumedRolls(combo) : [];
	return { standing, combo, shut, gated, told, data: combo ? dataOf(combo, [...V.board.answers, ...rolled], shut) : barterData };
}

// The board laid out from the table, kept while what it is laid from
// stands: the page asks for it a score of times a draw.
let laidData = { key: '', combo: null, table: null, data: null };
function dataOf(combo, answers, shut) {
	const key = JSON.stringify([answers, shut]);
	if (laidData.combo !== combo || laidData.table !== barterData || laidData.key !== key) laidData = { key, combo, table: barterData, data: boardData(combo, barterData, npcById, answers, shut) };
	return laidData.data;
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
export function shutNow(prof = barterProfile()) {
	const seen = store.getProfile('shutOffers', []) || [];
	const count = Number(prof.barterCount) || 0;
	return seen.filter(x => count < nextGateAbove(x.at));
}

export const fromPort = () => ports.find(p => p.id === V.port) || null;

/**
 * The board bar: which layout the sea is showing, or the question that
 * finds it, with the goal toggle and the refresh beside it.
 */
export function boardHTML(b) {
	const prof = barterProfile();
	// Two shapes. A board that is known is a fact, and facts are a line
	// of ticked pills: the layout, the sailor's count, the Parley bar --
	// dashed where the app is assuming rather than reading. A board that
	// is not known is a question, and the quickest answer is a
	// screenshot, so the question is a place to paste one.
	const parleyPill = parleyGuessed(prof)
		? `<button class="board-pill guess" data-act="barter-sec" data-id="parley" title="${T('Not read from a screenshot and not typed in — type it under Before you sail')}">${T('Parley {n} · assumed full — that’s right?', { n: F(PARLEY.max) })}</button>`
		: `<button class="board-pill ok" data-act="barter-sec" data-id="parley"><i>✓</i>${T('Parley {n}', { n: F(Math.min(PARLEY.max, prof.parleyHeld)) })}</button>`;
	const mePill = `<span class="board-pill ok" title="${T('Your barter count and level are set in the bar at the top of the page; the Parley under Before you sail, step 1')}"><i>✓</i>${prof.barterCount === 1 ? T('{n} barter', { n: F(prof.barterCount) }) : T('{n} barters', { n: F(prof.barterCount) })}${prof.level ? ` · ${esc(prof.level)}` : ''}</span>`;
	const bar = (cls, lead, sub, seen, acts, note = '') => (cls === 'known'
		? `<div class="board-strip">
			<div class="board-strip-row"><span class="board-strip-k">${T('Today’s board')}</span><span class="board-pill ok lead"><i>✓</i>${lead}</span>${mePill}${parleyPill}${seen ? `<span class="chips board-strip-seen">${seen}</span>` : ''}<span class="panel-spacer"></span><span class="board-strip-acts">${acts}</span></div>
			<div class="board-strip-sub">${sub}</div>${note}
		</div>`
		: `<section class="panel board-ask${cls ? ` ${cls}` : ''}">
			<div class="panel-head"><h2 class="panel-title">${T('Today’s board')}</h2><span class="panel-sub board-ask-lead">${lead}</span></div>
			<div class="panel-body">
				${acts ? `<button class="board-drop" data-act="barter-shot"><b class="by-key">${T('Paste your barter window here')}</b><b class="by-touch">${T('Add a screenshot of your barter window')}</b><span class="by-key">${T('Open the barter window in game, take a screenshot, press <kbd>Ctrl</kbd> <kbd>V</kbd>. The layout, your Parley and your barter count are read from it. Nothing is uploaded.')}</span><span class="by-touch">${T('Tap to choose the picture. The layout, your Parley and your barter count are read from it, on this device — nothing is uploaded.')}</span></button>` : ''}
				${acts ? tradeShotHelp() : ''}
				${acts ? `<div class="board-ask-acts"><span class="board-ask-or">${T('or')}</span>${acts}</div>` : ''}
				${seen ? `<div class="barter-bar-seen"><span class="barter-bar-k">${T('looked at')}</span><span class="chips">${seen}</span></div>` : ''}
				<p class="board-ask-sub">${sub}</p>${note}
			</div>
		</section>`);
	// The material islands are not part of any layout, so with a
	// material as the goal there is no layout to ask after: the bar is
	// the goal toggle and a word on where the day's list is ticked.
	if (V.goal === 'material') return matBarHTML();
	if (!combos) return bar('', `<b>${T('Today’s board')}</b>`, T('The record of the boards did not load, so a run is planned on the whole table at best.'), '', '');
	const since = new Date(combos.sample.since + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
	// Each answer wears the good it handed back, so a mistyped island is
	// spotted without hovering for the tooltip.
	const seen = V.board.answers.map(a => `<span class="chip tiny active board-seen" title="${esc(gameName(a.give))} → ${esc(gameName(a.recv))}">${img(a.recv, 'row-icon xs')}${esc(isleShort(npcById.get(a.npcId)))}</span>`).join('')
		+ (V.board.answers.length ? `<button class="chip tiny" data-act="barter-board-undo" title="${T('Take back the last island looked at')}">↶ ${T('Undo')}</button>` : '');
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
			`<b>${T('Layout {id}', { id: esc(b.combo.id) })}</b><span>${T('today’s board')}</span>${rollsChipHTML(b.combo)}`,
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
	const lead = V.board.answers.length
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
export function materials() {
	const missing = (snapshot && snapshot.missing) || {};
	return (barterData || []).filter(e => levelOf(e.name) === null && e.sources && e.sources.length)
		.map(e => ({ name: e.name, short: Number(missing[e.name]) || 0 }))
		.sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
}

/** Metres a second at 100%: the player's own figure if they timed a
 *  leg, else the working estimate. */
export function sailCal() {
	return paceNow().cal;
}

/** The speed a run is laid at: while one is sailed, the speed it was
 *  cast off at. A leg timed with Arrived teaches the clock at once, but
 *  a run laid again mid-way -- a 2–3 island's count said -- at a new
 *  speed can come out in another order, and the stops already sailed
 *  would stand behind ones that are not. */
export function layCal() {
	const on = V.sail && V.sail.key === sailKey() ? V.sail : null;
	return on && on.cal > 0 ? on.cal : sailCal();
}

/** The seconds every leg costs apart from the sailing: the default's,
 *  or the ship's own once its legs are timed. */
export const sailLag = () => Math.max(0, Math.min(120, paceNow().lag || 0));

/** The material a run is for: the one chosen, else the biggest
 *  shortfall the table can answer. */
export function itemNow() {
	if (V.item === '') return null;   // put down on purpose: nothing open
	const list = materials();
	if (V.item && list.some(m => m.name === V.item)) return V.item;
	return list.length ? list[0].name : null;
}

/**
 * The board as the run history leaves it: the layout of the last run
 * recorded since the board was last said to be refreshed, the attempts
 * that run and the ones straight before it on the same layout used,
 * island by island, and the run itself to continue when it stopped
 * part-way. Null when no such run is on record.
 */
function boardFromHistory(since) {
	const runs = (store.getProfile('runs', []) || []).filter(r => r.layout && (r.at || 0) > since).sort((a, b) => (a.at || 0) - (b.at || 0));
	if (!runs.length) return null;
	const last = runs[runs.length - 1];
	const idOf = x => {
		if (x.id && npcById.has(Number(x.id))) return Number(x.id);
		const n = npcs.find(m => m.name === x.w || gameName(m.name) === x.w);
		return n ? n.id : null;
	};
	const used = {};
	for (let i = runs.length - 1; i >= 0 && runs[i].layout === last.layout; i--) {
		for (const x of runs[i].stops_ || []) {
			if (x.k !== 'n') continue;
			const id = idOf(x);
			if (id) used[id] = (used[id] || 0) + (Number(x.t) || 0);
		}
	}
	const c = last.cont;
	// The harbour it sailed from, when none is set: its storage is where
	// the goods it left are, and a chain can only start from goods the run
	// can load.
	const home = ports.find(p => p.name === last.port);
	if (!V.port && home) V.port = home.id;
	return { pinned: last.layout, pinnedAt: last.at || 0, used, usedFor: last.layout, last: c && c.ids && c.ids.length ? { at: last.at || 0, ids: c.ids, isles: c.isles || [], done: c.done || 0, all: c.all || 0, off: false } : V.board.last || null };
}

/** The board rebuilt from the run history: said, with the way out. */
export function pinnedHTML(b) {
	if (V.board.answers.length || !V.board.pinned || !b.combo || String(b.combo.id) !== String(V.board.pinned)) return '';
	const when = V.board.pinnedAt ? new Date(V.board.pinnedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
	return `<div class="rolled-note pinned-note"><b>${T('Layout {id}, as your last run left it', { id: esc(V.board.pinned) })}</b> <span>${when ? T('sailed {when}, and not refreshed since: the islands deal what that run left them, and the Parley is the bar as you last set it.', { when: esc(when) }) : T('not refreshed since: the islands deal what that run left them, and the Parley is the bar as you last set it.')}</span><span class="panel-spacer"></span><button class="chip tiny" data-act="barter-board-clear">↻ ${T('Refreshed in game')}</button></div>`;
}

/**
 * What the runs recorded on today's board have used of it. An island
 * deals so many attempts a board -- ten, six, five -- and a run that
 * stopped part-way, or took fewer than an island allows, leaves the
 * rest to deal. So the attempts each ticked island traded are kept on
 * the board, with the layout they were traded on, until the board is
 * refreshed; and a run stopped part-way is kept too, to be continued.
 */
export function noteUsed(plan, on) {
	const b = boardNow();
	if (!b.combo) return;
	const used = V.board.usedFor === b.combo.id ? { ...(V.board.used || {}) } : {};
	const isles = [];
	let done = 0;
	plan.stops.forEach((s, k) => {
		const t = ticked(on.done, s, k, plan.stops);
		if (t) done++;
		if (!s.npcId) return;
		if (t) used[s.npcId] = (used[s.npcId] || 0) + (Number(s.times) || 0);
		if (Number.isFinite(s.chain)) (isles[s.chain] = isles[s.chain] || []).push(s.npcId);
	});
	const last = done < plan.stops.length ? { at: Date.now(), ids: V.routes.ids.slice(0, 20), isles: isles.filter(Boolean).slice(0, 20), done, all: plan.stops.length, off: false } : null;
	V.board = { ...V.board, used, usedFor: b.combo.id, last };
}

/** The chains of today's board less what the runs recorded on it have
 *  used: each rung deals what its island has left, and a chain stops
 *  before an island that has dealt every attempt. */
export function spendUsed(list, b) {
	if (!b.combo || V.board.usedFor !== b.combo.id || !V.board.used || !Object.keys(V.board.used).length) return list;
	const out = [];
	for (const c of list) {
		const rungs = [];
		let spentAt = null;
		for (const r of c.rungs) {
			const left = r.tries - (V.board.used[r.npcId] || 0);
			if (left <= 0) { spentAt = r; break; }
			rungs.push(left === r.tries ? r : { ...r, tries: left });
		}
		if (!rungs.length) continue;
		const last = rungs[rungs.length - 1];
		out.push(spentAt ? { ...c, rungs, spentAt, top: last.item === COIN ? levelOf(last.give) : levelOf(last.item) } : rungs.some((r, i) => r !== c.rungs[i]) ? { ...c, rungs } : c);
	}
	return out;
}

/**
 * The run stopped part-way on this board, offered back: the chains it
 * climbed that still climb -- the same chain where its first island has
 * attempts left, else the chain from the goods now aboard up the same
 * islands -- ticked in one press. The Parley and the hold are the
 * sailor's as they stand, and the islands deal what they have left.
 */
export function continueHTML(all, b) {
	const last = V.board.last;
	if (!last || last.off || !b.combo || V.board.usedFor !== b.combo.id) return '';
	const tail = (isles, c) => { const ids = c.rungs.map(r => r.npcId); const off = isles.length - ids.length; return off >= 0 && ids.every((id, j) => isles[off + j] === id); };
	// A short trip's run was of trades cut from chains (`<chain>><k>`):
	// matched by the chain, and handed back as the trade it was.
	const cutK = new Map(last.ids.map(id => cutOf(id)).filter(x => x.k >= 0).map(x => [x.base, x.k]));
	const bases = new Set(last.ids.map(id => cutOf(id).base));
	const ids = all.filter(c => bases.has(c.id) || (c.from !== 'land' && last.isles.some(l => tail(l, c))))
		.map(c => (V.shape === 'short' ? `${c.id}>${Math.min(c.rungs.length - 1, cutK.has(c.id) ? cutK.get(c.id) : c.rungs.length - 1)}` : c.id));
	const prof = barterProfile();
	const aboard = Object.entries(aboardStock()).filter(([, n]) => n > 0);
	const isles = [...new Set(last.isles.flat())];
	const left = isles.filter(id => all.some(c => c.rungs.some(r => r.npcId === id))).length;
	const when = new Date(last.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	return `<section class="panel continue-card"><div class="continue-head"><b>${T('Continue where you left off')}</b><span>${T('your last run on this board stopped at {time}, after {n} of {of} stops', { time: esc(when), n: last.done, of: last.all })}</span></div>
		<div class="continue-figs"><span>${T('{n} of its {of} islands still deal', { n: left, of: isles.length })}</span><span>${parleyGuessed(prof) ? T('Parley: a full bar') : T('Parley {n}', { n: F(Math.min(PARLEY.max, prof.parleyHeld)) })}</span><span>${aboard.length ? T('{n} kinds of goods aboard', { n: aboard.length }) : T('nothing aboard')}</span></div>
		<div class="continue-acts">${ids.length ? `<button class="act" data-act="barter-continue" data-ids="${esc(ids.join('\n'))}">${T('Continue that run')} ›</button>` : `<span class="faint">${T('Nothing of it can climb any more: its islands have dealt, or its goods are not aboard.')}</span>`}<button class="linky" data-act="barter-continue-drop">${T('Plan afresh')}</button></div></section>`;
}

/** The daily refill has passed since the board was read: said, with
 *  the two answers. */
export function rolledHTML() {
	if (!V.board.rolled || !V.board.answers.length) return '';
	return `<div class="rolled-note"><b>${T('The daily refill has passed since you read this board.')}</b> <span>${T('If the barter list in game is the one you had, keep it: the islands keep the attempts you left and the Parley stays as it was. If it changed, start today’s, and type the Parley under Before you sail.')}</span><span class="panel-spacer"></span><button class="chip tiny primary" data-act="barter-board-same">${T('Still the same board')}</button><button class="chip tiny" data-act="barter-board-clear">↻ ${T('Refreshed in game')}</button></div>`;
}

/**
 * The route the wharf step drew last, kept for the chart: the chart's
 * side panel shows the same route -- the cast-off row, the chain tags,
 * the trip headings, the stops with ↑ ↓ skip -- while the run is only
 * planned. Laid again by `planOnChart` when nothing has drawn it yet.
 */
export function keepRoute(plan, legs, book, segs, pick) {
	const data = chartData(plan.stops, pick);
	V.lastRoute = { ids: data ? data.ids : [], pick, plan, legs, book, segs, at: Date.now() };
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
export function readWindow(then, files) {
	boardNow();   // the day's answers, reset if the refill has passed
	openBarterImport({
		files,
		deals: exchanges(barterData),
		onAnswers: answers => { takeRead(answers); then(); }
	});
}

/**
 * Rows read off the window, each to the list it belongs to.
 *
 * The window is one list and the app keeps two: the forty layouts, and
 * the material list's own. A row is told apart by what it pays -- a
 * ship material is not a trade good -- and goes to the list it belongs
 * to, which is the same split boardData makes of the whole table.
 */
export function takeRead(answers) {
	boardNow();
	const mb = matBoardNow();
	let mats = 0;
	// Crow Coins are paid on both lists. A coin row goes where the game's
	// layouts show it; one both show goes with the other coin rows of the
	// same shot, since a window is one list or the other.
	const sides = new Map(answers.filter(a => a.recv === 'Crow Coin').map(a => [a.npcId, coinSides(a.npcId, a.give)]));
	const only = [...sides.values()].filter(x => x.trade !== x.material);
	const coinsAreMats = only.filter(x => x.material).length > only.filter(x => x.trade).length;
	const isMat = a => {
		if (a.recv !== 'Crow Coin') return levelOf(a.recv) === null;
		const x = sides.get(a.npcId);
		return x.material && (!x.trade || coinsAreMats);
	};
	for (const a of answers) {
		const material = isMat(a);
		const list = material ? mb.answers : V.board.answers;
		const i = list.findIndex(x => x.npcId === a.npcId);
		if (i >= 0) list.splice(i, 1);   // an island shows one exchange
		list.push({ npcId: a.npcId, give: a.give, recv: a.recv });
		if (material) mats++;
	}
	persist();
	if (mats) noteMatSeen();
	const board_ = answers.length - mats;
	toast(`${answers.length === 1 ? T('{n} island read off the screenshot', { n: answers.length }) : T('{n} islands read off the screenshot', { n: answers.length })}${mats ? ` — ${T('{n} on today\'s board, {mats} ticked on the material list', { n: board_, mats })}` : ''}`, true);
}

/** What the fleet has read of today's board, once it has been asked
 *  for. Kept a day at a time, since that is how long a board lives. */

/** Ask the server what others have seen, once a barter day, and redraw
 *  when it answers. Quiet where there is no server to ask. */
function fleetNow() {
	if (!boardsShared()) return [];
	const day = barterKey();
	if (V.fleet.day !== day) V.fleet = { day, list: [], asked: false };
	if (!V.fleet.asked) {
		V.fleet.asked = true;
		boardsFor(day).then(list => {
			V.fleet = { day, list, asked: true };
			redrawSoon();
		}).catch(() => {});
	}
	return V.fleet.list;
}

/** Somebody else's reading, taken as your own: every island they named
 *  is answered, and the app is told you saw the same board. */
export function takeFleetBoard(id, then) {
	const seen = V.fleet.list.find(b => String(b.id) === String(id));
	if (!seen) return;
	boardNow();   // the day's answers, reset if the refill has passed
	for (const [npcId, give, , recv] of seen.offers) {
		if (!npcById.has(Number(npcId))) continue;
		V.board.answers = V.board.answers.filter(x => x.npcId !== Number(npcId));
		V.board.answers.push({ npcId: Number(npcId), give: String(give), recv: String(recv) });
	}
	persist();
	toast(seen.offers.length === 1
		? T('Today\'s board as {who} read it: {n} island answered', { who: seen.name ? seen.name : T('another sailor'), n: seen.offers.length })
		: T('Today\'s board as {who} read it: {n} islands answered', { who: seen.name ? seen.name : T('another sailor'), n: seen.offers.length }), true);
	if (!seen.mine && !seen.confirmed) sawItToo(seen.id).then(() => { V.fleet.asked = false; });
	then();
}

/**
 * The layout book: the record and the fleet's readings, side by side,
 * in a dialog of their own. The bar above asks which board it is today;
 * this is where the evidence is kept, and the two presses in it that
 * change today's board come back here to be done.
 */
export function openBook(then) {
	if (!combos) { toast(T('The record of the boards did not load')); return; }
	boardNow();   // the day's answers, reset if the refill has passed
	openLayoutBook({
		combos,
		answers: V.board.answers,
		day: barterKey(),
		count: Number.isFinite(Number(barterProfile().barterCount)) ? Number(barterProfile().barterCount) : null,
		log: store.getProfile('boardLog', []) || [],
		onTake: (said, readers) => {
			for (const a of said) {
				if (!npcById.has(a.npcId)) continue;
				V.board.answers = V.board.answers.filter(x => x.npcId !== a.npcId);
				V.board.answers.push({ npcId: a.npcId, give: a.give, recv: a.recv });
			}
			// a layout with a slot moved is sailed as that layout; a board
			// in no record at all is sailed as seen, or not at all
			V.board.own = !candidates(combos.combos, V.board.answers).length && !driftOf(combos.combos, V.board.answers);
			persist();
			toast(said.length === 1
				? T('Today\'s board as the fleet read it: {n} island answered', { n: said.length })
				: T('Today\'s board as the fleet read it: {n} islands answered', { n: said.length }), true);
			for (const r of readers) if (!r.mine && !r.confirmed) sawItToo(r.id).then(() => { V.fleet.asked = false; });
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
export function tellTheFleet(then) {
	const b = boardNow();
	if (!V.board.answers.length) return;
	if (!me()) { toast(T('Sign in from the Menu to put your name to a reading')); return; }
	toast(T('Sending today’s board…'));
	// A board of the sailor's own is not a layout number, and saying so
	// would put a word where everyone else's reading has a figure.
	tellFleet(barterKey(), b.combo && !b.combo.own ? b.combo.id : null, V.board.answers.map(a => ({ ...a, qty: '1' }))).then(out => {
		toast(out.ok
			? (V.board.answers.length === 1
				? T('The fleet has your reading of today\'s board — {n} island, with your name on it', { n: V.board.answers.length })
				: T('The fleet has your reading of today\'s board — {n} islands, with your name on it', { n: V.board.answers.length }))
			: T('It did not go: {why}', { why: said(out.why) }), out.ok);
		V.fleet.asked = false;
		then();
	});
}

/** The chip that does it, where there is a server and something to
 *  send. */
function worthTelling() {
	const b = boardNow();
	return Boolean(V.board.answers.length) && (!b.standing.length || Boolean(b.combo && (b.combo.own || b.combo.patched)));
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

export function pickOffer(npcId, then) {
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
		V.board.answers = V.board.answers.filter(x => x.npcId !== npcId);
		V.board.answers.push({ npcId, give, recv });
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
export function pickIsland(then) {
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
export function showGated() {
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
export function pickAnyIsland(then) {
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
