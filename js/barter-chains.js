// The runs a board allows, chain by chain.
//
// On a known board every island shows one exchange, so the climbs are
// plain to read: a land good bought ashore becomes a [Level 1] at one
// island, which one other island takes for a [Level 2], and so on up
// to the [Level 7] that is sold where it is made. Each such path is a
// chain; a good already aboard starts one part-way up. The sailor
// picks the chains to sail, and the run is those chains one after the
// other, at one of two paces: every attempt the island allows at each
// rung, the goods no later rung takes left at a wharf when the hold
// is over the limit -- an island will not barter with a ship over its
// weight limit, so a full run calls at a wharf to keep going -- or
// only the attempts the top can use, and never over the limit. The
// [Level 7]s are sold at the wharf, since trade goods sell in port.
//
// Pure: the board, the hold and the wharves come in, the chains and
// the run go out. Distances are straight lines here, for choosing a
// wharf; the screen bends the legs round the land.

import { levelOf } from './barter.js';
import { exchanges, goodsHeld, weightHeld, weightOf, sellOf } from './barter-plan.js';
import { sellable, floorOf, PLAIN_ORDERS } from './barter-orders.js';

/**
 * Every chain the table allows, highest top first. A chain is
 * { id, from: 'land' | 'hold' | 'dock', item, have, load, rungs, top }:
 * `rungs` are the exchanges in climbing order, `item` the good a chain
 * that does not start ashore starts from, `have` how many of it are
 * aboard and `load` how many wait in the start port's storage (`dock`)
 * to be loaded before casting off; `from` is 'hold' when any is
 * aboard, 'dock' when it all has to be loaded. `top` is the level of
 * the last rung's good. The id does not carry `from`, so a chain
 * stays ticked when its goods are loaded.
 */
export function chains(barterData, stock = {}, dock = {}) {
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
		for (const rungs of walk(r, [])) out.push({ from: 'land', item: r.give, have: 0, load: 0, rungs });
	}
	const aboard = goodsHeld(stock), ashore = goodsHeld(dock);
	for (const item of new Set([...aboard.keys(), ...ashore.keys()])) {
		const have = aboard.get(item) || 0, load = ashore.get(item) || 0;
		for (const r of takes(item)) for (const rungs of walk(r, [])) out.push({ from: have > 0 ? 'hold' : 'dock', item, have, load, rungs });
	}
	return out
		.map(c => ({ ...c, id: `${c.from === 'land' ? 'land' : 'hold'}:${c.item}:${c.rungs.map(r => r.npcId).join('.')}`, top: levelOf(c.rungs[c.rungs.length - 1].item) }))
		.sort((a, b) => b.top - a.top || a.rungs.length - b.rungs.length || a.rungs[0].npc.localeCompare(b.rungs[0].npc));
}

const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);

/**
 * The rungs of the chains in sailing order, each tagged with its chain.
 * Chain after chain (`way` 'chain'): every rung of the first chain,
 * then the next. The shortest way round ('sea'): the rungs of every
 * chain merged into one route, each still after the rung beneath it in
 * its own chain -- so the ship deals whatever is nearest that it holds
 * the give for, climbing several chains at once, the way a sailor
 * works the islands off a harbour: the [Level 1]s round Velia, then
 * the [Level 2]s, rather than out to a [Level 7] and back for the next
 * chain's first rung. The route is built nearest-first from `start`
 * and then shortened by moving runs of one to three rungs to wherever
 * they save distance without passing a rung they depend on; the
 * distances are straight, and the way home is counted when the run
 * has a harbour to go home to.
 */
function sequence(order, npcById, start, way) {
	const rungs = order.flatMap((c, k) => c.rungs.map((r, j) => ({ r, chain: k, j })));
	if (way !== 'sea' || order.length < 2) return rungs;
	const at = x => npcById.get(x.r.npcId);
	const D = (a, b) => dist(a, b);
	// Nearest-first, among the rungs whose rung beneath is done.
	const next = order.map(() => 0);
	let seq = [];
	let here = start;
	while (seq.length < rungs.length) {
		let best = -1, bd = Infinity;
		for (let k = 0; k < order.length; k++) {
			if (next[k] >= order[k].rungs.length) continue;
			const d = D(here, npcById.get(order[k].rungs[next[k]].npcId));
			if (d < bd) { bd = d; best = k; }
		}
		const x = rungs.find(y => y.chain === best && y.j === next[best]);
		seq.push(x); next[best]++; here = at(x);
	}
	// Shortened: a block of one to three rungs moved to where it saves
	// distance, so long as no rung of its chains stands between its old
	// place and its new one -- the order within a chain never changes.
	const home = start || null;
	const P = k => (k < 0 ? start : k >= seq.length ? home : at(seq[k]));
	const leg = (a, b) => (a && b ? D(a, b) : 0);
	let passes = 0, improved = true;
	while (improved && passes++ < 40) {
		improved = false;
		outer: for (let size = 1; size <= 3 && size < seq.length; size++) {
			for (let i = 0; i + size <= seq.length; i++) {
				const chainsIn = new Set(seq.slice(i, i + size).map(x => x.chain));
				const b0 = at(seq[i]), b1 = at(seq[i + size - 1]);
				const saved = leg(P(i - 1), b0) + leg(b1, P(i + size)) - leg(P(i - 1), P(i + size));
				// Forward, then backward, as far as no rung of the block's chains is passed.
				for (const dir of [1, -1]) {
					for (let p = dir > 0 ? i + size : i - 1; dir > 0 ? p < seq.length : p >= 0; p += dir) {
						if (chainsIn.has(seq[p].chain)) break;
						// The block set down after seq[p] (forward) or before it (backward).
						const before = dir > 0 ? at(seq[p]) : P(p - 1);
						const after = dir > 0 ? P(p + 1) : at(seq[p]);
						const cost = leg(before, b0) + leg(b1, after) - leg(before, after);
						if (cost < saved - 1e-6) {
							const block = seq.slice(i, i + size);
							const rest = [...seq.slice(0, i), ...seq.slice(i + size)];
							const q = dir > 0 ? p + 1 - size : p;
							seq = [...rest.slice(0, q), ...block, ...rest.slice(q)];
							improved = true;
							break outer;
						}
					}
				}
			}
		}
	}
	return seq;
}

/**
 * The run along `chosen` chains, in the shape the screen draws: stops
 * in sailing order -- islands, and wharves where goods are left and
 * sold -- each tagged with the chain it belongs to, the hold weighed
 * after it.
 *
 * The count is pessimistic both ways: an exchange that pays two or
 * three is counted as paying two, and weighed as if it paid three, so
 * the goods handed on are never overstated and the hold never
 * understated.
 *
 * Chains are sailed nearest-first from `start`, and by `orders.way`
 * either chain after chain or -- 'sea' -- as one route through every
 * rung, each after the rung beneath it (see `sequence`). `hold` is { free, deal,
 * max }: the weight limit, over which the ship sails slower; the most
 * it carries and still barters (an exchange must start under it, and
 * can end over it); and the most the hull moves under at all. Two
 * paces. 'fast' makes no wharf call and never slows: the attempts the
 * rungs above can use come first, counted down from the top, and then
 * as many more at each rung as the hold carries under the limit with
 * the climb ahead still to fit -- so the hull is filled without a
 * detour. 'full' does every attempt the island allows, up to the
 * barter ceiling: the goods the rungs ahead cannot take are left at a
 * wharf when that lets more attempts in, and a rung ends over the
 * ceiling only when such a call can bring the hold back under before
 * the next island. The wharf is `prefer` when given, else the one of
 * `stashes` ({ name, at, x, y }) that bends the leg least. An island
 * that has dealt this run deals no more, so a later chain crossing it
 * stops there. Trade goods are sold at a wharf, not at sea: the
 * [Level 7]s, which nothing takes further, are sold at every wharf
 * call, between chains, and at a last one when the run is done; every
 * other good aboard at the end is carried home, and the run says what
 * it would sell for. `keep` names goods never sold, whatever the orders:
 * the good a material run sent the sailor here for.
 */
export function chainRun({ chosen: picked = [], stock = {}, dock = {}, hold, parley, npcById, start = null, stashes = [], prefer = null, pace = 'full', orders = PLAIN_ORDERS, prices = {}, seen = {}, keep = [] } = {}) {
	// What an island was seen to pay this run, tapped on the checklist,
	// replaces the range the table gives for it: counted and weighed at
	// that, no longer at the least and the most.
	const fix = r => (seen[r.npcId] > 0 ? { ...r, recv: seen[r.npcId], recvMin: seen[r.npcId], recvMax: seen[r.npcId], recvText: String(seen[r.npcId]) } : r);
	const chosen = Object.keys(seen).length ? picked.map(c => ({ ...c, rungs: c.rungs.map(fix) })) : picked;
	const held = goodsHeld(stock);          // the goods counted at the least
	// What the chosen chains start from and the start port's storage
	// holds is loaded before casting off -- all of it, since the chain
	// row promised as much; the hold panel is where a count is trimmed.
	const ashore = goodsHeld(dock);
	const loaded = [];
	for (const c of chosen) {
		if (c.from === 'land' || !ashore.has(c.item)) continue;
		const n = ashore.get(c.item);
		ashore.delete(c.item);
		held.set(c.item, (held.get(c.item) || 0) + n);
		loaded.push({ item: c.item, n });
	}
	const heldMax = new Map(held);          // and weighed at the most
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
	const way = orders.way === 'sea' || orders.way === 'chain' ? orders.way : 'chain';

	// The attempts a rung is worth: all the island allows, or in a
	// fast run only what the rungs above can take, counted down from
	// the top less what is already aboard.
	const deal = hold.deal ?? hold.free;
	const cap = new Map();     // the attempts a rung is for: all the island allows, or a fast run's share
	for (const c of order) for (const r of c.rungs) cap.set(r, r.tries);

	const rungs = sequence(order, npcById, start, way);
	const dw = r => r.recvMax * weightOf(r.item) - r.giveN * weightOf(r.give);
	// What the rungs from `i` on can still take of each good.
	const needFrom = i => {
		const need = new Map();
		for (const { r } of rungs.slice(i)) if (!used.has(r.npcId)) need.set(r.give, (need.get(r.give) || 0) + cap.get(r) * r.giveN);
		return need;
	};
	// A fast run's share of a chain, from where the ship stands: the
	// attempts the top can use, counted down from the top less what is
	// aboard, and then extra attempts rung by rung from the top down --
	// where a leftover is worth carrying -- as many as keep the hold
	// under the limit through the whole climb. Nothing extra at a rung
	// whose good sells for nothing: a leftover there is dead weight.
	// `weighs` and `take` are shared with the wharf calls below.
	// A rung at an island another rung of the run reaches first deals
	// nothing -- the island has dealt -- so it takes no share.
	const dup = new Set();
	{ const isles = new Set(); for (const x of rungs) { if (isles.has(x.r.npcId)) dup.add(x.r); else isles.add(x.r.npcId); } }
	const rungsLeft = c => c.rungs.filter(r => !used.has(r.npcId) && !dup.has(r));
	const vec = (rs, topWant, extra) => {
		const top = rs.length - 1;
		const a = new Array(rs.length);
		let need = Infinity;
		for (let k = top; k >= 0; k--) {
			const r = rs[k];
			const feed = need < Infinity ? Math.ceil(Math.max(0, need - (held.get(r.item) || 0)) / r.recvMin - 1e-9) : 0;
			a[k] = Math.min(r.tries, Math.max(feed, k === top ? topWant : extra[k]));
			need = a[k] * r.giveN;
		}
		return a;
	};
	// Whether the climbs given -- [{ rs, a }] -- fit under the limit
	// together, from what is aboard now.
	const fitsAll = plans => {
		const goods = new Map(held), most = new Map(heldMax);
		for (const { rs, a } of plans) {
			for (let k = 0; k < rs.length; k++) {
				const r = rs[k];
				const t = Math.min(a[k], levelOf(r.give) === null ? Infinity : Math.floor((goods.get(r.give) || 0) / r.giveN + 1e-9));
				if (levelOf(r.give) !== null) { take(goods, r.give, t * r.giveN); take(most, r.give, t * r.giveN); }
				goods.set(r.item, (goods.get(r.item) || 0) + t * r.recvMin);
				most.set(r.item, (most.get(r.item) || 0) + t * r.recvMax);
				if (weightHeld(most) > hold.free + 1e-6) return false;
			}
		}
		return true;
	};
	// The hold shared out among `cs` chains climbed together (one, chain
	// after chain): every top's attempts, cut a chain at a time -- the
	// one asking most first -- until they fit, a chain that cannot fit
	// even one attempt at the top left out; then extras at the rungs
	// below, one at a time round the chains, while the whole still fits.
	const share = cs => {
		const plans = cs.map(c => ({ rs: rungsLeft(c), topWant: 0, extra: [] })).filter(p => p.rs.length);
		for (const p of plans) { p.topWant = p.rs[p.rs.length - 1].tries; p.extra = new Array(p.rs.length).fill(0); p.a = vec(p.rs, p.topWant, p.extra); }
		const live = () => plans.filter(p => p.topWant > 0);
		while (live().length && !fitsAll(live())) {
			const most = live().reduce((x, p) => (p.topWant > x.topWant ? p : x));
			if (most.topWant > 1) most.topWant--;
			else live().reduce((x, p) => (weighs([...p.a.map((n, k) => [p.rs[k].item, n * p.rs[k].recvMax])]) > weighs([...x.a.map((n, k) => [x.rs[k].item, n * x.rs[k].recvMax])]) ? p : x)).topWant = 0;
			for (const p of plans) p.a = p.topWant > 0 ? vec(p.rs, p.topWant, p.extra) : p.rs.map(() => 0);
		}
		let more = true;
		while (more) {
			more = false;
			for (const p of live()) {
				for (let k = p.rs.length - 2; k >= 0; k--) {
					if (!sellOf(p.rs[k].item) || p.extra[k] >= p.rs[k].tries) continue;
					p.extra[k]++;
					const a = vec(p.rs, p.topWant, p.extra);
					const was = p.a; p.a = a;
					if (fitsAll(live())) { more = true; break; }
					p.extra[k]--; p.a = was;
				}
			}
		}
		for (const p of plans) p.rs.forEach((r, k) => cap.set(r, p.a[k]));
	};
	const spare = (goods, need) => [...goods].map(([name, n]) => [name, n - (need.get(name) || 0)]).filter(([, n]) => n > 1e-9);
	const weighs = list => list.reduce((a, [name, n]) => a + n * weightOf(name), 0);
	const take = (goods, name, n) => { goods.set(name, goods.get(name) - n); if (goods.get(name) < 1e-9) goods.delete(name); };
	// What a wharf call at rung `i` sells: the goods the orders let a
	// wharf sell, above what the rungs ahead take and above the floor
	// kept back for the boards to come. The [Level 7]s, which nothing
	// takes and the orders always sell, are the common case.
	const saleAt = i => {
		const need = needFrom(i);
		return [...held].map(([name, n]) => [name, Math.min(n - (need.get(name) || 0), n - floorOf(name, orders))])
			.filter(([name, n]) => n > 1e-9 && sellable(name, orders) && !keep.includes(name));
	};

	// A wharf call: the goods in `sale` sold, the goods in `drop` (from
	// the counted hold) left in storage, along with all of them the
	// weighed hold may be carrying.
	const call = (wharf, drop, chain, sale = []) => {
		const stop = { wharf, dropped: [], weightAfter: 0, chain };
		if (sale.length) {
			stop.sale = { n: 0, total: 0, levels: new Set(), items: [] };
			for (const [name, n] of sale) {
				sold.push({ item: name, n, each: sellOf(name), total: n * sellOf(name), at: wharf.at, chain });
				stop.sale.items.push({ item: name, n, total: n * sellOf(name) });
				stop.sale.n += n;
				stop.sale.total += n * sellOf(name);
				stop.sale.levels.add(levelOf(name));
				take(held, name, n);
				take(heldMax, name, Math.min(n, heldMax.get(name) || 0));
			}
			stop.sale.levels = [...stop.sale.levels].sort((a, b) => b - a);
		}
		for (const [name, want] of drop) {
			const n = Math.min(want, held.get(name) || 0);
			if (n <= 1e-9) continue;   // sold, not stored
			take(held, name, n);
			const gone = (heldMax.get(name) || 0) - (held.get(name) || 0);
			if (gone > 0) take(heldMax, name, gone);
			stashed.push({ item: name, n, at: wharf.at, each: sellOf(name), total: n * sellOf(name), chain });
			stop.dropped.push({ item: name, n });
		}
		weight = weightHeld(heldMax);
		stop.weightAfter = weight;
		stops.push(stop);
		at = wharf;
	};
	const wharfFor = next => prefer || stashes.reduce((a, w) => (dist(at, w) + dist(w, next) < dist(at, a) + dist(a, next) ? w : a));

	const begun = new Set();   // the chains whose first rung the run has reached
	for (let i = 0; i < rungs.length; i++) {
		const { r, chain } = rungs[i];
		if (used.has(r.npcId)) continue;
		const npc = npcById.get(r.npcId);
		const ashore = levelOf(r.give) === null;
		if (pace === 'fast' && !begun.has(chain)) {
			begun.add(chain);
			if (way === 'sea') {
				// Climbing every chain at once, a fast run shares the hold
				// out before it casts off: each chain in turn, against a
				// hold already carrying what the chains before it will
				// bring aboard, so the whole of it fits under the limit at
				// the top. Nothing is sold on the way -- there is no
				// between-chains -- so the sale is at the last call.
				if (i === 0) share(order);
			} else {
				// Chain after chain, a fast run sells what a chain has
				// finished before it takes up the next, so the goods are
				// not carried up another climb, and takes its share of the
				// new chain from where the ship then stands.
				if (i > 0 && stashes.length && saleAt(i).length) call(wharfFor(npc), [], chain, saleAt(i));
				share([order[chain]]);
			}
		}
		// What is aboard above the floor kept back is what can be spent.
		const spendable = ashore ? Infinity : Math.max(0, (held.get(r.give) || 0) - floorOf(r.give, orders));
		let want = Math.min(cap.get(r), ashore ? Infinity : Math.floor(spendable / r.giveN + 1e-9));
		if (perTrade > 0) want = Math.min(want, Math.floor((parley.bar - spent) / perTrade));
		let times;

		if (pace === 'fast') {
			// Never over the limit, and never slower.
			if (weight > hold.free + 1e-6) continue;
			times = dw(r) > 0 ? Math.min(want, Math.floor((hold.free - weight) / dw(r) + 1e-9)) : want;
		} else {
			// How many of the attempts wanted the hold lets in from weight
			// `w` with `goods` aboard (weighed at the most): none over the
			// barter ceiling; each exchange starting under it, the hull
			// still moving after; and ending over it only when a wharf
			// call can bring the hold back under before the next island.
			const fit = (w, goods) => {
				if (w > deal + 1e-6) return 0;
				if (dw(r) <= 0) return want;
				let t = Math.min(want, Math.floor((deal - w) / dw(r) + 1e-9) + 1, Math.floor((hold.max - w) / dw(r) + 1e-9));
				const under = Math.floor((deal - w) / dw(r) + 1e-9);
				if (t > under) {
					const after = new Map(goods);
					if (!ashore) after.set(r.give, after.get(r.give) - t * r.giveN);
					after.set(r.item, (after.get(r.item) || 0) + t * r.recvMax);
					const back = stashes.length ? weighs(spare(after, needFrom(i + 1))) : 0;
					if (w + t * dw(r) - back > deal + 1e-6) t = under;
				}
				return t;
			};
			times = fit(weight, heldMax);

			// A wharf call first, when selling what the orders sell and
			// leaving what the rungs ahead cannot take lets more attempts
			// in here.
			if (times < want && stashes.length) {
				const sale = saleAt(i);
				const drop = spare(held, needFrom(i)).filter(([name]) => !sale.some(([s]) => s === name));
				const lighter = new Map(heldMax);
				for (const [name, n] of sale) { lighter.set(name, (lighter.get(name) || 0) - n); if (lighter.get(name) <= 1e-9) lighter.delete(name); }
				for (const [name] of drop) lighter.set(name, needFrom(i).get(name) || 0);
				if ((drop.length || sale.length) && fit(weighs([...lighter]), lighter) > times) {
					call(wharfFor(npc), drop, chain, sale);
					times = fit(weight, heldMax);
				}
			}
		}
		if (times < 1) continue;

		if (ashore) bought.set(r.give, (bought.get(r.give) || 0) + times * r.giveN);
		else { take(held, r.give, times * r.giveN); take(heldMax, r.give, times * r.giveN); }
		held.set(r.item, (held.get(r.item) || 0) + times * r.recvMin);
		heldMax.set(r.item, (heldMax.get(r.item) || 0) + times * r.recvMax);
		weight = weightHeld(heldMax);
		peak = Math.max(peak, weight);
		spent += times * perTrade;
		used.add(r.npcId);
		stops.push({ ...r, times, parley: times * perTrade, level: levelOf(r.give) || 0, weightAfter: weight, chain });
		at = npc;
	}
	// The run done, what the orders sell is sold at the wharf the ship
	// makes for: the one chosen, else home, else the nearest.
	const last = saleAt(rungs.length);
	if (last.length && stashes.length) {
		call(prefer || (start && stashes.find(w => w.at === start.name)) || wharfFor(at), [], order.length - 1, last);
	}

	// What is carried home: `stock` of each is the floor the orders keep
	// back, the rest is left over -- unsold because the orders do not
	// sell that level, or because no wharf was called at.
	const kept = [...held].filter(([, n]) => n > 1e-9)
		.map(([item, n]) => ({ item, n, each: sellOf(item), total: n * sellOf(item), stock: Math.min(n, floorOf(item, orders)) }))
		.sort((a, b) => b.total - a.total || a.item.localeCompare(b.item));
	// What was bought ashore, priced: `prices` is name -> { each, how }
	// from land-cost.js, and a good it does not price costs 0 and says so.
	const boughtRows = [...bought].map(([item, n]) => {
		const p = prices[item] || { each: 0, how: 'unpriced' };
		return { item, n, each: p.each, how: p.how, total: Math.ceil(n) * p.each };
	});
	const silver = sold.reduce((a, s) => a + s.total, 0);
	const cost = boughtRows.reduce((a, b) => a + b.total, 0);
	return {
		order, stops, sold, kept, stashed, loaded,
		bought: boughtRows,
		cost,
		net: silver - cost,
		silver,
		keptWorth: kept.reduce((a, s) => a + s.total, 0) + stashed.reduce((a, s) => a + s.total, 0),
		trades: stops.reduce((a, s) => a + (s.times || 0), 0),
		parleyUsed: spent,
		parleyBar: parley.bar,
		weightStart, weightPeak: peak, hold
	};
}
