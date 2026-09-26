// How often the fleet's islands paid the high yield, from recorded runs.
//
// A sailor who ticks a stop taps what the island paid, and the save keeps
// it as `ratios`: { "npcId|give|item": { "2": attempts, "3": attempts } }.
// This sums those over every save and writes the totals only -- no user,
// no save, nothing that says who sailed what -- so the bench can set each
// island's p from what was seen rather than from a guess.
//
// A payout is drawn once for an island and a board, so the honest unit
// is a stop, not an attempt; the save counts attempts, so an island
// worked ten times on one board weighs ten. The estimate is weighted by
// attempts, and says so.
//
// Run where the server's database is reachable. The image ships no tools
// and its /app is read-only to the server's user, so the script goes in
// on stdin with the import pointed at the image's own copy -- nothing is
// written inside the container:
//   sed "s#'../../server/db.js'#'/app/server/db.js'#" tools/rpit/fleet-ratios.mjs \
//     | docker compose exec -T -w /app bdo-tracker node --input-type=module - > tools/rpit/data/fleet-ratios.json
// A handful of saves is one sailor's record, not a fleet's: keep the
// output only when there are many.

import { db } from '../../server/db.js';

// The save is the whole of a sailor's store; the ratios sit wherever the
// profile keeps them, so they are found by their shape, not their path.
function* ratiosIn(v, depth = 0) {
	if (!v || typeof v !== 'object' || depth > 6) return;
	if (v.ratios && typeof v.ratios === 'object' && !Array.isArray(v.ratios)) yield v.ratios;
	for (const x of Object.values(v)) if (x && typeof x === 'object') yield* ratiosIn(x, depth + 1);
}

const rows = (await db().execute('SELECT payload FROM saves')).rows;
const totals = {};
let saves = 0, withRatios = 0;
for (const { payload } of rows) {
	saves++;
	let data;
	try { data = JSON.parse(payload); } catch { continue; }
	let any = false;
	for (const ratios of ratiosIn(data)) {
		for (const [key, counts] of Object.entries(ratios)) {
			if (typeof key !== 'string' || key.split('|').length !== 3 || !counts || typeof counts !== 'object') continue;
			for (const [n, c] of Object.entries(counts)) {
				const v = Math.floor(Number(c));
				if (!/^\d{1,2}$/.test(n) || !(v > 0)) continue;
				totals[key] = totals[key] || {};
				totals[key][n] = (totals[key][n] || 0) + v;
				any = true;
			}
		}
	}
	if (any) withRatios++;
}
process.stdout.write(JSON.stringify({ at: new Date().toISOString(), saves, withRatios, unit: 'attempts', exchanges: totals }, null, 1) + '\n');
process.exit(0);
