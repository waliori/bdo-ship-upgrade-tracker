// The barter forecast.
//
// This is the one part of the app that answers a question the game does
// not answer for you, so it is also the one part with the most room to
// be confidently wrong. There are three ways it could be: fold the
// ladder incorrectly and quote a trade count that is off by the height
// of the ladder; forget that the top rung is capped and promise forty
// Brilliant Pearl Shards in an afternoon; or quietly drift off the
// game's own constants when a patch moves them. Every test is aimed at
// one of those.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';

const shipbarters = JSON.parse(
	await readFile(new URL('../js/all_barter.json', import.meta.url), 'utf8'));
import {
	REFRESH, PARLEY, ROUTE_UNLOCKS,
	amount, levelOf, bestExchange, ladder, rungs, bottleneck,
	dailyCapacity, parleyPerTrade, gateFor, forecast, summarise, explain,
	barterLevels, levelDiscount, BARTER_TIERS, TOP_LEVEL, isTerminal, exchangeKind
} from '../js/barter.js';

/* ------------------------------------------------------------------ *
 * the constants, as the game charges them
 * ------------------------------------------------------------------ */

test('the daily point pool pays for exactly the daily presses', () => {
	// This is not a coincidence in the game's design, and it is the
	// reason the forecast counts refreshes rather than points. If a
	// patch breaks the identity, the model needs revisiting.
	const plain = REFRESH.tradeItem.costs.slice(0, REFRESH.tradeItem.perDay)
		.concat(REFRESH.shipMaterial.costs.slice(0, REFRESH.shipMaterial.perDay))
		.reduce((a, b) => a + b, 0);
	assert.equal(plain, REFRESH.points);

	const vp = REFRESH.tradeItem.costs.slice(0, REFRESH.tradeItem.perDayWithValuePack)
		.concat(REFRESH.shipMaterial.costs.slice(0, REFRESH.shipMaterial.perDay))
		.reduce((a, b) => a + b, 0);
	assert.equal(vp, REFRESH.pointsWithValuePack);
});

test('a Parley bar is sixty-nine Great Ocean trades', () => {
	// 14,286 rather than 14,285 is the flat rate the April 2026 patch
	// set, and it lands just the wrong side of a round seventy.
	assert.equal(Math.floor(PARLEY.max / PARLEY.perGreatOceanTrade), 69);
	assert.equal(Math.floor(PARLEY.max / parleyPerTrade({ valuePack: true })), 77);
	assert.equal(Math.floor(PARLEY.max / parleyPerTrade({ crowCoin: true })), 46);
});

test('a crewed ship shaves its tenth off, added like the rest', () => {
	assert.equal(parleyPerTrade({ crew: true }),
		Math.floor(PARLEY.perGreatOceanTrade * 0.9));
	assert.equal(parleyPerTrade({ crew: true, valuePack: true }),
		Math.floor(PARLEY.perGreatOceanTrade * 0.8));
	assert.ok(dailyCapacity({ crew: true }).perTrade < dailyCapacity({}).perTrade);
});

test('the crew discount reaches the forecast, not just the tooltip', () => {
	// forecast used to destructure `crew` out of existence on the way
	// in, so the Get screen's checkbox changed nothing it quoted.
	const plain = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	const crewed = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000, crew: true });
	assert.ok(crewed.topParley < plain.topParley, 'crew was dropped on the way in');
	assert.equal(crewed.days, plain.days, 'cheaper Parley is not a faster trip');
});

test('the two lists refresh on their own clocks', () => {
	// One free draw each at 06:00, plus each list's own presses -- a
	// press re-rolls one list, never both. So a Value Pack's extra
	// trade-item press buys the trade list a fourth draw and buys the
	// material list nothing at all. Pooling the two into one pace was
	// how the forecast used to lend the material list draws it does not
	// have.
	const plain = dailyCapacity();
	const vp = dailyCapacity({ valuePack: true });
	assert.equal(plain.lists.trade, 3);
	assert.equal(plain.lists.material, 3);
	assert.equal(vp.lists.trade, 4);
	assert.equal(vp.lists.material, 3, 'a Value Pack does not press the material list');
	assert.equal(plain.refreshes, plain.lists.trade + plain.lists.material);
	assert.ok(vp.perTrade < plain.perTrade);
	assert.ok(vp.tradesPerBar > plain.tradesPerBar);
});

test('the route table is the one the 2026-05-21 patch left behind', () => {
	// Three routes from a standing start, and thresholds rounded off --
	// 2,551 became 2,500. Anything still holding the old 11/31/71 set is
	// reading a guide written before that patch.
	assert.equal(ROUTE_UNLOCKS[0].barters, 0);
	assert.equal(ROUTE_UNLOCKS[0].routes, 3);
	for (const r of ROUTE_UNLOCKS) {
		assert.ok(r.barters % 10 === 0, `${r.barters} is not a rounded threshold`);
	}
});

test('the Brilliant pair unlocks at 1,500', () => {
	// It was 1,000 until 2026-05-21 and every guide still says so. The
	// 3,000 that also circulates is the threshold one row below it on
	// the same table and has nothing to do with Brilliants.
	const brilliant = ROUTE_UNLOCKS.find(r => /Brilliant/.test(r.opens || ''));
	assert.equal(brilliant.barters, 1500);
	assert.equal(gateFor('Brilliant Pearl Shard', 1499).short, 1);
	assert.equal(gateFor('Brilliant Pearl Shard', 1500), null);

	const three = ROUTE_UNLOCKS.find(r => r.barters === 3000);
	assert.ok(three && !/Brilliant/.test(three.opens));
});

/* ------------------------------------------------------------------ *
 * barter level
 * ------------------------------------------------------------------ */

test('the level list is every step of every tier', () => {
	// Master runs to 30 and Guru to 100, which is the part a formula
	// would get wrong.
	const all = barterLevels();
	assert.equal(all.length, BARTER_TIERS.reduce((a, [, n]) => a + n, 0));
	assert.equal(all.length, 180);
	assert.equal(all[0], 'Beginner 1');
	assert.equal(all[50], 'Master 1');
	assert.equal(all[80], 'Guru 1');
	assert.equal(all.at(-1), 'Guru 100');
});

test('the Parley discount climbs, then stops dead at Guru 50', () => {
	assert.equal(levelDiscount('Beginner 1'), 0);
	assert.ok(levelDiscount('Guru 50') > levelDiscount('Guru 49'));
	// Everything above Guru 50 reads the last value rather than running
	// off the end of the table.
	assert.equal(levelDiscount('Guru 100'), levelDiscount('Guru 50'));
	assert.ok(Math.abs(levelDiscount('Guru 50') - 0.2527) < 1e-9);
});

test('an unknown or missing level costs full price', () => {
	assert.equal(levelDiscount(null), 0);
	assert.equal(levelDiscount('Grandmaster 3'), 0);
	assert.equal(parleyPerTrade({ level: null }), PARLEY.perGreatOceanTrade);
});

test('the discounts add and the result floors — read off a live window', () => {
	// Artisan 3 is -16.12% by the skill tooltip; with a Value Pack the
	// window's chain rows read 10,554, Crow Coin rows 15,994, and the
	// ship-material rows 45,384. All three reproduce exactly, which is
	// also what pins the material base at 61,430.
	const at = { level: 'Artisan 3', valuePack: true };
	assert.equal(parleyPerTrade(at), 10554);
	assert.equal(parleyPerTrade({ ...at, kind: 'coin' }), 15994);
	assert.equal(parleyPerTrade({ ...at, kind: 'material' }), 45384);
});

test('a voucher is a quarter of a bar of extra trades', () => {
	const plain = dailyCapacity();
	const carried = dailyCapacity({ vouchers: 2 });
	assert.equal(carried.tradesPerBar,
		Math.floor((PARLEY.max + 2 * PARLEY.voucher) / plain.perTrade));
	assert.equal(carried.refreshes, plain.refreshes, 'vouchers do not buy refreshes');
});

test('a barter level does not change how many days a trip takes', () => {
	// Parley is not the pace, so making it cheaper must not quietly
	// shorten the forecast. Only refreshes do that.
	const plain = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	const guru = forecast('Brilliant Pearl Shard', 40, shipbarters,
		{ barterCount: 2000, level: 'Guru 50', vouchers: 5 });
	assert.equal(guru.days, plain.days);
	assert.ok(guru.topParley < plain.topParley, 'but it does make the Parley cheaper');
});

/* ------------------------------------------------------------------ *
 * reading the dataset
 * ------------------------------------------------------------------ */

test('a quantity range reads as its middle', () => {
	assert.equal(amount('1'), 1);
	assert.equal(amount('1-3'), 2);
	assert.equal(amount('40-60'), 50);
	assert.equal(amount(undefined), 1);
});

test('levels come off the name, and ship materials have none', () => {
	assert.equal(levelOf('[Level 4] Panacea'), 4);
	assert.equal(levelOf('Brilliant Pearl Shard'), null);
});

test('a rate tie goes to the higher cap, then to the wider offer', () => {
	// Equal rates used to fall to whichever source the scrape listed
	// first. The higher attempt cap needs fewer redraws; failing that,
	// the exchange more islands deal is likelier on somebody's list
	// today.
	const src = (npc, give, attempts) => ({
		npc_id: npc.charCodeAt(0), npc_name: npc, attempts_available: attempts,
		quantity_received: '2', give: { name: give, quantity: '1' }
	});
	const capped = [{ name: 'Tied Shell', sources: [src('A', 'X', 2), src('B', 'X', 6)] }];
	assert.equal(bestExchange('Tied Shell', capped).npc, 'B');

	const spread = [{ name: 'Tied Shell', sources: [
		src('A', 'X', 2), src('B', 'Y', 2), src('C', 'Y', 2)
	] }];
	assert.equal(bestExchange('Tied Shell', spread).give, 'Y');
});

/* ------------------------------------------------------------------ *
 * folding the ladder
 * ------------------------------------------------------------------ */

test('a Brilliant Pearl Shard is under three trades, not six', () => {
	// The ladder is six rungs tall, but the [Level 2] to [Level 4]
	// rungs each pay more than one at a time, so a fraction of each is
	// charged. Getting this wrong is the single most likely way to
	// double the forecast.
	//
	// 2.86 rather than a round 3 is the 2026-04-16 minimum-exchange
	// change showing through: the [Level 2] and [Level 3] rungs pay 2-3
	// now instead of 1-3, so they average 2.5 and cost 0.4 of a trade
	// each rather than 0.5.
	const f = forecast('Brilliant Pearl Shard', 1, shipbarters, { barterCount: 2000 });
	assert.equal(rungs(ladder('Brilliant Pearl Shard', shipbarters)).length, 6);
	assert.ok(Math.abs(f.perUnit - 2.86) < 0.001, `got ${f.perUnit}`);
});

test('no rung of the chain pays one for one any more', () => {
	// The 2026-04-16 patch: "Adjusted the minimum exchange amount for
	// level 1 -> level 2 and level 2 -> level 3 barters. Before: x1-3
	// After: x2-3". A dataset still carrying 1-3 there would quietly
	// inflate every forecast on the screen.
	for (const entry of shipbarters) {
		const level = levelOf(entry.name);
		if (level !== 2 && level !== 3) continue;
		for (const s of entry.sources) {
			assert.notEqual(s.quantity_received, '1-3',
				`${entry.name} still pays 1-3 from ${s.npc_name}`);
		}
	}
});

test('a rung keeps the range the game prints, not just its average', () => {
	// The arithmetic needs 2.5; a person should be shown "2-3". Quoting
	// an average back as if it were the rule reads as a precision the
	// game does not offer.
	const top = ladder('Brilliant Pearl Shard', shipbarters);
	const two = rungs(top).find(r => levelOf(r.item) === 2);
	assert.equal(two.receivedText, '2-3');
	assert.equal(two.received, 2.5);
});

test('the ladder bottoms out on a land good, not on another barter', () => {
	const f = forecast('Brilliant Pearl Shard', 1, shipbarters, { barterCount: 2000 });
	const bottom = f.rungs[f.rungs.length - 1];
	assert.equal(levelOf(bottom.item), 1);
	assert.ok(f.seed);
	assert.equal(levelOf(f.seed.item), null);
	assert.ok(f.seed.qty > 0);
});

test('a rung that pays ten costs a tenth of a trade', () => {
	// Moon Scale Plywood comes ten to a [Level 5] good, so it must land
	// well under the Shard that comes one at a time from the same rung.
	const plywood = forecast('Moon Scale Plywood', 1, shipbarters, { barterCount: 2000 });
	const shard = forecast('Brilliant Pearl Shard', 1, shipbarters, { barterCount: 2000 });
	assert.ok(plywood.perUnit < shard.perUnit / 5);
});

test('quantity scales the trades but not the rate', () => {
	// 3,000: Tear of the Ocean is dealt at the Wandering Merchant's Ship
	// and nowhere else, so anything under that count is a locked
	// forecast rather than a cost (test/barter-gates.test.mjs).
	const one = forecast('Tear of the Ocean', 1, shipbarters, { barterCount: 3000 });
	const forty = forecast('Tear of the Ocean', 40, shipbarters, { barterCount: 3000 });
	assert.equal(forty.perUnit, one.perUnit);
	assert.equal(forty.trades, one.trades * 40);
	assert.equal(forty.seed.qty, one.seed.qty * 40);
});

test('an item nobody barters for has no forecast', () => {
	assert.equal(forecast('Cron Stone', 1, shipbarters), null);
	assert.equal(bestExchange('Cron Stone', shipbarters), null);
	assert.equal(summarise(null), '');
});

/* ------------------------------------------------------------------ *
 * what actually costs days
 * ------------------------------------------------------------------ */

test('the top rung sets the pace, and Parley never does', () => {
	// Forty Shards is a couple of hundred trades. The Shard is a ship
	// material, so its two attempts a refresh are paced by the material
	// list's own three draws a day -- twenty redraws is the best part
	// of a week, whatever the trade list is doing.
	const f = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	assert.equal(f.limit.item, 'Brilliant Pearl Shard');
	assert.equal(f.limit.perRefresh, 2);
	assert.equal(f.limit.list, 'material');
	assert.equal(f.days, f.limit.refreshes / f.capacity.lists.material);
	assert.ok(f.days > 6, `expected days, got ${f.days}`);

	// Parley is reported, not used as a ceiling -- and at the material
	// list's own rate, the one the Get screen and the map quote, not
	// the chain rate that undersold it four times over. A couple of
	// bars, against a bar that refills on every press.
	assert.equal(f.topParley, 40 * PARLEY.perMaterialTrade);
	assert.ok(f.topParley < f.capacity.parley);
});

test('the bottleneck is the worst rung, not the first or the sum', () => {
	const top = ladder('Bright Reef Piece', shipbarters);
	const worst = bottleneck(top, 40);
	const perRung = [];
	let needed = 40;
	for (let r = top; r; r = r.from) {
		// An unstated cap is charged at two a draw, and without a Value
		// Pack both lists hold three draws, so days rank as refreshes do.
		perRung.push(needed / ((r.attempts || 2) * r.received));
		needed *= r.givePerUnit;
	}
	assert.equal(worst.refreshes, Math.max(...perRung));
});

test('an unstated attempt cap is charged, never read as unlimited', () => {
	// Gilded Coral's every source reads 0 attempts, and so does Golden
	// Turtle Shell's -- the dataset's "not stated", not "take as many as
	// you like". Read as unlimited they promised any quantity in one
	// sitting; charged at the tightest cap the dataset does state, two a
	// draw, the days come out finite and honest.
	const coral = forecast('Gilded Coral', 40, shipbarters, { barterCount: 20000 });
	assert.equal(coral.limit.item, 'Gilded Coral');
	assert.ok(coral.days > 3, `forty corals in ${coral.days} days`);
	assert.doesNotMatch(summarise(coral), /one sitting/);

	const shell = forecast('Golden Turtle Shell', 40, shipbarters, { barterCount: 20000 });
	assert.ok(shell.limit, 'no cap stated anywhere, and still no bottleneck');
	assert.ok(shell.days > 6, `forty shells in ${shell.days} days`);

	// The ladder itself still tells the truth: 0 stays "not stated".
	const top = ladder('Gilded Coral', shipbarters);
	assert.equal(rungs(top)[0].attempts, null);
	for (const r of rungs(top)) {
		assert.notEqual(r.attempts, 0, `${r.item} kept a zero attempt count`);
	}
});

test('more draws of the right list is fewer days', () => {
	// The Value Pack's extra press is a trade-item press. It speeds a
	// trip paced by the trade list and does nothing at all for one paced
	// by the material list -- the Shard takes its week either way.
	const quartz = forecast('[Level 5] Azure Quartz', 40, shipbarters, { barterCount: 2000 });
	const quartzVp = forecast('[Level 5] Azure Quartz', 40, shipbarters,
		{ barterCount: 2000, valuePack: true });
	assert.ok(quartzVp.days < quartz.days);

	const shard = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	const shardVp = forecast('Brilliant Pearl Shard', 40, shipbarters,
		{ barterCount: 2000, valuePack: true });
	assert.equal(shardVp.days, shard.days, 'a trade press cannot redraw the material list');
});

/* ------------------------------------------------------------------ *
 * unlocks
 * ------------------------------------------------------------------ */

test('a low barter count is reported as locked, not as slow', () => {
	// Quoting "4 days" to someone who cannot see the route at all is
	// worse than saying nothing.
	const f = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 0 });
	assert.ok(f.gate);
	assert.match(summarise(f), /^locked/);
	assert.equal(explain(f), '');
});

test('the gate named is the furthest one on the whole ladder', () => {
	// A Shard needs [Level 5] goods to buy it, and those unlock at 1,500
	// -- later than the Shard's own 1,000. The later number is the one
	// that stops you.
	const f = forecast('Brilliant Pearl Shard', 1, shipbarters, { barterCount: 1100 });
	assert.equal(f.gate.barters, 1500);
	assert.equal(f.gate.short, 400);
});

test('Crow Coin is gated until the first Crow Coin route opens', () => {
	// The 10/30/70 counts that used to gate levels now open the Crow
	// Coin routes, Kashuma first at 10 -- ROUTE_UNLOCKS has said so all
	// along, while gateFor only ever looked for Brilliants. Below 10 a
	// player has no Crow Coin route at all, so an ungated forecast was
	// quoting a trade the window would not show. Past the first route
	// the later thresholds only add islands; they do not lock the coin.
	assert.equal(gateFor('Crow Coin', 0).barters, 10);
	assert.equal(gateFor('Crow Coin', 0).short, 10);
	assert.match(gateFor('Crow Coin', 9).opens, /Crow Coin/);
	assert.equal(gateFor('Crow Coin', 10), null);
	assert.equal(gateFor('Crow Coin', 30), null);

	const f = forecast('Crow Coin', 100, shipbarters, { barterCount: 0 });
	assert.ok(f.gate);
	assert.match(summarise(f), /^locked/);
});

test('only thresholds a patch note still states are claimed', () => {
	// The per-level gates guides print at 10, 30 and 70 were rewritten
	// on 2026-05-21 into Crow Coin routes and never restated. Claiming
	// them anyway would grey out routes that are open.
	assert.equal(gateFor('Brilliant Pearl Shard', 1500), null);
	assert.equal(gateFor('[Level 5] Azure Quartz', 0), null);
	assert.equal(gateFor('[Level 4] Panacea', 0), null);
	assert.equal(gateFor('Moon Scale Plywood', 0), null, 'nothing gates a plain material');
});

/* ------------------------------------------------------------------ *
 * what it says out loud
 * ------------------------------------------------------------------ */

test('the summary leads with trades and hedges the days', () => {
	const f = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	const line = summarise(f);
	assert.match(line, /115 trades/);
	assert.match(line, /at best/);
});

test('the explanation does not tell you an item limits itself', () => {
	const self = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	assert.doesNotMatch(explain(self), /on Brilliant Pearl Shard/);

	// In the shipped dataset the top rung is always the stingy one, so a
	// lopsided ladder is built by hand: ten a draw at the top, but the
	// [Level 1] that buys it comes two a draw and is what runs out.
	const lopsided = [
		{ name: 'Coral Trinket', sources: [{ npc_id: 1, npc_name: 'A', attempts_available: 10,
			quantity_received: '10', give: { name: '[Level 1] Old Rope', quantity: '1' } }] },
		{ name: '[Level 1] Old Rope', sources: [{ npc_id: 2, npc_name: 'B', attempts_available: 2,
			quantity_received: '1', give: { name: 'Old Tree Bark', quantity: '1' } }] }
	];
	const other = forecast('Coral Trinket', 40, lopsided, { barterCount: 2000 });
	assert.equal(other.limit.item, '[Level 1] Old Rope');
	assert.match(explain(other), /on \[Level 1\] Old Rope/);
});

/* ------------------------------------------------------------------ *
 * the whole dataset, swept
 * ------------------------------------------------------------------ */

test('every barterable item folds to a finite, positive cost', () => {
	for (const entry of shipbarters) {
		const f = forecast(entry.name, 1, shipbarters, { barterCount: 20000 });
		assert.ok(f, `${entry.name} has sources but no forecast`);
		assert.ok(Number.isFinite(f.perUnit) && f.perUnit > 0, `${entry.name}: ${f.perUnit} trades`);
		assert.ok(Number.isFinite(f.days) && f.days >= 0, `${entry.name}: ${f.days} days`);
		// A [Level 7] is seven rungs, and so would be a material bought
		// with a [Level 6]; nothing can be taller than the chain itself.
		assert.ok(f.rungs.length <= TOP_LEVEL, `${entry.name} climbs ${f.rungs.length} rungs`);
	}
});

test('a ship material is exactly one trade above the rung that buys it', () => {
	// Every ship material sits one rung above the chain, so it cannot
	// cost more than the good it is bought with plus the single trade
	// that buys it. A ladder folded the wrong way round -- multiplying
	// where it should divide -- breaks this immediately.
	// The dearest good a material could be bought with: anything under
	// the terminal rung, which nothing is bought with.
	const dearest = Math.max(...shipbarters
		.filter(e => levelOf(e.name) !== null && !isTerminal(e.name))
		.map(e => forecast(e.name, 1, shipbarters, { barterCount: 20000 }).perUnit));

	for (const entry of shipbarters.filter(e => levelOf(e.name) === null)) {
		const f = forecast(entry.name, 1, shipbarters, { barterCount: 20000 });
		assert.ok(f.perUnit <= dearest + 1 + 1e-9, `${entry.name} costs ${f.perUnit}, over ${dearest + 1}`);
	}
});

test('the chain gets dearer only where it pays one for one', () => {
	// The chain does not simply get dearer as it climbs. [Level 2] to
	// [Level 4] each pay more than one per trade, so a unit of them
	// costs less than the [Level 1] underneath -- one [Level 1] becomes
	// two and a half [Level 2]s. [Level 5] is where that stops: it pays
	// one for one, so it costs its whole [Level 4] plus a trade, and so
	// do the two coastal rungs above it. That makes [Level 7] the
	// dearest thing on the table, each of the top three exactly one
	// trade over the one beneath.
	const cost = level => {
		const each = shipbarters
			.filter(e => levelOf(e.name) === level)
			.map(e => forecast(e.name, 1, shipbarters, { barterCount: 20000 }).perUnit);
		assert.ok(each.length, `no [Level ${level}] goods in the dataset`);
		return each.reduce((a, b) => a + b, 0) / each.length;
	};
	const byLevel = [1, 2, 3, 4, 5, 6, 7].map(cost);
	assert.equal(Math.max(...byLevel), byLevel[6], 'level 7 should be the dearest');
	assert.ok(byLevel[1] < byLevel[0], 'a level 2 should cost less than the level 1 below it');
	assert.ok(byLevel[4] > byLevel[3], 'level 5 is the first rung dearer than the one below');
	assert.ok(Math.abs(byLevel[5] - byLevel[4] - 1) < 1e-9, 'a level 6 is a level 5 and a trade');
	assert.ok(Math.abs(byLevel[6] - byLevel[5] - 1) < 1e-9, 'a level 7 is a level 6 and a trade');
});

/* ------------------------------------------------------------------ *
 * the coast: [Level 6], [Level 7], and the ten barterers who deal them
 * ------------------------------------------------------------------ */

test('the dataset is the 2026-08-29 table: seven levels, 91 barterers', () => {
	// The counts the header of barter.js quotes. A re-scrape that
	// silently dropped the coast -- or the [Level 6] rows with it --
	// would pass every folding test above and still be the old sea.
	const exchanges = shipbarters.reduce((n, e) => n + e.sources.length, 0);
	const npcs = new Set(shipbarters.flatMap(e => e.sources.map(s => s.npc_id)));
	assert.equal(shipbarters.length, 158);
	assert.equal(exchanges, 4397);
	assert.equal(npcs.size, 91);

	const levels = new Set(shipbarters.map(e => levelOf(e.name)).filter(Boolean));
	assert.deepEqual([...levels].sort(), [1, 2, 3, 4, 5, 6, 7]);
	assert.equal(TOP_LEVEL, 7);

	// The shore, by id, as barter_npcs.js carries them.
	for (const id of [58979, 58973, 58981, 58980, 58984, 58983, 58974, 58976, 58978, 58977]) {
		assert.ok(npcs.has(id), `${id} deals nothing in the dataset`);
	}
});

test('a [Level 6] is bought with a [Level 5], one for one, five a draw', () => {
	// Six ports deal the rung: Hakoven, which was already on the chart,
	// and the five the 2026-08-29 pull added. Every one of their rows
	// reads the same way -- one [Level 5] in, one [Level 6] out, five
	// attempts -- which is what makes the rung a whole trade dearer
	// than the one below.
	const sixes = shipbarters.filter(e => levelOf(e.name) === 6);
	assert.equal(sixes.length, 24);
	const dealers = new Set();
	for (const e of sixes) {
		for (const s of e.sources) {
			dealers.add(s.npc_id);
			assert.equal(levelOf(s.give.name), 5, `${e.name} is not bought with a [Level 5] at ${s.npc_name}`);
			assert.equal(s.give.quantity, '1');
			assert.equal(s.quantity_received, '1');
			assert.equal(s.attempts_available, 5);
		}
	}
	assert.deepEqual([...dealers].sort(), [58971, 58977, 58978, 58980, 58981, 58984]);

	const f = forecast(sixes[0].name, 1, shipbarters, { barterCount: 20000 });
	assert.equal(f.rungs.length, 6);
	assert.equal(levelOf(f.rungs[1].item), 5);
	assert.equal(exchangeKind(sixes[0].name), 'trade');
});

test('a material bought with a [Level 6] folds through the whole coast', () => {
	// The table has no such material yet -- every [Level 6] is spent on
	// a [Level 7] -- so one is built by hand on top of the real chain:
	// as tall as a [Level 7], and exactly one trade over the [Level 6]
	// it costs.
	const six = shipbarters.find(e => levelOf(e.name) === 6);
	const data = [...shipbarters, {
		name: 'Coastal Keel Plate', sources: [{
			npc_id: 1, npc_name: 'Nobody', attempts_available: 2,
			quantity_received: '1', give: { name: six.name, quantity: '1' }
		}]
	}];
	const plate = forecast('Coastal Keel Plate', 1, data, { barterCount: 20000 });
	const under = forecast(six.name, 1, data, { barterCount: 20000 });
	assert.equal(plate.rungs.length, TOP_LEVEL);
	assert.ok(Math.abs(plate.perUnit - under.perUnit - 1) < 1e-9, `${plate.perUnit} vs ${under.perUnit}`);
	assert.equal(levelOf(plate.rungs.at(-1).item), 1, 'the ladder still bottoms out on land');
	assert.deepEqual(plate.seed, under.seed);
});

test('[Level 7] is the top of the ladder and never a rung on it', () => {
	// No exchange in the table takes a [Level 7]; their sink is outside
	// the barter window. So they fold -- one [Level 6] and a trade --
	// but nothing folds through them.
	const sevens = shipbarters.filter(e => isTerminal(e.name));
	assert.equal(sevens.length, 24);
	for (const e of shipbarters) {
		for (const s of e.sources) {
			assert.ok(!isTerminal(s.give.name), `${e.name} is bought with ${s.give.name} at ${s.npc_name}`);
		}
	}
	for (const e of sevens) {
		for (const s of e.sources) {
			assert.equal(levelOf(s.give.name), 6, `${e.name} is not bought with a [Level 6]`);
		}
		const f = forecast(e.name, 1, shipbarters, { barterCount: 20000 });
		assert.equal(f.rungs.length, TOP_LEVEL);
		for (const r of f.rungs.slice(1)) assert.ok(!isTerminal(r.item));
	}
	assert.equal(isTerminal('[Level 6] Golden Sand Ring'), false);
	assert.equal(isTerminal('Brilliant Pearl Shard'), false);
});

test('a give the table never hands over is the floor, like a [Level 1]', () => {
	// Kami and the Margoria drifters take Gold Bar 100G for Tidal Black
	// Stone. Nothing barters for a gold bar, so a ladder that picked
	// that exchange has to stop there and hand the bar back as the seed
	// rather than recurse onto nothing and lose the shopping list.
	const data = [{
		name: 'Tidal Black Stone', sources: [{
			npc_id: 1, npc_name: 'Kami', attempts_available: 2,
			quantity_received: '20', give: { name: 'Gold Bar 100G', quantity: '1' }
		}]
	}];
	const f = forecast('Tidal Black Stone', 40, data, { barterCount: 20000 });
	assert.equal(f.rungs.length, 1);
	assert.deepEqual(f.seed, { item: 'Gold Bar 100G', qty: 2 });
	assert.equal(f.trades, 2);
});

test('the coast does not move what an unstated cap is charged at', () => {
	// An unstated cap is charged at the Brilliants' two a draw. The
	// coast's fives and Kami's ones are new numbers in the table, and
	// neither is what a zero now reads as.
	for (const name of ['Brilliant Pearl Shard', 'Brilliant Rock Salt Ingot']) {
		const caps = new Set(shipbarters.find(e => e.name === name).sources.map(s => s.attempts_available));
		assert.deepEqual([...caps], [2], `${name} is capped at ${[...caps]}`);
	}
	const coral = forecast('Gilded Coral', 1, shipbarters, { barterCount: 20000 });
	assert.equal(coral.limit.attempts, 2);
	const six = shipbarters.find(e => levelOf(e.name) === 6);
	assert.equal(forecast(six.name, 1, shipbarters, { barterCount: 20000 }).rungs[0].attempts, 5);
});
