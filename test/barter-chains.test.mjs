// The runs a board allows, chain by chain: every climb from the shore
// or the hold to the top the board reaches, and the run along the
// chains a sailor ticks.
//
// What can go wrong: a chain that skips a rung or takes a good no
// island on the board pays, an island dealt twice when two chains
// cross it, a hold past the hull's ceiling with a wharf in reach, a
// [Level 7] carried home instead of sold.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { chains, chainRun } from '../js/barter-chains.js';
import { boardData, offersOf } from '../js/barter-board.js';
import { levelOf, GOODS } from '../js/barter.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = JSON.parse(await readFile(new URL('../js/barter_combos.json', import.meta.url), 'utf8')).combos;
const layout = combos.find(c => c.id === '25');
const data = boardData(layout, barterData, npcById);
const stashes = ['Velia', 'Iliya Island', "Oquilla's Eye"].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));
const hold = { free: 23300, max: 39500 };
const parley = { bar: 3500000, perTrade: 10554 };

test('every chain climbs the board a rung at a time, from a land good or a good aboard', () => {
	const board = offersOf(layout);
	const all = chains(data, { '[Level 4] Amethyst Fragment': 4 });
	assert.ok(all.length > 0);
	for (const c of all) {
		assert.equal(c.rungs[0].give, c.item);
		if (c.from === 'land') assert.equal(levelOf(c.item), null);
		else assert.equal(c.have, 4);
		c.rungs.forEach((r, i) => {
			const o = board.get(r.npcId);
			assert.ok(o && o.give === r.give && o.recv === r.item, `${r.npc} deals ${r.give} -> ${r.item}`);
			if (i) assert.equal(r.give, c.rungs[i - 1].item, 'each rung takes what the one below paid');
		});
		assert.equal(c.top, levelOf(c.rungs[c.rungs.length - 1].item));
	}
	// Layout 25: ten [Level 1] islands, five of them the foot of a
	// chain to [Level 7]; the [Level 4]s aboard start a sixth.
	assert.equal(all.filter(c => c.from === 'land' && levelOf(c.rungs[0].item) === 1).length, 10);
	assert.equal(all.filter(c => c.top === 7 && c.from === 'land').length, 5);
	assert.equal(all[0].from, 'hold', 'the shortest climb to the top comes first');
	assert.equal(all[0].top, 7);
	assert.equal(new Set(all.map(c => c.id)).size, all.length);
});

test('one chain from the shore: every attempt at each rung, the leftovers left at a wharf when the hull needs the room, the [Level 7]s sold where they are made', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const p = chainRun({ chosen: [c], stock: {}, hold, parley, npcById, start: ports[0], stashes });
	const islands = p.stops.filter(s => s.npcId);
	assert.deepEqual(islands.map(s => s.npc), c.rungs.map(r => r.npc));
	assert.deepEqual(islands.map(s => s.times), [10, 10, 10, 10, 6, 5, 5]);
	assert.ok(p.stops.every(s => s.weightAfter <= hold.max + 1e-6), 'never past the ceiling');
	const wharfs = p.stops.filter(s => s.wharf);
	assert.ok(wharfs.length >= 1, 'the leftovers go ashore on the way');
	assert.ok(wharfs.every(s => stashes.includes(s.wharf) && s.dropped.length));
	assert.ok(p.stashed.every(s => levelOf(s.item) <= 5), 'nothing above what the top rungs take is left ashore');
	assert.equal(p.sold.length, 1);
	assert.equal(p.sold[0].n, 5);
	assert.equal(p.silver, 5 * GOODS[7].sell);
	assert.ok(islands[islands.length - 1].sale && islands[islands.length - 1].sale.n === 5);
	assert.deepEqual(p.bought, [{ item: 'Copper Ingot', n: 100 }]);
	assert.equal(p.trades, 56);
	assert.ok(Math.abs(p.parleyUsed - 56 * parley.perTrade) < 1e-6);
	assert.ok(p.keptWorth > 0, 'what is left over is priced');
});

test('two chains sail one after the other, nearest first, and an island crossed twice deals once', () => {
	const stock = { '[Level 4] Amethyst Fragment': 4 };
	const all = chains(data, stock);
	const land = all.find(x => x.rungs[0].npc === 'Cazio');
	const aboard = all.find(x => x.from === 'hold');
	const p = chainRun({ chosen: [land, aboard], stock, hold, parley, npcById, start: ports[0], stashes });
	const ids = p.stops.filter(s => s.npcId).map(s => s.npcId);
	assert.equal(new Set(ids).size, ids.length);
	// The [Level 4]s aboard join the land chain at Tarin: six attempts
	// there, not four and then six.
	assert.equal(p.stops.find(s => s.npc === 'Tarin').times, 6);
	assert.equal(p.silver, 5 * GOODS[7].sell);
	const far = all.find(x => x.rungs[0].npc === 'Renilu');
	const two = chainRun({ chosen: [far, land], stock: {}, hold, parley, npcById, start: ports[0], stashes });
	assert.equal(two.sold.length, 2);
	assert.equal(two.silver, 10 * GOODS[7].sell);
	assert.ok(two.stops.every(s => s.weightAfter <= hold.max + 1e-6));
	assert.equal(two.stops.filter(s => s.npcId)[0].npc, 'Renilu', 'the chain nearest Velia is sailed first');
});

test('with no wharf in reach the attempts are cut to what the hull moves under', () => {
	const c = chains(data).find(x => x.rungs[0].npc === 'Cazio');
	const small = { free: 8000, max: 12000 };
	const p = chainRun({ chosen: [c], stock: {}, hold: small, parley, npcById, start: ports[0] });
	assert.ok(p.stops.every(s => s.npcId && s.weightAfter <= small.max + 1e-6));
	assert.ok(p.stops.find(s => s.npc === 'Trisha').times < 10);
});
