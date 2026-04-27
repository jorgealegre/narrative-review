#!/usr/bin/env -S npx tsx
/**
 * Render a fixture's review.json into the static bundle template and open it.
 *
 * Usage: tsx tools/render-fixture.ts <fixture-name>
 *
 * - Reads .fixtures/<name>/review.json + comments.json
 * - Loads dist-action/template.html (run `npm run build:action` first)
 * - Substitutes %%REVIEW_DATA_B64%% with base64 JSON (same pipeline as the action)
 * - Writes rendered.html alongside the fixture
 * - Opens in default browser via file:// (native app handles this; Chrome MCP
 *   needs a local server — use `./tools/serve-fixture.sh <name>` for that)
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { StaticReviewData, PRComment } from "../src/lib/types";

const name = process.argv[2];
if (!name) {
  console.error("usage: tsx tools/render-fixture.ts <fixture-name>");
  process.exit(1);
}

const fixtureDir = path.join(".fixtures", name);
const reviewPath = path.join(fixtureDir, "review.json");
if (!fs.existsSync(reviewPath)) {
  console.error(`Not found: ${reviewPath}`);
  console.error(`Run: tsx tools/replay-fixture.ts ${name} first.`);
  process.exit(1);
}

const templatePath = path.join("dist-action", "template.html");
if (!fs.existsSync(templatePath)) {
  console.error(`Not found: ${templatePath}`);
  console.error(`Run: npm run build:action first.`);
  process.exit(1);
}

const review = JSON.parse(fs.readFileSync(reviewPath, "utf-8"));
const commentsRaw = fs.existsSync(path.join(fixtureDir, "comments.json"))
  ? JSON.parse(fs.readFileSync(path.join(fixtureDir, "comments.json"), "utf-8"))
  : [];

// Normalize gh api comment shape → PRComment shape
const comments: PRComment[] = commentsRaw.map((c: {
  id: number;
  user?: { login?: string } | null;
  body: string;
  path: string;
  line: number | null;
  side?: "LEFT" | "RIGHT" | null;
  created_at: string;
  html_url: string;
}) => ({
  id: c.id,
  author: c.user?.login || "",
  body: c.body,
  path: c.path,
  line: c.line,
  side: (c.side as "LEFT" | "RIGHT") || "RIGHT",
  createdAt: c.created_at,
  htmlUrl: c.html_url,
}));

const staticData: StaticReviewData = { review, comments, fileContents: {} };

const template = fs.readFileSync(templatePath, "utf-8");
const jsonB64 = Buffer.from(JSON.stringify(staticData)).toString("base64");
const html = template.replace("%%REVIEW_DATA_B64%%", jsonB64);

const outPath = path.join(fixtureDir, "rendered.html");
fs.writeFileSync(outPath, html);
console.log(`Wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);

// Open via native `open` (macOS). Falls back to printing the path.
try {
  execSync(`open "${path.resolve(outPath)}"`, { stdio: "ignore" });
  console.log(`Opened in default browser.`);
} catch {
  console.log(`Open manually: file://${path.resolve(outPath)}`);
}
