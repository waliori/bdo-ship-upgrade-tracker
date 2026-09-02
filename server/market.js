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
// The upstream is occasionally refused by its own upstream -- and one
// region at a time, not all at once. When that happens a second source
// is asked for the regions it covers (see "The second opinion" below),
// and whatever neither will answer is served from what is still
// remembered, marked stale, rather than as an error: a price from an
// hour ago beats no price.

import { fetch } from 'undici';

export const REGIONS = ['na', 'eu', 'sea', 'mena', 'kr', 'ru', 'jp', 'th', 'tw', 'sa', 'console_eu', 'console_na', 'console_asia'];
// What a request that names no region is taken to mean. The page always
// names one -- js/market.js has the same default and is the copy that
// matters -- so this is only for a bare /api/market by hand.
export const DEFAULT_REGION = 'na';
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

/* ------------------------------------------------------------------ *
 * The second opinion
 * ------------------------------------------------------------------ */

// api.arsha.io does not fail as a whole -- it fails a region at a time,
// because each one is a separate scrape of Pearl Abyss and any of them
// can be the one Imperva is currently refusing. Checked 2026-09-01, na,
// sea, ru, jp, th, sa and both consoles answered normally while eu and
// mena returned the Imperva 500 and kr and tw timed out. eu is this
// app's default, so "the Market is down" was, for most people, "the
// Market is down in the one region we ask about first".
//
// So there is a second source for the two regions it covers. It is a
// different scrape of the same game data behind a different front door,
// which is exactly the property worth having: the two are unlikely to
// be refused in the same minute.
//
// What it cannot do is matter here. It has no last-sold price, so a
// price from it is the base price -- the number the Market itself shows
// as the item's worth -- and it answers one id per request rather than
// forty, which is why it is a fallback and not the first call.
const FALLBACK = 'https://api.blackdesertmarket.com';
const FALLBACK_REGIONS = new Set(['na', 'eu']);
// One id per request, so a failed batch of forty must not become forty
// requests in a burst. Six at a time, and never more than a batch.
const FALLBACK_LANES = 6;

/** One fallback answer, reduced to the same shape as the upstream's. */
function reduceFallback(body, id) {
	const rows = body && body.code === 'SUCCESS' && Array.isArray(body.data) ? body.data : [];
	// An enhanceable item lists a row per level; the tracker buys
	// materials, which are the unenhanced one.
	const row = rows.find(r => Number(r.enhancement) === 0) || rows[0];
	if (!row) return null;
	const base = Number(row.basePrice) || 0;
	if (!base) return null;
	return {
		id: Number(row.id) || id,
		// No last-sold price on this source, so the base price is the
		// price. It is the same number the Market prints on the item.
		price: base,
		base,
		stock: Number(row.count) || 0,
		soldAt: 0
	};
}

/**
 * Ask the second source for whatever the first would not answer.
 *
 * Per-id, so unlike a batch one bad id costs only itself -- some ids
 * come back ERROR_INTERNAL from this source and the rest still arrive.
 * Never throws: a fallback that fails leaves the caller exactly where it
 * already was, with the stale copy it was going to use anyway.
 */
async function askFallback(region, ids, fetchImpl) {
	if (!FALLBACK_REGIONS.has(region)) return [];
	const out = [];
	const queue = [...ids];
	const lane = async () => {
		for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
			try {
				const res = await fetchImpl(`${FALLBACK}/item/${id}?region=${region}`, {
					signal: AbortSignal.timeout(TIMEOUT_MS),
					headers: { accept: 'application/json' }
				});
				if (!res.ok) continue;
				const row = reduceFallback(await res.json(), id);
				if (row) out.push(row);
			} catch {
				// This id simply has no second opinion either.
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(FALLBACK_LANES, ids.length) }, lane));
	return out;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function askUpstream(region, ids, fetchImpl, tries = 3) {
	const url = `${UPSTREAM}/${region}/GetWorldMarketSubList?id=${ids.join(',')}&lang=en`;
	// The upstream is a community relay and has bad minutes -- a 5xx, a
	// rate limit, a socket that never answers. A batch is asked again,
	// a little later, before it is given up on.
	for (let attempt = 1; ; attempt++) {
		try {
			const res = await fetchImpl(url, {
				signal: AbortSignal.timeout(TIMEOUT_MS),
				headers: { accept: 'application/json' }
			});
			if (!res.ok) throw new Error(`upstream ${res.status}`);
			const body = await res.json();
			// One id comes back as an object, several as an array.
			const rows = Array.isArray(body) ? body : [body];
			return rows.map(reduce).filter(Boolean);
		} catch (err) {
			if (attempt >= tries) throw err;
			await wait(400 * attempt);
		}
	}
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
	let fellBack = false;
	for (let i = 0; i < want.length; i += BATCH) {
		const batch = want.slice(i, i + BATCH);
		try {
			for (const row of await askUpstream(region, batch, fetchImpl)) {
				held.set(row.id, { price: row, at: now });
				out[row.id] = { ...row, at: now };
			}
		} catch {
			// The first source would not answer this batch. Before giving
			// it up for stale, ask the second one -- when the region is
			// one it covers, this is the difference between a priced list
			// and an unpriced one.
			let saved = 0;
			try {
				for (const row of await askFallback(region, batch, fetchImpl)) {
					held.set(row.id, { price: row, at: now });
					out[row.id] = { ...row, at: now };
					saved++;
				}
			} catch {
				/* then the batch is as failed as it already was */
			}
			if (saved) fellBack = true;
			failed += batch.length - saved;
		}
		// A breath between batches, so a burst of forty is not what trips
		// the upstream's limit.
		if (i + BATCH < want.length) await wait(120);
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
	return { prices: out, failed, fellBack };
}

/** The route: GET /api/market?region=eu&ids=4064,5828 */
export function marketRoutes(express, deps = {}) {
	const router = express.Router();
	router.get('/market', async (req, res) => {
		res.set('Cache-Control', 'no-store');
		const region = String(req.query.region || DEFAULT_REGION).toLowerCase();
		if (!REGIONS.includes(region)) return res.status(400).json({ error: 'That is not a region the Market has.' });
		const ids = [...new Set(String(req.query.ids || '')
			.split(',')
			.map(s => Number(s.trim()))
			.filter(n => Number.isInteger(n) && n > 0))].slice(0, MAX_IDS);
		if (!ids.length) return res.status(400).json({ error: 'No item ids asked for.' });
		const { prices, failed, fellBack } = await pricesFor(region, ids, deps);
		// `fellBack` says these are base prices from the second source
		// rather than last-sold from the first, so the page can be
		// straight about it instead of quietly showing a different number.
		res.json({ region, at: Date.now(), prices, failed, fellBack });
	});
	return router;
}
