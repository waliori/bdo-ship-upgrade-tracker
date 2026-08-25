# ⚓ BDO Ship Upgrade Tracker

Plan Black Desert Online ship upgrades against **one shared inventory**.
Queue as many ships and parts as you like; the tracker works out what
each one still needs, what you can make right now, and what you have to
go and get — without ever promising the same 100 planks to two builds.

Runs entirely in your browser. No account, no server, nothing leaves your
machine — [unless you turn on sync](#syncing-across-devices), which is
opt-in, self-hosted and off by default.

![The Plan screen, part-way through two Carrack parts](docs/media/hero.png)

---

## The loop

### 1. Queue what you want to build

Any ship, any part, or a stack of materials. Order matters: when stock is
short, the build nearest the top of the queue gets it first.

![Adding a build from the picker](docs/media/queue-a-build.gif)

### 2. Record what you gathered

This is the thing you do day to day. Type into the box on any row — `4k`,
`250k` and `12,000` all work — and every build re-plans around it: bars
fill, the shortfall drops, and recipes move into *craftable now*.

![Typing in what you own; the plan re-computes](docs/media/record-what-you-own.gif)

### 3. Craft and enhance

The Workshop lists everything you have the materials for. Name a batch
size or take the lot; crafting moves real stock — ingredients out,
product in — and it can be undone.

Enhancement is separate, because ship parts keep their level on a failed
attempt. Record **Succeeded** or **Failed** and the stones come off
either way.

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
  own data back untouched.
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
The `+10` versions that the coming yellow-part update will consume are
already modelled.

**Panokseon parts** — Haemo's four green parts and the Byukgye's Enhanced
blue parts they become, with their blueprints from Dallae Pier Quarry and
the permit from Moodle Village Shipyard.

**What enhancement really costs.** Every enhanceable part carries its real
per-level success rates, and the Agris Essence pity caps that guarantee an
attempt after enough failures. So the plan budgets what the climb will
actually take rather than assuming every attempt lands — for a blue
Carrack part that is the difference between 500 stones and about 5,600 —
and the Workshop tells you the odds in front of you and the most it can
possibly cost.

Crow Coin prices were checked against the shop at Oquilla's Eye on
2026‑08‑25.

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

---

## Project layout

```
index.html            the whole shell: masthead, tabs, screen
server.js             static files, plus the sync API when configured
css/tracker.css       the design system
js/
  ui.js               every screen, and the only place that touches the DOM
  state.js            the store: stock, targets, undo, persistence
  planner.js          pure planning — netting, explosion, enhancement steps
  sync.js             optional device sync: pull, push, conflict
  recipes.js          recipes and enhancement chains
  ships.js            what can be queued
  sea_coins.js        Crow Coin prices
  falasi_vendor.js    Falasi's silver prices
  all_barter.js       barter routes
  guided-tour.js      the walkthrough
tools/check-env.mjs   npm run check -- validates a sync configuration
server/               only loaded when sync is configured
  config.js           what is switched on, and what is therefore offered
  db.js               libSQL schema and queries
  auth.js             the Discord OAuth exchange
  api.js              /api/me and /api/state
  session.js          signed session cookies, no session table
test/                 npm test — the server, and the client in a browser
icons/                item and ship icons (WebP)
og.png                the social preview card
docs/media/           the images and clips in this README
tools/capture/        the harness that generates them
```

The planner is pure: given stock, a queue and your craft-or-buy choices,
it returns a requirement tree per build, netted against one draining pool
of stock. The UI is a projection of that — no screen keeps its own copy
of anything.

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
