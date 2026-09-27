// Casting off, seen: the sailor's own ship dropped into the water, and
// the camera pulling back from it into the sailing clock.
//
// One world and one camera. The world is the clock's own strip of sea
// (sail-scene.js draws it for the rest of the run), built to the strip's
// size, with the ship on the start line. Casting off is a close-up of
// that start line: the ship falls in with a splash and the run's first
// stop is said beside it. Then the camera pulls back -- the card
// travelling from the middle of the screen to where the clock sits on
// the page, and changing its shape to the strip's as it goes -- until
// what is on the screen is the clock, and the clock takes over.
//
// The press is the start of the run (the clock begins, the cockpit
// opens), and without this it read as a page changing rather than a
// ship leaving. A press anywhere skips it; with reduced motion it is a
// still card.

import { esc } from '../fmt.js';
import { T } from '../i18n.js';
import { iconSrc } from '../ui-bits.js';
import { currentShip } from '../ship.js';
import { timerState, spanText } from '../sail-timer.js';
import { stopNames } from './cockpit.js';
import { sailedPlan } from './sail.js';
import { shipSprite, foamSprite } from '../sail-scene.js';

const FLOAT = 2.4;          // seconds afloat in close-up, the title up
const MORPH = 3.4;          // seconds for the camera to pull back
const lerp = (a, b, u) => a + (b - a) * u;
const ease = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

export function castOffFx() {
	if (typeof document === 'undefined') return;
	document.querySelectorAll('.castoff-fx').forEach(e => e.remove());
	const plan = sailedPlan();
	const first = plan && plan.stops && plan.stops[0];
	const t0 = timerState();
	const sub = [
		plan ? T('Stop 1 of {n}', { n: plan.stops.length }) : '',
		first ? stopNames(first).place : '',
		t0 ? T('≈ {time} to the end', { time: spanText(t0.seconds) }) : ''
	].filter(Boolean).join(' · ');
	const fx = document.createElement('div');
	fx.className = 'castoff-fx';
	fx.setAttribute('role', 'status');
	fx.innerHTML = `<div class="setsail"><canvas></canvas><div class="setsail-title"><span class="setsail-label">${T('Setting sail')}</span><span class="setsail-rule"></span><span class="setsail-sub">${esc(sub)}</span></div></div>`;
	document.body.appendChild(fx);
	const box = fx.querySelector('.setsail'), cv = fx.querySelector('canvas'), title = fx.querySelector('.setsail-title');
	// The clock's own strip waits under the card until the card becomes it.
	document.body.classList.add('sail-scene-hold');
	let raf = 0, done = false;
	const finish = () => {
		if (done) return;
		done = true;
		cancelAnimationFrame(raf);
		fx.remove();
		document.body.classList.remove('sail-scene-hold');
	};
	fx.addEventListener('click', finish);
	if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		title.style.opacity = 1;
		setTimeout(finish, 3200);
		return;
	}
	const src = iconSrc(currentShip().name);
	const pic = new Image();
	if (src) pic.src = src;
	const cs = getComputedStyle(document.documentElement);
	const tok = (n, f) => cs.getPropertyValue(n).trim() || f;
	const blue = tok('--blue-rgb', '90,140,190'), deep = tok('--deep-rgb', '10,18,30'), shade = tok('--shade-rgb', '5,10,18'), skyTop = tok('--panel-inset', '#0b1220');

	// Where the card starts, and where it is going: the clock's strip.
	const start = box.getBoundingClientRect();
	const target = () => { const el = document.querySelector('.sail-scene'); return el ? el.getBoundingClientRect() : null; };
	const aim = target();
	const H0 = start.height;
	// The world is the strip: its width, its height, its sea and its ship,
	// laid out as sail-scene.js lays them.
	const Wf = aim && aim.width > 0 ? aim.width : Math.min(1280, window.innerWidth - 32);
	const Hf = aim && aim.height > 0 ? aim.height : 56;
	const yb = Hf * 0.66;
	const sw1 = Math.min(Hf * 0.98, (yb - 2) / 0.85), sh1 = sw1;
	const x0w = sw1 * 0.4;
	const pierX = Wf - 20;
	const Z0 = H0 / Hf;
	const fx0 = sw1 * Z0 * 0.4;
	const pad = Wf * 0.12;
	const N = Math.max(80, Math.round((Wf + pad) / 2.5));
	const h = new Float32Array(N), v = new Float32Array(N);
	const gShip = (H0 * 2.4) / Z0, gA = (H0 * 1.9) / Z0, gB = Hf * 5;
	let t = 0, mode = 'fall', hitAt = 0, morphAt = 0, u = 0, e = 0;
	let drops = [], foam = [], sprite = null;
	let W = start.width, H = start.height;
	const ship = { y: yb + ((-H0 * 0.9 + sw1 * Z0 * 0.9) - H0 * 0.7) / Z0, vy: 0, rot: -0.05, vr: 0 };

	const colX = i => -pad + (i / (N - 1)) * (Wf + pad);
	const idx = x => Math.max(0, Math.min(N - 1, Math.round(((x + pad) / (Wf + pad)) * (N - 1))));
	const ambient = (x, tt) => Math.sin(x * 0.02 + tt * 1.1) * 1.1 + Math.sin(x * 0.045 - tt * 1.6) * 0.6 + Math.sin(x * 0.008 + tt * 0.5) * 0.9;
	const surf = i => yb + h[i] + ambient(colX(i), t);
	const surfAt = x => { const f = ((Math.max(-pad, Math.min(Wf, x)) + pad) / (Wf + pad)) * (N - 1), i = Math.max(0, Math.min(N - 2, Math.floor(f))), r = f - i; return surf(i) * (1 - r) + surf(i + 1) * r; };
	const cam = () => {
		const ez = ease(Math.min(1, u / 0.62));
		const Z = Math.pow(Z0, 1 - ez), fxs = lerp(fx0, x0w, ez), fys = H * lerp(0.7, 0.66, e);
		return { Z, tx: fxs - x0w * Z, ty: fys - yb * Z };
	};
	const sim = () => {
		const L = new Float32Array(N), R = new Float32Array(N);
		for (let i = 0; i < N; i++) v[i] += -h[i] * 0.02 - v[i] * 0.04;
		for (let p = 0; p < 5; p++) {
			for (let i = 0; i < N; i++) {
				if (i > 0) { L[i] = 0.14 * (h[i] - h[i - 1]); v[i - 1] += L[i]; }
				if (i < N - 1) { R[i] = 0.14 * (h[i] - h[i + 1]); v[i + 1] += R[i]; }
			}
			for (let i = 0; i < N; i++) { if (i > 0) h[i - 1] += L[i]; if (i < N - 1) h[i + 1] += R[i]; }
		}
		for (let i = 0; i < N; i++) { h[i] += v[i]; if (h[i] > 4.5) h[i] = 4.5; else if (h[i] < -5.5) h[i] = -5.5; }
	};
	const size = () => {
		const d = window.devicePixelRatio || 1, r = box.getBoundingClientRect();
		W = r.width; H = r.height;
		if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
	};

	const step = dt => {
		t += dt;
		const cx = x0w, sw = sw1, Z = cam().Z;
		if (mode === 'fall') {
			ship.vy += gShip * dt; ship.y += ship.vy * dt; ship.rot += ship.vr * dt;
			if (ship.y >= surfAt(cx)) {
				mode = 'float'; hitAt = t;
				const p = (ship.vy * Z) / H0, q = 1 / Z;
				for (let i = idx(cx - sw * 0.42); i <= idx(cx + sw * 0.42); i++) v[i] += p * 9 * q;
				for (let i = idx(cx + sw * 0.42); i <= idx(cx + sw * 0.75); i++) v[i] -= p * 5 * q;
				for (let i = idx(cx - sw * 0.75); i <= idx(cx - sw * 0.42); i++) v[i] -= p * 4 * q;
				for (let i = 0; i < 110; i++) { const x = cx + sw * (0.3 + Math.random() * 0.2); drops.push({ x, y: surfAt(x) - 2 * q, vx: (30 + Math.random() * 200) * p * 1.6 * q, vy: -(120 + Math.random() * 420) * p * 1.5 * q, r: (0.8 + Math.random() * 2.2) * q, a: 0.5 + Math.random() * 0.5, life: 1 }); }
				for (let i = 0; i < 50; i++) { const x = cx - sw * (0.3 + Math.random() * 0.16); drops.push({ x, y: surfAt(x) - 2 * q, vx: -(20 + Math.random() * 120) * p * 1.4 * q, vy: -(90 + Math.random() * 300) * p * 1.4 * q, r: (0.7 + Math.random() * 1.8) * q, a: 0.45 + Math.random() * 0.45, life: 1 }); }
				for (let i = 0; i < 44; i++) { const x = cx - sw * 0.7 + Math.random() * sw * 1.4; foam.push({ x, vx: (x - cx) * 1.4, r: (4 + Math.random() * 9) * q, a: 0.18 + Math.random() * 0.25, life: 1, decay: 0.22 + Math.random() * 0.3 }); }
				ship.vy *= 0.3;
				title.style.opacity = 1;
			}
		} else if (mode === 'float') {
			if (t - hitAt > FLOAT) {
				mode = 'morph'; morphAt = t; title.style.opacity = 0;
				// From here the card is placed by hand, from where it stands
				// to where the clock is.
				const r = box.getBoundingClientRect();
				Object.assign(box.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, maxWidth: 'none', aspectRatio: 'auto', margin: '0' });
				box.dataset.from = JSON.stringify([r.left, r.top, r.width, r.height]);
			}
		} else if (mode === 'morph') {
			u = Math.min(1, (t - morphAt) / MORPH); e = ease(u);
			const [l0, t0r, w0, h0] = JSON.parse(box.dataset.from);
			const to = target() || { left: l0 + (w0 - Wf) / 2, top: t0r + h0 / 2 - Hf / 2, width: Wf, height: Hf };
			// The card is as tall as the strip's world at the camera's zoom:
			// it frames that world and nothing else all the way down, no
			// empty sky over it and no dark water under it.
			const hz = Math.max(to.height, to.height * cam().Z);
			Object.assign(box.style, {
				left: `${lerp(l0, to.left, e)}px`, top: `${lerp(t0r + (h0 - hz) / 2 * (1 - e), to.top, e)}px`,
				width: `${lerp(w0, to.width, e)}px`, height: `${hz}px`,
				borderRadius: `${lerp(12, 2, e)}px`
			});
			fx.style.backgroundColor = `rgba(${shade},${0.55 * (1 - e)})`;
			fx.style.backdropFilter = `blur(${3 * (1 - e)}px)`;
			if (u >= 1) { finish(); return; }
		}
		if (mode !== 'fall') {
			const sL = surfAt(cx - sw * 0.3), sR = surfAt(cx + sw * 0.3), slope = Math.atan2(sR - sL, sw * 0.6), aimY = (sL + sR) / 2, prev = ship.y;
			ship.vy += (aimY - ship.y) * lerp(22, 40, e) * dt - ship.vy * lerp(2.6, 4, e) * dt; ship.y += ship.vy * dt;
			ship.vr += (slope * 0.5 - ship.rot) * 14 * dt - ship.vr * 3 * dt; ship.rot += ship.vr * dt;
			const dy = ship.y - prev;
			if (Math.abs(dy) > 0.01 && e < 1) for (let i = idx(cx - sw * 0.4); i <= idx(cx + sw * 0.4); i++) v[i] += dy * 0.1;
		}
		sim();
		const g = lerp(gA, gB, e);
		drops = drops.filter(p => { p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.995; p.life -= dt; if (p.y > surfAt(p.x) && p.vy > 0) { if (Math.random() < 0.25) foam.push({ x: p.x, vx: p.vx * 0.2, r: p.r * 2.2, a: p.a * 0.3, life: 1, decay: 0.8 }); return false; } return p.life > 0; });
		foam = foam.filter(f => { f.life -= f.decay * dt; f.x += f.vx * dt; f.vx *= 0.95; return f.life > 0; });
	};

	const water = (ctx, fn, alphaTop, vx0, vx1, vy1, lw) => {
		const ia = Math.max(0, idx(vx0) - 1), ib = Math.min(N - 1, idx(vx1) + 1), bot = vy1 + 6;
		ctx.beginPath(); ctx.moveTo(colX(ia), bot);
		for (let i = ia; i <= ib; i++) ctx.lineTo(colX(i), fn(i));
		ctx.lineTo(colX(ib), bot); ctx.closePath();
		const gr = ctx.createLinearGradient(0, yb - 6, 0, Hf + 4);
		gr.addColorStop(0, `rgba(${blue},${alphaTop})`); gr.addColorStop(0.5, `rgba(${deep},.95)`); gr.addColorStop(1, `rgb(${shade})`);
		ctx.fillStyle = gr; ctx.fill();
		ctx.beginPath(); for (let i = ia; i <= ib; i++) { const x = colX(i), y = fn(i); if (i === ia) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
		ctx.strokeStyle = `rgba(${blue},.5)`; ctx.lineWidth = lw; ctx.stroke();
	};

	const draw = () => {
		const ctx = cv.getContext('2d'), d = window.devicePixelRatio || 1, { Z, tx, ty } = cam();
		const cx = x0w, sw = sw1, sh = sh1;
		ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
		ctx.setTransform(d * Z, 0, 0, d * Z, d * tx, d * ty);
		const vx0 = -tx / Z, vx1 = (W - tx) / Z, vy0 = -ty / Z, vy1 = (H - ty) / Z, lw = 1 / Z;
		const sky = ctx.createLinearGradient(0, vy0, 0, yb);
		sky.addColorStop(0, skyTop); sky.addColorStop(1, `rgb(${deep})`);
		ctx.fillStyle = sky; ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
		ctx.globalAlpha = 0.6; water(ctx, i => yb - 5 + h[i] * 0.3 + ambient(colX(i) + 200, t * 0.7), 0.22, vx0, vx1, vy1, lw); ctx.globalAlpha = 1;
		// The pier at the far end, and its lamp: the leg's end, there from the start.
		const ps = surfAt(pierX);
		ctx.fillStyle = tok('--ink-faint', '#5b6b7c'); ctx.globalAlpha = 0.85;
		ctx.fillRect(pierX - 9, ps - 9, 18, 2); ctx.fillRect(pierX - 7, ps - 8, 2, 12); ctx.fillRect(pierX + 5, ps - 8, 2, 12); ctx.fillRect(pierX + 7, ps - 18, 1.5, 10);
		ctx.globalAlpha = 1;
		ctx.beginPath(); ctx.arc(pierX + 7.8, ps - 19, 1.8, 0, Math.PI * 2);
		ctx.fillStyle = tok('--gold', '#e0b35a'); ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
		if (pic.complete && pic.naturalWidth) {
			// Its reflection, while the camera is close enough to see one.
			if (e < 1 && mode !== 'fall') {
				ctx.save(); ctx.beginPath(); ctx.rect(vx0, yb - 8, vx1 - vx0, vy1 - yb + 8); ctx.clip();
				ctx.translate(cx, surfAt(cx) + 1.2); ctx.scale(-1, -0.55); ctx.rotate(-ship.rot * 0.5); ctx.globalAlpha = 0.22 * (1 - e);
				ctx.drawImage(pic, -sw / 2, -sh * 0.88, sw, sh); ctx.restore();
			}
			// Drawn as the clock draws it, so the hand-over does not move it:
			// the same sprite, made once at the close-up's sharpness.
			if (!sprite) sprite = shipSprite(pic, sw, sh, d * Z0);
			ctx.save(); ctx.translate(cx, ship.y + sh * 0.03); ctx.rotate(ship.rot * 0.6);
			ctx.drawImage(sprite.c, -sprite.ox, -sprite.oy, sprite.w, sprite.h); ctx.restore();
		}
		water(ctx, surf, 0.5, vx0, vx1, vy1, lw);
		const blob = foamSprite();
		for (const f of foam) {
			const y = surfAt(f.x), rx = f.r * (1 + (1 - f.life) * 1.7), ry = Math.max(0.15, f.r * 0.28);
			ctx.globalAlpha = f.a * f.life; ctx.drawImage(blob, f.x - rx, y - ry, rx * 2, ry * 2);
		}
		ctx.fillStyle = 'rgb(215,230,240)';
		for (const p of drops) { ctx.globalAlpha = p.a * Math.min(1, p.life * 1.5); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
		ctx.globalAlpha = 1;
		// The ship's shadow on the water, growing as it falls.
		if (mode === 'fall') {
			const sy = surfAt(cx), k = Math.max(0, Math.min(1, 1 - (sy - ship.y) / ((H0 * 0.9) / Z)));
			ctx.beginPath(); ctx.ellipse(cx, sy + 1, sw * 0.46 * k, 1.2 * k, 0, 0, Math.PI * 2); ctx.fillStyle = `rgba(0,0,0,${0.45 * k})`; ctx.fill();
		}
	};

	let last = performance.now();
	const loop = now => {
		if (done) return;
		size();
		step(Math.min(40, now - last) / 1000);
		last = now;
		if (!done) { draw(); raf = requestAnimationFrame(loop); }
	};
	raf = requestAnimationFrame(loop);
}
