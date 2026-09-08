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

// init() wires window and document listeners. The window keeps them, so
// a test can play the other tab by firing a storage event by hand.
globalThis.window = {
	handlers: {},
	addEventListener(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); },
	dispatchEvent() { return true; }
};
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
/** What the newest init() would hear from another tab's write. */
const otherTabWrote = () => window.handlers.storage.at(-1)({ key: 'bdo-tracker/v2' });

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

/* ------------------------------------------------------------------ *
 * route choices
 * ------------------------------------------------------------------ */

test('a route choice survives the disk, an adopt and a merge', () => {
	reset();
	store.setStrategy('Epheria Caravel', 'improved');
	store.setStrategy('Epheria Cog', 'pirates');
	store.setStrategy('Steel', 'buy');
	store.flush();
	const s = store.init();
	assert.equal(s.strategy['Epheria Caravel'], 'improved', 'the route is read back');
	assert.equal(s.strategy['Epheria Cog'], 'pirates');
	assert.equal(s.strategy['Steel'], 'buy');

	store.adopt({ stock: {}, targets: [], strategy: { 'Epheria Galleass': 'improved', 'Zinc Ingot': 'nonsense' } });
	assert.equal(store.getStrategy('Epheria Galleass'), 'improved');
	assert.equal(store.getStrategy('Zinc Ingot'), 'craft', 'a name no route has is dropped');

	store.merge({ stock: {}, targets: [], strategy: { 'Epheria Cog': 'pirates' } });
	assert.equal(store.getStrategy('Epheria Cog'), 'pirates');
	// And the undo stack keeps it too.
	store.undo();
	store.undo();
	assert.equal(store.getStrategy('Epheria Caravel'), 'improved');
});

/* ------------------------------------------------------------------ *
 * the other tab
 * ------------------------------------------------------------------ */

test('a tap inside the write debounce is not lost to another tab\'s save', () => {
	reset();
	store.flush();
	store.init();
	store.addStock('Steel', 5);              // pending, not yet on the disk
	assert.equal(store.getStock('Steel'), 15);
	// The other tab writes a count of its own.
	const disk = JSON.parse(localStorage.getItem(store.STORAGE_KEY));
	disk.stock['Cron Stone'] = 3;
	localStorage.setItem(store.STORAGE_KEY, JSON.stringify(disk));
	otherTabWrote();
	assert.equal(store.getStock('Cron Stone'), 3, 'theirs is taken');
	assert.equal(store.getStock('Steel'), 15, 'and ours is laid back on top');
	store.flush();
	const after = JSON.parse(localStorage.getItem(store.STORAGE_KEY));
	assert.equal(after.stock['Steel'], 15);
	assert.equal(after.stock['Cron Stone'], 3);
	assert.equal(after.history.at(-1).label, '+5 Steel', 'the change keeps its undo entry');
});

test('a preference saved in another tab does not empty this one\'s redo', () => {
	reset();
	store.flush();
	store.init();
	store.setStock('Steel', 1);
	store.flush();
	store.undo();
	store.flush();
	assert.ok(store.canRedo());
	const disk = JSON.parse(localStorage.getItem(store.STORAGE_KEY));
	disk.settings = { ...disk.settings, view: 'map' };
	localStorage.setItem(store.STORAGE_KEY, JSON.stringify(disk));
	otherTabWrote();
	assert.equal(store.getSetting('view'), 'map', 'the preference arrives');
	assert.ok(store.canRedo(), 'the redo stands: nothing it rests on moved');
	disk.stock['Steel'] = 99;
	localStorage.setItem(store.STORAGE_KEY, JSON.stringify(disk));
	otherTabWrote();
	assert.equal(store.getStock('Steel'), 99);
	assert.equal(store.canRedo(), false, 'a count changed over there forfeits it');
});

test('a merge keeps this browser\'s views over the file\'s, and takes the file\'s where it has none', () => {
	reset();
	store.setView('map', { mode: 'sail', stops: [1, 2] });
	store.merge({ stock: {}, targets: [], strategy: {}, profile: { views: { map: { mode: 'route' }, barter: { goal: 'material' } } } });
	assert.deepEqual(store.getView('map'), { mode: 'sail', stops: [1, 2] }, 'local stands');
	assert.deepEqual(store.getView('barter'), { goal: 'material' }, 'the file\'s arrives where local is silent');
	store.undo();
	assert.equal(store.getView('barter'), null);
	assert.deepEqual(store.getView('map'), { mode: 'sail', stops: [1, 2] });
});
