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

/** The nearest water cell to a position, since a barterer stands on an
 *  island and a route has to start from the water beside it. */
function nearestSea(x, y, reach = 6) {
	const cx = cellOf(x), cy = cellOf(y);
	if (seaCell(cx, cy)) return [cx, cy];
	for (let d = 1; d <= reach; d++) {
		let best = null, bestD = Infinity;
		for (let dx = -d; dx <= d; dx++) {
			for (let dy = -d; dy <= d; dy++) {
				if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
				if (!seaCell(cx + dx, cy + dy)) continue;
				const dist = dx * dx + dy * dy;
				if (dist < bestD) { bestD = dist; best = [cx + dx, cy + dy]; }
			}
		}
		if (best) return best;
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
	const from = nearestSea(a.x, a.y), to = nearestSea(b.x, b.y);
	if (!from || !to) return [a, b];
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
