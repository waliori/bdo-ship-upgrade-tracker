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
// Pure: the ticked exchanges, the wants, what is held where, the hold
// and the harbours come in; the stops in sailing order go out.
// Distances are straight lines, which is enough to order the stops;
// the screen bends the legs round the land.

import { levelOf } from './barter.js';
import { goodsHeld, weightHeld, weightOf } from './barter-plan.js';

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
 * what is aboard, `dock` the storage of the start harbour (loaded at
 * the start, which is `start` with `startWharf` its wharf), and
 * `elsewhere` the other harbours with a storage and a wharf, each
 * { town, wharf, goods }, called at for a give kept there when `calls`
 * is set. `reach` is 'want' to stop once the wants are met or 'all'
 * to deal every attempt ticked. `hold` is { free, deal, max }.
 *
 * Returns { stops, got, waits, missing, noRoom, trades, islands,
 * calls, returns, weightStart, weightPeak, ticked }: the stops in
 * sailing order -- an island with its `times`, or a wharf with what
 * is loaded from and left in its storage -- each weighed after it;
 * per material the least and most that comes aboard and what is still
 * wanted; the gives not held at all (`missing`, to climb for) and the
 * gives held that the hold could not carry (`noRoom`); how many times
 * the run went back to a harbour for more (`returns`).
 */
export function materialRun({ picks = [], wants = new Map(), reach = 'want', pace = 'full', calls = true, stock = {}, dock = {}, elsewhere = [], hold, start = null, startWharf = null, npcById } = {}) {
	const wantOf = wants instanceof Map ? wants : new Map(Object.entries(wants));
	const limit = pace === 'fast' ? hold.free : (hold.deal ?? hold.free);
	const place = x => npcById.get(x.npcId);

	// Where each give can come from: aboard, the start harbour's
	// storage, and -- when the orders allow a call -- the other
	// harbours, nearest to the start first.
	const aboard = goodsHeld(stock);
	const harbours = new Map();   // town -> { town, wharf, goods: Map }
	if (start && startWharf && Object.keys(dock).length) harbours.set(start.name, { town: start.name, wharf: startWharf, goods: goodsHeld(dock) });
	if (calls) {
		for (const h of [...elsewhere].sort((a, b) => dist(start, a.wharf) - dist(start, b.wharf))) {
			if (harbours.has(h.town) || !h.wharf) continue;
			const goods = goodsHeld(h.goods);
			if (goods.size) harbours.set(h.town, { town: h.town, wharf: h.wharf, goods });
		}
	}
	const supply = new Map();   // give -> [{ src, n }], aboard first
	const supplyOf = give => {
		if (!supply.has(give)) {
			const out = [];
			if (aboard.get(give) > 0) out.push({ src: 'aboard', n: aboard.get(give) });
			for (const h of harbours.values()) if (h.goods.get(give) > 0) out.push({ src: h.town, n: h.goods.get(give) });
			supply.set(give, out);
		}
		return supply.get(give);
	};
	const availOf = give => supplyOf(give).reduce((a, s) => a + s.n, 0);

	// How many times each ticked island deals: the want left of its
	// material, its attempts and what is held of its give allow. The
	// best rate is served first, then the nearest; what a give lacks is
	// what the item board has to climb for.
	const mine = picks.filter(x => wantOf.has(x.item) && npcById.has(x.npcId));
	const need = new Map(wantOf);
	const missing = new Map();   // give -> { n, islands }
	mine.sort((a, b) => Number(availOf(b.give) > 0) - Number(availOf(a.give) > 0) || (b.recv / b.giveN) - (a.recv / a.giveN) || dist(start, place(a)) - dist(start, place(b)));
	const isles = [];
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
			needs.push({ src: s.src, give: x.give, n: take, loaded: s.src === 'aboard' });
		}
		need.set(x.item, left - times * x.recvMin);
		isles.push({ ...x, times, needs, level: levelOf(x.give) || 0, hold });
	}

	// The run, sailed: the islands whose gives are aboard, by the
	// shortest way; then the nearest harbour a give waits at, loaded
	// with as much as the hold takes; and so on until every island is
	// dealt with or set aside.
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
	// ashore under a full pace when the room is wanted.
	const spare = () => {
		const spent = new Map();
		for (const i of pending) for (const nd of i.needs) if (nd.loaded) spent.set(nd.give, (spent.get(nd.give) || 0) + nd.n);
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

	let guard = 0;
	while (pending.length && guard++ < 1000) {
		const ready = pending.filter(i => i.needs.every(nd => nd.loaded));
		if (ready.length) {
			const H = nextHarbour();
			const order = tour(ready.map(place), { start: pos, end: H ? H.wharf : null });
			for (const k of order) {
				const isle = ready[k];
				for (const nd of isle.needs) { heldMax.set(nd.give, (heldMax.get(nd.give) || 0) - nd.n); if (heldMax.get(nd.give) <= 1e-9) heldMax.delete(nd.give); }
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
		const stop = { wharf: H.wharf, dropped: [], sale: null, loads: [], hold };
		// The islands this harbour feeds, in the order a run from here
		// would take them, so a departure that cannot take them all
		// takes the ones that go together.
		const feeds = pending.filter(i => i.needs.some(nd => !nd.loaded && nd.src === H.town));
		const seq = tour(feeds.map(place), { start: H.wharf }).map(k => feeds[k]);
		const loadOf = i => i.needs.filter(nd => !nd.loaded && nd.src === H.town);
		const weighs = nds => nds.reduce((a, nd) => a + nd.n * weightOf(nd.give), 0);
		if (pace === 'full' && weight + weighs(seq.flatMap(loadOf)) > limit + 1e-6) {
			for (const [name, n] of spare()) {
				heldMax.set(name, heldMax.get(name) - n);
				if (heldMax.get(name) <= 1e-9) heldMax.delete(name);
				stop.dropped.push({ item: name, n });
			}
			weight = weightHeld(heldMax);
		}
		let loaded = 0;
		for (const isle of seq) {
			const nds = loadOf(isle);
			const lw = weighs(nds);
			if (weight + lw <= limit + 1e-6) {
				for (const nd of nds) {
					nd.loaded = true;
					H.goods.set(nd.give, H.goods.get(nd.give) - nd.n);
					const l = stop.loads.find(x => x.item === nd.give);
					if (l) l.n += nd.n; else stop.loads.push({ item: nd.give, n: nd.n });
					heldMax.set(nd.give, (heldMax.get(nd.give) || 0) + nd.n);
				}
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
				need.set(isle.item, (need.get(isle.item) || 0) + (cut / isle.giveN) * isle.recvMin);
				setAside(isle, cut, isle.give);
				nds[0].loaded = true;
				H.goods.set(nds[0].give, H.goods.get(nds[0].give) - nds[0].n);
				stop.loads.push({ item: nds[0].give, n: nds[0].n });
				heldMax.set(nds[0].give, (heldMax.get(nds[0].give) || 0) + nds[0].n);
				weight = weightHeld(heldMax);
				loaded++;
			} else {
				for (const nd of isle.needs) if (!nd.loaded) setAside(isle, nd.n, nd.give);
				need.set(isle.item, (need.get(isle.item) || 0) + isle.times * isle.recvMin);
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
			continue;
		}
		peak = Math.max(peak, weight);
		stop.weightAfter = weight;
		stops.push(stop);
		if (called.get(H.town)) returns++;
		called.set(H.town, (called.get(H.town) || 0) + 1);
		pos = H.wharf;
	}

	const islands = stops.filter(s => s.npcId);
	const got = new Map([...wantOf.keys()].map(m => [m, { min: 0, max: 0 }]));
	for (const s of islands) { const g = got.get(s.item); g.min += s.times * s.recvMin; g.max += s.times * s.recvMax; }
	const waits = new Map([...wantOf].map(([m, q]) => [m, Math.max(0, q - got.get(m).min)]));
	return {
		stops, got, waits,
		missing: [...missing].map(([give, m]) => ({ give, ...m })),
		noRoom: [...noRoom].map(([give, m]) => ({ give, ...m })),
		trades: islands.reduce((a, s) => a + s.times, 0),
		islands: islands.length,
		calls: stops.filter(s => s.wharf).length,
		returns,
		weightStart, weightPeak: peak,
		ticked: mine.length
	};
}
