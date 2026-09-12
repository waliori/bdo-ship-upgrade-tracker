#!/usr/bin/env bash
# The guide films, end to end: shoot the chapters, then lay the
# narration under each and write its captions.
#
#   PORT=8765 node server.js &
#   ./tools/capture/guide.sh                 # all five
#   ./tools/capture/guide.sh the-chart       # just one
#
# Re-rendering after a wording change is the cheap path and the one this
# is built around: the voice cache keeps every line that did not change,
# so a chapter whose script moved by a sentence costs one synthesis and
# one shoot rather than a recording session.
#
#   CHROME=/usr/bin/chromium PORT=9000 ./tools/capture/guide.sh
#   VOICE=piper VOICE_NAME=en_GB-alba-medium ./tools/capture/guide.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

# The pace of a narrated chapter, which is not the pace of a six-second
# GIF. The voice reads a little above its natural rate, the silence
# between lines is trimmed to a breath, and the pointer stops touring
# the screen between presses -- sixty glides at the scenes' 620ms is
# half a minute of watching a cursor travel. Every one of these is an
# override with a default behind it, so the README scenes keep theirs.
export VOICE_RATE="${VOICE_RATE:-1.12}"
export VOICE_GAP="${VOICE_GAP:-140}"
export GLIDE="${GLIDE:-380}"
# And the finished film runs a little faster than it was shot. This is
# applied in the one encode mix.mjs already does, so it costs no extra
# generation; `atempo` keeps the narrator's pitch where it was.
export SPEED="${SPEED:-1.3}"

# A folder of its own, not shared with the README scenes. shoot.sh
# converts every webm it finds beside it, and a two-minute chapter
# handed to a GIF encoder comes out at fifty megabytes.
RAW=tools/capture/out/guide
OUT=docs/media/guide
mkdir -p "$RAW" "$OUT"

CHAPTERS=("$@")
if [ ${#CHAPTERS[@]} -eq 0 ]; then
	CHAPTERS=(the-yard to-get quests your-ship the-map a-run the-harbour)
fi

# Shot and mixed one at a time, rather than every shoot and then every
# mix. A chapter that dies half way used to take the finished ones down
# with it -- they were shot, and the mix loop behind them never ran --
# which is a poor trade for a step that costs seconds.
for name in "${CHAPTERS[@]}"; do
	echo "== $name"
	node tools/capture/guides.mjs "$RAW" "$name"
	node tools/capture/mix.mjs "$RAW/$name" "$OUT"
done

# The six end to end, as the README's walkthrough and the film the app
# plays under Help. Rebuilt whenever all six are on disk, so re-shooting
# one chapter replaces it in the joined cut too -- there is no separate
# thing to remember to re-render.
missing=0
for name in the-yard to-get quests your-ship the-map a-run the-harbour; do
	[ -f "$OUT/$name.mp4" ] || missing=1
done
if [ "$missing" -eq 0 ]; then
	echo "== the whole film"
	node tools/capture/join.mjs "$OUT" docs/media/walkthrough
else
	echo "== skipping the joined film: not all six chapters are shot yet"
fi

echo "done -- $OUT"
ls -la "$OUT"
