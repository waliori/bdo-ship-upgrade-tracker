// The material run: the list, the book and the fleet's readings of it,
// the screenshot help, and the run for one material or several.

import { esc, F, FC } from '../fmt.js';
import { T, said, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img, copyName, amountInput } from '../ui-bits.js';
import { snapshot, barterProfile, matBoards, SILVER } from '../ui-state.js';
import { barterKey } from '../clock.js';
import { currentShip, shownHold } from '../ship.js';
import { npcById, ports, isleOf, whoOf, isleShort } from '../barter_npcs.js';
import { fmtDistance } from '../sailing.js';
import { QUEST_CHOICES } from '../barter-orders.js';
import { landPrices } from '../land-cost.js';
import { GOODS, PARLEY, levelOf, npcGate, npcOpen } from '../barter.js';
import { exchanges, weightOf, sellOf } from '../barter-plan.js';
import { shotGuideHTML } from '../barter-import.js';
import { tellFleet, fleetHistory, shared as boardsShared } from '../sea-boards.js';
import { boardsOf as matBoardsOf, bookOf as matBookOf, bookFromGame, fitOf as matFitOf, seenOn as matSeenOnBook, MIN_FIT as MAT_MIN_FIT } from '../material-book.js';
import { materialPages, materialDeal } from '../barter-layouts.js';
import { openMaterialBook, pageName as matPageName } from '../material-book-view.js';
import { me } from '../sync.js';
import { materialRun } from '../barter-material.js';
import { tradeGoodNames } from '../trade_goods.js';
import { landGoods } from '../land_goods.js';
import { openPicker } from '../picker.js';
import { toast } from '../dialogs.js';
import { V } from './state.js';
import { fromPort, materials, itemNow, keepRoute } from './board.js';
import { narrow, lvTag } from './cockpit.js';
import { aboardStock, dockStock, storesElsewhere, bagsNow } from './hold.js';
import { runDockHTML } from './parts.js';
import { chartButton, parleyLine, parleyHTML, parleyOf } from './plan.js';
import { stashes, withWaits, legsOf, questPlan, questsLine, questsPanels, TIER, ledgerOf, runTime, stopRows } from './route.js';
import { sailing } from './sail.js';
import { redrawSoon, coinWorth } from './search.js';
import { persist, redrawTab } from './view.js';

/**
 * The run for a material, in the silver run's two panels: the ladder
 * on the left -- every rung from the shore to the material, with what
 * is aboard against what each hands over -- and the run on the right:
 * its choices, its figures, the stops rung by rung as a timeline.
 */
/** Today's material list, as answered; lapses with the barter day. */
export function matBoardNow() {
	if (V.matBoard.day !== barterKey()) { V.matBoard = { day: barterKey(), answers: [], on: [], told: 0 }; persist(); }
	return V.matBoard;
}

/**
 * What the recorded material boards say about one island's exchange:
 * on how many of them it showed, out of how many recorded.
 */
function matSeenOn(npcId, give, recv) {
	const seen = matSeenOnBook(matBookNow().pages, npcId, give, recv);
	return seen.of ? seen : null;
}

/* ------------------------------------------------------------------ *
 * the material book: the boards sailors have read of the material list
 * ------------------------------------------------------------------ */

/** Everything the fleet has read of the material list, asked for once
 *  a barter day and whenever the sailor has just sent a reading. */

export function matFleetNow() {
	if (!boardsShared()) return [];
	const day = barterKey();
	if (V.matFleet.day !== day) V.matFleet = { day, list: V.matFleet.list, asked: false };
	if (!V.matFleet.asked) {
		V.matFleet.asked = true;
		fleetHistory({ days: 400, list: 'material', force: true }).then(list => {
			V.matFleet = { day, list, asked: true };
			redrawSoon();
		}).catch(() => {});
	}
	return V.matFleet.list;
}

/** The book: the recorded boards and the fleet's, with every two that
 *  are one board made one. Worked out again only when either changes. */
function matBookNow() {
	const list = matFleetNow();
	if (!V.matBookMemo || V.matBookMemo.list !== list || V.matBookMemo.rec !== matBoards) {
		// The game's own layouts when they are loaded; the readings alone
		// before that.
		const game = materialPages();
		const boards = matBoardsOf(matBoards, list);
		V.matBookMemo = { list, rec: matBoards, pages: game.length ? bookFromGame(game, boards) : matBookOf(boards) };
	}
	return V.matBookMemo;
}

/** The islands answered by reading the window -- not the ones ticked
 *  off a board on file, which would only ever fit the board they came
 *  from. */
const matRead = () => matBoardNow().answers.filter(a => a.took !== 'book');

/** Which board on file today's material list is, as far as can be told. */
export function matFitNow() {
	const fit = matFitOf(matRead(), matBookNow().pages);
	// what the board would add is what is not on today's list at all,
	// read or already taken
	const have = new Set(matBoardNow().answers.map(a => a.npcId));
	return { ...fit, fill: fit.fill.filter(o => !have.has(o.npcId)) };
}

/** Today's answers, into the sailor's own diary of the list. */
export function noteMatSeen() {
	const mb = matBoardNow();
	const seen = { ...(store.getProfile('matSeen', {}) || {}) };
	seen[mb.day] = mb.answers.map(a => [a.npcId, a.give, a.recv]);
	store.setProfileQuiet('matSeen', seen);
}

/** Tick a board's islands onto today's list, the ones not answered
 *  yet: marked as taken, so the list and the fleet can tell them from
 *  islands read. */
export function takeMatOffers(offers, took) {
	const mb = matBoardNow();
	const have = new Set(mb.answers.map(a => a.npcId));
	let n = 0;
	for (const o of offers) {
		const npcId = Number(o.npcId);
		if (have.has(npcId) || !npcById.has(npcId)) continue;
		mb.answers.push({ npcId, give: o.give, recv: o.recv, took });
		have.add(npcId);
		n++;
	}
	persist();
	noteMatSeen();
	return n;
}

/** Today's reading of the material list, sent to the fleet: the islands
 *  read, never the ones taken from a board or from somebody else. */
export function tellMatFleet(then) {
	const mb = matBoardNow();
	const read = mb.answers.filter(a => !a.took);
	if (!read.length) { toast(T('Nothing read off the window yet: islands taken from a board are not news')); return; }
	if (!me()) { toast(T('Sign in from the Menu to put your name to a reading')); return; }
	toast(T('Sending today’s material list…'));
	tellFleet(barterKey(), null, read.map(a => ({ ...a, qty: '1' })), 'material').then(out => {
		if (out.ok) { mb.told = read.length; persist(); }
		toast(out.ok
			? (read.length === 1
				? T('The fleet has your reading of today’s material list — {n} island, with your name on it', { n: read.length })
				: T('The fleet has your reading of today’s material list — {n} islands, with your name on it', { n: read.length }))
			: T('It did not go: {why}', { why: said(out.why) }), out.ok);
		V.matFleet.asked = false;
		then();
	});
}

/** The book, opened from the material bar. */
export function openMatBook(then) {
	openMaterialBook({
		record: matBoards,
		answers: matRead(),
		ticked: matBoardNow().answers.map(a => a.npcId),
		day: barterKey(),
		onTake: page => {
			const n = takeMatOffers([...page.offers].map(([npcId, o]) => ({ npcId, ...o })), 'book');
			// Whose list today's is, for the bar to say so rather than
			// ask for a screenshot of a list it already has.
			matBoardNow().from = { kind: 'book', id: String(page.id) };
			persist();
			toast(n === 1 ? T('{n} island ticked from {board}', { n, board: matPageName(page) }) : T('{n} islands ticked from {board}', { n, board: matPageName(page) }), true);
			then();
		},
		onTell: matTellable() ? done => tellMatFleet(() => { done(); then(); }) : null
	});
}

/**
 * A board the book already has, read again today, is counted without
 * asking: how often a board comes round is what the book learns from,
 * and a button to say "I saw it too" was a chore nobody owed. Signed in
 * only -- a reading goes up with the account it came from, shown by
 * name or not as the sailor chose for the community boards -- and once
 * for what has been read; the server merges a sailor's readings of one
 * day into one. A new board is still offered, never sent by itself.
 */
function matAutoTell() {
	const st = matStage();
	if (st.kind !== 'known' || st.told || !boardsShared() || !me()) return;
	const mb = matBoardNow();
	const read = mb.answers.filter(a => !a.took);
	const key = `${mb.day}|${read.length}`;
	if (V.matAutoTold === key) return;   // under way, or tried and failed
	V.matAutoTold = key;
	tellFleet(barterKey(), null, read.map(a => ({ ...a, qty: '1' })), 'material').then(out => {
		if (!out.ok) return;
		mb.told = read.length;
		persist();
		V.matFleet.asked = false;
		redrawTab();
	}).catch(() => {});
}

/** Is there anything read and not yet sent? */
function matTellable() {
	const mb = matBoardNow();
	return boardsShared() && mb.answers.filter(a => !a.took).length > (mb.told || 0);
}

/** Today's readings by others, the fullest and most confirmed first. */
function matFleetToday() {
	const day = barterKey();
	return matFleetNow().filter(b => String(b.day).slice(0, 10) === String(day).slice(0, 10))
		.sort((a, b) => Number(b.mine === false) - Number(a.mine === false) || b.offers.length - a.offers.length || b.seen - a.seen);
}

/** How many islands a whole material list has: the boards on file
 *  say, and forty-four if there are none to ask. */
function matWhole() {
	const sizes = matBookNow().pages.map(p => p.offers.size).sort((a, b) => a - b);
	return sizes.length ? sizes[Math.floor(sizes.length / 2)] : 44;
}

/**
 * Where the sailor is with today's material list, as three steps:
 * one page read; then either the board is known -- take the rest -- or
 * it is new, and the whole list is read; then the fleet is told.
 *
 * `kind` is 'start' (nothing read, or too little to weigh), 'split'
 * (several boards fit), 'known' (one does) or 'new' (none does).
 */
function matStage() {
	const mb = matBoardNow();
	const fit = matFitNow();
	const read = mb.answers.filter(a => !a.took).length;
	const fits = fit.standing.filter(w => w.agree >= MAT_MIN_FIT).length;
	// Nothing read yet, but a whole list taken -- from the book or from
	// another sailor: that is today's list, not a question.
	const taken = mb.answers.filter(a => a.took).length;
	const kind = fit.sure ? 'known' : fits > 1 ? 'split' : fit.answered >= MAT_MIN_FIT ? 'new' : !read && taken ? 'taken' : 'start';
	const whole = matWhole();
	const complete = kind === 'new' && (mb.whole || read >= Math.round(whole * 0.9));
	const told = read > 0 && (mb.told || 0) >= read;
	// A known board has nothing to share: it is counted by itself.
	const step = kind === 'start' ? 1 : kind === 'split' || kind === 'taken' ? 2 : kind === 'known' ? (fit.fill.length ? 2 : 4) : complete ? 3 : 2;
	return { kind, step, fit, read, whole, complete, told, fits, taken };
}

/** What a screenshot of the barter window should hold, for the board. */
export function tradeShotHelp() {
	return `<details class="mat-help">
		<summary>${T('What should the screenshot look like?')}</summary>
		${shotGuideHTML('trade', { lazy: true })}
		<div class="mat-help-figs">
			<figure class="mat-help-fig narrow"><img src="guide/refresh-trade.webp" alt="${T('The game’s refresh window, the trade item refreshes outlined')}" loading="lazy" width="487" height="629">
				<figcaption>${T('Silver, a stock and Crow Coins are all dealt from the trade goods list: the one the Trade Item Barter Refresh redraws.')}</figcaption></figure>
		</div>
		<ul class="mat-help-list">
			<li>${T('Any of the game’s languages: screenshots are read in the language chosen in the Menu, against the game’s own names in it — set it to your game’s language.')}</li>
			<li>${T('Nothing is uploaded: the pictures are read in this browser.')}</li>
		</ul>
	</details>`;
}

/** The two pictures of what to screenshot, and the words under them. */
function matShotHelp(open = false, scroll = false) {
	return `<details class="mat-help"${open ? ' open' : ''}>
		<summary>${T('What should the screenshot look like?')}</summary>
		${shotGuideHTML('material', { lazy: true })}
		<div class="mat-help-figs">
			<figure class="mat-help-fig narrow"><img src="guide/refresh-material.webp" alt="${T('The game’s refresh window, the ship material refreshes outlined')}" loading="lazy" width="487" height="629">
				<figcaption>${T('The material list is its own list, redrawn by the Ship Material Refresh — apart from the trade goods, so its board changes on its own clock.')}</figcaption></figure>
		</div>
		${scroll ? `<figure class="mat-help-fig"><img src="guide/material-scroll.webp" alt="${T('Three screenshots of the whole window, the list scrolled between each')}" loading="lazy" width="1000" height="245">
			<figcaption>${T('The list is longer than the window: shoot the whole window, scroll the list down, shoot again, to the end. A row on two shots is fine — it is read once. Paste or drop them all at once.')}</figcaption></figure>` : ''}
		<ul class="mat-help-list">
			<li>${T('Any of the game’s languages: screenshots are read in the language chosen in the Menu, against the game’s own names in it — set it to your game’s language.')}</li>
			<li>${T('Nothing is uploaded: the pictures are read in this browser. Only what you choose to tell the fleet leaves it.')}</li>
		</ul>
	</details>`;
}

/**
 * The material bar: today's material list, taken as three steps. One
 * page is pasted; the boards sailors have read are weighed against it;
 * a board on file hands over the rest of the window, and a board nobody
 * has is read whole and passed on, so the next sailor needs one page.
 */
export function matBarHTML() {
	const mb = matBoardNow();
	const st = matStage();
	const { fit, kind } = st;
	const { pages } = matBookNow();
	const today = matFleetToday();
	const theirs = today.find(b => !b.mine);
	const shared = boardsShared();
	const book = `<button class="ghost-btn sm" data-act="barter-mat-book" title="${T('Every material board sailors have read, what each pays, how often it has been seen, and by whom')}">📖 ${T('The material book')} · ${pages.length === 1 ? T('{n} board', { n: F(pages.length) }) : T('{n} boards', { n: F(pages.length) })}</button>`;
	const drop = (big, lead, sub) => `<button class="board-drop${big ? '' : ' slim'}" data-act="barter-shot"><b class="by-key">${lead}</b><b class="by-touch">${lead}</b><span>${sub}</span></button>`;
	const stepper = [
		[1, '📷', T('One page'), T('Paste a screenshot of the list')],
		[2, kind === 'new' ? '📜' : '🔍', kind === 'new' ? T('The whole list') : T('Which board'), kind === 'new' ? T('A new board: read every page') : T('Known to the book?')],
		[3, '📣', T('Share'), T('So the next sailor needs one page')]
	].map(([n, icon, k, sub]) => `<li class="mat-step${st.step === n ? ' on' : st.step > n ? ' done' : ''}"><i>${st.step > n ? '✓' : icon}</i><span><b>${k}</b><small>${sub}</small></span></li>`).join('');
	const fleetLine = theirs && kind !== 'known'
		? `<div class="board-fleet">${T('{isles} of today’s material list read by {who}', { isles: theirs.offers.length === 1 ? T('<b>{n} island</b>', { n: theirs.offers.length }) : T('<b>{n} islands</b>', { n: theirs.offers.length }), who: theirs.name ? esc(theirs.name) : T('a sailor who is not shown by name') })}${theirs.seen ? ` · ${theirs.seen === 1 ? T('{n} sailor has seen the same', { n: F(theirs.seen) }) : T('{n} sailors have seen the same', { n: F(theirs.seen) })}` : ''}
			<button class="linky" data-act="barter-mat-fleet-take" data-id="${esc(String(theirs.id))}" title="${T('Tick their islands on today’s list, marked as theirs: the ones you read yourself keep your reading')}">${T('take their reading')}</button></div>`
		: '';
	const tellBtn = (primary, label, title) => (shared ? `<button class="${primary ? 'chip primary' : 'ghost-btn sm'}" data-act="barter-mat-tell" title="${me() ? title : T('Sign in from the Menu first — a reading goes up with a name on it')}">📣 ${label}</button>` : '');
	const progress = (n, of) => `<div class="mat-progress" title="${T('{n} of about {of} islands a whole list has', { n: F(n), of: F(of) })}"><i style="width:${Math.min(100, Math.round((n / Math.max(1, of)) * 100))}%"></i><span>${T('{n} of about {of} islands', { n: F(n), of: F(of) })}</span></div>`;

	let body;
	if (kind === 'start') {
		body = `${drop(!st.read, st.read ? T('Paste another page') : T('Paste one screenshot of the material list'), st.read
			? (st.read === 1 ? T('{n} island read so far — a page more and the book is checked against it.', { n: F(st.read) }) : T('{n} islands read so far — a page more and the book is checked against it.', { n: F(st.read) }))
			: T('Open the Barter Information window in game — the same window as for trade goods — screenshot it whole and paste it here (Ctrl V). The rows paying ship materials are read, with your Parley and barter count; if the book knows the board, the rest of the list is filled in for you.'))}
			${matShotHelp(!st.read)}
			${fleetLine}
			<p class="board-ask-sub">${T('Or tick, below, the islands showing what you are after.')}</p>`;
	} else if (kind === 'taken') {
		// A list taken whole needs no screenshot; one can still check it.
		const from = mb.from || {};
		const page = from.kind === 'book' ? pages.find(p => String(p.id) === from.id) : null;
		const line = page
			? T('Today’s list is {board}, from the material book: {n} islands filled in.', { board: `<button class="linky" data-act="barter-mat-book" title="${T('Open it in the material book')}"><b>${matPageName(page)}</b></button>`, n: F(st.taken) })
			: from.kind === 'fleet'
				? T('Today’s list is {who}’s reading: {n} islands filled in.', { who: from.name ? `<b>${esc(from.name)}</b>` : T('another sailor'), n: F(st.taken) })
				: T('{n} filled in', { n: F(st.taken) });
		body = `<p class="mat-say known">✓ ${line} ${T('They show dashed below. A page read off the window checks them and puts right any that differ.')}</p>
			<div class="mat-acts"><button class="ghost-btn sm" data-act="barter-shot">📷 ${T('Check it with a screenshot')}</button></div>`;
	} else if (kind === 'split') {
		const at = fit.splitter ? npcById.get(fit.splitter) : null;
		body = `<p class="mat-say">${T('What you read fits <b>{n} boards</b> in the book so far.', { n: F(st.fits) })} ${at ? T('One more page tells them apart — the one with <b>{isle}</b> on it.', { isle: esc(gameName(isleOf(at))) }) : T('One more page tells them apart.')}</p>
			${drop(false, T('Paste another page'), T('Any page not read yet; the one with that island settles it.'))}
			${fleetLine}`;
	} else if (kind === 'known') {
		const w = fit.best;
		const last = w.page.last ? new Date(`${w.page.last}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
		const name = `<button class="linky" data-act="barter-mat-book" title="${T('Open it in the material book')}"><b>${matPageName(w.page)}</b></button>`;
		const seen = w.page.times > 1 ? T('read {n} times, last {day}', { n: F(w.page.times), day: esc(last) }) : T('read once before');
		body = `<p class="mat-say known">✓ ${w.differ.length
			? T('This is {board} — in the book, {seen}. It agrees at {n} islands and parts at one: a slip, or a slot moved.', { board: name, seen, n: F(w.agree) })
			: T('This is {board} — in the book, {seen}. It agrees at every one of the {n} islands you read.', { board: name, seen, n: F(w.agree) })}</p>
			<div class="mat-acts">${fit.fill.length
		? `<button class="chip primary" data-act="barter-mat-fill" title="${T('Tick them as taken from the board, not read: they show dashed below, and a page read later puts any that differ right')}">${fit.fill.length === 1 ? T('Fill in its other {n} island', { n: fit.fill.length }) : T('Fill in its other {n} islands', { n: fit.fill.length })}</button>`
		: `<span class="mat-done">${T('Every island of it is on today’s list. Open a material below and the run lays itself out.')}</span>`}
			${st.told ? `<span class="mat-done">✓ ${T('The fleet knows you saw it')}</span>` : ''}</div>`;
		setTimeout(matAutoTell, 0);
	} else {
		const figures = `${progress(st.read, st.whole)}`;
		body = st.complete
			? `<p class="mat-say new">★ ${T('A board nobody has in the book — and you have read it whole.')}</p>
				${figures}
				<div class="mat-acts">${st.told
		? `<span class="mat-done">✓ ${T('Shared with the fleet: the next sailor who reads one page of it gets the rest.')}</span>`
		: tellBtn(true, T('Share it with the fleet'), T('Everyone can then recognise this board from one page, with your name on the reading'))}
				<button class="linky" data-act="barter-shot">${T('read more pages')}</button></div>`
			: `<p class="mat-say new">★ ${T('This board is not in the book yet. Read the whole list and share it: every sailor after you will need only one page.')}</p>
				${figures}
				${drop(false, T('Paste the other pages'), T('Scroll the list in game and screenshot the whole window each time, then paste them all at once. A row on two shots is read once.'))}
				${matShotHelp(false, true)}
				<div class="mat-acts"><button class="ghost-btn sm" data-act="barter-mat-whole" title="${T('The list in game ends here: nothing more to read')}">${T('That was the whole list')}</button>${st.read && !st.told ? tellBtn(false, T('Share what I have'), T('Send the islands read so far; more can follow, and they are merged')) : ''}</div>
				${fleetLine}`;
	}
	const taken = mb.answers.length - st.read;
	return `<section class="panel board-ask mat-bar">
		<div class="panel-head"><h2 class="panel-title">${T('Today’s material list')}</h2><span class="panel-sub board-ask-lead">${st.read ? (st.read === 1 ? T('{n} island read', { n: F(st.read) }) : T('{n} islands read', { n: F(st.read) })) : ''}${taken ? ` · ${T('{n} filled in', { n: F(taken) })}` : ''}</span><span class="panel-spacer"></span>${book}${mb.answers.length ? `<button class="ghost-btn sm" data-act="barter-mat-clear" title="${T('The list was refreshed in game: start again')}">↻ ${T('Refreshed in game')}</button>` : ''}</div>
		<div class="panel-body">
			<ol class="mat-steps">${stepper}</ol>
			${body}
		</div>
	</section>`;
}

/** What is held of a good for the run: aboard, and at the start
 *  harbour's storage; and elsewhere, which is not sailed with. */
export function heldOf(name) {
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
			<button class="mat-tile-x" data-act="barter-mat-drop" data-item="${esc(m.it)}" title="${T('The run no longer sails for {name}; the islands showing it stay ticked', { name: esc(gameName(m.it)) })}" aria-label="${T('Take {name} off the run', { name: esc(gameName(m.it)) })}">×</button>
		</span>`;
	}).join('');
	return `<div class="mat-strip">
		${tiles}
		<button class="mat-tile add" data-act="barter-mat-add" title="${T('Tick islands for another material too: one run sails for all of them')}">+ ${mats.length ? T('another material') : T('a material')}</button>
		<span class="panel-spacer"></span>
		${mb.answers.length ? `<button class="linky faint" data-act="barter-mat-clear" data-keep-parley="1">${T('clear the day')}</button>` : ''}
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
	const tookOf = (npcId, give) => { const a = mb.answers.find(x => x.npcId === npcId && x.give === give && x.recv === it); return a ? a.took || '' : ''; };
	const elsewhere = npcId => mb.answers.find(a => a.npcId === npcId && !(a.recv === it));
	const q = V.matQ.trim().toLowerCase();
	const lvs = [...new Set(rows.map(x => levelOf(x.give) || 0))].sort((a, b) => a - b);
	const badge = lv => `<i class="tier-badge" style="--tier:${TIER(lv || 1)}">${lv ? lvTag(lv) : '·'}</i>`;
	const groups = [...byGive]
		.map(([give, xs]) => ({ give, xs, held: heldOf(give), any: xs.some(x => ticked(x.npcId, give)) }))
		.filter(g => (!V.matLv || (levelOf(g.give) || 0) === V.matLv)
			&& (V.matOnly !== 'held' || g.held.run > 0 || g.held.elsewhere > 0)
			&& (V.matOnly !== 'today' || g.any)
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
					const took = on ? tookOf(x.npcId, give) : '';
					return `<button class="chip mat-isle${on ? ' active' : ''}${took ? ' took' : ''}${other ? ' other' : ''}" aria-pressed="${on ? 'true' : 'false'}" data-act="barter-mat-tick" data-npc="${x.npcId}" data-give="${esc(give)}" title="${esc(gameName(npc.at))} — ${esc(gameName(npc.name))}${took === 'book' ? ` · ${T('ticked from a board on file, not read: check it in the window')}` : took === 'fleet' ? ` · ${T('ticked from another sailor’s reading')}` : ''}${other ? ` · ${T('today it shows {give} → {recv}', { give: gameName(other.give), recv: gameName(other.recv) })}` : ''}${seen && seen.of ? ` · ${T('showed this on {n} of {of} recorded boards', { n: seen.n, of: seen.of })}` : ''}">${on ? '✓ ' : ''}${esc(isleShort(npc))}<span class="mat-isle-who">${esc(gameName(whoOf(npc)))}</span>${seen && seen.of ? `<span class="mat-isle-seen${seen.n ? ' some' : ''}">${seen.n}/${seen.of}</span>` : ''}</button>`;
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
		<input class="field hold-q" type="search" placeholder="${T('Find an island, a barterer or a give…')}" value="${esc(V.matQ)}" data-act="barter-mat-q" aria-label="${T('Find in the material list')}">
		<button class="chip tiny${V.matOnly === 'today' ? ' active' : ''}" aria-pressed="${V.matOnly === 'today' ? 'true' : 'false'}" data-act="barter-mat-only" data-id="today" title="${T('Only the islands ticked as showing it today')}">${T('showing today')}</button>
		<button class="chip tiny${V.matOnly === 'held' ? ' active' : ''}" aria-pressed="${V.matOnly === 'held' ? 'true' : 'false'}" data-act="barter-mat-only" data-id="held" title="${T('Only the exchanges whose give you hold')}">${T('I hold the give')}</button>
		<span class="mat-filters-rule"></span>
		${lvs.map(l => `<button class="chip tiny lvl${V.matLv === l ? ' active' : ''}" aria-pressed="${V.matLv === l ? 'true' : 'false'}" data-act="barter-mat-lv" data-lv="${l}" style="--tier:${TIER(l || 1)}" title="${l ? T('Gives of Level {lv}', { lv: l }) : T('Land goods')}">${l || '·'}</button>`).join('')}
		${q || V.matOnly || V.matLv ? `<button class="linky faint mat-filters-clear" data-act="barter-mat-filters-clear">${T('clear')}</button>` : ''}
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
		<label class="mat-want"><span class="run-pick-k">${T('wanted')}</span>${amountInput('purse-inline', V.qty, `data-act="barter-qty" aria-label="${T('How many')}"`)}</label>
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
export function materialParts(me, data) {
	const it = itemNow();
	const from = fromPort();
	const mats = matsToday();
	if (!it && !materials().length) {
		return { secs: [['ladder', T('The materials wanted'), T('for a material'), `<p class="empty">${T('The barter table deals no material the app knows.')}</p>`]], load: '', dock: '', things: { all: 0, done: 0 }, stops: 0, time: '' };
	}
	const short = it ? (snapshot && snapshot.missing && Number(snapshot.missing[it])) || 0 : 0;
	const showing = matBoardNow().answers;
	const listPanel = `<section class="barter-chains mat-list hero">
		${matStripHTML(mats, it)}
		${it ? matListHTML(it, data, { short, boards: matBookNow().pages.reduce((a, p) => a + p.times, 0) }) : `<div class="mat-pick-hint">${mats.length ? T('No material is open. Tap one above to tick its islands, or add another; the run below sails for every one ticked.') : T('Nothing on the run yet. Add a material and tick the islands showing it today.')}</div>`}
	</section>`;
	const rows = exchanges(data).filter(x => npcById.has(x.npcId));
	// A tick kept from before a save was moved, or from before the
	// gate was known, is not a stop: the run only calls where the
	// barter count says it may.
	// Only the islands showing a material the run is for: the rest of
	// the list is known, and not sailed for.
	const forRun = new Set(mats.map(m => m.it));
	// Each exchange as the game has it: its daily count, what it pays and
	// its base Parley, where the codex's figures were a guess.
	const asGame = x => {
		const g = materialDeal(x.npcId, x.give, x.item);
		return g ? { ...x, tries: g.perDay, recvMin: g.recvMin, recvMax: g.recvMax, recv: (g.recvMin + g.recvMax) / 2, recvText: g.recvMin === g.recvMax ? String(g.recvMin) : `${g.recvMin}-${g.recvMax}`, parleyBase: g.parley } : x;
	};
	const picks = showing.filter(a => forRun.has(a.recv)).map(a => rows.find(x => x.npcId === a.npcId && x.give === a.give && x.item === a.recv))
		.filter(x => x && npcOpen(x.npcId, barterProfile().barterCount)).map(asGame);
	const plan = materialRun({
		picks, wants: new Map(mats.map(m => [m.it, m.qty])), reach: V.matOrders.reach, pace: V.matOrders.pace, calls: V.matOrders.calls,
		stock: aboardStock(), dock: dockStock(), stores: storesElsewhere(), bags: bagsNow(),
		prices: landPrices([...new Set(picks.map(x => x.give).filter(g => levelOf(g) === null))], store.getProfile('homemade', []) || []),
		hold: me.hold, start: from, startWharf: from ? stashes.find(w => w.at === from.name) || null : null, npcById
	});
	for (const s of plan.stops) s.hold = me.hold;
	// Each island at its own price: the material list's exchanges cost far
	// more Parley than a trade good's, and a run recorded at the trade
	// price left the bar reading a third of what was really spent.
	const rate = parleyOf(barterProfile()).rate;
	for (const s of plan.stops) if (s.npcId && s.times > 0) s.parley = s.times * Math.floor((s.parleyBase || PARLEY.perMaterialTrade) * rate);
	const qp = questPlan(plan.stops, V.matOrders.quests, me.hold, plan.weightStart);
	plan.stops = withWaits(qp.stops, plan.weightStart);
	plan.questsHome = qp.home;
	V.shownPlan = plan.stops.length ? { stops: plan.stops, cost: plan.cost, bought: plan.bought || [], parleyUsed: plan.stops.reduce((a, x) => a + (Number(x.parley) || 0), 0), questsHome: qp.home } : null;
	const legs = legsOf(plan.stops);
	const book = ledgerOf(plan.stops, legs);
	// What is short splits two ways: some of it may sit in a storage the
	// run cannot load from -- to bring to the harbour first -- and the
	// rest is not held at all, to climb for on the item board.
	const shortRows = plan.missing.map(m => { const there = m.heldAt.reduce((a, h) => a + h.n, 0); return { ...m, bring: Math.min(m.n, there), climb: Math.max(0, m.n - there) }; });
	const toBring = shortRows.filter(m => m.bring > 0);
	const toClimb = shortRows.filter(m => m.climb > 0);
	const coin = mats.some(m => m.it === 'Crow Coin') ? coinWorth() : null;
	const gotText = m => { const g = plan.got.get(m.it); return g.min === g.max ? F(g.min) : `${F(g.min)}–${F(g.max)}`; };
	const portSel = `<label class="run-pick"><span class="run-pick-k">${T('from')}</span><select class="field select" data-act="barter-port">${[[0, T('the first stop')], ...ports.map(p => [p.id, gameName(p.name)])].map(([v, t]) => `<option value="${esc(String(v))}"${String(v) === String(V.port) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
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
				<option value="want"${V.matOrders.reach === 'want' ? ' selected' : ''}>${T('the wants, then home')}</option>
				<option value="all"${V.matOrders.reach === 'all' ? ' selected' : ''}>${T('every island ticked')}</option>
			</select>
		</label>
		<label class="mat-order" title="${T('Full: every give ticked, in as many departures as the hold needs, what the run will not spend left in storage. Fast: one departure under the limit the ship still sails at full speed at; what does not fit stays ashore')}"><span class="run-pick-k">${T('pace')}</span>
			<select class="purse-inline" data-act="barter-mat-pace">
				<option value="full"${V.matOrders.pace === 'full' ? ' selected' : ''}>${T('full')}</option>
				<option value="fast"${V.matOrders.pace === 'fast' ? ' selected' : ''}>${T('fast')}</option>
			</select>
		</label>
		<label class="inline-check mat-order" title="${T('Put in at another harbour on the way for a give kept in its storage')}"><input type="checkbox" data-act="barter-mat-calls"${V.matOrders.calls ? ' checked' : ''}> ${T('harbour calls for a give kept there')}</label>
		<label class="mat-order" title="${T('The dailies and weeklies already taken, handed in where the run passes their taker or at a stop put in a short way off the route; the hunts only when their grounds lie on the way')}"><span class="run-pick-k">${T('quests')}</span>
			<select class="purse-inline" data-act="barter-mat-quests">${QUEST_CHOICES.map(([v, t]) => `<option value="${v}"${V.matOrders.quests === v ? ' selected' : ''}>${esc(said(t))}</option>`).join('')}</select>
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
		${fig(img(currentShip().name, 'ship-ico'), plan.islands === 1 ? T('{n} island', { n: plan.islands }) : T('{n} islands', { n: plan.islands }), plan.trades === 1 ? T('{n} trade', { n: plan.trades }) : T('{n} trades', { n: plan.trades }))}
		${plan.calls ? fig('⚓', plan.calls === 1 ? T('{n} harbour call', { n: plan.calls }) : T('{n} harbour calls', { n: plan.calls }), plan.returns ? T('{n} departures: the hold cannot carry every give at once', { n: plan.returns + 1 }) : T('to load from storage')) : ''}
		${fig('⚖', esc(peakM.text), `${T('at its fullest')} · ${holdCls === 'ok' ? T('under the limit') : holdCls === 'amber' ? T('over the limit: sailing slower') : T('over {n}: too heavy to barter', { n: F(peakM.deal) })}`, holdCls)}
		${legs.total ? fig('⏱', esc(runTime(legs, book)), `${T('{dist} at {speed}%', { dist: esc(fmtDistance(legs.total)), speed: me.speed.total })}${from ? ` ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}`) : ''}
		${plan.cost ? fig(img(SILVER, 'row-icon xs'), FC(plan.cost), T('to buy ashore first')) : ''}
	</div>` : '';
	const summary = plan.ticked ? `<div class="mat-summary">${yieldRows ? `<div class="mat-yield">${yieldRows}</div>` : ''}${figs}</div>` : '';
	// A row of a goods list: the tier, the icon, the count, the name,
	// the note, and what can be done about it.
	const good = (name, n, note, act = '') => { const lv = levelOf(name); return `<div class="run-good mat-good"><i style="--tier:${TIER(lv || 1)}">${lv ? lvTag(lv) : '·'}</i>${img(name, 'row-icon sm')}<b>${F(Math.ceil(n))}×</b><span>${esc(gameName(name))}</span><span class="faint">${note}</span>${copyName(name)}${act ? `<span class="run-good-worth">${act}</span>` : ''}</div>`; };
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
		${toBring.map(m => good(m.give, m.bring, `${T('at {where}', { where: esc(m.heldAt.map(h => `${gameName(h.town)} (${F(h.n)})`).join(', ')) })} · ${T('bring it to {where} first', { where: from ? esc(T('{port}’s storage', { port: gameName(from.name) })) : T('the harbour the run sails from') })}${V.matOrders.calls ? '' : `, ${T('or let the run call there')}`} · ${T('for {isles}', { isles: esc(m.islands.map(n => isleShort(n)).join(', ')) })}`)).join('')}
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
	const ashore = plan.noRoom.length ? `<section class="panel run-list amber mat-goods"><div class="panel-head"><h2 class="panel-title">${T('Stays ashore')}</h2><span class="panel-sub">${V.matOrders.pace === 'fast' ? T('held, but one departure under the limit cannot carry it all') : T('held, but more than the hold barters under, even alone')}</span>${V.matOrders.pace === 'fast' ? `<span class="panel-spacer"></span><button class="chip tiny primary" data-act="barter-mat-pace-set" data-id="full" title="${T('Sail in as many departures as the hold needs')}">${T('sail the full run')} →</button>` : ''}</div>
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
		legs.total ? `≈ <b>${esc(runTime(legs, book))}</b>` : '',
		qp.count ? `📜 ${qp.count === 1 ? T('<b>{n}</b> quest', { n: qp.count }) : T('<b>{n}</b> quests', { n: qp.count })}` : '',
		holdCls === 'warn' ? `<b class="warn">${T('too heavy')}</b>` : holdCls === 'amber' ? `<b class="amber">${T('over the limit')}</b>` : ''
	]) : '';
	if (plan.stops.length) keepRoute(plan, legs, book, segs, it || (mats[0] && mats[0].it) || '');
	const routeFold = plan.stops.length ? `<details class="panel route-fold"${sailing() || narrow() ? '' : ' open'}><summary><b>${T('The route, stop by stop')}</b><span class="panel-sub">${mats.length ? T('for {materials}', { materials: esc(mats.map(m => gameName(m.it)).join(', ')) }) : T('for a material')}${legs.total ? ` · ≈ ${esc(runTime(legs, book))}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}</span>${questsLine(qp, V.matOrders.quests)}<span class="panel-spacer"></span>${chartButton(plan.stops, it || (mats[0] && mats[0].it) || '')}</summary>${segs}</details>` : '';
	const matsSaid = mats.length ? mats.map(m => `${F(m.qty)}× ${gameName(m.it)}`).join(', ') : T('nothing on the run yet');
	const comes = plan.ticked ? mats.map(m => { const g = plan.got.get(m.it); return T('{got} of {want}', { got: g.max > 0 ? gotText(m) : '0', want: F(m.qty) }); }).join(' · ') : T('nothing ticked yet');
	return {
		secs: [
			['parley', T('Before you sail'), esc(parleyLine(barterProfile())), parleyHTML(barterProfile())],
			['ladder', T('The materials wanted'), esc(matsSaid), `${listPanel}<div class="plan-next"><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="how">${T('OK, that’s the goal')} ›</button></div>`],
			['how', T('How to sail it'), esc([V.matOrders.pace === 'fast' ? T('fast') : T('full'), V.matOrders.reach === 'all' ? T('every island ticked') : T('the wants, then home'), from ? T('from {port}', { port: gameName(from.name) }) : ''].filter(Boolean).join(' · ')), `${head}${ordersRow}<div class="plan-next"><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="chains">${T('OK, see what comes of it')} ›</button></div>`],
			['chains', T('What comes of it'), esc(comes), summary || `<p class="empty">${T('Nothing ticked. Open a material and tap each island showing it today — the run lays itself out here.')}</p>`]
		],
		load: `${empty}${before}${missing}${ashore}${questsPanels(qp, from)}${routeFold}`,
		dock: foot, things: { all: plan.bought.length + toBring.length, done: 0 }, stops: plan.stops.length, time: runTime(legs, book) || ''
	};
}

/* ------------------------------------------------------------------ *
 * what the tab answers to
 * ------------------------------------------------------------------ */

export function pickGood(then) {
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

export function pickMaterial(then) {
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
export function setMaterial(name) {
	const now = itemNow();
	const mb = matBoardNow();
	if (name && !mb.on.includes(name)) mb.on.push(name);
	if (now) V.wants[now] = V.qty;
	// Its own want: what was typed for it before, else what the builds
	// are short of, else one -- read before it is the open one, since
	// the open one's want is `qty`. Put down (no name), nothing is open.
	if (name && name !== now) V.qty = wantOf(name);
	V.item = name;
	persist();
}

/** The want of a material: what was typed for it, else what the
 *  builds are short of, else one. */
function wantOf(name) {
	if (name === itemNow()) return V.qty;
	if (V.wants[name] > 0) return V.wants[name];
	const short = (materials().find(m => m.name === name) || {}).short || 0;
	return short ? Math.ceil(short) : 1;
}

/** The materials on today's run, in the order they came: every one
 *  the sailor opened or ticked an island for, and the one open if it is
 *  not among them, each with its want. A tile keeps its place when it
 *  is opened. What a screenshot or a board says is showing is not a
 *  wish: it is on the list, and on the run only when chosen. */
function matsToday() {
	const it = itemNow();
	const seen = matBoardNow().on;
	const all = it && !seen.includes(it) ? [...seen, it] : seen;
	return all.filter(m => materials().some(x => x.name === m)).map(m => ({ it: m, qty: wantOf(m) }));
}
