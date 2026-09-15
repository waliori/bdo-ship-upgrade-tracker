// The day's errands, as one loop.
//
// The Snuggle Sailies Route in courses.js is a fixed line: someone
// sailed the sea until they knew it, drew three loops, and they have
// been right ever since because the islands do not move. What moves is
// the day. A sailor with eleven dailies and six weeklies outstanding
// has a different problem from one with three, and the hunts among
// them are not a place but a choice of places -- the Hekaru have four
// grounds, the Black Rust three, and which one is right depends on
// everything else being done that day.
//
// So this one is worked out rather than drawn. Given the quests still
// to do it picks a ground for each hunt, orders every call, and hands
// back a course of the same shape as the fixed ones -- plus, for each
// stop, what is done there and how many of it.
//
// Three things it holds to:
//
//   * A hunt comes before the man who pays for it. The game will not
//     take a kill you have not made, so a ground is never visited after
//     its hand-in; the loop is built so that cannot happen rather than
//     checked afterwards.
//   * A ground is chosen, not given. Each species offers its habitat
//     markers -- the game's own -- or, where it has none, the clusters
//     its spawn points fall into; the one that costs least to reach
//     given everything else wins.
//   * Any young one is any young one. The three quests that ask for
//     young sea monsters do not care which, so they are paid by
//     whatever young ground the loop already passes.
//
// On distance, two answers are wanted and they are not the same one.
// Putting the calls in order asks for the distance between every pair
// of them -- four hundred legs for a twenty-call day -- and a leg bent
// round land by searoute.js is an A* search over the sea mask, which
// is six or seven seconds for the set. Measured both ways, the order
// that comes out of true sailing distances is under two per cent
// shorter than the one that comes out of straight lines, because these
// legs are long and the sea is mostly open. So the ordering is done on
// straight lines, in about ten milliseconds, and the loop that comes
// out of it is then measured properly, leg by leg, on the water -- one
// pass of twenty rather than four hundred. The number the panel shows
// is the real one.
//
// Pure: the quests, where to start, and the tables come in; a course
// goes out. Nothing is read from the store here.

import { monsterByKey } from './sea_monsters.js';
import { handIn } from './quest-places.js';
import { seaLeg } from './searoute.js';

/**
 * A leg's length, following the water.
 *
 * Kept, because the ordering asks for the same leg thousands of times:
 * every call lifted out and set down again re-measures most of the
 * loop, and a leg through the Balenos islands is an A* search. The key
 * is the pair of positions, so a ground offered at the same point by
 * two different passes is measured once.
 */
function measurer() {
	const seen = new Map();
	const at = p => `${Math.round(p.x)},${Math.round(p.y)}`;
	return (a, b) => {
		const key = `${at(a)}|${at(b)}`;
		let n = seen.get(key);
		if (n !== undefined) return n;
		const pts = seaLeg(a, b);
		n = 0;
		for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
		seen.set(key, n);
		seen.set(`${at(b)}|${at(a)}`, n);
		return n;
	};
}

/** Chart units to kilometres: a unit is a quarter of a metre. */
export const km = n => n * 0.25 / 1000;

/** Two places are the same call if they are within a ship's length. */
const SAME = 900;

/**
 * Where a species can be hunted, as a short list of candidate grounds.
 *
 * The habitat markers are the game's own and are what a player would
 * steer for, so they come first. A species with none -- every young
 * one, and the Cox Pirates -- gets its spawn points bucketed on a
 * coarse grid and each busy bucket's centre offered instead, which is
 * what a "ground" means for something that is scattered.
 */
export function groundsOf(m, cell = 9000, least = 4) {
	if (!m) return [];
	if (m.zones && m.zones.length) return m.zones.map(([x, y]) => ({ x, y }));
	if (!m.points || !m.points.length) return [];
	const buckets = new Map();
	for (const [x, y] of m.points) {
		const k = `${Math.floor(x / cell)}|${Math.floor(y / cell)}`;
		const b = buckets.get(k) || { x: 0, y: 0, n: 0 };
		b.x += x; b.y += y; b.n++;
		buckets.set(k, b);
	}
	const busy = [...buckets.values()].filter(b => b.n >= least).sort((a, b) => b.n - a.n);
	const use = busy.length ? busy : [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 1);
	return use.slice(0, 6).map(b => ({ x: b.x / b.n, y: b.y / b.n }));
}

/** The kills a set of quests wants, by species, and which quests want them. */
function huntsOf(quests) {
	const by = new Map();
	for (const q of quests) {
		if (!q.monster || !q.kills) continue;
		// A quest that will take any young one is not a hunt of its own:
		// it rides along on whichever young ground the loop already
		// visits, and is only given a ground of its own if none does.
		const m = monsterByKey[q.monster];
		if (!m) continue;
		const h = by.get(q.monster) || { key: q.monster, monster: m, kills: 0, quests: [], loose: [] };
		if (q.any) h.loose.push(q); else { h.kills += q.kills; h.quests.push(q); }
		by.set(q.monster, h);
	}
	return [...by.values()];
}

/** A call on the loop, and the two kinds of thing it can be. */
const call = (name, x, y, kind) => ({ name, x, y, kind, todo: [] });

/** What to call a hunting ground that one or more species share. */
const groundName = list => list.length === 1
	? `${list[0].name} ground`
	: `${list.slice(0, -1).map(s => s.name).join(', ')} and ${list[list.length - 1].name} ground`;

/**
 * The cheapest place to put a point into a route, and what it costs.
 * `after` is the earliest index it may follow, for a call that must
 * come after something else.
 */
function cheapest(sail, route, p, after = 0, closed = false) {
	let best = Infinity, where = -1;
	// A closed loop's last call is the way home and nothing goes after it.
	const end = closed ? route.length - 1 : route.length;
	for (let i = Math.max(1, after + 1); i <= end; i++) {
		const a = route[i - 1], b = route[i] || null;
		const cost = sail(a, p) + (b ? sail(p, b) - sail(a, b) : 0);
		if (cost < best) { best = cost; where = i; }
	}
	return { where, cost: best };
}

/** The length of a route, and of the loop that closes it. */
function length(sail, route) {
	let n = 0;
	for (let i = 1; i < route.length; i++) n += sail(route[i - 1], route[i]);
	return n;
}

/**
 * The day's loop.
 *
 * `quests` are the ones still to do -- the caller has already dropped
 * what is done and settled which of a one-a-day group is wanted.
 * `from` is the harbour it starts and ends at. `back` closes the loop
 * there; a sailor who means to stop where the last hand-in is can ask
 * for an open line instead.
 *
 * What comes back: `points` for the chart, `stops` for the panel --
 * each with what is done there -- `left` for the quests that could not
 * be placed, and the loop's length.
 */
export function questCourse(quests, from, { back = true, water = false } = {}) {
	const wants = (quests || []).filter(q => handIn(q));
	if (!from || !wants.length) return null;
	// `water` orders on sailing distance instead, which is better by
	// about two per cent and slower by about five hundred times. It is
	// here for the test that keeps that claim honest, not for the page.
	const sail = water ? measurer() : (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

	const start = call(from.name || 'harbour', from.x, from.y, 'port');
	let route = [start];
	// A loop comes home, so what is handed in at the home port is handed
	// in at the end of the day, not before it has been earned. The home
	// call is doubled -- once to leave from, once to come back to -- and
	// the second one takes those hand-ins. An open line has no second
	// call and keeps them where they are.
	const home = back ? call(start.name, start.x, start.y, 'port') : start;
	if (back) route.push(home);

	// The hand-ins first: they are where the day is actually finished,
	// and every hunt is then fitted in front of the man who pays for it
	// rather than the other way round.
	const handOf = new Map();
	for (const q of wants) {
		const step = handIn(q);
		let at = route.find(c => Math.hypot(c.x - step.x, c.y - step.y) <= SAME);
		if (at === start && back) at = home;
		if (!at) {
			at = call(step.place, step.x, step.y, 'hand');
			const put = cheapest(sail, route, at, 0, back);
			route.splice(put.where, 0, at);
		}
		at.todo.push({ q, what: 'hand in', who: step.who });
		handOf.set(q.id, at);
	}

	// Then the hunts, each with its choice of ground: every candidate
	// ground against every place it could go in, and the cheapest that
	// still lands in front of every hand-in that waits on it.
	const left = [];
	const hunts = huntsOf(wants).sort((a, b) => b.kills - a.kills);
	for (const h of hunts) {
		if (!h.quests.length) continue;
		const last = Math.min(...h.quests.map(q => route.indexOf(handOf.get(q.id))));
		let best = null;
		for (const g of groundsOf(h.monster)) {
			// Room is needed before the first hand-in that waits on it.
			const put = cheapest(sail, route.slice(0, last), g, 0, false);
			if (put.where < 0) continue;
			if (!best || put.cost < best.cost) best = { ...put, ...g };
		}
		if (!best) { for (const q of h.quests) left.push({ q, why: 'no ground on the chart' }); continue; }
		// Two species can share a ground -- the game's markers overlap,
		// and the Candidum, Nineshark and Black Rust all have one at the
		// same spot -- so a hunt that lands where the loop already calls
		// joins that call instead of adding another beside it.
		let at = route.find((c, i) => c.kind === 'hunt' && i < last && Math.hypot(c.x - best.x, c.y - best.y) <= SAME);
		if (!at) {
			at = call('', best.x, best.y, 'hunt');
			at.species = [];
			route.splice(best.where, 0, at);
		}
		at.species.push({ key: h.key, name: h.monster.name, kills: h.kills });
		at.hunt = at.species[0];
		at.name = groundName(at.species);
		for (const q of h.quests) at.todo.push({ q, what: 'kill', n: q.kills, of: h.monster.name });
	}

	// The young-sea-monster quests take whatever young one the loop
	// already passes; only if it passes none does one get a ground.
	const loose = hunts.flatMap(h => h.loose);
	if (loose.length) {
		const young = route.filter(c => c.hunt && (monsterByKey[c.hunt.key] || {}).kind === 'young');
		for (const q of loose) {
			const hand = route.indexOf(handOf.get(q.id));
			const at = young.find(c => route.indexOf(c) < hand)
				|| (() => {
					const m = monsterByKey[q.monster];
					const g = groundsOf(m)[0];
					if (!g) return null;
					const put = cheapest(sail, route.slice(0, hand), g, 0, false);
					if (put.where < 0) return null;
					const made = call(groundName([m]), g.x, g.y, 'hunt');
					made.species = [{ key: m.key, name: m.name, kills: 0 }];
					made.hunt = made.species[0];
					route.splice(put.where, 0, made);
					young.push(made);
					return made;
				})();
			if (!at) { left.push({ q, why: 'no young ground before its hand-in' }); continue; }
			at.todo.push({ q, what: 'kill', n: q.kills, of: 'young sea monsters, any' });
			at.hunt.kills += q.kills;
		}
	}

	// A pass of or-opt: take each call out and put it back wherever it
	// is cheapest, so long as nothing ends up in front of its hunt. The
	// greedy order above is built one call at a time and an early one is
	// often in the wrong place by the end.
	route = tidy(sail, route, handOf, 6, back);

	const points = route.map(c => ({ name: c.name, x: c.x, y: c.y, stop: c.kind !== 'port' }));
	return {
		id: 'dailies',
		route,
		stops: route,
		points,
		left,
		// The one measurement that has to be true: what the day is
		// actually sailed, round whatever is in the way.
		length: length(measurer(), route)
	};
}

/**
 * Shuffle the calls until nothing moves: each one lifted out and set
 * down wherever it costs least, provided every hunt still comes before
 * what it pays for. Bounded, since this runs while someone waits.
 */
function tidy(sail, route, handOf, rounds, closed) {
	const before = (list) => {
		// Every quest's hunt must sit in front of its hand-in.
		for (const c of list) {
			for (const t of c.todo) {
				if (t.what !== 'kill') continue;
				const hand = handOf.get(t.q.id);
				if (!hand) continue;
				if (list.indexOf(c) > list.indexOf(hand)) return false;
			}
		}
		return true;
	};
	// The first call is the harbour it leaves from and, on a loop, the
	// last is the same harbour come back to. Neither moves.
	const fixedEnd = closed ? 1 : 0;
	for (let r = 0; r < rounds; r++) {
		let moved = false;
		for (let i = 1; i < route.length - fixedEnd; i++) {
			const c = route[i];
			const without = route.filter((_, k) => k !== i);
			const now = length(sail, route);
			let best = null;
			for (let j = 1; j <= without.length - fixedEnd; j++) {
				if (j === i) continue;
				const tryIt = [...without.slice(0, j), c, ...without.slice(j)];
				if (!before(tryIt)) continue;
				const n = length(sail, tryIt);
				if (n < now - 1 && (!best || n < best.n)) best = { n, tryIt };
			}
			if (best) { route = best.tryIt; moved = true; }
		}
		if (!moved) break;
	}
	return route;
}
