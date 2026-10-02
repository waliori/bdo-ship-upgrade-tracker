// The Market relay: batches, remembers, and never turns an upstream
// failure into an error the page has to handle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pricesFor, REGIONS } from '../server/market.js';

const row = (id, last, base = last) => ({ id, lastSoldPrice: last, basePrice: base, currentStock: 5, lastSoldTime: 1 });

/** An upstream that answers from a table and counts its calls. */
function upstream(table, { fail = false } = {}) {
	const calls = [];
	const fetchImpl = async url => {
		calls.push(url);
		if (fail) throw new Error('blocked');
		const ids = new URL(url).searchParams.get('id').split(',').map(Number);
		const rows = ids.filter(id => table[id]).map(id => row(id, table[id]));
		return { ok: true, json: async () => (rows.length === 1 ? rows[0] : rows) };
	};
	return { fetchImpl, calls };
}

test('the regions are the ones the market has', () => {
	assert.ok(REGIONS.includes('eu'));
	assert.ok(REGIONS.includes('console_na'));
});

test('a single id comes back as an object and is still a price', async () => {
	const up = upstream({ 4064: 152000 });
	const { prices, failed } = await pricesFor('eu', [4064], { fetchImpl: up.fetchImpl, now: 1_000_000 });
	assert.equal(prices[4064].price, 152000);
	assert.equal(failed, 0);
	assert.equal(up.calls.length, 1);
});

test('fresh prices are remembered, so a second ask costs no request', async () => {
	const up = upstream({ 4064: 152000, 5828: 900 });
	const t = 2_000_000;
	await pricesFor('na', [4064, 5828], { fetchImpl: up.fetchImpl, now: t });
	const again = await pricesFor('na', [4064, 5828], { fetchImpl: up.fetchImpl, now: t + 60_000 });
	assert.equal(up.calls.length, 1);
	assert.equal(again.prices[5828].price, 900);
	assert.equal(again.prices[5828].stale, undefined);
});

test('when the upstream is refused, the old copy answers and says it is old', async () => {
	const t = 3_000_000;
	const good = upstream({ 4901: 3000 });
	await pricesFor('sea', [4901], { fetchImpl: good.fetchImpl, now: t });
	const bad = upstream({}, { fail: true });
	const { prices, failed } = await pricesFor('sea', [4901, 4055], { fetchImpl: bad.fetchImpl, now: t + 20 * 60 * 1000 });
	assert.equal(prices[4901].price, 3000);
	assert.equal(prices[4901].stale, true);
	assert.equal(prices[4055], undefined, 'nothing is invented for an id never priced');
	assert.equal(failed, 2);
});

test('the base price stands in when nothing has sold', async () => {
	const up = { fetchImpl: async () => ({ ok: true, json: async () => row(4605, 0, 250) }), calls: [] };
	const { prices } = await pricesFor('eu', [4605], { fetchImpl: up.fetchImpl, now: 4_000_000 });
	assert.equal(prices[4605].price, 250);
	assert.equal(prices[4605].base, 250);
});

test('many ids go up in batches', async () => {
	const table = Object.fromEntries(Array.from({ length: 95 }, (_, i) => [10000 + i, 100 + i]));
	const up = upstream(table);
	const { prices } = await pricesFor('kr', Object.keys(table).map(Number), { fetchImpl: up.fetchImpl, now: 5_000_000 });
	assert.equal(up.calls.length, 10, 'ten to a request');
	assert.equal(Object.keys(prices).length, 95);
});

/* ------------------------------------------------------------------ *
 * A refused batch is split
 * ------------------------------------------------------------------ */

// On 2026-10-02 api.arsha.io refused every forty-id batch with its
// "blocked by Imperva" 500 while ten-id batches of the same ids answered.
// A refusal is now met by asking each half, down to single ids, before
// the second source is asked. These fake the upstream's refusals.

/** An upstream that refuses a request it does not like, as arsha does. */
function choosy(table, refuse) {
	const calls = [];
	const fetchImpl = async url => {
		const u = String(url);
		if (!u.includes('arsha.io')) { calls.push('fallback'); return { ok: false, status: 404, json: async () => ({}) }; }
		const ids = new URL(u).searchParams.get('id').split(',').map(Number);
		calls.push(ids.length);
		if (refuse(ids)) {
			return { ok: false, status: 500, json: async () => ({ status: 500, message: 'One or more requests returned invalid data (probably blocked by Imperva). Try again later.' }) };
		}
		const rows = ids.filter(id => table[id]).map(id => row(id, table[id]));
		return { ok: true, json: async () => (rows.length === 1 ? rows[0] : rows) };
	};
	return { fetchImpl, calls };
}

test('a batch the upstream refuses as too big is asked again in halves, and every price comes back', async () => {
	const table = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [20000 + i, 500 + i]));
	// Refuses anything over five ids: the ten-id batch fails, its halves pass.
	const up = choosy(table, ids => ids.length > 5);
	const { prices, failed, fellBack } = await pricesFor('kr', Object.keys(table).map(Number), { fetchImpl: up.fetchImpl, now: 30_000_000 });
	assert.equal(Object.keys(prices).length, 10);
	assert.equal(failed, 0);
	assert.equal(fellBack, false, 'the first source answered, split');
	assert.deepEqual(up.calls, [10, 5, 5], 'refused once at ten, not asked at ten again, then the two halves');
});

test('forty refused, ten accepted: the batch size today answers at once', async () => {
	const table = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [21000 + i, 700 + i]));
	const up = choosy(table, ids => ids.length > 10);
	const { prices, failed } = await pricesFor('kr', Object.keys(table).map(Number), { fetchImpl: up.fetchImpl, now: 31_000_000 });
	assert.equal(Object.keys(prices).length, 40);
	assert.equal(failed, 0);
	assert.deepEqual(up.calls, [10, 10, 10, 10], 'no request was refused');
});

test('one id the upstream chokes on costs only itself, not the batch', async () => {
	const table = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [22000 + i, 900 + i]));
	const up = choosy(table, ids => ids.includes(22003));
	const { prices, failed } = await pricesFor('kr', Object.keys(table).map(Number), { fetchImpl: up.fetchImpl, now: 32_000_000 });
	assert.equal(prices[22003], undefined);
	assert.equal(Object.keys(prices).length, 9, 'the other nine are priced');
	assert.equal(failed, 1);
});

test('refused at every size, the split stops at single ids and the second source is asked', async () => {
	const table = { 23001: 144000, 23002: 79500 };
	const up = choosy(table, () => true);
	const { prices, failed } = await pricesFor('eu', [23001, 23002], { fetchImpl: up.fetchImpl, now: 33_000_000 });
	assert.deepEqual(prices, {});
	assert.equal(failed, 2);
	assert.equal(up.calls.filter(c => c === 'fallback').length, 2, 'each id was asked of the second source');
	assert.ok(up.calls.filter(c => c === 2).length === 1, 'the pair was asked once as a pair, then split');
});

/* ------------------------------------------------------------------ *
 * The second opinion
 * ------------------------------------------------------------------ */

// api.arsha.io fails a region at a time rather than all at once, and eu
// -- this app's default -- is one of the ones that goes. So a batch it
// refuses is asked of blackdesertmarket.com before it is given up for
// stale. These stub both, so the test says what the code does without
// asking anything of either.

/** An upstream that refuses, and a fallback that answers per id. */
function split(table, { fallbackFails = new Set() } = {}) {
	const calls = { arsha: 0, fallback: [] };
	const fetchImpl = async url => {
		const u = String(url);
		if (u.includes('arsha.io')) {
			calls.arsha++;
			return { ok: false, status: 500, json: async () => ({}) };
		}
		const id = Number(u.match(/\/item\/(\d+)/)[1]);
		calls.fallback.push(id);
		if (fallbackFails.has(id)) return { ok: true, json: async () => ({ code: 'ERROR_INTERNAL' }) };
		if (!table[id]) return { ok: false, status: 404, json: async () => ({}) };
		return {
			ok: true,
			json: async () => ({ code: 'SUCCESS', data: [{ id, basePrice: table[id], count: 7, enhancement: 0 }] })
		};
	};
	return { fetchImpl, calls };
}

test('a region the first source refuses is priced by the second', async () => {
	const s = split({ 4064: 144000, 4917: 22400000 });
	const { prices, failed, fellBack } = await pricesFor('eu', [4064, 4917], { fetchImpl: s.fetchImpl, now: 10_000_000 });
	assert.equal(prices[4064].price, 144000, 'the base price is the price this source has');
	assert.equal(prices[4917].stock, 7);
	assert.equal(failed, 0);
	assert.equal(fellBack, true, 'and the page is told these came from the other source');
	assert.deepEqual(s.calls.fallback.sort((a, b) => a - b), [4064, 4917]);
});

test('one id the second source cannot answer costs only itself', async () => {
	// The whole point of asking per id: a batch failure upstream is all
	// forty, but here a bad id leaves the other prices standing.
	const s = split({ 4064: 144000, 4917: 22400000 }, { fallbackFails: new Set([4917]) });
	const { prices, failed, fellBack } = await pricesFor('na', [4064, 4917], { fetchImpl: s.fetchImpl, now: 11_000_000 });
	assert.equal(prices[4064].price, 144000);
	assert.equal(prices[4917], undefined);
	assert.equal(failed, 1);
	assert.equal(fellBack, true);
});

test('a region the second source does not cover is not asked, and still does not throw', async () => {
	// It answers eu and na only. Anywhere else must degrade exactly as it
	// did before there was a fallback at all -- no request, no error.
	const s = split({ 4064: 144000 });
	const { prices, failed, fellBack } = await pricesFor('kr', [4064], { fetchImpl: s.fetchImpl, now: 12_000_000 });
	assert.deepEqual(prices, {});
	assert.equal(failed, 1);
	assert.equal(fellBack, false);
	assert.deepEqual(s.calls.fallback, [], 'kr was never asked of a source that has no kr');
});

test('a fallback price is remembered like any other, so the next ask is free', async () => {
	const s = split({ 4064: 144000 });
	const t = 13_000_000;
	await pricesFor('eu', [4064], { fetchImpl: s.fetchImpl, now: t });
	const before = s.calls.fallback.length;
	const again = await pricesFor('eu', [4064], { fetchImpl: s.fetchImpl, now: t + 60_000 });
	assert.equal(again.prices[4064].price, 144000);
	assert.equal(s.calls.fallback.length, before, 'it was answered from memory, not asked again');
});

test('a request that names no region is answered for NA', async () => {
	// The page always names one, so this is only the bare-URL case -- but
	// it has to agree with js/market.js or the two halves would disagree
	// about which server a price came from.
	const { DEFAULT_REGION } = await import('../server/market.js');
	assert.equal(DEFAULT_REGION, 'na');
	assert.ok(REGIONS.includes(DEFAULT_REGION));
});

test('a relay call has a deadline: past it the remaining batches are not asked and come back from the copy held, stale', async () => {
	// A slow upstream: every answer takes 30 ms. Sixty ids are more than
	// one batch; a deadline of 20 ms is spent by the first, so the rest
	// are neither asked upstream nor of the second source.
	const table = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [7000 + i, 1000 + i]));
	const up = upstream(table);
	const slow = async url => { await new Promise(r => setTimeout(r, 30)); return up.fetchImpl(url); };
	const ids = Object.keys(table).map(Number);
	const first = await pricesFor('console_eu', ids, { fetchImpl: slow, now: 5_000_000, deadline: 20 });
	assert.equal(up.calls.length, 1, 'one batch asked before the deadline fell');
	const priced = Object.keys(first.prices).length;
	assert.ok(priced > 0 && priced < 60, 'the first batch answered, the rest not');
	assert.equal(first.failed, 60 - priced, 'the rest are counted as unanswered');
	// Asked again later with a proper deadline, the held copies are fresh
	// and the missing ones are fetched.
	const again = await pricesFor('console_eu', ids, { fetchImpl: slow, now: 5_000_000 + 1000, deadline: 60_000 });
	assert.equal(Object.keys(again.prices).length, 60);
});

test('how many are listed comes through, and none listed is nought, not a gap', async () => {
	// A good with a last price and nothing for sale is exactly the one a
	// barter run must not be sent to the counter for.
	const fetchImpl = async () => ({ ok: true, json: async () => [
		{ id: 5401, lastSoldPrice: 900, basePrice: 900, currentStock: 0, lastSoldTime: 1 },
		{ id: 5402, lastSoldPrice: 700, basePrice: 700, currentStock: 12400, lastSoldTime: 1 }
	] });
	const { prices } = await pricesFor('sa', [5401, 5402], { fetchImpl, now: 9_000_000 });
	assert.equal(prices[5401].price, 900);
	assert.equal(prices[5401].stock, 0);
	assert.equal(prices[5402].stock, 12400);
});

/* ------------------------------------------------------------------ *
 * The recorded Market the other tests plan against
 * ------------------------------------------------------------------ */

// Every test file that starts the server sets MARKET_FIXTURE, so its
// runs are planned against one recorded answer rather than the day's
// Market. These say the recording is served faithfully and covers what
// the page asks; the live test below is the one place the real API is
// still asked, to catch it changing shape under the recording.

const FIXTURE = new URL('./fixtures/market.json', import.meta.url);

async function serve(deps) {
	const express = (await import('express')).default;
	const { marketRoutes } = await import('../server/market.js');
	const app = express();
	app.use('/api', marketRoutes(express, deps));
	const server = app.listen(0);
	await new Promise(resolve => server.once('listening', resolve));
	return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

test('the recording holds a price for every id the page asks the Market about', async () => {
	const { KNOWN_IDS, DEFAULT_REGION } = await import('../server/market.js');
	const { regions } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
	const missing = [...KNOWN_IDS].filter(id => !(regions[DEFAULT_REGION] || {})[id]);
	assert.deepEqual(missing, [], 're-record test/fixtures/market.json when the page starts buying something new');
});

test('with MARKET_FIXTURE set, the route answers from the recording and never asks the network', async () => {
	const { regions } = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
	let asked = 0;
	const fetchImpl = async () => { asked++; throw new Error('no network in this test'); };
	const srv = await serve({ fixture: FIXTURE.href, fetchImpl });
	try {
		const ids = Object.keys(regions.na).slice(0, 3);
		const body = await (await fetch(`${srv.base}/api/market?region=na&ids=${ids.join(',')}`)).json();
		for (const id of ids) {
			assert.equal(body.prices[id].price, regions.na[id].price);
			assert.equal(body.prices[id].stock, regions.na[id].stock);
			assert.equal(body.prices[id].stale, undefined, 'a recorded price is served as fresh');
		}
		assert.equal(body.failed, 0);
		// A region the recording lacks is unanswered, as an upstream that
		// would not answer is -- not an error, and still not the network.
		const kr = await (await fetch(`${srv.base}/api/market?region=kr&ids=${ids.join(',')}`)).json();
		assert.deepEqual(kr.prices, {});
		assert.equal(kr.failed, ids.length);
		assert.equal(asked, 0);
	} finally {
		srv.close();
	}
});

test('live: the real Market still answers in the shape the relay reads', { timeout: 60_000 }, async t => {
	// The one test that leaves the machine. Offline, or with the Market
	// refusing every source this minute, there is nothing to check, and
	// that is a skip rather than a failure.
	// Zinc Ingot and Iron Ingot: two the page really buys.
	const ids = [4064, 4052];
	const { prices, failed, fellBack } = await pricesFor('na', ids, { now: Date.now() + 1e9 });
	if (failed === ids.length) return t.skip('the Market did not answer (offline or refused)');
	// A shape change upstream shows as answered-but-empty: reduce() drops
	// rows it cannot read, so nothing is priced and nothing failed.
	for (const id of ids) {
		const p = prices[id];
		if (!p) continue;
		assert.equal(p.id, id);
		assert.ok(p.price > 0, `${id} has a price`);
		assert.ok(p.base > 0, `${id} has a base price`);
		assert.ok(Number.isFinite(p.stock), `${id} has a listed count`);
		assert.ok(Number.isFinite(p.soldAt), `${id} has a last-sold time`);
	}
	assert.ok(Object.keys(prices).length + failed === ids.length && Object.keys(prices).length > 0,
		`the answer was read (${fellBack ? 'second source' : 'api.arsha.io'})`);
});
