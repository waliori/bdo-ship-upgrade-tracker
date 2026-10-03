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

import fs from 'node:fs';
import { fetch } from 'undici';
import { perAddress } from './limit.js';
import { wrap } from './wrap.js';
import { items as vendorItems } from '../js/vendor_items.js';
import { landGoods } from '../js/land_goods.js';

/**
 * The ids the page ever asks the Market about -- js/market.js's
 * marketItems(), worked out here the same way: what the vendors list as
 * bought at the Market, by the codex id in its icon's entry, and the
 * land goods. Anything else is not the app asking, and is not relayed:
 * four hundred made-up ids were four hundred upstream calls.
 */
export const KNOWN_IDS = (() => {
	const out = new Set();
	try {
		const icons = JSON.parse(fs.readFileSync(new URL('../icon_mapping.json', import.meta.url), 'utf8'));
		for (const [item, methods] of Object.entries(vendorItems)) {
			if (!methods.Market) continue;
			const m = icons[item] && /\/item\/(\d+)\//.exec(icons[item].url || '');
			if (m) out.add(Number(m[1]));
		}
	} catch { /* no icon table: the land goods alone */ }
	for (const id of Object.values(landGoods)) if (id > 0) out.add(Number(id));
	return out;
})();

export const REGIONS = ['na', 'eu', 'sea', 'mena', 'kr', 'ru', 'jp', 'th', 'tw', 'sa', 'console_eu', 'console_na', 'console_asia'];
// What a request that names no region is taken to mean. The page always
// names one -- js/market.js has the same default and is the copy that
// matters -- so this is only for a bare /api/market by hand.
export const DEFAULT_REGION = 'na';
const UPSTREAM = 'https://api.arsha.io/v2';
const FRESH_MS = 15 * 60 * 1000;
const KEEP_MS = 24 * 60 * 60 * 1000;
// Ten ids a request. Forty was the old size, until (checked 2026-10-02)
// api.arsha.io refused every forty-id batch for na and eu with its
// "probably blocked by Imperva" 500 while ten-id batches of the very same
// ids answered first time -- the relay priced nothing at forty. Ten
// answered then; a batch refused anyway is split (see askSplit).
const BATCH = 10;
/** How many extra requests splitting refused batches may cost one relay
 *  call. A region refused outright would otherwise split every batch
 *  down to single ids; past this the rest go to the second source. */
const SPLIT_BUDGET = 30;
const MAX_IDS = 400;
const TIMEOUT_MS = 12_000;
/** The most one relay call spends asking upstream altogether. Ten
 *  batches, each retried three times and then asked of the second
 *  source id by id, ran to nearly four minutes on a bad night; past
 *  this the rest are answered from the copy held, stale and said so. */
const DEADLINE_MS = 25_000;

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
			if (!res.ok) throw refusal(`upstream ${res.status}`, res.status >= 500);
			const body = await res.json();
			// The relay can also say it was blocked in a body of its own.
			if (body && !Array.isArray(body) && Number(body.status) >= 500) throw refusal(String(body.message || 'upstream refused'), true);
			// One id comes back as an object, several as an array.
			const rows = Array.isArray(body) ? body : [body];
			return rows.map(reduce).filter(Boolean);
		} catch (err) {
			// A refused batch of several is not asked again at the same
			// size: the caller splits it, and that is its retry.
			if (attempt >= tries || (err.refused && ids.length > 1)) throw err;
			await wait(400 * attempt);
		}
	}
}

function refusal(message, refused) {
	const err = new Error(message);
	err.refused = refused;
	return err;
}

/**
 * Ask for a batch, and when the upstream refuses it, ask for each half --
 * down to single ids. The refusal comes in two kinds and halving answers
 * both: a batch too big for the upstream's own upstream that day, and one
 * id it chokes on, which would otherwise take the other nine down with it.
 * Returns the rows answered and the ids nobody answered, for the second
 * source. Each split is a request, so they come a breath apart and stop at
 * the budget or the deadline.
 */
async function askSplit(region, ids, fetchImpl, { late, budget }) {
	try {
		return { rows: await askUpstream(region, ids, fetchImpl, ids.length > 1 ? 3 : 2), missed: [] };
	} catch (err) {
		if (!err.refused || ids.length < 2 || late() || budget.left < 2) return { rows: [], missed: ids };
		budget.left -= 2;
		const mid = Math.ceil(ids.length / 2);
		await wait(150);
		const a = await askSplit(region, ids.slice(0, mid), fetchImpl, { late, budget });
		await wait(150);
		const b = await askSplit(region, ids.slice(mid), fetchImpl, { late, budget });
		return { rows: [...a.rows, ...b.rows], missed: [...a.missed, ...b.missed] };
	}
}

/**
 * Prices for `ids` in `region`: fresh ones from memory, the rest from
 * upstream, and anything upstream would not answer from whatever older
 * copy is still held. Never throws for an upstream failure.
 */
export async function pricesFor(region, ids, { fetchImpl = fetch, now = Date.now(), deadline = DEADLINE_MS } = {}) {
	const started = Date.now();
	const late = () => Date.now() - started > deadline;
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
	const budget = { left: SPLIT_BUDGET };
	for (let i = 0; i < want.length; i += BATCH) {
		const batch = want.slice(i, i + BATCH);
		const { rows, missed } = late() ? { rows: [], missed: batch } : await askSplit(region, batch, fetchImpl, { late, budget });
		for (const row of rows) {
			held.set(row.id, { price: row, at: now });
			out[row.id] = { ...row, at: now };
		}
		if (missed.length) {
			// The first source would not answer these, even split. Before
			// giving them up for stale, ask the second one -- when the
			// region is one it covers, this is the difference between a
			// priced list and an unpriced one.
			let saved = 0;
			try {
				for (const row of late() ? [] : await askFallback(region, missed, fetchImpl)) {
					held.set(row.id, { price: row, at: now });
					out[row.id] = { ...row, at: now };
					saved++;
				}
			} catch {
				/* then the batch is as failed as it already was */
			}
			if (saved) fellBack = true;
			failed += missed.length - saved;
		}
		// A breath between batches, so a burst of them is not what trips
		// the upstream's limit.
		if (i + BATCH < want.length && !late()) await wait(120);
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

/* ------------------------------------------------------------------ *
 * The recorded Market, for tests
 * ------------------------------------------------------------------ */

// The UI tests plan barter runs against Market prices and stock, and the
// live Market moves by the hour -- so a test that passed in the morning
// could fail by evening for no fault of the app. With MARKET_FIXTURE set
// to a recorded answer (test/fixtures/market.json), the route answers
// from it and never touches the network. Only test files set it; with it
// unset nothing here runs and the relay is exactly what it was.
//
// The file is { recorded, regions: { na: { [id]: { price, base, stock,
// soldAt } } } }. Every answer is stamped as fresh, so the page treats it
// as it would a price fetched this minute; an id or region the recording
// lacks is counted as failed, as an upstream that would not answer is.
function fixturePrices(file) {
	// A test names it by `new URL(..., import.meta.url).href`, so a file:
	// address is taken as well as a plain path.
	const where = String(file).startsWith('file:') ? new URL(file) : file;
	const table = JSON.parse(fs.readFileSync(where, 'utf8')).regions || {};
	return async (region, ids) => {
		const now = Date.now();
		const rows = table[region] || {};
		const prices = {};
		for (const id of ids) if (rows[id]) prices[id] = { id, ...rows[id], at: now };
		return { prices, failed: ids.length - Object.keys(prices).length, fellBack: false };
	};
}

/** The route: GET /api/market?region=eu&ids=4064,5828 */
export function marketRoutes(express, deps = {}) {
	const router = express.Router();
	const known = deps.known || KNOWN_IDS;
	const fixture = deps.fixture ?? process.env.MARKET_FIXTURE;
	const ask = fixture ? fixturePrices(fixture) : (region, ids) => pricesFor(region, ids, deps);
	// Two pages asking the same region at once share one trip upstream.
	const inflight = new Map();   // region|ids -> promise
	// The page asks once a region per quarter hour and the relay answers
	// from memory for the rest, so a browser behaving itself needs a
	// handful of calls an hour. Each call may fan out to ten upstream
	// batches, which is why the process-wide ceiling is the low one: it
	// caps what this deployment can ask of the upstream in a minute,
	// whoever is asking.
	router.get('/market', perAddress(30, 120, 'The Market has been asked a lot just now; try again shortly.'), wrap(async (req, res) => {
		res.set('Cache-Control', 'no-store');
		const region = String(req.query.region || DEFAULT_REGION).toLowerCase();
		if (!REGIONS.includes(region)) return res.status(400).json({ error: 'That is not a region the Market has.' });
		const ids = [...new Set(String(req.query.ids || '')
			.split(',')
			.map(s => Number(s.trim()))
			.filter(n => Number.isInteger(n) && n > 0 && (!known.size || known.has(n))))].sort((a, b) => a - b).slice(0, MAX_IDS);
		if (!ids.length) return res.status(400).json({ error: 'No item ids asked for.' });
		const key = `${region}|${ids.join(',')}`;
		let asking = inflight.get(key);
		if (!asking) {
			asking = ask(region, ids).finally(() => inflight.delete(key));
			inflight.set(key, asking);
		}
		const { prices, failed, fellBack } = await asking;
		// `fellBack` says these are base prices from the second source
		// rather than last-sold from the first, so the page can be
		// straight about it instead of quietly showing a different number.
		res.json({ region, at: Date.now(), prices, failed, fellBack });
	}));
	return router;
}
