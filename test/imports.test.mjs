// Every named import in js/ is exported by the module it names.
//
// A module that asks for a name its source does not export fails to
// load, and in the browser that is the whole app: when the Barter tab
// was split into js/barter/, one re-export left behind stopped the page
// from starting, and neither the linter nor a Node test that never loads
// that module saw it. Read statically, so no module has to run here.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'js');

const files = [];
(function walk(dir) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const f = path.join(dir, e.name);
		if (e.isDirectory()) walk(f);
		else if (f.endsWith('.js') && !f.endsWith('driver.iife.js')) files.push(f);
	}
})(JS);

const parse = f => acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
const exported = new Map();
function exportsOf(f) {
	if (exported.has(f)) return exported.get(f);
	const names = new Set();
	exported.set(f, names);
	for (const n of parse(f).body) {
		if (n.type === 'ExportNamedDeclaration') {
			const d = n.declaration;
			if (d && d.id) names.add(d.id.name);
			if (d && d.declarations) for (const x of d.declarations) names.add(x.id.name);
			for (const s of n.specifiers || []) names.add(s.exported.name);
		}
		if (n.type === 'ExportAllDeclaration') for (const x of exportsOf(path.resolve(path.dirname(f), n.source.value))) names.add(x);
		if (n.type === 'ExportDefaultDeclaration') names.add('default');
	}
	return names;
}

test('every name imported from a module in js/ is one it exports', () => {
	const missing = [];
	for (const f of files) {
		for (const n of parse(f).body) {
			if (!n.source || !(n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration')) continue;
			const src = n.source.value;
			if (!src.startsWith('.') || !src.endsWith('.js')) continue;
			const target = path.resolve(path.dirname(f), src);
			const rel = path.relative(ROOT, f);
			if (!fs.existsSync(target)) { missing.push(`${rel}: no such file ${src}`); continue; }
			const have = exportsOf(target);
			for (const s of n.specifiers || []) {
				const name = s.type === 'ImportSpecifier' ? s.imported.name : s.type === 'ExportSpecifier' ? s.local.name : null;
				if (name && !have.has(name)) missing.push(`${rel}: ${name} from ${src}`);
			}
		}
	}
	assert.deepEqual(missing, []);
});
