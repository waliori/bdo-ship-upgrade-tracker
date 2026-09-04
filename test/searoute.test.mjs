// Keeping the line on the water.
//
// The mask is built from the chart's own tiles, so the thing worth
// testing is not the pixels but the promises made about them: open sea
// is open, an island is not, a clear leg is left alone, and a blocked
// one comes back as a way round rather than a line through a rock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { isSea, seaCell, seaLeg, seaRoute, nearestWater, setLanes } from '../js/searoute.js';
import { SEA_CELL, SEA_SIDE } from '../js/seamask.js';
import { npcs, npcById, ports } from '../js/barter_npcs.js';
import { wharves } from '../js/wharves.js';

const at = name => npcs.find(n => n.name === name) || ports.find(p => p.name === name);

test('the mask knows the sea from the shore', () => {
	// Deep Margoria is water; a wharf is not, since a wharf is a place
	// on land beside it.
	assert.equal(isSea(40000, 40000), true);
	assert.equal(isSea(30000, 30000), true);
	assert.equal(isSea(at('Velia').x, at('Velia').y), false);
	// And nothing outside the chart is water.
	assert.equal(seaCell(-1, 10), false);
	assert.equal(seaCell(10, SEA_SIDE), false);
});

test('a leg with clear water is left exactly as it was', () => {
	// Two points in open Margoria with nothing between them.
	const a = { x: 30000, y: 30000 }, b = { x: 40000, y: 40000 };
	assert.equal(isSea(a.x, a.y) && isSea(b.x, b.y), true);
	assert.deepEqual(seaLeg(a, b), [a, b]);
});

test('a harbour is water the open sea can still be reached from', () => {
	// At 256 units to a cell, Velia's harbour was a single wet cell walled
	// in by its own shore. A search that started there had nowhere to go
	// and gave up, and the leg was drawn straight -- so the route out of
	// Velia crossed Balenos on foot. Every leg from a wharf did.
	const velia = at('Velia');
	for (const to of ['Iliya Island', 'Rian', 'Sikario'].map(at)) {
		const leg = seaLeg(velia, to);
		assert.ok(leg.length > 2, `Velia to ${to.name} came back as a straight line`);
		// Away from the two ends -- a wharf is on land, and a barterer
		// stands on an island -- the drawn line is on the water.
		const wet = leg.slice(1, -1);
		for (const p of wet) assert.ok(isSea(p.x, p.y), `a turn on land at ${Math.round(p.x)},${Math.round(p.y)}`);
		assert.ok(dryRun(wet) === 0, `Velia to ${to.name} crosses ${dryRun(wet)} units of land`);
	}
});

/**
 * The longest unbroken stretch of a drawn line that is over land.
 *
 * `spare` is where land is expected and fine -- the last few hundred
 * units into a wharf or up to a barterer's island, which is a landing,
 * not a shortcut. Sampled along the line rather than by dropping points,
 * because dropping the approach points and joining what is left invents
 * a segment that was never drawn.
 */
function dryRun(points, spare = () => false) {
	let run = 0, worst = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1], b = points[i];
		const len = Math.hypot(b.x - a.x, b.y - a.y);
		const steps = Math.max(1, Math.ceil(len / 60));
		for (let k = 0; k <= steps; k++) {
			const t = k / steps;
			const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
			if (spare(p) || isSea(p.x, p.y)) run = 0;
			else { run += len / steps; worst = Math.max(worst, run); }
		}
	}
	return Math.round(worst);
}

test('every leg of a whole route keeps to the water, not just the first', () => {
	// A loop is a chain of legs and any one of them can be the one that
	// cuts a corner off a continent, so the promise is about all of them.
	const stops = [at('Velia'), at('Rian'), at('Sherahi'), at('Biapin'),
		at('Tesivin'), at('Sikario'), at('Priko'), at('Velia')];
	const line = seaRoute(stops);
	assert.ok(line.length > stops.length * 2, 'the loop was bent, leg by leg');
	// The landing approach at each stop is over its island, by design.
	// Everywhere else the line is at sea, give or take a headland's
	// corner clipped between two turns.
	const landing = p => stops.some(s => Math.hypot(p.x - s.x, p.y - s.y) < 900);
	const crossed = dryRun(line, landing);
	assert.ok(crossed < 400, `the loop crosses ${crossed} units of land between its stops`);
});

test('a blocked leg comes back as a way round, on water throughout', () => {
	const a = at('Akenisi'), b = at('Kami');
	const leg = seaLeg(a, b);
	assert.ok(leg.length > 2, 'a detour');
	assert.equal(leg[0], a);
	assert.equal(leg[leg.length - 1], b);
	// Every turn it invents is at sea -- the barterers at each end are
	// on their islands, which is why the ends are exempt.
	for (const p of leg.slice(1, -1)) {
		assert.ok(isSea(p.x, p.y), `a turn on land at ${Math.round(p.x)},${Math.round(p.y)}`);
	}
	// And it is a route, not a wander: no longer than three times the
	// straight line it could not take.
	const len = leg.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - leg[i].x, p.y - leg[i].y), 0);
	assert.ok(len < 3 * Math.hypot(b.x - a.x, b.y - a.y), `${Math.round(len)} units is a wander`);
});

test('a route keeps its stops, in order, and marks what it added', () => {
	const stops = ['Akenisi', 'Kami', 'Belgio'].map(at);
	const line = seaRoute(stops);
	// The stops are still there, still themselves, still in order.
	const kept = line.filter(p => !p.bend);
	assert.deepEqual(kept, stops);
	assert.ok(line.length > stops.length, 'turns were added');
	// Everything added is a turn at sea, and carries no stop's name.
	for (const p of line.filter(p => p.bend)) {
		assert.ok(isSea(p.x, p.y));
		assert.equal(p.name, undefined);
	}
});

test('one point, or none, is not a route', () => {
	assert.deepEqual(seaRoute([]), []);
	const one = [at('Velia')];
	assert.deepEqual(seaRoute(one), one);
});

test('every barterer is within reach of open water', () => {
	// A stop the router cannot get a ship near would silently fall back
	// to a straight line through the island for ever.
	for (const n of [...npcs, ...ports]) {
		let near = false;
		const cx = Math.floor(n.x / SEA_CELL), cy = Math.floor(n.y / SEA_CELL);
		const r = Math.ceil(768 / SEA_CELL);
		for (let dx = -r; dx <= r && !near; dx++) {
			for (let dy = -r; dy <= r && !near; dy++) if (seaCell(cx + dx, cy + dy)) near = true;
		}
		assert.ok(near, `${n.name} has no water within 768 units`);
	}
	assert.ok(npcById.size > 0);
});

test('a point put on land is answered with the water beside it', () => {
	// A traced stop is a place a hull can float, so one dropped on an
	// island steps off it -- and the step is a short one.
	const velia = at('Velia');
	const wet = nearestWater(velia.x, velia.y);
	assert.ok(wet, 'there is water beside Velia');
	assert.equal(isSea(wet.x, wet.y), true);
	assert.ok(Math.hypot(wet.x - velia.x, wet.y - velia.y) < 1024, 'and it is the water beside it, not the next sea over');
	// Open water is already the answer, unmoved.
	assert.deepEqual(nearestWater(40000, 40000), { x: 40000, y: 40000 });
	// The middle of a continent has none within reach.
	assert.equal(nearestWater(90000, 55000, 3), null);
});

test('a channel through the land is judged on its length, not its shores', () => {
	// From Karanza the game sails to Iliya through the strait between
	// the continent and the desert, which is the shorter way. A shore
	// surcharge levied cell by cell priced that strait out -- every cell
	// of a strait is by a shore -- and the leg went round the north of
	// the continent instead, drawn shorter than that passage really is.
	const karanza = wharves.find(w => w.name === 'Karanza');
	const dario = wharves.find(w => w.name === 'Dario');
	const leg = seaLeg(karanza, dario);
	assert.ok(leg.length > 2, 'a way round');
	const north = Math.min(...leg.slice(1, -1).map(p => p.y));
	assert.ok(north > 45000, `went round the north of the continent, up to y=${Math.round(north)}`);
	const len = leg.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - leg[i].x, p.y - leg[i].y), 0);
	assert.ok(len < 62000, `${Math.round(len)} units is the way round, not the strait`);
});

test('a leg round a coast stands off it, as the game sails it', () => {
	// Karanza to Anax goes round the north of the continent, and the
	// game keeps its route well clear of the shore. A line drawn along
	// the beach is shorter than the passage, which is how a run round the
	// coast came to be preferred over ones that are really quicker.
	const karanza = wharves.find(w => w.name === 'Karanza');
	const anax = wharves.find(w => w.name === 'Anax');
	const leg = seaLeg(karanza, anax);
	assert.ok(leg.length > 2, 'a way round');
	// Along the north coast -- west of the islets off Karanza, east of
	// Anax -- every turn has water about it for a few hundred units in
	// every direction.
	const clear = (p, r) => {
		for (let dx = -r; dx <= r; dx += SEA_CELL) {
			for (let dy = -r; dy <= r; dy += SEA_CELL) if (!isSea(p.x + dx, p.y + dy)) return false;
		}
		return true;
	};
	const coast = leg.slice(1, -1).filter(p => p.x > anax.x + 3000 && p.x < 112000);
	assert.ok(coast.length >= 2, 'turns along the coast');
	for (const p of coast) {
		assert.ok(clear(p, 3 * SEA_CELL), `a turn against the shore at ${Math.round(p.x)},${Math.round(p.y)}`);
	}
	const len = leg.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - leg[i].x, p.y - leg[i].y), 0);
	assert.ok(len > 53000, `${Math.round(len)} units hugs the coast`);
});

test('a lane the game sails is followed by every leg near it', () => {
	// The game's route round the north bends in towards the bay rather
	// than cutting across its mouth. A trace of it, marked as a lane, is
	// where a leg passing that way is drawn -- and measured.
	const karanza = wharves.find(w => w.name === 'Karanza');
	const anax = wharves.find(w => w.name === 'Anax');
	const c = (cx, cy) => ({ x: cx * SEA_CELL + SEA_CELL / 2, y: cy * SEA_CELL + SEA_CELL / 2 });
	const bay = c(760, 292);
	assert.ok(isSea(bay.x, bay.y), 'the bend is on water');
	const plain = seaLeg(karanza, anax);
	const nearest = leg => Math.min(...leg.map(p => Math.hypot(p.x - bay.x, p.y - bay.y)));
	assert.ok(nearest(plain) > 6 * SEA_CELL, 'the straight passage keeps out of the bay');
	const len = leg => leg.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - leg[i].x, p.y - leg[i].y), 0);
	try {
		setLanes([[c(923, 292), c(860, 283), bay, c(694, 293)]]);
		const laned = seaLeg(karanza, anax);
		assert.ok(nearest(laned) <= 3 * SEA_CELL, `the leg bends into the bay: nearest ${Math.round(nearest(laned))}`);
		// Drawn along the lane, not sent wandering: about as long as the
		// straight passage, the bend included.
		assert.ok(len(laned) < len(plain) * 1.1, `${Math.round(len(laned))} units is a wander`);
		for (const p of laned.slice(1, -1)) assert.ok(isSea(p.x, p.y), 'still on the water');
		// A leg nowhere near the lane is drawn as before.
		const far = [at('Akenisi'), at('Kami')];
		assert.deepEqual(seaLeg(...far), plainFar);
	} finally {
		setLanes([]);
	}
	assert.deepEqual(seaLeg(karanza, anax), plain);
});
const plainFar = seaLeg(at('Akenisi'), at('Kami'));
