// Every table to one JSON file, and back again.
//
//   npm run backup                      writes ./backup-<date>.json
//   npm run backup -- saves.json        writes the file you name
//   npm run restore -- saves.json       puts every row in it back
//
// Reads .env the way `npm start` does, so it talks to the same database
// the server does -- a Turso URL or a local file, whichever is set. The
// file holds the rows as they are, with the save payloads still the
// JSON text the browser sent, so it can be read by hand.
//
// A restore is an upsert: rows in the file are written over what the
// database holds under the same key, and rows the file does not name
// are left alone. Stop the server first. With sync on it holds the
// current save of every recent account in memory and writes those out
// behind every edit, so a restore made under a running server is
// overwritten by the next flush -- see server/saves.js.
//
// Prints counts and the path, never a credential.

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';

const args = process.argv.slice(2);
const restoring = args[0] === '--restore';
const file = restoring ? args[1] : args[0];

if (!config.turso.url) {
	console.error('No TURSO_DATABASE_URL is set; there is no database to back up.');
	process.exit(1);
}
if (restoring && !file) {
	console.error('Which file? tools/backup.mjs --restore <file>');
	process.exit(1);
}

const { db, migrate, TABLES } = await import('../server/db.js');
const where = config.turso.url.startsWith('file:') ? 'the local file' : 'Turso';

// The schema first, so a backup of an empty database is a file with
// empty tables rather than an error, and a restore into a fresh one
// has somewhere to put the rows.
const schemaVersion = await migrate().then(v => v, err => {
	console.error(`Could not reach ${where}:`, err.message);
	process.exit(1);
});

const plain = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]));

async function dump(to) {
	const tables = {};
	for (const table of TABLES) {
		const { rows } = await db().execute(`SELECT * FROM ${table}`);
		tables[table] = rows.map(plain);
	}
	const out = { app: 'bdo-ship-upgrade-tracker', schemaVersion, at: new Date().toISOString(), tables };
	fs.writeFileSync(to, JSON.stringify(out, null, '\t') + '\n');
	for (const table of TABLES) console.log(`  ${table.padEnd(10)} ${tables[table].length} rows`);
	console.log(`\nWritten to ${path.resolve(to)}`);
}

// One statement per row, each an upsert on the table's key, in the order
// the foreign key wants: an account before its save.
function upsert(table, row) {
	const cols = Object.keys(row);
	const key = table === 'saves' ? 'user_id' : table === 'push_subs' ? 'endpoint' : 'id';
	const updates = cols.filter(c => c !== key).map(c => `${c} = excluded.${c}`).join(', ');
	return {
		sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
			ON CONFLICT(${key}) DO UPDATE SET ${updates}`,
		args: cols.map(c => row[c])
	};
}

async function restore(from) {
	const backup = JSON.parse(fs.readFileSync(from, 'utf8'));
	if (!backup || !backup.tables) {
		console.error(`${from} is not a backup this tool wrote.`);
		process.exit(1);
	}
	if (backup.schemaVersion > schemaVersion) {
		console.error(`${from} was taken from schema version ${backup.schemaVersion}; this code knows ${schemaVersion}. Update first.`);
		process.exit(1);
	}
	for (const table of TABLES) {
		const rows = backup.tables[table] || [];
		// A batch is one transaction over libsql, so a restore lands whole
		// or not at all rather than stopping half-way through the saves.
		if (rows.length) await db().batch(rows.map(row => upsert(table, row)), 'write');
		console.log(`  ${table.padEnd(10)} ${rows.length} rows`);
	}
	console.log(`\nRestored into ${where}.`);
}

if (restoring) await restore(file);
else await dump(file || `backup-${new Date().toISOString().slice(0, 10)}.json`);
process.exit(0);
