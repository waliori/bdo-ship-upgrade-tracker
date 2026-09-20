// To Get: everything outstanding grouped by how it is actually
// obtained, with the barter's real cost in sea time beside every shop
// price.
//
// What the forecast needs to know about the player -- the barter count,
// the level, the Parley, the pack, and the region every Market price is
// quoted in -- used to be typed into tiles in this screen's summary. It
// is in the shell's bar now (js/profile-bar.js), where every screen that
// reads it can be corrected from, so this one keeps to the list.

import { items as vendorItems, bulkExchanges } from './vendor_items.js';
import { marketSilver } from './market.js';
import { questsFor } from './quests.js';
import { coins } from './sea_coins.js';
import { falasi } from './falasi_vendor.js';
import {
	forecast as barterForecast,
	summarise as barterLine,
	explain as barterWhy,
	openTable
} from './barter.js';
import { esc, F, FC } from './fmt.js';
import { T, TT, said, gameName } from './i18n.js';
import * as store from './state.js';
import { img, codexName, copyName, costCtx, costText, groundsFor } from './ui-bits.js';
import {
	snapshot, barterData, barterOpts, totalsToGo, query, setQuery, rows, recipes, CROW_COIN, SILVER
} from './ui-state.js';
import { shoppingList, waysToGet, yieldOf } from './planner.js';
import { coinBuyButton } from './coin-shop.js';
import { PRESETS, DAY_CHOICES, DOING, wayText, groupLegs } from './get-plan.js';
import { theWay, getOrders, questDoneNow } from './get-way.js';

// Which of its two readings the screen gives: the way to get each
// thing -- one route an item, chosen against the others -- or every
// way, grouped by source. A preference, kept between sessions.
let mode = null;
function getMode() {
	if (mode === null) mode = store.getSetting('getMode', 'plan') === 'source' ? 'source' : 'plan';
	return mode;
}
export function setGetMode(m) {
	mode = m === 'source' ? 'source' : 'plan';
	store.setSetting('getMode', mode, true);
}



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
	const plan = barterForecast(item, qty, barterData, barterOpts());
	// Who deals it, counted on the islands this sailor has opened: "from
	// 27 barterers" is no comfort when twenty-six of them are the whole
	// Great Ocean and the twenty-seventh opens at three thousand. Where
	// none is open the forecast carries the gate and the row says that
	// instead, so the full table's names are still the right answer to
	// "where is this dealt at all".
	const table = plan && plan.gate ? barterData : openTable(barterData, barterOpts().barterCount);
	const entry = (table || []).find(b => b.name === item);
	if (!entry || !entry.sources || !entry.sources.length) return null;
	const npcs = [...new Set(entry.sources.map(s => s.npc_name))];
	const gives = [...new Set(entry.sources.map(s => s.give && s.give.name).filter(Boolean))];
	return { npcs, gives, plan };
}

/* ------------------------------------------------------------------ *
 * still to get
 * ------------------------------------------------------------------ */

// How many of the outstanding things the band shows before it asks. A
// full Carrack short-list runs to forty-odd icons, which is four rows
// of the window before the plan below it starts; eighteen is two rows
// on a laptop and says "and twenty-seven more" for the rest. A glance,
// not a preference, so it is not kept.
const FIRST = 18;
let allWanted = false;

/**
 * Still to get: every outstanding thing as its own icon and number.
 *
 * This band used to be four tiles -- the coins, the silver, the line
 * count, the Market region -- and every one of them was said better
 * somewhere else by the time the bar and the plan card existed: the
 * purse chips hold the coins and the silver, the plan card totals what
 * it is going to spend, and the region belongs to the sailor rather
 * than to this screen (it is a chip in the bar now, beside the pouch).
 *
 * What was left unsaid was the shape of the job: how many distinct
 * things are short, and which. So that is what it says now -- the
 * icons and the numbers, biggest shortfall first, tinted by the money
 * each one wants. It is also the screen's coarse filter: a press puts
 * one thing in the search below, which is the fastest way from "what
 * am I missing" to "so how do I get that one".
 */
function stillToGet(q) {
	const totals = totalsToGo();
	const market = marketSilver();
	// The two currencies are in the pouch above, priced and held; here
	// they would be two icons with no source and no recipe.
	const wanted = Object.entries(snapshot.missing || {})
		.filter(([item, qty]) => qty > 0 && item !== CROW_COIN && item !== SILVER)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

	const cost = [
		totals.coins ? T('{n} coins', { n: F(totals.coins) }) : '',
		totals.silver ? T('{n} silver', { n: FC(totals.silver) }) : ''
	].filter(Boolean).join(T(' and '));
	const said = !wanted.length
		? T('nothing outstanding')
		: `${wanted.length === 1 ? T('{n} thing short', { n: F(wanted.length) }) : T('{n} things short', { n: F(wanted.length) })}${cost ? ` · ${T('{cost} to cover what is bought', { cost })}` : ''}`;

	const shown = allWanted ? wanted : wanted.slice(0, FIRST);
	const tiles = shown.map(([item, n]) => {
		const r = rows[item] || {};
		// A yield of ten from one batch leaves fractions in the plan; a
		// manifest is a thing you carry, so it says whole items.
		const qty = Math.ceil(n);
		const need = Math.ceil(r.need || n);
		const have = Math.max(0, need - qty);
		const each = coins[item] || 0;
		const silver = falasi[item] || market[item] || 0;
		const tone = each ? 'amber' : silver ? 'blue' : '';
		const on = q && item.toLowerCase() === q;
		const price = each ? T('{n} coins each', { n: F(each) }) : silver ? T('{n} silver each', { n: FC(silver) }) : T('no shop sells it');
		return `<button class="want ${tone}${on ? ' on' : ''}" data-act="get-only" data-item="${esc(item)}"
			data-peek="${esc(item)}" aria-pressed="${on ? 'true' : 'false'}"
			title="${esc(gameName(item))} — ${T('{qty} short of {need} · {price}. Press to show only this below.', { qty: F(qty), need: F(need), price: esc(price) })}">
			${img(item, 'want-icon')}
			<span class="want-n">${F(qty)}</span>
			<span class="want-name">${esc(gameName(item))}</span>
			<span class="want-of">${have ? T('{n} of {need} in hand', { n: F(have), need: F(need) }) : T('none in hand')}</span>
		</button>`;
	}).join('');

	const more = wanted.length > FIRST
		? `<button class="linky want-more" data-act="get-all-wanted">${allWanted
			? T('show fewer')
			: T('and {n} more', { n: F(wanted.length - FIRST) })}</button>`
		: '';

	return `<div class="summary want-band">
		<div class="want-head">
			<span class="summary-title">${T('Still to get')}</span>
			<span class="want-said">${esc(said)}</span>
			<div class="get-copy">
				<button class="ghost-btn" data-act="copy">${T('Copy list')}</button>
				<button class="ghost-btn" data-act="copy-csv" title="${T('The same list as rows for a spreadsheet: group, item, quantity, unit cost, note')}">${T('Copy as CSV')}</button>
			</div>
		</div>
		${wanted.length ? `<div class="want-grid">${tiles}${more}</div>` : ''}
	</div>`;
}

export function renderGet() {
	const q = query.toLowerCase();
	const summary = stillToGet(q);

	const modes = [
		['plan', T('The way to get it'), T('One way an item, chosen against the others: the quests, the purse, the lists, in the days it takes')],
		['source', T('Every way'), T('Everything outstanding grouped by where it is got, with every other way under each')]
	];
	const controls = `<div class="controls">
		<input class="field" type="search" placeholder="${T('Search the list…')}" value="${esc(query)}" data-act="query" aria-label="${T('Search the list')}">
		<div class="chips">${modes.map(([id, label, title]) => `<button class="chip${getMode() === id ? ' active' : ''}" data-act="get-mode" data-id="${id}" title="${esc(title)}">${esc(label)}</button>`).join('')}</div>
	</div>`;

	if (getMode() === 'plan') return summary + controls + renderWay(q);

	const groups = visibleGroups(q);
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
				<h2 class="panel-title ${col}">${esc(said(g.key))}</h2>
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
				// The shop, where the shop sells it. The list already knows
				// the price and the purse already knows the coins; this is
				// the one press that stops a player doing the subtraction
				// by hand and getting it wrong.
				const shop = entry.coins ? coinBuyButton(entry.item, entry.qty) : '';
				return `<div class="row" data-peek="${esc(entry.item)}">
					${img(entry.item, 'row-icon sm')}
					<div class="row-main">
						<div class="row-name">${codexName(entry.item)}</div>
						<div class="row-sub">${esc(sub)}</div>
						${waysHTML}
					</div>
					${copyName(entry.item)}
					${shop}
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

/* ------------------------------------------------------------------ *
 * the way to get it
 * ------------------------------------------------------------------ */

const dayWord = n => n === 1 ? T('a day') : T('{n} days', { n: F(n) });

/**
 * One step of the plan, by the way its things are got.
 *
 * The list used to be groups of rows under a heading, which is a
 * catalogue: true, and no help at all with the question "so what do I
 * do first?". These are steps, numbered and in the order they are done,
 * because the quests pay the coins that buy the shop's half and a
 * player who buys first finds the purse empty when the quests come
 * round. Each says where it happens, since an errand without a place on
 * it is a name to go and look up somewhere else.
 */
const STEPS = {
	quest: { tone: 'teal', title: TT('Take these as quest rewards'), sub: TT('Materials the quests above hand you. Nothing to buy.') },
	coin: { tone: 'amber', title: TT('Buy at the Crow Coin Shop'), sub: TT("The shop is at Oquilla's Eye. Pay with what you hold and what the quests bring in.") },
	barter: { tone: 'blue', title: TT('Barter for these at sea'), sub: TT('Paced by how often the boards recorded each offer on the list.') },
	falasi: { tone: 'blue', title: TT('Buy from Falasi'), sub: TT('Philaberto Falasi, at the port of Epheria.') },
	market: { tone: 'blue', title: TT('Buy on the Central Market'), sub: TT('Priced as the market last sold them, in the region set on the sailor chip in the bar.') },
	find: { tone: 'red', title: TT('Go and get these'), sub: TT('Nothing publishes a rate for any of these, so none of them is counted in the days.') },
	hunt: { tone: 'red', title: TT('Hunt these at sea'), sub: TT('Sea monster drops. No timer on them — they come when they come.') },
	short: { tone: 'red', title: TT('Not reachable yet'), sub: TT('What the purse and the horizon between them could not cover.') }
};

// Which step cards are folded away. Session state: a fold is a glance,
// not a preference, and it should not follow you to another machine.
const folded = new Set();

const stepHead = (n, tone, title, sub, right, id) => `<button class="way-step-head" data-act="get-fold" data-id="${esc(id)}" aria-expanded="${!folded.has(id)}">
	<span class="way-step-n ${tone}">${n}</span>
	<span class="way-step-say">
		<span class="way-step-title">${esc(title)}</span>
		<span class="way-step-sub">${esc(sub)}</span>
	</span>
	<span class="way-step-count ${tone}">${right}</span>
	<span class="way-caret">${folded.has(id) ? '▼' : '▲'}</span>
</button>`;

/** What a step's right-hand figure says: money where there is money. */
function stepTotal(g) {
	if (g.coins) return T('{n} coins', { n: F(g.coins) });
	if (g.silver) return T('{n} silver', { n: FC(g.silver) });
	return g.items.length === 1 ? T('{n} item', { n: g.items.length }) : T('{n} items', { n: g.items.length });
}

/** The head of the plan: where it lands, what it costs, and every dial
 *  that moved it there, so the answer and its reasons are one card. */
function planHead(way, steps, things) {
	const o = way.orders;
	const headline = way.stalled ? T('Not inside a year')
		: way.reachable ? T('Done in {days}', { days: dayWord(way.days) })
		: way.residual.length === 1
			? T('Done in {days}, but for {n} thing', { days: dayWord(way.days), n: way.residual.length })
			: T('Done in {days}, but for {n} things', { days: dayWord(way.days), n: way.residual.length });
	const pace = way.longPole ? way.longPole.text
		: way.days === 1 ? T('Everything on the list fits inside today.')
		: T('Nothing on the list is waiting on a clock.');

	const c = way.coins;
	const budget = (c.purse - c.reserve) + c.income;
	const over = c.spend - budget;
	const fit = !c.spend ? T('no coins needed')
		: over > 0 ? T('{n} more than you can spare', { n: F(over) })
		: T('fits, {n} coins spare', { n: F(-over) });

	const prefs = PRESETS.map(p => `<button class="way-pref${p.id === o.preset ? ' on' : ''}" data-act="get-preset" data-id="${esc(p.id)}">
		<span class="way-pref-title"><span class="way-pref-tick">${p.id === o.preset ? '◉' : '○'}</span>${esc(said(p.label))}</span>
		<span class="way-pref-why">${esc(said(p.sub))}</span>
	</button>`).join('');

	const days = DAY_CHOICES.map(([n, label]) => `<option value="${n}"${n === o.days ? ' selected' : ''}>${esc(said(label))}</option>`).join('');
	const opts = DOING.map(([id, label, title]) => `<button class="way-opt${o[id] ? ' on' : ''}" data-act="get-doing" data-id="${esc(id)}" title="${esc(said(title))}" aria-pressed="${!!o[id]}">${o[id] ? '✓' : '✕'} ${esc(said(label))}</button>`).join('');

	// What the plan will never do, drawn from the orders in force rather
	// than from a fixed list, so it describes this plan and not the idea
	// of one. The two that are always true are always there.
	const rules = [
		[T('Barter runs on the boards'), T('Paced by how often the boards recorded each offer on the list, and by best case where none has.')],
		[T('A drop is never timed'), T('What a sea monster drops is named on the row so you know where it comes from, never promised by a date.')]
	];
	if (o.preset === 'silver') {
		rules.unshift([T('Nothing off the Central Market'), T('No line is bought on the market, even where the market lists it.')]);
		rules.push([T('Falasi only where he is the only one'), T('The Epheria vendor is used for what nobody else sells.')]);
	}
	if (o.preset === 'coins') rules.unshift([T('Crow Coins only where nothing else sells it'), T('The lists and the quests carry everything the shop is not the only source of.')]);
	if (o.reserve) rules.push([T('The coins you keep back stay yours'), T('{n} is never spent by this plan, whatever it costs in days.', { n: F(o.reserve) })]);
	for (const [id, label] of DOING) if (!o[id]) rules.push([T('{label}, switched off', { label: said(label) }), T('The plan works round it and names it as the reason on any row it could have covered.')]);
	const rulesOpen = !folded.has('rules');

	return `<div class="panel way-head">
		<div class="way-head-top">
			<div class="way-head-say">
				<div class="way-eyebrow">${T('Your plan')}</div>
				<div class="way-headline">${esc(headline)}</div>
				<p class="way-pace">${esc(pace)}</p>
			</div>
			<div class="way-tiles">
				<div class="way-tile amber">
					<div class="way-tile-k">${T('Coins to spend')}</div>
					<div class="way-tile-v">${F(c.spend)}</div>
					<div class="way-tile-sub${over > 0 ? ' warn' : ' good'}">${esc(fit)}</div>
				</div>
				${way.silver.spend ? `<div class="way-tile blue">
					<div class="way-tile-k">${T('Silver to spend')}</div>
					<div class="way-tile-v">${FC(way.silver.spend)}</div>
					<div class="way-tile-sub${way.silver.short ? ' warn' : ' good'}">${way.silver.short ? T('{n} more than you hold', { n: FC(way.silver.short) }) : T('fits, {n} spare', { n: FC(way.silver.purse - way.silver.spend) })}</div>
				</div>` : ''}
				<div class="way-tile">
					<div class="way-tile-k">${T('Things to obtain')}</div>
					<div class="way-tile-v">${F(things)}</div>
					<div class="way-tile-sub">${steps === 1 ? T('across {n} step', { n: F(steps) }) : T('across {n} steps', { n: F(steps) })}</div>
				</div>
			</div>
		</div>

		<div class="way-band">
			<div class="way-band-k">${T('What matters most to you')}</div>
			<div class="way-prefs">${prefs}</div>
		</div>

		<div class="way-band way-knobs">
			<div>
				<div class="way-band-k">${T('You sail')}</div>
				<select class="way-field" data-act="get-days" aria-label="${T('How many days a week you sail')}">${days}</select>
			</div>
			<div>
				<div class="way-band-k">${T('Coins you keep back')}</div>
				<div class="way-knob-row">
					<input class="way-field coins" type="text" inputmode="numeric" value="${F(o.reserve)}" data-act="get-reserve" aria-label="${T('Crow Coins to keep back')}">
					<span class="way-knob-note">${T('never spent by the plan')}</span>
				</div>
			</div>
			<div class="way-knob-wide">
				<div class="way-band-k">${T('Ways you are willing to use')}</div>
				<div class="way-opts">${opts}</div>
				<div class="way-knob-note">${T('Switch one off and the plan finds another way round it.')}</div>
			</div>
		</div>

		<div class="way-rules">
			<button class="linky" data-act="get-fold" data-id="rules" aria-expanded="${rulesOpen}">${rulesOpen ? T('Hide what this plan will never do') : T('What this plan will never do')}</button>
			${rulesOpen ? `<div class="way-rule-grid">${rules.map(([t, d]) => `<div class="way-rule">
				<div class="way-rule-t">${esc(t)}</div>
				<div class="way-rule-d">${esc(d)}</div>
			</div>`).join('')}</div>` : ''}
		</div>
	</div>`;
}

/** The quests to run, as errands: how often, where, and what to take. */
function questStep(way, n, q) {
	const picks = store.getProfile('questPicks', {}) || {};
	const wanted = new Set(Object.keys(snapshot.missing || {}));
	const chip = (item, qty, cls = '') => `<span class="reward${wanted.has(item) ? ' wanted' : ''}${cls}" data-peek="${esc(item)}">${img(item, 'reward-icon')}<b>${F(qty)}×</b> ${esc(gameName(item))}</span>`;

	const shown = way.quests.filter(x => !q || x.name.toLowerCase().includes(q) || x.pays.some(p => p.item.toLowerCase().includes(q)));
	if (!shown.length) return '';

	const row = x => {
		const done = questDoneNow(x.quest);
		const choice = x.quest.choice && x.pick !== null ? Object.entries(x.quest.choice[x.pick]) : null;
		const mine = choice && picks[x.id] === x.pick;
		const takeChips = choice ? choice.map(([item, qty]) => chip(item, qty, ' take')).join('') : '';
		const fixedChips = x.pays.filter(p => !choice || !choice.some(([item]) => item === p.item)).map(p => chip(p.item, p.qty)).join('');
		const coins = x.coins ? `<span class="reward coin-chip">${img(CROW_COIN, 'reward-icon')}<b>${F(x.coins)}</b> ${T('Crow Coins')}</span>` : '';
		const pick = choice && !mine
			? `<button class="ghost-btn tiny" data-act="get-pick" data-quest="${esc(x.id)}" data-i="${x.pick}" title="${T('Remember it: Claimed on the Quests screen then records this reward in one press')}">${T('make it my pick')}</button>`
			: choice ? `<span class="way-mine">${T('your pick — counted in the step below')}</span>` : '';
		const over = x.over.length
			? `<div class="way-over">${T('chosen over {list}, which the plan gets another way', { list: x.over.map(o => `${F(o.qty)}× ${esc(gameName(o.item))}`).join(', ') })}</div>`
			: '';
		return `<div class="way-q${done ? ' done' : ''}">
			<span class="way-q-times">${x.cadence === 'once' ? T('once') : `×${F(x.completions)}`}</span>
			<div class="way-q-main">
				<div class="way-q-name"><button class="linky" data-act="get-quest" data-quest="${esc(x.id)}" title="${T('Open it on the Quests screen')}">${esc(gameName(x.name))}</button>${done ? `<span class="quest-done-tag">✓ ${x.cadence === 'weekly' ? T('done this week') : T('done today')}</span>` : ''}</div>
				<div class="way-where">${esc(said(x.quest.where || ''))}</div>
				<div class="quest-rewards way-pays">${takeChips}${fixedChips}${coins}${pick}</div>
				${over}
			</div>
		</div>`;
	};

	const groups = [
		['daily', T('Every day'), T('the tick wears off at the daily reset')],
		['weekly', T('Once a week'), T('the tick wears off at the weekly reset')],
		['once', T('One-off'), T('do it once, never again')]
	].map(([cad, label, note]) => {
		const rows = shown.filter(x => x.cadence === cad);
		if (!rows.length) return '';
		return `<div class="way-q-group">
			<div class="way-q-group-head"><span class="way-q-group-k">${esc(label)}</span><span class="way-q-group-note">${rows.length === 1 ? T('{n} quest', { n: rows.length }) : T('{n} quests', { n: rows.length })} · ${esc(note)}</span></div>
			${rows.map(row).join('')}
		</div>`;
	}).join('');

	const runs = shown.reduce((a, x) => a + x.completions, 0);
	const id = 'quests';
	return `<div class="panel way-step">
		${stepHead(n, 'teal', T('Run these quests'), T('What the sea hands out free, and the coins that pay for the rest.'), `${shown.length === 1 ? T('{n} quest', { n: shown.length }) : T('{n} quests', { n: shown.length })} · ${runs === 1 ? T('{n} run', { n: F(runs) }) : T('{n} runs', { n: F(runs) })}`, id)}
		${folded.has(id) ? '' : `<div class="way-step-body">
			<div class="way-legend">
				<span><i class="sw teal"></i>${T('materials handed to you')}</span>
				<span><i class="sw amber"></i>${T('Crow Coins it pays')}</span>
				${way.coins.income ? `<span class="way-knob-note">${T('they pay {n} coins in all', { n: F(way.coins.income) })}</span>` : ''}
			</div>
			${groups}
		</div>`}
	</div>`;
}

/** One material's row inside a step: what it is, why this way, and the
 *  ways the plan could not count. */
function wayRow(l) {
	const door = l.kind === 'barter' ? `<button class="chart-link" data-act="goto-map" data-item="${esc(l.item)}">${T('on the map')}</button>`
		: l.kind === 'quest' ? `<button class="chart-link" data-act="goto-quests" data-item="${esc(l.item)}">${T('the quests')}</button>`
		: '';
	const shop = l.kind === 'coin' && !l.unpriced ? coinBuyButton(l.item, Math.ceil(l.qty)) : '';
	const lines = (l.lines && l.lines.length ? l.lines : [l.why]).filter(Boolean);
	const cost = l.coins ? `<div class="way-qty-cost">${T('{n} coins', { n: F(l.coins) })}</div>`
		: l.silver ? `<div class="way-qty-cost">${T('{n} silver', { n: FC(l.silver) })}</div>` : '';

	// A thing you are going to hunt for is often a thing you then process
	// -- a tendon dries into ten fabric -- and the recipe is the half the
	// drop does not tell you. Shown inline, each ingredient carrying the
	// app's own hover card.
	const recipe = (l.kind === 'find' || l.kind === 'hunt') && recipes[l.item] ? recipes[l.item] : null;
	const how = recipe ? ((vendorItems[l.item] || {}).Processing || (vendorItems[l.item] || {}).Crafting || [])[0] : '';
	const makes = recipe ? yieldOf(l.item) : 1;
	const strip = recipe ? `<div class="way-recipe">
		${Object.entries(recipe).map(([ing, per]) => `<span class="way-ing" data-peek="${esc(ing)}">${img(ing, 'reward-icon')}${F(per)}×</span>`).join('')}
		<span class="way-ing-note">${esc(how ? gameName(how) : T('made from these'))}${makes > 1 ? ` · ${T('makes {n}', { n: F(makes) })}` : ''} · ${Math.ceil(l.qty / makes) === 1 ? T('{n} batch', { n: F(Math.ceil(l.qty / makes)) }) : T('{n} batches', { n: F(Math.ceil(l.qty / makes)) })}</span>
	</div>` : '';

	return `<div class="row way-row" data-peek="${esc(l.item)}">
		${img(l.item, 'row-icon sm')}
		<div class="row-main">
			<div class="row-name">${codexName(l.item)}</div>
			${lines.map((line, i) => `<div class="row-sub way-why">${esc([i === 0 ? l.unit : '', line].filter(Boolean).join(' · '))}${i === lines.length - 1 && door ? ` · ${door}` : ''}</div>`).join('')}
			${l.also ? `<div class="row-alt way-also">${T('also: {text}', { text: esc(l.also) })}</div>` : ''}
			${strip}
		</div>
		${copyName(l.item)}
		${shop}
		<div class="way-qty">
			<div class="qty-out">${F(Math.ceil(l.qty))}</div>
			${cost}
		</div>
	</div>`;
}

/**
 * The plan: where it lands and what the dials are, then the steps in
 * the order they are done.
 */
function renderWay(q) {
	const way = theWay();
	if (!way || !way.legs.length) {
		return `<div class="panel"><p class="empty">${!way ? T('Nothing to plan yet.') : T('Nothing outstanding — every build has what it needs.')}</p></div>`;
	}

	const legs = q ? way.legs.filter(l => l.item.toLowerCase().includes(q)) : way.legs;
	const groups = groupLegs(legs);
	const questsHTML = way.orders.quests ? questStep(way, 1, q) : '';
	const things = legs.filter(l => l.kind !== 'short').length;
	const steps = groups.length + (questsHTML ? 1 : 0);
	let n = questsHTML ? 1 : 0;

	const body = groups.map(g => {
		const meta = STEPS[g.kind] || STEPS.find;
		n += 1;
		// The draws are the barter step's real price, and they are shared
		// across its rows -- so they belong on the step, not on any one of
		// them.
		const r = way.refreshes;
		const draws = g.kind === 'barter' && r
			? [r.material ? T('{n} draws of the material list', { n: F(Math.ceil(r.material)) }) : '', r.trade ? T('{n} of the trade list', { n: F(Math.ceil(r.trade)) }) : '']
				.filter(Boolean).join(T(' and '))
			: '';
		const sub = draws ? `${said(meta.sub)} ${T('{draws}, over {days}.', { draws, days: dayWord(way.days) })}` : said(meta.sub);
		const id = `step-${g.kind}`;
		const foot = g.kind === 'coin' ? `<div class="way-step-foot">${esc(coinFoot(way))}</div>`
			: g.kind === 'quest' && way.coins.income ? `<div class="row way-coin-row">
				${img(CROW_COIN, 'row-icon sm')}
				<div class="row-main">
					<div class="row-name amber">${T('Crow Coins from these quests')}</div>
					<div class="row-sub">${T('added up across every quest in step 1, and spent in the shop below')}</div>
				</div>
				<div class="way-qty"><div class="qty-out amber">${F(way.coins.income)}</div></div>
			</div>` : '';
		return `<div class="panel way-step">
			${stepHead(n, meta.tone, said(meta.title), sub, stepTotal(g), id)}
			${folded.has(id) ? '' : `<div class="way-step-body">${g.items.map(wayRow).join('')}${foot}</div>`}
		</div>`;
	}).join('');

	const head = planHead(way, steps, things);
	if (q && !legs.length && !questsHTML) return head + `<div class="panel"><p class="empty">${T('Nothing in the plan matches that search.')}</p></div>`;

	const rule = `<div class="way-order">
		<span class="way-order-k">${questsHTML ? T('Then do this, in order') : T('Do this, in order')}</span>
		<i></i>
		<span class="way-order-n">${steps === 1 ? T('{n} step', { n: F(steps) }) : T('{n} steps', { n: F(steps) })} · ${things === 1 ? T('{n} thing to obtain', { n: F(things) }) : T('{n} things to obtain', { n: F(things) })}</span>
	</div>`;

	return head + questsHTML + rule + body;
}

/** What the purse has to work with, said once under the shop. */
function coinFoot(way) {
	const c = way.coins;
	const parts = [T('{n} held', { n: F(c.purse) })];
	if (c.income) parts.push(T('{n} the quests pay', { n: F(c.income) }));
	if (c.reserve) parts.push(T('{n} kept back', { n: F(c.reserve) }));
	parts.push(T('{n} left after this', { n: F(Math.max(0, c.purse - c.reserve + c.income - c.spend)) }));
	return parts.join(' · ');
}

export function getAction(act, el) {
	switch (act) {
		case 'get-mode': setGetMode(el.dataset.id); return true;
		// A press on one of the icons in Still to get: the coarse filter
		// this screen never had. The same press again gives the whole
		// list back, so the band is a toggle rather than a trap.
		case 'get-only': {
			const item = el.dataset.item || '';
			setQuery(query.toLowerCase() === item.toLowerCase() ? '' : item);
			return true;
		}
		case 'get-all-wanted': allWanted = !allWanted; return true;
		case 'get-fold': {
			const id = el.dataset.id;
			if (folded.has(id)) folded.delete(id); else folded.add(id);
			return true;
		}
		// The activity switches are chips, so they answer a click. They
		// were ticks once and were left in the `change` handler when they
		// became buttons, where nothing a button does ever reaches them.
		case 'get-doing': {
			const o = getOrders();
			store.setProfile('getOrders', { ...o, [el.dataset.id]: !o[el.dataset.id] });
			return false;
		}
		case 'get-preset': store.setProfile('getOrders', { ...getOrders(), preset: el.dataset.id }); return false;
		case 'get-pick': {
			const picks = store.getProfile('questPicks', {}) || {};
			store.setProfileQuiet('questPicks', { ...picks, [el.dataset.quest]: Number(el.dataset.i) });
			return true;
		}
		default: return false;
	}
}

/** A typed order: the days a week, the coins kept back. */
export function getChange(el, parseAmount) {
	if (el.dataset.act === 'get-days') { store.setProfile('getOrders', { ...getOrders(), days: Number(el.value) }); return true; }
	if (el.dataset.act === 'get-reserve') {
		const n = parseAmount(el.value);
		store.setProfile('getOrders', { ...getOrders(), reserve: n === null ? 0 : n });
		return true;
	}
	return false;
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
	if (getMode() === 'plan') return wayText(theWay());
	return visibleGroups(query.toLowerCase()).map(g => {
		const total = g.coins ? ` — ${T('{n} coins', { n: F(g.coins) })}` : g.silver ? ` — ${T('{n} silver', { n: F(g.silver) })}` : '';
		const lines = [...g.items].sort((a, b) => b.qty - a.qty).map(e => `  ${Math.round(e.qty)}× ${gameName(e.item)}`);
		return `${said(g.key)}${total}\n${lines.join('\n')}`;
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
	if (getMode() === 'plan') {
		const way = theWay();
		for (const g of (way ? way.groups : [])) {
			for (const l of g.items) {
				const each = l.qty ? (l.coins ? T('{n} coins', { n: Math.round(l.coins / l.qty) }) : l.silver ? T('{n} silver', { n: Math.round(l.silver / l.qty) }) : '') : '';
				rows.push([said(g.label), gameName(l.item), Math.ceil(l.qty), each, [l.why, l.also ? T('also: {text}', { text: l.also }) : ''].filter(Boolean).join(' · ')]);
			}
		}
		return rows.map(r => r.map(cell).join(',')).join('\n');
	}
	for (const g of visibleGroups(query.toLowerCase())) {
		for (const e of [...g.items].sort((a, b) => b.qty - a.qty)) {
			const each = e.qty ? (e.coins ? T('{n} coins', { n: Math.round(e.coins / e.qty) }) : e.silver ? T('{n} silver', { n: Math.round(e.silver / e.qty) }) : '') : '';
			const note = e.detail || (e.barter ? T('barter at {n} islands', { n: e.barter.npcs.length }) : e.market ? T('Central Market, last sold') : '');
			rows.push([said(g.key), gameName(e.item), Math.round(e.qty), each, note]);
		}
	}
	return rows.map(r => r.map(cell).join(',')).join('\n');
}
