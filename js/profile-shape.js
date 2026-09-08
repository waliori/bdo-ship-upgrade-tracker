// What a save's profile may hold, and how each field is bounded.
//
// The profile travels with the save, exports and syncs, so a save written
// by a newer version -- or by hand -- must not put anything unexpected in
// front of the planner. Only known keys survive, each clipped to the
// range the game itself allows. state.js calls this on every read.

import { readOrders } from './barter-orders.js';

/**
 * The profile, keyed and bounded.
 *
 * Only known keys survive, so a save written by a newer version cannot
 * put anything unexpected in front of the planner. `barterCount` is a
 * running total that only goes up, and a Value Pack is on or it is not.
 */
export const isProfile = raw => Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);

/** The tally's plain totals, and its tables of name -> count. */
export const TALLY_TOTALS = ['runs', 'silver', 'cost', 'trades', 'parley', 'stops', 'tries', 'wins', 'drops'];
export const TALLY_TABLES = ['quests', 'made'];

export function readProfile(raw) {
	const out = {};
	if (!isProfile(raw)) return out;
	const count = Math.max(0, Math.floor(Number(raw.barterCount) || 0));
	if (count > 0) out.barterCount = count;
	if (raw.valuePack === true) out.valuePack = true;
	if (raw.crew === true) out.crew = true;
	if (typeof raw.level === 'string' && raw.level) out.level = raw.level.slice(0, 20);
	const vouchers = Math.max(0, Math.floor(Number(raw.vouchers) || 0));
	if (vouchers > 0) out.vouchers = vouchers;
	const held = Math.max(0, Math.floor(Number(raw.parleyHeld) || 0));
	if (held > 0) out.parleyHeld = held;
	// The failstack the player takes into a yellow attempt. Bounded the
	// way the game bounds one; zero means "the quoted stack", so only a
	// real number is kept.
	// The failstack each yellow part currently carries, by part. Absent
	// means "the stack the quoted rate assumes for its next level".
	if (isProfile(raw.failstacks)) {
		const stacks = {};
		for (const [base, n] of Object.entries(raw.failstacks)) {
			const v = Math.min(500, Math.max(0, Math.floor(Number(n))));
			if (Number.isFinite(v) && typeof base === 'string' && base.length <= 80) stacks[base] = v;
		}
		if (Object.keys(stacks).length) out.failstacks = stacks;
	}
	// The crew plan: which hull it is for, and how many of each sailor
	// type. Types are checked where they are used (sailors.js knows the
	// pool); here a name is a name and a count is a small whole number.
	if (typeof raw.crewShip === 'string' && raw.crewShip) out.crewShip = raw.crewShip.slice(0, 60);
	// The crew itself: the sailors hired (a name, a type, a level and a
	// condition each), who sits where on each hull, and two saved
	// arrangements per hull. Bounded the way the game bounds them -- sixty
	// sailors, levels one to ten, condition nought to a hundred.
	if (Array.isArray(raw.roster)) {
		const seen = new Set();
		const roster = [];
		for (const r of raw.roster.slice(0, 60)) {
			if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue;
			if (typeof r.type !== 'string' || !r.type) continue;
			seen.add(r.id);
			const entry = {
				id: r.id.slice(0, 24),
				name: String(r.name || r.type).slice(0, 30),
				type: r.type.slice(0, 40),
				lv: Math.min(10, Math.max(1, Math.floor(Number(r.lv) || 1))),
				cond: Math.min(100, Math.max(0, Math.floor(Number(r.cond ?? 100))))
			};
			// The sailor's real stats as the game shows them, when typed in.
			if (isProfile(r.stats)) {
				const st = {};
				for (const k of ['speed', 'accel', 'turn', 'brake', 'patience', 'force', 'focus', 'vision']) {
					const v = Number(r.stats[k]);
					if (Number.isFinite(v) && v >= 0 && v <= 500) st[k] = Math.round(v * 10) / 10;
				}
				if (Object.keys(st).length) entry.stats = st;
			}
			// The level log: when the level changed, to what, and the stats
			// typed at the time. Thirty steps at most, the oldest dropped.
			if (Array.isArray(r.log)) {
				const log = [];
				for (const e of r.log.slice(-60)) {
					if (!e || typeof e !== 'object') continue;
					const t = Number(e.t), level = Math.floor(Number(e.level));
					if (!Number.isFinite(t) || t <= 0 || !(level >= 1 && level <= 10)) continue;
					const step = { t, level };
					if (isProfile(e.stats)) {
						const st = {};
						for (const k of ['speed', 'accel', 'turn', 'brake', 'patience', 'force', 'focus', 'vision']) {
							const v = Number(e.stats[k]);
							if (Number.isFinite(v) && v >= 0 && v <= 500) st[k] = Math.round(v * 10) / 10;
						}
						if (Object.keys(st).length) step.stats = st;
					}
					log.push(step);
				}
				if (log.length) entry.log = log.slice(-30);
			}
			roster.push(entry);
		}
		if (roster.length) out.roster = roster;
	}
	const seatMap = raw => {
		if (!isProfile(raw)) return null;
		const m = {};
		for (const [seat, id] of Object.entries(raw)) {
			if (/^[a-z]+:\d{1,2}$/.test(seat) && typeof id === 'string' && id) m[seat] = id.slice(0, 24);
		}
		return Object.keys(m).length ? m : null;
	};
	/** The four appearance slots a hull can wear, as flags. */
	const skinMap = raw => {
		if (!isProfile(raw)) return null;
		const m = {};
		for (const slot of ['cannon', 'sail', 'figurehead', 'plating']) {
			if (raw[slot] === true || raw[slot] === 1) m[slot] = true;
		}
		return Object.keys(m).length ? m : null;
	};
	if (isProfile(raw.seats)) {
		const seats = {};
		for (const [ship, m] of Object.entries(raw.seats)) {
			const clean = seatMap(m);
			if (clean && ship.length <= 60) seats[ship] = clean;
		}
		if (Object.keys(seats).length) out.seats = seats;
	}
	if (isProfile(raw.presets)) {
		const presets = {};
		for (const [ship, p] of Object.entries(raw.presets)) {
			if (!isProfile(p) || ship.length > 60) continue;
			const clean = {};
			for (const k of ['p1', 'p2']) {
				const m = seatMap(p[k]);
				if (m) clean[k] = m;
			}
			if (Object.keys(clean).length) presets[ship] = clean;
		}
		if (Object.keys(presets).length) out.presets = presets;
	}
	// What is fitted on each hull by hand: slot -> item (with its level),
	// or '' for an empty slot. Absent means "the best you own".
	if (isProfile(raw.fitted)) {
		const fitted = {};
		for (const [ship, slots] of Object.entries(raw.fitted)) {
			if (ship.length > 60 || !isProfile(slots)) continue;
			const clean = {};
			for (const [slot, item] of Object.entries(slots)) {
				if (['cannon', 'sail', 'figurehead', 'plating'].includes(slot) && typeof item === 'string' && item.length <= 80) clean[slot] = item;
			}
			if (Object.keys(clean).length) fitted[ship] = clean;
		}
		if (Object.keys(fitted).length) out.fitted = fitted;
	}
	// The appearance set worn on each hull: slot -> true. Four fixed
	// slots, the same four the parts use, and nothing but a boolean --
	// which set it is follows from the hull, so there is no name to keep.
	if (isProfile(raw.skins)) {
		const skins = {};
		for (const [ship, slots] of Object.entries(raw.skins)) {
			if (ship.length > 60 || !isProfile(slots)) continue;
			const clean = skinMap(slots);
			if (clean) skins[ship] = clean;
		}
		if (Object.keys(skins).length) out.skins = skins;
	}
	// The sea crystal on each hull, by its codex id: one slot, one crystal.
	if (isProfile(raw.crystal)) {
		const crystal = {};
		for (const [ship, id] of Object.entries(raw.crystal)) {
			const n = Math.floor(Number(id));
			if (ship.length <= 60 && Number.isFinite(n) && n > 0) crystal[ship] = n;
		}
		if (Object.keys(crystal).length) out.crystal = crystal;
	}
	// The Quests tab's memory: which pick-one reward was taken last time
	// (quest id -> choice index), the favourites, and named groups of
	// quests finished together.
	if (isProfile(raw.questPicks)) {
		const picks = {};
		for (const [id, i] of Object.entries(raw.questPicks).slice(0, 100)) {
			const n = Math.floor(Number(i));
			if (id.length <= 40 && Number.isFinite(n) && n >= 0 && n < 10) picks[id] = n;
		}
		if (Object.keys(picks).length) out.questPicks = picks;
	}
	if (Array.isArray(raw.questFavs)) {
		const favs = [...new Set(raw.questFavs.filter(id => typeof id === 'string' && id && id.length <= 40))].slice(0, 100);
		if (favs.length) out.questFavs = favs;
	}
	if (isProfile(raw.questGroups)) {
		const groups = {};
		for (const [name, ids] of Object.entries(raw.questGroups).slice(0, 12)) {
			if (!name || name.length > 30 || !Array.isArray(ids)) continue;
			const clean = [...new Set(ids.filter(id => typeof id === 'string' && id && id.length <= 40))].slice(0, 100);
			if (clean.length) groups[name] = clean;
		}
		if (Object.keys(groups).length) out.questGroups = groups;
	}
	// Saved ship setups -- a hull with its parts, crystal, skin and
	// seating -- to switch between, and the sailing mastery the game
	// shows. The ceiling is high because the fleet is a searched, paged
	// dialog now rather than a list drawn on the screen: keeping fifty
	// costs the same to draw as keeping five.
	if (isProfile(raw.setups)) {
		const setups = {};
		for (const [id, st] of Object.entries(raw.setups).slice(0, 200)) {
			if (!isProfile(st) || id.length > 24 || typeof st.ship !== 'string' || !st.ship) continue;
			const clean = { name: String(st.name || st.ship).slice(0, 40), ship: st.ship.slice(0, 60) };
			if (isProfile(st.fitted)) {
				const f = {};
				for (const [slot, item] of Object.entries(st.fitted)) {
					if (['cannon', 'sail', 'figurehead', 'plating'].includes(slot) && typeof item === 'string' && item.length <= 80) f[slot] = item;
				}
				if (Object.keys(f).length) clean.fitted = f;
			}
			const cr = Math.floor(Number(st.crystal));
			if (Number.isFinite(cr) && cr > 0) clean.crystal = cr;
			const sm = seatMap(st.seats);
			if (sm) clean.seats = sm;
			const sk = skinMap(st.skin);
			if (sk) clean.skin = sk;
			setups[id] = clean;
		}
		if (Object.keys(setups).length) out.setups = setups;
	}
	const mastery = Math.floor(Number(raw.sailingMastery));
	if (Number.isFinite(mastery) && mastery > 0) out.sailingMastery = Math.min(3000, mastery);
	// Where each build stood, day by day, for the pace: build id -> date
	// -> units covered. Bounded to a month per build and twenty builds.
	if (isProfile(raw.progress)) {
		const progress = {};
		for (const [id, days] of Object.entries(raw.progress).slice(0, 20)) {
			if (id.length > 40 || !isProfile(days)) continue;
			const clean = {};
			for (const [d, n] of Object.entries(days).sort().slice(-31)) {
				const v = Math.floor(Number(n));
				if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v) && v >= 0) clean[d] = v;
			}
			if (Object.keys(clean).length) progress[id] = clean;
		}
		if (Object.keys(progress).length) out.progress = progress;
	}
	// Which quests are done, stamped with the period they were done in:
	// a date for a daily, a week key for a weekly, 'once' for the chain.
	// A stamp from an earlier period simply stops matching at the reset,
	// so nothing has to sweep them.
	// Where the stock is: per item, how many sit in which storage. A
	// note beside the count, never a second count -- the total stays the
	// number the plan works from.
	if (isProfile(raw.stash)) {
		const stash = {};
		for (const [item, towns] of Object.entries(raw.stash)) {
			if (item.length > 80 || !isProfile(towns)) continue;
			const clean = {};
			for (const [town, n] of Object.entries(towns)) {
				const v = Math.floor(Number(n));
				if (town.length <= 40 && Number.isFinite(v) && v >= 0) clean[town] = v;
			}
			if (Object.keys(clean).length) stash[item] = clean;
		}
		if (Object.keys(stash).length) out.stash = stash;
	}
	// Where new things land, by kind: the storage a count added to a
	// material, a part or a trade good is noted at, when it is not the
	// bags -- a barterer who keeps the goods at Iliya says so once.
	if (isProfile(raw.homes)) {
		const homes = {};
		for (const kind of ['materials', 'parts', 'goods']) {
			const town = raw.homes[kind];
			if (typeof town === 'string' && town && town.length <= 40) homes[kind] = town;
		}
		if (Object.keys(homes).length) out.homes = homes;
	}
	// The sailing orders: what a barter run is for. Cleaned by the
	// module that owns the shape.
	if (isProfile(raw.orders)) out.orders = readOrders(raw.orders);
	// The runs sailed: day, silver, cost, trades, Parley, stops -- the
	// last sixty, for the week's view.
	if (Array.isArray(raw.runs)) {
		const runs = raw.runs.filter(r => r && /^\d{4}-\d{2}-\d{2}$/.test(String(r.day))).slice(-60).map(r => ({
			day: String(r.day),
			silver: Math.max(0, Math.floor(Number(r.silver) || 0)),
			cost: Math.max(0, Math.floor(Number(r.cost) || 0)),
			trades: Math.max(0, Math.floor(Number(r.trades) || 0)),
			parley: Math.max(0, Math.floor(Number(r.parley) || 0)),
			stops: Math.max(0, Math.floor(Number(r.stops) || 0)),
			goal: r.goal === 'material' ? 'material' : 'silver',
			item: typeof r.item === 'string' && r.item.length <= 80 ? r.item : ''
		}));
		if (runs.length) out.runs = runs;
	}
	// What islands were seen to pay on the sailor's own runs: per
	// exchange, how often each count of the range came up; per island,
	// which of its four [Level 7] goods it paid last, and when.
	if (isProfile(raw.ratios)) {
		const ratios = {};
		for (const [k, counts] of Object.entries(raw.ratios).slice(0, 400)) {
			if (k.length > 200 || !isProfile(counts)) continue;
			const clean = {};
			for (const [n, c] of Object.entries(counts)) {
				const v = Math.floor(Number(c));
				if (/^\d{1,2}$/.test(n) && Number.isFinite(v) && v > 0) clean[n] = Math.min(9999, v);
			}
			if (Object.keys(clean).length) ratios[k] = clean;
		}
		if (Object.keys(ratios).length) out.ratios = ratios;
	}
	if (isProfile(raw.sevens)) {
		const sevens = {};
		for (const [npc, v] of Object.entries(raw.sevens).slice(0, 100)) {
			if (!/^\d+$/.test(npc) || !isProfile(v) || typeof v.item !== 'string' || v.item.length > 80) continue;
			sevens[npc] = { item: v.item, day: /^\d{4}-\d{2}-\d{2}$/.test(String(v.day)) ? String(v.day) : '' };
		}
		if (Object.keys(sevens).length) out.sevens = sevens;
	}
	// The material list as the sailor saw it, day by day: which island
	// showed which exchange. The last fourteen days, for the record.
	if (isProfile(raw.matSeen)) {
		const seen = {};
		for (const [day, rows] of Object.entries(raw.matSeen).sort().slice(-14)) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(rows)) continue;
			const clean = rows.filter(r => Array.isArray(r) && Number.isInteger(Number(r[0])) && typeof r[1] === 'string' && typeof r[2] === 'string' && r[1].length <= 80 && r[2].length <= 80)
				.slice(0, 120).map(r => [Number(r[0]), r[1], r[2]]);
			if (clean.length) seen[day] = clean;
		}
		if (Object.keys(seen).length) out.matSeen = seen;
	}
	// Land goods the sailor's own workers make: they cost a run nothing.
	if (Array.isArray(raw.homemade)) {
		const made = [...new Set(raw.homemade.filter(n => typeof n === 'string' && n && n.length <= 80))].slice(0, 200);
		if (made.length) out.homemade = made;
	}
	// The running totals of a career: quests claimed by id, runs sailed
	// and what they brought, things made by name, enhancement attempts.
	// They only go up, and they are what the community boards read,
	// since the save itself keeps a quest's current period and the last
	// sixty runs and no more. Bounded so a hostile file cannot make the
	// save enormous: four hundred names in each table, and totals that
	// fit a whole number.
	if (isProfile(raw.tally)) {
		const tally = {};
		const total = v => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(Number(v) || 0)));
		for (const k of TALLY_TOTALS) {
			const v = total(raw.tally[k]);
			if (v > 0) tally[k] = v;
		}
		for (const k of TALLY_TABLES) {
			if (!isProfile(raw.tally[k])) continue;
			const table = {};
			for (const [name, c] of Object.entries(raw.tally[k]).slice(0, 400)) {
				const v = total(c);
				if (name.length <= 80 && v > 0) table[name] = v;
			}
			if (Object.keys(table).length) tally[k] = table;
		}
		if (Object.keys(tally).length) out.tally = tally;
	}
	if (isProfile(raw.questsDone)) {
		const done = {};
		for (const [id, key] of Object.entries(raw.questsDone)) {
			if (id.length <= 40 && typeof key === 'string' && /^(once|W?\d{4}-\d{2}-\d{2})$/.test(key)) done[id] = key;
		}
		if (Object.keys(done).length) out.questsDone = done;
	}
	// How the Map and the Barter screens were left: the run being sailed,
	// the traces drawn, the board answered. Bounded below; see readViews.
	const views = readViews(raw.views);
	if (views) out.views = views;
	// How far a counted quest has come in its period -- the barters
	// done towards a barter quest -- as { key, n } by quest.
	if (isProfile(raw.questProgress)) {
		const prog = {};
		for (const [id, v] of Object.entries(raw.questProgress)) {
			if (id.length <= 40 && isProfile(v) && typeof v.key === 'string' && /^(once|W?\d{4}-\d{2}-\d{2})$/.test(v.key) && Number(v.n) > 0) prog[id] = { key: v.key, n: Math.floor(Number(v.n)) };
		}
		if (Object.keys(prog).length) out.questProgress = prog;
	}
	return out;
}

/* ------------------------------------------------------------------ *
 * Screen views
 * ------------------------------------------------------------------ */

// Which screens may keep their state in the profile. A view is the
// screen's own shape -- the screen reads it back with its own checks --
// so the profile only bounds it: known namespaces, strings and numbers
// that are what they say, and lists no longer than the screen would
// ever draw, so a hostile file cannot make the save enormous.
export const VIEW_NAMESPACES = ['map', 'barter'];
export const VIEW_BYTES = 300_000;
const VIEW_STRING = 120;
const VIEW_DEPTH = 8;
const VIEW_LIST = 200;

// The size a list or a table may have, by its place in the view. A
// path reads as the keys down from the namespace, with `[]` for "each
// entry of the list". Anything unnamed here gets VIEW_LIST.
const VIEW_CAPS = {
	map: {
		'savedRoutes': 9, 'savedRoutes[].stops': 40,
		'traces': 20, 'traces[].points': 2000, 'traces[].strokes': 24, 'traces[].strokes[].pts': 2000,
		'traces[].areas': 12, 'traces[].areas[].pts': 200, 'traces[].texts': 40,
		'trace.points': 2000, 'trace.strokes': 24, 'trace.strokes[].pts': 2000, 'trace.areas': 12, 'trace.areas[].pts': 200, 'trace.texts': 40,
		'stops': 60, 'done.ids': 200, 'runTrades': 60, 'runStash': 20
	},
	barter: {
		'board.answers': 120, 'matBoard.answers': 120, 'wants': 60, 'routes.ids': 40,
		'sail.stops': 80, 'sail.done': 80, 'questSkip.ids': 100, 'questPull.ids': 100
	}
};
// The one string a player writes at length: a trace's notes.
const VIEW_LONG = { 'trace.notes': 400, 'traces[].notes': 400 };

function cleanViewValue(value, caps, path, depth) {
	if (typeof value === 'string') return value.slice(0, VIEW_LONG[path] || VIEW_STRING);
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value === 'boolean' || value === null) return value;
	if (typeof value !== 'object' || depth > VIEW_DEPTH) return undefined;
	const cap = caps[path] || VIEW_LIST;
	if (Array.isArray(value)) {
		const out = [];
		for (const v of value) {
			if (out.length >= cap) break;
			const c = cleanViewValue(v, caps, `${path}[]`, depth + 1);
			if (c !== undefined) out.push(c);
		}
		return out;
	}
	const out = {};
	let n = 0;
	for (const [k, v] of Object.entries(value)) {
		if (n >= cap) break;
		if (k.length > VIEW_STRING) continue;
		const c = cleanViewValue(v, caps, path ? `${path}.${k}` : k, depth + 1);
		if (c === undefined) continue;
		out[k] = c;
		n++;
	}
	return out;
}

/**
 * Every list inside a view with the weight that is its own: what it
 * serialises to, less what the lists inside it do. A list of traces is
 * light by that measure though it holds everything -- its points are
 * the weight -- so the points give way and the traces stay, each with
 * its name and its newest marks. Returns the bytes the lists under
 * `value` account for; the lists themselves land in `out`.
 */
function weighLists(value, out) {
	if (!value || typeof value !== 'object') return 0;
	if (Array.isArray(value)) {
		const total = JSON.stringify(value).length;
		let inner = 0;
		for (const v of value) inner += weighLists(v, out);
		out.push({ list: value, weight: total - inner });
		return total;
	}
	let inner = 0;
	for (const v of Object.values(value)) inner += weighLists(v, out);
	return inner;
}

/**
 * One screen's view, bounded. The caps above hold each list to what
 * the screen draws; the byte cap is the backstop for a view that is
 * within every cap and still too big, where the oldest entries of the
 * heaviest lists go first -- the last routes traced, not the setting
 * that says which way the panel folds.
 */
export function readView(ns, raw) {
	if (!VIEW_NAMESPACES.includes(ns) || !isProfile(raw)) return null;
	const view = cleanViewValue(raw, VIEW_CAPS[ns], '', 0);
	if (!view || !Object.keys(view).length) return null;
	let size = JSON.stringify(view).length;
	while (size > VIEW_BYTES) {
		const lists = [];
		weighLists(view, lists);
		const heavy = lists.filter(l => l.list.length).sort((a, b) => b.weight - a.weight);
		if (!heavy.length) return null;
		// The heavy lists are cut together, each to its share of the room
		// with a little to spare, so a view many times over the cap comes
		// down in a pass or two rather than a sliver at a time; a light
		// list -- the traces themselves, the stops -- is left alone.
		const ratio = (VIEW_BYTES / size) * 0.9;
		const light = size / heavy.length / 4;
		let cut = false;
		for (const l of heavy) {
			if (l.weight < light) break;
			const keep = Math.floor(l.list.length * ratio);
			if (keep < l.list.length) {
				l.list.splice(0, l.list.length - keep);
				cut = true;
			}
		}
		if (!cut) heavy[0].list.splice(0, Math.max(1, Math.ceil(heavy[0].list.length / 4)));
		size = JSON.stringify(view).length;
	}
	return view;
}

/** The views table: known namespaces only, each bounded. */
export function readViews(raw) {
	if (!isProfile(raw)) return null;
	const out = {};
	for (const ns of VIEW_NAMESPACES) {
		const view = readView(ns, raw[ns]);
		if (view) out[ns] = view;
	}
	return Object.keys(out).length ? out : null;
}
