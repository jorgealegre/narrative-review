#!/usr/bin/env bash
# Capture a real PR + its deployed review into .fixtures/ for local testing.
#
# Usage: ./tools/capture-fixture.sh <owner/repo> <pr-number>
#
# Captures:
#   .fixtures/<owner>-<repo>-<pr>/pr.json        # PR metadata (title, body, head sha, etc.)
#   .fixtures/<owner>-<repo>-<pr>/diff.patch     # raw diff
#   .fixtures/<owner>-<repo>-<pr>/comments.json  # existing PR review comments
#   .fixtures/<owner>-<repo>-<pr>/deployed.html  # deployed review HTML (if available)

set -euo pipefail

REPO="${1:?usage: $0 <owner/repo> <pr-number>}"
PR="${2:?usage: $0 <owner/repo> <pr-number>}"
NAME="${REPO//\//-}-${PR}"
DIR=".fixtures/${NAME}"

mkdir -p "$DIR"
echo "Capturing ${REPO} PR #${PR} → $DIR"

# 1. PR metadata
echo "  ↳ pr.json"
gh api "repos/${REPO}/pulls/${PR}" > "$DIR/pr.json"

# 2. Diff (raw unified diff, not JSON)
echo "  ↳ diff.patch"
gh api "repos/${REPO}/pulls/${PR}" -H "Accept: application/vnd.github.v3.diff" > "$DIR/diff.patch"

# 3. Existing review comments
echo "  ↳ comments.json"
gh api --paginate "repos/${REPO}/pulls/${PR}/comments" > "$DIR/comments.json"

# 4. Deployed review HTML (optional — may not exist for new PRs)
REVIEW_PATH=$(
  gh api "repos/${REPO}/contents/reviews?ref=gh-pages" 2>/dev/null \
    | jq -r --arg pr "$PR" '
        [.[] | select(.type == "dir")
             | select(.name == $pr or (.name | startswith($pr + "-")))]
        | (first | .name) // empty
      ' 2>/dev/null || true
)
if [[ -n "$REVIEW_PATH" ]]; then
  echo "  ↳ deployed.html (reviews/${REVIEW_PATH}/)"
  SHA=$(gh api "repos/${REPO}/contents/reviews/${REVIEW_PATH}/index.html?ref=gh-pages" --jq .sha)
  gh api "repos/${REPO}/git/blobs/${SHA}" --jq .content | base64 -d > "$DIR/deployed.html"
else
  echo "  ↳ deployed.html (skipped — no deployed review found)"
fi

echo "Captured. Fixture name: ${NAME}"
echo "Next: ./tools/iterate.sh ${NAME}"
