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
// square -- a ship does not slip diagonally between two headlands --
// and with the shore kept at arm's length, as the game keeps it.

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
function nearestSea(x, y, reach = BESIDE) {
	return watersNear(x, y, reach)[0] || null;
}

/* How far out a leg may look for water it can actually sail on, in
   cells: about 7,000 world units. Wide, because Ancado Inner Harbor
   sits at the end of a canal the chart's tiles draw thinly: the open
   sea is a long way off, and the choice there is between one run down
   the canyon -- which is the passage a ship really makes -- and a
   straight line across the whole of Valencia. The nearest shared water
   still wins, so nowhere else is affected by the room. */
const REACH = Math.round(7200 / SEA_CELL);
/* How far a stop dropped on land, or a barterer's stand, looks for the
   water beside it: about 2,000 world units. */
const BESIDE = Math.round(2048 / SEA_CELL);

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
export function nearestWater(x, y, reach = BESIDE) {
	if (isSea(x, y)) return { x, y };
	// The nearest water, whichever water it is. A stop dropped beside a
	// harbour belongs in that harbour, not out at sea a kilometre away;
	// getting a hull from there to the open sea is seaLeg's problem, and
	// seaLeg solves it.
	const cell = nearestSea(x, y, reach);
	return cell ? { x: mid(cell[0]), y: mid(cell[1]) } : null;
}

/** Every cell a straight line crosses, in order, each with the length
 *  of line inside it in cells -- exactly, cell edge by cell edge, so a
 *  corner clipped for a few units is still a corner crossed. Stops
 *  early when `visit` returns false. */
function walkLine(ax, ay, bx, by, visit) {
	const x = ax / SEA_CELL, y = ay / SEA_CELL;
	const dx = bx / SEA_CELL - x, dy = by / SEA_CELL - y;
	const dist = Math.hypot(dx, dy);
	let cx = Math.floor(x), cy = Math.floor(y);
	const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
	// Line travelled per cell crossed each way, and to the next edge.
	const perX = dx ? Math.abs(dist / dx) : Infinity;
	const perY = dy ? Math.abs(dist / dy) : Infinity;
	let toX = dx ? (dx > 0 ? cx + 1 - x : x - cx) * perX : Infinity;
	let toY = dy ? (dy > 0 ? cy + 1 - y : y - cy) * perY : Infinity;
	let at = 0;
	for (;;) {
		const next = Math.min(toX, toY, dist);
		if (visit(cx, cy, next - at) === false) return false;
		if (next >= dist) return true;
		at = next;
		if (toX < toY) { cx += sx; toX += perX; } else { cy += sy; toY += perY; }
	}
}

/** Every cell a straight line crosses is water -- so the leg needs no
 *  help. */
function clearLine(ax, ay, bx, by) {
	return walkLine(ax, ay, bx, by, seaCell);
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

/* ---- keeping off the shore ------------------------------------------ *
   The game does not sail a ship along the beach. Its route round a
   coast stands off it by a good thousand units, and a leg drawn closer
   in comes out shorter than the passage really is -- short enough that
   a run round the north of the continent was picked over the channel
   through it, which is the way the game actually goes.

   So water near land costs more. Not a flat surcharge on the cell by
   the shore, which is what this used to be: that taxed every cell of a
   channel, since every cell of a channel is by a shore, and priced the
   channel out against the open sea round the outside. Instead a cell
   pays for being closer in than the water round it allows. In the open
   that is the full clearance, and a leg stands off. In a channel it is
   the middle of the channel, which is free, and the channel is judged
   on its length like anywhere else. */

/* How far off a shore a leg stands when it can, in cells: about 1,000
   world units, which is what the game's own routes keep. */
const CLEAR = 8;
/* What sailing right up against the shore costs, on top of the distance
   -- the price falls off in a straight line out to CLEAR. */
const SHORE_TOLL = 1.6;

let shore = null;   // cells to the nearest land, capped at CLEAR
let room = null;    // the most shore any cell within CLEAR has, capped

function buildShore() {
	const n = SEA_SIDE * SEA_SIDE;
	shore = new Uint8Array(n).fill(CLEAR);
	let edge = [];
	for (let i = 0; i < n; i++) {
		if (!seaCell(i % SEA_SIDE, (i / SEA_SIDE) | 0)) { shore[i] = 0; edge.push(i); }
	}
	// Rings out from the land, eight ways, so the distance is in whole
	// cells whichever way the shore lies.
	for (let d = 1; d < CLEAR && edge.length; d++) {
		const next = [];
		for (const at of edge) {
			const cx = at % SEA_SIDE, cy = (at / SEA_SIDE) | 0;
			for (const [dx, dy] of NEAR) {
				const nx = cx + dx, ny = cy + dy;
				if (nx < 0 || ny < 0 || nx >= SEA_SIDE || ny >= SEA_SIDE) continue;
				const i = ny * SEA_SIDE + nx;
				if (shore[i] <= d) continue;
				shore[i] = d;
				next.push(i);
			}
		}
		edge = next;
	}
	// The most room within CLEAR of each cell: a running maximum along
	// the rows, then down the columns of that.
	const rows = new Uint8Array(n);
	for (let y = 0; y < SEA_SIDE; y++) {
		for (let x = 0; x < SEA_SIDE; x++) {
			let m = 0;
			for (let dx = Math.max(0, x - CLEAR); dx <= Math.min(SEA_SIDE - 1, x + CLEAR); dx++) {
				const v = shore[y * SEA_SIDE + dx];
				if (v > m) m = v;
			}
			rows[y * SEA_SIDE + x] = m;
		}
	}
	room = new Uint8Array(n);
	for (let x = 0; x < SEA_SIDE; x++) {
		for (let y = 0; y < SEA_SIDE; y++) {
			let m = 0;
			for (let dy = Math.max(0, y - CLEAR); dy <= Math.min(SEA_SIDE - 1, y + CLEAR); dy++) {
				const v = rows[dy * SEA_SIDE + x];
				if (v > m) m = v;
			}
			room[y * SEA_SIDE + x] = m;
		}
	}
}

/* ---- the game's own lanes ------------------------------------------- *
   Along some coasts the game does not sail the shortest water. Its
   route round the north of the continent bends in towards the bay
   rather than cutting across its mouth, and a leg drawn straighter is
   drawn shorter than the passage really is -- short enough to be picked
   over a run that is quicker in the game. The chart cannot know the
   game's lanes; a player who has sailed one can draw it. A trace marked
   as a lane is one, and every leg passing near it is drawn along it:
   the lane itself costs its length, and water within reach of it that
   is off the lane costs more, so a leg joins the lane at the nearest
   point and leaves it at the last. A leg that merely crosses a lane
   pays a little for the crossing and no more. */

/* How far either side of a lane a leg is drawn onto it, in cells:
   about 1,500 world units. */
const LANE_REACH = 12;
/* What water within reach of a lane, but off it, costs on top of the
   distance. */
const LANE_TOLL = 0.6;

let lane = null;    // 1 where a lane runs
let nearLane = null;   // 1 within LANE_REACH of a lane

/**
 * Set the lanes the game sails, each a list of world points joined by
 * straight lines. Replaces whatever lanes were set before; an empty
 * list clears them. Any route drawn before is worth drawing again.
 */
export function setLanes(lines) {
	lane = null;
	nearLane = null;
	const marks = [];
	for (const drawn of lines || []) {
		// A lane is drawn with a few stops, and the line between two of
		// them may cross a headland; it is bent round the land like any
		// route, so the lane runs on water the whole way.
		const line = seaRoute(drawn);
		for (let k = 1; k < line.length; k++) {
			walkLine(line[k - 1].x, line[k - 1].y, line[k].x, line[k].y, (cx, cy) => {
				if (cx >= 0 && cy >= 0 && cx < SEA_SIDE && cy < SEA_SIDE) marks.push(cy * SEA_SIDE + cx);
			});
		}
	}
	if (!marks.length) return;
	const n = SEA_SIDE * SEA_SIDE;
	lane = new Uint8Array(n);
	nearLane = new Uint8Array(n);
	// The lane is three cells wide, so the search can hold it without
	// the drawn line having to land on cell centres.
	let edge = [];
	for (const at of marks) {
		const cx = at % SEA_SIDE, cy = (at / SEA_SIDE) | 0;
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const nx = cx + dx, ny = cy + dy;
				if (nx < 0 || ny < 0 || nx >= SEA_SIDE || ny >= SEA_SIDE) continue;
				const i = ny * SEA_SIDE + nx;
				if (lane[i]) continue;
				lane[i] = 1;
				nearLane[i] = 1;
				edge.push(i);
			}
		}
	}
	for (let d = 1; d < LANE_REACH && edge.length; d++) {
		const next = [];
		for (const at of edge) {
			const cx = at % SEA_SIDE, cy = (at / SEA_SIDE) | 0;
			for (const [dx, dy] of NEAR) {
				const nx = cx + dx, ny = cy + dy;
				if (nx < 0 || ny < 0 || nx >= SEA_SIDE || ny >= SEA_SIDE) continue;
				const i = ny * SEA_SIDE + nx;
				if (nearLane[i]) continue;
				nearLane[i] = 1;
				next.push(i);
			}
		}
		edge = next;
	}
}

/** What a water cell adds to the cost of crossing it, per unit of
 *  distance: nothing on a lane, or where it is as far from shore as the
 *  water round it allows; up to SHORE_TOLL when it is right against the
 *  shore with open sea to hand; and LANE_TOLL more beside a lane it is
 *  not on. */
function toll(i) {
	if (lane && lane[i]) return 0;
	if (!shore) buildShore();
	const short = room[i] - shore[i];
	let t = short > 0 ? SHORE_TOLL * short / CLEAR : 0;
	if (nearLane && nearLane[i]) t += LANE_TOLL;
	return t;
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
			const step = (dx && dy ? 1.4142 : 1) * (1 + toll(n));
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

/** What a straight line costs to sail, by the same measure the search
 *  uses -- its length, in cells, plus the toll of every cell it
 *  crosses -- or Infinity once it touches land or runs past `most`. */
function lineCost(ax, ay, bx, by, most = Infinity) {
	let sum = 0;
	const wet = walkLine(ax, ay, bx, by, (cx, cy, len) => {
		if (!seaCell(cx, cy)) return false;
		sum += len * (1 + toll(cy * SEA_SIDE + cx));
		return sum <= most;
	});
	return wet ? sum : Infinity;
}

/** The fewest points that still describe the same water path: keep a
 *  point only where the line has to bend to stay wet -- or to stay off
 *  the shore, since a straight cut across a bay that costs more than
 *  the way round it is not the same path drawn with fewer points. */
function simplify(pts) {
	// The running cost of the path so far. The ends may be on land -- a
	// wharf is -- and the step onto or off it is given a price no cut
	// can beat, so it is kept as the search left it; a finite one, or
	// the sums either side of it would have no difference to compare.
	const cost = [0];
	for (let k = 1; k < pts.length; k++) {
		const step = lineCost(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
		cost.push(cost[k - 1] + (step < Infinity ? step : 1e9));
	}
	const out = [pts[0]];
	let i = 0;
	while (i < pts.length - 1) {
		let j = pts.length - 1;
		for (; j > i + 1; j--) {
			const most = (cost[j] - cost[i]) * 1.001;
			if (lineCost(pts[i].x, pts[i].y, pts[j].x, pts[j].y, most) <= most) break;
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
