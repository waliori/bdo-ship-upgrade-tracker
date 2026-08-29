// To Get: everything outstanding grouped by how it is actually
// obtained, with the barter's real cost in sea time beside every shop
// price, and the profile facts that quietly improve the forecast.

import { items as vendorItems, bulkExchanges } from './vendor_items.js';
import { coins } from './sea_coins.js';
import { falasi } from './falasi_vendor.js';
import {
	forecast as barterForecast,
	summarise as barterLine,
	explain as barterWhy,
	dailyCapacity as barterDay,
	barterLevels,
	ROUTE_UNLOCKS
} from './barter.js';
import { esc, F, FC } from './fmt.js';
import * as store from './state.js';
import { img, codexName, costCtx, costText } from './ui-bits.js';
import {
	snapshot, barterData, barterProfile, totalsToGo, CROW_COIN, SILVER
} from './ui-state.js';
import { shoppingList, waysToGet } from './planner.js';



/**
 * A shopping-list entry's barter side: who trades it, and -- the part
 * nothing else answers -- what getting this many is going to cost in
 * sea time.
 *
 * `shoppingList` hands us the quantity, so the forecast is for the
 * shortfall in front of you rather than for a unit, which is what makes
 * it worth reading.
 */
export function barterLookup(item, qty = 1) {
	if (!barterData) return null;
	const entry = barterData.find(b => b.name === item);
	if (!entry || !entry.sources || !entry.sources.length) return null;
	const npcs = [...new Set(entry.sources.map(s => s.npc_name))];
	const gives = [...new Set(entry.sources.map(s => s.give && s.give.name).filter(Boolean))];
	return { npcs, gives, plan: barterForecast(item, qty, barterData, barterProfile()) };
}

/**
 * The two things about you that the barter forecast cannot know.
 *
 * Both are one-off answers that then quietly improve every barter line
 * below, so they sit in the summary bar with the purse rather than
 * behind a settings screen -- and the barter count is shown as what it
 * unlocks next, because the raw number means nothing until you know
 * what it buys.
 */
function barterProfileTile() {
	const profile = barterProfile();
	const { barterCount, valuePack, level, vouchers } = profile;
	const day = barterDay(profile);
	const next = nextUnlock(barterCount);

	const levels = barterLevels().map(name =>
		`<option${name === level ? ' selected' : ''}>${esc(name)}</option>`).join('');

	// Parley is not what paces the trip -- the refresh cap is -- so it
	// sits under the headline as a fact rather than above it as a limit.
	// It is still worth showing: it is the one number a barter level
	// visibly moves, and the game never adds up what a bar buys you.
	return `<div>
		<div class="summary-k">Bartering</div>
		<div class="summary-v">${F(day.refreshes)} refreshes/day</div>
		<div class="summary-sub"><input class="purse-inline" type="text" inputmode="numeric"
			value="${F(barterCount)}" data-act="barter-count"
			aria-label="Barters you have completed"> done${next ? ` · ${esc(next)}` : ''}
			· <label class="inline-check"><input type="checkbox" data-act="value-pack"
			${valuePack ? 'checked' : ''}> Value Pack</label></div>
		<div class="summary-sub"><select class="purse-inline" data-act="barter-level"
			aria-label="Your barter level"><option value=""${level ? '' : ' selected'}>—</option>${levels}</select>
			· ${F(day.perTrade)} Parley a trade
			· <input class="purse-inline narrow" type="text" inputmode="numeric"
			value="${F(vouchers)}" data-act="vouchers"
			aria-label="Crow's Trade Vouchers you carry"> vouchers
			· ${F(day.tradesPerBar)} trades a refill</div>
	</div>`;
}

/** The next thing your barter count opens, phrased as the wait for it. */
function nextUnlock(count) {
	const next = ROUTE_UNLOCKS.filter(r => r.opens && r.barters > count)[0];
	if (!next) return null;
	return `${F(next.barters - count)} to ${next.opens}`;
}

export function renderGet() {
	const totals = totalsToGo();
	const groups = shoppingList(snapshot.missing, {
		coins,
		silver: falasi,
		acquisition: vendorItems,
		barter: barterData ? barterLookup : null
	});

	const purseCoins = store.getStock(CROW_COIN);
	const purseSilver = store.getStock(SILVER);
	const coinsShort = Math.max(0, totals.coins - purseCoins);
	const silverShort = Math.max(0, totals.silver - purseSilver);

	const money = (label, need, held, short, cls, item) => `<div>
		<div class="summary-k">${esc(label)}</div>
		<div class="summary-v ${short ? cls : 'teal'}">${F(short)} short</div>
		<div class="summary-sub">${F(need)} needed · <input class="purse-inline" type="text" inputmode="numeric"
			value="${F(held)}" data-act="purse" data-item="${esc(item)}" aria-label="${esc(label)} you hold"> held</div>
	</div>`;

	const summary = `<div class="summary">
		<span class="summary-title">Still to get</span>
		<div class="summary-stats">
			${money('Crow Coins', totals.coins, purseCoins, coinsShort, 'amber', CROW_COIN)}
			${money('Silver', totals.silver, purseSilver, silverShort, 'blue', SILVER)}
			<div>
				<div class="summary-k">Line items</div>
				<div class="summary-v">${F(totals.lines)}</div>
				<div class="summary-sub">distinct things to obtain</div>
			</div>
			${barterProfileTile()}
		</div>
		<button class="ghost-btn" data-act="copy">Copy list</button>
	</div>`;

	if (!groups.length) {
		return summary + '<div class="panel"><p class="empty">Nothing outstanding — every build has what it needs.</p></div>';
	}

	const body = groups.map(g => {
		const total = g.coins ? `${F(g.coins)} coins` : g.silver ? `${F(g.silver)} silver` : `${g.items.length} items`;
		const col = g.coins ? 'amber' : g.silver ? 'blue' : 'plain';
		return `<div class="panel">
			<div class="group-head">
				<h2 class="panel-title ${col}">${esc(g.key)}</h2>
				<span class="group-total" style="color:var(--ink-dim)">${esc(total)}</span>
			</div>
			${g.items.map(entry => {
				let sub = entry.unit || entry.detail || '';
				// The unit price alone leaves the comparison as mental
				// arithmetic; the line total is the number being decided.
				if (entry.qty > 1 && entry.coins) sub += ` \u00b7 ${FC(entry.coins)} coins for ${F(entry.qty)}`;
				else if (entry.qty > 1 && entry.silver) sub += ` \u00b7 ${FC(entry.silver)} silver for ${F(entry.qty)}`;
				if (entry.barter) {
					const t = `barter from ${entry.barter.npcs.length} NPCs for ${entry.barter.gives.slice(0, 2).join(' / ')}`;
					sub = sub ? `${sub} · ${t}` : t;
				}
				// The trade count is the half of the decision the shop
				// price cannot make for you: 400 coins each is only dear
				// if the barter is cheap, and this says which it is.
				const plan = entry.barter && entry.barter.plan;
				const why = plan && barterWhy(plan);
				// The land goods belong here rather than in the hover card,
				// because this is the only place a real quantity exists --
				// "50 Palm Plywood" is shopping, "1.25 per one" is noise.
				const seed = plan && !plan.gate && plan.seed
					? ` <span class="row-sea-why">from ${F(Math.ceil(plan.seed.qty))}× ${esc(plan.seed.item)}</span>`
					: '';
				const sea = plan
					? `<div class="row-sea${plan.gate ? ' locked' : ''}">by barter: ${esc(barterLine(plan))}${
						why ? ` <span class="row-sea-why">${esc(why)}</span>` : ''}${seed}</div>`
					: '';
				// The list says where to buy it; the other half of the
				// decision is what making it would cost instead.
				const made = waysToGet(entry.item, costCtx()).routes.find(r => r.parts);
				const alt = made
					? `<div class="row-alt">or make ${F(entry.qty)}: ${esc(costText(made, entry.qty))}</div>`
					: '';

				// Some things come a hundred at a time from one item. That
				// is not a recipe and cannot be one -- the book makes a
				// single unit -- but it is very often the answer, so it
				// goes beside the recipe rather than in it.
				const bulk = bulkExchanges[entry.item];
				const inBulk = bulk
					? `<div class="row-alt">or ${F(Math.ceil(entry.qty / bulk.gets))}× ${esc(bulk.give)}, ${F(bulk.gets)} a time</div>`
					: '';
				return `<div class="row" data-peek="${esc(entry.item)}">
					${img(entry.item, 'row-icon sm')}
					<div class="row-main">
						<div class="row-name">${codexName(entry.item)}</div>
						<div class="row-sub">${esc(sub)}</div>
						${alt}
						${inBulk}
						${sea}
					</div>
					<span class="qty-out">${F(entry.qty)}</span>
				</div>`;
			}).join('')}
		</div>`;
	}).join('');

	return summary + body;
}

export function shoppingText() {
	return Object.entries(snapshot.missing)
		.filter(([, q]) => q > 0)
		.sort((a, b) => b[1] - a[1])
		.map(([item, q]) => `${Math.round(q)}× ${item}`)
		.join('\n');
}

