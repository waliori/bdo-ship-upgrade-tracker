// The Plan: every build flattened to one row per material, grouped by
// what stands between you and done, with the one next step called out.

import { esc, F } from './fmt.js';
import { todayStrip } from './today.js';
import * as store from './state.js';
import { img, codexName, amountInput, sourceOf } from './ui-bits.js';
import {
	recipes, rows, snapshot, query, planFilter, sort, sorter, sortSelect,
	readyCrafts, craftStock, totalsToGo
} from './ui-state.js';
import { maxCraftable, parseEnhanced } from './planner.js';
import { pendingEnhancements } from './screen-workshop.js';


export function renderPlan() {
	const totals = totalsToGo();
	const ready = readyCrafts();

	let need = 0;
	let have = 0;
	for (const r of Object.values(rows)) {
		need += r.need;
		have += r.need - r.short;
	}
	const pct = need ? Math.round((have / need) * 100) : 0;

	// What the money costs is on the pouch, right above these -- To Get
	// carries the exact breakdown -- so it is not repeated here.
	const stats = [
		{ k: 'Fleet progress', v: `${pct}%`, sub: 'of all required units covered', cls: 'teal' },
		{ k: 'Units covered', v: `${F(have)} / ${F(need)}`, sub: 'across every active build', cls: '' },
		{ k: 'Still missing', v: F(totals.lines), sub: 'materials with nothing behind them', cls: totals.lines ? 'amber' : 'teal' },
		{ k: 'Craftable now', v: F(ready.length), sub: 'recipes ready from stock', cls: ready.length ? 'teal' : 'off' }
	];

	const statHTML = `<div class="stats">${stats.map(s => `
		<div class="stat">
			<div class="stat-k">${esc(s.k)}</div>
			<div class="stat-v ${s.cls}">${esc(s.v)}</div>
			<div class="stat-sub">${esc(s.sub)}</div>
		</div>`).join('')}</div>`;

	const readyHTML = ready.length ? `<div class="readybar">
		<div class="readybar-label">Ready to craft</div>
		<div class="readybar-list">${ready.slice(0, 8).map(c => `
			<button class="ready-chip" data-act="craft" data-item="${esc(c.item)}" data-times="${c.suggested}" data-peek="${esc(c.item)}" title="Craft ${F(c.suggested)} now">
				${img(c.item, '')}${F(c.suggested)}× ${esc(c.item)}
			</button>`).join('')}${ready.length > 8
			? `<button class="ready-chip more" data-act="view" data-id="workshop" title="The Workshop lists every one">and ${ready.length - 8} more…</button>` : ''}</div>
	</div>` : '';

	const filters = [
		['all', 'Everything'], ['short', 'Missing only'], ['craft', 'To craft'], ['done', 'Covered']
	].map(([id, label]) =>
		`<button class="chip ${planFilter === id ? 'active' : ''}" data-act="plan-filter" data-id="${id}" aria-pressed="${planFilter === id}">${label}</button>`
	).join('');

	const q = query.toLowerCase();
	const entries = Object.entries(rows)
		.filter(([item]) => !q || item.toLowerCase().includes(q))
		.map(([item, r]) => ({ item, r, covered: r.short === 0 && r.craft === 0 }));

	const groupsDef = [
		['What you are building', 'the queued items themselves — everything below feeds these', 'blue',
			p => p.r.isTarget, 'target'],
		['Missing', 'buy, barter, gather or hunt these', 'red', p => !p.r.isTarget && p.r.short > 0, 'short'],
		['To craft', 'recipes standing between you and done', 'blue',
			p => !p.r.isTarget && p.r.short === 0 && p.r.craft > 0, 'craft'],
		['Covered', 'fully reserved from stock', 'teal', p => !p.r.isTarget && p.covered, 'done']
	];

	const groups = groupsDef
		.filter(([, , , , id]) => planFilter === 'all' || planFilter === id)
		.map(([title, sub, col, pred]) => {
			const cmp = sorter(sort, store.getAllStock());
			const list = entries.filter(pred).sort((a, b) => cmp(a.item, b.item));
			return { title, sub: `${list.length} · ${sub}`, col, list };
		})
		.filter(g => g.list.length);

	if (!groups.length) {
		const nothingQueued = !store.getActiveTargets().length;
		return statHTML + readyHTML + (nothingQueued ? '' : controlsHTML(filters)) +
			(nothingQueued
				? startHere()
				: '<div class="panel"><p class="empty">Nothing matches that filter.</p></div>');
	}

	const groupHTML = groups.map(g => `<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title ${g.col}">${esc(g.title)}</h2>
			<span class="panel-sub">${esc(g.sub)}</span>
		</div>
		${g.list.map(({ item, r, covered }) => planRow(item, r, covered)).join('')}
	</div>`).join('');

	return nextStep() + todayStrip() + statHTML + readyHTML + controlsHTML(filters) + groupHTML;
}

/** One concrete thing to do next, based on where the plan actually stands. */
export function nextStep() {
	if (!store.getActiveTargets().length) return '';

	const ready = readyCrafts();
	const pending = pendingEnhancements().filter(e => !e.blocked);
	const shortCount = Object.keys(snapshot.missing).length;

	let msg;
	let cta = null;
	if (ready.length) {
		msg = `You can craft ${ready.length === 1 ? ready[0].item : `${ready.length} recipes`} right now.`;
		cta = ['Open Workshop', 'workshop'];
	} else if (pending.length) {
		msg = `${pending.length} enhancement ${pending.length === 1 ? 'attempt is' : 'attempts are'} affordable.`;
		cta = ['Open Workshop', 'workshop'];
	} else if (shortCount) {
		msg = `Nothing to make yet — ${shortCount} ${shortCount === 1 ? 'item is' : 'items are'} still missing. Record what you gather in the boxes below.`;
		cta = ['See the shopping list', 'get'];
	} else {
		msg = 'Everything your builds need is on hand.';
	}

	return `<div class="next-step">
		<span class="next-label">Next</span>
		<span class="next-msg">${esc(msg)}</span>
		${cta ? `<button class="act quiet next-cta" data-act="view" data-id="${cta[1]}">${esc(cta[0])}</button>` : ''}
	</div>`;
}

/** The loop to follow, for anyone opening the tracker for the first time. */
export function startHere() {
	const steps = [
		['Queue what you want to build', 'A ship, a Chiro part, or a stack of materials. Order them by what you want finished first.', 'Add a build', 'builds'],
		['Say what you already own', 'Set quantities here on the Plan with the − number + box on each row, or from the Inventory grid.', 'Open Inventory', 'inventory'],
		['Work the list', 'Whatever is left shows as Missing. The Workshop makes anything you have the materials for, and handles enhancing.', 'Open Workshop', 'workshop'],
		['Take the shopping list with you', 'To Get groups everything outstanding by how you actually obtain it, with Crow Coin and silver totals.', 'Open To Get', 'get']
	];
	return `<div class="panel start-here">
		<div class="panel-head">
			<h2 class="panel-title plain">How this works</h2>
			<span class="panel-sub">Four steps, then it is just keeping the numbers current</span>
		</div>
		<ol class="steps">${steps.map(([title, body, cta, view], i) => `
			<li class="step">
				<span class="step-n">${i + 1}</span>
				<div>
					<div class="step-title">${esc(title)}</div>
					<div class="step-body">${esc(body)}</div>
				</div>
				<button class="act quiet step-cta" data-act="view" data-id="${view}">${esc(cta)}</button>
			</li>`).join('')}</ol>
	</div>`;
}

export function controlsHTML(filters) {
	return `<div class="controls">
		<input class="field" type="search" placeholder="Search materials…" value="${esc(query)}" data-act="query" aria-label="Search materials">
		<div class="chips">${filters}</div>
		${sortSelect()}
	</div>`;
}

export function planRow(item, r, covered) {
	const total = r.need || 1;
	const segs = [];
	if (r.take) segs.push(`<i class="take" style="width:${(r.take / total) * 100}%"></i>`);
	if (r.craft) segs.push(`<i class="make" style="width:${(r.craft / total) * 100}%"></i>`);
	if (r.short) segs.push(`<i class="lack" style="width:${(r.short / total) * 100}%"></i>`);

	const legend = [];
	if (r.take) legend.push(`${F(r.take)} from stock`);
	if (r.craft) legend.push(`${F(r.craft)} to craft`);
	if (r.short) legend.push(`${F(r.short)} missing`);

	const enhanced = parseEnhanced(item).level > 0;
	const who = (r.resv || []).slice(0, 2)
		.map(v => (v.via && v.via !== item ? `${v.targetItem}, via ${v.via}` : v.targetItem));
	const src = sourceOf(item);
	let sub = who.length ? `reserved for ${who.join(' · ')}` : (src ? src.label : 'intermediate craft');
	if (enhanced) sub = 'enhanced in the Workshop';
	// Goes first, ahead of the reservation text -- the sub line is
	// ellipsised, and otherwise a craftable material sitting in Missing
	// looks like a bug rather than a choice.
	if (!enhanced && recipes[item] && store.getStrategy(item) === 'buy') {
		sub = `buying rather than crafting · ${sub}`;
	}

	// "craftable" means the materials are on hand *now* -- not merely that
	// the plan has a recipe lined up for it. The two used to be conflated,
	// which is how the Plan could badge seven rows craftable while the
	// Workshop said nothing could be made.
	const can = !enhanced && recipes[item] && r.craft > 0 && maxCraftable(item, craftStock(item), recipes) >= 1;
	// "to buy" is a route the plan is taking, so a recipe it was told not
	// to follow does not turn the badge into "short".
	const bought = !enhanced && (!recipes[item] || store.getStrategy(item) === 'buy') && src && ['coin', 'falasi', 'Market'].includes(src.key);
	const badge = covered
		? 'covered'
		: r.short > 0
			? `${F(r.short)} ${bought ? 'to buy' : 'short'}`
			: enhanced
				? 'to enhance'
				: can ? 'craftable now' : 'to craft';
	const badgeCls = covered ? 'teal' : r.short > 0 ? 'red' : can ? 'teal' : 'blue';
	const own = store.getStock(item);

	return `<div class="row" data-peek="${esc(item)}">
		${img(item)}
		<div class="row-main">
			<div class="row-name">${codexName(item)}</div>
			<div class="row-sub">${esc(sub)}</div>
		</div>
		<div class="row-meter">
			<div class="bar">${segs.join('')}</div>
			<div class="bar-legend">
				<span>${esc(legend.join(' · '))}</span>
				<span class="n">${F(own)} / ${F(r.need)}</span>
			</div>
		</div>
		<div class="row-tail">
			<span class="own" title="How many you own">
				<button class="sq-btn" data-act="own" data-item="${esc(item)}" data-delta="-1" aria-label="One fewer">−</button>
				${amountInput('own-input', own, `data-act="own-set" data-item="${esc(item)}" aria-label="How many ${esc(item)} you own"`)}
				<button class="sq-btn" data-act="own" data-item="${esc(item)}" data-delta="1" aria-label="One more">+</button>
			</span>
			<span class="badge ${badgeCls}">${esc(badge)}</span>
			${can ? `<button class="mini-btn" data-act="craft" data-item="${esc(item)}" data-times="1">Craft</button>` : ''}
		</div>
	</div>`;
}
