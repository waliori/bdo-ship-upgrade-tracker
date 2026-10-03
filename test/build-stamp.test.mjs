// The build's name: the package version and a fingerprint of exactly
// the files the service worker precaches (tools/build-stamp.mjs). The
// offline cache is named for it, so a fingerprint taken over the wrong
// files either turns every browser's cache over for nothing or, worse,
// keeps a cache whose files have changed underneath it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { fingerprint, write, unstamped, BUILD_INFO } from '../tools/build-stamp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swText = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

// SHELL as the worker itself has it: sw.js run in a sandbox that stands
// in for a worker's global, the list read off the result -- not the
// tool's own reading of the text, which is what is being checked.
function workerShell() {
	const self = { addEventListener() {}, registration: {}, location: { origin: 'http://x' } };
	const box = vm.createContext({ self, caches: {}, fetch() {}, URL, Response: class {}, Request: class {}, setTimeout, clearTimeout, console });
	vm.runInContext(`${swText}\n;globalThis.__shell = SHELL;`, box);
	return [...box.__shell];
}

// A copy of what the image copies, to stamp without touching the tree.
function copyTree() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-stamp-'));
	const { files } = fingerprint(root);
	for (const address of [...files, '/package.json']) {
		const rel = address === '/' ? 'index.html' : address.slice(1);
		fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
		fs.copyFileSync(path.join(root, rel), path.join(dir, rel));
	}
	return dir;
}

test('the fingerprint is taken over exactly what the worker precaches, and the worker', () => {
	const shell = workerShell();
	assert.ok(shell.length > 50, 'the worker\'s list was read');
	const { files } = fingerprint(root);
	assert.deepEqual(files, [...new Set([...shell, '/sw.js'])].sort());
});

test('the stamp is the package version and ten hex digits', () => {
	const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	const { stamp } = fingerprint(root);
	assert.match(stamp, new RegExp(`^${version.replace(/\./g, '\\.')}-[0-9a-f]{10}$`));
	// It reaches the worker as the server cleans it, so nothing is lost.
	assert.equal(stamp.replace(/[^A-Za-z0-9._-]/g, ''), stamp);
});

test('the same files give the same stamp, whatever their times; a changed file does not', () => {
	const dir = copyTree();
	try {
		const first = fingerprint(dir).stamp;
		assert.equal(first, fingerprint(root).stamp, 'a copy of the files is the same build');

		// Every file touched to another time: nothing changes.
		const then = new Date('2001-02-03T04:05:06Z');
		for (const f of fs.readdirSync(dir, { recursive: true })) fs.utimesSync(path.join(dir, f), then, then);
		assert.equal(fingerprint(dir).stamp, first);

		// Taken in address order, never in the order a disk lists them.
		const { files } = fingerprint(dir);
		assert.deepEqual(files, [...files].sort());

		// One byte in one module: a new build.
		const mod = path.join(dir, 'js', 'boot.js');
		fs.appendFileSync(mod, '\n');
		assert.notEqual(fingerprint(dir).stamp, first);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('the build writes the stamp into the worker and the date beside it, and stamps the same twice', () => {
	const dir = copyTree();
	try {
		const before = fingerprint(dir).stamp;
		const stamp = write(dir, new Date('2026-10-02T12:00:00Z'));
		assert.equal(stamp, before);
		const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
		assert.match(sw, new RegExp(`^const VERSION = '${stamp.replace(/\./g, '\\.')}';`, 'm'));
		assert.equal(unstamped(sw), swText, 'only the VERSION line changed');
		assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, BUILD_INFO), 'utf8')), { stamp, built: '2026-10-02T12:00:00.000Z' });
		// A worker already stamped fingerprints as the one on disk does.
		assert.equal(fingerprint(dir).stamp, stamp);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('the image runs the stamp, and ships the tool to run it', () => {
	const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
	assert.match(dockerfile, /^COPY tools\/build-stamp\.mjs /m);
	assert.match(dockerfile, /^RUN node tools\/build-stamp\.mjs --write$/m);
	assert.doesNotMatch(dockerfile, /date -u/, 'no clock in the stamp');
	assert.match(dockerfile, /^FROM node:22-alpine@sha256:[0-9a-f]{64}$/m, 'the base is pinned by digest');
	assert.match(fs.readFileSync(path.join(root, '.dockerignore'), 'utf8'), /^!tools\/build-stamp\.mjs$/m);
});
