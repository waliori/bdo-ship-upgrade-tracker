// A backup that cannot be restored is not a backup. Every table is
// filled, written out by tools/backup.mjs, and read back into an empty
// database by the same tool -- and the two databases must agree, row
// for row, along with the feedback pictures kept beside the file.
//
// The tool is run as the operator runs it, as its own process, so what
// is tested is the script and not a copy of its insides.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@libsql/client';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sail-backup-'));
const from = path.join(dir, 'from.db');
const into = path.join(dir, 'into.db');
const uploadsFrom = path.join(dir, 'uploads-from');
const uploadsInto = path.join(dir, 'uploads-into');
fs.mkdirSync(uploadsFrom);
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

process.env.NODE_ENV = 'test';
process.env.TURSO_DATABASE_URL = `file:${from}`;
process.env.UPLOAD_DIR = uploadsFrom;
const db = await import('../server/db.js');

const tool = new URL('../tools/backup.mjs', import.meta.url).pathname;
const run = (args, url, uploads) => execFileSync(process.execPath, [tool, ...args], {
	env: { ...process.env, TURSO_DATABASE_URL: `file:${url}`, UPLOAD_DIR: uploads, NODE_ENV: 'test' },
	encoding: 'utf8'
});

/** Every row of every table, in a stable order, for comparing. */
async function everything(file) {
	const c = createClient({ url: `file:${file}` });
	const out = {};
	for (const table of db.TABLES) {
		const { rows } = await c.execute(`SELECT * FROM ${table}`);
		out[table] = rows.map(r => JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])))).sort();
	}
	c.close();
	return out;
}

test('every table survives a backup and a restore, and so do the pictures', async () => {
	await db.migrate();
	await db.upsertUser({ id: '7001', username: 'Sailor', avatar: 'abc' });
	await db.upsertUser({ id: '7002', username: 'Other', avatar: null });
	await db.writeSave('7001', { rev: 3, payload: '{"stock":{}}', updatedAt: 1, device: 'd' });
	await db.putPushSub('https://fcm.googleapis.com/fcm/send/x', { endpoint: 'x', keys: {} }, 'eu', '7001', true);
	await db.putPushAlerts('7001', 'run-1', [{ at: Date.now() + 60_000, title: 'Next', body: 'Iliya' }]);
	const fb = await db.insertFeedback({ userId: '7001', username: 'Sailor', kind: 'bug', text: 'it broke', format: 'md' });
	await db.insertFile({ id: 'pic123456', userId: '7001', mime: 'image/png', bytes: 4, width: 1, height: 1, name: 'a.png' });
	await db.attachFiles(['pic123456'], fb, '7001');
	fs.writeFileSync(path.join(uploadsFrom, 'pic123456.png'), 'png!');
	await db.putCommunity('7001', 'anon', { v: 1 }, 3);
	await db.touchPresence('browser-token-1');
	const board = await db.insertSighting('7001', { day: '2026-10-01', layout: '4', offers: [[1, 'a', '1', 'b']] });
	await db.confirmSighting(board, '7002');
	await db.insertLink({ id: 'shortlink1', userId: '7001', kind: 'plan', payload: '{}' });
	await db.revokeSession('sid-gone', Date.now() + 86_400_000);

	const want = await everything(from);
	for (const table of db.TABLES) assert.ok(want[table].length > 0, `the test left ${table} empty, so it proves nothing about it`);

	const file = path.join(dir, 'backup.json');
	run([file], from, uploadsFrom);
	assert.ok(fs.existsSync(path.join(dir, 'backup-uploads', 'pic123456.png')), 'the pictures were not copied beside the file');

	run(['--restore', file], into, uploadsInto);
	assert.deepEqual(await everything(into), want);
	assert.equal(fs.readFileSync(path.join(uploadsInto, 'pic123456.png'), 'utf8'), 'png!', 'the pictures were not put back');

	// A restore is an upsert: run twice, it changes nothing.
	run(['--restore', file], into, uploadsInto);
	assert.deepEqual(await everything(into), want);
});
