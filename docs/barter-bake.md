# Baking the barter tables from the game

The day's barter boards, and everything about each exchange, come out of the
game client's own files. After a patch, run the bake: it reads the installed
game, writes `js/barter_game.js`, and says what the patch changed.

## After a patch

1. Let the game finish patching (the launcher, not the game, is enough).
2. Run:

   ```sh
   npm run bake:barter
   ```

   Options, all optional:

   | | |
   |---|---|
   | `--game DIR` | the install; default `$BDO_GAME`, else the Steam folder under `~/.local/share/Steam` |
   | `--extractor PATH` | `bdo-data-extractor`; default `$BDO_EXTRACTOR`, else the one on the `PATH` |
   | `--dry-run` | print the report, write nothing |
   | `--work DIR` | where the extracted files and the report go; default a new folder in the system temp |
   | `--keep` | keep the extracted files (some 400 MB) |
   | `--raw DIR --build DIR --client N` | bake from files already extracted, with the client version by hand |

3. Read the report it prints (also saved as `report.txt` in the work folder):
   every slot that changed on either board, every random group whose options
   changed, the Special Barter window, the re-roll settings, and anything the
   app has no data for -- a barterer missing from `js/barter_npcs.js` (with
   the chart position worked out from the game's spawn point) or a good
   missing from `icon_mapping.json`.
4. `npm test`, then commit `js/barter_game.js` and `js/barter_gates.js`.

A run on unchanged files reports "no change" on every line; that is the check
that nothing was misread.

## The extractor

[bdo-data-extractor](https://github.com/iDevelopThings/bdo-data-extractor),
a Go program. Build it once and put it on the `PATH` (or point
`BDO_EXTRACTOR` at it). The bake runs three of its commands:

- `meta --game G`: the client version, recorded in the bake.
- `extract --game G barter DIR`: the barter tables, UI scripts and textures.
- `build --game G --out DIR`: `items.json` (item names) and `npcs.json`
  (barterers and their spawn points). About ten seconds.

Flags go before the positional arguments, or it silently falls back to a
Windows path. It does not decrypt: the bake decrypts `barter_npclist.bss`
itself (ICE, `tools/barter-bake/ice.mjs`).

## What the files hold

Decoded in `tools/barter-bake/tables.mjs`; the field offsets are written out
there. Every table is a `PABR` file: magic, row count, rows, then a string
table whose offset is the last eight bytes. A parse that does not end exactly
there is refused.

**`barter_normal.bss`: two boards.** The trade board has 91 barterers × 40
rows, and the ship-material list 91 × 41. A day's board (a "seed" in the
game's scripts, a layout to the community) is one row index used at every
island at once. Every offer carries:

- its goods and both quantity ranges
- the base Parley, before the sailor's discounts:
  - 14,286 for a trade
  - 21,650 for Crow Coins
  - 61,430 on the material list
- the exchanges a day
- the Total Barters that open it
- a category bit
- a weight out of 1,000,000: the chance the offer shows at all. Most are
  always there; a few are rare, like the Wandering Merchant's Ship at 3% on
  layout 31. Most material slots are 0 (never).

**`bartersubgroup.bss`: the random picks.** A slot with no goods is not empty:
its u16 at +62 names a group, and the board shows one of the group's options,
each as likely as the next. The groups come in three kinds:

- **Level 4 item or Crow Coins**: Ajir on layout 31 is Panacea → Statue's Tear
  or Panacea → 40–60 coins.
- **Level 7**: the four [Level 7]s a mainland island pays.
- **Material**: 20 to 60 options.

Each option has its own daily count, Parley and Total Barters gate, so a
low-count sailor sees fewer options. Two blocks: the trade board's groups,
then the material list's.

**`barter_special.bss`**: the Special Barter window (gold bars for maps,
crystals and coins by the thousand). Not a daily board.

**`barter_npclist.bss`**: region key → barterer (npc id). ICE-encrypted.

**`barterresetoption.bss`, `barterlifelevelinfo.bss`**: pairs of u32. The
first is the board's re-roll settings (a board can be changed a few times a
day at a cost in exchanges; which number is which is not pinned down). The
second is the barter skill's experience per level.

Still unknown, and kept in the bake as read (`k58`, `k8`, `k64`): the u32 at
+58 of an offer (1,000,000, or 0 on unused material rows), and the u32 at +8
of a group option (2 to 68; 68 on every Level 7 pick).

## How it was checked

Against the whole of layout 31 as the game showed it on 2026-09-27: 77 rows of
77. That covered goods, exchanges a day, the coin amounts shown inside their
ranges, and the 11 islands missing from the screenshots, all locked above
the sailor's 4,406 barters. Against the five material boards read off the
barter window: 220 offers of 220. `test/barter-bake.test.mjs` holds the baked
file to both.

## Layout names

The community numbers the trade layouts 1–35E. A row keeps its name from one
bake to the next (`LAYOUTS` in the baked file); the first names came from
`js/barter_gates.js`, which matched the rows against the recorded layouts. The
material list's rows are named A–E where a board has been read off the game
and are otherwise known by their row.
