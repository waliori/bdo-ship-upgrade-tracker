// The network that reads the number on a storage slot.
//
// Two kinds of check, and they are kept apart. The arithmetic -- a
// convolution, a pooling, the decoding of a row of scores into a number
// -- is checked on models and scores made up here, small enough to work
// out by hand. What the network has *learnt* cannot be checked that way,
// so for that there are a dozen real slots in fixtures/count-slots.json:
// the lower halves of slots from two screenshots of a storage, one
// captured off a desktop that scales its screen and one saved by the
// game as a JPEG, sixty-four pixels by thirty-two each. They are there
// because they are the ones the reader before this one got wrong --
// 103 over a crate came back as 1103 and 70 over a scroll as 711 -- and
// the network was never shown them: it was taught on made-up slots
// only, which is what makes these a test and not a memory.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runNet, decodeCount } from '../js/count-net.js';
import { COUNT_MODEL } from '../js/count_model.js';
import { readCount, readCounts, PATCH_W, PATCH_H, SURE } from '../js/storage-shot.js';

const FIX = JSON.parse(readFileSync(new URL('./fixtures/count-slots.json', import.meta.url), 'utf8'));
const planes = b64 => Float32Array.from(Buffer.from(b64, 'base64'), v => v / 255);

/* ------------------------------------------------------------------ *
 * the arithmetic
 * ------------------------------------------------------------------ */

/** A layer as count_model.js stores one: a byte a weight, a scale a channel. */
function layer(cin, cout, kh, kw, ph, pw, weights, bias, relu = false) {
	const per = cin * kh * kw;
	const scale = [], bytes = new Int8Array(weights.length);
	for (let o = 0; o < cout; o++) {
		let top = 1e-8;
		for (let i = 0; i < per; i++) top = Math.max(top, Math.abs(weights[o * per + i]));
		scale.push(top / 127);
		for (let i = 0; i < per; i++) bytes[o * per + i] = Math.round(weights[o * per + i] / scale[o]);
	}
	return { kind: 'conv', cin, cout, kh, kw, ph, pw, relu, scale, b: bias, w: Buffer.from(bytes.buffer).toString('base64') };
}

test('a convolution sums what is under the kernel, and nothing past the edge', () => {
	// a kernel of ones over the first plane: every pixel becomes the
	// sum of its neighbourhood, and the other two planes are not asked
	const three = { layers: [layer(3, 1, 3, 3, 1, 1, [...new Array(9).fill(1), ...new Array(18).fill(0)], [0.5])] };
	const x = new Float32Array(3 * 4 * 5);
	for (let i = 0; i < 20; i++) x[i] = 1;               // the first plane all ones, 4 by 5
	const out = runNet(three, x, 4, 5);
	assert.equal(out.classes, 1);
	assert.equal(out.steps, 20);
	assert.ok(Math.abs(out.scores[0] - 4.5) < 1e-3);     // a corner: four neighbours, and the bias
	assert.ok(Math.abs(out.scores[2] - 6.5) < 1e-3);     // an edge: six
	assert.ok(Math.abs(out.scores[7] - 9.5) < 1e-3);     // the middle: nine
});

test('a kernel that is not three by three is summed the same way', () => {
	const tall = { layers: [layer(3, 1, 2, 1, 0, 0, [1, 2, 0, 0, 0, 0], [0])] };
	const x = new Float32Array(3 * 2 * 3);
	x.set([1, 2, 3, 10, 20, 30]);                        // the first plane, two rows of three
	const out = runNet(tall, x, 2, 3);
	assert.deepEqual([...out.scores].map(Math.round), [21, 42, 63]);
});

test('what is below nought is nought after a layer that says so, and pooling keeps the largest', () => {
	const model = { layers: [layer(3, 1, 1, 1, 0, 0, [1, 0, 0], [0], true), { kind: 'pool', ph: 2, pw: 2 }] };
	const x = new Float32Array(3 * 2 * 4);
	x.set([-5, -1, 2, 3, -2, -7, 9, 1]);
	const out = runNet(model, x, 2, 4);
	assert.deepEqual([...out.scores], [0, 9]);
});

/** Scores for decodeCount: one column a step, the named class far ahead. */
function steps(sequence, { classes = 11, lead = 12 } = {}) {
	const scores = new Float32Array(classes * sequence.length);
	sequence.forEach((k, t) => { scores[k * sequence.length + t] = lead; });
	return { scores, classes, steps: sequence.length };
}

test('a figure is written once however many steps it lasts', () => {
	// class 0 is "nothing", class k+1 is the figure k
	assert.equal(decodeCount(steps([0, 0, 2, 2, 2, 0, 1, 1, 0])).text, '10');
});

test('eleven is two ones only when there is nothing between them', () => {
	assert.equal(decodeCount(steps([0, 2, 2, 2, 2, 0])).text, '1');
	assert.equal(decodeCount(steps([0, 2, 2, 0, 2, 0])).text, '11');
});

test('a row of nothing is a slot with no count on it', () => {
	const read = decodeCount(steps([0, 0, 0, 0, 0, 0]));
	assert.equal(read.text, '');
	assert.ok(read.sure > 0.99);
});

test('how sure a reading is, is the share of all readings that spell it', () => {
	// One step that cannot tell a 3 from an 8 halves it; a step unsure
	// only of where the figure ends does not touch it.
	const plain = decodeCount(steps([0, 4, 4, 0]));
	assert.ok(plain.sure > 0.99);
	const torn = steps([0, 4, 4, 0]);
	torn.scores[9 * 4 + 1] = 12; torn.scores[9 * 4 + 2] = 12;   // an 8 as likely as the 3, both steps
	assert.ok(decodeCount(torn).sure < 0.6);
	const soft = steps([0, 4, 4, 0]);
	soft.scores[0 * 4 + 2] = 12;                                 // the second step: the 3, or already the gap
	const read = decodeCount(soft);
	assert.equal(read.text, '3');
	assert.ok(read.sure > 0.99, `a soft edge cost ${read.sure}`);
});

/* ------------------------------------------------------------------ *
 * what it learnt
 * ------------------------------------------------------------------ */

test('real slots read as what is written on them', () => {
	for (const slot of FIX.slots) {
		const read = decodeCount(runNet(COUNT_MODEL, planes(slot.rgb), FIX.h, FIX.w));
		assert.equal(read.text, slot.says, `${slot.says || 'a blank slot'} from ${slot.from}`);
	}
});

test('103 over a crate is not 1103, and 70 over a scroll is not 711', () => {
	for (const says of ['103', '70']) {
		const slot = FIX.slots.find(s => s.says === says);
		const read = decodeCount(runNet(COUNT_MODEL, planes(slot.rgb), FIX.h, FIX.w));
		assert.equal(read.text, says);
		assert.ok(read.sure >= SURE, `${says} was read, but only ${read.sure.toFixed(2)} sure`);
	}
});

/** A screenshot with one slot in it: the patch laid where countPatch
 *  will cut it back out, pixel for pixel, at a pitch of sixty-four. */
function shotOf(slot) {
	const w = PATCH_W * 3, h = PATCH_W * 3;
	const rgba = new Uint8Array(w * h * 4).fill(255);
	const bytes = Buffer.from(slot.rgb, 'base64'), plane = PATCH_W * PATCH_H;
	for (let j = 0; j < PATCH_H; j++) {
		for (let i = 0; i < PATCH_W; i++) {
			const p = ((PATCH_W + PATCH_W / 2 + j) * w + PATCH_W + i) * 4;
			for (let k = 0; k < 3; k++) rgba[p + k] = bytes[k * plane + j * PATCH_W + i];
		}
	}
	return { rgba, w, h, cell: { cx: PATCH_W * 1.5, cy: PATCH_W * 1.5 } };
}

test('a count comes back as a number, and a slot with none as one of the thing', () => {
	const many = shotOf(FIX.slots.find(s => s.says === '58855'));
	const read = readCount(many.rgba, many.w, many.h, many.cell, PATCH_W);
	assert.equal(read.count, 58855);
	assert.ok(!read.blank);
	const none = shotOf(FIX.slots.find(s => s.says === ''));
	const one = readCount(none.rgba, none.w, none.h, none.cell, PATCH_W);
	assert.equal(one.count, 1);
	assert.equal(one.blank, true);
	assert.equal(one.doubt, false);
});

test('every slot handed over gets an answer, read in the square its icon was matched in', () => {
	const s = shotOf(FIX.slots.find(x => x.says === '2600'));
	// the lattice says one place, the calibration another: the second is where the slot is
	const slot = { row: 0, col: 0, cx: 10, cy: 10, at: { ...s.cell, side: 51 } };
	const counts = readCounts(s.rgba, s.w, s.h, { pitch: PATCH_W }, [slot]);
	assert.equal(counts.get(slot).count, 2600);
});

test('a reading that will not hold still is handed over as a doubt', () => {
	// noise has no number in it; whatever is said of it must not be said with a straight face
	let seed = 99;
	const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
	const w = PATCH_W * 3, h = PATCH_W * 3;
	const rgba = new Uint8Array(w * h * 4);
	for (let i = 0; i < rgba.length; i++) rgba[i] = next() < 0.5 ? 235 : 20;
	const read = readCount(rgba, w, h, { cx: PATCH_W * 1.5, cy: PATCH_W * 1.5 }, PATCH_W);
	assert.ok(read.blank || read.doubt, `noise was read as ${read.count}, ${read.score.toFixed(2)} sure`);
});
