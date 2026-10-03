// The ceilings on the routes that have no account to key on: the market
// relay and the push subscription. Two windows, per address and for the
// whole process, and a Retry-After on the refusal.

import test from 'node:test';
import assert from 'node:assert/strict';

import { perAddress } from '../server/limit.js';

function call(limiter, ip) {
	const res = { code: 200, headers: {}, body: null,
		set(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
	let passed = false;
	limiter({ ip }, res, () => { passed = true; });
	return { passed, res };
}

test('one address is held to its share, and another is not affected', () => {
	const limiter = perAddress(3, 100);
	for (let i = 0; i < 3; i++) assert.ok(call(limiter, '10.0.0.1').passed);
	const fourth = call(limiter, '10.0.0.1');
	assert.equal(fourth.passed, false);
	assert.equal(fourth.res.code, 429);
	assert.ok(Number(fourth.res.headers['Retry-After']) >= 1);
	assert.ok(call(limiter, '10.0.0.2').passed);
});

test('the process-wide ceiling holds whoever is asking', () => {
	const limiter = perAddress(100, 4, 'enough');
	for (let i = 0; i < 4; i++) assert.ok(call(limiter, `10.0.0.${i}`).passed);
	const fifth = call(limiter, '10.0.0.99');
	assert.equal(fifth.passed, false);
	assert.equal(fifth.res.body.error, 'enough');
});

test('one address looping on its refusal does not spend everybody else\'s minute', () => {
	// The market's own numbers: thirty an address, a hundred and twenty
	// in all. Two hundred calls from one host used to leave the next
	// player refused.
	const limiter = perAddress(30, 120);
	for (let i = 0; i < 200; i++) call(limiter, '1.1.1.1');
	assert.equal(call(limiter, '1.1.1.1').passed, false);
	assert.ok(call(limiter, '2.2.2.2').passed, 'a different player was refused for the first one\'s loop');
	// What the first one was let through still counts: three more hosts
	// at their full share reach the ceiling, and the fifth is refused.
	for (const ip of ['3.3.3.3', '4.4.4.4', '5.5.5.5']) for (let i = 0; i < 30; i++) call(limiter, ip);
	assert.equal(call(limiter, '6.6.6.6').passed, false);
});
