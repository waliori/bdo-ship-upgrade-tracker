// The save on the disk: what happens when it cannot be written, cannot
// be read, is bigger than the browser will take, comes from an older
// shape, or arrives by a link or a file that was made by hand.

import test from 'node:test';
import assert from 'node:assert/strict';

// A localStorage that can be told to refuse, the way a full browser does.
const disk = {
	store: new Map(),
	refuse: null,
	getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
	setItem(k, v) {
		if (this.refuse) throw this.refuse;
		this.store.set(k, String(v));
	},
	removeItem(k) { this.store.delete(k); },
	get length() { return this.store.size; },
	key(i) { return [...this.store.keys()][i] ?? null; }
};
globalThis.localStorage = disk;

const heard = [];
globalThis.window = {
	addEventListener() {},
	dispatchEvent(evt) { heard.push({ type: evt.type, detail: evt.detail }); return true; }
};
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

const store = await import('../js/state.js');
const KEY = store.STORAGE_KEY;

const quotaError = () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError', code: 22 });

const reset = () => store.adopt({
	stock: { 'Tidal Black Stone': 400, 'Steel': 10 },
	targets: [{ id: 't1', item: 'Panokseon', qty: 1, active: true, note: '' }],
	strategy: {},
	profile: {}
}, 'reset');

/* ------------------------------------------------------------------ *
 * a write that does not take
 * ------------------------------------------------------------------ */

test('a refused write is reported once per streak, and the recovery once', () => {
	reset();
	store.flush();
	heard.length = 0;
	assert.equal(store.saveHealth().ok, true);

	disk.refuse = quotaError();
	store.setStock('Steel', 11);
	store.flush();
	store.setStock('Steel', 12);
	store.flush();
	const health = store.saveHealth();
	assert.equal(health.ok, false);
	assert.equal(health.reason, 'quota');
	assert.ok(health.at instanceof Date);
	assert.deepEqual(heard.map(e => e.type), ['tracker-save-failed'], 'one event for two failures');
	assert.equal(heard[0].detail.reason, 'quota');

	disk.refuse = null;
	store.setStock('Steel', 13);
	store.flush();
	assert.equal(store.saveHealth().ok, true);
	assert.deepEqual(heard.map(e => e.type), ['tracker-save-failed', 'tracker-save-ok']);
	assert.equal(JSON.parse(disk.getItem(KEY)).stock['Steel'], 13);

	disk.refuse = new Error('SecurityError: access denied');
	store.setStock('Steel', 14);
	store.flush();
	assert.equal(store.saveHealth().reason, 'unavailable');
	disk.refuse = null;
});

test('the undo stack gives way before the save outgrows the budget', () => {
	reset();
	// Thirty builds with a long note each: the builds are under the budget
	// on their own, but every change to the list keeps the whole list, so
	// the history runs to many times that.
	const note = 'x'.repeat(20_000);
	for (let i = 0; i < 30; i++) store.addTarget(`Build ${i}`, 1, note);
	const entries = store.getState().history.length;
	store.flush();
	const text = disk.getItem(KEY);
	assert.ok(text.length <= 1_500_000, `${text.length} on the disk`);
	const saved = JSON.parse(text);
	assert.equal(saved.targets.length, 31, 'nothing the player made is lost');
	assert.ok(saved.history.length < entries, 'the oldest undo entries went');
	assert.ok(saved.history.length > 0, 'the newest stayed');
	assert.equal(saved.history.at(-1).label, 'Tracking Build 29');
	assert.equal(store.getState().history.length, saved.history.length, 'memory and disk agree');
});

/* ------------------------------------------------------------------ *
 * a save that cannot be read
 * ------------------------------------------------------------------ */

test('an unreadable save is kept beside its key, the newest two, before starting empty', () => {
	const tick = () => { const t = Date.now(); while (Date.now() === t) { /* the next millisecond */ } };
	const brokenKeys = () => [...disk.store.keys()].filter(k => k.startsWith(`${KEY}.broken-`)).sort();

	disk.setItem(KEY, '{"v":2,"stock":{"Steel":5},"targ');
	const s = store.init();
	assert.deepEqual(s.stock, {}, 'starts empty');
	const first = store.saveHealth().broken;
	assert.ok(first && first.startsWith(`${KEY}.broken-`));
	assert.equal(disk.getItem(first), '{"v":2,"stock":{"Steel":5},"targ', 'the text is kept whole');
	assert.deepEqual(store.brokenSave(), { key: first, text: '{"v":2,"stock":{"Steel":5},"targ' });

	tick();
	disk.setItem(KEY, 'second bad');
	store.init();
	tick();
	disk.setItem(KEY, 'third bad');
	store.init();
	const kept = brokenKeys();
	assert.equal(kept.length, 2, 'at most two copies');
	assert.ok(!kept.includes(first), 'the oldest went');
	assert.equal(disk.getItem(kept[1]), 'third bad');
	assert.equal(store.saveHealth().broken, kept[1]);

	// A good save reads normally and leaves the copies alone.
	disk.setItem(KEY, JSON.stringify({ v: 2, stock: { Steel: 5 }, targets: [], strategy: {} }));
	assert.equal(store.init().stock.Steel, 5);
	assert.equal(brokenKeys().length, 2);
	for (const k of brokenKeys()) disk.removeItem(k);
});

/* ------------------------------------------------------------------ *
 * older shapes
 * ------------------------------------------------------------------ */

test('a save from an older version is walked up through the migrations', () => {
	// A step installed for the test: a v1 blob that kept its counts under
	// another name.
	const was = store.MIGRATIONS[1];
	store.MIGRATIONS[1] = raw => ({ ...raw, stock: raw.counts || raw.stock });
	try {
		disk.setItem(KEY, JSON.stringify({ v: 1, counts: { Steel: 7 } }));
		const s = store.init();
		assert.equal(s.stock.Steel, 7, 'the step ran');
		assert.equal(s.v, 2, 'and the save is at the current version');
		store.flush();
		assert.equal(store.migrate({ v: 1, counts: { Steel: 1 } }).v, 2);
		assert.deepEqual(store.migrate({ v: 2, stock: {} }), { v: 2, stock: {} }, 'a current save is untouched');
		assert.deepEqual(store.migrate({ stock: {} }), { stock: {} }, 'no version, no guess');
		// adopt and merge read a file through the same steps.
		assert.equal(store.adopt({ v: 1, counts: { Steel: 9 } }).items, 1);
		assert.equal(store.getStock('Steel'), 9);
	} finally {
		store.MIGRATIONS[1] = was;
	}
});

test('a shared link goes through the same bounds as a save', () => {
	reset();
	const kept = store.capture();
	assert.ok(store.applyTransient(JSON.stringify({
		stock: { Steel: '12', Plank: -4, Rope: 'lots', Nail: 2.9 },
		targets: [{ item: 'Panokseon', qty: 'x' }, 'junk', { qty: 2 }],
		strategy: { Steel: 'steal', 'Epheria Cog': 'pirates' }
	})));
	assert.equal(store.getStock('Steel'), 12, 'a numeric string is a number');
	assert.equal(store.getStock('Plank'), 0, 'a negative is nothing');
	assert.equal(store.getStock('Rope'), 0);
	assert.equal(store.getStock('Nail'), 2);
	assert.equal(store.getTargets().length, 1);
	assert.equal(store.getTargets()[0].qty, 1);
	assert.equal(store.getStrategy('Steel'), 'craft');
	assert.equal(store.getStrategy('Epheria Cog'), 'pirates');
	store.restore(kept);
});

/* ------------------------------------------------------------------ *
 * a file looked over before it goes in
 * ------------------------------------------------------------------ */

test('inspectImport says what the file names that this build does not know', () => {
	const report = store.inspectImport({
		stock: { 'Steel': 3, 'Tidal Black Stone': 1, 'Crow Coin': 5, 'Silver': 9, '[Level 5] Azure Quartz': 2, 'Unobtainium': 1 },
		targets: [{ item: 'Panokseon' }, { item: 'Flying Dutchman' }, { item: 'Flying Dutchman' }],
		strategy: { 'Steel': 'buy', 'Epheria Caravel': 'improved', 'Epheria Caravel Two': 'improved', 'Epheria Cog': 'canoe' }
	});
	assert.equal(report.items, 6);
	assert.deepEqual(report.unknownItems, ['Unobtainium']);
	assert.deepEqual(report.unknownTargets, ['Flying Dutchman']);
	assert.deepEqual(report.unknownRoutes, [{ item: 'Epheria Caravel Two', route: 'improved' }, { item: 'Epheria Cog', route: 'canoe' }]);
	assert.deepEqual(store.inspectImport(null), { items: 0, unknownItems: [], unknownTargets: [], unknownRoutes: [] });
	// Reported, not refused.
	assert.equal(store.adopt({ stock: { Unobtainium: 1 }, targets: [], strategy: {} }).items, 1);
	assert.equal(store.getStock('Unobtainium'), 1);
});

/* ------------------------------------------------------------------ *
 * adopt and the places noted
 * ------------------------------------------------------------------ */

test('a save with no profile leaves the stash, pruned to the new counts', () => {
	store.adopt({ stock: { Steel: 10, Plank: 4 }, targets: [], strategy: {}, profile: { barterCount: 3, stash: { Steel: { Iliya: 6, Velia: 4 }, Plank: { Iliya: 4 } } } });
	store.adopt({ stock: { Steel: 7 }, targets: [], strategy: {} }, 'from an older device');
	assert.equal(store.getProfile('barterCount'), 3, 'the profile is kept');
	assert.deepEqual(store.getProfile('stash'), { Steel: { Iliya: 3, Velia: 4 } }, 'the unowned item is forgotten, the excess comes off the larger pile');
	assert.equal(store.stockAt('Steel', ''), 0);
	assert.equal(store.undo(), 'from an older device');
	assert.deepEqual(store.getProfile('stash'), { Steel: { Iliya: 6, Velia: 4 }, Plank: { Iliya: 4 } });
});
