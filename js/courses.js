// Courses: sailing loops the community has already worked out, drawn on
// the chart as a line to follow rather than a route to plot.
//
// A barter route is built stop by stop from what you are short of; a
// course is the opposite -- a fixed loop that exists because of what
// lives along it. The one here is the Snuggle Sailies Route from gpw's
// Black Desert Ocean Map v1.4: the sea-monster dailies loop. Velia to
// the Balenos islands, Oquilla's Eye, west across the Ross Sea to
// Lekrashan, north through the Margoria wrecks to the Saltwater
// Crocodile grounds, and back down the current to Oquilla's Eye.
//
// Points are in the chart's world space (the same one barter_npcs.js
// uses). Islands and wrecks are the codex positions of the people who
// stand there; the open-sea turns were read off the community map and
// fitted to those anchors, so they sit within about a thousand units
// -- half an island -- of where the line was drawn.

export const courses = [
	{
		id: 'ssr',
		name: 'Snuggle Sailies Route',
		sub: 'the sea-monster dailies loop, from the community ocean map',
		note: 'Young sea monsters for the guild dailies on the way out; Nineshark, Candidum and Black Rust off Oquilla’s Eye; the crocodile grounds in the far north for the weekly. Twenty youngs on the loop covers the Monster Increase Report.',
		points: [
			{ name: 'Velia', x: 69152, y: 69120 },
			{ name: 'Baremi Island', x: 69343, y: 60614 },
			{ name: "Rabbit's Pass", x: 78795, y: 61688 },
			{ name: 'Iliya Island', x: 74893, y: 60562 },
			{ name: 'Tinberra Island', x: 77864, y: 51088 },
			{ name: "Oquilla's Eye", x: 64400, y: 47000, stop: true },
			{ x: 55754, y: 50048 },
			{ x: 43068, y: 50860 },
			{ x: 23708, y: 47823 },
			{ name: 'Lekrashan', x: 19717, y: 37997, stop: true },
			{ name: 'Popo (Old Moon carrack)', x: 33948, y: 28948 },
			{ name: 'Heracio (adrift vessel)', x: 40189, y: 22992 },
			{ name: 'Saltwater Crocodiles', x: 48595, y: 17689, stop: true },
			{ name: 'Pakio (combat raft)', x: 55120, y: 25866 },
			{ name: "Oquilla's Eye", x: 64400, y: 47000 },
			{ name: 'Narvo Island', x: 61554, y: 60679 },
			{ name: 'Velia', x: 69152, y: 69120 }
		]
	}
];

export const courseById = Object.fromEntries(courses.map(c => [c.id, c]));
