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
export function bookmarkXML(points, { cameras = true } = {}) {
	const marks = points.slice(0, BOOKMARK_SLOTS);
	const cams = cameras ? points.slice(BOOKMARK_SLOTS, BOOKMARK_SLOTS + CAMERA_SLOTS) : [];
	const dropped = points.length - marks.length - cams.length;
	const lines = ['<WorldMapQuickScreenPosition Version="4">'];
	cams.forEach((p, i) => {
		const g = toGame(p.x, p.y);
		lines.push(`\t<WorldMapQuickScreenPosition index="${i}" positionX="${num(g.x)}" positionY="${SEA_LEVEL}" positionZ="${num(g.z)}" cameraDistance="40000"/>`);
	});
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
	return { xml: lines.join('\r\n') + '\r\n', bookmarks: marks.length, cameras: cams.length, dropped };
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
