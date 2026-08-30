// Where the barter NPCs actually are.
//
// Scraped once from BDOCodex, which carries each NPC's world position,
// and frozen here so the map never needs the network. Coordinates are
// the game's own, which the tiles under map/ are cut from: a position
// divided by 2^(9 - zoom) is its pixel on that zoom's grid, and that
// pixel divided by 256 is the tile it lands in.
//
// 91 barterers. Which goods each one trades is not repeated here --
// all_barter.json already says, keyed by the same npc_id.
//
// `at` is the place each one stands, matched 2026-08-29 against the
// BDOCodex node database by nearest node: everyone but the Margoria
// drifters lands within ~1,100 units of a named island (or, for the
// Chiro NPCs, their own workshop node -- closer than the island). The
// wrecks and rafts adrift in Margoria are not nodes in that database,
// so their `at` is the sea itself, which is also the truth of them.
// `region` is the codex's territory column, as it stands.
//
// The ten added 2026-08-29 are the shore -- the coastal barterers who
// deal the [Level 6] and [Level 7] goods, and Kami at Crow's Nest --
// read straight off their BDOCodex pages' location arrays, in the same
// coordinate space. They stretched the chart at the time -- Haemo
// Island west of where the tiles stopped, the O'dyllita ports south,
// Arehaza east -- before TILES grew to the whole world on 2026-08-30.

export const MAX_ZOOM = 9;
export const TILE = 256;

/** The tile ranges downloaded, per zoom: the whole world square now,
 *  8x8 at zoom 3 up to 32x32 at zoom 5 -- BDOCodex draws real ground
 *  out to exactly that edge and flat filler beyond it, so the chart
 *  pans to every coast rather than stopping at the sea's. Nothing
 *  outside is fetched, so a pan past the edge draws sea, not a 404. */
export const TILES = { 3: { x0: 0, x1: 7, y0: 0, y1: 7 }, 4: { x0: 0, x1: 15, y0: 0, y1: 15 }, 5: { x0: 0, x1: 31, y0: 0, y1: 31 } };

/** The wharves inside the charted sea, for anchoring a route to where
 *  a ship actually starts. Same BDOCodex map layer as the island match,
 *  read 2026-08-29; all four fall inside the shipped tiles. */
export const ports = [
	{ id: 1, name: "Velia", x: 69152, y: 69120 },
	{ id: 604, name: "Port Epheria", x: 54375, y: 70894 },
	{ id: 1002, name: "Iliya Island", x: 74893, y: 60562 },
	{ id: 1343, name: "Ancado Inner Harbor", x: 107685, y: 58759 }
];

export const npcs = [
	{ id: 58922, name: "Akenisi", x: 61554, y: 60679, at: "Narvo Island", region: "Balenos" },
	{ id: 58979, name: "Anvanio", x: 88186.68, y: 54211, at: "Sanctuary Coastal Outpost", region: "Valencia" },
	{ id: 58916, name: "Arutiha", x: 52644, y: 59076, at: "Almai Island", region: "Calpheon" },
	{ id: 50825, name: "Atinia", x: 42171, y: 40202, at: "Margoria", region: "The Great Ocean" },
	{ id: 58935, name: "Belgio", x: 74431, y: 63509, at: "Ostra Island", region: "Mediah" },
	{ id: 58958, name: "Biapin", x: 85412, y: 62855, at: "Esfah Island", region: "Valencia" },
	{ id: 58973, name: "Brio", x: 65397.868, y: 66856.64, at: "Olvia Coast", region: "Balenos" },
	{ id: 58901, name: "Cazio", x: 50797, y: 68766, at: "Baeza Island", region: "Calpheon" },
	{ id: 58954, name: "Chikao", x: 66695, y: 55615, at: "Lema Island", region: "Balenos" },
	{ id: 50827, name: "Cholace Chico", x: 34570, y: 36579, at: "Margoria", region: "The Great Ocean" },
	{ id: 58950, name: "Curahi", x: 72332, y: 63349, at: "Arakil Island", region: "Balenos" },
	{ id: 58941, name: "Decario", x: 70112, y: 62116, at: "Weita Island", region: "Balenos" },
	{ id: 58906, name: "Denio", x: 50350, y: 66370, at: "Ginburrey Island", region: "Calpheon" },
	{ id: 50823, name: "Donalia", x: 30938, y: 49984, at: "Margoria", region: "The Great Ocean" },
	{ id: 58981, name: "Gangdalpo", x: 28825.88, y: 18258.4, at: "Dallae Pier", region: "Land of Morning Light" },
	{ id: 58980, name: "Gangnampo", x: 15766.8, y: 30628.8, at: "Haemo Island", region: "Land of Morning Light" },
	{ id: 58933, name: "Gerio", x: 71968, y: 65377, at: "Beiruwa Island", region: "Mediah" },
	{ id: 58984, name: "Hanipu", x: 119951.2, y: 64964.44, at: "Arehaza", region: "Valencia" },
	{ id: 50814, name: "Haran", x: 40076, y: 34043, at: "Margoria", region: "The Great Ocean" },
	{ id: 50826, name: "Harus", x: 46874, y: 30982, at: "Margoria", region: "The Great Ocean" },
	{ id: 58934, name: "Hashin", x: 74216, y: 64616, at: "Taramura Island", region: "Mediah" },
	{ id: 58927, name: "Havio", x: 65426, y: 63076, at: "Eveto Island", region: "Balenos" },
	{ id: 50815, name: "Heracio", x: 40189, y: 22992, at: "Margoria", region: "The Great Ocean" },
	{ id: 58937, name: "Hika", x: 78541, y: 64251, at: "Pilava Island", region: "Mediah" },
	{ id: 58963, name: "Hiriva", x: 52994, y: 67546, at: "Randis Island", region: "Calpheon" },
	{ id: 58966, name: "Jeraki", x: 71900, y: 58940, at: "Ajir Island", region: "Balenos" },
	{ id: 58961, name: "Juki", x: 101829, y: 54946, at: "Derko Island", region: "Valencia" },
	{ id: 58920, name: "Julio", x: 59690, y: 62810, at: "Louruve Island", region: "Balenos" },
	{ id: 58926, name: "Juvio", x: 64950, y: 64048, at: "Duch Island", region: "Balenos" },
	{ id: 58983, name: "Kami", x: 78047.2, y: 44417.76, at: "Crow's Nest", region: "The Great Ocean" },
	{ id: 58974, name: "Karpu", x: 53477.96, y: 70747.348, at: "Epheria Sentry Post", region: "Calpheon" },
	{ id: 58915, name: "Keshao", x: 54637, y: 58309, at: "Kuit Islands", region: "Calpheon" },
	{ id: 58957, name: "Kiapura", x: 86584, y: 61709, at: "Shirna Island", region: "Valencia" },
	{ id: 50816, name: "Lantinia", x: 43212, y: 26893, at: "Margoria", region: "The Great Ocean" },
	{ id: 58914, name: "Macio", x: 51528, y: 59392, at: "Teste Island", region: "Calpheon" },
	{ id: 58928, name: "Marcini", x: 65985, y: 61281, at: "Marlene Island", region: "Balenos" },
	{ id: 58911, name: "Merio", x: 53979, y: 64903, at: "Eberdeen Island", region: "Calpheon" },
	{ id: 58939, name: "Metakio", x: 64973, y: 59131, at: "Tulu Island", region: "Balenos" },
	{ id: 58945, name: "Mulicia", x: 77864, y: 51088, at: "Chiro's Figurehead Workshop", region: "Balenos" },
	{ id: 58976, name: "Nedio", x: 78741.16, y: 66291.12, at: "Sausan Garrison Wharf", region: "Mediah" },
	{ id: 58924, name: "Neruo", x: 63237, y: 62978, at: "Fish Drying Yard 2", region: "Balenos" },
	{ id: 50818, name: "Olcia Viano", x: 47925, y: 37728, at: "Margoria", region: "The Great Ocean" },
	{ id: 58978, name: "Orchio", x: 55741, y: 96527.52, at: "Starry Midnight Port", region: "O'dyllita" },
	{ id: 58908, name: "Padio", x: 51887, y: 64171, at: "Netnume Island", region: "Calpheon" },
	{ id: 50817, name: "Pakio", x: 55120, y: 25866, at: "Margoria", region: "The Great Ocean" },
	{ id: 58923, name: "Pakuo", x: 64159, y: 60542, at: "Invernen Island", region: "Balenos" },
	{ id: 58968, name: "Palasio", x: 78785, y: 56451, at: "Shasha Island", region: "Balenos" },
	{ id: 58942, name: "Panishu", x: 71786, y: 62402, at: "Kanvera Island", region: "Balenos" },
	{ id: 58960, name: "Parian", x: 91531, y: 58059, at: "Halmad Island", region: "Valencia" },
	{ id: 58970, name: "Perugia", x: 85074, y: 62006, at: "Tigris Island", region: "Valencia" },
	{ id: 50822, name: "Picira Baho", x: 38705, y: 52033, at: "Margoria", region: "The Great Ocean" },
	{ id: 58938, name: "Pokio", x: 66150, y: 59292, at: "Orffs Island", region: "Balenos" },
	{ id: 50824, name: "Popo", x: 33948, y: 28948, at: "Margoria", region: "The Great Ocean" },
	{ id: 58903, name: "Prao", x: 48977, y: 68268, at: "Theonil Island", region: "Calpheon" },
	{ id: 58907, name: "Priha", x: 51407, y: 63741, at: "Daton Island", region: "Calpheon" },
	{ id: 58948, name: "Priko", x: 74687, y: 60578, at: "Iliya Island", region: "Balenos" },
	{ id: 58912, name: "Pukira", x: 55107, y: 65573, at: "Albresser Island", region: "Calpheon" },
	{ id: 58904, name: "Purani", x: 47511, y: 69086, at: "Teyamal Island", region: "Calpheon" },
	{ id: 58918, name: "Rakio", x: 58602, y: 64306, at: "Staren Island", region: "Balenos" },
	{ id: 58946, name: "Ravio", x: 79567, y: 50467, at: "Chiro's Black Plating Workshop", region: "Balenos" },
	{ id: 58929, name: "Renilu", x: 67465, y: 62968, at: "Mariveno Island", region: "Balenos" },
	{ id: 58919, name: "Retao", x: 59707, y: 61241, at: "Lisz Island", region: "Balenos" },
	{ id: 58949, name: "Riamishu", x: 78770, y: 60558, at: "Pujara Island", region: "Balenos" },
	{ id: 58952, name: "Rian", x: 83940, y: 64972, at: "Riyed Island", region: "Valencia" },
	{ id: 50819, name: "Rickun", x: 35959, y: 45421, at: "Margoria", region: "The Great Ocean" },
	{ id: 58931, name: "Rishao", x: 68966, y: 65562, at: "Ephde Rune Island", region: "Balenos" },
	{ id: 58971, name: "Roshina", x: 118139, y: 49450, at: "Hakoven Island", region: "Valencia" },
	{ id: 58910, name: "Ruishi", x: 53393, y: 65173, at: "Dunde Island", region: "Calpheon" },
	{ id: 58925, name: "Rukio", x: 64614, y: 61439, at: "Balvege Island", region: "Balenos" },
	{ id: 58967, name: "Ryubio", x: 54673, y: 57268, at: "Kuit Islands", region: "Calpheon" },
	{ id: 58977, name: "Sabnipu", x: 46009.84, y: 91986.64, at: "Grándiha", region: "O'dyllita" },
	{ id: 58940, name: "Serapu", x: 69343, y: 60614, at: "Baremi Island", region: "Balenos" },
	{ id: 58936, name: "Serrio", x: 77085, y: 64171, at: "Delinghart Island", region: "Mediah" },
	{ id: 58962, name: "Shamihi", x: 85236, y: 57464, at: "Boa Island", region: "Valencia" },
	{ id: 58909, name: "Shapio", x: 52327, y: 63680, at: "Oben Island", region: "Calpheon" },
	{ id: 58951, name: "Sherahi", x: 82065, y: 66316, at: "Sokota Island", region: "Valencia" },
	{ id: 58953, name: "Sherana", x: 70316, y: 57602, at: "Chiro's Cannon Workshop", region: "Balenos" },
	{ id: 58943, name: "Shuka", x: 71555, y: 55542, at: "Chiro's Sail Workshop", region: "Balenos" },
	{ id: 58964, name: "Shura", x: 53346, y: 68530, at: "Serca Island", region: "Calpheon" },
	{ id: 58921, name: "Siani", x: 61225, y: 62559, at: "Marka Island", region: "Balenos" },
	{ id: 58969, name: "Sikario", x: 80597, y: 55834, at: "Rosevan Island", region: "Balenos" },
	{ id: 58955, name: "Solavio", x: 63654, y: 54578, at: "Tashu Island", region: "Balenos" },
	{ id: 58947, name: "Supio", x: 80097, y: 54005, at: "Portanen Island", region: "Balenos" },
	{ id: 58905, name: "Tarin", x: 48372, y: 66030, at: "Rameda Island", region: "Calpheon" },
	{ id: 58932, name: "Tepuo", x: 70115, y: 64263, at: "Paratama Island", region: "Balenos" },
	{ id: 58917, name: "Terseo", x: 59606, y: 59429, at: "Arita Island", region: "Calpheon" },
	{ id: 58956, name: "Tesivin", x: 85800, y: 58576, at: "Orisha Island", region: "Valencia" },
	{ id: 58913, name: "Tidio", x: 55492, y: 66465, at: "Barater Island", region: "Calpheon" },
	{ id: 58959, name: "Tixia", x: 90722, y: 58701, at: "Halmad Island", region: "Valencia" },
	{ id: 58902, name: "Trisha", x: 50114, y: 68258, at: "Modric Island", region: "Calpheon" },
	{ id: 58930, name: "Vedio", x: 66541, y: 64615, at: "Luivano Island", region: "Balenos" }
];

/** Every barterer, by the id all_barter.json uses. */
export const npcById = new Map(npcs.map(n => [n.id, n]));
