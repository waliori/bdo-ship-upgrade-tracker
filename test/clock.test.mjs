// The game's clocks: when a day turns, when a week turns, and when Vell
// is next up on a server that keeps a different clock from the player.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	dayKey, weekKey, periodKey, untilDaily, untilWeekly, untilBarter, countdown,
	REGION_CLOCK, resetPlan, untilHourIn,
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

test('only the regions anybody has actually checked claim to be known', () => {
	// NA and EU share one UTC clock and that is tested. The other eleven
	// are the same assumption wearing a label -- altarofgaming, the most
	// careful public source, says outright it has not tested them. The
	// table must keep saying which is which rather than flattening them.
	assert.deepEqual(Object.entries(REGION_CLOCK).filter(([, v]) => v.sure).map(([k]) => k), ['na', 'eu']);
	assert.equal(Object.keys(REGION_CLOCK).length, 13, 'every region the Market offers needs a clock');
	for (const [id, plan] of Object.entries(REGION_CLOCK)) {
		assert.ok(plan.zone, `${id} has no clock to read`);
		assert.equal(typeof plan.daily, 'number', id);
		assert.equal(typeof plan.barter, 'number', id);
		assert.ok(plan.weekly && typeof plan.weekly.day === 'number', id);
	}
});

test('a reset on a local clock counts to that clock, not to UTC', () => {
	// 00:00 in Seoul is 15:00 UTC, so at 10:30 UTC the Korean day turns
	// over in four and a half hours where the UTC one has thirteen and a
	// half to go. This is the whole reason the zone is in the table.
	const at = Date.parse('2026-09-01T10:30:00Z');
	const utc = { zone: 'UTC', daily: 0, barter: 6, weekly: { day: 4, hour: 0 } };
	const kst = { zone: 'Asia/Seoul', daily: 0, barter: 6, weekly: { day: 4, hour: 0 } };
	assert.equal(untilDaily(at, utc) / 3600e3, 13.5);
	assert.equal(untilDaily(at, kst) / 3600e3, 4.5);
	assert.equal(untilHourIn('Asia/Seoul', 0, at) / 3600e3, 4.5);
});

test('a done mark expires with the reset it belongs to, on either clock', () => {
	// The key has to turn over at the same instant the countdown reaches
	// zero, or a tick would clear at some other hour of the day.
	const kst = { zone: 'Asia/Seoul', daily: 0, barter: 6, weekly: { day: 4, hour: 0 } };
	const before = Date.parse('2026-09-01T14:59:00Z');   // 23:59 Seoul
	const after = Date.parse('2026-09-01T15:01:00Z');    // 00:01 Seoul, next day
	assert.notEqual(periodKey('daily', before, kst), periodKey('daily', after, kst),
		'the Korean day did not turn over at Korean midnight');
	// And the same two instants are the same UTC day, which is the bug
	// this replaces: one clock for thirteen regions.
	assert.equal(periodKey('daily', before, null), periodKey('daily', after, null));
});

test('a player who knows their server outranks the table', () => {
	const guessed = resetPlan('kr');
	assert.equal(guessed.sure, false, 'KR is not something we know');
	const mine = resetPlan('kr', { zone: 'Asia/Seoul', daily: 0, barter: 6, weekly: { day: 1, hour: 0 } });
	assert.equal(mine.zone, 'Asia/Seoul');
	assert.equal(mine.weekly.day, 1);
	assert.equal(mine.sure, true, 'a correction is not a guess');
	assert.equal(mine.custom, true);
});
