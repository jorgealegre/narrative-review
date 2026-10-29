#!/bin/zsh
# Runs the on-device brain on every eval PR, serially (one model session at a time).
cd "$(dirname "$0")"
for d in */; do
  d=${d%/}
  [ -f "$d/diff.patch" ] || continue
  echo "== $d"
  ../tools/nr-tell/nr-tell apple "$d/diff.patch" "$d/pr.json" "$d/apple.json" 2> "$d/apple.log" | tee -a apple-runs.log
done
