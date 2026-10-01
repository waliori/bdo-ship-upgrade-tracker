// Chimes as Discord messages: nobody is messaged until they ask, the ask is
// refused when Discord will not let the bot in, and a due chime reaches
// exactly the accounts that switched it on.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import webpush from 'web-push';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-dm-'));
const sent = [];
const closed = new Set(['5003']);
const fake = http.createServer((req, res) => {
	const chunks = [];
	req.on('data', c => chunks.push(c));
	req.on('end', () => {
		const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
		res.setHeader('Content-Type', 'application/json');
		if (req.url === '/users/@me/channels') {
			if (closed.has(body.recipient_id)) return res.writeHead(403).end('{"code":50007}');
			return res.end(JSON.stringify({ id: `room-${body.recipient_id}` }));
		}
		const m = req.url.match(/^\/channels\/room-(\d+)\/messages$/);
		if (m) {
			sent.push({ to: m[1], embed: body.embeds[0] });
			return res.end('{}');
		}
		res.writeHead(404).end('{}');
	});
});
await new Promise(resolve => fake.listen(0, resolve));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
process.env.DISCORD_API = `http://127.0.0.1:${fake.address().port}`;

const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser, putPushAlerts } = await import('../server/db.js');
const { sendDueAlerts } = await import('../server/push.js');

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.close(); fake.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const cookieFor = id => {
	const headers = [];
	startSession({ append: (n, v) => headers.push(v) }, id);
	return headers.map(h => h.split(';')[0]).join('; ');
};
const call = (method, url, { cookie, body } = {}) => fetch(base + url, {
	method,
	headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
	body: body ? JSON.stringify(body) : undefined
});

for (const id of ['5001', '5002', '5003']) await upsertUser({ id, username: `u${id}`, avatar: null });
const a = cookieFor('5001'), b = cookieFor('5002'), c = cookieFor('5003');

test('the deployment says it can, and nobody is on by default', async () => {
	assert.equal((await (await call('GET', '/api/config')).json()).discordDm, true);
	assert.equal((await call('GET', '/api/discord-dm')).status, 401);
	assert.deepEqual(await (await call('GET', '/api/discord-dm', { cookie: a })).json(), { available: true, on: false });
});

test('switching on says hello first, and is refused when Discord will not let the bot in', async () => {
	const ok = await call('PUT', '/api/discord-dm', { cookie: a, body: { on: true } });
	assert.equal(ok.status, 200);
	assert.equal(sent.length, 1);
	assert.equal(sent[0].to, '5001');
	const no = await call('PUT', '/api/discord-dm', { cookie: c, body: { on: true } });
	assert.equal(no.status, 409);
	assert.match((await no.json()).error, /community server/);
	assert.deepEqual(await (await call('GET', '/api/discord-dm', { cookie: c })).json(), { available: true, on: false });
});

test('a due chime is messaged to the accounts that asked, and to no one else', async () => {
	sent.length = 0;
	const now = Date.now();
	for (const id of ['5001', '5002']) await putPushAlerts(id, 'sail', [{ at: now - 1, title: 'Velia should be in reach', body: 'Stop 1 of 3' }]);
	await sendDueAlerts(now + 1000);
	assert.deepEqual(sent.map(m => [m.to, m.embed.title]), [['5001', 'Velia should be in reach']]);
	assert.equal(b.length > 0, true);
});

test('switching off stops them', async () => {
	await call('PUT', '/api/discord-dm', { cookie: a, body: { on: false } });
	sent.length = 0;
	await putPushAlerts('5001', 'sail', [{ at: Date.now() - 1, title: 'Again', body: '' }]);
	await sendDueAlerts(Date.now() + 1000);
	assert.equal(sent.length, 0);
});
