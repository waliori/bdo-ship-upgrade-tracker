// The community boards and the feedback inbox, against the real server.
//
// Like sync.test.mjs: the actual routes and the actual database, with a
// session minted by the server's own signing code. Two halves here --
// the digest a save becomes (pure, no server), and what the boards and
// the inbox do with it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-community-'));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.FLUSH_DELAY_MS = '0';
process.env.ADMIN_IDS = '2001';
process.env.COMMUNITY_TTL_MS = '0';   // every read rebuilds, so a change shows at once
delete process.env.FEEDBACK_WEBHOOK_URL;

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser } = await import('../server/db.js');
const { digest, BOARDS, fittedOn } = await import('../js/digest.js');
const { readProfile } = await import('../js/profile-shape.js');

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

await upsertUser({ id: '2001', username: 'Admiral', avatar: 'abc' });
await upsertUser({ id: '2002', username: 'Deckhand', avatar: null });
await upsertUser({ id: '2003', username: 'Stranger', avatar: null });
const admiral = cookieFor('2001');
const deckhand = cookieFor('2002');
const stranger = cookieFor('2003');

const save = (profile, stock = { 'Tidal Black Stone': 10 }) => ({ stock, targets: [{ id: 't', item: 'Panokseon', qty: 1, active: true }], strategy: {}, profile });

/* ------------------------------------------------------------------ *
 * The digest
 * ------------------------------------------------------------------ */

test('the digest reads the fleet, the crew and the career off a save', () => {
	const d = digest(save({
		sailingMastery: 1200, level: 'Master 1', barterCount: 40, crewShip: 'Carrack (Advance)',
		fitted: { 'Carrack (Advance)': { cannon: '+10 Epheria Carrack: Toro Cannon', sail: '+5 Epheria Carrack: Toro Sail' } },
		setups: { a: { name: 'Hunter', ship: 'Carrack (Volante)' } },
		roster: [{ id: 'a', name: 'Bodil', type: 'Bodil (Goblin)', lv: 9, stats: { speed: 8 } }, { id: 'b', name: 'Aht', type: 'Aht', lv: 2 }],
		runs: [{ day: '2026-09-01', silver: 100, cost: 10, trades: 3, parley: 5, stops: 2 }],
		tally: { runs: 7, silver: 900, trades: 20, quests: { 'omg-nineshark': 4, 'ravinia-1': 1, 'not-a-quest': 9 }, made: { 'Epheria Caravel': 1, "Blueprint: Chiro's Cannon": 3 }, tries: 10, wins: 4 },
		questsDone: { charity: '2026-09-07' },
		views: { map: { savedRoutes: [{ name: 'a', stops: [1, 2] }, { name: 'b', stops: [2, 3] }], traces: [{ points: [{}, {}, {}] }] } }
	}));
	assert.equal(d.mastery, 1200);
	assert.equal(d.barters, 40);
	assert.deepEqual(d.fleet.hulls, ['Carrack (Advance)', 'Carrack (Volante)']);
	assert.equal(d.fleet.best.ship, 'Carrack (Advance)');
	assert.equal(d.fleet.best.levels, 15);
	assert.equal(d.crew.n, 2);
	assert.equal(d.crew.best.name, 'Bodil');
	// The tally is the career; the list is only the last sixty.
	assert.equal(d.runs.n, 7);
	assert.equal(d.runs.silver, 900);
	assert.equal(d.runs.best.net, 90);
	// A name the quest list does not know is dropped; a quest ticked now
	// counts once without a tally.
	assert.deepEqual(d.quests.byId, { 'omg-nineshark': 4, 'ravinia-1': 1, charity: 1 });
	// The charity daily is a hunt too, so it counts against its monster.
	assert.deepEqual(d.quests.hunts, { nineshark: 4, 'young-hekaru': 1 });
	assert.equal(d.yard.ships, 1);
	assert.equal(d.yard.crafts, 4);
	assert.deepEqual(d.charts.stops, { 2: 2, 1: 1, 3: 1 });
	assert.equal(d.charts.points, 3);
	assert.equal(d.stock.units, 10);
	// Every board reads a number off it, and says what it counts.
	for (const b of BOARDS) {
		assert.equal(typeof b.value(d), 'number', b.id);
		assert.ok(b.desc && b.how && b.section, b.id);
	}
	// The face a row wears: the best hull with its parts by name and its
	// crystal, the best sailor's type, the monsters hunted.
	const face = id => BOARDS.find(b => b.id === id).face(d);
	assert.deepEqual(face('ship'), { kind: 'ship', item: 'Carrack (Advance)', parts: { cannon: 10, sail: 5 }, fitted: { cannon: '+10 Epheria Carrack: Toro Cannon', sail: '+5 Epheria Carrack: Toro Sail' }, crystal: 0 });
	assert.deepEqual(face('sailor'), { kind: 'sailor', type: 'Bodil (Goblin)', name: 'Bodil', lv: 9, stats: { speed: 8 } });
	assert.deepEqual(face('hunts'), { kind: 'monsters', keys: ['nineshark', 'young-hekaru'] });
	assert.equal(face('mastery'), null);
	assert.deepEqual(fittedOn(d, 'Carrack (Volante)'), null);
});

test('the best ship is scored on what is on it, not only how far it is taken', () => {
	const set = (maker, n) => ({ cannon: maker('Cannon', n), sail: maker('Sail', n), figurehead: maker('Figurehead', n), plating: maker('Plating', n) });
	const yellow = (slot, n) => `+${n} Epheria Carrack: Advance (Falasi's ${slot})`;
	const chiro = (slot, n) => `+${n} Epheria Carrack: Advance (Chiro's ${slot === 'Plating' ? 'Black Plating' : slot})`;
	const toro = (slot, n) => `+${n} Epheria Carrack: Toro ${slot}`;
	const ship = (fitted, crystal) => digest(save({
		crewShip: 'Carrack (Advance)',
		fitted: { 'Carrack (Advance)': fitted },
		...(crystal ? { crystal: { 'Carrack (Advance)': crystal } } : {})
	})).fleet.best;

	const full = ship(set(yellow, 10));
	const blue = ship(set(chiro, 10));
	const mixed = ship({ ...set(chiro, 10), cannon: toro('Cannon', 10), figurehead: toro('Figurehead', 10) });
	const bare = ship(set(chiro, 0));

	// The whole point: four sets, all "+40 in all", no longer tie.
	assert.ok(full.score > blue.score, 'a yellow set must beat a blue one');
	assert.ok(blue.score > mixed.score, 'an all-blue set must beat a half-green one');
	assert.ok(mixed.score > bare.score, 'ten levels must still be worth something');
	// A family step is worth more than every level below it, so no amount
	// of enhancing carries a green part past a blue one.
	assert.ok(ship(set(chiro, 0)).score > ship(set(toro, 10)).score, 'a bare blue set outranks a maxed green one');

	// The crystal counts, but for less than lifting the set a tier.
	const RUSALKA = 756821;
	assert.ok(ship(set(chiro, 10), RUSALKA).score > blue.score, 'a crystal is worth something');
	assert.ok(ship(set(chiro, 10), RUSALKA).score < full.score, 'a crystal is worth less than a whole set tier');

	// And the row says which set it is looking at.
	assert.deepEqual(full.sets, ['yellow']);
	assert.deepEqual(mixed.sets, ['Chiro', 'Toro']);
	const b = BOARDS.find(x => x.id === 'ship');
	assert.equal(b.detail({ fleet: { best: mixed } }), 'Carrack (Advance) · Chiro, Toro · +40 in all');
	// A digest written before sets existed still reads.
	assert.equal(b.detail({ fleet: { best: { ship: 'Panokseon', levels: 12 } } }), 'Panokseon · +12 in all');

	// The hull still outweighs anything bolted to it.
	const caravel = digest(save({ crewShip: 'Epheria Caravel', fitted: { 'Epheria Caravel': {} } })).fleet.best;
	assert.ok(bare.score > caravel.score, 'a Carrack outranks a Caravel however either is fitted');
});

test('an empty save digests to zeros, not to a throw', () => {
	const d = digest({});
	assert.equal(d.mastery, 0);
	assert.equal(d.fleet.n, 0);
	assert.equal(d.fleet.best, null);
	assert.equal(d.crew.best, null);
	for (const b of BOARDS) assert.ok(b.value(d) < b.min, `${b.id} earns a place at nothing`);
	assert.equal(digest(null).runs.n, 0);
});

test('the tally is bounded like the rest of the profile', () => {
	const p = readProfile({ tally: {
		runs: '12', silver: -5, tries: 3.9, bogus: 1,
		quests: { a: 2, b: 0, c: 'x', d: -1 },
		made: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`item ${i}`, 1]))
	} });
	assert.equal(p.tally.runs, 12);
	assert.equal(p.tally.silver, undefined);
	assert.equal(p.tally.tries, 3);
	assert.equal(p.tally.bogus, undefined);
	assert.deepEqual(p.tally.quests, { a: 2 });
	assert.equal(Object.keys(p.tally.made).length, 400);
	assert.equal(readProfile({ tally: { runs: 0 } }).tally, undefined);
});

/* ------------------------------------------------------------------ *
 * The boards
 * ------------------------------------------------------------------ */

test('the boards are empty until someone takes part, and readable signed out', async () => {
	const res = await call('GET', '/api/community');
	assert.equal(res.status, 200);
	assert.equal(res.headers.get('cache-control'), 'no-store');
	const body = await res.json();
	assert.equal(body.sailors, 0);
	assert.equal(body.you, null);
	assert.equal(body.fame.length, BOARDS.length);
	assert.ok(body.fame.every(f => f.top.length === 0));
});

test('taking part puts the digest of the save on the boards, by name or unnamed', async () => {
	for (const [cookie, profile] of [
		[admiral, { sailingMastery: 1500, barterCount: 300, tally: { runs: 50, silver: 5e9 } }],
		[deckhand, { sailingMastery: 900, barterCount: 20, tally: { runs: 5, silver: 1e8 } }],
		[stranger, { sailingMastery: 2900, barterCount: 999 }]
	]) {
		const res = await call('PUT', '/api/state', { cookie, body: { rev: 0, data: save(profile), device: 'test' } });
		assert.equal(res.status, 200);
	}
	assert.equal((await call('PUT', '/api/community/share', { body: { share: 'named' } })).status, 401);
	assert.equal((await call('PUT', '/api/community/share', { cookie: admiral, body: { share: 'loud' } })).status, 400);
	assert.deepEqual(await (await call('PUT', '/api/community/share', { cookie: admiral, body: { share: 'named' } })).json(), { share: 'named' });
	assert.deepEqual(await (await call('PUT', '/api/community/share', { cookie: deckhand, body: { share: 'anon' } })).json(), { share: 'anon' });

	const me = await (await call('GET', '/api/me', { cookie: admiral })).json();
	assert.equal(me.share, 'named');
	assert.equal(me.admin, true);

	// The boards are opt-out: asking who is signed in puts an account
	// that has never said on them, by name. The stranger -- the highest
	// mastery of the three -- is put on, then leaves, and is not put
	// back however often the page asks again.
	const first = await (await call('GET', '/api/me', { cookie: stranger })).json();
	assert.equal(first.share, 'named');
	assert.equal(first.admin, false);
	assert.deepEqual(await (await call('PUT', '/api/community/share', { cookie: stranger, body: { share: 'off' } })).json(), { share: null });
	assert.equal((await (await call('GET', '/api/me', { cookie: stranger })).json()).share, null);
	assert.equal((await (await call('GET', '/api/me', { cookie: stranger })).json()).share, null);

	const body = await (await call('GET', '/api/community', { cookie: deckhand })).json();
	assert.equal(body.sailors, 2);
	assert.equal(body.named, 1);
	const mastery = body.fame.find(f => f.id === 'mastery');
	assert.deepEqual(mastery.top.map(e => [e.rank, e.name, e.value, e.you]), [[1, 'Admiral', 1500, false], [2, null, 900, true]]);
	assert.equal(mastery.top[0].avatar, 'https://cdn.discordapp.com/avatars/2001/abc.png?size=64');
	assert.equal(mastery.top[1].named, false);
	assert.equal('id' in mastery.top[1], false, 'no account id leaves the server, named or not');
	assert.equal('key' in mastery.top[1], false, 'the matching key never leaves the server');
	assert.deepEqual(body.you.places.mastery, { rank: 2, value: 900, of: 2 });
	assert.equal(body.you.share, 'anon');
	assert.equal(body.you.mastery, 900);
	assert.ok(body.you.joinedAt > 0);
	assert.equal('face' in mastery.top[0], true, 'a row carries what it shows beside the name');
	// Signed out, nobody is "you".
	const out = await (await call('GET', '/api/community')).json();
	assert.ok(out.fame.every(f => f.top.every(e => e.you === false)));
	assert.equal(out.you, null);
	// The fleet in numbers adds the two up.
	assert.equal(out.stats.totals.silver, 5e9 + 1e8);
	assert.equal(out.stats.totals.runs, 55);
	assert.deepEqual(out.stats.builds, { Panokseon: 2 });
});

test('a place opens a card by an opaque handle, a board shows whole, and a name can be found', async () => {
	const body = await (await call('GET', '/api/community', { cookie: deckhand })).json();
	const mastery = body.fame.find(f => f.id === 'mastery');
	const [first, second] = mastery.top;
	assert.match(first.ref, /^[A-Za-z0-9_-]{16}$/);
	assert.notEqual(first.ref, second.ref);
	assert.ok(!/2001|2002/.test(first.ref + second.ref), 'the handle is not the account id');
	// The named sailor's card, opened by a stranger.
	const card = await (await call('GET', `/api/community/sailor/${first.ref}`)).json();
	assert.equal(card.name, 'Admiral');
	assert.equal(card.named, true);
	assert.equal(card.you, false);
	assert.equal(card.digest.mastery, 1500);
	assert.deepEqual(card.places.mastery, { rank: 1, value: 1500, of: 2 });
	// The unnamed sailor's card carries no name, and knows its owner.
	const anon = await (await call('GET', `/api/community/sailor/${second.ref}`, { cookie: deckhand })).json();
	assert.equal(anon.name, null);
	assert.equal(anon.you, true);
	assert.equal((await call('GET', '/api/community/sailor/nope')).status, 404);
	// The whole board.
	const board = await (await call('GET', '/api/community/board/mastery', { cookie: deckhand })).json();
	assert.equal(board.all.length, 2);
	assert.equal(board.all[1].you, true);
	assert.equal((await call('GET', '/api/community/board/nothing')).status, 404);
	// Only named sailors are found by name.
	assert.deepEqual((await (await call('GET', '/api/community/find?q=adm')).json()).sailors.map(s => s.name), ['Admiral']);
	assert.deepEqual((await (await call('GET', '/api/community/find?q=deck')).json()).sailors, []);
	assert.deepEqual((await (await call('GET', '/api/community/find?q=a')).json()).sailors, []);
});

test('a fresh push reaches the boards, and leaving takes the digest down', async () => {
	const rev = (await (await call('GET', '/api/state', { cookie: deckhand })).json()).rev;
	const res = await call('PUT', '/api/state', { cookie: deckhand, body: { rev, data: save({ sailingMastery: 1600, tally: { runs: 5 } }), device: 'test' } });
	assert.equal(res.status, 200);
	let body = await (await call('GET', '/api/community', { cookie: deckhand })).json();
	assert.deepEqual(body.you.places.mastery, { rank: 1, value: 1600, of: 2 });

	assert.deepEqual(await (await call('PUT', '/api/community/share', { cookie: deckhand, body: { share: 'off' } })).json(), { share: null });
	body = await (await call('GET', '/api/community', { cookie: deckhand })).json();
	assert.equal(body.sailors, 1);
	assert.deepEqual(body.you.places, {});
	const { db } = await import('../server/db.js');
	const { rows } = await db().execute("SELECT COUNT(*) AS n FROM community WHERE user_id = '2002'");
	assert.equal(Number(rows[0].n), 0, 'the row is gone, not marked');
});

test('the caller can see its own digest before agreeing', async () => {
	assert.equal((await call('GET', '/api/community/mine')).status, 401);
	const body = await (await call('GET', '/api/community/mine', { cookie: stranger })).json();
	assert.equal(body.digest.mastery, 2900);
});

test('deleting the account takes it off the boards', async () => {
	await upsertUser({ id: '2004', username: 'Leaver', avatar: null });
	const leaver = cookieFor('2004');
	await call('PUT', '/api/state', { cookie: leaver, body: { rev: 0, data: save({ sailingMastery: 100 }), device: 'test' } });
	await call('PUT', '/api/community/share', { cookie: leaver, body: { share: 'named' } });
	assert.equal((await (await call('GET', '/api/community')).json()).sailors, 2);
	assert.equal((await call('DELETE', '/api/account', { cookie: leaver })).status, 200);
	assert.equal((await (await call('GET', '/api/community')).json()).sailors, 1);
});

/* ------------------------------------------------------------------ *
 * The inbox
 * ------------------------------------------------------------------ */

test('anyone may send feedback; only what is plainly not feedback is refused', async () => {
	assert.equal((await call('POST', '/api/feedback', { body: { kind: 'bug', text: 'hi' } })).status, 400);
	assert.equal((await call('POST', '/api/feedback', { body: { kind: 'rant', text: 'the sea is too wet' } })).status, 400);
	assert.equal((await call('POST', '/api/feedback', { body: { kind: 'bug', text: 'x'.repeat(4001) } })).status, 400);
	const anon = await call('POST', '/api/feedback', { body: { kind: 'bug', text: 'The map is upside down', page: 'map', version: '2.1', contact: 'gull#1' } });
	assert.equal(anon.status, 201);
	assert.equal((await anon.json()).ok, true);
	const named = await call('POST', '/api/feedback', { cookie: deckhand, body: { kind: 'idea', text: 'Rations on the run, please', page: 'barter', username: 'Deckhand' } });
	assert.equal(named.status, 201);
});

test('the inbox is for admins, open first, and an entry can be marked done', async () => {
	assert.equal((await call('GET', '/api/feedback')).status, 401);
	assert.equal((await call('GET', '/api/feedback', { cookie: deckhand })).status, 403);
	const res = await call('GET', '/api/feedback', { cookie: admiral });
	assert.equal(res.status, 200);
	const { entries } = await res.json();
	assert.equal(entries.length, 2);
	assert.equal(entries[0].text, 'Rations on the run, please');
	assert.equal(entries[0].username, 'Deckhand');
	assert.equal(entries[0].userId, '2002');
	assert.equal(entries[1].userId, null);
	assert.equal(entries[1].contact, 'gull#1');
	assert.ok(entries.every(e => e.status === 'open'));

	assert.equal((await call('POST', `/api/feedback/${entries[0].id}/status`, { cookie: deckhand, body: { status: 'done' } })).status, 403);
	assert.equal((await call('POST', `/api/feedback/${entries[0].id}/status`, { cookie: admiral, body: { status: 'done' } })).status, 200);
	const after = (await (await call('GET', '/api/feedback', { cookie: admiral })).json()).entries;
	assert.equal(after[0].status, 'open', 'the open one comes first');
	assert.equal(after[1].status, 'done');
});
