// The inventory-facing half of the app: what you own, what you are
// building, what you can make right now, and what you still have to go
// and get. Every view is a projection of state.js through planner.js --
// nothing here keeps its own copy of anything.

import { recipes } from './recipes.js';
import { shipGroups } from './ships.js';
import { items as vendorItems } from './vendor_items.js';
import { coins } from './sea_coins.js';
import { falasi } from './falasi_vendor.js';
import { iconLoader } from './icon-loader.js';
import * as store from './state.js';
import {
	plan, craftableNow, maxCraftable, craftDelta,
	enhanceStep, ownedLevel, shoppingList, bottlenecks,
	parseEnhanced, enhancedName
} from './planner.js';

const VIEWS = [
	{ id: 'plan', label: '🧭 Plan' },
	{ id: 'targets', label: '🎯 Builds' },
	{ id: 'inventory', label: '🎒 Inventory' },
	{ id: 'workshop', label: '🔨 Workshop' },
	{ id: 'shopping', label: '🛒 To Get' }
];

/** Elements belonging to the original per-ship view. */
const PLAN_SELECTORS = [
	'.ship-selector-container',
	'#progress-dashboard',
	'#materials-section',
	'#floating-progress-dashboard'
];

let root = null;
let current = 'plan';
let latest = null;
let inventoryFilter = 'needed';
let inventorySearch = '';
let selectedItem = null;
let barterData = null;
let toastTimer = null;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const esc = s => String(s).replace(/[&<>"']/g, c =>
	({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const num = n => Math.round(n).toLocaleString();

function iconHTML(name, cls = 'mf-tile-icon') {
	let info = null;
	try {
		// Enhanced variants share the base item's icon, and the loader only
		// knows how to strip "+10".
		info = iconLoader.getIconInfo(name) || iconLoader.getIconInfo(parseEnhanced(name).base);
	} catch {
		info = null;
	}
	const file = info && info.filename ? info.filename : null;
	const img = file
		? `<img src="icons/${esc(file)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
		: '<span aria-hidden="true">📦</span>';
	return `<div class="${cls}">${img}</div>`;
}

/** Every item the tracker knows, for the inventory grid and the picker. */
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

function craftableItems() {
	const shipSet = new Set(shipGroups.flatMap(g => g.items));
	return Object.keys(recipes)
		.filter(name => !/^\+\d+\s/.test(name))
		.sort((a, b) => {
			const as = shipSet.has(a) ? 0 : 1;
			const bs = shipSet.has(b) ? 0 : 1;
			return as - bs || a.localeCompare(b);
		});
}

function toast(message, withUndo = true) {
	let el = document.getElementById('mf-toast');
	if (!el) {
		el = document.createElement('div');
		el.id = 'mf-toast';
		el.className = 'mf-toast';
		document.body.appendChild(el);
	}
	el.innerHTML = `<span>${esc(message)}</span>` +
		(withUndo ? '<button type="button" data-mf-undo>Undo</button>' : '');
	el.classList.add('show');
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

/* ------------------------------------------------------------------ *
 * Planning
 * ------------------------------------------------------------------ */

function recompute() {
	latest = plan({
		stock: store.getAllStock(),
		targets: store.getTargets(),
		strategy: store.getAllStrategy()
	});
	return latest;
}

/**
 * Plain crafts that are ready to go. Enhancement steps are recipes too,
 * but they belong in the Enhancement section, which can tell a successful
 * attempt from a failed one.
 */
function readyToCraft(stock) {
	return craftableNow(stock, latest.toCraft)
		.filter(entry => parseEnhanced(entry.item).level === 0);
}

/** What every item is needed for, summed over active builds. */
function neededTotals() {
	const needed = {};
	for (const target of latest.targets) {
		const walk = node => {
			needed[node.item] = (needed[node.item] || 0) + node.need;
			node.children.forEach(walk);
		};
		walk(target.tree);
	}
	return needed;
}

/* ------------------------------------------------------------------ *
 * Builds
 * ------------------------------------------------------------------ */

function renderTargets() {
	const targets = store.getTargets();
	if (!targets.length) {
		return `<div class="mf-panel">
			<div class="mf-panel-head">
				<h2 class="mf-panel-title">Builds</h2>
				<button class="mf-btn" data-mf-add-target>Add a build</button>
			</div>
			<p class="mf-empty">Nothing tracked yet. Add a ship or a part and everything else follows from it.</p>
		</div>`;
	}

	const byId = new Map(latest.targets.map(t => [t.id, t]));
	const rows = targets.map((t, i) => {
		const r = byId.get(t.id);
		const pct = r ? r.progress : 0;
		const missing = r ? r.missingUnits : 0;
		const total = r ? r.totalUnits : 0;
		return `<div class="mf-target ${t.active ? '' : 'paused'}" data-mf-target="${esc(t.id)}">
			${iconHTML(t.item, 'mf-target-icon')}
			<div>
				<div class="mf-target-name">${esc(t.item)}${t.qty > 1 ? ` ×${t.qty}` : ''}</div>
				<div class="mf-progress-track">
					<div class="mf-progress-fill ${pct >= 100 ? 'done' : ''}" style="width:${pct.toFixed(1)}%"></div>
				</div>
				<div class="mf-target-meta">
					Priority ${i + 1} &middot; ${pct.toFixed(1)}% &middot;
					${missing > 0 ? `${num(missing)} of ${num(total)} units still needed` : 'everything on hand'}
				</div>
			</div>
			<div class="mf-target-actions">
				<button class="mf-icon-btn" data-mf-move="-1" title="Higher priority" ${i === 0 ? 'disabled' : ''}>▲</button>
				<button class="mf-icon-btn" data-mf-move="1" title="Lower priority" ${i === targets.length - 1 ? 'disabled' : ''}>▼</button>
				<input class="mf-qty" type="number" min="1" value="${t.qty}" data-mf-target-qty aria-label="Quantity">
				<button class="mf-icon-btn" data-mf-pause title="${t.active ? 'Pause' : 'Resume'}">${t.active ? '⏸' : '▶'}</button>
				<button class="mf-icon-btn danger" data-mf-remove title="Stop tracking">✕</button>
			</div>
		</div>`;
	}).join('');

	const blockers = bottlenecks(latest, 4);
	const blockerHTML = blockers.length
		? `<div class="mf-panel">
			<div class="mf-panel-head">
				<h2 class="mf-panel-title">Biggest blockers</h2>
				<p class="mf-panel-note">Missing items holding up the most builds</p>
			</div>
			${blockers.map(b => `<div class="mf-line">
				${iconHTML(b.item)}
				<div>
					<div class="mf-line-name">${esc(b.item)}</div>
					<div class="mf-line-sub">blocks ${b.targets.map(esc).join(', ')}</div>
				</div>
				<div class="mf-line-qty">${num(b.qty)} short</div>
			</div>`).join('')}
		</div>`
		: '';

	return `<div class="mf-panel">
		<div class="mf-panel-head">
			<h2 class="mf-panel-title">Builds</h2>
			<p class="mf-panel-note">Scarce materials go to the build nearest the top</p>
			<button class="mf-btn" data-mf-add-target>Add a build</button>
		</div>
		${rows}
	</div>${blockerHTML}`;
}

/* ------------------------------------------------------------------ *
 * Inventory
 * ------------------------------------------------------------------ */

function renderInventory() {
	const stock = store.getAllStock();
	const needed = neededTotals();
	const term = inventorySearch.toLowerCase();

	// Searching looks at every item -- a status filter should never hide
	// something you explicitly went looking for.
	const searching = term.length > 0;

	let list = allItems().filter(item => {
		if (searching) return item.toLowerCase().includes(term);
		const own = stock[item] || 0;
		const need = needed[item] || 0;
		const short = latest.missing[item] || 0;
		if (inventoryFilter === 'owned') return own > 0;
		if (inventoryFilter === 'needed') return need > 0;
		if (inventoryFilter === 'short') return short > 0;
		if (inventoryFilter === 'free') return (latest.free[item] || 0) > 0;
		return true;
	});

	list.sort((a, b) => {
		const sa = latest.missing[a] || 0;
		const sb = latest.missing[b] || 0;
		if (sa !== sb) return sb - sa;
		return a.localeCompare(b);
	});

	const chips = [
		['needed', 'Needed'], ['short', 'Short'], ['owned', 'Owned'],
		['free', 'Unspoken for'], ['all', 'Everything']
	].map(([id, label]) =>
		`<button class="mf-chip ${inventoryFilter === id ? 'active' : ''}" data-mf-filter="${id}">${label}</button>`
	).join('');

	const tiles = list.map(item => {
		const own = stock[item] || 0;
		const reserved = latest.reserved[item] || 0;
		const free = Math.max(0, own - reserved);
		const need = needed[item] || 0;
		const short = latest.missing[item] || 0;
		const denom = Math.max(own + short, 1);
		return `<button type="button" class="mf-tile ${short > 0 ? 'short' : ''} ${selectedItem === item ? 'selected' : ''}" data-mf-item="${esc(item)}" title="${esc(item)}">
			${iconHTML(item)}
			<div class="mf-tile-qty">${num(own)}${need ? `<span class="need"> / ${num(need)}</span>` : ''}</div>
			<div class="mf-split">
				<i class="res" style="width:${(reserved / denom) * 100}%"></i>
				<i class="fre" style="width:${(free / denom) * 100}%"></i>
				<i class="sho" style="width:${(short / denom) * 100}%"></i>
			</div>
			<div class="mf-tile-name">${esc(item)}</div>
		</button>`;
	}).join('');

	return `<div class="mf-layout">
		<div>
			<div class="mf-panel">
				<div class="mf-controls">
					<input class="mf-search" type="search" placeholder="Search items…" value="${esc(inventorySearch)}" data-mf-search>
					${chips}
				</div>
				${list.length
					? `<div class="mf-grid">${tiles}</div>`
					: `<p class="mf-empty">${searching
						? 'Nothing matches that search.'
						: (store.getActiveTargets().length
							? 'No items match that filter.'
							: 'Add a build first, or switch to Everything to set what you already own.')}</p>`}
			</div>
		</div>
		<div class="mf-detail">${renderDetail()}</div>
	</div>`;
}

function renderDetail() {
	if (!selectedItem) {
		return `<div class="mf-panel"><p class="mf-empty">Pick an item to set how many you own and see what it is reserved for.</p></div>`;
	}

	const item = selectedItem;
	const own = store.getStock(item);
	const reserved = latest.reserved[item] || 0;
	const free = Math.max(0, own - reserved);
	const short = latest.missing[item] || 0;
	const holders = latest.reservedBy[item] || [];

	const reasons = holders.map(h =>
		`<div class="mf-reason"><b>${num(h.qty)}</b> → ${esc(h.targetItem)}${h.via && h.via !== h.targetItem ? ` <span>via ${esc(h.via)}</span>` : ''}</div>`
	).join('');

	const methods = vendorItems[item] || {};
	const sourceLines = Object.entries(methods)
		.map(([kind, where]) => `<div class="mf-reason"><b>${esc(kind)}</b> ${esc((where || []).join(', '))}</div>`)
		.join('');
	const coinLine = coins[item]
		? `<div class="mf-reason"><b>Crow Coins</b> ${num(coins[item])} each</div>` : '';
	const silverLine = falasi[item]
		? `<div class="mf-reason"><b>Falasi</b> ${num(falasi[item])} silver each</div>` : '';

	const canBuy = !!recipes[item] && (!!coins[item] || !!falasi[item] || !!(methods.Purchase || methods.Market));
	const mode = store.getStrategy(item);
	const toggle = canBuy
		? `<div class="mf-toggle">
				<button class="${mode === 'craft' ? 'on' : ''}" data-mf-strategy="craft">Craft it</button>
				<button class="${mode === 'buy' ? 'on' : ''}" data-mf-strategy="buy">Buy it</button>
			</div>
			<div class="mf-reason">Buying stops the planner asking for this item's own materials.</div>`
		: '';

	return `<div class="mf-panel">
		<div class="mf-detail-head">
			${iconHTML(item)}
			<div class="mf-detail-name">${esc(item)}</div>
		</div>
		<div class="mf-stepper">
			<button class="mf-icon-btn" data-mf-step="-10">−10</button>
			<button class="mf-icon-btn" data-mf-step="-1">−</button>
			<input class="mf-qty" type="number" min="0" value="${own}" data-mf-own aria-label="Owned quantity">
			<button class="mf-icon-btn" data-mf-step="1">+</button>
			<button class="mf-icon-btn" data-mf-step="10">+10</button>
		</div>
		<dl class="mf-kv">
			<div class="mf-kv-row"><dt>Reserved</dt><dd>${num(reserved)}</dd></div>
			<div class="mf-kv-row"><dt>Unspoken for</dt><dd>${num(free)}</dd></div>
			<div class="mf-kv-row"><dt>Still short</dt><dd>${short ? num(short) : '—'}</dd></div>
		</dl>
		${reasons ? `<div style="margin-top:12px">${reasons}</div>` : ''}
		${sourceLines || coinLine || silverLine ? `<div style="margin-top:12px">${coinLine}${silverLine}${sourceLines}</div>` : ''}
		${toggle}
	</div>`;
}

/* ------------------------------------------------------------------ *
 * Workshop
 * ------------------------------------------------------------------ */

function renderWorkshop() {
	const stock = store.getAllStock();
	const ready = readyToCraft(stock);

	const craftRows = ready.length ? ready.map(entry => {
		const recipe = recipes[entry.item] || {};
		const ingredients = Object.entries(recipe)
			.map(([ing, per]) => {
				const have = stock[ing] || 0;
				const want = per * entry.suggested;
				return `<span class="${have < want ? 'short' : ''}">${esc(ing)} ×${num(want)}</span>`;
			}).join(' &middot; ');
		return `<div class="mf-craft" data-mf-craft="${esc(entry.item)}">
			${iconHTML(entry.item)}
			<div>
				<div class="mf-line-name">${esc(entry.item)}</div>
				<div class="mf-ingredients">${ingredients}</div>
			</div>
			<div class="mf-target-actions">
				<input class="mf-qty" type="number" min="1" max="${entry.possible}" value="${entry.suggested}" data-mf-craft-qty aria-label="How many">
				<button class="mf-btn" data-mf-do-craft>Craft</button>
			</div>
		</div>`;
	}).join('') : '<p class="mf-empty">Nothing can be made from what is on hand right now.</p>';

	// Enhancement steps: parts a build wants at a level above what you own.
	const wanted = new Map();
	for (const item of Object.keys(latest.toCraft)) {
		const { level, base } = parseEnhanced(item);
		if (level > 0) wanted.set(base, Math.max(wanted.get(base) || 0, level));
	}

	const enhanceRows = [...wanted.entries()].map(([base, target]) => {
		const have = ownedLevel(base, stock);
		if (have >= target) return '';
		const step = enhanceStep(base, have + 1);
		if (!step) return '';
		const affordable = Object.entries(step.stones).every(([s, q]) => (stock[s] || 0) >= q);
		const holdsPart = (stock[step.from] || 0) > 0;
		const cost = Object.entries(step.stones)
			.map(([s, q]) => `${esc(s)} ×${num(q)}`).join(', ');
		return `<div class="mf-craft" data-mf-enhance="${esc(base)}" data-mf-level="${have + 1}">
			${iconHTML(enhancedName(base, have))}
			<div>
				<div class="mf-line-name">${esc(base)}</div>
				<div class="mf-ingredients">
					+${have} → +${have + 1} (target +${target}) &middot;
					<span class="${affordable ? '' : 'short'}">${cost}</span>
					${holdsPart ? '' : ' &middot; <span class="short">you do not own the part yet</span>'}
				</div>
			</div>
			<div class="mf-target-actions">
				<button class="mf-btn ok" data-mf-enhance-result="success" ${affordable && holdsPart ? '' : 'disabled'}>Succeeded</button>
				<button class="mf-btn bad" data-mf-enhance-result="fail" ${affordable ? '' : 'disabled'}>Failed</button>
			</div>
		</div>`;
	}).filter(Boolean).join('');

	return `<div class="mf-panel">
		<div class="mf-panel-head">
			<h2 class="mf-panel-title">Ready to craft</h2>
			<p class="mf-panel-note">Crafting moves real stock: ingredients out, product in</p>
		</div>
		${craftRows}
	</div>
	<div class="mf-panel">
		<div class="mf-panel-head">
			<h2 class="mf-panel-title">Enhancement</h2>
			<p class="mf-panel-note">Ship parts keep their level on a failed attempt, so record what happened</p>
		</div>
		${enhanceRows || '<p class="mf-empty">No enhancement steps pending.</p>'}
	</div>`;
}

/* ------------------------------------------------------------------ *
 * Shopping
 * ------------------------------------------------------------------ */

function barterLookup(item) {
	if (!barterData) return null;
	const entry = barterData.find(b => b.name === item);
	if (!entry || !entry.sources || !entry.sources.length) return null;
	const npcs = [...new Set(entry.sources.map(s => s.npc_name))];
	const gives = [...new Set(entry.sources.map(s => s.give && s.give.name).filter(Boolean))];
	return { npcs, gives };
}

function renderShopping() {
	const groups = shoppingList(latest.missing, {
		coins,
		silver: falasi,
		acquisition: vendorItems,
		barter: barterData ? barterLookup : null
	});

	if (!groups.length) {
		return '<div class="mf-panel"><p class="mf-empty">Nothing outstanding — everything your builds need is on hand.</p></div>';
	}

	const totalCoins = groups.reduce((sum, g) => sum + g.coins, 0);
	const totalSilver = groups.reduce((sum, g) => sum + g.silver, 0);

	const summary = `<div class="mf-panel">
		<div class="mf-panel-head">
			<h2 class="mf-panel-title">Still to get</h2>
			<button class="mf-btn ghost" data-mf-copy>Copy list</button>
		</div>
		<dl class="mf-kv">
			<div class="mf-kv-row"><dt>Crow Coins</dt><dd>${num(totalCoins)}</dd></div>
			<div class="mf-kv-row"><dt>Silver</dt><dd>${num(totalSilver)}</dd></div>
		</dl>
	</div>`;

	const body = groups.map(group => `<div class="mf-group">
		<div class="mf-group-head">
			<span class="mf-group-name">${esc(group.key)}</span>
			<span class="mf-group-total">
				${group.coins ? num(group.coins) + ' coins' : ''}
				${group.silver ? num(group.silver) + ' silver' : ''}
				${!group.coins && !group.silver ? group.items.length + ' items' : ''}
			</span>
		</div>
		${group.items.map(entry => {
			let sub = entry.unit || entry.detail || '';
			if (entry.barter) {
				const trade = `barter from ${entry.barter.npcs.length} NPCs for ${entry.barter.gives.slice(0, 2).join(' / ')}`;
				sub = sub ? `${sub} · ${trade}` : trade;
			}
			return `<div class="mf-line">
				${iconHTML(entry.item)}
				<div>
					<div class="mf-line-name">${esc(entry.item)}</div>
					${sub ? `<div class="mf-line-sub">${esc(sub)}</div>` : ''}
				</div>
				<div class="mf-line-qty">${num(entry.qty)}</div>
			</div>`;
		}).join('')}
	</div>`).join('');

	return summary + `<div class="mf-panel">${body}</div>`;
}

function shoppingText() {
	return Object.entries(latest.missing)
		.filter(([, q]) => q > 0)
		.sort((a, b) => b[1] - a[1])
		.map(([item, q]) => `${item} x${Math.round(q)}`)
		.join('\n');
}

/* ------------------------------------------------------------------ *
 * Rendering / view switching
 * ------------------------------------------------------------------ */

function renderNav() {
	const stock = store.getAllStock();
	const counts = {
		targets: store.getTargets().length,
		inventory: Object.keys(stock).length,
		workshop: readyToCraft(stock).length,
		shopping: Object.keys(latest.missing).length
	};
	return VIEWS.map(v => {
		const count = counts[v.id];
		return `<button class="mf-tab ${current === v.id ? 'active' : ''}" data-mf-view="${v.id}">
			${v.label}${count ? `<span class="mf-tab-count">${count}</span>` : ''}
		</button>`;
	}).join('') +
	'<span class="mf-nav-spacer"></span>' +
	`<button class="mf-undo" data-mf-undo ${store.canUndo() ? '' : 'disabled'}>↩ Undo</button>` +
	'<button class="mf-undo" data-mf-export>Export</button>' +
	'<button class="mf-undo" data-mf-import>Import</button>';
}

export function render() {
	if (!root) return;
	recompute();

	document.getElementById('mf-nav').innerHTML = renderNav();

	const showPlan = current === 'plan';
	for (const sel of PLAN_SELECTORS) {
		document.querySelectorAll(sel).forEach(el => {
			el.style.display = showPlan ? '' : 'none';
		});
	}

	const body = document.getElementById('mf-body');
	body.style.display = showPlan ? 'none' : '';
	if (showPlan) return;

	if (current === 'targets') body.innerHTML = renderTargets();
	else if (current === 'inventory') body.innerHTML = renderInventory();
	else if (current === 'workshop') body.innerHTML = renderWorkshop();
	else if (current === 'shopping') body.innerHTML = renderShopping();
}

async function switchView(id) {
	current = id;
	store.setSetting('view', id);

	// The barter dataset is large, so it only loads if this view is opened.
	if (id === 'shopping' && !barterData) {
		try {
			const mod = await import('./all_barter.js');
			barterData = mod.shipbarters;
		} catch (err) {
			console.warn('[manifest] barter data unavailable:', err);
			barterData = [];
		}
	}
	render();
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

function targetIdFor(el) {
	const row = el.closest('[data-mf-target]');
	return row ? row.getAttribute('data-mf-target') : null;
}

function wireEvents() {
	// Bound to the document rather than the views container: the body is
	// moved next to the original materials section so the Plan view keeps
	// its layout, which puts it outside #mf-root.
	document.addEventListener('click', async evt => {
		const el = evt.target.closest('button');
		if (!el) return;

		if (el.dataset.mfView) return switchView(el.dataset.mfView);

		if (el.hasAttribute('data-mf-undo')) {
			const label = store.undo();
			if (label) toast(`Reverted: ${label}`, false);
			return;
		}

		if (el.hasAttribute('data-mf-export')) return doExport();
		if (el.hasAttribute('data-mf-import')) return doImport();
		if (el.hasAttribute('data-mf-add-target')) return openPicker();

		if (el.hasAttribute('data-mf-copy')) {
			try {
				await navigator.clipboard.writeText(shoppingText());
				toast('Shopping list copied', false);
			} catch {
				toast('Could not reach the clipboard', false);
			}
			return;
		}

		// Builds
		const targetId = targetIdFor(el);
		if (targetId) {
			if (el.dataset.mfMove) store.moveTarget(targetId, Number(el.dataset.mfMove));
			else if (el.hasAttribute('data-mf-pause')) store.toggleTarget(targetId);
			else if (el.hasAttribute('data-mf-remove')) store.removeTarget(targetId);
			return;
		}

		// Inventory
		if (el.dataset.mfItem) {
			selectedItem = el.dataset.mfItem;
			return render();
		}
		if (el.dataset.mfFilter) {
			inventoryFilter = el.dataset.mfFilter;
			return render();
		}
		if (el.dataset.mfStrategy && selectedItem) {
			store.setStrategy(selectedItem, el.dataset.mfStrategy);
			return;
		}
		if (el.dataset.mfStep && selectedItem) {
			store.addStock(selectedItem, Number(el.dataset.mfStep));
			return;
		}

		// Workshop
		if (el.hasAttribute('data-mf-do-craft')) {
			const row = el.closest('[data-mf-craft]');
			const item = row.getAttribute('data-mf-craft');
			const qty = Math.max(1, Number(row.querySelector('[data-mf-craft-qty]').value) || 1);
			const possible = maxCraftable(item, store.getAllStock());
			const times = Math.min(qty, possible);
			if (times < 1) return toast('Not enough materials for that', false);
			store.applyDelta(craftDelta(item, times), 'craft', `Crafted ${times} × ${item}`);
			toast(`Crafted ${times} × ${item}`);
			return;
		}

		if (el.dataset.mfEnhanceResult) {
			const row = el.closest('[data-mf-enhance]');
			const base = row.getAttribute('data-mf-enhance');
			const level = Number(row.getAttribute('data-mf-level'));
			const step = enhanceStep(base, level);
			if (!step) return;
			const success = el.dataset.mfEnhanceResult === 'success';
			store.applyDelta(
				success ? step.onSuccess : step.onFailure,
				'enhance',
				success ? `${base} reached +${level}` : `Failed attempt at +${level} ${base}`
			);
			toast(success ? `${base} is now +${level}` : `Stones spent, ${base} kept its level`);
		}
	});

	document.addEventListener('change', evt => {
		const el = evt.target;
		if (el.hasAttribute('data-mf-target-qty')) {
			const id = targetIdFor(el);
			if (id) store.setTargetQty(id, el.value);
		} else if (el.hasAttribute('data-mf-own') && selectedItem) {
			store.setStock(selectedItem, el.value);
		}
	});

	document.addEventListener('input', evt => {
		if (evt.target.hasAttribute('data-mf-search')) {
			inventorySearch = evt.target.value;
			const pos = evt.target.selectionStart;
			render();
			const next = document.querySelector('[data-mf-search]');
			if (next) {
				next.focus();
				next.setSelectionRange(pos, pos);
			}
		}
	});
}

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

function dialog(html) {
	const host = document.createElement('div');
	host.className = 'mf-dialog';
	host.innerHTML = `<div class="mf-dialog-box">${html}</div>`;
	host.addEventListener('click', evt => {
		if (evt.target === host || evt.target.hasAttribute('data-mf-close')) host.remove();
	});
	document.body.appendChild(host);
	return host;
}

function openPicker() {
	const host = dialog(`
		<h3>Track a new build</h3>
		<p>Anything with a recipe can be a build — a ship, a part, or a pile of materials.</p>
		<input class="mf-search" type="search" placeholder="Search…" data-mf-picker-search style="width:100%;margin-bottom:10px">
		<div class="mf-picker" data-mf-picker></div>
		<div class="mf-dialog-actions"><button class="mf-btn ghost" data-mf-close>Cancel</button></div>
	`);

	const listEl = host.querySelector('[data-mf-picker]');
	const searchEl = host.querySelector('[data-mf-picker-search]');
	const paint = term => {
		const t = (term || '').toLowerCase();
		listEl.innerHTML = craftableItems()
			.filter(n => !t || n.toLowerCase().includes(t))
			.slice(0, 120)
			.map(n => `<button type="button" class="mf-picker-row" data-mf-pick="${esc(n)}">
				${iconHTML(n)}<span>${esc(n)}</span><span class="mf-line-sub">add</span>
			</button>`).join('') || '<p class="mf-empty">Nothing matches.</p>';
	};
	paint('');
	searchEl.addEventListener('input', () => paint(searchEl.value));
	listEl.addEventListener('click', evt => {
		const btn = evt.target.closest('[data-mf-pick]');
		if (!btn) return;
		store.addTarget(btn.getAttribute('data-mf-pick'), 1);
		host.remove();
		toast('Build added', false);
	});
	searchEl.focus();
}

function doExport() {
	const blob = new Blob([store.exportJSON()], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'bdo-tracker.json';
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
			toast(err.message, false);
		}
	});
	input.click();
}

/** Offer to bring the pre-inventory per-ship progress across, once. */
function offerLegacyImport() {
	if (store.hasImportedLegacy()) return;

	const shipNames = shipGroups.flatMap(g => g.items);
	const known = new Set();
	for (const [product, recipe] of Object.entries(recipes)) {
		known.add(product);
		Object.keys(recipe).forEach(i => known.add(i));
	}
	Object.keys(vendorItems).forEach(i => known.add(i));

	const legacy = store.readLegacyData(shipNames, [...known]);
	if (!legacy || !Object.keys(legacy.stock).length) {
		store.markLegacyImported();
		return;
	}

	const rows = Object.entries(legacy.stock)
		.sort((a, b) => b[1] - a[1])
		.map(([item, qty]) => `<div class="mf-dialog-row"><span>${esc(item)}</span><b>${num(qty)}</b></div>`)
		.join('');

	const host = dialog(`
		<h3>Bring your progress across?</h3>
		<p>Your old per-ship counts can become one shared inventory. Because the same material was counted separately for each ship, the highest count found is used rather than the sum — so this may under-count, and you can correct anything afterwards in the Inventory view.</p>
		<div class="mf-dialog-list">${rows}</div>
		<p>${legacy.keys} saved values across ${legacy.ships.length} ships. Your old data is left untouched either way.</p>
		<div class="mf-dialog-actions">
			<button class="mf-btn ghost" data-mf-skip>Start fresh</button>
			<button class="mf-btn" data-mf-accept>Import it</button>
		</div>
	`);

	host.querySelector('[data-mf-skip]').addEventListener('click', () => {
		store.markLegacyImported();
		host.remove();
		render();
	});
	host.querySelector('[data-mf-accept]').addEventListener('click', () => {
		store.applyLegacyImport(legacy.stock, legacy.ships);
		host.remove();
		toast(`Imported ${Object.keys(legacy.stock).length} items`, false);
	});
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

export function init() {
	if (root) return;

	const header = document.querySelector('.app-header');
	const container = document.querySelector('.app-container');
	if (!container) return;

	root = document.createElement('div');
	root.id = 'mf-root';
	root.innerHTML = '<div class="mf-nav" id="mf-nav"></div><div id="mf-body" style="display:none"></div>';

	if (header && header.nextSibling) container.insertBefore(root, header.nextSibling);
	else container.appendChild(root);

	// Keep the views container after the original per-ship section so the
	// Plan view keeps its existing layout.
	const body = document.getElementById('mf-body');
	const materials = document.getElementById('materials-section');
	if (materials && materials.parentNode) {
		materials.parentNode.insertBefore(body, materials.nextSibling);
	}

	wireEvents();
	store.subscribe(() => render());

	const saved = store.getSetting('view');
	if (saved && VIEWS.some(v => v.id === saved)) current = saved;

	render();
	offerLegacyImport();
}

export function getPlan() {
	return latest;
}
