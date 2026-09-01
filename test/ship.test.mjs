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

test('a sea crystal is the fifth slot, and its stat lands in the sum', async () => {
	const { setCrystal, crystalFor } = await import('../js/ship.js');
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { crewShip: 'Epheria Caravel' } });
	const bare = currentShip();
	setCrystal('Epheria Caravel', 756821);   // Rusalka, speed +4.5%
	const with1 = currentShip();
	assert.equal(with1.crystal.id, 756821);
	assert.equal(with1.speed.crystal, 4.5);
	assert.equal(with1.speed.total, Math.round((bare.speed.total + 4.5) * 10) / 10);
	setCrystal('Epheria Caravel', 59444);    // Oceanteared Nol, weight +1,350
	assert.equal(currentShip().hold.limit, bare.hold.limit + 1350);
	setCrystal('Epheria Caravel', null);
	assert.equal(crystalFor('Epheria Caravel'), null);
	assert.equal(store.getProfile('crystal'), null);
	setCrystal('Epheria Caravel', 12345);
	assert.equal(store.getProfile('crystal'), null, 'an unknown id is not kept');
});

test('sailing mastery follows the game\'s table: half a point per fifty to 2,000, a quarter to 3,000', async () => {
	const { masteryBonus, currentShip } = await import('../js/ship.js');
	assert.equal(masteryBonus(0), 0);
	assert.equal(masteryBonus(1400), 14);
	assert.equal(masteryBonus(2000), 20);
	assert.equal(masteryBonus(2050), 20.25);
	assert.equal(masteryBonus(2975), 24.75, 'a part-step counts nothing');
	assert.equal(masteryBonus(3000), 25);
	assert.equal(masteryBonus(4000), 25, 'capped at the top of the table');
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { crewShip: 'Epheria Caravel' } });
	const before = currentShip();
	store.setProfile('sailingMastery', 2000);
	const after = currentShip();
	assert.equal(after.speed.total, Math.round((before.speed.total + 20) * 10) / 10);
	assert.equal(after.speed.mastery, 20);
	assert.equal(after.turn, Math.round((before.turn + 20) * 10) / 10);
});

test('a setup keeps a hull with its parts, crystal and seats, and sails again on demand', async () => {
	const { saveSetup, loadSetup, listSetups, deleteSetup, activeSetupId, shipName, fittedFor, crystalFor } = await import('../js/ship.js');
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { crewShip: 'Epheria Caravel' } });
	setFitted('Epheria Caravel', 'sail', 'none');
	const { setCrystal } = await import('../js/ship.js');
	setCrystal('Epheria Caravel', 756531);
	const id = saveSetup('Slow coach');
	assert.equal(listSetups().length, 1);
	assert.equal(activeSetupId(), id, 'what is sailed now is the setup just kept');
	store.setProfile('crewShip', 'Carrack (Valor)');
	setFitted('Epheria Caravel', 'sail', null);
	setCrystal('Epheria Caravel', null);
	assert.equal(activeSetupId(), null);
	assert.ok(loadSetup(id));
	assert.equal(shipName(), 'Epheria Caravel');
	assert.equal(fittedFor('Epheria Caravel').slots.find(s => s.slot === 'sail').source, 'none', 'the empty sail slot came back');
	assert.equal(crystalFor('Epheria Caravel').id, 756531, 'and the crystal');
	assert.equal(saveSetup('Slow coach'), id, 'the same name replaces');
	assert.ok(deleteSetup(id));
	assert.equal(listSetups().length, 0);
	assert.equal(loadSetup(id), false);
});
