// The bot's slash commands over the interactions webhook: only Discord's
// signed calls are answered, and a card is built from the sailor's own save.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-bot-'));
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const rawKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.DISCORD_BOT_PUBLIC_KEY = rawKey;

// Market prices from a recorded answer, never the live Market, so a run
// plans the same on any day (see server/market.js).
process.env.MARKET_FIXTURE = new URL('./fixtures/market.json', import.meta.url).href;
const app = (await import('../server.js')).default;
const { upsertUser } = await import('../server/db.js');
const { writeSaveFor } = await import('../server/saves.js');

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (body, { sign = true, tamper = false } = {}) => {
	const raw = JSON.stringify(body);
	const ts = String(Math.floor(Date.now() / 1000));
	const sig = crypto.sign(null, Buffer.from(ts + raw), privateKey).toString('hex');
	return fetch(`${base}/api/discord/interactions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(sign ? { 'X-Signature-Ed25519': sig, 'X-Signature-Timestamp': ts } : {}) },
		body: tamper ? raw + ' ' : raw
	});
};
const slash = (name, id, options = []) => ({ type: 2, data: { name, options }, member: { user: { id, username: 'u' + id } } });

await upsertUser({ id: '6001', username: 'Bosun', avatar: null });
await upsertUser({ id: '6002', username: 'Landlubber', avatar: null });
await writeSaveFor('6001', JSON.stringify({
	stock: {}, targets: [], strategy: {},
	profile: {
		crewShip: 'Carrack (Valor)',
		setups: { s1: { name: 'Valor run', ship: 'Carrack (Valor)', fitted: {}, seats: {} } },
		roster: [{ id: 'a1', name: 'Mira', type: 'Innocent', lv: 10, cond: 100 }],
		seats: { 'Carrack (Valor)': { 'sail:0': 'a1' } }
	}
}), 0, 'test');

test('only calls signed with the application key are answered', async () => {
	assert.equal((await post({ type: 1 }, { sign: false })).status, 401);
	assert.equal((await post({ type: 1 }, { tamper: true })).status, 401);
	assert.deepEqual(await (await post({ type: 1 })).json(), { type: 1 });
});

test('/ship answers with the hull, its figures and a link', async () => {
	const res = await (await post(slash('ship', '6001'))).json();
	assert.equal(res.type, 4);
	const e = res.data.embeds[0];
	assert.match(e.title, /Valor/);
	assert.match(e.author.name, /Bosun/);
	assert.match(e.url, /#s\/[A-Za-z0-9_-]{10}$/);
	const speed = e.fields.find(f => f.name === 'Speed').value;
	assert.match(speed, /^\*\*\d/);
	assert.equal(res.data.flags, 0);
});

test('/sailors lists the seats and who sits in them', async () => {
	const res = await (await post(slash('sailors', '6001', [{ name: 'private', value: true }]))).json();
	const e = res.data.embeds[0];
	assert.match(e.description, /Sail\*\* — Mira/);
	assert.match(e.description, /speed \+/);
	assert.equal(res.data.flags, 64);
});

test('someone with no account is told how to get one, privately', async () => {
	const res = await (await post(slash('ship', '6002'))).json();
	assert.equal(res.data.flags, 64);
	assert.match(res.data.content, /Sign in/);
});

test('/fleet lists the ships, and /barter shows the record', async () => {
	const fleet = (await (await post(slash('fleet', '6001'))).json()).data.embeds[0];
	assert.match(fleet.title, /Bosun/);
	assert.match(fleet.description, /speed/);
	const barter = (await (await post(slash('barter', '6001'))).json()).data.embeds[0];
	assert.ok(barter.fields.find(f => f.name === 'Total Barters'));
	assert.equal((await (await post(slash('fleet', '6002'))).json()).data.flags, 64);
});
