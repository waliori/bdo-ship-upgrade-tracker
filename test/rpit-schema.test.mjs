// The checks on an RPIT instance: each one fires on the fault it is
// there for, so a broken file never reaches the bench.

import test from 'node:test';
import assert from 'node:assert/strict';

import { validateInstance, validateResult } from '../tools/rpit/schema.mjs';
import { setupOf } from '../tools/rpit/setup.mjs';

const good = setupOf({ layout: '25' }).instance;
const broken = f => { const I = structuredClone(good); f(I); return validateInstance(I); };

test('a written instance is valid', () => {
	assert.deepEqual(validateInstance(good), []);
});

test('each fault is named', () => {
	const cases = [
		[I => { I.stations[0].in = 'Nothing'; }, /unknown good/],
		[I => { I.stations[1].id = I.stations[0].id; }, /repeated/],
		[I => { I.stations[0].ymin = 5; I.stations[0].ymax = 2; }, /ymin > ymax/],
		[I => { I.stations[0].p = 2; }, /p outside/],
		[I => { I.travel.matrix[1][2] += 1; }, /not symmetric/],
		[I => { I.travel.matrix.pop(); }, /points × points/],
		[I => { I.vehicle.Wfree = I.vehicle.Wmax + 1; }, /Wfree ≤ Wdeal ≤ Wmax/],
		[I => { I.rules.home = 'Atlantis'; }, /not a depot/],
		[I => { I.rules.pace = 'reckless'; }, /pace/],
		[I => { I.travel.points = I.travel.points.slice(0, -1); I.travel.matrix = I.travel.matrix.slice(0, -1).map(r => r.slice(0, -1)); }, /not in travel/]
	];
	for (const [f, re] of cases) {
		const errors = broken(f);
		assert.ok(errors.some(e => re.test(e)), `${re} in ${JSON.stringify(errors)}`);
	}
});

test('a result missing its figures is named', () => {
	assert.ok(validateResult({ instance: 'x' }).length > 5);
});
