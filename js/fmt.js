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
	if (tag !== fmtTag) { fmtTag = tag; fmts = new Map(); }
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

/**
 * Read a count the way a player writes one: "12,000", "12.000",
 * "12 000", "12'000", "4k", "1.5m", "2,25b". A count has no fraction, so
 * every mark inside it is grouping and is dropped -- wherever it sits,
 * whatever the app's language, whatever the player pasted. The one
 * exception is a k, m or b on the end: there the mark is the decimal
 * point, since that is the only reason to type one. Returns null for
 * anything that is not a number, so a typo leaves the stored value alone.
 */
export function parseAmount(raw, { signed = false } = {}) {
	let t = String(raw).normalize('NFKC').trim().toLowerCase().replace(/[\s_'\u2019\u02bc]/g, '');
	if (!t) return 0;
	// A leading minus is a count taken away, where the caller allows
	// one: the trip log promises it, the stock fields do not.
	let sign = 1;
	if (/^[-\u2212]/.test(t)) {
		if (!signed) return null;
		sign = -1;
		t = t.slice(1);
	}
	const suffix = (t.match(/[kmb]$/) || [''])[0];
	const body = suffix ? t.slice(0, -1).replace(',', '.') : t.replace(/[.,]/g, '');
	if (!/^\d*\.?\d+$/.test(body) || (!suffix && body.includes('.'))) return null;
	const n = Math.round(Number(body) * ({ k: 1e3, m: 1e6, b: 1e9 }[suffix] || 1));
	// A figure too big to be a count is a slip, and is treated like any
	// other gibberish -- kept as Infinity it would vanish on reload.
	if (!Number.isFinite(n) || n > AMOUNT_CAP) return null;
	return sign * n;
}

/**
 * Read a figure with a fraction the way the game prints one: "1,628.7",
 * "1.628,7", "1 628,7", "3,5", "134". Thousands come in threes and a
 * fraction has at most two digits, so the last mark with one or two
 * digits after it is the decimal point and every other mark is
 * grouping -- in any language. Null for anything else.
 */
export function figure(raw) {
	const s = String(raw).normalize('NFKC').replace(/\s/g, '');
	const m = /^(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(s);
	if (!m) return null;
	return Number(m[1].replace(/[.,]/g, '') + (m[2] ? `.${m[2]}` : ''));
}

/** More than any inventory holds; past it a typed number is a typo. */
export const AMOUNT_CAP = 1e15;
