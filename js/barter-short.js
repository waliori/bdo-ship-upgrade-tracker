// A short trip: one trade chosen, and what fits round it.
//
// The rest of the Barter tab plans a day: the board's chains, searched
// for the best set, climbed to the top. A short trip is the other way
// in -- Oni's, who wanted to sail out for the one good the storage was
// low on and back again, and to be told what else lay on the way. So
// every trade on today's board is offered on its own, one rung of one
// ladder, and the trades already picked can each be taken one rung
// further with what they make.
//
// A trade is still a chain as chainRun knows one, only cut short: the
// first k + 1 rungs of a board chain, under the id `<chain>><k>` the
// material run's cut already uses. So the wharf step, the cockpit, the
// record and the Continue card take a short trip as they take any run.
//
// And each trade not picked is laid beside the ones that are, to say
// what it adds -- to the day's own measure, silver or the stock -- and
// how many minutes it costs, and why, when it adds nothing, it would
// not trade: the hold, the Parley, nothing to hand over.

import { chainRun } from './barter-chains.js';
import { valueOf, scoreFor, hoursOf } from './barter-optimizer.js';
import { levelOf, COIN } from './barter.js';

/** The chain an id names and how many rungs past its first it keeps,
 *  or k = -1 for an id that is a whole chain. */
export function cutOf(id) {
	const i = String(id).lastIndexOf('>');
	const k = i < 0 ? -1 : Number(String(id).slice(i + 1));
	return Number.isInteger(k) && k >= 0 ? { base: String(id).slice(0, i), k } : { base: String(id), k: -1 };
}

/** A chain's first k + 1 rungs, as a chain of its own. */
export function cutAt(c, k) {
	const rungs = c.rungs.slice(0, k + 1);
	const last = rungs[rungs.length - 1];
	const coin = last.item === COIN;
	return { ...c, rungs, fullRungs: c.rungs, top: coin ? levelOf(last.give) : levelOf(last.item), pays: coin ? 'coin' : 'goods', coins: coin ? last.recvMin * last.tries : 0, id: `${c.id}>${k}`, base: c.id, depth: k };
}

// The same trades, whichever chain they were cut from: where it starts
// and every rung's island, give and take.
const sigOf = (c, k = c.rungs.length - 1) => `${c.from === 'land' ? 'land' : c.item}|${c.rungs.slice(0, k + 1).map(r => `${r.npcId}:${r.give}:${r.item}`).join('/')}`;

/**
 * The trades on offer, from the board's chains as chains() lists them
 * and the ids picked. Returns { picked, first, next }: the picked cuts,
 * the board's single trades not already picked (one each, however many
 * chains share them), and for each picked trade the rungs that take its
 * goods one island further -- `grows` names the pick each would replace.
 */
export function shortTrades(all, ids = []) {
	const byId = new Map(all.map(c => [c.id, c]));
	const picked = [];
	for (const id of ids) {
		const { base, k } = cutOf(id);
		const c = byId.get(base);
		if (c && k >= 0 && k < c.rungs.length && !picked.some(p => p.id === id)) picked.push(cutAt(c, k));
	}
	// A trade inside a picked one is that trade already: not offered again.
	const inside = new Set(picked.flatMap(p => p.rungs.map((_, k) => sigOf(p, k))));
	const seen = new Set(inside);
	const first = [];
	for (const c of all) {
		const s = sigOf(c, 0);
		if (seen.has(s)) continue;
		seen.add(s);
		first.push(cutAt(c, 0));
	}
	const next = [];
	for (const p of picked) {
		const s = sigOf(p);
		for (const c of all) {
			if (c.rungs.length <= p.depth + 1 || sigOf(c, p.depth) !== s) continue;
			const n = sigOf(c, p.depth + 1);
			if (seen.has(n)) continue;
			seen.add(n);
			next.push({ ...cutAt(c, p.depth + 1), grows: p.id });
		}
	}
	return { picked, first, next };
}

/**
 * What each trade not picked would add to the picked ones: the run laid
 * with it, against the run without. `aim` is the search's own (null for
 * silver), `ship` { speed, cal } and `start` the harbour, for the hours.
 * Each row is { c, worth, minutes, trades, own, run, why }, `own` the
 * trades at its own island: `why` is the
 * reason its own island trades nothing -- the cut chainRun gave it --
 * or '' when it trades. `trades` can be less than nought: a trade taken
 * further deals at the first island only what the next one takes. Sorted best first: what it adds a minute, the trades that add
 * nothing last.
 */
export function margins({ picked, cands, opts, aim = null, ship, start = null }) {
	// Silver alone says nothing of a trade that makes a [Level 2]: what
	// it is worth kept is what a floor day counts it at.
	const score = aim ? scoreFor(aim, opts.stock || {}) : run => valueOf(run, { ...opts.orders, preset: 'floor' });
	const pause = (opts.orders && opts.orders.pause) || { isle: 0, call: 0 };
	const hours = run => {
		// The run's own hours when it was laid for this ship: the leg home
		// and the stops are in them.
		if (opts.ship && run.hours > 0) return run.hours;
		const isles = run.stops.filter(s => s.npcId).length, calls = run.stops.length - isles;
		return hoursOf(run, { start, npcById: opts.npcById, speed: ship.speed, cal: ship.cal }) + (isles * (pause.isle || 0) + calls * (pause.call || 0)) / 3600;
	};
	const lay = list => chainRun({ ...opts, chosen: list, effort: 1, aim });
	const base = picked.length ? lay(picked) : null;
	const v0 = base ? score(base) : 0, h0 = base ? hours(base) : 0, t0 = base ? base.trades : 0;
	const rows = cands.map(c => {
		const list = c.grows ? picked.map(p => (p.id === c.grows ? c : p)) : [...picked, c];
		const run = lay(list);
		// It trades when its own last island does. Not by the count: a
		// picked trade taken one island further trades less at the first,
		// only what the second takes, and is the better trip for it.
		const last = c.rungs[c.rungs.length - 1];
		// A trade that is the upper part of a climb already picked is laid
		// as that climb: its island is found on the chain it was folded into.
		let k = run.order.findIndex(x => x.id === c.id);
		if (k < 0) k = run.order.findIndex(x => x.rungs.some(r => r.npcId === last.npcId && r.give === last.give && r.item === last.item));
		const cut = k >= 0 ? run.cut.find(x => x.chain === k) : null;
		const mine = run.stops.filter(s => s.chain === k && s.npcId);
		const own = mine.filter(s => s.npcId === last.npcId).reduce((a, s) => a + s.times, 0);
		const why = own > 0 ? '' : cut ? cut.why : 'nothing';
		return { c, run, worth: score(run) - v0, minutes: (hours(run) - h0) * 60, trades: run.trades - t0, own, made: mine.length ? mine[mine.length - 1] : null, why };
	});
	// A trade that pushes the picked ones out of the hold goes below the
	// ones that fit beside them: the picked trade is what the trip is for.
	const rate = r => (r.why ? -Infinity : r.worth / Math.max(r.minutes, 1));
	const crowds = r => !r.why && !r.c.grows && r.trades < r.own;
	rows.sort((a, b) => Number(crowds(a)) - Number(crowds(b)) || rate(b) - rate(a) || b.worth - a.worth || a.minutes - b.minutes);
	return { base, rows };
}
