// What a link looks like in a chat: the card a ship, a drawing, a route
// or a plan earns from what it carries (server/preview.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { linesFor, cardOfTheDay, previewPage, PREVIEW_CARDS } from '../server/preview.js';

test('each kind of link gets lines of its own from what it carries', () => {
	const ship = linesFor('ship', { ship: 'Epheria Caravel', fitted: { a: '+10 Epheria Caravel: Black Dragon Prow', b: 'Epheria: Upgraded Plating' }, roster: [] });
	assert.equal(ship.title, 'Epheria Caravel — Sailor’s Log');
	assert.equal(ship.text, 'Epheria Caravel: Black Dragon Prow, Epheria: Upgraded Plating');
	assert.equal(linesFor('ship', { ship: 'Bartali Sailboat' }).text, 'No parts fitted yet');

	const trace = linesFor('trace', { kind: 'trace', name: ' Reef run ', points: [1, 2, 3], strokes: [1], texts: [], areas: [] });
	assert.equal(trace.title, 'Reef run — a drawing on the sea chart');
	assert.match(trace.text, /^3 stops, 1 line on the Black Desert sea/);

	const route = linesFor('route', { r: [1, 2, 3, 4], x: [[1], [2]], h: 1 });
	assert.equal(route.title, 'A barter route of 4 stops — Sailor’s Log');
	assert.match(route.text, /^4 stops, 2 trades written out, back to where it started\./);

	assert.match(linesFor('plan', { stock: { a: 1, b: 2 }, targets: [{}] }).text, /^1 build queued, 2 things held\./);
	// Anything odd is the plain card for its kind, never a throw.
	assert.equal(linesFor('ship', null), linesFor('ship', 'x'));
	assert.equal(linesFor('route', { r: 'no' }).title, 'A barter route — Sailor’s Log');
});

test('a bare address shows a different part of the app from day to day', () => {
	const seen = new Set();
	for (let d = 0; d < 7; d++) seen.add(cardOfTheDay(d * 86400000));
	assert.ok(seen.size >= 3, [...seen].join());
	for (const card of seen) assert.ok(PREVIEW_CARDS.includes(card));
});

test('the page keeps everything but the tags, and a picture never shot falls back', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-preview-'));
	const file = path.join(dir, 'index.html');
	fs.writeFileSync(file, '<head>\n<!-- preview -->\n<meta property="og:title" content="old">\n<!-- /preview -->\n</head><body>x</body>');
	const page = previewPage({
		file,
		stamp: 'b1',
		lookup: async id => (id === 'AbCdEfGhIj' ? { kind: 'route', payload: '{"r":[1,2]}' } : null),
		have: name => name === 'route'
	});
	const route = await page({ s: 'AbCdEfGhIj' }, 'https://sea.test');
	assert.match(route, /og:image" content="https:\/\/sea\.test\/og\/route\.png\?b=b1"/);
	assert.match(route, /og:url" content="https:\/\/sea\.test\/\?s=AbCdEfGhIj"/);
	assert.doesNotMatch(route, /content="old"/);
	assert.match(route, /<body>x<\/body>$/);

	// No og/ship.png: the ship's words, and the one picture always there.
	const ship = await page({ l: 'ship' }, 'https://sea.test');
	assert.match(ship, /og:title" content="A shared ship/);
	assert.match(ship, /og:image" content="https:\/\/sea\.test\/og\.png\?b=b1"/);

	// A lookup that throws is the front page, not a failed page.
	const broken = previewPage({ file, stamp: 'b1', lookup: async () => { throw new Error('down'); } });
	assert.match(await broken({ s: 'AbCdEfGhIj' }, 'https://sea.test'), /og:title" content="Sailor’s Log — Black Desert sailing"/);
	fs.rmSync(dir, { recursive: true, force: true });
});
