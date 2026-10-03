// Today's board: the record of the forty layouts, and what one island's
// offer says about the rest.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { candidates, offersAt, askable, boardData, offersOf } from '../js/barter-board.js';
import { chains, chainRun } from '../js/barter-chains.js';
import { ladder, levelOf, triesFor, TRIES_BY_RUNG } from '../js/barter.js';
import { npcById, ports } from '../js/barter_npcs.js';
import { tradeGoodNames } from '../js/trade_goods.js';
import { useGame } from '../js/barter-layouts.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const record = useGame(await import('../js/barter_game.js'));
const combos = record.combos;
const known = new Set();
for (const e of barterData) { known.add(e.name); for (const s of e.sources) known.add(s.give.name); }

test('the record: forty layouts, every offer at a barterer we know, every name one the table knows', () => {
	assert.equal(combos.length, 40);
	assert.equal(new Set(combos.map(c => c.id)).size, 40);
	assert.equal(combos.reduce((a, c) => a + c.seen, 0), record.sample.refreshes);
	for (const c of combos) {
		assert.ok(c.offers.length >= 75, `layout ${c.id} has ${c.offers.length} offers`);
		assert.equal(new Set(c.offers.map(o => o[0])).size, c.offers.length, `layout ${c.id} lists an island twice`);
		for (const [id, give, qty, recv] of c.offers) {
			assert.ok(npcById.has(id), `${id} in layout ${c.id}`);
			assert.ok(known.has(give) && known.has(recv), `${give} -> ${recv}`);
			assert.match(qty, /^\d+(-\d+)?$/);
			if (levelOf(recv)) assert.ok(tradeGoodNames.includes(recv));
		}
	}
});

test('one island narrows the layouts, a second settles them, an offer nobody shows leaves none', () => {
	assert.equal(candidates(combos, []).length, 40);
	const luivano = [...npcById.values()].find(n => n.at === 'Luivano Island').id;
	const o = offersOf(combos[0]).get(luivano);
	const one = candidates(combos, [{ npcId: luivano, give: o.give, recv: o.recv }]);
	assert.ok(one.some(c => c.id === combos[0].id));
	assert.ok(one.length <= 3, `Luivano leaves ${one.length}`);
	const next = askable(one, npcById)[0];
	if (next) {
		const o2 = offersOf(combos[0]).get(next.npcId);
		const two = candidates(one, [{ npcId: next.npcId, give: o2.give, recv: o2.recv }]);
		assert.deepEqual(two.map(c => c.id), [combos[0].id]);
	}
	assert.deepEqual(candidates(combos, [{ npcId: luivano, give: 'Wool', recv: 'Tidal Black Stone' }]), []);
});

test('the island worth asking about leaves the fewest layouts standing, and one everybody agrees on is not offered', () => {
	const ask = askable(combos, npcById, ports[0]);
	assert.ok(ask.length > 0);
	assert.ok(ask[0].worst <= 3, `best island leaves ${ask[0].worst} at worst`);
	for (let i = 1; i < ask.length; i++) assert.ok(ask[i].worst >= ask[i - 1].worst);
	for (const a of ask) assert.ok(offersAt(combos, a.npcId).length >= 2);
	const offers = offersAt(combos, ask[0].npcId);
	assert.ok(offers.every(o => o.ids.length >= 1));
	assert.equal(offers.reduce((a, o) => a + o.ids.length, 0), combos.filter(c => offersOf(c).has(ask[0].npcId)).length);
});

test('a layout reads as a barter table: one offer an island, the game\u2019s own attempts, pay and Parley, and the materials its own islands pay', () => {
	const combo = combos[0];
	const data = boardData(combo, barterData, npcById);
	const goods = data.filter(e => levelOf(e.name) !== null || e.name === 'Crow Coin');
	const dealt = goods.flatMap(e => e.sources.map(s => s.npc_id));
	assert.equal(new Set(dealt).size, dealt.length, 'an island deals one trade exchange today');
	assert.equal(dealt.length, combo.offers.filter(o => levelOf(o[3]) !== null || o[3] === 'Crow Coin').length);
	const info = new Map(combo.offers.map(o => [o[0], o[4]]));
	for (const e of goods) for (const s of e.sources) {
		const o = info.get(s.npc_id);
		assert.equal(s.attempts_available, o.perDay);
		assert.equal(s.quantity_received, o.recvMin === o.recvMax ? String(o.recvMin) : `${o.recvMin}-${o.recvMax}`);
		assert.equal(s.parley, o.parley);
	}
	// What else the board pays is the layout's own: its fixed slots -- a
	// Brilliant, a Lost Trade Box -- and nothing from the whole table.
	const other = data.filter(e => levelOf(e.name) === null && e.name !== 'Crow Coin');
	const fixedOther = combo.offers.filter(o => levelOf(o[3]) === null && o[3] !== 'Crow Coin');
	assert.equal(other.reduce((a, e) => a + e.sources.length, 0), fixedOther.length, 'no material from the whole table');
	// The pools are named, each with what it may show, and nothing is on
	// the board from them until one is read.
	assert.ok(Object.keys(combo.pools).length >= 3, 'every layout has its pool islands');
	for (const pool of Object.values(combo.pools)) assert.ok(pool.options.length > 1 && pool.options.some(o => levelOf(o.recv) === null));
	const [npcId, pool] = Object.entries(combo.pools)[0];
	const o = pool.options.find(x => levelOf(x.recv) === null);
	const read = boardData(combo, barterData, npcById, [{ npcId: Number(npcId), give: o.give, recv: o.recv }]);
	const got = read.find(e => e.name === o.recv);
	assert.ok(got && got.sources.some(s => s.npc_id === Number(npcId) && s.attempts_available === o.perDay), 'a pool read today is on the board, at the game\u2019s figures');
	const withBrilliant = combos.find(c => c.offers.some(x => x[3] === 'Brilliant Pearl Shard'));
	assert.ok(ladder('Brilliant Pearl Shard', boardData(withBrilliant, barterData, npcById)), 'the ladder climbs a board to a material it pays');
});

test('a run planned on the board only calls at islands the board deals, and the caps by rung stand in for the codex’s zeros', () => {
	const combo = combos[3];
	const data = boardData(combo, barterData, npcById);
	const board = offersOf(combo);
	const five = [...board.values()].find(o => levelOf(o.give) === 4 && levelOf(o.recv) === 5);
	const all = chains(data, { [five.give]: 4 });
	const mine = all.find(c => c.from === 'hold' && c.item === five.give);
	assert.ok(mine && mine.rungs[0].item === five.recv);
	const p = chainRun({ chosen: [mine], stock: { [five.give]: 4 }, hold: { free: 20000, deal: 25000, max: 30000 }, parley: { bar: 1e6, perTrade: 14286 }, npcById });
	assert.ok(p.stops.length > 0);
	for (const s of p.stops) {
		const o = board.get(s.npcId);
		assert.ok(o && o.give === s.give && o.recv === s.item, `${s.npc} deals ${s.give} -> ${s.item} today`);
	}
	assert.equal(triesFor('[Level 7] Golden Flour Sack', 0), TRIES_BY_RUNG[7]);
	assert.equal(triesFor('[Level 5] Azure Quartz', 4), 4);
	assert.equal(triesFor('Crow Coin', 0), TRIES_BY_RUNG.coin);
	assert.equal(triesFor('Brilliant Pearl Shard', 0), 2);
});

test('the board’s [Level 6] offers are the layout’s; what a [Level 7] island pays is one of its own four', () => {
	// Layout 25 as seen in the game on 2026-09-04: the [Level 6]
	// offers matched the record island for island, four of the six
	// [Level 7] goods did not -- so a [Level 7] island's give is the
	// layout's and what it pays is any of its own four.
	const combo = combos.find(c => c.id === '25');
	const data = boardData(combo, barterData, npcById);
	const sevens = data.filter(e => levelOf(e.name) === 7);
	assert.equal(sevens.length, 6);
	for (const e of sevens) {
		assert.equal(e.sources.length, 1);
		assert.equal(levelOf(e.sources[0].give.name), 6);
		const own = barterData.filter(x => levelOf(x.name) === 7 && x.sources.some(s => s.npc_id === e.sources[0].npc_id));
		assert.equal(own.length, 4);
		assert.ok(own.some(x => x.name === e.name));
	}
	assert.ok(data.some(e => e.name === '[Level 6] Valencian Desert Fine Sword' && e.sources[0].npc_name === 'Roshina'));
});

test('an offer that shows only some days neither names the layout nor goes on the board until it is seen', () => {
	// The Wandering Merchant's Ship shows three days in a hundred on
	// layout 31. Seen or not, the layout stands; seen, it is on the board.
	const ship = [...npcById.values()].find(n => n.at === 'Wandering Merchant\u2019s Ship' || n.at === "Wandering Merchant's Ship").id;
	const layout = combos.find(c => c.id === '31');
	const rare = layout.rare[ship];
	assert.ok(rare && rare.chance < 0.5);
	assert.equal(offersOf(layout).has(ship), false);
	const answer = { npcId: ship, give: rare.give, recv: rare.recv };
	assert.ok(candidates(combos, [answer]).includes(layout));
	assert.equal(candidates([layout], [{ npcId: ship, give: rare.give, recv: '[Level 5] Azure Quartz' }]).length, 0, 'but not something else');
	const trade = data => data.filter(e => levelOf(e.name) !== null || e.name === 'Crow Coin');
	const rows = data => trade(data).flatMap(e => e.sources.filter(s => s.npc_id === ship).map(s => [s.give.name, e.name]));
	assert.deepEqual(rows(boardData(layout, barterData, npcById)), []);
	assert.deepEqual(rows(boardData(layout, barterData, npcById, [answer])), [[rare.give, rare.recv]]);
	assert.equal(askable(combos, npcById).some(x => x.npcId === ship), false, 'never asked about');
	// An answer at an island the layout does list still has to match.
	const listed = layout.offers.find(o => !layout.rolls[o[0]] && o[3] !== 'Crow Coin');
	assert.equal(candidates([layout], [{ npcId: listed[0], give: listed[1], recv: listed[3] }]).length, 1);
	assert.equal(candidates([layout], [{ npcId: listed[0], give: listed[1], recv: 'Crow Coin' }]).length, 0);
});

test('layout 19 takes the two Land of Morning Light [Level 5]s the sheet left out, and they climb to Level 7', () => {
	const layout = combos.find(c => c.id === '19');
	const data = boardData(layout, barterData, npcById);
	const dock = { '[Level 5] Golden Fish Scale': 3, "[Level 5] Statue's Tear": 3 };
	const held = chains(data, {}, dock).filter(c => c.from === 'dock');
	assert.deepEqual(held.map(c => [c.item, c.top, c.rungs.map(r => npcById.get(r.npcId).at)]).sort(), [
		['[Level 5] Golden Fish Scale', 7, ['Dallae Pier', 'Sanctuary Coastal Outpost']],
		["[Level 5] Statue's Tear", 7, ['Haemo Island', 'Sausan Garrison Wharf']]
	]);
});

// Every exchange in the game has its own barter count to open, and an
// island whose one offer today is above it shows a blank window. The
// app has no table of those thresholds, so it keeps what the sailor
// saw: the exchange named here leaves the board.
test('an exchange the sailor found shut leaves the board, and takes its island with it', () => {
	const combo = combos[0];
	const listed = offersOf(combo);
	// An island whose good today comes from nowhere else on this board,
	// so dropping it drops the good with it and the effect is plain.
	const takers = new Map();
	for (const [, o] of listed) takers.set(o.recv, (takers.get(o.recv) || 0) + 1);
	const [npcId, off] = [...listed].find(([, o]) => takers.get(o.recv) === 1 && levelOf(o.recv));
	const before = boardData(combo, barterData, npcById, []);
	assert.ok(before.find(e => e.name === off.recv).sources.some(s => s.npc_id === npcId));

	const shut = [{ npcId, give: off.give, recv: off.recv, at: 1082 }];
	const after = boardData(combo, barterData, npcById, [], shut);
	const gone = after.find(e => e.name === off.recv);
	assert.ok(!gone || !gone.sources.some(s => s.npc_id === npcId), 'the island still takes the good it would not trade');
	// Nothing else moved: the rest of the board is the board.
	assert.equal(after.filter(e => e.name !== off.recv).length, before.filter(e => e.name !== off.recv).length);

	// A sighting of another offer at the same island says nothing about
	// the one it is showing today.
	const other = boardData(combo, barterData, npcById, [], [{ npcId, give: off.give, recv: 'Tidal Black Stone', at: 1082 }]);
	assert.ok(other.find(e => e.name === off.recv).sources.some(s => s.npc_id === npcId));
});

test('a chain that climbs through a shut exchange is not proposed', () => {
	const combo = combos[0];
	const stock = new Map(), dock = new Map();
	const full = chains(boardData(combo, barterData, npcById, []), stock, dock, 20000);
	const deep = full.find(c => c.rungs.length >= 3);
	assert.ok(deep, 'no chain long enough to cut');
	const rung = deep.rungs[1];
	// The second rung is reached by handing over the first one's good.
	const shut = [{ npcId: rung.npcId, give: deep.rungs[0].item, recv: rung.item, at: 1082 }];
	const cut = chains(boardData(combo, barterData, npcById, [], shut), stock, dock, 20000);
	assert.ok(!cut.some(c => c.rungs.some(r => r.npcId === rung.npcId && r.item === rung.item)),
		'a rung at the shut exchange survived');
});

/* ------------------------------------------------------------------ *
 * the slots the game fills at random
 * ------------------------------------------------------------------ */

test('a random slot names one of its options, and whatever option was seen keeps the layout and goes on the board', () => {
	// Layout 31 at Ajir: a [Level 5] Statue\u2019s Tear or 40-60 Crow Coins.
	const ajir = [...npcById.values()].find(n => n.at === 'Ajir Island').id;
	const layout = combos.find(c => c.id === '31');
	const roll = layout.rolls[ajir];
	assert.deepEqual(roll.options.map(o => o.recv).sort(), ['Crow Coin', "[Level 5] Statue's Tear"]);
	assert.ok(roll.options.some(o => `${o.give}|${o.recv}` === layout.picks[ajir]), 'the layout names one of them');
	const coins = roll.options.find(o => o.recv === 'Crow Coin');
	const seen = { npcId: ajir, give: coins.give, recv: coins.recv };
	assert.ok(candidates(combos, [seen]).includes(layout), 'either option keeps the layout');
	assert.equal(candidates([layout], [{ npcId: ajir, give: coins.give, recv: '[Level 5] Azure Quartz' }]).length, 0, 'what no option is rules it out');
	const at = data => data.filter(e => levelOf(e.name) !== null || e.name === 'Crow Coin').flatMap(e => e.sources.filter(s => s.npc_id === ajir).map(s => [e.name, s.attempts_available, s.quantity_received, s.parley]));
	assert.deepEqual(at(boardData(layout, barterData, npcById, [seen])), [['Crow Coin', 4, '40-60', 21650]]);
	assert.equal(askable(combos, npcById).some(x => x.npcId === ajir), false, 'a random slot is never the island to ask');
});

test('every offer on a layout carries the game\u2019s own gate', async () => {
	const { exchangeGate } = await import('../js/barter-board.js');
	for (const c of combos) for (const [id] of c.offers) assert.equal(typeof exchangeGate(c, id), 'number', `layout ${c.id}, ${id}`);
});

test('what the game deals at an island is known, wherever it was seen; what it never has is not', async () => {
	const { knownAt } = await import('../js/barter-board.js');
	const all = combos;
	const [id, give, , recv] = all[0].offers[0];
	assert.ok(knownAt(all, id, give, recv));
	assert.equal(knownAt(all, id, '[Level 5] No Such Thing', recv), null);
	// the patch of 17 September 2026: Dallae Pier on layout 31
	assert.equal(knownAt([], 58981, '[Level 5] Stuffed Morpho Butterfly', '[Level 6] Top-Quality Blue Underglaze Porcelain Crate'), 'client');
});
