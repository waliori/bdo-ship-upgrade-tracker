// Everything the app knows about one item, on one card.
//
// Find used to answer a search by switching to the Inventory and
// selecting the thing -- which works for something you own and is a dead
// end for anything else: an item with no stock has no row, so the panel
// opened empty and the search appeared to do nothing. But the app
// already knows a great deal about every item; it was just spread across
// the screen that happened to be showing it. The recipe lives on the
// Tree, the barter offers on the Map, the price on To Get, the drops on
// the shopping list, the quest rewards on Quests.
//
// So this gathers them. Nothing here computes anything new -- every
// section is a call into the module that already owned that fact -- and
// each one is a way through to the screen that does it properly.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import { openDialog } from './dialogs.js';
import { snapshot } from './ui-state.js';
import { items as vendorItems, bulkExchanges } from './vendor_items.js';
import { marketPrice, marketStatus, REGIONS as MARKET_REGIONS, region as marketRegion } from './market.js';
import { parseEnhanced, waysToGet, outstanding } from './planner.js';
import { statsAt, describeStats } from './part_stats.js';
import {
	img, codexName, makeupHTML, barterHTML, sourceOf, costCtx, costText,
	waysThrough, questsPaying, groundsFor
} from './ui-bits.js';

/** A section, only when it has something in it. */
const part = (title, body) => (body ? `<div class="card-part"><h3>${esc(title)}</h3>${body}</div>` : '');

/** What the quests pay for this one item, and which they are. The way
 *  through to Quests is in the row of doors at the foot of the card. */
function questsPaid(item) {
	const pays = questsPaying(item);
	if (!pays.length) return '';
	const line = q => {
		const flat = Number(q.rewards[item]) || 0;
		const pick = (q.choice || []).find(c => c[item]);
		const many = flat || Number(pick && pick[item]) || 0;
		return `<div class="card-row"><span>${esc(q.name)}</span><span class="n">${many ? `${F(many)}${pick ? ' (choice)' : ''}` : ''}</span></div>`;
	};
	return `${pays.slice(0, 6).map(line).join('')}
		${pays.length > 6 ? `<div class="card-more">and ${pays.length - 6} more</div>` : ''}`;
}

/**
 * What swims where this drops -- only when the chart cannot place it.
 *
 * A ground the map knows is a door of its own at the foot of the card,
 * under its own name, so listing the same names here as well said it
 * twice. What is left is the drops nothing on the chart can be flown
 * to, which is the half a reader would otherwise never see.
 */
function dropsFrom(item) {
	const drops = (vendorItems[item] && vendorItems[item]['Monster Drop']) || [];
	if (!drops.length || groundsFor(item).length) return '';
	return `<div class="card-line">${drops.slice(0, 6).map(esc).join(' · ')}</div>`;
}

/** What the Market is asking, when the Market is a way to get it. */
function priceLine(item) {
	if (!(vendorItems[item] && vendorItems[item].Market)) return '';
	const p = marketPrice(item);
	const st = marketStatus();
	const where = (MARKET_REGIONS.find(r => r[0] === marketRegion()) || ['', ''])[1];
	if (!p) {
		return `<div class="card-line">No price yet for ${esc(where)}. <button class="chart-link" data-act="view" data-id="get">To Get refreshes them →</button></div>`;
	}
	return `<div class="card-row"><span>Central Market · ${esc(where)}</span><span class="n">${F(p)} silver</span></div>`
		+ (st && st.stale ? '<div class="card-more">last checked a while ago</div>' : '');
}

/** Where this stands against the plan: held, reserved, still short. */
function standing(item) {
	const held = store.getStock(item) || 0;
	const short = Number((snapshot && snapshot.missing && snapshot.missing[item]) || 0);
	const rows = [`<div class="card-row"><span>You hold</span><span class="n">${F(held)}</span></div>`];
	if (short) rows.push(`<div class="card-row"><span>Your builds still need</span><span class="n amber">${F(short)} more</span></div>`);
	else if (held) rows.push('<div class="card-row"><span>Your builds</span><span class="n teal">nothing outstanding</span></div>');
	else rows.push('<div class="card-row"><span>Your builds</span><span class="n">do not ask for this</span></div>');
	return rows.join('');
}

/**
 * The card itself.
 *
 * Sections that have nothing to say are left out rather than shown
 * empty, so a plain material is a short card and a Carrack part is a
 * long one, which is the right shape for both.
 */
export function openItemCard(item) {
	const lv = parseEnhanced(item);
	const fit = statsAt(lv.base, lv.level);
	const made = waysToGet(item, costCtx()).routes.find(r => r.parts);
	const cost = made && (made.coins || made.silver || outstanding(made))
		? `<div class="card-row"><span>${esc(made.kind === 'enhance' ? 'One success' : 'Making one')}</span><span class="n">${costText(made)}</span></div>`
		: '';
	const bulk = bulkExchanges[item];
	const src = sourceOf(item);

	openDialog(`
		<div class="item-card">
			<div class="card-head">${img(item, 'card-icon')}
				<div><h2>${codexName(item)}</h2>
				${src ? `<p class="card-src">${esc(src.label)} · ${esc(src.detail)}</p>` : ''}</div></div>

			${part('Where it stands', standing(item))}
			${part('What it costs', priceLine(item) + cost
				+ (bulk ? `<div class="card-row"><span>or in bulk</span><span class="n">${F(bulk.gets)} for one ${esc(bulk.give)}</span></div>` : ''))}
			${part('How it is made', makeupHTML(item, 'card-line'))}
			${part('Bartered for', barterHTML(item))}
			${part('Dropped by', dropsFrom(item))}
			${part('Paid by quests', questsPaid(item))}
			${part('What it does', fit ? `<div class="card-line">at +${lv.level}: ${esc(describeStats(fit, { signed: false }))}</div>` : '')}
			${part('Where else it turns up', waysThrough(item))}

			<div class="dialog-actions">
				<button class="ghost-btn" data-close>Close</button>
			</div>
		</div>`);
}
