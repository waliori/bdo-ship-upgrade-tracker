// Records one Market answer for the tests to plan against.
//
//   npm run record:market              records na and eu
//   npm run record:market -- na,eu,kr  records the regions you name
//
// Every test file that starts the server sets MARKET_FIXTURE to
// test/fixtures/market.json, so its barter runs are priced and stocked
// from this recording rather than the day's Market (see server/market.js).
// Re-record when:
//   - test/market.test.mjs says an id is missing -- the page started
//     buying something new at the Market (KNOWN_IDS grew);
//   - a test is meant to show prices nearer today's.
// Re-recording moves the prices, so a ui test whose expected numbers
// follow the Market may need those numbers updated in the same commit.
//
// Asks through the relay's own pricesFor(), so it splits and retries the
// way the server does, and refuses to write a recording with a gap: a
// stale or missing price would make the tests plan against a hole.

import fs from 'node:fs';
import { pricesFor, KNOWN_IDS, REGIONS } from '../server/market.js';

const OUT = new URL('../test/fixtures/market.json', import.meta.url);
const regions = (process.argv[2] || 'na,eu').split(',').map(s => s.trim()).filter(Boolean);
const ids = [...KNOWN_IDS].sort((a, b) => a - b);

const recorded = {};
for (const region of regions) {
	if (!REGIONS.includes(region)) {
		console.error(`${region} is not a region the Market has.`);
		process.exit(1);
	}
	const { prices } = await pricesFor(region, ids);
	const missing = ids.filter(id => !prices[id] || prices[id].stale);
	if (missing.length) {
		console.error(`${region}: no fresh price for ${missing.length} of ${ids.length} (${missing.join(', ')}). Nothing written; try again later.`);
		process.exit(1);
	}
	recorded[region] = Object.fromEntries(ids.map(id => {
		const { price, base, stock, soldAt } = prices[id];
		return [id, { price, base, stock, soldAt }];
	}));
	console.log(`${region}: ${ids.length} prices`);
}

fs.writeFileSync(OUT, JSON.stringify({
	recorded: new Date().toISOString().slice(0, 10),
	source: 'api.arsha.io/v2',
	regions: recorded
}, null, '\t') + '\n');
console.log(`Wrote ${OUT.pathname}`);
// The upstream's sockets would keep the process alive a while longer.
process.exit(0);
