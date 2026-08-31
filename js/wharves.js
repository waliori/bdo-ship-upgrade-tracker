// Where a ship is mended, fed and crewed: every wharf manager on the
// chart, and the guild wharves beside them.
//
// The full roll comes from BDOCodex's NPC pages (read 2026-08-31):
// every NPC whose function is a wharf, with the page's own map
// coordinates -- already in the chart's pixel space. Most harbours
// keep a pair, one manager for everyone and one for a guild's ship;
// the guild kind is read off the codex description. A wharf manager
// repairs, sells rations and contracts sailors. The four wharves a
// route can start from are in barter_npcs.js -- this is the full set,
// for finding the nearest one.

export const wharves = [
	{ name: "Anthony", kind: "guild", at: "Altinova", x: 83528, y: 73274 },
	{ name: "Cedrio", kind: "guild", at: "Olvia Coast", x: 65689, y: 66875 },
	{ name: "Chadwick", kind: "guild", at: "Olvia", x: 65697, y: 66879 },
	{ name: "Chikuro", kind: "guild", at: "Starry Midnight Port", x: 55728, y: 96620 },
	{ name: "Delura", kind: "guild", at: "O'dyllita", x: 55984, y: 99113 },
	{ name: "Dumba", kind: "guild", at: "Grándiha", x: 46027, y: 92008 },
	{ name: "Hemsworth", kind: "guild", at: "Lema Island", x: 64158, y: 56168 },
	{ name: "Jeremy", kind: "guild", at: "Ancado Inner Harbor", x: 107699, y: 58255 },
	{ name: "Kova", kind: "guild", at: "Angavu", x: 116617, y: 45827 },
	{ name: "Leslie", kind: "guild", at: "Arehaza", x: 119879, y: 64756 },
	{ name: "Richard", kind: "guild", at: "Olvia Academy", x: 62999, y: 64980 },
	{ name: "Robert", kind: "guild", at: "Velia", x: 68833, y: 68490 },
	{ name: "Sebastian", kind: "guild", at: "Port Epheria", x: 54008, y: 70551 },
	{ name: "Syluna", kind: "guild", at: "Kamasylvia Castle", x: 47431, y: 96108 },
	{ name: "Vedat", kind: "guild", at: "Duvencrune Riverside", x: 88205, y: 54199 },
	{ name: "Zefir", kind: "guild", at: "Asparkan Fort", x: 79719, y: 79438 },
	{ name: "Akin", kind: "wharf", at: "Duvencrune Riverside", x: 88193, y: 54201 },
	{ name: "Anax", kind: "wharf", at: "Crow's Nest", x: 78034, y: 44377 },
	{ name: "Barossa", kind: "wharf", at: "Western Guard Camp", x: 65651, y: 70649 },
	{ name: "Bartholomeo", kind: "wharf", at: "Calpheon City", x: 58822, y: 74158 },
	{ name: "Bolhi", kind: "wharf", at: "Lema Island", x: 66426, y: 56584 },
	{ name: "Croix", kind: "wharf", at: "Velia", x: 68885, y: 68455 },
	{ name: "Daehyun", kind: "wharf", at: "Dami Pier", x: 16892, y: 27115 },
	{ name: "Dario", kind: "wharf", at: "Iliya Island", x: 74706, y: 60556 },
	{ name: "Darirong", kind: "wharf", at: "Byukgye Island", x: 20048, y: 30085 },
	{ name: "Delana", kind: "wharf", at: "O'dyllita", x: 57897, y: 98025 },
	{ name: "Delane", kind: "wharf", at: "O'dyllita", x: 56057, y: 99157 },
	{ name: "Derensha", kind: "wharf", at: "Grándiha", x: 46017, y: 91994 },
	{ name: "Elro", kind: "wharf", at: "Oquilla's Eye", x: 64513, y: 46808 },
	{ name: "Flanche", kind: "wharf", at: "Epheria Valley", x: 50469, y: 70832 },
	{ name: "Gafur", kind: "wharf", at: "Pirate Island", x: 54680, y: 57231 },
	{ name: "Gangman", kind: "wharf", at: "Cheongsa Island", x: 33534, y: 18905 },
	{ name: "Gurong", kind: "wharf", at: "Haemo Island", x: 15718, y: 30540 },
	{ name: "Jaeho", kind: "wharf", at: "Dalbeol Village", x: 28993, y: 18330 },
	{ name: "Karanza", kind: "wharf", at: "Angavu", x: 116617, y: 45815 },
	{ name: "Konyon", kind: "wharf", at: "Asparkan Fort", x: 79738, y: 79439 },
	{ name: "Kyumuk", kind: "wharf", at: "Bukpo", x: 15394, y: 11694 },
	{ name: "Lodovica", kind: "wharf", at: "Olvia Academy", x: 63063, y: 64963 },
	{ name: "Luicy", kind: "wharf", at: "Arehaza", x: 119970, y: 64987 },
	{ name: "Monmunia", kind: "wharf", at: "Papuraora Island", x: 42604, y: 78163 },
	{ name: "Neltia", kind: "wharf", at: "Starry Midnight Port", x: 55739, y: 96546 },
	{ name: "Purio", kind: "wharf", at: "Abandoned Pier", x: 88798, y: 61552 },
	{ name: "Ravikel", kind: "wharf", at: "Oquilla's Eye", x: 64378, y: 47067 },
	{ name: "Samia", kind: "wharf", at: "Ancado Inner Harbor", x: 107724, y: 58463 },
	{ name: "Serdo", kind: "wharf", at: "Iliya Island", x: 74704, y: 60585 },
	{ name: "Shalio", kind: "wharf", at: "Crioniak Island", x: 42548, y: 80540 },
	{ name: "Silen", kind: "wharf", at: "", x: 70090, y: 74229 },
	{ name: "Srulk", kind: "wharf", at: "Port Epheria", x: 54051, y: 70563 },
	{ name: "Sugarsh", kind: "wharf", at: "Tarif", x: 77535, y: 75594 },
	{ name: "Sungoo", kind: "wharf", at: "Dallae Pier", x: 28818, y: 18250 },
	{ name: "Sylana", kind: "wharf", at: "Kamasylvia Castle", x: 45534, y: 95100 },
	{ name: "Sylane", kind: "wharf", at: "Kamasylvia Castle", x: 47389, y: 96142 },
	{ name: "Taegu", kind: "wharf", at: "Bukpo", x: 15366, y: 11680 },
	{ name: "Torio", kind: "wharf", at: "Abandoned Pier", x: 85696, y: 65061 },
	{ name: "Torphin", kind: "wharf", at: "Neutral Zone", x: 65396, y: 74936 },
	{ name: "Tunger", kind: "wharf", at: "Altinova", x: 83503, y: 73283 },
	{ name: "Waruo", kind: "wharf", at: "Margoria", x: 69324, y: 48420 },
	{ name: "Yooan", kind: "wharf", at: "Dami Pier", x: 16706, y: 27121 }
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
