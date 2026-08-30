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
import { toGame, fromGame, bookmarkXML, BOOKMARK_SLOTS, CAMERA_SLOTS } from '../js/worldmap.js';

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
