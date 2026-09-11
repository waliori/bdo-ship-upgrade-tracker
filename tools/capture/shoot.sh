#!/usr/bin/env bash
# The whole shoot, in one go: every scene, both cuts of the film, and
# the conversions that turn the raw screencasts into what the README
# actually links to.
#
#   PORT=8765 node server.js &
#   ./tools/capture/shoot.sh
#
# Individual scenes are quicker to iterate on directly:
#   node tools/capture/scenes.mjs tools/capture/out craft
set -euo pipefail
cd "$(dirname "$0")/../.."

RAW=tools/capture/out
OUT=docs/media
mkdir -p "$RAW" "$OUT"

echo "== scenes"
node tools/capture/scenes.mjs "$RAW"

# The walkthrough is no longer shot here. It is the six narrated
# chapters joined end to end -- ./tools/capture/guide.sh, which writes
# docs/media/walkthrough.mp4 as its last step. tour.mjs still runs and
# still works; nothing builds from it.

echo "== webm -> gif"
# 900px at 13fps keeps most clips near half a megabyte. Two of them are
# lists that redraw whole: ticking a quest reflows every row below it,
# and typing a mastery moves every number on the ship card at once. At
# the common settings those come out three times the size of anything
# else here, so they are given a narrower frame and a slower rate --
# which costs nothing on a clip whose subject is a number changing.
# The run clip ends by flying to the Map, whose tiles repaint the whole
# frame, and is the longest here, so it goes narrower and slower still.
# The boards clip opens a full-screen card and then a whole other tab,
# so every frame in it is a new one; it gets the narrower frame too.
# The two sharing clips reload the page half-way, and the drawing one
# scrolls to the name field as well, so they go with the boards and the
# run respectively.
gif_size() {
	case "$1" in
		claim-a-quest|fit-a-ship|the-boards|share-a-ship) echo "780 10" ;;
		plan-a-run|share-a-drawing) echo "720 8" ;;
		*) echo "900 13" ;;
	esac
}
for f in "$RAW"/*.webm; do
	name=$(basename "$f" .webm)
	case "$name" in walkthrough*) continue ;; esac
	# shellcheck disable=SC2046
	./tools/capture/togif.sh "$f" "$OUT/$name.gif" $(gif_size "$name")
done

echo "== stills"
cp "$RAW"/*.png "$OUT"/

# The app itself serves a few of these -- the What's New dialog shows one
# per headline -- and those travel inside the Docker image, so they get a
# narrow copy of their own. Full size is for the README, which GitHub
# serves and nobody downloads on a phone.
echo "== the set the app serves"
mkdir -p "$OUT/small"
for name in chart-the-loop draw-a-route fit-a-ship share-a-ship; do
	./tools/capture/togif.sh "$RAW/$name.webm" "$OUT/small/$name.gif" 560 9
done
for name in plan-a-run share-a-drawing; do
	./tools/capture/togif.sh "$RAW/$name.webm" "$OUT/small/$name.gif" 480 7
done
for name in hero map quests community the-plan; do
	ffmpeg -v error -y -i "$OUT/$name.png" -vf scale=560:-2 "$OUT/small/$name.png"
	ls -la "$OUT/small/$name.png"
done

echo "done -- $OUT"
