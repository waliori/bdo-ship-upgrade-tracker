// The hulls' numbers, the seats they offer, a crew that sits in them,
// and the small craft: the data has to agree with itself before a
// screen can lean on it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { shipStats, crewedShips, statsLine } from '../js/ship_stats.js';
import {
	pool, poolByType, anyType, mateTypes, contract, SAILOR_CAP,
	seatsFor, statOf, crewTotals, autoAssign
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
	const carrack = seatsFor('Carrack (Advance)', shipStats['Carrack (Advance)']);
	assert.equal(carrack.length, 20);
	assert.equal(carrack.filter(s => s.pos === 'sail').length, 2);
	assert.equal(carrack.filter(s => s.pos === 'fish').length, 1);
	assert.equal(carrack.filter(s => s.pos === 'cabin').length, 12);
	const pano = seatsFor('Panokseon', shipStats['Panokseon']);
	assert.equal(pano.filter(s => s.pos === 'cannon').length, 3, 'two more cannon seats than a Carrack');
	assert.equal(pano.filter(s => s.pos === 'fish').length, 0, 'no fishing seat');
	const sloop = seatsFor('Epheria Sailboat', shipStats['Epheria Sailboat']);
	assert.deepEqual(sloop.map(s => s.pos), ['sail', 'sail']);
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
	assert.equal(t.speed, 1.6 * 10 * 2 + 1.0 * 5, 'the sail counts double; the sick gunner adds nothing');
	assert.equal(t.durability, 8 * 10000, 'the Deck pays by cabin cost');
	assert.equal(t.rations, 0);
	assert.equal(t.force, 0, 'a sick sailor works no seat');
	assert.equal(t.cabins, 10 + 8 + 10);
	assert.equal(t.weight, 200 + 500 + 250);
	assert.equal(t.sick, 1);
	assert.equal(t.seats, 20);
	assert.equal(t.overSpace, 0);
	assert.equal(statOf(roster[0], 'speed'), 16);
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
	assert.equal(a['sail:1'], 'd', 'the last hand goes where a seat is still open');
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
