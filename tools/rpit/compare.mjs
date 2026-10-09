// The trip planner against the ALNS pipeline the app runs (two rounds of
// the price of time at a quarter of the steps, then the session at
// forty), on the same instances, at the same sessions:
//
//   node tools/rpit/compare.mjs [--instances 'tools/rpit/instances/*.json'] [--sessions 2,4,6]
//        [--every K] [--offset J] [--filter TEXT] [--limit N] [--out tools/rpit/results/trips-vs-alns.csv]
//
// One row per instance and session: silver, hours under way, time taken,
// the bound and the gap, both planners judged by the one simulator.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { search } from '../../js/rpit/alns.js';
import { maximiseRate } from '../../js/rpit/ratio.js';
import { chainsOf } from '../../js/rpit/common.js';
import { solve } from '../../js/rpit/method.js';
import { simulate, planPolicy } from '../../js/rpit/simulate.js';
import { parseArgs } from './export.mjs';
import { globFiles } from './bench.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = 40;

function alns(I, session) {
	I.rules.hours = session;
	const pool = chainsOf(I);
	const t0 = performance.now();
	const rate = maximiseRate(I, (inst, o) => search(inst, { ...o, timeMs: Infinity, most: Math.ceil(WORK / 4), pool }), { timeMs: Infinity, rounds: 2, seed: 1 });
	const best = search(I, { mu: 0, timeMs: Infinity, most: WORK, seed: 1, pool, warm: { seq: rate.seq, calls: rate.calls } });
	return { plan: best.plan, ms: performance.now() - t0 };
}

export const COLUMNS = ['instance', 'session', 'alnsR', 'alnsUnderWay', 'alnsMs', 'tripsR', 'tripsUnderWay', 'tripsMs', 'bound', 'gap', 'exact', 'trips', 'catalogue', 'waste', 'starved'];

const o = parseArgs(process.argv.slice(2));
let files = globFiles(o.instances || path.join(HERE, 'instances', '*.json'));
if (o.filter) files = files.filter(f => f.includes(o.filter));
if (o.every) files = files.filter((_, i) => i % Number(o.every) === Number(o.offset || 0));
if (o.limit) files = files.slice(0, Number(o.limit));
const sessions = String(o.sessions || '2,4,6').split(',').map(Number);
const out = o.out || path.join(HERE, 'results', 'trips-vs-alns.csv');
mkdirSync(path.dirname(out), { recursive: true });
const rows = [COLUMNS.join(',')];
for (const f of files) {
	const I = JSON.parse(readFileSync(f, 'utf8'));
	for (const session of sessions) {
		const a = alns(I, session);
		const ar = simulate(I, planPolicy(a.plan), { mode: 'robust' });
		I.rules.hours = session;
		const t0 = performance.now();
		const m = solve(I, { session });
		const ms = performance.now() - t0;
		const mr = simulate(I, planPolicy(m.plan), { mode: 'robust' });
		rows.push([I.name, session, Math.round(ar.R), ar.underWay.toFixed(3), Math.round(a.ms), Math.round(mr.R), mr.underWay.toFixed(3), Math.round(ms), Math.round(m.info.bound), m.info.gap.toFixed(4), m.info.exact ? 1 : 0, m.info.trips.length, m.info.catalogue, mr.pointless.storedTwice + mr.pointless.loadThenDrop, mr.deviations.starved || 0].join(','));
		console.log(rows[rows.length - 1]);
	}
}
writeFileSync(out, rows.join('\n') + '\n');
