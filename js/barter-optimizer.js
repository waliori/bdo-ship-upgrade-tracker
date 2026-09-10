// The runs worth sailing today, found rather than ticked.
//
// A board has a few dozen chains and a refresh shows a dozen islands,
// which is small enough to search properly: sets of chains are grown
// one chain at a time, each set laid out by chainRun exactly -- hold,
// Parley, wharf calls and all -- and the best few sets kept at every
// step (a beam, so one greedy pick does not decide the day). Three
// proposals come out: the most silver, the most an hour, and the most
// a Parley unit, since Parley is what runs out and the evening is what
// the sailor runs out of.
//
// Pure: chains, the run's options and the orders come in, proposals go
// out. Distances are straight lines stretched a quarter for the land,
// as on the chain rows; the run itself bends its legs round the coast.

import { T } from './i18n.js';
import { chainRun } from './barter-chains.js';
import { yardsticks } from './barter-orders.js';
import { levelOf } from './barter.js';
import { sellOf } from './barter-plan.js';
import { pathLength, sailSeconds } from './sailing.js';

/**
 * What a Level 1 or 2 good is worth kept, under "build the stocks":
 * nothing pays for them, but each becomes part of a Level 3 that pays
 * a million -- a quarter and a half of that, for the two rungs and
 * the two or three an exchange pays. Under "cash out" they are weight.
 */
export const STOCK_WORTH = { 1: 250000, 2: 500000 };

/**
 * What a run leaves the sailor with: silver net of land goods, plus
 * the goods carried home or left in storage at what a barterer pays,
 * plus -- when the orders build a stock -- a value for the low goods
 * that pay nothing yet.
 */
export function valueOf(run, orders) {
	const stock = orders && orders.preset === 'stock';
	let v = run.net;
	for (const g of [...run.kept, ...run.stashed]) {
		const lv = levelOf(g.item);
		v += g.n * (sellOf(g.item) || (stock ? STOCK_WORTH[lv] || 0 : 0));
	}
	return v;
}

/** A rough time under way for a run: straight legs through its stops
 *  from the start, stretched a quarter, at the ship's pace. */
export function hoursOf(run, { start = null, npcById, speed, cal }) {
	const pts = [...(start ? [start] : []), ...run.stops.map(s => s.wharf || npcById.get(s.npcId)).filter(Boolean)];
	if (pts.length < 2) return 0;
	return sailSeconds(pathLength(pts) * 1.25, speed, cal) / 3600;
}

// A clock for the budget: the monotonic one where there is one, which
// is every browser and Node, the wall clock otherwise.
const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();

/**
 * The proposals. `chains` are the board's chains as chains() lists
 * them, `opts` the options chainRun takes (stock, dock, hold, parley,
 * npcById, start, stashes, prefer, pace, orders, prices), `ship` the
 * speed in percent and the metres a second at 100%. `seed` are chain
 * ids already ticked, which every set grown here keeps; `timeCap` is
 * hours under way a set may not pass, 0 for none.
 *
 * `budgetMs` is how long the search may take: once it is spent the
 * beam stops widening and the best of what was judged is returned,
 * marked `partial` -- the screen would rather have a good run now
 * than the best run after the sailor has looked away. Unlimited by
 * default, so a test judges every set.
 *
 * Returns { proposals, best, partial }: up to three { kind, label,
 * ids, run, value, hours, yard } that differ in their ids, most silver
 * first, and `best` the set every search step judged best by value.
 */
export function propose({ chains = [], opts, ship, seed = [], timeCap = 0, width = 5, depth = 8, budgetMs = Infinity } = {}) {
	const orders = opts.orders;
	const t0 = now();
	const late = () => budgetMs !== Infinity && now() - t0 >= budgetMs;
	const byId = new Map(chains.map(c => [c.id, c]));
	const memo = new Map();
	const judge = ids => {
		const key = [...ids].sort().join('|');
		if (memo.has(key)) return memo.get(key);
		const chosen = ids.map(id => byId.get(id)).filter(Boolean);
		const run = chainRun({ ...opts, chosen });
		const hours = hoursOf(run, { start: opts.start, npcById: opts.npcById, speed: ship.speed, cal: ship.cal });
		const out = { ids: [...ids], run, value: valueOf(run, orders), hours, yard: yardsticks(run.net, run.parleyUsed, hours) };
		memo.set(key, out);
		return out;
	};

	const seen = new Map();
	const start = judge(seed.filter(id => byId.has(id)));
	let frontier = [start];
	let partial = false;
	// The budget is checked after each set judged, not before: a budget
	// of nothing still judges one set, so there is always a best so far.
	search: for (let step = 0; step < depth && frontier.length; step++) {
		const next = [];
		for (const state of frontier) {
			for (const c of chains) {
				if (state.ids.includes(c.id)) continue;
				const cand = judge([...state.ids, c.id]);
				const fits = !(timeCap > 0 && cand.hours > timeCap)
					// A chain that adds nothing -- every island already dealt,
					// or no Parley left -- is not a step worth taking.
					&& cand.value > state.value + 1;
				if (fits) {
					const key = cand.ids.slice().sort().join('|');
					if (!seen.has(key)) { seen.set(key, cand); next.push(cand); }
				}
				if (late()) { partial = true; break search; }
			}
		}
		next.sort((a, b) => b.value - a.value);
		frontier = next.slice(0, width);
	}

	const all = [...seen.values()].filter(s => s.ids.length && s.run.trades > 0);
	if (!all.length) return { proposals: [], best: null, partial };
	const pick = (kind, label, score) => {
		const s = all.reduce((a, b) => (score(b) > score(a) ? b : a));
		return score(s) > 0 ? { kind, label, ...s } : null;
	};
	const cands = [
		pick('silver', T('The most silver'), s => s.value),
		pick('hour', T('The most an hour'), s => (s.hours > 0 ? s.value / s.hours : 0)),
		pick('parley', T('The most a Parley unit'), s => s.yard.perUnit)
	].filter(Boolean);
	// Three that differ: a set already proposed under another name is
	// not proposed twice.
	const proposals = [];
	for (const p of cands) {
		const key = p.ids.slice().sort().join('|');
		if (!proposals.some(q => q.ids.slice().sort().join('|') === key)) proposals.push(p);
	}
	return { proposals, best: cands[0] || null, partial };
}
