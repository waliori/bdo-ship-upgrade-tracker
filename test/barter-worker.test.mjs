// The run search in its worker: the one message in, the one out.
//
// What can go wrong: an answer under the wrong id, so the tab takes a
// stale search for a fresh one; a throw inside the worker that nothing
// posts back, so the tab waits for ever; the worker's default budget
// not reaching propose(); the module refusing to load outside a
// worker, where a test and the page both import it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { handleRequest, DEFAULT_BUDGET_MS } from '../js/barter-worker.js';
import { propose } from '../js/barter-optimizer.js';
import { chains } from '../js/barter-chains.js';
import { presetOrders } from '../js/barter-orders.js';
import { boardData } from '../js/barter-board.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8')).combos;
const data = boardData(combos.find(c => c.id === '1'), barterData, npcById);
const stashes = ['Velia', 'Iliya Island', 'Port Epheria'].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));
const hold = { free: 16500, deal: 20625, max: 28050 };
const parley = { bar: 1000000, perTrade: 14286 };
const iliya = ports.find(p => p.name === 'Iliya Island');
const ship = { speed: 110, cal: 11 };
const dock = { '[Level 5] Azure Quartz': 5 };
const opts = { stock: {}, dock, hold, parley, npcById, start: iliya, stashes, pace: 'fast', orders: presetOrders('cash'), prices: {} };
const all = chains(data, {}, dock);

test('the answer carries the request id and what propose() returns', () => {
	const out = handleRequest({ id: 7, chains: all, opts, ship, timeCap: 0 });
	assert.equal(out.id, 7);
	assert.equal(out.error, undefined);
	const direct = propose({ chains: all, opts, ship });
	assert.deepEqual(out.result.proposals.map(p => p.ids), direct.proposals.map(p => p.ids));
	assert.equal(out.result.best.ids.join(), direct.best.ids.join());
	assert.equal(out.result.partial, false);
});

test('the worker searches under a budget by default, and under the one it is given', () => {
	assert.equal(DEFAULT_BUDGET_MS, 1500);
	const cut = handleRequest({ id: 'a', chains: all, opts, ship, budgetMs: 0 });
	assert.equal(cut.result.partial, true);
	const whole = handleRequest({ id: 'b', chains: all, opts, ship, budgetMs: Infinity });
	assert.equal(whole.result.partial, false);
});

test('what the message carries survives a structured clone: no functions, the Map of barterers intact', () => {
	const msg = globalThis.structuredClone({ id: 1, chains: all, opts, ship, seed: [], timeCap: 0 });
	assert.ok(msg.opts.npcById instanceof Map);
	const out = handleRequest(msg);
	assert.equal(out.error, undefined);
	assert.ok(out.result.proposals.length >= 1);
	// And the answer clones back, run and all.
	assert.doesNotThrow(() => globalThis.structuredClone(out));
});

test('a throw inside the search comes back as an error under the same id, never silence', () => {
	const out = handleRequest({ id: 42, chains: all, ship });   // no opts: propose() reads opts.orders
	assert.equal(out.id, 42);
	assert.equal(typeof out.error, 'string');
	assert.equal(out.result, undefined);
	assert.equal(handleRequest(null).id, null);
});
