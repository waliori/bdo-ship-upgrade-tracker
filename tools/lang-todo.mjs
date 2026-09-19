// What each language still owes, and the work list to go and get it.
//
// The catalogue moves whenever the app gains a sentence, so a
// translation job cannot be described as "entries 900 to 1300" -- that
// means something different after every merge. It has to be described
// as the sentences themselves.
//
// So this reads js/lang/en.json, subtracts what a pack already carries,
// and writes the remainder out in batches of roughly even weight. Each
// batch is a JSON file of English sentences: hand one to a translator
// (or an agent), get back the same keys with translated values, and
// tools/build-lang.mjs will check it.
//
//   node tools/lang-todo.mjs                  # what every language owes
//   node tools/lang-todo.mjs fr               # and for one of them
//   node tools/lang-todo.mjs fr --out DIR     # write the batches to DIR
//   node tools/lang-todo.mjs fr --out DIR --batch 20000
//
// A pack that carries a sentence the catalogue no longer has is carrying
// dead weight -- the app cannot ask for it -- so those are reported too,
// and dropped when --prune is given.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG_DIR = path.join(ROOT, 'js', 'lang');

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
	const i = argv.indexOf(`--${name}`);
	return i === -1 ? fallback : argv[i + 1];
};
const OUT = flag('out');
const BATCH = Number(flag('batch', 20000));
const PRUNE = argv.includes('--prune');
const wanted = argv.filter(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--out' && argv[argv.indexOf(a) - 1] !== '--batch');

const catalogue = JSON.parse(fs.readFileSync(path.join(LANG_DIR, 'en.json'), 'utf8'));
const keys = Object.keys(catalogue);

/** The interface packs that exist, English excepted. */
const packs = fs.readdirSync(LANG_DIR)
	.filter(f => f.endsWith('.json') && f !== 'en.json' && !f.startsWith('names.'))
	.map(f => f.replace(/\.json$/, ''));

const codes = wanted.length ? wanted : packs;

for (const code of codes) {
	const file = path.join(LANG_DIR, `${code}.json`);
	const pack = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
	const missing = keys.filter(k => !(k in pack));
	const stale = Object.keys(pack).filter(k => !(k in catalogue));
	const done = keys.length - missing.length;
	const pct = keys.length ? Math.round((done / keys.length) * 100) : 100;

	console.log(`${code.padEnd(5)} ${String(pct).padStart(3)}%  ${done}/${keys.length}`
		+ `${missing.length ? `  ·  ${missing.length} to translate` : ''}`
		+ `${stale.length ? `  ·  ${stale.length} the app no longer says` : ''}`);

	if (PRUNE && stale.length) {
		for (const k of stale) delete pack[k];
		const sorted = Object.fromEntries(Object.keys(pack).sort().map(k => [k, pack[k]]));
		fs.writeFileSync(file, `${JSON.stringify(sorted, null, '\t')}\n`);
		console.log(`      pruned ${stale.length} from js/lang/${code}.json`);
	}

	if (!OUT || !missing.length) continue;

	// Batches of roughly even weight rather than even count: forty
	// release-note paragraphs and four hundred button labels are the same
	// amount of work, and it is the characters that say so.
	fs.mkdirSync(OUT, { recursive: true });
	const batches = [];
	let batch = [];
	let weight = 0;
	for (const k of missing) {
		batch.push(k);
		weight += k.length + 8;
		if (weight >= BATCH) { batches.push(batch); batch = []; weight = 0; }
	}
	if (batch.length) {
		// A runt at the end is a whole translator's overhead for a handful
		// of sentences; fold it into the batch before it.
		if (batches.length && batch.length * 8 < BATCH / 4) batches[batches.length - 1].push(...batch);
		else batches.push(batch);
	}
	batches.forEach((b, i) => {
		const name = `${code}.todo.${String(i).padStart(2, '0')}.json`;
		fs.writeFileSync(path.join(OUT, name), `${JSON.stringify(Object.fromEntries(b.map(k => [k, k])), null, '\t')}\n`);
	});
	console.log(`      ${batches.length} batch(es) written to ${OUT}`);
}
