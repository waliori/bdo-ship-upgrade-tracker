// The game's own world map, and how to put a route on it.
//
// Black Desert keeps the world map's favourites in a plain XML file
// under Documents -- gameVariable.xml, in the account folder of
// UserCache -- and reads it when a character loads. Write a
// <WorldmapBookMark> block into it and the game shows those points in
// the map's Favorites list, named, with a "locate" button each. The
// fishing community found this (Flockenberger's bdo-fish-waypoints);
// it works just as well for a barter loop.
//
// The chart here draws BDOCodex's tiles, whose pixel space is the
// game's world position divided by 25 and shifted: x = X/25 + 68600,
// y = 72200 - Z/25. Fitted 2026-08-30 on 69 barterers whose world
// positions the client's knowledge data gives (bdo-knowledge-waypoints,
// Barterers.xml) against the codex positions in barter_npcs.js: 67 of
// them land within a pixel, the scale comes out 25.000 on both axes
// and the rotation 0.000 degrees, so the round numbers are the truth
// rather than a fit. The two that miss (Perugia, Priko) stand at a
// different spawn on the codex than in the knowledge data.
//
// Heights (PosY / positionY) are the sea's -- the map does not care.

const SCALE = 25;
const OFF_X = 68600;
const OFF_Y = 72200;
const SEA_LEVEL = -8175;

/** The navigation paths -- the map's saved loops -- keep the same world
 *  space multiplied by a million, and hold as many points as you like
 *  rather than the bookmarks' five. Read off a loop saved in game on
 *  2026-08-30: its first point decoded to within 0.1 m of Perugia. */
const PATH_SCALE = 1e6;

/** The game keeps three saved loops, on Index 0, 1 and 2. */
export const LOOP_SLOTS = 3;

/** The map's Favorites list holds five named bookmarks. */
export const BOOKMARK_SLOTS = 5;
/** The map also keeps ten camera positions, on the number keys. */
export const CAMERA_SLOTS = 10;

/** A chart position (BDOCodex pixel space) to the game's world position. */
export function toGame(x, y) {
	return { x: (x - OFF_X) * SCALE, z: (OFF_Y - y) * SCALE };
}

/** A world position back to the chart. */
export function fromGame(x, z) {
	return { x: x / SCALE + OFF_X, y: OFF_Y - z / SCALE };
}

function attr(s) {
	// The apostrophe stays: the community files the game is known to
	// load leave "O'draxxia" raw, and a parser that chokes on &apos;
	// is a worse bet than one that chokes on a quote it never sees
	// unescaped.
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function num(v) {
	return String(Math.round(v * 100) / 100);
}

/**
 * A float the way the client writes one: C's %g at six significant
 * digits, with a two-digit exponent. Matching its own formatting keeps
 * a hand-written block indistinguishable from a saved one -- and keeps
 * the diff after the game rewrites the file down to nothing.
 */
function g6(v) {
	if (!Number.isFinite(v) || v === 0) return '0';
	const exp = Math.floor(Math.log10(Math.abs(v)));
	const trim = t => (t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t);
	if (exp < -4 || exp >= 6) {
		const [m, e] = v.toExponential(5).split('e');
		return `${trim(m)}e${e[0]}${e.slice(1).padStart(2, '0')}`;
	}
	return trim(v.toPrecision(6));
}

/**
 * One saved loop: the whole run of stops in order, as the map's
 * navigation path. `slot` is which of the three the game keeps.
 */
export function naviPathXML(points, slot = 0) {
	const rows = points.map(p => {
		const g = toGame(p.x, p.y);
		return `\t\t<Path PosX="${g6(g.x * PATH_SCALE)}" PosY="${g6(SEA_LEVEL * PATH_SCALE)}" PosZ="${g6(g.z * PATH_SCALE)}"/>`;
	});
	return `\t<WorldmapNaviPath Index="${slot}">\r\n${rows.join('\r\n')}\r\n\t</WorldmapNaviPath>`;
}

/**
 * The XML the game reads, for a list of chart points in order:
 * `{ name, x, y }` each, in codex pixel space.
 *
 * The first five become named bookmarks -- the map's Favorites list.
 * With `cameras` on, the next ten fill the camera slots on the number
 * keys, unnamed but in order. Anything past that is left out and
 * counted, since a route the map cannot hold is still a route.
 *
 * Returns the whole <WorldMapQuickScreenPosition> block, which is what
 * gameVariable.xml holds and what a person replaces; line ends are
 * the file's own (CRLF), indentation its tabs.
 */
export function bookmarkXML(points, { cameras = true, loop = null } = {}) {
	const marks = points.slice(0, BOOKMARK_SLOTS);
	const cams = cameras ? points.slice(BOOKMARK_SLOTS, BOOKMARK_SLOTS + CAMERA_SLOTS) : [];
	const dropped = points.length - marks.length - cams.length;
	const lines = ['<WorldMapQuickScreenPosition Version="4">'];
	cams.forEach((p, i) => {
		const g = toGame(p.x, p.y);
		lines.push(`\t<WorldMapQuickScreenPosition index="${i}" positionX="${num(g.x)}" positionY="${SEA_LEVEL}" positionZ="${num(g.z)}" cameraDistance="40000"/>`);
	});
	// The loop, when one is asked for, carries the whole route -- every
	// stop, in order, past the fifteen the slots above can hold.
	const slot = Number.isInteger(loop) && loop >= 0 && loop < LOOP_SLOTS ? loop : null;
	if (slot !== null && points.length) lines.push(naviPathXML(points, slot));
	if (!marks.length) {
		lines.push('\t<WorldmapBookMark/>');
	} else {
		lines.push('\t<WorldmapBookMark>');
		for (const p of marks) {
			const g = toGame(p.x, p.y);
			lines.push(`\t\t<BookMark BookMarkName="${attr(p.name)}" PosX="${num(g.x)}" PosY="${SEA_LEVEL}" PosZ="${num(g.z)}"/>`);
		}
		lines.push('\t</WorldmapBookMark>');
	}
	lines.push('</WorldMapQuickScreenPosition>');
	return {
		xml: lines.join('\r\n') + '\r\n',
		bookmarks: marks.length,
		cameras: cams.length,
		dropped,
		loop: slot !== null && points.length ? { slot, points: points.length } : null
	};
}

/**
 * Where the file lives. The account folder is a number, one per
 * account, next to a gameVariable.xml that belongs to the lobby --
 * the one inside the folder is the one the map reads.
 */
export const FILE_HINT = {
	windows: 'Documents\\Black Desert\\UserCache\\<account number>\\gameVariable.xml',
	linux: '~/.local/share/Steam/steamapps/compatdata/582660/pfx/drive_c/users/steamuser/Documents/Black Desert/UserCache/<account number>/gameVariable.xml'
};

const BLOCK = /<WorldMapQuickScreenPosition Version="4">[\s\S]*?<\/WorldMapQuickScreenPosition>|<WorldMapQuickScreenPosition Version="4"\/>/;

/**
 * gameVariable.xml with its favourites block swapped for `xml`. The
 * rest of the file -- a few thousand lines of settings -- is left
 * byte for byte, and the block takes the file's own line ends. Returns
 * null when the file has no such block, which means it is not the file
 * the map reads (the lobby's copy beside it, say) and must not be
 * written to.
 */
const LOOP = /[ \t]*<WorldmapNaviPath Index="(\d+)">[\s\S]*?<\/WorldmapNaviPath>[ \t]*\r?\n?/g;

/** The loop slots a block already uses. */
function loopSlots(block) {
	const out = new Map();
	for (const m of block.matchAll(LOOP)) out.set(Number(m[1]), m[0]);
	return out;
}

/**
 * The block, with any loop the file already held in a slot we are not
 * writing put back. The game keeps three; taking over one of them is
 * no reason to lose the other two.
 */
function keepLoops(oldBlock, block, crlf) {
	const mine = new Set(loopSlots(block).keys());
	const keep = [...loopSlots(oldBlock)].filter(([slot]) => !mine.has(slot));
	if (!keep.length) return block;
	const nl = crlf ? '\r\n' : '\n';
	const text = keep.map(([, xml]) => xml.replace(/\r?\n$/, '')).join(nl) + nl;
	// Loops sit between the camera slots and the bookmarks, as the
	// client writes them.
	const at = block.search(/[ \t]*<WorldmapBookMark/);
	if (at < 0) return block;
	return block.slice(0, at) + text.replace(/\r?\n/g, nl) + block.slice(at);
}

export function spliceBlock(text, xml) {
	const m = BLOCK.exec(text);
	if (!m) return null;
	const crlf = /\r\n/.test(text);
	let block = xml.replace(/\r?\n$/, '').replace(/\r?\n/g, crlf ? '\r\n' : '\n');
	block = keepLoops(m[0], block, crlf);
	return {
		text: text.slice(0, m.index) + block + text.slice(m.index + m[0].length),
		previous: m[0]
	};
}
