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
const { routeOf } = await import('../js/planner.js');

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
	assert.equal(routeOf('Epheria Caravel', s.strategy), 'improved', 'the route is read back');
	assert.equal(routeOf('Epheria Cog', s.strategy), 'pirates');
	assert.equal(s.strategy['Steel'], 'buy');

	// A save from before the route had a key of its own: moved on load.
	store.adopt({ stock: {}, targets: [], strategy: { 'Epheria Galleass': 'improved', 'Zinc Ingot': 'nonsense' } });
	assert.equal(routeOf('Epheria Galleass', store.getAllStrategy()), 'improved');
	assert.equal(store.getAllStrategy()['route:Epheria Galleass'], 'improved');
	assert.equal(store.getStrategy('Epheria Galleass'), 'craft');
	assert.equal(store.getStrategy('Zinc Ingot'), 'craft', 'a name no route has is dropped');

	store.merge({ stock: {}, targets: [], strategy: { 'Epheria Cog': 'pirates' } });
	assert.equal(routeOf('Epheria Cog', store.getAllStrategy()), 'pirates');
	// And the undo stack keeps it too.
	store.undo();
	store.undo();
	assert.equal(routeOf('Epheria Caravel', store.getAllStrategy()), 'improved');
});

test('the route and the buy-or-craft choice are kept apart', () => {
	reset();
	const ARTIFACT = "Cox Pirates' Artifact (Combat)";
	store.setStrategy(ARTIFACT, 'buy');
	store.setStrategy(ARTIFACT, 'cannons');
	assert.equal(store.getStrategy(ARTIFACT), 'buy', 'picking a route does not switch a bought item to crafted');
	assert.equal(routeOf(ARTIFACT, store.getAllStrategy()), 'cannons');
	store.setStrategy(ARTIFACT, 'craft');
	assert.equal(routeOf(ARTIFACT, store.getAllStrategy()), 'cannons', 'and crafting it keeps the route');
	// An old save that kept the route in the item's own slot was crafting it.
	store.adopt({ stock: {}, targets: [], strategy: { [ARTIFACT]: 'cannons' } });
	assert.equal(store.getStrategy(ARTIFACT), 'craft');
	assert.equal(routeOf(ARTIFACT, store.getAllStrategy()), 'cannons');
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

/* ------------------------------------------------------------------ *
 * a look inside a look
 * ------------------------------------------------------------------ */

const onDisk = () => JSON.parse(localStorage.getItem(store.STORAGE_KEY));

test('the tour over a shared plan puts the look back, and never saves the plan as the player\'s', async () => {
	reset();
	store.flush();
	store.init();
	// Look around a shared plan...
	const mine = store.capture();
	store.applyTransient(JSON.stringify({ stock: { 'Pine Plywood': 3 }, targets: [], strategy: {} }));
	// ...start the tour over it, and finish the tour.
	const look = store.capture();
	store.applyTransient(JSON.stringify({ stock: { Demo: 1 }, targets: [], strategy: {} }));
	assert.ok(store.restore(look));
	await new Promise(r => setTimeout(r, 200));
	assert.equal(store.isTransient(), true, 'still looking');
	assert.equal(store.getStock('Pine Plywood'), 3, 'the shared plan is back on screen');
	assert.equal(onDisk().stock['Pine Plywood'], undefined, 'and was never written');
	assert.equal(onDisk().stock['Tidal Black Stone'], 400);
	// "Back to mine".
	assert.ok(store.restore(mine));
	assert.equal(store.isTransient(), false);
	assert.equal(store.getStock('Tidal Black Stone'), 400);
});

test('a look ended underneath the tour is not brought back by the tour', () => {
	reset();
	const mine = store.capture();
	store.applyTransient(JSON.stringify({ stock: { 'Pine Plywood': 3 }, targets: [], strategy: {} }));
	const look = store.capture();
	store.applyTransient(JSON.stringify({ stock: { Demo: 1 }, targets: [], strategy: {} }));
	store.restore(mine);
	assert.equal(store.restore(look), false);
	assert.equal(store.isTransient(), false);
	assert.equal(store.getStock('Pine Plywood'), 0);
});

test('an edit made just before a look survives another tab saving during it', () => {
	reset();
	store.flush();
	store.init();
	store.setStock('Steel', 33);              // inside the debounce
	const mine = store.capture();
	store.applyTransient(JSON.stringify({ stock: {}, targets: [], strategy: {} }));
	const disk = onDisk();
	disk.stock['Cron Stone'] = 4;
	localStorage.setItem(store.STORAGE_KEY, JSON.stringify(disk));
	otherTabWrote();
	store.restore(mine);
	assert.equal(store.getStock('Cron Stone'), 4, 'theirs is taken');
	assert.equal(store.getStock('Steel'), 33, 'and the edit made here is not lost');
	store.flush();
	assert.equal(onDisk().stock['Steel'], 33);
});

test('one Undo is not applied twice when another tab saves inside the debounce', () => {
	reset();
	store.flush();
	store.init();
	store.setStock('Steel', 20);
	store.flush();
	const was = store.getState().history.length;
	store.undo();                             // pending: Steel back to 10
	// The other tab saves first, its history still holding the change.
	const disk = onDisk();
	disk.settings = { ...disk.settings, theme: 'dark' };
	localStorage.setItem(store.STORAGE_KEY, JSON.stringify(disk));
	otherTabWrote();
	assert.equal(store.getStock('Steel'), 10);
	assert.equal(store.getState().history.length, was - 1, 'the undone entry is gone from the history taken in');
	assert.notEqual(store.lastChange() && store.lastChange().label, '=20 Steel');
	store.undo();
	assert.notEqual(store.getStock('Steel'), 0, 'a second Undo does not reverse the same change again');
});

/* ------------------------------------------------------------------ *
 * taking something from a link
 * ------------------------------------------------------------------ */

test('taking a slim shared plan keeps the views and diaries the link never carried', async () => {
	const { SLIM_DROP } = await import('../js/share.js');
	reset();
	store.setProfileMany({ runs: [{ day: '2026-09-30', silver: 5 }], views: { map: { mode: 'sail' } } }, 'mine');
	const viewsBefore = store.getProfile('views');
	const runsBefore = store.getProfile('runs');
	store.adopt({ stock: { Steel: 1 }, targets: [], strategy: {}, profile: { barterCount: 9 } }, 'Took a shared plan', { keepAbsent: SLIM_DROP });
	assert.equal(store.getStock('Steel'), 1);
	assert.equal(store.getProfile('barterCount'), 9, 'what the link carried is taken');
	assert.deepEqual(store.getProfile('views'), viewsBefore, 'the traces and screens here stay');
	assert.deepEqual(store.getProfile('runs'), runsBefore, 'the run log stays');
	// A plain adopt -- a file, a synced copy -- still replaces the lot.
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { barterCount: 9 } }, 'file');
	assert.equal(store.getProfile('views'), null);
});

test('"Make it my ship" brings the crew aboard beside the roster here', async () => {
	const { shipSetupPatch } = await import('../js/screen-crew.js');
	const { shipStats } = await import('../js/ship_stats.js');
	const ship = Object.keys(shipStats).find(s => shipStats[s].crew > 0);
	reset();
	const mine = [{ id: 'sA', name: 'Ana', type: 'Ahto', lv: 5, cond: 100 }, { id: 'sB', name: 'Bo', type: 'Ahto', lv: 3, cond: 100 }];
	const other = 'Some Other Hull';
	store.setProfileMany({ roster: mine, seats: { [other]: { 'sail:1': 'sA' } } }, 'mine');
	const link = { ship, fitted: {}, crystal: null, roster: [{ id: '0', name: 'Cid', type: 'Ahto', lv: 8, cond: 100 }, { id: '1', name: 'Ana', type: 'Ahto', lv: 5, cond: 100 }], seats: { 'sail:1': '0', 'wheel:1': '1' } };
	const patch = shipSetupPatch(link, undefined, { join: true });
	assert.equal(patch.roster.length, 3, 'Cid joins; Ana is the one already here');
	assert.deepEqual(patch.roster.slice(0, 2), mine, 'the roster here is kept as it was');
	const cid = patch.roster[2];
	assert.equal(cid.name, 'Cid');
	assert.notEqual(cid.id, '0', 'a fresh id, not the link\'s');
	assert.deepEqual(patch.seats[ship], { 'sail:1': cid.id, 'wheel:1': 'sA' });
	assert.deepEqual(patch.seats[other], { 'sail:1': 'sA' }, 'seats on other hulls are untouched');

	const empty = shipSetupPatch({ ...link, roster: [], seats: {} }, undefined, { join: true });
	assert.equal(empty.roster, undefined, 'a link with no crew leaves the roster alone');
	assert.equal(empty.seats, undefined);
	// Only looking still shows their crew in place of yours.
	assert.equal(shipSetupPatch(link).roster, link.roster);
});
