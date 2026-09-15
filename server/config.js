// What the server has been given, and therefore what it can offer.
//
// The tracker needs none of this. With nothing configured it is the same
// browser-only tool it has always been: your data lives in localStorage,
// there is no account, and nothing leaves the machine. Sync is strictly
// additive -- it switches on only when every piece it needs is present,
// so a half-configured deploy falls back to "off" rather than failing at
// the first sign-in.

import crypto from 'node:crypto';
import fs from 'node:fs';

const read = name => (process.env[name] || '').trim();

const discord = {
	clientId: read('DISCORD_CLIENT_ID'),
	clientSecret: read('DISCORD_CLIENT_SECRET')
};

// Not `Number(x) || fallback`: an explicit 0 -- FLUSH_DELAY_MS=0, say --
// is a setting, and `||` would silently hand back the default instead.
const num = (name, fallback) => {
	const given = read(name);
	if (given === '') return fallback;
	const value = Number(given);
	return Number.isFinite(value) ? value : fallback;
};

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

// The origin a browser must be on to change anything: scheme, host and
// port of PUBLIC_URL, and null when none was given -- then the request's
// own Host is the best that is known, and server.js compares against
// that instead.
let publicOrigin = null;
try {
	if (read('PUBLIC_URL')) publicOrigin = new URL(publicUrl).origin;
} catch {
	// Not a URL at all; sign-in will fail on the redirect anyway, and the
	// origin check falls back to the request's Host.
}

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

// Push reminders need a key pair to sign them and a table to keep the
// subscriptions in; a database alone is enough -- no Discord needed.
const vapid = {
	publicKey: read('VAPID_PUBLIC_KEY'),
	privateKey: read('VAPID_PRIVATE_KEY'),
	subject: read('VAPID_SUBJECT') || (publicUrl.startsWith('https://') ? publicUrl : 'mailto:admin@localhost')
};
export const pushEnabled = Boolean(vapid.publicKey && vapid.privateKey && turso.url);

// Feedback needs only somewhere to keep it. A Discord webhook, when one
// is given, gets a copy of each entry the moment it lands, so the
// operator hears of a bug without opening the inbox.
export const feedbackEnabled = Boolean(turso.url);

// Where a screenshot sent with a report is kept.
//
// On disk, not in the database. A table is the right place for a
// sentence and the wrong place for a megabyte of PNG: every read of it
// would be an HTTPS round trip to Turso carrying the whole image, and
// the backup file would stop being something anyone could open. The
// path defaults inside .data, which is the one directory the container
// already holds a volume over -- so images survive a rebuild exactly as
// a local database file does.
const uploadDir = read('UPLOAD_DIR') || './.data/uploads';

// Made here rather than at the first upload, so that a deployment which
// cannot write there says so in the boot log and offers no attach button
// at all -- a button that fails at the end of composing a report is
// worse than no button. FEEDBACK_IMAGES=0 turns it off by hand.
export const uploadsEnabled = feedbackEnabled && read('FEEDBACK_IMAGES') !== '0' && (() => {
	try {
		fs.mkdirSync(uploadDir, { recursive: true });
		fs.accessSync(uploadDir, fs.constants.W_OK);
		return true;
	} catch (err) {
		console.warn(`[feedback] no images: ${uploadDir} is not writable (${err.code || err.message}).`);
		return false;
	}
})();

// The community boards need accounts to stand on them, so they come
// with sync and not without.
export const communityEnabled = syncEnabled;

// The count of who is out needs nothing configured: with a database it
// remembers the roll, without one it counts this process's callers. It
// is the only feature here that is on by default and switched off by
// hand, because the thing it costs -- a row with a random token in it --
// is smaller than the thing it gives.
export const presenceEnabled = read('PRESENCE') !== '0';

// Who may read the feedback inbox: Discord account ids, comma-separated.
const adminIds = new Set(read('ADMIN_IDS').split(',').map(s => s.trim()).filter(Boolean));

export const config = {
	port: num('PORT', 8000),
	vapid,
	// How long before a spawn the reminder goes out.
	pushBeforeMs: num('PUSH_BEFORE_MINUTES', 15) * 60 * 1000,
	publicUrl,
	publicOrigin,
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
	feedbackWebhook: read('FEEDBACK_WEBHOOK_URL'),
	adminIds,
	uploadDir,

	// What a report may carry, and how often one may be sent.
	//
	// The ceilings are not about storage -- a hundred screenshots is a
	// few tens of megabytes -- but about what one account can do to the
	// inbox. Somebody with a real bug writes once, adds two pictures of
	// it, and waits; the numbers are set where that person never meets
	// them and a script meets all three at once.
	//
	// The browser shrinks an image to `imagePixels` on its long edge and
	// re-encodes it before sending, so this ceiling is met only by a file
	// that will not shrink -- an animation, or a photograph of a screen.
	maxImageBytes: num('MAX_IMAGE_BYTES', 4 * 1024 * 1024),
	imagePixels: num('IMAGE_PIXELS', 1600),
	maxFilesPerEntry: num('MAX_FILES_PER_ENTRY', 4),
	// Reports still waiting on an answer. A fifth is refused: the four
	// already in the inbox are the thing to say more about.
	maxOpenReports: num('MAX_OPEN_REPORTS', 4),
	// And in a day, counting the ones already dealt with.
	maxReportsPerDay: num('MAX_REPORTS_PER_DAY', 10),
	// Long enough that a double-press cannot send twice, short enough
	// that remembering one more thing is not a punishment.
	reportGapMs: num('REPORT_GAP_SECONDS', 60) * 1000,
	// An image nobody ever attached to a report is swept after this.
	uploadTtlMs: num('UPLOAD_TTL_HOURS', 24) * 3600_000,
	// How long a quiet set of community boards is held between rebuilds:
	// nobody on them has saved, so nothing on them can have changed.
	communityTtlMs: num('COMMUNITY_TTL_MS', 5 * 60_000),
	// And how long they are held once somebody on them has saved, which
	// is the case that has to feel live. A board known to be wrong is
	// not worth holding for long -- only long enough that a burst of
	// pushes does not rebuild it on every request.
	communityRebuildMs: num('COMMUNITY_REBUILD_MS', 3_000),
	// Pushes allowed per account per minute.
	//
	// Measured, not guessed. Rapid editing coalesces -- 491 clicks in a
	// minute produce one push -- but a steady rhythm at exactly the
	// client's 500ms debounce produces one push per edit, and that is 120
	// a minute. A limit of 120 therefore sat exactly on the app's own
	// ceiling, where a retry or a second tab would push a blameless
	// player over it. This leaves five times that headroom and still
	// stops anything pathological: a save is a few kilobytes, and the
	// server coalesces them before they reach the database anyway.
	maxPushesPerMinute: num('MAX_PUSHES_PER_MINUTE', 600),

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
	const extras = [
		config.feedbackWebhook ? 'feedback to a webhook' : 'feedback kept',
		uploadsEnabled ? 'with screenshots' : 'without screenshots',
		`${adminIds.size} admin${adminIds.size === 1 ? '' : 's'}`
	];
	return `sync on -- Discord sign-in, saves in ${where}, community boards, ${extras.join(', ')}`;
}
