// Where a save actually lives while the server is up.
//
// The old shape put Turso on the critical path: a push read the stored
// save to check the revision, then wrote it back, and the browser waited
// on both. That is two HTTPS requests to another continent before the
// chip can say "Saved", and it is why a burst of edits could end at a
// connect timeout -- each one opened new connections, and the answer to
// a lost connection was a 500.
//
// So the order is turned around. This module holds the current save for
// every signed-in account and answers from memory, which is the only way
// a write is ever going to feel instant. Turso becomes what it should
// have been all along: durable storage that trails a fraction of a
// second behind, written to in the background, coalesced, and retried
// until it takes.
//
// Two things make that safe rather than reckless:
//
//   * One process owns the data. The tracker runs as a single server,
//     so "the current revision" is a variable, not a distributed
//     agreement problem. If this ever becomes several processes behind
//     a load balancer, this file is what has to change -- the memory
//     would need pinning per account, or the check would have to move
//     back into SQL.
//
//   * Nothing here is the only copy. The browser is still the source of
//     truth; localStorage keeps the save regardless. The worst a lost
//     flush can do is cost one revision, which the next push replaces.

import { getSave, writeSave, closePool, transient } from './db.js';
import { config } from './config.js';

/* How long to sit on a change before writing it out. Long enough that
 * typing "1", "12", "120" into a quantity is one write instead of three,
 * short enough that it is over before anyone could close the tab. */
const FLUSH_DELAY = config.flushDelayMs;

/* Ceilings on what is kept in memory, so a popular deployment does not
 * turn every account that ever signed in into resident memory. Only
 * clean entries are ever dropped. */
const MAX_ACCOUNTS = config.cacheAccounts;
const MAX_BYTES = config.cacheBytes;

/* How many flushes may be in the air at once. Coalescing means this is
 * rarely reached, and holding the line matters more than the throughput:
 * a fan of simultaneous connections out of a container is exactly what
 * fails. */
const MAX_IN_FLIGHT = config.turso.connections;

/**
 * userId -> {
 *   rev, payload, updatedAt, device,  // the save, authoritative
 *   dirty,      // memory is ahead of Turso
 *   flushing,   // a write is in the air
 *   timer,      // the coalescing window
 *   failures,   // consecutive flush failures, for backoff
 *   touched     // for eviction
 * }
 */
const live = new Map();
const loading = new Map();
// Accounts a forget() is mid-way through dropping. A read that resolves
// while its account is in here must not put the entry into `live`.
const dying = new Set();

let bytes = 0;
let inFlight = 0;
const queued = [];

/* ------------------------------------------------------------------ *
 * Getting an account into memory
 * ------------------------------------------------------------------ */

/**
 * The entry for an account, read from Turso the first time and from
 * memory every time after.
 *
 * Concurrent callers share one read. Without that, signing in on two
 * tabs at once would issue two reads and -- worse -- could build two
 * entries, of which one would be quietly discarded along with whatever
 * had been written into it.
 */
async function entryFor(userId) {
	const held = live.get(userId);
	if (held) {
		held.touched = Date.now();
		return held;
	}

	const already = loading.get(userId);
	if (already) return already;

	const pending = (async () => {
		const stored = await getSave(userId);
		// Someone may have written while the read was out. Their entry is
		// newer than anything this read can say, so it wins.
		const raced = live.get(userId);
		if (raced) return raced;

		// Checked once, here, rather than on every read. Unreadable stored
		// JSON should not lock an account out of syncing -- and it must not
		// be handed back to the client either, since the payload is passed
		// through into the response as text. Treating it as "nothing there"
		// lets the next push replace it.
		let payload = stored ? stored.payload : null;
		if (payload && !readable(payload)) {
			console.error('[saves] unreadable stored save for', userId);
			payload = null;
		}

		const entry = {
			rev: stored ? stored.rev : 0,
			payload,
			updatedAt: stored ? stored.updatedAt : null,
			device: stored ? stored.device : null,
			dirty: false,
			flushing: false,
			timer: null,
			failures: 0,
			touched: Date.now()
		};
		if (dying.has(userId)) {
			// forget() started while this read was out. An entry born now
			// must not outlive it -- hand it back flagged, off the map, so
			// nothing can write through it or flush it later.
			entry.gone = true;
			return entry;
		}
		live.set(userId, entry);
		bytes += size(entry.payload);
		// Reading an account in is the other way memory grows. Eviction
		// used to run only after a successful write, so a deployment whose
		// players mostly pull -- opening the app, not editing it -- would
		// climb past both ceilings with nothing to bring it back down.
		evictIfCrowded(userId);
		return entry;
	})().finally(() => loading.delete(userId));

	loading.set(userId, pending);
	return pending;
}

const size = payload => (payload ? Buffer.byteLength(payload) : 0);

function readable(payload) {
	try {
		JSON.parse(payload);
		return true;
	} catch {
		return false;
	}
}

const snapshot = entry => ({
	rev: entry.rev,
	payload: entry.payload,
	updatedAt: entry.updatedAt,
	device: entry.device
});

/* ------------------------------------------------------------------ *
 * What the API calls
 * ------------------------------------------------------------------ */

/**
 * The current save. `rev` 0 with no payload means this account has never
 * pushed one, which the client needs to tell apart from an empty
 * inventory.
 *
 * After the first call this costs nothing, which matters more than it
 * sounds: the client pulls every time a tab comes back into view.
 */
export async function readSave(userId) {
	return snapshot(await entryFor(userId));
}

/**
 * Store a save, if the client was working from the current one.
 *
 * Every save carries a revision. A client sends back the revision it
 * pulled, and the write lands only if that is still what is held -- so a
 * second browser that has been editing offline cannot silently flatten
 * the first one's work. A refused write comes back with the revision
 * that beat it, which is what the client needs to offer a choice rather
 * than just an error.
 *
 * `expected` of 0 means "I have never synced", which is only allowed to
 * create the first save.
 *
 * Past the first call for an account there is no I/O on this path at
 * all: the check is a comparison, the write is an assignment, and the
 * browser has its answer before Turso has heard about any of it.
 */
export async function writeSaveFor(userId, payload, expected, device) {
	let entry = await entryFor(userId);

	// The await above is a seam. While the read resolved, another
	// request's work may have changed what `live` holds for this account:
	// an eviction can have dropped our (then clean) entry, a re-read can
	// have built a second one, or a forget() can have deleted the account.
	// Writing into an orphan would fork the account -- two entries, each
	// sure of "the current revision" -- so this is settled before the
	// revision check, which is only meaningful against the real entry.
	if (entry.gone) {
		// A forgotten account is the one thing that must stay gone.
		return { ok: false, current: null };
	}
	const held = live.get(userId);
	if (held !== entry) {
		if (held && (held.dirty || held.rev > entry.rev)) {
			// The raced entry carries writes ours never saw; ours is the
			// orphan. Judge the push against the truth instead.
			entry = held;
		} else {
			// Ours was evicted (or raced by a plain re-read of the same
			// revision); put it back before it becomes the newest copy.
			if (held) bytes -= size(held.payload);
			live.set(userId, entry);
			bytes += size(entry.payload);
		}
	}

	if (entry.rev !== expected) {
		return { ok: false, current: entry.rev === 0 ? null : snapshot(entry) };
	}

	bytes += size(payload) - size(entry.payload);
	entry.rev = expected + 1;
	entry.payload = payload;
	entry.updatedAt = Date.now();
	entry.device = device ?? null;
	entry.dirty = true;
	entry.touched = entry.updatedAt;

	schedule(userId, entry);
	return { ok: true, rev: entry.rev, updatedAt: entry.updatedAt };
}

/**
 * Drop an account from memory, ahead of deleting its row.
 *
 * Clearing the pending timer is not enough on its own. A flush may
 * already be in the air, and a write cannot be recalled -- so it has to
 * be allowed to land *before* the row is deleted, or it would insert the
 * save back a moment afterwards and the account would not be deleted at
 * all. Awaited, therefore, and the caller deletes only once this returns.
 */
export async function forget(userId) {
	dying.add(userId);
	try {
		// A first read may be building the entry right now, and it would
		// repopulate `live` the moment it resolved. Marking the account
		// dying makes that read discard its work; waiting for it means no
		// half-built entry is left behind when this returns.
		const building = loading.get(userId);
		if (building) await building.catch(() => {});

		const entry = live.get(userId);
		if (!entry) return;
		clearTimeout(entry.timer);
		entry.dirty = false;
		entry.timer = null;
		entry.gone = true;
		bytes -= size(entry.payload);
		live.delete(userId);
		// Its own failure is not this caller's problem: either way, by the
		// time this resolves nothing more is on its way to the database.
		if (entry.settled) await entry.settled.catch(() => {});
	} finally {
		dying.delete(userId);
	}
}

/* ------------------------------------------------------------------ *
 * Getting it to Turso
 * ------------------------------------------------------------------ */

function schedule(userId, entry, delay = FLUSH_DELAY) {
	if (entry.timer) return;   // a window is already open; ride it
	entry.timer = setTimeout(() => {
		entry.timer = null;
		start(userId, entry);
	}, delay);
	// A pending write must never be the reason the process stays up. The
	// shutdown hook below is what makes sure it still happens.
	if (entry.timer.unref) entry.timer.unref();
}

function start(userId, entry) {
	if (entry.flushing || !entry.dirty) return;
	if (inFlight >= MAX_IN_FLIGHT) {
		queued.push([userId, entry]);
		return;
	}
	entry.flushing = true;
	inFlight++;
	// Kept so that forget() can wait for it. A write that is already out
	// cannot be called back, so the only safe order is to let it land.
	entry.settled = flush(userId, entry).finally(() => {
		entry.flushing = false;
		entry.settled = null;
		inFlight--;
		const next = queued.shift();
		if (next) start(next[0], next[1]);
	});
}

async function flush(userId, entry) {
	// The revision being written down, captured before the await. More
	// edits may land while this is out, and they must not be marked clean
	// by a write that did not include them.
	const sending = snapshot(entry);
	if (!sending.payload || entry.gone) return;

	try {
		await writeSave(userId, sending);
		entry.failures = 0;
		if (entry.rev === sending.rev) {
			entry.dirty = false;
			evictIfCrowded();
		} else {
			schedule(userId, entry, 0);   // it moved on; go again
		}
	} catch (error) {
		entry.failures++;

		// A statement the database understood and refused -- a constraint,
		// a column that is not there -- will be refused again just as
		// firmly. Retrying it forever would bury the one line that says
		// what is actually wrong under a log full of "cannot reach".
		//
		// It stays dirty and in memory, so it is still the newest copy and
		// the next edit will try again; what stops is the loop. The browser
		// was already told "Saved", so this line is the only witness that
		// the durable copy is behind -- it has to say so plainly.
		if (!transient(error)) {
			console.error(
				`[saves] the database refused ${userId}'s save; ` +
				'it is held in memory only until the next edit or shutdown retries it:',
				error.message
			);
			return;
		}

		// Weather, by contrast. Still dirty, still in memory, still
		// correct. Turso is behind and will catch up; the only thing that
		// has failed is the deadline, and nobody was waiting on it.
		const backoff = Math.min(FLUSH_DELAY * 2 ** entry.failures, 30_000);
		if (entry.failures === 1 || entry.failures % 10 === 0) {
			console.warn(
				`[saves] could not reach the database for ${userId}`,
				`(attempt ${entry.failures}, retrying in ${Math.round(backoff / 1000)}s):`,
				error.message
			);
		}
		schedule(userId, entry, backoff);
	}
}

/**
 * Keep memory bounded by dropping the accounts nobody is using.
 *
 * Only clean entries go: a dirty one is the newest copy there is, and
 * evicting it would lose a revision. The next request for a dropped
 * account simply reads it back.
 */
function evictIfCrowded(keep = null) {
	if (live.size <= MAX_ACCOUNTS && bytes <= MAX_BYTES) return;

	const cold = [...live.entries()]
		.filter(([userId, entry]) =>
			userId !== keep && !entry.dirty && !entry.flushing && !entry.timer)
		.sort((a, b) => a[1].touched - b[1].touched);

	for (const [userId, entry] of cold) {
		if (live.size <= MAX_ACCOUNTS && bytes <= MAX_BYTES) break;
		bytes -= size(entry.payload);
		live.delete(userId);
	}
}

/* ------------------------------------------------------------------ *
 * Shutting down
 * ------------------------------------------------------------------ */

/**
 * Write out everything still held, and say whether it all landed.
 *
 * This is the other half of the bargain. Answering from memory is only
 * honest if memory is emptied before the process goes, so a deploy or a
 * `docker compose restart` cannot swallow the last few seconds of work.
 */
export async function flushAll() {
	const pending = [];
	for (const [userId, entry] of live) {
		clearTimeout(entry.timer);
		entry.timer = null;
		if (!entry.dirty || !entry.payload) continue;
		pending.push(writeSave(userId, snapshot(entry)).then(
			() => { entry.dirty = false; return true; },
			error => {
				console.error(`[saves] ${userId}'s last save did not reach the database:`, error.message);
				return false;
			}
		));
	}
	if (!pending.length) return true;
	const results = await Promise.all(pending);
	return results.every(Boolean);
}

let leaving = false;

/** Flush on the way out, then let the signal do what it was going to do.
 *  The exit code says whether everything landed: a supervisor cannot read
 *  the log of a container that is already gone, but it does see a
 *  non-zero exit, and losing a save silently is the one thing the
 *  in-memory design must never do. */
export function flushOnShutdown() {
	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => {
			if (leaving) return;
			leaving = true;
			let flushed = false;
			// A container gets ten seconds by default; this needs a fraction
			// of one, but it must not hang if the database is unreachable.
			const giveUp = setTimeout(() => process.exit(flushed ? 0 : 1), 5000);
			if (giveUp.unref) giveUp.unref();
			flushAll()
				.then(ok => { flushed = ok; }, () => {})
				.then(closePool)
				.finally(() => {
					clearTimeout(giveUp);
					process.exit(flushed ? 0 : 1);
				});
		});
	}
}
