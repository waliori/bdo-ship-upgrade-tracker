// Text the interface is made of: escaping, and numbers as a player
// writes them. Shared by ui.js and sync.js, which had drifted into
// carrying their own copies of esc().

/** HTML-escape anything headed for innerHTML. */
export const esc = s => String(s).replace(/[&<>"']/g, c =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A whole number with thousands separators: 12,000. */
export const F = n => Math.round(n).toLocaleString();

/** A big number the way a chip has room for: 1.5b, 400m, 12,000. */
// The billions branch opens where the millions branch would round itself
// to "1000.0m": 999,950,000 must read "1b", never "1000m".
export const FC = n => n >= 999.95e6
	? `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}b`
	: n >= 1e6
		? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m`
		: F(n);

// What this browser's locale prints between and inside numbers, so that
// retyping exactly what F() displayed always round-trips. A German
// browser shows 12000 as "12.000"; reading that back with a hard-coded
// "." decimal point would store 12 -- a thousandfold loss.
const localeParts = (() => {
	try {
		const parts = new Intl.NumberFormat().formatToParts(12345.6);
		return {
			group: parts.find(p => p.type === 'group')?.value || ',',
			decimal: parts.find(p => p.type === 'decimal')?.value || '.'
		};
	} catch {
		return { group: ',', decimal: '.' };
	}
})();

/**
 * Read a quantity the way a player would write one: "1.5b", "400m",
 * "12,000" -- or "12.000" where that is how numbers are written. Returns
 * null for anything that is not a number at all, so a typo leaves the
 * stored value alone.
 *
 * "." and "," are each a decimal point in one country and a thousands
 * separator in another, so which is which is settled per string: with
 * both present the last one is the decimal point; a lone one followed by
 * exactly three digits once could be either, and the browser's locale
 * casts the deciding vote.
 */
export function parseAmount(raw) {
	let t = String(raw).trim().toLowerCase().replace(/[\s_']/g, '');
	if (!t) return 0;

	const hasDot = t.includes('.');
	const hasComma = t.includes(',');
	if (hasDot && hasComma) {
		const decimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
		const group = decimal === '.' ? ',' : '.';
		t = t.split(group).join('').replace(decimal, '.');
	} else if (hasDot || hasComma) {
		const sep = hasDot ? '.' : ',';
		const pieces = t.replace(/[kmb]$/, '').split(sep);
		const groupsOk = pieces[0].length >= 1 && pieces[0].length <= 3 &&
			pieces.slice(1).every(p => p.length === 3);
		if (pieces.length > 2) {
			// "1.234.567" can only be grouping; anything else shaped like
			// this is a typo, not a number.
			if (!groupsOk) return null;
			t = t.split(sep).join('');
		} else {
			const grouping = groupsOk && sep === localeParts.group;
			t = grouping ? t.split(sep).join('') : t.replace(sep, '.');
		}
	}

	const m = t.match(/^([0-9]*\.?[0-9]+)([kmb])?$/);
	if (!m) return null;
	const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
	return Math.max(0, Math.round(Number(m[1]) * mult));
}
