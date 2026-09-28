// The material book: readings of the material list made into boards,
// and today's answers weighed against them.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { offersOf, compare, sameBoard, boardsOf, bookOf, fitOf, seenOn, MIN_FIT } from '../js/material-book.js';

const record = JSON.parse(await readFile(new URL('../js/material_boards.json', import.meta.url), 'utf8'));
const byId = id => record.boards.find(b => b.id === id);
const answersOf = (rows, n) => rows.slice(0, n).map(o => ({ npcId: o[0], give: o[1], recv: o[3] }));

test('every recorded board is its own board: none of the five is another seen twice', () => {
	const pages = bookOf(boardsOf(record));
	assert.equal(pages.length, record.boards.length);
	for (const p of pages) assert.equal(p.times, 1);
	// A and B share a good part of their islands, and are still two boards
	const c = compare(offersOf(byId('A').offers), offersOf(byId('B').offers));
	assert.ok(c.agree >= 10 && c.differ.length >= 10);
	assert.equal(sameBoard(c), false);
});

test('the counts are not the board: 25 seals and 34 seals is the same exchange', () => {
	const a = offersOf([[1, 'Rare Herb Pile', 1, 'Seal', 25, 2]]);
	const b = offersOf([[1, 'Rare Herb Pile', 1, 'Seal', 34, 2]]);
	assert.deepEqual(compare(a, b), { agree: 1, differ: [] });
});

test('a page of the window is enough to know the board again, and the rest is offered', () => {
	const pages = bookOf(boardsOf(record));
	const E = byId('E').offers;
	assert.equal(fitOf(answersOf(E, MIN_FIT - 1), pages).sure, false, 'too few to say');
	const fit = fitOf(answersOf(E, 6), pages);
	assert.equal(fit.sure, true);
	assert.equal(fit.best.page.id, 'E');
	assert.equal(fit.fill.length, E.length - 6);
	assert.ok(fit.fill.every(o => !E.slice(0, 6).some(r => r[0] === o.npcId)), 'an island answered is never filled over');
});

test('answers that part from every board fit none', () => {
	const pages = bookOf(boardsOf(record));
	const A = byId('A').offers;
	const odd = answersOf(A, 4).map(a => ({ ...a, give: 'Something Else' }));
	const fit = fitOf(odd, pages);
	assert.equal(fit.sure, false);
	assert.equal(fit.standing.filter(w => w.agree >= MIN_FIT).length, 0);
});

test('two boards that both fit are named as such, with the island that tells them apart', () => {
	const shared = [[1, 'g1', 1, 'm1'], [2, 'g2', 1, 'm2'], [3, 'g3', 1, 'm3']];
	const pad = (tag, n) => Array.from({ length: n }, (_, i) => [100 + i, `${tag}${i}`, 1, `r${i}`]);
	const rec = { boards: [{ id: 'X', offers: [...shared, ...pad('x', 10)] }, { id: 'Y', offers: [...shared, ...pad('y', 10)] }] };
	const fit = fitOf(answersOf(shared, 3), bookOf(boardsOf(rec)));
	assert.equal(fit.sure, false);
	assert.equal(fit.standing.filter(w => w.agree >= MIN_FIT).length, 2);
	assert.ok(fit.splitter >= 100);
});

test('the fleet reading a recorded board again makes it a board read twice', () => {
	const E = byId('E').offers;
	const fleet = [
		{ id: 7, day: '2026-10-20', name: 'Oni', seen: 1, offers: E.map(o => [o[0], o[1], '1', o[3]]) },
		// a second sailor the same day, one island misread: outvoted
		{ id: 8, day: '2026-10-20', name: null, seen: 0, offers: [[E[0][0], 'Misread', '1', E[0][3]]] }
	];
	const boards = boardsOf(record, fleet);
	const day = boards.find(b => b.key === 'day:2026-10-20');
	assert.equal(day.offers.get(E[0][0]).give, E[0][1]);
	assert.equal(day.readers.length, 2);
	const pages = bookOf(boards);
	const e = pages.find(p => p.id === 'E');
	assert.equal(e.times, 2);
	assert.deepEqual(e.days, ['2026-09-22', '2026-10-20']);
	assert.equal(pages.length, record.boards.length);
});

test('a board nobody has on file is named for the day it was read', () => {
	const fresh = Array.from({ length: 12 }, (_, i) => [58900 + i, `give${i}`, '1', 'Cobalt Ingot']);
	const pages = bookOf(boardsOf(record, [{ id: 9, day: '2026-11-02', offers: fresh }]));
	const p = pages.find(x => !x.filed);
	assert.equal(p.id, '2026-11-02');
	assert.deepEqual(p.tally, [['Cobalt Ingot', 12]]);
	// and a reading too small to be a board is not one in the book
	assert.equal(bookOf(boardsOf(null, [{ id: 10, day: '2026-11-03', offers: fresh.slice(0, 4) }])).length, 0);
});

test('an island\'s exchange is counted on the boards that named anything', () => {
	const pages = bookOf(boardsOf(record));
	const o = byId('E').offers[0];
	const s = seenOn(pages, o[0], o[1], o[3]);
	assert.equal(s.of, record.boards.length);
	assert.ok(s.n >= 1);
});

test('with the game’s tables the book is its forty-one layouts, and every board recorded, read whole or in part, settles on the one it is', async () => {
	const { readFileSync } = await import('node:fs');
	const { useGame, materialPages } = await import('../js/barter-layouts.js');
	const { bookFromGame, fitOf } = await import('../js/material-book.js');
	const game = await import('../js/barter_game.js');
	useGame(game);
	const record = JSON.parse(readFileSync(new URL('../js/material_boards.json', import.meta.url), 'utf8'));
	const book = bookFromGame(materialPages(), []);
	assert.equal(book.filter(p => p.game).length, 41);
	// The recorded boards are named by their letters; the layouts by their row.
	const idOf = letter => `M${game.LAYOUTS.material[letter] + 1}`;
	for (const b of record.boards) {
		const all = b.offers.map(o => ({ npcId: o[0], give: o[1], recv: o[3] }));
		const fit = fitOf(all, book);
		assert.ok(fit.sure && fit.best.page.id === idOf(b.id), `the whole of board ${b.id} settles on ${idOf(b.id)}`);
		// what it fills in is never a slot left to chance
		assert.ok(fit.fill.every(o => !o.options && !(o.chance < 0.5)));
	}
	// Three islands of board C are enough.
	const c = record.boards.find(b => b.id === 'C').offers.slice(0, 3).map(o => ({ npcId: o[0], give: o[1], recv: o[3] }));
	assert.equal(fitOf(c, book).best.page.id, idOf('C'));
});
