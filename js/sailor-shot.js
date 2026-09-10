// Reading a sailor off a screenshot.
//
// The game will not tell anyone what is on their roster -- no file on
// disk carries it, and reading the client's memory is a banning -- so a
// screenshot is the only honest way in. Two windows show a sailor and
// both are worth taking:
//
//   * the Selected Sailor panel, usually cropped: a title in angle
//     brackets, "Lv.8 Polnis", the bars, then Appetite, Cabin Cost,
//     Weight and the growths in one column;
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
// This module is pure: words in, a sailor out. The engine that produces
// the words lives in shot-reader.js, and nothing here needs it -- which
// is what lets the parsing be tested on fixtures.

import { pool, mateTypes, anyType, statBand } from './sailors.js';

/** What the sailor window calls each growth, and what we call it. */
const GROWTHS = {
	Endurance: 'speed',
	Wits: 'accel',
	Awareness: 'turn',
	Strength: 'brake',
	Patience: 'patience',
	Force: 'force',
	Focus: 'focus',
	Vision: 'vision'
};

/** Every word the panel prints as a label, growths included. */
// "Cost" is deliberately absent: it is the second half of "Cabin Cost",
// and treating it as a label of its own stops the reader before it ever
// reaches the number on the far side of it.
const LABELS = ['Appetite', 'Cabin', 'Condition', 'Weight', 'EXP', ...Object.keys(GROWTHS),
	// The second column of the Manage Sailors window: four traits we do
	// not model, named here only so a growth's value stops before them.
	'Seasoned', 'Sailor', 'Son', 'Wind', 'Abstain', 'Natural', 'Born', 'Soldier'];

/** The labels that anchor the panel: three of these and it is a sailor. */
const ANCHORS = ['Appetite', 'Weight', 'Endurance', 'Condition', 'Cabin'];

const clean = s => String(s || '').replace(/[^\w'’.,%/()+<>«»: -]/g, '').replace(/\s+/g, ' ').trim();
const mid = w => ({ x: (w.x0 + w.x1) / 2, y: (w.y0 + w.y1) / 2 });

/**
 * How far apart two words are as a fraction of a line: the panel sets
 * a value half a line below its label, and the next label a whole line
 * below that, so "within nine tenths of a line" separates them.
 */
const NEAR = 0.9;

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

/** The label this word is, if it is one: OCR misses a letter often enough. */
function labelOf(text) {
	const w = clean(text).replace(/[^A-Za-z]/g, '');
	if (w.length < 3) return null;
	const cap = w.length <= 5 ? 1 : 2;
	let best = null, bestD = cap + 1;
	for (const l of LABELS) {
		const d = editDistance(w.toLowerCase(), l.toLowerCase(), cap);
		if (d < bestD) { bestD = d; best = l; }
	}
	return bestD <= cap ? best : null;
}

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

/**
 * The line height the panel is set in, from the words themselves: the
 * median height of a word box. Everything geometric here is measured in
 * these, so a 4K screenshot and a cropped panel read the same.
 */
export function lineHeight(words) {
	const hs = words.map(w => w.y1 - w.y0).filter(h => h > 2).sort((a, b) => a - b);
	if (!hs.length) return 0;
	// A word box is about the cap height; the line the panel sets is
	// nearer twice that, which is the distance between one label and the
	// next.
	return hs[Math.floor(hs.length / 2)] * 1.9;
}

/**
 * Where the sailor panel is in a screenshot, from the labels that only
 * it prints. Returned in the image's own pixels, generously bounded --
 * this is what the reader crops to before it reads the panel properly,
 * and a crop that takes in a little of the sea costs nothing while one
 * that clips the name costs the name.
 */
export function panelBox(words, { width = Infinity, height = Infinity } = {}) {
	const found = words.map(w => ({ w, label: labelOf(w.text) })).filter(x => ANCHORS.includes(x.label));
	// A named first mate's panel prints no cabin cost and no growths at
	// all, so it can only muster two of these -- and then the title or
	// the line saying where they are standing has to vouch for it.
	const vouched = words.some(w => /^[<«]/.test(clean(w.text)))
		|| /on\s*board|\(idle\)/i.test(words.map(w => clean(w.text)).join(' '));
	if (found.length < (vouched ? 2 : 3)) return null;
	const lh = lineHeight(words.filter(w => ANCHORS.includes(labelOf(w.text)))) || lineHeight(words);
	if (!lh) return null;
	// The anchors are the label column. The panel runs from a little to
	// their left, out to the values and no further, up past the name and
	// down past the last growth.
	// The growths are set further left than the three facts above them,
	// in both windows -- so when one of their labels was found the left
	// edge is already right. When none was (a cursor over the row, a
	// tooltip across it) the panel still reaches out that far, and the
	// crop has to reach with it.
	const sawGrowth = found.some(x => Object.keys(GROWTHS).includes(x.label));
	const left = Math.min(...found.map(x => x.w.x0)) - (sawGrowth ? 0 : lh * 5);
	const right = Math.max(...found.map(x => x.w.x1));
	let valueRight = right;
	for (const { w } of found) {
		for (const v of words) {
			if (v.x0 < w.x1 || Math.abs(mid(v).y - mid(w).y) > lh * NEAR) continue;
			if (numberIn(v.text) === null && !/\d/.test(v.text)) continue;
			if (v.x1 > valueRight && v.x0 < w.x1 + lh * 14) valueRight = v.x1;
		}
	}
	const box = {
		x0: Math.max(0, left - lh * 1.5),
		y0: Math.max(0, Math.min(...found.map(x => x.w.y0)) - lh * 7),
		x1: Math.min(width, Math.max(valueRight, right + lh * 8) + lh * 2),
		y1: Math.min(height, Math.max(...found.map(x => x.w.y1)) + lh * 9)
	};
	return box.x1 > box.x0 + lh && box.y1 > box.y0 + lh ? { ...box, lineH: lh } : null;
}

/** The words to the right of a label, up to the next label along. */
function rightOf(words, label) {
	const lh = label.lh;
	const row = words.filter(w => w !== label.w
		&& w.x0 >= label.w.x1 - lh * 0.2
		&& Math.abs(mid(w).y - mid(label.w).y) <= lh * NEAR)
		.sort((a, b) => a.x0 - b.x0);
	const out = [];
	for (const w of row) {
		// Another label ends this one's value -- the second column of the
		// Manage Sailors window sits right of the first.
		if (labelOf(w.text) && numberIn(w.text) === null && !percentsIn(w.text).length) break;
		out.push(w);
	}
	return out;
}

/** The plain number that belongs to a label: appetite, cabins, weight. */
function valueFor(words, label) {
	for (const w of rightOf(words, label)) {
		const n = numberIn(w.text);
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
function growthFor(words, label) {
	const row = rightOf(words, label);
	const pcts = row.flatMap(w => percentsIn(w.text));
	if (pcts.length) return pcts[pcts.length - 1];
	const ns = row.map(w => numberIn(w.text)).filter(n => n !== null);
	return ns.length ? ns[ns.length - 1] : null;
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

// What the scan makes of a digit when it is small and light on dark.
const DIGITY = { ']': '1', '[': '1', '|': '1', l: '1', I: '1', i: '1', O: '0', o: '0', S: '5', s: '5', B: '8' };
const digits = s => [...String(s)].map(c => (/\d/.test(c) ? c : DIGITY[c] || '')).join('');

/**
 * The level on a line, and everything after it -- which is the name.
 *
 * Returns null when the line has no "Lv." on it at all. `lv` can still
 * be null when the number beside it was lost, which the panel's own
 * badge usually makes good.
 */
function levelIn(words) {
	for (let i = 0; i < words.length; i++) {
		// Raw, not cleaned: a bracket is how a small "1" often comes back,
		// and cleaning would throw the level away with it.
		const t = String(words[i].text || '').trim();
		const m = /^L[vy][.,]?(.*)$/i.exec(t);
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

/** Every type name the title can be, mates included. */
const TYPE_NAMES = [...pool.map(t => t.type), ...mateTypes.map(t => t.type), 'First Mate'];

/** The title in angle brackets, matched to a type the app knows. */
function titleIn(lines) {
	for (const line of lines) {
		const m = /[<«(]\s*([A-Za-z][A-Za-z'’ -]{2,32}?)\s*[>»)]/.exec(line.text);
		const raw = m ? m[1] : null;
		if (!raw) continue;
		const hit = closestType(raw);
		if (hit) return hit;
	}
	return null;
}

/** The type name closest to what was read, or nothing if none is close. */
export function closestType(raw) {
	const s = clean(raw).replace(/[^A-Za-z' -]/g, '').trim();
	if (s.length < 3) return null;
	const cap = Math.max(2, Math.round(s.length / 5));
	let best = null, bestD = cap + 1;
	for (const t of TYPE_NAMES) {
		const d = editDistance(s.toLowerCase(), t.toLowerCase(), cap);
		if (d < bestD) { bestD = d; best = t; }
	}
	return bestD <= cap ? best : null;
}

/**
 * One sailor, read off a panel's words.
 *
 * Returns null when the words are not a sailor panel at all. Otherwise
 * everything it could find, `warnings` for everything it could not, and
 * the facts kept apart from the growths -- the facts are what name the
 * type when the window does not.
 */
export function readPanel(words) {
	const kept = (words || []).filter(w => clean(w.text));
	const lh = lineHeight(kept);
	if (!lh) return null;
	const labels = kept.map(w => ({ w, label: labelOf(w.text), lh })).filter(x => x.label);
	const at = name => labels.find(x => x.label === name) || null;
	if (ANCHORS.filter(a => at(a)).length < 2) return null;

	const lines = linesOf(kept, lh);
	const warnings = [];
	const num = (name, lo, hi) => {
		const l = at(name);
		if (!l) return null;
		const ok = v => (v !== null && v >= lo && v <= hi ? v : null);
		const v = ok(valueFor(kept, l));
		if (v !== null) return v;
		// The Selected Sailor panel sets Weight's figure under its label
		// rather than beside it, right-aligned; the row below is the only
		// other place a value is ever found -- and only when that row is
		// not some other label's, or a missed Cabin Cost would be read as
		// the Weight underneath it.
		const below = kept.filter(w => w.x1 > l.w.x0 && mid(w).y - mid(l.w).y > 0 && mid(w).y - mid(l.w).y <= lh * 1.5);
		if (below.some(w => labelOf(w.text) && numberIn(w.text) === null)) return null;
		const ns = below.map(w => ({ w, n: ok(numberIn(w.text)) })).filter(x => x.n !== null).sort((a, b) => a.w.x0 - b.w.x0);
		return ns.length ? ns[0].n : null;
	};

	const stats = {};
	for (const [word, key] of Object.entries(GROWTHS)) {
		const l = at(word);
		if (!l) continue;
		const v = growthFor(kept, l);
		if (v !== null && v >= 0 && v <= 100) stats[key] = Math.round(v * 10) / 10;
	}
	const moves = ['speed', 'accel', 'turn', 'brake'].filter(k => stats[k] !== undefined).length;
	if (!moves) warnings.push('no growths read');
	else if (moves < 4) warnings.push('some growths not read');

	// Bounded by what the game can print: no sailor eats two hundred, or
	// costs twenty cabins, or weighs half a ton and a bit. A figure
	// outside these was not read, whatever the scan says, and saying so
	// is better than naming the wrong type on the strength of it.
	const appetite = num('Appetite', 50, 200);
	const cabin = num('Cabin', 0, 20);
	const weight = num('Weight', 50, 900);

	// The level and the name share a line: "Lv.8 Polnis". The badge on
	// the portrait says "Lv.8" on its own, so the line with words after
	// it is the one that carries the name. A first mate has no level at
	// all in the Manage Sailors window, and stands on their own name.
	// "Lv.10 Willston" comes back three ways depending on the scan --
	// "Lv." "10" "Willston", or "Lv.10" "Willston", or the lot glued as
	// "Lv.1Proix" -- and whatever is left of the window (the roster's
	// own "18/20") can land at the head of the same line. So the level
	// is found as a word and the name is whatever follows it: nothing
	// before it belongs to the sailor. The badge on the portrait says
	// the level on its own with nothing after it; the line with a name
	// after it is the one that carries the name.
	let lv = null, name = '';
	for (const line of lines) {
		const found = levelIn(line.words);
		if (!found) continue;
		// The title sits beside the portrait's badge on the same line;
		// a name never has angle brackets round it.
		if (/[<«]/.test(found.rest) || /[<«]/.test(line.text)) {
			if (lv === null && found.lv !== null) lv = found.lv;
			continue;
		}
		if (found.rest && /[A-Za-z]{2}/.test(found.rest) && !name) { name = found.rest; lv = found.lv; }
		else if (lv === null) lv = found.lv;
	}
	const title = titleIn(lines);
	if (!name) {
		// A mate: no level, and the name is the line above the one that
		// says where they are standing.
		const idx = lines.findIndex(l => /on\s*board|idle/i.test(l.text.replace(/[^A-Za-z ]/g, '')));
		const above = idx > 0 ? lines[idx - 1] : null;
		if (above && !/[<«(]/.test(above.text) && /[A-Za-z]{3}/.test(above.text)) name = above.text;
	}
	// The Manage Sailors window sets "18/20" on the same line as the
	// name it has selected, and a mate's line has no level to cut it
	// off, so anything numeric at the head of a name is the window's.
	name = clean(name).replace(/^(?:\d+\s*[/|]\s*\d+|\d+)\s*/, '')
		.replace(/[^\w'’ .-]/g, '').replace(/\s+/g, ' ').trim()
		// A stray mark beside the name comes back as a word of one
		// letter, and no sailor's name ends in one.
		.replace(/\s+\S$/, '').slice(0, 30);
	if (!name) warnings.push('no name');
	if (lv === null && !(title === 'First Mate' || (title && anyType[title] && anyType[title].mate))) warnings.push('no level');

	// Condition: spelt out in the window, and only a bar with "170/170"
	// under it in the panel. Either way it is the pair, not the EXP
	// percentage above it.
	let cond = null;
	const pair = /(\d{1,4})\s*[/|]\s*(\d{1,4})/;
	const condLabel = at('Condition');
	const condLine = condLabel
		? lines.find(l => l.words.includes(condLabel.w))
		: lines.filter(l => pair.test(l.text) && (!at('Appetite') || l.y < mid(at('Appetite').w).y)).pop();
	const m = condLine ? pair.exec(condLine.text) : null;
	if (m && Number(m[2]) > 0) cond = Math.max(0, Math.min(100, Math.round(Number(m[1]) / Number(m[2]) * 100)));

	const aboard = lines.some(l => /on\s*board/i.test(l.text.replace(/[^A-Za-z ]/g, '')));

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
export function sailorFrom(words) {
	const read = readPanel(words);
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
