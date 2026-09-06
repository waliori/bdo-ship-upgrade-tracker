// The sailing orders: what a barter run is for, said once.
//
// Most sailors answer one question -- cash out today, or build the
// stocks -- and a preset fills in the rest the way the old barter
// guide would: which levels a wharf sells, how many of each level to
// keep back for the boards to come, whether land goods are bought.
// The rest is a drawer with every default showing. The orders live in
// the profile, so a phone and a desktop agree, and every plan reads
// them through the helpers here.
//
// Pure: no store, no screen. The shape is read and cleaned in
// profile-shape.js the same way the stash is.

import { GOODS, levelOf } from './barter.js';

/** One normal trade's Parley at Beginner 1: the guide's "barter
 *  unit", which every silver-per-Parley figure is quoted in. */
export const PARLEY_UNIT = 14286;

/**
 * The presets, in the order they are offered. `sell` is the lowest
 * level a wharf call sells -- 7 for the [Level 7]s only, 3 for
 * everything that pays, since nothing pays for a 1 or a 2. `floors`
 * are how many of each level to keep back, the guide's stock: never
 * sold, never spent below it.
 */
export const PRESETS = [
	{
		id: 'cash', label: 'Cash out today',
		sub: 'the most silver at the wharf tonight, with what is aboard and at the harbour',
		orders: { sell: 5, floors: {}, buy: true, pace: 'fast' }
	},
	{
		id: 'stock', label: 'Build the stocks',
		sub: 'finish every island, sell the top, keep a floor of every level for tomorrow’s board',
		orders: { sell: 7, floors: { 1: 10, 2: 30, 3: 30, 4: 40, 5: 4 }, buy: true, pace: 'full' }
	}
];

export const DEFAULT_ORDERS = { preset: 'cash', ...PRESETS[0].orders, hours: 0, count: 'least', way: 'sea', quests: 'near' };

/** The way round the chains ticked: one route through every rung, each
 *  after the rung beneath it in its chain, or chain after chain. */
/** The quests along the run: none; the dailies and weeklies handed in
 *  where the run passes anyway -- deliveries, talks, the barter quests
 *  counted off the run's trades; the same with a stop put in for a
 *  taker a short way off the route; or those and the hunts too, when
 *  their grounds lie on the way. */
export const QUEST_CHOICES = [
	['no', 'none', 'No quests on the run'],
	['near', 'on the way', 'Handed in only where the run passes a taker anyway; no stop put in'],
	['yes', 'short way round', 'A stop put in for a taker a short way off the route'],
	['hunts', 'and the hunts', 'Those, and a hunt at a stop of its own on its grounds when they lie on the way']
];

export const WAY_CHOICES = [
	['sea', 'shortest way', 'Every chain climbed at once: one route through every rung, the nearest islands first whatever chain they belong to'],
	['chain', 'chain by chain', 'Each chain climbed to its top before the next']
];

/** The orders a run has when none are given: the [Level 7]s sold and
 *  nothing else, no floors -- the run as it was before there were
 *  orders, and what the tests pin. */
export const PLAIN_ORDERS = { preset: 'cash', sell: 7, floors: {}, buy: true, pace: 'fast', hours: 0, count: 'least', way: 'chain', quests: 'no' };

/** How an exchange that pays a range is counted. */
export const COUNT_CHOICES = [
	['least', 'at the least', 'A 2-3 counts as 2'],
	['average', 'at the average', 'A 2-3 counts as 2.5'],
	['seen', 'as seen', 'As your own runs recorded it']
];

/** The caps on time under way a sailor can set, in hours; 0 is none. */
export const HOUR_CHOICES = [[0, 'no limit'], [1, 'an hour'], [2, 'two hours'], [3, 'three hours'], [4, 'four hours'], [6, 'six hours']];

/** The choices a sailor can make for what a wharf sells. */
export const SELL_CHOICES = [
	[7, '[Level 7] only'],
	[6, 'Level 6 and up'],
	[5, 'Level 5 and up'],
	[3, 'everything that pays']
];

/**
 * A clean set of orders from whatever was saved: unknown presets fall
 * back to cash, levels to sell are one of the choices, floors are
 * whole counts on the levels that can be kept.
 */
export function readOrders(raw) {
	const o = { ...DEFAULT_ORDERS };
	if (!raw || typeof raw !== 'object') return o;
	if (PRESETS.some(p => p.id === raw.preset)) o.preset = raw.preset;
	if (SELL_CHOICES.some(([v]) => v === Number(raw.sell))) o.sell = Number(raw.sell);
	if (raw.floors && typeof raw.floors === 'object') {
		const floors = {};
		for (const lv of [1, 2, 3, 4, 5, 6]) {
			const n = Math.floor(Number(raw.floors[lv]));
			if (Number.isFinite(n) && n > 0) floors[lv] = Math.min(9999, n);
		}
		o.floors = floors;
	} else o.floors = {};
	if (typeof raw.buy === 'boolean') o.buy = raw.buy;
	if (raw.pace === 'full' || raw.pace === 'fast') o.pace = raw.pace;
	if (HOUR_CHOICES.some(([h]) => h === Number(raw.hours))) o.hours = Number(raw.hours);
	if (COUNT_CHOICES.some(([c]) => c === raw.count)) o.count = raw.count;
	if (WAY_CHOICES.some(([w]) => w === raw.way)) o.way = raw.way;
	if (QUEST_CHOICES.some(([q]) => q === raw.quests)) o.quests = raw.quests;
	return o;
}

/** The orders a preset sets, keeping nothing of the old ones. */
export function presetOrders(id) {
	const p = PRESETS.find(x => x.id === id) || PRESETS[0];
	return { preset: p.id, ...p.orders, floors: { ...p.orders.floors }, hours: 0, count: 'least', way: 'sea', quests: 'near' };
}

/** Whether the saved orders still match their preset to the letter. */
export function onPreset(orders) {
	const p = presetOrders(orders.preset);
	return p.sell === orders.sell && p.buy === orders.buy && p.pace === orders.pace
		&& JSON.stringify(p.floors) === JSON.stringify(orders.floors || {});
}

/** Whether a wharf call sells this good under the orders. */
export function sellable(name, orders) {
	const lv = levelOf(name);
	return lv !== null && !!GOODS[lv] && GOODS[lv].sell > 0 && lv >= orders.sell;
}

/** How many of a good to keep back, under the orders. */
export function floorOf(name, orders) {
	const lv = levelOf(name);
	return (lv !== null && orders.floors && orders.floors[lv]) || 0;
}

/** The key an exchange's ratios are recorded under. */
export const ratioKey = r => `${r.npcId}|${r.give}|${r.item}`;

/**
 * What to count an exchange as, under the orders: the count seen most
 * often on the sailor's own runs, the average, or nothing (the least,
 * which is the run's own default). `ratios` is the profile's record.
 */
export function countAs(r, orders, ratios = {}) {
	if (!r || r.recvMin === r.recvMax) return null;
	if (orders.count === 'average') return r.recv;
	if (orders.count === 'seen') {
		const seen = ratios[ratioKey(r)];
		if (!seen) return null;
		const top = Object.entries(seen).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0];
		return top ? Number(top[0]) : null;
	}
	return null;
}

/**
 * The yardsticks of a run: silver a Parley unit and silver an hour,
 * from a run's silver, the Parley it spent and the hours it sails.
 * Either is 0 when the run spends or sails nothing.
 */
export function yardsticks(silver, parleyUsed, hours) {
	return {
		perUnit: parleyUsed > 0 ? silver / (parleyUsed / PARLEY_UNIT) : 0,
		perHour: hours > 0 ? silver / hours : 0
	};
}
