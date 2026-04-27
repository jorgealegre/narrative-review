#!/usr/bin/env bash
# Serve a rendered fixture over http://localhost:8765 for Chrome MCP / headless tools.
#
# Usage: ./tools/serve-fixture.sh <fixture-name>

set -euo pipefail
NAME="${1:?usage: $0 <fixture-name>}"
FILE=".fixtures/${NAME}/rendered.html"

if [[ ! -f "$FILE" ]]; then
  echo "Not found: $FILE" >&2
  echo "Run: ./tools/iterate.sh ${NAME} first." >&2
  exit 1
fi

PORT="${PORT:-8765}"
SERVE_DIR="$(dirname "$FILE")"

if ! lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  (cd "$SERVE_DIR" && python3 -m http.server "$PORT" >/dev/null 2>&1 &)
  sleep 1
fi

URL="http://localhost:${PORT}/rendered.html"
echo "$URL"
open "$URL" 2>/dev/null || true
