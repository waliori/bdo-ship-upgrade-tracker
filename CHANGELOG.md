# Changelog

What arrived between one version of this app and the next, written for
someone who has been away. The same notes are in the app itself, under
**Menu → What's new** — this file is generated from them by
`node tools/build-changelog.mjs`, so the two cannot drift apart.

## 1.3 — The day the sea will actually give you

*2026-09-15*

Two things the app was guessing at, and it turns out the game says both of them out loud. A board is no longer everybody’s board — it is **the one your barter count can actually sail**, read from the game’s own table. And a day of dailies and weeklies is no longer a list to work out for yourself: it is **one loop**, with a ground picked for every hunt, the kills added up, and nothing hunted after the man who pays for it.

### Asked for by you

Two players wrote in, and both were right. One of them twice, about the same thing.

- **Zelpha** — *“rolled layout 5, i have the luivano/duch/randis chains but the other 3 arent available … picked eveto having liquor>urn but mariveno for example has nothin”* Not his luck: the game gates *each exchange* on its own barter count, and the app was drawing a board for an account that had unlocked everything. That is **the board you can sail**.
- **cdwg** — *“Equipped ship gear should be factored into the available hull weight; currently it does not appear so be factored into the available weight.”* It was not — and the ship’s own window is the figure to agree with. Ten to twenty LT on a fitted hull, which is exactly what it came to: **what is bolted on is cargo too**.

The box is under **Menu → Feedback**. It reaches whoever runs the site.

### The board you can sail — not everyone else’s

![The board bar saying how many islands the barter count leaves out, and the list of them](docs/media/your-own-board.gif)

An island can be open to you while the one thing it is offering today is not, and its barter window is then simply blank. The board now leaves those out and says so.

- The counts are the game’s own, baked out of the client: **every exchange has its own total**, not every island.
- At **150** barters a board is short 32 islands of 84; at **1,082**, 20; past 20,000, none.
- The bar says how many are left out and **what opens the next one**, and will list them with the offer each is showing.
- Where the client ships no row — two tiers it leaves out — you can still say **“it will not trade with me”** and that island leaves the board until your next unlock.

### Today’s errands — the whole day as one loop

![The errands panel: a call a line, what to kill and how many, and the loop drawn on the chart](docs/media/todays-errands.gif)

Every daily and weekly you have not done, in the order that sails shortest. On the chart’s **Grounds** tab: pick a harbour, press the button.

- A hunt is a **choice of grounds** — the Hekaru have four — and the one that suits the rest of the day wins.
- **Seven Black Rust**, not one and two and four: the kills at a call are added up, and the hand-ins at one wharf are one call.
- A ground is **never called at after the man who pays for it**.
- The Old Moon Guild lets you do one of its four hunts a day, so it takes the one whose species a weekly already wants — the same kill paying twice.
- The three quests that ask for young sea monsters take **any** young one, so they ride on whatever young ground the loop already passes.

### A call you can take hold of

![A call opened: every quest done there, what it wants, what it pays, and the ways out of it](docs/media/a-call-in-hand.gif)

Press a step and the chart flies there and the call opens — every quest done at it, with what it wants, where it hands in and what it pays.

- A way through to **its row on the Quests tab**, and a way to **drop it**.
- Dropping is not ticking off: the quest is not worth the detour *today*, so the loop is worked out again without it, and the panel says what was put aside and offers it back.
- **Draw it** puts the loop on the Draw tab as a trace — named, keepable, shareable as a link.
- **On the game’s map** writes it as bookmarks, numbered in sailing order and named by the work: *12: 7x Black Rust*.

### Hunt where the monsters are

A habitat marker is a caption. The game’s world map draws one icon per named ground, placed where the words want to sit — and the app was steering for it. The Black Rust marker is the better part of **ten kilometres** from the nearest Black Rust; the Ocean Stalker’s is five, the Nineshark’s three and a half.

- A ground is now the middle of a cluster of the species’ **own spawn points**.
- And a ground is water, not a point, so the call is put on the part of it the loop passes — and slides along it once the order is settled.

### The crocodiles are where the crocodiles are

The Lyngbakrs drove the Saltwater Crocodiles off that ground on 27 August, and the run in the Courses list was still pointing at it. It calls at their water off Cheongsa now, and is **shorter** than it was.

- The Lyngbakr ground is a course of its own: out and back from Gangman’s wharf, where its weekly is handed in.

### A quest wears its own picture

The icon BDOCodex draws beside each quest, on the Quests tab and small wherever else a quest is named. Twenty-three pictures for thirty-nine quests, which is the point — every Ravinia letter is one picture, every Old Moon Guild hunt another, so a long day’s list sorts itself by the kind of work in it.

### What is bolted on is cargo too

A part gives the hold its Weight Limit and then sits in it, like anything else you put aboard. The app counted only the giving, so every figure it quoted was a little larger than the one the ship’s own window shows — and a run is planned against that figure.

- **Every part weighs its own LT**, the same at +0 as at +10: a Chiro set is **9** off the hold, a Falasi set **18**.
- **The sea crystal is one litre** — all two hundred and ninety-five of them, Eltro to the Nol.
- **The Otter’s rod is another**, and only where there is a fishing place to install it: a Carrack has one, a Panokseon has none. A sailor in the Fish seat is a rod aboard.
- The hold’s line-by-line sum names them — *4 parts, the crystal and the Otter’s rod, their own weight −20* — and every chain, material run and stock run is planned against the smaller, truer number.

### And the release notes keep the old ones

This window now carries every release before this one, shut, each worth a line until you open it — for anyone who has been away longer than a week.

## 1.2 — What a day is for

*2026-09-14*

A day at sea had one shape: climb as high as the board goes, sell the top, count the silver. It has four now — **silver**, **a stock**, **Crow Coins**, **a material** — and the run is counted in whatever the day was for. Around them a clock that follows you out of the harbour, a sheet that says a thing once, and the bug that made “build the stocks” look mad.

### Asked for by you

Five players wrote in. One of them wrote most of this release.

- **Oni** — *“just wanna fill storage first. Have all 72 type of base matterial ready … the is any way to build road to fill all low lvl and storage them?”* That is **A stock**. The word that made it a goal rather than a setting is *sell*: a run that sells nothing cannot be scored in silver.
- **Oni** — *“can u add timer? that u can click and it start count time and make a sound like microwave when don’t xD bcs sometime I forget that I send a ship to route”* That is **the clock** — and the two windows he asked for an hour later are **the shelves** and **Today’s boards**.
- **Zelpha** — *“grabbing 16 marine helms for a barter that only has 6 trades available … it gives a comically large number for the hold before dumping it all back in”* Not misusing the site: **two bugs**, and the second was hiding the first. Both in *Put right*.
- **Fraul and RENGEREL** — *“can set run for cc? — crow coins?”* That is **Crow Coins**, the fourth kind of day.
- **Yuki** — *“Does it have the siren spawns? I can’t find an option for it in map”* It does now: the **Hollow Maretta**, and an ocean map read by its own marks rather than fitted by hand.

The box is under **Menu → Feedback**. It reaches whoever runs the site.

### A stock — a day that is not for silver

![The stock sheet: a target a level, a ceiling, and how many days it takes](docs/media/a-stock.gif)

Say the pile you want. Nothing is sold, the climbs stop where you say, and the run is scored on what it banks.

- A target is **per good**, and the row says what it comes to: thirty at Level 2 is thirty of each of the fourteen.
- It is a floor as well, so the rule is one line: **fill a level before you climb from it**.
- **Climb no higher than** — a [Level 4] you already hold is stock, not fuel.
- *1,517 goods short · 76 more runs · about 19 days · 56 storage slots.*
- The shore goods can come from **your own pile** rather than the Market, and a way of running can be **saved under a name**.

### Crow Coins — the fourth kind of day

![A run for Crow Coins: the chains that cash a Level 4, counted in coins](docs/media/crow-coins.gif)

Every board has ten to fourteen islands paying in coins, and they take a [Level 4] and nothing else. So a coin run is a climb to four, cashed in.

- Scored in coins: *the most coins*, *the most an hour*, *the most a Parley unit*.
- And it says what they are for: *3,715 this run · 17,600 short of the 19,600 your builds want · 5 more runs like this one*.

### The clock — a bell at every stop

![The clock started on a run, counting to the next stop](docs/media/the-clock.gif)

Sail this run starts it at that run’s own estimate. It counts up, and rings at every stop rather than only at the end.

- A **ship’s bell**: a pair struck as each stop comes up, eight bells when the run is done. Made, not fetched — it works offline.
- The stops carry **your own pace**: seconds for bartering and going on, seconds for a wharf or a quest.
- Ticking a stop off **re-bases the rest**, so a slow island does not make the whole run chime early.
- And it reaches **every device signed in to your account** — the phone in a pocket, with the tab shut.

### The run sheet — two shelves, and one list

![Load before casting off, and in the storage after](docs/media/two-shelves.gif)

What to load, and what is in the storage after, tiled the way the game’s own window is. Everything that used to be said twice is said once.



### Today’s boards

![Every run since the refill, what it loaded and what it brought back](docs/media/todays-boards.gif)

Every run recorded since the refill: what it loaded, what it came back with, and the day’s totals across the Parley bar.

- What it will **not** do is guess the next board. A refresh deals a different layout, and the panel says so.

### Put right

- **A chain loaded the whole storage** — sixteen helms for an island with six trades in it, ninety-seven thousand LT in a hull that carries eleven, and the rest put back at the first wharf. It loads what the first rung can take now.
- **A floor was measured against the hold**, so “keep forty” meant *carrying* forty before you could spend one. It counts the pile now, wherever it is kept.
- **Notifications did nothing on a phone.** They go through the service worker, and where they cannot work the button says why.
- **Vouchers are a choice**, and go in as soon as the run needs one and a whole quarter fits — which starts the two-hour cooldown as early as it can be started.
- **“Build the stocks” is now “Sell the top, keep a floor.”** It sells; the floors are there so that selling does not strip the pile.
- The hold bar is **two columns** — what the hull carries, what there is to spend — with a real way into the hold.

### The chart — the siren, and a map read rather than traced

The **Hollow Maretta** is a habitat with its portrait and its thirty-eight ringing spots. The ocean map behind them is no longer fitted by hand: the crosses are found by their glow and the transform solved for — twenty world units to the pixel, landing within half a pixel on 325 marks.



### And the app has a name

**Sailor’s Log.** *BDO Ship Upgrade Tracker* described what it did in its first week. It plans parts, quests, barter routes and the sea itself.



## 1.1 — The plan, and the sea you can actually reach

*2026-09-11*

Two players asked for the two big things in this one, and both asks turned out to be the same complaint from different ends: the app knew a great deal and left the deciding to you. **To Get** now says how each thing *should* be got rather than only how it can be — one route through everything left, in the order it is done — and every barter plan is cut to the islands your own **total barters** have opened. Around those: the chart **stands up** on the game’s own terrain, the barter forecast counts how often the offer is really on the list, a crew reads off your own screenshots, the numbers about you — the nest of Bos’n Jacks among them — are typed once and read everywhere, and the boards keep up with your save.

### Asked for by you

Four players wrote in. Two of them set the shape of this release; two more put right things the app had wrong — a barter slot the game had quietly changed, and a nest of birds it was not counting at all. Every one of the four was a better question than the ones being asked inside. Thank you.

- **Kristofer** — *“it would be really convenient if, after you input what you currently have, it could suggest the most efficient way to obtain the remaining resources … it tells you how each **can** be obtained, but a logic to suggest how each remaining resource **should** be obtained would be fantastic.”* That is the whole of **the way to get it**, and the word *should* is what sent it after the places the sources compete rather than after a longer list.
- **Zelpha** — *“I wanna use the barter planning page but I’m only at 480 total barters, it would be nice if I could put that in somewhere and it’d limit the routes based on what I have available.”* That is **the barter count deciding which islands exist** — and it was worth more than a filter: fifteen of the forty recorded boards’ chains climb through an island 480 barters cannot reach, so that page had been quietly wrong for everyone below the thresholds.
- **RENGEREL** — *“They did change the octagonal box from my combo 16 in grandiha to a statue’s tear. Not sure when they did that, but must have missed it. Next maint they should be changing the tear in my combo 31 at dallae pier … also 7A, just finally got the wandering merchant trade”* That is a **layout drifting**, and it is the one way this record goes wrong: the game edits a single slot at a maintenance and leaves the layout’s number alone, so the island and the reward still match and only the good the slot eats has moved. A stale give is worse than a missing one — the board rules a layout out on an island that disagrees, and one wrong row can leave a real refresh unnamed. The record was refetched the same day, 444 refreshes now where it had 420, and both of his were already in it: Sabnipu at **Grándiha** on layout 16 eats a *Statue’s Tear* for the same Moonlit Crystal Lamp, and **7A** has the Wandering Merchant’s row at last — a Green Salt Lump for Crow Coins, at the barterer three thousand barters opens. The fetching tool carries an override now for a change reported before the sheet has it, and says at every run which of its entries the sheet has caught up with. Gangdalpo at **Dallae Pier** on layout 31 is the one being watched for.
- **NatSoFun** — *“is there a way to a[dd] pet weight stats for boat, its showing I got 200 less weight than I’m supposed to have … I was thinking maybe I take off one of my sailors but the boat speed would drop”* There was not, and the app was wrong for it. **Bos’n Jack** is the one pet in the game whose talent is ship weight — *Big Ship Inventory Weight*, fifty LT a tier, stacking across the five pets the game lets out at once — so a hold was short by the whole nest, and two hundred is exactly what one tier-4 bird carries. The birds are in the bar now with the rest of the numbers about you — and the second half of what he wrote is the reason it mattered: he was about to unseat a sailor, and pay for a wrong number in speed.

The box is under **Menu → Feedback**: something wrong, an idea, or something else, with the section and the build attached. It reaches whoever runs the site.

### To Get — one route through what is left, in the order you do it

![The plan: where it lands, what it costs, and the steps in order](docs/media/the-plan.png)

To Get answered “where does this come from?” for every line and left “so what do I do?” to you. The trouble is that the sources compete: a Candidum daily pays fourteen Tidal Black Stones *or* one Violent Wave Plywood and never both, the Crow Coins spent on plywood are not there for the tendons, and two materials off the ship-material list wait on the same three draws a day. Read one line at a time, every material’s best answer is “buy it”. Read together, the purse runs out and the answer changes. So the first view of To Get reads the whole list at once and gives every thing **one** way, with its reason on the line.

- It reads as **numbered steps in the order they are done** — run these quests, take these as quest rewards, buy at the Crow Coin Shop, barter for these at sea, hunt these, and on down to what has no rate at all — because the quests pay the coins that buy the shop’s half, and buying first empties the purse before the quests come round. Each step says where it happens, carries its own total, and folds away when you are done with it.
- Where the plan lands and every dial that moved it there are **one card**: *done in seven days*, the thing that sets that pace, the coins and silver it wants against what you can spare, and how many things across how many steps.
- It follows a **goal you state**, because what is scarce is yours to say and not the app’s to decide: **Soonest** spends the purse wherever it buys days, **Keep the coins** spends them only where nothing else sells the thing, **Keep the silver** leaves the Central Market alone. Beside them, how many days a week you are at sea, and coins you keep back that the plan will never spend.
- Three switches for **what you are actually willing to do**: the dailies and weeklies, bartering, and *hunt what drops*. The last takes every dropped material off the shopping list and never claims a rate for it, because none is published anywhere — on a two-part Carrack that is the difference between forty-three days and thirty.
- The quests are **errands**, not a list of names: how often, where it is done, the reward to take with its picture, the coins it pays — and when a pick-one was a real choice, what it was chosen over and why the other one is got another way. **Make it my pick** remembers it, so Claimed on the Quests screen records that reward in one press, and the Quests screen says the same thing beside a quest whose remembered pick differs.
- **What this plan will never do** is a line you can open, and it describes *this* plan rather than the idea of one: the rules in force right now, including the ones your own orders added.
- Every row names the ways the plan **could not put a number on** — what drops it, the worker node, the bulk exchange, the shop it did not use. Khan’s Tendon read as “nothing else sells it” beside a price, which is true of shops and false of Khan, and that is how somebody ends up buying a thing they could have killed for.
- The old reading is one chip away as **Every way**, and Copy and Copy as CSV follow whichever is showing. The Plan’s **Next** line names today’s first quest and what to take off it.

### Barter — only the islands your count has opened

The game opens the trade routes as your total barters climb: 150 opens Shipwrecked Haran’s Cargo Ship, 600 Lantinia’s Combat Raft, 3,000 the Wandering Merchant’s Ship. The app knew that table only well enough to print what the next threshold unlocks, and planned everything as though all ninety-one barterers were open to everyone. On the forty recorded boards, fifteen chains climb through an island a sailor at 480 barters cannot reach — and Tear of the Ocean is dealt at exactly one barterer, the one that opens at three thousand. Your count is part of every plan now.

- The join is the patch note’s own words: *opens* names a place and the chart says who stands there, so **twelve barterers are gated at the twelve counts the note states** and nothing is guessed. The seventy-nine it never names — the coastal [Level 6] and [Level 7] dealers among them — are open from the first day.
- What is behind a door is **said, not hidden**: the chains on the Barter tab sit locked and untickable under the ones that are yours, with a line above saying how many and what opens them; so do a material’s island chips and the islands the board question offers. The Map still draws the island and its card says what opens it, but no pin is lit there for something on your list.
- A forecast folds through the islands you can actually reach — a rung dealt in two places is priced at the open one — so where none is open the answer is the door itself: *locked, 2,520 more barters open the Wandering Merchant’s Ship*.
- **The whole table** is one press away, from the bar and from that line: every threshold, the island it opens and its barterer, ticked where it is already yours.
- **Nought barters is a real answer**, not a missing one. A sailor who has never bartered has the three routes the game starts them with and no more, and the app plans on that — so the bar asks for the number until it is given.

### Barter — how often the offer is really there

Every barter figure in the app assumed that what you want is on the list every time you draw it. It is not, and it is not a rounding error: of the four whole ship-material boards recorded, a Saltwater Crocodile’s Scale exchange was on *one*. A hundred of them read as five days where the boards say about eleven, and a plan wanting four materials off one list quietly assumed all four turned up, every day. The forecast now reads both records that ride with the barter table — those four complete boards, and the forty trade-list layouts seen across four hundred and twenty refreshes — and paces every rung by how often it was actually there.

- The old figure survives as the floor, with the sample named beside it: *about 11 days, 5 if the offer is always up · on 1 of the 4 boards recorded*.
- What is measured is **presence**, not how many islands showed it, so the change can only ever lengthen a forecast and never shorten one. A thing on every board recorded reads exactly as it did.
- Anything **no board has recorded** keeps the old best-case number and says so on the row, rather than passing it off as measured.
- Your own material-board diary is deliberately left out of the arithmetic: it records where a thing was and never where it was not, and a sample with no absences in it cannot measure absence.
- **A layout is not frozen.** The game edits one island’s slot at a maintenance and leaves the layout’s number alone — the island and the reward stay, only the good the slot eats changes — and a record that has not caught up is worse than no record, since the board rules a layout out on an island that disagrees. The forty layouts were **refetched**, 444 refreshes deep now: layout 16’s Grándiha slot takes a Statue’s Tear, and 7A carries the Wandering Merchant’s row that was missing from it. The tool that fetches them holds a correction for a drift reported before the sheet has it, and says at every run which of them the sheet has caught up with.

### The sailor — the numbers about you, typed once

The barter count, your level, the Parley, the vouchers and the Value Pack were entered on To Get — the one screen that is not about the sea — with a second copy of two of them on the Barter tab and Sailing Mastery off on the Ship tab, all of them read everywhere. They are **the sailor** now: one group beside the pouch, in the strip that follows you from tab to tab, typed once and read by every plan. Folded, that group still says the lot — *4,205 barters · Master 5 · 3+3 draws · NA* — and one press opens the fields.

- **The nest of Bos’n Jacks is part of the hold.** It is the one pet talent in the game that is ship weight — fifty LT a tier, stacking across the five the game lets out at once, and a tier 5 set as your Alpha carries 250 — so a sailor with five of them was being told a limit two hundred to a thousand LT under the one the game shows. It counts on the Epheria line, the Carracks and the Panokseon, and on nothing smaller: a Cog, a rowboat and the Bartali are not Big Ships, and the game does not pay them either. Five slots and six tiers, one press a bird and one for all five, and the whole nest lands as a single change.
- **The region belongs to the sailor**, not to a screen. Every Market price in the app is quoted in one region’s silver and Vell’s times are read off it, and it used to be set from a select inside one summary card. It is a chip in the bar now, with how old the prices are beside it and a refresh that says so.
- **On a phone the strip is one line.** Nine chips will not fit across 390 pixels, so the row scrolled sideways and half of it was a swipe away. A phone gets the reading — what is held, in red what is short, and the barter count — on a single line, and pressing it opens **Carrying** as a sheet where every field has the width of the screen.
- **How many sailors are out**, in the masthead, and beside it the crew — the accounts that have ever signed in. The first counts the browsers with the tracker open this minute. It needs no sign-in and keeps no address: a random token the browser makes for itself and two timestamps, which is why it says browsers rather than people.

### Ship — a crew read off your own screenshots, in any language the game is played in

Open Manage Sailors in game, screenshot it — or crop the Selected Sailor panel, either reads, and a mixture of both is fine — and drop the lot in. Names, levels, condition and every growth come back in a table to check before a single thing is written, and a sailor already on the roster is brought up to date rather than hired twice.

- **It reads every language the game runs in.** Say which one yours is and the reader speaks it: 식성 and 생활 물자 and Требуется кают are labels like any other, and a Cyrillic or Hangul or Han name comes back as the name. The Latin services read on the model already aboard; Русский, 日本語, 한국어, 中文, 繁體中文 and ภาษาไทย each fetch a megabyte or two more, once, the first time you pick them.
- Under the words is something none of the fifteen change — the weight carries LT, the condition is a pair over a slash, and the eight growths sit in the same order whatever they are called. So a label the scan could not make out costs nothing: the figure is still the fifth down the column, and a screenshot in a language nobody here can check still reads.
- It matters because the growths are the one thing the app could never estimate its way round. A levelled sailor rolls inside a hidden band, so a crew was worth its **average** roll and the ship’s speed came out under the game’s — 196.4% against 198.1% on a full Carrack, all of it in the crew. Read in, the rolls are the game’s and so is the number.
- The **ten per cent off Parley** is no longer a tick. It is Cleia’s skill and nothing else, so it is read off who is sitting at the First Mate seat: aboard, the Bartering line says so and names her; hired but ashore, it says what seating her would be worth.

### Ship — what a boat is for

Every hull now says what it is for, which the game’s own numbers never do: the Advance for bartering (the biggest hold, and a run pays by what it carries), the Volante for speed, the Valor and the Panokseon for sea monsters, the Balance for not choosing. It is on the ship card and in the picker — where searching “barter” finds the barter hulls — and the crystal picker marks the crystals that suit each.

- **Auto assign asks what the boat is for.** It used to add up the growths a seat doubles and take the biggest sum, which is a question nobody asked: the Sail doubles Endurance and Wits together, so a sailor with 1.1 speed and 4.8 acceleration beat one with 3.9 and 1.5, and the ship lost five per cent of its speed while the arithmetic said it had gained. It lays out every goal now and seats the crew for the one you pick.
- The **sailor list sorts by any growth** — Endurance, Wits, Awareness, Strength and the four cannon ones — as well as by type, condition and level, and the growth it was ordered by is shown on every card. Finding the fastest of eighteen sailors meant opening them one at a time before.

### Map — the chart, stood up

![The chart leaning over onto the game’s own terrain, and painted both ways](docs/media/stand-it-up.gif)

The chart has always drawn the sea from directly overhead, which is the right way to read a route and the wrong way to read a coast. The game’s own 3D map is not a picture anyone can copy — the client builds it on the graphics card every frame — but the terrain it is built *from* is in your own installed client, one mesh per 12,800-unit sector, on exactly the grid the flat chart’s squares are cut on. So the chart can be stood up: **⛰** on the zoom bar leans it over and puts the real ground under the sea.

- It is the **same chart**, not a second one. The same centre, the same zoom, the same barterers, wharves, habitats, traces and plotted loop — every one of them placed by the camera now instead of by the flat scaling, so they sit on the ground rather than beside it, and the switch either way lands on the water you were already looking at.
- **The world curves away** towards a hazed horizon, the way the game’s own map does and the way a planet does — it is what makes it read as a world rather than a diagram, and the pins, the route and the traces all bend with it.
- The ground **wears the chart’s own squares**: the islands are the colours you know, with the relief of the actual terrain under them. **Neon** draws contour lines over dark water instead, the way the game’s own world map does, and the interval widens as you step back so the lines stay lines.
- **Shift-drag leans and turns it**, an ordinary drag takes hold of the water and carries it, and **Level** puts you straight back overhead facing north. Where you left it is where it opens next time.
- The terrain is cut into the same kind of pyramid as the tiles — the far view draws a few hundred tiles instead of thirty thousand, and the closest zoom draws **the mesh the game itself draws from**, vertex for vertex. Tiles travel packed, a few kilobytes each, with the chart’s own thread of light along the top edge while they are coming — and **Keep this area offline** keeps the ground with the squares, so a crossing with no signal still has islands in it.

### The guide — seven chapters, narrated, and shot against the app as it is

The film was one thirteen-minute run at the whole app. It is **seven chapters** now, each a file of its own with its own subtitles and transcript, and it plays inside the app under **Help** with the seven listed as jump-to points — so the answer to “how does a run work?” is ninety seconds in, not a scrub through a film. Whatever is being named is lit on screen as it is said.

- **To Get has a chapter of its own**, because it is a planner now and not a list: the goal, the days a week you actually sail, the coins held back, what you are willing to do at all, and the day count moving under every one of those choices.
- The Yard opens on **the sailor’s numbers** and types them in, since the barter count decides which islands will deal with you at all and a plan made before it is given is a plan for somebody else’s account. The Map chapter leans the chart over onto the terrain, and the Ship chapter reads a crew off the game’s own screenshots.
- None of it is a mock-up: every frame is the real app being driven, and the only invented thing anywhere in it is the handful of sailors on the community boards, since a machine shooting a film has no deployment with players on it. Every picture in the README was re-shot the same way.

### Community — boards that keep up, and say how they count

What the boards show about you is worked out from the copy the server holds, and that copy is redrawn within seconds of a save reaching it — so a ship fitted, a sailor hired or a run logged is on the boards by the time you walk to them. Before, a change waited on the boards’ own window, and a card once opened never changed at all.

- Signing in puts you **on the boards by name** rather than leaving it to whoever went looking for the switch. The tab says so the first time you open it, **Leave the boards** is one press from there, and leaving is remembered — signing in again does not put you back. You can still be shown as an unnamed sailor, and what would be shared is still listed before you agree.
- Every board says **how it is counted**: a “?” opens the rule in full, and Best ship shows the sum behind the number — *hull 4,000 + parts 194 + crystal 20* — for the top of the board and for your own row.
- **The room the app was written for has a door now.** Discord stands in the masthead beside Help — the sailing server where the routes, the crew builds and what a patch moved are actually worked out, and where three of the four corrections in this release came from. On a phone it keeps its mark and drops the word.
- Your **fleet and your inventory are one fleet**. Keeping a setup puts its hull in the Inventory if none was recorded there, and a hull in the Inventory is a ship in your fleet, listed, sailable and counted on the boards, whether or not a setup was ever named for it.

### The yard — buying with coins, and a count that keeps itself

The app knew what a thing costs at Oquilla’s Eye and knew how many coins you held, and still made you do both halves of the sum by hand.

- Every Crow Coin line on **To Get**, and every coin-priced thing in the **Inventory** panel, carries a **Buy**: it asks how many, says what that costs and what is left of the purse, records the goods in and the coins out as one change, and opens on what the purse can actually cover. A sum that does not work is said rather than quietly clamped.
- **Total Barters follows the runs you sail.** The count that opens the next trade route was typed once and then left to rot while the app watched the very trades it counts go by. Recording a run adds its trades to it in the same change as the goods and the silver, so one Undo takes back all of it, and a run that carries you past a threshold says which route it opened. It is still a field you can type over.

### Put right

Things that were wrong, and are not now.

- **A hold barters to seventy per cent over its limit, not a quarter.** The islands deal right up to the point the hull stops moving, so there is no band where you can sail but not trade. The old figure came from one session in which a 27,000 LT hold seemed to refuse past about 34,000 — which is what a quarter over looks like, and is why it was believed. Chains that were cut short climb further for it, and material runs that were split into several departures go out in one.
- A **named first mate** has no growths of their own. The app credited each of the three half a point of speed, acceleration, turn and brake, which the game’s own panel shows none of, and fed them 100 rations a day where they eat 150.
- **Best ship** was <code>hull tier × 100 + enhancement levels</code>, which rated a +10 green Toro cannon exactly as highly as a +10 yellow Falasi one — three quite different Carracks all landed on 440 and shared first place. A slot is worth its part’s set first and its enhancement second.
- Ticking a stop **Done** on the Map’s run sheet no longer throws the list back to the top — on a nineteen-stop run that was a scroll back down every single time.
- The **hold bar** no longer prints its weight over its own second line, and the parley controls no longer run 613 pixels wide inside a 390-pixel screen.
- On a run’s checklist the **fourth** of an island’s four [Level 7]s can be tapped: the chips ran wider than the column and the last one sat under the hold beside it, taking every click aimed at it.
- Writing a route into <code>gameVariable.xml</code> keeps the untouched original aside as <code>.orig</code> and never writes it again. Before, the second write copied the first write’s output over the only backup.
- Two setups kept in the same moment are two setups; they shared an id before, and the second quietly replaced the first.
- Setting a nest of pets was **twenty presses and twenty saves**: each bird was a button stepped round its six tiers, and every step wrote the save, added an entry to the history and redrew every screen that plans against the hold. That is where the lag came from. The editor holds a draft and lands it in one change.
- On the chart, **Ground, Neon and Level shared a row with the step player** whenever a route was plotted — at twelve hundred pixels as well as on a phone — and the two-finger twist turned the chart against the fingers.
- A stored digest from an older build is **worked out again** rather than left standing, so a scoring change does not leave half a board wearing its old number.

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
