// Text the interface is made of: escaping, and numbers as a player
// writes them. Shared by ui.js and sync.js, which had drifted into
// carrying their own copies of esc().

/** HTML-escape anything headed for innerHTML. */
export const esc = s => String(s).replace(/[&<>"']/g, c =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A whole number with thousands separators: 12,000. */
export const F = n => Math.round(n).toLocaleString();

/** A big number the way a chip has room for: 1.5b, 400m, 12,000. */
export const FC = n => n >= 1e9
	? `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}b`
	: n >= 1e6
		? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m`
		: F(n);

/**
 * Read a quantity the way a player would write one: "1.5b", "400m",
 * "12,000". Returns null for anything that is not a number at all, so a
 * typo leaves the stored value alone.
 */
export function parseAmount(raw) {
	const t = String(raw).trim().toLowerCase().replace(/[\s,_]/g, '');
	if (!t) return 0;
	const m = t.match(/^([0-9]*\.?[0-9]+)([kmb])?$/);
	if (!m) return null;
	const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
	return Math.max(0, Math.round(Number(m[1]) * mult));
}
