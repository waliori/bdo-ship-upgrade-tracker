// Where the sea's quests are handed in, on the chart, and how a run
// takes them in on the way.
//
// A quest names its steps in quests.js as [kind, place, who, what]:
// the kind a harbour ('port'), an island (its barterer's spot, 'isle')
// or a wharf (by its manager, 'wharf'), all of them placed on the
// chart already. The sailor is taken to have accepted every quest
// already -- they are given at Velia, Iliya and Oquilla's Eye, where
// every run passes -- so only the last step counts: where it is
// handed in. A hunt names the species whose grounds the Map draws: the
// run gets a stop at the grounds and hands the hunt in after; a barter quest asks
// for a number of barters, and is handed in only once the run's trades
// have made the number up.
//
// So a run laid out stop by stop can hand in whatever it passes, and
// put in a stop where a taker lies a short way off the route -- the
// sailor near a quest's taker does the quest while bartering, rather
// than sailing out for it another day.
//
// Pure: the quests, the places and a route come in, the route with the
// quest stops threaded in goes out. Distances are straight and in the
// chart's pixels (a quarter of a metre each): a stop counts as at a
// place within `near` of it, and a taker or a hunt's grounds are worth
// a stop when the way round by them is under `detour` longer.

import { ports, npcs } from './barter_npcs.js';
import { wharves } from './wharves.js';
import { monsterByKey } from './sea_monsters.js';

const KIND = {
	port: name => ports.find(p => p.name === name),
	isle: name => npcs.find(n => n.at === name),
	wharf: name => wharves.find(w => w.name === name)
};

/** A quest's steps, placed: [{ kind, place, who, what, x, y, i }] --
 *  `place` the name the chart knows the spot by, `i` the step's
 *  index. A step whose place the chart does not know is left out. */
export function placesOf(q) {
	return (q.at || []).map(([kind, name, who, what], i) => {
		const p = KIND[kind] && KIND[kind](name);
		if (!p) return null;
		return { kind, place: kind === 'wharf' ? `${p.at} wharf` : name, who, what, x: p.x, y: p.y, i };
	}).filter(Boolean);
}

/** Where a quest is handed in: its last placed step. */
export function handIn(q) {
	const steps = placesOf(q);
	return steps.length ? steps[steps.length - 1] : null;
}

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
const dist = (a, b) => Math.sqrt(d2(a, b));


/**
 * The quests laid along a route. `points` are the route's stops in
 * sailing order as { x, y }, the harbour it sails from first when it
 * has one; `quests` the ones to hand in (the caller leaves out what is
 * done and, unless the hunts are wanted, what needs a kill); `trades`
 * how many barters the run has made after each point, for the barter
 * quests, and `progress(q)` how many a barter quest has already.
 *
 * The answer is the route again with the quest stops threaded in:
 * `route` is a list of entries in sailing order, each { x, y } with
 * `fixed: true` and `i` (the point it was) or `quest: true` with the
 * place and the taker, and every entry carries `steps`, the quests
 * handed in there as { q, step }. A quest is handed in at the first
 * entry near its taker that comes late enough -- after the leg that
 * passes its grounds, or after the trades that make its count up --
 * and when none does, a stop is put in at the cheapest such place
 * on the way, if that is under `detour` longer and the stops put in
 * together under `share` of the run's length (one full detour at the
 * least) -- a quest in `forced` whatever the way round; else the quest goes to
 * `off` with why: 'far' and the distance, 'grounds' when no leg
 * passes them, 'short' with how many barters are still wanted after
 * this run. `legs` notes each hunt on the leg that passes its grounds
 * closest, by the index of the entry the leg ends at.
 */
export function layQuests(quests, points, { near = 1200, detour = 8000, share = 0.15, trades = null, progress = () => 0, forced = new Set() } = {}) {
	let route = points.map((p, i) => ({ x: p.x, y: p.y, fixed: true, i, steps: [] }));
	// The stops put in may lengthen the run by `share` of it in all --
	// a long leg would otherwise take a taker in cheaply, and the next,
	// and the next, until the run is a tour of the takers.
	let budget = Math.max(detour, share * points.slice(1).reduce((a, p, i) => a + dist(points[i], p), 0));
	const skipped = [];
	const legs = new Map();
	// The barters made by the time the run leaves entry k.
	const made = k => (trades ? route.slice(0, k + 1).reduce((a, e) => a + (e.fixed ? trades[e.i] || 0 : 0), 0) : 0);
	// The cheapest place on the way for a point, after entry `from`:
	// which entry to set it down before, and what the way round adds.
	const cheapest = (p, from) => {
		let best = Infinity, where = -1;
		for (let j = from > 0 ? from + 1 : 1; j <= route.length; j++) {
			const a = route[j - 1], b = route[j] || null;
			const cost = dist(a, p) + (b ? dist(p, b) - dist(a, b) : 0);
			if (cost < best) { best = cost; where = j; }
		}
		return { where, cost: best };
	};
	// Each quest's earliest entry, from its grounds or its count. A hunt
	// gets a stop of its own at the grounds -- the point of them the way
	// round by costs least, under the same rules as a taker -- and is
	// handed in after it; a hunt whose grounds lie too far off is set
	// aside, as is a barter quest the run's trades will not make up.
	const wants = [];
	for (const q of quests) {
		const step = handIn(q);
		if (!step) continue;
		let from = 0;
		const m = q.monster && monsterByKey[q.monster];
		const shared = m && route.find(e => e.hunt && e.hunt.key === m.key);
		if (shared) {
			// Grounds the run already stops at for another hunt of the same species.
			shared.steps.push({ q, step: { ...step, what: 'hunt', place: shared.place, who: m.name } });
			legs.get(shared).push({ q, monster: m, dist: 0 });
			from = route.indexOf(shared);
		} else if (m && m.points && m.points.length) {
			let best = null;
			for (const [x, y] of m.points) {
				const c = cheapest({ x, y }, 0);
				if (!best || c.cost < best.cost) best = { ...c, x, y };
			}
			const ok = best && best.where >= 0 && (forced.has(q.id) || (best.cost <= detour && best.cost <= budget));
			if (!ok) { skipped.push({ q, step, why: 'grounds', dist: best ? best.cost : Infinity }); continue; }
			if (!forced.has(q.id)) budget -= best.cost;
			const stop = { x: best.x, y: best.y, quest: true, hunt: { key: m.key, name: m.name }, place: `${m.name} grounds`, who: 'hunt', paid: forced.has(q.id) ? 0 : best.cost, steps: [{ q, step: { ...step, what: 'hunt', place: `${m.name} grounds`, who: m.name } }] };
			route = [...route.slice(0, best.where), stop, ...route.slice(best.where)];
			from = best.where;
			if (!legs.has(stop)) legs.set(stop, []);
			legs.get(stop).push({ q, monster: m, dist: 0 });
		}
		if (q.barters) {
			const have = progress(q);
			const total = trades ? trades.reduce((a, n) => a + (n || 0), 0) : 0;
			const k = route.findIndex((e, idx) => idx >= from && have + made(idx) >= q.barters);
			if (k < 0) { skipped.push({ q, step, why: 'short', have, adds: total, left: Math.max(0, q.barters - have - total) }); continue; }
			from = Math.max(from, k);
		}
		wants.push({ q, step, after: from > 0 ? route[from - 1] : null, grounds: m ? route.find(e => e.hunt && e.hunt.key === m.key) || null : null });
	}
	// A taker shared with a hunt is handed in after the hunt's grounds,
	// whatever the quest, so the run puts in at Oquilla's Eye once, after
	// the hunting, rather than once for the letters and once again for
	// the hunts.
	for (const w of wants) {
		if (route.some(e => e.fixed && d2(e, w.step) <= near * near)) continue;   // the run passes it anyway
		for (const h of wants) {
			if (h === w || !h.grounds || !h.after || d2(h.step, w.step) > near * near) continue;
			if (!w.after || route.indexOf(h.after) > route.indexOf(w.after)) w.after = h.after;
		}
	}
	// Handed in where the run already passes, if it passes late enough;
	// else a stop of its own -- the cheapest first, so a taker close by
	// is never crowded out by one further off taken in before it.
	const place = w => {
		const from = w.after ? route.indexOf(w.after) + 1 : 0;
		const k = route.findIndex((e, idx) => idx >= from && !e.hunt && d2(e, w.step) <= near * near);
		if (k >= 0) return { k, cost: 0 };
		// A stop of its own goes after the entry it must follow -- the
		// grounds, or the stop whose trades make the count up.
		return { k: -1, ...cheapest(w.step, from) };
	};
	while (wants.length) {
		let pick = -1, at = null;
		wants.forEach((w, i) => { const p = place(w); if (!at || p.cost < at.cost) { at = p; pick = i; } });
		const [w] = wants.splice(pick, 1);
		if (at.k >= 0) { route[at.k].steps.push({ q: w.q, step: w.step }); continue; }
		// A taker asked for by name is taken in whatever the way round.
		if (at.where < 0 || (!forced.has(w.q.id) && (at.cost > detour || at.cost > budget))) {
			skipped.push({ q: w.q, step: w.step, why: 'far', dist: at.cost });
			// A hunt that cannot be handed in leaves its grounds again; the
			// grounds stop goes too when no other hunt keeps it, its cost
			// given back.
			if (w.grounds) {
				w.grounds.steps = w.grounds.steps.filter(x => x.q !== w.q);
				legs.set(w.grounds, (legs.get(w.grounds) || []).filter(x => x.q !== w.q));
				if (!w.grounds.steps.length) { budget += w.grounds.paid || 0; legs.delete(w.grounds); route = route.filter(e => e !== w.grounds); }
			}
			continue;
		}
		if (!forced.has(w.q.id)) budget -= at.cost;
		route = [...route.slice(0, at.where), { x: w.step.x, y: w.step.y, quest: true, place: w.step.place, who: w.step.who, steps: [{ q: w.q, step: w.step }] }, ...route.slice(at.where)];
	}
	return { route, off: skipped, legs: new Map([...legs].map(([end, list]) => [route.indexOf(end), list])) };
}
