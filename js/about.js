// What the app was checked against, and when; and what changed.
//
// A live game moves under a tool like this. The dates here are the
// ones the data files themselves carry, gathered so Help can show them
// in one place, and the changes are the ones a player would notice.

export const DATA = [
	{ what: 'Barter catalogue — 91 barterers, Levels 1–7', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Barterers’ positions on the chart', asOf: '2026-08-30', from: 'client positions, within a pixel' },
	{ what: 'Sea monster spawn points', asOf: '2026-08-30', from: 'BDOCodex; the Lyngbakr Habitat from in-game bookmarks, 2026-08-31' },
	{ what: 'What islands paid on your runs', asOf: 'live', from: 'your own record, from the Barter tab’s checklist' },
	{ what: 'The ship-material board — four whole boards', asOf: '2026-09-05', from: 'the barter window, read off screenshots of four refreshes; how often each offer is up comes from these' },
	{ what: 'The trade-good list — forty layouts', asOf: '2026-09-18', from: 'a community sheet kept by RENGEREL, 465 refreshes since 2026-04-16; refetched after the patch of 17 September moved a slot on layout 31' },
	{ what: 'What each island deals, and the barter count each exchange needs', asOf: '2026-09-18', from: 'the game client’s own barter table, read after the 17 September patch' },
	{ what: 'Monster ground markers — 32 of them', asOf: '2026-09-14', from: 'the game’s own world map: the client’s habitat icons, position and all' },
	{ what: 'Wharf managers — the full roll, 58 of them', asOf: '2026-08-31', from: 'BDOCodex NPC pages' },
	{ what: 'Cox Pirates’ camps, flags and cargo ships', asOf: '2026-08-31', from: 'Awabi’s “The Road to Cox” map, fitted to the chart on its island names' },
	{ what: 'Vell’s waters', asOf: '2026-09-14', from: 'the game’s own world map icon; it stood 2.8 km away when it came off a community map' },
	{ what: 'The Hollow Maretta’s rings — 38 of them', asOf: '2026-09-13', from: 'gpw’s ocean map v1.6, laid on the chart by the spawn marks it shares with the codex — within ten units' },
	{ what: 'Quests and their rewards', asOf: '2026-08-30', from: 'BDOCodex' },
	{ what: 'Ship hulls — durability, weight, speed…', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Ship parts at every level', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Ship appearance sets — Benelois (crafted), Oquilla Carrack Overlay (pearls)', asOf: '2026-09-01', from: 'BDOCodex item and design pages, per slot' },
	{ what: 'Enhancement rates and Agris caps', asOf: '2026-08-25', from: 'BDOCodex, BDFoundry' },
	{ what: 'The yellow tier (Falasi, Cheongun)', asOf: '2026-08-26', from: 'patch notes, BDOCodex' },
	{ what: 'Crow Coin Shop prices', asOf: '2026-08-25', from: 'the shop at Oquilla’s Eye' },
	{ what: 'Falasi’s prices', asOf: '2026-08-25', from: 'Port Epheria' },
	{ what: 'Parley rates and discounts', asOf: '2026-08-29', from: 'the Barter Information window' },
	{ what: 'What Total Barters adds to an exchange — the six bands', asOf: '2026-09-14', from: 'the game client’s own variedtradecount table' },
	{ what: 'Vell’s timetable (EU, NA)', asOf: '2026-08-30', from: 'mmotimer.com' },
	{ what: 'Sea crystals — 287 variants and the Nols', asOf: '2026-08-31', from: 'BDOCodex' },
	{ what: 'Central Market prices', asOf: 'live', from: 'the community market API, per region' }
];

/**
 * Releases, as a player would tell them.
 *
 * CHANGES below is the working diary -- one entry a day, in the words of
 * whoever wrote the code. This is the other thing: what actually arrived
 * between one version of the app and the next, written for someone who
 * has been away. The What's New dialog reads it, and CHANGELOG.md is
 * generated from it by tools/build-changelog.mjs, so the two can never
 * drift apart.
 *
 * A section with `media` is a headline: the dialog shows its picture.
 * The rest are folded away behind "everything else", and printed in
 * full in the file.
 *
 * `sum` is the one line an older release is worth to someone who was
 * not here for it: what changed, in the words a player would use, no
 * feature names and nothing technical. The What's New dialog carries
 * every release below the current one, each shut, each showing only
 * its `sum` until it is opened.
 *
 * `thanks` names the players who asked for what is in the release, in
 * their own words. It is a field of its own rather than a section
 * because it must not be foldable: a person who wrote in and then had
 * to open "everything else" to find themselves has been thanked in a
 * drawer.
 */
export const RELEASES = [
	{
		id: '1.4',
		name: 'The screenshots you already took',
		date: '2026-09-19',
		sum: 'Screenshot your storage or the barter window and the app reads it; every layout has a page in a book, with what the fleet has seen; and a run no longer sends you to buy what the Market has none of.',
		blurb: 'Typing a storage in slot by slot is the dullest hour this app ever asked of anyone, and the game has been drawing it for you all along. '
			+ 'So now <b>a screenshot is an entry</b>: a storage window becomes counts, a barter window becomes today\u2019s board. '
			+ 'The boards themselves got <b>a book of their own</b> \u2014 all forty layouts, what the fleet has read of them, and the ones nobody has on file \u2014 and a barter run finally asks the Central Market <b>whether there is anything to buy</b> before telling you to buy it.',
		thanks: {
			text: 'Three players are in this one. Two of them asked; the third keeps the record the whole Barter tab stands on.',
			who: [
				{
					name: 'GloriousMadness',
					said: 'One other thing I was looking at was OCR cuz i\u2019m too lazy to manually input my inventories & barter exchanges',
					did: 'Not lazy \u2014 right. Both of them are <b>read off a screenshot</b> now: a storage into counts, the barter window into today\u2019s board.'
				},
				{
					name: 'Oni',
					said: 'some item can be buy from CM, but some is a zero at stoke \u2026 but it not chek that items on CM or not',
					did: 'The run priced a land good at its last sale and never asked whether any were for sale. It asks now: <b>a run buys only what the Market has</b>, and a chain that cannot start is not one you can tick. His screenshot also turned out to be in another font, which is why the reader now knows all of them.'
				},
				{
					name: 'RENGEREL',
					said: 'they changed the one tear from dallae pier that might not show up to the butterfly which is always there \u2026 that should all be correct now',
					did: 'The keeper of the community\u2019s layout sheet, who had it updated before the patch was a day old. The game\u2019s own files agree \u2014 one byte of them \u2014 and <b>layout 31</b> is right in the app because of it.'
				}
			],
			foot: 'The box is under <b>Menu \u2192 Feedback</b>. It reaches whoever runs the site.'
		},
		sections: [
			{
				title: 'A storage reads itself',
				media: 'docs/media/small/read-a-storage.gif',
				alt: 'Two screenshots of a storage read into a table, each count beside the corner of the slot it was read off',
				text: 'On the Inventory, <b>Read a storage</b> takes screenshots of the game\u2019s storage window \u2014 a crop or the whole screen \u2014 and comes back with a line for everything the app keeps a count of.',
				points: [
					'The slots are found by the spacing of their own borders, so <b>any resolution and any UI scale</b> read alike; each icon is matched against the five hundred the app carries, and one it is not sure of is left out rather than named wrong.',
					'The counts are read by <b>a small network taught on four hundred thousand made-up slots</b> \u2014 the game\u2019s own fonts over the app\u2019s own icons \u2014 and on no real ones. On five real screenshots from two players, 457 of 458 slots read right and none wrong that it was sure of.',
					'<b>Every line keeps the corner of its slot beside it</b>, so a count is checked at a glance; one the reader is unsure of is marked \u26a0.',
					'<b>Scroll and shoot again</b>: the rows two screenshots share are found by their pictures and counted once.',
					'Nothing is written until you press the button, and what it writes is one change, with one Undo.'
				]
			},
			{
				title: 'So does the barter window',
				media: 'docs/media/small/read-the-window.gif',
				alt: 'A screenshot of the barter window read into six islands, and the board settling on a layout',
				text: '<b>Read the window</b> on the Barter tab answers every island in a screenshot at once. Six rows are usually enough to settle which of the forty layouts the sea is on.',
				points: [
					'Each row is matched against the exchanges <b>that island is known to deal</b>, so a name the window cut short is as good as a whole one and a misread letter cannot invent an offer.',
					'A row two exchanges fit equally well is a list to pick from, not a guess.',
					'The islands paying ship materials go to the material list, since those roll on their own.'
				]
			},
			{
				title: 'The layout book',
				media: 'docs/media/small/the-layout-book.gif',
				alt: 'The shelf of forty layouts, a board in no record, and a layout opened out level by level',
				text: '<b>\ud83d\udcd6 The layout book</b>, on the board bar: every layout on file as a card, how often the record and the fleet have each seen it, and the boards sailors have read that are in no record at all.',
				points: [
					'A card opens into the whole board \u2014 a tile an island, the goods drawn, a tab a level \u2014 marked where it agrees with what you saw today and where your barter count has not opened an exchange.',
					'A board nobody has on file says who read it, how many others saw the same, and <b>the layout it is nearest to</b>: parting at a slot or two is a layout the game has edited; parting at twenty is a slip.',
					'<b>Yours</b> shows the boards you have been dealt, commonest first \u2014 the app writes a board down by itself when it is settled \u2014 and the Community tab adds them up fleet-wide.',
					'Where sync is on, a reading goes up with its reader\u2019s name on it, if they are shown by name on the community boards and not otherwise.'
				]
			},
			{
				title: 'A run buys only what the Market has',
				media: 'docs/media/small/a-dry-chain.gif',
				alt: 'A chain whose first land good the Central Market has none of, greyed and saying why',
				text: 'With land goods <i>bought ashore</i>, a run is held to what the Central Market actually has listed.',
				points: [
					'A chain whose first good nobody is selling <b>cannot be ticked</b>: its card is greyed and says <i>none on the Central Market</i> on its own face.',
					'Where you hold a good part-way up the same climb, the card <b>starts from that instead</b>, and the shore is struck out among its starts with the reason.',
					'Where you keep the land good yourself it offers <i>from my storage</i>; and <i>Before casting off</i> shows how many are listed beside each thing to buy.',
					'The Market is asked again every half hour while the page is open.'
				]
			},
			{
				title: 'An island shows something else',
				text: 'Once a board is settled, <b>\u270e An island shows something else\u2026</b> is the one door for everything the record can get wrong. Name the island, pick what its window shows from everything it is known to deal, or say it shows nothing.',
				points: [
					'Islands whose exchange is above your barter count are greyed, with the count that opens them: a blank window there is the game, and not news.',
					'If what you saw fits one layout everywhere but an island or three, <b>the board is that layout with those islands as you saw them</b>, and the run is planned on it.',
					'<b>Telling the fleet is offered only then</b>, or when nothing fits at all. A reading that matches a layout on file is not news.'
				]
			},
			{
				title: 'What the game\u2019s own files had to say',
				text: 'The client\u2019s barter table ships with the app now, and three things came out of reading it properly.',
				points: [
					'<b>Layout 31\u2019s Dallae Pier takes the Stuffed Morpho Butterfly</b> since the patch of 17 September, not the Statue\u2019s Tear.',
					'The barter count each exchange needs is known for <b>3,002 of 3,004 rows</b>, up from 2,917 \u2014 the client files some [Level 5] goods under another name, which had been hiding them.',
					'The islands missing from a layout in the community\u2019s record are not gaps: the game shuts them on that layout <b>to everyone</b>. The ten rows that really were missing are filled in, and marked.'
				]
			}
		]
	},
	{
		id: '1.3',
		name: 'The day the sea will actually give you',
		date: '2026-09-15',
		sum: 'The board now matches what your own barter count can really trade, and the app will plan your whole day of quests as one loop.',
		blurb: 'Two things the app was guessing at, and it turns out the game says both of them out loud. '
			+ 'A board is no longer everybody’s board — it is <b>the one your barter count can actually sail</b>, read from the game\u2019s own table. '
			+ 'And a day of dailies and weeklies is no longer a list to work out for yourself: it is <b>one loop</b>, with a ground picked for every hunt, the kills added up, and nothing hunted after the man who pays for it.',
		thanks: {
			text: 'One player wrote in, twice, about the same thing. He was right both times.',
			who: [
				{
					name: 'Zelpha',
					said: 'rolled layout 5, i have the luivano/duch/randis chains but the other 3 arent available … picked eveto having liquor>urn but mariveno for example has nothin',
					did: 'Not his luck: the game gates <i>each exchange</i> on its own barter count, and the app was drawing a board for an account that had unlocked everything. That is <b>the board you can sail</b>.'
				}
			],
			foot: 'The box is under <b>Menu → Feedback</b>. It reaches whoever runs the site.'
		},
		sections: [
			{
				title: 'The board you can sail — not everyone else’s',
				media: 'docs/media/small/your-own-board.gif',
				alt: 'The board bar saying how many islands the barter count leaves out, and the list of them',
				text: 'An island can be open to you while the one thing it is offering today is not, and its barter window is then simply blank. The board now leaves those out and says so.',
				points: [
					'The counts are the game’s own, baked out of the client: <b>every exchange has its own total</b>, not every island.',
					'At <b>150</b> barters a board is short 32 islands of 84; at <b>1,082</b>, 20; past 20,000, none.',
					'The bar says how many are left out and <b>what opens the next one</b>, and will list them with the offer each is showing.',
					'Where the client ships no row — two tiers it leaves out — you can still say <b>“it will not trade with me”</b> and that island leaves the board until your next unlock.'
				]
			},
			{
				title: 'Today’s errands — the whole day as one loop',
				media: 'docs/media/small/todays-errands.gif',
				alt: 'The errands panel: a call a line, what to kill and how many, and the loop drawn on the chart',
				text: 'Every daily and weekly you have not done, in the order that sails shortest. On the chart’s <b>Grounds</b> tab: pick a harbour, press the button.',
				points: [
					'A hunt is a <b>choice of grounds</b> — the Hekaru have four — and the one that suits the rest of the day wins.',
					'<b>Seven Black Rust</b>, not one and two and four: the kills at a call are added up, and the hand-ins at one wharf are one call.',
					'A ground is <b>never called at after the man who pays for it</b>.',
					'The Old Moon Guild lets you do one of its four hunts a day, so it takes the one whose species a weekly already wants — the same kill paying twice.',
					'The three quests that ask for young sea monsters take <b>any</b> young one, so they ride on whatever young ground the loop already passes.'
				]
			},
			{
				title: 'A call you can take hold of',
				media: 'docs/media/small/a-call-in-hand.gif',
				alt: 'A call opened: every quest done there, what it wants, what it pays, and the ways out of it',
				text: 'Press a step and the chart flies there and the call opens — every quest done at it, with what it wants, where it hands in and what it pays.',
				points: [
					'A way through to <b>its row on the Quests tab</b>, and a way to <b>drop it</b>.',
					'Dropping is not ticking off: the quest is not worth the detour <i>today</i>, so the loop is worked out again without it, and the panel says what was put aside and offers it back.',
					'<b>Draw it</b> puts the loop on the Draw tab as a trace — named, keepable, shareable as a link.',
					'<b>On the game’s map</b> writes it as bookmarks, numbered in sailing order and named by the work: <i>12: 7x Black Rust</i>.'
				]
			},
			{
				title: 'Hunt where the monsters are',
				text: 'A habitat marker is a caption. The game’s world map draws one icon per named ground, placed where the words want to sit — and the app was steering for it. The Black Rust marker is the better part of <b>ten kilometres</b> from the nearest Black Rust; the Ocean Stalker’s is five, the Nineshark’s three and a half.',
				points: [
					'A ground is now the middle of a cluster of the species’ <b>own spawn points</b>.',
					'And a ground is water, not a point, so the call is put on the part of it the loop passes — and slides along it once the order is settled.'
				]
			},
			{
				title: 'The crocodiles are where the crocodiles are',
				text: 'The Lyngbakrs drove the Saltwater Crocodiles off that ground on 27 August, and the run in the Courses list was still pointing at it. It calls at their water off Cheongsa now, and is <b>shorter</b> than it was.',
				points: [
					'The Lyngbakr ground is a course of its own: out and back from Gangman’s wharf, where its weekly is handed in.'
				]
			},
			{
				title: 'A quest wears its own picture',
				text: 'The icon BDOCodex draws beside each quest, on the Quests tab and small wherever else a quest is named. Twenty-three pictures for thirty-nine quests, which is the point — every Ravinia letter is one picture, every Old Moon Guild hunt another, so a long day’s list sorts itself by the kind of work in it.'
			},
			{
				title: 'And the release notes keep the old ones',
				text: 'This window now carries every release before this one, shut, each worth a line until you open it — for anyone who has been away longer than a week.'
			}
		]
	},
	{
		id: '1.2',
		name: 'What a day is for',
		date: '2026-09-14',
		sum: 'A day at sea can now be for four different things, and a clock that tells you when the ship is home.',
		blurb: 'A day at sea had one shape: climb as high as the board goes, sell the top, count the silver. '
			+ 'It has four now — <b>silver</b>, <b>a stock</b>, <b>Crow Coins</b>, <b>a material</b> — and the run is counted in whatever the day was for. '
			+ 'Around them a clock that follows you out of the harbour, a sheet that says a thing once, and the bug that made “build the stocks” look mad.',
		thanks: {
			text: 'Five players wrote in. One of them wrote most of this release.',
			who: [
				{
					name: 'Oni',
					said: 'just wanna fill storage first. Have all 72 type of base matterial ready … the is any way to build road to fill all low lvl and storage them?',
					did: 'That is <b>A stock</b>. The word that made it a goal rather than a setting is <i>sell</i>: a run that sells nothing cannot be scored in silver.'
				},
				{
					name: 'Oni',
					said: 'can u add timer? that u can click and it start count time and make a sound like microwave when don’t xD bcs sometime I forget that I send a ship to route',
					did: 'That is <b>the clock</b> — and the two windows he asked for an hour later are <b>the shelves</b> and <b>Today’s boards</b>.'
				},
				{
					name: 'Zelpha',
					said: 'grabbing 16 marine helms for a barter that only has 6 trades available … it gives a comically large number for the hold before dumping it all back in',
					did: 'Not misusing the site: <b>two bugs</b>, and the second was hiding the first. Both in <i>Put right</i>.'
				},
				{
					name: 'Fraul and RENGEREL',
					said: 'can set run for cc? — crow coins?',
					did: 'That is <b>Crow Coins</b>, the fourth kind of day.'
				},
				{
					name: 'Yuki',
					said: 'Does it have the siren spawns? I can’t find an option for it in map',
					did: 'It does now: the <b>Hollow Maretta</b>, and an ocean map read by its own marks rather than fitted by hand.'
				}
			],
			foot: 'The box is under <b>Menu → Feedback</b>. It reaches whoever runs the site.'
		},
		sections: [
			{
				title: 'A stock — a day that is not for silver',
				media: 'docs/media/small/a-stock.gif',
				alt: 'The stock sheet: a target a level, a ceiling, and how many days it takes',
				text: 'Say the pile you want. Nothing is sold, the climbs stop where you say, and the run is scored on what it banks.',
				points: [
					'A target is <b>per good</b>, and the row says what it comes to: thirty at Level 2 is thirty of each of the fourteen.',
					'It is a floor as well, so the rule is one line: <b>fill a level before you climb from it</b>.',
					'<b>Climb no higher than</b> — a [Level 4] you already hold is stock, not fuel.',
					'<i>1,517 goods short · 76 more runs · about 19 days · 56 storage slots.</i>',
					'The shore goods can come from <b>your own pile</b> rather than the Market, and a way of running can be <b>saved under a name</b>.'
				]
			},
			{
				title: 'Crow Coins — the fourth kind of day',
				media: 'docs/media/small/crow-coins.gif',
				alt: 'A run for Crow Coins: the chains that cash a Level 4, counted in coins',
				text: 'Every board has ten to fourteen islands paying in coins, and they take a [Level 4] and nothing else. So a coin run is a climb to four, cashed in.',
				points: [
					'Scored in coins: <i>the most coins</i>, <i>the most an hour</i>, <i>the most a Parley unit</i>.',
					'And it says what they are for: <i>3,715 this run · 17,600 short of the 19,600 your builds want · 5 more runs like this one</i>.'
				]
			},
			{
				title: 'The clock — a bell at every stop',
				media: 'docs/media/small/the-clock.gif',
				alt: 'The clock started on a run, counting to the next stop',
				text: 'Sail this run starts it at that run’s own estimate. It counts up, and rings at every stop rather than only at the end.',
				points: [
					'A <b>ship’s bell</b>: a pair struck as each stop comes up, eight bells when the run is done. Made, not fetched — it works offline.',
					'The stops carry <b>your own pace</b>: seconds for bartering and going on, seconds for a wharf or a quest.',
					'Ticking a stop off <b>re-bases the rest</b>, so a slow island does not make the whole run chime early.',
					'And it reaches <b>every device signed in to your account</b> — the phone in a pocket, with the tab shut.'
				]
			},
			{
				title: 'The run sheet — two shelves, and one list',
				media: 'docs/media/small/two-shelves.gif',
				alt: 'Load before casting off, and in the storage after',
				text: 'What to load, and what is in the storage after, tiled the way the game’s own window is. Everything that used to be said twice is said once.',
				points: []
			},
			{
				title: 'Today’s boards',
				media: 'docs/media/small/todays-boards.gif',
				alt: 'Every run since the refill, what it loaded and what it brought back',
				text: 'Every run recorded since the refill: what it loaded, what it came back with, and the day’s totals across the Parley bar.',
				points: [
					'What it will <b>not</b> do is guess the next board. A refresh deals a different layout, and the panel says so.'
				]
			},
			{
				title: 'Put right',
				text: '',
				points: [
					'<b>A chain loaded the whole storage</b> — sixteen helms for an island with six trades in it, ninety-seven thousand LT in a hull that carries eleven, and the rest put back at the first wharf. It loads what the first rung can take now.',
					'<b>A floor was measured against the hold</b>, so “keep forty” meant <i>carrying</i> forty before you could spend one. It counts the pile now, wherever it is kept.',
					'<b>Notifications did nothing on a phone.</b> They go through the service worker, and where they cannot work the button says why.',
					'<b>Vouchers are a choice</b>, and go in as soon as the run needs one and a whole quarter fits — which starts the two-hour cooldown as early as it can be started.',
					'<b>“Build the stocks” is now “Sell the top, keep a floor.”</b> It sells; the floors are there so that selling does not strip the pile.',
					'The hold bar is <b>two columns</b> — what the hull carries, what there is to spend — with a real way into the hold.'
				]
			},
			{
				title: 'The chart — the siren, and a map read rather than traced',
				text: 'The <b>Hollow Maretta</b> is a habitat with its portrait and its thirty-eight ringing spots. The ocean map behind them is no longer fitted by hand: the crosses are found by their glow and the transform solved for — twenty world units to the pixel, landing within half a pixel on 325 marks.',
				points: []
			},
			{
				title: 'And the app has a name',
				text: '<b>Sailor’s Log.</b> <i>BDO Ship Upgrade Tracker</i> described what it did in its first week. It plans parts, quests, barter routes and the sea itself.',
				points: []
			}
		]
	},
	{
		id: '1.1',
		name: 'The plan, and the sea you can actually reach',
		date: '2026-09-11',
		sum: 'The app stopped listing your options and started telling you what to do next — and stopped sending you to islands you have not unlocked.',
		blurb: 'Two players asked for the two big things in this one, and both asks turned out to be the same complaint from different ends: the app knew a great deal and left the deciding to you. '
			+ '<b>To Get</b> now says how each thing <i>should</i> be got rather than only how it can be — one route through everything left, in the order it is done — and every barter plan is cut to the islands your own <b>total barters</b> have opened. '
			+ 'Around those: the chart <b>stands up</b> on the game’s own terrain, the barter forecast counts how often the offer is really on the list, a crew reads off your own screenshots, the numbers about you — the nest of Bos’n Jacks among them — are typed once and read everywhere, and the boards keep up with your save.',
		thanks: {
			text: 'Four players wrote in. Two of them set the shape of this release; two more put right things the app had wrong — a barter slot the game had quietly changed, and a nest of birds it was not counting at all. Every one of the four was a better question than the ones being asked inside. Thank you.',
			who: [
				{
					name: 'Kristofer',
					said: 'it would be really convenient if, after you input what you currently have, it could suggest the most efficient way to obtain the remaining resources … it tells you how each <b>can</b> be obtained, but a logic to suggest how each remaining resource <b>should</b> be obtained would be fantastic.',
					did: 'That is the whole of <b>the way to get it</b>, and the word <i>should</i> is what sent it after the places the sources compete rather than after a longer list.'
				},
				{
					name: 'Zelpha',
					said: 'I wanna use the barter planning page but I’m only at 480 total barters, it would be nice if I could put that in somewhere and it’d limit the routes based on what I have available.',
					did: 'That is <b>the barter count deciding which islands exist</b> — and it was worth more than a filter: fifteen of the forty recorded boards’ chains climb through an island 480 barters cannot reach, so that page had been quietly wrong for everyone below the thresholds.'
				},
				{
					name: 'RENGEREL',
					said: 'They did change the octagonal box from my combo 16 in grandiha to a statue’s tear. Not sure when they did that, but must have missed it. Next maint they should be changing the tear in my combo 31 at dallae pier … also 7A, just finally got the wandering merchant trade',
					did: 'That is a <b>layout drifting</b>, and it is the one way this record goes wrong: the game edits a single slot at a maintenance and leaves the layout’s number alone, so the island and the reward still match and only the good the slot eats has moved. A stale give is worse than a missing one — the board rules a layout out on an island that disagrees, and one wrong row can leave a real refresh unnamed. The record was refetched the same day, 444 refreshes now where it had 420, and both of his were already in it: Sabnipu at <b>Grándiha</b> on layout 16 eats a <i>Statue’s Tear</i> for the same Moonlit Crystal Lamp, and <b>7A</b> has the Wandering Merchant’s row at last — a Green Salt Lump for Crow Coins, at the barterer three thousand barters opens. The fetching tool carries an override now for a change reported before the sheet has it, and says at every run which of its entries the sheet has caught up with. Gangdalpo at <b>Dallae Pier</b> on layout 31 is the one being watched for.'
				},
				{
					name: 'NatSoFun',
					said: 'is there a way to a[dd] pet weight stats for boat, its showing I got 200 less weight than I’m supposed to have … I was thinking maybe I take off one of my sailors but the boat speed would drop',
					did: 'There was not, and the app was wrong for it. <b>Bos’n Jack</b> is the one pet in the game whose talent is ship weight — <i>Big Ship Inventory Weight</i>, fifty LT a tier, stacking across the five pets the game lets out at once — so a hold was short by the whole nest, and two hundred is exactly what one tier-4 bird carries. The birds are in the bar now with the rest of the numbers about you — and the second half of what he wrote is the reason it mattered: he was about to unseat a sailor, and pay for a wrong number in speed.'
				}
			],
			foot: 'The box is under <b>Menu → Feedback</b>: something wrong, an idea, or something else, with the section and the build attached. It reaches whoever runs the site.'
		},
		sections: [
			{
				title: 'To Get — one route through what is left, in the order you do it',
				media: 'docs/media/small/the-plan.png',
				alt: 'The plan: where it lands, what it costs, and the steps in order',
				text: 'To Get answered “where does this come from?” for every line and left “so what do I do?” to you. '
					+ 'The trouble is that the sources compete: a Candidum daily pays fourteen Tidal Black Stones <i>or</i> one Violent Wave Plywood and never both, '
					+ 'the Crow Coins spent on plywood are not there for the tendons, and two materials off the ship-material list wait on the same three draws a day. '
					+ 'Read one line at a time, every material’s best answer is “buy it”. Read together, the purse runs out and the answer changes. '
					+ 'So the first view of To Get reads the whole list at once and gives every thing <b>one</b> way, with its reason on the line.',
				points: [
					'It reads as <b>numbered steps in the order they are done</b> — run these quests, take these as quest rewards, buy at the Crow Coin Shop, barter for these at sea, hunt these, and on down to what has no rate at all — because the quests pay the coins that buy the shop’s half, and buying first empties the purse before the quests come round. Each step says where it happens, carries its own total, and folds away when you are done with it.',
					'Where the plan lands and every dial that moved it there are <b>one card</b>: <i>done in seven days</i>, the thing that sets that pace, the coins and silver it wants against what you can spare, and how many things across how many steps.',
					'It follows a <b>goal you state</b>, because what is scarce is yours to say and not the app’s to decide: <b>Soonest</b> spends the purse wherever it buys days, <b>Keep the coins</b> spends them only where nothing else sells the thing, <b>Keep the silver</b> leaves the Central Market alone. Beside them, how many days a week you are at sea, and coins you keep back that the plan will never spend.',
					'Three switches for <b>what you are actually willing to do</b>: the dailies and weeklies, bartering, and <i>hunt what drops</i>. The last takes every dropped material off the shopping list and never claims a rate for it, because none is published anywhere — on a two-part Carrack that is the difference between forty-three days and thirty.',
					'The quests are <b>errands</b>, not a list of names: how often, where it is done, the reward to take with its picture, the coins it pays — and when a pick-one was a real choice, what it was chosen over and why the other one is got another way. <b>Make it my pick</b> remembers it, so Claimed on the Quests screen records that reward in one press, and the Quests screen says the same thing beside a quest whose remembered pick differs.',
					'<b>What this plan will never do</b> is a line you can open, and it describes <i>this</i> plan rather than the idea of one: the rules in force right now, including the ones your own orders added.',
					'Every row names the ways the plan <b>could not put a number on</b> — what drops it, the worker node, the bulk exchange, the shop it did not use. Khan’s Tendon read as “nothing else sells it” beside a price, which is true of shops and false of Khan, and that is how somebody ends up buying a thing they could have killed for.',
					'The old reading is one chip away as <b>Every way</b>, and Copy and Copy as CSV follow whichever is showing. The Plan’s <b>Next</b> line names today’s first quest and what to take off it.'
				]
			},
			{
				title: 'Barter — only the islands your count has opened',
				text: 'The game opens the trade routes as your total barters climb: 150 opens Shipwrecked Haran’s Cargo Ship, 600 Lantinia’s Combat Raft, 3,000 the Wandering Merchant’s Ship. '
					+ 'The app knew that table only well enough to print what the next threshold unlocks, and planned everything as though all ninety-one barterers were open to everyone. '
					+ 'On the forty recorded boards, fifteen chains climb through an island a sailor at 480 barters cannot reach — and Tear of the Ocean is dealt at exactly one barterer, the one that opens at three thousand. '
					+ 'Your count is part of every plan now.',
				points: [
					'The join is the patch note’s own words: <i>opens</i> names a place and the chart says who stands there, so <b>twelve barterers are gated at the twelve counts the note states</b> and nothing is guessed. The seventy-nine it never names — the coastal [Level 6] and [Level 7] dealers among them — are open from the first day.',
					'What is behind a door is <b>said, not hidden</b>: the chains on the Barter tab sit locked and untickable under the ones that are yours, with a line above saying how many and what opens them; so do a material’s island chips and the islands the board question offers. The Map still draws the island and its card says what opens it, but no pin is lit there for something on your list.',
					'A forecast folds through the islands you can actually reach — a rung dealt in two places is priced at the open one — so where none is open the answer is the door itself: <i>locked, 2,520 more barters open the Wandering Merchant’s Ship</i>.',
					'<b>The whole table</b> is one press away, from the bar and from that line: every threshold, the island it opens and its barterer, ticked where it is already yours.',
					'<b>Nought barters is a real answer</b>, not a missing one. A sailor who has never bartered has the three routes the game starts them with and no more, and the app plans on that — so the bar asks for the number until it is given.'
				]
			},
			{
				title: 'Barter — how often the offer is really there',
				text: 'Every barter figure in the app assumed that what you want is on the list every time you draw it. It is not, and it is not a rounding error: '
					+ 'of the four whole ship-material boards recorded, a Saltwater Crocodile’s Scale exchange was on <i>one</i>. '
					+ 'A hundred of them read as five days where the boards say about eleven, and a plan wanting four materials off one list quietly assumed all four turned up, every day. '
					+ 'The forecast now reads both records that ride with the barter table — those four complete boards, and the forty trade-list layouts seen across four hundred and twenty refreshes — and paces every rung by how often it was actually there.',
				points: [
					'The old figure survives as the floor, with the sample named beside it: <i>about 11 days, 5 if the offer is always up · on 1 of the 4 boards recorded</i>.',
					'What is measured is <b>presence</b>, not how many islands showed it, so the change can only ever lengthen a forecast and never shorten one. A thing on every board recorded reads exactly as it did.',
					'Anything <b>no board has recorded</b> keeps the old best-case number and says so on the row, rather than passing it off as measured.',
					'Your own material-board diary is deliberately left out of the arithmetic: it records where a thing was and never where it was not, and a sample with no absences in it cannot measure absence.',
					'<b>A layout is not frozen.</b> The game edits one island’s slot at a maintenance and leaves the layout’s number alone — the island and the reward stay, only the good the slot eats changes — and a record that has not caught up is worse than no record, since the board rules a layout out on an island that disagrees. The forty layouts were <b>refetched</b>, 444 refreshes deep now: layout 16’s Grándiha slot takes a Statue’s Tear, and 7A carries the Wandering Merchant’s row that was missing from it. The tool that fetches them holds a correction for a drift reported before the sheet has it, and says at every run which of them the sheet has caught up with.'
				]
			},
			{
				title: 'The sailor — the numbers about you, typed once',
				text: 'The barter count, your level, the Parley, the vouchers and the Value Pack were entered on To Get — the one screen that is not about the sea — '
					+ 'with a second copy of two of them on the Barter tab and Sailing Mastery off on the Ship tab, all of them read everywhere. '
					+ 'They are <b>the sailor</b> now: one group beside the pouch, in the strip that follows you from tab to tab, typed once and read by every plan. '
					+ 'Folded, that group still says the lot — <i>4,205 barters · Master 5 · 3+3 draws · NA</i> — and one press opens the fields.',
				points: [
					'<b>The nest of Bos’n Jacks is part of the hold.</b> It is the one pet talent in the game that is ship weight — fifty LT a tier, stacking across the five the game lets out at once, and a tier 5 set as your Alpha carries 250 — so a sailor with five of them was being told a limit two hundred to a thousand LT under the one the game shows. It counts on the Epheria line, the Carracks and the Panokseon, and on nothing smaller: a Cog, a rowboat and the Bartali are not Big Ships, and the game does not pay them either. Five slots and six tiers, one press a bird and one for all five, and the whole nest lands as a single change.',
					'<b>The region belongs to the sailor</b>, not to a screen. Every Market price in the app is quoted in one region’s silver and Vell’s times are read off it, and it used to be set from a select inside one summary card. It is a chip in the bar now, with how old the prices are beside it and a refresh that says so.',
					'<b>On a phone the strip is one line.</b> Nine chips will not fit across 390 pixels, so the row scrolled sideways and half of it was a swipe away. A phone gets the reading — what is held, in red what is short, and the barter count — on a single line, and pressing it opens <b>Carrying</b> as a sheet where every field has the width of the screen.',
					'<b>How many sailors are out</b>, in the masthead, and beside it the crew — the accounts that have ever signed in. The first counts the browsers with the tracker open this minute. It needs no sign-in and keeps no address: a random token the browser makes for itself and two timestamps, which is why it says browsers rather than people.'
				]
			},
			{
				title: 'Ship — a crew read off your own screenshots, in any language the game is played in',
				text: 'Open Manage Sailors in game, screenshot it — or crop the Selected Sailor panel, either reads, and a mixture of both is fine — and drop the lot in. '
					+ 'Names, levels, condition and every growth come back in a table to check before a single thing is written, and a sailor already on the roster is brought up to date rather than hired twice.',
				points: [
					'<b>It reads every language the game runs in.</b> Say which one yours is and the reader speaks it: 식성 and 생활 물자 and Требуется кают are labels like any other, and a Cyrillic or Hangul or Han name comes back as the name. The Latin services read on the model already aboard; Русский, 日本語, 한국어, 中文, 繁體中文 and ภาษาไทย each fetch a megabyte or two more, once, the first time you pick them.',
					'Under the words is something none of the fifteen change — the weight carries LT, the condition is a pair over a slash, and the eight growths sit in the same order whatever they are called. So a label the scan could not make out costs nothing: the figure is still the fifth down the column, and a screenshot in a language nobody here can check still reads.',
					'It matters because the growths are the one thing the app could never estimate its way round. A levelled sailor rolls inside a hidden band, so a crew was worth its <b>average</b> roll and the ship’s speed came out under the game’s — 196.4% against 198.1% on a full Carrack, all of it in the crew. Read in, the rolls are the game’s and so is the number.',
					'The <b>ten per cent off Parley</b> is no longer a tick. It is Cleia’s skill and nothing else, so it is read off who is sitting at the First Mate seat: aboard, the Bartering line says so and names her; hired but ashore, it says what seating her would be worth.'
				]
			},
			{
				title: 'Ship — what a boat is for',
				text: 'Every hull now says what it is for, which the game’s own numbers never do: the Advance for bartering (the biggest hold, and a run pays by what it carries), '
					+ 'the Volante for speed, the Valor and the Panokseon for sea monsters, the Balance for not choosing. '
					+ 'It is on the ship card and in the picker — where searching “barter” finds the barter hulls — and the crystal picker marks the crystals that suit each.',
				points: [
					'<b>Auto assign asks what the boat is for.</b> It used to add up the growths a seat doubles and take the biggest sum, which is a question nobody asked: the Sail doubles Endurance and Wits together, so a sailor with 1.1 speed and 4.8 acceleration beat one with 3.9 and 1.5, and the ship lost five per cent of its speed while the arithmetic said it had gained. It lays out every goal now and seats the crew for the one you pick.',
					'The <b>sailor list sorts by any growth</b> — Endurance, Wits, Awareness, Strength and the four cannon ones — as well as by type, condition and level, and the growth it was ordered by is shown on every card. Finding the fastest of eighteen sailors meant opening them one at a time before.'
				]
			},
			{
				title: 'Map — the chart, stood up',
				media: 'docs/media/small/stand-it-up.gif',
				alt: 'The chart leaning over onto the game’s own terrain, and painted both ways',
				text: 'The chart has always drawn the sea from directly overhead, which is the right way to read a route and the wrong way to read a coast. '
					+ 'The game’s own 3D map is not a picture anyone can copy — the client builds it on the graphics card every frame — but the terrain it is built <i>from</i> is in your own installed client, one mesh per 12,800-unit sector, '
					+ 'on exactly the grid the flat chart’s squares are cut on. So the chart can be stood up: <b>⛰</b> on the zoom bar leans it over and puts the real ground under the sea.',
				points: [
					'It is the <b>same chart</b>, not a second one. The same centre, the same zoom, the same barterers, wharves, habitats, traces and plotted loop — every one of them placed by the camera now instead of by the flat scaling, so they sit on the ground rather than beside it, and the switch either way lands on the water you were already looking at.',
					'<b>The world curves away</b> towards a hazed horizon, the way the game’s own map does and the way a planet does — it is what makes it read as a world rather than a diagram, and the pins, the route and the traces all bend with it.',
					'The ground <b>wears the chart’s own squares</b>: the islands are the colours you know, with the relief of the actual terrain under them. <b>Neon</b> draws contour lines over dark water instead, the way the game’s own world map does, and the interval widens as you step back so the lines stay lines.',
					'<b>Shift-drag leans and turns it</b>, an ordinary drag takes hold of the water and carries it, and <b>Level</b> puts you straight back overhead facing north. Where you left it is where it opens next time.',
					'The terrain is cut into the same kind of pyramid as the tiles — the far view draws a few hundred tiles instead of thirty thousand, and the closest zoom draws <b>the mesh the game itself draws from</b>, vertex for vertex. Tiles travel packed, a few kilobytes each, with the chart’s own thread of light along the top edge while they are coming — and <b>Keep this area offline</b> keeps the ground with the squares, so a crossing with no signal still has islands in it.'
				]
			},
			{
				title: 'The guide — seven chapters, narrated, and shot against the app as it is',
				text: 'The film was one thirteen-minute run at the whole app. It is <b>seven chapters</b> now, each a file of its own with its own subtitles and transcript, '
					+ 'and it plays inside the app under <b>Help</b> with the seven listed as jump-to points — so the answer to “how does a run work?” is ninety seconds in, not a scrub through a film. '
					+ 'Whatever is being named is lit on screen as it is said.',
				points: [
					'<b>To Get has a chapter of its own</b>, because it is a planner now and not a list: the goal, the days a week you actually sail, the coins held back, what you are willing to do at all, and the day count moving under every one of those choices.',
					'The Yard opens on <b>the sailor’s numbers</b> and types them in, since the barter count decides which islands will deal with you at all and a plan made before it is given is a plan for somebody else’s account. The Map chapter leans the chart over onto the terrain, and the Ship chapter reads a crew off the game’s own screenshots.',
					'None of it is a mock-up: every frame is the real app being driven, and the only invented thing anywhere in it is the handful of sailors on the community boards, since a machine shooting a film has no deployment with players on it. Every picture in the README was re-shot the same way.'
				]
			},
			{
				title: 'Community — boards that keep up, and say how they count',
				text: 'What the boards show about you is worked out from the copy the server holds, and that copy is redrawn within seconds of a save reaching it — '
					+ 'so a ship fitted, a sailor hired or a run logged is on the boards by the time you walk to them. '
					+ 'Before, a change waited on the boards’ own window, and a card once opened never changed at all.',
				points: [
					'Signing in puts you <b>on the boards by name</b> rather than leaving it to whoever went looking for the switch. The tab says so the first time you open it, <b>Leave the boards</b> is one press from there, and leaving is remembered — signing in again does not put you back. You can still be shown as an unnamed sailor, and what would be shared is still listed before you agree.',
					'Every board says <b>how it is counted</b>: a “?” opens the rule in full, and Best ship shows the sum behind the number — <i>hull 4,000 + parts 194 + crystal 20</i> — for the top of the board and for your own row.',
					'<b>The room the app was written for has a door now.</b> Discord stands in the masthead beside Help — the sailing server where the routes, the crew builds and what a patch moved are actually worked out, and where three of the four corrections in this release came from. On a phone it keeps its mark and drops the word.',
					'Your <b>fleet and your inventory are one fleet</b>. Keeping a setup puts its hull in the Inventory if none was recorded there, and a hull in the Inventory is a ship in your fleet, listed, sailable and counted on the boards, whether or not a setup was ever named for it.'
				]
			},
			{
				title: 'The yard — buying with coins, and a count that keeps itself',
				text: 'The app knew what a thing costs at Oquilla’s Eye and knew how many coins you held, and still made you do both halves of the sum by hand.',
				points: [
					'Every Crow Coin line on <b>To Get</b>, and every coin-priced thing in the <b>Inventory</b> panel, carries a <b>Buy</b>: it asks how many, says what that costs and what is left of the purse, records the goods in and the coins out as one change, and opens on what the purse can actually cover. A sum that does not work is said rather than quietly clamped.',
					'<b>Total Barters follows the runs you sail.</b> The count that opens the next trade route was typed once and then left to rot while the app watched the very trades it counts go by. Recording a run adds its trades to it in the same change as the goods and the silver, so one Undo takes back all of it, and a run that carries you past a threshold says which route it opened. It is still a field you can type over.'
				]
			},
			{
				title: 'Put right',
				text: 'Things that were wrong, and are not now.',
				points: [
					'<b>A hold barters to seventy per cent over its limit, not a quarter.</b> The islands deal right up to the point the hull stops moving, so there is no band where you can sail but not trade. The old figure came from one session in which a 27,000 LT hold seemed to refuse past about 34,000 — which is what a quarter over looks like, and is why it was believed. Chains that were cut short climb further for it, and material runs that were split into several departures go out in one.',
					'A <b>named first mate</b> has no growths of their own. The app credited each of the three half a point of speed, acceleration, turn and brake, which the game’s own panel shows none of, and fed them 100 rations a day where they eat 150.',
					'<b>Best ship</b> was <code>hull tier × 100 + enhancement levels</code>, which rated a +10 green Toro cannon exactly as highly as a +10 yellow Falasi one — three quite different Carracks all landed on 440 and shared first place. A slot is worth its part’s set first and its enhancement second.',
					'Ticking a stop <b>Done</b> on the Map’s run sheet no longer throws the list back to the top — on a nineteen-stop run that was a scroll back down every single time.',
					'The <b>hold bar</b> no longer prints its weight over its own second line, and the parley controls no longer run 613 pixels wide inside a 390-pixel screen.',
					'On a run’s checklist the <b>fourth</b> of an island’s four [Level 7]s can be tapped: the chips ran wider than the column and the last one sat under the hold beside it, taking every click aimed at it.',
					'Writing a route into <code>gameVariable.xml</code> keeps the untouched original aside as <code>.orig</code> and never writes it again. Before, the second write copied the first write’s output over the only backup.',
					'Two setups kept in the same moment are two setups; they shared an id before, and the second quietly replaced the first.',
					'Setting a nest of pets was <b>twenty presses and twenty saves</b>: each bird was a button stepped round its six tiers, and every step wrote the save, added an entry to the history and redrew every screen that plans against the hold. That is where the lag came from. The editor holds a draft and lands it in one change.',
					'On the chart, <b>Ground, Neon and Level shared a row with the step player</b> whenever a route was plotted — at twelve hundred pixels as well as on a phone — and the two-finger twist turned the chart against the fingers.',
					'A stored digest from an older build is <b>worked out again</b> rather than left standing, so a scoring change does not leave half a board wearing its old number.'
				]
			},
		]
	},
	{
		id: '1.0',
		name: 'The yard and the sea',
		date: '2026-09-07',
		sum: 'The first release: the chart, the barter runs, the quests and the ship, added to the yard that was already here.',
		blurb: 'The yard was here already: one inventory, the builds that draw on it, the Workshop and the shopping list. This release adds '
			+ 'the sea you cross to pay for it — a <b>Map</b> with every barterer on it and the loop through them timed at your own hull’s speed, '
			+ 'a <b>Barter</b> tab that plans a run on today’s board and sails it on the chart, the <b>Quests</b> the ocean hands out free, '
			+ 'the <b>Ship</b> you sail it in, and a <b>Community</b> harbour — and the yard picks up what the sea brings back.',
		sections: [
			{
				title: 'Map — a chart of the sea, with your shopping list on it',
				media: 'docs/media/small/map.png',
				alt: 'The Map, a pin for every barterer holding something on the list',
				text: 'A new tab. The <b>Map</b> is the To Get list drawn on the game’s own chart. Every pin is one of the 91 barterers, '
					+ 'holding something you are short of; open one and it says what it hands over, how many exchanges are left '
					+ 'and what the parley costs at your own Barter level.',
				points: [
					'All 91 barterers, Levels 1 to 7, on the game’s own tiles, placed from client positions to within a pixel; the chart zooms from the whole sea to an island’s rooftops.',
					'One strip of switches — <i>On the chart</i> — says what is drawn: barterers, monster habitats, the 58 wharf managers, guild wharves, island names, your own traced routes.',
					'Monster habitats stand at the centre of each species’ spawns, kept to open water, each with its picture from the codex, and a ground switched on is drawn as its water.',
					'Two community maps are fitted to the chart on their island names: Awabi’s <i>Road to Cox</i>, and Vell’s waters from gpw’s ocean map.',
					'A ruler measures any two points, with the game’s own coordinates under the pointer, and a minimap you can drag out of the way.',
					'The sea’s clocks sit over the chart: the time to the daily, weekly and barter resets, and when Vell is next up on your servers.',
					'<b>Keep this area offline</b>: the tiles of the view you are on, a level either side, kept in a store the cache never sweeps.'
				]
			},
			{
				title: 'Map — a loop that says how long it takes',
				media: 'docs/media/small/chart-the-loop.gif',
				alt: 'Plotting a barter loop; every leg gets a distance and a time',
				text: 'Plot the loop through everything you are short of and every leg comes back with its length and its minutes '
					+ '— bent round the land, at the speed <i>that</i> hull actually makes with those parts and those sail seats.',
				points: [
					'What 100% is in metres the game never says, so a time is a range: a fifth either way around the chart’s 11 m/s estimate, a tenth once you have timed a leg and told it.',
					'The <b>rations</b> aboard drain over the route at an estimated rate; the Route tab says the stop they run low after and puts a rations call in at the nearest wharf manager. An overweight leg sails slower, and its minutes say so.',
					'Parley is budgeted at one trade a stop or at every attempt the offer allows; the stops past what your bar covers are marked, and a button trims to them.',
					'A leg the router could not bend round the land is drawn dashed and red and named in the panel, never a straight line through an island passed off as a course.',
					'Routes are kept by name, a replaced one is kept as the previous, and a route travels in a link or a small JSON file.',
					'<b>Put it on the game’s map</b> writes the stops into your own world map as favourites, or as one of its three navigation loops, the untouched file kept beside it — and the game’s map comes the other way, its bookmarks and loops landing on the chart.'
				]
			},
			{
				title: 'Map — draw a route the list cannot express',
				media: 'docs/media/small/draw-a-route.gif',
				alt: 'Three stops, a freehand line and a word, drawn straight onto the sea',
				text: 'Click the sea for a numbered stop, drag to sketch a line, or type a word straight onto the water. '
					+ 'Every mark is a place on the chart, so it all pans and zooms with the tiles.',
				points: [
					'Eight inks, three pen widths, three sizes of writing, a shaded area, and an undo that walks back through stops, strokes and words in the order they were made.',
					'Legs bend round the land like a barter route’s, and a stop dropped on a headland steps off into the water beside it.',
					'A trace is kept by name and travels in a link or a file; twenty live on a shelf, and <b>Browse all</b> opens a library with a search over names, notes and the words written on them.',
					'A kept trace can be a <b>lane</b>: every route near it is drawn along it and timed as the game sails it.'
				]
			},
			{
				title: 'Map — a drawing in a link',
				media: 'docs/media/small/share-a-drawing.gif',
				alt: 'Three stops, a line and a word named and copied as a link; opened on another save, the chart flies to the drawing',
				text: 'A drawing is a thing to hand round. <b>Copy link</b> puts the whole trace — stops, notes, line and words — into one address; '
					+ 'whoever opens it gets the chart flown to the drawing, on any browser, with nothing to install and nothing of their own touched.',
				points: [
					'The link carries the drawing itself, not a pointer to it, so it works for someone who has never opened the app before.',
					'A trace taken in from a link is on the water like one drawn here: to draw on, keep by name on the shelf, lay over the chart with its eye, or send on again.',
					'The same drawing goes into the game’s own world map as favourites, and out as a small JSON file for a guild’s records.'
				]
			},
			{
				title: 'Barter — a run planned on today’s board, and sailed on the chart',
				media: 'docs/media/small/plan-a-run.gif',
				alt: 'Answering what one island shows; the whole board follows, a run is laid out, and Sail this run draws it on the Map',
				text: 'A new tab. The trade-goods barters are not rolled island by island: every refresh the whole sea shows one of forty fixed layouts. '
					+ 'So the <b>Barter</b> tab asks what one island is showing — tap it from that island’s possible offers — and the whole board follows: '
					+ 'every chain the day allows, listed by how far it reaches and what it pays, and the ones ticked are one run.',
				points: [
					'The hold is <b>what is aboard</b>, weighed against the ship as fitted and the ceiling the islands still deal under; goods ashore are listed by harbour with a Load button.',
					'The <b>sailing orders</b>: cash out today or build the stocks, which levels a wharf sells, land goods on or off, a cap on time under way — and three paces: <i>fast</i> keeps under the limit with no calls, <i>full</i> does every attempt and leaves the surplus at a wharf before the hull slows, <i>full, loaded</i> takes the hold to the barter ceiling.',
					'<b>Runs worth sailing</b>: a search over the board’s chains proposes the most silver, the most an hour and the most a Parley unit; one tap lays a run out.',
					'Or a run for <b>a material</b>: one route through every island ticked, the harbour a give is kept at called at before the first island that needs it, and what to have before casting off named — bought ashore, brought from another storage, or got first.',
					'The <b>quests come along</b>: handed in where the run passes anyway, a stop put in for a taker a short way off, a hunt given a stop at its grounds; the barter quests are counted off the run’s trades.',
					'<b>Sail this run</b> draws the route on the Map and the chart’s panel becomes the run sheet: the trades, the hold and the Parley after each stop, the wharf calls, Done stepping on to the next stop. Saying what an island paid re-counts the rest, and <b>Record the trip</b> puts the whole of it in the Inventory as one undoable change.',
					'What islands paid goes into your own record, and the runs worth sailing are worked out off the page, in a worker with a budget of a second and a half.'
				]
			},
			{
				title: 'Quests — what the sea hands out free',
				media: 'docs/media/small/quests.png',
				alt: 'The Quests screen, grouped by how often each comes round',
				text: 'A new tab. Every quest that pays in a ship material, grouped by how often it comes round, with the ones paying in '
					+ 'something your plan still wants marked. Claiming puts the reward in stock and ticks the quest until its own reset.',
				points: [
					'Tick several and <b>Finish</b> records them together as one undoable change.',
					'A pick-one reward is remembered, so the next claim takes the same one in a single press.',
					'Keep a set you run every day as a named group, star the ones that matter, and filter by what is still to do, what your plan wants, or one reward in particular.'
				]
			},
			{
				title: 'Ship — the other half of a ship',
				media: 'docs/media/small/fit-a-ship.gif',
				alt: 'A Carrack with two of its parts on; typing in the Sailing Mastery moves every number',
				text: 'A new tab. The <b>Ship</b> screen carries every hull in the game’s own numbers and fits it out as five slots — the four '
					+ 'parts and the sea crystal — each taking the best you already hold, or one you choose.',
				points: [
					'All 287 sea crystals from Eltro to Rusalka, plus Ebenruth’s Nol and the Oceanteared Nol, chosen by grade with the effect beside the name.',
					'A crew planned against the hull’s seats and cabin space: contracts, condition, food, first mates, and the certificates on the shopping list; a sailor’s real numbers can be typed in and are judged against the band their level can hold, and a log of the levels reached tells a fast grower from a slow one.',
					'Your Sailing Mastery counts toward speed, acceleration, turn and brake; the hold reads as a sum of lines, and says how far past its limit the hull will still sail.',
					'Keep a whole fit-out as a named <b>setup</b> and switch between them here or from the Map, where the route is timed.'
				]
			},
			{
				title: 'Ship — your build in a link',
				media: 'docs/media/small/share-a-ship.gif',
				alt: 'Copy link on the Ship tab; opened on an empty save, the link says what the ship is, lists its parts, and one press makes it yours',
				text: 'The hull, its four parts, the crystal, the roster and who sits where, in one <b>Copy link</b>. Opened at the other end it says whose ship it is '
					+ 'and what is on it, marks each part you already hold, and offers <b>Make it my ship</b> — or queues the missing parts as builds, so the Plan prices the way to it.',
				points: [
					'Looking costs nothing; taking it replaces that hull’s parts and seats and your roster, and one Undo takes it back.',
					'A sailor’s typed numbers travel with the roster, so a crew someone has measured is the crew you get.',
					'On the Community tab a place on the Best ship board opens the same way: that sailor’s boat stood up on the Ship tab, to look at and not to keep.'
				]
			},
			{
				title: 'Community — the harbour',
				media: 'docs/media/small/community.png',
				alt: 'The hall of fame: sixteen boards, with your own places at the head of it',
				text: 'A new tab, where there is sign-in: sixteen boards — mastery, the best ship, the best sailor, the most silver from runs, '
					+ 'the most monsters hunted, the luckiest at the anvil and the rest — and the fleet in numbers: the hulls most sailed, the parts most fitted, '
					+ 'the islands most plotted, the quests most done.',
				points: [
					'Only the sailors who take part are on it, by name or as an unnamed sailor, and what would be shared is shown before anyone agrees.',
					'A place on a board opens what it is about: the Ship tab stood up on that sailor’s boat, to look at and not to keep, one press back to yours.',
					'The profile keeps a <b>tally</b> of the career — quests claimed, runs sailed, things made, attempts at the anvil; Undo takes a count back with the thing it counted.',
					'<b>Menu → Feedback</b>: something wrong, an idea, or something else, with the section and the build attached; it reaches whoever runs the site.'
				]
			},
			{
				title: 'The yard — what the sea brings back to it',
				text: 'The Plan, the Inventory, the Workshop and To Get are as they were, with what the new tabs feed them: '
					+ 'a <b>Today</b> strip on the Plan with the quests still open that pay in something on your list, the time to the daily, weekly and barter resets, '
					+ 'when Vell is next up on your servers, and the pace each build has been moving at.',
				points: [
					'Anything the Central Market sells is priced from the Market itself, per region, and the app says how old the number is; the last prices a browser saw stay on hand offline.',
					'Vell’s EU and NA timetables, correctable where they are shown, with a reminder a quarter of an hour before — by push, where the deployment has a key pair.',
					'The trophies the sea monsters drop are in the book: a Usable Pirate Ship’s Remains chops into a Deep Tide-Dyed Standardized Timber Square, a Khan’s Tendon dries into ten Moon Vein Flax Fabric, ten Broken Cannons or two hundred seals make a Cox Pirates’ Artifact. The plan still buys those unless you switch one to <i>Craft it</i>, since the shop is the road and the trophy a side door.',
					'The small craft too: a Cog two ways, three rowboats and a raft.',
					'Every kind of item has a <b>home</b>: an item’s count is what is in your bags plus every storage you have noted it at, a trade good is never in the bags, and new goods can land at Iliya instead.',
					'<b>Redo</b> beside Undo; Import asks whether to replace or merge, keeping the higher count of anything counted twice; exports are dated; the shopping list copies as <b>CSV</b> and prints legibly on white.',
					'A field guide behind one quiet dot: the game’s own windows, so a number here can be traced to the screen it came from.'
				]
			},
			{
				title: 'Around the app',
				text: 'Every section sits in a <b>dock</b> across the top of a wide screen, the icon over the name; on a phone four sit at the thumb and the last slot opens the menu. '
					+ 'That <b>Menu</b> — <kbd>M</kbd> on the keyboard — is the one menu the app has: every section, Find, the trip log, Undo and Redo, your save, the help and the settings.',
				points: [
					'<b>Find</b> on Ctrl+K (or <kbd>/</kbd>): an item opens in the Inventory’s panel, a tab opens; the digits 1–9 switch tabs, <kbd>0</kbd> the tenth.',
					'<b>Log a trip</b> records everything you brought back in one box, as one undoable change.',
					'<b>Profiles</b>: separate saves on one browser, for an alt or a what-if; the Map’s routes and traces and the Barter tab’s board and run belong to the profile, so they export, sync and switch with it.',
					'Every choice the app asks for goes through one picker: pictures, a fact beside each name, a search that ranks a name starting with your letters first.',
					'The address bar names the tab and the open item, so a place survives a reload, travels in a link, and Back retraces your steps.',
					'Quantities read the way your browser writes them, and item look-ups open BDOCodex in any of twelve languages.',
					'A <b>light theme</b>, under Menu → Theme, that follows the system when asked. One phone query, so a phone on its side gets the phone’s shell — and on the Map, the chart — instead of the desktop’s header eating the screen.',
					'Hit areas of forty pixels under a finger; the faint inks lifted to read against the ground; the bottom sheets clear a phone’s gesture bar; a name on every search box, a state on every filter, a name on every dialog; Escape shuts the menus.',
					'A thing done is answered with a small burst of light where the tap landed — a soft glow instead when motion is asked to keep still.'
				]
			},
			{
				title: 'What the save keeps',
				text: 'A build’s route choice, the sort and the filters on the Plan and the Inventory, each tab’s place on the page — all kept across a reload.',
				points: [
					'A <b>named route</b> is never dropped to make room for “Previous route”, which has a slot of its own; a ninth asks which to replace.',
					'The undo history remembers only the fields a change touched and is trimmed to a budget in bytes; a write the browser refuses is said out loud, with <b>Export now</b> beside it, and a save that will not parse is copied aside before anything is written over it.',
					'An import says which names this version does not know. A link travels slim, says how long it is, and warns when a chat would cut it.',
					'The game file’s <b>Restore</b> puts the old block back byte for byte, whatever Version the client writes, BOM kept; the file from before the first write stays beside it as <code>gameVariable.xml.orig</code>.'
				]
			},
			{
				title: 'Underneath',
				text: 'None of this is visible, and all of it is why the rest works.',
				points: [
					'Every screen is its own module; the planner stays pure, and each screen is a projection of it.',
					'Offline, the app runs from a snapshot of one deploy — never a mixture of two; a newer deploy installs behind the page and waits for the next visit.',
					'The barter catalogue is served as data rather than as script, and everything heavy travels compressed; the tiles are told to be kept for a year by every cache on the way.',
					'The tour’s library is vendored, so the page needs no CDN and the CSP can stay shut.',
					'<code>/healthz</code> says whether the database answers; push subscriptions go only to the real push services; an Origin check on every write; a schema version and a runner for the next change; <code>npm run backup</code> and <code>restore</code>.',
					'The Market relay spends at most twenty-five seconds on a call and answers the rest from the copy it holds.',
					'A test suite of 561, run on every push, covering the cost model, the sync API and the client in a real browser.'
				]
			},
			{
				title: 'The tour, and the film',
				text: 'The guided tour walks the new sections as well as the yard, pointing at each thing on your own screen, and the walkthrough film goes on '
					+ 'from the yard to the sea and the harbour — a run on today’s board, sailed on the chart. Neither is a mock-up: '
					+ 'they drive the real app, so a screen that changes makes them wrong until they are shot again.'
			}
		]
	}
];

/** The release this build is; what the What's New dialog is keyed on. */
export const RELEASE = RELEASES[0].id;

export const CHANGES = [
	{
		date: '2026-09-18',
		title: 'The screenshots you already took are the fastest way to tell the app anything',
		notes: [
			'<b>A storage reads itself.</b> The Inventory takes a shot of the game\u2019s storage window \u2014 a crop, or the whole screen with it open \u2014 and comes back with a line per thing the app counts. The slots are a square lattice, found by the spacing of their own borders, so any resolution and any UI scale read alike; each is then matched against the five hundred icons the app already carries, and one that looks nearly as much like the runner-up as like the best is <i>left out</i> rather than named wrong. Several shots are one storage and their slots add up, so a warehouse four screenfuls deep is one go and one undoable change.',
			'<b>And the counts are read by a small network, taught on slots nobody had to label.</b> No OCR engine is fetched for a storage at all \u2014 an engine is the wrong tool for eight-pixel writing over a drawing, and so, it turned out, were templates of the game\u2019s figures: a template is one rendering, and the same window captured by a desktop that scales its screen is another. A stack of 103 over a crate came back as 1,103, because the edge of the crate really is an upright. What reads it now is what reads house numbers off street photographs: a convolutional network run along the whole line and trained with CTC, so nothing has to say where one figure ends and the next begins. It was taught on four hundred thousand <i>made-up</i> slots \u2014 the game\u2019s own fonts, pulled out of the client, over the app\u2019s own icons, then blurred, rescaled and recompressed every way a screenshot gets \u2014 and on no real ones, which is what makes the real ones a test. <i>Fonts</i>, because which face draws the counts depends on the client\u2019s language: a reader taught only the English client\u2019s Strong Sword took another player\u2019s 656 for 555, so it is taught every face the client ships. Five real screenshots off two players\u2019 setups, 458 slots: <b>457 read right and none wrong that it was sure of</b> \u2014 the one it missed has a mouse pointer lying across the figure, and it said so. Shrunk, doubled, blurred or recompressed there is still next to nothing it is wrong and sure about; what gets harder to read gets marked, not guessed. Fifty thousand weights, ten milliseconds a slot, plain JavaScript. Every line keeps the corner of its slot beside it, so a count is checked at a glance; a reading the network is not sure of is written in as its best and marked \u26a0.',
			'<b>Scrolled shots are one storage.</b> Shoot a screenful, scroll, shoot again, and the last row of one is the first row of the next \u2014 which used to count twelve crystals as twenty-four. The rows two shots share are now found by their pictures, named or not, and counted once; the table says how many. A row of one thing repeated is not taken as proof, because two rows of dynamite look exactly like one row shot twice. The last row of a storage is no longer lost, whether to faint borders round its bare slots or to falling just past where the window was first looked for.',
			'<b>The barter window reads itself too.</b> <i>Read the window</i> on the Barter tab answers every island in a screenshot at once, matched against the exchanges the codex says that island deals \u2014 so <code>[Level 5] Faded Gold Dra...</code> is as good as the whole name, a name that wrapped under the Parley cost is picked up where it broke off, and a row two exchanges fit equally well is a list to pick from rather than a guess. Six rows off one shot usually settle which of the forty layouts the sea is on. The islands paying ship materials go to the material list instead, since those roll on their own.',
			'<b>And one player\u2019s reading is everybody\u2019s board.</b> A board is the same for everyone on a server until the refill, so a reading can now be told to the fleet \u2014 with the reader\u2019s name on it, where they are shown by name on the community boards and not otherwise. The bar says what others have read of today\u2019s board and how many have since seen the same; taking their reading answers every island they named and tells them so. It is also the answer to <b>no layout shows that</b>: the record the app ships is a snapshot, the game edits a slot at a maintenance without renumbering anything, and a board nobody has on file is the one worth passing on.',
			'<b>The layout book.</b> The readings had a line under the board bar and nowhere to be looked at, so they have a view of their own now: <i>\ud83d\udcd6 The layout book</i> opens every layout on file as a card \u2014 drawn with the land goods its [Level 1] islands are asking for and the goods its coin islands will take, which is what differs from board to board \u2014 with how often the record has seen it and how often the fleet has. Above them are the <b>boards nobody has on file</b>: who read each, how many others saw the same, and the layout it is nearest to, because parting from one at a slot or two is a layout the game has edited and parting at twenty is a slip. A card opens into the whole board, island by island with the goods drawn, marked against what you saw today and against your barter count; search finds a layout by an island, a good or its number. Readings are kept two months for it.',
			'<b>The record is not the last word, and you can correct it.</b> The community\u2019s record has no row for an island or two on most layouts, and the game\u2019s own table says why: on that layout the island is shut to <i>everyone</i> \u2014 gated at a million barters \u2014 so nobody ever wrote down what it showed. Where the client does deal a row the record lacks, ten of them, the layout now carries it; and the barter count each exchange needs is known for 3,002 of 3,004 rows, up from 2,917. Once a board is settled, <i>\u270e An island shows something else\u2026</i> is the one door for what the record gets wrong: name the island, pick what its window shows from everything it is known to deal, or say it shows nothing \u2014 islands above your barter count are greyed, since a blank window there is the game. A reading that fits one layout everywhere but an island or three <i>is</i> that layout with a slot moved, and is planned as such; <b>telling the fleet is offered only then</b>, or when nothing fits. Layout 31\u2019s Dallae Pier takes the Stuffed Morpho Butterfly since the patch of 17 September \u2014 one byte in the client\u2019s table, and the community\u2019s sheet agrees.',
			'<b>Which layouts come up most.</b> The app writes a board down by itself the moment it is settled. The book\u2019s <i>Yours</i> shows the boards you have been dealt, commonest first, and the Community tab adds them up fleet-wide under <i>Barter layouts most dealt</i>, beside each layout\u2019s share of the community\u2019s own record.',
			'<b>A run buys only what the Market has.</b> Oni wrote in with a run that told him to load a land good the Central Market had none of: the app priced a chain\u2019s first good at the Market\u2019s last price and never asked whether any were for sale. The relay was already bringing the listed count back with every price; now it is used. With land goods <i>bought ashore</i>, a run buys no more of a good than are listed, a chain whose first good nobody is selling <b>cannot be ticked</b> \u2014 its card is greyed and says <i>none on the Central Market</i> on its own face, with the good drawn; where you hold a good part-way up the same climb the card starts from that instead, the shore struck out among its starts, and where you keep the land good it offers <i>from my storage</i> \u2014 and <i>Before casting off</i> shows how many are listed beside each thing to buy. A count the Market would not confirm this time holds nothing back, since stock moves by the minute; and the Market is asked again every half hour while the page is open, not only when it loads.'
		]
	},
	{
		date: '2026-09-14',
		title: 'A chain that stops short says so, and the coins are counted the way the game pays them',
		notes: [
			'<b>A ticked chain that climbs one island of three now says why.</b> It happened quietly before: the run would take the first rung, meet the weight limit, and carry the half-climbed goods home — the coins never arrived and the only sign was a small “1 stops” on a chip. The run writes a line for it now, naming the chain, how far it got, and the exact numbers — <i>the trade at Almai puts on 1,100 LT and the hold has 300 left under the limit</i> — with the pace that would fix it one press away. The chip says <b>1 of 3 islands</b> rather than a bare count.',
			'<b>Crow Coins are a range, and the barter count is on them.</b> The islands state a range — 90–200, 100–190 — and the app was quoting the bottom of it as though it were the answer. Worse, it knew nothing of the thing the game does next: <b>Total Barters adds a percent to every exchange</b>, five points a five-hundred up to <b>+30%</b> past 2,500. The six bands come out of the client’s own <code>variedtradecount</code> table, so a sailor with four thousand barters behind them is no longer shown a figure a third short of what lands in the purse.'
		]
	},
	{
		date: '2026-09-13',
		title: 'The siren is on the chart, and the community map is read rather than traced',
		notes: [
			'<b>The Hollow Maretta</b> — the siren whose song the Great Ocean warns about — is a habitat now, with its portrait from the codex and the thirty-eight spots it is rung at. The codex has an NPC page for it and no position on it, so the places come off gpw’s ocean map, the same sheet Vell’s water came from.',
			'That map is no longer fitted <i>by hand</i>. It draws the sea monsters’ spawns as well, and those the codex does give us, so <code>tools/read-ocean-map.mjs</code> finds its crosses by their colour, matches them against the points the app already holds and solves for where the picture sits: an exact twenty world units to the pixel, landing within ten units — half a pixel — on 325 marks. The siren’s rings are then read off by their shape, and every one of the thirty-eight comes out on open water, which is the check that the fit is honest.'
		]
	},
	{
		date: '2026-09-11',
		title: 'On a phone the pouch is one line, and the numbers are typed in a sheet',
		notes: [
			'<b>The strip of chips was a good bar and a poor phone.</b> Nine of them will not fit across 390 pixels, so the row scrolled sideways — half of a bar that stands on top of every screen was a swipe away, on the one bar nobody visits to read: the silver is glanced at, and typed over once a week. A phone gets the glance now. One line the height of a single chip: what is in the purse, in red what it is short of, how many other currencies are aboard, and the barter count. Pressing it opens <b>Carrying</b> as a sheet, where every field has the width of the screen and the sailor’s numbers are already open rather than folded into a line.',
			'The <b>nest</b> and the <b>table of thresholds</b> can both be opened from inside that sheet, and they stand in front of it — so when one is saved, cancelled or dismissed, the sheet comes back at the row it was scrolled to instead of leaving the screen bare.'
		]
	},
	{
		date: '2026-09-11',
		title: 'The sailors’ server is one press from every screen',
		notes: [
			'The app was written for a room it never named. <b>Discord</b> now stands in the masthead beside Help — the community server at <code>discord.gg/bdo-sailing</code>, where the routes, the crew builds and the changes a patch brings are actually worked out. On a phone it keeps its mark and drops the word, like the rest of the masthead, and the menu carries the same door under <b>Help</b> for anyone who goes looking there first.'
		]
	},
	{
		date: '2026-09-11',
		title: 'version 1.1: the plan, and the sea you can actually reach',
		notes: [
			'Everything since 1.0 is written up as a release: <b>Menu → What’s new</b>, and <code>CHANGELOG.md</code>, which is generated from the same words. The two things it is named for both came from players writing in, and they are credited by name at the top of the notes — a release can say who asked for it now, in their own words, above the fold rather than behind “everything else”.',
			'The Help page’s dataset list gains the two records the barter forecast now reads: the four whole ship-material boards, and the forty trade-list layouts seen across four hundred and twenty refreshes.'
		]
	},
	{
		date: '2026-09-11',
		title: 'A hold barters to seventy per cent over, not a quarter, and the ways you are willing to use answer a press',
		notes: [
			'<b>The barter ceiling was wrong, and it was costing every run a third of its hold.</b> The islands were taken to stop dealing at a quarter over the weight limit. They do not: they deal right up to the 170% at which the hull stops moving, so there is no band where you can sail but not trade. The old figure came from one session in which a 27,000 LT hold seemed to refuse past about 34,000 — which is what a quarter over looks like, and is why it was believed. Every barter plan reads differently for it: chains that were cut short climb further, material runs that were split into several departures go out in one, and a hold at its fullest is quoted against the mark that is really there.',
			'<b>The three ways you are willing to use are clickable.</b> They began as tickboxes and became chips in the same release, and the press was left behind in the handler that only tickboxes ever reach — so they showed the state and did nothing. Now each one re-plans as it is pressed, and <i>hunt what drops</i> has a step of its own rather than sharing one with the things nothing publishes a rate for: a fight you asked for and a shrug are different errands.'
		]
	},
	{
		date: '2026-09-11',
		title: 'The way to get it is a plan you carry out, step by step',
		notes: [
			'<b>The plan is numbered now.</b> It was a set of groups under headings, which is a catalogue: true, and no help at all with the question a shopping list exists to answer — <i>so what do I do first?</i> It reads as steps in the order they are done, because the quests pay the Crow Coins that buy the shop’s half, and a player who buys first finds the purse empty when the quests come round. <b>1 Run these quests · 2 Take these as quest rewards · 3 Buy at the Crow Coin Shop · 4 Barter for these at sea</b>, and so on down to what has no rate at all. Each step says where it happens, carries its own total, and folds away when you are done with it.',
			'<b>Where the plan lands, and every dial that moved it there, are one card.</b> <i>Done in 22 days</i> at the top, the thing that sets that pace under it, then what it costs: coins to spend against what you can spare, silver, and how many things across how many steps. Under that, <b>what matters most to you</b> as three cards that say what each choice will do to you rather than three words; how often you sail; the coins you keep back; and the ways you are willing to use.',
			'<b>What this plan will never do</b> is a line you can open, and it describes <i>this</i> plan rather than the idea of one: the rules in force right now, including the ones your own orders added — nothing off the Central Market, the coins you keep back, an activity you switched off.',
			'The quests are <b>grouped by how often they come round</b>, each with the number of runs, where it is done, the reward to take with its picture, and the coins it pays; a material a step below says which quest hands it over, one line a quest. A thing you are going to go and get shows <b>the recipe it feeds</b> beside it, ingredients and batch count, since a drop is half the answer and the processing is the other half.'
		]
	},
	{
		date: '2026-09-11',
		title: 'The barter count decides which islands exist, and the numbers about you are typed once',
		notes: [
			'<b>A run is never planned through an island you have not opened.</b> The game opens the trade routes as the total barters climb — 150 opens Shipwrecked Haran’s Cargo Ship, 600 Lantinia’s Combat Raft, 3,000 the Wandering Merchant’s Ship — and the app knew that table only well enough to print what the next threshold unlocks. Everything it planned was laid out as though all ninety-one barterers were open to everyone: on the forty recorded boards, fifteen chains climb through an island a sailor at 480 barters cannot reach, and Tear of the Ocean is dealt at exactly one barterer, the one that opens at three thousand. Now the count is part of every plan. The join is the patch note’s own words — <i>opens</i> names a place and the chart says who stands there — so twelve barterers are gated at the twelve counts the note states and nothing is guessed: the seventy-nine it never names, the coastal [Level 6] and [Level 7] dealers among them, are open from the first day.',
			'What is behind a door is <b>said, not hidden</b>. Every list shows what is shut, greyed, with the count that opens it: the chains on the Barter tab, locked and untickable under the ones that are yours, with a line above saying how many and what opens them; a material’s island chips; the islands the board question offers. The Map still draws the island and its card says what opens it, but no pin is lit there for something on your list. A forecast folds through the islands you can actually reach — a rung dealt in two places is priced at the open one — so where none is open the answer is the door itself: <i>locked, 2,520 more barters open the Wandering Merchant’s Ship</i>. And <b>the whole table</b> is one press away, from the bar and from that line: every threshold, the island it opens and its barterer, ticked where it is yours already.',
			'Nought barters is <b>a real answer</b>, not a missing one — a sailor who has never bartered has the three routes the game starts them with and no more, and the app plans on that. Since that is also what a save that has never been told says, the bar asks for the number until it is given.',
			'<b>The numbers about you are typed once.</b> The barter count, the level, the Parley, the vouchers and the Value Pack were entered on To Get — the one screen that is not about the sea — with a second copy of two of them on the Barter tab and Sailing Mastery off on the Ship tab, all of them read everywhere. They are <b>the sailor</b> now: one group beside the pouch, in the strip that follows you across every tab, folded into a line that still says the lot — <i>480 barters · Artisan 5 · 4+3 draws</i>, and under it what the next threshold opens and when the lists refill. One press opens the fields and the choice is remembered; the Ship tab and the hold bar read the same figures rather than offering a second place to type them. The Value Pack is its own switch instead of a tick crammed under the draws, the draws say which list is which, the vouchers add up the Parley they are worth, and the first mate’s ten per cent comes along with who to seat for it. The voucher, the Value Pack and the refresh wear the game’s own icons.',
			'<b>How many sailors are out</b>, in the masthead, and beside it the crew — the accounts that have ever signed in. The first is a count of the browsers with the tracker open at this moment, and the tooltip adds how many browsers have ever opened it. It needs no sign-in and keeps no address: a random token the browser makes for itself and two timestamps, which is why the live count says browsers and not people.'
		]
	},
	{
		date: '2026-09-10',
		title: 'The barter forecast counts how often the offer is really there, and the plan takes your word for what you will do',
		notes: [
			'<b>“At best” was doing too much work.</b> Every barter figure in the app assumed the exchange you want is on the list every time you draw it. It is not: of the four whole ship-material boards recorded, a Saltwater Crocodile’s Scale was on <i>one</i>. So a hundred of them read as five days when the boards say about eleven, and a plan wanting four materials off one list quietly assumed all four turned up, every day. The forecast now reads both records the app already keeps — the four complete material boards, and the forty trade-list layouts seen across four hundred and twenty refreshes — and paces every rung by how often it was actually there. The old number survives as the floor: <i>about 11 days, 5 if the offer is always up</i>, with the sample named beside it.',
			'What is measured is <b>presence</b>, not how many islands showed it, so the change can only ever lengthen a forecast and never shorten one; a thing on every board recorded reads exactly as it did. Anything no board has recorded keeps the old best-case figure and <b>says so on the row</b> rather than passing it off as measured. Your own material-board diary is deliberately left out of the arithmetic: it records where a thing was and never where it was not, and a sample with no absences in it cannot measure absence.',
			'<b>What drops it is named.</b> Khan’s Tendon read as “nothing else sells it” beside a price, which is true of shops and false of Khan. Every row now carries an <i>also</i> line with the ways the plan could not put a number on — what drops it, the worker node, the bulk exchange, the shop it did not use — because a list that leaves those out is how somebody ends up buying a thing they could have killed for.',
			'<b>Three switches for what you will actually do</b>: the dailies and weeklies, bartering, and <i>hunt what drops</i>. The last takes every dropped material off the shopping list and never claims a rate for it, since none is published anywhere — on a two-part Carrack that was forty-three days and a hundred thousand coins, and with hunting on it is thirty.',
			'The <b>quests to run</b> are drawn as errands now: the reward to take with its picture, what else it hands over, the coins, and where it is done — and when a pick-one was a real choice, what it was chosen over and why the other one is got another way. A material bought in two passes of the purse used to appear twice in the Crow Coin Shop at the same price with two different reasons; it is one row with both.'
		]
	},
	{
		date: '2026-09-10',
		title: 'To Get says how each thing should be got, not only how it can be',
		notes: [
			'<b>The way to get it.</b> To Get used to answer “where does this come from?” for every line and leave “so what do I do?” to you — and the sources compete: a Candidum daily pays fourteen Tidal Black Stones <i>or</i> one Violent Wave Plywood, the coins spent on plywood are not there for the tendons, and two materials off the ship-material list wait on the same three draws. The new first view of To Get reads the whole list at once and gives every item one way — from the quests, the Crow Coin Shop, barter, Falasi, the Market, or go and get — with its reason on the line, and says how many days that is and what sets the pace.',
			'It follows a <b>goal</b>, as the crew and the sailing orders do, because what is scarce is yours to say: <b>Soonest</b> spends the purse wherever it buys days; <b>Keep the coins</b> spends them only where nothing else sells the thing; <b>Keep the silver</b> leaves the Market alone. Beside them, how many days a week the sea gets, and coins to keep back.',
			'The quests to run are listed as the actions they are, each with the reward the plan would take off a pick-one and what it goes toward — <b>make it my pick</b> remembers it, so Claimed on the Quests screen records it in one press. The Quests screen says the same thing beside a quest whose remembered pick differs, and the Plan’s <b>Next</b> line names today’s first quest. A short purse is stretched by the coin quests, and the horizon says how long that takes.',
			'The old reading is one chip away — <b>Every way</b> — and Copy and CSV follow whichever is showing. Barter is counted at best, as it always was, and a drop or a worker node is named, never timed.'
		]
	},
	{
		date: '2026-09-09',
		title: 'Crow Coins are spent where they are counted, the sailor list sorts by any growth, and Auto assign asks what the boat is for',
		notes: [
			'<b>Buy with coins.</b> The app knew what a thing costs at Oquilla’s Eye and knew how many coins you held, and still made you do both halves of the sum by hand. Now every Crow Coin line on <b>To Get</b> — and every coin-priced thing in the <b>Inventory</b> panel — carries a Buy: it asks how many, says what that costs and what is left of the purse, and records the goods in and the coins out as <b>one change</b>. One Undo takes back both halves, which is the whole point: a purchase undone by halves is worse than one never recorded. It opens on what the purse can actually cover, and a sum that does not work is said rather than quietly clamped.',
			'The <b>sailor list can be ordered by any growth</b> — Endurance, Wits, Awareness, Strength, and the four cannon ones — as well as by type, condition and level. The growth it was ordered by is shown on every card, so the order can be read rather than trusted. Finding the fastest of eighteen sailors was a matter of opening them one at a time before.',
			'<b>Auto assign asks what the boat is for.</b> It used to add up the growths a seat doubles and take the biggest sum, which is a question nobody asked: the Sail doubles Endurance and Wits together, so a sailor with 1.1 speed and 4.8 acceleration beat one with 3.9 and 1.5, and the ship lost five per cent of its speed while the arithmetic said it had gained. It now lays out every goal — speed, acceleration, turn, brake, cannons, all round — with what the crew would actually come to under each, against what it comes to now, and arranges the roster for the one you press: <b>who comes aboard</b> as well as who sits where, since a hull’s cabin space is a knapsack and thirteen cabins for one point of Endurance is a poor trade when speed is the point. A seat the goal does not value still goes to whoever doubles the most of what it does double, so nothing is wasted.',
			'<b>Total Barters follows the runs you sail.</b> The count that opens the next trade route — and that every barter quest is counted against — was typed in once and then left to rot while the app watched the very trades it counts go by. Recording a run now adds its trades to it, in the same change as the goods and the silver, so one Undo takes back the count with them; and when a run carries you past a threshold the toast says which route it opened. It is still a field: type over it whenever it and the Barter Information window drift apart.',
			'The note under the sailor list stands in from the panel’s edge with the cards it sits above, rather than against the glass.'
		]
	},
	{
		date: '2026-09-09',
		title: 'A crew read off your own screenshots, the Parley cut read off the First Mate seat, and the fourth of an island’s four can be tapped',
		notes: [
			'The Ship tab will <b>read a crew off screenshots</b>, in any of the sixteen languages the game’s own menu lists. Open Manage Sailors in game, screenshot it — or crop the Selected Sailor panel, either reads, and a mixture of both is fine — and drop the lot in: names, levels, condition and every growth come back in a table to check before a single thing is written, and a sailor already on the roster is brought up to date rather than hired twice. It is read <b>here, in the page</b>: the vendored engine is served from this site, the shots are decoded by the browser and never uploaded, and there is nothing on any server to delete afterwards. The window does not print a sailor’s type, so it is worked out from the appetite, the cabin cost and the weight — and where three types share all three, from where the growths went. Twenty at a time, and every guess is marked for a look.',
			'Which matters because the growths are what the app could never estimate its way round. A levelled sailor rolls inside a hidden band, so a crew was worth its <b>average</b> roll and the ship’s speed came out under the game’s — 196.4% against 198.1% on a full Carrack, all of it in the crew. Typed in, or now read in, the rolls are the game’s and so is the number.',
			'A <b>named first mate</b> has no growths of their own. The app was crediting each of the three half a point of speed, acceleration, turn and brake, which the game’s own panel shows none of — a mate’s seat pays their skill, not numbers — and eating 100 rations a day where they eat 150. Both corrected off the game.',
			'The <b>ten per cent off Parley</b> is no longer a tick. It is Cleia’s skill and nothing else, so it is read off who is sitting at the First Mate seat: aboard, the Bartering line says so and names her; hired but ashore, it says what seating her would be worth. Nobody has to remember to tell the app about their own crew.',
			'On a run’s checklist, the <b>fourth</b> of an island’s four [Level 7]s can be tapped. The four chips were laid in a line wider than the stop’s column and the last one ran under the hold beside it — drawn after, so it took every click aimed at the chip. They wrap now.'
		]
	},
	{
		date: '2026-09-08',
		title: 'The Best ship board scores what is on the hull, and every hull says what it is for',
		notes: [
			'<b>Best ship</b> was <code>hull tier × 100 + enhancement levels</code>, which rated a +10 green Toro cannon exactly as highly as a +10 yellow Falasi one — so three quite different Carracks all landed on 440 and shared first place. A slot is now worth its part’s set first and its enhancement second, so no amount of enhancing carries a green part past a blue one, and the row says which set it is looking at: “Carrack (Advance) · Chiro, Toro · +40 in all”. The sea crystal counts too, for rather less than lifting the whole set a tier — the best crystal is a drop and a yellow set is a season. Every score on that board has moved; they are not comparable with the old ones.',
			'The chart <b>over the whole screen</b> is the chart, not the chart with the section dock across it. The dock is sticky at the top of the shell and sits a layer above the chart, so lifting the shell over the phone’s tab bar carried the dock up with it — a strip of tabs floating on the sea. Full screen keeps the chart’s own controls, which carry the way back.',
			'Ticking a stop <b>Done</b> on the Map’s run sheet no longer throws the list back to the top. Recording what an island paid moves the pouch, so it is a real redraw of the screen and not of the panel alone, and the panel came back scrolled to its first stop with the one just ticked off screen — on a nineteen-stop run, a scroll back down every single time. The panel keeps its place now, as it already did for the redraws it does itself.',
			'A stored digest from an older build is <b>worked out again</b> rather than left standing. The scoring change re-rated whoever happened to sync next and left everybody else on the same board wearing their old number, which reads as a bug because it is one: a digest is stored, not recomputed on every read, so nothing asked for the others to be worked out afresh. Every digest has carried a version since the first one and nothing ever looked at it; the server does now, so a scoring change re-rates the whole board on its next rebuild.',
			'The <b>hold bar</b> no longer prints its weight over its own second line. The line is around 420 pixels and could not wrap, so where the bar was narrower than that it simply spilled over whatever had wrapped underneath — by 23 pixels on a wide screen and 223 on a narrow one. On a phone the parley controls ran to 613 pixels inside a 390-pixel screen and were cut off at the panel’s edge; they wrap now.',
			'Every board says <b>how it is counted</b>: a “?” on each one opens the rule in full, and the Best ship board shows the sum behind the number — “hull 4,000 + parts 194 + crystal 20” — for the top of the board and for your own row. A leaderboard that will not say how it ranks people is a leaderboard nobody believes, and “440 pts” explained nothing at all, least of all to the three sailors tied on it.',
			'Every hull now says <b>what it is for</b>, which the game’s own numbers never do: the Advance for bartering (the biggest hold, and a run pays by what it carries), the Volante for speed, the Valor and the Panokseon for sea monsters, the Balance for not choosing. It is on the ship card, in the picker — where searching “barter” finds the barter hulls — and the crystal picker marks the crystals that suit the hull and says what each stat is for. Under the sailor list, the one sentence that decides a barter roster: every sailor aboard is cargo you cannot carry. Under the slots, the next set worth buying. All of it the fleet’s reading, sourced in js/ship_roles.js, and none of it a rule the app enforces.'
		]
	},
	{
		date: '2026-09-08',
		title: 'The boards keep up, and hold you by default; your fleet and your inventory are one thing',
		notes: [
			'The <b>Community</b> boards follow your save. What they show about you is worked out from the copy the server holds, and that copy is redrawn within seconds of a save reaching it — so a ship fitted, a sailor hired or a run logged is on the boards, and on your own card, by the time you walk to them. Before, a change waited on the boards’ own window and a card, once opened, never changed at all: leaving the boards and rejoining them was the only way to see it.',
			'Signing in now puts you <b>on the boards by name</b>, rather than leaving them to the few who went looking for the switch. The tab says so the first time you open it, <b>Leave the boards</b> is one press from there, and leaving is remembered — signing in again does not put you back. You can still be shown as an unnamed sailor instead, and what would be shared is still listed before you agree.',
			'Your <b>fleet and your inventory are one fleet</b>. Keeping a setup on the Ship tab puts its hull in the Inventory if none was recorded there, and a hull recorded in the Inventory is a ship in your fleet — under <i>Your fleet</i>, in the Map’s ship picker, and counted on the boards — whether or not a setup was ever named for it. One Undo takes back both halves.',
			'Two setups kept in the same moment are two setups: they shared an id before, and the second quietly replaced the first.'
		]
	},
	{
		date: '2026-09-08',
		title: 'What’s new tells only what is new, two clips of a ship and a drawing handed round, and the game file’s original is kept',
		notes: [
			'Two more clips, in What’s new and the README: a ship’s whole fit-out copied as a link and made someone else’s boat in one press, and a drawing named, copied, and flown to on another chart. The capture harness shoots them like the rest — the link is read off the clipboard and opened as a real load on an empty save.',
			'<b>What’s new</b> is the sea, not the yard: a section a tab — the Map, the Barter tab, Quests, the Ship, the Community — each saying what it is and what it does, and the yard named only for what the sea brought back to it; the Plan, the Inventory, the Workshop and To Get were here before and are no longer described as news.',
			'Writing a route into <code>gameVariable.xml</code> keeps two copies now: the first write puts the untouched file aside as <code>gameVariable.xml.orig</code> and never writes it again, and every write copies the file as it was to <code>gameVariable.xml.bak</code>. Before, the second write copied the first write’s output over the only backup, and the original was gone.'
		]
	},
	{
		date: '2026-09-07',
		title: 'version 1.0: one release, the tour and the film for the whole app',
		notes: [
			'The release notes are one release, <b>1.0</b>, since nothing before it was ever shipped: the yard, the sea, the run and the harbour together, under What’s new and in CHANGELOG.md.',
			'The guided tour walks every section, the Barter tab and the Community tab among them, and ends on the Menu; the film has a run planned on today’s board and sailed on the chart, and the README’s pictures are re-shot with it.',
			'A newer deploy no longer puts up a “new version is ready” toast: it installs behind the page and waits for the next visit, so a restart of the server never asks for a reload.'
		]
	},
	{
		date: '2026-09-07',
		title: 'the harbour: a hall of fame, the fleet in numbers, one menu, and a way to write in',
		notes: [
			'One way round the app on every screen: a <b>dock</b> of every section across the top of a wide screen, the icon over the name and none past an edge, sticking to the top as the page scrolls; the bar at the thumb on a phone; and one <b>Menu</b> behind both — every section, Find, the trip log, Undo, Redo, the save, the help and the settings — a drawer at the right on a wide screen, the sheet at the thumb on a phone, <kbd>M</kbd> on the keyboard. The hamburger and the More dropdown are gone.',
			'A place on a community board opens what it is about: the <b>Ship tab stood up on that sailor’s boat</b> — hull, parts, crystal, seats and roster, to look at and not to keep, one press back to yours — for the ship and the fleet, the Selected sailor panel on their best sailor for the crew boards, and the card at the matching section for the rest, with doors to each quest, each monster’s grounds and each item. The fleet in numbers has categories, a find box, a sort, and every row that names something is a door to it. The Parley bar is drawn under the hold at every stop of a run, counting down from what the bar holds, a voucher drawn on where it is wanted and its cooldown allows.',
			'A run is sailed on the <b>Map</b>: “Sail this run” draws the route on the chart and the chart’s panel becomes the run sheet the Barter tab’s popup was — the rail, the trades, the hold and the Parley after each stop, the wharf calls, the quests handed in, Done, Record the trip. A stop’s name flies the chart to it and steps to it; Done steps on to the next; a pin pressed brings its stop up the sheet. The checklist keeps the whole run now, so the sheet stands after a reload.',
			'Three paces for a run, compared in numbers under its tiles: <b>fast</b> keeps under the limit with no calls, <b>full, never slower</b> does every attempt and leaves the surplus at a wharf before the hull slows, <b>full, loaded</b> takes the hold to the barter ceiling and calls only where the next island would not deal. The hold reads as the game’s Ship Info does — everything aboard, crew included, over the limit — at every stop, on the strip, the tiles, the status and the Ship tab. The strip says your barter level and what a trade costs at it; the quests off the way fold away.',
			'A full run climbing several chains at once does every attempt the islands allow and leaves the surplus at a wharf on the way up, as chain-after-chain already did; saying what an island paid ticks the stop done. A sailor’s growths are named as the sailor window names them — Endurance, Wits, Awareness, Strength, Patience, Force, Focus, Vision — with what each moves beside.',
			'A <b>Community</b> tab, where there is sign-in: sixteen boards — mastery, the best ship, the best sailor, the most silver from runs, the most monsters hunted, the luckiest at the anvil and the rest — and the fleet in numbers, the hulls most sailed, the parts most fitted, the islands most plotted, the quests most done. Only the sailors who take part are on it, by name or as an unnamed sailor, and what would be shared is shown before anyone agrees.',
			'The profile keeps a <b>tally</b> of the career — quests claimed, runs sailed, things made, attempts at the anvil — since the save holds only a quest’s current period and the last sixty runs. Undo takes a count back with the thing it counted.',
			'<b>Menu → Feedback</b>: something wrong, an idea, or something else, with the section and the build attached; it reaches whoever runs the site, and the GitHub issues are a link away. Admins get an inbox.',
			'The light theme reaches every popup: dialogs, the run’s foot, the crew’s wells, the done marks and the tier chips were navy by hex and are tokens now; a toast’s words and a tier’s name read on white.'
		]
	},
	{
		date: '2026-09-07',
		title: 'the long haul: rations, the save, the page in the hand and in the light',
		notes: [
			'The rations aboard drain over the plotted loop at an estimated, calibratable rate; the Route tab says the stop they run low after and puts a rations call in at the nearest wharf manager. An overweight leg sails slower and its minutes say so. The hold on the Map is what is aboard.',
			'A leg the router could not bend round the land is drawn dashed and red and named in the panel. The runs worth sailing are searched in a worker with a time budget. An area of the chart can be kept offline. A sailor keeps a log of the levels reached.',
			'A build’s route choice survives a reload. The Map’s routes and traces and the Barter tab’s state live in the profile — exported, synced, per profile. A named route is never dropped for the previous one. The undo history keeps only the fields a change touched, is bounded in bytes, and a refused write is announced; a corrupt save is copied aside. Imports name what they do not know; links travel slim and say their length.',
			'A light theme; one phone query, a phone on its side included, the Map giving the chart the screen there; hit areas of forty pixels; lifted inks; names on searches, filters and dialogs; the hover card by keyboard; <kbd>0</kbd> for the tenth tab; Escape shuts the menus; CSV and print for the shopping list.',
			'The server: /healthz, push endpoints allow-listed, an Origin check, schema versions, backup and restore, the worker stamp from any deploy, a request log, a deadline on the Market relay.'
		]
	},
	{
		date: '2026-09-05',
		title: 'the material run as one route, and a hold that has its say',
		notes: [
			'The run for a material is <b>one route through every island ticked</b>, whatever each deals: the shortest way from the harbour through all of them, untangled rather than hopped nearest-first, a harbour a give is kept at called at before the first island that needs it, and the stops as one timeline. The hold has its say at last. The gives an island takes weigh a thousand a piece and the materials they pay weigh nothing, so a run leaves heavy and comes home light — and a hold cannot always carry every give at once. Two paces, on the run’s own orders: <i>full</i> sails everything ticked — what the run will not spend is left in storage to make room, the hold is loaded to the barter ceiling, and when the gives still do not fit the run goes out in <b>several departures</b>, back to the harbour for the rest between them, each one loading what the next islands take; <i>fast</i> sails once, loaded to the limit the ship still sails at full speed under, and what does not fit <b>stays ashore</b> and is listed, with a way to the full run beside it. What is loaded at the harbour is a stop on the checklist — the first one, since the run starts at the pier — so Record moves it out of storage. And the run says what to have <b>before casting off</b>: the Gold Bars a few islands take are bought ashore and priced, a give kept in a storage the run cannot load from — Heidel, or a harbour it will not call at — is listed to bring to the harbour first, and only what is held nowhere is sent to the item board. Holding none of a give no longer hides the route: the run is laid out as if the shortfall were got first — in the harbour’s storage, or aboard — with “to get first” said plainly beside it. The run’s own panel is redrawn to be read at a glance: each material with its icon against its want as a bar, the figures as tiles with a sign each — islands and trades, harbour calls and departures, the hold at its fullest, the time under way, what to buy — and every goods list with the item’s icon. The tiles on the material strip keep their places when opened; the open one tapped again is put down, so nothing is open and the run is only what is ticked; and a cross on a tile unticks its islands, taking that material off the run. The Barter tab is <b>one column</b> now, for either goal: the hold is a line across the top — the ship, its weight against the limit, what is aboard by level, what waits ashore — that opens over the page for the counts and the loading; then the board; then for silver the orders and the figures, and the chains laid across the page as cards to tick; for a material the run’s head and orders, then the list. The run itself — what to have before casting off, every stop, the sail bar and the chart — is a <b>sheet over the page</b>: while anything is ticked a strip stays along the foot of the window with the run in a line (chains, silver, time, islands, or each material against its want), and “Lay it out” opens the whole of it; a stop ticked off or a chain unticked inside it redraws it in place, and on a phone it is a full-height sheet. The trip is logged from the masthead alone; the hold’s line keeps “A good”. And the run has a <b>way round</b> among its orders: <b>the shortest way</b>, every chain climbed at once — one route through every rung of every chain ticked, each still after the rung beneath it, so the ship deals the nearest island it holds the give for whatever chain it belongs to, the [Level 1]s off the harbour first and then the [Level 2]s, the stops as one timeline each tagged with its chain — or <b>chain after chain</b>, each to its top, as before. The chains go in <b>lots</b>: as many at once as the hold carries — their ladders together under the limit, every top keeping at least half its attempts — the tops sold at a wharf before the next lot, so a run of four chains on a small hull climbs two at a time rather than dying at the second rung with everything aboard spoken for. Within a lot the hold is shared out before casting off, every top’s attempts first and extras round the chains while the whole still fits; the figures say what each way comes to, since carrying several climbs at once means fewer attempts a rung for a shorter sail. On a phone the chain cards keep to the page, the route wrapping and the figures a row under the goods, and a stop’s trade is two lines. The way to sail the run stays at the foot of the sheet as it scrolls. And the <b>quests come along</b>, under an order of the run — none; on the way only, handed in where the run passes anyway; with a short way round, a stop put in for a taker close by; or those and the hunts. The sailor is taken to have accepted them already, at Velia, Iliya or Oquilla’s Eye, so what counts is where each is handed in: every taker is placed on the chart — a harbour, an island’s barterer, a wharf manager — and the run hands in whatever it passes, at a stop of the route or at the harbour before casting off, and <b>puts a stop in</b> where a taker lies a short way off the route, up to three kilometres round by it; what lies further, or needs grounds no leg passes, is listed as off the way — and a taker off the way can be asked for by name, its stop put in for the day whatever the way round. A hunt gets a stop of its own at its grounds — the point of them the way round by costs least, one stop a species — and is handed in after it; a taker shared with a hunt is put in after the hunting, so the run puts in at Oquilla’s Eye once. The <b>barter quests</b> are counted off the run’s trades: fifteen, twenty or a hundred barters, the count kept from run to run until the week or the day turns, the hand-in put in only once a run makes the number up, and a trip recorded makes it up by itself and puts the reward in the bags. A stop ticked off on the checklist hands in the quests at it, rewards recorded; one whose pick-one reward is not remembered keeps its button. And the checklist has <b>All done</b>: asked in place whether the stops, the quests or both, then every stop ticked off and every quest handed in at one press, the rewards recorded — handing a lot in frees the way for takers left out before, so it goes round again until nothing is left. The strip along the foot counts the quests the run takes in. On the Map, a stop’s row in the loop is its step: a tap takes the player and the camera to it, the current row lit, as the chips along the foot do; and “next leg” beside “follow” draws the route faint but for the leg into the current stop, bright in amber. A quest’s name in the sheet leads to its row on the Quests tab; a cross leaves it out of the day’s runs, and “Quests off the way” takes it back in. The quests handed in at a stop go to the chart with the run, on the stop’s row and its card. The sail bar and the chart button sit together at the foot of the sheet, pinned as it scrolls; on anything short of a desk the sheet is as wide as the screen. And a thing done is <b>answered with a small burst of light</b> where the tap landed — a good put in the bags, a part made, a build taken on, a quest claimed, a stop ticked off on a run, a trip recorded — a soft glow instead when motion is asked to keep still. What stands under a panel’s head on this tab stands in from the edge now — the orders, the figures and the chains ran to it. And ticking a chain no longer hangs the tab: bending the legs round the land was redone for the whole run at every tick, and a leg once bent is now kept, so only a new leg costs anything — on the chart as well.'
		]
	},
	{
		date: '2026-09-04',
		title: 'where the goods are, the sailing orders, and the runs worth sailing',
		notes: [
			'Every kind of item has a <b>home</b>: new trade goods can land at Iliya Island instead of the bags, from the Inventory, a logged trip or the Barter tab — set once under “New things land in”. The Inventory has a <b>select mode</b>: tick tiles and move them all to a storage, or back, in one undoable change; each tile wears a tag naming where it sits. A trade good is never in the bags: what no storage claims is the ship’s hold.',
			'The Barter tab’s hold is <b>what is aboard</b>. Goods ashore are listed by harbour with a Load button; the harbour the run sails from is the one its chains can load from, and the run lists what to load before casting off. A chain’s pips start at the good held; the trade rows show the given good’s icon; the run for a material sits on the silver run’s skeleton, the ladder beside the hold.',
			'The <b>sailing orders</b>: “Cash out today” or “Build the stocks”, then a drawer — which levels a wharf sells, a floor of every good at each level kept back, land goods on or off, the pace, a cap on time under way, how a 2-3 is counted. Every chain row shows what it adds a Parley unit and an hour, net of land goods priced from the Market (or nothing, when your workers make them), and the list sorts by it. A fast run over the weight limit says why nothing trades.',
			'<b>Runs worth sailing</b>: a search over the board’s chains proposes the most silver, the most an hour and the most a Parley unit; one tap lays a run out, “fill the rest for me” builds round what is ticked, and before the board is known the tab says what the best run would pay across the layouts still standing. The run for a material starts from whatever is held on any path — three Azure Quartz cover forty Tidal Black Stone in two trades, not an eight-trade climb from Brass Ingot — and a Crow Coin is priced at the coin shop’s best rate.',
			'<b>Sail this run</b> turns the timeline into a checklist: tick each stop off, tap what an island paid and which of its four [Level 7]s it handed over, and the rest re-counts; Record puts the whole trip in the Inventory as one change — goods gone and gained, the silver, deposits noted at their harbour — and in the week’s log. What islands paid goes into your own record, which the counting can follow. Goods kept say how many of the forty boards take them, and near which harbour. The first mates add 200 LT, and the Lyngbakr wears its own artwork.',
			'The chart goes <b>over the whole screen</b> from the ⛶ button, with its own way back (✕ or Esc); on a phone it takes the whole screen and turns to landscape — where the browser will not turn it, the chart turns itself. And the game’s map comes <b>the other way</b>: paste the favourites block out of gameVariable.xml, or open the file, and the bookmarks, camera slots and loops land on the chart — as the route when their points sit on barterers, as a kept trace otherwise.',
			'On the Barter tab, <b>Today’s material list</b> is the page’s width and its first panel — the material, the want and the harbour on it, the give groups in columns — with the run it makes and the hold it draws on side by side beneath. And it lists for <b>several materials at once</b>: each one an island is ticked as showing is a chip on the list with its own want, and the run sails for all of them — the islands in the shortest order from the harbour, a give kept at another harbour’s storage loaded on the way with a wharf call before the island that needs it, and a choice between coming home once the wants are met and sailing every island ticked. On the Map, the busy corner of the Ross Sea under the hekaru and ocean stalker grounds no longer stutters: the pins and every other marker move without a layout, the tiles sit in one box per zoom level, and the grounds are drawn once with a margin and slid under a pan. The Saltwater Crocodiles’ ground is fitted to nine bookmarks set round it in game, and the Black Rust spawns the codex still listed in that water are gone.',
			'The chart <b>zooms in twice as far again</b>, and out to the whole world: the tiles now cover every level the codex draws real ground for, 1 to 7, so a full-screen chart shows an island’s wharf and rooftops rather than a blur of its coast, and a step back holds the whole sea in view. Opening and flying to an island stay at the magnifications they had; the wheel goes the rest of the way. And the chart <b>loads the way a map should</b>: a zoom in motion is carried by the tiles already on screen and asks only for the level it lands on — a wheel from 3 to 7 fetches 7, not 4, 5 and 6 on the way — a flight asks for its far end as it sets off so it is sharp on arrival, the middle of the screen fills before the corners, a tile panned away from before it arrived is cancelled, what was seen is kept for a silent pan back, and when tiles are taking a moment a thread of light runs along the chart’s top edge. The tiles themselves are told to be kept for a year by every cache on the way, so a server sees each one about once.'
		]
	},
	{
		date: '2026-09-03',
		title: 'the soft cap, the goods aboard, and a run planned from them',
		notes: [
			'A failstack climbs the way the game climbs it: a tenth of the base rate a stack until the chance reaches 70%, a fiftieth a stack after that, and 90% the ceiling. The Workshop and the Plan had let a green or Toro part run straight on to 90 — a +1 green Caravel part at six stacks is 78%, not 90 — so their stone forecasts ran light for anyone stacking below Carrack blue.',
			'A sailor’s band is summed level by level from what each level-up can add — the community sheet’s rolls, read by <code>tools/fetch-sailor-rolls.mjs</code> — instead of a straight line to the level-10 figure, so a level-5 sailor is judged against what level 5 can actually hold. A typed roll now says how many of the level’s possible rolls it beats (an Innocent’s speed has 1,728 of them at level 10), and where most of them land.',
			'A hunting ground switched on is drawn as its water — the outline round each cluster of spawns, filled faintly and padded by a spawn’s reach — with the points on top, so where a species ends reads at a glance the way the game’s own map shades it.',
			'The hold reads as a sum of lines under Fitted out — hull, each part that adds weight, the crystal, the set, the crew taken off — and says how far past its limit the hull will still sail (to 170%, slower). The Route panel gained a load composer: a counter per level of goods, weighed against the free hold and that ceiling, with “from the hold” to count what is actually aboard.',
			'The plotted loop keeps a ledger: a <b>Worth</b> tile — goods coming aboard at what a barterer pays, materials at the market’s price where it has one, less the goods handed over, and an hour’s worth at the middle of the time range — a <b>Carry out of port</b> list of everything the loop hands over, how many are aboard and which island deals the rest for what, and on each stop’s row the hold after its exchange, amber past the limit.',
			'The seven enhancement tables are printed — More → Enhancement tables, or “the tables” on the Workshop — every level with its rate, the stack at which the climb slows and the one at which it stops, the fails before a success is certain, stones, Cron and durability, with one column lit at whatever stack you type. Each Workshop row names that slowing stack too: “70% at 14” is the stack worth reaching before the attempt.',
			'The sea’s clocks sit over the chart on every Map tab — barter refresh, dailies, weeklies and Vell’s next spawn — and Draw mode can <b>shade an area</b>: click the corners of a water, click the first again to close it, and it is kept, undone, shared and filed with the rest of the trace. The Workshop’s outlook now says how much durability a climb can cost at the very worst.',
			'The 123 sea trade goods are items now: a [Level 4] good you are holding can be recorded in the Inventory, found with Find, and logged off a trip — before, none of the three knew the goods existed, though the chart’s hold and carry lists were already reading them out of the stock. Each of the three tells its kinds apart: <b>Materials</b>, <b>Ship parts</b> and <b>Trade goods</b> are chips on the Inventory, on the Find box and on the trip log’s picker, so the goods aboard are one tap away from the planks.',
			'A <b>Barter</b> tab plans a run from what is aboard. The hold is listed good by good, weighed against the ship as fitted and its overload ceiling, with a count to change on each line. Then a run for <b>silver</b>, on today’s board: every chain the board allows is listed by how far it reaches — a land good bought ashore, or a good already aboard, and the islands that take it up rung by rung to a [Level 7] — and the ones ticked are sailed one after the other, nearest first, at one of two paces: <i>fast</i> buys only what the top rungs can use, counted down from the [Level 7] island’s attempts, so a carrack climbs without a wharf call; <i>every attempt</i> does all the island allows and leaves what the rungs ahead cannot take in storage on the way. A ship past its weight limit sails slower, and past a quarter over it the islands stop dealing altogether (a 27,000 LT hold was seen bartering to about 33,750), so the fast pace fills the hold to the limit and never slows, while the full pace uses the room up to the barter ceiling and calls at a wharf whenever that ceiling is in the way — the nearest with a storage keeper, or the one chosen — ending a rung over it only when such a call can bring the hold back under. Trade goods sell in port, so the [Level 7]s are sold at the wharf — at every call, and at home when the run is done. The count is pessimistic both ways: an exchange that pays two or three is counted as paying two and weighed as if it paid three. Each chain’s stops are a timeline with the hold after every one — a wharf call numbered among the islands, with the icon and count of everything it puts into storage — and what is bought ashore, left on the way and carried home is listed with what it would sell for. Or a run for <b>a material</b>: its ladder counted against the hold, the first thing missing named, the islands for each rung nearest-first and the refreshes it will take — the run the whole table allows at best until the board is known, and the tab says so. Either draws itself on the chart in one press, and the whole run goes with it: an island’s card shows the exchange it is called at for, icons and all, and the wharf calls are marked too — violet anchors rather than the route’s amber, numbered in the same sequence as the timeline, one mark per pier however often the run comes back to it, whose card lists each visit and what goes ashore. The calls ride in the link, the saved route, the exported file and the game’s own map. The Route panel’s per-level load composer is gone — the hold here is the real one.',
			'<b>Today’s board.</b> The trade-goods barters are not rolled island by island: every refresh the whole sea shows one of forty fixed layouts, which one player’s record of 1,968 refreshes since November 2024 (the community sheet <i>TradeBarterInfo</i>, read by <code>tools/fetch-barter-combos.mjs</code>) writes out island by island. So the Barter tab now asks what one island is showing — tap it from that island’s possible offers, the one that tells the layouts apart best is suggested — and the whole board follows; a second look settles a tie. From then on both runs are planned on today’s board, every island’s offer known, and the “at best” caveat goes. What was seen lapses at the barter refill, or at one press when the board is refreshed in game. The material islands roll on their own and are still read from the whole table; and while the layout fixes what the six [Level 6] and six [Level 7] islands take and the [Level 6] they pay, which of its own four [Level 7] goods an island pays was seen to differ from the record, so a [Level 7] on the run is the record’s with “or another of the island’s four” beside it. The sea mask is now read off the zoom-5 tiles, fine enough for the Valencia river to count as water, so a leg to Ancado, Hakoven or Arehaza runs up the river and along the east coast the way the game’s own auto-path does, instead of round the north. A leg stands off the shore by about a thousand units where the water allows, as the game’s routes do, and a strait is judged on its length rather than taxed for its shores — so Karanza to Iliya goes through the channel between the continent and the desert, the way the game sails it, and a passage round a coast is no longer drawn shorter than it is. Where the game still sails a passage its own way — round the north it bends in towards the bay rather than across its mouth — trace that way and press ⚓ on the kept trace: it is a <b>lane</b>, and every route near it is drawn along it and timed as the game sails it. On a phone the Map’s clocks stay at the top, clear of the follower bar. The record also gave each rung’s attempt cap — five on a [Level 7] exchange, which the codex left at nothing — and where seven barterers actually stand: the four the codex put at Chiro’s workshops are at Al-Naha, Racid, Tinberra and Lerao, Neruo’s drying yard is Angie Island, Keshao is at Padix, and the Margoria wrecks and rafts carry the game’s names for them.'
		]
	},
	{
		date: '2026-09-02',
		title: 'a favourite reward, and a phone that keeps its words',
		notes: [
			'A pick-one quest keeps a favourite: <b>choose ahead</b> on the row answers the question before it is asked, and Claimed and Finish then run on it in one press. The bulk bar says how many would still ask, and <b>choose now…</b> walks those pickers back to back.',
			'A phone’s quest row holds its shape — tick, star and name share a line, and only the buttons drop below — so a day’s list is a third the scroll it was.',
			'The tree’s verdicts — covered, to craft, missing — are whole words on a phone again, and a long sub-line trims itself instead of painting over them.',
			'The pouch writes big silver the short way (“1.96b”); the caret swaps it to the exact digits, so editing never rounds what you hold.',
			'The phone menu closes when a tab is pressed under it, the thumb bar clears the home indicator, a dragged minimap keeps inside a chart that shrank under it, and /favicon.ico answers instead of 404ing on every load.',
			'Sign in says where it is taking you before it leaves for discord.com, and signing out on a dead network still signs the device out.',
			'The capture harness seeds the store before the app wakes, so the README states load instead of being written over by the empty page they replaced.',
			'The plotted loop is drawn as the water path it found — the shortest line that keeps to the sea — instead of bowing every leg into an arc; the ruler and the community courses draw the same way, and the drawn line finally agrees with the measured minutes.',
			'Lively Iliya Island pays out everything on its list — BDOCodex shows no pick there — so it no longer asks which; and Sailing to a Wider World’s note says both extras come, not one of them.',
			'The hire picker names each race once, the pool sorted under four headings instead of fifteen.',
			'The bottom sheets clear a phone’s gesture bar: viewport-fit=cover wakes the safe-area insets the styles were already asking for, and Close keeps a thumb’s worth of ground either way — and a dialog’s buttons keep a breath of air above them instead of leaning on the list.',
			'A drag that begins on a barterer no longer dies on the pin: the sea takes the gesture wherever it starts, pinch included, and a press that stays put is still the tap that opens the trades.',
			'The hire list wears its figures — the level-10 averages on every row — and a row of chips narrows it to one race or ranks it by a stat; a picker row now wraps instead of trailing off in an ellipsis, so a sailor’s appetite, cargo and ports all read.',
			'A sailor’s figures told a story four times too tall: the per-type numbers are the level-1 base, not growth a level, and every level-up rolls in a hidden band. The estimates now walk from the base to the level-10 average — taken from the community sailor tables and confirmed against BDOCodex’s maxima — the crew’s speed and the routes’ minutes follow, and a stat you type from the sailor window is judged against its level’s band: top roll, above or below the average, or the floor. The Quick sailor’s cannon figures were the guide’s error, settled the same way.',
			'A tap on a habitat marker toggles its grounds once: the pan fix had briefly made every tap count twice, on and off in the same breath.',
			'The Ship’s reference reads like the rest of the yard now: every remedy under its own icon, the food grades wearing their colours, the experience shares drawn as meters, the sailor slots as badges, and the three named mates given their faces.',
			'The fleet wears its hulls: every row carries the ship’s own icon, and the whole line is the way aboard — click anywhere on it to sail, with only the × standing clear. Hovering says so.',
			'Every seat can say what it would do with the sailor in hand: hover one while placing — or one already taken — and it speaks in that sailor’s own numbers; the selected sailor carries the same line, Sail to Mess, worked out for them — and those tips wear the app’s own dress now, not the browser’s yellow rectangle.',
			'A ship in a link is looked at before it is anything else: the parts laid out with whether you hold each one, a button to queue the missing ones into the plan, and “make it my ship” only ever on purpose.',
			'The Ship reference carries the community’s crew templates — bartering and PvX, free and expanded, who sits where — and the slots panel remembers the one slot every account starts with.',
			'Quick’s Force follows the patch that reshaped it: 3.5–5% by level 10 on the 2% base.',
			'Every barterer sat half a label west of his island: the pin centred itself over dot-and-name together, a constant screen error that grew sixteenfold against the islands by the time the chart was zoomed out. The dot is the anchor now — pins, ports, habitats and wharves all sit exactly on their coordinates, and the names hang off them. The routes were never wrong; now the dots agree with them.',
			'A habitat answers a click in Firefox again: a press that starts on a marker goes uncaptured, since Firefox hands a captured click to the chart instead of the button it began on.',
			'The Workshop no longer spends what another build has reserved: a craft is checked against the free remainder — plus whatever the plan set aside as that very craft’s materials — so the Inventory’s “Reserved 1 · Free 0” and the Workshop’s “possible now” finally agree, on the Plan and in the item’s detail too.',
			'Sailing a saved setup is one change: the parts, crystal, seating and skin it replaces come back with one Undo, as does a ship taken in from a link. And the undo toast names what changed — the roster, who sits where, the sea crystal, the hull — instead of calling every one of them your barter profile.',
			'A yellow-tier attempt is one change as well: the stones spent and the failstack moved go back together when it is undone.',
			'“Tick all” on the Quests screen ticks the quests it counted — the ones shown under the chip, the pay filter and the search — and no others.',
			'Keeping a trace takes a copy of it: the kept one stands still while the next stop, stroke or word goes on the live one.',
			'Opening the app on its own #inventory/<item> address is a plain visit again, so the tour and the release notes are not swallowed by it. A shared link still keeps them out of the way — and unmarked, so they wait for the next plain visit.',
			'Looking around a shared plan keeps its promise: the barter count, vouchers, parley and failstacks typed while looking around go back with the rest, instead of surviving into the real save.',
			'The Plan prices a yellow step at the failstack you carry, the same figure the Workshop’s forecast quotes, rather than at the recommended stack while the Workshop says otherwise.',
			'On a phone the “looking at a shared plan” bar stands on the section bar instead of covering it, and clears the home indicator; the small × that removes a route, trace, profile, group, setup or storage row is a thumb-sized target on touch screens; fields are 16px there so iOS stops zooming into the purse; and a phone on its side gets a one-row section bar and dialogs that fit the height.',
			'A new deploy no longer takes over open tabs mid-session: it installs and waits for the next visit — so the tour and the water are never fetched from one version into another.',
			'Two tabs of one browser no longer argue over sync: a refusal that hands back the very copy this tab sent adopts the revision and goes quiet instead of asking which of two identical plans to keep.',
			'The Map’s “sailed today” ticks roll over on the same barter clock the Resets dialog sets, not a clock of their own; a reload of a route link no longer stashes another “Previous” route each time; a stop dragged onto land steps back to where it was picked up; a second finger during a pen stroke zooms instead of extending the line; and “to the game’s map” says why nothing opened when the grounds ticked have no fixed spawn on the chart.',
			'A count too large to be one is refused as a typo rather than kept as Infinity and lost on reload; the trip log accepts the minus it promised; the Ship’s speed line lists the skin it was already adding; a setup is recognised as the one sailed whatever order its fields were saved in; and the tree’s carets stop toggling a hidden fold while a search holds every branch open.',
			'The market relay and the Vell push endpoints carry a ceiling per address and one for the whole process, and the subscription table has a size it will not grow past.'
		]
	},
	{
		date: '2026-09-01',
		title: 'the tour and the film cover the sea as well as the yard',
		notes: [
			'The guided tour walks all nine views — the Today strip, Quests, Ship and the chart’s five tabs among them — and points at what it is talking about: half its steps used to open as a popover in the middle of the page because the screen repainted a frame after the tour moved.',
			'The tour reads a phone properly: it points at the bar at the thumb rather than the tab row that is not there, opens the map’s panel before naming its tabs, and puts the last step on the hamburger the header’s buttons are folded behind.',
			'The film is re-shot end to end, with the sea in it — quests finished together, a hull fitted out, the loop plotted with its minutes, and a route traced onto blank water — and its subtitles are set half again as large, which is the size they should have been for a clip watched at half width.'
		]
	},
	{
		date: '2026-08-31',
		title: 'routes traced by hand, ship setups, and quests finished together',
		notes: [
			'A phone is given a bar at the thumb instead of a tab row that scrolled sideways: four sections, and “All” opens a sheet with every one of them — and the pouch no longer sits over the title.',
			'Traces are kept on a shelf — drawn small, named, renamed, linked, and laid over the chart by their eye, up to twenty of them; “Browse all” opens a library with a search and a sort.',
			'A traced leg is bent round the land between its stops, and a stop clicked onto an island steps off it into the water beside it.',
			'What the chart draws — barterers, habitats, wharves, island names, traced routes — is one strip of switches above the map panel’s tabs, on every tab instead of buried in one; the tabs are named for what they do: Barter, Route, Draw, Grounds, Today.',
			'Map: a Trace tab — click stops onto the sea, draw with the pen, write words on the water; eight inks, three pen widths, three sizes. Undo walks back through them in the order they were made, stops and words are dragged where they belong, and the chart’s markers hold their tongues while you draw. It zooms with the chart, keeps by name, travels in a link or a file, and goes into the game’s map.',
			'Map: island names at close zoom, the side panel on either side, and a switch between saved ship setups where the route is timed.',
			'Ship (was Crew): setups — a hull with its parts, crystal and seating kept by name — and Sailing Mastery, which the speed now counts.',
			'Quests: a pick-one reward is remembered and taken again in one press; tick several and finish them together; star favourites or keep named groups; every quest opens on BDOCodex.',
			'The hunt grounds keep to the water; markers that would collide share one picture; Salty’s croc map, Awabi’s Road to Cox and Vell’s waters are on the chart; the full roll of 58 wharf managers.'
		]
	},
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
