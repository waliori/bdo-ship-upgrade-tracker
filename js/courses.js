// Courses: sailing loops the community has already worked out, drawn on
// the chart as lines to follow rather than routes to plot.
//
// A barter route is built stop by stop from what you are short of; a
// course is the opposite -- a fixed loop that exists because of what
// lives along it. These three are the legs of the Snuggle Sailies Route
// from gpw's Black Desert Ocean Map v1.4, the sea-monster dailies loop,
// each switchable on its own.
//
// Points are in the chart's world space (the same one barter_npcs.js
// and sea_monsters.js use). Islands and wrecks are the codex positions
// of the people who stand there; the hunting grounds are the centre of
// the codex's spawn points for that monster; the open-sea turns were
// read off the community map and fitted to those anchors, so they sit
// within about a thousand units -- half an island -- of where the line
// was drawn.

const VELIA = { name: 'Velia', x: 69152, y: 69120 };
const OQUILLA = { name: "Oquilla's Eye", x: 64400, y: 47000, stop: true };
const LEKRASHAN = { name: 'Lekrashan', x: 16416, y: 37893, stop: true };

export const courses = [
	{
		id: 'balenos',
		name: 'Balenos islands loop',
		sub: 'Velia round the islands to Oquilla’s Eye and back',
		note: 'The dailies close to home: young sea monsters and Hekaru for the soldier at Oquilla’s Eye, the delivery quests to Narvo, Baremi and Tinberra on the way. Goldmont ships patrol the middle of it.',
		points: [
			VELIA,
			{ name: 'Narvo Island', x: 61554, y: 60679 },
			OQUILLA,
			{ name: 'Tinberra Island', x: 77864, y: 51088 },
			{ name: 'Iliya Island', x: 74893, y: 60562 },
			{ name: "Rabbit's Pass", x: 78795, y: 61688 },
			{ name: 'Baremi Island', x: 69343, y: 60614 },
			VELIA
		]
	},
	{
		id: 'lekrashan',
		name: 'Ross Sea loop to Lekrashan',
		sub: 'west from Oquilla’s Eye, home on the current',
		note: 'Nineshark, Candidum and Black Rust grounds west of Oquilla’s Eye for the Old Moon Guild hunts; Lekrashan itself at the far end. The way back rides the fast current north-east past the Margoria wrecks.',
		points: [
			OQUILLA,
			{ x: 55754, y: 50048 },
			{ x: 43068, y: 50860 },
			{ x: 23708, y: 47823 },
			LEKRASHAN,
			{ x: 27900, y: 38700 },
			{ name: 'Harus (wandering merchant)', x: 46874, y: 30982 },
			OQUILLA
		]
	},
	{
		id: 'crocodile',
		name: 'Crocodile run',
		sub: 'the northern detour through the wrecks',
		note: 'Off the current at Pakio’s raft, north to the Saltwater Crocodile grounds for the weekly, then down the chain of wrecks -- Lantinia, Heracio, Popo -- to Lekrashan.',
		points: [
			{ name: 'Pakio (combat raft)', x: 55120, y: 25866 },
			{ name: 'Saltwater Crocodiles', x: 48825, y: 13918, stop: true },
			{ name: 'Lantinia (combat raft)', x: 43212, y: 26893 },
			{ name: 'Heracio (adrift vessel)', x: 40189, y: 22992 },
			{ name: 'Popo (Old Moon carrack)', x: 33948, y: 28948 },
			LEKRASHAN
		]
	}
];

export const courseById = Object.fromEntries(courses.map(c => [c.id, c]));
