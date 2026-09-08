// The interface's shared vocabulary: icons, linked names, ingredient
// lines, priced costs, the hover card's body. Every screen builds its
// HTML out of these, so they live below the screens and above the data.

import { shipGroups } from './ships.js';
import { items as vendorItems, bulkExchanges } from './vendor_items.js';
import { coins } from './sea_coins.js';
import { falasi } from './falasi_vendor.js';
import { marketSilver, marketPrice, marketStatus } from './market.js';
import { statsAt, describeStats } from './part_stats.js';
import { forecast as barterForecast, GOODS, levelOf } from './barter.js';
import { tradeGoodNames } from './trade_goods.js';
import { iconLoader } from './icon-loader.js';
import { esc, F, FC } from './fmt.js';
import * as store from './state.js';
import { parseEnhanced, enhanceStep, waysToGet, outstanding, yieldOf } from './planner.js';
import { quests } from './quests.js';
import { monsters } from './sea_monsters.js';
import { recipes, barterData, barterProfile, snapshot } from './ui-state.js';

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

/**
 * Any quantity in the app that you can set is one of these: type into it
 * directly ("4k", "12,000") or nudge it with the buttons beside it.
 */
export const amountInput = (cls, value, attrs) =>
	`<input class="amt ${cls}" type="text" inputmode="numeric" autocomplete="off" value="${F(value)}" ${attrs}>`;


export function iconSrc(name) {
	let info;
	try {
		info = iconLoader.getIconInfo(name) || iconLoader.getIconInfo(parseEnhanced(name).base);
	} catch {
		info = null;
	}
	return info && info.filename ? `icons/${info.filename}` : 'icon.png';
}

// Not lazy: a render replaces the whole screen, and a lazy icon below
// the fold is fetched and decoded again on every one, so the rows
// flash empty and fill in. The icons are small, served from the
// service worker's cache, and decoded in the same frame as the row.
export const img = (name, cls = 'row-icon') =>
	`<img class="${cls}" src="${esc(iconSrc(name))}" alt="" decoding="sync">`;

/**
 * BDOCodex has a page for every item in the game, and the icon mapping
 * already carries the URL beside the picture -- so linking a name to the
 * game's own reference costs nothing but the anchor. An enhancement
 * level shares its base item's page, which is where the level table
 * lives anyway.
 */
export function codexUrl(item) {
	let info;
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
/** BDOCodex locale codes the look-ups can open in. */
export const CODEX_LANGS = [
	['us', 'English'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['pt', 'Português'],
	['ru', 'Русский'], ['tr', 'Türkçe'], ['jp', '日本語'], ['kr', '한국어'], ['tw', '繁體中文'], ['th', 'ไทย'], ['id', 'Bahasa Indonesia']
];

/** The same codex page in the language the player chose. */
export function localiseCodex(url) {
	const lang = store.getSetting('codexLang', 'us');
	if (!url || !lang || lang === 'us' || !CODEX_LANGS.some(([id]) => id === lang)) return url;
	return url.replace('bdocodex.com/us/', `bdocodex.com/${lang}/`);
}

export function codexName(item, text = item) {
	const url = localiseCodex(codexUrl(item));
	if (!url) return esc(text);
	return `<a class="codex" href="${esc(url)}" target="_blank" rel="noopener noreferrer" data-codex
		title="Look up ${esc(item)} on BDOCodex">${esc(text)}<span class="codex-mark" aria-hidden="true">\u2197</span></a>`;
}

export function allItems() {
	const set = new Set();
	for (const [product, recipe] of Object.entries(recipes)) {
		set.add(product);
		Object.keys(recipe).forEach(i => set.add(i));
	}
	Object.keys(vendorItems).forEach(i => set.add(i));
	Object.keys(coins).forEach(i => set.add(i));
	// The sea trade goods: in no recipe, sold by no vendor, but held
	// between runs and handed over on the next one.
	tradeGoodNames.forEach(i => set.add(i));
	return [...set];
}

/**
 * The names a search box should offer, for a query.
 *
 * Every ship part exists at eleven levels, and each one is its own row
 * in the recipe tables -- so of the 938 names allItems() knows, 720 are
 * "+N something" belonging to only 72 parts. Offering all of them turns
 * "toro sail" into eleven near-identical lines, alphabetically sorted,
 * so "+10" lands second and the plain part is last.
 *
 * A level is only worth offering when it is real for this player: one
 * they hold, one a build is waiting on, or one they have named
 * themselves by typing a level into the box. Everything else collapses
 * to the bare part, which is what someone searching a name means.
 * Nothing becomes unreachable -- typing "+7" brings +7 back.
 *
 * @param {string[]} names   every name known
 * @param {object}   o
 * @param {string}   [o.query]   what has been typed, so far
 * @param {object}   [o.stock]   item -> how many held
 * @param {object}   [o.needed]  item -> how many a build is still short
 */
export function offerableItems(names, { query = '', stock = {}, needed = {} } = {}) {
	// A level typed into the box is a level asked for: "+7" or "+7 toro".
	if (/\+\s*\d/.test(query)) return names;
	return names.filter(name => {
		const { level } = parseEnhanced(name);
		if (!level) return true;
		return Number(stock[name]) > 0 || Number(needed[name]) > 0;
	});
}

export function buildableItems() {
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
export function ingredientLine(name, per, cls = 'peek-line') {
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
// The Market's prices sit under Falasi's: anything he sells is priced
// off his list, and only what the Market alone sells takes the Market's.
export const costCtx = () => ({ coins, silver: { ...marketSilver(), ...falasi }, recipes, strategy: store.getAllStrategy() });

/**
 * A cost said out loud. Coins and silver stay apart -- the game will not
 * trade one for the other -- and anything the data cannot price is named
 * rather than quietly counted as free.
 */
export function costText(cost, times = 1) {
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
export function makeupHTML(item, cls = 'peek-line') {
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
	const makes = yieldOf(item);
	return `<div class="peek-label">Made from${makes > 1 ? ` · one craft makes ${F(makes)}` : ''}</div>`
		+ Object.entries(recipe).map(([n, q]) => ingredientLine(n, q, cls)).join('');
}

const MAKE_KEYS = new Set(['craft', 'Crafting', 'Processing']);

/**
 * The ladder behind a bartered item, rung by rung.
 *
 * The To Get row can only afford one line, so it says the total and
 * leaves it there. This is where the total is worth taking apart: seeing
 * that a Brilliant Pearl Shard is really a [Level 4] good and change
 * tells you the [Level 4] rung is the one to go and buy, and seeing the
 * land goods at the foot tells you what the whole climb actually starts
 * from -- which is the part nothing in the game ever shows you.
 *
 * Rungs are listed top down, the way you climb them in reverse: what you
 * hand over first is at the bottom.
 */
export function barterHTML(item) {
	if (!barterData) return '';
	const plan = barterForecast(item, 1, barterData, barterProfile());
	if (!plan || plan.gate) return '';

	// Bottom up, which is the order you actually trade them: the land
	// good you buy first is at the top. Quantities are deliberately left
	// off -- per one item they are fractions like 0.03 of a [Level 5],
	// which is true and unreadable. What each rung pays is the number
	// that helps, because a rung paying ten is a rung you stop worrying
	// about.
	const climb = [...plan.rungs].reverse();
	const lines = climb.map(r => `<div class="peek-line ok">
		${img(r.item, 'peek-icon')}
		<span class="peek-name">${codexName(r.item)}</span>
		<span class="peek-have">pays ${esc(r.receivedText)}</span>
	</div>`).join('');

	const start = plan.seed
		? `<div class="peek-label">Starting from ${esc(plan.seed.item)}</div>`
		: '';

	return start + lines
		+ `<div class="peek-cost">${esc(plan.perUnit.toFixed(2))} barter trades each</div>`;
}

/** The hover card: what it is made of, or where it comes from. */
export function peekHTML(item) {
	const body = makeupHTML(item) + barterHTML(item);
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

	// A hundred at a time from one item is not a recipe and cannot be
	// one -- the book makes a single unit -- but for the yellow tier it
	// is very often the answer, and it has to be visible wherever the
	// material is, not only where it is short. The card follows the
	// material everywhere; the To Get row never sees these three,
	// because the planner resolves them into their ingredients first.
	const bulk = bulkExchanges[item];
	const inBulk = bulk
		? `<div class="peek-cost">or ${F(bulk.gets)} at once for one ${esc(bulk.give)}</div>`
		: '';

	// A part says what it does for the hull at this level: the reason
	// for the stones above it.
	const lv = parseEnhanced(item);
	const fit = statsAt(lv.base, lv.level);
	const does = fit ? `<div class="peek-cost">at +${lv.level}: ${esc(describeStats(fit, { signed: false }))}</div>` : '';

	if (!body && !foot && !price && !inBulk && !does) return '';
	return `<div class="peek-head">${img(item, 'peek-icon lg')}<span>${esc(item)}</span></div>`
		+ body
		+ price
		+ inBulk
		+ does
		+ (foot ? `<div class="peek-foot">${esc(foot)}</div>` : '')
		+ `<button class="peek-open" data-act="open-item" data-item="${esc(item)}">Open in Inventory →</button>`;
}

/** Where an item comes from, and what it costs. */
export function sourceOf(item) {
	const lv = levelOf(item);
	if (lv && GOODS[lv]) {
		const g = GOODS[lv];
		return { key: 'barter', label: 'Bartered at sea',
			detail: `a [Level ${lv}] trade good \u00b7 ${F(g.weight)} LT each${g.sell ? ` \u00b7 a barterer pays ${F(g.sell)} silver` : ' \u00b7 cannot be sold'}` };
	}
	if (coins[item]) return { key: 'coin', label: SOURCE_LABEL.coin, detail: `${F(coins[item])} Crow Coins each`, coins: coins[item] };
	if (falasi[item]) return { key: 'falasi', label: SOURCE_LABEL.falasi, detail: `${F(falasi[item])} silver each`, silver: falasi[item] };
	const methods = vendorItems[item];
	if (methods) {
		const key = Object.keys(methods)[0];
		const price = methods.Market ? marketPrice(item) : 0;
		if (price) {
			const s = marketStatus();
			return { key: 'Market', label: SOURCE_LABEL.Market,
				detail: `about ${F(price)} silver each on the ${s.region.toUpperCase()} Market`, silver: price };
		}
		return { key, label: SOURCE_LABEL[key] || key, detail: (methods[key] || []).join(', ') };
	}
	if (recipes[item]) return { key: 'craft', label: 'Crafted', detail: 'made from other materials' };
	return null;
}

/** An item is a choice only when it can both be made and be bought. */
export function hasBuyOption(item) {
	if (!recipes[item]) return false;
	if (coins[item] || falasi[item]) return true;
	const m = vendorItems[item];
	return !!(m && (m.Purchase || m.Market));
}

/** " -- Crow Coin Shop", when we know where a part comes from. */
export function whereFrom(item) {
	const src = sourceOf(item);
	return src ? ` — ${src.label}` : '';
}

/* ------------------------------------------------------------------ *
 * where else an item turns up
 * ------------------------------------------------------------------ */

/**
 * What the app knows about one item is spread across nine screens, and
 * for a long time each screen kept its own knowledge to itself: the
 * Inventory panel said what you held and stopped there, and finding out
 * that four quests pay in the thing meant remembering to go and look.
 *
 * These say, in one voice and in one place, which other screens have
 * something to say about this item -- and take you there with the
 * screen already pointed at it. The Map opens on its barterers, Quests
 * on the quests that pay in it, the Tree rooted at it, To Get searched
 * for it. Anything with nothing to say is left out, so a plain material
 * offers two doors and a Carrack part offers six.
 */

/** Which quests pay in this item, fixed reward or pick-one. */
export function questsPaying(item) {
	return quests.filter(q => Object.keys(q.rewards).includes(item)
		|| (q.choice || []).some(c => Object.keys(c).includes(item)));
}

/** The hunting grounds this drops on, where the map knows the water. */
export function groundsFor(item) {
	const drops = (vendorItems[item] && vendorItems[item]['Monster Drop']) || [];
	return [...new Map(drops
		.map(d => monsters.find(m => d.toLowerCase().startsWith(m.name.toLowerCase())))
		.filter(Boolean).map(m => [m.key, m])).values()];
}

/** How many barterers hand this over. */
const barterersFor = item => (barterData || []).filter(b => b.name === item).length;

/** The queued builds whose tree has this item somewhere in it, the
 *  build itself first when the item is one. */
function buildsUsing(item) {
	const has = node => node.item === item || (node.children || []).some(has);
	return ((snapshot && snapshot.targets) || []).filter(t => has(t.tree)).map(t => t.item);
}

/**
 * One door.
 *
 * A door carries no numbers. The sections above it already say what you
 * hold, which quests pay in it and how far short you are, and printing
 * those again beside a door said everything twice -- the Cox artifact's
 * two quests were listed and then counted, in the same panel. So a door
 * is the screen's own name, and a `qualifier` only where the door would
 * be ambiguous without one: which build the Tree would open, which
 * ground the chart would fly to. The sentence a reader might want is on
 * the tooltip, where it costs nothing.
 */
const door = (act, icon, label, why, { qualifier = '', attrs = '' } = {}) =>
	`<button class="door" data-act="${act}" ${attrs} title="${esc(`${label} — ${why}`)}">
		<span class="door-icon" aria-hidden="true">${icon}</span>
		<span class="door-name">${esc(label)}</span>
		${qualifier ? `<span class="door-note">${esc(qualifier)}</span>` : ''}
	</button>`;

/**
 * Every other screen with something to say about this item, as a row of
 * doors through to it.
 *
 * `from` is the screen asking, which is left out of its own row -- the
 * Inventory panel does not offer to open the Inventory.
 */
export function waysThrough(item, { from = '' } = {}) {
	const at = esc(item);
	const has = `data-item="${at}"`;
	const doors = [];

	if (from !== 'inventory') {
		doors.push(door('open-item', '▦', 'Inventory', 'what you hold, and where it is kept', { attrs: has }));
	}

	const barterers = barterersFor(item);
	if (barterers) {
		doors.push(door('goto-map', '⌖', 'Map',
			barterers === 1 ? 'the one barterer who hands it over'
				: `the ${barterers} barterers who hand it over`, { attrs: has }));
	}

	// The ground's name is the door, because which ground it is is the
	// whole answer -- and the chart can be flown to one at a time.
	for (const m of groundsFor(item).slice(0, 2)) {
		doors.push(door('quest-map', '≈', m.name, 'where it swims',
			{ attrs: `data-monster="${esc(m.key)}"` }));
	}

	const pays = questsPaying(item).length;
	if (pays) {
		doors.push(door('goto-quests', '✦', 'Quests',
			pays === 1 ? 'the quest that pays in it' : `the ${pays} quests that pay in it`,
			{ attrs: has }));
	}

	// The Tree is a queued build unfolded, not an item's own recipe, so
	// it can only show something a build actually asks for -- and it
	// has to be told which build. Reservations do not answer that: what
	// a Carrack reserves is the +10 sail, and the plain sail sits under
	// it as one of the things an attempt spends. So the tree itself is
	// the thing to ask.
	const inside = buildsUsing(item);
	if (inside.length && from !== 'tree') {
		const root = inside[0] === item;
		doors.push(door('goto-tree', '⌥', 'Tree',
			root ? 'everything under it'
				: `where it sits under ${inside.join(' and ')}`,
			// Which build, but only when there is a choice to make: the
			// Tree opens one at a time, so with two the door has to say
			// which it means -- and with one the panel's "Reserved by"
			// has already said the same words a line above.
			{ qualifier: inside.length > 1 ? inside[0] : '',
				attrs: `${has} data-build="${esc(inside[0])}"` }));
	}

	const step = parseEnhanced(item).level > 0;
	if ((recipes[item] || step) && from !== 'workshop') {
		doors.push(door('goto-workshop', '⚙', 'Workshop',
			step ? 'attempt the next level' : 'make it from what you hold', { attrs: has }));
	}

	const short = Number((snapshot && snapshot.missing && snapshot.missing[item]) || 0);
	if (short && from !== 'get') {
		doors.push(door('goto-get', '☰', 'To Get', 'the shopping list, priced', { attrs: has }));
	}

	if (!doors.length) return '';
	return `<div class="doors">${doors.join('')}</div>`;
}
