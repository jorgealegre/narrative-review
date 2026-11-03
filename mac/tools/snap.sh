#!/bin/zsh
# Debug-build window snapshot through the app's own hook. usage: snap.sh out.png [pr-id] [tell|tell:claude:<model>] [timeout-s]
out="$1"; rm -f "$out" "$out.txt"
printf '%s\n%s\n%s\n' "$out" "${2:-}" "${3:-}" > ~/Library/Application\ Support/NarrativeReview/snapshot.request
n=$(( ${4:-12} * 2 ))
for i in $(seq 1 $n); do sleep 0.5; [ -s "$out" ] && { echo "snapshot $out"; cat "$out.txt" 2>/dev/null; exit 0; }; done
echo "no snapshot"; exit 1
