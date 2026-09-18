// Reading a storage window off a screenshot.
//
// Nothing real is in here on purpose. A screenshot of a storage is 300
// kilobytes of somebody's account and would rot in the repository the
// first time the game repaints an icon; what this checks is the part
// that has nothing to do with the game -- that a lattice is found in a
// picture that has one, at a spacing nobody was told, and that a square
// is named by the picture drawn in it and not by the one beside it.
//
// So the storage below is painted here: a dark window, a grid of
// borders at a pitch and an offset the test picks, and in the slots a
// handful of made-up icons. They are drawn the way the game draws them
// -- smaller than the slot, over a glow that says what grade the item
// is, with a count written over the bottom right -- which is the whole
// point: all three are what the reader has to see past.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
	grayscale, edgeProfile, combFit, gridOf, cellsOf, panelOf,
	describe as descriptorOf, similarity, bankEntry, rank, nameOf,
	calibrate, settleGrid, BELIEVED, readSlots, countBox, countPatch, PATCH_W, PATCH_H, overlapOf, sharedRows, isHeld, COARSE, FINE
} from '../js/storage-shot.js';

/* ------------------------------------------------------------------ *
 * a storage, painted
 * ------------------------------------------------------------------ */

/** A repeatable stream of numbers, so a failure is the same failure
 *  tomorrow. */
function rolls(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** Somewhere to paint, and the means to. */
function sheet(w, h, fill = [12, 12, 16]) {
	const rgba = new Uint8Array(w * h * 4);
	for (let i = 0; i < w * h; i++) {
		rgba[i * 4] = fill[0]; rgba[i * 4 + 1] = fill[1]; rgba[i * 4 + 2] = fill[2]; rgba[i * 4 + 3] = 255;
	}
	const put = (x, y, [r, g, b, a = 255]) => {
		x |= 0; y |= 0;
		if (x < 0 || y < 0 || x >= w || y >= h) return;
		const p = (y * w + x) * 4;
		const k = a / 255;
		rgba[p] = rgba[p] * (1 - k) + r * k;
		rgba[p + 1] = rgba[p + 1] * (1 - k) + g * k;
		rgba[p + 2] = rgba[p + 2] * (1 - k) + b * k;
		rgba[p + 3] = 255;
	};
	const box = (x0, y0, bw, bh, colour) => {
		for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) put(x, y, colour);
	};
	const disc = (cx, cy, r, colour) => {
		for (let y = cy - r; y <= cy + r; y++) {
			for (let x = cx - r; x <= cx + r; x++) {
				if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, colour);
			}
		}
	};
	return { w, h, rgba, put, box, disc };
}

/**
 * One made-up icon: a disc and two bars on a transparent ground, in
 * colours of its own. Big smooth shapes rather than noise, because the
 * reader compares a 44-pixel icon against a slot drawn smaller and
 * noise would not survive the resampling -- and neither would a real
 * icon's, which is why the real ones are drawings too.
 */
function icon(seed) {
	const next = rolls(seed);
	const s = sheet(44, 44, [0, 0, 0]);
	for (let i = 0; i < 44 * 44; i++) s.rgba[i * 4 + 3] = 0;
	const hue = () => [40 + Math.floor(next() * 215), 40 + Math.floor(next() * 215), 40 + Math.floor(next() * 215)];
	s.disc(12 + Math.floor(next() * 20), 12 + Math.floor(next() * 20), 8 + Math.floor(next() * 6), hue());
	s.box(4 + Math.floor(next() * 10), 6 + Math.floor(next() * 24), 6 + Math.floor(next() * 12), 5 + Math.floor(next() * 8), hue());
	s.box(10 + Math.floor(next() * 20), 4 + Math.floor(next() * 20), 4 + Math.floor(next() * 8), 14 + Math.floor(next() * 10), hue());
	return s;
}

const BANK_SIZE = 12;
const icons = Array.from({ length: BANK_SIZE }, (_, i) => icon(1000 + i * 37));
const bank = icons.map((ic, i) => bankEntry(`icon ${i}`, ic.rgba, 44, 44));

/**
 * A storage window: a title band, a lattice of slots at `pitch`, and
 * the icons named in `plan` drawn into them the way the game does it.
 */
function window_({ pitch = 48, ox = 9, oy = 37, cols = 7, rows = 5, plan = [], pad = 6, grade = true, counts = true } = {}) {
	const w = Math.round(ox + cols * pitch + pad);
	const h = Math.round(oy + rows * pitch + pad + 18);
	const s = sheet(w, h);
	// A title band with writing in it, which is not on the lattice.
	s.box(0, 0, w, oy - 4, [30, 32, 40]);
	for (let i = 0; i < 9; i++) s.box(8 + i * 17, 10, 11, 9, [190, 190, 200]);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const x = Math.round(ox + c * pitch), y = Math.round(oy + r * pitch);
			// the slot: a border, a dark inside, and the grade's glow
			s.box(x, y, pitch, pitch, [96, 98, 110]);
			s.box(x + 2, y + 2, pitch - 4, pitch - 4, [26, 27, 33]);
			const put = plan.find(p => p.row === r && p.col === c);
			if (grade && put) s.box(x + 3, y + 3, pitch - 6, pitch - 6, [22, 40, 70]);
			if (!put) continue;
			// the icon, drawn at four fifths of the slot
			const side = pitch * 0.8;
			const at = { x: x + (pitch - side) / 2, y: y + (pitch - side) / 2 };
			const ic = icons[put.icon];
			for (let py = 0; py < side; py++) {
				for (let px = 0; px < side; px++) {
					const sx = Math.min(43, Math.floor(px * 44 / side)), sy = Math.min(43, Math.floor(py * 44 / side));
					const p = (sy * 44 + sx) * 4;
					s.put(at.x + px, at.y + py, [ic.rgba[p], ic.rgba[p + 1], ic.rgba[p + 2], ic.rgba[p + 3]]);
				}
			}
			// the count, over the bottom right, as the game writes it
			if (counts && put.n > 1) {
				const digits = String(put.n).length;
				s.box(x + pitch - 5 - digits * 6, y + pitch - 14, digits * 6, 9, [235, 235, 235]);
			}
		}
	}
	return s;
}

const everySlot = (rows, cols) => {
	const plan = [];
	for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) plan.push({ row: r, col: c, icon: (r * cols + c) % BANK_SIZE, n: 1 + r * 3 + c });
	return plan;
};

/** The reader's three steps, run over a painted window. */
function read(s) {
	const gray = grayscale(s.rgba, s.w, s.h);
	const grid = gridOf(gray, s.w, s.h);
	const cal = calibrate(s.rgba, s.w, s.h, grid, bank);
	return { grid, cal, slots: readSlots(s.rgba, s.w, s.h, grid, bank, cal) };
}

/* ------------------------------------------------------------------ *
 * the lattice
 * ------------------------------------------------------------------ */

test('a comb finds the spacing of evenly spaced lines, fractions and all', () => {
	const profile = new Float32Array(600);
	for (let t = 13.4; t < 600; t += 41.7) {
		profile[Math.round(t)] = 100;
		profile[Math.round(t) + 1] = 60;
	}
	const fit = combFit(profile);
	assert.ok(Math.abs(fit.pitch - 41.7) < 0.5, `pitch ${fit.pitch}`);
	assert.ok(Math.abs((fit.offset - 13.4) % 41.7) < 1.5, `offset ${fit.offset}`);
});

test('the comb takes the lattice, not a multiple of it', () => {
	// Every second line a little brighter: the comb that skips the dim
	// ones finds more edge a tooth, and is still the wrong answer.
	const profile = new Float32Array(600);
	let k = 0;
	for (let t = 20; t < 600; t += 50) profile[t] = (k++ % 2) ? 60 : 100;
	assert.ok(Math.abs(combFit(profile).pitch - 50) < 1);
});

test('nothing is read out of a picture with no lattice in it', () => {
	const s = sheet(400, 300, [20, 20, 24]);
	const next = rolls(7);
	for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x++) {
		s.put(x, y, [next() * 255, next() * 255, next() * 255]);
	}
	const grid = gridOf(grayscale(s.rgba, s.w, s.h), s.w, s.h);
	// A fit is allowed; naming anything off it is not.
	if (grid) {
		const slots = readSlots(s.rgba, s.w, s.h, grid, bank, { dx: 0, dy: 0, frac: 0.8 });
		assert.equal(slots.filter(x => x.name).length, 0);
	}
});

test('the lattice is found at a pitch and an offset nobody was told', () => {
	for (const pitch of [40, 48, 56.75]) {
		const s = window_({ pitch, ox: 9, oy: 37, plan: everySlot(5, 7) });
		const grid = gridOf(grayscale(s.rgba, s.w, s.h), s.w, s.h);
		assert.ok(grid, `no grid at pitch ${pitch}`);
		assert.ok(Math.abs(grid.pitch - pitch) < 0.6, `pitch ${grid.pitch} for ${pitch}`);
	}
});

test('a slot cut in half by the crop is still a slot, a sliver is not', () => {
	const grid = { pitch: 50, ox: -8, oy: 10 };
	const cells = cellsOf(grid, 300, 200);
	assert.equal(Math.min(...cells.map(c => c.cx)), 17);   // the cut column, four fifths of it present
	const slivers = cellsOf({ pitch: 50, ox: -45, oy: 10 }, 300, 200);
	assert.ok(Math.min(...slivers.map(c => c.cx)) > 20);
});

/* ------------------------------------------------------------------ *
 * naming a square
 * ------------------------------------------------------------------ */

test('a descriptor is the drawing, not the light it was drawn in', () => {
	const at = { cx: 22, cy: 22, side: 44 };
	const plain = descriptorOf(icons[3].rgba, 44, 44, at, FINE);
	// The same icon, dimmed by a third and laid over a coloured glow.
	const lit = sheet(44, 44, [18, 40, 90]);
	for (let i = 0; i < 44 * 44; i++) {
		const p = i * 4;
		lit.put(i % 44, Math.floor(i / 44), [icons[3].rgba[p] * 0.66, icons[3].rgba[p + 1] * 0.66, icons[3].rgba[p + 2] * 0.66, icons[3].rgba[p + 3]]);
	}
	assert.ok(similarity(plain, descriptorOf(lit.rgba, 44, 44, at, FINE)) > 0.9);
});

test('a square is named by what is drawn in it', () => {
	const plan = everySlot(5, 7);
	const { grid, slots } = read(window_({ plan }));
	assert.ok(grid);
	const named = slots.filter(s => s.name);
	assert.ok(named.length >= plan.length, `named ${named.length} of ${plan.length}`);
	for (const p of plan) {
		const hit = slots.find(s => s.name && Math.abs(s.cx - (grid.ox % grid.pitch) - p.col * grid.pitch - grid.pitch / 2) < 3
			&& Math.abs(s.cy - (grid.oy % grid.pitch) - p.row * grid.pitch - grid.pitch / 2) < 3);
		assert.ok(hit, `nothing read at ${p.row},${p.col}`);
		assert.equal(hit.name, `icon ${p.icon}`, `at ${p.row},${p.col}`);
	}
});

test('an empty slot is empty, and the title bar is not an item', () => {
	const plan = [{ row: 1, col: 1, icon: 2, n: 4 }, { row: 3, col: 5, icon: 7, n: 1200 }];
	const { slots } = read(window_({ plan }));
	assert.equal(slots.filter(s => s.name).length, 2);
	assert.ok(slots.filter(s => s.empty).length > 20);
});

test('an item the bank has never seen is left out, not guessed at', () => {
	const stranger = icon(999999);
	const plan = [{ row: 0, col: 0, icon: 0, n: 1 }, { row: 2, col: 2, icon: 5, n: 2 }];
	const s = window_({ plan });
	// paint the stranger into a slot of its own, at the same size
	const grid = { pitch: 48, ox: 9, oy: 37 };
	const x = grid.ox + 4 * grid.pitch, y = grid.oy + 1 * grid.pitch;
	const side = grid.pitch * 0.8;
	for (let py = 0; py < side; py++) {
		for (let px = 0; px < side; px++) {
			const sx = Math.floor(px * 44 / side), sy = Math.floor(py * 44 / side);
			const p = (sy * 44 + sx) * 4;
			s.put(x + (grid.pitch - side) / 2 + px, y + (grid.pitch - side) / 2 + py,
				[stranger.rgba[p], stranger.rgba[p + 1], stranger.rgba[p + 2], stranger.rgba[p + 3]]);
		}
	}
	const { slots } = read(s);
	const at = slots.find(c => Math.abs(c.cx - (x + grid.pitch / 2)) < 4 && Math.abs(c.cy - (y + grid.pitch / 2)) < 4);
	assert.ok(at && !at.name, `the stranger was read as ${at && at.name}`);
});

test('two pictures that are the same picture are an ambiguity, not an answer', () => {
	const twin = [...bank, { ...bank[4], name: 'icon 4, the other one' }];
	const s = window_({ plan: [{ row: 2, col: 3, icon: 4, n: 1 }] });
	const gray = grayscale(s.rgba, s.w, s.h);
	const grid = gridOf(gray, s.w, s.h);
	const cal = calibrate(s.rgba, s.w, s.h, grid, twin);
	const slots = readSlots(s.rgba, s.w, s.h, grid, twin, cal);
	const on = slots.find(x => !x.empty && x.score > 0.8);
	assert.ok(on, 'the slot was not read at all');
	assert.equal(on.name, null);
	assert.ok(on.second && on.second.startsWith('icon 4'));
});

test('the runner-up has to be a distance behind', () => {
	assert.equal(nameOf([{ name: 'a', score: 0.9 }, { name: 'b', score: 0.87 }]), null);
	assert.equal(nameOf([{ name: 'a', score: 0.55 }, { name: 'b', score: 0.1 }]), null);
	assert.equal(nameOf([{ name: 'a', score: 0.9 }, { name: 'b', score: 0.5 }]).name, 'a');
});

/* ------------------------------------------------------------------ *
 * a window inside a screenshot of everything
 * ------------------------------------------------------------------ */

test('the panel is found in a shot of the whole screen', () => {
	// A sea with its own texture, a chat log, and the storage in the
	// corner of it -- which is what the game's own screenshot key takes.
	const screen = sheet(1200, 800, [30, 48, 66]);
	const next = rolls(21);
	for (let y = 0; y < 800; y++) {
		for (let x = 0; x < 1200; x++) {
			const v = 40 + Math.sin(x / 9) * 14 + Math.sin(y / 5) * 10 + next() * 30;
			screen.put(x, y, [v * 0.5, v * 0.8, v]);
		}
	}
	for (let i = 0; i < 14; i++) screen.box(20, 600 + i * 12, 60 + Math.floor(next() * 300), 8, [200, 200, 205]);
	const panel = window_({ pitch: 45, ox: 6, oy: 34, cols: 9, rows: 8, plan: everySlot(8, 9) });
	for (let y = 0; y < panel.h; y++) {
		for (let x = 0; x < panel.w; x++) {
			const p = (y * panel.w + x) * 4;
			screen.put(700 + x, 60 + y, [panel.rgba[p], panel.rgba[p + 1], panel.rgba[p + 2]]);
		}
	}
	const gray = grayscale(screen.rgba, screen.w, screen.h);
	const found = panelOf(gray, screen.w, screen.h);
	assert.ok(found, 'no panel found');
	assert.ok(Math.abs(found.pitch - 45) < 3, `pitch ${found.pitch}`);
	assert.ok(found.x0 >= 400 && found.x1 > 1000, `box ${JSON.stringify(found)}`);
	const grid = gridOf(gray, screen.w, screen.h, { region: found, min: found.pitch * 0.85, max: found.pitch * 1.15 });
	assert.ok(Math.abs(grid.pitch - 45) < 1, `grid pitch ${grid.pitch}`);
	const cal = calibrate(screen.rgba, screen.w, screen.h, grid, bank);
	const slots = readSlots(screen.rgba, screen.w, screen.h, grid, bank, cal);
	assert.ok(slots.filter(s => s.name).length >= 60, `named ${slots.filter(s => s.name).length} of 72`);
});

/* ------------------------------------------------------------------ *
 * the sweep, in passing
 * ------------------------------------------------------------------ */

test('the coarse pass keeps the right answer in the shortlist', () => {
	const at = { cx: 22, cy: 22, side: 44 };
	for (let i = 0; i < BANK_SIZE; i++) {
		const d = {
			coarse: descriptorOf(icons[i].rgba, 44, 44, at, COARSE),
			fine: descriptorOf(icons[i].rgba, 44, 44, at, FINE)
		};
		assert.equal(rank(d, bank)[0].name, `icon ${i}`);
	}
});

test('an edge profile is taken along the axis it was asked for', () => {
	// A picture of horizontal stripes has edges down it and none across.
	const s = sheet(120, 90);
	for (let y = 10; y < 90; y += 20) s.box(0, y, 120, 2, [220, 220, 220]);
	const gray = grayscale(s.rgba, 120, 90);
	const down = edgeProfile(gray, 120, 90, 'y', 0, 120);
	const across = edgeProfile(gray, 120, 90, 'x', 0, 90);
	assert.ok(Math.max(...down) > 100);
	assert.ok(Math.max(...across) < 30);
});

/* ------------------------------------------------------------------ *
 * a lattice the icons believe
 * ------------------------------------------------------------------ */

test('a lattice is believed when its squares look like icons', () => {
	const s = window_({ pitch: 52, plan: everySlot(5, 7) });
	const settled = settleGrid(s.rgba, s.w, s.h, grayscale(s.rgba, s.w, s.h), bank);
	assert.ok(settled && !settled.doubtful);
	assert.ok(Math.abs(settled.grid.pitch - 52) < 0.6, `pitch ${settled.grid.pitch}`);
	assert.ok(settled.fit >= BELIEVED);
});

test('three things in a bare storage are enough to believe it', () => {
	const plan = [{ row: 0, col: 0, icon: 1, n: 1 }, { row: 2, col: 3, icon: 5, n: 1 }, { row: 4, col: 6, icon: 9, n: 1 }];
	const s = window_({ plan });
	const settled = settleGrid(s.rgba, s.w, s.h, grayscale(s.rgba, s.w, s.h), bank);
	assert.ok(settled && !settled.doubtful, `fit ${settled && settled.fit}`);
});

test('a lattice of things that are not icons is handed over as doubtful', () => {
	// every slot holds a stranger: the borders are a perfect lattice and
	// nothing in it looks like anything the bank has
	const strangers = Array.from({ length: BANK_SIZE }, (_, i) => icon(777000 + i * 91));
	const others = strangers.map((ic, i) => bankEntry(`other ${i}`, ic.rgba, 44, 44));
	const s = sheet(400, 300);
	for (let i = 0; i < 40; i++) s.box(10 + (i % 8) * 47, 12 + Math.floor(i / 8) * 53, 30, 9, [200, 200, 210]);
	const settled = settleGrid(s.rgba, s.w, s.h, grayscale(s.rgba, s.w, s.h), others);
	assert.ok(!settled || settled.doubtful, 'bars on a page were believed to be a storage');
});

/* ------------------------------------------------------------------ *
 * the count over the corner
 *
 * What reads the figures is a network, and it is tested against real
 * slots in count-net.test.mjs. Here is only the cutting: that the patch
 * handed to it is the lower half of the slot, whatever the slot's size.
 * ------------------------------------------------------------------ */

test('the corner of a slot is where the count is, and it is all of the width', () => {
	const box = countBox({ cx: 100, cy: 100, side: 50 });
	assert.equal(box.x, 75);                         // the whole width: 58,855 is wide
	assert.ok(box.y > 100 && box.y + box.h <= 126);  // the bottom of the slot only
});

test('the patch is the lower half of the slot, at one size whatever the slot was', () => {
	for (const pitch of [40, 64, 96]) {
		const s = sheet(pitch * 3, pitch * 3, [0, 0, 0]);
		const x = pitch, y = pitch;
		s.box(x, y, pitch, pitch / 2, [255, 0, 0]);                       // upper half: never seen
		s.box(x, y + pitch / 2, pitch / 2, pitch / 2, [0, 255, 0]);       // lower left
		s.box(x + pitch / 2, y + pitch / 2, pitch / 2, pitch / 2, [0, 0, 255]); // lower right
		const patch = countPatch(s.rgba, s.w, s.h, { cx: x + pitch / 2, cy: y + pitch / 2 }, pitch);
		assert.equal(patch.length, 3 * PATCH_W * PATCH_H);
		const at = (plane, i, j) => patch[plane * PATCH_W * PATCH_H + j * PATCH_W + i];
		for (const j of [4, 16, 27]) {
			assert.ok(at(0, 8, j) < 0.05 && at(0, 56, j) < 0.05, `red from the upper half at pitch ${pitch}`);
			assert.ok(at(1, 8, j) > 0.95 && at(2, 8, j) < 0.05, `lower left at pitch ${pitch}`);
			assert.ok(at(2, 56, j) > 0.95 && at(1, 56, j) < 0.05, `lower right at pitch ${pitch}`);
		}
	}
});

/* ------------------------------------------------------------------ *
 * two screenshots of one storage
 * ------------------------------------------------------------------ */

/** A lattice as readSlots gives it back, from rows of letters: a letter
 *  is an item (the same letter, the same picture), a dot an empty slot,
 *  and `#` a busy square that is no item -- the title bar. */
function lattice(rows, { firstRow = 0 } = {}) {
	const sigs = new Map();
	const sigOf = ch => {
		if (!sigs.has(ch)) {
			const next = rolls(ch.charCodeAt(0) * 7919);
			// unit length a plane, as describe() leaves them
			const plane = COARSE * COARSE;
			const v = Float32Array.from({ length: 3 * plane }, () => next() - 0.5);
			for (let k = 0; k < 3; k++) {
				const len = Math.hypot(...v.subarray(k * plane, (k + 1) * plane));
				for (let i = k * plane; i < (k + 1) * plane; i++) v[i] /= len;
			}
			sigs.set(ch, v);
		}
		return sigs.get(ch);
	};
	const out = [];
	rows.forEach((line, r) => [...line].forEach((ch, c) => {
		const at = { row: firstRow + r, col: c };
		if (ch === '.') out.push({ ...at, empty: true });
		else if (ch === '#') out.push({ ...at, empty: false, score: 0.4, sig: sigOf(ch) });
		else out.push({ ...at, empty: false, score: 0.9, sig: sigOf(ch) });
	}));
	return out;
}

test('a title bar is busy without being an item', () => {
	const [bar, thing, bare] = lattice(['#a.']);
	assert.equal(isHeld(bar), false);
	assert.equal(isHeld(thing), true);
	assert.equal(isHeld(bare), false);
});

test('the rows two shots share are found, title bars and all', () => {
	const first = lattice(['###...##', 'abcdefgh', 'ijklmnop', 'qqqrrsst']);
	const second = lattice(['###...##', 'qqqrrsst', 'uvwxyzab', 'cd......', '........']);
	const hit = overlapOf(first, second);
	assert.ok(hit, 'the shared row was not found');
	assert.equal(hit.rows, 1);
	assert.equal(overlapOf(second, first), null);
	const shared = sharedRows([first, second]);
	assert.deepEqual([...shared[0]], []);
	assert.deepEqual([...shared[1]], [1]);           // the second shot's row 1 is the first's last
});

test('shots dropped in the wrong order still share their rows once', () => {
	const upper = lattice(['abcdefgh', 'ijklmnop', 'qrstuvwx']);
	const lower = lattice(['ijklmnop', 'qrstuvwx', 'yzabcdef']);
	const shared = sharedRows([lower, upper]);
	assert.deepEqual([...shared[0]], []);
	assert.deepEqual([...shared[1]].sort(), [1, 2]);  // upper's last two are lower's first two
});

test('the same shot given twice is one storage, not two', () => {
	const shot = lattice(['abcdefgh', 'ijklmnop', 'qr......']);
	const shared = sharedRows([shot, lattice(['abcdefgh', 'ijklmnop', 'qr......'])]);
	assert.equal(shared[1].size, 3);
});

test('a row of one thing repeated is not proof of anything', () => {
	// Eighteen sticks of dynamite over two rows: the end of one shot and
	// the start of the next look alike and are not the same row.
	const first = lattice(['abcdefgh', 'dddddddd']);
	const second = lattice(['dddddddd', 'ijklmnop']);
	assert.equal(overlapOf(first, second), null);
});

test('a crop that lost its first column still lines up', () => {
	const first = lattice(['abcdefgh', 'ijklmnop']);
	const second = lattice(['jklmnop', 'rstuvwx']);
	const hit = overlapOf(first, second);
	assert.ok(hit);
	assert.equal(hit.shift, 1);
});

test('one slot under the pointer does not hide a shared row', () => {
	const first = lattice(['abcdefgh', 'ijklmnop']);
	const second = lattice(['ijkZmnop', 'qrstuvwx']);
	assert.equal(overlapOf(first, second).rows, 1);
});

test('shots of different storages share nothing', () => {
	const shared = sharedRows([lattice(['abcdefgh', 'ijklmnop']), lattice(['qrstuvwx', 'yzABCDEF'])]);
	assert.equal(shared[0].size + shared[1].size, 0);
});
