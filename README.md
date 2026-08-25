# ⚓ BDO Ship Upgrade Tracker

Plan Black Desert Online ship upgrades against **one shared inventory**.
Queue as many ships and parts as you like; the tracker works out what
each one still needs, what you can make right now, and what you have to
go and get — without ever promising the same 100 planks to two builds.

Runs entirely in your browser. No account, no server, nothing leaves your
machine.

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
- **Your purse** — Crow Coins, silver and enhancement stones ride along
  above every tab, since you spend them from every tab.
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

### Docker

```bash
docker compose up -d
```

or, without compose:

```bash
docker build -t bdo-ship-tracker .
docker run -p 8000:8000 bdo-ship-tracker
```

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

Crow Coin prices were checked against the shop at Oquilla's Eye on
2026‑08‑25.

---

## How your data is stored

Everything lives in your browser's `localStorage` under
`bdo-tracker/v2` — one object holding your stock, your build queue, your
craft-or-buy choices and an undo history. It syncs across tabs, and
**Export** writes the same object out as JSON.

There is no backend. Clearing site data clears your progress, so export
if it matters to you.

If you used an earlier version, the first load offers to bring your
per-ship counts across into the shared inventory.

---

## Project layout

```
index.html            the whole shell: masthead, tabs, screen
server.js             Express static server
css/tracker.css       the design system
js/
  ui.js               every screen, and the only place that touches the DOM
  state.js            the store: stock, targets, undo, persistence
  planner.js          pure planning — netting, explosion, enhancement steps
  recipes.js          recipes and enhancement chains
  ships.js            what can be queued
  sea_coins.js        Crow Coin prices
  falasi_vendor.js    Falasi's silver prices
  all_barter.js       barter routes
  guided-tour.js      the walkthrough
icons/                item and ship icons (WebP)
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
