// The run search, off the page: one worker for the runs worth sailing,
// one for the ways of sailing's cards and one for the figure across the
// layouts still standing, each finishing on the page when a worker fails.

import { FC } from '../fmt.js';
import { T } from '../i18n.js';
import * as store from '../state.js';
import { barterData, combos } from '../ui-state.js';
import { boardData, gatedOffers } from '../barter-board.js';
import { npcById } from '../barter_npcs.js';
import { fmtRange } from '../sailing.js';
import { propose } from '../barter-optimizer.js';
import { coins as coinShop } from '../sea_coins.js';
import { landPrices } from '../land-cost.js';
import { marketSilver } from '../market.js';
import { chains } from '../barter-chains.js';
import { V } from './state.js';
import { shutNow, fromPort, sailCal } from './board.js';
import { aboardStock, dockStock } from './hold.js';
import { parleyOf, stashAt, ordersNow } from './plan.js';
import { docks, bagNow, stashes } from './route.js';

/* ------------------------------------------------------------------ *
 * the search, off the main thread
 * ------------------------------------------------------------------ */

// How long a search may take before it answers with the best so far.
export const SEARCH_BUDGET_MS = 1500;
// How long past that to wait before the worker is given up on.
const SEARCH_PATIENCE_MS = 10000;

/** A search worker, or null where there can be none: no Worker here, or
 *  the module would not start. The three searches below each keep one. */
function spawnWorker() {
	const Ctor = globalThis.Worker;
	if (typeof Ctor !== 'function') return null;
	try { return new Ctor(new URL('../barter-worker.js', import.meta.url), { type: 'module' }); } catch { return null; }
}

function workerOf() {
	if (V.worker || V.workerLost) return V.worker;
	V.worker = spawnWorker();
	if (!V.worker) { V.workerLost = true; return null; }
	V.worker.onmessage = evt => {
		const { id, result, error } = evt.data || {};
		// An answer to a request since superseded is a straggler.
		if (!V.pending || V.pending.id !== id) return;
		const req = V.pending;
		settle();
		if (error) answerHere(req); else req.then(result);
	};
	V.worker.onerror = () => {
		// The module failed to load or threw outside a request: this
		// thread takes over for the session.
		const req = V.pending;
		dropWorker();
		V.workerLost = true;
		if (req) answerHere(req);
	};
	return V.worker;
}

function settle() {
	if (V.pending && V.pending.timer) clearTimeout(V.pending.timer);
	V.pending = null;
}

function dropWorker() {
	if (V.worker) V.worker.terminate();
	V.worker = null;
	settle();
}

/**
 * What each way of sailing would come to, searched for its own sake.
 *
 * The cards under How to sail it used to re-run the chains ticked now
 * five times, one per card -- and the chains ticked are the search's
 * answer for the way already chosen, so every card read the same
 * figure, or a card for loaded runs was judged on the chains a light
 * run had picked. Each card is its own search: the chains that way of
 * sailing can start (its land goods, its pace, its hours), searched
 * one after the other on a worker of its own so the main search is
 * never kept waiting, and kept until the inputs change.
 */
const PRESET_BUDGET_MS = SEARCH_BUDGET_MS;
function presetWorkerOf() {
	if (V.presetWorker || V.presetLost) return V.presetWorker;
	V.presetWorker = spawnWorker();
	if (!V.presetWorker) { V.presetLost = true; return null; }
	V.presetWorker.onerror = () => { V.presetWorker = null; V.presetLost = true; };
	return V.presetWorker;
}
function presetNext() {
	const st = V.presetState;
	if (st.busy || !st.queue.length) return;
	const job = st.queue.shift();
	st.job = job;
	const key = st.key;
	const done = result => {
		if (V.presetState.key !== key) return;
		if (V.presetState.job !== job) return;
		V.presetState.res.set(job.id, result && result.best ? result.best : null);
		V.presetState.busy = false;
		V.presetState.job = null;
		if (!V.presetState.queue.length) redrawSoon();
		presetNext();
	};
	st.busy = true;
	const w = presetWorkerOf();
	if (!w) { setTimeout(() => done(propose({ ...job.args, budgetMs: 150 })), 0); return; }
	w.onmessage = evt => done(evt.data && evt.data.result);
	// A worker that fails mid-job leaves the job to this thread, and the
	// cards after it too: the cards never filled when it went.
	w.onerror = () => { V.presetWorker = null; V.presetLost = true; setTimeout(() => done(propose({ ...job.args, budgetMs: 150 })), 0); };
	try { w.postMessage({ id: job.id, ...job.args, budgetMs: PRESET_BUDGET_MS }); } catch { done(propose({ ...job.args, budgetMs: 150 })); }
}
export function presetSearch(key, jobs) {
	if (V.presetState.key === key) { presetNext(); return; }
	V.presetState = { key, res: new Map(), queue: jobs, busy: false, job: null };
	if (V.presetWorker) { V.presetWorker.terminate(); V.presetWorker = null; }
	presetNext();
}

/** A request answered on this thread after all. */
function answerHere(req) {
	req.then(propose(req.args));
}

/**
 * propose() asked of the worker. Returns the result at once when the
 * search has to run on this thread -- no Worker, or one that failed --
 * else null, with `then(result)` called when the answer comes. One
 * request is out at a time: a new one supersedes the last, whose
 * worker is stopped rather than left to finish stale work ahead of
 * the fresh question, and whose `then` is never called. `tag` names
 * what the request is for, so a render can tell whether the answer
 * it is waiting for is still on its way.
 */
export function proposeAsync(args, tag, then) {
	if (V.pending) dropWorker();
	// The main search has the machine to itself: the ways of sailing
	// searched for the last inputs are stopped, and asked again once this
	// answers.
	// The ways of sailing already searched are kept -- they do not depend
	// on which card is chosen -- and one being searched right now is put
	// back at the head of the queue, to finish once this answers.
	if (V.presetState.busy && V.presetState.job) {
		if (V.presetWorker) { V.presetWorker.terminate(); V.presetWorker = null; }
		V.presetState.queue.unshift(V.presetState.job);
		V.presetState.busy = false;
		V.presetState.job = null;
	}
	const w = workerOf();
	if (!w) return propose(args);
	const id = ++V.reqSeq;
	const timer = setTimeout(() => {
		// Nothing back long past the budget: the worker is stuck. This
		// thread answers, and the next ask gets a fresh worker.
		const req = V.pending;
		dropWorker();
		if (req) answerHere(req);
	}, SEARCH_BUDGET_MS + SEARCH_PATIENCE_MS);
	V.pending = { id, tag, args, then, timer };
	try {
		w.postMessage({ id, ...args, budgetMs: SEARCH_BUDGET_MS });
	} catch {
		// Something in the arguments would not clone: this thread instead.
		settle();
		return propose(args);
	}
	return null;
}

export const searching = tag => !!V.pending && V.pending.tag === tag;

/** The tab redrawn from outside a click -- when the worker answers:
 *  its own hidden button, pressed, goes through the page's one click
 *  handler, which redraws after the tab's actions. Nothing happens
 *  when the tab is not on the page; the answer waits in `proposed`. */
export function redrawSoon() {
	const btn = document.querySelector('[data-act="barter-redraw"]');
	if (btn) btn.click();
}

/**
 * What the best run would pay on each layout still standing, weighed
 * by how often each has been seen: the mean, the ends, and the layout
 * that pays best. A quick search, one set at a time, since forty
 * boards are searched at once; kept until the inputs change.
 */
export function expectedBest(me, b, prof) {
	if (!combos || !b.standing.length) return null;
	const o = ordersNow();
	const stock = aboardStock(), dock = dockStock();
	const made = store.getProfile('homemade', []) || [];
	const ship = { speed: me.speed.sea, cal: sailCal() };
	const key = JSON.stringify([V.board.day, b.standing.map(c => c.id), stock, dock, o, V.port, V.stash, bagNow(), made, me.hold, ship, Object.keys(marketSilver()).length, prof.barterCount]);
	if (V.expected.key === key) return V.expected.value;
	// Worked out after the tab is on the screen, not before: a search for
	// every layout still standing held the first draw for a second or
	// more. The figure fills in when it is ready.
	if (V.expected.pending !== key) {
		V.expected.pending = key;
		setTimeout(() => {
			if (V.expected.pending === key) expectedNow(me, b, prof, key);
		}, 60);
	}
	return null;
}

/**
 * The search for every layout still standing, one layout a message on
 * a worker of its own -- so neither the first draw nor the page after
 * it waits on it -- or one layout a tick on this thread where there is
 * no worker. When the last layout answers the figure is kept under
 * `key` and the tab drawn again; an answer for inputs since changed is
 * dropped.
 */
function expectWorkerOf() {
	if (V.expectWorker || V.expectLost) return V.expectWorker;
	V.expectWorker = spawnWorker();
	if (!V.expectWorker) { V.expectLost = true; return null; }
	V.expectWorker.onerror = () => { V.expectWorker = null; V.expectLost = true; };
	return V.expectWorker;
}
function expectedNow(me, b, prof, key) {
	const o = ordersNow();
	const from = fromPort();
	const stock = aboardStock(), dock = dockStock();
	const made = store.getProfile('homemade', []) || [];
	const ship = { speed: me.speed.sea, cal: sailCal() };
	const parley = parleyOf(prof);
	// Each layout still standing is folded with its own gates: which
	// exchanges a count has not opened depends on the layout, since a
	// layout is one row of every island's pool. Laid the quick way: this
	// is one figure across every layout, not the run to sail.
	const asks = b.standing.map(combo => {
		const data = boardData(combo, barterData, npcById, V.board.answers, [...gatedOffers(combo, prof.barterCount), ...shutNow(prof)]);
		const all = chains(data, stock, dock, prof.barterCount).filter(c => (o.buy || c.from !== 'land') && !c.gate);
		const prices = landPrices(all.filter(c => c.from === 'land').map(c => c.item), made);
		const opts = { stock, dock, hold: me.hold, parley, npcById, start: from, stashes, prefer: stashAt(), pace: o.pace, orders: o, prices, ship, effort: 0, bag: bagNow(), docks };
		return { combo, args: { chains: all, opts, ship, timeCap: o.hours, width: 1, depth: 6 } };
	});
	let sum = 0, weight = 0, min = Infinity, max = -Infinity, best = null, left = asks.length;
	const take = (combo, top) => {
		const v = top ? top.value : 0;
		const w = Math.max(1, combo.seen || 1);
		sum += v * w;
		weight += w;
		if (v < min) min = v;
		if (v > max) { max = v; best = top ? { id: combo.id, what: `${top.ids.length === 1 ? T('{n} chain, {silver}', { n: top.ids.length, silver: FC(Math.round(top.value)) }) : T('{n} chains, {silver}', { n: top.ids.length, silver: FC(Math.round(top.value)) })}${top.hours ? ` ${T('in ≈ {time}', { time: fmtRange(top.hours * 3600 * 0.9, top.hours * 3600 * 1.1) })}` : ''}` } : null; }
		if (--left > 0 || V.expected.pending !== key) return;
		V.expected = { key, pending: '', value: { n: b.standing.length, mean: weight ? sum / weight : 0, min: min === Infinity ? 0 : min, max: max === -Infinity ? 0 : max, best } };
		redrawSoon();
	};
	const here = i => {
		if (i >= asks.length || V.expected.pending !== key) return;
		take(asks[i].combo, propose(asks[i].args).best);
		setTimeout(() => here(i + 1), 0);
	};
	const w = expectWorkerOf();
	if (!w) { here(0); return; }
	const seq = ++V.expectSeq;
	let next = 0;
	const send = () => {
		if (next >= asks.length) return;
		try { w.postMessage({ id: `${seq}:${next}`, ...asks[next].args, budgetMs: 4000 }); } catch { here(next); next = asks.length; }
	};
	w.onmessage = evt => {
		const { id, result } = evt.data || {};
		const [sq, i] = String(id).split(':').map(Number);
		if (sq !== V.expectSeq) return;
		take(asks[i].combo, result ? result.best : null);
		next = i + 1;
		send();
	};
	// And the layouts still to answer are answered here if it fails.
	w.onerror = () => { V.expectWorker = null; V.expectLost = true; if (seq === V.expectSeq) here(next); };
	send();
}

/** What a Crow Coin is worth in silver at the coin shop's best rate:
 *  the shop item whose Market price buys the most per coin. */
export function coinWorth() {
	const silver = marketSilver();
	let best = null;
	for (const [item, price] of Object.entries(coinShop)) {
		if (!(price > 0) || !(silver[item] > 0)) continue;
		const each = silver[item] / price;
		if (!best || each > best.each) best = { item, each };
	}
	return best;
}
