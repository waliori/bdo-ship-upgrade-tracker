// A small burst of light for a thing done: a good put in the bags, a
// build taken on, a part made, a quest claimed, a stop ticked off on a
// run, a trip recorded. The store says when (an `accomplished` event
// on the document, from a commit that gained something) and the burst
// goes off where the last tap landed, so it feels like the tap did
// it. Under prefers-reduced-motion it is a single soft glow instead.

let last = null;   // where the last pointer went down, and when
if (typeof document !== 'undefined') {
	document.addEventListener('pointerdown', e => { last = { x: e.clientX, y: e.clientY, t: Date.now() }; }, { passive: true, capture: true });
	document.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { const el = document.activeElement; if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); last = { x: r.left + r.width / 2, y: r.top + r.height / 2, t: Date.now() }; } } }, { passive: true, capture: true });
	document.addEventListener('accomplished', e => cheer(e.detail || {}));
}

const COLOURS = ['#e8b661', '#7ef0d4', '#58a8e8', '#f6f0d8', '#e8905d'];

/** The burst, at `x, y` when given, else where the last tap landed
 *  within the last two seconds, else low in the middle of the screen. */
export function cheer({ x, y, big = false } = {}) {
	if (typeof document === 'undefined') return;
	const at = Number.isFinite(x) && Number.isFinite(y) ? { x, y }
		: last && Date.now() - last.t < 2000 ? last
			: { x: window.innerWidth / 2, y: window.innerHeight * 0.7 };
	const host = document.createElement('div');
	host.className = 'cheer';
	host.style.left = `${at.x}px`;
	host.style.top = `${at.y}px`;
	const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if (still) {
		host.classList.add('glow');
	} else {
		const n = big ? 22 : 14;
		for (let i = 0; i < n; i++) {
			const p = document.createElement('i');
			const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
			const d = (big ? 70 : 46) + Math.random() * (big ? 60 : 36);
			p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
			p.style.setProperty('--dy', `${Math.sin(a) * d - 18}px`);
			p.style.setProperty('--c', COLOURS[i % COLOURS.length]);
			p.style.setProperty('--s', `${4 + Math.random() * 4}px`);
			p.style.animationDelay = `${Math.random() * 60}ms`;
			host.appendChild(p);
		}
	}
	document.body.appendChild(host);
	setTimeout(() => host.remove(), still ? 700 : 1100);
}
