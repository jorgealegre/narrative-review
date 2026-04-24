#!/usr/bin/env -S npx tsx
/**
 * Run the analyzer against a captured fixture.
 *
 * Usage: tsx tools/replay-fixture.ts <fixture-name> [--fresh]
 *
 * - Reads diff + PR metadata from .fixtures/<name>/
 * - Calls analyzeNarrative (or reads analyzer-cache.json if present)
 * - Runs coverage verifier
 * - Writes review.json ready for render-fixture
 *
 * Caches the analyzer's raw response so iterating on rendering / coverage
 * doesn't burn Claude tokens. Pass --fresh to force a new API call.
 *
 * Env: ANTHROPIC_API_KEY required when calling fresh.
 *      MODEL (default: claude-sonnet-4-6)
 */

import * as fs from "fs";
import * as path from "path";
import { parseDiff } from "../src/lib/diff-parser";
import { analyzeNarrative } from "../src/lib/analyzer";
import {
  verifyCoverage,
  buildUncategorizedChapter,
} from "../src/lib/coverage-verifier";
import type { ModelId, NarrativeReview, PRInfo } from "../src/lib/types";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const fresh = args.includes("--fresh");

if (!name) {
  console.error("usage: tsx tools/replay-fixture.ts <fixture-name> [--fresh]");
  process.exit(1);
}

const fixtureDir = path.join(".fixtures", name);
if (!fs.existsSync(fixtureDir)) {
  console.error(`Fixture not found: ${fixtureDir}`);
  console.error(`Run: ./tools/capture-fixture.sh <owner/repo> <pr> first.`);
  process.exit(1);
}

const cachePath = path.join(fixtureDir, "analyzer-cache.json");
const prPath = path.join(fixtureDir, "pr.json");
const diffPath = path.join(fixtureDir, "diff.patch");

const pr = JSON.parse(fs.readFileSync(prPath, "utf-8"));
const rawDiff = fs.readFileSync(diffPath, "utf-8");

const prInfo: PRInfo = {
  owner: pr.base.repo.owner.login,
  repo: pr.base.repo.name,
  number: pr.number,
  title: pr.title,
  body: pr.body || "",
  author: pr.user?.login || "",
  additions: pr.additions,
  deletions: pr.deletions,
  changedFiles: pr.changed_files,
  baseRef: pr.base.ref,
  headRef: pr.head.ref,
};

console.log(`Parsing diff (${(rawDiff.length / 1024).toFixed(1)} KB)...`);
const diff = parseDiff(rawDiff);
console.log(`  ${diff.files.length} files, ${diff.totalAdditions}+ / ${diff.totalDeletions}-`);

type AnalyzerOutput = Awaited<ReturnType<typeof analyzeNarrative>>;

let analysis: AnalyzerOutput;
if (!fresh && fs.existsSync(cachePath)) {
  console.log(`Using cached analyzer response (pass --fresh to re-run).`);
  analysis = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
} else {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY to call the analyzer fresh.");
    process.exit(1);
  }
  const model = (process.env.MODEL || "claude-sonnet-4-6") as ModelId;
  console.log(`Calling Claude (${model})...`);
  analysis = await analyzeNarrative(diff, prInfo.title, prInfo.body, { model });
  fs.writeFileSync(cachePath, JSON.stringify(analysis, null, 2));
  console.log(`Cached: ${cachePath}`);
  console.log(
    `  ${analysis.metrics.inputTokens} in / ${analysis.metrics.outputTokens} out = $${analysis.metrics.cost.toFixed(4)}`
  );
}

console.log("Verifying coverage...");
const coverage = verifyCoverage(diff, analysis.chapters);
const uncategorized = buildUncategorizedChapter(coverage);
const chapters = uncategorized ? [...analysis.chapters, uncategorized] : analysis.chapters;
console.log(
  `  ${coverage.coveredHunks}/${coverage.totalHunks} hunks covered${uncategorized ? ` (${uncategorized.hunks.length} backfilled)` : ""}`
);

const review: NarrativeReview = {
  prInfo,
  title: analysis.title,
  summary: analysis.summary,
  rootCause: analysis.rootCause,
  chapters,
  coverage,
  metrics: analysis.metrics,
  analyzedAt: new Date().toISOString(),
};

const outPath = path.join(fixtureDir, "review.json");
fs.writeFileSync(outPath, JSON.stringify(review, null, 2));
console.log(`Wrote ${outPath}`);
