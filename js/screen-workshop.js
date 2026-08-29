// The Workshop: everything craftable right now, and every part worth an
// enhancement attempt.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { img, codexName, amountInput, whereFrom } from './ui-bits.js';
import { recipes, snapshot, readyCrafts } from './ui-state.js';
import { parseEnhanced, enhancedName, enhanceStep, ownedLevel, enhancementForecast } from './planner.js';

/**
 * Every part worth an enhancement attempt: the ones a build is waiting
 * on, and anything enhanceable already sitting in your inventory --
 * because a part you levelled for its own sake is still a part you want
 * to take further.
 */
/** The odds on this single attempt, and when the pity meter fills. */
export function odds(e) {
	const s = e.step1 && e.step1.steps[0];
	if (!s || s.chance >= 1) return '';
	const pct = s.chance < 0.01 ? (s.chance * 100).toFixed(1) : Math.round(s.chance * 100);
	return `<span class="enh-odds">${pct}% · certain after ${s.agris} fails</span>`;
}

/**
 * What the rest of the climb costs. The recipe only ever describes one
 * successful attempt per level, which for a Chiro part is out by more
 * than tenfold -- so say what it will really take, and what it cannot
 * exceed.
 */
export function outlook(e) {
	const f = e.forecast;
	if (!f || e.next >= e.want) return '';
	return `<span class="enh-outlook" title="Expected cost of every attempt from +${e.have} to +${e.want}, and the most it can possibly take">
		to +${e.want}: <b>${F(f.expected)}</b> expected · ${F(f.ceiling)} at worst
	</span>`;
}

export function pendingEnhancements() {
	const stock = store.getAllStock();
	const targets = new Map();

	// Levels a build is asking for.
	for (const item of Object.keys(snapshot.toCraft)) {
		const { level, base } = parseEnhanced(item);
		if (level > 0) {
			targets.set(base, { want: Math.max(targets.get(base)?.want || 0, level), forBuild: true });
		}
	}

	// Anything enhanceable you hold, whether or not a build wants it yet.
	for (const item of Object.keys(stock)) {
		const { base } = parseEnhanced(item);
		if (!recipes[`+1 ${base}`]) continue;
		if (!targets.has(base)) targets.set(base, { want: 10, forBuild: false });
	}

	const out = [];
	for (const [base, { want, forBuild }] of targets) {
		const have = ownedLevel(base, stock);
		if (have >= want) continue;

		const step = enhanceStep(base, have + 1);
		if (!step) continue;

		// Yellow gear spends Cron Stones alongside the enhancement stone,
		// so an attempt costs a list, not one thing.
		const costs = Object.entries(step.stones);
		const stoneName = costs[0] ? costs[0][0] : 'Tidal Black Stone';
		const stoneQty = costs[0] ? costs[0][1] : 0;
		const affordable = Object.entries(step.stones).every(([st, q]) => (stock[st] || 0) >= q);
		const holds = (stock[step.from] || 0) > 0;

		out.push({
			base,
			have,
			next: have + 1,
			want,
			forecast: enhancementForecast(base, have, want),
			step1: enhancementForecast(base, have, have + 1),
			forBuild,
			costs,
			stoneName,
			stoneQty,
			affordable,
			holds,
			blocked: !affordable || !holds,
			note: !holds
				? `you do not own ${have > 0 ? `a +${have}` : 'the base'} part yet${whereFrom(step.from)}`
				: !affordable
					? `not enough ${stoneName}`
					: forBuild
						? `a build needs +${want}`
						: `yours to enhance · up to +${want}`
		});
	}

	// Build-driven work first, then whatever you can actually afford.
	return out.sort((a, b) =>
		(b.forBuild - a.forBuild) || (a.blocked - b.blocked) || a.base.localeCompare(b.base));
}

export function renderWorkshop() {
	const stock = store.getAllStock();
	const ready = readyCrafts();

	const cards = ready.map(c => {
		const recipe = recipes[c.item] || {};
		const ings = Object.entries(recipe).map(([ing, per]) => {
			const have = stock[ing] || 0;
			return `<span class="ing ${have < per ? 'short' : ''}" title="${esc(ing)}">
				${img(ing, '')}${F(have)}/${F(per)}
			</span>`;
		}).join('');
		return `<div class="craft-card" data-peek="${esc(c.item)}">
			<div class="craft-top">
				${img(c.item, '')}
				<div>
					<div class="craft-name">${codexName(c.item)}</div>
					<div class="craft-times">×${F(c.possible)} possible now</div>
				</div>
			</div>
			<div class="ings">${ings}</div>
			<div class="craft-actions">
				${amountInput('craft-n', 1, `data-act="craft-n" data-item="${esc(c.item)}" aria-label="How many to craft"`)}
				<button class="act go" data-act="craft" data-item="${esc(c.item)}" data-times="field">Craft</button>
				<button class="act quiet" data-act="craft" data-item="${esc(c.item)}" data-times="${c.possible}">All ${F(c.possible)}</button>
			</div>
		</div>`;
	}).join('');

	const enhRows = pendingEnhancements().map(e => `
		<div class="row" data-base="${esc(e.base)}" data-level="${e.next}" data-peek="${esc(enhancedName(e.base, e.next))}" ${e.blocked ? 'style="opacity:.55"' : ''}>
			${img(enhancedName(e.base, e.have), 'row-icon md')}
			<div class="row-main">
				<div class="row-name">${codexName(e.base)}</div>
				<div class="row-sub" ${e.blocked ? 'style="color:var(--red)"' : ''}>${esc(e.note)}</div>
			</div>
			<span class="enh-level">+${e.have} → +${e.next}</span>
			<span class="enh-cost">${e.costs.map(([n, q]) => `${img(n, '')}×${F(q)}`).join('')}${odds(e)}</span>
			${outlook(e)}
			<span class="enh-actions">
				<button class="pill-btn" data-act="enhance" data-result="success" ${e.blocked ? 'disabled' : ''}>Succeeded</button>
				<button class="pill-btn bad" data-act="enhance" data-result="fail" ${e.blocked ? 'disabled' : ''}>Failed</button>
			</span>
		</div>`).join('');

	return `<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title teal">Ready to craft</h2>
			<span class="panel-sub">Crafting moves real stock: ingredients out, product in</span>
		</div>
		${ready.length
			? `<div class="craft-grid">${cards}</div>`
			: '<p class="empty">Nothing can be made from what is on hand right now.</p>'}
	</div>
	<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title">Enhancement</h2>
			<span class="panel-sub">Everything you own that can go higher. Record what happened — the materials are spent either way. Blue and green parts keep their level on a failure; yellow ones would drop a level, which is what the Cron Stones in the cost are holding</span>
		</div>
		${enhRows || '<p class="empty">Nothing in your inventory can be enhanced. Add a ship part and it will show up here.</p>'}
	</div>`;
}
