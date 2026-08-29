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

const KEY = 'bdo-tracker/market';
const STALE_MS = 30 * 60 * 1000;
export const REGIONS = [
	['eu', 'EU'], ['na', 'NA'], ['sea', 'SEA'], ['mena', 'MENA'], ['sa', 'SA'],
	['kr', 'KR'], ['ru', 'RU'], ['jp', 'JP'], ['th', 'TH'], ['tw', 'TW'],
	['console_eu', 'Console EU'], ['console_na', 'Console NA'], ['console_asia', 'Console Asia']
];

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
	const r = store.getSetting('marketRegion', 'eu');
	return REGIONS.some(([id]) => id === r) ? r : 'eu';
}

/** Every item the Market is a source for, with the codex id that names it there. */
export function marketItems() {
	const out = {};
	for (const [item, methods] of Object.entries(vendorItems)) {
		if (!methods.Market) continue;
		const info = iconLoader.getIconInfo ? iconLoader.getIconInfo(item) : null;
		const m = info && info.url && /\/item\/(\d+)\//.exec(info.url);
		if (m) out[item] = Number(m[1]);
	}
	return out;
}

/** The price the plan should use, or 0 when the Market has not said. */
export function marketPrice(item) {
	if (!held || held.region !== region()) return 0;
	const p = held.prices[item];
	return p ? p.price : 0;
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
		// price this time.
		if (held && held.region === body.region) {
			for (const [item, p] of Object.entries(held.prices)) if (!prices[item]) prices[item] = { ...p, stale: true };
		}
		held = { region: body.region, at: body.at || Date.now(), prices, failed: body.failed || 0 };
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
