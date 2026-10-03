// The game's own words, in every language the game ships.
//
// The app stores an item, ship, quest, sailor, barterer and harbour by
// its English name -- that is the key a save, a share link and a recipe
// are written in, and it must never move. But nobody plays in English
// because the tracker does: BDOCodex carries the client's own name for
// every one of those things in all sixteen of its languages, and the
// app already knows each thing's codex id.
//
// So this joins the two. For each language it pulls the codex's list
// dumps, reads the name beside each id we care about, and writes
// js/lang/names.<lang>.json -- English name -> the name that language's
// client prints. js/i18n.js reads that file and gameName() is the last
// step before the pixels; nothing it returns is ever stored.
//
// Names that are the same in a language as in English are left out of
// the file: gameName() falls through to its argument, so writing
// "Beer": "Beer" four hundred times would only make the file bigger.
//
// Three of the sixteen -- Basa Indonesia, SEA English and Global Lab --
// are English databases (checked 2026-09-09), so they get no file at
// all and read the English the app already has.
//
//   node tools/fetch-names.mjs             # every language
//   node tools/fetch-names.mjs fr de       # only these
//   node tools/fetch-names.mjs --dry-run   # say what would be written
//
// The dumps are large (the item list alone is 35 MB) and are cached
// under the system temp directory, so a second run costs nothing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG_DIR = path.join(ROOT, 'js', 'lang');
const CACHE = path.join(os.tmpdir(), 'bdocodex-dumps');
const BASE = 'https://bdocodex.com';
const DRY = process.argv.includes('--dry-run');

// The headers the rest of the tools use; the lists want to be asked by
// a browser.
const headers = lang => ({
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0',
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Referer': `${BASE}/${lang}/`,
	'Cookie': `bddatabaselang=${lang}`
});

// Every codex language that is not an English database. `us` is the
// source side of the join, never a written pack.
const LANGS = ['de', 'fr', 'ru', 'es', 'sp', 'pt', 'jp', 'kr', 'cn', 'tw', 'th', 'tr'];
const wanted = process.argv.slice(2).filter(a => !a.startsWith('--'));
const targets = wanted.length ? wanted.filter(l => LANGS.includes(l)) : LANGS;

/* ------------------------------------------------------------------ *
 * The codex's lists
 * ------------------------------------------------------------------ */

async function list(kind, lang) {
	fs.mkdirSync(CACHE, { recursive: true });
	const file = path.join(CACHE, `${kind}.${lang}.json`);
	if (!fs.existsSync(file)) {
		process.stdout.write(`  fetching ${kind} (${lang})... `);
		const res = await fetch(`${BASE}/query.php?a=${kind}&l=${lang}`, { headers: headers(lang) });
		if (!res.ok) throw new Error(`${kind} ${lang}: ${res.status}`);
		const text = await res.text();
		fs.writeFileSync(file, text);
		console.log(`${Math.round(text.length / 1024)} KB`);
	}
	const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
	return JSON.parse(raw).aaData || [];
}

// Every row is [id, <icon html>, <name html>, ...]. The id is a number
// for a thing with one of itself and an object for a thing the codex
// files per spawn or per step -- an NPC at "47791/53", a quest at
// "8700/12" -- where the app's own id is the whole "group/step".
const rowId = row => (row[0] && typeof row[0] === 'object' ? String(row[0].display) : String(row[0]));

// The name is the first <b> in the row's anchor. The codex writes its
// entities' names as HTML, entities and all.
const NAME = /<b>(?:<span[^>]*><\/span>)?([^<]*)<\/b>/;
const unescape = s => s
	.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
	.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

function rowName(row) {
	const cell = String(row[2] ?? '');
	const m = NAME.exec(cell);
	return m ? unescape(m[1]) : '';
}

// The sailor list names every hireable one "Sailor" and puts what makes
// it different in angle brackets after the name -- <Born in the Sea>,
// <Né en mer>, <바다에서 태어난>. The app hires by that trait and calls it
// the sailor's type, so for sailors it is the second half of the row
// that answers, not the first.
const TRAIT = /<br>&lt;([^&]*)&gt;|<br><([^>]*)>/;
function rowTrait(row) {
	const m = TRAIT.exec(String(row[2] ?? ''));
	return m ? unescape(m[1] ?? m[2]) : '';
}

/** id -> name, for one list in one language. */
async function byId(kind, lang) {
	const out = new Map();
	const sailorType = kind === 'sailorTypes';
	const region = kind === 'regions';
	const source = sailorType ? 'sailors' : region ? 'nodes' : kind;
	for (const row of await list(source, lang)) {
		const name = sailorType ? rowTrait(row) : region ? unescape(String(row[3] ?? '')) : rowName(row);
		if (!name) continue;
		const id = rowId(row);
		// Several spawns of one NPC share a name; the first wins, and the
		// bare group id is kept too so "21480" finds "21480/1".
		if (!out.has(id)) out.set(id, name);
		const group = id.split('/')[0];
		if (!out.has(group)) out.set(group, name);
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * What the app shows, and which list each thing is in
 * ------------------------------------------------------------------ */

// The sea monsters are named in the app and identified only in the
// header comment of js/sea_monsters.js -- one NPC id each is enough to
// read a name off, and the young ones and the ghost ship share a page.
const MONSTER_NPC = {
	Hekaru: '21414', 'Ocean Stalker': '21416', Candidum: '21417', Nineshark: '21420',
	'Black Rust': '21419', 'Saltwater Crocodile': '21447', Lekrashan: '21477', Khan: '59050'
};

async function wantedNames() {
	const mapping = JSON.parse(fs.readFileSync(path.join(ROOT, 'icon_mapping.json'), 'utf8'));
	// English name -> { kind, id }. A name the app never prints is not here.
	const want = new Map();
	const regionHits = new Map();
	const put = (name, kind, id, ids) => {
		if (name && id && !want.has(name)) want.set(name, { kind, id, ids: ids && ids.length > 1 ? ids : null });
	};

	// Items, hulls and the rest: the icon mapping carries a codex page
	// beside every picture, and the page says what kind of thing it is.
	const KIND = { item: 'items', mount: 'mounts', npc: 'npcs', quest: 'quests', sailor: 'sailorTypes' };
	for (const [name, info] of Object.entries(mapping)) {
		const m = /bdocodex\.com\/us\/([a-z]+)\/([\d/]+)\//.exec(info && info.url ? info.url : '');
		if (!m || !KIND[m[1]]) continue;
		put(name, KIND[m[1]], m[2].replace(/\/$/, ''));
	}

	// The barterers, the sailors and the quests carry their own ids.
	const { npcs } = await import('../js/barter_npcs.js');
	npcs.forEach(n => put(n.name, 'npcs', String(n.id)));
	const { pool, firstMates } = await import('../js/sailors.js');
	pool.forEach(s => s.codex && put(s.type, 'sailorTypes', String(s.codex)));
	// The first mates are NPCs, not entries in the sailor list.
	(firstMates || []).forEach(s => s.npc && put(s.name, 'npcs', String(s.npc)));
	const { quests } = await import('../js/quests.js');
	quests.forEach(q => q.codex && put(q.name, 'quests', String(q.codex)));
	for (const [name, id] of Object.entries(MONSTER_NPC)) put(name, 'npcs', id);

	// Places and wharf managers have no id in the app's data, so they are
	// resolved the other way about: find the English name in the English
	// dump, and keep the id only when exactly one row answers to it. A
	// place named twice on the codex is left in English rather than
	// guessed at.
	const places = new Set();
	const { wharves } = await import('../js/wharves.js');
	wharves.forEach(w => { places.add(w.at); });
	npcs.forEach(n => { places.add(n.at); places.add(n.region); });
	const { isleOf } = await import('../js/barter_npcs.js');
	npcs.forEach(n => places.add(isleOf(n)));

	const nodeRows = await list('nodes', 'us');
	const nodeHits = new Map();
	for (const row of nodeRows) {
		const name = rowName(row);
		if (name) nodeHits.set(name, (nodeHits.get(name) || new Set()).add(rowId(row)));
		// The fourth column is the territory the node is in -- Balenos,
		// Valencia, The Great Ocean -- which is the only place the codex
		// writes a region name, and the app labels barterers by region.
		const region = unescape(String(row[3] ?? ''));
		if (region) regionHits.set(region, (regionHits.get(region) || new Set()).add(rowId(row)));
	}
	for (const place of places) {
		if (!place) continue;
		// A name the codex uses for several nodes -- Margoria is nine of
		// them, the Ross Sea seven -- is still one name; what matters is
		// that they all say the same thing in the language being read,
		// which is checked when the pack is written.
		const hit = nodeHits.get(place);
		if (hit) { put(place, 'nodes', [...hit][0], [...hit]); continue; }
		const region = regionHits.get(place);
		if (region) put(place, 'regions', [...region][0], [...region]);
	}

	// The wharf managers, the same way, against the NPC list.
	const npcRows = await list('npcs', 'us');
	const npcHits = new Map();
	for (const row of npcRows) {
		const name = rowName(row);
		if (!name) continue;
		npcHits.set(name, (npcHits.get(name) || new Set()).add(rowId(row).split('/')[0]));
	}
	for (const w of wharves) {
		const hit = npcHits.get(w.name);
		if (hit && hit.size === 1) put(w.name, 'npcs', [...hit][0]);
	}

	return want;
}

/* ------------------------------------------------------------------ *
 * Trusting the join
 * ------------------------------------------------------------------ */

// An id is only worth translating through if the codex's English name
// for it is the same thing the app calls it. Most of the time it is
// exactly the same string; the rest of the time the difference is one
// of two known, harmless shapes -- or it is a mis-join, and a mis-join
// would print the wrong item's name at a player in a language they
// cannot check it in.
//
// The harmless shapes:
//
//   * a leading bracket the app drops. The codex files a trade good as
//     "[Level 3] Scout Binoculars" and the app's icon mapping keys it
//     as the bare name. Then the localised name has a bracket the app's
//     spelling does not, and it comes off -- "[Niveau 3] Jumelles
//     d'éclaireur" is written into the pack as "Jumelles d'éclaireur",
//     because the app puts its own level marker on.
//   * the app's own "Daily: " where the codex writes "[Daily] ", and
//     the codex's extra "[Barter]" or "[Difficulty 0]" in front of a
//     quest. There the localised brackets say what the app's prefix
//     says, in the player's language, so they stay.

const BRACKETS = /^(?:\s*\[[^\]]*\])+\s*/;
const strip = name => String(name).replace(BRACKETS, '');
const brackets = name => (String(name).match(/^(?:\s*\[[^\]]*\])+/) || [''])[0].split('[').length - 1;
// Two names are the same name if the words are, once the codex's
// punctuation quirks are set aside: it writes a subtitle with a dash
// where the app writes a colon, and capitalises mid-sentence words
// differently from patch to patch.
const shape = name => strip(name).toLowerCase().replace(/[\s\u2013\u2014:\-\u2019']+/g, ' ').trim();

// The app calls a daily quest "Daily: X" where the codex says
// "[Daily] X"; strip that too before comparing.
const CADENCE = /^(?:daily|weekly): /i;

// Ids where the two names are genuinely different words for the same
// thing, checked by hand. Everything else that disagrees is left in
// English rather than guessed at -- the sailor TYPES most of all, which
// the codex files under a generic "Sailor" page, so joining them by id
// would print "Matrose" for "Born-in-the-Sea".
const TRUSTED = new Set([
	'mounts:31054', 'mounts:31055', 'mounts:31085', 'mounts:31056',   // the app's short Carrack names
	'items:4001',                                                     // "Iron" is the codex's "Iron Ore"
	'items:6026',                                                     // Belladonna Elephant Hide
	'npcs:42307',                                                     // Falasi, in full Philaberto Falasi
	'npcs:28848',                                                     // the Cox cargo ship
	'quests:3709/7', 'quests:3711/2', 'quests:3712/1'                 // Ravinia's logs, numbered by the app
]);

/**
 * The name to write into the pack, or null to leave the English alone.
 *
 * @param {string} appEn      what the app calls it
 * @param {string} codexEn    what the codex calls it, in English
 * @param {string} localised  what the codex calls it, in this language
 * @param {string} ref        'kind:id', for the hand-checked list
 */
function join(appEn, codexEn, localised, ref) {
	if (!localised) return null;
	const trusted = TRUSTED.has(ref);
	const same = shape(codexEn) === shape(String(appEn).replace(CADENCE, ''));
	if (!same && !trusted) return null;
	// Bring the localised name's leading brackets into line with the
	// app's spelling. A quest the app prefixes itself ("Daily: ") keeps
	// the localised bracket, which says the same word in the language
	// being read.
	const extra = brackets(codexEn) - brackets(appEn) - (CADENCE.test(String(appEn)) ? 1 : 0);
	let out = localised;
	for (let i = 0; i < extra; i++) out = out.replace(/^\s*\[[^\]]*\]\s*/, '');
	return out.trim() || null;
}

/* ------------------------------------------------------------------ *
 * The join
 * ------------------------------------------------------------------ */

const want = await wantedNames();
const kinds = new Set([...want.values()].map(w => w.kind));
console.log(`${want.size} names the app prints, across ${[...kinds].sort().join(', ')}`);

// A name whose English side does not match the codex's English side is
// a name the app spells differently -- worth saying once, since the
// join still works but the difference is a clue that a patch moved
// something.
const english = {};
for (const kind of kinds) english[kind] = await byId(kind, 'us');

// Every name is put through the join against the codex's own English
// first. Whatever the join refuses here it will refuse in all twelve
// languages, so it is worth saying once, plainly, rather than leaving a
// player to notice that one word on the screen never changed.
const refused = [];
const adjusted = [];
for (const [name, { kind, id }] of want) {
	const codexEn = english[kind].get(id);
	if (!codexEn) { refused.push(`${name} — the codex no longer lists ${kind} ${id}`); continue; }
	const settled = join(name, codexEn, codexEn, `${kind}:${id}`);
	if (settled === null) { refused.push(`${name} — the codex calls ${kind} ${id} “${codexEn}”`); continue; }
	if (settled !== name) adjusted.push(`${name}  ←  ${codexEn}`);
}
if (adjusted.length) {
	console.log(`\n${adjusted.length} name(s) whose brackets the codex writes differently — the join keeps the app's spelling:`);
	adjusted.slice(0, 8).forEach(a => console.log(`  ${a}`));
}
if (refused.length) {
	console.log(`\n${refused.length} name(s) left in English, because the codex means something else by that id:`);
	refused.slice(0, 40).forEach(r => console.log(`  ${r}`));
}

fs.mkdirSync(LANG_DIR, { recursive: true });
for (const lang of targets) {
	console.log(`\n${lang}`);
	const tables = {};
	for (const kind of kinds) tables[kind] = await byId(kind, lang);
	const out = {};
	let same = 0;
	let refusedHere = 0;
	for (const [name, { kind, id, ids }] of want) {
		const codexEn = english[kind].get(id);
		let there = tables[kind].get(id);
		// One name the codex spreads over several ids -- Margoria is nine
		// nodes, the Ross Sea seven -- is only safe if every one of them
		// says the same thing here. If they disagree the app has picked
		// the wrong sense of the word, and English is the honest answer.
		if (ids) {
			const said = new Set(ids.map(x => tables[kind].get(x)).filter(Boolean));
			if (said.size !== 1) { refusedHere++; continue; }
			there = [...said][0];
		}
		if (!codexEn || !there) continue;
		const settled = join(name, codexEn, there, `${kind}:${id}`);
		if (settled === null) { refusedHere++; continue; }
		// A language that spells it exactly as the English does needs no
		// row: gameName() falls through to its own key.
		if (settled === name) { same++; continue; }
		out[name] = settled;
	}
	const keys = Object.keys(out).sort();
	const sorted = Object.fromEntries(keys.map(k => [k, out[k]]));
	const file = path.join(LANG_DIR, `names.${lang}.json`);
	console.log(`  ${keys.length} translated, ${same} the same as the English, ${refusedHere} left English on purpose, ${want.size - keys.length - same - refusedHere} not found`);
	if (DRY) continue;
	fs.writeFileSync(file, `${JSON.stringify(sorted, null, '\t')}\n`);
	console.log(`  js/lang/names.${lang}.json — ${Math.round(fs.statSync(file).size / 1024)} KB`);
}
