// The enhancement tables, printed.
//
// The Workshop reads the seven tables every ship part follows and says
// what one attempt costs; it never shows the tables themselves. This
// does: every level of every table with its rate, the stack at which
// the climb slows and the one at which it stops, the fails before a
// success is certain, the stones, the Cron, the durability -- and one
// column lit at whatever stack is typed, so the page answers "what are
// my odds at 23" for every level at once.

import { esc } from './fmt.js';
import { tables, families, chanceAt, stacksTo } from './enhancement.js';
import { openDialog } from './dialogs.js';

// The order the tables are read in: the ones people stack for first.
const ORDER = ['caravel-green', 'caravel-blue', 'toro', 'chiro', 'yellow', 'sailboat', 'epheria'];

const pct = v => `${v * 100 < 10 ? (v * 100).toFixed(2) : (v * 100).toFixed(1)}%`;

function tableHTML(id, stack) {
	const t = tables[id];
	const yellow = id === 'yellow';
	const sure = t.levels.every(l => l.chance >= 1);
	const parts = Object.keys(families).filter(p => families[p] === id).length;
	const rows = t.levels.map((l, i) => {
		// The yellow rows are quoted at a stack of their own; a typed
		// stack replaces it on every row.
		const at = stack === null ? (yellow ? l.stack : 0) : stack;
		const to = stacksTo(l);
		return `<tr><td>+${i} → +${i + 1}</td>
			<td class="num">${sure ? '100%' : pct(l.base || l.chance)}</td>
			${sure ? '' : `<td class="num lit">${pct(chanceAt(l, at))}<small>at ${at}</small></td>
			<td class="num">${to && to.soft ? to.soft : '—'}</td>
			<td class="num">${to && to.hard ? to.hard : '—'}</td>
			<td class="num">${l.agris ?? '—'}</td>`}
			<td class="num">${l.stones}</td>
			${yellow ? `<td class="num">${l.cron || '—'}</td>` : ''}
			<td class="num">${l.durability || '—'}</td>
			${sure ? '' : `<td class="num">${l.perfect ?? '—'}</td>`}
		</tr>`;
	}).join('');
	const head = `<tr><th>Attempt</th><th class="num" title="At no failstack">Rate at 0</th>${sure ? '' : `
		<th class="num">At your stack</th>
		<th class="num" title="The stack at which the chance reaches 70%; every stack up to it adds a tenth of the base rate, every stack past it a fiftieth">70% at</th>
		<th class="num" title="The stack at which the chance reaches 90%, where it stops">90% at</th>
		<th class="num" title="Fails before the next attempt cannot fail: the Agris Essence meter">Sure after</th>`}
		<th class="num">${esc(t.material)}</th>${yellow ? '<th class="num" title="Cron Stones to keep the level on a failure">Cron</th>' : ''}
		<th class="num" title="Max durability lost on a failure">Durability</th>${sure ? '' : '<th class="num" title="Stones for a perfect enhancement, where the game offers one">Perfect</th>'}</tr>`;
	const note = sure ? 'Every attempt succeeds; the stones per level are the whole cost.'
		: yellow ? 'A failure takes a level as well as durability unless Cron Stones hold it. The rate at 0 is the base; the game quotes each level at the stack in the lit column.'
			: 'A failure keeps the level and costs durability.';
	return `<section class="enh-tables-one"><h3>${esc(t.label)} <span class="map-courses-credit">${parts} part${parts === 1 ? '' : 's'}</span></h3>
		<p class="enh-tables-note">${note}</p>
		<div class="table-wrap"><table class="enh-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div></section>`;
}

const allHTML = stack => ORDER.map(id => tableHTML(id, stack)).join('');

/** Open the tables in a dialog; a stack typed at the top lights every level at it. */
export function openTables(stack = null) {
	const host = openDialog(`
		<h2>The enhancement tables</h2>
		<p class="dialog-copy">All 70 enhanceable ship parts follow one of seven tables, read off BDOCodex. Each failstack adds a tenth of the base rate until the chance reaches 70%, then a fiftieth, and 90% is the ceiling; every failure stores an Agris Essence, and a full meter cannot fail. The Workshop prices each attempt from these at the stack you carry.</p>
		<label class="dialog-label">Light every level at <input class="field" type="text" inputmode="numeric" data-stack placeholder="your failstack" value="${stack === null ? '' : stack}" style="max-width:130px"> stacks</label>
		<div data-tables>${allHTML(stack)}</div>
		<div class="dialog-actions"><button class="ghost-btn" data-close>Close</button></div>`);
	host.firstElementChild.classList.add('wide', 'enh-tables');
	const input = host.querySelector('[data-stack]');
	const body = host.querySelector('[data-tables]');
	input.addEventListener('input', () => {
		const n = Math.floor(Number(input.value.replace(/[^\d]/g, '')));
		body.innerHTML = allHTML(input.value.trim() === '' || !Number.isFinite(n) ? null : Math.min(9999, Math.max(0, n)));
	});
}
