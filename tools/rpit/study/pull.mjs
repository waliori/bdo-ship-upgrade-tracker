// The studies out of the database, one JSON file each, bodies unpacked.
//   TURSO_DATABASE_URL=file:.data/tracker.db node tools/rpit/study/pull.mjs <out dir> [since ms]
// For the live database, TURSO_DATABASE_URL and TURSO_AUTH_TOKEN as the
// server has them. Files already there are kept unless the study has
// since been sailed, as far as it went or recorded (`sailedPartial`).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [out, sinceArg] = process.argv.slice(2);
if (!out) { console.error('usage: pull.mjs <out dir> [since ms]'); process.exit(1); }
const { listStudies } = await import('../../../server/db.js');
const unpack = s => (s ? JSON.parse(zlib.gunzipSync(Buffer.from(s, 'base64')).toString()) : null);
fs.mkdirSync(out, { recursive: true });
const write = r => fs.writeFileSync(path.join(out, `${r.id}.json`), JSON.stringify({ id: r.id, userId: r.userId, device: r.device, planner: r.planner, release: r.release, layout: r.layout, day: r.day, createdAt: r.createdAt, sailedAt: r.sailedAt, sailedPartial: r.sailedPartial, body: unpack(r.body), sailed: unpack(r.sailed) }));
let n = 0, sailed = 0;
// The studies made since, then the outcomes that came since: a run is sent
// as it goes and recorded later, often under a study made before `since`.
for (const by of ['created', 'sailed']) {
	let since = Number(sinceArg || 0);
	for (;;) {
		const rows = await listStudies(since, 200, { by });
		if (!rows.length) break;
		for (const r of rows) {
			const file = path.join(out, `${r.id}.json`);
			since = by === 'sailed' ? r.sailedAt : r.createdAt;
			if (fs.existsSync(file) && !r.sailedAt) continue;
			if (by === 'sailed' && fs.existsSync(file)) { const was = JSON.parse(fs.readFileSync(file, 'utf8')); if (was.sailedAt === r.sailedAt) continue; }
			write(r);
			n++; if (r.sailedAt) sailed++;
		}
		if (rows.length < 200) break;
	}
}
console.log(`${n} studies written to ${out}, ${sailed} with a run recorded`);
process.exit(0);
