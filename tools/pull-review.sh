#!/usr/bin/env bash
# Download a deployed narrative review's HTML from a repo's gh-pages branch
# and open it locally. Useful for reproducing rendering bugs reported against
# reviews you can't reach via the Pages URL (e.g. private-repo reviews behind
# Enterprise Pages access control).
#
# Usage: ./tools/pull-review.sh <owner/repo> <pr-number>
#
# Requires `gh auth` with read access to the repo's gh-pages branch.

set -euo pipefail

REPO="${1:?usage: $0 <owner/repo> <pr-number>}"
PR="${2:?usage: $0 <owner/repo> <pr-number>}"
OUT_DIR="/tmp/narrative-reviews"
OUT_FILE="${OUT_DIR}/${REPO//\//_}-${PR}.html"

mkdir -p "$OUT_DIR"

echo "Fetching blob sha for ${REPO} reviews/${PR}/index.html …"
# The reviews/ path may contain a random-slug suffix for releases >= v1.1.0.
# Walk the dir and pick the entry that starts with `${PR}-` or matches `${PR}` exactly.
REVIEW_PATH=$(
  gh api "repos/${REPO}/contents/reviews?ref=gh-pages" \
    | jq -r --arg pr "$PR" '
        [.[] | select(.type == "dir")
             | select(.name == $pr or (.name | startswith($pr + "-")))]
        | (first | .name) // empty
      '
)
if [[ -z "$REVIEW_PATH" ]]; then
  echo "error: no review directory found for PR ${PR} in ${REPO}@gh-pages" >&2
  exit 1
fi

SHA=$(gh api "repos/${REPO}/contents/reviews/${REVIEW_PATH}/index.html?ref=gh-pages" --jq .sha)
echo "Downloading blob ${SHA:0:12} (reviews/${REVIEW_PATH}/) …"
gh api "repos/${REPO}/git/blobs/${SHA}" --jq .content | base64 -d > "$OUT_FILE"

echo "Saved: $OUT_FILE ($(wc -c < "$OUT_FILE" | tr -d ' ') bytes)"

PORT="${PORT:-8765}"
if ! lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  (cd "$OUT_DIR" && python3 -m http.server "$PORT" >/dev/null 2>&1 &)
  sleep 1
fi

URL="http://localhost:${PORT}/$(basename "$OUT_FILE")"
echo "Serving at: $URL"
open "$URL" 2>/dev/null || true
