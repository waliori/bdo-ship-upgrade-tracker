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

const turso = {
	url: read('TURSO_DATABASE_URL'),
	authToken: read('TURSO_AUTH_TOKEN')
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
	port: Number(read('PORT')) || 8000,
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
	maxSaveBytes: Number(read('MAX_SAVE_BYTES')) || 1024 * 1024,
	sessionDays: Number(read('SESSION_DAYS')) || 30
};

/** A one-line account of what is switched on, for the boot log. */
export function describe() {
	if (!syncEnabled) return 'sync off -- browser-only, no account, no database';
	const where = config.turso.url.startsWith('file:') ? 'local file' : 'Turso';
	return `sync on -- Discord sign-in, saves in ${where}`;
}
