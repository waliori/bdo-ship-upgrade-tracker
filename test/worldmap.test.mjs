// The game's map.
//
// A bookmark that lands 200 m off is worse than none: the player sails
// to it and finds sea. So the transform is checked against positions
// the game itself holds -- the client's knowledge data for the
// barterers, which is the same source the fishing community's
// waypoints come from -- and the XML against the shape that data is
// known to load.

import test from 'node:test';
import assert from 'node:assert/strict';

import { npcById, ports } from '../js/barter_npcs.js';
import { toGame, fromGame, bookmarkXML, BOOKMARK_SLOTS, CAMERA_SLOTS, readGameXML, looksLikeGameXML } from '../js/worldmap.js';

// World positions from the client's knowledge data (Barterers.xml in
// Flockenberger's bdo-knowledge-waypoints, read 2026-08-30), paired
// with the codex ids in barter_npcs.js.
const KNOWN = [
	[58922, 'Akenisi', -176153.96875, 288022.0],
	[58935, 'Belgio', 145777.0, 217265.0],
	[58958, 'Biapin', 420309.125, 233617.03125],
	[58901, 'Cazio', -445068.03125, 85859.6328125]
];

test('the chart lands on the game\'s own positions', () => {
	for (const [id, name, gx, gz] of KNOWN) {
		const n = npcById.get(id);
		assert.ok(n && n.name === name, `${name} is ${id}`);
		const g = toGame(n.x, n.y);
		// 250 game units is 10 chart pixels and 2.5 m of sea.
		assert.ok(Math.abs(g.x - gx) < 250, `${name} x ${g.x} vs ${gx}`);
		assert.ok(Math.abs(g.z - gz) < 250, `${name} z ${g.z} vs ${gz}`);
	}
});

test('the wharf manager at Velia checks out to the decimal', () => {
	// Croix on BDOCodex is (68884.5028, 68454.58); in the knowledge
	// data he stands at (7112.57, 93635.5).
	const g = toGame(68884.5028, 68454.58);
	assert.ok(Math.abs(g.x - 7112.57) < 0.01);
	assert.ok(Math.abs(g.z - 93635.5) < 0.01);
});

test('to the game and back is the identity', () => {
	for (const n of [...ports, npcById.get(58922)]) {
		const g = toGame(n.x, n.y);
		const back = fromGame(g.x, g.z);
		assert.ok(Math.abs(back.x - n.x) < 1e-6 && Math.abs(back.y - n.y) < 1e-6, n.name);
	}
});

test('the block has the shape the game reads', () => {
	const pts = [
		{ name: '1: Akenisi (Narvo Island)', x: 61554, y: 60679 },
		{ name: '2: Kami (Crow\'s Nest)', x: 78047.2, y: 44417.76 }
	];
	const r = bookmarkXML(pts);
	assert.equal(r.bookmarks, 2);
	assert.equal(r.cameras, 0);
	assert.equal(r.dropped, 0);
	const lines = r.xml.split('\r\n');
	assert.equal(lines[0], '<WorldMapQuickScreenPosition Version="4">');
	assert.equal(lines[1], '\t<WorldmapBookMark>');
	assert.match(lines[2], /^\t\t<BookMark BookMarkName="1: Akenisi \(Narvo Island\)" PosX="-176150" PosY="-8175" PosZ="288025"\/>$/);
	assert.match(lines[3], /BookMarkName="2: Kami \(Crow's Nest\)"/);
	assert.equal(lines[4], '\t</WorldmapBookMark>');
	assert.equal(lines[5], '</WorldMapQuickScreenPosition>');
	assert.equal(lines[6], '');
	// Every line ends the file's way, none the other.
	assert.ok(!/[^\r]\n/.test(r.xml));
});

test('an empty route is the game\'s own empty block', () => {
	const r = bookmarkXML([]);
	assert.equal(r.xml, '<WorldMapQuickScreenPosition Version="4">\r\n\t<WorldmapBookMark/>\r\n</WorldMapQuickScreenPosition>\r\n');
});

test('a long route spills onto the camera slots, then is counted', () => {
	const pts = Array.from({ length: 20 }, (_, i) => ({ name: `${i + 1}: stop`, x: 60000 + i * 100, y: 60000 }));
	const r = bookmarkXML(pts);
	assert.equal(r.bookmarks, BOOKMARK_SLOTS);
	assert.equal(r.cameras, CAMERA_SLOTS);
	assert.equal(r.dropped, 20 - BOOKMARK_SLOTS - CAMERA_SLOTS);
	const cams = r.xml.match(/<WorldMapQuickScreenPosition index="(\d)"/g);
	assert.equal(cams.length, CAMERA_SLOTS);
	assert.equal(cams[0], '<WorldMapQuickScreenPosition index="0"');
	assert.equal(cams[9], '<WorldMapQuickScreenPosition index="9"');
	// The sixth stop is camera 0, in order.
	const g = toGame(pts[5].x, pts[5].y);
	assert.match(r.xml, new RegExp(`index="0" positionX="${g.x}" positionY="-8175" positionZ="${g.z}" cameraDistance="40000"`));
	// Bookmarks carry the first five, not the spill.
	assert.match(r.xml, /BookMarkName="5: stop"/);
	assert.doesNotMatch(r.xml, /BookMarkName="6: stop"/);
	const off = bookmarkXML(pts, { cameras: false });
	assert.equal(off.cameras, 0);
	assert.equal(off.dropped, 15);
});

test('names are escaped the way an attribute needs', () => {
	const r = bookmarkXML([{ name: 'a & b <c> "d"', x: 60000, y: 60000 }]);
	assert.match(r.xml, /BookMarkName="a &amp; b &lt;c&gt; &quot;d&quot;"/);
});

import { spliceBlock } from '../js/worldmap.js';

test('the block is swapped in place and the rest of the file is untouched', () => {
	const file = '<A Version="1"/>\r\n<WorldMapQuickScreenPosition Version="4">\r\n\t<WorldmapBookMark/>\r\n</WorldMapQuickScreenPosition>\r\n<B Version="2"/>\r\n';
	const r = spliceBlock(file, bookmarkXML([{ name: '1: x', x: 60000, y: 60000 }]).xml);
	assert.ok(r);
	assert.ok(r.text.startsWith('<A Version="1"/>\r\n<WorldMapQuickScreenPosition Version="4">\r\n\t<WorldmapBookMark>\r\n\t\t<BookMark BookMarkName="1: x"'));
	assert.ok(r.text.endsWith('</WorldMapQuickScreenPosition>\r\n<B Version="2"/>\r\n'));
	assert.equal(r.previous, '<WorldMapQuickScreenPosition Version="4">\r\n\t<WorldmapBookMark/>\r\n</WorldMapQuickScreenPosition>');
	assert.ok(!/[^\r]\n/.test(r.text));
	// And back again.
	assert.equal(spliceBlock(r.text, r.previous).text, file);
});

test('the self-closing lobby form is a block too, and a file without one is refused', () => {
	const lobby = '<X/>\r\n<WorldMapQuickScreenPosition Version="4"/>\r\n<Y/>\r\n';
	const r = spliceBlock(lobby, bookmarkXML([]).xml);
	assert.ok(r && r.text.includes('<WorldmapBookMark/>'));
	assert.equal(spliceBlock('<X/>\n<Y/>\n', bookmarkXML([]).xml), null);
	// LF files stay LF.
	const lf = spliceBlock('<WorldMapQuickScreenPosition Version="4"/>\n', bookmarkXML([]).xml);
	assert.ok(!lf.text.includes('\r'));
});

import { naviPathXML, LOOP_SLOTS } from '../js/worldmap.js';

test('a loop carries every stop, in the world space the client uses', () => {
	// The loop saved in game on 2026-08-30 had its first point at
	// PosX="4.11843e+11" PosZ="2.54844e+11", which is Perugia's own
	// position times a million.
	const perugia = { x: 85073.72, y: 62006.24 };
	const xml = naviPathXML([perugia], 0);
	const m = /PosX="([-\d.e+]+)" PosY="([-\d.e+]+)" PosZ="([-\d.e+]+)"/.exec(xml);
	assert.ok(m, 'a path row');
	assert.ok(Math.abs(Number(m[1]) - 4.11843e+11) < 1e6, m[1]);
	assert.ok(Math.abs(Number(m[3]) - 2.54844e+11) < 1e6, m[3]);
	assert.equal(Number(m[2]), -8.175e+09);
	// The client's own float format: %g at six figures, two-digit exponent.
	assert.match(xml, /PosY="-8\.175e\+09"/);
});

test('a loop is not capped at five, and only three slots exist', () => {
	const pts = Array.from({ length: 30 }, (_, i) => ({ name: `${i}`, x: 60000 + i * 10, y: 60000 }));
	const r = bookmarkXML(pts, { loop: 2 });
	assert.equal(r.loop.slot, 2);
	assert.equal(r.loop.points, 30);
	assert.equal((r.xml.match(/<Path /g) || []).length, 30);
	// The bookmarks and cameras still take what they can.
	assert.equal(r.bookmarks, 5);
	assert.equal(r.cameras, 10);
	assert.match(r.xml, /<WorldmapNaviPath Index="2">/);
	// Out-of-range slots are simply no loop at all.
	assert.equal(bookmarkXML(pts, { loop: LOOP_SLOTS }).loop, null);
	assert.equal(bookmarkXML(pts, { loop: -1 }).loop, null);
	assert.equal(bookmarkXML(pts).loop, null);
});

test('the loops in the other slots survive a write', () => {
	const existing = '<WorldMapQuickScreenPosition Version="4">\r\n'
		+ '\t<WorldmapNaviPath Index="0">\r\n\t\t<Path PosX="1" PosY="2" PosZ="3"/>\r\n\t</WorldmapNaviPath>\r\n'
		+ '\t<WorldmapNaviPath Index="2">\r\n\t\t<Path PosX="9" PosY="9" PosZ="9"/>\r\n\t</WorldmapNaviPath>\r\n'
		+ '\t<WorldmapBookMark/>\r\n</WorldMapQuickScreenPosition>\r\n';
	const mine = bookmarkXML([{ name: '1: a', x: 60000, y: 60000 }], { loop: 0 });
	const out = spliceBlock(existing, mine.xml);
	// Ours took slot 0; the stranger in slot 2 is still there, once.
	assert.equal((out.text.match(/<WorldmapNaviPath Index="0">/g) || []).length, 1);
	assert.equal((out.text.match(/<WorldmapNaviPath Index="2">/g) || []).length, 1);
	assert.match(out.text, /PosX="9" PosY="9" PosZ="9"/);
	assert.doesNotMatch(out.text, /PosX="1" PosY="2" PosZ="3"/);
	// Kept loops sit before the bookmarks, as the client writes them.
	assert.ok(out.text.indexOf('Index="2"') < out.text.indexOf('<WorldmapBookMark'));
	assert.ok(!/[^\r]\n/.test(out.text));
});

test('writing a loop costs you neither your favourites nor your camera slots', () => {
	const existing = '<WorldMapQuickScreenPosition Version="4">\r\n'
		+ '\t<WorldMapQuickScreenPosition index="0" positionX="5" positionY="-8175" positionZ="6" cameraDistance="40000"/>\r\n'
		+ '\t<WorldmapBookMark>\r\n\t\t<BookMark BookMarkName="mine" PosX="1" PosY="2" PosZ="3"/>\r\n\t</WorldmapBookMark>\r\n'
		+ '</WorldMapQuickScreenPosition>\r\n';
	const pts = Array.from({ length: 9 }, (_, i) => ({ name: `${i + 1}: s`, x: 60000 + i * 100, y: 60000 }));
	const mine = bookmarkXML(pts, { cameras: false, bookmarks: false, loop: 1 });
	// A loop-only block says nothing about bookmarks or cameras...
	assert.doesNotMatch(mine.xml, /WorldmapBookMark/);
	assert.doesNotMatch(mine.xml, /QuickScreenPosition index=/);
	const out = spliceBlock(existing, mine.xml);
	// ...so the file keeps its own, and gains the loop.
	assert.match(out.text, /BookMarkName="mine"/);
	assert.match(out.text, /index="0" positionX="5"/);
	assert.equal((out.text.match(/<Path /g) || []).length, 9);
	// Order is the client's: cameras, loops, bookmarks.
	assert.ok(out.text.indexOf('index="0"') < out.text.indexOf('NaviPath'));
	assert.ok(out.text.indexOf('NaviPath') < out.text.indexOf('WorldmapBookMark'));
	// Indentation of a carried element is preserved, closing tag included.
	assert.match(out.text, /\t<WorldmapBookMark>\r\n\t\t<BookMark[^\n]*\r\n\t<\/WorldmapBookMark>/);
	assert.ok(!/[^\r]\n/.test(out.text));
});

test('writing favourites leaves every loop alone', () => {
	const existing = '<WorldMapQuickScreenPosition Version="4">\r\n'
		+ '\t<WorldmapNaviPath Index="0">\r\n\t\t<Path PosX="1" PosY="2" PosZ="3"/>\r\n\t</WorldmapNaviPath>\r\n'
		+ '\t<WorldmapNaviPath Index="2">\r\n\t\t<Path PosX="9" PosY="9" PosZ="9"/>\r\n\t</WorldmapNaviPath>\r\n'
		+ '\t<WorldmapBookMark/>\r\n</WorldMapQuickScreenPosition>\r\n';
	const out = spliceBlock(existing, bookmarkXML([{ name: '1: a', x: 60000, y: 60000 }]).xml);
	assert.match(out.text, /PosX="1" PosY="2" PosZ="3"/);
	assert.match(out.text, /PosX="9" PosY="9" PosZ="9"/);
	assert.match(out.text, /BookMarkName="1: a"/);
});

import { writeMode, LOOP_SLOTS as SLOTS } from '../js/worldmap.js';

test('choosing the favourites again is always possible', () => {
	// The favourites option carries an empty value, and Number('') is 0
	// -- a real loop slot. Coerce first and picking the favourites picks
	// loop 1 instead, with no way back to them.
	assert.equal(writeMode(''), 'favorites');
	assert.equal(writeMode(null), 'favorites');
	assert.equal(writeMode(undefined), 'favorites');
	// The loops still are what they say.
	assert.equal(writeMode('0'), 0);
	assert.equal(writeMode(0), 0);
	assert.equal(writeMode('2'), 2);
	// And nothing beyond them.
	assert.equal(writeMode(String(SLOTS)), 'favorites');
	assert.equal(writeMode('-1'), 'favorites');
	assert.equal(writeMode('1.5'), 'favorites');
	assert.equal(writeMode('nonsense'), 'favorites');
});

/* ------------------------------------------------------------------ *
 * the file read back
 * ------------------------------------------------------------------ */

test('what the export writes, the reader gets back: favourites, camera slots and a loop', () => {
	const pts = Array.from({ length: 8 }, (_, i) => ({ name: `Stop ${i + 1}`, x: 60000 + i * 500, y: 60000 - i * 250 }));
	const fav = readGameXML(bookmarkXML(pts).xml);
	assert.equal(fav.favorites.length, BOOKMARK_SLOTS);
	assert.equal(fav.cameras.length, 3);
	assert.deepEqual(fav.favorites.map(p => p.name), pts.slice(0, 5).map(p => p.name));
	for (let i = 0; i < 8; i++) {
		const got = i < 5 ? fav.favorites[i] : fav.cameras[i - 5];
		assert.ok(Math.abs(got.x - pts[i].x) < 0.01 && Math.abs(got.y - pts[i].y) < 0.01, `point ${i + 1} lands where it left`);
	}
	assert.deepEqual(fav.cameras.map(c => c.index), [0, 1, 2]);
	const loop = readGameXML(bookmarkXML(pts, { loop: 2, bookmarks: false, cameras: false }).xml);
	assert.equal(loop.favorites.length, 0);
	assert.equal(loop.loops.length, 1);
	assert.equal(loop.loops[0].slot, 2);
	assert.equal(loop.loops[0].points.length, 8);
	// A loop is written at six significant digits of a number in the
	// billions: back on the chart that is within a pixel.
	for (let i = 0; i < 8; i++) {
		assert.ok(Math.abs(loop.loops[0].points[i].x - pts[i].x) < 1, `loop point ${i + 1} x`);
		assert.ok(Math.abs(loop.loops[0].points[i].y - pts[i].y) < 1, `loop point ${i + 1} y`);
	}
});

test('a few lines copied out of the file are enough, in any attribute order, with the game\'s own float form', () => {
	const text = `・Bookmark
<BookMark BookMarkName="Crocs01" PosX="-963714" PosY="-8208" PosZ="1.40533e+06"/>
<BookMark PosZ="1.45382e+06" PosY="-8208" PosX="-982551" BookMarkName="Crocs &amp; co"/>
・WMQSP
<WorldMapQuickScreenPosition index="2" positionX="-982551" positionY="-8208" positionZ="1.45382e+06" cameraDistance="40000"/>
<WorldMapQuickScreenPosition index="1" positionX="-963714" positionY="-8208" positionZ="1.40533e+06" cameraDistance="40000"/>
`;
	assert.ok(looksLikeGameXML(text));
	assert.ok(!looksLikeGameXML('{"kind":"barter-route"}'));
	const r = readGameXML(text);
	assert.deepEqual(r.favorites.map(p => p.name), ['Crocs01', 'Crocs & co']);
	const g = fromGame(-963714, 1.40533e+06);
	assert.ok(Math.abs(r.favorites[0].x - g.x) < 0.01 && Math.abs(r.favorites[0].y - g.y) < 0.01);
	// Camera slots come back in slot order whatever order they were in.
	assert.deepEqual(r.cameras.map(c => c.index), [1, 2]);
	assert.equal(r.cameras[0].x, r.favorites[0].x);
	assert.equal(r.loops.length, 0);
	assert.equal(r.dropped, 0);
});

test('the whole file reads the same as the block, and a point off the chart is counted, not kept', () => {
	const block = bookmarkXML([{ name: 'A', x: 61554, y: 60679 }]).xml;
	const file = '<?xml version="1.0"?>\r\n<Root>\r\n<Setting a="1"/>\r\n' + block + '</Root>\r\n';
	assert.deepEqual(readGameXML(file), readGameXML(block));
	const off = readGameXML('<BookMark BookMarkName="Nowhere" PosX="9e9" PosY="0" PosZ="0"/><BookMark BookMarkName="x" PosX="nope" PosY="0" PosZ="0"/>');
	assert.equal(off.favorites.length, 0);
	assert.equal(off.dropped, 2);
});

import { putBlock } from '../js/worldmap.js';

test('a block of any Version is found and written back with its own number', () => {
	const v5 = '<A/>\r\n<WorldMapQuickScreenPosition Version="5">\r\n\t<WorldmapBookMark/>\r\n</WorldMapQuickScreenPosition>\r\n';
	const r = spliceBlock(v5, bookmarkXML([{ name: '1: x', x: 60000, y: 60000 }]).xml);
	assert.ok(r, 'a Version="5" block was not found');
	assert.ok(r.text.includes('<WorldMapQuickScreenPosition Version="5">'));
	assert.ok(!r.text.includes('Version="4"'));
	assert.ok(spliceBlock('<WorldMapQuickScreenPosition Version="12"/>\n', bookmarkXML([]).xml).text.startsWith('<WorldMapQuickScreenPosition Version="12">'));
});

test('putBlock swaps the block verbatim, merging nothing', () => {
	const old = '<WorldMapQuickScreenPosition Version="4">\r\n\t<WorldmapBookMark/>\r\n</WorldMapQuickScreenPosition>';
	const now = '<X/>\r\n<WorldMapQuickScreenPosition Version="4">\r\n\t<WorldMapQuickScreenPosition index="0" x="1" y="2" z="3"/>\r\n\t<WorldmapBookMark>\r\n\t\t<BookMark BookMarkName="a" x="1" z="2"/>\r\n\t</WorldmapBookMark>\r\n</WorldMapQuickScreenPosition>\r\n<Y/>\r\n';
	const r = putBlock(now, old);
	assert.equal(r.text, `<X/>\r\n${old}\r\n<Y/>\r\n`);
	// Whereas the merge would have kept the camera slot.
	assert.ok(spliceBlock(now, old).text.includes('index="0"'));
	assert.equal(putBlock('<X/>\n', old), null);
	assert.equal(putBlock(now, '<nonsense/>'), null);
});
