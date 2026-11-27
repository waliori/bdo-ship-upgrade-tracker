// The Special Barter gauge, on the page: the field beside the Parley,
// the dialog behind it, and the figure in the cockpit.
//
// The counting is js/special-barter.js; this reads the profile -- when
// the last one came, what was added by hand -- and the runs recorded
// since, and says where the sailor stands. Reporting one is for the
// signed-in: a report goes into the save, and the fleet's table on the
// Community tab is added up from the signed-in saves.

import { esc, F } from './fmt.js';
import { T } from './i18n.js';
import * as store from './state.js';
import { openDialog, closeDialog, toast } from './dialogs.js';
import { me, feature, signIn } from './sync.js';
import { COMMUNITY, TIERS, POOL, ZONE, countsSince, plus, standing, addTo } from './special-barter.js';

/** How the gauge is drawn: the bar runs a little past the zone's end. */
const SCALE = Math.max(1.15, ZONE.hi * 1.05);

/** A tier as a sailor says it. */
export function tierName(t) {
	if (t === '0') return T('a land good → Level 1');
	if (t === '4g') return T('Level 4 → Great Ocean (25M)');
	if (t === '4') return T('Level 4 → Level 5 (10M)');
	if (t === 'mix') return T('Level 4 → 5, not noted which');
	return T('Level {from} → Level {to}', { from: Number(t), to: Number(t) + 1 });
}

const special = () => store.getProfile('special', {}) || {};

/** Where the sailor stands now: null until they have said when the last
 *  one came. */
export function specialNow() {
	const sp = special();
	if (!sp.since) return null;
	const recorded = countsSince(store.getProfile('runs', []), sp.since);
	const counts = plus(recorded, sp.plus);
	return { since: sp.since, recorded, hand: sp.plus || {}, counts, ...standing(counts) };
}

const pct = f => `${Math.round(f * 100)}%`;

/** The bar, with the zone where most came marked on it. */
function gaugeHTML(fill) {
	const at = x => `${Math.min(100, (x / SCALE) * 100).toFixed(1)}%`;
	return `<div class="sp-gauge${fill >= ZONE.lo ? ' in' : ''}"><div class="run-bar sp"><i style="width:${at(fill)}"></i></div><span class="sp-zone" style="left:${at(ZONE.lo)};width:calc(${at(ZONE.hi)} - ${at(ZONE.lo)})" title="${T('where the community saw it come: {lo} to {hi} of the pool', { lo: pct(ZONE.lo), hi: pct(ZONE.hi) })}"></span></div>`;
}

/** What is left, in words. */
function leftLine(s) {
	if (!s.barters) return T('nothing counted since — the runs you record add to it');
	if (s.inside) return T('it can come any time now');
	return T('about {lo} to {hi} more barters, as you barter', { lo: F(s.left), hi: F(s.most) });
}

/** The field beside the Parley on the Barter tab. */
export function specialFieldHTML() {
	const s = specialNow();
	return `<div class="parley-field sp-field"><span class="summary-k">✧ ${T('Special Barter')}</span>
		${s ? `<b class="sp-fill">≈ ${pct(s.fill)}</b>${gaugeHTML(s.fill)}<em>${esc(leftLine(s))}</em>`
			: `<em>${T('When did the last one come? Say it once, and the barters you record count towards the next.')}</em>`}
		<button class="chip tiny" data-act="special-open">${s ? T('Details') : T('Set it up')}</button>
	</div>`;
}

/** The gauge in a few words, for the Parley step's line. */
export function specialLine() {
	const s = specialNow();
	return s ? T('Special Barter ≈ {n}', { n: pct(s.fill) }) : '';
}

/**
 * The cockpit's figure: the gauge once this stop is traded, counting
 * the run's stops up to here, and where it crosses into the zone.
 */
export function specialFigHTML(stops, at) {
	const s = specialNow();
	if (!s || at < 0) return '';
	const run = {};
	let before = 0;
	for (let k = 0; k <= at && k < stops.length; k++) {
		if (stops[k].npcId) addTo(run, stops[k].give, stops[k].item, stops[k].times);
		if (k === at - 1) before = standing(plus(s.counts, run)).fill;
	}
	const after = standing(plus(s.counts, run)).fill;
	if (at === 0) before = s.fill;
	const crosses = before < ZONE.lo && after >= ZONE.lo;
	return `<div class="cockpit-fig sp"><div class="cockpit-fig-k"><span>✧ ${T('Special Barter')}</span><span>${after >= ZONE.lo ? T('can come now') : ''}</span></div>
		<div class="cockpit-fig-v">${Math.round(before * 100) !== Math.round(after * 100) ? `<span>${pct(before)}</span><i>→</i>` : ''}<b class="${after >= ZONE.lo ? 'amber' : ''}">${pct(after)}</b></div>
		${gaugeHTML(after)}
		${crosses ? `<span class="run-note">${T('From this stop on a Special Barter can come: watch for the message, and look at the island the Barter Information window names.')}</span>` : ''}</div>`;
}

/** A date for the datetime field, in the sailor's own clock. */
function localInput(ms) {
	const d = new Date(ms);
	const two = n => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** The dialog: the gauge, each tier's count, the date, and the report. */
export function openSpecial({ editDate = false } = {}) {
	const s = specialNow();
	const asking = !s || editDate;
	const signed = me() !== null;
	const synced = feature('sync');
	const rows = TIERS.map(t => {
		const rec = s ? s.recorded[t] || 0 : 0, hand = s ? s.hand[t] || 0 : 0;
		return `<tr><td>${esc(tierName(t))}</td><td class="num">${F(rec)}</td>
			<td><input class="purse-inline narrow" type="text" inputmode="numeric" data-sp-hand="${t}" value="${hand ? hand : ''}" placeholder="0" aria-label="${T('Added by hand: {tier}', { tier: tierName(t) })}"></td>
			<td class="num">${(100 / POOL[t]).toFixed(2)}%</td></tr>`;
	}).join('');
	const when = `<div class="sp-when">
		<p class="dialog-copy">${s ? T('When did the last one come?') : T('When did your last Special Barter come? The barters the app recorded since then are counted; any you made without it can be added by hand.')}</p>
		<input class="field" type="datetime-local" data-sp-when value="${localInput(s ? s.since : Date.now())}" max="${localInput(Date.now())}">
		<div class="dialog-actions">
			${s ? `<button class="ghost-btn" data-sp-back>${T('Cancel')}</button>` : ''}
			<button class="ghost-btn" data-sp-now>${T('I do not know — count from now')}</button>
			<button class="act" data-sp-set>${T('Count from then')}</button>
		</div></div>`;
	const report = synced
		? signed
			? `<button class="act" data-sp-report>${T('A Special Barter came — report it')}</button>`
			: `<button class="act" data-sp-signin>${T('Sign in to report one')}</button>`
		: `<button class="act" data-sp-reset>${T('A Special Barter came — start again')}</button>`;
	const host = openDialog(`<h2>✧ ${T('Special Barter')}</h2>
		<p class="dialog-copy">${T('The game only says that the more barters you complete, the likelier a Special Barter becomes: the server decides, and nothing in the game’s files says when. Read as one pool every barter adds to, the community’s counts give each tier its weight — a Level 6 → 7 counts about twelve times a land good → Level 1. The marked zone is where they saw it come.')}</p>
		${asking ? when : `
		<div class="sp-head"><b class="sp-fill">≈ ${pct(s.fill)}</b><span>${esc(leftLine(s))}</span></div>
		${gaugeHTML(s.fill)}
		<p class="dialog-copy faint">${T('Counting since {date}.', { date: esc(new Date(s.since).toLocaleString()) })} <button class="linky" data-sp-date>${T('change')}</button></p>
		<div class="routes-table"><table class="sp-table"><thead><tr><th>${T('Barter')}</th><th class="num">${T('barters|recorded')}</th><th>${T('added by hand')}</th><th class="num">${T('one is worth')}</th></tr></thead><tbody>${rows}</tbody></table></div>
		<p class="dialog-copy faint">${synced ? T('A report sends the barters of each tier it took to the fleet’s table on the Community tab — counts only — and the gauge starts again from that moment.') : T('The gauge starts again from that moment.')} ${T('The weights are the community’s counts from their Discord; the fleet’s reports refine them.')}</p>
		<div class="dialog-actions"><button class="ghost-btn" data-close>${T('Close')}</button>${report}</div>`}`);

	const write = (next, label) => store.setProfile('special', { ...special(), ...next }, label);
	const on = (sel, fn) => { const b = host.querySelector(sel); if (b) b.addEventListener('click', fn); };
	on('[data-sp-set]', () => {
		const ms = Date.parse(host.querySelector('[data-sp-when]').value);
		if (!(ms > 0)) return;
		write({ since: Math.min(ms, Date.now()) });
		openSpecial();
	});
	on('[data-sp-now]', () => { write({ since: Date.now(), plus: {} }); openSpecial(); });
	on('[data-sp-back]', () => openSpecial());
	on('[data-sp-date]', () => openSpecial({ editDate: true }));
	on('[data-sp-signin]', () => signIn());
	on('[data-sp-reset]', () => { write({ since: Date.now(), plus: {} }, T('Started the Special Barter gauge again')); closeDialog(); });
	on('[data-sp-report]', () => {
		const now = specialNow();
		const c = Object.fromEntries(Object.entries(now.counts).filter(([, n]) => n > 0));
		write({ since: Date.now(), plus: {}, reports: [...(special().reports || []), { at: Date.now(), c }] }, T('Reported a Special Barter'));
		closeDialog();
		toast(T('Reported: the fleet’s table counts it at the next refresh, and the gauge starts again.'));
	});
	for (const box of host.querySelectorAll('[data-sp-hand]')) {
		box.addEventListener('change', () => {
			const n = Math.round(Number(String(box.value).replace(/[^\d-]/g, '')) || 0);
			write({ plus: { ...(special().plus || {}), [box.dataset.spHand]: n } });
			openSpecial();
		});
	}
}

/** The community's own column for a tier: how many readings, the least
 *  and the most. */
export function communityOf(t) {
	const xs = COMMUNITY[t];
	return { n: xs.length, lo: Math.min(...xs), hi: Math.max(...xs) };
}
