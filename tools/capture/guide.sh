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

RAW=tools/capture/out
OUT=docs/media/guide
mkdir -p "$RAW" "$OUT"

CHAPTERS=("$@")
if [ ${#CHAPTERS[@]} -eq 0 ]; then
	CHAPTERS=(the-yard the-sea your-ship a-run the-harbour)
fi

echo "== shooting ${CHAPTERS[*]}"
node tools/capture/guides.mjs "$RAW" "${CHAPTERS[@]}"

echo "== narration and captions"
for name in "${CHAPTERS[@]}"; do
	node tools/capture/mix.mjs "$RAW/$name" "$OUT"
done

echo "done -- $OUT"
ls -la "$OUT"
