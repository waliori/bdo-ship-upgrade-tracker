// The sailing clock as a picture: the sailor's own ship crossing the leg
// it is on, on a sea that moves, to a pier with a lamp at the end.
//
// It follows the clock and never runs one of its own. How far along the
// leg the ship is, is how far the clock is into it; when the leg's time
// comes the ship glides in and makes fast. Said "arrived" early, or
// traded before the clock got there, it makes for the pier at speed --
// a wake, spray at the bow, a splash, and a small celebration -- and the
// next leg fades in once Traded is pressed.
//
// The screen is drawn again whole, often, so the scene's state lives
// here and is handed to whatever canvas is on the page now: a redraw
// does not put the ship back at the start. With reduced motion asked
// for, the ship is simply where the clock says, on a still sea.

import { timerState } from './sail-timer.js';

const H_SEGMENTS = 160;
let canvas = null;
let raf = 0;
let last = 0;
let s = null;          // the scene: the sea, the ship, what is in the air
let img = null;
let imgSrc = '';
let readAt = 0;
let clock = null;      // the timer as last read
let palette = null;

const still = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function colours() {
	const cs = getComputedStyle(document.documentElement);
	const g = (n, f) => cs.getPropertyValue(n).trim() || f;
	return {
		blue: g('--blue-rgb', '90,140,190'), deep: g('--deep-rgb', '10,18,30'), shade: g('--shade-rgb', '5,10,18'),
		teal: g('--teal', '#5fd0b3'), gold: g('--gold', '#e0b35a'), ink: g('--ink-faint', '#5b6b7c'), sky: g('--panel-inset', '#0b1220')
	};
}

function fresh(run) {
	return {
		run, t: 0, h: new Float32Array(H_SEGMENTS), v: new Float32Array(H_SEGMENTS),
		drops: [], foam: [], sparks: [], rings: [],
		px: 0, rv: 0, mode: 'run', leg: -1, arrivedAt: null, fade: 1,
		bob: { y: 0, vy: 0, rot: 0, vr: 0 }
	};
}

/* ------------------------------------------------------------------ *
 * where the clock is
 * ------------------------------------------------------------------ */

/**
 * What the clock says of the leg: which one, how far into it (0 to 1),
 * and whether the ship is at its stop -- the clock has reached it, or
 * the sailor said so.
 */
function legOf(t) {
	if (!t) return null;
	if (!t.marks.length) return { leg: 0, p: Math.min(1, t.ran / Math.max(1, t.seconds)), there: t.over, count: 1 };
	const i = Math.min(t.done, t.marks.length - 1);
	const prev = t.done > 0 ? t.marks[t.done - 1] : null;
	const start = prev ? prev.at + prev.hold : 0;
	const end = t.marks[i].at;
	const there = !!t.wait || t.reached > t.done || t.done >= t.marks.length;
	const p = there ? 1 : Math.max(0, Math.min(1, (t.ran - start) / Math.max(1, end - start)));
	return { leg: t.done, p, there, count: t.marks.length };
}

/* ------------------------------------------------------------------ *
 * the sea
 * ------------------------------------------------------------------ */

const W = () => s.W, H = () => s.H;
const colX = i => (i / (H_SEGMENTS - 1)) * W();
const base = () => H() * 0.66;
const ambient = (x, t) => Math.sin(x * 0.02 + t * 1.1) * 1.1 + Math.sin(x * 0.045 - t * 1.6) * 0.6 + Math.sin(x * 0.008 + t * 0.5) * 0.9;
const surf = i => base() + s.h[i] + (still() ? 0 : ambient(colX(i), s.t));
function surfAt(x) {
	const f = (Math.max(0, Math.min(W() - 1, x)) / W()) * (H_SEGMENTS - 1);
	const i = Math.max(0, Math.min(H_SEGMENTS - 2, Math.floor(f))), r = f - i;
	return surf(i) * (1 - r) + surf(i + 1) * r;
}
const idx = x => Math.max(0, Math.min(H_SEGMENTS - 1, Math.round((x / W()) * (H_SEGMENTS - 1))));
function geo() {
	// As tall as fits above the waterline, masts and all: the picture
	// stands 0.85 of its height above the ship's waterline.
	const sh = Math.min(H() * 0.98, (base() - 2) / 0.85), sw = sh, pierX = W() - 20, x0 = sw * 0.4, x1 = pierX - sw * 0.42;
	return { sh, sw, pierX, x0, x1, L: x1 - x0, cx: x0 + s.px * (x1 - x0) };
}
function sim(h, v) {
	const L = new Float32Array(H_SEGMENTS), R = new Float32Array(H_SEGMENTS);
	for (let i = 0; i < H_SEGMENTS; i++) v[i] += -h[i] * 0.02 - v[i] * 0.04;
	for (let p = 0; p < 5; p++) {
		for (let i = 0; i < H_SEGMENTS; i++) {
			if (i > 0) { L[i] = 0.14 * (h[i] - h[i - 1]); v[i - 1] += L[i]; }
			if (i < H_SEGMENTS - 1) { R[i] = 0.14 * (h[i] - h[i + 1]); v[i + 1] += R[i]; }
		}
		for (let i = 0; i < H_SEGMENTS; i++) { if (i > 0) h[i - 1] += L[i]; if (i < H_SEGMENTS - 1) h[i + 1] += R[i]; }
	}
	for (let i = 0; i < H_SEGMENTS; i++) { h[i] += v[i]; if (h[i] > 7) h[i] = 7; else if (h[i] < -9) h[i] = -9; }
}

/* ------------------------------------------------------------------ *
 * the ship
 * ------------------------------------------------------------------ */

/** Made fast: the splash at the bow, the rings, the sparks off the lamp. */
function land() {
	const { cx, sw, pierX } = geo();
	const bow = cx + sw * 0.3, sy = surfAt(bow), k = Math.max(0.35, s.rv / Math.max(1, W()));
	s.mode = 'arrived'; s.arrivedAt = s.t; s.rv = 0; s.px = 1;
	if (still()) return;
	for (let i = idx(bow - 8); i <= idx(pierX); i++) s.v[i] += 2.2 * k;
	for (let i = 0; i < 46; i++) s.drops.push({ x: bow + Math.random() * 10, y: sy, vx: (10 + Math.random() * 110) * k, vy: -(60 + Math.random() * 190) * k, r: 0.6 + Math.random() * 1.6, a: 0.5 + Math.random() * 0.5, life: 1 });
	for (let i = 0; i < 18; i++) s.foam.push({ x: bow - 6 + Math.random() * 22, vx: 10 + Math.random() * 30, r: 3 + Math.random() * 6, a: 0.2 + Math.random() * 0.25, life: 1, decay: 0.35 + Math.random() * 0.3 });
	for (let i = 0; i < 3; i++) s.rings.push({ x: bow + 6, t0: s.t + i * 0.14 });
	for (let i = 0; i < 34; i++) {
		const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, v = 70 + Math.random() * 150;
		s.sparks.push({ x: pierX - 4, y: sy - 12, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.55 + Math.random() * 0.45, c: Math.random() < 0.55 ? palette.teal : palette.gold, r: 0.8 + Math.random() * 1.4 });
	}
	const cheer = canvas && canvas.parentElement && canvas.parentElement.querySelector('.sail-scene-cheer');
	if (cheer) { cheer.classList.remove('on'); void cheer.offsetWidth; cheer.classList.add('on'); }
}

function step(dt) {
	s.t += dt;
	const leg = legOf(clock);
	if (!leg) return;
	// On to another leg (Traded pressed): a ship still at sea makes for
	// the pier first; one made fast lets the next leg fade in after a
	// moment at the pier.
	if (leg.leg !== s.leg) {
		const first = s.leg === -1;
		if (!first && (s.mode === 'run' || s.mode === 'glide')) s.mode = 'rush';
		else if (first || (s.mode === 'arrived' && s.t - s.arrivedAt > 1.4)) {
			const keep = { W: s.W, H: s.H, t: s.t, h: s.h, v: s.v };
			Object.assign(s, fresh(s.run), keep, {
				leg: leg.leg, fade: first ? 1 : 0, px: leg.there ? 1 : leg.p,
				mode: leg.there ? 'arrived' : 'run', arrivedAt: leg.there ? s.t - 3 : null
			});
		}
	}
	const { sw, cx, L } = geo(), b = s.bob;
	if (s.mode === 'run') {
		if (leg.there) s.mode = s.px < 0.97 ? 'rush' : 'glide';
		else { s.px += (leg.p - s.px) * Math.min(1, 3 * dt); s.rv = (leg.p - s.px) * L * 3; }
		if (s.fade < 1) s.fade = Math.min(1, s.fade + dt * 2.2);
	}
	if (s.mode === 'glide') {
		s.px += (1 - s.px) * Math.min(1, 3 * dt);
		if (s.px > 0.995) land();
	} else if (s.mode === 'rush') {
		const dist = (1 - s.px) * L, vmax = W() * 1.5, acc = W() * 2.4, want = Math.min(vmax, Math.sqrt(2 * acc * Math.max(0, dist)) + 30);
		s.rv += (want - s.rv) * Math.min(1, (want > s.rv ? 2.6 : 6) * dt);
		s.px += (s.rv * dt) / L;
		const bow = cx + sw * 0.3, stern = cx - sw * 0.34, sp = s.rv / W();
		if (!still()) {
			s.v[idx(bow + 4)] += sp * 0.9; s.v[idx(bow + 10)] += sp * 0.5; s.v[idx(stern)] -= sp * 0.6; s.v[idx(stern - 6)] -= sp * 0.3;
			if (sp > 0.25) {
				for (let k = 0; k < 2; k++) s.foam.push({ x: stern - Math.random() * 6, vx: -(20 + Math.random() * 40), r: 1.5 + Math.random() * 3.5, a: 0.22 + Math.random() * 0.2, life: 1, decay: 0.5 + Math.random() * 0.4 });
				if (Math.random() < 0.8) s.drops.push({ x: bow + Math.random() * 4, y: surfAt(bow) - 1, vx: (40 + Math.random() * 90) * sp, vy: -(40 + Math.random() * 120) * sp, r: 0.5 + Math.random() * 1.1, a: 0.4 + Math.random() * 0.4, life: 0.8 });
			}
		}
		b.rot += (-0.09 * Math.min(1, sp) - b.rot) * 6 * dt;
		if (s.px >= 1) land();
	}
	const sL = surfAt(cx - sw * 0.3), sR = surfAt(cx + sw * 0.3), slope = Math.atan2(sR - sL, sw * 0.6), target = (sL + sR) / 2;
	b.vy += (target - b.y) * 40 * dt - b.vy * 4 * dt; b.y += b.vy * dt;
	if (s.mode !== 'rush') { b.vr += (slope * 0.6 - b.rot) * 16 * dt - b.vr * 3 * dt; b.rot += b.vr * dt; }
	if (still()) return;
	sim(s.h, s.v);
	const g = H() * 5;
	s.drops = s.drops.filter(d => {
		d.vy += g * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt * 1.2;
		if (d.y > surfAt(d.x) && d.vy > 0) { if (Math.random() < 0.3) s.foam.push({ x: d.x, vx: d.vx * 0.2, r: 1.5 + d.r, a: d.a * 0.3, life: 1, decay: 0.9 }); return false; }
		return d.life > 0;
	});
	s.foam = s.foam.filter(f => { f.life -= f.decay * dt; f.x += f.vx * dt; f.vx *= 0.95; return f.life > 0; });
	s.sparks = s.sparks.filter(p => { p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.life -= p.decay * dt; return p.life > 0 && p.y < H(); });
	s.rings = s.rings.filter(r => s.t - r.t0 < 1.3);
}

/* ------------------------------------------------------------------ *
 * the picture
 * ------------------------------------------------------------------ */

function water(ctx, fn, alphaTop) {
	ctx.beginPath(); ctx.moveTo(0, H());
	for (let i = 0; i < H_SEGMENTS; i++) ctx.lineTo(colX(i), fn(i));
	ctx.lineTo(W(), H()); ctx.closePath();
	const gr = ctx.createLinearGradient(0, base() - 8, 0, H());
	gr.addColorStop(0, `rgba(${palette.blue},${alphaTop})`); gr.addColorStop(0.5, `rgba(${palette.deep},.95)`); gr.addColorStop(1, `rgb(${palette.shade})`);
	ctx.fillStyle = gr; ctx.fill();
	ctx.beginPath();
	for (let i = 0; i < H_SEGMENTS; i++) { const x = colX(i), y = fn(i); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
	ctx.strokeStyle = `rgba(${palette.blue},.5)`; ctx.lineWidth = 1; ctx.stroke();
}

function draw() {
	const ctx = canvas.getContext('2d'), b = s.bob, { sw, sh, cx, pierX } = geo();
	const sky = ctx.createLinearGradient(0, 0, 0, H() * 0.66);
	sky.addColorStop(0, palette.sky); sky.addColorStop(1, `rgb(${palette.deep})`);
	ctx.fillStyle = sky; ctx.fillRect(0, 0, W(), H());
	ctx.globalAlpha = 0.6; water(ctx, i => base() - 5 + s.h[i] * 0.3 + (still() ? 0 : ambient(colX(i) + 200, s.t * 0.7)), 0.22); ctx.globalAlpha = 1;
	// The pier, and its lamp -- brighter for a moment when the ship makes fast.
	const ps = surfAt(pierX), glow = s.mode === 'arrived' ? Math.max(0, 1 - (s.t - s.arrivedAt) / 2.4) : 0;
	ctx.fillStyle = palette.ink; ctx.globalAlpha = 0.85;
	ctx.fillRect(pierX - 9, ps - 9, 18, 2); ctx.fillRect(pierX - 7, ps - 8, 2, 12); ctx.fillRect(pierX + 5, ps - 8, 2, 12); ctx.fillRect(pierX + 7, ps - 18, 1.5, 10);
	ctx.globalAlpha = 1;
	ctx.beginPath(); ctx.arc(pierX + 7.8, ps - 19, 1.8 + glow * 1.5, 0, Math.PI * 2);
	ctx.fillStyle = palette.gold; ctx.shadowColor = palette.gold; ctx.shadowBlur = 6 + glow * 16; ctx.fill(); ctx.shadowBlur = 0;
	if (img && img.complete && img.naturalWidth) {
		ctx.save(); ctx.globalAlpha = s.fade; ctx.translate(cx, b.y + sh * 0.03); ctx.rotate(b.rot * 0.6); ctx.scale(-1, 1);
		ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3; ctx.filter = 'saturate(.75) contrast(1.05)';
		ctx.drawImage(img, -sw / 2, -sh * 0.88, sw, sh); ctx.restore();
	}
	water(ctx, i => surf(i), 0.5);
	for (const r of s.rings) {
		const u = (s.t - r.t0) / 1.3; if (u < 0) continue;
		ctx.beginPath(); ctx.ellipse(r.x, surfAt(r.x) + 2, 4 + u * 42, 1 + u * 5, 0, 0, Math.PI * 2);
		ctx.strokeStyle = `rgba(225,235,242,${0.35 * (1 - u)})`; ctx.lineWidth = 1; ctx.stroke();
	}
	for (const f of s.foam) {
		const y = surfAt(f.x), rx = f.r * (1 + (1 - f.life) * 1.6), ry = Math.max(0.8, f.r * 0.28);
		const g = ctx.createRadialGradient(f.x, y, 0, f.x, y, rx);
		g.addColorStop(0, `rgba(225,235,242,${f.a * f.life})`); g.addColorStop(1, 'rgba(225,235,242,0)');
		ctx.save(); ctx.translate(f.x, y); ctx.scale(1, ry / rx); ctx.translate(-f.x, -y);
		ctx.beginPath(); ctx.arc(f.x, y, rx, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.restore();
	}
	for (const d of s.drops) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fillStyle = `rgba(215,230,240,${d.a * Math.min(1, d.life * 1.5)})`; ctx.fill(); }
	for (const p of s.sparks) {
		ctx.globalAlpha = Math.min(1, p.life * 1.4);
		ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = p.c; ctx.shadowColor = p.c; ctx.shadowBlur = 6; ctx.fill();
	}
	ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function size() {
	const d = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
	const w = canvas.clientWidth, h = canvas.clientHeight;
	if (!w || !h) return false;
	if (w !== s.W || h !== s.H) {
		s.W = w; s.H = h;
		canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
		canvas.getContext('2d').setTransform(d, 0, 0, d, 0, 0);
	} else if (canvas.width !== Math.round(w * d)) {
		canvas.width = Math.round(w * d); canvas.height = Math.round(h * d);
		canvas.getContext('2d').setTransform(d, 0, 0, d, 0, 0);
	}
	return true;
}

function frame(now) {
	raf = 0;
	if (!canvas || !canvas.isConnected) { canvas = document.querySelector('canvas[data-sail-scene]'); if (!canvas) return; }
	if (now - readAt > 200) { clock = timerState(); readAt = now; }
	if (!clock) return;
	if (!s || s.run !== clock.startedAt) s = fresh(clock.startedAt);
	if (size()) {
		step(Math.min(40, now - (last || now)) / 1000);
		draw();
	}
	last = now;
	raf = requestAnimationFrame(frame);
}

/**
 * Hands the scene to the canvas on the page now, if there is one, and
 * keeps it moving. Called after every redraw; cheap when nothing moved.
 */
export function mountScene() {
	if (typeof document === 'undefined') return;
	const el = document.querySelector('canvas[data-sail-scene]');
	if (!el) { canvas = null; return; }
	if (el === canvas && raf) return;
	canvas = el;
	palette = colours();
	const src = el.dataset.ship || '';
	if (src !== imgSrc) { imgSrc = src; img = new Image(); img.src = src; }
	if (s) { s.W = 0; s.H = 0; }
	if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
}
