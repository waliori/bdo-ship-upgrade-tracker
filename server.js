// Serves the tracker. There is no API and no database: the app keeps
// everything in the browser, so this only has to hand over static files.

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 8000;
const app = express();

app.disable('x-powered-by');

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

app.listen(port, () => {
	console.log(`BDO Ship Upgrade Tracker running at http://localhost:${port}`);
	console.log('Press Ctrl+C to stop the server');
});

export default app;
