// Read every sailor type's title in every language the game is played
// in, and write js/sailor_titles.js.
//
// The Selected Sailor panel prints the type in angle brackets --
// "<Tough>" -- and that is the one place a screenshot says outright
// what a sailor is. In a client set to Deutsch it says "<Zäh>", and the
// reader has to know that is the same thing, so the sailor import can
// go on naming the type from the title rather than guessing it from the
// appetite and the weight.
//
// BDOCodex carries the whole sailor list in each of its fourteen
// languages, which are the game's own strings: one request a language.
// Run with `node tools/fetch-sailor-titles.mjs`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// The codex's language codes, under the tag js/sailor-locales.js uses.
const LANGS = {
	en: 'us', de: 'de', fr: 'fr', ru: 'ru', es: 'es', 'es-419': 'sp', pt: 'pt',
	ja: 'jp', ko: 'kr', zh: 'cn', 'zh-Hant': 'tw', th: 'th', tr: 'tr', id: 'id'
};

// The codex spells two of them without the hyphens js/sailors.js uses,
// and charts three named sailors the hiring pool has no type for.
const RENAME = { 'Born in the Sea': 'Born-in-the-Sea', 'Treasure Seeking': 'Treasure-Seeking' };
const NAMED = new Set(['Pacuna', 'Hetario', 'Arkahn']);

const unescapeHTML = s => s
	.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
	.replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');

/** Every sailor row of one language: the codex id, the name, the title. */
async function rows(code) {
	const res = await fetch(`https://bdocodex.com/query.php?a=sailors&l=${code}`, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`sailors/${code}: HTTP ${res.status}`);
	const data = JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
	const out = new Map();
	for (const row of data.aaData || []) {
		const m = /<b>(.*?)<\/b><br>(.*?)<\/a>/s.exec(String(row[2] || ''));
		if (!m) continue;
		out.set(row[0], { name: unescapeHTML(m[1]).trim(), title: unescapeHTML(m[2]).trim().replace(/^<|>$/g, '') });
	}
	return out;
}

const all = {};
for (const [tag, code] of Object.entries(LANGS)) {
	all[tag] = await rows(code);
	process.stdout.write(`${tag} ${all[tag].size}\n`);
}

// English names the types; every other language is filed under it.
const byType = new Map();
for (const [id, { name, title }] of all.en) {
	if (NAMED.has(name)) continue;
	byType.set(RENAME[title] || title, id);
}

const langs = Object.keys(LANGS).filter(t => t !== 'en');
const lines = [...byType].sort(([a], [b]) => a.localeCompare(b)).map(([type, id]) => {
	const said = langs.map(tag => {
		const row = all[tag].get(id);
		return row && row.title ? `\t\t${JSON.stringify(tag)}: ${JSON.stringify(row.title)}` : null;
	}).filter(Boolean);
	return `\t${JSON.stringify(type)}: {\n${said.join(',\n')}\n\t}`;
});

const out = `// What every sailor type is called, in each language the game runs in.
//
// The Selected Sailor panel prints the type in angle brackets, and in a
// client set to anything but English it prints it translated. This is
// that translation, so a screenshot read in any language still names
// the type outright rather than leaving it to be guessed from the
// appetite, the cabin cost and the weight.
//
// Read from BDOCodex -- the game's own strings -- by
// tools/fetch-sailor-titles.mjs on ${new Date().toISOString().slice(0, 10)}. English is the key, and is
// not repeated inside.

export const TITLES_READ = '${new Date().toISOString().slice(0, 10)}';

export const sailorTitles = {
${lines.join(',\n')}
};
`;
fs.writeFileSync(path.join(root, 'js/sailor_titles.js'), out);
process.stdout.write(`js/sailor_titles.js: ${byType.size} types\n`);
