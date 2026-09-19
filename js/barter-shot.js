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

import { editDistance, lineHeight } from './sailor-shot.js';

/**
 * A name as it can be compared: no tier, no punctuation, no case, no
 * spaces.
 *
 * The tier goes because the window prints it on both sides of every
 * row and it tells two items apart about as well as the word "the".
 * The spaces go because the engine loses and invents them -- "Golden
 * Sand Ring" comes back as "Golden SandRing" as often as not.
 */
export function plain(text) {
	return String(text || '')
		.replace(/\[[^\]]*\]/g, ' ')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

/** The tier a piece of text names, if it names one. */
export function tierIn(text) {
	const m = /\[\s*level\s*([1-7])\s*\]/i.exec(String(text || ''));
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
		if (run < (pieces ? 5 : 3)) break;
		got += run;
		at += run;
		pieces++;
	}
	// A short name has to be there in full: "Beer" will find "bee" in
	// something, given a row of words to look through.
	if (n.length <= 6 && got < n.length) return 0;
	// And a dozen characters is as much as any name needs to be told
	// from the others an island deals -- which is the whole reason a
	// name the window cut short reads as surely as a whole one.
	return Math.min(1, got / Math.min(n.length, 12));
}

/* ------------------------------------------------------------------ *
 * the rows of the window
 * ------------------------------------------------------------------ */

/** Words gathered into lines of writing, in reading order. */
export function linesOf(words, lh = lineHeight(words)) {
	const lines = [];
	for (const w of [...words].sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)) {
		const mid = (w.y0 + w.y1) / 2;
		const line = lines.find(l => Math.abs(l.mid - mid) < lh * 0.6);
		if (line) {
			line.words.push(w);
			line.mid = (line.mid * (line.words.length - 1) + mid) / line.words.length;
		} else lines.push({ mid, words: [w] });
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
	for (let i = 0; i < Math.min(4, line.words.length); i++) {
		text += line.words[i].text;
		const seen = plain(text);
		if (!seen) continue;
		for (const isle of isles) {
			const want = plain(isle.at);
			if (!want) continue;
			// Either the whole name, or as much of it as the column had
			// room for -- but never so little that two islands share it.
			const whole = want === seen ? 1 : 0;
			const cut = seen.length >= 6 && want.startsWith(seen) ? seen.length / want.length : 0;
			// A name the engine misread rather than cut short. The cap has
			// to be above the threshold or every long name is "close":
			// editDistance stops counting at its cap and answers with it.
			const slack = Math.max(1, Math.floor(want.length * 0.12));
			const near = !whole && !cut && seen.length >= 6 && Math.abs(seen.length - want.length) <= slack
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
 * The rows of the window, one an island, with everything written to
 * the right of each island gathered under it.
 *
 * A row is two or three lines tall -- the name of a long good wraps,
 * and "Exchanges Left" sits under the island -- so a row runs from its
 * own island's line to the next island's, and the last runs to the
 * bottom.
 */
export function rowsOf(words, isles) {
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
		const said = [];
		for (const line of lines) {
			if (line.mid < from || line.mid > to) continue;
			for (const w of line.words) {
				// The island's own column is not part of the offer, and
				// neither is what the game prints under it.
				if (w.x1 <= head.right + 2) continue;
				said.push(w);
			}
		}
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
	if (!here.length) return { ...row, offer: null, why: 'nothing known at this island' };
	const scored = here.map(d => {
		const give = cover(d.give, row.text);
		const recv = cover(d.item, row.text);
		// The tiers the row printed are cheap corroboration: a row that
		// says [Level 5] and [Level 6] cannot be a Level 2 exchange.
		const tiers = row.tiers.length ? row.tiers : null;
		const tier = tiers && !tiers.includes(tierOf(d.item)) && !tiers.includes(tierOf(d.give)) ? 0.75 : 1;
		return { deal: d, score: (give * 0.45 + recv * 0.55) * tier, give, recv };
	}).sort((a, b) => b.score - a.score);
	const [best, next] = scored;
	if (best.score < floor || best.give < 0.3 || best.recv < 0.3) {
		return { ...row, offer: null, near: scored.slice(0, 3), why: 'no exchange there fits what the row says' };
	}
	if (next && best.score - next.score < margin) {
		return { ...row, offer: null, near: scored.slice(0, 3), why: 'two of its exchanges fit that equally well' };
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
