// Where the barter NPCs actually are.
//
// Scraped once from BDOCodex, which carries each NPC's world position,
// and frozen here so the map never needs the network. Coordinates are
// the game's own, which the tiles under map/ are cut from: a position
// divided by 2^(9 - zoom) is its pixel on that zoom's grid, and that
// pixel divided by 256 is the tile it lands in.
//
// 81 barterers. Which goods each one trades is not repeated here --
// all_barter.js already says, keyed by the same npc_id.

export const MAX_ZOOM = 9;
export const TILE = 256;

/** The tile ranges actually downloaded, per zoom. Nothing outside is
 *  fetched, so a pan past the edge draws sea rather than a 404. */
export const TILES = { 3: { x0: 0, x1: 8, y0: 0, y1: 5 }, 4: { x0: 2, x1: 15, y0: 1, y1: 9 }, 5: { x0: 6, x1: 29, y0: 4, y1: 17 } };

export const npcs = [
	{ id: 58922, name: "Akenisi", x: 61554, y: 60679 },
	{ id: 58916, name: "Arutiha", x: 52644, y: 59076 },
	{ id: 50825, name: "Atinia", x: 42171, y: 40202 },
	{ id: 58935, name: "Belgio", x: 74431, y: 63509 },
	{ id: 58958, name: "Biapin", x: 85412, y: 62855 },
	{ id: 58901, name: "Cazio", x: 50797, y: 68766 },
	{ id: 58954, name: "Chikao", x: 66695, y: 55615 },
	{ id: 50827, name: "Cholace Chico", x: 34570, y: 36579 },
	{ id: 58950, name: "Curahi", x: 72332, y: 63349 },
	{ id: 58941, name: "Decario", x: 70112, y: 62116 },
	{ id: 58906, name: "Denio", x: 50350, y: 66370 },
	{ id: 50823, name: "Donalia", x: 30938, y: 49984 },
	{ id: 58933, name: "Gerio", x: 71968, y: 65377 },
	{ id: 50814, name: "Haran", x: 40076, y: 34043 },
	{ id: 50826, name: "Harus", x: 46874, y: 30982 },
	{ id: 58934, name: "Hashin", x: 74216, y: 64616 },
	{ id: 58927, name: "Havio", x: 65426, y: 63076 },
	{ id: 50815, name: "Heracio", x: 40189, y: 22992 },
	{ id: 58937, name: "Hika", x: 78541, y: 64251 },
	{ id: 58963, name: "Hiriva", x: 52994, y: 67546 },
	{ id: 58966, name: "Jeraki", x: 71900, y: 58940 },
	{ id: 58961, name: "Juki", x: 101829, y: 54946 },
	{ id: 58920, name: "Julio", x: 59690, y: 62810 },
	{ id: 58926, name: "Juvio", x: 64950, y: 64048 },
	{ id: 58915, name: "Keshao", x: 54637, y: 58309 },
	{ id: 58957, name: "Kiapura", x: 86584, y: 61709 },
	{ id: 50816, name: "Lantinia", x: 43212, y: 26893 },
	{ id: 58914, name: "Macio", x: 51528, y: 59392 },
	{ id: 58928, name: "Marcini", x: 65985, y: 61281 },
	{ id: 58911, name: "Merio", x: 53979, y: 64903 },
	{ id: 58939, name: "Metakio", x: 64973, y: 59131 },
	{ id: 58945, name: "Mulicia", x: 77864, y: 51088 },
	{ id: 58924, name: "Neruo", x: 63237, y: 62978 },
	{ id: 50818, name: "Olcia Viano", x: 47925, y: 37728 },
	{ id: 58908, name: "Padio", x: 51887, y: 64171 },
	{ id: 50817, name: "Pakio", x: 55120, y: 25866 },
	{ id: 58923, name: "Pakuo", x: 64159, y: 60542 },
	{ id: 58968, name: "Palasio", x: 78785, y: 56451 },
	{ id: 58942, name: "Panishu", x: 71786, y: 62402 },
	{ id: 58960, name: "Parian", x: 91531, y: 58059 },
	{ id: 58970, name: "Perugia", x: 85074, y: 62006 },
	{ id: 50822, name: "Picira Baho", x: 38705, y: 52033 },
	{ id: 58938, name: "Pokio", x: 66150, y: 59292 },
	{ id: 50824, name: "Popo", x: 33948, y: 28948 },
	{ id: 58903, name: "Prao", x: 48977, y: 68268 },
	{ id: 58907, name: "Priha", x: 51407, y: 63741 },
	{ id: 58948, name: "Priko", x: 74687, y: 60578 },
	{ id: 58912, name: "Pukira", x: 55107, y: 65573 },
	{ id: 58904, name: "Purani", x: 47511, y: 69086 },
	{ id: 58918, name: "Rakio", x: 58602, y: 64306 },
	{ id: 58946, name: "Ravio", x: 79567, y: 50467 },
	{ id: 58929, name: "Renilu", x: 67465, y: 62968 },
	{ id: 58919, name: "Retao", x: 59707, y: 61241 },
	{ id: 58949, name: "Riamishu", x: 78770, y: 60558 },
	{ id: 58952, name: "Rian", x: 83940, y: 64972 },
	{ id: 50819, name: "Rickun", x: 35959, y: 45421 },
	{ id: 58931, name: "Rishao", x: 68966, y: 65562 },
	{ id: 58971, name: "Roshina", x: 118139, y: 49450 },
	{ id: 58910, name: "Ruishi", x: 53393, y: 65173 },
	{ id: 58925, name: "Rukio", x: 64614, y: 61439 },
	{ id: 58967, name: "Ryubio", x: 54673, y: 57268 },
	{ id: 58940, name: "Serapu", x: 69343, y: 60614 },
	{ id: 58936, name: "Serrio", x: 77085, y: 64171 },
	{ id: 58962, name: "Shamihi", x: 85236, y: 57464 },
	{ id: 58909, name: "Shapio", x: 52327, y: 63680 },
	{ id: 58951, name: "Sherahi", x: 82065, y: 66316 },
	{ id: 58953, name: "Sherana", x: 70316, y: 57602 },
	{ id: 58943, name: "Shuka", x: 71555, y: 55542 },
	{ id: 58964, name: "Shura", x: 53346, y: 68530 },
	{ id: 58921, name: "Siani", x: 61225, y: 62559 },
	{ id: 58969, name: "Sikario", x: 80597, y: 55834 },
	{ id: 58955, name: "Solavio", x: 63654, y: 54578 },
	{ id: 58947, name: "Supio", x: 80097, y: 54005 },
	{ id: 58905, name: "Tarin", x: 48372, y: 66030 },
	{ id: 58932, name: "Tepuo", x: 70115, y: 64263 },
	{ id: 58917, name: "Terseo", x: 59606, y: 59429 },
	{ id: 58956, name: "Tesivin", x: 85800, y: 58576 },
	{ id: 58913, name: "Tidio", x: 55492, y: 66465 },
	{ id: 58959, name: "Tixia", x: 90722, y: 58701 },
	{ id: 58902, name: "Trisha", x: 50114, y: 68258 },
	{ id: 58930, name: "Vedio", x: 66541, y: 64615 }
];

/** Every barterer, by the id all_barter.js uses. */
export const npcById = new Map(npcs.map(n => [n.id, n]));
