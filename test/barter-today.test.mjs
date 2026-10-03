// Today's rolls and To Get's today: the islands a layout leaves to
// chance, and what the day's material list deals of what is short.
//
// What can go wrong: a roll taken to be the layout's own when the
// sailor has been shown the other one every time, a slip counted as a
// sighting, an island the count has not opened offered as doable, or
// a thing no barter pays called "off today's layout".

import test from 'node:test';
import assert from 'node:assert/strict';

import * as store from '../js/state.js';
import * as game from '../js/barter_game.js';
import { useGame, materialPages } from '../js/barter-layouts.js';
import { barterKey } from '../js/clock.js';
import { V } from '../js/barter/state.js';
import { likelyAt, rollAsks, assumedRolls, noteRolls } from '../js/barter/rolls.js';
import { todayFor, todaySides } from '../js/barter/get-today.js';

useGame(game);

const ISLE = 58922, POOL = 58979;
const GOOD = { give: '[Level 4] Old Chest with Gold Coins', recv: "[Level 5] Statue's Tear", gate: 0 };
const COINS = { give: '[Level 4] Old Chest with Gold Coins', recv: 'Crow Coin', gate: 0 };
const key = o => `${o.give}|${o.recv}`;
const combo = {
	id: '31',
	rolls: { [ISLE]: { options: [GOOD, COINS] } },
	picks: { [ISLE]: key(GOOD) },
	pools: { [POOL]: { options: [{ give: '[Level 3] Ancient Orders', recv: 'Tidal Black Stone', gate: 0 }, { give: '[Level 3] Ancient Orders', recv: 'Lost Trade Box', gate: 0 }] } }
};

test('a roll is the layout’s own until the sailor has been shown otherwise, more often than not', () => {
	V.board = { day: barterKey(), answers: [], own: false };
	store.setProfile('rolls', {});
	assert.deepEqual(likelyAt(combo, ISLE), GOOD, 'nothing said: the layout’s pick');
	assert.deepEqual(assumedRolls(combo), [], 'the layout’s own pick is no assumption');
	const asks = rollAsks(combo);
	assert.equal(asks.length, 2, 'the roll and the pool are both asked about');
	assert.ok(asks.find(a => a.npcId === POOL).pool);
	assert.equal(asks.find(a => a.npcId === ISLE).said, null);
	// Shown the coins three times out of four: the coins are the likelier.
	store.setProfile('rolls', { [`31|${ISLE}`]: { day: '2026-01-01', pick: key(COINS), seen: { [key(COINS)]: 3, [key(GOOD)]: 1 } } });
	assert.deepEqual(likelyAt(combo, ISLE), COINS);
	assert.deepEqual(assumedRolls(combo), [{ npcId: ISLE, give: COINS.give, recv: COINS.recv }]);
	// Two sightings are not yet a pattern.
	store.setProfile('rolls', { [`31|${ISLE}`]: { day: '2026-01-01', pick: key(COINS), seen: { [key(COINS)]: 2 } } });
	assert.deepEqual(likelyAt(combo, ISLE), GOOD);
	// What the sailor said stands over any assumption.
	assert.deepEqual(assumedRolls(combo, [{ npcId: ISLE, ...GOOD }]), []);
});

test('a roll said is counted once a board day, and a slip said over is taken back', () => {
	store.setProfile('rolls', {});
	noteRolls(combo, [{ npcId: ISLE, give: GOOD.give, recv: GOOD.recv }]);
	noteRolls(combo, [{ npcId: ISLE, give: GOOD.give, recv: GOOD.recv }]);
	let e = store.getProfile('rolls', {})[`31|${ISLE}`];
	assert.deepEqual(e.seen, { [key(GOOD)]: 1 }, 'said twice the same day: one sighting');
	noteRolls(combo, [{ npcId: ISLE, give: COINS.give, recv: COINS.recv }]);
	e = store.getProfile('rolls', {})[`31|${ISLE}`];
	assert.deepEqual(e.seen, { [key(COINS)]: 1 }, 'the first answer was a slip');
	// An answer for an island the layout does not leave to chance is not a roll.
	noteRolls(combo, [{ npcId: 12345, give: 'x', recv: 'y' }]);
	assert.equal(store.getProfile('rolls', {})['31|12345'], undefined);
});

test('To Get’s today reads the material list, and says what cannot be done and why', () => {
	const page = materialPages()[0];
	const fixed = [...page.offers].filter(([, o]) => !o.options).slice(0, 5);
	V.board = { day: barterKey(), answers: [], own: false };
	V.matBoard = { day: barterKey(), answers: fixed.map(([npcId, o]) => ({ npcId, give: o.give, recv: o.recv })), on: [], used: {} };
	assert.deepEqual(todaySides(), { side: 'material', shown: 'material' });
	const [npcId, offer] = fixed[0];
	const want = offer.recv;
	const elsewhere = [...materialPages()].flatMap(p => [...p.offers.values()]).map(o => o.recv).find(r => !fixed.some(([, o]) => o.recv === r));
	store.setProfile('barterCount', 0);
	let t = todayFor({ [want]: 5, [elsewhere]: 3, 'Nothing Any Barter Pays': 2 });
	assert.equal(t.layout.list, 'material');
	const mine = t.blocked.find(d => d.npcId === npcId);
	assert.ok(mine, 'an island the count has not opened is listed as blocked');
	assert.equal(mine.state, offer.gate > 0 ? 'gate' : 'give');
	assert.ok(t.off.includes(elsewhere), 'what another layout pays is off today’s');
	assert.ok(!t.off.includes('Nothing Any Barter Pays'), 'what no barter pays is not "off today"');
	// Opened, and the good it takes held: doable, at the attempts left.
	store.setProfile('barterCount', 100000);
	store.setStock(offer.give, 10);
	t = todayFor({ [want]: 5 });
	const row = t.rows.find(r => r.item === want);
	assert.ok(row, 'the island is a row now');
	const deal = row.deals.find(d => d.npcId === npcId);
	assert.equal(deal.state, 'ok');
	assert.equal(deal.todayMin, deal.left * deal.recvMin);
	// Traded out today: done, not doable.
	V.matBoard.used = { [npcId]: offer.perDay };
	t = todayFor({ [want]: 5 });
	assert.equal(t.blocked.find(d => d.npcId === npcId).state, 'done');
	V.matBoard = { day: barterKey(), answers: [], on: [], used: {} };
});
