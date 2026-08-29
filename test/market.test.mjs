// The Market relay: batches, remembers, and never turns an upstream
// failure into an error the page has to handle.

import test from 'node:test';
import assert from 'node:assert/strict';
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
	assert.equal(up.calls.length, 3);
	assert.equal(Object.keys(prices).length, 95);
});
