// Sessions, as a signed cookie and nothing else.
//
// There is no session table. A session says only "this browser proved it
// owns Discord account N, until this date", which fits in the cookie
// itself once it is signed -- and a table would only add a round trip to
// every request plus rows to expire.
//
// Signed, not encrypted: anyone can read their own account id out of the
// cookie, which is not a secret. What they cannot do is change it, or
// mint one, without the server's key.

import crypto from 'node:crypto';
import { config } from './config.js';

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
	const payload = b64(JSON.stringify({ uid: String(userId), exp: expires }));
	setCookie(res, SESSION_COOKIE, sign(payload), config.sessionDays * 86400);
}

export function endSession(res) {
	clearCookie(res, SESSION_COOKIE);
}

/** The signed-in account id, or null. */
export function sessionUser(req) {
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
	return claim.uid;
}

/** Express guard for anything that needs an account. */
export function requireUser(req, res, next) {
	const uid = sessionUser(req);
	if (!uid) return res.status(401).json({ error: 'Not signed in.' });
	req.userId = uid;
	next();
}

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
