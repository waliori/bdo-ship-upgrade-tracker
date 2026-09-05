// Rewrite the service worker's shell list from the import graph.
//
// There is no build step, so the list of modules the worker precaches
// is kept in sw.js by hand -- and a module added without it fails a
// cold offline start. The static test refuses that; this makes fixing
// it one command: `node tools/build-shell.mjs`. Everything reachable
// from boot.js, plus the page's own files, in a stable order.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sw = path.join(root, 'sw.js');

const seen = new Set();
const walk = name => {
	if (seen.has(name)) return;
	seen.add(name);
	const src = fs.readFileSync(path.join(root, 'js', name), 'utf8');
	for (const m of src.matchAll(/import[^'"]*['"]\.\/([^'"]+)['"]/g)) walk(m[1]);
};
walk('boot.js');

const FIXED = [
	'/', '/index.html', '/manifest.webmanifest', '/icon_mapping.json',
	'/css/tracker.css', '/css/driver.css', '/js/all_barter.json', '/js/barter_combos.json', '/js/material_boards.json', '/js/driver.iife.js'
];
const modules = [...seen].sort().map(n => `/js/${n}`);
const list = [...FIXED, ...modules].map(p => `\t'${p}'`).join(',\n');

const text = fs.readFileSync(sw, 'utf8');
const next = text.replace(/const SHELL = \[[\s\S]*?\n\];/, `const SHELL = [\n${list}\n];`);
if (next === text) {
	console.log('shell list already current');
} else {
	fs.writeFileSync(sw, next);
	console.log(`shell list rewritten: ${FIXED.length + modules.length} entries`);
}
