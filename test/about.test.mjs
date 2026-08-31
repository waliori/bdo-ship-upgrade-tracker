// The dates Help shows are real dates, newest change first.

import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA, CHANGES, LATEST } from '../js/about.js';

test('every dataset carries a date or is live, and changes run newest first', () => {
	for (const d of DATA) assert.ok(d.asOf === 'live' || /^\d{4}-\d{2}-\d{2}$/.test(d.asOf), d.what);
	for (let i = 1; i < CHANGES.length; i++) assert.ok(CHANGES[i - 1].date >= CHANGES[i].date);
	for (const c of CHANGES) assert.ok(c.title && c.notes.length, c.date);
	assert.ok(LATEST.startsWith(CHANGES[0].date));
});
