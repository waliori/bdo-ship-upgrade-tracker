// What the app was checked against, and when; and what changed.
//
// A live game moves under a tool like this. The dates here are the
// ones the data files themselves carry, gathered so Help can show them
// in one place, and the changes are the ones a player would notice.

export const DATA = [
	{ what: 'Barter catalogue — 91 barterers, Levels 1–7', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Barterers’ positions on the chart', asOf: '2026-08-30', from: 'client positions, within a pixel' },
	{ what: 'Sea monster spawn points', asOf: '2026-08-30', from: 'BDOCodex; the Lyngbakr Habitat of 2026-08-27 from the patch note' },
	{ what: 'Quests and their rewards', asOf: '2026-08-30', from: 'BDOCodex' },
	{ what: 'Ship hulls — durability, weight, speed…', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Ship parts at every level', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Enhancement rates and Agris caps', asOf: '2026-08-25', from: 'BDOCodex, BDFoundry' },
	{ what: 'The yellow tier (Falasi, Cheongun)', asOf: '2026-08-26', from: 'patch notes, BDOCodex' },
	{ what: 'Crow Coin Shop prices', asOf: '2026-08-25', from: 'the shop at Oquilla’s Eye' },
	{ what: 'Falasi’s prices', asOf: '2026-08-25', from: 'Port Epheria' },
	{ what: 'Parley rates and discounts', asOf: '2026-08-29', from: 'the Barter Information window' },
	{ what: 'Vell’s timetable (EU, NA)', asOf: '2026-08-30', from: 'mmotimer.com' },
	{ what: 'Sea crystals — 287 variants and the Nols', asOf: '2026-08-31', from: 'BDOCodex' },
	{ what: 'Central Market prices', asOf: 'live', from: 'the community market API, per region' }
];

export const CHANGES = [
	{
		date: '2026-08-30',
		title: 'quests as a checklist, a Today strip, and a route that says how long',
		notes: [
			'Claimed quests stay ticked until the reset; filter by what is still to do, what you need, or one reward.',
			'The Plan carries the resets, Vell’s next spawn on your servers, and the pace each build is moving at.',
			'Every leg of a route shows its length and minutes at your hull’s real speed; Parley is budgeted and the route can be trimmed to it.',
			'Routes are kept by name and travel in a link; a ruler measures the sea; the game’s coordinates sit under the pointer.',
			'Ctrl+K finds anything; the digits switch tabs; a trip’s loot goes in through one box; each item can note where it is kept.',
			'Profiles: separate saves on one browser for an alt or a what-if.'
		]
	},
	{
		date: '2026-08-30',
		title: 'the route on the game’s own map',
		notes: [
			'A route or a hunt can be written into the world map as favourites or as one of its three navigation loops, bent round the land.',
			'Chromium writes the file directly with a backup; everyone else gets the block to paste.'
		]
	},
	{
		date: '2026-08-29',
		title: 'the whole sea on the chart',
		notes: ['The chart reaches every coast; ten coastal barterers from the April patch; sea monster grounds and community courses on the Hunt tab.']
	},
	{
		date: '2026-08-26',
		title: 'the yellow tier',
		notes: ['Falasi and Cheongun parts, with the level-dropping failure rule, Cron Stones and failstacks in the forecast.']
	}
];

export const LATEST = `${CHANGES[0].date}:${CHANGES[0].title}`;
