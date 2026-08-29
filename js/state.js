// Single source of truth for the tracker.
//
// Two things are persisted: `stock` (what you actually own) and `targets`
// (what you are building, in priority order). Requirements, reservations,
// shortfalls and progress are never stored -- planner.js derives them from
// these on every read, so nothing can drift out of sync.

const KEY = 'bdo-tracker/v2';
const LEGACY_PREFIX = 'bdo_ship_upgrade-';
const LEGACY_MIGRATED_FLAG = 'bdo-tracker/v1-imported';
const HISTORY_CAP = 200;
const SCHEMA = 2;

// Legacy keys that are settings rather than material quantities.
const LEGACY_RESERVED = new Set([
	'ship', 'tour_completed', 'auto_tour_enabled', 'floating-minimized',
	'water-enabled', 'theme', 'view', 'filter'
]);

const emptyState = () => ({
	v: SCHEMA,
	stock: {},
	targets: [],
	strategy: {},
	profile: {},
	history: [],
	settings: {}
});

let state = emptyState();
let listeners = new Set();
let writeTimer = null;
let suppressStorageEvent = false;
// While the guided tour is showing example data, nothing may be written:
// a single save would put the demo where the user's real inventory is.
let transient = false;

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

function readRaw() {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed;
	} catch (err) {
		console.warn('[state] could not read saved data:', err);
		return null;
	}
}

function normalise(raw) {
	const s = emptyState();
	if (!raw) return s;
	if (raw.stock && typeof raw.stock === 'object') {
		for (const [item, qty] of Object.entries(raw.stock)) {
			const n = Math.max(0, Math.floor(Number(qty) || 0));
			if (n > 0) s.stock[item] = n;
		}
	}
	if (Array.isArray(raw.targets)) {
		s.targets = raw.targets
			.filter(t => t && typeof t.item === 'string')
			.map(t => ({
				id: String(t.id || makeId()),
				item: t.item,
				qty: Math.max(1, Math.floor(Number(t.qty) || 1)),
				active: t.active !== false,
				note: typeof t.note === 'string' ? t.note : ''
			}));
	}
	if (raw.strategy && typeof raw.strategy === 'object') {
		for (const [item, mode] of Object.entries(raw.strategy)) {
			if (mode === 'buy' || mode === 'craft') s.strategy[item] = mode;
		}
	}
	s.profile = readProfile(raw.profile);
	if (Array.isArray(raw.history)) s.history = raw.history.slice(-HISTORY_CAP);
	if (raw.settings && typeof raw.settings === 'object') s.settings = { ...raw.settings };
	return s;
}

/**
 * The profile, keyed and bounded.
 *
 * Only known keys survive, so a save written by a newer version cannot
 * put anything unexpected in front of the planner. `barterCount` is a
 * running total that only goes up, and a Value Pack is on or it is not.
 */
const isProfile = raw => Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);

function readProfile(raw) {
	const out = {};
	if (!isProfile(raw)) return out;
	const count = Math.max(0, Math.floor(Number(raw.barterCount) || 0));
	if (count > 0) out.barterCount = count;
	if (raw.valuePack === true) out.valuePack = true;
	if (raw.crew === true) out.crew = true;
	if (typeof raw.level === 'string' && raw.level) out.level = raw.level.slice(0, 20);
	const vouchers = Math.max(0, Math.floor(Number(raw.vouchers) || 0));
	if (vouchers > 0) out.vouchers = vouchers;
	const held = Math.max(0, Math.floor(Number(raw.parleyHeld) || 0));
	if (held > 0) out.parleyHeld = held;
	return out;
}

function persist() {
	if (transient) return;
	if (writeTimer) clearTimeout(writeTimer);
	writeTimer = setTimeout(() => {
		writeTimer = null;
		try {
			suppressStorageEvent = true;
			localStorage.setItem(KEY, JSON.stringify(state));
		} catch (err) {
			console.warn('[state] could not save:', err);
		} finally {
			suppressStorageEvent = false;
		}
	}, 150);
}

/**
 * Write a pending change out immediately, used before the page unloads.
 *
 * Deliberately does nothing when there is no pending write: another tab
 * may have saved since we last read, and flushing an unchanged copy of
 * our in-memory state would silently overwrite that.
 */
export function flush() {
	if (!writeTimer) return;
	clearTimeout(writeTimer);
	writeTimer = null;
	try {
		localStorage.setItem(KEY, JSON.stringify(state));
	} catch (err) {
		console.warn('[state] could not save:', err);
	}
}

function makeId() {
	return 't' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

/* ------------------------------------------------------------------ *
 * Subscription
 * ------------------------------------------------------------------ */

export function subscribe(fn) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

function notify(reason) {
	for (const fn of listeners) {
		try {
			fn(state, reason);
		} catch (err) {
			console.error('[state] listener failed:', err);
		}
	}
}

/* ------------------------------------------------------------------ *
 * Change bookkeeping -- every mutation records how to undo itself
 * ------------------------------------------------------------------ */

function commit(type, label, mutate) {
	const beforeStock = { ...state.stock };
	const beforeTargets = state.targets;
	const beforeStrategy = state.strategy;
	const beforeProfile = state.profile;

	mutate();

	const entry = { t: Date.now(), type, label };

	// Stock is undone by its inverse delta, so only changed keys are kept.
	const delta = {};
	const keys = new Set([...Object.keys(beforeStock), ...Object.keys(state.stock)]);
	for (const k of keys) {
		const diff = (state.stock[k] || 0) - (beforeStock[k] || 0);
		if (diff !== 0) delta[k] = diff;
	}
	if (Object.keys(delta).length) entry.delta = delta;
	if (state.targets !== beforeTargets) entry.prevTargets = beforeTargets;
	if (state.strategy !== beforeStrategy) entry.prevStrategy = beforeStrategy;
	if (state.profile !== beforeProfile) entry.prevProfile = beforeProfile;

	if (entry.delta || entry.prevTargets || entry.prevStrategy || entry.prevProfile) {
		state.history.push(entry);
		if (state.history.length > HISTORY_CAP) state.history.shift();
		// A new change forks history: what was undone can no longer be
		// redone, because redoing it would land on top of this instead of
		// where it was undone from.
		future = [];
	}

	persist();
	notify(type);
	return entry;
}

// What undo took away, so redo can put it back. In memory only: the
// undo history travels with the save because reopening the app and
// reversing yesterday's mistake is a real need, but "redo the thing I
// undid before reloading" is not one anyone has.
let future = [];

/** Reverse the most recent change. Returns its label, or null if nothing to undo. */
export function undo() {
	const entry = state.history.pop();
	if (!entry) return null;

	// Captured before the revert touches anything: the values this undo
	// is about to replace are exactly what redo will need.
	const redoEntry = { type: entry.type, label: entry.label };
	if (entry.delta) redoEntry.delta = entry.delta;
	if (entry.prevTargets) redoEntry.nextTargets = state.targets;
	if (entry.prevStrategy) redoEntry.nextStrategy = state.strategy;
	if (entry.prevProfile) redoEntry.nextProfile = state.profile;
	future.push(redoEntry);

	if (entry.delta) {
		for (const [item, diff] of Object.entries(entry.delta)) {
			const next = (state.stock[item] || 0) - diff;
			if (next > 0) state.stock[item] = next;
			else delete state.stock[item];
		}
	}
	if (entry.prevTargets) state.targets = entry.prevTargets;
	if (entry.prevStrategy) state.strategy = entry.prevStrategy;
	if (entry.prevProfile) state.profile = entry.prevProfile;

	persist();
	notify('undo');
	return entry.label || 'Change';
}

/** Put back the most recently undone change, itself undoable again. */
export function redo() {
	const entry = future.pop();
	if (!entry) return null;

	// Rebuilt as a history entry as it goes back on, so redo and undo
	// can trade the same change back and forth indefinitely.
	const hist = { t: Date.now(), type: entry.type, label: entry.label };
	if (entry.delta) {
		hist.delta = entry.delta;
		for (const [item, diff] of Object.entries(entry.delta)) {
			const next = (state.stock[item] || 0) + diff;
			if (next > 0) state.stock[item] = next;
			else delete state.stock[item];
		}
	}
	if (entry.nextTargets) {
		hist.prevTargets = state.targets;
		state.targets = entry.nextTargets;
	}
	if (entry.nextStrategy) {
		hist.prevStrategy = state.strategy;
		state.strategy = entry.nextStrategy;
	}
	if (entry.nextProfile) {
		hist.prevProfile = state.profile;
		state.profile = entry.nextProfile;
	}

	state.history.push(hist);
	if (state.history.length > HISTORY_CAP) state.history.shift();

	persist();
	notify('redo');
	return entry.label || 'Change';
}

export function canUndo() {
	return state.history.length > 0;
}

export function canRedo() {
	return future.length > 0;
}

export function lastChange() {
	return state.history[state.history.length - 1] || null;
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

export function getState() {
	return state;
}

export function getStock(item) {
	return state.stock[item] || 0;
}

export function getAllStock() {
	return state.stock;
}

export function getTargets() {
	return state.targets;
}

export function getActiveTargets() {
	return state.targets.filter(t => t.active);
}

export function getTarget(id) {
	return state.targets.find(t => t.id === id) || null;
}

export function getStrategy(item) {
	return state.strategy[item] || 'craft';
}

export function getAllStrategy() {
	return state.strategy;
}

/**
 * Facts about the player that the plan needs and cannot derive.
 *
 * Two so far: how many barters they have completed, which decides what
 * the barter list will offer them, and whether a Value Pack is running,
 * which decides how often they can refresh it.
 *
 * These are data rather than preference -- a barter count is earned, and
 * having to re-enter it on a phone would be exactly the kind of thing
 * this app exists to avoid -- so unlike `settings` they travel with the
 * save, are exported with it, and sync.
 */
export function getProfile(key, fallback = null) {
	return key in state.profile ? state.profile[key] : fallback;
}

export function setProfile(key, value) {
	const next = readProfile({ ...state.profile, [key]: value });
	commit('profile', 'Changed your barter profile', () => {
		state.profile = next;
	});
}

export function getSetting(key, fallback = null) {
	return key in state.settings ? state.settings[key] : fallback;
}

/* ------------------------------------------------------------------ *
 * Stock mutations
 * ------------------------------------------------------------------ */

function writeStock(item, qty) {
	const n = Math.max(0, Math.floor(Number(qty) || 0));
	if (n > 0) state.stock[item] = n;
	else delete state.stock[item];
}

/** Set an item's owned quantity outright. */
export function setStock(item, qty, label) {
	const before = getStock(item);
	const after = Math.max(0, Math.floor(Number(qty) || 0));
	if (before === after) return null;
	return commit('stock', label || `${item}: ${before} → ${after}`, () => writeStock(item, after));
}

/** Add (or subtract, with a negative delta) from an item's owned quantity. */
export function addStock(item, delta, label) {
	const d = Math.floor(Number(delta) || 0);
	if (!d) return null;
	const after = Math.max(0, getStock(item) + d);
	return commit('stock', label || `${d > 0 ? '+' : ''}${d} ${item}`, () => writeStock(item, after));
}

/** Apply several stock changes as one undoable step. */
export function applyDelta(delta, type, label) {
	const entries = Object.entries(delta).filter(([, d]) => Number(d));
	if (!entries.length) return null;
	return commit(type || 'stock', label || 'Inventory change', () => {
		for (const [item, d] of entries) writeStock(item, getStock(item) + Math.floor(d));
	});
}

/** Replace the whole stock table (used by the v1 import review screen). */
export function replaceStock(next, label) {
	return commit('stock', label || 'Inventory replaced', () => {
		state.stock = {};
		for (const [item, qty] of Object.entries(next || {})) writeStock(item, qty);
	});
}

/* ------------------------------------------------------------------ *
 * Targets
 * ------------------------------------------------------------------ */

export function addTarget(item, qty = 1, note = '') {
	const existing = state.targets.find(t => t.item === item);
	if (existing) {
		return setTargetQty(existing.id, existing.qty + Math.max(1, qty));
	}
	const target = { id: makeId(), item, qty: Math.max(1, Math.floor(qty) || 1), active: true, note };
	commit('target', `Tracking ${item}`, () => {
		state.targets = [...state.targets, target];
	});
	return target;
}

export function removeTarget(id) {
	const t = getTarget(id);
	if (!t) return null;
	return commit('target', `Stopped tracking ${t.item}`, () => {
		state.targets = state.targets.filter(x => x.id !== id);
	});
}

export function setTargetQty(id, qty) {
	const t = getTarget(id);
	if (!t) return null;
	const n = Math.max(1, Math.floor(Number(qty) || 1));
	if (n === t.qty) return null;
	return commit('target', `${t.item} ×${n}`, () => {
		state.targets = state.targets.map(x => (x.id === id ? { ...x, qty: n } : x));
	});
}

export function toggleTarget(id, active) {
	const t = getTarget(id);
	if (!t) return null;
	const next = typeof active === 'boolean' ? active : !t.active;
	if (next === t.active) return null;
	return commit('target', `${next ? 'Resumed' : 'Paused'} ${t.item}`, () => {
		state.targets = state.targets.map(x => (x.id === id ? { ...x, active: next } : x));
	});
}

/** Move a target up (-1) or down (+1) the priority order. */
export function moveTarget(id, direction) {
	const idx = state.targets.findIndex(t => t.id === id);
	if (idx < 0) return null;
	const to = idx + (direction < 0 ? -1 : 1);
	if (to < 0 || to >= state.targets.length) return null;
	return commit('target', `Reordered ${state.targets[idx].item}`, () => {
		const next = [...state.targets];
		const [moved] = next.splice(idx, 1);
		next.splice(to, 0, moved);
		state.targets = next;
	});
}

/** Reorder wholesale from a list of ids (drag and drop). */
export function reorderTargets(ids) {
	const byId = new Map(state.targets.map(t => [t.id, t]));
	const next = ids.map(id => byId.get(id)).filter(Boolean);
	for (const t of state.targets) if (!next.includes(t)) next.push(t);
	if (next.length !== state.targets.length) return null;
	return commit('target', 'Reordered priorities', () => {
		state.targets = next;
	});
}

/* ------------------------------------------------------------------ *
 * Strategy: craft an item, or buy it and stop exploding its recipe
 * ------------------------------------------------------------------ */

/**
 * How this item is to be obtained.
 *
 * 'craft' and 'buy' are the universal pair. Anything else names a route
 * through an upgrade that has more than one -- a Caravel from a plain
 * Sailboat or an Improved one. The store does not need to know which
 * routes exist: planner.js falls back to the default when it does not
 * recognise the name, so an unknown value is inert rather than wrong.
 */
export function setStrategy(item, mode) {
	const next = typeof mode === 'string' && mode ? mode : 'craft';
	if (getStrategy(item) === next) return null;
	const how = next === 'buy' ? 'buy it' : next === 'craft' ? 'craft it' : `via ${next}`;
	return commit('strategy', `${item}: ${how}`, () => {
		const s = { ...state.strategy };
		if (next === 'craft') delete s[item];
		else s[item] = next;
		state.strategy = s;
	});
}

/* ------------------------------------------------------------------ *
 * Settings (not undoable -- they are preferences, not data)
 * ------------------------------------------------------------------ */

export function setSetting(key, value) {
	state.settings = { ...state.settings, [key]: value };
	persist();
	notify('settings');
}

/* ------------------------------------------------------------------ *
 * Import / export
 * ------------------------------------------------------------------ */

export function exportJSON() {
	return JSON.stringify({
		v: SCHEMA,
		exported: new Date().toISOString(),
		...saveShape()
	}, null, 2);
}

export function importJSON(text) {
	let parsed;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error('That file is not valid JSON.');
	}
	if (!parsed || typeof parsed !== 'object' || !parsed.stock) {
		throw new Error('That file does not contain tracker data.');
	}
	return adopt(parsed, 'Imported tracker data');
}

/**
 * The four fields that are the save, as an object.
 *
 * Everything else the state holds is either derived (nothing here) or
 * local to this browser: `history` is the undo stack, `settings` are
 * preferences like which tab you were on. Neither belongs in a backup or
 * on another machine, so neither is included.
 *
 * `profile` is omitted while it is empty. Every save written before it
 * existed then compares byte-for-byte identical to one written now,
 * which is what keeps this change invisible to anyone already signed in
 * -- see localText() in sync.js for why that matters.
 */
export function saveShape() {
	const shape = { stock: state.stock, targets: state.targets, strategy: state.strategy };
	if (Object.keys(state.profile).length) shape.profile = state.profile;
	return shape;
}

/**
 * Replace the save wholesale -- from a file, or from another device.
 *
 * It goes through `commit`, so it lands on the undo stack: taking the
 * wrong copy in a sync conflict is exactly the sort of thing you want one
 * press to reverse.
 *
 * A save with no `profile` at all leaves the one here alone. That is the
 * difference between "this copy predates the field" and "this player
 * cleared it", and getting it wrong would mean a phone that has not
 * been reloaded since the update silently wiping a barter count off
 * every other device. An empty object still clears it, so a deliberate
 * reset survives the round trip.
 */
export function adopt(data, label = 'Replaced tracker data') {
	const incoming = normalise(data);
	// `isProfile` and not a bare typeof check: an array is an object to
	// JavaScript but is not a profile, and treating one as a deliberate
	// clear would throw a barter count away on malformed input.
	const carriesProfile = data && isProfile(data.profile);
	commit('import', label, () => {
		state.stock = incoming.stock;
		state.targets = incoming.targets;
		state.strategy = incoming.strategy;
		if (carriesProfile) state.profile = incoming.profile;
	});
	return { items: Object.keys(incoming.stock).length, targets: incoming.targets.length };
}

/* ------------------------------------------------------------------ *
 * Temporary state, for the guided tour
 * ------------------------------------------------------------------ */

/** A copy of everything that matters, to put back later. */
export function capture() {
	return JSON.stringify({
		stock: state.stock,
		targets: state.targets,
		strategy: state.strategy
	});
}

/**
 * Swap in some state without saving it.
 *
 * The tour needs worked-through data to point at, but that data must
 * never reach storage: nothing is persisted here, so whatever is on disk
 * stays the real thing even if the tab is closed mid-tour.
 */
export function applyTransient(json) {
	let raw;
	try {
		raw = JSON.parse(json);
	} catch {
		return false;
	}
	transient = true;
	// Drop any queued write from before the swap, so it cannot land later
	// carrying example data.
	if (writeTimer) {
		clearTimeout(writeTimer);
		writeTimer = null;
	}
	state.stock = { ...(raw.stock || {}) };
	state.targets = (raw.targets || []).map(t => ({ ...t }));
	state.strategy = { ...(raw.strategy || {}) };
	notify('transient');
	return true;
}

/** Put back a captured copy and start saving again. */
export function restore(json) {
	if (!applyTransient(json)) return false;
	transient = false;
	notify('restore');
	return true;
}

export function isTransient() {
	return transient;
}

/* ------------------------------------------------------------------ *
 * One-time import of the old per-ship data
 * ------------------------------------------------------------------ */

/**
 * Read the pre-inventory `bdo_ship_upgrade-*` keys.
 *
 * The old model stored a count per ship, so the same physical material
 * could be recorded several times over. Summing would invent materials
 * that never existed, so we keep the highest count seen for each item --
 * a deliberate under-estimate the user corrects on the review screen.
 * Legacy keys are left in place, so this stays reversible.
 *
 * Four key shapes existed, and item names contain hyphens themselves
 * ("Tide-Dyed Standardized Timber Square"), so every segment is resolved
 * by matching against known names longest-first rather than by splitting.
 *
 *   <ship>-<item>                 a material quantity
 *   <ship>-<recipe>-<material>    the same material, counted under a recipe
 *   <ship>-<recipe>-completed     how many of that recipe item were finished
 *   <ship>-<item>-enhancement     the level that part was enhanced to
 *
 * @param {string[]} shipNames  trackable target names
 * @param {string[]} itemNames  every known item name
 * @returns {{stock: Object, ships: string[], keys: number}|null}
 */
export function readLegacyData(shipNames, itemNames) {
	const byLength = list => [...new Set(list)].sort((a, b) => b.length - a.length);
	const ships = byLength(shipNames);
	const items = byLength(itemNames);
	const itemSet = new Set(itemNames);

	const stock = {};
	const seenShips = new Set();
	let found = 0;

	const record = (item, qty) => {
		if (qty > 0) stock[item] = Math.max(stock[item] || 0, qty);
	};

	let keyCount;
	try {
		keyCount = localStorage.length;
	} catch {
		return null;
	}

	for (let i = 0; i < keyCount; i++) {
		let key;
		try {
			key = localStorage.key(i);
		} catch {
			continue;
		}
		if (!key || !key.startsWith(LEGACY_PREFIX)) continue;

		const rest = key.slice(LEGACY_PREFIX.length);
		if (LEGACY_RESERVED.has(rest)) continue;

		const ship = ships.find(n => rest.startsWith(n + '-'));
		if (!ship) continue;

		const tail = rest.slice(ship.length + 1);
		if (!tail) continue;

		const qty = Math.floor(Number(localStorage.getItem(key)));
		if (!Number.isFinite(qty) || qty <= 0) continue;

		seenShips.add(ship);
		found++;

		// <ship>-<item>-enhancement : owning a part at +N.
		if (tail.endsWith('-enhancement')) {
			const base = tail.slice(0, -'-enhancement'.length);
			if (qty >= 1 && qty <= 10) record(`+${qty} ${base}`, 1);
			continue;
		}

		// <ship>-<recipe>-completed : that many finished recipe items.
		if (tail.endsWith('-completed')) {
			const made = tail.slice(0, -'-completed'.length);
			if (itemSet.has(made)) record(made, qty);
			continue;
		}

		// <ship>-<item> : a plain quantity, "+10 " prefix included.
		if (itemSet.has(tail)) {
			record(tail, qty);
			continue;
		}

		// <ship>-<recipe>-<material> : the same pile, counted under a recipe.
		const parent = items.find(n => tail.startsWith(n + '-'));
		if (parent) {
			const material = tail.slice(parent.length + 1);
			if (itemSet.has(material)) record(material, qty);
		}
	}

	if (!found) return null;
	return { stock, ships: [...seenShips], keys: found };
}

export function hasImportedLegacy() {
	try {
		return localStorage.getItem(LEGACY_MIGRATED_FLAG) === 'true';
	} catch {
		return true;
	}
}

export function markLegacyImported() {
	try {
		localStorage.setItem(LEGACY_MIGRATED_FLAG, 'true');
	} catch {
		/* ignore */
	}
}

/** Apply a reviewed legacy import. */
export function applyLegacyImport(stock, shipNames) {
	commit('import', 'Imported your previous progress', () => {
		for (const [item, qty] of Object.entries(stock)) {
			writeStock(item, Math.max(getStock(item), qty));
		}
		const existing = new Set(state.targets.map(t => t.item));
		const added = shipNames
			.filter(n => !existing.has(n))
			.map(n => ({ id: makeId(), item: n, qty: 1, active: true, note: '' }));
		if (added.length) state.targets = [...state.targets, ...added];
	});
	markLegacyImported();
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

export function init() {
	state = normalise(readRaw());

	window.addEventListener('storage', evt => {
		if (evt.key !== KEY || suppressStorageEvent) return;
		state = normalise(readRaw());
		notify('sync');
	});

	window.addEventListener('beforeunload', flush);
	return state;
}

export const STORAGE_KEY = KEY;
