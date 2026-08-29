// The store's promises about not losing or inventing anything: a merge
// keeps the higher count, the tour leaves no fingerprints, and a save
// is believed only as far as it can be verified.

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
	store: new Map(),
	getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
	setItem(k, v) { this.store.set(k, String(v)); },
	removeItem(k) { this.store.delete(k); },
	get length() { return this.store.size; },
	key(i) { return [...this.store.keys()][i] ?? null; }
};

// init() wires window and document listeners; nothing here dispatches.
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

const store = await import('../js/state.js');

const reset = () => store.adopt({
	stock: { 'Tidal Black Stone': 400, 'Steel': 10 },
	targets: [{ id: 't1', item: 'Panokseon', qty: 1, active: true, note: '' }],
	strategy: { 'Steel': 'buy' },
	profile: { barterCount: 50 }
}, 'reset');

test('a merge keeps the higher count and never sums', () => {
	reset();
	const out = store.merge({
		stock: { 'Tidal Black Stone': 100, 'Steel': 25, 'Cron Stone': 7 },
		targets: [
			{ id: 'x', item: 'Panokseon', qty: 3 },
			{ id: 'y', item: 'Epheria Caravel', qty: 1 }
		],
		strategy: { 'Steel': 'craft', 'Zinc Ingot': 'buy' },
		profile: { barterCount: 999, valuePack: true }
	});
	assert.equal(store.getStock('Tidal Black Stone'), 400, 'the higher count stands');
	assert.equal(store.getStock('Steel'), 25, 'the file\'s higher count wins');
	assert.equal(store.getStock('Cron Stone'), 7, 'a new item arrives');
	assert.deepEqual(out, { items: 2, targets: 1 });
	assert.equal(store.getTargets().length, 2);
	assert.equal(store.getTargets()[0].qty, 1, 'an existing build is not re-quantified');
	assert.equal(store.getStrategy('Steel'), 'buy', 'a choice made here stands');
	assert.equal(store.getStrategy('Zinc Ingot'), 'buy', 'a choice only the file made arrives');
	assert.equal(store.getProfile('barterCount'), 50, 'a profile field here is not overwritten');
	assert.equal(store.getProfile('valuePack'), true, 'a field only the file had arrives');
	assert.equal(store.undo(), 'Merged tracker data');
	assert.equal(store.getStock('Cron Stone'), 0);
	assert.equal(store.getTargets().length, 1);
});

test('the tour leaves no fingerprints on the undo history', () => {
	reset();
	const before = store.getState().history.length;
	const snapshot = store.capture();
	assert.ok(store.applyTransient(JSON.stringify({ stock: { 'Steel': 1 }, targets: [], strategy: {} })));
	assert.equal(store.isTransient(), true);
	// Demo actions mutate the demo but record nothing.
	store.addStock('Steel', 5);
	assert.equal(store.getStock('Steel'), 6);
	assert.equal(store.getState().history.length, before);
	assert.equal(store.canUndo(), false);
	assert.equal(store.undo(), null, 'undo is inert mid-tour');
	assert.ok(store.restore(snapshot));
	assert.equal(store.isTransient(), false);
	assert.equal(store.getStock('Steel'), 10, 'the real stock is back');
	assert.equal(store.getState().history.length, before);
});

test('a real change is not lost to a tour started inside the write debounce', () => {
	reset();
	store.flush();
	store.setStock('Steel', 77);
	const snapshot = store.capture();
	store.applyTransient(JSON.stringify({ stock: {}, targets: [], strategy: {} }));
	store.restore(snapshot);
	store.flush();
	const disk = JSON.parse(localStorage.getItem(store.STORAGE_KEY));
	assert.equal(disk.stock['Steel'], 77);
});

test('a corrupted history entry is dropped rather than applied', () => {
	reset();
	store.flush();
	const disk = JSON.parse(localStorage.getItem(store.STORAGE_KEY));
	disk.history = [
		{ t: 1, type: 'stock', label: 'bad', delta: { 'Steel': 'x' } },
		{ t: 2, type: 'stock', label: 'good', delta: { 'Steel': 3, 'Nothing': 0 } },
		'garbage',
		{ t: 3, type: 'target', label: 'shape', prevTargets: [{ item: 'Panokseon' }, null, 4] }
	];
	localStorage.setItem(store.STORAGE_KEY, JSON.stringify(disk));
	// A fresh read of the disk is what init() does; adopt() is the closest
	// thing exposed, so go through the same normaliser by reading raw.
	const s = store.init();
	assert.equal(s.history.length, 2);
	assert.deepEqual(s.history[0].delta, { 'Steel': 3 });
	assert.equal(s.history[1].prevTargets.length, 1);
	assert.equal(s.history[1].prevTargets[0].qty, 1);
});

test('a newer schema\'s fields ride along instead of being stripped', () => {
	reset();
	store.flush();
	const disk = JSON.parse(localStorage.getItem(store.STORAGE_KEY));
	disk.v = 3;
	disk.fleet = { flagship: 'Panokseon' };
	localStorage.setItem(store.STORAGE_KEY, JSON.stringify(disk));
	const s = store.init();
	assert.equal(s.v, 3);
	assert.deepEqual(s.fleet, { flagship: 'Panokseon' });
	store.setStock('Steel', 11);
	store.flush();
	const again = JSON.parse(localStorage.getItem(store.STORAGE_KEY));
	assert.deepEqual(again.fleet, { flagship: 'Panokseon' });
	assert.equal(again.v, 3);
});
