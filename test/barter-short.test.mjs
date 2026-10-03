// A short trip: the board a trade at a time, and what each would add.
//
// What can go wrong: a trade offered twice because two chains share it,
// a picked trade offered again, a trade taken further that is offered
// as a trip of its own, a row that says a trade trades when its island
// does nothing, a cut id that does not read back.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { npcById, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';
import { chains } from '../js/barter-chains.js';
import { boardData } from '../js/barter-board.js';
import { PLAIN_ORDERS } from '../js/barter-orders.js';
import { cutOf, cutAt, shortTrades, margins } from '../js/barter-short.js';
import { useGame } from '../js/barter-layouts.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const combos = useGame(await import('../js/barter_game.js')).combos;
const stashes = ['Velia', 'Iliya Island', "Oquilla's Eye"].map(at => wharves.find(w => w.kind === 'wharf' && w.at === at));
const start = ports.find(p => p.name === 'Iliya Island');
const data = boardData(combos.find(c => c.id === '24'), barterData, npcById);
const dock = { '[Level 1] Raft Toy': 30, '[Level 2] Pirate Ship Mast': 20, '[Level 3] Scout Binoculars': 8 };
const all = chains(data, {}, dock, 5000).filter(c => !c.gate);
const opts = { stock: {}, dock, hold: { free: 18300, deal: 31110, max: 31110 }, parley: { bar: 1000000, perTrade: 11755 }, npcById, start, stashes, pace: 'fast', orders: { ...PLAIN_ORDERS, way: 'sea', sell: 5 } };
const ship = { speed: 123, cal: 11 };
const sig = c => c.rungs.map(r => `${r.npcId}:${r.give}:${r.item}`).join('/');

test('a cut id reads back to its chain and its depth', () => {
	const c = all[0];
	assert.deepEqual(cutOf(`${c.id}>0`), { base: c.id, k: 0 });
	assert.deepEqual(cutOf(c.id), { base: c.id, k: -1 });
	const cut = cutAt(c, 0);
	assert.equal(cut.rungs.length, 1);
	assert.equal(cut.id, `${c.id}>0`);
	assert.equal(cut.fullRungs, c.rungs);
});

test('every trade on the board is offered once, whatever chains share it', () => {
	const { picked, first, next } = shortTrades(all, []);
	assert.equal(picked.length, 0);
	assert.equal(next.length, 0);
	assert.ok(first.length > 5, `${first.length} trades`);
	assert.ok(first.every(c => c.rungs.length === 1 && c.id.endsWith('>0')));
	assert.equal(new Set(first.map(c => `${c.from === 'land' ? 'land' : c.item}|${sig(c)}`)).size, first.length);
	// Every first rung of the board is among them.
	for (const c of all) assert.ok(first.some(f => sig(f) === sig(cutAt(c, 0))), `${c.id} offered`);
});

test('a picked trade is not offered again, and its goods are offered one island further', () => {
	const climber = all.find(c => c.rungs.length > 1 && c.from !== 'land');
	const id = `${climber.id}>0`;
	const { picked, first, next } = shortTrades(all, [id]);
	assert.deepEqual(picked.map(c => c.id), [id]);
	assert.ok(!first.some(c => sig(c) === sig(picked[0])), 'not offered again');
	assert.ok(next.length >= 1);
	for (const n of next) {
		assert.equal(n.grows, id);
		assert.equal(n.rungs.length, 2);
		assert.equal(sig({ rungs: n.rungs.slice(0, 1) }), sig(picked[0]));
	}
	// Taken further, the shorter trade is inside it and offered nowhere.
	const further = shortTrades(all, [next[0].id]);
	assert.equal(further.picked[0].rungs.length, 2);
	assert.ok(!further.first.some(c => sig(c) === sig(picked[0])));
	// An id from another board, or past the chain's end, is dropped.
	assert.equal(shortTrades(all, ['hold:nothing:1>0', `${climber.id}>${climber.rungs.length}`]).picked.length, 0);
});

test('each trade says what it adds and the minutes, and trades at its own island when it says so', () => {
	const none = margins({ picked: [], cands: shortTrades(all, []).first, opts, ship, start });
	assert.equal(none.base, null);
	const live = none.rows.filter(r => !r.why);
	assert.ok(live.length > 3);
	// On its own, a trade is there and back from the harbour.
	assert.ok(live.every(r => r.minutes > 0 && r.own > 0));
	// Best first, for what it adds a minute.
	for (let i = 1; i < live.length; i++) assert.ok(live[i - 1].worth / Math.max(live[i - 1].minutes, 1) >= live[i].worth / Math.max(live[i].minutes, 1) - 1e-6);
	// Picked, the next island: it trades there, and the run goes a level higher.
	const raft = shortTrades(all, []).first.find(c => c.item === '[Level 1] Raft Toy' && c.from !== 'land');
	const s = shortTrades(all, [raft.id]);
	const m = margins({ picked: s.picked, cands: [...s.first, ...s.next], opts, ship, start });
	const grow = m.rows.find(r => r.c.grows && !r.why);
	assert.ok(grow, 'the Raft Toy trade can be taken further');
	const last = grow.c.rungs[1];
	assert.ok(grow.run.stops.some(x => x.npcId === last.npcId && x.times > 0));
	assert.ok(grow.own > 0);
	// Rows that trade nothing say why, and come last.
	const firstDead = m.rows.findIndex(r => r.why);
	if (firstDead >= 0) assert.ok(m.rows.slice(firstDead).every(r => r.why));
});
