#!/usr/bin/env bash
# webm -> gif, tuned for a dark UI: a generous palette keeps the ocean
# gradient from banding, bayer dithering keeps the file small.
set -euo pipefail
IN="$1"; OUT="$2"; W="${3:-960}"; FPS="${4:-14}"
PAL="$(mktemp --suffix=.png)"
ffmpeg -v error -y -i "$IN" -vf "fps=$FPS,scale=$W:-2:flags=lanczos,palettegen=max_colors=192:stats_mode=diff" "$PAL"
ffmpeg -v error -y -i "$IN" -i "$PAL" \
  -lavfi "fps=$FPS,scale=$W:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$OUT"
rm -f "$PAL"
ls -la "$OUT"
