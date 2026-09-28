// The sailing clock as a picture: the sailor's own ship crossing the leg
// it is on, on a sea that moves, to a pier with a lamp at the end.
//
// It follows the clock and never runs one of its own. How far along the
// leg the ship is, is how far the clock is into it; when the leg's time
// comes the ship glides in and makes fast. Said "arrived" early, or
// traded before the clock got there, it makes for the pier at speed --
// a wake, spray at the bow, a splash, and a small celebration.
//
// The run is one long strip of sea, a pier at the end of every leg. When
// Traded lets the ship go, it sails off from the pier it made fast at
// into the next leg and the view travels with it, the pier behind
// sliding off the left edge: a voyage, not a ship put back at the start.
//
// Drawn cheaply, because it runs for as long as the run does: thirty
// frames a second, the ship's picture flipped, tinted and shadowed once
// into a sprite of its own rather than filtered every frame, foam from
// one pre-drawn blob, sparks without blur. The screen is drawn again
// whole, often, so the scene's state lives here and is handed to
// whatever canvas is on the page now. With reduced motion asked for,
// the ship is simply where the clock says, on a still sea.

import { timerState } from './sail-timer.js';

const DX = 4;              // strip pixels a spring of the sea stands for
const PAD = 90;            // sea kept either side of the view
const CALM_MS = 1000 / 30; // a ship just sailing: thirty frames a second
const FAST_MS = 0;         // a rush, a splash, a voyage: every frame the screen has
const TRANSIT = 2.2;       // seconds to sail from one pier into the next leg
let canvas = null;
let raf = 0;
let last = 0;
let s = null;
let img = null;
let imgSrc = '';
let readAt = 0;
let clock = null;
let palette = null;
let grads = null;
let calm = false;          // reduced motion, asked once a frame and not per point of sea
let sized = true;          // the canvas's box changed since it was measured
let seen = null;           // what watches it for that

// Asked of the browser once, and told when it changes, rather than
// asked every frame.
const motionQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduced = () => !!(motionQuery && motionQuery.matches);
const still = () => calm;
const lerp = (a, b, u) => a + (b - a) * u;
const ease = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

function colours() {
	const cs = getComputedStyle(document.documentElement);
	const g = (n, f) => cs.getPropertyValue(n).trim() || f;
	return {
		blue: g('--blue-rgb', '90,140,190'), deep: g('--deep-rgb', '10,18,30'), shade: g('--shade-rgb', '5,10,18'),
		teal: g('--teal', '#5fd0b3'), gold: g('--gold', '#e0b35a'), ink: g('--ink-faint', '#5b6b7c'), sky: g('--panel-inset', '#0b1220')
	};
}

/* ------------------------------------------------------------------ *
 * sprites: drawn once, copied every frame
 * ------------------------------------------------------------------ */

/**
 * The ship as the scene draws it -- facing the way it sails, a touch
 * less saturated, its shadow under it -- baked into a canvas of its own
 * at this size, so a frame copies it instead of filtering it. Returns
 * { c, ox, oy, w, h }: the sprite, where the ship's anchor (the middle
 * of its waterline) sits in it, and its size in strip pixels.
 */
export function shipSprite(pic, w, h, dpr, shadow = { blur: 8, y: 3 }) {
	const m = Math.ceil(shadow.blur * 2 + shadow.y);
	const c = document.createElement('canvas');
	c.width = Math.ceil((w + m * 2) * dpr); c.height = Math.ceil((h + m * 2) * dpr);
	const x = c.getContext('2d');
	x.setTransform(dpr, 0, 0, dpr, 0, 0);
	x.translate(m + w / 2, m); x.scale(-1, 1);
	x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = shadow.blur * dpr; x.shadowOffsetY = shadow.y * dpr;
	if ('filter' in x) x.filter = 'saturate(.75) contrast(1.05)';
	x.drawImage(pic, -w / 2, 0, w, h);
	return { c, ox: m + w / 2, oy: m + h * 0.88, w: w + m * 2, h: h + m * 2 };
}

let foamBlob = null;
/** One soft white blob; every patch of foam is it, scaled and faded. */
export function foamSprite() {
	if (foamBlob) return foamBlob;
	const c = document.createElement('canvas');
	c.width = c.height = 64;
	const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
	g.addColorStop(0, 'rgba(225,235,242,1)'); g.addColorStop(1, 'rgba(225,235,242,0)');
	x.fillStyle = g; x.fillRect(0, 0, 64, 64);
	foamBlob = c;
	return c;
}

/* ------------------------------------------------------------------ *
 * where the clock is
 * ------------------------------------------------------------------ */

/**
 * What the clock says of the leg: which one, how far into it (0 to 1),
 * and whether the ship is at its stop -- the clock has reached it, or
 * the sailor said so.
 *
 * Time is read to the millisecond here, not the clock's whole seconds,
 * or the ship moves in jerks a second apart. And the leg runs from when
 * Traded let the ship go (the clock keeps it, `legAt`); a clock started
 * before it kept that is timed back from when the leg is due by its
 * length as the run was laid. Never from the stop behind: the stop
 * behind keeps its estimated pause however early or late Traded was
 * pressed there, so "after that pause" is a start that is wrong both
 * ways -- the ship sat at the start of a leg under way, or began it in
 * the middle.
 */
function legOf(t) {
	if (!t) return null;
	const ran = Math.max(0, (Date.now() - t.startedAt) / 1000);
	if (!t.marks.length) return { leg: 0, p: Math.min(1, ran / Math.max(1, t.seconds)), there: t.over, count: 1 };
	const i = Math.min(t.done, t.marks.length - 1);
	const there = !!t.wait || t.reached > t.done || t.done >= t.marks.length;
	const end = t.marks[i].at;
	const was = t.base && t.base.marks && t.base.marks.length === t.marks.length ? t.base.marks : null;
	const planned = was ? was[i].at - (i > 0 ? was[i - 1].at + (was[i - 1].hold || 0) : 0) : 0;
	const prev = t.done > 0 ? t.marks[t.done - 1] : null;
	const start = t.legAt !== null && t.legAt < end ? t.legAt : planned > 0 ? end - planned : prev ? prev.at + prev.hold : 0;
	const p = there ? 1 : Math.max(0, Math.min(1, (ran - start) / Math.max(1, end - start)));
	return { leg: i, p, there, count: t.marks.length };
}

/** How far along its leg the clock has the ship, for the cast-off's
 *  close-up: it sails by the same clock, so the hand-over does not move it. */
export const legNow = (t = timerState()) => legOf(t);

/* ------------------------------------------------------------------ *
 * the strip: one long sea, a pier at the end of every leg
 * ------------------------------------------------------------------ */

function fresh(run) {
	return {
		run, t: 0, W: 0, H: 0, N: 0, h: null, v: null, gx: 0, camX: 0,
		drops: [], foam: [], sparks: [], rings: [],
		leg: -1, px: 0, rv: 0, mode: 'run', arrivedAt: null, tr: null,
		bob: { y: 0, vy: 0, rot: 0, vr: 0 }, sprite: null
	};
}

const legSpan = () => s.W + 16;
const baseY = () => s.H * 0.66;
const shipH = () => Math.min(s.H * 0.98, (baseY() - 2) / 0.85);
const startX = () => shipH() * 0.4;
const pierAt = k => k * legSpan() + s.W - 20;
function geo() {
	const sw = shipH(), x0 = s.leg * legSpan() + startX(), pierX = pierAt(s.leg), x1 = pierX - sw * 0.42;
	return { sw, sh: sw, pierX, L: x1 - x0, cx: s.mode === 'transit' ? s.tr.sx : x0 + s.px * (x1 - x0) };
}

function grid() {
	s.N = Math.ceil((s.W + PAD * 2) / DX);
	s.h = new Float32Array(s.N); s.v = new Float32Array(s.N);
	s.gx = Math.floor((s.camX - PAD) / DX) * DX;
}
/** The springs follow the view: what scrolls off one side is dropped,
 *  calm sea comes in at the other. */
function shiftGrid() {
	const want = Math.floor((s.camX - PAD) / DX) * DX, k = Math.round((want - s.gx) / DX);
	if (!k) return;
	if (Math.abs(k) >= s.N) { s.h.fill(0); s.v.fill(0); }
	else if (k > 0) { s.h.copyWithin(0, k); s.v.copyWithin(0, k); s.h.fill(0, s.N - k); s.v.fill(0, s.N - k); }
	else { s.h.copyWithin(-k, 0, s.N + k); s.v.copyWithin(-k, 0, s.N + k); s.h.fill(0, 0, -k); s.v.fill(0, 0, -k); }
	s.gx = want;
}
const colX = i => s.gx + i * DX;
const idx = x => Math.max(0, Math.min(s.N - 1, Math.round((x - s.gx) / DX)));
const ambient = (x, t) => Math.sin(x * 0.02 + t * 1.1) * 1.1 + Math.sin(x * 0.045 - t * 1.6) * 0.6 + Math.sin(x * 0.008 + t * 0.5) * 0.9;
/**
 * The sea's surface, worked out once a frame into a table: the swell and
 * the springs, point by point. Every particle, the ship and the drawing
 * read it from there -- the swell is three sines, and asked afresh for
 * each drop and blob of foam it was the dearest thing on the screen
 * while a splash was in the air. The far swell behind is tabled too.
 */
let top = new Float32Array(0), back = new Float32Array(0), swell = new Float32Array(0), far = new Float32Array(0);
/** The swell, once a frame: three sines a point for the sea in front,
 *  the far sea behind at every other point with the ones between drawn
 *  straight -- it is faint, and a gentle curve either way. */
function swellNow() {
	if (swell.length !== s.N) { top = new Float32Array(s.N); back = new Float32Array(s.N); swell = new Float32Array(s.N); far = new Float32Array(s.N); }
	if (still()) { swell.fill(0); far.fill(0); return; }
	const t = s.t;
	for (let i = 0; i < s.N; i++) swell[i] = ambient(s.gx + i * DX, t);
	for (let i = 0; i < s.N; i += 2) far[i] = ambient(s.gx + i * DX + 200, t * 0.7);
	for (let i = 1; i < s.N; i += 2) far[i] = i + 1 < s.N ? (far[i - 1] + far[i + 1]) / 2 : far[i - 1];
}
/** The surface from the swell and the springs: additions only. */
function surface() {
	const b = baseY();
	for (let i = 0; i < s.N; i++) { top[i] = b + s.h[i] + swell[i]; back[i] = b - 5 + s.h[i] * 0.3 + far[i]; }
}
const surf = i => top[i];
function surfAt(x) {
	const f = Math.max(0, Math.min(s.N - 1.001, (x - s.gx) / DX)), i = Math.floor(f), r = f - i;
	return top[i] * (1 - r) + top[i + 1] * r;
}
let simL = new Float32Array(0), simR = new Float32Array(0);
function sim() {
	const { h, v, N } = s;
	if (simL.length !== N) { simL = new Float32Array(N); simR = new Float32Array(N); }
	const L = simL, R = simR;
	for (let i = 0; i < N; i++) v[i] += -h[i] * 0.02 - v[i] * 0.04;
	for (let p = 0; p < 4; p++) {
		for (let i = 0; i < N; i++) {
			if (i > 0) { L[i] = 0.14 * (h[i] - h[i - 1]); v[i - 1] += L[i]; }
			if (i < N - 1) { R[i] = 0.14 * (h[i] - h[i + 1]); v[i + 1] += R[i]; }
		}
		for (let i = 0; i < N; i++) { if (i > 0) h[i - 1] += L[i]; if (i < N - 1) h[i + 1] += R[i]; }
	}
	for (let i = 0; i < N; i++) { h[i] += v[i]; if (h[i] > 7) h[i] = 7; else if (h[i] < -9) h[i] = -9; }
}

/* ------------------------------------------------------------------ *
 * the ship
 * ------------------------------------------------------------------ */

/** How much of each the sea may hold at once: a splash is a handful of
 *  things in the air, not hundreds, and each is drawn every frame. */
const MAX_FOAM = 24, MAX_DROPS = 24, WAKE_PER_S = 16;
const foamIn = f => { if (s.foam.length < MAX_FOAM) s.foam.push(f); };
const dropIn = d => { if (s.drops.length < MAX_DROPS) s.drops.push(d); };

/** The wash a moving hull throws: the sea pushed at the bow and drawn
 *  in at the stern, foam behind, spray ahead at speed. Foam and spray
 *  are let out by the second, not by the frame, so a faster screen does
 *  not fill the sea with more of them. */
function wake(cx, sw, sp, dt) {
	if (!(sp > 0) || still()) return;
	const bow = cx + sw * 0.3, stern = cx - sw * 0.34;
	s.v[idx(bow + 4)] += sp * 0.9 * dt * 60; s.v[idx(bow + 10)] += sp * 0.5 * dt * 60; s.v[idx(stern)] -= sp * 0.6 * dt * 60; s.v[idx(stern - 6)] -= sp * 0.3 * dt * 60;
	s.wakeDue = (s.wakeDue || 0) + WAKE_PER_S * dt * Math.min(1, sp * 2);
	while (s.wakeDue >= 1) {
		s.wakeDue -= 1;
		if (sp > 0.25) {
			foamIn({ x: stern - Math.random() * 6, vx: -(20 + Math.random() * 40), r: 1.5 + Math.random() * 3.5, a: 0.22 + Math.random() * 0.2, life: 1, decay: 0.6 + Math.random() * 0.4 });
			if (Math.random() < 0.6) dropIn({ x: bow + Math.random() * 4, y: surfAt(bow) - 1, vx: (40 + Math.random() * 90) * sp, vy: -(40 + Math.random() * 120) * sp, r: 0.5 + Math.random() * 1.1, a: 0.4 + Math.random() * 0.4, life: 0.8 });
		} else if (sp > 0.06) {
			foamIn({ x: stern - Math.random() * 4, vx: -15, r: 1.2 + Math.random() * 2, a: 0.18, life: 1, decay: 0.8 });
		}
	}
}

/** Made fast: the splash at the bow, the rings, the sparks off the lamp. */
function land() {
	const { cx, sw, pierX } = geo();
	const bow = cx + sw * 0.3, sy = surfAt(bow), k = Math.max(0.35, s.rv / Math.max(1, s.W));
	s.mode = 'arrived'; s.arrivedAt = s.t; s.rv = 0; s.px = 1;
	if (still()) return;
	for (let i = idx(bow - 8); i <= idx(pierX); i++) s.v[i] += 2.2 * k;
	for (let i = 0; i < 16; i++) dropIn({ x: bow + Math.random() * 10, y: sy, vx: (10 + Math.random() * 110) * k, vy: -(60 + Math.random() * 190) * k, r: 0.6 + Math.random() * 1.6, a: 0.5 + Math.random() * 0.5, life: 1 });
	for (let i = 0; i < 8; i++) foamIn({ x: bow - 6 + Math.random() * 22, vx: 10 + Math.random() * 30, r: 3 + Math.random() * 6, a: 0.2 + Math.random() * 0.25, life: 1, decay: 0.35 + Math.random() * 0.3 });
	for (let i = 0; i < 3; i++) s.rings.push({ x: bow + 6, t0: s.t + i * 0.14 });
	for (let i = 0; i < 12; i++) {
		const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, v = 70 + Math.random() * 150;
		s.sparks.push({ x: pierX - 4, y: sy - 12, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.55 + Math.random() * 0.45, c: Math.random() < 0.55 ? palette.teal : palette.gold, r: 0.9 + Math.random() * 1.4 });
	}
	const cheer = canvas && canvas.parentElement && canvas.parentElement.querySelector('.sail-scene-cheer');
	if (cheer) { cheer.classList.remove('on'); void cheer.offsetWidth; cheer.classList.add('on'); }
}

/** Off from the pier made fast at, into the next leg, the view with it. */
function castOff(to) {
	const { cx } = geo();
	s.tr = { t0: s.t, sxA: cx, sxB: to * legSpan() + startX(), camA: s.camX, camB: to * legSpan(), sx: cx, to };
	s.mode = 'transit';
}

/** Straight to a leg, no voyage: the first look, or a jump of several. */
function placeAt(leg) {
	s.leg = leg.leg; s.camX = leg.leg * legSpan(); grid();
	s.px = leg.p; s.rv = 0; s.tr = null;
	s.mode = leg.there ? 'arrived' : 'run'; s.arrivedAt = leg.there ? s.t - 3 : null;
	s.drops = []; s.foam = []; s.sparks = []; s.rings = [];
}

function step(dt) {
	s.t += dt;
	swellNow();
	surface();
	const leg = legOf(clock);
	if (!leg) return;
	if (s.leg < 0 || leg.leg < s.leg || leg.leg > s.leg + 1) placeAt(leg);
	else if (leg.leg === s.leg + 1 && s.mode !== 'transit') {
		// Traded: a ship still at sea makes for the pier first, and one made
		// fast casts off once its moment at the pier is had.
		if (s.mode === 'run' || s.mode === 'glide') s.mode = 'rush';
		else if (s.mode === 'arrived' && s.t - s.arrivedAt > 0.9) castOff(leg.leg);
	}
	const { sw, cx, L } = geo(), b = s.bob;
	if (s.mode === 'run') {
		if (leg.leg === s.leg && leg.there) s.mode = s.px < 0.97 ? 'rush' : 'glide';
		else if (leg.leg === s.leg) {
			const was = s.px;
			s.px += (leg.p - s.px) * Math.min(1, 6 * dt);
			s.rv = ((s.px - was) * L) / Math.max(dt, 1e-3);
		}
	} else if (s.mode === 'glide') {
		s.px += (1 - s.px) * Math.min(1, 3 * dt);
		if (s.px > 0.995) land();
	} else if (s.mode === 'rush') {
		const dist = (1 - s.px) * L, want = Math.min(s.W * 1.5, Math.sqrt(2 * s.W * 2.4 * Math.max(0, dist)) + 30);
		s.rv += (want - s.rv) * Math.min(1, (want > s.rv ? 2.6 : 6) * dt);
		s.px += (s.rv * dt) / L;
		wake(cx, sw, s.rv / s.W, dt);
		b.rot += (-0.09 * Math.min(1, s.rv / s.W) - b.rot) * 6 * dt;
		if (s.px >= 1) land();
	} else if (s.mode === 'transit') {
		// The clock started the new leg when Traded was pressed; the voyage
		// makes for where the clock says the ship is by now, not for the
		// start of the leg, so it hands over to the leg without a jump.
		const tr = s.tr, u = Math.min(1, (s.t - tr.t0) / TRANSIT);
		tr.p = leg.leg === tr.to && !leg.there ? leg.p : tr.p || 0;
		const sx = lerp(tr.sxA, tr.sxB + tr.p * L, ease(u)), sp = (sx - tr.sx) / Math.max(dt, 1e-3);
		tr.sx = sx;
		s.camX = lerp(tr.camA, tr.camB, ease(Math.max(0, Math.min(1, (u - 0.08) / 0.92))));
		shiftGrid();
		wake(sx, sw, (sp / s.W) * 0.55, dt);
		b.rot += (-0.07 * Math.min(1, sp / s.W) - b.rot) * 5 * dt;
		if (u >= 1) {
			s.leg = tr.to; s.camX = tr.camB; shiftGrid();
			s.mode = 'run'; s.px = tr.p; s.rv = 0; s.tr = null;
		}
	}
	const x = geo().cx;
	const sL = surfAt(x - sw * 0.3), sR = surfAt(x + sw * 0.3), slope = Math.atan2(sR - sL, sw * 0.6), target = (sL + sR) / 2;
	b.vy += (target - b.y) * 40 * dt - b.vy * 4 * dt; b.y += b.vy * dt;
	if (s.mode !== 'rush' && s.mode !== 'transit') { b.vr += (slope * 0.6 - b.rot) * 16 * dt - b.vr * 3 * dt; b.rot += b.vr * dt; }
	if (still()) return;
	sim();
	const g = s.H * 5, left = s.camX - 40;
	s.drops = s.drops.filter(d => {
		d.vy += g * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt * 1.2;
		if (d.y > surfAt(d.x) && d.vy > 0) { if (Math.random() < 0.2) foamIn({ x: d.x, vx: d.vx * 0.2, r: 1.5 + d.r, a: d.a * 0.3, life: 1, decay: 0.9 }); return false; }
		return d.life > 0 && d.x > left;
	});
	s.foam = s.foam.filter(f => { f.life -= f.decay * dt; f.x += f.vx * dt; f.vx *= 0.95; return f.life > 0 && f.x > left; });
	s.sparks = s.sparks.filter(p => { p.vy += 160 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.985; p.life -= p.decay * dt; return p.life > 0 && p.y < s.H; });
	s.rings = s.rings.filter(r => s.t - r.t0 < 1.3);
	surface();
}

/* ------------------------------------------------------------------ *
 * the picture
 * ------------------------------------------------------------------ */

function water(ctx, fn, front, x0, x1) {
	const ia = Math.max(0, idx(x0) - 1), ib = Math.min(s.N - 1, idx(x1) + 1);
	ctx.beginPath(); ctx.moveTo(colX(ia), s.H);
	for (let i = ia; i <= ib; i++) ctx.lineTo(colX(i), fn(i));
	ctx.lineTo(colX(ib), s.H); ctx.closePath();
	ctx.fillStyle = front ? grads.front : grads.back; ctx.fill();
	if (!front) return;
	ctx.beginPath();
	for (let i = ia; i <= ib; i++) { const x = colX(i), y = fn(i); if (i === ia) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
	ctx.strokeStyle = grads.line; ctx.lineWidth = 1; ctx.stroke();
}

let halo = null;
/** The lamp's glow, drawn once: a blur on the canvas is dear, and it
 *  flared with every ship made fast, just as the splash was in the air. */
function haloSprite() {
	if (halo && halo.gold === palette.gold) return halo.c;
	const c = document.createElement('canvas');
	c.width = c.height = 48;
	const x = c.getContext('2d'), g = x.createRadialGradient(24, 24, 0, 24, 24, 24);
	g.addColorStop(0, palette.gold); g.addColorStop(0.25, palette.gold); g.addColorStop(1, 'rgba(0,0,0,0)');
	x.fillStyle = g; x.fillRect(0, 0, 48, 48);
	halo = { c, gold: palette.gold };
	return c;
}
function pier(ctx, X, glow) {
	const ps = surfAt(X);
	ctx.fillStyle = palette.ink; ctx.globalAlpha = 0.85;
	ctx.fillRect(X - 9, ps - 9, 18, 2); ctx.fillRect(X - 7, ps - 8, 2, 12); ctx.fillRect(X + 5, ps - 8, 2, 12); ctx.fillRect(X + 7, ps - 18, 1.5, 10);
	const r = 6 + glow * 14;
	ctx.globalAlpha = 0.55 + glow * 0.45; ctx.drawImage(haloSprite(), X + 7.8 - r, ps - 19 - r, r * 2, r * 2);
	ctx.globalAlpha = 1; ctx.fillStyle = palette.gold;
	ctx.fillRect(X + 6, ps - 20.8, 3.6, 3.6);
}

function draw() {
	const ctx = canvas.getContext('2d'), b = s.bob, { sw, sh, cx } = geo();
	const d = dpr();
	if (!grads || grads.H !== s.H) {
		const sky = ctx.createLinearGradient(0, 0, 0, s.H * 0.66);
		sky.addColorStop(0, palette.sky); sky.addColorStop(1, `rgb(${palette.deep})`);
		const sea = a => {
			const gr = ctx.createLinearGradient(0, baseY() - 8, 0, s.H);
			gr.addColorStop(0, `rgba(${palette.blue},${a})`); gr.addColorStop(0.5, `rgba(${palette.deep},.95)`); gr.addColorStop(1, `rgb(${palette.shade})`);
			return gr;
		};
		grads = { H: s.H, sky, back: sea(0.22), front: sea(0.5), line: `rgba(${palette.blue},.5)` };
	}
	// Cleared first: the sky is not opaque, and painting it over the last
	// frame left a trail of fading ships behind a fast one.
	ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.setTransform(d, 0, 0, d, 0, 0);
	ctx.fillStyle = grads.sky; ctx.fillRect(0, 0, s.W, s.H);
	// The world, scrolled to where the view is.
	ctx.setTransform(d, 0, 0, d, -s.camX * d, 0);
	const vx0 = s.camX, vx1 = s.camX + s.W;
	ctx.globalAlpha = 0.6; water(ctx, i => back[i], false, vx0, vx1); ctx.globalAlpha = 1;
	const glow = s.mode === 'arrived' ? Math.max(0, 1 - (s.t - s.arrivedAt) / 2.4) : 0;
	for (let k = Math.max(0, Math.floor((vx0 - s.W) / legSpan())); ; k++) {
		const X = pierAt(k);
		if (X > vx1 + 20) break;
		if (X > vx0 - 20) pier(ctx, X, k === s.leg ? glow : 0);
	}
	if (img && img.complete && img.naturalWidth) {
		const key = `${imgSrc}|${sw}|${d}`;
		if (!s.sprite || s.sprite.key !== key) s.sprite = { ...shipSprite(img, sw, sh, d), key };
		const sp = s.sprite;
		ctx.save(); ctx.translate(cx, b.y + sh * 0.03); ctx.rotate(b.rot * 0.6);
		ctx.drawImage(sp.c, -sp.ox, -sp.oy, sp.w, sp.h);
		ctx.restore();
	}
	water(ctx, surf, true, vx0, vx1);
	ctx.lineWidth = 1;
	for (const r of s.rings) {
		const u = (s.t - r.t0) / 1.3; if (u < 0) continue;
		ctx.beginPath(); ctx.ellipse(r.x, surfAt(r.x) + 2, 4 + u * 42, 1 + u * 5, 0, 0, Math.PI * 2);
		ctx.strokeStyle = `rgba(225,235,242,${0.35 * (1 - u)})`; ctx.stroke();
	}
	const blob = foamSprite();
	for (const f of s.foam) {
		const y = surfAt(f.x), rx = f.r * (1 + (1 - f.life) * 1.6), ry = Math.max(0.8, f.r * 0.28);
		ctx.globalAlpha = f.a * f.life; ctx.drawImage(blob, f.x - rx, y - ry, rx * 2, ry * 2);
	}
	ctx.fillStyle = 'rgb(215,230,240)';
	for (const p of s.drops) { ctx.globalAlpha = p.a * Math.min(1, p.life * 1.5); ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
	for (const p of s.sparks) { ctx.globalAlpha = Math.min(1, p.life * 1.4); ctx.fillStyle = p.c; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); }
	ctx.globalAlpha = 1;
}

// Drawn at most half again the screen's pixels: a strip of sea wants no
// more, and a canvas twice over is four times the pixels to fill.
const dpr = () => Math.min(1.5, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
function size() {
	// Measured when the box changed, not every frame: reading a size
	// makes the browser lay the page out there and then.
	if (!sized && s.W && s.H && canvas.width) return true;
	sized = false;
	const d = dpr();
	const w = canvas.clientWidth, h = canvas.clientHeight;
	if (!w || !h) { sized = true; return false; }
	if (w !== s.W || h !== s.H) {
		s.W = w; s.H = h; grads = null;
		// A new width is a new length of leg: the view is put back on the
		// leg under way, and a voyage in hand simply arrives.
		if (s.mode === 'transit') { s.leg = s.tr.to; s.mode = 'run'; s.px = 0; s.tr = null; }
		if (s.leg >= 0) s.camX = s.leg * legSpan();
		grid();
	}
	if (canvas.width !== Math.round(w * d) || canvas.height !== Math.round(h * d)) { canvas.width = Math.round(w * d); canvas.height = Math.round(h * d); }
	return true;
}

/**
 * The canvas on the page now. The tab draws itself again whole, and puts
 * a blank canvas where the clock is: the live one goes back in its place
 * -- pixels, context and all -- so a press never blanks the sea or
 * leaves it drawing on a canvas nobody has sized. Null when the page has
 * no clock to draw.
 */
function adopt() {
	const el = document.querySelector('canvas[data-sail-scene]');
	if (!el) return null;
	if (el === canvas) return canvas;
	if (canvas && !canvas.isConnected && canvas.width) {
		const src = el.dataset.ship || '';
		el.replaceWith(canvas);
		canvas.dataset.ship = src;
		if (src !== imgSrc) { imgSrc = src; img = new Image(); img.src = src; if (s) s.sprite = null; }
	} else {
		canvas = el;
		palette = colours(); grads = null;
		const src = el.dataset.ship || '';
		if (src !== imgSrc) { imgSrc = src; img = new Image(); img.src = src; if (s) s.sprite = null; }
	}
	sized = true;
	if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'function') {
		if (seen) seen.disconnect();
		seen = new window.ResizeObserver(() => { sized = true; });
		seen.observe(canvas);
	}
	return canvas;
}

function frame(now) {
	raf = 0;
	if (!canvas || !canvas.isConnected) { if (!adopt()) return; }
	// Thirty frames a second is plenty for a ship just sailing; a rush, a
	// splash or a voyage gets every frame, or the ship jumps.
	const busy = s && (s.mode !== 'run' || s.drops.length || s.foam.length || s.sparks.length || s.rings.length);
	if (last && now - last < (busy ? FAST_MS : CALM_MS) - 1) { raf = requestAnimationFrame(frame); return; }
	calm = reduced();
	if (now - readAt > 200) { clock = timerState(); readAt = now; }
	if (!clock) return;
	if (!s || s.run !== clock.startedAt) s = fresh(clock.startedAt);
	if (size()) {
		// A frame late -- the page redrawn under it when Traded or Arrived
		// is pressed -- is taken as one frame, not caught up in a leap: the
		// ship slows for a moment rather than jumping across the strip.
		step(Math.min(34, now - (last || now)) / 1000);
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
	if (!adopt()) { canvas = null; return; }
	if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
}

/** Where the ship is, for a test: how far along the leg, which leg, what
 *  it is doing, and where the view is. Null when nothing is drawn. */
export const sceneNow = () => (s ? { px: s.px, leg: s.leg, mode: s.mode, camX: s.camX, x: s.W && s.leg >= 0 ? geo().cx : null, drawnOn: canvas && canvas.isConnected && canvas === document.querySelector('canvas[data-sail-scene]'), backing: canvas ? canvas.width : 0 } : null);
