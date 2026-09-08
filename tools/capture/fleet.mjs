// An example fleet, and the server answers that put it on the boards.
//
// The Community tab needs sign-in, a database and other people in it,
// none of which a capture machine has. So the four sailors below are
// invented and every /api answer about them is served from here: the
// tab itself is the real one, running the real digest and the real
// ranking, against a fleet that does not exist.
//
// That is the one place in this harness where something is staged, and
// it is staged in the open -- the README and the film both say the
// fleet is an example. Everything else drives real data.
//
// Two consumers: comm-audit.mjs, which looks the tab over headlessly,
// and the captures, which film it.

import { digest, BOARDS } from '../../js/digest.js';

const roster = (types, lvs) => types.map((t, i) => ({ id: `s${i}`, name: ['Bram', 'Ilse', 'Koro', 'Nell', 'Pim', 'Sae', 'Tova', 'Ulf'][i % 8] + (i > 7 ? i : ''), type: t, lv: lvs[i] || 5, cond: 100, stats: { speed: 2 + (lvs[i] || 5) * 0.3, accel: 1 + (lvs[i] || 5) * 0.1, turn: 0.8, brake: 0.8 } }));
const runs = (n, silver, day0 = 10) => Array.from({ length: n }, (_, i) => ({ day: `2026-08-${String(day0 + (i % 18)).padStart(2, '0')}`, silver: silver + i * 1e7, cost: 2e7, trades: 40 + i, parley: 900000, stops: 8 }));
const SAILORS = [
	{ id: '1001', username: 'waliori', avatar: null, share: 'named', joinedAt: Date.parse('2026-09-07'), save: {
		stock: { Silver: 1.2e9, 'Crow Coin': 1830, 'Tidal Black Stone': 320, 'Timber for Upgrade': 200, 'Zinc Ingot': 900, '+10 Epheria Carrack: Toro Cannon': 1, "+10 Epheria Carrack: Advance (Chiro's Sail)": 1, '+10 Epheria Carrack: Toro Figurehead': 1, "+10 Epheria Carrack: Advance (Chiro's Black Plating)": 1, '+7 Epheria Carrack: Toro Cannon': 1 },
		targets: [{ item: "Epheria Carrack: Advance (Chiro's Figurehead)", qty: 1 }, { item: 'Delicately Polished Support', qty: 4 }],
		strategy: {},
		profile: { sailingMastery: 2100, level: 'Artisan 4', barterCount: 3700, crewShip: 'Carrack (Advance)',
			fitted: { 'Panokseon': { cannon: "+5 Panokseon: Byukgye's Enhanced Cannon", sail: "+5 Panokseon: Byukgye's Enhanced Sail" } },
			seats: { 'Carrack (Advance)': { 'sail:0': 's0', 'firstmate:0': 's1', 'cannon:0': 's2', 'wheel:0': 's3', 'deck:0': 's4', 'mess:0': 's5', 'fish:0': 's6', 'cabin:0': 's7', 'cabin:1': 's8', 'cabin:2': 's9' } },
			crystal: { 'Carrack (Advance)': 756821, 'Panokseon': 756823 },
			roster: roster(['Innocent', 'Innocent', 'Ambitious', 'Experienced', 'Powerful', 'Innocent', 'Honest', 'Strong', 'Innocent', 'Innocent', 'Innocent', 'Innocent'], [10, 10, 10, 9, 8, 10, 7, 6, 10, 10, 10, 4]),
			runs: runs(12, 5e8), questsDone: { 'omg-candidum': 1, 'winwin': 1 },
			tally: { runs: 60, silver: 3.1e10, cost: 1e9, trades: 2400, parley: 5e7, stops: 480, tries: 40, wins: 22, drops: 5, quests: { 'omg-candidum': 30, 'omg-nineshark': 25, 'omg-blackrust': 18, 'hekaru': 12, 'ravinia-1': 1, 'winwin': 9, 'khan': 3, 'supplies-iliya': 40 }, made: { 'Epheria Caravel': 1, 'Carrack (Advance)': 1, "+10 Epheria Carrack: Advance (Chiro's Cannon)": 1, 'Ship Upgrade Permit: Carrack (Advance)': 1 } },
			views: { map: { savedRoutes: [{ stops: [58922, 58916, 58935, 58958] }, { stops: [58922, 58901, 58954] }], traces: [{ points: Array(40).fill([1, 2]) }] } } } } },
	{ id: '1002', username: 'Sea-Wolf', avatar: null, share: 'named', joinedAt: Date.parse('2026-09-01'), save: {
		stock: { Silver: 4e9, 'Crow Coin': 9000, 'Tidal Black Stone': 1200 }, targets: [{ item: 'Panokseon', qty: 1 }], strategy: {},
		profile: { sailingMastery: 2650, level: 'Master 12', barterCount: 9100, crewShip: 'Carrack (Volante)',
			fitted: { 'Carrack (Volante)': { cannon: "+10 Epheria Carrack: Volante (Chiro's Cannon)", sail: "+10 Epheria Carrack: Volante (Chiro's Sail)", figurehead: "+10 Epheria Carrack: Volante (Chiro's Figurehead)", plating: "+10 Epheria Carrack: Volante (Chiro's Black Plating)" }, 'Epheria Caravel': { cannon: '+10 Epheria Caravel: Mayna Cannon', sail: '+10 Epheria Caravel: Stratus Wind Sail', figurehead: '+10 Epheria Caravel: Black Dragon Figurehead', plating: '+10 Epheria Caravel: Upgraded Plating' }, 'Bartali Sailboat': {} },
			crystal: { 'Carrack (Volante)': 756825, 'Epheria Caravel': 756822 },
			seats: { 'Carrack (Volante)': { 'sail:0': 's0', 'sail:1': 's1', 'wheel:0': 's2', 'cannon:0': 's3', 'deck:0': 's4', 'mess:0': 's5', 'firstmate:0': 's6', 'fish:0': 's7', 'cabin:0': 's8', 'cabin:1': 's9', 'cabin:2': 's10', 'cabin:3': 's11', 'cabin:4': 's12', 'cabin:5': 's13', 'cabin:6': 's14', 'cabin:7': 's15' } },

			roster: roster(['Born-in-the-Sea', 'Innocent', 'Innocent', 'Innocent', 'Powerful', 'Powerful', 'Dreaming of a Full Haul', 'Innocent', 'Innocent', 'Experienced', 'Innocent', 'Innocent', 'Innocent', 'Innocent', 'Innocent', 'Innocent'], [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 9, 8, 8]),
			runs: runs(30, 9e8), questsDone: {},
			tally: { runs: 400, silver: 2.9e11, cost: 9e9, trades: 16000, parley: 3e8, stops: 3200, tries: 120, wins: 50, drops: 30, quests: { 'omg-candidum': 200, 'omg-nineshark': 180, 'omg-blackrust': 160, 'omg-young': 90, 'hekaru': 60, 'khan': 20, 'supplies-iliya': 300, 'goods-baremi': 120 }, made: { 'Carrack (Volante)': 1, 'Epheria Caravel': 2, 'Epheria Sailboat': 3, 'Bartali Sailboat': 1 } },
			views: { map: { savedRoutes: [{ stops: [58922, 58916, 58973, 58935, 58901] }], traces: [] } } } } },
	{ id: '1003', username: null, avatar: null, share: 'anon', joinedAt: Date.parse('2026-09-03'), save: {
		stock: { Silver: 2e8 }, targets: [{ item: 'Epheria Caravel', qty: 1 }], strategy: {},
		profile: { sailingMastery: 900, level: 'Skilled 3', barterCount: 800, crewShip: 'Epheria Sailboat',
			fitted: { 'Epheria Sailboat': { cannon: '+7 Epheria: Old Prow', sail: '+6 Epheria: Old Sail' } }, crystal: { 'Epheria Sailboat': 59321 },
			seats: { 'Epheria Sailboat': { 'sail:0': 's0', 'wheel:0': 's1' } },

			roster: roster(['Innocent', 'Ambitious', 'Honest'], [6, 5, 3]), runs: runs(4, 1.2e8), questsDone: { 'hekaru': 1 },
			tally: { runs: 9, silver: 1.4e9, cost: 1e8, trades: 300, parley: 2e6, stops: 60, tries: 12, wins: 3, drops: 1, quests: { 'hekaru': 6, 'supplies-iliya': 12, 'omg-young': 4 }, made: {} },
			views: { map: { savedRoutes: [], traces: [{ points: Array(120).fill([1, 2]) }, { points: Array(80).fill([3, 4]) }] } } } } },
	{ id: '1004', username: 'Marisol', avatar: null, share: 'named', joinedAt: Date.parse('2026-08-20'), save: {
		stock: { Silver: 7e8, 'Crow Coin': 400, 'Zinc Ingot': 4000, 'Tidal Black Stone': 90 }, targets: [{ item: 'Carrack (Advance)', qty: 1 }, { item: "Epheria Carrack: Advance (Chiro's Figurehead)", qty: 1 }], strategy: {},
		profile: { sailingMastery: 1600, level: 'Artisan 1', barterCount: 2200, crewShip: 'Epheria Caravel',
			fitted: { 'Epheria Caravel': { cannon: '+10 Epheria Caravel: Mayna Cannon', sail: '+9 Epheria Caravel: Stratus Wind Sail', figurehead: '+10 Epheria Caravel: Brass Figurehead', plating: '+8 Epheria Caravel: Enhanced Plating' } }, crystal: { 'Epheria Caravel': 756824 },
			seats: { 'Epheria Caravel': { 'sail:0': 's0', 'wheel:0': 's1', 'cannon:0': 's2', 'deck:0': 's3', 'mess:0': 's4', 'firstmate:0': 's5' } },

			roster: roster(['Innocent', 'Innocent', 'Innocent', 'Experienced', 'Ambitious', 'Innocent', 'Innocent', 'Powerful', 'Innocent'], [10, 10, 9, 9, 8, 8, 8, 7, 7]),
			runs: runs(20, 3e8, 2), questsDone: {},
			tally: { runs: 140, silver: 5.5e10, cost: 2e9, trades: 6000, parley: 1e8, stops: 1100, tries: 8, wins: 5, drops: 0, quests: { 'omg-candidum': 80, 'omg-nineshark': 50, 'supplies-iliya': 110, 'goods-narvo': 40, 'winwin': 30 }, made: { 'Epheria Caravel': 1, 'Epheria Sailboat': 1 } },
			views: { map: { savedRoutes: [{ stops: [58922, 58916] }, { stops: [58935, 58958, 58901] }, { stops: [58922, 58954] }], traces: [{ points: Array(30).fill([1, 2]) }] } } } } }
];

// The server's ranking and adding-up, in short.
const rows = SAILORS.map(s => ({ ...s, ref: `r${s.id}`, digest: digest(s.save) }));
const avatar = () => null;
const rank = b => {
	const entries = rows.map(r => ({ r, value: b.value(r.digest) })).filter(e => e.value >= b.min).sort((a, c) => c.value - a.value || a.r.joinedAt - c.r.joinedAt);
	let last = null, place = 0;
	entries.forEach((e, i) => { if (e.value !== last) { place = i + 1; last = e.value; } e.rank = place; });
	const entry = e => ({ rank: e.rank, value: e.value, detail: b.detail(e.r.digest), face: b.face(e.r.digest), named: e.r.share === 'named', name: e.r.share === 'named' ? e.r.username : null, avatar: avatar(), ref: e.r.ref, you: e.r.id === '1001' });
	return { id: b.id, title: b.title, icon: b.icon, unit: b.unit, n: entries.length, top: entries.slice(0, 10).map(entry), all: entries.map(entry), places: new Map(entries.map(e => [e.r.id, { rank: e.rank, value: e.value }])) };
};
const fame = BOARDS.map(rank);
const top = (c, max) => Object.fromEntries(Object.entries(c).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, max));
const add = (t, k, n = 1) => { if (k !== undefined && k !== null && k !== '') t[k] = (t[k] || 0) + n; };
function aggregate() {
	const totals = { silver: 0, runs: 0, trades: 0, barters: 0, quests: 0, hunts: 0, crafts: 0, ships: 0, sailors: 0, hulls: 0, traces: 0, points: 0, tries: 0, wins: 0, units: 0, mastery: 0, withMastery: 0 };
	const hulls = {}, sailing = {}, parts = {}, crystals = {}, sailorTypes = {}, quests = {}, hunts = {}, builds = {}, shipsMade = {}, islands = {}, levels = {};
	const masteryBuckets = [0, 0, 0, 0, 0, 0], crewLevels = new Array(10).fill(0), fleetSizes = [0, 0, 0, 0], runDays = [0, 0, 0, 0, 0, 0, 0];
	for (const { digest: d } of rows) {
		totals.silver += d.runs.silver; totals.runs += d.runs.n; totals.trades += d.runs.trades; totals.barters += d.barters;
		totals.quests += d.quests.n; totals.hunts += d.quests.huntsN; totals.crafts += d.yard.crafts; totals.ships += d.yard.ships;
		totals.sailors += d.crew.n; totals.hulls += d.fleet.n; totals.traces += d.charts.traces; totals.points += d.charts.points;
		totals.tries += d.yard.tries; totals.wins += d.yard.wins; totals.units += d.stock.units;
		if (d.mastery > 0) { totals.mastery += d.mastery; totals.withMastery++; masteryBuckets[Math.min(5, Math.floor(d.mastery / 500))]++; }
		for (const h of d.fleet.hulls) add(hulls, h);
		add(sailing, d.fleet.sailing);
		for (const p of Object.keys(d.fleet.parts)) add(parts, p);
		for (const c of Object.keys(d.fleet.crystals)) add(crystals, c);
		for (const [t, c] of Object.entries(d.crew.byType)) add(sailorTypes, t, c);
		d.crew.levels.forEach((c, i) => { crewLevels[i] += c; });
		for (const [q, c] of Object.entries(d.quests.byId)) add(quests, q, c);
		for (const [m, c] of Object.entries(d.quests.hunts)) add(hunts, m, c);
		for (const b of Object.keys(d.yard.byItem)) add(builds, b);
		for (const [s, c] of Object.entries(d.yard.shipsMade)) add(shipsMade, s, c);
		for (const [i, c] of Object.entries(d.charts.stops)) add(islands, i, c);
		add(levels, d.level);
		fleetSizes[Math.min(3, d.fleet.n)]++;
		d.runs.days.forEach((c, i) => { runDays[i] += c; });
	}
	return { totals: { ...totals, mastery: Math.round(totals.mastery / totals.withMastery) }, hulls: top(hulls, 16), sailing: top(sailing, 16), parts: top(parts, 15), crystals: top(crystals, 10), sailorTypes: top(sailorTypes, 15), quests: top(quests, 15), hunts: top(hunts, 12), builds: top(builds, 15), shipsMade: top(shipsMade, 12), islands: top(islands, 15), levels: top(levels, 12), masteryBuckets, crewLevels, fleetSizes, runDays };
}

/* ------------------------------------------------------------------ *
 * The answers
 * ------------------------------------------------------------------ */

const placesOf = id => {
	const p = {};
	for (const f of fame) {
		const x = f.places.get(id);
		if (x) p[f.id] = { ...x, of: f.n };
	}
	return p;
};

/** A row as its card shows it -- the same shape /api/community/sailor sends. */
const cardOf = (r, youId) => ({
	ref: r.ref, named: r.share === 'named', name: r.share === 'named' ? r.username : null,
	avatar: null, joinedAt: r.joinedAt, places: placesOf(r.id), digest: r.digest, you: r.id === youId
});

/**
 * Every answer the Community tab asks for, worked out once.
 *
 * The board entries carry `you` already, the way the server sends them:
 * it keeps the account id off the wire and marks the caller's own rows
 * on the way out.
 */
export function apiAnswers({ youId = '1001' } = {}) {
	const you = rows.find(r => r.id === youId) || null;
	const mark = e => ({ ...e, you: e.ref === (you && you.ref) });
	return {
		config: { sync: true, push: false, feedback: true, community: true },
		me: you
			? { signedIn: true, user: { id: you.id, username: you.username || 'Sailor', avatar: null }, share: you.share, admin: false }
			: { signedIn: false },
		// Nothing stored on the server side, so the browser's own copy is
		// the first save and the app pushes it -- which is what a first
		// sign-in really does, and it leaves the seeded inventory alone.
		state: { rev: 0, data: null },
		pushed: { rev: 1, updatedAt: Date.now() },
		community: {
			sailors: rows.length,
			named: rows.filter(r => r.share === 'named').length,
			updatedAt: Date.now(),
			fame: fame.map(f => ({ id: f.id, title: f.title, icon: f.icon, unit: f.unit, n: f.n, top: f.top.map(mark) })),
			stats: aggregate(),
			you: you ? { places: placesOf(you.id), ref: you.ref, share: you.share, joinedAt: you.joinedAt, level: you.digest.level, mastery: you.digest.mastery } : null
		},
		boards: Object.fromEntries(fame.map(f => [f.id, { id: f.id, title: f.title, icon: f.icon, unit: f.unit, n: f.n, all: f.all.map(mark) }])),
		cards: Object.fromEntries(rows.map(r => [r.ref, cardOf(r, youId)])),
		named: rows.filter(r => r.share === 'named').map(r => ({ ref: r.ref, name: r.username, avatar: null })),
		mine: { digest: you ? you.digest : null }
	};
}

/**
 * Answer the community API inside the page, before any app code runs.
 *
 * `fetch` is wrapped rather than the requests intercepted: interception
 * turns off Chrome's cache, and the Map beats that follow would then
 * fetch every tile again on every pan. Only the paths below are
 * answered -- the Market relay and every file still go to the real
 * server.
 */
export async function fakeCommunity(page, opts = {}) {
	await page.evaluateOnNewDocument(A => {
		const real = window.fetch.bind(window);
		const json = body => new Response(JSON.stringify(body), {
			status: 200, headers: { 'Content-Type': 'application/json' }
		});
		window.fetch = (input, init = {}) => {
			const href = typeof input === 'string' ? input : input.url;
			let path;
			try {
				path = new URL(href, location.href).pathname;
			} catch {
				return real(input, init);
			}
			const method = (init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
			const last = () => decodeURIComponent(path.split('/').pop());
			if (path === '/api/config') return Promise.resolve(json(A.config));
			if (path === '/api/me') return Promise.resolve(json(A.me));
			if (path === '/api/state') return Promise.resolve(json(method === 'GET' ? A.state : A.pushed));
			if (path === '/api/community') return Promise.resolve(json(A.community));
			if (path === '/api/community/mine') return Promise.resolve(json(A.mine));
			if (path === '/api/community/find') return Promise.resolve(json({ sailors: A.named }));
			if (path.startsWith('/api/community/board/')) return Promise.resolve(json(A.boards[last()] || { error: 'No such board.' }));
			if (path.startsWith('/api/community/sailor/')) return Promise.resolve(json(A.cards[last()] || { error: 'No sailor by that handle is on the boards.' }));
			if (path === '/api/community/share') return Promise.resolve(json({ share: 'named' }));
			return real(input, init);
		};
	}, apiAnswers(opts));
}

export { rows as FLEET };
