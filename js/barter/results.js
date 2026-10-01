// Results: what the run came to, the exchange in icons, and past runs.

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img } from '../ui-bits.js';
import { barterProfile, SILVER } from '../ui-state.js';
import { ports } from '../barter_npcs.js';
import { COIN, levelOf, rankOf } from '../barter.js';
import { V } from './state.js';
import { timerState, spanText } from '../sail-timer.js';
import { fromPort } from './board.js';
import { lvTag, parleySpentOf, stopAt, stopNames, parleyNotes } from './cockpit.js';
import { parleyGuessed, parleyOf } from './plan.js';
import { legsOf, n1, TIER, ledgerOf } from './route.js';
import { sailing, ticked, owesCount, unsaid, tripOf, sailedPlan } from './sail.js';
import { todayHTML, weekHTML } from './today.js';
import { VOUCHER } from './view.js';

/**
 * What the run did: the figures so far, the stops one under another,
 * and the receipt -- what recording will take and what it will give --
 * before the press that writes it all down. It stands for a run half
 * sailed as well as for a whole one, since only ticked stops count.
 */
/**
 * The exchange as tiles: what went out of the sailor's hands and what
 * came into them, each good with its icon and count, the silver and
 * the coins as tiles of their own. Drawn for the run being sailed,
 * for the run just recorded, and for every run in the history, so
 * the three read the same. `gave` and `got` are item -> count.
 */
function exchangeHTML(gave, got, { spent = 0, silver = 0, coins = 0, parley = 0, vouchers = 0, guessedCoins = false } = {}) {
	const tile = (item, n) => {
		const lv = levelOf(item);
		return `<span class="shelf-tile"><i class="shelf-lv${lv ? '' : ' shore'}"${lv ? ` style="--tier:${TIER(lv)}"` : ''}>${lv ? lvTag(lv) : '⌂'}</i>${img(item, 'shelf-icon')}<b>${n1(n)}</b><span>${esc(gameName(item))}</span></span>`;
	};
	const list = m => Object.entries(m || {}).filter(([, n]) => n > 0).sort((a, b) => rankOf(b[0]) - rankOf(a[0]) || b[1] - a[1]).map(([item, n]) => tile(item, n)).join('');
	const out = `${spent ? `<span class="shelf-tile silver out">${img(SILVER, 'shelf-icon')}<b>−${FC(Math.round(spent))}</b><span>${T('for the land goods')}</span></span>` : ''}${parley ? `<span class="shelf-tile parley"><i class="shelf-glyph">◈</i><b>−${F(Math.round(parley))}</b><span>${T('Parley')}</span></span>` : ''}${vouchers ? `<span class="shelf-tile voucher">${img(VOUCHER, 'shelf-icon')}<b>−${F(vouchers)}</b><span>${vouchers === 1 ? T('voucher') : T('vouchers')}</span></span>` : ''}${list(gave)}`;
	const inn = `${silver ? `<span class="shelf-tile silver">${img(SILVER, 'shelf-icon')}<b>+${FC(Math.round(silver))}</b><span>${T('at the wharf')}</span></span>` : ''}${coins ? `<span class="shelf-tile coin${guessedCoins ? ' guess' : ''}">${img(COIN, 'shelf-icon')}<b>+${F(Math.round(coins))}</b><span>${T('Crow Coins')}</span></span>` : ''}${list(coins ? Object.fromEntries(Object.entries(got || {}).filter(([item]) => item !== COIN)) : got)}`;
	return `<div class="exchange">
		<div class="exchange-col out"><div class="exchange-k"><i>↑</i>${T('You handed over')}</div>${out ? `<div class="shelf-tiles">${out}</div>` : `<p class="empty">${T('nothing yet')}</p>`}</div>
		<div class="exchange-col in"><div class="exchange-k"><i>↓</i>${T('You received')}</div>${inn ? `<div class="shelf-tiles">${inn}</div>` : `<p class="empty">${T('nothing yet')}</p>`}</div>
	</div>`;
}

/** One stop of a run, as the results and the history draw it: the
 *  place, the trade with both icons, and what it cost or brought. */
function logRow(k, { done = true, place, who, kind, give, giveText, item, recvText, times, said, sale, cost, tag = '', wait = 0 }) {
	const trade = give
		? `<span class="log-trade">${img(give, 'row-icon xs')}<span>${esc(giveText)}× ${esc(gameName(give))}</span><i>→</i>${img(item, 'row-icon xs')}<span class="tiered" style="--tier:${TIER(levelOf(item))}">${said ? `<b>${F(said)}</b>` : esc(recvText)}× ${esc(gameName(item))}</span><b>×${F(times)}</b></span>`
		: sale ? `<span class="log-trade">${img(SILVER, 'row-icon xs')}<span>${T('sells {n} {what} here for {silver}', { n: n1(sale.n), what: T('goods'), silver: FC(Math.round(sale.total)) })}</span></span>`
			: wait ? `<span class="log-trade">${img(VOUCHER, 'row-icon xs')}<span>${T('waits {n} min', { n: F(wait) })} · ${kind}</span></span>`
				: `<span class="log-trade faint">${kind}</span>`;
	return `<div class="log-row${done ? ' done' : ''}"><span class="rest-dot${done ? ' on' : ''}" aria-hidden="true">${done ? '✓' : k + 1}</span><div><b>${esc(place)}</b>${who ? ` <span class="faint">${esc(who)}</span>` : ''}${tag}${trade}</div><span class="log-right">${done ? (cost ? T('−{n} Parley', { n: F(Math.round(cost)) }) : T('Done')) : T('not yet')}</span></div>`;
}

/**
 * The runs recorded before, each with the whole of what it did: the
 * exchange as tiles and every stop in order, folded under a line that
 * says the day, the board, what it came to. The day's boards and the
 * week above are the totals; this is the record itself. A run written
 * before the record kept its stops shows the exchange alone.
 */
function historyHTML() {
	const runs = [...(store.getProfile('runs', []) || [])].reverse().slice(0, 40);
	if (!runs.length) return '';
	const goalOf = r => (r.goal === 'stock' ? T('for the stock') : r.goal === 'coin' ? T('for Crow Coins') : r.goal === 'material' ? (r.item ? T('for {name}', { name: gameName(r.item) }) : T('for a material')) : T('for silver'));
	const when = r => (r.at ? new Date(r.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : r.day);
	const rows = runs.map((r, i) => {
		const net = Number.isFinite(r.net) ? r.net : r.silver - r.cost;
		const stops = (r.stops_ || []).map((s, k) => logRow(k, {
			place: s.p, who: s.w || '', kind: s.k === 'w' ? T('a wharf call') : s.k === 'q' ? T('a quest handed in') : s.k === 'v' ? T('a wait for a voucher') : T('a barter'),
			give: s.g || '', giveText: s.gn || '', item: s.i || '', recvText: s.r || '', times: s.t || 0, said: s.s || 0, sale: s.sale ? { n: s.sale.n, total: s.sale.silver } : null, cost: s.c || 0, wait: s.k === 'v' ? s.t : 0
		})).join('');
		const chains = (r.chains || []).map(c => `<span class="run-chain-tag"><i></i>${esc(c)}</span>`).join('');
		return `<details class="panel hist-run"${i === 0 && !sailing() ? ' open' : ''}>
			<summary><span class="hist-when">${esc(when(r))}</span><b>${r.layout ? T('layout {id}', { id: esc(r.layout) }) : T('a board')} · ${goalOf(r)}</b><span class="hist-figs"><span class="${net < 0 ? 'warn' : 'gold'}">${net ? `${net > 0 ? '+' : '−'}${FC(Math.abs(net))}` : '—'}</span>${r.coins ? `<span class="gold">+${F(r.coins)} ${T('coins')}</span>` : ''}<span>${r.trades === 1 ? T('{n} trade', { n: F(r.trades) }) : T('{n} trades', { n: F(r.trades) })}</span><span>${F(r.parley)} ${T('Parley')}</span><span>${r.stops === 1 ? T('{n} stop', { n: r.stops }) : T('{n} stops', { n: r.stops })}</span>${r.time ? `<span>≈ ${esc(r.time)}</span>` : ''}</span></summary>
			<div class="panel-body">
				${chains ? `<div class="run-seg-chains">${chains}${r.port ? `<span class="faint">${T('from {port}', { port: esc(gameName(r.port)) })}</span>` : ''}</div>` : ''}
				${exchangeHTML(r.load, r.got, { spent: r.cost, silver: r.silver, coins: r.coins || 0, parley: r.parley, vouchers: r.vouchers || 0 })}
				${stops ? `<div class="hist-stops">${stops}</div>` : `<p class="panel-sub">${T('Recorded before the log kept the stops; the exchange is all that was written down.')}</p>`}
			</div>
		</details>`;
	}).join('');
	return `<section class="panel history"><div class="panel-head"><h2 class="panel-title">${T('Past runs')}</h2><span class="panel-sub">${runs.length === 1 ? T('{n} run recorded', { n: runs.length }) : T('{n} runs recorded', { n: runs.length })} · ${T('newest first · open one for every stop')}</span></div>${rows}</section>`;
}

/**
 * What a recorded run came to, in the thing it was sailed for: a
 * material run or a stock run brought goods, and its silver is at most
 * what the shore goods cost; a silver run, the silver.
 */
function recordedGoodsTile(r) {
	const tile = (k, v, sub, cls) => `<div><div class="summary-k">${k}</div><div class="summary-v ${cls}">${v}</div><div class="summary-sub">${sub}</div></div>`;
	if (r.goal === 'material' || r.goal === 'stock') {
		const got = Object.entries(r.got || {}).filter(([item]) => item !== COIN);
		const n = got.reduce((a, [, k]) => a + k, 0);
		const goods = tile(`${img(got.length ? got[0][0] : SILVER, 'tile-icon')}${r.goal === 'material' ? T('Materials received') : T('Goods received')}`, n ? `+${F(n)}` : '—', got.length === 1 ? T('{n} kind', { n: 1 }) : T('{n} kinds', { n: got.length }), 'teal');
		return `${goods}${r.spent ? tile(`${img(SILVER, 'tile-icon')}${T('Silver spent ashore')}`, `−${FC(r.spent)}`, T('for the land goods handed over'), 'warn') : ''}`;
	}
	return tile(`${img(SILVER, 'tile-icon')}${T('Silver, net')}`, r.net ? `${r.net > 0 ? '+' : '−'}${FC(Math.abs(r.net))}` : '—', r.spent ? T('{sold} sold · {bought} bought', { sold: FC(r.silver), bought: FC(r.spent) }) : T('sold at the wharf'), r.net < 0 ? 'warn' : 'gold');
}

export function resultsHTML() {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	const logs = `${todayHTML()}${weekHTML()}${historyHTML()}`;
	if (!plan) {
		const was = V.lastTrip ? `<section class="panel"><div class="panel-head"><h2 class="panel-title">✓ ${T('The run, recorded')}</h2><span class="panel-sub">${V.lastTrip.stops === 1 ? T('Recorded: {n} stop', { n: V.lastTrip.stops }) : T('Recorded: {n} stops', { n: V.lastTrip.stops })} · ${T('inventory, storage and Parley moved together.')}</span><span class="panel-spacer"></span><button class="linky" data-act="barter-undo-record">↶ ${T('Undo')}</button></div><div class="panel-body"><div class="run-tiles">
			<div><div class="summary-k">⇄ ${T('Trades made')}</div><div class="summary-v">${F(V.lastTrip.trades)}</div><div class="summary-sub">${T('Total Barters → {n}', { n: F(barterProfile().barterCount) })}</div></div>
			${recordedGoodsTile(V.lastTrip)}
			${V.lastTrip.coins ? `<div><div class="summary-k">${img(COIN, 'tile-icon')}${T('Crow Coins')}</div><div class="summary-v gold">+${F(V.lastTrip.coins)}</div><div class="summary-sub"></div></div>` : ''}
			<div><div class="summary-k">◈ ${T('Parley spent')}</div><div class="summary-v teal">${F(V.lastTrip.parley)}</div><div class="summary-sub">${V.lastTrip.vouchers ? (V.lastTrip.vouchers === 1 ? T('{n} voucher drawn on', { n: V.lastTrip.vouchers }) : T('{n} vouchers drawn on', { n: V.lastTrip.vouchers })) : ''}</div></div>
		</div>${exchangeHTML(V.lastTrip.gave, V.lastTrip.got, { spent: V.lastTrip.spent, silver: V.lastTrip.silver, coins: V.lastTrip.coins, parley: V.lastTrip.parley, vouchers: V.lastTrip.vouchers })}<p class="recorded-line">${T('The whole of it is under Past runs below.')}</p></div></section>` : (store.getProfile('runs', []) || []).length
			? `<p class="empty step-empty">${T('No run under way. Its figures appear here as soon as one is cast off, complete or not; the runs before it are below.')}</p>`
			: `<p class="empty step-empty">${T('No runs recorded yet. Plan a run, load at the wharf and cast off: what it did shows here, and every run after it is kept under Past runs.')}</p><div class="step-empty-act"><button class="act" data-act="barter-step" data-id="plan">‹ ${T('Back to the plan')}</button></div>`;
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
	const book = ledgerOf(stops, legsOf(stops));
	const drawnSoFar = stops.reduce((n, s, k) => n + (ticked(on.done, s, k, stops) ? book.rows[k].drawn || 0 : 0), 0);
	const coins = trip.delta[COIN] || 0;
	const guessedCoins = unsaid(plan, on).some(s => s.item === COIN);
	const wharfTicked = stops.some((s, k) => s.wharf && s.sale && ticked(on.done, s, k, stops));
	const gave = {}, got = {};
	for (const [item, n] of Object.entries(trip.delta)) {
		if (item === SILVER || item === COIN || Math.abs(n) < 1) continue;
		if (n < 0) gave[item] = Math.round(-n); else got[item] = Math.round(n);
	}
	// The shore goods bought for the run and handed over are given too,
	// though the Inventory never held them; the silver tile says what
	// they cost, these say what they were.
	for (const [k, s] of stops.entries()) if (s.npcId && levelOf(s.give) === null && ticked(on.done, s, k, stops)) gave[s.give] = (gave[s.give] || 0) + Math.round(s.times * s.giveN);
	const gained = Object.values(got).reduce((a, n) => a + n, 0);
	const stocking = (on.goal || V.goal) === 'stock', coining = (on.goal || V.goal) === 'coin', materialing = (on.goal || V.goal) === 'material';
	const tile = (k, v, sub, cls = '') => `<div><div class="summary-k">${k}</div><div class="summary-v${cls ? ` ${cls}` : ''}">${v}</div><div class="summary-sub">${sub}</div></div>`;
	const timer = timerState();
	const owed = stops.filter(s => owesCount(s, on)).length;
	const tiles = `<div class="run-tiles">
		${tile(`⚓ ${T('Stops')}`, `${doneN} / ${stops.length}`, complete ? T('every stop ticked') : at >= 0 ? T('stop {n} is next', { n: at + 1 }) : '')}
		${tile(`⇄ ${T('Trades made')}`, F(trip.trades), `${T('of {n} planned', { n: F(plan.trades || 0) })} · ${T('Total Barters → {n}', { n: F(prof.barterCount + Math.round(trip.trades)) })}`)}
		${coining ? tile(`${img(COIN, 'tile-icon')}${T('Crow Coins so far')}`, coins ? `+${F(coins)}` : '—', guessedCoins ? T('the middle of the range assumed until typed') : T('as typed at each island'), 'gold')
		: materialing ? tile(`${img(Object.keys(got)[0] || SILVER, 'tile-icon')}${T('Materials so far')}`, gained ? `+${F(gained)}` : '—', gained ? Object.keys(got).length === 1 ? T('{n} kind', { n: 1 }) : T('{n} kinds', { n: Object.keys(got).length }) : T('nothing received yet'), 'teal')
		: stocking ? tile(`${img(stops.find(s => s.npcId && levelOf(s.item)) ? stops.find(s => s.npcId && levelOf(s.item)).item : SILVER, 'tile-icon')}${T('Goods so far')}`, gained ? `+${F(gained)}` : '—', gained ? T('{n} kinds', { n: Object.keys(got).length }) : T('nothing received yet'), 'teal')
			: tile(`${img(SILVER, 'tile-icon')}${T('Silver so far')}`, trip.silver ? FC(trip.silver) : '—', wharfTicked ? T('sold at the wharf call') : T('nothing sold until the wharf call is ticked'), 'gold')}
		${tile(`${drawnSoFar ? img(VOUCHER, 'tile-icon') : '◈ '}${T('Parley spent')}`, F(spent), `${T('{n} left of {bar}', { n: F(Math.max(0, bar - spent)), bar: F(bar) })}${parleyGuessed(prof) ? ` · ${T('assumed full')}` : ''}${drawnSoFar ? ` · ${drawnSoFar === 1 ? T('{n} voucher drawn on', { n: drawnSoFar }) : T('{n} vouchers drawn on', { n: drawnSoFar })}` : ''}`, 'teal')}
		${tile(`⏱ ${T('Under way')}`, timer ? esc(spanText(timer.ran)) : '—', on.time ? T('≈ {time} planned', { time: esc(on.time) }) : '')}
	</div>`;
	const log = stops.map((s, k) => {
		const d = ticked(on.done, s, k, stops), names = stopNames(s);
		const cost = s.npcId ? (Number(s.parley) > 0 ? Number(s.parley) : (Number(s.times) || 0) * parleyOf(prof).perTrade) : 0;
		return logRow(k, { done: d, place: names.place, who: names.who, kind: names.kind, give: s.give, giveText: s.giveText, item: s.item, recvText: s.recvText, times: s.times, said: (on.seen || {})[s.npcId] || 0, sale: s.wharf && s.sale ? s.sale : null, cost, tag: book.rows[k] ? ` ${parleyNotes(book, k, s).tag}` : '', wait: s.wait || 0 });
	}).join('');
	const net = trip.silver - trip.spent;
	// A material run sells nothing: its silver is only what the shore
	// goods cost, said as such, and nothing when none was bought.
	const receipt = `${materialing && !net ? '' : `<div class="receipt-net"><span>${materialing ? T('Silver spent ashore') : T('Silver, net')}</span><b class="${net < 0 ? 'warn' : 'gold'}">${net ? `${net > 0 ? '+' : '−'}${FC(Math.abs(net))}` : '—'}</b></div>`}
	<div class="receipt-acts"><span class="panel-sub">${T('The hold already follows every ticked stop. Recording adds the Parley, Total Barters, the quests and the log; its Undo takes the whole run back.')}${owed ? ` <b class="amber">${owed === 1 ? T('{n} island still waits for its count.', { n: owed }) : T('{n} islands still wait for their count.', { n: owed })}</b>` : ''}</span><button class="linky danger" data-act="barter-sail-drop" title="${T('Drop the checklist; nothing is recorded')}">${T('Abandon')}</button><button class="act" data-act="barter-record" ${doneN ? '' : 'disabled'} title="${T('The stops done go into the Inventory as one change')}">${T('Record the trip')}</button></div>`;
	return `<section class="panel"><div class="panel-head"><h2 class="panel-title">${complete ? T('The run, complete') : T('The run so far')}</h2><span class="panel-sub">${timer ? `${T('under way')} ⏱ ${esc(spanText(timer.ran))}` : ''}</span><span class="panel-spacer"></span><button class="linky" data-act="barter-step" data-id="sail">‹ ${T('Back to the run')}</button></div><div class="panel-body">${tiles}</div></section>
		<section class="panel"><div class="panel-head"><h2 class="panel-title">${T('The exchange')}</h2><span class="panel-sub">${complete ? T('what recording will change') : T('so far — only ticked stops count')}</span></div><div class="panel-body">${exchangeHTML(gave, got, { spent: trip.spent, silver: trip.silver, coins, parley: spent, vouchers: drawnSoFar, guessedCoins })}${receipt}</div></section>
		<section class="panel log-panel"><div class="panel-head"><h2 class="panel-title">${T('Stop by stop')}</h2><span class="panel-sub">${complete ? T('complete') : T('{n} still to go', { n: stops.length - doneN })}</span></div>${log}</section>
		${logs}`;
}
