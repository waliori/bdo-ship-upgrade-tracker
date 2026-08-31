// Where a ship is mended, fed and crewed: every wharf manager on the
// chart, and the Old Moon Guild's guild wharves.
//
// Positions are the client's own, from Flockenberger's bdo-knowledge-
// waypoints (Calpheon, Valencia and Morning Light wharf managers, and
// the guild wharves), read 2026-08-30 and put through the same
// transform as the barterers. A wharf manager repairs, sells rations
// and contracts sailors; a guild wharf does the same for a guild's
// ship. The four wharves a route can start from are in barter_npcs.js
// -- this is the full set, for finding the nearest one.

export const wharves = [
	{ name: "Anthony", kind: "guild", x: 83528, y: 73274 },
	{ name: "Chadwick", kind: "guild", x: 65697, y: 66879 },
	{ name: "Daehyun", kind: "guild", x: 16892, y: 27115 },
	{ name: "Delura", kind: "guild", x: 55984, y: 99113 },
	{ name: "Hemsworth", kind: "guild", x: 64158, y: 56168 },
	{ name: "Jaeho", kind: "guild", x: 28993, y: 18330 },
	{ name: "Jeremy", kind: "guild", x: 107699, y: 58255 },
	{ name: "Leslie", kind: "guild", x: 119879, y: 64756 },
	{ name: "Robert", kind: "guild", x: 68833, y: 68490 },
	{ name: "Sebastian", kind: "guild", x: 54008, y: 70551 },
	{ name: "Syluna", kind: "guild", x: 47431, y: 96108 },
	{ name: "Barossa", kind: "wharf", x: 65651, y: 70649 },
	{ name: "Bartholomeo", kind: "wharf", x: 58822, y: 74158 },
	{ name: "Croix", kind: "wharf", x: 68885, y: 68455 },
	{ name: "Darirong", kind: "wharf", x: 20048, y: 30085 },
	{ name: "Gurong", kind: "wharf", x: 15718, y: 30540 },
	{ name: "Purio", kind: "wharf", x: 88798, y: 61552 },
	{ name: "Samia", kind: "wharf", x: 107724, y: 58463 },
	{ name: "Silen", kind: "wharf", x: 70090, y: 74229 },
	{ name: "Sungoo", kind: "wharf", x: 28818, y: 18250 },
	{ name: "Torio", kind: "wharf", x: 85696, y: 65061 },
	{ name: "Torphin", kind: "wharf", x: 65396, y: 74936 },
	{ name: "Yooan", kind: "wharf", x: 16706, y: 27121 }
];

/** The wharf nearest a chart point, and how far in chart pixels. */
export function nearestWharf(x, y, kind = null) {
	let best = null;
	for (const w of wharves) {
		if (kind && w.kind !== kind) continue;
		const d = Math.hypot(w.x - x, w.y - y);
		if (!best || d < best.d) best = { ...w, d };
	}
	return best;
}
