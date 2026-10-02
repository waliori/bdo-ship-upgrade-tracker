// Two tabs, one save, one Undo pressed in each.
//
// Each tab is its own copy of the store -- the module imported twice --
// over one localStorage, the way two tabs of the app share the disk.
// Storage events are handed over by hand, and late: the race is the
// other tab pressing Undo before it has heard of the first one's write.
// Whatever the order, the change is reversed once, and the change
// beneath it is not taken back in its place.

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

// One window for both, as far as the store can tell: what matters is
// which tab's storage listener is called, and what the store announces.
const said = [];
globalThis.window = {
	handlers: {},
	addEventListener(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); },
	dispatchEvent(evt) { said.push(evt.type); return true; }
};
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

const KEY = 'bdo-tracker/v2';
const disk = () => JSON.parse(localStorage.getItem(KEY));

/** Two fresh tabs over a save whose newest change put Steel from 10 to 20. */
async function twoTabs(name) {
	localStorage.store.clear();
	said.length = 0;
	window.handlers = {};
	const a = await import(`../js/state.js?tab=${name}-a`);
	const b = await import(`../js/state.js?tab=${name}-b`);
	a.init();
	a.setStock('Steel', 10);
	a.setStock('Steel', 20);
	a.flush();
	b.init();
	const [hearA, hearB] = window.handlers.storage;
	const history = a.getState().history;
	/** Deliver a write to the other tab, as the browser does. */
	const tell = { a: () => hearA({ key: KEY }), b: () => hearB({ key: KEY }) };
	return { a, b, tell, top: history.at(-1).label, below: history.at(-2).label };
}

test('both tabs press Undo before either hears of the other: the change goes back once', async () => {
	const { a, b, tell, top, below } = await twoTabs('locks');
	assert.ok(navigator.locks, 'this runs the Web Locks path');
	assert.equal(a.lastChange().id, b.lastChange().id, 'both tabs know the entry by the same id');

	assert.equal(a.undo(), top);
	assert.equal(a.getStock('Steel'), 10, 'the tab sees its Undo at once');
	b.undo();
	assert.equal(b.getStock('Steel'), 10);
	// Both writes wait on the lock; this request queues behind them.
	await navigator.locks.request('sail-undo', () => {});
	tell.b();
	tell.a();

	assert.equal(disk().stock.Steel, 10, 'not reversed twice, nor the change beneath it');
	assert.equal(a.getStock('Steel'), 10);
	assert.equal(b.getStock('Steel'), 10);
	assert.deepEqual(disk().history.map(e => e.label), [below]);
	assert.deepEqual(b.getState().history.map(e => e.id), a.getState().history.map(e => e.id));
	assert.equal(b.canRedo(), false, 'the tab whose Undo was dropped has nothing to redo');
	assert.ok(a.canRedo());
	assert.equal(said.filter(t => t === 'tracker-undo-gone').length, 1, 'and is told why once');
});

test('without Web Locks, the second Undo reads the first one\'s write and stops', async t => {
	const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
	Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
	t.after(() => Object.defineProperty(globalThis, 'navigator', real));

	const { a, b, tell, top } = await twoTabs('plain');
	assert.equal(a.undo(), top);
	assert.equal(disk().stock.Steel, 10, 'an Undo is written at once, not after the debounce');
	// B has not heard of it yet, and presses Undo on the same change.
	assert.equal(b.undo(), null, 'nothing is taken back a second time');
	assert.deepEqual(said, ['tracker-undo-gone']);
	assert.equal(b.getStock('Steel'), 10, 'and B now shows A\'s Undo');
	assert.equal(disk().stock.Steel, 10);
	tell.b();
	assert.equal(b.getStock('Steel'), 10, 'the late storage event changes nothing');

	// Redo goes through the same steps. B, not yet told of it, presses
	// Undo: the disk is read first, so what it takes back is the redo,
	// the newest change there is, and its toast names it.
	assert.equal(a.redo(), top);
	assert.equal(disk().stock.Steel, 20);
	assert.equal(b.undo(), top, 'B reads the redo before undoing');
	assert.equal(disk().stock.Steel, 10);
	assert.equal(a.undo(), null, 'and A, not yet told, does not undo it again');
	assert.equal(a.getStock('Steel'), 10);
});

test('a save from before ids gives every tab the same id for each entry', async () => {
	localStorage.store.clear();
	localStorage.setItem(KEY, JSON.stringify({
		v: 2, stock: { Steel: 20 }, targets: [], strategy: {},
		history: [{ t: 1700000000000, type: 'stock', label: '=20 Steel', delta: { Steel: 10 } }]
	}));
	window.handlers = {};
	const a = await import('../js/state.js?tab=old-a');
	const b = await import('../js/state.js?tab=old-b');
	a.init();
	b.init();
	assert.ok(a.lastChange().id, 'the old entry is given an id');
	assert.equal(a.lastChange().id, b.lastChange().id);
	assert.equal(a.undo(), '=20 Steel');
	assert.equal(a.getStock('Steel'), 10, 'and still undoes');
});
