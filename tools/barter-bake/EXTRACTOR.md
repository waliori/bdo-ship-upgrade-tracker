# The extractor the bake needs

`npm run bake:barter` reads the game's files through
[bdo-data-extractor](https://github.com/iDevelopThings/bdo-data-extractor), a
Go program that is not part of this repo. It has to be installed once, before
the first patch-day bake.

## Where it is now

A working build sits in an old session's temporary folder:

```
/tmp/claude-1000/-home-waliori-Storage-Big-Nextcloud-computers-Perso-Projects-bdo-ship-upgrade-tracker/2a8c1fee-256c-4575-9533-0e8ce7d62dfc/scratchpad/bdo-data-extractor
```

`/tmp` is cleared eventually. Copy it somewhere lasting, for example:

```sh
mkdir -p ~/.local/bin
cp "<the path above>" ~/.local/bin/bdo-data-extractor
chmod +x ~/.local/bin/bdo-data-extractor
```

If it is gone, build it again from the repository with Go, following that
repository's README.

## How the bake finds it

In this order:

1. `--extractor /path/to/bdo-data-extractor` on the command line
2. the `BDO_EXTRACTOR` environment variable
3. `bdo-data-extractor` on the `PATH` (`~/.local/bin` usually is)

The game install is found the same way: `--game DIR`, else `BDO_GAME`, else
`~/.local/share/Steam/steamapps/common/Black Desert Online`.

## Checking it works

```sh
bdo-data-extractor meta --game "$HOME/.local/share/Steam/steamapps/common/Black Desert Online"
```

prints `version=NNNN ...` (3458 on 2026-09-27). That number is the client
version the bake records.

## What the bake runs with it

| Command | What it gives the bake | Time |
|---|---|---|
| `meta --game G` | the client version | instant |
| `extract --game G barter DIR` | the barter tables (`gamecommondata/binary/barter*.bss`), plus UI scripts and textures the bake ignores | a few seconds |
| `build --game G --out DIR` | `items.json` (item names) and `npcs.json` (barterers, spawn points); about 400 MB of other data the bake deletes afterwards | about 10 s |

Two things to know when running it by hand:

- **Flags go before the positional arguments.** `extract barter DIR --game G`
  silently falls back to a Windows path and fails.
- **It does not decrypt.** `barter_npclist.bss` comes out ICE-encrypted; the
  bake decrypts it itself (`ice.mjs` here).

The files it reads and what they hold are in `docs/barter-bake.md`; the
decoders are `tables.mjs` beside this file.
