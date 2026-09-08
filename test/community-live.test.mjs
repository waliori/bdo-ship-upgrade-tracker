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
const { upsertUser, putCommunity, listCommunity } = await import('../server/db.js');

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

test('a digest from an older build is re-rated without its owner lifting a finger', async () => {
	// The case that made this necessary: the ship score began reading
	// part quality, one sailor pushed a save and was re-rated, and
	// everyone else sat on the same board still wearing the old number.
	// Nothing about their save had changed, so nothing asked for it to
	// be worked out again.
	await upsertUser({ id: '3002', username: 'Ghost', avatar: null });
	const ghost = cookieFor('3002');
	await call('PUT', '/api/state', {
		cookie: ghost,
		body: { rev: 0, device: 'test', data: save({ sailingMastery: 700, crewShip: 'Carrack (Valor)' }) }
	});
	assert.equal((await (await call('GET', '/api/me', { cookie: ghost })).json()).share, 'named');

	// Put a digest of the old shape on the boards by hand, with a score
	// worked out the way the old build worked one out, and a revision
	// that says it is current -- so nothing but the version can flag it.
	const rev = (await (await call('GET', '/api/state', { cookie: ghost })).json()).rev;
	await putCommunity('3002', 'named', {
		v: 1, mastery: 700, level: null, barters: 0,
		fleet: { n: 1, hulls: ['Carrack (Valor)'], list: [], sailing: 'Carrack (Valor)', parts: {}, crystals: {}, best: { ship: 'Carrack (Valor)', tier: 4, parts: {}, fitted: {}, levels: 0, score: 400 } },
		crew: { n: 0, best: null, top: [], byType: {}, levels: [], avgLv: 0 },
		runs: { n: 0, silver: 0, cost: 0, trades: 0, parley: 0, stops: 0, best: null, days: [0, 0, 0, 0, 0, 0, 0], last: null },
		quests: { n: 0, distinct: 0, byId: {}, hunts: {}, huntsN: 0, favs: [] },
		yard: { queued: 0, byItem: {}, crafts: 0, ships: 0, parts: 0, shipsMade: {}, tries: 0, wins: 0, drops: 0 },
		charts: { routes: 0, traces: 0, points: 0, stops: {} },
		stock: { items: 0, units: 0, silver: 0, crow: 0 },
		ship: {}
	}, rev);

	// A read of the boards is all it takes: the stored digest says v1,
	// this build writes v2, so it is worked out again from the save.
	const body = await (await call('GET', '/api/community', { cookie: ghost })).json();
	assert.deepEqual(body.you.places.ship, { rank: 1, value: 4000, of: 2 }, 'the old 400 was re-rated to a v2 score');

	// And it was written back, so the next build does not do it again.
	const rows = await listCommunity();
	const row = rows.find(r => r.userId === '3002');
	assert.equal(JSON.parse(row.stats).v, 2, 'the fresh digest was stored, not only served');
});
