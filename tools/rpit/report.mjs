// Turns bench CSVs into a markdown report.
//
//   node tools/rpit/report.mjs tools/rpit/results/*.csv [--out tools/rpit/results/report.md]
//
// One table for every pace and one for all of them: per solver, how many
// instances, the mean and median silver an hour (rate of means, the long
// run's figure), the mean gap to the best solver on each instance, how
// often it was that best, its mean compute time, and the totals of what
// it asked for and could not do, and of what it did for nothing.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A CSV as a list of objects; numbers read as numbers. */
export function readCsv(text) {
	const rows = [];
	const lines = text.split('\n').filter(Boolean);
	const split = line => {
		const out = []; let cur = '', q = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
			else if (c === '"') q = true;
			else if (c === ',') { out.push(cur); cur = ''; }
			else cur += c;
		}
		out.push(cur);
		return out;
	};
	const head = split(lines[0]);
	for (const line of lines.slice(1)) {
		const cells = split(line);
		rows.push(Object.fromEntries(head.map((h, i) => [h, cells[i] !== '' && !Number.isNaN(Number(cells[i])) ? Number(cells[i]) : cells[i]])));
	}
	return rows;
}

const median = xs => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const mean = xs => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const M = v => `${(v / 1e6).toFixed(1)}M`;

/** The report's table for a set of rows, as markdown lines. */
export function table(rows) {
	const best = new Map();
	for (const r of rows) best.set(r.instance, Math.max(best.get(r.instance) ?? -Infinity, r.rateOfMeans));
	const solvers = [...new Set(rows.map(r => r.solver))];
	const out = ['| solver | n | mean /h | median /h | mean gap | wins | mean ms | over-deal | clamped | stuck | load→drop | idle calls | calls in a row | empty visits |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
	for (const s of solvers) {
		const mine = rows.filter(r => r.solver === s);
		const gaps = mine.map(r => { const b = best.get(r.instance); return b > 0 ? (b - r.rateOfMeans) / b : 0; });
		const wins = mine.filter(r => r.rateOfMeans >= best.get(r.instance) - 1e-6).length;
		const tot = k => mine.reduce((a, r) => a + (Number(r[k]) || 0), 0).toFixed(1);
		out.push(`| ${s} | ${mine.length} | ${M(mean(mine.map(r => r.rateOfMeans)))} | ${M(median(mine.map(r => r.rateOfMeans)))} | ${(mean(gaps) * 100).toFixed(2)}% | ${wins} | ${Math.round(mean(mine.map(r => r.computeMs)))} | ${tot('refusedOverDeal')} | ${tot('clampedAttempts')} | ${tot('stuck')} | ${tot('loadThenDrop')} | ${tot('idleCalls')} | ${tot('consecutiveCalls')} | ${tot('emptyVisits')} |`);
	}
	return out;
}

function main() {
	const argv = process.argv.slice(2);
	const i = argv.indexOf('--out');
	const outFile = i >= 0 ? argv[i + 1] : null;
	const files = argv.filter((a, k) => !a.startsWith('--') && argv[k - 1] !== '--out');
	const rows = files.flatMap(f => readCsv(readFileSync(f, 'utf8')));
	const lines = [`# RPIT bench report`, '', `${rows.length} rows from ${files.map(f => path.basename(f)).join(', ')}`, '', '## All paces', '', ...table(rows)];
	for (const pace of [...new Set(rows.map(r => r.pace))]) lines.push('', `## Pace: ${pace}`, '', ...table(rows.filter(r => r.pace === pace)));
	const text = lines.join('\n') + '\n';
	if (outFile) writeFileSync(outFile, text);
	process.stdout.write(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
