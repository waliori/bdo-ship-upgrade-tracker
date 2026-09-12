// Pulls the community's record of the barter boards into
// js/barter_combos.json.
//
// The trade-goods board is not rolled island by island: every refresh
// it is one of forty fixed layouts. That was found by one player
// logging which layout each refresh produced -- 1,968 refreshes from
// November 2024 -- in the Google Sheet "TradeBarterInfo" (the id
// below), whose ComboData tab writes every layout out as text: one row
// per island, what it takes, how many, what it hands over. The
// material islands roll on their own and are not part of a layout.
//
// The sheet names islands; the app names barterers. Each island is
// matched to the barterer whose exchanges in js/all_barter.json cover
// its offers -- that also catches the wrecks the sheet knows by name
// and the codex files under "Margoria" -- and the tool refuses to
// write if any island fails to match, so a renamed island is noticed
// rather than dropped.
//
//   node tools/fetch-barter-combos.mjs

import { readFile, writeFile } from 'node:fs/promises';

const SHEET = '1X4HGo40R1kfbEDZlpxo5biIVQjmDYXPYKl_J2gF37fA';
const TABS = { data: 1782415744, counts: 984257609 };
const OUT = new URL('../js/barter_combos.json', import.meta.url);
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/150 Safari/537.36';

// The sheet's spellings that are not the codex's.
const SPELLING = { 'Balvege Island': 'Balvage Island' };

// Offers the sheet leaves out of a layout and the game was seen to show
// on it: by layout id, then [barterer id, give, quantity, receive]. An
// island the sheet has no row for on a layout is added from here; a
// row the sheet does have stands. Layout 19 has no row for the two
// Land of Morning Light islands, and both [Level 6]s their offers make
// are taken further on that layout by islands the sheet does list --
// seen on 2026-09-07.
const SEEN = {
	19: [
		[58981, '[Level 5] Golden Fish Scale', '1', '[Level 6] Sharp Safflower Blade Crate'],
		[58980, "[Level 5] Statue's Tear", '1', '[Level 6] Hanji Country Wild Berry Crate']
	]
};

// Offers the game changed inside a layout after the sheet wrote them:
// by layout id, then [barterer id, the give the sheet still has, the
// give the game now asks for]. The game edits a single slot at a
// maintenance without renumbering the layout -- the island and the
// reward stay, only which good the slot eats changes, and always to
// one the codex already lists that barterer taking for that reward.
// A stale row is worse than a missing one: barter-board.js rules a
// layout out on an island that disagrees, so one wrong give can leave
// the real board unidentified. This is for a change reported before
// the sheet carries it; once the sheet catches up the entry does
// nothing, and the run says so -- delete it then.
//
// Empty, and usually will be: the sheet's owner writes these in
// himself. He told us on 2026-09-11 that layout 16's Grandiha slot
// had become a Statue's Tear where it was an Octagonal Box, both for
// the same Moonlit Crystal Lamp -- and the refetch that day already
// had it, so nothing was needed here.
//
// Still to come, nothing to write yet: he expects the game to change
// Gangdalpo's give at Dallae Pier on layout 31 -- [Level 5] Statue's
// Tear for a [Level 6] Top-Quality Blue Underglaze Porcelain Crate --
// at a maintenance after 2026-09-11, and did not say what replaces
// it. Refetching once the sheet has it is the whole fix; write it
// here only if the board is seen to disagree with the sheet.
const CHANGED = {};

// A layout's give as the game asks it today, and a note of which
// corrections above never fired.
const unused = new Set();
for (const [layout, rows] of Object.entries(CHANGED)) for (const [id, was] of rows) unused.add(`layout ${layout}, barterer ${id}: ${was}`);
const changed = (layout, id, give) => {
	const row = (CHANGED[layout] || []).find(([n, was]) => n === id && was === give);
	if (!row) return give;
	unused.delete(`layout ${layout}, barterer ${id}: ${give}`);
	return row[2];
};

async function tab(gid) {
	const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET}/export?format=csv&gid=${gid}`, { headers: { 'User-Agent': UA } });
	if (!res.ok) throw new Error(`tab ${gid}: ${res.status}`);
	return csv(await res.text());
}

function csv(text) {
	const rows = [];
	let row = [], cell = '', quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
			else cell += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') { row.push(cell); cell = ''; }
		else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
		else if (c !== '\r') cell += c;
	}
	if (cell || row.length) { row.push(cell); rows.push(row); }
	return rows;
}

/** The layouts: id, and per island what is given, how many, what is received. */
const twice = [];
function parseLayouts(rows) {
	const out = [];
	let variants = null;
	for (const r of rows) {
		const m = /^Combo #(\w+)/.exec(r[0] || '');
		if (m) {
			// "Combo #35,A,,,,,,,B,..." holds several layouts side by side.
			variants = [];
			r.forEach((v, i) => { if (i > 0 && /^[A-E]$/.test(v)) variants.push({ id: m[1] + v, col: i }); });
			if (!variants.length) variants.push({ id: m[1], col: 1 });
			for (const v of variants) out.push({ id: v.id, col: v.col, offers: [] });
			continue;
		}
		if (!variants || !r[0]) continue;
		const island = SPELLING[r[0].trim()] || r[0].trim();
		for (const v of variants) {
			const give = (r[v.col + 1] || '').trim(), qty = (r[v.col + 2] || '').trim(), recv = (r[v.col + 5] || '').trim();
			if (!give || !recv) continue;
			const layout = out.find(o => o.id === v.id);
			// An island shows one offer. Where the sheet writes a second
			// row for the same island -- layout 19 gives two wrecks a coin
			// exchange and then a [Level 6] one -- the first row stands.
			if (layout.offers.some(o => o.island === island)) { twice.push(`${island} in layout ${v.id}`); continue; }
			layout.offers.push({ island, give, qty: qty.replace('/', '-') || '1', recv });
		}
	}
	return out.map(({ id, offers }) => ({ id, offers }));
}

/** How often each layout was seen since the patch the sample starts at. */
function parseCounts(rows) {
	const header = rows.find(r => r[3] === '1' && r[4] === '2');
	const periods = rows.filter(r => /^(Apr 16 2026 - May 20 2026|May 21 2026 -)$/.test(r[1] || ''));
	if (!header || periods.length !== 2) throw new Error('the Combos tab no longer has the two post-patch count rows');
	const seen = {};
	let total = 0;
	for (const p of periods) {
		total += Number(p[2]) || 0;
		header.slice(3).forEach((id, i) => { if (id) seen[id] = (seen[id] || 0) + (Number(p[3 + i]) || 0); });
	}
	return { since: '2026-04-16', refreshes: total, seen };
}

const barter = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
const { npcs } = await import('../js/barter_npcs.js');

// Every exchange the codex lists, keyed by barterer -- and every name
// it uses, so the sheet's spellings ("Kamasilvian", "Sailors's",
// "Caphras Tre") resolve to the codex's before anything is compared.
const dealt = new Map();
const codexName = new Map();
const loose = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
for (const e of barter) {
	codexName.set(loose(e.name), e.name);
	for (const s of e.sources) {
		codexName.set(loose(s.give.name), s.give.name);
		if (!dealt.has(s.npc_id)) dealt.set(s.npc_id, { pairs: new Set(), qty: new Map() });
		const d = dealt.get(s.npc_id);
		d.pairs.add(`${s.give.name}|${e.name}`);
		d.qty.set(`${s.give.name}|${e.name}`, s.give.quantity);
	}
}

const counts = parseCounts(await tab(TABS.counts));
const unknown = new Set();
// A letter or two off -- "Kamasilvian", "Sailors's", "Caphras Tre" --
// is the codex's name misspelt, when exactly one name is that close.
const edits = (a, b) => {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) d[0][j] = j;
	for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
		d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
	}
	return d[a.length][b.length];
};
const named = n => {
	const key = loose(n);
	if (codexName.has(key)) return codexName.get(key);
	const close = [...codexName.keys()].filter(k => Math.abs(k.length - key.length) <= 2 && edits(k, key) <= 2);
	if (close.length === 1) return codexName.get(close[0]);
	unknown.add(n);
	return n;
};
// A layout the sheet still writes out but no longer counts -- #17,
// from before the April 2026 patch -- is history, not a board.
const retired = [];
const layouts = parseLayouts(await tab(TABS.data)).filter(l => {
	if (l.id in counts.seen) return true;
	retired.push(l.id);
	return false;
});
for (const l of layouts) for (const o of l.offers) { o.give = named(o.give); o.recv = named(o.recv); }

// Islands to barterers, by the exchanges they share: an island goes to
// the one barterer whose codex exchanges cover its offers, taken one
// unique match at a time. That is what places the wrecks the sheet
// knows by name and the codex files under "Margoria", and the seven
// barterers the codex put at a workshop or a drying yard. The coin
// islands and the coin wrecks deal the same exchanges as each other,
// so they fall to the name -- the codex's place, or the barterer a
// wreck is named after -- and, last, to which sea they are in.
const byIsland = new Map();
for (const l of layouts) for (const o of l.offers) {
	if (!byIsland.has(o.island)) byIsland.set(o.island, new Set());
	byIsland.get(o.island).add(`${o.give}|${o.recv}`);
}
const plain = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const wreck = island => /Ship|Vessel|Raft|Carrack|Union/.test(island);
const npcOf = new Map();
const taken = new Set();
const take = (island, n) => { npcOf.set(island, n); taken.add(n.id); };
const free = () => npcs.filter(n => !taken.has(n.id) && dealt.has(n.id));
const overlap = (island, n) => { let k = 0; for (const p of byIsland.get(island)) if (dealt.get(n.id).pairs.has(p)) k++; return k; };
for (;;) {
	const left = [...byIsland.keys()].filter(i => !npcOf.has(i));
	if (!left.length) break;
	const picks = [];
	for (const island of left) {
		const pool = free().filter(n => (n.region === 'The Great Ocean') === wreck(island));
		const scored = pool.map(n => [n, overlap(island, n)]).sort((a, b) => b[1] - a[1]);
		const [best, hit] = scored[0] || [null, 0];
		const second = scored[1] ? scored[1][1] : 0;
		// Whole, or nearly: a barterer sharing under three quarters of an
		// island's offers is somebody else; a dead heat is left for later.
		if (best && hit >= byIsland.get(island).size * 0.75 && hit > second) picks.push([island, best]);
	}
	if (!picks.length) {
		let named = 0;
		for (const island of left) {
			const n = free().find(x => plain(x.at) === plain(island) || plain(island).startsWith(plain(x.name) + "'"));
			if (n) { take(island, n); named++; }
		}
		if (named) continue;
		console.error('islands with no barterer to match:\n  ' + left.join('\n  '));
		process.exit(1);
	}
	for (const [island, n] of picks) if (!taken.has(n.id)) take(island, n);
}

const combos = layouts.map(l => ({
	id: l.id,
	seen: counts.seen[l.id] ?? 0,
	// The codex's quantity where it has the exchange: it is the game's
	// own figure and it moved with the May 2026 patch the way the sheet
	// says the land goods did. The sheet's only where the codex lacks
	// the exchange altogether.
	offers: [
		...l.offers.map(o => {
			const id = npcOf.get(o.island).id;
			const give = changed(l.id, id, o.give);
			const codex = dealt.get(id).qty.get(`${give}|${o.recv}`);
			return [id, give, codex !== undefined ? String(codex) : o.qty, o.recv];
		}),
		...(SEEN[l.id] || []).filter(([id]) => !l.offers.some(o => npcOf.get(o.island).id === id))
	]
}));
await writeFile(OUT, JSON.stringify({
	read: new Date().toISOString().slice(0, 10),
	source: `https://docs.google.com/spreadsheets/d/${SHEET}`,
	sample: { since: counts.since, refreshes: counts.refreshes },
	combos
}, null, '\t') + '\n');

// The report: what the sheet and the codex disagree on.
let missing = 0;
const notes = [];
for (const c of combos) for (const [id, give, , recv] of c.offers) {
	if (!dealt.get(id).pairs.has(`${give}|${recv}`)) { missing++; notes.push(`  ${npcs.find(n => n.id === id).name}: ${give} -> ${recv} (layout ${c.id})`); }
}
const renamed = [...npcOf].map(([island, n]) => (n.at !== island ? `  ${n.name}: sheet says ${island}, we say ${n.at}` : null)).filter(Boolean);
console.log(`${combos.length} layouts, ${combos.reduce((a, c) => a + c.offers.length, 0)} offers, ${byIsland.size} islands; seen ${counts.refreshes} refreshes since ${counts.since}`);
if (renamed.length) console.log(`islands named differently (${renamed.length}):\n${renamed.join('\n')}`);
if (retired.length) console.log(`layouts the sheet no longer counts, left out: ${retired.join(', ')}`);
if (twice.length) console.log(`islands the sheet lists twice in a layout, second row dropped: ${twice.join('; ')}`);
if (unknown.size) console.log(`names the codex does not know, kept as the sheet writes them: ${[...unknown].join(', ')}`);
if (unused.size) console.log(`corrections the sheet has caught up with, delete them from CHANGED:\n  ${[...unused].join('\n  ')}`);
if (notes.length) console.log(`${missing} offers the codex lacks (kept -- the sheet saw them dealt):\n${[...new Set(notes)].join('\n')}`);
