// The hulls' numbers, the seats they offer, a crew that sits in them,
// and the small craft: the data has to agree with itself before a
// screen can lean on it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { shipStats, crewedShips, statsLine } from '../js/ship_stats.js';
import {
	pool, poolByType, anyType, mateTypes, contract, SAILOR_CAP,
	seatsFor, statOf, statBand, crewTotals, autoAssign
} from '../js/sailors.js';
import { shipGroups } from '../js/ships.js';
import { recipes, routes, routeInfo } from '../js/recipes.js';
import { items as vendorItems } from '../js/vendor_items.js';
import { falasi } from '../js/falasi_vendor.js';

test('every ship the app can queue has its numbers', () => {
	const hulls = shipGroups.filter(g => g.name === 'Ships' || g.name === 'Small craft').flatMap(g => g.items);
	for (const ship of hulls) {
		assert.ok(shipStats[ship], `${ship} has no stats`);
		for (const k of ['durability', 'rations', 'weight', 'slots', 'cabins', 'crew', 'cannons', 'reload', 'speed', 'accel', 'turn', 'brake']) {
			assert.equal(typeof shipStats[ship][k], 'number', `${ship}.${k}`);
		}
	}
});

test('a hull with seats has cabin space, and the Cog has neither', () => {
	for (const ship of crewedShips) assert.ok(shipStats[ship].cabins > 0, ship);
	assert.equal(shipStats['Epheria Cog'].crew, 0);
	assert.ok(!crewedShips.includes('Epheria Cog'));
});

test('the stat line reads like the ship window', () => {
	assert.match(statsLine('Carrack (Volante)'), /13,500 LT · 20 slots · 20 sailors · 9 cannons a side · speed 120%/);
	assert.equal(statsLine('Not a ship'), '');
});

test('every sailor in the pool is whole, and the first mates can be hired', () => {
	assert.equal(pool.length, 20);
	for (const s of pool) {
		assert.ok(s.cabin >= 5 && s.cabin <= 13, `${s.type} cabin`);
		assert.ok(s.at.length > 0, `${s.type} has nowhere to be hired`);
	}
	assert.equal(Object.keys(poolByType).length, 20);
	assert.equal(mateTypes.length, 3);
	assert.ok(anyType['Cleia'].mate);
	assert.equal(anyType['Cleia'].cabin, 0);
});

test('a hull offers the seats the game draws, then cabins', () => {
	const count = (ship, pos) => seatsFor(ship, shipStats[ship]).filter(s => s.pos === pos).length;
	const carrack = seatsFor('Carrack (Advance)', shipStats['Carrack (Advance)']);
	assert.equal(carrack.length, 20);
	assert.equal(carrack.filter(s => s.pos === 'fish').length, 1);
	assert.equal(carrack.filter(s => s.pos === 'cabin').length, 12);
	// Each hull's extra seat, the one thing that tells the four apart.
	assert.equal(count('Carrack (Advance)', 'mess'), 2, 'the Advance messes a second cook');
	assert.equal(count('Carrack (Advance)', 'sail'), 1);
	assert.equal(count('Carrack (Balance)', 'sail'), 2);
	assert.equal(count('Carrack (Volante)', 'sail'), 2);
	assert.equal(count('Carrack (Valor)', 'cannon'), 2);
	assert.equal(count('Carrack (Volante)', 'cannon'), 1);
	const pano = seatsFor('Panokseon', shipStats['Panokseon']);
	assert.equal(pano.filter(s => s.pos === 'cannon').length, 3, 'two more cannon seats than a Carrack');
	assert.equal(pano.filter(s => s.pos === 'fish').length, 0, 'no fishing seat');
	const sloop = seatsFor('Epheria Sailboat', shipStats['Epheria Sailboat']);
	assert.deepEqual(sloop.map(s => s.pos), ['sail', 'wheel']);
	assert.equal(seatsFor('Epheria Cog', shipStats['Epheria Cog']).length, 0);
});

test('a seated crew adds up the way the positions say', () => {
	const roster = [
		{ id: 'a', name: 'Bahar', type: 'Ambitious', lv: 10, cond: 100 },
		{ id: 'b', name: 'Guff', type: 'Powerful', lv: 5, cond: 40 },
		{ id: 'c', name: 'Kuku', type: 'Quick', lv: 4, cond: 0 }
	];
	const t = crewTotals(roster, { 'sail:0': 'a', 'deck:0': 'b', 'cannon:0': 'c' }, shipStats['Carrack (Advance)']);
	assert.equal(t.seated, 3);
	// Ambitious Lv10 speed is the band's average, 3.1, doubled at the
	// sail; Powerful Lv5 holds 1.4 to 1.6 by the sheet's rolls: 1.5.
	assert.equal(Math.round(t.speed * 10) / 10, 3.1 * 2 + 1.5, 'the sail counts double; the sick gunner adds nothing');
	assert.equal(t.durability, 8 * 10000, 'the Deck pays by cabin cost');
	assert.equal(t.rations, 0);
	assert.equal(t.force, 0, 'a sick sailor works no seat');
	assert.equal(t.cabins, 10 + 8 + 10);
	assert.equal(t.weight, 200 + 500 + 250);
	assert.equal(t.sick, 1);
	assert.equal(t.seats, 20);
	assert.equal(t.overSpace, 0);
	assert.equal(statOf(roster[0], 'speed'), 3.1);
});

test('a sailor the roster does not know is simply not counted', () => {
	const t = crewTotals([{ id: 'x', name: 'Ghost', type: 'Nobody', lv: 3, cond: 100 }], { 'sail:0': 'x', 'wheel:0': 'gone' }, shipStats['Epheria Caravel']);
	assert.equal(t.seated, 0);
});

test('auto assign puts the mate at the bow, the fast at the sails, the gunner at the cannon', () => {
	const roster = [
		{ id: 'm', name: 'Cleia', type: 'Cleia', lv: 10, cond: 100 },
		{ id: 'f', name: 'Bahar', type: 'Ambitious', lv: 8, cond: 100 },
		{ id: 'g', name: 'Kuku', type: 'Quick', lv: 5, cond: 100 },
		{ id: 'w', name: 'Brann', type: 'Tenacious', lv: 6, cond: 100 },
		{ id: 'd', name: 'Full', type: 'Dreaming of a Full Haul', lv: 2, cond: 100 }
	];
	const a = autoAssign(roster, 'Carrack (Advance)', shipStats['Carrack (Advance)']);
	assert.equal(a['firstmate:0'], 'm');
	assert.equal(a['sail:0'], 'f');
	assert.equal(a['wheel:0'], 'w');
	assert.equal(a['cannon:0'], 'g');
	assert.equal(a['deck:0'], 'd', 'the last hand goes where a seat is still open');
	assert.equal(Object.keys(a).length, 5);
	assert.ok(SAILOR_CAP >= 20);
});

test('the contract is priced where the plan will look for it', () => {
	assert.equal(falasi[contract.item], contract.silver);
});

test('the small craft are real recipes made of known things', () => {
	const known = new Set([...Object.keys(recipes), ...Object.keys(vendorItems), ...Object.keys(falasi)]);
	for (const craft of ['Epheria Cog', 'Rowboat', 'Calpheon Rowboat', 'Mediah Rowboat', 'Raft']) {
		assert.ok(recipes[craft], craft);
		for (const ingredient of Object.keys(recipes[craft])) assert.ok(known.has(ingredient), `${craft} wants ${ingredient}`);
	}
});

test('the Cog can be built two ways, and both are described', () => {
	assert.deepEqual(Object.keys(routes['Epheria Cog']), ['permit', 'pirates']);
	assert.equal(routes['Epheria Cog'].permit, recipes['Epheria Cog']);
	for (const name of ['permit', 'pirates']) assert.ok(routeInfo['Epheria Cog'][name].label && routeInfo['Epheria Cog'][name].via, name);
});

test('a sick sailor takes a cabin and eats, and works no seat', () => {
	const stats = shipStats['Epheria Caravel'];
	const roster = [{ id: 'a', type: 'Ambitious', lv: 10, cond: 100 }, { id: 'b', type: 'Ambitious', lv: 10, cond: 0 }];
	const well = crewTotals(roster, { 'sail:0': 'a' }, stats);
	const sick = crewTotals(roster, { 'sail:0': 'b' }, stats);
	assert.ok(well.speed > 0);
	assert.equal(sick.speed, 0);
	assert.equal(sick.sick, 1);
	assert.equal(sick.cabins, well.cabins);
	assert.equal(sick.appetite, well.appetite);
});

test('auto assign keeps to the cabin space', () => {
	const stats = shipStats['Epheria Sailboat'];   // 10 cabin space, 2 seats
	const roster = ['a', 'b', 'c'].map(id => ({ id, type: 'Ambitious', lv: 5, cond: 100 }));   // 10 cabins each
	const seats = autoAssign(roster, 'Epheria Sailboat', stats);
	assert.equal(Object.keys(seats).length, 1, 'one fits, the second would be over');
	assert.equal(crewTotals(roster, seats, stats).overSpace, 0);
});

test("a sailor's typed stats outrank the type's average", () => {
	const s = { id: 'a', type: 'Ambitious', lv: 10, cond: 100, stats: { speed: 3.3 } };
	assert.equal(statOf(s, 'speed'), 3.3);
	assert.equal(statOf(s, 'accel'), 1.3, 'the rest stay on the estimate');
	const t = crewTotals([s], { 'sail:0': 'a' }, shipStats['Epheria Caravel']);
	assert.equal(t.speed, 6.6);
});

test('growth is a band summed from the rolls, not a line through it', () => {
	assert.equal(statOf({ type: 'Innocent', lv: 1 }, 'speed'), 1.2, 'level 1 is the base');
	assert.equal(statOf({ type: 'Innocent', lv: 10 }, 'speed'), 3.4, 'level 10 is the average');
	// The sheet's level-5 row: 1.7 at the least, 2.2 at the most; the
	// middle of the paths between is 1.95, which prints as 2.0.
	assert.equal(statOf({ type: 'Innocent', lv: 5 }, 'speed'), 2.0, 'between, the middle of what the level holds');
	assert.deepEqual(statBand('Innocent', 'speed', 5), { min: 1.7, avg: 2.0, max: 2.2 });
	assert.deepEqual(statBand('Innocent', 'speed', 10), { min: 2.8, avg: 3.4, max: 4.0 });
	assert.equal(statBand('Cleia', 'speed', 10), null, 'a first mate has no band');
	assert.equal(statOf({ type: 'Cleia', lv: 10 }, 'speed'), 0.5, 'and holds their fixed figure');
	// The level-10 averages carry the true ranking: an Innocent ends
	// faster than a Born-in-the-Sea, though it starts slower.
	assert.ok(statOf({ type: 'Innocent', lv: 10 }, 'speed') > statOf({ type: 'Born-in-the-Sea', lv: 10 }, 'speed'));
	assert.ok(poolByType['Born-in-the-Sea'].speed > poolByType['Innocent'].speed);
});

test('every roll a level could make is counted, so a typed roll has a rank', async () => {
	const { rollOutcomes, rollRank, statBand } = await import('../js/sailors.js');
	const { sailorRolls } = await import('../js/sailor_rolls.js');
	// Every type in the pool has its rolls, and each one's level-1
	// figure is the base the pool quotes.
	for (const t of pool) {
		assert.ok(sailorRolls[t.type], `${t.type} has rolls`);
		assert.equal(sailorRolls[t.type].speed.min[0] / 10, t.speed, `${t.type} speed base`);
	}
	const o = rollOutcomes('Innocent', 'speed', 10);
	assert.equal(o.paths, 1728, 'nine level-ups of two or three steps each');
	let total = 0;
	for (const p of o.dist.values()) total += p;
	assert.ok(Math.abs(total - 1) < 1e-9, 'the outcomes sum to one');
	const top = rollRank('Innocent', 'speed', 10, 4.0);
	assert.ok(Math.abs(top.below - 1727 / 1728) < 1e-9, 'a 4.0 beats every path but its own');
	assert.equal(top.above, 0);
	assert.equal(top.mode, 3.4, 'the value most paths land on');
	assert.equal(top.mean, 3.4);
	const floor = rollRank('Innocent', 'speed', 10, 2.8);
	assert.equal(floor.below, 0);
	const mid = rollRank('Innocent', 'speed', 10, 3.6);
	assert.ok(mid.below > 0.6 && mid.below < 0.9, `a 3.6 beats most: ${mid.below}`);
	assert.equal(rollRank('Cleia', 'speed', 10, 0.5), null, 'a first mate has no rolls');
	assert.deepEqual(statBand('Innocent', 'speed', 1), { min: 1.2, avg: 1.2, max: 1.2 });
});
