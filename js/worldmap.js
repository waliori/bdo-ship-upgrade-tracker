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

/**
 * What a control's value means: the favourites, or one of the loops.
 *
 * The empty string is the favourites, and it has to be checked before
 * the number is taken -- Number('') is 0, which is a perfectly good
 * loop slot, so coercing first makes "favourites" mean "loop 1" and
 * leaves no way back to the favourites at all.
 */
export function writeMode(value) {
	if (value === null || value === undefined || value === '') return 'favorites';
	const n = Number(value);
	return Number.isInteger(n) && n >= 0 && n < LOOP_SLOTS ? n : 'favorites';
}

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
export function bookmarkXML(points, { cameras = true, loop = null, bookmarks = true, loopPoints = null } = {}) {
	const marks = bookmarks ? points.slice(0, BOOKMARK_SLOTS) : [];
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
	// The loop may be sailed round headlands the stops themselves do not
	// bend for; the bookmarks stay the stops.
	const path = loopPoints && loopPoints.length ? loopPoints : points;
	if (slot !== null && points.length) lines.push(naviPathXML(path, slot));
	// Leaving the bookmarks out is not leaving them empty: a block with
	// no <WorldmapBookMark> keeps whatever the file already had, so
	// writing a loop does not cost someone their five favourites.
	if (bookmarks) {
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
	}
	lines.push('</WorldMapQuickScreenPosition>');
	return {
		xml: lines.join('\r\n') + '\r\n',
		bookmarks: marks.length,
		cameras: cams.length,
		dropped,
		loop: slot !== null && points.length
			? { slot, points: path.length, bends: Math.max(0, path.length - points.length) }
			: null
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

// The block's Version has been 4 for years; the file's own number is
// matched whatever it is and written back as found, so a client that
// bumps it is still read and not handed a downgraded block.
const BLOCK = /<WorldMapQuickScreenPosition Version="(\d+)">[\s\S]*?<\/WorldMapQuickScreenPosition>|<WorldMapQuickScreenPosition Version="(\d+)"\/>/;

/**
 * gameVariable.xml with its favourites block swapped for `xml`. The
 * rest of the file -- a few thousand lines of settings -- is left
 * byte for byte, and the block takes the file's own line ends. Returns
 * null when the file has no such block, which means it is not the file
 * the map reads (the lobby's copy beside it, say) and must not be
 * written to.
 */
const LOOP = /[ \t]*<WorldmapNaviPath Index="(\d+)">[\s\S]*?<\/WorldmapNaviPath>/g;
const CAMERA = /[ \t]*<WorldMapQuickScreenPosition index="(\d+)"[^>]*\/>/g;
const MARKS = /[ \t]*<WorldmapBookMark(?:\s*\/>|>[\s\S]*?<\/WorldmapBookMark>)/;

/** A favourites block taken apart: the camera slots and loops by their
 *  index, and the bookmarks whole. */
function parseBlock(block) {
	const cameras = new Map();
	for (const m of block.matchAll(CAMERA)) cameras.set(Number(m[1]), m[0].trim());
	const loops = new Map();
	for (const m of block.matchAll(LOOP)) loops.set(Number(m[1]), m[0].trim());
	const marks = MARKS.exec(block);
	return { cameras, loops, marks: marks ? marks[0].trim() : null };
}

/** And put back together, in the order the client writes: the camera
 *  slots, then the loops, then the bookmarks. */
function emitBlock({ cameras, loops, marks }, nl, version = '4') {
	// An element's own tags sit one tab in, its children two -- however
	// the piece was indented in the file it came from.
	const indent = t => {
		const body = t.split(/\r?\n/).map(l => l.trim());
		if (body.length === 1) return '\t' + body[0];
		return ['\t' + body[0], ...body.slice(1, -1).map(l => '\t\t' + l), '\t' + body[body.length - 1]].join(nl);
	};
	const rows = [`<WorldMapQuickScreenPosition Version="${version}">`];
	for (const i of [...cameras.keys()].sort((a, b) => a - b)) rows.push('\t' + cameras.get(i));
	for (const i of [...loops.keys()].sort((a, b) => a - b)) rows.push(indent(loops.get(i)));
	rows.push(marks ? indent(marks) : '\t<WorldmapBookMark/>');
	rows.push('</WorldMapQuickScreenPosition>');
	return rows.join(nl) + nl;
}

export function spliceBlock(text, xml) {
	const m = BLOCK.exec(text);
	if (!m) return null;
	const crlf = /\r\n/.test(text);
	const nl = crlf ? '\r\n' : '\n';
	// Whatever the new block does not speak for is carried over from the
	// old one -- the loops in the other slots, the camera slots and the
	// favourites when only a loop is being written. Taking one thing
	// over is no reason to lose the rest.
	const was = parseBlock(m[0]);
	const now = parseBlock(xml);
	const merged = {
		cameras: now.cameras.size ? now.cameras : was.cameras,
		loops: new Map([...was.loops, ...now.loops]),
		marks: now.marks || was.marks
	};
	const block = emitBlock(merged, nl, m[1] || m[2] || '4').replace(/\r?\n$/, '');
	return {
		text: text.slice(0, m.index) + block + text.slice(m.index + m[0].length),
		previous: m[0]
	};
}

/**
 * gameVariable.xml with its favourites block put back exactly as
 * `block` has it -- no merging, no re-indenting: what Restore needs,
 * since a restore that keeps today's camera slots is not a restore.
 * Null when the file has no block to replace, as spliceBlock is.
 */
export function putBlock(text, block) {
	const m = BLOCK.exec(text);
	if (!m || !BLOCK.test(block)) return null;
	return {
		text: text.slice(0, m.index) + block + text.slice(m.index + m[0].length),
		previous: m[0]
	};
}

/* ------------------------------------------------------------------ *
 * the file read back
 * ------------------------------------------------------------------ */

function unattr(s) {
	return String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/** A tag's attributes, whatever order the file has them in. */
function attrs(s) {
	const out = {};
	for (const m of s.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
	return out;
}

/** A world position on the chart, or null when the numbers are not
 *  numbers or the point is nowhere the chart goes. */
function chartPoint(gx, gz, scale = 1) {
	const x = Number(gx), z = Number(gz);
	if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
	const p = fromGame(x / scale, z / scale);
	if (p.x < 0 || p.y < 0 || p.x > 200000 || p.y > 200000) return null;
	return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}

/**
 * What the game's favourites block holds, back in chart space:
 * `favorites` are the named bookmarks in the order the file has them,
 * `cameras` the numbered camera slots in slot order, `loops` the
 * navigation paths by slot. The text may be the whole gameVariable.xml,
 * the block alone, or a few lines copied out of it -- each tag is read
 * on its own, so nothing has to be well-formed around it. The count of
 * points that were not on the chart comes back as `dropped`.
 */
export function readGameXML(text) {
	const s = String(text || '');
	let dropped = 0;
	const favorites = [];
	for (const m of s.matchAll(/<BookMark\b([^>]*?)\/?>/g)) {
		const a = attrs(m[1]);
		const p = chartPoint(a.PosX, a.PosZ);
		if (!p) { dropped++; continue; }
		favorites.push({ name: unattr(a.BookMarkName || '').slice(0, 40), ...p });
	}
	const cameras = [];
	for (const m of s.matchAll(/<WorldMapQuickScreenPosition\b([^>]*?)\/>/g)) {
		const a = attrs(m[1]);
		if (a.index === undefined) continue;
		const p = chartPoint(a.positionX, a.positionZ);
		if (!p) { dropped++; continue; }
		cameras.push({ index: Number(a.index), ...p });
	}
	cameras.sort((a, b) => a.index - b.index);
	const loops = [];
	for (const m of s.matchAll(/<WorldmapNaviPath\b([^>]*)>([\s\S]*?)<\/WorldmapNaviPath>/g)) {
		const slot = Number(attrs(m[1]).Index);
		const points = [];
		for (const r of m[2].matchAll(/<Path\b([^>]*?)\/?>/g)) {
			const a = attrs(r[1]);
			const p = chartPoint(a.PosX, a.PosZ, PATH_SCALE);
			if (!p) { dropped++; continue; }
			points.push(p);
		}
		if (points.length) loops.push({ slot: Number.isInteger(slot) ? slot : loops.length, points });
	}
	loops.sort((a, b) => a.slot - b.slot);
	return { favorites, cameras, loops, dropped };
}

/** Whether a text is the game's file, or a piece of it, at all. */
export function looksLikeGameXML(text) {
	return /<(?:BookMark|WorldMapQuickScreenPosition|WorldmapNaviPath|WorldmapBookMark)\b/.test(String(text || ''));
}
