// The Inventory: one tile per thing you own or need, an enhancement
// family rolled up to a single tile, and the detail panel that says who
// reserved it and every priced way of getting more.

import { esc, F } from './fmt.js';
import * as store from './state.js';
import {
	img, codexName, amountInput, costCtx, costText, makeupHTML, barterHTML,
	sourceOf, hasBuyOption, allItems, waysThrough, questsPaying
} from './ui-bits.js';
import { recipes, snapshot, rows, query, invFilter, invKind, selected, sort, sorter, sortSelect, craftStock, invPicking, invPicked } from './ui-state.js';
import { KINDS, kindOf } from './kinds.js';
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
		if (invKind !== 'all' && kindOf(item) !== invKind) return false;
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
		`<button class="chip ${invFilter === id ? 'active' : ''}" data-act="inv-filter" data-id="${id}" aria-pressed="${invFilter === id}">${label}</button>`
	).join('');
	// What sort of thing: a second row, since "the trade goods I hold"
	// and "the materials I am short of" are different questions and the
	// list answers both. A lit kind stays lit across searches.
	const kinds = [['all', 'Everything'], ...KINDS.map(k => [k.id, k.label])].map(([id, label]) =>
		`<button class="chip ${invKind === id ? 'active' : ''}" data-act="inv-kind" data-id="${id}" aria-pressed="${invKind === id}">${label}</button>`
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

	const stashAll = store.getProfile('stash', {}) || {};
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
		// In select mode a tile is ticked, not opened; a family is ticked
		// at the level held, which is the one a storage would take.
		const picked = invPicking && invPicked.has(open);
		const act = invPicking ? 'inv-pick' : 'select';
		return `<button class="tile ${stats.short > 0 ? 'short' : ''} ${isOpen && !invPicking ? 'selected' : ''} ${picked ? 'picked' : ''}" data-act="${act}" data-item="${esc(open)}" data-peek="${esc(stats.at)}" title="${esc(key)}" ${invPicking ? `aria-pressed="${picked}"` : ''}>
			${invPicking ? `<span class="tile-tick">${picked ? '✓' : ''}</span>` : ''}
			${img(stats.at, '')}
			${family && stats.top > 0 ? `<span class="tile-lvl">+${stats.top}</span>` : ''}
			${whereTag(open, stats.own, stashAll)}
			${stats.own === 0 && stats.short > 0
				? `<span class="tile-qty short">${F(stats.short)} short</span>`
				: `<span class="tile-qty">${F(stats.own)}</span>`}
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
				<input class="field" type="search" placeholder="Search items…" value="${esc(query)}" data-act="query" aria-label="Search items">
				<div class="chips">${filters}</div>
				<div class="chips inv-kinds">${kinds}</div>
				${sortSelect()}
				<button class="chip inv-select ${invPicking ? 'active' : ''}" data-act="inv-select" aria-pressed="${invPicking}" title="Tick several tiles and move them to a storage together">${invPicking ? '✓ Selecting' : '☐ Select'}</button>
			</div>
			${homesHTML()}
			${invPicking ? pickBar(shown.filter(k => (stock[k] || 0) > 0 || isEnhanceable(k)).map(k => (isEnhanceable(k) ? familyStats(k).at : k))) : ''}
			${shown.length
				? `<div class="inv-grid">${tiles}</div>`
				: `<div class="panel"><p class="empty">${searching ? 'Nothing matches that search.' : invKind === 'goods' ? 'No trade goods in play — search one to record what is aboard, or log a trip.' : 'Nothing here yet — add a build, or switch to Owned to record what you have.'}</p></div>`}
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

/**
 * Where a tile's count sits, in a word: the one storage holding all of
 * it, "bags" when none is noted, or "split" when it is in more than one
 * place -- enough to spot the good recorded at the wrong harbour.
 */
function whereTag(item, own, stashAll) {
	if (!(own > 0)) return '';
	const places = Object.entries(stashAll[item] || {}).filter(([, n]) => n > 0);
	const placed = places.reduce((a, [, n]) => a + n, 0);
	if (!placed) return '';
	const short = t => t.replace(/^Port |^Ancado | Island$| City$| Harbor$/g, '').replace("Ship's hold", 'hold');
	const at = places.length === 1 && placed >= own ? short(places[0][0]) : 'split';
	const title = places.length === 1 && placed >= own ? `all at ${places[0][0]}` : `${F(Math.max(0, own - placed))} in the bags · ${places.map(([t, n]) => `${F(n)} at ${t}`).join(' · ')}`;
	return `<span class="tile-at ${at === 'split' ? 'split' : ''}" title="${esc(title)}">${esc(at)}</span>`;
}

/**
 * Where new things land: one storage a kind, so a trip's goods are
 * noted at the harbour they are actually kept in without a visit to
 * each one. Folded to a line until it is wanted.
 */
function homesHTML() {
	const homes = store.getProfile('homes', {}) || {};
	const word = k => homes[k.id] || (k.id === 'goods' ? 'the ship' : 'the bags');
	const summary = KINDS.map(k => `${k.label.toLowerCase()} → ${word(k)}`).join(' · ');
	const sel = k => `<label class="inv-home"><span>${esc(k.label)}</span><select class="field select" data-act="inv-home" data-kind="${k.id}" aria-label="Where new ${esc(k.label.toLowerCase())} land"><option value="">${k.id === 'goods' ? 'the ship' : 'the bags'}</option>${TOWNS.filter(t => !(k.id === 'goods' && t === store.ABOARD)).map(t => `<option${homes[k.id] === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
	return `<details class="inv-homes"><summary><span class="inv-homes-k">New things land in</span><span class="inv-homes-v">${esc(summary)}</span></summary>
		<div class="inv-homes-row">${KINDS.map(sel).join('')}<span class="detail-note">A count added from here or a trip is noted at that storage; a count taken away comes off the bags, or the ship for a trade good, first. The Barter tab's hold always works the ship.</span></div>
	</details>`;
}

/** The bar of select mode: what is ticked, and the one thing to do
 *  with it. `shownItems` are the tiles on screen, for "all shown". */
function pickBar(shownItems) {
	const n = invPicked.size;
	const own = [...invPicked].reduce((a, it) => a + store.getStock(it), 0);
	return `<div class="inv-pickbar">
		<span class="inv-pickbar-n"><b>${F(n)}</b> ${n === 1 ? 'item' : 'items'} ticked${n ? ` · ${F(own)} in all` : ''}</span>
		<button class="chip tiny" data-act="inv-pick-all" data-items="${esc(JSON.stringify(shownItems))}">all shown</button>
		<button class="chip tiny" data-act="inv-pick-none" ${n ? '' : 'disabled'}>none</button>
		<span class="panel-spacer"></span>
		<label class="inv-place"><span>move ${n === 1 ? 'it' : 'them all'} to</span>
			<select class="field select" data-act="inv-place" ${n ? '' : 'disabled'} aria-label="Move the ticked items to a storage"><option value="">choose a storage…</option><option value="bags">the bags · the ship, for trade goods</option>${TOWNS.filter(t => t !== store.ABOARD).map(t => `<option>${esc(t)}</option>`).join('')}</select>
		</label>
		<button class="ghost-btn sm" data-act="inv-select">Done</button>
	</div>`;
}

/** The storages a sailor actually uses, for the "where it is" note. */
export const TOWNS = [
	"Ship's hold", 'Velia', 'Port Epheria', 'Iliya Island', 'Olvia', 'Heidel', 'Glish', 'Calpheon City', 'Keplan', 'Trent',
	'Altinova', 'Tarif', 'Valencia City', 'Sand Grain Bazaar', 'Arehaza', 'Ancado Inner Harbor', 'Shakatu', 'Abun', 'Muiquun',
	'Grána', 'Duvencrune', "O'draxxia", 'Eilton', 'Nampo', 'Dalbeol Village', 'Port Ratt', 'Elsewhere'
];

/** Where the item is kept: a line per storage, editable, against the
 *  count owned -- a note, never a second inventory. */
/** Where the item is: your bags, and every storage noted -- the count
 *  owned is their sum, so a number typed at a place moves the total. */
function whereBlock(item, own) {
	const stash = (store.getProfile('stash', {}) || {})[item] || {};
	const placed = Object.values(stash).reduce((a, b) => a + b, 0);
	const bags = Math.max(0, own - placed);
	const line = (town, n, fixed) => `<div class="detail-line where-line">
		<span>${esc(town)}</span>
		<span class="where-edit">${fixed
			? `<span class="n teal" title="What is not at a noted storage is in your bags">${F(n)}</span>`
			: amountInput('where-val', n, `data-act="stash-set" data-item="${esc(item)}" data-town="${esc(town)}" aria-label="How many at ${esc(town)}"`)}
		${fixed ? '' : `<button class="map-x" data-act="stash-del" data-item="${esc(item)}" data-town="${esc(town)}" aria-label="Forget ${esc(town)} — its count goes back to your bags">×</button>`}</span>
	</div>`;
	// A trade good is never in the bags: what no storage claims is
	// aboard, so the fixed line is the ship's hold and the ship is not
	// offered again as a storage.
	const goods = kindOf(item) === 'goods';
	const lines = line(goods ? "Ship's hold (aboard)" : 'Inventory (bags)', bags, true)
		+ Object.entries(stash).sort((a, b) => b[1] - a[1]).map(([town, n]) => line(town, n, false)).join('');
	const options = TOWNS.filter(t => !(t in stash) && !(goods && t === store.ABOARD)).map(t => `<option>${esc(t)}</option>`).join('');
	return `<div class="detail-block">
		<div class="detail-label">Where it is <span class="detail-note">· ${F(own)} in all</span></div>
		${lines}
		<select class="field select where-add" data-act="stash-town" data-item="${esc(item)}" aria-label="Note a storage this is kept in"><option value="">+ a storage…</option>${options}</select>
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
	const most = canCraft ? maxCraftable(item, craftStock(item), recipes) : 0;

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
		${whereBlock(item, own)}
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
		${block('Bartered for', barterHTML(item))}
		${block('Paid by quests', questsPaid(item))}
		${src && src.key !== 'coin' && src.key !== 'falasi'
			? `<div class="detail-src"><span>${esc(src.label)}</span><span>${esc(src.detail)}</span></div>`
			: ''}
		${waysBlock(item)}
		${step ? '<button class="act quiet wide" data-act="view" data-id="workshop">Attempt it in the Workshop</button>' : ''}
		${toggle}
		${canCraft ? `<div class="detail-actions">
			<button class="act" data-act="craft" data-item="${esc(item)}" data-times="1" ${most < 1 ? 'disabled' : ''}>Craft 1</button>
			<button class="act quiet" data-act="craft" data-item="${esc(item)}" data-times="${most}" ${most < 1 ? 'disabled' : ''}>Craft max (${F(most)})</button>
		</div>` : ''}
		${block('Where else it turns up', waysThrough(item, { from: 'inventory' }))}`;
}

/** A labelled block, left out when there is nothing to put in it. */
const block = (label, body) => (body
	? `<div class="detail-block"><div class="detail-label">${esc(label)}</div>${body}</div>` : '');

/** Which quests pay in this, named. The way through to Quests is one of
 *  the doors at the foot of the panel. */
function questsPaid(item) {
	const pays = questsPaying(item);
	if (!pays.length) return '';
	return pays.slice(0, 5).map(q => `<div class="detail-line">
			<span>${esc(q.name)}</span>
			<span class="n">${F(Number(q.rewards[item]) || Number((q.choice || []).map(c => c[item]).find(Boolean)) || 0)}</span>
		</div>`).join('')
		+ (pays.length > 5 ? `<div class="detail-note">and ${pays.length - 5} more</div>` : '');
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
