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

import { shipbarters } from '../js/all_barter.js';
import {
	REFRESH, PARLEY, ROUTE_UNLOCKS,
	amount, levelOf, bestExchange, ladder, rungs, bottleneck,
	dailyCapacity, parleyPerTrade, gateFor, forecast, summarise, explain
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

test('a Value Pack buys a sixth refresh and a cheaper trade', () => {
	const plain = dailyCapacity();
	const vp = dailyCapacity({ valuePack: true });
	assert.equal(plain.refreshes, 5);
	assert.equal(vp.refreshes, 6);
	assert.ok(vp.perTrade < plain.perTrade);
	assert.ok(vp.trades > plain.trades);
});

test('the Brilliant unlock sits between the seventh and eighth route', () => {
	// The 3,000 and 5,000 figures that circulate belong to the Ship
	// Material Refresh table, not to this one; conflating them puts the
	// unlock three times too far away.
	const brilliant = ROUTE_UNLOCKS.find(r => /Brilliant/.test(r.opens || ''));
	assert.equal(brilliant.barters, 1000);
	assert.equal(ROUTE_UNLOCKS.find(r => r.route === 7).barters, 630);
	assert.equal(ROUTE_UNLOCKS.find(r => r.route === 8).barters, 1270);
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

/* ------------------------------------------------------------------ *
 * folding the ladder
 * ------------------------------------------------------------------ */

test('a Brilliant Pearl Shard is three trades, not six', () => {
	// The ladder is six rungs tall, but the [Level 2] to [Level 4]
	// rungs each pay two at a time, so half of each is charged. Getting
	// this wrong is the single most likely way to double the forecast.
	const f = forecast('Brilliant Pearl Shard', 1, shipbarters, { barterCount: 2000 });
	assert.equal(rungs(ladder('Brilliant Pearl Shard', shipbarters)).length, 6);
	assert.equal(f.perUnit, 3);
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
	const one = forecast('Tear of the Ocean', 1, shipbarters, { barterCount: 2000 });
	const forty = forecast('Tear of the Ocean', 40, shipbarters, { barterCount: 2000 });
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

test('the top rung sets the pace, not Parley', () => {
	// Forty Shards is a couple of hundred trades, which one afternoon of
	// Parley covers easily. Two per refresh is what makes it a week.
	const f = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	assert.ok(f.parleyDays < 1, 'Parley alone would say under a day');
	assert.ok(f.refreshDays > 3, 'the attempt cap should say days');
	assert.equal(f.days, f.refreshDays);
	assert.equal(f.limit.item, 'Brilliant Pearl Shard');
	assert.equal(f.limit.perRefresh, 2);
});

test('the bottleneck is the worst rung, not the first or the sum', () => {
	const top = ladder('Bright Reef Piece', shipbarters);
	const worst = bottleneck(top, 40);
	const perRung = [];
	let needed = 40;
	for (let r = top; r; r = r.from) {
		if (r.attempts) perRung.push(needed / (r.attempts * r.received));
		needed *= r.givePerUnit;
	}
	assert.equal(worst.refreshes, Math.max(...perRung));
});

test('a rung with no stated attempt cap is skipped, not guessed', () => {
	const top = ladder('Brilliant Pearl Shard', shipbarters);
	for (const r of rungs(top)) {
		assert.notEqual(r.attempts, 0, `${r.item} kept a zero attempt count`);
	}
});

test('more refreshes a day is fewer days', () => {
	const plain = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	const vp = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000, valuePack: true });
	assert.ok(vp.days < plain.days);
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

test('past every threshold there is no gate', () => {
	assert.equal(gateFor('Brilliant Pearl Shard', 1000), null);
	assert.equal(gateFor('[Level 5] Azure Quartz', 1500), null);
	assert.equal(gateFor('[Level 4] Panacea', 70), null);
	assert.equal(gateFor('Moon Scale Plywood', 0), null, 'nothing gates a plain material');
});

/* ------------------------------------------------------------------ *
 * what it says out loud
 * ------------------------------------------------------------------ */

test('the summary leads with trades and hedges the days', () => {
	const f = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	const line = summarise(f);
	assert.match(line, /120 trades/);
	assert.match(line, /at best/);
});

test('the explanation does not tell you an item limits itself', () => {
	const self = forecast('Brilliant Pearl Shard', 40, shipbarters, { barterCount: 2000 });
	assert.doesNotMatch(explain(self), /on Brilliant Pearl Shard/);

	const other = forecast('Bright Reef Piece', 40, shipbarters, { barterCount: 2000 });
	assert.match(explain(other), /on \[Level/);
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
		assert.ok(f.rungs.length <= 6, `${entry.name} climbs ${f.rungs.length} rungs`);
	}
});

test('a ship material is exactly one trade above the rung that buys it', () => {
	// Every ship material sits one rung above the chain, so it cannot
	// cost more than the good it is bought with plus the single trade
	// that buys it. A ladder folded the wrong way round -- multiplying
	// where it should divide -- breaks this immediately.
	const dearest = Math.max(...shipbarters
		.filter(e => levelOf(e.name) === 5)
		.map(e => forecast(e.name, 1, shipbarters, { barterCount: 20000 }).perUnit));

	for (const entry of shipbarters.filter(e => levelOf(e.name) === null)) {
		const f = forecast(entry.name, 1, shipbarters, { barterCount: 20000 });
		assert.ok(f.perUnit <= dearest + 1 + 1e-9, `${entry.name} costs ${f.perUnit}, over ${dearest + 1}`);
	}
});

test('the chain gets dearer with every level', () => {
	const cost = level => {
		const items = shipbarters.filter(e => levelOf(e.name) === level);
		const each = items.map(e => forecast(e.name, 1, shipbarters, { barterCount: 20000 }).perUnit);
		return each.reduce((a, b) => a + b, 0) / each.length;
	};
	const byLevel = [1, 2, 3, 4, 5].map(cost);
	for (let i = 1; i < byLevel.length; i++) {
		assert.ok(byLevel[i] >= byLevel[i - 1], `level ${i + 1} costs less than level ${i}`);
	}
});
