// CHANGELOG.md, written from js/about.js.
//
// The release notes live in the app because the app shows them: the
// What's New dialog reads RELEASES directly. Keeping a second copy in
// Markdown by hand is how the two end up disagreeing, so the file is
// generated instead, and a test fails if it is out of date.
//
//   node tools/build-changelog.mjs          # write it
//   node tools/build-changelog.mjs --check  # fail if it would change
//
// The dialog shows the narrow copies under docs/media/small, since they
// travel inside the Docker image. A README is served by GitHub to a
// desktop browser, so here the full-size original is used instead.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASES } from '../js/about.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'CHANGELOG.md');

/** `<b>`, `<i>` and `<kbd>` are the only markup the notes use. */
const md = html => html
	.replace(/<\/?b>/g, '**')
	.replace(/<\/?i>/g, '*')
	.replace(/<kbd>(.*?)<\/kbd>/g, '`$1`');

/** The full-size original of a picture the app serves narrow. */
const wide = src => src.replace('/small/', '/');

const HEAD = `# Changelog

What arrived between one version of this app and the next, written for
someone who has been away. The same notes are in the app itself, under
**Menu → What's new** — this file is generated from them by
\`node tools/build-changelog.mjs\`, so the two cannot drift apart.
`;

// Every block stands alone, separated by a blank line: run an image
// straight into a paragraph and Markdown makes them one, and a list
// without a blank line above it is not a list at all.
const body = RELEASES.flatMap(r => {
	const blocks = [`## ${r.id} — ${r.name}`, `*${r.date}*`, md(r.blurb)];
	// Who asked for it goes first, as it does in the dialog.
	const t = r.thanks;
	if (t && t.who && t.who.length) {
		blocks.push('### Asked for by you', md(t.text));
		blocks.push(t.who.map(w => `- **${w.name}** — *“${md(w.said)}”* ${md(w.did)}`).join('\n'));
		if (t.foot) blocks.push(md(t.foot));
	}
	for (const s of r.sections) {
		blocks.push(`### ${md(s.title)}`);
		if (s.media) blocks.push(`![${s.alt || ''}](${wide(s.media)})`);
		if (s.text) blocks.push(md(s.text));
		if (s.points) blocks.push(s.points.map(p => `- ${md(p)}`).join('\n'));
	}
	return blocks;
});

const text = `${HEAD}\n${body.join('\n\n')}\n`;

if (process.argv.includes('--check')) {
	const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
	if (have === text) {
		console.log('CHANGELOG.md is up to date');
		process.exit(0);
	}
	console.error('CHANGELOG.md is stale — run: node tools/build-changelog.mjs');
	process.exit(1);
}

fs.writeFileSync(OUT, text);
console.log(`wrote CHANGELOG.md — ${RELEASES.length} release(s), ${RELEASES[0].sections.length} sections`);
