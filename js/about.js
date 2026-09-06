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
		date: '2026-09-05',
		title: 'the material run as one route, and a hold that has its say',
		notes: [
			'The run for a material is <b>one route through every island ticked</b>, whatever each deals: the shortest way from the harbour through all of them, untangled rather than hopped nearest-first, a harbour a give is kept at called at before the first island that needs it, and the stops as one timeline. The hold has its say at last. The gives an island takes weigh a thousand a piece and the materials they pay weigh nothing, so a run leaves heavy and comes home light — and a hold cannot always carry every give at once. Two paces, on the run’s own orders: <i>full</i> sails everything ticked — what the run will not spend is left in storage to make room, the hold is loaded to the barter ceiling, and when the gives still do not fit the run goes out in <b>several departures</b>, back to the harbour for the rest between them, each one loading what the next islands take; <i>fast</i> sails once, loaded to the limit the ship still sails at full speed under, and what does not fit <b>stays ashore</b> and is listed, with a way to the full run beside it. What is loaded at the harbour is a stop on the checklist — the first one, since the run starts at the pier — so Record moves it out of storage. And the run says what to have <b>before casting off</b>: the Gold Bars a few islands take are bought ashore and priced, a give kept in a storage the run cannot load from — Heidel, or a harbour it will not call at — is listed to bring to the harbour first, and only what is held nowhere is sent to the item board. Holding none of a give no longer hides the route: the run is laid out as if the shortfall were got first — in the harbour’s storage, or aboard — with “to get first” said plainly beside it. The run’s own panel is redrawn to be read at a glance: each material with its icon against its want as a bar, the figures as tiles with a sign each — islands and trades, harbour calls and departures, the hold at its fullest, the time under way, what to buy — and every goods list with the item’s icon. The tiles on the material strip keep their places when opened; the open one tapped again is put down, so nothing is open and the run is only what is ticked; and a cross on a tile unticks its islands, taking that material off the run. The Barter tab is <b>one column</b> now, for either goal: the hold is a line across the top — the ship, its weight against the limit, what is aboard by level, what waits ashore — that opens over the page for the counts and the loading; then the board; then for silver the orders and the figures, and the chains laid across the page as cards to tick; for a material the run’s head and orders, then the list. The run itself — what to have before casting off, every stop, the sail bar and the chart — is a <b>sheet over the page</b>: while anything is ticked a strip stays along the foot of the window with the run in a line (chains, silver, time, islands, or each material against its want), and “Lay it out” opens the whole of it; a stop ticked off or a chain unticked inside it redraws it in place, and on a phone it is a full-height sheet. The trip is logged from the masthead alone; the hold’s line keeps “A good”. And the run has a <b>way round</b> among its orders: <b>the shortest way</b>, every chain climbed at once — one route through every rung of every chain ticked, each still after the rung beneath it, so the ship deals the nearest island it holds the give for whatever chain it belongs to, the [Level 1]s off the harbour first and then the [Level 2]s, the stops as one timeline each tagged with its chain — or <b>chain after chain</b>, each to its top, as before. The chains go in <b>lots</b>: as many at once as the hold carries — their ladders together under the limit, every top keeping at least half its attempts — the tops sold at a wharf before the next lot, so a run of four chains on a small hull climbs two at a time rather than dying at the second rung with everything aboard spoken for. Within a lot the hold is shared out before casting off, every top’s attempts first and extras round the chains while the whole still fits; the figures say what each way comes to, since carrying several climbs at once means fewer attempts a rung for a shorter sail. On a phone the chain cards keep to the page, the route wrapping and the figures a row under the goods, and a stop’s trade is two lines. The way to sail the run stays at the foot of the sheet as it scrolls. And the <b>quests come along</b>, under an order of the run — none; the dailies and weeklies; or those and the hunts. The sailor is taken to have accepted them already, at Velia, Iliya or Oquilla’s Eye, so what counts is where each is handed in: every taker is placed on the chart — a harbour, an island’s barterer, a wharf manager — and the run hands in whatever it passes, at a stop of the route or at the harbour before casting off, and <b>puts a stop in</b> where a taker lies a short way off the route, up to three kilometres round by it; what lies further, or needs grounds no leg passes, is listed as off the way. A hunt is handed in only after a leg has passed its grounds, and the leg says how far off they lie. The <b>barter quests</b> are counted off the run’s trades: fifteen, twenty or a hundred barters, the count kept from run to run until the week or the day turns, the hand-in put in only once a run makes the number up, and a trip recorded makes it up by itself and puts the reward in the bags. A stop ticked off on the checklist hands in the quests at it, rewards recorded; one whose pick-one reward is not remembered keeps its button. And the checklist has <b>All done</b>: asked in place whether the stops, the quests or both, then every stop ticked off and every quest handed in at one press, the rewards recorded — handing a lot in frees the way for takers left out before, so it goes round again until nothing is left. The strip along the foot counts the quests the run takes in. A quest’s name in the sheet leads to its row on the Quests tab; a cross leaves it out of the day’s runs, and “Quests off the way” takes it back in. The quests handed in at a stop go to the chart with the run, on the stop’s row and its card. The sail bar and the chart button sit together at the foot of the sheet, pinned as it scrolls; on anything short of a desk the sheet is as wide as the screen. And a thing done is <b>answered with a small burst of light</b> where the tap landed — a good put in the bags, a part made, a build taken on, a quest claimed, a stop ticked off on a run, a trip recorded — a soft glow instead when motion is asked to keep still. What stands under a panel’s head on this tab stands in from the edge now — the orders, the figures and the chains ran to it. And ticking a chain no longer hangs the tab: bending the legs round the land was redone for the whole run at every tick, and a leg once bent is now kept, so only a new leg costs anything — on the chart as well.'
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
