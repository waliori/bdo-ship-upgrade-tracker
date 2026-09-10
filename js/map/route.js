// The Route tab: the loop as plotted, what it costs to sail -- time,
// Parley, the hold, the rations -- its ledger, the routes kept by name,
// a route in a link and a route as a file.

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import { currentShip } from '../ship.js';
import { img } from '../ui-bits.js';
import { npcById, ports } from '../barter_npcs.js';
import { nearestWharf } from '../wharves.js';
import { gradeById } from '../crystals.js';
import { openDialog, closeDialog, toast } from '../dialogs.js';
import * as store from '../state.js';
import { legLengths, pathLength, sailRange, fmtRange, calibrate, fmtDistance, DEFAULT_CAL } from '../sailing.js';
import { rationPlan, calibrateRations, fmtRations, fmtRationRange, DEFAULT_RATION_RATE, RATION_RESERVE } from '../rations.js';
import { looksLikeGameXML } from '../worldmap.js';
import { parleyPerTrade, PARLEY, GOODS, amount, bestExchange, levelOf, triesFor } from '../barter.js';
import { aboardStock } from '../barter-plan.js';
import { SAVED_MAX, PREVIOUS, keepNamed, replaceAt } from '../saved-routes.js';
import { marketPrice } from '../market.js';
import { routeLedger, perHour } from '../route-ledger.js';
import { barterData, barterProfile } from '../ui-state.js';
import { mv, persist, restore } from './state.js';
import { gameImportRead, openGameImport } from './game-map.js';
import { stopsLive, seaBent, routeWorld, straightLegs, barterKind, goodsOf, marksNow, routeIds } from './marks.js';
import { paintMap } from './paint.js';
import { iconStrip, refreshSide } from './render.js';
import { applyTraceObject } from './trace.js';

// The run sheet the Barter tab draws for a run being sailed, handed in
// by ui.js (the Barter screen cannot be imported here without a cycle).
// It takes the chart's islands in order and answers with the sheet when
// the run sailed is the one on the chart, or null.
let runSheet = null;
export function setRunSheet(fn) {
	runSheet = typeof fn === 'function' ? fn : null;
}

export function routeHTML(marks) {
	if (mv.stops.length && !stopsLive()) {
		return `<p class="map-hint">${T('You plotted {n} stops while showing <strong>{pick}</strong>; the chart is on something else now, so they are not drawn.', { n: mv.stops.length, pick: esc(mv.stopsPick ? gameName(mv.stopsPick) : T('everything you are short of')) })}</p>
			<div class="map-side-btns">
				<button class="ghost-btn" data-act="map-route-revive">${T('Show that again')}</button>
				<button class="ghost-btn danger" data-act="map-route-clear">${T('Clear it')}</button>
			</div>${savedHTML()}`;
	}
	const prof = barterProfile();
	const port = ports.find(p => p.id === mv.startPort);
	// The line as it is sailed, bent round the land, one leg per stop
	// (and one more home when the loop closes).
	const world = seaBent(routeWorld(marks));
	const legs = legLengths(world);
	const legTo = k => port ? legs[k] : k > 0 ? legs[k - 1] : null;
	const me = currentShip();
	const speed = me.speed;
	const cal = sailCal();
	const measured = Number(store.getSetting('sailCal', null)) > 0;
	// A crystal that works in its own sea only lifts the quick end of the
	// range: the slow end is the route sailed where it does nothing.
	const localBoost = me.crystal && gradeById[me.crystal.grade].local ? me.speed.crystal : 0;
	// Seconds for a leg, quick end and slow end, at the share of its
	// speed the hull keeps with what is aboard at the start of the leg.
	const secsOf = (m, slow = 1) => [sailRange(m, speed.total * slow, cal, measured)[0], sailRange(m, (speed.total - localBoost) * slow, cal, measured)[1]];
	const timeOf = (m, slow = 1) => m != null ? fmtRange(...secsOf(m, slow)) : '';
	const costs = mv.stops.map(id => stopParley(id, marks, prof));
	const ledger = routeLedger({
		stops: mv.stops,
		tradesAt: id => (mv.runTrades[id] ? [mv.runTrades[id]] : stopTrades(id, marks)),
		timesAt: id => (mv.runTrades[id] ? mv.runTrades[id].times : mv.tradesMode === 'all' ? triesAt(id, marks) : 1),
		aboard: heldGoods().reduce((a, g) => a + g.weight, 0),
		price: marketPrice,
		hold: me.hold
	});
	// Every leg in sailing order with the hold at its start -- the leg
	// into each row of the run, and the leg home when the loop closes --
	// so the times slow where the hold is overweight and the rations
	// fall leg by leg. `k` is the row the leg arrives at; the leg home
	// arrives at no row.
	const seq = routeSeq(marks);
	const legList = [];
	let isles = 0;
	seq.forEach((s, k) => {
		const m = legTo(k);
		const before = isles ? ledger.stops[isles - 1] : null;
		if (m != null) legList.push({ k, m, holdAt: before ? before.after : ledger.start, slow: before ? before.slow : ledger.slowStart });
		if (s.kind === 'npc') isles++;
	});
	if (port && mv.returnHome && legs.length > legList.length) {
		const last = ledger.stops[ledger.stops.length - 1];
		legList.push({ k: seq.length, m: legs[legs.length - 1], holdAt: last ? last.after : ledger.start, slow: last ? last.slow : ledger.slowStart });
	}
	for (const l of legList) l.secs = secsOf(l.m, l.slow);
	const legAt = k => legList.find(l => l.k === k) || null;
	// The chip on a row: the leg's length and minutes, and why the
	// minutes are what they are when the hold slows it.
	const legChip = l => {
		if (!l) return '';
		const pct = Math.round(l.holdAt / me.hold.free * 100);
		const slowed = l.slow < 1;
		const title = slowed ? T('slower: hold at {pct} % — an estimate, {share} % of the speed with {lt} LT aboard', { pct, share: Math.round(l.slow * 100), lt: F(Math.round(l.holdAt)) }) : '';
		return `<span class="map-leg${slowed ? ' slow' : ''}"${title ? ` title="${esc(title)}"` : ''}>${esc(fmtDistance(l.m))} · ${esc(timeOf(l.m, l.slow))}${slowed ? ` · ${T('slower')}` : ''}</span>`;
	};
	// Rations: the pool as typed (full when nothing is), the estimated
	// drain over the legs, and the stop after which it would run below
	// the reserve at the pessimistic end.
	const rRate = rationRate();
	const rMeasured = Number(store.getSetting('rationCal', null)) > 0;
	const rations = rationPlan({
		legs: legList.map(l => ({ minutes: [l.secs[0] / 60, l.secs[1] / 60], refill: !!(seq[l.k] && seq[l.k].kind === 'stash' && seq[l.k].place.rations) })),
		aboard: mv.rationsAboard === null ? me.rations : Math.min(me.rations, mv.rationsAboard),
		full: me.rations, rate: rRate, measured: rMeasured, appetite: me.crew.appetite
	});
	const lowLeg = rations.lowAfter ? legList[rations.lowAfter - 1] : null;
	const lowRow = lowLeg ? seq[lowLeg.k] : null;
	const held = prof.parleyHeld;
	const need = costs.reduce((a, b) => a + b, 0);
	let afford = 0;
	for (let acc = 0; afford < costs.length && acc + costs[afford] <= held; afford++) acc += costs[afford];
	const overBudget = held > 0 && afford > 0 && afford < mv.stops.length;

	// The rows follow the line as it is sailed, so a wharf call sits
	// between the two islands it comes between and wears the number the
	// chart gives it.
	let isle = -1;
	const list = seq.map((s, k) => {
		const leg = legChip(legAt(k));
		const lowHere = lowRow && lowRow.n === s.n ? `<span class="map-row-sub warn">${T('rations run low after this stop — {left} left of {full}, an estimate', { left: esc(fmtRationRange(rations.legs[rations.lowAfter - 1].left)), full: esc(fmtRations(me.rations)) })}</span>` : '';
		if (s.kind === 'stash') return stashRow(s, leg, k, lowHere);
		const id = s.id, n = s.place;
		isle++;
		const has = marks.get(id);
		const over = held > 0 && isle >= afford;
		// The row is the stop's step: a tap takes the player -- and the
		// camera, when it follows -- to it, as the chips along the foot do.
		return `<div class="map-stop-row${over ? ' over' : ''}${k === mv.stepIdx ? ' on' : ''}" data-act="map-step" data-i="${k}" data-step-row role="button" tabindex="0" title="${T('Step to {place}', { place: esc(gameName(n.at)) })}">
			<span class="map-stop-n">${s.n}</span>
			<span class="map-row-main">
				<span class="map-row-name"><span class="map-row-name-t">${esc(gameName(n.at))}</span>${leg}</span>
				<span class="map-row-sub">${esc(gameName(n.name))}${mv.runTrades[id]
					? ''
					: has ? ' · ' + esc([...has.items.keys()].map(gameName).join(', ')) : ` · ${T('nothing on your list here')}`}</span>
				${mv.runTrades[id] ? runLine(mv.runTrades[id]) : cargoLine(id, has)}${holdAfter(ledger.stops[isle], me.hold)}${lowHere}${over ? `<span class="map-row-sub warn">${T('past what your Parley covers')}</span>` : ''}
			</span>
			<span class="map-row-right">${mv.runTrades[id] ? img(mv.runTrades[id].item, 'map-icon') : has ? iconStrip([...has.items.keys()]) : ''}</span>
			<button class="map-x" data-act="map-stop" data-npc="${id}"
				aria-label="${T('Remove {place} from the route', { place: esc(gameName(n.at)) })}">×</button>
		</div>`;
	}).join('');

	const cover = !held ? T('of {max}', { max: F(PARLEY.max) })
		: held >= need ? T('your {held} covers it', { held: F(held) })
		: T('your {held} covers {n} of {total}', { held: F(held), n: afford, total: mv.stops.length });
	const tradesBtn = m => `<button class="chip tiny ${mv.tradesMode === m ? 'active' : ''}" data-act="map-trades" data-id="${m}"
		title="${m === 'one' ? T('One exchange at each stop') : T('Every attempt the offer allows at each stop')}">${m === 'one' ? T('one trade') : T('all attempts')}</button>`;
	// The hold: what the ship as fitted can carry once the crew is
	// aboard, and how many goods of each level that is. A route is only
	// as long as the deck allows.
	const hold = `<div><div class="summary-k">${T('Hold')}</div><div class="summary-v">${F(me.hold.limit)} LT</div>
				<div class="summary-sub">${T('the limit, as fitted')}${me.hold.crew ? ` · ${T('{lt} of it crew', { lt: F(me.hold.crew) })}` : ''} · ${T('{n} of Lv4–5', { n: Math.floor(me.hold.free / GOODS[5].weight) })} · ${T('{n} of Lv6–7 a run', { n: Math.floor(me.hold.free / GOODS[6].weight) })} · ${T('sails slower to {lt}, by the chart\'s estimate', { lt: F(me.hold.max) })}</div></div>`;
	const rationsTile = rationsTileHTML(me, rations, legList, lowRow, rRate, rMeasured);
	const total = pathLength(world);
	const lastStop = npcById.get(mv.stops[mv.stops.length - 1]);
	const wharf = lastStop && !mv.returnHome ? nearestWharf(lastStop.x, lastStop.y, 'wharf') : null;
	const wharfLine = wharf ? `<div class="summary-sub">${T('nearest wharf to the last stop: {name}, {dist}', { name: esc(gameName(wharf.name)), dist: esc(fmtDistance(wharf.d * 0.25)) })}</div>` : '';
	const totalSecs = legList.reduce((a, l) => [a[0] + l.secs[0], a[1] + l.secs[1]], [0, 0]);
	const slowedLegs = legList.filter(l => l.slow < 1).length;
	const distance = world.length > 1 ? `<div><div class="summary-k">${T('Distance')}</div><div class="summary-v">${esc(fmtDistance(total))}</div>
				<div class="summary-sub">${!slowedLegs
					? T('≈ {time} at {pct}%', { time: esc(fmtRange(...totalSecs)), pct: speed.total })
					: slowedLegs === 1
						? T('≈ {time} at {pct}%, {n} leg slowed by the hold', { time: esc(fmtRange(...totalSecs)), pct: speed.total, n: slowedLegs })
						: T('≈ {time} at {pct}%, {n} legs slowed by the hold', { time: esc(fmtRange(...totalSecs)), pct: speed.total, n: slowedLegs })} · ${T('100% ≈ {v} m/s', { v: cal })} ${measured ? '±10%' : '±20%'} · <button class="linky" data-act="map-sail-cal">${T('timed a leg?')}</button></div>${wharfLine}</div>` : '';
	const cargo = cargoTile({ weight: me.hold.free });
	// A leg the router could not bend round the land is drawn straight
	// and said so: its metres and minutes are a floor, not a reading.
	const unrouted = straightLegs(world);
	const unroutedNote = unrouted.length
		? `<p class="map-hint warn map-unrouted">${unrouted.length === 1
			? T('Leg {n} could not be routed round the land and is drawn straight, dashed on the chart; the distance and time for it are a floor.', { n: unrouted[0].n })
			: T('Legs {list} could not be routed round the land and are drawn straight, dashed on the chart; the distance and time for them are a floor.', { list: unrouted.map(l => l.n).join(', ') })}</p>`
		: '';
	const mid = world.length > 1 ? (totalSecs[0] + totalSecs[1]) / 2 : 0;
	const worth = worthTile(ledger, mid);
	const carry = carryBlock(ledger);
	const sailingAs = mv.stops.length ? `<p class="map-hint map-as">${T('Sailing as <b>{name}</b>', { name: esc(gameName(me.name)) })} <button class="linky" data-act="map-setup-pick" title="${T('Sail a saved setup instead — the times follow its speed')}">${T('switch setup ▾')}</button> · ${speed.total}% · ${T('limit {lt} LT', { lt: F(me.hold.limit) })}${me.crew.seated ? ` · ${T('crew|{n} aboard', { n: me.crew.seated })}` : ''} · <button class="linky" data-act="view" data-id="crew">${T('change')}</button></p>` : '';
	const stats = mv.stops.length ? `<div class="map-stats">
			<div><div class="summary-k">${T('Stops')}</div><div class="summary-v">${mv.stops.length}</div>
				${stashLive() ? `<div class="summary-sub">${mv.runStash.some(c => c.rations)
					? (mv.runStash.every(c => c.rations)
						? (mv.runStash.length === 1 ? T('islands · and {n} wharf call for rations', { n: mv.runStash.length }) : T('islands · and {n} wharf calls for rations', { n: mv.runStash.length }))
						: (mv.runStash.length === 1 ? T('islands · and {n} wharf call, for rations and to lighten the hold', { n: mv.runStash.length }) : T('islands · and {n} wharf calls, for rations and to lighten the hold', { n: mv.runStash.length })))
					: (mv.runStash.length === 1 ? T('islands · and {n} wharf call to lighten the hold', { n: mv.runStash.length }) : T('islands · and {n} wharf calls to lighten the hold', { n: mv.runStash.length }))}</div>` : ''}</div>
			${distance}
			${hold}
			${rationsTile}
			<div><div class="summary-k"><span class="gterm" role="button" tabindex="0" data-guide="parley">${T('Parley')}</span></div><div class="summary-v">${F(need)}</div>
				<div class="summary-sub">${cover}</div><div class="chips">${tradesBtn('one')}${tradesBtn('all')}</div></div>
			${worth}
			${cargo}
		</div>${carry}${unroutedNote}
		${overBudget ? `<button class="ghost-btn wide" data-act="map-route-trim" title="${T('Drop the stops past what your Parley covers')}">${afford === 1 ? T('Trim to the {n} stop Parley covers', { n: afford }) : T('Trim to the {n} stops Parley covers', { n: afford })}</button>` : ''}
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-reverse">${T('⇆ Reverse')}</button>
			<button class="ghost-btn" data-act="map-route-save" title="${T('Keep this route by name, to come back to')}">${T('Save…')}</button>
			<button class="ghost-btn danger" data-act="map-route-clear">${T('Clear')}</button>
		</div>
		<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-link" title="${T('A link that opens this route on this chart')}">${T('Copy link')}</button>
			<button class="ghost-btn" data-act="map-route-export" title="${T('Save this route as a small JSON file to share or bring back later')}">${T('Export')}</button>
			<button class="ghost-btn" data-act="map-route-import" title="${T('Load a route saved from here, or the game\'s own gameVariable.xml')}">${T('Import')}</button>
		</div>
		<button class="ghost-btn wide" data-act="map-route-game" title="${T('Write these stops into the game\'s world map as favourites')}">${T('⚑ Put it on the game\'s map')}</button>` : `<div class="map-side-btns">
			<button class="ghost-btn" data-act="map-route-import" title="${T('Load a route saved from here')}">${T('Import a route')}</button>
			<button class="ghost-btn" data-act="map-game-in" title="${T('Read the favourites, camera slots and loops out of gameVariable.xml')}">${T('From the game\'s map')}</button>
		</div>`;
	// Nothing is plotted until you say so; this is the offer, next to
	// the other ways of choosing what to look at.
	const seedBtn = !mv.stops.length && marks.size > 1
		? `<button class="ghost-btn wide" data-act="map-route-use">${T('Plot the loop through all {n} I am short of', { n: marks.size })}</button>`
		: '';
	const startRow = `<div class="map-startrow">
		<select class="purse-inline" data-act="map-start" aria-label="${T('Start the route from')}">
			<option value="0">${T('Start at the first stop')}</option>
			${ports.map(p => `<option value="${p.id}"${p.id === mv.startPort ? ' selected' : ''}>${T('from {port}', { port: esc(gameName(p.name)) })}</option>`).join('')}
		</select>
		<label class="inline-check"><input type="checkbox" data-act="map-return"${mv.returnHome ? ' checked' : ''}> ${T('and back')}</label>
	</div>`;
	const empty = !mv.stops.length
		? `<p class="map-hint">${T('No route plotted. Click a pin and “Add stop”, or take the loop below and change it from there.')}</p>`
		: `<p class="map-hint">${T('Click a pin, then “Add stop”. The numbers sail in this order.')}</p>`;
	// A run being sailed takes the panel: the Barter tab's own sheet --
	// the rail, the trades, the hold and the Parley after each stop, the
	// calls, the quests, Done -- with the plotting tools folded under it.
	const sheet = runSheet && mv.stops.length ? runSheet(routeIds(marks)) : null;
	if (sheet) {
		return `${sailingAs}<div class="map-run">${sheet}</div>
		<details class="map-run-fold tools"><summary>${T('Route tools')}</summary>${stats}${savedHTML()}</details>`;
	}
	return `${empty}${sailingAs}
		${startRow}${seedBtn}<div class="map-list">${list}</div>${stats}${savedHTML()}`;
}

/* ------------------------------------------------------------------ *
 * what a route costs to sail: time, Parley, and what is in the hold
 * ------------------------------------------------------------------ */

/**
 * What one stop costs in Parley. A marked stop is priced by what you
 * are sailing there for, the dearest kind first -- that is the trade
 * you will make. A bare stop is priced by what the island actually
 * deals, which the barter data knows; only when it deals more than one
 * kind, or none we know of, does a guess come in, and then the cheaper
 * one -- an estimate should undersell the route, not pad it. Times the
 * attempts the offer allows, when the route is costed that way.
 */
function stopParley(id, marks, prof) {
	const mm = marks.get(id);
	const times = mv.tradesMode === 'all' ? triesAt(id, marks) : 1;
	if (mm && mm.items.size) {
		// One exchange per kind you are there for: a material and a
		// trade good at the same island are two trades, two rates.
		const kinds = [...new Set([...mm.items.keys()].map(barterKind))];
		return kinds.reduce((sum, kind) => sum + parleyPerTrade({ ...prof, kind }), 0) * times;
	}
	const deals = [...new Set(goodsOf(id).map(g => barterKind(g.item)))];
	const kind = deals.length === 1 ? deals[0]
		: deals.includes('trade') || !deals.length ? 'trade'
		: deals.includes('coin') ? 'coin' : 'material';
	return parleyPerTrade({ ...prof, kind }) * times;
}

/** The speed the route is sailed at: the ship as the Crew screen has
 *  it -- hull, fitted parts and the sail seats. */
export function routeSpeed() {
	return currentShip().speed;
}

/** Metres a second at 100%: the player's own figure if they timed a
 *  leg, else the working estimate. */
export function sailCal() {
	const v = Number(store.getSetting('sailCal', null));
	return v > 0 ? v : DEFAULT_CAL;
}

/** Rations a minute under sail: the player's own figure if they watched
 *  the pool over a leg, else the working estimate. */
function rationRate() {
	const v = Number(store.getSetting('rationCal', null));
	return v > 0 ? v : DEFAULT_RATION_RATE;
}

/**
 * The Rations tile: the pool aboard, what the run eats of it, and --
 * when it would run below the reserve before the end -- the stop after
 * which it does and the nearest wharf manager to call at, with the
 * detour that costs, and a button that puts the call in.
 */
function rationsTileHTML(me, plan, legList, lowRow, rate, measured) {
	if (!legList.length) return '';
	const aboard = plan.start;
	const eats = me.crew.appetite ? T('the crew eats {n} a day', { n: F(me.crew.appetite) }) : T('nobody aboard eats');
	const head = `<div class="summary-k">${T('Rations')}</div>
		<div class="summary-v${plan.lowAfter ? ' amber' : ''}"><input class="purse-inline rations-in" type="text" inputmode="numeric" value="${F(Math.round(aboard))}" data-act="map-rations-aboard" aria-label="${T('Rations aboard now')}" title="${T('What the pool shows now; blank for full')}"> <span class="summary-of">${T('of {full}', { full: esc(fmtRations(me.rations)) })}</span></div>`;
	const use = `<div class="summary-sub">${T('the run eats ≈ {use}', { use: esc(fmtRationRange(plan.use)) })} · ${T('{left} left at the end', { left: esc(fmtRationRange(plan.left)) })} · ${eats} · ${measured ? T('drain {rate} a minute under sail, as you watched it ±15%', { rate: F(rate) }) : T('drain {rate} a minute under sail, the chart\'s estimate ±50%', { rate: F(rate) })} · <button class="linky" data-act="map-ration-cal">${T('watched the pool?')}</button></div>`;
	let low = '';
	if (plan.lowAfter && lowRow) {
		const at = lowRow.place;
		const wharf = nearestWharf(at.x, at.y, 'wharf');
		// The detour: from the stop to the wharf and on to the next stop,
		// less the leg that would have been sailed anyway.
		const nextLeg = legList.find(l => l.k === lowRow.k + 1);
		const next = nextLeg ? routeSeq(marksNow())[nextLeg.k] : null;
		const detour = wharf ? (Math.hypot(wharf.x - at.x, wharf.y - at.y) + (next ? Math.hypot(next.place.x - wharf.x, next.place.y - wharf.y) : 0)) * 0.25 - (nextLeg ? nextLeg.m : 0) : 0;
		low = `<div class="summary-sub warn">${T('runs low after stop {n}, {place}: under a {pct} % reserve at the slow end of the range', { n: lowRow.n, place: esc(gameName(at.name || at.at)), pct: Math.round(RATION_RESERVE * 100) })}</div>
			${wharf ? `<div class="summary-sub">${T('nearest wharf manager: {name} at {place}, {dist} off — a detour of about {detour}', { name: esc(gameName(wharf.name)), place: esc(gameName(wharf.at)), dist: esc(fmtDistance(Math.hypot(wharf.x - at.x, wharf.y - at.y) * 0.25)), detour: esc(fmtDistance(Math.max(0, detour))) })}</div>
			<button class="ghost-btn wide" data-act="map-rations-call" data-k="${lowRow.k}" title="${T('Thread a call at {name} into the run before the pool runs low', { name: esc(gameName(wharf.name)) })}">${T('Put in a rations call after stop {n}', { n: lowRow.n })}</button>` : ''}`;
	}
	return `<div>${head}${use}${low}</div>`;
}

/** How many exchanges a stop allows for what you are there for: the
 *  most any of its offers allows, the rung's cap where the codex
 *  states none. */
function triesAt(id, marks) {
	const mm = marks.get(id);
	const goods = goodsOf(id).filter(g => !mm || !mm.items.size || mm.items.has(g.item));
	return Math.max(0, ...goods.map(g => triesFor(g.item, Number(g.tries) || 0))) || 2;
}

/** The trade goods in the hold right now: name, level, count, weight.
 *  The hold, not every storage: a good put ashore at Velia weighs
 *  nothing on a run out of Iliya, and the Barter tab reads it the same
 *  way. */
function heldGoods() {
	const out = [];
	for (const [name, qty] of Object.entries(aboardStock(store))) {
		const lv = levelOf(name);
		if (!lv || !qty) continue;
		out.push({ name, lv, qty, weight: (GOODS[lv] ? GOODS[lv].weight : 0) * qty });
	}
	return out.sort((a, b) => b.lv - a.lv || a.name.localeCompare(b.name));
}

/** How many of one good are aboard. */
function aboardOf(name) {
	return aboardStock(store)[name] || 0;
}

/** What a stop wants handed over, against what is aboard. */
/** What a Barter-tab run calls at a stop for, on its row. */
function runLine(t) {
	return `<span class="map-row-sub ok">${esc(t.giveText)}× ${esc(gameName(t.give))} → ${esc(t.recvText)}× ${esc(gameName(t.item))}${t.times > 1 ? T(', {n} times', { n: t.times }) : ''}</span>`;
}

/** A count that may be a fraction of a good, kept to one place. */
export const n1 = v => F(Math.round(v * 10) / 10);

/** A wharf call on the route list: what is left in storage there, and
 *  what the [Level 7]s aboard fetch, with none of a barterer's
 *  furniture -- there is nothing to trade at a wharf. */
function stashRow(s, leg, k = -1, extra = '') {
	const c = s.place;
	const drops = c.drops.map(d => `<span class="map-drop">${img(d.item, 'map-icon')}<b>${n1(d.n)}×</b>${esc(gameName(d.item))}</span>`).join('');
	const questsHere = (c.quests || []).length ? `<span class="map-quests">${c.quests.map(q => `<span class="map-quest">📜 ${esc(gameName(q))}</span>`).join('')}</span>` : '';
	const questOnly = questsHere && !c.drops.length && !c.sale;
	return `<div class="map-stop-row stash${questOnly ? ' quest' : ''}${k === mv.stepIdx ? ' on' : ''}"${k >= 0 ? ` data-act="map-step" data-i="${k}" data-step-row role="button" tabindex="0" title="${T('Step to {place}', { place: esc(gameName(c.at)) })}"` : ''}>
		<span class="map-stop-n stash" title="${questOnly ? T('A stop put in for a quest') : c.rations ? T('A call for rations') : T('A pause at a wharf')}">${questOnly ? '📜' : c.rations ? '🍞' : '⚓'}</span>
		<span class="map-row-main">
			<span class="map-row-name"><span class="map-row-name-t">${esc(gameName(c.name))}</span>${leg}</span>
			<span class="map-row-sub">${T('stop {n}', { n: s.n })} · ${questOnly ? esc(gameName(c.at)) : T('{place} wharf', { place: esc(gameName(c.at)) })}${questOnly ? ` · ${T('a quest handed in here')}` : c.rations ? ` · ${T('rations bought here, the pool full again')}` : c.drops.length ? ` · ${T('the hold is lightened here')}` : ` · ${T('the hold is sold down here')}`}</span>
			${drops ? `<span class="map-drops">${drops}</span>` : ''}
			${c.sale ? `<span class="map-row-sub ok">${c.silver ? T('sells {n} [Level 7] for {silver}', { n: n1(c.sale), silver: FC(c.silver) }) : T('sells {n} [Level 7]', { n: n1(c.sale) })}</span>` : ''}
			${questsHere}${extra}
		</span>
	</div>`;
}

function cargoLine(id, has) {
	if (!has || !has.items.size) return '';
	const gives = [...new Set([...has.items.values()].flatMap(set => [...set]))].filter(g => /^\[Level/.test(g));
	if (!gives.length) return '';
	const aboard = gives.filter(g => aboardOf(g) > 0);
	return aboard.length
		? `<span class="map-row-sub ok">${T('aboard: {list}', { list: esc(aboard.map(g => `${F(aboardOf(g))}× ${gameName(g)}`).join(', ')) })}</span>`
		: `<span class="map-row-sub warn">${T('hands over {list} — none aboard', { list: esc(gives.map(gameName).join(` ${T('or')} `)) })}</span>`;
}

function cargoTile(hold) {
	const goods = heldGoods();
	if (!goods.length) return '';
	const n = goods.reduce((a, g) => a + g.qty, 0);
	const w = goods.reduce((a, g) => a + g.weight, 0);
	const overW = hold && w > hold.weight;
	return `<div><div class="summary-k">${T('Cargo')}</div><div class="summary-v${overW ? ' amber' : ''}">${T('{n} goods', { n: F(n) })}</div>
		<div class="summary-sub">${hold ? T('{lt} LT of {free} free', { lt: F(w), free: F(hold.weight) }) : T('{lt} LT', { lt: F(w) })}${overW ? ` · ${T('over the limit — the ship slows')}` : ''} · ${esc(goods.map(g => `${F(g.qty)}× Lv${g.lv}`).join(', '))}</div></div>`;
}

/* ------------------------------------------------------------------ *
 * the loop's ledger: what it hands over, what it brings in, its worth
 * ------------------------------------------------------------------ */

/**
 * The exchanges a stop is sailed for: for each thing on the list the
 * island deals, the offer that pays best per good handed over --
 * quantities as averages of the game's ranges, one press each.
 */
/** A run's trades as they travel: rows of [npc, give, giveText, item,
 *  recvText, recv, giveN, times], kept only where they name a barterer
 *  and a good, keyed by the barterer. */
export function readTrades(rows) {
	const out = {};
	for (const r of Array.isArray(rows) ? rows : []) {
		if (!Array.isArray(r) || !npcById.has(Number(r[0])) || typeof r[1] !== 'string' || typeof r[3] !== 'string') continue;
		out[Number(r[0])] = { give: r[1], giveText: String(r[2] ?? ''), item: r[3], recvText: String(r[4] ?? ''), recv: Number(r[5]) || 1, giveN: Number(r[6]) || 1, times: Math.max(1, Number(r[7]) || 1) };
	}
	return out;
}

/**
 * A run's wharf calls as they travel: rows of [after, name, at, x, y,
 * drops, sale, silver], where `after` is how many islands are sailed
 * before the call. A call is a pause, not a barter -- the hold is
 * lightened into storage and the [Level 7]s are sold -- so it carries
 * no npc and lives beside the stops rather than among them.
 */
export function readStash(rows) {
	const out = [];
	for (const r of Array.isArray(rows) ? rows : []) {
		if (!Array.isArray(r)) continue;
		const [i, name, at, x, y, drops, sale, silver, quests, why] = r;
		if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) continue;
		out.push({
			// A call put in for rations: nothing is dropped or sold, the
			// pool is filled, and the row says so.
			rations: why === 'rations',
			// The quests handed in at this call, as the Barter tab laid
			// them: a call put in for a quest carries them and nothing else.
			quests: (Array.isArray(quests) ? quests : []).filter(q => typeof q === 'string' && q).map(q => q.slice(0, 80)).slice(0, 12),
			i: Math.max(0, Math.floor(Number(i)) || 0),
			name: String(name || 'Wharf').slice(0, 40),
			at: String(at || '').slice(0, 40),
			x: Number(x), y: Number(y),
			drops: (Array.isArray(drops) ? drops : [])
				.filter(d => Array.isArray(d) && typeof d[0] === 'string' && Number(d[1]) > 0)
				.map(d => ({ item: d[0], n: Number(d[1]) })).slice(0, 12),
			sale: Math.max(0, Number(sale) || 0),
			silver: Math.max(0, Number(silver) || 0)
		});
	}
	return out.sort((a, b) => a.i - b.i).slice(0, 16);
}

/** The wharf calls as readStash takes them back: what a link, a saved
 *  route and the browser's own copy all carry. */
function stashRows() {
	return mv.runStash.map(c => [c.i, c.name, c.at, c.x, c.y, c.drops.map(d => [d.item, d.n]), c.sale, c.silver, c.quests || [], c.rations ? 'rations' : '']);
}

/** Whether the run's wharf calls belong to the route as it stands.
 *  They are the Barter tab's reading of one plotted run: edit the
 *  stops by hand and they are dropped rather than left pointing at a
 *  route that no longer passes them. */
export function stashLive() {
	return mv.runStash.length > 0 && stopsLive();
}

/**
 * The run in sailing order: the islands plotted, with the wharf calls
 * threaded in where they fall, each carrying the number it wears on
 * the chart. With no calls this is the list of stops and the numbers
 * are the stop numbers, exactly as before -- and with them, the chart
 * counts the way the Barter tab's timeline does, storage pauses
 * included.
 */
export function routeSeq(marks) {
	const ids = routeIds(marks);
	const calls = stashLive() ? mv.runStash : [];
	const out = [];
	let c = 0;
	for (let k = 0; k <= ids.length; k++) {
		while (c < calls.length && calls[c].i <= k) { out.push({ kind: 'stash', k: c, place: calls[c] }); c++; }
		if (k < ids.length) out.push({ kind: 'npc', id: ids[k], place: npcById.get(ids[k]) });
	}
	// A call pinned past the end of a shortened route still gets sailed
	// to, at the end, rather than quietly vanishing.
	while (c < calls.length) { out.push({ kind: 'stash', k: c, place: calls[c] }); c++; }
	return out.filter(s => s.place).map((s, n) => ({ ...s, n: n + 1 }));
}

function stopTrades(id, marks) {
	const has = marks.get(id);
	if (!has || !has.items.size) return [];
	const best = new Map();
	for (const g of goodsOf(id)) {
		if (!has.items.has(g.item) || !g.give) continue;
		const recv = amount(g.recvQty), giveN = amount(g.giveQty);
		if (!(recv > 0) || !(giveN > 0)) continue;
		const rate = recv / giveN;
		if (!best.has(g.item) || rate > best.get(g.item).rate) best.set(g.item, { item: g.item, give: g.give, recv, giveN, rate });
	}
	return [...best.values()];
}

/** The hold after this stop's exchanges, on a stop's row. */
function holdAfter(entry, hold) {
	if (!entry || !entry.trades || !entry.change) return '';
	const over = entry.after > hold.free;
	const dead = entry.after > hold.max;
	return `<span class="map-row-sub${dead ? ' warn' : over ? ' amber' : ''}" title="${T('Goods only: what this stop takes aboard and hands over, on top of what was there')}">${dead ? T('hold after: {lt} LT — more than the hull will move under', { lt: F(Math.max(0, entry.after)) }) : over ? T('hold after: {lt} LT — overweight, slower', { lt: F(Math.max(0, entry.after)) }) : T('hold after: {lt} LT', { lt: F(Math.max(0, entry.after)) })}</span>`;
}

/**
 * What the loop is worth: goods received at what a barterer pays for
 * them, materials at what the market pays where it has said, less the
 * goods handed over -- and, when the legs are timed, an hour's worth.
 */
function worthTile(l, seconds) {
	if (!mv.stops.length || (!l.goodsIn && !l.goodsOut && !l.mats)) return '';
	const F0 = n => FC(Math.round(Math.abs(n)));
	const n = v => F(Math.round(v));
	const priced = l.inValue + l.matValue;
	const bits = [];
	if (l.goodsIn) bits.push(l.goodsIn === 1 ? T('{n} good aboard, worth {value}', { n: n(l.goodsIn), value: F0(l.inValue) }) : T('{n} goods aboard, worth {value}', { n: n(l.goodsIn), value: F0(l.inValue) }));
	if (l.mats) {
		const some = l.unpriced && l.unpriced < l.mats;
		bits.push(`${l.matValue
			? (l.mats === 1 ? T('{n} material at the market\'s {value}', { n: n(l.mats), value: F0(l.matValue) }) : T('{n} materials at the market\'s {value}', { n: n(l.mats), value: F0(l.matValue) }))
			: (l.mats === 1 ? T('{n} material', { n: n(l.mats) }) : T('{n} materials', { n: n(l.mats) }))}${some ? T(', {n} of them unpriced', { n: n(l.unpriced) }) : l.unpriced ? T(', none the market prices') : ''}`);
	}
	if (l.goodsOut) bits.push(l.goodsOut === 1 ? T('{n} good handed over, worth {value} had they been sold', { n: n(l.goodsOut), value: F0(l.outValue) }) : T('{n} goods handed over, worth {value} had they been sold', { n: n(l.goodsOut), value: F0(l.outValue) }));
	// A headline only when something coming aboard has a price: a loop
	// for stones the market never sells is not "worth minus the goods".
	let head, sub = '';
	if (priced > 0) {
		head = `<div class="summary-v${l.net < 0 ? ' amber' : ''}">${l.net < 0 ? '−' : ''}${F0(l.net)}</div>`;
		const rate = perHour(l.net, seconds);
		if (rate !== null && l.net > 0) sub = `<div class="summary-sub">${T('≈ <b>{rate}</b> an hour under way, at the middle of the time range', { rate: F0(rate) })}</div>`;
	} else {
		head = `<div class="summary-v">${l.mats === 1 ? T('{n} material', { n: n(l.mats) }) : T('{n} materials', { n: n(l.mats) })}</div>`;
	}
	return `<div><div class="summary-k">${T('Worth')}</div>${head}
		<div class="summary-sub">${esc(bits.join(' · '))}</div>${sub}</div>`;
}

/**
 * What to carry out of port: every good the loop hands over, how many
 * are aboard already, and where the rest are dealt -- the island that
 * hands the good over and what it takes for it, from the same table.
 */
function carryBlock(l) {
	if (!l.carry.size) return '';
	const rows = [...l.carry].sort((a, b) => (levelOf(b[0]) || 0) - (levelOf(a[0]) || 0) || a[0].localeCompare(b[0])).map(([give, n]) => {
		const need = Math.ceil(n);
		const have = aboardOf(give);
		const short = Math.max(0, need - have);
		const lower = bestExchange(give, barterData);
		const from = lower ? T('{npc} hands it over for {give}', { npc: gameName(lower.npc), give: gameName(lower.give) }) : T('bought on land');
		return `<div class="map-carry-row${short ? '' : ' ok'}">
			${img(give, 'map-icon')}
			<span class="map-row-main"><span class="map-row-name">${F(need)}× ${esc(gameName(give))}</span>
				<span class="map-row-sub">${have ? T('goods|{n} aboard', { n: F(have) }) : T('none aboard')}${short ? ` · ${T('{n} to get — {from}', { n: F(short), from: esc(from) })}` : ` · ${T('enough')}`}</span></span>
		</div>`;
	}).join('');
	const kinds = l.carry.size;
	const short = [...l.carry].filter(([give, q]) => aboardOf(give) < Math.ceil(q)).length;
	return `<details class="map-carry"${kinds <= 6 ? ' open' : ''}><summary class="summary-k">${T('Carry out of port')} <span class="map-courses-credit">${kinds === 1 ? T('{n} kind the loop hands over', { n: kinds }) : T('{n} kinds the loop hands over', { n: kinds })}${short ? T(', {n} not aboard', { n: short }) : T(', all aboard')}</span></summary>${rows}</details>`;
}

/* ------------------------------------------------------------------ *
 * routes kept by name
 * ------------------------------------------------------------------ */

function savedRow(r, load, del, sub = '') {
	return `<div class="map-saved-row${sub ? ' prev' : ''}">
		<button class="map-row saved" data-act="${load.act}"${load.i !== undefined ? ` data-i="${load.i}"` : ''} title="${r.pick ? T('Plot this route (for {pick})', { pick: esc(gameName(r.pick)) }) : T('Plot this route')}">
			<span class="map-row-main"><span class="map-row-name">${esc(r.name)}</span>
			<span class="map-row-sub">${r.stops.length === 1 ? T('{n} stop', { n: r.stops.length }) : T('{n} stops', { n: r.stops.length })}${r.pick ? ` · ${esc(gameName(r.pick))}` : ''}${r.startPort && ports.find(p => p.id === r.startPort) ? ` · ${T('from {port}', { port: esc(gameName(ports.find(p => p.id === r.startPort).name)) })}` : ''}${sub}</span></span>
		</button>
		<button class="map-x" data-act="${del.act}"${del.i !== undefined ? ` data-i="${del.i}"` : ''} aria-label="${T('Forget {name}', { name: esc(r.name) })}">×</button>
	</div>`;
}

function savedHTML() {
	if (!mv.savedRoutes.length && !mv.prevRoute) return '';
	const rows = mv.savedRoutes.map((r, i) => savedRow(r, { act: 'map-route-load', i }, { act: 'map-route-del', i })).join('');
	// The previous plot is offered under the named ones, apart from
	// them: it is the one the next replot overwrites, and it takes none
	// of the eight.
	const prev = mv.prevRoute ? savedRow(mv.prevRoute, { act: 'map-route-prev' }, { act: 'map-route-prev-del' }, ` · ${T('the plot before this one; the next replot overwrites it')}`) : '';
	return `<div class="map-saved"><div class="summary-k">${T('Saved routes')}${mv.savedRoutes.length ? ` <span class="map-courses-credit">${T('{n} of {max}', { n: mv.savedRoutes.length, max: SAVED_MAX })}</span>` : ''}</div>${rows}${prev}</div>`;
}

/** The route as it stands, as a kept entry under `name`. */
function routeEntry(name, ids = mv.stops) {
	return { name, stops: [...ids], startPort: mv.startPort, returnHome: mv.returnHome, pick: mv.stopsPick || '', trades: Object.fromEntries(ids.filter(id => mv.runTrades[id]).map(id => [id, mv.runTrades[id]])), calls: stashRows(), at: new Date().toISOString().slice(0, 10) };
}

/** Keep the route under a name. False when the eight are taken by
 *  other names -- the caller asks which one to let go. */
function keepRoute(name, ids = mv.stops) {
	if (!ids.length) return true;
	const kept = keepNamed(mv.savedRoutes, routeEntry(name, ids));
	if (kept.full) return false;
	mv.savedRoutes = kept.list;
	return true;
}

/** A plot that is about to be replaced is kept as the previous route
 *  rather than thrown away -- one click to make is no reason to lose
 *  twenty minutes of choosing. It has a slot of its own, so keeping it
 *  never costs a route kept by name. */
export function stashRoute() {
	if (mv.stops.length > 1) mv.prevRoute = routeEntry(PREVIOUS);
}

/** The eight are taken: which one goes, to make room for `name`? */
function replaceRouteDialog(name) {
	const rows = mv.savedRoutes.map((r, i) => `<button class="map-row saved" data-replace="${i}">
			<span class="map-row-main"><span class="map-row-name">${esc(r.name)}</span>
			<span class="map-row-sub">${r.stops.length === 1 ? T('{n} stop', { n: r.stops.length }) : T('{n} stops', { n: r.stops.length })}${r.at ? ` · ${T('kept {date}', { date: esc(r.at) })}` : ''}</span></span>
		</button>`).join('');
	const host = openDialog(`
		<h2>${T('Which route makes room?')}</h2>
		<p class="dialog-copy">${T('{max} routes are kept by name and all {max} are taken. Choose the one to let go for “{name}”, or cancel and keep them all.', { max: SAVED_MAX, name: esc(name) })}</p>
		<div class="map-saved dialog-list">${rows}</div>
		<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Cancel')}</button></div>`);
	host.querySelectorAll('[data-replace]').forEach(btn => btn.addEventListener('click', () => {
		const i = Number(btn.dataset.replace);
		const gone = mv.savedRoutes[i];
		mv.savedRoutes = replaceAt(mv.savedRoutes, i, routeEntry(name));
		persist();
		closeDialog();
		refreshSide();
		toast(gone ? T('Kept as “{name}”, in place of “{gone}”', { name, gone: gone.name }) : T('Kept as “{name}”', { name }));
	}));
}

export function saveRouteDialog() {
	if (!mv.stops.length) return;
	const host = openDialog(`
		<h2>${T('Keep this route')}</h2>
		<p class="dialog-copy">${mv.stopsPick
			? (mv.stops.length === 1 ? T('{n} stop for {pick}', { n: mv.stops.length, pick: esc(gameName(mv.stopsPick)) }) : T('{n} stops for {pick}', { n: mv.stops.length, pick: esc(gameName(mv.stopsPick)) }))
			: (mv.stops.length === 1 ? T('{n} stop', { n: mv.stops.length }) : T('{n} stops', { n: mv.stops.length }))}. ${T('Up to {max} routes are kept on this browser; the game itself keeps three loops.', { max: SAVED_MAX })}</p>
		<input class="field" type="text" maxlength="40" placeholder="${T('A name — “Tuesday coral run”')}" data-route-name>
		<div class="dialog-actions">
			<button class="ghost-btn" data-close>${T('Cancel')}</button>
			<button class="act" data-route-save>${T('Save')}</button>
		</div>`);
	const input = host.querySelector('[data-route-name]');
	input.focus();
	const save = () => {
		const name = input.value.trim();
		if (!name) return toast(T('Give it a name'));
		if (name === PREVIOUS) return toast(T('That name is the chart\'s own — give it another'));
		closeDialog();
		if (!keepRoute(name)) return replaceRouteDialog(name);
		persist();
		refreshSide();
		toast(T('Kept as “{name}”', { name }));
	};
	host.querySelector('[data-route-save]').addEventListener('click', save);
	input.addEventListener('keydown', evt => { if (evt.key === 'Enter') save(); });
}

export function loadPreviousRoute() {
	if (mv.prevRoute) plotSaved(mv.prevRoute);
}

export function deletePreviousRoute() {
	if (!mv.prevRoute) return;
	mv.prevRoute = null;
	persist();
	refreshSide();
	toast(T('Forgot the previous route'));
}

export function loadSavedRoute(i) {
	const r = mv.savedRoutes[i];
	if (r) plotSaved(r);
}

function plotSaved(r) {
	if (mv.stops.length && mv.stops.join('.') !== r.stops.join('.')) stashRoute();
	mv.stops = r.stops.filter(id => npcById.has(id));
	mv.runTrades = readTrades(Object.entries(r.trades || {}).map(([id, t]) => [Number(id), t.give, t.giveText, t.item, t.recvText, t.recv, t.giveN, t.times]));
	mv.runStash = readStash(r.calls || []);
	mv.startPort = ports.some(p => p.id === r.startPort) ? r.startPort : 0;
	mv.returnHome = r.returnHome === true;
	mv.mapPick = r.pick || null;
	mv.stopsPick = r.pick || '';
	mv.mode = 'route';
	mv.stepIdx = 0;
	mv.pendingFit = true;
	persist();
	refreshSide();
	paintMap();
}

export function deleteSavedRoute(i) {
	const r = mv.savedRoutes[i];
	if (!r) return;
	mv.savedRoutes = mv.savedRoutes.filter((_, k) => k !== i);
	persist();
	refreshSide();
	toast(T('Forgot “{name}”', { name: r.name }));
}

export function setTradesMode(m) {
	mv.tradesMode = m === 'all' ? 'all' : 'one';
	persist();
	refreshSide();
}

/** Drop the stops past what the Parley in the bar covers. */
export function trimRouteToParley() {
	const marks = marksNow();
	const prof = barterProfile();
	if (!prof.parleyHeld) return;
	const kept = [];
	let acc = 0;
	for (const id of mv.stops) {
		const c = stopParley(id, marks, prof);
		if (acc + c > prof.parleyHeld) break;
		acc += c;
		kept.push(id);
	}
	if (!kept.length || kept.length === mv.stops.length) return;
	stashRoute();
	mv.stops = kept;
	mv.runStash = [];
	persist();
	refreshSide();
	paintMap();
	toast(kept.length === 1 ? T('Trimmed to {n} stop — the full route is kept as “Previous route”', { n: kept.length }) : T('Trimmed to {n} stops — the full route is kept as “Previous route”', { n: kept.length }));
}

/* ------------------------------------------------------------------ *
 * a route in a link
 * ------------------------------------------------------------------ */

/** The route as a hash fragment the chart can read back: stops,
 *  start wharf, the return, and what it was plotted for. */
export function routeLink() {
	const parts = [`r=${mv.stops.join('.')}`];
	if (mv.startPort) parts.push(`s=${mv.startPort}`);
	if (mv.returnHome) parts.push('h=1');
	if (mv.stopsPick) parts.push(`p=${encodeURIComponent(mv.stopsPick)}`);
	const trades = mv.stops.filter(id => mv.runTrades[id]).map(id => { const t = mv.runTrades[id]; return [id, t.give, t.giveText, t.item, t.recvText, t.recv, t.giveN, t.times]; });
	if (trades.length) parts.push(`x=${encodeURIComponent(JSON.stringify(trades))}`);
	if (mv.runStash.length) parts.push(`w=${encodeURIComponent(JSON.stringify(stashRows()))}`);
	return `${location.origin}${location.pathname}#map/${parts.join(';')}`;
}

/** Read a link's fragment (the part after `#map/`) into the chart.
 *  Returns how many stops landed, 0 for nothing usable. */
export function applyMapLink(fragment) {
	const q = {};
	for (const part of String(fragment || '').split(';')) {
		const i = part.indexOf('=');
		if (i > 0) q[part.slice(0, i)] = part.slice(i + 1);
	}
	if (!q.r) return 0;
	const ids = [];
	for (const s of q.r.split('.')) {
		const id = Number(s);
		if (npcById.has(id) && !ids.includes(id)) ids.push(id);
	}
	if (!ids.length) return 0;
	restore();
	if (mv.stops.length && mv.stops.join('.') !== ids.join('.')) stashRoute();
	mv.stops = ids;
	mv.startPort = ports.some(p => p.id === Number(q.s)) ? Number(q.s) : 0;
	mv.returnHome = q.h === '1';
	let pick;
	try { pick = q.p ? decodeURIComponent(q.p) : null; } catch { pick = null; }
	mv.mapPick = pick;
	mv.stopsPick = pick || '';
	let trades;
	try { trades = q.x ? JSON.parse(decodeURIComponent(q.x)) : []; } catch { trades = []; }
	mv.runTrades = readTrades(trades);
	let calls;
	try { calls = q.w ? JSON.parse(decodeURIComponent(q.w)) : []; } catch { calls = []; }
	mv.runStash = readStash(calls);
	mv.mode = 'route';
	mv.panelOpen = true;
	mv.stepIdx = 0;
	mv.pendingFit = true;
	persist();
	return ids.length;
}

/** How to calibrate the clock: name a leg you have sailed and how long
 *  it took, and every other leg follows. */
export function openSailCal() {
	const marks = marksNow();
	const world = seaBent(routeWorld(marks));
	const legs = legLengths(world);
	const port = ports.find(p => p.id === mv.startPort);
	const names = [];
	const pts = routeIds(marks).map(id => npcById.get(id).at);
	if (port) names.push(port.name);
	names.push(...pts);
	if (port && mv.returnHome) names.push(port.name);
	const speed = routeSpeed();
	const options = legs.map((m, i) => `<option value="${m}">${esc(gameName(names[i]) || '?')} → ${esc(gameName(names[i + 1]) || '?')} · ${esc(fmtDistance(m))}</option>`).join('');
	const host = openDialog(`
		<h2>${T('How fast is 100%?')}</h2>
		<p class="dialog-copy">${speed
			? T('The game gives speed as a percentage and never says what 100% is in metres. The chart assumes <b>{def} m/s</b> and shows every time as a range a fifth either way; you are using <b>{now} m/s</b>. Time one leg in game at your {pct}% and the rest are corrected from it, with the range narrowed to a tenth.', { def: DEFAULT_CAL, now: sailCal(), pct: speed.total })
			: T('The game gives speed as a percentage and never says what 100% is in metres. The chart assumes <b>{def} m/s</b> and shows every time as a range a fifth either way; you are using <b>{now} m/s</b>. Time one leg in game and the rest are corrected from it, with the range narrowed to a tenth.', { def: DEFAULT_CAL, now: sailCal() })}</p>
		${legs.length ? `<label class="dialog-label">${T('Leg {select}', { select: `<select class="field select" data-cal-leg>${options}</select>` })}</label>` : `<p class="dialog-copy">${T('Plot a route first, then time one of its legs.')}</p>`}
		<label class="dialog-label">${T('Took {input} minutes', { input: `<input class="field" type="text" inputmode="decimal" placeholder="${T('minutes, e.g. 6.5')}" data-cal-min>` })}</label>
		<div class="dialog-actions">
			<button class="ghost-btn" data-cal-reset>${T('Back to {v} m/s', { v: DEFAULT_CAL })}</button>
			<button class="ghost-btn" data-close>${T('Cancel')}</button>
			<button class="act" data-cal-save${legs.length ? '' : ' disabled'}>${T('Set')}</button>
		</div>`);
	host.querySelector('[data-cal-reset]').addEventListener('click', () => {
		store.setSetting('sailCal', null);
		closeDialog();
		refreshSide();
		toast(T('Back to {v} m/s at 100%', { v: DEFAULT_CAL }));
	});
	host.querySelector('[data-cal-save]').addEventListener('click', () => {
		const metres = Number(host.querySelector('[data-cal-leg]').value);
		const minutes = Number(String(host.querySelector('[data-cal-min]').value).replace(',', '.'));
		const v = calibrate(metres, minutes * 60, speed ? speed.total : 100);
		if (!v) return toast(T('Give the minutes that leg took'));
		store.setSetting('sailCal', v);
		closeDialog();
		refreshSide();
		paintMap();
		toast(T('100% is now {v} m/s on this chart', { v }));
	});
}

/** The pool as typed on the Route tab; blank or nonsense means full. */
export function setRationsAboard(value) {
	const n = Number(String(value).replace(/[^\d.]/g, ''));
	mv.rationsAboard = Number.isFinite(n) && n >= 0 && String(value).trim() !== '' ? Math.round(n) : null;
	persist();
	refreshSide();
}

/**
 * Thread a call for rations into the run after the row at `k`: at the
 * nearest wharf manager to that stop, the way the Barter tab's storage
 * calls are threaded -- as a call that drops nothing and sells nothing,
 * marked for what it is.
 */
export function putRationsCall(k) {
	const seq = routeSeq(marksNow());
	const row = seq[k];
	if (!row) return;
	const wharf = nearestWharf(row.place.x, row.place.y, 'wharf');
	if (!wharf) return;
	// `i` is how many islands are sailed before the call.
	const isles = seq.slice(0, k + 1).filter(r => r.kind === 'npc').length;
	const call = readStash([[isles, wharf.name, wharf.at, wharf.x, wharf.y, [], 0, 0, [], 'rations']])[0];
	if (!call) return;
	if (mv.runStash.some(c => c.rations && c.i === call.i && c.name === call.name)) return toast(T('That call is already in the run'));
	mv.runStash = [...mv.runStash, call].sort((a, b) => a.i - b.i);
	persist();
	refreshSide();
	paintMap();
	toast(T('A call at {name} for rations, after stop {n}', { name: gameName(wharf.name), n: row.n }));
}

/** The ration drain, calibrated: the pool fell N over a leg of M
 *  minutes -- the same shape as timing a leg for the speed. */
export function openRationCal() {
	const me = currentShip();
	const host = openDialog(`
		<h2>${T('How fast does the pool fall?')}</h2>
		<p class="dialog-copy">${T('The game never says what a minute under sail costs in rations. The chart assumes <b>{def} a minute</b> at full sail and shows every figure as a range half either way; you are using <b>{now} a minute</b>. Watch the pool over one leg — what it read when you set off and when you arrived — and the rest follow from it, with the range narrowed to ±15%.', { def: F(DEFAULT_RATION_RATE), now: F(rationRate()) })} ${me.crew.appetite ? T('The crew\'s {n} a day is taken out of the figure.', { n: F(me.crew.appetite) }) : ''}</p>
		<label class="dialog-label">${T('The pool fell by {input}', { input: `<input class="field" type="text" inputmode="numeric" placeholder="${T('rations, e.g. 45000')}" data-rcal-fell>` })}</label>
		<label class="dialog-label">${T('over {input} minutes under sail', { input: `<input class="field" type="text" inputmode="decimal" placeholder="${T('minutes, e.g. 6.5')}" data-rcal-min>` })}</label>
		<div class="dialog-actions">
			<button class="ghost-btn" data-rcal-reset>${T('Back to {v} a minute', { v: F(DEFAULT_RATION_RATE) })}</button>
			<button class="ghost-btn" data-close>${T('Cancel')}</button>
			<button class="act" data-rcal-save>${T('Set')}</button>
		</div>`);
	host.querySelector('[data-rcal-reset]').addEventListener('click', () => {
		store.setSetting('rationCal', null);
		closeDialog();
		refreshSide();
		toast(T('Back to {v} rations a minute', { v: F(DEFAULT_RATION_RATE) }));
	});
	host.querySelector('[data-rcal-save]').addEventListener('click', () => {
		const fell = Number(String(host.querySelector('[data-rcal-fell]').value).replace(/[^\d.]/g, ''));
		const minutes = Number(String(host.querySelector('[data-rcal-min]').value).replace(',', '.'));
		const v = calibrateRations(fell, minutes, me.crew.appetite);
		if (!v) return toast(T('Give how far the pool fell, and over how many minutes'));
		store.setSetting('rationCal', v);
		closeDialog();
		refreshSide();
		toast(T('The pool falls {v} a minute on this chart', { v: F(v) }));
	});
}

/* ------------------------------------------------------------------ *
 * a route as a file
 * ------------------------------------------------------------------ */

/**
 * The plotted route as JSON: the stops by barterer id and name, where
 * it sails from, and whether it comes home. Names ride along so the
 * file reads as a route to a person and survives an id the data no
 * longer has; ids are what import trusts.
 */
export function exportRoute() {
	const ids = stopsLive() ? mv.stops : [];
	return JSON.stringify({
		app: 'bdo-ship-upgrade-tracker',
		kind: 'barter-route',
		version: 1,
		exported: new Date().toISOString(),
		for: mv.mapPick || null,
		start: ports.find(p => p.id === mv.startPort) ? { id: mv.startPort, name: ports.find(p => p.id === mv.startPort).name } : null,
		returnHome: mv.returnHome,
		stops: ids.map(id => {
			const n = npcById.get(id);
			return { npc: id, name: n ? n.name : null, at: n ? n.at : null };
		}),
		// The pauses a planned run makes between those stops: a wharf,
		// how many islands are sailed before it, and what is left there.
		calls: stashLive() ? mv.runStash.map(c => ({
			after: c.i, name: c.name, at: c.at, x: c.x, y: c.y,
			leaves: c.drops.map(d => ({ item: d.item, n: d.n })),
			sells: c.sale, silver: c.silver
		})) : []
	}, null, 2);
}

/**
 * Take a route file back in. Stops unknown to the chart are dropped
 * and counted, so a file from a newer dataset still lands; the route
 * is plotted under whatever the chart is currently showing.
 */
export function importRoute(text) {
	// The game's own file, or a piece of it, is read the other way round.
	if (looksLikeGameXML(text)) {
		const r = gameImportRead(text);
		openGameImport();
		return { stops: r.sets.reduce((n, g) => n + g.points.length, 0), dropped: r.dropped, game: true };
	}
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('That file is not valid JSON.');
	}
	if (data && data.kind === 'trace') {
		const t = applyTraceObject(data);
		if (!t) throw new Error('That trace file is empty.');
		return { stops: t.points.length, dropped: 0, trace: true };
	}
	if (!data || data.kind !== 'barter-route' || !Array.isArray(data.stops)) {
		throw new Error('That file does not hold a barter route or a trace.');
	}
	const ids = [];
	let dropped = 0;
	for (const s of data.stops) {
		const id = Number(s && (s.npc ?? s.id));
		if (npcById.has(id) && !ids.includes(id)) ids.push(id);
		else dropped++;
	}
	if (!ids.length) throw new Error('None of those stops is on this chart.');
	if (mv.stops.length && mv.stops.join('.') !== ids.join('.')) stashRoute();
	mv.stops = ids;
	mv.runTrades = {};
	mv.runStash = readStash((Array.isArray(data.calls) ? data.calls : [])
		.map(c => [c.after, c.name, c.at, c.x, c.y, (c.leaves || []).map(d => [d.item, d.n]), c.sells, c.silver]));
	mv.stopsPick = mv.mapPick || '';
	mv.startPort = data.start && ports.some(p => p.id === Number(data.start.id)) ? Number(data.start.id) : 0;
	mv.returnHome = data.returnHome === true;
	mv.mode = 'route';
	mv.stepIdx = 0;
	persist();
	return { stops: ids.length, dropped };
}
