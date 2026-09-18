// The small network that reads the number written on a storage slot.
//
// It replaced a reader made of templates, and the reason is worth
// keeping. The templates were the game's own figures, cut out of
// screenshots, and a slot was read by laying them over its corner and
// taking the ones that fitted. That works on the screenshot the figures
// were cut from. It does not work on the same window captured by a
// desktop that scales its screen by five quarters, or saved as a JPEG,
// or drawn at another UI size -- each of those is a different rendering
// of the same eight-pixel writing, and a template is one rendering. A
// stack of 103 over a crate came back as 1103, because the edge of the
// crate really is an upright and really does correlate with a one.
//
// What reads writing that small and that varied is what reads house
// numbers off street photographs: a convolutional network run across
// the whole line, trained with CTC so that nothing has to say where one
// figure stops and the next begins. It was taught on a third of a
// million made-up slots -- the game's own font, pulled out of the
// client, written over the game's own icons, then blurred, rescaled and
// recompressed every way a screenshot gets -- and on no real ones, so
// that the real ones could be the test: 369 slots off four screenshots,
// all read, none wrong. It is fifty thousand weights, runs in about ten
// milliseconds a slot in plain JavaScript, and fetches nothing.
//
// This file is the arithmetic only: convolution, pooling, the decoding.
// The weights are in count_model.js, which tools/count-reader writes;
// nothing here knows what they mean.

/** Weights as they are stored -- a byte each, a scale a channel -- back
 *  to the floats the arithmetic wants. Done once, on first use. */
function thaw(layer) {
	if (layer.kind !== 'conv' || layer.weights) return layer;
	const raw = Uint8Array.from(atob(layer.w), c => c.charCodeAt(0));
	const per = layer.cin * layer.kh * layer.kw;
	const weights = new Float32Array(raw.length);
	for (let o = 0; o < layer.cout; o++) {
		const scale = layer.scale[o];
		for (let i = 0; i < per; i++) weights[o * per + i] = ((raw[o * per + i] << 24) >> 24) * scale;
	}
	layer.weights = weights;
	layer.bias = Float32Array.from(layer.b);
	return layer;
}

/**
 * One convolution, stride one, zeros past the edge, planes first.
 *
 * The input is copied once into a frame of zeros, so the loops inside
 * never ask where the edge is; and a three-by-three kernel -- which is
 * all but two of them -- takes its nine taps a pixel in one statement,
 * which is most of what makes this a few milliseconds and not forty.
 */
function conv(x, h, w, L) {
	const { cin, cout, kh, kw, ph, pw, weights, bias } = L;
	const fh = h + 2 * ph, fw = w + 2 * pw;
	const oh = fh - kh + 1, ow = fw - kw + 1;
	let framed = x;
	if (ph || pw) {
		framed = new Float32Array(cin * fh * fw);
		for (let c = 0; c < cin; c++) {
			for (let y = 0; y < h; y++) framed.set(x.subarray(c * h * w + y * w, c * h * w + (y + 1) * w), c * fh * fw + (y + ph) * fw + pw);
		}
	}
	const out = new Float32Array(cout * oh * ow);
	for (let o = 0; o < cout; o++) {
		const dst = o * oh * ow;
		out.fill(bias[o], dst, dst + oh * ow);
		for (let c = 0; c < cin; c++) {
			const src = c * fh * fw;
			const k = (o * cin + c) * kh * kw;
			if (kh === 3 && kw === 3) {
				const a0 = weights[k], a1 = weights[k + 1], a2 = weights[k + 2];
				const b0 = weights[k + 3], b1 = weights[k + 4], b2 = weights[k + 5];
				const c0 = weights[k + 6], c1 = weights[k + 7], c2 = weights[k + 8];
				for (let y = 0; y < oh; y++) {
					let d = dst + y * ow, r0 = src + y * fw, r1 = r0 + fw, r2 = r1 + fw;
					for (let n = ow; n > 0; n--, d++, r0++, r1++, r2++) {
						out[d] += a0 * framed[r0] + a1 * framed[r0 + 1] + a2 * framed[r0 + 2]
							+ b0 * framed[r1] + b1 * framed[r1 + 1] + b2 * framed[r1 + 2]
							+ c0 * framed[r2] + c1 * framed[r2 + 1] + c2 * framed[r2 + 2];
					}
				}
				continue;
			}
			for (let ky = 0; ky < kh; ky++) {
				for (let kx = 0; kx < kw; kx++) {
					const kk = weights[k + ky * kw + kx];
					for (let y = 0; y < oh; y++) {
						let d = dst + y * ow, s = src + (y + ky) * fw + kx;
						for (let n = ow; n > 0; n--) out[d++] += kk * framed[s++];
					}
				}
			}
		}
	}
	if (L.relu) for (let i = 0; i < out.length; i++) if (out[i] < 0) out[i] = 0;
	return { x: out, c: cout, h: oh, w: ow };
}

/** The largest of each block. */
function pool(x, c, h, w, ph, pw) {
	const oh = Math.floor(h / ph), ow = Math.floor(w / pw);
	const out = new Float32Array(c * oh * ow);
	for (let p = 0; p < c; p++) {
		for (let y = 0; y < oh; y++) {
			for (let i = 0; i < ow; i++) {
				let m = -Infinity;
				for (let v = 0; v < ph; v++) {
					for (let u = 0; u < pw; u++) {
						const s = x[p * h * w + (y * ph + v) * w + i * pw + u];
						if (s > m) m = s;
					}
				}
				out[p * oh * ow + y * ow + i] = m;
			}
		}
	}
	return { x: out, c, h: oh, w: ow };
}

/**
 * A patch through the network: what comes out is one row of scores a
 * step along the line, eleven to a step -- nothing, then nought to nine.
 */
export function runNet(model, patch, h, w) {
	let at = { x: patch, c: 3, h, w };
	for (const layer of model.layers) {
		at = layer.kind === 'conv' ? conv(at.x, at.h, at.w, thaw(layer)) : pool(at.x, at.c, at.h, at.w, layer.ph, layer.pw);
	}
	return { scores: at.x, classes: at.c, steps: at.w * at.h };
}

/**
 * The scores, read as a number, and how likely that number is.
 *
 * At each step the likeliest of the eleven is taken; a figure is
 * written down when it changes, and "nothing" between two of the same
 * is what makes 11 two ones.
 *
 * How sure the reading is, is not how sure any one step was. A step on
 * the boundary between a figure and the gap after it is rightly of two
 * minds, and says nothing against the figure. What is asked instead is
 * the question the network was trained to answer: of every way these
 * thirty-two steps could be read, what share of the probability belongs
 * to the ways that spell this number -- the forward pass of CTC, run
 * for the one string that was read.
 */
export function decodeCount({ scores, classes, steps }) {
	const probs = new Float64Array(steps * classes);
	const label = [];
	let last = 0;
	for (let t = 0; t < steps; t++) {
		let top = 0, best = -Infinity, sum = 0;
		for (let k = 0; k < classes; k++) if (scores[k * steps + t] > best) { best = scores[k * steps + t]; top = k; }
		for (let k = 0; k < classes; k++) sum += Math.exp(scores[k * steps + t] - best);
		for (let k = 0; k < classes; k++) probs[t * classes + k] = Math.exp(scores[k * steps + t] - best) / sum;
		if (top !== last && top !== 0) label.push(top);
		last = top;
	}
	// the string with a "nothing" before, between and after its figures
	const ext = [0];
	for (const k of label) ext.push(k, 0);
	let alpha = new Float64Array(ext.length);
	alpha[0] = probs[0];
	if (ext.length > 1) alpha[1] = probs[ext[1]];
	for (let t = 1; t < steps; t++) {
		const next = new Float64Array(ext.length);
		for (let i = 0; i < ext.length; i++) {
			let a = alpha[i];
			if (i > 0) a += alpha[i - 1];
			// a figure may follow the one before it directly, unless
			// they are the same figure -- then the gap is not optional
			if (i > 1 && ext[i] !== 0 && ext[i] !== ext[i - 2]) a += alpha[i - 2];
			next[i] = a * probs[t * classes + ext[i]];
		}
		alpha = next;
	}
	const sure = alpha[ext.length - 1] + (ext.length > 1 ? alpha[ext.length - 2] : 0);
	return { text: label.map(k => String(k - 1)).join(''), sure: Math.min(1, sure) };
}
