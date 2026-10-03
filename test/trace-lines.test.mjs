// A drawing of several lines.
//
// A stop takes the ink it was put down in, and the stops of one ink are
// one line, numbered on their own: yellow 1 2, then blue 1 2 3. That is
// what goes to the game as a loop each. A trace kept before lines
// existed was one line whatever inks its stops wore, and must stay one.

import test from 'node:test';
import assert from 'node:assert/strict';

const { cleanTrace, traceLines, INKS } = await import('../js/map/trace.js');

const [Y, C, B] = INKS;
const stop = (x, colour, seq) => ({ x: 60000 + x * 300, y: 60000, colour, seq });

test('the stops of one ink are one line, in the order each ink was first put down', () => {
	const t = cleanTrace({ inkLines: true, points: [stop(0, Y, 1), stop(1, Y, 2), stop(2, B, 3), stop(3, B, 4), stop(4, Y, 5), stop(5, B, 6)] });
	const lines = traceLines(t);
	assert.deepEqual(lines.map(l => l.colour), [Y, B]);
	assert.deepEqual(lines.map(l => l.stops.map(s => s.at)), [[0, 1, 4], [2, 3, 5]], 'picking an ink again carries its line on');
	assert.equal(lines[1].stops[2].p, t.points[5], 'each stop points back at its place in the trace');
});

test('a trace from before lines is one line in its first stop\'s ink, whatever its stops wore', () => {
	const t = cleanTrace({ points: [stop(0, C, 1), stop(1, Y, 2), stop(2, B, 3)] });
	assert.equal(traceLines(t).length, 1);
	assert.ok(t.points.every(p => p.colour === C));
	assert.equal(t.inkLines, true, 'and is marked, so it reads as lines from now on');
	// Cleaned twice it is the same: the mark is what a link or a save carries.
	assert.deepEqual(cleanTrace(t).points, t.points);
});

test('a stop in an ink the chart does not know takes the stop ink', () => {
	const t = cleanTrace({ inkLines: true, points: [stop(0, '#123456', 1), stop(1, undefined, 2), stop(2, C, 3)] });
	assert.equal(traceLines(t).length, 1);
	assert.ok(t.points.every(p => INKS.includes(p.colour)));
});
