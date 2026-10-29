#!/bin/zsh
# Builds the nr-tell CLI from the app's own source files.
set -e
cd "$(dirname "$0")"
SRC=../../NarrativeReview/NarrativeReview
swiftc -O -o nr-tell "$SRC/Model/Models.swift" "$SRC/Services/DiffParser.swift" "$SRC/Services/Storyteller.swift" "$SRC/Services/FoundationStoryteller.swift" main.swift 2>&1 | grep -v "warning:" || true
ls -la nr-tell
