# Changelog

What arrived between one version of this app and the next, written for
someone who has been away. The same notes are in the app itself, under
**Menu → What's new** — this file is generated from them by
`node tools/build-changelog.mjs`, so the two cannot drift apart.

## 1.0 — The yard and the sea

*2026-09-07*

The yard was here already: one inventory, the builds that draw on it, the Workshop and the shopping list. This release adds the sea you cross to pay for it — a **Map** with every barterer on it and the loop through them timed at your own hull’s speed, a **Barter** tab that plans a run on today’s board and sails it on the chart, the **Quests** the ocean hands out free, the **Ship** you sail it in, and a **Community** harbour — and the yard picks up what the sea brings back.

### Map — a chart of the sea, with your shopping list on it

![The Map, a pin for every barterer holding something on the list](docs/media/map.png)

A new tab. The **Map** is the To Get list drawn on the game’s own chart. Every pin is one of the 91 barterers, holding something you are short of; open one and it says what it hands over, how many exchanges are left and what the parley costs at your own Barter level.

- All 91 barterers, Levels 1 to 7, on the game’s own tiles, placed from client positions to within a pixel; the chart zooms from the whole sea to an island’s rooftops.
- One strip of switches — *On the chart* — says what is drawn: barterers, monster habitats, the 58 wharf managers, guild wharves, island names, your own traced routes.
- Monster habitats stand at the centre of each species’ spawns, kept to open water, each with its picture from the codex, and a ground switched on is drawn as its water.
- Two community maps are fitted to the chart on their island names: Awabi’s *Road to Cox*, and Vell’s waters from gpw’s ocean map.
- A ruler measures any two points, with the game’s own coordinates under the pointer, and a minimap you can drag out of the way.
- The sea’s clocks sit over the chart: the time to the daily, weekly and barter resets, and when Vell is next up on your servers.
- **Keep this area offline**: the tiles of the view you are on, a level either side, kept in a store the cache never sweeps.

### Map — a loop that says how long it takes

![Plotting a barter loop; every leg gets a distance and a time](docs/media/chart-the-loop.gif)

Plot the loop through everything you are short of and every leg comes back with its length and its minutes — bent round the land, at the speed *that* hull actually makes with those parts and those sail seats.

- What 100% is in metres the game never says, so a time is a range: a fifth either way around the chart’s 11 m/s estimate, a tenth once you have timed a leg and told it.
- The **rations** aboard drain over the route at an estimated rate; the Route tab says the stop they run low after and puts a rations call in at the nearest wharf manager. An overweight leg sails slower, and its minutes say so.
- Parley is budgeted at one trade a stop or at every attempt the offer allows; the stops past what your bar covers are marked, and a button trims to them.
- A leg the router could not bend round the land is drawn dashed and red and named in the panel, never a straight line through an island passed off as a course.
- Routes are kept by name, a replaced one is kept as the previous, and a route travels in a link or a small JSON file.
- **Put it on the game’s map** writes the stops into your own world map as favourites, or as one of its three navigation loops, the untouched file kept beside it — and the game’s map comes the other way, its bookmarks and loops landing on the chart.

### Map — draw a route the list cannot express

![Three stops, a freehand line and a word, drawn straight onto the sea](docs/media/draw-a-route.gif)

Click the sea for a numbered stop, drag to sketch a line, or type a word straight onto the water. Every mark is a place on the chart, so it all pans and zooms with the tiles.

- Eight inks, three pen widths, three sizes of writing, a shaded area, and an undo that walks back through stops, strokes and words in the order they were made.
- Legs bend round the land like a barter route’s, and a stop dropped on a headland steps off into the water beside it.
- A trace is kept by name and travels in a link or a file; twenty live on a shelf, and **Browse all** opens a library with a search over names, notes and the words written on them.
- A kept trace can be a **lane**: every route near it is drawn along it and timed as the game sails it.

### Map — a drawing in a link

![Three stops, a line and a word named and copied as a link; opened on another save, the chart flies to the drawing](docs/media/share-a-drawing.gif)

A drawing is a thing to hand round. **Copy link** puts the whole trace — stops, notes, line and words — into one address; whoever opens it gets the chart flown to the drawing, on any browser, with nothing to install and nothing of their own touched.

- The link carries the drawing itself, not a pointer to it, so it works for someone who has never opened the app before.
- A trace taken in from a link is on the water like one drawn here: to draw on, keep by name on the shelf, lay over the chart with its eye, or send on again.
- The same drawing goes into the game’s own world map as favourites, and out as a small JSON file for a guild’s records.

### Barter — a run planned on today’s board, and sailed on the chart

![Answering what one island shows; the whole board follows, a run is laid out, and Sail this run draws it on the Map](docs/media/plan-a-run.gif)

A new tab. The trade-goods barters are not rolled island by island: every refresh the whole sea shows one of forty fixed layouts. So the **Barter** tab asks what one island is showing — tap it from that island’s possible offers — and the whole board follows: every chain the day allows, listed by how far it reaches and what it pays, and the ones ticked are one run.

- The hold is **what is aboard**, weighed against the ship as fitted and the ceiling the islands still deal under; goods ashore are listed by harbour with a Load button.
- The **sailing orders**: cash out today or build the stocks, which levels a wharf sells, land goods on or off, a cap on time under way — and three paces: *fast* keeps under the limit with no calls, *full* does every attempt and leaves the surplus at a wharf before the hull slows, *full, loaded* takes the hold to the barter ceiling.
- **Runs worth sailing**: a search over the board’s chains proposes the most silver, the most an hour and the most a Parley unit; one tap lays a run out.
- Or a run for **a material**: one route through every island ticked, the harbour a give is kept at called at before the first island that needs it, and what to have before casting off named — bought ashore, brought from another storage, or got first.
- The **quests come along**: handed in where the run passes anyway, a stop put in for a taker a short way off, a hunt given a stop at its grounds; the barter quests are counted off the run’s trades.
- **Sail this run** draws the route on the Map and the chart’s panel becomes the run sheet: the trades, the hold and the Parley after each stop, the wharf calls, Done stepping on to the next stop. Saying what an island paid re-counts the rest, and **Record the trip** puts the whole of it in the Inventory as one undoable change.
- What islands paid goes into your own record, and the runs worth sailing are worked out off the page, in a worker with a budget of a second and a half.

### Quests — what the sea hands out free

![The Quests screen, grouped by how often each comes round](docs/media/quests.png)

A new tab. Every quest that pays in a ship material, grouped by how often it comes round, with the ones paying in something your plan still wants marked. Claiming puts the reward in stock and ticks the quest until its own reset.

- Tick several and **Finish** records them together as one undoable change.
- A pick-one reward is remembered, so the next claim takes the same one in a single press.
- Keep a set you run every day as a named group, star the ones that matter, and filter by what is still to do, what your plan wants, or one reward in particular.

### Ship — the other half of a ship

![A Carrack with two of its parts on; typing in the Sailing Mastery moves every number](docs/media/fit-a-ship.gif)

A new tab. The **Ship** screen carries every hull in the game’s own numbers and fits it out as five slots — the four parts and the sea crystal — each taking the best you already hold, or one you choose.

- All 287 sea crystals from Eltro to Rusalka, plus Ebenruth’s Nol and the Oceanteared Nol, chosen by grade with the effect beside the name.
- A crew planned against the hull’s seats and cabin space: contracts, condition, food, first mates, and the certificates on the shopping list; a sailor’s real numbers can be typed in and are judged against the band their level can hold, and a log of the levels reached tells a fast grower from a slow one.
- Your Sailing Mastery counts toward speed, acceleration, turn and brake; the hold reads as a sum of lines, and says how far past its limit the hull will still sail.
- Keep a whole fit-out as a named **setup** and switch between them here or from the Map, where the route is timed.

### Ship — your build in a link

![Copy link on the Ship tab; opened on an empty save, the link says what the ship is, lists its parts, and one press makes it yours](docs/media/share-a-ship.gif)

The hull, its four parts, the crystal, the roster and who sits where, in one **Copy link**. Opened at the other end it says whose ship it is and what is on it, marks each part you already hold, and offers **Make it my ship** — or queues the missing parts as builds, so the Plan prices the way to it.

- Looking costs nothing; taking it replaces that hull’s parts and seats and your roster, and one Undo takes it back.
- A sailor’s typed numbers travel with the roster, so a crew someone has measured is the crew you get.
- On the Community tab a place on the Best ship board opens the same way: that sailor’s boat stood up on the Ship tab, to look at and not to keep.

### Community — the harbour

![The hall of fame: sixteen boards, with your own places at the head of it](docs/media/community.png)

A new tab, where there is sign-in: sixteen boards — mastery, the best ship, the best sailor, the most silver from runs, the most monsters hunted, the luckiest at the anvil and the rest — and the fleet in numbers: the hulls most sailed, the parts most fitted, the islands most plotted, the quests most done.

- Only the sailors who take part are on it, by name or as an unnamed sailor, and what would be shared is shown before anyone agrees.
- A place on a board opens what it is about: the Ship tab stood up on that sailor’s boat, to look at and not to keep, one press back to yours.
- The profile keeps a **tally** of the career — quests claimed, runs sailed, things made, attempts at the anvil; Undo takes a count back with the thing it counted.
- **Menu → Feedback**: something wrong, an idea, or something else, with the section and the build attached; it reaches whoever runs the site.

### The yard — what the sea brings back to it

The Plan, the Inventory, the Workshop and To Get are as they were, with what the new tabs feed them: a **Today** strip on the Plan with the quests still open that pay in something on your list, the time to the daily, weekly and barter resets, when Vell is next up on your servers, and the pace each build has been moving at.

- Anything the Central Market sells is priced from the Market itself, per region, and the app says how old the number is; the last prices a browser saw stay on hand offline.
- Vell’s EU and NA timetables, correctable where they are shown, with a reminder a quarter of an hour before — by push, where the deployment has a key pair.
- The trophies the sea monsters drop are in the book: a Usable Pirate Ship’s Remains chops into a Deep Tide-Dyed Standardized Timber Square, a Khan’s Tendon dries into ten Moon Vein Flax Fabric, ten Broken Cannons or two hundred seals make a Cox Pirates’ Artifact. The plan still buys those unless you switch one to *Craft it*, since the shop is the road and the trophy a side door.
- The small craft too: a Cog two ways, three rowboats and a raft.
- Every kind of item has a **home**: an item’s count is what is in your bags plus every storage you have noted it at, a trade good is never in the bags, and new goods can land at Iliya instead.
- **Redo** beside Undo; Import asks whether to replace or merge, keeping the higher count of anything counted twice; exports are dated; the shopping list copies as **CSV** and prints legibly on white.
- A field guide behind one quiet dot: the game’s own windows, so a number here can be traced to the screen it came from.

### Around the app

Every section sits in a **dock** across the top of a wide screen, the icon over the name; on a phone four sit at the thumb and the last slot opens the menu. That **Menu** — `M` on the keyboard — is the one menu the app has: every section, Find, the trip log, Undo and Redo, your save, the help and the settings.

- **Find** on Ctrl+K (or `/`): an item opens in the Inventory’s panel, a tab opens; the digits 1–9 switch tabs, `0` the tenth.
- **Log a trip** records everything you brought back in one box, as one undoable change.
- **Profiles**: separate saves on one browser, for an alt or a what-if; the Map’s routes and traces and the Barter tab’s board and run belong to the profile, so they export, sync and switch with it.
- Every choice the app asks for goes through one picker: pictures, a fact beside each name, a search that ranks a name starting with your letters first.
- The address bar names the tab and the open item, so a place survives a reload, travels in a link, and Back retraces your steps.
- Quantities read the way your browser writes them, and item look-ups open BDOCodex in any of twelve languages.
- A **light theme**, under Menu → Theme, that follows the system when asked. One phone query, so a phone on its side gets the phone’s shell — and on the Map, the chart — instead of the desktop’s header eating the screen.
- Hit areas of forty pixels under a finger; the faint inks lifted to read against the ground; the bottom sheets clear a phone’s gesture bar; a name on every search box, a state on every filter, a name on every dialog; Escape shuts the menus.
- A thing done is answered with a small burst of light where the tap landed — a soft glow instead when motion is asked to keep still.

### What the save keeps

A build’s route choice, the sort and the filters on the Plan and the Inventory, each tab’s place on the page — all kept across a reload.

- A **named route** is never dropped to make room for “Previous route”, which has a slot of its own; a ninth asks which to replace.
- The undo history remembers only the fields a change touched and is trimmed to a budget in bytes; a write the browser refuses is said out loud, with **Export now** beside it, and a save that will not parse is copied aside before anything is written over it.
- An import says which names this version does not know. A link travels slim, says how long it is, and warns when a chat would cut it.
- The game file’s **Restore** puts the old block back byte for byte, whatever Version the client writes, BOM kept; the file from before the first write stays beside it as <code>gameVariable.xml.orig</code>.

### Underneath

None of this is visible, and all of it is why the rest works.

- Every screen is its own module; the planner stays pure, and each screen is a projection of it.
- Offline, the app runs from a snapshot of one deploy — never a mixture of two; a newer deploy installs behind the page and waits for the next visit.
- The barter catalogue is served as data rather than as script, and everything heavy travels compressed; the tiles are told to be kept for a year by every cache on the way.
- The tour’s library is vendored, so the page needs no CDN and the CSP can stay shut.
- <code>/healthz</code> says whether the database answers; push subscriptions go only to the real push services; an Origin check on every write; a schema version and a runner for the next change; <code>npm run backup</code> and <code>restore</code>.
- The Market relay spends at most twenty-five seconds on a call and answers the rest from the copy it holds.
- A test suite of 561, run on every push, covering the cost model, the sync API and the client in a real browser.

### The tour, and the film

The guided tour walks the new sections as well as the yard, pointing at each thing on your own screen, and the walkthrough film goes on from the yard to the sea and the harbour — a run on today’s board, sailed on the chart. Neither is a mock-up: they drive the real app, so a screen that changes makes them wrong until they are shot again.
