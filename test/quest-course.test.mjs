// The day's errands as one loop.
//
// What can go wrong: a ground called at after the man who pays for it,
// so the kill cannot be handed in; a hunt given a ground the chart does
// not have; the home port's hand-ins done before the day that earns
// them; a quest silently dropped; or an ordering so much worse than the
// slow one that the shortcut it takes is not worth taking.

import test from 'node:test';
import assert from 'node:assert/strict';

import { quests } from '../js/quests.js';
import { questCourse, groundsOf, spotsOf, km } from '../js/quest-course.js';
import { handIn } from '../js/quest-places.js';
import { monsterByKey, monsters } from '../js/sea_monsters.js';
import { ports } from '../js/barter_npcs.js';
import { seaLeg } from '../js/searoute.js';

const VELIA = ports.find(p => p.name === 'Velia');

/** Every repeatable, with one of each one-a-day group. */
function everyDay() {
	const seen = new Set();
	return quests.filter(q => {
		if (q.repeat !== 'daily' && q.repeat !== 'weekly') return false;
		if (!q.group) return true;
		if (seen.has(q.group)) return false;
		seen.add(q.group);
		return true;
	});
}

const sail = (a, b) => {
	const pts = seaLeg(a, b);
	let n = 0;
	for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
	return n;
};

test('every quest given is placed, and each one exactly once', () => {
	const want = everyDay();
	const c = questCourse(want, VELIA);
	const placed = new Map();
	for (const stop of c.stops) for (const t of stop.todo) {
		const row = placed.get(t.q.id) || { hand: 0, kill: 0 };
		row[t.what === 'kill' ? 'kill' : 'hand']++;
		placed.set(t.q.id, row);
	}
	for (const q of want) {
		if (c.left.some(x => x.q.id === q.id)) continue;
		const row = placed.get(q.id);
		assert.ok(row, `${q.id} is nowhere on the loop`);
		assert.equal(row.hand, 1, `${q.id} is handed in ${row.hand} times`);
		if (q.kills) assert.equal(row.kill, 1, `${q.id} wants a kill and got ${row.kill}`);
	}
	// Nothing is left out of a full day: every one of these has a ground.
	assert.deepEqual(c.left, [], c.left.map(x => `${x.q.id}: ${x.why}`).join('; '));
});

test('a ground is never called at after the man who pays for it', () => {
	const c = questCourse(everyDay(), VELIA);
	const at = (pred) => c.stops.findIndex(pred);
	for (const stop of c.stops) for (const t of stop.todo) {
		if (t.what !== 'kill') continue;
		const hand = at(s => s.todo.some(x => x.q.id === t.q.id && x.what === 'hand in'));
		const ground = c.stops.indexOf(stop);
		assert.ok(hand > ground, `${t.q.id}: killed at call ${ground + 1}, handed in at ${hand + 1}`);
	}
});

test('the loop leaves the harbour and comes back to it, and pays there last', () => {
	const c = questCourse(everyDay(), VELIA);
	const first = c.stops[0], last = c.stops[c.stops.length - 1];
	assert.equal(first.name, 'Velia');
	assert.equal(last.name, 'Velia');
	// Setting out is setting out: nothing is handed in before the day.
	assert.deepEqual(first.todo, []);
	// Velia's own hand-ins wait for the end.
	const proix = quests.find(q => q.id === 'hungry');
	assert.ok(last.todo.some(t => t.q.id === proix.id), 'Velia’s quests are not handed in on the way home');

	// An open line keeps them where they are and does not double back.
	const open = questCourse(everyDay(), VELIA, { back: false });
	assert.equal(open.stops[0].name, 'Velia');
	assert.notEqual(open.stops[open.stops.length - 1].name, 'Velia');
	assert.ok(open.length < c.length, 'not going home is not shorter');
});

test('a hunt is put where the monsters are, not where the map writes their name', () => {
	const c = questCourse(everyDay(), VELIA);
	for (const stop of c.stops) {
		if (!stop.species) continue;
		for (const sp of stop.species) {
			const m = monsterByKey[sp.key];
			// The call must be on one of the species' own spawn points --
			// or, for the one or two the codex gives no positions for, on
			// the only thing there is. A habitat marker is a caption the
			// game's world map draws at a named ground; it is placed to be
			// read, and steering for it is steering for a word.
			const spot = spotsOf(m).some(g => Math.hypot(g.x - stop.x, g.y - stop.y) <= 2400);
			assert.ok(spot, `${stop.name} is not anywhere ${m.name} spawns`);
			if (!m.points || !m.points.length) continue;
			const near = Math.min(...m.points.map(([x, y]) => Math.hypot(x - stop.x, y - stop.y)));
			assert.ok(near <= 2400, `${m.name} is hunted ${(near * 0.25 / 1000).toFixed(1)} km from its nearest spawn`);
		}
	}
	// The three Black Rust quests want one, two and four: seven in all,
	// at one ground, in one call.
	const rust = c.stops.filter(s => s.species && s.species.some(x => x.key === 'black-rust'));
	assert.equal(rust.length, 1, 'the Black Rust are hunted at more than one ground');
	const killed = rust[0].todo.filter(t => t.of === 'Black Rust').reduce((a, t) => a + t.n, 0);
	assert.equal(killed, 7);
	// And that call says so in its name.
	assert.match(rust[0].name, /Black Rust/);
});

test('the young-sea-monster quests are paid by a young ground the loop already passes', () => {
	const c = questCourse(everyDay(), VELIA);
	const loose = quests.filter(q => q.any === 'young' && everyDay().includes(q));
	const grounds = c.stops.filter(s => s.species && s.species.some(x => (monsterByKey[x.key] || {}).kind === 'young'));
	// All three ride on the same ground rather than three of their own.
	assert.equal(grounds.length, 1, `${grounds.length} young grounds for ${loose.length} quests`);
	const young = grounds[0].todo.filter(t => /young/.test(t.of));
	assert.equal(young.length, loose.length);
	assert.equal(young.reduce((a, t) => a + t.n, 0), 27, 'five, two and twenty is twenty-seven');
});

test('a ground is the middle of a cluster of spawns, never the map’s caption', () => {
	// The marker and the ground are different things, and this is the
	// distance between them: the Black Rust icon is the better part of
	// ten kilometres from the nearest Black Rust.
	for (const key of ['hekaru', 'black-rust', 'nineshark', 'candidum', 'ocean-stalker']) {
		const m = monsterByKey[key];
		assert.ok(m.zones && m.zones.length, `${key} has no marker to be wrong about`);
		for (const g of groundsOf(m)) {
			const near = Math.min(...m.points.map(([x, y]) => Math.hypot(x - g.x, y - g.y)));
			assert.ok(near < 6000, `${m.name}'s ground is ${Math.round(near)} from any spawn`);
		}
	}
	// The Black Rust's marker is nowhere near its ground, which is the
	// whole reason this changed.
	const rust = monsterByKey['black-rust'];
	const worst = Math.max(...rust.zones.map(([x, y]) =>
		Math.min(...rust.points.map(([px, py]) => Math.hypot(px - x, py - y)))));
	assert.ok(worst * 0.25 / 1000 > 5, `the marker is only ${(worst * 0.25 / 1000).toFixed(1)} km out`);

	const young = monsterByKey['young-hekaru'];
	assert.ok(!young.zones, 'the young ones have grown markers');
	const g = groundsOf(young);
	assert.ok(g.length >= 1 && g.length <= 6, `${g.length} grounds`);
	assert.deepEqual(groundsOf(null), []);
	assert.deepEqual(groundsOf({ key: 'nothing', points: [] }), []);
});

test('the spots offered are the spawns with company, on open water', () => {
	const hekaru = monsterByKey.hekaru;
	const spots = spotsOf(hekaru);
	assert.ok(spots.length > 10, `${spots.length} spots for a hundred spawns`);
	// Every one is a spawn point of its own species.
	const own = new Set(hekaru.points.map(([x, y]) => `${x},${y}`));
	for (const s of spots) assert.ok(own.has(`${s.x},${s.y}`), `a spot at ${s.x},${s.y} is no Hekaru spawn`);
	// A ground too thin for any spot to have company keeps its own
	// positions rather than being thinned to nothing.
	const lyng = monsterByKey.lyngbakr;
	assert.equal(spotsOf(lyng).length, lyng.points.length);
	// And a species with no positions at all still offers its marker.
	const khan = monsterByKey.khan;
	if (khan) assert.equal(spotsOf(khan).length, groundsOf(khan).length);
	assert.deepEqual(spotsOf(null), []);
});

test('nothing to do, or nowhere to start, is no course at all', () => {
	assert.equal(questCourse([], VELIA), null);
	assert.equal(questCourse(everyDay(), null), null);
	// A quest whose places the chart does not know is not a call.
	assert.equal(questCourse([{ id: 'nowhere', name: 'x', at: [['port', 'Atlantis', 'nobody', 'talk']] }], VELIA), null);
});

const real = c => {
	let n = 0;
	for (let i = 1; i < c.stops.length; i++) n += sail(c.stops[i - 1], c.stops[i]);
	return n;
};

test('the length the panel shows is the length actually sailed', () => {
	// Ordered on straight lines, measured on water: the second half of
	// that is the half a sailor reads, so it has to be the real one.
	const c = questCourse(everyDay(), VELIA);
	const measured = real(c);
	assert.ok(Math.abs(km(c.length) - km(measured)) < 0.05,
		`reported ${km(c.length).toFixed(2)} km, sailed ${km(measured).toFixed(2)} km`);
	// And the straight line between the same calls is shorter than the
	// water between them, which is what makes the distinction worth
	// drawing at all.
	let flat = 0;
	for (let i = 1; i < c.stops.length; i++) flat += Math.hypot(c.stops[i].x - c.stops[i - 1].x, c.stops[i].y - c.stops[i - 1].y);
	assert.ok(flat < measured, 'sailing round the land is not longer than going through it');
});

test('ordering on straight lines costs a few per cent, not a few tens of them', () => {
	// The whole reason the page can work a loop out while someone
	// watches: ordering on true sailing distance is an A* search for
	// every pair of calls and every ground they might be at, which is
	// minutes. This is the claim that buys the shortcut, and it is
	// checked rather than asserted in a comment -- on a handful of
	// quests, since the careful ordering is the slow thing being
	// measured.
	const want = everyDay().filter(q => /^omg-candidum$|^hungry$|^winwin$|^goods-narvo$/.test(q.id));
	assert.ok(want.length >= 3, `${want.length} quests is too few to order`);
	const quick = real(questCourse(want, VELIA));
	const slow = real(questCourse(want, VELIA, { water: true }));
	// Neither ordering is optimal -- both are greedy, and on a given day
	// either can come out ahead -- so the claim is only that the quick
	// one is not materially worse. It is allowed to win.
	assert.ok(quick <= slow * 1.12,
		`straight lines cost ${((quick / slow - 1) * 100).toFixed(1)}% — too much to be worth it`);
	assert.ok(quick > 0 && slow > 0);
});

test('every quest that names a monster names one the chart has', () => {
	for (const q of quests) {
		if (!q.monster) continue;
		assert.ok(monsterByKey[q.monster], `${q.id} hunts ${q.monster}, which is not in sea_monsters.js`);
		if (q.kills) assert.ok(Number.isInteger(q.kills) && q.kills > 0, `${q.id} wants ${q.kills}`);
	}
	// Every repeatable that asks for a kill says how many.
	for (const q of quests) {
		if (q.repeat !== 'daily' && q.repeat !== 'weekly') continue;
		if (!q.monster) continue;
		assert.ok(q.kills, `${q.id} hunts but says no number`);
	}
	// And every hunted species can actually be found.
	const hunted = new Set(quests.filter(q => q.monster).map(q => q.monster));
	for (const key of hunted) {
		assert.ok(groundsOf(monsterByKey[key]).length, `${key} has no ground on the chart`);
	}
	assert.ok(monsters.length > 10);
});

test('a quest handed in where the loop already calls does not add a call', () => {
	const c = questCourse(everyDay(), VELIA);
	const places = c.stops.map(s => `${Math.round(s.x)},${Math.round(s.y)}`);
	// Velia is the only place called at twice: out and back.
	const seen = new Map();
	for (const p of places) seen.set(p, (seen.get(p) || 0) + 1);
	const twice = [...seen].filter(([, n]) => n > 1);
	assert.equal(twice.length, 1, `called twice at ${twice.map(([p]) => p).join(' and ')}`);
	// Oquilla's Eye takes a dozen hand-ins in one call.
	const oquilla = c.stops.find(s => /Oquilla/.test(s.name));
	assert.ok(oquilla && oquilla.todo.length >= 8, 'the Oquilla hand-ins are not gathered into one call');
	// Every quest on the loop is handed in where the chart says it is.
	for (const stop of c.stops) for (const t of stop.todo) {
		if (t.what !== 'hand in') continue;
		const step = handIn(t.q);
		assert.ok(Math.hypot(step.x - stop.x, step.y - stop.y) < 1000, `${t.q.id} is handed in in the wrong place`);
	}
});

// The loop as something to take away: the game's own world map, and a
// drawing the Draw tab can name, keep and share.
//
// Both are built from the same plan and both are bounded by what the
// thing they are going into will hold -- a bookmark's name is cut at
// thirty characters, a trace takes forty stops and a stroke of six
// hundred points -- so the checks are that nothing is lost in the
// ordering and nothing overflows.
const { errandPoints, errandTrace } = await import('../js/map/errands.js');
const { cleanTrace, TRACE_STOPS } = await import('../js/map/trace.js');

test('the loop goes to the game’s map numbered, named by what is done there', () => {
	const c = questCourse(everyDay(), VELIA);
	const pts = errandPoints(c);
	assert.equal(pts.length, c.stops.length);
	pts.forEach((p, i) => {
		assert.match(p.name, new RegExp(`^${i + 1}: `), `call ${i + 1} is not numbered`);
		assert.ok(p.name.length <= 30, `"${p.name}" is ${p.name.length} long`);
		assert.equal(p.x, c.stops[i].x);
		assert.equal(p.y, c.stops[i].y);
	});
	// A hunt says the kill, a wharf says who is seen.
	const rust = pts[c.stops.findIndex(s => s.species && s.species.some(x => x.key === 'black-rust'))];
	assert.match(rust.name, /7x Black Rust/);
	assert.deepEqual(errandPoints(null), []);
});

test('the loop draws as a trace the Draw tab will take', () => {
	const c = questCourse(everyDay(), VELIA);
	const raw = errandTrace(c, 'Velia');
	assert.equal(raw.kind, 'trace');
	// It has to survive the Draw tab's own cleaning unchanged in shape.
	const t = cleanTrace(raw);
	assert.ok(t, 'the trace was thrown out as unreadable');
	assert.equal(t.points.length, Math.min(c.stops.length, TRACE_STOPS));
	assert.ok(t.strokes.length === 1, 'the sailed line is not one stroke');
	assert.ok(t.strokes[0].pts.length >= c.stops.length * 2, 'the line has fewer points than calls');
	// Every stop is noted with its number and what is done there.
	t.points.forEach((p, i) => {
		assert.match(p.note, new RegExp(`^${i + 1}\\. `));
		assert.ok(p.note.length <= 120);
	});
	assert.match(t.points[t.points.length - 1].note, /Velia/);
	assert.match(t.notes, /calls, .* km/);
	assert.equal(errandTrace(null), null);
});
