// What the fleet saw today, against the real server.
//
// Like community.test.mjs: the actual routes and the actual database,
// with a session minted by the server's own signing code. Two halves --
// what a sighting has to look like to be stored at all, and what the
// routes do with one once it is.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-boards-'));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.FLUSH_DELAY_MS = '0';
process.env.ADMIN_IDS = '3001';

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser } = await import('../server/db.js');
const { readSighting } = await import('../server/boards.js');
const { npcs } = await import('../js/barter_npcs.js');

function cookieFor(id) {
	const headers = [];
	startSession({ append: (name, value) => headers.push(value) }, id);
	return headers.map(h => h.split(';')[0]).join('; ');
}

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
	server.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

const call = (method, url, { cookie, body } = {}) => fetch(base + url, {
	method,
	headers: {
		...(cookie ? { Cookie: cookie } : {}),
		...(body ? { 'Content-Type': 'application/json' } : {})
	},
	body: body ? JSON.stringify(body) : undefined
});

await upsertUser({ id: '3001', username: 'Admiral', avatar: 'abc' });
await upsertUser({ id: '3002', username: 'Deckhand', avatar: null });
const admiral = cookieFor('3001');
const deckhand = cookieFor('3002');

const DAY = '2026-09-17';
const isle = i => npcs[i].id;
const sighting = (rows, day = DAY) => ({ day, layout: '16', offers: rows });

/* ------------------------------------------------------------------ *
 * what may be stored
 * ------------------------------------------------------------------ */

test('a sighting is islands and goods, or it is not a sighting', () => {
	assert.ok(readSighting(null).error);
	assert.ok(readSighting({ offers: [] }).error);
	assert.ok(readSighting({ day: 'whenever', offers: [[isle(0), 'a', '1', 'b']] }).error);
	assert.ok(readSighting({ day: DAY, offers: [[999999, 'a', '1', 'b']] }).error, 'an island nobody has heard of');
	assert.ok(readSighting({ day: DAY, offers: [[isle(0), '', '1', 'b']] }).error, 'an island that takes nothing');
	const good = readSighting({ day: DAY, offers: [[isle(0), 'Wool', '10', '[Level 1] Roa Flower Seed Pouch']] });
	assert.equal(good.error, undefined);
	assert.deepEqual(good.offers, [[isle(0), 'Wool', '10', '[Level 1] Roa Flower Seed Pouch']]);
});

test('an island said twice is said once', () => {
	const read = readSighting({
		day: DAY,
		offers: [[isle(0), 'Wool', '10', 'A'], [isle(0), 'Fleece', '200', 'B']]
	});
	assert.equal(read.offers.length, 1);
	assert.equal(read.offers[0][1], 'Wool');
});

/* ------------------------------------------------------------------ *
 * the routes
 * ------------------------------------------------------------------ */

test('a sighting needs an account', async () => {
	const res = await call('POST', '/api/boards', { body: sighting([[isle(0), 'Wool', '10', 'A']]) });
	assert.equal(res.status, 401);
});

test('what one player saw, everyone can read', async () => {
	const sent = await call('POST', '/api/boards', {
		cookie: admiral,
		body: sighting([[isle(0), 'Wool', '10', '[Level 1] Roa Flower Seed Pouch'], [isle(1), 'Fleece', '200', '[Level 1] Stained Seagull Figurine']])
	});
	assert.equal(sent.status, 200);
	const { id } = await sent.json();
	assert.ok(id > 0);

	// Read without signing in at all: a board is the same for everyone.
	const open = await (await call('GET', '/api/boards')).json();
	const row = open.boards.find(b => b.id === id);
	assert.ok(row, 'the sighting was not on the list');
	assert.equal(row.day, DAY);
	assert.equal(row.layout, '16');
	assert.equal(row.offers.length, 2);
	assert.equal(row.seen, 0);
	assert.equal(row.mine, false);
	// The name shows for an account shown by name on the boards, and
	// this one has not joined them, so it does not.
	assert.equal(row.name, null);
});

test('a second reading adds to the first rather than replacing it', async () => {
	await call('POST', '/api/boards', { cookie: deckhand, body: sighting([[isle(2), 'Beer', '300', 'A']]) });
	const again = await call('POST', '/api/boards', { cookie: deckhand, body: sighting([[isle(3), 'Brass Ingot', '10', 'B'], [isle(2), 'Beer', '300', 'C']]) });
	assert.equal(again.status, 200);
	const { boards } = await (await call('GET', '/api/boards', { cookie: deckhand })).json();
	const mine = boards.filter(b => b.mine);
	assert.equal(mine.length, 1, 'one sighting an account a day');
	assert.equal(mine[0].offers.length, 2);
	// The island looked at twice keeps the later answer.
	assert.equal(mine[0].offers.find(o => o[0] === isle(2))[3], 'C');
});

test('somebody else saw the same board, and it is counted once', async () => {
	const { boards } = await (await call('GET', '/api/boards', { cookie: admiral })).json();
	const theirs = boards.find(b => !b.mine);
	assert.ok(theirs);
	assert.equal((await call('POST', `/api/boards/${theirs.id}/seen`, { cookie: admiral })).status, 200);
	assert.equal((await call('POST', `/api/boards/${theirs.id}/seen`, { cookie: admiral })).status, 200);
	const after = await (await call('GET', '/api/boards', { cookie: admiral })).json();
	const row = after.boards.find(b => b.id === theirs.id);
	assert.equal(row.seen, 1);
	assert.equal(row.confirmed, true);
});

test('nobody confirms their own sighting', async () => {
	const { boards } = await (await call('GET', '/api/boards', { cookie: admiral })).json();
	const own = boards.find(b => b.mine);
	const res = await call('POST', `/api/boards/${own.id}/seen`, { cookie: admiral });
	assert.equal(res.status, 400);
});

test('a sighting is its sender\'s to take back, and nobody else\'s', async () => {
	const { boards } = await (await call('GET', '/api/boards', { cookie: deckhand })).json();
	const mine = boards.find(b => b.mine);
	const theirs = boards.find(b => !b.mine);
	assert.equal((await call('DELETE', `/api/boards/${theirs.id}`, { cookie: deckhand })).status, 400);
	assert.equal((await call('DELETE', `/api/boards/${mine.id}`, { cookie: deckhand })).status, 200);
	const after = await (await call('GET', '/api/boards')).json();
	assert.equal(after.boards.some(b => b.id === mine.id), false);
});

test('the operator can hide anybody\'s', async () => {
	const sent = await call('POST', '/api/boards', { cookie: deckhand, body: sighting([[isle(5), 'Wool', '10', 'A']], '2026-09-16') });
	const { id } = await sent.json();
	assert.equal((await call('DELETE', `/api/boards/${id}`, { cookie: admiral })).status, 200);
	const after = await (await call('GET', '/api/boards')).json();
	assert.equal(after.boards.some(b => b.id === id), false);
});
