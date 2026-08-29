# ⚓ BDO Ship Upgrade Tracker

Plan Black Desert Online ship upgrades against **one shared inventory**.
Queue as many ships and parts as you like; the tracker works out what
each one still needs, what you can make right now, and what you have to
go and get — without ever promising the same 100 planks to two builds.

Runs entirely in your browser. No account, no server, nothing leaves your
machine — [unless you turn on sync](#syncing-across-devices), which is
opt-in, self-hosted and off by default.

![The Plan screen, part-way through two Carrack parts](docs/media/hero.png)

**In a hurry?** [Watch the two-minute walkthrough](docs/media/walkthrough.mp4)
— queue a build, choose how to get there, record what you gathered, make
something, and take the list shopping. It is the real app, captioned, and
there is a [narrower cut for a phone](docs/media/walkthrough-phone.mp4).
Both play inside the app too, under **Help**.

---

## The loop

### 1. Queue what you want to build

Any ship, any part, or a stack of materials. Order matters: when stock is
short, the build nearest the top of the queue gets it first.

![Adding a build from the picker](docs/media/queue-a-build.gif)

**Some ships can be reached more than one way.** A Caravel takes either a
plain Epheria Sailboat or an Improved one; a Galleass either Frigate. The
step itself is identical — bdocodex lists both with the same materials —
but the Improved route is a whole upgrade of its own first, and wants
four more Epheria: Old parts. It also adds a solo cannon volley, and its
quests can be done alone, which is a real reason to take it.

So queueing one asks which, shows what each costs, and the build then
says the route it is taking. Neither is marked correct.

![Choosing which way to build a Caravel](docs/media/choose-a-route.gif)

### 2. Record what you gathered

This is the thing you do day to day. Type into the box on any row — `4k`,
`250k` and `12,000` all work — and every build re-plans around it: bars
fill, the shortfall drops, and recipes move into *craftable now*.

![Typing in what you own; the plan re-computes](docs/media/record-what-you-own.gif)

### 3. Craft and enhance

The Workshop lists everything you have the materials for. Name a batch
size or take the lot; crafting moves real stock — ingredients out,
product in — and it can be undone.

Enhancement is separate, because an attempt can fail. Blue and green ship
parts keep their level when one does; the yellow Falasi and Cheongun tier
drops one, which is why Cron Stones are part of what an attempt there
costs. Record **Succeeded** or **Failed** and the materials come off your
stock either way.

![Crafting a batch of 40](docs/media/craft.gif)

### 4. Take the list shopping

Everything still missing, grouped by how you actually obtain it — Crow
Coin Shop, Falasi's silver, barter, worker nodes, hunting — with running
totals measured against what's in your purse.

![The To Get screen](docs/media/to-get.png)

---

## What else it does

### Hover anything to see what goes into it

Rows, tiles, craft cards, even the build picker. Your own counts show
beside each ingredient in teal or red. An enhancement level shows the
part and the stones one attempt costs instead.

![Hovering a material shows its recipe](docs/media/peek-a-recipe.gif)

### Record a level you already reached

A part and its ten enhancement levels are one tile, not eleven. Open it,
pick the level you actually have, and it is recorded — **no stones are
spent**, because the Workshop is for attempts you are really making.

![Recording a part at +7 without spending stones](docs/media/record-a-level.gif)

### See why a build needs a thing

The Plan is one row per material, which answers *what am I short of*. The
Tree is the same thing unflattened, and answers the other question: a
Carrack sits over the Caravel it is made from, over the Sailboat before
that, with the materials of each hanging off the step that wants them.

Enhancement chains start folded, because a `+10` pulling in `+9` pulling
in `+8` is ten rows that all say the same thing.

![The requirement tree for a Carrack](docs/media/the-tree.gif)

### Know what it will actually cost

Every part has a shop price, and none of them tell you what the thing
really costs. Open any item and it prices each route end to end: the
Crow Coin Shop's number beside what making one costs once *its*
ingredients are priced too, all the way down the recipe.

Crow Coins and silver are kept apart, because the game will not trade
one for the other, and anything with no price — bartered for, dropped —
is named rather than quietly counted as free. So a Carrack part reads as
*57,029 coins + 1b silver + 100× Violent Sea Monster's Scale*, not as a
number that hides the barter grind behind it.

Where an item can be both made and bought, both are shown side by side
with the one your plan is using marked, and neither is called the right
answer unless it beats the other outright. Each build in the queue
carries the same figure for what is left to finish it, which falls as
you record what you gather.

![Both ways of getting a material, priced](docs/media/what-it-costs.gif)

### Look anything up

Every item name in the app links to its page on
[BDOCodex](https://bdocodex.com/), in a new tab — in the Plan, the Tree,
the Workshop, the shopping list, and in the ingredient lists inside the
detail panel. Enhancement levels link to the base item, which is where
the level table lives.

### See who reserved what

Every material shows how much is spoken for by a build and how much is
still free, down to which build and through which recipe. When something
can be both made and bought, you choose, and the plan follows.

![The inventory, with an item's reservations](docs/media/inventory.png)

### And the rest

- **Undo** on every change, and a one-line **Next** banner that tells you
  the single most useful thing to do right now.
- **Your purse** — Crow Coins, silver, Sangpyeong Coins and enhancement
  stones ride along above every tab, since you spend them from every tab.
- **Export / Import** a JSON backup to move between machines.
- **A guided tour** that demonstrates on example data, then hands your
  own data back untouched, and a **Help** film of the whole thing end to
  end for when you would rather just watch.
- Works on a phone; the water shader is optional (`≈ Water` in the
  header).

---

## Running it

```bash
git clone https://github.com/waliori/bdo-ship-upgrade-tracker.git
cd bdo-ship-upgrade-tracker
npm install
npm start
```

Then open <http://localhost:8000>. Set `PORT` to use another port.

`npm test` runs the suite: the sync API against a throwaway libSQL file,
and the browser half driven in a real Chrome.

### Docker

```bash
docker compose up -d
```

or, without compose:

```bash
docker build -t bdo-ship-tracker .
docker run -p 8000:8000 bdo-ship-tracker
```

`docker compose` picks up a `.env` if there is one; plain `docker run`
needs `--env-file .env`. Neither is required to run the tracker itself
— see [Syncing across devices](#syncing-across-devices).

---

## What's covered

**Ships** — Epheria Sailboat, Improved Epheria Sailboat, Epheria Caravel,
Epheria Frigate, Improved Epheria Frigate, Epheria Galleass, Carrack
(Advance / Balance / Volante / Valor), Panokseon.

**Carrack parts** — all 16 of the craftable Chiro parts (Advance,
Balance, Volante and Valor × cannon, sail, figurehead and black plating),
including their processed materials, the blueprints from the Al-Nahad,
Racid, Lerao and Tinberra worker nodes, and the full enhancement chains.

**Panokseon parts** — Haemo's four green parts and the Byukgye's Enhanced
blue parts they become, with their blueprints from Dallae Pier Quarry and
the permit from Moodle Village Shipyard.

**The yellow tier** (August 2026) — the 16 Falasi Carrack parts and the
four Cheongun Panokseon parts, each consuming the `+10` blue part of its
own variant, with the three new coral materials, the Lyngbakr drops under
them, the five-billion-silver permits, and Sunset Tidal Black Stone at a
hundred Tidal Black Stones each. The blueprints are modelled as the
exchange they are — two Sunset Coral Essence each from Falasi, four from
Gangman — so a part shows the twenty essence behind its ten blueprints
rather than stopping at the blueprint.

Recipes were read off the workshop designs rather than the patch notes
alone, because the notes write one recipe for all four Carrack variants
and leave it open whether the Chiro part has to match. It does: an
Advance Falasi cannon takes an Advance Chiro cannon and an Advance permit.

**What enhancement really costs.** Every enhanceable part carries its real
per-level success rates, and the Agris Essence pity caps that guarantee an
attempt after enough failures. So the plan budgets what the climb will
actually take rather than assuming every attempt lands — for a blue
Carrack part that is the difference between 500 stones and about 5,600 —
and the Workshop tells you the odds in front of you and the most it can
possibly cost.

The yellow tier changes the arithmetic, because a failure there takes a
level rather than just durability. The Agris meter belongs to the step
and is only spent when that step succeeds, so falling past one leaves it
where it was — but the level below has to be climbed again from a meter
the last success reset. Compounded over ten levels that runs to around
52 million Sunset Tidal Black Stones, which is why Cron Stones are
counted as part of what an attempt costs rather than as an optional
extra. Protected, the same climb is about 72 stones and 30,000 Cron.

Crow Coin prices were checked against the shop at Oquilla's Eye on
2026‑08‑25. The yellow tier is from the 2026‑08‑26 patch notes, with the
rates and Cron prices cross-checked against BDOCodex.

---

## How your data is stored

Everything lives in your browser's `localStorage` under
`bdo-tracker/v2` — one object holding your stock, your build queue, your
craft-or-buy choices and an undo history. It syncs across tabs, and
**Export** writes the same object out as JSON.

By default there is no backend. Clearing site data clears your progress,
so export if it matters to you.

If you used an earlier version, the first load offers to bring your
per-ship counts across into the shared inventory.

---

## Syncing across devices

Optional, and off unless you configure it. The public site and any plain
`npm start` behave exactly as above: no account, no database, nothing
leaves the browser.

Given a Discord app and a [Turso](https://turso.tech) database, the
server also offers a **Sign in** button. Signing in stores one copy of
your inventory under your Discord account, so the phone you check on a
boat and the desktop you plan on hold the same numbers.

What it does and does not do:

- **Your browser stays the source of truth.** Sync is a mirror. Offline,
  or signed out, or with the server down, the tracker works unchanged.
- **`identify` and nothing else.** The Discord scope covers an account
  id to file the save under and a name to show in the header. No email,
  no server list, no messages.
- **Stock, builds and craft-or-buy choices.** Your undo history and local
  preferences stay in the browser, where they belong.
- **Conflicts are a question, not a guess.** Every save carries a
  revision, and a push built on a stale one is refused. When two devices
  have both been edited you are shown what each holds and asked which to
  keep — merging counts would invent a number that was never true. The
  copy you do not keep is one **Undo** away.
- **Deletable.** The account menu removes the stored copy and the account
  record with it. What is in your browser stays.
- **Sessions are a signed cookie, good for 30 days.** There is no session
  table, so a session cannot be revoked from another device — signing out
  clears that browser and nothing else. The trade is deliberate (no
  round trip per request, no rows to expire); if a machine you signed in
  on is lost, rotating `SESSION_SECRET` signs every device out at once.

### Setting it up

Copy `.env.example` to `.env` and fill in five values. Both `npm start`
and `docker compose up` read that file on their own:

| | |
|---|---|
| `PUBLIC_URL` | where your deployment answers, e.g. `https://sail.walior.it` |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | from a [Discord application](https://discord.com/developers/applications) → OAuth2 |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | from `turso db show <name> --url` and `turso db tokens create <name>` |
| `SESSION_SECRET` | any long random string — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Then check it before opening a browser:

```bash
npm run check
```

That asks Discord whether the client id and secret are a real pair,
connects to the database and creates the schema, and prints the exact
redirect URI to register. It never prints a secret.

Register `PUBLIC_URL` + `/auth/discord/callback` as a redirect URI on the
Discord application. To develop locally, add
`http://localhost:8000/auth/discord/callback` as a second one and point
`TURSO_DATABASE_URL` at a file — `file:./.data/tracker.db` — which needs
no Turso account at all.

Leave any of it blank and sync stays off, which is a deliberate
half-configured deploy falling back to the safe behaviour rather than
failing at the first sign-in.

`.env` is gitignored and excluded from the Docker build context, so the
secrets are never committed and never baked into an image -- compose
passes them to the container at run time. With plain `docker run`, hand
them over yourself:

```bash
docker run -p 8000:8000 --env-file .env bdo-ship-tracker
```

### Run exactly one of it

With sync on, the server keeps the current revision of every save in
memory and answers a push from there — that is what makes saving feel
instant, and it is only correct while **one process** owns the data. Two
instances behind a load balancer would each believe they held the current
revision, both would accept a push built on it, and one player's work
would vanish without the conflict dialog ever appearing. Scaling out
means moving that check back into SQL first.

One VPS with a proxy in front of it is exactly the shape this is built
for. Behind Cloudflare or nginx, two things are worth knowing:

- **Do not cache `/api/`.** Those responses are one account's, told apart
  from another's only by a cookie. The server sends `Cache-Control:
  no-store` and `Vary: Cookie` on every one of them, so a generous cache
  rule cannot serve one player's inventory to another — but do not add a
  "Cache Everything" rule that overrides it either.
- **Rate limiting is per account here**, not per address, because behind
  two proxies the client's address is several headers deep and easy to
  get wrong. Address-level abuse — sign-in floods, one noisy host — is
  the proxy's job, and it is much better placed to do it.

### If the database is lost

Nothing is lost. Every browser keeps its own copy in `localStorage`; the
database is a mirror, not the original. The next push from each player
writes their save back.

---

## Project layout

```
index.html            the whole shell: masthead, tabs, screen
server.js             static files, plus the sync API when configured
css/tracker.css       the design system
js/
  ui.js               the shell: render loop, event wiring, boot
  screen-*.js         one module per tab — plan, builds, inventory, tree,
                      workshop, to-get, map
  ui-state.js         the shared view state, recomputed from the store
  ui-bits.js          icons, linked names, priced costs — the screens' vocabulary
  pouch.js            the currency bar above the tabs
  peek.js             the hover card
  dialogs.js          toasts and dialogs
  fmt.js              escaping and number formats
  state.js            the store: stock, targets, undo/redo, persistence
  planner.js          pure planning — netting, explosion, costing, enhancement
  sync.js             optional device sync: pull, push, conflict
  recipes.js          recipes and enhancement chains
  ships.js            what can be queued
  sea_coins.js        Crow Coin prices
  falasi_vendor.js    Falasi's silver prices
  all_barter.json     barter routes, scraped from BDOCodex
  map.js              the tile viewer's arithmetic
  barter_npcs.js      where the 81 barterers are
  guided-tour.js      the guided tour
  enhancement.js      per-level rates, Agris caps, perfect-enhance costs
tools/check-env.mjs   npm run check -- validates a sync configuration
server/               only loaded when sync is configured
  config.js           what is switched on, and what is therefore offered
  db.js               libSQL schema and queries
  auth.js             the Discord OAuth exchange
  api.js              /api/me and /api/state
  session.js          signed session cookies, no session table
test/                 npm test — the server, the cost model, and a browser
icons/                item and ship icons (WebP)
icon_mapping.json     item -> icon file and BDOCodex page
og.png                the social preview card
docs/media/           the images and clips in this README
tools/capture/        the harness that generates them, film included
```

The planner is pure: given stock, a queue and your craft-or-buy choices,
it returns a requirement tree per build, netted against one draining pool
of stock, and a cost for any route through it. The UI is a projection of
that — no screen keeps its own copy of anything.

---

## Contributing

Useful things to send:

- **Data corrections.** Prices move, recipes change with patches. A
  screenshot of the in-game source is the fastest way to get one merged.
- **New ships and parts** as Pearl Abyss releases them.
- **Bugs** — what you did, what you expected, what happened, and your
  browser.

The README's images and clips are generated, not hand-recorded; see
[`tools/capture/README.md`](tools/capture/README.md) before changing the
UI so they can be re-shot.

---

## License

MIT — see [LICENSE](LICENSE).

## Thanks

Pearl Abyss for the game, [BDOCodex](https://bdocodex.com/) for item
data, and everyone who has reported a wrong number.

**Fair winds, adventurer.** 🌊
