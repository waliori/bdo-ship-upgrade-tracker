// What every ship part does for the hull, level by level.
//
// Read off each part's BDOCodex item page on 2026-08-29 -- the page
// carries the game's own per-level equip effects -- and cross-checked
// against the community comparison tables for the older tiers, which
// agree to the number. One caveat carried over from the codex: cannon
// damage is the single "Extra Damage to Ships and Sea Monsters" figure
// the live tooltip shows, not the older split sea-monster/ship pair.
//
// Index is the enhancement level, 0 to 10. Keys are what the part adds:
// speed/accel/turn/brake in percent, dp flat, drr (damage reduction
// rate) in percent, weight in LT, rations, durability, damage per hit and
// hits per volley, reload as seconds taken off. A key a part never
// carries is simply absent.

export const partStats = {
	"Bartali Sailboat: Old Cannon": { id: 49760, levels: [
		{"durability": 300, "damage": 156, "hits": 1},
		{"durability": 400, "damage": 572, "hits": 1},
		{"durability": 500, "damage": 988, "hits": 1},
		{"durability": 600, "damage": 1404, "hits": 1},
		{"durability": 700, "damage": 1820, "hits": 1},
		{"durability": 800, "damage": 2236, "hits": 1},
		{"durability": 900, "damage": 2860, "hits": 1},
		{"durability": 1000, "damage": 3640, "hits": 1},
		{"durability": 1100, "damage": 4420, "hits": 1},
		{"durability": 1200, "damage": 5200, "hits": 1},
		{"durability": 1300, "damage": 6240, "hits": 1}
	] },
	"Bartali Sailboat: Old Figurehead": { id: 49758, levels: [
		{"speed": 0.3, "dp": 1},
		{"speed": 0.4, "dp": 2},
		{"speed": 0.5, "dp": 3},
		{"speed": 0.6, "dp": 4},
		{"speed": 0.7, "dp": 5},
		{"speed": 0.8, "dp": 6},
		{"speed": 0.9, "dp": 7},
		{"speed": 1, "dp": 8},
		{"speed": 1.1, "dp": 9},
		{"speed": 1.2, "dp": 10},
		{"speed": 1.3, "dp": 11}
	] },
	"Bartali Sailboat: Old Plating": { id: 49759, levels: [
		{"dp": 1, "weight": 20},
		{"dp": 2, "weight": 25},
		{"dp": 3, "weight": 30},
		{"dp": 4, "weight": 35},
		{"dp": 5, "weight": 40},
		{"dp": 6, "weight": 45},
		{"dp": 7, "weight": 50},
		{"dp": 8, "weight": 55},
		{"dp": 9, "weight": 60},
		{"dp": 10, "weight": 65},
		{"dp": 11, "weight": 70}
	] },
	"Bartali Sailboat: Old Wind Sail": { id: 49761, levels: [
		{"turn": 0.2, "rations": 50},
		{"turn": 0.25, "rations": 60},
		{"turn": 0.3, "rations": 70},
		{"turn": 0.35, "rations": 80},
		{"turn": 0.4, "rations": 90},
		{"turn": 0.45, "rations": 100},
		{"turn": 0.5, "rations": 110},
		{"turn": 0.55, "rations": 120},
		{"turn": 0.6, "rations": 130},
		{"turn": 0.65, "rations": 140},
		{"turn": 0.7, "rations": 150}
	] },
	"Epheria Caravel: Black Dragon Figurehead": { id: 49655, levels: [
		{"speed": 7, "dp": 25, "drr": 1.25, "weight": 300, "rations": 5000, "durability": 10000},
		{"speed": 7.5, "dp": 27, "drr": 2, "weight": 350, "rations": 6000, "durability": 12000},
		{"speed": 8, "dp": 29, "drr": 2.5, "weight": 400, "rations": 7000, "durability": 14000},
		{"speed": 8.5, "dp": 31, "drr": 3, "weight": 450, "rations": 8000, "durability": 16000},
		{"speed": 9, "dp": 33, "drr": 3.5, "weight": 500, "rations": 9000, "durability": 18000},
		{"speed": 9.5, "dp": 35, "drr": 4, "weight": 550, "rations": 10000, "durability": 20000},
		{"speed": 10, "dp": 37, "drr": 5, "weight": 600, "rations": 12000, "durability": 22000},
		{"speed": 10.5, "dp": 39, "drr": 6, "weight": 700, "rations": 14000, "durability": 24000},
		{"speed": 11, "dp": 41, "drr": 7, "weight": 800, "rations": 16000, "durability": 26000},
		{"speed": 11.5, "dp": 43, "drr": 8, "weight": 900, "rations": 18000, "durability": 28000},
		{"speed": 12, "dp": 45, "drr": 9, "weight": 1000, "rations": 20000, "durability": 30000}
	] },
	"Epheria Caravel: Brass Figurehead": { id: 49653, levels: [
		{"speed": 1, "dp": 10, "drr": 0.5, "weight": 100},
		{"speed": 1.5, "dp": 11, "drr": 0.75, "weight": 120, "rations": 500},
		{"speed": 2, "dp": 12, "drr": 1, "weight": 140, "rations": 1000},
		{"speed": 2.5, "dp": 13, "drr": 1.25, "weight": 160, "rations": 1500},
		{"speed": 3, "dp": 14, "drr": 1.5, "weight": 180, "rations": 2000},
		{"speed": 3.5, "dp": 15, "drr": 1.75, "weight": 200, "rations": 2500},
		{"speed": 4, "dp": 16, "drr": 2, "weight": 220, "rations": 3000},
		{"speed": 4.5, "dp": 17, "drr": 2.25, "weight": 240, "rations": 3500},
		{"speed": 5, "dp": 18, "drr": 2.5, "weight": 260, "rations": 4000},
		{"speed": 5.5, "dp": 19, "drr": 2.75, "weight": 280, "rations": 4500},
		{"speed": 6, "dp": 20, "drr": 3, "weight": 300, "rations": 5000}
	] },
	"Epheria Caravel: Enhanced Plating": { id: 49654, levels: [
		{"dp": 10, "drr": 0.5, "weight": 200},
		{"dp": 11, "drr": 0.75, "weight": 240, "rations": 1000},
		{"dp": 12, "drr": 1, "weight": 280, "rations": 2000},
		{"dp": 13, "drr": 1.25, "weight": 320, "rations": 3000},
		{"dp": 14, "drr": 1.5, "weight": 360, "rations": 4000},
		{"dp": 15, "drr": 1.75, "weight": 400, "rations": 5000},
		{"dp": 17, "drr": 2, "weight": 440, "rations": 6000},
		{"dp": 19, "drr": 2.25, "weight": 480, "rations": 7000},
		{"dp": 21, "drr": 2.5, "weight": 520, "rations": 8000},
		{"dp": 23, "drr": 2.75, "weight": 560, "rations": 9000},
		{"dp": 25, "drr": 3, "weight": 600, "rations": 10000}
	] },
	"Epheria Caravel: Mayna Cannon": { id: 49657, levels: [
		{"weight": 300, "rations": 5000, "durability": 10000, "damage": 2600, "hits": 2},
		{"weight": 350, "rations": 6000, "durability": 14000, "damage": 6500, "hits": 2},
		{"weight": 400, "rations": 7000, "durability": 18000, "damage": 10400, "hits": 2},
		{"weight": 450, "rations": 8000, "durability": 22000, "damage": 14300, "hits": 2},
		{"weight": 500, "rations": 9000, "durability": 26000, "damage": 18200, "hits": 2},
		{"weight": 550, "rations": 10000, "durability": 30000, "damage": 22100, "hits": 2},
		{"weight": 600, "rations": 12000, "durability": 34000, "damage": 27300, "hits": 2},
		{"weight": 700, "rations": 14000, "durability": 38000, "damage": 32500, "hits": 2},
		{"weight": 800, "rations": 16000, "durability": 42000, "damage": 37700, "hits": 2},
		{"weight": 900, "rations": 18000, "durability": 46000, "damage": 42900, "hits": 2},
		{"weight": 1000, "rations": 20000, "durability": 50000, "damage": 52000, "hits": 2}
	] },
	"Epheria Caravel: Stratus Wind Sail": { id: 49658, levels: [
		{"turn": 4, "brake": 4, "weight": 300, "rations": 5000},
		{"turn": 4.6, "brake": 4.6, "weight": 350, "rations": 6000},
		{"turn": 5.2, "brake": 5.2, "weight": 400, "rations": 7000},
		{"turn": 5.8, "brake": 5.8, "weight": 450, "rations": 8000},
		{"turn": 6.4, "brake": 6.4, "weight": 500, "rations": 9000},
		{"turn": 7, "brake": 7, "weight": 550, "rations": 10000},
		{"turn": 7.6, "brake": 7.6, "weight": 600, "rations": 12000},
		{"turn": 8.2, "brake": 8.2, "weight": 700, "rations": 14000},
		{"turn": 8.8, "brake": 8.8, "weight": 800, "rations": 16000},
		{"turn": 9.4, "brake": 9.4, "weight": 900, "rations": 18000},
		{"turn": 10, "brake": 10, "weight": 1000, "rations": 20000}
	] },
	"Epheria Caravel: Upgraded Plating": { id: 49656, levels: [
		{"dp": 30, "drr": 2.75, "weight": 600, "rations": 10000, "durability": 10000},
		{"dp": 31, "drr": 3, "weight": 700, "rations": 12000, "durability": 12000},
		{"dp": 32, "drr": 3, "weight": 800, "rations": 14000, "durability": 14000},
		{"dp": 33, "drr": 3.5, "weight": 900, "rations": 16000, "durability": 16000},
		{"dp": 34, "drr": 3.5, "weight": 1000, "rations": 18000, "durability": 18000},
		{"dp": 35, "drr": 4, "weight": 1100, "rations": 20000, "durability": 20000},
		{"dp": 37, "drr": 5, "weight": 1250, "rations": 24000, "durability": 22000},
		{"dp": 39, "drr": 6, "weight": 1400, "rations": 28000, "durability": 24000},
		{"dp": 41, "drr": 7, "weight": 1600, "rations": 32000, "durability": 26000},
		{"dp": 43, "drr": 8, "weight": 1800, "rations": 36000, "durability": 28000},
		{"dp": 45, "drr": 9, "weight": 2000, "rations": 40000, "durability": 30000}
	] },
	"Epheria Caravel: Verisha Cannon": { id: 49651, levels: [
		{"weight": 100, "durability": 1000, "damage": 780, "hits": 2},
		{"weight": 120, "rations": 500, "durability": 1500, "damage": 2860, "hits": 2},
		{"weight": 140, "rations": 1000, "durability": 2000, "damage": 4940, "hits": 2},
		{"weight": 160, "rations": 1500, "durability": 2500, "damage": 7020, "hits": 2},
		{"weight": 180, "rations": 2000, "durability": 3000, "damage": 9100, "hits": 2},
		{"weight": 200, "rations": 2500, "durability": 3500, "damage": 11180, "hits": 2},
		{"weight": 220, "rations": 3000, "durability": 4000, "damage": 14300, "hits": 2},
		{"weight": 240, "rations": 3500, "durability": 4500, "damage": 18200, "hits": 2},
		{"weight": 260, "rations": 4000, "durability": 5000, "damage": 22100, "hits": 2},
		{"weight": 280, "rations": 4500, "durability": 5500, "damage": 26000, "hits": 2},
		{"weight": 300, "rations": 5000, "durability": 6000, "damage": 31200, "hits": 2}
	] },
	"Epheria Caravel: White Wind Sail": { id: 49652, levels: [
		{"turn": 1, "weight": 100},
		{"turn": 1.2, "weight": 120, "rations": 500},
		{"turn": 1.4, "weight": 140, "rations": 1000},
		{"turn": 1.6, "weight": 160, "rations": 1500},
		{"turn": 1.8, "weight": 180, "rations": 2000},
		{"turn": 2, "weight": 200, "rations": 2500},
		{"turn": 2.2, "weight": 220, "rations": 3000},
		{"turn": 2.4, "weight": 240, "rations": 3500},
		{"turn": 2.6, "weight": 260, "rations": 4000},
		{"turn": 2.8, "weight": 280, "rations": 4500},
		{"turn": 3, "weight": 300, "rations": 5000}
	] },
	"Epheria Carrack: Advance (Chiro's Black Plating)": { id: 49749, levels: [
		{"dp": 55, "drr": 11.4, "weight": 3000, "rations": 100000, "durability": 50000},
		{"dp": 56, "drr": 11.6, "weight": 3200, "rations": 105000, "durability": 55000},
		{"dp": 57, "drr": 11.8, "weight": 3400, "rations": 110000, "durability": 60000},
		{"dp": 58, "drr": 12, "weight": 3600, "rations": 115000, "durability": 65000},
		{"dp": 59, "drr": 12.2, "weight": 3800, "rations": 120000, "durability": 70000},
		{"dp": 60, "drr": 12.4, "weight": 4000, "rations": 125000, "durability": 75000},
		{"dp": 61, "drr": 12.6, "weight": 4200, "rations": 130000, "durability": 80000},
		{"dp": 62, "drr": 12.8, "weight": 4400, "rations": 135000, "durability": 85000},
		{"dp": 63, "drr": 13, "weight": 4600, "rations": 140000, "durability": 90000},
		{"dp": 64, "drr": 13.2, "weight": 4800, "rations": 145000, "durability": 95000},
		{"dp": 65, "drr": 13.4, "weight": 5000, "rations": 150000, "durability": 100000}
	] },
	"Epheria Carrack: Advance (Chiro's Cannon)": { id: 49746, levels: [
		{"weight": 2000, "durability": 50000, "damage": 27820, "hits": 9},
		{"weight": 2100, "durability": 55000, "damage": 28600, "hits": 9},
		{"weight": 2200, "durability": 60000, "damage": 29380, "hits": 9},
		{"weight": 2300, "durability": 65000, "damage": 30160, "hits": 9},
		{"weight": 2400, "durability": 70000, "damage": 30940, "hits": 9},
		{"weight": 2500, "durability": 75000, "damage": 31720, "hits": 9},
		{"weight": 2600, "durability": 80000, "damage": 32500, "hits": 9},
		{"weight": 2700, "durability": 85000, "damage": 33280, "hits": 9},
		{"weight": 2800, "durability": 90000, "damage": 34060, "hits": 9},
		{"weight": 2900, "durability": 95000, "damage": 34840, "hits": 9},
		{"weight": 3000, "durability": 100000, "damage": 35620, "hits": 9}
	] },
	"Epheria Carrack: Advance (Chiro's Figurehead)": { id: 49748, levels: [
		{"speed": 7.5, "accel": 6, "dp": 55, "drr": 11.4},
		{"speed": 7.7, "accel": 6.4, "dp": 56, "drr": 11.6},
		{"speed": 7.9, "accel": 6.8, "dp": 57, "drr": 11.8},
		{"speed": 8.1, "accel": 7.2, "dp": 58, "drr": 12},
		{"speed": 8.3, "accel": 7.6, "dp": 59, "drr": 12.2},
		{"speed": 8.5, "accel": 8, "dp": 60, "drr": 12.4},
		{"speed": 8.7, "accel": 8.4, "dp": 61, "drr": 12.6},
		{"speed": 8.9, "accel": 8.8, "dp": 62, "drr": 12.8},
		{"speed": 9.1, "accel": 9.2, "dp": 63, "drr": 13},
		{"speed": 9.3, "accel": 9.6, "dp": 64, "drr": 13.2},
		{"speed": 9.5, "accel": 10, "dp": 65, "drr": 13.4}
	] },
	"Epheria Carrack: Advance (Chiro's Sail)": { id: 49747, levels: [
		{"speed": 7.5, "turn": 8, "brake": 8},
		{"speed": 7.8, "turn": 8.7, "brake": 8.7},
		{"speed": 8.1, "turn": 9.4, "brake": 9.4},
		{"speed": 8.4, "turn": 10.1, "brake": 10.1},
		{"speed": 8.7, "turn": 10.8, "brake": 10.8},
		{"speed": 9, "turn": 11.5, "brake": 11.5},
		{"speed": 9.3, "turn": 12.2, "brake": 12.2},
		{"speed": 9.6, "turn": 12.9, "brake": 12.9},
		{"speed": 9.9, "turn": 13.6, "brake": 13.6},
		{"speed": 10.2, "turn": 14.3, "brake": 14.3},
		{"speed": 10.5, "turn": 15, "brake": 15}
	] },
	"Epheria Carrack: Advance (Falasi's Cannon)": { id: 49778, levels: [
		{"weight": 3250, "durability": 125000, "damage": 41220, "hits": 9},
		{"weight": 3275, "durability": 127500, "damage": 42620, "hits": 9},
		{"weight": 3300, "durability": 130000, "damage": 44020, "hits": 9},
		{"weight": 3325, "durability": 132500, "damage": 45420, "hits": 9},
		{"weight": 3350, "durability": 135000, "damage": 46820, "hits": 9},
		{"weight": 3375, "durability": 137500, "damage": 48220, "hits": 9},
		{"weight": 3400, "durability": 140000, "damage": 49620, "hits": 9},
		{"weight": 3425, "durability": 142500, "damage": 51020, "hits": 9},
		{"weight": 3450, "durability": 145000, "damage": 52420, "hits": 9},
		{"weight": 3475, "durability": 147500, "damage": 53820, "hits": 9},
		{"weight": 3500, "durability": 150000, "damage": 55220, "hits": 9}
	] },
	"Epheria Carrack: Advance (Falasi's Figurehead)": { id: 49780, levels: [
		{"speed": 9.5, "accel": 12, "dp": 75, "drr": 14.4},
		{"speed": 9.6, "accel": 12.3, "dp": 77, "drr": 14.9},
		{"speed": 9.7, "accel": 12.6, "dp": 79, "drr": 15.4},
		{"speed": 9.8, "accel": 12.9, "dp": 81, "drr": 15.9},
		{"speed": 9.9, "accel": 13.2, "dp": 83, "drr": 16.4},
		{"speed": 10, "accel": 13.5, "dp": 85, "drr": 16.9},
		{"speed": 10.1, "accel": 13.8, "dp": 87, "drr": 17.4},
		{"speed": 10.2, "accel": 14.1, "dp": 89, "drr": 17.9},
		{"speed": 10.3, "accel": 14.4, "dp": 91, "drr": 18.4},
		{"speed": 10.4, "accel": 14.7, "dp": 93, "drr": 18.9},
		{"speed": 10.5, "accel": 15, "dp": 95, "drr": 19.4}
	] },
	"Epheria Carrack: Advance (Falasi's Plating)": { id: 49781, levels: [
		{"dp": 75, "drr": 14.4, "weight": 5500, "rations": 175000, "durability": 125000},
		{"dp": 77, "drr": 14.9, "weight": 5650, "rations": 182500, "durability": 132500},
		{"dp": 79, "drr": 15.4, "weight": 5800, "rations": 190000, "durability": 140000},
		{"dp": 81, "drr": 15.9, "weight": 5950, "rations": 197500, "durability": 147500},
		{"dp": 83, "drr": 16.4, "weight": 6100, "rations": 205000, "durability": 155000},
		{"dp": 85, "drr": 16.9, "weight": 6250, "rations": 212500, "durability": 162500},
		{"dp": 87, "drr": 17.4, "weight": 6400, "rations": 220000, "durability": 170000},
		{"dp": 89, "drr": 17.9, "weight": 6550, "rations": 227500, "durability": 177500},
		{"dp": 91, "drr": 18.4, "weight": 6700, "rations": 235000, "durability": 185000},
		{"dp": 93, "drr": 18.9, "weight": 6850, "rations": 242500, "durability": 192500},
		{"dp": 95, "drr": 19.4, "weight": 7000, "rations": 250000, "durability": 200000}
	] },
	"Epheria Carrack: Advance (Falasi's Sail)": { id: 49779, levels: [
		{"speed": 11.5, "turn": 17, "brake": 15},
		{"speed": 11.6, "turn": 17.4, "brake": 15.6},
		{"speed": 11.7, "turn": 17.8, "brake": 16.2},
		{"speed": 11.8, "turn": 18.2, "brake": 16.8},
		{"speed": 11.9, "turn": 18.6, "brake": 17.4},
		{"speed": 12, "turn": 19, "brake": 18},
		{"speed": 12.1, "turn": 19.4, "brake": 18.6},
		{"speed": 12.2, "turn": 19.8, "brake": 19.2},
		{"speed": 12.3, "turn": 20.2, "brake": 19.8},
		{"speed": 12.4, "turn": 20.6, "brake": 20.4},
		{"speed": 12.5, "turn": 21, "brake": 21}
	] },
	"Epheria Carrack: Balance (Chiro's Black Plating)": { id: 49765, levels: [
		{"dp": 55, "drr": 11.4, "weight": 2700, "rations": 100000, "durability": 50000},
		{"dp": 56, "drr": 11.6, "weight": 2770, "rations": 110000, "durability": 52500},
		{"dp": 57, "drr": 11.8, "weight": 2840, "rations": 120000, "durability": 55000},
		{"dp": 58, "drr": 12, "weight": 2910, "rations": 130000, "durability": 57500},
		{"dp": 59, "drr": 12.2, "weight": 2980, "rations": 140000, "durability": 60000},
		{"dp": 60, "drr": 12.4, "weight": 3050, "rations": 150000, "durability": 62500},
		{"dp": 61, "drr": 12.6, "weight": 3120, "rations": 160000, "durability": 65000},
		{"dp": 62, "drr": 12.8, "weight": 3190, "rations": 170000, "durability": 67500},
		{"dp": 63, "drr": 13, "weight": 3260, "rations": 180000, "durability": 70000},
		{"dp": 64, "drr": 13.2, "weight": 3330, "rations": 190000, "durability": 72500},
		{"dp": 65, "drr": 13.4, "weight": 3400, "rations": 200000, "durability": 75000}
	] },
	"Epheria Carrack: Balance (Chiro's Cannon)": { id: 49762, levels: [
		{"weight": 1900, "durability": 50000, "damage": 28600, "hits": 9},
		{"weight": 1970, "durability": 52500, "damage": 29640, "hits": 9},
		{"weight": 2040, "durability": 55000, "damage": 30680, "hits": 9},
		{"weight": 2110, "durability": 57500, "damage": 31720, "hits": 9},
		{"weight": 2180, "durability": 60000, "damage": 32760, "hits": 9},
		{"weight": 2250, "durability": 62500, "damage": 33800, "hits": 9},
		{"weight": 2320, "durability": 65000, "damage": 34840, "hits": 9},
		{"weight": 2390, "durability": 67500, "damage": 35880, "hits": 9},
		{"weight": 2460, "durability": 70000, "damage": 36920, "hits": 9},
		{"weight": 2530, "durability": 72500, "damage": 37960, "hits": 9},
		{"weight": 2600, "durability": 75000, "damage": 39000, "hits": 9}
	] },
	"Epheria Carrack: Balance (Chiro's Figurehead)": { id: 49764, levels: [
		{"speed": 7.5, "accel": 7, "dp": 55, "drr": 11.4},
		{"speed": 7.7, "accel": 7.8, "dp": 56, "drr": 11.6},
		{"speed": 7.9, "accel": 8.6, "dp": 57, "drr": 11.8},
		{"speed": 8.1, "accel": 9.4, "dp": 58, "drr": 12},
		{"speed": 8.3, "accel": 10.2, "dp": 59, "drr": 12.2},
		{"speed": 8.5, "accel": 11, "dp": 60, "drr": 12.4},
		{"speed": 8.7, "accel": 11.8, "dp": 61, "drr": 12.6},
		{"speed": 8.9, "accel": 12.6, "dp": 62, "drr": 12.8},
		{"speed": 9.1, "accel": 13.4, "dp": 63, "drr": 13},
		{"speed": 9.3, "accel": 14.2, "dp": 64, "drr": 13.2},
		{"speed": 9.5, "accel": 15, "dp": 65, "drr": 13.4}
	] },
	"Epheria Carrack: Balance (Chiro's Sail)": { id: 49763, levels: [
		{"speed": 7.5, "turn": 10, "brake": 10},
		{"speed": 7.8, "turn": 11, "brake": 11},
		{"speed": 8.1, "turn": 12, "brake": 12},
		{"speed": 8.4, "turn": 13, "brake": 13},
		{"speed": 8.7, "turn": 14, "brake": 14},
		{"speed": 9, "turn": 15, "brake": 15},
		{"speed": 9.3, "turn": 16, "brake": 16},
		{"speed": 9.6, "turn": 17, "brake": 17},
		{"speed": 9.9, "turn": 18, "brake": 18},
		{"speed": 10.2, "turn": 19, "brake": 19},
		{"speed": 10.5, "turn": 20, "brake": 20}
	] },
	"Epheria Carrack: Balance (Falasi's Cannon)": { id: 49782, levels: [
		{"weight": 2850, "durability": 100000, "damage": 45000, "hits": 9},
		{"weight": 2875, "durability": 102500, "damage": 46550, "hits": 9},
		{"weight": 2900, "durability": 105000, "damage": 48100, "hits": 9},
		{"weight": 2925, "durability": 107500, "damage": 49650, "hits": 9},
		{"weight": 2950, "durability": 110000, "damage": 51200, "hits": 9},
		{"weight": 2975, "durability": 112500, "damage": 52750, "hits": 9},
		{"weight": 3000, "durability": 115000, "damage": 54300, "hits": 9},
		{"weight": 3025, "durability": 117500, "damage": 55850, "hits": 9},
		{"weight": 3050, "durability": 120000, "damage": 57400, "hits": 9},
		{"weight": 3075, "durability": 122500, "damage": 58950, "hits": 9},
		{"weight": 3100, "durability": 125000, "damage": 60500, "hits": 9}
	] },
	"Epheria Carrack: Balance (Falasi's Figurehead)": { id: 49784, levels: [
		{"speed": 10, "accel": 17, "dp": 75, "drr": 14.4},
		{"speed": 10.1, "accel": 17.3, "dp": 77, "drr": 14.9},
		{"speed": 10.2, "accel": 17.6, "dp": 79, "drr": 15.4},
		{"speed": 10.3, "accel": 17.9, "dp": 81, "drr": 15.9},
		{"speed": 10.4, "accel": 18.2, "dp": 83, "drr": 16.4},
		{"speed": 10.5, "accel": 18.5, "dp": 85, "drr": 16.9},
		{"speed": 10.6, "accel": 18.8, "dp": 87, "drr": 17.4},
		{"speed": 10.7, "accel": 19.1, "dp": 89, "drr": 17.9},
		{"speed": 10.8, "accel": 19.4, "dp": 91, "drr": 18.4},
		{"speed": 10.9, "accel": 19.7, "dp": 93, "drr": 18.9},
		{"speed": 11, "accel": 20, "dp": 95, "drr": 19.4}
	] },
	"Epheria Carrack: Balance (Falasi's Plating)": { id: 49785, levels: [
		{"dp": 75, "drr": 14.4, "weight": 3900, "rations": 225000, "durability": 100000},
		{"dp": 77, "drr": 14.9, "weight": 4050, "rations": 232500, "durability": 107500},
		{"dp": 79, "drr": 15.4, "weight": 4200, "rations": 240000, "durability": 115000},
		{"dp": 81, "drr": 15.9, "weight": 4350, "rations": 247500, "durability": 122500},
		{"dp": 83, "drr": 16.4, "weight": 4500, "rations": 255000, "durability": 130000},
		{"dp": 85, "drr": 16.9, "weight": 4650, "rations": 262500, "durability": 137500},
		{"dp": 87, "drr": 17.4, "weight": 4800, "rations": 270000, "durability": 145000},
		{"dp": 89, "drr": 17.9, "weight": 4950, "rations": 277500, "durability": 152500},
		{"dp": 91, "drr": 18.4, "weight": 5100, "rations": 285000, "durability": 160000},
		{"dp": 93, "drr": 18.9, "weight": 5250, "rations": 292500, "durability": 167500},
		{"dp": 95, "drr": 19.4, "weight": 5400, "rations": 300000, "durability": 175000}
	] },
	"Epheria Carrack: Balance (Falasi's Sail)": { id: 49783, levels: [
		{"speed": 11.5, "turn": 21, "brake": 21},
		{"speed": 11.6, "turn": 21.2, "brake": 21.2},
		{"speed": 11.7, "turn": 21.4, "brake": 21.4},
		{"speed": 11.8, "turn": 21.6, "brake": 21.6},
		{"speed": 11.9, "turn": 21.8, "brake": 21.8},
		{"speed": 12, "turn": 22, "brake": 22},
		{"speed": 12.1, "turn": 22.2, "brake": 22.2},
		{"speed": 12.2, "turn": 22.4, "brake": 22.4},
		{"speed": 12.3, "turn": 22.6, "brake": 22.6},
		{"speed": 12.4, "turn": 22.8, "brake": 22.8},
		{"speed": 12.5, "turn": 23, "brake": 23}
	] },
	"Epheria Carrack: Toro Cannon": { id: 49742, levels: [
		{"weight": 1000, "durability": 15000, "damage": 13000, "hits": 9},
		{"weight": 1080, "durability": 18000, "damage": 14300, "hits": 9},
		{"weight": 1160, "durability": 21000, "damage": 15600, "hits": 9},
		{"weight": 1240, "durability": 24000, "damage": 16900, "hits": 9},
		{"weight": 1320, "durability": 27000, "damage": 18200, "hits": 9},
		{"weight": 1400, "durability": 30000, "damage": 19500, "hits": 9},
		{"weight": 1480, "durability": 33000, "damage": 20800, "hits": 9},
		{"weight": 1560, "durability": 36000, "damage": 22100, "hits": 9},
		{"weight": 1640, "durability": 39000, "damage": 23400, "hits": 9},
		{"weight": 1720, "durability": 42000, "damage": 24700, "hits": 9},
		{"weight": 1800, "durability": 45000, "damage": 26000, "hits": 9}
	] },
	"Epheria Carrack: Toro Figurehead": { id: 49744, levels: [
		{"speed": 5, "accel": 2, "dp": 45, "drr": 9.2},
		{"speed": 5.2, "accel": 2.3, "dp": 46, "drr": 9.4},
		{"speed": 5.4, "accel": 2.6, "dp": 47, "drr": 9.6},
		{"speed": 5.6, "accel": 2.9, "dp": 48, "drr": 9.8},
		{"speed": 5.8, "accel": 3.2, "dp": 49, "drr": 10},
		{"speed": 6, "accel": 3.5, "dp": 50, "drr": 10.2},
		{"speed": 6.2, "accel": 3.8, "dp": 51, "drr": 10.4},
		{"speed": 6.4, "accel": 4.1, "dp": 52, "drr": 10.6},
		{"speed": 6.6, "accel": 4.4, "dp": 53, "drr": 10.8},
		{"speed": 6.8, "accel": 4.7, "dp": 54, "drr": 11},
		{"speed": 7, "accel": 5, "dp": 55, "drr": 11.2}
	] },
	"Epheria Carrack: Toro Plating": { id: 49745, levels: [
		{"dp": 45, "drr": 9.2, "weight": 1000, "rations": 30000, "durability": 15000},
		{"dp": 46, "drr": 9.4, "weight": 1160, "rations": 36000, "durability": 18000},
		{"dp": 47, "drr": 9.6, "weight": 1320, "rations": 42000, "durability": 21000},
		{"dp": 48, "drr": 9.8, "weight": 1480, "rations": 48000, "durability": 24000},
		{"dp": 49, "drr": 10, "weight": 1640, "rations": 54000, "durability": 27000},
		{"dp": 50, "drr": 10.2, "weight": 1800, "rations": 60000, "durability": 30000},
		{"dp": 51, "drr": 10.4, "weight": 1960, "rations": 66000, "durability": 33000},
		{"dp": 52, "drr": 10.6, "weight": 2120, "rations": 72000, "durability": 36000},
		{"dp": 53, "drr": 10.8, "weight": 2280, "rations": 78000, "durability": 39000},
		{"dp": 54, "drr": 11, "weight": 2440, "rations": 84000, "durability": 42000},
		{"dp": 55, "drr": 11.2, "weight": 2600, "rations": 90000, "durability": 45000}
	] },
	"Epheria Carrack: Toro Sail": { id: 49743, levels: [
		{"speed": 5, "turn": 3, "brake": 3},
		{"speed": 5.2, "turn": 3.4, "brake": 3.4},
		{"speed": 5.4, "turn": 3.8, "brake": 3.8},
		{"speed": 5.6, "turn": 4.2, "brake": 4.2},
		{"speed": 5.8, "turn": 4.6, "brake": 4.6},
		{"speed": 6, "turn": 5, "brake": 5},
		{"speed": 6.2, "turn": 5.4, "brake": 5.4},
		{"speed": 6.4, "turn": 5.8, "brake": 5.8},
		{"speed": 6.6, "turn": 6.2, "brake": 6.2},
		{"speed": 6.8, "turn": 6.6, "brake": 6.6},
		{"speed": 7, "turn": 7, "brake": 7}
	] },
	"Epheria Carrack: Valor (Chiro's Black Plating)": { id: 49773, levels: [
		{"dp": 55, "drr": 11.4, "weight": 2650, "rations": 100000, "durability": 50000},
		{"dp": 56, "drr": 11.6, "weight": 2700, "rations": 110000, "durability": 52500},
		{"dp": 57, "drr": 11.8, "weight": 2750, "rations": 120000, "durability": 55000},
		{"dp": 58, "drr": 12, "weight": 2800, "rations": 130000, "durability": 57500},
		{"dp": 59, "drr": 12.2, "weight": 2850, "rations": 140000, "durability": 60000},
		{"dp": 60, "drr": 12.4, "weight": 2900, "rations": 150000, "durability": 62500},
		{"dp": 61, "drr": 12.6, "weight": 2950, "rations": 160000, "durability": 65000},
		{"dp": 62, "drr": 12.8, "weight": 3000, "rations": 170000, "durability": 67500},
		{"dp": 63, "drr": 13, "weight": 3050, "rations": 180000, "durability": 70000},
		{"dp": 64, "drr": 13.2, "weight": 3100, "rations": 190000, "durability": 72500},
		{"dp": 65, "drr": 13.4, "weight": 3150, "rations": 200000, "durability": 75000}
	] },
	"Epheria Carrack: Valor (Chiro's Cannon)": { id: 49770, levels: [
		{"weight": 1850, "durability": 50000, "damage": 31200, "hits": 9, "reload": 2},
		{"weight": 1900, "durability": 52500, "damage": 32760, "hits": 9, "reload": 2},
		{"weight": 1950, "durability": 55000, "damage": 34320, "hits": 9, "reload": 2},
		{"weight": 2000, "durability": 57500, "damage": 35880, "hits": 9, "reload": 2},
		{"weight": 2050, "durability": 60000, "damage": 37440, "hits": 9, "reload": 2},
		{"weight": 2100, "durability": 62500, "damage": 39000, "hits": 9, "reload": 2},
		{"weight": 2150, "durability": 65000, "damage": 40560, "hits": 9, "reload": 2},
		{"weight": 2200, "durability": 67500, "damage": 42120, "hits": 9, "reload": 2},
		{"weight": 2250, "durability": 70000, "damage": 43680, "hits": 9, "reload": 2},
		{"weight": 2300, "durability": 72500, "damage": 45240, "hits": 9, "reload": 2},
		{"weight": 2350, "durability": 75000, "damage": 46800, "hits": 9, "reload": 2}
	] },
	"Epheria Carrack: Valor (Chiro's Figurehead)": { id: 49772, levels: [
		{"speed": 7.5, "accel": 6, "dp": 55, "drr": 11.4},
		{"speed": 7.8, "accel": 6.6, "dp": 56, "drr": 11.6},
		{"speed": 8.1, "accel": 7.2, "dp": 57, "drr": 11.8},
		{"speed": 8.4, "accel": 7.8, "dp": 58, "drr": 12},
		{"speed": 8.7, "accel": 8.4, "dp": 59, "drr": 12.2},
		{"speed": 9, "accel": 9, "dp": 60, "drr": 12.4},
		{"speed": 9.3, "accel": 9.6, "dp": 61, "drr": 12.6},
		{"speed": 9.6, "accel": 10.2, "dp": 62, "drr": 12.8},
		{"speed": 9.9, "accel": 10.8, "dp": 63, "drr": 13},
		{"speed": 10.2, "accel": 11.4, "dp": 64, "drr": 13.2},
		{"speed": 10.5, "accel": 12, "dp": 65, "drr": 13.4}
	] },
	"Epheria Carrack: Valor (Chiro's Sail)": { id: 49771, levels: [
		{"speed": 7.5, "turn": 8, "brake": 8},
		{"speed": 7.9, "turn": 8.7, "brake": 8.7},
		{"speed": 8.3, "turn": 9.4, "brake": 9.4},
		{"speed": 8.7, "turn": 10.1, "brake": 10.1},
		{"speed": 9.1, "turn": 10.8, "brake": 10.8},
		{"speed": 9.5, "turn": 11.5, "brake": 11.5},
		{"speed": 9.9, "turn": 12.2, "brake": 12.2},
		{"speed": 10.3, "turn": 12.9, "brake": 12.9},
		{"speed": 10.7, "turn": 13.6, "brake": 13.6},
		{"speed": 11.1, "turn": 14.3, "brake": 14.3},
		{"speed": 11.5, "turn": 15, "brake": 15}
	] },
	"Epheria Carrack: Valor (Falasi's Cannon)": { id: 49790, levels: [
		{"weight": 2600, "durability": 100000, "damage": 54100, "hits": 9, "reload": 2},
		{"weight": 2625, "durability": 102500, "damage": 55950, "hits": 9, "reload": 2},
		{"weight": 2650, "durability": 105000, "damage": 57800, "hits": 9, "reload": 2},
		{"weight": 2675, "durability": 107500, "damage": 59650, "hits": 9, "reload": 2},
		{"weight": 2700, "durability": 110000, "damage": 61500, "hits": 9, "reload": 2},
		{"weight": 2725, "durability": 112500, "damage": 63350, "hits": 9, "reload": 2},
		{"weight": 2750, "durability": 115000, "damage": 65200, "hits": 9, "reload": 2},
		{"weight": 2775, "durability": 117500, "damage": 67050, "hits": 9, "reload": 2},
		{"weight": 2800, "durability": 120000, "damage": 68900, "hits": 9, "reload": 2},
		{"weight": 2825, "durability": 122500, "damage": 70750, "hits": 9, "reload": 2},
		{"weight": 2850, "durability": 125000, "damage": 72600, "hits": 9, "reload": 2}
	] },
	"Epheria Carrack: Valor (Falasi's Figurehead)": { id: 49792, levels: [
		{"speed": 11, "accel": 14, "dp": 75, "drr": 14.4},
		{"speed": 11.1, "accel": 14.3, "dp": 77, "drr": 14.9},
		{"speed": 11.2, "accel": 14.6, "dp": 79, "drr": 15.4},
		{"speed": 11.3, "accel": 14.9, "dp": 81, "drr": 15.9},
		{"speed": 11.4, "accel": 15.2, "dp": 83, "drr": 16.4},
		{"speed": 11.5, "accel": 15.5, "dp": 85, "drr": 16.9},
		{"speed": 11.6, "accel": 15.8, "dp": 87, "drr": 17.4},
		{"speed": 11.7, "accel": 16.1, "dp": 89, "drr": 17.9},
		{"speed": 11.8, "accel": 16.4, "dp": 91, "drr": 18.4},
		{"speed": 11.9, "accel": 16.7, "dp": 93, "drr": 18.9},
		{"speed": 12, "accel": 17, "dp": 95, "drr": 19.4}
	] },
	"Epheria Carrack: Valor (Falasi's Plating)": { id: 49793, levels: [
		{"dp": 75, "drr": 14.4, "weight": 3650, "rations": 225000, "durability": 100000},
		{"dp": 77, "drr": 14.9, "weight": 3750, "rations": 232500, "durability": 107500},
		{"dp": 79, "drr": 15.4, "weight": 3850, "rations": 240000, "durability": 115000},
		{"dp": 81, "drr": 15.9, "weight": 3950, "rations": 247500, "durability": 122500},
		{"dp": 83, "drr": 16.4, "weight": 4050, "rations": 255000, "durability": 130000},
		{"dp": 85, "drr": 16.9, "weight": 4150, "rations": 262500, "durability": 137500},
		{"dp": 87, "drr": 17.4, "weight": 4250, "rations": 270000, "durability": 145000},
		{"dp": 89, "drr": 17.9, "weight": 4350, "rations": 277500, "durability": 152500},
		{"dp": 91, "drr": 18.4, "weight": 4450, "rations": 285000, "durability": 160000},
		{"dp": 93, "drr": 18.9, "weight": 4550, "rations": 292500, "durability": 167500},
		{"dp": 95, "drr": 19.4, "weight": 4650, "rations": 300000, "durability": 175000}
	] },
	"Epheria Carrack: Valor (Falasi's Sail)": { id: 49791, levels: [
		{"speed": 12, "turn": 16, "brake": 16},
		{"speed": 12.1, "turn": 16.2, "brake": 16.2},
		{"speed": 12.2, "turn": 16.4, "brake": 16.4},
		{"speed": 12.3, "turn": 16.6, "brake": 16.6},
		{"speed": 12.4, "turn": 16.8, "brake": 16.8},
		{"speed": 12.5, "turn": 17, "brake": 17},
		{"speed": 12.6, "turn": 17.2, "brake": 17.2},
		{"speed": 12.7, "turn": 17.4, "brake": 17.4},
		{"speed": 12.8, "turn": 17.6, "brake": 17.6},
		{"speed": 12.9, "turn": 17.8, "brake": 17.8},
		{"speed": 13, "turn": 18, "brake": 18}
	] },
	"Epheria Carrack: Volante (Chiro's Black Plating)": { id: 49769, levels: [
		{"dp": 55, "drr": 11.4, "weight": 2650, "rations": 100000, "durability": 50000},
		{"dp": 56, "drr": 11.6, "weight": 2700, "rations": 105000, "durability": 52500},
		{"dp": 57, "drr": 11.8, "weight": 2750, "rations": 110000, "durability": 55000},
		{"dp": 58, "drr": 12, "weight": 2800, "rations": 115000, "durability": 57500},
		{"dp": 59, "drr": 12.2, "weight": 2850, "rations": 120000, "durability": 60000},
		{"dp": 60, "drr": 12.4, "weight": 2900, "rations": 125000, "durability": 62500},
		{"dp": 61, "drr": 12.6, "weight": 2950, "rations": 130000, "durability": 65000},
		{"dp": 62, "drr": 12.8, "weight": 3000, "rations": 135000, "durability": 67500},
		{"dp": 63, "drr": 13, "weight": 3050, "rations": 140000, "durability": 70000},
		{"dp": 64, "drr": 13.2, "weight": 3100, "rations": 145000, "durability": 72500},
		{"dp": 65, "drr": 13.4, "weight": 3150, "rations": 150000, "durability": 75000}
	] },
	"Epheria Carrack: Volante (Chiro's Cannon)": { id: 49766, levels: [
		{"weight": 1850, "durability": 50000, "damage": 29900, "hits": 9, "reload": 1},
		{"weight": 1900, "durability": 52500, "damage": 31200, "hits": 9, "reload": 1},
		{"weight": 1950, "durability": 55000, "damage": 32500, "hits": 9, "reload": 1},
		{"weight": 2000, "durability": 57500, "damage": 33800, "hits": 9, "reload": 1},
		{"weight": 2050, "durability": 60000, "damage": 35100, "hits": 9, "reload": 1},
		{"weight": 2100, "durability": 62500, "damage": 36400, "hits": 9, "reload": 1},
		{"weight": 2150, "durability": 65000, "damage": 37700, "hits": 9, "reload": 1},
		{"weight": 2200, "durability": 67500, "damage": 39000, "hits": 9, "reload": 1},
		{"weight": 2250, "durability": 70000, "damage": 40300, "hits": 9, "reload": 1},
		{"weight": 2300, "durability": 72500, "damage": 41600, "hits": 9, "reload": 1},
		{"weight": 2350, "durability": 75000, "damage": 42900, "hits": 9, "reload": 1}
	] },
	"Epheria Carrack: Volante (Chiro's Figurehead)": { id: 49768, levels: [
		{"speed": 8, "accel": 7, "dp": 55, "drr": 11.4},
		{"speed": 8.3, "accel": 7.8, "dp": 56, "drr": 11.6},
		{"speed": 8.6, "accel": 8.6, "dp": 57, "drr": 11.8},
		{"speed": 8.9, "accel": 9.4, "dp": 58, "drr": 12},
		{"speed": 9.2, "accel": 10.2, "dp": 59, "drr": 12.2},
		{"speed": 9.5, "accel": 11, "dp": 60, "drr": 12.4},
		{"speed": 9.8, "accel": 11.8, "dp": 61, "drr": 12.6},
		{"speed": 10.1, "accel": 12.6, "dp": 62, "drr": 12.8},
		{"speed": 10.4, "accel": 13.4, "dp": 63, "drr": 13},
		{"speed": 10.7, "accel": 14.2, "dp": 64, "drr": 13.2},
		{"speed": 11, "accel": 15, "dp": 65, "drr": 13.4}
	] },
	"Epheria Carrack: Volante (Chiro's Sail)": { id: 49767, levels: [
		{"speed": 9, "turn": 8, "brake": 8},
		{"speed": 9.5, "turn": 8.7, "brake": 8.7},
		{"speed": 10, "turn": 9.4, "brake": 9.4},
		{"speed": 10.5, "turn": 10.1, "brake": 10.1},
		{"speed": 11, "turn": 10.8, "brake": 10.8},
		{"speed": 11.5, "turn": 11.5, "brake": 11.5},
		{"speed": 12, "turn": 12.2, "brake": 12.2},
		{"speed": 12.5, "turn": 12.9, "brake": 12.9},
		{"speed": 13, "turn": 13.6, "brake": 13.6},
		{"speed": 13.5, "turn": 14.3, "brake": 14.3},
		{"speed": 14, "turn": 15, "brake": 15}
	] },
	"Epheria Carrack: Volante (Falasi's Cannon)": { id: 49786, levels: [
		{"weight": 2600, "durability": 100000, "damage": 49500, "hits": 9, "reload": 1},
		{"weight": 2625, "durability": 102500, "damage": 51200, "hits": 9, "reload": 1},
		{"weight": 2650, "durability": 105000, "damage": 52900, "hits": 9, "reload": 1},
		{"weight": 2675, "durability": 107500, "damage": 54600, "hits": 9, "reload": 1},
		{"weight": 2700, "durability": 110000, "damage": 56300, "hits": 9, "reload": 1},
		{"weight": 2725, "durability": 112500, "damage": 58000, "hits": 9, "reload": 1},
		{"weight": 2750, "durability": 115000, "damage": 59700, "hits": 9, "reload": 1},
		{"weight": 2775, "durability": 117500, "damage": 61400, "hits": 9, "reload": 1},
		{"weight": 2800, "durability": 120000, "damage": 63100, "hits": 9, "reload": 1},
		{"weight": 2825, "durability": 122500, "damage": 64800, "hits": 9, "reload": 1},
		{"weight": 2850, "durability": 125000, "damage": 66500, "hits": 9, "reload": 1}
	] },
	"Epheria Carrack: Volante (Falasi's Figurehead)": { id: 49788, levels: [
		{"speed": 11.5, "accel": 17, "dp": 75, "drr": 14.4},
		{"speed": 11.6, "accel": 17.3, "dp": 77, "drr": 14.9},
		{"speed": 11.7, "accel": 17.6, "dp": 79, "drr": 15.4},
		{"speed": 11.8, "accel": 17.9, "dp": 81, "drr": 15.9},
		{"speed": 11.9, "accel": 18.2, "dp": 83, "drr": 16.4},
		{"speed": 12, "accel": 18.5, "dp": 85, "drr": 16.9},
		{"speed": 12.1, "accel": 18.8, "dp": 87, "drr": 17.4},
		{"speed": 12.2, "accel": 19.1, "dp": 89, "drr": 17.9},
		{"speed": 12.3, "accel": 19.4, "dp": 91, "drr": 18.4},
		{"speed": 12.4, "accel": 19.7, "dp": 93, "drr": 18.9},
		{"speed": 12.5, "accel": 20, "dp": 95, "drr": 19.4}
	] },
	"Epheria Carrack: Volante (Falasi's Plating)": { id: 49789, levels: [
		{"dp": 75, "drr": 14.4, "weight": 3650, "rations": 175000, "durability": 100000},
		{"dp": 77, "drr": 14.9, "weight": 3750, "rations": 182500, "durability": 107500},
		{"dp": 79, "drr": 15.4, "weight": 3850, "rations": 190000, "durability": 115000},
		{"dp": 81, "drr": 15.9, "weight": 3950, "rations": 197500, "durability": 122500},
		{"dp": 83, "drr": 16.4, "weight": 4050, "rations": 205000, "durability": 130000},
		{"dp": 85, "drr": 16.9, "weight": 4150, "rations": 212500, "durability": 137500},
		{"dp": 87, "drr": 17.4, "weight": 4250, "rations": 220000, "durability": 145000},
		{"dp": 89, "drr": 17.9, "weight": 4350, "rations": 227500, "durability": 152500},
		{"dp": 91, "drr": 18.4, "weight": 4450, "rations": 235000, "durability": 160000},
		{"dp": 93, "drr": 18.9, "weight": 4550, "rations": 242500, "durability": 167500},
		{"dp": 95, "drr": 19.4, "weight": 4650, "rations": 250000, "durability": 175000}
	] },
	"Epheria Carrack: Volante (Falasi's Sail)": { id: 49787, levels: [
		{"speed": 14.5, "turn": 16, "brake": 16},
		{"speed": 14.6, "turn": 16.2, "brake": 16.2},
		{"speed": 14.7, "turn": 16.4, "brake": 16.4},
		{"speed": 14.8, "turn": 16.6, "brake": 16.6},
		{"speed": 14.9, "turn": 16.8, "brake": 16.8},
		{"speed": 15, "turn": 17, "brake": 17},
		{"speed": 15.1, "turn": 17.2, "brake": 17.2},
		{"speed": 15.2, "turn": 17.4, "brake": 17.4},
		{"speed": 15.3, "turn": 17.6, "brake": 17.6},
		{"speed": 15.4, "turn": 17.8, "brake": 17.8},
		{"speed": 15.5, "turn": 18, "brake": 18}
	] },
	"Epheria Galleass: Black Dragon Figurehead": { id: 49667, levels: [
		{"speed": 7, "dp": 25, "drr": 1.25, "weight": 300, "rations": 5000, "durability": 10000},
		{"speed": 7.5, "dp": 27, "drr": 2, "weight": 350, "rations": 6000, "durability": 12000},
		{"speed": 8, "dp": 29, "drr": 2.5, "weight": 400, "rations": 7000, "durability": 14000},
		{"speed": 8.5, "dp": 31, "drr": 3, "weight": 450, "rations": 8000, "durability": 16000},
		{"speed": 9, "dp": 33, "drr": 3.5, "weight": 500, "rations": 9000, "durability": 18000},
		{"speed": 9.5, "dp": 35, "drr": 4, "weight": 550, "rations": 10000, "durability": 20000},
		{"speed": 10, "dp": 37, "drr": 5, "weight": 600, "rations": 12000, "durability": 22000},
		{"speed": 10.5, "dp": 39, "drr": 6, "weight": 700, "rations": 14000, "durability": 24000},
		{"speed": 11, "dp": 41, "drr": 7, "weight": 800, "rations": 16000, "durability": 26000},
		{"speed": 11.5, "dp": 43, "drr": 8, "weight": 900, "rations": 18000, "durability": 28000},
		{"speed": 12, "dp": 45, "drr": 9, "weight": 1000, "rations": 20000, "durability": 30000}
	] },
	"Epheria Galleass: Enhanced Plating": { id: 49666, levels: [
		{"dp": 10, "drr": 0.5, "weight": 200},
		{"dp": 11, "drr": 0.75, "weight": 240, "rations": 1000},
		{"dp": 12, "drr": 1, "weight": 280, "rations": 2000},
		{"dp": 13, "drr": 1.25, "weight": 320, "rations": 3000},
		{"dp": 14, "drr": 1.5, "weight": 360, "rations": 4000},
		{"dp": 15, "drr": 1.75, "weight": 400, "rations": 5000},
		{"dp": 17, "drr": 2, "weight": 440, "rations": 6000},
		{"dp": 19, "drr": 2.25, "weight": 480, "rations": 7000},
		{"dp": 21, "drr": 2.5, "weight": 520, "rations": 8000},
		{"dp": 23, "drr": 2.75, "weight": 560, "rations": 9000},
		{"dp": 25, "drr": 3, "weight": 600, "rations": 10000}
	] },
	"Epheria Galleass: Mayna Cannon": { id: 49669, levels: [
		{"weight": 300, "rations": 5000, "durability": 10000, "damage": 2600, "hits": 4},
		{"weight": 350, "rations": 6000, "durability": 14000, "damage": 6500, "hits": 4},
		{"weight": 400, "rations": 7000, "durability": 18000, "damage": 10400, "hits": 4},
		{"weight": 450, "rations": 8000, "durability": 22000, "damage": 14300, "hits": 4},
		{"weight": 500, "rations": 9000, "durability": 26000, "damage": 18200, "hits": 4},
		{"weight": 550, "rations": 10000, "durability": 30000, "damage": 22100, "hits": 4},
		{"weight": 600, "rations": 12000, "durability": 34000, "damage": 27300, "hits": 4},
		{"weight": 700, "rations": 14000, "durability": 38000, "damage": 32500, "hits": 4},
		{"weight": 800, "rations": 16000, "durability": 42000, "damage": 37700, "hits": 4},
		{"weight": 900, "rations": 18000, "durability": 46000, "damage": 42900, "hits": 4},
		{"weight": 1000, "rations": 20000, "durability": 50000, "damage": 52000, "hits": 4}
	] },
	"Epheria Galleass: Stratus Wind Sail": { id: 49670, levels: [
		{"turn": 4, "brake": 4, "weight": 300, "rations": 5000},
		{"turn": 4.6, "brake": 4.6, "weight": 350, "rations": 6000},
		{"turn": 5.2, "brake": 5.2, "weight": 400, "rations": 7000},
		{"turn": 5.8, "brake": 5.8, "weight": 450, "rations": 8000},
		{"turn": 6.4, "brake": 6.4, "weight": 500, "rations": 9000},
		{"turn": 7, "brake": 7, "weight": 550, "rations": 10000},
		{"turn": 7.6, "brake": 7.6, "weight": 600, "rations": 12000},
		{"turn": 8.2, "brake": 8.2, "weight": 700, "rations": 14000},
		{"turn": 8.8, "brake": 8.8, "weight": 800, "rations": 16000},
		{"turn": 9.4, "brake": 9.4, "weight": 900, "rations": 18000},
		{"turn": 10, "brake": 10, "weight": 1000, "rations": 20000}
	] },
	"Epheria Galleass: Upgraded Plating": { id: 49668, levels: [
		{"dp": 30, "drr": 2.75, "weight": 600, "rations": 10000, "durability": 10000},
		{"dp": 31, "drr": 3, "weight": 700, "rations": 12000, "durability": 12000},
		{"dp": 32, "drr": 3, "weight": 800, "rations": 14000, "durability": 14000},
		{"dp": 33, "drr": 3.5, "weight": 900, "rations": 16000, "durability": 16000},
		{"dp": 34, "drr": 3.5, "weight": 1000, "rations": 18000, "durability": 18000},
		{"dp": 35, "drr": 4, "weight": 1100, "rations": 20000, "durability": 20000},
		{"dp": 37, "drr": 5, "weight": 1250, "rations": 24000, "durability": 22000},
		{"dp": 39, "drr": 6, "weight": 1400, "rations": 28000, "durability": 24000},
		{"dp": 41, "drr": 7, "weight": 1600, "rations": 32000, "durability": 26000},
		{"dp": 43, "drr": 8, "weight": 1800, "rations": 36000, "durability": 28000},
		{"dp": 45, "drr": 9, "weight": 2000, "rations": 40000, "durability": 30000}
	] },
	"Epheria Galleass: Verisha Cannon": { id: 49663, levels: [
		{"weight": 100, "durability": 1000, "damage": 780, "hits": 4},
		{"weight": 120, "rations": 500, "durability": 1500, "damage": 2860, "hits": 4},
		{"weight": 140, "rations": 1000, "durability": 2000, "damage": 4940, "hits": 4},
		{"weight": 160, "rations": 1500, "durability": 2500, "damage": 7020, "hits": 4},
		{"weight": 180, "rations": 2000, "durability": 3000, "damage": 9100, "hits": 4},
		{"weight": 200, "rations": 2500, "durability": 3500, "damage": 11180, "hits": 4},
		{"weight": 220, "rations": 3000, "durability": 4000, "damage": 14300, "hits": 4},
		{"weight": 240, "rations": 3500, "durability": 4500, "damage": 18200, "hits": 4},
		{"weight": 260, "rations": 4000, "durability": 5000, "damage": 22100, "hits": 4},
		{"weight": 280, "rations": 4500, "durability": 5500, "damage": 26000, "hits": 4},
		{"weight": 300, "rations": 5000, "durability": 6000, "damage": 31200, "hits": 4}
	] },
	"Epheria Galleass: White Horn Figurehead": { id: 49665, levels: [
		{"speed": 1, "dp": 10, "drr": 0.5, "weight": 100},
		{"speed": 1.5, "dp": 11, "drr": 0.75, "weight": 120, "rations": 500},
		{"speed": 2, "dp": 12, "drr": 1, "weight": 140, "rations": 1000},
		{"speed": 2.5, "dp": 13, "drr": 1.25, "weight": 160, "rations": 1500},
		{"speed": 3, "dp": 14, "drr": 1.5, "weight": 180, "rations": 2000},
		{"speed": 3.5, "dp": 15, "drr": 1.75, "weight": 200, "rations": 2500},
		{"speed": 4, "dp": 16, "drr": 2, "weight": 220, "rations": 3000},
		{"speed": 4.5, "dp": 17, "drr": 2.25, "weight": 240, "rations": 3500},
		{"speed": 5, "dp": 18, "drr": 2.5, "weight": 260, "rations": 4000},
		{"speed": 5.5, "dp": 19, "drr": 2.75, "weight": 280, "rations": 4500},
		{"speed": 6, "dp": 20, "drr": 3, "weight": 300, "rations": 5000}
	] },
	"Epheria Galleass: White Wind Sail": { id: 49664, levels: [
		{"turn": 1, "weight": 100},
		{"turn": 1.2, "weight": 120, "rations": 500},
		{"turn": 1.4, "weight": 140, "rations": 1000},
		{"turn": 1.6, "weight": 160, "rations": 1500},
		{"turn": 1.8, "weight": 180, "rations": 2000},
		{"turn": 2, "weight": 200, "rations": 2500},
		{"turn": 2.2, "weight": 220, "rations": 3000},
		{"turn": 2.4, "weight": 240, "rations": 3500},
		{"turn": 2.6, "weight": 260, "rations": 4000},
		{"turn": 2.8, "weight": 280, "rations": 4500},
		{"turn": 3, "weight": 300, "rations": 5000}
	] },
	"Epheria: Old Cannon": { id: 49756, levels: [
		{"durability": 500, "damage": 390, "hits": 1},
		{"durability": 750, "damage": 1430, "hits": 1},
		{"durability": 1000, "damage": 2470, "hits": 1},
		{"durability": 1250, "damage": 3510, "hits": 1},
		{"durability": 1500, "damage": 4550, "hits": 1},
		{"durability": 1750, "damage": 5590, "hits": 1},
		{"durability": 2000, "damage": 7150, "hits": 1},
		{"durability": 2250, "damage": 9100, "hits": 1},
		{"durability": 2500, "damage": 11050, "hits": 1},
		{"durability": 2750, "damage": 13000, "hits": 1},
		{"durability": 3000, "damage": 15600, "hits": 1}
	] },
	"Epheria: Old Figurehead": { id: 49754, levels: [
		{"speed": 0.5, "dp": 5},
		{"speed": 0.75, "dp": 6},
		{"speed": 1, "dp": 7},
		{"speed": 1.25, "dp": 8},
		{"speed": 1.5, "dp": 9},
		{"speed": 1.75, "dp": 10},
		{"speed": 2, "dp": 11},
		{"speed": 2.25, "dp": 12},
		{"speed": 2.5, "dp": 13},
		{"speed": 2.75, "dp": 14},
		{"speed": 3, "dp": 15}
	] },
	"Epheria: Old Plating": { id: 49755, levels: [
		{"dp": 5, "weight": 50},
		{"dp": 6, "weight": 55},
		{"dp": 7, "weight": 60},
		{"dp": 8, "weight": 65},
		{"dp": 9, "weight": 70},
		{"dp": 10, "weight": 75},
		{"dp": 11, "weight": 80},
		{"dp": 12, "weight": 85},
		{"dp": 13, "weight": 90},
		{"dp": 14, "weight": 95},
		{"dp": 15, "weight": 100}
	] },
	"Epheria: Old Wind Sail": { id: 49757, levels: [
		{"turn": 0.5, "rations": 100},
		{"turn": 0.6, "rations": 120},
		{"turn": 0.7, "rations": 140},
		{"turn": 0.8, "rations": 160},
		{"turn": 0.9, "rations": 180},
		{"turn": 1, "rations": 200},
		{"turn": 1.1, "rations": 220},
		{"turn": 1.2, "rations": 240},
		{"turn": 1.3, "rations": 260},
		{"turn": 1.4, "rations": 280},
		{"turn": 1.5, "rations": 300}
	] },
	"Panokseon: Byukgye's Enhanced Cannon": { id: 59406, levels: [
		{"weight": 1800, "durability": 75000, "damage": 31200, "hits": 9, "reload": 1},
		{"weight": 1850, "durability": 77500, "damage": 32760, "hits": 9, "reload": 1},
		{"weight": 1900, "durability": 80000, "damage": 34320, "hits": 9, "reload": 1},
		{"weight": 1950, "durability": 82500, "damage": 35880, "hits": 9, "reload": 1},
		{"weight": 2000, "durability": 85000, "damage": 37440, "hits": 9, "reload": 1},
		{"weight": 2050, "durability": 87500, "damage": 39000, "hits": 9, "reload": 1},
		{"weight": 2100, "durability": 90000, "damage": 40560, "hits": 9, "reload": 1},
		{"weight": 2150, "durability": 92500, "damage": 42120, "hits": 9, "reload": 1},
		{"weight": 2200, "durability": 95000, "damage": 43680, "hits": 9, "reload": 1},
		{"weight": 2250, "durability": 97500, "damage": 45240, "hits": 9, "reload": 1},
		{"weight": 2300, "durability": 100000, "damage": 46800, "hits": 9, "reload": 1}
	] },
	"Panokseon: Byukgye's Enhanced Figurehead": { id: 59408, levels: [
		{"speed": 7.5, "accel": 6, "dp": 55, "drr": 11.4},
		{"speed": 7.8, "accel": 6.6, "dp": 56, "drr": 11.6},
		{"speed": 8.1, "accel": 7.2, "dp": 57, "drr": 11.8},
		{"speed": 8.4, "accel": 7.8, "dp": 58, "drr": 12},
		{"speed": 8.7, "accel": 8.4, "dp": 59, "drr": 12.2},
		{"speed": 9, "accel": 9, "dp": 60, "drr": 12.4},
		{"speed": 9.3, "accel": 9.6, "dp": 61, "drr": 12.6},
		{"speed": 9.6, "accel": 10.2, "dp": 62, "drr": 12.8},
		{"speed": 9.9, "accel": 10.8, "dp": 63, "drr": 13},
		{"speed": 10.2, "accel": 11.4, "dp": 64, "drr": 13.2},
		{"speed": 10.5, "accel": 12, "dp": 65, "drr": 13.4}
	] },
	"Panokseon: Byukgye's Enhanced Plating": { id: 59409, levels: [
		{"dp": 55, "drr": 11.4, "weight": 2600, "rations": 100000, "durability": 75000},
		{"dp": 56, "drr": 11.6, "weight": 2650, "rations": 110000, "durability": 77500},
		{"dp": 57, "drr": 11.8, "weight": 2700, "rations": 120000, "durability": 80000},
		{"dp": 58, "drr": 12, "weight": 2750, "rations": 130000, "durability": 82500},
		{"dp": 59, "drr": 12.2, "weight": 2800, "rations": 140000, "durability": 85000},
		{"dp": 60, "drr": 12.4, "weight": 2850, "rations": 150000, "durability": 87500},
		{"dp": 61, "drr": 12.6, "weight": 2900, "rations": 160000, "durability": 90000},
		{"dp": 62, "drr": 12.8, "weight": 2950, "rations": 170000, "durability": 92500},
		{"dp": 63, "drr": 13, "weight": 3000, "rations": 180000, "durability": 95000},
		{"dp": 64, "drr": 13.2, "weight": 3050, "rations": 190000, "durability": 97500},
		{"dp": 65, "drr": 13.4, "weight": 3100, "rations": 200000, "durability": 100000}
	] },
	"Panokseon: Byukgye's Enhanced Sail": { id: 59407, levels: [
		{"speed": 7.5, "turn": 8, "brake": 8},
		{"speed": 7.9, "turn": 8.7, "brake": 8.7},
		{"speed": 8.3, "turn": 9.4, "brake": 9.4},
		{"speed": 8.7, "turn": 10.1, "brake": 10.1},
		{"speed": 9.1, "turn": 10.8, "brake": 10.8},
		{"speed": 9.5, "turn": 11.5, "brake": 11.5},
		{"speed": 9.9, "turn": 12.2, "brake": 12.2},
		{"speed": 10.3, "turn": 12.9, "brake": 12.9},
		{"speed": 10.7, "turn": 13.6, "brake": 13.6},
		{"speed": 11.1, "turn": 14.3, "brake": 14.3},
		{"speed": 11.5, "turn": 15, "brake": 15}
	] },
	"Panokseon: Cheongun's Enhanced Cannon": { id: 59469, levels: [
		{"weight": 2550, "durability": 125000, "damage": 54100, "hits": 9, "reload": 1},
		{"weight": 2575, "durability": 127500, "damage": 55950, "hits": 9, "reload": 1},
		{"weight": 2600, "durability": 130000, "damage": 57800, "hits": 9, "reload": 1},
		{"weight": 2625, "durability": 132500, "damage": 59650, "hits": 9, "reload": 1},
		{"weight": 2650, "durability": 135000, "damage": 61500, "hits": 9, "reload": 1},
		{"weight": 2675, "durability": 137500, "damage": 63350, "hits": 9, "reload": 1},
		{"weight": 2700, "durability": 140000, "damage": 65200, "hits": 9, "reload": 1},
		{"weight": 2725, "durability": 142500, "damage": 67050, "hits": 9, "reload": 1},
		{"weight": 2750, "durability": 145000, "damage": 68900, "hits": 9, "reload": 1},
		{"weight": 2775, "durability": 147500, "damage": 70750, "hits": 9, "reload": 1},
		{"weight": 2800, "durability": 150000, "damage": 72600, "hits": 9, "reload": 1}
	] },
	"Panokseon: Cheongun's Enhanced Figurehead": { id: 59471, levels: [
		{"speed": 11, "accel": 14, "dp": 75, "drr": 14.4},
		{"speed": 11.1, "accel": 14.3, "dp": 77, "drr": 14.9},
		{"speed": 11.2, "accel": 14.6, "dp": 79, "drr": 15.4},
		{"speed": 11.3, "accel": 14.9, "dp": 81, "drr": 15.9},
		{"speed": 11.4, "accel": 15.2, "dp": 83, "drr": 16.4},
		{"speed": 11.5, "accel": 15.5, "dp": 85, "drr": 16.9},
		{"speed": 11.6, "accel": 15.8, "dp": 87, "drr": 17.4},
		{"speed": 11.7, "accel": 16.1, "dp": 89, "drr": 17.9},
		{"speed": 11.8, "accel": 16.4, "dp": 91, "drr": 18.4},
		{"speed": 11.9, "accel": 16.7, "dp": 93, "drr": 18.9},
		{"speed": 12, "accel": 17, "dp": 95, "drr": 19.4}
	] },
	"Panokseon: Cheongun's Enhanced Plating": { id: 59472, levels: [
		{"dp": 75, "drr": 14.4, "weight": 3600, "rations": 225000, "durability": 125000},
		{"dp": 77, "drr": 14.9, "weight": 3700, "rations": 232500, "durability": 132500},
		{"dp": 79, "drr": 15.4, "weight": 3800, "rations": 240000, "durability": 140000},
		{"dp": 81, "drr": 15.9, "weight": 3900, "rations": 247500, "durability": 147500},
		{"dp": 83, "drr": 16.4, "weight": 4000, "rations": 255000, "durability": 155000},
		{"dp": 85, "drr": 16.9, "weight": 4100, "rations": 262500, "durability": 162500},
		{"dp": 87, "drr": 17.4, "weight": 4200, "rations": 270000, "durability": 170000},
		{"dp": 89, "drr": 17.9, "weight": 4300, "rations": 277500, "durability": 177500},
		{"dp": 91, "drr": 18.4, "weight": 4400, "rations": 285000, "durability": 185000},
		{"dp": 93, "drr": 18.9, "weight": 4500, "rations": 292500, "durability": 192500},
		{"dp": 95, "drr": 19.4, "weight": 4600, "rations": 300000, "durability": 200000}
	] },
	"Panokseon: Cheongun's Enhanced Sail": { id: 59470, levels: [
		{"speed": 12, "turn": 16, "brake": 16},
		{"speed": 12.1, "turn": 16.2, "brake": 16.2},
		{"speed": 12.2, "turn": 16.4, "brake": 16.4},
		{"speed": 12.3, "turn": 16.6, "brake": 16.6},
		{"speed": 12.4, "turn": 16.8, "brake": 16.8},
		{"speed": 12.5, "turn": 17, "brake": 17},
		{"speed": 12.6, "turn": 17.2, "brake": 17.2},
		{"speed": 12.7, "turn": 17.4, "brake": 17.4},
		{"speed": 12.8, "turn": 17.6, "brake": 17.6},
		{"speed": 12.9, "turn": 17.8, "brake": 17.8},
		{"speed": 13, "turn": 18, "brake": 18}
	] },
	"Panokseon: Haemo's Cannon": { id: 59402, levels: [
		{"weight": 1000, "durability": 15000, "damage": 13000, "hits": 9},
		{"weight": 1080, "durability": 18000, "damage": 14300, "hits": 9},
		{"weight": 1160, "durability": 21000, "damage": 15600, "hits": 9},
		{"weight": 1240, "durability": 24000, "damage": 16900, "hits": 9},
		{"weight": 1320, "durability": 27000, "damage": 18200, "hits": 9},
		{"weight": 1400, "durability": 30000, "damage": 19500, "hits": 9},
		{"weight": 1480, "durability": 33000, "damage": 20800, "hits": 9},
		{"weight": 1560, "durability": 36000, "damage": 22100, "hits": 9},
		{"weight": 1640, "durability": 39000, "damage": 23400, "hits": 9},
		{"weight": 1720, "durability": 42000, "damage": 24700, "hits": 9},
		{"weight": 1800, "durability": 45000, "damage": 26000, "hits": 9}
	] },
	"Panokseon: Haemo's Figurehead": { id: 59404, levels: [
		{"speed": 5, "accel": 2, "dp": 45, "drr": 9.2},
		{"speed": 5.2, "accel": 2.3, "dp": 46, "drr": 9.4},
		{"speed": 5.4, "accel": 2.6, "dp": 47, "drr": 9.6},
		{"speed": 5.6, "accel": 2.9, "dp": 48, "drr": 9.8},
		{"speed": 5.8, "accel": 3.2, "dp": 49, "drr": 10},
		{"speed": 6, "accel": 3.5, "dp": 50, "drr": 10.2},
		{"speed": 6.2, "accel": 3.8, "dp": 51, "drr": 10.4},
		{"speed": 6.4, "accel": 4.1, "dp": 52, "drr": 10.6},
		{"speed": 6.6, "accel": 4.4, "dp": 53, "drr": 10.8},
		{"speed": 6.8, "accel": 4.7, "dp": 54, "drr": 11},
		{"speed": 7, "accel": 5, "dp": 55, "drr": 11.2}
	] },
	"Panokseon: Haemo's Plating": { id: 59405, levels: [
		{"dp": 45, "drr": 9.2, "weight": 1000, "rations": 30000, "durability": 15000},
		{"dp": 46, "drr": 9.4, "weight": 1160, "rations": 36000, "durability": 18000},
		{"dp": 47, "drr": 9.6, "weight": 1320, "rations": 42000, "durability": 21000},
		{"dp": 48, "drr": 9.8, "weight": 1480, "rations": 48000, "durability": 24000},
		{"dp": 49, "drr": 10, "weight": 1640, "rations": 54000, "durability": 27000},
		{"dp": 50, "drr": 10.2, "weight": 1800, "rations": 60000, "durability": 30000},
		{"dp": 51, "drr": 10.4, "weight": 1960, "rations": 66000, "durability": 33000},
		{"dp": 52, "drr": 10.6, "weight": 2120, "rations": 72000, "durability": 36000},
		{"dp": 53, "drr": 10.8, "weight": 2280, "rations": 78000, "durability": 39000},
		{"dp": 54, "drr": 11, "weight": 2440, "rations": 84000, "durability": 42000},
		{"dp": 55, "drr": 11.2, "weight": 2600, "rations": 90000, "durability": 45000}
	] },
	"Panokseon: Haemo's Sail": { id: 59403, levels: [
		{"speed": 5, "turn": 3, "brake": 3},
		{"speed": 5.2, "turn": 3.4, "brake": 3.4},
		{"speed": 5.4, "turn": 3.8, "brake": 3.8},
		{"speed": 5.6, "turn": 4.2, "brake": 4.2},
		{"speed": 5.8, "turn": 4.6, "brake": 4.6},
		{"speed": 6, "turn": 5, "brake": 5},
		{"speed": 6.2, "turn": 5.4, "brake": 5.4},
		{"speed": 6.4, "turn": 5.8, "brake": 5.8},
		{"speed": 6.6, "turn": 6.2, "brake": 6.2},
		{"speed": 6.8, "turn": 6.6, "brake": 6.6},
		{"speed": 7, "turn": 7, "brake": 7}
	] }
};

const SLOTS = ['cannon', 'sail', 'figurehead', 'plating'];
const STAT_KEYS = ['speed', 'accel', 'turn', 'brake', 'dp', 'drr', 'weight', 'rations', 'durability', 'damage', 'hits', 'reload'];

/** Which of the four fittings a part is, from its name. */
export function slotOf(part) {
	const n = part.toLowerCase();
	if (n.includes('cannon')) return 'cannon';
	if (n.includes('sail')) return 'sail';
	if (n.includes('figurehead')) return 'figurehead';
	if (n.includes('plating')) return 'plating';
	return null;
}

/**
 * Whether a part goes on a hull. The names say: a Bartali part on the
 * Bartali, an "Epheria: Old" part on either Epheria hull and its
 * Improved twin, a Toro part on any Carrack, a named Carrack part on
 * that Carrack only, a Panokseon part on the Panokseon.
 */
export function fitsShip(part, ship) {
	if (part.startsWith('Bartali Sailboat:')) return ship === 'Bartali Sailboat';
	if (part.startsWith('Epheria: Old')) return /^(Improved )?Epheria (Sailboat|Frigate)$/.test(ship);
	if (part.startsWith('Epheria Caravel:')) return ship === 'Epheria Caravel';
	if (part.startsWith('Epheria Galleass:')) return ship === 'Epheria Galleass';
	if (part.startsWith('Epheria Carrack: Toro')) return /^Carrack \(/.test(ship);
	const carrack = /^Epheria Carrack: (Advance|Balance|Volante|Valor)/.exec(part);
	if (carrack) return ship === `Carrack (${carrack[1]})`;
	if (part.startsWith('Panokseon:')) return ship === 'Panokseon';
	return false;
}

/** The stats a part gives at a level, or null when it is not a part we know. */
export function statsAt(part, level = 0) {
	const p = partStats[part];
	if (!p) return null;
	return p.levels[Math.max(0, Math.min(10, level))] || null;
}

/** What the next level adds over this one -- the reason for an attempt. */
export function gainAt(part, fromLevel) {
	const a = statsAt(part, fromLevel);
	const b = statsAt(part, fromLevel + 1);
	if (!a || !b) return null;
	const out = {};
	for (const k of STAT_KEYS) {
		const d = (b[k] || 0) - (a[k] || 0);
		if (d) out[k] = Math.round(d * 100) / 100;
	}
	return out;
}

const LABEL = {
	speed: ['speed', '%'], accel: ['accel', '%'], turn: ['turn', '%'], brake: ['brake', '%'],
	dp: ['DP', ''], drr: ['damage reduction', '%'], weight: ['weight', ' LT'], rations: ['rations', ''],
	durability: ['durability', ''], damage: ['cannon damage', ''], hits: ['hits', ''], reload: ['reload', ' s faster']
};

/** "speed +1%, DP +2, 250 LT" -- a stat bag said out loud, deltas signed. */
export function describeStats(stats, { signed = true } = {}) {
	if (!stats) return '';
	const bits = [];
	for (const k of STAT_KEYS) {
		const v = stats[k];
		if (!v) continue;
		const [name, unit] = LABEL[k];
		const n = Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(v);
		bits.push(k === 'hits' ? `×${n} hits` : `${name} ${signed && v > 0 ? '+' : ''}${n}${unit}`);
	}
	return bits.join(', ');
}

/** Add stat bags together; a hull's own numbers can go in first. */
export function sumStats(...bags) {
	const out = {};
	for (const b of bags) {
		if (!b) continue;
		for (const k of STAT_KEYS) if (b[k]) out[k] = Math.round(((out[k] || 0) + b[k]) * 100) / 100;
	}
	return out;
}

/**
 * The best part you hold for each slot of a hull, and their sum.
 *
 * "Best" is the highest-tier family and then the highest level, which
 * is also how the game's own fitting window orders them. Stock is the
 * plain `{ item: qty }` table; enhanced parts are "+N Name". `families` is
 * enhancement.js's part -> table map, which is what ranks the tiers.
 */
export function loadout(ship, stock, families = {}) {
	const RANK = { yellow: 5, chiro: 4, 'caravel-blue': 4, toro: 3, 'caravel-green': 3, epheria: 2, sailboat: 1 };
	const best = {};
	for (const [item, qty] of Object.entries(stock || {})) {
		if (!qty) continue;
		const m = /^\+(\d+)\s+(.*)$/.exec(item);
		const level = m ? Number(m[1]) : 0;
		const base = m ? m[2] : item;
		if (!partStats[base] || !fitsShip(base, ship)) continue;
		const slot = slotOf(base);
		if (!slot) continue;
		const rank = (RANK[families[base]] || 0) * 100 + level;
		if (!best[slot] || rank > best[slot].rank) best[slot] = { part: base, level, rank, stats: statsAt(base, level) };
	}
	const total = sumStats(...SLOTS.map(s => best[s] && best[s].stats));
	return { slots: SLOTS.map(s => ({ slot: s, ...(best[s] || {}) })), total };
}
