// Where the sea's quests are handed in, on the chart, and how a run
// takes them in on the way.
//
// A quest names its steps in quests.js as [kind, place, who, what]:
// the kind a harbour ('port'), an island (its barterer's spot, 'isle')
// or a wharf (by its manager, 'wharf'), all of them placed on the
// chart already. The sailor is taken to have accepted every quest
// already -- they are given at Velia, Iliya and Oquilla's Eye, where
// every run passes -- so only the last step counts: where it is
// handed in. A hunt names the species whose grounds the Map draws, and
// is handed in only after a leg has passed them; a barter quest asks
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
// place within `near` of it, a leg as passing grounds within `off` of
// its straight line, and a taker is worth a stop when the way round by
// it is under `detour` longer.

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

/** The distance from a point to the segment a-b. */
function toSegment(p, a, b) {
	const l2 = d2(a, b);
	if (l2 === 0) return dist(p, a);
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
	return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

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
 * least); else the quest goes to
 * `off` with why: 'far' and the distance, 'grounds' when no leg
 * passes them, 'short' with how many barters are still wanted after
 * this run. `legs` notes each hunt on the leg that passes its grounds
 * closest, by the index of the entry the leg ends at.
 */
export function layQuests(quests, points, { near = 1200, off = 8000, detour = 8000, share = 0.15, trades = null, progress = () => 0 } = {}) {
	let route = points.map((p, i) => ({ x: p.x, y: p.y, fixed: true, i, steps: [] }));
	// The stops put in may lengthen the run by `share` of it in all --
	// a long leg would otherwise take a taker in cheaply, and the next,
	// and the next, until the run is a tour of the takers.
	let budget = Math.max(detour, share * points.slice(1).reduce((a, p, i) => a + dist(points[i], p), 0));
	const skipped = [];
	const legs = new Map();
	// The barters made by the time the run leaves entry k.
	const made = k => (trades ? route.slice(0, k + 1).reduce((a, e) => a + (e.fixed ? trades[e.i] || 0 : 0), 0) : 0);
	// Each quest's earliest entry, from its grounds or its count, and
	// the leg past its grounds; a quest that cannot be taken in at all
	// is set aside at once.
	const wants = [];
	for (const q of quests) {
		const step = handIn(q);
		if (!step) continue;
		let from = 0;
		const m = q.monster && monsterByKey[q.monster];
		if (m && m.points && m.points.length) {
			// The first leg that passes the grounds, so the hand-in can be
			// as early as the run allows; the closest when none does, to say
			// how far off they lie.
			let firstLeg = -1, firstDist = Infinity, best = Infinity;
			for (let k = 0; k + 1 < route.length; k++) {
				let d0 = Infinity;
				for (const [x, y] of m.points) { const d = toSegment({ x, y }, route[k], route[k + 1]); if (d < d0) d0 = d; }
				if (d0 < best) best = d0;
				if (d0 <= off) { firstLeg = k; firstDist = d0; break; }
			}
			if (firstLeg < 0) { skipped.push({ q, step, why: 'grounds', dist: best }); continue; }
			from = firstLeg + 1;
			const end = route[firstLeg + 1];
			if (!legs.has(end)) legs.set(end, []);
			legs.get(end).push({ q, monster: m, dist: firstDist });
		}
		if (q.barters) {
			const have = progress(q);
			const total = trades ? trades.reduce((a, n) => a + (n || 0), 0) : 0;
			const k = route.findIndex((e, idx) => idx >= from && have + made(idx) >= q.barters);
			if (k < 0) { skipped.push({ q, step, why: 'short', have, adds: total, left: Math.max(0, q.barters - have - total) }); continue; }
			from = Math.max(from, k);
		}
		wants.push({ q, step, after: from > 0 ? route[from - 1] : null });
	}
	// Handed in where the run already passes, if it passes late enough;
	// else a stop of its own -- the cheapest first, so a taker close by
	// is never crowded out by one further off taken in before it.
	const place = w => {
		const from = w.after ? route.indexOf(w.after) + 1 : 0;
		const k = route.findIndex((e, idx) => idx >= from && d2(e, w.step) <= near * near);
		if (k >= 0) return { k, cost: 0 };
		let best = Infinity, where = -1;
		// A stop of its own goes after the entry it must follow -- the
		// leg's end, or the stop whose trades make the count up.
		for (let j = from > 0 ? from + 1 : 1; j <= route.length; j++) {
			const a = route[j - 1], b = route[j] || null;
			const cost = dist(a, w.step) + (b ? dist(w.step, b) - dist(a, b) : 0);
			if (cost < best) { best = cost; where = j; }
		}
		return { k: -1, where, cost: best };
	};
	while (wants.length) {
		let pick = -1, at = null;
		wants.forEach((w, i) => { const p = place(w); if (!at || p.cost < at.cost) { at = p; pick = i; } });
		const [w] = wants.splice(pick, 1);
		if (at.k >= 0) { route[at.k].steps.push({ q: w.q, step: w.step }); continue; }
		if (at.where < 0 || at.cost > detour || at.cost > budget) { skipped.push({ q: w.q, step: w.step, why: 'far', dist: at.cost }); continue; }
		budget -= at.cost;
		route = [...route.slice(0, at.where), { x: w.step.x, y: w.step.y, quest: true, place: w.step.place, who: w.step.who, steps: [{ q: w.q, step: w.step }] }, ...route.slice(at.where)];
	}
	return { route, off: skipped, legs: new Map([...legs].map(([end, list]) => [route.indexOf(end), list])) };
}
