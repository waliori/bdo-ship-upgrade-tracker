// The Plan: every build flattened to one row per material, grouped by
// what stands between you and done, with the one next step called out.

import { esc, F } from './fmt.js';
import { T, gameName } from './i18n.js';
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
		{ k: T('Fleet progress'), v: `${pct}%`, sub: T('of all required units covered'), cls: 'teal' },
		{ k: T('Units covered'), v: `${F(have)} / ${F(need)}`, sub: T('across every active build'), cls: '' },
		{ k: T('Still missing'), v: F(totals.lines), sub: T('materials with nothing behind them'), cls: totals.lines ? 'amber' : 'teal' },
		{ k: T('Craftable now'), v: F(ready.length), sub: T('recipes ready from stock'), cls: ready.length ? 'teal' : 'off' }
	];

	const statHTML = `<div class="stats">${stats.map(s => `
		<div class="stat">
			<div class="stat-k">${esc(s.k)}</div>
			<div class="stat-v ${s.cls}">${esc(s.v)}</div>
			<div class="stat-sub">${esc(s.sub)}</div>
		</div>`).join('')}</div>`;

	const readyHTML = ready.length ? `<div class="readybar">
		<div class="readybar-label">${T('Ready to craft')}</div>
		<div class="readybar-list">${ready.slice(0, 8).map(c => `
			<button class="ready-chip" data-act="craft" data-item="${esc(c.item)}" data-times="${c.suggested}" data-peek="${esc(c.item)}" title="${T('Craft {n} now', { n: F(c.suggested) })}">
				${img(c.item, '')}${F(c.suggested)}× ${esc(gameName(c.item))}
			</button>`).join('')}${ready.length > 8
			? `<button class="ready-chip more" data-act="view" data-id="workshop" title="${T('The Workshop lists every one')}">${T('and {n} more…', { n: ready.length - 8 })}</button>` : ''}</div>
	</div>` : '';

	const filters = [
		['all', T('Everything')], ['short', T('Missing only')], ['craft', T('To craft')], ['done', T('Covered')]
	].map(([id, label]) =>
		`<button class="chip ${planFilter === id ? 'active' : ''}" data-act="plan-filter" data-id="${id}" aria-pressed="${planFilter === id}">${label}</button>`
	).join('');

	const q = query.toLowerCase();
	const entries = Object.entries(rows)
		.filter(([item]) => !q || item.toLowerCase().includes(q))
		.map(([item, r]) => ({ item, r, covered: r.short === 0 && r.craft === 0 }));

	const groupsDef = [
		[T('What you are building'), T('the queued items themselves — everything below feeds these'), 'blue',
			p => p.r.isTarget, 'target'],
		[T('Missing'), T('buy, barter, gather or hunt these'), 'red', p => !p.r.isTarget && p.r.short > 0, 'short'],
		[T('To craft'), T('recipes standing between you and done'), 'blue',
			p => !p.r.isTarget && p.r.short === 0 && p.r.craft > 0, 'craft'],
		[T('Covered'), T('fully reserved from stock'), 'teal', p => !p.r.isTarget && p.covered, 'done']
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
				: `<div class="panel"><p class="empty">${T('Nothing matches that filter.')}</p></div>`);
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
		msg = ready.length === 1
			? T('You can craft {item} right now.', { item: gameName(ready[0].item) })
			: T('You can craft {n} recipes right now.', { n: ready.length });
		cta = [T('Open Workshop'), 'workshop'];
	} else if (pending.length) {
		msg = pending.length === 1
			? T('{n} enhancement attempt is affordable.', { n: pending.length })
			: T('{n} enhancement attempts are affordable.', { n: pending.length });
		cta = [T('Open Workshop'), 'workshop'];
	} else if (shortCount) {
		msg = shortCount === 1
			? T('Nothing to make yet — {n} item is still missing. Record what you gather in the boxes below.', { n: shortCount })
			: T('Nothing to make yet — {n} items are still missing. Record what you gather in the boxes below.', { n: shortCount });
		cta = [T('See the shopping list'), 'get'];
	} else {
		msg = T('Everything your builds need is on hand.');
	}

	return `<div class="next-step">
		<span class="next-label">${T('Next')}</span>
		<span class="next-msg">${esc(msg)}</span>
		${cta ? `<button class="act quiet next-cta" data-act="view" data-id="${cta[1]}">${esc(cta[0])}</button>` : ''}
	</div>`;
}

/** The loop to follow, for anyone opening the tracker for the first time. */
export function startHere() {
	const steps = [
		[T('Queue what you want to build'), T('A ship, a Chiro part, or a stack of materials. Order them by what you want finished first.'), T('Add a build'), 'builds'],
		[T('Say what you already own'), T('Set quantities here on the Plan with the − number + box on each row, or from the Inventory grid.'), T('Open Inventory'), 'inventory'],
		[T('Work the list'), T('Whatever is left shows as Missing. The Workshop makes anything you have the materials for, and handles enhancing.'), T('Open Workshop'), 'workshop'],
		[T('Take the shopping list with you'), T('To Get groups everything outstanding by how you actually obtain it, with Crow Coin and silver totals.'), T('Open To Get'), 'get']
	];
	return `<div class="panel start-here">
		<div class="panel-head">
			<h2 class="panel-title plain">${T('How this works')}</h2>
			<span class="panel-sub">${T('Four steps, then it is just keeping the numbers current')}</span>
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
		<input class="field" type="search" placeholder="${T('Search materials…')}" value="${esc(query)}" data-act="query" aria-label="${T('Search materials')}">
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
	if (r.take) legend.push(T('{n} from stock', { n: F(r.take) }));
	if (r.craft) legend.push(T('{n} to craft', { n: F(r.craft) }));
	if (r.short) legend.push(T('{n} missing', { n: F(r.short) }));

	const enhanced = parseEnhanced(item).level > 0;
	const who = (r.resv || []).slice(0, 2)
		.map(v => (v.via && v.via !== item
			? T('{item}, via {via}', { item: gameName(v.targetItem), via: gameName(v.via) })
			: gameName(v.targetItem)));
	const src = sourceOf(item);
	let sub = who.length ? T('reserved for {who}', { who: who.join(' · ') }) : (src ? src.label : T('intermediate craft'));
	if (enhanced) sub = T('enhanced in the Workshop');
	// Goes first, ahead of the reservation text -- the sub line is
	// ellipsised, and otherwise a craftable material sitting in Missing
	// looks like a bug rather than a choice.
	if (!enhanced && recipes[item] && store.getStrategy(item) === 'buy') {
		sub = T('buying rather than crafting · {sub}', { sub });
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
		? T('covered')
		: r.short > 0
			? (bought ? T('{n} to buy', { n: F(r.short) }) : T('{n} short', { n: F(r.short) }))
			: enhanced
				? T('to enhance')
				: can ? T('craftable now') : T('to craft');
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
			<span class="own" title="${T('How many you own')}">
				<button class="sq-btn" data-act="own" data-item="${esc(item)}" data-delta="-1" aria-label="${T('One fewer')}">−</button>
				${amountInput('own-input', own, `data-act="own-set" data-item="${esc(item)}" aria-label="${T('How many {item} you own', { item: esc(gameName(item)) })}"`)}
				<button class="sq-btn" data-act="own" data-item="${esc(item)}" data-delta="1" aria-label="${T('One more')}">+</button>
			</span>
			<span class="badge ${badgeCls}">${esc(badge)}</span>
			${can ? `<button class="mini-btn" data-act="craft" data-item="${esc(item)}" data-times="1">${T('Craft')}</button>` : ''}
		</div>
	</div>`;
}
