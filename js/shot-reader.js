// The engine behind the sailor import: pixels in, words out.
//
// It all happens here, in the page. Tesseract is vendored under
// /reader (see reader/README.md) and served from this origin, so a
// screenshot is never uploaded, never written to a disk that is not the
// player's own, and there is nothing on any server to delete afterwards
// -- which is also why the limits below are the only ones needed.
//
// A screenshot is read twice. The first pass is cheap and only has to
// find the panel: the whole image, shrunk to something the engine can
// scan quickly, gives word boxes that sailor-shot.js turns into a
// rectangle. The second pass reads that rectangle alone, blown up to
// the size the engine likes -- which is what makes a 1080p Manage
// Sailors window as legible as a cropped panel, and keeps the sea, the
// chat log and the quest list out of the words entirely.
//
// What a screenshot cannot do is run: it is decoded by the browser's
// own image decoders, handed on as pixels, and the engine that reads
// those pixels is WebAssembly in a worker with no network of its own.

import { panelBox, sailorFrom } from './sailor-shot.js';

/** Where the vendored engine lives. Versioned: see reader/README.md. */
const LIB = '/reader/tesseract-7.0.0.esm.min.js';
const WORKER = '/reader/tesseract-worker-7.0.0.min.js';
const CORE = '/reader/tesseract-core-6.0.0-simd-lstm.wasm.js';
const TESSDATA = '/reader/tessdata';

/**
 * What one go will take on.
 *
 * Twenty at a time because that is the roster a hull can hold and a
 * player screenshots a window at a time; the rest are what a browser
 * tab can decode without falling over. Nothing here protects a server
 * -- there is no server in this -- they are there so a mistaken drop of
 * a photo album fails politely instead of locking the page up.
 */
export const LIMITS = {
	files: 20,
	bytes: 12 * 1024 * 1024,
	total: 96 * 1024 * 1024,
	pixels: 40e6            // a 40 megapixel image is not a screenshot
};

/** The first bytes of the three formats a screenshot ever is. */
const MAGIC = [
	{ type: 'png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
	{ type: 'jpeg', bytes: [0xFF, 0xD8, 0xFF] },
	{ type: 'webp', bytes: [0x52, 0x49, 0x46, 0x46], at8: [0x57, 0x45, 0x42, 0x50] }
];

/**
 * What this file really is, read from the file itself.
 *
 * The name and the type a browser reports both come from the machine
 * the file came off, so neither is evidence. These twelve bytes are.
 */
export async function sniff(file) {
	const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
	for (const m of MAGIC) {
		if (m.bytes.some((b, i) => head[i] !== b)) continue;
		if (m.at8 && m.at8.some((b, i) => head[8 + i] !== b)) continue;
		return m.type;
	}
	return null;
}

/**
 * Sort a drop into what will be read and what will not, with a reason
 * for everything left out. Nothing is decoded here -- this is the pass
 * that happens before any of it is opened.
 */
export async function triage(files) {
	const take = [], skipped = [];
	let total = 0;
	for (const file of files) {
		if (take.length >= LIMITS.files) { skipped.push({ file, why: `more than ${LIMITS.files} at once` }); continue; }
		if (file.size > LIMITS.bytes) { skipped.push({ file, why: `bigger than ${Math.round(LIMITS.bytes / 1024 / 1024)} MB` }); continue; }
		if (total + file.size > LIMITS.total) { skipped.push({ file, why: 'the batch is already full' }); continue; }
		const kind = await sniff(file).catch(() => null);
		if (!kind) { skipped.push({ file, why: 'not a PNG, JPEG or WebP' }); continue; }
		total += file.size;
		take.push(file);
	}
	return { take, skipped };
}

/* ------------------------------------------------------------------ *
 * the engine
 * ------------------------------------------------------------------ */

let engine = null;

/**
 * The engine, started once and kept: six megabytes of it arrive the
 * first time a player asks to read a screenshot and never on an
 * ordinary load, and the service worker keeps them across deploys.
 */
async function open(onProgress) {
	if (engine) return engine;
	engine = (async () => {
		const say = onProgress || (() => {});
		say({ stage: 'engine', text: 'fetching the reader' });
		const { default: Tesseract } = await import(LIB);
		const worker = await Tesseract.createWorker('eng', 1, {
			workerPath: WORKER,
			workerBlobURL: false,   // a blob: worker is not 'self', and this page's policy says 'self'
			corePath: CORE,
			langPath: TESSDATA,
			gzip: true,
			legacyCore: false,
			legacyLang: false,
			logger: m => say({ stage: 'engine', text: m.status, at: m.progress })
		});
		return { Tesseract, worker };
	})().catch(err => { engine = null; throw err; });
	return engine;
}

/** Let the engine and its six megabytes go. */
export async function close() {
	const e = engine;
	engine = null;
	if (e) {
		try { (await e).worker.terminate(); } catch { /* already gone */ }
	}
}

/* ------------------------------------------------------------------ *
 * the pixels
 * ------------------------------------------------------------------ */

/**
 * The game's own contrast, turned round.
 *
 * A sailor panel is pale text on a dark, half-transparent ground, and
 * the engine was trained on ink on paper. So: grey, stretched to use
 * the whole range whatever the sea behind it was doing, then inverted.
 * The scale is the other half of it -- the engine wants a line about
 * forty pixels tall, and a screenshot of a 1080p window gives it
 * thirteen.
 */
function paint(bitmap, { crop = null, scale = 1 } = {}) {
	const sx = crop ? crop.x : 0, sy = crop ? crop.y : 0;
	const sw = crop ? crop.w : bitmap.width, sh = crop ? crop.h : bitmap.height;
	const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	// A dark ground under it, so a screenshot saved with transparency
	// reads the way it looked in the game rather than as a white sheet.
	ctx.fillStyle = '#000';
	ctx.fillRect(0, 0, w, h);
	ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);

	const img = ctx.getImageData(0, 0, w, h);
	const px = img.data;
	let lo = 255, hi = 0;
	for (let i = 0; i < px.length; i += 4) {
		// Rec. 709 luma: the panel's text is white and its ground blue,
		// and weighting the channels keeps that distance.
		const g = (px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722) | 0;
		px[i] = g;
		if (g < lo) lo = g;
		if (g > hi) hi = g;
	}
	const span = Math.max(1, hi - lo);
	for (let i = 0; i < px.length; i += 4) {
		const v = 255 - Math.min(255, Math.max(0, ((px[i] - lo) * 255) / span));
		px[i] = px[i + 1] = px[i + 2] = v;
		px[i + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	return canvas;
}

/** Every word the engine found, as sailor-shot.js wants them. */
async function scan(worker, canvas, psm) {
	await worker.setParameters({ tessedit_pageseg_mode: psm });
	const { data } = await worker.recognize(canvas, {}, { blocks: true });
	const out = [];
	for (const block of data.blocks || []) {
		for (const par of block.paragraphs || []) {
			for (const line of par.lines || []) {
				for (const w of line.words || []) {
					out.push({ text: w.text, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1, conf: w.confidence });
				}
			}
		}
	}
	return out;
}

/** How big a first pass may be: enough to find labels, cheap to scan. */
const PROBE = 1400;
/** The line height the engine reads best at. */
const WANT_LINE = 40;

/**
 * One screenshot, read.
 *
 * Returns the sailor, or `{ sailor: null, why }` when the shot has no
 * sailor panel in it -- which is the answer for a screenshot of the sea
 * and should not read as a failure.
 */
async function readOne(worker, PSM, file) {
	let bitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return { sailor: null, why: 'could not be opened as an image' };
	}
	try {
		if (bitmap.width * bitmap.height > LIMITS.pixels) return { sailor: null, why: 'far too large to be a screenshot' };
		const probeScale = Math.min(1, PROBE / Math.max(bitmap.width, bitmap.height));
		const found = panelBox(await scan(worker, paint(bitmap, { scale: probeScale }), PSM.SPARSE_TEXT), {
			width: bitmap.width * probeScale,
			height: bitmap.height * probeScale
		});
		if (!found) return { sailor: null, why: 'no sailor panel in it' };
		const crop = {
			x: Math.max(0, Math.floor(found.x0 / probeScale)),
			y: Math.max(0, Math.floor(found.y0 / probeScale)),
			w: Math.ceil((found.x1 - found.x0) / probeScale),
			h: Math.ceil((found.y1 - found.y0) / probeScale)
		};
		crop.w = Math.min(crop.w, bitmap.width - crop.x);
		crop.h = Math.min(crop.h, bitmap.height - crop.y);
		const scale = Math.max(1, Math.min(3, WANT_LINE / (found.lineH / probeScale)));
		const sailor = sailorFrom(await scan(worker, paint(bitmap, { crop, scale }), PSM.SINGLE_BLOCK));
		return sailor ? { sailor } : { sailor: null, why: 'the panel could not be read' };
	} finally {
		bitmap.close();
	}
}

/**
 * Read a drop of screenshots, one after another.
 *
 * One at a time on purpose: the engine is a single worker, and a player
 * watching twenty shots go by wants to see which one is being read, not
 * a frozen page. `onProgress` is called with the file being read and
 * how far along the batch is; `signal` stops it between shots.
 */
export async function readShots(files, { onProgress = () => {}, signal = null } = {}) {
	const { worker, Tesseract } = await open(onProgress);
	const out = [];
	for (let i = 0; i < files.length; i++) {
		if (signal && signal.aborted) break;
		const file = files[i];
		onProgress({ stage: 'reading', at: i / files.length, i, n: files.length, name: file.name });
		let res;
		try {
			res = await readOne(worker, Tesseract.PSM, file);
		} catch (err) {
			res = { sailor: null, why: err && err.message ? err.message : 'could not be read' };
		}
		out.push({ file: file.name, ...res });
	}
	onProgress({ stage: 'done', at: 1, n: files.length });
	return out;
}
