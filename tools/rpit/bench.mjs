// Runs solvers over instances and writes one CSV row per pair.
//
//   node tools/rpit/bench.mjs --solvers level0[,greedy,…] \
//        [--instances 'tools/rpit/instances/*.json'] [--scenarios 100] [--seed 1] \
//        [--time 10000] [--out tools/rpit/results/bench.csv] [--limit N] [--filter TEXT] [--exclude TEXT] [--every K]
//
// Each solver is a module in solvers/ exporting solve(instance, { setup,
// timeMs, seed }) → { plan | policy, info }. The time a solver takes is
// measured here, round solve() only; every plan is then scored by the
// one simulator, so every solver is judged the same way. Beside the CSV,
// each plan is written to <out>.plans/<instance>.<solver>.json so that
// any row can be looked at again.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { setupOf } from './setup.mjs';
import { evaluate, planPolicy } from './simulate.mjs';
import { validatePlan } from './schema.mjs';
import { parseArgs } from './export.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const COLUMNS = ['instance', 'pace', 'solver', 'computeMs', 'meanR', 'meanT', 'rateOfMeans', 'meanRate', 'stdRate', 'minRate',
	'robustR', 'robustT', 'robustRate', 'P', 'trades', 'calls', 'distance', 'carried',
	'refusedOverDeal', 'clampedAttempts', 'refusedDrop', 'refusedSell', 'refusedLoad', 'revisited', 'stuck',
	'loadThenDrop', 'idleCalls', 'consecutiveCalls', 'emptyVisits', 'planErrors'];

/** The files a simple glob names: a directory and a `*` in the last part. */
export function globFiles(pattern) {
	const dir = path.dirname(pattern), base = path.basename(pattern);
	const re = new RegExp(`^${base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
	return readdirSync(dir).filter(f => re.test(f)).sort().map(f => path.join(dir, f));
}

const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };

/** One instance, one solver: the CSV row and the plan. */
export async function benchOne(instance, solverName, { scenarios = 100, seed = 1, timeMs = 10000, setup = null } = {}) {
	const mod = await import(pathToFileURL(path.join(HERE, 'solvers', `${solverName}.mjs`)).href);
	const cas = setup || (solverName === 'level0' ? setupOf(instance.meta.args) : null);
	const t0 = performance.now();
	const out = mod.solve(instance, { setup: cas, timeMs, seed });
	const computeMs = performance.now() - t0;
	const policy = out.policy || planPolicy(out.plan);
	const errors = out.plan ? validatePlan(out.plan, instance) : [];
	const r = evaluate(instance, policy, { scenarios, seed, solver: solverName });
	const row = {
		instance: instance.name, pace: instance.rules.pace, solver: solverName, computeMs: round(computeMs),
		meanR: round(r.mean.R), meanT: round(r.mean.T, 4), rateOfMeans: round(r.rateOfMeans), meanRate: round(r.mean.rate), stdRate: round(r.std.rate), minRate: round(r.min.rate),
		robustR: round(r.robust.R), robustT: round(r.robust.T, 4), robustRate: round(r.robust.rate),
		P: round(r.mean.P), trades: round(r.mean.trades, 2), calls: round(r.mean.calls, 2), distance: round(r.mean.distance), carried: round(r.mean.carried),
		...Object.fromEntries(Object.entries(r.deviations).map(([k, v]) => [k, round(v, 2)])),
		...Object.fromEntries(Object.entries(r.pointless).map(([k, v]) => [k, round(v, 2)])),
		planErrors: errors.length
	};
	return { row, plan: out.plan || null, info: out.info || null, errors };
}

const csvCell = v => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v ?? ''));

async function main() {
	const o = parseArgs(process.argv.slice(2));
	const solvers = String(o.solvers || 'level0').split(',').map(s => s.trim()).filter(Boolean);
	let files = globFiles(o.instances || path.join(HERE, 'instances', '*.json'));
	if (o.filter) files = files.filter(f => f.includes(o.filter));
	if (o.exclude) files = files.filter(f => !f.includes(o.exclude));
	if (o.every) files = files.filter((_, i) => i % Number(o.every) === 0);
	if (o.limit) files = files.slice(0, Number(o.limit));
	const out = o.out || path.join(HERE, 'results', `${solvers.join('+')}.csv`);
	const plans = `${out}.plans`;
	mkdirSync(plans, { recursive: true });
	const opts = { scenarios: Number(o.scenarios || 100), seed: Number(o.seed || 1), timeMs: Number(o.time || 10000) };
	const lines = [COLUMNS.join(',')];
	const t0 = Date.now();
	for (const [n, file] of files.entries()) {
		const instance = JSON.parse(readFileSync(file, 'utf8'));
		const setup = solvers.includes('level0') && !instance.meta.tiny ? setupOf(instance.meta.args) : null;
		for (const s of solvers) {
			const { row, plan, info, errors } = await benchOne(instance, s, { ...opts, setup });
			lines.push(COLUMNS.map(c => csvCell(row[c])).join(','));
			writeFileSync(path.join(plans, `${instance.name}.${s}.json`), JSON.stringify({ plan, info, errors }, null, 1));
		}
		if ((n + 1) % 20 === 0 || n + 1 === files.length) console.error(`${n + 1} of ${files.length} instances, ${Math.round((Date.now() - t0) / 1000)} s`);
		writeFileSync(out, lines.join('\n') + '\n');
	}
	console.error(`wrote ${out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
