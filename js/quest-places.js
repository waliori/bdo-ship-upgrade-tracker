// Where the sea's quests are done, on the chart, and which of them lie
// along a run.
//
// A quest names its steps in quests.js as [kind, place, who, what]:
// the kind a harbour ('port'), an island (its barterer's spot, 'isle')
// or a wharf (by its manager, 'wharf'), all of them placed on the
// chart already; a hunt names the species whose grounds the Map draws.
// So a run laid out stop by stop can say, at each stop, which quests
// are taken, done or handed in there, and on each leg which grounds
// it passes -- the sailor near a quest's giver does the quest while
// bartering, rather than sailing out for it another day.
//
// Pure: the quests, the places and a route come in, the notes go out.
// Distances are straight and in the chart's pixels (a quarter of a
// metre each); a stop counts as at a place within `near` of it, a leg
// as passing grounds within `off` of its straight line.

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

const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** The distance from a point to the segment a-b. */
function toSegment(p, a, b) {
	const l2 = d2(a, b);
	if (l2 === 0) return Math.sqrt(d2(p, a));
	const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
	return Math.sqrt(d2(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }));
}

/**
 * The quests along a route. `points` are the route's stops in sailing
 * order as { x, y } -- the harbour it sails from first, when it has
 * one -- and `quests` the ones to consider (the caller leaves out what
 * is done). The answer is, by point, the steps done there:
 * { q, step } with `step` as placesOf gives it; and by leg (leg k runs
 * from point k to point k + 1), the hunts whose grounds it passes:
 * { q, monster, dist } with `dist` the nearest ground in pixels, each
 * hunt on the one leg that passes its grounds closest. A
 * quest with two steps -- taken at one place, handed in at another --
 * is noted at both -- the taking only when the handing in comes later
 * on the route -- and a step is noted once at the first point it is
 * near, so a harbour called at twice does not list it twice.
 */
export function questsAlong(quests, points, { near = 2500, off = 8000 } = {}) {
	const at = new Map();
	const legs = new Map();
	const note = (map, k, x) => { if (!map.has(k)) map.set(k, []); map.get(k).push(x); };
	for (const q of quests) {
		// A step taken somewhere is worth noting only when a later step
		// of the quest comes later on the route: goods taken at Velia for
		// an island the run never reaches are not this run's business.
		const steps = placesOf(q).map(step => ({ step, k: points.findIndex(p => d2(p, step) <= near * near) }));
		steps.forEach(({ step, k }, i) => {
			if (k < 0) return;
			if (step.what === 'take' && !steps.slice(i + 1).some(x => x.k > k)) return;
			note(at, k, { q, step });
		});
		// A hunt is noted once, on the leg that passes its grounds closest.
		const m = q.monster && monsterByKey[q.monster];
		if (m && m.points && m.points.length) {
			let bestLeg = -1, best = Infinity;
			for (let k = 0; k + 1 < points.length; k++) {
				for (const [x, y] of m.points) { const d = toSegment({ x, y }, points[k], points[k + 1]); if (d < best) { best = d; bestLeg = k; } }
			}
			if (bestLeg >= 0 && best <= off) note(legs, bestLeg, { q, monster: m, dist: best });
		}
	}
	return { at, legs, count: new Set([...[...at.values()].flat().map(x => x.q.id), ...[...legs.values()].flat().map(x => x.q.id)]).size };
}
