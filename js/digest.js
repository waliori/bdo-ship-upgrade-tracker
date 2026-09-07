// What a save says about its sailor, in numbers small enough to share.
//
// The community boards are drawn from this and nothing else: a player
// who takes part publishes the digest, not the save. It is worked out
// the same way on both sides -- the server keeps one per account on the
// boards, and the page shows the same one before anyone agrees to be on
// them, so what is offered is exactly what is sent. Pure, and only the
// data modules are imported: this runs in Node as it does in a browser.
//
// Two kinds of number are in here. Some are read off the save as it
// stands -- the fleet, the crew, the stock, the charts. The rest are
// running totals the profile keeps as things happen (`tally`): quests
// claimed, runs sailed, things made, attempts recorded. A save records
// only the current period of a quest and the last sixty runs, so the
// tally is the only witness to a long career.

import { shipGroups } from './ships.js';
import { quests } from './quests.js';
import { monsterByKey } from './sea_monsters.js';
import { readProfile } from './profile-shape.js';

/** The hulls that sail, from the small ones up. A rank for "best ship". */
export const HULL_TIER = {
	'Bartali Sailboat': 0, 'Raft': 0, 'Rowboat': 0, 'Calpheon Rowboat': 0, 'Mediah Rowboat': 0, 'Epheria Cog': 0,
	'Epheria Sailboat': 1, 'Epheria Frigate': 1,
	'Improved Epheria Sailboat': 2, 'Improved Epheria Frigate': 2,
	'Epheria Caravel': 3, 'Epheria Galleass': 3,
	'Carrack (Advance)': 4, 'Carrack (Balance)': 4, 'Carrack (Volante)': 4, 'Carrack (Valor)': 4,
	'Panokseon': 4
};

const SHIPS = new Set(shipGroups.filter(g => g.name === 'Ships' || g.name === 'Small craft').flatMap(g => g.items));
const PARTS = new Set(shipGroups.filter(g => g.name !== 'Ships' && g.name !== 'Small craft').flatMap(g => g.items));
const MONSTER_OF = Object.fromEntries(quests.filter(q => q.monster).map(q => [q.id, q.monster]));
const QUEST_IDS = new Set(quests.map(q => q.id));

/** A monster's name from its key, for a line of detail. */
export const monsterName = key => (monsterByKey[key] ? monsterByKey[key].name : key);
const SLOTS = ['cannon', 'sail', 'figurehead', 'plating'];
const STAT_KEYS = ['speed', 'accel', 'turn', 'brake', 'patience', 'force', 'focus', 'vision'];

const n = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const arr = v => (Array.isArray(v) ? v : []);
const levelOf = item => {
	const m = /^\+(\d+)\s+/.exec(String(item || ''));
	return m ? Number(m[1]) : 0;
};

/** A table of counts, the largest first, cut to `max` rows. */
function top(counts, max = 20) {
	return Object.fromEntries(Object.entries(counts).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, max));
}

/**
 * The fleet: every hull with a saved setup or a crew plan, and the best
 * of them -- the highest tier, and within a tier the one whose parts
 * add up to the most levels.
 */
function fleetOf(profile) {
	const hulls = new Map();   // ship -> { parts: {slot: level}, crystal, skins }
	const note = (ship, fitted, crystal, skin) => {
		if (typeof ship !== 'string' || !ship) return;
		const h = hulls.get(ship) || { parts: {}, crystal: 0, skins: 0 };
		for (const slot of SLOTS) {
			const lv = levelOf(obj(fitted)[slot]);
			if (lv > (h.parts[slot] || 0)) h.parts[slot] = lv;
		}
		if (n(crystal)) h.crystal = n(crystal);
		h.skins = Math.max(h.skins, Object.values(obj(skin)).filter(Boolean).length);
		hulls.set(ship, h);
	};
	for (const st of Object.values(obj(profile.setups))) note(obj(st).ship, st.fitted, st.crystal, st.skin);
	for (const [ship, fitted] of Object.entries(obj(profile.fitted))) note(ship, fitted, obj(profile.crystal)[ship], obj(profile.skins)[ship]);
	if (profile.crewShip) note(profile.crewShip, obj(profile.fitted)[profile.crewShip], obj(profile.crystal)[profile.crewShip], obj(profile.skins)[profile.crewShip]);
	let best = null;
	for (const [ship, h] of hulls) {
		const tier = HULL_TIER[ship] ?? 1;
		const levels = Object.values(h.parts).reduce((a, b) => a + b, 0);
		const score = tier * 100 + levels;
		if (!best || score > best.score) best = { ship, tier, parts: h.parts, levels, score };
	}
	const sorted = [...hulls.keys()].sort((a, b) => (HULL_TIER[b] ?? 1) - (HULL_TIER[a] ?? 1) || a.localeCompare(b));
	return {
		n: hulls.size,
		hulls: sorted,
		// Each hull with what is on it, for a card that shows the fleet.
		list: sorted.slice(0, 12).map(ship => ({ ship, tier: HULL_TIER[ship] ?? 1, ...hulls.get(ship) })),
		sailing: typeof profile.crewShip === 'string' ? profile.crewShip : null,
		best,
		// Every part fitted anywhere, with its level, for the fleet-wide
		// "most fitted" -- the base name, since a +7 and a +10 of one
		// cannon are the same choice.
		parts: top(Object.values(obj(profile.fitted)).flatMap(f => Object.values(obj(f)))
			.concat(Object.values(obj(profile.setups)).flatMap(st => Object.values(obj(obj(st).fitted))))
			.filter(x => typeof x === 'string' && x)
			.map(x => x.replace(/^\+\d+\s+/, ''))
			.reduce((c, name) => ((c[name] = (c[name] || 0) + 1), c), {}), 12),
		crystals: top([...hulls.values()].map(h => h.crystal).filter(Boolean).reduce((c, id) => ((c[id] = (c[id] || 0) + 1), c), {}), 8)
	};
}

/** The crew: who is aboard, the best of them, and the types hired. */
function crewOf(profile) {
	const roster = arr(profile.roster).filter(r => r && typeof r === 'object' && typeof r.type === 'string');
	const byType = {};
	const levels = new Array(11).fill(0);
	let lvSum = 0;
	const all = [];
	for (const r of roster) {
		const lv = Math.min(10, Math.max(1, n(r.lv) || 1));
		const stats = {};
		for (const k of STAT_KEYS) {
			const v = Number(obj(r.stats)[k]);
			if (Number.isFinite(v) && v > 0) stats[k] = Math.round(v * 10) / 10;
		}
		const sum = Math.round(Object.values(stats).reduce((a, b) => a + b, 0));
		byType[r.type] = (byType[r.type] || 0) + 1;
		levels[lv]++;
		lvSum += lv;
		all.push({ id: typeof r.id === 'string' ? r.id : '', name: String(r.name || r.type).slice(0, 30), type: r.type, lv, sum, score: lv * 1000 + sum, stats });
	}
	all.sort((a, b) => b.score - a.score);
	return {
		n: roster.length,
		best: all[0] || null,
		// The five best, for a card that shows the crew.
		top: all.slice(0, 5),
		byType: top(byType, 20), levels: levels.slice(1), avgLv: roster.length ? Math.round((lvSum / roster.length) * 10) / 10 : 0
	};
}

/** The runs: the tally's totals, and what the last sixty say about the best day. */
function runsOf(profile, tally) {
	const runs = arr(profile.runs).filter(r => r && typeof r === 'object');
	let best = null;
	const days = [0, 0, 0, 0, 0, 0, 0];   // Monday first
	for (const r of runs) {
		const net = n(r.silver) - n(r.cost);
		if (!best || net > best.net) best = { day: String(r.day || ''), silver: n(r.silver), net };
		const d = new Date(`${r.day}T00:00:00Z`);
		if (!Number.isNaN(d.getTime())) days[(d.getUTCDay() + 6) % 7]++;
	}
	// The tally is the career; the list is the last sixty. Whichever is
	// larger is the truth -- a save older than the tally has runs the
	// tally never saw.
	const fromList = k => runs.reduce((a, r) => a + n(r[k]), 0);
	return {
		n: Math.max(n(tally.runs), runs.length),
		silver: Math.max(n(tally.silver), fromList('silver')),
		cost: Math.max(n(tally.cost), fromList('cost')),
		trades: Math.max(n(tally.trades), fromList('trades')),
		parley: Math.max(n(tally.parley), fromList('parley')),
		stops: Math.max(n(tally.stops), fromList('stops')),
		best,
		days,
		last: runs.length ? String(runs[runs.length - 1].day || '') : null
	};
}

/** The quests: claims over a career, and the monsters they meant. */
function questsOf(profile, tally) {
	const byId = {};
	for (const [id, c] of Object.entries(obj(tally.quests))) if (n(c) && QUEST_IDS.has(id)) byId[id] = n(c);
	// A quest ticked now counts at least once, tally or not.
	for (const id of Object.keys(obj(profile.questsDone))) if (!byId[id]) byId[id] = 1;
	const hunts = {};
	for (const [id, c] of Object.entries(byId)) {
		const m = MONSTER_OF[id];
		if (m) hunts[m] = (hunts[m] || 0) + c;
	}
	const total = Object.values(byId).reduce((a, b) => a + b, 0);
	return {
		n: total,
		distinct: Object.keys(byId).length,
		byId: top(byId, 40),
		hunts: top(hunts, 20),
		huntsN: Object.values(hunts).reduce((a, b) => a + b, 0),
		favs: arr(profile.questFavs).filter(id => typeof id === 'string').slice(0, 40)
	};
}

/** The yard: what is queued, and what the tally says was made. */
function yardOf(save, tally) {
	const byItem = {};
	for (const t of arr(save.targets)) {
		if (!t || typeof t.item !== 'string') continue;
		byItem[t.item] = (byItem[t.item] || 0) + Math.max(1, n(t.qty) || 1);
	}
	const made = obj(tally.made);
	let ships = 0, parts = 0, crafts = 0;
	const shipsMade = {};
	for (const [item, c] of Object.entries(made)) {
		const k = n(c);
		if (!k) continue;
		crafts += k;
		const base = item.replace(/^\+\d+\s+/, '');
		if (SHIPS.has(base)) { ships += k; shipsMade[base] = (shipsMade[base] || 0) + k; } else if (PARTS.has(base)) parts += k;
	}
	return {
		queued: Object.values(byItem).reduce((a, b) => a + b, 0),
		byItem: top(byItem, 20),
		crafts, ships, parts,
		shipsMade: top(shipsMade, 10),
		tries: n(tally.tries), wins: n(tally.wins), drops: n(tally.drops)
	};
}

/** The charts: routes kept, traces drawn, and the islands plotted most. */
function chartsOf(profile) {
	const map = obj(obj(profile.views).map);
	const stops = {};
	const count = ids => { for (const id of arr(ids)) if (Number.isInteger(id)) stops[id] = (stops[id] || 0) + 1; };
	const routes = arr(map.savedRoutes).filter(r => r && typeof r === 'object');
	for (const r of routes) count(r.stops);
	count(map.stops);
	const traces = arr(map.traces).filter(t => t && typeof t === 'object');
	let points = 0;
	for (const t of [...traces, map.trace].filter(Boolean)) {
		points += arr(t.points).length;
		for (const st of arr(t.strokes)) points += arr(obj(st).pts).length;
	}
	return { routes: routes.length, traces: traces.length, points, stops: top(stops, 30) };
}

/**
 * The ship as the Ship tab would show it: the hull sailed, what is
 * fitted on each hull, the crystal and the appearance set, who sits
 * where, the saved setups and the whole roster with its growths, and
 * the mastery -- enough for the page to stand up the Ship tab on
 * another sailor's boat, to look at and not to keep. Already bounded
 * by the profile's own reading.
 */
function shipOf(profile) {
	const out = {};
	for (const k of ['crewShip', 'fitted', 'crystal', 'skins', 'seats', 'setups', 'roster', 'sailingMastery']) {
		if (profile[k] !== undefined) out[k] = profile[k];
	}
	return out;
}

/** The hold: how much is owned, and the silver among it. */
function stockOf(save) {
	const stock = obj(save.stock);
	let units = 0, items = 0;
	for (const [item, q] of Object.entries(stock)) {
		const k = n(q);
		if (!k || item === 'Silver' || item === 'Crow Coin') continue;
		items++;
		units += k;
	}
	return { items, units, silver: n(stock.Silver), crow: n(stock['Crow Coin']) };
}

/**
 * The digest of one save. Every number is bounded by the profile's own
 * bounds, and the tables are cut to their top rows, so the whole thing
 * is a few kilobytes whatever the save holds.
 */
export function digest(save) {
	const s = save && typeof save === 'object' ? save : {};
	// Through the profile's own reading first, so every string is cut
	// to its length and every count to its range before it is shared.
	const profile = readProfile(obj(s.profile));
	const tally = obj(profile.tally);
	return {
		v: 1,
		mastery: Math.min(3000, n(profile.sailingMastery)),
		level: typeof profile.level === 'string' ? profile.level.slice(0, 20) : null,
		barters: n(profile.barterCount),
		fleet: fleetOf(profile),
		crew: crewOf(profile),
		runs: runsOf(profile, tally),
		quests: questsOf(profile, tally),
		yard: yardOf(s, tally),
		charts: chartsOf(profile),
		stock: stockOf(s),
		ship: shipOf(profile)
	};
}

/**
 * The boards, and how each is scored. A board reads one number off a
 * digest and shows it beside a line of detail; `min` is the least
 * that earns a place, so an empty save is not first at nothing.
 */
export const BOARDS = [
	{ id: 'mastery', title: 'Sailing mastery', icon: '⚓', unit: '', min: 1,
		value: d => d.mastery, detail: d => (d.level ? d.level : '') },
	{ id: 'ship', title: 'Best ship', icon: '⛵', unit: 'pts', min: 1,
		value: d => (d.fleet.best ? d.fleet.best.score : 0),
		detail: d => (d.fleet.best ? `${d.fleet.best.ship}${d.fleet.best.levels ? ` · parts +${d.fleet.best.levels} in all` : ''}` : '') },
	{ id: 'fleet', title: 'Largest fleet', icon: '🚢', unit: 'hulls', min: 2,
		value: d => d.fleet.n, detail: d => d.fleet.hulls.slice(0, 3).join(', ') },
	{ id: 'sailor', title: 'Best sailor', icon: '🧭', unit: 'pts', min: 1001,
		value: d => (d.crew.best ? d.crew.best.score : 0),
		detail: d => (d.crew.best ? `${d.crew.best.name} · ${d.crew.best.type} · Lv ${d.crew.best.lv}${d.crew.best.sum ? ` · stats ${d.crew.best.sum}` : ''}` : '') },
	{ id: 'crew', title: 'Largest crew', icon: '👥', unit: 'sailors', min: 1,
		value: d => d.crew.n, detail: d => (d.crew.avgLv ? `average Lv ${d.crew.avgLv}` : '') },
	{ id: 'barters', title: 'Most barters', icon: '⇄', unit: 'barters', min: 1,
		value: d => d.barters, detail: () => '' },
	{ id: 'silver', title: 'Most silver from runs', icon: '💰', unit: 'silver', min: 1,
		value: d => d.runs.silver, detail: d => `${d.runs.n} run${d.runs.n === 1 ? '' : 's'}` },
	{ id: 'runs', title: 'Most runs sailed', icon: '🌊', unit: 'runs', min: 1,
		value: d => d.runs.n, detail: d => `${d.runs.stops} stops · ${d.runs.trades} trades` },
	{ id: 'bestday', title: 'Best single run', icon: '☀', unit: 'silver net', min: 1,
		value: d => (d.runs.best ? d.runs.best.net : 0), detail: d => (d.runs.best ? d.runs.best.day : '') },
	{ id: 'quests', title: 'Most quests done', icon: '✦', unit: 'quests', min: 1,
		value: d => d.quests.n, detail: d => `${d.quests.distinct} different` },
	{ id: 'hunts', title: 'Most sea monsters hunted', icon: '🦈', unit: 'hunts', min: 1,
		value: d => d.quests.huntsN, detail: d => Object.keys(d.quests.hunts).slice(0, 3).map(monsterName).join(', ') },
	{ id: 'ships', title: 'Most ships built', icon: '⚒', unit: 'ships', min: 1,
		value: d => d.yard.ships, detail: d => Object.keys(d.yard.shipsMade).slice(0, 2).join(', ') },
	{ id: 'crafts', title: 'Most things made', icon: '🔨', unit: 'crafts', min: 1,
		value: d => d.yard.crafts, detail: d => (d.yard.parts ? `${d.yard.parts} ship parts` : '') },
	{ id: 'luck', title: 'Luckiest at the anvil', icon: '🎲', unit: '% success', min: 1,
		value: d => (d.yard.tries >= 10 ? Math.round((d.yard.wins / d.yard.tries) * 100) : 0),
		detail: d => (d.yard.tries ? `${d.yard.wins} of ${d.yard.tries} attempts` : '') },
	{ id: 'charts', title: 'Cartographer', icon: '✎', unit: 'points', min: 1,
		value: d => d.charts.points, detail: d => `${d.charts.traces} trace${d.charts.traces === 1 ? '' : 's'} · ${d.charts.routes} route${d.charts.routes === 1 ? '' : 's'}` },
	{ id: 'hold', title: 'Fullest hold', icon: '📦', unit: 'units', min: 1,
		value: d => d.stock.units, detail: d => `${d.stock.items} kinds of thing` }
];
