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
import path from 'path';
import { fileURLToPath } from 'url';
import { config, syncEnabled, ephemeralSecret, describe } from './server/config.js';

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

// Headers every response carries.
//
// The page is almost entirely self-contained; the exceptions are the
// fonts and the guided tour's library, and naming them here is the point.
// A compromised CDN then cannot run arbitrary script in a session that
// can read someone's saved inventory -- the worst it can do is fail to
// load. `style-src` has to allow inline: the progress bars set their
// width as a style attribute, which counts.
const CSP = [
	"default-src 'self'",
	"script-src 'self' https://cdn.jsdelivr.net",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
	"font-src 'self' https://fonts.gstatic.com",
	"img-src 'self' data:",
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

// So the page knows whether to offer sign-in at all. A deployment with no
// Discord app should not show a button that cannot work.
app.get('/api/config', (req, res) => {
	res.set('Cache-Control', 'no-store');
	res.json({ sync: syncEnabled });
});

// Only what the page actually asks for. Serving the repository root would
// hand out package.json, the Dockerfile and the capture harness too.
const PUBLIC = ['css', 'js', 'icons'];
const FILES = ['index.html', 'icon.png', 'og.png', 'icon_mapping.json'];

// Icons and modules are content-addressed by name and change rarely; the
// page itself must not be cached or a deploy would not reach anyone.
const IMMUTABLE = { maxAge: '30d', immutable: true };

app.use('/icons', express.static(path.join(__dirname, 'icons'), IMMUTABLE));
// The walkthrough film the Help dialog plays. It lives beside the rest of
// the documentation media so the README and the app show the same thing,
// and only the video is copied into the image -- the README's GIFs are
// several megabytes and nothing serves them.
app.use('/docs/media', express.static(path.join(__dirname, 'docs', 'media'), IMMUTABLE));
for (const dir of PUBLIC.filter(d => d !== 'icons')) {
	app.use(`/${dir}`, express.static(path.join(__dirname, dir), { maxAge: '1h' }));
}
for (const file of FILES) {
	app.get(`/${file}`, (req, res) => res.sendFile(path.join(__dirname, file)));
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
