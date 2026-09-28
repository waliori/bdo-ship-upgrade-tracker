// Glance mode and the full view, one into the other: the same stop drawn
// large or beside the rest of the run. Swapped outright it read as a
// different page; now each part -- the place, the trade, the figures,
// the press, the clock -- travels from where it stood to where it
// stands, the panel grows or shrinks behind them, and what only the one
// view has fades in. With reduced motion asked for it is swapped as before.

const PARTS = ['.cockpit-head', '.cockpit-clock', '.cockpit-place', '.cockpit-trade', '.cockpit-figs', '.cockpit-voucher', '.cockpit-press', '.cockpit-ask', '.hold-slots', '.cockpit-foot'];
// What sits inside a part's wrapper and only the full view has.
const FADE = ['.cockpit-who'];
// What each view words differently: faded in rather than moved.
const AGAIN = ['.cockpit-under'];
const MS = 460;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

const panelOf = () => document.querySelector('section.panel.cockpit:not(.compact)');
// A line of text is measured by its text, not its box: the place is a
// block the width of the panel either way, left in one view and centred
// in the other.
function rectOf(el) {
	if (el.matches('.cockpit-place') && el.firstChild) {
		const r = document.createRange();
		r.selectNodeContents(el);
		return r.getBoundingClientRect();
	}
	return el.getBoundingClientRect();
}

export function morphCockpit(change) {
	const panel = panelOf();
	const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (!panel || still || typeof panel.animate !== 'function') { change(); return; }
	const first = new Map();
	for (const sel of PARTS) { const el = document.querySelector(sel); if (el) first.set(sel, rectOf(el)); }
	const box = panel.getBoundingClientRect();
	const loose = `.cockpit-grid > *, .cockpit-col > *, section.panel.cockpit .panel-body > *, ${FADE.join(', ')}`;
	const had = new Set([...document.querySelectorAll(loose)].map(e => e.className));
	change();
	const now = panelOf();
	if (!now) return;
	const to = now.getBoundingClientRect();
	// The panel's face, drawn behind its parts and taken from the old
	// size to the new; the panel's own is hidden meanwhile.
	const cs = getComputedStyle(now);
	const face = document.createElement('div');
	Object.assign(face.style, { position: 'absolute', zIndex: '-1', pointerEvents: 'none', background: cs.backgroundColor, backgroundImage: cs.backgroundImage, border: cs.border, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow, left: '0', top: '0', width: `${to.width}px`, height: `${to.height}px`, boxSizing: 'border-box' });
	const keep = { position: now.style.position, isolation: now.style.isolation, overflow: now.style.overflow, background: now.style.background, borderColor: now.style.borderColor, boxShadow: now.style.boxShadow };
	if (cs.position === 'static') now.style.position = 'relative';
	Object.assign(now.style, { isolation: 'isolate', overflow: 'visible', background: 'transparent', borderColor: 'transparent', boxShadow: 'none' });
	now.prepend(face);
	const dx = box.left - to.left, dy = box.top - to.top;
	const runs = [face.animate([
		{ transform: `translate(${dx}px,${dy}px)`, width: `${box.width}px`, height: `${box.height}px` },
		{ transform: 'none', width: `${to.width}px`, height: `${to.height}px` }
	], { duration: MS, easing: EASE })];
	for (const [sel, a] of first) {
		const el = document.querySelector(sel);
		if (!el) continue;
		const b = rectOf(el);
		if (!b.width || !b.height) continue;
		// One scale for both ways, from the heights: text stretched one
		// way only reads as a squashed picture of text.
		const k = Math.max(0.4, Math.min(2.5, a.height / b.height));
		if (Math.abs(k - 1) < 0.08) {
			// A part the same size in both, only wider or narrower -- the
			// head, the clock, a row of figures: moved by its left edge,
			// and what it gains in width let out from under a clip.
			const mx = a.left - b.left, my = a.top - b.top, cut = Math.max(0, b.width - a.width);
			if (Math.abs(mx) < 1 && Math.abs(my) < 1 && !cut) continue;
			runs.push(el.animate([
				{ transform: `translate(${mx}px,${my}px)`, clipPath: `inset(0 ${cut}px 0 0)` },
				{ transform: 'none', clipPath: 'inset(0 0 0 0)' }
			], { duration: MS, easing: EASE }));
			continue;
		}
		const mx = a.left + a.width / 2 - (b.left + b.width / 2), my = a.top + a.height / 2 - (b.top + b.height / 2);
		// Scaled about the middle of what is drawn, which for the place is
		// its text and not its box.
		const at = el.getBoundingClientRect(), origin = `${b.left - at.left + b.width / 2}px ${b.top - at.top + b.height / 2}px`;
		runs.push(el.animate([
			{ transform: `translate(${mx}px,${my}px) scale(${k})`, transformOrigin: origin },
			{ transform: 'none', transformOrigin: origin }
		], { duration: MS, easing: EASE }));
	}
	// What the other view did not have comes in once the rest has moved.
	for (const el of document.querySelectorAll(loose)) {
		// A column that holds the panel is not new, whatever it is called.
		const again = AGAIN.some(sel => el.matches(sel));
		if ((had.has(el.className) && !again) || el.contains(now) || PARTS.some(sel => el.matches(sel) || el.querySelector(sel))) continue;
		runs.push(el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: MS * 0.7, delay: MS * 0.45, easing: 'ease-out', fill: 'backwards' }));
	}
	Promise.all(runs.map(r => r.finished.catch(() => {}))).then(() => {
		face.remove();
		if (now.isConnected) Object.assign(now.style, keep);
	});
}
