// The game's clocks: when a day turns, when a week turns, and when Vell
// is next up on a server that keeps a different clock from the player.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	dayKey, weekKey, periodKey, untilDaily, untilWeekly, untilBarter, countdown,
	nextSpawn, zonedInstant, VELL
} from '../js/clock.js';

const at = iso => Date.parse(iso);

test('a daily turns at 00:00 UTC, a barter day at 06:00 UTC', () => {
	assert.equal(dayKey(at('2026-08-30T23:59:00Z')), '2026-08-30');
	assert.equal(dayKey(at('2026-08-31T00:00:00Z')), '2026-08-31');
	assert.equal(dayKey(at('2026-08-31T05:59:00Z'), 6), '2026-08-30');
	assert.equal(dayKey(at('2026-08-31T06:00:00Z'), 6), '2026-08-31');
});

test('a week turns on Thursday at 00:00 UTC', () => {
	// 2026-08-27 is a Thursday.
	assert.equal(weekKey(at('2026-08-26T23:59:00Z')), 'W2026-08-20');
	assert.equal(weekKey(at('2026-08-27T00:00:00Z')), 'W2026-08-27');
	assert.equal(weekKey(at('2026-09-02T12:00:00Z')), 'W2026-08-27');
	assert.equal(periodKey('once'), 'once');
	assert.equal(periodKey('daily', at('2026-08-30T12:00:00Z')), '2026-08-30');
});

test('the countdowns land on the next reset, never on a past one', () => {
	const now = at('2026-08-30T10:30:00Z');   // a Sunday
	assert.equal(untilDaily(now), 13.5 * 3600e3);
	assert.equal(untilBarter(now), 19.5 * 3600e3);
	assert.equal(untilWeekly(now), (3 * 24 + 13.5) * 3600e3);
	assert.equal(untilWeekly(at('2026-08-27T00:00:00Z')), 7 * 86400e3, 'exactly at the reset, the next one is a week off');
	assert.equal(countdown(untilDaily(now)), '13 h 30 m');
	assert.equal(countdown(3 * 86400e3 + 2 * 3600e3), '3 d 2 h');
	assert.equal(countdown(48 * 60e3), '48 m');
	assert.equal(countdown(10e3), 'under a minute');
	assert.equal(countdown(-5), 'now');
});

test('a server wall-clock time becomes the right instant, summer and winter', () => {
	// Berlin: CEST in August (UTC+2), CET in January (UTC+1).
	assert.equal(zonedInstant('Europe/Berlin', 2026, 7, 30, 14), at('2026-08-30T12:00:00Z'));
	assert.equal(zonedInstant('Europe/Berlin', 2026, 0, 11, 14), at('2026-01-11T13:00:00Z'));
	// Los Angeles: PDT in August (UTC-7).
	assert.equal(zonedInstant('America/Los_Angeles', 2026, 7, 30, 14), at('2026-08-30T21:00:00Z'));
});

test("Vell's next spawn is the nearest entry ahead, on the server's clock", () => {
	// Sunday 2026-08-30 10:00 UTC = 12:00 in Berlin; EU spawns Sun 14:00 and Wed 19:00.
	const eu = nextSpawn(VELL.eu.zone, VELL.eu.times, at('2026-08-30T10:00:00Z'));
	assert.equal(eu.at, at('2026-08-30T12:00:00Z'));
	assert.equal(eu.entry.day, 0);
	// Just after it, Wednesday 19:00 Berlin = 17:00 UTC.
	const later = nextSpawn(VELL.eu.zone, VELL.eu.times, at('2026-08-30T12:00:00Z'));
	assert.equal(later.at, at('2026-09-02T17:00:00Z'));
	// NA on the same Sunday morning: Sun 14:00 Los Angeles = 21:00 UTC.
	const na = nextSpawn(VELL.na.zone, VELL.na.times, at('2026-08-30T10:00:00Z'));
	assert.equal(na.at, at('2026-08-30T21:00:00Z'));
	assert.equal(nextSpawn('Europe/Berlin', []), null);
});
