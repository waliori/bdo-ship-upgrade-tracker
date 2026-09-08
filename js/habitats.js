// Where a species lives, as one marker rather than a hundred points.
//
// The game's world map puts a picture at each habitat -- "Hekaru
// Habitat", "Young Sea Monster Habitat" -- where the codex gives the
// app every spawn point. To draw the picture the points are grouped:
// cells of the chart a few kilometres across, joined when they touch,
// and the centre of each group is a habitat. Pure, so it can be tested
// and cached.

const CELL = 6000;

/**
 * The habitats of several species together -- the young ones, which
 * the game marks as one "Young Sea Monster Habitat" naming whoever is
 * there. `named` is [{ key, name, points }]; each cluster carries the
 * names of the species with points in it.
 */
export function habitatsOfMany(named, opts = {}) {
	const tagged = [];
	for (const s of named) for (const [x, y] of s.points) tagged.push([x, y, s.name]);
	const clusters = habitatsOf(tagged.map(([x, y]) => [x, y]), { ...opts, max: 99 });
	// Name each cluster by the species nearest its centre -- the ones with
	// points within a cell and a half of it.
	const cell = opts.cell || CELL;
	return clusters.map(c => {
		const near = new Set(tagged.filter(([x, y]) => Math.hypot(x - c.x, y - c.y) < cell * 1.5).map(t => t[2]));
		return { ...c, species: [...near] };
	}).slice(0, opts.max || 12);
}

/**
 * The habitats of one species: { x, y, n } per cluster, biggest first,
 * at most `max`. Clusters smaller than `min` points are noise unless
 * the species has few points at all (a boss with two spawns). With
 * `onWater(x, y)` given, every marker is kept on the water.
 */
export function habitatsOf(points, { cell = CELL, min = 3, max = 6, onWater = null } = {}) {
	if (!points || !points.length) return [];
	const cells = new Map();
	for (const [x, y] of points) {
		const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
		if (!cells.has(k)) cells.set(k, []);
		cells.get(k).push([x, y]);
	}
	// Union neighbouring cells (8 around) into one cluster.
	const parent = new Map([...cells.keys()].map(k => [k, k]));
	const find = k => (parent.get(k) === k ? k : (parent.set(k, find(parent.get(k))), parent.get(k)));
	for (const k of cells.keys()) {
		const [cx, cy] = k.split(',').map(Number);
		for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
			const nk = `${cx + dx},${cy + dy}`;
			if (cells.has(nk)) parent.set(find(nk), find(k));
		}
	}
	const groups = new Map();
	for (const [k, pts] of cells) {
		const r = find(k);
		if (!groups.has(r)) groups.set(r, []);
		groups.get(r).push(...pts);
	}
	const floor = points.length < min * 2 ? 1 : min;
	return [...groups.values()]
		.filter(g => g.length >= floor)
		.map(g => {
			let x = Math.round(g.reduce((a, p) => a + p[0], 0) / g.length);
			let y = Math.round(g.reduce((a, p) => a + p[1], 0) / g.length);
			// A ground that rings an island has its centre on the island;
			// the marker then goes to the spawn point nearest that centre
			// that is actually on the water.
			if (onWater && !onWater(x, y)) {
				const wet = g.filter(p => onWater(p[0], p[1]))
					.sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y))[0];
				if (wet) [x, y] = wet;
			}
			return { x, y, n: g.length, hull: hullOf(g) };
		})
		.sort((a, b) => b.n - a.n)
		.slice(0, max);
}

/**
 * The outline round a cluster: its convex hull, counter-clockwise,
 * without repeats -- the shape the chart fills so a ground reads as an
 * area rather than a scatter. Two points make a line, one a point.
 */
export function hullOf(points) {
	const pts = [...new Map((points || []).map(p => [`${p[0]},${p[1]}`, [p[0], p[1]]])).values()]
		.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	if (pts.length < 3) return pts;
	const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lower = [];
	for (const p of pts) {
		while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
		lower.push(p);
	}
	const upper = [];
	for (let i = pts.length - 1; i >= 0; i--) {
		const p = pts[i];
		while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
		upper.push(p);
	}
	return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
