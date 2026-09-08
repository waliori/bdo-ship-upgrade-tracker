// The screens' views in the profile: the Map's run and traces, the
// Barter tab's board and wants, kept per profile and bounded so a save
// stays small and a hostile file cannot make it otherwise.

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
globalThis.window = { addEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

const store = await import('../js/state.js');
const { readProfile, readView, VIEW_BYTES } = await import('../js/profile-shape.js');

const reset = () => store.adopt({ stock: { Steel: 1 }, targets: [], strategy: {}, profile: {} }, 'reset');

/* ------------------------------------------------------------------ *
 * the shape
 * ------------------------------------------------------------------ */

test('only the two screens may keep a view, and only sound values', () => {
	const p = readProfile({ views: {
		map: { mode: 'sail', panelOpen: true, zoom: 3.5, bad: Infinity, worse: NaN, note: 'x'.repeat(200), nested: { deep: { ok: 1 } }, fn: () => 1 },
		barter: { goal: 'material', wants: { Steel: 5 } },
		inventory: { sort: 'name' },
		list: [1, 2]
	} });
	assert.deepEqual(Object.keys(p.views), ['map', 'barter']);
	assert.equal(p.views.map.mode, 'sail');
	assert.equal(p.views.map.zoom, 3.5);
	assert.ok(!('bad' in p.views.map) && !('worse' in p.views.map) && !('fn' in p.views.map), 'nothing that is not a number, a string, a flag or a shape');
	assert.equal(p.views.map.note.length, 120, 'strings are clipped');
	assert.deepEqual(p.views.map.nested, { deep: { ok: 1 } });
	assert.deepEqual(p.views.barter, { goal: 'material', wants: { Steel: 5 } });
	assert.ok(!('views' in readProfile({ views: { inventory: {} } })), 'no known view, no field');
	assert.ok(!('views' in readProfile({ views: [] })));
});

test('each list is held to what its screen draws', () => {
	const many = n => Array.from({ length: n }, (_, i) => i);
	// Each cap on its own: with every list full at once the byte cap
	// below would be the one deciding.
	const map = readView('map', {
		savedRoutes: many(12).map(i => ({ name: `r${i}`, stops: many(50) })),
		traces: many(25).map(() => ({ notes: 'n'.repeat(500), texts: many(50), strokes: many(30).map(() => ({ pts: many(4) })) })),
		stops: many(80),
		done: { day: '2026-09-06', ids: many(300) },
		runTrades: Object.fromEntries(many(70).map(i => [i, { give: 'a' }])),
		runStash: many(30)
	});
	assert.equal(map.savedRoutes.length, 9);
	assert.equal(map.savedRoutes[0].stops.length, 40);
	assert.equal(map.traces.length, 20);
	assert.equal(map.traces[0].strokes.length, 24);
	assert.equal(map.traces[0].texts.length, 40);
	assert.equal(map.traces[0].notes.length, 400, 'a trace\'s notes are the one long string');
	assert.equal(map.stops.length, 60);
	assert.equal(map.done.ids.length, 200);
	assert.equal(Object.keys(map.runTrades).length, 60);
	assert.equal(map.runStash.length, 20);
	const heavy = readView('map', { trace: { points: many(3000).map(i => ({ x: i, y: i })), strokes: [{ pts: many(2500) }] } });
	assert.equal(heavy.trace.points.length, 2000);
	assert.equal(heavy.trace.strokes[0].pts.length, 2000);

	const barter = readView('barter', {
		board: { day: 'd', answers: many(200) }, matBoard: { day: 'd', answers: many(200) },
		wants: Object.fromEntries(many(90).map(i => [`i${i}`, 1])),
		routes: { key: 'k', ids: many(60).map(String) },
		sail: { key: 'k', done: many(100).map(String), stops: many(100) },
		questSkip: { day: 'd', ids: many(150).map(String) }, questPull: { day: 'd', ids: many(150).map(String) }
	});
	assert.equal(barter.board.answers.length, 120);
	assert.equal(barter.matBoard.answers.length, 120);
	assert.equal(Object.keys(barter.wants).length, 60);
	assert.equal(barter.routes.ids.length, 40);
	assert.equal(barter.sail.stops.length, 80);
	assert.equal(barter.sail.done.length, 80);
	assert.equal(barter.questSkip.ids.length, 100);
	assert.equal(barter.questPull.ids.length, 100);
});

test('a view within every cap and still too big loses the oldest of its heaviest lists', () => {
	// Twenty traces of two thousand points each is well past the byte cap.
	const traces = Array.from({ length: 20 }, (_, t) => ({
		name: `trace ${t}`,
		points: Array.from({ length: 2000 }, (_, i) => ({ x: 100000 + i, y: 100000 + i, seq: i }))
	}));
	const view = readView('map', { mode: 'trace', panelOpen: true, traces });
	assert.ok(JSON.stringify(view).length <= VIEW_BYTES);
	assert.equal(view.mode, 'trace', 'the settings are kept');
	assert.equal(view.panelOpen, true);
	assert.equal(view.traces.length, 20, 'the list of traces is light; its points are what went');
	assert.ok(view.traces.every(t => t.points.length < 2000));
	assert.ok(view.traces.some(t => t.points.at(-1) && t.points.at(-1).seq === 1999), 'the newest points stay');
});

/* ------------------------------------------------------------------ *
 * the store
 * ------------------------------------------------------------------ */

test('a view is written quietly, persisted, exported and read back after a reload', () => {
	reset();
	store.flush();
	const before = store.getState().history.length;
	assert.equal(store.getView('map'), null);
	store.setView('map', { mode: 'sail', stops: [3, 4], panelOpen: false });
	assert.deepEqual(store.getView('map'), { mode: 'sail', stops: [3, 4], panelOpen: false });
	assert.equal(store.getState().history.length, before, 'no history entry');
	assert.equal(store.canUndo() && store.lastChange().label, 'reset', 'nothing new to undo');
	assert.deepEqual(store.saveShape().profile.views.map, { mode: 'sail', stops: [3, 4], panelOpen: false });
	assert.deepEqual(JSON.parse(store.exportJSON()).profile.views.map, { mode: 'sail', stops: [3, 4], panelOpen: false });
	store.flush();
	const s = store.init();
	assert.deepEqual(s.profile.views.map, { mode: 'sail', stops: [3, 4], panelOpen: false });
	assert.deepEqual(store.getView('map'), { mode: 'sail', stops: [3, 4], panelOpen: false });
	// Clearing takes the namespace out, and the field with it when empty.
	store.setView('map', null);
	assert.equal(store.getView('map'), null);
	assert.ok(!('views' in (store.saveShape().profile || {})));
});

test('a view a screen kept in localStorage comes across once, picked, and the key stays', () => {
	reset();
	localStorage.setItem('bdo-tracker/barter-view', JSON.stringify({ goal: 'material', qty: 40, secret: 'not for the profile' }));
	const got = store.migrateView('barter', 'bdo-tracker/barter-view', s => ({ goal: s.goal, qty: s.qty }));
	assert.deepEqual(got, { goal: 'material', qty: 40 });
	assert.deepEqual(store.getView('barter'), { goal: 'material', qty: 40 });
	assert.ok(localStorage.getItem('bdo-tracker/barter-view'), 'the legacy key is left in place');
	// Once the profile has one, the key is not read again.
	localStorage.setItem('bdo-tracker/barter-view', JSON.stringify({ goal: 'silver' }));
	assert.deepEqual(store.migrateView('barter', 'bdo-tracker/barter-view'), { goal: 'material', qty: 40 });
	// Nothing there, or rubbish there: null, and nothing written.
	assert.equal(store.migrateView('map', 'bdo-tracker/map-view'), null);
	localStorage.setItem('bdo-tracker/map-view', '{nope');
	assert.equal(store.migrateView('map', 'bdo-tracker/map-view'), null);
	assert.equal(store.getView('map'), null);
});

test('a view is per profile and does not leak into the undo of a real change', () => {
	reset();
	store.setView('map', { mode: 'sail' });
	store.setStock('Steel', 5);
	store.setView('map', { mode: 'route' });
	store.undo();
	assert.equal(store.getStock('Steel'), 1);
	assert.deepEqual(store.getView('map'), { mode: 'route' }, 'undoing the count leaves the view as it was left');
});
