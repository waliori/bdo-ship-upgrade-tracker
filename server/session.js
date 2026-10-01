// Sessions, as a signed cookie and nothing else.
//
// There is no session table. A session says only "this browser proved it
// owns Discord account N, until this date", which fits in the cookie
// itself once it is signed -- and a table would only add a round trip to
// every request plus rows to expire.
//
// What there is, is the short list of cookies handed back. Each cookie
// carries a random id of its own, and signing out files that id as
// refused until the cookie would have lapsed anyway -- so a copy of it
// lifted from a shared machine stops opening anything the moment its
// owner signs out there. The list is held in memory and read once a
// process: one server owns it (see server.js), and the only way onto it
// is through this file.
//
// Signed, not encrypted: anyone can read their own account id out of the
// cookie, which is not a secret. What they cannot do is change it, or
// mint one, without the server's key.

import crypto from 'node:crypto';
import { config } from './config.js';
import { getUser, revokeSession, listRevokedSessions } from './db.js';

const SESSION_COOKIE = 'sail_session';
const STATE_COOKIE = 'sail_oauth';

const b64 = buf => Buffer.from(buf).toString('base64url');

function mac(value) {
	return crypto.createHmac('sha256', config.sessionSecret).update(value).digest('base64url');
}

function sign(value) {
	return `${value}.${mac(value)}`;
}

/** The original value, or null if it was tampered with. */
function unsign(signed) {
	if (typeof signed !== 'string') return null;
	const cut = signed.lastIndexOf('.');
	if (cut < 1) return null;
	const value = signed.slice(0, cut);
	const given = signed.slice(cut + 1);
	const want = mac(value);
	// Same-length buffers are required by timingSafeEqual, and a wrong
	// length is a wrong signature anyway.
	if (given.length !== want.length) return null;
	if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))) return null;
	return value;
}

/* ------------------------------------------------------------------ *
 * Cookies
 * ------------------------------------------------------------------ */

/** Parse a Cookie header. Express 4 does not do this on its own. */
export function cookies(req) {
	const out = {};
	const header = req.headers.cookie;
	if (!header) return out;
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq < 0) continue;
		const name = part.slice(0, eq).trim();
		if (!name || name in out) continue;
		try {
			out[name] = decodeURIComponent(part.slice(eq + 1).trim());
		} catch {
			// A cookie we did not set, with a value we cannot decode.
		}
	}
	return out;
}

function setCookie(res, name, value, maxAgeSeconds) {
	const bits = [
		`${name}=${encodeURIComponent(value)}`,
		'Path=/',
		'HttpOnly',
		// Lax, not Strict: the OAuth callback is a top-level navigation
		// back from Discord, and Strict would withhold the cookie on
		// exactly that request.
		'SameSite=Lax',
		`Max-Age=${maxAgeSeconds}`
	];
	if (config.cookieSecure) bits.push('Secure');
	res.append('Set-Cookie', bits.join('; '));
}

function clearCookie(res, name) {
	setCookie(res, name, '', 0);
}

/* ------------------------------------------------------------------ *
 * The session itself
 * ------------------------------------------------------------------ */

export function startSession(res, userId) {
	const expires = Date.now() + config.sessionDays * 86400_000;
	const sid = crypto.randomBytes(12).toString('base64url');
	const payload = b64(JSON.stringify({ uid: String(userId), exp: expires, sid }));
	setCookie(res, SESSION_COOKIE, sign(payload), config.sessionDays * 86400);
}

export function endSession(res) {
	clearCookie(res, SESSION_COOKIE);
}

/* The cookies handed back: sid -> when it would have lapsed. */
const revoked = new Map();
let loaded = null;        // the one read of the list, once it has started
let failedAt = 0;         // a database that was down is asked again, not every request

/**
 * The refused list, read once a process. A database that is down is
 * not the sailor's fault, so a failed read lets requests through and is
 * tried again half a minute later, not on every one of them.
 */
export function revocations() {
	if (!config.turso.url) return Promise.resolve();
	if (loaded) return loaded;
	if (Date.now() - failedAt < 30_000) return Promise.resolve();
	loaded = listRevokedSessions().then(rows => {
		for (const r of rows) revoked.set(r.sid, r.until);
	}, err => {
		loaded = null;
		failedAt = Date.now();
		console.warn('[session] the signed-out list could not be read yet:', err.message);
	});
	return loaded;
}

/** The claim a request's cookie makes, checked, or null. */
function claimOf(req) {
	const raw = unsign(cookies(req)[SESSION_COOKIE]);
	if (!raw) return null;
	let claim;
	try {
		claim = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
	} catch {
		return null;
	}
	// The expiry is signed too, so this is not merely the browser's word
	// for it -- an expired cookie the browser chose to keep sending is
	// still refused here.
	if (!claim || typeof claim.uid !== 'string' || !(claim.exp > Date.now())) return null;
	if (claim.sid && revoked.has(claim.sid)) return null;
	return claim;
}

/** The signed-in account id, or null. */
export function sessionUser(req) {
	// Started here as well as in requireUser, so the first request of a
	// process sets the read going; every one after it finds it done.
	if (!loaded) revocations();
	const claim = claimOf(req);
	return claim ? claim.uid : null;
}

/**
 * Sign this cookie out everywhere it has been copied to. The cookie is
 * cleared either way; a database that does not answer still leaves the
 * id refused by this process, which is the one that answers requests.
 *
 * A cookie from before cookies carried an id cannot be named, so it is
 * only cleared, and lapses on its own date.
 */
export async function revokeThis(req) {
	const claim = claimOf(req);
	if (!claim || !claim.sid) return false;
	revoked.set(claim.sid, claim.exp);
	try {
		await revokeSession(claim.sid, claim.exp);
	} catch (err) {
		console.warn('[session] could not file a sign-out:', err.message);
	}
	return true;
}

/** Express guard for anything that needs an account. */
export function requireUser(req, res, next) {
	revocations().then(() => admit(req, res, next));
}

function admit(req, res, next) {
	const uid = sessionUser(req);
	if (!uid) return res.status(401).json({ error: 'Not signed in.' });
	req.userId = uid;
	// A cookie outlives the account it was signed for: an account
	// deleted on one device still had a valid cookie on the next, and
	// every write from it filed new rows under an id nobody owns. The
	// row is asked after once a process, then remembered.
	if (known.has(uid)) return next();
	getUser(uid).then(user => {
		// Gone, not merely signed out: 410, as /api/state says it, and the
		// cookie cleared so the device signs itself out.
		if (!user) { endSession(res); return res.status(410).json({ error: 'This account has been deleted.' }); }
		known.add(uid);
		next();
	}, () => next());   // the database down is not the sailor's fault: let the route answer for it
}
const known = new Set();
/** An account gone: its cookie opens nothing from now on. */
export function forgetUser(uid) { known.delete(uid); }

/* ------------------------------------------------------------------ *
 * OAuth hand-off
 * ------------------------------------------------------------------ */

/**
 * Remember where a sign-in started, and hand back the `state` to send to
 * Discord.
 *
 * `state` is what stops someone else's callback being replayed into your
 * browser: it is minted here, kept in a short-lived cookie, and the
 * callback is only honoured when the two agree. The tab the user started
 * from rides along so they land back where they were.
 */
/* Ten minutes is longer than anyone takes to approve a Discord prompt
 * and short enough that an abandoned attempt does not linger. The limit
 * is signed into the state itself, not just set on the cookie: a browser
 * that keeps sending an expired cookie is the browser's business, but
 * honouring it would be ours. */
const STATE_TTL_MS = 600_000;

export function beginOAuth(res, returnTo) {
	const nonce = crypto.randomBytes(16).toString('base64url');
	const payload = b64(JSON.stringify({ n: nonce, r: returnTo || '/', t: Date.now() }));
	setCookie(res, STATE_COOKIE, sign(payload), STATE_TTL_MS / 1000);
	return payload;
}

/**
 * Check a callback's `state` against the cookie, and say where to go next.
 * Returns null when they disagree, which is the only safe reading.
 */
export function finishOAuth(req, res, given) {
	const stored = unsign(cookies(req)[STATE_COOKIE]);
	clearCookie(res, STATE_COOKIE);
	if (!stored || !given || stored !== given) return null;
	try {
		const claim = JSON.parse(Buffer.from(stored, 'base64url').toString('utf8'));
		if (!(claim.t > Date.now() - STATE_TTL_MS)) return null;
		return { returnTo: safeReturn(claim.r) };
	} catch {
		return null;
	}
}

/**
 * Only ever redirect back into this site. An open redirect here would let
 * a crafted sign-in link bounce a freshly authenticated user anywhere.
 *
 * Backslashes are refused along with `//`: browsers read `\` as `/` when
 * resolving a Location, so `/\evil.com` lands on evil.com even though it
 * begins with a single slash. Control characters have no place in a path
 * either -- a stray CR or LF is a header trying to happen.
 */
function safeReturn(value) {
	if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/';
	// eslint-disable-next-line no-control-regex -- the control range is the point
	if (/[\\\u0000-\u001f\u007f]/.test(value)) return '/';
	return value;
}
