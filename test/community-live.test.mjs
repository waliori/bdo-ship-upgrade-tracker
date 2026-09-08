// The boards keep up with a save, without anyone rejoining them.
//
// community.test.mjs runs with the window set to nothing, so every read
// rebuilds and nothing there can tell a live board from a lucky one.
// This file is the opposite: the window is five minutes, as it is in a
// real deployment, and the only thing that may bring a change through
// is the boards noticing that a save has moved. That was the bug --
// a ship fitted on the Ship tab did not reach the boards until the
// window turned over or the player left the boards and rejoined them.
//
// The save table's own revision is no use for this: it trails memory by
// a flush, so the flush delay here is deliberately long enough that a
// build reading it would see nothing new.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-live-'));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.FLUSH_DELAY_MS = '30000';        // the table stays behind for the whole test
process.env.COMMUNITY_TTL_MS = '300000';     // the window never turns over here
process.env.COMMUNITY_REBUILD_MS = '0';      // but a save that moved rebuilds at once
delete process.env.ADMIN_IDS;
delete process.env.FEEDBACK_WEBHOOK_URL;

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser } = await import('../server/db.js');

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

const save = profile => ({ stock: {}, targets: [], strategy: {}, profile });

await upsertUser({ id: '3001', username: 'Skipper', avatar: null });
const skipper = cookieFor('3001');

test('a ship fitted after the boards were drawn is on them without rejoining', async () => {
	// On the boards, with a save that has a hull and nothing on it.
	await call('PUT', '/api/state', {
		cookie: skipper,
		body: { rev: 0, device: 'test', data: save({ sailingMastery: 500, crewShip: 'Epheria Sailboat' }) }
	});
	assert.equal((await (await call('GET', '/api/me', { cookie: skipper })).json()).share, 'named');

	// Read them once, so there is a held copy to go stale.
	const before = await (await call('GET', '/api/community', { cookie: skipper })).json();
	assert.equal(before.sailors, 1);
	assert.equal(before.you.places.ship.value, 1000, 'a bare Sailboat: tier 1, nothing on it');

	// Fit it, the way the Ship tab does, and push.
	const rev = (await (await call('GET', '/api/state', { cookie: skipper })).json()).rev;
	const res = await call('PUT', '/api/state', {
		cookie: skipper,
		body: {
			rev, device: 'test',
			data: save({
				sailingMastery: 500, crewShip: 'Epheria Sailboat',
				fitted: { 'Epheria Sailboat': { cannon: '+10 Epheria: Old Cannon', sail: '+10 Epheria: Old Wind Sail' } }
			})
		}
	});
	assert.equal(res.status, 200);

	// No rejoining, no waiting out the window: the next read has it.
	const after = await (await call('GET', '/api/community', { cookie: skipper })).json();
	assert.ok(after.updatedAt > before.updatedAt, 'the boards were drawn again');
	// Tier 1, and two Epheria parts (rank 2) taken to +10.
	assert.equal(after.you.places.ship.value, 1000 + 2 * (2 * 11 + 10), 'the hull, and what is on it');
	const ship = after.fame.find(f => f.id === 'ship');
	assert.equal(ship.top[0].face.parts.cannon, 10);

	// And so does the card, which is what a player opens to look at
	// themselves.
	const card = await (await call('GET', `/api/community/sailor/${after.you.ref}`, { cookie: skipper })).json();
	assert.equal(card.you, true);
	assert.equal(card.digest.fleet.best.levels, 20);
	assert.deepEqual(card.digest.fleet.best.sets, ['Epheria']);
});

test('a hull in the inventory is a ship in the fleet', async () => {
	const rev = (await (await call('GET', '/api/state', { cookie: skipper })).json()).rev;
	await call('PUT', '/api/state', {
		cookie: skipper,
		body: {
			rev, device: 'test',
			data: {
				// Bought, recorded in the hold, and never set up on the
				// Ship tab. It is still a ship, and the best one owned.
				stock: { 'Carrack (Valor)': 1, 'Epheria Sailboat': 1 },
				targets: [], strategy: {},
				profile: { sailingMastery: 500, crewShip: 'Epheria Sailboat' }
			}
		}
	});
	const body = await (await call('GET', '/api/community', { cookie: skipper })).json();
	assert.deepEqual(body.you.places.fleet, { rank: 1, value: 2, of: 1 });
	const best = body.fame.find(f => f.id === 'ship').top[0];
	assert.equal(best.detail.startsWith('Carrack (Valor)'), true);
});
