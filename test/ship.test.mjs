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

test('sailing a saved setup is one change, and one Undo brings the hand fit back', async () => {
	const { saveSetup, loadSetup, activeSetupId } = await import('../js/ship.js');
	const HULL = 'Bartali Sailboat';
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: {
		crewShip: HULL,
		fitted: { [HULL]: { cannon: `+7 ${HULL}: Old Cannon`, sail: `+5 ${HULL}: Old Wind Sail` } },
		setups: { sA: { name: 'Old setup', ship: HULL, fitted: { figurehead: `${HULL}: Old Figurehead` } } }
	} });
	assert.ok(loadSetup('sA'));
	assert.deepEqual(store.getProfile('fitted')[HULL], { figurehead: `${HULL}: Old Figurehead` });
	assert.equal(store.lastChange().label, 'Sailed the setup "Old setup"');
	assert.equal(activeSetupId(), 'sA');

	assert.ok(store.undo());
	assert.deepEqual(store.getProfile('fitted')[HULL], { cannon: `+7 ${HULL}: Old Cannon`, sail: `+5 ${HULL}: Old Wind Sail` });
	assert.equal(activeSetupId(), null);

	// Saved again under a name, the setup matches however its fields are ordered.
	const id = saveSetup('Now');
	assert.equal(activeSetupId(), id);
	const all = { ...store.getProfile('setups') };
	const s = all[id];
	all[id] = { fitted: { sail: s.fitted.sail, cannon: s.fitted.cannon }, ship: s.ship, name: s.name };
	store.setProfile('setups', all);
	assert.equal(activeSetupId(), id, 'key order alone must not unrecognise a setup');
});

test('the hold reads as a sum of lines, and says how far over it will still sail', async () => {
	const { OVERLOAD } = await import('../js/ship.js');
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { crewShip: 'Epheria Caravel' } });
	const bare = currentShip();
	assert.equal(OVERLOAD, 1.7);
	assert.equal(bare.hold.lines.reduce((a, l) => a + l.lt, 0), bare.hold.free, 'the lines sum to what is free');
	assert.equal(bare.hold.lines[0].label, 'hull');
	assert.equal(bare.hold.max, Math.round(bare.hold.limit * 1.7));
	// A crew aboard takes its weight off both the free hold and the ceiling.
	store.setProfile('roster', [{ id: 'a', name: 'Bahar', type: 'Ambitious', lv: 10, cond: 100 }]);
	store.setProfile('seats', { 'Epheria Caravel': { 'sail:0': 'a' } });
	const crewed = currentShip();
	assert.equal(crewed.hold.crew, 200);
	assert.equal(crewed.hold.max, bare.hold.max - 200);
	assert.ok(crewed.hold.lines.some(l => l.lt === -200 && /sailor/.test(l.label)));
	assert.equal(crewed.hold.lines.reduce((a, l) => a + l.lt, 0), crewed.hold.free);
});

test('the fleet and the hold are one thing: a setup buys a hull, a hull kept is a ship', async () => {
	const { saveSetup, listFleet, ownedHulls, hullOfRow, OWNED_PREFIX } = await import('../js/ship.js');
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { crewShip: 'Epheria Caravel' } });
	assert.deepEqual(listFleet(), [], 'nothing owned and nothing kept is no fleet');

	// Kept under a name on the Ship tab: the hull goes into the hold too,
	// and both come back with one Undo.
	const id = saveSetup('Runner');
	assert.equal(store.getStock('Epheria Caravel'), 1);
	assert.deepEqual(listFleet().map(s => s.id), [id]);
	store.undo();
	assert.equal(store.getStock('Epheria Caravel'), 0);
	assert.deepEqual(store.getProfile('setups', null), null);
	store.redo();
	assert.equal(store.getStock('Epheria Caravel'), 1);

	// Keeping a second setup on a hull already held buys nothing more.
	store.setProfile('crewShip', 'Epheria Caravel');
	saveSetup('Hauler');
	assert.equal(store.getStock('Epheria Caravel'), 1);

	// A hull recorded in the Inventory and never set up is still a ship
	// in the fleet, with a row of its own.
	store.setStock('Carrack (Valor)', 1);
	assert.deepEqual(ownedHulls().sort(), ['Carrack (Valor)', 'Epheria Caravel']);
	const bare = listFleet().find(s => s.owned);
	assert.equal(bare.ship, 'Carrack (Valor)');
	assert.equal(bare.id, `${OWNED_PREFIX}Carrack (Valor)`);
	assert.equal(hullOfRow(bare.id), 'Carrack (Valor)');
	assert.equal(hullOfRow('s123'), null);

	// Saving a setup on it folds the bare row into the setup.
	store.setProfile('crewShip', 'Carrack (Valor)');
	saveSetup('Hunter');
	assert.equal(listFleet().filter(s => s.owned).length, 0);
	assert.equal(store.getStock('Carrack (Valor)'), 1, 'already held, so nothing was added');

	// And out of the hold, out of the fleet -- the setup aside.
	store.setStock('Epheria Caravel', 0);
	assert.equal(ownedHulls().length, 1);
	assert.equal(listFleet().length, 3, 'the two Caravel setups are still kept');
});

test("the Bos'n Jacks are the player's, and only a big ship carries them", async () => {
	const { petWeight, setPets, bosnJacks } = await import('../js/ship.js');
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { crewShip: 'Epheria Caravel' } });
	const bare = currentShip().hold.limit;

	// Fifty a tier, stacking across the five slots the game lets out --
	// and the whole nest is one change, so one Undo takes it back.
	setPets([4, 2]);
	assert.equal(petWeight('Epheria Caravel'), 300);
	assert.equal(currentShip().hold.limit, bare + 300);
	assert.equal(currentShip().hold.lines.find(l => /Bos/.test(l.label)).lt, 300);
	store.undo();
	assert.equal(petWeight('Epheria Caravel'), 0);
	store.redo();
	assert.equal(petWeight('Epheria Caravel'), 300);

	// A tier 5 is still 200 until it is the one wearing the star, and the
	// star cannot be given to a nest that has no tier 5 in it.
	setPets([4, 5]);
	assert.equal(petWeight('Epheria Caravel'), 400);
	setPets([4, 5], true);
	assert.equal(petWeight('Epheria Caravel'), 450);
	setPets([4, 4], true);
	assert.equal(petWeight('Epheria Caravel'), 400);
	assert.equal(store.getProfile('bosnAlpha', false), false);
	setPets([4, 5], true);

	// Nothing at all on the hulls the talent does not call big.
	assert.equal(petWeight('Bartali Sailboat'), 0);
	assert.equal(petWeight('Epheria Cog'), 0);
	assert.equal(petWeight('Rowboat'), 0);
	store.setProfile('crewShip', 'Bartali Sailboat');
	const small = currentShip();
	assert.equal(small.hold.limit, shipStats['Bartali Sailboat'].weight);
	assert.equal(small.hold.lines.some(l => /Bos/.test(l.label)), false);

	// The star cannot outlive the tier 5 that earned it, and the birds
	// come back as five slots however few were kept.
	store.setProfile('crewShip', 'Epheria Caravel');
	setPets([4]);
	assert.equal(store.getProfile('bosnAlpha', false), false);
	assert.equal(bosnJacks().length, 5);
	assert.deepEqual(bosnJacks(), [4, 0, 0, 0, 0]);
	assert.equal(petWeight('Epheria Caravel'), 200);

	// Five of a tier is what the editor's head row writes, and it is the
	// ceiling: a sixth bird is not a thing the game lets out.
	setPets([4, 4, 4, 4, 4]);
	assert.equal(petWeight('Epheria Caravel'), 1000);
	setPets([5, 5, 5, 5, 5], true);
	assert.equal(petWeight('Epheria Caravel'), 1050, 'four at 200 and the Alpha at 250');
	setPets([4, 4, 4, 4, 4, 4]);
	assert.equal(petWeight('Epheria Caravel'), 1000, 'the sixth is dropped');

	// And a save cannot smuggle a sixth bird or a tier 9 past the shape.
	store.adopt({ stock: {}, targets: [], strategy: {}, profile: { bosnJacks: [9, 1, 1, 1, 1, 4], bosnAlpha: true } });
	assert.deepEqual(store.getProfile('bosnJacks', []), [5, 1, 1, 1, 1]);
	assert.equal(store.getProfile('bosnAlpha', false), true);
	assert.equal(petWeight('Epheria Caravel'), 200 + 50 * 4 + 50);
});
