#!/usr/bin/env -S npx tsx
/**
 * Extract review.json from a deployed.html fixture.
 *
 * The deployed bundle contains a <script> block with the base64 JSON embedded
 * inline. This pulls it out so we can inspect analyzer output without re-running.
 *
 * Usage: tsx tools/extract-review.ts <fixture-name>
 */

import * as fs from "fs";
import * as path from "path";

const name = process.argv[2];
if (!name) {
  console.error("usage: tsx tools/extract-review.ts <fixture-name>");
  process.exit(1);
}

const fixtureDir = path.join(".fixtures", name);
const deployedPath = path.join(fixtureDir, "deployed.html");
const html = fs.readFileSync(deployedPath, "utf-8");

// Look for `window.__REVIEW_DATA_B64__ = "..."` or similar embedding.
// Fall back to searching for a long base64 blob adjacent to a marker.
const patterns = [
  /<script\s+id="review-data"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/,
  /window\.__REVIEW_DATA__\s*=\s*JSON\.parse\(atob\("([A-Za-z0-9+/=]+)"\)\)/,
];

let b64: string | null = null;
for (const pat of patterns) {
  const m = html.match(pat);
  if (m) {
    b64 = m[1].trim();
    console.error(`matched pattern: ${pat.source.slice(0, 60)}…`);
    break;
  }
}

if (!b64) {
  console.error("No review data marker found. Dumping potential script blocks:");
  const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/g) || [];
  for (const s of scripts.slice(0, 5)) {
    console.error("---");
    console.error(s.slice(0, 200));
  }
  process.exit(1);
}

const json = Buffer.from(b64, "base64").toString("utf-8");
const data = JSON.parse(json);
const outPath = path.join(fixtureDir, "deployed-review.json");
fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
console.log(outPath);
