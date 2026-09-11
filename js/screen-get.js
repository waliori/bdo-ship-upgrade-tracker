// To Get: everything outstanding grouped by how it is actually
// obtained, with the barter's real cost in sea time beside every shop
// price.
//
// What the forecast needs to know about the player -- the barter count,
// the level, the Parley and the pack -- used to be typed into a tile in
// this screen's summary. It is in the shell's bar now (js/profile-bar.js),
// where every screen that reads it can be corrected from, so this one
// keeps to the list.

import { items as vendorItems, bulkExchanges } from './vendor_items.js';
import { marketSilver, marketStatus, REGIONS as MARKET_REGIONS } from './market.js';
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
import * as store from './state.js';
import { img, codexName, costCtx, costText, groundsFor } from './ui-bits.js';
import {
	snapshot, barterData, barterOpts, totalsToGo, query, recipes, CROW_COIN, SILVER
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

/**
 * The Market's prices: which region, how old, and a way to ask again.
 * Shown as a fact about the numbers above it, because a plan priced off
 * last Tuesday's plywood should say so.
 */
function marketTile() {
	const s = marketStatus();
	const options = MARKET_REGIONS.map(([id, label]) =>
		`<option value="${id}"${id === s.region ? ' selected' : ''}>${label}</option>`).join('');
	const age = !s.at ? 'no prices yet'
		: `${s.count} priced · ${ageText(Date.now() - s.at)}${s.failed ? ' · some unanswered' : ''}`;
	return `<div>
		<div class="summary-k">Market prices</div>
		<div class="summary-v"><select class="purse-inline" data-act="market-region" aria-label="Which region's Central Market">${options}</select></div>
		<div class="summary-sub">${esc(age)} · <button class="linky" data-act="market-refresh">refresh</button></div>
	</div>`;
}

const ageText = ms => ms < 60_000 ? 'just now'
	: ms < 3_600_000 ? `${Math.round(ms / 60_000)} min ago`
	: ms < 86_400_000 ? `${Math.round(ms / 3_600_000)} h ago`
	: `${Math.round(ms / 86_400_000)} d ago`;

export function renderGet() {
	const totals = totalsToGo();
	const q = query.toLowerCase();

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
			${marketTile()}
		</div>
		<div class="get-copy">
			<button class="ghost-btn" data-act="copy">Copy list</button>
			<button class="ghost-btn" data-act="copy-csv" title="The same list as rows for a spreadsheet: group, item, quantity, unit cost, note">Copy as CSV</button>
		</div>
	</div>`;

	const modes = [['plan', 'The way to get it', 'One way an item, chosen against the others: the quests, the purse, the lists, in the days it takes'], ['source', 'Every way', 'Everything outstanding grouped by where it is got, with every other way under each']];
	const controls = `<div class="controls">
		<input class="field" type="search" placeholder="Search the list…" value="${esc(query)}" data-act="query" aria-label="Search the list">
		<div class="chips">${modes.map(([id, label, title]) => `<button class="chip${getMode() === id ? ' active' : ''}" data-act="get-mode" data-id="${id}" title="${esc(title)}">${esc(label)}</button>`).join('')}</div>
	</div>`;

	if (getMode() === 'plan') return summary + controls + renderWay(q);

	const groups = visibleGroups(q);
	if (!groups.length) {
		return summary + controls + `<div class="panel"><p class="empty">${q
			? 'Nothing outstanding matches that search.'
			: 'Nothing outstanding — every build has what it needs.'}</p></div>`;
	}

	const body = groups.map(g => {
		const total = g.coins ? `${F(g.coins)} coins` : g.silver ? `${F(g.silver)} silver` : `${g.items.length} item${g.items.length === 1 ? '' : 's'}`;
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
					const t = `barter at ${entry.barter.npcs.length} islands for ${entry.barter.gives.slice(0, 2).join(' / ')}`;
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
					? ` <span class="row-sea-why">· hands over ${F(plan.cargo.count)}× [Level ${plan.cargo.level}] worth ${FC(plan.cargo.worth)} silver sold</span>`
					: '';
				const seed = plan && !plan.gate && plan.seed
					? ` <span class="row-sea-why">from ${F(Math.ceil(plan.seed.qty))}× ${esc(plan.seed.item)}</span>`
					: '';
				// The barter line names the sea; this link opens it. The
				// map picks the item and frames its islands, which is the
				// answer "from 6 NPCs" only gestures at.
				const chart = `<button class="chart-link" data-act="goto-map" data-item="${esc(entry.item)}">on the map</button>`;
				const sea = plan
					? `<div class="row-sea${plan.gate ? ' locked' : ''}">by barter: ${esc(barterLine(plan))}${
						why ? ` <span class="row-sea-why">${esc(why)}</span>` : ''}${
						plan.gate ? '' : ' <span class="row-sea-why">· if the offer turns up</span>'}${cargo}${seed} ${chart}</div>`
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
				// What drops it, when the chart knows where that swims.
				// Same reading as the item card's, from the same place.
				const grounds = groundsFor(entry.item).slice(0, 3);
				const hunt = grounds.length
					? `<div class="row-alt">hunt: ${grounds.map(m => `<button class="chart-link" data-act="quest-map" data-monster="${esc(m.key)}">${esc(m.name)}</button>`).join(' · ')}</div>`
					: '';
				const bulk = bulkExchanges[entry.item];
				const inBulk = bulk
					? `<div class="row-alt">or ${F(Math.ceil(entry.qty / bulk.gets))}× ${esc(bulk.give)}, ${F(bulk.gets)} a time</div>`
					: '';
				const ways = [alt, inBulk, hunt, sea].filter(Boolean);
				const waysHTML = ways.length ? `<details class="row-ways"${ways.length === 1 && !sea ? ' open' : ''}>
					<summary>${ways.length === 1 ? 'another way' : `${ways.length} other ways`}${sea ? ' · by barter' : ''}${hunt ? ' · by hunting' : ''}</summary>
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
					${shop}
					<span class="qty-out">${F(entry.qty)}</span>
				</div>`;
			}).join('')}
		</div>`;
	}).join('');

	// The quests that pay in what is short are a screen of their own; a
	// line here says how many, so the list is not read as the whole story.
	const free = questsFor(snapshot.missing).length;
	const hint = free ? `<p class="get-quests"><button class="linky" data-act="view" data-id="quests">${free} quest${free === 1 ? '' : 's'} pay in something on this list</button> — Quests records a claimed reward in your stock.</p>` : '';
	return summary + controls + hint + body;
}

/* ------------------------------------------------------------------ *
 * the way to get it
 * ------------------------------------------------------------------ */

const dayWord = n => n === 1 ? 'a day' : `${F(n)} days`;

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
	quest: { tone: 'teal', title: 'Take these as quest rewards', sub: 'Materials the quests above hand you. Nothing to buy.' },
	coin: { tone: 'amber', title: 'Buy at the Crow Coin Shop', sub: "The shop is at Oquilla's Eye. Pay with what you hold and what the quests bring in." },
	barter: { tone: 'blue', title: 'Barter for these at sea', sub: 'Paced by how often the boards recorded each offer on the list.' },
	falasi: { tone: 'blue', title: 'Buy from Falasi', sub: 'Philaberto Falasi, at the port of Epheria.' },
	market: { tone: 'blue', title: 'Buy on the Central Market', sub: 'Priced as the market last sold them, in the region you picked above.' },
	find: { tone: 'red', title: 'Go and get these', sub: 'Nothing publishes a rate for any of these, so none of them is counted in the days.' },
	hunt: { tone: 'red', title: 'Hunt these at sea', sub: 'Sea monster drops. No timer on them — they come when they come.' },
	short: { tone: 'red', title: 'Not reachable yet', sub: 'What the purse and the horizon between them could not cover.' }
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
	if (g.coins) return `${F(g.coins)} coins`;
	if (g.silver) return `${FC(g.silver)} silver`;
	return `${g.items.length} item${g.items.length === 1 ? '' : 's'}`;
}

/** The head of the plan: where it lands, what it costs, and every dial
 *  that moved it there, so the answer and its reasons are one card. */
function planHead(way, steps, things) {
	const o = way.orders;
	const headline = way.stalled ? 'Not inside a year'
		: way.reachable ? `Done in ${dayWord(way.days)}`
		: `Done in ${dayWord(way.days)}, but for ${way.residual.length} thing${way.residual.length === 1 ? '' : 's'}`;
	const pace = way.longPole ? way.longPole.text
		: way.days === 1 ? 'Everything on the list fits inside today.'
		: 'Nothing on the list is waiting on a clock.';

	const c = way.coins;
	const budget = (c.purse - c.reserve) + c.income;
	const over = c.spend - budget;
	const fit = !c.spend ? 'no coins needed'
		: over > 0 ? `${F(over)} more than you can spare`
		: `fits, ${F(-over)} coins spare`;

	const prefs = PRESETS.map(p => `<button class="way-pref${p.id === o.preset ? ' on' : ''}" data-act="get-preset" data-id="${esc(p.id)}">
		<span class="way-pref-title"><span class="way-pref-tick">${p.id === o.preset ? '◉' : '○'}</span>${esc(p.label)}</span>
		<span class="way-pref-why">${esc(p.sub)}</span>
	</button>`).join('');

	const days = DAY_CHOICES.map(([n, label]) => `<option value="${n}"${n === o.days ? ' selected' : ''}>${esc(label)}</option>`).join('');
	const opts = DOING.map(([id, label, title]) => `<button class="way-opt${o[id] ? ' on' : ''}" data-act="get-doing" data-id="${esc(id)}" title="${esc(title)}" aria-pressed="${!!o[id]}">${o[id] ? '✓' : '✕'} ${esc(label)}</button>`).join('');

	// What the plan will never do, drawn from the orders in force rather
	// than from a fixed list, so it describes this plan and not the idea
	// of one. The two that are always true are always there.
	const rules = [
		['Barter runs on the boards', 'Paced by how often the boards recorded each offer on the list, and by best case where none has.'],
		['A drop is never timed', 'What a sea monster drops is named on the row so you know where it comes from, never promised by a date.']
	];
	if (o.preset === 'silver') {
		rules.unshift(['Nothing off the Central Market', 'No line is bought on the market, even where the market lists it.']);
		rules.push(['Falasi only where he is the only one', 'The Epheria vendor is used for what nobody else sells.']);
	}
	if (o.preset === 'coins') rules.unshift(['Crow Coins only where nothing else sells it', 'The lists and the quests carry everything the shop is not the only source of.']);
	if (o.reserve) rules.push(['The coins you keep back stay yours', `${F(o.reserve)} is never spent by this plan, whatever it costs in days.`]);
	for (const [id, label] of DOING) if (!o[id]) rules.push([`${label}, switched off`, 'The plan works round it and names it as the reason on any row it could have covered.']);
	const rulesOpen = !folded.has('rules');

	return `<div class="panel way-head">
		<div class="way-head-top">
			<div class="way-head-say">
				<div class="way-eyebrow">Your plan</div>
				<div class="way-headline">${esc(headline)}</div>
				<p class="way-pace">${esc(pace)}</p>
			</div>
			<div class="way-tiles">
				<div class="way-tile amber">
					<div class="way-tile-k">Coins to spend</div>
					<div class="way-tile-v">${F(c.spend)}</div>
					<div class="way-tile-sub${over > 0 ? ' warn' : ' good'}">${esc(fit)}</div>
				</div>
				${way.silver.spend ? `<div class="way-tile blue">
					<div class="way-tile-k">Silver to spend</div>
					<div class="way-tile-v">${FC(way.silver.spend)}</div>
					<div class="way-tile-sub${way.silver.short ? ' warn' : ' good'}">${way.silver.short ? `${FC(way.silver.short)} more than you hold` : `fits, ${FC(way.silver.purse - way.silver.spend)} spare`}</div>
				</div>` : ''}
				<div class="way-tile">
					<div class="way-tile-k">Things to obtain</div>
					<div class="way-tile-v">${F(things)}</div>
					<div class="way-tile-sub">across ${F(steps)} step${steps === 1 ? '' : 's'}</div>
				</div>
			</div>
		</div>

		<div class="way-band">
			<div class="way-band-k">What matters most to you</div>
			<div class="way-prefs">${prefs}</div>
		</div>

		<div class="way-band way-knobs">
			<div>
				<div class="way-band-k">You sail</div>
				<select class="way-field" data-act="get-days" aria-label="How many days a week you sail">${days}</select>
			</div>
			<div>
				<div class="way-band-k">Coins you keep back</div>
				<div class="way-knob-row">
					<input class="way-field coins" type="text" inputmode="numeric" value="${F(o.reserve)}" data-act="get-reserve" aria-label="Crow Coins to keep back">
					<span class="way-knob-note">never spent by the plan</span>
				</div>
			</div>
			<div class="way-knob-wide">
				<div class="way-band-k">Ways you are willing to use</div>
				<div class="way-opts">${opts}</div>
				<div class="way-knob-note">Switch one off and the plan finds another way round it.</div>
			</div>
		</div>

		<div class="way-rules">
			<button class="linky" data-act="get-fold" data-id="rules" aria-expanded="${rulesOpen}">${rulesOpen ? 'Hide what this plan will never do' : 'What this plan will never do'}</button>
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
	const chip = (item, qty, cls = '') => `<span class="reward${wanted.has(item) ? ' wanted' : ''}${cls}" data-peek="${esc(item)}">${img(item, 'reward-icon')}<b>${F(qty)}×</b> ${esc(item)}</span>`;

	const shown = way.quests.filter(x => !q || x.name.toLowerCase().includes(q) || x.pays.some(p => p.item.toLowerCase().includes(q)));
	if (!shown.length) return '';

	const row = x => {
		const done = questDoneNow(x.quest);
		const choice = x.quest.choice && x.pick !== null ? Object.entries(x.quest.choice[x.pick]) : null;
		const mine = choice && picks[x.id] === x.pick;
		const takeChips = choice ? choice.map(([item, qty]) => chip(item, qty, ' take')).join('') : '';
		const fixedChips = x.pays.filter(p => !choice || !choice.some(([item]) => item === p.item)).map(p => chip(p.item, p.qty)).join('');
		const coins = x.coins ? `<span class="reward coin-chip">${img(CROW_COIN, 'reward-icon')}<b>${F(x.coins)}</b> Crow Coins</span>` : '';
		const pick = choice && !mine
			? `<button class="ghost-btn tiny" data-act="get-pick" data-quest="${esc(x.id)}" data-i="${x.pick}" title="Remember it: Claimed on the Quests screen then records this reward in one press">make it my pick</button>`
			: choice ? '<span class="way-mine">your pick — counted in the step below</span>' : '';
		const over = x.over.length
			? `<div class="way-over">chosen over ${x.over.map(o => `${F(o.qty)}× ${esc(o.item)}`).join(', ')}, which the plan gets another way</div>`
			: '';
		return `<div class="way-q${done ? ' done' : ''}">
			<span class="way-q-times">${x.cadence === 'once' ? 'once' : `×${F(x.completions)}`}</span>
			<div class="way-q-main">
				<div class="way-q-name"><button class="linky" data-act="get-quest" data-quest="${esc(x.id)}" title="Open it on the Quests screen">${esc(x.name)}</button>${done ? `<span class="quest-done-tag">✓ ${x.cadence === 'weekly' ? 'done this week' : 'done today'}</span>` : ''}</div>
				<div class="way-where">${esc(x.quest.where || '')}</div>
				<div class="quest-rewards way-pays">${takeChips}${fixedChips}${coins}${pick}</div>
				${over}
			</div>
		</div>`;
	};

	const groups = [
		['daily', 'Every day', 'the tick wears off at the daily reset'],
		['weekly', 'Once a week', 'the tick wears off at the weekly reset'],
		['once', 'One-off', 'do it once, never again']
	].map(([cad, label, note]) => {
		const rows = shown.filter(x => x.cadence === cad);
		if (!rows.length) return '';
		return `<div class="way-q-group">
			<div class="way-q-group-head"><span class="way-q-group-k">${esc(label)}</span><span class="way-q-group-note">${rows.length} quest${rows.length === 1 ? '' : 's'} · ${esc(note)}</span></div>
			${rows.map(row).join('')}
		</div>`;
	}).join('');

	const runs = shown.reduce((a, x) => a + x.completions, 0);
	const id = 'quests';
	return `<div class="panel way-step">
		${stepHead(n, 'teal', 'Run these quests', 'What the sea hands out free, and the coins that pay for the rest.', `${shown.length} quest${shown.length === 1 ? '' : 's'} · ${F(runs)} run${runs === 1 ? '' : 's'}`, id)}
		${folded.has(id) ? '' : `<div class="way-step-body">
			<div class="way-legend">
				<span><i class="sw teal"></i>materials handed to you</span>
				<span><i class="sw amber"></i>Crow Coins it pays</span>
				${way.coins.income ? `<span class="way-knob-note">they pay ${F(way.coins.income)} coins in all</span>` : ''}
			</div>
			${groups}
		</div>`}
	</div>`;
}

/** One material's row inside a step: what it is, why this way, and the
 *  ways the plan could not count. */
function wayRow(l) {
	const door = l.kind === 'barter' ? `<button class="chart-link" data-act="goto-map" data-item="${esc(l.item)}">on the map</button>`
		: l.kind === 'quest' ? `<button class="chart-link" data-act="goto-quests" data-item="${esc(l.item)}">the quests</button>`
		: '';
	const shop = l.kind === 'coin' && !l.unpriced ? coinBuyButton(l.item, Math.ceil(l.qty)) : '';
	const lines = (l.lines && l.lines.length ? l.lines : [l.why]).filter(Boolean);
	const cost = l.coins ? `<div class="way-qty-cost">${F(l.coins)} coins</div>`
		: l.silver ? `<div class="way-qty-cost">${FC(l.silver)} silver</div>` : '';

	// A thing you are going to hunt for is often a thing you then process
	// -- a tendon dries into ten fabric -- and the recipe is the half the
	// drop does not tell you. Shown inline, each ingredient carrying the
	// app's own hover card.
	const recipe = (l.kind === 'find' || l.kind === 'hunt') && recipes[l.item] ? recipes[l.item] : null;
	const how = recipe ? ((vendorItems[l.item] || {}).Processing || (vendorItems[l.item] || {}).Crafting || [])[0] : '';
	const makes = recipe ? yieldOf(l.item) : 1;
	const strip = recipe ? `<div class="way-recipe">
		${Object.entries(recipe).map(([ing, per]) => `<span class="way-ing" data-peek="${esc(ing)}">${img(ing, 'reward-icon')}${F(per)}×</span>`).join('')}
		<span class="way-ing-note">${esc(how || 'made from these')}${makes > 1 ? ` · makes ${F(makes)}` : ''} · ${F(Math.ceil(l.qty / makes))} batch${Math.ceil(l.qty / makes) === 1 ? '' : 'es'}</span>
	</div>` : '';

	return `<div class="row way-row" data-peek="${esc(l.item)}">
		${img(l.item, 'row-icon sm')}
		<div class="row-main">
			<div class="row-name">${codexName(l.item)}</div>
			${lines.map((line, i) => `<div class="row-sub way-why">${esc([i === 0 ? l.unit : '', line].filter(Boolean).join(' · '))}${i === lines.length - 1 && door ? ` · ${door}` : ''}</div>`).join('')}
			${l.also ? `<div class="row-alt way-also">also: ${esc(l.also)}</div>` : ''}
			${strip}
		</div>
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
		return `<div class="panel"><p class="empty">${!way ? 'Nothing to plan yet.' : 'Nothing outstanding — every build has what it needs.'}</p></div>`;
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
			? [r.material ? `${F(Math.ceil(r.material))} draws of the material list` : '', r.trade ? `${F(Math.ceil(r.trade))} of the trade list` : '']
				.filter(Boolean).join(' and ')
			: '';
		const sub = draws ? `${meta.sub} ${draws}, over ${dayWord(way.days)}.` : meta.sub;
		const id = `step-${g.kind}`;
		const foot = g.kind === 'coin' ? `<div class="way-step-foot">${esc(coinFoot(way))}</div>`
			: g.kind === 'quest' && way.coins.income ? `<div class="row way-coin-row">
				${img(CROW_COIN, 'row-icon sm')}
				<div class="row-main">
					<div class="row-name amber">Crow Coins from these quests</div>
					<div class="row-sub">added up across every quest in step 1, and spent in the shop below</div>
				</div>
				<div class="way-qty"><div class="qty-out amber">${F(way.coins.income)}</div></div>
			</div>` : '';
		return `<div class="panel way-step">
			${stepHead(n, meta.tone, meta.title, sub, stepTotal(g), id)}
			${folded.has(id) ? '' : `<div class="way-step-body">${g.items.map(wayRow).join('')}${foot}</div>`}
		</div>`;
	}).join('');

	const head = planHead(way, steps, things);
	if (q && !legs.length && !questsHTML) return head + `<div class="panel"><p class="empty">Nothing in the plan matches that search.</p></div>`;

	const rule = `<div class="way-order">
		<span class="way-order-k">${questsHTML ? 'Then do this, in order' : 'Do this, in order'}</span>
		<i></i>
		<span class="way-order-n">${F(steps)} step${steps === 1 ? '' : 's'} · ${F(things)} thing${things === 1 ? '' : 's'} to obtain</span>
	</div>`;

	return head + questsHTML + rule + body;
}

/** What the purse has to work with, said once under the shop. */
function coinFoot(way) {
	const c = way.coins;
	const parts = [`${F(c.purse)} held`];
	if (c.income) parts.push(`${F(c.income)} the quests pay`);
	if (c.reserve) parts.push(`${F(c.reserve)} kept back`);
	parts.push(`${F(Math.max(0, c.purse - c.reserve + c.income - c.spend))} left after this`);
	return parts.join(' · ');
}

export function getAction(act, el) {
	switch (act) {
		case 'get-mode': setGetMode(el.dataset.id); return true;
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
		const total = g.coins ? ` — ${F(g.coins)} coins` : g.silver ? ` — ${F(g.silver)} silver` : '';
		const lines = [...g.items].sort((a, b) => b.qty - a.qty).map(e => `  ${Math.round(e.qty)}× ${e.item}`);
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
	const rows = [['group', 'item', 'quantity', 'unit cost', 'note']];
	if (getMode() === 'plan') {
		const way = theWay();
		for (const g of (way ? way.groups : [])) {
			for (const l of g.items) {
				const each = l.qty ? (l.coins ? `${Math.round(l.coins / l.qty)} coins` : l.silver ? `${Math.round(l.silver / l.qty)} silver` : '') : '';
				rows.push([g.label, l.item, Math.ceil(l.qty), each, [l.why, l.also ? `also: ${l.also}` : ''].filter(Boolean).join(' · ')]);
			}
		}
		return rows.map(r => r.map(cell).join(',')).join('\n');
	}
	for (const g of visibleGroups(query.toLowerCase())) {
		for (const e of [...g.items].sort((a, b) => b.qty - a.qty)) {
			const each = e.qty ? (e.coins ? `${Math.round(e.coins / e.qty)} coins` : e.silver ? `${Math.round(e.silver / e.qty)} silver` : '') : '';
			const note = e.detail || (e.barter ? `barter at ${e.barter.npcs.length} islands` : e.market ? 'Central Market, last sold' : '');
			rows.push([g.key, e.item, Math.round(e.qty), each, note]);
		}
	}
	return rows.map(r => r.map(cell).join(',')).join('\n');
}
