// Tiny instances cut from real boards, small enough to solve exactly.
//
//   node tools/rpit/tiny.mjs [--chains 2] [--rungs 3] [--dir tools/rpit/instances-tiny]
//
// From each instance in tools/rpit/instances, the `chains` climbs of at
// most `rungs` islands that start nearest the harbour and share no
// island; their islands and no others, the home depot and the one
// nearest the islands, and the distances between those alone. An exact
// search can try every way of sailing that, and so tell how far a
// heuristic's plan is from the best there is.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chainsOf, indexOf } from './solvers/common.mjs';
import { validateInstance } from './schema.mjs';
import { parseArgs } from './export.mjs';
import { globFiles } from './bench.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The tiny cut of `I`, or null when it has fewer than `want` climbs. */
export function tinyOf(I, { chains: want = 2, rungs: most = 3 } = {}) {
	const { dist, station } = indexOf(I);
	const pool = chainsOf(I).filter(c => c.rungs.length <= most)
		.sort((a, b) => dist('start', a.rungs[0]) - dist('start', b.rungs[0]) || a.rungs.length - b.rungs.length);
	const picked = [];
	const used = new Set();
	for (const c of pool) {
		if (c.rungs.some(id => used.has(id))) continue;
		picked.push(c);
		for (const id of c.rungs) used.add(id);
		if (picked.length === want) break;
	}
	if (picked.length < want) return null;
	const stations = I.stations.filter(s => used.has(s.id));
	const goods = Object.fromEntries(Object.entries(I.goods).filter(([g]) => stations.some(s => s.in === g || s.out === g)));
	const home = I.rules.home;
	const other = I.depots.filter(d => d.id !== home)
		.sort((a, b) => Math.min(...stations.map(s => dist(a.id, s.id))) - Math.min(...stations.map(s => dist(b.id, s.id))))[0];
	const keep = new Set([home, other.id, I.rules.end]);
	const depots = I.depots.filter(d => keep.has(d.id)).map(d => ({ ...d, storage: Object.fromEntries(Object.entries(d.storage).filter(([g]) => g in goods)) }));
	const points = ['start', ...depots.map(d => d.id), ...stations.map(s => s.id)];
	const matrix = points.map(a => points.map(b => (a === b ? 0 : dist(a, b))));
	const initial = { hold: Object.fromEntries(Object.entries(I.initial.hold).filter(([g]) => g in goods)), floors: Object.fromEntries(Object.entries(I.initial.floors).filter(([g]) => g in goods)) };
	void station;
	return {
		...I, name: `${I.name}-tiny${want}x${most}`, goods, stations, depots, travel: { points, matrix }, initial,
		meta: { ...I.meta, tiny: { from: I.name, chains: picked.map(c => c.rungs) } }
	};
}

function main() {
	const o = parseArgs(process.argv.slice(2));
	const dir = o.dir || path.join(HERE, 'instances-tiny');
	mkdirSync(dir, { recursive: true });
	let written = 0;
	for (const f of globFiles(o.instances || path.join(HERE, 'instances', '*.json'))) {
		const I = JSON.parse(readFileSync(f, 'utf8'));
		const T = tinyOf(I, { chains: Number(o.chains || 2), rungs: Number(o.rungs || 3) });
		if (!T) continue;
		const errors = validateInstance(T);
		if (errors.length) { console.error(`${T.name}: ${errors.join('; ')}`); continue; }
		writeFileSync(path.join(dir, `${T.name}.json`), JSON.stringify(T));
		written++;
	}
	console.error(`${written} tiny instances in ${dir}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
