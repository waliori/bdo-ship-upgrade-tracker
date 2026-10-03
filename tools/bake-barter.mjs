// The barter tables, baked from the game client -- the command to run
// after a patch. Everything the app knows about the day's boards comes
// out of the game's own files: the forty trade layouts and forty-one
// material layouts, the random picks behind the empty-looking slots,
// what every exchange costs in Parley, how many it allows a day, and
// how many Total Barters open it. See docs/barter-bake.md.
//
//   npm run bake:barter                        # from the installed game
//   npm run bake:barter -- --game "/path/to/Black Desert Online"
//   npm run bake:barter -- --raw DIR --build DIR   # from files already extracted
//   npm run bake:barter -- --dry-run           # report only, write nothing
//
// It extracts with bdo-data-extractor (github.com/iDevelopThings/
// bdo-data-extractor; --extractor or BDO_EXTRACTOR, else the one on the
// PATH), decrypts the barterer list itself, decodes every table, writes
// js/barter_game.js, and prints what changed since the last bake -- a slot, a group's
// options, a new barterer or good the app has no map position, icon or
// translation for.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { iceDecrypt } from './barter-bake/ice.mjs';
import { readBarterNormal, readSubgroups, readSpecial, readNpcList, readPairs } from './barter-bake/tables.mjs';

const ROOT = new URL('..', import.meta.url);
const OUT = new URL('js/barter_game.js', ROOT);

/* ------------------------------------------------------------------ *
 * the arguments
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const opt = name => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
if (flag('help')) {
	console.log(readFileSync(new URL(import.meta.url)).toString().split('\n').filter(l => l.startsWith('//')).slice(0, 21).map(l => l.slice(3)).join('\n'));
	process.exit(0);
}
const game = opt('game') || process.env.BDO_GAME || join(homedir(), '.local/share/Steam/steamapps/common/Black Desert Online');
const extractor = opt('extractor') || process.env.BDO_EXTRACTOR || 'bdo-data-extractor';
const dry = flag('dry-run');
const work = opt('work') || mkdtempSync(join(tmpdir(), 'barter-bake-'));
mkdirSync(work, { recursive: true });
let raw = opt('raw'), build = opt('build'), client = opt('client');

const say = (...s) => console.log(...s);
const extract = args => execFileSync(extractor, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 }).toString();

/* ------------------------------------------------------------------ *
 * 1. out of the archive
 * ------------------------------------------------------------------ */

if (!raw || !build) {
	if (!existsSync(join(game, 'Paz'))) throw new Error(`no game install at ${game} (pass --game, or BDO_GAME)`);
	say(`game       ${game}`);
	say(`work dir   ${work}`);
	client = client || (/version=(\d+)/.exec(extract(['meta', '--game', game])) || [])[1] || null;
	if (!raw) { raw = join(work, 'raw'); extract(['extract', '--game', game, 'barter', raw]); }
	if (!build) { build = join(work, 'build'); extract(['build', '--game', game, '--out', build]); }
}
say(`client     ${client || 'unknown (pass --client)'}`);
const bin = join(raw, 'gamecommondata', 'binary');
const file = name => readFileSync(join(bin, name));

/* ------------------------------------------------------------------ *
 * 2. decoded
 * ------------------------------------------------------------------ */

let npcList = file('barter_npclist.bss');
if (npcList.subarray(0, 4).toString('latin1') !== 'PABR') npcList = iceDecrypt(npcList);
const regionNpc = readNpcList(npcList);
const normal = readBarterNormal(file('barter_normal.bss'));
const sub = readSubgroups(file('bartersubgroup.bss'));
const special = readSpecial(file('barter_special.bss'));
const reset = readPairs(file('barterresetoption.bss'), 'barterresetoption');
const lifeLevels = readPairs(file('barterlifelevelinfo.bss'), 'barterlifelevelinfo');
const items = new Map(JSON.parse(readFileSync(join(build, 'items.json'), 'utf8')).map(i => [i.id, i.name]));
const npcInfo = new Map(JSON.parse(readFileSync(join(build, 'npcs.json'), 'utf8')).map(n => [n.id, n]));

for (const [label, pools, rows] of [['trade board', normal.trade, 40], ['material list', normal.material, 41]]) {
	for (const [region, slots] of pools) {
		if (slots.length !== rows) throw new Error(`${label}: region ${region} has ${slots.length} rows, not ${rows}`);
		if (!regionNpc.has(region)) throw new Error(`${label}: region ${region} has no barterer in barter_npclist`);
	}
}
const groupSets = [['trade board', normal.trade, sub.trade], ['material list', normal.material, sub.material]];
for (const [label, pools, groups] of groupSets) {
	for (const slots of pools.values()) for (const s of slots) if (s.group != null && !groups.has(s.group)) throw new Error(`${label}: a slot points at group ${s.group}, which is not there`);
}

/* ------------------------------------------------------------------ *
 * 3. what was baked before
 * ------------------------------------------------------------------ */

const before = existsSync(OUT) ? await import(`${pathToFileURL(OUT.pathname).href}?${Date.now()}`) : null;
// The layout names are the community's, and a row keeps its layout from
// one bake to the next: they come from the last bake. (The first were
// matched against the community's sheet of the layouts, 2026-09-27.)
if (!before) throw new Error('js/barter_game.js is missing: the layout names are carried from the last bake -- restore it from git');
const layouts = before.LAYOUTS;
const tradeRows = Object.values(layouts.trade);
if (new Set(tradeRows).size !== 40 || tradeRows.some(k => k < 0 || k > 39)) throw new Error('the trade layouts do not claim all forty rows');

/* ------------------------------------------------------------------ *
 * 4. baked
 * ------------------------------------------------------------------ */

const goods = [], goodAt = new Map();
const good = id => {
	if (!goodAt.has(id)) { goodAt.set(id, goods.length); goods.push([id, items.get(id) || `#${id}`]); }
	return goodAt.get(id);
};
// A fixed offer, and a group's option, as rows of numbers: the field
// names are exported beside them.
const OFFER = ['weight', 'give', 'giveMin', 'giveMax', 'recv', 'recvMin', 'recvMax', 'parley', 'perDay', 'gate', 'category', 'k58'];
const OPTION = ['weight', 'give', 'giveMin', 'giveMax', 'recv', 'recvMin', 'recvMax', 'parley', 'perDay', 'gate', 'category', 'k8', 'k64'];
const row = (o, fields) => fields.map(f => (f === 'give' || f === 'recv' ? good(o[f]) : o[f]));
// An offer that never shows (weight 0: most of the material list's
// slots) is null -- it is not on any board. A patch that gives it a
// weight shows up in the report as a slot that changed.
const slot = s => (s.group != null ? s.group : s.weight ? row(s, OFFER) : null);
const byNpc = pools => Object.fromEntries([...pools].map(([region, slots]) => [regionNpc.get(region), slots.map(slot)]).sort((a, b) => a[0] - b[0]));
const groupsOf = groups => Object.fromEntries([...groups].sort((a, b) => a[0] - b[0]).map(([id, list]) => [id, list.map(e => row(e, OPTION))]));
const TRADE = byNpc(normal.trade), MATERIAL = byNpc(normal.material);
const GROUPS = groupsOf(sub.trade), MATERIAL_GROUPS = groupsOf(sub.material);
const SPECIAL = special.map(s => row(s, OFFER));
const REGIONS = Object.fromEntries([...regionNpc].map(([region, npc]) => [npc, region]).sort((a, b) => a[0] - b[0]));
const BAKED = { at: new Date().toISOString().slice(0, 10), client: client ? Number(client) : null };

const lines = obj => `{\n${Object.entries(obj).map(([k, v]) => `\t${JSON.stringify(String(k))}: ${JSON.stringify(v)}`).join(',\n')}\n}`;
const source = `// The game's barter tables. Generated by tools/bake-barter.mjs -- do not
// edit by hand; run \`npm run bake:barter\` after a patch (docs/barter-bake.md).
//
// Baked ${BAKED.at} from client version ${BAKED.client ?? 'unknown'}.
//
// TRADE and MATERIAL are the two boards, per barterer (npc id): one slot
// a row, 40 rows on the trade board and 41 on the material list. A day's
// board is one row index used at every island at once; LAYOUTS names the
// rows the community has names for. A slot is an offer -- a row of
// numbers laid out as OFFER --, null where the offer never shows, or, as
// a plain number, a random group:
// the board shows one option of GROUPS[n] (MATERIAL_GROUPS[n] on the
// material list), laid out as OPTION, each as likely as the next.
//
// Goods are indexes into GOODS, [item id, English name]. weight is out
// of 1,000,000: the chance the offer shows at all. parley is the base
// cost before the sailor's discounts; perDay the exchanges a day; gate
// the Total Barters that open it; category the board's bits (2 shore->1,
// 4 1->2, 8 2->3, 16 3->4, 32 4->5, 64 material, 128 coins, 256 coin
// ships, 1024 6->7). k58, k8 and k64 are kept as read, not yet understood.

export const BAKED = ${JSON.stringify(BAKED)};
export const OFFER = ${JSON.stringify(OFFER)};
export const OPTION = ${JSON.stringify(OPTION)};
export const LAYOUTS = ${JSON.stringify(layouts)};
export const GOODS = ${JSON.stringify(goods)};
export const REGIONS = ${JSON.stringify(REGIONS)};
export const TRADE = ${lines(TRADE)};
export const MATERIAL = ${lines(MATERIAL)};
export const GROUPS = ${lines(GROUPS)};
export const MATERIAL_GROUPS = ${lines(MATERIAL_GROUPS)};
export const SPECIAL = ${JSON.stringify(SPECIAL)};
export const RESET = ${JSON.stringify(reset)};
export const LIFE_LEVELS = ${JSON.stringify(lifeLevels)};
`;

/* ------------------------------------------------------------------ *
 * 5. what changed
 * ------------------------------------------------------------------ */

const report = [];
const note = s => report.push(s);
const nameIn = (list, i) => (list[i] ? list[i][1] : `?${i}`);
const offerText = (o, fields, list) => {
	const v = Object.fromEntries(fields.map((f, i) => [f, o[i]]));
	const range = (a, b) => (a === b ? `${a}` : `${a}-${b}`);
	return `${range(v.giveMin, v.giveMax)}x ${nameIn(list, v.give)} -> ${range(v.recvMin, v.recvMax)}x ${nameIn(list, v.recv)} (${v.perDay}/day, parley ${v.parley}, opens at ${v.gate}${v.weight !== 1e6 ? `, shows ${v.weight / 1e4}%` : ''})`;
};
const slotText = (s, fields, list) => (s == null ? 'nothing' : typeof s === 'number' ? `random group ${s}` : offerText(s, fields, list));
const isle = npc => { const n = npcInfo.get(Number(npc)); return n ? `${(n.spawns[0] || {}).regionName || '?'} (${n.name})` : `npc ${npc}`; };
const rowName = (kind, k) => Object.entries(layouts[kind]).filter(([, r]) => r === k).map(([id]) => `layout ${id}`)[0] || `row ${k}`;

{
	if (before.BAKED.client !== BAKED.client) note(`Client ${before.BAKED.client ?? '?'} -> ${BAKED.client ?? '?'}`);
	for (const [kind, now, was, rows] of [['trade', TRADE, before.TRADE, 40], ['material', MATERIAL, before.MATERIAL, 41]]) {
		const changes = [];
		for (const npc of new Set([...Object.keys(now), ...Object.keys(was)])) {
			for (let k = 0; k < rows; k++) {
				const a = slotText((was[npc] || [])[k], before.OFFER, before.GOODS), b = slotText((now[npc] || [])[k], OFFER, goods);
				if (a !== b) changes.push(`  ${rowName(kind, k)} · ${isle(npc)}: ${a}  =>  ${b}`);
			}
		}
		note(`${kind === 'trade' ? 'Trade board' : 'Material list'}: ${changes.length ? `${changes.length} slot(s) changed` : 'no change'}`);
		report.push(...changes);
	}
	for (const [label, now, was] of [['Trade groups', GROUPS, before.GROUPS], ['Material groups', MATERIAL_GROUPS, before.MATERIAL_GROUPS]]) {
		const changes = [];
		for (const id of new Set([...Object.keys(now), ...Object.keys(was)])) {
			const a = (was[id] || []).map(o => offerText(o, before.OPTION, before.GOODS)).join(' / ');
			const b = (now[id] || []).map(o => offerText(o, OPTION, goods)).join(' / ');
			if (a !== b) changes.push(`  group ${id}: ${a || 'none'}  =>  ${b || 'none'}`);
		}
		note(`${label}: ${changes.length ? `${changes.length} changed` : 'no change'}`);
		report.push(...changes);
	}
	const sp = s => s.map(o => offerText(o, OFFER, goods)).join('\n');
	if (sp(SPECIAL) !== before.SPECIAL.map(o => offerText(o, before.OFFER, before.GOODS)).join('\n')) note('Special Barter window: changed');
	if (JSON.stringify(reset) !== JSON.stringify(before.RESET)) note(`Re-roll settings: ${JSON.stringify(before.RESET)} -> ${JSON.stringify(reset)}`);
}

// What the app has no data for: a barterer with no place on the chart,
// a good with no icon (tools/fetch-icons.mjs fetches it from BDOCodex).
const { npcById } = await import(new URL('js/barter_npcs.js', ROOT).href);
for (const npc of Object.keys(REGIONS).map(Number)) {
	if (npcById.has(npc)) continue;
	const n = npcInfo.get(npc), at = n && n.spawns[0];
	// The chart's frame: x = X/25 + 68600, y = 72200 - Z/25.
	const pos = at ? ` -- chart x ${Math.round((at.pos[0] / 25 + 68600) * 100) / 100}, y ${Math.round((72200 - at.pos[2] / 25) * 100) / 100}` : '';
	note(`NEW BARTERER not in js/barter_npcs.js: ${npc} ${n ? `${n.name} at ${at ? at.regionName : '?'}` : ''}${pos}`);
}
const icons = JSON.parse(readFileSync(new URL('icon_mapping.json', ROOT), 'utf8'));
// Looked up by the name the app shows: the game calls five goods
// "[Great Ocean] ..." where the app says "[Level 5] ...".
const { appName } = await import(new URL('js/barter-layouts.js', ROOT).href);
const bare = s => String(s).replace(/^\[[^\]]+\]\s*/, '');
const used = new Set();
for (const board of [TRADE, MATERIAL]) for (const slots of Object.values(board)) for (const s of slots) if (Array.isArray(s) && s[0] > 0) { used.add(s[1]); used.add(s[4]); }
for (const list of [GROUPS, MATERIAL_GROUPS]) for (const opts of Object.values(list)) for (const o of opts) { used.add(o[1]); used.add(o[4]); }
const noIcon = [...used].map(i => appName(goods[i][1])).filter(n => !icons[n] && !icons[bare(n)]);
if (noIcon.length) note(`Goods with no icon in icon_mapping.json (${noIcon.length}): ${noIcon.sort().join(', ')}`);

/* ------------------------------------------------------------------ *
 * 6. written
 * ------------------------------------------------------------------ */

say('');
say(report.join('\n'));
writeFileSync(join(work, 'report.txt'), `${report.join('\n')}\n`);
if (dry) {
	say(`\n--dry-run: nothing written. The report is in ${join(work, 'report.txt')}`);
} else {
	writeFileSync(OUT, source);
	say(`\nwrote js/barter_game.js (${(source.length / 1024).toFixed(0)} KB)`);
	say(`report in ${join(work, 'report.txt')}`);
	say('next: npm test, look over the report, commit js/barter_game.js');
}
// What was extracted here goes (the build is some 400 MB); the report stays.
if (!flag('keep')) for (const dir of [raw, build]) if (dir.startsWith(work)) rmSync(dir, { recursive: true, force: true });
