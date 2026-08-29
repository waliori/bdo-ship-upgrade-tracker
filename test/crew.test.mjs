// The hulls' numbers, the crew that fits them, and the small craft:
// the data has to agree with itself before a screen can lean on it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { shipStats, crewedShips, statsLine } from '../js/ship_stats.js';
import { pool, poolByType, planCrew, contract, SAILOR_CAP } from '../js/sailors.js';
import { shipGroups } from '../js/ships.js';
import { recipes, routes, routeInfo } from '../js/recipes.js';
import { items as vendorItems } from '../js/vendor_items.js';
import { falasi } from '../js/falasi_vendor.js';

test('every ship the app can queue has its numbers', () => {
	const hulls = shipGroups.filter(g => g.name === 'Ships' || g.name === 'Small craft').flatMap(g => g.items);
	for (const ship of hulls) {
		assert.ok(shipStats[ship], `${ship} has no stats`);
		const s = shipStats[ship];
		for (const k of ['durability', 'rations', 'weight', 'slots', 'cabins', 'crew', 'cannons', 'reload', 'speed', 'accel', 'turn', 'brake']) {
			assert.equal(typeof s[k], 'number', `${ship}.${k}`);
		}
	}
});

test('a hull with seats has cabin space, and the Cog has neither', () => {
	for (const ship of crewedShips) {
		assert.ok(shipStats[ship].cabins > 0, ship);
	}
	assert.equal(shipStats['Epheria Cog'].crew, 0);
	assert.equal(shipStats['Epheria Cog'].cabins, 0);
	assert.ok(!crewedShips.includes('Epheria Cog'));
});

test('the stat line reads like the ship window', () => {
	assert.match(statsLine('Carrack (Volante)'), /13,500 LT · 20 slots · 20 sailors · 9 cannons a side · speed 120%/);
	assert.equal(statsLine('Not a ship'), '');
});

test('every sailor in the pool is whole', () => {
	assert.equal(pool.length, 20);
	for (const s of pool) {
		assert.ok(s.cabin >= 5 && s.cabin <= 13, `${s.type} cabin`);
		assert.ok(s.appetite > 0 && s.weight > 0, s.type);
		assert.ok(s.at.length > 0, `${s.type} has nowhere to be hired`);
		for (const k of ['speed', 'accel', 'turn', 'brake']) assert.equal(typeof s[k], 'number', `${s.type}.${k}`);
	}
	assert.equal(Object.keys(poolByType).length, 20);
});

test('a crew plan adds up, and is measured against the hull', () => {
	const carrack = shipStats['Carrack (Advance)'];
	const plan = planCrew({ 'Innocent': 2, 'Powerful': 1 }, carrack);
	assert.equal(plan.sailors, 3);
	assert.equal(plan.cabins, 10 * 2 + 8);
	assert.equal(plan.silver, 3 * contract.silver);
	assert.equal(plan.weight, 200 * 2 + 500);
	assert.equal(plan.appetite, 150 * 3);
	assert.equal(plan.speed, 1.2 * 2 + 1.0);
	assert.equal(plan.seats, 20);
	assert.equal(plan.overSeats, 0);
	assert.equal(plan.overSpace, 0);
});

test('too many sailors for the hull is flagged, not clamped', () => {
	const sailboat = shipStats['Epheria Sailboat'];
	const plan = planCrew({ 'Born-in-the-Sea': 3 }, sailboat);
	assert.equal(plan.sailors, 3);
	assert.equal(plan.overSeats, 1);
	assert.equal(plan.overSpace, 20);
	assert.ok(SAILOR_CAP >= 20);
});

test('an unknown sailor type and a bad count are ignored', () => {
	const plan = planCrew({ 'Nobody': 4, 'Innocent': 'x', 'Smart': 2 }, shipStats['Epheria Caravel']);
	assert.equal(plan.sailors, 2);
	assert.equal(plan.cabins, 10);
});

test('the contract is priced where the plan will look for it', () => {
	assert.equal(falasi[contract.item], contract.silver);
});

test('the small craft are real recipes made of known things', () => {
	const known = new Set([...Object.keys(recipes), ...Object.keys(vendorItems), ...Object.keys(falasi)]);
	for (const craft of ['Epheria Cog', 'Rowboat', 'Calpheon Rowboat', 'Mediah Rowboat', 'Raft']) {
		assert.ok(recipes[craft], craft);
		for (const ingredient of Object.keys(recipes[craft])) {
			assert.ok(known.has(ingredient), `${craft} wants ${ingredient}, which nothing explains`);
		}
	}
});

test('the Cog can be built two ways, and both are described', () => {
	assert.deepEqual(Object.keys(routes['Epheria Cog']), ['permit', 'pirates']);
	assert.equal(routes['Epheria Cog'].permit, recipes['Epheria Cog']);
	assert.ok(routes['Epheria Cog'].pirates['Island Tree Coated Plywood']);
	assert.ok(!routes['Epheria Cog'].pirates['Ship Building Permit: Epheria Cog']);
	for (const name of ['permit', 'pirates']) {
		assert.ok(routeInfo['Epheria Cog'][name].label, name);
		assert.ok(routeInfo['Epheria Cog'][name].via, name);
	}
});
