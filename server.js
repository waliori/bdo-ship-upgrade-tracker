// Serves the tracker.
//
// The app is a browser-only tool by default: it keeps everything in
// localStorage, so with nothing configured this only has to hand over
// static files, exactly as it always did.
//
// Give it a Discord app and a database and it also grows a small sync
// API -- sign in, pull your save, push it back. That is the whole of the
// server's involvement; it never plans anything.

import express from 'express';
import compression from 'compression';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { config, syncEnabled, pushEnabled, feedbackEnabled, uploadsEnabled, communityEnabled, presenceEnabled, ephemeralSecret, describe } from './server/config.js';
import { presenceRoutes } from './server/presence.js';
import { marketRoutes } from './server/market.js';
import { accessLog, counters } from './server/log.js';

// NOTE: run exactly one of these.
//
// With sync on, server/saves.js holds the current revision of every save
// in memory and answers pushes from there. That is what makes a save
// feel instant, and it is only correct while one process owns the data.
// Two instances behind a load balancer would each believe they held the
// current revision, both would accept a push built on it, and one
// browser's work would be lost silently -- the conflict dialog would
// never appear, which is the one thing the revision scheme exists to
// prevent. Scaling out means moving that check back into SQL first.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const started = Date.now();

app.disable('x-powered-by');

// First, so that every response is counted -- including the ones the
// error handler at the bottom writes.
app.use(accessLog());

// The barter dataset is the reason this is not optional: 1.4 MB of JSON
// that gzips to a tenth of that. A reverse proxy that compresses would
// make this a no-op, but nothing forces a deployment to have one, and
// serving megabytes uncompressed to a phone at sea is not a default.
app.use(compression());

// Headers every response carries.
//
// The page is almost entirely self-contained; the exceptions are the
// fonts and the Discord avatar, and naming them here is the point.
// No script comes from anywhere but this server -- the guided tour's
// library is vendored -- so a compromised CDN cannot run code in a
// session that can read someone's saved inventory. `style-src` has to
// allow inline: the progress bars set their width as a style attribute,
// which counts.
const CSP = [
	"default-src 'self'",
	// The sailor reader is WebAssembly, and a policy that names no
	// wasm at all forbids compiling it. This is the narrow word for it:
	// it permits WebAssembly and nothing else -- `eval` and its friends
	// stay shut, which is what 'unsafe-eval' would have opened.
	"script-src 'self' 'wasm-unsafe-eval'",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' https://fonts.gstatic.com",
	// The signed-in chip shows the player's Discord avatar, and a
	// feedback post that points at a film shows that film's still --
	// the two images the page does not host itself. A screenshot sent
	// with a report is served from here like everything else.
	"img-src 'self' data: https://cdn.discordapp.com https://i.ytimg.com",
	"connect-src 'self'",
	// A film linked in a feedback post plays where it was linked, and
	// only once it is asked to: nothing is loaded from either of these
	// until the play button is pressed. YouTube under its no-cookie
	// host, which is the same player without the tracking.
	"frame-src https://www.youtube-nocookie.com https://streamable.com",
	"frame-ancestors 'none'",
	"base-uri 'none'",
	"form-action 'self'",
	"object-src 'none'"
].join('; ');

app.use((req, res, next) => {
	res.set('Content-Security-Policy', CSP);
	res.set('X-Content-Type-Options', 'nosniff');
	res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	// Belt and braces with frame-ancestors, for anything that predates it.
	res.set('X-Frame-Options', 'DENY');
	// Only claimed when the deployment says it is HTTPS and this request
	// actually arrived that way -- promising HTTPS-for-a-year on a local
	// HTTP setup would lock the browser out of it.
	if (config.cookieSecure && (req.secure || req.headers['x-forwarded-proto'] === 'https')) {
		res.set('Strict-Transport-Security', 'max-age=31536000');
	}
	next();
});
// Behind a reverse proxy the client's scheme arrives in a header. Without
// this, Express reports every request as plain HTTP.
if (config.cookieSecure) app.set('trust proxy', 1);

// Anything that changes something must come from this site.
//
// The session cookie is SameSite=Lax, which already keeps a cross-site
// form post from carrying it -- this is the second lock on the same
// door, for the browsers and proxies that get the first one wrong. A
// browser names where a request came from in `Origin`; when it says
// somewhere else, the request is refused whatever cookie it carries.
// With no Origin at all -- curl, an old browser, a same-origin GET that
// became a POST -- `Sec-Fetch-Site` is asked, and with neither header
// the request passes: there is nothing to check it against, and the
// cookie rule still stands. The OAuth callback is a GET and never sees
// this.
const CHANGES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function fromThisSite(req) {
	const origin = req.headers.origin;
	if (origin === undefined) {
		const site = req.headers['sec-fetch-site'];
		return !site || site === 'same-origin' || site === 'none';
	}
	if (config.publicOrigin) return origin === config.publicOrigin;
	// No PUBLIC_URL: the request's own Host is the site. Host alone, not
	// scheme -- behind a proxy that terminates TLS this server sees http
	// while the browser says https, and a browser-only or push-only
	// deployment has no reason to have set PUBLIC_URL.
	try {
		return new URL(origin).host.toLowerCase() === String(req.headers.host || '').toLowerCase();
	} catch {
		return false;   // `null`, or not a URL at all
	}
}

app.use((req, res, next) => {
	if (!CHANGES.has(req.method)) return next();
	if (!req.path.startsWith('/api/') && req.path !== '/auth/logout') return next();
	if (fromThisSite(req)) return next();
	res.status(403).json({ error: 'That request did not come from this site.' });
});

// What this build is called, so the service worker's cache can be named
// for it. The offline cache must turn over with every deploy or a
// browser that starts offline could run half of one deploy and half of
// another -- so a plain `npm start` needs a stamp as much as the Docker
// image does. In order: APP_VERSION when the operator set one, the
// commit when there is a checkout to ask, whatever the Docker build
// wrote into sw.js, and failing all of that the package version with
// the moment this process started, which at least turns over on
// restart.
function buildStamp() {
	if (process.env.APP_VERSION) return process.env.APP_VERSION;
	try {
		return execFileSync('git', ['rev-parse', '--short', 'HEAD'],
			{ cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim();
	} catch {
		// No checkout, or no git: the image, most likely.
	}
	try {
		const baked = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8').match(/^const VERSION = '([^']*)';/m);
		if (baked && baked[1] && baked[1] !== '__BUILD__') return baked[1];
	} catch {
		// No sw.js to read; the fallback below still names the build.
	}
	const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
	return `${pkg.version}-${started.toString(36)}`;
}
// It lands inside a quoted string in the worker, so only characters that
// cannot end the quote are kept.
export const VERSION = buildStamp().replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) || 'dev';

// Filled in below when a database is configured; /healthz reads them.
let dbPing = null;
let saveStats = null;

if (syncEnabled) {
	const [{ migrate, ping }, { flushOnShutdown, stats }, { authRoutes }, { apiRoutes }] = await Promise.all([
		import('./server/db.js'),
		import('./server/saves.js'),
		import('./server/auth.js'),
		import('./server/api.js')
	]);
	dbPing = ping;
	saveStats = stats;
	// Not awaited. The tracker works without a database -- the page is a
	// browser-only tool until you sign in -- so a database that is briefly
	// unreachable at boot should cost sync, not the site. Everything that
	// touches a table awaits this anyway, and it is retried on demand.
	migrate().catch(err => console.warn('[db] tables not ready yet:', err.message));
	// Saves are answered from memory and written out behind the request.
	// This is what makes sure the last few hundred milliseconds of work
	// still reach the database when the container is asked to stop.
	if (process.env.NODE_ENV !== 'test') flushOnShutdown();
	app.use('/auth', authRoutes());
	app.use('/api', apiRoutes());
	// The sightings of today's barter board age out with the board they
	// describe. Nothing depends on the sweep -- the read only ever asks
	// for the last few days -- so it is tidiness on a slow timer.
	if (process.env.NODE_ENV !== 'test') {
		const { startBoardSweep } = await import('./server/boards.js');
		startBoardSweep();
	}
}

// Vell reminders by push: a key pair and a table are all it takes, so
// it can run on a deployment without Discord. Off without the keys.
if (pushEnabled) {
	const [{ migrate, ping }, { pushRoutes, startVellPushes, startAlertPushes }] = await Promise.all([
		import('./server/db.js'),
		import('./server/push.js')
	]);
	if (!syncEnabled) migrate().catch(err => console.warn('[db] tables not ready yet:', err.message));
	dbPing = ping;
	app.use('/api', pushRoutes());
	if (process.env.NODE_ENV !== 'test') {
		startVellPushes();
		// An account's own chimes: a clock set on one device reaching the
		// rest. Needs sign-in, so it only runs where sync does.
		if (syncEnabled) startAlertPushes();
	}
}

// Feedback needs a table and nothing else, so like the push reminders it
// runs wherever there is a database. The community boards ride with sync
// and are mounted with it above.
if (feedbackEnabled) {
	const [{ migrate }, { feedbackRoutes, startUploadSweep }] = await Promise.all([
		import('./server/db.js'),
		import('./server/feedback.js')
	]);
	if (!syncEnabled && !pushEnabled) migrate().catch(err => console.warn('[db] tables not ready yet:', err.message));
	app.use('/api', feedbackRoutes());
	// Screenshots uploaded for a report that was never sent are given a
	// day and then swept; see server/feedback.js.
	if (uploadsEnabled && process.env.NODE_ENV !== 'test') startUploadSweep();
}

// Central Market prices, relayed from the community market API and
// remembered for a while. Needs no configuration: it is the one network
// feature that is on by default, because the plan is priced wrong
// without it and it never carries anyone's data.
app.use('/api', marketRoutes(express));

// Who else is out there. The one thing here that asks nothing of the
// reader and tells them something: how many browsers have the page open
// right now, and how many have ever opened it. It needs no sign-in and
// keeps no address -- see server/presence.js -- and it runs on a
// database when there is one and in this process's memory when there is
// not. PRESENCE=0 turns it off entirely.
if (presenceEnabled) {
	let presenceDb = null;
	if (config.turso.url) {
		const m = await import('./server/db.js');
		if (!syncEnabled && !pushEnabled && !feedbackEnabled) m.migrate().catch(err => console.warn('[db] tables not ready yet:', err.message));
		presenceDb = { touchPresence: m.touchPresence, countPresence: m.countPresence };
	}
	app.use('/api', presenceRoutes({ db: presenceDb }));
}

// So the page knows whether to offer sign-in at all. A deployment with no
// Discord app should not show a button that cannot work.
app.get('/api/config', (req, res) => {
	res.set('Cache-Control', 'no-store');
	res.json({ sync: syncEnabled, push: pushEnabled, feedback: feedbackEnabled, uploads: uploadsEnabled, community: communityEnabled, presence: presenceEnabled });
});

// Is it up, and is the database behind it answering? `db` is 'off' on a
// browser-only deployment, which is healthy; 'down' is a 503, so a
// supervisor can tell a site that is up from one whose sync is not.
// One statement, one attempt, and a short leash on it: the container
// healthcheck gives this three seconds.
app.get('/healthz', async (req, res) => {
	res.set('Cache-Control', 'no-store');
	let db = 'off';
	if (dbPing) {
		const leash = new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 2500).unref());
		db = await Promise.race([dbPing(), leash]).then(() => 'ok', () => 'down');
	}
	const held = saveStats ? saveStats() : { dirty: 0, queued: 0 };
	res.status(db === 'down' ? 503 : 200).json({
		ok: db !== 'down',
		db,
		dirty: held.dirty,
		queued: held.queued,
		uptime: Math.round((Date.now() - started) / 1000),
		version: VERSION,
		counters
	});
});

// Only what the page actually asks for. Serving the repository root would
// hand out package.json, the Dockerfile and the capture harness too.
const PUBLIC = ['css', 'js', 'icons', 'map', 'map3d', 'guide', 'reader'];
const FILES = [
	'index.html', 'icon.png', 'og.png', 'icon_mapping.json',
	'icon-192.png', 'icon-512.png', 'manifest.webmanifest'
];

// The page and everything that steers loading must revalidate: a stale
// service worker or manifest would defeat the very caching rules it
// carries, and /index.html is the same page '/' already refuses to let
// go stale. Images may rest for a week.
const MUST_REVALIDATE = /\.(html|json|webmanifest)$/;

// There is no build step, so a module's filename never changes while its
// contents do -- which makes cache freshness a correctness problem, not a
// performance one. Serve js/ and css/ a stale copy of one file and a
// fresh copy of another and the page dies on an import that no longer
// exists. `no-cache` is not "do not store": it stores and revalidates,
// so the usual answer is a 304 costing a header round-trip.
const REVALIDATE = { maxAge: 0, etag: true, setHeaders: res => res.set('Cache-Control', 'no-cache') };

// Icons are addressed by the game's own item id, so a given name really
// does keep its contents. Long, but not `immutable` -- a wrong icon
// should be fixable inside a month rather than never.
const LONG = { maxAge: '7d' };

app.use('/icons', express.static(path.join(__dirname, 'icons'), LONG));
// Map tiles are named by zoom and grid position, and asked for with
// the set's date on the query string (TILES_STAMP in js/barter_npcs.js),
// so a given URL is a given square of sea forever: a year, immutable,
// and no revalidation -- the browser, the service worker, the proxy
// and the CDN in front all keep a tile on that word, and the origin
// sees each one about once.
const FOREVER = { maxAge: '365d', immutable: true };
app.use('/map', express.static(path.join(__dirname, 'map'), FOREVER));
// The terrain the chart stands up on, cut on the same grid and asked
// for with the bake's own stamp, so a tile keeps like a tile. Its index
// is the one file that must be re-read -- it is what carries the stamp.
app.get('/map3d/index.json', (req, res) => {
	res.set('Cache-Control', 'no-cache');
	res.sendFile(path.join(__dirname, 'map3d', 'index.json'));
});
app.use('/map3d', express.static(path.join(__dirname, 'map3d'), FOREVER));
// The vendored OCR engine: six megabytes that never change under a
// name, because the name carries the version (reader/README.md). Kept
// like the tiles rather than like the code -- it has no business being
// fetched again on a deploy that did not touch it.
app.use('/reader', express.static(path.join(__dirname, 'reader'), FOREVER));
// The walkthrough film the Help dialog plays. It lives beside the rest of
// the documentation media so the README and the app show the same thing,
// and only the video is copied into the image -- the README's GIFs are
// several megabytes and nothing serves them. It is re-shot under the same
// name whenever the UI moves, so it revalidates like the modules do.
app.use('/docs/media', express.static(path.join(__dirname, 'docs', 'media'), REVALIDATE));
for (const dir of PUBLIC.filter(d => d !== 'icons' && d !== 'map' && d !== 'map3d' && d !== 'reader')) {
	app.use(`/${dir}`, express.static(path.join(__dirname, dir), REVALIDATE));
}
for (const file of FILES) {
	app.get(`/${file}`, (req, res) => {
		res.set('Cache-Control', MUST_REVALIDATE.test(file) ? 'no-cache' : 'public, max-age=604800');
		// Express does not know this one by extension.
		if (file.endsWith('.webmanifest')) res.type('application/manifest+json');
		res.sendFile(path.join(__dirname, file));
	});
}

// The service worker, with this build's stamp written into it. Read on
// each request rather than once: it revalidates like the modules do (the
// browser checks it on every navigation, and `res.send` answers a
// matching ETag with a 304), and an edit in development should show up
// without a restart. It is served under `no-cache` for the same reason
// the modules are -- a stale worker would defeat the rules it carries.
app.get('/sw.js', (req, res, next) => {
	fs.readFile(path.join(__dirname, 'sw.js'), 'utf8', (err, source) => {
		if (err) return next(err);
		res.set('Cache-Control', 'no-cache');
		res.type('application/javascript');
		res.send(source.replace(/^const VERSION = '[^']*';/m, `const VERSION = '${VERSION}';`));
	});
});

// Browsers ask for /favicon.ico by name whatever the page says; the
// anchor answers, rather than a 404 in every log.
app.get('/favicon.ico', (req, res) => {
	res.set('Cache-Control', 'public, max-age=604800');
	res.sendFile(path.join(__dirname, 'icon.png'));
});

app.get('/', (req, res) => {
	res.set('Cache-Control', 'no-cache');
	res.sendFile(path.join(__dirname, 'index.html'));
});

// A thrown error inside a route would otherwise take the process with it
// on Express 4, since it does not await async handlers.
//
// The body parser reports "too large" and "not valid JSON" by throwing
// with a status already on it, and those are the client's problem, not a
// server fault -- so a status that is already a 4xx is passed through
// rather than being flattened into a 500.
app.use((err, req, res, next) => {
	if (res.headersSent) return next(err);
	const status = Number(err.status || err.statusCode) || 500;
	if (status >= 500) console.error('[server]', err);
	res.status(status).json({
		error: status === 413 ? 'That save is too large to sync.'
			: status === 400 ? 'That request was not something the server could read.'
			: 'Something went wrong.'
	});
});

// Importing this file for a test should not open a port.
if (process.env.NODE_ENV !== 'test') {
	app.listen(config.port, () => {
		console.log(`Sailor’s Log running at http://localhost:${config.port}`);
		console.log(`${describe()} -- build ${VERSION}`);
		if (ephemeralSecret) {
			console.warn('[config] No SESSION_SECRET set -- sign-ins will not survive a restart.');
		}
		console.log('Press Ctrl+C to stop the server');
	});
}

export default app;
