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
import { shipStats } from './ship_stats.js';
import { quests } from './quests.js';
import { monsterByKey } from './sea_monsters.js';
import { readProfile } from './profile-shape.js';
import { loadout } from './part_stats.js';
import { families, FAMILY_RANK, FAMILY_LABEL } from './enhancement.js';
import { crystalById } from './sea_crystals.js';

/** The hulls that sail, from the small ones up. A rank for "best ship". */
export const HULL_TIER = {
	'Bartali Sailboat': 0, 'Raft': 0, 'Rowboat': 0, 'Calpheon Rowboat': 0, 'Mediah Rowboat': 0, 'Epheria Cog': 0,
	'Epheria Sailboat': 1, 'Epheria Frigate': 1,
	'Improved Epheria Sailboat': 2, 'Improved Epheria Frigate': 2,
	'Epheria Caravel': 3, 'Epheria Galleass': 3,
	'Carrack (Advance)': 4, 'Carrack (Balance)': 4, 'Carrack (Volante)': 4, 'Carrack (Valor)': 4,
	'Panokseon': 4
};

/**
 * How a ship is scored for the "Best ship" board.
 *
 * It used to be `tier * 100 + levels` -- the hull's rank, and the
 * enhancement levels on its four parts. That rated a +10 green Toro
 * cannon exactly as highly as a +10 yellow Falasi one, so three quite
 * different Carracks all landed on 440 and shared first place.
 *
 * A slot is worth its part's family first and its enhancement second:
 * `family * SLOT_FAMILY + level`, with SLOT_FAMILY one more than the
 * ten levels a part can take, so no amount of enhancing carries a green
 * part past a blue one. That is the order the game puts them in and the
 * order the Ship tab's picker already offered them in.
 *
 * The hull is worth far more than anything bolted to it, so it keeps a
 * whole order of magnitude to itself. The sea crystal counts as well --
 * it is a real slot and a real choice -- but deliberately for less than
 * one family step across the four parts: the best crystal in the game
 * is a drop, and a full yellow set is a season of work. At four a point
 * of grade, a Rusalka is worth 20 against the 44 that lifting four
 * parts from blue to yellow is worth, which is the right way round.
 *
 * The appearance set is deliberately left out. It carries stats, but it
 * is bought rather than earned and not everyone records it, so counting
 * it would rank the pearl shop.
 */
/**
 * What version of a digest this build writes.
 *
 * A digest is stored, not recomputed on every read -- that is what makes
 * the boards cheap. So a change to what a digest holds, or to how a
 * board scores one, leaves every stored digest saying the old thing
 * until its owner happens to save. That is exactly what happened when
 * the ship score began reading part quality: the sailor who pushed a
 * save was re-rated and everybody else stayed on the old number, on the
 * same board, which reads as a bug because it is one.
 *
 * The field has been in every digest since the first one and nothing
 * ever looked at it. Now the server does: a stored digest of another
 * version is re-read from the save it came from, so a scoring change
 * re-rates the whole board on the next rebuild and nobody has to do
 * anything.
 *
 * Bump this whenever a board's `value` changes, or a field a row draws
 * is added or dropped.
 *
 *   1  the first shape.
 *   2  the ship score reads part quality and the crystal; `sets`,
 *      `gear` and the face's `worth` are new.
 */
export const DIGEST_V = 2;

const SLOT_FAMILY = 11;
const HULL_WORTH = 1000;
const CRYSTAL_WORTH = 4;

/** The sea crystal grades in the order the game ranks them. */
const CRYSTAL_RANK = { eltro: 1, serni: 2, zulatia: 3, margoria: 4, rusalka: 5, nol: 5 };

/**
 * What one slot is worth: nothing when empty, else its family and its
 * level.
 *
 * A name with no family the app knows still counts its enhancement --
 * every one of the seventy-two parts in the tables has a family today,
 * but a part added by a patch the app has not caught up with should
 * score something rather than nothing.
 */
function slotWorth(name) {
	if (typeof name !== 'string' || !name) return 0;
	const base = name.replace(/^\+\d+\s+/, '');
	return (FAMILY_RANK[families[base]] || 0) * SLOT_FAMILY + levelOf(name);
}

/**
 * Which part sets are on a hull, best first -- "Chiro", or "Chiro, Toro"
 * for a hull wearing two. This is what makes the difference between two
 * ships legible on the board: "parts +40 in all" was true of a full
 * yellow set and of a half-green one alike, and said nothing about
 * which was which.
 */
function setsOf(fitted) {
	const seen = new Map();
	for (const name of Object.values(obj(fitted))) {
		const fam = families[String(name).replace(/^\+\d+\s+/, '')];
		if (fam && !seen.has(fam)) seen.set(fam, FAMILY_RANK[fam] || 0);
	}
	return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([fam]) => FAMILY_LABEL[fam] || fam);
}

/** What the crystal in the fifth slot is worth, by its grade. */
function crystalWorth(id) {
	const c = crystalById[Number(id)];
	return c ? (CRYSTAL_RANK[c.grade] || 0) * CRYSTAL_WORTH : 0;
}

const SHIPS = new Set(shipGroups.filter(g => g.name === 'Ships' || g.name === 'Small craft').flatMap(g => g.items));
/** Every hull the app knows -- the craftable ones and the Bartali
 *  Sailboat, which is nobody's recipe but everybody's first boat. */
const HULLS = new Set(Object.keys(shipStats));
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
 * The fleet: every hull owned or planned for, and the best of them --
 * the highest tier, and within a tier the one whose parts add up to the
 * most levels.
 *
 * A hull counts when it is held in the inventory, when a setup was
 * saved on it, when parts were fitted to it by hand, or when it is the
 * one being sailed. The inventory is the case that matters most: a
 * ship recorded in the hold is a ship owned, whether or not its owner
 * ever went to the Ship tab and named a setup for it.
 *
 * What is on a hull is what the Ship tab would show: the part chosen
 * by hand for a slot where one was, else the best part held in the
 * inventory for it. Only that one name per slot is read off the stock;
 * the stock itself is never shared.
 */
function fleetOf(profile, stock) {
	const hulls = new Map();   // ship -> { parts: {slot: level}, fitted: {slot: name}, crystal, skins }
	const owned = new Map();   // ship -> the best held part per slot
	const held = ship => {
		if (!owned.has(ship)) owned.set(ship, Object.fromEntries(loadout(ship, stock, families).slots.filter(x => x.part).map(x => [x.slot, x.level ? `+${x.level} ${x.part}` : x.part])));
		return owned.get(ship);
	};
	const note = (ship, fitted, crystal, skin) => {
		if (typeof ship !== 'string' || !ship) return;
		const h = hulls.get(ship) || { parts: {}, fitted: {}, crystal: 0, skins: 0 };
		const chosen = obj(fitted);
		for (const slot of SLOTS) {
			// A name chosen by hand; '' is a slot left empty on purpose;
			// nothing said means the best held.
			const name = typeof chosen[slot] === 'string' ? chosen[slot] : held(ship)[slot] || '';
			if (!name) continue;
			const lv = levelOf(name);
			if (!h.fitted[slot] || lv > (h.parts[slot] || 0)) { h.fitted[slot] = name; h.parts[slot] = lv; }
		}
		if (n(crystal)) h.crystal = n(crystal);
		h.skins = Math.max(h.skins, Object.values(obj(skin)).filter(Boolean).length);
		hulls.set(ship, h);
	};
	// The hulls in the hold come first, so a ship owned but never set up
	// is still a ship in the fleet.
	for (const [item, qty] of Object.entries(obj(stock))) {
		if (HULLS.has(item) && n(qty) > 0) note(item, obj(profile.fitted)[item], obj(profile.crystal)[item], obj(profile.skins)[item]);
	}
	for (const st of Object.values(obj(profile.setups))) note(obj(st).ship, st.fitted, st.crystal, st.skin);
	for (const [ship, fitted] of Object.entries(obj(profile.fitted))) note(ship, fitted, obj(profile.crystal)[ship], obj(profile.skins)[ship]);
	if (profile.crewShip) note(profile.crewShip, obj(profile.fitted)[profile.crewShip], obj(profile.crystal)[profile.crewShip], obj(profile.skins)[profile.crewShip]);
	let best = null;
	for (const [ship, h] of hulls) {
		const tier = HULL_TIER[ship] ?? 1;
		const levels = Object.values(h.parts).reduce((a, b) => a + b, 0);
		const gear = Object.values(h.fitted).reduce((a, name) => a + slotWorth(name), 0);
		const score = tier * HULL_WORTH + gear + crystalWorth(h.crystal);
		if (!best || score > best.score) {
			best = { ship, tier, parts: h.parts, fitted: h.fitted, levels, gear, score, crystal: h.crystal || 0, sets: setsOf(h.fitted) };
		}
	}
	const sorted = [...hulls.keys()].sort((a, b) => (HULL_TIER[b] ?? 1) - (HULL_TIER[a] ?? 1) || a.localeCompare(b));
	return {
		n: hulls.size,
		hulls: sorted,
		// Each hull with what is on it, for a card that shows the fleet.
		list: sorted.slice(0, 12).map(ship => ({ ship, tier: HULL_TIER[ship] ?? 1, ...hulls.get(ship) })),
		sailing: typeof profile.crewShip === 'string' ? profile.crewShip : null,
		best,
		// Every part fitted anywhere, for the fleet-wide "most fitted" --
		// the base name, since a +7 and a +10 of one cannon are the same
		// choice.
		parts: top([...hulls.values()].flatMap(h => Object.values(h.fitted))
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
function shipOf(profile, fleet) {
	const out = {};
	for (const k of ['crewShip', 'fitted', 'crystal', 'skins', 'seats', 'setups', 'roster', 'sailingMastery']) {
		if (profile[k] !== undefined) out[k] = profile[k];
	}
	// The parts as resolved, hull by hull -- the ones picked from the
	// inventory included, since the look has no inventory to pick from.
	const fitted = { ...obj(out.fitted) };
	for (const h of fleet.list) if (Object.keys(h.fitted).length) fitted[h.ship] = { ...obj(fitted[h.ship]), ...h.fitted };
	if (Object.keys(fitted).length) out.fitted = fitted;
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
	const fleet = fleetOf(profile, obj(s.stock));
	return {
		v: DIGEST_V,
		mastery: Math.min(3000, n(profile.sailingMastery)),
		level: typeof profile.level === 'string' ? profile.level.slice(0, 20) : null,
		barters: n(profile.barterCount),
		fleet,
		crew: crewOf(profile),
		runs: runsOf(profile, tally),
		quests: questsOf(profile, tally),
		yard: yardOf(s, tally),
		charts: chartsOf(profile),
		stock: stockOf(s),
		ship: shipOf(profile, fleet)
	};
}

/**
 * The boards, and how each is scored. A board reads one number off a
 * digest and shows it beside a line of detail; `min` is the least
 * that earns a place, so an empty save is not first at nothing.
 *
 * `desc` says what is counted, `how` what earns a place on an empty
 * board, and `face` is what the row shows beside the name: the hull
 * with its parts and crystal, the sailor's portrait, the monsters
 * hunted -- structured, so the page can draw the icons. `section`
 * groups the boards on the tab.
 */
/** The parts on a hull by name, from the ship the digest carries for a look. */
export function fittedOn(d, hull) {
	const ship = obj(d.ship);
	const byHand = obj(ship.fitted)[hull];
	if (byHand && typeof byHand === 'object') return byHand;
	for (const st of Object.values(obj(ship.setups))) {
		if (st && st.ship === hull && st.fitted && typeof st.fitted === 'object') return st.fitted;
	}
	return null;
}
const faceShip = d => (d.fleet.best ? {
	kind: 'ship', item: d.fleet.best.ship, parts: d.fleet.best.parts,
	fitted: d.fleet.best.fitted || fittedOn(d, d.fleet.best.ship), crystal: d.fleet.best.crystal || 0,
	// The score broken into its three parts, so a row can show its own
	// arithmetic rather than only the rule it was scored by. A digest
	// written before this carries no `worth` and simply shows less.
	worth: {
		hull: (d.fleet.best.tier ?? 1) * HULL_WORTH,
		gear: d.fleet.best.gear || 0,
		crystal: crystalWorth(d.fleet.best.crystal)
	}
} : null);
const faceItems = names => (names.length ? { kind: 'items', items: names } : null);
export const BOARDS = [
	{ id: 'mastery', section: 'sea', title: 'Sailing mastery', icon: '⚓', unit: '', min: 1,
		desc: 'mastery points, as set on the Ship tab', how: 'Set your sailing mastery on the Ship tab.',
		note: 'The number itself, as you set it on the Ship tab. Nothing is worked out from it.',
		value: d => d.mastery, detail: d => (d.level ? d.level : ''), face: () => null },
	{ id: 'ship', section: 'sea', title: 'Best ship', icon: '⛵', unit: 'pts', min: 1,
		desc: 'the hull, which parts are on it, and how far they are taken', how: 'Fit a ship on the Ship tab.',
		note: 'The hull is worth 1,000 a tier — a Carrack 4,000, a Caravel 3,000 — because it outweighs anything bolted to it. Each of the four slots is then worth its part\'s set (yellow 5, blue 4, green 3, Epheria 2, Sailboat 1) times eleven, plus its enhancement level. Eleven is one more than the ten levels a part takes, so no amount of enhancing carries a green part past a blue one. The sea crystal adds four a grade — less than lifting all four parts a tier is worth, since the best crystal is a drop and a yellow set is a season of work. The appearance set is not counted.',
		value: d => (d.fleet.best ? d.fleet.best.score : 0),
		// Which set, then how far it is taken: "parts +40 in all" was
		// true of a full yellow set and a half-green one alike, which is
		// exactly what the old score could not tell apart either. A
		// digest written before this has no `sets` and simply says less.
		detail: d => {
			const b = d.fleet.best;
			if (!b) return '';
			const sets = (b.sets || []).join(', ');
			return `${b.ship}${sets ? ` · ${sets}` : ''}${b.levels ? ` · +${b.levels} in all` : ''}`;
		},
		face: faceShip },
	{ id: 'fleet', section: 'sea', title: 'Largest fleet', icon: '🚢', unit: 'hulls', min: 2,
		desc: 'hulls owned, across your setups and your inventory', how: 'Own a second hull on the Ship tab.',
		note: 'Hulls, counted once each: every hull with a saved setup, with parts fitted by hand, or sitting in your Inventory. Two of the same hull are one hull here.',
		value: d => d.fleet.n, detail: d => d.fleet.hulls.slice(0, 3).join(', '), face: d => faceItems(d.fleet.hulls.slice(0, 4)) },
	{ id: 'sailor', section: 'sea', title: 'Best sailor', icon: '🧭', unit: 'pts', min: 1001,
		desc: 'the strongest hand aboard: level first, then growths', how: 'Hire a sailor on the Ship tab.',
		note: 'Your single best sailor: their level times a thousand, plus their growth percentages added up. Level decides it; the growths only break a tie.',
		value: d => (d.crew.best ? d.crew.best.score : 0),
		detail: d => (d.crew.best ? `${d.crew.best.name} · ${d.crew.best.type} · Lv ${d.crew.best.lv}${d.crew.best.sum ? ` · stats ${d.crew.best.sum}` : ''}` : ''),
		face: d => (d.crew.best ? { kind: 'sailor', type: d.crew.best.type, name: d.crew.best.name, lv: d.crew.best.lv, stats: d.crew.best.stats } : null) },
	{ id: 'crew', section: 'sea', title: 'Largest crew', icon: '👥', unit: 'sailors', min: 1,
		desc: 'sailors hired across every roster', how: 'Hire sailors on the Ship tab.',
		note: 'Sailors on the roster, however they are seated.',
		value: d => d.crew.n, detail: d => (d.crew.avgLv ? `average Lv ${d.crew.avgLv}` : ''),
		face: d => (Object.keys(d.crew.byType).length ? { kind: 'sailors', types: Object.keys(d.crew.byType).slice(0, 4) } : null) },
	{ id: 'barters', section: 'runs', title: 'Most barters', icon: '⇄', unit: 'barters', min: 1,
		desc: 'the barter count, as set on the Barter tab', how: 'Set your barter count on the Barter tab.',
		note: 'The number itself, as you set it on the Barter tab.',
		value: d => d.barters, detail: d => (d.level ? d.level : ''), face: () => null },
	{ id: 'silver', section: 'runs', title: 'Most silver from runs', icon: '💰', unit: 'silver', min: 1,
		desc: 'silver over every run logged', how: 'Log a run on the Barter tab.',
		note: 'Silver over every run logged. The career tally is used where it is larger than the last sixty runs, since a save keeps only those.',
		value: d => d.runs.silver, detail: d => `${d.runs.n} run${d.runs.n === 1 ? '' : 's'} · ${d.runs.trades} trade${d.runs.trades === 1 ? '' : 's'}`, face: () => null },
	{ id: 'runs', section: 'runs', title: 'Most runs sailed', icon: '🌊', unit: 'runs', min: 1,
		desc: 'runs logged, over the whole career', how: 'Log a run on the Barter tab.',
		note: 'Runs logged over the career, by the same reckoning as the silver.',
		value: d => d.runs.n, detail: d => `${d.runs.stops} stops · ${d.runs.trades} trades`, face: () => null },
	{ id: 'bestday', section: 'runs', title: 'Best single run', icon: '☀', unit: 'silver net', min: 1,
		desc: 'the most silver netted in one run', how: 'Log a run on the Barter tab.',
		note: 'The most silver netted in a single run — what it paid, less what it cost — over the last sixty.',
		value: d => (d.runs.best ? d.runs.best.net : 0), detail: d => (d.runs.best ? d.runs.best.day : ''), face: () => null },
	{ id: 'quests', section: 'quests', title: 'Most quests done', icon: '✦', unit: 'quests', min: 1,
		desc: 'claims over the career, on the Quests tab', how: 'Claim a quest on the Quests tab.',
		note: 'Every quest claim over the career, counting a quest claimed twice as two.',
		value: d => d.quests.n, detail: d => `${d.quests.distinct} different`, face: () => null },
	{ id: 'hunts', section: 'quests', title: 'Most sea monsters hunted', icon: '🦈', unit: 'hunts', min: 1,
		desc: 'from the hunting quests done', how: 'Claim a hunting quest on the Quests tab.',
		note: 'Claims of the hunting quests only, which is what the app can see of a monster killed.',
		value: d => d.quests.huntsN, detail: d => Object.keys(d.quests.hunts).slice(0, 3).map(monsterName).join(', '),
		face: d => (Object.keys(d.quests.hunts).length ? { kind: 'monsters', keys: Object.keys(d.quests.hunts).slice(0, 4) } : null) },
	{ id: 'ships', section: 'yard', title: 'Most ships built', icon: '⚒', unit: 'ships', min: 1,
		desc: 'hulls made in the Workshop', how: 'Craft a hull in the Workshop.',
		note: 'Hulls recorded as made in the Workshop.',
		value: d => d.yard.ships, detail: d => Object.keys(d.yard.shipsMade).slice(0, 2).join(', '), face: d => faceItems(Object.keys(d.yard.shipsMade).slice(0, 4)) },
	{ id: 'crafts', section: 'yard', title: 'Most things made', icon: '🔨', unit: 'crafts', min: 1,
		desc: 'everything crafted in the Workshop', how: 'Craft anything in the Workshop.',
		note: 'Everything recorded as made in the Workshop, hulls and parts and materials alike.',
		value: d => d.yard.crafts, detail: d => (d.yard.parts ? `${d.yard.parts} ship parts` : ''), face: () => null },
	{ id: 'luck', section: 'yard', title: 'Luckiest at the anvil', icon: '🎲', unit: '% success', min: 1,
		desc: 'successes per attempt, over ten or more tries', how: 'Record ten enhancement attempts in the Workshop.',
		note: 'Successes per attempt at the anvil, as a percentage, and only once ten attempts are recorded — three lucky tries are not a record.',
		value: d => (d.yard.tries >= 10 ? Math.round((d.yard.wins / d.yard.tries) * 100) : 0),
		detail: d => (d.yard.tries ? `${d.yard.wins} of ${d.yard.tries} attempts` : ''), face: () => null },
	{ id: 'charts', section: 'charts', title: 'Cartographer', icon: '✎', unit: 'points', min: 1,
		desc: 'points in the traces drawn on the chart', how: 'Draw a trace on the Map tab.',
		note: 'Points in the traces drawn on the chart, so a long coast counts more than a short one.',
		value: d => d.charts.points, detail: d => `${d.charts.traces} trace${d.charts.traces === 1 ? '' : 's'} · ${d.charts.routes} route${d.charts.routes === 1 ? '' : 's'}`, face: () => null },
	{ id: 'hold', section: 'charts', title: 'Fullest hold', icon: '📦', unit: 'units', min: 1,
		desc: 'units in the Inventory, all kinds together', how: 'Add stock on the Inventory tab.',
		note: 'Units in the Inventory, every kind added together. Silver and Crow Coin are left out; they would drown everything else.',
		value: d => d.stock.units, detail: d => `${d.stock.items} kinds of thing`, face: () => null }
];

/** The sections the boards are grouped under on the tab. */
export const SECTIONS = [
	{ id: 'sea', icon: '⚓', title: 'The sea' },
	{ id: 'runs', icon: '⇄', title: 'The runs' },
	{ id: 'quests', icon: '✦', title: 'Quests & hunts' },
	{ id: 'yard', icon: '⚒', title: 'The yard' },
	{ id: 'charts', icon: '✎', title: 'Charts & hold' }
];
