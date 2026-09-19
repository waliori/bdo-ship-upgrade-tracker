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

import { levelOf, npcGate, COIN } from './barter.js';
import { exchanges, goodsHeld, weightHeld, weightOf, sellOf } from './barter-plan.js';
import { sellable, floorOf, PLAIN_ORDERS } from './barter-orders.js';

/**
 * Every chain the table allows, highest top first. A chain is
 * { id, from: 'land' | 'hold' | 'dock', item, have, load, rungs, top, gate }:
 * `rungs` are the exchanges in climbing order, `item` the good a chain
 * that does not start ashore starts from, `have` how many of it are
 * aboard and `load` how many wait in the start port's storage (`dock`)
 * to be loaded before casting off; `from` is 'hold' when any is
 * aboard, 'dock' when it all has to be loaded. `top` is the level of
 * the last rung's good. The id does not carry `from`, so a chain
 * stays ticked when its goods are loaded.
 *
 * `gate` is the island on the climb that the sailor has not opened yet
 * -- the furthest one, since that is the count that would open the
 * whole chain -- or null when every rung is theirs to sail. The barter
 * count decides it: a climb whose [Level 4] rung is dealt at the
 * Wandering Merchant's Ship is not a run at all until three thousand
 * barters are behind you, and a list that offered it anyway was the
 * one thing on this tab that could not be sailed. Left null when no
 * count is given, so a caller that has no player in hand still gets
 * the whole board.
 *
 * `ceiling` is the level the climbs stop at, 0 for the top of the
 * board. A sailor building a stock of the low goods does not want the
 * run carrying them up to a [Level 7] that pays: the chains are cut
 * where the ceiling is, two that differed only above it become one,
 * and a good already held at the ceiling or above starts nothing --
 * it is the stock, not the fuel.
 */
export function chains(barterData, stock = {}, dock = {}, barterCount = null, ceiling = 0, coins = false) {
	// The Crow Coin islands are on every board, taking a [Level 4] and
	// paying in coins, and nothing takes a coin further -- so a coin
	// exchange is a top like a [Level 7] is, and it is only offered when
	// the run is for coins. A row paying a single coin is the codex's
	// own noise rather than an exchange anybody would make.
	const rows = exchanges(barterData).filter(r => levelOf(r.item) !== null || (coins && r.item === COIN && r.recvMax > 1));
	const takes = name => rows.filter(r => r.give === name);
	const top = ceiling > 0 ? ceiling : Infinity;
	// The ceiling is about climbing, and cashing a good in for coins is
	// not a climb: a run that stops at [Level 4] still wants the island
	// that pays for one. So the cut is made on what the next rung would
	// make, not on what this one made, and a coin rung is never cut.
	const walk = (r, path) => {
		const here = [...path, r];
		const up = r.item === COIN ? [] : takes(r.item).filter(n => n.item === COIN || levelOf(n.item) <= top);
		return up.length ? up.flatMap(n => walk(n, here)) : [here];
	};
	const out = [];
	for (const r of rows) {
		if (levelOf(r.give) !== null) continue;
		for (const rungs of walk(r, [])) out.push({ from: 'land', item: r.give, have: 0, load: 0, rungs });
	}
	const aboard = goodsHeld(stock), ashore = goodsHeld(dock);
	for (const item of new Set([...aboard.keys(), ...ashore.keys()])) {
		if (levelOf(item) >= top) continue;
		const have = aboard.get(item) || 0, waiting = ashore.get(item) || 0;
		for (const r of takes(item)) for (const rungs of walk(r, [])) {
			// Only what the first island will deal with is worth loading,
			// and so only that is what the row promises: a storage with
			// thirty of a good and an island that takes eight is a run
			// that loads eight.
			const load = Math.min(waiting, Math.max(0, rungs[0].tries * rungs[0].giveN - have));
			out.push({ from: have > 0 ? 'hold' : 'dock', item, have, load, rungs });
		}
	}
	const seen = new Set();
	return out
		.map(c => {
			const last = c.rungs[c.rungs.length - 1];
			// A chain that ends in coins is named by the level it cashes,
			// since that is the climb it asks for; `pays` is what it pays.
			const pays = last.item === COIN ? 'coin' : 'goods';
			return {
				...c,
				id: `${c.from === 'land' ? 'land' : 'hold'}:${c.item}:${c.rungs.map(r => r.npcId).join('.')}`,
				top: pays === 'coin' ? levelOf(last.give) : levelOf(last.item),
				coins: pays === 'coin' ? last.recvMin * last.tries : 0,
				pays,
				gate: gateOn(c.rungs, barterCount)
			};
		})
		.filter(c => !seen.has(c.id) && seen.add(c.id))
		.sort((a, b) => b.top - a.top || a.rungs.length - b.rungs.length || a.rungs[0].npc.localeCompare(b.rungs[0].npc));
}

/** The rung of a climb that is shut, and what opens it: the dearest,
 *  because that is the count that opens the whole chain. */
function gateOn(rungs, barterCount) {
	// Null is "no player in hand", which leaves the board whole; nought
	// is a sailor who has never bartered, and the table has an answer
	// for them.
	if (barterCount === null) return null;
	let worst = null;
	for (const r of rungs) {
		const barters = npcGate(r.npcId);
		if (barters <= barterCount) continue;
		if (!worst || barters > worst.barters) worst = { barters, short: barters - barterCount, npc: r.npc, npcId: r.npcId };
	}
	return worst;
}

const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);

/** Whether `short` climbs the top of `long`'s ladder: its rungs are
 *  the last of `long`'s, island for island. */
export function tailOf(long, short) {
	const off = long.rungs.length - short.rungs.length;
	return off > 0 && short.rungs.every((r, j) => r.npcId === long.rungs[off + j].npcId);
}

/**
 * The rungs of the chains in sailing order, each tagged with its chain
 * (its index in `order`) and its lot. `lots` are the chains grouped as
 * they are climbed: chain after chain, every lot is one chain, and the
 * rungs come lot after lot. The shortest way round, a lot is the chains
 * the hold carries at once, and its rungs are merged into one route,
 * each still after the rung beneath it in its own chain -- so the ship
 * deals whatever is nearest that it holds the give for, climbing
 * several chains at once, the way a sailor works the islands off a
 * harbour: the [Level 1]s round Velia, then the [Level 2]s, rather than
 * out to a [Level 7] and back for the next chain's first rung. A lot's
 * route is built nearest-first from where the last lot ended and then
 * shortened by moving runs of one to three rungs to wherever they save
 * distance without passing a rung they depend on; the distances are
 * straight, and the way home is counted for the last lot when the run
 * has a harbour to go home to.
 */
function sequence(order, lots, npcById, start) {
	const at = x => npcById.get(x.r.npcId);
	const D = (a, b) => dist(a, b);
	const out = [];
	let here = start;
	lots.forEach((lot, l) => {
		const rungs = lot.flatMap(k => order[k].rungs.map((r, j) => ({ r, chain: k, j, lot: l })));
		if (lot.length < 2) { out.push(...rungs); if (rungs.length) here = at(rungs[rungs.length - 1]); return; }
		// Nearest-first, among the rungs whose rung beneath is done.
		const next = new Map(lot.map(k => [k, 0]));
		let seq = [];
		const from = here;
		while (seq.length < rungs.length) {
			let best = -1, bd = Infinity;
			for (const k of lot) {
				if (next.get(k) >= order[k].rungs.length) continue;
				const d = D(here, npcById.get(order[k].rungs[next.get(k)].npcId));
				if (d < bd) { bd = d; best = k; }
			}
			const x = rungs.find(y => y.chain === best && y.j === next.get(best));
			seq.push(x); next.set(best, next.get(best) + 1); here = at(x);
		}
		// Shortened: a block of one to three rungs moved to where it saves
		// distance, so long as no rung of its chains stands between its old
		// place and its new one -- the order within a chain never changes.
		const home = l === lots.length - 1 ? start || null : null;
		const P = k => (k < 0 ? from : k >= seq.length ? home : at(seq[k]));
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
		out.push(...seq);
		here = at(seq[seq.length - 1]);
	});
	return out;
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
export function chainRun({ chosen: picked = [], stock = {}, dock = {}, hold, parley, npcById, start = null, stashes = [], prefer = null, pace = 'full', orders = PLAIN_ORDERS, prices = {}, seen = {}, keep = [], land = new Map(), owned = null } = {}) {
	// What an island was seen to pay this run, tapped on the checklist,
	// replaces the range the table gives for it: counted and weighed at
	// that, no longer at the least and the most.
	const fix = r => (seen[r.npcId] > 0 ? { ...r, recv: seen[r.npcId], recvMin: seen[r.npcId], recvMax: seen[r.npcId], recvText: String(seen[r.npcId]) } : r);
	const chosen = Object.keys(seen).length ? picked.map(c => ({ ...c, rungs: c.rungs.map(fix) })) : picked;
	const held = goodsHeld(stock);          // the goods counted at the least
	// Everything the sailor holds, wherever it is: the hold, the start
	// port, and every other storage the caller knows of. A floor is
	// about the pile, not about the hold -- a sailor with three hundred
	// ashore and a floor of ten is not short of anything -- so what may
	// be spent of a good is what is owned of it above its floor, and
	// that is tracked here rather than measured against the hold alone.
	const ownedNow = new Map();
	const owning = (name, n) => ownedNow.set(name, Math.max(0, (ownedNow.get(name) || 0) + n));
	for (const src of owned ? [owned] : [stock, dock]) for (const [name, n] of goodsHeld(src)) owning(name, n);
	const budgetOf = name => Math.max(0, (ownedNow.get(name) || 0) - floorOf(name, orders));

	// What the chosen chains start from is loaded at the harbour they
	// sail from -- but only what the first island will actually deal
	// with, and only what the floor allows to be spent. Loading the
	// whole storage put a hold of ninety thousand LT on a ship that
	// carries eleven, and then left it all back at the first wharf: the
	// numbers were nonsense and the run looked mad.
	const ashore = goodsHeld(dock);
	const loaded = [];
	for (const c of chosen) {
		if (c.from === 'land') continue;
		const have = ashore.get(c.item) || 0;
		if (!have) continue;
		const first = c.rungs[0];
		const most = Math.max(0, first.tries * first.giveN - (held.get(c.item) || 0));
		const n = Math.min(have, most, budgetOf(c.item));
		if (n <= 0) continue;
		if (n >= have) ashore.delete(c.item); else ashore.set(c.item, have - n);
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
	// What the Crow Coin islands paid. Coins are not cargo -- no weight,
	// no wharf price, nothing takes them further -- so they are counted
	// rather than carried, at the least the exchange states and at the
	// most it might, the way every other range on a run is.
	let coins = 0, coinsMax = 0;
	// The shore goods the sailor already keeps, when the orders take
	// them from the pile rather than buying fresh: what is left as the
	// run spends them, and what it took in all.
	const fromPile = orders.landFrom === 'stock';
	const pile = new Map(land);
	const taken = new Map();
	// And what the Market has listed of each good bought there, run down
	// as the run buys: a price is not a good in the hand, and a chain
	// that starts on five hundred of something nobody is selling does
	// not start. Only where the Market gave a count -- a good made at
	// home, a gold bar, or one the Market never answered about is not
	// held back by a number nobody has.
	const listed = new Map();
	for (const [name, p] of Object.entries(prices)) if (p && p.how === 'market' && Number.isFinite(p.stock)) listed.set(name, p.stock);
	let at = start;

	// Two chains up the same ladder -- one from the shore, one from a
	// good held part-way up it -- are one climb: the islands deal once,
	// and the good held feeds the rungs above it. The shorter is folded
	// into the longer, its good loaded all the same.
	const climbs = chosen.filter(c => !chosen.some(d => d !== c && tailOf(d, c)));
	// The chains in sailing order: whichever starts nearest to where
	// the ship is, then from where that one ends.
	const queue = [...climbs];
	const order = [];
	while (queue.length) {
		const i = queue.reduce((best, c, k) => (dist(at, npcById.get(c.rungs[0].npcId)) < dist(at, npcById.get(queue[best].rungs[0].npcId)) ? k : best), 0);
		const [c] = queue.splice(i, 1);
		order.push(c);
		at = npcById.get(c.rungs[c.rungs.length - 1].npcId);
	}
	at = start;
	const way = orders.way === 'sea' || orders.way === 'chain' ? orders.way : 'chain';
	// The ceiling a full run barters under. 'full' takes the game's:
	// an exchange may start anywhere under the barter ceiling, a
	// quarter over the limit, and the hull sails slower for it.
	// 'steady' is every attempt too, but never past the limit itself,
	// so it never slows -- it calls at a wharf sooner and oftener to
	// leave the surplus. 'fast' is the limit with no calls at all.
	const deal = pace === 'steady' ? hold.free : (hold.deal ?? hold.free);

	// The attempts a rung is worth: all the island allows, or in a
	// fast run only what the rungs above can take, counted down from
	// the top less what is already aboard.
	const weighs = list => list.reduce((a, [name, n]) => a + n * weightOf(name), 0);
	const take = (goods, name, n) => { goods.set(name, goods.get(name) - n); if (goods.get(name) < 1e-9) goods.delete(name); };
	const cap = new Map();     // the attempts a rung is for: all the island allows, or the hold's share
	for (const c of order) for (const r of c.rungs) cap.set(r, r.tries);

	// The share of the hold a rung is for, when the hold is shared out:
	// the thin ladder each top needs, then extras while the whole fits.
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
	// Whether the climbs given -- [{ rs, a }] -- fit under `limit`
	// together, from what is aboard now.
	const fitsAll = (plans, limit) => {
		const goods = new Map(held), most = new Map(heldMax);
		for (const { rs, a } of plans) {
			for (let k = 0; k < rs.length; k++) {
				const r = rs[k];
				const t = Math.min(a[k], levelOf(r.give) === null ? Infinity : Math.floor((goods.get(r.give) || 0) / r.giveN + 1e-9));
				if (levelOf(r.give) !== null) { take(goods, r.give, t * r.giveN); take(most, r.give, t * r.giveN); }
				goods.set(r.item, (goods.get(r.item) || 0) + t * r.recvMin);
				most.set(r.item, (most.get(r.item) || 0) + t * r.recvMax);
				if (weightHeld(most) > limit + 1e-6) return false;
			}
		}
		return true;
	};
	// The lots: chain after chain, one chain each. The shortest way
	// round, as many chains as the hold carries at once: their thin
	// ladders together under the limit a fast run keeps or the ceiling a
	// full one barters under, every top keeping at least half its
	// attempts when the tops are cut to fit -- taken in the nearest-first
	// order, the next lot after the last is sold. A rung at an island an
	// earlier chain reaches is left out of the reckoning, since it deals
	// nothing.
	const lots = [];
	if (way === 'sea') {
		const limit = pace === 'fast' ? hold.free : deal;   // steady's deal is the limit already
		const isles = new Set();
		const ladder = c => { const rs = c.rungs.filter(r => !isles.has(r.npcId)); for (const r of rs) isles.add(r.npcId); return rs.length ? rs : null; };
		const lotFits = ladders => {
			const ps = ladders.map(rs => ({ rs, topWant: rs[rs.length - 1].tries, least: Math.ceil(rs[rs.length - 1].tries / 2) }));
			for (const p of ps) p.a = vec(p.rs, p.topWant, p.rs.map(() => 0));
			while (!fitsAll(ps, limit)) {
				const m = ps.reduce((x, p) => (p.topWant > x.topWant ? p : x));
				if (m.topWant <= m.least) return false;
				m.topWant--;
				m.a = vec(m.rs, m.topWant, m.rs.map(() => 0));
			}
			return true;
		};
		let lot = [], ladders = [];
		order.forEach((c, k) => {
			const rs = ladder(c);
			if (rs && lot.length && !lotFits([...ladders, rs])) { lots.push(lot); lot = []; ladders = []; }
			lot.push(k);
			if (rs) ladders.push(rs);
		});
		if (lot.length) lots.push(lot);
	} else order.forEach((c, k) => lots.push([k]));

	const rungs = sequence(order, lots, npcById, start);
	const dw = r => r.recvMax * weightOf(r.item) - r.giveN * weightOf(r.give);
	// What the rungs from `i` on can still take of each good.
	const needFrom = i => {
		const need = new Map();
		for (const { r } of rungs.slice(i)) if (!used.has(r.npcId)) need.set(r.give, (need.get(r.give) || 0) + cap.get(r) * r.giveN);
		return need;
	};
	// A rung at an island another rung of the run reaches first deals
	// nothing -- the island has dealt -- so it takes no share.
	const dup = new Set();
	{ const isles = new Set(); for (const x of rungs) { if (isles.has(x.r.npcId)) dup.add(x.r); else isles.add(x.r.npcId); } }
	// The hold shared out among `cs` chains climbed together (one, chain
	// after chain): every top's attempts, cut a chain at a time -- the
	// one asking most first -- until they fit under `limit`, a chain
	// that cannot fit even one attempt at the top left out; then extras
	// at the rungs below -- where a leftover is worth carrying, nothing
	// extra at a rung whose good sells for nothing -- one at a time
	// round the chains, while the whole still fits.
	const share = (cs, limit) => {
		const plans = cs.map(c => ({ rs: rungsLeft(c), topWant: 0, extra: [] })).filter(p => p.rs.length);
		for (const p of plans) { p.topWant = p.rs[p.rs.length - 1].tries; p.extra = new Array(p.rs.length).fill(0); p.a = vec(p.rs, p.topWant, p.extra); }
		const live = () => plans.filter(p => p.topWant > 0);
		while (live().length && !fitsAll(live(), limit)) {
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
					if (fitsAll(live(), limit)) { more = true; break; }
					p.extra[k]--; p.a = was;
				}
			}
		}
		for (const p of plans) p.rs.forEach((r, k) => cap.set(r, p.a[k]));
	};
	const spare = (goods, need) => [...goods].map(([name, n]) => [name, n - (need.get(name) || 0)]).filter(([, n]) => n > 1e-9);
	// What a wharf call at rung `i` sells: the goods the orders let a
	// wharf sell, above what the rungs ahead take and above the floor
	// kept back for the boards to come. The [Level 7]s, which nothing
	// takes and the orders always sell, are the common case.
	const saleAt = i => {
		const need = needFrom(i);
		return [...held].map(([name, n]) => [name, Math.min(n - (need.get(name) || 0), budgetOf(name))])
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
				owning(name, -n);
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

	// Why a chain stopped short of the top.
	//
	// A chain that is ticked and then quietly climbs one rung of three
	// is the run's least readable moment: the coins never arrive and
	// nothing says why. The first answer for a chain is the only one
	// worth keeping -- every rung after it fails for the same reason,
	// that the chain stopped here -- so this records one per chain and
	// the screen turns it into a sentence.
	const cut = new Map();
	const cutAt = (chain, r, why, more = {}) => {
		if (cut.has(chain)) return;
		cut.set(chain, { chain, why, npc: r.npc, npcId: r.npcId, give: r.give, item: r.item, ...more });
	};

	let lotNow = -1;   // the lot under way
	for (let i = 0; i < rungs.length; i++) {
		const { r, chain, lot } = rungs[i];
		// An island that has already dealt this run deals no more, so a
		// later chain crossing it stops there.
		if (used.has(r.npcId)) { cutAt(chain, r, 'dealt'); continue; }
		const npc = npcById.get(r.npcId);
		const ashore = levelOf(r.give) === null;
		if (lot !== lotNow) {
			lotNow = lot;
			// A new lot. A fast run sells what the last lot finished
			// before it takes up the next, so the goods are not carried
			// up another climb, and takes the new lot's share of the hold
			// from where the ship then stands. A full run shares nothing
			// out, whichever way round: every attempt the island allows
			// at every rung, the hold brought back under the ceiling by a
			// wharf call whenever that lets more attempts in -- the way a
			// sailor works a board, ten of everything at the bottom and
			// the surplus left ashore on the way up. Sharing the hold out
			// here used to thin a full run to one attempt a rung the
			// moment two chains climbed together.
			if (i > 0 && stashes.length && (pace === 'fast' || way === 'sea') && saleAt(i).length) call(wharfFor(npc), [], chain, saleAt(i));
			if (pace === 'fast') share(lots[lot].map(k => order[k]), hold.free);
		}
		// What is aboard above the floor kept back is what can be spent.
		const ashoreLeft = fromPile ? pile.get(r.give) || 0 : listed.has(r.give) ? listed.get(r.give) : Infinity;
		// What is aboard, and no more of it than the floor lets go of.
		const spendable = ashore ? ashoreLeft : Math.min(held.get(r.give) || 0, budgetOf(r.give));
		// The two ceilings on how many attempts are wanted, kept apart
		// rather than folded together: which of them bit is the whole of
		// what the run has to say when a chain stops here.
		const byGoods = Math.floor(spendable / r.giveN + 1e-9);
		const byParley = perTrade > 0 ? Math.floor((parley.bar - spent) / perTrade) : Infinity;
		const want = Math.min(cap.get(r), byGoods, byParley);
		let times;

		if (pace === 'fast') {
			// Never over the limit, and never slower.
			if (weight > hold.free + 1e-6) {
				cutAt(chain, r, 'over', { over: Math.round(weight - hold.free) });
				continue;
			}
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
		if (times < 1) {
			// The hold is the usual answer, and there are two ways it
			// says no. A rung the hold's share gave nothing to never had
			// an attempt to lose -- the climb as a whole would not fit
			// beside the other chains ticked -- and quoting this one
			// trade's weight against the whole free hold would be a
			// number that explains nothing. A rung that had a share and
			// could not spend it is the exact case worth being exact
			// about: what the next trade puts on, against what is left.
			const starved = !(cap.get(r) >= 1);
			cutAt(chain, r,
				byParley < 1 ? 'parley' : byGoods < 1 ? (ashore && !fromPile && listed.has(r.give) ? 'market' : 'nothing') : starved ? 'share' : 'hold',
				byGoods < 1 && ashore && !fromPile && listed.has(r.give) ? { good: r.give, want: r.giveN, listed: listed.get(r.give), held: land.get(r.give) || 0 } : starved ? {} : {
					need: Math.max(0, Math.round(dw(r))),
					free: Math.max(0, Math.round((pace === 'fast' ? hold.free : deal) - weight))
				});
			continue;
		}

		if (ashore && fromPile) {
			pile.set(r.give, (pile.get(r.give) || 0) - times * r.giveN);
			taken.set(r.give, (taken.get(r.give) || 0) + times * r.giveN);
		} else if (ashore) {
			bought.set(r.give, (bought.get(r.give) || 0) + times * r.giveN);
			if (listed.has(r.give)) listed.set(r.give, Math.max(0, listed.get(r.give) - times * r.giveN));
		}
		else { take(held, r.give, times * r.giveN); take(heldMax, r.give, times * r.giveN); owning(r.give, -times * r.giveN); }
		if (r.item === COIN) {
			coins += times * r.recvMin;
			coinsMax += times * r.recvMax;
		} else {
			owning(r.item, times * r.recvMin);
			held.set(r.item, (held.get(r.item) || 0) + times * r.recvMin);
			heldMax.set(r.item, (heldMax.get(r.item) || 0) + times * r.recvMax);
		}
		weight = weightHeld(heldMax);
		peak = Math.max(peak, weight);
		spent += times * perTrade;
		used.add(r.npcId);
		stops.push({ ...r, times, parley: times * perTrade, level: levelOf(r.give) || 0, weightAfter: weight, chain });
		at = npc;
	}
	// A chain that reached its top anyway is not a chain that was cut:
	// a rung can be skipped because the sailor already held what it
	// would have made, and the climb goes on above it. So the record is
	// kept only where the top rung never dealt, and it carries how far
	// the chain did get -- one island of three, which is the sentence
	// the screen wants.
	const reached = new Set(stops.filter(s => s.npcId).map(s => `${s.chain}:${s.npcId}`));
	const cuts = [...cut.values()].map(c => {
		const chain = order[c.chain];
		const rungs = chain ? chain.rungs : [];
		return { ...c, item: chain ? chain.item : c.item, done: stops.filter(s => s.npcId && s.chain === c.chain).length, of: rungs.length, top: rungs.length ? rungs[rungs.length - 1] : null };
	}).filter(c => c.top && !reached.has(`${c.chain}:${c.top.npcId}`));

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
		// `stock` is what the Market had listed before the run bought any
		return { item, n, each: p.each, how: p.how, total: Math.ceil(n) * p.each, stock: Number.isFinite(p.stock) ? p.stock : null };
	});
	const takenRows = [...taken].map(([item, n]) => ({ item, n, left: Math.max(0, (land.get(item) || 0) - n) }));
	const silver = sold.reduce((a, s) => a + s.total, 0);
	const cost = boughtRows.reduce((a, b) => a + b.total, 0);
	return {
		order, lots, stops, sold, kept, stashed, loaded,
		cut: cuts,
		bought: boughtRows,
		taken: takenRows,
		coins, coinsMax,
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
