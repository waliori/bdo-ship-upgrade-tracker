// The way to get each thing.
//
// To Get can say every way to a material; this is the one that chooses
// -- and a chooser can be wrong in ways a lister cannot: promise the
// same daily to two items, spend the same coins twice, price two
// materials off one list as if each had the list to itself, or call a
// drop "three days" when nobody knows its rate. Every test here is
// aimed at one of those. The made-up sources are exact so the numbers
// can be asserted; the real data is used once, to check the plan
// accounts for every unit of a real shortfall.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { wayToGet, readGetOrders, groupLegs, wayText, DEFAULT_ORDERS } from '../js/get-plan.js';
import { plan } from '../js/planner.js';
import { coins } from '../js/sea_coins.js';
import { falasi } from '../js/falasi_vendor.js';
import { items as vendorItems, bulkExchanges } from '../js/vendor_items.js';
import { quests } from '../js/quests.js';
import { forecast, dailyCapacity } from '../js/barter.js';

// A barter forecaster in the shape barter.forecast answers with: `per`
// units a draw of `list`, no gate.
const barterer = (table) => (item, qty) => {
	const t = table[item];
	if (!t) return null;
	const refreshes = qty / t.per;
	return { item, qty, gate: null, limit: { refreshes, list: t.list }, days: refreshes / 3 };
};

const daily = (id, choice, rewards = {}, extra = {}) => ({ id, name: `[Daily] ${id}`, repeat: 'daily', rewards, choice, ...extra });
const weekly = (id, choice, rewards = {}) => ({ id, name: `[Weekly] ${id}`, repeat: 'weekly', rewards, choice });

const capacity = { lists: { trade: 3, material: 3 } };
const legsOf = (way, item) => way.legs.filter(l => l.item === item);
const got = (way, item, kind) => legsOf(way, item).filter(l => l.kind === kind).reduce((a, l) => a + l.qty, 0);

test('the orders are cleaned: unknown goals fall back, days are one of the choices, a reserve is a whole number', () => {
	assert.deepEqual(readGetOrders(null), DEFAULT_ORDERS);
	assert.deepEqual(readGetOrders({ preset: 'gold', days: 4, reserve: -3 }), DEFAULT_ORDERS);
	assert.deepEqual(readGetOrders({ preset: 'coins', days: '5', reserve: '1200.7' }), { preset: 'coins', days: 5, reserve: 1200 });
});

test('a pick-one goes to the item nothing else pays, not to the dearer one', () => {
	// T is a quest reward and nothing else; P is 350 coins at the shop.
	// Fourteen T are worth less in coins than one P would be, and the
	// pick still goes to T: the coins can buy P, nothing can buy T.
	const way = wayToGet({
		missing: { T: 14, P: 1 },
		sources: { coins: { P: 350 }, quests: [daily('hunt', [{ T: 14 }, { P: 1 }])] },
		state: { purse: { coins: 10000 }, capacity }
	});
	assert.equal(got(way, 'T', 'quest'), 14);
	assert.equal(got(way, 'P', 'coin'), 1);
	assert.equal(way.quests[0].pick, 0);
	assert.equal(way.days, 1);
});

test('once the only-by-quest item is covered, the same quest picks the other reward on later days', () => {
	const way = wayToGet({
		missing: { T: 14, P: 3 },
		sources: { quests: [daily('hunt', [{ T: 14 }, { P: 1 }])] },
		state: { purse: { coins: 0 }, capacity },
		orders: { preset: 'coins' }
	});
	// Four days: one for the T, three for the P -- and P is only got by
	// the quest here, so nothing else could have covered it.
	assert.equal(way.days, 4);
	assert.equal(got(way, 'T', 'quest'), 14);
	assert.equal(got(way, 'P', 'quest'), 3);
	assert.equal(way.residual.length, 0);
});

test('a group of dailies is one a day, not one of each', () => {
	const hunts = ['a', 'b', 'c'].map(id => daily(id, [{ T: 14 }], {}, { group: 'omg' }));
	const way = wayToGet({
		missing: { T: 42 },
		sources: { quests: hunts },
		state: { purse: { coins: 0 }, capacity }
	});
	// Forty-two is three completions; three groups a day would say one
	// day, and the game says three.
	assert.equal(way.days, 3);
	assert.equal(way.quests.reduce((a, q) => a + q.completions, 0), 3);
});

test('a daily already done today is not counted for today', () => {
	const q = daily('hunt', [{ T: 14 }]);
	const fresh = wayToGet({ missing: { T: 14 }, sources: { quests: [q] }, state: { purse: { coins: 0 }, capacity } });
	const done = wayToGet({ missing: { T: 14 }, sources: { quests: [q] }, state: { purse: { coins: 0 }, capacity, isDone: () => true } });
	assert.equal(fresh.days, 1);
	assert.equal(done.days, 2);
});

test('two materials off one list wait on the same draws', () => {
	const barter = barterer({ X: { per: 2, list: 'material' }, Y: { per: 2, list: 'material' } });
	const one = wayToGet({ missing: { X: 12 }, sources: { barter }, state: { purse: { coins: 0 }, capacity } });
	const both = wayToGet({ missing: { X: 12, Y: 12 }, sources: { barter }, state: { purse: { coins: 0 }, capacity } });
	// Six draws at three a day is two days; twelve draws is four. A
	// per-item forecast would say two for both.
	assert.equal(one.days, 2);
	assert.equal(both.days, 4);
	assert.equal(both.longPole.kind, 'barter-material');
});

test('a trade-list item does not slow a material-list one', () => {
	const barter = barterer({ X: { per: 2, list: 'material' }, Z: { per: 2, list: 'trade' } });
	const both = wayToGet({ missing: { X: 12, Z: 12 }, sources: { barter }, state: { purse: { coins: 0 }, capacity } });
	assert.equal(both.days, 2);
});

test('at Soonest the purse buys back the days; at Keep the coins the list carries it', () => {
	const barter = barterer({ X: { per: 2, list: 'material' } });
	const sources = { coins: { X: 10 }, barter };
	const soon = wayToGet({ missing: { X: 60 }, sources, state: { purse: { coins: 1000 }, capacity }, orders: { preset: 'soon' } });
	const keep = wayToGet({ missing: { X: 60 }, sources, state: { purse: { coins: 1000 }, capacity }, orders: { preset: 'coins' } });
	assert.equal(soon.days, 1);
	// Today's three draws carry six; the coins carry the rest.
	assert.equal(got(soon, 'X', 'barter'), 6);
	assert.equal(got(soon, 'X', 'coin'), 54);
	assert.equal(soon.coins.spend, 540);
	assert.equal(keep.days, 10);
	assert.equal(got(keep, 'X', 'coin'), 0);
	assert.equal(keep.coins.spend, 0);
});

test('what nothing else sells is bought even when the coins are being kept', () => {
	const way = wayToGet({ missing: { P: 2 }, sources: { coins: { P: 350 } }, state: { purse: { coins: 1000 }, capacity }, orders: { preset: 'coins' } });
	assert.equal(got(way, 'P', 'coin'), 2);
	assert.match(legsOf(way, 'P')[0].why, /nothing else sells it/);
});

test('coins kept back are not spent', () => {
	const way = wayToGet({ missing: { P: 2 }, sources: { coins: { P: 350 } }, state: { purse: { coins: 1000 }, capacity }, orders: { reserve: 500 } });
	// 500 spendable buys one; the other is short, and said to be.
	assert.equal(got(way, 'P', 'coin'), 1);
	assert.equal(way.residual.length, 1);
	assert.equal(way.residual[0].reason, 'coins');
	// No coin quest is offered, so no number of days mends it: the plan
	// is done in a day but for that one, and says so rather than
	// stretching to a year.
	assert.equal(way.reachable, false);
	assert.equal(way.stalled, false);
	assert.equal(way.days, 1);
	assert.match(wayText(way), /but for 1 item/);
});

test('a short purse is stretched by the coin quests, and the horizon says how long that takes', () => {
	const pay = daily('pirates', undefined, { 'Crow Coin': 300 });
	const way = wayToGet({ missing: { P: 4 }, sources: { coins: { P: 350 }, quests: [pay] }, state: { purse: { coins: 200 }, capacity } });
	// 1,400 wanted, 200 held: four days of 300 make it 1,400.
	assert.equal(way.days, 4);
	assert.equal(got(way, 'P', 'coin'), 4);
	assert.equal(way.coins.income, 1200);
	assert.equal(way.quests[0].forCoins, true);
	assert.equal(way.longPole.kind, 'coins');
});

test('a coin quest run for the coins still takes its pick', () => {
	const pay = daily('hunt', [{ T: 14 }, { P: 1 }], { 'Crow Coin': 100 });
	const way = wayToGet({ missing: { T: 14, P: 5 }, sources: { coins: { P: 350 }, quests: [pay] }, state: { purse: { coins: 0 }, capacity } });
	// Every completion pays something the list wants, so none of them
	// is "for the coins" alone, and none wastes the reward.
	assert.ok(way.quests.every(q => !q.forCoins));
	assert.equal(got(way, 'T', 'quest') + got(way, 'P', 'quest') + got(way, 'P', 'coin'), 19);
});

test('Keep the silver leaves the Market alone; Falasi is still Falasi', () => {
	const sources = { silver: { S: 1000 }, market: { M: 5 } };
	const soon = wayToGet({ missing: { S: 1, M: 10 }, sources, state: { purse: { coins: 0 }, capacity } });
	const keep = wayToGet({ missing: { S: 1, M: 10 }, sources, state: { purse: { coins: 0 }, capacity }, orders: { preset: 'silver' } });
	assert.equal(got(soon, 'M', 'market'), 10);
	assert.equal(got(keep, 'M', 'market'), 0);
	assert.equal(got(keep, 'S', 'falasi'), 1);
	assert.equal(legsOf(keep, 'M')[0].kind, 'find');
});

test('a drop is named and never timed', () => {
	const way = wayToGet({
		missing: { D: 100 },
		sources: { grounds: () => [{ name: 'Candidum' }, { name: 'Nineshark' }] },
		state: { purse: { coins: 0 }, capacity }
	});
	assert.equal(way.days, 1);
	assert.equal(way.longPole, null);
	const [leg] = legsOf(way, 'D');
	assert.equal(leg.kind, 'find');
	assert.match(leg.why, /drops from Candidum, Nineshark/);
	assert.match(leg.why, /not counted in the days/);
});

test('a weekly counts once a week, and fewer days at sea mean more days', () => {
	const q = weekly('croc', [{ C: 5 }]);
	const barter = barterer({ X: { per: 2, list: 'material' } });
	const full = wayToGet({ missing: { C: 10 }, sources: { quests: [q] }, state: { purse: { coins: 0 }, capacity } });
	assert.equal(full.days, 8);
	const daysOff = wayToGet({ missing: { X: 12 }, sources: { barter }, state: { purse: { coins: 0 }, capacity }, orders: { days: 3 } });
	const daysOn = wayToGet({ missing: { X: 12 }, sources: { barter }, state: { purse: { coins: 0 }, capacity }, orders: { days: 7 } });
	assert.ok(daysOff.days > daysOn.days, `${daysOff.days} > ${daysOn.days}`);
});

test('the legs are grouped in the order the screen shows, with totals', () => {
	const way = wayToGet({
		missing: { P: 1, S: 1, T: 14 },
		sources: { coins: { P: 350 }, silver: { S: 1000 }, quests: [daily('hunt', [{ T: 14 }])] },
		state: { purse: { coins: 1000 }, capacity }
	});
	assert.deepEqual(way.groups.map(g => g.kind), ['quest', 'coin', 'falasi']);
	assert.equal(way.groups[1].coins, 350);
	assert.equal(way.groups[2].silver, 1000);
	assert.deepEqual(groupLegs([]), []);
	assert.match(wayText(way), /Done in 1 day/);
	assert.match(wayText(way), /take 14× T/);
});

test('a real shortfall is accounted for to the unit, and nothing is promised twice', async () => {
	const barterData = JSON.parse(await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
	const p = plan({ stock: {}, targets: [{ id: 't', item: "Epheria Carrack: Advance (Chiro's Cannon)", qty: 1, active: true }] });
	const way = wayToGet({
		missing: p.missing,
		sources: {
			coins, silver: falasi, market: {}, quests, bulk: bulkExchanges, acquisition: vendorItems,
			barter: (item, qty) => forecast(item, qty, barterData, {}),
			grounds: () => []
		},
		state: { purse: { coins: 80000, silver: 0 }, capacity: dailyCapacity({}) },
		orders: { preset: 'soon' }
	});
	for (const [item, qty] of Object.entries(p.missing)) {
		const sum = legsOf(way, item).reduce((a, l) => a + l.qty, 0);
		assert.ok(Math.abs(sum - qty) < 1e-6, `${item}: ${sum} of ${qty}`);
	}
	// No quest is scheduled more often than its cadence allows in the
	// horizon, and the four Old Moon Guild hunts share their days.
	const H = way.days;
	assert.ok(H > 1 && H <= 365);
	for (const q of way.quests) {
		const cap = q.cadence === 'daily' ? H : q.cadence === 'weekly' ? Math.ceil(H / 7) : 1;
		assert.ok(q.completions <= cap, `${q.name}: ${q.completions} in ${H} days`);
	}
	const omg = way.quests.filter(q => q.quest.group === 'omg-hunt' && q.cadence === 'daily').reduce((a, q) => a + q.completions, 0);
	assert.ok(omg <= H, `${omg} hunts in ${H} days`);
	// The coins spent never exceed what is held plus what the scheduled
	// quests pay.
	assert.ok(way.coins.spend <= way.coins.purse + way.coins.income);
});
