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

echo "== the film, both cuts"
node tools/capture/tour.mjs "$RAW"
node tools/capture/tour.mjs "$RAW" phone

echo "== webm -> gif"
# 900px at 13fps keeps most clips near half a megabyte. Two of them are
# lists that redraw whole: ticking a quest reflows every row below it,
# and typing a mastery moves every number on the ship card at once. At
# the common settings those come out three times the size of anything
# else here, so they are given a narrower frame and a slower rate --
# which costs nothing on a clip whose subject is a number changing.
gif_size() {
	case "$1" in
		claim-a-quest|fit-a-ship) echo "780 10" ;;
		*) echo "900 13" ;;
	esac
}
for f in "$RAW"/*.webm; do
	name=$(basename "$f" .webm)
	case "$name" in walkthrough*) continue ;; esac
	# shellcheck disable=SC2046
	./tools/capture/togif.sh "$f" "$OUT/$name.gif" $(gif_size "$name")
done

echo "== webm -> mp4"
./tools/capture/tomp4.sh "$RAW/walkthrough.webm" "$OUT/walkthrough.mp4"
./tools/capture/tomp4.sh "$RAW/walkthrough-phone.webm" "$OUT/walkthrough-phone.mp4"

echo "== stills"
cp "$RAW"/*.png "$OUT"/

# The app itself serves a few of these -- the What's New dialog shows one
# per headline -- and those travel inside the Docker image, so they get a
# narrow copy of their own. Full size is for the README, which GitHub
# serves and nobody downloads on a phone.
echo "== the set the app serves"
mkdir -p "$OUT/small"
for name in chart-the-loop draw-a-route fit-a-ship; do
	./tools/capture/togif.sh "$RAW/$name.webm" "$OUT/small/$name.gif" 560 9
done
for name in map quests; do
	ffmpeg -v error -y -i "$OUT/$name.png" -vf scale=560:-2 "$OUT/small/$name.png"
	ls -la "$OUT/small/$name.png"
done

echo "done -- $OUT"
