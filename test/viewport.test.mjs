// What counts as a phone, said once and read from anywhere.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONE_MQ, isPhone, onPhoneChange } from '../js/viewport.js';

test('the queries name a narrow screen and a short touched one', () => {
	assert.match(PHONE_MQ, /max-width: 720px/);
	assert.match(PHONE_MQ, /max-height: 520px\) and \(pointer: coarse\)/);
});

test('without a window nothing is a phone, and listening is a no-op that can be stopped', () => {
	assert.equal(isPhone(), false);
	const stop = onPhoneChange(() => {});
	assert.equal(typeof stop, 'function');
	stop();
});

test('the stylesheet repeats the same query, so the two cannot drift', async () => {
	const fs = await import('node:fs');
	const dir = new URL('../css/', import.meta.url);
	const css = fs.readdirSync(dir).filter(f => f.startsWith('tracker-')).map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');
	assert.ok(css.includes(`@media ${PHONE_MQ}`), 'the phone query is in the CSS as written');
	assert.ok(!/@media \(max-width: 6[04]0px\)/.test(css), 'no stray phone breakpoint is left');
});
