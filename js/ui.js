// The whole interface. Every screen is a projection of state.js through
// planner.js -- nothing here holds its own copy of anything.

import { recipes } from './recipes.js';
import { shipGroups } from './ships.js';
import { items as vendorItems } from './vendor_items.js';
import { coins } from './sea_coins.js';
import { falasi } from './falasi_vendor.js';
import { iconLoader } from './icon-loader.js';
import RealisticWaterRipples from './realistic-water-ripples.js';
import * as store from './state.js';
import {
	plan, craftableNow, maxCraftable, craftDelta,
	enhanceStep, ownedLevel, shoppingList, bottlenecks,
	parseEnhanced, enhancedName
} from './planner.js';

const TABS = [
	{ id: 'plan', label: 'Plan' },
	{ id: 'builds', label: 'Builds' },
	{ id: 'inventory', label: 'Inventory' },
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
		const walk = node => {
			const here = parseEnhanced(node.item);
			const from = node.via ? parseEnhanced(node.via) : null;
			const midChain = here.level > 0 && from && from.level > 0 && from.base === here.base;

			if (!midChain) {
				const r = rows[node.item] || (rows[node.item] = { need: 0, take: 0, craft: 0, short: 0 });
				r.need += node.need;
				r.take += node.fromStock;
				r.craft += node.toCraft;
				r.short += node.missing;
			}
			node.children.forEach(walk);
		};
		walk(target.tree);
	}
	for (const [item, holders] of Object.entries(snapshot.reservedBy)) {
		if (rows[item]) rows[item].resv = holders;
	}
}

const readyCrafts = () =>
	craftableNow(store.getAllStock(), snapshot.toCraft)
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
			<button class="ready-chip" data-act="craft" data-item="${esc(c.item)}" data-times="1" title="Craft one now">
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
		['Missing', 'buy, barter, gather or hunt these', 'red', p => p.r.short > 0, 'short'],
		['To craft', 'recipes standing between you and done', 'blue', p => p.r.short === 0 && p.r.craft > 0, 'craft'],
		['Covered', 'fully reserved from stock', 'teal', p => p.covered, 'done']
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
 * The pouch: coins, silver and enhancement stones, on every tab.
 *
 * These are spent from wherever you happen to be -- buying on To Get,
 * enhancing in the Workshop -- so they sit in the shell above the tabs
 * instead of belonging to one screen. Stones only appear once a build
 * needs them or you hold some, so the bar stays short.
 */
function pouchHTML() {
	const totals = totalsToGo();

	const entries = [
		{ item: CROW_COIN, label: 'Crow Coins', need: totals.coins, where: "Crow Coin Shop, Oquilla's Eye" },
		{ item: SILVER, label: 'Silver', need: totals.silver, where: 'Falasi, port of Epheria', glyph: '\u25C9' }
	];

	STONES
		.map(item => ({ item, label: item, need: rows[item] ? rows[item].need : 0, where: 'spent on enhancement attempts' }))
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

	const can = !enhanced && recipes[item] && r.craft > 0 && maxCraftable(item, store.getAllStock()) >= 1;
	const badge = covered ? 'covered' : r.short > 0 ? `${F(r.short)} short` : enhanced ? 'to enhance' : 'craftable';
	const badgeCls = covered ? 'teal' : r.short > 0 ? 'red' : 'blue';
	const own = store.getStock(item);

	return `<div class="row">
		${img(item)}
		<div class="row-main">
			<div class="row-name">${esc(item)}</div>
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
				<input class="own-input" type="number" min="0" value="${own}" data-act="own-set" data-item="${esc(item)}" aria-label="Owned">
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
					<span class="build-name">${esc(t.item)}</span>
					<span class="build-state ${state}">${stateLabel}</span>
				</div>
				<div class="bar tall"><i class="fill" style="width:${pct.toFixed(1)}%"></i></div>
				<div class="build-meta">Priority ${i + 1} · <span class="n">${pct.toFixed(1)}%</span> · ${esc(units)}</div>
			</div>
			<div class="build-actions">
				<button class="sq-btn" data-act="move" data-dir="-1" title="Raise priority" ${i === 0 ? 'disabled' : ''}>▲</button>
				<button class="sq-btn" data-act="move" data-dir="1" title="Lower priority" ${i === targets.length - 1 ? 'disabled' : ''}>▼</button>
				<span class="stepper">
					<button data-act="qty" data-delta="-1" aria-label="Fewer">−</button>
					<span class="val">${t.qty}</span>
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
				<div class="row-name">${esc(b.item)}</div>
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

	const tiles = list.map(item => {
		const own = stock[item] || 0;
		const reserved = snapshot.reserved[item] || 0;
		const free = Math.max(0, own - reserved);
		const r = rows[item];
		const short = r ? r.short : 0;
		const denom = Math.max(own, 1);
		return `<button class="tile ${short > 0 ? 'short' : ''} ${selected === item ? 'selected' : ''}" data-act="select" data-item="${esc(item)}" title="${esc(item)}">
			${img(item, '')}
			<span class="tile-qty">${F(own)}</span>
			<span class="tile-name">${esc(item)}</span>
			<span class="bar">
				<i class="make" style="width:${(reserved / denom) * 100}%"></i>
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
			${list.length
				? `<div class="inv-grid">${tiles}</div>`
				: `<div class="panel"><p class="empty">${searching ? 'Nothing matches that search.' : 'Nothing here yet — add a build, or switch to Owned to record what you have.'}</p></div>`}
		</div>
		<aside class="detail">${renderDetail()}</aside>
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
	const src = sourceOf(item);
	const canCraft = !!recipes[item];
	const most = canCraft ? maxCraftable(item, store.getAllStock()) : 0;

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
			<div class="detail-name">${esc(item)}</div>
		</div>
		<div class="qty-row">
			<button class="qty-btn" data-act="bump" data-delta="-10">−10</button>
			<button class="qty-btn" data-act="bump" data-delta="-1">−</button>
			<span class="qty-val">${F(own)}</span>
			<button class="qty-btn" data-act="bump" data-delta="1">+</button>
			<button class="qty-btn" data-act="bump" data-delta="10">+10</button>
		</div>
		<div class="kv">
			<div class="kv-row"><span>Reserved</span><span class="n blue">${F(reserved)}</span></div>
			<div class="kv-row"><span>Free</span><span class="n teal">${F(free)}</span></div>
			<div class="kv-row"><span>Still short</span><span class="n ${short > 0 ? 'red' : 'faint'}">${short > 0 ? F(short) : '—'}</span></div>
		</div>
		${resvHTML}
		${src ? `<div class="detail-src"><span>${esc(src.label)}</span><span>${esc(src.detail)}</span></div>` : ''}
		${toggle}
		${canCraft ? `<div class="detail-actions">
			<button class="act" data-act="craft" data-item="${esc(item)}" data-times="1" ${most < 1 ? 'disabled' : ''}>Craft 1</button>
			<button class="act quiet" data-act="craft" data-item="${esc(item)}" data-times="${most}" ${most < 1 ? 'disabled' : ''}>Craft max (${F(most)})</button>
		</div>` : ''}`;
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

		const stoneName = Object.keys(step.stones)[0] || 'Tidal Black Stone';
		const stoneQty = step.stones[stoneName] || 0;
		const affordable = Object.entries(step.stones).every(([st, q]) => (stock[st] || 0) >= q);
		const holds = (stock[step.from] || 0) > 0;

		out.push({
			base,
			have,
			next: have + 1,
			want,
			forBuild,
			stoneName,
			stoneQty,
			affordable,
			holds,
			blocked: !affordable || !holds,
			note: !holds
				? `you do not own ${have > 0 ? `a +${have}` : 'the base'} part yet`
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
		return `<div class="craft-card">
			<div class="craft-top">
				${img(c.item, '')}
				<div>
					<div class="craft-name">${esc(c.item)}</div>
					<div class="craft-times">×${F(c.possible)} possible now</div>
				</div>
			</div>
			<div class="ings">${ings}</div>
			<div class="craft-actions">
				<button class="act go" data-act="craft" data-item="${esc(c.item)}" data-times="1">Craft 1</button>
				<button class="act quiet" data-act="craft" data-item="${esc(c.item)}" data-times="${c.possible}">Craft ×${F(c.possible)}</button>
			</div>
		</div>`;
	}).join('');

	const enhRows = pendingEnhancements().map(e => `
		<div class="row" data-base="${esc(e.base)}" data-level="${e.next}" ${e.blocked ? 'style="opacity:.55"' : ''}>
			${img(enhancedName(e.base, e.have), 'row-icon md')}
			<div class="row-main">
				<div class="row-name">${esc(e.base)}</div>
				<div class="row-sub" ${e.blocked ? 'style="color:var(--red)"' : ''}>${esc(e.note)}</div>
			</div>
			<span class="enh-level">+${e.have} → +${e.next}</span>
			<span class="enh-cost">${img(e.stoneName, '')}×${F(e.stoneQty)}</span>
			<span class="enh-actions">
				<button class="pill-btn" data-act="enhance" data-result="success" ${e.blocked ? 'disabled' : ''}>Succeeded</button>
				<button class="pill-btn bad" data-act="enhance" data-result="fail" ${e.affordable ? '' : 'disabled'}>Failed</button>
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
			<span class="panel-sub">Everything you own that can go higher. Ship parts keep their level on a failed attempt — record what happened, stones are spent either way</span>
		</div>
		${enhRows || '<p class="empty">Nothing in your inventory can be enhanced. Add a ship part and it will show up here.</p>'}
	</div>`;
}

/* ------------------------------------------------------------------ *
 * To Get
 * ------------------------------------------------------------------ */

function barterLookup(item) {
	if (!barterData) return null;
	const entry = barterData.find(b => b.name === item);
	if (!entry || !entry.sources || !entry.sources.length) return null;
	const npcs = [...new Set(entry.sources.map(s => s.npc_name))];
	const gives = [...new Set(entry.sources.map(s => s.give && s.give.name).filter(Boolean))];
	return { npcs, gives };
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
				if (entry.barter) {
					const t = `barter from ${entry.barter.npcs.length} NPCs for ${entry.barter.gives.slice(0, 2).join(' / ')}`;
					sub = sub ? `${sub} · ${t}` : t;
				}
				return `<div class="row">
					${img(entry.item, 'row-icon sm')}
					<div class="row-main">
						<div class="row-name">${esc(entry.item)}</div>
						<div class="row-sub">${esc(sub)}</div>
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

	const undoBtn = document.getElementById('undo-btn');
	if (undoBtn) undoBtn.disabled = !store.canUndo();

	paintPouch();

	const root = document.getElementById('screen');
	root.className = 'screen';
	if (view === 'plan') root.innerHTML = renderPlan();
	else if (view === 'builds') root.innerHTML = renderBuilds();
	else if (view === 'inventory') root.innerHTML = renderInventory();
	else if (view === 'workshop') root.innerHTML = renderWorkshop();
	else root.innerHTML = renderGet();
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
		const el = evt.target.closest('[data-act]');
		if (!el) return;
		const act = el.getAttribute('data-act');

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
			case 'plan-filter': planFilter = el.dataset.id; return render();
			case 'inv-filter': invFilter = el.dataset.id; return render();
			case 'select': selected = el.dataset.item; return render();
			case 'strategy':
				if (selected) store.setStrategy(selected, el.dataset.mode);
				return;
			case 'bump':
				if (selected) store.addStock(selected, Number(el.dataset.delta));
				return;
			case 'own':
				store.addStock(el.dataset.item, Number(el.dataset.delta));
				return;
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
				const want = Math.max(1, Number(el.dataset.times) || 1);
				const times = Math.min(want, maxCraftable(item, store.getAllStock()));
				if (times < 1) return toast('Not enough materials for that');
				store.applyDelta(craftDelta(item, times), 'craft', `Crafted ${times} × ${item}`);
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
				toast(ok ? `${base} is now +${level}` : `Stones spent — ${base} kept its level`, true);
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

	document.addEventListener('change', evt => {
		const own = evt.target.closest('[data-act="own-set"]');
		if (own) store.setStock(own.dataset.item, own.value);
		const purse = evt.target.closest('[data-act="purse"]');
		if (purse) {
			const n = parseAmount(purse.value);
			if (n === null) render();   // gibberish: put the stored value back
			else store.setStock(purse.dataset.item, n);
		}
	});

	// The pouch holds its ground while you type in it; once focus leaves it
	// entirely, catch it up with whatever the change already recorded.
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
		const pos = el.selectionStart;
		render();
		const next = document.querySelector('[data-act="query"]');
		if (next) {
			next.focus();
			next.setSelectionRange(pos, pos);
		}
	});
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
				return `<button type="button" class="picker-row" data-pick="${esc(n)}" ${already ? 'disabled' : ''}>
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

async function startTour() {
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
}
