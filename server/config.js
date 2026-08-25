// What the server has been given, and therefore what it can offer.
//
// The tracker needs none of this. With nothing configured it is the same
// browser-only tool it has always been: your data lives in localStorage,
// there is no account, and nothing leaves the machine. Sync is strictly
// additive -- it switches on only when every piece it needs is present,
// so a half-configured deploy falls back to "off" rather than failing at
// the first sign-in.

import crypto from 'node:crypto';

const read = name => (process.env[name] || '').trim();

const discord = {
	clientId: read('DISCORD_CLIENT_ID'),
	clientSecret: read('DISCORD_CLIENT_SECRET')
};

const num = (name, fallback) => Number(read(name)) || fallback;

const turso = {
	url: read('TURSO_DATABASE_URL'),
	authToken: read('TURSO_AUTH_TOKEN'),

	// How long an idle connection to Turso is held open. The default four
	// seconds means almost every save reconnects, since saves are debounced
	// and then nothing happens until you type again.
	keepAliveMs: num('TURSO_KEEPALIVE_MS', 60_000),
	// A small pool, reused, rather than an unbounded fan of new sockets.
	connections: num('TURSO_CONNECTIONS', 8),
	// A handshake that has not completed by now is not going to.
	connectMs: num('TURSO_CONNECT_MS', 5_000),
	// And a whole statement that has not answered by now is weather.
	timeoutMs: num('TURSO_TIMEOUT_MS', 10_000),
	// How long to wait on an IPv6 address before trying the IPv4 one.
	familyTimeoutMs: num('TURSO_FAMILY_MS', 500),
	// Attempts per statement before giving up and letting the write be
	// retried later. Every statement this server sends is idempotent.
	retries: num('TURSO_RETRIES', 4),
	// 'ipv4first' where the host has no IPv6 route -- which is most
	// containers. Set to 'verbatim' to leave resolution alone.
	dnsOrder: read('DNS_RESULT_ORDER') || 'ipv4first'
};

// Where this deployment answers, used to build the OAuth redirect. Discord
// checks the redirect against a list you register with it, so this has to
// match exactly -- scheme, host, port and all.
const publicUrl = (read('PUBLIC_URL') || `http://localhost:${read('PORT') || 8000}`)
	.replace(/\/+$/, '');

// Sync needs an identity provider and somewhere to put the data. Either
// one alone is useless, so both are required before any of it turns on.
export const syncEnabled = Boolean(
	discord.clientId && discord.clientSecret && turso.url
);

// Sessions are signed with this. A missing secret is not fatal -- the
// server invents one and says so -- but every restart then invalidates
// every sign-in, which is fine locally and wrong in production.
let sessionSecret = read('SESSION_SECRET');
export const ephemeralSecret = syncEnabled && !sessionSecret;
if (!sessionSecret) sessionSecret = crypto.randomBytes(32).toString('hex');

export const config = {
	port: num('PORT', 8000),
	publicUrl,
	discord: {
		...discord,
		redirectUri: `${publicUrl}/auth/discord/callback`,
		// `identify` is the whole ask: an account id to file the save
		// under, and a name to show in the header. No email, no guilds.
		scope: 'identify'
	},
	turso,
	sessionSecret,
	// Cookies are marked Secure whenever the site is served over HTTPS,
	// which is every real deployment and no local one.
	cookieSecure: publicUrl.startsWith('https://'),
	// A tracker save is a few hundred keys of stock and a handful of
	// targets. A megabyte is far past anything legitimate, and stops a
	// signed-in account from being used as free storage.
	maxSaveBytes: num('MAX_SAVE_BYTES', 1024 * 1024),
	sessionDays: num('SESSION_DAYS', 30),

	// How long a change waits before being written out. Long enough that
	// typing "1", "12", "120" is one write rather than three; short enough
	// that it is over before anyone could close the tab.
	flushDelayMs: num('FLUSH_DELAY_MS', 400),
	// Ceilings on the saves held in memory. A save is a few kilobytes, so
	// these are generous; they exist so that a deployment with a great many
	// accounts cannot turn all of them into resident memory.
	cacheAccounts: num('CACHE_ACCOUNTS', 5_000),
	cacheBytes: num('CACHE_BYTES', 128 * 1024 * 1024)
};

/** A one-line account of what is switched on, for the boot log. */
export function describe() {
	if (!syncEnabled) return 'sync off -- browser-only, no account, no database';
	const where = config.turso.url.startsWith('file:') ? 'local file' : 'Turso';
	return `sync on -- Discord sign-in, saves in ${where}`;
}
