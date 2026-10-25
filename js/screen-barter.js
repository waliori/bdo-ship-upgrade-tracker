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
// for a material reads the material list, one of the game's forty-one
// material layouts, as the trade board is one of its forty.

import { T } from './i18n.js';
import { esc } from './fmt.js';
import { loadingNote } from './loading.js';
import * as store from './state.js';
import { img } from './ui-bits.js';
import { barterData } from './ui-state.js';
import { currentShip } from './ship.js';
import { V } from './barter/state.js';
import { boardNow, boardHTML, pinnedHTML, rolledHTML } from './barter/board.js';
import { stepNow, stepperHTML, underWayHTML, recordedHTML, sailHTML } from './barter/cockpit.js';
import { holdBarHTML, refreshSheet, openSheet } from './barter/hold.js';
import { materialParts, matBoardNow, matPageNow } from './barter/material.js';
import { silverParts } from './barter/parts.js';
import { dayCardHTML, goalCardsHTML, goalSaid } from './barter/plan.js';
import { resultsHTML } from './barter/results.js';
import { sailing, strandedHTML } from './barter/sail.js';
import { shapeBarHTML } from './barter/short.js';
import { restore } from './barter/view.js';
import { toldHTML } from './barter/packing.js';

export { barterAction, barterChange, barterType, chartFragment } from './barter/actions.js';

export { runSheetHTML, sailChart, sailCurrent, sailStop, sailJump, sailIds, sailFor } from './barter/sail.js';
export { plannedChart } from './barter/plan.js';
export { barterWritingView } from './barter/view.js';

export function renderBarter() {
	restore();
	// A recorded run whose change was undone -- by the Undo at the top,
	// or the toast's -- is no longer recorded.
	if (V.lastTrip && !store.hasChange(V.lastTrip.entry)) V.lastTrip = null;
	const me = currentShip();
	const b = boardNow();
	if (!barterData) return `<p class="empty">${loadingNote(T('Reading the barter table…'))}</p>`;
	// One column, the page's width, and four steps across its head: the
	// plan -- the board, where the day ends, how it is sailed, the chains
	// -- then the wharf, the cockpit and the results. One step is on the
	// page at a time, so each has one job and one thing to press.
	// Nothing is drawn until this render draws it: a board just cleared
	// must not leave the last board's run standing in for one.
	V.shownPlan = null;
	V.lastRoute = null;
	// Laid from the hold as it cast off, while a run is under way: its
	// ticked stops are in the Inventory already.
	const parts = store.readingAsWas(V.sail && V.sail.applied, () => (V.goal === 'material' ? materialParts(me, b.data) : silverParts(me, b)));
	setTimeout(() => {
		if (V.sheetAfter && V.chainsSheet) openSheet(V.sheetAfter);
		V.sheetAfter = null;
		refreshSheet();
	}, 0);
	const now = stepNow();
	const on = sailing();
	// The day card: every choice the run is laid from, in the order a day
	// is settled -- what it is for, the board, how much of it, the Parley,
	// where it ends, how it is sailed -- each cell saying what it is set
	// to. The first step not yet settled is the one open; Next settles it
	// and opens the one after, and any cell can be opened ahead of its
	// turn. The chains are the answer to all of it: folded to a line
	// while a step is open, in full once the card is done or shut.
	const material = V.goal === 'material';
	const matPage = material ? matPageNow() : null;
	const boardRead = material ? matBoardNow().answers.length > 0 : Boolean(b.combo);
	const boardSaid = material
		? (matPage ? T('Material layout {id}', { id: esc(matPage.id) }) : boardRead ? T('looked at') : T('the board is not read yet'))
		: b.combo ? T('Layout {id}', { id: esc(b.combo.id) }) : T('the board is not read yet');
	const cells = [
		['goal', T('What is today for?'), goalSaid(), goalCardsHTML()],
		['board', material ? T('Today’s material list') : T('Today’s board'), boardSaid, `${pinnedHTML(b)}${boardHTML(b)}`],
		...(material || V.reach ? [] : [['shape', T('How much of the board'), V.shape === 'short' ? T('Short trip') : T('Full run'), shapeBarHTML()]]),
		...parts.secs.filter(([id]) => id !== 'chains')
	];
	const chains = parts.secs.find(([id]) => id === 'chains');
	V.chainsSheet = chains ? `<div class="panel-head"><h2 class="panel-title">${chains[1]}</h2><span class="panel-sub">${chains[2]}</span></div>${chains[3]}${parts.dock || ''}` : '';
	const planStep = `${rolledHTML()}${parts.cont || ''}
		${dayCardHTML(cells, chains, boardRead, `${V.goal}|${material ? (matPage ? matPage.id : boardRead ? 'read' : '') : b.combo ? b.combo.id : ''}`)}${parts.dock || ''}`;
	const loadFoot = `<div class="load-dock"><button class="linky" data-act="barter-step" data-id="plan">${T('Back to the plan')}</button><span class="run-dock-figs"><span>${parts.things.all ? (parts.things.later ? T('Trip 1: {n} of {of} aboard', { n: parts.things.done, of: parts.things.all }) : T('{n} of {of} aboard', { n: parts.things.done, of: parts.things.all })) : ''}</span>${parts.things.later ? `<span>${T('{n} picked up on the way', { n: parts.things.later })}</span>` : ''}</span>${on ? `<button class="act" data-act="barter-step" data-id="sail">${T('Back to the run')}</button>` : `<button class="act" data-act="barter-cast-off"${V.shownPlan && V.shownPlan.stops && V.shownPlan.stops.length ? '' : ' disabled'} title="${T('Each stop goes into the hold as you tick it; at the end the run is recorded')}">${img(currentShip().name, 'ship-ico')} ${T('Cast off')}</button>`}</div>`;
	// While a run is under way the step leads with what it said at the
	// wharf, kept with the run: the live list below is laid again from
	// the hold as it is now.
	const loadStep = `${on ? toldHTML(on) : ''}${holdBarHTML(me, parts.packLT || 0, parts.packSlots ?? null)}${parts.load || `<p class="empty step-empty">${T('Nothing to pack yet. Tick a chain on the plan and what it needs is listed here.')}</p>`}${loadFoot}`;
	const body = now === 'load' ? loadStep : now === 'sail' ? sailHTML() : now === 'results' ? resultsHTML() : planStep;
	// A screenshot pasted on another step is read at the top of it.
	return `<div class="barter-screen step-${now}">
		<button hidden data-act="barter-redraw" tabindex="-1" aria-hidden="true"></button>
		${strandedHTML()}${underWayHTML(now)}${recordedHTML()}
		${stepperHTML(parts, now)}
		${body}
	</div>`;
}
