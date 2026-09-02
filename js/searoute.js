// A leg that stays on the water.
//
// A route is a list of islands, and the line between two of them is
// drawn straight -- which is fine in open sea and wrong the moment
// something is in the way. This bends a leg round whatever is in the
// way, using the sea mask built from the chart's own tiles.
//
// The common case costs nothing: if the straight line is already all
// water, that is the answer. Only a blocked leg is searched, and the
// search is a plain A* over the mask's cells with the corners kept
// square -- a ship does not slip diagonally between two headlands.

import { SEA_BITS, SEA_CELL, SEA_SIDE } from './seamask.js';

let bits = null;
function mask() {
	if (bits) return bits;
	if (typeof atob === 'function') {
		const raw = atob(SEA_BITS);
		bits = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) bits[i] = raw.charCodeAt(i);
	} else {
		bits = new Uint8Array(Buffer.from(SEA_BITS, 'base64'));
	}
	return bits;
}

const cellOf = v => Math.floor(v / SEA_CELL);
const mid = c => c * SEA_CELL + SEA_CELL / 2;

/** Is this cell open water? Anything off the chart is not. */
export function seaCell(cx, cy) {
	if (cx < 0 || cy < 0 || cx >= SEA_SIDE || cy >= SEA_SIDE) return false;
	const i = cy * SEA_SIDE + cx;
	return (mask()[i >> 3] & (1 << (i & 7))) !== 0;
}

/** Is this world position on water? */
export function isSea(x, y) {
	return seaCell(cellOf(x), cellOf(y));
}

/** Water with water all round it -- a cell in from any shore, so a
 *  point there reads as at sea at every zoom, not on the beach. */
export function openSea(x, y) {
	for (let dx = -SEA_CELL; dx <= SEA_CELL; dx += SEA_CELL) {
		for (let dy = -SEA_CELL; dy <= SEA_CELL; dy += SEA_CELL) {
			if (!isSea(x + dx, y + dy)) return false;
		}
	}
	return true;
}

/* ---- which water is which ------------------------------------------ *
   Not all water is the same water. At 256 units to a cell a harbour is
   often a single wet cell walled in by its own shore -- Velia's is --
   and a search that starts there has nowhere to go, gives up, and the
   leg is drawn straight. Which is how the route out of Velia used to
   cross Balenos on foot.

   So every water cell is labelled with the body of water it belongs to,
   once, and a leg starts and ends on water the other end can actually
   be reached from. The fill is four-way because the search is: it
   refuses the diagonal gap between two shores, so a diagonal touch is
   not a way through for it either. */

let pools = null;

function buildPools() {
	pools = new Int32Array(SEA_SIDE * SEA_SIDE);
	const stack = [];
	let id = 0;
	for (let y = 0; y < SEA_SIDE; y++) {
		for (let x = 0; x < SEA_SIDE; x++) {
			const at = y * SEA_SIDE + x;
			if (pools[at] || !seaCell(x, y)) continue;
			id++;
			pools[at] = id;
			stack.push(at);
			while (stack.length) {
				const c = stack.pop();
				const cx = c % SEA_SIDE, cy = (c / SEA_SIDE) | 0;
				for (const [dx, dy] of SIDES) {
					const nx = cx + dx, ny = cy + dy;
					if (!seaCell(nx, ny)) continue;
					const n = ny * SEA_SIDE + nx;
					if (pools[n]) continue;
					pools[n] = id;
					stack.push(n);
				}
			}
		}
	}
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Which body of water a cell is in; 0 for land and for off the chart. */
function poolOf(cx, cy) {
	if (!pools) buildPools();
	if (cx < 0 || cy < 0 || cx >= SEA_SIDE || cy >= SEA_SIDE) return 0;
	return pools[cy * SEA_SIDE + cx];
}

/** Water cells around a point, nearest first, out to `reach` rings. */
function watersNear(x, y, reach) {
	const cx = cellOf(x), cy = cellOf(y);
	const out = [];
	if (seaCell(cx, cy)) out.push([cx, cy]);
	for (let d = 1; d <= reach; d++) {
		const ring = [];
		for (let dx = -d; dx <= d; dx++) {
			for (let dy = -d; dy <= d; dy++) {
				if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
				if (!seaCell(cx + dx, cy + dy)) continue;
				ring.push([cx + dx, cy + dy, dx * dx + dy * dy]);
			}
		}
		ring.sort((p, q) => p[2] - q[2]);
		for (const c of ring) out.push([c[0], c[1]]);
	}
	return out;
}

/** The nearest water cell to a position, since a barterer stands on an
 *  island and a route has to start from the water beside it. */
function nearestSea(x, y, reach = 6) {
	return watersNear(x, y, reach)[0] || null;
}

/* How far out a leg may look for water it can actually sail on. Wide,
   because Ancado Inner Harbor sits at the end of a canal the chart's
   tiles do not draw as water: the open sea is 26 cells away, and the
   choice there is between one straight run down the canyon -- which is
   the passage a ship really makes -- and a straight line across the
   whole of Valencia, which is what it used to draw. The nearest shared
   water still wins, so nowhere else is affected by the room. */
const REACH = 28;

/** One water cell by each end, as close in as they go, on water the
 *  other end can be reached from -- so neither leg begins in a puddle
 *  the sea does not touch. */
function sharedWater(a, b, reach = REACH) {
	const far = new Map();
	for (const [cx, cy] of watersNear(b.x, b.y, reach)) {
		const p = poolOf(cx, cy);
		if (!far.has(p)) far.set(p, [cx, cy]);
	}
	for (const [cx, cy] of watersNear(a.x, a.y, reach)) {
		const p = poolOf(cx, cy);
		if (far.has(p)) return [[cx, cy], far.get(p)];
	}
	return null;
}

/**
 * The nearest water to a position, as a world point: the position
 * itself when it is already wet, otherwise the middle of the closest
 * water cell -- or null when there is no water within reach. A stop on
 * a route is a place a hull can float.
 */
export function nearestWater(x, y, reach = 8) {
	if (isSea(x, y)) return { x, y };
	// The nearest water, whichever water it is. A stop dropped beside a
	// harbour belongs in that harbour, not out at sea a kilometre away;
	// getting a hull from there to the open sea is seaLeg's problem, and
	// seaLeg solves it.
	const cell = nearestSea(x, y, reach);
	return cell ? { x: mid(cell[0]), y: mid(cell[1]) } : null;
}

/** Every cell a straight line crosses is water -- so the leg needs no
 *  help. Walked at half a cell so a corner cannot be stepped over. */
function clearLine(ax, ay, bx, by) {
	const dist = Math.hypot(bx - ax, by - ay);
	const steps = Math.ceil(dist / (SEA_CELL / 2));
	for (let i = 0; i <= steps; i++) {
		const t = steps ? i / steps : 0;
		if (!isSea(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
	}
	return true;
}

/** A tiny binary heap, so a search across the world is not a sort. */
function heap() {
	const key = [], val = [];
	return {
		get size() { return key.length; },
		push(k, v) {
			key.push(k); val.push(v);
			let i = key.length - 1;
			while (i > 0) {
				const p = (i - 1) >> 1;
				if (key[p] <= key[i]) break;
				[key[p], key[i]] = [key[i], key[p]];
				[val[p], val[i]] = [val[i], val[p]];
				i = p;
			}
		},
		pop() {
			const top = val[0];
			const k = key.pop(), v = val.pop();
			if (key.length) {
				key[0] = k; val[0] = v;
				let i = 0;
				for (;;) {
					const l = i * 2 + 1, r = l + 1;
					let m = i;
					if (l < key.length && key[l] < key[m]) m = l;
					if (r < key.length && key[r] < key[m]) m = r;
					if (m === i) break;
					[key[m], key[i]] = [key[i], key[m]];
					[val[m], val[i]] = [val[i], val[m]];
					i = m;
				}
			}
			return top;
		}
	};
}

const NEAR = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** A cell touching land costs more, so a leg keeps a little clearance
 *  instead of scraping every headland it passes. */
function hugsLand(cx, cy) {
	for (const [dx, dy] of NEAR) if (!seaCell(cx + dx, cy + dy)) return true;
	return false;
}

/** The cells of a water path between two cells, or null. */
function search(from, to, limit = 220000) {
	const start = from[1] * SEA_SIDE + from[0];
	const goal = to[1] * SEA_SIDE + to[0];
	const came = new Int32Array(SEA_SIDE * SEA_SIDE).fill(-1);
	const cost = new Float32Array(SEA_SIDE * SEA_SIDE).fill(Infinity);
	const done = new Uint8Array(SEA_SIDE * SEA_SIDE);
	const open = heap();
	cost[start] = 0;
	open.push(0, start);
	let seen = 0;
	while (open.size) {
		const at = open.pop();
		if (at === goal) break;
		if (done[at]) continue;
		done[at] = 1;
		if (++seen > limit) return null;
		const cx = at % SEA_SIDE, cy = (at / SEA_SIDE) | 0;
		for (const [dx, dy] of NEAR) {
			const nx = cx + dx, ny = cy + dy;
			if (!seaCell(nx, ny)) continue;
			// No slipping through the diagonal gap between two shores.
			if (dx && dy && (!seaCell(cx + dx, cy) || !seaCell(cx, cy + dy))) continue;
			const n = ny * SEA_SIDE + nx;
			if (done[n]) continue;
			const step = (dx && dy ? 1.4142 : 1) + (hugsLand(nx, ny) ? 1.6 : 0);
			const next = cost[at] + step;
			if (next >= cost[n]) continue;
			cost[n] = next;
			came[n] = at;
			const hx = Math.abs(nx - to[0]), hy = Math.abs(ny - to[1]);
			open.push(next + Math.max(hx, hy) + 0.4142 * Math.min(hx, hy), n);
		}
	}
	if (came[goal] === -1 && goal !== start) return null;
	const path = [];
	for (let at = goal; at !== -1; at = came[at]) {
		path.push([at % SEA_SIDE, (at / SEA_SIDE) | 0]);
		if (at === start) break;
	}
	return path.reverse();
}

/** The fewest points that still describe the same water path: keep a
 *  point only where the line has to bend to stay wet. */
function simplify(pts) {
	const out = [pts[0]];
	let i = 0;
	while (i < pts.length - 1) {
		let j = pts.length - 1;
		for (; j > i + 1; j--) {
			if (clearLine(pts[i].x, pts[i].y, pts[j].x, pts[j].y)) break;
		}
		out.push(pts[j]);
		i = j;
	}
	return out;
}

/**
 * One leg, as world points from `a` to `b`. The straight line when the
 * water allows it, a way round when it does not, and -- when there is
 * no way round at all, or the search runs long -- the straight line
 * again, since a drawn line that is wrong beats no line.
 */
export function seaLeg(a, b) {
	if (clearLine(a.x, a.y, b.x, b.y)) return [a, b];
	const ends = sharedWater(a, b);
	if (!ends) return [a, b];
	const [from, to] = ends;
	const cells = search(from, to);
	if (!cells) return [a, b];
	const pts = [a, ...cells.map(([cx, cy]) => ({ x: mid(cx), y: mid(cy) })), b];
	return simplify(pts);
}

/**
 * A whole route, leg by leg, with the stops kept and the bends between
 * them added. Points that were already there keep whatever else they
 * carry -- a name, above all -- and the bends are plain positions.
 */
export function seaRoute(points) {
	if (points.length < 2) return points;
	const out = [points[0]];
	for (let i = 1; i < points.length; i++) {
		const leg = seaLeg(points[i - 1], points[i]);
		for (let k = 1; k < leg.length - 1; k++) out.push({ ...leg[k], bend: true });
		out.push(points[i]);
	}
	return out;
}
