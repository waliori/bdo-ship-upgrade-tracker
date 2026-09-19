// Reading a storage window off a screenshot.
//
// The storage does not name what it holds. A sailor panel spells every
// value out beside its own label (sailor-shot.js reads it that way and
// never counts a pixel), but a storage is a wall of pictures with a
// number written over each one: the only thing that says "Statue's
// Tear" is the drawing of it. So this one has to look.
//
// It looks in three steps, and each is dull on purpose:
//
//   1. *Find the grid.* Slots are a fixed square lattice, so the
//      brightness of the borders repeats -- take the gradient along
//      each axis, and the comb that lands on the most edge is the
//      lattice. That gives a pitch and an offset at any resolution and
//      any UI scale, without knowing either beforehand.
//   2. *Name each square.* Every icon the app knows is already on this
//      origin under /icons, 44 pixels square, the same picture the game
//      draws. So a slot is named by correlating it against all of them
//      -- greyscale plus two colour differences, mean removed, unit
//      length -- and the best is taken only when it beats the runner-up
//      by a margin. An item the app has never heard of matches nothing
//      well and is left out rather than guessed at.
//   3. *Read the number.* That is the one thing on a slot which is
//      writing. The lower half of the slot is brought to one size and
//      run through a small network taught on the game's own font (see
//      count-net.js for why it is a network and not templates).
//
// All three are here, pure: pixels in, slots and counts out. The canvas
// work and the dialog are elsewhere, which is what lets this be tested
// on made-up pictures rather than on a screenshot nobody can
// regenerate.

import { runNet, decodeCount } from './count-net.js';
import { COUNT_MODEL } from './count_model.js';

/* ------------------------------------------------------------------ *
 * pixels
 * ------------------------------------------------------------------ */

/**
 * Rec. 709 luma, one byte a pixel.
 *
 * The same weighting sailor-shot's painter uses, and for the same
 * reason: the game's UI is coloured, and a flat average turns a blue
 * crystal and a red coral into the same grey.
 */
export function grayscale(rgba, w, h) {
	const out = new Uint8Array(w * h);
	for (let i = 0, p = 0; i < out.length; i++, p += 4) {
		out[i] = (rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722) | 0;
	}
	return out;
}

/**
 * How much the picture changes across one axis, averaged down the
 * other.
 *
 * A slot border is a thin bright line between two dark squares, which
 * is a poor thing to find by brightness -- the icons inside are
 * brighter still -- and an excellent one to find by change. Only the
 * middle band of the image is averaged: a window's title and its
 * footer are not part of the lattice and would blunt it.
 */
export function edgeProfile(gray, w, h, axis, lo, hi) {
	const n = axis === 'x' ? w : h;
	const out = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		let sum = 0, count = 0;
		for (let j = lo; j < hi; j++) {
			const a = axis === 'x' ? gray[j * w + Math.max(0, i - 1)] : gray[Math.max(0, i - 1) * w + j];
			const b = axis === 'x' ? gray[j * w + Math.min(w - 1, i + 1)] : gray[Math.min(h - 1, i + 1) * w + j];
			sum += Math.abs(a - b);
			count++;
		}
		out[i] = count ? sum / count : 0;
	}
	return out;
}

/** A profile read between its samples, so a pitch can be fractional. */
function sampleAt(profile, t) {
	const i = Math.floor(t);
	if (i < 0 || i + 1 >= profile.length) return 0;
	const f = t - i;
	return profile[i] * (1 - f) + profile[i + 1] * f;
}

/**
 * The comb of teeth that lands on the most edge: its spacing and where
 * its first tooth falls.
 *
 * A real screenshot is never a whole number of pixels a slot -- the
 * game lays the window out in its own units and the shot is whatever
 * the screen was -- so the spacing is searched in hundredths. Coarse
 * first, then fine around the winner, which is what keeps this a
 * millisecond rather than a second.
 */
export function combFit(profile, { min = 24, max = 120, coarse = 0.25, fine = 0.01 } = {}) {
	// How surprising a comb's teeth are, against the picture's own
	// change: the average edge under them, in standard errors above the
	// average edge everywhere. Plain averaging would crown the widest
	// comb of all -- four teeth can land on four bright lines by luck,
	// and a lattice of four is not a lattice -- and this is that same
	// average with the luck priced in.
	let mean = 0;
	for (const v of profile) mean += v;
	mean /= profile.length || 1;
	let variance = 0;
	for (const v of profile) variance += (v - mean) * (v - mean);
	const sd = Math.sqrt(variance / (profile.length || 1)) || 1;
	const score = (pitch, offset) => {
		let sum = 0, teeth = 0;
		for (let t = offset; t < profile.length; t += pitch) { sum += sampleAt(profile, t); teeth++; }
		if (teeth < 4) return -1;
		return ((sum / teeth) - mean) * Math.sqrt(teeth) / sd;
	};
	const sweep = (from, to, step, at) => {
		let best = { pitch: 0, offset: 0, score: -1 };
		for (let pitch = from; pitch <= to; pitch += step) {
			const starts = at === null ? pitch * 2 : 1;
			for (let k = 0; k < starts * 2; k++) {
				const offset = at === null ? (k / 2) % pitch : (at + (k - starts) / 2 + pitch) % pitch;
				const s = score(pitch, offset);
				if (s > best.score) best = { pitch, offset, score: s };
			}
		}
		return best;
	};
	const rough = sweep(min, max, coarse, null);
	if (rough.score < 0) return null;
	// A comb that lands on every second border scores as well as the one
	// that lands on all of them -- it is asked for half as many teeth
	// and the ones it takes are the same lines. So the halves and thirds
	// of the winner are tried in turn, and a spacing that still finds
	// nearly as much edge is preferred: the lattice is the finest comb
	// that fits, never a multiple of it.
	let best = rough;
	for (let k = 2; k <= 4; k++) {
		const want = rough.pitch / k;
		if (want < min) break;
		const fit = sweep(want - coarse, want + coarse, coarse, null);
		if (fit.score >= best.score * 0.9) { best = fit; break; }
	}
	return sweep(Math.max(min, best.pitch - coarse), best.pitch + coarse, fine, best.offset);
}

/**
 * Where in a screenshot the slots are.
 *
 * A crop of the storage is all lattice and needs none of this. The
 * game's own screenshot key is not a crop: it is the whole screen, and
 * the storage is a panel on the right of a sea, a chat log, a quest
 * list and a node window, all of which have edges of their own and one
 * of which -- the world -- has more edges than the panel does.
 *
 * So the picture is walked in overlapping tiles, each fitted for a
 * lattice on its own. The tiles that agree on one square pitch are the
 * panel: the sea does not repeat at forty-five pixels in both
 * directions, and a row of buttons repeats on one axis only. Their
 * bounding box, grown by a tile, is where the grid is then fitted
 * properly.
 */
export function panelOf(gray, w, h, { min = 24, max = 120 } = {}) {
	const span = Math.max(240, Math.round(Math.min(w, h) / 3));
	// A tile only votes on a spacing it can see six of. Three teeth on
	// a 376-pixel tile is a coincidence waiting to happen -- the world
	// behind the window obliges with one at about a hundred pixels in
	// every screenshot -- and six is a lattice.
	const ceiling = Math.min(max, span / 6);
	const step = Math.round(span / 2);
	const bands = (extent, size) => {
		const out = [];
		for (let a = 0; a + size <= extent + step; a += step) {
			const b = Math.min(extent, a + size);
			if (b - a >= size * 0.8) out.push([a, b]);
		}
		return out;
	};
	const rows = bands(h, span), cols = bands(w, span);
	// One profile a band, not one a tile: every tile in a row of tiles
	// asks the same question of the same rows.
	const across = rows.map(([y0, y1]) => edgeProfile(gray, w, h, 'x', y0, y1));
	const down = cols.map(([x0, x1]) => edgeProfile(gray, w, h, 'y', x0, x1));
	const tiles = [];
	for (let j = 0; j < rows.length; j++) {
		for (let i = 0; i < cols.length; i++) {
			const [x, x1] = cols[i], [y, y1] = rows[j];
			const fx = combFit(across[j].subarray(x, x1), { min, max: ceiling, coarse: 0.5, fine: 0.5 });
			const fy = combFit(down[i].subarray(y, y1), { min, max: ceiling, coarse: 0.5, fine: 0.5 });
			if (!fx || !fy) continue;
			// Square, and both ways convincing. A lattice that repeats
			// across but not down is a toolbar, not a storage.
			if (Math.abs(fx.pitch - fy.pitch) > fx.pitch * 0.06) continue;
			tiles.push({ i, j, x0: x, y0: y, x1, y1, pitch: (fx.pitch + fy.pitch) / 2, score: Math.min(fx.score, fy.score) });
		}
	}
	if (!tiles.length) return null;
	// Not the best tile -- the best agreement. A sea, a chat log and a
	// quest list all have some spacing that suits one tile, and the
	// panel is the only thing in a screenshot that suits four in a row
	// at the same spacing. So the tiles vote, and the winning spacing
	// takes the box its voters cover between them.
	tiles.sort((a, b) => b.score - a.score);
	// And they have to be neighbours. Somewhere in a screenshot of a
	// whole screen there is always another tile that happens to like the
	// same spacing -- a stretch of waves, a list of quests -- and taking
	// the bounding box of everything that agreed would hand back most of
	// the screen. A window is one patch, so the vote is counted over the
	// tiles that touch.
	const patchOf = (seed, kin) => {
		const key = t => `${t.i},${t.j}`;
		const by = new Map(kin.map(t => [key(t), t]));
		const patch = [], queue = [seed];
		const taken = new Set([key(seed)]);
		while (queue.length) {
			const t = queue.pop();
			patch.push(t);
			for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const k = `${t.i + di},${t.j + dj}`;
				if (by.has(k) && !taken.has(k)) { taken.add(k); queue.push(by.get(k)); }
			}
		}
		return patch;
	};
	let best = null;
	for (const seed of tiles) {
		const kin = tiles.filter(t => Math.abs(t.pitch - seed.pitch) < seed.pitch * 0.05);
		const patch = patchOf(seed, kin);
		const weight = patch.reduce((s, t) => s + t.score, 0);
		if (!best || weight > best.weight) best = { seed, patch, weight };
	}
	if (!best || best.seed.score < 2) return null;
	const box = best.patch.reduce((b, t) => ({
		x0: Math.min(b.x0, t.x0), y0: Math.min(b.y0, t.y0), x1: Math.max(b.x1, t.x1), y1: Math.max(b.y1, t.y1)
	}), { x0: w, y0: h, x1: 0, y1: 0 });
	// Grown by half a tile, because a tile only votes when it is mostly
	// lattice: the row of slots at the top of the window shares its tile
	// with the title bar and abstains, and the window is cut short at
	// exactly the end anybody would notice. The fit that follows trims
	// it back to where the borders actually stop.
	return {
		x0: Math.max(0, box.x0 - step), y0: Math.max(0, box.y0 - step),
		x1: Math.min(w, box.x1 + step), y1: Math.min(h, box.y1 + step),
		pitch: best.seed.pitch
	};
}

/**
 * The lattice a storage window is drawn on: one square pitch, and
 * where the first border falls on each axis.
 *
 * The two axes are fitted apart and then held to one pitch, because
 * slots are square and two fits that disagree mean one of them was
 * distracted -- by a row of buttons, a scrollbar, the chat behind a
 * transparent window. The stronger fit wins and the weaker one is
 * re-phased against it.
 */
export function gridOf(gray, w, h, { min = 24, max = 120, region = null } = {}) {
	if (!w || !h) return null;
	// Inside the panel when one was found, and inside the middle of the
	// picture otherwise -- a crop of the storage still carries a title
	// bar and a footer, and neither is on the lattice.
	const x0 = region ? region.x0 : 0, x1 = region ? region.x1 : w;
	const y0 = region ? region.y0 : 0, y1 = region ? region.y1 : h;
	const inset = (a, b, by) => [Math.round(a + (b - a) * by), Math.round(b - (b - a) * by)];
	const [ry0, ry1] = region ? [y0, y1] : inset(y0, y1, 0.12);
	const [rx0, rx1] = region ? [x0, x1] : inset(x0, x1, 0.06);
	const wholeX = edgeProfile(gray, w, h, 'x', ry0, ry1), wholeY = edgeProfile(gray, w, h, 'y', rx0, rx1);
	const ex = wholeX.subarray(x0, x1);
	const ey = wholeY.subarray(y0, y1);
	const fx = combFit(ex, { min, max });
	const fy = combFit(ey, { min, max });
	if (!fx || !fy) return null;
	const pitch = fx.score >= fy.score ? fx.pitch : fy.pitch;
	const rephase = (profile, offset) => {
		let best = { offset, score: -1 };
		for (let k = 0; k < pitch * 4; k++) {
			const at = (k / 4) % pitch;
			let sum = 0, teeth = 0;
			for (let t = at; t < profile.length; t += pitch) { sum += sampleAt(profile, t); teeth++; }
			if (teeth >= 4 && sum / teeth > best.score) best = { offset: at, score: sum / teeth };
		}
		return best.offset;
	};
	// The profiles were read inside the region, so their offsets are the
	// region's; the lattice is the whole picture's.
	const ox = x0 + (fx.pitch === pitch ? fx.offset % pitch : rephase(ex, fx.offset));
	const oy = y0 + (fy.pitch === pitch ? fy.offset % pitch : rephase(ey, fy.offset));
	return {
		pitch, ox, oy,
		score: Math.min(fx.score, fy.score),
		box: region ? {
			...trim(wholeX, ox, pitch, x0, x1),
			...trim(wholeY, oy, pitch, y0, y1, true)
		} : null
	};
}

/**
 * Where along one axis the lattice actually runs.
 *
 * The tiles that found the panel are a coarse thing -- half a tile of
 * sea comes with it -- and every slot outside the window is a square
 * of waves the bank will be asked about for nothing. The borders
 * themselves say where the window stops: they are strong, evenly
 * spaced and then they are not there, so the panel is the longest run
 * of lattice lines that are still strong.
 */
function trim(profile, offset, pitch, at, end, down = false) {
	// Every line of the lattice across the whole picture, not only the
	// ones the panel hunt took in: its tiles are coarse, and a storage
	// whose last row fell just past the last tile lost that row -- four
	// stacks of goods nobody was told about.
	const lines = [];
	for (let t = offset % pitch; t < profile.length; t += pitch) lines.push({ t, v: sampleAt(profile, t), inside: t >= at - 1 && t <= end + 1 });
	const within = lines.filter(l => l.inside);
	if (within.length < 3) return down ? { y0: at, y1: end } : { x0: at, x1: end };
	const sorted = within.map(l => l.v).sort((a, b) => b - a);
	const strong = sorted.slice(0, Math.max(2, Math.round(sorted.length / 2)));
	const floor = (strong.reduce((a, b) => a + b, 0) / strong.length) * 0.22;
	// the longest run of strong lines inside the panel...
	let run = null, cur = null;
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].inside && lines[i].v >= floor) {
			cur = cur || { from: i, to: i };
			cur.to = i;
			if (!run || cur.to - cur.from > run.to - run.from) run = { ...cur };
		} else cur = null;
	}
	if (!run) return down ? { y0: at, y1: end } : { x0: at, x1: end };
	// ...carried on past its edges for as long as the lines stay strong
	while (run.from > 0 && lines[run.from - 1].v >= floor) run.from--;
	while (run.to < lines.length - 1 && lines[run.to + 1].v >= floor) run.to++;
	const lo = lines[run.from].t, hi = lines[run.to].t;
	return down ? { y0: Math.round(lo), y1: Math.round(hi) } : { x0: Math.round(lo), x1: Math.round(hi) };
}

/**
 * The two steps together: find the panel, then fit the lattice inside
 * it, and settle for the whole picture when there is no panel to find.
 *
 * The pitch is fitted again inside the region rather than taken from
 * the panel hunt, which only ever had to be right enough to say where
 * to look: its tiles are each asked for six slots' worth of spacing, so
 * on a tight crop of a storage they can be looking at half a slot and
 * still point at the right rectangle.
 */
export function findGrid(gray, w, h, opts = {}) {
	const panel = panelOf(gray, w, h, opts);
	// Its spacing is a hint, not the answer: right, or half right, and
	// never twice right. So the fit inside the panel is let up to twice
	// what the hunt said and no lower -- which leaves out the hundred-
	// pixel lattice a sea and a chat log can make between them, and
	// still finds the fifty-seven-pixel slots of a crop the hunt could
	// only see half of.
	const inside = panel ? gridOf(gray, w, h, {
		...opts,
		region: panel,
		min: Math.max(opts.min || 24, panel.pitch * 0.8),
		max: Math.min(opts.max || 120, panel.pitch * 2.4)
	}) : null;
	return inside || gridOf(gray, w, h, opts);
}

/**
 * Every square of the lattice, including the one the crop cut in half.
 *
 * A screenshot of a storage is usually a crop, and a crop drawn by
 * hand takes the left-hand column's border with it as often as not. A
 * square is kept while the picture inside it is: eight parts in ten of
 * the slot present is a readable icon, and less than that is a sliver.
 */
export function cellsOf(grid, w, h, { least = 0.8 } = {}) {
	const out = [];
	if (!grid) return out;
	const { pitch, ox, oy } = grid;
	// The panel when one was found -- there is no sense reading the sea
	// behind a window for slots -- and the whole picture otherwise.
	const bx0 = grid.box ? Math.max(0, grid.box.x0 - pitch) : 0;
	const by0 = grid.box ? Math.max(0, grid.box.y0 - pitch) : 0;
	const bx1 = grid.box ? Math.min(w, grid.box.x1 + pitch) : w;
	const by1 = grid.box ? Math.min(h, grid.box.y1 + pitch) : h;
	const inside = (at, lo, hi) => Math.max(0, Math.min(at + pitch, hi) - Math.max(at, lo)) / pitch;
	const first = (v, lo) => { let x = v % pitch; while (x > lo - pitch) x -= pitch; return x + pitch; };
	let row = 0;
	for (let y = first(oy, by0); y < by1; y += pitch, row++) {
		if (inside(y, by0, by1) < least || inside(y, 0, h) < least) { row--; continue; }
		let col = 0;
		for (let x = first(ox, bx0); x < bx1; x += pitch, col++) {
			if (inside(x, bx0, bx1) < least || inside(x, 0, w) < least) { col--; continue; }
			out.push({ row, col, cx: x + pitch / 2, cy: y + pitch / 2 });
		}
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * describing a square
 * ------------------------------------------------------------------ */

/** How many samples across a descriptor. Coarse for the sift, fine for
 *  the answer: at ten the whole bank is swept in a blink and at twenty
 *  two crystals of different blues stop being the same picture. */
export const COARSE = 10;
export const FINE = 20;

/**
 * The bottom of a slot is not the item.
 *
 * The game writes how many there are over the lower right of the
 * picture, and a five-figure count covers a third of it. So a
 * descriptor is taken of the top of the square only -- the part the
 * count never reaches -- on both sides of the comparison alike.
 */
export const KEEP = 0.72;

/**
 * One square, boiled down to something two pictures can be compared
 * by: luma and the two colour differences, each with its mean taken
 * out and scaled to unit length.
 *
 * Mean and length are what make this survive the game's own lighting.
 * A slot's background is a coloured glow that says what grade the item
 * is, the screenshot may be dimmed by whatever was behind the window,
 * and none of that should change which item it is -- taking the mean
 * out drops the glow, and the unit length drops the dimming.
 */
export function describe(rgba, w, h, { cx, cy, side }, n = FINE) {
	const rows = Math.max(1, Math.round(n * KEEP));
	const step = side / n;
	const x0 = cx - side / 2, y0 = cy - side / 2;
	const out = new Float32Array(3 * n * rows);
	const plane = n * rows;
	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < n; i++) {
			let r = 0, g = 0, b = 0, count = 0;
			const sx = x0 + i * step, sy = y0 + j * step;
			for (let y = Math.floor(sy); y < Math.max(Math.floor(sy) + 1, sy + step); y++) {
				for (let x = Math.floor(sx); x < Math.max(Math.floor(sx) + 1, sx + step); x++) {
					if (x < 0 || y < 0 || x >= w || y >= h) continue;
					const p = (y * w + x) * 4;
					const a = rgba[p + 3] / 255;
					// Over the dark the game draws its slots on, so a
					// codex icon's transparent corner and a real slot's
					// corner are the same corner.
					r += rgba[p] * a + 24 * (1 - a);
					g += rgba[p + 1] * a + 24 * (1 - a);
					b += rgba[p + 2] * a + 26 * (1 - a);
					count++;
				}
			}
			if (!count) count = 1;
			r /= count; g /= count; b /= count;
			const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
			const k = j * n + i;
			out[k] = luma;
			out[plane + k] = r - luma;
			out[2 * plane + k] = b - luma;
		}
	}
	for (let p = 0; p < 3; p++) {
		let mean = 0;
		for (let i = 0; i < plane; i++) mean += out[p * plane + i];
		mean /= plane;
		let norm = 0;
		for (let i = 0; i < plane; i++) {
			const v = out[p * plane + i] - mean;
			out[p * plane + i] = v;
			norm += v * v;
		}
		norm = Math.sqrt(norm) || 1;
		for (let i = 0; i < plane; i++) out[p * plane + i] /= norm;
	}
	return out;
}

/** How flat a square is, before anything is compared: an empty slot is
 *  a dark rectangle and nothing in the bank should be asked about it. */
export function contrastOf(rgba, w, h, { cx, cy, side }) {
	let lo = 255, hi = 0;
	const x0 = Math.round(cx - side / 2), y0 = Math.round(cy - side / 2), s = Math.round(side);
	for (let y = y0; y < y0 + s; y += 2) {
		for (let x = x0; x < x0 + s; x += 2) {
			if (x < 0 || y < 0 || x >= w || y >= h) continue;
			const p = (y * w + x) * 4;
			const v = rgba[p] * 0.2126 + rgba[p + 1] * 0.7152 + rgba[p + 2] * 0.0722;
			if (v < lo) lo = v;
			if (v > hi) hi = v;
		}
	}
	return hi - lo;
}

/**
 * The three planes of two descriptors, dotted together and weighted.
 *
 * Luma carries the drawing and the colours carry which of four
 * near-identical crates this is, so the shape is worth three times
 * either colour -- but only just: a [Level 5] Statue's Tear and a
 * [Level 5] Khan's Concentrated Magic are the same pale teardrop in
 * two different lights.
 */
export function similarity(a, b) {
	const plane = a.length / 3;
	let y = 0, u = 0, v = 0;
	for (let i = 0; i < plane; i++) {
		y += a[i] * b[i];
		u += a[plane + i] * b[plane + i];
		v += a[2 * plane + i] * b[2 * plane + i];
	}
	return 0.6 * y + 0.2 * u + 0.2 * v;
}

/* ------------------------------------------------------------------ *
 * the bank, and naming a square by it
 * ------------------------------------------------------------------ */

/**
 * One icon, described twice: coarsely for the sweep and finely for the
 * answer. `rgba` is the icon as the browser decoded it, alpha and all.
 */
export function bankEntry(name, rgba, w, h) {
	const at = { cx: w / 2, cy: h / 2, side: Math.min(w, h) };
	return { name, coarse: describe(rgba, w, h, at, COARSE), fine: describe(rgba, w, h, at, FINE) };
}

/**
 * The best names for one square, in order.
 *
 * Two passes for speed rather than for accuracy: the coarse descriptor
 * is a tenth of the work and is only ever asked to keep the shortlist
 * honest, and the fine one decides. `keep` is how long the shortlist
 * is -- long enough that the right answer is in it even when a dozen
 * crates look alike.
 */
export function rank(descriptors, bank, keep = 24) {
	const short = [];
	for (const entry of bank) {
		const s = similarity(descriptors.coarse, entry.coarse);
		if (short.length < keep) {
			short.push({ entry, s });
			if (short.length === keep) short.sort((a, b) => a.s - b.s);
		} else if (s > short[0].s) {
			short[0] = { entry, s };
			for (let i = 0; i + 1 < keep && short[i].s > short[i + 1].s; i++) {
				const t = short[i]; short[i] = short[i + 1]; short[i + 1] = t;
			}
		}
	}
	return short
		.map(({ entry }) => ({ name: entry.name, score: similarity(descriptors.fine, entry.fine) }))
		.sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------------ *
 * where the icons actually sit
 * ------------------------------------------------------------------ */

/**
 * The lattice says where the slots are; it does not say where in a slot
 * the picture is drawn, and being four pixels out costs more than
 * anything else here -- a crystal read half a pixel-row high scores
 * 0.40 against its own icon and 0.45 against somebody's sail.
 *
 * So the offset is measured rather than assumed: a handful of the
 * busiest squares are matched against the whole bank at every offset
 * within one slot, and the offset where all of them at once look most
 * like something is the offset the window is drawn at. Wrong offsets
 * suit one square and not the next, which is exactly what makes this
 * work on a window whose items the app has never heard of.
 *
 * Coarse descriptors and every second pixel for the sweep, then the
 * fine ones for the last two pixels and for how much of the slot the
 * picture fills.
 */
export function calibrate(rgba, w, h, grid, bank, { cells = null, sample = 6 } = {}) {
	const all = (cells || cellsOf(grid, w, h))
		.map(c => ({ ...c, ink: contrastOf(rgba, w, h, { cx: c.cx, cy: c.cy, side: grid.pitch * 0.8 }) }))
		.sort((a, b) => b.ink - a.ink);
	// The busiest squares, spread over different amounts of busyness --
	// a rough way of not picking six slots of the same crystal, which a
	// storage is full of and which would settle the offset on one
	// picture's quirks.
	const seen = new Set();
	const picks = [];
	for (const c of all) {
		const key = `${Math.round(c.ink / 8)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		picks.push(c);
		if (picks.length >= sample) break;
	}
	if (!picks.length) return { dx: 0, dy: 0, frac: 0.8, score: 0, picks: 0, fit: 0 };
	const total = (dx, dy, frac, n) => {
		let sum = 0;
		for (const c of picks) {
			const at = { cx: c.cx + dx, cy: c.cy + dy, side: grid.pitch * frac };
			const d = describe(rgba, w, h, at, n);
			let best = -1;
			for (const e of bank) {
				const s = similarity(d, n === COARSE ? e.coarse : e.fine);
				if (s > best) best = s;
			}
			sum += best;
		}
		return sum;
	};
	const half = grid.pitch / 2;
	let best = { dx: 0, dy: 0, frac: 0.8, score: -Infinity };
	for (let dy = -half; dy <= half; dy += 2) {
		for (let dx = -half; dx <= half; dx += 2) {
			const score = total(dx, dy, 0.8, COARSE);
			if (score > best.score) best = { dx, dy, frac: 0.8, score };
		}
	}
	let fine = { ...best, score: -Infinity };
	for (let dy = best.dy - 2; dy <= best.dy + 2; dy++) {
		for (let dx = best.dx - 2; dx <= best.dx + 2; dx++) {
			for (const frac of [0.74, 0.8, 0.86]) {
				const score = total(dx, dy, frac, FINE);
				if (score > fine.score) fine = { dx, dy, frac, score };
			}
		}
	}
	// How well it fits is asked of the best three squares, not of all
	// six: a storage with three things in it has three squares to go
	// by, and the other three are bare slots that look like nothing.
	const each = picks.map(c => {
		const d = describe(rgba, w, h, { cx: c.cx + fine.dx, cy: c.cy + fine.dy, side: grid.pitch * fine.frac }, FINE);
		return bank.reduce((m, e) => Math.max(m, similarity(d, e.fine)), -1);
	}).sort((a, b) => b - a).slice(0, 3);
	return { ...fine, picks: picks.length, fit: each.reduce((a, b) => a + b, 0) / each.length };
}

/**
 * The spacing, settled to the last fraction of a pixel by the icons.
 *
 * The comb gives a spacing good to a hundredth of a pixel when the
 * borders are crisp and to half a pixel when they are not -- and half a
 * pixel a slot is five pixels by the tenth column, which on a shot
 * shrunk to thirty-pixel slots is the count cut off every slot in the
 * top rows. The calibration cannot mend that: it slides the whole
 * lattice, and this is a lattice that fits in the middle and creeps at
 * the edges. So the spacing is tried a few parts in a thousand either
 * way, pinned at the busiest square, and kept where the squares far
 * from the pin look most like icons.
 */
export function refinePitch(rgba, w, h, grid, cal, bank, { reach = 0.02, steps = 10, sample = 12 } = {}) {
	const side = f => grid.pitch * f;
	const busy = cellsOf(grid, w, h)
		.map(c => ({ ...c, ink: contrastOf(rgba, w, h, { cx: c.cx + cal.dx, cy: c.cy + cal.dy, side: side(0.8) }) }))
		.sort((a, b) => b.ink - a.ink)
		.slice(0, sample);
	if (busy.length < 4) return grid;
	const pin = busy[0];
	const fitOf = q => {
		let sum = 0;
		for (const c of busy) {
			const at = {
				cx: pin.cx + cal.dx + (c.col - pin.col) * q,
				cy: pin.cy + cal.dy + (c.row - pin.row) * q,
				side: q * cal.frac
			};
			const d = describe(rgba, w, h, at, COARSE);
			let best = -1;
			for (const e of bank) { const v = similarity(d, e.coarse); if (v > best) best = v; }
			sum += best;
		}
		return sum / busy.length;
	};
	let best = { q: grid.pitch, fit: fitOf(grid.pitch) };
	for (let k = -steps; k <= steps; k++) {
		if (!k) continue;
		const q = grid.pitch * (1 + (reach * k) / steps);
		const fit = fitOf(q);
		if (fit > best.fit + 0.01) best = { q, fit };
	}
	if (best.q === grid.pitch) return grid;
	// the same lattice, respaced about the pin
	const x0 = pin.cx - grid.pitch / 2, y0 = pin.cy - grid.pitch / 2;
	const px = pin.cx - best.q / 2, py = pin.cy - best.q / 2;
	return {
		...grid, pitch: best.q,
		ox: px, oy: py,
		box: grid.box ? {
			x0: Math.round(px + (grid.box.x0 - x0) * best.q / grid.pitch), x1: Math.round(px + (grid.box.x1 - x0) * best.q / grid.pitch),
			y0: Math.round(py + (grid.box.y0 - y0) * best.q / grid.pitch), y1: Math.round(py + (grid.box.y1 - y0) * best.q / grid.pitch)
		} : null
	};
}

/**
 * The lattice and its calibration together, with second thoughts.
 *
 * A comb of twice the true spacing lands on every other border, and on
 * a soft enough screenshot -- a blurred one, one shrunk on its way
 * through a chat -- every other border is all there is to land on; and
 * on a whole screen shrunk small, the sea and the chat log make a comb
 * of their own that beats the storage's. Nothing about the lines says
 * so. What says so is the icons: squares of the right size look nine
 * parts in ten like something in the bank, and squares of any other
 * size, each holding a slot and a bit, look like nothing. So when the
 * calibration comes back unconvinced the spacing is looked for again a
 * band at a time, and whichever the icons believe is kept -- and when
 * they believe none of them, that is said too, because every count in
 * a shot whose slots were never found is a count of something else.
 */
export function settleGrid(rgba, w, h, gray, bank, opts = {}) {
	const tried = [];
	const attempt = o => {
		const found = findGrid(gray, w, h, { ...opts, ...o });
		if (!found || tried.some(t => Math.abs(t.grid.pitch - found.pitch) < 1)) return null;
		const rough = calibrate(rgba, w, h, found, bank);
		const grid = refinePitch(rgba, w, h, found, rough, bank);
		const cal = grid === found ? rough : calibrate(rgba, w, h, grid, bank);
		tried.push({ grid, cal, fit: cal.fit });
		return tried[tried.length - 1];
	};
	const first = attempt({});
	if (!first) return null;
	if (first.fit >= BELIEVED) return first;
	const lo = opts.min || 24, hi = opts.max || 120;
	for (const [min, max] of [[first.grid.pitch * 0.4, first.grid.pitch * 0.6], [lo, 40], [36, 60], [54, 90], [80, hi]]) {
		if (max <= lo || min >= hi) continue;
		const got = attempt({ min: Math.max(lo, min), max: Math.min(hi, max) });
		if (got && got.fit >= BELIEVED) return got;
	}
	const best = tried.reduce((a, b) => (b.fit > a.fit + 0.05 ? b : a));
	return { ...best, doubtful: true };
}

/** How like the bank's icons a lattice's busiest squares have to be,
 *  on average, for the lattice to be believed: the right one scores
 *  0.93, one of the wrong spacing 0.5. */
export const BELIEVED = 0.78;

/**
 * Every square of the window, named where it can be.
 *
 * A slot with nothing in it is a dark rectangle and is passed over
 * without asking the bank about it; so is the title bar, the footer and
 * whatever else the lattice happened to run across, since none of them
 * look like an icon. What comes back is one row a square, in reading
 * order, with the runner-up beside the answer so a caller can say how
 * sure it was.
 */
export function readSlots(rgba, w, h, grid, bank, cal, { flat = 26 } = {}) {
	const side = grid.pitch * (cal.frac || 0.8);
	const out = [];
	for (const c of cellsOf(grid, w, h)) {
		const at = { cx: c.cx + (cal.dx || 0), cy: c.cy + (cal.dy || 0), side };
		const ink = contrastOf(rgba, w, h, at);
		if (ink < flat) { out.push({ ...c, empty: true, at }); continue; }
		const coarse = describe(rgba, w, h, at, COARSE);
		const ranked = rank({ coarse, fine: describe(rgba, w, h, at, FINE) }, bank);
		const hit = nameOf(ranked);
		out.push({
			...c, empty: false, at,
			// what the square looks like, named or not: two screenshots
			// of one storage are lined up by it (see overlapOf)
			sig: coarse,
			name: hit ? hit.name : null,
			score: ranked[0] ? ranked[0].score : 0,
			runnerUp: ranked[1] ? ranked[1].score : 0,
			second: ranked[1] ? ranked[1].name : null
		});
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * how many
 * ------------------------------------------------------------------ */

// Reading the figure written over a slot is a different problem from
// naming the slot, and it was solved the wrong way first: the corner
// was thresholded and handed to the OCR engine, which reads a page of
// print beautifully and an eight-pixel count over a gold bar not at
// all. Half the counts came back wrong, and a wrong count is worse
// than no count.
//
// What the pixels actually say, measured:
//
//   * The count is NOT the palest thing on a slot. Over a white icon
//     the figures reach 143 where the drawing under them reaches 198.
//     Every threshold built on "the text is the brightest" was doomed.
//   * The count IS stroked: the game draws a dark outline all the way
//     round it. A figure's upright has that dark on both sides of it;
//     the silhouette of a drawing has the dark on one side and the
//     drawing on the other. That is the one signal that separates them.
//   * Every count in a window sits on ONE line, at ONE height, against
//     ONE right margin. Measured across four screenshots at two
//     resolutions: the baseline scatters by three tenths of a pixel.
//
// So: find the line and the height from all the slots at once, then
// read each count as a row of boxes of known size, right to left,
// against the game's own figures (js/digit_font.js). No engine, no
// six megabytes, and a count that cannot be read says so.

/**
 * Where on a slot the count is written: the bottom of it, which is the
 * one part of a slot the descriptors were told to ignore.
 *
 * The whole width is taken and only the height trimmed -- cropping to
 * the right would cut the leading figure off a stack of 58,855 and
 * hand back 855.
 */
export function countBox(at) {
	const side = at.side;
	return {
		x: at.cx - side / 2,
		y: at.cy + side * (KEEP - 0.5) - side * 0.04,
		w: side,
		h: side * (1 - KEEP) + side * 0.04
	};
}

/** The size every slot's lower half is brought to before it is read:
 *  a slot is sixty-four across whatever the UI scale was, so a figure is
 *  the same thirteen pixels tall on a 4K monitor and on a laptop. */
export const PATCH_W = 64;
export const PATCH_H = 32;

/**
 * The lower half of one slot, resampled to the patch the reader was
 * taught on: three planes of PATCH_W by PATCH_H, red then green then
 * blue, nought to one.
 *
 * Colour is kept. A figure is the one thing on a slot with no colour
 * in it, and that is half of what tells a 1 from the edge of a plank.
 */
export function countPatch(rgba, w, h, cell, pitch, { dx = 0, dy = 0, zoom = 1 } = {}) {
	const out = new Float32Array(3 * PATCH_W * PATCH_H);
	const side = pitch * zoom;
	const x0 = cell.cx + dx - side / 2, y0 = cell.cy + dy + pitch / 2 - side / 2;
	const step = side / PATCH_W;
	// Shrinking averages, growing interpolates: n samples a side cover
	// the source pixels one patch pixel stands for.
	const n = Math.max(1, Math.ceil(step));
	const plane = PATCH_W * PATCH_H;
	for (let j = 0; j < PATCH_H; j++) {
		for (let i = 0; i < PATCH_W; i++) {
			let r = 0, g = 0, b = 0;
			for (let v = 0; v < n; v++) {
				for (let u = 0; u < n; u++) {
					const sx = Math.min(w - 1, Math.max(0, x0 + (i + (u + 0.5) / n) * step - 0.5));
					const sy = Math.min(h - 1, Math.max(0, y0 + (j + (v + 0.5) / n) * step - 0.5));
					const xa = Math.floor(sx), ya = Math.floor(sy);
					const xb = Math.min(w - 1, xa + 1), yb = Math.min(h - 1, ya + 1);
					const fx = sx - xa, fy = sy - ya;
					const p00 = (ya * w + xa) * 4, p01 = (ya * w + xb) * 4, p10 = (yb * w + xa) * 4, p11 = (yb * w + xb) * 4;
					const w00 = (1 - fx) * (1 - fy), w01 = fx * (1 - fy), w10 = (1 - fx) * fy, w11 = fx * fy;
					r += rgba[p00] * w00 + rgba[p01] * w01 + rgba[p10] * w10 + rgba[p11] * w11;
					g += rgba[p00 + 1] * w00 + rgba[p01 + 1] * w01 + rgba[p10 + 1] * w10 + rgba[p11 + 1] * w11;
					b += rgba[p00 + 2] * w00 + rgba[p01 + 2] * w01 + rgba[p10 + 2] * w10 + rgba[p11 + 2] * w11;
				}
			}
			const k = j * PATCH_W + i, by = 255 * n * n;
			out[k] = r / by;
			out[plane + k] = g / by;
			out[2 * plane + k] = b / by;
		}
	}
	return out;
}

/**
 * How likely a reading has to be before it is written down without
 * asking, and how likely before it is not even looked at twice.
 */
export const SURE = 0.9;
export const PLAIN = 0.99;

/**
 * The number written on one slot.
 *
 * `blank` is a slot with nothing written on it, which is how the game
 * says "one of these" and is most of a storage. `doubt` is a reading
 * the player should be shown the slot for: the network was not sure of
 * it, or read it differently when the patch was cut a pixel to either
 * side -- and a real figure does not change when the scissors slip.
 */
export function readCount(rgba, w, h, cell, pitch, { model = COUNT_MODEL, sure = SURE } = {}) {
	const read = j => decodeCount(runNet(model, countPatch(rgba, w, h, cell, pitch, j), PATCH_H, PATCH_W));
	const first = read({});
	const answer = (text, score, doubt) => (text
		? { count: Number(text), score, doubt }
		: { count: 1, blank: true, score, doubt });
	if (first.sure >= PLAIN) return answer(first.text, first.sure, false);
	const nudge = pitch * 0.025;
	const again = [read({ dx: -nudge, dy: nudge / 2 }), read({ dx: nudge, dy: -nudge / 2 })];
	const all = [first, ...again];
	const agreed = all.every(r => r.text === first.text);
	if (agreed) {
		const score = Math.min(...all.map(r => r.sure));
		return answer(first.text, score, score < sure);
	}
	// They differ: say the one most of them said, the surest of those,
	// and say it is a guess.
	const votes = new Map();
	for (const r of all) votes.set(r.text, (votes.get(r.text) || 0) + 1 + r.sure / 10);
	const text = [...votes].sort((x, y) => y[1] - x[1])[0][0];
	return answer(text, Math.min(...all.map(r => r.sure)), true);
}

/**
 * Every count in a storage window, a reading a slot.
 *
 * `slots` are what readSlots gave back, and each carries the square its
 * icon was actually matched in -- the lattice nudged by the calibration
 * -- which is the square the count is written in too.
 */
export function readCounts(rgba, w, h, grid, slots, opts = {}) {
	const out = new Map();
	for (const slot of slots) {
		const cell = slot.at || slot;
		out.set(slot, readCount(rgba, w, h, cell, grid.pitch, opts));
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * two screenshots of one storage
 * ------------------------------------------------------------------ */

/**
 * Whether a square that is not flat is a slot with something in it.
 *
 * The lattice runs on past the storage -- over its title bar, its
 * scroll bar, the sea beside it -- and those squares are busy without
 * being items. What tells them apart is that an item, even one this app
 * has never heard of, is drawn the way items are drawn and looks seven
 * parts in ten like *some* icon; a title bar looks like none.
 */
export const HELD = 0.68;
export const isHeld = slot => !slot.empty && slot.score >= HELD;

/** A shot's slots as rows of columns, from the first row that holds
 *  anything to the last: the title bar above a storage and the bare
 *  slots under it are on the lattice too, and say nothing. */
function contentRows(slots) {
	const rows = new Map();
	for (const s of slots) {
		if (!s.empty && !isHeld(s)) continue;
		if (!rows.has(s.row)) rows.set(s.row, new Map());
		rows.get(s.row).set(s.col, s);
	}
	const keys = [...rows.keys()].sort((a, b) => a - b);
	const held = keys.filter(k => [...rows.get(k).values()].some(isHeld));
	if (!held.length) return [];
	return keys.filter(k => k >= held[0] && k <= held[held.length - 1]).map(k => ({ row: k, cols: rows.get(k) }));
}

/**
 * How many rows at the top of one screenshot are the rows at the bottom
 * of another -- which is what scrolling a storage and shooting it again
 * leaves, and what would otherwise count twelve crystals as twenty-four.
 *
 * Squares are compared as pictures, not as names: most of a storage is
 * things this app keeps no count of, and they line two shots up as well
 * as the ones it does. The longest run that agrees slot for slot wins,
 * a column either way allowed for a crop that lost its first one -- and
 * a run of nothing but one item repeated is not believed, because two
 * rows of dynamite look exactly like one row of dynamite shot twice.
 */
export function overlapOf(above, below, { alike = 0.85, least = 5 } = {}) {
	const a = contentRows(above), b = contentRows(below);
	let best = null;
	for (let k = Math.min(a.length, b.length); k >= 1 && !best; k--) {
		for (const shift of [0, 1, -1, 2, -2]) {
			let pairs = 0, off = 0, ok = true;
			const seen = [];
			let bare = false, full = false;
			for (let i = 0; i < k && ok; i++) {
				const top = a[a.length - k + i].cols, bottom = b[i].cols;
				let rowPairs = 0, rowOff = 0;
				for (const [col, s] of bottom) {
					const t = top.get(col + shift);
					if (!t) continue;
					rowPairs++;
					if (s.empty || t.empty) {
						if (s.empty !== t.empty) rowOff++;
						else bare = true;
						continue;
					}
					full = true;
					if (similarity(s.sig, t.sig) < alike) rowOff++;
					else seen.push(s.sig);
				}
				// one slot a row may differ: the pointer was over it
				if (rowPairs < least || rowOff > 1) ok = false;
				pairs += rowPairs; off += rowOff;
			}
			if (!ok || !full) continue;
			const varied = (bare && full) || seen.some(sig => similarity(sig, seen[0]) < alike);
			if (!varied) continue;
			best = { rows: k, shift, from: b[0].row, to: b[k - 1].row, pairs, off };
			break;
		}
	}
	return best;
}

/**
 * Several shots of one storage, each slot kept once. Every shot is laid
 * under every shot before it, both ways up -- nobody drops files in the
 * order they scrolled -- and the rows it shares are left out of it.
 * What comes back is, per shot, the rows of it that are somebody
 * else's.
 */
export function sharedRows(shots) {
	const out = shots.map(() => new Set());
	for (let j = 1; j < shots.length; j++) {
		for (let i = 0; i < j; i++) {
			const down = overlapOf(shots[i], shots[j]);
			const up = overlapOf(shots[j], shots[i]);
			const rows = contentRows(shots[j]);
			if (down && (!up || down.rows >= up.rows)) for (const r of rows.slice(0, down.rows)) out[j].add(r.row);
			else if (up) for (const r of rows.slice(rows.length - up.rows)) out[j].add(r.row);
		}
	}
	return out;
}

/**
 * What a square is taken to be, or nothing.
 *
 * Two thresholds, and the second is the one that matters. A score says
 * how like the best icon this square is; a margin says how much less
 * like the next one. An item the app has never heard of -- and a
 * storage is full of those -- will still look something like one of
 * five hundred pictures, and what gives it away is that it looks
 * nearly as much like the one after that.
 */
export function nameOf(ranked, { floor = 0.62, margin = 0.06 } = {}) {
	if (!ranked.length) return null;
	const [best, next] = ranked;
	if (best.score < floor) return null;
	// Two icons that are the same picture (a family drawn once) are not
	// an ambiguity, they are one answer wearing two names.
	if (next && best.score - next.score < margin) return null;
	return best;
}
