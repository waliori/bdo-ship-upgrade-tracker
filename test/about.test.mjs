// The dates Help shows are real dates, newest change first -- and the
// changelog in the repository says what the app says.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DATA, CHANGES, LATEST, RELEASES, RELEASE } from '../js/about.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('every dataset carries a date or is live, and changes run newest first', () => {
	for (const d of DATA) assert.ok(d.asOf === 'live' || /^\d{4}-\d{2}-\d{2}$/.test(d.asOf), d.what);
	for (let i = 1; i < CHANGES.length; i++) assert.ok(CHANGES[i - 1].date >= CHANGES[i].date);
	for (const c of CHANGES) assert.ok(c.title && c.notes.length, c.date);
	assert.ok(LATEST.startsWith(CHANGES[0].date));
});

test('a release says what it is, and every headline has a picture that exists', () => {
	assert.ok(RELEASES.length, 'there is a release to show');
	assert.equal(RELEASE, RELEASES[0].id, 'the app is keyed on the newest release');
	for (const r of RELEASES) {
		assert.ok(r.id && r.name && r.blurb, r.id);
		assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date), r.date);
		assert.ok(r.sections.length, `${r.id} has sections`);
		for (const s of r.sections) {
			assert.ok(s.title, `${r.id}: a section without a title`);
			assert.ok(s.text || s.points, `${r.id}: "${s.title}" says nothing`);
			if (!s.media) continue;
			// The dialog serves these, so they must be in the repository --
			// and under docs/media/small, the only ones .dockerignore lets
			// into the image.
			assert.ok(s.media.startsWith('docs/media/small/'), `${s.title}: ${s.media} is not the narrow copy`);
			assert.ok(fs.existsSync(path.join(root, s.media)), `${s.title}: ${s.media} is missing`);
			assert.ok(s.alt, `${s.title}: a picture with no alt text`);
		}
	}
});

test('CHANGELOG.md is what about.js would generate', () => {
	// Generated rather than written, so the file and the dialog cannot
	// come to disagree. If this fails: node tools/build-changelog.mjs
	execFileSync('node', [path.join(root, 'tools/build-changelog.mjs'), '--check'], { stdio: 'pipe' });
});

test('the changelog points at pictures that are really there', () => {
	const text = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
	const shots = [...text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]);
	assert.ok(shots.length, 'the changelog shows something');
	for (const src of shots) assert.ok(fs.existsSync(path.join(root, src)), src);
});

test('the package version and the release the app announces agree', () => {
	// The dialog says "version 2.0"; npm should not think it is 1.0.0.
	const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
	assert.ok(pkg.version.startsWith(`${RELEASE}.`) || pkg.version === RELEASE,
		`package.json is ${pkg.version}, the app announces ${RELEASE}`);
});
