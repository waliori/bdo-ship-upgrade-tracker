// The hold and the goods: the readings of the table every barter
// planner shares, what a good weighs and pays, and the slots it takes.
//
// What can go wrong: a stock read with the materials in it, a [Great
// Ocean] good priced as a plain [Level 5], a rare pay priced at
// nothing, or a bag that stacks goods the game does not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { exchanges, goodsHeld, weightOf, sellOf, stacks, bagSlotsOf, slotsHeld, slotFit, rankOf, isGreatOcean } from '../js/barter-plan.js';
import { GOODS } from '../js/barter.js';
import { sellable, PLAIN_ORDERS } from '../js/barter-orders.js';

const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));

test('the table flattens to one row an exchange, and a stock to its goods', () => {
	const rows = exchanges(barterData);
	assert.equal(rows.length, barterData.reduce((a, e) => a + e.sources.length, 0));
	assert.ok(rows.every(r => r.recv > 0 && r.giveN > 0 && r.tries > 0));
	const held = goodsHeld({ '[Level 3] Ancient Orders': 4, 'Tidal Black Stone': 9, '[Level 1] Raft Toy': 0 });
	assert.deepEqual([...held], [['[Level 3] Ancient Orders', 4]]);
	assert.equal(weightOf('[Level 6] Brass Bowl Crate'), GOODS[6].weight);
	assert.equal(sellOf('[Level 2] Filtered Drinking Water'), 0);
	assert.equal(sellOf('Tidal Black Stone'), 0);
});

test('the [Great Ocean] goods and the rare pays sell at their own price', () => {
	// BDOCodex 800073: a Rust Repair Tool sells for 25,000,000, a plain
	// [Level 5] (Statue's Tear, 800061) for 10,000,000.
	assert.equal(sellOf('[Level 5] Rust Repair Tool'), 25000000);
	assert.equal(sellOf("[Level 5] Cox Pirates' Journal"), 25000000);
	assert.equal(sellOf("[Level 5] Statue's Tear"), GOODS[5].sell);
	// The rare pays have no level and used to read as worth nothing.
	assert.equal(sellOf('Golden Galley Figurine'), 100000000);
	assert.equal(sellOf('Elaborate Pearl Necklace'), 30000000);
	assert.equal(sellOf('Obsidian Crystal Bracelet'), 50000000);
	assert.equal(weightOf('Obsidian Crystal Bracelet'), 0.1);
	assert.equal(weightOf('[Level 5] Rust Repair Tool'), GOODS[5].weight);
	// They sell at a wharf as a [Level 7] does.
	assert.ok(sellable('Golden Galley Figurine', { ...PLAIN_ORDERS, sell: 7 }));
	assert.ok(!sellable('Tidal Black Stone', { ...PLAIN_ORDERS, sell: 3 }));
});

test('a [Level 5] and up takes a slot a unit; the levels under it stack', () => {
	assert.ok(stacks('[Level 4] Old Chest with Gold Coins'));
	assert.ok(!stacks("[Level 5] Statue's Tear"));
	assert.ok(!stacks('[Level 7] Heidelian Wine'));
	assert.ok(!stacks('Obsidian Crystal Bracelet'));
	const bag = new Map([['[Level 4] Old Chest with Gold Coins', 12], ["[Level 5] Statue's Tear", 3], ['[Level 6] Brass Bowl Crate', 2], ['[Level 3] Ancient Orders', 0]]);
	assert.equal(bagSlotsOf(bag), 1 + 3 + 2, 'twelve chests in one slot, every [Level 5] and [Level 6] in its own');
});

test('the hold and a storage count slots as the bag does, and a load fits as far as the slots go', () => {
	const hold = new Map([['[Level 4] Old Chest with Gold Coins', 40], ["[Level 5] Statue's Tear", 18], ['Cactus Rind', 300]]);
	assert.equal(slotsHeld(hold), 1 + 18 + 1, 'a kind of [Level 4] and of a shore good, a slot each [Level 5]');
	// A Volante: twenty slots, all of them taken by the hold above, so
	// no other [Level 5] -- but any number more of the chests.
	assert.equal(slotFit("[Level 5] Statue's Tear", 5, 18, 20, 20), 0, 'no slot left for another');
	assert.equal(slotFit("[Level 5] Azure Quartz", 5, 0, 18, 20), 2, 'two free slots, two more');
	assert.equal(slotFit('[Level 4] Old Chest with Gold Coins', 500, 40, 20, 20), 500, 'a kind already aboard stacks on');
	assert.equal(slotFit('[Level 4] Panacea', 5, 0, 20, 20), 0, 'a new kind wants a slot of its own');
	assert.equal(slotFit('[Level 4] Panacea', 5, 0, 19, 20), 5);
	assert.equal(slotFit("[Level 5] Statue's Tear", 5, 0, 0, Infinity), 5, 'no cap, no limit');
});

test('a [Great Ocean] good stands above a [Level 5] and below a [Level 6] in every order the planner keeps', () => {
	const ocean = "[Level 5] Cox Pirates' Journal";
	assert.ok(isGreatOcean(ocean) && isGreatOcean("[Great Ocean] Cox Pirates' Journal"));
	assert.ok(!isGreatOcean("[Level 5] Statue's Tear"));
	assert.ok(rankOf("[Level 5] Statue's Tear") < rankOf(ocean), 'above a [Level 5]');
	assert.ok(rankOf(ocean) < rankOf('[Level 6] Brass Bowl Crate'), 'below a [Level 6]');
	assert.ok(rankOf('[Level 6] Brass Bowl Crate') < rankOf('[Level 7] Golden Flour Sack'));
	assert.ok(!stacks(ocean), 'and a slot each, as a [Level 5]');
	const sorted = ['[Level 7] Golden Flour Sack', "[Level 5] Statue's Tear", '[Level 6] Brass Bowl Crate', ocean].sort((a, b) => rankOf(b) - rankOf(a));
	assert.deepEqual(sorted, ['[Level 7] Golden Flour Sack', '[Level 6] Brass Bowl Crate', ocean, "[Level 5] Statue's Tear"]);
	// The orders' "sell from Level N": kept from Level 6 up, sold from 5.
	assert.ok(sellable(ocean, { ...PLAIN_ORDERS, sell: 5 }));
	assert.ok(!sellable(ocean, { ...PLAIN_ORDERS, sell: 6 }), 'a wharf selling from Level 6 keeps it');
	assert.ok(sellable('[Level 6] Brass Bowl Crate', { ...PLAIN_ORDERS, sell: 6 }));
});
