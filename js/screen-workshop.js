// The Workshop: everything craftable right now, and every part worth an
// enhancement attempt.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { img, codexName, amountInput, whereFrom } from './ui-bits.js';
import { recipes, snapshot, query, readyCrafts } from './ui-state.js';
import { parseEnhanced, enhancedName, enhanceStep, ownedLevel, enhancementForecast } from './planner.js';
import { massProcess } from './vendor_items.js';
import { gainAt, describeStats } from './part_stats.js';
import { tableFor } from './enhancement.js';

/**
 * Every part worth an enhancement attempt: the ones a build is waiting
 * on, and anything enhanceable already sitting in your inventory --
 * because a part you levelled for its own sake is still a part you want
 * to take further.
 */
/** The odds on this single attempt, and when the pity meter fills. */
export function odds(e) {
	const s = e.step1 && e.step1.steps[0];
	if (!s) return '';
	if (s.chance >= 1) return '<span class="enh-odds sure">always succeeds</span>';
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

/**
 * What the record says about a part so far: attempts won and lost, and
 * the stones they took. Read off the undo history, which keeps the last
 * two hundred changes -- so this is the recent record, not a lifetime.
 */
export function attemptsFor(base, stoneName) {
	const out = { won: 0, lost: 0, stones: 0 };
	const won = `${base} reached +`;
	const lost = ` ${base}`;
	for (const e of store.getState().history) {
		if (e.type !== 'enhance' || !e.label) continue;
		if (e.label.startsWith(won)) out.won++;
		else if (e.label.startsWith(`Failed attempt at +`) && e.label.endsWith(lost)) out.lost++;
		else if (e.label.startsWith(`${base} fell to +`)) out.lost++;
		else continue;
		if (e.delta && e.delta[stoneName] < 0) out.stones -= e.delta[stoneName];
	}
	return out;
}

export function pendingEnhancements() {
	const stock = store.getAllStock();
	// The failstack each yellow part carries into its next attempt: the
	// one recorded for it, else the stack the quoted rate assumes for
	// that level (the recommended one). Only the yellow table listens.
	const carried = store.getProfile('failstacks', {}) || {};
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
		const table = tableFor(base);
		const row = table && table.levels[have];
		// A stack only matters where an attempt can fail. Yellow rows are
		// quoted at a stack; the rest at none.
		const recommended = row && row.chance < 1 ? (row.base ? row.stack : 0) : null;
		const failstacks = recommended === null ? null : (carried[base] ?? recommended);

		// Yellow gear spends Cron Stones alongside the enhancement stone,
		// so an attempt costs a list, not one thing.
		const costs = Object.entries(step.stones);
		const stoneName = costs[0] ? costs[0][0] : 'Tidal Black Stone';
		const stoneQty = costs[0] ? costs[0][1] : 0;
		const affordable = Object.entries(step.stones).every(([st, q]) => (stock[st] || 0) >= q);
		const holds = (stock[step.from] || 0) > 0;
		// An attempt made without Crons needs everything but the Crons.
		const affordableDropped = holds && Object.entries(step.stones)
			.every(([st, q]) => st === 'Cron Stone' || (stock[st] || 0) >= q);

		out.push({
			base,
			have,
			next: have + 1,
			want,
			forecast: enhancementForecast(base, have, want, failstacks),
			step1: enhancementForecast(base, have, have + 1, failstacks),
			failstacks,
			recommended,
			carriedStack: carried[base] !== undefined,
			// Yellow gear only: the same attempt without Cron Stones, for
			// the third button.
			canDrop: Boolean(step.onFailureDropped),
			log: attemptsFor(base, stoneName),
			// What the level is for, in the hull's own numbers.
			gain: describeStats(gainAt(base, have)),
			forBuild,
			costs,
			stoneName,
			stoneQty,
			affordable,
			affordableDropped,
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

// Whether the rows that cannot be attempted yet are unfolded.
let showBlocked = false;
export function toggleBlocked() { showBlocked = !showBlocked; }

export function renderWorkshop() {
	const stock = store.getAllStock();
	const q = query.toLowerCase();
	const ready = readyCrafts().filter(c => !q || c.item.toLowerCase().includes(q));

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
			${massProcess[c.item] ? `<label class="inline-check"
				title="Ten crafts in one go, plus one ${esc(massProcess[c.item].extra)} for each batch of ${massProcess[c.item].batch}">
				<input type="checkbox" data-mass-process> via Mass Process
			</label>` : ''}
		</div>`;
	}).join('');

	const pending = pendingEnhancements().filter(e => !q || e.base.toLowerCase().includes(q));
	// What can be tried comes first; what cannot -- the base part not
	// held, the stones short -- is folded, since it is the plan's list,
	// not the bench's.
	const open = pending.filter(e => !e.blocked);
	const blocked = pending.filter(e => e.blocked);
	const enhRow = e => `
		<div class="row" data-base="${esc(e.base)}" data-level="${e.next}" data-peek="${esc(enhancedName(e.base, e.next))}" ${e.blocked ? 'style="opacity:.55"' : ''}>
			${img(enhancedName(e.base, e.have), 'row-icon md')}
			<div class="row-main">
				<div class="row-name">${codexName(e.base)}</div>
				<div class="row-sub" ${e.blocked ? 'style="color:var(--red)"' : ''}>${esc(e.note)}</div>
			</div>
			<span class="enh-level">+${e.have} → +${e.next}${e.gain ? `<span class="enh-gain" title="What +${e.next} adds over +${e.have}">${esc(e.gain)}</span>` : ''}</span>
			<span class="enh-cost">${e.costs.map(([n, q]) => `${img(n, '')}×${F(q)}`).join('')}${odds(e)}${e.recommended !== null ? `
				<label class="enh-fs" title="The failstack this part carries into its next attempt. Starts at the stack the quoted rate assumes (${e.recommended}); each failure recorded here adds one, a success resets it for the next level. Type to correct it.${e.recommended === 0 ? ' Below the yellow tier the game publishes no per-stack figure: a tenth of the base rate a stack is assumed, capped at 90% — check the enhancement window.' : ''}">
					FS ${amountInput('purse-inline narrow', e.failstacks, `data-act="failstacks" data-base="${esc(e.base)}" aria-label="Failstack for ${esc(e.base)}"`)}
					<span class="enh-fs-note">${e.carriedStack ? `recommended ${e.recommended}` : 'recommended'}</span>
				</label>` : ''}</span>
			${outlook(e)}
			${e.log.won + e.log.lost ? `<span class="enh-log" title="From the undo history, which keeps the last two hundred changes">${e.log.won} won · ${e.log.lost} lost · ${F(e.log.stones)} ${esc(e.stoneName)} spent</span>` : ''}
			<span class="enh-actions">
				<button class="pill-btn" data-act="enhance" data-result="success" ${e.blocked ? 'disabled' : ''}>Succeeded</button>
				<button class="pill-btn bad" data-act="enhance" data-result="fail" ${e.blocked ? 'disabled' : ''}>Failed</button>
				${e.canDrop ? `<button class="pill-btn bad" data-act="enhance" data-result="dropped"
					${e.affordableDropped ? '' : 'disabled'}
					title="The attempt was made without Cron Stones: none are spent, and the part falls a level">Failed — no Crons</button>` : ''}
			</span>
		</div>`;
	const enhRows = open.map(enhRow).join('') + (blocked.length
		? `<button class="row-fold" data-act="enh-blocked" aria-expanded="${showBlocked}">${showBlocked ? '▾' : '▸'} ${blocked.length} you cannot attempt yet${showBlocked ? '' : ' — show'}</button>`
			+ (showBlocked ? blocked.map(enhRow).join('') : '')
		: '');

	return `<div class="controls">
		<input class="field" type="search" placeholder="Search recipes and parts…" value="${esc(query)}" data-act="query">
	</div>
	<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title teal">Ready to craft</h2>
			<span class="panel-sub">Crafting moves real stock: ingredients out, product in</span>
		</div>
		${ready.length
			? `<div class="craft-grid">${cards}</div>`
			: `<p class="empty">${q
				? 'Nothing craftable matches that search.'
				: 'Nothing can be made from what is on hand right now.'}</p>`}
	</div>
	<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title">Enhancement</h2>
			<span class="panel-sub">Everything you own that can go higher. Record what happened — the materials are spent either way. Blue and green parts keep their level on a failure; yellow ones fall a level unless Cron Stones held it, so a yellow row has both failures to choose from</span>
		</div>

		${enhRows || `<p class="empty">${q
			? 'No enhanceable part matches that search.'
			: 'Nothing in your inventory can be enhanced. Add a ship part and it will show up here.'}</p>`}
	</div>`;
}
