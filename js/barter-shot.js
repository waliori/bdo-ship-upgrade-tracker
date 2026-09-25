// Reading the barter window off a screenshot.
//
// The window is a list, and every row of it says the same four things:
// the island, what it wants, what it pays, and how many exchanges are
// left. A player reading that list into the app has been retyping it a
// row at a time -- pick the island, pick the offer, and again at the
// next island -- which is the dullest part of a barter day and the one
// most likely to be got wrong.
//
// So: a screenshot of the list, and the rows come back whole.
//
// Nothing here guesses at an item from its spelling alone. The codex
// knows every exchange every island deals, so a row is not "whatever
// these words look like" -- it is "which of this island's forty
// exchanges do these words fit best". That is what makes a name the
// window cut short ("[Level 5] Faded Gold Dra...") read as surely as a
// whole one, and what keeps a misread letter from inventing an offer
// the game has never shown.
//
// Pure: words in, offers out. The engine that makes the words is
// shot-reader.js, and the dialog that acts on them is barter-import.js.

import { T } from './i18n.js';
import { editDistance, lineHeight } from './sailor-shot.js';

/** Whether a name is in a script that packs a word into a character
 *  or two -- Hangul, kana, Han, Thai -- where a length that is a
 *  fragment in English is a whole name. */
export function dense(text) {
	return /[\u0E00-\u0E7F\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/.test(String(text || ''));
}

/**
 * A name as it can be compared: no tier, no punctuation, no case, no
 * spaces, no accents -- in any of the game's scripts.
 *
 * The tier goes because the window prints it on both sides of every
 * row and it tells two items apart about as well as the word "the".
 * The spaces go because the engine loses and invents them -- "Golden
 * Sand Ring" comes back as "Golden SandRing" as often as not.
 */
export function plain(text) {
	return String(text || '')
		// A tier is a dozen characters at most. Unbounded, a bracket the
		// engine failed to close -- "[Level 41" for "[Level 4]" -- ran on to
		// the next "]" it could find and took the good's name with it.
		.replace(/\[[^[\]]{0,14}\]/g, ' ')
		// Accents go, since the English reader reads a French or a
		// Turkish window and does not always see them; a Hangul
		// syllable taken apart to do it is put back together.
		.normalize('NFKD').replace(/\p{M}+/gu, '').normalize('NFC')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The tier a piece of text names, if it names one: "[Level 5]", and
 *  the same in every client -- "[5단계]", "[Stufe 5]", "[+5]", "[5 ур.]"
 *  -- a bracket holding one figure from one to seven. */
export function tierIn(text) {
	const t = String(text || '');
	for (const m of t.matchAll(/\[([^[\]]{0,14})\]/g)) {
		const d = m[1].match(/[0-9]/g);
		if (d && d.length === 1 && /[1-7]/.test(d[0])) return Number(d[0]);
	}
	const m = /\b(?:level|nivel)\s*([1-7])\b/i.exec(t);
	return m ? Number(m[1]) : null;
}

/**
 * How much of `name` the text carries: a number between nought and one.
 *
 * The window cuts a long name off with an ellipsis, so a match has to
 * be able to end early and still count -- "faded gold dra" is all the
 * evidence there will ever be that a row says Faded Gold Dragon
 * Figurine.
 */
export function cover(name, text) {
	const n = plain(name);
	if (!n) return 0;
	/** The longest run of `want` that starts somewhere in `text`, with a
	 *  misread letter every few characters walked past rather than
	 *  stopped at. */
	const runOf = want => {
		let best = 0;
		for (let i = 0; i <= text.length - 3; i++) {
			if (text[i] !== want[0]) continue;
			let j = 0, bad = 0, got = 0;
			while (i + j < text.length && j < want.length) {
				if (text[i + j] === want[j]) { j++; got = j; continue; }
				bad++;
				// A misread letter every few characters is walked past; a
				// run of them is where the name stopped and the rest of
				// the row began, and the run ends at the last letter that
				// actually matched.
				if (bad > Math.floor(j * 0.15)) break;
				j++;
			}
			if (got > best) best = got;
			if (best === want.length) break;
		}
		return best;
	};
	// Picked up again where it broke off, because the window wraps a
	// long name and the engine reads what wrapped as a line of its own:
	// "[Level 6] Shadow" on one row and "Ornament Mirror" under the
	// Parley cost, with half a row's furniture between them.
	let at = 0, got = 0, pieces = 0;
	while (at < n.length && pieces < 2) {
		const run = runOf(n.slice(at));
		// A name wraps once, onto one more line -- never into a scatter
		// of syllables, which is what letting it pick up anywhere any
		// number of times would find in a row full of words.
		if (run < (pieces ? (dense(n) ? 3 : 5) : (dense(n) ? 2 : 3))) break;
		got += run;
		at += run;
		pieces++;
	}
	// A short name has to be there in full: "Beer" will find "bee" in
	// something, given a row of words to look through.
	const packed = dense(n);
	if (n.length <= (packed ? 3 : 6) && got < n.length) return 0;
	// And a dozen characters is as much as any name needs to be told
	// from the others an island deals -- which is the whole reason a
	// name the window cut short reads as surely as a whole one. Half
	// that in a script where a character is a syllable or a word.
	return Math.min(1, got / Math.min(n.length, packed ? 6 : 12));
}

/* ------------------------------------------------------------------ *
 * the rows of the window
 * ------------------------------------------------------------------ */

/** Words gathered into lines of writing, in reading order. */
export function linesOf(words, lh = lineHeight(words)) {
	const lines = [];
	const midOf = w => (w.y0 + w.y1) / 2;
	// Writing first, then the rest. The engine also boxes icons and the
	// frame's edges -- tall, or a sliver -- and those sit between two
	// lines of writing: let them move a line's height and, in a shot of
	// one row, they walked "Padix Island" down into "Exchanges Left" and
	// the island was never found. They join the nearest line as it
	// stands instead.
	const hs = words.map(w => w.y1 - w.y0).filter(h => h > 2).sort((a, b) => a - b);
	const h = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
	const odd = w => h > 0 && (w.y1 - w.y0 > h * 1.45 || w.y1 - w.y0 < h * 0.45);
	const byMid = (a, b) => midOf(a) - midOf(b);
	for (const w of words.filter(x => !odd(x)).sort(byMid)) {
		const mid = midOf(w);
		const line = lines.find(l => Math.abs(l.mid - mid) < lh * 0.6);
		if (line) {
			line.words.push(w);
			line.mid = (line.mid * (line.words.length - 1) + mid) / line.words.length;
		} else lines.push({ mid, words: [w] });
	}
	for (const w of words.filter(odd).sort(byMid)) {
		const mid = midOf(w);
		const near = lines.reduce((best, l) => (!best || Math.abs(l.mid - mid) < Math.abs(best.mid - mid) ? l : best), null);
		if (near && Math.abs(near.mid - mid) < lh * 0.6) near.words.push(w);
		else lines.push({ mid, words: [w] });
	}
	for (const line of lines) line.words.sort((a, b) => a.x0 - b.x0);
	return lines.sort((a, b) => a.mid - b.mid);
}

/**
 * The island a line begins with, if it begins with one.
 *
 * Every row of the window opens with the island's name in its own
 * column, so an island is looked for at the start of a line and
 * nowhere else -- otherwise "Iliya Island" in the middle of a row of
 * goods would start a row of its own. The name is often cut short
 * ("Sanctuary Coastal" for Sanctuary Coastal Outpost), so the words
 * are taken one at a time and the best standing match kept.
 */
export function isleAt(line, isles, { left = Infinity } = {}) {
	if (!line.words.length || line.words[0].x0 > left) return null;
	let best = null;
	let text = '';
	// A dense script comes back a character or two a word, so more
	// words make up one name.
	for (let i = 0; i < Math.min(dense(line.words[0].text) ? 8 : 4, line.words.length); i++) {
		text += line.words[i].text;
		const seen = plain(text);
		if (!seen) continue;
		for (const isle of isles) {
			const want = plain(isle.at);
			if (!want) continue;
			// Either the whole name, or as much of it as the column had
			// room for -- but never so little that two islands share it.
			const whole = want === seen ? 1 : 0;
			const least = dense(want) ? 3 : 6;
			const cut = seen.length >= least && want.startsWith(seen) ? seen.length / want.length : 0;
			// A name the engine misread rather than cut short. The cap has
			// to be above the threshold or every long name is "close":
			// editDistance stops counting at its cap and answers with it.
			const slack = Math.max(1, Math.floor(want.length * 0.12));
			const near = !whole && !cut && seen.length >= least && Math.abs(seen.length - want.length) <= slack
				&& editDistance(seen, want, slack + 1) <= slack ? 0.8 : 0;
			const score = Math.max(whole, cut, near);
			if (score > 0.42 && (!best || score > best.score)) {
				best = { isle, score, words: i + 1, right: line.words[i].x1 };
			}
		}
	}
	return best;
}

/**
 * The words of the barter window alone, out of a shot of anything.
 *
 * A player shoots the whole screen: the ship's window to the left of
 * the list, the chat log under it, the bags to the right. Read as one
 * page, those run together -- a line of the list began "167.0% Cannon
 * Reload Cooldown" and only then got to "Crow's Nest" -- and since an
 * island is looked for at the start of a line, not one row was found.
 * Oni's own screenshot, of the window this reader exists for, read as
 * "no barter rows".
 *
 * The window gives itself away by repeating itself. Every row says what
 * it costs in Parley, in the same column, and says how many exchanges
 * are left under the island, in another column further left. Whatever
 * the language, those are two stacks of one word each, in step with
 * each other down the page. The left stack is the island column, so
 * the window starts there; it starts a line or two above the top of
 * the stacks, where the first island's name is.
 *
 * A shot that is already only the window has the same two stacks at
 * its own left edge, and comes through untouched.
 */
export function windowWords(words, lh = lineHeight(words)) {
	const list = (words || []).filter(w => w && w.text);
	if (list.length < 8) return list;
	const midY = w => (w.y0 + w.y1) / 2;
	// Stacks: one word, four times or more, in one column.
	const by = new Map();
	for (const w of list) {
		const key = plain(w.text);
		if (key.length < (dense(key) ? 2 : 3)) continue;
		if (!by.has(key)) by.set(key, []);
		by.get(key).push(w);
	}
	const stacks = [];
	for (const [key, ws] of by) {
		if (ws.length < 4) continue;
		const xs = ws.map(w => w.x0).sort((a, b) => a - b);
		const col = xs[Math.floor(xs.length / 2)];
		const inCol = ws.filter(w => Math.abs(w.x0 - col) <= lh);
		if (inCol.length >= 4) stacks.push({ key, col, ws: inCol });
	}
	if (stacks.length < 2) return list;
	// The pair in step with each other: as many rows, at the same
	// heights, one to the left of the other.
	let best = null;
	for (const a of stacks) for (const b of stacks) {
		if (a === b || a.col >= b.col - lh * 3) continue;
		const paired = a.ws.filter(w => b.ws.some(v => Math.abs(midY(v) - midY(w)) <= lh * 0.8)).length;
		if (paired < 4) continue;
		if (!best || paired > best.paired || (paired === best.paired && a.col < best.a.col)) best = { a, b, paired };
	}
	if (!best) return list;
	// The left stack may be a name's second word -- "Island", after
	// "Racid" or "Paratama" -- whose column moves with the word before
	// it. Taken as the window's edge, it cut every island's name in half
	// and no row was read. The edge is where those runs of writing start:
	// from each word of the stack, walk left while the word before sits
	// close on the same line.
	const runStart = w => {
		let at = w;
		for (let hops = 0; hops < 6; hops++) {
			const prev = list
				.filter(v => v !== at && v.x1 <= at.x0 + lh * 0.2 && at.x0 - v.x1 <= lh * 0.8 && Math.abs(midY(v) - midY(at)) <= lh * 0.4)
				.sort((p, q) => q.x1 - p.x1)[0];
			if (!prev) break;
			at = prev;
		}
		return at.x0;
	};
	const starts = best.a.ws.map(runStart).sort((x, y) => x - y);
	const left = Math.min(best.a.col, starts[Math.floor(starts.length / 2)]) - lh * 0.75;
	const top = Math.min(...best.a.ws.map(midY)) - lh * 2.75;
	// And it ends a row below the last of them: room for a row the shot
	// cut in half, none for the chat log underneath.
	const rowStep = (Math.max(...best.a.ws.map(midY)) - Math.min(...best.a.ws.map(midY))) / Math.max(1, best.a.ws.length - 1);
	const bottom = Math.max(...best.a.ws.map(midY), ...best.b.ws.map(midY)) + Math.max(lh * 2, rowStep * 0.8);
	return list.filter(w => w.x0 >= left && midY(w) >= top && midY(w) <= bottom);
}

/**
 * The rows of the window, one an island, with everything written to
 * the right of each island gathered under it.
 *
 * A row is two or three lines tall -- the name of a long good wraps,
 * and "Exchanges Left" sits under the island -- so a row runs from its
 * own island's line to the next island's, and the last runs to the
 * bottom.
 */
export function rowsOf(all, isles) {
	const words = windowWords(all);
	if (!words.length) return [];
	const lh = lineHeight(words);
	const lines = linesOf(words, lh);
	const x0s = words.map(w => w.x0);
	const left = Math.min(...x0s) + (Math.max(...words.map(w => w.x1)) - Math.min(...x0s)) * 0.22;
	const heads = [];
	for (const line of lines) {
		const hit = isleAt(line, isles, { left });
		if (hit) heads.push({ ...hit, mid: line.mid });
	}
	return heads.map((head, i) => {
		const to = i + 1 < heads.length ? heads[i + 1].mid - lh * 0.5 : Infinity;
		const from = head.mid - lh * 0.5;
		// By where each word stands, not by the line it was filed under:
		// a line's height drifts as words join it, and a good's name a
		// few pixels above its island was being left out of the row.
		const said = words
			.filter(w => { const m = (w.y0 + w.y1) / 2; return m >= from - lh * 0.35 && m <= to; })
			// The island's own column is not part of the offer, and
			// neither is what the game prints under it.
			.filter(w => w.x1 > head.right + 2)
			.sort((a, b) => ((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2) > lh * 0.6 ? 1 : ((b.y0 + b.y1) / 2 - (a.y0 + a.y1) / 2) > lh * 0.6 ? -1 : a.x0 - b.x0);
		return { isle: head.isle, score: head.score, words: said, text: plain(said.map(w => w.text).join(' ')), tiers: said.map(w => tierIn(w.text)).filter(t => t !== null) };
	});
}

/* ------------------------------------------------------------------ *
 * which offer a row is
 * ------------------------------------------------------------------ */

/**
 * The exchange a row is showing, out of the ones its island deals.
 *
 * Both halves have to fit: an island's forty exchanges share their
 * goods about, and half a dozen of them pay the same thing for
 * different goods -- which is the difference between one layout and
 * another, and the whole point of reading the window at all. Where the
 * best fit is not clearly better than the next, the row says so and
 * the player is asked rather than told.
 */
export function offerOf(row, deals, { floor = 0.5, margin = 0.12 } = {}) {
	const here = deals.filter(d => d.npcId === row.isle.id);
	if (!here.length) return { ...row, offer: null, why: T('nothing known at this island') };
	const scored = here.map(d => {
		const give = cover(d.give, row.text);
		const recv = cover(d.item, row.text);
		// The tiers the row printed are cheap corroboration: a row that
		// says [Level 5] and [Level 6] cannot be a Level 2 exchange.
		const tiers = row.tiers.length ? row.tiers : null;
		const tier = tiers && !tiers.includes(tierOf(d.item)) && !tiers.includes(tierOf(d.give)) ? 0.75 : 1;
		return { deal: d, score: (give * 0.45 + recv * 0.55) * tier, give, recv };
	}).sort((a, b) => b.score - a.score);
	// An island can list one exchange twice -- the same good for the same
	// coin, at two ranges -- and those are one answer, not a tie.
	const best = scored[0];
	const next = scored.find(x => x.deal.give !== best.deal.give || x.deal.item !== best.deal.item);
	if (best.score < floor || best.give < 0.3 || best.recv < 0.3) {
		return { ...row, offer: null, near: scored.slice(0, 3), why: T('no exchange there fits what the row says') };
	}
	// An island that deals a pair both ways -- Plywood for Rock Salt,
	// Rock Salt for Plywood -- fits a row of either equally. The window
	// always prints what it takes before what it pays, so the order of
	// the two names in the row settles it.
	if (next && next.deal.give === best.deal.item && next.deal.item === best.deal.give) {
		const at = name => { const n = plain(name); return row.text.indexOf(n.slice(0, Math.min(n.length, dense(n) ? 2 : 4))); };
		const first = [best, next].find(x => at(x.deal.give) >= 0 && at(x.deal.item) >= 0 && at(x.deal.give) < at(x.deal.item));
		if (first) return { ...row, offer: first.deal, score: first.score, near: scored.slice(0, 3) };
	}
	if (next && best.score - next.score < margin) {
		return { ...row, offer: null, near: scored.slice(0, 3), why: T('two of its exchanges fit that equally well') };
	}
	return { ...row, offer: best.deal, score: best.score, near: scored.slice(0, 3) };
}

/** The tier a good's name carries, or null for a land good. */
function tierOf(name) {
	return tierIn(name);
}

/**
 * A screenshot of the barter window, read: one entry a row, each
 * either an offer or a reason it is not one.
 *
 * `isles` are the barterers (js/barter_npcs.js) and `deals` every
 * exchange the codex lists (barter-plan.js's `exchanges`). Both come
 * from the caller so this stays a pure function of what it is given.
 */
export function offersFrom(words, { isles, deals }) {
	return rowsOf(words, isles).map(row => offerOf(row, deals));
}

/**
 * The islands and exchanges as a client in another language prints
 * them, for reading a window in that language.
 *
 * `names` is a names pack (js/lang/names.<code>.json): the game's own
 * name for each English one, from BDOCodex. A name the pack lacks stays
 * English. Every copy keeps its English original as `en`, so what is
 * read can be handed back in the English the app keeps.
 */
export function localized({ isles, deals }, names = {}) {
	if (!names || !Object.keys(names).length) return { isles, deals };
	const there = en => names[en] || en;
	return {
		isles: isles.map(n => ({ ...n, at: there(n.at), en: n })),
		deals: deals.map(d => ({ ...d, give: there(d.give), item: there(d.item), en: d }))
	};
}

/** A row read in another language, in the app's English again. */
export function inEnglish(row) {
	const back = x => (x && x.en) || x;
	return {
		...row,
		isle: back(row.isle),
		offer: back(row.offer),
		near: (row.near || []).map(n => ({ ...n, deal: back(n.deal) }))
	};
}

/* ------------------------------------------------------------------ *
 * the figures in the window's head
 * ------------------------------------------------------------------ */

/**
 * A whole number as the window writes it, or null.
 *
 * The thousands are grouped, and which mark does the grouping is the
 * client's business -- a comma on the European service, a point or a
 * space elsewhere. What is not negotiable is the grouping itself: every
 * group after the first is exactly three digits. That is what keeps a
 * ship's "150.0" speed, or an island's "10/150" refreshes, from being
 * read as a number of Parley.
 */
export function wholeIn(text) {
	const t = String(text || '').trim();
	// Digits alone, however many -- the lifetime barter count is printed
	// ungrouped -- or grouped, with every group after the first exactly
	// three digits long.
	if (!/^\d+$/.test(t) && !/^\d{1,3}(?:[.,\u00a0\u202f ]\d{3})+$/.test(t)) return null;
	const n = Number(t.replace(/[.,\u00a0\u202f ]/g, ''));
	return Number.isFinite(n) ? n : null;
}

/**
 * The labels beside the lifetime barter count, where we know them.
 *
 * Only English is the client's own word, read off a screenshot. The
 * rest of the game's sixteen languages are not guessed at here: a wrong
 * word would put a wrong number into the sailor's profile, which is
 * worse than leaving the field alone. Parley below needs no vocabulary
 * at all, so it works in every language regardless.
 */
const BARTERS_LABELS = ['totalbarters', 'totalbarter'];

/**
 * What the head of the Barter Information window says about the sailor:
 * the Parley in the bar, and the lifetime barter count.
 *
 * Both are numbers the app otherwise asks a player to type in and then
 * watches go stale. A run laid against a full bar when the bar holds a
 * quarter of one is a run that strands a ship halfway up a chain, and
 * the count is what opens the next trade route -- and they are both
 * printed, in the same window the reader is already looking at.
 *
 * Parley is found without knowing the word for it. Every row of the
 * window says what its exchange costs in Parley, so whatever token
 * stands before a number on row after row *is* the word, in whatever
 * language the client runs in. The head says it once more, in its own
 * column away from that stack and above all of it -- so the odd one
 * out, higher than the rest and in a different column, is the sailor's
 * own bar.
 *
 * That column test is what makes a shot of the rows alone come back
 * with nothing rather than with the cost of the first exchange.
 */
export function figuresFrom(words, lh = lineHeight(words)) {
	const list = (words || []).filter(w => w && w.text);
	const out = { parley: null, barters: null };
	if (!list.length) return out;
	const midY = w => (w.y0 + w.y1) / 2;

	// The word standing to the right of this one, on the same row.
	//
	// Not the next word on the same *line*: a shot of the whole screen
	// puts the ship window, the chat log and the barter list side by
	// side, and gathering those into lines runs them together. Two boxes
	// at the same height with a small gap between them is the thing that
	// survives that, so it is what is asked.
	const nextTo = (w, want) => {
		let best = null;
		for (const x of list) {
			if (x === w || x.x0 < w.x1 - 1 || x.x0 - w.x1 > lh * 4) continue;
			if (Math.abs(midY(x) - midY(w)) > lh * 0.6) continue;
			if (!want(x)) continue;
			if (!best || x.x0 < best.x0) best = x;
		}
		return best;
	};

	// Every "<word> <number>" the window holds, gathered by the word.
	const byLabel = new Map();
	for (const w of list) {
		const key = plain(w.text);
		if (!key) continue;
		const num = nextTo(w, x => wholeIn(x.text) !== null);
		if (num) {
			if (!byLabel.has(key)) byLabel.set(key, []);
			byLabel.get(key).push({ value: wholeIn(num.text), x: w.x0, y: midY(w) });
		}
		// The lifetime count, by the only label we are sure of. Two words
		// in English, and whatever stands between them and the figure --
		// a "(?)", a colon -- is stepped over by looking to the right
		// rather than to the very next box.
		if (out.barters === null && BARTERS_LABELS.some(l => l.startsWith(key) && l !== key)) {
			const second = nextTo(w, x => BARTERS_LABELS.includes(key + plain(x.text)));
			const n = second && nextTo(second, x => wholeIn(x.text) !== null);
			if (n) out.barters = wholeIn(n.text);
		}
	}

	// The word that stands before a number on row after row is the word
	// for Parley, whatever language the client runs in.
	let stack = null;
	for (const hits of byLabel.values()) {
		if (hits.length < 4) continue;
		if (!stack || hits.length > stack.length) stack = hits;
	}
	if (stack) {
		// The column the rows keep it in, and the top of that stack. The
		// head says it once more, off to one side and above all of them.
		const column = stack.map(h => h.x).sort((a, b) => a - b)[Math.floor(stack.length / 2)];
		const rows = stack.filter(h => Math.abs(h.x - column) <= lh);
		const top = Math.min(...rows.map(h => h.y));
		const odd = stack
			.filter(h => Math.abs(h.x - column) > lh && h.y < top - lh)
			.sort((a, b) => a.y - b.y)[0];
		if (odd) out.parley = odd.value;
	}
	return out;
}
