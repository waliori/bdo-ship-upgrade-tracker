// Reading a sailor off a screenshot.
//
// The game will not tell anyone what is on their roster -- no file on
// disk carries it, and reading the client's memory is a banning -- so a
// screenshot is the only honest way in. Two windows show a sailor and
// both are worth taking:
//
//   * the Selected Sailor panel, usually cropped: a title in angle
//     brackets, "Lv.8 Polnis", the bars, then Appetite, Cabin Cost,
//     Weight and the growths;
//   * the whole Manage Sailors window at whatever the screen is: the
//     same facts in the right-hand pane, laid in two columns, with the
//     title missing and Condition spelt out.
//
// So nothing here counts pixels from a corner. Every value is found by
// its own label: the reader hands over words with boxes, and a fact is
// whatever number sits to the right of its name on the same line -- or
// half a line under it, which is where the panel puts Weight. That
// holds at any resolution, at any UI scale, cropped or whole, and it is
// why the same code reads both windows.
//
// Those labels are the client's own words, and the client's language
// menu lists sixteen (sailor-locales.js). Underneath them is something
// none of the sixteen change: the weight carries "LT", the condition
// is a pair over a slash, a growth is a figure with a per-cent sign,
// and the eight growths are laid out in the same order whatever they
// are called -- one column of eight in the panel, two columns six rows
// deep in the window. So the labels are read first and this shape
// second, and the second is what carries a language whose words we
// could not check.
//
// This module is pure: words in, a sailor out. The engine that produces
// the words lives in shot-reader.js, and nothing here needs it -- which
// is what lets the parsing be tested on fixtures.

import { pool, mateTypes, anyType, statBand } from './sailors.js';
import { localeFor, DEFAULT_LANG, GROWTH_KEYS, GRID_TWO_COL, GRID_ONE_COL } from './sailor-locales.js';

/** The English client, which is what a caller that names none gets. */
const EN = localeFor(DEFAULT_LANG);

/** The labels that anchor the panel: three of these and it is a sailor. */
const ANCHORS = ['appetite', 'weight', 'speed', 'condition', 'cabin'];

/** A script that sets no spaces between its words, and few letters. */
const DENSE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;

const clean = s => String(s || '').replace(/[^\p{L}\p{M}\p{N}_'’.,%/()+<>«»: -]/gu, '').replace(/\s+/g, ' ').trim();
const mid = w => ({ x: (w.x0 + w.x1) / 2, y: (w.y0 + w.y1) / 2 });

/**
 * How far apart two words on the same row may be, as a fraction of a
 * line. Half a line: the next row is a whole one away, and the slack
 * has to stop short of it -- at nine tenths a Russian sailor's
 * Awareness was read off the Strength on the row below.
 */
const NEAR = 0.55;

/** Levenshtein distance, capped -- a word is either close or it is not. */
export function editDistance(a, b, cap = 4) {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > cap) return cap + 1;
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let best = i;
		for (let j = 1; j <= b.length; j++) {
			row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
			if (row[j] < best) best = row[j];
		}
		if (best > cap) return cap + 1;
		prev = row;
	}
	return prev[b.length];
}

/* ------------------------------------------------------------------ *
 * the words a client prints
 * ------------------------------------------------------------------ */

/**
 * A language's labels, taken apart into what the reader needs.
 *
 * A label can be more than one word -- "Cabin Cost", "요구 선실",
 * "Требуется кают" -- and only the first of them anchors anything; the
 * rest have to be stepped over on the way to the value, which is why
 * they are kept apart rather than left in with the heads. Treating
 * "Cost" as a label of its own is what once stopped the reader before
 * it ever reached the number on the far side of it.
 */
function vocabOf(locale) {
	if (locale._vocab) return locale._vocab;
	const heads = [], tails = new Set(), whole = [];
	for (const [field, phrases] of Object.entries(locale.labels || {})) {
		for (const phrase of phrases) {
			const parts = String(phrase).split(/\s+/).filter(Boolean);
			if (!parts.length) continue;
			// A trait is one of the four the window prints beside a growth
			// and we do not model: named here only so a growth's value
			// stops before them.
			const at = field === 'traits' ? 'trait' : field;
			heads.push({ word: parts[0], field: at });
			for (const rest of parts.slice(1)) tails.add(letters(rest));
			whole.push({ key: letters(phrase), field: at });
		}
	}
	const vocab = { heads, tails, whole };
	Object.defineProperty(locale, '_vocab', { value: vocab, enumerable: false });
	return vocab;
}

const letters = s => clean(s).replace(/[^\p{L}\p{M}]/gu, '').toLowerCase();

/**
 * The field this word labels, if it labels one: OCR misses a letter
 * often enough that a label has to be recognised through one.
 *
 * How much slack there is depends on the script. An alphabet spells a
 * label out in eight or ten letters and can spare two of them; 건강 is
 * the whole of "Condition" in two, and one wrong is a different word.
 */
export function labelMatch(text, locale = EN) {
	const w = letters(text);
	const dense = DENSE.test(w);
	if (w.length < (dense ? 2 : 3)) return null;
	const cap = dense ? (w.length <= 2 ? 0 : 1) : (w.length <= 5 ? 1 : 2);
	let best = null, bestD = cap + 1;
	for (const { word, field } of vocabOf(locale).heads) {
		const d = editDistance(w, letters(word), cap);
		if (d < bestD) { bestD = d; best = field; }
	}
	return bestD <= cap ? { field: best, d: bestD } : null;
}

export function labelOf(text, locale = EN) {
	const hit = labelMatch(text, locale);
	return hit ? hit.field : null;
}

/** The second or third word of a label, which is not one on its own. */
const isTail = (text, locale) => vocabOf(locale).tails.has(letters(text));

/**
 * The label a run of words spells out, whole.
 *
 * A label is one word in English and four in Chinese -- and the scan
 * breaks a Chinese one up further still, handing back 食物 | 消耗 | 量
 * where the window printed one phrase. So a run of words with no figure
 * among them is glued back together and matched as a whole, from each
 * starting point in turn, because whatever the last value left behind
 * ("。", a bar's end) sits at the head of the run and is no part of it.
 */
function runLabel(run, locale) {
	if (!run.length || run.length > 6) return null;
	const said = run.map(w => letters(w.text));
	for (let i = 0; i < said.length; i++) {
		const key = said.slice(i).join('');
		if (!key) continue;
		const dense = DENSE.test(key);
		if (key.length < (dense ? 2 : 3)) continue;
		const cap = dense ? Math.min(2, Math.floor(key.length / 3)) : (key.length <= 5 ? 1 : 2);
		let best = null, bestD = cap + 1;
		for (const { key: label, field } of vocabOf(locale).whole) {
			const d = editDistance(key, label, cap);
			if (d < bestD) { bestD = d; best = field; }
		}
		if (bestD <= cap) return best;
	}
	return null;
}

/**
 * Every label on a line and the figure that follows it.
 *
 * The line is walked across: words with no figure in them pile up into
 * a run, and the first figure after that run is the run's value. It
 * reads both columns of the Manage Sailors window in one pass, it needs
 * no geometry beyond the line itself, and -- because the label is
 * matched whole -- it holds where the word-by-word reading gives up: a
 * label the scan broke into three, a two-word label in a language whose
 * second word we never listed.
 */
function lineFacts(lines, locale) {
	const out = {};
	const take = (field, value, line) => {
		if (field && field !== 'trait' && out[field] === undefined && value !== null) out[field] = { value, line };
	};
	for (const line of lines) {
		let run = [];
		for (const w of line.words) {
			const pcts = percentsIn(w.text);
			const v = pcts.length ? pcts[pcts.length - 1] : weightIn(w.text) ?? numberIn(w.text);
			if (v === null) {
				if (letters(w.text)) run.push(w);
				continue;
			}
			take(runLabel(run, locale), v, line);
			run = [];
		}
		// What is left at the end of a line carries no figure of its own:
		// the condition is written as a pair over a slash, which is no
		// kind of number, and its label is all that is left standing.
		const field = runLabel(run, locale);
		if (field && PAIR.test(line.text)) take(field, null, line);
		else if (field && out[field] === undefined) out[field] = { value: null, line };
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * the figures every client prints the same
 * ------------------------------------------------------------------ */

/** The number a token carries, ignoring the game's %, +, brackets and LT. */
function numberIn(text) {
	const m = /^[(+[]*([\d]{1,3}(?:[,.]\d+)*)\s*(?:%|LT|L?T)?[)\]]*$/i.exec(clean(text));
	if (!m) return null;
	// A comma is a thousands mark and a dot is a decimal point, which is
	// the one place the two windows agree with each other.
	const n = Number(m[1].replace(/,/g, ''));
	return Number.isFinite(n) ? n : null;
}

/**
 * The weight a token carries, if it is the one with "LT" on it.
 *
 * Every client writes it that way -- "300.0LT", "200.0L T" where the
 * scan split it -- and no other line in the panel ends in those two
 * letters. It is the surest thing in the window, and it is what tells
 * the reader where the panel is when it cannot read a word of it.
 */
export function weightIn(text) {
	const m = /(?:^|\s)(\d{2,4}(?:[.,]\d)?)\s*L\s*T\b/i.exec(clean(text));
	if (!m) return null;
	const n = Number(m[1].replace(',', '.'));
	return Number.isFinite(n) ? n : null;
}

/**
 * The weight a token carries when the "LT" beside it did not survive.
 *
 * A Korean or Russian model makes what it can of two Latin letters and
 * sometimes makes "1" of them -- "200.0LT" comes back "200.01". But a
 * figure written to exactly one decimal, with two characters at most
 * after it, is the weight and nothing else in this panel: a growth
 * carries a per-cent sign, the condition a slash, the appetite and the
 * cabin cost no point at all. Used only as a last resort, and only
 * where the growths have already vouched for the panel.
 */
function looseWeight(text) {
	const m = /^(\d{2,4})[.,](\d)(?:\s*\S{1,2})?$/.exec(clean(text));
	if (!m) return null;
	const n = Number(m[1]) + Number(m[2]) / 10;
	return Number.isFinite(n) ? n : null;
}

/**
 * Every percentage in a token, in order.
 *
 * The game prints a growth to one decimal, always -- so a figure that
 * comes back without a decimal point lost it to the scan rather than to
 * the game, and "35%" is three and a half, not thirty-five. It also
 * writes an applied growth as "(+3.9%) 3.9%", which the reader
 * sometimes hands over as one word, so a token can hold two.
 */
export function percentsIn(text) {
	const out = [];
	for (const m of clean(text).matchAll(/(\d{1,3})(?:[.,](\d))?\s*%/g)) {
		out.push(m[2] === undefined ? Number(m[1]) / 10 : Number(m[1]) + Number(m[2]) / 10);
	}
	return out;
}

/** The pair over a slash the condition is written as, anywhere in a line. */
const PAIR = /(\d{1,4})\s*[/|]\s*(\d{1,4})/;

/**
 * The line height the panel is set in, from the words themselves.
 *
 * Everything geometric here is measured in these, so a 4K screenshot
 * and a cropped panel read the same. A word box is about the cap
 * height and the line the panel sets is nearer twice that -- but only
 * for an alphabet: 건강 and 韌性 fill a box as tall as it is wide, and a
 * line height guessed from those runs one row of a Korean panel into
 * the next, which is how a Chinese sailor's Endurance came back as the
 * Wits underneath it.
 *
 * So the rows are measured instead, where there are enough of them to
 * measure: the middling distance from one to the next is the line, and
 * the guess from the glyphs only says how far that is allowed to be
 * out.
 */
export function lineHeight(words) {
	const hs = words.map(w => w.y1 - w.y0).filter(h => h > 2).sort((a, b) => a - b);
	if (!hs.length) return 0;
	const byGlyph = hs[Math.floor(hs.length / 2)] * 1.9;
	const rows = [];
	for (const w of [...words].sort((a, b) => mid(a).y - mid(b).y)) {
		const row = rows[rows.length - 1];
		const y = mid(w).y;
		if (row && Math.abs(y - row.y) <= byGlyph * 0.35) { row.n++; row.y += (y - row.y) / row.n; }
		else rows.push({ y, n: 1 });
	}
	// A gap of three lines is the space the panel leaves above the
	// cannon growths, not a line; a gap of a third of one is two halves
	// of a row the clustering did not quite join.
	const gaps = [];
	for (let i = 1; i < rows.length; i++) {
		const g = rows[i].y - rows[i - 1].y;
		if (g > byGlyph * 0.3 && g < byGlyph * 2.5) gaps.push(g);
	}
	if (gaps.length < 6) return byGlyph;
	gaps.sort((a, b) => a - b);
	const pitch = gaps[Math.floor(gaps.length / 2)];
	return Math.min(byGlyph * 1.4, Math.max(byGlyph * 0.6, pitch));
}

/** The words that share a line, in reading order. */
function linesOf(words, lh) {
	const rest = [...words].sort((a, b) => mid(a).y - mid(b).y || a.x0 - b.x0);
	const out = [];
	for (const w of rest) {
		const line = out[out.length - 1];
		if (line && Math.abs(mid(w).y - line.y) <= lh * 0.45) {
			line.words.push(w);
			line.y = line.words.reduce((s, x) => s + mid(x).y, 0) / line.words.length;
		} else {
			out.push({ y: mid(w).y, words: [w] });
		}
	}
	for (const l of out) l.words.sort((a, b) => a.x0 - b.x0);
	return out.map(l => ({ ...l, text: l.words.map(w => clean(w.text)).join(' ').trim() }));
}

/* ------------------------------------------------------------------ *
 * the shape of the panel, which no language changes
 * ------------------------------------------------------------------ */

/**
 * The grid of growths: every per-cent in the panel, put back into the
 * rows and columns the window set it in.
 *
 * The window lays eight growths and four traits in two columns six rows
 * deep; the panel lays the same eight in one column. Which is which is
 * settled by how many columns the figures fall into, and a column is a
 * run of them with no great gap across it -- "(+3.9%) 3.9%", the
 * applied growth and the rolled one, is one column and not two.
 *
 * Returns the keys that could be filled, or nothing when the figures do
 * not make either shape: a first mate's panel has four traits and no
 * growths at all, and guessing at that would invent a whole crew.
 */
export function growthGrid(words, lh) {
	const marks = [];
	for (const w of words) {
		const pcts = percentsIn(w.text);
		// The last of them: an applied growth is written "(+3.9%) 3.9%"
		// and the figure that counts is the one on the right.
		if (pcts.length) marks.push({ w, v: pcts[pcts.length - 1], x: mid(w).x, y: mid(w).y });
	}
	if (marks.length < 8) return null;

	const rows = [];
	for (const m of [...marks].sort((a, b) => a.y - b.y)) {
		const row = rows[rows.length - 1];
		if (row && Math.abs(m.y - row.y) <= lh * 0.5) { row.marks.push(m); row.y = (row.y + m.y) / 2; }
		else rows.push({ y: m.y, marks: [m] });
	}

	// Columns: sort every figure by where it sits across the panel and
	// cut wherever the gap is wider than a couple of lines. The two
	// columns of the window are a third of the panel apart; the two
	// figures of an applied growth are a word apart.
	const cols = [];
	for (const m of [...marks].sort((a, b) => a.x - b.x)) {
		const col = cols[cols.length - 1];
		if (col && m.x - col.max <= lh * 3) { col.max = Math.max(col.max, m.x); col.marks.push(m); }
		else cols.push({ min: m.x, max: m.x, marks: [m] });
	}
	const colOf = m => cols.findIndex(c => c.marks.includes(m));

	// The rightmost figure of a row and column is the one that counts.
	const cell = (row, col) => {
		const inCell = rows[row]?.marks.filter(m => colOf(m) === col).sort((a, b) => a.x - b.x);
		return inCell && inCell.length ? inCell[inCell.length - 1].v : null;
	};

	const out = {};
	if (cols.length === 2 && rows.length === 6) {
		GRID_TWO_COL.left.forEach((key, i) => { const v = cell(i, 0); if (key && v !== null) out[key] = v; });
		GRID_TWO_COL.right.forEach((key, i) => { const v = cell(i, 1); if (key && v !== null) out[key] = v; });
	} else if (cols.length === 1 && rows.length === 8) {
		GRID_ONE_COL.forEach((key, i) => { const v = cell(i, 0); if (v !== null) out[key] = v; });
	} else {
		return null;
	}
	return Object.keys(out).length >= 6 ? out : null;
}

/* ------------------------------------------------------------------ *
 * where the panel is
 * ------------------------------------------------------------------ */

/**
 * Where the sailor panel is in a screenshot, from the labels that only
 * it prints -- or, where none of them were made out, from the figures
 * only it prints: a weight in LT with a grid of growths under it.
 *
 * Returned in the image's own pixels, generously bounded -- this is
 * what the reader crops to before it reads the panel properly, and a
 * crop that takes in a little of the sea costs nothing while one that
 * clips the name costs the name.
 */
export function panelBox(words, { width = Infinity, height = Infinity, locale = EN } = {}) {
	const found = words.map(w => ({ w, field: labelOf(w.text, locale) })).filter(x => ANCHORS.includes(x.field));
	const weights = words.filter(w => weightIn(w.text) !== null);
	const pcts = words.filter(w => percentsIn(w.text).length);
	// A named first mate's panel prints no cabin cost and no growths at
	// all, so it can only muster two of these -- and then the title or
	// the line saying where they are standing has to vouch for it.
	const said = words.map(w => clean(w.text)).join(' ');
	const vouched = words.some(w => /^[<«]/.test(clean(w.text)))
		|| locale.aboard.some(a => said.toLowerCase().includes(a.toLowerCase()))
		|| locale.idle.some(a => said.toLowerCase().includes(a.toLowerCase()))
		|| /on\s*board|\(idle\)/i.test(said);
	// The figures vouch for it too, and they are the same figures in
	// every language: nothing else in the game puts a weight in LT over
	// a column of per-cents.
	const byShape = pcts.length >= 8 || (weights.length > 0 && pcts.length >= 4);
	if (found.length < (vouched ? 2 : 3) && !byShape) return null;

	const anchorWords = found.map(x => x.w);
	const lh = lineHeight(anchorWords.length >= 3 ? anchorWords : [...anchorWords, ...weights, ...pcts]) || lineHeight(words);
	if (!lh) return null;
	// The panel runs from a little left of its labels, out to the values
	// and no further, up past the name and down past the last growth.
	// The growths are set further left than the three facts above them,
	// in both windows -- so when one of their labels was found the left
	// edge is already right. When none was -- a cursor over the row, a
	// tooltip across it, or a language whose words for them we could not
	// check -- the panel still reaches out that far, and the crop has to
	// reach with it: ten or eleven lines, measured off the windows.
	const seeds = [...anchorWords, ...weights, ...pcts];
	const sawGrowth = found.some(x => GROWTH_KEYS.includes(x.field));
	const left = Math.min(...seeds.map(w => w.x0)) - (sawGrowth ? 0 : lh * 11);
	const right = Math.max(...seeds.map(w => w.x1));
	let valueRight = right;
	for (const w of anchorWords) {
		for (const v of words) {
			if (v.x0 < w.x1 || Math.abs(mid(v).y - mid(w).y) > lh * NEAR) continue;
			if (numberIn(v.text) === null && !/\d/.test(v.text)) continue;
			if (v.x1 > valueRight && v.x0 < w.x1 + lh * 14) valueRight = v.x1;
		}
	}
	const box = {
		x0: Math.max(0, left - lh * 1.5),
		// Ten lines above the topmost thing found. The name is the first
		// line of the panel and the highest label under it is the
		// condition, so how far up the crop has to reach depends on which
		// labels the first pass happened to make out -- and on a phone's
		// screenshot of a Korean panel it made out none of them until the
		// appetite, six rows down. Ten covers that; a crop that takes in
		// the row above the name costs nothing.
		y0: Math.max(0, Math.min(...seeds.map(w => w.y0)) - lh * 10),
		x1: Math.min(width, Math.max(valueRight, right + lh * 8) + lh * 2),
		y1: Math.min(height, Math.max(...seeds.map(w => w.y1)) + lh * 9)
	};
	return box.x1 > box.x0 + lh && box.y1 > box.y0 + lh ? { ...box, lineH: lh } : null;
}

/* ------------------------------------------------------------------ *
 * the values beside the labels
 * ------------------------------------------------------------------ */

/**
 * The words to the right of a label, up to the value's end.
 *
 * What ends it is either another label -- the second column of the
 * Manage Sailors window sits right of the first -- or, once a figure
 * has been found, any word at all: past the figure there is nothing of
 * this label's left, and that rule needs no vocabulary, which is what
 * makes it hold in a language whose words for the traits we never saw.
 * Before the figure a plain word is stepped over, because that is where
 * the rest of a two-word label lives.
 */
function rightOf(words, label, locale) {
	const lh = label.lh;
	const row = words.filter(w => w !== label.w
		&& w.x0 >= label.w.x1 - lh * 0.2
		&& Math.abs(mid(w).y - mid(label.w).y) <= lh * NEAR)
		.sort((a, b) => a.x0 - b.x0);
	const out = [];
	for (const w of row) {
		const num = numberIn(w.text) !== null || percentsIn(w.text).length > 0 || weightIn(w.text) !== null;
		if (num) { out.push(w); continue; }
		const field = labelOf(w.text, locale);
		if (field && field !== label.field) break;
		if (out.length) break;
		const l = letters(w.text);
		if (!field && !isTail(w.text, locale) && l.length >= (DENSE.test(l) ? 2 : 3)) break;
	}
	return out;
}

/** The plain number that belongs to a label: appetite, cabins, weight. */
function valueFor(words, label, locale) {
	// The scan sometimes hands a CJK label back glued to its own figure.
	const own = /(\d[\d,.]*)\s*$/.exec(clean(label.w.text));
	if (own) {
		const n = numberIn(own[1]);
		if (n !== null) return n;
	}
	for (const w of rightOf(words, label, locale)) {
		const n = weightIn(w.text) ?? numberIn(w.text);
		if (n !== null) return n;
	}
	return null;
}

/**
 * The growth that belongs to a label. Only a figure with a per-cent
 * sign counts: the panel draws small marks in the same row -- a seat's
 * icon, the edge of a bar -- and they read as stray digits, which is
 * how a Strength of 1.8 became a 1. Where nothing carries a sign, a
 * plain number is taken rather than nothing at all.
 */
function growthFor(words, label, locale) {
	const row = rightOf(words, label, locale);
	const pcts = row.flatMap(w => percentsIn(w.text));
	if (pcts.length) return pcts[pcts.length - 1];
	const ns = row.map(w => numberIn(w.text)).filter(n => n !== null);
	return ns.length ? ns[ns.length - 1] : null;
}

// What the scan makes of a digit when it is small and light on dark.
const DIGITY = { ']': '1', '[': '1', '|': '1', l: '1', I: '1', i: '1', O: '0', o: '0', S: '5', s: '5', B: '8' };
const digits = s => [...String(s)].map(c => (/\d/.test(c) ? c : DIGITY[c] || '')).join('');

/**
 * What can stand before the level on the name line.
 *
 * Every client but the Russian one writes "Lv."; that one writes "Ур.".
 * Both are two letters small enough for the scan to take a run at, so
 * each is matched through one confusion and no more -- "Ly.8" for
 * "Lv.8", a Latin "Yp." where the Cyrillic "Ур." was. Anything looser
 * and an ordinary word starting "li" is read as a level.
 */
const LEVEL_MARKS = {
	Lv: /^L[vy][.,]?(.*)$/i,
	'Ур': /^[УY][рpR][.,]?(.*)$/i
};

const levelMarks = locale => locale.level.map(p => LEVEL_MARKS[p]
	|| new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.,]?(.*)$`, 'i')).filter(Boolean);

/**
 * The level on a line, and everything after it -- which is the name.
 *
 * Returns null when the line carries no level mark at all. `lv` can
 * still be null when the number beside it was lost, which the panel's
 * own badge usually makes good.
 */
function levelIn(words, locale) {
	const marks = levelMarks(locale);
	for (let i = 0; i < words.length; i++) {
		// Raw, not cleaned: a bracket is how a small "1" often comes back,
		// and cleaning would throw the level away with it.
		const t = String(words[i].text || '').trim();
		const m = marks.map(re => re.exec(t)).find(Boolean);
		if (!m) continue;
		const tail = m[1];
		// "Lv.1Proix": the level and the name in one word.
		const split = /^([\d\][|lIiOoSsB]{1,2})(.*)$/.exec(tail);
		let lv = null, rest = '';
		if (split) {
			const d = digits(split[1]);
			lv = d ? Number(d) : null;
			rest = split[2];
		} else if (tail) {
			rest = tail;
		}
		const after = words.slice(i + 1).map(w => String(w.text || '').trim());
		// "Lv." "10" "Willston": the number is the next word along.
		if (lv === null && after.length && /^[\d\][|lIiOoSsB]{1,2}$/.test(after[0])) {
			const d = digits(after.shift());
			if (d) lv = Number(d);
		}
		const text = clean([rest, ...after].join(' ')).replace(/\s+/g, ' ').trim();
		if (lv !== null && (lv < 1 || lv > 10)) lv = null;
		return { lv, rest: text };
	}
	return null;
}

/** The title in angle brackets, matched to a type the app knows. */
function titleIn(lines, locale) {
	for (const line of lines) {
		const m = /[<«(]\s*([\p{L}][\p{L}\p{M}'’ -]{1,32}?)\s*[>»)]/u.exec(line.text);
		const raw = m ? m[1] : null;
		if (!raw) continue;
		const hit = closestType(raw, locale);
		if (hit) return hit;
	}
	return null;
}

/**
 * The type name closest to what was read, or nothing if none is close.
 *
 * The panel prints the type in the client's own language, so every
 * language's word for it is matched and the English name returned.
 */
export function closestType(raw, locale = EN) {
	const s = clean(raw).replace(/[^\p{L}\p{M}' -]/gu, '').trim();
	const dense = DENSE.test(s);
	if (s.length < (dense ? 2 : 3)) return null;
	const cap = dense ? (s.length <= 3 ? 0 : 1) : Math.max(2, Math.round(s.length / 5));
	const names = [...Object.entries(locale.titles), ...mateTypes.map(t => [t.type, t.type]), ['First Mate', 'First Mate']];
	let best = null, bestD = cap + 1;
	for (const [said, type] of names) {
		const d = editDistance(s.toLowerCase(), said.toLowerCase(), cap);
		if (d < bestD) { bestD = d; best = type; }
	}
	return bestD <= cap ? best : null;
}

/* ------------------------------------------------------------------ *
 * the sailor
 * ------------------------------------------------------------------ */

/**
 * One sailor, read off a panel's words.
 *
 * Returns null when the words are not a sailor panel at all. Otherwise
 * everything it could find, `warnings` for everything it could not, and
 * the facts kept apart from the growths -- the facts are what name the
 * type when the window does not.
 */
export function readPanel(words, locale = EN) {
	const kept = (words || []).filter(w => clean(w.text));
	const lh = lineHeight(kept);
	if (!lh) return null;
	const labels = kept.map(w => ({ w, lh, ...(labelMatch(w.text, locale) || {}) })).filter(x => x.field);
	// The word that spells a label out best is the label: "силач" is a
	// letter away from "Сила", and the window prints both -- one as the
	// Force the app keeps and one as the tail of a trait it does not.
	const at = field => labels.filter(x => x.field === field)
		.sort((a, b) => a.d - b.d || a.w.y0 - b.w.y0)[0] || null;
	const lines = linesOf(kept, lh);

	// A panel is either three of its labels or the two figures no other
	// window in the game puts together: a weight in LT over a grid of
	// per-cents.
	const ltWord = kept.find(w => weightIn(w.text) !== null) || null;
	const grid = growthGrid(kept, lh);
	// Two of its labels, or the grid of growths on its own: eight
	// figures with per-cent signs, laid in one column or two, is a
	// sailor's growths and nothing else in the game is.
	if (ANCHORS.filter(f => at(f)).length < 2 && !grid && !ltWord) return null;

	// The labels again, read a line at a time rather than a word at a
	// time: what one misses the other often has.
	const facts = lineFacts(lines, locale);

	const warnings = [];
	const num = (field, lo, hi) => {
		const ok0 = v => (v !== null && v !== undefined && v >= lo && v <= hi ? v : null);
		const l = at(field);
		if (!l) return ok0(facts[field] ? facts[field].value : null);
		const ok = v => (v !== null && v >= lo && v <= hi ? v : null);
		const v = ok(valueFor(kept, l, locale));
		if (v !== null) return v;
		// The Selected Sailor panel sets Weight's figure under its label
		// rather than beside it, right-aligned; the row below is the only
		// other place a value is ever found -- and only when that row is
		// not some other label's, or a missed Cabin Cost would be read as
		// the Weight underneath it.
		const below = kept.filter(w => w.x1 > l.w.x0 && mid(w).y - mid(l.w).y > 0 && mid(w).y - mid(l.w).y <= lh * 1.5);
		if (below.some(w => labelOf(w.text, locale) && numberIn(w.text) === null)) return null;
		const ns = below.map(w => ({ w, n: ok(weightIn(w.text) ?? numberIn(w.text)) })).filter(x => x.n !== null).sort((a, b) => a.w.x0 - b.w.x0);
		return ns.length ? ns[0].n : ok0(facts[field] ? facts[field].value : null);
	};

	const stats = {};
	for (const key of GROWTH_KEYS) {
		const l = at(key);
		if (!l) continue;
		const v = growthFor(kept, l, locale);
		if (v !== null && v >= 0 && v <= 100) stats[key] = Math.round(v * 10) / 10;
	}
	for (const key of GROWTH_KEYS) {
		const f = facts[key];
		if (stats[key] === undefined && f && f.value !== null && f.value >= 0 && f.value <= 100) stats[key] = Math.round(f.value * 10) / 10;
	}
	// Whatever the labels did not give up, the grid does: the eight are
	// laid out in the same order in every language, so a growth whose
	// name we could not read is still the fifth figure down the column.
	if (grid) for (const [key, v] of Object.entries(grid)) if (stats[key] === undefined) stats[key] = Math.round(v * 10) / 10;
	const moves = ['speed', 'accel', 'turn', 'brake'].filter(k => stats[k] !== undefined).length;
	if (!moves) warnings.push('no growths read');
	else if (moves < 4) warnings.push('some growths not read');

	// Bounded by what the game can print: no sailor eats two hundred, or
	// costs twenty cabins, or weighs half a ton and a bit. A figure
	// outside these was not read, whatever the scan says, and saying so
	// is better than naming the wrong type on the strength of it.
	let appetite = num('appetite', 50, 200);
	let cabin = num('cabin', 0, 20);
	// The weight is the one fact that needs no label at all.
	let weight = num('weight', 50, 900);
	if (weight === null && ltWord) {
		const w = weightIn(ltWord.text);
		if (w !== null && w >= 50 && w <= 900) weight = w;
	}
	if (weight === null && grid) {
		const above = Math.min(...kept.filter(w => percentsIn(w.text).length).map(w => mid(w).y));
		for (const w of kept) {
			if (mid(w).y >= above) continue;
			const n = looseWeight(w.text);
			if (n !== null && n >= 50 && n <= 900) { weight = n; break; }
		}
	}
	// A sailor weighs a whole number of LT and the game prints the
	// tenth anyway; a "200.0LT" whose T came back as a 1 is 200.
	if (weight !== null) weight = Math.round(weight);
	// And the two above it are, in every client, the cabin cost and the
	// appetite in that order going up -- so when neither word was made
	// out, the rows are read instead. Only when neither: a mate's panel
	// prints an appetite and no cabin cost at all, and reading the row
	// above the weight there would invent one. A row with a pair over a
	// slash is the condition and not one of them.
	if (appetite === null && cabin === null && ltWord) {
		const from = mid(ltWord).y;
		const above = lines.filter(l => from - l.y > lh * 0.5 && from - l.y < lh * 3.6 && !PAIR.test(l.text))
			.sort((a, b) => b.y - a.y);
		const plain = l => {
			const ns = l.words.map(w => numberIn(w.text)).filter(n => n !== null && Number.isInteger(n));
			return ns.length === 1 ? ns[0] : null;
		};
		const [first, second] = [plain(above[0] || { words: [] }), plain(above[1] || { words: [] })];
		if (cabin === null && first !== null && first >= 0 && first <= 20) cabin = first;
		if (appetite === null && second !== null && second >= 50 && second <= 200) appetite = second;
	}

	// The level and the name share a line: "Lv.8 Polnis". The badge on
	// the portrait says "Lv.8" on its own, so the line with words after
	// it is the one that carries the name. A first mate has no level at
	// all in the Manage Sailors window, and stands on their own name.
	// "Lv.10 Willston" comes back three ways depending on the scan --
	// "Lv." "10" "Willston", or "Lv.10" "Willston", or the lot glued as
	// "Lv.1Proix" -- and whatever is left of the window (the roster's
	// own "18/20") can land at the head of the same line. So the level
	// is found as a word and the name is whatever follows it: nothing
	// before it belongs to the sailor.
	let lv = null, name = '';
	for (const line of lines) {
		const found = levelIn(line.words, locale);
		if (!found) continue;
		// The title sits beside the portrait's badge on the same line;
		// a name never has angle brackets round it.
		if (/[<«]/.test(found.rest) || /[<«]/.test(line.text)) {
			if (lv === null && found.lv !== null) lv = found.lv;
			continue;
		}
		if (found.rest && letters(found.rest).length >= 2 && !name) { name = found.rest; lv = found.lv; }
		else if (lv === null) lv = found.lv;
	}
	const title = titleIn(lines, locale);
	// Where the sailor is standing, said in the client's own words --
	// with the spaces taken out, because a dense script comes back a
	// syllable at a time and "[탑승중]" arrives as "탑 승 중]".
	const tight = s => s.replace(/\s+/g, '').toLowerCase();
	const standing = [...locale.aboard, ...locale.idle].map(tight);
	const standsOn = line => standing.some(a => tight(line.text).includes(a))
		|| /on\s*board|idle/i.test(line.text.replace(/[^A-Za-z ]/g, ''));
	if (!name) {
		// A mate has no level at all, and neither has a sailor whose
		// "Lv.10" the scan lost among the glyphs of another script. Either
		// way the name is the line above the one that says where they are
		// standing, less anything numeric at the head of it -- the roster's
		// own "18/20", or what is left of the level.
		const idx = lines.findIndex(standsOn);
		const above = idx > 0 ? lines[idx - 1] : null;
		if (above && !/[<«(]/.test(above.text) && letters(above.text).length >= 3) {
			const last = above.words.map(w => /\d/.test(w.text)).lastIndexOf(true);
			name = above.words.slice(last + 1).map(w => clean(w.text)).join(' ').trim() || above.text;
			// "Lv.10" scanned down to ".10": a figure of one or two digits
			// on the name's own line is the level and nothing else is.
			if (lv === null) {
				for (const w of above.words.slice(0, last + 1)) {
					const d = digits(w.text);
					if (d.length >= 1 && d.length <= 2 && Number(d) >= 1 && Number(d) <= 10) lv = Number(d);
				}
			}
		}
	}
	// The Manage Sailors window sets "18/20" on the same line as the
	// name it has selected, and a mate's line has no level to cut it
	// off, so anything numeric at the head of a name is the window's.
	name = clean(name).replace(/^(?:\d+\s*[/|]\s*\d+|\d+)\s*/, '')
		.replace(/[^\p{L}\p{M}\p{N}_'’ .-]/gu, '').replace(/\s+/g, ' ').trim();
	// A name in a script that sets no spaces comes back one glyph at a
	// time -- 迪 萊 因 -- and is one word: 迪萊因.
	name = DENSE.test(name)
		? name.replace(/\s+/g, '')
		// A stray mark beside the name comes back as a word of one
		// letter, and no sailor's name ends in one.
		: name.replace(/\s+\S$/, '');
	name = name.slice(0, 30);
	if (!name) warnings.push('no name');
	if (lv === null && !(title === 'First Mate' || (title && anyType[title] && anyType[title].mate))) warnings.push('no level');

	// Condition: spelt out in the window, and only a bar with "170/170"
	// under it in the panel. Either way it is the pair, not the EXP
	// percentage above it.
	let cond = null;
	const condLabel = at('condition');
	const ceiling = at('appetite') ? mid(at('appetite').w).y : ltWord ? mid(ltWord).y : Infinity;
	const condLine = condLabel
		? lines.find(l => l.words.includes(condLabel.w))
		: facts.condition ? facts.condition.line
			: lines.filter(l => PAIR.test(l.text) && l.y < ceiling).pop();
	const m = condLine ? PAIR.exec(condLine.text) : null;
	if (m && Number(m[2]) > 0) cond = Math.max(0, Math.min(100, Math.round(Number(m[1]) / Number(m[2]) * 100)));

	const aboard = lines.some(l => locale.aboard.some(a => tight(l.text).includes(tight(a))))
		|| lines.some(l => /on\s*board/i.test(l.text.replace(/[^A-Za-z ]/g, '')));

	return {
		name, lv, title, cond, aboard,
		appetite, cabin, weight,
		stats,
		warnings
	};
}

/**
 * Which type of sailor this is.
 *
 * The title says it outright when the shot has one. When it does not --
 * the Manage Sailors window never prints it -- the three facts do most
 * of the work: appetite, cabin cost and weight cut the pool of twenty
 * down to one or three, and the growths settle the rest by how well
 * each candidate's band at that level fits what was read.
 *
 * `sure` is false when the facts left more than one standing, which is
 * the review table's cue to ask rather than assume.
 */
export function matchType(read) {
	if (read.title && anyType[read.title] && read.title !== 'First Mate') return { type: read.title, sure: true };
	// "<First Mate>" names the seat, not the person: the name does that.
	if (read.title === 'First Mate') {
		const mate = mateTypes.find(t => editDistance(t.type.toLowerCase(), (read.name || '').toLowerCase(), 4) <= 3);
		if (mate) return { type: mate.type, sure: true };
	}
	const mate = mateTypes.find(t => t.type.toLowerCase() === (read.name || '').toLowerCase());
	if (mate) return { type: mate.type, sure: true };

	const fits = pool.filter(t =>
		(read.appetite === null || read.appetite === t.appetite)
		&& (read.cabin === null || read.cabin === t.cabin)
		&& (read.weight === null || Math.round(read.weight) === t.weight));
	if (!fits.length) return { type: null, sure: false };
	if (fits.length === 1) return { type: fits[0].type, sure: true };

	// Several types eat and weigh the same -- Confident, Tough and
	// Tenacious all cost five cabins and 300 LT. What separates them is
	// where the growth went, so each candidate is scored on its own
	// bands at this level: a growth outside the band it allows counts
	// heavily against, and among those that fit, the one whose middle
	// the reading sits nearest wins.
	const lv = Math.min(10, Math.max(1, read.lv || 1));
	const scored = fits.map(t => {
		let score = 0, out = 0, seen = 0;
		for (const key of ['speed', 'accel', 'turn', 'brake', 'force', 'focus', 'vision']) {
			const v = read.stats[key];
			if (v === undefined) continue;
			const band = statBand(t.type, key, lv);
			if (!band) continue;
			seen++;
			const miss = v < band.min ? band.min - v : v > band.max ? v - band.max : 0;
			out += miss;
			score += miss * 3 + Math.abs(v - band.avg) / Math.max(0.3, band.max - band.min);
		}
		return { type: t.type, score: seen ? score / seen : Infinity, out, seen };
	}).sort((a, b) => a.score - b.score);
	const [first, second] = scored;
	if (!first || !Number.isFinite(first.score)) return { type: null, sure: false };
	// A clear winner is one whose growths all land inside its own bands,
	// and fit it distinctly better than the next candidate.
	return { type: first.type, sure: first.out < 0.05 && first.seen >= 3 && (!second || second.score - first.score > 0.25) };
}

/**
 * A screenshot's words as a roster entry, ready for the review table.
 * `id` is left to the caller: whether this is a new sailor or one
 * already hired is the roster's business, not the reader's.
 */
export function sailorFrom(words, locale = EN) {
	const read = readPanel(words, locale);
	if (!read) return null;
	const { type, sure } = matchType(read);
	const t = type ? anyType[type] : null;
	const warnings = [...read.warnings];
	if (!type) warnings.push('type unknown');
	else if (!sure) warnings.push('type guessed');
	// The facts are the game's; where they disagree with the type we
	// matched, the type is the doubtful half.
	if (t && read.weight !== null && Math.round(read.weight) !== t.weight) warnings.push('weight does not match the type');
	const stats = {};
	for (const [k, v] of Object.entries(read.stats)) if (v > 0) stats[k] = v;
	return {
		name: read.name || (type || 'Sailor'),
		type,
		lv: t && t.mate ? 1 : Math.min(10, Math.max(1, read.lv || 1)),
		cond: read.cond === null ? 100 : read.cond,
		stats: t && t.mate ? {} : stats,
		aboard: read.aboard,
		read: { appetite: read.appetite, cabin: read.cabin, weight: read.weight, title: read.title },
		warnings
	};
}
