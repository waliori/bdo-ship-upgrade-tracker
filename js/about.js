// What the app was checked against, and when; and what changed.
//
// A live game moves under a tool like this. The dates here are the
// ones the data files themselves carry, gathered so Help can show them
// in one place, and the changes are the ones a player would notice.

export const DATA = [
	{ what: 'Barter catalogue — 91 barterers, Levels 1–7', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Barterers’ positions on the chart', asOf: '2026-08-30', from: 'client positions, within a pixel' },
	{ what: 'Sea monster spawn points', asOf: '2026-08-30', from: 'BDOCodex; the Lyngbakr Habitat from in-game bookmarks, 2026-08-31' },
	{ what: 'Monster ground markers', asOf: '2026-08-31', from: 'the centre of each species’ codex spawns, kept to open water; the crocodiles from the patch note' },
	{ what: 'Wharf managers — the full roll, 58 of them', asOf: '2026-08-31', from: 'BDOCodex NPC pages' },
	{ what: 'Cox Pirates’ camps, flags and cargo ships', asOf: '2026-08-31', from: 'Awabi’s “The Road to Cox” map, fitted to the chart on its island names' },
	{ what: 'Vell’s waters', asOf: '2026-08-31', from: 'gpw’s ocean map v1.6, to a couple of kilometres' },
	{ what: 'Quests and their rewards', asOf: '2026-08-30', from: 'BDOCodex' },
	{ what: 'Ship hulls — durability, weight, speed…', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Ship parts at every level', asOf: '2026-08-29', from: 'BDOCodex' },
	{ what: 'Ship appearance sets — Benelois (crafted), Oquilla Carrack Overlay (pearls)', asOf: '2026-09-01', from: 'BDOCodex item and design pages, per slot' },
	{ what: 'Enhancement rates and Agris caps', asOf: '2026-08-25', from: 'BDOCodex, BDFoundry' },
	{ what: 'The yellow tier (Falasi, Cheongun)', asOf: '2026-08-26', from: 'patch notes, BDOCodex' },
	{ what: 'Crow Coin Shop prices', asOf: '2026-08-25', from: 'the shop at Oquilla’s Eye' },
	{ what: 'Falasi’s prices', asOf: '2026-08-25', from: 'Port Epheria' },
	{ what: 'Parley rates and discounts', asOf: '2026-08-29', from: 'the Barter Information window' },
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
 */
export const RELEASES = [
	{
		id: '2.0',
		name: 'The sea',
		date: '2026-09-01',
		blurb: 'The tracker knew what a ship costs. It had nothing to say about the water you would have to cross to pay for it. '
			+ 'This release adds the sea: a chart with every barterer on it, the loop through them timed at your own hull’s speed, '
			+ 'the quests the ocean hands out for free, and the ship you sail it in.',
		sections: [
			{
				title: 'A chart of the sea, with your shopping list on it',
				media: 'docs/media/small/map.png',
				alt: 'The Map, a pin for every barterer holding something on the list',
				text: 'The <b>Map</b> is the To Get list drawn on the game’s own chart. Every pin is one of the 91 barterers, '
					+ 'holding something you are short of; open one and it says what it hands over, how many exchanges are left '
					+ 'and what the parley costs at your own Barter level.',
				points: [
					'All 91 barterers, Levels 1 to 7, on the game’s own tiles, placed from client positions to within a pixel.',
					'One strip of switches — <i>On the chart</i> — says what is drawn: barterers, monster habitats, the 58 wharf managers, guild wharves, island names, your own traced routes.',
					'Monster habitats stand at the centre of each species’ spawns, kept to open water, each with its picture from the codex.',
					'Two community maps are fitted to the chart on their island names: Awabi’s <i>Road to Cox</i>, and Vell’s waters from gpw’s ocean map.',
					'A ruler measures any two points, with the game’s own coordinates under the pointer, and a minimap you can drag out of the way.'
				]
			},
			{
				title: 'A loop that says how long it takes',
				media: 'docs/media/small/chart-the-loop.gif',
				alt: 'Plotting a barter loop; every leg gets a distance and a time',
				text: 'Plot the loop through everything you are short of and every leg comes back with its length and its minutes '
					+ '— bent round the land, at the speed <i>that</i> hull actually makes with those parts and those sail seats.',
				points: [
					'What 100% is in metres the game never says, so a time is a range: a fifth either way around the chart’s 11 m/s estimate, a tenth once you have timed a leg and told it.',
					'Parley is budgeted at one trade a stop or at every attempt the offer allows; the stops past what your bar covers are marked, and a button trims to them.',
					'Routes are kept by name, a replaced one is kept as the previous, and a route travels in a link or a small JSON file.',
					'<b>Put it on the game’s map</b> writes the stops into your own world map as favourites, or as one of its three navigation loops.'
				]
			},
			{
				title: 'Draw a route the list cannot express',
				media: 'docs/media/small/draw-a-route.gif',
				alt: 'Three stops, a freehand line and a word, drawn straight onto the sea',
				text: 'Click the sea for a numbered stop, drag to sketch a line, or type a word straight onto the water. '
					+ 'Every mark is a place on the chart, so it all pans and zooms with the tiles.',
				points: [
					'Eight inks, three pen widths, three sizes of writing, and an undo that walks back through stops, strokes and words in the order they were made.',
					'Legs bend round the land like a barter route’s, and a stop dropped on a headland steps off into the water beside it.',
					'A trace is kept by name and travels in a link or a file; twenty live on a shelf, and <b>Browse all</b> opens a library with a search over names, notes and the words written on them.'
				]
			},
			{
				title: 'What the sea hands out free',
				media: 'docs/media/small/quests.png',
				alt: 'The Quests screen, grouped by how often each comes round',
				text: 'Every quest that pays in a ship material, grouped by how often it comes round, with the ones paying in '
					+ 'something your plan still wants marked. Claiming puts the reward in stock and ticks the quest until its own reset.',
				points: [
					'Tick several and <b>Finish</b> records them together as one undoable change.',
					'A pick-one reward is remembered, so the next claim takes the same one in a single press.',
					'Keep a set you run every day as a named group, star the ones that matter, and filter by what is still to do, what your plan wants, or one reward in particular.'
				]
			},
			{
				title: 'The other half of a ship',
				media: 'docs/media/small/fit-a-ship.gif',
				alt: 'A Carrack with two of its parts on; typing in the Sailing Mastery moves every number',
				text: 'The <b>Ship</b> screen carries every hull in the game’s own numbers and fits it out as five slots — the four '
					+ 'parts and the sea crystal — each taking the best you already hold, or one you choose.',
				points: [
					'All 287 sea crystals from Eltro to Rusalka, plus Ebenruth’s Nol and the Oceanteared Nol, chosen by grade with the effect beside the name.',
					'A crew planned against the hull’s seats and cabin space: contracts, condition, food, first mates, and the certificates on the shopping list.',
					'Your Sailing Mastery counts toward speed, acceleration, turn and brake — and a sailor’s real numbers can be typed in, since the type’s figures are only averages.',
					'Keep a whole fit-out as a named <b>setup</b> and switch between them here or from the Map, where the route is timed.'
				]
			},
			{
				title: 'What today can do about it',
				text: 'The Plan carries a <b>Today</b> strip: the quests still open that pay in something on your list, the time to '
					+ 'the daily, weekly and barter resets, when Vell is next up on your servers, and the pace each build has been moving at.',
				points: [
					'Resets at 00:00 UTC, Thursday 00:00 UTC and 06:00 UTC, ticking in place.',
					'Vell’s EU and NA timetables, correctable where they are shown, with a reminder a quarter of an hour before — by push, where the deployment has a key pair.',
					'The pace is a diary this browser keeps; it is not part of the save.'
				]
			},
			{
				title: 'Prices that are actually today’s',
				text: 'Anything the Central Market sells is priced from the Market itself, per region, and the app says how old the '
					+ 'number is. The last prices a browser saw stay on hand offline.'
			},
			{
				title: 'Getting around',
				text: 'The app grew from six screens to nine, so finding things had to get easier rather than harder.',
				points: [
					'<b>Find</b> on Ctrl+K (or <kbd>/</kbd>): an item opens in the Inventory’s panel, a tab opens; the digits 1–9 switch tabs.',
					'<b>Log a trip</b> records everything you brought back in one box, as one undoable change.',
					'<b>Profiles</b>: separate saves on one browser, for an alt or a what-if.',
					'An item’s count is what is in your bags plus every storage you have noted it at, so a number typed at a place moves the total.',
					'A phone gets a bar at the thumb with four sections and an <b>All</b> sheet holding every one of them; the header folds into one menu.',
					'Every choice the app asks for goes through one picker: pictures, a fact beside each name, a search that ranks a name starting with your letters first.'
				]
			},
			{
				title: 'The yard, sharpened',
				text: 'The six screens that were already here got the other half of their work done.',
				points: [
					'<b>Redo</b>, to go with Undo.',
					'Sort the Plan and the Inventory by shortfall, need, what you own or name; search on every list.',
					'The address bar names the tab and the open item, so a place survives a reload, travels in a link, and Back retraces your steps.',
					'Enhancement below the yellow tier takes a failstack; the yellow Falasi and Cheongun tier drops a level on a failure, so Cron Stones are part of what an attempt costs.',
					'The small craft: a Cog two ways, three rowboats and a raft.',
					'A craft can be recorded the way Mass Process actually makes it.',
					'Import asks whether to replace or merge, keeping the higher count of anything counted twice; exports are dated.',
					'Quantities read the way your browser writes them, and item look-ups open BDOCodex in any of twelve languages.',
					'A field guide behind one quiet dot: the game’s own windows, so a number here can be traced to the screen it came from.'
				]
			},
			{
				title: 'Underneath',
				text: 'None of this is visible, and all of it is why the rest works.',
				points: [
					'Every screen is its own module; the planner stays pure, and each screen is a projection of it.',
					'Offline, the app runs from a snapshot of one deploy — never a mixture of two.',
					'The barter catalogue is served as data rather than as script, and everything heavy travels compressed.',
					'The tour’s library is vendored, so the page needs no CDN and the CSP can stay shut.',
					'A test suite of 310, run on every push, covering the cost model, the sync API and the client in a real browser.',
					'The image is layered by rate of change, and SIGTERM reaches node itself so the shutdown flush actually runs.'
				]
			},
			{
				title: 'The tour, and the film',
				text: 'Both were re-made for the app this became: the guided tour walks all nine views and points at each thing on '
					+ 'your own screen, and the walkthrough film is re-shot end to end with the sea in it. Neither is a mock-up — '
					+ 'they drive the real app, so a screen that changes makes them wrong until they are shot again.'
			}
		]
	}
];

/** The release this build is; what the What's New dialog is keyed on. */
export const RELEASE = RELEASES[0].id;

export const CHANGES = [
	{
		date: '2026-09-03',
		title: 'the soft cap, the roll a level makes, and what a loop is worth',
		notes: [
			'A failstack climbs the way the game climbs it: a tenth of the base rate a stack until the chance reaches 70%, a fiftieth a stack after that, and 90% the ceiling. The Workshop and the Plan had let a green or Toro part run straight on to 90 — a +1 green Caravel part at six stacks is 78%, not 90 — so their stone forecasts ran light for anyone stacking below Carrack blue.',
			'A sailor’s band is summed level by level from what each level-up can add — the community sheet’s rolls, read by <code>tools/fetch-sailor-rolls.mjs</code> — instead of a straight line to the level-10 figure, so a level-5 sailor is judged against what level 5 can actually hold. A typed roll now says how many of the level’s possible rolls it beats (an Innocent’s speed has 1,728 of them at level 10), and where most of them land.',
			'A hunting ground switched on is drawn as its water — the outline round each cluster of spawns, filled faintly and padded by a spawn’s reach — with the points on top, so where a species ends reads at a glance the way the game’s own map shades it.',
			'The hold reads as a sum of lines under Fitted out — hull, each part that adds weight, the crystal, the set, the crew taken off — and says how far past its limit the hull will still sail (to 170%, slower). The Route panel gained a load composer: a counter per level of goods, weighed against the free hold and that ceiling, with “from the hold” to count what is actually aboard.',
			'The plotted loop keeps a ledger: a <b>Worth</b> tile — goods coming aboard at what a barterer pays, materials at the market’s price where it has one, less the goods handed over, and an hour’s worth at the middle of the time range — a <b>Carry out of port</b> list of everything the loop hands over, how many are aboard and which island deals the rest for what, and on each stop’s row the hold after its exchange, amber past the limit.'
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
			'A new deploy no longer takes over open tabs mid-session: it installs, waits, and the page offers a Reload — so the tour and the water are never fetched from one version into another.',
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
