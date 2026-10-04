// The Inventory window's two bars, read off a screenshot: the weight
// carried against its limit, the slots filled against how many there
// are, and what that leaves the bag to take on a barter run.
//
// What can go wrong: the LT run into the figure as "1T" and read as a
// digit, a figure in another client's separators, the gold or the
// silver at the window's foot taken for a bar, and a limit misread so
// that the weight carried is far past it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bagFigures, bagRoom } from '../js/bag-shot.js';
import { figure } from '../js/fmt.js';

const W = (text, y, x = 0) => ({ text, x0: x, x1: x + 10 * text.length, y0: y - 8, y1: y + 8 });

test('the two bars as the engine read three real screenshots of the Inventory window', () => {
	// The words Tesseract gave for the cropped bars, the whole window,
	// and the window beside the Equipment window (2026-09-25).
	const crop = [W('Inventory', 34, 10), W('Slot', 34, 60), W('134/192', 48, 200), W('Weight', 140, 10), W('1,628.7/2,779LT', 153, 200)];
	const window = [W('Quest', 440, 10), W('044LT', 435, 300), W('Crystal/Lightstone', 1171, 10), W('12.9217', 1171, 300), W('30.7LT', 1465, 300), W('Inventory', 1609, 10), W('Slot', 1609, 60), W('134/192', 1622, 200), W('Weight', 1711, 10), W('1,628.7/2,7791T', 1728, 200), W('1,059', 1990), W('59,548', 1990, 300), W('4,900', 1991, 600), W('70,218,996', 2070)];
	const beside = [W('Attack', 1520, 10), W('(AP)', 1519, 60), W('364', 1519, 300), W('Inventory', 1502, 400), W('Slot', 1502, 460), W('134/192', 1515, 600), W('372', 1597, 300), W('Weight', 1598, 400), W('1,628.7/2,779LT', 1615, 600), W('435', 1675, 300)];
	for (const words of [crop, window, beside]) assert.deepEqual(bagFigures(words), { now: 1628.7, max: 2779, used: 134, slots: 192 });
});

test('the LT read as a digit is taken off only when what is left can be the limit', () => {
	const read = t => bagFigures([W(t, 100)]);
	assert.equal(read('1,628.7/2,7791T').max, 2779, '"LT" read "1T"');
	assert.equal(read('1,628.7/27791T').max, 2779, 'and with no thousands comma');
	assert.equal(read('1628.7/2779IT').max, 2779);
	assert.equal(read('1,628.7/2,781T').max, 2781, 'the L lost, the 1 is the limit\'s own');
	assert.equal(read('1,628.7 / 2,779 LT').max, 2779, 'split into words');
	assert.equal(bagFigures([W('1.628,7', 100), W('/', 100, 90), W('2.779', 100, 110), W('LT', 100, 170)]).now, 1628.7, 'a client that groups with dots');
});

test('nothing that is not a bar is taken for one', () => {
	assert.deepEqual(bagFigures([W('1,059', 10), W('59,548', 10, 200), W('70,218,996', 40), W('364', 60)]), { now: null, max: null, used: null, slots: null });
	assert.deepEqual(bagFigures([]), { now: null, max: null, used: null, slots: null });
	assert.equal(figure('1,62,0'), null, 'thousands come in threes');
	assert.equal(figure('1,62'), 1.62, 'a comma decimal');
	assert.equal(figure('2,779'), 2779);
});

test('the bag takes 170% of the limit less what it holds, in the slots still empty', () => {
	assert.deepEqual(bagRoom({ now: 1628.7, max: 2779, used: 134, slots: 192 }), { lt: 3095, slots: 58 });
	assert.deepEqual(bagRoom({ now: 5000, max: 2779, used: 192, slots: 192 }), { lt: 0, slots: 0 }, 'past it: nothing');
	assert.deepEqual(bagRoom({ now: 0, max: 0, used: 0, slots: 0 }), { lt: null, slots: null }, 'nothing typed: not known');
});
