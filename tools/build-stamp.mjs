// Name this build for what it holds, not for when it was made.
//
// The offline cache is named for the build (sw.js, VERSION), so the
// stamp decides when every browser throws its copy of the app away and
// fetches the shell again. A clock stamp turned that over on every
// image, a rebuild that changed nothing included; this one is the
// package version and a fingerprint of exactly the files the worker
// precaches -- its SHELL list, and the worker itself -- so it turns over
// when what a browser would hold changes, and only then.
//
// The fingerprint is of the files' bytes under their addresses, the
// addresses sorted: no mtime, no directory order, nothing the copy into
// an image can change. The worker is read with its VERSION line put
// back to the placeholder, so a sw.js already stamped fingerprints as
// the one on disk does.
//
//   node tools/build-stamp.mjs           print the stamp
//   node tools/build-stamp.mjs --write   write it into sw.js, and the
//                                        moment of the build beside it
//
// The Dockerfile runs the second. The server reads both back at boot
// (server.js): the stamp out of sw.js, the date out of build-info.json.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PLACEHOLDER = '__BUILD__';
const VERSION_LINE = /^const VERSION = '[^']*';/m;
// The sidecar the server reads the build's date from.
export const BUILD_INFO = 'build-info.json';

/** The worker as it is on disk before a build stamps it. */
export const unstamped = text => text.replace(VERSION_LINE, `const VERSION = '${PLACEHOLDER}';`);

/** The addresses in sw.js's SHELL list, in the order written there. */
export function shellPaths(text) {
	const list = text.match(/^const SHELL = \[([\s\S]*?)\n\];/m);
	if (!list) throw new Error('sw.js has no SHELL list');
	return [...list[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

/** The file in the checkout (or the image) an address is served from. */
const fileOf = address => (address === '/' ? 'index.html' : address.replace(/^\//, ''));

/**
 * The stamp for the tree at `root`, and the addresses it was taken over:
 * every SHELL entry and /sw.js, sorted. A SHELL file that is missing is
 * an error -- the worker's install would fail on it too.
 */
export function fingerprint(root = here) {
	const sw = unstamped(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'));
	const files = [...new Set([...shellPaths(sw), '/sw.js'])].sort();
	const hash = crypto.createHash('sha256');
	for (const address of files) {
		const bytes = address === '/sw.js' ? Buffer.from(sw) : fs.readFileSync(path.join(root, fileOf(address)));
		// The address and the length ahead of the bytes, so two files can
		// never run together into the same stream as two others.
		hash.update(`${address}\0${bytes.length}\0`);
		hash.update(bytes);
	}
	const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	return { stamp: `${version}-${hash.digest('hex').slice(0, 10)}`, files };
}

/** Write the stamp into sw.js and the moment of the build beside it. */
export function write(root = here, now = new Date()) {
	const { stamp } = fingerprint(root);
	const file = path.join(root, 'sw.js');
	const text = fs.readFileSync(file, 'utf8');
	if (!VERSION_LINE.test(text)) throw new Error('sw.js has no VERSION line to stamp');
	fs.writeFileSync(file, text.replace(VERSION_LINE, `const VERSION = '${stamp}';`));
	fs.writeFileSync(path.join(root, BUILD_INFO), `${JSON.stringify({ stamp, built: now.toISOString() })}\n`);
	return stamp;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	console.log(process.argv.includes('--write') ? write() : fingerprint().stamp);
}
