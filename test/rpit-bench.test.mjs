// The RPIT instances written from the app's data, the app's planner
// scored as level 0, and the bench round them.
//
// What can go wrong: an instance that is not the board the app plans
// on -- an island missing, a price or a ceiling off, a distance not by
// water -- so that level 0 and every other solver are scored on two
// different days; the app's run written out as a plan that the
// simulator replays to another figure; a bench row or a report that
// loses a column.

import test from 'node:test';
import assert from 'node:assert/strict';

import { setupOf } from '../tools/rpit/setup.mjs';
import { casesOf } from '../tools/rpit/export.mjs';
import { validateInstance, validatePlan } from '../tools/rpit/schema.mjs';
import { simulate, planPolicy } from '../tools/rpit/simulate.mjs';
import { solve } from '../tools/rpit/solvers/level0.mjs';
import { benchOne, COLUMNS } from '../tools/rpit/bench.mjs';
import { table } from '../tools/rpit/report.mjs';

const velia = setupOf({ layout: '25', start: 'Velia', hold: 20000, pace: 'full' });

test('layout 25 from Velia: every island, the seven storages and the supply wharves, the sea by water', () => {
	const I = velia.instance;
	assert.deepEqual(validateInstance(I), []);
	assert.equal(I.stations.length, 70, 'the game tables put seventy islands on layout 25');
	assert.equal(I.depots.length, 7);
	assert.equal(I.vehicle.Wdeal, 34000);
	assert.equal(I.goods[I.stations.find(s => I.goods[s.out].level === 7).out].p, 100000000);
	const n = I.travel.points.length;
	assert.equal(n, 1 + 7 + 16 + 70, 'the harbour, seven storages, sixteen supply wharves, seventy islands');
	for (let i = 0; i < n; i++) {
		assert.equal(I.travel.matrix[i][i], 0);
		for (let j = 0; j < i; j++) assert.equal(I.travel.matrix[i][j], I.travel.matrix[j][i]);
	}
	// The harbour and its wharf are two points a short way apart.
	const k = I.travel.points.indexOf('Velia');
	assert.ok(I.travel.matrix[0][k] > 0 && I.travel.matrix[0][k] < 1000);
});

test('land goods cost what the snapshot says, and no more can be bought than is listed', () => {
	const I = velia.instance;
	const land = Object.values(I.goods).filter(g => !g.level);
	assert.ok(land.length > 0 && land.every(g => g.b > 0), 'every land good on layout 25 is priced');
	assert.ok(land.every(g => g.cap === null || (Number.isInteger(g.cap) && g.cap >= 0)));
	assert.equal(I.meta.market.region, 'na');
	// The app's run is priced from the same snapshot.
	for (const [name, g] of Object.entries(I.goods)) if (!g.level) assert.equal(velia.app.opts.prices[name].each, g.b);
	// Without a snapshot, the goods are free and unlimited: a test board only.
	const free = setupOf({ layout: '25', market: null }).instance;
	assert.ok(Object.values(free.goods).filter(g => !g.level).every(g => g.b === 0 && g.cap === null));
});

test('the export names every case once, and stores what rebuilds it', () => {
	const cases = casesOf({ all: true, hold: '12000,20000', pace: 'fast,full' });
	assert.equal(cases.length, 40 * 2 * 2 * 2);
	assert.ok(cases.every(c => c.home === 'Velia' || c.home === 'Iliya Island'));
	const again = setupOf(velia.instance.meta.args).instance;
	assert.deepEqual(again.travel, velia.instance.travel);
});

test('a stocked case keeps the storage it was made with, at home only', () => {
	const { instance: I } = setupOf({ layout: '34', start: 'Velia', storage: 'auto' });
	assert.match(I.name, /-stocked$/);
	const home = I.depots.find(d => d.id === 'Velia').storage;
	assert.ok(Object.values(home).includes(20), 'twenty of a first [Level 4] or [Level 5]');
	assert.ok(I.depots.filter(d => d.id !== 'Velia').every(d => !Object.keys(d.storage).length));
	assert.deepEqual(I.meta.args.storage, home, 'written back, not "auto"');
	assert.deepEqual(setupOf(I.meta.args).instance.depots, I.depots);
});

test('level 0: the app\'s run replays to the app\'s own figures', () => {
	const { plan, info } = solve(velia.instance, { setup: velia });
	assert.deepEqual(validatePlan(plan, velia.instance), []);
	const r = simulate(velia.instance, planPolicy(plan), { mode: 'robust' });
	assert.equal(r.trades, info.tradesApp);
	assert.ok(Math.abs(r.R - info.netApp) <= 0.02 * info.netApp, `${r.R} against ${info.netApp}`);
	// The app leaves the slowing out of its hours, and makes no leg home
	// after its last call; the simulator does both, so it is never faster.
	assert.ok(r.T >= info.hoursApp - 1e-9);
	assert.equal(r.deviations.refusedOverDeal, 0);
});

test('the bench writes a row per instance and solver, and the report reads them', async () => {
	const iliya = setupOf({ layout: '12', start: 'Iliya Island', hold: 12000, pace: 'fast' });
	const rows = [];
	for (const s of [velia, iliya]) rows.push((await benchOne(s.instance, 'level0', { scenarios: 5, setup: s })).row);
	assert.equal(rows.length, 2);
	for (const r of rows) {
		for (const c of COLUMNS) assert.ok(c in r, `column ${c}`);
		assert.equal(r.planErrors, 0);
		assert.ok(r.rateOfMeans > 0);
	}
	const md = table(rows).join('\n');
	assert.match(md, /\| level0 \| 2 \|/);
});
