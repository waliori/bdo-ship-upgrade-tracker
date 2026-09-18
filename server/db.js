// The one place that talks to the database.
//
// Turso speaks libSQL, and so does a plain local file, so the same client
// covers both: point TURSO_DATABASE_URL at `file:./.data/tracker.db` to
// develop without an account, or at a `libsql://` host to run for real.
//
// Five tables and a version row. The tracker derives everything it
// shows from stock and targets, so that is all a save has to carry --
// there is no server-side notion of a plan, and nothing here needs to
// understand a recipe. The community table holds a digest of a save
// for the accounts that asked to be on the boards, and the feedback
// table what people write in from More -> Feedback.
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
	},
	{
		version: 2,
		up: async run => {
			// What people send from More -> Feedback: a kind, the words,
			// and where they were. The account is noted when there is
			// one, so a reply has somewhere to go, and null otherwise --
			// a stranger may report a bug too.
			await run(`CREATE TABLE IF NOT EXISTS feedback (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id     TEXT,
				username    TEXT,
				kind        TEXT NOT NULL,
				text        TEXT NOT NULL,
				page        TEXT,
				contact     TEXT,
				version     TEXT,
				agent       TEXT,
				status      TEXT NOT NULL DEFAULT 'open',
				created_at  INTEGER NOT NULL
			)`);
			// Who has chosen to stand on the community boards, how they
			// want to be shown there, and the digest of their save the
			// boards are drawn from. A row exists only while the account
			// is opted in; leaving deletes it, so nothing derived is kept
			// about anyone who has not asked to be seen.
			await run(`CREATE TABLE IF NOT EXISTS community (
				user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
				share       TEXT NOT NULL,
				stats       TEXT NOT NULL,
				rev         INTEGER NOT NULL DEFAULT 0,
				joined_at   INTEGER NOT NULL,
				updated_at  INTEGER NOT NULL
			)`);
		}
	},
	{
		version: 3,
		up: async run => {
			// The boards are opt-out now, not opt-in: an account that
			// signs in is put on them unless it has said otherwise. That
			// "otherwise" cannot live in the community table, because
			// leaving deletes the row -- and a promise that leaving takes
			// the digest down is worth keeping. So it is a flag on the
			// account: set when someone leaves, cleared when they come
			// back, and the one thing that stops the next sign-in from
			// quietly putting them back.
			await run('ALTER TABLE users ADD COLUMN community_off INTEGER NOT NULL DEFAULT 0');
		}
	},
	{
		version: 4,
		up: async run => {
			// Who has the page open, and how many have ever opened it.
			// A row is a browser, not a person and not an account: the
			// token is one the browser invented for itself, and the two
			// timestamps are the whole of the rest. No address is kept,
			// and nothing here can be joined to a save or a sign-in.
			await run(`CREATE TABLE IF NOT EXISTS presence (
				token       TEXT PRIMARY KEY,
				first_at    INTEGER NOT NULL,
				seen_at     INTEGER NOT NULL
			)`);
			// The only question asked of it is "how many lately".
			await run('CREATE INDEX IF NOT EXISTS presence_seen ON presence (seen_at)');
		}
	},
	{
		version: 5,
		up: async run => {
			// A subscription can now belong to an account as well as to a
			// region. The region is the Vell timetable it follows, which
			// wants no account at all; the account is what lets one
			// device's clock reach the others -- a chime set on the
			// desktop reaching the phone in a pocket. Null for anyone who
			// subscribed without signing in, which is still allowed.
			await run('ALTER TABLE push_subs ADD COLUMN user_id TEXT');
			// The chimes an account has asked for, each at its own
			// moment. Rows are short-lived: the sweep sends them and
			// deletes them, and a run is over in minutes. Nothing here
			// says what the chime is for beyond the words to show.
			await run(`CREATE TABLE IF NOT EXISTS push_alerts (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				at          INTEGER NOT NULL,
				title       TEXT NOT NULL,
				body        TEXT NOT NULL,
				tag         TEXT NOT NULL,
				created_at  INTEGER NOT NULL
			)`);
			// The sweep asks one question, every few seconds: what is due.
			await run('CREATE INDEX IF NOT EXISTS push_alerts_at ON push_alerts (at)');
		}
	},
	{
		version: 6,
		up: async run => {
			// What a subscription is for. A browser has one endpoint and
			// this app has two things to say through it, so a device
			// subscribed only so that its owner's chimes can reach it must
			// not also start getting the Vell reminder. Everyone already
			// subscribed asked for Vell -- that was the only reason to
			// subscribe -- so the default says so.
			await run('ALTER TABLE push_subs ADD COLUMN vell INTEGER NOT NULL DEFAULT 1');
		}
	},
	{
		version: 7,
		up: async run => {
			// How the words of an entry are to be read. Everything sent
			// from now on is the small markup in js/markup.js; everything
			// already in the table was typed as plain words, and an
			// asterisk somebody wrote last month must not turn into
			// emphasis because this shipped. So the old rows keep the
			// default and are rendered as what they were.
			await run("ALTER TABLE feedback ADD COLUMN format TEXT NOT NULL DEFAULT 'plain'");
			// The screenshots sent with a report. The bytes are on disk
			// (config.uploadDir); this is the part that has to be asked
			// questions -- whose it is, which entry it belongs to, and
			// whether it was ever attached to one at all. A row with no
			// entry is an upload still being composed, and is swept if
			// the report is never sent.
			await run(`CREATE TABLE IF NOT EXISTS feedback_files (
				id          TEXT PRIMARY KEY,
				user_id     TEXT NOT NULL,
				feedback_id INTEGER,
				mime        TEXT NOT NULL,
				bytes       INTEGER NOT NULL,
				width       INTEGER,
				height      INTEGER,
				name        TEXT,
				created_at  INTEGER NOT NULL
			)`);
			// The two questions asked of it: what does this entry carry,
			// and what is this account still holding unattached.
			await run('CREATE INDEX IF NOT EXISTS feedback_files_entry ON feedback_files (feedback_id)');
			await run('CREATE INDEX IF NOT EXISTS feedback_files_owner ON feedback_files (user_id, feedback_id)');
		}
	},
	{
		version: 8,
		up: async run => {
			// What the sea was showing today, as somebody saw it. The
			// board is the same for everyone on a server and is redrawn
			// at the refill, so one player's reading is worth having to
			// all of them -- with their name on it, because that is the
			// whole of the arrangement: somebody went and looked.
			//
			// `offers` is the reading itself, as JSON: island, what it
			// takes, how many, what it pays. The server never asks what
			// any of that means; the browser has the tables.
			await run(`CREATE TABLE IF NOT EXISTS barter_boards (
				id          INTEGER PRIMARY KEY AUTOINCREMENT,
				user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				day         TEXT NOT NULL,
				layout      TEXT,
				offers      TEXT NOT NULL,
				created_at  INTEGER NOT NULL,
				seen        INTEGER NOT NULL DEFAULT 0,
				hidden      INTEGER NOT NULL DEFAULT 0
			)`);
			// Who else saw the same board. Once an account, so a count
			// of confirmations means what it says.
			await run(`CREATE TABLE IF NOT EXISTS barter_board_seen (
				board_id    INTEGER NOT NULL REFERENCES barter_boards(id) ON DELETE CASCADE,
				user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				at          INTEGER NOT NULL,
				PRIMARY KEY (board_id, user_id)
			)`);
			// The two questions: what has been seen lately, and has this
			// account already told us about today.
			await run('CREATE INDEX IF NOT EXISTS barter_boards_when ON barter_boards (created_at)');
			await run('CREATE INDEX IF NOT EXISTS barter_boards_owner ON barter_boards (user_id, day)');
		}
	}
];

/** The data tables, in the order a restore has to write them (parents first). */
export const TABLES = ['users', 'saves', 'push_subs', 'push_alerts', 'feedback', 'feedback_files', 'community', 'presence', 'barter_boards', 'barter_board_seen'];

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

/**
 * Keep a subscription, or bring it up to date. `vell` is whether the
 * Vell reminder is wanted through it; null leaves whatever the row
 * already said, so a device subscribing for its owner's chimes does
 * not turn the reminder off, or on.
 */
export async function putPushSub(endpoint, sub, region, userId = null, vell = null) {
	await migrate();
	await exec({
		sql: `INSERT INTO push_subs (endpoint, sub, region, created_at, user_id, vell) VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(endpoint) DO UPDATE SET sub = excluded.sub, region = excluded.region, user_id = excluded.user_id,
				vell = COALESCE(?, push_subs.vell)`,
		// Saying nothing means the Vell reminder, because that is all a
		// subscription ever meant before there was anything else -- an
		// older tab that has not reloaded must not quietly lose it. Only
		// an explicit no makes a row that is not on the Vell round, and
		// on an update saying nothing leaves the row as it was.
		args: [endpoint, JSON.stringify(sub), region, Date.now(), userId, vell === false ? 0 : 1, vell === null ? null : (vell ? 1 : 0)]
	});
}

export async function deletePushSub(endpoint) {
	await migrate();
	await exec({ sql: 'DELETE FROM push_subs WHERE endpoint = ?', args: [endpoint] });
}

export async function listPushSubs(region) {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT endpoint, sub FROM push_subs WHERE region = ? AND vell = 1', args: [region] });
	return rows.map(r => ({ endpoint: r.endpoint, sub: JSON.parse(r.sub) }));
}

/** Every subscription an account has: the devices a chime reaches. */
export async function listUserPushSubs(userId) {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT endpoint, sub FROM push_subs WHERE user_id = ?', args: [userId] });
	return rows.map(r => ({ endpoint: r.endpoint, sub: JSON.parse(r.sub) }));
}

/* ------------------------------------------------------------------ *
 * The chimes an account has asked for
 * ------------------------------------------------------------------ */

/** Put a set of alerts in, having taken out whatever was there under
 *  the same tag: a clock restarted replaces its own schedule rather
 *  than chiming twice for the same run. */
export async function putPushAlerts(userId, tag, alerts) {
	await migrate();
	await exec({ sql: 'DELETE FROM push_alerts WHERE user_id = ? AND tag = ?', args: [userId, tag] });
	const now = Date.now();
	for (const a of alerts) {
		await exec({
			sql: 'INSERT INTO push_alerts (user_id, at, title, body, tag, created_at) VALUES (?, ?, ?, ?, ?, ?)',
			args: [userId, Math.round(a.at), a.title, a.body, tag, now]
		});
	}
}

export async function deletePushAlerts(userId, tag = null) {
	await migrate();
	if (tag) await exec({ sql: 'DELETE FROM push_alerts WHERE user_id = ? AND tag = ?', args: [userId, tag] });
	else await exec({ sql: 'DELETE FROM push_alerts WHERE user_id = ?', args: [userId] });
}

export async function countPushAlerts(userId) {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT COUNT(*) AS n FROM push_alerts WHERE user_id = ?', args: [userId] });
	return Number(rows[0] && rows[0].n) || 0;
}

/** What is due to be sent, oldest first. A row long past its moment is
 *  due as much as one that has just come round: a server that was down
 *  for a minute should still say what it was going to say. */
export async function duePushAlerts(now, limit = 100) {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT id, user_id, at, title, body, tag FROM push_alerts WHERE at <= ? ORDER BY at LIMIT ?', args: [now, limit] });
	return rows.map(r => ({ id: Number(r.id), userId: r.user_id, at: Number(r.at), title: r.title, body: r.body, tag: r.tag }));
}

export async function dropPushAlerts(ids) {
	if (!ids.length) return;
	await migrate();
	await exec({ sql: `DELETE FROM push_alerts WHERE id IN (${ids.map(() => '?').join(',')})`, args: ids });
}

export async function countPushSubs() {
	await migrate();
	const { rows } = await exec('SELECT COUNT(*) AS n FROM push_subs');
	return Number(rows[0] && rows[0].n) || 0;
}

/* ------------------------------------------------------------------ *
 * Who is out
 * ------------------------------------------------------------------ */

/** This browser said hello. First time in, it joins the roll. */
export async function touchPresence(token, now = Date.now()) {
	await migrate();
	await exec({
		sql: `INSERT INTO presence (token, first_at, seen_at) VALUES (?, ?, ?)
			ON CONFLICT(token) DO UPDATE SET seen_at = excluded.seen_at`,
		args: [token, now, now]
	});
}

/** How many browsers have said hello since `since`, how many ever, and
 *  how many accounts have ever signed in. The third is a different kind
 *  of number from the first two -- a browser is a browser, an account is
 *  a person who came back often enough to want their save kept -- and it
 *  is counted here because the three are read together and one round
 *  trip is enough for all of them. */
export async function countPresence(since) {
	await migrate();
	const { rows } = await exec({
		sql: `SELECT (SELECT COUNT(*) FROM presence WHERE seen_at >= ?) AS online,
			(SELECT COUNT(*) FROM presence) AS sailors,
			(SELECT COUNT(*) FROM users) AS crew`,
		args: [since]
	});
	return {
		online: Number(rows[0] && rows[0].online) || 0,
		sailors: Number(rows[0] && rows[0].sailors) || 0,
		crew: Number(rows[0] && rows[0].crew) || 0
	};
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

/** Forget an account entirely -- the save and its place on the boards go with it. */
export async function deleteAccount(userId) {
	await migrate();
	await exec({ sql: 'DELETE FROM community WHERE user_id = ?', args: [userId] });
	await exec({ sql: 'DELETE FROM saves WHERE user_id = ?', args: [userId] });
	await exec({ sql: 'DELETE FROM users WHERE id = ?', args: [userId] });
}

/* ------------------------------------------------------------------ *
 * Feedback
 * ------------------------------------------------------------------ */

export async function insertFeedback({ userId, username, kind, text, format, page, contact, version, agent }) {
	await migrate();
	const { lastInsertRowid } = await exec({
		sql: `INSERT INTO feedback (user_id, username, kind, text, format, page, contact, version, agent, status, created_at)
		      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
		args: [userId ?? null, username ?? null, kind, text, format || 'plain', page ?? null, contact ?? null, version ?? null, agent ?? null, Date.now()]
	});
	return Number(lastInsertRowid);
}

const entryOf = r => ({
	id: Number(r.id), userId: r.user_id || null, username: r.username || null, kind: r.kind, text: r.text,
	format: r.format || 'plain',
	page: r.page || null, contact: r.contact || null, version: r.version || null, agent: r.agent || null,
	status: r.status, createdAt: Number(r.created_at), files: []
});

/** The newest entries, open ones first, each with its screenshots. */
export async function listFeedback(limit = 200) {
	await migrate();
	const { rows } = await exec({
		sql: `SELECT id, user_id, username, kind, text, format, page, contact, version, agent, status, created_at
		      FROM feedback ORDER BY (status = 'open') DESC, created_at DESC LIMIT ?`,
		args: [limit]
	});
	const entries = rows.map(entryOf);
	if (!entries.length) return entries;

	// One more query for every picture of every entry on the page,
	// rather than one query per entry: the inbox is two hundred rows at
	// most and Turso is a round trip away.
	const by = new Map(entries.map(e => [e.id, e]));
	const { rows: files } = await exec({
		sql: `SELECT id, feedback_id, mime, bytes, width, height, name
		      FROM feedback_files WHERE feedback_id IN (${entries.map(() => '?').join(', ')})
		      ORDER BY created_at`,
		args: entries.map(e => e.id)
	});
	for (const f of files) {
		const entry = by.get(Number(f.feedback_id));
		if (entry) entry.files.push(fileOf(f));
	}
	return entries;
}

/**
 * Is this entry one anybody may read?
 *
 * Asked by the route that serves a screenshot: a picture is as public
 * as the report it was sent with, so an entry hidden by an admin -- or
 * one already thrown away -- takes its pictures out of sight with it.
 */
export async function feedbackShown(id) {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT status FROM feedback WHERE id = ?', args: [id] });
	return Boolean(rows[0]) && rows[0].status !== 'hidden';
}

export async function setFeedbackStatus(id, status) {
	await migrate();
	await exec({ sql: 'UPDATE feedback SET status = ? WHERE id = ?', args: [status, id] });
}

/** An entry and the rows for its pictures, gone. The files themselves
 *  are the caller's to unlink -- this file does not touch the disk. */
export async function deleteFeedback(id) {
	await migrate();
	const { rows } = await exec({
		sql: 'SELECT id, mime FROM feedback_files WHERE feedback_id = ?',
		args: [id]
	});
	await exec({ sql: 'DELETE FROM feedback_files WHERE feedback_id = ?', args: [id] });
	await exec({ sql: 'DELETE FROM feedback WHERE id = ?', args: [id] });
	return rows.map(r => ({ id: String(r.id), mime: r.mime }));
}

export async function countFeedback(status = 'open') {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT COUNT(*) AS n FROM feedback WHERE status = ?', args: [status] });
	return Number(rows[0] && rows[0].n) || 0;
}

/**
 * What one account has sent lately: how many are still open, how many
 * in the last day, and when the last one was.
 *
 * One query, because it is asked on the way in to every send and the
 * three answers are three ceilings on the same table.
 */
export async function feedbackStanding(userId, since) {
	await migrate();
	const { rows } = await exec({
		sql: `SELECT
		        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
		        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS lately,
		        MAX(created_at) AS last
		      FROM feedback WHERE user_id = ?`,
		args: [since, userId]
	});
	const r = rows[0] || {};
	return { open: Number(r.open) || 0, lately: Number(r.lately) || 0, last: Number(r.last) || 0 };
}

/* ------------------------------------------------------------------ *
 * The pictures sent with them
 * ------------------------------------------------------------------ */

const fileOf = r => ({
	id: String(r.id), mime: r.mime, bytes: Number(r.bytes),
	width: r.width === null ? null : Number(r.width),
	height: r.height === null ? null : Number(r.height),
	name: r.name || null,
	...(r.user_id === undefined ? {} : { userId: r.user_id, feedbackId: r.feedback_id === null ? null : Number(r.feedback_id) })
});

export async function insertFile({ id, userId, mime, bytes, width, height, name }) {
	await migrate();
	await exec({
		sql: `INSERT INTO feedback_files (id, user_id, feedback_id, mime, bytes, width, height, name, created_at)
		      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
		args: [id, userId, mime, bytes, width ?? null, height ?? null, name ?? null, Date.now()]
	});
}

/** One picture, with who owns it and what it hangs on. */
export async function getFile(id) {
	await migrate();
	const { rows } = await exec({
		sql: 'SELECT id, user_id, feedback_id, mime, bytes, width, height, name FROM feedback_files WHERE id = ?',
		args: [id]
	});
	return rows[0] ? fileOf(rows[0]) : null;
}

/** The pictures this account has uploaded and not yet sent with anything. */
export async function pendingFiles(userId) {
	await migrate();
	const { rows } = await exec({
		sql: `SELECT id, user_id, feedback_id, mime, bytes, width, height, name
		      FROM feedback_files WHERE user_id = ? AND feedback_id IS NULL ORDER BY created_at`,
		args: [userId]
	});
	return rows.map(fileOf);
}

/**
 * Hang a set of pending pictures on an entry.
 *
 * The owner is in the WHERE clause and so is "not already attached":
 * an id that belongs to somebody else, or that has already been sent
 * with another report, is silently not attached rather than moved.
 */
export async function attachFiles(ids, feedbackId, userId) {
	if (!ids.length) return 0;
	await migrate();
	const { rowsAffected } = await exec({
		sql: `UPDATE feedback_files SET feedback_id = ?
		      WHERE user_id = ? AND feedback_id IS NULL AND id IN (${ids.map(() => '?').join(', ')})`,
		args: [feedbackId, userId, ...ids]
	});
	return Number(rowsAffected) || 0;
}

export async function deleteFile(id) {
	await migrate();
	await exec({ sql: 'DELETE FROM feedback_files WHERE id = ?', args: [id] });
}

/** Uploads nobody ever sent, older than `before`. Swept on a timer. */
export async function staleFiles(before) {
	await migrate();
	const { rows } = await exec({
		sql: 'SELECT id, mime FROM feedback_files WHERE feedback_id IS NULL AND created_at < ?',
		args: [before]
	});
	return rows.map(r => ({ id: String(r.id), mime: r.mime }));
}

/* ------------------------------------------------------------------ *
 * Community
 * ------------------------------------------------------------------ */

/**
 * How an account stands on the boards and whether it ever chose to be
 * off them, in one query -- which is what deciding whether to put a
 * returning account back on needs, and it is asked on every load.
 *
 * `off` is only meaningful while `share` is null: someone on the boards
 * plainly has not opted out of them.
 */
export async function getShareState(userId) {
	await migrate();
	const { rows } = await exec({
		sql: `SELECT u.community_off AS off, c.share AS share
		      FROM users u LEFT JOIN community c ON c.user_id = u.id
		      WHERE u.id = ?`,
		args: [userId]
	});
	if (!rows[0]) return { share: null, off: true, known: false };
	return { share: rows[0].share || null, off: Number(rows[0].off) === 1, known: true };
}

/** Remember that an account chose to be off the boards, or chose not to be. */
export async function setCommunityOff(userId, off) {
	await migrate();
	await exec({ sql: 'UPDATE users SET community_off = ? WHERE id = ?', args: [off ? 1 : 0, userId] });
}

/** Put an account on the boards, or change how it is shown there. */
export async function putCommunity(userId, share, stats, rev) {
	await migrate();
	const now = Date.now();
	await exec({
		sql: `INSERT INTO community (user_id, share, stats, rev, joined_at, updated_at)
		      VALUES (?, ?, ?, ?, ?, ?)
		      ON CONFLICT(user_id) DO UPDATE SET
		        share = excluded.share, stats = excluded.stats, rev = excluded.rev, updated_at = excluded.updated_at`,
		args: [userId, share, JSON.stringify(stats), rev, now, now]
	});
}

/** A fresher digest for an account already on the boards. */
export async function putDigest(userId, stats, rev) {
	await migrate();
	await exec({
		sql: 'UPDATE community SET stats = ?, rev = ?, updated_at = ? WHERE user_id = ?',
		args: [JSON.stringify(stats), rev, Date.now(), userId]
	});
}

export async function deleteCommunity(userId) {
	await migrate();
	await exec({ sql: 'DELETE FROM community WHERE user_id = ?', args: [userId] });
}

/**
 * Everyone on the boards, with the name and avatar to show for the
 * named ones, the digest held, and the revision of the save it was
 * drawn from beside the save's own -- so the caller can tell which
 * digests are behind.
 */
export async function listCommunity() {
	await migrate();
	const { rows } = await exec(`SELECT c.user_id, c.share, c.stats, c.rev, c.joined_at, u.username, u.avatar, s.rev AS save_rev
		FROM community c
		JOIN users u ON u.id = c.user_id
		LEFT JOIN saves s ON s.user_id = c.user_id`);
	return rows.map(r => ({
		userId: r.user_id, share: r.share, stats: r.stats, rev: Number(r.rev) || 0, joinedAt: Number(r.joined_at) || 0,
		username: r.username, avatar: r.avatar || null, saveRev: r.save_rev === null || r.save_rev === undefined ? null : Number(r.save_rev)
	}));
}

export async function countCommunity() {
	await migrate();
	const { rows } = await exec('SELECT COUNT(*) AS n FROM community');
	return Number(rows[0] && rows[0].n) || 0;
}

/* ------------------------------------------------------------------ *
 * Today's board, as the fleet saw it
 * ------------------------------------------------------------------ */

const sightingOf = r => ({
	id: Number(r.id),
	userId: r.user_id,
	day: r.day,
	layout: r.layout || null,
	offers: safeJSON(r.offers),
	at: Number(r.created_at),
	seen: Number(r.seen || 0),
	// A name only where the account is shown by name on the boards. An
	// account that is anonymous there is anonymous here: the same
	// choice, honoured in both places.
	name: r.share === 'named' ? r.username || null : null
});

function safeJSON(text) {
	try {
		const out = JSON.parse(text);
		return Array.isArray(out) ? out : [];
	} catch {
		return [];
	}
}

/** The sightings of the last few days, newest first. */
export async function listSightings(since, limit = 200) {
	await migrate();
	const { rows } = await exec({
		sql: `SELECT b.id, b.user_id, b.day, b.layout, b.offers, b.created_at, b.seen, u.username, c.share
		      FROM barter_boards b
		      LEFT JOIN users u ON u.id = b.user_id
		      LEFT JOIN community c ON c.user_id = b.user_id
		      WHERE b.created_at >= ? AND b.hidden = 0
		      ORDER BY b.created_at DESC LIMIT ?`,
		args: [since, limit]
	});
	return rows.map(sightingOf);
}

/** What this account has already said about a day, if anything. */
export async function getSighting(userId, day) {
	await migrate();
	const { rows } = await exec({
		sql: 'SELECT id, user_id, day, layout, offers, created_at, seen FROM barter_boards WHERE user_id = ? AND day = ? AND hidden = 0',
		args: [userId, day]
	});
	return rows[0] ? sightingOf(rows[0]) : null;
}

/** One sighting, whoever sent it. */
export async function getSightingById(id) {
	await migrate();
	const { rows } = await exec({
		sql: 'SELECT id, user_id, day, layout, offers, created_at, seen, hidden FROM barter_boards WHERE id = ?',
		args: [id]
	});
	return rows[0] ? { ...sightingOf(rows[0]), hidden: Boolean(Number(rows[0].hidden)) } : null;
}

export async function insertSighting(userId, { day, layout, offers }) {
	await migrate();
	const { lastInsertRowid } = await exec({
		sql: 'INSERT INTO barter_boards (user_id, day, layout, offers, created_at, seen, hidden) VALUES (?, ?, ?, ?, ?, 0, 0)',
		args: [userId, day, layout ?? null, JSON.stringify(offers), Date.now()]
	});
	return Number(lastInsertRowid);
}

export async function updateSighting(id, { layout, offers }) {
	await migrate();
	await exec({
		sql: 'UPDATE barter_boards SET offers = ?, layout = ?, created_at = ? WHERE id = ?',
		args: [JSON.stringify(offers), layout ?? null, Date.now(), id]
	});
}

export async function hideSighting(id) {
	await migrate();
	await exec({ sql: 'UPDATE barter_boards SET hidden = 1 WHERE id = ?', args: [id] });
}

/** Which sightings this account has said it saw too. */
export async function sightingsConfirmedBy(userId) {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT board_id FROM barter_board_seen WHERE user_id = ?', args: [userId] });
	return rows.map(r => Number(r.board_id));
}

/** Somebody else saw the same board. Counted once an account, which is
 *  what makes the number mean anything. */
export async function confirmSighting(id, userId) {
	await migrate();
	const { rows } = await exec({ sql: 'SELECT 1 FROM barter_board_seen WHERE board_id = ? AND user_id = ?', args: [id, userId] });
	if (rows[0]) return false;
	await exec({ sql: 'INSERT INTO barter_board_seen (board_id, user_id, at) VALUES (?, ?, ?)', args: [id, userId, Date.now()] });
	await exec({ sql: 'UPDATE barter_boards SET seen = seen + 1 WHERE id = ?', args: [id] });
	return true;
}

/** Sightings older than the boards they describe. */
export async function sweepSightings(before) {
	await migrate();
	await exec({ sql: 'DELETE FROM barter_board_seen WHERE board_id IN (SELECT id FROM barter_boards WHERE created_at < ?)', args: [before] });
	const { rowsAffected } = await exec({ sql: 'DELETE FROM barter_boards WHERE created_at < ?', args: [before] });
	return Number(rowsAffected || 0);
}
