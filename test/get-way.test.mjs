// The way to get the list, read off the live state: one answer for To
// Get, the Plan's Next line and the Quests screen, kept until what it
// was made from changes.
//
// What can go wrong: a plan kept after the purse moved, or after the
// barter table or the odds were read again -- the key only asked
// whether they were there.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as store from '../js/state.js';
import { recompute, setBarterData } from '../js/ui-state.js';
import { theWay, getOrders, questDoneNow } from '../js/get-way.js';
import { periodKey } from '../js/clock.js';

const table = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));

test('the way is kept while nothing it reads has moved, and made again when something has', () => {
	assert.equal(theWay(), null, 'no plan yet, no way');
	store.addTarget('Tidal Black Stone', 50);
	recompute();
	setBarterData(table);
	const first = theWay();
	assert.ok(first && first.legs.length, 'a way for the shortfall');
	assert.equal(theWay(), first, 'asked again, the same answer');
	// The purse moved.
	store.setStock('Crow Coin', 5000);
	const second = theWay();
	assert.notEqual(second, first);
	// The barter table read again, as a new object: the plan is made
	// again from it, where "is there a table" said nothing had changed.
	setBarterData(JSON.parse(JSON.stringify(table)));
	assert.notEqual(theWay(), second);
});

test('the orders are cleaned, and a quest is done only for the period it is in', () => {
	const o = getOrders();
	assert.equal(typeof o, 'object');
	const q = { id: 'q-test', repeat: 'daily' };
	assert.equal(questDoneNow(q, {}), false);
	assert.equal(questDoneNow(q, { 'q-test': periodKey('daily') }), true);
	assert.equal(questDoneNow(q, { 'q-test': '1999-01-01' }), false, 'yesterday’s tick is not today’s');
});
