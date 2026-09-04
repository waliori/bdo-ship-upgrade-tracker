// The runs a board allows, chain by chain.
//
// On a known board every island shows one exchange, so the climbs are
// plain to read: a land good bought ashore becomes a [Level 1] at one
// island, which one other island takes for a [Level 2], and so on up
// to the [Level 7] that is sold where it is made. Each such path is a
// chain; a good already aboard starts one part-way up. The sailor
// picks the chains to sail, and the run is those chains one after the
// other: every attempt the island allows at each rung, the goods no
// later rung takes left at a wharf when the hull needs the room, the
// [Level 7]s sold at the island that pays them.
//
// Pure: the board, the hold and the wharves come in, the chains and
// the run go out. Distances are straight lines here, for choosing a
// wharf; the screen bends the legs round the land.

import { levelOf } from './barter.js';
import { exchanges, goodsHeld, weightHeld, weightOf, sellOf } from './barter-plan.js';

/**
 * Every chain the table allows, highest top first. A chain is
 * { id, from: 'land' | 'hold', item, have, rungs, top }: `rungs` are
 * the exchanges in climbing order, `item` and `have` the good aboard
 * a hold chain starts from, `top` the level of the last rung's good.
 */
export function chains(barterData, stock = {}) {
	const rows = exchanges(barterData).filter(r => levelOf(r.item) !== null);
	const takes = name => rows.filter(r => r.give === name);
	const walk = (r, path) => {
		const here = [...path, r];
		const up = takes(r.item);
		return up.length ? up.flatMap(n => walk(n, here)) : [here];
	};
	const out = [];
	for (const r of rows) {
		if (levelOf(r.give) !== null) continue;
		for (const rungs of walk(r, [])) out.push({ from: 'land', item: r.give, have: 0, rungs });
	}
	for (const [item, have] of goodsHeld(stock)) {
		for (const r of takes(item)) for (const rungs of walk(r, [])) out.push({ from: 'hold', item, have, rungs });
	}
	return out
		.map(c => ({ ...c, id: `${c.from}:${c.item}:${c.rungs.map(r => r.npcId).join('.')}`, top: levelOf(c.rungs[c.rungs.length - 1].item) }))
		.sort((a, b) => b.top - a.top || a.rungs.length - b.rungs.length || a.rungs[0].npc.localeCompare(b.rungs[0].npc));
}

const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);

/**
 * The run along `chosen` chains, in the shape the screen draws: stops
 * in sailing order -- islands, and wharves where goods are left --
 * with the hold weighed after each.
 *
 * Chains are sailed nearest-first from `start`, each rung for every
 * attempt the island allows and the goods aboard cover; an island that
 * has dealt this run deals no more, so a later chain crossing it stops
 * there. Before a stop that would put the hold past `hold.max`, the
 * goods the rungs ahead cannot take are left at the wharf that bends
 * the leg least (`stashes`, { name, at, x, y }), when that lets one
 * more attempt in; what still does not fit cuts the attempts. A [Level 7] is sold at the island that pays it,
 * since nothing takes it further; every other good aboard at the end
 * is carried home, and the run says what it would sell for.
 */
export function chainRun({ chosen = [], stock = {}, hold, parley, npcById, start = null, stashes = [] } = {}) {
	const held = goodsHeld(stock);
	const weightStart = weightHeld(held);
	let weight = weightStart, peak = weightStart, spent = 0;
	const perTrade = parley.perTrade;
	const used = new Set();
	const stops = [], sold = [], stashed = [];
	const bought = new Map();
	let at = start;

	// The chains in sailing order: whichever starts nearest to where
	// the ship is, then from where that one ends.
	const queue = [...chosen];
	const order = [];
	while (queue.length) {
		const i = queue.reduce((best, c, k) => (dist(at, npcById.get(c.rungs[0].npcId)) < dist(at, npcById.get(queue[best].rungs[0].npcId)) ? k : best), 0);
		const [c] = queue.splice(i, 1);
		order.push(c);
		at = npcById.get(c.rungs[c.rungs.length - 1].npcId);
	}
	at = start;

	const rungs = order.flatMap(c => c.rungs);
	const dw = r => r.recv * weightOf(r.item) - r.giveN * weightOf(r.give);

	for (let i = 0; i < rungs.length; i++) {
		const r = rungs[i];
		if (used.has(r.npcId)) continue;
		const npc = npcById.get(r.npcId);
		const ashore = levelOf(r.give) === null;
		const fit = () => (dw(r) > 0 ? Math.floor((hold.max - weight) / dw(r) + 1e-9) : Infinity);
		let times = Math.min(r.tries, ashore ? Infinity : Math.floor((held.get(r.give) || 0) / r.giveN + 1e-9));
		if (perTrade > 0) times = Math.min(times, Math.floor((parley.bar - spent) / perTrade));
		if (times < 1) continue;

		// Room first: what the rungs ahead cannot take -- goods none of
		// them deals in, and more of a good than their attempts cover
		// -- goes ashore at a wharf, when that lets one more attempt in.
		if (times > fit() && stashes.length) {
			const need = new Map();
			for (const u of rungs.slice(i)) if (!used.has(u.npcId)) need.set(u.give, (need.get(u.give) || 0) + u.tries * u.giveN);
			const drop = [...held].map(([name, n]) => [name, n - (need.get(name) || 0)]).filter(([, n]) => n > 1e-9);
			const freed = drop.reduce((a, [name, n]) => a + n * weightOf(name), 0);
			if (drop.length && Math.floor((hold.max - weight + freed) / dw(r) + 1e-9) > fit()) {
				const wharf = stashes.reduce((a, w) => (dist(at, w) + dist(w, npc) < dist(at, a) + dist(a, npc) ? w : a));
				for (const [name, n] of drop) {
					held.set(name, held.get(name) - n);
					if (held.get(name) < 1e-9) held.delete(name);
					weight -= n * weightOf(name);
					stashed.push({ item: name, n, at: wharf.at, each: sellOf(name), total: n * sellOf(name) });
				}
				stops.push({ wharf, dropped: drop.map(([item, n]) => ({ item, n })), weightAfter: weight });
				at = wharf;
			}
		}
		times = Math.min(times, fit());
		if (times < 1) continue;

		if (ashore) bought.set(r.give, (bought.get(r.give) || 0) + times * r.giveN);
		else held.set(r.give, held.get(r.give) - times * r.giveN);
		held.set(r.item, (held.get(r.item) || 0) + times * r.recv);
		weight += times * dw(r);
		peak = Math.max(peak, weight);
		spent += times * perTrade;
		used.add(r.npcId);
		const stop = { ...r, times, parley: times * perTrade, level: levelOf(r.give) || 0, weightAfter: weight };
		if (levelOf(r.item) === 7) {
			const n = held.get(r.item);
			held.delete(r.item);
			weight -= n * weightOf(r.item);
			stop.sale = { n, total: n * sellOf(r.item) };
			stop.weightAfter = weight;
			sold.push({ item: r.item, n, each: sellOf(r.item), total: n * sellOf(r.item), npcId: r.npcId });
		}
		stops.push(stop);
		at = npc;
	}

	const kept = [...held].filter(([, n]) => n > 1e-9).map(([item, n]) => ({ item, n, each: sellOf(item), total: n * sellOf(item) }))
		.sort((a, b) => b.total - a.total || a.item.localeCompare(b.item));
	return {
		stops, sold, kept, stashed,
		bought: [...bought].map(([item, n]) => ({ item, n })),
		silver: sold.reduce((a, s) => a + s.total, 0),
		keptWorth: kept.reduce((a, s) => a + s.total, 0) + stashed.reduce((a, s) => a + s.total, 0),
		trades: stops.reduce((a, s) => a + (s.times || 0), 0),
		parleyUsed: spent,
		parleyBar: parley.bar,
		weightStart, weightPeak: peak, hold
	};
}
