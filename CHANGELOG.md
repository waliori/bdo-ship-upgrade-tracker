# Changelog

What arrived between one version of this app and the next, written for
someone who has been away. The same notes are in the app itself, under
**More → What's new** — this file is generated from them by
`node tools/build-changelog.mjs`, so the two cannot drift apart.

## 2.0 — The sea

*2026-09-01*

The tracker knew what a ship costs. It had nothing to say about the water you would have to cross to pay for it. This release adds the sea: a chart with every barterer on it, the loop through them timed at your own hull’s speed, the quests the ocean hands out for free, and the ship you sail it in.

### A chart of the sea, with your shopping list on it

![The Map, a pin for every barterer holding something on the list](docs/media/map.png)

The **Map** is the To Get list drawn on the game’s own chart. Every pin is one of the 91 barterers, holding something you are short of; open one and it says what it hands over, how many exchanges are left and what the parley costs at your own Barter level.

- All 91 barterers, Levels 1 to 7, on the game’s own tiles, placed from client positions to within a pixel.
- One strip of switches — *On the chart* — says what is drawn: barterers, monster habitats, the 58 wharf managers, guild wharves, island names, your own traced routes.
- Monster habitats stand at the centre of each species’ spawns, kept to open water, each with its picture from the codex.
- Two community maps are fitted to the chart on their island names: Awabi’s *Road to Cox*, and Vell’s waters from gpw’s ocean map.
- A ruler measures any two points, with the game’s own coordinates under the pointer, and a minimap you can drag out of the way.

### A loop that says how long it takes

![Plotting a barter loop; every leg gets a distance and a time](docs/media/chart-the-loop.gif)

Plot the loop through everything you are short of and every leg comes back with its length and its minutes — bent round the land, at the speed *that* hull actually makes with those parts and those sail seats.

- What 100% is in metres the game never says, so a time is a range: a fifth either way around the chart’s 11 m/s estimate, a tenth once you have timed a leg and told it.
- Parley is budgeted at one trade a stop or at every attempt the offer allows; the stops past what your bar covers are marked, and a button trims to them.
- Routes are kept by name, a replaced one is kept as the previous, and a route travels in a link or a small JSON file.
- **Put it on the game’s map** writes the stops into your own world map as favourites, or as one of its three navigation loops.

### Draw a route the list cannot express

![Three stops, a freehand line and a word, drawn straight onto the sea](docs/media/draw-a-route.gif)

Click the sea for a numbered stop, drag to sketch a line, or type a word straight onto the water. Every mark is a place on the chart, so it all pans and zooms with the tiles.

- Eight inks, three pen widths, three sizes of writing, and an undo that walks back through stops, strokes and words in the order they were made.
- Legs bend round the land like a barter route’s, and a stop dropped on a headland steps off into the water beside it.
- A trace is kept by name and travels in a link or a file; twenty live on a shelf, and **Browse all** opens a library with a search over names, notes and the words written on them.

### What the sea hands out free

![The Quests screen, grouped by how often each comes round](docs/media/quests.png)

Every quest that pays in a ship material, grouped by how often it comes round, with the ones paying in something your plan still wants marked. Claiming puts the reward in stock and ticks the quest until its own reset.

- Tick several and **Finish** records them together as one undoable change.
- A pick-one reward is remembered, so the next claim takes the same one in a single press.
- Keep a set you run every day as a named group, star the ones that matter, and filter by what is still to do, what your plan wants, or one reward in particular.

### The other half of a ship

![A Carrack with two of its parts on; typing in the Sailing Mastery moves every number](docs/media/fit-a-ship.gif)

The **Ship** screen carries every hull in the game’s own numbers and fits it out as five slots — the four parts and the sea crystal — each taking the best you already hold, or one you choose.

- All 287 sea crystals from Eltro to Rusalka, plus Ebenruth’s Nol and the Oceanteared Nol, chosen by grade with the effect beside the name.
- A crew planned against the hull’s seats and cabin space: contracts, condition, food, first mates, and the certificates on the shopping list.
- Your Sailing Mastery counts toward speed, acceleration, turn and brake — and a sailor’s real numbers can be typed in, since the type’s figures are only averages.
- Keep a whole fit-out as a named **setup** and switch between them here or from the Map, where the route is timed.

### What today can do about it

The Plan carries a **Today** strip: the quests still open that pay in something on your list, the time to the daily, weekly and barter resets, when Vell is next up on your servers, and the pace each build has been moving at.

- Resets at 00:00 UTC, Thursday 00:00 UTC and 06:00 UTC, ticking in place.
- Vell’s EU and NA timetables, correctable where they are shown, with a reminder a quarter of an hour before — by push, where the deployment has a key pair.
- The pace is a diary this browser keeps; it is not part of the save.

### Prices that are actually today’s

Anything the Central Market sells is priced from the Market itself, per region, and the app says how old the number is. The last prices a browser saw stay on hand offline.

### Getting around

The app grew from six screens to nine, so finding things had to get easier rather than harder.

- **Find** on Ctrl+K (or `/`): an item opens in the Inventory’s panel, a tab opens; the digits 1–9 switch tabs.
- **Log a trip** records everything you brought back in one box, as one undoable change.
- **Profiles**: separate saves on one browser, for an alt or a what-if.
- An item’s count is what is in your bags plus every storage you have noted it at, so a number typed at a place moves the total.
- A phone gets a bar at the thumb with four sections and an **All** sheet holding every one of them; the header folds into one menu.
- Every choice the app asks for goes through one picker: pictures, a fact beside each name, a search that ranks a name starting with your letters first.

### The yard, sharpened

The six screens that were already here got the other half of their work done.

- **Redo**, to go with Undo.
- Sort the Plan and the Inventory by shortfall, need, what you own or name; search on every list.
- The address bar names the tab and the open item, so a place survives a reload, travels in a link, and Back retraces your steps.
- Enhancement below the yellow tier takes a failstack; the yellow Falasi and Cheongun tier drops a level on a failure, so Cron Stones are part of what an attempt costs.
- The small craft: a Cog two ways, three rowboats and a raft.
- A craft can be recorded the way Mass Process actually makes it.
- Import asks whether to replace or merge, keeping the higher count of anything counted twice; exports are dated.
- Quantities read the way your browser writes them, and item look-ups open BDOCodex in any of twelve languages.
- A field guide behind one quiet dot: the game’s own windows, so a number here can be traced to the screen it came from.

### Underneath

None of this is visible, and all of it is why the rest works.

- Every screen is its own module; the planner stays pure, and each screen is a projection of it.
- Offline, the app runs from a snapshot of one deploy — never a mixture of two.
- The barter catalogue is served as data rather than as script, and everything heavy travels compressed.
- The tour’s library is vendored, so the page needs no CDN and the CSP can stay shut.
- A test suite of 310, run on every push, covering the cost model, the sync API and the client in a real browser.
- The image is layered by rate of change, and SIGTERM reaches node itself so the shutdown flush actually runs.

### The tour, and the film

Both were re-made for the app this became: the guided tour walks all nine views and points at each thing on your own screen, and the walkthrough film is re-shot end to end with the sea in it. Neither is a mock-up — they drive the real app, so a screen that changes makes them wrong until they are shot again.
