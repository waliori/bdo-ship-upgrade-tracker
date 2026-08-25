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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.disable('x-powered-by');
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
