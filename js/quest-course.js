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
import { habitatsOf } from './habitats.js';
import { handIn } from './quest-places.js';
import { seaLeg, openSea } from './searoute.js';

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
 * And two hunts are one call if their spots are within sight of each
 * other -- six hundred metres. Where the game marks several species in
 * one water their grounds do overlap, and sailing twice to the same
 * stretch of sea to kill two things in it is not two errands.
 */
const TOGETHER = 2400;

/**
 * Where a species can actually be killed, as a short list of grounds.
 *
 * Not its habitat marker. A marker is a label the game's world map
 * draws at a named ground -- one icon for the whole of it -- and it is
 * placed to be read, not sailed to: the Hekaru marker sits where the
 * word "Hekaru Habitat" wants to be, and the Hekaru are spread over
 * the water round it. Steering for the icon is steering for a caption.
 *
 * So a ground here is the middle of a cluster of the species' own
 * spawn points, found by the same clustering the chart already draws
 * its habitats with, biggest cluster first, and nudged onto open water
 * where a cluster rings an island and its centre lands on the rocks.
 * Only a species the codex gives no positions for falls back to its
 * marker, because a caption is still better than nothing.
 */
export function groundsOf(m) {
	if (!m) return [];
	if (m.points && m.points.length) {
		const found = habitatsOf(m.points, { onWater: openSea });
		if (found.length) return found.map(h => ({ x: h.x, y: h.y, n: h.n }));
	}
	if (m.zones && m.zones.length) return m.zones.map(([x, y]) => ({ x, y }));
	return [];
}

/** How close another spawn has to be to count as company, and how much
 *  company a spot needs before it is worth sailing to. */
const COMPANY = 3000, ENOUGH = 3;
const spotCache = new Map();

/**
 * The places within a species' grounds actually worth steering for.
 *
 * A ground is not a point, it is water -- the Hekaru fill a hundred
 * and twelve spawns between Velia and Nampo -- so which part of it to
 * sail to is not a property of the species at all, it depends on where
 * the rest of the day goes. Handing the ordering the whole ground and
 * letting it pick the near edge is the difference between crossing a
 * sea and clipping its corner.
 *
 * Every spawn is a candidate, less the lonely ones: a spot with fewer
 * than a couple of others within three thousand units is one monster
 * in open water, not a place to hunt, and would send a sailor to the
 * edge of the map for a single kill. A species the codex gives no
 * positions for falls back to its clusters, then to its marker.
 */
export function spotsOf(m) {
	if (!m) return [];
	if (spotCache.has(m.key)) return spotCache.get(m.key);
	const wet = (m.points || []).filter(([x, y]) => openSea(x, y));
	// A ground that is a dozen bookmarks spread over ten kilometres --
	// the Lyngbakr's -- has no crowded spot in it, and thinning it to
	// nothing would throw away the only positions there are. So the
	// crowd test only applies where it leaves something behind.
	const crowded = wet.filter(([x, y]) => wet.reduce((n, p) =>
		n + (Math.hypot(p[0] - x, p[1] - y) <= COMPANY ? 1 : 0), 0) > ENOUGH);
	const out = (crowded.length ? crowded : wet).map(([x, y]) => ({ x, y }));
	const spots = out.length ? out : groundsOf(m);
	spotCache.set(m.key, spots);
	return spots;
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
		for (const g of spotsOf(h.monster)) {
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
		let at = route.find((c, i) => c.kind === 'hunt' && i < last && Math.hypot(c.x - best.x, c.y - best.y) <= TOGETHER);
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
					const g = spotsOf(m)[0];
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
	// The order is settled; now each ground is slid along itself to the
	// part of it the loop actually passes. A spot was chosen when the
	// call was put in, against a route that has since moved round it --
	// and a ground is water, not a point, so there is usually a nearer
	// corner of it to meet.
	for (let i = 1; i < route.length - 1; i++) {
		const c = route[i];
		if (c.kind !== 'hunt' || !c.species) continue;
		// Only where every species at the call can still be found.
		const all = c.species.map(sp => spotsOf(monsterByKey[sp.key]));
		if (all.some(list => !list.length)) continue;
		const a = route[i - 1], b = route[i + 1];
		let best = null;
		for (const g of all[0]) {
			if (!all.every(list => list.some(o => Math.hypot(o.x - g.x, o.y - g.y) <= TOGETHER))) continue;
			const cost = sail(a, g) + sail(g, b);
			if (!best || cost < best.cost) best = { cost, x: g.x, y: g.y };
		}
		if (best && best.cost < sail(a, c) + sail(c, b)) { c.x = best.x; c.y = best.y; }
	}

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
