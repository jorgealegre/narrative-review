#!/usr/bin/env bash
# Replay + render a fixture in one shot.
#
# Usage: ./tools/iterate.sh <fixture-name> [--fresh]
#
# After editing src/lib/analyzer.ts, components, etc:
#   ./tools/iterate.sh sp0n-7-Citizen-iOS-12556           # cached analyzer
#   ./tools/iterate.sh sp0n-7-Citizen-iOS-12556 --fresh   # force API call

set -euo pipefail
NAME="${1:?usage: $0 <fixture-name> [--fresh]}"
shift

# Rebuild the static bundle if it changed (dist-action/template.html is produced
# from dist-static/index.html during build:action).
if [[ ! -f dist-action/template.html ]] || [[ src/components -nt dist-action/template.html ]]; then
  echo "Rebuilding static bundle..."
  npm run build:static >/dev/null
  cp dist-static/index.html dist-action/template.html
fi

npx tsx tools/replay-fixture.ts "$NAME" "$@"
npx tsx tools/render-fixture.ts "$NAME"
