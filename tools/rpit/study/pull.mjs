// The studies out of the database, one JSON file each, bodies unpacked.
//   TURSO_DATABASE_URL=file:.data/tracker.db node tools/rpit/study/pull.mjs <out dir> [since ms]
// For the live database, TURSO_DATABASE_URL and TURSO_AUTH_TOKEN as the
// server has them. Files already there are kept unless the study has
// since been sailed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [out, sinceArg] = process.argv.slice(2);
if (!out) { console.error('usage: pull.mjs <out dir> [since ms]'); process.exit(1); }
const { listStudies } = await import('../../../server/db.js');
const unpack = s => (s ? JSON.parse(zlib.gunzipSync(Buffer.from(s, 'base64')).toString()) : null);
fs.mkdirSync(out, { recursive: true });
let since = Number(sinceArg || 0), n = 0, sailed = 0;
for (;;) {
	const rows = await listStudies(since, 200);
	if (!rows.length) break;
	for (const r of rows) {
		const file = path.join(out, `${r.id}.json`);
		if (fs.existsSync(file) && !r.sailedAt) continue;
		fs.writeFileSync(file, JSON.stringify({ id: r.id, userId: r.userId, device: r.device, planner: r.planner, release: r.release, layout: r.layout, day: r.day, createdAt: r.createdAt, sailedAt: r.sailedAt, body: unpack(r.body), sailed: unpack(r.sailed) }));
		n++; if (r.sailedAt) sailed++;
		since = r.createdAt;
	}
	if (rows.length < 200) break;
}
console.log(`${n} studies written to ${out}, ${sailed} with a run recorded`);
process.exit(0);
