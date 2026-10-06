// One source of truth for a bench case.
//
// A case is a handful of plain arguments -- the layout, where the ship
// sets out, the hold, the pace -- and two things are built from them:
// the RPIT instance, the problem written down for any solver to read,
// and the options the app's own planner takes. Both come from here so
// that the app's run and the instance can never describe two different
// days: level 0 is scored on exactly the problem the other solvers see.

import { readFileSync } from 'node:fs';

import { boardData } from '../../js/barter-board.js';
import { useGame } from '../../js/barter-layouts.js';
import { exchanges, weightOf, sellOf, stacks } from '../../js/barter-plan.js';
import { levelOf, PARLEY } from '../../js/barter.js';
import { shipStats } from '../../js/ship_stats.js';
import { drainRate } from '../../js/rations.js';
import { rng } from '../../js/rpit/simulate.js';
import { npcById, ports } from '../../js/barter_npcs.js';
import { wharves } from '../../js/wharves.js';
import { seaDist } from '../../js/barter-route.js';
import { METRES_PER_PX, speedMs, DEFAULT_CAL } from '../../js/sailing.js';
import { OVERLOAD } from '../../js/ship.js';
import { PLAIN_ORDERS, DEFAULT_PAUSE } from '../../js/barter-orders.js';
import { chains } from '../../js/barter-chains.js';

const read = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
export const barterData = read('../../js/all_barter.json');
// The 40 trade layouts, from the game's own tables (js/barter_game.js),
// as the app builds them; a slot the game fills at random takes the app's
// default pick for it.
export const combos = useGame(await import('../../js/barter_game.js')).combos;

/** The wharves with a storage keeper: the only places a good is sold,
 *  left or taken aboard. */
export const DEPOTS = ['Velia', 'Port Epheria', 'Iliya Island', 'Ancado Inner Harbor', "Oquilla's Eye", 'Dami Pier', 'Dallae Pier'];
export const depotOf = at => wharves.find(w => w.kind === 'wharf' && w.at === at);

/** The wharves that sell supplies, as the Barter tab lays its refills
 *  (barter/route.js SUPPLY_AT, which is not exported): the depots and
 *  sixteen more that fill the ration pool and trade nothing. */
export const SUPPLY_AT = ['Velia', 'Port Epheria', 'Iliya Island', 'Ancado Inner Harbor', "Oquilla's Eye", 'Lema Island', "Crow's Nest", 'Pirate Island', 'Margoria', 'Tarif', 'Papuraora Island', 'Crioniak Island', 'Abandoned Pier', 'Arehaza', 'Angavu', 'Western Guard Camp', 'Dami Pier', 'Dallae Pier', 'Byukgye Island', 'Haemo Island', 'Cheongsa Island', 'Dalbeol Village', 'Bukpo'];

/**
 * The land goods' prices and listed counts, from a snapshot taken by
 * fetch-market.mjs: { name: { each, how, stock } } in the shape the
 * app's run takes. Null for no snapshot, when every land good is free
 * and unlimited -- which is only ever a test's board.
 */
export function marketOf(region) {
	if (!region) return null;
	const snap = read(`./data/market-${region}.json`);
	const out = {};
	for (const [name, g] of Object.entries(snap.goods)) out[name] = g.fixed ? { each: g.price, how: 'fixed' } : { each: g.price, how: 'market', stock: g.stock };
	return { at: snap.at, region: snap.region, prices: out };
}

export const DEFAULT_ARGS = {
	layout: '25', start: 'Velia', home: 'Velia', end: null,
	hold: 20000, parley: 3500000, perTrade: 10554,
	pace: 'full', sell: 7, p: 0.5,
	stock: {}, storage: {}, floors: {},   // floors: { level: n }, as the app's orders keep them
	dropPolicy: 'any', speed: 100, cal: DEFAULT_CAL,
	market: 'na',         // the snapshot in data/ the land goods are priced from; null for none
	// The ship: its hull's slots and ration pool, and what it eats -- a
	// full crew's take a tick and BreezySail every `breezy` seconds (0 for
	// none). `rations: false` leaves rations out of the instance.
	hull: 'Carrack (Advance)', crewTick: 3050, breezy: 50, rations: true,
	// A board already read: every island's payout drawn once from this seed
	// and known to every planner, as it is to a sailor who has looked at the
	// board. Null for the range, as before.
	board: null
};

/**
 * A home storage as a sailor who barters every day keeps one: twenty of
 * the first [Level 4] or [Level 5] of every climb to a [Level 7], and a
 * dozen of each lower good such a climb takes -- the leftovers of the
 * boards before. What the "stocked" cases start with; a board is read
 * for it, so each layout gets the storage that means something on it.
 */
export function autoStorage(board) {
	const out = {};
	const tops = chains(board, {}, {}).filter(c => c.top === 7);
	for (const c of tops) {
		const r = c.rungs.find(x => [4, 5].includes(levelOf(x.give)));
		if (r) out[r.give] = 20;
	}
	for (const c of tops) for (const r of c.rungs) if ([1, 2, 3].includes(levelOf(r.give))) out[r.give] = (out[r.give] || 0) + 12;
	return out;
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const nameOf = a => `bdo-${a.layout}-${slug(a.start)}-${a.hold}-${a.pace}${a.stocked ? '-stocked' : ''}${a.board !== null && a.board !== undefined ? `-b${a.board}` : ''}`;

/**
 * The instance and the app's options for one case. Unknown arguments
 * take DEFAULT_ARGS. Throws on a layout, harbour or depot that does not
 * exist, since a case that silently fell back to another would be
 * scored as the wrong day.
 */
export function setupOf(given = {}) {
	const args = { ...DEFAULT_ARGS, ...given };
	const layout = combos.find(c => c.id === String(args.layout));
	if (!layout) throw new Error(`no layout ${args.layout}`);
	const port = ports.find(p => p.name === args.start);
	if (!port) throw new Error(`no harbour ${args.start}`);
	for (const d of [args.home, args.end].filter(Boolean)) if (!DEPOTS.includes(d)) throw new Error(`no depot ${d}`);
	const board = boardData(layout, barterData, npcById);
	// "auto" is resolved here and written back, so the instance keeps the
	// storage it was made with and rebuilds to the same case.
	if (args.storage === 'auto') { args.storage = autoStorage(board); args.stocked = true; }

	// One exchange an island, the barter goods only: a row paying a
	// material or a coin is not a rung of any climb this model knows.
	const rows = exchanges(board).filter(r => levelOf(r.item) !== null);
	// Each exchange its own Parley, as the planner charges it: the game's
	// base for it at the sailor's rate.
	const rate = args.perTrade / PARLEY.perGreatOceanTrade;
	// A board read: each island's payout, drawn once and fixed.
	const draw = args.board !== null && args.board !== undefined ? rng(Number(args.board) * 7919 + 17) : null;
	const seen = {};
	const stations = rows.map(r => {
		const npc = npcById.get(r.npcId);
		const st = { id: String(r.npcId), name: r.npc, x: npc.x, y: npc.y, in: r.give, q: r.giveN, out: r.item, ymin: r.recvMin, ymax: r.recvMax, p: args.p, m: r.tries, c: r.parleyBase > 0 ? Math.floor(r.parleyBase * rate) : args.perTrade };
		if (draw) {
			const y = draw() < args.p ? r.recvMax : r.recvMin;
			if (r.recvMin !== r.recvMax) seen[r.npcId] = y;
			st.ymin = st.ymax = y;
		}
		return st;
	});

	const goods = {};
	const unpriced = [];
	const market = marketOf(args.market);
	const prices = market ? market.prices : {};
	for (const name of new Set([...stations.flatMap(s => [s.in, s.out]), ...Object.keys(args.stock), ...Object.keys(args.storage)])) {
		const level = levelOf(name) ?? 0;
		const price = level ? null : prices[name];
		const b = (price && price.each) || 0;
		if (!level && !b) unpriced.push(name);
		// What the Market lists caps what a run can buy of it; a price with
		// no count behind it (a fixed value, or a count the relay would not
		// confirm) caps nothing.
		const cap = price && Number.isFinite(price.stock) ? price.stock : null;
		goods[name] = { level, w: weightOf(name) || 0, p: level && level >= args.sell ? sellOf(name) || 0 : 0, b, cap, stack: stacks(name) };
	}

	const wharfs = DEPOTS.map(depotOf);
	const depots = wharfs.map(w => ({ id: w.at, x: w.x, y: w.y, storage: w.at === args.home ? { ...args.storage } : {} }));
	const supplyWharfs = args.rations ? SUPPLY_AT.filter(at => !DEPOTS.includes(at)).map(depotOf).filter(Boolean) : [];
	const supplies = supplyWharfs.map(w => ({ id: w.at, x: w.x, y: w.y }));

	// The distances are asked of the chart's own objects: the sea table
	// knows a point by its exact coordinates, and a copy that rounded
	// them would fall back to a straight line without a word.
	const objs = [port, ...wharfs, ...supplyWharfs, ...stations.map(s => npcById.get(Number(s.id)))];
	const matrix = objs.map(a => objs.map(b => (a === b ? 0 : Math.round(seaDist(a, b) * METRES_PER_PX * 10) / 10)));
	// The shortest way between two points, by way of any other. The sea
	// table's legs are the router's, which steers by lanes and keeps off
	// the shore rather than measuring the least water, and gives up on a
	// few: read 2026-09-26, 39 % of the legs between these points were
	// shorter by way of a third, by up to a fifth. A ship can always sail
	// by way of an island, so the instance says so (Floyd-Warshall), and
	// every solver works on distances that obey the triangle.
	const n = matrix.length;
	for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
		const ik = matrix[i][k];
		for (let j = 0; j < n; j++) if (ik + matrix[k][j] < matrix[i][j] - 1e-9) matrix[i][j] = Math.round((ik + matrix[k][j]) * 10) / 10;
	}

	const deal = Math.round(args.hold * OVERLOAD);
	const hull = shipStats[args.hull];
	if (!hull) throw new Error(`no hull ${args.hull}`);
	const drain = { tick: args.crewTick, breezy: args.breezy };
	const rations = args.rations ? { full: hull.rations, perMinute: drainRate(drain), perMinuteOver: drainRate(drain, { overweight: true }), reserve: 0.1 } : undefined;
	const instance = {
		name: nameOf(args),
		goods, stations, depots, ...(supplies.length ? { supplies } : {}),
		start: { id: 'start', x: port.x, y: port.y },
		travel: { points: ['start', ...depots.map(d => d.id), ...supplies.map(d => d.id), ...stations.map(s => s.id)], matrix },
		service: { station: DEFAULT_PAUSE.isle, depot: DEFAULT_PAUSE.call },
		vehicle: { Wfree: args.hold, Wdeal: deal, Wmax: deal, speed: speedMs(args.speed, args.cal), slowAtMax: 0.5, slots: hull.slots, ...(rations ? { rations } : {}) },
		budgets: { P: args.parley, H: null },
		// A floor is set per level, as the app's orders keep it, and
		// written per good, since that is what a solver spends.
		initial: { hold: { ...args.stock }, floors: Object.fromEntries(Object.keys(goods).filter(g => goods[g].level && args.floors[goods[g].level] > 0).map(g => [g, args.floors[goods[g].level]])) },
		rules: { pace: args.pace, dropPolicy: args.dropPolicy, home: args.home, end: args.end || args.home },
		objective: 'silver_per_hour',
		meta: { game: 'bdo', layout: String(args.layout), market: market ? { region: market.region, at: market.at } : null, unpricedLandGoods: unpriced, args }
	};

	const opts = {
		stock: args.stock, dock: args.storage,
		hold: { free: args.hold, deal, max: deal, slots: hull.slots },
		parley: { bar: args.parley, perTrade: args.perTrade },
		npcById, start: port, stashes: wharfs,
		prefer: args.end && args.end !== args.home ? depotOf(args.end) : null,
		pace: args.pace,
		orders: { ...PLAIN_ORDERS, way: 'sea', sell: args.sell, pause: { ...DEFAULT_PAUSE } },
		prices,
		ship: { speed: args.speed, cal: args.cal },
		// A board read is a board whose payouts the planner was told.
		seen
	};
	if (Object.keys(args.floors).length) opts.orders.floors = { ...args.floors };

	return { instance, app: { board, chainsAll: chains(board, args.stock, args.storage), opts, ship: { speed: args.speed, cal: args.cal } } };
}
