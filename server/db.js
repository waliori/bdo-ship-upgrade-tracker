// The one place that talks to the database.
//
// Turso speaks libSQL, and so does a plain local file, so the same client
// covers both: point TURSO_DATABASE_URL at `file:./.data/tracker.db` to
// develop without an account, or at a `libsql://` host to run for real.
//
// Two tables and no more. The tracker derives everything it shows from
// stock and targets, so that is all a save has to carry -- there is no
// server-side notion of a plan, and nothing here needs to understand a
// recipe.

import { createClient } from '@libsql/client';
import { config } from './config.js';

let client = null;

export function db() {
	if (!client) {
		client = createClient({
			url: config.turso.url,
			authToken: config.turso.authToken || undefined
		});
	}
	return client;
}

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS users (
		id          TEXT PRIMARY KEY,
		username    TEXT NOT NULL,
		avatar      TEXT,
		created_at  INTEGER NOT NULL,
		seen_at     INTEGER NOT NULL
	)`,
	// One save per account, overwritten in place. The tracker already
	// keeps its own undo history in the browser; duplicating it here
	// would mean shipping every keystroke to a server for no gain.
	`CREATE TABLE IF NOT EXISTS saves (
		user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
		rev         INTEGER NOT NULL,
		payload     TEXT NOT NULL,
		updated_at  INTEGER NOT NULL,
		device      TEXT
	)`
];

export async function migrate() {
	const c = db();
	for (const statement of SCHEMA) await c.execute(statement);
}

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

/**
 * Record who just signed in.
 *
 * The Discord id is the key and never changes; the name and avatar are
 * display only, so they are refreshed on every sign-in rather than being
 * treated as something to migrate.
 */
export async function upsertUser({ id, username, avatar }) {
	const now = Date.now();
	await db().execute({
		sql: `INSERT INTO users (id, username, avatar, created_at, seen_at)
		      VALUES (?, ?, ?, ?, ?)
		      ON CONFLICT(id) DO UPDATE SET
		        username = excluded.username,
		        avatar   = excluded.avatar,
		        seen_at  = excluded.seen_at`,
		args: [id, username, avatar ?? null, now, now]
	});
}

export async function getUser(id) {
	const { rows } = await db().execute({
		sql: 'SELECT id, username, avatar FROM users WHERE id = ?',
		args: [id]
	});
	return rows[0] || null;
}

/* ------------------------------------------------------------------ *
 * Saves
 * ------------------------------------------------------------------ */

/** The stored save, or null if this account has never pushed one. */
export async function getSave(userId) {
	const { rows } = await db().execute({
		sql: 'SELECT rev, payload, updated_at, device FROM saves WHERE user_id = ?',
		args: [userId]
	});
	const row = rows[0];
	if (!row) return null;
	return {
		rev: Number(row.rev),
		payload: row.payload,
		updatedAt: Number(row.updated_at),
		device: row.device || null
	};
}

/**
 * Store a save, but only if the client was working from the current one.
 *
 * Every save carries a revision. A client sends back the revision it
 * pulled, and the write lands only if that is still what is stored --
 * so a second browser that has been editing offline cannot silently
 * flatten the first one's work. A refused write comes back with the
 * revision that beat it, which is what the client needs to offer a
 * choice rather than just an error.
 *
 * `expected` of 0 means "I have never synced", which is only allowed to
 * create the first save.
 */
export async function putSave(userId, payload, expected, device) {
	const current = await getSave(userId);
	const now = Date.now();

	if (!current) {
		if (expected !== 0) return { ok: false, current: null };
		await db().execute({
			sql: `INSERT INTO saves (user_id, rev, payload, updated_at, device)
			      VALUES (?, 1, ?, ?, ?)`,
			args: [userId, payload, now, device ?? null]
		});
		return { ok: true, rev: 1, updatedAt: now };
	}

	if (current.rev !== expected) return { ok: false, current };

	const rev = current.rev + 1;
	// The WHERE clause repeats the check the read above already made, so
	// two requests racing on the same account cannot both be told they won.
	const result = await db().execute({
		sql: `UPDATE saves SET rev = ?, payload = ?, updated_at = ?, device = ?
		      WHERE user_id = ? AND rev = ?`,
		args: [rev, payload, now, device ?? null, userId, expected]
	});
	if (result.rowsAffected !== 1) return { ok: false, current: await getSave(userId) };

	return { ok: true, rev, updatedAt: now };
}

/** Forget an account entirely -- the save goes with it. */
export async function deleteAccount(userId) {
	await db().execute({ sql: 'DELETE FROM saves WHERE user_id = ?', args: [userId] });
	await db().execute({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });
}
