// What counts as a phone, said once and read from anywhere.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONE_MQ, MENU_MQ, isPhone, isFolded, onPhoneChange } from '../js/viewport.js';

test('the queries name a narrow screen and a short touched one', () => {
	assert.match(PHONE_MQ, /max-width: 720px/);
	assert.match(PHONE_MQ, /max-height: 520px\) and \(pointer: coarse\)/);
	assert.match(MENU_MQ, /max-width: 780px/);
});

test('without a window nothing is a phone, and listening is a no-op that can be stopped', () => {
	assert.equal(isPhone(), false);
	assert.equal(isFolded(), false);
	const stop = onPhoneChange(() => {});
	assert.equal(typeof stop, 'function');
	stop();
});

test('the stylesheet repeats the same query, so the two cannot drift', async () => {
	const fs = await import('node:fs');
	const css = fs.readFileSync(new URL('../css/tracker.css', import.meta.url), 'utf8');
	assert.ok(css.includes(`@media ${PHONE_MQ}`), 'the phone query is in the CSS as written');
	assert.ok(css.includes(`@media ${MENU_MQ}`), 'and the header fold');
	assert.ok(!/@media \(max-width: 6[04]0px\)/.test(css), 'no stray phone breakpoint is left');
});
