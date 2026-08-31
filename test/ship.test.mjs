// One ship for every tab: the hull, what is on it, who is aboard.

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
	store: new Map(),
	getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
	setItem(k, v) { this.store.set(k, String(v)); },
	removeItem(k) { this.store.delete(k); }
};
const store = await import('../js/state.js');
const { shipName, fittedFor, currentShip, setFitted, partsForSlot, splitLevel, SLOTS } = await import('../js/ship.js');
const { shipStats } = await import('../js/ship_stats.js');

const CANNON = "Epheria Carrack: Valor (Chiro's Cannon)";

test('the hull is the chosen one, else the biggest crewed hull queued, else the Sailboat', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: {} });
	assert.equal(shipName(), 'Epheria Sailboat');
	store.addTarget('Carrack (Valor)', 1);
	assert.equal(shipName(), 'Carrack (Valor)');
	store.setProfile('crewShip', 'Epheria Caravel');
	assert.equal(shipName(), 'Epheria Caravel');
});

test('a slot takes the best owned part until one is chosen', () => {
	store.adopt({ stock: { [`+3 ${CANNON}`]: 1 }, targets: [], strategy: {}, profile: { crewShip: 'Carrack (Valor)' } });
	assert.ok(partsForSlot('Carrack (Valor)', 'cannon').includes(CANNON));
	assert.deepEqual(splitLevel(`+7 ${CANNON}`), { part: CANNON, level: 7 });
	let fit = fittedFor('Carrack (Valor)');
	const cannon = fit.slots.find(s => s.slot === 'cannon');
	assert.equal(cannon.part, CANNON);
	assert.equal(cannon.level, 3);
	assert.equal(cannon.source, 'owned');
	assert.equal(fit.slots.find(s => s.slot === 'sail').source, 'none');

	setFitted('Carrack (Valor)', 'cannon', `+9 ${CANNON}`);
	fit = fittedFor('Carrack (Valor)');
	assert.equal(fit.slots.find(s => s.slot === 'cannon').level, 9);
	assert.equal(fit.slots.find(s => s.slot === 'cannon').source, 'chosen-unowned');

	setFitted('Carrack (Valor)', 'cannon', 'none');
	assert.equal(fittedFor('Carrack (Valor)').slots.find(s => s.slot === 'cannon').source, 'none');
	setFitted('Carrack (Valor)', 'cannon', 'auto');
	assert.equal(fittedFor('Carrack (Valor)').slots.find(s => s.slot === 'cannon').level, 3);
	assert.equal(store.getProfile('fitted'), null, 'back to the default leaves no trace');

	// A part that does not go in that slot on that hull is ignored.
	setFitted('Carrack (Valor)', 'sail', `+9 ${CANNON}`);
	assert.equal(fittedFor('Carrack (Valor)').slots.find(s => s.slot === 'sail').source, 'none');
	assert.equal(setFitted('No Such Hull', 'sail', 'x'), null);
	assert.deepEqual(SLOTS, ['cannon', 'sail', 'figurehead', 'plating']);
});

test('the setup sums hull, parts and crew, and the hold loses the crew\'s weight', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: {
		crewShip: 'Epheria Caravel',
		roster: [{ id: 'a', type: 'Ambitious', lv: 10, cond: 100 }],
		seats: { 'Epheria Caravel': { 'sail:0': 'a' } }
	} });
	const me = currentShip();
	assert.equal(me.name, 'Epheria Caravel');
	assert.equal(me.speed.hull, shipStats['Epheria Caravel'].speed);
	assert.ok(me.speed.crew > 0);
	assert.equal(me.speed.total, Math.round((me.speed.hull + me.speed.parts + me.speed.crew) * 10) / 10);
	assert.equal(me.hold.crew, 200);
	assert.equal(me.hold.free, me.hold.limit - 200);
});

test('the fitted note survives the profile shape, junk does not', () => {
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { fitted: {
		'Carrack (Valor)': { cannon: `+5 ${CANNON}`, sail: '', hat: 'x', plating: 42 },
		['x'.repeat(61)]: { cannon: 'y' }
	} } });
	assert.deepEqual(store.getProfile('fitted'), { 'Carrack (Valor)': { cannon: `+5 ${CANNON}`, sail: '' } });
});
