// To Get: everything outstanding grouped by how it is actually
// obtained, with the barter's real cost in sea time beside every shop
// price, and the profile facts that quietly improve the forecast.

import { items as vendorItems, bulkExchanges } from './vendor_items.js';
import { marketSilver, marketStatus, REGIONS as MARKET_REGIONS } from './market.js';
import { questsFor } from './quests.js';
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
import { T, gameName } from './i18n.js';
import * as store from './state.js';
import { img, codexName, costCtx, costText, groundsFor } from './ui-bits.js';
import {
	snapshot, barterData, barterProfile, totalsToGo, query, CROW_COIN, SILVER
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
	const { barterCount, valuePack, crew, level, vouchers, parleyHeld } = profile;
	const day = barterDay(profile);
	const next = nextUnlock(barterCount);

	const levels = barterLevels().map(name =>
		`<option${name === level ? ' selected' : ''}>${esc(name)}</option>`).join('');

	// Parley is not what paces the trip -- the refresh cap is -- so it
	// sits under the headline as a fact rather than above it as a limit.
	// It is still worth showing: it is the one number a barter level
	// visibly moves, and the game never adds up what a bar buys you.
	return `<div>
		<div class="summary-k">${T('Bartering')} <button class="info-dot" data-act="guide"
			aria-label="${T('Where to see these numbers in game')}">?</button></div>
		<div class="summary-v">${F(day.lists.trade)}+${F(day.lists.material)} <span class="gterm" role="button" tabindex="0"
			data-guide="refresh"
			title="${T('{trade} draws of the trade-goods list and {material} of the ship-materials list — the two refresh on their own clocks', { trade: F(day.lists.trade), material: F(day.lists.material) })}">${T('refreshes/day')}</span>
			<span class="summary-sub"> · ${T('refill in')} <b data-until="barter"></b></span></div>
		<div class="summary-sub"><input class="purse-inline" type="text" inputmode="numeric"
			value="${F(barterCount)}" data-act="barter-count"
			aria-label="${T('Your Total Barters, as the Barter Information window shows it')}"> <span class="gterm" role="button" tabindex="0"
			data-guide="parley">${T('Total Barters')}</span>${next ? ` · ${esc(next)}` : ''}
			· <label class="inline-check"><input type="checkbox" data-act="value-pack"
			${valuePack ? 'checked' : ''}> ${T('Value Pack')}</label>
			· <label class="inline-check"><input type="checkbox" data-act="crew-discount"
			${crew ? 'checked' : ''}> ${T('Crew −10%')}</label></div>
		<div class="summary-sub"><select class="purse-inline" data-act="barter-level"
			aria-label="${T('Your barter level')}"><option value=""${level ? '' : ' selected'}>—</option>${levels}</select>
			· ${F(day.perTrade)} <span class="gterm" role="button" tabindex="0" data-guide="level">${T('Parley a trade')}</span>
			· <input class="purse-inline narrow" type="text" inputmode="numeric"
			value="${F(vouchers)}" data-act="vouchers"
			aria-label="${T("Crow's Trade Vouchers you carry")}"> <span class="gterm" role="button" tabindex="0" data-guide="voucher">${T('vouchers')}</span>
			· ${T('{n} trades a refill', { n: F(day.tradesPerBar) })}</div>
		<div class="summary-sub"><input class="purse-inline" type="text" inputmode="numeric"
			value="${F(parleyHeld)}" data-act="parley-held"
			aria-label="${T('Parley in the bar right now')}"> <span class="gterm" role="button" tabindex="0" data-guide="parley">${T('Parley in the bar right now')}</span></div>
	</div>`;
}

/** The next thing your barter count opens, phrased as the wait for it. */
function nextUnlock(count) {
	const next = ROUTE_UNLOCKS.filter(r => r.opens && r.barters > count)[0];
	if (!next) return null;
	// "10 more barters open Kashuma Island": the running barter count
	// unlocks trade routes at fixed thresholds, and this is the next one.
	return T('{n} more open {place}', { n: F(next.barters - count), place: next.opens });
}

/**
 * The Market's prices: which region, how old, and a way to ask again.
 * Shown as a fact about the numbers above it, because a plan priced off
 * last Tuesday's plywood should say so.
 */
function marketTile() {
	const s = marketStatus();
	const options = MARKET_REGIONS.map(([id, label]) =>
		`<option value="${id}"${id === s.region ? ' selected' : ''}>${label}</option>`).join('');
	const age = !s.at ? T('no prices yet')
		: `${T('{n} priced', { n: s.count })} · ${ageText(Date.now() - s.at)}${s.failed ? ` · ${T('some unanswered')}` : ''}`;
	return `<div>
		<div class="summary-k">${T('Market prices')}</div>
		<div class="summary-v"><select class="purse-inline" data-act="market-region" aria-label="${T("Which region's Central Market")}">${options}</select></div>
		<div class="summary-sub">${esc(age)} · <button class="linky" data-act="market-refresh">${T('refresh')}</button></div>
	</div>`;
}

const ageText = ms => ms < 60_000 ? T('just now')
	: ms < 3_600_000 ? T('{n} min ago', { n: Math.round(ms / 60_000) })
	: ms < 86_400_000 ? T('{n} h ago', { n: Math.round(ms / 3_600_000) })
	: T('{n} d ago', { n: Math.round(ms / 86_400_000) });

export function renderGet() {
	const totals = totalsToGo();
	const q = query.toLowerCase();
	const groups = visibleGroups(q);

	const purseCoins = store.getStock(CROW_COIN);
	const purseSilver = store.getStock(SILVER);
	const coinsShort = Math.max(0, totals.coins - purseCoins);
	const silverShort = Math.max(0, totals.silver - purseSilver);

	const money = (label, need, held, short, cls, item) => `<div>
		<div class="summary-k">${esc(label)}</div>
		<div class="summary-v ${short ? cls : 'teal'}">${T('{n} short', { n: F(short) })}</div>
		<div class="summary-sub">${T('{n} needed', { n: F(need) })} · <input class="purse-inline" type="text" inputmode="numeric"
			value="${F(held)}" data-act="purse" data-item="${esc(item)}" aria-label="${T('{label} you hold', { label: esc(label) })}"> ${T('held')}</div>
	</div>`;

	const summary = `<div class="summary">
		<span class="summary-title">${T('Still to get')}</span>
		<div class="summary-stats">
			${money(T('Crow Coins'), totals.coins, purseCoins, coinsShort, 'amber', CROW_COIN)}
			${money(T('Silver'), totals.silver, purseSilver, silverShort, 'blue', SILVER)}
			<div>
				<div class="summary-k">${T('Line items')}</div>
				<div class="summary-v">${F(totals.lines)}</div>
				<div class="summary-sub">${T('distinct things to obtain')}</div>
			</div>
			${barterProfileTile()}
			${marketTile()}
		</div>
		<div class="get-copy">
			<button class="ghost-btn" data-act="copy">${T('Copy list')}</button>
			<button class="ghost-btn" data-act="copy-csv" title="${T('The same list as rows for a spreadsheet: group, item, quantity, unit cost, note')}">${T('Copy as CSV')}</button>
		</div>
	</div>`;

	const controls = `<div class="controls">
		<input class="field" type="search" placeholder="${T('Search the list…')}" value="${esc(query)}" data-act="query" aria-label="${T('Search the list')}">
	</div>`;

	if (!groups.length) {
		return summary + controls + `<div class="panel"><p class="empty">${q
			? T('Nothing outstanding matches that search.')
			: T('Nothing outstanding — every build has what it needs.')}</p></div>`;
	}

	const body = groups.map(g => {
		const total = g.coins ? T('{n} coins', { n: F(g.coins) }) : g.silver ? T('{n} silver', { n: F(g.silver) })
			: g.items.length === 1 ? T('{n} item', { n: g.items.length }) : T('{n} items', { n: g.items.length });
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
				if (entry.qty > 1 && entry.coins) sub += ` \u00b7 ${T('{cost} coins for {n}', { cost: FC(entry.coins), n: F(entry.qty) })}`;
				else if (entry.qty > 1 && entry.silver) sub += ` \u00b7 ${T('{cost} silver for {n}', { cost: FC(entry.silver), n: F(entry.qty) })}`;
				if (entry.barter) {
					const t = T('barter at {n} islands for {goods}', { n: entry.barter.npcs.length, goods: entry.barter.gives.slice(0, 2).map(gameName).join(' / ') });
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
				// What the exchange takes off the deck, priced as the silver
				// those goods would have sold for: the cost of a barter the
				// shop price never mentions.
				const cargo = plan && !plan.gate && plan.cargo && plan.cargo.worth
					? ` <span class="row-sea-why">· ${T('hands over {n}× [Level {level}] worth {silver} silver sold', { n: F(plan.cargo.count), level: plan.cargo.level, silver: FC(plan.cargo.worth) })}</span>`
					: '';
				const seed = plan && !plan.gate && plan.seed
					? ` <span class="row-sea-why">${T('from {n}× {item}', { n: F(Math.ceil(plan.seed.qty)), item: esc(gameName(plan.seed.item)) })}</span>`
					: '';
				// The barter line names the sea; this link opens it. The
				// map picks the item and frames its islands, which is the
				// answer "from 6 NPCs" only gestures at.
				const chart = `<button class="chart-link" data-act="goto-map" data-item="${esc(entry.item)}">${T('on the map')}</button>`;
				const sea = plan
					? `<div class="row-sea${plan.gate ? ' locked' : ''}">${T('by barter: {line}', { line: esc(barterLine(plan)) })}${
						why ? ` <span class="row-sea-why">${esc(why)}</span>` : ''}${
						plan.gate ? '' : ` <span class="row-sea-why">· ${T('if the offer turns up')}</span>`}${cargo}${seed} ${chart}</div>`
					: '';
				// The list says where to buy it; the other half of the
				// decision is what making it would cost instead.
				const made = waysToGet(entry.item, costCtx()).routes.find(r => r.parts);
				const alt = made
					? `<div class="row-alt">${T('or make {n}: {cost}', { n: F(entry.qty), cost: esc(costText(made, entry.qty)) })}</div>`
					: '';

				// Some things come a hundred at a time from one item. That
				// is not a recipe and cannot be one -- the book makes a
				// single unit -- but it is very often the answer, so it
				// goes beside the recipe rather than in it.
				// What drops it, when the chart knows where that swims.
				// Same reading as the item card's, from the same place.
				const grounds = groundsFor(entry.item).slice(0, 3);
				const hunt = grounds.length
					? `<div class="row-alt">${T('hunt:')} ${grounds.map(m => `<button class="chart-link" data-act="quest-map" data-monster="${esc(m.key)}">${esc(gameName(m.name))}</button>`).join(' · ')}</div>`
					: '';
				const bulk = bulkExchanges[entry.item];
				const inBulk = bulk
					? `<div class="row-alt">${T('or {n}× {item}, {gets} a time', { n: F(Math.ceil(entry.qty / bulk.gets)), item: esc(gameName(bulk.give)), gets: F(bulk.gets) })}</div>`
					: '';
				const ways = [alt, inBulk, hunt, sea].filter(Boolean);
				const waysHTML = ways.length ? `<details class="row-ways"${ways.length === 1 && !sea ? ' open' : ''}>
					<summary>${ways.length === 1 ? T('another way') : T('{n} other ways', { n: ways.length })}${sea ? ` · ${T('by barter')}` : ''}${hunt ? ` · ${T('by hunting')}` : ''}</summary>
					${ways.join('')}
				</details>` : '';
				return `<div class="row" data-peek="${esc(entry.item)}">
					${img(entry.item, 'row-icon sm')}
					<div class="row-main">
						<div class="row-name">${codexName(entry.item)}</div>
						<div class="row-sub">${esc(sub)}</div>
						${waysHTML}
					</div>
					<span class="qty-out">${F(entry.qty)}</span>
				</div>`;
			}).join('')}
		</div>`;
	}).join('');

	// The quests that pay in what is short are a screen of their own; a
	// line here says how many, so the list is not read as the whole story.
	const free = questsFor(snapshot.missing).length;
	const hint = free ? `<p class="get-quests"><button class="linky" data-act="view" data-id="quests">${free === 1
		? T('{n} quest pay in something on this list', { n: free })
		: T('{n} quests pay in something on this list', { n: free })}</button> — ${T('Quests records a claimed reward in your stock.')}</p>` : '';
	return summary + controls + hint + body;
}

/** The list as the screen shows it: grouped by how each thing is got,
 *  narrowed to a search when there is one, each group total re-summed
 *  so the head still describes what is under it. */
function visibleGroups(q) {
	return shoppingList(snapshot.missing, {
		coins,
		silver: falasi,
		market: marketSilver(),
		acquisition: vendorItems,
		barter: barterData ? barterLookup : null
	}).map(g => {
		if (!q) return g;
		const items = g.items.filter(e => e.item.toLowerCase().includes(q));
		return {
			...g,
			items,
			coins: items.reduce((a, e) => a + (e.coins || 0), 0),
			silver: items.reduce((a, e) => a + (e.silver || 0), 0)
		};
	}).filter(g => g.items.length);
}

/** What "Copy list" puts on the clipboard: the list exactly as it is
 *  shown -- the same groups, the same search -- so a narrowed list
 *  copies narrow, and the headings say where each thing comes from. */
export function shoppingText() {
	return visibleGroups(query.toLowerCase()).map(g => {
		const total = g.coins ? ` — ${T('{n} coins', { n: F(g.coins) })}` : g.silver ? ` — ${T('{n} silver', { n: F(g.silver) })}` : '';
		const lines = [...g.items].sort((a, b) => b.qty - a.qty).map(e => `  ${Math.round(e.qty)}× ${gameName(e.item)}`);
		return `${g.key}${total}\n${lines.join('\n')}`;
	}).join('\n\n');
}

/**
 * The same list for a spreadsheet: one row a line, the group it sits
 * under, the quantity, what one costs, and the note the row shows
 * (where it is bought, or that it is bartered). Quoted the way RFC 4180
 * asks, so a name with a comma in it stays one cell.
 */
export function shoppingCSV() {
	const cell = v => {
		const t = String(v == null ? '' : v);
		return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
	};
	const rows = [[T('group'), T('item'), T('quantity'), T('unit cost'), T('note')]];
	for (const g of visibleGroups(query.toLowerCase())) {
		for (const e of [...g.items].sort((a, b) => b.qty - a.qty)) {
			const each = e.qty ? (e.coins ? T('{n} coins', { n: Math.round(e.coins / e.qty) }) : e.silver ? T('{n} silver', { n: Math.round(e.silver / e.qty) }) : '') : '';
			const note = e.detail || (e.barter ? T('barter at {n} islands', { n: e.barter.npcs.length }) : e.market ? T('Central Market, last sold') : '');
			rows.push([g.key, gameName(e.item), Math.round(e.qty), each, note]);
		}
	}
	return rows.map(r => r.map(cell).join(',')).join('\n');
}
