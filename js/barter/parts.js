// The silver, stock and coin plan laid out: the numbered parts of the
// plan, the run the ticks come to, and the dock along the foot.

import { esc, F, FC } from '../fmt.js';
import { T, said, gameName } from '../i18n.js';
import * as store from '../state.js';
import { img } from '../ui-bits.js';
import { barterProfile } from '../ui-state.js';
import { shownHold, aboardWhat } from '../ship.js';
import { npcById, ports, isleOf, isleShort } from '../barter_npcs.js';
import { fmtRange, fmtDistance } from '../sailing.js';
import { PARLEY_UNIT, NOTHING, SAIL_PRESETS, sailPresetOf, stockOrders, yardsticks } from '../barter-orders.js';
import { landPrices } from '../land-cost.js';
import { marketStatus } from '../market.js';
import { PARLEY, COIN, COIN_LEVEL, levelOf, countBonus, withBonus } from '../barter.js';
import { exchanges, landHeld } from '../barter-plan.js';
import { chains, chainRun, tailOf } from '../barter-chains.js';
import { shortTrades } from '../barter-short.js';
import { V } from './state.js';
import { fromPort, layCal, spendUsed, continueHTML, keepRoute } from './board.js';
import { narrow, lvTag } from './cockpit.js';
import { aboardStock, everythingHeld, floorsShut, cashFloorNow, dockStock } from './hold.js';
import { heldOf } from './material.js';
import { packedNow, sparesOf, packingOf, packingLT, packingCount, tripsOf, stagedRun, tripsHTML, leaveHomeHTML, packingHTML, afterShelfHTML } from './packing.js';
import { chartButton, parleyGuessed, parleyOf, stashAt, ordersNow, payRangeHTML, perUnitText, perHourText, stockGains, aheadHTML, goalLine, ladderHTML, howLine, howHTML, parleyLine, parleyHTML, marketDead, chainRow, soloRun } from './plan.js';
import { docks, bagNow, stashes, withWaits, legsOf, questPlan, questsLine, questsPanels, n1, TIER, ledgerOf, runTime, routeEditBar, castOffRow, stopRows, cutsHTML } from './route.js';
import { sailing, planSeen, syncSail, castOffCaps, castOffLand } from './sail.js';
import { SEARCH_BUDGET_MS, presetSearch, proposeAsync, searching, redrawSoon, expectedBest } from './search.js';
import { coinsOf, coinRange, bonusNote, coinPurseHTML, shortSummary, shortHTML, canAppearHTML } from './short.js';
import { takenNote } from './today.js';
import { editsBy, persist } from './view.js';

// Each card's figure for the chains ticked by hand, by its inputs.
const mineBy = new Map();
// The run as laid, by its inputs: a press on the way draws the tab again
// and nothing the run is laid from has moved. Handed out with stops of
// its own, since the page writes on them.
const laidBy = new Map();
function laidOnce(key, lay) {
	if (!laidBy.has(key)) {
		laidBy.set(key, lay());
		if (laidBy.size > 8) laidBy.delete(laidBy.keys().next().value);
	}
	const run = laidBy.get(key);
	return { ...run, stops: run.stops.map(x => ({ ...x })) };
}

export function silverParts(me, b) {
	const from = fromPort();
	const chainActs = fill => `<div class="chain-acts"><span class="panel-sub">${T('tick the ones to sail')}</span><span class="panel-spacer"></span>${fill ? `<button class="chip tiny primary" data-act="barter-fill" title="${T('Keep what is ticked and add the chains that pay best beside it')}"${V.filling ? ' disabled aria-busy="true"' : ''}>${V.filling ? T('filling…') : T('fill the rest for me')}</button>` : ''}${V.routes.ids.length ? `<button class="linky" data-act="barter-chains-clear">${T('clear')}</button>` : ''}</div>`;
	const prof = barterProfile();
	// A stock run is the same board and the same run, told something
	// else: nothing is sold at a wharf, every target is a floor, and the
	// climbs stop where the stock ends.
	const stocking = V.goal === 'stock';
	// A coin run is the same board again, sailed to the islands that pay
	// in Crow Coins. They take a [Level 4] and nothing else, so the
	// ceiling is not a choice here: it is four, and the last rung of a
	// chain is the island that cashes it.
	const coining = V.goal === 'coin';
	// A short trip is the board one trade at a time: the sailor picks
	// what they are going for, and what fits round it is offered.
	const short = V.shape === 'short' && !V.reach;
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
		const reachNote = V.reach ? `<div class="reach-bar"><span>${T('Reaching <b>{name}</b> for the material run. Look at one island first: the chains that pass it follow from the board.', { name: esc(gameName(V.reach)) })}</span><button class="chip tiny" data-act="barter-goal" data-id="material">← ${T('the material run')}</button><button class="chip tiny" data-act="barter-reach-clear">${T('clear')}</button></div>` : '';
		const oNow = stocking ? stockOrders(ordersNow(), V.stockGoal) : ordersNow();
		return {
			secs: [
				['parley', T('Before you sail'), esc(parleyLine(prof)), parleyHTML(prof)],
				['ladder', T('Where today ends'), esc(goalLine(oNow)), ladderHTML(oNow)],
				...(short ? [['chains', T('Your short trip'), T('the board is not read yet'), canAppearHTML(b, prof, oNow)]] : []),
				...(short ? [] : [['how', T('How to sail it'), esc(howLine(oNow)), howHTML(oNow)]]),
				...(short ? [] : [['chains', T('Chains on offer'), T('the board is not read yet'), `${reachNote}<div class="chains-wait"><p>${V.board.answers.length
					? T('Nearly there: one more island settles which board this is, and the chains follow.')
					: T('The chains follow the board: look at one island in the game and tap what it shows.')}</p><button class="chip primary" data-act="barter-board-island">${T('Tell it what an island shows')} ›</button>${prof.barterCount ? '' : `<p class="chains-wait-note">${T('Your Total Barters read nought, which leaves almost every island shut. Set them in the bar at the top of the page — the number is in the game’s Barter Information window.')}</p>`}</div>${evHTML}`]])
			],
			load: '', dock: '', things: { all: 0, done: 0 }, stops: 0, time: ''
		};
	}
	// A short trip stays under the hold's limit and sails the shortest
	// way: how long it is, is what the sailor adds to it.
	const o = (base => (short ? { ...base, pace: 'fast', hours: 0, way: 'sea' } : base))(stocking ? stockOrders(ordersNow(), V.stockGoal) : ordersNow());
	const ceilingNow = stocking ? V.stockGoal.ceiling : coining ? COIN_LEVEL : V.climb;
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
	const everything = spendUsed(chains(b.data, stock, dock, prof.barterCount, ceilingNow, coining), b);
	// Goods on this board's ladders held in a harbour's storage the run
	// does not sail from: a chain can only start from what it can load,
	// so they are offered nowhere. Said, with the harbour to sail from.
	const heldAt = (() => {
		if (from) return null;
		const gives = new Set(everything.flatMap(c => c.rungs.map(r => r.give)));
		let best = null;
		for (const p of ports) {
			let n = 0;
			for (const g of gives) if (levelOf(g) !== null && store.stockAt(g, p.name) > 0) n++;
			if (n && (!best || n > best.n)) best = { p, n };
		}
		return best;
	})();
	const heldNote = heldAt ? `<div class="rolled-note held-note"><b>${heldAt.n === 1 ? T('{n} good on these ladders waits in the storage at {port}', { n: heldAt.n, port: esc(gameName(heldAt.p.name)) }) : T('{n} goods on these ladders wait in the storage at {port}', { n: heldAt.n, port: esc(gameName(heldAt.p.name)) })}</b> <span>${T('The run sails from no harbour, so it loads from no storage and every chain starts from the shore. Sail from {port} to start a climb from what you hold there.', { port: esc(gameName(heldAt.p.name)) })}</span><span class="panel-spacer"></span><button class="chip tiny primary" data-act="barter-port-set" data-id="${heldAt.p.id}">${T('Sail from {port}', { port: esc(gameName(heldAt.p.name)) })}</button></div>` : '';

	const shutChains = everything.filter(c => c.gate && (o.buy || c.from !== 'land') && covered(c));
	let all = everything.filter(c => (o.buy || c.from !== 'land') && !c.gate && covered(c));
	// Asked to reach a good for the material run: only the chains that
	// pass it, each cut there, so the run ends with that good aboard.
	if (V.reach) {
		all = all.filter(c => c.rungs.some(r => r.item === V.reach)).map(c => {
			const i = c.rungs.findIndex(r => r.item === V.reach);
			const rungs = c.rungs.slice(0, i + 1);
			return { ...c, rungs, top: levelOf(V.reach), id: `${c.id}>${i}` };
		});
	}
	// The ticks belong to one board, and on a short trip to its trades.
	const key = `${V.board.day}|${b.combo.id}|${V.reach}${short ? '|short' : ''}`;
	const fullAll = all;
	const shortSet = short ? shortTrades(all, V.routes.key === key ? V.routes.ids : []) : null;
	if (short) all = [...shortSet.picked, ...shortSet.first, ...shortSet.next];
	const made = store.getProfile('homemade', []) || [];
	const prices = landPrices(all.filter(c => c.from === 'land').map(c => c.item), made);
	// A range is counted at its least, except where this run has seen
	// what the island paid: the checklist asks at every such island.
	const seen = { ...planSeen(sailing()) };
	// Everything the sailor holds, wherever it is: a floor is about the
	// pile, not about the hold, so a run must know the whole of it
	// before it decides what it may spend.
	const owned = Object.fromEntries(everythingHeld());
	// The ship's pace rides along: a run laid more than one way is kept
	// by what it is worth an hour, and the hour is the ship's.
	const opts = { stock, dock, hold: me.hold, parley: parleyOf(prof), npcById, start: from, stashes, prefer: stashAt(), pace, orders: o, prices, seen, keep: V.reach ? [V.reach] : [], land, owned, ship: { speed: me.speed.sea, cal: layCal() }, bag: bagNow(), docks };
	// Each chain on its own, for its row: the list is sorted by the
	// yardstick, silver a Parley unit, the guide's measure of a chain,
	// so the best use of the day's Parley is at the top of its group.
	// The runs worth sailing, searched once for these inputs and kept
	// until any of them change; each chain's run on its own likewise.
	const ship = { speed: me.speed.sea, cal: layCal() };
	// The barter count is part of the key, and has to be: it decides
	// which chains exist at all. Without it, raising the count left the
	// solo runs keyed to the old, shorter set -- and the first chain the
	// new count opened had no run in the map, which threw inside the
	// render and froze the tab on the old board.
	// What the sets are judged by: the stock, said as plain data so the
	// search can take it to the worker.
	const aim = coining ? { kind: 'coins' } : stocking ? { targets: V.stockGoal.targets, held: [...everythingHeld()], kind: V.stockGoal.aim } : null;
	// Every laying of this plan judges its ways by the same aim.
	if (aim) opts.aim = aim;
	// The ceiling is part of the key as much as the barter count is: it
	// decides which chains exist at all, and a search kept across a
	// change of it would answer for chains this board no longer lists.
	const ceiling = ceilingNow;
	const pkey = JSON.stringify([V.board.day, b.combo.id, stock, dock, owned, [...land], o, V.port, V.stash, opts.bag, Object.values(prices).map(x => x.each), me.hold, ship, opts.parley, opts.seen, V.reach, prof.barterCount, aim, ceiling, b.shut]);
	const search = { chains: all, opts, ship, timeCap: o.hours, aim };
	// The search goes to the worker and the page draws meanwhile; asked
	// again when the inputs change, or when an answer is owed and no
	// request is out for it -- a fill superseded it, or the worker went.
	if (!short && (V.proposed.key !== pkey || (V.proposed.working && !searching(pkey)))) {
		let solos = V.proposed.solos;
		if (V.proposed.key !== pkey) {
			const base = chainRun({ ...opts, chosen: [] });
			solos = new Map(all.map(c => [c.id, soloRun(c, opts, from, base)]));
		}
		const found = proposeAsync(search, pkey, result => {
			// The inputs moved on before the answer came: a newer request
			// is out for them, and this answer is nobody's.
			if (V.proposed.key !== pkey) return;
			V.proposed = { ...V.proposed, ...result, working: false };
			if (V.routesAuto === V.routes.key) {
				V.routesAuto = '';
				V.routes = { key: V.routes.key, ids: V.proposed.best ? V.proposed.best.ids : all.length ? [all[0].id] : [] };
				persist();
			}
			redrawSoon();
		});
		// Until the answer comes the last proposals stand in, when they
		// belong to this board, under a note that the search is out.
		const onBoard = new Set(all.map(c => c.id));
		V.proposed = found
			? { key: pkey, solos, ...found, working: false }
			: { key: pkey, solos, proposals: V.proposed.proposals.filter(p => p.ids.every(id => onBoard.has(id))), best: V.proposed.key === pkey ? V.proposed.best : null, partial: false, working: true };
	}
	V.lastSearch = search;
	// The ways of sailing, each searched on its own: the chains it may
	// start, under its own orders, in the background.
	const reachCut = list => (V.reach ? list.filter(c => c.rungs.some(r => r.item === V.reach)).map(c => {
		const i = c.rungs.findIndex(r => r.item === V.reach);
		return { ...c, rungs: c.rungs.slice(0, i + 1), top: levelOf(V.reach), id: `${c.id}>${i}` };
	}) : list);
	const presetPrices = landPrices(everything.filter(c => c.from === 'land').map(c => c.item), made);
	const sailingKeys = new Set(SAIL_PRESETS.flatMap(p => Object.keys(p.orders)));
	// The ranges counted over every chain on the board, not only the ones
	// this card's orders let in: the key, and the figures, must not move
	// with the card that is chosen.
	const presetSeen = {};
	Object.assign(presetSeen, planSeen(sailing()));
	const baseOrders = Object.fromEntries(Object.entries(o).filter(([k]) => !sailingKeys.has(k)));
	const presetKey = JSON.stringify([V.board.day, b.combo.id, stock, dock, owned, [...land], baseOrders, V.port, V.stash, Object.values(presetPrices).map(x => x.each), me.hold, ship, opts.parley, presetSeen, V.reach, prof.barterCount, aim, ceiling, b.shut]);
	// Asked once the main search has answered, so the two never share
	// the machine. The way already chosen is the main search itself: its
	// answer is that card's figure, not a second search that might land
	// somewhere else.
	if (!short && !V.proposed.working) presetSearch(presetKey, SAIL_PRESETS.map(p => {
		const oo = { ...o, ...p.orders };
		const coveredBy = c => c.from !== 'land' || oo.landFrom !== 'stock' || (land.get(c.item) || 0) >= c.rungs[0].giveN;
		const list = reachCut(everything.filter(c => (oo.buy || c.from !== 'land') && !c.gate && coveredBy(c)));
		return { id: p.id, args: { chains: list, opts: { ...opts, pace: oo.pace, orders: oo, prices: presetPrices, seen: presetSeen }, ship, timeCap: oo.hours, aim } };
	}));
	// Ticks left to the search -- a new board, or a way of sailing just
	// changed under ticks that were the search's own -- take its answer
	// as soon as there is one, whether it came from the worker or was
	// already in hand.
	if (!short && !V.proposed.working && V.routesAuto && V.routesAuto === V.routes.key) {
		V.routesAuto = '';
		V.routes = { key: V.routes.key, ids: V.proposed.best ? V.proposed.best.ids : all.length ? [all[0].id] : [] };
		persist();
	}
	const solos = V.proposed.solos;
	if (!short) all.sort((x, y) => y.top - x.top || (solos.get(y.id).yard.perUnit - solos.get(x.id).yard.perUnit) || x.rungs.length - y.rungs.length || isleOf(npcById.get(x.rungs[0].npcId)).localeCompare(isleOf(npcById.get(y.rungs[0].npcId))));
	// A new board's ticks are the best run found; while that is still
	// being found nothing is ticked, and the answer ticks it. A short
	// trip starts from nothing: the trade to go for is the sailor's.
	if (V.routes.key !== key) {
		V.routes = { key, ids: short || V.proposed.working ? [] : V.proposed.best ? V.proposed.best.ids : all.length ? [all[0].id] : [] };
		V.routesAuto = !short && V.proposed.working ? key : '';
	}
	const chosen = short ? shortSet.picked : all.filter(c => V.routes.ids.includes(c.id));
	const sameSet = (x, y) => x.length === y.length && x.slice().sort().join('|') === y.slice().sort().join('|');
	const cards = V.proposed.proposals.map(p => {
		const isl = p.run.stops.filter(s => s.npcId).length;
		const on = sameSet(p.ids, V.routes.ids);
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
				? [got.byLevel.map(([lv, n]) => `${lvTag(lv)} +${F(n)}`).join(' · '), p.hours ? `≈ ${esc(fmtRange(p.hours * 3600 * 0.9, p.hours * 3600 * 1.1))}` : ''].filter(Boolean).join(' · ')
				: [p.yard.perUnit ? `<em>${esc(perUnitText(p.yard.perUnit))}</em>` : '', p.yard.perHour ? esc(perHourText(p.yard.perHour)) : '', p.hours ? `≈ ${esc(fmtRange(p.hours * 3600 * 0.9, p.hours * 3600 * 1.1))}` : ''].filter(Boolean).join(' · ');
		return `<button class="proposal${on ? ' on' : ''}" data-act="barter-propose" data-ids="${esc(p.ids.join('\n'))}" title="${on ? T('This is the run laid out on the right') : T('Lay this run out on the right')}">
			<span class="proposal-k">${esc(said(p.label))}</span>
			<b>${big}</b>
			<span class="proposal-yard">${yard}</span>
			<span class="proposal-sub">${p.ids.length === 1 ? T('{n} chain', { n: p.ids.length }) : T('{n} chains', { n: p.ids.length })} · ${isl === 1 ? T('{n} island', { n: isl }) : T('{n} islands', { n: isl })} · ${T('{n} trades', { n: F(p.run.trades) })}${p.run.cost ? ` · ${T('{silver} of land goods', { silver: FC(Math.round(p.run.cost)) })}` : ''}</span>
		</button>`;
	}).join('');
	const budgetText = T('best found in {n} s', { n: (SEARCH_BUDGET_MS / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) });
	const proposals = `<div class="proposals${V.proposed.working ? ' working' : ''}">
		<div class="proposals-head"><span>${T('Runs worth sailing')}</span><span class="faint">${V.proposed.working ? T('working out the runs…') : `${T('found on today’s board under these orders')}${o.hours ? `, ${o.hours === 1 ? T('within {n} hour', { n: o.hours }) : T('within {n} hours', { n: o.hours })}` : ''}${V.proposed.partial ? ` · ${budgetText}` : ''}`} · ${T('the value counts silver net of land goods and the goods kept')}</span></div>
		${cards ? `<div class="proposal-cards">${cards}</div>` : V.proposed.working ? `<div class="proposal-cards"><div class="proposal placeholder" aria-busy="true"><span class="proposal-k">${T('Working out the runs…')}</span><b>&nbsp;</b><span class="proposal-sub">${T('the board’s chains, searched in the background')}</span></div></div>` : `<p class="empty">${stocking ? T('Nothing on this board climbs toward the stock under these orders.') : T('Nothing on this board pays under these orders.')}</p>`}
	</div>`;
	const fillable = chosen.length > 0 && !V.proposed.proposals.some(p => sameSet(p.ids, V.routes.ids));
	// A new sailor needs one sentence on what to do here, and a sailor
	// who ticked their own needs to know what that costs them against the
	// best the search found.
	const pickHelp = `<p class="chains-help">${T('<b>The quick way:</b> tap one of the runs worth sailing — its chains are ticked for you. <b>Your own way:</b> tick chains below; each card says what that chain would pay sailed on its own.')}</p>`;
	const mineVsOf = plan => (fillable && V.proposed.best && !V.proposed.working
		? (() => {
			const bestV = coining ? coinsOf(V.proposed.best.run).min : stocking ? stockGains(V.proposed.best.run, stock).total : V.proposed.best.run.net;
			const mineV = coining ? coinsOf(plan).min : stocking ? stockGains(plan, stock).total : plan.net;
			const say = v => (coining ? T('{n} coins', { n: F(v) }) : stocking ? `+${F(v)}` : FC(Math.round(v)));
			return mineV + 1 < bestV ? `<div class="chains-vs"><span>${chosen.length === 1 ? T('Your {n} ticked chain comes to <b>{mine}</b>; the best run found comes to <b>{best}</b>.', { n: chosen.length, mine: say(mineV), best: say(bestV) }) : T('Your {n} ticked chains come to <b>{mine}</b>; the best run found comes to <b>{best}</b>.', { n: chosen.length, mine: say(mineV), best: say(bestV) })}</span><button class="chip tiny primary" data-act="barter-propose" data-ids="${esc(V.proposed.best.ids.join('\n'))}">${T('tick the best instead')}</button></div>` : '';
		})()
		: '');
	// The list, filtered: a word in an island's or a good's name, where
	// the chain starts, the level it reaches. A ticked chain always shows.
	const cq = V.chainQ.trim().toLowerCase();
	const passes = c => chosen.includes(c) || ((!cq || c.item.toLowerCase().includes(cq) || c.rungs.some(r => r.npc.toLowerCase().includes(cq) || r.item.toLowerCase().includes(cq) || (npcById.get(r.npcId) || {}).at.toLowerCase().includes(cq)))
		&& (!V.chainFrom || (V.chainFrom === 'held' ? c.from !== 'land' : c.from === 'land'))
		&& (!V.chainTop || (V.chainTop === 'coin' ? c.pays === 'coin' : c.top === V.chainTop && c.pays !== 'coin')));
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
		<input class="field hold-q" type="search" placeholder="${T('Find an island, a place or a good…')}" value="${esc(V.chainQ)}" data-act="barter-chain-q" aria-label="${T('Find a chain')}">
		<span class="chips">
			<button class="chip tiny${V.chainFrom === 'held' ? ' active' : ''}" aria-pressed="${V.chainFrom === 'held' ? 'true' : 'false'}" data-act="barter-chain-from" data-id="held" title="${T('Chains that start from a good held, aboard or at the harbour')}">${T('from what is held')}</button>
			<button class="chip tiny${V.chainFrom === 'land' ? ' active' : ''}" aria-pressed="${V.chainFrom === 'land' ? 'true' : 'false'}" data-act="barter-chain-from" data-id="land" title="${T('Chains that start with a land good bought ashore')}">${T('bought ashore')}</button>
			${tops.map(t => `<button class="chip tiny lvl${V.chainTop === t ? ' active' : ''}" aria-pressed="${V.chainTop === t ? 'true' : 'false'}" data-act="barter-chain-top" data-lv="${t}" style="--tier:${TIER(t === 'coin' ? COIN_LEVEL : t)}" title="${t === 'coin' ? T('Chains that end at an island paying in Crow Coins') : T('Chains that reach Level {lv}', { lv: t })}">${t === 'coin' ? img(COIN, 'chip-icon') : t}</button>`).join('')}
			${cq || V.chainFrom || V.chainTop ? `<button class="chip tiny" data-act="barter-chain-clear">${T('clear')}</button>` : ''}
		</span>
	</div>`;
	const groupsOf = claimOf => tops.map(top => {
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
			return chainRow(shown, chosen.includes(shown), solo, from && from.name, from, starts.length > 1 ? { starts, chosen, solos } : null, null, claimOf);
		}).filter(Boolean);
		// The climbs at this reach that are not this sailor's yet: the
		// same search filters them, so a word typed finds them too.
		const locked = shutChains.filter(c => reachOf(c) === top && passes(c))
			.map(c => chainRow(c, false, null, from && from.name, from, null, c.gate));
		if (!rows.length && !locked.length) return '';
		const of = [...ladders.values()].filter(list => reachOf(list[0]) === top).length;
		return `<div class="chain-group${coinGroup ? ' coin' : ''}"><div class="chain-group-head" style="--tier:${TIER(coinGroup ? COIN_LEVEL : top)}"><i></i><span>${coinGroup ? `${img(COIN, 'group-icon')}${T('Cashed in for Crow Coins')}` : T('Reaches Level {lv}', { lv: top })}</span>${coinGroup || stocking || coining ? '' : top >= o.sell && o.sell !== NOTHING ? `<em class="group-fate sold">${T('sold at the wharf')}</em>` : `<em class="group-fate kept">${T('kept, not sold — the wharf sells Level {lv} and up', { lv: o.sell })}</em>`}<span>${rows.length !== of ? T('{n} of {of}', { n: rows.length, of }) : rows.length}${locked.length ? ` · ${T('{n} locked', { n: locked.length })}` : ''}</span></div>${rows.join('')}${locked.join('')}</div>`;
	}).join('');
	// What pays the good today, and whether its give is held: the answer
	// even when no chain from the shore reaches it.
	const pays = V.reach ? exchanges(b.data).filter(x => x.item === V.reach && npcById.has(x.npcId)) : [];
	const paysText = pays.length
		? T('Today {list}.', { list: pays.map(x => `${T('<b>{isle}</b> pays it for {n}× {name}', { isle: esc(gameName(isleOf(npcById.get(x.npcId)))), n: esc(x.giveText), name: esc(gameName(x.give)) })}${heldOf(x.give).run > 0 ? ` ${T('({n} held)', { n: F(heldOf(x.give).run) })}` : ` ${T('(none held)')}`}`).join('; ') })
		: T('No island on today’s board pays it.');
	const reachBar = V.reach ? `<div class="reach-bar"><span>${T('Reaching <b>{name}</b> for the material run: the chains that pass it, cut there, so it comes home aboard.', { name: esc(gameName(V.reach)) })} ${paysText}${all.length ? '' : pays.length ? ` ${T('Nothing on this board climbs to that give — wait for a refresh, or clear.')}` : ` ${T('Wait for a refresh, or clear.')}`}</span><button class="chip tiny" data-act="barter-goal" data-id="material" title="${T('Back to the material run')}">← ${T('the material run')}</button><button class="chip tiny" data-act="barter-reach-clear">${T('clear')}</button></div>` : '';
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
	const bodyOf = groups => `<div class="barter-chains">${heldNote}${chainActs(fillable)}${floorNote}${shutNote}${reachBar}${V.reach ? '' : `${pickHelp}${proposals}<!--minevs-->`}${all.length ? chainFilters : ''}<div class="chain-list">${groups || `<p class="empty">${!all.length ? (o.landFrom === 'stock' && o.buy ? T('No chain on this board starts from a shore good you keep. Let the run buy its land goods ashore, or add what you have with ＋ A good.') : o.buy ? T('Nothing climbs on this board.') : T('Nothing held climbs on this board. Let the run buy land goods, or load a good ashore.')) : T('No chain matches.')}</p>`}</div></div>`;

	// The sailor's own changes to the route belong to this set of chains
	// on this board: a new board or a new tick starts from the planner's.
	const editKey = `${V.routes.key}|${V.routes.ids.slice().sort().join(',')}|${o.way}`;
	// Edits belong to the set of chains they were made on. Another set
	// starts clean; going back to one -- a chain ticked and unticked --
	// finds its edits where they were left.
	if (V.routeEdit.key !== editKey) {
		if (V.routeEdit.key && (V.routeEdit.skip.length || Object.keys(V.routeEdit.nudge).length || V.routeEdit.trips.length)) {
			editsBy.delete(V.routeEdit.key);
			editsBy.set(V.routeEdit.key, V.routeEdit);
			if (editsBy.size > 12) editsBy.delete(editsBy.keys().next().value);
		}
		V.routeEdit = editsBy.get(editKey) || { key: editKey, skip: [], nudge: {}, trips: [] };
	}
	const edits = { skipIsles: V.routeEdit.skip, nudge: V.routeEdit.nudge, tripOrder: V.routeEdit.trips || [] };
	// What is aboard and not wanted is dealt with at the harbour, before
	// casting off: the run is laid without it, so the route neither
	// carries it nor calls somewhere later to be rid of it.
	const spares = sparesOf(chosen, from, o, stocking);
	if (spares.length) {
		const less = { ...opts.stock };
		for (const x of spares) { less[x.item] = (less[x.item] || 0) - x.n; if (less[x.item] <= 0) delete less[x.item]; }
		opts.stock = less;
	}
	// Once cast off, the storage is behind the ship: laid again at a count
	// said on the way, the run loads no more than it did.
	const pin = castOffCaps(sailing(), opts.dock);
	const bought = castOffLand(sailing(), o);
	const laid = pin ? { ...opts, loadCap: pin, ...(bought ? { landCap: bought, bought } : {}) } : opts;
	const plan = laidOnce(JSON.stringify([pkey, marketStatus().at, chosen.map(c => c.id), edits, spares, pin && [...pin], bought && [...bought]]), () => chainRun({ ...laid, chosen, ...edits }));
	plan.spares = spares;
	const payRange = payRangeHTML(plan, laid, chosen, edits, seen, coining, stocking);
	// Two chains ticked on one pile: the Golden Fish Scales at Iliya start
	// the Arehaza climb and the Starry Midnight Port one alike, and there
	// were five. The run gives them to whichever gets there first, and
	// the other card went on saying "5 ashore" while its chain never
	// started. So the cards are drawn from the run as it was laid: what
	// each ticked chain hands over from the pile it starts on, and what
	// that leaves every other chain on the same pile.
	const pileClaims = new Map();
	plan.order.forEach((c, i) => {
		if (c.from === 'land') return;
		const r0 = c.rungs[0];
		const n = plan.stops.reduce((a, s) => a + (s.npcId === r0.npcId && s.chain === i && s.give === c.item ? (s.times || 0) * (s.giveN || 0) : 0), 0);
		if (n > 0) pileClaims.set(c.item, [...(pileClaims.get(c.item) || []), { id: c.id, n, c }]);
	});
	const claimOf = x => {
		if (!x || x.from === 'land') return null;
		const list = pileClaims.get(x.item) || [];
		const by = list.filter(e => e.id !== x.id);
		if (!by.length) return null;
		const pile = (x.have || 0) + (x.waiting || 0);
		const left = Math.max(0, pile - by.reduce((a, e) => a + e.n, 0));
		const mine = list.some(e => e.id === x.id);
		return { item: x.item, pile, left, by: by.map(e => ({ c: e.c, n: e.n })), out: !mine && left < x.rungs[0].giveN, ticked: chosen.some(c => c.id === x.id) };
	};
	const groups = groupsOf(claimOf);
	let chainsBody = bodyOf(groups);
	chainsBody = chainsBody.replace('<!--minevs-->', mineVsOf(plan));
	for (const s of plan.stops) s.hold = me.hold;
	// The quests handed in on the way, with a stop put in for a taker
	// off the route: the run's stops from here on are those.
	const qp = questPlan(plan.stops, o.quests, me.hold, plan.weightStart);
	plan.stops = withWaits(qp.stops, plan.weightStart);
	plan.questsHome = qp.home;
	V.shownPlan = plan;
	syncSail(plan);
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
	// The bag, when the run used it: what it held at the most.
	if (plan.bag && plan.bagPeak > 0) peak.note = `${peak.note || T('under the limit')} · ${T('your bag at most {lt} of {free} LT', { lt: F(Math.round(plan.bagPeak)), free: F(plan.bag.free) })}`;
	// And when it was not: why, since the sailor asked for it.
	else if (plan.bagNote) peak.note = `${peak.note || T('under the limit')} · ${plan.bagNote.why === 'slower' ? T('your bag not used: the run pays more an hour without it') : plan.bagNote.why === 'small' ? T('your bag not used: a later trip’s goods need more room or slots than it has') : T('your bag not used: nothing on this run needs it')}`;
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
		${tile(T('Parley at the end'), plan.stops.length ? F(book.end) : '—', `${T('{spent} spent from {held}', { spent: F(book.spent), held: F(parley.held) })}${parleyGuessed(prof) ? ` · ${T('a full bar, taken as read — type yours under Before you sail')}` : ''}${prof.vouchers ? ` · ${prof.vouchers === 1 ? T('{used} of {of} voucher drawn on', { used: book.vouchersUsed, of: prof.vouchers }) : T('{used} of {of} vouchers drawn on', { used: book.vouchersUsed, of: prof.vouchers })}` : ''}${book.waited ? ` · <b class="amber">${T('waits {n} min for a cooldown', { n: F(book.waited) })}</b>` : ''}${book.short ? ` · <b class="warn">${T('runs dry at stop {n}', { n: book.dryAt + 1 })}</b>` : ''}`, book.short ? 'warn' : book.waited ? 'amber' : book.end < PARLEY.max * 0.1 ? 'amber' : 'teal')}
		${tile(T('Under way'), legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `${T('≈ {time} at {speed}%', { time: esc(runTime(legs, book)), speed: me.speed.total })} · ${islands === 1 ? T('{n} island', { n: islands }) : T('{n} islands', { n: islands })}${wharfs ? `, ${wharfs === 1 ? T('{n} wharf call', { n: wharfs }) : T('{n} wharf calls', { n: wharfs })}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}` : T('pick a chain'))}
	</div>${coinPurseHTML(plan)}` : stocking ? `<div class="run-tiles">
		${tile(T('The stock gains'), gains.total ? `+${F(gains.total)}` : '—', gains.total ? `${gains.byLevel.map(([lv, n]) => `${lvTag(lv)} +${F(n)}`).join(' · ')}${gains.spare ? ` · ${T('{n} over the targets, to climb with', { n: F(gains.spare) })}` : ''}` : chosen.length ? T('nothing this run banks is short') : T('pick a chain'), 'teal')}
		${tile(T('Trades'), plan.trades ? F(plan.trades) : '—', plan.trades ? `${T('{spent} Parley of {bar}', { spent: F(Math.round(plan.parleyUsed)), bar: F(plan.parleyBar) })} · ${T('{n} barters behind you, {after} after', { n: F(prof.barterCount), after: F(prof.barterCount + plan.trades) })}` : T('one barter counts as one, whatever it trades'), 'gold')}
		${tile(T('Hold at its fullest'), plan.stops.length ? esc(peak.text) : '—', `${peak.note || T('under the limit')} · ${peak.deal === peak.max ? T('barters and moves to {max}', { max: F(peak.max) }) : T('barters to {deal} · moves to {max}', { deal: F(peak.deal), max: F(peak.max) })}`, peak.state === 'heavy' || peak.state === 'dead' ? 'warn' : peak.state === 'over' ? 'amber' : 'teal')}
		${tile(T('Parley at the end'), plan.stops.length ? F(book.end) : '—', `${T('{spent} spent from {held}', { spent: F(book.spent), held: F(parley.held) })}${parleyGuessed(prof) ? ` · ${T('a full bar, taken as read — type yours under Before you sail')}` : ''}${prof.vouchers ? ` · ${prof.vouchers === 1 ? T('{used} of {of} voucher drawn on', { used: book.vouchersUsed, of: prof.vouchers }) : T('{used} of {of} vouchers drawn on', { used: book.vouchersUsed, of: prof.vouchers })}` : ''}${book.waited ? ` · <b class="amber">${T('waits {n} min for a cooldown', { n: F(book.waited) })}</b>` : ''}${book.short ? ` · <b class="warn">${T('runs dry at stop {n}', { n: book.dryAt + 1 })}</b>` : ''}`, book.short ? 'warn' : book.waited ? 'amber' : book.end < PARLEY.max * 0.1 ? 'amber' : 'teal')}
		${tile(T('Under way'), legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `${T('≈ {time} at {speed}%', { time: esc(runTime(legs, book)), speed: me.speed.total })} · ${islands === 1 ? T('{n} island', { n: islands }) : T('{n} islands', { n: islands })}${wharfs ? `, ${wharfs === 1 ? T('{n} wharf call', { n: wharfs }) : T('{n} wharf calls', { n: wharfs })}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}` : T('pick a chain'))}
	</div>${aheadHTML(gains, plan, prof)}` : `<div class="run-tiles">
		${tile(plan.cost ? T('Silver, net') : T('Sold in port'), plan.silver ? FC(Math.round(plan.net)) : '—', plan.silver ? `${T('{what} sold at the wharf', { what: soldWhat })}${plan.cost ? ` ${T('for {silver} · {cost} of land goods bought', { silver: FC(Math.round(plan.silver)), cost: FC(Math.round(plan.cost)) })}` : ''}${plan.bought.some(b => b.how === 'unpriced') ? ` · ${T('some land goods unpriced')}` : ''}` : chosen.length ? (short ? T('nothing on this trip sells — see what it is worth kept, under Fits on the way') : T('no chain ticked sells')) : short ? T('pick a trade') : T('pick a chain'), plan.net < 0 ? 'warn' : 'gold')}
		${tile(T('A Parley unit pays'), yard.perUnit ? FC(Math.round(yard.perUnit)) : '—', yard.perUnit ? `${T('{spent} Parley of {bar}', { spent: F(Math.round(plan.parleyUsed)), bar: F(plan.parleyBar) })} · ${plan.trades === 1 ? T('{n} trade', { n: F(plan.trades) }) : T('{n} trades', { n: F(plan.trades) })}${yard.perHour ? ` · ${T('≈ {silver} an hour', { silver: FC(Math.round(yard.perHour)) })}` : ''}` : `${plan.trades === 1 ? T('{n} trade', { n: F(plan.trades) }) : T('{n} trades', { n: F(plan.trades) })} · ${T('one unit is one normal trade’s Parley')}`, 'gold')}
		${tile(T('Hold at its fullest'), plan.stops.length ? esc(peak.text) : '—', `${peak.note || T('under the limit')} · ${peak.deal === peak.max ? T('barters and moves to {max}', { max: F(peak.max) }) : T('barters to {deal} · moves to {max}', { deal: F(peak.deal), max: F(peak.max) })}`, peak.state === 'heavy' || peak.state === 'dead' ? 'warn' : peak.state === 'over' ? 'amber' : 'teal')}
		${tile(T('Parley at the end'), plan.stops.length ? F(book.end) : '—', `${T('{spent} spent from {held}', { spent: F(book.spent), held: F(parley.held) })}${parleyGuessed(prof) ? ` · ${T('a full bar, taken as read — type yours under Before you sail')}` : ''}${prof.vouchers ? ` · ${prof.vouchers === 1 ? T('{used} of {of} voucher drawn on', { used: book.vouchersUsed, of: prof.vouchers }) : T('{used} of {of} vouchers drawn on', { used: book.vouchersUsed, of: prof.vouchers })}` : ''}${book.waited ? ` · <b class="amber">${T('waits {n} min for a cooldown', { n: F(book.waited) })}</b>` : ''}${book.short ? ` · <b class="warn">${T('runs dry at stop {n}', { n: book.dryAt + 1 })}</b>` : ''}`, book.short ? 'warn' : book.waited ? 'amber' : book.end < PARLEY.max * 0.1 ? 'amber' : 'teal')}
		${tile(T('Under way'), legs.total ? esc(fmtDistance(legs.total)) : '—', legs.total ? `${T('≈ {time} at {speed}%', { time: esc(runTime(legs, book)), speed: me.speed.total })} · ${islands === 1 ? T('{n} island', { n: islands }) : T('{n} islands', { n: islands })}${wharfs ? `, ${wharfs === 1 ? T('{n} wharf call', { n: wharfs }) : T('{n} wharf calls', { n: wharfs })}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}` : T('pick a chain'))}
	</div>`;
	// One route through every chain: the stops in sailing order, each
	// tagged with its chain, the chains named in the head with the way
	// to untick each. Chain after chain: a segment a chain.
	const worth = s => (s.total ? T('would sell for {silver}', { silver: FC(Math.round(s.total)) }) : T('cannot be sold'));
	const goodLine = (s, at) => `<div class="run-good"><i style="--tier:${TIER(levelOf(s.item))}">${levelOf(s.item) ? lvTag(levelOf(s.item)) : '·'}</i>${img(s.item, 'row-icon sm')}<b>${n1(s.n)}×</b><span>${esc(gameName(s.item))}</span>${at ? `<span class="faint">${T('at {where}', { where: esc(gameName(at)) })}</span>` : ''}${takenNote(s.item)}<span class="run-good-worth">${worth(s)}</span></div>`;
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
		short ? (chosen.length === 1 ? T('<b>{n}</b> trade picked', { n: chosen.length }) : T('<b>{n}</b> trades picked', { n: chosen.length })) : chosen.length === 1 ? T('<b>{n}</b> chain', { n: chosen.length }) : T('<b>{n}</b> chains', { n: chosen.length }),
		coining ? (plan.coins ? `<b class="gold">${coinRange(purse.min, purse.max)}</b> ${T('coins')}` : '') : stocking ? (gains.total ? `<b class="teal">+${F(gains.total)}</b> ${T('goods')}` : '') : plan.silver ? `<b class="gold">${FC(Math.round(plan.net))}</b>${plan.cost ? ` ${T('net')}` : ''}` : '',
		`${plan.stops.length === 1 ? T('<b>{n}</b> stop', { n: plan.stops.length }) : T('<b>{n}</b> stops', { n: plan.stops.length })}${legs.total ? ` · ≈ ${esc(runTime(legs, book))}` : ''}`,
		plan.trades ? `${plan.trades === 1 ? T('<b>{n}</b> trade', { n: F(plan.trades) }) : T('<b>{n}</b> trades', { n: F(plan.trades) })} · ${T('{n} Parley left', { n: F(book.end) })}` : '',
		qp.count ? `📜 ${qp.count === 1 ? T('<b>{n}</b> quest', { n: qp.count }) : T('<b>{n}</b> quests', { n: qp.count })}` : '',
		peak.state === 'heavy' || peak.state === 'dead' ? `<b class="warn">${T('too heavy')}</b>` : peak.state === 'over' ? `<b class="amber">${T('over the limit')}</b>` : ''
	]) : '';
	// What each way of sailing would come to: its own search's best run,
	// once the background search has answered for it. And where the
	// chains were ticked by hand, what those ticks come to that way too,
	// since choosing a card keeps hand-picked ticks.
	const handPicked = chosen.length && !V.routesAuto && !(V.proposed.best && sameSet(V.proposed.best.ids, V.routes.ids));
	const figOf = run => {
		const lg = legsOf(run.stops);
		const big = coining ? (run.coins ? `${F(withBonus(run.coins, countBonus(prof.barterCount).pct))}+` : '—') : stocking ? (() => { const g = stockGains(run, stock); return g.total ? `+${F(g.total)}` : '—'; })() : run.silver ? FC(Math.round(run.net)) : '—';
		const calls = run.stops.filter(x => x.wharf).length;
		const chainsN = (run.order || []).length;
		// The waits for a voucher's cooldown are part of how long it takes.
		return { big, sub: `${chainsN === 1 ? T('{n} chain', { n: chainsN }) : T('{n} chains', { n: chainsN })} · ${lg.total ? `≈ ${esc(runTime(lg, ledgerOf(run.stops, lg)))}` : T('no way')} · ${run.trades === 1 ? T('{n} trade', { n: F(run.trades) }) : T('{n} trades', { n: F(run.trades) })}${calls ? ` · ${calls === 1 ? T('{n} wharf call', { n: calls }) : T('{n} wharf calls', { n: calls })}` : ''}` };
	};
	const presetFigs = short ? new Map() : new Map(SAIL_PRESETS.map(p => {
		// The card's own search, once it has answered -- the same for the
		// card chosen as for the rest, so choosing one changes no figure.
		// Until then the chosen card can read the main search's answer.
		const own = p.id === sailPresetOf(o) && !V.proposed.working;
		const ready = V.presetState.res.has(p.id) || own;
		const best = V.presetState.res.has(p.id) ? V.presetState.res.get(p.id) : V.proposed.best;
		const f = !ready ? { big: '…', sub: T('searching this way…'), wait: true } : best ? figOf(best.run) : { big: '—', sub: T('nothing sails this way today') };
		if (handPicked) {
			// Laid once for these inputs and kept: a press on the way --
			// Arrived, Traded -- draws the tab again, and laying the run
			// for every card each time stalled the page under the ship.
			const mkey = `${pkey}|${marketStatus().at}|${p.id}|${chosen.map(c => c.id).join(',')}`;
			if (!mineBy.has(mkey)) {
				const oo = { ...o, ...p.orders };
				const mine = chainRun({ ...opts, pace: oo.pace, orders: oo, chosen });
				mineBy.set(mkey, coining ? (mine.coins ? `${F(withBonus(mine.coins, countBonus(prof.barterCount).pct))}+` : '—') : stocking ? (() => { const g = stockGains(mine, stock); return g.total ? `+${F(g.total)}` : '—'; })() : mine.silver ? FC(Math.round(mine.net)) : '—');
				if (mineBy.size > 24) mineBy.delete(mineBy.keys().next().value);
			}
			f.mine = mineBy.get(mkey);
		}
		return [p.id, f];
	}));
	const runFigures = `<div class="run-as-ticked"><div class="plan-sub-head"><b>${T('The run')}</b><span>${short ? (chosen.length === 1 ? T('{n} trade picked', { n: chosen.length }) : T('{n} trades picked', { n: chosen.length })) : chosen.length === 1 ? T('{n} chain ticked', { n: chosen.length }) : T('{n} chains ticked', { n: chosen.length })} · ${T('aboard {ship}: the limit is {lt} LT', { ship: esc(gameName(me.name)), lt: F(peak.limit) })}${peak.aboard ? `, ${T('{n} of it {what}', { n: F(peak.aboard), what: said(aboardWhat(peak)) })}` : ''}, ${T('barters to {n}', { n: F(peak.deal) })} · ${T('goods counted at the least, weighed at the most')}${stagedRun(plan) ? ` · <b>${T('{n} trips out of {port}', { n: plan.lots.length, port: from ? esc(gameName(from.name)) : T('the harbour') })}</b>` : ''}</span></div>${tiles}${payRange}${notice}</div>`;
	const worthSaid = coining ? (plan.coins ? T('{n} coins', { n: coinRange(purse.min, purse.max) }) : '') : stocking ? (gains.total ? `+${F(gains.total)}` : '') : plan.silver ? FC(Math.round(plan.net)) : '';
	const chainsSummary = chosen.length
		? [chosen.length === 1 ? T('{n} chain ticked', { n: chosen.length }) : T('{n} chains ticked', { n: chosen.length }), worthSaid, plan.stops.length === 1 ? T('{n} stop', { n: plan.stops.length }) : T('{n} stops', { n: plan.stops.length })].filter(Boolean).join(' · ')
		: V.proposed.working ? T('working out the runs…') : T('nothing ticked yet');
	// The wharf: the hold as it stands, what has to come aboard before
	// the lines are let go, what the run leaves behind it, and the route
	// stop by stop for whoever wants to read it before sailing it.
	const firstOver = plan.stops.findIndex(x => ['over', 'heavy', 'dead'].includes(shownHold(me.hold, x.weightAfter).state));
	const overNote = firstOver >= 0 && !heavy ? `<div class="barter-shut hold-over"><b>${T('The hold passes its limit at stop {n}', { n: firstOver + 1 })}</b> — ${T('it reaches {text}: sailing slower, still trading.', { text: esc(peak.text) })}${wharfs ? ` ${wharfs === 1 ? T('{n} wharf call is in the run to leave goods on the way.', { n: wharfs }) : T('{n} wharf calls are in the run to leave goods on the way.', { n: wharfs })}` : ''}</div>` : '';
	const empty = chosen.length ? '' : `<div class="run-empty">${T('Nothing ticked. Tick a chain and the run lays itself out here — every rung, the hold after it, and where it has to call.')}</div>`;
	// The route as drawn on the wharf: the run the ship is actually
	// loaded for. Drawn from whichever run it is handed, so the same
	// sheet serves the full plan and the part of it that is aboard.
	const routeFoldOf = (plan, legs, book, qp) => {
		const islands = plan.stops.filter(s => s.npcId).length, wharfs = plan.stops.filter(s => s.wharf).length;
		// A run of trips says where each one begins: the call that picks
		// up its goods, and what that call sells of the trip before.
		const tripAt = new Map(stagedRun(plan) ? tripsOf(plan).filter(t => t.head >= 0).map(t => [t.head, t]) : []);
		const tripHead = (s, k) => {
			const t = tripAt.get(k);
			if (!t) return '';
			const l7 = s.sale ? s.sale.items.filter(i => levelOf(i.item) === 7).reduce((a, i) => a + i.n, 0) : 0;
			return `<div class="run-trip-head"><b>${T('Trip {n} begins', { n: t.n })}</b><span>${T('load {goods}', { goods: t.loads.map(l => `${n1(l.n)}× ${esc(gameName(l.item))}`).join(', ') })}${l7 ? ` · ${T('sell {n} [Level 7]', { n: n1(l7) })}` : ''}</span></div>`;
		};
		const oneRoute = o.way === 'sea' && plan.order.length > 1;
		const segs = oneRoute ? (plan.stops.length ? `<section class="panel run-seg run-seg-all" style="--tier:${TIER(Math.max(...plan.order.map(c => c.top)))}">
				<div class="run-seg-head"><i></i><b>${plan.lots.length > 1 ? T('One route, {n} lots', { n: plan.lots.length }) : T('One route, every chain at once')}</b><span>${islands === 1 ? T('{n} island', { n: islands }) : T('{n} islands', { n: islands })}${wharfs ? `, ${wharfs === 1 ? T('{n} wharf call', { n: wharfs }) : T('{n} wharf calls', { n: wharfs })}` : ''} · ${T('the nearest rung the ship holds the give for, whatever its chain')}${plan.lots.length > 1 ? ` · ${T('as many chains at once as the hold carries, the tops sold before the next lot')}` : ''}</span></div>
				<div class="run-seg-chains">${plan.lots.map(lot => lot.map(k => {
					const c = plan.order[k];
					const isl = plan.stops.filter(s => s.chain === k && s.npcId).length;
					const cutHere = plan.cut.some(x => x.chain === k);
					const count = cutHere
						? T('{n} of {of} islands', { n: isl, of: (c.fullRungs || c.rungs).length })
						: isl === 1 ? T('{n} island', { n: isl }) : T('{n} islands', { n: isl });
					return `<span class="run-chain-tag" style="--tier:${TIER(c.top)}"><i></i>${chainName(c)}<em>L${c.top}</em><small${cutHere ? ` class="short" title="${T('This chain does not get to the top — see the note under the tiles')}"` : ''}>${count}</small><button class="map-x" data-act="barter-chain" data-id="${esc(c.id)}" aria-label="${T('Untick this chain')}">×</button></span>`;
				}).join('')).join(`<span class="run-lot-sep">${T('then')}</span>`)}</div>
				${routeEditBar(plan)}<div class="run-stops">${castOffRow(plan, from)}${stopRows(plan.stops, legs, { board: true, sailing: sailing(), edit: !sailing(), notes: qp, ledger: book, trip: tripHead, tag: s => (s.npcId ? `<em class="run-chain-tag sm" style="--tier:${TIER(plan.order[s.chain].top)}"><i></i>${chainName(plan.order[s.chain])}</em>` : '') })}</div>
			</section>` : '') : plan.order.map((c, k) => {
			const first = plan.stops.findIndex(s => s.chain === k);
			const mine = plan.stops.filter(s => s.chain === k);
			const soldHere = plan.sold.filter(s => s.chain === k).reduce((a, s) => a + s.total, 0);
			const leftHere = plan.stashed.filter(s => s.chain === k).reduce((a, s) => a + s.total, 0);
			return `<section class="panel run-seg" style="--tier:${TIER(c.top)}">
				<div class="run-seg-head"><i></i><b>${T('{isle} chain', { isle: esc(isleShort(npcById.get(c.rungs[0].npcId)) || c.rungs[0].npc) })}</b><em>${T('Level {lv}', { lv: c.top })}</em><span>${soldHere ? T('{silver} sold', { silver: FC(Math.round(soldHere)) }) : T('nothing sold')}${leftHere ? ` · ${T('{silver} left on the way', { silver: FC(Math.round(leftHere)) })}` : ''}${mine.length ? '' : (() => { const cut = plan.cut.find(x => x.chain === k); return cut && cut.why === 'market' ? ` · ${cut.listed ? T('cannot start: only {n} {good} on the Market', { n: F(cut.listed), good: esc(gameName(cut.good)) }) : T('cannot start: no {good} on the Market', { good: esc(gameName(cut.good)) })}` : ` · ${T('every island already dealt')}`; })()}</span><button class="map-x" data-act="barter-chain" data-id="${esc(c.id)}" aria-label="${T('Untick this chain')}">×</button></div>
				${mine.length ? `<div class="run-stops">${stopRows(mine, legs, { k0: first, before: first > 0 ? plan.stops[first - 1] : null, board: true, sailing: sailing(), edit: !sailing(), notes: qp, ledger: book, trip: tripHead })}</div>` : ''}
			</section>`;
		}).join('');
		const routeFold = plan.stops.length ? `<details class="panel route-fold"${sailing() || narrow() ? '' : ' open'}><summary><b>${T('The route, stop by stop')}</b><span class="panel-sub">${plan.stops.length === 1 ? T('{n} stop', { n: plan.stops.length }) : T('{n} stops', { n: plan.stops.length })}${legs.total ? ` · ${esc(fmtDistance(legs.total))} · ≈ ${esc(runTime(legs, book))}` : ''}${from ? ` · ${T('from {port}', { port: esc(gameName(from.name)) })}` : ''}</span>${questsLine(qp, o.quests)}<span class="panel-spacer"></span>${chartButton(plan.stops, '')}</summary>${segs}</details>` : '';
		keepRoute(plan, legs, book, segs, '');
		return routeFold;
	};
	// What will be in the storage after follows what is ticked aboard:
	// a chain whose first goods are not on the ship yet has made nothing
	// yet, and a shelf full of its [Level 4]s before anything is loaded
	// read as a promise the wharf had not kept.
	// Only what is ticked aboard is sailed. A chain whose first goods are
	// not on the ship yet has made nothing, so the route, the shelf of
	// what is left in storage and the run cast off are all laid from the
	// chains that are packed, and laid again as each one comes aboard.
	const packRows = (() => { const pk = packingOf(plan, from, chosen); return [...pk.market, ...pk.storage, ...pk.bag, ...pk.aboard]; })();
	// The route follows the ship, not the plan: until every row is
	// ticked it is laid from what is really aboard, with nothing loaded
	// out of a storage -- the goods a sailor has not put on the ship are
	// not on it, whatever the plan meant to load. With every row ticked
	// it is the whole run.
	const allPacked = packRows.every(packedNow);
	// A run of several trips is laid whole from the start: its route,
	// its shelf and the run cast off are the plan's, the later trips'
	// goods loaded at the calls back to the harbour where they wait --
	// they are the run's to pick up, not a chain's to be short of, and
	// a sailor packing trip 1 wants to see where the whole day goes.
	// It used to wait for every row of trip 1, and showed nothing until
	// then, which read as a step with nothing on it.
	const staged = stagedRun(plan);
	const packedChain = c => {
		const row = packRows.find(x => x.item === c.item) || packRows.find(x => x.item === c.rungs[0].give);
		// Without a row a chain is packed only when its first good is on
		// the ship: a chain the run cannot start has no row, and was
		// drawn as aboard with nothing aboard.
		return row ? packedNow(row) : (aboardStock()[c.rungs[0].give] || 0) > 0;
	};
	const ready = sailing() || allPacked || staged ? chosen : chosen.filter(packedChain);
	let rPlan = plan, rLegs = legs, rBook = book, rQp = qp;
	if (ready.length !== chosen.length) {
		rPlan = chainRun({ ...opts, dock: {}, chosen: ready, ...edits });
		for (const x of rPlan.stops) x.hold = me.hold;
		rQp = questPlan(rPlan.stops, o.quests, me.hold, rPlan.weightStart);
		rPlan.stops = withWaits(rQp.stops, rPlan.weightStart);
		rPlan.questsHome = rQp.home;
		rLegs = legsOf(rPlan.stops);
		rBook = ledgerOf(rPlan.stops, rLegs);
	}
	if (!sailing()) V.shownPlan = ready.length ? rPlan : null;
	const partNote = ready.length && ready.length !== chosen.length ? `<p class="shelf-part">${T('For the {n} of {of} chains whose first goods are ticked aboard — the rest join as they are.', { n: ready.length, of: chosen.length })}</p>` : '';
	const tripsN = staged ? plan.lots.length : 1;
	const nothingAboard = title => `<section class="panel run-shelves after"><div class="shelf"><div class="shelf-head"><h2 class="panel-title">${title}</h2><span class="panel-sub">${T('nothing aboard yet')}</span></div><p class="empty">${T('Tick what is aboard above: this fills with what the run leaves in storage, chain by chain, as its first goods come aboard.')}</p></div></section>`;
	const shelf = !chosen.length ? '' : !ready.length ? nothingAboard(T('In the storage after')) : afterShelfHTML(rPlan, from).replace('<div class="shelf-tiles">', `${partNote}<div class="shelf-tiles">`);
	const routeFold = !chosen.length ? '' : !ready.length
		? `<section class="panel route-fold route-wait"><div class="panel-head"><h2 class="panel-title">${T('The route, stop by stop')}</h2><span class="panel-sub">${T('nothing aboard yet')}</span></div><p class="empty">${T('The route is laid from what is on the ship: tick the goods aboard above, and it draws itself — again each time a chain comes aboard.')}</p></section>`
		: `${partNote ? `<div class="route-part">${partNote}</div>` : ''}${routeFoldOf(rPlan, rLegs, rBook, rQp)}`;
	const load = `${notice}${overNote}${empty}${leaveHomeHTML(plan, from, chosen)}${staged ? tripsHTML(plan, from, chosen, me.hold) : packingHTML(plan, from, chosen)}${shelf}${questsPanels(rQp, from)}${routeFold}${kept}`;
	return {
		secs: [
			['parley', T('Before you sail'), esc(parleyLine(prof)), parleyHTML(prof)],
			['ladder', T('Where today ends'), esc(goalLine(o)), ladderHTML(o, { fits: all.length, tickedN: chosen.length })],
			...(short
				? [['chains', T('Your short trip'), esc(shortSummary(chosen, worthSaid, plan)), shortHTML({ set: shortSet, picked: chosen, opts, aim, ship, from, stock, plan, pkey, stocking, coining, runFigures, heldNote, shutNote })]]
				: [['how', T('How to sail it'), esc(howLine(o)), howHTML(o, presetFigs)],
					['chains', T('Chains on offer'), esc(chainsSummary), `${chainsBody}${chosen.length ? runFigures : ''}`]])
		],
		cont: continueHTML(fullAll, b),
		load, dock: foot, packLT: packingLT(plan, from, chosen), things: { ...packingCount(plan, from, chosen), later: staged ? tripsOf(plan).slice(1).reduce((a, t) => a + t.loads.length, 0) : 0, trips: tripsN }, stops: plan.stops.length, time: runTime(legs, book) || ''
	};
}

/**
 * The strip along the foot of the page while something is ticked: the
 * run in a line -- what it comes to, how long, how heavy -- and the
 * button that opens the whole of it over the page. It stays in view as
 * the chains or the islands are ticked above, so the answer is never
 * out of sight and never in the way.
 */
export function runDockHTML(figs) {
	return `<div class="run-dock"><span class="run-dock-k">${T('The run')}</span><span class="run-dock-figs">${figs.filter(Boolean).map(f => `<span>${f}</span>`).join('')}</span><button class="act run-dock-open" data-act="barter-step" data-id="load" title="${T('What to have aboard before casting off, and the route stop by stop')}">${T('Load at the wharf')} ›</button></div>`;
}
