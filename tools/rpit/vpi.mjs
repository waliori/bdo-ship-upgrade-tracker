// How much seeing the board first could be worth: the value of perfect
// information.
//
//   node tools/rpit/vpi.mjs [--filter T] [--exclude T] [--every 24] [--boards 20] [--solver greedy] [--time 500] [--out FILE]
//
// A payout is drawn once for an island and a board, and read on arrival.
// A planner that has not seen the board plans for the worst (robust); one
// that re-plans as the islands reveal themselves can do better; and one
// that knew every island's payout before casting off can do no worse than
// either. That last is the ceiling on any method that plans with the
// randomness: for each board, the board written into the instance (every
// island's payout fixed at what it drew) and solved, the plan scored on
// that same board. The gap between the ceiling and the robust plan on the
// same boards is all there is for Phase 3 to take.
//
// The boards are the simulator's own: board k of an instance is the same
// draw here as in every bench, so the rows line up with evaluate().

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { rng, simulate, planPolicy } from './simulate.mjs';
import { parseArgs } from './export.mjs';
import { globFiles } from './bench.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Board k of `I` as evaluate() draws it: station id -> payout. */
export function boardOf(I, seed, k) {
	const draw = rng(seed * 1000003 + k);
	return new Map(I.stations.map(s => [s.id, draw() < s.p ? s.ymax : s.ymin]));
}

/** `I` with every island's payout fixed at the board's. */
export function seen(I, board) {
	return { ...I, name: `${I.name}-seen`, stations: I.stations.map(s => ({ ...s, ymin: board.get(s.id), ymax: board.get(s.id), p: 1 })) };
}

export async function vpiOf(I, { boards = 20, seed = 1, solver = 'greedy', timeMs = 500, robustPlan = null } = {}) {
	const mod = await import(pathToFileURL(path.join(HERE, 'solvers', `${solver}.mjs`)).href);
	const plan = robustPlan || mod.solve(I, { timeMs, seed }).plan;
	let Rr = 0, Tr = 0, Rc = 0, Tc = 0;
	for (let k = 0; k < boards; k++) {
		// The robust plan on this board -- the simulator draws the same board.
		const r = simulate(I, planPolicy(plan), { mode: 'sample', seed: seed * 1000003 + k });
		Rr += r.R; Tr += r.T;
		// The plan made for this board, knowing it.
		const S = seen(I, boardOf(I, seed, k));
		const c = simulate(S, planPolicy(mod.solve(S, { timeMs, seed }).plan), { mode: 'robust' });
		Rc += c.R; Tc += c.T;
	}
	const robust = Tr > 0 ? Rr / Tr : 0, clairvoyant = Tc > 0 ? Rc / Tc : 0;
	return { instance: I.name, pace: I.rules.pace, robust, clairvoyant, gain: robust > 0 ? (clairvoyant - robust) / robust : 0 };
}

async function main() {
	const o = parseArgs(process.argv.slice(2));
	let files = globFiles(o.instances || path.join(HERE, 'instances', '*.json'));
	if (o.filter) files = files.filter(f => f.includes(o.filter));
	if (o.exclude) files = files.filter(f => !f.includes(o.exclude));
	if (o.every) files = files.filter((_, i) => i % Number(o.every) === 0);
	const rows = [];
	for (const f of files) {
		const I = JSON.parse(readFileSync(f, 'utf8'));
		const r = await vpiOf(I, { boards: Number(o.boards || 20), solver: o.solver || 'greedy', timeMs: Number(o.time || 500) });
		rows.push(r);
		console.error(`${r.instance.padEnd(40)} robust ${(r.robust / 1e6).toFixed(1)}M  seen ${(r.clairvoyant / 1e6).toFixed(1)}M  ${(r.gain * 100).toFixed(1)}%`);
	}
	const mean = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
	const out = ['instance,pace,robust,clairvoyant,gain', ...rows.map(r => `${r.instance},${r.pace},${Math.round(r.robust)},${Math.round(r.clairvoyant)},${r.gain.toFixed(5)}`)].join('\n') + '\n';
	if (o.out) writeFileSync(o.out, out);
	const g = rows.map(r => r.gain).sort((a, b) => a - b);
	console.error(`\n${rows.length} instances: mean gain ${(mean(g) * 100).toFixed(2)}%, median ${(g[Math.floor(g.length / 2)] * 100).toFixed(2)}%, max ${(g.at(-1) * 100).toFixed(2)}%, min ${(g[0] * 100).toFixed(2)}%`);
	for (const pace of ['fast', 'steady', 'full']) console.error(`  ${pace}: ${(mean(rows.filter(r => r.pace === pace).map(r => r.gain)) * 100).toFixed(2)}%`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
