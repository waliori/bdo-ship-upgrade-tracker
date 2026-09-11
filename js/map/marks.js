// What the chart is lit for: the goods wanted, the marks they put on
// the barterers, the plotted route's ids and its points on the water,
// and the line bent round the land between them.

import { marksFor, routeFor } from '../map.js';
import { npcById, ports } from '../barter_npcs.js';
import { seaRoute } from '../searoute.js';
import { snapshot, barterData, barterProfile } from '../ui-state.js';
import { openTable } from '../barter.js';
import { mv } from './state.js';
import { routeSeq } from './route.js';


/**
 * Which of the game's two refresh lists an exchange belongs to: the
 * trade-item chain deals [Level N] goods and Crow Coins, the ship
 * material list deals everything else. They refresh separately, so a
 * sailing run is planned against one of them, not a mixture.
 */
export function barterKind(name) {
	if (name === 'Crow Coin') return 'coin';
	return name.startsWith('[Level') ? 'trade' : 'material';
}

function kindMatches(name) {
	if (mv.kindFilter === 'all') return true;
	const k = barterKind(name);
	return k === mv.kindFilter || (mv.kindFilter === 'trade' && k === 'coin');
}

function wantedNow() {
	if (mv.mapPick) return { [mv.mapPick]: 1 };
	if (mv.kindFilter === 'all') return snapshot.missing;
	const out = {};
	for (const [k, v] of Object.entries(snapshot.missing)) {
		if (kindMatches(k)) out[k] = v;
	}
	return out;
}

export function marksNow() {
	// Lit on the table this sailor can sail: a pin on an island the
	// barter count has not opened is a detour to a barter window that
	// will not deal. The island is still drawn, and its card says what
	// opens it.
	return marksFor(wantedNow(), openTable(barterData, barterProfile().barterCount));
}

/** Everything each barterer trades, keyed by npc id -- built once from
 *  the same file the marks come from, for the pin's card. */
let goodsIndex = null;
export function goodsOf(id) {
	if (!goodsIndex) {
		goodsIndex = new Map();
		for (const entry of barterData || []) {
			for (const s of entry.sources) {
				if (!goodsIndex.has(s.npc_id)) goodsIndex.set(s.npc_id, []);
				goodsIndex.get(s.npc_id).push({
					item: entry.name,
					give: s.give && s.give.name,
					giveQty: (s.give && s.give.quantity) || '1',
					recvQty: s.quantity_received || '1',
					tries: s.attempts_available || 0
				});
			}
		}
	}
	return goodsIndex.get(id) || [];
}

/** Whether the plotted route belongs to what the chart is showing.
 *  Change the view and it goes dormant rather than dragging you to
 *  islands that no longer trade the thing; the Route tab offers it
 *  back. */
export function stopsLive() {
	return mv.stops.length > 0 && mv.stopsPick === (mv.mapPick || '');
}

/** The stops in sailing order: the hand-plotted route if there is
 *  one for this view -- a single stop included, since one errand is
 *  still a route and its pin already wears the "1" -- else the
 *  suggested loop, turned to sail from home when a wharf is chosen,
 *  since a loop has no direction of its own. */
export function routeIds(marks) {
	if (stopsLive()) return mv.stops;
	return [];
}

/** The loop through everything you are short of, as an offer rather
 *  than a default: a chart that draws a route nobody asked for is a
 *  chart telling you where to sail before you have said what for. */
export function suggestedIds(marks) {
	let ids = routeFor(marks).map(n => n.id);
	const port = ports.find(p => p.id === mv.startPort);
	if (port && ids.length > 1) {
		const a = npcById.get(ids[0]), b = npcById.get(ids[ids.length - 1]);
		const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
		if (d(port, b) < d(port, a)) ids = [...ids].reverse();
	}
	return ids;
}

/**
 * The same line, bent round whatever land is in the way.
 *
 * Routing costs a few milliseconds a leg, which is nothing on a click
 * and far too much on every frame of a pan -- so the answer is kept
 * until the points themselves change.
 */
export const bent = new Map();
export function seaBent(points) {
	if (points.length < 2) return points;
	const key = points.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
	if (!bent.has(key)) {
		if (bent.size > 64) bent.clear();
		bent.set(key, seaRoute(points));
	}
	return bent.get(key);
}

/** The legs of a bent route the router had to give up on -- each a
 *  straight line through whatever is in the way -- by leg number from
 *  1, with the two ends of each. A stop reached by such a leg carries
 *  the router's `straight` mark. */
export function straightLegs(world) {
	const out = [];
	let leg = 0, from = null;
	for (const p of world || []) {
		if (p.bend) continue;
		if (from && p.straight) out.push({ n: leg, from, to: p });
		leg++;
		from = p;
	}
	return out;
}

/** Those stops as world points -- the run's wharf calls among them --
 *  with the start wharf prepended, and appended when the route is to
 *  end where the ship lives. */
export function routeWorld(marks) {
	const pts = routeSeq(marks).map(s => s.place);
	const port = ports.find(p => p.id === mv.startPort);
	if (!port || !pts.length) return pts;
	return mv.returnHome ? [port, ...pts, port] : [port, ...pts];
}
