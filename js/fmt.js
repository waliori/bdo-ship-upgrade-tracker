// Text the interface is made of: escaping, and numbers as a player
// writes them. Shared by ui.js and sync.js, which had drifted into
// carrying their own copies of esc().

import { locale } from './i18n.js';

/** HTML-escape anything headed for innerHTML. */
export const esc = s => String(s).replace(/[&<>"']/g, c =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Numbers are written the way the APP's language writes them, not the
// browser's: a French page reads "12 000" even on an American laptop, so
// a figure never sits in a sentence punctuated another country's way.
// The language can change under a running page (the Menu's selector), so
// the formatters are rebuilt when locale() moves -- one string compare a
// call, and still one formatter per shape rather than toLocaleString()'s
// new one every call, which a redraw would pay by the hundred.
let fmtTag = null;
let fmts = new Map();
function numberFormat(digits) {
	const tag = locale();
	if (tag !== fmtTag) { fmtTag = tag; fmts = new Map(); parts = null; }
	let f = fmts.get(digits);
	if (!f) {
		try { f = new Intl.NumberFormat(tag, { maximumFractionDigits: digits }); } catch { f = new Intl.NumberFormat('en', { maximumFractionDigits: digits }); }
		fmts.set(digits, f);
	}
	return f;
}

/** A whole number with thousands separators: 12,000 -- or 12.000, or
 *  12 000, as the app's language groups it. */
export const F = n => numberFormat(0).format(Math.round(n));

/** A figure to at most `digits` decimals, grouped like F(): a weight to
 *  the tenth ("1,234.5 LT", "1 234,5 LT"), a speed's 107.5%. Trailing
 *  zeros are dropped, so a round figure reads as a whole one. */
export const FD = (n, digits = 1) => numberFormat(digits).format(n);

/** A big number the way a chip has room for: 1.5b, 400m, 12,000. */
// The billions branch opens where the millions branch would round itself
// to "1000.0m": 999,950,000 must read "1b", never "1000m".
// Negative amounts -- a run that costs more than it sells -- read the
// same way, with a true minus in front.
// The decimal point is the language's own: "1,5b" in French, which
// parseAmount reads back as one and a half billion.
export const FC = n => (n < 0 ? `−${FC(-n)}` : n >= 999.95e6
	? `${FD(Math.round(n / 1e7) / 100, 2)}b`
	: n >= 1e6
		? `${FD(Math.round(n / 1e5) / 10, 1)}m`
		: F(n));

// What the app's language prints between and inside numbers, so that
// retyping exactly what F() displayed always round-trips. German shows
// 12000 as "12.000"; reading that back with a hard-coded "." decimal
// point would store 12 -- a thousandfold loss. Rebuilt with the
// formatters when the language changes.
let parts = null;
function localeParts() {
	numberFormat(1);
	if (parts) return parts;
	try {
		const p = numberFormat(1).formatToParts(12345.6);
		parts = {
			group: p.find(x => x.type === 'group')?.value || ',',
			decimal: p.find(x => x.type === 'decimal')?.value || '.'
		};
	} catch {
		parts = { group: ',', decimal: '.' };
	}
	return parts;
}

/**
 * Read a quantity the way a player would write one: "1.5b", "400m",
 * "12,000" -- or "12.000", "12 000", "12'000", wherever that is how
 * numbers are written. Returns null for anything that is not a number at
 * all, so a typo leaves the stored value alone.
 *
 * The app's language is not a promise about the keyboard: a French
 * sailor may paste "1,000,000" off an English guide, a Swiss one types
 * "1'000'000". So every common form is read, and the language only
 * breaks a tie. The rules, in order:
 *
 *   1. Spaces of every kind (the plain one, French's narrow no-break
 *      space, Russian's no-break space), apostrophes and underscores
 *      are grouping, and simply dropped. Full-width digits and marks,
 *      as a Japanese or Chinese IME types them, read as plain ones.
 *   2. With both "." and "," the last one is the decimal point and the
 *      other the grouping: "1.234,5" and "1,234.5" are both 1234.5. The
 *      grouping must then come in threes, or it is a typo.
 *   3. One mark used twice or more ("1.000.000", "1,000,000") can only
 *      be grouping, and must come in threes.
 *   4. One mark used once ("1.5", "1,500"):
 *        - not followed by exactly three digits, or after a leading
 *          zero or more than three digits ("1,5", "0.500", "1234.567"):
 *          a decimal point -- grouping is never shaped like that;
 *        - with k, m or b after it ("1,500k"): a decimal point, since a
 *          short form is the short way and nobody groups inside one;
 *        - in a whole-number field -- silver, Parley, any count, which
 *          is every field unless the caller says `decimals` -- grouping:
 *          a count has no thousandths, so "1.500" and "1,500" are both
 *          fifteen hundred, whichever language the app is in;
 *        - in a field that takes decimals, the language decides: its
 *          own decimal mark is a decimal point ("1,500" is 1.5 in
 *          French), the other one is grouping.
 *
 * Whole-number fields round what they read; `decimals` keeps the
 * fraction.
 */
export function parseAmount(raw, { signed = false, decimals = false } = {}) {
	let t = String(raw).normalize('NFKC').trim().toLowerCase().replace(/[\s_'\u2019\u02bc]/g, '');
	if (!t) return 0;
	// A leading minus is a count taken away, where the caller allows
	// one: the trip log promises it, the stock fields do not.
	let sign = 1;
	if (/^[-\u2212]/.test(t)) {
		if (!signed) return null;
		sign = -1;
		t = t.slice(1);
		if (!t) return null;
	}

	const suffix = (t.match(/[kmb]$/) || [''])[0];
	let body = suffix ? t.slice(0, -1) : t;
	// Grouping in threes after a first group of one to three digits.
	const grouped = (s, sep) => {
		const pieces = s.split(sep);
		return /^[0-9]{1,3}$/.test(pieces[0]) && pieces.slice(1).every(p => /^[0-9]{3}$/.test(p));
	};
	const hasDot = body.includes('.');
	const hasComma = body.includes(',');
	if (hasDot && hasComma) {
		const decimal = body.lastIndexOf('.') > body.lastIndexOf(',') ? '.' : ',';
		const group = decimal === '.' ? ',' : '.';
		const at = body.lastIndexOf(decimal);
		const whole = body.slice(0, at);
		if (whole.includes(decimal) || !grouped(whole, group)) return null;
		body = `${whole.split(group).join('')}.${body.slice(at + 1)}`;
	} else if (hasDot || hasComma) {
		const sep = hasDot ? '.' : ',';
		const pieces = body.split(sep);
		if (pieces.length > 2) {
			// "1.234.567" can only be grouping; anything else shaped like
			// this is a typo, not a number.
			if (!grouped(body, sep)) return null;
			body = pieces.join('');
		} else {
			const [head, tail] = pieces;
			const couldGroup = grouped(body, sep) && !/^0/.test(head) && !suffix;
			const grouping = couldGroup && (!decimals || sep !== localeParts().decimal);
			body = grouping ? head + tail : `${head}.${tail}`;
		}
	}

	if (!/^([0-9]*\.?[0-9]+)$/.test(body)) return null;
	const mult = { k: 1e3, m: 1e6, b: 1e9 }[suffix] || 1;
	const v = Number(body) * mult;
	const n = decimals ? v : Math.round(v);
	// A figure too big to be a count is a slip, and is treated like any
	// other gibberish -- kept as Infinity it would vanish on reload.
	if (!Number.isFinite(n) || n > AMOUNT_CAP) return null;
	return sign * Math.max(0, n);
}

/** More than any inventory holds; past it a typed number is a typo. */
export const AMOUNT_CAP = 1e15;
