// Writes js/land_goods.js: the land goods the barter chains start
// from -- what a [Level 1] island takes, and what a few shore
// barterers take for a material -- each with the codex id the Market
// knows it by, so the buy list can be priced.
//
// The names come from js/all_barter.json (every give that is not a
// [Level N] good), the ids from icon_mapping.json, which already
// carries each item's codex page. Run on its own, or by
// tools/build-barter.mjs after a fresh pull.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../js/all_barter.json', import.meta.url);
const ICONS = new URL('../icon_mapping.json', import.meta.url);
const OUT = new URL('../js/land_goods.js', import.meta.url);

export async function buildLandGoods() {
	const data = JSON.parse(await readFile(SRC, 'utf8'));
	const icons = JSON.parse(await readFile(ICONS, 'utf8'));
	const ids = new Map();
	for (const e of data) {
		for (const s of e.sources || []) {
			const name = s.give && s.give.name;
			if (!name || /^\[Level \d\]/.test(name) || ids.has(name)) continue;
			const m = icons[name];
			const url = typeof m === 'string' ? '' : (m && m.url) || '';
			const id = /\/item\/(\d+)\//.exec(url);
			ids.set(name, id ? Number(id[1]) : 0);
		}
	}
	const body = [...ids].sort((a, b) => a[0].localeCompare(b[0])).map(([n, id]) => `\t${JSON.stringify(n)}: ${id}`).join(',\n');
	const src = `// The land goods the barter chains start from, with the codex id the
// Market prices each by (0 when the codex does not know it). Generated
// by tools/build-land-goods.mjs from js/all_barter.json -- do not edit
// by hand; rebuild after a pull.
//
// ${ids.size} goods.

export const landGoods = {
${body}
};

/** Whether a name is a land good a chain starts from. */
export const isLandGood = name => Object.prototype.hasOwnProperty.call(landGoods, name);
`;
	await writeFile(OUT, src);
	return ids.size;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const n = await buildLandGoods();
	console.log(`js/land_goods.js: ${n} land goods`);
}
