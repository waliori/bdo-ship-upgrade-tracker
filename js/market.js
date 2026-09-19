// Central Market prices for what the Market sells.
//
// Falasi's list and the Crow Coin Shop's are fixed and live in this
// repository. The Market's are not: plywood, ingots and saps cost what
// they cost this week, per region. This asks the server for them (which
// asks the community market API and remembers the answer), keeps the
// last good copy in this browser so the plan is still priced offline,
// and hands the cost model one number per item -- the last sold price,
// which is what a buy order actually pays.
//
// Only items whose source is the Market are ever priced this way; a
// Falasi part or a Crow Coin material keeps its own list price.

import * as store from './state.js';
import { items as vendorItems } from './vendor_items.js';
import { iconLoader } from './icon-loader.js';
import { landGoods } from './land_goods.js';

const KEY = 'bdo-tracker/market';
const STALE_MS = 30 * 60 * 1000;
export const REGIONS = [
	['na', 'NA'], ['eu', 'EU'], ['sea', 'SEA'], ['mena', 'MENA'], ['sa', 'SA'],
	['kr', 'KR'], ['ru', 'RU'], ['jp', 'JP'], ['th', 'TH'], ['tw', 'TW'],
	['console_eu', 'Console EU'], ['console_na', 'Console NA'], ['console_asia', 'Console Asia']
];

/**
 * The region assumed until someone chooses one.
 *
 * NA rather than EU. It decides more than the prices: Vell's timetable
 * and the reminder that goes with it are read from whichever region is
 * standing (see today.js), so this is the one setting that has to be
 * named in a single place -- a default that drifted between the two
 * would price against one server and time Vell against the other.
 *
 * Anyone who has already picked a region keeps it; this is only what a
 * browser that has never been asked starts from.
 */
export const DEFAULT_REGION = 'na';

// { region, at, prices: { [item]: { price, base, stock, at, stale } } }
let held = read();
let loading = null;
let listeners = new Set();

function read() {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
		return raw && typeof raw === 'object' && raw.prices ? raw : null;
	} catch {
		return null;
	}
}

function write() {
	try {
		localStorage.setItem(KEY, JSON.stringify(held));
	} catch {
		/* a full store just means the next load asks again */
	}
}

export function region() {
	const r = store.getSetting('marketRegion', DEFAULT_REGION);
	return REGIONS.some(([id]) => id === r) ? r : DEFAULT_REGION;
}

/** Every item the Market is a source for, with the codex id that names
 *  it there -- and the land goods the barter chains start from, which
 *  the buy list prices the same way. */
export function marketItems() {
	const out = {};
	for (const [item, methods] of Object.entries(vendorItems)) {
		if (!methods.Market) continue;
		const info = iconLoader.getIconInfo ? iconLoader.getIconInfo(item) : null;
		const m = info && info.url && /\/item\/(\d+)\//.exec(info.url);
		if (m) out[item] = Number(m[1]);
	}
	for (const [item, id] of Object.entries(landGoods)) if (id > 0 && !out[item]) out[item] = id;
	return out;
}

/** The price the plan should use, or 0 when the Market has not said. */
export function marketPrice(item) {
	if (!held || held.region !== region()) return 0;
	const p = held.prices[item];
	return p ? p.price : 0;
}

/**
 * How many of an item are listed on the Market right now, or null when
 * the Market has not said. Nought is an answer and null is not: a good
 * with none listed cannot be bought whatever it last sold for, and a
 * good never asked about is simply unknown.
 */
export function marketStock(item) {
	if (!held || held.region !== region()) return null;
	const p = held.prices[item];
	// A figure the upstream would not confirm this time is a price worth
	// keeping and a count worth nothing: stock moves by the minute.
	if (!p || p.stale || p.stock === null || p.stock === undefined || !Number.isFinite(Number(p.stock))) return null;
	return Math.max(0, Math.floor(Number(p.stock)));
}

/** Every priced item as `{ item: silver }`, the shape the cost model takes. */
export function marketSilver() {
	if (!held || held.region !== region()) return {};
	const out = {};
	for (const [item, p] of Object.entries(held.prices)) if (p.price > 0) out[item] = p.price;
	return out;
}

/** When the copy in hand was fetched, and whether it is old enough to ask again. */
export function marketStatus() {
	if (!held || held.region !== region()) return { at: 0, stale: true, count: 0, region: region() };
	const count = Object.keys(held.prices).length;
	return { at: held.at, stale: Date.now() - held.at > STALE_MS, count, region: held.region, failed: held.failed || 0 };
}

export function onMarket(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/**
 * Ask the server for every Market-sourced item's price. Coalesced: one
 * request however many screens ask. Resolves to true when new prices
 * landed, false when the copy in hand (if any) is all there is.
 */
export async function loadMarket({ force = false } = {}) {
	if (loading) return loading;
	const status = marketStatus();
	if (!force && !status.stale) return false;
	loading = (async () => {
		const ids = marketItems();
		const byId = Object.fromEntries(Object.entries(ids).map(([item, id]) => [id, item]));
		const list = Object.values(ids);
		if (!list.length) return false;
		const res = await fetch(`api/market?region=${encodeURIComponent(region())}&ids=${list.join(',')}`);
		if (!res.ok) throw new Error(String(res.status));
		const body = await res.json();
		const prices = {};
		for (const [id, p] of Object.entries(body.prices || {})) {
			const item = byId[id];
			if (item && p && p.price > 0) prices[item] = { price: p.price, base: p.base, stock: p.stock, at: p.at, stale: Boolean(p.stale) };
		}
		// Keep what we already knew for anything the upstream would not
		// price this time -- and when it priced nothing at all, keep the
		// old copy's time too, so the screen says how old the numbers are
		// rather than calling an empty answer fresh.
		const answered = Object.keys(prices).length > 0;
		if (held && held.region === body.region) {
			for (const [item, p] of Object.entries(held.prices)) if (!prices[item]) prices[item] = { ...p, stale: true };
		}
		held = { region: body.region, at: answered ? (body.at || Date.now()) : (held && held.region === body.region ? held.at : 0), prices, failed: body.failed || 0 };
		write();
		for (const fn of listeners) {
			try {
				fn();
			} catch (err) {
				console.error('[market] listener failed:', err);
			}
		}
		return true;
	})().catch(err => {
		console.warn('[market] prices unavailable:', err.message);
		return false;
	}).finally(() => {
		loading = null;
	});
	return loading;
}

/** Change region: forgets nothing, but the next load asks for the new one. */
export function setRegion(id) {
	if (!REGIONS.some(([r]) => r === id)) return;
	store.setSetting('marketRegion', id);
	loadMarket({ force: true });
}

/**
 * How old the prices in hand are, in the words every screen says it
 * with. One phrase in one place, because the region chip in the bar and
 * the item card both report it and they must not disagree.
 */
export function priceAge() {
	const s = marketStatus();
	if (!s.at) return 'no prices yet';
	const ms = Date.now() - s.at;
	const when = ms < 60_000 ? 'just now'
		: ms < 3_600_000 ? `${Math.round(ms / 60_000)} min ago`
		: ms < 86_400_000 ? `${Math.round(ms / 3_600_000)} h ago`
		: `${Math.round(ms / 86_400_000)} d ago`;
	return `${s.count} priced · ${when}${s.failed ? ' · some unanswered' : ''}`;
}
