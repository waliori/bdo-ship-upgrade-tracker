// What the feedback webhook is sent: the words, who sent them, the
// device, and the pictures as real attachments rather than a count.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-hook-'));
const got = [];
const hook = http.createServer((req, res) => {
	const chunks = [];
	req.on('data', c => chunks.push(c));
	req.on('end', () => {
		got.push({ type: req.headers['content-type'], body: Buffer.concat(chunks) });
		res.writeHead(204).end();
	});
});
await new Promise(resolve => hook.listen(0, resolve));

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.LOG_REQUESTS = '0';
delete process.env.PUBLIC_URL;
process.env.DISCORD_CLIENT_ID = 'test-client';
process.env.DISCORD_CLIENT_SECRET = 'test-secret';
process.env.TURSO_DATABASE_URL = `file:${path.join(dir, 'tracker.db')}`;
process.env.SESSION_SECRET = 'test-secret-key-for-signing-sessions';
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.REPORT_GAP_SECONDS = '1';
process.env.FEEDBACK_WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/hook`;

// Market prices from a recorded answer, never the live Market, so a run
// plans the same on any day (see server/market.js).
process.env.MARKET_FIXTURE = new URL('./fixtures/market.json', import.meta.url).href;
const app = (await import('../server.js')).default;
const { startSession } = await import('../server/session.js');
const { upsertUser } = await import('../server/db.js');

const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => {
	server.close();
	hook.close();
	fs.rmSync(dir, { recursive: true, force: true });
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await upsertUser({ id: '4001', username: 'Deckhand', avatar: null });
const headers = [];
startSession({ append: (name, value) => headers.push(value) }, '4001');
const cookie = headers.map(h => h.split(';')[0]).join('; ');

const until = async (fn) => {
	for (let i = 0; i < 50 && !fn(); i++) await new Promise(resolve => setTimeout(resolve, 100));
};

test('the webhook gets the words, the sender, the device and the picture itself', async () => {
	const up = await fetch(`${base}/api/feedback/image?name=a.png`, {
		method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/png' }, body: PNG
	});
	const file = await up.json();
	const post = await fetch(`${base}/api/feedback`, {
		method: 'POST',
		headers: { Cookie: cookie, 'Content-Type': 'application/json', 'User-Agent': 'TestAgent/1.0' },
		body: JSON.stringify({ kind: 'bug', text: 'the chart will not load', page: 'map', version: '1.5', files: [file.id] })
	});
	assert.equal(post.status, 201);
	await until(() => got.length);
	assert.equal(got.length, 1);
	assert.match(got[0].type, /^multipart\/form-data/);
	const text = got[0].body.toString('latin1');
	assert.match(text, /Something is wrong/);
	assert.match(text, /Deckhand \(4001\)/);
	assert.match(text, /device: TestAgent\/1\.0/);
	assert.match(text, /the chart will not load/);
	assert.ok(got[0].body.includes(PNG), 'the picture bytes are in the request');
});

test('without a picture it is plain JSON, as before', async () => {
	got.length = 0;
	await new Promise(resolve => setTimeout(resolve, 1100));
	const post = await fetch(`${base}/api/feedback`, {
		method: 'POST',
		headers: { Cookie: cookie, 'Content-Type': 'application/json' },
		body: JSON.stringify({ kind: 'idea', text: 'an idea with words only' })
	});
	assert.equal(post.status, 201);
	await until(() => got.length);
	assert.match(got[0].type, /^application\/json/);
	assert.match(JSON.parse(got[0].body).content, /an idea with words only/);
});
