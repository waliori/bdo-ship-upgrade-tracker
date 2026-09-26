// Writes RPIT instances from the app's own data.
//
//   node tools/rpit/export.mjs --layout 25 --start Velia --hold 20000 --pace full
//   node tools/rpit/export.mjs --all --hold 20000 --pace full
//
// Options: --layout, --start, --home (defaults to the start when it is a
// depot, else Velia), --end, --hold, --pace, --parley, --per-trade,
// --sell, --p, --stock JSON, --storage JSON or auto (a stocked home
// storage, see autoStorage), --floors JSON (per level),
// --drop-policy, --speed, --out FILE (one case) or --dir DIR (default
// tools/rpit/instances). --all writes every layout from both Velia and
// Iliya Island, and several --hold / --pace values may be given as
// comma lists. An instance that fails validation is not written.

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { setupOf, combos, DEPOTS, DEFAULT_ARGS } from './setup.mjs';
import { validateInstance } from './schema.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The command line as { key: value }; a flag without a value is true. */
export function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a.startsWith('--')) continue;
		const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) out[key] = true;
		else { out[key] = next; i++; }
	}
	return out;
}

const list = v => String(v).split(',').map(s => s.trim()).filter(Boolean);

/** The cases a command line asks for, as setupOf arguments. */
export function casesOf(o) {
	const base = {};
	for (const k of ['parley', 'perTrade', 'sell', 'p', 'speed']) if (o[k] !== undefined) base[k] = Number(o[k]);
	for (const k of ['stock', 'storage', 'floors']) if (o[k] !== undefined) base[k] = o[k] === 'auto' ? 'auto' : JSON.parse(o[k]);
	if (o.dropPolicy) base.dropPolicy = o.dropPolicy;
	if (o.end) base.end = o.end;
	const layouts = o.all ? combos.map(c => c.id) : list(o.layout ?? DEFAULT_ARGS.layout);
	const starts = o.all && !o.start ? ['Velia', 'Iliya Island'] : list(o.start ?? DEFAULT_ARGS.start);
	const holds = list(o.hold ?? DEFAULT_ARGS.hold).map(Number);
	const paces = list(o.pace ?? DEFAULT_ARGS.pace);
	const out = [];
	for (const layout of layouts) for (const start of starts) for (const hold of holds) for (const pace of paces) {
		const home = o.home || (DEPOTS.includes(start) ? start : 'Velia');
		out.push({ ...base, layout, start, home, hold, pace });
	}
	return out;
}

function main() {
	const o = parseArgs(process.argv.slice(2));
	const dir = o.dir || path.join(HERE, 'instances');
	const cases = casesOf(o);
	if (o.out && cases.length > 1) throw new Error('--out names one file; use --dir for several cases');
	let written = 0, skipped = 0;
	for (const args of cases) {
		const { instance } = setupOf(args);
		// A board with next to nothing on it is no test of a planner.
		if (instance.stations.length < 3) { skipped++; continue; }
		const errors = validateInstance(instance);
		if (errors.length) { console.error(`${instance.name}: not written\n  ${errors.join('\n  ')}`); skipped++; continue; }
		const file = o.out || path.join(dir, `${instance.name}.json`);
		mkdirSync(path.dirname(file), { recursive: true });
		writeFileSync(file, JSON.stringify(instance));
		written++;
	}
	console.error(`${written} written, ${skipped} skipped`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
