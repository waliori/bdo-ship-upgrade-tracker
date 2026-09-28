// The material run: the list, the book of the game's layouts,
// the screenshot help, and the run for one material or several.

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img, copyName, amountInput } from '../ui-bits.js';
import { barterProfile, SILVER, CROW_COIN, totalsToGo } from '../ui-state.js';
import { barterKey } from '../clock.js';
import { currentShip, shownHold } from '../ship.js';
import { npcById, ports, isleOf, whoOf, isleShort } from '../barter_npcs.js';
import { fmtDistance } from '../sailing.js';
import { QUEST_CHOICES, VOUCHER_CHOICES } from '../barter-orders.js';
import { landPrices } from '../land-cost.js';
import { GOODS, PARLEY, levelOf, npcGate, npcOpen } from '../barter.js';
import { weightOf, sellOf } from '../barter-plan.js';
import { shotGuideHTML } from '../barter-import.js';
import { bookFromGame, fitOf as matFitOf, MIN_FIT as MAT_MIN_FIT } from '../material-book.js';
import { materialPages, materialDeal } from '../barter-layouts.js';
import { openMaterialBook, pageName as matPageName } from '../material-book-view.js';
import { materialRun } from '../barter-material.js';
import { tradeGoodNames } from '../trade_goods.js';
import { landGoods } from '../land_goods.js';
import { openPicker } from '../picker.js';
import { toast } from '../dialogs.js';
import { V } from './state.js';
import { fromPort, materials, keepRoute } from './board.js';
import { narrow, lvTag } from './cockpit.js';
import { aboardStock, dockStock, storesElsewhere, bagsNow } from './hold.js';
import { runDockHTML } from './parts.js';
import { chartButton, parleyLine, parleyHTML, parleyOf, orderRow, ordersNow } from './plan.js';
import { stashes, withWaits, legsOf, questPlan, questsLine, questsPanels, TIER, ledgerOf, runTime, stopRows } from './route.js';
import { sailing } from './sail.js';
import { coinWorth } from './search.js';
import { persist } from './view.js';

/**
 * The run for a material, in the silver run's two panels: the ladder
 * on the left -- every rung from the shore to the material, with what
 * is aboard against what each hands over -- and the run on the right:
 * its choices, its figures, the stops rung by rung as a timeline.
 */
/** Today's material list, as answered; lapses with the barter day. */
export function matBoardNow() {
	if (V.matBoard.day !== barterKey()) { V.matBoard = { day: barterKey(), answers: [], on: [] }; persist(); }
	return V.matBoard;
}

/* ------------------------------------------------------------------ *
 * the material book: the game's own layouts of the material list
 * ------------------------------------------------------------------ */

/** The book: every layout the game's files hold, made once. Empty until
 *  the game's tables are loaded. */
function matBookNow() {
	const game = materialPages();
	if (!V.matBookMemo || V.matBookMemo.game !== game.length) V.matBookMemo = { game: game.length, pages: game.length ? bookFromGame(game, []) : [] };
	return V.matBookMemo;
}

/** The islands answered by reading the window -- not the ones ticked
 *  off a layout, which would only ever fit the layout they came from. */
const matRead = () => matBoardNow().answers.filter(a => a.took !== 'book');

/** Which layout today's material list is, as far as can be told. */
export function matFitNow() {
	const fit = matFitOf(matRead(), matBookNow().pages);
	// what the layout would add is what is not on today's list at all,
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

/** Tick a layout's islands onto today's list, the ones not answered
 *  yet: marked as taken, so the list can tell them from islands read. */
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

/** The book, opened from the material bar. */
export function openMatBook(then) {
	openMaterialBook({
		pages: matBookNow().pages,
		answers: matRead(),
		ticked: matBoardNow().answers.map(a => a.npcId),
		onTake: page => {
			const n = takeMatOffers([...page.offers].map(([npcId, o]) => ({ npcId, ...o })), 'book');
			// Whose list today's is, for the bar to say so rather than
			// ask for a screenshot of a list it already has.
			matBoardNow().from = { kind: 'book', id: String(page.id) };
			persist();
			toast(n === 1 ? T('{n} island ticked from {board}', { n, board: matPageName(page) }) : T('{n} islands ticked from {board}', { n, board: matPageName(page) }), true);
			then();
		}
	});
}

/**
 * Where the sailor is with today's material list: `kind` is 'start'
 * (nothing read, or too little to weigh), 'split' (several layouts
 * fit), 'known' (one does), 'none' (none does -- a row read wrong, or a
 * patch the app has not caught up with) or 'taken' (a layout ticked
 * whole from the book, nothing read).
 */
function matStage() {
	const mb = matBoardNow();
	const fit = matFitNow();
	const read = mb.answers.filter(a => !a.took).length;
	const fits = fit.standing.filter(w => w.agree >= MAT_MIN_FIT).length;
	const taken = mb.answers.filter(a => a.took).length;
	const kind = fit.sure ? 'known' : fits > 1 ? 'split' : fit.answered >= MAT_MIN_FIT ? 'none' : !read && taken ? 'taken' : 'start';
	return { kind, fit, read, fits, taken };
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

/** The picture of what to screenshot, and the words under it. */
function matShotHelp(open = false) {
	return `<details class="mat-help"${open ? ' open' : ''}>
		<summary>${T('What should the screenshot look like?')}</summary>
		${shotGuideHTML('material', { lazy: true })}
		<div class="mat-help-figs">
			<figure class="mat-help-fig narrow"><img src="guide/refresh-material.webp" alt="${T('The game’s refresh window, the ship material refreshes outlined')}" loading="lazy" width="487" height="629">
				<figcaption>${T('The material list is its own list, redrawn by the Ship Material Refresh — apart from the trade goods, so its board changes on its own clock.')}</figcaption></figure>
		</div>
		<ul class="mat-help-list">
			<li>${T('Any of the game’s languages: screenshots are read in the language chosen in the Menu, against the game’s own names in it — set it to your game’s language.')}</li>
			<li>${T('Nothing is uploaded: the pictures are read in this browser.')}</li>
		</ul>
	</details>`;
}

/**
 * The material bar: today's material list. Every layout it can be is
 * known from the game's files, so one page read off the window says
 * which it is, and that layout fills in the rest.
 */
export function matBarHTML() {
	matAutoFill();
	const mb = matBoardNow();
	const st = matStage();
	const { fit, kind } = st;
	const { pages } = matBookNow();
	const book = `<button class="ghost-btn sm" data-act="barter-mat-book" title="${T('Every layout of the material list, from the game’s own files, and what each pays')}">📖 ${T('The material book')} · ${pages.length === 1 ? T('{n} board', { n: F(pages.length) }) : T('{n} boards', { n: F(pages.length) })}</button>`;
	const drop = (big, lead, sub) => `<button class="board-drop${big ? '' : ' slim'}" data-act="barter-shot"><b class="by-key">${lead}</b><b class="by-touch">${lead}</b><span>${sub}</span></button>`;
	const nameOf = page => `<button class="linky" data-act="barter-mat-book" title="${T('Open it in the material book')}"><b>${matPageName(page)}</b></button>`;

	let body;
	if (kind === 'start') {
		body = `${drop(!st.read, st.read ? T('Paste another page') : T('Paste one screenshot of the material list'), st.read
			? (st.read === 1 ? T('{n} island read so far — a page more tells which layout it is.', { n: F(st.read) }) : T('{n} islands read so far — a page more tells which layout it is.', { n: F(st.read) }))
			: T('Open the Barter Information window in game — the same window as for trade goods — screenshot it whole and paste it here (Ctrl V). The rows of the material list are read, and the layout they belong to fills in the rest.'))}
			${matShotHelp(!st.read)}
			<p class="board-ask-sub">${T('Or tick, below, the islands showing what you are after.')}</p>`;
	} else if (kind === 'taken') {
		// A list taken whole needs no screenshot; one can still check it.
		const from = mb.from || {};
		const page = from.kind === 'book' ? pages.find(p => String(p.id) === from.id) : null;
		const line = page
			? T('Today’s list is {board}, from the material book: {n} islands filled in.', { board: nameOf(page), n: F(st.taken) })
			: T('{n} filled in', { n: F(st.taken) });
		body = `<p class="mat-say known">✓ ${line} ${T('They show dashed below. A page read off the window checks them and puts right any that differ.')}</p>
			<div class="mat-acts"><button class="ghost-btn sm" data-act="barter-shot">📷 ${T('Check it with a screenshot')}</button></div>`;
	} else if (kind === 'split') {
		const at = fit.splitter ? npcById.get(fit.splitter) : null;
		body = `<p class="mat-say">${T('What you read fits <b>{n} boards</b> in the book so far.', { n: F(st.fits) })} ${at ? T('One more page tells them apart — the one with <b>{isle}</b> on it.', { isle: esc(gameName(isleOf(at))) }) : T('One more page tells them apart.')}</p>
			${drop(false, T('Paste another page'), T('Any page not read yet; the one with that island settles it.'))}`;
	} else if (kind === 'known') {
		const w = fit.best;
		// The slots the game fills at random are not filled in: which of
		// their options shows today is only on the window.
		const have = new Set(mb.answers.map(a => a.npcId));
		const rolled = [...w.page.offers].filter(([npcId]) => !have.has(npcId)).length;
		body = `<p class="mat-say known">✓ ${w.differ.length
			? T('This is {board}. It agrees at {n} islands and parts at one: a slip, or a slot moved.', { board: nameOf(w.page), n: F(w.agree) })
			: T('This is {board}. It agrees at every one of the {n} islands you read.', { board: nameOf(w.page), n: F(w.agree) })}
			${st.taken ? (st.taken === 1 ? T('Its other island is filled in from the layout.') : T('Its other {n} islands are filled in from the layout.', { n: F(st.taken) })) : ''}</p>
			${rolled ? `<p class="board-ask-sub">${rolled === 1 ? T('{n} island the game fills at random is left out: paste the page it is on to count it.', { n: F(rolled) }) : T('{n} islands the game fills at random are left out: paste the pages they are on to count them.', { n: F(rolled) })}</p>` : ''}`;
	} else {
		body = `<p class="mat-say new">${T('What you read fits none of the game’s layouts: a row read wrong, or a patch the app has not caught up with. Check the rows against the window, or tick the islands below by hand.')}</p>
			${drop(false, T('Paste another page'), T('Any page not read yet.'))}`;
	}
	const taken = mb.answers.length - st.read;
	return `<section class="panel board-ask mat-bar">
		<div class="panel-head"><h2 class="panel-title">${T('Today’s material list')}</h2><span class="panel-sub board-ask-lead">${st.read ? (st.read === 1 ? T('{n} island read', { n: F(st.read) }) : T('{n} islands read', { n: F(st.read) })) : ''}${taken ? ` · ${T('{n} filled in', { n: F(taken) })}` : ''}</span><span class="panel-spacer"></span>${book}${mb.answers.length ? `<button class="ghost-btn sm" data-act="barter-mat-clear" title="${T('The list was refreshed in game: start again')}">↻ ${T('Refreshed in game')}</button>` : ''}</div>
		<div class="panel-body">
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

/** Whether the run can hand over a give today: it is held somewhere,
 *  or it is a shore good the run buys ashore. */
function canGive(give) {
	return (store.getStock(give) || 0) > 0 || (levelOf(give) === null && !!landGoods[give]);
}

/** What is held of a give, said in a few words for its row. */
function heldSaid(give) {
	const h = heldOf(give);
	const all = h.run + h.elsewhere;
	if (all > 0) return h.run > 0 ? T('{n} held', { n: F(all) }) : T('{n} held elsewhere', { n: F(all) });
	return levelOf(give) === null && landGoods[give] ? T('bought ashore') : T('none held');
}

/**
 * Today's material list, for the materials the run is for: each with
 * its want, and the islands of today's layout that deal it -- the ones
 * whose give the sailor can hand over, then the ones they cannot, then
 * the ones the barter count has not opened. Nothing to tick: the
 * layout says what shows, and the run is laid for what can be done.
 */
function matNeedHTML(mats) {
	const mb = matBoardNow();
	if (!mb.answers.length) return `<div class="mat-pick-hint">${T('Read today’s material list above: the islands dealing what your builds need show here, and the run is laid for them.')}</div>`;
	const barters = barterProfile().barterCount;
	const dealt = new Set(mb.answers.map(a => a.recv));
	const more = materials().filter(m => dealt.has(m.name) && !mats.some(x => x.it === m.name)).length;
	const add = more ? `<button class="mat-tile add" data-act="barter-mat-add" title="${T('Another material today’s layout deals: one run sails for all of them')}">+ ${T('another material')}</button>` : '';
	if (!mats.length) return `<div class="mat-pick-hint">${T('Today’s layout deals nothing your builds are short of.')}</div><div class="mat-strip">${add}</div>`;
	const row = r => {
		const npc = npcById.get(r.a.npcId), d = r.deal;
		const got = d ? (d.recvMin === d.recvMax ? F(d.recvMin) : `${F(d.recvMin)}–${F(d.recvMax)}`) : '';
		const giveN = d && d.qty && d.qty !== '1' ? `${esc(d.qty)}× ` : '';
		const state = !r.open ? `<span class="mat-row-state shut">🔒 ${T('opens at {barters} Total Barters', { barters: F(npcGate(r.a.npcId)) })}</span>`
			: `<span class="mat-row-state${r.can ? ' ok' : ' none'}">${esc(heldSaid(r.a.give))}</span>`;
		return `<div class="mat-row${r.can && r.open ? '' : ' off'}${r.a.took ? ' took' : ''}">
			<span class="mat-row-isle"><b>${esc(gameName(isleShort(npc)))}</b><small>${esc(gameName(whoOf(npc)))}</small></span>
			<span class="mat-row-swap">${img(r.a.give, 'row-icon sm')}<span>${giveN}${esc(gameName(r.a.give))}</span><span class="run-arrow">→</span><b>${got}×</b></span>
			<span class="mat-row-day">${d && d.perDay ? T('×{n} a day', { n: F(d.perDay) }) : ''}</span>
			${state}
		</div>`;
	};
	const doable = m => mb.answers.filter(a => a.recv === m.it && npcOpen(a.npcId, barters) && canGive(a.give)).length;
	const groups = [...mats].sort((x, y) => Number(doable(y) > 0) - Number(doable(x) > 0)).map(m => {
		const rows = mb.answers.filter(a => a.recv === m.it).map(a => ({ a, deal: materialDeal(a.npcId, a.give, a.recv), open: npcOpen(a.npcId, barters), can: canGive(a.give) }))
			.sort((x, y) => isleShort(npcById.get(x.a.npcId)).localeCompare(isleShort(npcById.get(y.a.npcId))));
		const can = rows.filter(r => r.open && r.can), cant = rows.filter(r => r.open && !r.can), shut = rows.filter(r => !r.open);
		return `<section class="mat-need">
			<div class="mat-need-head">
				${img(m.it, 'row-icon md')}
				<div class="mat-need-text"><b>${esc(gameName(m.it))}</b><small>${can.length === 1 ? T('{n} island today you can trade with', { n: can.length }) : T('{n} islands today you can trade with', { n: can.length })}${m.short ? ` · ${m.it === CROW_COIN ? T('{n} to buy everything your builds are short of at the coin shop', { n: F(m.short) }) : T('your builds are short {n}', { n: F(Math.ceil(m.short)) })}` : ''}${m.it === 'Crow Coin' && coinWorth() ? ` · ${T('worth ≈ {silver} at the coin shop’s best rate', { silver: FC(Math.round(coinWorth().each * m.qty)) })}` : ''}</small></div>
				<label class="mat-want"><span class="run-pick-k">${T('wanted')}</span>${amountInput('purse-inline', m.qty, `data-act="barter-mat-want" data-item="${esc(m.it)}" aria-label="${T('How many')}"`)}</label>
				<button class="mat-tile-x" data-act="barter-mat-drop" data-item="${esc(m.it)}" title="${T('The run no longer sails for {name}', { name: esc(gameName(m.it)) })}" aria-label="${T('Take {name} off the run', { name: esc(gameName(m.it)) })}">×</button>
			</div>
			${can.length ? `<div class="mat-rows">${can.map(row).join('')}</div>` : `<p class="mat-none">${T('No island today deals it for a give you hold.')}</p>`}
			${cant.length ? `<p class="mat-rows-k">${T('Can’t do today — the give isn’t held')}</p><div class="mat-rows">${cant.map(row).join('')}</div>` : ''}
			${shut.length ? `<p class="mat-rows-k">${T('Not open to you yet')}</p><div class="mat-rows">${shut.map(row).join('')}</div>` : ''}
		</section>`;
	}).join('');
	return `${groups}<div class="mat-strip">${add}</div>`;
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
	const from = fromPort();
	const mats = matsToday();
	const it = mats.length ? mats[0].it : '';
	if (!materials().length) {
		return { secs: [['ladder', T('The materials wanted'), T('for a material'), `<p class="empty">${T('The barter table deals no material the app knows.')}</p>`]], load: '', dock: '', things: { all: 0, done: 0 }, stops: 0, time: '' };
	}
	matAutoFill();
	const showing = matBoardNow().answers;
	const listPanel = `<section class="barter-chains mat-list hero">${matNeedHTML(mats)}</section>`;
	// Only the islands showing a material the run is for, open to the
	// sailor's barter count, and dealing for a give they can hand over:
	// the rest are listed, not sailed for.
	const forRun = new Set(mats.map(m => m.it));
	const barters = barterProfile().barterCount;
	const picks = showing.filter(a => forRun.has(a.recv) && npcOpen(a.npcId, barters) && canGive(a.give)).map(pickOf).filter(Boolean);
	// The Parley the day has, the bar and the vouchers the orders let the
	// run draw on, and what each island costs of it at the sailor's rate.
	const pr = parleyOf(barterProfile());
	const parley = { budget: pr.bar, costOf: x => Math.floor((x.parleyBase || PARLEY.perMaterialTrade) * pr.rate) };
	const layFor = pace => materialRun({
		picks, wants: new Map(mats.map(m => [m.it, m.qty])), reach: V.matOrders.reach, pace, calls: V.matOrders.calls, assume: false, parley,
		stock: aboardStock(), dock: dockStock(), stores: storesElsewhere(), bags: bagsNow(),
		prices: landPrices([...new Set(picks.map(x => x.give).filter(g => levelOf(g) === null))], store.getProfile('homemade', []) || []),
		hold: me.hold, start: from, startWharf: from ? stashes.find(w => w.at === from.name) || null : null, npcById
	});
	const plan = layFor(V.matOrders.pace);
	// The other way of sailing, laid too, so each card says what it comes to.
	const other = picks.length ? layFor(V.matOrders.pace === 'fast' ? 'full' : 'fast') : null;
	for (const s of plan.stops) s.hold = me.hold;
	// Each island at its own price: the material list's exchanges cost far
	// more Parley than a trade good's, and a run recorded at the trade
	// price left the bar reading a third of what was really spent.
	const rate = pr.rate;
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
	const gotText = m => { const g = plan.got.get(m.it); return g.min === g.max ? F(g.min) : `${F(g.min)}–${F(g.max)}`; };
	// How to sail it, as the trade goods' run says it: the two ways the
	// hold is treated as cards, each with what it comes to, and the other
	// orders as chips under them.
	const cardFig = run => {
		if (!run || !run.stops.length) return picks.length ? `<span class="preset-fig"><span>${T('nothing sails this way today')}</span></span>` : '';
		const some = mats.filter(m => run.got.get(m.it).max > 0);
		const got = some.slice(0, 6).map(m => { const g = run.got.get(m.it); return `<span class="mat-card-got">${img(m.it, 'row-icon xs')}${g.min === g.max ? F(g.min) : `${F(g.min)}–${F(g.max)}`}/${F(m.qty)}</span>`; }).join('') + (some.length > 6 ? `<span class="mat-card-got">+${some.length - 6}</span>` : '');
		return `<span class="preset-fig"><b>${got}</b><span>${run.islands === 1 ? T('{n} island', { n: run.islands }) : T('{n} islands', { n: run.islands })} · ${run.trades === 1 ? T('{n} trade', { n: run.trades }) : T('{n} trades', { n: run.trades })}${run.returns ? ` · ${T('{n} departures', { n: run.returns + 1 })}` : ''}</span></span>`;
	};
	const runOf = pace => (pace === V.matOrders.pace ? plan : other);
	const cards = `<div class="preset-cards mat-cards">${[
		['fast', T('Light and fast'), T('Every departure under the limit the ship still sails at full speed at: more trips, never slower.')],
		['full', T('Loaded'), T('Every departure loaded up to the barter ceiling: fewer trips, slower past the limit.')]
	].map(([id, name, line]) => `<button class="preset-card${V.matOrders.pace === id ? ' on' : ''}" data-act="barter-mat-pace-set" data-id="${id}" aria-pressed="${V.matOrders.pace === id}"><span class="preset-name"><i></i>${name}</span><span class="preset-line">${line}</span>${cardFig(runOf(id))}</button>`).join('')}</div>`;
	const ordersRow = `${cards}<div class="order-rows">
		${orderRow('barter-mat-reach', T('sail for'), V.matOrders.reach, [['want', T('the wants, then home'), T('Home once every want is met')], ['all', T('every island I can trade with'), T('Every island dealing a material on the run, as many times as its gives allow')]])}
		${orderRow('barter-vouchers', T('trade vouchers'), ordersNow().vouchers, VOUCHER_CHOICES, T('Whether the run draws on the Crow’s Trade Vouchers you carry; each is a quarter of a bar, on its own two-hour cooldown'))}
		${orderRow('barter-mat-quests', T('quests on the way'), V.matOrders.quests, QUEST_CHOICES, T('The dailies and weeklies already taken, handed in where the run passes their taker or at a stop put in a short way off the route; the hunts only when their grounds lie on the way'))}
		${orderRow('barter-mat-calls', T('a give kept at another harbour'), V.matOrders.calls ? 'true' : 'false', [['true', T('call there for it')], ['false', T('bring it first')]], T('Put in at another harbour on the way for a give kept in its storage, or bring it to the harbour the run sails from before casting off'))}
		${orderRow('barter-port', T('from'), V.port, [[0, T('the first stop')], ...ports.map(p => [p.id, gameName(p.name)])])}
	</div>`;
	// What the run comes to: each material against its want, as a bar;
	// then the run in figures, each with its sign.
	const nothing = plan.ticked ? mats.filter(m => plan.got.get(m.it).max <= 0) : [];
	const yieldRows = mats.filter(m => !nothing.includes(m)).map(m => {
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
		${fig('◈', T('{n} Parley', { n: F(book.spent) }), [T('{n} left', { n: F(book.end) }), book.vouchersUsed ? (book.vouchersUsed === 1 ? T('{n} voucher drawn', { n: book.vouchersUsed }) : T('{n} vouchers drawn', { n: book.vouchersUsed })) : '', book.waited ? T('waits {n} min for a cooldown', { n: F(book.waited) }) : '', plan.dry ? (plan.dry === 1 ? T('{n} trade more wanted than the Parley pays for', { n: plan.dry }) : T('{n} trades more wanted than the Parley pays for', { n: plan.dry })) : ''].filter(Boolean).join(' · '), plan.dry || book.short ? 'amber' : '')}
	</div>` : '';
	const nothingLine = nothing.length ? `<p class="mat-none mat-nothing">${T('Nothing comes today of {materials}.', { materials: nothing.map(m => `<b>${esc(gameName(m.it))}</b>`).join(', ') })}</p>` : '';
	const summary = plan.ticked ? `<div class="mat-summary">${yieldRows ? `<div class="mat-yield">${yieldRows}</div>` : ''}${nothingLine}${figs}</div>` : '';
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
	const ashore = plan.noRoom.length ? `<section class="panel run-list amber mat-goods"><div class="panel-head"><h2 class="panel-title">${T('Stays ashore')}</h2><span class="panel-sub">${V.matOrders.pace === 'fast' ? T('held, but more than the hold carries under the limit, even alone') : T('held, but more than the hold barters under, even alone')}</span>${V.matOrders.pace === 'fast' ? `<span class="panel-spacer"></span><button class="chip tiny primary" data-act="barter-mat-pace-set" data-id="full" title="${T('Load up to the barter ceiling')}">${T('sail loaded')} →</button>` : ''}</div>
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
		...mats.filter(m => !nothing.includes(m)).slice(0, 4).map(m => { const g = plan.got.get(m.it); return `${img(m.it, 'row-icon xs')}${T('{got} of {want}', { got: `<b class="${g.min >= m.qty ? 'teal' : ''}">${gotText(m)}</b>`, want: F(m.qty) })}`; }),
		plan.stops.length ? `${plan.islands === 1 ? T('<b>{n}</b> island', { n: plan.islands }) : T('<b>{n}</b> islands', { n: plan.islands })}${plan.calls ? `, ${plan.calls === 1 ? T('{n} call', { n: plan.calls }) : T('{n} calls', { n: plan.calls })}` : ''}` : '',
		legs.total ? `≈ <b>${esc(runTime(legs, book))}</b>` : '',
		qp.count ? `📜 ${qp.count === 1 ? T('<b>{n}</b> quest', { n: qp.count }) : T('<b>{n}</b> quests', { n: qp.count })}` : '',
		holdCls === 'warn' ? `<b class="warn">${T('too heavy')}</b>` : holdCls === 'amber' ? `<b class="amber">${T('over the limit')}</b>` : ''
	]) : '';
	if (plan.stops.length) keepRoute(plan, legs, book, segs, it || (mats[0] && mats[0].it) || '');
	const routeFold = plan.stops.length ? `<details class="panel route-fold"${sailing() || narrow() ? '' : ' open'}><summary><b>${T('The route, stop by stop')}</b><span class="panel-sub">${mats.length ? T('for {materials}', { materials: esc(mats.map(m => gameName(m.it)).join(', ')) }) : T('for a material')}${legs.total ? ` · ≈ ${esc(runTime(legs, book))}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}</span>${questsLine(qp, V.matOrders.quests)}<span class="panel-spacer"></span>${chartButton(plan.stops, it || (mats[0] && mats[0].it) || '')}</summary>${segs}</details>` : '';
	const few = (list, say) => (list.length > 3 ? `${list.slice(0, 3).map(say).join(', ')} ${T('and {n} more', { n: list.length - 3 })}` : list.map(say).join(', '));
	const matsSaid = mats.length ? few(mats, m => `${F(m.qty)}× ${gameName(m.it)}`) : T('nothing on the run yet');
	const gotSome = mats.filter(m => !nothing.includes(m));
	const comes = plan.ticked && gotSome.length ? few(gotSome, m => `${gotText(m)} ${T('of {want}', { want: F(m.qty) })} ${gameName(m.it)}`) : plan.ticked ? T('nothing comes of it today') : T('nothing ticked yet');
	return {
		secs: [
			['parley', T('Before you sail'), esc(parleyLine(barterProfile())), parleyHTML(barterProfile())],
			['ladder', T('The materials wanted'), esc(matsSaid), `${listPanel}<div class="plan-next"><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="how">${T('OK, that’s the goal')} ›</button></div>`],
			['how', T('How to sail it'), esc([V.matOrders.pace === 'fast' ? T('light and fast') : T('loaded'), V.matOrders.reach === 'all' ? T('every island I can trade with') : T('the wants, then home'), from ? T('from {port}', { port: gameName(from.name) }) : ''].filter(Boolean).join(' · ')), `${ordersRow}<div class="plan-next"><span class="panel-spacer"></span><button class="act" data-act="barter-sec" data-id="chains">${T('OK, see what comes of it')} ›</button></div>`],
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
	const dealt = new Set(matBoardNow().answers.map(a => a.recv));
	const onRun = new Set(matsToday().map(m => m.it));
	openPicker({
		title: T('A run for which material?'),
		hint: T('Every material today’s layout deals. What your builds are short of comes first.'),
		items: materials().filter(m => dealt.has(m.name) && !onRun.has(m.name)).map(m => ({
			id: m.name, label: gameName(m.name), icon: img(m.name, ''),
			group: m.short ? T('Your builds are short of') : T('Everything today’s layout deals'),
			meta: m.short ? T('{n} short', { n: F(Math.ceil(m.short)) }) : ''
		})),
		onPick: name => { matOn(name, true); then(); }
	});
}

/** A material onto the run or off it. */
export function matOn(name, yes) {
	if (!name) return;
	const mb = matBoardNow();
	mb.on = (mb.on || []).filter(m => m !== name);
	mb.off = (mb.off || []).filter(m => m !== name);
	(yes ? mb.on : mb.off).push(name);
	persist();
}

/** The want of a material: what was typed for it, else what the
 *  builds are short of, else one. */
function wantOf(name, short = (materials().find(m => m.name === name) || {}).short || 0) {
	if (V.wants[name] > 0) return V.wants[name];
	return short ? Math.ceil(short) : 1;
}

/**
 * The Crow Coins the builds are short of: what the coin shop asks for
 * everything they still need that it sells -- the sum the pouch shows --
 * less the coins in the purse. A coin day on the material list is sailed
 * for that.
 */
function coinsShort() {
	return Math.max(0, Math.ceil(totalsToGo().coins - (store.getStock(CROW_COIN) || 0)));
}
/** What the builds are short of a material; for Crow Coins, the shop's sum. */
const shortOf = m => (m.name === CROW_COIN ? coinsShort() : m.short);

/**
 * The materials on today's run: every one today's layout deals that the
 * builds are short of, unless taken off, and any other it deals that was
 * added -- each with its want. Nothing is chosen before the list is read.
 */
function matsToday() {
	const mb = matBoardNow();
	const dealt = new Set(mb.answers.map(a => a.recv));
	const off = new Set(mb.off || []), on = new Set(mb.on || []);
	return materials().map(m => ({ ...m, short: shortOf(m) })).filter(m => dealt.has(m.name) && (m.short > 0 ? !off.has(m.name) : on.has(m.name)))
		.map(m => ({ it: m.name, qty: wantOf(m.name, m.short), short: m.short }));
}

/** An island of today's list as the run takes it: the game's own
 *  figures for the exchange -- its daily count, what it pays, its give
 *  and its base Parley. */
function pickOf(a) {
	const g = materialDeal(a.npcId, a.give, a.recv);
	const npc = npcById.get(a.npcId);
	if (!g || !npc) return null;
	const giveN = Number(String(g.qty).split('-')[0]) || 1;
	return {
		npcId: a.npcId, npc: npc.name, item: a.recv, give: a.give, giveN, giveText: String(g.qty),
		recv: (g.recvMin + g.recvMax) / 2, recvMin: g.recvMin, recvMax: g.recvMax,
		recvText: g.recvMin === g.recvMax ? String(g.recvMin) : `${g.recvMin}-${g.recvMax}`,
		tries: g.perDay, parleyBase: g.parley
	};
}

/** Once the layout is known, the rest of it is today's list: filled in
 *  without asking, as the trade goods' board is. */
function matAutoFill() {
	const fit = matFitNow();
	if (fit.sure && fit.fill.length) {
		takeMatOffers(fit.fill, 'book');
		matBoardNow().from = { kind: 'book', id: String(fit.best.page.id) };
		persist();
	}
}
