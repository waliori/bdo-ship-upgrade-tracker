// Fetch the icon of every item the app can show and does not yet have.
//
// The item names come from the same modules the interface reads --
// recipes, vendors, coins, quests, sailor care, ships -- plus the barter
// catalogue. A name with no entry in icon_mapping.json is looked up: the
// barter file already carries an id and an icon path beside each item,
// and everything else is resolved by name against BDOCodex's item list
// (query.php?a=items, one big dump, fetched once per run). Each icon is
// downloaded to icons/ and the mapping gains a row with the item's page.
//
// This is the icon getter from ../bdocode-scraper/bdo_scraper_simple.py
// (download_icon and its browser headers), made to run over the app's
// own data instead of one design page at a time.
//
//   node tools/fetch-icons.mjs            # fetch what is missing
//   node tools/fetch-icons.mjs --dry-run  # only list what would be fetched

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const BASE = 'https://bdocodex.com';

// The headers the design scraper sends; the icon host serves plain curl
// too, but the item list wants to be asked by a browser.
const HEADERS = {
	'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0',
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
	'Accept-Language': 'en-US,en;q=0.5',
	'Referer': `${BASE}/us/`,
	'Cookie': 'bddatabaselang=us'
};

const mappingFile = path.join(ROOT, 'icon_mapping.json');
const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
const iconDir = path.join(ROOT, 'icons');

// Enhanced names ("+10 X", "X +10") share their base item's icon.
const baseName = n => n.replace(/^\+\d+\s+/, '').replace(/\s*\+\d+$/, '');
const known = n => {
	const m = mapping[n] || mapping[baseName(n)];
	const file = typeof m === 'string' ? m : m && m.icon;
	return Boolean(file) && fs.existsSync(path.join(iconDir, file));
};

// ---- every name the interface can put an icon beside --------------------

const wanted = new Map(); // name -> { id, icon } when the source knows them
const want = (name, info = {}) => {
	if (typeof name !== 'string' || !name) return;
	if (!wanted.has(name) || (info.id && !wanted.get(name).id)) wanted.set(name, info);
};

const { recipes } = await import('../js/recipes.js');
for (const [product, mats] of Object.entries(recipes)) {
	want(product);
	for (const m of Object.keys(mats)) want(m);
}
const { items: vendorItems, bulkExchanges, massProcess } = await import('../js/vendor_items.js');
for (const n of Object.keys(vendorItems)) want(n);
for (const [n, v] of Object.entries(bulkExchanges || {})) { want(n); if (v && v.item) want(v.item); }
for (const [n, v] of Object.entries(massProcess || {})) { want(n); if (v && v.extra) want(v.extra); }
const { coins } = await import('../js/sea_coins.js');
for (const n of Object.keys(coins)) want(n);
const { falasi } = await import('../js/falasi_vendor.js');
for (const n of Object.keys(falasi)) want(n);
const { quests } = await import('../js/quests.js');
for (const q of quests) for (const r of [q.rewards, ...(q.choice || q.either || [])]) if (r) for (const n of Object.keys(r)) want(n);
const { care, contract, pool, firstMates } = await import('../js/sailors.js');
for (const c of care || []) want(c.item);
// Sailors are not items: their portraits live under 11_employee, keyed
// by the codex sailor id each type carries, with a page of their own.
for (const m of firstMates || []) if (m.portrait) want(m.name, {
	id: String(m.npc), icon: m.portrait, url: `${BASE}/us/npc/${m.npc}/`
});
for (const s of pool || []) if (s.codex) want(s.type, {
	id: String(s.codex), icon: `/items/new_icon/11_employee/employee_${s.codex}.webp`, url: `${BASE}/us/sailor/${s.codex}/`
});
if (contract && contract.item) want(contract.item);
const { ships } = await import('../js/ships.js');
for (const s of ships) want(typeof s === 'string' ? s : s.name);

const barter = JSON.parse(fs.readFileSync(path.join(ROOT, 'js/all_barter.json'), 'utf8'));
for (const e of Array.isArray(barter) ? barter : Object.values(barter)) {
	want(e.name, { id: e.id, icon: e.icon });
	for (const s of e.sources || []) if (s.give) want(s.give.name, { id: s.give.id, icon: s.give.icon });
}

const missing = [...wanted].filter(([n]) => !known(n));
console.log(`${wanted.size} names in the app, ${missing.length} without an icon`);
if (!missing.length) process.exit(0);

// ---- resolve the ones the data does not carry an id for -----------------

let list = null;
async function lookup(name) {
	if (!list) {
		console.log('fetching the BDOCodex item list (large; one request)...');
		const res = await fetch(`${BASE}/query.php?a=items&l=us`, { headers: HEADERS });
		if (!res.ok) throw new Error(`item list: ${res.status}`);
		const text = (await res.text()).replace(/^\uFEFF/, '');
		list = new Map();
		for (const row of JSON.parse(text).aaData) {
			const n = row[2].replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
			const icon = (row[1].match(/src="([^"]+)"/) || [])[1];
			// Several ids can share a name; the first with a real icon wins.
			if (!icon || icon.includes('know_icon')) continue;
			if (!list.has(n)) list.set(n, { id: String(row[0]), icon });
		}
	}
	return list.get(name) || list.get(baseName(name)) || null;
}

// Hulls live on mount and design pages, not in the item list; a mapping
// row that already names such a page gets its icon from that page.
async function fromPage(name) {
	const url = mapping[name] && mapping[name].url;
	if (!url || url.includes('/item/')) return null;
	const res = await fetch(url, { headers: HEADERS });
	if (!res.ok) return null;
	const m = (await res.text()).match(/\/items\/new_icon\/[^"']+\.webp/);
	return m ? { id: null, icon: m[0] } : null;
}

async function download(iconPath, filename) {
	const dest = path.join(iconDir, filename);
	if (fs.existsSync(dest)) return;
	const res = await fetch(`${BASE}${iconPath}`, { headers: HEADERS });
	if (!res.ok) throw new Error(`${iconPath}: ${res.status}`);
	fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

let fetched = 0;
const unresolved = [];
for (const [name, info] of missing) {
	const hit = info.id && info.icon ? info : (await lookup(name)) || (await fromPage(name));
	if (!hit) { unresolved.push(name); continue; }
	const filename = path.basename(hit.icon);
	console.log(`${DRY ? 'would fetch' : 'fetching'} ${name} <- ${hit.icon}`);
	if (DRY) continue;
	try {
		await download(hit.icon, filename);
		// A mount or design page already in the mapping keeps its URL.
		const url = hit.url || (mapping[name] && mapping[name].url) || `${BASE}/us/item/${hit.id}/`;
		mapping[name] = { icon: filename, url };
		fetched++;
	} catch (e) {
		console.error(`  failed: ${e.message}`);
		unresolved.push(name);
	}
}

if (!DRY && fetched) {
	const sorted = Object.fromEntries(Object.keys(mapping).sort().map(k => [k, mapping[k]]));
	fs.writeFileSync(mappingFile, JSON.stringify(sorted, null, 1) + '\n');
}
console.log(`${fetched} icon${fetched === 1 ? '' : 's'} added`
	+ (unresolved.length ? `; not found on BDOCodex: ${unresolved.join(', ')}` : ''));
