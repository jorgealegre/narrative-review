#!/usr/bin/env bash
# Render a fixture's deployed-review.json through the CURRENT template,
# producing rendered.html. Use this to compare "rendering changes since
# this PR was reviewed" without re-calling the model.
#
# Usage: ./tools/render-from-deployed.sh <fixture-name>

set -euo pipefail
NAME="${1:?usage: $0 <fixture-name>}"
DIR=".fixtures/${NAME}"

if [[ ! -f "$DIR/deployed-review.json" ]]; then
  echo "Not found: $DIR/deployed-review.json" >&2
  echo "Run: npx tsx tools/extract-review.ts ${NAME} first." >&2
  exit 1
fi

if [[ ! -f dist-action/template.html ]]; then
  echo "Not found: dist-action/template.html — run npm run build:action first." >&2
  exit 1
fi

node -e '
const fs = require("fs");
const dir = process.argv[1];
const wrap = JSON.parse(fs.readFileSync(dir + "/deployed-review.json", "utf-8"));
const tmpl = fs.readFileSync("dist-action/template.html", "utf-8");
const b64 = Buffer.from(JSON.stringify(wrap)).toString("base64");
const out = dir + "/rendered.html";
fs.writeFileSync(out, tmpl.replace("%%REVIEW_DATA_B64%%", b64));
console.log("Wrote " + out + " (" + (fs.statSync(out).size/1024).toFixed(0) + " KB)");
' "$DIR"
