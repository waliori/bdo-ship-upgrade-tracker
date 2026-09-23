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
// the run go out. Distances are by water, from barter-route.js's
// table; the screen bends the legs round the land the same way.

import { levelOf, npcGate, COIN } from './barter.js';
import { exchanges, goodsHeld, weightHeld, weightOf, sellOf } from './barter-plan.js';
import { sellable, floorOf, PLAIN_ORDERS } from './barter-orders.js';
import { seaDist, routeLength, orderLadders, orderBlocks, improveLots, growLots } from './barter-route.js';
import { speedMs, METRES_PER_PX } from './sailing.js';

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
		// A good already at the ceiling has no climbing left to do -- but
		// on a coin day the ceiling is the very level the coin islands
		// take, and a [Level 4] aboard has exactly one use, which is to be
		// cashed. It used to be passed over here, before anything asked
		// whether an island would pay for it: Oni stood at the pier with
		// seven [Level 4]s aboard and seven islands wanting one each, and
		// the board offered him climbs from his [Level 3]s instead. So at
		// the ceiling a good keeps its coin rungs and loses the rest.
		const atTop = levelOf(item) >= top;
		const have = aboard.get(item) || 0, waiting = ashore.get(item) || 0;
		for (const r of takes(item)) for (const rungs of (atTop && r.item !== COIN ? [] : walk(r, []))) {
			// Only what the first island will deal with is worth loading,
			// and so only that is what the row promises: a storage with
			// thirty of a good and an island that takes eight is a run
			// that loads eight.
			const load = Math.min(waiting, Math.max(0, rungs[0].tries * rungs[0].giveN - have));
			out.push({ from: have > 0 ? 'hold' : 'dock', item, have, load, waiting, rungs });
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

const dist = seaDist;

// The routes laid through lots, kept: see routeOf in chainRunOnce.
const ROUTES = new Map();

// A wharf within this of the way, in chart pixels, is at hand: a call
// there is no detour at all -- Iliya Island's barterer stands thirty
// pixels from its wharf. Farther off, a call to sell pays when the
// sale covers the detour at DETOUR_WORTH silver a metre, which is
// about a billion an hour at full speed.
const AT_HAND = 1600;
const DETOUR_WORTH = 25000;

/** Whether `short` climbs the top of `long`'s ladder: its rungs are
 *  the last of `long`'s, island for island. */
export function tailOf(long, short) {
	const off = long.rungs.length - short.rungs.length;
	return off > 0 && short.rungs.every((r, j) => r.npcId === long.rungs[off + j].npcId);
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
 * Chains are sailed from `start` by `orders.way`: chain after chain,
 * in the order that makes the shortest run, or -- 'sea' -- as one
 * route through every rung, each after the rung beneath it, in lots
 * cut and ordered for the shortest run (see barter-route.js). `effort`
 * is how hard the route is searched -- 0 lays nearest-first and fills
 * each lot as far as it goes, the way the run was laid before there was
 * a search; 1 is what a search over a board lays at; 2, the default,
 * is the run the sailor sees. `ship` is { speed, cal }, the pace the
 * layings are told apart at. `hold` is { free, deal,
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
function chainRunOnce({ chosen: picked = [], stock = {}, dock = {}, hold, parley, npcById, start = null, stashes = [], prefer = null, pace = 'full', orders = PLAIN_ORDERS, prices = {}, seen = {}, keep = [], land = new Map(), owned = null, loadCap = null, landCap = null, skipIsles = [], nudge = {}, effort = 2, ship = null } = {}) {
	// What an island was seen to pay this run, tapped on the checklist,
	// replaces the range the table gives for it: counted and weighed at
	// that, no longer at the least and the most.
	// The range the table gives is kept beside the count -- `rangeMin`,
	// `rangeMax` -- so the checklist can still ask which it was, and let
	// a count tapped wrong be put right.
	const fix = r => (seen[r.npcId] > 0 ? { ...r, recv: seen[r.npcId], recvMin: seen[r.npcId], recvMax: seen[r.npcId], recvText: String(seen[r.npcId]), rangeMin: r.rangeMin ?? r.recvMin, rangeMax: r.rangeMax ?? r.recvMax } : r);
	const fixed = Object.keys(seen).length ? picked.map(c => ({ ...c, rungs: c.rungs.map(fix) })) : picked;
	// Islands the sailor took off the route: a chain climbs as far as the
	// rung before the first of them and no further, and the route is laid
	// again without them -- the nearest-first order finds its own way
	// round the gap. `fullRungs` remembers the climb as it was, so the
	// chain is said to stop short, and where.
	const skip = new Set(skipIsles);
	const trimmed = skip.size ? fixed.map(c => {
		const i = c.rungs.findIndex(r => skip.has(r.npcId));
		return i < 0 ? c : { ...c, rungs: c.rungs.slice(0, i), fullRungs: c.rungs, skippedAt: c.rungs[i] };
	}) : fixed;
	// A chain taken off at its very first island is not sailed at all.
	const skippedWhole = trimmed.filter(c => !c.rungs.length).map(c => ({ id: c.id, item: c.item, npcId: c.skippedAt.npcId, npc: c.skippedAt.npc, of: c.fullRungs.length }));
	const chosen = trimmed.filter(c => c.rungs.length);
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
	const loadOf = new Map();   // chain -> { item, n } it loaded at the start harbour
	for (const c of chosen) {
		if (c.from === 'land') continue;
		const have = ashore.get(c.item) || 0;
		if (!have) continue;
		const first = c.rungs[0];
		const most = Math.max(0, first.tries * first.giveN - (held.get(c.item) || 0));
		// `loadCap` is what an earlier laying of this same run found it
		// would really hand over (see chainRun below).
		const n = Math.min(have, most, budgetOf(c.item), loadCap && loadCap.has(c.item) ? loadCap.get(c.item) : Infinity);
		if (n <= 0) continue;
		if (n >= have) ashore.delete(c.item); else ashore.set(c.item, have - n);
		held.set(c.item, (held.get(c.item) || 0) + n);
		loaded.push({ item: c.item, n });
		loadOf.set(c, { item: c.item, n });
	}
	const perTrade = parley.perTrade;
	// The shore goods the sailor already keeps, when the orders take
	// them from the pile rather than buying fresh: what is left as the
	// run spends them, and what it took in all.
	const fromPile = orders.landFrom === 'stock';
	const pile = new Map(land);
	// And what the Market has listed of each good bought there, run down
	// as the run buys: a price is not a good in the hand, and a chain
	// that starts on five hundred of something nobody is selling does
	// not start. Only where the Market gave a count -- a good made at
	// home, a gold bar, or one the Market never answered about is not
	// held back by a number nobody has.
	const listed = new Map();
	for (const [name, p] of Object.entries(prices)) if (p && p.how === 'market' && Number.isFinite(p.stock)) listed.set(name, p.stock);

	// The land goods ride from the harbour too. They were bought "at the
	// island" as each rung traded, so the hold never carried them: a
	// ship setting out with a thousand Cactus Rind and a hundred Brass
	// Ingot weighed what it did without them, at the start and at every
	// stop. Loaded here as the dock goods are -- what the first island
	// deals with, no more than the pile or the Market has -- and handed
	// over rung by rung; `landCap` is what an earlier laying found the
	// run really spends (see chainRun below).
	const landLoaded = [];
	{
		const firsts = new Set();
		for (const c of chosen) {
			const r0 = c.rungs[0];
			if (!r0 || levelOf(r0.give) !== null || firsts.has(r0.npcId)) continue;
			firsts.add(r0.npcId);
			const there = fromPile ? pile.get(r0.give) || 0 : listed.has(r0.give) ? listed.get(r0.give) : Infinity;
			const n = Math.min(r0.tries * r0.giveN, there - (held.get(r0.give) || 0), landCap && landCap.has(r0.give) ? landCap.get(r0.give) - (held.get(r0.give) || 0) : Infinity);
			if (!(n > 0)) continue;
			held.set(r0.give, (held.get(r0.give) || 0) + n);
			const was = landLoaded.find(l => l.item === r0.give);
			if (was) was.n += n; else landLoaded.push({ item: r0.give, n });
		}
	}
	const heldMax = new Map(held);          // and weighed at the most

	// Two chains up the same ladder -- one from the shore, one from a
	// good held part-way up it -- are one climb: the islands deal once,
	// and the good held feeds the rungs above it. The shorter is folded
	// into the longer, its good loaded all the same.
	const climbs = chosen.filter(c => !chosen.some(d => d !== c && tailOf(d, c)));
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
	const take = (goods, name, n) => { const left = (goods.get(name) || 0) - n; if (left < 1e-9) goods.delete(name); else goods.set(name, left); };
	const cap = new Map();     // the attempts a rung is for: all the island allows, or the hold's share
	for (const c of climbs) for (const r of c.rungs) cap.set(r, r.tries);

	// The share of the hold a rung is for, when the hold is shared out:
	// the thin ladder each top needs, then extras while the whole fits.
	const vec = (rs, topWant, extra, H = held) => {
		const top = rs.length - 1;
		const a = new Array(rs.length);
		let need = Infinity;
		for (let k = top; k >= 0; k--) {
			const r = rs[k];
			const feed = need < Infinity ? Math.ceil(Math.max(0, need - (H.get(r.item) || 0)) / r.recvMin - 1e-9) : 0;
			a[k] = Math.min(r.tries, Math.max(feed, k === top ? topWant : extra[k]));
			need = a[k] * r.giveN;
		}
		return a;
	};
	// Whether the climbs given -- [{ rs, a }] -- fit under `limit`
	// together, from what is aboard now: false, or what is aboard once
	// they are climbed, counted at the least and weighed at the most.
	const fitsAll = (plans, limit, without = [], H = held, HM = heldMax) => {
		const goods = new Map(H), most = new Map(HM);
		for (const l of without) for (const m of [goods, most]) { const left = (m.get(l.item) || 0) - l.n; if (left > 1e-9) m.set(l.item, left); else m.delete(l.item); }
		// The weight is carried along rather than summed at every rung:
		// this is asked of every cut the search weighs.
		let w = weightHeld(most);
		for (const { rs, a } of plans) {
			for (let k = 0; k < rs.length; k++) {
				const r = rs[k];
				const good = levelOf(r.give) !== null;
				const t = Math.min(a[k], good ? Math.floor((goods.get(r.give) || 0) / r.giveN + 1e-9) : Infinity);
				if (good) { const had = most.get(r.give) || 0; take(goods, r.give, t * r.giveN); take(most, r.give, t * r.giveN); w -= (had - (most.get(r.give) || 0)) * weightOf(r.give); }
				goods.set(r.item, (goods.get(r.item) || 0) + t * r.recvMin);
				most.set(r.item, (most.get(r.item) || 0) + t * r.recvMax);
				w += t * r.recvMax * weightOf(r.item);
				if (w > limit + 1e-6) return false;
			}
		}
		return { goods, most };
	};

	// The harbour the run sails from, when it has a storage the run calls
	// at: a lot's first goods can wait there until the ship comes back
	// for them, rather than all of them riding out at the start. Loading
	// every chain's goods at once put sixteen thousand LT of Level 4 and
	// 5 goods on a ship that barters to twenty -- the later chains found
	// no room, their loads were then trimmed to nothing, and the run
	// said there was "nothing left to hand over" beside a storage full
	// of it.
	const homeWharf = start && stashes.find(w => w.at === start.name) || null;
	const hostOf = c => (climbs.includes(c) ? c : climbs.find(d => tailOf(d, c))) || null;
	// What each climb loads at the start harbour, under the chain that
	// sails it: a chain folded into a longer one loads under the longer.
	const loadHost = new Map();
	for (const [c, l] of loadOf) { const h = hostOf(c); if (h) loadHost.set(h, [...(loadHost.get(h) || []), l]); }
	const loadsOutside = cs => [...loadHost].filter(([h]) => !cs.includes(h)).flatMap(([, ls]) => ls);
	// Whether a lot's goods wait at the harbour for the call before it.
	const waits = cs => !!homeWharf && cs.some(c => loadHost.has(c));
	const nearestWharf = p => (stashes.length ? stashes.reduce((a, w) => (dist(p, w) < dist(p, a) ? w : a)) : null);
	const wayHome = stashes.length ? p => dist(p, nearestWharf(p)) : null;
	// The wharf the run makes for when it is done: the one chosen, else
	// home, else the nearest to where it ends.
	const endWharf = prefer || homeWharf || start || wayHome;

	// Where a lot begins and where it ends. The first lot begins at the
	// start; a later one where the call between them leaves the ship --
	// the harbour, when the lot's goods wait there; else the wharf
	// nearest the last island, when there is one to sell at; else that
	// island. A lot ends where that call is, and the last lot at the
	// wharf the run makes for.
	const boundsOf = cut => (l, pos) => ({
		start: l === 0 ? start : waits(cut[l]) ? homeWharf : (pos && nearestWharf(pos)) || pos,
		end: l === cut.length - 1 ? endWharf : waits(cut[l + 1]) ? homeWharf : wayHome
	});
	// The ladders of a cut: each lot's chains' rungs, less the islands
	// an earlier chain of the run reaches first, which deal nothing and
	// are not sailed to.
	const laddersOf = cut => {
		const isles = new Set();
		return cut.map(lot => lot.map(c => { const rs = c.rungs.filter(r => !isles.has(r.npcId)); for (const r of rs) isles.add(r.npcId); return rs; }));
	};
	// The shortest route through a lot's ladders, kept by what was
	// asked: the same islands from the same start to the same end are
	// the same route whatever run asks, and a search over a board asks
	// for the same lots many times over.
	const routeOf = (rs, s, e, eff) => {
		const key = `${rs.map(l => l.map(r => r.npcId).join('.')).join('|')}@${s ? `${s.x},${s.y}` : ''}>${typeof e === 'function' ? '~' : e ? `${e.x},${e.y}` : ''}#${eff}`;
		let r = ROUTES.get(key);
		if (!r) {
			r = orderLadders(rs.map(l => l.map(x => npcById.get(x.npcId))), { start: s, end: e, effort: eff });
			if (ROUTES.size >= 20000) ROUTES.clear();
			ROUTES.set(key, r);
		}
		return r;
	};
	// The run's length sailed a cut: lot after lot, each from where the
	// last left the ship. What a run of lots comes to is kept by the
	// lots so far, since the cuts the search weighs mostly differ in
	// their last lot or two.
	const lotKey = lot => lot.map(c => c.id).join('+');
	const lengths = new Map();
	const lengthOf = (cut, eff) => {
		const ladders = laddersOf(cut), bounds = boundsOf(cut);
		let total = 0, pos = null, prefix = `#${eff}`;
		for (let l = 0; l < cut.length; l++) {
			prefix += `|${lotKey(cut[l])}${l === cut.length - 1 ? '$' : ''}`;
			let m = lengths.get(prefix);
			if (!m) {
				const rs = ladders[l].filter(x => x.length);
				const { start: s, end: e } = bounds(l, pos);
				const r = routeOf(rs, s, e, eff);
				const o = r.order[r.order.length - 1];
				m = { length: r.length, pos: o ? npcById.get(rs[o.k][o.j].npcId) : pos };
				lengths.set(prefix, m);
			}
			total += m.length;
			pos = m.pos;
		}
		return total;
	};

	// The cut: the chains grouped as they are climbed, lot after lot.
	// Chain after chain, every lot is one chain, in the order that
	// makes the shortest run. The shortest way round, a lot is the
	// chains the hold carries at once: their thin ladders together
	// under the limit a fast run keeps or the ceiling a full one barters
	// under, every top keeping at least half its attempts when the tops
	// are cut to fit, each lot weighed as the hold will be when it
	// starts -- and the lots are chosen for the shortest run, so that
	// islands near one another are sailed on the same trip rather than
	// on whichever trip their chains fell into. Two cuts are tried,
	// nearest-first and grown lot by lot, each shortened by moving and
	// swapping chains between lots, and the shorter is kept.
	let trips, plainCut = null;
	if (way === 'sea') {
		const limit = pace === 'fast' ? hold.free : deal;   // steady's deal is the limit already
		const lotFits = (ladders, H, HM) => {
			const ps = ladders.map(rs => ({ rs, topWant: rs[rs.length - 1].tries, least: Math.ceil(rs[rs.length - 1].tries / 2) }));
			for (const p of ps) p.a = vec(p.rs, p.topWant, p.rs.map(() => 0), H);
			let fit;
			while (!(fit = fitsAll(ps, limit, [], H, HM))) {
				const m = ps.reduce((x, p) => (p.topWant > x.topWant ? p : x));
				if (m.topWant <= m.least) return false;
				m.topWant--;
				m.a = vec(m.rs, m.topWant, m.rs.map(() => 0), H);
			}
			return fit;   // what is aboard once the lot's thin ladders are climbed
		};
		const less = (m, ls) => { const out = new Map(m); for (const l of ls) { const left = (out.get(l.item) || 0) - l.n; if (left > 1e-9) out.set(l.item, left); else out.delete(l.item); } return out; };
		// Whether every lot of a cut fits at its place in the run. A lot
		// of one chain always does -- the run climbs what it can of it.
		// A lot is weighed from the hold as it will be when the lot
		// starts. A run that calls at a wharf whenever the hold is full
		// leaves the surplus ashore as it goes, so a later lot finds the
		// hold as it was less the goods the earlier lots climbed from,
		// which are traded away and sold by then; the later lots' goods
		// wait ashore. Counted, they made every later pair of chains too
		// heavy for the hold, and a run from one harbour went back to it
		// once a chain. A fast run makes no such calls: what a lot makes
		// and the wharf between lots does not sell rides on through the
		// lots after, and is weighed against them -- a lot cut to fit an
		// empty hold found the hold full of the lot before, and a whole
		// chain was starved for it.
		// Kept by the lots so far, like the length: a lot's fit hangs on the
		// lots before it and on nothing after.
		const fits = new Map();
		const fitsCut = c => {
			const ladders = laddersOf(c);
			const carried = pace === 'fast';
			let H = homeWharf ? less(held, loadsOutside(c[0])) : new Map(held);
			let HM = homeWharf ? less(heldMax, loadsOutside(c[0])) : new Map(heldMax);
			const spent = [];
			let prefix = '';
			for (let l = 0; l < c.length; l++) {
				prefix += `|${lotKey(c[l])}`;
				const m = fits.get(prefix);
				if (m) {
					if (!m.ok) return false;
					H = m.H; HM = m.HM;
					for (const ch of c[l]) spent.push({ item: ch.rungs[0].give, n: held.get(ch.rungs[0].give) || 0 });
					continue;
				}
				const rs = ladders[l].filter(x => x.length);
				if (l > 0 && !carried) {
					const gone = [...(homeWharf ? loadsOutside(c[l]) : []), ...spent];
					H = less(held, gone); HM = less(heldMax, gone);
				} else if (l > 0 && homeWharf) {
					H = new Map(H); HM = new Map(HM);
					for (const ch of c[l]) for (const ld of loadHost.get(ch) || []) for (const mm of [H, HM]) mm.set(ld.item, (mm.get(ld.item) || 0) + ld.n);
				}
				const fit = rs.length ? lotFits(rs, H, HM) : { goods: H, most: HM };
				if (c[l].length > 1 && rs.length && !fit) { fits.set(prefix, { ok: false }); return false; }
				for (const ch of c[l]) spent.push({ item: ch.rungs[0].give, n: held.get(ch.rungs[0].give) || 0 });
				if (carried) {
					const after = fit || { goods: H, most: HM };
					H = new Map(after.goods); HM = new Map(after.most);
					if (stashes.length) for (const name of [...H.keys()]) if (sellable(name, orders)) { H.delete(name); HM.delete(name); }
				}
				fits.set(prefix, { ok: true, H, HM });
			}
			return true;
		};
		// Nearest first, chain after chain: whichever starts nearest to
		// where the ship is, then from where that one ends.
		const nearestFirst = () => {
			const queue = [...climbs], out = [];
			let pos = start;
			while (queue.length) {
				const i = queue.reduce((best, c, k) => (dist(pos, npcById.get(c.rungs[0].npcId)) < dist(pos, npcById.get(queue[best].rungs[0].npcId)) ? k : best), 0);
				const [c] = queue.splice(i, 1);
				out.push(c);
				pos = npcById.get(c.rungs[c.rungs.length - 1].npcId);
			}
			return out;
		};
		const firstFit = cs => {
			const out = [];
			let lot = [];
			for (const c of cs) {
				if (lot.length && !fitsCut([...out, [...lot, c]])) { out.push(lot); lot = []; }
				lot.push(c);
			}
			if (lot.length) out.push(lot);
			return out;
		};
		const judge = { cost: c => lengthOf(c, Math.min(effort, 1)), fits: fitsCut };
		const seeds = [firstFit(nearestFirst())];
		plainCut = seeds[0];
		if (effort >= 1 && climbs.length > 1) seeds.push(growLots(climbs, { ...judge, near: c => dist(start, npcById.get(c.rungs[0].npcId)) }));
		let best = Infinity;
		for (const s of seeds) {
			const c = effort >= 1 && climbs.length > 1 ? improveLots(s, judge) : s;
			const L = judge.cost(c);
			if (L < best - 1e-6) { best = L; trips = c; }
		}
	} else {
		const blocks = climbs.map(c => {
			const pts = c.rungs.map(r => npcById.get(r.npcId));
			return { first: pts[0], last: pts[pts.length - 1], inner: routeLength(pts) };
		});
		trips = orderBlocks(blocks, { start, end: endWharf }).order.map(i => [climbs[i]]);
	}


	// What a run laid is worth against the time it takes: the silver it
	// nets, or the coins, or -- a run that sells nothing -- the trades;
	// over the hours under way at the ship's pace with the stops'
	// minutes added. Two layings of the same chains are told apart by
	// this rather than by their length alone, since a shorter route
	// that trades less is not the better run; the ship's pace is taken
	// as full speed at the estimate when none is given.
	const sailed = plan => {
		const pts = [...(start ? [start] : []), ...plan.stops.map(s => s.wharf || npcById.get(s.npcId)).filter(Boolean)];
		const last = pts[pts.length - 1];
		const home = last && !(plan.stops.length && plan.stops[plan.stops.length - 1].wharf) ? (typeof endWharf === 'function' ? endWharf(last) : endWharf ? dist(last, endWharf) : 0) : 0;
		return routeLength(pts) + home;
	};
	const pause = orders.pause || { isle: 0, call: 0 };
	const metresASecond = ship && ship.speed > 0 ? speedMs(ship.speed, ship.cal) : speedMs(100);
	const hoursOf = plan => {
		const isles = plan.stops.filter(s => s.npcId).length, calls = plan.stops.length - isles;
		return (sailed(plan) * METRES_PER_PX / metresASecond + isles * (pause.isle || 0) + calls * (pause.call || 0)) / 3600;
	};
	const worthOf = plan => (plan.net > 0 ? plan.net : plan.coins > 0 ? plan.coins : plan.trades);
	const better = (cand, best) => {
		if (!worthOf(cand) && !worthOf(best)) return sailed(cand) < sailed(best) - 1e-6;
		return worthOf(cand) / Math.max(hoursOf(cand), 1e-9) > (worthOf(best) / Math.max(hoursOf(best), 1e-9)) * 1.001;
	};

	// The cut laid: the rungs in order, the hold as the lots find it,
	// and the run along them, laid as many ways as are worth trying.
	const runCut = (trips, eff) => {
	// The rungs in sailing order, lot by lot: one route through every
	// rung of a lot, each still after the rung beneath it in its own
	// chain -- so the ship deals whatever is nearest that it holds the
	// give for, climbing several chains at once, the way a sailor works
	// the islands off a harbour: the [Level 1]s round Velia, then the
	// [Level 2]s, rather than out to a [Level 7] and back for the next
	// chain's first rung. A rung at an island another chain of the run
	// reaches first is not sailed to; it is put back beside its own
	// chain's rungs -- before the rung above it, else after the whole
	// chain, else at the lot's end -- where the run says it deals
	// nothing.
	const laddersAll = laddersOf(trips), boundsAll = boundsOf(trips);
	const withDealt = (seq, lot, l) => {
		for (const c of lot) c.rungs.forEach((x, j) => {
			if (seq.some(y => y.r === x)) return;
			let i = seq.findIndex(y => y.c === c && c.rungs.indexOf(y.r) > j);
			if (i < 0) { const own = seq.map((y, q) => (y.c === c ? q : -1)).filter(q => q >= 0); i = own.length ? own[own.length - 1] + 1 : seq.length; }
			seq.splice(i, 0, { r: x, c, lot: l });
		});
		return seq;
	};
	const sequenceOf = eff => {
		const out = [];
		let pos = null;
		trips.forEach((lot, l) => {
			const live = lot.map((c, k) => ({ c, rs: laddersAll[l][k] })).filter(x => x.rs.length);
			const { start: s, end: e } = boundsAll(l, pos);
			const r = routeOf(live.map(x => x.rs), s, e, eff);
			const seq = r.order.map(o => ({ r: live[o.k].rs[o.j], c: live[o.k].c, lot: l }));
			out.push(...withDealt(seq, lot, l));
			const o = r.order[r.order.length - 1];
			if (o) pos = npcById.get(live[o.k].rs[o.j].npcId);
		});
		return out;
	};
	const first = sequenceOf(eff);
	// The chains in the order the run first meets them, which is what
	// every stop is tagged with; the lots as indices into it.
	const order = [];
	for (const x of first) if (!order.includes(x.c)) order.push(x.c);
	for (const c of trips.flat()) if (!order.includes(c)) order.push(c);
	const lots = trips.map(lot => lot.map(c => order.indexOf(c)));
	const tagged = seq => seq.map(x => ({ r: x.r, chain: order.indexOf(x.c), j: x.c.rungs.indexOf(x.r), lot: x.lot }));
	const rungs = tagged(first);

	// The later lots' goods stay ashore until the ship calls back for
	// them: off the hold at the start, and onto it at the call before
	// their lot.
	const held0 = new Map(held), heldMax0 = new Map(heldMax), loaded0 = loaded.map(l => ({ ...l }));
	let weightStart = weightHeld(held0);
	const pending = new Map();   // lot -> [{ item, n }]
	if (homeWharf && lots.length > 1) {
		for (const [c, l] of loadOf) {
			const h = hostOf(c);
			const lot = h ? lots.findIndex(ks => ks.includes(order.indexOf(h))) : 0;
			if (lot <= 0) continue;
			for (const m of [held0, heldMax0]) { const left = (m.get(l.item) || 0) - l.n; if (left > 1e-9) m.set(l.item, left); else m.delete(l.item); }
			const e = loaded0.find(x => x.item === l.item);
			if (e) e.n -= l.n;
			pending.set(lot, [...(pending.get(lot) || []), { ...l }]);
		}
		for (let k = loaded0.length - 1; k >= 0; k--) if (loaded0[k].n <= 1e-9) loaded0.splice(k, 1);
		weightStart = weightHeld(held0);
	}
	const ownedNow0 = ownedNow, pile0 = pile, listed0 = listed, cap0 = cap;

	// The run laid along a sequence of rungs: the stops, the sales, the
	// wharf calls and the hold after each. Everything the laying moves
	// is its own, so a sequence can be laid more than once.
	const lay = (rungsIn, early = false) => {
	// The later lots whose goods came aboard before their lot began.
	const earlyLoaded = new Set();
	const rungs = rungsIn.slice();
	const held = new Map(held0), heldMax = new Map(heldMax0), ownedNow = new Map(ownedNow0), pile = new Map(pile0), listed = new Map(listed0);
	const owning = (name, n) => ownedNow.set(name, Math.max(0, (ownedNow.get(name) || 0) + n));
	const budgetOf = name => Math.max(0, (ownedNow.get(name) || 0) - floorOf(name, orders));
	const cap = new Map(cap0);
	const used = new Set();
	const stops = [], sold = [], stashed = [];
	const bought = new Map(), taken = new Map();
	// What the Crow Coin islands paid. Coins are not cargo -- no weight,
	// no wharf price, nothing takes them further -- so they are counted
	// rather than carried, at the least the exchange states and at the
	// most it might, the way every other range on a run is.
	let coins = 0, coinsMax = 0, weight = weightStart, peak = weightStart, spent = 0, at = start;
	const rungsLeft = c => c.rungs.filter(r => !used.has(r.npcId) && !dup.has(r));
	// A stop the sailor moved sooner or later, a step at a time, never
	// past a rung of its own chain -- a good is not handed over before it
	// is made. The wharf calls are laid after this, around the order as
	// the sailor left it.
	for (const [id, by] of Object.entries(nudge || {})) {
		let i = rungs.findIndex(x => String(x.r.npcId) === String(id));
		if (i < 0 || !by) continue;
		const dir = Math.sign(by);
		for (let step = 0; step < Math.abs(by); step++) {
			const j = i + dir;
			if (j < 0 || j >= rungs.length || rungs[j].chain === rungs[i].chain) break;
			[rungs[i], rungs[j]] = [rungs[j], rungs[i]];
			i = j;
		}
	}
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
	const share = (cs, limit, last = true) => {
		const plans = cs.map(c => ({ rs: rungsLeft(c), topWant: 0, extra: [] })).filter(p => p.rs.length);
		for (const p of plans) { p.topWant = p.rs[p.rs.length - 1].tries; p.extra = new Array(p.rs.length).fill(0); p.a = vec(p.rs, p.topWant, p.extra, held); }
		const live = () => plans.filter(p => p.topWant > 0);
		while (live().length && !fitsAll(live(), limit, [], held, heldMax)) {
			const most = live().reduce((x, p) => (p.topWant > x.topWant ? p : x));
			if (most.topWant > 1) most.topWant--;
			else live().reduce((x, p) => (weighs([...p.a.map((n, k) => [p.rs[k].item, n * p.rs[k].recvMax])]) > weighs([...x.a.map((n, k) => [x.rs[k].item, n * x.rs[k].recvMax])]) ? p : x)).topWant = 0;
			for (const p of plans) p.a = p.topWant > 0 ? vec(p.rs, p.topWant, p.extra, held) : p.rs.map(() => 0);
		}
		let more = true;
		while (more) {
			more = false;
			for (const p of live()) {
				for (let k = p.rs.length - 2; k >= 0; k--) {
					if (!sellOf(p.rs[k].item) || p.extra[k] >= p.rs[k].tries || (!last && !sellable(p.rs[k].item, orders))) continue;
					p.extra[k]++;
					const a = vec(p.rs, p.topWant, p.extra, held);
					const was = p.a; p.a = a;
					if (fitsAll(live(), limit, [], held, heldMax)) { more = true; break; }
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
	const call = (wharf, drop, chain, sale = [], loads = [], lotOf = null) => {
		// Two calls in a row at one wharf are one call: the sale and the
		// load for the next lot, then what the next rung needs left.
		const last = stops[stops.length - 1];
		const again = !!(last && last.wharf && last.wharf.at === wharf.at);
		const stop = again ? last : { wharf, dropped: [], weightAfter: 0, chain };
		if (sale.length) {
			if (stop.sale) stop.sale.levels = new Set(stop.sale.levels);
			else stop.sale = { n: 0, total: 0, levels: new Set(), items: [] };
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
		// And what waits in this storage for the lot about to start.
		if (loads.length) {
			stop.loads = [...(stop.loads || []), ...loads.map(l => ({ item: l.item, n: l.n, lot: lotOf }))];
			for (const l of loads) for (const m of [held, heldMax]) m.set(l.item, (m.get(l.item) || 0) + l.n);
		}
		// Picking up early. The ship stood at Iliya at the end of trip 1
		// with ten thousand LT to spare and sailed away, to come back for
		// trip 2's goods an hour later. So at a call at the harbour the
		// later lots' goods wait in, those goods come aboard now when the
		// hold takes them under its limit -- the nearest lot first, as far
		// as they fit -- and the run goes on from wherever it is when that
		// lot's turn comes. Laid as a way of its own, kept when it is
		// worth more an hour: goods aboard early can cost attempts on the
		// way.
		if (early && homeWharf && wharf.at === homeWharf.at) {
			const limit = pace === 'fast' ? hold.free : deal;
			for (const [L, ls] of [...pending].sort((a, b) => a[0] - b[0])) {
				if (L <= lotNow || earlyLoaded.has(L)) continue;
				const w = ls.reduce((a, l) => a + l.n * weightOf(l.item), 0);
				if (weightHeld(heldMax) + w > limit + 1e-6) break;
				stop.loads = [...(stop.loads || []), ...ls.map(l => ({ item: l.item, n: l.n, lot: L }))];
				for (const l of ls) for (const m of [held, heldMax]) m.set(l.item, (m.get(l.item) || 0) + l.n);
				earlyLoaded.add(L);
			}
		}
		weight = weightHeld(heldMax);
		peak = Math.max(peak, weight);
		stop.weightAfter = weight;
		if (!again) stops.push(stop);
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
			const waiting = earlyLoaded.has(lot) ? [] : pending.get(lot) || [];
			if (i > 0 && waiting.length) call(homeWharf, [], chain, saleAt(i), waiting, lot);
			else if (i > 0 && stashes.length && (pace === 'fast' || way === 'sea') && saleAt(i).length) call(wharfFor(npc), [], chain, saleAt(i));
			if (pace === 'fast') share(lots[lot].map(k => order[k]), hold.free, lot === lots.length - 1);
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
				// Full and never slower: no trade ends over the limit, even
				// one a wharf call would bring back under -- the leg to that
				// wharf is sailed slow.
				if (pace === 'steady') return Math.max(0, Math.min(t, under));
				if (t > under) {
					const after = new Map(goods);
					if (!ashore || after.has(r.give)) after.set(r.give, after.get(r.give) - t * r.giveN);
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
			// Goods in the hold that a floor keeps back are not "nothing to
			// hand over": the sailor asked for them kept, and the chain
			// stops on that request. Said as such, with the numbers.
			const floorHeld = !ashore && byGoods < 1 && byParley >= 1 && (held.get(r.give) || 0) >= r.giveN && floorOf(r.give, orders) > 0;
			if (floorHeld) {
				cutAt(chain, r, 'floor', { good: r.give, level: levelOf(r.give), floor: floorOf(r.give, orders), owned: Math.floor(ownedNow.get(r.give) || 0), want: r.giveN });
				continue;
			}
			cutAt(chain, r,
				byParley < 1 ? 'parley' : byGoods < 1 ? (ashore && !fromPile && listed.has(r.give) ? 'market' : 'nothing') : starved ? 'share' : 'hold',
				byGoods < 1 && ashore && !fromPile && listed.has(r.give) ? { good: r.give, want: r.giveN, listed: listed.get(r.give), held: land.get(r.give) || 0 } : starved ? {} : {
					need: Math.max(0, Math.round(dw(r))),
					free: Math.max(0, Math.round((pace === 'fast' ? hold.free : deal) - weight))
				});
			continue;
		}

		if (ashore && held.has(r.give)) { take(held, r.give, times * r.giveN); take(heldMax, r.give, times * r.giveN); }
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
		// A sale on the way. The [Level 7] made at Priko on Iliya Island
		// was carried past the wharf the ship was standing at, and its
		// weight forced a call twenty kilometres later. So when the next
		// leg all but passes a wharf -- the island's own, or one a short
		// way off it -- and the hold has something the orders sell, the
		// run calls there: always when the wharf is at hand, and on a
		// detour when the sale covers it at about a billion an hour; a
		// fast run, which promised no detours, only when it is at hand.
		// The call's own minutes are counted first: a single good is not
		// worth two minutes at the pier. A loaded run leaves the surplus
		// there too, where the storage is not spoken for elsewhere.
		if (stashes.length) {
			const sale = saleAt(i + 1);
			const worth = sale.reduce((a, [name, n]) => a + n * sellOf(name), 0) - (pause.call || 0) * metresASecond * DETOUR_WORTH;
			if (worth > 0) {
				const ahead = rungs.slice(i + 1).find(x => !used.has(x.r.npcId));
				const to = ahead ? npcById.get(ahead.r.npcId) : null;
				let near = null;
				for (const w of stashes) {
					const detour = to ? dist(at, w) + dist(w, to) - dist(at, to) : dist(at, w);
					if (!near || detour < near.detour) near = { w, detour };
				}
				const allowed = pace === 'fast' ? 0 : worth / DETOUR_WORTH / METRES_PER_PX;
				if (near && to && near.detour <= AT_HAND + allowed) {
					const drop = pace !== 'fast' && (!prefer || near.w === prefer) ? spare(held, needFrom(i + 1)).filter(([name]) => !sale.some(([x]) => x === name)) : [];
					call(near.w, drop, chain, sale);
				}
			}
		}
	}
	// A chain that reached its top anyway is not a chain that was cut:
	// a rung can be skipped because the sailor already held what it
	// would have made, and the climb goes on above it. So the record is
	// kept only where the top rung never dealt, and it carries how far
	// the chain did get -- one island of three, which is the sentence
	// the screen wants.
	const reached = new Set(stops.filter(s => s.npcId).map(s => `${s.chain}:${s.npcId}`));
	// A chain the sailor cut short by taking an island off: said where.
	order.forEach((c, k) => {
		if (c.skippedAt && !cut.has(k)) cut.set(k, { chain: k, why: 'skipped', npc: c.skippedAt.npc, npcId: c.skippedAt.npcId, give: c.skippedAt.give, item: c.item });
	});
	const cuts = [...cut.values()].map(c => {
		const chain = order[c.chain];
		const rungs = chain ? chain.fullRungs || chain.rungs : [];
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
	const kept = [...held].filter(([name, n]) => n > 1e-9 && levelOf(name) !== null)
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
		order, lots, stops, sold, kept, stashed, loaded: loaded0, landLoaded,
		cut: cuts,
		skippedWhole,
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
		weightStart, weightPeak: peak, hold,
		rungs
	};
	};

	// An island route is the run, for a run that never calls at a wharf
	// between islands. A run that calls whenever the hold is full sails
	// legs the island route never counted -- out to the wharf and back
	// -- and the shortest island route is not always the shortest run.
	// So such a run is laid more than once: along the shortest island
	// route, along the nearest-first one, and again along the best with
	// every stretch between two calls shortened on its own, from the
	// call before it to the call after; and the run kept is the one
	// worth most an hour.
	const restitch = plan => {
		const segOf = new Map();
		const bounds = [{ from: start, to: null }];
		let seg = 0, between = false, isles = 0;
		for (const s of plan.stops) {
			if (s.wharf) { bounds[seg].to = s.wharf; bounds.push({ from: s.wharf, to: null }); seg++; between = between || isles > 0; isles = 0; }
			else { segOf.set(s.npcId, seg); isles++; }
		}
		if (!between || !isles) return null;
		bounds[seg].to = endWharf;
		const groups = bounds.map(() => []);
		let at = 0;
		for (const x of plan.rungs) { at = segOf.has(x.r.npcId) ? segOf.get(x.r.npcId) : at; groups[at].push(x); }
		const out = [];
		groups.forEach((g, i) => {
			if (!g.length) return;
			const ks = [...new Set(g.map(x => x.chain))];
			const ladders = ks.map(k => g.filter(x => x.chain === k).sort((a, b) => a.j - b.j));
			const live = ladders.map(l => l.filter(x => !plan.stops.some(s => s.npcId === x.r.npcId && s.chain !== x.chain)));
			const r = orderLadders(live.map(l => l.map(x => npcById.get(x.r.npcId))), { start: bounds[i].from, end: bounds[i].to, effort: eff });
			const seq = r.order.map(o => live[o.k][o.j]);
			for (const l of ladders) for (const x of l) {
				if (seq.includes(x)) continue;
				let p = seq.findIndex(y => y.chain === x.chain && y.j > x.j);
				if (p < 0) { const own = seq.map((y, q) => (y.chain === x.chain ? q : -1)).filter(q => q >= 0); p = own.length ? own[own.length - 1] + 1 : seq.length; }
				seq.splice(p, 0, x);
			}
			out.push(...seq);
		});
		return out;
	};
	let best = lay(rungs);
	const stitch = early => {
		for (let pass = 0; pass < 2; pass++) {
			const seq = restitch(best);
			if (!seq) break;
			const again = lay(seq, early);
			if (!better(again, best)) break;
			best = again;
		}
	};
	if (eff >= 2 && pace !== 'fast' && stashes.length && best.stops.some(s => s.wharf)) {
		const nearestWay = lay(tagged(sequenceOf(0)));
		if (better(nearestWay, best)) best = nearestWay;
		stitch(false);
	}
	// The same run picking up the later lots' goods early, where the hold
	// takes them; the stretches between its calls shortened again, since
	// a lot that no longer goes home starts from wherever the ship is.
	if (eff >= 2 && pending.size) {
		const soon = lay(best.rungs, true);
		if (better(soon, best)) { best = soon; stitch(true); }
	}
	return best;
	};

	// The cut chosen for the shortest run, laid; and the cut the run was
	// laid in before there was a choice -- nearest first, chain after
	// chain, each lot filled as far as it goes -- laid beside it when it
	// differs, and kept when it is worth more an hour: a shorter run
	// that trades less is no gain, and the old way is the floor. Only
	// at full effort: a search judges hundreds of sets and lays each
	// once, and the run it settles on is laid in full after.
	const cutKey = c => c.map(l => l.map(x => x.id).sort().join('+')).join('|');
	let best = runCut(trips, effort);
	if (effort >= 2 && plainCut && cutKey(plainCut) !== cutKey(trips)) {
		const plain = runCut(plainCut, 0);
		if (better(plain, best)) best = plain;
	}
	return best;
}

/**
 * The run, loaded with what it will hand over and no more.
 *
 * What is loaded at the harbour was counted from what the first island
 * *offers* -- ten attempts, so ten goods -- before anything was known
 * about what the run would *do*. The hold, the Parley bar, a target
 * already met: any of them can cut the ten attempts to five, and the
 * other five goods then rode out to the island, rode back, and were
 * "left in storage" at the very wharf they were loaded from. Sam's ship
 * sailed a run over its weight limit, slower, for the sake of five
 * coins it was never going to trade.
 *
 * So the run is laid, what it really hands over is counted, and where
 * more was loaded than that it is laid again with the load held to it.
 * A lighter hold can only let more attempts in, never fewer, so the
 * second laying spends what the first did; the loop is there for the
 * odd case where it does not, and gives up after a few goes rather
 * than chase it.
 */
export function chainRun(opts = {}) {
	let plan = chainRunOnce(opts);
	const first = plan;
	const aboard = goodsHeld(opts.stock || {});
	// Loaded at the start or at a call back to the harbour for a later
	// lot: the same storage, counted together.
	const loadsOf = run => {
		const m = new Map();
		for (const l of [...run.loaded, ...run.stops.flatMap(x => x.loads || [])]) m.set(l.item, (m.get(l.item) || 0) + l.n);
		return [...m].map(([item, n]) => ({ item, n }));
	};
	const trimmed = new Set();
	for (let pass = 0; pass < 3 && (loadsOf(plan).length || plan.landLoaded.length); pass++) {
		const given = new Map();
		for (const s of plan.stops) if (s.npcId && s.give) given.set(s.give, (given.get(s.give) || 0) + (s.times || 0) * (s.giveN || 0));
		const cap = new Map(opts.loadCap || []), landCap = new Map(opts.landCap || []);
		let over = false;
		for (const l of loadsOf(plan)) {
			const need = Math.max(0, Math.ceil((given.get(l.item) || 0) - (aboard.get(l.item) || 0)));
			if (l.n > need) { cap.set(l.item, need); over = true; if (!need) trimmed.add(l.item); }
		}
		// Land goods loaded and never handed over rode the whole run for
		// nothing: laid again with the load held to what was spent.
		for (const l of plan.landLoaded) {
			const need = Math.max(0, Math.ceil(given.get(l.item) || 0));
			if (l.n > need + 1e-9) { landCap.set(l.item, need); over = true; }
		}
		if (!over) break;
		opts = { ...opts, loadCap: cap, landCap };
		plan = chainRunOnce(opts);
	}
	// A chain whose load the first laying could not spend -- the hold
	// full, the Parley gone -- is laid again with nothing loaded for it,
	// and then reads as "nothing left to hand over" beside a storage full
	// of it. The first laying's reason is the true one.
	if (trimmed.size && plan !== first) {
		plan.cut = plan.cut.map(c => {
			if (c.why !== 'nothing' || !trimmed.has(c.give)) return c;
			const was = first.cut.find(x => x.npcId === c.npcId && x.give === c.give);
			return was && was.why !== 'nothing' ? { ...c, ...was, chain: c.chain, done: c.done, of: c.of, top: c.top } : c;
		});
	}
	return plan;
}
