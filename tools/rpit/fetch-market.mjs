// A snapshot of what the land goods cost, for the bench.
//
// The app prices a land good from the Central Market in the browser, and
// in Node that store is empty: every instance written without this had
// the goods a chain starts from for nothing, in any number. A solver
// free to buy a thousand of anything for nothing is not solving the
// sailor's problem, so the bench reads its prices and listed counts from
// a snapshot taken once, through the same relay the server uses, and
// kept beside the tools as data -- the same day for every solver, and
// the same day again when the bench is run next month.
//
//   node tools/rpit/fetch-market.mjs [--region na] [--out tools/rpit/data/market-na.json]

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pricesFor } from '../../server/market.js';
import { landGoods } from '../../js/land_goods.js';
import { FIXED } from '../../js/land-cost.js';
import { parseArgs } from './export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const o = parseArgs(process.argv.slice(2));
const region = o.region || 'na';
const out = o.out || path.join(HERE, 'data', `market-${region}.json`);

const ids = Object.entries(landGoods).filter(([, id]) => id > 0);
const { prices, failed, fellBack } = await pricesFor(region, ids.map(([, id]) => id), { deadline: 120000 });
const goods = {};
const missing = [];
for (const [name, id] of ids) {
	const p = prices[id];
	if (p && p.price > 0) goods[name] = { price: p.price, stock: p.stale ? null : p.stock, stale: !!p.stale };
	else if (!FIXED[name]) missing.push(name);
}
// A currency good has a value of its own and no listing to run out of.
for (const [name, v] of Object.entries(FIXED)) goods[name] = { price: v, stock: null, fixed: true };
const snap = { region, at: new Date().toISOString(), source: 'api.arsha.io via server/market.js', failed, fellBack, missing, goods };
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snap, null, 1) + '\n');
console.error(`${Object.keys(goods).length} priced, ${missing.length} missing, ${failed} failed${fellBack ? ' (fallback used)' : ''} -> ${out}`);
