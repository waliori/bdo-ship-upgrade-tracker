// The Workshop: everything craftable right now, and every part worth an
// enhancement attempt.

import { esc, F } from './fmt.js';
import { T, gameName } from './i18n.js';
import * as store from './state.js';
import { img, codexName, amountInput, whereFrom } from './ui-bits.js';
import { recipes, snapshot, query, readyCrafts, craftStock } from './ui-state.js';
import { parseEnhanced, enhancedName, enhanceStep, ownedLevel, enhancementForecast } from './planner.js';
import { massProcess } from './vendor_items.js';
import { gainAt, describeStats } from './part_stats.js';
import { tableFor, stacksTo } from './enhancement.js';

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
	if (s.chance >= 1) return `<span class="enh-odds sure">${T('always succeeds')}</span>`;
	const pct = s.chance < 0.01 ? (s.chance * 100).toFixed(1) : Math.round(s.chance * 100);
	return `<span class="enh-odds">${T('{pct}% · certain after {n} fails', { pct, n: s.agris })}</span>`;
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
	return `<span class="enh-outlook" title="${T('Expected cost of every attempt from +{have} to +{want}, the most it can possibly take, and the durability the failures can cost at the very worst — a repair each time the part runs out', { have: e.have, want: e.want })}">
		${f.durabilityCeiling
			? T('to +{want}: <b>{expected}</b> expected · {ceiling} at worst · up to {durability} durability lost', { want: e.want, expected: F(f.expected), ceiling: F(f.ceiling), durability: F(f.durabilityCeiling) })
			: T('to +{want}: <b>{expected}</b> expected · {ceiling} at worst', { want: e.want, expected: F(f.expected), ceiling: F(f.ceiling) })}
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
			// Where the climb slows: the stack worth reaching before this
			// attempt, which the yellow tier's quoted stacks all sit past.
			soft: row && row.chance < 1 && !row.base ? stacksTo(row) : null,
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
				? (have > 0
					? T('you do not own a +{have} part yet{where}', { have, where: whereFrom(step.from) })
					: T('you do not own the base part yet{where}', { where: whereFrom(step.from) }))
				: !affordable
					? T('not enough {stone}', { stone: gameName(stoneName) })
					: forBuild
						? T('a build needs +{want}', { want })
						: T('yours to enhance · up to +{want}', { want })
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
	const q = query.toLowerCase();
	const ready = readyCrafts().filter(c => !q || c.item.toLowerCase().includes(q));

	const cards = ready.map(c => {
		const recipe = recipes[c.item] || {};
		// Counted against what this craft may actually spend: stock a
		// build has claimed for something else is not on the bench.
		const bench = craftStock(c.item);
		const ings = Object.entries(recipe).map(([ing, per]) => {
			const have = bench[ing] || 0;
			return `<span class="ing ${have < per ? 'short' : ''}" title="${esc(gameName(ing))}">
				${img(ing, '')}${F(have)}/${F(per)}
			</span>`;
		}).join('');
		return `<div class="craft-card" data-peek="${esc(c.item)}">
			<div class="craft-top">
				${img(c.item, '')}
				<div>
					<div class="craft-name">${codexName(c.item)}</div>
					<div class="craft-times">${c.makes > 1
						? T('×{n} possible now · {makes} each', { n: F(c.possible), makes: F(c.makes) })
						: T('×{n} possible now', { n: F(c.possible) })}</div>
				</div>
			</div>
			<div class="ings">${ings}</div>
			<div class="craft-actions">
				${amountInput('craft-n', 1, `data-act="craft-n" data-item="${esc(c.item)}" aria-label="${T('How many to craft')}"`)}
				<button class="act go" data-act="craft" data-item="${esc(c.item)}" data-times="field">${T('Craft')}</button>
				<button class="act quiet" data-act="craft" data-item="${esc(c.item)}" data-times="${c.possible}">${T('All {n}', { n: F(c.possible) })}</button>
			</div>
			${massProcess[c.item] ? `<label class="inline-check"
				title="${T('Ten crafts in one go, plus one {extra} for each batch of {n}', { extra: esc(gameName(massProcess[c.item].extra)), n: massProcess[c.item].batch })}">
				<input type="checkbox" data-mass-process> ${T('via Mass Process')}
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
			<span class="enh-level">+${e.have} → +${e.next}${e.gain ? `<span class="enh-gain" title="${T('What +{next} adds over +{have}', { next: e.next, have: e.have })}">${esc(e.gain)}</span>` : ''}</span>
			<span class="enh-cost">${e.costs.map(([n, q]) => `${img(n, '')}×${F(q)}`).join('')}${odds(e)}${e.recommended !== null ? `
				<label class="enh-fs" title="${T('The failstack this part carries into its next attempt. Starts at the stack the quoted rate assumes ({n}); each failure recorded here adds one, a success resets it for the next level. Type to correct it.', { n: e.recommended })}${e.recommended === 0 ? ` ${T('Each stack adds a tenth of the base rate until the chance reaches 70%, a fiftieth after that, and 90% is the ceiling — the enhancement window shows the same figure.')}` : ''}">
					${T('FS')} ${amountInput('purse-inline narrow', e.failstacks, `data-act="failstacks" data-base="${esc(e.base)}" aria-label="${T('Failstack for {name}', { name: esc(gameName(e.base)) })}"`)}
					<span class="enh-fs-note">${e.carriedStack ? T('recommended {n}', { n: e.recommended }) : T('recommended')}${e.soft && e.soft.soft ? ` · <span title="${T('Every stack up to {n} adds a tenth of the base rate; past it a fiftieth.', { n: e.soft.soft })} ${e.soft.hard ? T('90% at {n}.', { n: e.soft.hard }) : ''}">${T('70% at {n}', { n: e.soft.soft })}</span>` : ''}</span>
				</label>` : ''}</span>
			${outlook(e)}
			${e.log.won + e.log.lost ? `<span class="enh-log" title="${T('From the undo history, which keeps the last two hundred changes')}">${T('{won} won · {lost} lost · {n} {stone} spent', { won: e.log.won, lost: e.log.lost, n: F(e.log.stones), stone: esc(gameName(e.stoneName)) })}</span>` : ''}
			<span class="enh-actions">
				<button class="pill-btn" data-act="enhance" data-result="success" ${e.blocked ? 'disabled' : ''}>${T('Succeeded')}</button>
				<button class="pill-btn bad" data-act="enhance" data-result="fail" ${e.blocked ? 'disabled' : ''}>${T('Failed')}</button>
				${e.canDrop ? `<button class="pill-btn bad" data-act="enhance" data-result="dropped"
					${e.affordableDropped ? '' : 'disabled'}
					title="${T('The attempt was made without Cron Stones: none are spent, and the part falls a level')}">${T('Failed — no Crons')}</button>` : ''}
			</span>
		</div>`;
	const enhRows = open.map(enhRow).join('') + (blocked.length
		? `<button class="row-fold" data-act="enh-blocked" aria-expanded="${showBlocked}">${showBlocked ? '▾' : '▸'} ${showBlocked
				? T('{n} you cannot attempt yet', { n: blocked.length })
				: T('{n} you cannot attempt yet — show', { n: blocked.length })}</button>`
			+ (showBlocked ? blocked.map(enhRow).join('') : '')
		: '');

	return `<div class="controls">
		<input class="field" type="search" placeholder="${T('Search recipes and parts…')}" value="${esc(query)}" data-act="query" aria-label="${T('Search recipes and parts')}">
	</div>
	<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title teal">${T('Ready to craft')}</h2>
			<span class="panel-sub">${T('Crafting moves real stock: ingredients out, product in')}</span>
		</div>
		${ready.length
			? `<div class="craft-grid">${cards}</div>`
			: `<p class="empty">${q
				? T('Nothing craftable matches that search.')
				: T('Nothing can be made from what is on hand right now.')}</p>`}
	</div>
	<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title">${T('Enhancement')}</h2>
			<span class="panel-sub">${T('Everything you own that can go higher. Record what happened — the materials are spent either way. Blue and green parts keep their level on a failure; yellow ones fall a level unless Cron Stones held it, so a yellow row has both failures to choose from')} · <button class="linky" data-act="tables" title="${T('The seven tables every part follows, lit at your stack')}">${T('the tables')}</button></span>
		</div>

		${enhRows || `<p class="empty">${q
			? T('No enhanceable part matches that search.')
			: T('Nothing in your inventory can be enhanced. Add a ship part and it will show up here.')}</p>`}
	</div>`;
}
