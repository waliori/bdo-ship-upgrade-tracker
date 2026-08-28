// The whole interface. Every screen is a projection of state.js through
// planner.js -- nothing here holds its own copy of anything.

import { recipes as allRecipes, routes, routeInfo } from './recipes.js';
import { shipGroups } from './ships.js';
import { items as vendorItems } from './vendor_items.js';
import { coins } from './sea_coins.js';
import { falasi } from './falasi_vendor.js';
import { tableFor } from './enhancement.js';
import {
	forecast as barterForecast,
	summarise as barterLine,
	explain as barterWhy,
	dailyCapacity as barterDay,
	ROUTE_UNLOCKS
} from './barter.js';
import { iconLoader } from './icon-loader.js';
import RealisticWaterRipples from './realistic-water-ripples.js';
import * as store from './state.js';
import { initSync, openAccount } from './sync.js';
import {
	plan, planOne, craftableNow, maxCraftable, craftDelta,
	enhanceStep, ownedLevel, shoppingList, bottlenecks,
	parseEnhanced, enhancedName, enhancementForecast, resolveRoutes, routeOf,
	waysToGet, outstanding, remainingCost
} from './planner.js';

// The recipe book as the user's chosen routes make it. An upgrade with
// two ways in -- the Caravel, the Galleass -- reads here as whichever one
// they picked, so nothing downstream has to know routes exist.
let recipes = allRecipes;

const TABS = [
	{ id: 'plan', label: 'Plan' },
	{ id: 'builds', label: 'Builds' },
	{ id: 'inventory', label: 'Inventory' },
	{ id: 'tree', label: 'Tree' },
	{ id: 'workshop', label: 'Workshop' },
	{ id: 'get', label: 'To Get' }
];

const SOURCE_LABEL = {
	coin: 'Crow Coin Shop',
	falasi: 'Falasi vendor',
	Market: 'Central Market',
	Purchase: 'Vendor',
	'Monster Drop': 'Monster drop',
	Gathering: 'Gathering',
	Processing: 'Processing',
	Crafting: 'Crafting',
	'Quest Reward': 'Quest reward',
	Exchange: 'Exchange'
};

// Currencies are held in stock like anything else, so they undo, export
// and sync for free -- but they are kept out of the item grid, which is
// for things with recipes and sources.
const CROW_COIN = 'Crow Coin';
const SILVER = 'Silver';

// Sangpyeong Coins are money too, even though they sit in your bags like a
// material: they buy Finely Polished Pine Plywood, which the Panokseon
// wants 300 of and each Byukgye's part another 50 -- thousands of coins in
// a build, earned from Moodle Village dailies rather than bought. It stays
// in the item grid as well, since where it comes from is worth reading.
const SANGPYEONG = 'Sangpyeong Coin';

// Everything an enhancement attempt burns other than the part itself --
// derived from the recipes, so a new stone in a future update shows up in
// the pouch without anyone editing this file.
const STONES = (() => {
	const set = new Set();
	for (const [product, recipe] of Object.entries(recipes)) {
		const made = parseEnhanced(product);
		if (made.level === 0) continue;
		for (const item of Object.keys(recipe)) {
			if (parseEnhanced(item).base === made.base) continue;
			set.add(item);
		}
	}
	return [...set];
})();

let view = 'plan';
let query = '';
let planFilter = 'all';
let invFilter = 'all';
let treeTarget = null;
const folded = new Set();
let selected = null;
let snapshot = null;
let rows = {};
let barterData = null;
let water = null;
let toastTimer = null;

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

const esc = s => String(s).replace(/[&<>"']/g, c =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const F = n => Math.round(n).toLocaleString();

// Silver runs to ten figures; a pouch chip has no room for that.
/**
 * Read a quantity the way a player would write one: "1.5b", "400m",
 * "12,000". Returns null for anything that is not a number at all, so a
 * typo leaves the stored value alone.
 */
function parseAmount(raw) {
	const t = String(raw).trim().toLowerCase().replace(/[\s,_]/g, '');
	if (!t) return 0;
	const m = t.match(/^([0-9]*\.?[0-9]+)([kmb])?$/);
	if (!m) return null;
	const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]] || 1;
	return Math.max(0, Math.round(Number(m[1]) * mult));
}

/**
 * Any quantity in the app that you can set is one of these: type into it
 * directly ("4k", "12,000") or nudge it with the buttons beside it.
 */
const amountInput = (cls, value, attrs) =>
	`<input class="amt ${cls}" type="text" inputmode="numeric" autocomplete="off" value="${F(value)}" ${attrs}>`;

const FC = n => n >= 1e9
	? `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')}b`
	: n >= 1e6
		? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}m`
		: F(n);

function iconSrc(name) {
	let info = null;
	try {
		info = iconLoader.getIconInfo(name) || iconLoader.getIconInfo(parseEnhanced(name).base);
	} catch {
		info = null;
	}
	return info && info.filename ? `icons/${info.filename}` : 'icon.png';
}

const img = (name, cls = 'row-icon') =>
	`<img class="${cls}" src="${esc(iconSrc(name))}" alt="" loading="lazy">`;

/**
 * BDOCodex has a page for every item in the game, and the icon mapping
 * already carries the URL beside the picture -- so linking a name to the
 * game's own reference costs nothing but the anchor. An enhancement
 * level shares its base item's page, which is where the level table
 * lives anyway.
 */
function codexUrl(item) {
	let info = null;
	try {
		info = iconLoader.getIconInfo(item) || iconLoader.getIconInfo(parseEnhanced(item).base);
	} catch {
		info = null;
	}
	return info && info.url ? info.url : null;
}

/**
 * An item's name, linked to its BDOCodex page. Falls back to plain text
 * for anything the mapping has never heard of, so a name is never
 * missing just because a link is.
 */
function codexName(item, text = item) {
	const url = codexUrl(item);
	if (!url) return esc(text);
	return `<a class="codex" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-codex
		title="Look up ${esc(item)} on BDOCodex">${esc(text)}<span class="codex-mark" aria-hidden="true">\u2197</span></a>`;
}

function allItems() {
	const set = new Set();
	for (const [product, recipe] of Object.entries(recipes)) {
		set.add(product);
		Object.keys(recipe).forEach(i => set.add(i));
	}
	Object.keys(vendorItems).forEach(i => set.add(i));
	Object.keys(coins).forEach(i => set.add(i));
	return [...set];
}

function buildableItems() {
	const shipSet = new Set(shipGroups.flatMap(g => g.items));
	return Object.keys(recipes)
		.filter(n => !/^\+\d+\s/.test(n))
		.sort((a, b) => (shipSet.has(a) ? 0 : 1) - (shipSet.has(b) ? 0 : 1) || a.localeCompare(b));
}

/**
 * One ingredient, with how many the recipe wants and how many you hold.
 * Shared by the hover card and the inventory detail panel so the two can
 * never drift apart.
 */
function ingredientLine(name, per, cls = 'peek-line') {
	const have = store.getStock(name);
	return `<div class="${cls} ${have >= per ? 'ok' : 'short'}">
		${img(name, 'peek-icon')}
		<span class="peek-need">${F(per)}×</span>
		<span class="peek-name">${codexName(name)}</span>
		<span class="peek-have">${F(have)}</span>
	</div>`;
}

/**
 * The price lists the cost model works from. `recipes` is the resolved
 * book, so a Caravel priced here is the Caravel by the route the player
 * actually chose.
 */
const costCtx = () => ({ coins, silver: falasi, recipes, strategy: store.getAllStrategy() });

/**
 * A cost said out loud. Coins and silver stay apart -- the game will not
 * trade one for the other -- and anything the data cannot price is named
 * rather than quietly counted as free.
 */
function costText(cost, times = 1) {
	const bits = [];
	if (cost.coins) bits.push(`${FC(Math.round(cost.coins * times))} coins`);
	if (cost.silver) bits.push(`${FC(Math.round(cost.silver * times))} silver`);
	const needs = Object.entries(cost.needs);
	const listed = needs.slice(0, 2);
	for (const [item, qty] of listed) bits.push(`${F(Math.ceil(qty * times))}\u00d7 ${item}`);
	const rest = needs.length - listed.length;
	return (bits.join(' + ') || 'nothing') + (rest > 0 ? `, and ${rest} more` : '');
}

/**
 * What goes into a thing: its recipe, or -- for an enhancement level --
 * the part and the stones one attempt costs. Returns '' for a raw
 * material, which has nothing to show.
 */
function makeupHTML(item, cls = 'peek-line') {
	const { base, level } = parseEnhanced(item);
	if (level > 0) {
		const step = enhanceStep(base, level);
		if (!step) return '';
		return `<div class="peek-label">+${level - 1} → +${level}, per attempt</div>`
			+ ingredientLine(step.from, 1, cls)
			+ Object.entries(step.stones).map(([n, q]) => ingredientLine(n, q, cls)).join('');
	}
	const recipe = recipes[item];
	if (!recipe) return '';
	return '<div class="peek-label">Made from</div>'
		+ Object.entries(recipe).map(([n, q]) => ingredientLine(n, q, cls)).join('');
}

const MAKE_KEYS = new Set(['craft', 'Crafting', 'Processing']);

/** The hover card: what it is made of, or where it comes from. */
function peekHTML(item) {
	const body = makeupHTML(item);
	const src = sourceOf(item);

	// The shop price is already on the source line; what is not written
	// anywhere in the game is what one costs once its ingredients are
	// priced too, all the way down. That is the number worth showing.
	const made = waysToGet(item, costCtx()).routes.find(r => r.parts);
	const price = made && (made.coins || made.silver || outstanding(made))
		? `<div class="peek-cost">${esc(made.kind === 'enhance' ? 'One success' : 'Making one')}: ${esc(costText(made))}</div>`
		: '';

	// With the ingredients already listed, a crafting source is a place,
	// not an alternative -- only a shop or a drop is an "or".
	let foot = '';
	if (src && !body) foot = `${src.label} · ${src.detail}`;
	else if (src && MAKE_KEYS.has(src.key)) foot = src.key === 'craft' ? '' : src.detail;
	else if (src) foot = `or ${src.label} · ${src.detail}`;

	if (!body && !foot && !price) return '';
	return `<div class="peek-head">${img(item, 'peek-icon lg')}<span>${esc(item)}</span></div>`
		+ body
		+ price
		+ (foot ? `<div class="peek-foot">${esc(foot)}</div>` : '');
}

/** Where an item comes from, and what it costs. */
function sourceOf(item) {
	if (coins[item]) return { key: 'coin', label: SOURCE_LABEL.coin, detail: `${F(coins[item])} Crow Coins each`, coins: coins[item] };
	if (falasi[item]) return { key: 'falasi', label: SOURCE_LABEL.falasi, detail: `${F(falasi[item])} silver each`, silver: falasi[item] };
	const methods = vendorItems[item];
	if (methods) {
		const key = Object.keys(methods)[0];
		return { key, label: SOURCE_LABEL[key] || key, detail: (methods[key] || []).join(', ') };
	}
	if (recipes[item]) return { key: 'craft', label: 'Crafted', detail: 'made from other materials' };
	return null;
}

/** An item is a choice only when it can both be made and be bought. */
function hasBuyOption(item) {
	if (!recipes[item]) return false;
	if (coins[item] || falasi[item]) return true;
	const m = vendorItems[item];
	return !!(m && (m.Purchase || m.Market));
}

function toast(message, undoable = false) {
	const el = document.getElementById('toast');
	el.innerHTML = `<span>${esc(message)}</span>` +
		(undoable ? '<button type="button" data-act="undo">Undo</button>' : '');
	el.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
}

/* ------------------------------------------------------------------ *
 * planning
 * ------------------------------------------------------------------ */

function recompute() {
	recipes = resolveRoutes(store.getAllStrategy(), allRecipes);
	snapshot = plan({
		stock: store.getAllStock(),
		targets: store.getTargets(),
		strategy: store.getAllStrategy()
	});

	// Collapse every build's requirement tree into one row per item.
	//
	// Enhancement chains are folded away: a "+10 part" pulls in +9, +8 … +1
	// and the base item, which would otherwise fill the plan with ten rows
	// per part. Only the level a build actually asks for is kept -- the
	// steps in between belong to the Workshop. The base part and the stones
	// still appear, because those are things you have to go and get.
	rows = {};
	for (const target of snapshot.targets) {
		const walk = (node, root) => {
			const here = parseEnhanced(node.item);
			const from = node.via ? parseEnhanced(node.via) : null;
			const midChain = here.level > 0 && from && from.level > 0 && from.base === here.base;

			if (!midChain) {
				const r = rows[node.item] || (rows[node.item] = { need: 0, take: 0, craft: 0, short: 0 });
				r.need += node.need;
				r.take += node.fromStock;
				r.craft += node.toCraft;
				r.short += node.missing;
				// The thing you queued is the goal, not a material for it.
				if (root) r.isTarget = true;
			}
			node.children.forEach(child => walk(child, false));
		};
		walk(target.tree, true);
	}
	for (const [item, holders] of Object.entries(snapshot.reservedBy)) {
		if (rows[item]) rows[item].resv = holders;
	}
}

const readyCrafts = () =>
	craftableNow(store.getAllStock(), snapshot.toCraft, recipes)
		.filter(c => parseEnhanced(c.item).level === 0);

function totalsToGo() {
	let c = 0;
	let s = 0;
	for (const [item, qty] of Object.entries(snapshot.missing)) {
		if (coins[item]) c += coins[item] * qty;
		if (falasi[item]) s += falasi[item] * qty;
	}
	return { coins: c, silver: s, lines: Object.keys(snapshot.missing).length };
}

/* ------------------------------------------------------------------ *
 * Plan
 * ------------------------------------------------------------------ */

function renderPlan() {
	const totals = totalsToGo();
	const ready = readyCrafts();

	let need = 0;
	let have = 0;
	for (const r of Object.values(rows)) {
		need += r.need;
		have += r.need - r.short;
	}
	const pct = need ? Math.round((have / need) * 100) : 0;

	// What the money costs is on the pouch, right above these -- To Get
	// carries the exact breakdown -- so it is not repeated here.
	const stats = [
		{ k: 'Fleet progress', v: `${pct}%`, sub: 'of all required units covered', cls: 'teal' },
		{ k: 'Units covered', v: `${F(have)} / ${F(need)}`, sub: 'across every active build', cls: '' },
		{ k: 'Still missing', v: F(totals.lines), sub: 'materials with nothing behind them', cls: totals.lines ? 'amber' : 'teal' },
		{ k: 'Craftable now', v: F(ready.length), sub: 'recipes ready from stock', cls: ready.length ? 'teal' : 'off' }
	];

	const statHTML = `<div class="stats">${stats.map(s => `
		<div class="stat">
			<div class="stat-k">${esc(s.k)}</div>
			<div class="stat-v ${s.cls}">${esc(s.v)}</div>
			<div class="stat-sub">${esc(s.sub)}</div>
		</div>`).join('')}</div>`;

	const readyHTML = ready.length ? `<div class="readybar">
		<div class="readybar-label">Ready to craft</div>
		<div class="readybar-list">${ready.slice(0, 8).map(c => `
			<button class="ready-chip" data-act="craft" data-item="${esc(c.item)}" data-times="1" data-peek="${esc(c.item)}" title="Craft one now">
				${img(c.item, '')}${F(c.suggested)}× ${esc(c.item)}
			</button>`).join('')}</div>
	</div>` : '';

	const filters = [
		['all', 'Everything'], ['short', 'Missing only'], ['craft', 'To craft'], ['done', 'Covered']
	].map(([id, label]) =>
		`<button class="chip ${planFilter === id ? 'active' : ''}" data-act="plan-filter" data-id="${id}">${label}</button>`
	).join('');

	const q = query.toLowerCase();
	const entries = Object.entries(rows)
		.filter(([item]) => !q || item.toLowerCase().includes(q))
		.map(([item, r]) => ({ item, r, covered: r.short === 0 && r.craft === 0 }));

	const groupsDef = [
		['What you are building', 'the queued items themselves — everything below feeds these', 'blue',
			p => p.r.isTarget, 'target'],
		['Missing', 'buy, barter, gather or hunt these', 'red', p => !p.r.isTarget && p.r.short > 0, 'short'],
		['To craft', 'recipes standing between you and done', 'blue',
			p => !p.r.isTarget && p.r.short === 0 && p.r.craft > 0, 'craft'],
		['Covered', 'fully reserved from stock', 'teal', p => !p.r.isTarget && p.covered, 'done']
	];

	const groups = groupsDef
		.filter(([, , , , id]) => planFilter === 'all' || planFilter === id)
		.map(([title, sub, col, pred]) => {
			const list = entries.filter(pred).sort((a, b) => b.r.short - a.r.short || b.r.need - a.r.need);
			return { title, sub: `${list.length} · ${sub}`, col, list };
		})
		.filter(g => g.list.length);

	if (!groups.length) {
		const nothingQueued = !store.getActiveTargets().length;
		return statHTML + readyHTML + (nothingQueued ? '' : controlsHTML(filters)) +
			(nothingQueued
				? startHere()
				: '<div class="panel"><p class="empty">Nothing matches that filter.</p></div>');
	}

	const groupHTML = groups.map(g => `<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title ${g.col}">${esc(g.title)}</h2>
			<span class="panel-sub">${esc(g.sub)}</span>
		</div>
		${g.list.map(({ item, r, covered }) => planRow(item, r, covered)).join('')}
	</div>`).join('');

	return nextStep() + statHTML + readyHTML + controlsHTML(filters) + groupHTML;
}

/**
 * The pouch: coins, silver, Sangpyeong Coins and enhancement stones, on
 * every tab.
 *
 * These are spent from wherever you happen to be -- buying on To Get,
 * enhancing in the Workshop -- so they sit in the shell above the tabs
 * instead of belonging to one screen. Everything past the two headline
 * currencies only appears once a build needs it or you hold some, so the
 * bar stays short.
 */
function pouchHTML() {
	const totals = totalsToGo();

	const entries = [
		{ item: CROW_COIN, label: 'Crow Coins', need: totals.coins, where: "Crow Coin Shop, Oquilla's Eye" },
		{ item: SILVER, label: 'Silver', need: totals.silver, where: 'Falasi, port of Epheria', glyph: '\u25C9' }
	];

	// Coins and stones are earned or dropped, not priced, so they join the
	// bar only once a build wants them or you are holding some -- that way
	// a Carrack plan never carries a Panokseon currency it has no use for.
	const carried = (item, label, where) => {
		const need = rows[item] ? rows[item].need : 0;
		return { item, label, need, where };
	};

	const optional = [carried(SANGPYEONG, 'Sangpyeong Coins', 'Moodle Village dailies')];
	STONES.forEach(item => optional.push(carried(item, item, 'spent on enhancement attempts')));

	optional
		.filter(e => e.need > 0 || store.getStock(e.item) > 0)
		.sort((a, b) => b.need - a.need || a.label.localeCompare(b.label))
		.forEach(e => entries.push(e));

	const chips = entries.map(e => {
		const held = store.getStock(e.item);
		const short = Math.max(0, e.need - held);
		const state = !e.need ? 'idle' : short ? 'short' : 'ok';
		const sub = !e.need
			? 'none needed yet'
			: short
				? `${FC(short)} short of ${FC(e.need)}`
				: `enough for all ${FC(e.need)}`;
		return `<label class="pouch-item ${state}" title="${esc(e.item)} \u2014 ${esc(e.where)}">
			${e.glyph ? `<span class="pouch-glyph" aria-hidden="true">${e.glyph}</span>` : img(e.item, 'pouch-icon')}
			<span class="pouch-body">
				<span class="pouch-k">${esc(e.label)}</span>
				<input class="pouch-input" type="text" inputmode="numeric" value="${F(held)}"
					data-act="purse" data-item="${esc(e.item)}" aria-label="${esc(e.label)} you hold">
				<span class="pouch-need">${esc(sub)}</span>
			</span>
		</label>`;
	}).join('');

	return `<span class="pouch-title">Carrying</span><div class="pouch-list">${chips}</div>`;
}

/**
 * Repaint the pouch -- but never while someone is typing in it. A state
 * change re-renders everything, and swapping the inputs out mid-edit would
 * steal the caret; the blur handler in wire() paints the pending update.
 */
function paintPouch() {
	const host = document.getElementById('pouch');
	if (!host) return;
	if (host.contains(document.activeElement)) return;
	host.innerHTML = pouchHTML();
	measurePouch();
}

/**
 * Publish the pouch's height so anything else that sticks (the inventory
 * detail panel) can clear it instead of sliding underneath.
 */
function measurePouch() {
	const host = document.getElementById('pouch');
	if (!host) return;
	const h = getComputedStyle(host).position === 'sticky' ? host.offsetHeight : 0;
	document.documentElement.style.setProperty('--pouch-h', `${h}px`);
}

/** One concrete thing to do next, based on where the plan actually stands. */
function nextStep() {
	if (!store.getActiveTargets().length) return '';

	const ready = readyCrafts();
	const pending = pendingEnhancements().filter(e => !e.blocked);
	const shortCount = Object.keys(snapshot.missing).length;

	let msg;
	let cta = null;
	if (ready.length) {
		msg = `You can craft ${ready.length === 1 ? ready[0].item : `${ready.length} recipes`} right now.`;
		cta = ['Open Workshop', 'workshop'];
	} else if (pending.length) {
		msg = `${pending.length} enhancement ${pending.length === 1 ? 'attempt is' : 'attempts are'} affordable.`;
		cta = ['Open Workshop', 'workshop'];
	} else if (shortCount) {
		msg = `Nothing to make yet — ${shortCount} ${shortCount === 1 ? 'item is' : 'items are'} still missing. Record what you gather in the boxes below.`;
		cta = ['See the shopping list', 'get'];
	} else {
		msg = 'Everything your builds need is on hand.';
	}

	return `<div class="next-step">
		<span class="next-label">Next</span>
		<span class="next-msg">${esc(msg)}</span>
		${cta ? `<button class="act quiet next-cta" data-act="view" data-id="${cta[1]}">${esc(cta[0])}</button>` : ''}
	</div>`;
}

/** The loop to follow, for anyone opening the tracker for the first time. */
function startHere() {
	const steps = [
		['Queue what you want to build', 'A ship, a Chiro part, or a stack of materials. Order them by what you want finished first.', 'Add a build', 'builds'],
		['Say what you already own', 'Set quantities here on the Plan with the − number + box on each row, or from the Inventory grid.', 'Open Inventory', 'inventory'],
		['Work the list', 'Whatever is left shows as Missing. The Workshop makes anything you have the materials for, and handles enhancing.', 'Open Workshop', 'workshop'],
		['Take the shopping list with you', 'To Get groups everything outstanding by how you actually obtain it, with Crow Coin and silver totals.', 'Open To Get', 'get']
	];
	return `<div class="panel start-here">
		<div class="panel-head">
			<h2 class="panel-title plain">How this works</h2>
			<span class="panel-sub">Four steps, then it is just keeping the numbers current</span>
		</div>
		<ol class="steps">${steps.map(([title, body, cta, view], i) => `
			<li class="step">
				<span class="step-n">${i + 1}</span>
				<div>
					<div class="step-title">${esc(title)}</div>
					<div class="step-body">${esc(body)}</div>
				</div>
				<button class="act quiet step-cta" data-act="view" data-id="${view}">${esc(cta)}</button>
			</li>`).join('')}</ol>
	</div>`;
}

function controlsHTML(filters) {
	return `<div class="controls">
		<input class="field" type="search" placeholder="Search materials…" value="${esc(query)}" data-act="query">
		<div class="chips">${filters}</div>
	</div>`;
}

function planRow(item, r, covered) {
	const total = r.need || 1;
	const segs = [];
	if (r.take) segs.push(`<i class="take" style="width:${(r.take / total) * 100}%"></i>`);
	if (r.craft) segs.push(`<i class="make" style="width:${(r.craft / total) * 100}%"></i>`);
	if (r.short) segs.push(`<i class="lack" style="width:${(r.short / total) * 100}%"></i>`);

	const legend = [];
	if (r.take) legend.push(`${F(r.take)} from stock`);
	if (r.craft) legend.push(`${F(r.craft)} to craft`);
	if (r.short) legend.push(`${F(r.short)} missing`);

	const enhanced = parseEnhanced(item).level > 0;
	const who = (r.resv || []).slice(0, 2)
		.map(v => (v.via && v.via !== item ? `${v.targetItem}, via ${v.via}` : v.targetItem));
	const src = sourceOf(item);
	let sub = who.length ? `reserved for ${who.join(' · ')}` : (src ? src.label : 'intermediate craft');
	if (enhanced) sub = 'enhanced in the Workshop';
	// Goes first, ahead of the reservation text -- the sub line is
	// ellipsised, and otherwise a craftable material sitting in Missing
	// looks like a bug rather than a choice.
	if (!enhanced && recipes[item] && store.getStrategy(item) === 'buy') {
		sub = `buying rather than crafting · ${sub}`;
	}

	// "craftable" means the materials are on hand *now* -- not merely that
	// the plan has a recipe lined up for it. The two used to be conflated,
	// which is how the Plan could badge seven rows craftable while the
	// Workshop said nothing could be made.
	const can = !enhanced && recipes[item] && r.craft > 0 && maxCraftable(item, store.getAllStock(), recipes) >= 1;
	const badge = covered
		? 'covered'
		: r.short > 0
			? `${F(r.short)} short`
			: enhanced
				? 'to enhance'
				: can ? 'craftable now' : 'to craft';
	const badgeCls = covered ? 'teal' : r.short > 0 ? 'red' : can ? 'teal' : 'blue';
	const own = store.getStock(item);

	return `<div class="row" data-peek="${esc(item)}">
		${img(item)}
		<div class="row-main">
			<div class="row-name">${codexName(item)}</div>
			<div class="row-sub">${esc(sub)}</div>
		</div>
		<div class="row-meter">
			<div class="bar">${segs.join('')}</div>
			<div class="bar-legend">
				<span>${esc(legend.join(' · '))}</span>
				<span class="n">${F(own)} / ${F(r.need)}</span>
			</div>
		</div>
		<div class="row-tail">
			<span class="own" title="How many you own">
				<button class="sq-btn" data-act="own" data-item="${esc(item)}" data-delta="-1" aria-label="One fewer">−</button>
				${amountInput('own-input', own, `data-act="own-set" data-item="${esc(item)}" aria-label="How many ${esc(item)} you own"`)}
				<button class="sq-btn" data-act="own" data-item="${esc(item)}" data-delta="1" aria-label="One more">+</button>
			</span>
			<span class="badge ${badgeCls}">${esc(badge)}</span>
			${can ? `<button class="mini-btn" data-act="craft" data-item="${esc(item)}" data-times="1">Craft</button>` : ''}
		</div>
	</div>`;
}

/* ------------------------------------------------------------------ *
 * Builds
 * ------------------------------------------------------------------ */

function renderBuilds() {
	const targets = store.getTargets();
	const byId = new Map(snapshot.targets.map(t => [t.id, t]));

	const head = `<div class="queue-head">
		<span class="queue-title">Build queue</span>
		<span class="queue-note">Scarce stock goes to the build nearest the top</span>
		<span class="panel-spacer"></span>
		<button class="act add-build" data-act="add-build">+ Add a build</button>
	</div>`;

	const list = targets.length ? targets.map((t, i) => {
		const r = byId.get(t.id);
		const pct = r ? r.progress : 0;
		const state = !t.active ? 'paused' : pct >= 100 ? 'done' : '';
		const stateLabel = !t.active ? 'Paused' : pct >= 100 ? 'Ready' : 'In progress';
		const units = r
			? (r.missingUnits > 0 ? `${F(r.missingUnits)} of ${F(r.totalUnits)} units still needed` : 'everything on hand')
			: '';
		return `<div class="build ${t.active ? '' : 'paused'}" data-target="${esc(t.id)}">
			${img(t.item, 'row-icon lg')}
			<div class="build-main">
				<div class="build-titles">
					<span class="build-name">${codexName(t.item)}</span>
					<span class="build-state ${state}">${stateLabel}</span>
				</div>
				<div class="bar tall"><i class="fill" style="width:${pct.toFixed(1)}%"></i></div>
				<div class="build-meta">Priority ${i + 1} · <span class="n">${pct.toFixed(1)}%</span> · ${esc(units)}${routeNote(t.item)}</div>
				${(() => {
					// The bill for finishing this one: every leaf its tree
					// could neither cover from stock nor make, priced the
					// way the plan will actually get it.
					if (!r || r.missingUnits <= 0) return '';
					const left = remainingCost(r.tree, costCtx());
					return `<div class="build-cost">Still to get: ${esc(costText(left))}</div>`;
				})()}
			</div>
			<div class="build-actions">
				<button class="sq-btn" data-act="move" data-dir="-1" title="Raise priority" ${i === 0 ? 'disabled' : ''}>▲</button>
				<button class="sq-btn" data-act="move" data-dir="1" title="Lower priority" ${i === targets.length - 1 ? 'disabled' : ''}>▼</button>
				<span class="stepper">
					<button data-act="qty" data-delta="-1" aria-label="Fewer">−</button>
					${amountInput('val', t.qty, `data-act="target-qty" data-target="${esc(t.id)}" aria-label="How many to build"`)}
					<button data-act="qty" data-delta="1" aria-label="More">+</button>
				</span>
				<button class="sq-btn" data-act="pause" title="Pause or resume">${t.active ? '⏸' : '▶'}</button>
				<button class="sq-btn danger" data-act="remove" title="Remove">×</button>
			</div>
		</div>`;
	}).join('') : '<div class="panel"><p class="empty">Nothing queued yet. Add a ship or a part above and the rest follows from it.</p></div>';

	const blockers = bottlenecks(snapshot, 5);
	const blockHTML = blockers.length ? `<div class="panel">
		<div class="panel-head">
			<h2 class="panel-title amber">Biggest blockers</h2>
			<span class="panel-sub">Missing items holding up the queue</span>
		</div>
		${blockers.map(b => `<div class="row">
			${img(b.item, 'row-icon md')}
			<div class="row-main">
				<div class="row-name">${codexName(b.item)}</div>
				<div class="row-sub">blocks ${esc(b.targets.join(', '))}</div>
			</div>
			<span class="qty-out">${F(b.qty)} short</span>
		</div>`).join('')}
	</div>` : '';

	return head + list + blockHTML;
}

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

/**
 * A ship part and its ten enhancement levels are one thing you own, not
 * eleven. These roll them up: the grid shows one tile per part, and the
 * detail panel is where you pick which level you actually have.
 */
const isEnhanceable = base => !!recipes[`+1 ${base}`];

/** The base name for anything in an enhancement family. */
function familyOf(item) {
	const { base } = parseEnhanced(item);
	return isEnhanceable(base) ? base : item;
}

const familyLevels = base =>
	[base, ...Array.from({ length: 10 }, (_, i) => enhancedName(base, i + 1))];

/** Everything the grid needs about one part, summed over its levels. */
function familyStats(base) {
	const stock = store.getAllStock();
	let own = 0;
	let reserved = 0;
	let short = 0;
	let top = 0;
	for (const level of familyLevels(base)) {
		const here = stock[level] || 0;
		own += here;
		reserved += snapshot.reserved[level] || 0;
		short += rows[level] ? rows[level].short : 0;
		if (here > 0) top = parseEnhanced(level).level;
	}
	return { own, reserved, short, top, at: enhancedName(base, top) };
}

function renderInventory() {
	const stock = store.getAllStock();
	const q = query.toLowerCase();
	const searching = q.length > 0;

	const list = allItems().filter(item => {
		if (searching) return item.toLowerCase().includes(q);
		const r = rows[item];
		if (invFilter === 'owned') return (stock[item] || 0) > 0;
		if (invFilter === 'needed') return !!r && r.need > 0;
		if (invFilter === 'short') return !!r && r.short > 0;
		if (invFilter === 'free') return (snapshot.free[item] || 0) > 0;
		return (stock[item] || 0) > 0 || (r && r.need > 0);
	}).sort((a, b) => ((rows[b] && rows[b].short) || 0) - ((rows[a] && rows[a].short) || 0) || a.localeCompare(b));

	const filters = [
		['all', 'In play'], ['needed', 'Needed'], ['short', 'Short'], ['owned', 'Owned'], ['free', 'Free']
	].map(([id, label]) =>
		`<button class="chip ${invFilter === id ? 'active' : ''}" data-act="inv-filter" data-id="${id}">${label}</button>`
	).join('');

	// Collapse each enhancement family to a single tile. A search for
	// "toro" used to return forty-four tiles -- eleven levels of four
	// parts -- which is not a useful way to look at four parts.
	const seen = new Set();
	const shown = [];
	for (const item of list) {
		const key = familyOf(item);
		if (seen.has(key)) continue;
		seen.add(key);
		shown.push(key);
	}

	const tiles = shown.map(key => {
		const family = isEnhanceable(key);
		const stats = family
			? familyStats(key)
			: {
				own: stock[key] || 0,
				reserved: snapshot.reserved[key] || 0,
				short: rows[key] ? rows[key].short : 0,
				top: 0,
				at: key
			};
		const free = Math.max(0, stats.own - stats.reserved);
		const denom = Math.max(stats.own, 1);
		const open = stats.at;   // clicking lands on the level you hold
		const isOpen = family ? familyOf(selected || '') === key : selected === key;
		return `<button class="tile ${stats.short > 0 ? 'short' : ''} ${isOpen ? 'selected' : ''}" data-act="select" data-item="${esc(open)}" data-peek="${esc(stats.at)}" title="${esc(key)}">
			${img(stats.at, '')}
			${family && stats.top > 0 ? `<span class="tile-lvl">+${stats.top}</span>` : ''}
			<span class="tile-qty">${F(stats.own)}</span>
			<span class="tile-name">${esc(key)}</span>
			<span class="bar">
				<i class="make" style="width:${(stats.reserved / denom) * 100}%"></i>
				<i class="take" style="width:${(free / denom) * 100}%"></i>
			</span>
		</button>`;
	}).join('');

	return `<div class="inv-layout">
		<div class="inv-left">
			<div class="controls">
				<input class="field" type="search" placeholder="Search items…" value="${esc(query)}" data-act="query">
				<div class="chips">${filters}</div>
			</div>
			${shown.length
				? `<div class="inv-grid">${tiles}</div>`
				: `<div class="panel"><p class="empty">${searching ? 'Nothing matches that search.' : 'Nothing here yet — add a build, or switch to Owned to record what you have.'}</p></div>`}
		</div>
		${selected ? '<div class="detail-veil" data-act="deselect" aria-hidden="true"></div>' : ''}
		<aside class="detail ${selected ? 'open' : ''}">${renderDetail()}</aside>
	</div>`;
}

/**
 * Every way of getting the item, priced.
 *
 * The point is the comparison. A Crow Coin shop price is one line in the
 * game already; what the game never tells you is what the same thing
 * costs to make once its ingredients are priced too, recursively, and
 * what that route still leaves you to go and barter for. Both are shown,
 * per unit and against what you are actually short of, and neither is
 * called the right answer unless it beats the other outright.
 */
function waysBlock(item) {
	const { routes, best } = waysToGet(item, costCtx());
	if (!routes.length) return '';

	const short = rows[item] ? Math.ceil(rows[item].short) : 0;
	const mode = store.getStrategy(item);
	const inPlan = r => (r.kind === 'coin' || r.kind === 'silver' ? mode === 'buy' : mode !== 'buy');

	const lines = routes.map(r => {
		const on = routes.length > 1 && hasBuyOption(item) && inPlan(r);
		// Where each ingredient is coming from, so the total is not a
		// number you have to take on faith.
		const via = (r.parts || [])
			.filter(p => p.via)
			.map(p => `${F(p.qty)}\u00d7 ${p.item} from ${p.via}`)
			.join(' \u00b7 ');
		return `<div class="way ${on ? 'on' : ''}">
			<div class="way-top">
				<span class="way-label">${esc(r.label)}</span>
				${best === r ? '<span class="badge teal">cheapest</span>' : ''}
				${on ? '<span class="way-tag">in the plan</span>' : ''}
			</div>
			<div class="way-cost">${esc(costText(r))} <span class="way-unit">each</span></div>
			${short > 1 ? `<div class="way-total">${F(short)} short \u2192 ${esc(costText(r, short))}</div>` : ''}
			${via ? `<div class="way-parts">${esc(via)}</div>` : ''}
		</div>`;
	}).join('');

	return `<div class="detail-block">
		<div class="detail-label">${routes.length > 1 ? 'Ways to get it' : 'What it costs'}</div>
		${lines}
	</div>`;
}

function renderDetail() {
	if (!selected) {
		return '<p class="empty">Select an item to see who reserved it and where to get more.</p>';
	}

	const item = selected;
	const own = store.getStock(item);
	const reserved = snapshot.reserved[item] || 0;
	const free = Math.max(0, own - reserved);
	const r = rows[item];
	const short = r ? r.short : 0;
	const holders = snapshot.reservedBy[item] || [];
	// An enhancement level is not crafted, it is attempted -- so it gets
	// the Workshop, not a Craft button and a "made from other materials".
	const { base, level } = parseEnhanced(item);
	const step = level > 0 ? enhanceStep(base, level) : null;
	const src = step ? null : sourceOf(item);
	const canCraft = !!recipes[item] && !step;
	const most = canCraft ? maxCraftable(item, store.getAllStock(), recipes) : 0;

	const resvHTML = holders.length ? `<div class="detail-block">
		<div class="detail-label">Reserved by</div>
		${holders.map(h => `<div class="detail-line">
			<span>${esc(h.via && h.via !== item ? `${h.targetItem}, via ${h.via}` : h.targetItem)}</span>
			<span class="n">${F(h.qty)}</span>
		</div>`).join('')}
	</div>` : '';

	const mode = store.getStrategy(item);
	const toggle = hasBuyOption(item) ? `<div class="detail-block">
		<div class="detail-label">How you'll get it</div>
		<div class="detail-actions">
			<button class="act ${mode === 'craft' ? '' : 'quiet'}" data-act="strategy" data-mode="craft">Craft it</button>
			<button class="act ${mode === 'buy' ? '' : 'quiet'}" data-act="strategy" data-mode="buy">Buy it</button>
		</div>
	</div>` : '';

	return `<div class="detail-head">
			${img(item, '')}
			<div class="detail-name">${codexName(item)}</div>
			<button class="detail-close" data-act="deselect" title="Close (Esc)" aria-label="Close">×</button>
		</div>
		${levelPicker(item)}
		<div class="qty-row">
			<button class="qty-btn" data-act="bump" data-delta="-10">−10</button>
			<button class="qty-btn" data-act="bump" data-delta="-1">−</button>
			${amountInput('qty-val', own, `data-act="own-set" data-item="${esc(item)}" aria-label="How many you own"`)}
			<button class="qty-btn" data-act="bump" data-delta="1">+</button>
			<button class="qty-btn" data-act="bump" data-delta="10">+10</button>
		</div>
		<div class="qty-hint">Type the number straight in — 4k and 12,000 both work.</div>
		${moveLevelAction(item)}
		<div class="kv">
			<div class="kv-row"><span>Reserved</span><span class="n blue">${F(reserved)}</span></div>
			<div class="kv-row"><span>Free</span><span class="n teal">${F(free)}</span></div>
			<div class="kv-row"><span>Still short</span><span class="n ${short > 0 ? 'red' : 'faint'}">${short > 0 ? F(short) : '—'}</span></div>
		</div>
		${(() => {
			const made = makeupHTML(item, 'ing-line');
			return made ? `<div class="detail-block">${made}</div>` : '';
		})()}
		${resvHTML}
		${src && src.key !== 'coin' && src.key !== 'falasi'
			? `<div class="detail-src"><span>${esc(src.label)}</span><span>${esc(src.detail)}</span></div>`
			: ''}
		${waysBlock(item)}
		${step ? '<button class="act quiet wide" data-act="view" data-id="workshop">Attempt it in the Workshop</button>' : ''}
		${toggle}
		${canCraft ? `<div class="detail-actions">
			<button class="act" data-act="craft" data-item="${esc(item)}" data-times="1" ${most < 1 ? 'disabled' : ''}>Craft 1</button>
			<button class="act quiet" data-act="craft" data-item="${esc(item)}" data-times="${most}" ${most < 1 ? 'disabled' : ''}>Craft max (${F(most)})</button>
		</div>` : ''}`;
}

/**
 * The eleven levels of an enhanceable part, as a strip you can click
 * through. This is how you tell the app about a part you already
 * levelled in game: pick the level, put the count in. No stones are
 * spent -- the Workshop is for attempts you are actually making.
 */
function levelPicker(item) {
	const base = parseEnhanced(item).base;
	if (!isEnhanceable(base)) return '';

	const stock = store.getAllStock();
	const here = parseEnhanced(item).level;
	const chips = familyLevels(base).map(name => {
		const level = parseEnhanced(name).level;
		const qty = stock[name] || 0;
		const need = rows[name] ? rows[name].need : 0;
		return `<button class="lvl ${level === here ? 'on' : ''} ${qty ? 'has' : ''} ${need ? 'wanted' : ''}"
			data-act="select" data-item="${esc(name)}"
			title="${esc(name)}${need ? ` — a build needs ${F(need)}` : ''}">
			+${level}${qty ? `<span class="lvl-n">${F(qty)}</span>` : ''}
		</button>`;
	}).join('');

	return `<div class="detail-block">
		<div class="detail-label">Which level do you have?</div>
		<div class="lvl-strip">${chips}</div>
		<div class="detail-note">Recording a level here costs nothing. The Workshop is for attempts you are really making.</div>
	</div>`;
}

/**
 * Offer to move a part you hold at another level onto the one you are
 * looking at, so "I took it to +7 in game" is one click rather than two
 * edits that can leave a phantom part behind.
 */
function moveLevelAction(item) {
	const { base, level } = parseEnhanced(item);
	if (!isEnhanceable(base)) return '';
	if (store.getStock(item) > 0) return '';

	const stock = store.getAllStock();
	const from = familyLevels(base)
		.filter(name => name !== item && (stock[name] || 0) > 0)
		.pop();
	if (!from) return '';

	return `<button class="act quiet wide" data-act="move-level" data-from="${esc(from)}" data-to="${esc(item)}">
		Move one from +${parseEnhanced(from).level} to +${level}
	</button>`;
}

/* ------------------------------------------------------------------ *
 * Tree
 * ------------------------------------------------------------------ */

/**
 * The requirement tree, as the planner already built it.
 *
 * The Plan flattens every build into one row per material, which is the
 * right shape for "what do I still need" and the wrong one for "why does
 * it need that". This is the same data unflattened: a Carrack sits above
 * its Caravel, which sits above its Sailboat, with the materials of each
 * hanging off the step that wants them -- so the upgrade path you chose
 * is something you can see rather than infer.
 */
function nodeState(node) {
	if (node.missing > 0) return 'missing';
	if (node.toCraft > 0) return parseEnhanced(node.item).level > 0 ? 'enhance' : 'make';
	return 'covered';
}

const STATE_WORD = {
	missing: 'missing',
	make: 'to craft',
	enhance: 'to enhance',
	covered: 'covered'
};

/** Depth-first, carrying enough about ancestors to draw the guide lines. */
function walkTree(node, rows, depth = 0, path = '', trail = []) {
	const id = `${path}/${node.item}`;
	const kids = node.children || [];
	rows.push({ node, depth, id, trail: [...trail], kids: kids.length });
	if (!kids.length || folded.has(id)) return rows;
	kids.forEach((kid, i) => walkTree(kid, rows, depth + 1, id, [...trail, i === kids.length - 1]));
	return rows;
}

/** Mid-chain enhancement steps are folded to start with: a +10 pulling in
 *  +9 pulling in +8 is ten rows that all say the same thing. */
function foldChains(node, path = '') {
	const id = `${path}/${node.item}`;
	const here = parseEnhanced(node.item);
	if (here.level > 1 && node.children.some(k => parseEnhanced(k.item).base === here.base)) {
		folded.add(id);
	}
	node.children.forEach(kid => foldChains(kid, id));
}

let chainsFolded = false;

function renderTree() {
	const targets = snapshot.targets;
	if (!targets.length) return startHere();

	if (!chainsFolded) {
		targets.forEach(t => foldChains(t.tree));
		chainsFolded = true;
	}
	const current = targets.find(t => t.item === treeTarget) || targets[0];

	// One control, not a wrapping row of them. Seven builds turned the
	// chips into six rows on a phone before any of the tree was visible,
	// and the row grows without bound as the queue does.
	const picker = `<button class="tpick" data-act="tree-pick">
		${img(current.item, 'tchip-icon')}
		<span class="tpick-name">${esc(current.item)}</span>
		<span class="tpick-of">${targets.indexOf(current) + 1} of ${targets.length}</span>
		<span class="tpick-caret" aria-hidden="true">▾</span>
	</button>`;

	const rows = walkTree(current.tree, []).map(row => {
		const { node, depth, id, trail, kids } = row;
		const state = nodeState(node);
		const own = store.getStock(node.item);
		const guides = trail.map(last =>
			`<span class="tguide ${last ? 'stop' : ''}"></span>`).join('') +
			(depth ? '<span class="tguide elbow"></span>' : '');

		const bits = [];
		if (node.fromStock) bits.push(`${F(node.fromStock)} from stock`);
		if (node.toCraft) bits.push(`${F(node.toCraft)} ${parseEnhanced(node.item).level > 0 ? 'to enhance' : 'to craft'}`);
		if (node.missing) bits.push(`${F(node.missing)} missing`);

		return `<div class="trow ${state}" style="--depth:${depth}">
			${guides}
			${kids
				? `<button class="tcaret" data-act="tree-fold" data-id="${esc(id)}">${folded.has(id) ? '+' : '−'}</button>`
				: '<span class="tcaret empty"></span>'}
			${img(node.item, 'trow-icon')}
			<span class="trow-main">
				<span class="trow-name">${codexName(node.item)}</span>
				<span class="trow-sub">${esc(bits.join(' · ') || 'nothing needed')}</span>
			</span>
			<span class="trow-need">${F(node.need)}</span>
			<span class="trow-own">${F(own)} held</span>
			<span class="badge ${state === 'missing' ? 'red' : state === 'covered' ? 'teal' : 'blue'}">${STATE_WORD[state]}</span>
		</div>`;
	}).join('');

	return `<div class="tbar">
			${picker}
			<span class="panel-spacer"></span>
			<button class="ghost-btn" data-act="tree-all">Expand all</button>
			<button class="ghost-btn" data-act="tree-none">Collapse</button>
		</div>
		<div class="panel tpanel">${rows}</div>
		<div class="tlegend">
			<span><i class="dot teal"></i>covered from stock</span>
			<span><i class="dot blue"></i>to craft or enhance</span>
			<span><i class="dot red"></i>still missing</span>
		</div>`;
}

/** Which build's tree to look at. A list rather than a row of chips, so
 *  it costs the same whether you have two builds queued or twenty. */
function pickTreeTarget() {
	const targets = snapshot.targets;
	const current = targets.find(t => t.item === treeTarget) || targets[0];
	openDialog(`
		<h2>Which build</h2>
		<div class="picker">${targets.map(t => `
			<button type="button" class="picker-row ${t === current ? 'on' : ''}"
				data-act="tree-target" data-item="${esc(t.item)}">
				${img(t.item, 'row-icon sm')}
				<span class="picker-name">${esc(t.item)}</span>
				<span class="picker-tag">${Math.round(t.progress)}%</span>
			</button>`).join('')}</div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>
	`);
}

/* ------------------------------------------------------------------ *
 * Workshop
 * ------------------------------------------------------------------ */

/**
 * Every part worth an enhancement attempt: the ones a build is waiting
 * on, and anything enhanceable already sitting in your inventory --
 * because a part you levelled for its own sake is still a part you want
 * to take further.
 */
/** The odds on this single attempt, and when the pity meter fills. */
function odds(e) {
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
function outlook(e) {
	const f = e.forecast;
	if (!f || e.next >= e.want) return '';
	return `<span class="enh-outlook" title="Expected cost of every attempt from +${e.have} to +${e.want}, and the most it can possibly take">
		to +${e.want}: <b>${F(f.expected)}</b> expected · ${F(f.ceiling)} at worst
	</span>`;
}

/**
 * Which way round to build something that can be reached two ways.
 *
 * The Caravel takes either an Epheria Sailboat or an Improved one, and
 * the Galleass either Frigate. bdocodex lists both with the same
 * materials, so the step is the same either way -- what differs is
 * whether you build the Improved first, which is a whole upgrade of its
 * own and wants four more Epheria: Old parts.
 *
 * Neither is presented as the right answer. What each costs is shown,
 * and the choice is the user's.
 */
function routeOptions(item) {
	const variants = routes[item];
	if (!variants) return '';
	const chosen = routeOf(item, store.getAllStrategy());
	const info = routeInfo[item] || {};
	const stock = store.getAllStock();

	return Object.keys(variants).map(name => {
		const meta = info[name] || {};
		const on = name === chosen;
		// What this route asks for beyond the step they share, priced from
		// nothing so the two are comparable.
		const cost = planOne(item, 1, {}, { ...store.getAllStrategy(), [item]: name });
		const units = Object.values(cost.missing).reduce((a, b) => a + b, 0);
		const held = (stock[meta.via] || 0) > 0;
		return `<button class="route ${on ? 'on' : ''}" data-act="route" data-item="${esc(item)}" data-route="${esc(name)}">
			<span class="route-head">
				<span class="route-name">${esc(meta.label || name)}</span>
				${held ? '<span class="route-have">you have one</span>' : ''}
			</span>
			<span class="route-cost">${F(units)} units of material in total</span>
			${meta.gains ? `<span class="route-gain">${esc(meta.gains)}</span>` : ''}
		</button>`;
	}).join('');
}

/** " · via the Improved Epheria Sailboat — change", on a build that has
 *  more than one way in. */
function routeNote(item) {
	if (!routes[item]) return '';
	const chosen = routeOf(item, store.getAllStrategy());
	const meta = (routeInfo[item] || {})[chosen] || {};
	return ` · via <b>${esc(meta.via || chosen)}</b>` +
		` <button class="linky" data-act="ask-route" data-item="${esc(item)}">change</button>`;
}

/** The choice, as its own dialog -- asked when a build is queued, and
 *  reachable again from the build afterwards. */
function askRoute(item, { onPick } = {}) {
	const host = openDialog(`
		<h2>${esc(item)}</h2>
		<p>There are two ways to build this one. Pick either — you can change your mind later from the build.</p>
		<div class="route-list">${routeOptions(item)}</div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>
	`);
	host.querySelectorAll('[data-act="route"]').forEach(btn => {
		btn.addEventListener('click', () => {
			store.setStrategy(item, btn.dataset.route);
			closeDialog();
			if (onPick) onPick(btn.dataset.route);
		});
	});
	return host;
}

/** " -- Crow Coin Shop", when we know where a part comes from. */
function whereFrom(item) {
	const src = sourceOf(item);
	return src ? ` — ${src.label}` : '';
}

function pendingEnhancements() {
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

function renderWorkshop() {
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

/* ------------------------------------------------------------------ *
 * To Get
 * ------------------------------------------------------------------ */

/** What the player has told us about their own bartering. */
function barterProfile() {
	return {
		barterCount: Number(store.getSetting('barterCount', 0)) || 0,
		valuePack: store.getSetting('valuePack', false) === true
	};
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
function barterLookup(item, qty = 1) {
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
	const { barterCount, valuePack } = barterProfile();
	const day = barterDay({ valuePack });
	const next = nextUnlock(barterCount);

	return `<div>
		<div class="summary-k">Bartering</div>
		<div class="summary-v">${F(day.trades)} trades/day</div>
		<div class="summary-sub"><input class="purse-inline" type="text" inputmode="numeric"
			value="${F(barterCount)}" data-act="barter-count"
			aria-label="Barters you have completed"> done${next ? ` · ${esc(next)}` : ''}
			· <label class="inline-check"><input type="checkbox" data-act="value-pack"
			${valuePack ? 'checked' : ''}> Value Pack</label></div>
	</div>`;
}

/** The next thing your barter count opens, phrased as the wait for it. */
function nextUnlock(count) {
	const next = ROUTE_UNLOCKS.filter(r => r.opens && r.barters > count)[0];
	if (!next) return null;
	return `${F(next.barters - count)} to ${next.opens}`;
}

function renderGet() {
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
				const sea = plan
					? `<div class="row-sea${plan.gate ? ' locked' : ''}">by barter: ${esc(barterLine(plan))}${
						why ? ` <span class="row-sea-why">${esc(why)}</span>` : ''}</div>`
					: '';
				// The list says where to buy it; the other half of the
				// decision is what making it would cost instead.
				const made = waysToGet(entry.item, costCtx()).routes.find(r => r.parts);
				const alt = made
					? `<div class="row-alt">or make ${F(entry.qty)}: ${esc(costText(made, entry.qty))}</div>`
					: '';
				return `<div class="row" data-peek="${esc(entry.item)}">
					${img(entry.item, 'row-icon sm')}
					<div class="row-main">
						<div class="row-name">${codexName(entry.item)}</div>
						<div class="row-sub">${esc(sub)}</div>
						${alt}
						${sea}
					</div>
					<span class="qty-out">${F(entry.qty)}</span>
				</div>`;
			}).join('')}
		</div>`;
	}).join('');

	return summary + body;
}

function shoppingText() {
	return Object.entries(snapshot.missing)
		.filter(([, q]) => q > 0)
		.sort((a, b) => b[1] - a[1])
		.map(([item, q]) => `${Math.round(q)}× ${item}`)
		.join('\n');
}

/* ------------------------------------------------------------------ *
 * shell
 * ------------------------------------------------------------------ */

export function render() {
	recompute();

	const counts = {
		builds: store.getTargets().length,
		inventory: Object.keys(store.getAllStock()).length,
		workshop: readyCrafts().length,
		get: Object.keys(snapshot.missing).length
	};

	document.getElementById('tabs').innerHTML = TABS.map(t => `
		<button class="tab ${view === t.id ? 'active' : ''}" data-act="view" data-id="${t.id}">
			${t.label}${counts[t.id] ? `<span class="tab-count">${counts[t.id]}</span>` : ''}
		</button>`).join('');

	// Only fade the tab row when there is in fact something past the edge.
	const tabBar = document.getElementById('tabs');
	tabBar.classList.toggle('scrolls', tabBar.scrollWidth > tabBar.clientWidth + 1);

	const undoBtn = document.getElementById('undo-btn');
	if (undoBtn) undoBtn.disabled = !store.canUndo();

	paintPouch();

	hidePeek();

	const root = document.getElementById('screen');
	const focus = captureFocus(root);
	root.className = 'screen';
	if (view === 'plan') root.innerHTML = renderPlan();
	else if (view === 'builds') root.innerHTML = renderBuilds();
	else if (view === 'inventory') root.innerHTML = renderInventory();
	else if (view === 'tree') root.innerHTML = renderTree();
	else if (view === 'workshop') root.innerHTML = renderWorkshop();
	else root.innerHTML = renderGet();
	restoreFocus(root, focus);
}

/**
 * A render replaces the whole screen, which would throw away the field
 * someone is typing in. Remember which one it was -- by what it edits,
 * not by node identity -- and put the caret back where it was.
 */
function captureFocus(root) {
	const el = document.activeElement;
	if (!el || el.tagName !== 'INPUT' || !root.contains(el) || !el.dataset.act) return null;
	const parts = [`[data-act="${el.dataset.act}"]`];
	if (el.dataset.item) parts.push(`[data-item="${el.dataset.item}"]`);
	if (el.dataset.target) parts.push(`[data-target="${el.dataset.target}"]`);
	return { sel: parts.join(''), start: el.selectionStart, end: el.selectionEnd };
}

function restoreFocus(root, focus) {
	if (!focus) return;
	let next = null;
	try {
		next = root.querySelector(focus.sel);
	} catch {
		return;   // an item name that will not survive a selector
	}
	if (!next) return;
	next.focus();
	try {
		next.setSelectionRange(focus.start, focus.end);
	} catch {
		/* not a field with a caret */
	}
}

function setView(id) {
	view = id;
	query = '';
	store.setSetting('view', id);
	render();
}

/**
 * Pull in the barter dataset once, in the background. It is large, so it
 * never blocks a paint -- and loading it up front rather than on entering
 * "To Get" avoids a second render swapping the view out from under you.
 */
async function loadBarter() {
	if (barterData) return;
	try {
		barterData = (await import('./all_barter.js')).shipbarters;
	} catch {
		barterData = [];
	}
	if (view === 'get') render();
}

/* ------------------------------------------------------------------ *
 * water
 * ------------------------------------------------------------------ */

function waterOn() {
	if (water) {
		water.show();
		water.play();
		return;
	}
	try {
		water = RealisticWaterRipples.create(document.body, {
			resolution: 512,
			dropRadius: 30,
			perturbance: 0.06,
			interactive: true,
			initiallyVisible: true,
			initiallyRunning: true
		});
		if (!water.init()) water = null;
	} catch {
		water = null;
	}
}

function waterOff() {
	if (!water) return;
	try {
		water.destroy();
	} catch {
		/* ignore */
	}
	water = null;
}

function syncWaterButton() {
	const btn = document.getElementById('water-btn');
	if (!btn) return;
	const on = store.getSetting('water', false) === true;
	btn.textContent = `≈ Water ${on ? 'on' : 'off'}`;
	btn.classList.toggle('on', on);
}

function toggleWater() {
	const next = !(store.getSetting('water', false) === true);
	store.setSetting('water', next);
	if (next) waterOn();
	else waterOff();
	syncWaterButton();
}

/* ------------------------------------------------------------------ *
 * events
 * ------------------------------------------------------------------ */

function targetIdFrom(el) {
	const row = el.closest('[data-target]');
	return row ? row.getAttribute('data-target') : null;
}

function wire() {
	document.addEventListener('click', async evt => {
		// A link out to BDOCodex is the browser's business, not ours --
		// it must not also select a tile or dismiss a panel on the way.
		if (evt.target.closest('a[data-codex]')) return;

		const el = evt.target.closest('[data-act]');
		if (!el) {
			// Clicking past the tiles puts the detail panel away. Reading
			// the panel itself is not clicking past anything, so a click
			// inside it leaves the selection alone.
			if (view === 'inventory' && selected && !evt.target.closest('.detail')) {
				selected = null;
				render();
			}
			return;
		}
		const act = el.getAttribute('data-act');

		// Picking something out of the phone menu puts it away again.
		if (act !== 'menu' && el.closest('.masthead-actions.open')) {
			document.getElementById('masthead-actions').classList.remove('open');
			const burger = document.querySelector('[data-act="menu"]');
			if (burger) burger.setAttribute('aria-expanded', 'false');
		}

		switch (act) {
			case 'view': setView(el.dataset.id); return;
			case 'undo': {
				const label = store.undo();
				toast(label ? `Reverted: ${label}` : 'Nothing to undo');
				return;
			}
			case 'add-build': return openBuildPicker();
			case 'export': return doExport();
			case 'import': return doImport();
			case 'water': return toggleWater();
			case 'tour': return startTour();
			case 'help': return openHelp();
			case 'signin':
			case 'account': return openAccount();
			case 'menu': {
				// The header's buttons do not fit a phone, so below a certain
				// width they live behind this and are shown on demand.
				const bar = document.getElementById('masthead-actions');
				const open = bar.classList.toggle('open');
				el.setAttribute('aria-expanded', String(open));
				return;
			}
			case 'plan-filter': planFilter = el.dataset.id; return render();
			case 'tree-pick': return pickTreeTarget();
			case 'tree-target': treeTarget = el.dataset.item; closeDialog(); return render();
			case 'tree-fold': {
				const id = el.dataset.id;
				if (folded.has(id)) folded.delete(id); else folded.add(id);
				return render();
			}
			case 'tree-all': folded.clear(); return render();
			case 'tree-none': {
				folded.clear();
				snapshot.targets.forEach(t => (t.tree.children || []).forEach(function deep(n) {
					folded.add(`/${t.tree.item}/${n.item}`);
				}));
				chainsFolded = true;
				return render();
			}
			case 'inv-filter': invFilter = el.dataset.id; return render();
			case 'select': selected = el.dataset.item; return render();
			case 'deselect': selected = null; return render();
			case 'strategy':
				if (selected) store.setStrategy(selected, el.dataset.mode);
				return;
			case 'ask-route': return askRoute(el.dataset.item, {
				onPick: name => toast(
					`${el.dataset.item} — ${name === 'improved' ? 'by way of the Improved hull' : 'straight from the base hull'}`,
					true
				)
			});
			case 'bump':
				if (selected) store.addStock(selected, Number(el.dataset.delta));
				return;
			case 'own':
				store.addStock(el.dataset.item, Number(el.dataset.delta));
				return;
			case 'move-level': {
				const from = el.dataset.from;
				const to = el.dataset.to;
				store.applyDelta({ [from]: -1, [to]: 1 }, 'level',
					`${parseEnhanced(to).base} recorded at +${parseEnhanced(to).level}`);
				selected = to;
				toast(`Recorded at +${parseEnhanced(to).level} — no stones spent`, true);
				return;
			}
			case 'copy':
				try {
					await navigator.clipboard.writeText(shoppingText());
					toast('Shortfall list copied');
				} catch {
					toast('Could not reach the clipboard');
				}
				return;
			case 'craft': {
				const item = el.dataset.item;
				const field = el.dataset.times === 'field'
					? el.closest('.craft-actions').querySelector('.craft-n')
					: null;
				const asked = field ? parseAmount(field.value) : Number(el.dataset.times);
				const want = Math.max(1, asked || 1);
				const times = Math.min(want, maxCraftable(item, store.getAllStock(), recipes));
				if (times < 1) return toast('Not enough materials for that');
				store.applyDelta(craftDelta(item, times, recipes), 'craft', `Crafted ${times} × ${item}`);
				toast(`Crafted ${times} × ${item}`, true);
				return;
			}
			case 'enhance': {
				const row = el.closest('[data-base]');
				const base = row.getAttribute('data-base');
				const level = Number(row.getAttribute('data-level'));
				const step = enhanceStep(base, level);
				if (!step) return;
				const ok = el.dataset.result === 'success';
				store.applyDelta(
					ok ? step.onSuccess : step.onFailure,
					'enhance',
					ok ? `${base} reached +${level}` : `Failed attempt at +${level} ${base}`
				);
				// Only the steps that actually spend Cron are being held by
				// it; +1 costs none, and has nothing to fall to anyway.
				const held = (tableFor(base) || {}).keepsLevel !== false || !step.stones['Cron Stone']
					? 'kept its level'
					: 'held its level on the Cron Stones';
				toast(ok ? `${base} is now +${level}` : `Materials spent — ${base} ${held}`, true);
				return;
			}
			case 'move': {
				const id = targetIdFrom(el);
				if (id) store.moveTarget(id, Number(el.dataset.dir));
				return;
			}
			case 'qty': {
				const id = targetIdFrom(el);
				const t = id && store.getTarget(id);
				if (t) store.setTargetQty(id, t.qty + Number(el.dataset.delta));
				return;
			}
			case 'pause': {
				const id = targetIdFrom(el);
				if (id) store.toggleTarget(id);
				return;
			}
			case 'remove': {
				const id = targetIdFrom(el);
				if (id) store.removeTarget(id);
				return;
			}
			default:
		}
	});

	// Every typed-in quantity lands here: stock on the Plan and in the
	// inventory detail, the pouch, and how many of a build you want.
	document.addEventListener('change', evt => {
		// The Value Pack is a tick rather than a number, so it lands first
		// and on its own.
		const vp = evt.target.closest('[data-act="value-pack"]');
		if (vp) return store.setSetting('valuePack', vp.checked);

		const el = evt.target.closest(
			'[data-act="own-set"], [data-act="purse"], [data-act="target-qty"], [data-act="barter-count"]');
		if (!el) return;
		const n = parseAmount(el.value);
		if (n === null) return render();   // gibberish: put the stored value back
		if (el.dataset.act === 'target-qty') store.setTargetQty(el.dataset.target, n);
		else if (el.dataset.act === 'barter-count') store.setSetting('barterCount', n);
		else store.setStock(el.dataset.item, n);
	});

	// The pouch holds its ground while you type in it; once focus leaves it
	// entirely, catch it up with whatever the change already recorded.
	wirePeek();

	document.addEventListener('keydown', evt => {
		if (evt.key !== 'Escape' || !selected) return;
		if (!document.getElementById('dialog').hidden) return;   // the dialog has first claim
		selected = null;
		render();
	});

	// Landing in a quantity field selects what is there, so typing a new
	// number replaces it instead of appending to it.
	document.addEventListener('focusin', evt => {
		if (evt.target.classList && evt.target.classList.contains('amt')) evt.target.select();
	});

	window.addEventListener('resize', measurePouch);

	document.addEventListener('focusout', evt => {
		const host = document.getElementById('pouch');
		if (!host || !host.contains(evt.target)) return;
		if (host.contains(evt.relatedTarget)) return;
		paintPouch();
	});

	document.addEventListener('input', evt => {
		const el = evt.target.closest('[data-act="query"]');
		if (!el) return;
		query = el.value;
		render();   // the caret is restored by render() itself
	});
}

/* ------------------------------------------------------------------ *
 * hover card
 * ------------------------------------------------------------------ */

let peekTimer = null;
let peekOn = null;

function hidePeek() {
	clearTimeout(peekTimer);
	peekOn = null;
	const host = document.getElementById('peek');
	if (host) host.hidden = true;
}

/** Park the card under what you are pointing at, inside the viewport. */
function placePeek(host, el) {
	const box = el.getBoundingClientRect();
	const w = host.offsetWidth;
	const h = host.offsetHeight;
	let x = box.left;
	let y = box.bottom + 8;
	if (y + h > window.innerHeight - 8) y = Math.max(8, box.top - h - 8);
	if (x + w > window.innerWidth - 8) x = Math.max(8, window.innerWidth - w - 8);
	host.style.left = `${Math.round(x)}px`;
	host.style.top = `${Math.round(y)}px`;
}

function wirePeek() {
	const host = document.getElementById('peek');
	if (!host) return;

	document.addEventListener('mouseover', evt => {
		const el = evt.target.closest('[data-peek]');
		if (!el || el.dataset.peek === peekOn) return;
		hidePeek();
		// A short delay, so sweeping the mouse across a grid of tiles does
		// not flash a card for every one of them.
		peekTimer = setTimeout(() => {
			const html = peekHTML(el.dataset.peek);
			if (!html) return;
			host.innerHTML = html;
			host.hidden = false;
			peekOn = el.dataset.peek;
			placePeek(host, el);
		}, 280);
	});

	document.addEventListener('mouseout', evt => {
		const from = evt.target.closest('[data-peek]');
		if (!from) return;
		// Moving straight onto another one: its mouseover takes over, and
		// hiding here would cancel the card before it ever appeared.
		const to = evt.relatedTarget && evt.relatedTarget.closest
			? evt.relatedTarget.closest('[data-peek]')
			: null;
		if (to) return;
		hidePeek();
	});
	document.addEventListener('scroll', hidePeek, true);
	window.addEventListener('blur', hidePeek);
}

/* ------------------------------------------------------------------ *
 * dialogs
 * ------------------------------------------------------------------ */

function openDialog(html) {
	const host = document.getElementById('dialog');
	host.innerHTML = `<div class="dialog-box">${html}</div>`;
	host.hidden = false;
	host.onclick = evt => {
		if (evt.target === host || evt.target.hasAttribute('data-close')) closeDialog();
	};
	return host;
}

function closeDialog() {
	const host = document.getElementById('dialog');
	host.hidden = true;
	host.innerHTML = '';
}

/** Searchable, icon-led list of everything that can be queued. */
function openBuildPicker() {
	const queued = new Set(store.getTargets().map(t => t.item));
	// shipGroups[0] is the ships themselves; anything else grouped there is
	// a trackable part, and everything else is a material.
	const kindOf = name => {
		for (const [i, group] of shipGroups.entries()) {
			if (group.items.includes(name)) return i === 0 ? 'ship' : 'part';
		}
		return 'material';
	};

	const host = openDialog(`
		<h2>Add a build</h2>
		<p>Anything with a recipe can be queued — a ship, a part, or a stack of materials.</p>
		<input class="field picker-search" type="search" placeholder="Search ships, parts and materials…" data-picker-search>
		<div class="picker" data-picker></div>
		<div class="dialog-actions"><button class="act quiet" data-close>Close</button></div>
	`);

	const listEl = host.querySelector('[data-picker]');
	const searchEl = host.querySelector('[data-picker-search]');

	const paint = term => {
		const t = (term || '').trim().toLowerCase();
		const matches = buildableItems().filter(n => !t || n.toLowerCase().includes(t));
		listEl.innerHTML = matches.length
			? matches.slice(0, 200).map(n => {
				const already = queued.has(n);
				return `<button type="button" class="picker-row" data-pick="${esc(n)}" data-peek="${esc(n)}" ${already ? 'disabled' : ''}>
					${img(n, 'row-icon sm')}
					<span class="picker-name">${esc(n)}</span>
					<span class="picker-tag">${already ? 'queued' : kindOf(n)}</span>
				</button>`;
			}).join('')
			: '<p class="empty">Nothing matches that search.</p>';
	};

	paint('');
	searchEl.addEventListener('input', () => paint(searchEl.value));
	listEl.addEventListener('click', evt => {
		const btn = evt.target.closest('[data-pick]');
		if (!btn || btn.disabled) return;
		const item = btn.getAttribute('data-pick');
		store.addTarget(item, 1);
		closeDialog();
		// Something with two ways in asks straight away, while the choice
		// is still the thing you are thinking about -- not later, buried
		// in a panel about inventory.
		if (routes[item]) {
			askRoute(item, { onPick: () => toast(`${item} added to the queue`) });
			return;
		}
		toast(`${item} added to the queue`);
	});
	searchEl.focus();
}

function doExport() {
	const blob = new Blob([store.exportJSON()], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'ship-tracker.json';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function doImport() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = 'application/json,.json';
	input.addEventListener('change', async () => {
		const file = input.files && input.files[0];
		if (!file) return;
		try {
			const result = store.importJSON(await file.text());
			toast(`Imported ${result.items} items and ${result.targets} builds`);
		} catch (err) {
			toast(err.message);
		}
	});
	input.click();
}

function offerLegacyImport() {
	if (store.hasImportedLegacy()) return;

	const shipNames = shipGroups.flatMap(g => g.items);
	const legacy = store.readLegacyData(shipNames, allItems());
	if (!legacy || !Object.keys(legacy.stock).length) {
		store.markLegacyImported();
		return;
	}

	const list = Object.entries(legacy.stock)
		.sort((a, b) => b[1] - a[1])
		.map(([item, qty]) => `<div class="dialog-row"><span>${esc(item)}</span><span class="n">${F(qty)}</span></div>`)
		.join('');

	const host = openDialog(`
		<h2>Bring your progress across?</h2>
		<p>Your old per-ship counts can become one shared inventory. The same material was counted separately for each ship, so the highest count found is used rather than the sum — this may under-count, and you can correct anything afterwards in Inventory.</p>
		<div class="dialog-list">${list}</div>
		<p>${legacy.keys} saved values across ${legacy.ships.length} ships. Your old data stays untouched either way.</p>
		<div class="dialog-actions">
			<button class="act quiet" data-skip>Start fresh</button>
			<button class="act" data-accept>Import it</button>
		</div>
	`);

	host.querySelector('[data-skip]').addEventListener('click', () => {
		store.markLegacyImported();
		closeDialog();
		render();
	});
	host.querySelector('[data-accept]').addEventListener('click', () => {
		store.applyLegacyImport(legacy.stock, legacy.ships);
		closeDialog();
		toast(`Imported ${Object.keys(legacy.stock).length} items`);
	});
}

/**
 * The walkthrough, as a film.
 *
 * The guided tour points at things on your own screen, which is the right
 * way to learn a control you are looking at. This is for the other
 * question -- "what is this for" -- answered once, end to end, without
 * having to do anything. It is the real app, driven and captioned, with a
 * narrower cut for a phone.
 */
function openHelp() {
	const phone = window.matchMedia('(max-width: 720px)').matches;
	const file = phone ? 'walkthrough-phone.mp4' : 'walkthrough.mp4';
	const host = openDialog(`
		<h2>How this works</h2>
		<p>Two minutes, end to end: queue a build, choose how to get there, record what you gathered, make something, see what it will really cost, and take the list shopping.</p>
		<video class="help-film" src="docs/media/${file}" controls autoplay muted playsinline loop></video>
		<div class="dialog-actions">
			<button class="act quiet" data-close>Close</button>
			<button class="act" data-act="tour">Walk me through my own screen</button>
		</div>
	`);
	// The captions are the narration, so it starts muted and stays that
	// way; unmuting an autoplaying video is a good way to be hated.
	const film = host.querySelector('video');
	if (film) film.play().catch(() => { /* a browser that would rather not */ });
	return host;
}

async function startTour() {
	// Whatever asked for it -- the Help film, most likely -- gets out of
	// the way first. A tour that highlights the page from behind a dialog
	// is worse than no tour.
	closeDialog();
	try {
		const { guidedTour } = await import('./guided-tour.js');
		guidedTour.startTour('main');
	} catch (err) {
		console.warn('[ui] tour unavailable:', err);
	}
}

/* ------------------------------------------------------------------ *
 * boot
 * ------------------------------------------------------------------ */

export async function init() {
	store.init();

	const saved = store.getSetting('view');
	if (saved && TABS.some(t => t.id === saved)) view = saved;

	wire();
	store.subscribe(() => render());
	render();

	loadBarter();

	if (store.getSetting('water', false) === true) waterOn();
	syncWaterButton();

	offerLegacyImport();

	// First-run tour, once the screens are on the page.
	try {
		const { guidedTour } = await import('./guided-tour.js');
		guidedTour.checkAndShowInitialTour();
	} catch {
		/* the tour is optional */
	}

	// Icon metadata arrives asynchronously; repaint once it is ready.
	try {
		await iconLoader.init();
		render();
	} catch {
		/* icons fall back to the app mark */
	}

	// Sync last, and never blocking: on a deployment without it this is
	// one request that comes back "no" and nothing more happens.
	initSync({ toast, openDialog, closeDialog, rerender: render })
		.catch(err => console.warn('[ui] sync unavailable:', err));
}
