// The simulator on the command line; the simulator itself is
// js/rpit/simulate.js, shared with the Barter tab.
//
//   node tools/rpit/simulate.mjs instance.json plan.json [--scenarios 100] [--seed 1] [--mode sample] [--trace]

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluate, planPolicy, traceLine } from '../../js/rpit/simulate.js';

export * from '../../js/rpit/simulate.js';

function main() {
	const argv = process.argv.slice(2);
	const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
	const valued = new Set(['--scenarios', '--seed', '--mode']);
	const [instFile, planFile] = argv.filter((a, i) => !a.startsWith('--') && !valued.has(argv[i - 1]));
	if (!instFile || !planFile) { console.error('usage: simulate.mjs instance.json plan.json [--scenarios N] [--seed S] [--mode sample|expected|robust] [--trace]'); process.exit(2); }
	const I = JSON.parse(readFileSync(instFile, 'utf8'));
	const plan = JSON.parse(readFileSync(planFile, 'utf8'));
	const r = evaluate(I, planPolicy(plan), { mode: opt('mode', 'sample'), scenarios: Number(opt('scenarios', 100)), seed: Number(opt('seed', 1)) });
	const { first, ...result } = r;
	console.log(JSON.stringify(result, null, 2));
	if (argv.includes('--trace')) for (const e of first.log) console.log(traceLine(e));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
