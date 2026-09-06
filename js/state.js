// Single source of truth for the tracker.
//
// Two things are persisted: `stock` (what you actually own) and `targets`
// (what you are building, in priority order). Requirements, reservations,
// shortfalls and progress are never stored -- planner.js derives them from
// these on every read, so nothing can drift out of sync.

import { readProfile, isProfile, readView } from './profile-shape.js';
// The catalogue, read for two things only: which route names a strategy
// may hold, and which item names a file being imported is known to
// mention. Nothing here explodes a recipe; that stays planner.js's.
import { recipes, routes } from './recipes.js';
import { items as vendorItems } from './vendor_items.js';
import { coins } from './sea_coins.js';
import { tradeGoodNames } from './trade_goods.js';
const BASE_KEY = 'bdo-tracker/v2';
const ACTIVE_PROFILE_KEY = 'bdo-tracker/profile';

/** Where a profile's save lives: the original key for the main one, so
 *  nobody's save moves; a suffixed key for every other. */
export function keyFor(slug) {
	return slug ? `${BASE_KEY}@${slug}` : BASE_KEY;
}

function activeSlug() {
	try { return localStorage.getItem(ACTIVE_PROFILE_KEY) || ''; } catch { return ''; }
}

/** The profile this page loaded with. Switching is a reload. */
export const ACTIVE_PROFILE = activeSlug();
const KEY = keyFor(ACTIVE_PROFILE);
const LEGACY_PREFIX = 'bdo_ship_upgrade-';
const LEGACY_MIGRATED_FLAG = 'bdo-tracker/v1-imported';
const HISTORY_CAP = 200;
// How long the save may be on disk before the oldest undo entries are let
// go, in UTF-16 units as localStorage counts them: well under the five
// megabytes a browser gives the whole origin, with the Market cache and
// the other profiles sharing it.
const SAVE_BUDGET = 1_500_000;
// How many unreadable saves are kept beside the key they came from.
const BROKEN_KEEP = 2;
// How many changes are remembered as "not yet written" for another tab's
// save to be laid under; past this a tab that cannot write is not going
// to be reconciled by replay anyway.
const PENDING_CAP = 50;
const SCHEMA = 2;

// The names a strategy may hold beyond 'buy' and 'craft': the routes
// through an upgrade with more than one way in.
const ROUTE_IDS = new Set(Object.values(routes).flatMap(v => Object.keys(v)));
const isStrategy = mode => mode === 'buy' || mode === 'craft' || ROUTE_IDS.has(mode);

/**
 * The shape of a save, version by version. `migrate` walks a raw blob
 * from the version it says it is up to SCHEMA before it is normalised,
 * one step per version, so a save from an old build is read the way it
 * was meant and not the way the current shape happens to guess.
 *
 *   1  never a single blob: the first version kept one localStorage key
 *      per ship and item, and readLegacyData() below reads those. A blob
 *      that says v:1 is the current shape as far as anything here can
 *      tell, so the step is the identity.
 *   3  reserved. When the shape next changes, bump SCHEMA and put the
 *      step that turns a v2 blob into a v3 one at MIGRATIONS[2]; a v3
 *      blob opened by this build rides along untouched (see normalise).
 *
 * Each step takes the raw blob and returns the blob one version on. It
 * is exported so a test can install a step and see it run.
 */
export const MIGRATIONS = {
	1: raw => raw
};

export function migrate(raw) {
	if (!raw || typeof raw !== 'object') return raw;
	let v = Number(raw.v);
	if (!Number.isFinite(v) || v >= SCHEMA) return raw;
	let out = raw;
	for (; v < SCHEMA; v++) {
		const step = MIGRATIONS[v];
		if (typeof step === 'function') out = step(out) || out;
		out = { ...out, v: v + 1 };
	}
	return out;
}

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
// Whether the last write reached the disk, and why not if it did not.
// `broken` names the copy kept of a save that could not be parsed.
let health = { ok: true, reason: null, at: null, broken: null };
// What this tab has changed since its last write, as replays: a stock
// delta, a profile patch, a settings patch, the targets or the strategy
// as they now stand. When another tab's save arrives while a write is
// still inside the debounce, these go back on top of it -- see reload().
let pending = [];
// The targets and the strategy as the disk last had them, to tell "the
// other tab changed the builds" from "only this one did".
let written = { targets: '[]', strategy: '{}' };
// While the guided tour is showing example data, nothing may be written:
// a single save would put the demo where the user's real inventory is.
let transient = false;
// Set when another tab saves mid-tour, so restore() knows the capture it
// holds is older than the disk and yields to it.
let staleWhileTransient = false;

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

function readRaw() {
	let raw;
	try {
		raw = localStorage.getItem(KEY);
	} catch (err) {
		console.warn('[state] could not read saved data:', err);
		return null;
	}
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed;
	} catch (err) {
		// Starting empty means the next write puts an empty save where
		// this one was. The text is kept beside the key first, so what
		// was there can still be got out by hand.
		console.warn('[state] could not read saved data:', err);
		preserveBroken(raw);
		return null;
	}
}

/** Keep an unreadable save under `<key>.broken-<time>`, the newest two. */
function preserveBroken(raw) {
	const prefix = `${KEY}.broken-`;
	const key = prefix + Date.now();
	try {
		localStorage.setItem(key, raw);
		const older = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.startsWith(prefix) && k !== key) older.push(k);
		}
		older.sort();
		for (const k of older.slice(0, Math.max(0, older.length - (BROKEN_KEEP - 1)))) localStorage.removeItem(k);
		health = { ...health, broken: key };
	} catch (err) {
		console.warn('[state] could not keep the unreadable save:', err);
	}
}

/** The unreadable save kept at the last boot, as { key, text }, or null. */
export function brokenSave() {
	if (!health.broken) return null;
	try {
		const text = localStorage.getItem(health.broken);
		return text ? { key: health.broken, text } : null;
	} catch {
		return null;
	}
}

/** Whether saves are reaching the disk: { ok, reason, at, broken }. */
export function saveHealth() {
	return { ...health };
}

function announce(name, detail) {
	if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') return;
	try {
		window.dispatchEvent(new CustomEvent(name, { detail }));
	} catch { /* nothing listening is fine */ }
}

function normalise(input) {
	const s = emptyState();
	if (!input) return s;
	const raw = migrate(input);
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
			if (isStrategy(mode)) s.strategy[item] = mode;
		}
	}
	s.profile = readProfile(raw.profile);
	s.history = readHistory(raw.history);
	if (raw.settings && typeof raw.settings === 'object') s.settings = { ...raw.settings };
	// Anything a newer version wrote that this one does not know rides
	// along untouched, so opening a save in an old tab cannot strip what
	// the new one added.
	for (const key of Object.keys(raw)) {
		if (!(key in s)) s[key] = raw[key];
	}
	if (Number(raw.v) > SCHEMA) s.v = Number(raw.v);
	return s;
}

/**
 * The undo stack, believed only as far as it can be verified.
 *
 * History is the one persisted field whose entries are applied as raw
 * arithmetic -- a delta of "x" would quietly turn a stock count into NaN
 * and undo() would then delete the row. So a hand-edited or corrupted
 * save keeps only the entries that could actually be undone.
 */
function readHistory(raw) {
	if (!Array.isArray(raw)) return [];
	const out = [];
	for (const e of raw.slice(-HISTORY_CAP)) {
		if (!e || typeof e !== 'object') continue;
		const entry = { t: Number(e.t) || 0, type: String(e.type || 'stock'), label: String(e.label || '') };
		if (e.delta && typeof e.delta === 'object') {
			const delta = {};
			for (const [item, diff] of Object.entries(e.delta)) {
				const n = Math.trunc(Number(diff));
				if (Number.isFinite(n) && n !== 0) delta[item] = n;
			}
			if (Object.keys(delta).length) entry.delta = delta;
		}
		if (Array.isArray(e.prevTargets)) {
			entry.prevTargets = normalise({ targets: e.prevTargets }).targets;
		}
		if (e.prevStrategy && typeof e.prevStrategy === 'object') {
			entry.prevStrategy = normalise({ strategy: e.prevStrategy }).strategy;
		}
		// Entries written before the profile was diffed hold the whole
		// profile as it was; they still undo, the old way.
		if (isProfile(e.prevProfile)) entry.prevProfile = readProfile(e.prevProfile);
		if (isProfile(e.prevProfileFields)) {
			const fields = readProfileFields(e.prevProfileFields);
			if (Object.keys(fields).length) entry.prevProfileFields = fields;
		}
		if (entry.delta || entry.prevTargets || entry.prevStrategy || entry.prevProfile || entry.prevProfileFields) out.push(entry);
	}
	return out;
}

/**
 * A profile patch as history holds one: field -> the value to put back,
 * or null for "the field was not there". Each value goes through the
 * profile's own bounds; one the bounds reject is one the profile would
 * not have held, so it reads as absent.
 */
function readProfileFields(raw) {
	const fields = {};
	for (const [k, v] of Object.entries(raw)) {
		if (v === null || v === undefined) {
			fields[k] = null;
			continue;
		}
		const clean = readProfile({ [k]: v });
		fields[k] = k in clean ? clean[k] : null;
	}
	return fields;
}

/** The profile with a patch laid on: null removes a field. */
function patchProfile(profile, fields) {
	const next = { ...profile };
	for (const [k, v] of Object.entries(fields)) {
		if (v === null || v === undefined) delete next[k];
		else next[k] = v;
	}
	return readProfile(next);
}

/** The fields of `profile` a patch names, as they stand now -- what
 *  putting the patch on would overwrite, and so what undoes it. */
function fieldsOf(profile, fields) {
	const out = {};
	for (const k of Object.keys(fields)) out[k] = k in profile ? profile[k] : null;
	return out;
}

// The profile's shape lives in profile-shape.js.

/**
 * The save as text, trimmed to the budget. The undo stack is the one
 * part that grows without the player adding anything, so it is the part
 * that gives: the oldest entries go, a batch at a time, until the text
 * fits. Nothing else is touched -- a save too big without any history
 * is written as it is and the write says whether it took.
 */
function serialise() {
	let text = JSON.stringify(state);
	while (text.length > SAVE_BUDGET && state.history.length) {
		let over = text.length - SAVE_BUDGET;
		let n = 0;
		while (over > 0 && n < state.history.length) {
			over -= JSON.stringify(state.history[n]).length + 1;
			n++;
		}
		state.history.splice(0, Math.max(1, n));
		text = JSON.stringify(state);
	}
	return text;
}

/** Put the state on the disk, and say how it went. */
function write() {
	try {
		localStorage.setItem(KEY, serialise());
		pending = [];
		written = { targets: JSON.stringify(state.targets), strategy: JSON.stringify(state.strategy) };
		if (!health.ok) {
			health = { ...health, ok: true, reason: null, at: new Date() };
			announce('tracker-save-ok', { at: health.at });
		}
	} catch (err) {
		const text = `${err && err.name} ${err && err.message}`;
		const quota = Boolean(err) && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014 || /quota/i.test(text));
		const reason = quota ? 'quota' : 'unavailable';
		const first = health.ok;
		health = { ...health, ok: false, reason, at: new Date() };
		console.warn('[state] could not save:', err);
		// Once per streak: a toast for every keystroke that fails to save
		// would be the same news over and over.
		if (first) announce('tracker-save-failed', { reason, at: health.at });
	}
}

function persist() {
	if (transient) return;
	if (writeTimer) clearTimeout(writeTimer);
	writeTimer = setTimeout(() => {
		writeTimer = null;
		write();
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
	if (transient || !writeTimer) return;
	clearTimeout(writeTimer);
	writeTimer = null;
	write();
}

/** Note a change this tab has made and not yet written. */
function queue(replay) {
	if (transient) return;
	pending.push(replay);
	if (pending.length > PENDING_CAP) pending.shift();
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
	// While the tour's example data is in: act, but leave no record. A
	// history entry written against demo quantities would hand undo a
	// delta that was never true of the real inventory.
	if (transient) {
		mutate();
		notify(type);
		return { t: Date.now(), type, label, transient: true };
	}

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
	// The profile is undone field by field, and only the fields this
	// change touched are kept: a whole copy per entry made the save grow
	// by the size of the profile on every claim, and undoing one put back
	// fields the app had quietly written since -- a favourite starred
	// after a quest was claimed vanished with the claim.
	if (state.profile !== beforeProfile) {
		const fields = {};
		for (const k of new Set([...Object.keys(beforeProfile), ...Object.keys(state.profile)])) {
			if (JSON.stringify(beforeProfile[k]) !== JSON.stringify(state.profile[k])) fields[k] = k in beforeProfile ? beforeProfile[k] : null;
		}
		if (Object.keys(fields).length) entry.prevProfileFields = fields;
	}

	if (entry.delta || entry.prevTargets || entry.prevStrategy || entry.prevProfileFields) {
		state.history.push(entry);
		if (state.history.length > HISTORY_CAP) state.history.shift();
		// A new change forks history: what was undone can no longer be
		// redone, because redoing it would land on top of this instead of
		// where it was undone from.
		future = [];
		const replay = { entry };
		if (entry.delta) replay.delta = entry.delta;
		if (entry.prevTargets) replay.targets = state.targets;
		if (entry.prevStrategy) replay.strategy = state.strategy;
		if (entry.prevProfileFields) replay.profile = fieldsOf(state.profile, entry.prevProfileFields);
		queue(replay);
	}

	persist();
	notify(type);
	// Something gained is something done: a good more in the bags (a
	// craft, a claim, a trip, a plain +1), a build taken on, a quest
	// claimed, a trip recorded. The screen answers with a small burst
	// of light where the tap landed (cheer.js); taking away, undoing,
	// re-ordering and imports pass in silence.
	if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
		const gained = (entry.delta && Object.values(entry.delta).some(d => d > 0))
			|| (type === 'quest' && !/not done/i.test(label))
			|| type === 'trip'
			|| (type === 'target' && /^Tracking /.test(label));
		if (gained) document.dispatchEvent(new CustomEvent('accomplished', { detail: { type, label, big: type === 'trip' } }));
	}
	return entry;
}

// What undo took away, so redo can put it back. In memory only: the
// undo history travels with the save because reopening the app and
// reversing yesterday's mistake is a real need, but "redo the thing I
// undid before reloading" is not one anyone has.
let future = [];

/** Reverse the most recent change. Returns its label, or null if nothing to undo. */
export function undo() {
	// The history is real; the stock on show mid-tour is not. Undoing a
	// real entry against demo quantities would lose the entry for good.
	if (transient) return null;
	const entry = state.history.pop();
	if (!entry) return null;

	// Captured before the revert touches anything: the values this undo
	// is about to replace are exactly what redo will need.
	const redoEntry = { type: entry.type, label: entry.label };
	if (entry.delta) redoEntry.delta = entry.delta;
	if (entry.prevTargets) redoEntry.nextTargets = state.targets;
	if (entry.prevStrategy) redoEntry.nextStrategy = state.strategy;
	if (entry.prevProfile) redoEntry.nextProfile = state.profile;
	if (entry.prevProfileFields) redoEntry.nextProfileFields = fieldsOf(state.profile, entry.prevProfileFields);
	future.push(redoEntry);

	// Undo is replayed as the change it made, with no entry of its own:
	// the entry it took off is the other tab's to keep or not.
	const replay = {};
	if (entry.delta) {
		replay.delta = {};
		for (const [item, diff] of Object.entries(entry.delta)) {
			const next = (state.stock[item] || 0) - diff;
			if (next > 0) state.stock[item] = next;
			else delete state.stock[item];
			replay.delta[item] = -diff;
		}
	}
	if (entry.prevTargets) replay.targets = state.targets = entry.prevTargets;
	if (entry.prevStrategy) replay.strategy = state.strategy = entry.prevStrategy;
	if (entry.prevProfile) state.profile = entry.prevProfile;
	if (entry.prevProfileFields) {
		state.profile = patchProfile(state.profile, entry.prevProfileFields);
		replay.profile = fieldsOf(state.profile, entry.prevProfileFields);
	}
	queue(replay);

	persist();
	notify('undo');
	return entry.label || 'Change';
}

/** Put back the most recently undone change, itself undoable again. */
export function redo() {
	if (transient) return null;
	const entry = future.pop();
	if (!entry) return null;

	// Rebuilt as a history entry as it goes back on, so redo and undo
	// can trade the same change back and forth indefinitely.
	const hist = { t: Date.now(), type: entry.type, label: entry.label };
	const replay = { entry: hist };
	if (entry.delta) {
		hist.delta = entry.delta;
		replay.delta = entry.delta;
		for (const [item, diff] of Object.entries(entry.delta)) {
			const next = (state.stock[item] || 0) + diff;
			if (next > 0) state.stock[item] = next;
			else delete state.stock[item];
		}
	}
	if (entry.nextTargets) {
		hist.prevTargets = state.targets;
		replay.targets = state.targets = entry.nextTargets;
	}
	if (entry.nextStrategy) {
		hist.prevStrategy = state.strategy;
		replay.strategy = state.strategy = entry.nextStrategy;
	}
	if (entry.nextProfile) {
		hist.prevProfile = state.profile;
		state.profile = entry.nextProfile;
	}
	if (entry.nextProfileFields) {
		hist.prevProfileFields = fieldsOf(state.profile, entry.nextProfileFields);
		state.profile = patchProfile(state.profile, entry.nextProfileFields);
		replay.profile = fieldsOf(state.profile, entry.nextProfileFields);
	}

	state.history.push(hist);
	if (state.history.length > HISTORY_CAP) state.history.shift();
	queue(replay);

	persist();
	notify('redo');
	return entry.label || 'Change';
}

export function canUndo() {
	return !transient && state.history.length > 0;
}

export function canRedo() {
	return !transient && future.length > 0;
}

export function lastChange() {
	return state.history[state.history.length - 1] || null;
}

/** The change Redo would put back, if any. */
export function nextRedo() {
	return future[future.length - 1] || null;
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

// What the undo toast calls a change to each field. The profile began
// as two barter facts and grew the whole ship and crew; a sailor renamed
// or a hull swapped is not "your barter profile" to the person undoing it.
const PROFILE_LABELS = {
	barterCount: 'Changed your barter count',
	valuePack: 'Changed the Value Pack',
	crew: 'Changed the crew discount',
	level: 'Changed your barter level',
	vouchers: 'Changed your vouchers',
	parleyHeld: 'Changed the parley you hold',
	failstacks: 'Changed a failstack',
	crewShip: 'Changed the ship you sail',
	roster: 'Changed the roster',
	seats: 'Changed who sits where',
	presets: 'Changed a crew preset',
	fitted: 'Changed what is fitted',
	crystal: 'Changed the sea crystal',
	skins: 'Changed the appearance set',
	setups: 'Changed your saved setups',
	sailingMastery: 'Changed your sailing mastery',
	questFavs: 'Changed your favourite quests',
	questGroups: 'Changed a quest group',
	stash: 'Changed where things are kept',
	homes: 'Changed where new things land',
	orders: 'Changed the sailing orders',
	homemade: 'Changed what your workers make',
	matSeen: 'Noted what the material list shows'
};

export function setProfile(key, value, label = null) {
	const next = readProfile({ ...state.profile, [key]: value });
	commit('profile', label || PROFILE_LABELS[key] || 'Changed your profile', () => {
		state.profile = next;
	});
}

/**
 * Several profile fields as one change, so one Undo takes back all of
 * them: sailing a saved setup writes the hull, its parts, its crystal,
 * its seating and its skin, and a player who undoes that expects the
 * fit they had back, not the hull name alone.
 */
export function setProfileMany(patch, label) {
	const next = readProfile({ ...state.profile, ...patch });
	if (JSON.stringify(next) === JSON.stringify(state.profile)) return null;
	return commit('profile', label || 'Changed your profile', () => {
		state.profile = next;
	});
}

/**
 * A profile field written without a history entry: for what the app
 * notes by itself -- the pace diary -- which no one typed and no one
 * would want to undo. Persists and syncs like any other change.
 */
export function setProfileQuiet(key, value) {
	if (transient) return;
	const next = readProfile({ ...state.profile, [key]: value });
	if (JSON.stringify(next[key]) === JSON.stringify(state.profile[key])) return;
	state.profile = next;
	queue({ profile: { [key]: key in next ? next[key] : null } });
	persist();
	notify('profile-quiet');
}

/* ------------------------------------------------------------------ *
 * Screen views: how the Map and the Barter tab were left
 * ------------------------------------------------------------------ */

/**
 * A screen's view lives in the profile under `views[ns]`, written the
 * quiet way -- no history entry, since nobody undoes "the panel was
 * folded" -- and so persisted, synced and exported with the rest, and
 * kept per profile: an alt's run is not the main's. The shape is the
 * screen's own; profile-shape.js only bounds it (VIEW_CAPS), so the
 * screen reads it back with the same checks it used for localStorage.
 */
export function getView(ns) {
	const views = state.profile.views;
	return views && isProfile(views[ns]) ? views[ns] : null;
}

/** Write a screen's view, or clear it with null. */
export function setView(ns, obj) {
	const views = { ...(state.profile.views || {}) };
	const clean = readView(ns, obj);
	if (clean) views[ns] = clean;
	else delete views[ns];
	setProfileQuiet('views', views);
}

/**
 * Bring a view across from the localStorage key a screen used before
 * the profile held it: when the profile has none and the key parses,
 * `pick(parsed)` is stored and returned; otherwise what the profile
 * holds. The key is left where it is, so an older build still finds it.
 */
export function migrateView(ns, legacyKey, pick = x => x) {
	const have = getView(ns);
	if (have) return have;
	let legacy;
	try {
		legacy = JSON.parse(localStorage.getItem(legacyKey) || 'null');
	} catch {
		return null;
	}
	if (!isProfile(legacy)) return null;
	const picked = pick(legacy);
	if (!isProfile(picked)) return null;
	setView(ns, picked);
	return getView(ns);
}

export function getSetting(key, fallback = null) {
	return key in state.settings ? state.settings[key] : fallback;
}

/* ------------------------------------------------------------------ *
 * Stock mutations
 * ------------------------------------------------------------------ */

// More than any warehouse holds. A count past this is a slip, not a
// stock, and left alone it would be Infinity in memory and nothing at
// all after a reload -- JSON has no way to write it.
export const STOCK_CAP = 1e15;

// What sort of thing an item is, for the storage new counts land in.
// The kinds module reads the ships and the barter tables, which this
// file has no business loading, so the screen hands the function in at
// boot; until then nothing has a home and every count lands in the
// bags, as it always did.
let kindOf = () => '';
export function useKinds(fn) { kindOf = typeof fn === 'function' ? fn : () => ''; }

/** The storage a new count of `item` is noted at, '' for the bags. */
export function homeOf(item) {
	const homes = state.profile.homes || {};
	return homes[kindOf(item)] || '';
}

/** The storage that is the ship itself: goods noted here are aboard. */
export const ABOARD = "Ship's hold";

/**
 * Write an item's total. `at` says where the change happens: `true`
 * (the default) means a count that grows lands at the kind's home
 * storage when one is set, so a trip logged puts the goods where they
 * are actually kept; a place name means the count grows or shrinks at
 * that place -- the Barter tab works the ship's hold; `false` means the
 * bags. A count that shrinks comes off the place named, else the bags,
 * then off the noted places largest first, since the places can never
 * hold more than the total.
 */
function writeStock(item, qty, at = true) {
	const before = getStock(item);
	const n = Math.min(STOCK_CAP, Math.max(0, Math.floor(Number(qty) || 0)));
	if (n > 0) state.stock[item] = n;
	else delete state.stock[item];
	const place = typeof at === 'string' ? at : at && n > before ? homeOf(item) : '';
	let places = state.profile.stash && state.profile.stash[item];
	if (place && n > before) places = { ...(places || {}), [place]: ((places || {})[place] || 0) + (n - before) };
	if (!places) return;
	let over = Object.values(places).reduce((a, b) => a + b, 0) - n;
	const next = { ...places };
	// Off the place named first: a good taken off the ship comes off
	// the ship, whatever the bigger pile ashore holds.
	if (place && n < before && next[place]) {
		const off = Math.min(next[place], before - n);
		next[place] -= off;
		over -= off;
	}
	for (const [town] of Object.entries(next).sort((a, b) => b[1] - a[1])) {
		if (over <= 0) break;
		const take = Math.min(next[town], over);
		next[town] -= take;
		over -= take;
	}
	state.profile = readProfile({ ...state.profile, stash: { ...state.profile.stash, [item]: next } });
}

/** Set an item's owned quantity outright; `at` names the place the
 *  change is made at, when it is not the bags or the kind's home. */
export function setStock(item, qty, label, at = true) {
	const before = getStock(item);
	const after = Math.min(STOCK_CAP, Math.max(0, Math.floor(Number(qty) || 0)));
	if (before === after) return null;
	return commit('stock', label || `${item}: ${before} → ${after}`, () => writeStock(item, after, at));
}

/**
 * How many of an item are at one place. The bags are what no place
 * claims; `ABOARD` is the ship's hold.
 */
export function stockAt(item, town) {
	const places = (state.profile.stash && state.profile.stash[item]) || {};
	if (town === '') return Math.max(0, getStock(item) - Object.values(places).reduce((a, b) => a + b, 0));
	return places[town] || 0;
}

/**
 * Set how many of an item sit at one place outright, the total moving
 * by the difference -- the Barter tab typing what is aboard.
 */
export function setStockAt(item, town, qty, label) {
	const before = stockAt(item, town);
	const n = Math.max(0, Math.floor(Number(qty) || 0));
	if (before === n) return null;
	return commit('stock', label || `${item} at ${town}: ${before} → ${n}`, () => writeStock(item, getStock(item) + (n - before), town));
}

/**
 * Move `n` of an item from one place to another as one change: goods
 * loaded from a harbour's storage onto the ship, or put back. '' is
 * the bags. The total does not move.
 */
export function moveStash(item, from, to, n, label) {
	const qty = Math.min(Math.floor(Number(n) || 0), stockAt(item, from));
	if (qty <= 0 || from === to) return null;
	const stash = { ...(state.profile.stash || {}) };
	const towns = { ...(stash[item] || {}) };
	if (from !== '') { towns[from] = (towns[from] || 0) - qty; if (towns[from] <= 0) delete towns[from]; }
	if (to !== '') towns[to] = (towns[to] || 0) + qty;
	if (Object.keys(towns).length) stash[item] = towns; else delete stash[item];
	return commit('profile', label || `${qty}× ${item}: ${from || 'the bags'} → ${to || 'the bags'}`, () => {
		state.profile = readProfile({ ...state.profile, stash });
	});
}

/** Add (or subtract, with a negative delta) from an item's owned quantity. */
export function addStock(item, delta, label, at = true) {
	const d = Math.floor(Number(delta) || 0);
	if (!d) return null;
	const after = Math.max(0, getStock(item) + d);
	return commit('stock', label || `${d > 0 ? '+' : ''}${d} ${item}`, () => writeStock(item, after, at));
}

/**
 * Apply several stock changes as one undoable step. `profile`, when
 * given, is a patch of profile fields written in the same step -- an
 * enhancement attempt spends stones and moves the failstack together,
 * and one Undo has to take back both or it takes back a lie.
 */
export function applyDelta(delta, type, label, profile = null) {
	const entries = Object.entries(delta).filter(([, d]) => Number(d));
	if (!entries.length && !profile) return null;
	const next = profile ? readProfile({ ...state.profile, ...profile }) : null;
	return commit(type || 'stock', label || 'Inventory change', () => {
		for (const [item, d] of entries) writeStock(item, getStock(item) + Math.floor(d));
		if (next) state.profile = next;
	});
}

/**
 * A quest claimed: the reward into stock and the quest onto the done
 * list as one change, so one Undo takes back both. `key` is the period
 * it counts for; a stamp from an earlier period simply stops matching,
 * and there is one per quest at most, so nothing needs sweeping.
 */
export function claimQuest(id, delta, key, label) {
	const done = { ...(state.profile.questsDone || {}), [id]: key };
	const next = readProfile({ ...state.profile, questsDone: done });
	return commit('quest', label || 'Claimed a quest', () => {
		for (const [item, d] of Object.entries(delta || {})) {
			if (Number(d)) writeStock(item, getStock(item) + Math.floor(d));
		}
		state.profile = next;
	});
}

/** How many of an item sit at one place; nought forgets the place. */
/**
 * How many of an item sit at one place. The total you own is what is
 * in your bags plus every place noted, so a count typed at a place
 * moves the total by the difference; null forgets the place and hands
 * its count back to the bags.
 */
export function setStash(item, town, qty) {
	const stash = { ...(state.profile.stash || {}) };
	const towns = { ...(stash[item] || {}) };
	const before = towns[town] || 0;
	const forget = qty === null;
	const n = forget ? 0 : Math.max(0, Math.floor(Number(qty) || 0));
	if (forget) delete towns[town]; else towns[town] = n;
	if (Object.keys(towns).length) stash[item] = towns; else delete stash[item];
	const total = getStock(item) + (forget ? 0 : n - before);
	return commit('profile', forget ? `${item}: no longer noted at ${town}` : `${item}: ${n} at ${town}`, () => {
		state.profile = readProfile({ ...state.profile, stash });
		if (!forget && total !== getStock(item)) writeStock(item, total, false);
	});
}

/**
 * Several items moved to one place as one change: everything owned of
 * each is noted at `town`, or handed back to the bags when `town` is
 * empty. This is the group action of the Inventory's select mode -- a
 * hold's worth of goods put at Iliya in one go, and taken back in one
 * Undo.
 */
export function placeAll(items, town, label) {
	const list = [...new Set(items)].filter(item => getStock(item) > 0);
	if (!list.length) return null;
	const stash = { ...(state.profile.stash || {}) };
	for (const item of list) {
		if (town) stash[item] = { [town]: getStock(item) };
		else delete stash[item];
	}
	const next = readProfile({ ...state.profile, stash });
	if (JSON.stringify(next.stash || {}) === JSON.stringify(state.profile.stash || {})) return null;
	const what = list.length === 1 ? list[0] : `${list.length} items`;
	return commit('profile', label || (town ? `${what} moved to ${town}` : `${what} back in the bags`), () => {
		state.profile = next;
	});
}

/**
 * A trip sailed as one change: stock deltas -- goods handed over and
 * received, the [Level 7]s sold and the silver they paid -- goods put
 * into a harbour's storage on the way (`moves`: { item, from, to, n },
 * '' for the ship), and a profile patch, the run's entry in the log.
 * One Undo takes the whole trip back.
 */
export function applyTrip({ delta = {}, moves = [], profile = null, label = 'Sailed a run' } = {}) {
	const entries = Object.entries(delta).filter(([, d]) => Number(d));
	return commit('trip', label, () => {
		for (const [item, d] of entries) writeStock(item, getStock(item) + Math.floor(d), false);
		const stash = { ...(state.profile.stash || {}) };
		for (const m of moves) {
			const qty = Math.min(Math.floor(Number(m.n) || 0), m.from === '' ? Math.max(0, getStock(m.item) - Object.values(stash[m.item] || {}).reduce((a, b) => a + b, 0)) : ((stash[m.item] || {})[m.from] || 0));
			if (qty <= 0 || m.from === m.to) continue;
			const towns = { ...(stash[m.item] || {}) };
			if (m.from !== '') { towns[m.from] = (towns[m.from] || 0) - qty; if (towns[m.from] <= 0) delete towns[m.from]; }
			if (m.to !== '') towns[m.to] = (towns[m.to] || 0) + qty;
			if (Object.keys(towns).length) stash[m.item] = towns; else delete stash[m.item];
		}
		state.profile = readProfile({ ...state.profile, stash, ...(profile || {}) });
	});
}

/** Where new counts of a kind land: '' for the bags. */
export function setHome(kind, town) {
	const homes = { ...(state.profile.homes || {}) };
	if (town) homes[kind] = town; else delete homes[kind];
	return setProfile('homes', homes, town ? `New ${kind} land at ${town}` : `New ${kind} land in the bags`);
}

/**
 * Several quests claimed at once -- a favourite group finished in one
 * sitting -- as one change, so one Undo takes back the lot. Each entry
 * is { id, key, delta }.
 */
export function claimQuests(entries, label) {
	const list = (entries || []).filter(e => e && e.id);
	if (!list.length) return null;
	const done = { ...(state.profile.questsDone || {}) };
	for (const e of list) done[e.id] = e.key;
	const next = readProfile({ ...state.profile, questsDone: done });
	return commit('quest', label || `Claimed ${list.length} quests`, () => {
		for (const e of list) {
			for (const [item, d] of Object.entries(e.delta || {})) {
				if (Number(d)) writeStock(item, getStock(item) + Math.floor(d));
			}
		}
		state.profile = next;
	});
}

/** Take a quest off the done list without touching stock -- for a tick
 *  made by mistake; a reward recorded by mistake is what Undo is for. */
export function unclaimQuest(id, label) {
	if (!state.profile.questsDone || !(id in state.profile.questsDone)) return null;
	const done = { ...state.profile.questsDone };
	delete done[id];
	const next = readProfile({ ...state.profile, questsDone: done });
	return commit('quest', label || 'Marked a quest not done', () => { state.profile = next; });
}

/** Replace the whole stock table (used by the v1 import review screen). */
export function replaceStock(next, label) {
	return commit('stock', label || 'Inventory replaced', () => {
		state.stock = {};
		for (const [item, qty] of Object.entries(next || {})) writeStock(item, qty, false);
		// The places noted can never hold more than the total: an item no
		// longer owned is no longer noted anywhere.
		const stash = { ...(state.profile.stash || {}) };
		let changed = false;
		for (const item of Object.keys(stash)) {
			if (getStock(item) > 0) continue;
			delete stash[item];
			changed = true;
		}
		if (changed) state.profile = readProfile({ ...state.profile, stash });
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

/** A preference. `silent` skips the listeners, for a caller that is
 *  about to redraw anyway and would otherwise draw twice. */
export function setSetting(key, value, silent = false) {
	state.settings = { ...state.settings, [key]: value };
	queue({ settings: { [key]: value } });
	persist();
	if (!silent) notify('settings');
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

// Every name the app knows: what the recipes make and eat, what the
// vendors sell, the coins, and the trade goods carried between runs.
// The same list ui-bits.js's allItems() draws, without the screen.
let catalogue = null;
function knownItems() {
	if (catalogue) return catalogue;
	catalogue = new Set();
	for (const [product, recipe] of Object.entries(recipes)) {
		catalogue.add(product);
		for (const item of Object.keys(recipe)) catalogue.add(item);
	}
	for (const item of Object.keys(vendorItems)) catalogue.add(item);
	for (const item of Object.keys(coins)) catalogue.add(item);
	for (const item of tradeGoodNames) catalogue.add(item);
	// The currencies sit in the stock like anything else (ui-state.js
	// names them), but no table lists them as items.
	for (const item of ['Silver', 'Crow Coin', 'Sangpyeong Coin']) catalogue.add(item);
	return catalogue;
}

/**
 * What a file about to be imported holds that this build does not know:
 * item names in the stock, builds of things the recipes do not make,
 * route choices no upgrade offers. A report, not a verdict -- a save
 * from a newer build may well know more, and rejecting it would strand
 * the player's own data -- so the UI can say what it saw before the
 * file goes in.
 */
export function inspectImport(parsed) {
	const known = knownItems();
	const out = { items: 0, unknownItems: [], unknownTargets: [], unknownRoutes: [] };
	if (!parsed || typeof parsed !== 'object') return out;
	if (parsed.stock && typeof parsed.stock === 'object' && !Array.isArray(parsed.stock)) {
		const names = Object.keys(parsed.stock);
		out.items = names.length;
		out.unknownItems = names.filter(n => !known.has(n));
	}
	if (Array.isArray(parsed.targets)) {
		out.unknownTargets = [...new Set(parsed.targets
			.filter(t => t && typeof t.item === 'string' && !known.has(t.item))
			.map(t => t.item))];
	}
	if (parsed.strategy && typeof parsed.strategy === 'object' && !Array.isArray(parsed.strategy)) {
		for (const [item, route] of Object.entries(parsed.strategy)) {
			if (route === 'buy' || route === 'craft') continue;
			if (routes[item] && typeof route === 'string' && route in routes[item]) continue;
			out.unknownRoutes.push({ item, route: String(route) });
		}
	}
	return out;
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
		// The profile kept is the old one, and its places were noted
		// against the old counts: an item no longer owned is no longer
		// anywhere, and a place cannot hold more than the new total.
		else state.profile = pruneStash(state.profile, state.stock);
	});
	return { items: Object.keys(incoming.stock).length, targets: incoming.targets.length };
}

/** The stash with nothing noted past the stock: unowned items are
 *  forgotten, and places over the total give up the excess, largest
 *  first, the way writeStock() takes a shrinking count off them. */
function pruneStash(profile, stock) {
	if (!profile.stash) return profile;
	const stash = {};
	let changed = false;
	for (const [item, places] of Object.entries(profile.stash)) {
		const total = stock[item] || 0;
		if (total <= 0) {
			changed = true;
			continue;
		}
		let over = Object.values(places).reduce((a, b) => a + b, 0) - total;
		if (over <= 0) {
			stash[item] = places;
			continue;
		}
		changed = true;
		const next = { ...places };
		for (const [town] of Object.entries(next).sort((a, b) => b[1] - a[1])) {
			if (over <= 0) break;
			const take = Math.min(next[town], over);
			next[town] -= take;
			over -= take;
		}
		stash[item] = next;
	}
	return changed ? readProfile({ ...profile, stash }) : profile;
}

/**
 * Fold another save into this one rather than replacing it.
 *
 * Stock keeps the higher count of the two -- the same rule the legacy
 * import uses, because the two copies most often describe one pile
 * counted twice, and summing would invent material. Builds are added
 * where this copy has none of that item; a choice already made here
 * stands over the file's; a profile field is taken only where this copy
 * is silent. The screen views are folded the same way one level down --
 * the file's Map view arrives where this copy has none, this copy's
 * Barter view stands where both have one -- since the person merging is
 * at this browser, looking at this one's screens. One undo reverses
 * the lot.
 */
export function merge(data, label = 'Merged tracker data') {
	const incoming = normalise(data);
	let items = 0;
	let targets = 0;
	commit('import', label, () => {
		const stock = { ...state.stock };
		for (const [item, qty] of Object.entries(incoming.stock)) {
			if (qty > (stock[item] || 0)) {
				stock[item] = qty;
				items++;
			}
		}
		state.stock = stock;
		const have = new Set(state.targets.map(t => t.item));
		const added = incoming.targets.filter(t => !have.has(t.item)).map(t => ({ ...t, id: makeId() }));
		if (added.length) {
			state.targets = [...state.targets, ...added];
			targets = added.length;
		}
		state.strategy = { ...incoming.strategy, ...state.strategy };
		const profile = { ...incoming.profile, ...state.profile };
		if (incoming.profile.views && state.profile.views) profile.views = { ...incoming.profile.views, ...state.profile.views };
		state.profile = readProfile(profile);
	});
	return { items, targets };
}

/* ------------------------------------------------------------------ *
 * Temporary state, for the guided tour
 * ------------------------------------------------------------------ */

/** A copy of everything that matters, to put back later. */
export function capture() {
	return JSON.stringify({
		stock: state.stock,
		targets: state.targets,
		strategy: state.strategy,
		profile: state.profile
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
	// Through the same bounds as a save from the disk: a link is a save
	// somebody else made, and one made by hand must not put a string or
	// a negative count in front of the planner.
	const clean = normalise(raw);
	state.stock = clean.stock;
	state.targets = clean.targets;
	state.strategy = clean.strategy;
	// The profile travels too: a shared plan's barter count and ship
	// are part of what it shows, and what is typed into them while
	// looking around must go back with the rest when the look ends --
	// the bar says nothing here is saved, and the To Get screen's
	// fields write here. The tour's example data names no profile, so
	// it keeps the player's own.
	if (isProfile(raw.profile)) state.profile = readProfile(raw.profile);
	notify('transient');
	return true;
}

/** Put back a captured copy and start saving again. */
export function restore(json) {
	// Another tab may have saved while the demo data was in. Its write is
	// newer than our capture, so the disk copy wins -- the same rule the
	// storage listener applies when we are not mid-tour.
	if (staleWhileTransient) {
		transient = false;
		staleWhileTransient = false;
		state = normalise(readRaw());
		written = { targets: JSON.stringify(state.targets), strategy: JSON.stringify(state.strategy) };
		pending = [];
		future = [];
		notify('restore');
		return true;
	}
	if (!applyTransient(json)) return false;
	transient = false;
	// The capture may hold a change that was still inside the write
	// debounce when the tour began -- applyTransient() cancelled that
	// timer, so without a fresh persist it would exist nowhere on disk.
	persist();
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

		// <ship>-<item>-enhancement : owning a part at +N. Only a level of
		// a part we know -- a stray key must not invent an item.
		if (tail.endsWith('-enhancement')) {
			const base = tail.slice(0, -'-enhancement'.length);
			const levelled = `+${qty} ${base}`;
			if (qty >= 1 && qty <= 10 && itemSet.has(levelled)) record(levelled, 1);
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
			writeStock(item, Math.max(getStock(item), qty), false);
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

/**
 * Another tab has written. Its copy is the newer one on the disk, so it
 * is taken -- but this tab may hold changes still inside the write
 * debounce, and reading the disk over them would lose a tap that was
 * made here a moment ago. Those are laid back on top: a stock delta is
 * added again, a profile or settings patch written again, and the
 * builds or the strategy kept as this tab has them when the other tab
 * did not touch them. Then the union is written, so both tabs end up
 * with both. Only when the other tab changed the data itself does the
 * redo stack go: it was built against what this tab held, and replayed
 * onto another tab's counts it would apply deltas never subtracted
 * there -- a preference saved over there changes nothing it rests on.
 */
function reload() {
	const queued = pending;
	pending = [];
	if (writeTimer) {
		clearTimeout(writeTimer);
		writeTimer = null;
	}
	const before = JSON.stringify(saveShape());
	const theirs = normalise(readRaw());
	const untouched = {
		targets: JSON.stringify(theirs.targets) === written.targets,
		strategy: JSON.stringify(theirs.strategy) === written.strategy
	};
	state = theirs;
	for (const r of queued) {
		if (r.delta) {
			for (const [item, diff] of Object.entries(r.delta)) {
				const next = Math.min(STOCK_CAP, Math.max(0, (state.stock[item] || 0) + diff));
				if (next > 0) state.stock[item] = next;
				else delete state.stock[item];
			}
		}
		if (r.targets && untouched.targets) state.targets = r.targets;
		if (r.strategy && untouched.strategy) state.strategy = r.strategy;
		if (r.profile) state.profile = patchProfile(state.profile, r.profile);
		if (r.settings) state.settings = { ...state.settings, ...r.settings };
		if (r.entry) {
			state.history.push(r.entry);
			if (state.history.length > HISTORY_CAP) state.history.shift();
		}
	}
	if (JSON.stringify(saveShape()) !== before) future = [];
	if (queued.length) persist();
	notify('sync');
}

export function init() {
	state = normalise(readRaw());
	written = { targets: JSON.stringify(state.targets), strategy: JSON.stringify(state.strategy) };
	pending = [];

	window.addEventListener('storage', evt => {
		if (evt.key !== KEY) return;
		// Mid-tour, the other tab's save must not be overdrawn with demo
		// data -- note it and let restore() adopt the disk copy instead.
		if (transient) {
			staleWhileTransient = true;
			return;
		}
		reload();
	});

	window.addEventListener('beforeunload', flush);
	// beforeunload does not fire on a phone -- backgrounding the PWA and
	// letting the OS reap it is the normal way a mobile session ends, so
	// the pending write must leave with the visibility change.
	window.addEventListener('pagehide', flush);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
	return state;
}

export const STORAGE_KEY = KEY;
