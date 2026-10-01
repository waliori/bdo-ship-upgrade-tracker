// The material book: the game's material layouts as pages, and today's
// answers weighed against them.

import test from 'node:test';
import assert from 'node:assert/strict';

import { fitOf, MIN_FIT } from '../js/material-book.js';

test('the counts are not the layout, and a page answered too thinly is not sure', () => {
	const page = (id, rows) => ({ id, times: 0, offers: new Map(rows.map(([npcId, give, recv]) => [npcId, { give, recv }])) });
	const pages = [
		page('M1', [[1, 'Rare Herb Pile', 'Seal'], [2, 'Steel', 'Glue'], [3, 'Pine Plywood', 'Coral'], [4, 'Ash Plywood', 'Tidal Black Stone']]),
		page('M2', [[1, 'Rare Herb Pile', 'Seal'], [2, 'Steel', 'Glue'], [3, 'Pine Plywood', 'Coral'], [4, 'Ash Plywood', 'Seaweed Stalk']])
	];
	// 34 seals where the layout says 25: the same exchange.
	const three = [{ npcId: 1, give: 'Rare Herb Pile', recv: 'Seal', recvN: 34 }, { npcId: 2, give: 'Steel', recv: 'Glue' }, { npcId: 3, give: 'Pine Plywood', recv: 'Coral' }];
	assert.ok(three.length >= MIN_FIT);
	const both = fitOf(three, pages);
	assert.equal(both.sure, false, 'two layouts agree at all three');
	assert.equal(both.splitter, 4, 'the island that tells them apart is named');
	const four = fitOf([...three, { npcId: 4, give: 'Ash Plywood', recv: 'Seaweed Stalk' }], pages);
	assert.ok(four.sure);
	assert.equal(four.best.page.id, 'M2');
});

test('with the game’s tables the book is its forty-one layouts, and every board recorded, read whole or in part, settles on the one it is', async () => {
	const { readFileSync } = await import('node:fs');
	const { useGame, materialPages } = await import('../js/barter-layouts.js');
	const { bookFromGame, fitOf } = await import('../js/material-book.js');
	const game = await import('../js/barter_game.js');
	useGame(game);
	const record = JSON.parse(readFileSync(new URL('../js/material_boards.json', import.meta.url), 'utf8'));
	const book = bookFromGame(materialPages());
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
