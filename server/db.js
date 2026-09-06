// The one place that talks to the database.
//
// Turso speaks libSQL, and so does a plain local file, so the same client
// covers both: point TURSO_DATABASE_URL at `file:./.data/tracker.db` to
// develop without an account, or at a `libsql://` host to run for real.
//
// Three tables and a version row. The tracker derives everything it
// shows from stock and targets, so that is all a save has to carry --
// there is no server-side notion of a plan, and nothing here needs to
// understand a recipe.
//
// Nothing in here decides who wins a race. A `libsql://` URL is not a
// socket -- every statement is a separate HTTPS request -- so treating
// the database as the referee costs a round trip to another continent
// per decision. saves.js keeps that decision in memory and uses this
// file only to make the result durable, which is why every write below
// is unconditional and safe to repeat.

import { createClient } from '@libsql/client';
import { Agent } from 'undici';
import dns from 'node:dns';
import { config } from './config.js';

const remote = !config.turso.url.startsWith('file:');

/* ------------------------------------------------------------------ *
 * Keeping the connection
 * ------------------------------------------------------------------ */

// A `libsql://` URL is HTTP underneath: every statement is a POST, and
// the connection it rides on is whatever the pool happens to have. Left
// to itself Node closes an idle one after four seconds -- which for this
// app is most of them, because a save is debounced and then nothing
// happens until you type again. So the write that follows a pause pays
// for a fresh DNS lookup, TCP handshake and TLS handshake, and it is
// precisely that cold connect that was timing out.
//
// One pool, held open, is the fix. `keepAliveTimeout` is what actually
// keeps the socket; the rest is about failing fast and bounded rather
// than fanning out.
const pool = remote ? new Agent({
	// Hold an idle socket for a minute instead of four seconds, so ordinary
	// use never reconnects at all.
	keepAliveTimeout: config.turso.keepAliveMs,
	keepAliveMaxTimeout: config.turso.keepAliveMs,
	// A small fixed pool, reused. Unbounded is the default, and a burst of
	// edits opening a burst of connections is the failure being fixed.
	connections: config.turso.connections,
	connect: {
		// Give up on a handshake in seconds, not on undici's leisurely
		// default -- a stalled connect should become a retry quickly.
		timeout: config.turso.connectMs,
		// A container with no route to the IPv6 internet still gets AAAA
		// records back, and a SYN sent down that route is never answered
		// rather than refused. This is how long to wait before trying the
		// v4 address instead, and it is the other half of the ETIMEDOUT.
		autoSelectFamily: true,
		autoSelectFamilyAttemptTimeout: config.turso.familyTimeoutMs
	},
	headersTimeout: config.turso.timeoutMs,
	bodyTimeout: config.turso.timeoutMs
}) : null;

// Where there is no IPv6 route at all, not asking for one is cheaper
// than discovering it twice a minute.
if (remote && config.turso.dnsOrder) dns.setDefaultResultOrder(config.turso.dnsOrder);

/**
 * `fetch` over the pool, with a deadline.
 *
 * Node's own `fetch`, not the one the `undici` package exports, and the
 * distinction is not cosmetic. Node bundles its own copy of undici, so
 * there are two `Request` classes in the process; the libSQL client
 * builds its request with the global one and hands it over whole. The
 * packaged `fetch` does not recognise a `Request` from the other copy,
 * falls back to reading it as a URL, and fails on the string
 * `[object Request]`.
 *
 * Passing the pool as `dispatcher` sidesteps all of that: the request
 * stays native, and only the connection pool comes from the package --
 * which is duck-typed, and the one thing that genuinely has to be ours.
 */
function pooledFetchWithDeadline(input, init = {}) {
	const stop = new AbortController();
	const timer = setTimeout(
		() => stop.abort(new DOMException('The database did not answer in time.', 'TimeoutError')),
		config.turso.timeoutMs
	);
	// The client hands its own signal in when it has one, so both are
	// honoured -- ours to bound the wait, theirs so a cancelled query is
	// still cancelled.
	const theirs = init.signal || (input && input.signal);
	if (theirs) theirs.addEventListener('abort', () => stop.abort(theirs.reason), { once: true });

	return fetch(input, { ...init, dispatcher: pool, signal: stop.signal })
		.finally(() => clearTimeout(timer));
}

let client = null;

export function db() {
	if (!client) {
		client = createClient({
			url: config.turso.url,
			authToken: config.turso.authToken || undefined,
			...(remote ? {
				fetch: pooledFetchWithDeadline,
				// How many statements may be in the air at once, matched to the
				// size of the pool they have to share.
				concurrency: config.turso.connections
			} : {})
		});
	}
	return client;
}

/** Close the pool on the way out, so a shutdown is not a dangling socket. */
export async function closePool() {
	if (pool) await pool.close().catch(() => {});
}

/* ------------------------------------------------------------------ *
 * Surviving a bad minute
 * ------------------------------------------------------------------ */

// Connect timeouts, resets and DNS hiccups are weather, not faults. They
// say nothing about the statement, so the statement can simply be sent
// again -- which is only true because every write in this file is
// idempotent.
const WEATHER = /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EPIPE|EAI_AGAIN|ENOTFOUND|ENETUNREACH|socket hang up|terminated|other side closed|TimeoutError|aborted/i;

export function transient(error) {
	for (let e = error, depth = 0; e && depth < 5; e = e.cause, depth++) {
		if (WEATHER.test(e.code || '') || WEATHER.test(e.name || '') || WEATHER.test(e.message || '')) {
			return true;
		}
		if (Array.isArray(e.errors) && e.errors.some(inner => transient(inner))) return true;
	}
	return false;
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Run a statement, riding out the weather. Throws once it is clearly not that. */
async function exec(statement, tries = config.turso.retries) {
	for (let attempt = 1; ; attempt++) {
		try {
			return await db().execute(statement);
		} catch (error) {
			if (attempt >= tries || !transient(error)) throw error;
			// Back off, with jitter so a burst of accounts that all failed
			// together does not come back together either.
			const backoff = 120 * 2 ** (attempt - 1);
			await wait(backoff + Math.random() * backoff);
		}
	}
}

/* ------------------------------------------------------------------ *
 * Schema
 * ------------------------------------------------------------------ */

// The schema, as an ordered list of steps. Each runs once per database
// and is recorded in `schema_version`, so a table added later is a new
// entry at the end rather than an edit to the first one -- the
// databases already out there have run the first and will not run it
// again. A step gets `run`, which sends one statement and rides out the
// weather like everything else here.
export const MIGRATIONS = [
	{
		version: 1,
		up: async run => {
			await run(`CREATE TABLE IF NOT EXISTS users (
				id          TEXT PRIMARY KEY,
				username    TEXT NOT NULL,
				avatar      TEXT,
				created_at  INTEGER NOT NULL,
				seen_at     INTEGER NOT NULL
			)`);
			// One save per account, overwritten in place. The tracker
			// already keeps its own undo history in the browser;
			// duplicating it here would mean shipping every keystroke to
			// a server for no gain.
			await run(`CREATE TABLE IF NOT EXISTS saves (
				user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
				rev         INTEGER NOT NULL,
				payload     TEXT NOT NULL,
				updated_at  INTEGER NOT NULL,
				device      TEXT
			)`);
			// Push subscriptions for the Vell reminder, by the server
			// region whose timetable they follow. Anonymous: an endpoint
			// is its own key and says nothing about who holds it.
			await run(`CREATE TABLE IF NOT EXISTS push_subs (
				endpoint    TEXT PRIMARY KEY,
				sub         TEXT NOT NULL,
				region      TEXT NOT NULL,
				created_at  INTEGER NOT NULL
			)`);
		}
	}
];

/** The data tables, in the order a restore has to write them (parents first). */
export const TABLES = ['users', 'saves', 'push_subs'];

/**
 * Bring the database up to the newest version. Safe to run any number
 * of times: every step already applied is skipped by its recorded
 * version, and step one is written so that it is harmless even on a
 * database that predates the version table.
 */
export async function applyMigrations() {
	await exec(`CREATE TABLE IF NOT EXISTS schema_version (
		version     INTEGER PRIMARY KEY,
		applied_at  INTEGER NOT NULL
	)`);
	const { rows } = await exec('SELECT MAX(version) AS v FROM schema_version');
	const current = Number(rows[0] && rows[0].v) || 0;
	for (const step of MIGRATIONS) {
		if (step.version <= current) continue;
		await step.up(exec);
		await exec({
			sql: 'INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (?, ?)',
			args: [step.version, Date.now()]
		});
	}
	return Math.max(current, ...MIGRATIONS.map(m => m.version));
}

let schema = null;

/**
 * Make sure the tables exist, once per process.
 *
 * Boot calls this and does not wait for it: a database that is briefly
 * unreachable should not stop the tracker from serving the page, since
 * the page works without one. Everything that touches a table awaits it
 * anyway, so the first query after a bad start simply pays for the
 * retry itself. Resolves to the schema version now in place.
 */
export function migrate() {
	if (!schema) {
		schema = (async () => {
			// SQLite leaves REFERENCES unenforced unless each connection asks.
			// A file database is one held handle, so asking once here holds
			// for the life of the process. Over `libsql://` every statement
			// is its own HTTPS request with no connection to pin the pragma
			// to, so there the parent-row check is made in code instead --
			// the deleted-account guard in api.js.
			if (!remote) await exec('PRAGMA foreign_keys = ON');
			return applyMigrations();
		})().catch(error => {
			schema = null;   // let the next caller try again
			throw error;
		});
	}
	return schema;
}

/**
 * Is the database answering right now? One statement, one attempt -- a
 * healthcheck that waited out four retries would report the outage
 * late, and the point of it is to report it at all.
 */
export async function ping() {
	await exec('SELECT 1', 1);
}

/* ------------------------------------------------------------------ *
 * Push subscriptions
 * ------------------------------------------------------------------ */

export async function putPushSub(endpoint, sub, region) {
	await migrate();
	await exec({
		sql: `INSERT INTO push_subs (endpoint, sub, region, created_at) VALUES (?, ?, ?, ?)
			ON CONFLICT(endpoint) DO UPDATE SET sub = excluded.sub, region = excluded.region`,
		args: [endpoint, JSON.stringify(sub), region, Date.now()]
	});
}

export async function deletePushSub(endpoint) {
	await migrate();
	await exec({ sql: 'DELETE FROM push_subs WHERE endpoint = ?', args: [endpoint] });
}

export async function listPushSubs(region) {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT endpoint, sub FROM push_subs WHERE region = ?', args: [region] });
	return rows.map(r => ({ endpoint: r.endpoint, sub: JSON.parse(r.sub) }));
}

export async function countPushSubs() {
	await migrate();
	const { rows } = await exec('SELECT COUNT(*) AS n FROM push_subs');
	return Number(rows[0] && rows[0].n) || 0;
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
	await migrate();
	const now = Date.now();
	await exec({
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
	await migrate();
	const { rows } = await exec({
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
	await migrate();
	const { rows } = await exec({
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
 * Make a save durable.
 *
 * One statement, no read first, and safe to send twice. The revision is
 * decided in memory before this is ever called, so there is nothing to
 * check here -- except that a write cannot walk the stored save
 * backwards. That guard is what makes a retry harmless: if the first
 * attempt landed and only the answer was lost, the repeat is a no-op
 * rather than a rollback.
 */
export async function writeSave(userId, { rev, payload, updatedAt, device }) {
	await migrate();
	await exec({
		sql: `INSERT INTO saves (user_id, rev, payload, updated_at, device)
		      VALUES (?, ?, ?, ?, ?)
		      ON CONFLICT(user_id) DO UPDATE SET
		        rev        = excluded.rev,
		        payload    = excluded.payload,
		        updated_at = excluded.updated_at,
		        device     = excluded.device
		      WHERE excluded.rev >= saves.rev`,
		args: [userId, rev, payload, updatedAt, device ?? null]
	});
}

/** Forget an account entirely -- the save goes with it. */
export async function deleteAccount(userId) {
	await migrate();
	await exec({ sql: 'DELETE FROM saves WHERE user_id = ?', args: [userId] });
	await exec({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });
}
