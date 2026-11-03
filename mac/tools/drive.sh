#!/bin/zsh
# Record a scripted session of the Debug build. usage: drive.sh <script.json> <out-dir>
# Script steps: {"wait":s} {"key":"space|left|right|up|down|escape|return|x","mods":["cmd","shift","option"]}
#               {"click":[x,y]} {"open":"owner/repo#n"} {"home":true} {"back":true} {"shot":"name"}
# Output: drive.mp4, drive-NNN.png every 1.5 s, named shots, drive.done.
set -e
out="$2"; mkdir -p "$out"; rm -f "$out/drive.done"
python3 -I -c "
import json,sys; steps=json.load(open(sys.argv[1])); steps.insert(0,{'out':sys.argv[2],'wait':0.5}); json.dump(steps,open(sys.argv[3],'w'))" "$1" "$out" ~/Library/Application\ Support/NarrativeReview/drive.json
until [ -f "$out/drive.done" ]; do sleep 2; done
ls "$out" | head -40
