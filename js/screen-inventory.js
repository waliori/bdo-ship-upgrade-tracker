// The Inventory: one tile per thing you own or need, an enhancement
// family rolled up to a single tile, and the detail panel that says who
// reserved it and every priced way of getting more.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import {
	img, codexName, amountInput, costCtx, costText, makeupHTML,
	sourceOf, hasBuyOption, allItems
} from './ui-bits.js';
import { recipes, snapshot, rows, query, invFilter, selected, barterData, sort, sorter, sortSelect } from './ui-state.js';
import { maxCraftable, enhanceStep, parseEnhanced, enhancedName, waysToGet } from './planner.js';


/**
 * A ship part and its ten enhancement levels are one thing you own, not
 * eleven. These roll them up: the grid shows one tile per part, and the
 * detail panel is where you pick which level you actually have.
 */
export const isEnhanceable = base => !!recipes[`+1 ${base}`];

/** The base name for anything in an enhancement family. */
export function familyOf(item) {
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

export function renderInventory() {
	const stock = store.getAllStock();
	const q = query.toLowerCase();
	const searching = q.length > 0;

	// A search narrows within the chip that is lit, not instead of it --
	// "plank" with Owned selected means the planks you own. Only the
	// default In play widens under a search, so anything at all can be
	// found and recorded.
	const list = allItems().filter(item => {
		if (searching && !item.toLowerCase().includes(q)) return false;
		const r = rows[item];
		if (invFilter === 'owned') return (stock[item] || 0) > 0;
		if (invFilter === 'needed') return !!r && r.need > 0;
		if (invFilter === 'short') return !!r && r.short > 0;
		if (invFilter === 'free') return (snapshot.free[item] || 0) > 0;
		return searching || (stock[item] || 0) > 0 || (r && r.need > 0);
	}).sort(sorter(sort, stock));

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
				${sortSelect()}
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
		${barterData && barterData.some(b => b.name === item)
			? `<div class="detail-block"><button class="act quiet" data-act="goto-map"
				data-item="${esc(item)}">⌖ Where to barter it</button></div>`
			: ''}
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
