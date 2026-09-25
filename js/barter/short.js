// The Crow Coin purse, and the short trip: one trade picked and what fits
// round it.

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img } from '../ui-bits.js';
import { barterData, barterProfile, totalsToGo } from '../ui-state.js';
import { boardData, gatedOffers } from '../barter-board.js';
import { npcById, isleOf } from '../barter_npcs.js';
import { COIN, COIN_LEVEL, levelOf, countBonus, withBonus } from '../barter.js';
import { chains } from '../barter-chains.js';
import { margins } from '../barter-short.js';
import { seaDist } from '../barter-route.js';
import { V } from './state.js';
import { shutNow, fromPort } from './board.js';
import { aboardStock, dockStock } from './hold.js';
import { heldOf } from './material.js';
import { stockGains } from './plan.js';
import { TIER } from './route.js';

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
export function coinsOf(plan) {
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
export const coinRange = (a, b, sign = '') => (b > a ? T('{a} to {b}', { a: `${sign}${F(a)}`, b: `${sign}${F(b)}` }) : `${sign}${F(a)}`);

/** Where the bonus came from, for the line under a coin figure. */
export function bonusNote(c) {
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
export function coinPurseHTML(plan) {
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

/**
 * The run for silver, in two panels: the board's chains to tick, and
 * the run along the ticked ones -- its figures, each chain's stops as
 * a timeline, what was bought, left on the way and carried home.
 */
/* ------------------------------------------------------------------ *
 * a short trip: one trade chosen, and what fits round it
 * ------------------------------------------------------------------ */

/** The switch at the head of the plan, with a word on what it means. */
export function shapeBarHTML() {
	if (V.goal === 'material' || V.reach) return '';
	return `<div class="plan-shape"><span class="run-pick-k">${T('the run')}</span>${shapeChips()}<span class="panel-sub">${V.shape === 'short'
		? T('One trade you pick, and what fits round it under the hold’s limit.')
		: T('The board’s chains, searched for the best set and climbed.')}</span></div>`;
}

/** Full run or short trip: how much of the board the run takes. */
function shapeChips() {
	if (V.goal === 'material') return '';
	const chip = (id, label, title) => `<button class="seg${V.shape === id ? ' on' : ''}" aria-pressed="${V.shape === id ? 'true' : 'false'}" data-act="barter-shape" data-id="${id}" title="${esc(title)}">${label}</button>`;
	return `<span class="segs" role="group" aria-label="${T('How much of the board')}">${chip('full', T('Full run'), T('The board’s chains, searched for the best set and climbed'))}${chip('short', T('Short trip'), T('One trade you are going for, and what fits round it'))}</span>`;
}

/** Why a trade would add nothing, in words. */
const shortWhy = why => ({
	parley: T('the Parley runs out'),
	hold: T('over the hold’s limit'),
	market: T('the Market lists too few'),
	share: T('another trade takes the goods'),
	floor: T('your floor keeps them'),
	nothing: T('nothing to hand over')
}[why] || T('nothing to hand over'));

/** The section's line when shut. */
export function shortSummary(picked, worthSaid, plan) {
	if (!picked.length) return T('pick the trade you are going for');
	return [picked.length === 1 ? T('{n} trade', { n: picked.length }) : T('{n} trades', { n: picked.length }), worthSaid, plan.stops.length === 1 ? T('{n} stop', { n: plan.stops.length }) : T('{n} stops', { n: plan.stops.length })].filter(Boolean).join(' · ');
}

/** One trade's own line: the island, what it takes and what it gives. */
function tradeLineHTML(r) {
	const isle = gameName(isleOf(npcById.get(r.npcId)) || r.npc);
	return `<span class="st-isle">${esc(isle)}</span><span class="st-deal"><b>${esc(String(r.giveText || r.giveN))}×</b>${img(r.give, 'row-icon sm')}<span>${esc(gameName(r.give))}</span><i aria-hidden="true">→</i>${img(r.item, 'row-icon sm')}<span style="--tier:${TIER(levelOf(r.item) || COIN_LEVEL)}" class="st-made">${esc(gameName(r.item))}</span></span>`;
}

/** What the sailor holds of a trade's goods, said where it matters: the
 *  give on a first trade, and the good it makes against a stock target. */
function tradeHeldHTML(c, stocking) {
	const r = c.rungs[c.rungs.length - 1];
	const bits = [];
	if (!c.grows && c.rungs.length === 1) {
		if (c.from === 'land') bits.push(T('bought ashore'));
		else {
			const h = heldOf(c.item);
			if (h.aboard) bits.push(T('{n} aboard', { n: F(h.aboard) }));
			if (h.dock) bits.push(T('{n} in storage', { n: F(h.dock) }));
		}
	} else bits.push(T('with what the trade before makes'));
	const lv = levelOf(r.item);
	const have = store.getStock(r.item) || 0;
	const want = stocking && lv ? V.stockGoal.targets[lv] || 0 : 0;
	if (want && have < want) bits.push(`<b class="amber">${T('low: {n} of {of}', { n: F(have), of: F(want) })}</b>`);
	else if (lv && have) bits.push(T('{n} held', { n: F(have) }));
	return bits.join(' · ');
}

/**
 * The short trip's section: the trades picked, each one island further
 * or off again, and every other trade on the board with what it would
 * add to them and the minutes it would cost. Before anything is picked
 * the same list is where the trip starts: what each trade is worth on
 * its own, there and back.
 */
export function shortHTML({ set, picked, opts, aim, ship, from, stock, plan, pkey, stocking, coining, runFigures, heldNote, shutNote }) {
	const cands = [...set.first, ...set.next];
	const mkey = `${pkey}|${picked.map(c => c.id).join(',')}`;
	if (V.shortMemo.key !== mkey) V.shortMemo = { key: mkey, res: margins({ picked, cands, opts, aim, ship, start: from }) };
	const { base, rows } = V.shortMemo.res;
	// What a row says it adds, in the day's own measure.
	const gainOf = run => (stocking ? stockGains(run, stock).total : coining ? coinsOf(run).min : 0);
	const g0 = base ? gainOf(base) : 0;
	const addSaid = r => {
		if (stocking) { const g = gainOf(r.run) - g0; return g > 0 ? `<b class="teal">+${F(g)}</b> ${T('to the stock')}` : T('adds nothing to the stock'); }
		if (coining) { const g = gainOf(r.run) - g0; return g > 0 ? `<b class="gold">+${F(g)}</b> ${T('coins')}` : ''; }
		return r.worth > 0 ? `<b class="gold">+${FC(Math.round(r.worth))}</b>` : '';
	};
	const row = r => {
		const c = r.c, rr = c.rungs[c.rungs.length - 1];
		const mins = Math.max(0, Math.round(r.minutes));
		const figs = r.why
			? `<span class="st-why">${esc(shortWhy(r.why))}</span>`
			: [addSaid(r), c.grows ? (r.own === 1 ? T('{n} trade there', { n: F(r.own) }) : T('{n} trades there', { n: F(r.own) })) : r.own === 1 ? T('{n} trade', { n: F(r.own) }) : T('{n} trades', { n: F(r.own) }),
				!c.grows && r.trades < r.own ? `<b class="amber" title="${T('The hold takes this trade’s goods, and the picked trades deal less for it')}">${T('{n} fewer elsewhere', { n: F(r.own - r.trades) })}</b>` : '', picked.length ? T('+{n} min', { n: F(mins) }) : T('≈ {n} min there and back', { n: F(mins) })].filter(Boolean).join(' · ');
		return `<button class="st-row${r.why ? ' off' : ''}${c.grows ? ' grows' : ''}" data-act="barter-short-add" data-id="${esc(c.id)}"${c.grows ? ` data-grows="${esc(c.grows)}"` : ''}${r.why ? ' disabled' : ''} title="${r.why ? esc(shortWhy(r.why)) : c.grows ? T('Take the goods one island further') : T('Add this trade to the trip')}">
			<span class="st-plus" aria-hidden="true">${c.grows ? '↗' : '+'}</span>
			<span class="st-body">${c.grows ? `<span class="st-then">${T('then')}</span>` : ''}${tradeLineHTML(rr)}<span class="st-sub">${tradeHeldHTML(c, stocking)}</span></span>
			<span class="st-figs">${figs}</span>
		</button>`;
	};
	// The picked trades' next islands first, in a group of their own:
	// they are the trip going further, not another trip beside it.
	const further = rows.filter(r => !r.why && r.c.grows);
	const live = rows.filter(r => !r.why && !r.c.grows), dead = rows.filter(r => r.why);
	const SHOW = 8;
	const furtherHTML = further.length ? `<div class="plan-sub-head"><b>${T('Take it one island further')}</b><span>${T('what the picked trades make, handed on at the next island')}</span></div><div class="st-list">${further.map(row).join('')}</div>` : '';
	const list = live.length
		? `<div class="st-list">${live.slice(0, SHOW).map(row).join('')}</div>${live.length > SHOW ? `<details class="st-more"><summary>${T('{n} more trades', { n: live.length - SHOW })}</summary><div class="st-list">${live.slice(SHOW).map(row).join('')}</div></details>` : ''}`
		: `<p class="empty">${picked.length ? T('Nothing else on the board fits round this trip.') : T('No trade on this board can be sailed from what you hold.')}</p>`;
	const deadList = dead.length ? `<details class="st-more"><summary>${dead.length === 1 ? T('{n} trade that cannot be made', { n: dead.length }) : T('{n} trades that cannot be made', { n: dead.length })}</summary><div class="st-list">${dead.map(row).join('')}</div></details>` : '';
	// The trip so far: each trade, the goods it makes, a step back.
	const pickedHTML = picked.length ? `<div class="st-picked">${picked.map(c => {
		const k = plan.order.findIndex(x => x.id === c.id);
		const mine = plan.stops.filter(s => s.chain === k && s.npcId);
		const cut = k >= 0 ? plan.cut.find(x => x.chain === k) : null;
		const last = mine[mine.length - 1];
		const got = last ? `${last.times === 1 ? T('{n} trade', { n: F(last.times) }) : T('{n} trades', { n: F(last.times) })} · ${T('at least {n}× {item}', { n: F(last.times * (last.recvMin || 1)), item: esc(gameName(last.item)) })}` : '';
		return `<div class="st-pick">
			<div class="st-pick-rungs">${c.rungs.map((r, i) => `<div class="st-pick-rung">${i ? `<span class="st-then">${T('then')}</span>` : ''}${tradeLineHTML(r)}</div>`).join('')}</div>
			<div class="st-pick-foot"><span class="st-sub">${cut && !mine.length ? `<b class="amber">${esc(shortWhy(cut.why))}</b>` : got}</span><span class="panel-spacer"></span>
			${c.depth > 0 ? `<button class="chip tiny" data-act="barter-short-back" data-id="${esc(c.id)}" title="${T('Stop one island sooner')}">‹ ${T('one island less')}</button>` : ''}
			<button class="map-x" data-act="barter-short-drop" data-id="${esc(c.id)}" aria-label="${T('Take this trade off the trip')}">×</button></div>
		</div>`;
	}).join('')}</div>` : '';
	const head = picked.length
		? `<div class="plan-sub-head"><b>${T('Fits on the way')}</b><span>${T('what each adds to this trip, and the minutes it costs · the hold stays under its limit')}</span></div>`
		: `<p class="chains-help">${T('<b>Pick the trade you are going for.</b> Every trade on today’s board on its own, best first for what it adds a minute, there and back from your harbour. The trades that fit round it are offered next, and a picked trade can take its goods one island further.')}</p>`;
	const clear = picked.length ? `<div class="chain-acts"><span class="panel-sub">${picked.length === 1 ? T('{n} trade picked', { n: picked.length }) : T('{n} trades picked', { n: picked.length })}</span><span class="panel-spacer"></span><button class="linky" data-act="barter-chains-clear">${T('clear')}</button></div>` : '';
	return `<div class="barter-chains short-trip">${heldNote}${shutNote}${clear}${pickedHTML}${picked.length ? runFigures : ''}${furtherHTML}${head}${list}${deadList}</div>`;
}

/**
 * Before the board is read, the short trip's list is what could be on
 * it: the trades the layouts still standing make of the goods the
 * sailor holds, each with how many of those layouts carry it. Faint,
 * and said to be a maybe, since sailing to an island for a trade it
 * does not have today is the one thing this must never send anyone to.
 */
export function canAppearHTML(b, prof, o) {
	const stock = aboardStock(), dock = dockStock();
	const key = JSON.stringify([b.standing.map(c => c.id), stock, dock, prof.barterCount, o.buy, V.board.answers.length, V.port]);
	if (V.appearMemo.key !== key) {
		const seen = new Map();
		for (const combo of b.standing) {
			const data = boardData(combo, barterData, npcById, V.board.answers, [...gatedOffers(combo, prof.barterCount), ...shutNow(prof)]);
			const here = new Set();
			for (const c of chains(data, stock, dock, prof.barterCount)) {
				if (c.gate || c.from === 'land') continue;
				const r = c.rungs[0];
				const k = `${r.npcId}|${r.give}|${r.item}`;
				if (here.has(k)) continue;
				here.add(k);
				if (!seen.has(k)) seen.set(k, { r, item: c.item, n: 0 });
				seen.get(k).n++;
			}
		}
		const from = fromPort();
		const far = x => (from ? seaDist(from, npcById.get(x.r.npcId)) : 0);
		V.appearMemo = { key, rows: [...seen.values()].sort((x, y) => y.n - x.n || far(x) - far(y) || isleOf(npcById.get(x.r.npcId)).localeCompare(isleOf(npcById.get(y.r.npcId)))) };
	}
	const of = b.standing.length;
	const rows = V.appearMemo.rows;
	const list = rows.length
		? `<div class="st-list maybe">${rows.slice(0, 24).map(x => `<div class="st-row off maybe"><span class="st-plus" aria-hidden="true">?</span><span class="st-body">${tradeLineHTML(x.r)}<span class="st-sub">${(() => { const h = heldOf(x.item); return [h.aboard ? T('{n} aboard', { n: F(h.aboard) }) : '', h.dock ? T('{n} in storage', { n: F(h.dock) }) : ''].filter(Boolean).join(' · '); })()}</span></span><span class="st-figs">${T('on {n} of {of} layouts', { n: x.n, of })}</span></div>`).join('')}</div>`
		: `<p class="empty">${T('None of the layouts still standing trades what you hold: the trips start ashore, once the board is read.')}</p>`;
	return `<div class="barter-chains short-trip">
		<div class="chains-wait"><p>${T('Which trades are on today’s board follows from one island: look at one in the game and tap what it shows. Until then, these are the trades the {n} layouts still standing could make of what you hold — maybes, not today’s board.', { n: of })}</p><button class="chip primary" data-act="barter-board-island">${T('Tell it what an island shows')} ›</button></div>
		<div class="plan-sub-head"><b>${T('Where what you hold can be traded')}</b><span>${T('the layouts that carry each trade')}</span></div>
		${list}
	</div>`;
}
