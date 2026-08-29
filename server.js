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
import path from 'path';
import { fileURLToPath } from 'url';
import { config, syncEnabled, ephemeralSecret, describe } from './server/config.js';
import { marketRoutes } from './server/market.js';

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

app.disable('x-powered-by');

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
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' https://fonts.gstatic.com",
	// The signed-in chip shows the player's Discord avatar, which is the
	// one image the page does not host itself.
	"img-src 'self' data: https://cdn.discordapp.com",
	"connect-src 'self'",
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

if (syncEnabled) {
	const [{ migrate }, { flushOnShutdown }, { authRoutes }, { apiRoutes }] = await Promise.all([
		import('./server/db.js'),
		import('./server/saves.js'),
		import('./server/auth.js'),
		import('./server/api.js')
	]);
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
}

// Central Market prices, relayed from the community market API and
// remembered for a while. Needs no configuration: it is the one network
// feature that is on by default, because the plan is priced wrong
// without it and it never carries anyone's data.
app.use('/api', marketRoutes(express));

// So the page knows whether to offer sign-in at all. A deployment with no
// Discord app should not show a button that cannot work.
app.get('/api/config', (req, res) => {
	res.set('Cache-Control', 'no-store');
	res.json({ sync: syncEnabled });
});

// Only what the page actually asks for. Serving the repository root would
// hand out package.json, the Dockerfile and the capture harness too.
const PUBLIC = ['css', 'js', 'icons', 'map', 'guide'];
const FILES = [
	'index.html', 'icon.png', 'og.png', 'icon_mapping.json',
	'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'sw.js'
];

// The page and everything that steers loading must revalidate: a stale
// service worker or manifest would defeat the very caching rules it
// carries, and /index.html is the same page '/' already refuses to let
// go stale. Images may rest for a week.
const MUST_REVALIDATE = /\.(html|json|webmanifest)$|^sw\.js$/;

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
// Map tiles are named by zoom and grid position, so a given name is a
// given square of sea forever. They cache like the icons do.
app.use('/map', express.static(path.join(__dirname, 'map'), LONG));
// The walkthrough film the Help dialog plays. It lives beside the rest of
// the documentation media so the README and the app show the same thing,
// and only the video is copied into the image -- the README's GIFs are
// several megabytes and nothing serves them. It is re-shot under the same
// name whenever the UI moves, so it revalidates like the modules do.
app.use('/docs/media', express.static(path.join(__dirname, 'docs', 'media'), REVALIDATE));
for (const dir of PUBLIC.filter(d => d !== 'icons' && d !== 'map')) {
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
		console.log(`BDO Ship Upgrade Tracker running at http://localhost:${config.port}`);
		console.log(describe());
		if (ephemeralSecret) {
			console.warn('[config] No SESSION_SECRET set -- sign-ins will not survive a restart.');
		}
		console.log('Press Ctrl+C to stop the server');
	});
}

export default app;
