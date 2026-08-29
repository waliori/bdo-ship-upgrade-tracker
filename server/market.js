// Central Market prices, fetched for the page so the page need not.
//
// The tracker prices what Falasi and the Crow Coin Shop sell from lists
// that never change. Everything else a build wants from the Market --
// plywood, ingots, saps -- has a price only the Market knows, and it
// moves. The community market API (api.arsha.io) answers for every
// region; this route asks it on the page's behalf, in batches, and
// remembers the answers for a while, so a browser that asks twice in an
// hour costs the upstream one request and a deployment behind a strict
// CSP need not open a hole to a third party.
//
// The upstream is occasionally refused by its own upstream. When that
// happens the answer here is whatever is still remembered, marked stale,
// rather than an error -- a price from an hour ago beats no price.

import { fetch } from 'undici';

export const REGIONS = ['na', 'eu', 'sea', 'mena', 'kr', 'ru', 'jp', 'th', 'tw', 'sa', 'console_eu', 'console_na', 'console_asia'];
const UPSTREAM = 'https://api.arsha.io/v2';
const FRESH_MS = 15 * 60 * 1000;
const KEEP_MS = 24 * 60 * 60 * 1000;
const BATCH = 40;
const MAX_IDS = 400;
const TIMEOUT_MS = 12_000;

// region -> id -> { price, at }
const cache = new Map();

const bucket = region => {
	if (!cache.has(region)) cache.set(region, new Map());
	return cache.get(region);
};

/** One upstream answer, reduced to what the page uses. */
function reduce(row) {
	if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.id))) return null;
	const last = Number(row.lastSoldPrice) || 0;
	const base = Number(row.basePrice) || 0;
	return {
		id: Number(row.id),
		price: last || base,
		base,
		stock: Number(row.currentStock) || 0,
		soldAt: Number(row.lastSoldTime) || 0
	};
}

async function askUpstream(region, ids, fetchImpl) {
	const url = `${UPSTREAM}/${region}/GetWorldMarketSubList?id=${ids.join(',')}&lang=en`;
	const res = await fetchImpl(url, {
		signal: AbortSignal.timeout(TIMEOUT_MS),
		headers: { accept: 'application/json' }
	});
	if (!res.ok) throw new Error(`upstream ${res.status}`);
	const body = await res.json();
	// One id comes back as an object, several as an array.
	const rows = Array.isArray(body) ? body : [body];
	return rows.map(reduce).filter(Boolean);
}

/**
 * Prices for `ids` in `region`: fresh ones from memory, the rest from
 * upstream, and anything upstream would not answer from whatever older
 * copy is still held. Never throws for an upstream failure.
 */
export async function pricesFor(region, ids, { fetchImpl = fetch, now = Date.now() } = {}) {
	const held = bucket(region);
	const out = {};
	const want = [];
	for (const id of ids) {
		const hit = held.get(id);
		if (hit && now - hit.at < FRESH_MS) out[id] = { ...hit.price, at: hit.at };
		else want.push(id);
	}
	let failed = 0;
	for (let i = 0; i < want.length; i += BATCH) {
		const batch = want.slice(i, i + BATCH);
		try {
			for (const row of await askUpstream(region, batch, fetchImpl)) {
				held.set(row.id, { price: row, at: now });
				out[row.id] = { ...row, at: now };
			}
		} catch {
			failed += batch.length;
		}
		for (const id of batch) {
			if (out[id]) continue;
			const old = held.get(id);
			if (old && now - old.at < KEEP_MS) out[id] = { ...old.price, at: old.at, stale: true };
		}
	}
	// Sweep what nobody has asked about in a day, so a long-running
	// process does not keep every id it ever saw.
	if (held.size > 5000) {
		for (const [id, entry] of held) if (now - entry.at > KEEP_MS) held.delete(id);
	}
	return { prices: out, failed };
}

/** The route: GET /api/market?region=eu&ids=4064,5828 */
export function marketRoutes(express, deps = {}) {
	const router = express.Router();
	router.get('/market', async (req, res) => {
		res.set('Cache-Control', 'no-store');
		const region = String(req.query.region || 'eu').toLowerCase();
		if (!REGIONS.includes(region)) return res.status(400).json({ error: 'That is not a region the Market has.' });
		const ids = [...new Set(String(req.query.ids || '')
			.split(',')
			.map(s => Number(s.trim()))
			.filter(n => Number.isInteger(n) && n > 0))].slice(0, MAX_IDS);
		if (!ids.length) return res.status(400).json({ error: 'No item ids asked for.' });
		const { prices, failed } = await pricesFor(region, ids, deps);
		res.json({ region, at: Date.now(), prices, failed });
	});
	return router;
}
