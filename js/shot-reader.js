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
import { localeFor, DEFAULT_LANG } from './sailor-locales.js';
import { iconLoader } from './icon-loader.js';
import { grayscale, settleGrid, readSlots, bankEntry, countBox, readCounts, isHeld, sharedRows } from './storage-shot.js';

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
 *
 * Which letters it can make out is the model's, not the engine's, so a
 * language is part of what is kept: the Latin services all read on the
 * English model that comes with the rest, and Cyrillic, Thai and the
 * three CJK scripts each fetch a megabyte or two more the first time
 * they are asked for. Changing language lets the old one go -- a
 * player reads a batch in one language, not two.
 */
async function open(tess, onProgress) {
	if (engine && engine.tess === tess) return engine.ready;
	if (engine) await close();
	const ready = (async () => {
		const say = onProgress || (() => {});
		say({ stage: 'engine', text: 'fetching the reader' });
		const { default: Tesseract } = await import(LIB);
		const worker = await Tesseract.createWorker(tess, 1, {
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
	engine = { tess, ready };
	return ready;
}

/** Let the engine and its six megabytes go. */
export async function close() {
	const e = engine;
	engine = null;
	if (e) {
		try { (await e.ready).worker.terminate(); } catch { /* already gone */ }
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

/**
 * How big a first pass may be: enough to find the panel, cheap to scan.
 *
 * An alphabet is legible at a tenth of the pixels a Han character needs
 * -- 食物消耗量 at 1400 across a 1080p window comes back as anything at
 * all -- so a dense script is given half again as much to work with.
 * Small screenshots are blown up to meet it rather than only shrunk
 * down: a phone's crop of the sailor panel is 375 pixels wide, and the
 * probe that finds nothing in it finds everything at three times the
 * size.
 */
const PROBE = { alphabet: 1400, dense: 2200 };
const MAX_UP = 3;
/** The line height the engine reads best at. */
const WANT_LINE = 40;

/**
 * One screenshot, read.
 *
 * Returns the sailor, or `{ sailor: null, why }` when the shot has no
 * sailor panel in it -- which is the answer for a screenshot of the sea
 * and should not read as a failure.
 */
async function readOne(worker, PSM, file, locale) {
	let bitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return { sailor: null, why: 'could not be opened as an image' };
	}
	try {
		if (bitmap.width * bitmap.height > LIMITS.pixels) return { sailor: null, why: 'far too large to be a screenshot' };
		const probe = PROBE[locale.dense ? 'dense' : 'alphabet'];
		const probeScale = Math.min(MAX_UP, probe / Math.max(bitmap.width, bitmap.height));
		const found = panelBox(await scan(worker, paint(bitmap, { scale: probeScale }), PSM.SPARSE_TEXT), {
			width: bitmap.width * probeScale,
			height: bitmap.height * probeScale,
			locale
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
		const sailor = sailorFrom(await scan(worker, paint(bitmap, { crop, scale }), PSM.SINGLE_BLOCK), locale);
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
export async function readShots(files, { onProgress = () => {}, signal = null, lang = DEFAULT_LANG } = {}) {
	const locale = localeFor(lang);
	const { worker, Tesseract } = await open(locale.tess, onProgress);
	const out = [];
	for (let i = 0; i < files.length; i++) {
		if (signal && signal.aborted) break;
		const file = files[i];
		onProgress({ stage: 'reading', at: i / files.length, i, n: files.length, name: file.name });
		let res;
		try {
			res = await readOne(worker, Tesseract.PSM, file, locale);
		} catch (err) {
			res = { sailor: null, why: err && err.message ? err.message : 'could not be read' };
		}
		out.push({ file: file.name, ...res });
	}
	onProgress({ stage: 'done', at: 1, n: files.length });
	return out;
}

/* ------------------------------------------------------------------ *
 * a window that is only words
 * ------------------------------------------------------------------ */

/** How wide a shot of a list is blown up to before it is read. The
 *  barter window's item names are twelve pixels tall at 1080p and the
 *  engine wants forty, but a whole screen at three times the size is
 *  six thousand pixels across and a minute of reading -- so: twice,
 *  and never past what a screenshot of one window needs. */
const LIST_WIDE = 2200;

/**
 * Every word in a screenshot, as the engine read them.
 *
 * The sailor reader finds its panel first because a sailor's numbers
 * are worthless without knowing which sailor they belong to. A list of
 * barter offers is the opposite: the rows are the same shape wherever
 * the window sits, and what matters is which island each row names. So
 * this one reads the whole picture and leaves the sorting to
 * barter-shot.js.
 */
export async function readWords(file, { lang = DEFAULT_LANG, wide = LIST_WIDE } = {}) {
	const locale = localeFor(lang);
	const { worker, Tesseract } = await open(locale.tess, () => {});
	const bitmap = await createImageBitmap(file);
	try {
		if (bitmap.width * bitmap.height > LIMITS.pixels) return { words: [], width: 0, height: 0, why: 'far too large to be a screenshot' };
		const scale = Math.max(1, Math.min(3, wide / bitmap.width));
		const words = await scan(worker, paint(bitmap, { scale }), Tesseract.PSM.SPARSE_TEXT);
		return { words, width: bitmap.width * scale, height: bitmap.height * scale, scale };
	} finally {
		bitmap.close();
	}
}

/* ------------------------------------------------------------------ *
 * the storage window
 * ------------------------------------------------------------------ */

/**
 * Every icon the app knows, described so a slot can be compared
 * against it. Built once a session and kept: it is five hundred
 * pictures of 44 pixels, which is a second of work and two megabytes
 * of numbers, and the browser has the pictures cached already -- the
 * app draws them on every tab.
 *
 * Icons drawn once and worn by several items are one entry with
 * several names: the reader cannot tell a Maple Plywood from an Ash
 * Plywood, because the game does not draw them differently, and
 * pretending otherwise would be worse than asking.
 */
let bank = null;

/** The size the bank is described at -- the icons' own. */
const ICON_SIDE = 44;

export async function iconBank(onProgress = () => {}) {
	if (bank) return bank;
	await iconLoader.init();
	const byFile = new Map();
	for (const [name, entry] of Object.entries(iconLoader.iconMapping)) {
		const file = typeof entry === 'string' ? entry : entry && entry.icon;
		if (!file) continue;
		if (!byFile.has(file)) byFile.set(file, []);
		byFile.get(file).push(name);
	}
	const files = [...byFile.keys()];
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = ICON_SIDE;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	const out = [];
	let done = 0;
	// A dozen at a time: the browser will happily open five hundred
	// connections and then take longer over all of them.
	const queue = [...files];
	const work = async () => {
		for (let file = queue.shift(); file; file = queue.shift()) {
			try {
				const res = await fetch(`./icons/${file}`);
				if (!res.ok) continue;
				const bitmap = await createImageBitmap(await res.blob());
				ctx.clearRect(0, 0, ICON_SIDE, ICON_SIDE);
				ctx.drawImage(bitmap, 0, 0, ICON_SIDE, ICON_SIDE);
				bitmap.close();
				const px = ctx.getImageData(0, 0, ICON_SIDE, ICON_SIDE).data;
				const names = byFile.get(file);
				out.push({ ...bankEntry(names[0], px, ICON_SIDE, ICON_SIDE), file, names });
			} catch { /* an icon that will not load is one the reader cannot name */ }
			done++;
			if (done % 25 === 0) onProgress({ stage: 'bank', at: done / files.length, text: 'learning the icons' });
		}
	};
	await Promise.all(Array.from({ length: 12 }, work));
	bank = out;
	return bank;
}

/** Let the bank go with the engine: both are kept for a dialog, not
 *  for a session of sailing. */
export function forgetBank() {
	bank = null;
}

/** A screenshot as pixels, with nothing done to it -- and the canvas
 *  they are still on, which is what the counts are cropped out of. */
function pixelsOf(bitmap) {
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true });
	ctx.drawImage(bitmap, 0, 0);
	return { canvas, image: ctx.getImageData(0, 0, bitmap.width, bitmap.height) };
}

/**
 * One storage screenshot, read: what is in it and how many of each.
 *
 * A slot the reader could not name is not an error and not an empty
 * slot -- a storage is full of things this app has no business
 * knowing -- so it is counted and reported as a number, not as a row.
 */
async function readStorageOne(file, icons) {
	let bitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return { rows: [], why: 'could not be opened as an image' };
	}
	try {
		if (bitmap.width * bitmap.height > LIMITS.pixels) return { rows: [], why: 'far too large to be a screenshot' };
		const sheet = pixelsOf(bitmap);
		const image = sheet.image;
		const gray = grayscale(image.data, image.width, image.height);
		const settled = settleGrid(image.data, image.width, image.height, gray, icons);
		if (!settled) return { rows: [], why: 'no storage grid in it' };
		const { grid, cal } = settled;
		// A lattice the icons did not believe: read anyway -- a storage
		// of three things is a storage -- but nothing in it is sure.
		const shaky = Boolean(settled.doubtful);
		const slots = readSlots(image.data, image.width, image.height, grid, icons, cal);
		const named = slots.filter(s => s.name);
		if (!named.length) return { rows: [], why: 'nothing in it was an icon the app knows' };
		// The counts, read off the pixels by the small network in
		// count-net.js. No engine is fetched for this: see there for
		// why neither the OCR one nor a set of templates was the right
		// tool for eight-pixel writing over a gold bar.
		const counts = readCounts(image.data, image.width, image.height, grid, named);
		// The corner of a slot as a picture, so the table can show a
		// player what was read instead of asking them to take its word.
		const corner = at => {
			const box = countBox(at);
			const cut = document.createElement('canvas');
			cut.width = Math.max(1, Math.round(box.w * 2));
			cut.height = Math.max(1, Math.round(box.h * 2));
			const ctx = cut.getContext('2d');
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(sheet.canvas, box.x, box.y, box.w, box.h, 0, 0, cut.width, cut.height);
			return cut.toDataURL('image/png');
		};
		const rows = named.map(s => {
			const entry = icons.find(e => e.name === s.name);
			// Three answers, and the table shows them differently. A slot
			// with a figure on it that read: the count. A slot with
			// nothing written on it: one, and sure of it -- that is how
			// the game draws a single item. A reading the network was
			// not sure of: its best guess, marked, with the corner of
			// the slot beside it to check against and type over.
			const said = counts.get(s);
			return {
				item: s.name,
				alsoCalled: entry && entry.names.length > 1 ? entry.names : null,
				qty: said ? said.count : 1,
				sure: !shaky && (!said || !said.doubt),
				score: s.score,
				row: s.row,
				col: s.col,
				// every slot's corner, not only the doubtful ones: a count is
				// checked at a glance against the picture it was read off
				corner: corner(s.at)
			};
		});
		return { rows, unknown: slots.filter(s => isHeld(s) && !s.name).length, slots: slots.length, lattice: slots, shaky };
	} finally {
		bitmap.close();
	}
}

/**
 * A drop of storage screenshots, read one after another.
 *
 * The same shape readShots has, minus the engine: a storage is read off
 * its own pixels from end to end, so nothing here fetches the six
 * megabytes of reader that a sailor panel needs. The bank of icons is
 * built first, which is where the second of waiting is.
 */
export async function readStorageShots(files, { onProgress = () => {}, signal = null } = {}) {
	const icons = await iconBank(onProgress);
	const out = [];
	for (let i = 0; i < files.length; i++) {
		if (signal && signal.aborted) break;
		const file = files[i];
		onProgress({ stage: 'reading', at: i / files.length, i, n: files.length, name: file.name });
		let res;
		try {
			res = await readStorageOne(file, icons);
		} catch (err) {
			res = { rows: [], why: err && err.message ? err.message : 'could not be read' };
		}
		out.push({ file: file.name, ...res });
	}
	// Shots of one storage overlap: scroll, shoot again, and the last row
	// of one is the first row of the next. Those rows are one row, and
	// are taken from the shot that came first.
	const shared = sharedRows(out.map(o => o.lattice || []));
	for (let i = 0; i < out.length; i++) {
		const twice = shared[i];
		if (twice.size) {
			out[i].rows = out[i].rows.filter(r => !twice.has(r.row));
			out[i].sharedRows = twice.size;
		}
		delete out[i].lattice;
	}
	onProgress({ stage: 'done', at: 1, n: files.length });
	return out;
}
