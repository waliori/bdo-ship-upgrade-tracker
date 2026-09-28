// Sailing a run: the steps across the head, the cockpit at one stop at a
// time, the Parley and the clock at that stop, the hold slot by slot, and
// the rest of the run under it. (Casting off, seen, is setsail.js.)

import { esc, F, FC } from '../fmt.js';
import { T, gameName } from '../i18n.js';
import { img, iconSrc } from '../ui-bits.js';
import { barterProfile } from '../ui-state.js';
import { currentShip, shownHold } from '../ship.js';
import { shipStats } from '../ship_stats.js';
import { isleOf, whoOf } from '../barter_npcs.js';
import { fmtDistance } from '../sailing.js';
import { paceNow, LEARN_AT, timingLegs } from '../ship-pace.js';
import { questDone } from '../screen-quests.js';
import { PARLEY, COIN, levelOf } from '../barter.js';
import { VOUCHER_COOLDOWN_MIN } from '../parley-ledger.js';
import { V } from './state.js';
import { timerHTML, timerState, spanText } from '../sail-timer.js';
import { weightOf } from '../barter-plan.js';
import { parleyOf, ordersNow } from './plan.js';
import { placeOf, legsOf, questWanted, tradesDone, questChip, n1, TIER, ledgerOf, doneLabel, sevenOf, fourNote, stopDid, stopAsks } from './route.js';
import { sailing, stopKey, ticked, runLabel, runMarks, PAID_CHIPS, owesCount, rangeOf, paidAsk, unsaid, sailedPlan, aboardNow, stopEffects } from './sail.js';
import { VOUCHER } from './view.js';

/* ------------------------------------------------------------------ *
 * the four steps
 * ------------------------------------------------------------------ */

/**
 * A step changed is a page turned, and the new page starts at its top.
 * The redraw swaps the step in place, so the window stayed wherever the
 * last one had been scrolled to -- on a phone, half-way down a step the
 * sailor had not read the head of. After the redraw the steps across
 * the head come into view; a part of the plan opened comes to its own
 * head instead.
 */
/** A screen a phone's width: the long things start folded there. */
export const narrow = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 720px)').matches;

export function bringUp(sel) {
	if (typeof document === 'undefined') return;
	setTimeout(() => {
		const el = document.querySelector(sel);
		if (!el) return;
		const top = el.getBoundingClientRect().top + window.scrollY - 12;
		if (Math.abs(window.scrollY - top) > 40) window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
	}, 30);
}

/** The step on screen: the one asked for, else wherever the run is. */
/** A level's badge, as each language shortens it. */
export const lvTag = lv => T('L{lv}', { lv });

// A step kept from before a reload that has nothing left to show -- the
// Sail step, with the run it sailed gone -- is the plan.
export const stepNow = () => {
	const on = sailing();
	// Results is always there to open: with no run, it is the record of
	// the runs before -- today's boards, the week, every past run.
	if (V.step === 'sail' && !on) return 'plan';
	return V.step || (on ? 'sail' : 'plan');
};

/** The Parley the stops done have spent, as the recorder counts it. */
export function parleySpentOf(plan, on) {
	const perTrade = parleyOf(barterProfile()).perTrade;
	return Math.round(plan.stops.reduce((a, s, k) => a + (s.npcId && ticked(on.done, s, k, plan.stops) ? (Number(s.parley) > 0 ? Number(s.parley) : (Number(s.times) || 0) * perTrade) : 0), 0));
}

/** The stop the cockpit stands at: the one it was sent to, else the
 *  first not done and not passed over, else the first not done. */
export function stopAt(plan, on) {
	const keys = plan.stops.map((s, k) => stopKey(s, k, plan.stops));
	const done = k => ticked(on.done, plan.stops[k], k, plan.stops);
	if (V.cursor !== null && keys.includes(V.cursor)) return keys.indexOf(V.cursor);
	let at = keys.findIndex((key, k) => !done(k) && !V.skipped.has(key));
	if (at < 0) at = keys.findIndex((key, k) => !done(k));
	return at;
}

/** A stop's place and keeper, as the sheet names them. */
export function stopNames(s) {
	const place = placeOf(s);
	return {
		place: s.quest ? gameName(place.name) : s.wharf ? T('{at} wharf', { at: gameName(place.at) }) : gameName(isleOf(place)),
		who: s.quest ? gameName(place.who) : s.wharf ? gameName(place.name) : gameName(whoOf(place)),
		kind: s.wait ? T('a wait for a voucher') : s.wharf ? T('a wharf call') : s.hunt ? T('a hunt on the way') : s.quest ? T('a quest handed in') : s.item === COIN ? T('pays Crow Coins') : T('a barter')
	};
}

/** The four steps across the head of the page, each saying where it is. */
export function stepperHTML(parts, now) {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	const doneN = plan ? plan.stops.filter((s, k) => ticked(on.done, s, k, plan.stops)).length : 0;
	const at = plan ? stopAt(plan, on) : -1;
	const order = ['plan', 'load', 'sail', 'results'];
	// The number and the name are their own elements, so a narrow screen
	// can keep the numbers and drop the names from the steps you are not
	// on: four cards with their titles is a screenful of furniture
	// before the page begins.
	const cell = (id, n, k, title, sub) => `<button class="step${now === id ? ' on' : ''}${order.indexOf(id) < order.indexOf(now) ? ' past' : ''}" data-act="barter-step" data-id="${id}" aria-current="${now === id ? 'step' : 'false'}"><span class="step-k"><i>${n}</i><em>${k}</em></span><b>${title}</b><span class="step-sub">${sub}</span></button>`;
	return `<nav class="steps" aria-label="${T('The steps of a run')}">
		${cell('plan', 1, T('Plan'), T('What is today for?'), parts.secs[0][2])}
		${cell('load', 2, T('Load'), T('Pack at the wharf'), parts.stops ? (parts.things.later ? T('{n} to have aboard now · {m} picked up on the way', { n: parts.things.all, m: parts.things.later }) : parts.things.all === 1 ? T('{n} thing to have aboard', { n: parts.things.all }) : T('{n} things to have aboard', { n: parts.things.all })) : T('tick a chain first'))}
		${cell('sail', 3, T('step|Sail'), T('One stop at a time'), plan ? (at >= 0 ? T('stop {n} of {of}', { n: at + 1, of: plan.stops.length }) : T('every stop ticked')) : parts.stops ? `${parts.stops === 1 ? T('{n} stop', { n: parts.stops }) : T('{n} stops', { n: parts.stops })}${parts.time ? ` · ≈ ${esc(parts.time)}` : ''}` : T('nothing planned yet'))}
		${cell('results', 4, T('Results'), T('What the run did'), plan ? T('{n} of {of} stops done', { n: doneN, of: plan.stops.length }) : V.lastTrip ? T('recorded') : T('past runs'))}
	</nav>`;
}

/** A run under way, said on every step but its own. */
export function underWayHTML(now) {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	if (!plan || now === 'sail' || now === 'results') return '';
	const at = stopAt(plan, on);
	// The clock rides along: away from the cockpit it is the one figure
	// about a run under way that changes on its own.
	const t = timerState();
	return `<button class="under-way" data-act="barter-step" data-id="sail"><i></i><b>${T('Run in progress')}</b><span>${at >= 0 ? T('stop {n} of {of}', { n: at + 1, of: plan.stops.length }) : T('every stop ticked')}</span>${t ? `<span class="under-way-clock">⏱ ${esc(spanText(t.ran))}</span>` : ''}<span class="amber">${T('not recorded')}</span><span class="panel-spacer"></span><span class="linky">${T('Back to the run')} ›</span></button>`;
}

/** What the last Record did, until the next run is cast off. */
export function recordedHTML() {
	if (!V.lastTrip || sailing()) return '';
	return `<div class="recorded-strip"><i>✓</i><span>${T('Trip recorded')}${V.lastTrip.net ? ` · ${T('Silver')} <b class="gold">${V.lastTrip.net > 0 ? '+' : '−'}${FC(Math.abs(V.lastTrip.net))}</b>` : ''}${V.lastTrip.coins ? ` · <b class="gold">+${F(V.lastTrip.coins)}</b> ${T('coins')}` : ''} · ${T('inventory, storage and Parley moved together.')}</span><span class="panel-spacer"></span><button class="linky" data-act="barter-undo-record">↶ ${T('Undo')}</button><button class="map-x" data-act="barter-recorded-ok" aria-label="${T('Close')}">×</button></div>`;
}

/**
 * What the Parley ledger has to say about a stop, in words: a voucher
 * drawn on there; a wait for its cooldown before one can be, with the
 * whole of the rest of the run coming that much later; or the bar run
 * dry with nothing to put it back, and the stops after it standing.
 * The bars showed the quarter jump and the red figure and said
 * nothing, which on a list of sixty stops is nothing at all. `cls` is
 * for the row, `tag` for its head, `note` the sentence under it.
 */
export function parleyNotes(book, k, s) {
	const row = book && book.rows[k];
	if (!row) return { cls: '', tag: '', note: '' };
	const icon = img(VOUCHER, 'voucher-icon');
	if (s && s.wait) {
		return { cls: 'wait', tag: `<i class="rest-tag amber" title="${T('The bar runs short here; the ship waits for the voucher’s cooldown')}">⏳ ${T('waits {n} min', { n: F(s.wait) })}${row.voucher ? ` · ${icon}` : ''}</i>`,
			note: `<span class="run-note amber parley-note">${T('The bar is short for the next barter: wait here <b>{n} min</b> for the voucher’s cooldown, draw one, and trade on — or end the run here.', { n: F(s.wait) })}</span>` };
	}
	if (row.wait) {
		const then = row.drawn > 1 ? T('draws on {n} vouchers, and trades', { n: row.drawn }) : T('draws on a voucher, and trades');
		return { cls: 'wait', tag: `<i class="rest-tag amber" title="${T('The bar runs short here; the ship waits for the voucher’s cooldown')}">⏳ ${T('waits {n} min', { n: F(row.wait) })}</i>`,
			note: `<span class="run-note amber parley-note">${T('The bar runs short here — the ship waits <b>{n} min</b> for the voucher’s cooldown, {then}. Every stop after comes that much later.', { n: F(row.wait), then })}</span>` };
	}
	if (row.voucher) return { cls: 'voucher', tag: `<i class="rest-tag teal" title="${T('a voucher drawn on here — a quarter of a bar back')}">${icon} ${T('voucher')}</i>`, note: `<span class="run-note teal parley-note">${icon} ${T('a voucher drawn on here — a quarter of a bar back')}</span>` };
	if (row.dry && k === book.dryAt) {
		const why = ordersNow().vouchers === 'keep' ? T('the vouchers are kept') : T('there is no voucher to draw on');
		return { cls: 'short', tag: `<i class="rest-tag warn">${T('{n} Parley short', { n: F(row.short) })}</i>`,
			note: `<span class="run-note warn parley-note">${T('{n} Parley short, and {why} — the bar runs dry here. This barter and every one after it wait for tomorrow’s bar; the run is what stands above this line.', { n: F(row.short), why })}</span>` };
	}
	if (row.dry) return { cls: 'dry', tag: `<i class="rest-tag warn">${T('waits for Parley')}</i>`, note: `<span class="run-note warn parley-note">${T('Not paid for — the bar ran dry at stop {n}.', { n: book.dryAt + 1 })}</span>` };
	return { cls: '', tag: '', note: '' };
}

/**
 * A wait's clock, counting down in place: the voucher's cooldown runs
 * from the press that drew the last one, else the wait is counted from
 * the stop before it. The figure moves once a second without a repaint,
 * as the run's own clock does, and stops when there is none on screen.
 */
const COOLDOWN_MS = VOUCHER_COOLDOWN_MIN * 60000;
function readyAt(on, s) {
	if (on && on.drawnAt) return on.drawnAt + COOLDOWN_MS;
	if (on && on.lastTick) return on.lastTick + s.wait * 60000;
	return 0;
}
const untilText = ms => (ms > 0 ? spanText(Math.ceil(ms / 1000)) : T('now'));
function tickUntil() {
	const els = typeof document !== 'undefined' ? document.querySelectorAll('[data-until]') : [];
	if (!els.length) { if (V.untilBeat) { clearInterval(V.untilBeat); V.untilBeat = null; } return; }
	for (const el of els) el.textContent = untilText(Number(el.dataset.until) - Date.now());
	if (!V.untilBeat) V.untilBeat = setInterval(tickUntil, 1000);
}

/** The mini bars a stop carries: the hold after it and the Parley. */
function stopBars(s, row, weight = s.weightAfter) {
	const w = shownHold(s.hold || currentShip().hold, weight);
	const bad = w.state === 'heavy' || w.state === 'dead', over = w.state === 'over';
	return { w, bad, over, hold: `<div class="mini-bar"><div><span>${T('hold')}</span><b class="${bad ? 'warn' : over ? 'amber' : ''}">${esc(w.text)}</b></div><div class="run-bar"><i style="width:${w.fill.toFixed(1)}%"></i><i class="over" style="width:${w.extra.toFixed(1)}%"></i><i class="heavy" style="width:${w.worse.toFixed(1)}%"></i></div></div>`,
		parley: row ? `<div class="mini-bar"><div><span>${T('parley')}</span><b class="${row.short ? 'warn' : ''}">${F(row.after)}</b></div><div class="run-bar parley"><i style="width:${Math.min(100, row.pct).toFixed(1)}%"></i></div></div>` : '' };
}

/**
 * The hold along the run, read from the Inventory rather than from the
 * plan. The plan weighs the hold as it laid the run -- at the least an
 * island pays, without what the sailor carries that no chain takes --
 * and the ship's window said 8,011 LT where the cockpit said 7,011.
 * So the hold as it stands is the start, each stop's own effect is the
 * trip with it ticked against the trip without, and a stop's after is
 * the hold now, less the stops ticked after it, plus the stops still
 * to make up to it. `around(k)` is one stop's before and after, good
 * by good: the hold now on one side of it, whichever side that is.
 */
const ltOf = m => [...m].reduce((a, [name, n]) => a + Math.max(0, n) * weightOf(name), 0);
// A stop's effect weighs what it hands over as much as what it takes on.
const ltMoved = m => [...m].reduce((a, [name, n]) => a + n * weightOf(name), 0);
function holdAlong(plan, on) {
	const stops = plan.stops;
	const now = aboardNow();
	const effects = stopEffects(plan, on);
	const eff = effects.map(ltMoved);
	const w0 = ltOf(now);
	const done = stops.map((s, k) => ticked(on.done, s, k, stops));
	const skip = stops.map((s, k) => V.skipped.has(stopKey(s, k, stops)));
	const after = stops.map((s, k) => eff.reduce((w, e, j) => w + (j <= k ? (done[j] || skip[j] ? 0 : e) : done[j] ? -e : 0), w0));
	const around = k => {
		const before = new Map(now), next = new Map(now);
		for (const [name, d] of effects[k] || []) {
			if (done[k]) before.set(name, (before.get(name) || 0) - d);
			else next.set(name, (next.get(name) || 0) + d);
		}
		return { before, after: next, done: done[k] };
	};
	return { after, around };
}

/**
 * The cockpit: one stop, large, with the one thing to press; the stop
 * after it; and the rest of the run down the side, each with its tick.
 * Glance mode is the same stop drawn to be read from across a room,
 * for a sailor who is at the game and only looks over.
 */
export function sailHTML() {
	return cockpitHTML();
}

/**
 * The cockpit: one stop at a time. `map` draws it for the chart's side
 * panel -- the same stop, the same press, the same figures, compact,
 * with the rest of the run folded under it and no glance mode -- so a
 * tick on either is the same tick, and the two never disagree about
 * where the ship is.
 */
/**
 * The press that says the ship is there. The clock only knows the
 * estimate; this is the one moment the game shows and the page cannot
 * see. Each press times the leg from the Traded that sent the ship off,
 * and the legs timed teach the chart what this ship really does.
 */
/** The switch for Arrived: off by default, for a sailor whose clock
 *  does not keep time with their ship. It says how far the ship's own
 *  figure has come. */
function timeLegsChip() {
	const on = timingLegs();
	const pace = paceNow();
	const said = pace.from === 'ship' ? T('your ship’s own speed') : pace.from === 'hand' ? T('the speed set by hand') : pace.n ? T('{n} of {of} legs timed', { n: pace.n, of: LEARN_AT }) : T('the usual speed');
	return `<button class="chip tiny time-legs${on ? ' active' : ''}" data-act="barter-time-legs" aria-pressed="${on}" title="${on ? T('Stop offering Arrived; the speed learned so far stays') : T('The clock rings before the ship arrives, or after? Press Arrived as each island is reached, and after {n} legs your ship’s own speed is used', { n: LEARN_AT })}">⏱ ${on ? T('timing my legs') : T('time my legs')} · ${esc(said)}</button>`;
}

function arrivedHTML(on, s, key, at, legs) {
	if (!timingLegs()) return '';
	const m = legs.from ? legs.legs[at] : at > 0 ? legs.legs[at - 1] : null;
	if (!(m > 0) || ticked(on.done, s, at, sailedPlan().stops)) return '';
	const got = (on.arrived || {})[key];
	if (got) return `<span class="arrived-said" title="${T('This leg is timed; the speed is learned from it')}">⚓ ${T('arrived in {t}', { t: esc(spanText(got)) })}</span>`;
	return `<button class="chip tiny arrived-btn" data-act="barter-arrived" data-k="${esc(key)}" data-at="${at}" title="${T('Press as the ship reaches the island, before trading: the leg is timed, and the chart learns how fast your ship really sails')}">⚓ ${T('Arrived')}</button>`;
}

export function cockpitHTML({ map = false } = {}) {
	const on = sailing();
	const plan = on ? sailedPlan() : null;
	if (!plan) return `<p class="empty step-empty">${T('Nothing is under way. Plan a run, load at the wharf and cast off — the cockpit opens here.')}</p>`;
	const stops = plan.stops;
	const legs = legsOf(stops);
	const book = ledgerOf(stops, legs);
	const notes = { at: k => (stops[k] && stops[k].quests) || [], trades: plan.trades || 0 };
	const wanted = questWanted();
	const made = tradesDone(on, stops);
	const doneN = stops.filter((s, k) => ticked(on.done, s, k, stops)).length;
	// The ship on the clock is the sailor's own, on the tab's cockpit and
	// on the Map's panel alike: one scene, handed to whichever is showing.
	const clock = timerHTML({ suggest: (legs.mid || 0) + (book.waited || 0) * 60, label: runLabel(plan), marks: runMarks(plan, legs, book), ship: iconSrc(currentShip().name) });
	const legOf = k => { const m = legs.from ? legs.legs[k] : k > 0 ? legs.legs[k - 1] : null; return m != null ? `${fmtDistance(m)} · ${legs.timeOf(m)}` : ''; };
	const at = stopAt(plan, on);
	const along = holdAlong(plan, on);
	const guessed = unsaid(plan, on).length;
	const questsLeft = [...(plan.questsHome || []), ...stops.flatMap(s => s.quests || [])].map(x => x.q).filter(q => !questDone(q)).length;
	const allAsk = V.sailAll.open ? `<div class="sail-all">
		<span class="sail-all-k">${T('Tick off, all at once')}</span>
		<label class="inline-check"><input type="checkbox" data-act="barter-sail-all-pick" data-id="stops"${V.sailAll.stops ? ' checked' : ''}> ${T('every stop, {n} still to go', { n: stops.length - doneN })}</label>
		<label class="inline-check"><input type="checkbox" data-act="barter-sail-all-pick" data-id="quests"${V.sailAll.quests ? ' checked' : ''}${questsLeft ? '' : ' disabled'}> ${T('the quests handed in, {n} still open', { n: questsLeft })}</label>
		<span class="panel-spacer"></span>
		<button class="ghost-btn sm" data-act="barter-sail-all-drop">${T('Cancel')}</button>
		<button class="act" data-act="barter-sail-all-go" title="${T('Every stop ticked, every quest handed in and its reward recorded, in one go')}">${T('Tick them all')}</button>
	</div>` : '';
	const foot = `<div class="sail-bar sailing cockpit-foot">
		<span class="sail-n">${T('<b>{n}</b> of {of} stops done', { n: doneN, of: stops.length })}${questsLeft ? ` · ${questsLeft === 1 ? T('{n} quest open', { n: questsLeft }) : T('{n} quests open', { n: questsLeft })}` : ''}</span>
		${guessed ? `<span class="sail-guess" title="${T('Press the count an island paid on its stop, and the trip is recorded at that instead')}">${guessed === 1 ? T('{n} island’s pay not said', { n: guessed }) : T('{n} islands’ pay not said', { n: guessed })} — ${T('recorded at the middle of the range')}</span>` : ''}
		<span class="panel-spacer"></span>
		${map ? '' : `<button class="ghost-btn sm" data-act="barter-sail-chart" title="${T('The route on the Map, with the same checklist beside it')}">🗺 ${T('On the chart')}</button>`}
		<button class="ghost-btn sm" data-act="barter-sail-drop" title="${T('Drop the checklist; nothing is recorded')}">${T('Abandon')}</button>
		${V.sailAll.open ? '' : `<button class="ghost-btn sm" data-act="barter-sail-all" title="${T('Tick every stop and every quest off at once')}">${T('All done…')}</button>`}
		<button class="act" data-act="barter-step" data-id="results">${T('See the results')} ›</button>
		${allAsk}
	</div>`;
	// On the chart the rest of the run is folded under the stop: the
	// panel is a strip down one side, and the stop is what it is for.
	const fold = inner => (map ? `<details class="map-run-fold rest-fold"><summary>${T('Every stop')} · ${T('{n} of {of} done', { n: doneN, of: stops.length })}</summary>${inner}</details>` : inner);
	if (at < 0) {
		return `<div class="all-ticked"><i>✓</i><span><b>${T('Every stop is ticked.')}</b> ${T('The results step shows what the run did and records it.')}</span><button class="act" data-act="barter-step" data-id="results">${T('See the results')} ›</button></div>${fold(restHTML(plan, on, book, legOf, -1, along))}${foot}`;
	}
	const s = stops[at], key = stopKey(s, at, stops), names = stopNames(s);
	const done = ticked(on.done, s, at, stops);
	const row = book.rows[at];
	// The hold before and after this stop, as the Inventory has it:
	// crew and parts aboard included, as the game's window counts them.
	const hereHold = along.around(at);
	const bars = stopBars(s, row, ltOf(hereHold.after));
	const holdBefore = shownHold(s.hold || currentShip().hold, ltOf(hereHold.before)).total;
	// The one thing to press. An island that pays two or three is asked
	// which as it is ticked, since the press is the same press; one that
	// pays a wide range has a box to type the window's figure into.
	const { lo, hi } = rangeOf(s);
	const fewPays = s.npcId && hi > lo && hi - lo + 1 <= PAID_CHIPS;
	// An island that pays two or three keeps its chips once it is done,
	// the one tapped marked: a count tapped wrong is put right by tapping
	// the other, without unticking anything. The Map's card kept its
	// chips all along; the cockpit hid them behind Done.
	const said = on.seen[s.npcId];
	const press = fewPays
		? `${Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map(n => `<button class="cockpit-go${done ? (said === n ? ' said' : ' done') : ''}" data-act="barter-paid" data-npc="${s.npcId}" data-n="${n}" aria-pressed="${said === n}">${said === n ? '✓ ' : ''}${T('Traded · paid {n}', { n })}</button>`).join('')}${done ? `<button class="cockpit-go done wide" data-act="barter-stop-done" data-k="${esc(key)}">✓ ${T('Done')} — ${T('untick')}</button>` : ''}`
		: done
			? `<button class="cockpit-go done" data-act="barter-stop-done" data-k="${esc(key)}">✓ ${T('Done')} — ${T('untick')}</button>`
			: owesCount(s, on)
				? `<button class="cockpit-go waits" disabled title="${T('Type what the window showed first')}">${T('Traded ×{n}', { n: F(s.times) })} — ${T('type what it paid')}</button>`
				: `<button class="cockpit-go" data-act="barter-stop-done" data-k="${esc(key)}">${s.npcId ? T('Traded ×{n}', { n: F(s.times) }) : doneLabel(s)}</button>${s.wait ? `<button class="cockpit-go end" data-act="barter-step" data-id="results" title="${T('What is ticked so far is the run; the results step records it')}">${T('End the run here')}</button>` : ''}`;
	const ask = s.npcId && hi > lo
		? (fewPays ? `<p class="cockpit-ask">${T('This island pays <b>{range}</b> a trade. Tap what it paid — the run is then recorded exactly.', { range: `${lo}-${hi}` })}</p>`
			: `<p class="cockpit-ask">${T('This island pays a range. Type what the window showed:')} ${paidAsk(s, on.seen[s.npcId])} <span class="${on.seen[s.npcId] > 0 ? 'teal' : 'guess'}">${on.seen[s.npcId] > 0 ? T('recorded exactly') : T('else the middle of the range is assumed')}</span></p>`)
		: '';
	const extra = stopAsks(s, at, stops, on, { paid: false });
	// A stop traded another number of times than the run said: the count
	// the sailor gives is the one recorded, ticked or not.
	const didAsk = s.npcId && (V.didOpen === s.npcId || s.planned)
		? `<p class="cockpit-ask did-ask">${T('Traded another number of times? Type how many:')} <input class="purse-inline narrow" inputmode="numeric" data-act="barter-did-n"${map ? ' data-map="1"' : ''} data-npc="${s.npcId}" value="${s.times}" aria-label="${T('How many times this island was traded')}">${s.planned ? ` <span class="guess">${T('the run said ×{n}', { n: F(s.planned) })}</span>` : ''}</p>`
		: '';
	const questsHere = notes.at(at).length ? `<div class="run-quests">${notes.at(at).map(x => questChip(x, wanted, notes.trades, made)).join('')}</div>` : '';
	const tierOf = name => (levelOf(name) ? ` style="--tier:${TIER(levelOf(name))}"` : '');
	const ready = s.wait ? readyAt(on, s) : 0;
	if (ready) setTimeout(tickUntil, 0);
	const waitBox = s.wait ? `<div class="cockpit-wait">
		<span class="cockpit-icon">${img(VOUCHER, 'cockpit-img')}</span>
		<div class="cockpit-wait-text">
			<b>${T('Wait {n} min', { n: F(s.wait) })}</b>
			<em>${T('The bar cannot pay for the next barter. The voucher’s two-hour cooldown ends, you draw one — a quarter of a bar back — and the run goes on.')}</em>
			${ready ? `<span class="cockpit-count">${ready > Date.now() ? `${T('voucher ready in')} <b data-until="${ready}">${esc(untilText(ready - Date.now()))}</b> · ${T('at {time}', { time: new Date(ready).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}` : `<b class="teal">${T('The cooldown is over — draw the voucher.')}</b>`}</span>` : ''}
		</div>
	</div>` : '';
	const trade = s.wait ? waitBox : s.npcId
		? `<div class="cockpit-trade${V.glance && !map ? ' big' : ''}">
			<div class="cockpit-good"${tierOf(s.give)}><span class="cockpit-icon"${tierOf(s.give)}>${img(s.give, 'cockpit-img')}</span><b>${esc(s.giveText)}× ${esc(gameName(s.give))}</b><em>${levelOf(s.give) ? T('Level {lv}', { lv: levelOf(s.give) }) : T('a land good')}</em></div>
			<span class="cockpit-arrow">→</span>
			<div class="cockpit-good get"${tierOf(s.item)}><span class="cockpit-icon"${tierOf(s.item)}>${img(sevenOf(s), 'cockpit-img')}</span><b>${esc(s.recvText)}× ${esc(gameName(sevenOf(s)))}</b><em>${s.item === COIN ? T('coins') : levelOf(s.item) ? T('Level {lv}', { lv: levelOf(s.item) }) : T('a ship material')}${fourNote(s, true)}</em></div>
			<div class="cockpit-times"><b>×${F(s.times)}</b><span>${T('times')}</span></div>
		</div>`
		: `<div class="cockpit-call">${stopDid(s, true) || `<span class="faint">${names.kind}</span>`}</div>`;
	const figures = `<div class="cockpit-figs">
		<div class="cockpit-fig"><div class="cockpit-fig-k"><span>${T('hold')}</span><span>${bars.w.note || ''}</span></div><div class="cockpit-fig-v">${holdBefore !== bars.w.total ? `<span>${F(holdBefore)}</span><i>→</i>` : ''}<b class="${bars.bad ? 'warn' : bars.over ? 'amber' : ''}">${esc(bars.w.text)}</b></div><div class="run-bar"><i style="width:${bars.w.fill.toFixed(1)}%"></i><i class="over" style="width:${bars.w.extra.toFixed(1)}%"></i><i class="heavy" style="width:${bars.w.worse.toFixed(1)}%"></i></div></div>
		${row ? `<div class="cockpit-fig"><div class="cockpit-fig-k"><span>${T('parley')}</span><span>${s.npcId && row.spent ? `−${F(row.spent)}` : ''}</span></div><div class="cockpit-fig-v">${row.before != null && Math.round(row.before) !== Math.round(row.after) ? `<span>${F(row.before)}</span><i>→</i>` : ''}<b class="${row.short ? 'warn' : ''}">${F(row.after)}</b></div><div class="run-bar parley"><i style="width:${Math.min(100, row.pct).toFixed(1)}%"></i></div>${row.voucher && !s.wait ? '' : parleyNotes(book, at, s).note}</div>` : ''}
	</div>`;
	// A voucher drawn at this stop is a thing the sailor does in game,
	// so it stands as its own block above the press, icon and all,
	// rather than a line of small print under the Parley bar.
	const voucherBox = row && row.voucher && !s.wait ? `<div class="cockpit-voucher">
		<span class="cockpit-voucher-icon">${img(VOUCHER, 'cockpit-voucher-img')}</span>
		<div class="cockpit-voucher-text"><b>${T('Draw a voucher here')}</b><em>${T('+{n} Parley — a quarter of the bar back, and its two-hour cooldown starts', { n: F(PARLEY.voucher) })}</em></div>
	</div>` : '';
	const endNote = s.wait && !done ? `<p class="cockpit-ask">${T('Ending here records what is ticked so far; the barters after this wait stay on the board for later.')}</p>` : '';
	// A voucher here has its own block in the stop's body, so the head
	// does not say it again.
	const pn = parleyNotes(book, at, s), headTag = pn.cls === 'voucher' ? '' : pn.tag;
	const head = `<div class="panel-head cockpit-head"><h2 class="panel-title">${T('Stop {n} of {of}', { n: at + 1, of: stops.length })}</h2><span class="panel-sub">${esc(legOf(at))}</span>${arrivedHTML(on, s, key, at, legs)}${headTag}<span class="panel-spacer"></span>${timeLegsChip()}${map ? '' : `<button class="linky" data-act="barter-glance">${V.glance ? T('full view') : T('Glance mode')}</button>`}</div>${clock ? `<div class="cockpit-clock">${clock}</div>` : ''}`;
	const didLink = s.npcId && !didAsk ? `<button class="linky" data-act="barter-did-open" data-npc="${s.npcId}">${T('traded another number of times?')}</button>` : '';
	const under = `<div class="cockpit-under">${didLink ? `${didLink}<span>·</span>` : ''}<button class="linky" data-act="barter-sail-skip" data-k="${esc(key)}">${s.npcId ? T('island didn’t deal — skip it') : T('skip this stop')}</button><span>·</span><button class="linky" data-act="barter-step" data-id="results">${T('stop here, see the results')}</button></div>`;
	const next = stops[at + 1];
	const nextHTML = next ? (() => { const nn = stopNames(next); return `<div class="cockpit-next"><span class="cockpit-next-k">${T('next')}</span><b>${esc(nn.place)}</b><span>${esc(legOf(at + 1))}</span>${next.npcId ? `<span>${esc(next.giveText)}× ${esc(gameName(next.give))} → <span class="tiered" style="--tier:${TIER(levelOf(next.item))}">${esc(next.recvText)}× ${esc(gameName(sevenOf(next)))}</span> ×${F(next.times)}</span>` : `<span>${nn.kind}</span>`}</div>`; })() : '';
	if (map) {
		return `<section class="panel cockpit compact">${head}<div class="panel-body">
			<div><div class="cockpit-place">${esc(names.place)}</div><div class="cockpit-who">${esc(names.who)} · ${names.kind}</div></div>
			${trade}${figures}${voucherBox}${ask}${didAsk}${extra ? `<div class="run-check">${extra}</div>` : ''}${questsHere}
			<div class="cockpit-press">${press}</div>${endNote}
			${holdSlotsHTML(hereHold)}
			${under}
		</div></section>${nextHTML}${fold(restHTML(plan, on, book, legOf, at, along))}${foot}`;
	}
	if (V.glance) {
		return `<section class="panel cockpit glance">${head}<div class="panel-body">
			<div class="cockpit-place">${esc(names.place)}</div>
			${trade}${figures}${voucherBox}${ask}${didAsk}${extra ? `<div class="run-check">${extra}</div>` : ''}
			<div class="cockpit-press">${press}</div>${endNote}
			${didLink ? `<div class="cockpit-under">${didLink}</div>` : ''}
			${holdSlotsHTML(hereHold)}
		</div></section>${foot}`;
	}
	return `<div class="cockpit-grid">
		<div class="cockpit-col">
			<section class="panel cockpit">${head}<div class="panel-body">
				<div><div class="cockpit-place">${esc(names.place)}</div><div class="cockpit-who">${esc(names.who)} · ${names.kind}</div></div>
				${trade}${figures}${voucherBox}${ask}${didAsk}${extra ? `<div class="run-check">${extra}</div>` : ''}${questsHere}
				<div class="cockpit-press">${press}</div>${endNote}
				${holdSlotsHTML(hereHold)}
				${under}
			</div></section>
			${nextHTML}
		</div>
		${restHTML(plan, on, book, legOf, at, along)}
	</div>${foot}`;
}

/**
 * The hold as the game's own window draws it: a grid of slots, an icon
 * in each. A trade good of Level 5 and up takes a slot to itself, as
 * it does in the game; the rest stack, with the count in the corner.
 * Read from the Inventory, which every Traded writes to. Given a stop's
 * before and after, it is the hold across that stop: each good that
 * changes says what it was and what it comes to, so the hold can be
 * checked against the game's window on either side of the trade.
 */
function holdSlotsHTML(around = null) {
	const me = currentShip();
	const cap = (shipStats[me.name] && shipStats[me.name].slots) || 0;
	const after = around ? around.after : aboardNow(), before = around ? around.before : after;
	const count = (m, name) => Math.max(0, Math.round(m.get(name) || 0));
	const goods = [...new Set([...before.keys(), ...after.keys()])]
		.map(name => ({ name, lv: levelOf(name) || 0, n: count(after, name), was: count(before, name) }))
		.filter(g => g.n > 0 || g.was > 0);
	// Slots are counted the way the game counts them -- a trade good of
	// Level 5 and up takes one each, the rest stack -- since the game
	// will not take a good into a full hold; the goods themselves are
	// drawn as the app draws goods everywhere else, a tile each.
	const used = goods.reduce((a, g) => a + (g.n > 0 ? (g.lv >= 5 ? g.n : 1) : 0), 0);
	const moved = goods.some(g => g.n !== g.was);
	const tile = g => {
		const how = g.n === g.was ? '' : !g.n ? ' gone' : !g.was ? ' new' : ' moved';
		return `<span class="shelf-tile${how}" title="${esc(`${g.was !== g.n ? `${F(g.was)} → ` : ''}${F(g.n)}× ${gameName(g.name)}`)}"><i class="shelf-lv${g.lv ? '' : ' shore'}"${g.lv ? ` style="--tier:${TIER(g.lv)}"` : ''}>${g.lv ? lvTag(g.lv) : '⌂'}</i>${img(g.name, 'shelf-icon')}<b>${how ? `<s>${n1(g.was)}</s> → ` : ''}${n1(g.n)}</b><span>${esc(gameName(g.name))}</span></span>`;
	};
	const tiles = goods.sort((a, b) => b.lv - a.lv || b.n - a.n || a.name.localeCompare(b.name)).map(tile).join('');
	const lt = shownHold(me.hold, ltOf(after)), was = shownHold(me.hold, ltOf(before));
	const sub = `${cap ? T('{n} of {of} slots', { n: F(used), of: F(cap) }) : T('{n} slots', { n: F(used) })} · ${was.total !== lt.total ? `${F(was.total)} → ` : ''}${esc(lt.text)}`;
	const legend = moved ? `<p class="hold-slots-legend">${around.done ? T('Before this stop → after it, as the hold stands now') : T('As the hold stands now → after this stop')}</p>` : '';
	return `<div class="hold-slots${V.slotsOpen ? ' open' : ''}${cap && used > cap ? ' full' : ''}">
		<button class="hold-slots-head" data-act="barter-slots" aria-expanded="${V.slotsOpen}"><span class="hold-slots-k">${T('In the hold')}</span><span class="hold-slots-sub">${sub}</span><span class="panel-spacer"></span><span class="hold-slots-fold">${V.slotsOpen ? '▴' : '▾'}</span></button>
		${V.slotsOpen ? (tiles ? `${legend}<div class="shelf-tiles hold-tiles">${tiles}</div>` : `<p class="empty hold-empty">${T('Nothing aboard.')}</p>`) : ''}
	</div>`;
}

/** The rest of the run, down the side of the cockpit: every stop with
 *  its tick, what changes hands, and the two bars after it. */
function restHTML(plan, on, book, legOf, at, along) {
	const stops = plan.stops;
	const doneN = stops.filter((s, k) => ticked(on.done, s, k, stops)).length;
	const rows = stops.map((s, k) => {
		const key = stopKey(s, k, stops), names = stopNames(s), done = ticked(on.done, s, k, stops);
		const bars = stopBars(s, book.rows[k], along.after[k]);
		const what = s.npcId
			? `${img(s.give, 'row-icon xs')}<span>${esc(s.giveText)}× ${esc(gameName(s.give))}</span><span class="faint">→</span>${img(sevenOf(s), 'row-icon xs')}<span class="tiered" style="--tier:${TIER(levelOf(s.item))}">${esc(s.recvText)}× ${esc(gameName(sevenOf(s)))}</span><b>×${F(s.times)}</b>`
			: `<span>${s.wharf ? [s.toBag && s.toBag.length ? T('Into your bag') : '', s.fromBag && s.fromBag.length ? T('Out of your bag, aboard') : '', s.loads && s.loads.length ? T('Loads from storage') : '', s.dropped && s.dropped.length ? T('Leaves in storage') : '', s.sale ? T('sells {n} {what} here for {silver}', { n: n1(s.sale.n), what: T('goods'), silver: FC(Math.round(s.sale.total)) }) : ''].filter(Boolean).join(' · ') || names.kind : names.kind}</span>`;
		const pn = parleyNotes(book, k, s);
		return `<div class="rest-row${k === at ? ' here' : ''}${done ? ' done' : ''}${V.skipped.has(key) && !done ? ' skipped' : ''}${pn.cls ? ` ${pn.cls}` : ''}" data-act="barter-sail-jump" data-k="${esc(key)}" role="button" tabindex="0">
			<button class="rest-dot${done ? ' on' : ''}" data-act="barter-stop-done" data-k="${esc(key)}" aria-pressed="${done}" title="${T('tick this stop')}">${done ? '✓' : k + 1}</button>
			<div class="rest-main"><div class="rest-head"><b>${esc(names.place)}</b><span>${esc(names.who)}</span>${pn.tag}</div><div class="rest-what">${what}</div>${bars.bad || bars.over ? `<div class="rest-note">${bars.w.note || T('over the limit')}</div>` : ''}${pn.note}</div>
			<div class="rest-bars">${bars.hold}${bars.parley}<span class="rest-leg">${esc(legOf(k))}</span></div>
		</div>`;
	}).join('');
	return `<section class="panel rest-panel"><div class="panel-head"><h2 class="panel-title">${T('The rest of the run')}</h2><span class="panel-sub">${T('{n} of {of} done', { n: doneN, of: stops.length })} · ${T('tap a stop to jump to it')}</span>${(on.told || []).length ? `<span class="panel-spacer"></span><button class="linky" data-act="barter-step" data-id="load">${T('what the wharf step said')} ›</button>` : ''}</div>${rows}</section>`;
}
