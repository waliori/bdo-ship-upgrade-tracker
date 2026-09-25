// The inventory window's two bars, read off a screenshot.
//
// A barter run that uses the sailor's own bag as a second hold needs to
// know what the bag can still take, and the game says it at the foot of
// the Inventory window: "Inventory Slot 134/192" and "Weight 1,628.7 /
// 2,779 LT". The labels are in the client's language, the figures are
// not, so the figures are what is looked for: a fraction ending in LT is
// the weight, a small whole-number fraction the slots.
//
// Pure: the words the engine read (shot-reader.js's readWords) come in,
// the four figures go out, or null for any that was not found.

/** A figure as the game prints it: "1,628.7", "1.628,7", "2,779",
 *  "134". Thousands in threes, and at most two decimals. */
export function figure(raw) {
	const s = String(raw).replace(/\s/g, '');
	const m = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(s);
	if (!m) return null;
	return Number(m[1].replace(/[.,]/g, '') + (m[2] ? `.${m[2]}` : ''));
}

/** The words in rows, top to bottom, each row's words left to right. */
function rows(words) {
	const out = [];
	for (const w of [...words].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1))) {
		const y = (w.y0 + w.y1) / 2, h = Math.max(1, w.y1 - w.y0);
		const row = out.find(r => Math.abs(r.y - y) <= Math.max(r.h, h) * 0.6);
		if (row) { row.words.push(w); row.y = (row.y * (row.words.length - 1) + y) / row.words.length; row.h = Math.max(row.h, h); }
		else out.push({ y, h, words: [w] });
	}
	return out.map(r => ({ y: r.y, text: r.words.sort((a, b) => a.x0 - b.x0).map(w => w.text).join(' ') }));
}

/**
 * The weight and the slots in `words`: { now, max, used, slots }, each
 * null when it was not read.
 *
 * The LT after the weight is often read as "1T" or "IT" and run into
 * the figure -- "2,7791T" -- so one such letter before the T is taken
 * off, unless that leaves a figure that cannot be one, or a limit the
 * weight carried is far past: an inventory holds at most 170% of it.
 */
export function bagFigures(words) {
	const out = { now: null, max: null, used: null, slots: null };
	const lines = rows(words || []);
	let weightAt = null;
	for (const line of lines) {
		const m = /(\d[\d.,]*)\s*\/\s*([\d.,\s]*?\d[\d.,]*?)\s*([Ll1I|]?)\s*T(?![a-z])/.exec(line.text);
		if (!m) continue;
		const now = figure(m[1]);
		if (now === null) continue;
		const stripped = figure(m[2]), whole = m[3] ? figure(m[2] + m[3]) : null;
		const fits = max => max !== null && max > 0 && now <= max * 1.7 + 1e-6;
		const max = fits(stripped) ? stripped : fits(whole) ? whole : null;
		if (max === null) continue;
		out.now = now; out.max = max; weightAt = line.y;
		break;
	}
	// The slots: a whole-number fraction no bigger than an inventory
	// gets, the one nearest the weight when there are several.
	let best = null;
	for (const line of lines) {
		for (const m of line.text.matchAll(/(?:^|[^\d.,])(\d{1,3})\s*\/\s*(\d{2,3})(?![\d.,]|\s*[Ll1I|]?T)/g)) {
			const used = Number(m[1]), slots = Number(m[2]);
			if (!(slots >= 8 && slots <= 400 && used <= slots)) continue;
			const d = weightAt === null ? 0 : Math.abs(line.y - weightAt);
			if (!best || d < best.d) best = { used, slots, d };
		}
	}
	if (best) { out.used = best.used; out.slots = best.slots; }
	return out;
}

/** What the bag takes on a run: 170% of the limit less what it holds,
 *  and the slots still empty; null for what is not known. */
export function bagRoom({ now, max, used, slots } = {}) {
	return {
		lt: max > 0 && now >= 0 ? Math.max(0, Math.floor(max * 1.7 - now)) : null,
		slots: slots > 0 && used >= 0 ? Math.max(0, slots - used) : null
	};
}
