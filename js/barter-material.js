// The run for a material: one route through every island ticked.
//
// The material list is ticked island by island, for one material or
// several, and the run is the whole of it sailed once: from the
// harbour, through every ticked island in the order that makes the
// shortest way, calling at a harbour where a give is kept, and home.
// The hold is the constraint. The gives an island takes weigh a
// thousand a piece and the materials they pay weigh nothing, so a run
// leaves heavy and comes back light -- and a hold cannot always carry
// every give at once. Two paces. 'fast' sails once, loaded to the
// limit the ship still sails at full speed under, and what does not
// fit stays ashore and says so. 'full' sails everything ticked: what
// the run will not spend is left in storage to make room, the hold is
// loaded to the barter ceiling, and when the gives still do not fit
// the run goes out in several departures, back to the harbour for the
// rest between them.
//
// Not every give is a trade good. A few islands take a Gold Bar 100G,
// which is bought ashore before casting off, and a few take a ship
// material -- Rock Salt Ingot for Cobalt Ingot -- out of the bags. The
// run counts both, and says what to buy and what it lacks.
//
// What is lacked does not stop the run being laid out. A sailor who
// holds none of a give still wants to see the route and what it would
// bring, so the run assumes the shortfall is got first -- in the start
// harbour's storage, or aboard when there is no harbour -- lays the
// route out with it, and lists it as the thing to get before casting
// off. `assume: false` plans only with what is held.
//
// Pure: the ticked exchanges, the wants, what is held where, the hold
// and the harbours come in; the stops in sailing order go out.
// Distances are straight lines, which is enough to order the stops;
// the screen bends the legs round the land.

import { levelOf } from './barter.js';
import { goodsHeld, weightHeld, weightOf } from './barter-plan.js';
import { isLandGood } from './land_goods.js';

const dist = (a, b) => (a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0);

/**
 * The shortest way through `points` ({ x, y }), as an order of their
 * indices: from `start` when given, ending at `end` when given, else
 * wherever it ends. Nearest-first for a beginning, then the path is
 * untangled two edges at a time until nothing shortens it -- for the
 * dozen or two islands a day ticks, that is as good as exact.
 */
export function tour(points, { start = null, end = null } = {}) {
	const n = points.length;
	if (n < 2) return points.map((_, i) => i);
	const d = (i, j) => dist(points[i], points[j]);
	// The path's cost with its fixed ends, if any.
	const cost = path => {
		let c = start ? dist(start, points[path[0]]) : 0;
		for (let k = 1; k < path.length; k++) c += d(path[k - 1], path[k]);
		if (end) c += dist(points[path[path.length - 1]], end);
		return c;
	};
	const nearestFrom = first => {
		const left = new Set(points.map((_, i) => i));
		const path = [];
		let at = first === null ? null : first;
		if (at !== null) { path.push(at); left.delete(at); }
		while (left.size) {
			let best = -1, bd = Infinity;
			for (const i of left) {
				const dd = at === null ? dist(start, points[i]) : d(at, i);
				if (dd < bd) { bd = dd; best = i; }
			}
			path.push(best); left.delete(best); at = best;
		}
		return path;
	};
	const untangle = path => {
		const p = path.slice();
		let better = true;
		while (better) {
			better = false;
			for (let i = 0; i < p.length - 1; i++) {
				for (let j = i + 1; j < p.length; j++) {
					// Reversing p[i..j] swaps the edge into i and the edge out
					// of j for the edges start->j and i->next.
					const inOld = i === 0 ? (start ? dist(start, points[p[i]]) : 0) : d(p[i - 1], p[i]);
					const outOld = j === p.length - 1 ? (end ? dist(points[p[j]], end) : 0) : d(p[j], p[j + 1]);
					const inNew = i === 0 ? (start ? dist(start, points[p[j]]) : 0) : d(p[i - 1], p[j]);
					const outNew = j === p.length - 1 ? (end ? dist(points[p[i]], end) : 0) : d(p[i], p[j + 1]);
					if (inNew + outNew < inOld + outOld - 1e-6) {
						let a = i, b = j;
						while (a < b) { [p[a], p[b]] = [p[b], p[a]]; a++; b--; }
						better = true;
					}
				}
			}
		}
		return p;
	};
	// With a start the nearest-first beginning is from it; without one
	// every island is tried as the first stop and the shortest kept.
	const firsts = start ? [null] : points.map((_, i) => i);
	let best = null, bc = Infinity;
	for (const f of firsts) {
		const p = untangle(nearestFrom(f));
		const c = cost(p);
		if (c < bc) { bc = c; best = p; }
	}
	return best;
}

/**
 * The run. `picks` are the exchanges ticked as showing today, rows as
 * exchanges() lists them; `wants` is material -> how many. `stock` is
 * what is aboard, `dock` the storage of the start harbour (`start`,
 * with `startWharf` its wharf), and `stores` every other storage with
 * trade goods in it, each { town, wharf, goods } -- `wharf` null where
 * the town has none. A store with a wharf is called at for a give kept
 * there when `calls` is set; anything else is held out of the run's
 * reach and said so. `bags` is the inventory of everything that is not
 * a trade good -- the Gold Bars and materials a few islands take -- and
 * `prices` (name -> { each, how }, as land-cost.js gives them) is what a
 * land good costs to buy ashore when `buy` is set. `reach` is 'want' to
 * stop once the wants are met or 'all' to deal every attempt ticked.
 * `hold` is { free, deal, max }.
 *
 * Returns { stops, got, waits, missing, noRoom, bought, cost, trades,
 * islands, calls, returns, weightStart, weightPeak, ticked }: the stops
 * in sailing order -- an island with its `times`, or a wharf with what
 * is loaded from and left in its storage -- each weighed after it; per
 * material the least and most that comes aboard and what is still
 * wanted; the gives to get first (`missing`: { give, n, kind, heldAt,
 * islands } -- what the run assumed got before casting off, or with
 * `assume` off what it went without; `kind` 'good' for a trade good to
 * climb for, 'material' for a ship material, 'land' for a land good
 * not bought, `heldAt` the storages holding some out of the run's
 * reach); the gives held that
 * the hold could not carry (`noRoom`); the land goods to buy before
 * casting off (`bought`: { item, n, each, how, total }) and their
 * `cost`; how many times the run went back to a harbour (`returns`).
 */
export function materialRun({ picks = [], wants = new Map(), reach = 'want', pace = 'full', calls = true, buy = true, assume = true, stock = {}, dock = {}, stores = [], bags = {}, prices = {}, hold, start = null, startWharf = null, npcById } = {}) {
	const wantOf = wants instanceof Map ? wants : new Map(Object.entries(wants));
	const limit = pace === 'fast' ? hold.free : (hold.deal ?? hold.free);
	const place = x => npcById.get(x.npcId);
	const isGood = name => levelOf(name) !== null;

	// Where each give can come from. A trade good: aboard, the start
	// harbour's storage, and -- when the orders allow a call -- the
	// other harbours, nearest to the start first. Anything else: the
	// bags, and for a land good the shop ashore.
	const aboard = goodsHeld(stock);
	const harbours = new Map();   // town -> { town, wharf, goods: Map }
	const stranded = [];          // storages the run cannot load from
	const home = start && startWharf ? { town: start.name, wharf: startWharf, goods: goodsHeld(dock) } : null;
	if (home && home.goods.size) harbours.set(start.name, home);
	for (const st of [...stores].sort((a, b) => dist(start, a.wharf) - dist(start, b.wharf))) {
		const goods = goodsHeld(st.goods);
		if (!goods.size || harbours.has(st.town)) continue;
		if (calls && st.wharf) harbours.set(st.town, { town: st.town, wharf: st.wharf, goods });
		else stranded.push({ town: st.town, goods });
	}
	const supply = new Map();   // give -> [{ src, n }], aboard first
	const supplyOf = give => {
		if (!supply.has(give)) {
			const out = [];
			if (isGood(give)) {
				if (aboard.get(give) > 0) out.push({ src: 'aboard', n: aboard.get(give) });
				for (const h of harbours.values()) if (h.goods.get(give) > 0) out.push({ src: h.town, n: h.goods.get(give) });
			} else {
				if (bags[give] > 0) out.push({ src: 'bags', n: Number(bags[give]) });
				if (buy && isLandGood(give)) out.push({ src: 'shop', n: Infinity });
			}
			// The shortfall, got first: into the start harbour's storage,
			// or aboard, or the bags, whichever the give would be in.
			if (assume) out.push({ src: isGood(give) ? (home ? home.town : 'aboard') : 'bags', n: Infinity, assumed: true });
			supply.set(give, out);
		}
		return supply.get(give);
	};
	const availOf = give => supplyOf(give).reduce((a, s) => a + s.n, 0);

	// How many times each ticked island deals: the want left of its
	// material, its attempts and what is held of its give allow. The
	// best rate is served first, then the nearest; what a give lacks is
	// what the item board has to climb for, or the bags to find.
	const mine = picks.filter(x => wantOf.has(x.item) && npcById.has(x.npcId));
	const need = new Map(wantOf);
	const missing = new Map();   // give -> { n, islands }
	mine.sort((a, b) => Number(availOf(b.give) > 0) - Number(availOf(a.give) > 0) || (b.recv / b.giveN) - (a.recv / a.giveN) || dist(start, place(a)) - dist(start, place(b)));
	const isles = [];
	const bought = new Map();   // land good -> n
	for (const x of mine) {
		const left = need.get(x.item) || 0;
		const want = reach === 'all' ? x.tries : Math.max(0, Math.ceil(left / x.recvMin - 1e-9));
		const canPay = Math.floor(availOf(x.give) / x.giveN + 1e-9);
		const times = Math.min(x.tries, want, canPay);
		if (want > 0 && times < Math.min(x.tries, want)) {
			const m = missing.get(x.give) || { n: 0, islands: [] };
			m.n += (Math.min(x.tries, want) - times) * x.giveN;
			m.islands.push(place(x));
			missing.set(x.give, m);
		}
		if (times < 1) continue;
		let due = times * x.giveN;
		const needs = [];
		for (const s of supplyOf(x.give)) {
			if (due <= 1e-9) break;
			const take = Math.min(s.n, due);
			if (take <= 1e-9) continue;
			s.n -= take; due -= take;
			if (s.src === 'shop') bought.set(x.give, (bought.get(x.give) || 0) + take);
			if (s.assumed) {
				const m = missing.get(x.give) || { n: 0, islands: [] };
				m.n += take;
				if (!m.islands.includes(place(x))) m.islands.push(place(x));
				missing.set(x.give, m);
				if (isGood(x.give)) {
					if (home) { home.goods.set(x.give, (home.goods.get(x.give) || 0) + take); harbours.set(home.town, home); }
					else aboard.set(x.give, (aboard.get(x.give) || 0) + take);
				}
			}
			// What is aboard or in the bags, or bought ashore, sails with
			// the run from the start; the rest waits at a harbour.
			needs.push({ src: s.src, give: x.give, n: take, loaded: s.src === 'aboard' || s.src === 'bags' || s.src === 'shop' });
		}
		need.set(x.item, left - times * x.recvMin);
		isles.push({ ...x, times, needs, level: levelOf(x.give) || 0, hold });
	}

	// The run, sailed. First the start harbour, where the ship is: what
	// the run will not spend is left in its storage when the room is
	// wanted, and what its storage keeps for the run is loaded, as much
	// as the hold takes. Then the islands whose gives are aboard, by the
	// shortest way; then the nearest harbour a give waits at, loaded the
	// same way; and so on until every island is dealt with or set aside.
	const heldMax = new Map(aboard);   // aboard, weighed at the most
	let weight = weightHeld(heldMax);
	const weightStart = weight;
	let peak = weight;
	let pos = start;
	const stops = [];
	const noRoom = new Map();   // give -> { n, islands }
	const called = new Map();   // town -> times called
	let returns = 0;
	const pending = [...isles];
	const setAside = (isle, n, giveName) => {
		const m = noRoom.get(giveName) || { n: 0, islands: [] };
		m.n += n;
		if (!m.islands.includes(place(isle))) m.islands.push(place(isle));
		noRoom.set(giveName, m);
	};
	const drop = isle => { pending.splice(pending.indexOf(isle), 1); };
	// What is aboard that no pending island spends: dead weight, left
	// ashore when the room is wanted.
	const spare = () => {
		const spent = new Map();
		for (const i of pending) for (const nd of i.needs) if (nd.loaded && isGood(nd.give)) spent.set(nd.give, (spent.get(nd.give) || 0) + nd.n);
		return [...heldMax].map(([name, n]) => [name, n - (spent.get(name) || 0)]).filter(([, n]) => n > 1e-9);
	};
	const nextHarbour = () => {
		let best = null, bd = Infinity;
		for (const h of harbours.values()) {
			if (!pending.some(i => i.needs.some(nd => !nd.loaded && nd.src === h.town))) continue;
			const dd = pos ? dist(pos, h.wharf) : -[...h.goods.values()].reduce((a, n) => a + n, 0);
			if (dd < bd) { bd = dd; best = h; }
		}
		return best;
	};
	const weighs = nds => nds.reduce((a, nd) => a + nd.n * weightOf(nd.give), 0);

	// A call at harbour `H`: the islands it feeds in the order a run
	// from here would take them, so a departure that cannot take them
	// all takes the ones that go together; what is not spent left
	// ashore when the room is wanted; then each island's gives loaded
	// while they fit. Returns whether anything happened.
	const callAt = H => {
		const stop = { wharf: H.wharf, dropped: [], sale: null, loads: [], hold };
		const feeds = pending.filter(i => i.needs.some(nd => !nd.loaded && nd.src === H.town));
		const seq = tour(feeds.map(place), { start: H.wharf }).map(k => feeds[k]);
		const loadOf = i => i.needs.filter(nd => !nd.loaded && nd.src === H.town);
		if (weight + weighs(seq.flatMap(loadOf)) > limit + 1e-6) {
			for (const [name, n] of spare()) {
				heldMax.set(name, heldMax.get(name) - n);
				if (heldMax.get(name) <= 1e-9) heldMax.delete(name);
				stop.dropped.push({ item: name, n });
			}
			weight = weightHeld(heldMax);
		}
		let loaded = 0;
		const load = nd => {
			nd.loaded = true;
			H.goods.set(nd.give, H.goods.get(nd.give) - nd.n);
			const l = stop.loads.find(x => x.item === nd.give);
			if (l) l.n += nd.n; else stop.loads.push({ item: nd.give, n: nd.n });
			heldMax.set(nd.give, (heldMax.get(nd.give) || 0) + nd.n);
		};
		for (const isle of seq) {
			const nds = loadOf(isle);
			if (weight + weighs(nds) <= limit + 1e-6) {
				nds.forEach(load);
				weight = weightHeld(heldMax);
				loaded++;
				continue;
			}
			// No room for this island's gives on this departure. A fast
			// run has only the one, so they stay ashore; a full run comes
			// back for them once the hold is empty -- unless nothing has
			// been loaded here yet, when the hold is as light as it gets
			// and they will never fit: then as many attempts as do.
			if (pace === 'full' && loaded) continue;
			const each = isle.giveN * weightOf(isle.give);
			const fit = pace === 'full' && each > 0 && nds.length === 1 ? Math.floor((limit - weight) / each + 1e-9) : 0;
			if (fit >= 1) {
				const cut = (isle.times - fit) * isle.giveN;
				isle.times = fit;
				nds[0].n -= cut;
				setAside(isle, cut, isle.give);
				load(nds[0]);
				weight = weightHeld(heldMax);
				loaded++;
			} else {
				for (const nd of isle.needs) if (!nd.loaded) setAside(isle, nd.n, nd.give);
				drop(isle);
			}
		}
		if (!loaded && !stop.dropped.length) {
			// Nothing could be loaded here and nothing was left: the rest
			// this harbour feeds cannot sail.
			for (const isle of seq) if (pending.includes(isle)) {
				for (const nd of isle.needs) if (!nd.loaded) setAside(isle, nd.n, nd.give);
				drop(isle);
			}
			return false;
		}
		peak = Math.max(peak, weight);
		stop.weightAfter = weight;
		stops.push(stop);
		if (called.get(H.town)) returns++;
		called.set(H.town, (called.get(H.town) || 0) + 1);
		pos = H.wharf;
		return true;
	};

	// The start harbour first: its storage is loaded before casting
	// off, and what the run will not spend is left there rather than
	// carried round the sea.
	if (home) {
		if (harbours.has(home.town)) callAt(home);
		else if (weight > limit + 1e-6 && spare().length) {
			const stop = { wharf: startWharf, dropped: [], sale: null, loads: [], hold };
			for (const [name, n] of spare()) {
				heldMax.set(name, heldMax.get(name) - n);
				if (heldMax.get(name) <= 1e-9) heldMax.delete(name);
				stop.dropped.push({ item: name, n });
			}
			weight = weightHeld(heldMax);
			stop.weightAfter = weight;
			stops.push(stop);
			called.set(start.name, 1);
			pos = startWharf;
		}
	}

	// The hold at its fullest is what the run sails with, not what was
	// aboard at the pier before the storage took its share.
	peak = weight;

	let guard = 0;
	while (pending.length && guard++ < 1000) {
		const ready = pending.filter(i => i.needs.every(nd => nd.loaded));
		if (ready.length) {
			const H = nextHarbour();
			const order = tour(ready.map(place), { start: pos, end: H ? H.wharf : null });
			for (const k of order) {
				const isle = ready[k];
				for (const nd of isle.needs) {
					if (!isGood(nd.give)) continue;
					heldMax.set(nd.give, (heldMax.get(nd.give) || 0) - nd.n);
					if (heldMax.get(nd.give) <= 1e-9) heldMax.delete(nd.give);
				}
				if (weightOf(isle.item) > 0) heldMax.set(isle.item, (heldMax.get(isle.item) || 0) + isle.times * isle.recvMax);
				weight = weightHeld(heldMax);
				peak = Math.max(peak, weight);
				stops.push({ ...isle, weightAfter: weight });
				pos = place(isle);
				drop(isle);
			}
			continue;
		}
		const H = nextHarbour();
		if (!H) break;
		callAt(H);
	}

	const islands = stops.filter(s => s.npcId);
	const got = new Map([...wantOf.keys()].map(m => [m, { min: 0, max: 0 }]));
	for (const s of islands) { const g = got.get(s.item); g.min += s.times * s.recvMin; g.max += s.times * s.recvMax; }
	const waits = new Map([...wantOf].map(([m, q]) => [m, Math.max(0, q - got.get(m).min)]));
	// What is short, and where some of it sits out of the run's reach:
	// a storage without a wharf, or a harbour the orders do not call at.
	const heldAt = give => stranded.filter(st => st.goods.get(give) > 0).map(st => ({ town: st.town, n: st.goods.get(give) }));
	const boughtRows = [...bought].map(([item, n]) => {
		const p = prices[item] || { each: 0, how: 'unpriced' };
		return { item, n, each: p.each, how: p.how, total: Math.ceil(n) * p.each };
	});
	return {
		stops, got, waits,
		missing: [...missing].map(([give, m]) => ({ give, ...m, kind: isGood(give) ? 'good' : isLandGood(give) ? 'land' : 'material', heldAt: isGood(give) ? heldAt(give) : [] })),
		noRoom: [...noRoom].map(([give, m]) => ({ give, ...m })),
		bought: boughtRows,
		cost: boughtRows.reduce((a, b) => a + b.total, 0),
		trades: islands.reduce((a, s) => a + s.times, 0),
		islands: islands.length,
		calls: stops.filter(s => s.wharf).length,
		returns,
		weightStart, weightPeak: peak,
		ticked: mine.length
	};
}
