// The new planner laid as the Barter tab lays it (solveRun), on a real
// board: the sailor's own edits from the wharf step are kept as chainRun
// keeps them.
//
// What can go wrong: an island taken off the route still sailed; a trip
// order or a moved stop undone by the planner's own search; the chain way
// threading climbs together.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { npcById, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';
import { chains } from '../js/barter-chains.js';
import { boardData } from '../js/barter-board.js';
import { PLAIN_ORDERS } from '../js/barter-orders.js';
import { useGame } from '../js/barter-layouts.js';
import { solveRun } from '../js/barter-solve.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = useGame(await import('../js/barter_game.js')).combos;
const stashes = ['Velia', 'Iliya Island', "Oquilla's Eye"].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));

// barter-route.test's board: layout 34, a stocked storage, six climbs to [Level 7].
const d34 = boardData(combos.find(c => c.id === '34'), barterData, npcById);
const stock = { "[Level 5] Statue's Tear": 3, '[Level 4] Old Chest with Gold Coins': 6 };
const dock = { '[Level 5] Supreme Gold Candlestick': 6, '[Level 5] 102 Year Old Golden Herb': 4, '[Level 5] Golden Fish Scale': 3, '[Level 4] Old Chest with Gold Coins': 30, '[Level 4] Bronze Candlestick': 18 };
const want = ['[Level 5] Supreme Gold Candlestick', '[Level 5] 102 Year Old Golden Herb', "[Level 5] Statue's Tear", '[Level 5] Golden Fish Scale', '[Level 4] Old Chest with Gold Coins', '[Level 4] Bronze Candlestick'];
const all = chains(d34, stock, dock).filter(c => c.top === 7 && c.from !== 'land');
const chosen = want.map(w => all.find(c => c.item === w)).filter(Boolean);
const base = { chosen, stock, dock, hold: { free: 20889, deal: 26111, max: 35500 }, parley: { bar: 674128, perTrade: 10512 }, npcById, start: ports.find(p => p.name === 'Iliya Island'), stashes, pace: 'steady', orders: { ...PLAIN_ORDERS, way: 'sea', sell: 7 } };
const isles = r => r.stops.filter(s => s.npcId && s.times > 0).map(s => s.npcId);

test('an island taken off the route is not sailed, and its climb stops before it', () => {
	const run = solveRun(base);
	const off = run.stops.find(s => s.npcId && s.times > 0).npcId;
	const without = solveRun({ ...base, skipIsles: [off] });
	assert.ok(!isles(without).includes(off));
	const c = chosen.find(x => x.rungs.some(r => r.npcId === off));
	const k = c.rungs.findIndex(r => r.npcId === off);
	for (const r of c.rungs.slice(k)) assert.ok(!isles(without).includes(r.npcId), `${r.npc} above the island taken off`);
	if (k === 0) assert.ok(without.skippedWhole.some(x => x.id === c.id));
});

test('a trip order set is sailed as set, and a stop moved moves on the route that was shown', () => {
	const run = solveRun(base);
	assert.ok(run.lots.length >= 2, 'two trips or more');
	const keyOf = (r, lot) => lot.map(k => r.order[k].id).sort().join('+');
	const keys = run.lots.map(lot => keyOf(run, lot));
	const flipped = solveRun({ ...base, tripOrder: [keys[keys.length - 1]] });
	const first = flipped.stops.find(s => s.npcId && s.times > 0);
	const lastTrip = run.lots[run.lots.length - 1].map(k => run.order[k].id);
	assert.ok(lastTrip.includes(flipped.order[first.chain].id), 'the trip named first is sailed first');
	// One stop moved a place sooner, past a neighbour of another climb in its trip.
	const was = isles(run);
	const chainAt = id => run.stops.find(s => s.npcId === id).chain;
	const lotAt = id => run.lots.findIndex(l => l.includes(chainAt(id)));
	const i = was.findIndex((id, k) => k > 0 && chainAt(id) !== chainAt(was[k - 1]) && lotAt(id) === lotAt(was[k - 1]));
	assert.ok(i > 0, 'a stop whose neighbour before it is of another climb, in the same trip');
	const now = isles(solveRun({ ...base, nudge: { [was[i]]: -1 } }));
	assert.deepEqual([...now].sort(), [...was].sort(), 'every island still sailed');
	assert.ok(now.indexOf(was[i]) < now.indexOf(was[i - 1]), 'the stop moved ahead of its neighbour');
});

test('the chain way sails each climb whole before the next', () => {
	const run = solveRun({ ...base, orders: { ...base.orders, way: 'chain' } });
	const seen = [];
	for (const s of run.stops.filter(x => x.npcId && x.times > 0)) {
		if (seen[seen.length - 1] !== s.chain) {
			assert.ok(!seen.includes(s.chain), `climb ${s.chain} picked up again after another`);
			seen.push(s.chain);
		}
	}
});

test('a climb that cashes in for Crow Coins is laid, and its coins counted; the coin goal proposes the most coins', async () => {
	const { newPropose } = await import('../js/barter-solve.js');
	const withCoins = chains(d34, stock, dock, null, 0, true);
	const coin = withCoins.find(c => c.pays === 'coin' && c.from !== 'land');
	assert.ok(coin, 'a coin climb on the board');
	const run = solveRun({ ...base, chosen: [coin] });
	assert.ok(run.coins > 0, 'coins counted');
	assert.equal(run.coins, run.stops.filter(s => s.item === 'Crow Coin').reduce((a, s) => a + s.times * s.recvMin, 0));
	const found = newPropose({ ...base, aim: { kind: 'coins' } }, withCoins.filter(c => c.from !== 'land'));
	assert.equal(found.best.kind, 'coins');
	assert.ok(found.best.value > 0 && found.best.value === found.best.run.coins);
});

test('the bag is tried where a run goes home for a later trip\'s goods, and kept only where it pays', () => {
	// On this board every trip ends at the harbour to sell, so the goods
	// for the next come aboard on a call made anyway: the bag goes unused,
	// as chainRun leaves it, and the run is no worse for having one.
	const plain = solveRun(base);
	const bagged = solveRun({ ...base, bag: { free: 20000, slots: 10 } });
	assert.ok(bagged.net >= plain.net - 1e-6 && bagged.hours <= plain.hours + 1e-6);
	const inBag = Object.fromEntries(bagged.bagLoaded.map(l => [l.item, l.n]));
	for (const s of bagged.stops) for (const l of s.fromBag || []) assert.ok((inBag[l.item] || 0) >= l.n - 1e-9, `${l.item} out of the bag but never put in`);
});
