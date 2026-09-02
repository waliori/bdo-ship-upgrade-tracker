#!/usr/bin/env bash
# webm -> mp4, for the walkthrough films.
#
# The screencast's webm is enormous -- tens of megabytes for a few
# minutes -- because it is written for capture, not for playing back over
# a README. h264 at a high CRF gets it to a couple of megabytes without
# hurting a UI recording, where most of every frame is flat colour.
set -euo pipefail
IN="$1"; OUT="$2"; CRF="${3:-30}"
ffmpeg -v error -y -i "$IN" \
  -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p \
  -profile:v high -level 4.0 -movflags +faststart -an "$OUT"
ls -la "$OUT"
