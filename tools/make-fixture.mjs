#!/usr/bin/env node
// Inject synthetic StaticReviewData into dist-static/index.html → dist-static/fixture.html
// Used for local screenshot verification of the static bundle without running the Action.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const fixture = {
  review: {
    prInfo: {
      owner: "acme",
      repo: "demo",
      number: 42,
      title: "Remove legacy auth middleware",
      body: "Replaces the in-memory session store with signed JWTs; drops the old middleware.",
      author: "jorge",
      additions: 18,
      deletions: 12,
      changedFiles: 2,
      baseRef: "main",
      headRef: "jorge/drop-legacy-auth",
    },
    title: "Remove legacy auth middleware",
    summary:
      "Cuts the in-memory session path. Switches the request pipeline to the JWT verifier and deletes the no-longer-referenced middleware module.",
    rootCause:
      "The legacy session middleware is replaced by JWT verification, making the old module dead code.",
    chapters: [
      {
        id: "ch-1",
        title: "Wire JWT verifier into the request pipeline",
        narrative:
          "The API router now calls `verifyJwt` before every handler. This is the root cause change — every downstream cleanup flows from here.",
        hunks: [
          {
            file: "src/api/router.ts",
            hunkIndex: 0,
            diffContent:
              "@@ -5,7 +5,7 @@\n import { handler } from \"./handler\";\n-import { sessionMiddleware } from \"./legacy-auth\";\n+import { verifyJwt } from \"./jwt\";\n \n export const router = createRouter();\n-router.use(sessionMiddleware);\n+router.use(verifyJwt);\n",
            annotation: "Swap middleware registration.",
          },
        ],
      },
      {
        id: "ch-2",
        title: "Delete the now-unreferenced legacy middleware",
        narrative:
          "With the router no longer calling `sessionMiddleware`, the entire file is dead code. Safe to delete.",
        connectionToPrevious:
          "Chapter 1 removed the only import of this module.",
        safetyNotes: [
          "Verified no other imports via grep before deletion.",
        ],
        hunks: [
          {
            file: "src/api/legacy-auth.ts",
            hunkIndex: 0,
            diffContent:
              "@@ -1,10 +0,0 @@\n-import { store } from \"./session-store\";\n-\n-export function sessionMiddleware(req, res, next) {\n-  const sid = req.cookies.sid;\n-  const user = store.get(sid);\n-  if (!user) return res.status(401).end();\n-  req.user = user;\n-  next();\n-}\n",
            annotation: "Whole-file deletion.",
          },
        ],
      },
    ],
    coverage: {
      totalFiles: 2,
      coveredFiles: 2,
      totalHunks: 2,
      coveredHunks: 2,
      uncoveredHunks: [],
      isComplete: true,
    },
    metrics: {
      model: "claude-sonnet-4-6",
      inputTokens: 1234,
      outputTokens: 567,
      cost: 0.012,
      durationMs: 3400,
    },
    analyzedAt: new Date().toISOString(),
  },
  comments: [],
};

const templatePath = resolve(repoRoot, "dist-static/index.html");
const outPath = resolve(repoRoot, "dist-static/fixture.html");

const html = readFileSync(templatePath, "utf8");
const b64 = Buffer.from(JSON.stringify(fixture), "utf8").toString("base64");

if (!html.includes("%%REVIEW_DATA_B64%%")) {
  console.error(
    "Template marker %%REVIEW_DATA_B64%% not found in dist-static/index.html"
  );
  process.exit(1);
}

const injected = html.replace("%%REVIEW_DATA_B64%%", b64);
writeFileSync(outPath, injected);
console.log(`wrote ${outPath} (${b64.length} bytes of review data)`);
