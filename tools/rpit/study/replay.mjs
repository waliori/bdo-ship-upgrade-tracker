// A study's day solved again: the planner aboard, or another, run on the
// instance exactly as the app's sailor had it, beside what the app found.
//   node tools/rpit/study/replay.mjs <study.json> [--solver <module>] [--steps N] [--seed N]
// The default solver is the app's own search as newPropose runs it (two
// rounds of the price of time, then the search from the best); a module
// given must export solve(I, { timeMs, seed }) → { plan, info }, as the
// bench's solvers do (tools/rpit/solvers/).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chainsOf, robustEval } from '../solvers/common.mjs';
import { search } from '../solvers/alns.mjs';
import { maximiseRate } from '../../../js/rpit/ratio.js';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
if (!file) { console.error('usage: replay.mjs <study.json> [--solver <module>] [--steps N] [--seed N]'); process.exit(1); }
const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
const st = rec.body || rec;
if (!st.instance) { console.error(`${rec.id || file}: no instance (planner ${st.planner})`); process.exit(1); }
const I = st.instance;
const seed = Number(opt('--seed', st.seed || 1));
const steps = Number(opt('--steps', 40));
const solver = opt('--solver', null);
const t0 = performance.now();
let plan;
if (solver) {
	const m = await import(pathToFileURL(solver).href);
	plan = m.solve(I, { timeMs: Infinity, seed, most: steps }).plan;
} else {
	const pool = chainsOf(I);
	const rate = maximiseRate(I, (inst, o) => search(inst, { ...o, timeMs: Infinity, most: Math.ceil(steps / 4), pool }), { timeMs: Infinity, rounds: 2, seed });
	plan = search(I, { mu: 0, timeMs: Infinity, most: steps, seed, pool, warm: { seq: rate.seq, calls: rate.calls } }).plan;
}
const ms = performance.now() - t0;
const app = st.plan ? robustEval(I, st.plan) : null;
const here = robustEval(I, plan);
const M = x => (x / 1e6).toFixed(0) + 'M';
console.log(`${rec.id || file} layout ${rec.layout ?? '?'} ${st.planner}${rec.release ? ' ' + rec.release : ''}: app ${app ? `${M(app.R)} in ${app.T.toFixed(2)}h` : '-'} (said ${M(st.R)}, ${st.ms ? st.ms.toFixed(0) + ' ms' : ''}) | replay ${solver || 'alns'} ${M(here.R)} in ${here.T.toFixed(2)}h, ${ms.toFixed(0)} ms`);
if (rec.sailed) console.log(`  sailed: ${M(rec.sailed.silver - (rec.sailed.spent || 0))} net, ${rec.sailed.done}/${rec.sailed.all} stops, ${rec.sailed.trades} trades`);
