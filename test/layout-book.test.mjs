// The layout book's sums: which layout a reading votes for, which
// readings are strays, and what a stray is nearest to.

import test from 'node:test';
import assert from 'node:assert/strict';

import { bookOf, nearestLayout, levelsOf, searchBook, answersOf, driftOf } from '../js/layout-book.js';

/** Three little layouts over five islands; any two part at three or more. */
const offer = (id, n) => [id, `[Level ${n}] Give ${id}-${n}`, '1', `[Level ${n + 1}] Pay ${id}-${n}`];
const COMBOS = [
	{ id: '1', seen: 9, offers: [offer(1, 1), offer(2, 1), offer(3, 1), offer(4, 1), [5, '[Level 5] Thing', '1', 'Crow Coin']] },
	{ id: '2', seen: 4, offers: [offer(1, 2), offer(2, 2), offer(3, 2), offer(4, 1), offer(5, 2)] },
	{ id: '3', seen: 1, offers: [offer(1, 3), offer(2, 3), offer(3, 1), offer(4, 3), offer(5, 3)] }
];
const reading = (id, day, offers, extra = {}) => ({ id, day, offers, at: id, seen: 0, name: null, mine: false, confirmed: false, ...extra });

test('a reading that pins one layout is a vote for it, with its name on it', () => {
	const book = bookOf(COMBOS, [
		reading(1, '2026-09-17', [offer(1, 2), offer(2, 2)], { name: 'Ahab', seen: 3 }),
		reading(2, '2026-09-18', [offer(5, 2)])
	]);
	const two = book.layouts.find(p => p.id === '2');
	assert.equal(two.sailors, 2);
	assert.equal(two.confirms, 3);
	assert.deepEqual(two.days, ['2026-09-18', '2026-09-17']);
	assert.equal(two.readers[0].name, 'Ahab');
	assert.equal(book.strays.length, 0);
});

test('a reading several layouts fit is evidence for none of them', () => {
	const book = bookOf(COMBOS, [reading(1, '2026-09-18', [offer(4, 1)])]);   // layouts 1 and 2 both show it
	assert.equal(book.open, 1);
	assert.ok(book.layouts.every(p => p.sailors === 0));
});

test('a reading nothing fits is a stray, and says what it is nearest to', () => {
	const moved = [7, '[Level 1] New give', '1', '[Level 2] New pay'];
	const drift = [offer(1, 1), offer(2, 1), offer(3, 1), [4, moved[1], '1', moved[3]]];
	const book = bookOf(COMBOS, [reading(1, '2026-09-18', drift, { name: 'Ishmael' })], { today: '2026-09-18' });
	assert.equal(book.strays.length, 1);
	const stray = book.strays[0];
	assert.equal(stray.today, true);
	assert.equal(stray.near.combo.id, '1');
	assert.equal(stray.near.agree, 3);
	assert.equal(stray.near.differ.length, 1);
	assert.equal(stray.near.differ[0].npcId, 4);
	assert.equal(stray.near.differ[0].filed.recv, '[Level 2] Pay 4-1');
	// three of the four are exchanges on file somewhere; the fourth is known nowhere
	assert.equal(stray.unknown, 1);
});

test('two sailors who read the same stray on one day are one board, and weigh more', () => {
	const odd = [9, 'A', '1', 'B'];
	const book = bookOf(COMBOS, [
		reading(1, '2026-09-18', [offer(1, 1), [2, 'X', '1', 'Y']], { seen: 2 }),
		reading(2, '2026-09-18', [[2, 'X', '1', 'Y'], offer(3, 1)]),
		reading(3, '2026-09-18', [[2, 'Q', '1', 'R'], odd]),                    // says island 2 shows something else: another board
		reading(4, '2026-09-16', [offer(1, 1), [2, 'X', '1', 'Y']])             // another day: another board
	]);
	assert.equal(book.strays.length, 3);
	const both = book.strays[0];
	assert.equal(both.readers.length, 2);
	assert.equal(both.said.length, 3);                                          // the union of what they saw
	assert.equal(both.weight, 4);                                               // two readers, two who saw the same
});

test('today\'s answers say which layouts stand and which one it is', () => {
	const open = bookOf(COMBOS, [], { answers: answersOf([offer(4, 1)]) });
	assert.equal(open.standing, 2);
	assert.ok(open.layouts.every(p => !p.today));
	const pinned = bookOf(COMBOS, [], { answers: answersOf([offer(4, 1), offer(1, 2)]) });
	assert.equal(pinned.standing, 1);
	assert.equal(pinned.layouts.find(p => p.today).id, '2');
	const none = bookOf(COMBOS, []);
	assert.equal(none.standing, 3);
});

test('the nearest layout is the one that parts at fewest islands, then agrees at most', () => {
	const near = nearestLayout(COMBOS, answersOf([offer(1, 3), offer(2, 3), offer(3, 1), offer(4, 1)]));
	assert.equal(near.combo.id, '3');
	assert.equal(near.differ.length, 1);
});

test('a board is summed up by the levels it pays', () => {
	const lv = levelsOf(COMBOS[0]);
	assert.equal(lv[2], 4);
	assert.equal(lv.coin, 1);
});

test('a word finds the layouts that deal it, by good or by island', () => {
	const pages = bookOf(COMBOS, []).layouts;
	const nameOf = id => (id === 5 ? 'Tinberra Island' : `Isle ${id}`);
	assert.deepEqual(searchBook(pages, 'crow', nameOf).map(x => x.page.id), ['1']);
	assert.deepEqual(searchBook(pages, 'tinberra', nameOf).map(x => x.page.id), ['1', '2', '3']);
	assert.deepEqual([...searchBook(pages, 'give 2-3', nameOf)[0].hits], [2]);
	assert.equal(searchBook(pages, '', nameOf).length, 3);
	assert.deepEqual(searchBook(pages, '3', nameOf).map(x => x.page.id), ['3']);   // a number is a layout's number
});

test('a layout with a slot moved is that layout, with the slot as it was seen', () => {
	const moved = { npcId: 4, give: '[Level 1] New give', recv: '[Level 2] New pay' };
	const saw = [...answersOf([offer(1, 1), offer(2, 1), offer(3, 1)]), moved];
	const board = driftOf(COMBOS, saw);
	assert.ok(board);
	assert.equal(board.id, '1');
	assert.deepEqual(board.patched, [4]);
	assert.deepEqual(board.offers.find(o => o[0] === 4), [4, moved.give, '1', moved.recv]);
	assert.deepEqual(board.offers.find(o => o[0] === 5), COMBOS[0].offers[4]);   // the rest is the record's
	assert.equal(board.was[0].filed.recv, '[Level 2] Pay 4-1');
	assert.equal(COMBOS[0].offers[3][1], '[Level 1] Give 4-1');                  // and the record is not written on
});

test('one odd island and nothing else is not a layout', () => {
	const moved = { npcId: 4, give: 'X', recv: 'Y' };
	assert.equal(driftOf(COMBOS, [moved]), null);
	assert.equal(driftOf(COMBOS, [...answersOf([offer(1, 1)]), moved]), null);   // one island agreeing is not enough to hang it on
});

test('a reading that fits a layout has not drifted, and one that fits nothing at all has not either', () => {
	assert.equal(driftOf(COMBOS, answersOf([offer(1, 1), offer(2, 1)])), null);
	const strange = [1, 2, 3, 4, 5].map(id => ({ npcId: id, give: `G${id}`, recv: `R${id}` }));
	assert.equal(driftOf(COMBOS, strange), null);
});

test('a sailor\'s own log says which boards they are dealt, and how often', () => {
	const book = bookOf(COMBOS, [], { log: [['2026-09-10', '2', 0], ['2026-09-12', '2', 1], ['2026-09-11', '3', 0], ['2026-09-13', '99', 0]] });
	assert.equal(book.dealt, 3);                                // a layout no longer on file is not counted
	const two = book.layouts.find(p => p.id === '2');
	assert.equal(two.mine, 2);
	assert.equal(two.mineEdited, 1);
	assert.equal(two.mineLast, '2026-09-12');
	assert.equal(book.layouts.find(p => p.id === '1').mine, 0);
});
