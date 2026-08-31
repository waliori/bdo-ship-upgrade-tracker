// The diary of where each build stood, and the finish it implies.

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
	store: new Map(),
	getItem(k) { return this.store.has(k) ? this.store.get(k) : null; },
	setItem(k, v) { this.store.set(k, String(v)); },
	removeItem(k) { this.store.delete(k); }
};
const { recordProgress, paceOf, paceText, resetPace } = await import('../js/pace.js');

const day = n => Date.parse('2026-08-01T12:00:00Z') + n * 86400e3;
const t = (missing, total = 1000) => ({ id: 'carrack', item: 'Carrack', totalUnits: total, missingUnits: missing });

test('no pace until there is a second day to compare', () => {
	resetPace();
	recordProgress([t(900)], day(0));
	assert.equal(paceOf(t(900), day(0)), null);
	assert.equal(paceText(t(900), day(0)), '');
});

test('the pace is the change over the window, and the finish follows', () => {
	resetPace();
	recordProgress([t(900)], day(0));
	recordProgress([t(700)], day(4));
	const p = paceOf(t(700), day(4));
	assert.equal(p.perDay, 50);
	assert.equal(p.span, 4);
	assert.equal(p.daysLeft, 14);
	assert.equal(paceText(t(700), day(4)), "about 14 days at the last 4 days' pace");
});

test('standing still is said plainly, and a finished build says nothing', () => {
	resetPace();
	recordProgress([t(900)], day(0));
	recordProgress([t(900)], day(2));
	assert.equal(paceText(t(900), day(2)), 'no progress in the last 2 days');
	assert.equal(paceText(t(0), day(2)), '');
});

test('a build that left the queue is forgotten; old days are pruned', () => {
	resetPace();
	recordProgress([t(900)], day(0));
	recordProgress([], day(1));
	assert.equal(paceOf(t(900), day(1)), null);
	recordProgress([t(900)], day(0));
	recordProgress([t(800)], day(40));
	assert.equal(paceOf(t(800), day(40)), null, 'a record forty days old is outside the window');
});
