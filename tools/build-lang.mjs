// The English catalogue, read off the code itself; and a check on every
// translation that claims to answer it.
//
// The app's own sentences have no invented keys: the English string in
// the source IS the key (see js/i18n.js). So there is nothing to keep
// in step by hand -- this walks the modules, collects every T() call,
// and writes what it found to js/lang/en.json. That file ships nothing:
// T() falls back to its own key, so an English screen never loads a
// pack. It exists to be handed to a translator, and to be diffed when
// the wording changes.
//
// Then it checks the packs that answer it, because the three ways a
// translation goes wrong are all mechanical:
//
//   * a key that is not in the catalogue -- a sentence that was
//     reworded, so the translation is now dead weight nobody sees;
//   * a key in the catalogue with no translation -- an English line on
//     a translated screen;
//   * a {placeholder} that does not survive the translation -- a number
//     that vanishes, or a {n} printed literally at a player.
//
//   node tools/build-lang.mjs             # write en.json, check the packs
//   node tools/build-lang.mjs --check     # check only; non-zero if a pack is broken
//   node tools/build-lang.mjs --stale     # also list translations of gone-away keys

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG_DIR = path.join(ROOT, 'js', 'lang');
const CHECK_ONLY = process.argv.includes('--check');
const SHOW_STALE = process.argv.includes('--stale');

/** Every module the app is made of, i18n.js itself excepted. */
function modules() {
	const out = [];
	const walk = dir => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) { walk(full); continue; }
			if (!entry.name.endsWith('.js')) continue;
			if (entry.name === 'i18n.js' || entry.name === 'driver.iife.js') continue;
			out.push(full);
		}
	};
	walk(path.join(ROOT, 'js'));
	return out.sort();
}

const KEYS = new Map();      // key -> [ 'file:line', ... ]
const BROKEN = [];           // T() calls that cannot reach a translator

const remember = (key, where) => {
	if (!KEYS.has(key)) KEYS.set(key, []);
	KEYS.get(key).push(where);
};

// A real parse rather than a scan, for two reasons. A key has to be a
// plain literal or no translator can ever be shown it -- and that is a
// question about the syntax, not about the characters. And a T() call
// that sits at module level rather than inside a function is a bug that
// costs nothing at load and everything at runtime: the module body runs
// before a language has been chosen, so the call resolves to English
// once and freezes there. Those belong in TT(), which hands the English
// back on purpose and is looked up again by said() when it is drawn.
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ClassBody']);

function collect(file) {
	const src = fs.readFileSync(file, 'utf8');
	const rel = path.relative(ROOT, file);
	let ast;
	try {
		ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
	} catch (err) {
		BROKEN.push(`${rel}: will not parse — ${err.message}`);
		return;
	}
	const visit = (node, insideFunction) => {
		if (!node || typeof node.type !== 'string') return;
		if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && (node.callee.name === 'T' || node.callee.name === 'TT')) {
			const marker = node.callee.name === 'TT';
			const arg = node.arguments[0];
			const literal = arg && ((arg.type === 'Literal' && typeof arg.value === 'string')
				|| (arg.type === 'TemplateLiteral' && arg.expressions.length === 0 && arg.quasis.length === 1));
			const where = `${rel}:${node.loc.start.line}`;
			if (!literal) {
				BROKEN.push(`${where}: ${node.callee.name}() with a key that is not a plain literal — use said() to look up a value`);
			} else if (!marker && !insideFunction) {
				BROKEN.push(`${where}: T() at module level — it would resolve before a language is chosen and freeze; use TT() here and said() where it is drawn`);
			} else {
				const text = arg.type === 'Literal' ? arg.value : arg.quasis[0].value.cooked;
				remember(text, where);
			}
		}
		const nowInside = insideFunction || FUNCTIONS.has(node.type);
		for (const key of Object.keys(node)) {
			if (key === 'loc' || key === 'start' || key === 'end') continue;
			const value = node[key];
			if (Array.isArray(value)) value.forEach(child => child && typeof child.type === 'string' && visit(child, nowInside));
			else if (value && typeof value.type === 'string') visit(value, nowInside);
		}
	};
	visit(ast, false);
}

for (const file of modules()) collect(file);

// The server refuses in sentences of its own -- "Someone else saved
// first.", "That save is too large to sync." -- and the client prints
// what arrived, through said(). They are the app's words as much as any
// other, so they belong in the same catalogue; there is no T() around
// them because they are written on the other side of the wire.
const SERVER_MESSAGE = /\b(?:error|message|reason)\s*:\s*'([^'\\]{6,300})'/g;
function serverFiles() {
	const dir = path.join(ROOT, 'server');
	const out = [path.join(ROOT, 'server.js')];
	if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).sort()) if (f.endsWith('.js')) out.push(path.join(dir, f));
	return out.filter(f => fs.existsSync(f));
}
for (const file of serverFiles()) {
	const src = fs.readFileSync(file, 'utf8');
	const rel = path.relative(ROOT, file);
	for (const m of src.matchAll(SERVER_MESSAGE)) {
		// Only real sentences: a code, a slug or a header name is not
		// something a player reads.
		if (!/^[A-Z].*[.?]$/.test(m[1])) continue;
		remember(m[1], `${rel}:${src.slice(0, m.index).split('\n').length}`);
	}
}

const catalogue = Object.fromEntries([...KEYS.keys()].sort().map(k => [k, k]));
const PLACEHOLDER = /\{(\w+)\}/g;
const holes = s => new Set(String(s).match(PLACEHOLDER) || []);
const sameHoles = (a, b) => {
	const x = holes(a); const y = holes(b);
	return x.size === y.size && [...x].every(h => y.has(h));
};

// A sentence is often drawn into an HTML attribute -- title="${T('...')}"
// -- where a straight double quote would close the attribute early and
// take the rest of the markup with it. Nineteen English keys carry one
// on purpose (a class= inside inline markup, or a quoted name), so the
// rule is not "none" but "no more than the English has": a translation
// may keep the quotes it was given and may not invent any. A language
// that needs quotation marks has its own, and they are better typography
// than a straight one anyway.
const quotes = s => (String(s).match(/"/g) || []).length;
const sameQuotes = (key, form) => quotes(form) <= quotes(key);

// The same for angle brackets: a translation that loses a closing tag
// leaves the rest of the screen inside a <b>.
const tags = s => (String(s).match(/<\/?[a-z][^>]*>/g) || []).map(t => t.replace(/\s+[^>]*>/, '>')).sort().join('');

if (!CHECK_ONLY) {
	fs.mkdirSync(LANG_DIR, { recursive: true });
	fs.writeFileSync(path.join(LANG_DIR, 'en.json'), `${JSON.stringify(catalogue, null, '\t')}\n`);
	console.log(`js/lang/en.json — ${KEYS.size} sentences from ${modules().length} modules and the server`);
}

if (BROKEN.length) {
	console.error(`\n${BROKEN.length} call(s) that cannot reach a translator:`);
	BROKEN.forEach(w => console.error(`  ${w}`));
}

// The packs. A missing one is not an error: a language nobody has
// translated yet is a language that draws in English, by design.
let broken = BROKEN.length;
for (const file of fs.existsSync(LANG_DIR) ? fs.readdirSync(LANG_DIR).sort() : []) {
	if (!file.endsWith('.json') || file === 'en.json' || file.startsWith('names.')) continue;
	const code = file.replace(/\.json$/, '');
	let pack;
	try {
		pack = JSON.parse(fs.readFileSync(path.join(LANG_DIR, file), 'utf8'));
	} catch (err) {
		console.error(`${code}: will not parse — ${err.message}`);
		broken++;
		continue;
	}
	const missing = [...KEYS.keys()].filter(k => !(k in pack));
	const stale = Object.keys(pack).filter(k => !KEYS.has(k));
	const forms = v => (typeof v === 'string' ? [v] : Object.values(v || {}));
	const mangled = Object.entries(pack).filter(([k, v]) =>
		KEYS.has(k) && forms(v).some(f => !sameHoles(k, f))).map(([k]) => k);
	const quoted = Object.entries(pack).filter(([k, v]) =>
		KEYS.has(k) && forms(v).some(f => !sameQuotes(k, f))).map(([k]) => k);
	const untagged = Object.entries(pack).filter(([k, v]) =>
		KEYS.has(k) && forms(v).some(f => tags(f) !== tags(k))).map(([k]) => k);
	const done = KEYS.size - missing.length;
	const pct = KEYS.size ? Math.round((done / KEYS.size) * 100) : 100;
	console.log(`${code.padEnd(6)} ${String(pct).padStart(3)}%  ${done}/${KEYS.size}`
		+ `${stale.length ? `  ·  ${stale.length} no longer used` : ''}`
		+ `${mangled.length ? `  ·  ${mangled.length} with a lost {placeholder}` : ''}`
		+ `${quoted.length ? `  ·  ${quoted.length} with a quote that would close an attribute` : ''}`
		+ `${untagged.length ? `  ·  ${untagged.length} whose markup does not match` : ''}`);
	for (const [what, list] of [['lost a {placeholder}', mangled], ['invented a straight quote', quoted], ['changed the markup', untagged]]) {
		if (!list.length) continue;
		broken++;
		list.slice(0, 8).forEach(k => console.error(`    ${code} ${what}: ${JSON.stringify(k).slice(0, 120)}`));
	}
	if (SHOW_STALE) stale.slice(0, 40).forEach(k => console.log(`    stale: ${JSON.stringify(k)}`));
}

process.exit(broken ? 1 : 0);
