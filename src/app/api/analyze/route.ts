import { NextResponse } from "next/server";
import { parsePRUrl, fetchPRMetadata, fetchPRDiff } from "@/lib/github";
import { parseDiff } from "@/lib/diff-parser";
import { analyzeNarrative } from "@/lib/analyzer";
import {
  verifyCoverage,
  buildUncategorizedChapter,
} from "@/lib/coverage-verifier";
import { NarrativeReview } from "@/lib/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { url, model } = await request.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Missing PR URL" }, { status: 400 });
    }

    const { owner, repo, number } = parsePRUrl(url);

    // Fetch PR data and diff in parallel
    const [prInfo, rawDiff] = await Promise.all([
      Promise.resolve(fetchPRMetadata(owner, repo, number)),
      Promise.resolve(fetchPRDiff(owner, repo, number)),
    ]);

    const diff = parseDiff(rawDiff);

    // Send to Claude for narrative analysis
    const analysis = await analyzeNarrative(diff, prInfo.title, prInfo.body, { model });

    // Verify coverage deterministically
    const coverage = verifyCoverage(diff, analysis.chapters);

    // Append uncategorized chapter if needed
    const chapters = [...analysis.chapters];
    const uncategorized = buildUncategorizedChapter(coverage);
    if (uncategorized) {
      chapters.push(uncategorized);
    }

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

    return NextResponse.json(review);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Analysis failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
