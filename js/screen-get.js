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
import * as store from './state.js';
import { img, codexName, costCtx, costText, groundsFor } from './ui-bits.js';
import {
	snapshot, barterData, barterProfile, totalsToGo, query, CROW_COIN, SILVER
} from './ui-state.js';
import { shoppingList, waysToGet } from './planner.js';
import { coinBuyButton } from './coin-shop.js';
import { mateAtTheHelm } from './ship.js';
import { anyType } from './sailors.js';
import { PRESETS, DAY_CHOICES, wayText, groupLegs } from './get-plan.js';
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
/**
 * The ten per cent off Parley, said as where it comes from. It is
 * Cleia's skill and nothing else, so it is read off the First Mate seat
 * rather than ticked: aboard, the row says so; hired but ashore, it says
 * what seating her would be worth; unmet, it says nothing at all.
 */
function mateCut() {
	const mate = mateAtTheHelm();
	if (mate && Number(mate.type.parley) > 0) {
		return ` · <span class="gterm" title="${esc(mate.sailor.name)} is at the First Mate seat: her skill takes ten per cent off every Parley cost">Crew −10% · ${esc(mate.sailor.name)} at the helm</span>`;
	}
	const ashore = (store.getProfile('roster', []) || []).find(s => Number((anyType[s.type] || {}).parley) > 0);
	return ashore
		? ` · <span class="gterm" title="Put ${esc(ashore.name)} at the First Mate seat on the Ship tab and every Parley cost drops ten per cent">Crew −10% · seat ${esc(ashore.name)} for it</span>`
		: '';
}

function barterProfileTile() {
	const profile = barterProfile();
	const { barterCount, valuePack, level, vouchers, parleyHeld } = profile;
	const day = barterDay(profile);
	const next = nextUnlock(barterCount);

	const levels = barterLevels().map(name =>
		`<option${name === level ? ' selected' : ''}>${esc(name)}</option>`).join('');

	// Parley is not what paces the trip -- the refresh cap is -- so it
	// sits under the headline as a fact rather than above it as a limit.
	// It is still worth showing: it is the one number a barter level
	// visibly moves, and the game never adds up what a bar buys you.
	return `<div>
		<div class="summary-k">Bartering <button class="info-dot" data-act="guide"
			aria-label="Where to see these numbers in game">?</button></div>
		<div class="summary-v">${F(day.lists.trade)}+${F(day.lists.material)} <span class="gterm" role="button" tabindex="0"
			data-guide="refresh"
			title="${F(day.lists.trade)} draws of the trade-goods list and ${F(day.lists.material)} of the ship-materials list — the two refresh on their own clocks">refreshes/day</span>
			<span class="summary-sub"> · refill in <b data-until="barter"></b></span></div>
		<div class="summary-sub"><input class="purse-inline" type="text" inputmode="numeric"
			value="${F(barterCount)}" data-act="barter-count"
			title="Your Total Barters, as the Barter Information window shows it. A run recorded on the Barter tab adds its trades to this; type over it whenever the two drift."
			aria-label="Your Total Barters, as the Barter Information window shows it"> <span class="gterm" role="button" tabindex="0"
			data-guide="parley">Total Barters</span>${next ? ` · ${esc(next)}` : ''}
			· <label class="inline-check"><input type="checkbox" data-act="value-pack"
			${valuePack ? 'checked' : ''}> Value Pack</label>
			${mateCut()}</div>
		<div class="summary-sub"><select class="purse-inline" data-act="barter-level"
			aria-label="Your barter level"><option value=""${level ? '' : ' selected'}>—</option>${levels}</select>
			· ${F(day.perTrade)} <span class="gterm" role="button" tabindex="0" data-guide="level">Parley a trade</span>
			· <input class="purse-inline narrow" type="text" inputmode="numeric"
			value="${F(vouchers)}" data-act="vouchers"
			aria-label="Crow's Trade Vouchers you carry"> <span class="gterm" role="button" tabindex="0" data-guide="voucher">vouchers</span>
			· ${F(day.tradesPerBar)} trades a refill</div>
		<div class="summary-sub"><input class="purse-inline" type="text" inputmode="numeric"
			value="${F(parleyHeld)}" data-act="parley-held"
			aria-label="Parley in the bar right now"> <span class="gterm" role="button" tabindex="0" data-guide="parley">Parley in the bar right now</span></div>
	</div>`;
}

/** The next thing your barter count opens, phrased as the wait for it. */
function nextUnlock(count) {
	const next = ROUTE_UNLOCKS.filter(r => r.opens && r.barters > count)[0];
	if (!next) return null;
	// "10 more barters open Kashuma Island": the running barter count
	// unlocks trade routes at fixed thresholds, and this is the next one.
	return `${F(next.barters - count)} more open ${next.opens}`;
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
			${barterProfileTile()}
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
 * The plan: what to do about the list, one way an item. The orders it
 * follows sit at the top where they can be changed, because the answer
 * is only as good as the goal; then the quests to run, since those are
 * the actions; then the items by the way each is got, every one with
 * its reason on the line.
 */
function renderWay(q) {
	const way = theWay();
	if (!way || !way.legs.length) {
		return `<div class="panel"><p class="empty">${!way ? 'Nothing to plan yet.' : 'Nothing outstanding — every build has what it needs.'}</p></div>`;
	}
	const o = way.orders;
	const preset = PRESETS.find(p => p.id === o.preset) || PRESETS[0];
	const head = way.stalled ? 'Not inside a year'
		: way.reachable ? `Done in ${dayWord(way.days)}`
		: `Done in ${dayWord(way.days)}, but for ${way.residual.length} item${way.residual.length === 1 ? '' : 's'}`;
	const pole = way.longPole ? way.longPole.text
		: way.days === 1 ? 'Everything fits in today: the quests below, and the purse for the rest.' : '';
	const presetChips = PRESETS.map(p => `<button class="chip${p.id === o.preset ? ' active' : ''}" data-act="get-preset" data-id="${p.id}" title="${esc(p.sub)}">${esc(p.label)}</button>`).join('');
	const days = DAY_CHOICES.map(([n, label]) => `<option value="${n}"${n === o.days ? ' selected' : ''}>${esc(label)}</option>`).join('');
	const c = way.coins;
	const coinLine = c && (c.spend || c.short)
		? `<span>Crow Coins: <b>${F(c.spend)}</b> spent of ${F(c.purse)} held${c.income ? ` + ${F(c.income)} the quests pay` : ''}${c.reserve ? ` · ${F(c.reserve)} kept back` : ''}${c.short ? ` · <span class="warn">${F(c.short)} short</span>` : ''}</span>`
		: '';
	const s = way.silver;
	const silverLine = s && s.spend ? `<span>Silver: <b>${FC(s.spend)}</b>${s.purse ? ` of ${FC(s.purse)} held` : ''}</span>` : '';
	const r = way.refreshes;
	const drawLine = r && (r.material || r.trade)
		? `<span>Draws: ${r.material ? `<b>${F(Math.ceil(r.material))}</b> of the material list` : ''}${r.material && r.trade ? ', ' : ''}${r.trade ? `<b>${F(Math.ceil(r.trade))}</b> of the trade list` : ''} over ${dayWord(way.days)}</span>`
		: '';
	const orders = `<div class="panel way-orders">
		<div class="panel-head">
			<h2 class="panel-title plain">${esc(head)}</h2>
			<span class="panel-sub">at ${esc(preset.label)}${way.days > 1 ? `, sailing ${esc(DAY_CHOICES.find(([n]) => n === o.days)[1])}` : ''}</span>
		</div>
		<div class="way-body">
			${pole ? `<p class="way-pole">${esc(pole)}</p>` : ''}
			<div class="way-knobs">
				<div class="chips">${presetChips}</div>
				<label class="way-knob">At sea <select class="purse-inline" data-act="get-days" aria-label="How many days a week you sail">${days}</select></label>
				<label class="way-knob">Keep back <input class="purse-inline" type="text" inputmode="numeric" value="${F(o.reserve)}" data-act="get-reserve" aria-label="Crow Coins to keep back"> coins</label>
			</div>
			<div class="way-facts">${[coinLine, silverLine, drawLine].filter(Boolean).join('')}</div>
			<p class="way-note">${esc(preset.sub)}. Barter is counted at best — the offer on every draw — and a drop or a worker node is named, not timed.</p>
		</div>
	</div>`;

	const picks = store.getProfile('questPicks', {}) || {};
	const questRows = way.quests.filter(x => !q || x.name.toLowerCase().includes(q) || x.pays.some(p => p.item.toLowerCase().includes(q))).map(x => {
		const done = questDoneNow(x.quest);
		const choice = x.quest.choice && x.pick !== null ? Object.entries(x.quest.choice[x.pick]) : null;
		const take = choice ? `take ${choice.map(([item, n]) => `${F(n)}× ${esc(item)}`).join(', ')}` : '';
		const mine = choice && picks[x.id] === x.pick;
		const pickBtn = choice && !mine
			? `<button class="ghost-btn tiny" data-act="get-pick" data-quest="${esc(x.id)}" data-i="${x.pick}" title="Remember it: Claimed on the Quests screen then records this reward in one press">make it my pick</button>`
			: choice ? '<span class="way-mine">your pick</span>' : '';
		const toward = x.pays.map(p => `${F(p.qty)} ${esc(p.item)}`).join(', ');
		const sub = [take, toward ? `toward ${toward}` : '', x.forCoins ? `for the ${F(x.coins)} coins` : x.coins ? `and ${F(x.coins)} coins` : ''].filter(Boolean).join(' · ');
		const times = x.cadence === 'once' ? 'once' : `${x.cadence} × ${F(x.completions)}`;
		return `<div class="row way-quest${done ? ' done' : ''}">
			<div class="row-main">
				<div class="row-name"><button class="linky" data-act="get-quest" data-quest="${esc(x.id)}" title="Open it on the Quests screen">${esc(x.name)}</button> <span class="tag">${esc(times)}</span>${done ? `<span class="quest-done-tag">✓ ${x.cadence === 'weekly' ? 'done this week' : 'done today'}</span>` : ''}</div>
				<div class="row-sub">${sub}</div>
			</div>
			${pickBtn}
		</div>`;
	});
	const questsPanel = questRows.length ? `<div class="panel">
		<div class="group-head">
			<h2 class="panel-title teal">Quests to run</h2>
			<span class="group-total" style="color:var(--ink-dim)">${questRows.length} quest${questRows.length === 1 ? '' : 's'}</span>
		</div>
		${questRows.join('')}
	</div>` : '';

	const legs = q ? way.legs.filter(l => l.item.toLowerCase().includes(q)) : way.legs;
	const groups = groupLegs(legs);
	const body = groups.map(g => {
		const total = g.coins ? `${F(g.coins)} coins` : g.silver ? `${F(g.silver)} silver` : `${g.items.length} item${g.items.length === 1 ? '' : 's'}`;
		const col = g.kind === 'coin' ? 'amber' : g.kind === 'falasi' || g.kind === 'market' ? 'blue' : g.kind === 'short' ? 'red' : g.kind === 'quest' ? 'teal' : 'plain';
		return `<div class="panel">
			<div class="group-head">
				<h2 class="panel-title ${col}">${esc(g.label)}</h2>
				<span class="group-total" style="color:var(--ink-dim)">${esc(total)}</span>
			</div>
			${g.items.map(l => {
				const door = l.kind === 'barter' ? `<button class="chart-link" data-act="goto-map" data-item="${esc(l.item)}">on the map</button>`
					: l.kind === 'quest' ? `<button class="chart-link" data-act="goto-quests" data-item="${esc(l.item)}">the quests</button>`
					: '';
				const shop = l.kind === 'coin' && !l.unpriced ? coinBuyButton(l.item, Math.ceil(l.qty)) : '';
				return `<div class="row" data-peek="${esc(l.item)}">
					${img(l.item, 'row-icon sm')}
					<div class="row-main">
						<div class="row-name">${codexName(l.item)}</div>
						<div class="row-sub way-why">${esc(l.why)}${door ? ` · ${door}` : ''}</div>
					</div>
					${shop}
					<span class="qty-out">${F(Math.ceil(l.qty))}</span>
				</div>`;
			}).join('')}
		</div>`;
	}).join('');
	if (q && !legs.length && !questRows.length) return orders + `<div class="panel"><p class="empty">Nothing in the plan matches that search.</p></div>`;
	return orders + questsPanel + body;
}

/** The plan's own verbs. True when the screen should redraw. */
export function getAction(act, el) {
	switch (act) {
		case 'get-mode': setGetMode(el.dataset.id); return true;
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
				rows.push([g.label, l.item, Math.ceil(l.qty), each, l.why]);
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
